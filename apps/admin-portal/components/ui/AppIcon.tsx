"use client";

import { useEffect, useState } from "react";
import type { NavIconDef } from "@/lib/iconTypes";

type IconComp = React.ComponentType<{ size?: number; className?: string; color?: string }>;

export function AppIcon({
  def,
  size = 18,
  className,
  color,
}: {
  def: NavIconDef;
  size?: number;
  className?: string;
  color?: string;
}) {
  const [Comp, setComp] = useState<IconComp | null>(null);

  useEffect(() => {
    if (def.lib === "lucide") {
      setComp(() => def.icon as IconComp);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const mod =
          def.lib === "fa" ? await import("react-icons/fa") : await import("react-icons/md");
        const I = (mod as unknown as Record<string, IconComp>)[def.name];
        if (!cancelled && I) setComp(() => I);
      } catch {
        if (!cancelled) setComp(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [def]);

  if (def.lib === "lucide") {
    const Lucide = def.icon;
    return <Lucide size={size} className={className} color={color} />;
  }

  if (Comp) return <Comp size={size} className={className} color={color} />;

  return (
    <span className={className} style={{ display: "inline-block", width: size, height: size }} />
  );
}
