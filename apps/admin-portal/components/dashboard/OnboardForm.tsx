"use client";

import { useState, type FormEvent } from "react";
import { toast } from "react-hot-toast";
import api from "@/lib/api";
import { UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { UserRole } from "@asanpay/shared-types";

interface OnboardFormProps {
  childRole: UserRole;
  childRoleLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function OnboardForm({ childRole, childRoleLabel, onClose, onSuccess }: OnboardFormProps) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/register", {
        name,
        mobile,
        password,
        role: childRole,
        ...(panNumber ? { panNumber: panNumber.toUpperCase() } : {}),
      });
      toast.success(`${childRoleLabel} onboarded successfully`);
      onSuccess();
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Onboarding failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Onboard New ${childRoleLabel}`} onClose={onClose} icon={<UserPlus size={20} />} iconTone="green">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Mobile Number</label>
          <input
            required
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">PAN Number (optional)</label>
          <input
            value={panNumber}
            onChange={(e) => setPanNumber(e.target.value)}
            placeholder="ABCDE1234F"
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm uppercase outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Onboarding..." : `Onboard ${childRoleLabel}`}
        </button>
      </form>
    </Modal>
  );
}
