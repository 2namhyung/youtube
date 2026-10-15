[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DataRoot,
    [string]$ArchiveDb = '',
    [string]$ArchiveRawRoot = '',
    [ValidateRange(1024, 65535)][int]$Port = 8138,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$nextEntry = Join-Path $appRoot 'node_modules/next/dist/bin/next'
$nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
if (-not (Test-Path -LiteralPath $nextEntry -PathType Leaf)) {
    throw 'Next.js dependencies are missing. Install dependencies in the application directory first.'
}

function ExistingPath([string]$Value, [bool]$Directory) {
    $item = Get-Item -LiteralPath $Value -ErrorAction Stop
    if ($item.PSIsContainer -ne $Directory) { throw 'The configured data path has the wrong type.' }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Configure the real data path, not a link.'
    }
    return $item.FullName
}

$settings = @{ VISUALMAKER_DATA_DIR = (ExistingPath $DataRoot $true) }
if ($ArchiveDb) { $settings.ARCHIVE_DB_PATH = ExistingPath $ArchiveDb $false }
if ($ArchiveRawRoot) { $settings.ARCHIVE_RAW_ROOT = ExistingPath $ArchiveRawRoot $true }
$previous = @{}
foreach ($key in $settings.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
$previousLocation = Get-Location
try {
    foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process') }
    Set-Location -LiteralPath $appRoot
    if ($CheckOnly) {
        Write-Output 'VisualMaker launch paths and dependencies verified; no server or database was opened.'
    } else {
        & $nodeCommand.Source $nextEntry dev --hostname 127.0.0.1 --port $Port
        if ($LASTEXITCODE -ne 0) { throw "Next.js exited with code $LASTEXITCODE." }
    }
} finally {
    Set-Location -LiteralPath $previousLocation.Path
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
