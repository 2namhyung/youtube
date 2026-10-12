[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$assets = Join-Path $root 'assets'
$outputDir = Join-Path $root 'output'
$light = Join-Path $assets 'character-light.png'
$dark = Join-Path $assets 'character-dark.png'
$output = Join-Path $outputDir 'blind-transition-prototype.mp4'

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    throw 'ffmpeg was not found on PATH.'
}
if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    throw 'ffprobe was not found on PATH.'
}
foreach ($path in @($light, $dark)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing input asset: $path"
    }
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# The stills are overscanned slightly, then cropped with the same tiny animated
# offset. This gives a restrained Ken Burns / cord-pull feel without asking the
# model to synthesize camera movement, and avoids a position jump at the cut.
$filter = @"
[0:v]scale=1120:1991:force_original_aspect_ratio=increase,crop=1080:1920:x='20+6*sin(n/90)':y='35+4*cos(n/105)',trim=duration=6.2,setpts=PTS-STARTPTS[light];
[1:v]scale=1120:1991:force_original_aspect_ratio=increase,crop=1080:1920:x='20+6*sin(n/90)':y='35+4*cos(n/105)',trim=duration=6.2,setpts=PTS-STARTPTS[dark];
[light][dark]blend=all_expr='if(gte(T\,2.633)\,B\,A)':shortest=1[base];
color=c=black@0:s=540x960:r=30:d=6.2,format=rgba,geq=r='18':g='20':b='30':a='if(lt(mod(Y\,27)\,15)\,if(lte(abs(Y-480)\,480*if(lt(T\,2.333)\,0\,if(lt(T\,2.633)\,(T-2.333)/0.30\,if(lt(T\,2.933)\,1-(T-2.633)/0.30\,0))))\,235\,0)\,0)',scale=1080:1920:flags=neighbor[slats];
[base][slats]overlay=shortest=1:format=auto,format=yuv420p[outv]
"@.Trim()

$ffmpegArgs = @(
    '-hide_banner', '-loglevel', 'error',
    '-y',
    '-loop', '1', '-framerate', '30', '-i', $light,
    '-loop', '1', '-framerate', '30', '-i', $dark,
    '-filter_complex', $filter,
    '-map', '[outv]',
    '-frames:v', '186',
    '-r', '30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-an',
    $output
)

& ffmpeg @ffmpegArgs
if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg render failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
    throw "ffmpeg did not create the expected output: $output"
}

Write-Host "Rendered: $output"
