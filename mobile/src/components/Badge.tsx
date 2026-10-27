import { StyleSheet, Text, View } from "react-native";
import { initials } from "../format";
import { categoryColor, colors, font } from "../theme";

/** A lettered vendor badge, coloured by category. */
export function Badge({ vendor, category, size = 38, muted = false }: { vendor: string | null; category: string | null; size?: number; muted?: boolean }) {
  const c = muted ? { bg: colors.surface2, fg: colors.muted } : categoryColor(category);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg, fontSize: size * 0.38 }]}>{initials(vendor)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", justifyContent: "center" },
  text: { fontFamily: font.black },
});
