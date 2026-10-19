import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { IconBack } from '../components/icons';
import { Logo } from '../components/Logo';
import { draftFromMe, SECTIONS, SectionEditor, sectionPayload, sectionValid, type Draft } from '../components/ProfileEditor';
import { errorText } from '../components/ui';
import { useI18n, type Key } from '../i18n';
import { useMe, useSession } from '../session';

const TITLES: Record<(typeof SECTIONS)[number], Key> = {
  about: 'onb.about.title',
  where: 'onb.where.title',
  sports: 'onb.sports.title',
  rhythm: 'onb.rhythm.title',
  show: 'onb.profile.title',
};

export function Onboarding() {
  const { t } = useI18n();
  const me = useMe();
  const { setMe } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => draftFromMe(me));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const section = SECTIONS[step];
  const last = step === SECTIONS.length - 1;

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile({ ...sectionPayload(section, draft), ...(last ? { complete: true } : {}) });
      if (last) {
        setMe(updated);
        navigate('/discover');
      } else {
        setStep(step + 1);
        window.scrollTo(0, 0);
      }
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page--narrow onboarding">
      <header className="topbar">
        {step > 0 ? (
          <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label={t('onb.back')}>
            <IconBack />
          </button>
        ) : (
          <span className="icon-btn-spacer" />
        )}
        <Logo />
        <span className="icon-btn-spacer" />
      </header>
      <div className="progress" aria-hidden="true">
        {SECTIONS.map((s, i) => (
          <span key={s} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <p className="eyebrow">{t('onb.step', { n: step + 1, total: SECTIONS.length })}</p>
      <h1>{t(TITLES[section])}</h1>
      <SectionEditor section={section} draft={draft} update={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="sticky-cta">
        <button className="btn btn--primary btn--lg btn--block" disabled={busy || !sectionValid(section, draft)} onClick={next}>
          {last ? t('onb.finish') : t('onb.next')}
        </button>
      </div>
    </div>
  );
}
