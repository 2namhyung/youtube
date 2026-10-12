$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
}
& .venv\Scripts\python.exe -m pip install -r requirements.lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm --prefix apps/web ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed.' }
npm --prefix apps/web run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
Write-Output 'Ready. Run .\start.ps1 and open http://127.0.0.1:8765'
