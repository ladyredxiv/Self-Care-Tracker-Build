import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { completeTask, initDatabase } from "./src/db/database";
import {
  COMPLETE_ACTION_ID,
  requestNotificationPermissions,
  setupNotifications,
} from "./src/notifications";
import { syncAllReminders, syncRemindersForTask } from "./src/reminders";
import HomeScreen from "./src/screens/HomeScreen";
import TaskFormScreen from "./src/screens/TaskFormScreen";
import StatsScreen from "./src/screens/StatsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { ThemeProvider, useTheme } from "./src/theme";

const Stack = createNativeStackNavigator();

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initDatabase();
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        await setupNotifications();
        const granted = await requestNotificationPermissions();
        if (granted) {
          await syncAllReminders();
        }
      } catch (err) {
        console.warn("Notification setup failed:", err);
      }
    })();
  }, [ready]);

  useNotificationActions(ready);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedNavigation />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Separate component so it sits inside ThemeProvider and can colour the navigator
 * and status bar — otherwise a white flash shows between screens in dark mode.
 */
function ThemedNavigation() {
  const { palette, isDark } = useTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen
          name="TaskForm"
          component={TaskFormScreen}
          options={{ presentation: "modal" }}
        />
      </Stack.Navigator>
      <StatusBar style={isDark ? "light" : "dark"} />
    </NavigationContainer>
  );
}

/**
 * Applies the "Mark done" button on a reminder.
 *
 * useLastNotificationResponse rather than an event listener, because it also
 * reports the response that launched the app from cold — which is the common case
 * here, since the action foregrounds the app.
 */
function useNotificationActions(ready: boolean) {
  const response = Notifications.useLastNotificationResponse();
  // The hook keeps returning the same response, so completions must not be re-run
  // on every render.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !response) return;

    const request = response.notification.request;
    const key = `${request.identifier}:${response.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;

    if (response.actionIdentifier !== COMPLETE_ACTION_ID) return;

    const data = request.content.data as { taskId?: unknown; date?: unknown } | null;
    if (typeof data?.taskId !== "number" || typeof data?.date !== "string") return;

    // Completes the day the reminder was *for*, which may not be today if the
    // notification sat unattended.
    completeTask(data.taskId, data.date);
    void syncRemindersForTask(data.taskId);
  }, [ready, response]);
}
