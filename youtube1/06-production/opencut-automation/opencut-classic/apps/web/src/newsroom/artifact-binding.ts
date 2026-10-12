import { createHash } from "node:crypto";

export type ExactRenderBinding = {
	versionId: string;
	renderPath: string;
	thumbnailPath: string;
	handoffPath: string | null;
	renderSha256: string;
	thumbnailSha256: string;
	handoffSha256: string | null;
};

export function sha256(value: string | Buffer) {
	return createHash("sha256").update(value).digest("hex");
}

export function renderBindingSha256(binding: ExactRenderBinding) {
	return sha256(JSON.stringify(binding));
}

export function exactApprovalMatches({ approval, binding }: { approval: Record<string, unknown> | null; binding: ExactRenderBinding & { renderRegistrySha256: string; scriptSha256: string } }) {
	return approval?.schemaVersion === 2
		&& approval.approved === true
		&& approval.versionId === binding.versionId
		&& approval.renderSha256 === binding.renderSha256
		&& approval.thumbnailSha256 === binding.thumbnailSha256
		&& approval.handoffSha256 === binding.handoffSha256
		&& approval.renderRegistrySha256 === binding.renderRegistrySha256
		&& approval.scriptSha256 === binding.scriptSha256;
}
