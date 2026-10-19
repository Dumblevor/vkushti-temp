import { useState } from 'react';
import { Link } from 'react-router';
import { cityById } from '../../shared/catalog';
import { api } from '../api';
import { ProfileCard } from '../components/ProfileCard';
import { draftFromMe, SectionEditor, sectionPayload, sectionValid, type Draft, type Section } from '../components/ProfileEditor';
import { errorText, Sheet, useToast } from '../components/ui';
import { useI18n, useListFormat, type Key } from '../i18n';
import { useMe, useSession } from '../session';

const SECTION_TITLES: Record<Section, Key> = {
  about: 'profile.sectionAbout',
  where: 'profile.sectionWhere',
  sports: 'profile.sectionSports',
  rhythm: 'profile.sectionRhythm',
  show: 'profile.sectionShow',
};

export function Profile() {
  const { t } = useI18n();
  const list = useListFormat();
  const me = useMe();
  const { setMe } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState<Section | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFromMe(me));

  const summaries: Record<Section, string> = {
    about: me.gender ? `${t(`gender.${me.gender}`)} · ${list(me.interestedIn.map((g) => t(`genderPlural.${g}`)))}` : '',
    where: [cityById(me.cityId)?.name, me.gym].filter(Boolean).join(' · '),
    sports: list(me.sports.map((s) => t(`sport.${s.id}`))),
    rhythm: `${list(me.trainingTimes.map((x) => t(`time.${x}`)))} · ${t('discover.perWeek', { n: me.frequency })}`,
    show: me.bio || '—',
  };

  const open = (s: Section) => {
    setDraft(draftFromMe(me));
    setEditing(s);
  };

  const save = async () => {
    if (!editing) return;
    try {
      setMe(await api.updateProfile(sectionPayload(editing, draft)));
      setEditing(null);
      toast(t('profile.saved'));
    } catch (err) {
      toast(errorText(t, err));
    }
  };

  return (
    <div className="profile">
      <header className="topbar topbar--app">
        <h1 className="topbar__title">{t('profile.title')}</h1>
        <Link to="/settings" className="btn btn--ghost btn--small">
          {t('profile.settings')}
        </Link>
      </header>

      <section>
        <h2 className="section-title">{t('profile.preview')}</h2>
        <div className="preview">
          <ProfileCard profile={me} />
        </div>
      </section>

      <section>
        <h2 className="section-title">{t('profile.edit')}</h2>
        <ul className="edit-list">
          {(Object.keys(SECTION_TITLES) as Section[]).map((s) => (
            <li key={s}>
              <button onClick={() => open(s)}>
                <span>
                  <strong>{t(SECTION_TITLES[s])}</strong>
                  <small>{summaries[s]}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? t(SECTION_TITLES[editing]) : ''}>
        {editing && (
          <div className="stack">
            <SectionEditor
              section={editing}
              draft={draft}
              update={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              consentLocked={me.consents.sensitive}
            />
            <button className="btn btn--primary btn--block btn--lg" disabled={!sectionValid(editing, draft)} onClick={save}>
              {t('profile.save')}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
