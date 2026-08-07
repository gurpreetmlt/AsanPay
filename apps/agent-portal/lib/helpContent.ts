/**
 * Self-help guide content and FAQ — task #17. No video hosting exists anywhere in this
 * codebase, so these are written step-by-step guides rather than the "coming soon" video
 * placeholders they replace. Faster to ship, and arguably more useful on a slow rural
 * connection than a video would be.
 */
export interface HelpGuide {
  id: string;
  title: string;
  tag: string;
  steps: string[];
}

export const HELP_GUIDES: HelpGuide[] = [
  {
    id: "aeps-withdrawal",
    title: "AePS cash withdrawal",
    tag: "AePS",
    steps: [
      "Open AePS from the home screen and select Cash Withdrawal.",
      "Enter the customer's Aadhaar number and select their bank from the list.",
      "Have the customer place their finger on the biometric device — the capture must happen at your shop, not remotely.",
      "Enter the amount the customer wants to withdraw and confirm.",
      "Hand over the cash only after the screen shows Success and a receipt is generated — never before.",
      "If the transaction shows Pending for more than a few minutes, do not hand over cash. Check Transactions for the final status before paying out.",
    ],
  },
  {
    id: "dmt-transfer",
    title: "DMT money transfer",
    tag: "DMT",
    steps: [
      "Open DMT and search for the customer by mobile number, or add them as a new sender if this is their first transfer.",
      "Complete the sender's KYC (name, mobile, ID proof) the first time — this is a one-time step per sender.",
      "Add or select the beneficiary's bank account and IFSC code.",
      "Enter the transfer amount. The customer pays the amount plus the displayed service charge.",
      "Confirm with the transaction PIN. A successful transfer shows a UTR number — share this with the customer as their proof.",
      "If a transfer fails after the customer's cash is collected, do not repeat it immediately — check Transactions first. Failed transfers are auto-reconciled; money is never lost, only delayed.",
    ],
  },
  {
    id: "add-money",
    title: "Add money & Balance",
    tag: "Balance",
    steps: [
      "Your balance has two parts: Company balance (funded by your distributor, spendable on any service) and Settleable balance (earned from AePS/commission, withdrawable to your own bank).",
      "To add funds, deposit cash or transfer to the company bank account shown under Fund Request, then submit the request with the UTR and a photo of the receipt.",
      "Fund requests are matched automatically against the bank statement — most are credited within minutes during banking hours.",
      "To withdraw your earnings, use Settlements. Only the settleable portion can go to your own bank — deposited/company balance cannot be withdrawn as cash, only spent on services.",
    ],
  },
  {
    id: "pin-safety",
    title: "Transaction PIN safety",
    tag: "Security",
    steps: [
      "Your transaction PIN is required for every money-moving action — it is separate from your login password and MPIN.",
      "AsanPay staff will never call or message you asking for your PIN, OTP, or password. Anyone who does is attempting fraud — do not share it and report it via Raise Ticket.",
      "If you enter the wrong PIN too many times, it locks temporarily for your protection. Wait and retry rather than asking someone else to guess it.",
      "Change your PIN immediately from Settings → Security if you ever suspect it has been seen by someone else.",
    ],
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "A customer's AePS withdrawal failed but I already gave them cash. What do I do?",
    answer:
      "Do not give cash before the screen confirms Success — this is the one rule that prevents this situation. If it has already happened, check Transactions for the final status; AePS failures settle automatically within a short window. If the final status is a genuine failure, raise a dispute from the transaction row so it is tracked and reviewed, not just handled over WhatsApp.",
  },
  {
    question: "Why is AePS blocked on my account even though my balance is fine?",
    answer:
      "AePS has its own compliance checks separate from your balance: KYC must be verified, and the account must not be flagged for repeated biometric mismatches or long inactivity (90+ days without an AePS transaction, per RBI rules). Check Settings → KYC status first. If AePS still shows blocked, contact your distributor or raise a ticket — an admin can review and reactivate it after confirming your KYC.",
  },
  {
    question: "My services are switched off — can I still access my money?",
    answer:
      "Yes. A services restriction (soft or hard) never blocks your login, your balance, or settling your earned money to your bank — only new AePS/DMT transactions are paused while it's under review. Only a full account freeze — reserved for confirmed fraud — stops settlement, and that is never automatic.",
  },
  {
    question: "I registered a new biometric device but it says the serial is already in use.",
    answer:
      "That serial is currently active on another agent's account. If the device was genuinely handed over to you, ask the previous holder to de-register it from their Devices settings first, then register it on yours. This check exists to catch device sharing between accounts, which is treated as a fraud signal.",
  },
  {
    question: "How long does a fund request take to credit?",
    answer:
      "Most are matched against the bank statement automatically and credit within minutes during banking hours. If yours has been pending more than a few hours, it likely needs manual matching — check that the UTR you entered exactly matches the bank transfer, and that the amount and account are correct.",
  },
  {
    question: "How do I get my scanner fixed if it breaks?",
    answer:
      "Use Settings → Devices → Device Repair & Replacement to raise a repair request with the serial number and a description of the issue. This is tracked separately from a normal device swap, so it doesn't affect your account's device-change history.",
  },
];
