import { Manrope_400Regular, Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from "@expo-google-fonts/manrope";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { clearToken, loadToken } from "./src/api";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MonthPager } from "./src/screens/MonthPager";
import { clearCache } from "./src/store";
import { colors } from "./src/theme";

/** Today's month in IST, which is what the server counts in. */
function currentMonthIst(): string {
  const d = new Date(Date.now() + 330 * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function App() {
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    loadToken().then((t) => setSignedIn(!!t));
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    clearCache();
    setSignedIn(false);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {!fontsLoaded || signedIn === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.lime} />
          </View>
        ) : signedIn ? (
          <MonthPager current={currentMonthIst()} onSignOut={signOut} />
        ) : (
          <LoginScreen onDone={() => setSignedIn(true)} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
