import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';
import platform from '../../web/shared/platform.json';
import ConnectionPanel, { loadProfiles, type ServerConnection } from './ConnectionPanel';
import ServerBrowser, { ServerDetails, ServerInformation, browserText, type ServerEntry, webUrl } from './ServerBrowser';
import HomeCards, { homeText } from './HomeCards';
import { version as launcherVersion } from '../package.json';
import { open } from '@tauri-apps/api/shell';
import { invoke } from '@tauri-apps/api/tauri';
import CrashReports from './CrashReports';
import LauncherSettings, { type PresenceStatus, type SteamSnapshot } from './LauncherSettings';
import { loadPreferences, savePreferences, privateText, type LauncherPreferences } from './launcherPreferences';
import { PrivacyContext } from './Privacy';
import useMenuAudio from './useMenuAudio';
import { listen } from '@tauri-apps/api/event';
import useLauncherUpdates from './useLauncherUpdates';
import LauncherUpdateNotice from './LauncherUpdateNotice';
import {compareVersions,trustedReleaseUrl} from './launcherUpdates';

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
  resourceUrl?: string;
  resource_url?: string;
  masterUrl?: string;
  master?: string;
  masterKey?: string;
  offlineMode?: boolean;
  runtimeSource?: string;
  server_status?: 'online' | 'offline';
  last_heartbeat?: string;
  description?: string;
  tags?: string[] | string;
  website?: string;
  discordUrl?: string;
  discord_url?: string;
  bannerUrl?: string;
  banner_url?: string;
  iconUrl?: string;
  icon_url?: string;
}

type SortMode = 'players_desc' | 'players_asc' | 'name_asc';
type ActiveTab = 'servers' | 'favorites' | 'history';
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
  has_game?: boolean;
  has_skse: boolean;
  message: string;
}

interface SkyrimEnvironmentStatus {
  resolved_path?: string | null;
  has_game?: boolean;
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
  offline: boolean;
  profile_id?: number | null;
}

interface VersionMetadataPayload {
  available?: boolean;
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

const SERVER_LIST_URL = 'https://api.skymp-worlds.net/list.php';
const DEFAULT_VERSION_JSON_URL = import.meta.env.VITE_VERSION_JSON_URL ?? 'https://update.skymp-worlds.net/version.json';
const STORAGE_FAVORITES_KEY = 'skymp.launcher.favorites';
const STORAGE_SKYRIM_DIR_KEY = 'skymp.launcher.skyrimDir';
const STORAGE_SETUP_DONE_KEY = 'skymp.launcher.setupDone';
const STORAGE_LANGUAGE_KEY = 'skymp.launcher.language';
const HISTORY_KEY = 'skymp.launcher.history.v1';
const openExternal = (url: string) => { if (/^https?:\/\//i.test(url)) void open(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer')); };

const addressKey = (server: ServerConnection) => `${server.ip.trim().toLowerCase().replace(/^\[|\]$/g, '')}:${server.port}`;
const foldSearch = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ß/g, 'ss');
const browserEntry = (server: ServerConnection & Partial<ServerEntry>): ServerEntry => ({ ...server, id: server.id || addressKey(server), players: server.players || 0, maxPlayers: server.maxPlayers || 0 });

const translations = {
  de: {
    subtitle: 'Nordisch, direkt, bereit für dein nächstes Abenteuer.',
    metricServers: 'Server',
    metricPlayers: 'Spieler',
    metricVisible: 'Sichtbar',
    metricSkse: 'SKSE',
    skseReady: 'bereit',
    skseMissing: 'fehlt',
    refresh: 'Aktualisieren',
    loading: 'Lädt...',
    skyrimDirPlaceholder: 'Skyrim Ordner, z.B. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    gamePath: 'Spielpfad',
    gamePathHint: 'Installationsordner von Skyrim Special Edition.',
    checkingPath: 'Pfad wird geprüft …',
    checkPath: 'Pfad prüfen',
    importSettings: 'Settings importieren',
    checkSkse: 'Skyrim Special Edition',
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
    allCountries: 'Alle Länder',
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
    setupChoosePath: 'Bitte wähle deinen Skyrim-Installationspfad aus.',
    invalidHostPort: 'Bitte gültigen Host und Port eingeben.',
    setupTitle: 'Spielpfad einrichten',
    setupBody: 'Beim ersten Start brauchen wir den Installationsordner von Skyrim Special Edition.',
    setupPathPlaceholder: 'z.B. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    setupHint: 'Bitte Pfad wählen und prüfen.',
    autoDetect: 'Automatisch erkennen',
    savePath: 'Pfad speichern',
    skseModalTitle: 'Skyrim nicht gefunden',
    skseModalBody: 'Bitte den Spieleordner mit SkyrimSE.exe auswählen. Ein vollständiges Clientpaket kann SKSE anschließend automatisch bereitstellen.',
    downloadSkse: 'SKSE herunterladen',
    choosePathAgain: 'Pfad neu wählen',
    modeLabel: 'Modus',
    modeUnknown: 'n/a',
    countryLabel: 'Land',
    join: 'Verbinden',
    joining: 'Verbinde...',
    joinFailed: 'Verbindung fehlgeschlagen',
    languageLabel: 'Sprache',
    releasePanelTitle: 'Veröffentlichte Version',
    releaseVersionLabel: 'Version',
    releaseDateLabel: 'Veröffentlicht',
    releaseChannelLabel: 'Kanal',
    releaseNotesLabel: 'Neuerungen',
    releaseOpenChangelog: 'Changelog öffnen',
    releaseDownload: 'Launcher herunterladen',
    releaseUnavailable: 'Versionsdaten nicht verfügbar.',
  },
  en: {
    subtitle: 'Nordic, direct, ready for your next adventure.',
    metricServers: 'Servers',
    metricPlayers: 'Players',
    metricVisible: 'Visible',
    metricSkse: 'SKSE',
    skseReady: 'ready',
    skseMissing: 'missing',
    refresh: 'Refresh',
    loading: 'Loading...',
    skyrimDirPlaceholder: 'Skyrim folder, e.g. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    gamePath: 'Game path',
    gamePathHint: 'Installation folder of Skyrim Special Edition.',
    checkingPath: 'Checking path …',
    checkPath: 'Check path',
    importSettings: 'Import settings',
    checkSkse: 'Skyrim Special Edition',
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
    setupTitle: 'Set game path',
    setupBody: 'On first start we need the installation folder of Skyrim Special Edition.',
    setupPathPlaceholder: 'e.g. G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    setupHint: 'Please choose a path and verify it.',
    autoDetect: 'Auto detect',
    savePath: 'Save path',
    skseModalTitle: 'Skyrim not found',
    skseModalBody: 'Select the game folder containing SkyrimSE.exe. A complete client package can then install SKSE automatically.',
    downloadSkse: 'Download SKSE',
    choosePathAgain: 'Choose path again',
    modeLabel: 'Mode',
    modeUnknown: 'n/a',
    countryLabel: 'Country',
    join: 'Join',
    joining: 'Joining...',
    joinFailed: 'Failed to join server',
    languageLabel: 'Language',
    releasePanelTitle: 'Published version',
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
    refresh: 'Обновить',
    loading: 'Загрузка...',
    skyrimDirPlaceholder: 'Папка Skyrim, например G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    gamePath: 'Путь к игре',
    gamePathHint: 'Папка установки Skyrim Special Edition.',
    checkingPath: 'Проверка пути …',
    checkPath: 'Проверить путь',
    importSettings: 'Импорт настроек',
    checkSkse: 'Skyrim Special Edition',
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
    setupTitle: 'Настройка пути игры',
    setupBody: 'При первом запуске нужен путь к папке Skyrim Special Edition.',
    setupPathPlaceholder: 'например G:/SteamLibrary/steamapps/common/Skyrim Special Edition',
    setupHint: 'Выберите путь и проверьте его.',
    autoDetect: 'Автоопределение',
    savePath: 'Сохранить путь',
    skseModalTitle: 'Skyrim не найден',
    skseModalBody: 'Выберите папку игры с SkyrimSE.exe. Полный пакет клиента сможет автоматически установить SKSE.',
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
  return invoke<T>(command, args);
}

async function checkSkyrimInstall(skyrimDir: string, language: AppLanguage): Promise<SkyrimInstallCheck> {
  return tauriInvoke<SkyrimInstallCheck>('check_skyrim_install_with_language', {
    skyrimDir: skyrimDir.trim() || null,
    language,
  });
}

async function checkSkyrimEnvironment(skyrimDir: string, language: AppLanguage): Promise<SkyrimEnvironmentStatus> {
  return tauriInvoke<SkyrimEnvironmentStatus>('check_skyrim_environment_with_language', {
    skyrimDir: skyrimDir.trim() || null,
    language,
  });
}

async function importExistingSkympSettings(skyrimDir: string, language: AppLanguage): Promise<ImportedSkympClientSettings> {
  return tauriInvoke<ImportedSkympClientSettings>('import_skymp_settings_with_language', {
    skyrimDir: skyrimDir.trim() || null,
    language,
  });
}

async function fetchServerList(): Promise<ServerEntry[]> {
  const res = await fetch(SERVER_LIST_URL);
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

      if (!name || !ip || !Number.isInteger(port) || port <= 0 || port > 65535) {
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
        resourceUrl: item.resourceUrl ?? item.resource_url,
        masterUrl: item.masterUrl ?? item.master,
        serverMasterKey: item.masterKey,
        offline: item.offlineMode,
        runtimeSource: item.runtimeSource,
        serverStatus: item.server_status === 'offline' ? 'offline' : item.server_status === 'online' ? 'online' : undefined,
        lastHeartbeat: typeof item.last_heartbeat === 'string' ? item.last_heartbeat : undefined,
        description: typeof item.description === 'string' ? item.description.trim().slice(0, 2000) : '',
        tags: [...new Set((Array.isArray(item.tags) ? item.tags : typeof item.tags === 'string' ? item.tags.split(',') : []).filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().slice(0, 32)).filter(Boolean))].slice(0, 8),
        website: webUrl(item.website), discordUrl: webUrl(item.discordUrl ?? item.discord_url),
        bannerUrl: webUrl(item.bannerUrl ?? item.banner_url, true), iconUrl: webUrl(item.iconUrl ?? item.icon_url, true),
      } as ServerEntry;
    })
    .filter((item): item is ServerEntry => item !== null);
}

async function fetchVersionMetadata(versionJsonUrl: string, language: AppLanguage): Promise<VersionInfo> {
  const res = await fetch(versionJsonUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Version metadata endpoint responded with ${res.status}`);

  const payload = await res.json() as VersionMetadataPayload;
  if (payload.available === false) throw new Error({ de: 'In diesem Kanal ist noch keine Version veröffentlicht.', en: 'No version has been published in this channel yet.', ru: 'В этом канале ещё не опубликована версия.' }[language]);
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

export default function App() {
  const {updates,check:checkUpdates}=useLauncherUpdates();
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
  const [skyrimDir, setSkyrimDir] = useState(() => loadSkyrimDir());
  const [setupPathDraft, setSetupPathDraft] = useState(() => loadSkyrimDir());
  const [setupStatus, setSetupStatus] = useState('');
  const [checkingPath, setCheckingPath] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showSkseModal, setShowSkseModal] = useState(false);
  const [skyrimCheck, setSkyrimCheck] = useState<SkyrimInstallCheck | null>(null);
  const [skyrimEnv, setSkyrimEnv] = useState<SkyrimEnvironmentStatus | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<ServerEntry | null>(null);
  const [page, setPage] = useState<'browse' | 'home' | 'details' | 'advanced'>('browse');
  const [savedProfiles, setSavedProfiles] = useState<ServerConnection[]>(loadProfiles);
  const browserScroll = useRef(0);
  const [preparingServer, setPreparingServer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [preferencesStorageError, setPreferencesStorageError] = useState(false);
  const [presence, setPresence] = useState<PresenceStatus>({ state: 'disabled' });
  const [steamSnapshot, setSteamSnapshot] = useState<SteamSnapshot | null>(null);
  const [playingServer, setPlayingServer] = useState<ServerConnection | null>(null);
  const [gameRunning, setGameRunning] = useState(false);
  useMenuAudio(preferences, preparingServer || gameRunning);
  const updatePreferences = (next: LauncherPreferences) => { setPreferences(next); setPreferencesStorageError(!savePreferences(next)); };
  const clearHistory = () => { try { localStorage.removeItem(HISTORY_KEY); setHistory([]); return true; } catch { return false; } };
  const [history, setHistory] = useState<ServerEntry[]>(() => {
    try { const data: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(data) ? data.filter((p): p is ServerEntry => p && typeof p.name === 'string' && typeof p.ip === 'string' && Number.isInteger(p.port) && p.port > 0 && p.port <= 65535).slice(0, 12) : [];
    } catch { return []; }
  });
  const home = homeText[language];
  const browser = browserText[language];
  const allServers = useMemo(() => {
    const entries = new Map(servers.map(server => [addressKey(server), server]));
    for (const profile of savedProfiles) if (!entries.has(addressKey(profile))) entries.set(addressKey(profile), browserEntry(profile));
    return [...entries.values()];
  }, [servers, savedProfiles]);
  const detailServer = useMemo(() => selectedServer ? servers.find(server => addressKey(server) === addressKey(selectedServer)) || selectedServer : null, [selectedServer, servers]);
  const navigate = (next: typeof page) => {
    if (preparingServer) return;
    setPage(next);
    requestAnimationFrame(() => window.scrollTo({ top: next === 'browse' ? browserScroll.current : 0, behavior: 'instant' as ScrollBehavior }));
  };
  const browse = (tab: ActiveTab) => { if (!preparingServer) { setActiveTab(tab); navigate('browse'); } };
  const rememberConnection = (server: ServerConnection) => {
    setPlayingServer(server); setGameRunning(true);
    const current = allServers.find(entry => addressKey(entry) === addressKey(server));
    const entry = browserEntry({ ...current, ...server });
    const next = [entry, ...history.filter((p) => p.ip !== server.ip || p.port !== server.port)].slice(0, 12);
    setHistory(next); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Game launch already succeeded. */ }
  };
  const i18n = localizedTranslations[language];

  useEffect(() => {
    let disposed = false; let stop: (() => void) | undefined;
    const apply = (state: { phase: string }) => { if (!disposed) setGameRunning(['starting', 'running'].includes(state.phase)); };
    void listen<{ phase: string }>('game-lifecycle', event => apply(event.payload)).then(unsubscribe => { if (disposed) unsubscribe(); else stop = unsubscribe; }).catch(() => {});
    void invoke<{ phase: string }>('game_launch_status').then(apply).catch(() => {});
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => {
    let disposed = false;
    void invoke<PresenceStatus>('discord_presence_update', { request: { mode: preferences.discordActivity, streamerMode: preferences.streamerMode, playing: gameRunning, serverName: playingServer?.name || null, language } }).then(value => { if (!disposed) setPresence(value); }).catch(() => {});
    return () => { disposed = true; };
  }, [preferences.discordActivity, preferences.streamerMode, gameRunning, playingServer?.name, language]);
  useEffect(() => {
    if (!showSettings) return;
    let disposed = false;
    const poll = () => { void invoke<PresenceStatus>('discord_presence_status').then(value => { if (!disposed) setPresence(value); }).catch(() => {}); };
    poll(); const timer = window.setInterval(poll, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [showSettings]);

  const favoriteSet = useMemo(() => new Set([...allServers, ...history, ...(detailServer ? [detailServer] : [])].filter(server => favorites.includes(server.id) || favorites.includes(addressKey(server))).map(server => server.id)), [favorites, allServers, history, detailServer]);

  useEffect(() => {
    const handleResize = () => setViewport(getViewportProfile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const appStyle = { ['--viewport-height' as string]: `${viewport.height}px` };

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [favorites]);

  useEffect(() => {
    try {
      // Discard overrides saved by older versions; discovery always uses the central API.
      window.localStorage.removeItem('skymp.launcher.endpoint');
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, []);

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
      if (!(status.has_game ?? status.has_skse)) {
        setShowSkseModal(true);
      }
    };

    void initSetup().catch((e) => setError(String(e)));
  }, [language]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchServerList();
      setServers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const loadVersion = async () => {
      setVersionError(null);
      setVersionInfo(null);
      try {
        const endpoint = new URL(DEFAULT_VERSION_JSON_URL, window.location.href);
        if (preferences.updateChannel !== 'beta') endpoint.pathname = endpoint.pathname.replace(/[^/]+$/, `channels/${preferences.updateChannel}.json`);
        const data = await fetchVersionMetadata(endpoint.href, language);
        if (!cancelled) setVersionInfo(data);
      } catch (e) {
        if (!cancelled) setVersionError(e instanceof Error ? e.message : 'Unknown error');
      }
    };

    void loadVersion();
    return () => { cancelled = true; };
  }, [language, preferences.updateChannel]);

  const availableGamemodes = useMemo(() => {
    return Array.from(new Set(allServers.map((server) => server.gamemode?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  }, [allServers]);

  const availableCountries = useMemo(() => {
    return Array.from(new Set(allServers.map((server) => server.countryCode?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  }, [allServers]);

  const filtered = useMemo(() => {
    const needle = foldSearch(search.trim());
    const tokens = needle.split(/\s+/).filter(Boolean);

    const baseEntries = activeTab === 'favorites'
      ? allServers.filter((server) => favoriteSet.has(server.id))
      : activeTab === 'history' ? history.map((entry) => allServers.find((live) => addressKey(live) === addressKey(entry)) || entry) : servers;

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
        server.description || '', ...(server.tags || []),
      ].join(' ');

      return tokens.every(token => foldSearch(searchable).includes(token));
    });

    entries.sort((left, right) => {
      if (needle) {
        const rank = (name: string) => { const value = foldSearch(name); return value === needle ? 3 : value.startsWith(needle) ? 2 : value.includes(needle) ? 1 : 0; };
        const relevance = rank(right.name) - rank(left.name);
        if (relevance) return relevance;
      }
      if (sortMode === 'players_asc') {
        return left.players - right.players;
      }

      if (sortMode === 'name_asc') {
        return left.name.localeCompare(right.name);
      }

      return right.players - left.players;
    });

    return entries;
  }, [allServers, search, hideFullServers, sortMode, favoriteSet, activeTab, gamemodeFilter, countryFilter, occupancyFilter, history]);

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

    if (!(status.has_game ?? status.has_skse)) {
      setShowSkseModal(true);
      return false;
    }

    if (status.resolved_path && status.resolved_path !== skyrimDir) {
      setSkyrimDir(status.resolved_path);
      setSetupPathDraft(status.resolved_path);
    }

    return true;
  }, [skyrimDir, i18n.setupChoosePath, language]);

  const showServerDetails = (server: ServerConnection) => {
    if (preparingServer) return;
    if (page === 'browse') browserScroll.current = window.scrollY;
    setSelectedServer(allServers.find(entry => addressKey(entry) === addressKey(server)) || browserEntry(server));
    navigate('details');
  };

  const verifyAndSavePath = useCallback(async () => {
    setCheckingPath(true);
    setSetupStatus('');
    try {
      const status = await checkSkyrimInstall(setupPathDraft, language);
      const env = await checkSkyrimEnvironment(setupPathDraft, language);
      setSkyrimCheck(status);
      setSkyrimEnv(env);
      setSetupStatus(status.message);

      if ((status.has_game ?? status.has_skse) && status.resolved_path) {
        setSkyrimDir(status.resolved_path);
        setSetupPathDraft(status.resolved_path);
        setShowSetupModal(false);
        setShowSkseModal(false);
        try {
          window.localStorage.setItem(STORAGE_SETUP_DONE_KEY, '1');
        } catch {
          // Ignore storage errors in restricted environments.
        }
        return;
      }

      setShowSkseModal(true);
    } catch (error) {
      setSetupStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setCheckingPath(false);
    }
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
      if (imported.server_ip && imported.server_port) { setSelectedServer(browserEntry({
        name: 'Imported SkyMP', ip: imported.server_ip, port: imported.server_port,
        masterUrl: imported.master ?? '', serverMasterKey: imported.server_master_key ?? '',
        offline: imported.offline, profileId: imported.profile_id ?? 1,
      })); setPage('advanced'); }
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
        ok: !!(skyrimEnv?.has_game ?? skyrimEnv?.has_skse),
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

  const toggleFavorite = (serverId: string) => {
    const server = [...allServers, ...history, ...(detailServer ? [detailServer] : [])].find(entry => entry.id === serverId);
    const key = server ? addressKey(server) : serverId;
    setFavorites((prev) => {
      if (prev.includes(serverId) || prev.includes(key)) {
        return prev.filter((entry) => entry !== serverId && entry !== key);
      }

      return [...prev, key];
    });
  };

  return (
    <PrivacyContext.Provider value={preferences.streamerMode}>
    <div className="app" data-layout={viewport.layout} style={appStyle}>
      <header className="app-header">
        <a className="launcher-brand" href="#" aria-label={`SkyMP Worlds · ${browser.home}`} onClick={event => { event.preventDefault(); navigate('home'); }}><span className="brand-mark" aria-hidden="true">S</span><span>SkyMP <b>Worlds</b></span></a>
        <nav className="main-nav" aria-label="Navigation">
          <button className={page === 'browse' || page === 'details' ? 'is-current' : ''} onClick={() => browse('servers')} disabled={preparingServer}>{browser.title}</button>
          <button onClick={() => openExternal('https://skymp-worlds.net/')}>SkyMP.net <span aria-hidden="true">↗</span></button>
          <button onClick={() => openExternal('https://api.skymp-worlds.net/account')}>{home.account} <span aria-hidden="true">↗</span></button>
          <button onClick={() => openExternal(platform.communityUrl)}>{home.community} <span aria-hidden="true">↗</span></button>
        </nav>
        <div className="header-population"><strong>{totalPlayers.toLocaleString(language)}</strong><span>{i18n.metricPlayers} · {servers.length} {i18n.metricServers}</span></div>
        <div className="lang-row" aria-label={i18n.languageLabel}>
          {(['de', 'en', 'ru'] as const).map((lang) => <button key={lang} className={`lang-btn ${language === lang ? 'lang-btn-active' : ''}`} aria-pressed={language === lang} onClick={() => setLanguage(lang)} disabled={preparingServer}>{lang.toUpperCase()}</button>)}
        </div>
        <button className="btn-refresh settings-toggle" aria-expanded={showSettings} aria-controls="launcher-settings" onClick={() => setShowSettings(!showSettings)} disabled={preparingServer}>{home.settings}</button>
      </header>
      {showSettings && <LauncherSettings language={language} onLanguage={setLanguage} preferences={preferences} onPreferences={updatePreferences} storageError={preferencesStorageError}
        path={setupPathDraft} onPath={setSetupPathDraft} onVerify={() => void verifyAndSavePath()} checkingPath={checkingPath} pathStatus={setupStatus || skyrimCheck?.message || ''}
        savedPath={skyrimDir} onClearHistory={clearHistory} presence={presence} steamSnapshot={steamSnapshot} onSteamSnapshot={setSteamSnapshot} updates={updates} onCheckUpdates={()=>void checkUpdates()} openExternal={openExternal} onClose={() => setShowSettings(false)} />}
      <LauncherUpdateNotice updates={updates} language={language} onCheck={()=>void checkUpdates()} openExternal={openExternal} />
      <div className={`dashboard-layout ${page === 'home' ? '' : 'browser-layout'}`}>
        <main className="dashboard-main">
          {page === 'home' && <>
            <HomeCards language={language} last={history[0]} favorites={favorites.length} disabled={preparingServer}
              onBrowse={() => browse('servers')} onFavorites={() => browse('favorites')} onHistory={() => browse('history')}
              onSelect={showServerDetails} />
            <section className="world-banner"><div><p className="eyebrow">{home.featured}</p><h1>{home.featuredBody}</h1><p>{home.featuredHint}</p>
              <button className="btn-join" onClick={() => browse('servers')}>{home.browse} <span aria-hidden="true">→</span></button>
            </div></section>
          </>}
          {page === 'browse' && <ServerBrowser language={language} entries={filtered} tab={activeTab} onTab={setActiveTab}
            query={search} onQuery={setSearch} loading={loading} error={error ? privateText(error, preferences.streamerMode, language) : null} onRefresh={refresh} onSelect={showServerDetails}
            favorites={favoriteSet} onFavorite={toggleFavorite} disabled={preparingServer} sort={sortMode} onSort={value => setSortMode(value as SortMode)}
            mode={gamemodeFilter} onMode={setGamemodeFilter} country={countryFilter} onCountry={setCountryFilter}
            occupancy={occupancyFilter} onOccupancy={value => setOccupancyFilter(value as OccupancyFilter)} hideFull={hideFullServers} onHideFull={setHideFullServers}
            modes={availableGamemodes} countries={availableCountries} onReset={() => { setGamemodeFilter('all'); setCountryFilter('all'); setOccupancyFilter('all'); setHideFullServers(false); }}
            onDirect={() => navigate('advanced')} />}
          {page === 'details' && detailServer && <ServerDetails server={detailServer} language={language} favorite={favoriteSet.has(detailServer.id)}
            listed={servers.some(server => addressKey(server) === addressKey(detailServer))} onBack={() => navigate('browse')}
            onFavorite={() => toggleFavorite(detailServer.id)} disabled={preparingServer} />}
          {page === 'advanced' && <div className="browser-heading direct-connection-heading"><div><p className="eyebrow">SKYMP WORLDS</p><h1>{browser.direct}</h1></div>
            <div className="controls"><button className="text-button" onClick={() => void handleImportExistingSettings()} disabled={preparingServer}>{i18n.importSettings}</button>
              <button className="text-button" onClick={() => navigate(detailServer ? 'details' : 'browse')} disabled={preparingServer}>← {detailServer ? browser.backToServer : browser.back}</button></div>
          </div>}
          <ConnectionPanel selected={detailServer} skyrimDir={skyrimDir} language={language} playerName={preferences.playerName} mode={page === 'details' && detailServer ? 'player' : page === 'advanced' ? 'advanced' : 'hidden'}
            ensureReady={ensureSkyrimReady} onBusyChange={setPreparingServer} onConnected={rememberConnection} onOptions={() => navigate('advanced')} onProfilesChange={setSavedProfiles} />
          {page === 'details' && detailServer && <ServerInformation server={detailServer} language={language} openExternal={openExternal} />}
        </main>
        {page === 'home' && <aside className="dashboard-sidebar">
          <section className={`panel readiness-panel ${(skyrimCheck?.has_game ?? skyrimCheck?.has_skse) ? 'is-ready' : ''}`}>
            <p className="eyebrow">SKYRIM SPECIAL EDITION</p><h2>{(skyrimCheck?.has_game ?? skyrimCheck?.has_skse) ? home.ready : home.missing}</h2>
            <p>{home.statusHint}</p><button className="text-button" onClick={() => { setShowSetupModal(true); setSetupPathDraft(skyrimDir); }}>{home.settings} <span aria-hidden="true">→</span></button>
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
                <button className="btn-refresh" onClick={() => openExternal(versionInfo.changelogUrl)}>{i18n.releaseOpenChangelog}</button>
              ) : null}
              {trustedReleaseUrl(versionInfo.downloadUrl) && compareVersions(versionInfo.version,launcherVersion) === 1 ? (
                <button className="btn-join" onClick={() => openExternal(versionInfo.downloadUrl)}>{i18n.releaseDownload}</button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="empty">{versionError ? `${i18n.errorPrefix}: ${versionError}` : i18n.releaseUnavailable}</p>
        )}
      </section>
          <section className="panel guide-panel"><p className="eyebrow">{home.notices}</p><h2>{home.account}</h2><p>{home.authHint}</p><button className="text-button" onClick={() => openExternal('https://api.skymp-worlds.net/account')}>{home.account} <span aria-hidden="true">↗</span></button></section>
          <button className="panel host-panel" onClick={() => openExternal('https://manage.skymp-worlds.net/index.php')}><span className="eyebrow">SKYMP CREATORS</span><strong>{home.host}</strong><span>{home.hostHint}</span><span className="text-button" aria-hidden="true">↗</span></button>
        </aside>}
      </div>

      <footer className="launcher-footer">
        <span>SkyMP Worlds · v{launcherVersion} · Skyrim Multiplayer</span>
        <CrashReports language={language} />
        <button className="text-button launcher-docs" onClick={() => openExternal(`${platform.docsUrl}?lang=${language}`)}>
          {{ de: 'Dokumentation für Serverbetreiber', en: 'Server operator documentation', ru: 'Документация для владельцев серверов' }[language]} <span aria-hidden="true">↗</span>
        </button>
        <span>Independent worlds. Shared adventures.</span>
      </footer>

      {showSetupModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2>{i18n.setupTitle}</h2>
            <p>{i18n.setupBody}</p>
            <input
              type={preferences.streamerMode ? 'password' : 'text'}
              className="search-input"
              aria-label={i18n.gamePath}
              value={setupPathDraft}
              onChange={(event) => setSetupPathDraft(event.target.value)}
              placeholder={i18n.setupPathPlaceholder}
              disabled={checkingPath}
            />
            <p className="modal-hint">{privateText(setupStatus || i18n.setupHint, preferences.streamerMode, language)}</p>
            <div className="controls">
              <button className="btn-refresh" onClick={() => void autoDetectPath()} disabled={checkingPath}>{i18n.autoDetect}</button>
              <button className="btn-join" onClick={() => void verifyAndSavePath()} disabled={checkingPath}>{checkingPath ? i18n.checkingPath : i18n.savePath}</button>
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
              <button className="btn-join" onClick={() => { setShowSkseModal(false); setShowSetupModal(true); }}>{i18n.choosePathAgain}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PrivacyContext.Provider>
  );
}
