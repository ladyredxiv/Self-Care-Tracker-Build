import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { applyBackup, exportBackup, pickBackup } from "../backup";
import { describeBundle, describeRuntime } from "../components/BuildBadge";
import { useScreenPadding } from "../hooks/useScreenPadding";
import { syncAllReminders } from "../reminders";
import { Palette, ThemePreference, useTheme, useThemedStyles } from "../theme";
import { applyUpdate, checkAndFetchUpdate } from "../updates";
import { BackupFile } from "../utils/backupFormat";

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(createStyles);
  const { preference, setPreference } = useTheme();
  const { paddingTop, paddingBottom } = useScreenPadding();
  const [busy, setBusy] = useState<"export" | "import" | "update" | null>(null);

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop, paddingBottom: paddingBottom + 20 }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backButton}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

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
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backButton: { fontSize: 16, color: palette.textPrimary, width: 50 },
  title: { fontSize: 18, fontWeight: "700", color: palette.textPrimary },
  sectionLabel: { fontSize: 14, color: palette.textSecondary, marginBottom: 6 },
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
    marginVertical: 28,
  },
  });
