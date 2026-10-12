import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Non-destructive v12 action-flow project creator. Source, v11 files, and media
// are never edited; this writes a new project config once.
const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, "production", "projects", "jeju-school-intrusion-short-v1");
const sourcePath = path.join(projectRoot, "project.json");
const baselinePath = path.join(projectRoot, "canonical-baseline.json");
const targetPath = path.join(projectRoot, "project-v12-action-flow.json");

const scenePlan = [
  ["assets/images/v12-action-flow/classroom-window-overcast.png", "none", 0],
  ["assets/video/v12-action-flow/window-open-slide-action.mp4", "handheld", 0.28],
  ["assets/images/v12-action-flow/security-desk-static.png", "none", 0],
  ["assets/video/v12-action-flow/school-gate-close-action.mp4", "none", 0],
  ["assets/images/v12-action-flow/window-latch-evidence-macro.png", "none", 0],
  ["assets/video/v12-action-flow/tumbler-place-hand-action.mp4", "none", 0],
  ["assets/video/v12-action-flow/tumbler-lift-setdown-hand-action.mp4", "none", 0],
  ["assets/images/v12-action-flow/tumbler-clean-inspection-macro.png", "none", 0],
  ["assets/images/v12-action-flow/classroom-aisle-static.png", "none", 0],
  ["assets/video/v12-action-flow/teacher-chair-pull-action.mp4", "none", 0],
  ["assets/video/v12-action-flow/cctv-scrub-playback-action.mp4", "none", 0],
  ["assets/images/v12-action-flow/case-folder-recorder-evidence.png", "none", 0],
  ["assets/images/v12-action-flow/empty-interview-room-tripod.png", "none", 0],
  ["assets/video/v12-action-flow/phone-cable-connect-gloved-action.mp4", "handheld", 0.12],
  ["assets/images/v12-action-flow/digital-forensics-workstation-static.png", "none", 0],
  ["assets/video/v12-action-flow/evidence-bag-seal-move-action.mp4", "none", 0],
  ["assets/video/v12-action-flow/apartment-door-lock-check-action.mp4", "handheld", 0.3],
  ["assets/images/v12-action-flow/locked-door-hallway-static.png", "none", 0],
  ["assets/images/v12-action-flow/empty-classroom-tripod.png", "none", 0],
  ["assets/video/v12-action-flow/badge-tap-access-open-action.mp4", "none", 0],
  ["assets/images/v12-action-flow/access-reader-evidence-detail.png", "none", 0]
];

if (fs.existsSync(targetPath)) throw new Error(`Refusing to overwrite existing target: ${targetPath}`);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
if (!Array.isArray(source.scenes) || source.scenes.length !== 21) throw new Error("Expected exactly 21 source scene slots");
if (!Array.isArray(baseline.scenes) || baseline.scenes.length !== 21 || baseline.output?.frames !== 1524 || baseline.output?.duration !== 50.8) throw new Error("Unexpected canonical output contract");
const project = JSON.parse(JSON.stringify(source));
project.id = "jeju-school-intrusion-short-v1-v12-action-flow";
project.scenes = project.scenes.map((scene, index) => {
  const [asset, camera, intensity] = scenePlan[index];
  return { ...scene, asset, camera, intensity, zoom: 1, panX: 0.5, panY: 0.5 };
});
for (const key of ["title", "scriptSource", "thumbnail", "captionPreset", "bgm", "narration", "releaseGate"]) {
  if (JSON.stringify(project[key]) !== JSON.stringify(source[key])) throw new Error(`Contract field changed: ${key}`);
}
for (let i = 0; i < source.scenes.length; i += 1) {
  if (project.scenes[i].captionAnchor !== source.scenes[i].captionAnchor || baseline.scenes[i].captionAnchor !== source.scenes[i].captionAnchor) throw new Error(`Caption anchor changed at scene ${i + 1}`);
  if (project.scenes[i].label !== source.scenes[i].label) throw new Error(`Disclosure label changed at scene ${i + 1}`);
  if (!project.scenes[i].asset.includes("v12-action-flow/")) throw new Error(`Invalid v12 asset path at scene ${i + 1}`);
}
if (project.scenes.filter((scene) => scene.asset.endsWith(".mp4")).length !== 10) throw new Error("Expected exactly 10 action-flow motion replacements");
fs.writeFileSync(targetPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`created ${targetPath}`);
