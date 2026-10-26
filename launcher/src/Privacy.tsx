import { createContext, useContext } from 'react';
import type { Language } from './launcherPreferences';
export const PrivacyContext = createContext(false);
export const useStreamerMode = () => useContext(PrivacyContext);
export function Sensitive({ value, language }: { value: string; language: Language }) {
  const hidden = useStreamerMode();
  return <>{hidden ? { de: 'Im Streamer-Modus ausgeblendet', en: 'Hidden by streamer mode', ru: 'Скрыто режимом стримера' }[language] : value}</>;
}
