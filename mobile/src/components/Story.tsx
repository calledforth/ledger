import { StyleSheet, Text, View } from "react-native";
import { colors, font } from "../theme";
import type { Segment, Tone } from "../types";

const TONE: Record<Tone, { color: string; fontFamily: string }> = {
  plain: { color: colors.text2, fontFamily: font.regular },
  strong: { color: colors.text, fontFamily: font.black },
  in: { color: colors.green, fontFamily: font.black },
  invest: { color: colors.blue, fontFamily: font.black },
  out: { color: colors.orange, fontFamily: font.black },
};

/** The month in words. Each paragraph is a run of segments; the tone colours the numbers. */
export function Story({ paragraphs, size = 17 }: { paragraphs: Segment[][]; size?: number }) {
  return (
    <View style={styles.wrap}>
      {paragraphs.map((p, i) => (
        <Text key={i} style={[styles.p, { fontSize: size, lineHeight: size * 1.5 }]}>
          {p.map((s, j) => (
            <Text key={j} style={TONE[s.tone ?? "plain"]}>
              {s.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  p: { color: colors.text2, fontFamily: font.regular },
});
