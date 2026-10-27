import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, apiUrlNow, setApiUrl } from "../api";
import { colors, font } from "../theme";

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [server, setServer] = useState(apiUrlNow());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password || !server.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setApiUrl(server);
      await api.login(password);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.screen, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 30 }]}>
      <Text style={styles.brand}>Ledger</Text>
      <Text style={styles.tag}>Your charges, in words.</Text>
      <View style={{ marginTop: "auto" }}>
        <Text style={styles.label}>Server</Text>
        <TextInput
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://your-ledger.vercel.app"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
        <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoFocus={!!server}
          autoCapitalize="none"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          placeholder="The dashboard password"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={submit} disabled={busy || !password || !server.trim()} style={[styles.button, (busy || !password || !server.trim()) && { opacity: 0.5 }]}>
          <Text style={styles.buttonText}>{busy ? "Checking…" : "Sign in"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 26 },
  brand: { color: colors.text, fontFamily: font.black, fontSize: 44, letterSpacing: -1.8 },
  tag: { color: colors.muted, fontFamily: font.regular, fontSize: 15, lineHeight: 22, marginTop: 10 },
  label: { color: colors.muted, fontFamily: font.bold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  input: { backgroundColor: colors.surface, color: colors.text, fontFamily: font.medium, fontSize: 17, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  error: { color: colors.reviewText, fontFamily: font.medium, fontSize: 13, marginTop: 10 },
  button: { backgroundColor: colors.lime, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 14 },
  buttonText: { color: colors.bg, fontFamily: font.black, fontSize: 16 },
});
