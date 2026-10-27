import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import * as Haptics from "expo-haptics";
import { api } from "../api";
import { refreshAll } from "../store";
import { categoryLabel, colors, font } from "../theme";
import type { ChargeRow as Row } from "../types";
import { Badge } from "./Badge";

/**
 * One charge. Swipe left to mark it refunded (with a confirm), press to open it, long-press to edit.
 */
export function ChargeRow({ row, onPress, onEdit }: { row: Row; onPress?: (row: Row) => void; onEdit?: (row: Row) => void }) {
  const isTransfer = !!row.category?.toLowerCase().startsWith("transfer:");
  const amountColor = row.is_refunded ? colors.faint : row.needs_review ? colors.reviewText : row.direction === "credit" ? colors.green : isTransfer ? colors.blue : colors.text;
  const subtitle = [row.subscription ?? categoryLabel(row.category), row.needs_review ? (row.review_reason === "possible_duplicate" ? "possible duplicate" : row.review_reason === "unknown_vendor" ? "unknown vendor · hold to name" : "needs a look") : row.channel, row.time_label]
    .filter(Boolean)
    .join(" · ");

  const refund = () => {
    if (row.direction !== "debit" || row.is_refunded) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Mark refunded?", `${row.vendor ?? row.payee_raw ?? "This charge"} ${row.amount_label} will be left out of spending.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Refunded",
        style: "destructive",
        onPress: () =>
          api
            .editCharge(row.id, { refunded: true })
            .then(refreshAll)
            .catch((e: Error) => Alert.alert("Couldn't save", e.message)),
      },
    ]);
  };

  const body = (
    <Pressable onPress={() => onPress?.(row)} onLongPress={() => onEdit?.(row)} delayLongPress={350} style={({ pressed }) => [styles.row, row.needs_review && styles.review, pressed && { opacity: 0.7 }]}>
      <Badge vendor={row.vendor ?? row.payee_raw} category={row.direction === "credit" ? "income:" : row.category} muted={row.is_refunded} />
      <View style={styles.mid}>
        <Text numberOfLines={1} style={[styles.vendor, row.is_refunded && styles.struck]}>
          {row.vendor ?? row.payee_raw ?? "Unknown"}
        </Text>
        <Text numberOfLines={1} style={styles.sub}>
          {row.is_refunded ? "refunded" : subtitle}
        </Text>
      </View>
      <Text style={[styles.amount, { color: amountColor }, row.is_refunded && styles.struck]}>
        {row.direction === "credit" ? row.amount_label : isTransfer ? row.amount_label : `−${row.amount_label}`}
      </Text>
    </Pressable>
  );

  if (row.direction !== "debit" || row.is_refunded) return body;
  return (
    <Swipeable
      friction={2}
      rightThreshold={64}
      overshootRight={false}
      onSwipeableOpen={(dir: "left" | "right", s: { close: () => void }) => {
        s.close();
        if (dir === "right") refund();
      }}
      renderRightActions={() => (
        <View style={styles.action}>
          <Text style={styles.actionText}>Refunded</Text>
        </View>
      )}
    >
      {body}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 26, backgroundColor: colors.bg },
  review: { backgroundColor: colors.reviewBg },
  mid: { flex: 1, minWidth: 0 },
  vendor: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
  sub: { color: colors.muted, fontFamily: font.regular, fontSize: 12, marginTop: 1 },
  amount: { fontFamily: font.black, fontSize: 15 },
  struck: { textDecorationLine: "line-through", color: colors.faint },
  action: { justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 22, backgroundColor: colors.orange, width: 120 },
  actionText: { color: colors.orangeInk, fontFamily: font.black, fontSize: 13 },
});
