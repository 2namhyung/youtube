import { describe, expect, test } from "bun:test";
import { loadNewsroomRegistry } from "./registry";
import { newsroomProject } from "./project";
import { hasCanonicalNewsroomCapability } from "./project-runtime";

describe("newsroom project registry", () => {
	test("migrates a canonical project into the durable registry", async () => {
		const registry = await loadNewsroomRegistry();
		const canonical = registry.projects.find((project) => project.slug === newsroomProject.slug);
		expect(canonical?.canonical).toBe(true);
		expect(canonical?.title).toBe(newsroomProject.title);
	});
});

describe("newsroom workflow capability", () => {
	test("recognizes the legacy finalized-script schema without consulting a slug", () => {
		expect(hasCanonicalNewsroomCapability({
			draft: "final script",
			status: "final",
			savedAt: "2026-08-01T00:00:00.000Z",
			finalizedAt: "2026-08-01T00:00:00.000Z",
			generation: { source: "user-approved-final-script" },
		})).toBe(true);
	});

	test("keeps arbitrary event workflows on the generic pipeline", () => {
		expect(hasCanonicalNewsroomCapability({
			slug: "research-example-event",
			title: "Example event",
			draft: { sections: { hook: "Draft" } },
			draftFinalized: true,
		})).toBe(false);
	});
});
