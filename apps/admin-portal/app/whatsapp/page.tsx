"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { MessageCircle } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface SupportConfig {
  enabled: boolean;
  webhookConfigured: boolean;
}

interface Conversation {
  id: string;
  waId: string;
  phoneDisplay: string | null;
  profileName: string | null;
  userId: string | null;
  userName: string | null;
  userMobile: string | null;
  userRole: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string | null;
  status: string;
  isOtp: boolean;
  createdAt: string;
  statusAt: string | null;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function statusTick(status: string): string {
  if (status === "read") return "✓✓";
  if (status === "delivered") return "✓✓";
  if (status === "sent") return "✓";
  if (status === "failed") return "!";
  return "";
}

export default function WhatsAppInboxPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedMeta, setSelectedMeta] = useState<Conversation | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);

  const loadConfigAndList = useCallback(async () => {
    setLoadingList(true);
    try {
      const cfg = await fetchApi<SupportConfig>("/whatsapp/support/config");
      setConfig(cfg);
      if (!cfg.enabled) {
        setConversations([]);
        return;
      }
      const list = await fetchApi<Conversation[]>("/whatsapp/support/conversations");
      setConversations(list);
    } catch {
      toast.error("Failed to load WhatsApp inbox");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void loadConfigAndList();
  }, [hydrated, accessToken, router, loadConfigAndList]);

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadingThread(true);
    try {
      const data = await fetchApi<{ conversation: Conversation; messages: ChatMessage[] }>(
        `/whatsapp/support/conversations/${id}/messages`,
      );
      setSelectedMeta(data.conversation);
      setMessages(data.messages);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
      );
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setLoadingThread(false);
    }
  }, []);

  if (!hydrated || !accessToken) return null;

  const title =
    selectedMeta?.profileName ||
    selectedMeta?.userName ||
    selectedMeta?.phoneDisplay ||
    selectedMeta?.waId ||
    "Conversation";

  return (
    <AdminShell>
      <div className="flex h-[calc(100vh-5.5rem)] flex-col gap-3 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={22} style={{ color: B.blue }} />
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              WhatsApp Inbox
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void loadConfigAndList()}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: B.border, color: B.blueMid }}
          >
            Refresh
          </button>
        </div>

        {config && !config.enabled && (
          <div
            className="rounded-2xl border p-4 text-sm"
            style={{ borderColor: B.border, background: "#FFF7ED", color: "#9A3412" }}
          >
            WhatsApp Support is turned off. Set{" "}
            <code className="font-mono text-xs">WHATSAPP_SUPPORT_ENABLED=true</code> on the
            backend in Coolify, redeploy, then refresh. Login OTP keeps working either way.
            {!config.webhookConfigured && (
              <span className="mt-1 block">
                Also set <code className="font-mono text-xs">WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>{" "}
                and register the Meta webhook callback URL.
              </span>
            )}
          </div>
        )}

        {config?.enabled && (
          <div
            className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white"
            style={{ borderColor: B.border }}
          >
            {/* Conversation list */}
            <div
              className="flex w-full flex-col border-r md:w-[340px] md:shrink-0"
              style={{ borderColor: B.border }}
            >
              <div
                className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{ borderColor: B.border, color: B.muted }}
              >
                Chats
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingList && (
                  <p className="p-4 text-sm" style={{ color: B.muted }}>
                    Loading…
                  </p>
                )}
                {!loadingList && conversations.length === 0 && (
                  <p className="p-4 text-sm" style={{ color: B.muted }}>
                    No conversations yet. When a customer messages your WhatsApp Business number,
                    the thread appears here.
                  </p>
                )}
                {conversations.map((c) => {
                  const active = c.id === selectedId;
                  const label = c.profileName || c.userName || c.phoneDisplay || c.waId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void openThread(c.id)}
                      className="flex w-full flex-col gap-0.5 border-b px-3 py-3 text-left transition-colors"
                      style={{
                        borderColor: B.border,
                        background: active ? "rgba(42,92,221,0.08)" : "transparent",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                          {label}
                        </span>
                        <span className="shrink-0 text-[11px]" style={{ color: B.muted }}>
                          {formatWhen(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs" style={{ color: B.muted }}>
                          {c.lastMessagePreview || "—"}
                        </span>
                        {c.unreadCount > 0 && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                            style={{ background: B.green }}
                          >
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      {(c.userMobile || c.userRole) && (
                        <span className="text-[11px]" style={{ color: B.blueMid }}>
                          {[c.userRole?.replace(/_/g, " "), c.userMobile].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Thread */}
            <div className="hidden min-w-0 flex-1 flex-col md:flex">
              {!selectedId && (
                <div
                  className="flex flex-1 items-center justify-center text-sm"
                  style={{ color: B.muted }}
                >
                  Select a chat to view messages. Reply arrives in Phase 2.
                </div>
              )}
              {selectedId && (
                <>
                  <div
                    className="border-b px-4 py-3"
                    style={{ borderColor: B.border, background: "#F8FAFC" }}
                  >
                    <div className="font-semibold" style={{ color: B.blue }}>
                      {title}
                    </div>
                    <div className="text-xs" style={{ color: B.muted }}>
                      {selectedMeta?.waId}
                      {selectedMeta?.userMobile ? ` · Agent ${selectedMeta.userMobile}` : ""}
                    </div>
                  </div>
                  <div
                    className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
                    style={{ background: "#ECE5DD" }}
                  >
                    {loadingThread && (
                      <p className="text-sm" style={{ color: B.muted }}>
                        Loading messages…
                      </p>
                    )}
                    {!loadingThread &&
                      messages.map((m) => {
                        const mine = m.direction === "outbound";
                        return (
                          <div
                            key={m.id}
                            className={`flex ${mine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className="max-w-[75%] rounded-lg px-3 py-2 shadow-sm"
                              style={{
                                background: mine ? "#DCF8C6" : "#FFFFFF",
                                color: "#111827",
                              }}
                            >
                              {m.isOtp && (
                                <div className="mb-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                  OTP
                                </div>
                              )}
                              <p className="whitespace-pre-wrap text-sm">{m.body || `[${m.messageType}]`}</p>
                              <div
                                className="mt-1 flex items-center justify-end gap-1 text-[10px]"
                                style={{ color: "#6B7280" }}
                              >
                                <span>{formatWhen(m.createdAt)}</span>
                                {mine && <span>{statusTick(m.status)}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div
                    className="border-t px-4 py-3 text-xs"
                    style={{ borderColor: B.border, color: B.muted, background: "#F8FAFC" }}
                  >
                    Reply from dashboard ships in Phase 2. Status ticks update from Meta webhooks.
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
