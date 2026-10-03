-- Turn on Help me write (AI) and Request a quote from a service listing. Both shipped off
-- (docs/wizard-ai-plan.md). The function ai-draft and its secrets are deployed by
-- .github/workflows/deploy-functions.yml. Turn either off again from Admin, Settings, or here.
update public.app_settings
set value = 'true'::jsonb
where key in ('ai_help_enabled', 'listing_quote_requests_enabled');
