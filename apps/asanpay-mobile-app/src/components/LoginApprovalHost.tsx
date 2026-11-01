import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { ModalSheet } from "./ModalSheet";
import { showAlert } from "./AppAlert";
import { InlineError, LaButton, laStyles } from "./linkedAccounts/parts";
import { apiError } from "../utils/apiError";
import {
  decideLoginApproval,
  fetchPendingLoginApprovals,
  onLoginApprovalPush,
  type PendingLoginApproval,
} from "../lib/loginApproval";
import { useAuthStore } from "../store/auth";
import { colors } from "../theme/colors";

/** The request can no longer be answered — close the popup and show the server message. */
const CLOSED_CODES = new Set([
  "LOGIN_APPROVAL_WRONG_NUMBER",
  "LOGIN_APPROVAL_EXPIRED",
  "LOGIN_APPROVAL_DECIDED",
  "LOGIN_APPROVAL_NOT_FOUND",
]);

function secondsUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/**
 * Web login approval popup. Opens on a `login_approval` push (foreground, tapped, cold start) and
 * on app open / resume, so a missed push still reaches the agent while the request is live.
 */
export function LoginApprovalHost() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [current, setCurrent] = useState<PendingLoginApproval | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const dismissed = useRef(new Set<string>());
  const currentId = useRef<string | null>(null);

  function clear() {
    currentId.current = null;
    setCurrent(null);
  }

  const load = useCallback(async () => {
    if (!useAuthStore.getState().user) return;
    try {
      const list = await fetchPendingLoginApprovals();
      const next = list.find((a) => !dismissed.current.has(a.id)) ?? null;
      if (currentId.current === (next?.id ?? null)) return;
      currentId.current = next?.id ?? null;
      setPicked(null);
      setError(null);
      setCurrent(next);
    } catch {
      /* best effort — the next push or app open retries */
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      clear();
      return;
    }
    void load();
  }, [userId, load]);

  useEffect(() => onLoginApprovalPush(() => void load()), [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (!current) return;
    setSecondsLeft(secondsUntil(current.expiresAt));
    const id = setInterval(() => {
      const left = secondsUntil(current.expiresAt);
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        dismissed.current.add(current.id);
        clear();
        showAlert("Login request expired", "No action was taken. The web login was not approved.");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [current]);

  function close() {
    if (current) dismissed.current.add(current.id);
    clear();
  }

  async function decide(decision: "approve" | "deny") {
    if (!current) return;
    if (decision === "approve" && picked == null) {
      setError("Pick the number shown on the web login screen");
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const status = await decideLoginApproval(current.id, decision, picked ?? undefined);
      dismissed.current.add(current.id);
      clear();
      if (status === "approved") {
        showAlert("Web login approved", "The browser is now signed in to your AsanPay account.");
      } else {
        showAlert(
          "Web login denied",
          "The browser was not signed in. If this wasn't you, change your password now.",
        );
      }
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      const message = apiError(err, "Could not send your answer. Check your internet and try again.");
      if (code && CLOSED_CODES.has(code)) {
        dismissed.current.add(current.id);
        clear();
        showAlert(code === "LOGIN_APPROVAL_WRONG_NUMBER" ? "Login blocked" : "Login request closed", message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  if (!current) return null;

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const place = current.city ?? (current.ip ? `IP ${current.ip}` : "Unknown location");

  return (
    <ModalSheet
      visible
      title="Approve web login?"
      subtitle="Pick the number shown on the web login screen, then tap Approve."
      icon={<ShieldCheck />}
      iconTone="blue"
      onClose={close}
    >
      <View style={styles.card}>
        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Browser</Text>
            <Text style={styles.tileValue} numberOfLines={1}>
              {current.browser ?? "Web browser"}
            </Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Location</Text>
            <Text style={styles.tileValue} numberOfLines={1}>
              {place}
            </Text>
          </View>
        </View>
        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Requested at</Text>
            <Text style={styles.tileValue}>{formatTime(current.createdAt)}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Expires in</Text>
            <Text style={[styles.tileValue, secondsLeft <= 20 && { color: colors.danger }]}>
              {mm}:{ss}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[laStyles.label, styles.pickLabel]}>Which number do you see on the web?</Text>
      <View style={styles.choices}>
        {current.choices.map((n) => {
          const on = picked === n;
          return (
            <Pressable
              key={n}
              onPress={() => {
                setPicked(n);
                setError(null);
              }}
              style={[styles.choice, on && styles.choiceOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Number ${n}`}
            >
              <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={laStyles.helper}>If you did not try to log in on a computer, tap Deny.</Text>
      <InlineError message={error} />

      <View style={laStyles.btnRow}>
        <LaButton label="Deny" tone="red" onPress={() => void decide("deny")} disabled={busy !== null} loading={busy === "deny"} />
        <LaButton
          label="Approve"
          tone="blue"
          onPress={() => void decide("approve")}
          disabled={picked == null || busy !== null}
          loading={busy === "approve"}
        />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: "#F7F9FF", padding: 12, gap: 10 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: "#fff", paddingVertical: 8, paddingHorizontal: 10 },
  tileLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: colors.textMuted },
  tileValue: { marginTop: 2, fontSize: 14, fontWeight: "700", color: colors.blue },
  pickLabel: { marginTop: 18 },
  choices: { flexDirection: "row", gap: 12 },
  choice: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceOn: { borderColor: colors.blueLight, backgroundColor: colors.bluePale },
  choiceText: { fontSize: 26, fontWeight: "800", color: colors.text },
  choiceTextOn: { color: colors.blue },
});
