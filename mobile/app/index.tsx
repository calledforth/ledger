import { Text, View } from "react-native";

/** Stub. Direction not chosen yet — see mobile/mocks. */
export default function Home() {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0c0c0f" }}>
      <Text style={{ color: "#c9a24a", letterSpacing: 2, fontSize: 12 }}>LEDGER</Text>
      <Text style={{ color: "#ece8e1", fontSize: 28, marginTop: 8 }}>Mocks first.</Text>
      <Text style={{ color: "#9a948a", marginTop: 12, lineHeight: 22 }}>
        Open mobile/mocks in a browser. Pick a direction before this shell becomes a real Expo app.
      </Text>
    </View>
  );
}
