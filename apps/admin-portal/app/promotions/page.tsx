"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Megaphone, Plus, Trash2, Upload } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
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
      const res = await api.post<{ success: boolean; data: { imageUrl: string; path: string } }>(
        "/admin/promos/upload",
        { dataUrl },
      );
      const stored = res.data.data.path || res.data.data.imageUrl;
      updateSlide(index, { imageUrl: stored });
      toast.success("Image uploaded");
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploadingIdx(null);
    }
  }

  async function save() {
    const cleaned = slides
      .map((s, i) => ({
        ...s,
        placement,
        sortOrder: i,
        imageUrl: s.imageUrl.trim(),
        title: s.title.trim(),
        linkUrl: s.linkUrl.trim(),
      }))
      .filter((s) => s.imageUrl);

    if (cleaned.length !== slides.filter((s) => s.imageUrl.trim()).length) {
      // ok
    }
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
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold" style={{ color: B.blue }}>
              <Megaphone size={22} />
              Promotions
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Up to {MAX} slides per placement. Dashboard sidebar shows now; login slider is ready to
              wire later.
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

        <div className="flex gap-2 rounded-xl border p-1" style={{ borderColor: B.border }}>
          {(
            [
              { id: "dashboard" as const, label: "Dashboard sidebar" },
              { id: "login" as const, label: "Login screen" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPlacement(tab.id)}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition"
              style={{
                background: placement === tab.id ? B.blue : "transparent",
                color: placement === tab.id ? "#fff" : B.blue,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {placement === "login" ? (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: B.border, background: `${B.blue}08`, color: B.muted }}
          >
            Login slides are saved here. Agent / admin login UI can mount the same slider with
            placement=&quot;login&quot; later — no rework needed.
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : (
          <div className="space-y-4">
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

                <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                  <div
                    className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border bg-slate-50"
                    style={{ borderColor: B.border }}
                  >
                    {slide.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-2 text-center text-xs" style={{ color: B.muted }}>
                        No image
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                      Image URL
                      <input
                        value={slide.imageUrl}
                        onChange={(e) => updateSlide(index, { imageUrl: e.target.value })}
                        placeholder="https://… or /uploads/promos/…"
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: B.border }}
                      />
                    </label>

                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: B.border, color: B.blue }}>
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

                    <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: B.blue }}>
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
            ))}

            <button
              type="button"
              onClick={addSlide}
              disabled={slides.length >= MAX}
              className="inline-flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm font-bold disabled:opacity-40"
              style={{ borderColor: B.border, color: B.blue }}
            >
              <Plus size={16} />
              Add slide ({slides.length}/{MAX})
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
