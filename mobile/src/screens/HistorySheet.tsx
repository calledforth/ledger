import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChargeRow } from "../components/ChargeRow";
import { EditChargeSheet } from "../components/EditChargeSheet";
import { formatMoney, monthName } from "../format";
import { categoryLabel, colors, font } from "../theme";
import type { ChargeRow as Row, MonthData } from "../types";

type Filter = { key: string; label: string; test: (r: Row) => boolean };

/** Every charge in the month, grouped by day, with filter chips. Reached by pulling the home down. */
export function HistorySheet({ data, visible, onClose, onOpenDay }: { data: MonthData; visible: boolean; onClose: () => void; onOpenDay: (date: string) => void }) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);

  const filters = useMemo<Filter[]>(() => {
    const base: Filter[] = [{ key: "all", label: `All · ${data.rows.length}`, test: () => true }];
    if (data.review_count) base.push({ key: "review", label: `Review · ${data.review_count}`, test: (r) => r.needs_review });
    base.push({ key: "subs", label: "Subs", test: (r) => !!r.subscription });
    const currencies = [...new Set(data.rows.map((r) => r.currency))].filter((c) => c !== "INR");
    for (const c of currencies) base.push({ key: `cur:${c}`, label: c, test: (r) => r.currency === c });
    const cats = [...new Set(data.rows.map((r) => r.category).filter((c): c is string => !!c && !c.startsWith("transfer:")))].sort();
    for (const c of cats) base.push({ key: `cat:${c}`, label: categoryLabel(c), test: (r) => r.category === c });
    return base;
  }, [data]);

  const sections = useMemo(() => {
    const test = filters.find((f) => f.key === filter)?.test ?? (() => true);
    const byDay = new Map<string, Row[]>();
    for (const r of data.rows) if (test(r)) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, rows]) => {
        const per: Record<string, number> = {};
        for (const r of rows) if (r.direction === "debit" && !r.is_refunded && !r.category?.toLowerCase().startsWith("transfer:")) per[r.currency] = (per[r.currency] ?? 0) + Number(r.amount);
        const total = Object.entries(per).map(([c, a]) => formatMoney(a, c)).join(" + ");
        return { date, title: rows[0].day_label, total, data: rows };
      });
  }, [data, filters, filter]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top + 12 }]}>
        <View style={styles.head}>
          <Text style={styles.title}>{monthName(data.month)} · every charge</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.back}>summary ↓</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
          {filters.map((f) => (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipOn]}>
              <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          renderSectionHeader={({ section }) => (
            <Pressable onPress={() => onOpenDay(section.date)} style={styles.dayHead}>
              <Text style={styles.dayTitle}>{section.title}</Text>
              <Text style={styles.dayTotal}>{section.total}</Text>
            </Pressable>
          )}
          renderItem={({ item }) => <ChargeRow row={item} onEdit={setEditing} onPress={() => onOpenDay(item.date)} />}
          ListEmptyComponent={<Text style={styles.empty}>Nothing here.</Text>}
          ListFooterComponent={<Text style={styles.hint}>swipe a row left = refunded · hold = edit or name the vendor</Text>}
        />
      </View>
      <EditChargeSheet row={editing} onClose={() => setEditing(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 26 },
  title: { color: colors.text, fontFamily: font.black, fontSize: 22, letterSpacing: -0.4 },
  back: { color: colors.muted, fontFamily: font.medium, fontSize: 13 },
  chips: { gap: 8, paddingHorizontal: 26, paddingVertical: 14 },
  chip: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.lime },
  chipText: { color: colors.text, fontFamily: font.bold, fontSize: 13 },
  chipTextOn: { color: colors.bg, fontFamily: font.black },
  dayHead: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 26, paddingTop: 16, paddingBottom: 4 },
  dayTitle: { color: colors.text, fontFamily: font.bold, fontSize: 12 },
  dayTotal: { color: colors.muted, fontFamily: font.medium, fontSize: 12 },
  empty: { color: colors.muted, fontFamily: font.regular, fontSize: 15, padding: 26 },
  hint: { color: colors.faint, fontFamily: font.regular, fontSize: 12, textAlign: "center", paddingTop: 24 },
});
