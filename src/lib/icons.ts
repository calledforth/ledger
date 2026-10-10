import "server-only";
import * as simpleIcons from "simple-icons";

export type VendorIcon = { kind: "svg"; path: string; hex: string; title: string } | { kind: "mono"; letters: string; hue: number };

type SI = { title: string; slug: string; hex: string; path: string };
let index: Map<string, SI> | null = null;

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

// Names people use that differ from the Simple Icons title/slug.
const SYNONYMS: Record<string, string> = {
  appleicloud: "icloud",
  icloudplus: "icloud",
  googleone: "google",
  googleworkspace: "google",
  youtubepremium: "youtube",
  claude: "claude",
  claudeai: "claude",
  anthropicpbc: "anthropic",
  twitter: "x",
  xpremium: "x",
  jiofiber: "jio",
  airtelbroadband: "airtel",
  airtelxstream: "airtel",
};

function getIndex() {
  if (index) return index;
  index = new Map();
  for (const v of Object.values(simpleIcons) as unknown[]) {
    const icon = v as SI;
    if (!icon || typeof icon !== "object" || !("path" in icon)) continue;
    index.set(icon.slug, icon);
    const t = norm(icon.title);
    if (!index.has(t)) index.set(t, icon);
  }
  return index;
}

function lookup(key: string): SI | undefined {
  const idx = getIndex();
  return idx.get(SYNONYMS[key] ?? key) ?? idx.get(key);
}

/** SVG logo from Simple Icons when one exists for the vendor, else a lettered badge with a stable colour. */
export function vendorIcon(vendor: string | null | undefined): VendorIcon | null {
  if (!vendor) return null;
  const full = norm(vendor);
  const first = norm(vendor.split(/[\s.\-_/]+/)[0] ?? "");
  const hit = lookup(full) ?? (first.length >= 3 ? lookup(first) : undefined);
  if (hit) return { kind: "svg", path: hit.path, hex: hit.hex, title: hit.title };
  const words = vendor.trim().split(/\s+/);
  const letters = (words.length > 1 ? words[0][0] + words[1][0] : vendor.slice(0, 2)).toUpperCase();
  let h = 0;
  for (const c of full) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { kind: "mono", letters, hue: h };
}
