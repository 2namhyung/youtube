// Directory versions identify a checkout, not the logical episode in its active manifest.
export function cutIdentityErrors({rootRelative,activeCutRoot,folderEpisodeName,folderShotName,manifestEpisodeId,manifestShotId,stateEpisodeId,specEpisodeId}) {
  const active = rootRelative === activeCutRoot;
  const errors = [];
  if (active && (stateEpisodeId !== 'episode-001' || specEpisodeId !== stateEpisodeId
    || !/^episode-001(?:-v\d+)?$/u.test(folderEpisodeName))) {
    errors.push('active cut root must bind the canonical episode-001 state/spec identity');
  }
  if (folderShotName !== undefined && (manifestEpisodeId !== (active ? stateEpisodeId : folderEpisodeName)
    || manifestShotId !== folderShotName)) errors.push('manifest episode_id/shot_id mismatch');
  return errors;
}
