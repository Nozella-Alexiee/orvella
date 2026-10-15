/* App Sandbox (Orvella OS): /sandbox = daftar & proyek baru, /sandbox/:id = IDE. */
import { useParams } from 'react-router';
import { useApi } from '../api/hooks';
import { Icon } from '../design/Icon';
import '../os/ide.css';
import { SandboxHome } from './Home';
import { Ide } from './Ide';
import type { Project } from './types';

export default function SandboxApp() {
  const { id } = useParams();
  const q = useApi<Project>(id ? `/api/sandbox/${id}` : null, { staleTime: Infinity, refetchOnWindowFocus: false });
  if (!id) return <SandboxHome />;
  if (q.isLoading) return <div className="os-win-loading"><Icon name="loader-circle" className="spin" /></div>;
  if (!q.data) return <div className="empty"><p>{q.error?.message || 'Proyek tidak ditemukan.'}</p></div>;
  return <Ide key={q.data.id} project={q.data} />;
}
