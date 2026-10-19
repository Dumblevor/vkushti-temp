import type { CapacitorConfig } from '@capacitor/cli';

// Live reload on a device/simulator: CAP_SERVER_URL=http://<your-mac-ip>:5173 npx cap run ios
const liveReloadUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  // Change to your own reverse-domain bundle id before the first App Store upload.
  appId: 'eu.spotter.app',
  appName: 'Spotter',
  webDir: 'dist',
  ios: {
    // The web app handles safe areas itself with env(safe-area-inset-*).
    contentInset: 'never',
    backgroundColor: '#f6f4ef',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#f6f4ef',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
  ...(liveReloadUrl ? { server: { url: liveReloadUrl, cleartext: true } } : {}),
};

export default config;
