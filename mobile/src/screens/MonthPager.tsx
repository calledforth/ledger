import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, useWindowDimensions } from "react-native";
import { shiftMonth } from "../format";
import { prefetchAround } from "../store";
import { MonthScreen } from "./MonthScreen";

const MONTHS_BACK = 24;

/** Months side by side, one per page. Swipe right for last month, left for next; the current month is the start. */
export function MonthPager({ current, onSignOut }: { current: string; onSignOut: () => void }) {
  const { width } = useWindowDimensions();
  const months = useMemo(() => Array.from({ length: MONTHS_BACK + 2 }, (_, i) => shiftMonth(current, i - MONTHS_BACK)), [current]);
  const [visible, setVisible] = useState(current);
  const viewability = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewable = useRef(({ viewableItems }: { viewableItems: { item: string }[] }) => {
    const m = viewableItems[0]?.item;
    if (m) {
      setVisible(m);
      prefetchAround(m);
    }
  });

  const render = useCallback(({ item }: { item: string }) => <MonthScreen month={item} width={width} onSignOut={onSignOut} />, [width, onSignOut]);

  return (
    <FlatList
      data={months}
      keyExtractor={(m) => m}
      horizontal
      pagingEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={MONTHS_BACK}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      renderItem={render}
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={1}
      removeClippedSubviews
      onViewableItemsChanged={onViewable.current}
      viewabilityConfig={viewability.current}
      extraData={visible}
    />
  );
}
