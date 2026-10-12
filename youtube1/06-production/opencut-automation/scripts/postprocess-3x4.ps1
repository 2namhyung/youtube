param(
    [string]$InputPath = (Join-Path $PSScriptRoot '..\out\school-case-opencut-caption-3x4.mp4'),
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\out\school-case-shorts-final-3x4.mp4')
)

$ErrorActionPreference = 'Stop'

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$fontPath = 'C\:/Windows/Fonts/malgun.ttf'
$titleFilePath = (Join-Path $PSScriptRoot 'title-ko.txt').Replace('\', '/').Replace(':', '\:')

# The source OpenCut title panel ends at y=624. Use the actual footage from
# y=625..1919, preserve its aspect ratio, and fill an exact 1080x1440 3:4
# rectangle. Padding creates the existing 320px title band and a new 160px
# bottom band, both using the same opaque background.
$videoFilter = @(
    'crop=1080:1295:0:625'
    'scale=-2:1440:flags=lanczos'
    'crop=1080:1440:(iw-1080)/2:0'
    'pad=1080:1920:0:320:color=#111827'
    "drawtext=fontfile='$fontPath':textfile='$titleFilePath':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(320-text_h)/2:shadowcolor=black@0.6:shadowx=2:shadowy=2"
) -join ','

& ffmpeg -hide_banner -loglevel error -y `
    -i $resolvedInput `
    -vf $videoFilter `
    -map 0:v:0 -map '0:a:0?' `
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p `
    -c:a copy -movflags +faststart `
    $resolvedOutput

if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg 3:4 postprocess failed with exit code $LASTEXITCODE"
}

Get-Item -LiteralPath $resolvedOutput
