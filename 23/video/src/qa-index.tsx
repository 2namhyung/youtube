import {registerRoot, Still} from 'remotion';

import {ManifestCutContactSheet, ManifestCutProvisionalStill} from './vox';

const manifestPreviewDefaults = {manifest: null, cutBasePath: '', inputFingerprint: '', previewFrame: 0};

export const RemotionQaRoot = () => <>
  <Still id="ManifestCutContactSheetProvisional" component={ManifestCutContactSheet} width={1920} height={1080} defaultProps={manifestPreviewDefaults} />
  <Still id="ManifestCutProvisionalStill" component={ManifestCutProvisionalStill} width={1920} height={1080} defaultProps={manifestPreviewDefaults} />
</>;

registerRoot(RemotionQaRoot);

