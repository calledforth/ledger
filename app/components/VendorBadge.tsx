import type { VendorIcon } from "@/lib/icons";

function isLight(hex: string) {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160;
}

export function VendorBadge({ icon, name, small }: { icon: VendorIcon | null; name?: string | null; small?: boolean }) {
  const cls = `vb${small ? " sm" : ""}`;
  if (!icon) return <span className={`${cls} unknown`} title="Unknown vendor" aria-label="Unknown vendor">?</span>;
  if (icon.kind === "mono")
    return (
      <span className={cls} style={{ background: `hsl(${icon.hue} 38% 42%)` }} title={name ?? undefined} aria-hidden>
        {icon.letters}
      </span>
    );
  return (
    <span className={cls} style={{ background: `#${icon.hex}`, color: isLight(icon.hex) ? "#111" : "#fff" }} title={name ?? icon.title} aria-hidden>
      <svg viewBox="0 0 24 24" role="img">
        <path d={icon.path} />
      </svg>
    </span>
  );
}
