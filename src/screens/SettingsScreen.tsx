import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { applyBackup, exportBackup, pickBackup } from "../backup";
import { describeBundle, describeRuntime } from "../components/BuildBadge";
import { useScreenPadding } from "../hooks/useScreenPadding";
import { syncAllReminders } from "../reminders";
import { shareSummary } from "../report";
import {
  getProgressStyle,
  isStatusNotificationEnabled,
  setProgressStyle,
  setStatusNotificationEnabled,
} from "../db/selectors";
import { refreshStatusNotification } from "../statusRefresh";
import { getHealthAvailability, requestSleepPermission } from "../health";
import { Palette, ThemePreference, useTheme, useThemedStyles } from "../theme";
import { ProgressStyle } from "../types";
import { applyUpdate, checkAndFetchUpdate } from "../updates";
import { BackupFile } from "../utils/backupFormat";
import AppTabBar from "../components/AppTabBar";
import StorybookHeader from "../components/StorybookHeader";

const PROGRESS_OPTIONS: { value: ProgressStyle; label: string }[] = [
  { value: "recent", label: "Recent count" },
  { value: "streak", label: "Streak" },
  { value: "hidden", label: "Neither" },
];

const SUMMARY_RANGES = [30, 90];

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(createStyles);
  const { palette, preference, setPreference } = useTheme();
  const { paddingTop, paddingBottom } = useScreenPadding();
  const [busy, setBusy] = useState<"export" | "import" | "update" | "summary" | null>(null);
  const [progress, setProgress] = useState<ProgressStyle>(getProgressStyle);
  const [statusEnabled, setStatusEnabled] = useState(isStatusNotificationEnabled);

  const connectSleep = async () => {
    const availability = await getHealthAvailability();
    if (availability === "unavailable") {
      Alert.alert(
        "Health Connect isn't available",
        "This needs Health Connect, which is built into Android 14 and later and installable from the Play Store before that."
      );
      return;
    }
    if (availability === "needsUpdate") {
      Alert.alert("Health Connect needs updating", "Update it from the Play Store, then try again.");
      return;
    }
    const granted = await requestSleepPermission();
    Alert.alert(
      granted ? "Sleep connected" : "Not connected",
      granted
        ? "Last night's sleep will show with your check-in, and Trends will compare sleep against how your days go."
        : "Sleep access wasn't granted, so nothing has changed."
    );
  };

  const toggleStatus = (enabled: boolean) => {
    setStatusNotificationEnabled(enabled);
    setStatusEnabled(enabled);
    void refreshStatusNotification();
  };

  const chooseProgress = (style: ProgressStyle) => {
    setProgressStyle(style);
    setProgress(style);
  };

  const handleShareSummary = async (days: number) => {
    setBusy("summary");
    const result = await shareSummary(days);
    setBusy(null);
    if (!result.ok) Alert.alert("Couldn't create the summary", result.error);
  };

  const handleCheckForUpdates = async () => {
    setBusy("update");
    const result = await checkAndFetchUpdate();
    setBusy(null);

    switch (result.status) {
      case "unsupported":
        Alert.alert(
          "Not available here",
          "Over-the-air updates only work in an installed build, not in Expo Go or over the dev server."
        );
        return;
      case "none":
        // Careful wording: the server only offers updates matching this build's
        // runtime, so "no update" means none *compatible*, which is not the same
        // as none published.
        Alert.alert(
          "Nothing new to install",
          `You have the newest update built for this version of the app (runtime ${describeRuntime()}).\n\nIf you were expecting a change, it may have been published against a different runtime, which needs a new build rather than an update.`
        );
        return;
      case "error":
        Alert.alert("Couldn't check for updates", result.error);
        return;
      case "ready":
        Alert.alert("Update ready", "Restart now to apply it?", [
          { text: "Later", style: "cancel" },
          { text: "Restart", onPress: () => void applyUpdate() },
        ]);
    }
  };

  const handleExport = async () => {
    setBusy("export");
    const result = await exportBackup();
    setBusy(null);
    if (!result.ok) {
      Alert.alert("Export failed", result.error);
    }
  };

  const handleImport = async () => {
    setBusy("import");
    const result = await pickBackup();
    setBusy(null);

    if (result === null) return; // user cancelled
    if (!result.ok) {
      Alert.alert("Can't use that file", result.error);
      return;
    }

    Alert.alert(
      "Replace all data?",
      `This backup holds ${result.summary}.\n\nRestoring replaces everything currently in the app. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: () => void restore(result.backup),
        },
      ]
    );
  };

  const restore = async (backup: BackupFile) => {
    setBusy("import");
    const applied = applyBackup(backup);
    if (!applied.ok) {
      setBusy(null);
      Alert.alert("Restore failed", applied.error);
      return;
    }

    // Reminders belong to the tasks that just got replaced, so the OS scheduler
    // has to be re-synced against the restored set.
    try {
      await syncAllReminders();
    } catch (err) {
      console.warn("Reminder resync after restore failed:", err);
    }
    setBusy(null);
    Alert.alert("Restored", "Your data has been replaced from the backup.");
  };

  return (
    <View style={styles.screen}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop, paddingBottom: paddingBottom + 20 }]}
    >
      <StorybookHeader title="Settings" subtitle="Make the app fit your actual life" fullBleed />
      <View style={[styles.header, { display: "none" }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backButton}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.reminderRow}>
        <Text style={styles.sectionLabel}>Keep spoons in the notification shade</Text>
        <Switch
          value={statusEnabled}
          onValueChange={toggleStatus}
          trackColor={{ false: palette.spoonEmpty, true: palette.highlight }}
          thumbColor={palette.surface}
        />
      </View>
      <Text style={styles.sectionBody}>
        A silent, always-there notification showing what's left and what to start
        with, so you can check without opening the app.
      </Text>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Sleep as context</Text>
      <Text style={styles.sectionBody}>
        Optional. Shows last night's sleep with your check-in and compares it against
        how your days go. It never sets your capacity, and it isn't stored by this app
        or included in backups.
      </Text>
      <Pressable style={styles.buttonSecondary} onPress={() => void connectSleep()}>
        <Text style={styles.buttonSecondaryText}>Connect sleep data</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Showing progress</Text>
      <Text style={styles.sectionBody}>
        A streak resets to zero after a bad couple of days. A count over the last 30
        days keeps the credit for what you did manage.
      </Text>
      <View style={styles.chipRow}>
        {PROGRESS_OPTIONS.map((option) => {
          const selected = progress === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => chooseProgress(option.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Summary for an appointment</Text>
      <Text style={styles.sectionBody}>
        A plain-text log of your capacity, what you spent, how days went, and whether
        overspending was followed by worse days.
      </Text>
      <View style={styles.chipRow}>
        {SUMMARY_RANGES.map((days) => (
          <Pressable
            key={days}
            style={[styles.chip, busy !== null && styles.buttonDisabled]}
            disabled={busy !== null}
            onPress={() => handleShareSummary(days)}
          >
            <Text style={styles.chipText}>
              {busy === "summary" ? "Preparing…" : `Last ${days} days`}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.chipRow}>
        {APPEARANCE_OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setPreference(option.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Your data</Text>
      <Text style={styles.sectionBody}>
        Everything lives only on this device. Saving a backup somewhere else means a lost
        or reset phone doesn't take your history with it.
      </Text>

      <Pressable
        style={[styles.button, busy !== null && styles.buttonDisabled]}
        disabled={busy !== null}
        onPress={handleExport}
      >
        <Text style={styles.buttonText}>
          {busy === "export" ? "Preparing…" : "Save a backup"}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.buttonSecondary, busy !== null && styles.buttonDisabled]}
        disabled={busy !== null}
        onPress={handleImport}
      >
        <Text style={styles.buttonSecondaryText}>
          {busy === "import" ? "Working…" : "Restore from a backup"}
        </Text>
      </Pressable>

      <Text style={styles.caution}>
        Restoring replaces all tasks, completions and budgets currently on this device.
      </Text>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>App updates</Text>
      <Text style={styles.sectionBody}>
        Currently running: {describeBundle()}
      </Text>

      <Pressable
        style={[styles.buttonSecondary, busy !== null && styles.buttonDisabled]}
        disabled={busy !== null}
        onPress={handleCheckForUpdates}
      >
        <Text style={styles.buttonSecondaryText}>
          {busy === "update" ? "Checking…" : "Check for updates"}
        </Text>
      </Pressable>
    </ScrollView>
    <AppTabBar active="settings" />
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backButton: { fontSize: 16, color: palette.textPrimary, width: 50 },
  title: { fontSize: 18, fontWeight: "700", color: palette.textPrimary },
  sectionLabel: { fontSize: 16, fontWeight: "700", color: palette.textPrimary, marginBottom: 6, flex: 1 },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionBody: { fontSize: 14, color: palette.textMuted, lineHeight: 20, marginBottom: 20 },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { color: palette.onAccent, fontWeight: "600", fontSize: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipSelected: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { color: palette.textPrimary, fontSize: 13 },
  chipTextSelected: { color: palette.onAccent },
  buttonSecondary: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  buttonSecondaryText: { color: palette.textPrimary, fontWeight: "600", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  caution: { fontSize: 12, color: palette.warning, marginTop: 16, lineHeight: 18 },
  divider: {
    height: 1,
    backgroundColor: palette.borderSubtle,
    marginVertical: 24,
  },
  });
