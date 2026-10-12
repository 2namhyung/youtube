export const compactCharacterCount = (text) => typeof text === 'string' ? text.replace(/\s/gu, '').length : 0;

export const voiceFrameCount = (seconds, fps) => Math.max(1, Math.ceil(seconds * fps));

export function provisionalCutTiming(cut, plan) {
  const compactCharacters = compactCharacterCount(cut?.draft_narration);
  const speechRate = plan?.draft_timing_assumption?.compact_korean_chars_per_second;
  const fps = plan?.fps;
  if (!(Number.isFinite(speechRate) && speechRate > 0 && Number.isInteger(fps) && fps > 0)) throw new Error('narration plan requires positive speech rate and fps');
  const voiceFrames = voiceFrameCount(compactCharacters / speechRate, fps);
  const durationFrames = voiceFrames + Number(cut?.pre_roll_frames ?? 0) + Number(cut?.post_hold_frames ?? 0);
  return {
    compactCharacters,
    voiceFrames,
    durationFrames,
    masterOccupancyFrames: Math.max(1, durationFrames - Number(cut?.transition_overlap_frames ?? 0)),
  };
}

