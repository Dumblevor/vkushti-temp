import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { REPORT_REASONS, SPORTS, sportEmoji, type ReportReason, type SportId } from '../../shared/catalog';
import type { MatchSummary, Message } from '../../shared/types';
import { api } from '../api';
import { IconBack, IconCalendar, IconClock, IconFlag, IconMore, IconPin, IconSend } from '../components/icons';
import { Avatar } from '../components/ProfileImage';
import { errorText, Sheet, Spinner, useNow, useToast } from '../components/ui';
import { useDurationFormat, useI18n } from '../i18n';
import { useMe } from '../session';

/** Offer the one-time extension only once the clock is getting short. */
const EXTEND_OFFER_MS = 8 * 3600_000;

export function Chat() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const me = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const duration = useDurationFormat();
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<'menu' | 'invite' | 'report' | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(
    () =>
      api.messages(id).then(
        (r) => {
          setMatch(r.match);
          setMessages(r.messages);
        },
        () => navigate('/matches', { replace: true }),
      ),
    [id, navigate],
  );

  useEffect(() => {
    load();
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (messages.length !== count.current) bottom.current?.scrollIntoView({ block: 'end' });
    count.current = messages.length;
  }, [messages]);

  if (!match) return <Spinner />;
  const other = match.other;
  const left = match.expiresAt ? duration(match.expiresAt - now) : '';
  const hasMessages = messages.length > 0;
  const canWrite = match.status === 'active' || match.status === 'your_move' || (match.status === 'their_move' && hasMessages);

  const banner = (() => {
    switch (match.status) {
      case 'expired':
        return t('chat.banner.expired');
      case 'active':
        return null;
      case 'your_move':
        if (hasMessages) return t('chat.banner.youReply', { name: other.name, time: left });
        return match.firstMoveBy === null ? t('chat.banner.anyone', { time: left }) : t('chat.banner.yourFirst', { time: left });
      case 'their_move':
        return hasMessages ? t('chat.banner.awaitReply', { name: other.name, time: left }) : t('chat.banner.theirFirst', { name: other.name, time: left });
    }
  })();

  const send = async (body: object) => {
    try {
      const r = await api.send(match.id, body);
      setMessages((ms) => [...ms, r.message]);
      setMatch(r.match);
      return true;
    } catch (err) {
      toast(errorText(t, err));
      return false;
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    if (!(await send({ kind: 'text', body }))) setText(body);
  };

  const answer = async (msg: Message, status: 'accepted' | 'declined') => {
    try {
      const r = await api.answerInvite(match.id, msg.id, status);
      setMatch(r.match);
      setMessages((ms) => ms.map((m) => (m.id === msg.id ? r.message : m)));
    } catch (err) {
      toast(errorText(t, err));
    }
  };

  return (
    <div className="chat">
      <header className="topbar topbar--chat">
        <Link to="/matches" className="icon-btn" aria-label={t('chat.back')}>
          <IconBack />
        </Link>
        <Link to={`/u/${other.id}`} className="chat__who">
          <Avatar who={other} size={40} />
          <span>
            <strong>{other.name}</strong>
            <small>{match.score}% {t('discover.trainingMatch')}</small>
          </span>
        </Link>
        <button className="icon-btn" onClick={() => setSheet('menu')} aria-label={t('chat.menu')}>
          <IconMore />
        </button>
      </header>

      {banner && (
        <div className={`banner banner--${match.status}`}>
          <IconClock size={18} />
          <span>{banner}</span>
          {match.canExtend && match.expiresAt !== null && match.expiresAt - now < EXTEND_OFFER_MS && (
            <button
              className="btn btn--small"
              onClick={async () => {
                try {
                  setMatch(await api.extend(match.id));
                } catch (err) {
                  toast(errorText(t, err));
                }
              }}
            >
              {t('chat.extend')}
            </button>
          )}
        </div>
      )}

      <div className="messages">
        {!hasMessages && match.status === 'your_move' && (
          <div className="chat-empty">
            <Avatar who={other} size={96} />
            <p>{t('chat.emptyYou')}</p>
          </div>
        )}
        {messages.map((m) =>
          m.kind === 'invite' && m.invite ? (
            <InviteCard key={m.id} msg={m} mine={m.senderId === me.id} onAnswer={(s) => answer(m, s)} disabled={match.status === 'expired'} />
          ) : (
            <div key={m.id} className={`bubble ${m.senderId === me.id ? 'bubble--mine' : ''}`}>
              {m.body}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      {match.status !== 'expired' &&
        (canWrite ? (
          <form className="composer" onSubmit={submit}>
            <button type="button" className="icon-btn icon-btn--tinted" onClick={() => setSheet('invite')} aria-label={t('chat.invite')} title={t('chat.invite')}>
              <IconCalendar />
            </button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} maxLength={2000} aria-label={t('chat.placeholder')} />
            <button className="icon-btn icon-btn--send" disabled={!text.trim()} aria-label={t('chat.send')}>
              <IconSend size={20} />
            </button>
          </form>
        ) : (
          <p className="composer composer--locked">{t('chat.locked', { name: other.name })}</p>
        ))}

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={other.name}>
        <div className="menu">
          <Link to={`/u/${other.id}`}>{t('chat.viewProfile')}</Link>
          <button
            onClick={async () => {
              if (!confirm(t('chat.unmatchConfirm', { name: other.name }))) return;
              await api.unmatch(match.id);
              navigate('/matches', { replace: true });
            }}
          >
            {t('chat.unmatch')}
          </button>
          <button
            onClick={async () => {
              if (!confirm(t('block.confirm', { name: other.name }))) return;
              await api.block(other.id);
              navigate('/matches', { replace: true });
            }}
          >
            {t('chat.block')}
          </button>
          <button className="danger" onClick={() => setSheet('report')}>
            <IconFlag size={18} /> {t('chat.report')}
          </button>
        </div>
      </Sheet>

      <InviteSheet
        open={sheet === 'invite'}
        onClose={() => setSheet(null)}
        sports={[...new Set([...me.sports.filter((s) => other.sports.some((o) => o.id === s.id)), ...me.sports, ...other.sports].map((s) => s.id))]}
        onSend={async (body) => {
          if (await send(body)) setSheet(null);
        }}
      />

      <ReportSheet open={sheet === 'report'} onClose={() => setSheet(null)} name={other.name} userId={other.id} onDone={() => navigate('/matches', { replace: true })} />
    </div>
  );
}

function InviteCard({ msg, mine, onAnswer, disabled }: { msg: Message; mine: boolean; onAnswer: (s: 'accepted' | 'declined') => void; disabled: boolean }) {
  const { t, locale } = useI18n();
  const invite = msg.invite!;
  const when = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(invite.startsAt);
  return (
    <div className={`invite ${mine ? 'invite--mine' : ''} invite--${invite.status}`}>
      <div className="invite__head">
        <span className="invite__emoji" aria-hidden="true">
          {sportEmoji(invite.sport)}
        </span>
        <span>
          <small>{t('invite.title')}</small>
          <strong>{t(`sport.${invite.sport}`)}</strong>
        </span>
      </div>
      <p className="invite__row">
        <IconCalendar size={16} /> {when}
      </p>
      <p className="invite__row">
        <IconPin size={16} /> {invite.place}
      </p>
      {msg.body && <p className="invite__note">“{msg.body}”</p>}
      {invite.status === 'pending' && !mine && !disabled ? (
        <div className="invite__actions">
          <button className="btn btn--ghost btn--small" onClick={() => onAnswer('declined')}>
            {t('invite.decline')}
          </button>
          <button className="btn btn--primary btn--small" onClick={() => onAnswer('accepted')}>
            {t('invite.accept')}
          </button>
        </div>
      ) : (
        <p className="invite__status">{t(`invite.${invite.status}`)}</p>
      )}
    </div>
  );
}

function defaultStart() {
  const d = new Date(Date.now() + 2 * 24 * 3600_000);
  d.setHours(18, 0, 0, 0);
  return toLocalInput(d);
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function InviteSheet({ open, onClose, sports, onSend }: { open: boolean; onClose: () => void; sports: SportId[]; onSend: (body: object) => void }) {
  const { t } = useI18n();
  const [sport, setSport] = useState<SportId>(sports[0] ?? 'running');
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState(defaultStart);
  const [note, setNote] = useState('');
  const ordered = [...sports, ...SPORTS.map((s) => s.id).filter((s) => !sports.includes(s))];

  return (
    <Sheet open={open} onClose={onClose} title={t('invite.title')}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSend({ kind: 'invite', body: note.trim(), invite: { sport, place: place.trim(), startsAt: new Date(when).getTime() } });
        }}
      >
        <label className="field">
          <span>{t('invite.sport')}</span>
          <select value={sport} onChange={(e) => setSport(e.target.value as SportId)}>
            {ordered.map((s) => (
              <option key={s} value={s}>
                {sportEmoji(s)} {t(`sport.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('invite.place')}</span>
          <input required maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('invite.placePlaceholder')} />
        </label>
        <label className="field">
          <span>{t('invite.when')}</span>
          <input type="datetime-local" required value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('invite.note')}</span>
          <input maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="hint">🛡️ {t('invite.safety')}</p>
        <button className="btn btn--primary btn--lg btn--block">{t('invite.send')}</button>
      </form>
    </Sheet>
  );
}

export function ReportSheet({ open, onClose, name, userId, onDone }: { open: boolean; onClose: () => void; name: string; userId: string; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [reference, setReference] = useState<string | null>(null);

  return (
    <Sheet open={open} onClose={reference ? onDone : onClose} title={t('report.title', { name })}>
      {reference ? (
        <div className="stack">
          <p>{t('report.done', { ref: reference })}</p>
          <button className="btn btn--primary btn--block" onClick={onDone}>
            {t('common.close')}
          </button>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reason) return;
            try {
              setReference((await api.report(userId, reason, details)).reference);
            } catch (err) {
              toast(errorText(t, err));
            }
          }}
        >
          <p className="muted">{t('report.body')}</p>
          <div className="radio-list">
            {REPORT_REASONS.map((r) => (
              <label key={r} className="check">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                <span>{t(`report.reason.${r}`)}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span>{t('report.details')}</span>
            <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </label>
          <button className="btn btn--danger btn--block" disabled={!reason}>
            {t('report.send')}
          </button>
        </form>
      )}
    </Sheet>
  );
}
