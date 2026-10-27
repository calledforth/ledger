/** The Stack palette: a dark ground, lime for the second currency, orange for the one thing that matters most. */
export const colors = {
  bg: "#121212",
  surface: "#1E1E1E",
  surface2: "#2A2A2A",
  line: "#2A2A2A",
  text: "#F5F5F2",
  text2: "#D8D8D3",
  muted: "#A3A39E",
  faint: "#5F5F5A",
  lime: "#D4FF4F",
  orange: "#E8532B",
  orangeInk: "#1A0E08",
  orangeDim: "#5C2412",
  green: "#7EE2A8",
  blue: "#8FB6FF",
  purple: "#B49CFF",
  yellow: "#FFD166",
  pink: "#FF8FB1",
  reviewBg: "#2A1A14",
  reviewLine: "#5A3626",
  reviewText: "#F2A58A",
};

export const font = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  bold: "Manrope_700Bold",
  black: "Manrope_800ExtraBold",
};

const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  home: { bg: colors.text, fg: colors.bg },
  rent: { bg: colors.text, fg: colors.bg },
  shopping: { bg: colors.orange, fg: colors.orangeInk },
  people: { bg: colors.purple, fg: colors.bg },
  food: { bg: colors.yellow, fg: colors.bg },
  software: { bg: colors.blue, fg: colors.bg },
  transport: { bg: colors.green, fg: colors.bg },
  utilities: { bg: "#9A9A94", fg: colors.bg },
  entertainment: { bg: colors.pink, fg: colors.bg },
  subscription: { bg: colors.text, fg: colors.bg },
  health: { bg: "#7ED9E2", fg: colors.bg },
  travel: { bg: colors.orange, fg: colors.orangeInk },
  uncategorized: { bg: colors.faint, fg: colors.text },
};
const FALLBACK = [colors.blue, colors.green, colors.purple, colors.yellow, colors.pink, "#7ED9E2"];

/** A stable colour per category: the known ones by name, anything else by hash. */
export function categoryColor(category: string | null | undefined): { bg: string; fg: string } {
  const k = (category ?? "uncategorized").toLowerCase();
  if (CATEGORY_COLORS[k]) return CATEGORY_COLORS[k];
  if (k.startsWith("transfer:")) return { bg: colors.blue, fg: colors.bg };
  if (k.startsWith("income:")) return { bg: colors.green, fg: colors.bg };
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { bg: FALLBACK[h % FALLBACK.length], fg: colors.bg };
}

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "Other";
  const c = category.replace(/^transfer:/, "").replace(/^income:/, "");
  return c.charAt(0).toUpperCase() + c.slice(1);
}
