import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { applyBackup, exportBackup, pickBackup } from "../backup";
import { getAllTasks } from "../db/database";
import { rescheduleAllReminders } from "../notifications";
import { BackupFile } from "../utils/backupFormat";

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

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
      await rescheduleAllReminders(getAllTasks());
    } catch (err) {
      console.warn("Reminder resync after restore failed:", err);
    }
    setBusy(null);
    Alert.alert("Restored", "Your data has been replaced from the backup.");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backButton}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdfaf6" },
  content: { padding: 20, paddingTop: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backButton: { fontSize: 16, color: "#4a3f38", width: 50 },
  title: { fontSize: 18, fontWeight: "700", color: "#3c332d" },
  sectionLabel: { fontSize: 14, color: "#6b5c52", marginBottom: 6 },
  sectionBody: { fontSize: 14, color: "#8a7b70", lineHeight: 20, marginBottom: 20 },
  button: {
    backgroundColor: "#4a3f38",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  buttonSecondary: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d9c7ba",
    backgroundColor: "white",
  },
  buttonSecondaryText: { color: "#4a3f38", fontWeight: "600", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  caution: { fontSize: 12, color: "#a15c3c", marginTop: 16, lineHeight: 18 },
});
