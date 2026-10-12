import React from 'react';
import {AbsoluteFill} from 'remotion';

import type {AnyCutManifest} from '../../cut-manifest';
import {ManifestScene} from './ManifestScene';
import {previewFrames} from './model';

export type ManifestPreviewProps = {
  manifest: AnyCutManifest | null;
  cutBasePath: string;
  inputFingerprint?: string;
  previewFrame?: number;
};

const MissingProps = () => <AbsoluteFill style={{background: '#f2ead8', color: '#302a24', display: 'grid', placeItems: 'center', fontFamily: 'Arial, sans-serif', fontSize: 34}}>manifest props required</AbsoluteFill>;

export function ManifestCutProvisionalStill({manifest, cutBasePath, previewFrame}: ManifestPreviewProps) {
  if (!manifest) return <MissingProps />;
  return <ManifestScene manifest={manifest} cutBasePath={cutBasePath} frameOverride={previewFrame ?? previewFrames(manifest).final} />;
}

export function ManifestCutContactSheet({manifest, cutBasePath, inputFingerprint = ''}: ManifestPreviewProps) {
  if (!manifest) return <MissingProps />;
  const reviewStatus = manifest.schema_version === 1 ? manifest.review?.status ?? 'pending' : manifest.approvals.playable_cut.status;
  const frames = previewFrames(manifest);
  const samples = [
    {label: 'BACKGROUND ONLY', frame: frames.background},
    {label: 'REVEAL', frame: frames.reveal},
    {label: 'FINAL HOLD', frame: frames.final},
  ];
  return <AbsoluteFill style={{background: '#211e1a', color: '#fffaf0', fontFamily: 'Arial, "Noto Sans KR", sans-serif', padding: 52}}>
    <div style={{fontSize: 35, fontWeight: 900}}>{manifest.episode_id} · {manifest.shot_id} · {manifest.production_mode}</div>
    <div style={{fontSize: 18, color: '#cfc2aa', marginTop: 8}}>{manifest.schema_version === 1 ? 'legacy' : manifest.review_profile} · review {reviewStatus} · bundle {inputFingerprint.slice(0, 20) || 'unlocked'}</div>
    <div style={{display: 'flex', gap: 28, marginTop: 48}}>
      {samples.map((sample) => <div key={sample.label} style={{width: 586}}>
        <div style={{height: 330, overflow: 'hidden', background: '#f2ead8', border: '2px solid #655d52', position: 'relative'}}>
          <div style={{position: 'absolute', width: 1920, height: 1080, transform: 'scale(0.3052)', transformOrigin: 'top left'}}><ManifestScene manifest={manifest} cutBasePath={cutBasePath} frameOverride={sample.frame} /></div>
        </div>
        <div style={{fontSize: 20, fontWeight: 800, marginTop: 15}}>{sample.label} · F{sample.frame}</div>
      </div>)}
    </div>
    <div style={{fontSize: 17, color: '#cfc2aa', marginTop: 35}}>sources: {manifest.source_ids.join(' · ') || 'none'} · duration authority: manifest {manifest.duration_frames}f @ {manifest.fps}fps</div>
  </AbsoluteFill>;
}
