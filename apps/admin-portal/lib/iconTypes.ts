import type { LucideIcon } from "lucide-react";

/** Lucide + Font Awesome (fa) + Material Design (md) via react-icons */
export type NavIconDef =
  | { lib: "lucide"; icon: LucideIcon }
  | { lib: "fa"; name: string }
  | { lib: "md"; name: string };
