import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ServerConnection } from './ConnectionPanel';
import './ConnectionSplash.css';
import { useStreamerMode } from './Privacy';
import { privateText } from './launcherPreferences';

export interface PreparationProgress { stage: string; file: string; completed: number; total: number }
const copy = {
  de: { title: 'Deine Reise beginnt', preparing: 'Verbindung wird vorbereitet', files: 'Dateien prüfen und laden', activation: 'Serverdateien aktivieren', discovery: 'Server ermitteln', start: 'Spiel starten', current: 'Aktuelle Datei', verified: 'Dateien geprüft', waiting: 'Serverdaten werden abgerufen …', close: 'Zum Launcher', failed: 'Verbindung unterbrochen', hint: 'Benötigte Dateien werden automatisch geladen und geprüft. Deine Originaldateien bleiben gesichert.' },
  en: { title: 'Your journey begins', preparing: 'Preparing your connection', files: 'Verify and download files', activation: 'Activate server files', discovery: 'Discover server', start: 'Start game', current: 'Current file', verified: 'files verified', waiting: 'Reading server information …', close: 'Back to launcher', failed: 'Connection interrupted', hint: 'Required files are downloaded and verified automatically. Your original files remain backed up.' },
  ru: { title: 'Твоё путешествие начинается', preparing: 'Подготовка подключения', files: 'Проверка и загрузка файлов', activation: 'Активация файлов сервера', discovery: 'Поиск сервера', start: 'Запуск игры', current: 'Текущий файл', verified: 'файлов проверено', waiting: 'Получение данных сервера …', close: 'Вернуться в лаунчер', failed: 'Подключение прервано', hint: 'Необходимые файлы загружаются и проверяются автоматически. Исходные файлы сохраняются в резервной копии.' },
};

function imageUrl(value?: string) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

export default function ConnectionSplash({ server, language, progress, busy, failure, status, verifiedFiles, onClose }: {
  server: ServerConnection; language: 'de' | 'en' | 'ru'; progress: PreparationProgress | null;
  busy: boolean; failure: string; status: string; verifiedFiles: number; onClose: () => void;
}) {
  const t = copy[language];
  const streamer = useStreamerMode();
  const dialog = useRef<HTMLDivElement>(null);
  const [bannerFailed, setBannerFailed] = useState(false), [logoFailed, setLogoFailed] = useState(false);
  const banner = imageUrl(server.bannerUrl), logo = imageUrl(server.iconUrl);
  const phase = !busy && !failure ? 4 : progress?.stage === 'ready' ? 3 : progress?.stage === 'installing' ? 2 : progress && progress.stage !== 'manifest' ? 1 : 0;
  const fileProgress = progress && progress.total > 0 ? Math.max(0, Math.min(100, Math.round(progress.completed / progress.total * 100))) : undefined;
  const fileName = progress?.file.split(/[\\/]/).pop();
  const steps = [t.discovery, t.files, t.activation, t.start];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const wasInert = root?.inert || false;
    const previousOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { if (root) root.inert = wasInert; document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);

  return createPortal(<div className="connection-splash" data-testid="connection-splash">
    <div className="connection-splash-backdrop" />
    <div className="connection-splash-card" role="dialog" aria-modal="true" aria-labelledby="connection-splash-title" tabIndex={-1} ref={dialog}
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
        if (event.key === 'Tab') {
          const button = dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
          event.preventDefault(); (button || dialog.current)?.focus();
        }
      }}>
      <div className="connection-splash-art"><img src={banner && !bannerFailed ? banner : '/skyrim-landscape.jpg'} alt="" onError={() => setBannerFailed(true)} referrerPolicy="no-referrer" /><div className="connection-splash-art-shade" /><span className="connection-splash-brand">SkyMP <em>Worlds</em></span></div>
      <div className="connection-splash-content">
        <p className="eyebrow">{t.title}</p>
        <div className="connection-splash-server"><span className="connection-splash-logo">{logo && !logoFailed ? <img src={logo} alt="" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} /> : server.name.trim().slice(0, 2).toUpperCase()}</span><div><h1 id="connection-splash-title">{server.name}</h1><p>{t.preparing}</p></div></div>
        <ol className="connection-splash-steps" aria-label={t.preparing}>{steps.map((label, index) => <li key={label} className={index < phase ? 'is-complete' : index === phase && busy ? 'is-current' : ''} aria-current={index === phase && busy ? 'step' : undefined}><span className="connection-splash-step-bar" /><span>{label}</span></li>)}</ol>
        <div className="connection-splash-download" aria-busy={busy}>
          <div className="connection-splash-download-heading"><strong>{t.current}</strong><span>{verifiedFiles} {t.verified}</span></div>
          <p className="connection-splash-filename">{privateText(failure || (!busy ? status : fileName && progress?.stage !== 'manifest' ? fileName : t.waiting), streamer, language)}</p>
          <progress aria-label={t.current} max={100} value={!busy && !failure ? 100 : fileProgress} />
          <div className="connection-splash-transfer" role="status" aria-live="polite">{busy && progress?.stage === 'downloading' && <><span>{(progress.completed / 1048576).toLocaleString(language, { maximumFractionDigits: 1 })} / {(progress.total / 1048576).toLocaleString(language, { maximumFractionDigits: 1 })} MiB</span><strong>{fileProgress === undefined ? '…' : `${fileProgress}%`}</strong></>}{failure && <span className="error" role="alert">{t.failed}</span>}</div>
        </div>
        <div className="connection-splash-footer"><p>{t.hint}</p>{!busy && <button className="btn-refresh" onClick={onClose}>{t.close}</button>}</div>
      </div>
    </div>
  </div>, document.body);
}
