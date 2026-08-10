"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Wrench, Plus, X } from "lucide-react";
import { B } from "@/lib/brand";
import api, { fetchApi } from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";

interface RepairRow {
  id: string;
  serial: string;
  deviceType: string;
  issueType: string;
  status: "submitted" | "rma_issued" | "in_repair" | "resolved" | "rejected";
  rmaNumber: string | null;
  resolutionNote: string | null;
  submittedAt: string;
}

const STATUS_LABEL: Record<RepairRow["status"], string> = {
  submitted: "Submitted",
  rma_issued: "RMA issued",
  in_repair: "In repair",
  resolved: "Resolved",
  rejected: "Rejected",
};

const STATUS_COLOR: Record<RepairRow["status"], string> = {
  submitted: "#2563eb",
  rma_issued: "#7c3aed",
  in_repair: "#d97706",
  resolved: "#16a34a",
  rejected: "#dc2626",
};

const VENDORS = ["Mantra", "Morpho", "Startek", "Other"] as const;

const ISSUE_TYPES = [
  "Device not connecting",
  "Fingerprint not capturing",
  "Screen / display issue",
  "Physical damage",
  "RD Service error",
  "Other",
];

/**
 * "My device broke" as its own flow, separate from register/de-register in BiometricDevices.
 * Keeping repair distinct from a plain de-register is what lets task #15's change-frequency
 * signal tell a genuine failure apart from a device that keeps moving between agents.
 */
export function DeviceRepairRequests() {
  const [requests, setRequests] = useState<RepairRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serial, setSerial] = useState("");
  const [deviceType, setDeviceType] = useState("biometric_machine");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>(VENDORS[0]);
  const [vendorOther, setVendorOther] = useState("");
  const [issueType, setIssueType] = useState(ISSUE_TYPES[0]!);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setRequests(await fetchApi<RepairRow[]>("/device-repair-requests"));
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load repair requests"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setShowForm(false);
    setSerial("");
    setVendor(VENDORS[0]);
    setVendorOther("");
    setInvoiceDate("");
    setInvoiceNumber("");
    setRemarks("");
    setIssueType(ISSUE_TYPES[0]!);
  }

  async function submit() {
    if (!serial.trim()) {
      toast.error("Enter the device serial number");
      return;
    }
    if (remarks.trim().length < 5) {
      toast.error("Describe the issue — at least 5 characters");
      return;
    }
    setBusy(true);
    try {
      const vendorValue = vendor === "Other" ? vendorOther.trim() : vendor;
      await api.post("/device-repair-requests", {
        serial: serial.trim(),
        deviceType,
        vendor: vendorValue || undefined,
        issueType,
        invoiceDate: invoiceDate || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        remarks: remarks.trim(),
      });
      toast.success("Repair request submitted");
      resetForm();
      await load();
    } catch (err) {
      toast.error(extractApiError(err, "Could not submit repair request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: B.blue }}>
            Device Repair &amp; Replacement
          </h2>
          <p className="text-xs" style={{ color: B.muted }}>
            Report a broken device separately from de-registering it — this keeps repair history
            apart from device changes.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ background: "#12b76a" }}
          >
            <Plus size={14} />
            New request
          </button>
        )}
      </div>

      {requests === null ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : requests.length === 0 && !showForm ? (
        <p className="text-sm" style={{ color: B.muted }}>
          No repair requests yet.
        </p>
      ) : (
        requests?.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-xl border p-4"
            style={{ borderColor: B.border }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: B.secondary }}
              >
                <Wrench size={18} style={{ color: B.blue }} />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: B.blue }}>
                  {r.serial} · {r.issueType}
                </div>
                <div className="text-xs" style={{ color: B.muted }}>
                  Submitted {new Date(r.submittedAt).toLocaleDateString()}
                  {r.rmaNumber ? ` · RMA ${r.rmaNumber}` : ""}
                </div>
                {r.resolutionNote && (
                  <div className="mt-0.5 text-xs" style={{ color: B.muted }}>
                    {r.resolutionNote}
                  </div>
                )}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: `${STATUS_COLOR[r.status]}18`, color: STATUS_COLOR[r.status] }}
            >
              {STATUS_LABEL[r.status]}
            </span>
          </div>
        ))
      )}

      {showForm && (
        <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: B.border, background: B.bg }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: B.blue }}>
              Create repair request
            </p>
            <button type="button" onClick={resetForm} aria-label="Cancel">
              <X size={16} style={{ color: "#dc2626" }} />
            </button>
          </div>

          <select
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            style={{ borderColor: B.border, color: B.blue }}
          >
            <option value="biometric_machine">Biometric Machine</option>
            <option value="matm">MATM</option>
            <option value="printer">Printer</option>
            <option value="other">Other</option>
          </select>

          <input
            type="text"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="Device serial number"
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            style={{ borderColor: B.border, color: B.blue }}
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold" style={{ color: B.muted }}>
              Device company
            </p>
            <div className="flex flex-wrap gap-2">
              {VENDORS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVendor(v)}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={{
                    borderColor: vendor === v ? B.blue : B.border,
                    background: vendor === v ? `${B.blue}14` : "white",
                    color: B.blue,
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {vendor === "Other" && (
            <input
              type="text"
              value={vendorOther}
              onChange={(e) => setVendorOther(e.target.value)}
              placeholder="Company name"
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
          )}

          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            style={{ borderColor: B.border, color: B.blue }}
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div>
            <p className="mb-1.5 text-xs font-semibold" style={{ color: B.muted }}>
              Invoice date — optional
            </p>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </div>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Invoice number — optional"
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            style={{ borderColor: B.border, color: B.blue }}
          />

          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            placeholder="Describe the issue"
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            style={{ borderColor: B.border, color: B.blue }}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: B.green }}
          >
            Submit request
          </button>
        </div>
      )}
    </div>
  );
}
