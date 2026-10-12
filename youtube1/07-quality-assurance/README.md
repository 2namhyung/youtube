# 07 Quality assurance

Stage 07 is an exact-file, fail-closed release gate. Technical checks never substitute for legal/editorial review or a human watching the final MP4.

From `06-production/opencut-automation`, audit the registered version explicitly:

```powershell
npm run qa:audit -- --version <version-id>
```

For a new editorial-cartoon story, bind the reusable project/contract verification to the same audit:

```powershell
npm run qa:audit -- --version <version-id> `
  --project production/projects/<story>/project-editorial-cartoon.json `
  --contract production/projects/<story>/pipeline-contract-editorial-cartoon.json
```

`--render <registry-json>` is available instead of `--version`. Explicit versions write `runs/<version-id>.stage07-audit.json`; the no-argument compatibility command follows `out/latest-render.json` and writes `runs/latest-stage07-audit.json`. Every non-Jeju audit requires the exact `--project` and `--contract` pair. Their paths and hashes must equal both registry and handoff `sourceIntegrity`; legacy generic artifacts without this binding fail closed. The full reusable verifier still runs, so a structurally compatible prompt, evidence, or Wan-contract edit also fails exact identity. Jeju audits pass the selected version through both canonical verifiers and never substitute `latest-render.json` when a version was supplied.

Human playback approval and any legal-release decision remain separate schema-v2 JSON records bound to the exact `versionId`, registry, render, thumbnail, handoff and script SHA-256 values. Any mismatch invalidates the decision. Project-native approved metadata is not release authority; Stage 07 requires the external exact-file decision. Jeju verification receives the selected `--version`; other stories use the reusable editorial-cartoon/handoff checker.

Stage 08 must consume only an `approved`, `publishable=true`, `uploadBlocked=false` report for the exact version.
