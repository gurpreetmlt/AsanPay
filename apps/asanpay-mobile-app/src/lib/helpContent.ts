/**
 * FAQ content for the mobile SupportModal — task #17. Mirrors the agent-portal web content
 * (apps/agent-portal/lib/helpContent.ts) but kept as a separate copy: mobile and web are
 * separate packages with no shared UI-content module in this monorepo.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "AePS withdrawal failed but I already gave cash — what now?",
    answer:
      "Never hand over cash before the screen confirms Success. If it already happened, check Transactions for the final status — AePS failures settle automatically within a short window. If it's a genuine failure, raise a ticket so it's tracked properly instead of over WhatsApp.",
  },
  {
    question: "Why is AePS blocked even though my balance is fine?",
    answer:
      "AePS has its own checks: KYC must be verified, and the account must not be flagged for repeated biometric mismatches or 90+ days of inactivity. Check your KYC status first, then contact your distributor or raise a ticket.",
  },
  {
    question: "My services are off — can I still access my money?",
    answer:
      "Yes. A services restriction never blocks login, balance, or settling earned money to your bank — only new AePS/DMT transactions pause. Only a full freeze (confirmed fraud only) stops settlement, and that's never automatic.",
  },
  {
    question: "Device says the serial is already in use — why?",
    answer:
      "That scanner is active on another agent's account. If it was genuinely handed to you, ask them to de-register it first from their Devices settings, then register it on yours.",
  },
  {
    question: "How long does a fund request take?",
    answer:
      "Most match automatically within minutes during banking hours. If pending for hours, double-check the UTR matches the bank transfer exactly.",
  },
];
