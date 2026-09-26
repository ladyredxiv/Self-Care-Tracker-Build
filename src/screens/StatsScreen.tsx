import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { DayUsage, todayDateString } from "../db/logic";
import { loadUsageTrend } from "../db/selectors";
import { useScreenPadding } from "../hooks/useScreenPadding";
import { Palette, useThemedStyles } from "../theme";
import { parseDateString } from "../utils/date";

const WINDOW_DAYS = 14;
const CHART_HEIGHT = 140;
const BAR_WIDTH = 28;

export default function StatsScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(createStyles);
  const { paddingTop } = useScreenPadding();
  const [trend, setTrend] = useState<DayUsage[]>([]);

  useFocusEffect(
    useCallback(() => {
      setTrend(loadUsageTrend(WINDOW_DAYS, todayDateString()));
    }, [])
  );

  const daysWithData = trend.filter((d) => d.spent > 0 || d.hasExplicitBudget);
  const avgUtilization =
    daysWithData.length > 0
      ? Math.round(
          (daysWithData.reduce((sum, d) => sum + d.spent / Math.max(d.budget, 1), 0) /
            daysWithData.length) *
            100
        )
      : 0;
  const daysOverBudget = trend.filter((d) => d.spent > d.budget).length;
  const maxScale = Math.max(1, ...trend.map((d) => Math.max(d.budget, d.spent)));

  return (
    <View style={[styles.container, { paddingTop }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backButton}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Budget trends</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.summaryRow}>
        <SummaryStat label="Avg. utilization" value={`${avgUtilization}%`} />
        <SummaryStat label="Over budget" value={`${daysOverBudget} / ${WINDOW_DAYS} days`} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartScroll}
      >
        {trend.map((day) => (
          <DayBar key={day.date} day={day} maxScale={maxScale} />
        ))}
      </ScrollView>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.budgetSwatch]} />
          <Text style={styles.legendText}>Budget</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.spentSwatch]} />
          <Text style={styles.legendText}>Spent (within budget)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.overSwatch]} />
          <Text style={styles.legendText}>Spent (over budget)</Text>
        </View>
      </View>
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function DayBar({ day, maxScale }: { day: DayUsage; maxScale: number }) {
  const styles = useThemedStyles(createStyles);
  const budgetHeight = (day.budget / maxScale) * CHART_HEIGHT;
  const spentHeight = (Math.min(day.spent, day.budget) / maxScale) * CHART_HEIGHT;
  const overHeight = (Math.max(day.spent - day.budget, 0) / maxScale) * CHART_HEIGHT;
  const parsed = parseDateString(day.date);
  const dateLabel = parsed.toLocaleDateString(undefined, { weekday: "short" });
  const dayLabel = parsed.getDate();

  return (
    <View style={styles.dayColumn}>
      <View style={[styles.barTrack, { height: CHART_HEIGHT }]}>
        <View style={[styles.budgetBar, { height: budgetHeight }]} />
        <View style={styles.spentStack}>
          {overHeight > 0 && <View style={[styles.overBar, { height: overHeight }]} />}
          <View style={[styles.spentBar, { height: spentHeight }]} />
        </View>
      </View>
      <Text style={styles.dayLabel}>{dateLabel}</Text>
      <Text style={styles.dayNumber}>{dayLabel}</Text>
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  backButton: { fontSize: 16, color: palette.textPrimary, width: 50 },
  title: { fontSize: 18, fontWeight: "700", color: palette.textPrimary },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  summaryStat: {
    flex: 1,
    backgroundColor: palette.surfaceAlt,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  summaryValue: { fontSize: 22, fontWeight: "700", color: palette.textPrimary },
  summaryLabel: { fontSize: 12, color: palette.textSecondary, marginTop: 4 },
  chartScroll: {
    paddingHorizontal: 16,
    alignItems: "flex-end",
    gap: 10,
  },
  dayColumn: { alignItems: "center", width: BAR_WIDTH },
  barTrack: {
    width: BAR_WIDTH,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  budgetBar: {
    position: "absolute",
    bottom: 0,
    width: BAR_WIDTH,
    backgroundColor: palette.chartBudget,
    borderRadius: 6,
  },
  spentStack: {
    width: BAR_WIDTH - 12,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  spentBar: {
    width: BAR_WIDTH - 12,
    backgroundColor: palette.chartSpent,
    borderRadius: 5,
  },
  overBar: {
    width: BAR_WIDTH - 12,
    backgroundColor: palette.chartOver,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  dayLabel: { fontSize: 11, color: palette.textMuted, marginTop: 8 },
  dayNumber: { fontSize: 12, color: palette.textPrimary, fontWeight: "600" },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    marginTop: 28,
    paddingHorizontal: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  budgetSwatch: { backgroundColor: palette.chartBudget },
  spentSwatch: { backgroundColor: palette.chartSpent },
  overSwatch: { backgroundColor: palette.chartOver },
  legendText: { fontSize: 12, color: palette.textSecondary },
  });
