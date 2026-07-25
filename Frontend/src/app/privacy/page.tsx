'use client';

import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import BackgroundEffects from '@/components/BackgroundEffects';
import WaitlistModal from '@/components/WaitlistModal';
import Link from 'next/link';
import { ArrowLeft, Shield, Key, Eye, UserCheck, ScrollText } from 'lucide-react';

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
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-brand-blue-light/10 dark:bg-brand-blue-dark/20 border border-brand-blue-light/20 dark:border-brand-blue-dark/30 flex items-center justify-center text-brand-blue-light dark:text-brand-blue-light/90">
              <ScrollText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-sora font-extrabold text-2xl md:text-4xl text-brand-blue-dark dark:text-neutral-100 transition-colors">
                Privacy Policy
              </h1>
              <p className="font-poppins text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Last updated: July 14, 2026
              </p>
            </div>
          </div>
          <p className="font-poppins text-sm md:text-base text-neutral-600 dark:text-neutral-300 leading-relaxed mt-4">
            AsanPay is committed to protecting your privacy. This Privacy Policy describes how we collect, use, and protect your personal information when you use our website, mobile application, and agent banking services (AEPS, DMT, BBPS, and Settlement).
          </p>
        </div>

        {/* Policy Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-neutral-200/50 dark:border-white/10 shadow-lg">
            <h2 className="font-sora font-bold text-lg md:text-xl text-brand-blue-dark dark:text-neutral-100 flex items-center gap-3 mb-4">
              <Eye className="w-5 h-5 text-brand-blue-light dark:text-brand-green-light" />
              1. Information We Collect
            </h2>
            <div className="font-poppins text-sm md:text-base text-neutral-600 dark:text-neutral-300 space-y-3 leading-relaxed">
              <p>
                To onboard you as a retailer banking agent and provide financial services, we collect:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Identity Information:</strong> Name, mobile number, email address, physical shop address, PAN, and Aadhaar number.</li>
                <li><strong>KYC Documents:</strong> Copy of PAN card, Aadhaar card, and biometric data (fingerprint scans) for AePS transactions.</li>
                <li><strong>Transaction Records:</strong> History of money transfers, bill payments, withdrawals, commission logs, and settlement status.</li>
                <li><strong>Device Information:</strong> IP address, device ID, operating system version, and biometric scanner connectivity logs.</li>
              </ul>
            </div>
          </div>

          {/* Section 2 */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-neutral-200/50 dark:border-white/10 shadow-lg">
            <h2 className="font-sora font-bold text-lg md:text-xl text-brand-blue-dark dark:text-neutral-100 flex items-center gap-3 mb-4">
              <UserCheck className="w-5 h-5 text-brand-blue-light dark:text-brand-green-light" />
              2. How We Use Your Information
            </h2>
            <div className="font-poppins text-sm md:text-base text-neutral-600 dark:text-neutral-300 space-y-3 leading-relaxed">
              <p>
                We use the collected information for the following business purposes:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>To verify your identity and complete merchant onboarding (KYC) in compliance with RBI guidelines.</li>
                <li>To process Aadhaar Enabled Payment System (AePS) cash withdrawals and instant money transfers (DMT).</li>
                <li>To calculate, log, and credit commission earnings and settle money to your linked bank account.</li>
                <li>To send transactional updates, bill receipts, security alerts, and customer support communications.</li>
              </ul>
            </div>
          </div>

          {/* Section 3 */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-neutral-200/50 dark:border-white/10 shadow-lg">
            <h2 className="font-sora font-bold text-lg md:text-xl text-brand-blue-dark dark:text-neutral-100 flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-brand-blue-light dark:text-brand-green-light" />
              3. Data Security & Storage Guidelines
            </h2>
            <div className="font-poppins text-sm md:text-base text-neutral-600 dark:text-neutral-300 space-y-3 leading-relaxed">
              <p>
                AsanPay takes security very seriously. We align with industry standards including:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Biometric Data:</strong> Fingerprints scanned for AePS are encrypted instantly and transmitted directly to UIDAI/NPCI servers. We do NOT store biometric credentials on our local servers.</li>
                <li><strong>Encryption:</strong> All API communications are secured using industry-standard SSL/TLS encryption.</li>
                <li><strong>RBI & NPCI Standards:</strong> Our platform is built to fulfill security guidelines issued by the National Payments Corporation of India (NPCI) and Reserve Bank of India (RBI).</li>
              </ul>
            </div>
          </div>

          {/* Section 4 */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-neutral-200/50 dark:border-white/10 shadow-lg">
            <h2 className="font-sora font-bold text-lg md:text-xl text-brand-blue-dark dark:text-neutral-100 flex items-center gap-3 mb-4">
              <Key className="w-5 h-5 text-brand-blue-light dark:text-brand-green-light" />
              4. Data Sharing & Third-Party Integrations
            </h2>
            <p className="font-poppins text-sm md:text-base text-neutral-600 dark:text-neutral-300 leading-relaxed">
              We share transactional and identity data only with licensed partner banks (e.g. Yes Bank, ICICI Bank, IndusInd Bank) that sponsor our AePS/DMT gateways, and biller organizations via the BBPS network. We do not sell or rent merchant details to third-party marketing companies.
            </p>
          </div>

          {/* Section 5 */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-neutral-200/50 dark:border-white/10 shadow-lg">
            <h2 className="font-sora font-bold text-lg md:text-xl text-brand-blue-dark dark:text-neutral-100 flex items-center gap-3 mb-4">
              5. Contact Us
            </h2>
            <p className="font-poppins text-sm md:text-base text-neutral-600 dark:text-neutral-300 leading-relaxed">
              If you have any questions about this Privacy Policy or data handling, you can contact our grievance officer at:
              <br />
              <strong className="block mt-2 text-brand-blue-light dark:text-brand-green-light">
                Email: support@asanpay.in
              </strong>
              <span>Corporate Address: AsanPay Fintech Private Limited, Level 4, fintech hub, Sector 62, Noida, Uttar Pradesh, India.</span>
            </p>
          </div>
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
