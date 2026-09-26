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
    paddingTop: Math.max(insets.top + 20, 40),
    paddingBottom: Math.max(insets.bottom, 12),
    insets,
  };
}
