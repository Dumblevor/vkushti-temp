import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { MatchSummary } from '../../shared/types';
import { api } from '../api';
import { Avatar } from '../components/ProfileImage';
import { Spinner, useNow } from '../components/ui';
import { useDurationFormat, useI18n } from '../i18n';
import { useMe } from '../session';

export function Matches() {
  const { t } = useI18n();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.matches().then((r) => alive && setMatches(r.matches), () => alive && setMatches((m) => m ?? []));
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!matches) return <Spinner />;

  const queue = matches.filter((m) => !m.lastMessage && m.status !== 'expired');
  // Their-move items wait at the end; your-move ones are what you should look at first.
  const order = { your_move: 0, active: 1, their_move: 2, expired: 3 };
  const conversations = matches
    .filter((m) => m.lastMessage || m.status === 'expired')
    .sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="matches">
      <header className="topbar topbar--app">
        <h1 className="topbar__title">{t('matches.title')}</h1>
      </header>

      {matches.length === 0 && (
        <div className="empty">
          <div className="empty__art" aria-hidden="true">
            🤝
          </div>
          <h2>{t('matches.empty.title')}</h2>
          <p>{t('matches.empty.body')}</p>
          <Link to="/discover" className="btn btn--primary">
            {t('nav.discover')}
          </Link>
        </div>
      )}

      {queue.length > 0 && (
        <section>
          <h2 className="section-title">{t('matches.queue')}</h2>
          <div className="queue">
            {queue.map((m) => (
              <QueueItem key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {conversations.length > 0 && (
        <section>
          <h2 className="section-title">{t('matches.conversations')}</h2>
          <ul className="convos">
            {conversations.map((m) => (
              <ConversationRow key={m.id} match={m} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QueueItem({ match }: { match: MatchSummary }) {
  const now = useNow();
  const duration = useDurationFormat();
  const { t } = useI18n();
  const left = match.expiresAt ? match.expiresAt - now : 0;
  const urgent = left < 4 * 3600_000;
  const yours = match.status === 'your_move';
  return (
    <Link to={`/matches/${match.id}`} className={`queue__item ${yours ? '' : 'queue__item--waiting'}`}>
      <Avatar who={match.other} size={68} ring={yours ? (urgent ? 'var(--accent)' : 'var(--volt-strong)') : 'var(--line)'} />
      <span className="queue__name">{match.other.name}</span>
      <span className={`queue__time ${yours && urgent ? 'queue__time--urgent' : ''}`}>
        {yours ? duration(left) : t('matches.waiting')}
      </span>
    </Link>
  );
}

function ConversationRow({ match }: { match: MatchSummary }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const now = useNow();
  const duration = useDurationFormat();
  const last = match.lastMessage;
  const preview = last
    ? `${last.senderId === me.id ? `${t('matches.you')}: ` : ''}${last.kind === 'invite' ? `📅 ${t('matches.inviteSent')}` : last.body}`
    : '';
  const left = match.expiresAt ? duration(match.expiresAt - now) : '';
  const status =
    match.status === 'active' && last
      ? new Intl.DateTimeFormat(locale, sameDay(last.createdAt, now) ? { timeStyle: 'short' } : { day: 'numeric', month: 'short' }).format(last.createdAt)
      : match.status === 'expired'
        ? t('matches.status.expired')
        : `${t(`matches.status.${match.status}`)} · ${t('matches.left', { time: left })}`;

  return (
    <li>
      <Link to={`/matches/${match.id}`} className={`convo convo--${match.status}`}>
        <Avatar who={match.other} size={56} />
        <span className="convo__text">
          <span className="convo__top">
            <strong>{match.other.name}</strong>
            <span className={`convo__status convo__status--${match.status}`}>{status}</span>
          </span>
          <span className={`convo__preview ${match.unread ? 'convo__preview--unread' : ''}`}>{preview}</span>
        </span>
        {match.unread > 0 && <span className="badge badge--inline">{match.unread}</span>}
      </Link>
    </li>
  );
}

function sameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
