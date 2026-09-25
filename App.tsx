import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getAllTasks, initDatabase } from "./src/db/database";
import {
  requestNotificationPermissions,
  rescheduleAllReminders,
  setupNotifications,
} from "./src/notifications";
import HomeScreen from "./src/screens/HomeScreen";
import TaskFormScreen from "./src/screens/TaskFormScreen";
import StatsScreen from "./src/screens/StatsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

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
          await rescheduleAllReminders(getAllTasks());
        }
      } catch (err) {
        console.warn("Notification setup failed:", err);
      }
    })();
  }, [ready]);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen
          name="TaskForm"
          component={TaskFormScreen}
          options={{ presentation: "modal" }}
        />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
