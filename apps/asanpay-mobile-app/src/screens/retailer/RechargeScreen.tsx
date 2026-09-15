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
import type { ApiResponse } from "@asanpay/shared-types";
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
  operatorCode: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
  plans: PlanItem[];
  offers: PlanItem[];
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

function PlanBlock({
  title,
  items,
  tokens,
  onPick,
}: {
  title: string;
  items: PlanItem[];
  tokens: ReturnType<typeof useTheme>["tokens"];
  onPick: (amount: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={[styles.label, { color: tokens.txt }]}>{title}</Text>
      {items.map((p, i) => (
        <Pressable
          key={`${p.amount}-${p.title}-${i}`}
          onPress={() => onPick(p.amount)}
          style={[styles.planCard, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
        >
          <View style={styles.planTop}>
            <Text style={{ color: colors.blue, fontWeight: "800", fontSize: 15 }}>₹{p.amount}</Text>
            <Text style={{ color: tokens.sub, fontSize: 11, fontWeight: "600" }}>
              {p.validity ? `Validity ${p.validity}` : p.category ?? "Tap to select"}
            </Text>
          </View>
          <Text style={{ color: tokens.txt, fontWeight: "700", fontSize: 13, marginTop: 2 }}>{p.title}</Text>
          {p.description ? (
            <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 2 }}>{p.description}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function RechargeScreen({ serviceCode, onBack }: Props) {
  const { tokens } = useTheme();
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const ops = serviceCode === "DTH" ? DTH_OPS : MOBILE_OPS;
  const [accountRef, setAccountRef] = useState("");
  const [operatorCode, setOperatorCode] = useState(ops[0]!.code);
  const [circleHint, setCircleHint] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [offers, setOffers] = useState<PlanItem[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockResubmit, setBlockResubmit] = useState(false);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const attemptKey = useRef(createAttemptKeyHolder("recharge"));
  const lookupSeq = useRef(0);
  const submitLockRef = useRef(false);

  function markNewIntent() {
    attemptKey.current.clear();
    setBlockResubmit(false);
    submitLockRef.current = false;
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

  useEffect(() => {
    setOperatorCode(ops[0]!.code);
    setPlans([]);
    setOffers([]);
    setCircleHint(null);
    markNewIntent();
  }, [serviceCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (serviceCode !== "MOBILE_PREPAID") return;
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10) {
      setPlans([]);
      setOffers([]);
      setCircleHint(null);
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
          setCircleHint(
            [info.circleName, info.circleCode].filter(Boolean).join(" · ") ||
              info.operatorName ||
              null,
          );
          setOffers(info.offers ?? []);
          setPlans(info.plans ?? []);
          if (info.warnings?.length) {
            const note = info.warnings
              .filter(
                (w) =>
                  !w.startsWith("Operator detected via") &&
                  !w.startsWith("Plans loaded via") &&
                  !w.startsWith("Offers loaded via") &&
                  !w.startsWith("BestAPI plans empty"),
              )
              .join("\n");
            if (note) showAlert("Plans note", note);
          }
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

  async function onSubmit() {
    if (submitLockRef.current || blockResubmit || loading) return;
    submitLockRef.current = true;
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
      submitLockRef.current = stayBlocked;
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

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
            <Text style={{ color: tokens.sub, fontSize: 12 }}>Detecting operator and plans…</Text>
          </View>
        ) : null}
        {serviceCode === "MOBILE_PREPAID" && circleHint && !lookupBusy ? (
          <Text style={{ color: tokens.sub, fontSize: 12 }}>{circleHint}</Text>
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

        {serviceCode === "MOBILE_PREPAID" ? (
          <>
            <PlanBlock
              title="Special offers"
              items={offers}
              tokens={tokens}
              onPick={(a) => {
                markNewIntent();
                setAmount(a);
              }}
            />
            <PlanBlock
              title="Plans"
              items={plans}
              tokens={tokens}
              onPick={(a) => {
                markNewIntent();
                setAmount(a);
              }}
            />
            {!lookupBusy &&
            accountRef.replace(/\D/g, "").length === 10 &&
            plans.length === 0 &&
            offers.length === 0 ? (
              <Text style={{ color: tokens.sub, fontSize: 12 }}>
                No plans/offers for this number yet. Enter amount manually.
              </Text>
            ) : null}
          </>
        ) : null}

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

        {blockResubmit ? (
          <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 4 }}>
            Do not tap Recharge again while status is pending. Change number, operator, or amount
            for a new recharge.
            {lastRef ? ` Last ref: ${lastRef}` : ""}
            {lastStatus ? ` (${lastStatus})` : ""}
          </Text>
        ) : null}

        <Pressable
          onPress={() => void onSubmit()}
          disabled={loading || blockResubmit}
          style={[
            styles.cta,
            {
              backgroundColor: colors.blue,
              opacity: loading || blockResubmit ? 0.7 : 1,
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
  planCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  cta: { marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
