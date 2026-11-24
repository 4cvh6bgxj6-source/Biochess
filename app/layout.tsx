import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'BioChess · Scacchi Online',
  description:
    'Gioca a scacchi online su BioChess: sfida avversari con il solo username, gioca contro i bot e analizza Blunder, Mistake, Great e Brilliant.',
  openGraph: {
    title: 'BioChess · Scacchi Online',
    description:
      'Gioca a scacchi online su BioChess: sfida avversari con il solo username, gioca contro i bot e analizza Blunder, Mistake, Great e Brilliant.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BioChess · Scacchi Online',
    description:
      'Gioca a scacchi online su BioChess: sfida avversari con il solo username, gioca contro i bot e analizza Blunder, Mistake, Great e Brilliant.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning className="min-h-screen antialiased selection:bg-[#81B64C]/35 selection:text-white">
        {children}
      </body>
    </html>
  );
}
