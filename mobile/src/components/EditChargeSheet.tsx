import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { refreshAll } from "../store";
import { colors, font } from "../theme";
import type { ChargeRow } from "../types";

/**
 * Edit vendor, category and notes; resolve the review; save the vendor as an alias for this payee so the agent
 * names it next time. The same fields the dashboard's row sheet has.
 */
export function EditChargeSheet({ row, onClose }: { row: ChargeRow | null; onClose: () => void }) {
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [alias, setAlias] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setVendor(row.vendor ?? "");
    setCategory(row.category ?? "");
    setNotes(row.notes ?? "");
    setAlias(row.needs_review && row.review_reason === "unknown_vendor");
    setReviewed(row.needs_review);
  }, [row]);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await api.editCharge(row.id, { vendor, category, notes, reviewed, save_alias: alias && !!vendor.trim() });
      await refreshAll();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!row} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{row?.amount_label} · {row?.day_label}</Text>
        {row?.payee_raw ? <Text style={styles.raw}>Bank says: {row.payee_raw}</Text> : null}

        <Text style={styles.label}>Vendor</Text>
        <TextInput value={vendor} onChangeText={setVendor} placeholder="Who was this?" placeholderTextColor={colors.faint} style={styles.input} autoCapitalize="words" />
        <Text style={styles.label}>Category</Text>
        <TextInput value={category} onChangeText={setCategory} placeholder="food, shopping, people, transfer:investment…" placeholderTextColor={colors.faint} style={styles.input} autoCapitalize="none" />
        <Text style={styles.label}>Note</Text>
        <TextInput value={notes} onChangeText={setNotes} placeholder="Anything worth remembering" placeholderTextColor={colors.faint} style={[styles.input, styles.multi]} multiline />

        {row?.payee_raw ? (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Remember this payee as {vendor.trim() || "this vendor"}</Text>
              <Text style={styles.switchSub}>Future charges from the same payee get named and categorised automatically.</Text>
            </View>
            <Switch value={alias} onValueChange={setAlias} trackColor={{ true: colors.lime, false: colors.surface2 }} thumbColor={colors.text} />
          </View>
        ) : null}
        {row?.needs_review ? (
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { flex: 1 }]}>Looked at it, all good</Text>
            <Switch value={reviewed} onValueChange={setReviewed} trackColor={{ true: colors.lime, false: colors.surface2 }} thumbColor={colors.text} />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.secondary}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={save} disabled={saving} style={[styles.primary, saving && { opacity: 0.6 }]}>
            <Text style={styles.primaryText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface, padding: 26, paddingTop: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surface2, alignSelf: "center", marginBottom: 18 },
  title: { color: colors.text, fontFamily: font.black, fontSize: 22, letterSpacing: -0.4 },
  raw: { color: colors.muted, fontFamily: font.regular, fontSize: 13, marginTop: 4 },
  label: { color: colors.muted, fontFamily: font.bold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 18, marginBottom: 6 },
  input: { backgroundColor: colors.bg, color: colors.text, fontFamily: font.medium, fontSize: 16, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  multi: { minHeight: 70, textAlignVertical: "top" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18 },
  switchLabel: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
  switchSub: { color: colors.muted, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: "auto", paddingTop: 20 },
  primary: { flex: 1, backgroundColor: colors.lime, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: colors.bg, fontFamily: font.black, fontSize: 15 },
  secondary: { flex: 1, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  secondaryText: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
});
