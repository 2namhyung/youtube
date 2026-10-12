# 03 Voice 운영 런북

## 목적·역할

참조 음성을 녹음·보관하고 로컬 CosyVoice 3 또는 Fish Speech LoRA로 내레이션을 만든다. 녹음 서버는 로컬 전용이며 reference audio와 transcript의 provenance가 다음 Production으로 전달된다([Voice README](../../03-voice/README.md), [recorder README](../../03-voice/voice_recorder/README.md), [clone README](../../03-voice/voice-clone/README.md)).

## 시작 조건과 담당자

보이스 오너가 최종 스크립트 승인 후 참조 음성이 없거나 재생성이 필요할 때 시작한다. recorder는 수동 브라우저 세션이고 clone/provider 실행은 Production이 호출하거나 운영자가 직접 실행한다([recorder 서버](../../03-voice/voice_recorder/server.py), [provider 코드](../../04-production/opencut-automation/scripts/fish-speech-lora-provider.mjs)). 자동 스케줄은 확인되지 않았다.

## 입력·전제와 비밀 취급

- recorder 작업 디렉터리: `C:\Users\User\Desktop\app\youtube\03-voice\voice_recorder`; Python 3.10+ 표준 라이브러리만 필요하다([README](../../03-voice/voice_recorder/README.md)).
- clone은 `03-voice/voice-clone\.venv\Scripts\python.exe`, pinned model `Fun-CosyVoice3-0.5B-2512` revision과 `model-lock.json` SHA-256 allowlist를 사용한다([clone README](../../03-voice/voice-clone/README.md), [model lock](../../03-voice/voice-clone/model-lock.json)).
- 참조 WAV는 24 kHz mono PCM이어야 하며 transcript와 정확히 일치해야 한다([clone README](../../03-voice/voice-clone/README.md)).
- Fish 실행은 `fishRoot` 아래의 로컬 체크포인트·prompt tokens를 사용한다([Fish provider](../../04-production/opencut-automation/scripts/fish-speech-lora-provider.mjs)). API 키·`api.txt`는 읽거나 복사하지 않는다([AGENTS](../../AGENTS.md)).

## 정상 절차 A — recorder

```powershell
cd C:\Users\User\Desktop\app\youtube\03-voice\voice_recorder
./start.ps1
```

브라우저에서 `http://127.0.0.1:8765/`를 열고 마이크 권한·파형을 확인한 뒤 대본을 실제 발화와 맞춰 저장한다. 서버는 `recordings/YYYYMMDD_HHMMSS/{reference.wav,reference.txt,metadata.json}`을 만든다([실행·저장 계약](../../03-voice/voice_recorder/README.md), [save 핸들러](../../03-voice/voice_recorder/server.py)). PowerShell에서 포트를 바꾸려면 `$env:VOICE_RECORDER_PORT='9000'; python server.py`로 실행한다([README](../../03-voice/voice_recorder/README.md)).

## 정상 절차 B — CosyVoice clone

다음 명령은 workspace 루트 `C:\Users\User\Desktop\app\youtube`에서 실행한다.

```powershell
cd C:\Users\User\Desktop\app\youtube
03-voice\voice-clone\.venv\Scripts\python.exe 03-voice\voice-clone\download_model.py
03-voice\voice-clone\.venv\Scripts\python.exe 03-voice\voice-clone\synthesize.py `
  --style hook `
  --text "잡혔는데도 끝나지 않은 사건. 대체 무엇이 잘못된 걸까요?" `
  --output 03-voice\voice-clone\samples\hook.wav
```

다운로드는 일치 스냅샷을 재사용하고 digest 불일치·누락이면 실패한다([clone README](../../03-voice/voice-clone/README.md)). 허용 prompt style은 transcript 정렬된 `neutral`, `hook`, `solution`이다([clone README](../../03-voice/voice-clone/README.md)).

## 내부 처리와 산출물

recorder POST `/api/save`는 WAV 헤더·transcript·metadata 크기를 검증하고 모듈 소유 recordings 폴더에 기록한다([server.py](../../03-voice/voice_recorder/server.py)). Production provider는 스크립트→음성→SRT/cues→침묵 제거·tempo 보정→provenance handoff 순으로 처리한다([produce-short](../../04-production/opencut-automation/scripts/produce-short.mjs), [local clone provider](../../04-production/opencut-automation/scripts/local-clone-provider.mjs)).

## 인계 게이트

handoff에는 실제 provider, fallback 여부, model/revision, reference SHA-256, script/narration hash, cue 수가 있어야 한다([render handoff tests](../../04-production/opencut-automation/scripts/render-handoff-tests.mjs)). Fish의 최종 `speechAcceptance.final.accepted`가 `true`이고 모든 cue가 기준을 통과해야 Production 인계를 승인한다. 현재 등록 렌더는 상위 acceptance가 true여도 중첩 final이 false이며 cue 7·11·15 오류가 있으므로 게시 준비로 보지 않는다([latest-render](../../04-production/opencut-automation/out/latest-render.json)).

## 검증 체크리스트

```powershell
cd C:\Users\User\Desktop\app\youtube\03-voice\voice_recorder
python -m unittest discover -s tests -q

cd C:\Users\User\Desktop\app\youtube\04-production\opencut-automation
node scripts/local-clone-provider-tests.mjs
node scripts/fish-speech-lora-provider-tests.mjs
```

첫 명령은 recorder HTTP/검증 계약을, 두 provider 테스트는 로컬 fixture와 acceptance 경계를 검사한다([recorder 테스트](../../03-voice/voice_recorder/tests/test_server.py), [local clone 테스트](../../04-production/opencut-automation/scripts/local-clone-provider-tests.mjs), [Fish 테스트](../../04-production/opencut-automation/scripts/fish-speech-lora-provider-tests.mjs)). 실제 합성은 비용·시간이 있으므로 승인된 작업에서만 수행한다.

## 장애·복구·롤백

WAV/TRANSCRIPT 검증 실패는 400/413으로 저장하지 않으며, 모델 digest 불일치는 fail-closed다([server.py](../../03-voice/voice_recorder/server.py), [model lock](../../03-voice/voice-clone/model-lock.json)). Fish acceptance 실패 시 cue 텍스트·발음·seed를 수정해 해당 cue만 재생성하고, 이전 handoff와 샘플은 삭제하지 않은 채 새 run으로 비교한다(**재시도 전략은 코드 계약에 근거한 운영 절차**, [provider](../../04-production/opencut-automation/scripts/fish-speech-lora-provider.mjs)).

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 18 | 17 | 16 | 13 | 15 | **79/100** | 부분 운영 |

현재 nested `speechAcceptance.final.accepted=false`와 cue 7·11·15 오류가 남아 있다([latest-render](../../04-production/opencut-automation/out/latest-render.json)). 다음 마일스톤은 동일 provider/recorder 테스트를 재실행하고 final 판정을 true로 만든 뒤 Production release gate를 통과하는 것이다(**계획**).

## 근거 링크

[Voice README](../../03-voice/README.md) · [recorder README/server/tests](../../03-voice/voice_recorder/README.md) · [voice-clone README/model lock/verification](../../03-voice/voice-clone/README.md) · [Fish provider/tests](../../04-production/opencut-automation/scripts/fish-speech-lora-provider.mjs) · [latest render metadata](../../04-production/opencut-automation/out/latest-render.json)
