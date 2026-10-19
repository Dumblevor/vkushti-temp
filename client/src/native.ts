// Everything that differs between the web app and the iOS app (Capacitor) lives here.
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = Capacitor.isNativePlatform();

/**
 * The web app talks to its own origin. The iOS app runs on capacitor://localhost,
 * so it needs the API's absolute URL (VITE_API_URL, see .env.ios.example). The
 * simulator can reach the Mac's localhost, which makes that a handy default.
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? (isNative ? 'http://localhost:3000' : '');

/** Photos and other server paths as loadable URLs. */
export const assetUrl = (path: string) => (path.startsWith('/') ? API_URL + path : path);

const TOKEN_KEY = 'session';

/** The iOS app's session token lives in the Keychain; the web app uses an httpOnly cookie instead. */
export const tokenStore = {
  get: () => (isNative ? SecureStorage.getItem(TOKEN_KEY) : Promise.resolve(null)),
  set: (token: string) => (isNative ? SecureStorage.setItem(TOKEN_KEY, token) : Promise.resolve()),
  clear: () => (isNative ? SecureStorage.removeItem(TOKEN_KEY) : Promise.resolve()),
};

const quietly = (p: Promise<unknown>) => void p.catch(() => {});

export const haptic = {
  tap: () => isNative && quietly(Haptics.impact({ style: ImpactStyle.Light })),
  success: () => isNative && quietly(Haptics.notification({ type: NotificationType.Success })),
};

/** Status bar follows the system theme; the splash hides once the first screen is ready. */
export function initNative() {
  if (!isNative) return;
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => quietly(StatusBar.setStyle({ style: dark.matches ? Style.Dark : Style.Light }));
  apply();
  dark.addEventListener('change', apply);
  document.documentElement.classList.add('native');
}

export const hideSplash = () => isNative && quietly(SplashScreen.hide({ fadeOutDuration: 200 }));

/** Opens a server download (e.g. the GDPR export) — in Safari on iOS, in place on the web. */
export function openDownload(url: string) {
  if (isNative) window.open(assetUrl(url), '_blank');
  else window.location.assign(url);
}
