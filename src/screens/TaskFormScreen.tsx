import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Platform,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation, useRoute } from "@react-navigation/native";
import { createTask, deleteTask, getTaskById, updateTask } from "../db/database";
import { cancelTaskReminders, requestNotificationPermissions } from "../notifications";
import { syncRemindersForTask } from "../reminders";
import { useScreenPadding } from "../hooks/useScreenPadding";
import { DayOfWeek, TimeOfDay } from "../types";
import { timeStringToDate, dateToTimeString, formatTimeLabel } from "../utils/time";

const TIME_OPTIONS: TimeOfDay[] = ["anytime", "morning", "afternoon", "evening"];
const DAY_LABELS: { label: string; value: DayOfWeek }[] = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

export default function TaskFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { paddingTop, paddingBottom } = useScreenPadding();
  const taskId: number | undefined = route.params?.taskId;
  const isEditing = taskId !== undefined;

  const [name, setName] = useState("");
  const [energyCost, setEnergyCost] = useState("2");
  const [category, setCategory] = useState("general");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("anytime");
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    const task = getTaskById(taskId);
    if (!task) return;
    setName(task.name);
    setEnergyCost(String(task.energyCost));
    setCategory(task.category);
    setTimeOfDay(task.timeOfDay);
    setSelectedDays(task.daysOfWeek);
    setReminderEnabled(task.reminderEnabled);
    setReminderTime(task.reminderTime ?? "09:00");
  }, [isEditing, taskId]);

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleReminder = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) return;
    }
    setReminderEnabled(value);
  };

  const save = async () => {
    const cost = parseInt(energyCost, 10);
    if (!name.trim() || Number.isNaN(cost) || cost < 0) return;

    const payload = {
      name: name.trim(),
      energyCost: cost,
      category: category.trim() || "general",
      timeOfDay,
      daysOfWeek: selectedDays,
      isRecurring: true,
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime : null,
    };

    const id = isEditing ? taskId : createTask(payload);
    if (isEditing) {
      updateTask(taskId, payload);
    }

    // Reads the task back from the database rather than scheduling from the form's
    // payload, so reminders account for days already completed.
    await syncRemindersForTask(id);

    navigation.goBack();
  };

  const confirmDelete = () => {
    if (taskId === undefined) return;
    Alert.alert("Delete task?", `"${name}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await cancelTaskReminders(taskId);
          deleteTask(taskId);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop, paddingBottom: paddingBottom + 20 }}
    >
      <Text style={styles.title}>{isEditing ? "Edit self-care task" : "New self-care task"}</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. 10 min walk"
      />

      <Text style={styles.label}>Energy cost</Text>
      <TextInput
        style={styles.input}
        value={energyCost}
        onChangeText={setEnergyCost}
        keyboardType="number-pad"
        placeholder="e.g. 3"
      />

      <Text style={styles.label}>Category</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder="e.g. movement, rest, social"
      />

      <Text style={styles.label}>Preferred time of day</Text>
      <View style={styles.chipRow}>
        {TIME_OPTIONS.map((option) => (
          <Pressable
            key={option}
            style={[styles.chip, timeOfDay === option && styles.chipSelected]}
            onPress={() => setTimeOfDay(option)}
          >
            <Text style={[styles.chipText, timeOfDay === option && styles.chipTextSelected]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Days (leave blank for every day)</Text>
      <View style={styles.chipRow}>
        {DAY_LABELS.map(({ label, value }) => (
          <Pressable
            key={value}
            style={[styles.chip, selectedDays.includes(value) && styles.chipSelected]}
            onPress={() => toggleDay(value)}
          >
            <Text
              style={[
                styles.chipText,
                selectedDays.includes(value) && styles.chipTextSelected,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.reminderRow}>
        <Text style={styles.label}>Remind me</Text>
        <Switch value={reminderEnabled} onValueChange={toggleReminder} />
      </View>

      {reminderEnabled && (
        <>
          <Pressable style={styles.timeButton} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.timeButtonText}>{formatTimeLabel(reminderTime)}</Text>
          </Pressable>
          {showTimePicker && (
            <DateTimePicker
              value={timeStringToDate(reminderTime)}
              mode="time"
              is24Hour={false}
              onChange={(event, selectedDate) => {
                setShowTimePicker(Platform.OS === "ios");
                if (event.type === "dismissed" || !selectedDate) return;
                setReminderTime(dateToTimeString(selectedDate));
              }}
            />
          )}
        </>
      )}

      <Pressable style={styles.saveButton} onPress={save}>
        <Text style={styles.saveButtonText}>{isEditing ? "Save changes" : "Save task"}</Text>
      </Pressable>

      {isEditing && (
        <Pressable style={styles.deleteButton} onPress={confirmDelete}>
          <Text style={styles.deleteButtonText}>Delete task</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdfaf6" },
  title: { fontSize: 22, fontWeight: "700", color: "#3c332d", marginBottom: 20 },
  label: { fontSize: 14, color: "#6b5c52", marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d9c7ba",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "white",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d9c7ba",
  },
  chipSelected: { backgroundColor: "#4a3f38", borderColor: "#4a3f38" },
  chipText: { color: "#4a3f38", fontSize: 13 },
  chipTextSelected: { color: "white" },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
  },
  timeButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#d9c7ba",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "white",
    alignSelf: "flex-start",
  },
  timeButtonText: { fontSize: 16, color: "#3c332d" },
  saveButton: {
    marginTop: 32,
    backgroundColor: "#4a3f38",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonText: { color: "white", fontWeight: "600", fontSize: 16 },
  deleteButton: {
    marginTop: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  deleteButtonText: { color: "#a1443c", fontWeight: "600", fontSize: 15 },
});
