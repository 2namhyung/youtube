import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/+([A-Za-z]):/, "$1:"));
const rel = (p) => p.split(path.sep).join("/");
const textExt = new Set([".html", ".json", ".js", ".mjs", ".tsx", ".md", ".css", ".svg", ".txt", ".xml"]);

const motionCanvasOriginal = {
  "example.tsx": "packages/create/template-2d-ts/src/scenes/example.tsx",
  "2023-04-06-example-cubic.tsx": "packages/docs/blog/2023-04-06-example-cubic.tsx",
  "2023-04-06-example-quadratic.tsx": "packages/docs/blog/2023-04-06-example-quadratic.tsx",
  "2023-05-08-cardinal.tsx": "packages/docs/blog/2023-05-08-cardinal.tsx",
  "2023-07-23-curve.tsx": "packages/docs/blog/2023-07-23-curve.tsx",
  "2023-07-23-path.tsx": "packages/docs/blog/2023-07-23-path.tsx",
  "2023-10-14-skew.tsx": "packages/docs/blog/2023-10-14-skew.tsx",
  "2023-12-31-line.tsx": "packages/docs/blog/2023-12-31-line.tsx",
  "2023-12-31-spawner.tsx": "packages/docs/blog/2023-12-31-spawner.tsx",
  "2023-12-31-txt.tsx": "packages/docs/blog/2023-12-31-txt.tsx",
  "2024-02-04-shaders.tsx": "packages/docs/blog/2024-02-04-shaders.tsx",
  "2024-05-16-camera.tsx": "packages/docs/blog/2024-05-16-camera.tsx",
  "2024-03-21-loop.tsx": "packages/docs/blog/2024-03-21-loop.tsx",
  "2024-05-16-effects.tsx": "packages/docs/blog/2024-05-16-effects.tsx",
  "2024-05-16-vectors.tsx": "packages/docs/blog/2024-05-16-vectors.tsx"
};

const lottieOriginal = {
  "adrock.json": "test/animations/adrock.json",
  "bacon.json": "test/animations/bacon.json",
  "banner.json": "test/animations/banner.json",
  "dalek.json": "test/animations/dalek.json",
  "lights.json": "test/animations/lights.json",
  "monster.json": "test/animations/monster.json",
  "ripple.json": "test/animations/ripple.json",
  "starfish.json": "test/animations/starfish.json"
};

const dotlottieOriginal = {
  "sample.json": "fixtures/lottie/sample.json",
  "focal_test.json": "fixtures/lottie/focal_test.json",
  "markers_example.json": "fixtures/markers_example.json",
  "test.json": "fixtures/test.json"
};

const iconRole = (name) => {
  if (/phone|smartphone|device-mobile/i.test(name)) return "icon/phone";
  if (/map-pin|location/i.test(name)) return "icon/location";
  if (/hospital|stethoscope|activity|heartbeat/i.test(name)) return "icon/clinical";
  if (/document|file|book-stack|newspaper|article/i.test(name)) return "icon/document";
  if (/clock|timeline|calendar/i.test(name)) return "icon/timeline";
  if (/network|community|users|constellation|git-branch/i.test(name)) return "icon/network";
  if (/shield|warning|alert|check/i.test(name)) return "icon/verification";
  if (/camera|microphone|media|video/i.test(name)) return "icon/media";
  return "icon/editorial";
};

const sourceInfo = (p) => {
  const file = path.posix.basename(p);
  if (p.startsWith("iconoir/icons/")) return { source_url: `https://raw.githubusercontent.com/iconoir-icons/iconoir/main/icons/regular/${file}`, license: "MIT", license_url: "https://github.com/iconoir-icons/iconoir/blob/main/LICENSE" };
  if (p === "iconoir/LICENSE") return { source_url: "https://raw.githubusercontent.com/iconoir-icons/iconoir/main/LICENSE", license: "MIT", license_url: "https://github.com/iconoir-icons/iconoir/blob/main/LICENSE" };
  if (p.startsWith("tabler/icons/outline/")) return { source_url: `https://raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/${file}`, license: "MIT", license_url: "https://github.com/tabler/tabler-icons/blob/main/LICENSE" };
  if (p === "tabler/LICENSE") return { source_url: "https://raw.githubusercontent.com/tabler/tabler-icons/main/LICENSE", license: "MIT", license_url: "https://github.com/tabler/tabler-icons/blob/main/LICENSE" };
  if (p.startsWith("phosphor/icons/regular/")) return { source_url: `https://raw.githubusercontent.com/phosphor-icons/core/main/assets/regular/${file}`, license: "MIT", license_url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" };
  if (p === "phosphor/LICENSE") return { source_url: "https://raw.githubusercontent.com/phosphor-icons/core/main/LICENSE", license: "MIT", license_url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" };
  if (p.startsWith("fonts/noto-sans-kr/")) return { source_url: "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf", license: "OFL-1.1", license_url: "https://github.com/googlefonts/noto-cjk/blob/main/Sans/LICENSE" };
  if (p.startsWith("fonts/pretendard/")) return { source_url: `https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/public/static/alternative/${file}`, license: "OFL-1.1", license_url: "https://github.com/orioncactus/pretendard/blob/main/LICENSE" };
  if (p.startsWith("motion-canvas/examples/")) return { source_url: `https://raw.githubusercontent.com/motion-canvas/motion-canvas/main/${motionCanvasOriginal[file] ?? file}`, license: "MIT", license_url: "https://github.com/motion-canvas/motion-canvas/blob/main/LICENSE" };
  if (p === "motion-canvas/LICENSE") return { source_url: "https://raw.githubusercontent.com/motion-canvas/motion-canvas/main/LICENSE", license: "MIT", license_url: "https://github.com/motion-canvas/motion-canvas/blob/main/LICENSE" };
  if (p.startsWith("d3/")) {
    const [pkg, local] = p.split("/").slice(1);
    if (local === "LICENSE" || local === "README.md") return { source_url: `https://raw.githubusercontent.com/d3/${pkg}/main/${local}`, license: "ISC", license_url: `https://github.com/d3/${pkg}/blob/main/LICENSE` };
    const src = local.replace(/^curve__/, "curve/");
    return { source_url: `https://raw.githubusercontent.com/d3/${pkg}/main/src/${src}`, license: "ISC", license_url: `https://github.com/d3/${pkg}/blob/main/LICENSE` };
  }
  if (p.startsWith("lottie-web/samples/")) return { source_url: `https://raw.githubusercontent.com/airbnb/lottie-web/master/test/animations/${lottieOriginal[file] ?? file}`, license: "MIT (repository sample; source-only)", license_url: "https://github.com/airbnb/lottie-web/blob/master/LICENSE.md" };
  if (p === "lottie-web/LICENSE.md") return { source_url: "https://raw.githubusercontent.com/airbnb/lottie-web/master/LICENSE.md", license: "MIT", license_url: "https://github.com/airbnb/lottie-web/blob/master/LICENSE.md" };
  if (p.startsWith("dotlottie-web/fixtures/")) return { source_url: `https://raw.githubusercontent.com/LottieFiles/dotlottie-web/main/${dotlottieOriginal[file] ?? file}`, license: "MIT (repository fixture; source-only)", license_url: "https://github.com/LottieFiles/dotlottie-web/blob/main/LICENSE" };
  if (p === "dotlottie-web/LICENSE") return { source_url: "https://raw.githubusercontent.com/LottieFiles/dotlottie-web/main/LICENSE", license: "MIT", license_url: "https://github.com/LottieFiles/dotlottie-web/blob/main/LICENSE" };
  if (p.startsWith("hyperframes-v2/")) {
    const [, typ, name, ...tail] = p.split("/");
    const remoteTail = tail[0]?.endsWith(".woff2") ? ["assets", "fonts", tail[0]] : tail;
    if (tail[0]?.endsWith(".woff2")) return { source_url: `https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/${typ}/${name}/${remoteTail.join("/")}`, license: "OFL-1.1", license_url: "https://github.com/jpt/barlow/blob/main/OFL.txt" };
    return { source_url: `https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/${typ}/${name}/${remoteTail.join("/")}`, license: "Apache-2.0", license_url: "https://github.com/heygen-com/hyperframes/blob/main/LICENSE" };
  }
  if (p === "gsap/gsap.js" || p === "gsap/gsap.min.js") return { source_url: `https://raw.githubusercontent.com/greensock/GSAP/master/dist/${file}`, license: "GSAP standard no-charge license", license_url: "https://gsap.com/standard-license" };
  if (p === "gsap/package.json" || p === "gsap/README.md") return { source_url: `https://raw.githubusercontent.com/greensock/GSAP/master/${file === "package.json" ? "package.json" : "README.md"}`, license: "GSAP standard no-charge license", license_url: "https://gsap.com/standard-license" };
  if (p.startsWith("topojson/world-atlas-2/")) return { source_url: `https://cdn.jsdelivr.net/npm/world-atlas@2/${file}`, license: "ISC", license_url: "https://github.com/topojson/world-atlas/blob/master/LICENSE" };
  if (p.startsWith("topojson/us-atlas-3/")) return { source_url: `https://cdn.jsdelivr.net/npm/us-atlas@3/${file}`, license: "ISC", license_url: "https://github.com/topojson/us-atlas/blob/master/LICENSE" };
  if (p === "topojson/runtime/d3-7.min.js") return { source_url: "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js", license: "ISC", license_url: "https://github.com/d3/d3/blob/main/LICENSE" };
  if (p === "topojson/runtime/topojson-client-3.1.0.min.js") return { source_url: "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js", license: "ISC", license_url: "https://github.com/topojson/topojson-client/blob/master/LICENSE" };
  if (p.startsWith("nara/")) {
    const naraSource = file === "constitution_transcript.html"
      ? "https://www.archives.gov/founding-docs/constitution-transcript"
      : file === "constitution_page1_630.jpg"
        ? "https://www.archives.gov/files/founding-docs/constitution_1_of_4_630.jpg"
        : file === "declaration_630.jpg"
          ? "https://www.archives.gov/files/founding-docs/declaration_of_independence_630.jpg"
          : file === "bill_of_rights_630.jpg"
        ? "https://www.archives.gov/files/founding-docs/downloads/Bill_of_Rights_Pg1of1_AC.jpg"
        : `https://www.archives.gov/files/founding-docs/${file}`;
    return { source_url: naraSource, license: "Public domain (credit NARA)", license_url: "https://www.archives.gov/founding-docs/downloads" };
  }
  if (p.startsWith("sfx/")) {
    const source = file.startsWith("contact") ? "https://commons.wikimedia.org/wiki/Special:FilePath/Contact_type_(1).ogg" : file.startsWith("teleprinter") ? "https://commons.wikimedia.org/wiki/Special:FilePath/WWS_Teleprintertyping.ogg" : "https://commons.wikimedia.org/wiki/Special:FilePath/Pocket_camera_start_and_shut_down.ogg";
    const license = file.includes("cc-by") ? "CC-BY-4.0" : "Public domain";
    return { source_url: source, license, license_url: file.includes("cc-by") ? "https://commons.wikimedia.org/wiki/File:WWS_Teleprintertyping.ogg" : file.startsWith("contact") ? "https://commons.wikimedia.org/wiki/File:Contact_type_(1).ogg" : "https://commons.wikimedia.org/wiki/File:Pocket_camera_start_and_shut_down.ogg" };
  }
  return { source_url: "", license: "See adjacent license evidence", license_url: "" };
};

const roleFor = (p) => {
  const file = path.posix.basename(p);
  if (/^(iconoir|tabler|phosphor)\//.test(p)) return iconRole(file);
  if (p.startsWith("fonts/noto")) return "typography/korean-noto";
  if (p.startsWith("fonts/pretendard")) return "typography/korean-news";
  if (p.startsWith("motion-canvas/")) return "motion/examples";
  if (p.startsWith("d3/")) return "data-viz/component-source";
  if (p.startsWith("lottie-web/") || p.startsWith("dotlottie-web/")) return "motion/lottie-sample";
  if (p.startsWith("hyperframes-v2/")) {
    if (/code-diff/.test(p)) return "document-forensics/code-diff";
    if (/comparison-split/.test(p)) return "legal/comparison";
    if (/beat-timeline/.test(p)) return "investigation/timeline";
    if (/constellation-hub/.test(p)) return "relationship/network";
    if (/lower-third|lt-clean|lt-mask/.test(p)) return "news/lower-third";
    if (/news-ticker/.test(p)) return "news/ticker";
    if (/world-map|us-map/.test(p)) return "map/route";
    if (/chart-story/.test(p)) return "data-viz/story";
    if (/flowchart/.test(p)) return "diagram/vertical-flow";
    if (/marker-highlight|caption/.test(p)) return "document/annotation";
    if (/wipe|headline/.test(p)) return "transition/editorial";
    return "motion/catalog-source";
  }
  if (p.startsWith("gsap/")) return "motion/gsap-runtime";
  if (p.startsWith("topojson/")) return "map/topojson-runtime";
  if (p.startsWith("nara/")) return "document/public-domain-reference";
  if (p.startsWith("sfx/")) return "sfx/documentary";
  return "asset/uncategorized";
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const absolute = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(absolute) : [absolute];
});

const inspect = (absolute) => {
  const bytes = fs.readFileSync(absolute);
  const stat = fs.lstatSync(absolute);
  const relative = rel(path.relative(path.join(root, "sources"), absolute));
  const p = relative;
  const urls = textExt.has(path.extname(p).toLowerCase())
    ? [...new Set((bytes.toString("utf8").match(/https?:\/\/[^"'\s<>)]+/g) ?? []))].filter((u) => !u.startsWith("http://www.w3.org/"))
    : [];
  const source = sourceInfo(p);
  const extension = path.extname(p).slice(1).toLowerCase();
  const editable = new Set(["svg", "html", "json", "js", "tsx", "mjs", "css"]).has(extension);
  const direct = source.license && source.source_url && urls.length === 0 && !p.includes("registry-item.json") && !p.endsWith("LICENSE") && !p.endsWith("LICENSE.md");
  return {
    asset_id: p.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase(),
    local_path: `sources/${p}`,
    source_url: source.source_url,
    license_url: source.license_url,
    license: source.license,
    role: roleFor(p),
    format: extension || "binary",
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    nonsymlink: !stat.isSymbolicLink(),
    editable,
    remote_dependency: urls.length > 0,
    remote_urls_detected: urls,
    admission: direct ? "direct-source" : "source-only",
    ingest: editable ? "vendor/localize and render through deterministic frame-seek adapter" : "read exact bytes; transcode/convert only with a recorded derivative hash"
  };
};

const assets = walk(path.join(root, "sources")).map(inspect).sort((a, b) => a.local_path.localeCompare(b.local_path));
if (assets.some((a) => !a.nonsymlink)) throw new Error("Refusing symlinked source");

const licenseFiles = walk(path.join(root, "licenses")).map((absolute) => {
  const p = rel(path.relative(root, absolute));
  const bytes = fs.readFileSync(absolute);
  return { local_path: p, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), nonsymlink: !fs.lstatSync(absolute).isSymbolicLink() };
}).sort((a, b) => a.local_path.localeCompare(b.local_path));

const queue = JSON.parse(fs.readFileSync(path.join(root, "queue/acquisition-queue.json"), "utf8"));
const manifest = {
  manifest_id: "evidence-motion-v2",
  schema_version: "motion-asset-manifest-v2",
  generated_by: "build-manifest.mjs",
  snapshot_date: "2026-08-12",
  source_policy: "account-free direct downloads with explicit permissive/public-domain terms; source-only code is never executed",
  taxonomy: {
    document_forensics: ["document/public-domain-reference", "document-forensics/code-diff", "document/annotation"],
    investigations: ["investigation/timeline", "relationship/network", "legal/comparison"],
    broadcast: ["news/lower-third", "news/ticker", "captions", "transition/editorial"],
    maps: ["map/route", "map/topojson-runtime"],
    typography: ["typography/korean-noto", "typography/korean-news"],
    sound: ["sfx/documentary"]
  },
  case_roles: {
    jeju: ["map/route", "icon/location", "icon/timeline", "typography/korean-news"],
    nurse_assistant: ["diagram/vertical-flow", "relationship/network", "icon/clinical", "data-viz/story"],
    mobile_phone: ["document-forensics/code-diff", "legal/comparison", "icon/phone", "news/lower-third", "sfx/documentary"]
  },
  assets,
  license_evidence: licenseFiles,
  deferred_queue: queue.items
};

fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`wrote manifest.json (${assets.length} assets, ${licenseFiles.length} license captures, ${queue.items.length} deferred queue items)`);
