$ErrorActionPreference = 'Stop'

$automationRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Join-Path $automationRoot 'production/projects/jeju-school-intrusion-short-v1'
$sourceRoot = Join-Path $projectRoot 'assets/video/v10-observational-safe'
$targetRoot = Join-Path $projectRoot 'assets/video/v10-observational-hq'
$runRoot = Join-Path $automationRoot 'out/.runs/realesrgan_v10_observational'
$logPath = Join-Path $runRoot 'upscale.log'
$realesrgan = 'C:\Users\User\tools\realesrgan-ncnn-vulkan-20211212-windows\realesrgan-ncnn-vulkan.exe'
$expectedFrames = 49
$expectedNames = @(
    'scene-01-classroom-window.mp4',
    'scene-02-school-exterior.mp4',
    'scene-03-tumbler-rim-macro.mp4',
    'scene-04-cctv-monitor-detail.mp4',
    'scene-05-locked-door.mp4'
)

foreach ($name in $expectedNames) {
    $sourcePath = Join-Path $sourceRoot $name
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Missing source video: $sourcePath"
    }
    $targetPath = Join-Path $targetRoot $name
    if (Test-Path -LiteralPath $targetPath) {
        throw "Refusing to overwrite existing target: $targetPath"
    }
}

New-Item -ItemType Directory -Force -Path $targetRoot, $runRoot | Out-Null
"started $(Get-Date -Format o)" | Set-Content -LiteralPath $logPath -Encoding utf8

foreach ($name in $expectedNames) {
    $video = Get-Item -LiteralPath (Join-Path $sourceRoot $name)
    $sourceProbe = & ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 -- $video.FullName
    if ($LASTEXITCODE -ne 0 -or [int]$sourceProbe -ne $expectedFrames) {
        throw "Source frame count assertion failed for $($video.Name): $sourceProbe"
    }
    $stem = [IO.Path]::GetFileNameWithoutExtension($video.Name)
    $safeStem = $stem.Replace('-', '_')
    $framesRoot = Join-Path $runRoot "frames_$safeStem"
    $upscaledRoot = Join-Path $runRoot "up2x_$safeStem"
    New-Item -ItemType Directory -Force -Path $framesRoot, $upscaledRoot | Out-Null

    $sourceFrames = @(Get-ChildItem -LiteralPath $framesRoot -Filter '*.png')
    if ($sourceFrames.Count -eq 0) {
        & ffmpeg -hide_banner -loglevel error -i $video.FullName -vsync 0 -frames:v $expectedFrames (Join-Path $framesRoot 'frame_%03d.png')
        if ($LASTEXITCODE -ne 0) { throw "Frame extraction failed: $($video.Name)" }
    } elseif ($sourceFrames.Count -ne $expectedFrames) {
        throw "Frame cache count is not $expectedFrames for $($video.Name): $($sourceFrames.Count)"
    }
    $sourceFrames = @(Get-ChildItem -LiteralPath $framesRoot -Filter '*.png')
    if ($sourceFrames.Count -ne $expectedFrames) { throw "Source frame count assertion failed for $($video.Name): $($sourceFrames.Count)" }

    $upscaledFrames = @(Get-ChildItem -LiteralPath $upscaledRoot -Filter '*.png')
    if ($upscaledFrames.Count -eq 0) {
        & $realesrgan -i $framesRoot -o $upscaledRoot -n realesrgan-x4plus -s 2 -g 0 -j 1:1:1 -f png
        if ($LASTEXITCODE -ne 0) { throw "Real-ESRGAN upscaling failed: $($video.Name)" }
    } elseif ($upscaledFrames.Count -ne $expectedFrames) {
        throw "Upscaled frame cache count is not $expectedFrames for $($video.Name): $($upscaledFrames.Count)"
    }
    $upscaledFrames = @(Get-ChildItem -LiteralPath $upscaledRoot -Filter '*.png')
    if ($upscaledFrames.Count -ne $expectedFrames) { throw "Upscaled frame count assertion failed for $($video.Name): $($upscaledFrames.Count)" }

    $outputPath = Join-Path $targetRoot $video.Name
    if (Test-Path -LiteralPath $outputPath) { throw "Refusing to overwrite existing target: $outputPath" }
    & ffmpeg -hide_banner -loglevel error -framerate 24 -i (Join-Path $upscaledRoot 'frame_%03d.png') -frames:v $expectedFrames -vf 'scale=960:1664:flags=lanczos' -r 24 -an -c:v libx264 -preset medium -crf 14 -pix_fmt yuv420p -movflags +faststart $outputPath
    if ($LASTEXITCODE -ne 0) { throw "Encoding failed: $($video.Name)" }

    $probe = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -of csv=p=0 -- $outputPath
    if ($LASTEXITCODE -ne 0) { throw "ffprobe failed: $($video.Name)" }
    "completed $($video.Name) $probe" | Add-Content -LiteralPath $logPath -Encoding utf8
}

"finished $(Get-Date -Format o)" | Add-Content -LiteralPath $logPath -Encoding utf8
