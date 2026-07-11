import type { PropsWithChildren, RefObject } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { commonStyles, palette } from "@/constants/theme";

export function Screen({ children, onRefresh, refreshing, scrollRef }: PropsWithChildren<{ onRefresh?: () => void; refreshing?: boolean; scrollRef?: RefObject<ScrollView | null> }>) {
  return (
    <SafeAreaView edges={["top"]} style={commonStyles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={commonStyles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={palette.blue} /> : undefined}
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ inner: { gap: 12 } });
