/**
 * MessMate - application root.
 *
 * Fonts -> session -> navigation. The session is read from AsyncStorage, so
 * the app opens straight into the signed-in flow without touching the
 * network: opening the app offline is a normal case, not an error.
 *
 * PHASE 5: the final Profile screen (details, SYNC RECORDS, the PDF meal
 * report and LOGOUT), the shared meal state that keeps Home and Meals in step,
 * and the expected 30-meal completion dates on the Home cycle cards.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';

import { colors, spacing, typography } from './src/constants/theme';
import { AuthProvider } from './src/context/AuthContext';
import { MealProvider } from './src/context/MealContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // A font problem must never block the app: the screens fall back to the
  // system font, exactly as in Phase 0.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.bootText}>Loading MessMate...</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* One shared meal state for Home, Meals and Profile, inside the
            session it belongs to. */}
        <MealProvider>
          <AppNavigator />
        </MealProvider>
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  bootText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
});