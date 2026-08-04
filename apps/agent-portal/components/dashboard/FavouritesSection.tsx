"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import type { CatalogCategoryView } from "@/lib/types";
import { flattenCatalogServices } from "@/lib/catalog";
import { B } from "@/lib/brand";
import { MAX_FAVORITES, selectFavoriteCodes, useFavoritesStore } from "@/lib/favorites";
import { ServiceTile } from "./ServiceTile";

interface Props {
  userId: string;
  categories: CatalogCategoryView[];
  homeEditMode: boolean;
  onEnterEditMode: () => void;
}

export function FavouritesSection({ userId, categories, homeEditMode, onEnterEditMode }: Props) {
  const codes = useFavoritesStore((s) => selectFavoriteCodes(s, userId));
  const remove = useFavoritesStore((s) => s.remove);
  const [open, setOpen] = useState(true);

  const services = useMemo(() => {
    const catalog = flattenCatalogServices(categories);
    return codes
      .map((code) => catalog.find((s) => s.code === code))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [categories, codes]);

  useEffect(() => {
    if (homeEditMode) setOpen(true);
  }, [homeEditMode]);

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-white"
      style={{
        borderColor: homeEditMode ? B.blue : B.green,
        borderWidth: homeEditMode ? 1.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => !homeEditMode && setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{
          background: `${B.green}14`,
          borderBottom: open ? `1px solid ${B.border}` : "none",
        }}
      >
        <div className="flex items-center gap-2">
          <Star size={18} className="fill-[#12B76A] text-[#12B76A]" />
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Favourites
          </h2>
          <span
            className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold"
            style={{ color: B.greenDark }}
          >
            {services.length}
          </span>
        </div>
        {!homeEditMode ? (
          open ? (
            <ChevronUp size={18} style={{ color: B.muted }} />
          ) : (
            <ChevronDown size={18} style={{ color: B.muted }} />
          )
        ) : null}
      </button>

      {open ? (
        <div className="px-2 pb-3 pt-1">
          {services.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs" style={{ color: B.muted }}>
              Kisi bhi service icon par dabaye rakhein — edit mode me ★ se add (max {MAX_FAVORITES})
            </p>
          ) : (
            <>
              {homeEditMode ? (
                <p className="pb-1 text-center text-[11px] font-semibold" style={{ color: B.blue }}>
                  − dabayein favourite se hataane ke liye
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {services.map((s, i) => (
                  <ServiceTile
                    key={s.id}
                    code={s.code}
                    name={s.name}
                    badge={s.badge}
                    icon={s.icon}
                    index={i}
                    isFavorite
                    homeEditMode={homeEditMode}
                    wiggle={homeEditMode}
                    onLongPress={onEnterEditMode}
                    onRemove={() => remove(userId, s.code)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
