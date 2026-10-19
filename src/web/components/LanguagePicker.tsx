import { LANGUAGES, type Language } from '../../shared/catalog';
import { LANGUAGE_NAMES, useI18n } from '../i18n';
import { IconGlobe } from './icons';

export function LanguagePicker({ onChange }: { onChange?: (lang: Language) => void }) {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="lang-picker">
      <IconGlobe size={16} />
      <span className="visually-hidden">{t('lang.label')}</span>
      <select
        value={lang}
        onChange={(e) => {
          const next = e.target.value as Language;
          setLang(next);
          onChange?.(next);
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {LANGUAGE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
