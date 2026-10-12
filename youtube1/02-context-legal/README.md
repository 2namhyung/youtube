# 02 맥락·법률 분석

조사한 사건이 왜 답답함과 불안을 만드는지, 확인된 행위와 현행법이 바로 포착하는 혐의의 간극, 피해자 보호의 공백, 비교 가능한 판례·사례를 조사합니다.

필수 기록:

- 확인된 행위와 잠정 혐의
- 후보 혐의의 구성요건과 빠진 증거
- 법령·판례 등 1차 출처와 확인 시각
- 피해자가 체감하는 보호 공백
- 단정할 수 없는 내용과 안전한 대본 문장

제주 사건에서는 물건 오염의 성적 모욕감만으로 특정 성범죄가 자동 성립한다고 단정할 수 없다는 간극과 반복 침입 뒤 정보·보호 공백을 기록했습니다. 최종 죄명과 처분은 미확인입니다. 근거 데이터는 통합 엔진의 [`project.ts`](../06-production/opencut-automation/opencut-classic/apps/web/src/newsroom/project.ts) `chargeGapResearch`, `fearAnalysis`, `legalResearch`에 있습니다.

다음 단계: [`../03-script-voice`](../03-script-voice)

## Event-dossier automated legal review (2026-08-06)

Stage 02 consumes only a current, hash-bound event dossier. Opening the page triggers one explicit POST/PATCH report generation when the report is missing or stale; GET only reads state. The result separates prosecution and defense claims from court findings and exposes allowed claims, prohibited assertions, required qualifiers, safe phrasing, identity limits, and footage limits. `allow` and `conditional` immediately unlock the one-click draft action; `block` stops generation. A research refresh invalidates the report and downstream drafts, which are regenerated from the new dossier.

The executable contract is [`../06-production/opencut-automation/opencut-classic/apps/web/src/newsroom/legal-context.ts`](../06-production/opencut-automation/opencut-classic/apps/web/src/newsroom/legal-context.ts).
