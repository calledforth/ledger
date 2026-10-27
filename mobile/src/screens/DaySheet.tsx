import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EditChargeSheet } from "../components/EditChargeSheet";
import { ChargeRow } from "../components/ChargeRow";
import { addDays, formatMoney, longDate } from "../format";
import { colors, font } from "../theme";
import type { ChargeRow as Row, MonthData } from "../types";

/** Spending on one day, with the day before and after one tap away. */
export function DaySheet({ data, date, onClose, onChangeDate }: { data: MonthData; date: string | null; onClose: () => void; onChangeDate: (d: string) => void }) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<Row | null>(null);
  const rows = useMemo(() => (date ? data.rows.filter((r) => r.date === date) : []), [data, date]);
  const spent = useMemo(() => {
    const per: Record<string, number> = {};
    for (const r of rows) if (r.direction === "debit" && !r.is_refunded && !r.category?.toLowerCase().startsWith("transfer:")) per[r.currency] = (per[r.currency] ?? 0) + Number(r.amount);
    return Object.entries(per).map(([c, a]) => formatMoney(a, c)).join(" + ") || "Nothing";
  }, [rows]);
  const highest = date && data.story.highest_day?.date === date;
  const inMonth = (d: string) => d.startsWith(data.month) && d <= data.today;

  if (!date) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.nav}>
          <Pressable onPress={() => inMonth(addDays(date, -1)) && onChangeDate(addDays(date, -1))} hitSlop={12}>
            <Text style={[styles.navText, !inMonth(addDays(date, -1)) && { color: colors.faint }]}>← day before</Text>
          </Pressable>
          <Pressable onPress={() => inMonth(addDays(date, 1)) && onChangeDate(addDays(date, 1))} hitSlop={12}>
            <Text style={[styles.navText, !inMonth(addDays(date, 1)) && { color: colors.faint }]}>day after →</Text>
          </Pressable>
        </View>
        <Text style={styles.date}>{longDate(date)}</Text>
        <Text style={styles.total}>{spent}</Text>
        {highest ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>HIGHEST DAY THIS MONTH</Text>
          </View>
        ) : null}
        <ScrollView style={{ marginTop: 14, marginHorizontal: -26 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {rows.length ? rows.map((r) => <ChargeRow key={r.id} row={r} onEdit={setEditing} />) : <Text style={styles.empty}>No charges on this day.</Text>}
        </ScrollView>
        <Pressable onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <EditChargeSheet row={editing} onClose={() => setEditing(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg, padding: 26, paddingTop: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surface2, alignSelf: "center", marginBottom: 14 },
  nav: { flexDirection: "row", justifyContent: "space-between" },
  navText: { color: colors.muted, fontFamily: font.medium, fontSize: 13 },
  date: { color: colors.muted, fontFamily: font.medium, fontSize: 14, marginTop: 22 },
  total: { color: colors.text, fontFamily: font.black, fontSize: 52, letterSpacing: -2.2, lineHeight: 56, marginTop: 4 },
  pill: { alignSelf: "flex-start", backgroundColor: colors.orange, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  pillText: { color: colors.orangeInk, fontFamily: font.black, fontSize: 11, letterSpacing: 0.6 },
  empty: { color: colors.muted, fontFamily: font.regular, fontSize: 15, paddingHorizontal: 26, paddingTop: 10 },
  close: { backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  closeText: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
});
