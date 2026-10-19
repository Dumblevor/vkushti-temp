import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router';
import { api } from './api';
import { IconChat, IconCompass, IconUser } from './components/icons';
import { Spinner } from './components/ui';
import { useI18n } from './i18n';
import { Auth } from './pages/Auth';
import { Chat } from './pages/Chat';
import { Discover } from './pages/Discover';
import { Landing } from './pages/Landing';
import { Legal } from './pages/Legal';
import { Matches } from './pages/Matches';
import { Onboarding } from './pages/Onboarding';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { UserView } from './pages/UserView';
import { hideSplash } from './native';
import { useSession } from './session';

export function App() {
  const { me } = useSession();
  const ready = me !== undefined;
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);
  if (me === undefined) {
    return (
      <div className="splash">
        <Spinner />
      </div>
    );
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/legal/:doc" element={<Legal />} />
        {!me ? (
          <>
            <Route path="/" element={<Landing />} />
            <Route path="/signup" element={<Auth mode="signup" />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : !me.onboarded ? (
          <>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </>
        ) : (
          <>
            <Route element={<Shell />}>
              <Route path="/discover" element={<Discover />} />
              <Route path="/matches" element={<Matches />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="/matches/:id" element={<Chat />} />
            <Route path="/u/:id" element={<UserView />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/discover" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

function Shell() {
  const { t } = useI18n();
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.matches().then(
        ({ matches }) => alive && setBadge(matches.filter((m) => m.status === 'your_move' || m.unread > 0).length),
        () => {},
      );
    load();
    const id = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const tab = (to: string, label: string, icon: ReactNode, count = 0) => (
    <NavLink to={to} className={({ isActive }) => `tab ${isActive ? 'tab--on' : ''}`}>
      <span className="tab__icon">
        {icon}
        {count > 0 && <span className="badge">{count}</span>}
      </span>
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="shell">
      <main className="shell__main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        {tab('/discover', t('nav.discover'), <IconCompass />)}
        {tab('/matches', t('nav.matches'), <IconChat />, badge)}
        {tab('/profile', t('nav.profile'), <IconUser />)}
      </nav>
    </div>
  );
}
