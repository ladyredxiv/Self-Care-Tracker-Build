import * as Updates from "expo-updates";
import { StyleSheet, Text, View } from "react-native";

/**
 * Shows which JS bundle is actually running.
 *
 * This doubles as the OTA smoke test: a freshly installed APK reads "embedded
 * build", and the moment an `eas update` push is picked up it flips to that
 * update's id and publish time. So confirming a push landed is a glance rather
 * than a guess about whether some cosmetic tweak is the new one or the old one.
 *
 * Every Updates constant is nullable and unset under Expo Go / the dev server,
 * hence the fallbacks.
 */
export default function BuildBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{describeBundle()}</Text>
    </View>
  );
}

export function describeBundle(): string {
  try {
    const prefix = Updates.channel ? `${Updates.channel} · ` : "";

    // No update id at all means there's no updates runtime driving this launch:
    // Expo Go, or Metro over the dev server.
    if (Updates.updateId === null) return `${prefix}dev bundle`;

    if (Updates.isEmbeddedLaunch) return `${prefix}embedded build`;

    const when = Updates.createdAt
      ? ` · ${Updates.createdAt.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`
      : "";
    return `${prefix}update ${Updates.updateId.slice(0, 8)}${when}`;
  } catch {
    return "bundle info unavailable";
  }
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "center",
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ece3f5",
    borderWidth: 1,
    borderColor: "#d5c6e6",
  },
  text: { fontSize: 11, color: "#5d4d70", letterSpacing: 0.3 },
});
