-- Phase 3 slice 3f: bilingual FAQ knowledge base + bounded chat handoff.
-- Additive only.
--
-- The FAQ surface is "bounded" by design — answers come from this curated
-- table, not from an LLM. When no FAQ matches, the client offers the support
-- handoff contact instead of generating an answer (see Phase 3 brief).

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  question_en text not null,
  question_ur text,
  answer_en text not null,
  answer_ur text,
  search_terms text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_faqs_active_category on public.faqs (is_active, category);

alter table public.faqs enable row level security;

drop policy if exists "faqs_read_active" on public.faqs;
create policy "faqs_read_active"
  on public.faqs for select
  to authenticated
  using (is_active = true or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "faqs_admin_write" on public.faqs;
create policy "faqs_admin_write"
  on public.faqs for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

-- Lightweight bilingual matcher: case-insensitive substring + search_terms.
-- Returns scored rows so the client can render the best matches first.
create or replace function public.search_faqs (p_query text, p_limit int default 10)
returns table (
  id uuid,
  slug text,
  category text,
  question_en text,
  question_ur text,
  answer_en text,
  answer_ur text,
  score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select trim(coalesce(p_query, '')) as needle
  ),
  scored as (
    select
      f.id,
      f.slug,
      f.category,
      f.question_en,
      f.question_ur,
      f.answer_en,
      f.answer_ur,
      (
        case when q.needle = '' then 0.0
             when f.question_en ilike '%' || q.needle || '%' then 0.6
             else 0.0 end
        + case when q.needle = '' then 0.0
               when f.question_ur ilike '%' || q.needle || '%' then 0.6
               else 0.0 end
        + case when q.needle = '' then 0.0
               when exists (
                 select 1 from unnest(f.search_terms) as term
                 where term ilike '%' || q.needle || '%'
               ) then 0.4
               else 0.0 end
      )::numeric as score
    from public.faqs f, q
    where f.is_active = true
  )
  select s.id, s.slug, s.category, s.question_en, s.question_ur, s.answer_en, s.answer_ur, s.score
  from scored s
  where s.score > 0 or (select needle from q) = ''
  order by s.score desc, s.question_en asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

grant execute on function public.search_faqs (text, int) to authenticated;

-- Seed a small bilingual knowledge base. on conflict do nothing keeps the
-- migration idempotent for re-runs.
insert into public.faqs (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms) values
  (
    'how-to-post-job',
    'getting-started',
    'How do I post a job?',
    'میں نوکری کیسے پوسٹ کروں؟',
    'Open the Jobs tab, tap "Post a job", describe what you need and submit. Workers will respond with quotes you can compare.',
    'ملازمت کا اشتہار دینے کے لیے Jobs ٹیب کھولیں، "Post a job" پر ٹیپ کریں، اپنی ضرورت لکھیں اور جمع کریں۔ کاریگر آپ کو قیمتیں بھیجیں گے۔',
    array['post','job','rail a','quote','customer']
  ),
  (
    'how-to-apply-listing',
    'getting-started',
    'How do I apply for a service listing?',
    'سروس لسٹنگ کے لیے کیسے اپلائی کریں؟',
    'Open Services, pick a listing, tap "Apply for service", share your area and preferred time. The worker accepts and you confirm to assign the job.',
    'Services کھولیں، ایک لسٹنگ منتخب کریں، "Apply for service" پر ٹیپ کریں، اپنا علاقہ اور مناسب وقت بتائیں۔ کاریگر قبول کرتا ہے اور آپ تصدیق کرکے کام سپرد کر دیتے ہیں۔',
    array['apply','service','listing','rail b','customer']
  ),
  (
    'payment-options',
    'payments',
    'How do I pay for a completed job?',
    'مکمل ہونے والے کام کی ادائیگی کیسے ہوگی؟',
    'Mark the job paid in the Job detail screen with the amount and method (manual, JazzCash, Easypaisa or bank). The amount is recorded in the payment ledger for both parties.',
    'Job detail سکرین پر مکمل رقم اور طریقہ (manual, JazzCash, Easypaisa یا bank) درج کرکے کام کو "Mark paid" کریں۔ یہ ادائیگی دونوں فریقوں کے لیے لیجر میں محفوظ ہو جائے گی۔',
    array['payment','jazzcash','easypaisa','bank','ledger']
  ),
  (
    'how-to-review',
    'reviews',
    'When can I review a worker?',
    'میں کاریگر کا جائزہ کب دے سکتا ہوں؟',
    'You can rate the worker after the job is marked completed. Open the Job detail screen, choose 1–5 stars, leave an optional comment and submit.',
    'جب کام مکمل ہو جائے تو آپ کاریگر کا جائزہ دے سکتے ہیں۔ Job detail سکرین کھولیں، 1-5 ستارے منتخب کریں، چاہیں تو تبصرہ کریں اور جمع کریں۔',
    array['review','rating','complete','customer']
  ),
  (
    'document-verification',
    'workers',
    'How do I verify my documents?',
    'میں اپنی دستاویزات کی تصدیق کیسے کروں؟',
    'Workers can upload CNIC or driving licence images from Account → Verify documents. OCR will prefill what it can; you can edit and save for admin review.',
    'کاریگر Account → Verify documents سے CNIC یا ڈرائیونگ لائسنس کی تصویر اپلوڈ کر سکتے ہیں۔ OCR زیادہ تر معلومات خود بھر دے گا؛ آپ تبدیلی کرکے ایڈمن کے جائزے کے لیے محفوظ کر دیں۔',
    array['cnic','license','verify','worker','document','ocr']
  ),
  (
    'support-handoff',
    'support',
    'How do I contact human support?',
    'انسانی سپورٹ سے رابطہ کیسے کریں؟',
    'If your question is not in this FAQ, tap "Contact support" below to email our team. We aim to respond within one business day.',
    'اگر آپ کا سوال یہاں نہیں ہے تو نیچے "Contact support" پر ٹیپ کریں اور ہماری ٹیم کو ای میل کریں۔ ہم ایک کاروباری دن میں جواب دیں گے۔',
    array['support','help','contact','human']
  )
on conflict (slug) do nothing;
