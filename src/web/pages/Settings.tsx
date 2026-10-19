import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { IconBack, IconDownload } from '../components/icons';
import { LanguagePicker } from '../components/LanguagePicker';
import { errorText, Sheet, Toggle, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { useMe, useSession } from '../session';
import { DiscoveryControls } from './Discover';

export function Settings() {
  const { t } = useI18n();
  const me = useMe();
  const { setMe, logout } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState({ ageMin: me.preferences.ageMin, ageMax: me.preferences.ageMax, maxDistanceKm: me.preferences.maxDistanceKm });
  const [blocks, setBlocks] = useState<{ id: string; name: string }[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    api.blocks().then((r) => setBlocks(r.blocks), () => {});
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      toast(errorText(t, err));
    }
  };

  const dirty =
    prefs.ageMin !== me.preferences.ageMin || prefs.ageMax !== me.preferences.ageMax || prefs.maxDistanceKm !== me.preferences.maxDistanceKm;

  return (
    <div className="page page--narrow settings">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label={t('chat.back')}>
          <IconBack />
        </button>
        <h1 className="topbar__title">{t('settings.title')}</h1>
        <span className="icon-btn-spacer" />
      </header>

      {me.onboarded && (
        <section className="card-section">
          <h2>{t('settings.discovery')}</h2>
          <DiscoveryControls value={prefs} onChange={setPrefs} />
          {dirty && (
            <button className="btn btn--primary btn--block" onClick={() => run(async () => setMe(await api.updatePreferences(prefs)))}>
              {t('profile.save')}
            </button>
          )}
          <Toggle checked={me.snoozed} onChange={(v) => run(async () => setMe(await api.snooze(v)))} label={t('settings.snooze')} hint={t('settings.snoozeHint')} />
        </section>
      )}

      <section className="card-section">
        <h2>{t('lang.label')}</h2>
        <LanguagePicker onChange={(language) => run(async () => setMe(await api.updatePreferences({ language })))} />
      </section>

      <section className="card-section">
        <h2>{t('settings.privacy')}</h2>
        <a className="btn btn--ghost btn--block" href="/api/me/export" download>
          <IconDownload size={18} /> {t('settings.export')}
        </a>
        <p className="hint">{t('settings.exportHint')}</p>
        <Toggle
          checked={me.consents.marketing}
          onChange={(v) => run(async () => setMe(await api.consents({ marketing: v })))}
          label={t('settings.marketing')}
        />
        <Toggle
          checked={me.consents.sensitive}
          onChange={(v) =>
            run(async () => {
              if (!v && !confirm(t('settings.sensitiveConfirm'))) return;
              setMe(await api.consents({ sensitive: v }));
            })
          }
          label={t('settings.sensitive')}
          hint={t('settings.sensitiveHint')}
        />
        <h3>{t('settings.blocked')}</h3>
        {blocks.length === 0 ? (
          <p className="hint">{t('settings.noBlocked')}</p>
        ) : (
          <ul className="plain-list">
            {blocks.map((b) => (
              <li key={b.id}>
                <span>{b.name}</span>
                <button
                  className="btn btn--ghost btn--small"
                  onClick={() =>
                    run(async () => {
                      await api.unblock(b.id);
                      setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                    })
                  }
                >
                  {t('settings.unblock')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section">
        <h2>{t('settings.account')}</h2>
        <p className="hint">{me.email}</p>
        <button className="btn btn--ghost btn--block" onClick={logout}>
          {t('settings.logout')}
        </button>
        <button className="btn btn--danger-ghost btn--block" onClick={() => setDeleting(true)}>
          {t('settings.delete')}
        </button>
        <p className="hint">{t('settings.deleteHint')}</p>
      </section>

      <section className="card-section">
        <h2>{t('settings.legal')}</h2>
        <p>
          <Link to="/legal/terms">{t('auth.termsLink')}</Link> · <Link to="/legal/privacy">{t('auth.privacyLink')}</Link>
        </p>
      </section>

      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t('settings.delete')}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.deleteAccount(password);
              setMe(null);
              navigate('/', { replace: true });
            });
          }}
        >
          <p>{t('settings.deleteConfirm')}</p>
          <label className="field">
            <span>{t('auth.password')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          <button className="btn btn--danger btn--block">{t('settings.deleteButton')}</button>
        </form>
      </Sheet>
    </div>
  );
}
