param(
    [string]$InputPath = (Join-Path $PSScriptRoot '..\out\school-case-opencut-final.mp4'),
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\out\school-case-shorts-final-320-v2.mp4')
)

$ErrorActionPreference = 'Stop'

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$fontPath = 'C\:/Windows/Fonts/malgun.ttf'
$titleFilePath = (Join-Path $PSScriptRoot 'title-ko.txt').Replace('\', '/').Replace(':', '\:')

# Pixel inspection at 0.1, 65, and 125 seconds found the original OpenCut title
# band through y=623, with real footage beginning at y=624..625. Cropping from
# y=625 removes the compressed boundary row. The remaining 1080x1295 footage is
# scaled proportionally to 1600px high, then center-cropped to 1080px wide.
# Padding places that footage directly below an exact 320px title band.
$videoFilter = @(
    'crop=1080:1295:0:625'
    'scale=-2:1600:flags=lanczos'
    'crop=1080:1600:(iw-1080)/2:0'
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
    throw "FFmpeg postprocess failed with exit code $LASTEXITCODE"
}

Get-Item -LiteralPath $resolvedOutput
