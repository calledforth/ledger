import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, font } from "../theme";

export function Card({ children, style, tone = "surface" }: { children: ReactNode; style?: ViewStyle; tone?: "surface" | "orange" | "review" }) {
  return <View style={[styles.card, tone === "orange" && styles.orange, tone === "review" && styles.review, style]}>{children}</View>;
}

export function CardLabel({ children, right, color = colors.muted }: { children: ReactNode; right?: ReactNode; color?: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color }]}>{children}</Text>
      {right ? <Text style={[styles.label, { color }]}>{right}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 22 },
  orange: { backgroundColor: colors.orange },
  review: { backgroundColor: colors.reviewBg, borderWidth: 1, borderColor: colors.reviewLine },
  labelRow: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontFamily: font.bold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
});
