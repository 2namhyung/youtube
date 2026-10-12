import type {AnyCutManifest, CutManifest, SharedElementFallback, SharedElementTransition} from '../cut-manifest';
import type {CutAssetSheet} from '../vox/scene/asset-sheet';

type TimelineTransitionContract = {
  type: 'scene-to-scene' | 'morph';
  operator_id: 'scene.crossfade@1' | 'scene.scale-crossfade@1' | 'scene.shared-element@1';
  duration_frames: number;
  continuity: CutManifest['transition']['continuity'];
  fallback?: SharedElementFallback | null;
  shared_element?: SharedElementTransition | null;
};

export type RenderAuthorityCatalog = {
  episode_id: string; fps: number; width: number; height: number; total_frames: number;
  authority_root: string | null; status?: string; production_authority?: boolean; scene_runtime_sha256: string; transition_runtime_sha256: string; manifest_set_sha256: string; asset_sheet_set_sha256: string; render_input_set_sha256: string;
  asset_sheet_schema: {path: string; sha256: string};
  cuts: Array<{shot_id: string; manifest_path: string; manifest_sha256: string; asset_bundle_sha256: string; asset_sheet_path: string; asset_sheet_sha256: string; asset_sheet: CutAssetSheet; manifest: AnyCutManifest; cut_base_path: string; start_frame: number; duration_frames: number}>;
  boundaries: Array<{boundary_id: string; outgoing_shot_id: string; incoming_shot_id: string; start_frame: number; duration_frames: number; transition_contract_sha256: string; transition: TimelineTransitionContract}>;
  compositions: Array<{composition_id: string; kind: string; shot_id?: string; boundary_id?: string; window_start_frame: number; duration_frames: number}>;
};

export const renderAuthorityCatalog = {
  "_generated": {
    "do_not_edit": true,
    "source": "production-state.render_authority",
    "source_spec_sha256": "c5947f537d8d700483210883da0e957dd34e0bf1038d9139e3ce1331aebbe9b3",
    "generator": "video/scripts/generate-render-catalog.mjs"
  },
  "schema_version": 2,
  "status": "blocked-source-search-no-render-authority",
  "production_authority": false,
  "episode_id": "episode-001",
  "authority_root": null,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "scene_runtime_sha256": "e8af4efc1efa109b2786929c1748cf50a803bd83a88b157a12b8a5c9ea5e462c",
  "transition_runtime_sha256": "c2f9487c23c1cac385e647d385419d5811020b1809d9dec30c4a9fbabb5a5df4",
  "manifest_set_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "asset_sheet_set_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "treatment_contract_set_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "render_input_set_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "asset_sheet_schema": {
    "path": "video/contracts/asset-sheet.schema.json",
    "sha256": "9eadc230d83b1bd953a97956315c3e9ef59be734fdd62da9dd04a73a02477564"
  },
  "total_frames": 0,
  "cuts": [],
  "boundaries": [],
  "compositions": []
} as unknown as RenderAuthorityCatalog;
