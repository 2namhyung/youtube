# 04 영상 자산

대본 장면에 맞는 AI 생성 이미지 또는 재사용 권리가 확인된 영상에서 클립을 구성합니다.

자산마다 생성 방식, 원본 URL, 업로더, 라이선스, 확인 시각, 사용할 구간, 크롭·무음 조건, SHA-256을 기록합니다. YouTube의 CC 표기만으로 제3자 초상·음성 권리까지 자동 승인하지 않습니다.

제주 사건의 자산은 통합 엔진이 소유하는 [`school-case-production/assets`](../06-production/opencut-automation/production/projects/school-case-production/assets)에 보존됩니다. AI 재연 이미지 12종과 KCTV 교체 클립 4개가 있으며, [`project.json`](../06-production/opencut-automation/production/projects/school-case-production/project.json)의 `media`가 출처·구간·체크섬을 고정합니다. 2026-07-27 검증 결과는 [`runs/...assets.json`](runs/jeju-school-intrusion-20260727T204000+0900.assets.json)에 있습니다.

다음 단계: [`../05-bgm-generation`](../05-bgm-generation)
