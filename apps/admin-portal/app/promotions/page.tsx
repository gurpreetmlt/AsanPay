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

const MAX = 5;

const SECTIONS = [
  {
    id: "dashboard" as const,
    label: "Dashboard Slider",
    icon: LayoutDashboard,
    hint: "Shows on the agent dashboard promo column.",
    size: "800 × 1200 px (portrait 2:3)",
  },
  {
    id: "login" as const,
    label: "Login screen Slider",
    icon: LogIn,
    hint: "Shows on the left of the agent login page (full panel, auto-fit).",
    size: "1400 × 1800 px (portrait)",
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

  const section = SECTIONS.find((s) => s.id === placement) ?? SECTIONS[0];

  const load = useCallback(async (p: Placement) => {
    setLoading(true);
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
    if (file.size > 1_400_000) {
      toast.error("Image must be under 1.4 MB");
      return;
    }
    setUploadingIdx(index);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      try {
        const res = await api.post<{
          success: boolean;
          data?: { path?: string; imageUrl?: string };
        }>("/admin/promos/upload", { dataUrl });
        const path = res.data?.data?.path || res.data?.data?.imageUrl;
        if (res.data?.success && path) {
          updateSlide(index, { imageUrl: path.startsWith("data:") ? dataUrl : path });
        } else {
          updateSlide(index, { imageUrl: dataUrl });
        }
      } catch {
        updateSlide(index, { imageUrl: dataUrl });
      }
      toast.success("Image ready — click Save to keep it");
    } catch {
      toast.error("Image upload failed");
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
      toast.success("Promotions saved");
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
              Up to {MAX} slides per placement. Active images show on agent dashboard and login.
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
                {section.size}. Format PNG / JPG / WebP. Max <strong style={{ color: B.blue }}>1.4 MB</strong>{" "}
                per image. Mark Active, then Save.
              </div>
            </div>

            {loading ? (
              <p className="text-sm" style={{ color: B.muted }}>
                Loading…
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {slides.map((slide, index) => (
                  <div
                    key={slide.id}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                    style={{ borderColor: B.border }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
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

                    <div className="space-y-3">
                      <div
                        className="flex aspect-[3/4] max-h-52 items-center justify-center overflow-hidden rounded-xl border bg-slate-50"
                        style={{ borderColor: B.border }}
                      >
                        {slide.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolvePromoImageSrc(slide.imageUrl)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="px-2 text-center text-xs" style={{ color: B.muted }}>
                            No image
                          </span>
                        )}
                      </div>

                      <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                        Image URL (optional if you uploaded a file)
                        <input
                          value={
                            slide.imageUrl.startsWith("data:") ||
                            slide.imageUrl.includes("/promos/file/")
                              ? "(uploaded image)"
                              : slide.imageUrl
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "(uploaded image)") return;
                            updateSlide(index, { imageUrl: v });
                          }}
                          placeholder="https://… or upload a file below"
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: B.border }}
                          disabled={
                            slide.imageUrl.startsWith("data:") ||
                            slide.imageUrl.includes("/promos/file/")
                          }
                        />
                      </label>

                      <label
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"
                        style={{ borderColor: B.border, color: B.blue }}
                      >
                        <Upload size={14} />
                        {uploadingIdx === index ? "Uploading…" : "Upload image"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          disabled={uploadingIdx !== null}
                          onChange={(e) => void onPickFile(index, e.target.files?.[0] ?? null)}
                        />
                      </label>

                      <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                        Title (optional)
                        <input
                          value={slide.title}
                          onChange={(e) => updateSlide(index, { title: e.target.value })}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: B.border }}
                        />
                      </label>

                      <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                        Link URL (optional)
                        <input
                          value={slide.linkUrl}
                          onChange={(e) => updateSlide(index, { linkUrl: e.target.value })}
                          placeholder="https://…"
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: B.border }}
                        />
                      </label>

                      <label
                        className="flex items-center gap-2 text-sm font-semibold"
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
                ))}

                <button
                  type="button"
                  onClick={addSlide}
                  disabled={slides.length >= MAX}
                  className="inline-flex min-h-[120px] items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-sm font-bold disabled:opacity-40 md:col-span-2"
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
