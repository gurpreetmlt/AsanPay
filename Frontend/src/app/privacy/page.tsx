'use client';

import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import BackgroundEffects from '@/components/BackgroundEffects';
import WaitlistModal from '@/components/WaitlistModal';
import Link from 'next/link';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { PRIVACY_POLICY_TEXT } from '@/content/privacyPolicy';

/** Section headings in the policy text: "A. INTRODUCTION", "F.2 Sharing Personal Information", "B.1 …". */
const HEADING = /^([A-L]\.\s+[A-Z]|[A-L]\.\d\s)/;

const [VERSION_LINE, ...PARAGRAPHS] = PRIVACY_POLICY_TEXT.split('\n\n');

export default function PrivacyPolicyPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="relative min-h-screen flex flex-col z-10 selection:bg-brand-blue-light/30 selection:text-white">
      {/* Background aurora, grid and floating Rupee coins */}
      <BackgroundEffects />

      {/* Navbar header */}
      <Navbar onOpenWaitlist={() => setModalOpen(true)} />

      {/* Main Privacy content wrapper */}
      <main className="flex-1 mx-auto max-w-4xl px-4 py-12 md:py-16 relative z-10">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-sora font-bold text-sm text-brand-blue-light dark:text-brand-green-light hover:underline mb-8 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light rounded-md p-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home / Main Page
        </Link>

        {/* Header card with glassmorphism */}
        <div className="glass-card rounded-3xl p-6 md:p-10 shadow-xl mb-10 overflow-hidden relative border border-neutral-200/50 dark:border-white/10">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-brand-blue-dark to-brand-green-dark" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-blue-light/10 dark:bg-brand-blue-dark/20 border border-brand-blue-light/20 dark:border-brand-blue-dark/30 flex items-center justify-center text-brand-blue-light dark:text-brand-blue-light/90">
              <ScrollText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-sora font-extrabold text-2xl md:text-4xl text-brand-blue-dark dark:text-neutral-100 transition-colors">
                Privacy Policy
              </h1>
              <p className="font-poppins text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                {VERSION_LINE}
              </p>
            </div>
          </div>
        </div>

        {/* Policy text — same as the Privacy Policy shown in the AsanPay app */}
        <div className="glass-card rounded-2xl p-6 md:p-8 border border-neutral-200/50 dark:border-white/10 shadow-lg space-y-3">
          {PARAGRAPHS.map((para, i) =>
            HEADING.test(para) ? (
              <h2
                key={i}
                className="font-sora font-bold text-base md:text-lg text-brand-blue-dark dark:text-neutral-100 pt-4 first:pt-0"
              >
                {para}
              </h2>
            ) : (
              <p
                key={i}
                className="font-poppins text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-line"
              >
                {para}
              </p>
            ),
          )}
        </div>

        {/* Back button at the bottom */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-sora font-bold text-sm bg-linear-to-r from-brand-blue-dark to-brand-blue-light hover:from-brand-blue-light hover:to-brand-blue-dark text-white px-6 py-3 rounded-xl shadow-lg transition-all hover:scale-105"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Homepage
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 py-8 relative z-10 mt-auto">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="font-sora font-semibold text-xs tracking-wider text-neutral-400 dark:text-neutral-500 uppercase">
            Payment Made Easy
          </p>
          <p className="font-poppins text-xs text-neutral-500 dark:text-neutral-600 mt-2">
            © {new Date().getFullYear()} AsanPay. All Rights Reserved.
          </p>
        </div>
      </footer>

      {/* The waitlist pop-up triggered by login/signup actions */}
      <WaitlistModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
