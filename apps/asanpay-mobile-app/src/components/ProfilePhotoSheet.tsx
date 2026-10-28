import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, ImageIcon, Trash2 } from "lucide-react-native";
import { ModalSheet } from "./ModalSheet";
import { showAlert } from "./AppAlert";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { apiError } from "../utils/apiError";
import { removeProfilePhoto, saveProfilePhoto, useMyProfilePhoto } from "../lib/profilePhoto";

type PickResult = {
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets?: Array<{ type?: string; base64?: string; fileSize?: number }>;
};

const MAX_BYTES = 600 * 1024;

/** Account → avatar tap: add, change or remove the profile photo (gallery or front camera). */
export function ProfilePhotoSheet({ visible, name, onClose }: { visible: boolean; name: string; onClose: () => void }) {
  const { tokens } = useTheme();
  const photo = useMyProfilePhoto();
  const [busy, setBusy] = useState<null | "save" | "remove">(null);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";

  async function pick(source: "gallery" | "camera") {
    const opts = { mediaType: "photo", quality: 0.8, maxWidth: 512, maxHeight: 512, includeBase64: true };
    let result: PickResult;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const picker = require("react-native-image-picker") as {
        launchImageLibrary: (o: Record<string, unknown>) => Promise<PickResult>;
        launchCamera: (o: Record<string, unknown>) => Promise<PickResult>;
      };
      result =
        source === "gallery"
          ? await picker.launchImageLibrary({ ...opts, selectionLimit: 1 })
          : await picker.launchCamera({ ...opts, cameraType: "front", saveToPhotos: false, presentationStyle: "fullScreen" });
    } catch (err) {
      showAlert("Photo not opened", err instanceof Error ? err.message : "Could not open the picker. Try again.");
      return;
    }
    if (result.didCancel) return;
    if (result.errorCode) {
      const denied = result.errorCode === "permission" || /permission/i.test(result.errorMessage || "");
      showAlert(
        denied ? "Permission needed" : "Photo not opened",
        denied
          ? `Allow ${source === "camera" ? "camera" : "photo"} access in phone Settings → Apps → AsanPay → Permissions, then try again.`
          : result.errorMessage || "Could not open the picker. Try again.",
      );
      return;
    }
    const asset = result.assets?.[0];
    if (!asset?.base64) {
      showAlert("Photo not read", "Pick another photo and try again.");
      return;
    }
    if (asset.base64.length * 0.75 > MAX_BYTES) {
      showAlert("Photo too large", "Photo must be under 600 KB. Pick a smaller photo.");
      return;
    }
    setBusy("save");
    try {
      await saveProfilePhoto(`data:${asset.type || "image/jpeg"};base64,${asset.base64}`);
      showAlert("Photo updated", "Your new profile photo is saved.");
    } catch (err) {
      showAlert("Photo not saved", apiError(err, "Profile photo was not saved. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await removeProfilePhoto();
    } catch (err) {
      showAlert("Photo not removed", apiError(err, "Profile photo was not removed. Try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ModalSheet
      visible={visible}
      title="Profile photo"
      subtitle="Shown to your upline and AsanPay support"
      icon={<Camera />}
      iconTone="blue"
      onClose={onClose}
    >
      <View style={styles.previewWrap}>
        <View style={[styles.preview, { borderColor: tokens.cardBorder }]}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.previewImg} />
          ) : (
            <Text style={styles.previewInitials}>{initials}</Text>
          )}
          {busy ? (
            <View style={styles.busyVeil}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
        <Text style={[styles.hint, { color: tokens.sub }]}>JPG or PNG · square photos look best</Text>
      </View>

      <Pressable
        disabled={!!busy}
        onPress={() => void pick("gallery")}
        style={[styles.btn, { backgroundColor: photo ? colors.blueLight : colors.green, opacity: busy ? 0.6 : 1 }]}
      >
        <ImageIcon size={16} color="#fff" />
        <Text style={styles.btnText}>{photo ? "Change from gallery" : "Add from gallery"}</Text>
      </Pressable>
      <Pressable
        disabled={!!busy}
        onPress={() => void pick("camera")}
        style={[styles.btn, styles.btnOutline, { borderColor: colors.blueLight, opacity: busy ? 0.6 : 1 }]}
      >
        <Camera size={16} color={colors.blueLight} />
        <Text style={[styles.btnText, { color: colors.blueLight }]}>Take a selfie</Text>
      </Pressable>
      {photo ? (
        <Pressable
          disabled={!!busy}
          onPress={() => void remove()}
          style={[styles.btn, { backgroundColor: colors.danger, opacity: busy ? 0.6 : 1 }]}
        >
          <Trash2 size={16} color="#fff" />
          <Text style={styles.btnText}>Remove photo</Text>
        </Pressable>
      ) : null}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  previewWrap: { alignItems: "center", marginBottom: 14 },
  preview: {
    width: 104,
    height: 104,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueLight,
  },
  previewImg: { width: "100%", height: "100%" },
  previewInitials: { color: "#fff", fontSize: 32, fontWeight: "800" },
  busyVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { marginTop: 8, fontSize: 11.5, fontWeight: "600" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 8,
  },
  btnOutline: { backgroundColor: "transparent", borderWidth: 1.5 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
