import { useNavigate, useParams } from 'react-router';
import { IconBack } from '../components/icons';
import { useI18n } from '../i18n';

// Plain-language drafts for the prototype. They describe how this codebase actually
// behaves and must be reviewed by counsel (and translated) before launch.

function Privacy() {
  return (
    <>
      <h2>At a glance</h2>
      <ul>
        <li>We collect only what matching needs, and we never sell your data or use it for ad tracking.</li>
        <li>Your location is stored as a city — we never collect GPS coordinates.</li>
        <li>Location and camera metadata is removed from every photo before it is stored.</li>
        <li>Everything is hosted in the European Union.</li>
        <li>You can download all your data or delete your account at any time from Settings.</li>
      </ul>
      <h2>What we process and why</h2>
      <table className="legal-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Purpose</th>
            <th>Legal basis (GDPR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Email, password (hashed), date of birth</td>
            <td>Your account, keeping Spotter 18+</td>
            <td>Contract, art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Name, photos, bio, sports, schedule, goals, city</td>
            <td>Showing your profile and calculating training matches</td>
            <td>Contract, art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Gender and who you want to meet</td>
            <td>Showing you to the right people; the first-move rule</td>
            <td>Explicit consent, art. 9(2)(a) — withdraw any time</td>
          </tr>
          <tr>
            <td>Likes, matches, messages, workout invites</td>
            <td>Running the service</td>
            <td>Contract, art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Reports and blocks</td>
            <td>Keeping members safe; Digital Services Act duties</td>
            <td>Legitimate interest and legal obligation, art. 6(1)(f), 6(1)(c)</td>
          </tr>
          <tr>
            <td>Product news</td>
            <td>Occasional emails</td>
            <td>Consent, art. 6(1)(a) — optional</td>
          </tr>
        </tbody>
      </table>
      <h2>How long we keep it</h2>
      <p>
        Until you delete your account. Deletion is immediate in our live systems and backups roll over within 30 days. Reports you
        filed are kept without your identity so moderators can still act on them.
      </p>
      <h2>Your rights</h2>
      <p>
        Access and portability (Settings → Download my data), rectification (edit your profile), erasure (Settings → Delete account),
        withdrawing consent (Settings), objection and restriction (contact us). You can also complain to your national data
        protection authority.
      </p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h2>The short version</h2>
      <ul>
        <li>You must be 18 or older and use your real identity. One account per person.</li>
        <li>Be kind. Harassment, hate, nudity, scams and commercial solicitation get accounts removed.</li>
        <li>Meet for the first time in busy public places and tell a friend where you’re going.</li>
        <li>
          If we restrict your content or account we tell you why (a statement of reasons) and you can appeal, as the Digital Services
          Act requires.
        </li>
        <li>Paid features, when they arrive, come with a 14-day right of withdrawal and can be cancelled online in two clicks.</li>
      </ul>
    </>
  );
}

export function Legal() {
  const { doc } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const privacy = doc === 'privacy';
  return (
    <div className="page page--narrow legal">
      <header className="topbar">
        <button className="icon-btn" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} aria-label={t('chat.back')}>
          <IconBack />
        </button>
        <h1 className="topbar__title">{privacy ? t('legal.privacy.title') : t('legal.terms.title')}</h1>
        <span className="icon-btn-spacer" />
      </header>
      <p className="notice">{t('legal.draft')}</p>
      {privacy ? <Privacy /> : <Terms />}
    </div>
  );
}
