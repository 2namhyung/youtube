# Platform publishing contract

Public publishing is fail-closed. A file may be uploaded only when the Stage 07 report for the exact `versionId`, render hash and script hash is approved. Upload success is not inferred from an HTTP 2xx response; processing or moderation status must be polled and the platform post ID must be persisted.

## Shared job states

`draft -> consented -> uploading -> processing -> published | failed | deleted`

Each job stores a local idempotency key derived from the video hash, metadata hash, platform and account. Tokens stay server-side in an encrypted secret store. The browser receives neither refresh tokens nor client secrets.

The implementation lives in `06-production/opencut-automation/opencut-classic/apps/web/src/newsroom/publishing-server.ts`. OAuth tokens are encrypted with AES-256-GCM under `08-upload-delivery/runtime/connections`, and that entire runtime directory is ignored by Git. OAuth state is single-use and expires after ten minutes.

## Required provider adapters

- YouTube: OAuth `youtube.upload`, resumable session, `videos.list(processingDetails)` polling, and a separately verified thumbnail request. Every upload starts private. Caption upload is not implemented yet; the editable handoff remains the caption source until an authenticated adapter or manual upload is completed.
- TikTok: query `creator_info` immediately before publishing; require editable title, manual privacy selection, unchecked interaction toggles, commercial/AIGC disclosure and explicit consent. Persist `publish_id` and poll or receive webhooks.
- Instagram: professional accounts only. Create a Reels container from an accessible signed media URL, poll `status_code=FINISHED`, then call `media_publish`. Persist both container and media IDs.
- Daum/KakaoTV: no documented public creator upload API. Keep the adapter disabled and provide a manual export checklist; do not browser-automate posting.

## Connection setup

Copy `publishing.env.example` values into the web app's ignored `.env.local`; never enter secrets in the browser or commit them.

- YouTube: enable YouTube Data API v3, create a Web OAuth client and register `/api/newsroom/projects/jeju-school-intrusion/publishing/oauth/youtube/callback`. The app requests `youtube.upload`, `youtube.readonly` and `youtube.force-ssl`; the last scope enables exact metadata repair after upload. Keep `YOUTUBE_APP_AUDITED=false` until Google has approved public API uploads. Existing connections must be reauthorized once after this scope change.
- TikTok: add Login Kit and Content Posting API, request `user.info.basic` and `video.publish`, then register the exact static HTTPS callback `/api/newsroom/projects/jeju-school-intrusion/publishing/oauth/tiktok/callback`. TikTok does not accept an HTTP localhost callback for the Web flow.

The Stage 08 composer requires four explicit confirmations for the exact Stage 07 version before it sends bytes. YouTube receives `containsSyntheticMedia=true` and `privacyStatus=private`; TikTok receives `is_aigc=true`. Uploads are idempotent across the complete local job inventory for the same video, metadata, provider and account, and provider processing status is polled on refresh. Public/delete maintenance requires an exact local job ID and a separate confirmation flag.

Open-source repositories can inform adapter structure, but platform behavior and permissions must follow the current official API documentation recorded in `platforms.json`.
