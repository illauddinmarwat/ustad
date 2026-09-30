-- Voice notes on job posts (docs/job-media-plan.md, Phase 2). The tables, caps (one voice note, 60 seconds,
-- 3 MB) and access rules already exist from Phase 1; the private bucket only accepted photos, so allow the
-- audio types the app records: AAC in .m4a (iOS and Android), 3GP and WebM (some Android devices and the web app).

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/3gpp', 'audio/webm'
]
where id = 'job-media';
