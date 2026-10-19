import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@spotter/shared/types';
import { api, restoreToken } from './api';
import { useI18n } from './i18n';

interface Session {
  /** undefined while loading, null when logged out */
  me: Me | null | undefined;
  setMe: (me: Me | null) => void;
  demoAvailable: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null | undefined>(undefined);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const { setLang } = useI18n();

  const setMe = useCallback(
    (next: Me | null) => {
      setMeState(next);
      if (next) setLang(next.preferences.language);
    },
    [setLang],
  );

  useEffect(() => {
    restoreToken()
      .then(() => api.me())
      .then(setMe, () => setMeState(null));
    api.meta().then((m) => setDemoAvailable(m.demo), () => {});
  }, [setMe]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setMeState(null);
  }, []);

  return <SessionContext.Provider value={{ me, setMe, demoAvailable, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** For screens behind the login: `me` is guaranteed. */
export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error('useMe without a session');
  return me;
}
