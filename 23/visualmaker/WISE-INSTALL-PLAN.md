# WISE 신규 설치 계획

설치는 아직 실행하지 않았다. 기존 Windows 앱, `23jung/raw/`, 자료·인증정보와 다른 Docker 컨테이너는 변경하지 않는다. 아래 용량은 설치 실측치가 아니라 공간 부족을 피하기 위한 예산이다.

## 확인한 현재 환경 (2026-10-15)

- Windows 볼륨 조회: C: 여유 44,032,823,296바이트 = 약 41.0GiB. D:는 약 4GiB FAT32 볼륨이며 여유가 약 65MiB여서 설치 대상으로 삼지 않는다.
- 물리 RAM 약 15.2GiB, 조회된 GPU는 AMD Radeon(TM) Graphics. NVIDIA GPU는 이 조회에서 확인되지 않았다.
- WSL 배포판은 `docker-desktop`만 확인됐다. 기존 설치 스크립트가 요구하는 `Ubuntu`는 없다. 9670 포트 리스너도 없다.
- 기본 Production Studio 자료실 DB·sources·WISE 프로젝트 경로는 없다. 과거 `youtube1/production-studio/WISE.md`의 설치·합성 검증 기록은 현재 실행 환경을 증명하지 않는다. 별도 앱 프로세스에서 다른 경로를 설정했을 가능성까지 부정하는 결과는 아니다.

## 권장 구성과 용량 예산

공식 WISE는 GNU/Linux, Python 3.10 이상과 호환 FFmpeg를 요구하며 NVIDIA GPU 없이 CPU로 실행할 수 있다. Windows 직접 설치 대신 기존 통합과 일치하는 WSL2 Ubuntu + Python 3.12 + CPU PyTorch 구성을 우선 검토한다. AMD 가속은 이번 설치 범위에서 제외한다. [WISE 공식 설치 안내](https://github.com/ox-vgg/wise/blob/main/docs/Install.md)

| 구분 | 계획 여유분 |
| --- | ---: |
| Ubuntu 기본 파일·업데이트 | 3–6GiB |
| 분리 Python 환경·CPU PyTorch·FFmpeg·WISE 의존성 | 4–8GiB |
| SigLIP2 모델·토크나이저·캐시 | 2–3GiB |
| 설치 다운로드·압축 해제·임시 캐시 | 3–5GiB |
| 소규모 시험 원본·스테이징 복사·특징·색인·썸네일 | 2–5GiB |

총 예산은 약 14–27GiB이며, 첫 시험에는 25–30GiB를 확보하는 보수적 계획이다. 각 항목은 실제 패키지 해석·캐시·영상 길이·프레임 수에 따라 달라지며 공식 최소 요구 용량이 아니다. WISE 공식 기본 시각 모델 식별자는 `mlfoundations/open_clip/ViT-B-16-SigLIP2-512/webli`다. 위 모델·캐시 2–3GiB는 이 설치 경로의 실제 다운로드를 측정한 값이 아닌 임시 여유분이며, 다른 모델 배포의 파일 크기로 확정하지 않는다. [공식 모델 설정](https://github.com/ox-vgg/wise/blob/main/docs/UserGuide.md#step-3-extract-features)

C: 현재 41.0GiB에서 시험 예산 25–30GiB를 쓰면 약 11–16GiB만 남는다. 설치 전 C: 여유를 적어도 60GiB로 늘리거나 별도의 충분한 NTFS 저장 장치를 정하는 편을 권장한다. 이는 Windows·Docker·영상 렌더 작업 여유를 위한 운영 권장치이지 설치 성공을 보장하는 수치가 아니다. 자료실이 커지면 원본과 색인 스테이징 복사본을 함께 계산한다. WSL2 가상 디스크도 사용량에 따라 커지므로 Windows 볼륨의 실제 잔여 공간을 다시 확인해야 한다. [WSL 디스크 안내](https://learn.microsoft.com/en-us/windows/wsl/disk-space)

## 실행 순서 (미실행)

1. 설치 위치·용량 예산을 사용자와 확정한다. 파일 삭제나 추가 격리는 별도 승인 없이 하지 않는다.
2. WSL 상태·사용 가능한 Ubuntu 배포판을 확인한 뒤 설치한다. 관리자 작업·재부팅·Linux 계정 초기 설정이 필요할 수 있다. 기존 `docker-desktop`을 변경하거나 기본 배포판을 바꾸지 않는다. [Microsoft 설치 안내](https://learn.microsoft.com/en-us/windows/wsl/install)
3. 기존 `youtube1/production-studio/setup-wise.ps1`을 설치 전에 다시 검토한다. 이 스크립트는 Ubuntu가 이미 있어야 하며, 검증 기록의 WISE 커밋 `e2da814fef8099b9aa6bfb5c10bd959476517da0`, Python 3.12, CPU torch/torchaudio 2.8.0, torchvision 0.23.0과 FFmpeg 6을 사용한다. 현재 upstream 최신 버전으로 무조건 교체하지 않는다. 모든 전이 의존성이 사전에 잠겨 있는 설치는 아니므로 설치 후 실제 버전과 호환성을 기록한다.
4. 먼저 `wise --help`와 FFmpeg/환경만 검증한다. 이후 선택한 시각 모델만 내려받는다. 오디오·얼굴·객체 전용 모델은 시험 범위에 넣지 않는다.
5. 별도 합성 이미지·짧은 영상으로 `extract-features → create-index → serve`를 검증한다. 실제 프로젝트 대본·개인 원본은 시험에 쓰지 않는다. CPU 처리 시간은 실제 시험으로 측정하기 전까지 약속하지 않는다. [공식 사용 순서](https://github.com/ox-vgg/wise/blob/main/docs/UserGuide.md)
6. Production Studio 서버와 자료실은 명시적 초기 설정 후 연결한다. 진단을 위해 빈 DB를 자동 생성하지 않는다. 서버 발급 원본 ID·SHA를 사용하는 기존 등록 경로를 통해 자료를 등록한 뒤, 별도 명시 동작으로 WISE 색인을 요청한다.
7. 최종 연결은 `YouTube 후보 검색 → 선택 취득 → 정식 자료실 등록 → 명시적 색인 → WISE 의미/구간 검색 → VisualMaker 후보 가져오기`다. 취득 즉시 자동 색인하지 않으며, 색인은 적합성·출처·제작 승인과 별개다. 정확한 권리 정책 기록과 메타데이터가 충족되지 않은 자료에 임의로 `rights_confirmed=true`를 쓰지 않는다.

## 설치 전후 진단

`youtube/23`에서 `pnpm run visualmaker:wise-doctor`를 실행한다. 현재 브리지와 같은 경로 설정을 읽되 DB를 열거나 파일을 만들지 않는다. 보고서는 경로·비밀 값 대신 항목별 상태와 이유 코드만 출력한다. 명시된 loopback 주소가 있을 때에만 짧은 TCP 연결을 확인한다.

이 명령은 기존 브리지의 파일·경로·접속 전제만 진단한다. Python 실행, 모델·인덱스 상태, WISE 프로토콜이나 의미 검색 정확도를 검증하지 않는다. `prerequisites-present-unverified`도 완료/PASS가 아니며 `semanticSearchVerified=false`, `productionAuthority=false`를 유지한다. 실제 성공 판정은 위 합성 end-to-end 시험으로 별도 기록한다.
