import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Palette, useThemedStyles } from "../theme";

export interface SheetOption {
  label: string;
  /** Second line, for explaining what an option will actually do. */
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * A bottom sheet of actions.
 *
 * Replaces Alert for anything with more than two choices. Alert lays its buttons
 * out horizontally, upper-cases the labels and truncates them, which turned a
 * three-option menu into a cramped row of shouting — and it gives no room to
 * explain what an option does.
 */
export default function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping away is how people expect to dismiss a sheet. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={styles.grabber} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        {options.map((option) => (
          <Pressable
            key={option.label}
            style={styles.option}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            onPress={() => {
              onClose();
              option.onPress();
            }}
          >
            <Text style={[styles.optionLabel, option.destructive && styles.destructive]}>
              {option.label}
            </Text>
            {option.detail ? <Text style={styles.optionDetail}>{option.detail}</Text> : null}
          </Pressable>
        ))}

        <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#00000066" },
    sheet: {
      marginTop: "auto",
      paddingHorizontal: 20,
      paddingTop: 10,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: palette.background,
    },
    grabber: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.border,
      marginBottom: 14,
    },
    title: { fontSize: 13, fontWeight: "700", color: palette.textMuted, marginBottom: 6 },
    option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle },
    optionLabel: { fontSize: 16, color: palette.textPrimary },
    optionDetail: { fontSize: 12, color: palette.textMuted, marginTop: 2 },
    destructive: { color: palette.danger },
    cancel: { paddingVertical: 15, alignItems: "center", marginTop: 4 },
    cancelLabel: { fontSize: 15, fontWeight: "600", color: palette.textSecondary },
  });
