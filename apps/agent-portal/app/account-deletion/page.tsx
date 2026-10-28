"use client";

import Link from "next/link";
import { ArrowLeft, Clock, Mail, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { B, brand } from "@/lib/brand";

const SUPPORT_EMAIL = "help@asanpay.in";

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: B.secondary, color: B.blueLight }}
        >
          {icon}
        </div>
        <h2 className="text-base font-bold" style={{ color: B.blue }}>
          {title}
        </h2>
      </div>
      <div className="space-y-2 text-sm leading-relaxed" style={{ color: B.blueMid }}>
        {children}
      </div>
    </section>
  );
}

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen" style={{ background: B.bg }}>
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: B.blueLight }}
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
          Delete your {brand.name} account
        </h1>
        <p className="mt-1 text-xs" style={{ color: B.muted }}>
          How to request deletion, what we delete and what the law requires us to keep.
        </p>

        <div className="mt-6 space-y-4">
          <Section icon={<Smartphone size={18} />} title="Option 1 — From the app or website">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Log in to the {brand.name} app.</li>
              <li>
                Open <strong>Account</strong> and tap <strong>Delete account</strong>. On the website, open{" "}
                <strong>Settings → Legal and Help → Delete account</strong>.
              </li>
              <li>Add a reason if you want, then tap <strong>Request deletion</strong>.</li>
            </ol>
          </Section>

          <Section icon={<Mail size={18} />} title="Option 2 — By email">
            <p>
              Send an email to{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline" style={{ color: B.blueLight }}>
                {SUPPORT_EMAIL}
              </a>{" "}
              from the email address registered on your account. Include your registered mobile number and the
              subject <strong>Account deletion request</strong>. We may call your registered mobile to confirm it
              is you.
            </p>
          </Section>

          <Section icon={<Trash2 size={18} />} title="What we delete">
            <ul className="list-disc space-y-1 pl-5">
              <li>Your login access, password, PINs and saved devices.</li>
              <li>Your profile details that are not needed for legal records.</li>
              <li>Notification and marketing preferences.</li>
            </ul>
          </Section>

          <Section icon={<ShieldCheck size={18} />} title="What we keep, and for how long">
            <p>
              As a payments service we must keep certain records under Reserve Bank of India rules and the
              Prevention of Money Laundering Act:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Transaction, wallet and settlement records.</li>
              <li>KYC records (identity and address verification).</li>
            </ul>
            <p>
              These are kept securely for <strong>5 years</strong> after your account is closed, used only for
              legal and regulatory purposes, and then deleted.
            </p>
          </Section>

          <Section icon={<Clock size={18} />} title="Timeline">
            <p>
              We complete your request within <strong>30 days</strong>. Withdraw or settle your wallet balance
              before you send the request — a closed account cannot receive or send money.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
