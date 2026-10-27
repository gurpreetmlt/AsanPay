import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  type CameraDevice,
  type CameraDeviceFormat,
} from "react-native-vision-camera";
import { X } from "lucide-react-native";
import { colors } from "../theme/colors";

// Hoisted React 19 types make the library's class component look invalid to TS; it renders fine.
const CameraView = Camera as unknown as React.ComponentType<{
  ref?: React.Ref<Camera>;
  style?: object;
  device: CameraDevice;
  format?: CameraDeviceFormat;
  isActive: boolean;
  photo: boolean;
  photoQualityBalance?: "speed" | "balanced" | "quality";
}>;

/** ID-1 card (PAN / Aadhaar PVC): 85.6 × 54 mm. */
const CARD_ASPECT = 85.6 / 54;

/**
 * Camera with an ID-card frame for KYC photos. Returns the photo file path; the caller auto-crops it
 * on the server like a gallery photo. ~2 MP keeps the JPEG under the 1.5 MB upload limit.
 */
export function CardCameraModal({
  visible,
  title,
  onClose,
  onCaptured,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onCaptured: (path: string) => void;
}) {
  const device = useCameraDevice("back");
  const format = useCameraFormat(device, [{ photoResolution: { width: 1920, height: 1080 } }]);
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    setError(null);
    if (!hasPermission) void requestPermission();
  }, [visible, hasPermission, requestPermission]);

  async function capture() {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePhoto({ flash: "off", enableShutterSound: false });
      onCaptured(photo.path);
    } catch {
      setError("Could not take the photo. Hold the phone steady and try again.");
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Text style={s.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <X size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={s.body}>
          {!hasPermission ? (
            <View style={s.center}>
              <Text style={s.msg}>Allow camera access to take a photo of your card.</Text>
              <Pressable style={s.btn} onPress={() => void Linking.openSettings()}>
                <Text style={s.btnText}>Open settings</Text>
              </Pressable>
            </View>
          ) : !device ? (
            <View style={s.center}>
              <Text style={s.msg}>No camera found on this phone. Use Gallery instead.</Text>
            </View>
          ) : (
            <>
              <CameraView
                ref={camera}
                style={s.camera}
                device={device}
                format={format}
                isActive={visible}
                photo
                photoQualityBalance="balanced"
              />
              <View style={s.frameWrap} pointerEvents="none">
                <View style={s.frame}>
                  <View style={[s.corner, s.tl]} />
                  <View style={[s.corner, s.tr]} />
                  <View style={[s.corner, s.bl]} />
                  <View style={[s.corner, s.br]} />
                </View>
                <Text style={s.hint}>Fit the card inside the frame · good light · no glare</Text>
              </View>
            </>
          )}
        </View>

        <View style={s.footer}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          {hasPermission && device ? (
            <Pressable
              onPress={() => void capture()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              style={({ pressed }) => [s.shutter, { opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
            >
              {busy ? <ActivityIndicator color={colors.blue} /> : <View style={s.shutterInner} />}
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const CORNER = 28;

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
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 14 },
  frame: { width: "88%", aspectRatio: CARD_ASPECT, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: "#fff" },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  hint: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "rgba(11,18,32,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  footer: { padding: 18, alignItems: "center", gap: 12, minHeight: 110, justifyContent: "center" },
  error: { color: "#FCA5A5", fontSize: 13, textAlign: "center" },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
  btn: { backgroundColor: colors.blue, borderRadius: 14, height: 48, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
