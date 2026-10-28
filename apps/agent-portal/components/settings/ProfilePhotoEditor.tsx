"use client";

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Camera, Trash2 } from "lucide-react";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { removeProfilePhoto, saveProfilePhoto, useMyProfilePhoto } from "@/lib/profilePhoto";
import { PhotoCropModal } from "@/components/signup/PhotoCropModal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

/** Settings → Profile: agent's photo with Add / Change / Remove. Shown to admins on the agent page too. */
export function ProfilePhotoEditor({ initials, name, subtitle }: { initials: string; name: string; subtitle: string }) {
  const photo = useMyProfilePhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      toast.error("Photo must be a JPG, PNG or WebP image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Photo must be under 10 MB");
      return;
    }
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function onCropped(dataUrl: string) {
    closeCrop();
    setBusy(true);
    try {
      await saveProfilePhoto(dataUrl);
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(extractApiError(err, "Profile photo was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      await removeProfilePhoto();
      toast.success("Profile photo removed");
      setConfirmRemove(false);
    } catch (err) {
      toast.error(extractApiError(err, "Profile photo was not removed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl text-2xl font-bold text-white shadow-md"
        style={{ background: B.badgeGrad }}
        title={photo ? "Change photo" : "Add photo"}
        aria-label={photo ? "Change profile photo" : "Add profile photo"}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">{initials}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
          <Camera size={20} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-bold" style={{ color: B.blue }}>
          {name}
        </div>
        <div className="text-sm" style={{ color: B.muted }}>
          {subtitle}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <PrimaryButton
            type="button"
            variant={photo ? "primary" : "success"}
            loading={busy}
            onClick={() => fileRef.current?.click()}
            size="sm"
            showArrow={false}
            className="!w-auto"
          >
            <Camera size={14} /> {photo ? "Change photo" : "Add photo"}
          </PrimaryButton>
          {photo ? (
            <PrimaryButton
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
              size="sm"
            showArrow={false}
            className="!w-auto"
            >
              <Trash2 size={14} /> Remove
            </PrimaryButton>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: B.muted }}>
          JPG, PNG or WebP · crop and rotate before saving · shown to your upline and AsanPay support
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {cropSrc ? (
        <PhotoCropModal
          src={cropSrc}
          title="Crop profile photo"
          subtitle="Keep your face inside the circle. Rotate if the photo is sideways."
          aspect={1}
          cropShape="round"
          maxSide={512}
          onCancel={closeCrop}
          onConfirm={(dataUrl) => void onCropped(dataUrl)}
        />
      ) : null}
      {confirmRemove ? (
        <ConfirmModal
          title="Remove profile photo?"
          message="Your initials show instead until you add a new photo."
          confirmLabel="Remove photo"
          tone="danger"
          busy={busy}
          busyLabel="Removing…"
          onConfirm={() => void onRemove()}
          onClose={() => {
            if (!busy) setConfirmRemove(false);
          }}
        />
      ) : null}
    </div>
  );
}
