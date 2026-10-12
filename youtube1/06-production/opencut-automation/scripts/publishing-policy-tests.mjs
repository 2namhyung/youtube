import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquirePublishingClaim, assertThumbnailRetryBinding, findReusablePublishingJob, initialYoutubePrivacy, parsePublishingJobFile, persistUploadBeforeThumbnail } from '../opencut-classic/apps/web/src/newsroom/publishing-policy.ts';

const jobs = Array.from({ length: 13 }, (_, index) => ({
  id: `youtube-${String(index).padStart(16, '0')}`,
  idempotencyKey: index === 12 ? 'exact-old-key' : `key-${index}`,
  state: 'published',
}));
assert.equal(findReusablePublishingJob({ jobs, idempotencyKey: 'exact-old-key' })?.id, jobs[12].id, 'idempotency must include jobs older than the UI twelve-item window');
assert.equal(findReusablePublishingJob({ jobs: [{ idempotencyKey: 'retry', state: 'failed' }], idempotencyKey: 'retry' }), undefined, 'failed jobs remain retryable');
assert.equal(findReusablePublishingJob({ jobs: [{ idempotencyKey: 'gone', state: 'deleted' }], idempotencyKey: 'gone' }), undefined, 'deleted jobs cannot suppress a new upload');
assert.equal(parsePublishingJobFile('{partial'), null, 'malformed partial job files are ignored');
assert.equal(initialYoutubePrivacy(undefined), 'private');
assert.equal(initialYoutubePrivacy('private'), 'private');
assert.throws(() => initialYoutubePrivacy('unlisted'), /must start private/);
assert.throws(() => initialYoutubePrivacy('public'), /must start private/);

const validBinding = {
  job: { provider: 'youtube', state: 'processing', privacy: 'private', accountId: 'account', projectSlug: 'story-slug', versionId: 'v1', videoSha256: 'v'.repeat(64), platformId: 'video123' },
  audit: { status: 'approved', publishable: true, uploadBlocked: false, projectSlug: 'story-slug', versionId: 'v1', renderRegistrySha256: 'r'.repeat(64), renderSha256: 'v'.repeat(64), thumbnailSha256: 't'.repeat(64) },
  registry: { versionId: 'v1' },
  actual: { accountId: 'account', renderRegistrySha256: 'r'.repeat(64), renderSha256: 'v'.repeat(64), thumbnailSha256: 't'.repeat(64) },
};
assert.doesNotThrow(() => assertThumbnailRetryBinding(validBinding));
for (const mutation of [
  { job: { ...validBinding.job, state: 'deleted' } },
  { job: { ...validBinding.job, privacy: 'public' } },
  { audit: { ...validBinding.audit, versionId: 'stale' } },
  { actual: { ...validBinding.actual, thumbnailSha256: 'x'.repeat(64) } },
]) assert.throws(() => assertThumbnailRetryBinding({ ...validBinding, ...mutation }));

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'publishing-policy-'));
try {
  const claimPath = path.join(temp, 'same.claim');
  let persisted = null;
  let remoteVideoPuts = 0;
  const upload = async () => {
    const claim = await acquirePublishingClaim({ claimPath, readExisting: async () => persisted });
    if (!claim.acquired) return claim.existing;
    try {
      remoteVideoPuts += 1;
      persisted = { id: 'job', platformId: 'remote-video', state: 'processing' };
      await new Promise((resolve) => setTimeout(resolve, 40));
      return persisted;
    } finally { await claim.release(); }
  };
  const concurrent = await Promise.all([upload(), upload()]);
  assert.equal(remoteVideoPuts, 1, 'concurrent identical requests must PUT video once');
  assert.equal(concurrent[0].platformId, concurrent[1].platformId);

  let savedPlatformId = null;
  const finalized = await persistUploadBeforeThumbnail({ platformId: 'remote-video', persistUploaded: async (id) => { savedPlatformId = id; }, uploadThumbnail: async () => { throw new Error('thumbnail boom'); } });
  assert.equal(savedPlatformId, 'remote-video', 'platform ID must persist before thumbnail work');
  assert.equal(finalized.platformId, 'remote-video');
  assert.match(finalized.thumbnailWarning, /thumbnail boom/);
} finally { await fs.rm(temp, { recursive: true, force: true }); }

console.log('publishing policy tests passed (13th/malformed/deleted, exact retry binding, concurrent claim, post-upload thumbnail failure, private-first)');
