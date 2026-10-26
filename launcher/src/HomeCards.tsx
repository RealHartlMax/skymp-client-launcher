import type { ServerConnection } from './ConnectionPanel';
import { Sensitive, useStreamerMode } from './Privacy';
import { useEffect, useState } from 'react';

export const homeText = {
  de: { browse: 'Welten entdecken', browseHint: 'Finde deinen nächsten Ort in Himmelsrand.', last: 'Zuletzt gespielt', noLast: 'Dein nächstes Abenteuer beginnt hier.', resume: 'Erneut verbinden', favorites: 'Favoriten', history: 'Verlauf', settings: 'Einstellungen', account: 'Mein Konto', community: 'Community', featured: 'Entdecke Himmelsrand', featuredBody: 'Eine Welt. Deine Geschichte.', featuredHint: 'Wähle einen Server und erlebe Skyrim gemeinsam.', live: 'Aktive Server', connection: 'Direkt verbinden', ready: 'Bereit für Himmelsrand', missing: 'Spiel einrichten', statusHint: 'Wähle deinen Spielordner. Benötigte Dateien werden vor dem Verbinden geprüft.', host: 'Eine eigene Welt erschaffen', hostHint: 'Registriere deinen Server und lade deine Community ein.', emptyHistory: 'Noch keine Verbindung im Verlauf.', notices: 'Wegweiser', authHint: 'Online-Server fragen beim Spielstart nach deinem Konto. Deine Identität bleibt beim Serverwechsel erhalten.', publicId: 'Öffentliche Server-ID' },
  en: { browse: 'Discover worlds', browseHint: 'Find your next place in Skyrim.', last: 'Last played', noLast: 'Your next adventure starts here.', resume: 'Connect again', favorites: 'Favorites', history: 'History', settings: 'Settings', account: 'My account', community: 'Community', featured: 'Discover Skyrim', featuredBody: 'One world. Your story.', featuredHint: 'Choose a server and experience Skyrim together.', live: 'Active servers', connection: 'Direct connect', ready: 'Ready for Skyrim', missing: 'Set up your game', statusHint: 'Choose your game folder. Required files are checked before connecting.', host: 'Create your own world', hostHint: 'Register your server and invite your community.', emptyHistory: 'No connections in your history yet.', notices: 'Your guide', authHint: 'Online servers ask you to sign in when the game starts. Your identity follows you between servers.', publicId: 'Public server ID' },
  ru: { browse: 'Открыть миры', browseHint: 'Найди своё место в Скайриме.', last: 'Последняя игра', noLast: 'Здесь начинается новое приключение.', resume: 'Подключиться снова', favorites: 'Избранное', history: 'История', settings: 'Настройки', account: 'Мой аккаунт', community: 'Сообщество', featured: 'Открой Скайрим', featuredBody: 'Один мир. Твоя история.', featuredHint: 'Выбери сервер и открой Скайрим вместе с друзьями.', live: 'Активные серверы', connection: 'Прямое подключение', ready: 'Готово к Скайриму', missing: 'Настроить игру', statusHint: 'Выбери папку игры. Нужные файлы будут проверены перед подключением.', host: 'Создай свой мир', hostHint: 'Зарегистрируй сервер и пригласи друзей.', emptyHistory: 'В истории пока нет подключений.', notices: 'Путеводитель', authHint: 'Онлайн-серверы попросят войти при запуске игры. Аккаунт сохраняется при смене сервера.', publicId: 'Публичный ID сервера' },
};

export default function HomeCards({ language, last, favorites, disabled, onBrowse, onFavorites, onHistory, onSelect }: {
  language: 'de' | 'en' | 'ru'; last?: ServerConnection; favorites: number; disabled: boolean;
  onBrowse: () => void; onFavorites: () => void; onHistory: () => void; onSelect: (server: ServerConnection) => void;
}) {
  const t = homeText[language];
  const streamer = useStreamerMode();
  const [revealed, setRevealed] = useState(false);
  const hideLast = streamer && !revealed;
  useEffect(() => { setRevealed(false); }, [streamer, last?.ip, last?.port]);
  return <section className="home-shortcuts" aria-label={t.browse}>
    <button className="shortcut browse-shortcut" onClick={onBrowse}>
      <span className="eyebrow">SKYMP WORLDS</span><strong>{t.browse}</strong><span>{t.browseHint}</span><span className="shortcut-action">{t.live} <span aria-hidden="true">→</span></span>
    </button>
    <div className="shortcut last-shortcut" data-testid="last-played">
      <span className="eyebrow">{t.last}</span><strong>{hideLast && last ? { de: 'Letzter Server ausgeblendet', en: 'Last server hidden', ru: 'Последний сервер скрыт' }[language] : last?.name || t.noLast}</strong>
      {last ? hideLast ? <button className="text-button" onClick={() => setRevealed(true)}>{{ de: 'Anzeigen', en: 'Show', ru: 'Показать' }[language]}</button> : <><span><Sensitive value={`${last.ip}:${last.port}`} language={language} /></span><button className="text-button" disabled={disabled} onClick={() => onSelect(last)}>{t.resume} <span aria-hidden="true">→</span></button></> : <span>{t.featuredHint}</span>}
    </div>
    <div className="shortcut-stack">
      <button className="shortcut compact-shortcut" onClick={onFavorites}><strong>{t.favorites}</strong><span>{favorites.toString().padStart(2, '0')}</span></button>
      <button className="shortcut compact-shortcut" onClick={onHistory}><strong>{t.history}</strong><span aria-hidden="true">→</span></button>
    </div>
  </section>;
}
