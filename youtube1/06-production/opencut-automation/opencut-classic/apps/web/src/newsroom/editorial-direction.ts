import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const MAX_EDITORIAL_DIRECTION_BYTES = 16_384;
const SAFE_NEWSROOM_SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/u;

function contained(root: string, target: string) {
	const base = path.resolve(root);
	const resolved = path.resolve(target);
	if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error("Editorial direction file must stay inside the newsroom workspace");
	return resolved;
}

/**
 * Read the per-story editorial direction, if present. Missing files are an
 * intentional fallback to the generic prompt; all other filesystem and
 * decoding errors fail closed.
 */
export async function readDefaultEditorialDirection({ root, slug }: { root: string; slug: string }) {
	if (!SAFE_NEWSROOM_SLUG.test(slug)) throw new Error("A valid newsroom project slug is required");
	const workspaceRoot = await realpath(root);
	const requested = contained(workspaceRoot, path.join(workspaceRoot, "production", "newsroom", "editorial-directions", `${slug}.txt`));
	let requestedStat;
	try {
		requestedStat = await lstat(requested);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
		throw error;
	}
	if (!requestedStat.isFile() || requestedStat.isSymbolicLink() || requestedStat.size > MAX_EDITORIAL_DIRECTION_BYTES) throw new Error("Editorial direction must be a regular non-symlink UTF-8 file of at most 16384 bytes");
	const resolved = await realpath(requested);
	contained(workspaceRoot, resolved);
	const bytes = await readFile(resolved);
	if (bytes.byteLength > MAX_EDITORIAL_DIRECTION_BYTES) throw new Error("Editorial direction must be a regular non-symlink UTF-8 file of at most 16384 bytes");
	const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "");
	if (!decoded.trim()) throw new Error("Editorial direction file must not be empty");
	return decoded;
}

export function hasExplicitEditorialDirection(value: Record<string, unknown>) {
	return Object.prototype.hasOwnProperty.call(value, "editorialDirection");
}
