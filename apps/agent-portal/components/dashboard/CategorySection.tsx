"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CatalogCategoryView } from "@/lib/types";
import { DesignIcon, categoryIconToDesignKey } from "@/lib/designIcons";
import { MAX_FAVORITES, selectFavoriteCodes, useFavoritesStore } from "@/lib/favorites";
import { ServiceTile } from "./ServiceTile";

interface Props {
  category: CatalogCategoryView;
  userId: string;
  defaultOpen?: boolean;
  homeEditMode: boolean;
  onEnterEditMode: () => void;
}

export function CategorySection({
  category,
  userId,
  defaultOpen = true,
  homeEditMode,
  onEnterEditMode,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const favoriteCodes = useFavoritesStore((s) => selectFavoriteCodes(s, userId));
  const toggle = useFavoritesStore((s) => s.toggle);
  const headerIcon = categoryIconToDesignKey(category.icon);

  useEffect(() => {
    if (homeEditMode) setOpen(true);
  }, [homeEditMode]);

  function handleAddFavorite(code: string) {
    if (favoriteCodes.includes(code)) return;
    const result = toggle(userId, code);
    if (result.limitReached) toast.error(`Maximum ${MAX_FAVORITES} favourites.`);
  }

  return (
    <section className={clsx("overflow-hidden rounded-2xl border bg-card", homeEditMode ? "border-brand-100" : "border-border-subtle")}>
      <button
        type="button"
        onClick={() => !homeEditMode && setOpen((v) => !v)}
        className={clsx("flex w-full items-center justify-between px-4 py-3 text-left", open && "border-b border-border-subtle")}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "#EEF3FF" }}
          >
            <DesignIcon name={headerIcon} size={18} color="#2A5CDD" />
          </span>
          <h2 className="text-base font-bold text-gray-900">{category.name}</h2>
        </div>
        {!homeEditMode ? (
          open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />
        ) : null}
      </button>

      {open ? (
        <div className="grid grid-cols-3 gap-1 px-2 pb-3 pt-1 sm:grid-cols-4 md:grid-cols-6">
          {category.services.map((service, i) => (
            <ServiceTile
              key={service.id}
              code={service.code}
              name={service.name}
              badge={service.badge}
              icon={service.icon}
              index={i}
              isFavorite={favoriteCodes.includes(service.code)}
              homeEditMode={homeEditMode}
              onLongPress={onEnterEditMode}
              onAdd={() => handleAddFavorite(service.code)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
