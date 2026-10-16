import type { ReactNode } from "react";

/** Brand danger red for required-field asterisks. */
export const REQUIRED_STAR_COLOR = "#DC2626";

export function RequiredMark() {
  return (
    <span style={{ color: REQUIRED_STAR_COLOR }} aria-hidden="true">
      {" "}
      *
    </span>
  );
}

/** Renders a label; trailing ` *` becomes a red required mark. */
export function LabelText({ label }: { label: string }): ReactNode {
  const m = /^(.*?)\s*\*\s*$/.exec(label);
  if (!m) return label;
  return (
    <>
      {m[1]}
      <RequiredMark />
    </>
  );
}
