import { api } from "./api";
import { getDeviceId } from "./deviceId";

export interface PendingLoginApproval {
  id: string;
  browser: string | null;
  ip: string | null;
  city: string | null;
  loginMethod: string;
  /** Three 2-digit numbers; one matches the number on the web screen. */
  choices: number[];
  createdAt: string;
  expiresAt: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Push arrived / was tapped — the host re-fetches pending web login requests. */
export function notifyLoginApprovalPush(): void {
  listeners.forEach((l) => l());
}

export function onLoginApprovalPush(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isLoginApprovalMessage(data: Record<string, unknown> | undefined): boolean {
  return data?.type === "login_approval";
}

export async function fetchPendingLoginApprovals(): Promise<PendingLoginApproval[]> {
  const { data } = await api.get<{ data: { approvals: PendingLoginApproval[] } }>("/auth/login-approvals/pending");
  return data.data.approvals ?? [];
}

export async function decideLoginApproval(
  id: string,
  decision: "approve" | "deny",
  matchNumber?: number,
): Promise<"approved" | "denied"> {
  const deviceId = await getDeviceId();
  const { data } = await api.post<{ data: { status: "approved" | "denied" } }>(
    `/auth/login-approval/${id}/decide`,
    { decision, ...(decision === "approve" ? { matchNumber } : {}), deviceId },
  );
  return data.data.status;
}
