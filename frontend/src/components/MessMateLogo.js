/**
 * MessMate - the MESSMATE brand mark.
 *
 * One reusable lockup used by Home, the Meals / Profile placeholders and (in
 * a later phase) the PDF report header:
 *
 *   [ emerald tile with the fork-and-knife glyph ]  MESSMATE
 *
 * It is drawn with the vector icon font that ships inside
 * `@expo/vector-icons` - no image file, no network request, no external URL -
 * so the brand renders identically offline, on Android and on iPhone.
 *
 * Visual language (see DESIGN.md + the Stitch Home mockup):
 * emerald tile (#047857), white glyph, charcoal wordmark, rounded corners.
 */

import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, spacing } from '../constants/theme';

// The MessMate mark: a fork and knife on emerald - "a shared mess table".
const GLYPH = 'silverware-fork-knife';

const SIZES = {
  sm: { tile: 30, glyph: 16, corner: radius.base, wordmark: { fontSize: 14, lineHeight: 18 } },
  md: { tile: 38, glyph: 20, corner: radius.md, wordmark: { fontSize: 18, lineHeight: 24 } },
  lg: { tile: 56, glyph: 30, corner: radius.lg, wordmark: { fontSize: 24, lineHeight: 30 } },
};

export default function MessMateLogo({
  size = 'md',
  showWordmark = true,
  tileColor = colors.primaryContainer,
  glyphColor = colors.onPrimary,
  wordmarkColor = colors.onSurface,
  style,
}) {
  const preset = SIZES[size] || SIZES.md;

  return (
    <View style={[styles.row, style]} accessible accessibilityRole="image" accessibilityLabel="MessMate">
      <View
        style={[
          styles.tile,
          {
            width: preset.tile,
            height: preset.tile,
            borderRadius: preset.corner,
            backgroundColor: tileColor,
          },
        ]}
      >
        <MaterialCommunityIcons name={GLYPH} size={preset.glyph} color={glyphColor} />
      </View>

      {showWordmark ? (
        <Text style={[styles.wordmark, preset.wordmark, { color: wordmarkColor }]}>MESSMATE</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fontFamily.extrabold,
    letterSpacing: 0.5,
  },
});
