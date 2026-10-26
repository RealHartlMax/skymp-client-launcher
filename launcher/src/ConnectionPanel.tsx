import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ConnectionSplash from './ConnectionSplash';
import { connectionErrorMessage } from './steamErrors';
import { privateText } from './launcherPreferences';
import { useStreamerMode } from './Privacy';

type Language = 'de' | 'en' | 'ru';
export interface ServerConnection {
  name: string;
  ip: string;
  port: number;
  resourceUrl?: string;
  masterUrl?: string;
  serverMasterKey?: string;
  offline?: boolean;
  profileId?: number;
  runtimeSource?: string;
  bannerUrl?: string;
  iconUrl?: string;
  serverStatus?: 'online' | 'offline';
  lastHeartbeat?: string;
}

interface Profile extends ServerConnection {
  resourceUrl: string;
  masterUrl: string;
  serverMasterKey: string;
  offline: boolean;
  profileId: number;
  runtimeSource: string;
}

interface Progress {
  operationId: string;
  stage: string;
  file: string;
  completed: number;
  total: number;
}

interface GameStatus { operationId: string; phase: string; diagnosticsPath: string; elapsedSeconds: number; exitCode?: number }

interface Result {
  downloadedFiles: number;
  cachedFiles: number;
  loadOrder: string[];
  preservedFiles?: PreservedFile[];
}

interface PreservedFile {
  path: string;
  backupPath: string;
}

const PROFILE_KEY = 'skymp.launcher.serverProfiles.v1';
const labels = {
  de: {
    title: 'Server verbinden', profiles: 'Gespeicherte Server', choose: 'Server auswählen', name: 'Servername',
    host: 'Host / IP', gamePort: 'Spielport (UDP)', http: 'Dateiserver (HTTP/HTTPS)',
    httpHint: 'Leer = http://Host:8080. Bei anderen Ports oder Reverse Proxy die vollständige Basis-URL eintragen.',
    auth: 'Anmeldung', online: 'Online (Anmeldung im Spiel)', offline: 'Offline (nur für entsprechend konfigurierte Server)',
    master: 'Anmeldeserver / Master-URL', key: 'Öffentliche Server-ID / Master-Key', profile: 'Offline-Profil-ID',
    runtime: 'SkyMP-Clientpaket', runtimeHint: 'Ordner mit Data/ oder HTTP(S)-URL eines Clientpakets bzw. Versionskatalogs. Ein Katalog wählt das passende Paket für deine Skyrim-Version. Leer = Angebot des Servers automatisch verwenden; sonst installierten Client nutzen.',
    build: 'Server-Build importieren', buildHint: 'Build-Ordner oder Serverpaket: importiert Spielport, HTTP-Port, Anmeldung und lokalen Clientpfad.',
    import: 'Build einlesen', save: 'Server speichern', remove: 'Profil entfernen',
    prepare: 'Dateien vorbereiten', connect: 'Vorbereiten und verbinden', restore: 'Originaldateien wiederherstellen',
    ready: 'Vorbereitet', launched: 'Dateien geprüft, Skyrim gestartet. Bitte die Mehrspieler-Anmeldung im Spiel abwarten; nicht „Neu“ wählen.', failed: 'Vorbereitung fehlgeschlagen', simpleConnect: 'Verbinden', options: 'Verbindungsoptionen',
    downloaded: 'neu geladen', cached: 'aus Cache', saved: 'Server gespeichert', restored: 'Originaldateien wiederhergestellt',
    preserved: 'Extern geänderte Ladereihenfolgen wurden vor dem Ersetzen separat gesichert:',
    gameExitedEarly: 'Skyrim hat sich kurz nach dem Start beendet. Diagnoseprotokoll:',
    gameExitedWithError: 'Skyrim wurde mit einem Fehlercode beendet. Diagnoseprotokoll:', exitCode: 'Windows-Exitcode',
    gameExited: 'Skyrim wurde beendet.', gameCheckFailed: 'Der Spielprozess konnte nicht geprüft werden. Diagnoseprotokoll:',
    gameExitedUnknown: 'Skyrim wurde beendet; der Exitcode ist unbekannt. Diagnoseprotokoll:',
    gameNotStarted: 'Skyrim konnte nicht gestartet werden. Diagnoseprotokoll:',
    serverOffline: 'Der Server ist offline. Verbinden ist wieder möglich, sobald er sich per Heartbeat online meldet.',
    invalid: 'Bitte einen Host und ganzzahligen Port zwischen 1 und 65535 eingeben.',
    browser: 'Verbindungen und Dateizugriffe sind nur in der Desktop-App möglich.',
    manifest: 'Serverdateien ermitteln', verifying: 'Dateien prüfen', downloading: 'Herunterladen', downloadedStage: 'Download geprüft',
    cachedStage: 'Cache geprüft', runtimeStage: 'Clientpaket vorbereiten', installing: 'Server aktivieren', readyStage: 'Bereit',
    busy: 'Vorbereitung läuft…', safety: 'Vor jedem Start werden Dateien geprüft. Beim Serverwechsel werden die vorherigen Serverdateien ersetzt und Originale gesichert. Skyrim vorher schließen.',
  },
  en: {
    title: 'Connect to a server', profiles: 'Saved servers', choose: 'Select a server', name: 'Server name',
    host: 'Host / IP', gamePort: 'Game port (UDP)', http: 'File server (HTTP/HTTPS)',
    httpHint: 'Empty = http://Host:8080. For other ports or reverse proxies, enter the full base URL.',
    auth: 'Authentication', online: 'Online (sign in in game)', offline: 'Offline (only for servers configured for offline mode)',
    master: 'Authentication server / master URL', key: 'Public server ID / master key', profile: 'Offline profile ID',
    runtime: 'SkyMP client package', runtimeHint: 'Folder containing Data/ or an HTTP(S) package/catalog URL. A catalog selects the package matching your Skyrim version. Empty = use the server package automatically if provided; otherwise use the installed client.',
    build: 'Import server build', buildHint: 'Build directory or server package: imports game/HTTP ports, authentication and the local client path.',
    import: 'Read build', save: 'Save server', remove: 'Remove profile', prepare: 'Prepare files', connect: 'Prepare and connect',
    restore: 'Restore original files', ready: 'Prepared', launched: 'Files verified, Skyrim started. Wait for multiplayer sign-in in game; do not select New.', failed: 'Preparation failed', simpleConnect: 'Connect', options: 'Connection options',
    downloaded: 'downloaded', cached: 'cached', saved: 'Server saved', restored: 'Original files restored',
    preserved: 'Externally changed load-order files were saved separately before replacement:',
    gameExitedEarly: 'Skyrim closed shortly after starting. Diagnostic log:',
    gameExitedWithError: 'Skyrim exited with an error code. Diagnostic log:', exitCode: 'Windows exit code',
    gameExited: 'Skyrim has closed.', gameCheckFailed: 'Could not check the game process. Diagnostic log:',
    gameExitedUnknown: 'Skyrim closed; its exit code is unavailable. Diagnostic log:',
    gameNotStarted: 'Skyrim could not start. Diagnostic log:',
    serverOffline: 'This server is offline. Connecting becomes available when its heartbeat reports it online again.',
    invalid: 'Enter a host and an integer port between 1 and 65535.', browser: 'Connections and file access require the desktop application.',
    manifest: 'Discover server files', verifying: 'Verify files', downloading: 'Downloading', downloadedStage: 'Download verified', cachedStage: 'Cache verified',
    runtimeStage: 'Prepare client package', installing: 'Activate server', readyStage: 'Ready', busy: 'Preparing…',
    safety: 'Files are verified before every launch. Switching servers replaces the previous server files and backs up originals. Close Skyrim first.',
  },
  ru: {
    title: 'Подключение к серверу', profiles: 'Сохранённые серверы', choose: 'Выбрать сервер', name: 'Название сервера',
    host: 'Хост / IP', gamePort: 'Игровой порт (UDP)', http: 'Файловый сервер (HTTP/HTTPS)',
    httpHint: 'Пусто = http://Хост:8080. Для другого порта или прокси укажите полный базовый URL.',
    auth: 'Авторизация', online: 'Онлайн (вход в игре)', offline: 'Офлайн (только для серверов в офлайн-режиме)',
    master: 'Сервер авторизации / master URL', key: 'Master key сервера', profile: 'ID офлайн-профиля',
    runtime: 'Пакет клиента SkyMP', runtimeHint: 'Папка с Data/ или HTTP(S)-адрес пакета/каталога. Каталог выбирает пакет для вашей версии Skyrim. Пусто = автоматически использовать пакет сервера, если доступен, иначе установленный клиент.',
    build: 'Импорт сборки сервера', buildHint: 'Папка build или пакет сервера: импорт портов, авторизации и пути клиента.',
    import: 'Прочитать сборку', save: 'Сохранить сервер', remove: 'Удалить профиль', prepare: 'Подготовить файлы', connect: 'Подготовить и подключиться',
    restore: 'Восстановить исходные файлы', ready: 'Подготовлено', launched: 'Файлы проверены, Skyrim запущен. Дождитесь входа в мультиплеер в игре; не выбирайте «Новая игра».', failed: 'Ошибка подготовки', simpleConnect: 'Подключиться', options: 'Параметры подключения',
    downloaded: 'загружено', cached: 'из кеша', saved: 'Сервер сохранён', restored: 'Исходные файлы восстановлены',
    preserved: 'Внешние изменения порядка загрузки сохранены отдельно перед заменой:',
    gameExitedEarly: 'Skyrim закрылся вскоре после запуска. Журнал диагностики:',
    gameExitedWithError: 'Skyrim завершился с кодом ошибки. Журнал диагностики:', exitCode: 'Код завершения Windows',
    gameExited: 'Skyrim закрыт.', gameCheckFailed: 'Не удалось проверить процесс игры. Журнал диагностики:',
    gameExitedUnknown: 'Skyrim закрыт; код завершения неизвестен. Журнал диагностики:',
    gameNotStarted: 'Не удалось запустить Skyrim. Журнал диагностики:',
    serverOffline: 'Сервер не в сети. Подключение станет доступно после получения heartbeat о его запуске.',
    invalid: 'Укажите хост и целый порт от 1 до 65535.', browser: 'Для подключения и файлов нужна настольная версия.',
    manifest: 'Получение списка файлов', verifying: 'Проверка файлов', downloading: 'Загрузка', downloadedStage: 'Загрузка проверена', cachedStage: 'Кеш проверен',
    runtimeStage: 'Подготовка клиента', installing: 'Активация сервера', readyStage: 'Готово', busy: 'Подготовка…',
    safety: 'Файлы проверяются перед запуском. При смене сервера его файлы заменяются, оригиналы сохраняются. Сначала закройте Skyrim.',
  },
};

function profileKey(server: ServerConnection) {
  return `${server.ip.trim().toLowerCase().replace(/^\[|\]$/g, '')}:${server.port}`;
}

function complete(server: ServerConnection): Profile {
  const { serverStatus: _availability, lastHeartbeat: _heartbeat, ...persistent } = server;
  return {
    ...persistent, resourceUrl: server.resourceUrl || '', masterUrl: server.masterUrl ?? 'https://api.skymp-worlds.net',
    serverMasterKey: server.serverMasterKey || '', offline: server.offline ?? false,
    profileId: server.profileId || 1, runtimeSource: server.runtimeSource || '',
  };
}

export function loadProfiles(): Profile[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is Profile => p && typeof p.ip === 'string' && typeof p.name === 'string'
      && Number.isInteger(p.port) && p.port > 0 && p.port <= 65535).map(complete);
  } catch { return []; }
}

function resolveProfile(server: ServerConnection): Profile {
  const saved = loadProfiles().find((p) => profileKey(p) === profileKey(server));
  const published = Object.fromEntries(Object.entries(server).filter(([, value]) => value !== undefined));
  return complete({ ...saved, ...published } as ServerConnection);
}

export default function ConnectionPanel({ selected, skyrimDir, language, playerName = '', ensureReady, onBusyChange, onConnected, mode = 'advanced', onOptions, onProfilesChange }: {
  selected: ServerConnection | null;
  skyrimDir: string;
  language: Language;
  playerName?: string;
  ensureReady: () => Promise<boolean>;
  onBusyChange: (busy: boolean) => void;
  onConnected: (server: ServerConnection) => void;
  mode?: 'hidden' | 'player' | 'advanced';
  onOptions?: () => void;
  onProfilesChange?: (profiles: ServerConnection[]) => void;
}) {
  const text = labels[language];
  const streamer = useStreamerMode();
  const [profiles, setProfiles] = useState(loadProfiles);
  const [draft, setDraft] = useState<Profile>(() => loadProfiles()[0] || complete({ name: 'SkyMP', ip: '127.0.0.1', port: 7777 }));
  const [buildDir, setBuildDir] = useState(import.meta.env.DEV ? String(import.meta.env.VITE_LOCAL_SERVER_BUILD_DIR || '') : '');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState('');
  const [failureIsGame, setFailureIsGame] = useState(false);
  const [preservedFiles, setPreservedFiles] = useState<PreservedFile[]>([]);
  const [splashServer, setSplashServer] = useState<ServerConnection | null>(null);
  const [verifiedFiles, setVerifiedFiles] = useState(0);
  const operation = useRef('');
  const launchedOperation = useRef('');
  const selectedAddress = useRef('');
  const section = useRef<HTMLElement>(null);
  const autoImportAllowed = useRef(true);
  const working = useRef(false);
  const serverUnavailable = selected?.serverStatus === 'offline' && profileKey(selected) === profileKey(draft);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const apply = (state: GameStatus) => {
      if (!state?.operationId || state.operationId !== launchedOperation.current) return;
      const hasExitCode = Number.isInteger(state.exitCode) && state.exitCode! >= 0 && state.exitCode! <= 0xffffffff;
      const gameEnded = state.phase === 'exited' || state.phase === 'exitedEarly';
      const exitedWithError = gameEnded && hasExitCode && state.exitCode !== 0;
      if (gameEnded && hasExitCode && state.exitCode === 0) { setStatus(text.gameExited); setFailure(''); setFailureIsGame(false); }
      else if (gameEnded || ['checkFailed', 'notStarted', 'launchFailed'].includes(state.phase)) {
        const message = exitedWithError ? text.gameExitedWithError : gameEnded ? text.gameExitedUnknown : state.phase === 'checkFailed' ? text.gameCheckFailed : text.gameNotStarted;
        const code = hasExitCode ? ` (${text.exitCode}: 0x${state.exitCode!.toString(16).toUpperCase().padStart(8, '0')})` : '';
        setStatus(''); setFailureIsGame(true); setFailure(`${message} ${state.diagnosticsPath}${code}`);
      }
    };
    void listen<GameStatus>('game-lifecycle', event => apply(event.payload))
      .then(stop => { if (cancelled) stop(); else unsubscribe = stop; }).catch(() => {});
    return () => { cancelled = true; unsubscribe?.(); };
  }, [language]);

  useEffect(() => {
    // Local developer builds can point at a sibling server checkout without shipping a fixed server.
    if (!import.meta.env.DEV) return;
    const localBuild = String(import.meta.env.VITE_LOCAL_SERVER_BUILD_DIR || '');
    if (!localBuild || loadProfiles().length) return;
    let cancelled = false;
    void invoke<ServerConnection>('import_server_build', { buildDir: localBuild, connectHost: '127.0.0.1' }).then((imported) => {
      if (cancelled || !autoImportAllowed.current) return;
      const profile = complete(imported);
      localStorage.setItem(PROFILE_KEY, JSON.stringify([profile]));
      setDraft(profile); setProfiles([profile]);
      onProfilesChange?.([profile]);
    }).catch((e) => { if (!cancelled) reportError(e); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected || working.current) return;
    autoImportAllowed.current = false;
    // Registry metadata must win when an operator changes a file host or client package.
    // Preserve manual settings only when an older registry does not publish those fields.
    setDraft(resolveProfile(selected));
    if (selectedAddress.current !== profileKey(selected)) {
      setStatus(''); setFailure(''); setProgress(null); setPreservedFiles([]);
      selectedAddress.current = profileKey(selected);
    }
  }, [selected]);

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    autoImportAllowed.current = false;
    setDraft((previous) => ({ ...previous, [key]: value }));
    setStatus(''); setFailure(''); setProgress(null); setPreservedFiles([]);
  };
  const setWorking = (value: boolean) => { working.current = value; setBusy(value); onBusyChange(value); };
  const store = (profile: Profile) => {
    const next = [...profiles.filter((p) => profileKey(p) !== profileKey(profile)), profile];
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    setProfiles(next);
    onProfilesChange?.(next);
  };
  const validate = (profile = draft) => {
    if (!profile.ip.trim() || !Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) throw new Error(text.invalid);
  };
  const reportError = (error: unknown) => { setFailureIsGame(false); setFailure(connectionErrorMessage(error, language)); };

  const importBuild = async () => {
    if (working.current) return;
    setWorking(true); setFailure(''); setStatus('');
    try {
      const imported = await invoke<ServerConnection>('import_server_build', { buildDir, connectHost: draft.ip.trim() || '127.0.0.1' });
      const profile = complete(imported);
      setDraft(profile); store(profile); setStatus(text.saved);
    } catch (e) { reportError(e); }
    finally { setWorking(false); }
  };

  const run = async (launch: boolean, server?: ServerConnection) => {
    if (working.current) return;
    const profile = server ? resolveProfile(server) : draft;
    setWorking(true); setFailure(''); setStatus(''); setProgress(null); setPreservedFiles([]);
    let unlisten: (() => void) | undefined;
    const verified = new Set<string>();
    try {
      validate(profile);
      if (launch && (server?.serverStatus === 'offline' || serverUnavailable)) throw new Error(text.serverOffline);
      if (!(await ensureReady())) return;
      operation.current = crypto.randomUUID();
      if (launch) launchedOperation.current = operation.current;
      unlisten = await listen<Progress>('server-preparation', (event) => {
        if (event.payload.operationId !== operation.current) return;
        setProgress(event.payload);
        if (['cached', 'downloaded'].includes(event.payload.stage)) { verified.add(event.payload.file); setVerifiedFiles(verified.size); }
      });
      setVerifiedFiles(0); setSplashServer(launch ? profile : null);
      setDraft(profile); store(profile);
      const result = await invoke<Result>(launch ? 'join_server' : 'prepare_server', { request: {
        ...profile, skyrimDir: skyrimDir.trim() || null, operationId: operation.current, playerName: playerName.trim() || null,
      } });
      setPreservedFiles(result.preservedFiles || []);
      if (launch) {
        setSplashServer(null);
        onConnected(profile);
      }
      setStatus(mode === 'player' && launch ? text.launched : `${launch ? text.launched : text.ready}: ${result.downloadedFiles} ${text.downloaded}, ${result.cachedFiles} ${text.cached}. ${result.loadOrder.join(', ')}`);
    } catch (e) { reportError(e); }
    finally { unlisten?.(); operation.current = ''; setWorking(false); }
  };

  const restore = async () => {
    if (working.current) return;
    setWorking(true); setFailure(''); setStatus(''); setProgress(null); setPreservedFiles([]);
    try {
      const saved = await invoke<PreservedFile[]>('restore_skyrim', { skyrimDir: skyrimDir.trim() || null });
      setPreservedFiles(saved || []);
      setStatus(text.restored);
    } catch (e) { reportError(e); }
    finally { setWorking(false); }
  };

  const stageLabels: Record<string, string> = { steam: language === 'de' ? 'Steam-Anmeldung prüfen' : language === 'ru' ? 'Проверка Steam' : 'Verifying Steam login', manifest: text.manifest, verifying: text.verifying, downloading: text.downloading,
    downloaded: text.downloadedStage, cached: text.cachedStage, runtime: text.runtimeStage, installing: text.installing, ready: text.readyStage };
  const percent = progress && progress.total > 0 ? Math.min(100, Math.round(progress.completed / progress.total * 100)) : undefined;

  const feedback = <>
    {splashServer && <ConnectionSplash server={splashServer} language={language} progress={progress} busy={busy} failure={failure} status={status} verifiedFiles={verifiedFiles} onClose={() => setSplashServer(null)} />}
    <div aria-live="polite" role="status" className="preparation-status">
      {busy && <p>{progress ? stageLabels[progress.stage] || text.busy : text.busy} {progress && !['manifest', 'installing', 'ready'].includes(progress.stage) ? progress.file.split(/[\\/]/).pop() : ''}</p>}
      {busy && progress && <progress aria-label={stageLabels[progress.stage] || text.busy} max="100" value={percent} />}
      {busy && percent !== undefined && progress?.stage === 'downloading' && <span>{percent}% · {(progress.completed / 1048576).toFixed(1)} / {(progress.total / 1048576).toFixed(1)} MiB</span>}
      {status && <p>{privateText(status, streamer, language)}</p>}
      {preservedFiles.length > 0 && <div className="load-order-recovery"><p>{text.preserved}</p>
        <ul>{preservedFiles.map((file) => <li key={file.backupPath}><code>{privateText(file.backupPath, streamer, language)}</code></li>)}</ul>
      </div>}
    </div>
    {failure && <p className="error" role="alert">{failureIsGame ? '' : `${text.failed}: `}{privateText(failure, streamer, language)}</p>}
  </>;
  if (mode === 'hidden') return null;
  if (mode === 'player') return <section className="player-connection" id="server-connection" aria-label={text.title}>
    {selected?.serverStatus === 'offline' && <p className="server-offline-note" role="status">{text.serverOffline}</p>}
    <div className="player-connect-actions"><button className="btn-join player-connect-button" disabled={busy || !selected || selected?.serverStatus === 'offline'} onClick={() => void run(true, selected || undefined)}>{busy ? text.busy : text.simpleConnect}<span aria-hidden="true">→</span></button>
      <button className="text-button" onClick={onOptions} disabled={busy}>{text.options}</button></div>{feedback}
  </section>;

  return (
    <section className="panel connection-panel" ref={section} id="server-connection">
      <h2>{text.title}</h2>
      <fieldset disabled={busy}>
        <div className="connection-grid">
          <label>{text.profiles}<select className="search-input" value={profiles.some((p) => profileKey(p) === profileKey(draft)) ? profileKey(draft) : ''}
            onChange={(event) => { const next = profiles.find((p) => profileKey(p) === event.target.value); if (next) setDraft(next); }}>
            <option value="">{text.choose}</option>
            {profiles.map((p) => <option key={profileKey(p)} value={profileKey(p)}>{p.name}{streamer ? '' : ` (${p.ip}:${p.port})`}</option>)}
          </select></label>
          <label>{text.name}<input className="search-input" value={draft.name} onChange={(e) => update('name', e.target.value)} /></label>
          <label>{text.host}<input className="search-input" type={streamer ? 'password' : 'text'} autoComplete="off" value={draft.ip} onChange={(e) => update('ip', e.target.value)} /></label>
          <label>{text.gamePort}<input className="search-input" type="number" min="1" max="65535" step="1" value={draft.port || ''} onChange={(e) => update('port', Number(e.target.value))} /></label>
          <label className="connection-wide">{text.http}<input className="search-input" type={streamer ? 'password' : 'text'} autoComplete="off" aria-label={text.http} aria-describedby="resource-url-hint" placeholder="http://127.0.0.1:8080" value={draft.resourceUrl} onChange={(e) => update('resourceUrl', e.target.value)} /><small id="resource-url-hint">{text.httpHint}</small></label>
          <label>{text.auth}<select className="search-input" aria-label={text.auth} value={draft.offline ? 'offline' : 'online'} onChange={(e) => update('offline', e.target.value === 'offline')}>
            <option value="online">{text.online}</option><option value="offline">{text.offline}</option>
          </select></label>
          {draft.offline ? <label>{text.profile}<input className="search-input" type="number" min="1" max="2147483647" step="1" value={draft.profileId} onChange={(e) => update('profileId', Number(e.target.value))} /></label>
            : <label>{text.master}<input className="search-input" type={streamer ? 'password' : 'text'} autoComplete="off" value={draft.masterUrl} onChange={(e) => update('masterUrl', e.target.value)} /></label>}
          <label className="connection-wide">{text.key}<input className="search-input" type={streamer ? 'password' : 'text'} autoComplete="off" value={draft.serverMasterKey} onChange={(e) => update('serverMasterKey', e.target.value)} /></label>
          <label className="connection-wide">{text.runtime}<input className="search-input" type={streamer ? 'password' : 'text'} autoComplete="off" aria-label={text.runtime} aria-describedby="runtime-source-hint" value={draft.runtimeSource} placeholder="https://cdn.example.org/skymp/catalog.json" onChange={(e) => update('runtimeSource', e.target.value)} /><small id="runtime-source-hint">{text.runtimeHint}</small></label>
        </div>
        <details className="build-import"><summary>{text.build}</summary>
          <p className="modal-hint">{text.buildHint}</p>
          <div className="controls"><input type={streamer ? 'password' : 'text'} autoComplete="off" aria-label={text.build} className="search-input" placeholder="C:\SkyMP\server\build" value={buildDir} onChange={(e) => setBuildDir(e.target.value)} />
            <button className="btn-refresh" onClick={() => void importBuild()} disabled={!buildDir.trim()}>{text.import}</button></div>
        </details>
        <div className="controls">
          <button className="btn-refresh" onClick={() => { try { validate(); store(draft); setStatus(text.saved); setFailure(''); } catch (e) { reportError(e); } }}>{text.save}</button>
          <button className="btn-refresh" disabled={!profiles.some((p) => profileKey(p) === profileKey(draft))} onClick={() => {
            try { const next = profiles.filter((p) => profileKey(p) !== profileKey(draft)); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); setProfiles(next); onProfilesChange?.(next); } catch (e) { reportError(e); }
          }}>{text.remove}</button>
          <button className="btn-refresh" onClick={() => void run(false)}>{text.prepare}</button>
          <button className="btn-join" disabled={serverUnavailable} onClick={() => void run(true)}>{text.connect}</button>
          <button className="btn-refresh" onClick={() => void restore()}>{text.restore}</button>
        </div>
      </fieldset>
      <p className="modal-hint">{text.safety}</p>
      {feedback}
    </section>
  );
}
