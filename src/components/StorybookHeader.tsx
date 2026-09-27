import { ImageBackground, StyleSheet, Text, View } from "react-native";

import { Palette, useThemedStyles } from "../theme";

const nightArtwork = require("../../assets/storybook-night.png");

/** A real image layer, kept deliberately quiet so screen titles remain readable. */
export default function StorybookHeader({
  title,
  subtitle,
  fullBleed = false,
}: {
  title: string;
  subtitle?: string;
  /** Lets a header escape a screen's ordinary content gutter. */
  fullBleed?: boolean;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <ImageBackground
      source={nightArtwork}
      style={[styles.hero, fullBleed && styles.fullBleed]}
      imageStyle={styles.image}
    >
      <View style={styles.veil} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </ImageBackground>
  );
}

export { nightArtwork };

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    hero: { height: 142, justifyContent: "flex-end", overflow: "hidden" },
    fullBleed: { marginHorizontal: -20 },
    image: { resizeMode: "cover", opacity: 0.96 },
    veil: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(35, 25, 55, 0.20)",
    },
    copy: { paddingHorizontal: 22, paddingBottom: 18 },
    title: {
      color: "#fff8ee",
      fontSize: 34,
      lineHeight: 39,
      fontFamily: "serif",
      fontWeight: "700",
      textShadowColor: "rgba(27, 17, 34, 0.58)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 5,
    },
    subtitle: {
      color: "#fff5e8",
      fontSize: 15,
      marginTop: 2,
      textShadowColor: "rgba(27, 17, 34, 0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
  });
