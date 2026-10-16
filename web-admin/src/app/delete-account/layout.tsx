import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete account | Ustad',
  description: 'Permanently delete your Ustad account and personal data.',
};

export default function DeleteAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
