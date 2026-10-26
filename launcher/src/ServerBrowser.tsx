import { useState } from 'react';
import type { ServerConnection } from './ConnectionPanel';
import platform from '../../web/shared/platform.json';
import CountryFlag, { countryName } from './CountryFlag';
import { Sensitive } from './Privacy';

export type BrowserLanguage = 'de' | 'en' | 'ru';
export type BrowserTab = 'servers' | 'favorites' | 'history';
export interface ServerEntry extends ServerConnection {
  id: string;
  players: number;
  maxPlayers: number;
  gamemode?: string;
  countryCode?: string;
  description?: string;
  tags?: string[];
  website?: string;
  discordUrl?: string;
  bannerUrl?: string;
  iconUrl?: string;
}

export const browserText = {
  de: {
    title: 'Server entdecken', intro: 'Deine Community wartet in Himmelsrand.', search: 'Servernamen suchen …', clear: 'Suche leeren',
    all: 'Alle Server', favorites: 'Favoriten', history: 'Verlauf', filters: 'Filter', reset: 'Filter zurücksetzen', refresh: 'Aktualisieren',
    direct: 'Direktverbindung', home: 'Startseite', sort: 'Sortieren', playersDown: 'Meiste Spieler', playersUp: 'Wenigste Spieler', name: 'Name A–Z',
    mode: 'Spielmodus', allModes: 'Alle Spielmodi', country: 'Land', allCountries: 'Alle Länder', occupancy: 'Auslastung',
    allOccupancies: 'Alle Server', emptyOnly: 'Leere Server', activeOnly: 'Mit Spielern', busyOnly: 'Gut besucht', hideFull: 'Volle Server ausblenden',
    loading: 'Server werden geladen …', results: 'Server gefunden', noResults: 'Kein passender Server gefunden.',
    noResultsHint: 'Versuche einen anderen Namen oder passe deine Filter an.', noFavorites: 'Deine Lieblingswelten sind noch leer.',
    favoritesHint: 'Markiere einen Server als Favoriten, um ihn hier wiederzufinden.', noHistory: 'Hier beginnt dein nächstes Abenteuer.',
    historyHint: 'Server erscheinen im Verlauf, nachdem du dich verbunden hast.', retry: 'Erneut laden', listError: 'Die Serverliste ist gerade nicht erreichbar.',
    details: 'Serverdetails anzeigen', back: 'Zurück zur Liste', backToServer: 'Zurück zum Server', players: 'Spieler', unknown: 'Nicht angegeben', description: 'Über diesen Server',
    noDescription: 'Der Betreiber hat noch keine Beschreibung veröffentlicht.', community: 'Community', website: 'Webseite', discord: 'Discord',
    access: 'Serverzugang', online: 'Anmeldung mit deinem Konto', offline: 'Offline-Profil', files: 'Benötigte Dateien werden beim Verbinden automatisch geprüft und heruntergeladen.',
    serverInfo: 'Serverinformationen', address: 'Serveradresse', tags: 'Tags', addFavorite: 'Als Favoriten speichern', removeFavorite: 'Favorit entfernen',
    notListed: 'Dieser Server ist gerade nicht in der aktuellen Liste.', options: 'Verbindungsoptionen', noCommunity: 'Keine Community-Links veröffentlicht.',
    serverOffline: 'Offline', serverOnline: 'Online',
  },
  en: {
    title: 'Discover servers', intro: 'Your community is waiting in Skyrim.', search: 'Search server names …', clear: 'Clear search',
    all: 'All servers', favorites: 'Favorites', history: 'History', filters: 'Filters', reset: 'Reset filters', refresh: 'Refresh',
    direct: 'Direct connection', home: 'Home', sort: 'Sort', playersDown: 'Most players', playersUp: 'Fewest players', name: 'Name A–Z',
    mode: 'Game mode', allModes: 'All game modes', country: 'Country', allCountries: 'All countries', occupancy: 'Population',
    allOccupancies: 'All servers', emptyOnly: 'Empty servers', activeOnly: 'With players', busyOnly: 'Busy servers', hideFull: 'Hide full servers',
    loading: 'Loading servers …', results: 'servers found', noResults: 'No matching servers found.',
    noResultsHint: 'Try another name or adjust your filters.', noFavorites: 'Your favorite worlds are still empty.',
    favoritesHint: 'Save a server as a favorite to find it here.', noHistory: 'Your next adventure starts here.',
    historyHint: 'Servers appear in your history after you connect.', retry: 'Try again', listError: 'The server list is currently unavailable.',
    details: 'View server details', back: 'Back to list', backToServer: 'Back to server', players: 'Players', unknown: 'Not specified', description: 'About this server',
    noDescription: 'The operator has not published a description yet.', community: 'Community', website: 'Website', discord: 'Discord',
    access: 'Server access', online: 'Sign in with your account', offline: 'Offline profile', files: 'Required files are verified and downloaded automatically when you connect.',
    serverInfo: 'Server information', address: 'Server address', tags: 'Tags', addFavorite: 'Save as favorite', removeFavorite: 'Remove favorite',
    notListed: 'This server is not in the current list.', options: 'Connection options', noCommunity: 'No community links published.',
    serverOffline: 'Offline', serverOnline: 'Online',
  },
  ru: {
    title: 'Найти сервер', intro: 'Твоё сообщество ждёт в Скайриме.', search: 'Поиск по названию сервера …', clear: 'Очистить поиск',
    all: 'Все серверы', favorites: 'Избранное', history: 'История', filters: 'Фильтры', reset: 'Сбросить фильтры', refresh: 'Обновить',
    direct: 'Прямое подключение', home: 'Главная', sort: 'Сортировка', playersDown: 'Больше игроков', playersUp: 'Меньше игроков', name: 'Название А–Я',
    mode: 'Режим игры', allModes: 'Все режимы', country: 'Страна', allCountries: 'Все страны', occupancy: 'Заполненность',
    allOccupancies: 'Все серверы', emptyOnly: 'Пустые серверы', activeOnly: 'С игроками', busyOnly: 'Много игроков', hideFull: 'Скрыть полные серверы',
    loading: 'Загрузка серверов …', results: 'серверов найдено', noResults: 'Подходящие серверы не найдены.',
    noResultsHint: 'Попробуй другое название или измени фильтры.', noFavorites: 'В избранном пока нет миров.',
    favoritesHint: 'Добавь сервер в избранное, чтобы найти его здесь.', noHistory: 'Здесь начинается новое приключение.',
    historyHint: 'Серверы появятся в истории после подключения.', retry: 'Попробовать снова', listError: 'Список серверов сейчас недоступен.',
    details: 'Подробнее о сервере', back: 'Назад к списку', backToServer: 'Назад к серверу', players: 'Игроки', unknown: 'Не указано', description: 'Об этом сервере',
    noDescription: 'Владелец ещё не опубликовал описание.', community: 'Сообщество', website: 'Веб-сайт', discord: 'Discord',
    access: 'Доступ к серверу', online: 'Вход через аккаунт', offline: 'Офлайн-профиль', files: 'При подключении нужные файлы проверяются и загружаются автоматически.',
    serverInfo: 'Информация о сервере', address: 'Адрес сервера', tags: 'Теги', addFavorite: 'В избранное', removeFavorite: 'Убрать из избранного',
    notListed: 'Этого сервера нет в текущем списке.', options: 'Параметры подключения', noCommunity: 'Ссылки сообщества не опубликованы.',
    serverOffline: 'Не в сети', serverOnline: 'В сети',
  },
};

export function webUrl(value?: string, image = false): string | undefined {
  try {
    if (!value || value.length > 2048) return undefined;
    const url = new URL(value);
    return (image ? url.protocol === 'https:' : ['https:', 'http:'].includes(url.protocol)) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function ServerEmblem({ server, large = false }: { server: ServerEntry; large?: boolean }) {
  const source = webUrl(server.iconUrl, true);
  const [failedSource, setFailedSource] = useState('');
  return <span className={`server-emblem ${large ? 'server-emblem-large' : ''}`} aria-hidden="true">
    {source && source !== failedSource ? <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} />
      : <span>{server.name.trim().slice(0, 2).toLocaleUpperCase()}</span>}
  </span>;
}

export default function ServerBrowser({ language, entries, tab, onTab, query, onQuery, loading, error, onRefresh, onSelect, favorites, onFavorite, disabled,
  sort, onSort, mode, onMode, country, onCountry, occupancy, onOccupancy, hideFull, onHideFull, modes, countries, onReset, onDirect }: {
  language: BrowserLanguage; entries: ServerEntry[]; tab: BrowserTab; onTab: (tab: BrowserTab) => void;
  query: string; onQuery: (query: string) => void; loading: boolean; error: string | null; onRefresh: () => void;
  onSelect: (server: ServerEntry) => void; favorites: Set<string>; onFavorite: (id: string) => void; disabled: boolean;
  sort: string; onSort: (sort: string) => void; mode: string; onMode: (mode: string) => void; country: string; onCountry: (country: string) => void;
  occupancy: string; onOccupancy: (occupancy: string) => void; hideFull: boolean; onHideFull: (hide: boolean) => void;
  modes: string[]; countries: string[]; onReset: () => void; onDirect: () => void;
}) {
  const t = browserText[language];
  const [showFilters, setShowFilters] = useState(false);
  const filterCount = Number(mode !== 'all') + Number(country !== 'all') + Number(occupancy !== 'all') + Number(hideFull);
  const emptyTitle = query || filterCount ? t.noResults : tab === 'favorites' ? t.noFavorites : tab === 'history' ? t.noHistory : t.noResults;
  const emptyHint = query || filterCount ? t.noResultsHint : tab === 'favorites' ? t.favoritesHint : tab === 'history' ? t.historyHint : t.noResultsHint;
  return <section className="servers-browser" id="server-browser" aria-label={t.title}>
    <div className="browser-heading"><div><p className="eyebrow">SKYMP WORLDS</p><h1>{t.title}</h1><p>{t.intro}</p></div><button className="text-button" onClick={onDirect} disabled={disabled}>{t.direct} <span aria-hidden="true">↗</span></button></div>
    <div className="browser-toolbar">
      <div className="browser-tabs" aria-label={t.title}>
        {(['servers', 'favorites', 'history'] as const).map(item => <button key={item} className={tab === item ? 'is-active' : ''} aria-pressed={tab === item} onClick={() => onTab(item)} disabled={disabled}>{item === 'servers' ? t.all : item === 'favorites' ? t.favorites : t.history}</button>)}
      </div>
      <div className="browser-searchbar">
        <div className="browser-search-field"><input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={event => onQuery(event.target.value)} autoComplete="off" spellCheck={false} />
          {query && <button className="search-clear" onClick={() => onQuery('')} aria-label={t.clear}>×</button>}</div>
        <button className={`btn-refresh browser-filter-toggle ${filterCount ? 'has-filters' : ''}`} aria-expanded={showFilters} aria-controls="browser-filters" onClick={() => setShowFilters(!showFilters)}>{t.filters}{filterCount > 0 && <span className="filter-count">{filterCount}</span>}</button>
        <select className="search-input browser-sort" aria-label={t.sort} value={sort} onChange={event => onSort(event.target.value)}><option value="players_desc">{t.playersDown}</option><option value="players_asc">{t.playersUp}</option><option value="name_asc">{t.name}</option></select>
      </div>
      {showFilters && <div className="browser-filters" id="browser-filters">
        <label>{t.mode}<select className="search-input" aria-label={t.mode} value={mode} onChange={event => onMode(event.target.value)}><option value="all">{t.allModes}</option>{modes.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t.country}<select className="search-input" aria-label={t.country} value={country} onChange={event => onCountry(event.target.value)}><option value="all">{t.allCountries}</option>{countries.map(value => <option value={value} key={value}>{countryName(value, language) || t.unknown}</option>)}</select></label>
        <label>{t.occupancy}<select className="search-input" aria-label={t.occupancy} value={occupancy} onChange={event => onOccupancy(event.target.value)}><option value="all">{t.allOccupancies}</option><option value="empty">{t.emptyOnly}</option><option value="active">{t.activeOnly}</option><option value="busy">{t.busyOnly}</option></select></label>
        <label className="toggle-pill"><input type="checkbox" checked={hideFull} onChange={event => onHideFull(event.target.checked)} />{t.hideFull}</label>
        <button className="text-button" onClick={onReset}>{t.reset}</button>
      </div>}
    </div>
    <div className="browser-results-meta" role="status" aria-live="polite"><span>{loading ? t.loading : `${entries.length} ${t.results}`}</span><button className="text-button" onClick={onRefresh} disabled={loading}>{t.refresh}</button></div>
    {error && <div className="browser-empty" role="alert"><h2>{t.listError}</h2><p>{error}</p><button className="btn-refresh" onClick={onRefresh} disabled={loading}>{t.retry}</button></div>}
    {(!error || entries.length > 0) && <div className="server-results" role="list" aria-label={t.all} aria-busy={loading}>
        {entries.map(server => <div key={server.id} className={`server-result${server.serverStatus === 'offline' ? ' is-offline' : ''}`} role="listitem">
          <button className="server-result-open" onClick={() => onSelect(server)} disabled={disabled} aria-label={`${server.name}: ${t.details}`}>
            <ServerEmblem server={server} />
            <span className="server-result-copy"><strong>{server.name}</strong><span>{server.description || server.gamemode || t.details}</span>{server.serverStatus && <span className={`server-availability ${server.serverStatus === 'offline' ? 'is-offline' : 'is-online'}`}>{server.serverStatus === 'offline' ? t.serverOffline : t.serverOnline}</span>}</span>
            <span className="server-result-tags">{(server.tags?.length ? server.tags : [server.gamemode].filter((value): value is string => !!value)).slice(0, 3).map(tag => <span className="server-tag" key={tag}>{tag}</span>)}</span>
            <span className="server-country"><CountryFlag code={server.countryCode} language={language} /></span>
            <span className="server-population"><strong>{server.maxPlayers > 0 ? `${server.players} / ${server.maxPlayers}` : '—'}</strong><span>{t.players}</span></span>
            <span className="server-row-arrow" aria-hidden="true">→</span>
          </button>
          <button className={`favorite-btn ${favorites.has(server.id) ? 'favorite-active' : ''}`} aria-label={`${favorites.has(server.id) ? t.removeFavorite : t.addFavorite}: ${server.name}`} aria-pressed={favorites.has(server.id)} onClick={() => onFavorite(server.id)}>{favorites.has(server.id) ? '♥' : '♡'}</button>
        </div>)}
        {!loading && entries.length === 0 && <div className="browser-empty"><h2>{emptyTitle}</h2><p>{emptyHint}</p>{(query || filterCount > 0) && <button className="btn-refresh" onClick={() => { onQuery(''); onReset(); }}>{t.reset}</button>}</div>}
      </div>}
  </section>;
}

export function ServerDetails({ server, language, favorite, listed, onBack, onFavorite, disabled }: {
  server: ServerEntry; language: BrowserLanguage; favorite: boolean; listed: boolean; onBack: () => void; onFavorite: () => void;
  disabled: boolean;
}) {
  const t = browserText[language];
  const banner = webUrl(server.bannerUrl, true);
  const [failedBanner, setFailedBanner] = useState('');
  return <section className="server-details" aria-label={server.name}>
    <div className="server-detail-navigation"><button className="text-button" onClick={onBack} disabled={disabled}>← {t.back}</button><span>{server.name}</span></div>
    <div className="server-detail-cover">{banner && banner !== failedBanner && <img src={banner} alt="" referrerPolicy="no-referrer" onError={() => setFailedBanner(banner)} />}</div>
    <div className="server-detail-heading"><ServerEmblem server={server} large /><div><p className="eyebrow">SKYMP COMMUNITY</p><h1>{server.name}</h1>
      <div className="server-detail-stats"><span>{server.maxPlayers > 0 ? `${server.players} / ${server.maxPlayers}` : '—'} {t.players}</span>{server.serverStatus && <span className={`server-availability ${server.serverStatus === 'offline' ? 'is-offline' : 'is-online'}`}>{server.serverStatus === 'offline' ? t.serverOffline : t.serverOnline}</span>}{server.countryCode && <CountryFlag code={server.countryCode} language={language} />}{server.gamemode && <span>{server.gamemode}</span>}</div>
      <div className="server-detail-tags">{server.tags?.map(tag => <span className="server-tag" key={tag}>{tag}</span>)}</div>
    </div><button className={`btn-refresh detail-favorite ${favorite ? 'favorite-active' : ''}`} aria-pressed={favorite} onClick={onFavorite}>{favorite ? '♥' : '♡'} {favorite ? t.removeFavorite : t.addFavorite}</button></div>
    {!listed && <p className="server-listing-note">{t.notListed}</p>}
  </section>;
}

export function ServerInformation({ server, language, openExternal }: { server: ServerEntry; language: BrowserLanguage; openExternal: (url: string) => void }) {
  const t = browserText[language];
  const website = webUrl(server.website), discord = webUrl(server.discordUrl);
  return <div className="server-detail-columns"><div className="panel server-about"><h2>{t.description}</h2><p>{server.description || t.noDescription}</p>
      <dl><div><dt>{t.mode}</dt><dd>{server.gamemode || t.unknown}</dd></div><div><dt>{t.country}</dt><dd><CountryFlag code={server.countryCode} language={language} showName /></dd></div><div><dt>{t.address}</dt><dd><Sensitive value={`${server.ip.includes(':') ? `[${server.ip.replace(/^\[|\]$/g, '')}]` : server.ip}:${server.port}`} language={language} /></dd></div></dl>
    </div><aside className="panel server-access"><h2>{t.access}</h2><p>{server.offline ? t.offline : t.online}</p><p>{t.files}</p><h2>{t.community}</h2>
      {website || discord ? <div className="server-community-links">{website && <button className="text-button" onClick={() => openExternal(website)}>{t.website} ↗</button>}{discord && <button className="text-button" onClick={() => openExternal(discord)}>{t.discord} ↗</button>}</div> : <p>{t.noCommunity}</p>}
      <div className="platform-community-link"><button className="text-button" onClick={() => openExternal(platform.communityUrl)}>SkyMP Discord ↗</button></div>
    </aside></div>;
}
