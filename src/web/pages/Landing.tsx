import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { Logo } from '../components/Logo';
import { IconBolt, IconCalendar, IconHeart, IconShield } from '../components/icons';
import { LanguagePicker } from '../components/LanguagePicker';
import { errorText, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { useSession } from '../session';

export function Landing() {
  const { t } = useI18n();
  const { demoAvailable, setMe } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const tryDemo = async () => {
    setBusy(true);
    try {
      setMe(await api.demoLogin());
      navigate('/discover');
    } catch (err) {
      toast(errorText(t, err));
      setBusy(false);
    }
  };

  const features = [
    { icon: <IconHeart size={22} />, title: t('landing.f1.title'), body: t('landing.f1.body') },
    { icon: <IconBolt size={22} />, title: t('landing.f2.title'), body: t('landing.f2.body') },
    { icon: <IconCalendar size={22} />, title: t('landing.f3.title'), body: t('landing.f3.body') },
    { icon: <IconShield size={22} />, title: t('landing.f4.title'), body: t('landing.f4.body') },
  ];

  return (
    <div className="landing">
      <header className="landing__top">
        <Logo />
        <LanguagePicker />
      </header>

      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">{t('app.tagline')}</p>
          <h1>{t('landing.title')}</h1>
          <p className="lead">{t('landing.lead')}</p>
          <div className="hero__ctas">
            <Link to="/signup" className="btn btn--primary btn--lg">
              {t('landing.signup')}
            </Link>
            {demoAvailable && (
              <button className="btn btn--volt btn--lg" onClick={tryDemo} disabled={busy}>
                <IconBolt size={18} /> {t('landing.demo')}
              </button>
            )}
          </div>
          <Link to="/login" className="link">
            {t('landing.login')}
          </Link>
        </div>

        <div className="hero__art" aria-hidden="true">
          <div className="mock mock--back">
            <div className="mock__img" style={{ background: 'linear-gradient(160deg, hsl(200 70% 58%), hsl(230 60% 32%))' }}>
              <span>🧗</span>
            </div>
            <div className="mock__line" />
            <div className="mock__line mock__line--short" />
          </div>
          <div className="mock mock--front">
            <div className="mock__img" style={{ background: 'linear-gradient(160deg, hsl(12 85% 62%), hsl(340 60% 38%))' }}>
              <span>🏃</span>
              <div className="mock__score">
                <strong>87%</strong>
                <small>{t('discover.trainingMatch')}</small>
              </div>
            </div>
            <div className="mock__chips">
              <span className="chip chip--shared">🏃 {t('sport.running')}</span>
              <span className="chip">🧘 {t('sport.yoga')}</span>
            </div>
            <div className="mock__line" />
          </div>
        </div>
      </section>

      <section className="features">
        {features.map((f) => (
          <div className="feature" key={f.title}>
            <span className="feature__icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="landing__foot">
        <span>{t('landing.footer')}</span>
        <span>
          <Link to="/legal/terms">{t('auth.termsLink')}</Link> · <Link to="/legal/privacy">{t('auth.privacyLink')}</Link>
        </span>
      </footer>
    </div>
  );
}
