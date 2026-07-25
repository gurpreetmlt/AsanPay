import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { ModalSheet } from "./ModalSheet";
import { PinInput } from "./PinInput";
import { api } from "../lib/api";
import { apiError } from "../utils/apiError";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";
import type { ApiResponse } from "@asanpay/shared-types";

interface TxnPinModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  /** Receives short-lived txnAuth — never the raw PIN. */
  onVerified: (txnAuth: string) => void;
}

export function TxnPinModal({
  visible,
  title = "Enter Transaction PIN",
  onClose,
  onVerified,
}: TxnPinModalProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) setPin("");
  }, [visible]);

  async function verify() {
    if (pin.length !== 4) {
      showAlert("Invalid PIN", "Enter your 4-digit transaction PIN.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ txnAuth: string }>>("/auth/txn-pin/verify", { pin });
      if (!data.success || !data.data?.txnAuth) throw new Error(data.message || "PIN verify failed");
      const auth = data.data.txnAuth;
      setPin("");
      onVerified(auth);
    } catch (err) {
      showAlert("PIN failed", apiError(err, "Incorrect transaction PIN"));
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet visible={visible} title={title} onClose={onClose}>
      <Text style={styles.sub}>Money transfer ke liye PIN confirm karein</Text>
      <PinInput value={pin} onChange={setPin} />
      <Pressable onPress={verify} disabled={loading || pin.length !== 4} style={styles.btnWrap}>
        <LinearGradient colors={[...colors.gradient]} style={styles.btn}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Confirm PIN</Text>
          )}
        </LinearGradient>
      </Pressable>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginBottom: 20 },
  btnWrap: { marginTop: 24 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
