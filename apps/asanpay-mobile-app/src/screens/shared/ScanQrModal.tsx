import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type CameraDevice,
  type CodeScanner,
} from "react-native-vision-camera";
import { CheckCircle2, MapPin, X, XCircle } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { getAepsGeoTag } from "../../lib/geoCapture";
import { colors } from "../../theme/colors";

// Hoisted React 19 types make the library's class component look invalid to TS; it renders fine.
const CameraView = Camera as unknown as React.ComponentType<{
  style?: object;
  device: CameraDevice;
  isActive: boolean;
  codeScanner: CodeScanner;
}>;

/** QR shown on the web "Verify your location" / "Fetch shop location" screens. */
const GEO_PREFIX = "asanpay:geo:";

type Phase =
  | { kind: "scanning" }
  | { kind: "working"; text: string }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string };

/** Home "Scan QR": reads the web location QR and sends this phone's GPS for that web session. */
export function ScanQrModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const handling = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setPhase({ kind: "scanning" });
    handling.current = false;
    if (!hasPermission) void requestPermission();
  }, [visible, hasPermission, requestPermission]);

  const handleCode = useCallback(async (value: string) => {
    if (handling.current) return;
    handling.current = true;
    if (!value.startsWith(GEO_PREFIX)) {
      setPhase({ kind: "error", text: "This is not an AsanPay location QR. Scan the QR shown on the AsanPay web screen." });
      return;
    }
    const token = value.slice(GEO_PREFIX.length).trim();
    setPhase({ kind: "working", text: "Getting your exact location…" });
    const geo = await getAepsGeoTag();
    if (!geo) {
      setPhase({ kind: "error", text: "Allow location access and turn on GPS, then scan again." });
      return;
    }
    setPhase({ kind: "working", text: "Sending location to the web…" });
    try {
      const { data } = await api.post<ApiResponse<{ accuracyMeters: number | null }>>("/geo-link/confirm", {
        token,
        latitude: Number(geo.latitude),
        longitude: Number(geo.longitude),
        accuracyMeters: geo.accuracyMeters,
        isMockLocation: geo.isMockLocation,
      });
      if (!data.success) throw new Error(data.message);
      setPhase({
        kind: "done",
        text: `Location sent${geo.accuracyMeters != null ? ` (±${geo.accuracyMeters} m)` : ""}. Continue on the web.`,
      });
    } catch (err) {
      setPhase({ kind: "error", text: apiError(err, "Could not send the location. Scan the QR again.") });
    }
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      const value = codes[0]?.value;
      if (value) void handleCode(value);
    },
  });

  function scanAgain() {
    handling.current = false;
    setPhase({ kind: "scanning" });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Text style={s.title}>Scan QR</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <X size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={s.body}>
          {!hasPermission ? (
            <View style={s.center}>
              <Text style={s.msg}>Allow camera access to scan the QR.</Text>
              <Pressable style={s.btn} onPress={() => void Linking.openSettings()}>
                <Text style={s.btnText}>Open settings</Text>
              </Pressable>
            </View>
          ) : !device ? (
            <View style={s.center}>
              <Text style={s.msg}>No camera found on this phone.</Text>
            </View>
          ) : (
            <>
              <CameraView
                style={s.camera}
                device={device}
                isActive={visible && phase.kind === "scanning"}
                codeScanner={codeScanner}
              />
              <View style={s.frame} pointerEvents="none" />
            </>
          )}
        </View>

        <View style={s.footer}>
          {phase.kind === "scanning" ? (
            <View style={s.row}>
              <MapPin size={18} color={colors.blueLight} />
              <Text style={s.hint}>Point the camera at the QR on the AsanPay web screen. Keep GPS ON.</Text>
            </View>
          ) : phase.kind === "working" ? (
            <View style={s.row}>
              <ActivityIndicator color={colors.blueLight} />
              <Text style={s.hint}>{phase.text}</Text>
            </View>
          ) : phase.kind === "done" ? (
            <>
              <View style={s.row}>
                <CheckCircle2 size={22} color={colors.green} />
                <Text style={[s.hint, { color: "#fff", fontWeight: "700" }]}>{phase.text}</Text>
              </View>
              <Pressable style={s.btn} onPress={onClose}>
                <Text style={s.btnText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={s.row}>
                <XCircle size={22} color={colors.danger} />
                <Text style={[s.hint, { color: "#fff" }]}>{phase.text}</Text>
              </View>
              <Pressable style={s.btn} onPress={scanAgain}>
                <Text style={s.btnText}>Scan again</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  body: { flex: 1, overflow: "hidden" },
  camera: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  msg: { color: "#fff", fontSize: 14, textAlign: "center" },
  frame: {
    position: "absolute",
    alignSelf: "center",
    top: "22%",
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 18,
  },
  footer: { padding: 18, gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  hint: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 19 },
  btn: {
    backgroundColor: colors.blue,
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
