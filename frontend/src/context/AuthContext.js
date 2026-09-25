/**
 * MessMate - signed-in session.
 *
 * OFFLINE-FIRST: the session is restored from AsyncStorage with NO network
 * call, so the app opens straight into the authenticated flow even in
 * airplane mode. Login and signup are the only actions that need internet.
 *
 * Only { id, username, email, joinDate } is ever written to the device.
 * There is no token, because the backend has no JWT and no sessions.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import * as api from '../services/api';
import { syncUserData } from '../services/sync';
import { clearLocalUser, getLocalUser, saveLocalUser } from '../services/storage';

const AuthContext = createContext(null);

// Shown when a sign-in fails because there is no connection. Deliberately
// different from api.OFFLINE_MESSAGE: this one must NOT sound like success.
const OFFLINE_SIGN_IN_MESSAGE =
  'You are offline. MessMate needs an internet connection the first time you ' +
  'sign in on a device. After that, the app works without internet.';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  /* ---------------------------------------------------------------- */
  /* Session restore - local only, no network, never blocks the UI     */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let saved = null;

      try {
        saved = await getLocalUser();
      } catch (error) {
        console.warn(`[auth] could not read the saved session: ${error?.message}`);
      }

      if (cancelled) return;

      if (saved?.id) setUser(saved);

      // Let the UI render first. Sync is best effort: if there is no
      // internet, or it fails, the user still gets into the app.
      setIsRestoring(false);

      if (!saved?.id) return;

      syncUserData(saved.id)
        .then((result) => {
          if (!cancelled) setLastSync(result);
        })
        .catch(() => {
          /* offline is not an error here */
        });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Sign in                                                          */
  /* ---------------------------------------------------------------- */
  const signIn = useCallback(async ({ identifier, password }) => {
    setIsWorking(true);

    try {
      // The ONLY call that must succeed over the network.
      const account = await api.loginUser({ identifier, password });

      const session = await saveLocalUser(account);
      setUser(session);

      // Now that we know who this is, pull their records down. A failure
      // here is reported but is NOT a failed sign-in.
      const sync = await syncUserData(session.id);
      setLastSync(sync);

      return { ok: true, sync };
    } catch (error) {
      const offline = api.isNetworkError(error);

      return {
        ok: false,
        offline,
        message: offline ? OFFLINE_SIGN_IN_MESSAGE : api.getErrorMessage(error),
      };
    } finally {
      setIsWorking(false);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* Sign up                                                          */
  /* ---------------------------------------------------------------- */
  const signUp = useCallback(async ({ username, email, password, joinDate }) => {
    setIsWorking(true);

    try {
      const account = await api.registerUser({ username, email, password, joinDate });

      const session = await saveLocalUser(account);
      setUser(session);

      // A brand new account has no records and no queued changes yet. The
      // empty local store is created on first read/write.
      setLastSync(null);

      return { ok: true };
    } catch (error) {
      const offline = api.isNetworkError(error);

      return {
        ok: false,
        offline,
        message: offline ? OFFLINE_SIGN_IN_MESSAGE : api.getErrorMessage(error),
      };
    } finally {
      setIsWorking(false);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* Sign out                                                         */
  /* ---------------------------------------------------------------- */
  const signOut = useCallback(async () => {
    // Removes ONLY the session identity. Meal records - and any queued
    // changes - stay on the device, so the same user can sign back in later
    // and still have their history. Nothing is ever deleted on logout.
    await clearLocalUser();

    setUser(null);
    setLastSync(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Manual sync (the future Profile "Download / Sync Records" button) */
  /* ---------------------------------------------------------------- */
  const syncNow = useCallback(async () => {
    if (!user?.id) {
      return { ok: false, online: false, message: 'You are not signed in.' };
    }

    setIsWorking(true);

    try {
      const result = await syncUserData(user.id);
      setLastSync(result);
      return result;
    } finally {
      setIsWorking(false);
    }
  }, [user]);

  const value = useMemo(
    () => ({ user, isRestoring, isWorking, lastSync, signIn, signUp, signOut, syncNow }),
    [user, isRestoring, isWorking, lastSync, signIn, signUp, signOut, syncNow],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }

  return context;
}

export default AuthContext;
