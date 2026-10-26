import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { privateText, validPlayerName, type Language, type LauncherPreferences } from './launcherPreferences';
import './LauncherSettings.css';

export interface PresenceStatus { state: string; discordUser?: string | null }
interface SteamAccount { steamId: string; personaName?: string | null }
const copy = {
  de: {
    title: 'Einstellungen', close: 'Schließen', account: 'Konto', interface: 'Interface', game: 'Spiel',
    steam: 'Steam-Konto', refresh: 'Konto prüfen', steamHint: 'Steam muss laufen. Das Konto wird aus deiner Skyrim-Installation gelesen.',
    name: 'Spielername', nameHint: 'Leer = Steam-Anzeigename. Bis zu 32 Zeichen; wird beim nächsten Verbinden an den Server übertragen.',
    save: 'Spielernamen speichern', saved: 'Gespeichert', invalidName: 'Bitte höchstens 32 Zeichen ohne Steuerzeichen oder < > eingeben.',
    identity: 'Deine Identität', identityHint: 'Die Steam-ID bleibt gleich. Eine Namensänderung ändert weder Freigabe noch Charakter.',
    unknown: 'Noch nicht geprüft', private: 'Im Streamer-Modus ausgeblendet', web: 'SkyMP-Konto öffnen', discordLogin: 'Discord-Konto im Web verknüpfen',
    webHint: 'Web-Anmeldung und Kontoverknüpfung öffnen sich im Browser. Sie sind unabhängig vom Aktivitätsstatus.',
    streamer: 'Streamer-Modus', streamerHint: 'Blendet Adressen, lokale Pfade und Konto-IDs aus. Discord zeigt einen allgemeinen Status.',
    language: 'Sprache', audio: 'Hintergrundklang im Launcher', audioHint: 'Leiser Umgebungsklang nach 25 Sekunden Inaktivität. Pausiert während der Verbindung und solange Skyrim läuft.',
    volume: 'Lautstärke', mute: 'Launcher bei Fokusverlust stummschalten', history: 'Serververlauf löschen', historyHint: 'Favoriten und gespeicherte Server bleiben erhalten.', cleared: 'Verlauf gelöscht',
    channel: 'Aktualisierungskanal', release: 'Release', beta: 'Beta', latest: 'Latest (experimentell)',
    channelHint: 'Bestimmt die angebotene Launcher-Version. Das Clientpaket wählt weiterhin der Server passend zu deiner Skyrim-Version.',
    releaseMissing: 'Noch keine Release-Version veröffentlicht. Beta enthält die aktuelle Vorschau.',
    connection: 'Lokaler Verbindungsport', automatic: 'Automatisch', portHint: 'Der Netzwerkclient wählt einen freien lokalen UDP-Port. Der Spielport wird vom Server vorgegeben.',
    path: 'Skyrim-Spielordner', verify: 'Pfad prüfen und speichern', checking: 'Wird geprüft …',
    discord: 'Discord-Aktivitätsstatus', enabled: 'Anzeigen', hidden: 'Details verbergen', disabled: 'Deaktiviert',
    discordHint: 'Zeigt den Launcher bzw. Skyrim und optional den ausgewählten Server in Discord. Dafür muss die Discord-Desktop-App laufen.',
    connected: 'Discord verbunden', unavailable: 'Discord nicht verbunden', connecting: 'Discord wird verbunden …', notConfigured: 'Discord-Anwendung fehlt',
    compatibility: 'SkyMP-Kompatibilität', compatibilityHint: 'Grafik, Ingame-Audio und Sprachchat werden vom Spiel bzw. Server verwaltet. Die RAGE-/NUI-Optionen aus RedM haben hier keine Entsprechung.',
    storage: 'Einstellungen konnten nicht dauerhaft gespeichert werden. Bitte freien Speicher und WebView-Zugriff prüfen.',
  },
  en: {
    title: 'Settings', close: 'Close', account: 'Account', interface: 'Interface', game: 'Game',
    steam: 'Steam account', refresh: 'Check account', steamHint: 'Steam must be running. Your account is read using your Skyrim installation.',
    name: 'Player name', nameHint: 'Empty = Steam display name. Up to 32 characters; sent to the server on your next connection.',
    save: 'Save player name', saved: 'Saved', invalidName: 'Use up to 32 characters without control characters or < >.',
    identity: 'Your identity', identityHint: 'Your Steam ID stays the same. Renaming does not change approval or your character.',
    unknown: 'Not checked yet', private: 'Hidden by streamer mode', web: 'Open SkyMP account', discordLogin: 'Link Discord account on the web',
    webHint: 'Web sign-in and account linking open in your browser. They are separate from activity status.',
    streamer: 'Streamer mode', streamerHint: 'Hides addresses, local paths and account IDs. Discord shows a generic status.',
    language: 'Language', audio: 'Launcher background audio', audioHint: 'Quiet ambient sound after 25 seconds of inactivity. Pauses while connecting and while Skyrim is running.',
    volume: 'Volume', mute: 'Mute launcher on focus loss', history: 'Clear server history', historyHint: 'Favorites and saved servers are kept.', cleared: 'History cleared',
    channel: 'Update channel', release: 'Release', beta: 'Beta', latest: 'Latest (experimental)',
    channelHint: 'Selects the offered launcher version. The server still selects a client package matching your Skyrim version.',
    releaseMissing: 'No release version published yet. Beta contains the current preview.',
    connection: 'Local connection port', automatic: 'Automatic', portHint: 'The network client selects a free local UDP port. The game port is supplied by the server.',
    path: 'Skyrim game folder', verify: 'Check and save path', checking: 'Checking …',
    discord: 'Discord activity status', enabled: 'Show', hidden: 'Hide details', disabled: 'Disabled',
    discordHint: 'Shows the launcher or Skyrim and optionally the selected server in Discord. Requires the Discord desktop app.',
    connected: 'Discord connected', unavailable: 'Discord not connected', connecting: 'Connecting to Discord …', notConfigured: 'Discord application missing',
    compatibility: 'SkyMP compatibility', compatibilityHint: 'Graphics, in-game audio and voice chat are managed by the game or server. RedM RAGE/NUI options have no equivalent here.',
    storage: 'Settings could not be saved permanently. Check free space and WebView storage access.',
  },
  ru: {
    title: 'Настройки', close: 'Закрыть', account: 'Аккаунт', interface: 'Интерфейс', game: 'Игра',
    steam: 'Аккаунт Steam', refresh: 'Проверить аккаунт', steamHint: 'Steam должен быть запущен. Аккаунт определяется через вашу установленную Skyrim.',
    name: 'Имя игрока', nameHint: 'Пусто = имя в Steam. До 32 символов; передаётся серверу при следующем подключении.',
    save: 'Сохранить имя игрока', saved: 'Сохранено', invalidName: 'Не более 32 символов без управляющих символов и < >.',
    identity: 'Ваша личность', identityHint: 'Steam ID остаётся прежним. Новое имя не меняет допуск и персонажа.',
    unknown: 'Ещё не проверено', private: 'Скрыто режимом стримера', web: 'Открыть аккаунт SkyMP', discordLogin: 'Привязать Discord на сайте',
    webHint: 'Вход и привязка аккаунта открываются в браузере. Они не зависят от статуса активности.',
    streamer: 'Режим стримера', streamerHint: 'Скрывает адреса, локальные пути и ID аккаунтов. Discord показывает общий статус.',
    language: 'Язык', audio: 'Фоновый звук лаунчера', audioHint: 'Тихий звук окружения после 25 секунд бездействия. Пауза при подключении и во время работы Skyrim.',
    volume: 'Громкость', mute: 'Отключать звук лаунчера при потере фокуса', history: 'Очистить историю серверов', historyHint: 'Избранное и сохранённые серверы останутся.', cleared: 'История очищена',
    channel: 'Канал обновлений', release: 'Релиз', beta: 'Бета', latest: 'Latest (экспериментальный)',
    channelHint: 'Выбирает предлагаемую версию лаунчера. Пакет клиента под вашу версию Skyrim по-прежнему задаёт сервер.',
    releaseMissing: 'Релиз ещё не опубликован. Текущая предварительная версия доступна в канале Бета.',
    connection: 'Локальный порт подключения', automatic: 'Автоматически', portHint: 'Сетевой клиент выбирает свободный локальный UDP-порт. Игровой порт задаёт сервер.',
    path: 'Папка Skyrim', verify: 'Проверить и сохранить путь', checking: 'Проверка …',
    discord: 'Статус активности Discord', enabled: 'Показывать', hidden: 'Скрывать детали', disabled: 'Отключён',
    discordHint: 'Показывает лаунчер или Skyrim и, по желанию, выбранный сервер. Требуется настольное приложение Discord.',
    connected: 'Discord подключён', unavailable: 'Discord не подключён', connecting: 'Подключение к Discord …', notConfigured: 'Не задано приложение Discord',
    compatibility: 'Совместимость SkyMP', compatibilityHint: 'Графикой, игровым звуком и голосовым чатом управляет игра или сервер. Настройки RAGE/NUI из RedM здесь не применяются.',
    storage: 'Не удалось сохранить настройки. Проверьте свободное место и доступ WebView к хранилищу.',
  },
};
interface Props {
  language: Language; onLanguage: (value: Language) => void;
  preferences: LauncherPreferences; onPreferences: (value: LauncherPreferences) => void; storageError: boolean;
  path: string; onPath: (value: string) => void; onVerify: () => void; checkingPath: boolean; pathStatus: string;
  savedPath: string; onClearHistory: () => boolean; presence: PresenceStatus;
  openExternal: (url: string) => void; onClose: () => void;
}
export default function LauncherSettings(props: Props) {
  const { language, preferences, presence } = props; const t = copy[language];
  const [tab, setTab] = useState<'account' | 'interface' | 'game'>('account');
  const [name, setName] = useState(preferences.playerName); const [feedback, setFeedback] = useState('');
  const [account, setAccount] = useState<SteamAccount | null>(null); const [accountError, setAccountError] = useState(''); const [checkingAccount, setCheckingAccount] = useState(false);
  const dialog = useRef<HTMLDivElement>(null); const title = useRef<HTMLHeadingElement>(null);
  const change = (patch: Partial<LauncherPreferences>) => { setFeedback(''); props.onPreferences({ ...preferences, ...patch }); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const root = document.getElementById('root'); const wasInert = root?.inert || false;
    const overflow = document.body.style.overflow; if (root) root.inert = true; document.body.style.overflow = 'hidden'; dialog.current?.focus();
    return () => { if (root) root.inert = wasInert; document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const checkAccount = async () => {
    setCheckingAccount(true); setAccountError('');
    try { setAccount(await invoke<SteamAccount>('steam_account', { skyrimDir: props.savedPath || null })); }
    catch { setAccount(null); setAccountError(t.steamHint); } finally { setCheckingAccount(false); }
  };
  const status = presence.state === 'connected' ? t.connected : presence.state === 'connecting' ? t.connecting : presence.state === 'notConfigured' ? t.notConfigured : presence.state === 'disabled' ? t.disabled : t.unavailable;
  return createPortal(<div className="settings-layer">
    <div className="settings-backdrop" onClick={props.onClose} />
    <div className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={dialog} tabIndex={-1} id="launcher-settings" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); props.onClose(); }
      if (event.key === 'Tab') {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || [])];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="settings-heading"><div><p className="eyebrow">SKYMP WORLDS</p><h1 id="settings-title">{t.title}</h1></div><button className="settings-close" aria-label={t.close} onClick={props.onClose}>×</button></header>
      <div className="settings-layout"><nav aria-label={t.title}>{(['account', 'interface', 'game'] as const).map(value => <button key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => { setTab(value); setFeedback(''); requestAnimationFrame(() => title.current?.focus()); }}>{t[value]}</button>)}</nav>
        <section className="settings-content" aria-label={t[tab]}><h2 tabIndex={-1} ref={title}>{t[tab]}</h2>
          {props.storageError && <p className="error" role="alert">{t.storage}</p>}
          {tab === 'account' && <>
            <div className="setting-block"><h3>{t.steam}</h3><p className="settings-account-name">{preferences.streamerMode ? t.private : account?.personaName || t.unknown}</p><p>{t.steamHint}</p><button className="btn-refresh" disabled={checkingAccount || !props.savedPath} onClick={() => void checkAccount()}>{checkingAccount ? t.checking : t.refresh}</button>{accountError && <p role="status">{accountError}</p>}</div>
            <form className="setting-block" onSubmit={event => { event.preventDefault(); if (!validPlayerName(name)) { setFeedback(t.invalidName); return; } props.onPreferences({ ...preferences, playerName: name.trim() }); setFeedback(t.saved); }}>
              <label htmlFor="settings-player-name">{t.name}</label><input id="settings-player-name" type={preferences.streamerMode ? 'password' : 'text'} autoComplete="off" value={name} onChange={event => { setName(event.target.value); setFeedback(''); }} aria-describedby="settings-name-hint" /><p id="settings-name-hint">{t.nameHint}</p><button className="btn-refresh" type="submit">{t.save}</button>
            </form>
            <div className="setting-block"><h3>{t.identity}</h3><code>{preferences.streamerMode ? t.private : account ? `steam:${account.steamId}` : t.unknown}</code><p>{t.identityHint}</p></div>
            <div className="setting-block"><div className="settings-buttons"><button className="btn-refresh" onClick={() => props.openExternal('https://manage.skymp-worlds.net/dashboard.php')}>{t.web} ↗</button><button className="text-button" onClick={() => props.openExternal('https://manage.skymp-worlds.net/oauth/discord-start.php?mode=link')}>{t.discordLogin} ↗</button></div><p>{t.webHint}</p></div>
          </>}
          {tab === 'interface' && <>
            <div className="setting-block"><label className="settings-checkbox"><input type="checkbox" checked={preferences.streamerMode} onChange={event => change({ streamerMode: event.target.checked })} /><span>{t.streamer}</span></label><p>{t.streamerHint}</p></div>
            <div className="setting-block"><label htmlFor="settings-language">{t.language}</label><select id="settings-language" value={language} onChange={event => props.onLanguage(event.target.value as Language)}><option value="de">Deutsch</option><option value="en">English</option><option value="ru">Русский</option></select></div>
            <div className="setting-block"><label className="settings-checkbox"><input type="checkbox" checked={preferences.menuAudio} onChange={event => change({ menuAudio: event.target.checked })} /><span>{t.audio}</span></label><p>{t.audioHint}</p><label htmlFor="settings-audio-volume">{t.volume} · {preferences.audioVolume}%</label><input id="settings-audio-volume" type="range" min="0" max="100" value={preferences.audioVolume} disabled={!preferences.menuAudio} onChange={event => change({ audioVolume: Number(event.target.value) })} /><label className="settings-checkbox"><input type="checkbox" checked={preferences.muteOnFocusLoss} onChange={event => change({ muteOnFocusLoss: event.target.checked })} /><span>{t.mute}</span></label></div>
            <div className="setting-block"><button className="btn-refresh" onClick={() => setFeedback(props.onClearHistory() ? t.cleared : t.storage)}>{t.history}</button><p>{t.historyHint}</p></div>
          </>}
          {tab === 'game' && <>
            <div className="setting-block"><label htmlFor="settings-update-channel">{t.channel}</label><select id="settings-update-channel" value={preferences.updateChannel} onChange={event => change({ updateChannel: event.target.value as LauncherPreferences['updateChannel'] })}><option value="release">{t.release}</option><option value="beta">{t.beta}</option><option value="latest">{t.latest}</option></select><p>{t.channelHint}</p>{preferences.updateChannel === 'release' && <p className="settings-notice">{t.releaseMissing}</p>}</div>
            <div className="setting-block"><label htmlFor="skyrim-install-path">{t.path}</label><input id="skyrim-install-path" type={preferences.streamerMode ? 'password' : 'text'} value={props.path} onChange={event => props.onPath(event.target.value)} disabled={props.checkingPath} autoComplete="off" /><button className="btn-refresh" onClick={props.onVerify} disabled={props.checkingPath}>{props.checkingPath ? t.checking : t.verify}</button>{props.pathStatus && <p role="status">{privateText(props.pathStatus, preferences.streamerMode, language)}</p>}</div>
            <div className="setting-block"><label htmlFor="settings-discord-activity">{t.discord}</label><select id="settings-discord-activity" value={preferences.discordActivity} onChange={event => change({ discordActivity: event.target.value as LauncherPreferences['discordActivity'] })}><option value="enabled">{t.enabled}</option><option value="hidden">{t.hidden}</option><option value="disabled">{t.disabled}</option></select><p>{t.discordHint}</p><p role="status" className="settings-connection-status" data-connected={presence.state === 'connected'}>{status}{presence.discordUser && !preferences.streamerMode && preferences.discordActivity !== 'disabled' ? ` · ${presence.discordUser}` : ''}</p></div>
            <div className="setting-block"><h3>{t.connection}</h3><p>{t.automatic}</p><p>{t.portHint}</p></div>
            <div className="setting-block"><h3>{t.compatibility}</h3><p>{t.compatibilityHint}</p></div>
          </>}
          {feedback && <p role="status" className="settings-feedback">{feedback}</p>}
        </section>
      </div>
    </div>
  </div>, document.body);
}
