'use client';

import React, { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/Navbar';
import BackgroundEffects from '@/components/BackgroundEffects';
import WaitlistModal from '@/components/WaitlistModal';
import LegalLinks from './LegalLinks';

/** Same layout as the Privacy Policy page: header card, policy body card, footer. */
export default function LegalPageShell({
  title,
  versionLine,
  icon,
  children,
}: {
  title: string;
  versionLine: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="relative min-h-screen flex flex-col z-10 selection:bg-brand-blue-light/30 selection:text-white">
      <BackgroundEffects />
      <Navbar onOpenWaitlist={() => setModalOpen(true)} />

      <main className="flex-1 mx-auto max-w-4xl w-full px-4 py-12 md:py-16 relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-sora font-bold text-sm text-brand-blue-light dark:text-brand-green-light hover:underline mb-8 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light rounded-md p-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home / Main Page
        </Link>

        <div className="glass-card rounded-3xl p-6 md:p-10 shadow-xl mb-10 overflow-hidden relative border border-neutral-200/50 dark:border-white/10">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-brand-blue-dark to-brand-green-dark" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-blue-light/10 dark:bg-brand-blue-dark/20 border border-brand-blue-light/20 dark:border-brand-blue-dark/30 flex items-center justify-center text-brand-blue-light dark:text-brand-blue-light/90">
              {icon}
            </div>
            <div>
              <h1 className="font-sora font-extrabold text-2xl md:text-4xl text-brand-blue-dark dark:text-neutral-100 transition-colors">
                {title}
              </h1>
              <p className="font-poppins text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-1">{versionLine}</p>
            </div>
          </div>
        </div>

        {children}

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

      <footer className="border-t border-neutral-200 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 py-8 relative z-10 mt-auto">
        <div className="mx-auto max-w-7xl px-4 text-center space-y-4">
          <LegalLinks layout="row" />
          <p className="font-sora font-semibold text-xs tracking-wider text-neutral-400 dark:text-neutral-500 uppercase">
            Payment Made Easy
          </p>
          <p className="font-poppins text-xs text-neutral-500 dark:text-neutral-600">
            © {new Date().getFullYear()} AsanPay. All Rights Reserved.
          </p>
        </div>
      </footer>

      <WaitlistModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
