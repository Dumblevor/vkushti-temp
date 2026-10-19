import { useMemo, useRef, useState } from 'react';
import {
  CITIES, GENDERS, GOALS, LEVELS, MAX_PHOTOS, MAX_SPORTS, SPORTS, TRAINING_TIMES,
  type Gender, type Goal, type TrainingTime,
} from '@spotter/shared/catalog';
import type { Me, SportEntry } from '@spotter/shared/types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { assetUrl } from '../native';
import { useSession } from '../session';
import { IconPlus, IconX } from './icons';
import { Chip, errorText, useToast } from './ui';

export interface Draft {
  gender: Gender | null;
  interestedIn: Gender[];
  sensitiveConsent: boolean;
  cityId: string | null;
  gym: string;
  sports: SportEntry[];
  trainingTimes: TrainingTime[];
  frequency: number;
  goals: Goal[];
  bio: string;
  workoutIdea: string;
}

export const draftFromMe = (me: Me): Draft => ({
  gender: me.gender,
  interestedIn: me.interestedIn,
  sensitiveConsent: me.consents.sensitive,
  cityId: me.cityId,
  gym: me.gym,
  sports: me.sports,
  trainingTimes: me.trainingTimes,
  frequency: me.frequency,
  goals: me.goals,
  bio: me.bio,
  workoutIdea: me.workoutIdea,
});

export type Section = 'about' | 'where' | 'sports' | 'rhythm' | 'show';
export const SECTIONS: Section[] = ['about', 'where', 'sports', 'rhythm', 'show'];

export function sectionValid(section: Section, d: Draft) {
  switch (section) {
    case 'about':
      return !!d.gender && d.interestedIn.length > 0 && d.sensitiveConsent;
    case 'where':
      return !!d.cityId;
    case 'sports':
      return d.sports.length > 0;
    case 'rhythm':
      return d.trainingTimes.length > 0;
    case 'show':
      return true;
  }
}

export function sectionPayload(section: Section, d: Draft): Record<string, unknown> {
  switch (section) {
    case 'about':
      return { gender: d.gender, interestedIn: d.interestedIn, ...(d.sensitiveConsent ? { sensitiveConsent: true } : {}) };
    case 'where':
      return { cityId: d.cityId, gym: d.gym };
    case 'sports':
      return { sports: d.sports };
    case 'rhythm':
      return { trainingTimes: d.trainingTimes, frequency: d.frequency, goals: d.goals };
    case 'show':
      return { bio: d.bio, workoutIdea: d.workoutIdea };
  }
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const flag = (country: string) => String.fromCodePoint(...[...country].map((c) => 0x1f1a5 + c.charCodeAt(0)));

interface Props {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}

export function AboutSection({ draft, update, consentLocked }: Props & { consentLocked?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <fieldset className="fieldset">
        <legend>{t('onb.about.gender')}</legend>
        <div className="chips">
          {GENDERS.map((g) => (
            <Chip key={g} selected={draft.gender === g} onClick={() => update({ gender: g })}>
              {t(`gender.${g}`)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>{t('onb.about.interested')}</legend>
        <div className="chips">
          {GENDERS.map((g) => (
            <Chip key={g} selected={draft.interestedIn.includes(g)} onClick={() => update({ interestedIn: toggle(draft.interestedIn, g) })}>
              {t(`genderPlural.${g}`)}
            </Chip>
          ))}
        </div>
      </fieldset>
      {!consentLocked && (
        <label className="check check--card">
          <input type="checkbox" checked={draft.sensitiveConsent} onChange={(e) => update({ sensitiveConsent: e.target.checked })} />
          <span>{t('onb.about.consent')}</span>
        </label>
      )}
    </div>
  );
}

export function WhereSection({ draft, update }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const cities = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const sorted = [...CITIES].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
    return q ? sorted.filter((c) => `${c.name} ${c.id} ${c.country}`.toLocaleLowerCase().includes(q)) : sorted;
  }, [query]);
  const selected = CITIES.find((c) => c.id === draft.cityId);

  return (
    <div className="stack">
      <div className="field">
        <span>{t('onb.where.city')}</span>
        {selected && (
          <p className="selected-city">
            {flag(selected.country)} <strong>{selected.name}</strong>
          </p>
        )}
        <input type="search" placeholder={t('onb.where.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="city-list" role="listbox" aria-label={t('onb.where.city')}>
          {cities.map((c) => (
            <button
              type="button"
              key={c.id}
              role="option"
              aria-selected={c.id === draft.cityId}
              className={`city ${c.id === draft.cityId ? 'city--on' : ''}`}
              onClick={() => update({ cityId: c.id })}
            >
              <span>{flag(c.country)}</span> {c.name}
            </button>
          ))}
        </div>
        <small className="hint">{t('onb.where.cityHint')}</small>
      </div>
      <label className="field">
        <span>{t('onb.where.gym')}</span>
        <input value={draft.gym} maxLength={80} placeholder={t('onb.where.gymPlaceholder')} onChange={(e) => update({ gym: e.target.value })} />
      </label>
    </div>
  );
}

export function SportsSection({ draft, update }: Props) {
  const { t } = useI18n();
  const picked = new Map(draft.sports.map((s) => [s.id, s.level]));
  const flip = (id: SportEntry['id']) =>
    update({
      sports: picked.has(id)
        ? draft.sports.filter((s) => s.id !== id)
        : draft.sports.length < MAX_SPORTS
          ? [...draft.sports, { id, level: 'regular' }]
          : draft.sports,
    });

  return (
    <div className="stack">
      <p className="hint">{t('onb.sports.hint', { max: MAX_SPORTS })}</p>
      <div className="sport-grid">
        {SPORTS.map((s) => (
          <button
            type="button"
            key={s.id}
            className={`sport-tile ${picked.has(s.id) ? 'sport-tile--on' : ''}`}
            aria-pressed={picked.has(s.id)}
            onClick={() => flip(s.id)}
            disabled={!picked.has(s.id) && draft.sports.length >= MAX_SPORTS}
          >
            <span className="sport-tile__emoji" aria-hidden="true">
              {s.emoji}
            </span>
            {t(`sport.${s.id}`)}
          </button>
        ))}
      </div>
      {draft.sports.length > 0 && (
        <div className="levels">
          {draft.sports.map((s) => (
            <div className="level-row" key={s.id}>
              <span>{t(`sport.${s.id}`)}</span>
              <select
                value={s.level}
                aria-label={t(`sport.${s.id}`)}
                onChange={(e) =>
                  update({ sports: draft.sports.map((x) => (x.id === s.id ? { ...x, level: e.target.value as SportEntry['level'] } : x)) })
                }
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`level.${l}`)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RhythmSection({ draft, update }: Props) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <fieldset className="fieldset">
        <legend>{t('onb.rhythm.times')}</legend>
        <div className="chips">
          {TRAINING_TIMES.map((x) => (
            <Chip key={x} selected={draft.trainingTimes.includes(x)} onClick={() => update({ trainingTimes: toggle(draft.trainingTimes, x) })}>
              {t(`time.${x}`)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>
          {t('onb.rhythm.frequency')}: <strong>{draft.frequency}</strong>
        </span>
        <input type="range" min={1} max={14} value={draft.frequency} onChange={(e) => update({ frequency: Number(e.target.value) })} />
      </label>
      <fieldset className="fieldset">
        <legend>{t('onb.rhythm.goals')}</legend>
        <div className="chips">
          {GOALS.map((g) => (
            <Chip key={g} selected={draft.goals.includes(g)} onClick={() => update({ goals: toggle(draft.goals, g) })}>
              {t(`goal.${g}`)}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Downscale and re-encode in the browser: smaller uploads, and EXIF/GPS never leaves the device. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86));
}

export function ShowSection({ draft, update }: Props) {
  const { t } = useI18n();
  const { me, setMe } = useSession();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photos = me?.photos ?? [];

  const add = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setMe(await api.uploadPhoto(await toJpeg(file)));
    } catch (err) {
      toast(errorText(t, err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="stack">
      <label className="field">
        <span>{t('onb.profile.bio')}</span>
        <textarea rows={4} maxLength={500} value={draft.bio} placeholder={t('onb.profile.bioPlaceholder')} onChange={(e) => update({ bio: e.target.value })} />
      </label>
      <label className="field">
        <span>{t('onb.profile.idea')}</span>
        <input maxLength={140} value={draft.workoutIdea} placeholder={t('onb.profile.ideaPlaceholder')} onChange={(e) => update({ workoutIdea: e.target.value })} />
      </label>
      <div className="field">
        <span>{t('onb.profile.photos')}</span>
        <div className="photo-grid">
          {photos.map((p) => (
            <div className="photo-slot" key={p.id}>
              <img src={assetUrl(p.url)} alt="" />
              <button
                type="button"
                className="photo-slot__remove"
                aria-label={t('common.close')}
                onClick={async () => setMe(await api.deletePhoto(p.id))}
              >
                <IconX size={14} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" className="photo-slot photo-slot--add" onClick={() => input.current?.click()} disabled={uploading}>
              <IconPlus />
              <span>{t('onb.profile.addPhoto')}</span>
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => add(e.target.files?.[0])} />
        <small className="hint">{t('onb.profile.photosHint')}</small>
      </div>
    </div>
  );
}

export function SectionEditor({ section, ...props }: Props & { section: Section; consentLocked?: boolean }) {
  switch (section) {
    case 'about':
      return <AboutSection {...props} />;
    case 'where':
      return <WhereSection {...props} />;
    case 'sports':
      return <SportsSection {...props} />;
    case 'rhythm':
      return <RhythmSection {...props} />;
    case 'show':
      return <ShowSection {...props} />;
  }
}
