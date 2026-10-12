param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\out\school-case-shorts-final-v3-reference.mp4')
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
$thumbnailOutput = Join-Path (
    [IO.Path]::GetDirectoryName($resolvedOutput)
) (
    '{0}-0_5.png' -f [IO.Path]::GetFileNameWithoutExtension($resolvedOutput)
)
$temporaryThumbnail = [IO.Path]::ChangeExtension($temporaryOutput, '.png')
$assPath = Join-Path $projectRoot 'out\school-case-shorts-final-v3-reference.ass'
$srtPath = Join-Path $assetsRoot 'preview_subtitles_caption_v2.srt'
$audioPath = Join-Path $projectRoot 'out\school-case-shorts-final-3x4.mp4'
$generatedFontPath = Join-Path $projectRoot 'out\SchoolShortsV3NotoSansKR-Black.ttf'
$fontPath = $generatedFontPath.Replace('\', '/').Replace(':', '\:')
$fontsDirectory = (Join-Path $projectRoot 'out').Replace('\', '/').Replace(':', '\:')
$titleLine1Path = (Join-Path $PSScriptRoot 'title-v3-line1.txt').Replace('\', '/').Replace(':', '\:')
$titleLine2Path = (Join-Path $PSScriptRoot 'title-v3-line2.txt').Replace('\', '/').Replace(':', '\:')
$assFilterPath = $assPath.Replace('\', '/').Replace(':', '\:')

& python (Join-Path $PSScriptRoot 'build-v3-font.py') 'C:\Windows\Fonts\NotoSansKR-VF.ttf' $generatedFontPath
if ($LASTEXITCODE -ne 0) {
    throw "V3 font generation failed with exit code $LASTEXITCODE"
}

& node (Join-Path $PSScriptRoot 'build-v3-ass.mjs') $srtPath $assPath
if ($LASTEXITCODE -ne 0) {
    throw "V3 ASS generation failed with exit code $LASTEXITCODE"
}

# OpenCut switches clips on ceil(start * 30). These integer frame counts
# preserve the approved 3921-frame timeline without cumulative rounding drift.
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
        "[$index`:v]fps=30,crop=1080:972:0:474," +
        "tpad=stop_mode=clone:stop_duration=0.2,trim=end_frame=$frameCount," +
        "setpts=PTS-STARTPTS[v$index]"
    )
    [void]$concatInputs.Append("[v$index]")
}

$inputArguments.Add('-i')
$inputArguments.Add($audioPath)
$videoFilters.Add("$concatInputs" + "concat=n=12:v=1:a=0[footage]")
$videoFilters.Add(
    "[footage]" +
    "pad=1080:1920:0:474:color=black," +
    "drawtext=fontfile='$fontPath':textfile='$titleLine1Path':" +
    "fontcolor=#27D3E8:fontsize=120:x=(w-text_w)/2:y=201," +
    "drawtext=fontfile='$fontPath':textfile='$titleLine2Path':" +
    "fontcolor=white:fontsize=143:x=(w-text_w)/2:y=326," +
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
    throw "FFmpeg V3 render failed with exit code $LASTEXITCODE"
}

$renderProbe = & ffprobe -v error -select_streams v:0 -count_frames `
    -show_entries stream=nb_read_frames,duration -of csv=p=0 `
    $temporaryOutput
if ($LASTEXITCODE -ne 0 -or $renderProbe -notmatch '^130\.700000,3921$') {
    Remove-Item -LiteralPath $temporaryOutput -Force
    throw "V3 render frame validation failed: $renderProbe"
}

& ffmpeg -hide_banner -loglevel error -y -ss 0.5 -i $temporaryOutput -frames:v 1 $temporaryThumbnail
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $temporaryOutput -Force
    if (Test-Path -LiteralPath $temporaryThumbnail) {
        Remove-Item -LiteralPath $temporaryThumbnail -Force
    }
    throw "V3 thumbnail render failed with exit code $LASTEXITCODE"
}

Move-Item -LiteralPath $temporaryOutput -Destination $resolvedOutput -Force
Move-Item -LiteralPath $temporaryThumbnail -Destination $thumbnailOutput -Force

$renderDuration = (Get-Date) - $renderStartedAt
Get-Item -LiteralPath $resolvedOutput |
    Select-Object FullName, Length, @{ Name = 'RenderSeconds'; Expression = { [Math]::Round($renderDuration.TotalSeconds, 2) } }
