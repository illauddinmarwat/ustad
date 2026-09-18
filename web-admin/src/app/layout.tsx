import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Ustad Admin',
  description: 'Commission dashboard, payment verification, reports and settings for Ustad.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans antialiased">{children}</body>
    </html>
  );
}
