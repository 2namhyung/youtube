import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, "production", "projects", "jeju-school-intrusion-short-v1");
const sourcePath = path.join(projectRoot, "project.json");
const targetPath = path.join(projectRoot, "project-v10-observational-v3.json");
const replacements = {
  "1": "assets/video/v10-observational-hq/scene-01-classroom-window.mp4",
  "3": "assets/video/v10-observational-hq/scene-02-school-exterior.mp4",
  "7": "assets/video/v10-observational-hq/scene-03-tumbler-rim-macro.mp4",
  "10": "assets/video/v10-observational-hq/scene-04-cctv-monitor-detail.mp4",
  "16": "assets/video/v10-observational-hq/scene-05-locked-door.mp4"
};

if (fs.existsSync(targetPath)) throw new Error(`Refusing to overwrite existing target: ${targetPath}`);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const project = JSON.parse(JSON.stringify(source));

const expectedV9Motion = [
  [1, "assets/video/v9-source-grounded-hybrid-hq/01-classroom-window.mp4"],
  [3, "assets/video/v9-source-grounded-hybrid-hq/02-school-exterior.mp4"],
  [7, "assets/video/v9-source-grounded-hybrid-hq/03-tumbler-rim.mp4"],
  [10, "assets/video/v9-source-grounded-hybrid-hq/04-cctv-monitor.mp4"],
  [16, "assets/video/v9-source-grounded-hybrid-hq/05-locked-door.mp4"]
];
for (const [index, expectedAsset] of expectedV9Motion) {
  if (project.scenes[index]?.asset !== expectedAsset) {
    throw new Error(`Unexpected v9 source asset at scene ${index}: ${project.scenes[index]?.asset}`);
  }
}
for (const key of Object.keys(replacements)) {
  if (!project.scenes[Number(key)]?.asset) throw new Error(`Missing targeted original scene ${key}`);
}

project.id = "jeju-school-intrusion-short-v10-observational-v3";
project.media = {
  ...(project.media || {}),
  sceneReplacements: { ...(project.media?.sceneReplacements || {}), ...replacements }
};
fs.writeFileSync(targetPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`created ${targetPath}`);
