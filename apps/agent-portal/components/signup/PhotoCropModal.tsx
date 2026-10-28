"use client";

import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Crop, RotateCcw, RotateCw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";

/** ID-1 card (PAN / Aadhaar PVC): 85.6 × 54 mm. */
const CARD_ASPECT = 85.6 / 54;
const MAX_SIDE = 1600;
/** ~200–350 KB for a 1600 px card photo — uploads fast on mobile data, still sharp enough to read. */
const JPEG_QUALITY = 0.8;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not open this photo"));
    img.src = src;
  });
}

/** Whole photo scaled to ≤ MAX_SIDE as a JPEG data URL (fits the 1.5 MB KYC upload limit). */
export function scaleImageToDataUrl(image: HTMLImageElement): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not open this photo");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Rotate the full image, cut the crop box, scale to ≤ MAX_SIDE, return a JPEG data URL. */
async function cropToDataUrl(src: string, area: Area, rotation: number, maxSide = MAX_SIDE): Promise<string> {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const boxW = Math.round(image.width * cos + image.height * sin);
  const boxH = Math.round(image.width * sin + image.height * cos);

  const rotated = document.createElement("canvas");
  rotated.width = boxW;
  rotated.height = boxH;
  const rctx = rotated.getContext("2d");
  if (!rctx) throw new Error("Could not crop this photo");
  rctx.translate(boxW / 2, boxH / 2);
  rctx.rotate(rad);
  rctx.drawImage(image, -image.width / 2, -image.height / 2);

  const scale = Math.min(1, maxSide / Math.max(area.width, area.height));
  const out = document.createElement("canvas");
  out.width = Math.round(area.width * scale);
  out.height = Math.round(area.height * scale);
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Could not crop this photo");
  octx.fillStyle = "#FFFFFF";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function PhotoCropModal({
  src,
  title,
  onCancel,
  onConfirm,
  aspect = CARD_ASPECT,
  cropShape = "rect",
  maxSide = MAX_SIDE,
  subtitle = "Fit the card inside the frame. Rotate if the photo is sideways or upside down.",
}: {
  src: string;
  title: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  /** Frame width ÷ height; defaults to an ID card. */
  aspect?: number;
  cropShape?: "rect" | "round";
  /** Longest side of the output JPEG in px. */
  maxSide?: number;
  subtitle?: string;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!area) return;
    setBusy(true);
    setError(null);
    try {
      onConfirm(await cropToDataUrl(src, area, rotation, maxSide));
    } catch {
      setError("Could not crop this photo. Try another photo (JPG or PNG).");
    } finally {
      setBusy(false);
    }
  }

  const rotateBtn =
    "flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl border-2 bg-white text-sm font-semibold transition hover:bg-[#F7F9FF]";

  return (
    <Modal
      title={title}
      onClose={onCancel}
      closeDisabled={busy}
      icon={<Crop size={22} />}
      iconTone="blue"
      subtitle={subtitle}
      wide
    >
      <div className="space-y-4">
        <div className="relative h-[300px] w-full overflow-hidden rounded-2xl sm:h-[360px]" style={{ background: "#0F172A" }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            cropShape={cropShape}
            minZoom={0.5}
            maxZoom={4}
            restrictPosition={false}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_, px) => setArea(px)}
          />
        </div>

        <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: B.border, background: B.bg }}>
          <div className="flex gap-3">
            <button
              type="button"
              className={rotateBtn}
              style={{ borderColor: B.border, color: B.blue }}
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            >
              <RotateCcw size={16} /> Rotate left
            </button>
            <button
              type="button"
              className={rotateBtn}
              style={{ borderColor: B.border, color: B.blue }}
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw size={16} /> Rotate right
            </button>
          </div>
          <label className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
            Zoom
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
              aria-label="Zoom"
            />
          </label>
        </div>

        {error ? (
          <p className="text-xs font-semibold" style={{ color: "#DC2626" }}>
            {error}
          </p>
        ) : null}

        <div className="flex gap-3 pb-1">
          <PrimaryButton
            type="button"
            variant="destructive"
            showArrow={false}
            onClick={onCancel}
            disabled={busy}
            className="flex-1"
          >
            Cancel
          </PrimaryButton>
          <PrimaryButton
            type="button"
            variant="primary"
            showArrow={false}
            onClick={() => void confirm()}
            loading={busy}
            disabled={!area || busy}
            className="flex-1"
          >
            Use photo
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
