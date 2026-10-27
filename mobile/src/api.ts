import * as SecureStore from "expo-secure-store";
import type { MonthData } from "./types";

/** Where the web app lives. Set EXPO_PUBLIC_API_URL in .env (see .env.example). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

const TOKEN_KEY = "ledger_session_token";
let token: string | null = null;

export async function loadToken(): Promise<string | null> {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
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
  if (!API_URL) throw new ApiError(0, "EXPO_PUBLIC_API_URL is not set");
  const res = await fetch(`${API_URL}${path}`, {
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
