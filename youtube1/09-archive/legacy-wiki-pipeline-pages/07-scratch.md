# 07 Scratch 운영 런북

## 목적·역할

컷 분석·프레임 추출·임시 실험을 격리하는 비정식 작업 공간이다. `tmp` 결과는 canonical output이 아니며 역사적 절대 경로를 포함할 수 있다([Scratch README](../../07-scratch/README.md), [tmp](../../07-scratch/tmp)).

## 시작 조건과 담당자

편집자/연구자가 가설 검증이나 중간 분석이 필요할 때 수동으로 시작한다. 자동 실행·정리 스케줄은 확인되지 않았다(**미확인**, [Scratch README](../../07-scratch/README.md)).

## 입력·전제

입력은 복제된 로컬 미디어와 분석 스크립트다. 예시로 `tmp/reel-cut-analysis/<id>/meta.json`, `analyze_frames.py`, reference caption/tempo 자료가 있다([예시 meta](../../07-scratch/tmp/reel-cut-analysis/DbLHxMtuRz0/meta.json), [스크립트](../../07-scratch/tmp/reel-cut-analysis/analyze_frames.py)). 원본 `01-research/data/news-media-audit`는 복사·수정하지 않는다([AGENTS](../../AGENTS.md)).

## 정상 절차(수동 도구)

Scratch 자체의 표준 명령은 없다. 각 실험 디렉터리 README/스크립트의 사용법을 먼저 확인하고, 출력은 `07-scratch/tmp/<experiment>` 아래에 만든다. 예시 Python 분석기는 해당 디렉터리에서 실행하되, 네트워크·원본 덮어쓰기를 금지한다(**수동 계약**, [tmp](../../07-scratch/tmp)).

## 내부 처리·산출물

프레임/메타데이터/접촉 시트가 임시 산출물이며 Scratch 소유다. 메타데이터에 남은 이전 절대 경로는 역사 증거로만 보존하고 live config로 해석하지 않는다([예시 meta](../../07-scratch/tmp/reel-cut-analysis/DbLHxMtuRz0/meta.json)).

## 검증·승격 인계

실험 결과는 원본 입력, 실행 명령, 도구 버전, checksum, 결론을 함께 기록한다. 재현 가능한 결과만 편집자 승인 후 01 Research(근거) 또는 04 Production(자산/타임라인)으로 복사하고 상대 경로 manifest를 만든다(**수동 승격 계약**, [Research README](../../01-research/README.md), [Production README](../../04-production/README.md)).

## 검증 체크리스트

- `meta.json`을 읽어 입력·시각·경로를 확인한다([예시](../../07-scratch/tmp/reel-cut-analysis/DbLHxMtuRz0/meta.json)).
- Python 스크립트는 우선 도움말/구문만 확인한다(스크립트가 지원할 때):

```powershell
cd C:\Users\User\Desktop\app\youtube\07-scratch\tmp\reel-cut-analysis
python -m py_compile analyze_frames.py
```

렌더·다운로드·업로드를 유발하는 명령은 Scratch 검증에서 실행하지 않는다(**안전 제한**).

## 장애·복구·롤백

실험 실패 시 로그와 실패 산출물을 보존하고 새 experiment ID로 재시도한다. 임시 파일 정리는 승인 후 개별 경로만 수행하며, 운영 단계로 승격된 파일은 먼저 checksum 확인 후 보존한다(**수동/비파괴**; [AGENTS](../../AGENTS.md)).

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 8 | 4 | 3 | 3 | 8 | **26/100** | 지원·비활성 |

정식 manifest·재현 로그·승격 자동화가 없다([Scratch README](../../07-scratch/README.md)). 다음 마일스톤은 실험 템플릿과 승인된 promotion 기록 형식을 추가하는 것이다(**계획**).

## 근거 링크

[07 Scratch README](../../07-scratch/README.md) · [tmp workspace](../../07-scratch/tmp) · [sample meta](../../07-scratch/tmp/reel-cut-analysis/DbLHxMtuRz0/meta.json) · [analysis script](../../07-scratch/tmp/reel-cut-analysis/analyze_frames.py)
