/**
 * MessMate - Login screen (Phase 2).
 *
 * Sign in with a username OR an email address plus the password. This is the
 * only place in the app that needs the internet for an existing user: once
 * the session is saved, the app opens offline from then on.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import AppTextField from '../components/AppTextField';
import AuthScaffold from '../components/AuthScaffold';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import { colors, fontFamily, radius, spacing, typography } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { getLocalMealStoreUserIds } from '../services/storage';

export default function LoginScreen({ navigation }) {
  const { signIn, isWorking } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [banner, setBanner] = useState(null);
  const [savedStores, setSavedStores] = useState(0);

  // Purely informational: tells the user their offline records survived a
  // logout. Reading AsyncStorage only - no network.
  useEffect(() => {
    let cancelled = false;

    getLocalMealStoreUserIds()
      .then((ids) => {
        if (!cancelled) setSavedStores(ids.length);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const identifierError =
    showFieldErrors && !identifier.trim() ? 'Enter your username or email.' : '';
  const passwordError = showFieldErrors && !password ? 'Enter your password.' : '';

  const handleSubmit = useCallback(async () => {
    setBanner(null);

    if (!identifier.trim() || !password) {
      setShowFieldErrors(true);
      setBanner({ tone: 'error', message: 'Please fill in every field.' });
      return;
    }

    const result = await signIn({ identifier: identifier.trim(), password });

    // Success needs no navigation call: the saved session makes the root
    // navigator swap to the app stack by itself.
    if (result.ok) return;

    setBanner({
      tone: result.offline ? 'warning' : 'error',
      message: result.message,
    });
  }, [identifier, password, signIn]);

  return (
    <AuthScaffold
      tag="WORKS OFFLINE"
      title="Welcome back"
      subtitle="Sign in to track your mess meals."
    >
      <View style={styles.form}>
        <MessageBanner tone={banner?.tone} message={banner?.message} />

        <AppTextField
          label="Username or Email"
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="sahil or you@example.com"
          error={identifierError}
          returnKeyType="next"
          textContentType="username"
        />

        <AppTextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          error={passwordError}
          secureTextEntry
          returnKeyType="go"
          textContentType="password"
          onSubmitEditing={handleSubmit}
        />

        <PrimaryButton
          label="LOGIN"
          icon="login"
          onPress={handleSubmit}
          loading={isWorking}
        />

        {savedStores > 0 ? (
          <View style={styles.note}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={16}
              color={colors.onPrimaryFixedVariant}
            />
            <Text style={styles.noteText}>
              Meal records from a previous sign-in are still saved on this device.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>New here?</Text>
        <Pressable
          onPress={() => navigation.navigate('Signup')}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text style={styles.footerLink}>Create an account</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryFixed,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: {
    flex: 1,
    ...typography.bodySm,
    color: colors.onPrimaryFixedVariant,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  footerText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
  footerLink: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bold,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
