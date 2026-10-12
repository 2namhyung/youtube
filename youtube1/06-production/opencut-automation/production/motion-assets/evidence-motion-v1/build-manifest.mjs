import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/+([A-Za-z]):/, "$1:"));

const specs = [
  // HyperFrames catalog source snapshots. These are preserved verbatim. Their
  // HTML currently references CDN fonts/GSAP; the README marks them source-only
  // until those dependencies are vendored and pinned by the pipeline owner.
  ["hyperframes-data-chart", "sources/hyperframes/blocks/data-chart/data-chart.html", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/data-chart/data-chart.html", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "data-viz/chart", "NYT-style animated bar + line chart; replace data/CSS variables per evidence.", "html", "source-only; localize GSAP/fonts before deterministic render"],
  ["hyperframes-flowchart", "sources/hyperframes/blocks/flowchart/flowchart.html", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/flowchart/flowchart.html", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "diagram/flowchart", "Animated decision tree with SVG connectors and cursor/typing beats.", "html", "source-only; localize GSAP/fonts before deterministic render"],
  ["hyperframes-flash-through-white", "sources/hyperframes/blocks/flash-through-white/flash-through-white.html", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/flash-through-white/flash-through-white.html", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "transition/flash", "Four-second white-flash shader transition between evidence cards.", "html", "source-only; localize GSAP/fonts before deterministic render"],
  ["hyperframes-nyc-paris-flight", "sources/hyperframes/blocks/nyc-paris-flight/nyc-paris-flight.html", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/nyc-paris-flight/nyc-paris-flight.html", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "map/route", "Map route choreography; replace the illustrative map and labels with authority-bound geography.", "html", "source-only; localize GSAP before deterministic render"],
  ["hyperframes-nyc-paris-map", "sources/hyperframes/blocks/nyc-paris-flight/assets/map-nyc-paris.png", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/nyc-paris-flight/assets/map-nyc-paris.png", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "map/route-reference", "Illustrative map plate used by the route block; not evidence for Jeju geography.", "png", "replace with Natural Earth/authority map before publication"],
  ["hyperframes-nyc-paris-sfx", "sources/hyperframes/blocks/nyc-paris-flight/assets/sfx-mix.wav", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/nyc-paris-flight/assets/sfx-mix.wav", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "sfx/route", "Short route-animation sound mix; trim/duck under approved narration.", "wav", "source-only; loudness and cue alignment required"],
  ["hyperframes-caption-clip-wipe", "sources/hyperframes/components/caption-clip-wipe/caption-clip-wipe.html", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/components/caption-clip-wipe/caption-clip-wipe.html", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "captions/word-wipe", "Per-word clip-path reveal for Korean captions/lower-third emphasis.", "html", "source-only; localize GSAP/fonts before deterministic render"],
  ["hyperframes-yt-lower-third", "sources/hyperframes/blocks/yt-lower-third/yt-lower-third.html", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/yt-lower-third/yt-lower-third.html", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "lower-third/subscribe", "Reference lower-third timing; replace avatar/channel text with project-owned labels.", "html", "source-only; localize GSAP/fonts before deterministic render"],
  ["hyperframes-yt-avatar", "sources/hyperframes/blocks/yt-lower-third/assets/avatar.jpg", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/yt-lower-third/assets/avatar.jpg", "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", "Apache-2.0", "lower-third/avatar-reference", "Reference avatar only; do not ship as a project identity asset.", "jpg", "reference-only"],

  // Lucide individual SVGs. ISC permits commercial use and redistribution;
  // preserve the upstream license file alongside the icons.
  ["lucide-smartphone", "sources/lucide/icons/smartphone.svg", "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/smartphone.svg", "https://github.com/lucide-icons/lucide/blob/main/LICENSE", "ISC", "icon/phone", "Phone/device symbol for the 휴대전화 case; recolor with CSS/currentColor.", "svg", "direct SVG ingest; no runtime dependency"],
  ["lucide-map-pin", "sources/lucide/icons/map-pin.svg", "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/map-pin.svg", "https://github.com/lucide-icons/lucide/blob/main/LICENSE", "ISC", "icon/location", "Location marker for Jeju/map route annotations.", "svg", "direct SVG ingest; no runtime dependency"],
  ["lucide-hospital", "sources/lucide/icons/hospital.svg", "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/hospital.svg", "https://github.com/lucide-icons/lucide/blob/main/LICENSE", "ISC", "icon/hospital", "Hospital/clinic marker for the 간호조무사 workflow.", "svg", "direct SVG ingest; no runtime dependency"],
  ["lucide-activity", "sources/lucide/icons/activity.svg", "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/activity.svg", "https://github.com/lucide-icons/lucide/blob/main/LICENSE", "ISC", "icon/measurement", "Pulse/measurement accent for evidence-led charts.", "svg", "direct SVG ingest; no runtime dependency"],
  ["lucide-stethoscope", "sources/lucide/icons/stethoscope.svg", "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/stethoscope.svg", "https://github.com/lucide-icons/lucide/blob/main/LICENSE", "ISC", "icon/clinical", "Clinical role marker for nursing/health context.", "svg", "direct SVG ingest; no runtime dependency"],
  ["lucide-file-text", "sources/lucide/icons/file-text.svg", "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/file-text.svg", "https://github.com/lucide-icons/lucide/blob/main/LICENSE", "ISC", "icon/document", "Document/evidence card marker for source citations.", "svg", "direct SVG ingest; no runtime dependency"],
  ["lucide-clock-3", "sources/lucide/icons/clock-3.svg", "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/clock-3.svg", "https://github.com/lucide-icons/lucide/blob/main/LICENSE", "ISC", "icon/timeline", "Timeline/time cue marker for event chronology.", "svg", "direct SVG ingest; no runtime dependency"],

  // Natural Earth public-domain map extracts.
  ["natural-earth-110m-admin0-countries", "sources/natural-earth/ne_110m_admin_0_countries.zip", "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip", "https://www.naturalearthdata.com/about/terms-of-use/", "Public domain", "map/world-locator", "Small 1:110m country polygons for schematic world/South Korea locator maps.", "zip/shapefile", "unzip outside runtime; convert to a deterministic SVG/GeoJSON layer"],
  ["natural-earth-10m-coastline", "sources/natural-earth/ne_10m_coastline.zip", "https://naciscdn.org/naturalearth/10m/physical/ne_10m_coastline.zip", "https://www.naturalearthdata.com/about/terms-of-use/", "Public domain", "map/coastline", "Detailed coastline linework for a stylised Jeju locator (not a legal boundary source).", "zip/shapefile", "unzip/convert to path geometry before runtime"],

  // Two small Poly Haven CC0 diffuse plates. API metadata and hashes are kept
  // locally so future refreshes can be compared without trusting a URL alone.
  ["polyhaven-wood-floor-diffuse-1k", "sources/polyhaven/wood_floor_diff_1k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor/wood_floor_diff_1k.jpg", "https://polyhaven.com/license", "CC0", "texture/paper-grain", "Warm wood grain that can be desaturated/blurred as a documentary paper texture.", "jpg", "direct bitmap ingest; crop/grade deterministically"],
  ["polyhaven-concrete-floor-diffuse-1k", "sources/polyhaven/concrete_floor_01_diff_1k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_01/concrete_floor_01_diff_1k.jpg", "https://polyhaven.com/license", "CC0", "texture/concrete-grain", "Neutral concrete grain for restrained evidence-card backgrounds.", "jpg", "direct bitmap ingest; crop/grade deterministically"]
].map(([assetId, localPath, sourceUrl, licenseUrl, license, role, purpose, format, ingest]) => ({
  asset_id: assetId,
  local_path: localPath,
  source_url: sourceUrl,
  license_url: licenseUrl,
  license,
  role,
  purpose,
  format,
  ingest
}));

const catalogRecords = [
  ["hyperframes-registry-data-chart", "sources/hyperframes/registry-items/data-chart.registry-item.json", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/data-chart/registry-item.json"],
  ["hyperframes-registry-flowchart", "sources/hyperframes/registry-items/flowchart.registry-item.json", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/flowchart/registry-item.json"],
  ["hyperframes-registry-flash-through-white", "sources/hyperframes/registry-items/flash-through-white.registry-item.json", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/flash-through-white/registry-item.json"],
  ["hyperframes-registry-nyc-paris-flight", "sources/hyperframes/registry-items/nyc-paris-flight.registry-item.json", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/nyc-paris-flight/registry-item.json"],
  ["hyperframes-registry-yt-lower-third", "sources/hyperframes/registry-items/yt-lower-third.registry-item.json", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/blocks/yt-lower-third/registry-item.json"],
  ["hyperframes-registry-caption-clip-wipe", "sources/hyperframes/registry-items/caption-clip-wipe.registry-item.json", "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/components/caption-clip-wipe/registry-item.json"],
  ["polyhaven-wood-floor-files-api", "sources/polyhaven/wood_floor.files.json", "https://api.polyhaven.com/files/wood_floor"],
  ["polyhaven-concrete-files-api", "sources/polyhaven/concrete_floor_01.files.json", "https://api.polyhaven.com/files/concrete_floor_01"],
  ["polyhaven-assets-api-snapshot", "sources/polyhaven/assets.index.json", "https://api.polyhaven.com/assets"]
].map(([recordId, localPath, sourceUrl]) => ({ record_id: recordId, local_path: localPath, source_url: sourceUrl }));

const textExtensions = new Set([".html", ".json", ".svg", ".txt", ".md"]);
const hashFile = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  const bytes = fs.readFileSync(absolutePath);
  const stat = fs.lstatSync(absolutePath);
  const remoteUrls = textExtensions.has(path.extname(relativePath).toLowerCase())
    ? [...new Set((bytes.toString("utf8").match(/https?:\/\/[^"'\s<>)]+/g) ?? []))]
        .filter((url) => !url.startsWith("http://www.w3.org/"))
    : [];
  return {
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    nonsymlink: !stat.isSymbolicLink(),
    remote_urls_detected: remoteUrls
  };
};

const assets = specs.map((spec) => ({ ...spec, ...hashFile(spec.local_path) }));
const catalog = catalogRecords.map((record) => ({ ...record, ...hashFile(record.local_path) }));
if ([...assets, ...catalog].some((entry) => !entry.nonsymlink)) {
  throw new Error("Manifest refuses symlinked source files");
}

const manifest = {
  manifest_id: "evidence-motion-v1",
  schema_version: "motion-asset-manifest-v1",
  generated_by: "build-manifest.mjs",
  snapshot_date: "2026-08-12",
  source_policy: "free/open, no account or API key, direct official download; preserve exact bytes and license evidence",
  taxonomy: {
    motion: ["data-viz", "diagram", "transition", "captions", "lower-third"],
    evidence: ["map", "document", "timeline", "icon", "texture", "sfx"],
    case_roles: {
      jeju: ["map/world-locator", "map/coastline", "icon/location", "icon/timeline", "texture/paper-grain"],
      nurse_assistant: ["diagram/flowchart", "icon/hospital", "icon/clinical", "icon/measurement", "data-viz/chart"],
      mobile_phone: ["icon/phone", "icon/document", "captions/word-wipe", "transition/flash", "lower-third/subscribe"]
    }
  },
  assets,
  catalog_records: catalog,
  license_evidence: [
    { local_path: "sources/hyperframes/LICENSE", source_url: "https://github.com/heygen-com/hyperframes/blob/main/LICENSE", license: "Apache-2.0", ...hashFile("sources/hyperframes/LICENSE") },
    { local_path: "sources/lucide/LICENSE", source_url: "https://github.com/lucide-icons/lucide/blob/main/LICENSE", license: "ISC", ...hashFile("sources/lucide/LICENSE") },
    { local_path: "licenses/natural-earth-terms-of-use.html", source_url: "https://www.naturalearthdata.com/about/terms-of-use/", license: "Public domain", ...hashFile("licenses/natural-earth-terms-of-use.html") },
    { local_path: "licenses/polyhaven-license.html", source_url: "https://polyhaven.com/license", license: "CC0", ...hashFile("licenses/polyhaven-license.html") },
    { local_path: "licenses/polyhaven-api.html", source_url: "https://polyhaven.com/our-api", license: "API terms/attribution", ...hashFile("licenses/polyhaven-api.html") }
  ]
};

fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`wrote manifest.json (${assets.length} assets, ${catalog.length} catalog records)`);
