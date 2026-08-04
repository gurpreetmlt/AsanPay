/** Public marketing site URLs → Agent Web (`apps/agent-portal`). */
export const AGENT_WEB_URL =
  process.env.NEXT_PUBLIC_AGENT_WEB_URL?.replace(/\/$/, "") || "https://dev.asanpay.in";

export const AGENT_LOGIN_URL = `${AGENT_WEB_URL}/login`;
export const AGENT_SIGNUP_URL = `${AGENT_WEB_URL}/signup`;
