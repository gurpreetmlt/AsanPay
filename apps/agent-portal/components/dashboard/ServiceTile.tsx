"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import clsx from "clsx";
import { Minus, Star } from "lucide-react";
import { serviceIconPath } from "@asanpay/shared-types";
import { designTileColors } from "@/lib/designIcons";
import { useLongPress } from "@/lib/useLongPress";

const AEPS_TAB_MAP: Record<string, string> = {
  CASH_WITHDRAW: "Withdraw",
  MINI_STATEMENT: "Mini Statement",
  CASH_DEPOSIT: "Deposit",
  BALANCE_ENQUIRY: "Balance Enquiry",
};

interface ServiceTileProps {
  code: string;
  name: string;
  badge?: string | null;
  /** SVG filename from catalog API, e.g. "Aeps.svg" */
  icon?: string | null;
  /** Palette index — matches mobile tile color rotation */
  index?: number;
  isFavorite?: boolean;
  homeEditMode?: boolean;
  wiggle?: boolean;
  onLongPress?: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
}

export function ServiceTile({
  code,
  name,
  badge,
  icon,
  index = 0,
  isFavorite = false,
  homeEditMode = false,
  wiggle = false,
  onLongPress,
  onAdd,
  onRemove,
}: ServiceTileProps) {
  const router = useRouter();
  const tile = designTileColors(index, false);
  const assetSrc = serviceIconPath(icon);
  const [assetFailed, setAssetFailed] = useState(false);
  const showAsset = Boolean(assetSrc) && !assetFailed;
  const isNew = badge === "NEW";
  const longPressHandlers = useLongPress(() => {
    if (!homeEditMode) onLongPress?.();
  });

  const showRemove = homeEditMode && isFavorite && !!onRemove;
  const showAdd = homeEditMode && !isFavorite && !!onAdd;

  function openService() {
    if (homeEditMode) return;
    const aepsTab = AEPS_TAB_MAP[code];
    if (aepsTab) {
      router.push(`/aeps?tab=${encodeURIComponent(aepsTab)}`);
      return;
    }
    if (code === "UPI_CASH_POINT") {
      router.push("/upi-cash-point");
      return;
    }
    if (code === "MONEY_TRANSFER" || code === "DMT") {
      router.push("/dmt");
      return;
    }
    if (code === "NEPAL" || code === "NEPAL_REMITTANCE") {
      router.push("/nepal");
      return;
    }
    toast(`${name} — coming soon`, { icon: "🚧" });
  }

  return (
    <div className={clsx("relative flex flex-col items-center p-2 pt-3", wiggle && homeEditMode && "animate-pulse")}>
      {showRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute left-1 top-0 z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-red-500 text-white shadow-sm"
          aria-label="Remove"
        >
          <Minus size={11} strokeWidth={3.2} />
        </button>
      ) : null}

      {showAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="absolute left-1 top-0 z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-green-500 text-white shadow-sm"
          aria-label="Add to favourites"
        >
          <Star size={11} fill="white" strokeWidth={2.2} />
        </button>
      ) : null}

      <button
        type="button"
        onClick={openService}
        {...(onLongPress && !homeEditMode ? longPressHandlers : {})}
        className={clsx(
          "relative flex w-full flex-col items-center gap-2 rounded-lg p-2 text-center transition select-none",
          !homeEditMode && "hover:bg-surface",
        )}
      >
        {badge ? (
          <span
            className={clsx(
              "absolute top-0 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none",
              isNew ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
            )}
          >
            {badge}
          </span>
        ) : null}
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: showAsset ? "transparent" : tile.bg }}
        >
          {showAsset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetSrc!}
              alt=""
              className="h-9 w-9 object-contain"
              onError={() => setAssetFailed(true)}
            />
          ) : null}
        </span>
        <span className="text-xs font-medium leading-tight text-gray-700">{name}</span>
      </button>
    </div>
  );
}
