import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { IconBack } from '../components/icons';
import { LanguagePicker } from '../components/LanguagePicker';
import { Logo } from '../components/Logo';
import { errorText } from '../components/ui';
import { useI18n } from '../i18n';
import { useSession } from '../session';

export function Auth({ mode }: { mode: 'signup' | 'login' }) {
  const { t, lang } = useI18n();
  const { setMe, demoAvailable } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', birthdate: '', terms: false, privacy: false, marketing: false });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me =
        mode === 'signup'
          ? await api.signup({
              name: form.name,
              email: form.email,
              password: form.password,
              birthdate: form.birthdate,
              language: lang,
              consents: { terms: form.terms, privacy: form.privacy, marketing: form.marketing },
            })
          : await api.login(form.email, form.password);
      setMe(me);
      navigate(me.onboarded ? '/discover' : '/onboarding');
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  };

  const linkify = (text: string, token: string, to: string, label: string) => {
    const [before, after] = text.split(token);
    return (
      <>
        {before}
        <Link to={to} target="_blank">
          {label}
        </Link>
        {after}
      </>
    );
  };

  const maxBirthdate = new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().slice(0, 10);

  return (
    <div className="page page--narrow auth">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label={t('chat.back')}>
          <IconBack />
        </Link>
        <Logo />
        <LanguagePicker />
      </header>
      <h1>{mode === 'signup' ? t('auth.signupTitle') : t('auth.loginTitle')}</h1>
      <form onSubmit={submit} className="form">
        {mode === 'signup' && (
          <label className="field">
            <span>{t('auth.name')}</span>
            <input value={form.name} onChange={set('name')} required maxLength={40} autoComplete="given-name" />
          </label>
        )}
        <label className="field">
          <span>{t('auth.email')}</span>
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label className="field">
          <span>{t('auth.password')}</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={mode === 'signup' ? 10 : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
          {mode === 'signup' && <small className="hint">{t('auth.passwordHint')}</small>}
        </label>
        {mode === 'signup' && (
          <>
            <label className="field">
              <span>{t('auth.birthdate')}</span>
              <input type="date" value={form.birthdate} onChange={set('birthdate')} required max={maxBirthdate} autoComplete="bday" />
              <small className="hint">{t('auth.birthdateHint')}</small>
            </label>
            <div className="consents">
              <label className="check">
                <input type="checkbox" checked={form.terms} onChange={set('terms')} required />
                <span>{linkify(t('auth.terms'), '{terms}', '/legal/terms', t('auth.termsLink'))}</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={form.privacy} onChange={set('privacy')} required />
                <span>{linkify(t('auth.privacy'), '{privacy}', '/legal/privacy', t('auth.privacyLink'))}</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={form.marketing} onChange={set('marketing')} />
                <span>{t('auth.marketing')}</span>
              </label>
            </div>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--primary btn--lg btn--block" disabled={busy}>
          {mode === 'signup' ? t('auth.submitSignup') : t('auth.submitLogin')}
        </button>
      </form>
      <p className="auth__switch">
        <Link to={mode === 'signup' ? '/login' : '/signup'} className="link">
          {mode === 'signup' ? t('auth.toLogin') : t('auth.toSignup')}
        </Link>
      </p>
      {mode === 'login' && demoAvailable && <p className="hint center">{t('auth.demoHint')}</p>}
    </div>
  );
}
