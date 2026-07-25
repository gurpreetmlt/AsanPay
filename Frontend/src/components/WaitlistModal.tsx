'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Rocket, X, CheckCircle, Mail, Loader2 } from 'lucide-react';

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WaitlistModal({ isOpen, onClose }: WaitlistModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const shouldReduceMotion = useReducedMotion();

  // Control native dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
        // Reset states on open
        setEmail('');
        setError('');
        setSuccess(false);
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Fallback for click outside modal (backdrop click) for older browsers or browsers not supporting closedby
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Handles the 'close' event triggered by the dialog (e.g. Esc key or light-dismiss)
    const handleClose = () => {
      onClose();
    };

    // Fallback backdrop click handler for browsers without native closedby support
    const handleBackdropClick = (event: MouseEvent) => {
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        if (event.target === dialog) {
          const rect = dialog.getBoundingClientRect();
          const isDialogContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
          );
          if (!isDialogContent) {
            onClose();
          }
        }
      }
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('click', handleBackdropClick);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setError('Email address is required / Email address zaroori hai');
      return;
    }
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email / Sahi email likhein');
      return;
    }

    startTransition(async () => {
      // Simulate API submit delay
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSuccess(true);
    });
  };

  return (
    <dialog
      ref={dialogRef}
      // Declarative light-dismiss for compatible modern browsers
      closedby="any"
      aria-labelledby="modal-heading"
      aria-describedby="modal-description"
      className="m-auto rounded-2xl bg-transparent p-0 max-w-lg w-full focus:outline-hidden backdrop:bg-slate-950/70 backdrop:backdrop-blur-md"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="w-full relative overflow-hidden bg-white dark:bg-slate-900 border border-neutral-200 dark:border-white/10 p-6 md:p-8 rounded-2xl shadow-2xl text-neutral-800 dark:text-neutral-200"
          >
            {/* Top Glow decoration */}
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-brand-blue-light/10 dark:bg-brand-blue-dark/20 blur-3xl pointer-events-none" />
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-brand-green-light/10 dark:bg-brand-green-dark/20 blur-3xl pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={onClose}
              type="button"
              className="absolute top-4 right-4 p-2 rounded-lg text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer focus:ring-2 focus:ring-brand-blue-light outline-hidden"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content */}
            <div className="text-center relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-blue-light/10 dark:bg-brand-blue-dark/20 border border-brand-blue-light/20 dark:border-brand-blue-dark/30 flex items-center justify-center mb-5 text-brand-blue-light dark:text-brand-blue-light/90">
                <Rocket className="w-8 h-8 animate-bounce duration-1000" />
              </div>

              <h2
                id="modal-heading"
                className="font-sora font-extrabold text-2xl md:text-3xl bg-linear-to-r from-brand-blue-dark to-brand-blue-light dark:from-brand-blue-light dark:to-neutral-100 bg-clip-text text-transparent mb-3"
              >
                Bilkul aane hi wala hai 🚀
              </h2>

              <p
                id="modal-description"
                className="font-poppins font-normal text-sm md:text-base text-neutral-600 dark:text-neutral-400 max-w-sm mb-6 leading-relaxed"
              >
                Ye feature abhi launch nahi hua hai. AsanPay waitlist join kariye aur aane wale exclusive offers aur features ki sabse pehle updates payiye!
              </p>

              {!success ? (
                <form onSubmit={handleSubmit} className="w-full">
                  <div className="relative mb-3.5">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 dark:text-neutral-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="Apna email address likhein..."
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-slate-950/50 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light dark:focus:ring-brand-blue-light focus:border-transparent transition-all font-poppins"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <p className="text-red-500 text-xs font-poppins font-medium text-left mb-3.5">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full py-3.5 rounded-xl bg-linear-to-r from-brand-blue-dark to-brand-blue-light dark:from-brand-blue-light dark:to-brand-blue-dark hover:from-brand-blue-light hover:to-brand-blue-dark text-white font-sora font-bold text-base shadow-lg shadow-brand-blue-dark/20 hover:scale-[1.01] hover:shadow-xl dark:shadow-none hover:shadow-brand-blue-light/10 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Notify me'
                    )}
                  </button>
                </form>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full p-6 rounded-xl bg-brand-green-dark/10 border border-brand-green-dark/20 text-center flex flex-col items-center justify-center"
                >
                  <CheckCircle className="w-12 h-12 text-brand-green-dark dark:text-brand-green-light mb-3" />
                  <h3 className="font-sora font-bold text-lg text-brand-green-dark dark:text-brand-green-light mb-1">
                    Ho gaya! Aap list mein hain ✓
                  </h3>
                  <p className="font-poppins text-xs text-neutral-600 dark:text-neutral-400">
                    Aapka email add ho chuka hai. Launch hote hi hum aapse contact karenge!
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
