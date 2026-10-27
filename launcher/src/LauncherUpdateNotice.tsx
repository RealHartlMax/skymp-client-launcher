import {version} from '../package.json';
import type {Language} from './launcherPreferences';
import {compareVersions,type UpdateState} from './launcherUpdates';
const copy={
  de:{available:'Neue offizielle Launcher-Version verfügbar',installed:'Installiert',download:'Neue Version herunterladen',check:'Nach Updates suchen',checking:'Suche nach Updates …',current:'Keine neuere offizielle Version verfügbar.',missing:'Noch kein offizielles Release verfügbar.',error:'Updates konnten nicht geprüft werden. Bitte später erneut versuchen.',hint:'Der Download öffnet sich im Browser. Zum Ersetzen der EXE den Launcher schließen.'},
  en:{available:'New official launcher version available',installed:'Installed',download:'Download new version',check:'Check for updates',checking:'Checking for updates …',current:'No newer official version is available.',missing:'No official release is available yet.',error:'Could not check for updates. Please try again later.',hint:'The download opens in your browser. Close the launcher before replacing its EXE.'},
  ru:{available:'Доступна новая официальная версия лаунчера',installed:'Установлена',download:'Скачать новую версию',check:'Проверить обновления',checking:'Проверка обновлений …',current:'Более новой официальной версии нет.',missing:'Официальный релиз пока недоступен.',error:'Не удалось проверить обновления. Повторите попытку позже.',hint:'Загрузка откроется в браузере. Перед заменой EXE закройте лаунчер.'},
};
export default function LauncherUpdateNotice({updates,language,onCheck,openExternal,settings=false}:{updates:UpdateState;language:Language;onCheck:()=>void;openExternal:(url:string)=>void;settings?:boolean}){
  const t=copy[language],newer=updates.release&&compareVersions(updates.release.version,version)===1;
  if(!settings&&!newer)return null;
  return <section className={settings?'setting-block launcher-updates':'launcher-update-banner'} aria-label={t.check}>
    <div role="status"><strong>{newer?`${t.available}: ${updates.release!.version}`:updates.checking?t.checking:updates.error?t.error:updates.release?t.current:t.missing}</strong><p>{t.installed}: {version}</p>{newer&&<p>{t.hint}</p>}</div>
    <div className="settings-buttons">{newer&&<button className="btn-join" onClick={()=>openExternal(updates.release!.downloadUrl)}>{t.download} ↗</button>}{settings&&<button className="btn-refresh" disabled={updates.checking} onClick={onCheck}>{updates.checking?t.checking:t.check}</button>}</div>
  </section>;
}
