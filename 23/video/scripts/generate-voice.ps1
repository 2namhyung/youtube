param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\public\audio')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$clips = @{
  case = '중고거래 사기로 이백만 원을 잃었습니다.'
  account = '경찰이 수사를 마쳤지만, 확인하지 않은 계좌가 하나 남았습니다.'
  question = '기록을 받은 검사가 이걸 발견하면 직접 다시 조사할 수 있을까요?'
  october = '십월 이일부터 답은, 직접은 못 한다입니다.'
  request = '그렇다고 사건이 끝나는 건 아닙니다. 다시 수사하라고 요구하는 권한은 남습니다.'
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Heami Desktop')
$synth.Rate = 10
$synth.Volume = 100
foreach ($name in $clips.Keys) {
  $path = Join-Path $OutputDir "$name.wav"
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($clips[$name])
  $synth.SetOutputToNull()
}
$synth.Dispose()
Write-Output "Generated $($clips.Count) Korean voice clips in $OutputDir"
