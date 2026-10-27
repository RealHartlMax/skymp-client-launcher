import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { Language } from './launcherPreferences';

interface Profile { id: number; displayName: string; loginName: string; email: string; emailVerified: boolean; discordLinked: boolean; expiresAt: number }
interface AccountStatus { state: 'signedOut' | 'waiting' | 'signedIn' | 'offline' | 'expired'; profile: Profile | null; remembered: boolean; remoteLogout: boolean | null }
const copy = {
  de: {title:'SkyMP-Worlds-Konto',hint:'Verbinde dein bestehendes Websitekonto mit dem Launcher. Die Anmeldung und Bestätigung erfolgen im Browser.',login:'Mit SkyMP Worlds anmelden',waiting:'Bitte die Anmeldung im Browser bestätigen.',cancel:'Anmeldung abbrechen',logout:'Abmelden',refresh:'Kontodaten aktualisieren',name:'Name',email:'E-Mail',id:'Konto-ID',discord:'Discord verknüpft',yes:'Ja',no:'Nein',hidden:'Im Streamer-Modus ausgeblendet',checking:'Konto wird geprüft …',failed:'Anmeldung derzeit nicht verfügbar. Bitte später erneut versuchen.',expired:'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.',offline:'Kontodaten zuletzt bestätigt; der Anmeldedienst ist gerade nicht erreichbar.',temporary:'Die Anmeldung bleibt nur bis zum Beenden des Launchers erhalten.',logoutLocal:'Lokal abgemeldet. Die Abmeldung beim Anmeldedienst konnte nicht bestätigt werden.',separate:'Steam-ID, Serverfreigabe und Spielfiguren bleiben unabhängig von dieser Kontoverbindung.'},
  en: {title:'SkyMP Worlds account',hint:'Connect your existing website account to the launcher. Sign-in and confirmation take place in your browser.',login:'Sign in with SkyMP Worlds',waiting:'Please confirm sign-in in your browser.',cancel:'Cancel sign-in',logout:'Sign out',refresh:'Refresh account details',name:'Name',email:'Email',id:'Account ID',discord:'Discord linked',yes:'Yes',no:'No',hidden:'Hidden by streamer mode',checking:'Checking account …',failed:'Sign-in is currently unavailable. Please try again later.',expired:'Your session expired. Please sign in again.',offline:'Last confirmed account details; the sign-in service is currently unavailable.',temporary:'This sign-in lasts only until you close the launcher.',logoutLocal:'Signed out locally. Remote sign-out could not be confirmed.',separate:'Steam identity, server approval and game characters remain independent of this account connection.'},
  ru: {title:'Аккаунт SkyMP Worlds',hint:'Подключите существующий аккаунт сайта к лаунчеру. Вход и подтверждение выполняются в браузере.',login:'Войти через SkyMP Worlds',waiting:'Подтвердите вход в браузере.',cancel:'Отменить вход',logout:'Выйти',refresh:'Обновить данные аккаунта',name:'Имя',email:'Email',id:'ID аккаунта',discord:'Discord привязан',yes:'Да',no:'Нет',hidden:'Скрыто режимом стримера',checking:'Проверка аккаунта …',failed:'Вход временно недоступен. Повторите попытку позже.',expired:'Сеанс истёк. Войдите снова.',offline:'Последние подтверждённые данные; служба входа сейчас недоступна.',temporary:'Вход сохранится только до закрытия лаунчера.',logoutLocal:'Локальный выход выполнен. Выход на сервере не подтверждён.',separate:'Личность Steam, допуск к серверу и игровые персонажи остаются независимыми от этой привязки.'},
};
export default function WorldsAccount({language,hidden,openExternal}:{language:Language;hidden:boolean;openExternal:(url:string)=>void}) {
  const t=copy[language];
  const [account,setAccount]=useState<AccountStatus|null>(null), [busy,setBusy]=useState(true), [error,setError]=useState(false), [localLogout,setLocalLogout]=useState(false);
  const mounted=useRef(false), inFlight=useRef(false);
  const refresh=async()=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);
    try{const status=await invoke<AccountStatus>('launcher_account_status');if(mounted.current){setAccount(status);setError(false);}}
    catch{if(mounted.current)setError(true);}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  };
  useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(account?.state!=='waiting')return;const timer=window.setInterval(()=>void refresh(),2000);return()=>window.clearInterval(timer);},[account?.state]);
  const begin=async()=>{
    setBusy(true);setError(false);setLocalLogout(false);
    try{const url=await invoke<string>('launcher_account_begin',{language});if(mounted.current){setAccount({state:'waiting',profile:null,remembered:false,remoteLogout:null});openExternal(url);}}
    catch{if(mounted.current)setError(true);}finally{if(mounted.current)setBusy(false);}
  };
  const stop=async(logout:boolean)=>{
    setBusy(true);setError(false);
    try{if(logout){const status=await invoke<AccountStatus>('launcher_account_logout');if(mounted.current){setAccount(status);setLocalLogout(status.remoteLogout===false);}}
      else{await invoke('launcher_account_cancel');if(mounted.current)setAccount({state:'signedOut',profile:null,remembered:false,remoteLogout:null});}}
    catch{if(mounted.current)setError(true);}finally{if(mounted.current)setBusy(false);}
  };
  const profile=account?.profile;
  return <section className="setting-block worlds-account" aria-label={t.title}>
    <h3>{t.title}</h3><p>{t.hint}</p>
    {profile&&<><p className="settings-account-name">{hidden?t.hidden:profile.displayName||profile.loginName}</p><dl className="settings-account-details">
      <dt>{t.id}</dt><dd>{hidden?t.hidden:profile.id}</dd><dt>{t.email}</dt><dd>{hidden?t.hidden:profile.email||'—'}</dd><dt>{t.discord}</dt><dd>{hidden?t.hidden:profile.discordLinked?t.yes:t.no}</dd></dl>
      {account.state==='offline'&&<p role="status">{t.offline}</p>}{!account.remembered&&<p>{t.temporary}</p>}
      <div className="settings-buttons"><button className="btn-refresh" onClick={()=>void refresh()} disabled={busy}>{t.refresh}</button><button className="text-button" onClick={()=>void stop(true)} disabled={busy}>{t.logout}</button></div></>}
    {!profile&&account?.state==='waiting'?<><p role="status">{t.waiting}</p><button className="text-button" onClick={()=>void stop(false)} disabled={busy}>{t.cancel}</button></>:!profile&&<button className="btn-refresh" onClick={()=>void begin()} disabled={busy}>{t.login} ↗</button>}
    {busy&&<p role="status">{t.checking}</p>}{error&&<p role="alert">{t.failed}</p>}{account?.state==='expired'&&<p role="status">{t.expired}</p>}{localLogout&&<p role="status">{t.logoutLocal}</p>}<p>{t.separate}</p>
  </section>;
}
