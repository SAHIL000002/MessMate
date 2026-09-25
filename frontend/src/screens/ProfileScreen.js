/**
 * MessMate - PROFILE (final).
 *
 * Follows the Stitch Profile mockup: the brand row, a centred avatar with the
 * gold verified badge, the member's name and email, an information card, the
 * MEAL REPORT card with DOWNLOAD REPORT, a SYNC RECORDS button and LOGOUT.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW
 * ----------------------------------
 * No password, no token, no internal id. The session only ever holds
 * { id, username, email, joinDate } and only the last three are displayed.
 * There is no "mess number" and no "active member" badge, because the User
 * model has no such fields and this app must not invent them.
 *
 * ONE SOURCE OF DATA: the report and the sync button both work from the SAME
 * shared meal state that Home and Meals read (`context/MealContext.js`), so the
 * PDF, the Home counters and the Meals table can never quote different numbers.
 *
 * OFFLINE: the report is built from the records on this device, so a member in
 * airplane mode - or with changes that have not uploaded yet - still gets a
 * complete report. Nothing on this screen requires the network except the
 * optional SYNC RECORDS button, and even that failing is a friendly message.
 */

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import MessageBanner from '../components/MessageBanner';
import MessMateLogo from '../components/MessMateLogo';
import PrimaryButton from '../components/PrimaryButton';
import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useMeals } from '../context/MealContext';
import { shareMealReport } from '../services/report';
import { formatDisplayDate } from '../utils/date';
import { displayName, initialsFor } from '../utils/user';

/** One labelled fact. Values here are real: nothing is invented for display. */
function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={17} color={colors.secondary} />

      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  // The shared meal state - the same object Home and Meals render.
  const { summary, history, pending, pendingItems, today, syncNow } = useMeals();

  const [busy, setBusy] = useState(null); // 'sync' | 'report' | 'logout'
  const [banner, setBanner] = useState(null);

  const name = displayName(user);
  const initials = initialsFor(user);
  const records = summary?.records ?? 0;

  /* ---------------------------------------------------------------- */
  /* Sync records - upload the queue, then download the server's copy  */
  /* ---------------------------------------------------------------- */

  const handleSync = useCallback(async () => {
    if (busy) return;

    setBanner(null);
    setBusy('sync');

    try {
      // Never throws: "offline" is one of the normal outcomes.
      const result = await syncNow();

      if (result?.ok) {
        setBanner({ tone: 'success', message: result.message });
      } else if (result?.online === false) {
        setBanner({
          tone: 'warning',
          message: "You're offline. Your local records are still available.",
        });
      } else {
        setBanner({
          tone: 'error',
          message: result?.message || 'Could not reach the server. Your records are safe.',
        });
      }
    } catch (error) {
      setBanner({
        tone: 'error',
        message: 'Could not reach the server. Your records on this device are safe.',
      });
    } finally {
      setBusy(null);
    }
  }, [busy, syncNow]);

  /* ---------------------------------------------------------------- */
  /* Download report - Offline. Built from this device.                */
  /* ---------------------------------------------------------------- */

  const handleReport = useCallback(async () => {
    if (busy) return;

    setBanner(null);
    setBusy('report');

    try {
      // The rows are the very same ones the Meals table shows, so the PDF and
      // the app never disagree - including changes that have not uploaded yet.
      const result = await shareMealReport({
        user,
        rows: history,
        pending: pendingItems,
        today,
      });

      if (result.ok) {
        setBanner({
          tone: 'success',
          message: `Report ready - ${result.fileName} (${result.rows} ${
            result.rows === 1 ? 'day' : 'days'
          }).`,
        });
      } else {
        // A cancelled share is not a failed report, and a failed report is
        // never described as a success.
        setBanner({ tone: result.reason === 'share' ? 'warning' : 'error', message: result.message });
      }
    } catch (error) {
      setBanner({ tone: 'error', message: 'Could not create the report. Please try again.' });
    } finally {
      setBusy(null);
    }
  }, [busy, history, pendingItems, today, user]);

  /* ---------------------------------------------------------------- */
  /* Logout - only the session, never the meal history                 */
  /* ---------------------------------------------------------------- */

  const handleLogout = useCallback(async () => {
    if (busy) return;

    setBanner(null);
    setBusy('logout');

    try {
      // Removes ONLY the session identity. Meal records and the upload queue
      // stay on the device, so signing back in restores the history.
      await signOut();
    } catch (error) {
      setBanner({ tone: 'error', message: 'Could not log out. Please try again.' });
      setBusy(null);
    }
  }, [busy, signOut]);

  const anyBusy = Boolean(busy);
  const waitingLabel = pending
    ? `${pending} ${pending === 1 ? 'day' : 'days'}`
    : 'Nothing';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Brand row, the same lockup Home, Meals and the PDF report use */}
        <View style={styles.topBar}>
          <MessMateLogo size="sm" />

          <View style={styles.topAvatar}>
            <Text style={styles.topAvatarText}>{initials}</Text>
          </View>
        </View>

        {/* Profile header - the mockup's centred avatar with the gold badge */}
        <View style={[styles.headerCard, shadows.card]}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.badge}>
              <MaterialCommunityIcons name="check-decagram" size={15} color={colors.secondary} />
            </View>
          </View>

          <Text style={styles.name}>{name}</Text>
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
          {user?.joinDate ? (
            <Text style={styles.joined}>{`MESS JOINED ${formatDisplayDate(user.joinDate)}`}</Text>
          ) : null}
        </View>

        {/* Sync results, report results and failures - one place, plain words */}
        <MessageBanner tone={banner?.tone} message={banner?.message} />

        {/* Real values only: the session's join date and what this device holds */}
        <View style={[styles.infoCard, shadows.card]}>
          <InfoRow
            icon="calendar-check-outline"
            label="MESS JOINED"
            value={user?.joinDate ? formatDisplayDate(user.joinDate) : '-'}
          />

          <View style={styles.infoDivider} />

          <InfoRow
            icon="database-outline"
            label="RECORDS ON THIS DEVICE"
            value={`${records} ${records === 1 ? 'day' : 'days'}`}
          />

          <View style={styles.infoDivider} />

          <InfoRow
            icon={pending ? 'cloud-upload-outline' : 'cloud-check-outline'}
            label="WAITING TO UPLOAD"
            value={waitingLabel}
          />
        </View>

        {/* MEAL REPORT */}
        <View style={[styles.reportCard, shadows.card]}>
          <View style={styles.reportHead}>
            <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.primary} />
            <Text style={styles.reportTitle}>MEAL REPORT</Text>
          </View>

          <Text style={styles.reportBody}>
            Every date from your join date to today, with breakfast, dinner, day, and your EATEN
            totals. Built on this device, so it works offline.
          </Text>

          <PrimaryButton
            label="DOWNLOAD REPORT"
            icon="download"
            onPress={handleReport}
            loading={busy === 'report'}
            disabled={anyBusy}
          />
        </View>

        <PrimaryButton
          label="SYNC RECORDS"
          icon="cloud-download-outline"
          variant="ghost"
          onPress={handleSync}
          loading={busy === 'sync'}
          disabled={anyBusy}
        />

        <PrimaryButton
          label="LOGOUT"
          icon="logout"
          variant="danger"
          onPress={handleLogout}
          loading={busy === 'logout'}
          disabled={anyBusy}
        />

        <Text style={styles.note}>
          Logging out only signs you out on this device. Your meal records stay here.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md + 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAvatarText: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.onPrimary,
    letterSpacing: 0.5,
  },
  headerCard: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  avatarWrap: {
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.headlineMd,
    fontFamily: fontFamily.extrabold,
    color: colors.onPrimary,
    letterSpacing: 1,
  },
  // The gold verified badge from the mockup, sitting on the avatar's corner.
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 2,
    borderColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    ...typography.headlineSm,
    fontFamily: fontFamily.bold,
    color: colors.onSurface,
    textAlign: 'center',
  },
  email: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  joined: {
    ...typography.labelSm,
    fontFamily: fontFamily.semibold,
    color: colors.outline,
    letterSpacing: 0.6,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
  },
  infoText: {
    flex: 1,
    gap: 1,
  },
  infoLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.medium,
    fontSize: 9,
    color: colors.outline,
    letterSpacing: 0.6,
  },
  infoValue: {
    ...typography.bodyMd,
    fontFamily: fontFamily.semibold,
    color: colors.onSurface,
    flexShrink: 1,
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.surfaceContainerHigh,
  },
  reportCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  reportHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reportTitle: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.primary,
    letterSpacing: 0.8,
  },
  reportBody: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  note: {
    ...typography.labelSm,
    color: colors.outline,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
});
