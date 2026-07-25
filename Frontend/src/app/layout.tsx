import type { Metadata } from 'next';
import { Sora, Poppins } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AsanPay — B2B Agent-Banking Super App',
  description: 'Payment Made Easy. Aadhaar Cash Withdrawal (AEPS), Domestic Money Transfer (DMT), BBPS Bill Payments & Instant Settlements for retailers in India.',
  keywords: 'AsanPay, AEPS, DMT, BBPS, Agent Banking, Fintech India, rural banking, money transfer',
  authors: [{ name: 'AsanPay team' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${poppins.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col transition-colors duration-300">
        {children}
      </body>
    </html>
  );
}
