# 05 BGM 생성

- 상태: 생성·검증 완료, 렌더 대기 (78%)
- 입력: final 대본, 장면 리듬, 목표 길이
- 처리: 분위기 분석 → provider·prompt·seed 고정 → 생성 또는 승인 음원 등록 → 권리·체크섬 → 음량·ducking
- 출력: BGM 파일과 provenance 또는 명시적 `pending`
- 게이트: 모델·버전·seed·라이선스·SHA-256·mix 설정

제주 프로젝트에는 65초 stereo 44.1kHz 로컬 procedural BGM [generated-bgm.wav](../../06-production/opencut-automation/production/projects/school-case-production/assets/audio/generated-bgm.wav)이 생성됐습니다. SHA-256은 `5598dd85...64fdb`이고, [provenance](../../06-production/opencut-automation/production/projects/school-case-production/assets/audio/generated-bgm.provenance.json)는 prompt·model/version·seed·license, 무보컬, 제3자 sample 없음 조건을 기록합니다. 새 영상은 03 음성 게이트 실패로 렌더되지 않았으므로 OpenCut BGM 트랙 생성까지는 진행되지 않았습니다.

다음: [06 OpenCut 영상 제작](06-production.md)
