-- Turn on photos, voice notes and video on job posts (docs/job-media-plan.md). The flag shipped off.
-- Without it the post screen shows none of the media controls.
update public.app_settings
set value = 'true'::jsonb
where key = 'job_media_enabled';
