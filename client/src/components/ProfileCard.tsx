import { useState } from 'react';
import { cityById, sportEmoji, type SportId, type TrainingTime } from '@spotter/shared/catalog';
import type { PublicProfile } from '@spotter/shared/types';
import { useI18n, useInlineLabel, useListFormat } from '../i18n';
import { assetUrl } from '../native';
import { IconBolt, IconPin, IconVerified } from './icons';
import { Placeholder } from './ProfileImage';

export interface CardExtras {
  distanceKm?: number | null;
  score?: number;
  sharedSports?: SportId[];
  sharedTimes?: TrainingTime[];
  spotRequest?: { note: string } | null;
}

export function ProfileCard({ profile, extras = {} }: { profile: PublicProfile; extras?: CardExtras }) {
  const { t } = useI18n();
  const list = useListFormat();
  const inline = useInlineLabel();
  const [photo, setPhoto] = useState(0);
  const city = cityById(profile.cityId);
  const shared = new Set(extras.sharedSports ?? []);
  const photos = profile.photos;

  const location =
    extras.distanceKm === undefined || extras.distanceKm === null
      ? city?.name
      : extras.distanceKm < 5
        ? `${city?.name} · ${t('discover.sameCity')}`
        : `${city?.name} · ${t('discover.kmAway', { km: extras.distanceKm })}`;

  return (
    <article className="pcard">
      <div className="pcard__media">
        {photos.length ? (
          <>
            <img src={assetUrl(photos[photo].url)} alt="" draggable={false} />
            {photos.length > 1 && (
              <>
                <div className="pcard__dots">
                  {photos.map((p, i) => (
                    <span key={p.id} className={i === photo ? 'on' : ''} />
                  ))}
                </div>
                <button className="pcard__tap pcard__tap--prev" aria-label={t('card.prevPhoto')} onClick={() => setPhoto((p) => Math.max(0, p - 1))} />
                <button className="pcard__tap pcard__tap--next" aria-label={t('card.nextPhoto')} onClick={() => setPhoto((p) => Math.min(photos.length - 1, p + 1))} />
              </>
            )}
          </>
        ) : (
          <Placeholder who={profile} />
        )}
        <div className="pcard__shade" />
        <div className="pcard__headline">
          {extras.spotRequest && (
            <div className="spot-flag">
              <IconBolt size={14} /> {t('discover.spotBadge')}
            </div>
          )}
          <h2>
            {profile.name}, <span className="pcard__age">{profile.age}</span>
            {profile.verified && (
              <span className="verified" title={t('discover.verified')}>
                <IconVerified size={22} />
              </span>
            )}
          </h2>
          {location && (
            <p className="pcard__loc">
              <IconPin size={15} /> {location}
            </p>
          )}
        </div>
        {extras.score !== undefined && (
          <div className="score-badge" aria-label={`${extras.score}% ${t('discover.trainingMatch')}`}>
            <strong>{extras.score}%</strong>
            <span>{t('discover.trainingMatch')}</span>
          </div>
        )}
      </div>

      <div className="pcard__body">
        {extras.spotRequest?.note && <blockquote className="spot-note">“{extras.spotRequest.note}”</blockquote>}
        {!!extras.sharedSports?.length && (
          <p className="shared-line">{t('discover.bothDo', { list: list(extras.sharedSports.map((s) => inline(t(`sport.${s}`)))) })}</p>
        )}

        <div className="chips">
          {profile.sports.map((s) => (
            <span key={s.id} className={`chip chip--sport ${shared.has(s.id) ? 'chip--shared' : ''}`}>
              <span aria-hidden="true">{sportEmoji(s.id)}</span> {t(`sport.${s.id}`)}
              <small>{t(`level.${s.level}`)}</small>
            </span>
          ))}
        </div>

        {profile.bio && <p className="pcard__bio">{profile.bio}</p>}

        <dl className="facts">
          {!!profile.trainingTimes.length && (
            <div>
              <dt>{t('discover.trains')}</dt>
              <dd>
                {list(profile.trainingTimes.map((x) => t(`time.${x}`)))} · {t('discover.perWeek', { n: profile.frequency })}
              </dd>
            </div>
          )}
          {!!profile.goals.length && (
            <div>
              <dt>{t('discover.goals')}</dt>
              <dd>{list(profile.goals.map((g) => t(`goal.${g}`)))}</dd>
            </div>
          )}
          {profile.workoutIdea && (
            <div>
              <dt>{t('discover.idea')}</dt>
              <dd>{profile.workoutIdea}</dd>
            </div>
          )}
          {profile.gym && (
            <div>
              <dt>{t('discover.gym')}</dt>
              <dd>{profile.gym}</dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}
