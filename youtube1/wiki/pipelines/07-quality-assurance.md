# 07 품질 검사

- 상태: 운영 중·실패 (62%)
- 입력: 01~06의 근거와 산출물
- 검사: 사실·법률 단정, 자산 권리, 음성 발음·ASR, 자막, 해상도·길이, 오디오, handoff 무결성
- 출력: 통과/차단 결과와 오류 목록
- 게이트: 차단 오류 0건, 최종 편집자 승인

[차단 보고서](../../07-quality-assurance/runs/jeju-school-intrusion-ms38nout-17636-4oh18b.blocked.json)는 이번 실행을 `publishable=false`, `uploadBlocked=true`로 판정했습니다. 기술 차단은 cue 4–7 연속 생성 단위의 3회 ASR 실패이며, 법률 차단은 고정 문장 `물건 오염만으로 성범죄가 적용되진 않기 때문입니다`입니다. [대법원 2021도7538](https://www.scourt.go.kr/supreme/news/NewsViewAction2.work?gubun=4&searchOption=&searchWord=&seqnum=8043)은 피해자가 당시 인식하지 못한 상태의 행위도 구체적 사실관계에 따라 강제추행으로 판단될 수 있음을 보여 주므로 이 문장을 범주적으로 안전한 단정으로 승인할 수 없습니다.

[release 검사](../../07-quality-assurance/check-jeju-release.mjs)는 이후 기술 QA가 통과해 preview가 생기더라도 metadata와 OpenCut handoff 양쪽의 동일한 legal blocker를 요구합니다. 법률 검토로 문장이 승인되거나 대본 변경이 별도로 허가되고, 최종 음성 acceptance가 true가 되기 전까지 08 업로드는 금지입니다.

다음: [08 업로드](08-upload-delivery.md)
