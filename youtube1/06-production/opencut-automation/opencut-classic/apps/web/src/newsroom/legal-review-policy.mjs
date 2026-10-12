export function buildCaseDispositionReview({ similarCases, applicableIssues }) {
	const verifiedCases = Array.isArray(similarCases) ? similarCases : [];
	const issues = Array.isArray(applicableIssues) ? applicableIssues : [];
	const hasComparablePrecedent = verifiedCases.length > 0;
	return {
		status: "complete",
		question: "이 사건의 처리와 판단은 유사한 과거 사례 및 법리에 비추어 설명 가능한가",
		similarCases: verifiedCases,
		applicableIssues: issues,
		assessment: hasComparablePrecedent
			? "확인된 판결 이유와 유사 판례의 판단 요소를 비교했습니다. 죄명과 형량은 행위 수단, 결과, 고의, 증거 및 양형자료가 달라질 수 있으므로 동일 결론을 자동 적용하지 않습니다."
			: "현재 검증된 유사 판례를 찾지 못했습니다. 비교 결론을 만들지 않고, 이 한계를 대본에 반영해 사건의 형사책임·처벌·향후 수사 결과를 단정하지 않습니다.",
		limitations: [
			"공개 보도만으로 전체 소송기록과 증거를 재평가할 수 없습니다.",
			"검증된 유사 판례가 없다는 사실은 유사 사건이나 적용 법리가 존재하지 않는다는 뜻이 아닙니다.",
			"이 검토는 법률 자문이나 판결의 옳고 그름을 확정하는 의견이 아닙니다.",
		],
	};
}
