# Job media plan: photos, audio and video on job posts

**Status: Phase 1 (foundation, photos, budget removal) built, tested and deployed; flag `job_media_enabled` is still off. Phase 2 (audio) built and tested, not pushed or built into an APK yet. Phase 3 (video) not started.** Estimate: 6–9 working days over three phases.

Phase 2 notes: voice notes (up to 60 s, mono AAC about 0.4 MB per minute) with Record, Pause/Resume, Stop, listen and re-record; the recording is uploaded after the job is posted, and a failed upload never loses the job. Workers and the owner play it in the job's media card. Needs `expo-audio` (native), so it needs a new APK (`app.config.ts` gains the microphone permission text). The bucket's allowed types gained AAC/M4A, 3GP and WebM. Not tested on a real device or on real Supabase storage: check recording on a low-end Android, and the WebM path on the web app, before enabling.

Phase 1 notes: photos, admin view and removal, and clean-up (admin button on the Posted jobs page: the database cannot delete stored files itself) are done. Not built: an automatic scheduled clean-up, and sweeping uploads that were never registered (rare, when both the registration and the follow-up delete fail). The bucket's storage policies were not tested on a real Supabase project (the local test setup stubs storage); check one real upload before enabling the flag.

## Decisions (agreed)

| # | Decision |
|---|---|
| M1 | **Signed-in customers only.** Guests keep posting text-only jobs. No anonymous upload path. |
| M2 | **Media is visible to approved, active workers whose categories match the job** (and to the owning customer and admins), so they can see the details and quote their own price. Guests, customers and non-matching workers cannot see it. The job board shows counts ("2 photos, 1 voice note"); files open on the job detail screen. |
| M3 | Caps: video 30 s, audio 60 s. Proposed counts: 4 photos, 1 audio, 1 video per job. |
| M4 | **Video recording has a Pause/Resume button**, alongside Record/Stop and a running timer that counts recorded time only. |
| M6 | **The customer no longer enters a budget.** A job is described by text, photos, a voice note and a video; the price comes from worker quotes. |
| M5 | Text rules stay: no phone numbers or links in text. Spoken numbers in audio/video cannot be filtered, so the control is: matching approved workers only, short-lived signed URLs, admin moderation and a Report button. |

## Budget removal (M6)

- Remove the budget fields from PostJobScreen, PostedJobScreen, JobBoardScreen, BoardJobScreen, `jobPosting.ts`, their tests and the Urdu/English strings.
- `post_job` stops taking `p_budget_min` and `p_budget_max`. The `jobs.budget_min_pkr` and `budget_max_pkr` columns stay (nullable), so old jobs keep showing their budget where they have one. Drop the "minimum above maximum" check.
- The job board sorts and filters by category, city and freshness instead of budget. Update `phase15`, `phase18` and `phase12` pgTAP tests that pass budget values, and the web-admin job views.
- The text description becomes the required minimum ("describe the job"), with media as optional extras. Consider a prompt ("what is broken, where, how big?") to replace what the budget hinted at.
- Ships in Phase 1 with the migration, because it is a signature change to `post_job` (drop and recreate; the old signature must be removed).
- **Dependency:** the quote is now the first price signal; see `docs/job-quotes-plan.md` once the quote flow is agreed.

## Design

### Database (one migration per phase, deployed by CI)
- Private storage bucket `job-media`. Path: `{customer_id}/{job_id}/{uuid}.{ext}`. Per-file size limits enforced at bucket level (photo 3 MB, audio 3 MB, video 25 MB).
- Table `job_media` (id, job_id, kind `photo|audio|video`, path, bytes, duration_s, created_at, removed_at). RLS: owner insert/select/delete on own open job; admin select; workers have **no direct select** (they read through the RPC below).
- Storage RLS: insert only by the owning customer under their own folder; no public read.
- RPCs (SECURITY DEFINER):
  - `add_job_media(job_id, kind, path, bytes, duration_s)`: checks flag, ownership, job still `open`, per-kind count and duration caps.
  - `remove_job_media(id)`.
  - `job_media_for_viewer(job_id)`: returns rows only if caller is the owner, an admin, or an approved active worker whose categories include the job's category and the job is open. The app then requests short-lived signed URLs (the bucket policy allows signed-URL creation only through this path).
  - Extend the job board and job detail queries with `photo_count, audio_count, video_count`.
- Flag `job_media_enabled` (seeded false, same pattern as the other flags). Migration 1 adds the flag; enabling is a separate one-line migration after verification.
- Cleanup: when a job is cancelled, expired or deleted, mark media removed; a scheduled job (pg_cron, the existing pattern) deletes the storage objects after 7 days. Also sweep uploads with no `job_media` row after 24 h.
- Admin: media list on the job detail page, Remove button, audit entry.

### Mobile
- `lib/jobMedia.ts`: capture, validate, upload with retry and progress, signed-URL fetch.
- **Do not reuse `workerUploads.ts` as is** for video: it reads the whole file as base64 into memory. Use a file-based upload (`FileSystem.uploadAsync` against the storage endpoint with the user's token) for audio and video. Photos can keep the current approach after `expo-image-manipulator` resizes them (max 1600 px, JPEG 0.7).
- PostJobScreen: a "Add photos / voice note / video" section below the description. Attach-after-create: post the job first, then upload, then show a per-file status. A failed upload never loses the job; the customer can retry from the posted job screen.
- Components: `PhotoStrip`, `AudioRecorder` (record, stop, play back, re-record, 60 s ring), `VideoRecorder` (see the pause risk below), `MediaViewer` (photos full screen, audio player, video player).
- Worker side: BoardJobScreen shows the media viewer directly above the quote form.
- Urdu and English strings for every label, error and permission prompt (camera, microphone, storage).
- Dependencies: `expo-audio`, `expo-video`, `expo-camera`. These are native, so **each phase that adds one needs a new APK build**.

## Key risk: pausing a video recording

`expo-camera`'s `CameraView` records with `recordAsync` and `stopRecording`; I am **not** confident it offers a true pause/resume on both platforms. This must be settled by a spike before Phase 3 is committed.

Options, in order of preference:
1. If the installed `expo-camera` version supports pause/resume natively, use it. Half a day to confirm.
2. Otherwise record **segments** (Pause = stop the segment, Resume = start a new one) and join them. Joining needs a native concatenation step, which means a config-plugin or a library such as FFmpeg-kit. That adds APK size, build complexity and about 2 extra days.
3. Fallback that needs no joining: Pause is a UI-only pause that keeps recording, which is not what you asked for and I would not ship it.
4. Last resort: let the customer keep up to 3 short clips instead of one paused clip.

Audio pause is easier: `expo-audio` recorders expose pause and resume, so audio gets a Pause button too.

## Phases

### Phase 1: foundation and photos (2.5–3 days, no new native library)
- [ ] Migration: flag, bucket, `job_media`, RLS, `add/remove/job_media_for_viewer`, counts on job queries.
- [ ] `lib/jobMedia.ts` and photo capture, resize and upload; PostJob and PostedJob UI.
- [ ] Worker view: gallery for matching workers. Admin view and Remove.
- [ ] pgTAP: owner-only insert; non-matching, unapproved or deactivated workers blocked; caps; closed or cancelled jobs rejected; signed URLs only via RPC. Jest: upload retry, state after partial failure.
- [ ] Docs: api-reference, how-to-run, FAQ.

### Phase 2: audio (2 days, new APK)
- [ ] Add `expo-audio`; microphone permission and explanation screen (Urdu and English).
- [ ] Recorder with pause/resume, 60 s cap, playback and re-record; worker and admin player.
- [ ] Tests; APK build and device check on a low-end Android.

### Phase 3: video (2–4 days depending on the pause spike, new APK)
- [ ] Spike first (0.5 day): pause support in the installed `expo-camera`. Report back before building.
- [ ] Recorder: Record, Pause/Resume, Stop, timer, 30 s auto-stop, retake.
- [ ] Compression target about 720p, 25 MB limit; upload progress, resume on weak data; player.
- [ ] Tests and device check on slow data (throttled network).

## Acceptance checks
- A guest cannot see or use the media controls.
- A worker outside the job's category cannot fetch a file even with a known path (test storage RLS directly).
- Caps hold at the database, not only in the app.
- Cancelling or expiring a job removes its files within 7 days.
- Every screen works in Urdu.

## Open questions
- Confirm counts: 4 photos, 1 audio, 1 video per job.
- Should admins be notified when a media file is reported? (Default: it appears in the moderation feed.)
- Supabase plan storage and per-file limits need checking before Phase 3.
