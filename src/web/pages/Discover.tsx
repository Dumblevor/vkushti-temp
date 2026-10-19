import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { ANYWHERE_KM, SPORTS, type SportId } from '../../shared/catalog';
import type { DiscoverCard, MatchSummary } from '../../shared/types';
import { api } from '../api';
import { IconBolt, IconHeart, IconSliders, IconX } from '../components/icons';
import { ProfileCard } from '../components/ProfileCard';
import { Avatar } from '../components/ProfileImage';
import { Chip, errorText, Sheet, Spinner, useToast } from '../components/ui';
import { useI18n, useInlineLabel, useListFormat } from '../i18n';
import { useMe, useSession } from '../session';

const SPOTS_PER_DAY = 3;
const THRESHOLD = 110;
type Decision = 'like' | 'pass' | 'spot';

export function Discover() {
  const { t } = useI18n();
  const me = useMe();
  const { setMe } = useSession();
  const toast = useToast();
  const [cards, setCards] = useState<DiscoverCard[] | null>(null);
  const [snoozed, setSnoozed] = useState(false);
  const [sport, setSport] = useState<SportId | ''>('');
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const [spotOpen, setSpotOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const busy = useRef(false);

  const load = useCallback(() => {
    setCards(null);
    api.discover(sport).then(
      (r) => {
        setCards(r.cards);
        setSnoozed(r.snoozed);
      },
      (err) => {
        toast(errorText(t, err));
        setCards([]);
      },
    );
  }, [sport, t, toast]);

  useEffect(load, [load]);

  const top = cards?.[0];

  const decide = useCallback(
    async (action: Decision, note?: string) => {
      if (!top || busy.current) return;
      busy.current = true;
      setLeaving(action);
      const request = api.swipe(top.id, action, note);
      await new Promise((r) => setTimeout(r, 260));
      try {
        const res = await request;
        if (res.matched && res.match) setMatch(res.match);
      } catch (err) {
        toast(errorText(t, err));
      }
      setLeaving(null);
      setCards((cs) => {
        const rest = cs?.slice(1) ?? [];
        if (rest.length === 0) setTimeout(load, 0);
        return rest;
      });
      busy.current = false;
    },
    [top, toast, t, load],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (spotOpen || filtersOpen || match || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') decide('pass');
      if (e.key === 'ArrowRight') decide('like');
      if (e.key === 'ArrowUp') setSpotOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, spotOpen, filtersOpen, match]);

  return (
    <div className="discover">
      <header className="topbar topbar--app">
        <h1 className="topbar__title">{t('discover.title')}</h1>
        <button className="icon-btn" onClick={() => setFiltersOpen(true)} aria-label={t('discover.filters')}>
          <IconSliders />
          {sport && <span className="dot" />}
        </button>
      </header>

      <div className="deck">
        {cards === null ? (
          <Spinner />
        ) : snoozed ? (
          <Empty
            title={t('discover.snoozed.title')}
            body={t('discover.snoozed.body')}
            cta={t('discover.snoozed.cta')}
            onCta={async () => {
              setMe(await api.snooze(false));
              load();
            }}
          />
        ) : !top ? (
          <Empty title={t('discover.empty.title')} body={t('discover.empty.body')} cta={t('discover.empty.cta')} onCta={() => setFiltersOpen(true)} />
        ) : (
          <>
            {cards[1] && (
              <div className="deck__card deck__card--next" key={cards[1].id} aria-hidden="true">
                <ProfileCard profile={cards[1]} extras={cards[1]} />
              </div>
            )}
            <SwipeCard key={top.id} card={top} leaving={leaving} onDecide={(d) => decide(d)} />
          </>
        )}
      </div>

      {top && !snoozed && (
        <div className="actions">
          <button className="action action--pass" onClick={() => decide('pass')} aria-label={t('discover.pass')}>
            <IconX size={30} />
          </button>
          <button className="action action--spot" onClick={() => setSpotOpen(true)} aria-label={t('discover.spot')}>
            <IconBolt size={24} />
          </button>
          <button className="action action--like" onClick={() => decide('like')} aria-label={t('discover.like')}>
            <IconHeart size={30} />
          </button>
        </div>
      )}

      {top && (
        <SpotSheet
          open={spotOpen}
          name={top.name}
          onClose={() => setSpotOpen(false)}
          onSend={(note) => {
            setSpotOpen(false);
            decide('spot', note);
          }}
        />
      )}
      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        sport={sport}
        onApply={async (nextSport, prefs) => {
          setFiltersOpen(false);
          try {
            setMe(await api.updatePreferences(prefs));
          } catch (err) {
            toast(errorText(t, err));
          }
          if (nextSport === sport) load();
          else setSport(nextSport);
        }}
        prefs={me.preferences}
      />
      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
    </div>
  );
}

function Empty({ title, body, cta, onCta }: { title: string; body: string; cta: string; onCta: () => void }) {
  return (
    <div className="empty">
      <div className="empty__art" aria-hidden="true">
        🏁
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="btn btn--ghost" onClick={onCta}>
        {cta}
      </button>
    </div>
  );
}

function SwipeCard({ card, leaving, onDecide }: { card: DiscoverCard; leaving: Decision | null; onDecide: (d: Decision) => void }) {
  const { t } = useI18n();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || leaving) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (!dragging && Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy) * 1.2) {
      setDragging(true);
      moved.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (dragging) setDx(ddx);
  };
  const onUp = () => {
    if (dragging && Math.abs(dx) > THRESHOLD) onDecide(dx > 0 ? 'like' : 'pass');
    else setDx(0);
    setDragging(false);
    start.current = null;
  };

  const out = leaving === 'like' || leaving === 'spot' ? 1 : leaving === 'pass' ? -1 : 0;
  const x = out ? out * window.innerWidth * 1.2 : dx;
  const style = {
    transform: leaving === 'spot' ? 'translateY(-120%) scale(.9)' : `translateX(${x}px) rotate(${x / 18}deg)`,
    transition: dragging ? 'none' : 'transform .28s cubic-bezier(.2,.8,.3,1)',
  };
  const likeOpacity = leaving === 'like' ? 1 : Math.max(0, Math.min(1, dx / THRESHOLD));
  const passOpacity = leaving === 'pass' ? 1 : Math.max(0, Math.min(1, -dx / THRESHOLD));

  return (
    <div
      className="deck__card"
      style={style}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClickCapture={(e) => {
        if (moved.current) {
          e.stopPropagation();
          moved.current = false;
        }
      }}
    >
      <span className="stamp stamp--like" style={{ opacity: likeOpacity }}>
        {t('discover.stampLike')}
      </span>
      <span className="stamp stamp--pass" style={{ opacity: passOpacity }}>
        {t('discover.stampPass')}
      </span>
      <ProfileCard profile={card} extras={card} />
    </div>
  );
}

function SpotSheet({ open, name, onClose, onSend }: { open: boolean; name: string; onClose: () => void; onSend: (note: string) => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={t('discover.spotTitle')}>
      <p className="muted">{t('discover.spotBody', { n: SPOTS_PER_DAY })}</p>
      <label className="field">
        <span className="visually-hidden">{name}</span>
        <textarea rows={3} maxLength={140} placeholder={t('discover.spotPlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </label>
      <button
        className="btn btn--volt btn--block btn--lg"
        onClick={() => {
          onSend(note.trim());
          setNote('');
        }}
      >
        <IconBolt size={18} /> {t('discover.spotSend')}
      </button>
    </Sheet>
  );
}

interface Prefs {
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number;
}

const DISTANCES = [10, 25, 50, 100, 250, 500, ANYWHERE_KM];

function FiltersSheet({
  open,
  onClose,
  sport,
  prefs,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  sport: SportId | '';
  prefs: Prefs;
  onApply: (sport: SportId | '', prefs: Prefs) => void;
}) {
  const { t } = useI18n();
  const [s, setS] = useState(sport);
  const [p, setP] = useState(prefs);
  useEffect(() => {
    if (open) {
      setS(sport);
      setP(prefs);
    }
  }, [open, sport, prefs]);

  return (
    <Sheet open={open} onClose={onClose} title={t('discover.filters')}>
      <div className="stack">
        <DiscoveryControls value={p} onChange={setP} />
        <fieldset className="fieldset">
          <legend>{t('onb.sports.title')}</legend>
          <div className="chips">
            <Chip selected={s === ''} onClick={() => setS('')}>
              {t('discover.allSports')}
            </Chip>
            {SPORTS.map((x) => (
              <Chip key={x.id} selected={s === x.id} onClick={() => setS(x.id)}>
                {x.emoji} {t(`sport.${x.id}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <button className="btn btn--primary btn--block btn--lg" onClick={() => onApply(s, p)}>
          {t('common.confirm')}
        </button>
      </div>
    </Sheet>
  );
}

export function DiscoveryControls({ value, onChange }: { value: Prefs; onChange: (p: Prefs) => void }) {
  const { t } = useI18n();
  return (
    <>
      <div className="field">
        <span>
          {t('settings.age')}: <strong>{value.ageMin}–{value.ageMax}</strong>
        </span>
        <div className="range-pair">
          <input
            type="range"
            min={18}
            max={99}
            value={value.ageMin}
            aria-label={`${t('settings.age')} min`}
            onChange={(e) => onChange({ ...value, ageMin: Math.min(Number(e.target.value), value.ageMax) })}
          />
          <input
            type="range"
            min={18}
            max={99}
            value={value.ageMax}
            aria-label={`${t('settings.age')} max`}
            onChange={(e) => onChange({ ...value, ageMax: Math.max(Number(e.target.value), value.ageMin) })}
          />
        </div>
      </div>
      <fieldset className="fieldset">
        <legend>{t('settings.distance')}</legend>
        <div className="chips">
          {DISTANCES.map((d) => (
            <Chip key={d} selected={value.maxDistanceKm === d} onClick={() => onChange({ ...value, maxDistanceKm: d })}>
              {d === ANYWHERE_KM ? `🇪🇺 ${t('settings.anywhere')}` : t('settings.km', { km: d })}
            </Chip>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function MatchOverlay({ match, onClose }: { match: MatchSummary; onClose: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const list = useListFormat();
  const inline = useInlineLabel();
  const navigate = useNavigate();
  const shared = match.other.sports.filter((s) => me.sports.some((m) => m.id === s.id)).map((s) => inline(t(`sport.${s.id}`)));
  const rule =
    match.firstMoveBy === null
      ? t('match.anyone')
      : match.firstMoveBy === me.id
        ? t('match.youFirst')
        : t('match.themFirst', { name: match.other.name });

  return (
    <div className="match-overlay" role="dialog" aria-modal="true" aria-label={t('match.title')}>
      <div className="match-overlay__inner">
        <div className="match-overlay__avatars">
          <Avatar who={me} size={112} />
          <Avatar who={match.other} size={112} />
        </div>
        <h2>{t('match.title')}</h2>
        {shared.length > 0 && <p className="match-overlay__shared">{t('match.shared', { list: list(shared) })}</p>}
        <p>{rule}</p>
        <div className="stack">
          <button className="btn btn--volt btn--lg btn--block" onClick={() => navigate(`/matches/${match.id}`)}>
            {match.firstMoveBy === null || match.firstMoveBy === me.id ? t('match.sayHello') : t('match.openChat')}
          </button>
          <button className="btn btn--ghost-light btn--block" onClick={onClose}>
            {t('match.keepSwiping')}
          </button>
        </div>
      </div>
    </div>
  );
}
