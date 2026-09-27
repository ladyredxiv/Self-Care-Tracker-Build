import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  Pressable,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import {
  completeTask,
  DEFAULT_BUDGET_KEY,
  setBudgetForDate,
  setSetting,
  uncompleteTask,
} from "../db/database";
import CapacityCard from "../components/CapacityCard";
import DayReflection from "../components/DayReflection";
import StartHere from "../components/StartHere";
import {
  filterTasks,
  groupByTimeOfDay,
  partialSpoons,
  pickStartHere,
  TASK_FILTER_LABELS,
  TaskFilter,
  todayDateString,
} from "../db/logic";
import {
  confirmCapacity,
  getProgressStyle,
  loadDayStatus,
  loadLastNightSleep,
} from "../db/selectors";
import { getDayLog, setDayReflection } from "../db/database";
import { useScreenPadding } from "../hooks/useScreenPadding";
import { clearReminderForCompletion, syncRemindersForTask } from "../reminders";
import { refreshStatusNotification } from "../statusRefresh";
import { Palette, useTheme, useThemedStyles } from "../theme";
import { DayLog, DayRating, ProgressStyle, TaskWithStatus, TimeOfDay } from "../types";
import { formatTimeLabel } from "../utils/time";
import AppTabBar from "../components/AppTabBar";
import StorybookHeader from "../components/StorybookHeader";

const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
};

interface TaskSection {
  key: string;
  title: string;
  data: TaskWithStatus[];
  /** Unscheduled tasks are shown for reference but can't be toggled. */
  interactive: boolean;
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const isTaskList = route.name === "Tasks";
  const styles = useThemedStyles(createStyles);
  const { paddingTop, paddingBottom } = useScreenPadding();
  const [today, setToday] = useState(todayDateString);
  const [refreshKey, setRefreshKey] = useState(0);
  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [spent, setSpent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [tasks, setTasks] = useState<TaskWithStatus[]>([]);
  const [dayLog, setDayLog] = useState<DayLog | null>(null);
  // Dismissing the check-in should last the session without being recorded as a
  // deliberate answer, so it lives in state rather than the database.
  const [checkInHidden, setCheckInHidden] = useState(false);
  const [progressStyle, setProgressStyleState] = useState<ProgressStyle>("recent");
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  const chooseFilter = () => {
    Alert.alert("Show", undefined, [
      ...(["all", "due", "done"] as TaskFilter[]).map((value) => ({
        text: TASK_FILTER_LABELS[value],
        onPress: () => setTaskFilter(value),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const load = useCallback(() => {
    const status = loadDayStatus(today);
    setBudget(status.budget);
    setBudgetInput(String(status.budget));
    setSpent(status.spent);
    setRemaining(status.remaining);
    setTasks(status.tasks);
    setDayLog(getDayLog(today));
    setProgressStyleState(getProgressStyle());
    // Fire-and-forget: the ongoing readout should track whatever just changed.
    void refreshStatusNotification();
    // Resolves later, or not at all without Health Connect; purely additive context.
    void loadLastNightSleep(today).then(setSleepHours).catch(() => setSleepHours(null));
  }, [today, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Reloading when the app comes forward catches completions made from a
  // notification's "Mark done" button, and re-reads the date so an app left open
  // overnight doesn't keep showing yesterday.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      setToday(todayDateString());
      setRefreshKey((key) => key + 1);
    });
    return () => subscription.remove();
  }, []);

  const saveBudget = () => {
    const value = parseInt(budgetInput, 10);
    if (Number.isNaN(value) || value < 0) {
      setBudgetInput(String(budget)); // reject the edit and show the real value again
      return;
    }
    setBudgetForDate(today, value);
    // Carried forward so tomorrow starts here too; past days keep their own
    // frozen budget, so this no longer rewrites history.
    setSetting(DEFAULT_BUDGET_KEY, String(value));
    load();
  };

  /**
   * Long press offers a reduced completion. "Did a bit of it" is how a lot of
   * self-care actually happens — sat down for the shower, ate something cold — and
   * logging it as nothing is both inaccurate and demoralising.
   */
  const promptPartial = (task: TaskWithStatus) => {
    if (task.completedToday) return;
    const partial = partialSpoons(task.energyCost);
    if (partial === task.energyCost) {
      toggleComplete(task);
      return;
    }
    Alert.alert(task.name, "How much of it did you manage?", [
      { text: "Cancel", style: "cancel" },
      { text: `A bit of it (${partial})`, onPress: () => complete(task, partial) },
      { text: `All of it (${task.energyCost})`, onPress: () => complete(task) },
    ]);
  };

  const complete = (task: TaskWithStatus, spoons?: number) => {
    completeTask(task.id, today, spoons);
    void clearReminderForCompletion(task.id, today);
    load();
  };

  const toggleComplete = (task: TaskWithStatus) => {
    if (task.completedToday) {
      uncompleteTask(task.id, today);
      // Re-arm, so undoing a completion brings today's reminder back.
      void syncRemindersForTask(task.id);
    } else {
      completeTask(task.id, today);
      // Stop today's reminder nagging about something already done.
      void clearReminderForCompletion(task.id, today);
    }
    load();
  };

  const editTask = (task: TaskWithStatus) => {
    navigation.navigate("TaskForm", { taskId: task.id });
  };

  const chooseCapacity = (spoons: number) => {
    confirmCapacity(today, spoons);
    load();
  };

  const rateDay = (rating: DayRating) => {
    setDayReflection(today, rating, dayLog?.note ?? null);
    load();
  };

  const showCheckIn = !checkInHidden && dayLog?.checkedIn !== true;
  // Only worth asking once the day is mostly over; before then there's nothing to
  // reflect on. Already-rated days keep the card so the answer can be changed.
  const showReflection =
    !showCheckIn && (dayLog?.rating !== null && dayLog?.rating !== undefined
      ? true
      : new Date().getHours() >= 18);

  const startHere = useMemo(() => pickStartHere(tasks), [tasks]);

  const sections = useMemo<TaskSection[]>(() => {
    // Filtering only applies on the Tasks tab; Today always shows the day as it is.
    const visible = isTaskList ? filterTasks(tasks, taskFilter) : tasks;

    const result: TaskSection[] = groupByTimeOfDay(
      visible.filter((t) => t.scheduledToday)
    ).map((group) => ({
      key: group.timeOfDay,
      title: TIME_OF_DAY_LABELS[group.timeOfDay],
      data: group.tasks,
      interactive: true,
    }));

    const unscheduled = visible.filter((t) => !t.scheduledToday);
    if (unscheduled.length > 0) {
      result.push({
        key: "unscheduled",
        title: "Not due today",
        data: unscheduled,
        interactive: false,
      });
    }
    return result;
  }, [tasks, isTaskList, taskFilter]);

  return (
    <View style={[styles.container, { paddingTop }]}>
      {isTaskList ? (
        <>
          <StorybookHeader title="Tasks" subtitle="Everything you're tracking" />
          <View style={styles.filterRow}>
            <Pressable
              style={styles.filterChip}
              onPress={chooseFilter}
              accessibilityRole="button"
              accessibilityLabel={`Showing ${TASK_FILTER_LABELS[taskFilter]}. Change filter.`}
            >
              <Text style={styles.filterChipText}>{TASK_FILTER_LABELS[taskFilter]}</Text>
              <View style={styles.filterCaret} />
            </Pressable>
          </View>
        </>
      ) : (
        <CapacityCard
          budget={budget}
          spent={spent}
          needsCheckIn={showCheckIn}
          sleepHours={sleepHours}
          budgetInput={budgetInput}
          onBudgetInputChange={setBudgetInput}
          onBudgetCommit={saveBudget}
          onChoose={chooseCapacity}
          onDismiss={() => setCheckInHidden(true)}
        />
      )}

      {!isTaskList && showReflection && (
        <DayReflection rating={dayLog?.rating ?? null} onRate={rateDay} />
      )}

      {!isTaskList && !showCheckIn && <StartHere tasks={startHere} onComplete={(t) => complete(t)} />}

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.listContent, { paddingBottom: 118 + paddingBottom }]}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No tasks scheduled for today yet. Add one below.
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item, section }) => (
          <TaskRow
            task={item}
            onToggle={toggleComplete}
            onLongPress={promptPartial}
            onEdit={editTask}
            disabled={!section.interactive}
            progressStyle={progressStyle}
          />
        )}
      />

      <Pressable
        style={[styles.addButton, { bottom: paddingBottom + 82 }]}
        onPress={() => navigation.navigate("TaskForm")}
      >
        <Text style={styles.addButtonText}>+ Add self-care task</Text>
      </Pressable>
      <AppTabBar active={isTaskList ? "tasks" : "today"} />
    </View>
  );
}

/**
 * Cadence suffix for the task row. Deliberately states the rhythm rather than a
 * verdict — "every 2 days" reads as information, where "overdue" reads as
 * an accusation, and this is an app for people who are already short on slack.
 */
/**
 * Per-task progress, in whichever form the user picked.
 *
 * "recent" is the default: a streak reads as zero after a two-day crash, which
 * punishes precisely the thing this app is built to accommodate.
 */
function describeProgress(task: TaskWithStatus, style: ProgressStyle): string {
  if (style === "hidden") return "";
  if (style === "streak") return task.streak > 0 ? ` · ${task.streak} in a row` : "";
  return task.recentCompletions > 0 ? ` · ${task.recentCompletions}× in 30d` : "";
}

/**
 * Cost, phrased by direction. Category is deliberately dropped from the row: it
 * was a fifth competing fact on a 13px line and is almost always "general".
 */
function describeCost(task: TaskWithStatus): string {
  if (task.energyCost < 0) return `Gives back ${-task.energyCost}`;
  return `${task.energyCost} ${task.energyCost === 1 ? "spoon" : "spoons"}`;
}

function describeSchedule(task: TaskWithStatus): string {
  switch (task.scheduleType) {
    case "interval":
      return task.intervalDays === 1 ? " · every day" : ` · every ${task.intervalDays} days`;
    case "once":
      return " · one-off";
    case "weekdays":
      return task.daysOfWeek.length === 0 ? "" : ` · ${task.daysOfWeek.length}× a week`;
    case "daily":
      return "";
  }
}

function TaskRow({
  task,
  onToggle,
  onLongPress,
  onEdit,
  disabled,
  progressStyle,
}: {
  task: TaskWithStatus;
  onToggle: (t: TaskWithStatus) => void;
  onLongPress: (t: TaskWithStatus) => void;
  onEdit: (t: TaskWithStatus) => void;
  disabled?: boolean;
  progressStyle: ProgressStyle;
}) {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const blocked = !task.completedToday && !task.fitsRemainingBudget;
  return (
    <TouchableOpacity
      style={[
        styles.taskRow,
        task.energyCost < 0 && styles.taskRowRestorative,
        task.completedToday && styles.taskRowDone,
        blocked && styles.taskRowBlocked,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${task.name}, ${describeCost(task)}`}
      accessibilityState={{ checked: task.completedToday, disabled: !!disabled }}
      // Dropping onPress rather than setting `disabled` keeps the nested edit
      // button tappable — `disabled` on a Touchable can swallow child touches.
      onPress={disabled ? undefined : () => onToggle(task)}
      onLongPress={disabled ? undefined : () => onLongPress(task)}
    >
      <View style={[styles.taskCheck, task.completedToday && styles.taskCheckDone]}>
        {task.completedToday ? <View style={styles.taskCheckMark} /> : null}
      </View>
      {task.icon ? <Text style={styles.taskIcon}>{task.icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.taskName}>
          {task.name}
          {task.isEssential ? " ·" : ""}
          {task.isEssential ? <Text style={styles.essentialTag}> essential</Text> : null}
        </Text>
        <Text style={styles.taskMeta}>
          {task.energyCost < 0
            ? `+${-task.energyCost} back`
            : `${task.energyCost} energy`} · {task.category}
          {describeSchedule(task)}
          {describeProgress(task, progressStyle)}
          {task.reminderEnabled && task.reminderTime
            ? ` · ⏰ ${formatTimeLabel(task.reminderTime)}`
            : ""}
        </Text>
      </View>
      {!task.completedToday && task.daysWaiting > 0 && (
        <Text style={styles.waitingTag}>
          {task.daysWaiting}d waiting
        </Text>
      )}
      {blocked && <Text style={styles.blockedTag}>over budget</Text>}
      {task.completedToday && (
        <Text style={styles.doneTag}>
          {task.spoonsSpentToday !== null && task.spoonsSpentToday !== task.energyCost
            ? `${task.spoonsSpentToday} of ${task.energyCost}`
            : "done"}
        </Text>
      )}
      <Pressable
        hitSlop={10}
        style={styles.editButton}
        onPress={() => onEdit(task)}
      >
        <View style={styles.editDots}>
          <View style={styles.editDot} />
          <View style={styles.editDot} />
          <View style={styles.editDot} />
        </View>
      </Pressable>
    </TouchableOpacity>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  budgetCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: palette.surfaceAlt,
  },
  budgetCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  budgetLabel: { fontSize: 14, color: palette.textSecondary },
  headerLinks: { flexDirection: "row", alignItems: "center", gap: 14 },
  trendsLink: { fontSize: 13, color: palette.textPrimary, fontWeight: "600" },
  settingsLink: { fontSize: 16, color: palette.textPrimary },
  budgetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  budgetInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 80,
    fontSize: 18,
    backgroundColor: palette.surface,
    color: palette.textPrimary,
  },
  budgetRemaining: { fontSize: 16, fontWeight: "600", color: palette.textPrimary },
  budgetOver: { color: palette.warning },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 12, marginBottom: 2 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterChipText: { fontSize: 13, fontWeight: "600", color: palette.textSecondary },
  /** A caret drawn from a rotated half-border, avoiding another glyph. */
  filterCaret: {
    width: 7,
    height: 7,
    marginTop: -3,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: palette.textMuted,
    transform: [{ rotate: "45deg" }],
  },
  emptyText: { color: palette.textMuted, textAlign: "center", marginTop: 24 },
  sectionHeader: {
    marginTop: 14,
    marginBottom: 6,
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 16,
    backgroundColor: palette.surface,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  taskRowRestorative: {
    backgroundColor: palette.highlightSoft,
    borderColor: palette.highlightSoft,
  },
  taskRowDone: { backgroundColor: palette.doneSurface, borderColor: palette.doneBorder },
  taskRowBlocked: { opacity: 0.45 },
  taskCheck: {
    width: 24,
    height: 24,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  taskCheckDone: { backgroundColor: palette.highlight, borderColor: palette.highlight },
  // Two borders on a rotated box: the classic drawn tick, so there's no glyph to
  // render inconsistently and the weight and colour are ours to set.
  taskCheckMark: {
    width: 10,
    height: 5.5,
    marginTop: -3,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: palette.onAccent,
    transform: [{ rotate: "-45deg" }],
  },
  taskIcon: { fontSize: 19, marginRight: 10 },
  taskName: { fontSize: 16, fontWeight: "700", color: palette.textPrimary },
  taskMeta: { fontSize: 13, color: palette.textMuted, marginTop: 2 },
  blockedTag: { fontSize: 12, color: palette.warning },
  // Muted rather than alarming: waiting time is a sorting signal, not a telling-off.
  waitingTag: { fontSize: 12, color: palette.textMuted, marginRight: 8 },
  essentialTag: { fontSize: 12, fontWeight: "400", color: palette.highlight },
  doneTag: { fontSize: 12, color: palette.doneText, fontWeight: "600" },
  editButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  editDots: { gap: 3 },
  editDot: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: palette.icon },
  editButtonText: { fontSize: 16, color: palette.icon },
  addButton: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: palette.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  addButtonText: { color: palette.onAccent, fontWeight: "600", fontSize: 16 },
  });
