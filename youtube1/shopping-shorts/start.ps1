$ErrorActionPreference = 'Stop'
$studioRoot = $PSScriptRoot
$studioPython = Join-Path $studioRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $studioPython)) {
    throw 'Run setup.ps1 before starting Luna Studio.'
}
Set-Location -LiteralPath $studioRoot
foreach ($studioVariable in @('YOUTUBE_API_KEY', 'YOUTUBE_API_KEY_2')) {
    if (-not [Environment]::GetEnvironmentVariable($studioVariable, 'Process')) {
        [Environment]::SetEnvironmentVariable($studioVariable, [Environment]::GetEnvironmentVariable($studioVariable, 'User'), 'Process')
    }
}
& $studioPython run.py
