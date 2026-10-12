# VOICE / 기준 음성 캡처

브라우저에서 한국어 참조 대본을 읽고, 로컬에 `WAV + 정확한 transcript + metadata`를 저장하는 도구입니다. 외부 서버나 CDN을 사용하지 않으며 서버는 `127.0.0.1`에서만 열립니다.

## 실행

- Windows: `start.bat` 더블클릭 (또는 PowerShell에서 `./start.ps1`)
- Python 3.10 이상 권장. 추가 패키지 설치가 필요 없습니다.
- 서버가 시작되면 `http://127.0.0.1:8765/`를 브라우저에서 엽니다. 포트가 사용 중이면 `VOICE_RECORDER_PORT=9000 python server.py`처럼 지정하세요.

## 녹음 순서

1. 마이크를 선택하고 **마이크 권한 확인**을 누릅니다. 입력 미터와 파형이 움직이는지 확인합니다.
2. 기본 대본을 실제 읽을 문장으로 편집합니다. 발음이 달라지면 transcript도 실제 발화에 맞춰 수정합니다.
3. **녹음 시작** 후 3초 카운트다운이 끝나면 읽습니다. 필요하면 일시정지 후 계속하거나 정지합니다.
4. 재생으로 확인하고, 품질 안내(길이·입력 크기·클리핑·무음 비율)를 살핍니다. 본인 목소리와 transcript 일치 체크 후 저장합니다.

저장 결과는 `recordings/YYYYMMDD_HHMMSS/` 아래에 `reference.wav`(mono PCM 16-bit), `reference.txt`, `metadata.json`으로 생성됩니다.

## 권장 마이크 설정

입과 마이크를 10~20cm 두고 정면이 아닌 약간 옆으로 향하게 하세요. 헤드폰으로 모니터링하고, 입력 피크는 -12~-6 dBFS를 목표로 합니다. 에어컨·키보드 소음을 끄고 같은 거리와 톤으로 대본을 읽으면 CosyVoice 3 참조 품질이 좋아집니다. 48 kHz 입력 장치를 우선 사용하며 브라우저가 제공하는 샘플레이트를 metadata에 기록합니다.

## OmniVoice Studio / CosyVoice 3

OmniVoice Studio에서 음성 참조 또는 voice cloning 입력 화면을 열고 모델로 **CosyVoice 3**를 선택합니다. 각 저장 폴더의 `reference.wav`를 음성 참조 파일로, `reference.txt` 내용을 정확한 transcript 칸에 붙여 넣습니다. `metadata.json`은 녹음 조건 확인용입니다.

## Privacy

마이크 스트림은 브라우저에서 WAV로 변환되어 이 컴퓨터의 로컬 서버로만 전송됩니다. 서버는 외부 네트워크 요청을 하지 않고, 녹음 파일을 `recordings/`에 직접 기록합니다. 브라우저 탭을 닫으면 미저장 오디오는 폐기됩니다. 민감한 녹음은 OS 계정과 폴더 권한을 함께 관리하세요.
