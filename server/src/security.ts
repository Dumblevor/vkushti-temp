import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Drop APPn and COM segments from a JPEG so EXIF (incl. GPS), XMP and
 * maker notes never reach other users. The browser already re-encodes photos
 * through a canvas before upload; this is the server-side safety net.
 * Returns null if the buffer isn't a well-formed JPEG.
 */
export function stripJpegMetadata(input: Buffer): Buffer | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  const parts: Buffer[] = [input.subarray(0, 2)];
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) return null;
    const marker = input[i + 1];
    if (marker === 0xd9) {
      parts.push(input.subarray(i, i + 2));
      break;
    }
    // Start of scan: the entropy-coded image data runs to the end of the file.
    if (marker === 0xda) {
      parts.push(input.subarray(i));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > input.length) return null;
    const len = input.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (len < 2 || end > input.length) return null;
    const isAppN = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;
    // Colour information is harmless and needed to render correctly, so keep it.
    const payload = input.subarray(i + 4, end);
    const isColour =
      (marker === 0xe2 && payload.subarray(0, 12).toString('latin1') === 'ICC_PROFILE\0') ||
      (marker === 0xee && payload.subarray(0, 5).toString('latin1') === 'Adobe');
    if ((!isAppN && !isComment) || isColour) parts.push(input.subarray(i, end));
    i = end;
  }
  return Buffer.concat(parts);
}
