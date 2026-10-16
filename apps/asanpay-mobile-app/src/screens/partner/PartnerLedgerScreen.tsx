import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BookOpen, Download, CirclePlay } from "lucide-react-native";
import { fetchApi } from "../../lib/api";
import { formatINR } from "../../lib/format";
import type { DownlineUser, LedgerEntry } from "../../lib/types";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { PartnerTopBar } from "../../components/PartnerTopBar";
import { DateRangeFields, toYmd } from "../../components/DateRangeCard";

const MAX_ROWS = 500;

const REF_LABEL: Record<string, string> = {
  downline_transfer: "VALUE-FWD",
  upline_pull: "REVERSE",
  fund_request: "FUND-REQ",
  external_funding: "FUNDING",
  commission: "COMMISSION",
};

/** ₹5.78 L / ₹1.2 Cr style for the summary strip. */
export function formatCompactINR(raw: number): string {
  const abs = Math.abs(raw);
  const sign = raw < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹ ${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹ ${(abs / 1e5).toFixed(2)} L`;
  return `${sign}${formatINR(abs.toFixed(2))}`;
}

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return `Today · ${label}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${label}`;
  return label;
}

function entryTitle(e: LedgerEntry, byId: Map<string, DownlineUser>): string {
  const party = e.referenceId ? byId.get(e.referenceId) : undefined;
  const who = party ? `${party.name} (${party.mobile})` : null;
  if (e.referenceType === "downline_transfer") {
    return e.entryType === "debit" ? `Sent to: ${who ?? "partner"}` : "Received from upline";
  }
  if (e.referenceType === "upline_pull") {
    return e.entryType === "credit" ? `Reversed from: ${who ?? "partner"}` : "Reversed by upline";
  }
  if (e.referenceType === "fund_request") return e.entryType === "credit" ? "Fund request credited" : "Fund request reversed";
  return e.description || (e.entryType === "credit" ? "Credit" : "Debit");
}

export function PartnerLedgerScreen() {
  const { tokens } = useTheme();
  const today = toYmd(new Date());
  const [range, setRange] = useState({ from: today, to: today });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: { from: string; to: string }) => {
    setLoading(true);
    try {
      const [rows, kids] = await Promise.all([
        fetchApi<LedgerEntry[]>("/wallet/ledger", { from: r.from, to: r.to, limit: MAX_ROWS }),
        fetchApi<DownlineUser[]>("/users/downline").catch(() => [] as DownlineUser[]),
      ]);
      setEntries(rows.filter((e) => e.walletType === "main"));
      setDownline(kids);
    } catch (err) {
      showAlert("Could not load ledger", (err as Error).message || "Check your connection and tap View again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ from: today, to: today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map(downline.map((d) => [d.id, d])), [downline]);

  const summary = useMemo(() => {
    if (entries.length === 0) return null;
    let credits = 0;
    let debits = 0;
    for (const e of entries) {
      if (e.entryType === "credit") credits += Number(e.amount);
      else debits += Number(e.amount);
    }
    const newest = entries[0]!;
    const oldest = entries[entries.length - 1]!;
    const oldestSigned = oldest.entryType === "credit" ? Number(oldest.amount) : -Number(oldest.amount);
    return {
      opening: Number(oldest.balanceAfter) - oldestSigned,
      credits,
      debits,
      closing: Number(newest.balanceAfter),
    };
  }, [entries]);

  const groups = useMemo(() => {
    const out: { heading: string; rows: LedgerEntry[] }[] = [];
    for (const e of entries) {
      const heading = dayHeading(e.createdAt);
      const last = out[out.length - 1];
      if (last && last.heading === heading) last.rows.push(e);
      else out.push({ heading, rows: [e] });
    }
    return out;
  }, [entries]);

  function ledgerCsvBody() {
    const header = "Date,Particulars,Type,Amount,Balance";
    const lines = entries.map((e) =>
      [
        new Date(e.createdAt).toLocaleString("en-IN"),
        `"${entryTitle(e, byId).replace(/"/g, "'")}"`,
        e.entryType,
        e.amount,
        e.balanceAfter,
      ].join(","),
    );
    return [header, ...lines].join("\n");
  }

  function download() {
    if (entries.length === 0) {
      showAlert("Nothing to export", "No ledger entries in this date range");
      return;
    }
    const title = `AsanPay ledger ${range.from} to ${range.to}`;
    const csv = ledgerCsvBody();
    showAlert("Export", "Choose PDF, Excel, or CSV", [
      {
        text: "PDF",
        style: "primary",
        onPress: () => {
          void Share.share({
            title,
            message: `${title}\n\n${entries
              .map(
                (e) =>
                  `${new Date(e.createdAt).toLocaleString("en-IN")} · ${entryTitle(e, byId)}\n  ${e.entryType} ${e.amount} · Bal ${e.balanceAfter}`,
              )
              .join("\n\n")}\n\n— AsanPay`,
          });
        },
      },
      {
        text: "Excel",
        onPress: () => {
          void Share.share({ title: `${title}.xls`, message: csv.replace(/,/g, "\t") });
        },
      },
      {
        text: "CSV",
        onPress: () => {
          void Share.share({ title: `${title}.csv`, message: csv });
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const cardStyle = { backgroundColor: tokens.card, borderColor: tokens.cardBorder };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <PartnerTopBar title="Ledger" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load(range)} />}
      >
        <View style={[styles.card, cardStyle]}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: tokens.txt }]}>Account Ledger</Text>
              <Text style={[styles.sub, { color: tokens.sub }]}>Track all credits, debits & running balance</Text>
            </View>
            <View style={styles.bookIcon}>
              <BookOpen size={20} color="#fff" strokeWidth={2.2} />
            </View>
          </View>
          <DateRangeFields from={range.from} to={range.to} onChange={setRange} />
          <View style={styles.btnRow}>
            <Pressable style={[styles.btn, styles.btnBlue]} onPress={() => void load(range)} disabled={loading}>
              <CirclePlay size={17} color="#fff" />
              <Text style={styles.btnBlueText}>View</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnGreen]} onPress={download}>
              <Download size={17} color={colors.greenDark} />
              <Text style={styles.btnGreenText}>Export</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, styles.summary, cardStyle]}>
          {[
            { k: "Opening", v: summary ? formatCompactINR(summary.opening) : "—", c: tokens.txt },
            { k: "Credits", v: formatCompactINR(summary?.credits ?? 0), c: colors.greenDark },
            { k: "Debits", v: formatCompactINR(summary?.debits ?? 0), c: colors.dangerDark },
            { k: "Closing", v: summary ? formatCompactINR(summary.closing) : "—", c: tokens.txt },
          ].map((s) => (
            <View key={s.k} style={{ flex: 1 }}>
              <Text style={[styles.sumLabel, { color: tokens.sub }]}>{s.k}</Text>
              <Text style={[styles.sumValue, { color: s.c }]} numberOfLines={1} adjustsFontSizeToFit>
                {s.v}
              </Text>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 24 }} />
        ) : groups.length === 0 ? (
          <View style={[styles.card, styles.empty, cardStyle]}>
            <Text style={[styles.emptyTitle, { color: tokens.txt }]}>No entries found</Text>
            <Text style={[styles.sub, { color: tokens.sub, textAlign: "center" }]}>
              Try a different date range.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, cardStyle]}>
            {groups.map((g) => (
              <View key={g.heading}>
                <Text style={[styles.dayHead, { color: tokens.sub }]}>{g.heading}</Text>
                {g.rows.map((e) => {
                  const credit = e.entryType === "credit";
                  return (
                    <View key={e.id} style={styles.timelineRow}>
                      <View style={styles.rail}>
                        <View style={[styles.dot, { borderColor: credit ? colors.green : colors.dangerDark }]} />
                        <View style={[styles.railLine, { backgroundColor: tokens.cardBorder }]} />
                      </View>
                      <View style={[styles.entry, cardStyle]}>
                        <View style={styles.entryTop}>
                          <Text style={[styles.entryTitle, { color: tokens.txt }]}>{entryTitle(e, byId)}</Text>
                          <Text style={[styles.entryAmt, { color: credit ? colors.greenDark : colors.dangerDark }]}>
                            {credit ? "+ " : "- "}
                            {formatINR(e.amount)}
                          </Text>
                        </View>
                        <View style={styles.entryTop}>
                          <Text style={[styles.meta, { color: tokens.sub }]}>
                            {new Date(e.createdAt).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </Text>
                          <Text style={[styles.meta, { color: tokens.sub }]}>Bal: {formatINR(e.balanceAfter)}</Text>
                        </View>
                        {e.description ? (
                          <Text style={[styles.meta, { color: tokens.txt2, marginTop: 6 }]}>Remarks: {e.description}</Text>
                        ) : null}
                        <View style={styles.tagRow}>
                          <View style={[styles.tag, styles.tagBlue]}>
                            <Text style={styles.tagBlueText}>{REF_LABEL[e.referenceType] ?? e.referenceType.toUpperCase()}</Text>
                          </View>
                          <View style={[styles.tag, styles.tagGreen]}>
                            <Text style={styles.tagGreenText}>SUCCESS</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 14, paddingBottom: 32, gap: 14 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  h1: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 12.5, marginTop: 3 },
  bookIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.blueFlat,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 13,
  },
  btnBlue: { backgroundColor: colors.blueFlat },
  btnBlueText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGreen: { backgroundColor: colors.greenBg, borderWidth: 1, borderColor: `${colors.green}55` },
  btnGreenText: { color: colors.greenDark, fontWeight: "800", fontSize: 15 },
  summary: { flexDirection: "row", gap: 8 },
  sumLabel: { fontSize: 11.5, fontWeight: "600" },
  sumValue: { fontSize: 14, fontWeight: "800", marginTop: 6 },
  empty: { alignItems: "center", paddingVertical: 28 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  dayHead: { fontSize: 12.5, fontWeight: "800", marginBottom: 10, marginTop: 4 },
  timelineRow: { flexDirection: "row", gap: 10 },
  rail: { width: 14, alignItems: "center" },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, backgroundColor: "#fff", marginTop: 16 },
  railLine: { flex: 1, width: 2, marginTop: 2 },
  entry: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  entryTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  entryTitle: { flex: 1, fontSize: 14, fontWeight: "800" },
  entryAmt: { fontSize: 14.5, fontWeight: "800" },
  meta: { fontSize: 11.5, marginTop: 4 },
  tagRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  tagBlue: { backgroundColor: "#EEF2FF", borderColor: "#C7D2FE" },
  tagBlueText: { color: colors.blueFlat, fontSize: 10.5, fontWeight: "800" },
  tagGreen: { backgroundColor: colors.greenBg, borderColor: `${colors.green}55` },
  tagGreenText: { color: colors.greenDark, fontSize: 10.5, fontWeight: "800" },
});
