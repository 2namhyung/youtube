import assert from "node:assert/strict";
import { buildCaseDispositionReview } from "../opencut-classic/apps/web/src/newsroom/legal-review-policy.mjs";

const noPrecedent = buildCaseDispositionReview({ similarCases: [], applicableIssues: [] });
assert.equal(noPrecedent.status, "complete", "an exhausted no-result precedent search must finish with explicit limitations");
assert.deepEqual(noPrecedent.similarCases, []);
assert.match(noPrecedent.assessment, /검증된 유사 판례를 찾지 못했습니다/);
assert.match(noPrecedent.assessment, /단정하지 않습니다/);
assert.ok(noPrecedent.limitations.some((item) => item.includes("존재하지 않는다는 뜻이 아닙니다")));

const precedent = { title: "검증 판례", url: "https://www.law.go.kr/precInfoP.do?precSeq=1" };
const compared = buildCaseDispositionReview({ similarCases: [precedent], applicableIssues: ["증거인멸 혐의"] });
assert.equal(compared.status, "complete");
assert.deepEqual(compared.similarCases, [precedent]);
assert.deepEqual(compared.applicableIssues, ["증거인멸 혐의"]);
assert.match(compared.assessment, /판단 요소를 비교했습니다/);

console.log("legal review policy tests passed");
