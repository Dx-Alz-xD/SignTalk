<#
    Start SignTalk for development: the API and the web app, in two windows.

        powershell -ExecutionPolicy Bypass -File scripts\dev.ps1

    Options:
        -ApiPort 8000     port for the FastAPI backend
        -WebPort 3001     port for the Next.js app
        -NoWeb            API only
        -NoApi            web app only
        -Sqlite           force the SQLite fallback, skipping the Postgres probe

    Stop either window with Ctrl+C. Nothing here installs anything; run
    scripts\setup.ps1 first on a new machine.
#>

param(
    [int]$ApiPort = 8000,
    [int]$WebPort = 3001,
    [switch]$NoWeb,
    [switch]$NoApi,
    [switch]$Sqlite
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Find-Python {
    foreach ($name in @("py", "python", "python3")) {
        $found = Get-Command $name -ErrorAction SilentlyContinue
        if ($found) { return $found.Source }
    }
    Write-Error "No Python found on PATH. Install Python 3.10 or newer."
}

function Test-PortFree([int]$port) {
    -not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not $NoApi) {
    if (-not (Test-PortFree $ApiPort)) {
        Write-Warning "Port $ApiPort is already in use. The API may already be running."
    } else {
        $python = Find-Python
        $env:SIGNTALK_DB = if ($Sqlite) { "sqlite" } else { $env:SIGNTALK_DB }
        Write-Host "Starting the API on http://localhost:$ApiPort" -ForegroundColor Green
        Start-Process -FilePath "powershell" -ArgumentList @(
            "-NoExit", "-Command",
            "Set-Location '$root'; " +
            $(if ($Sqlite) { "`$env:SIGNTALK_DB='sqlite'; " } else { "" }) +
            "& '$python' -m uvicorn backend.api.main:app --reload --port $ApiPort"
        )
    }
}

if (-not $NoWeb) {
    $web = Join-Path $root "Frontend\UX"
    if (-not (Test-Path (Join-Path $web "node_modules"))) {
        Write-Warning "Frontend/UX has no node_modules. Run: cd Frontend\UX; pnpm install"
    }
    if (-not (Test-PortFree $WebPort)) {
        Write-Warning "Port $WebPort is already in use. The web app may already be running."
    } else {
        Write-Host "Starting the web app on http://localhost:$WebPort" -ForegroundColor Green
        Start-Process -FilePath "powershell" -ArgumentList @(
            "-NoExit", "-Command", "Set-Location '$web'; pnpm dev"
        )
    }
}

Write-Host ""
Write-Host "  API  http://localhost:$ApiPort/docs" -ForegroundColor Cyan
Write-Host "  App  http://localhost:$WebPort" -ForegroundColor Cyan
Write-Host "  Demo account: example@gmail.com / 123456" -ForegroundColor DarkGray
Write-Host ""
