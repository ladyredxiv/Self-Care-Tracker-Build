import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Screen padding derived from real device insets instead of the hardcoded
 * `paddingTop: 60` every screen used to carry — which was either too little on a
 * notched phone or too much on a flat one.
 *
 * Floors are applied so content still has breathing room on devices that report
 * no inset at all, rather than sitting flush against the top edge.
 */
export function useScreenPadding() {
  const insets = useSafeAreaInsets();
  return {
    // insets.top already clears the status bar; the extra 20 on top of it left a
    // visible band of empty cream before the first card on a tall phone.
    paddingTop: Math.max(insets.top + 6, 24),
    paddingBottom: Math.max(insets.bottom, 12),
    insets,
  };
}
