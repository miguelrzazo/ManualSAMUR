import type { PropsWithChildren } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { commonStyles, palette } from "@/constants/theme";

export function Screen({ children, onRefresh, refreshing }: PropsWithChildren<{ onRefresh?: () => void; refreshing?: boolean }>) {
  return (
    <SafeAreaView edges={["top"]} style={commonStyles.screen}>
      <ScrollView
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
