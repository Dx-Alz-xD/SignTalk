<#
    Creates the `signtalk` database and applies db/schema.sql to it.

        powershell -ExecutionPolicy Bypass -File db\apply.ps1

    Prompts for the postgres password rather than taking it as an argument, so
    it never lands in your shell history. It is passed to psql via PGPASSWORD
    for the lifetime of this process only.

    Safe to re-run - the database is only created if missing, and every object
    in schema.sql is IF NOT EXISTS.
#>

param(
    [string]$PsqlUser = "postgres",
    [string]$Database = "signtalk",
    [string]$DbHost   = "localhost",
    [int]$Port        = 5432
)

$ErrorActionPreference = "Stop"

# Postgres does not put psql on PATH on Windows; find the newest install.
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
                  Sort-Object { [int]($_.Directory.Parent.Name) } -Descending
    if ($candidates) { $psql = $candidates[0].FullName }
}
if (-not $psql) {
    Write-Error "psql.exe not found. Install PostgreSQL or add its bin\ to PATH."
}
Write-Host "Using $psql"

$schema = Join-Path $PSScriptRoot "schema.sql"
if (-not (Test-Path $schema)) { Write-Error "Missing $schema" }

$secure = Read-Host "Password for postgres user '$PsqlUser'" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

try {
    # 1. Create the database. CREATE DATABASE cannot run inside a transaction,
    #    so it goes on its own connection to the maintenance db.
    $exists = & $psql -U $PsqlUser -h $DbHost -p $Port -d postgres -tAc `
              "SELECT 1 FROM pg_database WHERE datname = '$Database'"
    if ($LASTEXITCODE -ne 0) { Write-Error "Could not connect - wrong password, or server not running." }

    if ($exists -eq "1") {
        Write-Host "Database '$Database' already exists."
    } else {
        & $psql -U $PsqlUser -h $DbHost -p $Port -d postgres -c "CREATE DATABASE $Database" | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Error "CREATE DATABASE failed." }
        Write-Host "Created database '$Database'."
    }

    # 2. Apply the schema. ON_ERROR_STOP makes psql exit non-zero on the first
    #    failure instead of ploughing on and half-applying it.
    & $psql -U $PsqlUser -h $DbHost -p $Port -d $Database `
            -v ON_ERROR_STOP=1 -q -f $schema
    if ($LASTEXITCODE -ne 0) { Write-Error "Schema failed to apply." }

    Write-Host "`nSchema applied. Tables:`n"
    & $psql -U $PsqlUser -h $DbHost -p $Port -d $Database -c `
        "SELECT t.table_name, (SELECT count(*) FROM information_schema.columns c
          WHERE c.table_name = t.table_name AND c.table_schema='public') AS columns
         FROM information_schema.tables t
         WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
         ORDER BY t.table_name"
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
