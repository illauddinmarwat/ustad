/**
 * Canonical string catalog (EN + UR) for user-facing copy.
 *
 * Rules:
 * - `en` is canonical; `ur` is the Urdu translation rendered beneath English.
 * - Keys are namespaced (`<screen>.<element>`). Keep them stable — they
 *   are referenced from screen components.
 * - Admin Ops, raw Supabase errors, and feature-flag keys are intentionally
 *   NOT translated. Use plain `<Text>` for those.
 */

export type Strings = {
  readonly en: string;
  readonly ur: string;
};

export const strings = {
  // --------------------------- COMMON / SHARED ---------------------------
  'common.appName': { en: 'Ustad', ur: 'استاد' },
  'common.signIn': { en: 'Sign in', ur: 'لاگ ان' },
  'common.signOut': { en: 'Sign out', ur: 'لاگ آؤٹ' },
  'common.createAccount': { en: 'Create account', ur: 'اکاؤنٹ بنائیں' },
  'common.signInOrCreate': { en: 'Sign in / Create account', ur: 'لاگ ان / اکاؤنٹ بنائیں' },
  'common.email': { en: 'Email', ur: 'ای میل' },
  'common.password': { en: 'Password', ur: 'پاس ورڈ' },
  'common.submit': { en: 'Submit', ur: 'جمع کروائیں' },
  'common.cancel': { en: 'Cancel', ur: 'منسوخ' },
  'common.save': { en: 'Save', ur: 'محفوظ کریں' },
  'common.send': { en: 'Send', ur: 'بھیجیں' },
  'common.open': { en: 'Open', ur: 'کھولیں' },
  'common.continue': { en: 'Continue', ur: 'جاری رکھیں' },
  'common.refresh': { en: 'Refresh', ur: 'تازہ کریں' },
  'common.loading': { en: 'Loading…', ur: 'لوڈ ہو رہا ہے…' },
  'common.notFound': { en: 'Not found', ur: 'نہیں ملا' },
  'common.tryAgain': { en: 'Try again', ur: 'دوبارہ کوشش کریں' },
  'common.yes': { en: 'Yes', ur: 'ہاں' },
  'common.no': { en: 'No', ur: 'نہیں' },
  'common.required': { en: 'Required', ur: 'لازمی' },
  'common.optional': { en: 'Optional', ur: 'اختیاری' },

  'role.customer': { en: 'Customer', ur: 'صارف' },
  'role.worker': { en: 'Worker', ur: 'کارکن' },
  'role.admin': { en: 'Admin', ur: 'ایڈمن' },
  'role.guest': { en: 'Guest', ur: 'مہمان' },

  // --------------------------- TABS ---------------------------
  'tabs.dashboard': { en: 'Home', ur: 'ہوم' },
  'tabs.services': { en: 'Services', ur: 'خدمات' },
  'tabs.jobs': { en: 'Jobs', ur: 'کام' },
  'tabs.applications': { en: 'Inbox', ur: 'درخواستیں' },
  'tabs.account': { en: 'Account', ur: 'اکاؤنٹ' },
  'tabs.admin': { en: 'Admin', ur: 'ایڈمن' },

  // --------------------------- NAV TITLES ---------------------------
  'nav.app': { en: 'Ustad', ur: 'استاد' },
  'nav.signIn': { en: 'Sign in', ur: 'لاگ ان' },
  'nav.job': { en: 'Job', ur: 'کام' },
  'nav.service': { en: 'Service', ur: 'سروس' },
  'nav.documentVerification': { en: 'Document verification', ur: 'دستاویز کی تصدیق' },
  'nav.faq': { en: 'Help & FAQ', ur: 'مدد اور سوالات' },
  'nav.faqChat': { en: 'Help chat', ur: 'چیٹ سے مدد' },
  'nav.communityTips': { en: 'Community tips', ur: 'کمیونٹی مشورے' },

  // --------------------------- AUTH SCREEN ---------------------------
  'auth.hero.title': { en: 'Find local skilled workers quickly', ur: 'مقامی ہنر مند کارکن جلدی تلاش کریں' },
  'auth.hero.subtitle': {
    en: 'Post tasks, compare responses, and hire with confidence.',
    ur: 'کام پوسٹ کریں، جوابات کا موازنہ کریں، اور اعتماد سے کارکن منتخب کریں۔',
  },
  'auth.welcome': { en: 'Welcome back', ur: 'خوش آمدید' },
  'auth.error.failed': { en: 'Authentication failed', ur: 'تصدیق ناکام ہوگئی' },
  'auth.signup.checkEmail': {
    en: 'Account created. Check your email to confirm, then sign in.',
    ur: 'اکاؤنٹ بن گیا۔ تصدیق کے لیے اپنی ای میل دیکھیں، پھر لاگ ان کریں۔',
  },

  // --------------------------- DASHBOARD ---------------------------
  'dashboard.hero.title': {
    en: 'Get free quotes from local skilled workers',
    ur: 'مقامی ہنر مند کارکنوں سے مفت تخمینے حاصل کریں',
  },
  'dashboard.hero.subtitle': {
    en: 'Post tasks, compare responses, and choose the best professional.',
    ur: 'کام پوسٹ کریں، جوابات کا موازنہ کریں، اور بہترین پیشہ ور منتخب کریں۔',
  },
  'dashboard.cta.browse': { en: 'Browse services', ur: 'خدمات دیکھیں' },
  'dashboard.cta.postJob': { en: 'Post a job', ur: 'کام پوسٹ کریں' },
  'dashboard.cta.myListings': { en: 'My listings', ur: 'میری فہرستیں' },
  'dashboard.cta.openJobs': { en: 'Open jobs', ur: 'دستیاب کام' },
  'dashboard.howItWorks.title': { en: 'How it works', ur: 'یہ کیسے کام کرتا ہے' },
  'dashboard.howItWorks.step1': { en: 'Post your task in seconds', ur: 'سیکنڈوں میں اپنا کام پوسٹ کریں' },
  'dashboard.howItWorks.step2': { en: 'Receive responses and quotes quickly', ur: 'جلدی جوابات اور تخمینے حاصل کریں' },
  'dashboard.howItWorks.step3': { en: 'Confirm, complete and review', ur: 'تصدیق، تکمیل اور جائزہ' },
  'dashboard.categories.title': { en: 'Popular categories', ur: 'مقبول زمرے' },
  'dashboard.categories.plumbing': { en: 'Plumbing', ur: 'پلمبنگ' },
  'dashboard.categories.electrical': { en: 'Electrical', ur: 'بجلی' },
  'dashboard.categories.cleaning': { en: 'Cleaning', ur: 'صفائی' },
  'dashboard.categories.ac': { en: 'AC Service', ur: 'اے سی سروس' },
  'dashboard.categories.handyman': { en: 'Handyman', ur: 'ہینڈی مین' },
  'dashboard.mode.label': { en: 'Current mode', ur: 'موجودہ موڈ' },

  // --------------------------- SERVICES SCREEN ---------------------------
  'services.title': { en: 'Browse services', ur: 'خدمات دیکھیں' },
  'services.subtitle': {
    en: 'Compare transparent prices and apply instantly.',
    ur: 'شفاف قیمتوں کا موازنہ کریں اور فوری درخواست دیں۔',
  },
  'services.publish.title': { en: 'Publish your service', ur: 'اپنی سروس شائع کریں' },
  'services.publish.headline': { en: 'Listing headline', ur: 'فہرست کا عنوان' },
  'services.publish.price': { en: 'Price (PKR)', ur: 'قیمت (روپے)' },
  'services.publish.cta': { en: 'Publish listing', ur: 'فہرست شائع کریں' },
  'services.publish.toast': { en: 'Listing published', ur: 'فہرست شائع ہو گئی' },
  'services.guest.title': { en: 'Guest mode', ur: 'مہمان موڈ' },
  'services.guest.subtitle': {
    en: 'Sign in to publish listings, apply for services, and track bookings.',
    ur: 'لاگ ان کریں تاکہ فہرستیں شائع کر سکیں، درخواست دے سکیں اور بکنگ کو ٹریک کر سکیں۔',
  },
  'services.guest.inlineHint': {
    en: 'Sign in to apply or save services.',
    ur: 'درخواست دینے یا محفوظ کرنے کے لیے لاگ ان کریں۔',
  },
  'services.list.title': { en: 'Active listings', ur: 'فعال فہرستیں' },
  'services.list.empty': { en: 'No active listings yet.', ur: 'ابھی کوئی فعال فہرست نہیں۔' },
  'services.list.details': { en: 'Details', ur: 'تفصیلات' },
  'services.list.featured': { en: 'Featured', ur: 'نمایاں' },
  'services.list.fromRs': { en: 'From Rs', ur: 'سے روپے' },
  'services.error.load': { en: 'Failed to load services', ur: 'خدمات لوڈ نہیں ہو سکیں' },
  'services.gate.publishSignIn': { en: 'Sign in to publish a listing.', ur: 'فہرست شائع کرنے کے لیے لاگ ان کریں۔' },
  'services.gate.publishRole': { en: 'Switch to worker role to publish services.', ur: 'خدمات شائع کرنے کے لیے کارکن کے کردار پر جائیں۔' },
  'services.rank.subtitle.trust': { en: 'Ranked by trust, recency, and featured boosts', ur: 'اعتماد، تازگی اور نمایاں بوسٹ کے مطابق درج' },
  'services.rank.subtitle.basic': { en: 'Ranked by trust and recency', ur: 'اعتماد اور تازگی کے مطابق درج' },
  'services.rank.subtitle.recent': { en: 'Sorted by most recent', ur: 'تازہ ترین کے مطابق ترتیب' },

  // --------------------------- LISTING DETAIL ---------------------------
  'listing.offline': { en: 'Connect Supabase to browse listing details.', ur: 'فہرست کی تفصیلات دیکھنے کے لیے سپابیس سے جڑیں۔' },
  'listing.notFound': { en: 'Listing not found', ur: 'فہرست نہیں ملی' },
  'listing.error.load': { en: 'Failed to load listing', ur: 'فہرست لوڈ نہیں ہو سکی' },
  'listing.postedBy': { en: 'Posted by', ur: 'پوسٹ کرنے والا' },
  'listing.workerFallback': { en: 'Worker', ur: 'کارکن' },
  'listing.signInRequired': { en: 'Sign in required', ur: 'لاگ ان درکار' },
  'listing.signInPrompt': {
    en: 'Create an account to apply, message workers, and track bookings.',
    ur: 'درخواست دینے، کارکنوں سے بات کرنے اور بکنگ ٹریک کرنے کے لیے اکاؤنٹ بنائیں۔',
  },
  'listing.cta.apply': { en: 'Apply for service', ur: 'سروس کے لیے درخواست دیں' },
  'listing.cta.webCheckout': { en: 'Create web checkout (pilot)', ur: 'ویب چیک آؤٹ بنائیں (پائلٹ)' },
  'listing.modal.title': { en: 'Apply for service', ur: 'سروس کے لیے درخواست' },
  'listing.modal.subtitle': { en: 'Share your location and preferred schedule.', ur: 'اپنا مقام اور پسندیدہ وقت بتائیں۔' },
  'listing.modal.notes': { en: 'Notes for the worker', ur: 'کارکن کے لیے نوٹس' },
  'listing.modal.area': { en: 'Area / address', ur: 'علاقہ / پتہ' },
  'listing.modal.time': { en: 'Preferred time', ur: 'پسندیدہ وقت' },
  'listing.toast.applied': { en: 'Application sent', ur: 'درخواست بھیج دی گئی' },
  'listing.gate.applySignIn': { en: 'Sign in to apply for this service.', ur: 'اس سروس کے لیے درخواست دینے کے لیے لاگ ان کریں۔' },
  'listing.gate.applyRole': { en: 'Switch to customer role to apply for services.', ur: 'درخواست دینے کے لیے صارف کے کردار پر جائیں۔' },

  // --------------------------- JOBS SCREEN ---------------------------
  'jobs.title': { en: 'Jobs board', ur: 'کاموں کا بورڈ' },
  'jobs.subtitle': {
    en: 'Open a job for quotes, messages, confirm booking, complete, and review.',
    ur: 'کام کھولیں تاکہ تخمینے، پیغامات، بکنگ، تکمیل اور جائزہ ہو سکے۔',
  },
  'jobs.signInRequired': { en: 'Sign in required', ur: 'لاگ ان درکار' },
  'jobs.signInPrompt': {
    en: 'Browse services as guest, then sign in to post or manage jobs.',
    ur: 'مہمان کے طور پر خدمات دیکھیں، پھر لاگ ان کر کے کام پوسٹ یا منظم کریں۔',
  },
  'jobs.guest.draftHint': {
    en: 'Post a job without an account. Sign in later to chat with workers and accept quotes.',
    ur: 'بغیر اکاؤنٹ کے کام پوسٹ کریں۔ کارکنوں سے بات کرنے اور تخمینے قبول کرنے کے لیے بعد میں لاگ ان کریں۔',
  },
  'jobs.post.title': { en: 'Post a new job', ur: 'نیا کام پوسٹ کریں' },
  'jobs.post.placeholder': { en: 'Need electrician for fan install', ur: 'فین لگوانے کے لیے الیکٹریشن چاہیے' },
  'jobs.post.cta': { en: 'Post job', ur: 'کام پوسٹ کریں' },
  'jobs.post.toast': { en: 'Job posted', ur: 'کام پوسٹ ہو گیا' },
  'jobs.list.title': { en: 'Recent jobs', ur: 'حالیہ کام' },
  'jobs.list.empty': { en: 'No jobs yet.', ur: 'ابھی کوئی کام نہیں۔' },
  'jobs.error.load': { en: 'Failed to load jobs', ur: 'کام لوڈ نہیں ہو سکے' },
  'jobs.gate.postSignIn': { en: 'Sign in to post a job.', ur: 'کام پوسٹ کرنے کے لیے لاگ ان کریں۔' },
  'jobs.gate.postRole': { en: 'Switch to customer role to post jobs.', ur: 'کام پوسٹ کرنے کے لیے صارف کے کردار پر جائیں۔' },
  'jobs.gate.openSignIn': { en: 'Sign in to open job details.', ur: 'کام کی تفصیلات دیکھنے کے لیے لاگ ان کریں۔' },

  // --------------------------- JOB DETAIL ---------------------------
  'jobDetail.offline': {
    en: 'Connect Supabase to open job threads and reviews.',
    ur: 'کاموں کے تھریڈ اور جائزے دیکھنے کے لیے سپابیس سے جڑیں۔',
  },
  'jobDetail.signInPrompt': {
    en: 'Sign in to open job threads, messages, and booking actions.',
    ur: 'لاگ ان کریں تاکہ کاموں کے تھریڈ، پیغامات اور بکنگ کے اقدامات دیکھ سکیں۔',
  },
  'jobDetail.notFound': { en: 'Job not found or not visible.', ur: 'کام نہیں ملا یا نظر نہیں آتا۔' },
  'jobDetail.error.load': { en: 'Failed to load job', ur: 'کام لوڈ نہیں ہو سکا' },
  'jobDetail.area': { en: 'Area', ur: 'علاقہ' },
  'jobDetail.timeline.title': { en: 'Job timeline', ur: 'کام کی ٹائم لائن' },
  'jobDetail.timeline.subtitle': { en: 'Live status updates from the worker.', ur: 'کارکن کی طرف سے لائیو اپڈیٹس۔' },
  'jobDetail.timeline.assigned': { en: 'Assigned', ur: 'تفویض شدہ' },
  'jobDetail.timeline.enRoute': { en: 'En route', ur: 'راستے میں' },
  'jobDetail.timeline.inProgress': { en: 'In progress', ur: 'جاری ہے' },
  'jobDetail.timeline.complete': { en: 'Complete', ur: 'مکمل' },
  'jobDetail.timeline.workerStatus': { en: 'Worker status', ur: 'کارکن کی حالت' },
  'jobDetail.timeline.notEnRoute': { en: 'Not en route yet', ur: 'ابھی راستے پر نہیں' },
  'jobDetail.timeline.jobTimer': { en: 'Job timer', ur: 'کام کا ٹائمر' },
  'jobDetail.timeline.startEnRoute': { en: 'Start en-route (ETA ~30m)', ur: 'راستے پر روانہ (تخمینہ ~30 منٹ)' },
  'jobDetail.timeline.arrived': { en: 'Arrived / stop en-route', ur: 'پہنچ گیا / روانگی ختم' },
  'jobDetail.timeline.startTimer': { en: 'Start job timer', ur: 'کام کا ٹائمر شروع کریں' },
  'jobDetail.timeline.pauseTimer': { en: 'Pause job timer', ur: 'کام کا ٹائمر روکیں' },
  'jobDetail.confirm.title': { en: 'Confirm booking', ur: 'بکنگ کی تصدیق' },
  'jobDetail.confirm.subtitle': {
    en: 'Worker accepted your application. Confirm to assign the job.',
    ur: 'کارکن نے درخواست قبول کر لی۔ کام تفویض کرنے کی تصدیق کریں۔',
  },
  'jobDetail.confirm.cta': { en: 'Confirm booking', ur: 'بکنگ کی تصدیق' },
  'jobDetail.confirm.toast': { en: 'Booking confirmed', ur: 'بکنگ کی تصدیق ہو گئی' },
  'jobDetail.quote.title': { en: 'Send a quote', ur: 'تخمینہ بھیجیں' },
  'jobDetail.quote.amount': { en: 'Amount (PKR)', ur: 'رقم (روپے)' },
  'jobDetail.quote.message': { en: 'Short message', ur: 'مختصر پیغام' },
  'jobDetail.quote.submit': { en: 'Submit quote', ur: 'تخمینہ جمع کروائیں' },
  'jobDetail.quote.toast': { en: 'Quote sent', ur: 'تخمینہ بھیج دیا گیا' },
  'jobDetail.quote.invalidAmount': { en: 'Enter a valid amount', ur: 'درست رقم درج کریں' },
  'jobDetail.quotes.title': { en: 'Quotes', ur: 'تخمینے' },
  'jobDetail.quotes.accept': { en: 'Accept', ur: 'قبول' },
  'jobDetail.quotes.accepted': { en: 'Quote accepted', ur: 'تخمینہ قبول' },
  'jobDetail.complete.cta': { en: 'Mark job complete', ur: 'کام مکمل کریں' },
  'jobDetail.complete.toast': { en: 'Marked complete', ur: 'مکمل کر دیا گیا' },
  'jobDetail.payment.title': { en: 'Payment (pilot)', ur: 'ادائیگی (پائلٹ)' },
  'jobDetail.payment.subtitle': { en: 'Manual mark-paid flow.', ur: 'دستی ادائیگی کا اندراج۔' },
  'jobDetail.payment.amount': { en: 'Amount paid (PKR)', ur: 'ادا شدہ رقم (روپے)' },
  'jobDetail.payment.cta': { en: 'Mark paid', ur: 'ادا شدہ کا اندراج' },
  'jobDetail.payment.toast': { en: 'Payment marked in ledger', ur: 'ادائیگی لیجر میں درج' },
  'jobDetail.payment.invalid': { en: 'Enter a valid paid amount', ur: 'درست ادا شدہ رقم درج کریں' },
  'jobDetail.review.title': { en: 'Your review', ur: 'آپ کا جائزہ' },
  'jobDetail.review.rate': { en: 'Rate the worker', ur: 'کارکن کو ریٹ کریں' },
  'jobDetail.review.comment': { en: 'Optional comment', ur: 'اختیاری تبصرہ' },
  'jobDetail.review.submit': { en: 'Submit review', ur: 'جائزہ جمع کروائیں' },
  'jobDetail.review.toast': { en: 'Thank you for your review', ur: 'جائزے کا شکریہ' },
  'jobDetail.review.noComment': { en: 'No comment', ur: 'کوئی تبصرہ نہیں' },
  'jobDetail.messages.title': { en: 'Messages', ur: 'پیغامات' },
  'jobDetail.messages.you': { en: 'You', ur: 'آپ' },
  'jobDetail.messages.participant': { en: 'Participant', ur: 'شریک' },
  'jobDetail.messages.empty': { en: 'No messages yet.', ur: 'ابھی کوئی پیغام نہیں۔' },
  'jobDetail.messages.placeholder': { en: 'Write a message', ur: 'پیغام لکھیں' },
  'jobDetail.messages.send': { en: 'Send', ur: 'بھیجیں' },
  'jobDetail.messages.report': { en: 'Report participant', ur: 'شریک کی رپورٹ' },
  'jobDetail.messages.reportToast': { en: 'Report submitted', ur: 'رپورٹ جمع' },
  'jobDetail.messages.signInToSend': { en: 'Sign in to send messages.', ur: 'پیغام بھیجنے کے لیے لاگ ان کریں۔' },

  // --------------------------- APPLICATIONS ---------------------------
  'applications.title': { en: 'Service applications', ur: 'سروس کی درخواستیں' },
  'applications.subtitle': {
    en: 'Manage incoming customer requests for your listings.',
    ur: 'اپنی فہرستوں پر آنے والی درخواستوں کا انتظام کریں۔',
  },
  'applications.signInRequired': { en: 'Sign in required', ur: 'لاگ ان درکار' },
  'applications.signInPrompt': {
    en: 'Worker applications are available after authentication.',
    ur: 'تصدیق کے بعد کارکن کی درخواستیں دستیاب ہیں۔',
  },
  'applications.roleRequired': { en: 'Worker role required', ur: 'کارکن کا کردار درکار' },
  'applications.roleSwitch': {
    en: 'Switch role from Account to access this screen.',
    ur: 'اس اسکرین کے لیے اکاؤنٹ سے کردار تبدیل کریں۔',
  },
  'applications.empty': { en: 'No applications yet.', ur: 'ابھی کوئی درخواست نہیں۔' },
  'applications.accept': { en: 'Accept', ur: 'قبول' },
  'applications.decline': { en: 'Decline', ur: 'مسترد' },
  'applications.acceptToast': { en: 'Application accepted (job created)', ur: 'درخواست قبول (کام بن گیا)' },
  'applications.declineToast': { en: 'Application declined', ur: 'درخواست مسترد' },
  'applications.error.load': { en: 'Failed to load applications', ur: 'درخواستیں لوڈ نہیں ہو سکیں' },
  'applications.note': { en: 'Note', ur: 'نوٹ' },

  // --------------------------- ACCOUNT ---------------------------
  'account.title': { en: 'Account', ur: 'اکاؤنٹ' },
  'account.email': { en: 'Email', ur: 'ای میل' },
  'account.role': { en: 'Role', ur: 'کردار' },
  'account.runtime': { en: 'Runtime', ur: 'رن ٹائم' },
  'account.runtime.live': { en: 'Live Supabase', ur: 'لائیو سپابیس' },
  'account.runtime.fixture': { en: 'Fixture mode', ur: 'فکسچر موڈ' },
  'account.guest.title': { en: 'Welcome', ur: 'خوش آمدید' },
  'account.guest.subtitle': {
    en: 'Sign in to post jobs, apply for services, and access role-based pages.',
    ur: 'لاگ ان کریں تاکہ کام پوسٹ کر سکیں، درخواست دے سکیں اور اپنے کردار کے صفحات دیکھ سکیں۔',
  },
  'account.switchRole': { en: 'Switch role', ur: 'کردار تبدیل کریں' },
  'account.verifyDocs': { en: 'Document verification', ur: 'دستاویز کی تصدیق' },
  'account.verifyDocs.subtitle': {
    en: 'Upload your CNIC or driving licence — OCR will prefill what it can.',
    ur: 'اپنا شناختی کارڈ یا ڈرائیونگ لائسنس اپ لوڈ کریں — OCR ممکنہ معلومات بھر دے گا۔',
  },
  'account.verifyDocs.cta': { en: 'Verify documents', ur: 'دستاویزات کی تصدیق' },
  'account.membership.title': { en: 'Membership', ur: 'ممبرشپ' },
  'account.membership.subtitle': { en: 'Subscriptions (flagged rollout).', ur: 'سبسکرپشن (مرحلہ وار)' },
  'account.membership.plan': { en: 'Plan', ur: 'پلان' },
  'account.membership.status': { en: 'Status', ur: 'حالت' },
  'account.membership.freeTier': { en: 'Free tier', ur: 'مفت ٹیئر' },
  'account.membership.workerPro': { en: 'Worker Pro', ur: 'ورکر پرو' },
  'account.membership.customerPlus': { en: 'Customer Plus', ur: 'کسٹمر پلس' },
  'account.membership.activateWorker': { en: 'Activate Worker Pro', ur: 'ورکر پرو ایکٹیویٹ کریں' },
  'account.membership.activateCustomer': { en: 'Activate Customer Plus', ur: 'کسٹمر پلس ایکٹیویٹ کریں' },
  'account.membership.adminNoPlan': { en: 'Admin role has no subscription plan', ur: 'ایڈمن کے کردار کے لیے سبسکرپشن نہیں' },
  'account.help.title': { en: 'Help & FAQ', ur: 'مدد اور سوالات' },
  'account.help.subtitle': {
    en: 'Common questions in English and Urdu, with one-tap support handoff.',
    ur: 'انگریزی اور اردو میں عام سوالات، ایک ٹیپ پر سپورٹ سے رابطہ۔',
  },
  'account.help.openFaq': { en: 'Open FAQ', ur: 'سوالات کھولیں' },
  'account.help.openChat': { en: 'Help chat (FAQ only)', ur: 'چیٹ سے مدد (صرف FAQ)' },
  'account.help.community': { en: 'Community tips', ur: 'کمیونٹی مشورے' },

  // --------------------------- WORKER ONBOARDING ---------------------------
  'onboarding.title': { en: 'Document verification', ur: 'دستاویز کی تصدیق' },
  'onboarding.intro.ocr': {
    en: 'OCR will prefill what it can. You can always edit before saving.',
    ur: 'OCR ممکنہ معلومات بھر دے گا۔ محفوظ کرنے سے پہلے تدوین ہو سکتی ہے۔',
  },
  'onboarding.intro.manual': {
    en: 'OCR assist is currently disabled. You can still save details manually.',
    ur: 'OCR معاون فی الحال بند ہے۔ آپ تفصیلات دستی طور پر محفوظ کر سکتے ہیں۔',
  },
  'onboarding.ocrDisabledChip': { en: 'OCR disabled · admin gated', ur: 'OCR بند · ایڈمن کنٹرول' },
  'onboarding.docType': { en: 'Document type', ur: 'دستاویز کی قسم' },
  'onboarding.cnic': { en: 'CNIC', ur: 'شناختی کارڈ' },
  'onboarding.licence': { en: 'Driving licence', ur: 'ڈرائیونگ لائسنس' },
  'onboarding.image.title': { en: 'Image', ur: 'تصویر' },
  'onboarding.image.subtitle': { en: 'Pick a clear photo of the document.', ur: 'دستاویز کی صاف تصویر منتخب کریں۔' },
  'onboarding.image.pick': { en: 'Pick image', ur: 'تصویر منتخب کریں' },
  'onboarding.image.replace': { en: 'Replace image', ur: 'تصویر تبدیل کریں' },
  'onboarding.runOcr': { en: 'Run OCR', ur: 'OCR چلائیں' },
  'onboarding.working': { en: 'Working…', ur: 'جاری…' },
  'onboarding.ocrResult': { en: 'OCR result', ur: 'OCR نتیجہ' },
  'onboarding.editBelow': { en: 'Edit fields below', ur: 'نیچے فیلڈز میں ترمیم کریں' },
  'onboarding.confirm.title': { en: 'Confirm details', ur: 'تفصیلات کی تصدیق' },
  'onboarding.placeholder.cnic': { en: 'CNIC e.g. 35202-1234567-8', ur: 'شناختی کارڈ مثال: 35202-1234567-8' },
  'onboarding.placeholder.licence': { en: 'Licence number', ur: 'لائسنس نمبر' },
  'onboarding.placeholder.holder': { en: 'Holder name', ur: 'مالک کا نام' },
  'onboarding.save': { en: 'Save for review', ur: 'جائزے کے لیے محفوظ' },
  'onboarding.saving': { en: 'Saving…', ur: 'محفوظ ہو رہا ہے…' },
  'onboarding.toast.saved': { en: 'Document saved for review', ur: 'دستاویز جائزے کے لیے محفوظ' },
  'onboarding.toast.pickFirst': { en: 'Pick an image first', ur: 'پہلے تصویر منتخب کریں' },
  'onboarding.toast.permDenied': { en: 'Media library permission denied', ur: 'میڈیا لائبریری کی اجازت نہیں ملی' },
  'onboarding.workerOnly': { en: 'Only workers can submit verification documents.', ur: 'صرف کارکن دستاویزات جمع کر سکتے ہیں۔' },

  // --------------------------- FAQ / CHAT (fixed labels only) ---------------------------
  'faq.title': { en: 'Help & FAQ', ur: 'مدد اور سوالات' },
  'faq.subtitle': {
    en: "Bilingual answers to common questions. If you don't see your answer, contact support.",
    ur: 'عام سوالات کے دو لسانی جوابات۔ اگر جواب نہ ملے تو سپورٹ سے رابطہ کریں۔',
  },
  'faq.contactSupport': { en: 'Contact support', ur: 'سپورٹ سے رابطہ' },
  'faq.openChat': { en: 'Open help chat', ur: 'چیٹ سے مدد کھولیں' },
  'faqChat.title': { en: 'Help chat', ur: 'چیٹ سے مدد' },
  'faqChat.intro': {
    en: 'Ask a short question. Answers come only from our curated FAQ — nothing is generated by an AI model.',
    ur: 'مختصر سوال پوچھیں۔ جوابات صرف ہماری منتخب FAQ سے آتے ہیں — کوئی AI ماڈل تخلیق نہیں کرتا۔',
  },
  'faqChat.placeholder': { en: 'Type your question…', ur: 'سوال لکھیں…' },
  'faqChat.send': { en: 'Send', ur: 'بھیجیں' },
  'faqChat.emailSupport': { en: 'Email support', ur: 'سپورٹ کو ای میل' },

  // --------------------------- COMMUNITY TIPS ---------------------------
  'community.title': { en: 'Community tips', ur: 'کمیونٹی مشورے' },
  'community.subtitle': {
    en: 'Optional city-local guidance. Hidden when community flag is off.',
    ur: 'اختیاری شہر کے مشورے۔ کمیونٹی فلیگ بند ہونے پر مخفی۔',
  },
  'community.error.load': { en: 'Unable to load community tips right now.', ur: 'ابھی کمیونٹی مشورے لوڈ نہیں ہو سکے۔' },
  'community.empty': { en: 'No tips available for your city yet.', ur: 'ابھی آپ کے شہر کے لیے مشورے نہیں۔' },
} as const satisfies Record<string, Strings>;

export type StringId = keyof typeof strings;
