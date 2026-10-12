$ErrorActionPreference = 'Stop'
$out = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force -Path $out | Out-Null
$root = 'C:/Users/every/Documents/project/motiongraphic'
$ref = "$root/references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4"
$p1 = "$root/analysis/tempo-probe-2026-09-06/tokyo-person-1.00x-2s.mp4"
$p11 = "$root/analysis/tempo-probe-2026-09-06/tokyo-person-1.10x-2s.mp4"
$p12 = "$root/analysis/tempo-probe-2026-09-06/tokyo-person-1.20x-2s.mp4"
$video = "$out/reference-bangkok-vs-t1-1.00-1.10-1.20.mp4"
$filter = "[0:v]trim=start=4.95:end=6.35,setpts=PTS-STARTPTS,scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='REFERENCE Bangkok 4.95-6.35s':x=12:y=18:fontsize=22:fontcolor=black:box=1:boxcolor=white@0.75[v0];[1:v]trim=duration=1.4,setpts=PTS-STARTPTS,scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='T1 1.00x':x=12:y=18:fontsize=24:fontcolor=black:box=1:boxcolor=white@0.75[v1];[2:v]trim=duration=1.4,setpts=PTS-STARTPTS,scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='T1 1.10x':x=12:y=18:fontsize=24:fontcolor=black:box=1:boxcolor=white@0.75[v2];[3:v]trim=duration=1.4,setpts=PTS-STARTPTS,scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='T1 1.20x':x=12:y=18:fontsize=24:fontcolor=black:box=1:boxcolor=white@0.75[v3];[v0]fps=120[r0];[v1]fps=120[r1];[v2]fps=120[r2];[v3]fps=120[r3];[r0][r1][r2][r3]hstack=inputs=4[v]"
ffmpeg -y -i $ref -i $p1 -i $p11 -i $p12 -filter_complex $filter -map '[v]' -an -t 1.4 -r 120 -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart $video | Out-Null

$times = @(0,0.20,0.40,0.60,0.80,1.00,1.20,1.35)
foreach ($t in $times) {
  $label = ($t.ToString('0.00')).Replace('.', '_')
  $img = "$out/contact-$label.jpg"
  $vf = "[0:v]scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='REF t=$label':x=12:y=18:fontsize=22:fontcolor=black:box=1:boxcolor=white@0.75[a];[1:v]scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='1.00x t=$label':x=12:y=18:fontsize=22:fontcolor=black:box=1:boxcolor=white@0.75[b];[2:v]scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='1.10x t=$label':x=12:y=18:fontsize=22:fontcolor=black:box=1:boxcolor=white@0.75[c];[3:v]scale=540:1080:force_original_aspect_ratio=decrease,pad=540:1080:(ow-iw)/2:(oh-ih)/2:color=white,drawtext=text='1.20x t=$label':x=12:y=18:fontsize=22:fontcolor=black:box=1:boxcolor=white@0.75[d];[a][b][c][d]hstack=inputs=4"
  ffmpeg -y -ss (4.95 + $t) -i $ref -ss $t -i $p1 -ss $t -i $p11 -ss $t -i $p12 -filter_complex $vf -frames:v 1 -q:v 2 $img | Out-Null
}

Get-ChildItem $out -Filter 'contact-*.jpg' | Sort-Object Name | ForEach-Object { $_.FullName }
Write-Output $video
