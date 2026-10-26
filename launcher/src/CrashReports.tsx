import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import './CrashReports.css';
import { useStreamerMode } from './Privacy';
import { privateText } from './launcherPreferences';

type Language = 'de' | 'en' | 'ru';
type Report = { id: string; eventKind: string; occurredAtUnix: number; exitCode?: string; bytes: number; dumpBytes: number; state: string; serverReportId?: string; preview: Record<string, unknown> };
const text = {
  de: { center: 'Absturzberichte', title: 'Skyrim wurde unerwartet beendet', launcher: 'Launcher-Diagnose', unknown: 'Der vorherige Lauf wurde unerwartet beendet. Auch manuelles Beenden oder ein PC-Neustart sind möglich.', intro: 'Hilf uns, den Fehler zu finden. Der Bericht bleibt lokal, bis du ihn sendest.', content: 'Enthalten: Versionsstand, Systemdaten und bereinigte Ausschnitte aus Launcher-, SKSE- und SkyrimPlatform-Protokollen. Keine Spielstände oder Screenshots.', privacy: 'Passwörter, Schlüssel und Anmeldetokens werden aus dem Basisbericht entfernt. Speicherabbilder können vertrauliche Speicherinhalte enthalten.', comment: 'Was ist unmittelbar vorher passiert? (freiwillig)', contact: 'E-Mail für Rückfragen (freiwillig)', dump: 'Speicherabbild zusätzlich senden oder exportieren', dumpHint: 'Separates Einverständnis: Ein Speicherabbild kann persönliche Daten und Sitzungstokens enthalten und lässt sich nicht vollständig bereinigen.', send: 'Bericht senden', retry: 'Erneut senden', export: 'Lokal speichern', close: 'Schließen', busy: 'Wird verarbeitet …', sent: 'Bericht gespeichert. Bericht-ID:', saved: 'Lokal gespeichert unter:', error: 'Der Vorgang konnte nicht vollständig abgeschlossen werden. Der Bericht bleibt lokal.', preview: 'Basisbericht ansehen', date: 'Zeitpunkt', code: 'Fehlercode', size: 'Basisbericht', dumpSize: 'Speicherabbild', noDump: 'Kein Speicherabbild vorhanden. Für künftige Abstürze kannst du die Aufzeichnung unten aktivieren.', empty: 'Keine offenen Absturzberichte.', settings: 'Speicherabbilder für künftige Spiel- und Launcherstarts lokal aufzeichnen', settingsHint: 'Standardmäßig aus. Ein separater Diagnosehelfer überwacht dann Spiel und Launcher. Das kann das Startverhalten beeinflussen. Der Upload benötigt weiterhin deine separate Freigabe.', settingSaved: 'Einstellung gespeichert; gilt für den nächsten Spiel- bzw. Launcherstart.', report: 'Bericht öffnen', unavailable: 'Die Berichtsfunktion benötigt den Windows-Launcher.', crash: 'Spielabsturz', uncertain: 'Unklarer Spielabbruch', panic: 'Launcher-Fehler', submitted: 'Gesendet', pending: 'Upload ausstehend', draft: 'Lokal', id: 'Bericht-ID kopieren', copied: 'Bericht-ID kopiert', invalidContact: 'Bitte eine gültige E-Mail-Adresse eintragen oder das Feld leer lassen.' },
  en: { center: 'Crash reports', title: 'Skyrim closed unexpectedly', launcher: 'Launcher diagnostics', unknown: 'The previous session ended unexpectedly. Manual termination or a PC restart are also possible.', intro: 'Help us find the cause. The report stays local until you send it.', content: 'Includes versions, system information and sanitized excerpts from launcher, SKSE and SkyrimPlatform logs. No saves or screenshots.', privacy: 'Passwords, keys and sign-in tokens are removed from the basis report. Memory dumps can contain confidential memory contents.', comment: 'What happened immediately before this? (optional)', contact: 'Email for follow-up (optional)', dump: 'Also send or export the memory dump', dumpHint: 'Separate consent: A memory dump can contain personal data and session tokens and cannot be fully sanitized.', send: 'Send report', retry: 'Retry upload', export: 'Save locally', close: 'Close', busy: 'Working …', sent: 'Report stored. Report ID:', saved: 'Saved locally to:', error: 'The operation could not be fully completed. Your report stays local.', preview: 'View basis report', date: 'Time', code: 'Error code', size: 'Basis report', dumpSize: 'Memory dump', noDump: 'No memory dump is available. You can enable capture below for future crashes.', empty: 'No open crash reports.', settings: 'Capture memory dumps locally for future game and launcher starts', settingsHint: 'Off by default. A separate diagnostic helper will observe the game and launcher. This can affect startup behavior. Upload still requires your separate consent.', settingSaved: 'Setting saved; applies to the next game or launcher start.', report: 'Open report', unavailable: 'Reporting requires the Windows launcher.', crash: 'Game crash', uncertain: 'Uncertain game exit', panic: 'Launcher error', submitted: 'Sent', pending: 'Upload pending', draft: 'Local', id: 'Copy report ID', copied: 'Report ID copied', invalidContact: 'Enter a valid email address or leave the field empty.' },
  ru: { center: 'Отчёты о сбоях', title: 'Skyrim неожиданно завершился', launcher: 'Диагностика лаунчера', unknown: 'Предыдущий запуск завершился неожиданно. Возможно ручное завершение или перезапуск компьютера.', intro: 'Помогите найти причину. Отчёт остаётся на компьютере, пока вы его не отправите.', content: 'Содержит версии, сведения о системе и очищенные фрагменты журналов лаунчера, SKSE и SkyrimPlatform. Без сохранений и снимков экрана.', privacy: 'Пароли, ключи и токены входа удаляются из основного отчёта. Дамп может содержать конфиденциальные данные из памяти.', comment: 'Что произошло непосредственно перед сбоем? (необязательно)', contact: 'Электронная почта для ответа (необязательно)', dump: 'Также отправить или сохранить дамп памяти', dumpHint: 'Отдельное согласие: дамп может содержать личные данные и токены сеанса. Полностью очистить его невозможно.', send: 'Отправить отчёт', retry: 'Повторить отправку', export: 'Сохранить локально', close: 'Закрыть', busy: 'Обработка …', sent: 'Отчёт сохранён. Номер отчёта:', saved: 'Сохранено в:', error: 'Операция завершена не полностью. Отчёт остаётся на компьютере.', preview: 'Просмотреть основной отчёт', date: 'Время', code: 'Код ошибки', size: 'Основной отчёт', dumpSize: 'Дамп памяти', noDump: 'Дампа памяти нет. Ниже можно включить запись для будущих сбоев.', empty: 'Нет открытых отчётов о сбоях.', settings: 'Записывать дампы при следующих запусках игры и лаунчера', settingsHint: 'По умолчанию выключено. Отдельный диагностический процесс будет следить за игрой и лаунчером. Это может повлиять на запуск. Для отправки по-прежнему нужно отдельное согласие.', settingSaved: 'Настройка сохранена и действует со следующего запуска игры или лаунчера.', report: 'Открыть отчёт', unavailable: 'Для отчётов нужен лаунчер Windows.', crash: 'Сбой игры', uncertain: 'Неясное завершение игры', panic: 'Ошибка лаунчера', submitted: 'Отправлено', pending: 'Ожидает отправки', draft: 'Локально', id: 'Скопировать номер отчёта', copied: 'Номер отчёта скопирован', invalidContact: 'Введите корректную электронную почту или оставьте поле пустым.' },
};
const bytes = (n: number, language: Language) => n >= 1048576 ? `${(n / 1048576).toLocaleString(language, { maximumFractionDigits: 1 })} MiB` : `${(n / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} KiB`;

export default function CrashReports({ language }: { language: Language }) {
  const streamer = useStreamerMode();
  const t = text[language];
  const [reports, setReports] = useState<Report[]>([]), [open, setOpen] = useState(false), [selected, setSelected] = useState('');
  const [capture, setCapture] = useState(false), [includeDump, setIncludeDump] = useState(false), [busy, setBusy] = useState(false);
  const [comment, setComment] = useState(''), [contact, setContact] = useState(''), [message, setMessage] = useState(''), [failure, setFailure] = useState('');
  const card = useRef<HTMLDivElement>(null), notified = useRef(new Set<string>());
  const current = reports.find(r => r.id === selected);
  useEffect(() => { void invoke('set_crash_report_language', { language }).catch(() => {}); }, [language]);
  const show = (report: Report) => { notified.current.add(report.id); setSelected(report.id); setComment(String(report.preview.comment || '')); setContact(String(report.preview.contact || '')); setIncludeDump(false); setFailure(''); setMessage(''); setOpen(true); };
  useEffect(() => {
    let disposed = false, unsubscribe: (() => void) | undefined, unsubscribeUpdates: (() => void) | undefined;
    void invoke<boolean>('crash_capture_setting').then(value => { if (!disposed) setCapture(value); }).catch(() => {});
    const load = async () => {
      try {
        const value = await invoke<Report[]>('crash_reports_list');
        if (disposed) return;
        setReports(value);
        const next = value.find(r => !notified.current.has(r.id) && r.state !== 'submitted');
        if (next) { value.forEach(r => notified.current.add(r.id)); show(next); }
      } catch { /* A browser preview has no native backend. */ }
    };
    void load();
    void listen<Report>('crash-report-ready', event => {
      if (disposed) return;
      const report = event.payload;
      setReports(previous => [report, ...previous.filter(p => p.id !== report.id)]);
      show(report);
    }).then(stop => { if (disposed) stop(); else unsubscribe = stop; }).catch(() => {});
    void listen('crash-reports-updated', () => { void load(); }).then(stop => { if (disposed) stop(); else unsubscribeUpdates = stop; }).catch(() => {});
    return () => { disposed = true; unsubscribe?.(); unsubscribeUpdates?.(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    card.current?.focus();
    return () => previous?.focus();
  }, [open, selected]);
  const close = async () => {
    if (busy) return;
    if (current) {
      try { await invoke('crash_report_dismiss', { id: current.id }); setReports(previous => previous.filter(r => r.id !== current.id)); }
      catch { setFailure(t.error); return; }
    }
    setOpen(false); setSelected('');
  };
  const action = async (kind: 'send' | 'export') => {
    if (!current || busy) return;
    if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) { setFailure(t.invalidContact); return; }
    setBusy(true); setFailure(''); setMessage('');
    try {
      if (kind === 'send') {
        const report = await invoke<Report>('crash_report_submit', { id: current.id, comment, contact, includeDump });
        setReports(previous => previous.map(r => r.id === report.id ? report : r)); setMessage(`${t.sent} ${report.serverReportId}`);
      } else {
        const path = await invoke<string>('crash_report_export', { id: current.id, comment, contact, includeDump }); setMessage(`${t.saved} ${path}`);
      }
    } catch (error) {
      setFailure(`${t.error}\n${String(error)}`);
      // The basis report may have succeeded while the optional dump failed.
      try { setReports(await invoke<Report[]>('crash_reports_list')); } catch { /* retain current state */ }
    } finally { setBusy(false); }
  };
  const toggle = async (enabled: boolean) => {
    setBusy(true); setFailure('');
    try { await invoke('set_crash_capture', { enabled }); setCapture(enabled); setMessage(t.settingSaved); }
    catch { setFailure(t.unavailable); } finally { setBusy(false); }
  };
  const eventTitle = (report: Report) => report.eventKind === 'gameCrash' ? t.crash : ['launcherPanic', 'launcherCrash'].includes(report.eventKind) ? t.panic : t.uncertain;
  return <>
    <button className="text-button crash-center-toggle" onClick={() => { setSelected(''); setFailure(''); setMessage(''); setOpen(true); }}>
      {t.center}{reports.length ? ` (${reports.length})` : ''}
    </button>
    {open && <div className="crash-report-backdrop"><div className="crash-report-card panel" role="dialog" aria-modal="true" aria-labelledby="crash-report-title" tabIndex={-1} ref={card} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); void close(); }
      if (event.key === 'Tab') {
        const elements = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') || []).filter(el => el.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === card.current)) { event.preventDefault(); first.focus(); }
      }
    }}>
      <p className="eyebrow">SKYMP WORLDS</p>
      <h2 id="crash-report-title">{current ? current.eventKind === 'gameCrash' ? t.title : t.launcher : t.center}</h2>
      {current ? <>
        {current.eventKind.endsWith('Unknown') && <p>{t.unknown}</p>}
        <p>{t.intro}</p><p className="crash-description">{t.content}</p>
        <dl className="crash-facts"><div><dt>{t.date}</dt><dd>{new Date(current.occurredAtUnix * 1000).toLocaleString(language)}</dd></div><div><dt>{t.code}</dt><dd>{current.exitCode || '—'}</dd></div><div><dt>{t.size}</dt><dd>{bytes(current.bytes, language)}</dd></div><div><dt>{t.dumpSize}</dt><dd>{current.dumpBytes ? bytes(current.dumpBytes, language) : '—'}</dd></div></dl>
        <p className="crash-privacy">{t.privacy}</p>
        <label>{t.comment}<textarea value={comment} maxLength={2000} onChange={e => setComment(e.target.value)} disabled={busy || current.state !== 'draft'} rows={3} /></label>
        <label>{t.contact}<input type={streamer ? 'password' : 'email'} value={contact} maxLength={254} onChange={e => setContact(e.target.value)} disabled={busy || current.state !== 'draft'} autoComplete={streamer ? 'off' : 'email'} /></label>
        {current.dumpBytes > 0 ? <div className="crash-dump-choice"><label className="crash-checkbox"><input type="checkbox" checked={includeDump} onChange={e => setIncludeDump(e.target.checked)} disabled={busy} />{t.dump} ({bytes(current.dumpBytes, language)})</label><p>{t.dumpHint}</p></div> : <p className="crash-description">{t.noDump}</p>}
        <details className="crash-preview"><summary>{t.preview}</summary><pre>{privateText(JSON.stringify(current.preview, null, 2), streamer, language)}</pre></details>
        {current.serverReportId && <p className="crash-receipt">{t.sent} <code>{current.serverReportId}</code> <button className="text-button" disabled={busy} onClick={() => { void navigator.clipboard.writeText(current.serverReportId!).then(() => setMessage(t.copied)).catch(() => setMessage(current.serverReportId!)); }}>{t.id}</button></p>}
        <div className="controls crash-actions"><button className="btn-join" disabled={busy} onClick={() => void action('send')}>{busy ? t.busy : current.serverReportId || current.state === 'pending' ? t.retry : t.send}</button><button className="btn-refresh" disabled={busy} onClick={() => void action('export')}>{t.export}</button><button className="btn-refresh" disabled={busy} onClick={() => void close()}>{t.close}</button></div>
      </> : <>
        {!reports.length && <p>{t.empty}</p>}
        <div className="crash-report-list">{reports.map(report => <button className="crash-report-row" key={report.id} onClick={() => show(report)}><strong>{eventTitle(report)} · {report.exitCode || '—'}</strong><span>{new Date(report.occurredAtUnix * 1000).toLocaleString(language)} · {report.state === 'submitted' ? t.submitted : report.state === 'pending' ? t.pending : t.draft}</span><span>{t.report} →</span></button>)}</div>
      </>}
      <div className="crash-capture-setting"><label className="crash-checkbox"><input type="checkbox" checked={capture} onChange={e => void toggle(e.target.checked)} disabled={busy} />{t.settings}</label><p>{t.settingsHint}</p></div>
      {message && <p role="status" className="crash-message">{privateText(message, streamer, language)}</p>}
      {failure && <p role="alert" className="crash-error">{privateText(failure, streamer, language)}</p>}
      {!current && <button className="btn-refresh" disabled={busy} onClick={() => void close()}>{t.close}</button>}
    </div></div>}
  </>;
}
