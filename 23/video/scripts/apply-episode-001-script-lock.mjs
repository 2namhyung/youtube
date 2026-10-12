throw new Error('Retired editorial rebuilder: edit episode-spec.json and run pnpm run video:generate-plans. Historical source retained for deletion review; no files were changed.');

// Compatibility entrypoint. The approved script and its footage-first visual plan
// must be rebuilt together so stale cut purposes, sources and modes cannot survive.
await import('./rebuild-episode-001-footage-plan.mjs');
