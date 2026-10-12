export type AssetLayerRole = 'structure' | 'midground' | 'subject' | 'foreground' | 'overlay';
export type AssetSafeAreaPolicy = 'essential' | 'overlay' | 'edge-to-edge';
export type TreatmentPolicy = {
  mode: 'eligible' | 'untreated' | 'protected-alpha-core' | 'protected-system-render-order';
  operator_ids: Array<'grain.overlay@1'>;
  protection_mask?: 'component-alpha-core' | 'system-render-order';
};

export type CutAssetSheet = {
  schema_version: 1;
  contract_kind: 'spatial-implementation-contract';
  shot_id: string;
  layout_binding: 'manifest-component-layout';
  canvas: {width: 1920; height: 1080};
  safe_areas: Record<'essential' | 'overlay', {left: number; top: number; right: number; bottom: number}>;
  background: {asset_binding: 'manifest.background'; layer_role: 'background'; depth: number; anchor: string; safe_area_policy: 'edge-to-edge'; treatment: TreatmentPolicy};
  layers: Array<{component_id: string; asset_id: string | null; layer_role: AssetLayerRole; depth: number; anchor: string; safe_area_policy: AssetSafeAreaPolicy; occludes: string[]; occluded_by: string[]; treatment: TreatmentPolicy}>;
  system_layers: Array<{system_id: 'target-labels' | 'source-chrome'; layer_role: 'overlay'; depth: number; anchor: string; safe_area_policy: 'overlay'; treatment: TreatmentPolicy}>;
  provenance: {authoring: string; basis: string; status: 'provisional-review-only'};
};

export const componentLayer = (sheet: CutAssetSheet | undefined, componentId: string) => sheet?.layers.find((layer) => layer.component_id === componentId);
export const componentDepth = (sheet: CutAssetSheet | undefined, componentId: string, fallback = 50) => componentLayer(sheet, componentId)?.depth ?? fallback;
export const systemDepth = (sheet: CutAssetSheet | undefined, systemId: 'target-labels' | 'source-chrome', fallback: number) => sheet?.system_layers.find((layer) => layer.system_id === systemId)?.depth ?? fallback;
