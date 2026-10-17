"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { allowAgentAuthUiSkip } from "@/lib/allowAgentAuthUiSkip";

type Props = {
  /** Short service name for the toast, e.g. "AePS" */
  serviceLabel: string;
  onSkip: () => void;
};

/** Dev / staging only — unlocks the service UI for the browser session. */
export function AgentAuthUiSkipButton({ serviceLabel, onSkip }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(allowAgentAuthUiSkip());
  }, []);

  if (!visible) return null;

  return (
    <div className="space-y-2 pt-1">
      <PrimaryButton
        type="button"
        variant="secondary"
        showArrow={false}
        onClick={() => {
          onSkip();
          toast(
            `${serviceLabel} UI unlocked for this session only. Real transactions still need fingerprint verification.`,
            { duration: 8000 },
          );
        }}
      >
        Skip for now (dev)
      </PrimaryButton>
      <p className="text-center text-[11px] font-medium leading-relaxed text-amber-700">
        Dev only — does not unlock provider login. Money moves will still fail until Scan Finger
        succeeds.
      </p>
    </div>
  );
}
