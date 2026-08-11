"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Portaled so AdminShell page-transform does not trap position:fixed. */
export function Modal({ title, onClose, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="danger-confirm-backdrop fixed inset-0 z-[200] flex items-center justify-center px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="danger-confirm-panel w-full max-w-sm rounded-2xl bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-tooltip text-gray-400 hover:text-gray-600"
            aria-label="Close"
            data-tooltip="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
