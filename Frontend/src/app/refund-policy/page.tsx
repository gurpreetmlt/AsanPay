import type { Metadata } from 'next';
import { ReceiptText } from 'lucide-react';
import LegalPageShell from '../_components/LegalPageShell';
import PolicyText from '../_components/PolicyText';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — AsanPay',
  description: 'How failed transactions, reversals and disputes are refunded on AsanPay.',
};

const REFUND_POLICY_TEXT = `Version 1.0  |  Effective Date: 28 October 2026

A. SCOPE

This Refund and Cancellation Policy applies to transactions made by super distributors, distributors, retailers and agents (“You”) through the AsanPay website/portal https://asanpay.in and the AsanPay mobile application (together, the “Platform”), operated by ASANPAY INNOVATION PRIVATE LIMITED (“ASANPAY”). Read it together with the Terms & Conditions and the Privacy Policy.

ASANPAY is a technology and distribution platform. Each transaction is processed, settled and, where applicable, reversed by the relevant Service Partner, such as a bank, payment aggregator, BBPS operating unit or other authorised entity.

B. FAILED TRANSACTIONS

B.1 If a transaction fails, the amount debited from Your wallet is refunded automatically to the same wallet. You do not need to raise a request.

B.2 Most failed transactions are refunded immediately. Where the Service Partner confirms the final status later, the refund is credited as soon as the failure is confirmed.

B.3 A transaction shown as Pending or Processing has not failed yet. Do not repeat it for the same customer; wait for the final status in Your transaction history.

B.4 Any charge or commission linked to a failed transaction is reversed together with the refund.

C. SUCCESSFUL TRANSACTIONS

C.1 Successful recharges, bill payments (including BBPS), money transfers, AEPS and Aadhaar Pay transactions, cash collections and wallet transfers cannot be cancelled or refunded by ASANPAY.

C.2 A successful transaction is refunded only if the Service Partner reverses it, for example when an operator or biller rejects a payment after it was marked successful. The reversal is credited to Your wallet once ASANPAY receives it from the Service Partner.

C.3 ASANPAY is not responsible for an amount sent to a wrong mobile number, consumer number or bank account because the details were entered incorrectly. We will help You raise a recovery request with the Service Partner, but recovery is not guaranteed.

D. TRAVEL BOOKINGS

D.1 Cancellation and refund of flight, bus, hotel and railway bookings follow the rules of the airline, operator, hotel or railway e-ticketing partner shown at the time of booking. The refund received from them is credited to Your wallet after their cancellation charges.

E. WALLET LOADS AND ACCOUNT CLOSURE

E.1 A fund request that is rejected is not credited to Your wallet. If Your bank account was debited for a rejected or duplicate load, the amount is returned to the same bank account after verification.

E.2 When Your account is closed, any wallet balance left after settling dues is paid to Your verified bank account, as set out in the Terms & Conditions.

F. DISPUTES

F.1 If a transaction status looks wrong or a refund has not reached Your wallet, raise a dispute within 30 days of the transaction date through Support in the AsanPay app or web portal, or by email to help@asanpay.in with the transaction ID.

F.2 Disputes raised after 30 days may not be accepted, because Service Partners close their reconciliation windows.

F.3 We acknowledge a dispute within 24 hours and resolve it within 15 days of receipt, or any shorter period required by law. If You are not satisfied, escalate it as described in our Grievance Redressal policy at https://asanpay.in/grievance.

G. CUSTOMER REFUNDS

G.1 If a customer paid You cash for a transaction that failed and was refunded to Your wallet, You must return that amount to the customer promptly.

H. CONTACT

Customer Support

Phone: 9780777781

Email: help@asanpay.in

Hours: Business days (except public holidays)`;

const HEADING = /^[A-H]\.\s+[A-Z][A-Z ]+$/;

const [VERSION_LINE, ...PARAGRAPHS] = REFUND_POLICY_TEXT.split('\n\n');

export default function RefundPolicyPage() {
  return (
    <LegalPageShell
      title="Refund & Cancellation Policy"
      versionLine={VERSION_LINE}
      icon={<ReceiptText className="w-6 h-6" />}
    >
      <PolicyText paragraphs={PARAGRAPHS} heading={HEADING} />
    </LegalPageShell>
  );
}
