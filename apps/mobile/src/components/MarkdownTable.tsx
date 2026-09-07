import React, { useMemo, useState } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { radii, spacing } from "@manual-samur/design-tokens";
import { columnWidthFor, type MarkdownTable } from "../procedure-logic.ts";
import { useThemedStyles } from "../theme.tsx";


function useStyles() {
  return useThemedStyles((palette) => ({
    tableContainer: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radii.md,
      backgroundColor: palette.surface,
      overflow: "hidden",
    },
    tableScroll: { width: "100%" },
    table: { alignSelf: "flex-start" },
    row: { flexDirection: "row" },
    headerRow: { backgroundColor: palette.surfaceMuted },
    cell: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: palette.line,
    },
    headerCell: { backgroundColor: palette.surfaceMuted },
    cellText: { color: palette.ink, fontSize: 13, lineHeight: 19 },
    headerText: { color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
    scrollHint: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  }));
}

export function MarkdownTable({
  table,
  formatCell,
  testID = "procedure-markdown-table",
}: {
  table: MarkdownTable;
  formatCell?: (value: string) => string;
  testID?: string;
}) {
  const styles = useStyles();
  const [viewportWidth, setViewportWidth] = useState(0);
  const format = formatCell ?? ((value: string) => value);
  const headers = table.headers.map(format);
  const rows = table.rows.map((row) => row.map(format));
  const columnWidths = useMemo(
    () => headers.map((header, index) => columnWidthFor(header, rows.map((row) => row[index] ?? ""))),
    [headers, rows],
  );
  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);
  const showScrollHint = viewportWidth > 0 && tableWidth > viewportWidth;
  const onLayout = (event: LayoutChangeEvent) => setViewportWidth(event.nativeEvent.layout.width);
  const label = `Tabla con ${headers.length} columnas y ${rows.length} filas. Desliza horizontalmente para ver todas las columnas.`;

  return (
    <View testID={testID} style={styles.tableContainer} onLayout={onLayout}>
      <ScrollView
        testID={`${testID}-scroll`}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={styles.tableScroll}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint="Desliza horizontalmente para consultar las columnas que quedan fuera de la pantalla."
      >
        <View style={[styles.table, { width: tableWidth }]}>
          <View style={[styles.row, styles.headerRow]}>
            {headers.map((header, index) => <View key={`header-${index}`} style={[styles.cell, styles.headerCell, { width: columnWidths[index] }]}><Text style={styles.headerText} accessibilityRole="text" accessibilityLabel={`Encabezado: ${header || "Sin título"}`}>{header || "—"}</Text></View>)}
          </View>
          {rows.map((row, rowIndex) => <View key={`row-${rowIndex}`} style={styles.row} accessibilityLabel={`Fila ${rowIndex + 1}`}>
            {row.map((cell, columnIndex) => {
              const header = headers[columnIndex] || `columna ${columnIndex + 1}`;
              return <View key={`cell-${rowIndex}-${columnIndex}`} style={[styles.cell, { width: columnWidths[columnIndex] }]}><Text style={styles.cellText} accessibilityRole="text" accessibilityLabel={`${header}: ${cell || "Vacío"}`}>{cell || "—"}</Text></View>;
            })}
          </View>)}
        </View>
      </ScrollView>
      {showScrollHint && <Text style={styles.scrollHint} accessibilityRole="text">Desliza para ver todas las columnas</Text>}
    </View>
  );
}
