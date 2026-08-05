"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Eye,
  EyeOff,
  Fingerprint,
  Plus,
  ScanEye,
  Search,
  Star,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B } from "@/lib/brand";
import api from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { ApiResponse } from "@asanpay/shared-types";
import {
  captureFingerprintWeb,
  formatRdDeviceLabel,
  getRdProbeLog,
  warmRdService,
  type RdEndpoint,
} from "@/lib/rdServiceFingerprint";

/* ── Bank data (top Indian banks used in AEPS) ─────────────────────── */

interface Bank {
  id: string;
  name: string;
  shortName: string;
  color: string;
  letter: string;
}

const BANKS: Bank[] = [
  { id: "bob", name: "Bank of Baroda", shortName: "Bank of Barod...", color: "#E64A19", letter: "B" },
  { id: "pnb", name: "Punjab National Bank", shortName: "Punjab Nationa...", color: "#D32F2F", letter: "P" },
  { id: "psb", name: "Punjab & Sind Bank", shortName: "Punjab & Sind...", color: "#7B1FA2", letter: "P" },
  { id: "sbi", name: "State Bank of India", shortName: "State Bank of...", color: "#1565C0", letter: "S" },
  { id: "hdfc", name: "HDFC Bank", shortName: "HDFC Bank", color: "#00338D", letter: "H" },
  { id: "airtel", name: "Airtel Payment Bank", shortName: "Airtel Paymen...", color: "#E53935", letter: "A" },
  { id: "icici", name: "ICICI Bank", shortName: "ICICI Bank", color: "#F57C00", letter: "I" },
  { id: "pgb", name: "Punjab Gramin Bank", shortName: "Punjab Gramin...", color: "#E91E63", letter: "P" },
  { id: "uco", name: "UCO Bank", shortName: "UCO Bank", color: "#7B1FA2", letter: "U" },
  { id: "boi", name: "Bank of India", shortName: "Bank of India", color: "#E65100", letter: "B" },
  { id: "canara", name: "Canara Bank", shortName: "Canara Bank", color: "#1976D2", letter: "C" },
  { id: "indian", name: "Indian Bank", shortName: "Indian Bank", color: "#0D47A1", letter: "I" },
  { id: "union", name: "Union Bank of India", shortName: "Union Bank", color: "#F57C00", letter: "U" },
  { id: "kotak", name: "Kotak Mahindra Bank", shortName: "Kotak Bank", color: "#E53935", letter: "K" },
  { id: "axis", name: "Axis Bank", shortName: "Axis Bank", color: "#6A1B9A", letter: "A" },
  { id: "bob_vijaya", name: "Bank of Baroda Plus Vijaya Bank Plus Dena Bank", shortName: "BOB + Vijaya", color: "#E64A19", letter: "B" },
  { id: "pnb_obc", name: "Punjab National Bank Plus Oriental Bank of Commerce", shortName: "PNB + OBC", color: "#D32F2F", letter: "P" },
  { id: "iob", name: "Indian Overseas Bank", shortName: "IOB", color: "#C62828", letter: "I" },
  { id: "central", name: "Central Bank of India", shortName: "Central Bank", color: "#B71C1C", letter: "C" },
  { id: "bom", name: "Bank of Maharashtra", shortName: "Bank of Mahar...", color: "#4A148C", letter: "B" },
  { id: "idbi", name: "IDBI Bank", shortName: "IDBI Bank", color: "#00695C", letter: "I" },
  { id: "yes", name: "Yes Bank", shortName: "Yes Bank", color: "#1565C0", letter: "Y" },
  { id: "fino", name: "Fino Payments Bank", shortName: "Fino Bank", color: "#FF6F00", letter: "F" },
  { id: "paytm", name: "Paytm Payments Bank", shortName: "Paytm Bank", color: "#00BCD4", letter: "P" },
];

/** Shared with mobile — persisted via GET/PUT /auth/aeps-favourite-banks */
const DEFAULT_AEPS_FAV_BANKS = ["bob", "pnb", "sbi", "hdfc", "airtel", "icici"] as const;
const AEPS_FAV_LEGACY: Record<string, string> = { bob_vijaya: "bob", pnb_obc: "pnb" };

function sanitizeAepsFavIds(ids: string[]): string[] {
  const valid = new Set(BANKS.map((b) => b.id));
  const out: string[] = [];
  for (const raw of ids) {
    const id = AEPS_FAV_LEGACY[raw] ?? raw;
    if (valid.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

const AEPS_TABS = ["Withdraw", "Mini Statement", "Deposit", "Balance Enquiry"] as const;
type AepsTab = (typeof AEPS_TABS)[number];

const QUICK_AMOUNTS = [1000, 3000, 5000, 10000];

/* ── Biometric L1 devices (UIDAI certified) ───────────────────────── */

interface BiometricDevice {
  id: string;
  name: string;
  rdPackage: string;
  color: string;
  letter: string;
}

const BIOMETRIC_DEVICES: BiometricDevice[] = [
  { id: "mantra_mfs110", name: "Mantra MFS110 L1", rdPackage: "com.mantra.mfs110.rdservice", color: "#1565C0", letter: "M" },
  { id: "startek_fm220", name: "Startek L1", rdPackage: "com.acpl.registersdk", color: "#4A148C", letter: "S" },
  { id: "morpho_mso1300", name: "Morpho MSO L1", rdPackage: "com.idemia.l1rdservice", color: "#E53935", letter: "M" },
  { id: "visiontek_v600", name: "VisionTek V600 L1", rdPackage: "com.linkwell.rdservice", color: "#00695C", letter: "V" },
  { id: "evolute_escan", name: "Evolute eScan L1", rdPackage: "com.evolute.rdservice", color: "#F57C00", letter: "E" },
  { id: "mantra_marc11", name: "Marc 11", rdPackage: "com.mantra.mfs110.rdservice", color: "#1976D2", letter: "M" },
  { id: "precision_pb1000", name: "PB1000 - L1", rdPackage: "com.precision.pb510.rdservice", color: "#7B1FA2", letter: "P" },
];

type AuthMode = "fingerprint" | "iris";

/* ── Device selector sidebar ──────────────────────────────────────── */

function DeviceSidebar({
  open,
  onClose,
  activeDeviceId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  activeDeviceId: string;
  onSelect: (device: BiometricDevice) => void;
}) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold" style={{ color: B.blue }}>
            Select Biometric Device
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {BIOMETRIC_DEVICES.map((device) => {
            const isActive = device.id === activeDeviceId;
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => { onSelect(device); onClose(); }}
                className={clsx(
                  "flex w-full items-center gap-4 border-b border-gray-100 px-6 py-4 text-left transition hover:bg-gray-50",
                  isActive && "bg-blue-50/60",
                )}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white font-bold"
                  style={{ backgroundColor: device.color, fontSize: 16 }}
                >
                  {device.letter}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-gray-800">{device.name}</span>
                </div>
                {isActive && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-[12px] font-bold text-green-700">
                    Currently Active
                  </span>
                )}
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            );
          })}

          {/* Add New Device */}
          <button
            type="button"
            className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-gray-50"
            onClick={onClose}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-300">
              <Plus size={18} className="text-gray-400" />
            </div>
            <span className="text-sm font-semibold text-gray-500">Add New Device</span>
            <ChevronRight size={16} className="ml-auto text-gray-400" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Bank icon component ───────────────────────────────────────────── */

function BankIcon({ bank, size = 48 }: { bank: Bank; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: bank.color,
        fontSize: size * 0.38,
      }}
    >
      {bank.letter}
    </div>
  );
}

/* ── Bank sidebar popup ────────────────────────────────────────────── */

function BankSidebar({
  open,
  onClose,
  onSelect,
  favouriteIds,
  onToggleFav,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (bank: Bank) => void;
  favouriteIds: string[];
  onToggleFav: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const favBanks = useMemo(() => {
    const byId = new Map(BANKS.map((b) => [b.id, b]));
    return favouriteIds.map((id) => byId.get(id)).filter((b): b is Bank => Boolean(b));
  }, [favouriteIds]);

  const filtered = useMemo(
    () =>
      search.trim()
        ? BANKS.filter((b) =>
            b.name.toLowerCase().includes(search.toLowerCase()),
          )
        : BANKS,
    [search],
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold" style={{ color: B.blue }}>
            Select Customer&apos;s Bank
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-gray-100"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a bank"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Recent/Favourite Banks */}
          {favBanks.length > 0 && !search && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-bold text-gray-800">
                Recent/Favourite Banks
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {favBanks.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => {
                      onSelect(bank);
                      onClose();
                    }}
                    className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center hover:bg-gray-50"
                  >
                    <BankIcon bank={bank} size={44} />
                    <span className="text-[11px] font-medium leading-tight text-gray-600 line-clamp-2">
                      {bank.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* All Banks */}
          <h3 className="mb-2 text-sm font-bold text-gray-800">All Banks</h3>
          <div className="space-y-0.5">
            {filtered.map((bank) => (
              <div
                key={bank.id}
                className="flex items-center justify-between rounded-lg px-2 py-2.5 hover:bg-gray-50"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(bank);
                    onClose();
                  }}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <BankIcon bank={bank} size={36} />
                  <span className="text-sm font-medium text-gray-800">
                    {bank.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFav(bank.id)}
                  className="rounded-lg p-1.5 hover:bg-gray-100"
                >
                  <Star
                    size={16}
                    strokeWidth={2}
                    color={favouriteIds.includes(bank.id) ? "#F59E0B" : "#CBD5E1"}
                    fill={favouriteIds.includes(bank.id) ? "#F59E0B" : "none"}
                  />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">
                No banks found for &quot;{search}&quot;
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main AEPS page ────────────────────────────────────────────────── */

function AepsLoading() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] p-6">
        <p className="text-sm font-medium text-gray-500">Loading AePS…</p>
      </div>
    </AppShell>
  );
}

export default function AepsPage() {
  return (
    <Suspense fallback={<AepsLoading />}>
      <AepsPageInner />
    </Suspense>
  );
}

function AepsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const initialTab = useMemo(() => {
    const q = searchParams.get("tab");
    if (q && (AEPS_TABS as readonly string[]).includes(q)) return q as AepsTab;
    return "Withdraw" as AepsTab;
  }, [searchParams]);

  const [tab, setTab] = useState<AepsTab>(initialTab);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [insertSlot, setInsertSlot] = useState(0);
  const [selectedInsertAt, setSelectedInsertAt] = useState(0);
  const bankStripRef = useRef<HTMLDivElement>(null);
  const bankDragRef = useRef({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
    pointerId: -1,
  });
  const favSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favHydrated = useRef(false);
  const favSkipNextSave = useRef(true);
  const [bankSidebarOpen, setBankSidebarOpen] = useState(false);
  const [aadhaar, setAadhaar] = useState("");
  const [mobile, setMobile] = useState("");
  const [amount, setAmount] = useState("");
  const [aadhaarVisible, setAadhaarVisible] = useState(false);
  const [aadhaarFocused, setAadhaarFocused] = useState(false);
  const [consent, setConsent] = useState(true);
  const [activeDevice, setActiveDevice] = useState<BiometricDevice>(BIOMETRIC_DEVICES[0]);
  const [deviceSidebarOpen, setDeviceSidebarOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("fingerprint");
  const [scanning, setScanning] = useState(false);
  const [rdStatus, setRdStatus] = useState<"looking" | "ready" | "missing">("looking");
  const [rdEndpoint, setRdEndpoint] = useState<RdEndpoint | null>(null);
  const [favBanks, setFavBanks] = useState<string[]>([...DEFAULT_AEPS_FAV_BANKS]);
  const [agentAuthReady, setAgentAuthReady] = useState<boolean | null>(null);
  const [agentAuthKycReady, setAgentAuthKycReady] = useState(true);
  const [agentAadhaar, setAgentAadhaar] = useState("");
  const [agentAadhaarVisible, setAgentAadhaarVisible] = useState(false);
  const [agentAuthConsent, setAgentAuthConsent] = useState(false);
  const [agentAuthScanning, setAgentAuthScanning] = useState(false);

  useEffect(() => {
    const q = searchParams.get("tab");
    if (q && (AEPS_TABS as readonly string[]).includes(q)) setTab(q as AepsTab);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<ApiResponse<{ verifiedToday: boolean; kycReady: boolean; aadhaarNumber?: string | null }>>(
        "/auth/agent-auth/status",
      )
      .then(({ data }) => {
        if (cancelled || !data.success) return;
        setAgentAuthReady(data.data.verifiedToday);
        setAgentAuthKycReady(data.data.kycReady);
        const digits = (data.data.aadhaarNumber ?? "").replace(/\D/g, "").slice(0, 12);
        if (digits.length === 12) setAgentAadhaar(digits);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not check AePS access";
        toast.error(msg);
        router.push("/dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function applyDiscoveredDevice(ep: RdEndpoint) {
    setRdEndpoint(ep);
    setRdStatus("ready");
    const name = (ep.deviceName || "").toLowerCase();
    if (!name) return;
    const match =
      BIOMETRIC_DEVICES.find((d) => name.includes("mfs110") && d.id === "mantra_mfs110") ||
      BIOMETRIC_DEVICES.find((d) => name.includes("marc") && d.id === "mantra_marc11") ||
      BIOMETRIC_DEVICES.find((d) => (name.includes("morpho") || name.includes("idemia")) && d.id.includes("morpho")) ||
      BIOMETRIC_DEVICES.find((d) => name.includes("startek") && d.id.includes("startek")) ||
      BIOMETRIC_DEVICES.find((d) => name.includes("evolute") && d.id.includes("evolute")) ||
      BIOMETRIC_DEVICES.find((d) => name.includes("vision") && d.id.includes("visiontek")) ||
      BIOMETRIC_DEVICES.find((d) => name.includes("precision") || name.includes("pb1000"));
    if (match) setActiveDevice(match);
  }

  /** Discover RD while user fills bank / Aadhaar — so Scan skips "looking for RD". */
  useEffect(() => {
    if (authMode !== "fingerprint") return;
    let cancelled = false;
    setRdStatus("looking");

    void (async () => {
      const ep = await warmRdService();
      if (cancelled) return;
      if (ep) applyDiscoveredDevice(ep);
      else {
        setRdEndpoint(null);
        setRdStatus("missing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authMode]);

  const toggleFavBank = useCallback((id: string) => {
    setFavBanks((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return sanitizeAepsFavIds(next);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<ApiResponse<{ bankIds: string[] | null }>>("/auth/aeps-favourite-banks")
      .then(({ data }) => {
        if (cancelled || !data.success) {
          favHydrated.current = true;
          return;
        }
        const fromServer = data.data?.bankIds;
        favSkipNextSave.current = true;
        if (fromServer && fromServer.length > 0) {
          setFavBanks(sanitizeAepsFavIds(fromServer));
        }
        favHydrated.current = true;
      })
      .catch(() => {
        favHydrated.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!favHydrated.current) return;
    if (favSkipNextSave.current) {
      favSkipNextSave.current = false;
      return;
    }
    if (favSaveTimer.current) clearTimeout(favSaveTimer.current);
    favSaveTimer.current = setTimeout(() => {
      void api
        .put("/auth/aeps-favourite-banks", { bankIds: favBanks })
        .catch(() => {
          /* non-fatal — local strip still works */
        });
    }, 400);
    return () => {
      if (favSaveTimer.current) clearTimeout(favSaveTimer.current);
    };
  }, [favBanks]);

  const showAmount = tab === "Withdraw" || tab === "Deposit";

  async function retryRdWarm() {
    setRdStatus("looking");
    const ep = await warmRdService(true);
    if (ep) applyDiscoveredDevice(ep);
    else {
      setRdEndpoint(null);
      setRdStatus("missing");
    }
  }

  async function verifyDailyAgentAuth() {
    if (agentAuthScanning) return;
    if (!agentAuthKycReady) {
      toast.error("Complete KYC Aadhaar before AePS access");
      return;
    }
    if (agentAadhaar.replace(/\D/g, "").length !== 12) {
      toast.error("Enter retailer's 12-digit Aadhaar");
      return;
    }
    if (!agentAuthConsent) {
      toast.error("Accept Aadhaar consent to continue");
      return;
    }
    if (rdStatus === "looking") {
      toast.error("Scanner still connecting — wait a moment");
      return;
    }
    if (rdStatus === "missing") {
      toast.error("RD Service not found. Open Mantra/Morpho RDService on this PC, then Retry.");
      return;
    }

    setAgentAuthScanning(true);
    try {
      const biometricPayload = await captureFingerprintWeb();
      const { data } = await api.post<ApiResponse<{ verifiedAt: string }>>("/auth/agent-auth", {
        aadhaarNumber: agentAadhaar.replace(/\D/g, ""),
        biometricPayload,
      });
      if (!data.success) throw new Error(data.message);
      setAgentAuthReady(true);
      toast.success("AePS unlocked for today");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : "Fingerprint verification failed");
      toast.error(msg, { duration: 10_000 });
      void retryRdWarm();
    } finally {
      setAgentAuthScanning(false);
    }
  }

  async function handleScan() {
    if (scanning) return;
    if (authMode === "iris") {
      toast.error("Iris capture is not enabled yet. Use Fingerprint.");
      return;
    }
    if (!selectedBank) {
      toast.error("Select customer bank first");
      return;
    }
    if (aadhaar.replace(/\D/g, "").length < 8) {
      toast.error("Enter a valid Aadhaar / VID number");
      return;
    }
    if (!consent) {
      toast.error("Customer must accept Aadhaar consent");
      return;
    }
    if (showAmount && !amount) {
      toast.error("Enter amount before scanning");
      return;
    }
    if (rdStatus === "looking") {
      toast.error("Scanner still connecting — wait a moment");
      return;
    }
    if (rdStatus === "missing") {
      toast.error("Mantra RD not found. Open RDService on this PC, then tap Retry.");
      return;
    }

    setScanning(true);
    try {
      const pidData = await captureFingerprintWeb();
      void pidData; // Biometric payload kept in memory for this capture only (not persisted).
      toast.success(`Fingerprint captured (${activeDevice.name})`);
      // Keep PidData in memory only — never persist biometric XML to session/local storage.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Capture failed";
      toast.error(msg, { duration: 12_000 });
      console.error("[AePS] capture failed", err);
      console.error("[AePS] RD probe log:\n", getRdProbeLog());
      void retryRdWarm();
    } finally {
      setScanning(false);
    }
  }

  const stripBanks = useMemo(() => {
    const byId = new Map(BANKS.map((b) => [b.id, b]));
    const favs = favBanks
      .map((id) => byId.get(id))
      .filter((b): b is Bank => Boolean(b));
    const base = favs.length > 0 ? favs : BANKS.slice(0, 12);
    if (!selectedBank) return base;
    if (base.some((b) => b.id === selectedBank.id)) return base;
    const slot = Math.min(selectedInsertAt % 4, base.length);
    return [...base.slice(0, slot), selectedBank, ...base.slice(slot)];
  }, [favBanks, selectedBank, selectedInsertAt]);

  const selectBank = useCallback(
    (bank: Bank, fromViewAll: boolean) => {
      const byId = new Map(BANKS.map((b) => [b.id, b]));
      const favs = favBanks
        .map((id) => byId.get(id))
        .filter((b): b is Bank => Boolean(b));
      const base = favs.length > 0 ? favs : BANKS;
      const already = base.some((b) => b.id === bank.id);
      if (fromViewAll && !already) {
        setSelectedInsertAt(insertSlot);
        setInsertSlot((s) => (s + 1) % 4);
      }
      setSelectedBank(bank);
    },
    [favBanks, insertSlot],
  );

  const scrollSelectedIntoView = useCallback(() => {
    const root = bankStripRef.current;
    if (!root || !selectedBank) return;
    const el = root.querySelector(`[data-bank-id="${selectedBank.id}"]`) as HTMLElement | null;
    if (!el) return;
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.left >= rootRect.left && elRect.right <= rootRect.right) return;
    if (elRect.left < rootRect.left) {
      root.scrollBy({ left: elRect.left - rootRect.left - 8, behavior: "smooth" });
    } else {
      root.scrollBy({ left: elRect.right - rootRect.right + 8, behavior: "smooth" });
    }
  }, [selectedBank]);

  useEffect(() => {
    const t = window.setTimeout(scrollSelectedIntoView, 40);
    return () => window.clearTimeout(t);
  }, [selectedBank?.id, stripBanks, scrollSelectedIntoView]);

  function formatAadhaar(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 12);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  function maskAadhaar(v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length <= 4) return digits;
    return "XXXX XXXX " + digits.slice(-4);
  }

  if (agentAuthReady === null) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-500">Checking today&apos;s AePS verification…</p>
        </div>
      </AppShell>
    );
  }

  if (!agentAuthReady) {
    const retailerLabel = user?.name?.trim() || "Retailer";
    const aadhaarDigits = agentAadhaar.replace(/\D/g, "").length;
    const canScan = agentAuthKycReady && agentAuthConsent && aadhaarDigits === 12 && !agentAuthScanning;

    return (
      <AppShell>
        <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border bg-white transition hover:bg-gray-50"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold" style={{ color: B.blue }}>
                Mandatory 2FA for AePS Access
              </h1>
              <p className="text-xs" style={{ color: B.muted }}>
                Verify once daily before your first AePS or Aadhaar Pay transaction.
              </p>
            </div>
          </div>

          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div
              className="flex items-center gap-3 px-6 py-5"
              style={{ background: `linear-gradient(135deg, ${B.blue}, ${B.blueMid})` }}
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Fingerprint size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Daily retailer verification</h2>
                <p className="mt-0.5 text-xs text-white/70">
                  Enter your KYC Aadhaar, then scan fingerprint on the connected RD device.
                </p>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div>
                <label className="text-xs font-bold tracking-wide text-gray-500">
                  AADHAAR NUMBER OF {retailerLabel.toUpperCase()}
                </label>
                <div
                  className="mt-2 flex items-center gap-2 rounded-xl border-2 px-3.5 py-3 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-50"
                  style={{ borderColor: B.border }}
                >
                  <input
                    value={
                      agentAadhaarVisible
                        ? formatAadhaar(agentAadhaar)
                        : maskAadhaar(agentAadhaar)
                    }
                    onChange={(e) => setAgentAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    onFocus={() => setAgentAadhaarVisible(true)}
                    placeholder={
                      agentAuthKycReady
                        ? agentAadhaar.length === 12
                          ? "From signup KYC"
                          : "Enter 12-digit Aadhaar"
                        : "KYC Aadhaar not found"
                    }
                    disabled={!agentAuthKycReady || agentAuthScanning}
                    inputMode="numeric"
                    className="flex-1 bg-transparent text-sm font-semibold tracking-wide outline-none disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setAgentAadhaarVisible((v) => !v)}
                    className="text-gray-400 transition hover:text-gray-600"
                  >
                    {agentAadhaarVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <label
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm text-gray-700 transition hover:bg-gray-50"
                style={{ borderColor: B.border }}
              >
                <input
                  type="checkbox"
                  checked={agentAuthConsent}
                  onChange={(e) => setAgentAuthConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>I accept Aadhaar Consent for today&apos;s AePS access.</span>
              </label>

              <div>
                <p className="mb-3 text-xs font-bold tracking-wide text-gray-500">AUTHENTICATION MODE</p>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 shadow-sm"
                    style={{ borderColor: B.blue, background: `${B.blue}0A` }}
                  >
                    <div className="absolute right-2.5 top-2.5">
                      <CircleDot size={14} className="text-green-600" />
                    </div>
                    <Fingerprint size={28} style={{ color: B.blue }} />
                    <span className="text-sm font-bold" style={{ color: B.blue }}>
                      Fingerprint
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-4 opacity-60">
                    <ScanEye size={28} className="text-gray-400" />
                    <span className="text-sm font-bold text-gray-500">Eye Scan</span>
                    <span className="text-[11px] font-bold tracking-wide text-gray-400">COMING SOON</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border p-3.5" style={{ borderColor: B.border }}>
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                  style={{ backgroundColor: activeDevice.color }}
                >
                  {activeDevice.letter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {rdEndpoint ? formatRdDeviceLabel(rdEndpoint) : activeDevice.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        rdStatus === "ready" ? "bg-green-500" : rdStatus === "looking" ? "bg-amber-400" : "bg-red-400"
                      }`}
                    />
                    {rdStatus === "ready"
                      ? "Device ready"
                      : rdStatus === "looking"
                        ? "Looking for RD Service…"
                        : "RD Service not found"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void retryRdWarm()}
                  className="flex-shrink-0 text-xs font-bold text-blue-600 hover:underline"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceSidebarOpen(true)}
                  className="flex-shrink-0 text-xs font-bold text-blue-600 hover:underline"
                >
                  Change Device
                </button>
              </div>

              <button
                type="button"
                onClick={() => void verifyDailyAgentAuth()}
                disabled={!canScan}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                style={{ background: `linear-gradient(135deg, ${B.green}, ${B.blue})` }}
              >
                {agentAuthScanning ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Fingerprint size={18} />
                )}
                {agentAuthScanning ? "Place finger on scanner…" : "Scan Finger"}
              </button>
            </div>
          </div>

          <aside className="min-w-0 space-y-4 md:sticky md:top-4">
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
                How daily 2FA works
              </h3>
              <ol className="space-y-2 text-xs leading-relaxed text-gray-600">
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">1</span>
                  Confirm your signup KYC Aadhaar (auto-filled)
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">2</span>
                  Accept Aadhaar consent for today&apos;s session
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">3</span>
                  Connect Morpho / Mantra L1 RD device
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-50 text-[11px] font-bold text-green-700">✓</span>
                  Scan finger once — AePS unlocks for the day
                </li>
              </ol>
            </div>
            <div className="rounded-2xl border bg-amber-50 p-4" style={{ borderColor: "#FDE68A" }}>
              <p className="text-xs font-semibold leading-relaxed text-amber-800">
                Open the RD Service app on this PC before scanning. Same device must be used for
                AePS transactions after unlock.
              </p>
            </div>
          </aside>
          </div>

          <DeviceSidebar
            open={deviceSidebarOpen}
            onClose={() => setDeviceSidebarOpen(false)}
            activeDeviceId={activeDevice.id}
            onSelect={setActiveDevice}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] p-6">
        {/* Back + Title */}
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-gray-50"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              AePS — Aadhaar Enabled Payment
            </h1>
            <p className="text-xs" style={{ color: B.muted }}>
              Cash Withdraw, Balance Enquiry, Mini Statement & Deposit
            </p>
          </div>
        </div>

        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* ── Left: Form ─────────────────────────────────── */}
          <div className="min-w-0 space-y-5">
            {/* Tabs */}
            <div className="flex gap-2">
              {AEPS_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    tab === t
                      ? "text-white shadow-md"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                  style={tab === t ? { background: B.blue } : undefined}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Bank selector — scrollable; selected icon always kept visible (slot 1–4 floats) */}
            <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Select bank</p>
                <button
                  type="button"
                  onClick={() => setBankSidebarOpen(true)}
                  className="inline-flex items-center gap-0.5 text-xs font-bold transition hover:opacity-80"
                  style={{ color: B.blueLight }}
                >
                  View All <ChevronRight size={14} />
                </button>
              </div>
              <div
                ref={bankStripRef}
                className="scrollbar-none flex cursor-grab items-start gap-2 overflow-x-auto pb-1 active:cursor-grabbing"
                style={{ touchAction: "pan-x" }}
                onPointerDown={(e) => {
                  const el = bankStripRef.current;
                  if (!el || e.button !== 0) return;
                  bankDragRef.current = {
                    active: true,
                    startX: e.clientX,
                    scrollLeft: el.scrollLeft,
                    moved: false,
                    pointerId: e.pointerId,
                  };
                  el.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const drag = bankDragRef.current;
                  if (!drag.active) return;
                  const el = bankStripRef.current;
                  if (!el) return;
                  const dx = e.clientX - drag.startX;
                  if (Math.abs(dx) > 5) drag.moved = true;
                  el.scrollLeft = drag.scrollLeft - dx;
                }}
                onPointerUp={() => {
                  bankDragRef.current.active = false;
                }}
                onPointerCancel={() => {
                  bankDragRef.current.active = false;
                }}
                onClickCapture={(e) => {
                  if (bankDragRef.current.moved) {
                    e.preventDefault();
                    e.stopPropagation();
                    bankDragRef.current.moved = false;
                  }
                }}
                onScroll={() => {
                  window.clearTimeout((bankStripRef.current as HTMLDivElement & { _t?: number })._t);
                  (bankStripRef.current as HTMLDivElement & { _t?: number })._t = window.setTimeout(
                    scrollSelectedIntoView,
                    120,
                  );
                }}
              >
                {stripBanks.map((bank) => {
                  const active = selectedBank?.id === bank.id;
                  return (
                    <button
                      key={bank.id}
                      type="button"
                      data-bank-id={bank.id}
                      onClick={() => selectBank(bank, false)}
                      className="flex w-[72px] shrink-0 flex-col items-center"
                    >
                      <span
                        className={clsx(
                          "relative flex w-full flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition",
                          active
                            ? "border-blue-500 bg-blue-50 shadow-md shadow-blue-100"
                            : "border-transparent hover:bg-gray-50",
                        )}
                      >
                        {active ? (
                          <span
                            className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full"
                            style={{ background: B.blue }}
                          >
                            <Check size={10} className="text-white" strokeWidth={3} />
                          </span>
                        ) : null}
                        <BankIcon bank={bank} size={44} />
                        <span
                          className={clsx(
                            "w-full truncate text-center text-[11px] leading-tight",
                            active ? "font-bold" : "font-medium text-gray-600",
                          )}
                          style={active ? { color: B.blue } : undefined}
                        >
                          {bank.shortName}
                        </span>
                      </span>
                      <span className="flex h-4 items-center justify-center">
                        {active ? <ChevronDown size={16} style={{ color: B.blueLight }} strokeWidth={2.6} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedBank ? (
                <div
                  className="mt-1 flex items-center gap-3 rounded-xl border px-3 py-2.5"
                  style={{ borderColor: `${B.blueLight}55`, background: `${B.blue}0A` }}
                >
                  <BankIcon bank={selectedBank} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                      {selectedBank.name}
                    </p>
                    <p className="text-[12px] text-gray-500">Selected bank for this transaction</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBankSidebarOpen(true)}
                    className="text-xs font-bold"
                    style={{ color: B.blueLight }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div
                  className="mt-1 rounded-xl border border-dashed px-3 py-3 text-center text-xs font-medium text-gray-400"
                  style={{ borderColor: B.border }}
                >
                  Tap a bank above to select
                </div>
              )}
            </div>

            {/* Form fields */}
            <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Aadhaar */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Aadhaar or VID Number
                  </label>
                  <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={aadhaarFocused || aadhaarVisible ? formatAadhaar(aadhaar) : maskAadhaar(aadhaar)}
                      onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                      onFocus={() => setAadhaarFocused(true)}
                      onBlur={() => setAadhaarFocused(false)}
                      placeholder="XXXX XXXX XXXX"
                      className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => setAadhaarVisible((v) => !v)}
                      className="ml-2 text-gray-400 hover:text-gray-600"
                    >
                      {aadhaarVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Mobile */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Mobile Number"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium outline-none placeholder:text-gray-400 focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                  />
                </div>
              </div>

              {/* Amount (only for Withdraw / Deposit) */}
              {showAmount && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Amount to {tab}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="Amount to Withdraw"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium outline-none placeholder:text-gray-400 focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                  />
                  <div className="mt-3 flex gap-2">
                    {QUICK_AMOUNTS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAmount(String(a))}
                        className={clsx(
                          "rounded-full border px-4 py-1.5 text-xs font-bold transition",
                          amount === String(a)
                            ? "border-blue-400 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                        )}
                      >
                        ₹{a.toLocaleString("en-IN")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Consent */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  I (the customer) accept{" "}
                  <span className="font-semibold text-blue-700 underline">Aadhaar Consent</span>{" "}
                  and have read the{" "}
                  <span className="font-semibold text-blue-700 underline">AePS Advisory</span>
                </span>
              </label>
            </div>

            {/* Authentication Mode */}
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <label className="mb-3 block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Authentication Mode
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMode("fingerprint")}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-xl border-2 px-5 py-3 text-sm font-semibold transition",
                    authMode === "fingerprint"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
                  )}
                >
                  <Fingerprint size={20} />
                  Fingerprint
                  {authMode === "fingerprint" && (
                    <CircleDot size={16} className="ml-1 text-green-500" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("iris")}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-xl border-2 px-5 py-3 text-sm font-semibold transition",
                    authMode === "iris"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
                  )}
                >
                  <ScanEye size={20} />
                  Iris
                  {authMode === "iris" && (
                    <CircleDot size={16} className="ml-1 text-green-500" />
                  )}
                </button>
              </div>
            </div>

            {/* Scanner status — below mode; discovers while user fills form */}
            {authMode === "fingerprint" && (
              <div
                className={clsx(
                  "flex items-center gap-4 rounded-2xl border px-4 py-4",
                  rdStatus === "ready" && "border-green-200 bg-green-50",
                  rdStatus === "looking" && "border-blue-100 bg-blue-50/60",
                  rdStatus === "missing" && "border-amber-200 bg-amber-50",
                )}
              >
                <div
                  className={clsx(
                    "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                    rdStatus === "ready" && "bg-green-100 text-green-700",
                    rdStatus === "looking" && "bg-blue-100 text-blue-600",
                    rdStatus === "missing" && "bg-amber-100 text-amber-700",
                  )}
                >
                  <Fingerprint size={28} strokeWidth={2} />
                  {rdStatus === "looking" && (
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-blue-500" />
                  )}
                  {rdStatus === "ready" && (
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-green-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {rdStatus === "looking" && (
                    <>
                      <p className="text-sm font-bold text-blue-800">Connecting scanner…</p>
                      <p className="text-xs text-blue-600/90">
                        Fill bank &amp; Aadhaar — device ready by the time you scan
                      </p>
                    </>
                  )}
                  {rdStatus === "ready" && (
                    <>
                      <p className="text-sm font-bold text-green-800">Scanner ready</p>
                      <p className="text-sm font-semibold text-green-900">
                        {rdEndpoint ? formatRdDeviceLabel(rdEndpoint) : "Device connected"}
                      </p>
                    </>
                  )}
                  {rdStatus === "missing" && (
                    <>
                      <p className="text-sm font-bold text-amber-900">Scanner not found</p>
                      <p className="text-xs text-amber-800/90">
                        Open Mantra L1 RDService on this PC, then retry
                      </p>
                    </>
                  )}
                </div>
                {rdStatus === "missing" && (
                  <button
                    type="button"
                    onClick={() => void retryRdWarm()}
                    className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Biometric device + Scan */}
            <div
              className="flex items-center justify-between rounded-2xl border bg-white p-4"
              style={{ borderColor: B.border }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white font-bold"
                  style={{ backgroundColor: activeDevice.color, fontSize: 15 }}
                >
                  {activeDevice.letter}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{activeDevice.name}</p>
                  <button
                    type="button"
                    onClick={() => setDeviceSidebarOpen(true)}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: B.blueLight }}
                  >
                    Change Device
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={scanning || (authMode === "fingerprint" && rdStatus !== "ready")}
                onClick={handleScan}
                className={clsx(
                  "rounded-xl px-8 py-3 text-sm font-bold text-white shadow-lg transition",
                  scanning || (authMode === "fingerprint" && rdStatus !== "ready")
                    ? "cursor-not-allowed opacity-50"
                    : "hover:opacity-90",
                )}
                style={{
                  background: `linear-gradient(135deg, ${B.green} 0%, #0F9E5C 100%)`,
                }}
              >
                {scanning
                  ? "Place finger on scanner…"
                  : authMode === "fingerprint"
                    ? "Scan Finger"
                    : "Scan Iris"}
              </button>
            </div>
          </div>

          {/* ── Right: Help / Info (parallel from md up) ───── */}
          <aside className="min-w-0 space-y-4 md:sticky md:top-4">
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
                How AePS Works
              </h3>
              <ol className="space-y-2 text-xs text-gray-600 leading-relaxed">
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">1</span>
                  Select customer&apos;s bank
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">2</span>
                  Enter Aadhaar number &amp; mobile
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">3</span>
                  Enter amount (for withdraw/deposit)
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">4</span>
                  Scan customer fingerprint
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-50 text-[11px] font-bold text-green-700">✓</span>
                  Transaction complete — receipt generated
                </li>
              </ol>
            </div>

            <div className="rounded-2xl border p-5" style={{ borderColor: B.border, background: `${B.green}08` }}>
              <h3 className="mb-2 text-sm font-bold" style={{ color: B.greenDark }}>
                Commission Info
              </h3>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Cash Withdraw</span>
                  <span className="font-bold" style={{ color: B.greenDark }}>Upto ₹3.50</span>
                </div>
                <div className="flex justify-between">
                  <span>Balance Enquiry</span>
                  <span className="font-bold" style={{ color: B.greenDark }}>₹1.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Mini Statement</span>
                  <span className="font-bold" style={{ color: B.greenDark }}>₹1.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Aadhaar Pay</span>
                  <span className="font-bold" style={{ color: B.greenDark }}>₹2.00</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-amber-50 p-4" style={{ borderColor: "#FDE68A" }}>
              <p className="text-xs font-semibold text-amber-800 leading-relaxed">
                Mantra (Windows): RDService open + Device connected. Live HTTPS site ke liye Chrome
                flags: allow-insecure-localhost ON, block-insecure-private-network-requests OFF.
                Best test: <span className="font-mono">http://localhost:3001/aeps</span> same PC pe.
                Scan pe red light aaye to finger immediately lagao.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* Bank sidebar popup */}
      <BankSidebar
        open={bankSidebarOpen}
        onClose={() => setBankSidebarOpen(false)}
        onSelect={(bank) => selectBank(bank, true)}
        favouriteIds={favBanks}
        onToggleFav={toggleFavBank}
      />

      {/* Device selector sidebar */}
      <DeviceSidebar
        open={deviceSidebarOpen}
        onClose={() => setDeviceSidebarOpen(false)}
        activeDeviceId={activeDevice.id}
        onSelect={setActiveDevice}
      />
    </AppShell>
  );
}
