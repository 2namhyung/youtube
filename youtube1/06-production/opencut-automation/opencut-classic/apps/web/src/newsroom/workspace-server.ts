import { existsSync } from "node:fs";
import path from "node:path";

export function findYoutubeWorkspace() {
	let current = process.cwd();
	for (let depth = 0; depth < 8; depth += 1) {
		if (existsSync(path.join(current, "07-quality-assurance")) && existsSync(path.join(current, "08-upload-delivery"))) return current;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	throw new Error("YouTube workspace root was not found.");
}
