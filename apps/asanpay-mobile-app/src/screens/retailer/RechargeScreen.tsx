import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  type ImageSourcePropType,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Lock,
  MapPin,
  Smartphone,
  Wallet,
  X,
} from "lucide-react-native";
import {
  TELECOM_CIRCLES,
  classifyRechargePlanTab,
  formatDthSubscriberInfo,
  RECHARGE_PLAN_TAB_LABELS,
  RECHARGE_PLAN_TAB_ORDER,
  type ApiResponse,
  type RechargePlanTabId,
} from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { apiError } from "../../utils/apiError";
import { showAlert } from "../../components/AppAlert";
import { PopupCloseButton } from "../../components/PopupCloseButton";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { formatEarnEstimateLine, useEarnEstimate } from "../../hooks/useEarnEstimate";

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

type OperatorDef = {
  code: string;
  label: string;
  color: string;
  mark: string;
  logo?: ImageSourcePropType;
};

const MOBILE_OPS: OperatorDef[] = [
  {
    code: "AT",
    label: "Airtel",
    color: "#ED1C24",
    mark: "Airtel",
    logo: require("../../assets/operator-logos/airtel.png"),
  },
  {
    code: "BL",
    label: "BSNL",
    color: "#F5A623",
    mark: "BSNL",
    logo: require("../../assets/operator-logos/bsnl.png"),
  },
  {
    code: "JIO",
    label: "Jio",
    color: "#0A2885",
    mark: "Jio",
    logo: require("../../assets/operator-logos/jio.png"),
  },
  {
    code: "VI",
    label: "Vi",
    color: "#EE3124",
    mark: "Vi",
    logo: require("../../assets/operator-logos/vi.png"),
  },
];

const DTH_OPS: OperatorDef[] = [
  {
    code: "ATV",
    label: "Airtel TV",
    color: "#ED1C24",
    mark: "ATV",
    logo: require("../../assets/operator-logos/dth/airtel-tv.png"),
  },
  {
    code: "TTV",
    label: "Tata Play",
    color: "#000000",
    mark: "Tata",
    logo: require("../../assets/operator-logos/dth/tata-play.png"),
  },
  {
    code: "STV",
    label: "Sun TV",
    color: "#F5A623",
    mark: "Sun",
    logo: require("../../assets/operator-logos/dth/sun-tv.png"),
  },
  {
    code: "DTV",
    label: "Dish TV",
    color: "#E31837",
    mark: "Dish",
    logo: require("../../assets/operator-logos/dth/dish-tv.png"),
  },
  {
    code: "VTV",
    label: "Videocon d2h",
    color: "#00A651",
    mark: "d2h",
    logo: require("../../assets/operator-logos/dth/videocon-d2h.png"),
  },
];

type Props = {
  serviceCode: ServiceCode;
  onBack: () => void;
};

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

const PLAN_PAGE_SIZE = 5;
const FLIP_MS = 420;

function groupPlansByTab(items: PlanItem[]): { id: RechargePlanTabId; label: string; items: PlanItem[] }[] {
  const map = new Map<RechargePlanTabId, PlanItem[]>();
  for (const p of items) {
    const id = classifyRechargePlanTab(p);
    const list = map.get(id) ?? [];
    list.push(p);
    map.set(id, list);
  }
  return RECHARGE_PLAN_TAB_ORDER.filter((id) => (map.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    label: RECHARGE_PLAN_TAB_LABELS[id],
    items: map.get(id)!,
  }));
}

function OperatorLogo({ op, size = 56 }: { op: OperatorDef; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {op.logo ? (
        <Image
          source={op.logo}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      ) : (
        <Text
          numberOfLines={1}
          style={{
            color: op.color,
            fontWeight: "900",
            fontSize: size > 48 ? 13 : 11,
            letterSpacing: -0.2,
          }}
        >
          {op.mark}
        </Text>
      )}
    </View>
  );
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
  const groups = useMemo(() => groupPlansByTab(items), [items]);
  const [tab, setTab] = useState<RechargePlanTabId>(groups[0]?.id ?? "popular");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!groups.some((g) => g.id === tab)) {
      setTab(groups[0]?.id ?? "popular");
      setShowAll(false);
    }
  }, [groups, tab]);

  if (items.length === 0) return null;
  const active = groups.find((g) => g.id === tab) ?? groups[0];
  if (!active) return null;
  const visible = showAll ? active.items : active.items.slice(0, PLAN_PAGE_SIZE);

  return (
    <View style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {groups.map((g) => {
          const on = g.id === active.id;
          return (
            <Pressable
              key={g.id}
              onPress={() => {
                setTab(g.id);
                setShowAll(false);
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: on ? colors.blue : "#EEF1F6",
                  borderColor: on ? colors.blue : "#EEF1F6",
                },
              ]}
            >
              <Text style={{ color: on ? "#fff" : "#334155", fontWeight: "700", fontSize: 12 }}>
                {g.label}
                <Text style={{ opacity: 0.7 }}> ({g.items.length})</Text>
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {visible.map((p, i) => {
        const selected = selectedAmount === p.amount;
        const validityLabel = p.validity
          ? p.validity.replace(/days?/i, "").trim() || p.validity
          : "—";
        return (
          <Pressable
            key={`${active.id}-${p.amount}-${i}`}
            onPress={() => onPick(p.amount)}
            style={[
              styles.planCardWeb,
              {
                borderColor: selected ? colors.blue : tokens.cardBorder,
                backgroundColor: tokens.card,
              },
            ]}
          >
            <View style={styles.planCardHead}>
              <Text style={{ color: tokens.txt, fontSize: 18, fontWeight: "800" }}>Rs. {p.amount}</Text>
              <View style={styles.planValidityPill}>
                <Clock3 size={11} color={colors.blue} strokeWidth={2.4} />
                <Text style={{ color: colors.blue, fontSize: 11, fontWeight: "700" }}>{validityLabel}</Text>
              </View>
            </View>
            <Text style={{ color: tokens.sub, fontSize: 12, lineHeight: 17, marginTop: 8, minHeight: 34 }} numberOfLines={3}>
              {p.description || p.title || "Plan details"}
            </Text>
            <View
              style={[
                styles.planSelectBtn,
                {
                  borderColor: colors.blue,
                  backgroundColor: selected ? "#EEF3FF" : "#fff",
                },
              ]}
            >
              <Check size={14} color={colors.blue} strokeWidth={2.8} />
              <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "800" }}>
                {selected ? "Selected" : "Select Plan"}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {active.items.length > PLAN_PAGE_SIZE ? (
        <Pressable onPress={() => setShowAll((v) => !v)} style={{ paddingVertical: 8, alignItems: "center" }}>
          <Text style={{ color: colors.blue, fontWeight: "700", fontSize: 13 }}>
            {showAll ? "Show less" : `See more (${active.items.length - PLAN_PAGE_SIZE})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  tokens,
  icon,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  tokens: ReturnType<typeof useTheme>["tokens"];
  icon?: React.ReactNode;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      <Text style={[styles.label, { color: tokens.txt }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.select,
          { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg },
        ]}
      >
        {icon}
        <Text style={{ color: selected ? tokens.txt : tokens.mute, fontSize: 15, flex: 1 }}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={tokens.sub} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.selectModalRoot}>
          <Pressable style={styles.selectScrim} onPress={() => setOpen(false)} />
          <View style={[styles.selectSheet, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 16, marginBottom: 8 }}>{label}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={[
                      styles.selectOption,
                      { backgroundColor: on ? `${colors.blue}14` : "transparent" },
                    ]}
                  >
                    <Text style={{ color: on ? colors.blue : tokens.txt, fontWeight: on ? "700" : "500" }}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function RechargeScreen({ serviceCode, onBack }: Props) {
  const { tokens } = useTheme();
  const ops = serviceCode === "DTH" ? DTH_OPS : MOBILE_OPS;
  const [operatorPicked, setOperatorPicked] = useState(false);
  const [accountRef, setAccountRef] = useState("");
  const [operatorCode, setOperatorCode] = useState("");
  const [circleCode, setCircleCode] = useState("");
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [offers, setOffers] = useState<PlanItem[]>([]);
  const [dthSummary, setDthSummary] = useState<{ label: string; value: string }[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"plans" | "offers">("plans");
  const [panelBusy, setPanelBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const earnEstimate = useEarnEstimate(serviceCode, amount);
  const earnLine = formatEarnEstimateLine(earnEstimate);
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockResubmit, setBlockResubmit] = useState(false);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const attemptKey = useRef(createAttemptKeyHolder("recharge"));
  const lookupSeq = useRef(0);
  const busyRef = useRef(false);
  const apiStartedRef = useRef(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const flippingRef = useRef(false);

  function markNewIntent() {
    attemptKey.current.clear();
    setBlockResubmit(false);
    busyRef.current = false;
    apiStartedRef.current = false;
  }

  const title = useMemo(
    () => (serviceCode === "DTH" ? "DTH Recharge" : "Mobile Recharge"),
    [serviceCode],
  );
  const subtitle = useMemo(
    () => (serviceCode === "DTH" ? "Instant DTH top-up" : "Instant prepaid top-up"),
    [serviceCode],
  );

  const selectedOp = useMemo(
    () => ops.find((o) => o.code === operatorCode) ?? null,
    [ops, operatorCode],
  );

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
    if (serviceCode === "DTH") {
      const { data } = await api.post<ApiResponse<{ plans: PlanItem[] }>>("/txn/recharge/dth-plans", {
        operatorCode,
      });
      if (!data.success) throw new Error(data.message || "Could not load DTH plans");
      setPlans(data.data?.plans ?? []);
      return;
    }
    const { data } = await api.post<ApiResponse<{ plans: PlanItem[] }>>(
      "/txn/recharge/mobile-plans",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load plans");
    setPlans(data.data?.plans ?? []);
  }

  async function loadOffers(): Promise<void> {
    if (serviceCode === "DTH") {
      const number = accountRef.replace(/\s+/g, "").trim();
      const { data } = await api.post<
        ApiResponse<{ plans: PlanItem[]; summary: { label: string; value: string }[] }>
      >("/txn/recharge/dth-info", { operatorCode, number });
      if (!data.success) throw new Error(data.message || "Could not load DTH info");
      setOffers(data.data?.plans ?? []);
      setDthSummary(data.data?.summary ?? []);
      return;
    }
    const { data } = await api.post<ApiResponse<{ offers: PlanItem[] }>>(
      "/txn/recharge/mobile-offers",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load offers");
    setOffers(data.data?.offers ?? []);
  }

  async function openCatalog(tab: "plans" | "offers"): Promise<void> {
    if (serviceCode === "DTH") {
      if (!operatorCode) {
        showAlert("Operator", "Select an operator");
        return;
      }
      if (tab === "offers") {
        const number = accountRef.replace(/\s+/g, "").trim();
        if (number.length < 8) {
          showAlert("Subscriber ID", "Enter a valid DTH subscriber number");
          return;
        }
      }
      setPanelTab(tab);
      animateLayout();
      setPanelOpen(true);
      return;
    }
    if (!operatorCode) {
      showAlert("Operator", "Select an operator");
      return;
    }
    if (tab === "offers" && operatorCode === "JIO") {
      return;
    }
    if (!circleCode) {
      showAlert("Telecom Circle", "Select a circle/state");
      return;
    }
    if (tab === "offers") {
      const mobile = accountRef.replace(/\D/g, "");
      if (mobile.length !== 10) {
        showAlert("Mobile number", "Enter a valid 10-digit mobile");
        return;
      }
    }
    setPanelTab(tab);
    animateLayout();
    setPanelOpen(true);
  }

  function runFlip(toForm: boolean) {
    if (flippingRef.current) return;
    flippingRef.current = true;
    if (toForm) {
      Animated.timing(flipAnim, {
        toValue: 0.5,
        duration: FLIP_MS / 2,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setOperatorPicked(true);
        Animated.timing(flipAnim, {
          toValue: 1,
          duration: FLIP_MS / 2,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          flippingRef.current = false;
        });
      });
      return;
    }
    Animated.timing(flipAnim, {
      toValue: 0.5,
      duration: FLIP_MS / 2,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setOperatorPicked(false);
      setPanelOpen(false);
      setPlans([]);
      setOffers([]);
      setDthSummary([]);
      Animated.timing(flipAnim, {
        toValue: 0,
        duration: FLIP_MS / 2,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        flippingRef.current = false;
      });
    });
  }

  function selectOperator(code: string) {
    markNewIntent();
    setOperatorCode(code);
    setPlans([]);
    setOffers([]);
    setDthSummary([]);
    setAmount("");
    setTxnPin("");
    runFlip(true);
  }

  function clearOperator() {
    markNewIntent();
    setOperatorCode("");
    setAccountRef("");
    setCircleCode("");
    setAmount("");
    setTxnPin("");
    runFlip(false);
  }

  useEffect(() => {
    if (!panelOpen) return;
    if (serviceCode === "MOBILE_PREPAID") {
      if (!operatorCode || !circleCode) return;
      if (panelTab === "offers") {
        const mobile = accountRef.replace(/\D/g, "");
        if (mobile.length !== 10) return;
      }
    } else if (serviceCode === "DTH") {
      if (!operatorCode) return;
      if (panelTab === "offers") {
        const number = accountRef.replace(/\s+/g, "").trim();
        if (number.length < 8) return;
      }
    } else {
      return;
    }
    let cancelled = false;
    setPanelBusy(true);
    void (async () => {
      try {
        if (panelTab === "plans") await loadPlans();
        else await loadOffers();
      } catch (err) {
        if (!cancelled) {
          showAlert(
            panelTab === "plans" ? "Plans" : serviceCode === "DTH" ? "Info" : "Offers",
            apiError(err, `Could not load ${panelTab}`),
          );
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
    flipAnim.setValue(0);
    setOperatorPicked(false);
    setOperatorCode("");
    setPlans([]);
    setOffers([]);
    setDthSummary([]);
    setCircleCode("");
    setPanelOpen(false);
    setAccountRef("");
    setAmount("");
    markNewIntent();
  }, [serviceCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (serviceCode !== "MOBILE_PREPAID" || !operatorPicked) return;
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10) {
      setPlans([]);
      setOffers([]);
      return;
    }
    // Operator already chosen from logos — lookup is only for auto-filling circle.
    // If circle is already set, skip. On failure, stay silent (no "select operator" alerts).
    if (circleCode) return;

    const seq = ++lookupSeq.current;
    const timer = setTimeout(() => {
      void (async () => {
        setLookupBusy(true);
        try {
          const { data } = await api.post<ApiResponse<MobileInfo>>("/txn/recharge/mobile-info", {
            mobile,
          });
          if (seq !== lookupSeq.current) return;
          if (!data.success || !data.data) return;
          const info = data.data;
          if (info.circleCode) setCircleCode(info.circleCode);
          setPlans([]);
          setOffers([]);
        } catch {
          // Operator is already selected — ignore BestAPI operator-detect errors.
        } finally {
          if (seq === lookupSeq.current) setLookupBusy(false);
        }
      })();
    }, 450);

    return () => clearTimeout(timer);
  }, [accountRef, serviceCode, operatorPicked, circleCode]);

  const formReady = useMemo(() => {
    const number = accountRef.replace(/\D/g, "");
    const numberOk =
      serviceCode === "MOBILE_PREPAID" ? number.length === 10 : number.length >= 8;
    const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
    const circleOk = serviceCode !== "MOBILE_PREPAID" || Boolean(circleCode);
    return Boolean(numberOk && operatorCode && circleOk && amountOk && txnPin.length === 4);
  }, [accountRef, amount, circleCode, operatorCode, serviceCode, txnPin]);

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

      if (txnPin.length !== 4) {
        showAlert("Transaction PIN", "Enter your 4-digit transaction PIN");
        return;
      }

      const body: Record<string, string> = {
        serviceCode,
        operatorCode,
        accountRef: number,
        amount: amount.trim(),
        txnPin,
        idempotencyKey: attemptKey.current.get(),
      };

      const { data } = await api.post<
        ApiResponse<{
          txn?: { txnRef?: string; status?: string; failureReason?: string | null };
          provider?: { status?: string; message?: string };
        }>
      >("/txn/recharge", body);

      if (!data.success) throw new Error(data.message || "Recharge failed");
      const txn = data.data?.txn;
      const provider = data.data?.provider;
      const status = (txn?.status ?? provider?.status ?? "pending").toLowerCase();
      const ref = txn?.txnRef ?? "";
      const reason =
        (provider?.message && provider.message.trim()) ||
        (txn?.failureReason && txn.failureReason.trim()) ||
        "";
      setLastRef(ref || null);
      setLastStatus(status);
      if (status === "success") {
        attemptKey.current.clear();
        stayBlocked = true;
        setBlockResubmit(true);
        showAlert(
          "Recharge successful",
          (ref ? `Ref: ${ref}` : "Done") + (earnLine ? `\n${earnLine}` : ""),
        );
        setTxnPin("");
      } else if (status === "failed") {
        setBlockResubmit(false);
        showAlert("Recharge failed", reason || data.message || "Failed");
      } else {
        attemptKey.current.clear();
        stayBlocked = true;
        setBlockResubmit(true);
        showAlert(
          "Recharge submitted",
          reason ||
            (ref
              ? `Status is pending — do not tap Recharge again. Ref: ${ref}. Check Transactions.`
              : "Status is pending — do not tap Recharge again. Check Transactions."),
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

  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <ArrowLeft size={22} color={colors.blue} />
        </Pressable>
        <View style={[styles.headerIcon, { backgroundColor: `${colors.blue}14` }]}>
          <Smartphone size={20} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: tokens.txt }]}>{title}</Text>
          <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.flipStage, operatorPicked ? { minHeight: 620 } : null]}>
          {!operatorPicked ? (
          <Animated.View
            style={[
              styles.formCard,
              {
                backgroundColor: tokens.card,
                borderColor: tokens.cardBorder,
                opacity: frontOpacity,
                transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
              },
            ]}
          >
            <Text style={{ color: tokens.sub, fontSize: 13, marginBottom: 14, fontWeight: "600" }}>
              Select operator
            </Text>
            <View style={styles.logoGrid}>
              {ops.map((op) => (
                <Pressable
                  key={op.code}
                  onPress={() => selectOperator(op.code)}
                  style={styles.logoCell}
                >
                  <OperatorLogo op={op} size={56} />
                  <Text
                    style={{
                      color: tokens.txt,
                      fontSize: 12,
                      fontWeight: "700",
                      marginTop: 8,
                      textAlign: "center",
                      width: "100%",
                    }}
                    numberOfLines={1}
                  >
                    {op.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
          ) : (
          <Animated.View
            style={[
              styles.formCard,
              {
                backgroundColor: tokens.card,
                borderColor: tokens.cardBorder,
                opacity: backOpacity,
                transform: [{ perspective: 1200 }, { rotateY: backRotate }],
              },
            ]}
          >
            <View style={styles.formHead}>
              <View style={styles.formHeadLeft}>
                {selectedOp ? <OperatorLogo op={selectedOp} size={48} /> : null}
                <View>
                  <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 17 }}>
                    {selectedOp?.label ?? "Operator"}
                  </Text>
                  <View style={[styles.prepaidPill, { backgroundColor: `${colors.green}18` }]}>
                    <Text style={{ color: colors.green, fontSize: 11, fontWeight: "800" }}>
                      {serviceCode === "DTH" ? "DTH" : "Prepaid"}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable onPress={clearOperator} style={styles.closeBtn} hitSlop={10}>
                <X size={18} color={tokens.sub} />
              </Pressable>
            </View>

            {serviceCode === "MOBILE_PREPAID" ? (
              <SelectField
                label="Telecom Circle"
                value={circleCode}
                placeholder="Select Circle"
                options={circleOptions.map((c) => ({ value: c.code, label: c.name }))}
                tokens={tokens}
                icon={<MapPin size={16} color={colors.blue} />}
                onChange={(code) => {
                  markNewIntent();
                  setCircleCode(code);
                  setPlans([]);
                  setOffers([]);
                }}
              />
            ) : null}

            <Text style={[styles.label, { color: tokens.txt }]}>
              {serviceCode === "DTH" ? "Subscriber ID" : "Mobile Number"}
            </Text>
            <View
              style={[
                styles.inputRow,
                { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg },
              ]}
            >
              <Smartphone size={16} color={colors.blue} />
              <TextInput
                style={[styles.inputBare, { color: tokens.txt }]}
                keyboardType="number-pad"
                maxLength={serviceCode === "DTH" ? 20 : 10}
                value={accountRef}
                onChangeText={(t) => {
                  markNewIntent();
                  setAccountRef(t.replace(/\D/g, ""));
                }}
                placeholder={serviceCode === "DTH" ? "Enter subscriber ID" : "Enter 10-digit number"}
                placeholderTextColor={tokens.mute}
              />
            </View>
            {serviceCode === "MOBILE_PREPAID" && lookupBusy ? (
              <View style={styles.hintRow}>
                <ActivityIndicator size="small" color={colors.blue} />
                <Text style={{ color: tokens.sub, fontSize: 12 }}>Detecting circle…</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: tokens.txt }]}>Recharge Amount</Text>
            <View style={styles.planOfferRow}>
              <Pressable
                onPress={() => void openCatalog("plans")}
                style={[styles.miniBtn, { borderColor: colors.blue, backgroundColor: `${colors.blue}10` }]}
              >
                <Text style={{ color: colors.blue, fontWeight: "700", fontSize: 11 }}>View Plans</Text>
              </Pressable>
              {serviceCode === "DTH" || operatorCode !== "JIO" ? (
                <Pressable
                  onPress={() => void openCatalog("offers")}
                  style={[styles.miniBtn, { borderColor: colors.blue, backgroundColor: `${colors.blue}10` }]}
                >
                  <Text style={{ color: colors.blue, fontWeight: "700", fontSize: 11 }}>
                    {serviceCode === "DTH" ? "View Info" : "View Offers"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View
              style={[
                styles.inputRow,
                { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg },
              ]}
            >
              <Wallet size={16} color={colors.blue} />
              <TextInput
                style={[styles.inputBare, { color: tokens.txt }]}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={(t) => {
                  markNewIntent();
                  setAmount(t);
                }}
                placeholder="Enter Amount"
                placeholderTextColor={tokens.mute}
              />
            </View>
            {earnLine ? (
              <Text style={{ color: colors.greenDark, fontSize: 12, fontWeight: "700", marginTop: 6 }}>
                {earnLine}
              </Text>
            ) : null}

            <Text style={[styles.label, { color: tokens.txt }]}>TPIN</Text>
            <View
              style={[
                styles.inputRow,
                { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg },
              ]}
            >
              <Lock size={16} color={colors.blue} />
              <TextInput
                style={[styles.inputBare, { color: tokens.txt, letterSpacing: 6 }]}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                value={txnPin}
                onChangeText={(t) => setTxnPin(t.replace(/\D/g, "").slice(0, 4))}
                placeholder="Enter TPIN"
                placeholderTextColor={tokens.mute}
              />
            </View>

            {blockResubmit ? (
              <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 8 }}>
                Do not tap Recharge again while status is pending. Change number or amount for a new
                recharge.
                {lastRef ? ` Last ref: ${lastRef}` : ""}
                {lastStatus ? ` (${lastStatus})` : ""}
              </Text>
            ) : null}

            {!formReady && !blockResubmit ? (
              <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 8 }}>
                Fill circle, mobile, amount, and 4-digit TPIN to enable Recharge.
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
                  {blockResubmit ? "Submitted — wait for status" : "Recharge Now"}
                </Text>
              )}
            </Pressable>
          </Animated.View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={panelOpen}
        animationType="slide"
        onRequestClose={() => {
          animateLayout();
          setPanelOpen(false);
        }}
      >
        <SafeAreaView style={[styles.safe, { backgroundColor: "#F4F6FB" }]} edges={["top"]}>
          <View style={[styles.panelHead, { backgroundColor: "#fff", borderBottomColor: tokens.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 18 }}>
                {serviceCode === "DTH" ? "Browse Plans & Info" : "Browse Plans & Offers"}
              </Text>
              <Text style={{ color: tokens.sub, fontSize: 12, marginTop: 3 }}>
                {serviceCode === "DTH" && panelTab === "offers"
                  ? "Subscriber details for this connection"
                  : selectedOp
                    ? `${selectedOp.label} · tap a pack to fill amount`
                    : "Tap a pack to fill amount"}
              </Text>
            </View>
            <PopupCloseButton
              onPress={() => {
                animateLayout();
                setPanelOpen(false);
              }}
            />
          </View>
          <View style={[styles.catalogBtnRow, { backgroundColor: "#fff", paddingTop: 10 }]}>
            <View style={[styles.catalogSegment, { backgroundColor: "#EEF1F6", borderColor: tokens.cardBorder }]}>
              <Pressable
                onPress={() => setPanelTab("plans")}
                style={[
                  styles.catalogSegBtn,
                  panelTab === "plans" ? { backgroundColor: colors.blue } : null,
                  !(serviceCode === "DTH" || operatorCode !== "JIO") ? { flex: 1 } : null,
                ]}
              >
                <Text style={{ color: panelTab === "plans" ? "#fff" : "#334155", fontWeight: "700", fontSize: 13 }}>
                  Plans
                </Text>
              </Pressable>
              {serviceCode === "DTH" || operatorCode !== "JIO" ? (
                <Pressable
                  onPress={() => setPanelTab("offers")}
                  style={[
                    styles.catalogSegBtn,
                    panelTab === "offers" ? { backgroundColor: colors.blue } : null,
                  ]}
                >
                  <Text style={{ color: panelTab === "offers" ? "#fff" : "#334155", fontWeight: "700", fontSize: 13 }}>
                    {serviceCode === "DTH" ? "Info" : "Offers"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {panelBusy ? (
              <ActivityIndicator color={colors.blue} style={{ marginTop: 24 }} />
            ) : (
              <>
                {serviceCode === "DTH" && panelTab === "offers" && dthSummary.length > 0 ? (
                  (() => {
                    const info = formatDthSubscriberInfo(dthSummary);
                    const opName = selectedOp?.label;
                    return (
                      <View style={{ gap: 12 }}>
                        {opName ? (
                          <View style={styles.dthOpBanner}>
                            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>{opName}</Text>
                          </View>
                        ) : null}
                        <View style={[styles.dthCard, { backgroundColor: "#EEF3FF", borderColor: tokens.cardBorder }]}>
                          <Text style={{ color: tokens.sub, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>
                            CUSTOMER
                          </Text>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 10 }}>
                            <Text style={{ color: tokens.txt, fontSize: 17, fontWeight: "800", flex: 1 }} numberOfLines={2}>
                              {info.name ?? "Subscriber"}
                            </Text>
                            {info.balance ? (
                              <View style={[styles.dthBalanceChip, { borderColor: tokens.cardBorder }]}>
                                <Text style={{ color: tokens.sub, fontSize: 10, fontWeight: "700" }}>BALANCE</Text>
                                <Text style={{ color: colors.green, fontSize: 16, fontWeight: "800", marginTop: 2 }}>
                                  {info.balance}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        {info.account.length > 0 ? (
                          <View style={[styles.dthCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <Wallet size={14} color={colors.blue} strokeWidth={2.2} />
                              <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 13 }}>Account</Text>
                            </View>
                            {info.account.map((row, idx) => (
                              <View
                                key={`${row.label}-${row.value}`}
                                style={[
                                  styles.dthAccountRow,
                                  idx < info.account.length - 1
                                    ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.cardBorder }
                                    : null,
                                ]}
                              >
                                <Text style={{ color: tokens.sub, fontSize: 13, flex: 1 }}>{row.label}</Text>
                                <Text
                                  style={{ color: tokens.txt, fontWeight: "700", fontSize: 13, flex: 1.15, textAlign: "right" }}
                                  numberOfLines={2}
                                >
                                  {row.value}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {offers.length === 0 ? (
                          <Text style={{ color: tokens.sub, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 4 }}>
                            Use the balance and dates above, then enter the recharge amount on the form.
                          </Text>
                        ) : null}
                      </View>
                    );
                  })()
                ) : null}
                {!(serviceCode === "DTH" && panelTab === "offers" && dthSummary.length > 0 && offers.length === 0) ? (
                  <PlanBlock
                    items={panelTab === "plans" ? plans : offers}
                    tokens={tokens}
                    selectedAmount={amount}
                    onPick={(a) => {
                      markNewIntent();
                      setAmount(a);
                      setPanelOpen(false);
                    }}
                  />
                ) : null}
              </>
            )}
            {!panelBusy &&
            (panelTab === "plans" ? plans : offers).length === 0 &&
            !(serviceCode === "DTH" && panelTab === "offers" && dthSummary.length > 0) ? (
              <Text style={{ color: tokens.sub, fontSize: 13, marginTop: 16, textAlign: "center", lineHeight: 18 }}>
                {serviceCode === "DTH"
                  ? "No packs returned. Enter amount manually."
                  : `No ${panelTab} for this operator and circle. Enter amount manually.`}
              </Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "700" },
  body: { padding: 16, paddingBottom: 40 },
  flipStage: { minHeight: 280 },
  formCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  logoGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" },
  logoCell: { width: "33.333%", alignItems: "center", marginBottom: 14, paddingHorizontal: 4 },
  formHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  formHeadLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  prepaidPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(11,42,154,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  inputRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputBare: { flex: 1, fontSize: 15, padding: 0 },
  select: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectModalRoot: { flex: 1, justifyContent: "flex-end" },
  selectScrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.35)" },
  selectSheet: {
    maxHeight: "70%",
    margin: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  selectOption: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  planOfferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  miniBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  planCard: { borderWidth: 1, borderRadius: 18, marginTop: 8, flexDirection: "row", overflow: "hidden" },
  planPrice: { width: 82, alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  planCardWeb: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  planCardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  planValidityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F0FF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  planSelectBtn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  catalogBtnRow: { paddingHorizontal: 16, paddingBottom: 12 },
  catalogSegment: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  catalogSegBtn: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  tabRow: { gap: 8, paddingBottom: 2 },
  dthOpBanner: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#2A5CDD",
    alignItems: "center",
  },
  dthCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  dthBalanceChip: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    minWidth: 88,
    alignItems: "flex-end",
  },
  dthAccountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  cta: { marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
