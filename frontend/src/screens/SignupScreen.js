/**
 * MessMate - Signup screen (Phase 2).
 *
 * Creates the account on the server, saves the returned identity locally and
 * drops straight into the authenticated flow. Signup is the one action that
 * genuinely cannot work offline.
 */

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import AppTextField from '../components/AppTextField';
import AuthScaffold from '../components/AuthScaffold';
import JoinDateField from '../components/JoinDateField';
import MessageBanner from '../components/MessageBanner';
import PrimaryButton from '../components/PrimaryButton';
import { colors, fontFamily, spacing, typography } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { isFutureDateString, isRealDateString, todayString } from '../utils/date';

// Deliberately basic: the backend only requires a non-empty, unique email.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen({ navigation }) {
  const { signUp, isWorking } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joinDate, setJoinDate] = useState(todayString());
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null);

  function validate() {
    const next = {};

    if (!username.trim()) next.username = 'Choose a username.';
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'That email address looks wrong.';

    if (!password) next.password = 'Choose a password.';

    if (!isRealDateString(joinDate)) next.joinDate = 'Choose a valid join date.';
    else if (isFutureDateString(joinDate)) next.joinDate = 'The join date cannot be in the future.';

    return next;
  }

  const handleSubmit = useCallback(async () => {
    setBanner(null);

    const errors = validate();
    setFieldErrors(errors);
    setShowFieldErrors(true);

    if (Object.keys(errors).length > 0) {
      setBanner({ tone: 'error', message: 'Please correct the highlighted fields.' });
      return;
    }

    const result = await signUp({
      username: username.trim(),
      email: email.trim(),
      password,
      joinDate,
    });

    if (result.ok) return;

    setBanner({
      tone: result.offline ? 'warning' : 'error',
      message: result.message,
    });
  }, [username, email, password, joinDate, signUp]);

  const errorFor = (field) => (showFieldErrors ? fieldErrors[field] || '' : '');

  return (
    <AuthScaffold
      onBack={() => navigation.goBack()}
      tag="WORKS OFFLINE AFTER THIS"
      title="Create your account"
      subtitle="One account per member. It takes a few seconds."
    >
      <View style={styles.form}>
        <MessageBanner tone={banner?.tone} message={banner?.message} />

        <AppTextField
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="e.g. sahil"
          error={errorFor('username')}
          autoCapitalize="none"
          textContentType="username"
        />

        <AppTextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          error={errorFor('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          textContentType="emailAddress"
        />

        <AppTextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Choose a password"
          error={errorFor('password')}
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
        />

        <JoinDateField
          value={joinDate}
          onChange={setJoinDate}
          error={errorFor('joinDate')}
          helper="Meals are tracked from this date onwards."
          maximumDate={new Date()}
        />

        <PrimaryButton
          label="CREATE ACCOUNT"
          icon="account-plus-outline"
          onPress={handleSubmit}
          loading={isWorking}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text style={styles.footerLink}>Login</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
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
