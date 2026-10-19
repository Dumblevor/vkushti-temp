import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';
import { App } from './App';
import { ToastProvider } from './components/ui';
import { I18nProvider } from './i18n';
import { initNative } from './native';
import { SessionProvider } from './session';

initNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
