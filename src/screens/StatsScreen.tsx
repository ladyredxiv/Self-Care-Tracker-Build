import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { DayUsage, describePayback, todayDateString } from "../db/logic";
import { Insights, loadInsights, loadSleepInsight, loadUsageTrend } from "../db/selectors";
import { describeSleep, formatSleepDuration, SleepInsight } from "../utils/sleepInsight";
import { useScreenPadding } from "../hooks/useScreenPadding";
import { Palette, useThemedStyles } from "../theme";
import { parseDateString } from "../utils/date";
import AppTabBar from "../components/AppTabBar";
import StorybookHeader from "../components/StorybookHeader";

const WINDOW_DAYS = 14;
/** Wider than the chart: payback needs enough overspends with ratings after them. */
const INSIGHT_DAYS = 30;
const CHART_HEIGHT = 140;
const BAR_WIDTH = 28;

export default function StatsScreen() {
  const styles = useThemedStyles(createStyles);
  const { paddingTop } = useScreenPadding();
  const [trend, setTrend] = useState<DayUsage[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [sleep, setSleep] = useState<SleepInsight | null>(null);

  useFocusEffect(
    useCallback(() => {
      const today = todayDateString();
      setTrend(loadUsageTrend(WINDOW_DAYS, today));
      setInsights(loadInsights(INSIGHT_DAYS, today));
      // Resolves later, or never on a device without Health Connect; the rest of
      // the screen doesn't wait for it.
      void loadSleepInsight(INSIGHT_DAYS, today).then(setSleep).catch(() => setSleep(null));
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
    <View style={styles.screen}>
    <ScrollView
      style={[styles.container, { paddingTop }]}
      contentContainerStyle={styles.scrollContent}
    >
      <StorybookHeader title="Budget trends" subtitle="A gentle read of your last 30 days" />

      <View style={styles.summaryRow}>
        <SummaryStat label="Avg. utilization" value={`${avgUtilization}%`} />
        <SummaryStat label="Over budget" value={`${daysOverBudget} / ${WINDOW_DAYS}`} />
        <SummaryStat
          label="Usual capacity"
          value={insights?.avgCapacity == null ? "—" : insights.avgCapacity.toFixed(1)}
        />
      </View>

      <View style={styles.chartRow}>
        <ChartAxis maxScale={maxScale} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chartScroll}
        >
          {trend.map((day) => (
            <DayBar key={day.date} day={day} maxScale={maxScale} />
          ))}
        </ScrollView>
      </View>

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

      {insights && <InsightsSection insights={insights} />}
      {sleep && sleep.comparableDays > 0 && <SleepSection insight={sleep} />}
    </ScrollView>
    <AppTabBar active="trends" />
    </View>
  );
}

function InsightsSection({ insights }: { insights: Insights }) {
  const styles = useThemedStyles(createStyles);
  const { payback, categories, costSuggestions, avgCapacity, avgSpent } = insights;
  const heaviest = categories.slice(0, 4);
  const totalCategorySpend = categories.reduce((sum, c) => sum + c.spent, 0);

  return (
    <View style={styles.insights}>
      <Text style={styles.insightHeading}>Last {INSIGHT_DAYS} days</Text>

      <View style={styles.insightRow}>
        <Text style={styles.insightLabel}>Usual capacity</Text>
        <Text style={styles.insightValue}>
          {avgCapacity === null ? "—" : avgCapacity.toFixed(1)}
        </Text>
      </View>
      <View style={styles.insightRow}>
        <Text style={styles.insightLabel}>Usually spent</Text>
        <Text style={styles.insightValue}>
          {avgSpent === null ? "—" : avgSpent.toFixed(1)}
        </Text>
      </View>
      <View style={styles.insightRow}>
        <Text style={styles.insightLabel}>Days over budget</Text>
        <Text style={styles.insightValue}>{payback.overBudgetDays}</Text>
      </View>
      <View style={styles.insightRow}>
        <Text style={styles.insightLabel}>Days rated</Text>
        <Text style={styles.insightValue}>{payback.ratedDays}</Text>
      </View>

      <Text style={styles.insightHeading}>Does overspending catch up?</Text>
      <Text style={styles.insightBody}>{describePayback(payback)}</Text>
      {payback.hasEnoughData && (
        <Text style={styles.insightCaveat}>
          A pattern in your own numbers, not a diagnosis — plenty else affects how a
          day goes.
        </Text>
      )}

      {costSuggestions.length > 0 && (
        <>
          <Text style={styles.insightHeading}>Worth re-costing?</Text>
          <Text style={styles.insightCaveat}>
            What these have actually been taking, against what they're set to. Nothing
            changes unless you edit them.
          </Text>
          {costSuggestions.slice(0, 4).map((suggestion) => (
            <View key={suggestion.taskId} style={styles.insightRow}>
              <Text style={styles.insightLabel} numberOfLines={1}>
                {suggestion.name}
              </Text>
              <Text style={styles.insightValue}>
                {suggestion.configuredCost} → {suggestion.averageSpent.toFixed(1)}
              </Text>
            </View>
          ))}
        </>
      )}

      {heaviest.length > 0 && (
        <>
          <Text style={styles.insightHeading}>Where the energy goes</Text>
          {heaviest.map((entry) => (
            <View key={entry.category} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={1}>
                {entry.category}
              </Text>
              <View style={styles.barTrackH}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${
                        totalCategorySpend === 0
                          ? 0
                          : Math.round((entry.spent / totalCategorySpend) * 100)
                      }%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barValue}>{entry.spent}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function SleepSection({ insight }: { insight: SleepInsight }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.insights}>
      <Text style={styles.insightHeading}>Sleep</Text>
      <View style={styles.insightRow}>
        <Text style={styles.insightLabel}>Usual night</Text>
        <Text style={styles.insightValue}>
          {insight.averageSleepHours === null
            ? "—"
            : formatSleepDuration(insight.averageSleepHours)}
        </Text>
      </View>
      <Text style={styles.insightBody}>{describeSleep(insight)}</Text>
      {insight.hasEnoughData && (
        <Text style={styles.insightCaveat}>
          Read from Health Connect for context only — it never sets your capacity,
          and it isn't stored by this app or included in backups.
        </Text>
      )}
    </View>
  );
}

/**
 * Y-axis ticks for the chart.
 *
 * Without these the bars show relative heights with no idea of scale — a bar
 * twice as tall could be two spoons or twenty. Rounded to a sensible step so the
 * labels are whole numbers rather than arbitrary fractions of the maximum.
 */
function ChartAxis({ maxScale }: { maxScale: number }) {
  const styles = useThemedStyles(createStyles);
  const step = maxScale <= 6 ? 2 : maxScale <= 15 ? 5 : 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(maxScale / step) * step; value >= 0; value -= step) {
    ticks.push(value);
  }

  return (
    <View style={styles.axis} pointerEvents="none">
      {ticks.map((value) => (
        <View key={value} style={styles.axisTick}>
          <Text style={styles.axisLabel}>{value}</Text>
        </View>
      ))}
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
  screen: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1, backgroundColor: palette.background },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  summaryStat: {
    flex: 1,
    backgroundColor: palette.surfaceAlt,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
  },
  summaryValue: { fontSize: 20, fontWeight: "700", color: palette.textPrimary },
  summaryLabel: { fontSize: 11, color: palette.textSecondary, marginTop: 4, textAlign: "center" },
  chartRow: { flexDirection: "row", alignItems: "flex-end" },
  axis: {
    height: CHART_HEIGHT,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingLeft: 16,
    paddingRight: 6,
  },
  axisTick: { height: 12, justifyContent: "center" },
  axisLabel: { fontSize: 10, color: palette.textMuted },
  chartScroll: {
    paddingRight: 16,
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
  scrollContent: { paddingBottom: 106 },
  insights: {
    marginHorizontal: 16,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  insightHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  insightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  insightLabel: { fontSize: 14, color: palette.textSecondary },
  insightValue: { fontSize: 14, fontWeight: "600", color: palette.textPrimary },
  insightBody: { fontSize: 14, color: palette.textSecondary, lineHeight: 20 },
  insightCaveat: { fontSize: 12, color: palette.textMuted, lineHeight: 17, marginTop: 8 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  barLabel: { fontSize: 13, color: palette.textSecondary, width: 82 },
  barTrackH: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.borderSubtle,
    overflow: "hidden",
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: palette.chartSpent },
  barValue: { fontSize: 12, color: palette.textMuted, width: 28, textAlign: "right" },
  });
