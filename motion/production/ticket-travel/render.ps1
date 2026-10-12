param(
    [string]$OutputDir = (Join-Path $PSScriptRoot 'output')
)

$ErrorActionPreference = 'Stop'
$python = (Get-Command python -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot 'render_ticket.py'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$env:TICKET_RENDER_OUTPUT = $OutputDir
& $python $script
if ($LASTEXITCODE -ne 0) { throw "Python renderer failed with exit code $LASTEXITCODE" }

$final = Join-Path $OutputDir 'ticket-travel-animatic.mp4'
$probe = & $ffprobe -v error -select_streams v:0 -count_frames `
    -show_entries stream=width,height,r_frame_rate,nb_read_frames,pix_fmt,duration `
    -of default=noprint_wrappers=1 $final
if ($LASTEXITCODE -ne 0) { throw "ffprobe failed with exit code $LASTEXITCODE" }
Write-Output $probe
Write-Output "Rendered $final"
