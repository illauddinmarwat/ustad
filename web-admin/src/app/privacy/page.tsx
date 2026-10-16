import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Ustad',
  description: 'What the Ustad app collects, why, and how to delete your data.',
};

const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-semibold text-ink-strong">{title}</h2>
      <div className="space-y-2 text-sm leading-6 text-ink-body">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-strong">Ustad Privacy Policy</h1>
      <p className="mt-1 text-sm text-ink-muted">Last updated: 16 October 2026</p>
      <p className="mt-4 text-sm leading-6 text-ink-body">
        Ustad connects customers with local professionals (plumbers, electricians, AC technicians and more) in
        Pakistan. This page explains what the app collects and how it is used.
      </p>

      <Section title="What we collect">
        <p>
          <strong>Account:</strong> email address, password (stored hashed, never readable by us), display name, phone
          number, city and area, and your preferred language.
        </p>
        <p>
          <strong>Professionals only:</strong> CNIC number and photos of the CNIC, a profile photo, skills, rates,
          working hours and service areas. These are used to verify identity and approve registrations.
        </p>
        <p>
          <strong>Jobs and messages:</strong> job posts, quotes, chat messages, photos, short videos and voice notes you
          attach, ratings and reviews, and payment confirmations.
        </p>
        <p>
          <strong>Location:</strong> approximate or precise location while the app is in use, to show nearby
          professionals and, for a professional on an accepted job, to share live arrival tracking with that customer.
          Location is not collected in the background.
        </p>
        <p>
          <strong>Device:</strong> a push-notification token and basic device type so we can send job alerts.
        </p>
        <p>
          <strong>AI help:</strong> when you use &ldquo;Help me write&rdquo;, the text you type is sent to an AI
          service to draft your post or listing and its English and Urdu versions. Your phone number, CNIC and address
          are not sent, and we keep only usage counts, not the text.
        </p>
      </Section>

      <Section title="How it is used">
        <p>
          To register you, match customers with professionals, show quotes and chat, send notifications about your
          jobs, verify professionals, handle disputes and keep the platform safe. Phone numbers are shared between a
          customer and a professional only after a quote is accepted.
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          Customers and professionals see the details needed to do a job together. CNIC images are stored privately
          and are visible only to Ustad administrators for verification. We do not sell your data and we do not share
          it with third parties for advertising.
        </p>
        <p>
          We use service providers to run the app: Supabase (database, sign-in and file storage), Expo (push
          notification delivery), Google (maps, and speech recognition on your device) and an AI text service for the
          help feature above.
        </p>
      </Section>

      <Section title="Permissions the app asks for">
        <p>
          Camera and photos (CNIC, profile picture, job photos and video), microphone (voice notes, video sound,
          speaking instead of typing), location (nearby professionals and tracking) and notifications. You can turn
          any of these off in your phone settings; the related feature will then be unavailable.
        </p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>
          You can delete your account at any time from <strong>Account &rarr; Delete my account</strong> in the app, or
          on our{' '}
          <Link href="/delete-account/" className="text-primary underline">
            delete-account page
          </Link>
          . Deletion removes your name, phone, address, CNIC details and photos, profile photo, location and
          notifications and locks the sign-in for good. Records of completed jobs and payments are kept without your
          personal details, because the other person on the job still needs them and for accounting and dispute
          handling.
        </p>
      </Section>

      <Section title="Children">
        <p>Ustad is not meant for people under 18.</p>
      </Section>

      <Section title="Changes and contact">
        <p>We will update this page and its date when this policy changes.</p>
        {support ? (
          <p>
            Questions or requests:{' '}
            <a className="text-primary underline" href={`mailto:${support}`}>
              {support}
            </a>
          </p>
        ) : null}
      </Section>

      <p
        dir="rtl"
        lang="ur"
        className="mt-10 rounded-lg border border-border bg-surface p-4 text-sm leading-7 text-ink-body"
      >
        آپ کی معلومات (نام، فون، شناختی کارڈ اور تصاویر) صرف رجسٹریشن اور شناخت کی تصدیق کے لیے لی جاتی ہیں۔ شناختی کارڈ کی
        تصاویر نجی رکھی جاتی ہیں اور صرف ایڈمن کو نظر آتی ہیں۔ ہم آپ کا ڈیٹا فروخت نہیں کرتے۔ آپ ایپ میں اکاؤنٹ ← &ldquo;میرا
        اکاؤنٹ ختم کریں&rdquo; سے کسی بھی وقت اپنا اکاؤنٹ حذف کر سکتے ہیں۔
      </p>
    </main>
  );
}
