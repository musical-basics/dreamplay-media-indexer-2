import type { Metadata } from 'next';
import './globals.css';
import './split-editor.css';
import './style-library.css';

export const metadata: Metadata = {
  title: 'DreamPlay Media Indexer',
  description: 'AI-Powered Asset Search & Timeline Export for DreamPlay Pianos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
