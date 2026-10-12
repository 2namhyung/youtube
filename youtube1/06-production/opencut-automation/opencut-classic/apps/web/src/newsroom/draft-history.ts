type JsonRecord = Record<string, unknown>;
type HashJson = (value: unknown) => string;

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- persisted JSON is narrowed and hash-verified at this boundary. */

export function validateDraftHistory({ value, hashJson }: { value: unknown; hashJson: HashJson }) {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > 128) throw new Error("대본 revision history가 올바르지 않습니다.");
	return value.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`대본 history ${index + 1}이 올바르지 않습니다.`);
		const entry = item as JsonRecord;
		const draftSnapshot = entry.draftSnapshot && typeof entry.draftSnapshot === "object" && !Array.isArray(entry.draftSnapshot) ? entry.draftSnapshot as JsonRecord : null;
		const draftSnapshotSha256 = String(entry.draftSnapshotSha256 || "");
		if (entry.schema !== "newsroom-draft-history-entry-v1" || !draftSnapshot || !/^[a-f0-9]{64}$/u.test(draftSnapshotSha256) || hashJson(draftSnapshot) !== draftSnapshotSha256 || "history" in draftSnapshot) throw new Error(`대본 history ${index + 1} snapshot hash가 올바르지 않습니다.`);
		const productionApprovalSnapshot = entry.productionApprovalSnapshot;
		const productionApprovalSha256 = entry.productionApprovalSha256;
		if (productionApprovalSnapshot !== undefined && (typeof productionApprovalSnapshot !== "object" || productionApprovalSnapshot === null || Array.isArray(productionApprovalSnapshot) || !/^[a-f0-9]{64}$/u.test(String(productionApprovalSha256 || "")) || hashJson(productionApprovalSnapshot) !== productionApprovalSha256)) throw new Error(`대본 history ${index + 1} approval snapshot hash가 올바르지 않습니다.`);
		if (productionApprovalSnapshot === undefined && productionApprovalSha256 !== undefined) throw new Error(`대본 history ${index + 1} approval snapshot이 없습니다.`);
		return entry;
	});
}

function withoutHistory(draft: JsonRecord) {
	return Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "history"));
}

function revisionProjection(draft: JsonRecord) {
	return Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "history" && key !== "editAuthority"));
}

export function appendDraftHistory({ current, incomingDraft, archivedAt, hashJson }: { current: JsonRecord; incomingDraft: JsonRecord; archivedAt: string; hashJson: HashJson }) {
	const currentDraft = current.draft && typeof current.draft === "object" && !Array.isArray(current.draft) ? current.draft as JsonRecord : null;
	if (!currentDraft) return [];
	const history = validateDraftHistory({ value: currentDraft.history, hashJson });
	if (hashJson(revisionProjection(currentDraft)) === hashJson(revisionProjection(incomingDraft))) return history;
	if (history.length >= 128) throw new Error("대본 revision history 안전 상한에 도달했습니다.");
	const draftSnapshot = withoutHistory(currentDraft);
	const approval = current.productionApproval && typeof current.productionApproval === "object" && !Array.isArray(current.productionApproval) ? current.productionApproval as JsonRecord : null;
	return [...history, {
		schema: "newsroom-draft-history-entry-v1",
		reason: "active-unfinalized-draft-replaced",
		archivedAt,
		draftSnapshot,
		draftSnapshotSha256: hashJson(draftSnapshot),
		...(approval ? { productionApprovalSnapshot: approval, productionApprovalSha256: hashJson(approval) } : {}),
	}];
}
