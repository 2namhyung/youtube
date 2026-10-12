import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, "production", "projects", "jeju-school-intrusion-short-v1");
const sourcePath = path.join(projectRoot, "project.json");
const targetPath = path.join(projectRoot, "project-v10-observational-v2.json");

if (fs.existsSync(targetPath)) {
  throw new Error(`Refusing to overwrite existing target: ${targetPath}`);
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const project = JSON.parse(JSON.stringify(source));
project.id = "jeju-school-intrusion-short-v10-observational-v2";
project.media = {
  ...(project.media || {}),
  sceneReplacements: {
    ...(project.media?.sceneReplacements || {}),
    "2": "assets/video/v10-observational-hq/scene-01-classroom-window.mp4",
    "4": "assets/video/v10-observational-hq/scene-02-school-exterior.mp4",
    "8": "assets/video/v10-observational-hq/scene-03-tumbler-rim-macro.mp4",
    "11": "assets/video/v10-observational-hq/scene-04-cctv-monitor-detail.mp4",
    "17": "assets/video/v10-observational-hq/scene-05-locked-door.mp4"
  }
};

fs.writeFileSync(targetPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`created ${targetPath}`);
