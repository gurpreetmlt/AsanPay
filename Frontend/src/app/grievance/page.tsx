import type { Metadata } from 'next';
import { Clock, Headphones, Mail, MapPin, MessageSquareWarning, Phone, UserCheck } from 'lucide-react';
import LegalPageShell from '../_components/LegalPageShell';
import PolicyText from '../_components/PolicyText';

export const metadata: Metadata = {
  title: 'Grievance Redressal — AsanPay',
  description: 'How to raise and escalate a complaint with AsanPay, and the Grievance Officer contact details.',
};

const COMPANY_ADDRESS =
  'ASANPAY INNOVATION PRIVATE LIMITED, H No. 103, Street No. 10, Main Bazar, Birla Road, Malout, District Sri Muktsar Sahib, Punjab 152107';
const GRIEVANCE_EMAIL_SUBJECT = 'Attn: Grievance Officer';

/** Officer details and timelines match section 19 of the Terms and section K of the Privacy Policy. */
const LEVELS = [
  {
    level: 'Level 1',
    title: 'Customer Support',
    icon: Headphones,
    when: 'Start here for any query or complaint.',
    rows: [
      { icon: Phone, label: 'Phone', value: '9780777781', href: 'tel:+919780777781' },
      { icon: Mail, label: 'Email', value: 'help@asanpay.in', href: 'mailto:help@asanpay.in' },
      { icon: Clock, label: 'Hours', value: 'Business days (except public holidays)' },
    ],
  },
  {
    level: 'Level 2',
    title: 'Grievance Officer',
    icon: UserCheck,
    when: 'If Level 1 does not resolve it, quote your earlier complaint reference.',
    rows: [
      { icon: UserCheck, label: 'Name', value: 'Ajay Kumar, Director & Grievance Officer' },
      {
        icon: Mail,
        label: 'Email',
        value: `help@asanpay.in (subject: “${GRIEVANCE_EMAIL_SUBJECT}”)`,
        href: `mailto:help@asanpay.in?subject=${encodeURIComponent(GRIEVANCE_EMAIL_SUBJECT)}`,
      },
      { icon: Clock, label: 'Hours', value: 'Business days (except public holidays)' },
    ],
  },
  {
    level: 'Level 3',
    title: 'Nodal Officer',
    icon: MapPin,
    when: 'If the Grievance Officer does not resolve it.',
    rows: [
      { icon: UserCheck, label: 'Kind attention', value: 'Ajay Kumar, Director' },
      {
        icon: Mail,
        label: 'Email',
        value: `help@asanpay.in (subject: “${GRIEVANCE_EMAIL_SUBJECT}”)`,
        href: `mailto:help@asanpay.in?subject=${encodeURIComponent(GRIEVANCE_EMAIL_SUBJECT)}`,
      },
      { icon: MapPin, label: 'Address', value: COMPANY_ADDRESS },
      { icon: Phone, label: 'Phone', value: '9780777781 (business days)', href: 'tel:+919780777781' },
    ],
  },
] as const;

const TIMELINE = [
  { label: 'Acknowledgement', value: 'Within 24 hours of receipt' },
  { label: 'Resolution', value: 'Within 15 days of receipt, or any shorter period required by law' },
  { label: 'Escalate', value: 'To the next level if not resolved in time or if you disagree with the outcome' },
] as const;

const GRIEVANCE_TEXT = `A. HOW TO RAISE A COMPLAINT

Raise your complaint through Support in the AsanPay app or web portal, or contact Customer Support by phone or email. Include your registered mobile number, the transaction ID (if any), the date and amount, and a short description of the problem.

Never share your password, MPIN, OTP or full card or bank details with anyone, including AsanPay staff. We will never ask for them.

B. WHO CAN USE THIS PROCESS

Agents (super distributors, distributors and retailers) and customers who transacted at an AsanPay agent outlet can use this process. Customers can also ask the agent to raise the complaint on their behalf.

C. FURTHER ESCALATION

If a complaint about a bank or other RBI-regulated Service Partner is not resolved within 30 days, the customer may approach the RBI Integrated Ombudsman at https://cms.rbi.org.in under that entity’s rules.

Grievances about personal data that are not resolved may be taken to the Data Protection Board of India, as set out in our Privacy Policy.`;

const HEADING = /^[A-C]\.\s+[A-Z][A-Z ]+$/;

export default function GrievancePage() {
  return (
    <LegalPageShell
      title="Grievance Redressal"
      versionLine="How to raise a complaint, who to contact, and how long it takes"
      icon={<MessageSquareWarning className="w-6 h-6" />}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {LEVELS.map(({ level, title, icon: Icon, when, rows }) => (
          <section
            key={level}
            className="glass-card rounded-2xl p-5 border border-neutral-200/50 dark:border-white/10 shadow-lg flex flex-col"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-blue-light/10 dark:bg-brand-blue-dark/20 border border-brand-blue-light/20 flex items-center justify-center text-brand-blue-light">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="font-sora font-bold text-[11px] uppercase tracking-wider text-brand-green-dark dark:text-brand-green-light">
                  {level}
                </p>
                <h2 className="font-sora font-bold text-base text-brand-blue-dark dark:text-neutral-100">{title}</h2>
              </div>
            </div>
            <p className="font-poppins text-xs text-neutral-500 dark:text-neutral-400 mb-3">{when}</p>
            <dl className="space-y-2.5 font-poppins text-sm mt-auto">
              {rows.map((row) => (
                <div key={row.label} className="flex gap-2">
                  <row.icon className="w-4 h-4 mt-0.5 shrink-0 text-neutral-400" />
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{row.label}</dt>
                    <dd className="text-neutral-700 dark:text-neutral-200 break-words">
                      {'href' in row && row.href ? (
                        <a href={row.href} className="hover:text-brand-blue-light hover:underline">
                          {row.value}
                        </a>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-5 md:p-6 border border-neutral-200/50 dark:border-white/10 shadow-lg mb-6">
        <h2 className="font-sora font-bold text-base md:text-lg text-brand-blue-dark dark:text-neutral-100 mb-4">
          Timelines
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TIMELINE.map((t, i) => (
            <li
              key={t.label}
              className="rounded-xl border border-neutral-200/60 dark:border-white/10 p-4 bg-white/50 dark:bg-white/5"
            >
              <p className="font-sora font-bold text-xs uppercase tracking-wider text-brand-blue-light">
                {i + 1}. {t.label}
              </p>
              <p className="font-poppins text-sm text-neutral-600 dark:text-neutral-300 mt-1">{t.value}</p>
            </li>
          ))}
        </ol>
      </div>

      <PolicyText paragraphs={GRIEVANCE_TEXT.split('\n\n')} heading={HEADING} />
    </LegalPageShell>
  );
}
