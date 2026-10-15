"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  const modal = (
    <div className="confirm-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="confirm-modal-panel max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="icon-tooltip text-gray-400 hover:text-gray-600" aria-label="Close" data-tooltip="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  // Portal to <body>: a transformed / overflow-hidden ancestor would otherwise clip `fixed`.
  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}
