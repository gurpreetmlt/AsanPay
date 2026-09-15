import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { TELECOM_CIRCLES, type ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { apiError } from "../../utils/apiError";
import { showAlert } from "../../components/AppAlert";
import { useTxnPin } from "../../hooks/useTxnPin";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

type ServiceCode = "MOBILE_PREPAID" | "DTH";

type PlanItem = {
  amount: string;
  title: string;
  description?: string;
  validity?: string;
  category?: string;
};

type MobileInfo = {
  mobile: string;
  operatorSource?: "bestapi" | null;
  operatorCode: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
  plans: PlanItem[];
  offers: PlanItem[];
  plansSource?: "bestapi" | null;
  warnings: string[];
};

const MOBILE_OPS = [
  { code: "JIO", label: "Reliance JIO" },
  { code: "AT", label: "Airtel" },
  { code: "VI", label: "Vi" },
  { code: "BL", label: "BSNL" },
  { code: "JPL", label: "Jio Lite" },
  { code: "TESTOP", label: "TestOperator" },
] as const;

const DTH_OPS = [
  { code: "TTV", label: "Tata Play" },
  { code: "ATV", label: "Airtel Digital TV" },
  { code: "DTV", label: "Dish TV" },
  { code: "STV", label: "Sun Direct" },
  { code: "VTV", label: "d2h" },
] as const;

type Props = {
  serviceCode: ServiceCode;
  onBack: () => void;
};

function groupPlans(items: PlanItem[]): { category: string; items: PlanItem[] }[] {
  const map = new Map<string, PlanItem[]>();
  for (const p of items) {
    const cat = p.category?.trim() || "Packs";
    const list = map.get(cat) ?? [];
    list.push(p);
    map.set(cat, list);
  }
  return [...map.entries()].map(([category, grouped]) => ({ category, items: grouped }));
}

function PlanBlock({
  items,
  tokens,
  selectedAmount,
  onPick,
}: {
  items: PlanItem[];
  tokens: ReturnType<typeof useTheme>["tokens"];
  selectedAmount: string;
  onPick: (amount: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View>
      {groupPlans(items).map((group) => (
        <View key={group.category} style={{ marginBottom: 14 }}>
          <Text
            style={{
              color: tokens.sub,
              fontSize: 11,
              fontWeight: "800",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {group.category}
          </Text>
          {group.items.map((p, i) => {
            const selected = selectedAmount === p.amount;
            return (
              <Pressable
                key={`${group.category}-${p.amount}-${i}`}
                onPress={() => onPick(p.amount)}
                style={[
                  styles.planCard,
                  {
                    borderColor: selected ? colors.blue : tokens.cardBorder,
                    backgroundColor: tokens.card,
                  },
                ]}
              >
                <View
                  style={[
                    styles.planPrice,
                    { backgroundColor: selected ? colors.blue : `${colors.blue}14` },
                  ]}
                >
                  <Text style={{ color: selected ? "rgba(255,255,255,0.8)" : tokens.sub, fontSize: 10, fontWeight: "700" }}>
                    ₹
                  </Text>
                  <Text style={{ color: selected ? "#fff" : colors.blue, fontSize: 18, fontWeight: "800" }}>
                    {p.amount}
                  </Text>
                </View>
                <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12 }}>
                  <View style={styles.planTop}>
                    <Text
                      style={{
                        color: colors.blue,
                        fontSize: 11,
                        fontWeight: "700",
                        backgroundColor: `${colors.blue}12`,
                        overflow: "hidden",
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                      }}
                    >
                      {p.validity ? p.validity : "Tap to select"}
                    </Text>
                    {selected ? (
                      <Text style={{ color: colors.green, fontSize: 11, fontWeight: "800" }}>Selected</Text>
                    ) : null}
                  </View>
                  {p.description ? (
                    <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 6, lineHeight: 16 }} numberOfLines={2}>
                      {p.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function RechargeScreen({ serviceCode, onBack }: Props) {
  const { tokens } = useTheme();
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const ops = serviceCode === "DTH" ? DTH_OPS : MOBILE_OPS;
  const [accountRef, setAccountRef] = useState("");
  const [operatorCode, setOperatorCode] = useState<string>(
    serviceCode === "DTH" ? "TTV" : "JIO",
  );
  const [circleCode, setCircleCode] = useState("");
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [offers, setOffers] = useState<PlanItem[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"plans" | "offers">("plans");
  const [panelBusy, setPanelBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockResubmit, setBlockResubmit] = useState(false);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const attemptKey = useRef(createAttemptKeyHolder("recharge"));
  const lookupSeq = useRef(0);
  const busyRef = useRef(false);
  const apiStartedRef = useRef(false);

  function markNewIntent() {
    attemptKey.current.clear();
    setBlockResubmit(false);
    busyRef.current = false;
    apiStartedRef.current = false;
  }

  const title = useMemo(
    () => (serviceCode === "DTH" ? "DTH recharge" : "Mobile prepaid"),
    [serviceCode],
  );

  const operatorChips = useMemo(() => {
    if (serviceCode !== "MOBILE_PREPAID") return [...ops];
    if (MOBILE_OPS.some((o) => o.code === operatorCode)) return [...MOBILE_OPS];
    return [{ code: operatorCode, label: operatorCode }, ...MOBILE_OPS];
  }, [ops, operatorCode, serviceCode]);

  const circleOptions = useMemo(() => {
    const list = TELECOM_CIRCLES.map((c) => ({ code: c.code, name: c.name }));
    if (circleCode && !list.some((c) => c.code === circleCode)) {
      list.unshift({ code: circleCode, name: circleCode });
    }
    return list;
  }, [circleCode]);

  function catalogBody() {
    return {
      mobile: accountRef.replace(/\D/g, ""),
      operatorCode,
      circleCode,
    };
  }

  async function loadPlans(): Promise<void> {
    const { data } = await api.post<ApiResponse<{ plans: PlanItem[] }>>(
      "/txn/recharge/mobile-plans",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load plans");
    setPlans(data.data?.plans ?? []);
  }

  async function loadOffers(): Promise<void> {
    const { data } = await api.post<ApiResponse<{ offers: PlanItem[] }>>(
      "/txn/recharge/mobile-offers",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load offers");
    setOffers(data.data?.offers ?? []);
  }

  async function openCatalog(tab: "plans" | "offers"): Promise<void> {
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10) {
      showAlert("Mobile number", "Enter a valid 10-digit mobile");
      return;
    }
    if (!operatorCode) {
      showAlert("Operator", "Select an operator");
      return;
    }
    if (!circleCode) {
      showAlert("Circle/State", "Select a circle/state");
      return;
    }
    setPanelTab(tab);
    setPanelOpen(true);
  }

  function switchCatalogTab(tab: "plans" | "offers"): void {
    setPanelTab(tab);
  }

  useEffect(() => {
    if (!panelOpen || serviceCode !== "MOBILE_PREPAID") return;
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10 || !operatorCode || !circleCode) return;
    let cancelled = false;
    setPanelBusy(true);
    void (async () => {
      try {
        if (panelTab === "plans") await loadPlans();
        else await loadOffers();
      } catch (err) {
        if (!cancelled) {
          showAlert(panelTab === "plans" ? "Plans" : "Offers", apiError(err, `Could not load ${panelTab}`));
        }
      } finally {
        if (!cancelled) setPanelBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, panelTab, accountRef, operatorCode, circleCode, serviceCode]);

  useEffect(() => {
    setOperatorCode(serviceCode === "DTH" ? "TTV" : "JIO");
    setPlans([]);
    setOffers([]);
    setCircleCode("");
    setPanelOpen(false);
    setAccountRef("");
    setAmount("");
    markNewIntent();
  }, [serviceCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (serviceCode !== "MOBILE_PREPAID") return;
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10) {
      setPlans([]);
      setOffers([]);
      setCircleCode("");
      return;
    }

    const seq = ++lookupSeq.current;
    const timer = setTimeout(() => {
      void (async () => {
        setLookupBusy(true);
        try {
          const { data } = await api.post<ApiResponse<MobileInfo>>("/txn/recharge/mobile-info", {
            mobile,
          });
          if (seq !== lookupSeq.current) return;
          if (!data.success || !data.data) {
            throw new Error(data.message || "Could not look up this number");
          }
          const info = data.data;
          if (info.operatorCode) setOperatorCode(info.operatorCode);
          if (info.circleCode) setCircleCode(info.circleCode);
          setPlans([]);
          setOffers([]);
        } catch (err) {
          if (seq !== lookupSeq.current) return;
          setPlans([]);
          setOffers([]);
          showAlert("Operator lookup", apiError(err, "Could not detect operator. Select manually."));
        } finally {
          if (seq === lookupSeq.current) setLookupBusy(false);
        }
      })();
    }, 450);

    return () => clearTimeout(timer);
  }, [accountRef, serviceCode]);

  const formReady = useMemo(() => {
    const number = accountRef.replace(/\D/g, "");
    const numberOk =
      serviceCode === "MOBILE_PREPAID" ? number.length === 10 : number.length >= 8;
    const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
    return Boolean(numberOk && operatorCode && amountOk);
  }, [accountRef, amount, operatorCode, serviceCode]);

  const submitDisabled = loading || blockResubmit || !formReady;

  async function onSubmit() {
    if (blockResubmit || !formReady) return;
    if (apiStartedRef.current) return;

    busyRef.current = true;
    apiStartedRef.current = true;
    setLoading(true);
    let stayBlocked = false;

    try {
      const number = accountRef.replace(/\D/g, "");
      if (serviceCode === "MOBILE_PREPAID" && number.length !== 10) {
        showAlert("Mobile number", "Enter a valid 10-digit mobile");
        return;
      }
      if (serviceCode === "DTH" && number.length < 8) {
        showAlert("Subscriber ID", "Enter a valid DTH subscriber number");
        return;
      }
      if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) {
        showAlert("Amount", "Enter a valid recharge amount");
        return;
      }

      const txnAuth = await promptPin();
      const body: Record<string, string> = {
        serviceCode,
        operatorCode,
        accountRef: number,
        amount: amount.trim(),
        idempotencyKey: attemptKey.current.get(),
      };
      if (txnAuth) body.txnAuth = txnAuth;

      const { data } = await api.post<
        ApiResponse<{ txn?: { txnRef?: string; status?: string }; provider?: { message?: string } }>
      >("/txn/recharge", body);

      if (!data.success) throw new Error(data.message || "Recharge failed");
      const status = (data.data?.txn?.status ?? "pending").toLowerCase();
      const ref = data.data?.txn?.txnRef ?? "";
      setLastRef(ref || null);
      setLastStatus(status);
      if (status === "success") {
        attemptKey.current.clear();
        stayBlocked = true;
        setBlockResubmit(true);
        showAlert("Recharge successful", ref ? `Ref: ${ref}` : "Done");
      } else if (status === "failed") {
        setBlockResubmit(false);
        showAlert("Recharge failed", data.data?.provider?.message || data.message || "Failed");
      } else {
        attemptKey.current.clear();
        stayBlocked = true;
        setBlockResubmit(true);
        showAlert(
          "Recharge submitted",
          ref
            ? `Status is pending — do not tap Recharge again. Ref: ${ref}. Check Transactions.`
            : "Status is pending — do not tap Recharge again. Check Transactions.",
        );
      }
    } catch (err) {
      setBlockResubmit(false);
      showAlert("Recharge failed", apiError(err, "Recharge failed"));
    } finally {
      setLoading(false);
      if (stayBlocked) {
        busyRef.current = true;
        apiStartedRef.current = true;
      } else {
        busyRef.current = false;
        apiStartedRef.current = false;
      }
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <ArrowLeft size={22} color={colors.blue} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.txt }]}>{title}</Text>
      </View>
      {serviceCode === "MOBILE_PREPAID" ? (
        <Text style={{ color: tokens.sub, fontSize: 12, paddingHorizontal: 16, marginTop: -4 }}>
          Operator, plans and offers via BestAPI
        </Text>
      ) : null}

      <View style={{ flex: 1, flexDirection: panelOpen ? "row" : "column" }}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        <Text style={[styles.label, { color: tokens.txt }]}>
          {serviceCode === "DTH" ? "Subscriber ID" : "Mobile number"}
        </Text>
        <TextInput
          style={[styles.input, { borderColor: tokens.inputBorder, color: tokens.txt, backgroundColor: tokens.inputBg }]}
          keyboardType="number-pad"
          maxLength={serviceCode === "DTH" ? 20 : 10}
          value={accountRef}
          onChangeText={(t) => {
            markNewIntent();
            setAccountRef(t.replace(/\D/g, ""));
          }}
          placeholder={serviceCode === "DTH" ? "DTH number" : "10-digit mobile"}
          placeholderTextColor={tokens.mute}
        />
        {serviceCode === "MOBILE_PREPAID" && lookupBusy ? (
          <View style={styles.hintRow}>
            <ActivityIndicator size="small" color={colors.blue} />
            <Text style={{ color: tokens.sub, fontSize: 12 }}>Detecting operator and circle…</Text>
          </View>
        ) : null}

        {serviceCode === "MOBILE_PREPAID" ? (
          <>
            <Text style={[styles.label, { color: tokens.txt }]}>Circle/State</Text>
            <View style={styles.opRow}>
              {circleOptions.map((c) => {
                const on = c.code === circleCode;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      markNewIntent();
                      setCircleCode(c.code);
                      setPlans([]);
                      setOffers([]);
                    }}
                    style={[
                      styles.opChip,
                      {
                        borderColor: on ? colors.blue : tokens.cardBorder,
                        backgroundColor: on ? `${colors.blue}14` : tokens.card,
                      },
                    ]}
                  >
                    <Text style={{ color: on ? colors.blue : tokens.txt, fontWeight: "600", fontSize: 13 }}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: tokens.sub, fontSize: 12 }}>
              Auto-filled from the number. Change it anytime — packs reload for the new circle.
            </Text>
          </>
        ) : null}

        <Text style={[styles.label, { color: tokens.txt }]}>Operator</Text>
        <View style={styles.opRow}>
          {operatorChips.map((o) => {
            const on = o.code === operatorCode;
            return (
              <Pressable
                key={o.code}
                onPress={() => {
                  markNewIntent();
                  setOperatorCode(o.code);
                  setPlans([]);
                  setOffers([]);
                }}
                style={[
                  styles.opChip,
                  {
                    borderColor: on ? colors.blue : tokens.cardBorder,
                    backgroundColor: on ? `${colors.blue}14` : tokens.card,
                  },
                ]}
              >
                <Text style={{ color: on ? colors.blue : tokens.txt, fontWeight: "600", fontSize: 13 }}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: tokens.txt }]}>Amount (₹)</Text>
        <TextInput
          style={[styles.input, { borderColor: tokens.inputBorder, color: tokens.txt, backgroundColor: tokens.inputBg }]}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(t) => {
            markNewIntent();
            setAmount(t);
          }}
          placeholder="e.g. 199"
          placeholderTextColor={tokens.mute}
        />

        {serviceCode === "MOBILE_PREPAID" ? (
          <View style={styles.catalogBtnRow}>
            <Pressable
              onPress={() => void openCatalog("plans")}
              style={[styles.catalogBtn, { borderColor: colors.blue }]}
            >
              <Text style={{ color: colors.blue, fontWeight: "700" }}>Plans</Text>
            </Pressable>
            <Pressable
              onPress={() => void openCatalog("offers")}
              style={[styles.catalogBtn, { borderColor: colors.blue }]}
            >
              <Text style={{ color: colors.blue, fontWeight: "700" }}>Offers</Text>
            </Pressable>
          </View>
        ) : null}

        {blockResubmit ? (
          <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 4 }}>
            Do not tap Recharge again while status is pending. Change number, operator, or amount
            for a new recharge.
            {lastRef ? ` Last ref: ${lastRef}` : ""}
            {lastStatus ? ` (${lastStatus})` : ""}
          </Text>
        ) : null}

        {!formReady && !blockResubmit ? (
          <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 4 }}>
            Enter number, operator, and amount to enable Recharge.
          </Text>
        ) : null}

        <Pressable
          onPressIn={() => {
            if (busyRef.current || blockResubmit || loading || apiStartedRef.current || !formReady) {
              return;
            }
            busyRef.current = true;
            setLoading(true);
          }}
          onPress={() => void onSubmit()}
          disabled={submitDisabled}
          style={[
            styles.cta,
            {
              backgroundColor: colors.blue,
              opacity: submitDisabled ? 0.45 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {blockResubmit ? "Submitted — wait for status" : "Recharge"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
      {panelOpen ? (
        <View style={[styles.sidePanel, { backgroundColor: tokens.bg, borderLeftColor: tokens.cardBorder }]}>
            <View style={styles.modalHead}>
              <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 16 }}>Browse packs</Text>
              <Pressable onPress={() => setPanelOpen(false)} hitSlop={12}>
                <Text style={{ color: colors.blue, fontWeight: "700" }}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.catalogBtnRow}>
              <Pressable
                onPress={() => switchCatalogTab("plans")}
                style={[
                  styles.catalogBtn,
                  {
                    borderColor: colors.blue,
                    backgroundColor: panelTab === "plans" ? colors.blue : "transparent",
                  },
                ]}
              >
                <Text style={{ color: panelTab === "plans" ? "#fff" : colors.blue, fontWeight: "700" }}>Plans</Text>
              </Pressable>
              <Pressable
                onPress={() => switchCatalogTab("offers")}
                style={[
                  styles.catalogBtn,
                  {
                    borderColor: colors.blue,
                    backgroundColor: panelTab === "offers" ? colors.blue : "transparent",
                  },
                ]}
              >
                <Text style={{ color: panelTab === "offers" ? "#fff" : colors.blue, fontWeight: "700" }}>Offers</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {panelBusy ? (
                <ActivityIndicator color={colors.blue} />
              ) : (
                <PlanBlock
                  items={panelTab === "plans" ? plans : offers}
                  tokens={tokens}
                  selectedAmount={amount}
                  onPick={(a) => {
                    markNewIntent();
                    setAmount(a);
                  }}
                />
              )}
              {!panelBusy && (panelTab === "plans" ? plans : offers).length === 0 ? (
                <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 8 }}>
                  No {panelTab} for this operator and circle. Enter amount manually.
                </Text>
              ) : null}
            </ScrollView>
        </View>
      ) : null}
      </View>
      <TxnPinPrompt />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: "700" },
  body: { padding: 16, paddingBottom: 40, gap: 8 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  opRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  opChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planCard: { borderWidth: 1, borderRadius: 16, marginTop: 8, flexDirection: "row", overflow: "hidden" },
  planPrice: { width: 76, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  catalogBtnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  catalogBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  sidePanel: { width: "62%", maxWidth: 380, height: "100%", padding: 12, borderLeftWidth: 1 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cta: { marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
