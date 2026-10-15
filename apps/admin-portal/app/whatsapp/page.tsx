"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { MessageCircle } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { WhatsAppBroadcastPanel } from "@/components/whatsapp/BroadcastPanel";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface SupportConfig {
  enabled: boolean;
  webhookConfigured: boolean;
  supportTemplateName: string | null;
  supportTemplateLanguage: string;
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
  windowOpen?: boolean;
  windowClosesAt?: string | null;
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

function apiErrorMessage(err: unknown): string {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message || ax.message || "Failed to send message";
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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [forceTemplate, setForceTemplate] = useState(false);
  const [tab, setTab] = useState<"inbox" | "broadcast">("inbox");

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
    setDraft("");
    setForceTemplate(false);
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

  async function sendReply() {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post<{
        success: boolean;
        message?: string;
        data: {
          message: ChatMessage;
          usedTemplate: boolean;
          windowOpen: boolean;
        };
      }>(`/whatsapp/support/conversations/${selectedId}/reply`, {
        text: draft.trim(),
        useTemplate: forceTemplate || undefined,
      });
      if (!data.success) throw new Error(data.message || "Failed to send message");
      const msg = data.data.message;
      setMessages((prev) => [...prev, msg]);
      setDraft("");
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                lastMessageAt: msg.createdAt,
                lastMessagePreview: msg.body,
              }
            : c,
        ),
      );
      if (selectedMeta) {
        setSelectedMeta({ ...selectedMeta, windowOpen: data.data.windowOpen });
      }
      toast.success(data.data.usedTemplate ? "Template message sent" : "Message sent");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const title =
    selectedMeta?.profileName ||
    selectedMeta?.userName ||
    selectedMeta?.phoneDisplay ||
    selectedMeta?.waId ||
    "Conversation";

  const windowOpen = Boolean(selectedMeta?.windowOpen);
  const hasTemplate = Boolean(config?.supportTemplateName);
  const willUseTemplate = forceTemplate || !windowOpen;
  const canSend = draft.trim().length > 0 && !sending && (windowOpen || hasTemplate);

  return (
    <AdminShell>
      <div className="flex h-[calc(100vh-5.5rem)] flex-col gap-3 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={22} style={{ color: B.blue }} />
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              WhatsApp
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

        {config?.enabled && (
          <div className="flex gap-2">
            {(
              [
                { id: "inbox" as const, label: "Inbox" },
                { id: "broadcast" as const, label: "Broadcast" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                data-active={tab === t.id}
                className="tab-chip rounded-full px-4 py-1.5 text-sm font-semibold"
                style={{
                  background: tab === t.id ? B.blue : "transparent",
                  color: tab === t.id ? "#fff" : B.blueMid,
                  border: `1px solid ${tab === t.id ? B.blue : B.border}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {config && !config.enabled && (
          <div
            className="rounded-2xl border p-4 text-sm"
            style={{ borderColor: B.border, background: "#FFF7ED", color: "#9A3412" }}
          >
            WhatsApp Support is turned off. Set{" "}
            <code className="font-mono text-xs">WHATSAPP_SUPPORT_ENABLED=true</code> on the
            backend in Coolify, redeploy, then refresh. Login OTP keeps working either way.
          </div>
        )}

        {config?.enabled && tab === "broadcast" && (
          <WhatsAppBroadcastPanel config={config} />
        )}

        {config?.enabled && tab === "inbox" && (
          <div
            className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white"
            style={{ borderColor: B.border }}
          >
            <div
              className={`flex w-full flex-col border-r md:w-[340px] md:shrink-0 ${selectedId ? "hidden md:flex" : "flex"}`}
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

            <div
              className={`min-w-0 flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}
            >
              {!selectedId && (
                <div
                  className="flex flex-1 items-center justify-center text-sm"
                  style={{ color: B.muted }}
                >
                  Select a chat to view messages and reply.
                </div>
              )}
              {selectedId && (
                <>
                  <div
                    className="border-b px-4 py-3"
                    style={{ borderColor: B.border, background: "#F8FAFC" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button
                          type="button"
                          className="mb-1 text-xs font-medium md:hidden"
                          style={{ color: B.blueMid }}
                          onClick={() => setSelectedId(null)}
                        >
                          ← Chats
                        </button>
                        <div className="font-semibold" style={{ color: B.blue }}>
                          {title}
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          {selectedMeta?.waId}
                          {selectedMeta?.userMobile ? ` · Agent ${selectedMeta.userMobile}` : ""}
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: windowOpen ? "#DCFCE7" : "#FEF3C7",
                          color: windowOpen ? "#166534" : "#92400E",
                        }}
                      >
                        {windowOpen ? "24h window open" : "Window closed"}
                      </span>
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
                              {m.messageType === "template" && !m.isOtp && (
                                <div className="mb-0.5 text-[10px] font-semibold uppercase text-sky-700">
                                  Template
                                </div>
                              )}
                              <p className="whitespace-pre-wrap text-sm">
                                {m.body || `[${m.messageType}]`}
                              </p>
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
                    className="space-y-2 border-t px-3 py-3"
                    style={{ borderColor: B.border, background: "#F8FAFC" }}
                  >
                    {!windowOpen && (
                      <p className="text-xs" style={{ color: "#92400E" }}>
                        {hasTemplate
                          ? `Free text is blocked outside 24h. Reply will use template “${config?.supportTemplateName}” (body variable = your text).`
                          : "Free text is blocked outside 24h. Set WHATSAPP_SUPPORT_TEMPLATE_NAME in Coolify to an approved template with one body variable, or wait until the customer messages again."}
                      </p>
                    )}
                    {windowOpen && hasTemplate && (
                      <label className="flex items-center gap-2 text-xs" style={{ color: B.muted }}>
                        <input
                          type="checkbox"
                          checked={forceTemplate}
                          onChange={(e) => setForceTemplate(e.target.checked)}
                        />
                        Send as template ({config?.supportTemplateName})
                      </label>
                    )}
                    <div className="flex gap-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={2}
                        placeholder={
                          willUseTemplate && hasTemplate
                            ? "Template body text…"
                            : "Type a reply…"
                        }
                        className="min-h-[44px] flex-1 resize-none rounded-xl border px-3 py-2 text-sm"
                        style={{ borderColor: B.border }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendReply();
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={!canSend}
                        onClick={() => void sendReply()}
                        className="self-end rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: B.blue }}
                      >
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </div>
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
