"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ChevronRight,
  LayoutDashboard,
  LogIn,
  Megaphone,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { resolvePromoImageSrc } from "@/lib/promoImage";
import { compressPromoImage } from "@/lib/compressPromoImage";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type Placement = "dashboard" | "login";

type PromoSlide = {
  id: string;
  imageUrl: string;
  title: string;
  linkUrl: string;
  placement: Placement;
  sortOrder: number;
  active: boolean;
};

const MAX = 8;

const SECTIONS = [
  {
    id: "dashboard" as const,
    label: "Dashboard Slider",
    icon: LayoutDashboard,
    hint: "Shows on the agent dashboard promo column.",
    size: "800 × 1200 px only (portrait 2:3). Do not use login landscape images here",
  },
  {
    id: "login" as const,
    label: "Login screen Slider",
    icon: LogIn,
    hint: "Shows on the left of the agent login page (full panel, auto-fit).",
    size: "1920 × 1600 px (landscape) or 1800 × 1800 (square). Full image shows — no crop",
  },
] as const;

function emptySlide(placement: Placement): PromoSlide {
  return {
    id: crypto.randomUUID(),
    imageUrl: "",
    title: "",
    linkUrl: "",
    placement,
    sortOrder: 0,
    active: true,
  };
}

export default function PromotionsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [placement, setPlacement] = useState<Placement>("dashboard");
  const [slides, setSlides] = useState<PromoSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  /** Local previews so thumbnails show even if disk file is missing after redeploy. */
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [brokenIds, setBrokenIds] = useState<string[]>([]);

  const section = SECTIONS.find((s) => s.id === placement) ?? SECTIONS[0];

  const load = useCallback(async (p: Placement) => {
    setLoading(true);
    setBrokenIds([]);
    setPreviews({});
    try {
      const data = await fetchApi<PromoSlide[]>("/admin/promos", { placement: p });
      setSlides(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load promotions");
      setSlides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load(placement);
  }, [hydrated, accessToken, router, load, placement]);

  function updateSlide(index: number, patch: Partial<PromoSlide>) {
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function isStoredUpload(url: string): boolean {
    return (
      url.startsWith("data:") ||
      url.includes("/promos/file/") ||
      url.includes("/promos/by-id/") ||
      url.includes("/promos/asset/")
    );
  }

  function thumbSrc(slide: PromoSlide): string {
    if (previews[slide.id]) return previews[slide.id];
    if (slide.imageUrl.startsWith("data:") || slide.imageUrl.startsWith("blob:")) {
      return slide.imageUrl;
    }
    if (brokenIds.includes(slide.id)) return "";
    return resolvePromoImageSrc(slide.imageUrl);
  }

  function addSlide() {
    if (slides.length >= MAX) {
      toast.error(`Maximum ${MAX} slides for this placement`);
      return;
    }
    setSlides((prev) => [...prev, emptySlide(placement)]);
  }

  function removeSlide(index: number) {
    setSlides((prev) => prev.filter((_, i) => i !== index));
  }

  async function onPickFile(index: number, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose a PNG, JPEG, WebP, or GIF image");
      return;
    }
    if (file.size > 8_000_000) {
      toast.error("Image must be under 8 MB");
      return;
    }
    const slideId = slides[index]?.id;
    if (!slideId) return;
    setUploadingIdx(index);
    try {
      const { dataUrl, bytes, compressed } = await compressPromoImage(file, placement);
      setPreviews((prev) => ({ ...prev, [slideId]: dataUrl }));
      setBrokenIds((prev) => prev.filter((id) => id !== slideId));

      // Persist to DB as promoAssets immediately — Save only sends a short /asset/ URL
      // (multi-MB Save was causing intermittent "Failed to save").
      const { data } = await api.post<{
        success: boolean;
        message?: string;
        data?: { imageUrl?: string };
      }>("/admin/promos/upload", { dataUrl });
      const stored = data?.data?.imageUrl?.trim();
      if (!data?.success || !stored) {
        throw new Error(typeof data?.message === "string" ? data.message : "upload failed");
      }
      updateSlide(index, { imageUrl: stored });
      const kb = Math.round(bytes / 1024);
      toast.success(
        compressed
          ? `Image optimized (${kb} KB) — click Save to publish`
          : `Image uploaded (${kb} KB) — click Save to publish`,
      );
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : err instanceof Error
            ? err.message
            : null;
      toast.error(typeof msg === "string" && msg.trim() ? msg : "Image upload failed");
      updateSlide(index, { imageUrl: "" });
      setPreviews((prev) => {
        const next = { ...prev };
        delete next[slideId];
        return next;
      });
    } finally {
      setUploadingIdx(null);
    }
  }

  async function save() {
    for (const s of slides) {
      if (!s.imageUrl.trim()) {
        toast.error("Each slide needs an image — upload or paste a URL");
        return;
      }
    }

    setSaving(true);
    try {
      await api.put("/admin/promos", {
        placement,
        slides: slides.map((s, i) => ({
          id: s.id,
          imageUrl: s.imageUrl.trim(),
          title: s.title.trim(),
          linkUrl: s.linkUrl.trim(),
          active: s.active,
          sortOrder: i,
          placement,
        })),
      });
      const activeCount = slides.filter((s) => s.active).length;
      toast.success(
        `Saved ${slides.length} slides (${activeCount} active) for ${placement === "login" ? "Login" : "Dashboard"}`,
      );
      await load(placement);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : null;
      toast.error(typeof msg === "string" ? msg : "Failed to save promotions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold" style={{ color: B.blue }}>
              <Megaphone size={24} />
              Promotions
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Up to {MAX} slides per placement (Login and Dashboard are separate). Only{" "}
              <strong>Active</strong> slides with a working image show on agent login / dashboard —
              mark Active, then Save.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: B.blue }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Settings-style side tabs */}
          <div className="w-full flex-shrink-0 lg:w-56">
            <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
              {SECTIONS.map((s) => {
                const active = placement === s.id;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPlacement(s.id)}
                    className="flex w-full items-center justify-between border-b px-4 py-3.5 text-left transition-all last:border-b-0"
                    style={{
                      borderColor: B.border,
                      background: active ? `${B.blue}0A` : "transparent",
                      borderLeft: active ? `3px solid ${B.blue}` : "3px solid transparent",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} style={{ color: active ? B.blue : B.muted }} />
                      <span
                        className="text-sm font-semibold"
                        style={{ color: active ? B.blue : B.muted }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <ChevronRight size={13} style={{ color: B.muted }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-4">
            <div
              className="rounded-2xl border bg-white px-4 py-3.5"
              style={{ borderColor: B.border }}
            >
              <h2 className="text-base font-bold" style={{ color: B.blue }}>
                {section.label}
              </h2>
              <p className="mt-1 text-sm" style={{ color: B.muted }}>
                {section.hint}
              </p>
              <div
                className="mt-3 rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border, background: `${B.blue}08`, color: B.muted }}
              >
                <span className="font-semibold" style={{ color: B.blue }}>
                  Image size:
                </span>{" "}
                {section.size}. Format PNG / JPG / WebP. Auto-optimized on upload (high quality,
                target under 1.4 MB). Unchecked Active = hidden on agent. After Upload, click Save.
              </div>
            </div>

            {loading ? (
              <p className="text-sm" style={{ color: B.muted }}>
                Loading…
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {slides.map((slide, index) => {
                  const src = thumbSrc(slide);
                  return (
                  <div
                    key={slide.id}
                    className="rounded-xl border bg-white p-3 shadow-sm"
                    style={{ borderColor: B.border }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold" style={{ color: B.blue }}>
                        Slide {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSlide(index)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>

                    <div className="flex gap-3">
                      <div
                        className="flex h-[88px] w-[88px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50"
                        style={{ borderColor: B.border }}
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={() =>
                              setBrokenIds((prev) =>
                                prev.includes(slide.id) ? prev : [...prev, slide.id],
                              )
                            }
                          />
                        ) : (
                          <span className="px-1 text-center text-[10px] leading-tight" style={{ color: B.muted }}>
                            {slide.imageUrl ? "Re-upload" : "No image"}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <label className="block text-[11px] font-semibold" style={{ color: B.muted }}>
                          Image URL
                          <input
                            value={
                              isStoredUpload(slide.imageUrl)
                                ? "(uploaded image)"
                                : slide.imageUrl
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "(uploaded image)") return;
                              updateSlide(index, { imageUrl: v });
                            }}
                            placeholder="https://… or upload"
                            className="mt-0.5 w-full rounded-md border px-2 py-1 text-xs"
                            style={{ borderColor: B.border }}
                            disabled={isStoredUpload(slide.imageUrl)}
                          />
                        </label>

                        <label
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold"
                          style={{ borderColor: B.border, color: B.blue }}
                        >
                          <Upload size={12} />
                          {uploadingIdx === index ? "Uploading…" : "Upload image"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            disabled={uploadingIdx !== null}
                            onChange={(e) => void onPickFile(index, e.target.files?.[0] ?? null)}
                          />
                        </label>

                        <label className="block text-[11px] font-semibold" style={{ color: B.muted }}>
                          Title
                          <input
                            value={slide.title}
                            onChange={(e) => updateSlide(index, { title: e.target.value })}
                            className="mt-0.5 w-full rounded-md border px-2 py-1 text-xs"
                            style={{ borderColor: B.border }}
                          />
                        </label>

                        <label className="block text-[11px] font-semibold" style={{ color: B.muted }}>
                          Link URL
                          <input
                            value={slide.linkUrl}
                            onChange={(e) => updateSlide(index, { linkUrl: e.target.value })}
                            placeholder="https://…"
                            className="mt-0.5 w-full rounded-md border px-2 py-1 text-xs"
                            style={{ borderColor: B.border }}
                          />
                        </label>

                        <label
                          className="flex items-center gap-1.5 text-xs font-semibold"
                          style={{ color: B.blue }}
                        >
                          <input
                            type="checkbox"
                            checked={slide.active}
                            onChange={(e) => updateSlide(index, { active: e.target.checked })}
                          />
                          Active
                        </label>
                      </div>
                    </div>
                  </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addSlide}
                  disabled={slides.length >= MAX}
                  className="inline-flex min-h-[72px] items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm font-bold disabled:opacity-40 md:col-span-2"
                  style={{ borderColor: B.border, color: B.blue, background: "#fff" }}
                >
                  <Plus size={16} />
                  Add slide ({slides.length}/{MAX})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
