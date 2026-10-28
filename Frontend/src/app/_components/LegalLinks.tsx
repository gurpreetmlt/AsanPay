import Link from 'next/link';
import { AGENT_WEB_URL } from '@/lib/agentPortal';

export const LEGAL_LINKS: Array<{ href: string; label: string; external?: boolean }> = [
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refund-policy', label: 'Refund Policy' },
  { href: '/grievance', label: 'Grievance Redressal' },
  { href: `${AGENT_WEB_URL}/account-deletion`, label: 'Account Deletion', external: true },
];

const LINK_CLASS =
  'text-neutral-500 dark:text-neutral-400 hover:text-brand-blue-light hover:underline transition-colors';

/** Footer list (home page column) or inline row (legal pages). */
export default function LegalLinks({ layout = 'list' }: { layout?: 'list' | 'row' }) {
  if (layout === 'row') {
    return (
      <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-poppins text-xs">
        {LEGAL_LINKS.map((l) =>
          l.external ? (
            <a key={l.href} href={l.href} className={LINK_CLASS}>
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href} className={LINK_CLASS}>
              {l.label}
            </Link>
          ),
        )}
      </nav>
    );
  }
  return (
    <ul className="space-y-2.5 font-poppins text-xs">
      {LEGAL_LINKS.map((l) => (
        <li key={l.href}>
          {l.external ? (
            <a href={l.href} className={LINK_CLASS}>
              {l.label}
            </a>
          ) : (
            <Link href={l.href} className={LINK_CLASS}>
              {l.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
