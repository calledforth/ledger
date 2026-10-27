import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Card, CardLabel } from "../components/Card";
import { Story } from "../components/Story";
import { addDays, compactMoney, daysInMonth, formatMoney, monthName, shiftMonth, shortDay } from "../format";
import { fetchMonth, useMonth } from "../store";
import { categoryColor, categoryLabel, colors, font } from "../theme";
import type { MonthData } from "../types";
import { DaySheet } from "./DaySheet";
import { HistorySheet } from "./HistorySheet";

const PULL_TO_OPEN = -90;

/**
 * One month, as one scroll: the number, the month in words, where it went, the biggest expense, what's due, what
 * needs a look. Pull down past the top to open every charge; tap anything dated to open that day.
 */
export function MonthScreen({ month, width, onSignOut }: { month: string; width: number; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const { data, error, loading } = useMonth(month);
  const [history, setHistory] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMonth(month, { force: true });
    setRefreshing(false);
  }, [month]);

  const onDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (e.nativeEvent.contentOffset.y < PULL_TO_OPEN && data) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setHistory(true);
    }
  };

  if (!data) {
    return (
      <View style={[styles.screen, { width, paddingTop: insets.top + 80, alignItems: "center" }]}>
        <Text style={styles.monthTitle}>{monthName(month)}</Text>
        {loading ? <ActivityIndicator color={colors.lime} style={{ marginTop: 40 }} /> : null}
        {error ? (
          <>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={refresh} style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
            {/401|signed/i.test(error) ? (
              <Pressable onPress={onSignOut} style={styles.retry}>
                <Text style={styles.retryText}>Sign in again</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { width }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
        onScrollEndDrag={onDragEnd}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.faint} />}
        showsVerticalScrollIndicator={false}
      >
        <Hero data={data} onOpenDay={setDay} />
        <View style={styles.sections}>
          <BiggestExpense data={data} onOpenDay={setDay} />
          <WhereItWent data={data} onOpen={() => setHistory(true)} />
          <Recurring data={data} />
          <NeedsALook data={data} onOpen={() => setHistory(true)} />
          <Closing data={data} />
        </View>
      </ScrollView>
      <HistorySheet data={data} visible={history} onClose={() => setHistory(false)} onOpenDay={(d) => setDay(d)} />
      <DaySheet data={data} date={day} onClose={() => setDay(null)} onChangeDate={setDay} />
    </View>
  );
}

function Hero({ data, onOpenDay }: { data: MonthData; onOpenDay: (d: string) => void }) {
  const current = data.today.slice(0, 7);
  const isCurrent = data.month === current;
  const isFuture = data.month > current;
  const primary = data.summary[0];
  const others = data.summary.slice(1).filter((c) => Number(c.spent) > 0);
  const dayN = isCurrent ? Number(data.today.slice(8, 10)) : null;
  const sub = isFuture ? "next month · what's due" : isCurrent ? `day ${dayN} of ${daysInMonth(data.month)} · swipe for another month` : `closed · ${data.rows.filter((r) => r.direction === "debit" && !r.is_refunded).length} charges`;

  const chips = data.story.by_category.filter((c) => c.currency === (primary?.currency ?? "INR"));

  return (
    <View style={styles.hero}>
      <Text style={styles.pullHint}>↓ pull for every charge</Text>
      <View style={styles.monthRow}>
        <Text style={styles.monthSide}>{monthName(shiftMonth(data.month, -1), true)}</Text>
        <Text style={styles.monthTitle}>{monthName(data.month)}</Text>
        <Text style={styles.monthSide}>{monthName(shiftMonth(data.month, 1), true)}</Text>
      </View>
      <Text style={styles.monthSub}>{sub}</Text>

      {isFuture ? (
        <View style={{ marginTop: 40 }}>
          <Text style={styles.spentLabel}>Expected</Text>
          <Text style={styles.big}>{data.expected.length ? data.expected.map((e) => formatMoney(e.total, e.currency)).join(" + ") : "—"}</Text>
          {data.expected.map((e) => (
            <Text key={e.currency} style={styles.expectedLine}>
              {formatMoney(e.subs, e.currency)} subscriptions · {formatMoney(e.other, e.currency)} other dues
            </Text>
          ))}
        </View>
      ) : (
        <View style={{ marginTop: 40 }}>
          <Text style={styles.spentLabel}>{isCurrent ? "Spent so far" : "Spent"}</Text>
          <Text style={styles.big} adjustsFontSizeToFit numberOfLines={1}>
            {primary ? formatMoney(primary.spent, primary.currency) : "₹0"}
          </Text>
          {others.map((c) => (
            <Text key={c.currency} style={styles.second}>
              + {formatMoney(c.spent, c.currency)}
              <Text style={styles.secondNote}>  kept apart</Text>
            </Text>
          ))}
        </View>
      )}

      <View style={{ marginTop: 30 }}>
        <Story paragraphs={data.story.paragraphs} />
      </View>

      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((c) => {
            const col = categoryColor(c.category);
            return (
              <View key={c.category} style={styles.chip}>
                <View style={[styles.dot, { backgroundColor: col.bg }]} />
                <Text style={styles.chipText}>
                  {categoryLabel(c.category)} <Text style={styles.chipAmt}>{compactMoney(c.amount, c.currency)}</Text>
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {data.note ? (
        <View style={styles.note}>
          <Text style={styles.noteWho}>Ma boi</Text>
          {data.note.split("\n").map((l, i) => (
            <Text key={i} style={styles.noteLine}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}

      {data.story.highest_day && !data.story.biggest_expense ? (
        <Pressable onPress={() => onOpenDay(data.story.highest_day!.date)}>
          <Text style={styles.linkLine}>Highest day: {shortDay(data.story.highest_day.date)} · {data.story.highest_day.amount_label} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BiggestExpense({ data, onOpenDay }: { data: MonthData; onOpenDay: (d: string) => void }) {
  const b = data.story.biggest_expense;
  if (!b) return null;
  const h = data.story.highest_day;
  const sameDay = h?.date === b.date;
  return (
    <Card tone="orange">
      <CardLabel color={colors.orangeDim} right={shortDay(b.date)}>
        Biggest expense
      </CardLabel>
      <Text style={styles.bigOrange}>{b.amount_label}</Text>
      <Text style={styles.orangeVendor}>{b.vendor}</Text>
      <Text style={styles.orangeBody}>
        {categoryLabel(b.category)}. {b.share_pct}% of the month in one charge.
      </Text>
      {h ? (
        <Pressable onPress={() => onOpenDay(h.date)} style={styles.orangeFoot}>
          <Text style={styles.orangeFootLabel}>{sameDay ? "Highest day, same day" : `Highest day, ${shortDay(h.date)}`}</Text>
          <Text style={styles.orangeFootValue}>{h.amount_label} →</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

function WhereItWent({ data, onOpen }: { data: MonthData; onOpen: () => void }) {
  const primary = data.summary[0];
  const cats = data.story.by_category.filter((c) => c.currency === primary?.currency);
  const transfers = data.summary.flatMap((c) => c.transfers_by_category.map((t) => ({ ...t, currency: c.currency })));
  if (!cats.length && !transfers.length) return null;
  return (
    <Card>
      <CardLabel>Where it went</CardLabel>
      {cats.length ? (
        <View style={styles.bar}>
          {cats.map((c) => (
            <View key={c.category} style={{ flex: Math.max(c.pct, 0.5), backgroundColor: categoryColor(c.category).bg }} />
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: 10 }}>
        {cats.map((c) => (
          <Pressable key={c.category} onPress={onOpen} style={styles.catRow}>
            <View style={[styles.dot, { backgroundColor: categoryColor(c.category).bg, width: 12, height: 12 }]} />
            <Text style={styles.catName}>{categoryLabel(c.category)}</Text>
            <Text style={styles.catPct}>{Math.round(c.pct)}%</Text>
            <Text style={styles.catAmt}>{c.amount_label}</Text>
          </Pressable>
        ))}
        {transfers.map((t) => (
          <View key={t.category} style={styles.catRow}>
            <View style={[styles.dot, { backgroundColor: colors.blue, width: 12, height: 12 }]} />
            <Text style={[styles.catName, { color: colors.blue }]}>{categoryLabel(t.category)}</Text>
            <Text style={styles.catPct}>moved</Text>
            <Text style={[styles.catAmt, { color: colors.blue }]}>{formatMoney(t.amount, t.currency)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function Recurring({ data }: { data: MonthData }) {
  const items = useMemo(() => {
    if (!data.weeks) return [];
    const to = addDays(data.today, 7);
    return data.weeks.flatMap((w) => w.items).filter((it) => it.date <= to && it.date >= data.today);
  }, [data]);
  const isCurrent = data.month === data.today.slice(0, 7);
  if (!isCurrent) return null;
  return (
    <Card>
      <CardLabel right={`${data.subs_monthly || "—"}`}>Recurring · next 7 days</CardLabel>
      <View style={{ marginTop: 6 }}>
        {items.length ? (
          items.map((it) => (
            <View key={it.key} style={styles.dueRow}>
              <Text style={styles.dueDay}>{it.day}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.dueVendor}>{it.vendor}</Text>
                <Text style={styles.dueDetail}>{[it.plan, it.detail].filter(Boolean).join(" · ")}</Text>
              </View>
              <Text style={styles.dueAmt}>{it.amount_label}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.quiet}>Nothing due this week.</Text>
        )}
      </View>
    </Card>
  );
}

function NeedsALook({ data, onOpen }: { data: MonthData; onOpen: () => void }) {
  const rows = data.rows.filter((r) => r.needs_review);
  if (!rows.length) return null;
  return (
    <Card tone="review">
      <CardLabel color={colors.reviewText}>Needs a look · {rows.length}</CardLabel>
      <View style={{ marginTop: 6 }}>
        {rows.slice(0, 4).map((r) => (
          <Pressable key={r.id} onPress={onOpen} style={styles.reviewRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dueVendor}>{r.vendor ?? r.payee_raw ?? "Unknown"}</Text>
              <Text style={styles.dueDetail}>
                {r.review_reason === "possible_duplicate" ? "possible duplicate" : r.review_reason === "unknown_vendor" ? "unknown vendor" : "flagged"} · {r.day_label}
              </Text>
            </View>
            <Text style={styles.dueAmt}>{r.amount_label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.reviewHint}>Open the list and hold a row to name it or mark it reviewed.</Text>
    </Card>
  );
}

function Closing({ data }: { data: MonthData }) {
  const vs = data.story.vs_previous;
  const proj = data.story.projected.find((p) => p.currency === data.summary[0]?.currency);
  if (!vs && !proj) return null;
  return (
    <Text style={styles.closing}>
      {vs ? (
        <>
          <Text style={{ color: vs.direction === "under" ? colors.green : vs.direction === "over" ? colors.orange : colors.text }}>{vs.label}</Text>
          {proj ? ". " : "."}
        </>
      ) : null}
      {proj ? (
        <>
          Heading for <Text style={{ color: colors.text, fontFamily: font.black }}>{proj.amount_label}</Text> by month end.
        </>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: 26, paddingBottom: 26 },
  pullHint: { color: colors.faint, fontFamily: font.regular, fontSize: 12, textAlign: "center" },
  monthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 },
  monthSide: { color: colors.faint, fontFamily: font.medium, fontSize: 15 },
  monthTitle: { color: colors.text, fontFamily: font.black, fontSize: 22, letterSpacing: -0.4 },
  monthSub: { color: colors.muted, fontFamily: font.regular, fontSize: 12, textAlign: "center", marginTop: 4 },
  spentLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 14 },
  big: { color: colors.text, fontFamily: font.black, fontSize: 72, letterSpacing: -3.2, lineHeight: 76, marginTop: 6 },
  second: { color: colors.lime, fontFamily: font.black, fontSize: 30, letterSpacing: -0.6, marginTop: 6 },
  secondNote: { color: colors.muted, fontFamily: font.medium, fontSize: 14, letterSpacing: 0 },
  expectedLine: { color: colors.muted, fontFamily: font.regular, fontSize: 14, marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 8, paddingLeft: 10, paddingRight: 12 },
  dot: { width: 10, height: 10, borderRadius: 6 },
  chipText: { color: colors.text, fontFamily: font.bold, fontSize: 13 },
  chipAmt: { fontFamily: font.black },
  note: { marginTop: 18, borderLeftWidth: 2, borderLeftColor: colors.lime, paddingLeft: 12, gap: 4 },
  noteWho: { color: colors.lime, fontFamily: font.bold, fontSize: 12 },
  noteLine: { color: colors.text2, fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  linkLine: { color: colors.lime, fontFamily: font.bold, fontSize: 14, marginTop: 16 },
  sections: { paddingHorizontal: 26, gap: 14 },
  bigOrange: { color: colors.orangeInk, fontFamily: font.black, fontSize: 40, letterSpacing: -1.6, lineHeight: 44, marginTop: 10 },
  orangeVendor: { color: colors.orangeInk, fontFamily: font.bold, fontSize: 16, marginTop: 4 },
  orangeBody: { color: colors.orangeInk, fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginTop: 8 },
  orangeFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#C7461F" },
  orangeFootLabel: { color: colors.orangeDim, fontFamily: font.medium, fontSize: 13 },
  orangeFootValue: { color: colors.orangeInk, fontFamily: font.black, fontSize: 13 },
  bar: { flexDirection: "row", height: 16, borderRadius: 8, overflow: "hidden", marginTop: 14 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  catName: { flex: 1, color: colors.text, fontFamily: font.bold, fontSize: 15 },
  catPct: { color: colors.muted, fontFamily: font.regular, fontSize: 12, width: 44, textAlign: "right" },
  catAmt: { color: colors.text, fontFamily: font.black, fontSize: 15, minWidth: 60, textAlign: "right" },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  dueDay: { color: colors.lime, fontFamily: font.black, fontSize: 18, width: 36 },
  dueVendor: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
  dueDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 12 },
  dueAmt: { color: colors.text, fontFamily: font.black, fontSize: 15 },
  quiet: { color: colors.muted, fontFamily: font.regular, fontSize: 14, paddingTop: 8 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  reviewHint: { color: colors.muted, fontFamily: font.regular, fontSize: 12, marginTop: 8 },
  closing: { color: colors.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 20, paddingHorizontal: 4, paddingTop: 6 },
  error: { color: colors.reviewText, fontFamily: font.medium, fontSize: 14, marginTop: 30, paddingHorizontal: 40, textAlign: "center" },
  retry: { marginTop: 16, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
});
