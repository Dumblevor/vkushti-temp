import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, type UserView as View } from '../api';
import { IconBack, IconFlag } from '../components/icons';
import { ProfileCard } from '../components/ProfileCard';
import { Spinner } from '../components/ui';
import { useI18n } from '../i18n';
import { ReportSheet } from './Chat';

export function UserView() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [user, setUser] = useState<View | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    api.user(id).then(setUser, () => navigate(-1));
  }, [id, navigate]);

  if (!user) return <Spinner />;
  return (
    <div className="page page--narrow">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label={t('chat.back')}>
          <IconBack />
        </button>
        <h1 className="topbar__title">{user.name}</h1>
        <button className="icon-btn" onClick={() => setReporting(true)} aria-label={t('chat.report')}>
          <IconFlag size={20} />
        </button>
      </header>
      <div className="preview">
        <ProfileCard profile={user} extras={user} />
      </div>
      <ReportSheet open={reporting} onClose={() => setReporting(false)} name={user.name} userId={user.id} onDone={() => navigate('/matches', { replace: true })} />
    </div>
  );
}
