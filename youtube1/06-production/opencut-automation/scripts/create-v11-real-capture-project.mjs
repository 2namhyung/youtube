import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Non-destructive v11 project creator. It clones the locked project contract,
// replacing only scene media and camera fields; the source project is untouched.
const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, "production", "projects", "jeju-school-intrusion-short-v1");
const sourcePath = path.join(projectRoot, "project.json");
const baselinePath = path.join(projectRoot, "canonical-baseline.json");
const targetPath = path.join(projectRoot, "project-v11-real-capture.json");

const scenePlan = [
  ["assets/images/v11-real-capture/classroom-window-overcast.png", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/corridor-window-handheld.mp4", "handheld", 0.34, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/security-desk-cctv-static.mp4", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/school-exterior-field-news.mp4", "handheld", 0.26, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/window-latch-evidence-macro.png", "none", 0, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/teacher-desk-tumbler-broll.png", "none", 0, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/tumbler-clean-inspection-macro.png", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/tumbler-rim-inspection-macro.mp4", "none", 0, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/classroom-aisle-field-news.png", "none", 0, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/empty-teacher-chair-cctv.png", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/security-monitor-cctv-static.mp4", "none", 0, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/case-folder-recorder-evidence.png", "none", 0, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/empty-interview-room-tripod.png", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/forensics-device-evidence.mp4", "handheld", 0.15, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/digital-forensics-workstation-field.png", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/evidence-bag-tripod.mp4", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/locked-door-field-handheld.mp4", "handheld", 0.38, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/locked-door-hallway-cctv.png", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/empty-classroom-tripod.mp4", "none", 0, 1, 0.5, 0.5],
  ["assets/video/v11-real-capture/access-control-cctv-static.mp4", "none", 0, 1, 0.5, 0.5],
  ["assets/images/v11-real-capture/access-reader-evidence-detail.png", "none", 0, 1, 0.5, 0.5],
];

if (fs.existsSync(targetPath)) throw new Error(`Refusing to overwrite existing target: ${targetPath}`);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
if (!Array.isArray(source.scenes) || source.scenes.length !== 21) throw new Error("Expected exactly 21 locked scene slots");
if (!Array.isArray(baseline.scenes) || baseline.scenes.length !== source.scenes.length) throw new Error("Canonical scene count mismatch");
if (baseline.output?.frames !== 1524 || baseline.output?.duration !== 50.8) throw new Error("Unexpected canonical output contract");
const project = JSON.parse(JSON.stringify(source));
project.id = "jeju-school-intrusion-short-v1-v11-real-capture";
project.scenes = project.scenes.map((scene, index) => {
  const [asset, camera, intensity, zoom, panX, panY] = scenePlan[index];
  return { ...scene, asset, camera, intensity, zoom, panX, panY };
});
// Verify the contract-bearing fields are copied byte-for-byte in value.
for (const key of ["title", "scriptSource", "thumbnail", "captionPreset", "bgm", "narration", "releaseGate"]) {
  if (JSON.stringify(project[key]) !== JSON.stringify(source[key])) throw new Error(`Contract field changed: ${key}`);
}
if (project.scenes.length !== source.scenes.length) throw new Error("Scene count changed");
for (let i = 0; i < source.scenes.length; i += 1) {
  if (project.scenes[i].captionAnchor !== source.scenes[i].captionAnchor) throw new Error(`Caption anchor changed at scene ${i + 1}`);
  if (baseline.scenes[i].captionAnchor !== source.scenes[i].captionAnchor) throw new Error(`Canonical caption anchor mismatch at scene ${i + 1}`);
  if (project.scenes[i].label !== source.scenes[i].label) throw new Error(`Disclosure label changed at scene ${i + 1}`);
  if (!project.scenes[i].asset.startsWith("assets/")) throw new Error(`Invalid asset path at scene ${i + 1}`);
}
fs.writeFileSync(targetPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`created ${targetPath}`);
