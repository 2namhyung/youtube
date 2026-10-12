# WISE 로컬 검색

이 제작실은 Oxford VGG WISE의 실제 특징 추출·FAISS 색인·`search2` 검색을 사용한다. 텍스트 파일 검색을 WISE 결과로 표시하지 않는다. 인터넷 전체의 영상을 검색하거나 다운로드하는 엔진은 아니다.

## 설치된 환경

- WSL Ubuntu의 `~/.local/share/production-studio/wise-env`
- Python 3.12, FFmpeg 6.x, torch/torchaudio 2.8 CPU, torchvision 0.23
- Oxford 공식 저장소 commit `e2da814fef8099b9aa6bfb5c10bd959476517da0`
- 이미지·영상 모델: `mlfoundations/open_clip/ViT-B-16-SigLIP2-512/webli`
- 음성·얼굴·Qwen 모델은 이번 색인 경로에서 사용하지 않는다.

현재 PC의 기존 Windows 제작 환경과 분리했다. 재설치가 필요하면 `production-studio/setup-wise.ps1`을 실행한다. 모델은 최초 색인 시 내려받고 이후 로컬 캐시를 재사용한다. CPU로 실행하므로 자료량에 따라 색인에 시간이 걸린다. 모델 체크포인트만 약 1.5GB이며 소스·프록시·특징 저장 공간은 별도다.

## 사용

공통 제작실에서 권리를 확인한 원본 파일을 등록한 뒤 WISE 색인을 실행한다. 색인 작업이 완료되어 검색 서버가 준비되면 샷의 검색어로 검색한다. 색인·서버 상태와 실패 이유가 실제 작업 결과로 표시된다. 외부 모델 제공자에 원본을 업로드하지 않는다.

WISE 검색 시간은 후보 위치다. 실제 2초 영상에 대해 WISE가 `0–5.5초` 확장 구간을 반환하는 사례를 검증에서 확인했다. 따라서 화면의 후보 구간을 원본 길이에 맞춰 확인하고 실제 동작이 이어지는 in/out을 선택해야 한다. 서버가 등록한 원본 ID·해시와 연결되지 않는 검색 결과는 바로 샷으로 사용할 수 없다.

## 검증과 범위

`verification/wise-live-smoke.json`은 별도 합성 진단 자료(이미지 1개, 영상 1개)에 대해 실제 모델 특징 5개, 색인 생성, HTTP `/info`와 `/search2` 성공을 기록한다. 이 기록은 WISE 기술 연결의 증거이며 실제 사건·상품의 소재 적합성이나 제작 승인이 아니다. 진단 자료는 공통 제작 원본 라이브러리에 자동 등록되지 않는다.

`verification/wise-library-integration.json`은 제작실 어댑터를 거친 실제 영상·이미지 검색, 원본 ID/해시 매핑, 영상 길이 안으로 후보 구간 보정, 기존 검색 서버를 유지한 재색인과 중단 작업 복구를 기록한다. 이 검증도 별도 합성 자료로 수행했다.

공식 근거: [설치](https://gitlab.com/vgg/wise/wise/-/blob/main/docs/Install.md), [사용법](https://gitlab.com/vgg/wise/wise/-/blob/main/docs/UserGuide.md), [검색 API 구현](https://gitlab.com/vgg/wise/wise/-/blob/main/src/wise/api/standalone/search.py).
