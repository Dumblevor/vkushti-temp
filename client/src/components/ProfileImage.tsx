import { sportEmoji } from '@spotter/shared/catalog';
import type { PublicProfile } from '@spotter/shared/types';
import { assetUrl } from '../native';

/** Stable hue per person. IDs created together differ only at the end, so mix well (FNV-1a + finaliser). */
function hue(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) % 360;
}

type Who = Pick<PublicProfile, 'id' | 'name' | 'photos' | 'sports'>;

/** Generated artwork for profiles without photos (all the demo people). */
export function Placeholder({ who, compact = false }: { who: Who; compact?: boolean }) {
  const h = hue(who.id);
  const emoji = sportEmoji(who.sports[0]?.id ?? '');
  return (
    <div
      className={`placeholder ${compact ? 'placeholder--compact' : ''}`}
      style={{
        background: `radial-gradient(120% 90% at 85% 10%, hsl(${(h + 50) % 360} 85% 70% / .9), transparent 60%),
                     linear-gradient(160deg, hsl(${h} 70% 58%), hsl(${(h + 30) % 360} 60% 32%))`,
      }}
      aria-hidden="true"
    >
      <span className="placeholder__initial">{who.name.slice(0, 1)}</span>
      {!compact && <span className="placeholder__emoji">{emoji}</span>}
    </div>
  );
}

export function Avatar({ who, size = 48, ring }: { who: Who; size?: number; ring?: string }) {
  return (
    <span className="avatar" style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2.5px var(--bg), 0 0 0 5px ${ring}` : undefined }}>
      {who.photos[0] ? <img src={assetUrl(who.photos[0].url)} alt="" /> : <Placeholder who={who} compact />}
    </span>
  );
}
