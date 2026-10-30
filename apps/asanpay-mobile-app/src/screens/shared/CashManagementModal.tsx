import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { WebView, type WebViewNavigation, type WebViewProps } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Building2, CirclePlay, Download, RefreshCw, Wallet } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api, fetchApi } from "../../lib/api";
import { formatINR } from "../../lib/format";
import { showAlert } from "../../components/AppAlert";
import { DateRangeFields, toYmd } from "../../components/DateRangeCard";
import { apiError } from "../../utils/apiError";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";

// react-native-webview is hoisted to the repo root and type-checks against the web portal's React 19 types.
const CmsWebView = WebView as unknown as React.ComponentType<WebViewProps & React.RefAttributes<WebView>>;

type CmsProvider = { code: string; name: string; description: string; accent: string; live?: boolean };
type CmsStatus = "initiated" | "pending" | "success" | "failed";
type CmsTxn = {
  id: string;
  provider: string;
  providerName: string;
  transactionId: string;
  status: CmsStatus;
  amount: string | null;
  utr: string | null;
  billerName: string | null;
  createdAt: string;
};
type OpenCms = { url: string; transactionId: string; providerName: string };

/** Hosts (and their subdomains) the CMS WebView may load besides the provider page it was opened with. */
const CMS_EXTRA_HOSTS = ["asanpay.in"];

function hostOf(url: string): string | null {
  const m = /^https:\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

function isAllowedCmsUrl(url: string, startUrl: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const allowed = [hostOf(startUrl), ...CMS_EXTRA_HOSTS].filter((h): h is string => Boolean(h));
  return allowed.some((h) => host === h || host.endsWith(`.${h}`));
}

const STATUS_LABEL: Record<CmsStatus, string> = {
  initiated: "Initiated",
  pending: "Pending",
  success: "Success",
  failed: "Failed",
};

const STATUS_COLORS: Record<CmsStatus, { bg: string; fg: string }> = {
  success: { bg: "#ecfdf3", fg: "#047857" },
  pending: { bg: "#fffbeb", fg: "#92400e" },
  initiated: { bg: "#f1f5f9", fg: "#475569" },
  failed: { bg: "#fef2f2", fg: "#b91c1c" },
};

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CashManagementModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [providers, setProviders] = useState<CmsProvider[]>([]);
  const [startingCode, setStartingCode] = useState("");
  const [openCms, setOpenCms] = useState<OpenCms | null>(null);
  const [range, setRange] = useState(() => ({ from: toYmd(new Date()), to: toYmd(new Date()) }));
  const [rows, setRows] = useState<CmsTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState("");

  const loadRows = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      setRows((await fetchApi<CmsTxn[]>("/noble/cms/transactions", { from, to })) ?? []);
    } catch (err) {
      showAlert("Could not load transactions", apiError(err, "Could not load cash collection transactions. Try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const today = toYmd(new Date());
    setRange({ from: today, to: today });
    fetchApi<CmsProvider[]>("/noble/cms/providers")
      .then((p) => setProviders(p ?? []))
      .catch((err) =>
        showAlert("Could not load providers", apiError(err, "Could not load cash collection providers. Try again.")),
      );
    void loadRows(today, today);
  }, [visible, loadRows]);

  async function initiate(p: CmsProvider) {
    if (startingCode) return;
    if (p.live === false) {
      showAlert("Coming soon", `${p.name} is coming soon. It is not available yet.`);
      return;
    }
    setStartingCode(p.code);
    try {
      const { data } = await api.post<ApiResponse<CmsTxn & { redirectionUrl: string }>>("/noble/cms/start", {
        provider: p.code,
      });
      if (!data.success) throw new Error(data.message);
      setCanGoBack(false);
      setOpenCms({ url: data.data.redirectionUrl, transactionId: data.data.transactionId, providerName: p.name });
    } catch (err) {
      showAlert(`${p.name} not started`, apiError(err, `Could not start ${p.name}. Try again.`));
    } finally {
      setStartingCode("");
    }
  }

  async function checkStatus(transactionId: string, quiet = false) {
    setCheckingId(transactionId);
    try {
      const { data } = await api.post<ApiResponse<CmsTxn>>("/noble/cms/status", { transactionId });
      if (!data.success) throw new Error(data.message);
      setRows((prev) =>
        prev.some((r) => r.transactionId === transactionId)
          ? prev.map((r) => (r.transactionId === transactionId ? data.data : r))
          : [data.data, ...prev],
      );
      if (!quiet) showAlert("Cash collection status", `Status: ${STATUS_LABEL[data.data.status]}`);
    } catch (err) {
      if (!quiet) showAlert("Status check failed", apiError(err, "Could not fetch the cash collection status. Try again."));
    } finally {
      setCheckingId("");
    }
  }

  function closeCms() {
    const tid = openCms?.transactionId;
    setOpenCms(null);
    if (!tid) return;
    const today = toYmd(new Date());
    setRange({ from: today, to: today });
    void loadRows(today, today).then(() => checkStatus(tid, true));
  }

  function handleBack() {
    if (openCms) {
      if (canGoBack) webRef.current?.goBack();
      else closeCms();
      return;
    }
    onClose();
  }

  function onShouldStart(req: { url: string; isTopFrame?: boolean }): boolean {
    if (req.url.startsWith("about:")) return true;
    if (req.isTopFrame === false && /^https:/i.test(req.url)) return true;
    if (openCms && isAllowedCmsUrl(req.url, openCms.url)) return true;
    void Linking.openURL(req.url).catch(() => undefined);
    return false;
  }

  function csvBody(): string {
    const header = "Date / Time,Provider,Txn ID,Company,Amount,Status,UTR";
    const lines = rows.map((r) =>
      [formatAt(r.createdAt), r.providerName, r.transactionId, r.billerName ?? "", r.amount ?? "", STATUS_LABEL[r.status], r.utr ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    return [header, ...lines].join("\n");
  }

  function openExportMenu() {
    if (rows.length === 0) {
      showAlert("Nothing to export", "No cash collections in this date range");
      return;
    }
    const title = `AsanPay Cash Collections ${range.from} to ${range.to}`;
    showAlert("Export", "Choose PDF, Excel, or CSV", [
      {
        text: "PDF",
        style: "primary",
        onPress: () => {
          void Share.share({
            title,
            message: `${title}\n\n${rows
              .map(
                (r) =>
                  `${formatAt(r.createdAt)} · ${r.providerName}\n  ${r.transactionId} · ${
                    r.amount ? formatINR(r.amount) : "—"
                  } · ${STATUS_LABEL[r.status]}${r.utr ? ` · UTR ${r.utr}` : ""}`,
              )
              .join("\n\n")}\n\n— AsanPay`,
          });
        },
      },
      {
        text: "Excel",
        onPress: () => void Share.share({ title: `${title}.xls`, message: csvBody().replace(/,/g, "\t") }),
      },
      {
        text: "CSV",
        onPress: () => void Share.share({ title: `${title}.csv`, message: csvBody() }),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const successTotal = rows
    .filter((r) => r.status === "success")
    .reduce((sum, r) => sum + (parseFloat(r.amount ?? "0") || 0), 0);
  const openCount = rows.filter((r) => r.status === "initiated" || r.status === "pending").length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleBack}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={[styles.root, { backgroundColor: tokens.bg }]}>
        <LinearGradient
          colors={[...colors.gradient]}
          start={gradientDirection.diagonal.start}
          end={gradientDirection.diagonal.end}
          style={[styles.header, { paddingTop: insets.top + 8 }]}
        >
          <Pressable onPress={handleBack} hitSlop={12} style={styles.headerBtn} accessibilityLabel="Back">
            <ArrowLeft size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {openCms ? openCms.providerName : "Cash Management"}
          </Text>
          <Pressable
            onPress={() => (openCms ? webRef.current?.reload() : void loadRows(range.from, range.to))}
            hitSlop={12}
            style={styles.headerBtn}
            accessibilityLabel="Refresh"
          >
            <RefreshCw size={20} color={colors.white} />
          </Pressable>
        </LinearGradient>

        {openCms ? (
          <CmsWebView
            ref={webRef}
            source={{ uri: openCms.url }}
            style={styles.web}
            javaScriptEnabled
            domStorageEnabled
            geolocationEnabled
            setSupportMultipleWindows={false}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webLoading}>
                <ActivityIndicator size="large" color={colors.blueFlat} />
              </View>
            )}
            onNavigationStateChange={(nav: WebViewNavigation) => setCanGoBack(nav.canGoBack)}
            onShouldStartLoadWithRequest={onShouldStart}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.statRow}>
              {[
                { label: "Collections", value: String(rows.length), tone: colors.blueLight },
                { label: "Successful", value: formatINR(successTotal), tone: colors.green },
                { label: "In progress", value: String(openCount), tone: "#D97706" },
              ].map((s) => (
                <View key={s.label} style={[styles.stat, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                  <View style={[styles.statBar, { backgroundColor: s.tone }]} />
                  <Text style={[styles.statLabel, { color: tokens.sub }]}>{s.label}</Text>
                  <Text style={[styles.statValue, { color: tokens.txt }]} numberOfLines={1} adjustsFontSizeToFit>
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: tokens.mute }]}>PROVIDERS</Text>
            {providers.map((p) => (
              <LinearGradient
                key={p.code}
                colors={[p.accent, `${p.accent}c7`]}
                start={gradientDirection.diagonal.start}
                end={gradientDirection.diagonal.end}
                style={styles.providerCard}
              >
                <View style={styles.circleBig} pointerEvents="none" />
                <View style={styles.circleSmall} pointerEvents="none" />
                <View style={styles.providerIcon}>
                  <Building2 size={26} color={p.accent} />
                </View>
                <View style={styles.providerText}>
                  <View style={styles.nameRow}>
                    <Text style={styles.providerName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View style={styles.liveChip}>
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.providerDesc} numberOfLines={2}>
                    {p.description}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void initiate(p)}
                  disabled={!!startingCode}
                  style={[styles.initiateBtn, { opacity: startingCode && startingCode !== p.code ? 0.6 : 1 }]}
                >
                  {startingCode === p.code ? (
                    <ActivityIndicator size="small" color={p.accent} />
                  ) : (
                    <CirclePlay size={18} color={p.accent} />
                  )}
                  <Text style={[styles.initiateText, { color: p.accent }]}>
                    {p.live === false ? "Coming soon" : "Initiate"}
                  </Text>
                </Pressable>
              </LinearGradient>
            ))}
            {providers.length === 0 ? (
              <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                <Text style={{ color: tokens.sub }}>Loading providers…</Text>
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: tokens.txt }]}>CMS Transactions</Text>
                  <Text style={[styles.cardSub, { color: tokens.sub }]}>
                    {rows.length} transaction{rows.length === 1 ? "" : "s"} · {formatINR(successTotal)} successful
                  </Text>
                </View>
                <Pressable onPress={openExportMenu} hitSlop={8} style={[styles.exportBtn, { borderColor: tokens.cardBorder }]}>
                  <Download size={15} color={colors.blueFlat} />
                  <Text style={styles.exportText}>Export</Text>
                </Pressable>
              </View>

              <DateRangeFields
                from={range.from}
                to={range.to}
                onChange={(r) => {
                  setRange(r);
                  void loadRows(r.from, r.to);
                }}
              />
              <Pressable
                onPress={() => void loadRows(range.from, range.to)}
                disabled={loading}
                style={[styles.fetchBtn, { opacity: loading ? 0.6 : 1 }]}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.fetchText}>Fetch Data</Text>}
              </Pressable>

              {rows.map((r) => (
                <View key={r.id} style={[styles.row, { borderColor: tokens.cardBorder }]}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowAmount, { color: tokens.txt }]}>
                      {r.amount ? formatINR(r.amount) : "—"}
                    </Text>
                    <View style={[styles.pill, { backgroundColor: STATUS_COLORS[r.status].bg }]}>
                      <View style={[styles.pillDot, { backgroundColor: STATUS_COLORS[r.status].fg }]} />
                      <Text style={[styles.pillText, { color: STATUS_COLORS[r.status].fg }]}>
                        {STATUS_LABEL[r.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.rowMeta, { color: tokens.sub }]} numberOfLines={1}>
                    {r.providerName}
                    {r.billerName ? ` · ${r.billerName}` : ""}
                  </Text>
                  <Text style={[styles.rowMeta, { color: tokens.mute }]} numberOfLines={1}>
                    {formatAt(r.createdAt)} · {r.transactionId}
                    {r.utr ? ` · UTR ${r.utr}` : ""}
                  </Text>
                  {r.status === "initiated" || r.status === "pending" ? (
                    <Pressable
                      onPress={() => void checkStatus(r.transactionId)}
                      disabled={checkingId === r.transactionId}
                      style={[styles.checkBtn, { borderColor: tokens.cardBorder }]}
                    >
                      {checkingId === r.transactionId ? (
                        <ActivityIndicator size="small" color={colors.blueFlat} />
                      ) : (
                        <Text style={styles.checkText}>Check status</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              ))}

              {!loading && rows.length === 0 ? (
                <View style={styles.empty}>
                  <Wallet size={22} color={colors.blueFlat} />
                  <Text style={[styles.emptyTitle, { color: tokens.txt }]}>No cash collections in this date range</Text>
                  <Text style={[styles.cardSub, { color: tokens.sub, textAlign: "center" }]}>
                    Change the dates and tap Fetch Data, or start one above.
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        )}

        <View style={{ height: insets.bottom, backgroundColor: colors.blue }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: colors.white, fontSize: 18, fontWeight: "800" },
  web: { flex: 1 },
  webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, gap: 14 },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 12, overflow: "hidden" },
  statBar: { position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3 },
  statLabel: { fontSize: 11, fontWeight: "700" },
  statValue: { fontSize: 17, fontWeight: "800", marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 4, marginBottom: -4 },
  circleBig: {
    position: "absolute",
    right: -30,
    top: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  circleSmall: {
    position: "absolute",
    right: 70,
    bottom: -45,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveChip: { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  liveText: { color: colors.white, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  providerCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 16,
    gap: 12,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  providerIcon: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  providerText: { flex: 1 },
  providerName: { color: colors.white, fontSize: 17, fontWeight: "800" },
  providerDesc: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 3 },
  initiateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  initiateText: { fontSize: 15, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: "800" },
  cardSub: { fontSize: 12, marginTop: 2 },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  exportText: { color: colors.blueFlat, fontWeight: "700", fontSize: 13 },
  fetchBtn: {
    backgroundColor: colors.blueFlat,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  fetchText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  row: { borderTopWidth: 1, paddingTop: 12, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowAmount: { fontSize: 16, fontWeight: "800" },
  rowMeta: { fontSize: 12 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "800" },
  checkBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 110,
    alignItems: "center",
  },
  checkText: { color: colors.blueFlat, fontWeight: "700", fontSize: 13 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 18 },
  emptyTitle: { fontSize: 14, fontWeight: "700", textAlign: "center" },
});
