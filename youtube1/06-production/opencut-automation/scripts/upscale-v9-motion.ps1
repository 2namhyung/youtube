$ErrorActionPreference = 'Stop'

$automationRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Join-Path $automationRoot 'production/projects/jeju-school-intrusion-short-v1'
$sourceRoot = Join-Path $projectRoot 'assets/video/v8-source-grounded-hybrid'
$targetRoot = Join-Path $projectRoot 'assets/video/v9-source-grounded-hybrid-hq'
$runRoot = Join-Path $automationRoot 'out/.runs/realesrgan_v9b'
$logPath = Join-Path $runRoot 'upscale.log'
$realesrgan = 'C:\Users\User\tools\realesrgan-ncnn-vulkan-20211212-windows\realesrgan-ncnn-vulkan.exe'

New-Item -ItemType Directory -Force -Path $targetRoot, $runRoot | Out-Null
"started $(Get-Date -Format o)" | Set-Content -LiteralPath $logPath -Encoding utf8

foreach ($video in Get-ChildItem -LiteralPath $sourceRoot -Filter '*.mp4' | Sort-Object Name) {
    $stem = [IO.Path]::GetFileNameWithoutExtension($video.Name)
    $safeStem = $stem.Replace('-', '_')
    $framesRoot = Join-Path $runRoot "frames_$safeStem"
    $upscaledRoot = Join-Path $runRoot "up2x_$safeStem"
    New-Item -ItemType Directory -Force -Path $framesRoot, $upscaledRoot | Out-Null

    if ((Get-ChildItem -LiteralPath $framesRoot -Filter '*.png').Count -ne 25) {
        & ffmpeg -hide_banner -loglevel error -y -i $video.FullName -vsync 0 (Join-Path $framesRoot 'frame_%03d.png')
        if ($LASTEXITCODE -ne 0) { throw "Frame extraction failed: $($video.Name)" }
    }

    if ((Get-ChildItem -LiteralPath $upscaledRoot -Filter '*.png').Count -ne 25) {
        & $realesrgan -i $framesRoot -o $upscaledRoot -n realesrgan-x4plus -s 2 -g 0 -j 1:1:1 -f png
        if ($LASTEXITCODE -ne 0) { throw "Upscaling failed: $($video.Name)" }
    }

    $outputPath = Join-Path $targetRoot $video.Name
    & ffmpeg -hide_banner -loglevel error -y -framerate 16 -i (Join-Path $upscaledRoot 'frame_%03d.png') -frames:v 25 -an -c:v libx264 -preset medium -crf 14 -pix_fmt yuv420p -movflags +faststart $outputPath
    if ($LASTEXITCODE -ne 0) { throw "Encoding failed: $($video.Name)" }

    $requiredFrames = switch ($video.Name) {
        '02-school-exterior.mp4' { 26 }
        '04-cctv-monitor.mp4' { 37 }
        '05-locked-door.mp4' { 26 }
        default { 25 }
    }
    if ($requiredFrames -gt 25) {
        $retimedPath = Join-Path $targetRoot "$stem.retimed.mp4"
        # minterpolate consumes one boundary frame at each end; two extra
        # source-frame intervals preserve the requested playable duration.
        $setpts = [math]::Round(($requiredFrames + 1) / 24, 8)
        $filter = "setpts=$setpts*PTS,minterpolate=fps=16:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
        & ffmpeg -hide_banner -loglevel error -y -i $outputPath -vf $filter -frames:v $requiredFrames -an -c:v libx264 -preset medium -crf 14 -pix_fmt yuv420p -movflags +faststart $retimedPath
        if ($LASTEXITCODE -ne 0) { throw "Retiming failed: $($video.Name)" }
        Move-Item -LiteralPath $retimedPath -Destination $outputPath -Force
    }

    $probe = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -of csv=p=0 -- $outputPath
    "completed $($video.Name) $probe" | Add-Content -LiteralPath $logPath -Encoding utf8
}

"finished $(Get-Date -Format o)" | Add-Content -LiteralPath $logPath -Encoding utf8
