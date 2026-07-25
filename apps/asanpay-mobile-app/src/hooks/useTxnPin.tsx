import React, { useCallback, useRef, useState } from "react";
import { TxnPinModal } from "../components/TxnPinModal";

// Temporary pre-launch switch. Must match backend REQUIRE_TXN_PIN=false.
// Turn this on before enabling real-money provider traffic.
const TRANSACTION_PIN_ENABLED = false;

export function useTxnPin() {
  const [visible, setVisible] = useState(false);
  const resolver = useRef<((txnAuth: string) => void) | null>(null);
  const rejecter = useRef<(() => void) | null>(null);

  const promptPin = useCallback(
    () => {
      if (!TRANSACTION_PIN_ENABLED) return Promise.resolve("");
      return new Promise<string>((resolve, reject) => {
        resolver.current = resolve;
        rejecter.current = reject;
        setVisible(true);
      });
    },
    [],
  );

  const close = useCallback(() => {
    setVisible(false);
    rejecter.current?.();
    resolver.current = null;
    rejecter.current = null;
  }, []);

  const onVerified = useCallback((txnAuth: string) => {
    setVisible(false);
    resolver.current?.(txnAuth);
    resolver.current = null;
    rejecter.current = null;
  }, []);

  const TxnPinPrompt = useCallback(
    () =>
      TRANSACTION_PIN_ENABLED ? (
        <TxnPinModal visible={visible} onClose={close} onVerified={onVerified} />
      ) : null,
    [visible, close, onVerified],
  );

  return { promptPin, TxnPinPrompt };
}
