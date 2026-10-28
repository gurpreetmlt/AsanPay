import type { Metadata } from 'next';
import { ScrollText } from 'lucide-react';
import { TERMS_TEXT } from '@/content/termsOfService';
import LegalPageShell from '../_components/LegalPageShell';
import PolicyText from '../_components/PolicyText';

export const metadata: Metadata = {
  title: 'Terms & Conditions — AsanPay',
  description: 'Terms & Conditions for AsanPay super distributors, distributors, retailers and agents.',
};

/** "1. GENERAL", "5. INFORMATION SECURITY – DO’S AND DON’TS", "A. AEPS, …", "Level 1". */
const HEADING =
  /^(\d{1,2}\.\s+[A-Z][A-Z0-9 ,&’'()/–-]+$|SERVICE-SPECIFIC OBLIGATIONS$|[A-E]\.\s+[A-Z][^.\n]{0,80}$|Level \d$)/;

const [VERSION_LINE, ...PARAGRAPHS] = TERMS_TEXT.split('\n\n');

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms & Conditions" versionLine={VERSION_LINE} icon={<ScrollText className="w-6 h-6" />}>
      <PolicyText paragraphs={PARAGRAPHS} heading={HEADING} />
    </LegalPageShell>
  );
}
