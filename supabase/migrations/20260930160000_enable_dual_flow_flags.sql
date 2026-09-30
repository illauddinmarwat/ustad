-- Turn on the dual-flow features that shipped switched off (docs/dual-flow-plan.md, D16).
-- Without these, "Post a job" and "Request this Ustad" show "not available yet".
update public.app_settings
set value = 'true'::jsonb
where key in ('direct_requests_enabled', 'job_posting_enabled');
