export type Language = 'de' | 'en' | 'ru';
export type UpdateChannel = 'release' | 'beta' | 'latest';
export interface LauncherPreferences {
  playerName: string;
  streamerMode: boolean;
  menuAudio: boolean;
  audioVolume: number;
  muteOnFocusLoss: boolean;
  updateChannel: UpdateChannel;
  discordActivity: 'enabled' | 'hidden' | 'disabled';
}
export const PREFERENCES_KEY = 'skymp.launcher.preferences.v1';
export const defaultPreferences: LauncherPreferences = {
  playerName: '', streamerMode: false, menuAudio: false, audioVolume: 15,
  muteOnFocusLoss: true, updateChannel: 'beta', discordActivity: 'disabled',
};
export function validPlayerName(value: string): boolean {
  const clean = value.trim();
  return Array.from(clean).length <= 32 && !/[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(clean);
}
export function loadPreferences(): LauncherPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaultPreferences };
    return {
      playerName: typeof value.playerName === 'string' && validPlayerName(value.playerName) ? value.playerName.trim() : '',
      streamerMode: value.streamerMode === true, menuAudio: value.menuAudio === true,
      audioVolume: Number.isFinite(value.audioVolume) ? Math.round(Math.min(100, Math.max(0, value.audioVolume))) : 15,
      muteOnFocusLoss: value.muteOnFocusLoss !== false,
      updateChannel: ['release', 'beta', 'latest'].includes(value.updateChannel) ? value.updateChannel : 'beta',
      discordActivity: ['enabled', 'hidden', 'disabled'].includes(value.discordActivity) ? value.discordActivity : 'disabled',
    };
  } catch { return { ...defaultPreferences }; }
}
export function savePreferences(preferences: LauncherPreferences): boolean {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); return true; } catch { return false; }
}

/** Privacy is a rendering choice. Never modify connection addresses or exported diagnostics. */
export function privateText(value: string, enabled: boolean, language: Language): string {
  if (!enabled) return value;
  const hidden = { de: '[ausgeblendet]', en: '[hidden]', ru: '[скрыто]' }[language];
  return value.replace(/https?:\/\/[^\s)]+/gi, hidden)
    .replace(/\[[0-9a-f:]*:[0-9a-f:.]+\](?::\d+)?/gi, hidden)
    .replace(/\b[A-Z]:[\\/][^\r\n]+/gi, hidden)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, hidden)
    .replace(/\b(?:steam:)?7656\d{13}\b/g, hidden);
}
