/**
 * MessMate - PROFILE tab (TEMPORARY PLACEHOLDER, PHASE 3).
 *
 * Deliberately not the real Profile screen: no editing, no report download,
 * no settings. What it DOES have is the one thing that must keep working in
 * this phase - LOGOUT, through the existing AuthContext `signOut()`.
 *
 * The signed-in name and email are shown so nobody logs out of an account
 * they were not expecting, and the join date is read-only context.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MessageBanner from '../components/MessageBanner';
import PlaceholderScreen from '../components/PlaceholderScreen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, fontFamily, radius, spacing, typography } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { formatDisplayDate } from '../utils/date';
import { displayName, initialsFor } from '../utils/user';

export default function ProfilePlaceholderScreen() {
  const { user, signOut } = useAuth();

  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogout() {
    setError(null);
    setSigningOut(true);

    try {
      // Removes ONLY the session. Meal records stay on this device.
      await signOut();
    } catch (signOutError) {
      setError('Could not log out. Please try again.');
      setSigningOut(false);
    }
  }

  return (
    <PlaceholderScreen
      icon="account-outline"
      tag="PHASE 5"
      title="PROFILE"
      message="Profile will be available here."
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsFor(user)}</Text>
        </View>

        <View style={styles.identityText}>
          <Text style={styles.name}>{displayName(user)}</Text>
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
          {user?.joinDate ? (
            <Text style={styles.joinDate}>{`Mess joined ${formatDisplayDate(user.joinDate)}`}</Text>
          ) : null}
        </View>
      </View>

      <MessageBanner tone="error" message={error} />

      <PrimaryButton
        label="LOGOUT"
        icon="logout"
        variant="danger"
        onPress={handleLogout}
        loading={signingOut}
      />
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.onPrimary,
    letterSpacing: 0.5,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bold,
    color: colors.onSurface,
  },
  email: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  joinDate: {
    ...typography.labelSm,
    color: colors.outline,
  },
});
