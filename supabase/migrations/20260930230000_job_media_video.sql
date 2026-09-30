-- Short video on job posts (docs/job-media-plan.md, Phase 3). The table, caps (one video, 30 seconds, 25 MB)
-- and access rules exist from Phase 1; the private bucket only accepted photos and audio, so allow the video
-- types the app records: MP4 (Android and iOS), QuickTime .mov (iOS), 3GP and WebM (some devices and the web app).

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/3gpp', 'audio/webm',
  'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm'
]
where id = 'job-media';
