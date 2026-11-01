import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Geolocation, { type GeolocationResponse } from "@react-native-community/geolocation";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useBarcodeScannerOutput, type TargetBarcodeFormat } from "react-native-vision-camera-barcode-scanner";
import { CheckCircle2, MapPin, X, XCircle } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { detectMockLocation } from "../../lib/geoCapture";
import { colors } from "../../theme/colors";

/** Module-level so the scanner output is not recreated on every render. */
const QR_FORMATS: TargetBarcodeFormat[] = ["qr-code"];

/** QR shown on the web "Verify your location" / "Fetch shop location" screens. */
const GEO_PREFIX = "asanpay:geo:";

type Fix = { latitude: number; longitude: number; accuracyMeters?: number; isMockLocation?: boolean };

function position(highAccuracy: boolean, timeout: number): Promise<GeolocationResponse> {
  return new Promise((resolve, reject) =>
    Geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: highAccuracy, timeout, maximumAge: 15000 }),
  );
}

/** Asks for location permission, then a GPS fix (one low-accuracy retry). Throws an agent-readable message. */
async function exactLocation(): Promise<Fix> {
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
      title: "Location permission",
      message: "AsanPay needs your exact location to verify your shop for the web.",
      buttonPositive: "Allow",
    });
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("Location permission is off. Allow location for AsanPay in Settings, then scan again.");
    }
  }
  let pos: GeolocationResponse;
  try {
    pos = await position(true, 20000);
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 1) throw new Error("Location permission is off. Allow location for AsanPay in Settings, then scan again.");
    if (code === 2) throw new Error("Phone location (GPS) is off. Turn on Location in quick settings, then scan again.");
    try {
      pos = await position(false, 10000);
    } catch {
      throw new Error("Could not get a GPS fix. Step near a window or outside the shop door, then scan again.");
    }
  }
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyMeters: typeof pos.coords.accuracy === "number" ? Math.round(pos.coords.accuracy) : undefined,
    isMockLocation: await detectMockLocation(),
  };
}

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
    setPhase({ kind: "working", text: "Getting your exact location… (up to 20 seconds)" });
    let geo: Fix;
    try {
      geo = await exactLocation();
    } catch (err) {
      setPhase({ kind: "error", text: err instanceof Error ? err.message : "Could not get your location. Scan again." });
      return;
    }
    setPhase({ kind: "working", text: "Sending location to the web…" });
    try {
      const { data } = await api.post<ApiResponse<{ accuracyMeters: number | null }>>("/geo-link/confirm", {
        token,
        latitude: geo.latitude,
        longitude: geo.longitude,
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

  const scannerOutput = useBarcodeScannerOutput({
    barcodeFormats: QR_FORMATS,
    onBarcodeScanned: (barcodes) => {
      const value = barcodes[0]?.rawValue;
      if (value) void handleCode(value);
    },
    onError: () => {
      if (handling.current) return;
      handling.current = true;
      setPhase({ kind: "error", text: "The QR scanner stopped. Tap Scan again to restart the camera." });
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
          ) : phase.kind === "scanning" ? (
            <>
              {/* Unmounted (not paused) after a read: a paused session leaves a frozen last frame. */}
              <Camera style={s.camera} device={device} isActive={visible} outputs={[scannerOutput]} />
              <View style={s.frame} pointerEvents="none" />
            </>
          ) : (
            <View style={s.center}>
              <View style={s.card}>
                {phase.kind === "working" ? (
                  <ActivityIndicator size="large" color={colors.blue} />
                ) : phase.kind === "done" ? (
                  <CheckCircle2 size={48} color={colors.green} />
                ) : (
                  <XCircle size={48} color={colors.danger} />
                )}
                <Text style={s.cardTitle}>
                  {phase.kind === "working"
                    ? "QR captured"
                    : phase.kind === "done"
                      ? "Location sent"
                      : "Could not verify location"}
                </Text>
                <Text style={s.cardText}>{phase.text}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={s.footer}>
          {phase.kind === "scanning" ? (
            <View style={s.row}>
              <MapPin size={18} color={colors.blueLight} />
              <Text style={s.hint}>Point the camera at the QR on the AsanPay web screen. Keep GPS ON.</Text>
            </View>
          ) : phase.kind === "done" ? (
            <Pressable style={s.btn} onPress={onClose}>
              <Text style={s.btnText}>Done</Text>
            </Pressable>
          ) : phase.kind === "error" ? (
            <Pressable style={s.btn} onPress={scanAgain}>
              <Text style={s.btnText}>Scan again</Text>
            </Pressable>
          ) : null}
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
  card: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 22,
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#111827", textAlign: "center" },
  cardText: { fontSize: 14, lineHeight: 20, color: "#4B5563", textAlign: "center" },
  footer: { padding: 18, gap: 14, minHeight: 84, justifyContent: "center" },
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
