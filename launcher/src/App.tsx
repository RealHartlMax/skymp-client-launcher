import { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';

/** Shape of a server entry returned by the master server. */
interface ServerEntry {
  id: string;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  gamemode?: string;
  countryCode?: string;
}

interface ApiServerEntry {
  id?: string;
  name?: string;
  ip?: string;
  port?: number | string;
  current_players?: number | string;
  max_players?: number | string;
  players?: number | string;
  maxPlayers?: number | string;
  gamemode?: string;
  country_code?: string;
}

type SortMode = 'players_desc' | 'players_asc' | 'name_asc';
type ActiveTab = 'servers' | 'favorites';
type AppLanguage = 'de' | 'en' | 'ru';
type OccupancyFilter = 'all' | 'empty' | 'active' | 'busy';
type LayoutMode = 'ultra-compact' | 'compact' | 'balanced' | 'wide';

interface ViewportProfile {
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
  layout: LayoutMode;
}

interface SkyrimInstallCheck {
  resolved_path?: string | null;
  has_skse: boolean;
  message: string;
}

interface SkyrimEnvironmentStatus {
  resolved_path?: string | null;
  has_skse: boolean;
  has_plugins_dir: boolean;
  can_write_plugins: boolean;
  has_existing_settings: boolean;
  message: string;
}

interface ImportedSkympClientSettings {
  found: boolean;
  path?: string | null;
  server_ip?: string | null;
  server_port?: number | null;
  master?: string | null;
  server_master_key?: string | null;
  message: string;
}

interface VersionMetadataPayload {
  version?: string;
  releaseDate?: string;
  channel?: string;
  downloadUrl?: string;
  changelogUrl?: string;
  changelog?: Partial<Record<AppLanguage, string[]>>;
}

interface VersionInfo {
  version: string;
  releaseDate: string;
  channel: string;
  downloadUrl: string;
  changelogUrl: string;
  notes: string[];
}

const DEFAULT_SERVER_LIST_URL = import.meta.env.VITE_SERVER_LIST_URL ?? 'https://api.skymp-worlds.net/list.php';
const DEFAULT_VERSION_JSON_URL = import.meta.env.VITE_VERSION_JSON_URL ?? 'https://update.skymp-worlds.net/version.json';
const STORAGE_ENDPOINT_KEY = 'skymp.launcher.endpoint';
const STORAGE_FAVORITES_KEY = 'skymp.launcher.favorites';
const STORAGE_SKYRIM_DIR_KEY = 'skymp.launcher.skyrimDir';
const STORAGE_SETUP_DONE_KEY = 'skymp.launcher.setupDone';
const STORAGE_LANGUAGE_KEY = 'skymp.launcher.language';
const SKSE_DOWNLOAD_URL = 'https://skse.silverlock.org/';

const translations = {
  de: {
    subtitle: 'Nordisch, direkt, bereit fuer dein naechstes Abenteuer.',
    metricServers: 'Server',
    metricPlayers: 'Spieler',
    metricVisible: 'Sichtbar',
    metricSkse: 'SKSE',
    skseReady: 'bereit',
    skseMissing: 'fehlt',
    endpointPlaceholder: 'Serverlisten-Endpunkt',
    applyEndpoint: 'Endpunkt speichern',
    refresh: 'Aktualisieren',
    loading: 'Laedt...',
    skyrimDirPlaceholder: 'Skyrim Ordner, z.B. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    checkPath: 'Pfad pruefen',
    importSettings: 'Settings importieren',
    checkSkse: 'SKSE64 Loader',
    checkPluginsDir: 'Plugins-Ordner',
    checkPluginsWrite: 'Schreibrechte Plugins',
    checkExistingSettings: 'Vorhandene SkyMP-Settings',
    tabServers: 'Alle Server',
    tabFavorites: 'Favoriten',
    searchPlaceholder: 'Suche nach Name, IP, Port, Modus, Land...',
    sortPlayersDesc: 'Spieler hoch nach niedrig',
    sortPlayersAsc: 'Spieler niedrig nach hoch',
    sortNameAsc: 'Name A-Z',
    filterGamemode: 'Modus filtern',
    filterCountry: 'Land filtern',
    filterOccupancy: 'Auslastung',
    allGamemodes: 'Alle Modi',
    allCountries: 'Alle Laender',
    occupancyAll: 'Alle',
    occupancyEmpty: 'Leer',
    occupancyActive: 'Aktiv',
    occupancyBusy: 'Fast voll',
    hideFull: 'Volle ausblenden',
    errorPrefix: 'Warnung',
    emptyFavorites: 'Noch keine Favoriten markiert.',
    emptyServers: 'Keine Server gefunden.',
    directConnect: 'Direkt verbinden',
    hostOrIp: 'Host oder IP',
    port: 'Port',
    connect: 'Verbinden',
    setupChoosePath: 'Bitte waehle deinen Skyrim-Installationspfad aus.',
    invalidHostPort: 'Bitte gueltigen Host und Port eingeben.',
    endpointInvalid: 'Endpunkt ist ungueltig. Beispiel: https://api.skymp-worlds.net/list.php',
    setupTitle: 'Spielpfad einrichten',
    setupBody: 'Beim ersten Start brauchen wir den Installationsordner von Skyrim Special Edition.',
    setupPathPlaceholder: 'z.B. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    setupHint: 'Bitte Pfad waehlen und pruefen.',
    autoDetect: 'Automatisch erkennen',
    savePath: 'Pfad speichern',
    skseModalTitle: 'SKSE64 fehlt',
    skseModalBody: 'Im gewaehlten Ordner wurde keine SKSE64-Installation gefunden. Bitte zuerst SKSE installieren.',
    downloadSkse: 'SKSE herunterladen',
    choosePathAgain: 'Pfad neu waehlen',
    modeLabel: 'Modus',
    modeUnknown: 'n/a',
    countryLabel: 'Land',
    join: 'Join',
    joining: 'Verbinde...',
    joinFailed: 'Verbindung fehlgeschlagen',
    languageLabel: 'Sprache',
    releasePanelTitle: 'Launcher Version',
    releaseVersionLabel: 'Version',
    releaseDateLabel: 'Veroeffentlicht',
    releaseChannelLabel: 'Kanal',
    releaseNotesLabel: 'Neuerungen',
    releaseOpenChangelog: 'Changelog oeffnen',
    releaseDownload: 'Launcher herunterladen',
    releaseUnavailable: 'Versionsdaten nicht verfuegbar.',
  },
  en: {
    subtitle: 'Nordic, direct, ready for your next adventure.',
    metricServers: 'Servers',
    metricPlayers: 'Players',
    metricVisible: 'Visible',
    metricSkse: 'SKSE',
    skseReady: 'ready',
    skseMissing: 'missing',
    endpointPlaceholder: 'Server list endpoint',
    applyEndpoint: 'Apply endpoint',
    refresh: 'Refresh',
    loading: 'Loading...',
    skyrimDirPlaceholder: 'Skyrim folder, e.g. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    checkPath: 'Check path',
    importSettings: 'Import settings',
    checkSkse: 'SKSE64 loader',
    checkPluginsDir: 'Plugins directory',
    checkPluginsWrite: 'Plugins write access',
    checkExistingSettings: 'Existing SkyMP settings',
    tabServers: 'All servers',
    tabFavorites: 'Favorites',
    searchPlaceholder: 'Search by name, IP, port, mode, country...',
    sortPlayersDesc: 'Players high to low',
    sortPlayersAsc: 'Players low to high',
    sortNameAsc: 'Name A-Z',
    filterGamemode: 'Filter mode',
    filterCountry: 'Filter country',
    filterOccupancy: 'Occupancy',
    allGamemodes: 'All modes',
    allCountries: 'All countries',
    occupancyAll: 'All',
    occupancyEmpty: 'Empty',
    occupancyActive: 'Active',
    occupancyBusy: 'Almost full',
    hideFull: 'Hide full',
    errorPrefix: 'Warning',
    emptyFavorites: 'No favorites marked yet.',
    emptyServers: 'No servers found.',
    directConnect: 'Direct connect',
    hostOrIp: 'Host or IP',
    port: 'Port',
    connect: 'Connect',
    setupChoosePath: 'Please select your Skyrim installation path.',
    invalidHostPort: 'Please enter a valid host and port.',
    endpointInvalid: 'Endpoint format is invalid. Example: https://api.skymp-worlds.net/list.php',
    setupTitle: 'Set game path',
    setupBody: 'On first start we need the installation folder of Skyrim Special Edition.',
    setupPathPlaceholder: 'e.g. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    setupHint: 'Please choose a path and verify it.',
    autoDetect: 'Auto detect',
    savePath: 'Save path',
    skseModalTitle: 'SKSE64 missing',
    skseModalBody: 'No SKSE64 installation was found in the selected folder. Please install SKSE first.',
    downloadSkse: 'Download SKSE',
    choosePathAgain: 'Choose path again',
    modeLabel: 'Mode',
    modeUnknown: 'n/a',
    countryLabel: 'Country',
    join: 'Join',
    joining: 'Joining...',
    joinFailed: 'Failed to join server',
    languageLabel: 'Language',
    releasePanelTitle: 'Launcher Version',
    releaseVersionLabel: 'Version',
    releaseDateLabel: 'Released',
    releaseChannelLabel: 'Channel',
    releaseNotesLabel: 'Highlights',
    releaseOpenChangelog: 'Open changelog',
    releaseDownload: 'Download launcher',
    releaseUnavailable: 'Version metadata is unavailable.',
  },
  ru: {
    subtitle: 'Северный стиль, прямой путь, готово к новому приключению.',
    metricServers: 'Серверы',
    metricPlayers: 'Игроки',
    metricVisible: 'Видимо',
    metricSkse: 'SKSE',
    skseReady: 'готово',
    skseMissing: 'нет',
    endpointPlaceholder: 'Эндпоинт списка серверов',
    applyEndpoint: 'Применить эндпоинт',
    refresh: 'Обновить',
    loading: 'Загрузка...',
    skyrimDirPlaceholder: 'Папка Skyrim, например G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    checkPath: 'Проверить путь',
    importSettings: 'Импорт настроек',
    checkSkse: 'SKSE64 загрузчик',
    checkPluginsDir: 'Папка Plugins',
    checkPluginsWrite: 'Права записи в Plugins',
    checkExistingSettings: 'Существующие настройки SkyMP',
    tabServers: 'Все серверы',
    tabFavorites: 'Избранное',
    searchPlaceholder: 'Поиск по имени, IP, порту, режиму, стране...',
    sortPlayersDesc: 'Игроки: от большего к меньшему',
    sortPlayersAsc: 'Игроки: от меньшего к большему',
    sortNameAsc: 'Имя A-Z',
    filterGamemode: 'Фильтр режима',
    filterCountry: 'Фильтр страны',
    filterOccupancy: 'Заполненность',
    allGamemodes: 'Все режимы',
    allCountries: 'Все страны',
    occupancyAll: 'Все',
    occupancyEmpty: 'Пустые',
    occupancyActive: 'Активные',
    occupancyBusy: 'Почти полные',
    hideFull: 'Скрыть заполненные',
    errorPrefix: 'Предупреждение',
    emptyFavorites: 'Избранные серверы пока не добавлены.',
    emptyServers: 'Серверы не найдены.',
    directConnect: 'Прямое подключение',
    hostOrIp: 'Хост или IP',
    port: 'Порт',
    connect: 'Подключиться',
    setupChoosePath: 'Выберите путь установки Skyrim.',
    invalidHostPort: 'Введите корректные хост и порт.',
    endpointInvalid: 'Неверный формат эндпоинта. Пример: https://api.skymp-worlds.net/list.php',
    setupTitle: 'Настройка пути игры',
    setupBody: 'При первом запуске нужен путь к папке Skyrim Special Edition.',
    setupPathPlaceholder: 'например G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    setupHint: 'Выберите путь и проверьте его.',
    autoDetect: 'Автоопределение',
    savePath: 'Сохранить путь',
    skseModalTitle: 'SKSE64 не найден',
    skseModalBody: 'В выбранной папке не найдена установка SKSE64. Сначала установите SKSE.',
    downloadSkse: 'Скачать SKSE',
    choosePathAgain: 'Выбрать путь заново',
    modeLabel: 'Режим',
    modeUnknown: 'н/д',
    countryLabel: 'Страна',
    join: 'Войти',
    joining: 'Подключение...',
    joinFailed: 'Ошибка подключения к серверу',
    languageLabel: 'Язык',
    releasePanelTitle: 'Версия лаунчера',
    releaseVersionLabel: 'Версия',
    releaseDateLabel: 'Дата релиза',
    releaseChannelLabel: 'Канал',
    releaseNotesLabel: 'Изменения',
    releaseOpenChangelog: 'Открыть changelog',
    releaseDownload: 'Скачать лаунчер',
    releaseUnavailable: 'Метаданные версии недоступны.',
  },
} as const;

type Localization = {
  [K in keyof (typeof translations)['de']]: string;
};

const localizedTranslations: Record<AppLanguage, Localization> = translations;

function normalizeServerListUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_SERVER_LIST_URL;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const asUrl = new URL(withProtocol);
  const pathname = asUrl.pathname.toLowerCase();

  if (pathname.endsWith('/list.php')) {
    return asUrl.toString();
  }

  const normalizedPath = asUrl.pathname.endsWith('/') ? asUrl.pathname : `${asUrl.pathname}/`;
  asUrl.pathname = `${normalizedPath}list.php`.replace(/\/\/+/, '/');
  asUrl.search = '';

  return asUrl.toString();
}

function loadSavedEndpoint(): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_ENDPOINT_KEY) || '';
    return normalizeServerListUrl(raw || DEFAULT_SERVER_LIST_URL);
  } catch {
    return DEFAULT_SERVER_LIST_URL;
  }
}

function loadFavoriteIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function loadSkyrimDir(): string {
  try {
    return window.localStorage.getItem(STORAGE_SKYRIM_DIR_KEY) || '';
  } catch {
    return '';
  }
}

function loadSetupDone(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_SETUP_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function detectSystemLanguage(): AppLanguage {
  const candidates: string[] = [];
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
  }
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  if (locale) {
    candidates.push(locale);
  }

  for (const value of candidates) {
    const normalized = value.toLowerCase();
    if (normalized.startsWith('de')) return 'de';
    if (normalized.startsWith('ru')) return 'ru';
    if (normalized.startsWith('en')) return 'en';
  }

  return 'en';
}

function loadLanguage(): AppLanguage {
  try {
    const raw = window.localStorage.getItem(STORAGE_LANGUAGE_KEY);
    if (raw === 'de' || raw === 'en' || raw === 'ru') {
      return raw;
    }
  } catch {
    // ignore storage errors
  }

  return detectSystemLanguage();
}

function getViewportProfile(): ViewportProfile {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: 900,
      screenWidth: 1280,
      screenHeight: 900,
      layout: 'balanced',
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const screenWidth = window.screen?.availWidth || width;
  const screenHeight = window.screen?.availHeight || height;
  const widthCoverage = width / Math.max(screenWidth, 1);

  let layout: LayoutMode = 'balanced';
  if (width < 760 || height < 620 || widthCoverage < 0.5) {
    layout = 'ultra-compact';
  } else if (width < 920 || height < 760 || widthCoverage < 0.62) {
    layout = 'compact';
  } else if (width >= 1460 && height >= 900 && widthCoverage > 0.72) {
    layout = 'wide';
  }

  return { width, height, screenWidth, screenHeight, layout };
}

async function tauriInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/tauri');
  return invoke<T>(command, args);
}

async function checkSkyrimInstall(skyrimDir: string, language: AppLanguage): Promise<SkyrimInstallCheck> {
  return tauriInvoke<SkyrimInstallCheck>('check_skyrim_install_with_language', {
    skyrim_dir: skyrimDir.trim() || null,
    language,
  });
}

async function checkSkyrimEnvironment(skyrimDir: string, language: AppLanguage): Promise<SkyrimEnvironmentStatus> {
  return tauriInvoke<SkyrimEnvironmentStatus>('check_skyrim_environment_with_language', {
    skyrim_dir: skyrimDir.trim() || null,
    language,
  });
}

async function importExistingSkympSettings(skyrimDir: string, language: AppLanguage): Promise<ImportedSkympClientSettings> {
  return tauriInvoke<ImportedSkympClientSettings>('import_skymp_settings_with_language', {
    skyrim_dir: skyrimDir.trim() || null,
    language,
  });
}

async function fetchServerList(serverListUrl: string): Promise<ServerEntry[]> {
  const res = await fetch(serverListUrl);
  if (!res.ok) throw new Error(`Server list endpoint responded with ${res.status}`);

  const data = await res.json() as ApiServerEntry[];
  if (!Array.isArray(data)) {
    throw new Error('Server list payload is not an array');
  }

  return data
    .map((item) => {
      const name = String(item.name ?? '').trim();
      const ip = String(item.ip ?? '').trim();
      const port = Number(item.port ?? 0);
      const currentPlayers = Number(item.current_players ?? item.players ?? 0);
      const maxPlayers = Number(item.max_players ?? item.maxPlayers ?? 0);

      if (!name || !ip || !Number.isFinite(port) || port <= 0) {
        return null;
      }

      return {
        id: String(item.id ?? `${ip}:${port}`),
        name,
        ip,
        port,
        players: Number.isFinite(currentPlayers) ? currentPlayers : 0,
        maxPlayers: Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : 0,
        gamemode: typeof item.gamemode === 'string' ? item.gamemode.trim() : '',
        countryCode: typeof item.country_code === 'string' ? item.country_code.trim().toUpperCase() : '',
      } as ServerEntry;
    })
    .filter((item): item is ServerEntry => item !== null);
}

async function fetchVersionMetadata(versionJsonUrl: string, language: AppLanguage): Promise<VersionInfo> {
  const res = await fetch(versionJsonUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Version metadata endpoint responded with ${res.status}`);

  const payload = await res.json() as VersionMetadataPayload;
  const notesByLanguage = payload.changelog ?? {};
  const localizedNotes = notesByLanguage[language] ?? notesByLanguage.en ?? [];

  return {
    version: String(payload.version || '0.0.0'),
    releaseDate: String(payload.releaseDate || '-'),
    channel: String(payload.channel || 'stable'),
    downloadUrl: String(payload.downloadUrl || ''),
    changelogUrl: String(payload.changelogUrl || ''),
    notes: Array.isArray(localizedNotes) ? localizedNotes.filter((item) => typeof item === 'string').slice(0, 5) : [],
  };
}

/**
 * Writes connection data via Tauri backend and then launches SKSE.
 */
async function joinServer(server: ServerEntry, options: { skyrimDir: string }): Promise<void> {
  await tauriInvoke('join_server', {
    ip: server.ip,
    port: server.port,
    skyrim_dir: options.skyrimDir.trim() || null,
    master_url: '',
    server_master_key: null,
  });
}

export default function App() {
  const [viewport, setViewport] = useState<ViewportProfile>(() => getViewportProfile());
  const [language, setLanguage] = useState<AppLanguage>(() => loadLanguage());
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('players_desc');
  const [activeTab, setActiveTab] = useState<ActiveTab>('servers');
  const [hideFullServers, setHideFullServers] = useState(false);
  const [gamemodeFilter, setGamemodeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyFilter>('all');
  const [favorites, setFavorites] = useState<string[]>(() => loadFavoriteIds());
  const [serverListUrl, setServerListUrl] = useState(() => loadSavedEndpoint());
  const [endpointDraft, setEndpointDraft] = useState(() => loadSavedEndpoint());
  const [skyrimDir, setSkyrimDir] = useState(() => loadSkyrimDir());
  const [setupPathDraft, setSetupPathDraft] = useState(() => loadSkyrimDir());
  const [setupStatus, setSetupStatus] = useState('');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showSkseModal, setShowSkseModal] = useState(false);
  const [skyrimCheck, setSkyrimCheck] = useState<SkyrimInstallCheck | null>(null);
  const [skyrimEnv, setSkyrimEnv] = useState<SkyrimEnvironmentStatus | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [directIp, setDirectIp] = useState('');
  const [directPort, setDirectPort] = useState('');
  const i18n = localizedTranslations[language];

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  useEffect(() => {
    const handleResize = () => setViewport(getViewportProfile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const appStyle = useMemo(() => {
    const maxWidth = viewport.layout === 'wide'
      ? Math.min(1520, Math.max(1280, Math.round(viewport.width * 0.92)))
      : viewport.layout === 'compact'
        ? Math.min(980, Math.max(760, Math.round(viewport.width * 0.96)))
        : viewport.layout === 'ultra-compact'
          ? Math.min(820, Math.max(640, Math.round(viewport.width * 0.98)))
          : Math.min(1280, Math.max(980, Math.round(viewport.width * 0.9)));

    return {
      ['--app-max-width' as string]: `${maxWidth}px`,
      ['--viewport-height' as string]: `${viewport.height}px`,
    };
  }, [viewport]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [favorites]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_ENDPOINT_KEY, serverListUrl);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [serverListUrl]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_SKYRIM_DIR_KEY, skyrimDir);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [skyrimDir]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_LANGUAGE_KEY, language);
    } catch {
      // ignore storage errors
    }
  }, [language]);

  useEffect(() => {
    const initSetup = async () => {
      const savedPath = loadSkyrimDir().trim();
      const setupDone = loadSetupDone();

      if (!setupDone || !savedPath) {
        setShowSetupModal(true);
        const detected = await checkSkyrimInstall('', language);
        if (detected.resolved_path) {
          setSetupPathDraft(detected.resolved_path);
        }
        setSetupStatus(detected.message);
        setSkyrimCheck(detected);
        return;
      }

      const status = await checkSkyrimInstall(savedPath, language);
      setSkyrimCheck(status);
      const env = await checkSkyrimEnvironment(savedPath, language);
      setSkyrimEnv(env);
      if (!status.has_skse) {
        setShowSkseModal(true);
      }
    };

    void initSetup();
  }, [language]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchServerList(serverListUrl);
      setServers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [serverListUrl]);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const loadVersion = async () => {
      setVersionError(null);
      try {
        const data = await fetchVersionMetadata(DEFAULT_VERSION_JSON_URL, language);
        setVersionInfo(data);
      } catch (e) {
        setVersionError(e instanceof Error ? e.message : 'Unknown error');
      }
    };

    void loadVersion();
  }, [language]);

  const availableGamemodes = useMemo(() => {
    return Array.from(new Set(servers.map((server) => server.gamemode?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  }, [servers]);

  const availableCountries = useMemo(() => {
    return Array.from(new Set(servers.map((server) => server.countryCode?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  }, [servers]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const baseEntries = activeTab === 'favorites'
      ? servers.filter((server) => favoriteSet.has(server.id))
      : servers;

    const entries = baseEntries.filter((server) => {
      if (gamemodeFilter !== 'all' && (server.gamemode || '') !== gamemodeFilter) {
        return false;
      }

      if (countryFilter !== 'all' && (server.countryCode || '') !== countryFilter) {
        return false;
      }

      if (occupancyFilter === 'empty' && server.players !== 0) {
        return false;
      }

      if (occupancyFilter === 'active' && server.players <= 0) {
        return false;
      }

      if (occupancyFilter === 'busy' && (server.maxPlayers <= 0 || server.players / server.maxPlayers < 0.7)) {
        return false;
      }

      if (hideFullServers && server.maxPlayers > 0 && server.players >= server.maxPlayers) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const searchable = [
        server.name,
        server.ip,
        String(server.port),
        server.gamemode || '',
        server.countryCode || '',
      ].join(' ').toLowerCase();

      return searchable.includes(needle);
    });

    entries.sort((left, right) => {
      if (sortMode === 'players_asc') {
        return left.players - right.players;
      }

      if (sortMode === 'name_asc') {
        return left.name.localeCompare(right.name);
      }

      return right.players - left.players;
    });

    return entries;
  }, [servers, search, hideFullServers, sortMode, favoriteSet, activeTab, gamemodeFilter, countryFilter, occupancyFilter]);

  const totalPlayers = useMemo(() => servers.reduce((sum, server) => sum + server.players, 0), [servers]);

  const ensureSkyrimReady = useCallback(async (): Promise<boolean> => {
    if (!skyrimDir.trim()) {
      setShowSetupModal(true);
      setSetupStatus(i18n.setupChoosePath);
      return false;
    }

    const status = await checkSkyrimInstall(skyrimDir, language);
    setSkyrimCheck(status);
    const env = await checkSkyrimEnvironment(skyrimDir, language);
    setSkyrimEnv(env);

    if (!status.has_skse) {
      setShowSkseModal(true);
      return false;
    }

    if (status.resolved_path && status.resolved_path !== skyrimDir) {
      setSkyrimDir(status.resolved_path);
      setSetupPathDraft(status.resolved_path);
    }

    return true;
  }, [skyrimDir, i18n.setupChoosePath, language]);

  const connectDirect = async () => {
    const ip = directIp.trim();
    const port = Number(directPort.trim());

    if (!ip || !Number.isFinite(port) || port < 1 || port > 65535) {
      alert(i18n.invalidHostPort);
      return;
    }

    const ready = await ensureSkyrimReady();
    if (!ready) {
      return;
    }

    await joinServer({
      id: `${ip}:${port}`,
      name: 'Direct Connect',
      ip,
      port,
      players: 0,
      maxPlayers: 0,
    }, {
      skyrimDir,
    });
  };

  const handleJoinServer = useCallback(async (server: ServerEntry) => {
    const ready = await ensureSkyrimReady();
    if (!ready) {
      return;
    }
    await joinServer(server, { skyrimDir });
  }, [skyrimDir, ensureSkyrimReady]);

  const verifyAndSavePath = useCallback(async () => {
    const status = await checkSkyrimInstall(setupPathDraft, language);
    const env = await checkSkyrimEnvironment(setupPathDraft, language);
    setSkyrimCheck(status);
    setSkyrimEnv(env);
    setSetupStatus(status.message);

    if (status.has_skse && status.resolved_path) {
      setSkyrimDir(status.resolved_path);
      setSetupPathDraft(status.resolved_path);
      setShowSetupModal(false);
      setShowSkseModal(false);
      try {
        window.localStorage.setItem(STORAGE_SETUP_DONE_KEY, '1');
      } catch {
        // ignore
      }
      return;
    }

    setShowSkseModal(true);
  }, [setupPathDraft, language]);

  const autoDetectPath = useCallback(async () => {
    const status = await checkSkyrimInstall('', language);
    const env = await checkSkyrimEnvironment(status.resolved_path || '', language);
    setSkyrimCheck(status);
    setSkyrimEnv(env);
    setSetupStatus(status.message);
    if (status.resolved_path) {
      setSetupPathDraft(status.resolved_path);
    }
  }, [language]);

  const handleImportExistingSettings = useCallback(async () => {
    const imported = await importExistingSkympSettings(setupPathDraft || skyrimDir, language);
    setSetupStatus(imported.message);

    if (imported.found) {
      if (imported.server_ip) {
        setDirectIp(imported.server_ip);
      }
      if (imported.server_port && Number.isFinite(imported.server_port)) {
        setDirectPort(String(imported.server_port));
      }
      if (imported.path) {
        const normalized = (setupPathDraft || skyrimDir).trim();
        if (!normalized && skyrimCheck?.resolved_path) {
          setSetupPathDraft(skyrimCheck.resolved_path);
        }
      }
    }
  }, [setupPathDraft, skyrimDir, skyrimCheck, language]);

  const checklist = useMemo(() => {
    return [
      {
        label: i18n.checkSkse,
        ok: !!skyrimEnv?.has_skse,
      },
      {
        label: i18n.checkPluginsDir,
        ok: !!skyrimEnv?.has_plugins_dir,
      },
      {
        label: i18n.checkPluginsWrite,
        ok: !!skyrimEnv?.can_write_plugins,
      },
      {
        label: i18n.checkExistingSettings,
        ok: !!skyrimEnv?.has_existing_settings,
      },
    ];
  }, [skyrimEnv, i18n]);

  const applyEndpoint = () => {
    try {
      const next = normalizeServerListUrl(endpointDraft);
      setServerListUrl(next);
      setEndpointDraft(next);
    } catch {
      alert(i18n.endpointInvalid);
    }
  };

  const toggleFavorite = (serverId: string) => {
    setFavorites((prev) => {
      if (prev.includes(serverId)) {
        return prev.filter((entry) => entry !== serverId);
      }

      return [...prev, serverId];
    });
  };

  return (
    <div className="app" data-layout={viewport.layout} style={appStyle}>
      <header className="app-header">
        <div>
          <h1>SkyMP Launcher</h1>
          <p className="subtitle">{i18n.subtitle}</p>
        </div>
        <div className="lang-row" aria-label={i18n.languageLabel}>
          <button className={`lang-btn ${language === 'de' ? 'lang-btn-active' : ''}`} onClick={() => setLanguage('de')}>DE</button>
          <button className={`lang-btn ${language === 'en' ? 'lang-btn-active' : ''}`} onClick={() => setLanguage('en')}>EN</button>
          <button className={`lang-btn ${language === 'ru' ? 'lang-btn-active' : ''}`} onClick={() => setLanguage('ru')}>RU</button>
        </div>
        <div className="metrics">
          <div className="metric-box">
            <span>{i18n.metricServers}</span>
            <strong>{servers.length}</strong>
          </div>
          <div className="metric-box">
            <span>{i18n.metricPlayers}</span>
            <strong>{totalPlayers}</strong>
          </div>
          <div className="metric-box">
            <span>{i18n.metricVisible}</span>
            <strong>{filtered.length}</strong>
          </div>
          <div className={`metric-box status-box ${skyrimCheck?.has_skse ? 'status-ok' : 'status-bad'}`}>
            <span>{i18n.metricSkse}</span>
            <strong>{skyrimCheck?.has_skse ? i18n.skseReady : i18n.skseMissing}</strong>
          </div>
        </div>
      </header>

      <section className="panel endpoint-panel">
        <div className="controls">
          <input
            type="text"
            value={endpointDraft}
            onChange={(event) => setEndpointDraft(event.target.value)}
            placeholder={i18n.endpointPlaceholder}
            className="search-input"
          />
          <button onClick={applyEndpoint} className="btn-refresh">{i18n.applyEndpoint}</button>
          <button onClick={refresh} disabled={loading} className="btn-refresh">
            {loading ? i18n.loading : i18n.refresh}
          </button>
        </div>
        <div className="controls">
          <input
            type="text"
            value={skyrimDir}
            onChange={(event) => setSkyrimDir(event.target.value)}
            placeholder={i18n.skyrimDirPlaceholder}
            className="search-input"
          />
          <button onClick={() => void verifyAndSavePath()} className="btn-refresh">{i18n.checkPath}</button>
          <button onClick={() => void handleImportExistingSettings()} className="btn-refresh">{i18n.importSettings}</button>
        </div>
        <div className="checklist-grid">
          {checklist.map((item) => (
            <div key={item.label} className={`check-item ${item.ok ? 'check-ok' : 'check-bad'}`}>
              <span className="check-icon">{item.ok ? '✓' : '✗'}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel release-panel">
        <div className="panel-header">
          <h2>{i18n.releasePanelTitle}</h2>
        </div>
        {versionInfo ? (
          <>
            <div className="release-meta-grid">
              <div className="release-meta-item"><span>{i18n.releaseVersionLabel}</span><strong>{versionInfo.version}</strong></div>
              <div className="release-meta-item"><span>{i18n.releaseDateLabel}</span><strong>{versionInfo.releaseDate}</strong></div>
              <div className="release-meta-item"><span>{i18n.releaseChannelLabel}</span><strong>{versionInfo.channel}</strong></div>
            </div>
            <div className="release-notes">
              <h3>{i18n.releaseNotesLabel}</h3>
              {versionInfo.notes.length > 0 ? (
                <ul>
                  {versionInfo.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty">{i18n.releaseUnavailable}</p>
              )}
            </div>
            <div className="controls">
              {versionInfo.changelogUrl ? (
                <button className="btn-refresh" onClick={() => window.open(versionInfo.changelogUrl, '_blank')}>{i18n.releaseOpenChangelog}</button>
              ) : null}
              {versionInfo.downloadUrl ? (
                <button className="btn-join" onClick={() => window.open(versionInfo.downloadUrl, '_blank')}>{i18n.releaseDownload}</button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="empty">{versionError ? `${i18n.errorPrefix}: ${versionError}` : i18n.releaseUnavailable}</p>
        )}
      </section>

      <section className="panel tabs-panel">
        <div className="tab-row">
          <button className={`tab-btn ${activeTab === 'servers' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('servers')}>
            {i18n.tabServers}
          </button>
          <button className={`tab-btn ${activeTab === 'favorites' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('favorites')}>
            {i18n.tabFavorites}
          </button>
        </div>
      </section>

      <section className="panel filter-panel">
        <div className="controls controls-grow">
          <input
            type="text"
            placeholder={i18n.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="search-input"
          />

          <select className="search-input select-input" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="players_desc">{i18n.sortPlayersDesc}</option>
            <option value="players_asc">{i18n.sortPlayersAsc}</option>
            <option value="name_asc">{i18n.sortNameAsc}</option>
          </select>

          <select className="search-input select-input" value={gamemodeFilter} onChange={(event) => setGamemodeFilter(event.target.value)} aria-label={i18n.filterGamemode}>
            <option value="all">{i18n.allGamemodes}</option>
            {availableGamemodes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <select className="search-input select-input" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} aria-label={i18n.filterCountry}>
            <option value="all">{i18n.allCountries}</option>
            {availableCountries.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <select className="search-input select-input" value={occupancyFilter} onChange={(event) => setOccupancyFilter(event.target.value as OccupancyFilter)} aria-label={i18n.filterOccupancy}>
            <option value="all">{i18n.occupancyAll}</option>
            <option value="empty">{i18n.occupancyEmpty}</option>
            <option value="active">{i18n.occupancyActive}</option>
            <option value="busy">{i18n.occupancyBusy}</option>
          </select>

          <label className="toggle-pill">
            <input type="checkbox" checked={hideFullServers} onChange={(event) => setHideFullServers(event.target.checked)} />
            <span>{i18n.hideFull}</span>
          </label>

        </div>
      </section>

      {error && <p className="error">⚠ {i18n.errorPrefix}: {error}</p>}

      <main className="server-list">
        {!loading && filtered.length === 0 && (
          <p className="empty">{activeTab === 'favorites' ? i18n.emptyFavorites : i18n.emptyServers}</p>
        )}
        {filtered.map(server => (
          <ServerCard
            key={server.id}
            server={server}
            isFavorite={favoriteSet.has(server.id)}
            onToggleFavorite={toggleFavorite}
            onJoin={handleJoinServer}
            i18n={i18n}
          />
        ))}
      </main>

      <section className="panel direct-connect">
        <h2>{i18n.directConnect}</h2>
        <div className="controls">
          <input
            type="text"
            className="search-input"
            placeholder={i18n.hostOrIp}
            value={directIp}
            onChange={(event) => setDirectIp(event.target.value)}
          />
          <input
            type="number"
            className="search-input"
            placeholder={i18n.port}
            min={1}
            max={65535}
            value={directPort}
            onChange={(event) => setDirectPort(event.target.value)}
          />
          <button className="btn-join" onClick={connectDirect}>{i18n.connect}</button>
        </div>
      </section>

      {showSetupModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2>{i18n.setupTitle}</h2>
            <p>{i18n.setupBody}</p>
            <input
              type="text"
              className="search-input"
              value={setupPathDraft}
              onChange={(event) => setSetupPathDraft(event.target.value)}
              placeholder={i18n.setupPathPlaceholder}
            />
            <p className="modal-hint">{setupStatus || i18n.setupHint}</p>
            <div className="controls">
              <button className="btn-refresh" onClick={() => void autoDetectPath()}>{i18n.autoDetect}</button>
              <button className="btn-refresh" onClick={() => void handleImportExistingSettings()}>{i18n.importSettings}</button>
              <button className="btn-join" onClick={() => void verifyAndSavePath()}>{i18n.savePath}</button>
            </div>
            <div className="checklist-grid">
              {checklist.map((item) => (
                <div key={`setup-${item.label}`} className={`check-item ${item.ok ? 'check-ok' : 'check-bad'}`}>
                  <span className="check-icon">{item.ok ? '✓' : '✗'}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSkseModal && (
        <div className="modal-backdrop">
          <div className="modal-card warning">
            <h2>{i18n.skseModalTitle}</h2>
            <p>{i18n.skseModalBody}</p>
            <div className="controls">
              <button className="btn-refresh" onClick={() => window.open(SKSE_DOWNLOAD_URL, '_blank')}>{i18n.downloadSkse}</button>
              <button className="btn-join" onClick={() => { setShowSkseModal(false); setShowSetupModal(true); }}>{i18n.choosePathAgain}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ServerCardProps {
  server: ServerEntry;
  isFavorite: boolean;
  onToggleFavorite: (serverId: string) => void;
  onJoin: (server: ServerEntry) => Promise<void>;
  i18n: Localization;
}

function ServerCard({ server, isFavorite, onToggleFavorite, onJoin, i18n }: ServerCardProps) {
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await onJoin(server);
    } catch (e) {
      alert(`${i18n.joinFailed}: ${e instanceof Error ? e.message : e}`);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="server-card">
      <div className="server-info">
        <div className="name-row">
          <h2 className="server-name">{server.name}</h2>
          <button className={`favorite-btn ${isFavorite ? 'favorite-active' : ''}`} onClick={() => onToggleFavorite(server.id)}>
            {isFavorite ? '♥' : '♡'}
          </button>
        </div>
        <span className="server-address">{server.ip}:{server.port}</span>
        <span className="server-tags">
          {server.gamemode ? `${i18n.modeLabel}: ${server.gamemode}` : `${i18n.modeLabel}: ${i18n.modeUnknown}`}
          {server.countryCode ? ` | ${i18n.countryLabel}: ${server.countryCode}` : ''}
        </span>
      </div>
      <div className="server-meta">
        <span className="player-count">
          {server.players}/{server.maxPlayers || 0}
        </span>
        <button onClick={handleJoin} disabled={joining} className="btn-join">
          {joining ? i18n.joining : i18n.join}
        </button>
      </div>
    </div>
  );
}
