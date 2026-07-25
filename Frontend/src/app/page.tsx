'use client';

import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Fingerprint,
  Send,
  Receipt,
  Zap,
  Users,
  MapPin,
  Activity,
  Check,
  ChevronRight,
  Wallet,
  TrendingUp,
  Phone,
  Mail,
  Building,
  ShieldCheck
} from 'lucide-react';
import Logo from '@/components/Logo';
import Navbar from '@/components/Navbar';
import Countdown from '@/components/Countdown';
import WaitlistModal from '@/components/WaitlistModal';
import BackgroundEffects from '@/components/BackgroundEffects';
import Link from 'next/link';
import { AGENT_SIGNUP_URL } from '@/lib/agentPortal';

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Typewriter effect states
  const [typedText, setTypedText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(80);

  const phrases = [
    "Banking, har dukaan tak.",
    "Tarakki, har Adhikari tak.",
    "Services, har gaon tak.",
    "Aamdani, har mahine tak."
  ];

  useEffect(() => {
    let timer: NodeJS.Timeout;

    // Disable animation if reduced motion is preferred
    if (shouldReduceMotion) {
      setTypedText(phrases[0]);
      return;
    }

    const currentPhrase = phrases[phraseIndex % phrases.length];

    const handleTyping = () => {
      if (!isDeleting) {
        setTypedText(currentPhrase.substring(0, typedText.length + 1));
        setTypingSpeed(85);

        if (typedText === currentPhrase) {
          timer = setTimeout(() => setIsDeleting(true), 2500); // Wait at end
          return;
        }
      } else {
        setTypedText(currentPhrase.substring(0, typedText.length - 1));
        setTypingSpeed(45);

        if (typedText === '') {
          setIsDeleting(false);
          setPhraseIndex((prev) => prev + 1);
          setTypingSpeed(200); // Pause before next phrase
        }
      }
    };

    timer = setTimeout(handleTyping, typingSpeed);
    return () => clearTimeout(timer);
  }, [typedText, isDeleting, phraseIndex, typingSpeed, shouldReduceMotion]);


  // Slider inputs for interactive calculator
  const [aepsCount, setAepsCount] = useState(15);
  const [dmtCount, setDmtCount] = useState(5);
  const [bbpsCount, setBbpsCount] = useState(25);
  const [calculatedEarnings, setCalculatedEarnings] = useState(0);

  // Recalculate estimated commission when sliders change
  useEffect(() => {
    // AEPS commission: ~₹7 per cash withdrawal on average
    // DMT commission: ~₹15 per money transfer transaction on average
    // BBPS/Recharge commission: ~₹2 per bill/recharge on average
    const monthlyAeps = aepsCount * 7 * 30;
    const monthlyDmt = dmtCount * 15 * 30;
    const monthlyBbps = bbpsCount * 2 * 30;

    setCalculatedEarnings(monthlyAeps + monthlyDmt + monthlyBbps);
  }, [aepsCount, dmtCount, bbpsCount]);

  // Framer Motion animation configurations
  const fadeInUp = shouldReduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 30 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-100px' },
        transition: { duration: 0.6 }
      };

  return (
    <div className="relative min-h-screen flex flex-col z-10 selection:bg-brand-blue-light/30 selection:text-white">

      {/* Aurora, subtle grid and Rupee coins drifting backgrounds */}
      <BackgroundEffects />

      {/* Navigation header bar */}
      <Navbar onOpenWaitlist={() => setModalOpen(true)} />

      {/* Main Home Sections */}
      <main className="flex-1 w-full relative z-10">

        {/* ================= HERO SECTION ================= */}
        <section id="hero" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-20 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

            {/* Left Hero Marketing Details */}
            <div className="lg:col-span-7 flex flex-col text-center lg:text-left items-center lg:items-start">

              {/* Coming Soon Pill Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-brand-blue-light/20 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur-md mb-6 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green-dark opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-green-light"></span>
                </span>
                <span className="font-sora font-extrabold text-[10px] sm:text-xs tracking-wider uppercase text-neutral-600 dark:text-neutral-300">
                  Coming Soon / Bilkul Aane Wala Hai
                </span>
              </div>

              {/* Float Logo (Only animated if prefers-reduced-motion is false) */}
              <motion.div
                animate={shouldReduceMotion ? {} : { y: [0, -10, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="mb-6 lg:hidden"
              >
                <Logo size={96} className="shadow-2xl shadow-brand-blue-dark/20 dark:shadow-none" />
              </motion.div>

              {/* Floating logo for desktop layout */}
              <motion.div
                animate={shouldReduceMotion ? {} : { y: [0, -12, 0] }}
                transition={{
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="hidden lg:block mb-8"
              >
                <Logo size={100} className="shadow-2xl shadow-brand-blue-dark/20 dark:shadow-none" />
              </motion.div>

              {/* Big Headline */}
              <h1 className="font-sora font-extrabold text-4xl sm:text-5xl md:text-6xl tracking-tight leading-tight max-w-xl text-neutral-900 dark:text-neutral-100 transition-colors min-h-[120px] sm:min-h-[140px] md:min-h-[160px] flex items-center lg:items-start">
                <span className="bg-linear-to-r from-brand-blue-light via-blue-500 to-brand-green-light bg-clip-text text-transparent drop-shadow-xs">
                  {typedText}
                </span>
                <span className="inline-block w-1.5 h-10 md:h-12 bg-brand-green-light dark:bg-brand-green-light ml-1 animate-pulse shrink-0 self-center lg:self-start mt-1.5" />
              </h1>

              {/* Tagline */}
              <p className="font-sora font-extrabold text-lg sm:text-xl md:text-2xl mt-4 text-brand-blue-dark dark:text-neutral-200">
                Payment <span className="bg-linear-to-r from-brand-green-dark to-brand-green-light bg-clip-text text-transparent">Made Easy</span>
              </p>

              {/* Hinglish Description */}
              <p className="font-poppins font-normal text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-6 max-w-xl leading-relaxed">
                AsanPay ke sath apni dukaan ko digital bank banayein. Apne aaspas ke customers ko <strong>Aadhaar cash withdrawal (AePS), money transfer (DMT), and bill payments (BBPS)</strong> ki service dein, aur har service par payiye behtareen commission.
              </p>

              {/* Live Countdown Clock */}
              <Countdown />

              {/* Hero Call-to-actions */}
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <a
                  href={AGENT_SIGNUP_URL}
                  className="px-8 py-4 rounded-xl bg-linear-to-r from-brand-blue-dark to-brand-blue-light dark:from-brand-blue-light dark:to-brand-blue-dark hover:from-brand-blue-light hover:to-brand-blue-dark text-white font-sora font-bold text-base shadow-lg shadow-brand-blue-dark/20 hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-2 group"
                >
                  Become an Agent / Register Now
                  <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href="/#services"
                  className="px-8 py-4 rounded-xl border border-neutral-300 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-200 font-sora font-bold text-base hover:scale-105 transition-all cursor-pointer flex items-center justify-center"
                >
                  Learn More
                </a>
              </div>

            </div>

            {/* Right Column: High-Fidelity App Interactive Dashboard Mockup */}
            <div className="lg:col-span-5 flex justify-center w-full relative">
              <div className="absolute inset-0 bg-linear-to-tr from-brand-blue-light/10 to-brand-green-light/10 blur-3xl rounded-full" />

              {/* Main Card container */}
              <div className="glass-card rounded-3xl p-5 md:p-6 w-full max-w-sm shadow-2xl relative border border-neutral-200/60 dark:border-white/15 overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1.5 bg-linear-to-r from-brand-blue-dark via-brand-blue-light to-brand-green-light" />

                {/* Dashboard Header */}
                <div className="flex items-center justify-between pb-4 border-b border-neutral-200/80 dark:border-white/10 mb-5">
                  <div className="flex items-center gap-2">
                    <Logo size={28} />
                    <span className="font-sora font-extrabold text-sm dark:text-white">Adhikari Portal</span>
                  </div>
                  <div className="px-2 py-0.5 rounded-full bg-brand-green-dark/10 text-brand-green-dark dark:text-brand-green-light font-poppins font-bold text-[9px] uppercase tracking-wider">
                    Online
                  </div>
                </div>

                {/* Profile detail */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="font-poppins text-[10px] text-neutral-400 dark:text-neutral-500">Retailer Agent / Adhikari</p>
                    <p className="font-sora font-extrabold text-sm text-neutral-800 dark:text-neutral-200">Ramesh Kumar</p>
                  </div>
                  <p className="font-mono text-[9px] text-neutral-400 dark:text-neutral-500 border border-neutral-200 dark:border-white/5 px-2 py-1 rounded bg-neutral-100/50 dark:bg-slate-900/50">
                    ID: AP28490
                  </p>
                </div>

                {/* Earnings & Wallet balances grids */}
                <div className="grid grid-cols-2 gap-3.5 mb-5">
                  <div className="bg-neutral-50 dark:bg-slate-900/50 border border-neutral-200/50 dark:border-white/5 rounded-2xl p-3">
                    <p className="font-poppins text-[10px] text-neutral-400 dark:text-neutral-500">Today&apos;s Earnings</p>
                    <p className="font-sora font-extrabold text-lg text-brand-green-dark dark:text-brand-green-light mt-0.5">₹1,245.00</p>
                    <span className="font-poppins text-[8px] text-neutral-400 dark:text-neutral-500 flex items-center gap-1 mt-1">
                      <TrendingUp className="w-2.5 h-2.5 text-brand-green-dark dark:text-brand-green-light" />
                      +14% from yesterday
                    </span>
                  </div>

                  <div className="bg-neutral-50 dark:bg-slate-900/50 border border-neutral-200/50 dark:border-white/5 rounded-2xl p-3">
                    <p className="font-poppins text-[10px] text-neutral-400 dark:text-neutral-500">Settlement Wallet</p>
                    <p className="font-sora font-extrabold text-lg text-brand-blue-dark dark:text-neutral-200 mt-0.5">₹48,930.50</p>
                    <span className="font-poppins text-[8px] text-neutral-400 dark:text-brand-blue-light flex items-center gap-1 mt-1 hover:underline cursor-pointer">
                      Settle now &rarr;
                    </span>
                  </div>
                </div>

                {/* Active/Recent transactions Feed */}
                <div className="mb-5">
                  <p className="font-sora font-extrabold text-[11px] text-neutral-500 dark:text-neutral-400 mb-3 uppercase tracking-wider">
                    Recent Transactions
                  </p>
                  <div className="space-y-2.5">
                    {/* Tx 1 */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/50 dark:bg-slate-950/30 border border-neutral-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-green-dark/10 flex items-center justify-center text-brand-green-dark dark:text-brand-green-light">
                          <Fingerprint className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-sora font-bold text-xs text-neutral-800 dark:text-neutral-200">AePS Withdrawal</p>
                          <p className="font-poppins text-[9px] text-neutral-400 dark:text-neutral-500">2 mins ago · Aadhaar Cash</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-sora font-extrabold text-xs text-brand-green-dark dark:text-brand-green-light">+₹5,000</p>
                        <span className="text-[7px] px-1 rounded-sm bg-brand-green-dark/10 text-brand-green-dark dark:text-brand-green-light">Success</span>
                      </div>
                    </div>

                    {/* Tx 2 */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/50 dark:bg-slate-950/30 border border-neutral-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-blue-light/10 flex items-center justify-center text-brand-blue-dark dark:text-brand-blue-light">
                          <Send className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-sora font-bold text-xs text-neutral-800 dark:text-neutral-200">Money Transfer (DMT)</p>
                          <p className="font-poppins text-[9px] text-neutral-400 dark:text-neutral-500">10 mins ago · SBI Transfer</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-sora font-extrabold text-xs text-neutral-800 dark:text-neutral-200">₹2,500</p>
                        <span className="text-[7px] px-1 rounded-sm bg-brand-green-dark/10 text-brand-green-dark dark:text-brand-green-light">Success</span>
                      </div>
                    </div>

                    {/* Tx 3 */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/50 dark:bg-slate-950/30 border border-neutral-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-green-light/10 flex items-center justify-center text-brand-green-dark dark:text-brand-green-light">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-sora font-bold text-xs text-neutral-800 dark:text-neutral-200">BBPS Bill Paid</p>
                          <p className="font-poppins text-[9px] text-neutral-400 dark:text-neutral-500">1 hour ago · Electricity</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-sora font-extrabold text-xs text-neutral-800 dark:text-neutral-200">₹850</p>
                        <span className="text-[7px] px-1 rounded-sm bg-brand-green-dark/10 text-brand-green-dark dark:text-brand-green-light">Success</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Instant Settlement Badge */}
                <div className="p-3 bg-brand-blue-dark/5 dark:bg-brand-blue-light/5 border border-brand-blue-dark/10 dark:border-brand-blue-light/15 rounded-2xl flex items-start gap-2.5">
                  <Zap className="w-5 h-5 text-brand-blue-dark dark:text-brand-blue-light mt-0.5 shrink-0" />
                  <div>
                    <p className="font-sora font-bold text-xs text-brand-blue-dark dark:text-brand-blue-light">Instant Settlement Active</p>
                    <p className="font-poppins text-[9.5px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      Kaam ke baad paisa turant bank account mein. 24/7 IMPS service active.
                    </p>
                  </div>
                </div>

              </div>

              {/* Float Decorative mini card badge 1 */}
              {!shouldReduceMotion && (
                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -right-4 top-16 bg-white dark:bg-slate-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-3 shadow-lg flex items-center gap-2.5 z-20"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-green-dark/15 flex items-center justify-center text-brand-green-dark">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-sora font-bold text-[10px] text-neutral-800 dark:text-neutral-200">Commission Earned</p>
                    <p className="font-poppins font-extrabold text-xs text-brand-green-dark">+₹12.00</p>
                  </div>
                </motion.div>
              )}

              {/* Float Decorative mini card badge 2 */}
              {!shouldReduceMotion && (
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -left-6 bottom-16 bg-white dark:bg-slate-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-3 shadow-lg flex items-center gap-2.5 z-20"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-blue-light/15 flex items-center justify-center text-brand-blue-light">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-sora font-bold text-[10px] text-neutral-800 dark:text-neutral-200">Customers Served</p>
                    <p className="font-poppins font-extrabold text-xs text-neutral-900 dark:text-neutral-100">120+ This Week</p>
                  </div>
                </motion.div>
              )}

            </div>

          </div>
        </section>


        {/* ================= IMPACT STATS SECTION ================= */}
        <section className="border-y border-neutral-200/50 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xs py-12 relative z-10 transition-colors duration-300">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 text-center">

              {/* Stat 1 */}
              <div>
                <p className="font-sora font-extrabold text-3xl sm:text-4xl text-brand-blue-dark dark:text-brand-blue-light">10 Lakh+</p>
                <p className="font-poppins font-semibold text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">Active Adhikaris (Retailers)</p>
              </div>

              {/* Stat 2 */}
              <div>
                <p className="font-sora font-extrabold text-3xl sm:text-4xl text-brand-blue-dark dark:text-brand-blue-light">20 Crore+</p>
                <p className="font-poppins font-semibold text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">Happy Customers Served</p>
              </div>

              {/* Stat 3 */}
              <div>
                <p className="font-sora font-extrabold text-3xl sm:text-4xl text-brand-blue-dark dark:text-brand-blue-light">18,000+</p>
                <p className="font-poppins font-semibold text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">PIN Codes Covered</p>
              </div>

              {/* Stat 4 */}
              <div>
                <p className="font-sora font-extrabold text-3xl sm:text-4xl text-brand-blue-dark dark:text-brand-blue-light">₹50k+ Cr</p>
                <p className="font-poppins font-semibold text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">Transactions Processed</p>
              </div>

            </div>
          </div>
        </section>


        {/* ================= SERVICES SECTION ================= */}
        <section id="services" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-24 relative z-10">
          <motion.div {...fadeInUp} className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-sora font-extrabold text-3xl sm:text-4xl bg-linear-to-r from-brand-blue-dark to-brand-blue-light dark:from-brand-blue-light dark:to-neutral-100 bg-clip-text text-transparent mb-4">
              Humari Core Services
            </h2>
            <p className="font-poppins text-neutral-600 dark:text-neutral-400 text-sm sm:text-base leading-relaxed">
              AsanPay super-app ke zariye aap apni hi dukaan par banking services shuru kar sakte hain aur har transaction par regular commission kama sakte hain.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">

            {/* Service 1: AEPS */}
            <motion.div
              {...fadeInUp}
              className="glass-card hover-glow-green rounded-2xl p-6 shadow-md hover:-translate-y-1 transition-all duration-300 relative group overflow-hidden border border-neutral-200/50 dark:border-white/10 flex flex-col h-full"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-green-dark/10 text-brand-green-dark dark:bg-brand-green-dark/25 dark:text-brand-green-light border border-brand-green-dark/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Fingerprint className="w-6 h-6" />
              </div>
              <h3 className="font-sora font-bold text-lg text-neutral-900 dark:text-white mb-2">AEPS Cash Withdrawal</h3>
              <p className="font-poppins text-xs md:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4 flex-1">
                Aadhaar Number aur customer ke biometric scan (biometric scanner) ke zariye kisi bhi bank account se cash withdraw karein aur balance check karein.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="text-brand-blue-light dark:text-brand-green-light font-sora font-bold text-xs hover:underline flex items-center gap-1 group-hover:translate-x-1 transition-transform self-start mt-auto"
              >
                Learn More &rarr;
              </button>
            </motion.div>

            {/* Service 2: DMT */}
            <motion.div
              {...fadeInUp}
              className="glass-card hover-glow-blue rounded-2xl p-6 shadow-md hover:-translate-y-1 transition-all duration-300 relative group overflow-hidden border border-neutral-200/50 dark:border-white/10 flex flex-col h-full"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-blue-light/10 text-brand-blue-light dark:bg-brand-blue-light/20 dark:text-brand-blue-light border border-brand-blue-light/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Send className="w-6 h-6" />
              </div>
              <h3 className="font-sora font-bold text-lg text-neutral-900 dark:text-white mb-2">Domestic Money Transfer</h3>
              <p className="font-poppins text-xs md:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4 flex-1">
                India ke kisi bhi bank account mein instant cash send karein. Bina bank line lage customer ka remittances 24/7 direct unke bank accounts mein transfer.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="text-brand-blue-light dark:text-brand-green-light font-sora font-bold text-xs hover:underline flex items-center gap-1 group-hover:translate-x-1 transition-transform self-start mt-auto"
              >
                Learn More &rarr;
              </button>
            </motion.div>

            {/* Service 3: BBPS */}
            <motion.div
              {...fadeInUp}
              className="glass-card hover-glow-amber rounded-2xl p-6 shadow-md hover:-translate-y-1 transition-all duration-300 relative group overflow-hidden border border-neutral-200/50 dark:border-white/10 flex flex-col h-full"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/25 dark:text-amber-300 border border-amber-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="font-sora font-bold text-lg text-neutral-900 dark:text-white mb-2">BBPS Bill Payments</h3>
              <p className="font-poppins text-xs md:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4 flex-1">
                Bharat Bill Payment System ke jariye bijli (electricity), paani, gas, DTH, credit card bill aur mobile recharge karein, aur payiye direct merchant cashbacks.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="text-brand-blue-light dark:text-brand-green-light font-sora font-bold text-xs hover:underline flex items-center gap-1 group-hover:translate-x-1 transition-transform self-start mt-auto"
              >
                Learn More &rarr;
              </button>
            </motion.div>

            {/* Service 4: Settlement */}
            <motion.div
              {...fadeInUp}
              className="glass-card hover-glow-cyan rounded-2xl p-6 shadow-md hover:-translate-y-1 transition-all duration-300 relative group overflow-hidden border border-neutral-200/50 dark:border-white/10 flex flex-col h-full"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/25 dark:text-cyan-300 border border-cyan-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="font-sora font-bold text-lg text-neutral-900 dark:text-white mb-2">Instant Settlement</h3>
              <p className="font-poppins text-xs md:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4 flex-1">
                Kiye hue transactions ka balance aapke bank account mein turant transfer karein. 24/7 online instant IMPS/NEFT, taki bank holiday mein bhi kaam na ruke.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="text-brand-blue-light dark:text-brand-green-light font-sora font-bold text-xs hover:underline flex items-center gap-1 group-hover:translate-x-1 transition-transform self-start mt-auto"
              >
                Learn More &rarr;
              </button>
            </motion.div>

          </div>
        </section>


        {/* ================= AGENT BENEFITS & TIMELINE ================= */}
        <section id="benefits" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 bg-white/10 dark:bg-slate-900/10 backdrop-blur-xs relative z-10 rounded-3xl border border-neutral-200/20 dark:border-white/5 my-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

            {/* Left side text */}
            <div className="lg:col-span-5">
              <span className="font-sora font-extrabold text-xs uppercase tracking-widest text-brand-blue-light dark:text-brand-green-light">Retailer Benefits</span>
              <h2 className="font-sora font-extrabold text-3xl sm:text-4xl text-neutral-900 dark:text-white mt-3 mb-6 transition-colors">
                AsanPay Join Karne Ke Fayde
              </h2>
              <p className="font-poppins text-neutral-600 dark:text-neutral-400 text-sm sm:text-base leading-relaxed mb-6">
                Humare digital network se judkar aap apni shop ki income ko double kar sakte hain. AsanPay se judna behad aasan aur surakshit hai.
              </p>

              {/* Check features */}
              <div className="space-y-3.5">
                {[
                  'Zero Security deposit or low working capital requirement',
                  'Sabase zyada AePS/DMT/DTH commissions payouts',
                  'Fingertip reports of daily earnings & detailed transaction passbooks',
                  'PCI-DSS and ISO level advanced cyber transaction security',
                  'Biometric scanner driver and app integration support'
                ].map((benefit, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-brand-green-dark/15 flex items-center justify-center text-brand-green-dark mt-0.5 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-poppins text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side onboarding steps timeline */}
            <div className="lg:col-span-7">
              <div className="space-y-8 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-linear-to-b before:from-brand-blue-dark before:to-brand-green-light">

                {/* Step 1 */}
                <div className="relative pl-14">
                  <div className="absolute left-0 w-12 h-12 rounded-xl bg-brand-blue-dark text-white font-sora font-extrabold text-lg flex items-center justify-center shadow-md">
                    1
                  </div>
                  <div>
                    <h3 className="font-sora font-bold text-base md:text-lg text-neutral-900 dark:text-white">Quick Registration / App Download</h3>
                    <p className="font-poppins text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                      AsanPay app download karein aur details register karein. Waitlist register karke direct updates payiye.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative pl-14">
                  <div className="absolute left-0 w-12 h-12 rounded-xl bg-brand-blue-light text-white font-sora font-extrabold text-lg flex items-center justify-center shadow-md">
                    2
                  </div>
                  <div>
                    <h3 className="font-sora font-bold text-base md:text-lg text-neutral-900 dark:text-white">Complete Digital Biometric KYC</h3>
                    <p className="font-poppins text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                      Aadhaar card scan aur shop registration documents complete karein, validation bank server se instant verify ho jayega.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="relative pl-14">
                  <div className="absolute left-0 w-12 h-12 rounded-xl bg-brand-green-dark text-white font-sora font-extrabold text-lg flex items-center justify-center shadow-md">
                    3
                  </div>
                  <div>
                    <h3 className="font-sora font-bold text-base md:text-lg text-neutral-900 dark:text-white">Start Services & Earn High Commission</h3>
                    <p className="font-poppins text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                      Apni dukaan se AePS, DMT aur bill payments process karein. Instant commissions aur settlement se business badhayein!
                    </p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </section>


        {/* ================= INTERACTIVE INCOME ESTIMATOR ================= */}
        <section id="calculator" className="mx-auto max-w-5xl px-4 py-20 relative z-10">
          <div className="glass-card rounded-3xl p-6 md:p-10 shadow-2xl relative border border-neutral-200/50 dark:border-white/10">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-linear-to-r from-brand-blue-dark to-brand-green-dark" />

            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="font-sora font-bold text-xs uppercase tracking-widest text-brand-blue-light dark:text-brand-green-light">Earnings Calculator</span>
              <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-neutral-900 dark:text-white mt-2 transition-colors">
                Kaam Slider: Apni Monthly Income Estimate Karein
              </h2>
              <p className="font-poppins text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Slidars ko aage peechhe karke monthly extra commission ka andaza lagayein.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Sliders */}
              <div className="space-y-6">

                {/* Slider 1: AEPS */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="aeps-slider" className="font-sora font-bold text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                      Daily AePS Cash Withdrawals
                    </label>
                    <span className="font-sora font-extrabold text-sm text-brand-blue-light dark:text-brand-green-light">
                      {aepsCount} / day
                    </span>
                  </div>
                  <input
                    id="aeps-slider"
                    type="range"
                    min="1"
                    max="100"
                    value={aepsCount}
                    onChange={(e) => setAepsCount(Number(e.target.value))}
                    className="w-full h-2 bg-neutral-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-blue-light"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">
                    <span>1 transaction</span>
                    <span>100 transactions</span>
                  </div>
                </div>

                {/* Slider 2: DMT */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="dmt-slider" className="font-sora font-bold text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                      Daily Domestic Money Transfer (DMT)
                    </label>
                    <span className="font-sora font-extrabold text-sm text-brand-blue-light dark:text-brand-green-light">
                      {dmtCount} / day
                    </span>
                  </div>
                  <input
                    id="dmt-slider"
                    type="range"
                    min="0"
                    max="50"
                    value={dmtCount}
                    onChange={(e) => setDmtCount(Number(e.target.value))}
                    className="w-full h-2 bg-neutral-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-blue-light"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">
                    <span>0 transaction</span>
                    <span>50 transactions</span>
                  </div>
                </div>

                {/* Slider 3: BBPS */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="bbps-slider" className="font-sora font-bold text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                      Daily Bill Payments & Recharges
                    </label>
                    <span className="font-sora font-extrabold text-sm text-brand-blue-light dark:text-brand-green-light">
                      {bbpsCount} / day
                    </span>
                  </div>
                  <input
                    id="bbps-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={bbpsCount}
                    onChange={(e) => setBbpsCount(Number(e.target.value))}
                    className="w-full h-2 bg-neutral-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-blue-light"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">
                    <span>0 transaction</span>
                    <span>100 bills</span>
                  </div>
                </div>

              </div>

              {/* Calculated Results Block */}
              <div className="p-6 md:p-8 rounded-2xl bg-neutral-50 dark:bg-slate-950/40 border border-neutral-200 dark:border-white/5 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-brand-green-dark/15 flex items-center justify-center text-brand-green-dark mb-4">
                  <Wallet className="w-6 h-6" />
                </div>
                <h3 className="font-sora font-bold text-sm text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                  Estimated Monthly Income
                </h3>
                <p className="font-sora font-extrabold text-4xl md:text-5xl text-neutral-900 dark:text-neutral-100 mt-2.5 transition-colors">
                  ₹{calculatedEarnings.toLocaleString('en-IN')}*
                </p>
                <p className="font-poppins text-[10px] text-neutral-400 dark:text-neutral-500 mt-1.5 leading-relaxed">
                  *Income calculation average commissions par aadharit hai. Har service par rates thode alag ho sakte hain.
                </p>

                <button
                  onClick={() => setModalOpen(true)}
                  type="button"
                  className="mt-6 px-6 py-3 rounded-xl bg-linear-to-r from-brand-blue-dark to-brand-blue-light hover:from-brand-blue-light hover:to-brand-blue-dark text-white font-sora font-bold text-xs shadow-md transition-all cursor-pointer hover:scale-105"
                >
                  Join Waitlist & Start Earning
                </button>
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-neutral-200 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xs py-12 relative z-10 transition-colors duration-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">

            {/* Branding Column */}
            <div className="space-y-4 text-center md:text-left flex flex-col items-center md:items-start">
              <div className="flex items-center gap-3">
                <Logo size={36} />
                <span className="font-sora font-extrabold text-lg md:text-xl text-brand-blue-dark dark:text-white transition-colors">
                  Asan<span className="text-brand-green-dark dark:text-brand-green-light">Pay</span>
                </span>
              </div>
              <p className="font-poppins text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xs">
                A B2B agent-banking super app dedicated to rural digital financial inclusion across India. Shopkeepers become banking hubs.
              </p>
            </div>

            {/* Quick Links Column */}
            <div className="text-center md:text-left">
              <h3 className="font-sora font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4 transition-colors">
                Quick Links
              </h3>
              <ul className="space-y-2.5 font-poppins text-xs">
                <li>
                  <Link href="/#services" className="text-neutral-500 dark:text-neutral-400 hover:text-brand-blue-light hover:underline transition-colors">
                    Services
                  </Link>
                </li>
                <li>
                  <Link href="/#benefits" className="text-neutral-500 dark:text-neutral-400 hover:text-brand-blue-light hover:underline transition-colors">
                    Agent Benefits
                  </Link>
                </li>
                <li>
                  <Link href="/#calculator" className="text-neutral-500 dark:text-neutral-400 hover:text-brand-blue-light hover:underline transition-colors">
                    Income Estimator
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-neutral-500 dark:text-neutral-400 hover:text-brand-blue-light hover:underline transition-colors">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal Column */}
            <div className="text-center md:text-left">
              <h3 className="font-sora font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4 transition-colors">
                Regulatory Compliance
              </h3>
              <div className="space-y-3.5 font-poppins text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                <p className="flex items-center justify-center md:justify-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-green-dark shrink-0" />
                  RBI Merchant Guidelines Compliant
                </p>
                <p className="flex items-center justify-center md:justify-start gap-2">
                  <Building className="w-4 h-4 text-brand-blue-light shrink-0" />
                  NPCI AEPS Gateway Partnered
                </p>
              </div>
            </div>

            {/* Contact details */}
            <div className="text-center md:text-left">
              <h3 className="font-sora font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-4 transition-colors">
                Support / Help Desk
              </h3>
              <ul className="space-y-2.5 font-poppins text-xs text-neutral-500 dark:text-neutral-400">
                <li className="flex items-center justify-center md:justify-start gap-2">
                  <Phone className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
                  +91 98765 43210 (Toll Free)
                </li>
                <li className="flex items-center justify-center md:justify-start gap-2">
                  <Mail className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
                  support@asanpay.in
                </li>
              </ul>
            </div>

          </div>

          {/* Bottom Divider */}
          <div className="border-t border-neutral-200 dark:border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="font-sora font-semibold text-xs tracking-wider text-neutral-400 dark:text-neutral-500 uppercase">
              Payment Made Easy
            </span>
            <p className="font-poppins text-xs text-neutral-500 dark:text-neutral-600">
              © {new Date().getFullYear()} AsanPay. All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Waitlist Modal triggered by login / signup clicks */}
      <WaitlistModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

    </div>
  );
}
