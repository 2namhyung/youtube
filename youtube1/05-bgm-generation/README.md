# 05 BGM 생성

재사용 대상은 `engines/ace-step-1.5-official-local-v1/manifest.json`의 생성 엔진뿐이며 사건 간 생성 오디오는 재사용하지 않습니다. `generate_ace_step_bgm.py`에 사건 slug·prompt·seed·duration을 전달하면 48 kHz stereo PCM24/-24 LUFS WAV와 권리·모델·commit·probe·SHA manifest를 만듭니다. 렌더 기본 mix는 -16 dB, narration ducking, fade 1.2초입니다.

확정 대본의 긴장 곡선과 영상의 리듬을 바탕으로 보컬 없는 BGM을 생성하거나 승인된 로컬 음원을 등록합니다.

필수 기록은 분위기 프롬프트, provider·모델 버전, seed, 생성 시각, 라이선스, 파일 SHA-256, 음량, 내레이션 ducking, fade 설정입니다. 음원이 없으면 성공으로 위장하지 않고 `pending`으로 인계합니다.

제주 프로젝트에는 65초 로컬 procedural BGM [`generated-bgm.wav`](../06-production/opencut-automation/production/projects/school-case-production/assets/audio/generated-bgm.wav)이 있습니다. SHA-256은 `5598dd85...64fdb`이며 [`provenance`](../06-production/opencut-automation/production/projects/school-case-production/assets/audio/generated-bgm.provenance.json)에 model/version/seed/license와 무보컬·제3자 sample 없음이 기록돼 있습니다. 음성 단계가 실패해 새 OpenCut 렌더에는 아직 인계되지 않았습니다.

다음 단계: [`../06-production`](../06-production)
