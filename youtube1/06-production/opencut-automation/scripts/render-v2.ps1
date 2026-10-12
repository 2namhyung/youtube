param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\out\school-case-shorts-final-v2.mp4')
)

$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$assetsRoot = Join-Path $projectRoot 'examples\school-case-assets'
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$temporaryOutput = Join-Path (
    [IO.Path]::GetDirectoryName($resolvedOutput)
) (
    '{0}.{1}.rendering.mp4' -f [IO.Path]::GetFileNameWithoutExtension($resolvedOutput), [Guid]::NewGuid().ToString('N')
)
$assPath = Join-Path $projectRoot 'out\school-case-shorts-final-v2.ass'
$srtPath = Join-Path $assetsRoot 'preview_subtitles_caption_v2.srt'
# Reuse the approved final's AAC stream bit-for-bit so narration processing,
# channel layout, timing, and content stay unchanged in V2.
$audioPath = Join-Path $projectRoot 'out\school-case-shorts-final-3x4.mp4'
$generatedFontPath = Join-Path $projectRoot 'out\SchoolShortsNotoSansKR-ExtraBold.ttf'
$fontPath = $generatedFontPath.Replace('\', '/').Replace(':', '\:')
$fontsDirectory = (Join-Path $projectRoot 'out').Replace('\', '/').Replace(':', '\:')
$titleLine1Path = (Join-Path $PSScriptRoot 'title-v2-line1.txt').Replace('\', '/').Replace(':', '\:')
$titleLine2Path = (Join-Path $PSScriptRoot 'title-v2-line2.txt').Replace('\', '/').Replace(':', '\:')
$assFilterPath = $assPath.Replace('\', '/').Replace(':', '\:')

& python (Join-Path $PSScriptRoot 'build-v2-font.py') 'C:\Windows\Fonts\NotoSansKR-VF.ttf' $generatedFontPath
if ($LASTEXITCODE -ne 0) {
    throw "V2 font generation failed with exit code $LASTEXITCODE"
}

& node (Join-Path $PSScriptRoot 'build-v2-ass.mjs') $srtPath $assPath
if ($LASTEXITCODE -ne 0) {
    throw "ASS generation failed with exit code $LASTEXITCODE"
}

# OpenCut switches clips on the first 30fps frame at or after each manifest
# boundary (ceil(start * 30)). These exact integer counts reproduce the
# approved reference's 3921-frame / 130.700-second video timeline without
# cumulative per-clip timestamp rounding.
$frameCounts = @(
    380,
    438,
    139,
    223,
    163,
    86,
    232,
    378,
    233,
    364,
    718,
    567
)

$inputArguments = [Collections.Generic.List[string]]::new()
$videoFilters = [Collections.Generic.List[string]]::new()
$concatInputs = [Text.StringBuilder]::new()

for ($index = 0; $index -lt $frameCounts.Count; $index++) {
    $clipPath = Join-Path $assetsRoot ('clip{0:D2}.mp4' -f ($index + 1))
    $inputArguments.Add('-i')
    $inputArguments.Add($clipPath)

    $frameCount = $frameCounts[$index]
    $videoFilters.Add(
        "[$index`:v]fps=30,crop=1080:1295:0:625," +
        "scale=-2:1440:flags=lanczos,crop=1080:1440:(iw-1080)/2:0," +
        "tpad=stop_mode=clone:stop_duration=0.2,trim=end_frame=$frameCount," +
        "setpts=PTS-STARTPTS[v$index]"
    )
    [void]$concatInputs.Append("[v$index]")
}

$inputArguments.Add('-i')
$inputArguments.Add($audioPath)

$videoFilters.Add(
    "$concatInputs" +
    "concat=n=12:v=1:a=0[footage]"
)
$videoFilters.Add(
    "[footage]" +
    "pad=1080:1920:0:320:color=#111827," +
    "drawbox=x=0:y=1100:w=1080:h=420:color=#07111F@0.22:t=fill," +
    "drawtext=fontfile='$fontPath':textfile='$titleLine1Path':" +
    "fontcolor=white:fontsize=72:x=90:y=54:" +
    "shadowcolor=#07111F@0.9:shadowx=3:shadowy=4," +
    "drawtext=fontfile='$fontPath':textfile='$titleLine2Path':" +
    "fontcolor=white:fontsize=72:x=90:y=164:" +
    "shadowcolor=#07111F@0.9:shadowx=3:shadowy=4," +
    "subtitles='$assFilterPath':fontsdir='$fontsDirectory'[vout]"
)

$filterComplex = $videoFilters -join ';'
$ffmpegArguments = [Collections.Generic.List[string]]::new()
$ffmpegArguments.AddRange([string[]]@('-hide_banner', '-loglevel', 'error', '-y'))
$ffmpegArguments.AddRange([string[]]$inputArguments)
$ffmpegArguments.AddRange([string[]]@(
    '-filter_complex', $filterComplex,
    '-map', '[vout]',
    '-map', '12:a:0',
    '-t', '130.728',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    $temporaryOutput
))

$renderStartedAt = Get-Date
& ffmpeg @ffmpegArguments
if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $temporaryOutput) {
        Remove-Item -LiteralPath $temporaryOutput -Force
    }
    throw "FFmpeg V2 render failed with exit code $LASTEXITCODE"
}

$renderProbe = & ffprobe -v error -select_streams v:0 -count_frames `
    -show_entries stream=nb_read_frames,duration -of csv=p=0 `
    $temporaryOutput
if ($LASTEXITCODE -ne 0 -or $renderProbe -notmatch '^130\.700000,3921$') {
    Remove-Item -LiteralPath $temporaryOutput -Force
    throw "V2 render frame validation failed: $renderProbe"
}

Move-Item -LiteralPath $temporaryOutput -Destination $resolvedOutput -Force

$renderDuration = (Get-Date) - $renderStartedAt
Get-Item -LiteralPath $resolvedOutput |
    Select-Object FullName, Length, @{ Name = 'RenderSeconds'; Expression = { [Math]::Round($renderDuration.TotalSeconds, 2) } }
