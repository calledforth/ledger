import { useEffect, useState } from "react";
import { api } from "./api";
import { shiftMonth } from "./format";
import type { MonthData } from "./types";

/**
 * One cache of months, shared by every screen. A month is fetched once, kept, and refreshed in the background when
 * asked again; the months either side of the visible one are prefetched so a swipe is instant.
 */
type Entry = { data?: MonthData; error?: string; loading: boolean };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();

function emit() {
  for (const l of listeners) l();
}

export function monthEntry(m: string): Entry {
  return cache.get(m) ?? { loading: false };
}

export function fetchMonth(m: string, { force = false } = {}): Promise<void> {
  const cur = cache.get(m);
  if (inflight.has(m)) return inflight.get(m)!;
  if (cur?.data && !force) return Promise.resolve();
  cache.set(m, { ...cur, loading: true });
  emit();
  const p = api
    .month(m)
    .then((data) => {
      cache.set(m, { data, loading: false });
    })
    .catch((e: Error) => {
      cache.set(m, { ...cache.get(m), error: e.message, loading: false });
    })
    .finally(() => {
      inflight.delete(m);
      emit();
    });
  inflight.set(m, p);
  return p;
}

export function prefetchAround(m: string) {
  void fetchMonth(shiftMonth(m, -1));
  void fetchMonth(shiftMonth(m, 1));
}

/** After an edit, refetch the months the app has, newest first, so every view agrees with the server. */
export async function refreshAll() {
  const months = [...cache.keys()].sort().reverse();
  await Promise.all(months.map((m) => fetchMonth(m, { force: true })));
}

export function clearCache() {
  cache.clear();
  emit();
}

export function useMonth(m: string): Entry {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    void fetchMonth(m);
    return () => {
      listeners.delete(l);
    };
  }, [m]);
  return monthEntry(m);
}
