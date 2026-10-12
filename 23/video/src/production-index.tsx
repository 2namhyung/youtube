import {Composition, registerRoot} from 'remotion';

import {renderAuthorityCatalog} from './generated/render-authority-catalog';
import productionState from '../episodes/episode-001/production-state.json';
import {EpisodeTimeline} from './vox/scene/EpisodeTimeline';

const timelineCuts = renderAuthorityCatalog.cuts.map((cut) => ({
  shotId: cut.shot_id,
  manifest: cut.manifest,
  cutBasePath: cut.cut_base_path,
  assetSheet: cut.asset_sheet,
  startFrame: cut.start_frame,
  durationFrames: cut.duration_frames,
}));

const timelineBoundaries = renderAuthorityCatalog.boundaries.map((boundary) => ({
  boundaryId: boundary.boundary_id,
  outgoingShotId: boundary.outgoing_shot_id,
  incomingShotId: boundary.incoming_shot_id,
  startFrame: boundary.start_frame,
  durationFrames: boundary.duration_frames,
  transition: boundary.transition,
}));

const AuthorityTimeline = ({windowStartFrame, debugVisualization, treatmentMode, treatmentProtectionIsolation, suppressBoundaries}: {windowStartFrame: number; debugVisualization?: 'depth-occlusion'; treatmentMode?: 'enabled' | 'disabled'; treatmentProtectionIsolation?: boolean; suppressBoundaries?: boolean}) => <EpisodeTimeline cuts={timelineCuts} boundaries={timelineBoundaries} windowStartFrame={windowStartFrame} debugVisualization={debugVisualization} treatmentMode={treatmentMode} treatmentProtectionIsolation={treatmentProtectionIsolation} suppressBoundaries={suppressBoundaries} />;

export const ProductionRoot = () => !productionState.render_authority.cut_root
  || productionState.render_authority.cut_root !== renderAuthorityCatalog.authority_root ? null : <>
  {renderAuthorityCatalog.compositions.map((composition) => <Composition
    key={composition.composition_id}
    id={composition.composition_id}
    component={AuthorityTimeline}
    durationInFrames={composition.duration_frames}
    fps={renderAuthorityCatalog.fps}
    width={renderAuthorityCatalog.width}
    height={renderAuthorityCatalog.height}
    defaultProps={{windowStartFrame: composition.window_start_frame, treatmentMode: 'enabled' as const}}
  />)}
</>;

registerRoot(ProductionRoot);
