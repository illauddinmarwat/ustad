-- In-app help for Help me write, English/Urdu posts, and getting a price from a service listing.
-- Also removes the old mention of a customer budget from the "request a worker" answer.

insert into public.faqs (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms) values
  (
    'help-me-write',
    'getting-started',
    'What is Help me write?',
    'لکھنے میں مدد کریں کیا ہے؟',
    'When you post a job or publish a service, tap Help me write. It asks a few quick questions and writes your post in English and Urdu. You check both versions and change anything before it goes out. It never suggests a price, and you can always write it yourself.',
    'جب آپ کام پوسٹ کریں یا سروس شائع کریں تو "لکھنے میں مدد کریں" دبائیں۔ یہ چند مختصر سوال پوچھ کر آپ کی پوسٹ انگریزی اور اردو میں لکھ دیتا ہے۔ پوسٹ جانے سے پہلے آپ دونوں ورژن دیکھ کر جو چاہیں بدل سکتے ہیں۔ یہ کبھی قیمت نہیں بتاتا، اور آپ ہمیشہ خود بھی لکھ سکتے ہیں۔',
    array['ai', 'help', 'write', 'draft', 'urdu', 'english']
  ),
  (
    'post-in-two-languages',
    'getting-started',
    'Which language should I write in?',
    'مجھے کس زبان میں لکھنا چاہیے؟',
    'Write in English, Urdu or Roman Urdu, whichever is easiest. When AI help is on, we prepare the other language for you to check. Other people see your post in their own language and can tap Show original. If AI help is not available, your post is shown as you wrote it.',
    'انگریزی، اردو یا رومن اردو میں جس میں آسانی ہو لکھیں۔ اے آئی مدد دستیاب ہو تو دوسری زبان ہم تیار کر دیتے ہیں تاکہ آپ دیکھ لیں۔ دوسرے لوگ آپ کی پوسٹ اپنی زبان میں دیکھتے ہیں اور "اصل متن دکھائیں" دبا کر اصل بھی پڑھ سکتے ہیں۔ اگر اے آئی مدد دستیاب نہ ہو تو پوسٹ ویسی ہی دکھائی جاتی ہے جیسی آپ نے لکھی۔',
    array['language', 'urdu', 'english', 'translate', 'translation']
  ),
  (
    'get-a-price-from-service',
    'getting-started',
    'How do I get a price from a service?',
    'مجھے کسی سروس سے قیمت کیسے ملے گی؟',
    'Service listings do not show prices. Open a listing and tap Request a quote. Show the problem with photos, a short video or a voice note. The Ustad replies with a price, which you can accept or decline. Phone numbers are shared only after you accept.',
    'سروس کی فہرست میں قیمت نہیں لکھی ہوتی۔ فہرست کھول کر "قیمت کی درخواست کریں" دبائیں اور تصاویر، مختصر ویڈیو یا آواز کے پیغام سے مسئلہ دکھائیں۔ استاد آپ کو اپنی قیمت بھیجے گا، جسے آپ قبول یا مسترد کر سکتے ہیں۔ فون نمبر قبول کرنے کے بعد ہی شیئر ہوتے ہیں۔',
    array['price', 'quote', 'service', 'listing', 'cost']
  )
on conflict (slug) do update set
  category = excluded.category,
  question_en = excluded.question_en,
  question_ur = excluded.question_ur,
  answer_en = excluded.answer_en,
  answer_ur = excluded.answer_ur,
  search_terms = excluded.search_terms,
  updated_at = now ();

update public.faqs
set answer_en = 'Open Nearby, pick a worker and tap "Send request". Describe the job and add photos if you like. The worker replies with a price. If they do not reply within a couple of hours the request opens up.',
    answer_ur = 'نزدیک سے کسی کارکن کو منتخب کر کے "درخواست بھیجیں" دبائیں۔ کام بیان کریں اور چاہیں تو تصاویر شامل کریں۔ کارکن اپنی قیمت بھیجے گا۔ اگر وہ دو گھنٹے میں جواب نہ دے تو درخواست دوسروں کے لیے کھل جاتی ہے۔',
    updated_at = now ()
where slug = 'how-to-request-worker';
