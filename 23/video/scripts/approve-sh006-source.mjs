import path from 'node:path';

import {approveSh006SourceComparison, SH006_MEDIA_ASSET_ID, SH006_REVIEW_QUEUE_ID} from '../../src/lib/sh006-source-approval.ts';

const result = await approveSh006SourceComparison({
  approvalMarkerPath: path.resolve('video/qa/episode-001-work-v01/source-lock/SH006/SH006-paired-statutory-text-contract.json'),
  mediaAssetId: SH006_MEDIA_ASSET_ID,
  expectedReviewQueueId: SH006_REVIEW_QUEUE_ID,
});

console.log(JSON.stringify(result, null, 2));
