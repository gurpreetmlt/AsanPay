'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { AGENT_LOGIN_URL, AGENT_SIGNUP_URL } from '@/lib/agentPortal';

interface NavbarProps {
  onOpenWaitlist: () => void;
}

export default function Navbar({ onOpenWaitlist }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md transition-colors duration-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between gap-4">

          <Link href="/" className="flex items-center gap-3.5 group focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light rounded-xl p-1 transition-all">
            <Logo size={42} className="transition-transform duration-500 group-hover:scale-105 group-hover:rotate-[8deg]" />
            <div className="flex flex-col">
              <span className="font-sora font-extrabold text-xl md:text-2xl leading-none text-brand-blue-dark dark:text-neutral-100 transition-colors duration-300">
                Asan<span className="text-brand-green-dark dark:text-brand-green-light">Pay</span>
              </span>
              <span className="font-poppins font-semibold text-[8px] md:text-[9px] tracking-[0.2em] uppercase text-neutral-500 dark:text-neutral-400 mt-1">
                Payment Made Easy
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            <Link
              href="/#services"
              className="font-poppins font-semibold text-sm text-neutral-600 dark:text-neutral-300 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light rounded-md px-2 py-1"
            >
              Services
            </Link>
            <Link
              href="/#benefits"
              className="font-poppins font-semibold text-sm text-neutral-600 dark:text-neutral-300 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light rounded-md px-2 py-1"
            >
              Agent Benefits
            </Link>
            <Link
              href="/#calculator"
              className="font-poppins font-semibold text-sm text-neutral-600 dark:text-neutral-300 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light rounded-md px-2 py-1"
            >
              Income Estimator
            </Link>
            <Link
              href="/privacy"
              className="font-poppins font-semibold text-sm text-neutral-600 dark:text-neutral-300 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light rounded-md px-2 py-1"
            >
              Privacy Policy
            </Link>
          </nav>

          <div className="hidden sm:flex items-center gap-4 ml-auto lg:ml-0">
            <ThemeToggle />
            <a
              href={AGENT_LOGIN_URL}
              className="font-sora font-bold text-sm text-neutral-700 dark:text-neutral-200 px-5 py-2.5 rounded-xl border border-neutral-300 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light"
            >
              Log in
            </a>
            <a
              href={AGENT_SIGNUP_URL}
              className="font-sora font-bold text-sm text-white px-5 py-2.5 rounded-xl bg-linear-to-r from-brand-blue-dark to-brand-blue-light hover:from-brand-blue-light hover:to-brand-blue-dark shadow-md shadow-brand-blue-dark/15 transition-all cursor-pointer hover:scale-105 active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              Get Started
            </a>
          </div>

          <div className="flex sm:hidden items-center gap-3 ml-auto">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          <div className="hidden sm:flex lg:hidden items-center ml-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-neutral-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-6 space-y-4 shadow-xl transition-all duration-300">
          <nav className="flex flex-col gap-4">
            <Link
              href="/#services"
              onClick={() => setMobileMenuOpen(false)}
              className="font-poppins font-medium text-base text-neutral-700 dark:text-neutral-200 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors"
            >
              Services
            </Link>
            <Link
              href="/#benefits"
              onClick={() => setMobileMenuOpen(false)}
              className="font-poppins font-medium text-base text-neutral-700 dark:text-neutral-200 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors"
            >
              Agent Benefits
            </Link>
            <Link
              href="/#calculator"
              onClick={() => setMobileMenuOpen(false)}
              className="font-poppins font-medium text-base text-neutral-700 dark:text-neutral-200 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors"
            >
              Income Estimator
            </Link>
            <Link
              href="/privacy"
              onClick={() => setMobileMenuOpen(false)}
              className="font-poppins font-medium text-base text-neutral-700 dark:text-neutral-200 hover:text-brand-blue-dark dark:hover:text-brand-blue-light transition-colors"
            >
              Privacy Policy
            </Link>
          </nav>

          <div className="flex flex-col sm:hidden gap-3 pt-4 border-t border-neutral-200 dark:border-white/10">
            <a
              href={AGENT_LOGIN_URL}
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center font-sora font-bold text-sm text-neutral-700 dark:text-neutral-200 py-3 rounded-xl border border-neutral-300 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
            >
              Log in
            </a>
            <a
              href={AGENT_SIGNUP_URL}
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center font-sora font-bold text-sm text-white py-3 rounded-xl bg-linear-to-r from-brand-blue-dark to-brand-blue-light dark:from-brand-blue-light dark:to-brand-blue-dark cursor-pointer"
            >
              Get Started
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenWaitlist();
              }}
              className="w-full text-center font-sora font-medium text-xs text-neutral-500 py-2"
            >
              Join waitlist (email)
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
