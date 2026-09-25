/**
 * MessMate - root navigator.
 *
 *   App
 *    ├── AuthStack   Login / Signup          (nobody signed in)
 *    └── AppStack    MainTabs                (a session exists)
 *                      HOME | MEALS | PROFILE
 *
 * Which stack is shown is decided by AuthContext, so NO screen ever has to
 * call navigate() on sign-in, sign-up, logout or session restore. A session
 * restored from AsyncStorage therefore works with the phone in airplane
 * mode - the switch happens without a single network call.
 *
 * AppStack holds a single route today. It stays a stack because later phases
 * push detail screens on top of the tabs (a meal's full history, the PDF
 * report), and because Meals / Profile remain placeholders inside MainTabs
 * for now.
 */

import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';

const Stack = createNativeStackNavigator();

// React Navigation defaults are blue/grey; these are the DESIGN.md tokens.
const navigationTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surfaceContainerLowest,
    text: colors.onSurface,
    border: colors.divider,
    notification: colors.secondaryContainer,
  },
};

function AppStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
    </Stack.Navigator>
  );
}

/** Shown for the moment it takes to read the saved session off the device. */
function BootScreen() {
  return (
    <View style={styles.boot}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.bootText}>Opening MessMate...</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { user, isRestoring } = useAuth();

  if (isRestoring) return <BootScreen />;

  return (
    <NavigationContainer theme={navigationTheme}>
      {user ? <AppStack /> : <AuthNavigator />}
    </NavigationContainer>
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
