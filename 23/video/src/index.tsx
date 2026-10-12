import {registerRoot} from 'remotion';

// EP001 has no active render composition while production-state.active_cut_root is null.
// Historical rejected roots remain on disk but are intentionally excluded from runtime.
export const RemotionRoot = () => null;

registerRoot(RemotionRoot);
