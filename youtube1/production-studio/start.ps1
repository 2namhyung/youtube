param(
    [switch]$Foreground,
    [switch]$SkipNative,
    [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$studioDirectory = $PSScriptRoot
$workspaceDirectory = Split-Path -Parent $studioDirectory
$pythonExecutable = Join-Path $workspaceDirectory 'shopping-shorts\.venv\Scripts\python.exe'
$studioLogs = Join-Path $studioDirectory 'data\logs'
if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw 'Run shopping-shorts/setup.ps1 to install the local Python runtime first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $studioDirectory 'web\dist\index.html'))) {
    throw 'Build the studio first: npm --prefix production-studio/web install; npm --prefix production-studio/web run build'
}
New-Item -ItemType Directory -Path $studioLogs -Force | Out-Null
foreach ($studioVariable in @('YOUTUBE_API_KEY', 'YOUTUBE_API_KEY_2', 'WISE_URL', 'STUDIO_ALLOWED_ORIGINS')) {
    if (-not [Environment]::GetEnvironmentVariable($studioVariable, 'Process')) {
        $storedValue = [Environment]::GetEnvironmentVariable($studioVariable, 'User')
        if ($storedValue) { [Environment]::SetEnvironmentVariable($studioVariable, $storedValue, 'Process') }
    }
}
function Test-StudioEndpoint([string]$Url) {
    try {
        $null = Invoke-RestMethod -Uri $Url -TimeoutSec 3
        return $true
    } catch { return $false }
}
function Start-StudioHelper([string]$Name, [string]$File, [string[]]$Arguments, [string]$Directory) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $studioLogs "$Name-$stamp.out.log") -RedirectStandardError (Join-Path $studioLogs "$Name-$stamp.err.log")
    Write-Host "$Name started (PID $($process.Id))."
    return $process
}
if (-not $SkipNative) {
    if (-not (Test-StudioEndpoint 'http://127.0.0.1:8765/v1/capabilities')) {
        $shoppingEntry = Join-Path $workspaceDirectory 'shopping-shorts\start.ps1'
        $null = Start-StudioHelper 'shopping' 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $shoppingEntry + '"')) (Join-Path $workspaceDirectory 'shopping-shorts')
    }
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue)) {
        $env:AUTOMATION_PORT = '3002'
        $newsroomEntry = Join-Path $workspaceDirectory '06-production\opencut-automation\scripts\dev-automation.mjs'
        $null = Start-StudioHelper 'newsroom' 'node.exe' @(('"' + $newsroomEntry + '"')) (Join-Path $workspaceDirectory '06-production\opencut-automation')
    }
}
if (Test-StudioEndpoint 'http://127.0.0.1:8766/api/studio/health') {
    Write-Host 'Production Studio is already running.'
} elseif ($Foreground) {
    Set-Location -LiteralPath $studioDirectory
    & $pythonExecutable -m uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8766
    exit $LASTEXITCODE
} else {
    $null = Start-StudioHelper 'studio' $pythonExecutable @('-m', 'uvicorn', 'backend.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8766') $studioDirectory
    $studioReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (Test-StudioEndpoint 'http://127.0.0.1:8766/api/studio/health') { $studioReady = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $studioReady) { throw 'Studio did not start. Check production-studio/data/logs.' }
}
Write-Host 'Studio: https://production-studio-rnrwn1123.vercel.app'
Write-Host 'Local:  http://127.0.0.1:8766'
if (-not $NoOpen) { Start-Process 'https://production-studio-rnrwn1123.vercel.app' }
