import * as SecureStore from "expo-secure-store";
import type { MonthData } from "./types";

/**
 * Where the web app lives. EXPO_PUBLIC_API_URL (see .env.example) is the build-time default; the sign-in screen lets
 * you type another, kept on the device, so one build works against any deployment.
 */
export const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
let apiUrl = DEFAULT_API_URL;
export const apiUrlNow = () => apiUrl;

const TOKEN_KEY = "ledger_session_token";
const URL_KEY = "ledger_api_url";
let token: string | null = null;

export async function loadToken(): Promise<string | null> {
  const [t, u] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(URL_KEY)]);
  if (u) apiUrl = u;
  token = t;
  return token;
}

export async function setApiUrl(url: string) {
  apiUrl = url.trim().replace(/\/$/, "");
  if (apiUrl && !/^https?:\/\//.test(apiUrl)) apiUrl = `https://${apiUrl}`;
  await SecureStore.setItemAsync(URL_KEY, apiUrl);
}

export async function clearToken() {
  token = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new ApiError(0, "Set the server address on the sign-in screen");
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") await clearToken();
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  async login(password: string): Promise<void> {
    const r = await call<{ token: string }>("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    token = r.token;
    await SecureStore.setItemAsync(TOKEN_KEY, r.token);
  },
  month(m: string): Promise<MonthData> {
    return call<MonthData>(`/api/month?m=${m}`);
  },
  editCharge(id: string, patch: { vendor?: string | null; category?: string | null; notes?: string | null; reviewed?: boolean; save_alias?: boolean; refunded?: boolean }) {
    return call<{ ok: true }>(`/api/charges/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  editSubscription(id: string, body: { action: "cancel"; cancelled_on?: string | null; ended_at?: string | null } | { action: "set_end"; ended_at: string | null }) {
    return call<{ ok: true }>(`/api/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  signedIn: () => !!token,
};
