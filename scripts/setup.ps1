<#
    One-time setup on a new machine: Python dependencies, web dependencies,
    and a database to point at.

        powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

    Options:
        -Full     also install the optional extras (speech to text, and the
                  tracking stack for server-side dataset import)
        -SkipWeb  Python only

    Then start everything with scripts\dev.ps1.
#>

param(
    [switch]$Full,
    [switch]$SkipWeb
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Find-Command([string[]]$names, [string]$hint) {
    foreach ($name in $names) {
        $found = Get-Command $name -ErrorAction SilentlyContinue
        if ($found) { return $found.Source }
    }
    Write-Error "$($names[0]) not found on PATH. $hint"
}

Write-Host "`nSignTalk setup" -ForegroundColor Cyan
Write-Host ("-" * 40)

# ------------------------------------------------------------------ Python --
$python = Find-Command @("py", "python", "python3") "Install Python 3.10 or newer from python.org."
Write-Host "`n[1/4] Python dependencies" -ForegroundColor Green
& $python -m pip install --upgrade pip --quiet
& $python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed." }

if ($Full) {
    Write-Host "`n[2/4] Optional extras (this downloads a few hundred MB)" -ForegroundColor Green
    & $python -m pip install faster-whisper mediapipe opencv-python
    if ($LASTEXITCODE -ne 0) { Write-Warning "The extras failed to install. The app runs without them." }
} else {
    Write-Host "`n[2/4] Optional extras skipped. Re-run with -Full for speech to text" -ForegroundColor DarkGray
    Write-Host "      and server-side dataset import." -ForegroundColor DarkGray
}

# --------------------------------------------------------------------- web --
if (-not $SkipWeb) {
    Write-Host "`n[3/4] Web dependencies" -ForegroundColor Green
    $node = Find-Command @("node") "Install Node 20 or newer from nodejs.org."
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Host "      enabling pnpm through corepack" -ForegroundColor DarkGray
        & corepack enable pnpm
    }
    Push-Location (Join-Path $root "Frontend\UX")
    & pnpm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Error "pnpm install failed." }
} else {
    Write-Host "`n[3/4] Web dependencies skipped" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------- database --
Write-Host "`n[4/4] Database" -ForegroundColor Green
& $python -m backend.setup_db --check
if ($LASTEXITCODE -ne 0) {
    Write-Host "      Run '$python -m backend.setup_db' to choose one." -ForegroundColor DarkGray
}

Write-Host "`nDone. Start everything with:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\dev.ps1`n"
