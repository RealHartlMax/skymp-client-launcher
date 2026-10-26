// Render the three complete operator manuals to static HTML. No runtime Node/PHP required.
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = join(project, 'web/docs.skymp-worlds.net');
const platform = JSON.parse(await readFile(join(project, 'web/shared/platform.json'), 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const languages = {
  de: {name:'Deutsch',title:'Handbuch für Serverbetreiber',intro:'Deinen Server anbinden. Deine Welt bewahren.',description:'Die technische Anleitung für eigene SkyMP-Server: Registrierung, Dateien, Clientpakete, Anmeldung und Betrieb mit dem gemeinsamen Launcher.',toc:'In diesem Handbuch',search:'Handbuch durchsuchen',placeholder:'Zum Beispiel: serverUid, Prüfsumme, 404 …',results:'Treffer',empty:'Kein Treffer. Versuche einen anderen Begriff.',clear:'Suche leeren',copy:'Kopieren',copied:'Kopiert',copyError:'Bitte den Code auswählen und kopieren.',menu:'Kapitel anzeigen',skip:'Zum Inhalt',repo:'Server-Fork',dashboard:'Server verwalten',status:'Launcher 0.2.0 · Stand 26.10.2026',notice:'Keine Kompatibilitätsgarantie',noticeText:'Bestehende Server und eigene Forks benötigen eine passende Implementierung und eigene Tests. Auch der angebotene Fork ist keine Garantie für jedes System oder Modpaket.',read:'Handbuch lesen',choose:'Zwei Wege zu deiner Welt',existing:'Bestehenden Server integrieren',existingBody:'Schnittstellen und Voraussetzungen prüfen, gezielt ergänzen und die eigene Installation testen.',fork:'SkyMP-Fork verwenden',forkBody:'Den verlinkten Quellstand als Ausgangspunkt verwenden und seine Launcher-Schnittstellen prüfen.',language:'Sprache',top:'Nach oben',source:'Quellen & Prüfstand',print:'Drucken'},
  en: {name:'English',title:'Server operator handbook',intro:'Connect your server. Keep your world.',description:'A technical guide for independent SkyMP servers: registration, downloads, client packages, authentication and operation with the shared launcher.',toc:'In this handbook',search:'Search the handbook',placeholder:'For example: serverUid, checksum, 404 …',results:'results',empty:'No results. Try another term.',clear:'Clear search',copy:'Copy',copied:'Copied',copyError:'Please select and copy the code.',menu:'Show chapters',skip:'Skip to content',repo:'Server fork',dashboard:'Manage your server',status:'Launcher 0.2.0 · Updated 2026-10-26',notice:'No compatibility guarantee',noticeText:'Existing servers and custom forks require a suitable implementation and their own tests. The linked fork is also not a guarantee for every system or mod pack.',read:'Read the handbook',choose:'Two ways to your world',existing:'Integrate an existing server',existingBody:'Check the interfaces and prerequisites, add the required parts and test your own installation.',fork:'Use the SkyMP fork',forkBody:'Use the linked source as a starting point and verify its launcher interfaces.',language:'Language',top:'Back to top',source:'Sources & validation',print:'Print'},
  ru: {name:'Русский',title:'Руководство для владельцев серверов',intro:'Подключи сервер. Сохрани свой мир.',description:'Техническое руководство для независимых серверов SkyMP: регистрация, файлы, пакеты клиента, авторизация и работа с единым лаунчером.',toc:'В этом руководстве',search:'Поиск по руководству',placeholder:'Например: serverUid, контрольная сумма, 404 …',results:'результатов',empty:'Ничего не найдено. Попробуй другой запрос.',clear:'Очистить поиск',copy:'Копировать',copied:'Скопировано',copyError:'Выдели и скопируй код вручную.',menu:'Показать главы',skip:'Перейти к содержимому',repo:'Форк сервера',dashboard:'Управление сервером',status:'Лаунчер 0.2.0 · Обновлено 26.10.2026',notice:'Без гарантии совместимости',noticeText:'Существующие серверы и собственные форки требуют подходящей реализации и самостоятельного тестирования. Указанный форк также не гарантирует работу на любой системе с любым набором модов.',read:'Читать руководство',choose:'Два пути к своему миру',existing:'Подключить существующий сервер',existingBody:'Проверь интерфейсы и требования, добавь нужные компоненты и протестируй свою установку.',fork:'Использовать форк SkyMP',forkBody:'Возьми указанный исходный код за основу и проверь его интерфейсы для лаунчера.',language:'Язык',top:'Наверх',source:'Источники и проверка',print:'Печать'}
};

// This deliberately small Markdown subset covers our maintained source manuals.
// HTML is escaped; links are limited to HTTPS and anchors. Invalid input fails the build.
function inline(text) {
  let output = '', position = 0;
  for (const match of text.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g)) {
    output += escape(text.slice(position, match.index));
    if (match[1]) output += `<code>${escape(match[1])}</code>`;
    else if (match[2]) output += `<strong>${inline(match[2])}</strong>`;
    else {
      const url = match[4];
      if (!/^(?:https:\/\/|#[a-z0-9-]+$)/.test(url)) throw Error(`Unsupported manual link: ${url}`);
      output += `<a href="${escape(url)}"${url.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(match[3])}</a>`;
    }
    position = match.index + match[0].length;
  }
  return output + escape(text.slice(position));
}
function render(markdown, text) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections = [], ids = new Set(), examples = [];
  let active;
  const add = html => { if (!active) throw Error('Content must follow an anchored level-2 heading'); active.html += html + '\n'; };
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim() || /^# /.test(line)) { i++; continue; }
    const sourceAnchor = /^<a id="([a-z0-9-]+)"><\/a>$/.exec(line);
    if (sourceAnchor) {
      const next = lines.slice(i + 1).find(value => value.trim());
      const target = next && /^## (.+) \{#([a-z0-9-]+)\}$/.exec(next);
      if (!target || target[2] !== sourceAnchor[1]) throw Error('Source anchor must match its chapter');
      i++; continue;
    }
    const heading = /^## (.+) \{#([a-z0-9-]+)\}$/.exec(line);
    if (heading) {
      if (ids.has(heading[2])) throw Error(`Duplicate manual anchor ${heading[2]}`);
      ids.add(heading[2]); active = {id:heading[2],title:heading[1],html:''}; sections.push(active); i++; continue;
    }
    if (/^## /.test(line)) throw Error('Every chapter needs an explicit stable anchor');
    if (/^### /.test(line)) { add(`<h3>${inline(line.slice(4))}</h3>`); i++; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim(), code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      if (i === lines.length) throw Error('Unclosed code fence'); i++;
      const value = code.join('\n');
      if (language === 'json') { JSON.parse(value); examples.push(value); }
      add(`<div class="docs-code"><div class="docs-code-bar"><span>${escape(language || 'text')}</span><button type="button" class="docs-copy" data-copy-code>${escape(text.copy)}</button></div><pre><code>${escape(value)}</code></pre></div>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++].trim().replace(/^\||\|$/g,'').split('|').map(cell => cell.trim()));
      if (rows.length < 2 || rows[1].some(cell => !/^:?-{3,}:?$/.test(cell))) throw Error('Invalid manual table');
      const [header,,...body] = rows;
      if (body.some(row => row.length !== header.length)) throw Error('Manual table column mismatch');
      add(`<div class="docs-table" tabindex="0"><table><thead><tr>${header.map(cell=>`<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${row.map(cell=>`<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^(?:- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line), items = [];
      while (i < lines.length && (ordered ? /^\d+\. / : /^- /).test(lines[i])) items.push(inline(lines[i++].replace(/^(?:- |\d+\. )/,'')));
      add(`<${ordered?'ol':'ul'}>${items.map(item=>`<li>${item}</li>`).join('')}</${ordered?'ol':'ul'}>`); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#|```|\||- |\d+\. )/.test(lines[i])) paragraph.push(lines[i++]);
    add(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  for (const section of sections) for (const link of section.html.matchAll(/href="#([a-z0-9-]+)"/g)) if (!ids.has(link[1])) throw Error(`Unknown manual link ${link[1]}`);
  return {sections,examples};
}

await mkdir(join(root, 'assets/image'), {recursive:true});
await cp(join(project,'web/landing-page/assets/image/bg.jpg'), join(root,'assets/image/bg.jpg'));
const versions = {};
for (const asset of ['docs.css','docs.js']) versions[asset] = createHash('sha256').update(await readFile(join(root,'assets',asset))).digest('hex').slice(0,12);
const reports = []; let expectedIds;
for (const [language, text] of Object.entries(languages)) {
  const source = await readFile(join(project, `docs/SERVER_OWNER_GUIDE.${language}.md`), 'utf8');
  const {sections,examples} = render(source, text);
  const ids = sections.map(section=>section.id);
  if (expectedIds && JSON.stringify(ids) !== JSON.stringify(expectedIds)) throw Error('The manuals must have the same chapter anchors in all three languages');
  expectedIds = ids;
  const base = language === 'de' ? '' : '../';
  const urls = Object.fromEntries(Object.keys(languages).map(code=>[code,base + (code === 'de' ? 'index.html' : code + '/index.html')]));
  const html = `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SkyMP Worlds Docs | ${escape(text.title)}</title><meta name="description" content="${escape(text.description)}">
<link rel="canonical" href="${platform.docsUrl}${language==='de'?'':language+'/'}">
${Object.keys(languages).map(code=>`<link rel="alternate" hreflang="${code}" href="${platform.docsUrl}${code==='de'?'':code+'/'}">`).join('\n')}
<link rel="stylesheet" href="${base}assets/worlds.css"><link rel="stylesheet" href="${base}assets/docs.css?v=${versions['docs.css']}">
<script src="${base}assets/docs.js?v=${versions['docs.js']}" defer></script></head>
<body class="docs-shell" data-docs-results="${escape(text.results)}" data-docs-empty="${escape(text.empty)}" data-docs-copy="${escape(text.copy)}" data-docs-copied="${escape(text.copied)}" data-docs-copy-error="${escape(text.copyError)}">
<a class="docs-skip" href="#manual">${escape(text.skip)}</a>
<div class="site-layout" id="top"><header class="site-header panel"><a class="brand-link" href="https://skymp-worlds.net/">SkyMP <span>Worlds</span><span class="docs-brand-label">Docs</span></a>
<div class="site-header-actions"><a class="button button-ghost" href="https://manage.skymp-worlds.net/index.php">${escape(text.dashboard)}</a><a class="button button-ghost" href="https://github.com/RealHartlMax/skymp" target="_blank" rel="noopener noreferrer">${escape(text.repo)} ↗</a>
<nav class="docs-languages" aria-label="${escape(text.language)}">${Object.entries(languages).map(([code,item])=>`<a href="${urls[code]}?lang=${code}" lang="${code}" hreflang="${code}" data-docs-language="${code}" title="${escape(item.name)}"${code===language?' aria-current="page"':''}>${code.toUpperCase()}</a>`).join('')}</nav></div></header>
<section class="docs-intro"><div><p class="eyebrow">SKYMP WORLDS · ${escape(text.title)}</p><h1>${escape(text.intro)}</h1><p class="site-copy">${escape(text.description)}</p><p class="docs-version">${escape(text.status)}</p></div>
<aside class="docs-notice"><strong>${escape(text.notice)}</strong><p>${escape(text.noticeText)}</p><a href="#compatibility">${escape(text.read)} →</a></aside></section>
<section class="docs-paths" aria-label="${escape(text.choose)}"><a href="#existing" class="panel"><span class="eyebrow">01</span><strong>${escape(text.existing)}</strong><span>${escape(text.existingBody)}</span><span aria-hidden="true">→</span></a><a href="#fork" class="panel"><span class="eyebrow">02</span><strong>${escape(text.fork)}</strong><span>${escape(text.forkBody)}</span><span aria-hidden="true">→</span></a></section>
<section class="docs-search-panel"><label for="docs-search">${escape(text.search)}</label><div class="docs-search-row"><input id="docs-search" type="search" placeholder="${escape(text.placeholder)}" aria-controls="docs-search-results" autocomplete="off"><button class="button button-ghost" id="docs-search-clear" type="button" hidden>${escape(text.clear)}</button></div><div id="docs-search-results" hidden><p id="docs-search-status" role="status" aria-live="polite"></p><ul></ul></div></section>
<div class="docs-layout"><aside class="docs-sidebar"><button class="button button-secondary docs-menu" type="button" aria-expanded="false" aria-controls="docs-toc">${escape(text.menu)}</button><nav id="docs-toc" aria-label="${escape(text.toc)}"><p class="eyebrow">${escape(text.toc)}</p><ol>${sections.map((section,index)=>`<li><a href="#${section.id}"><span>${String(index+1).padStart(2,'0')}</span>${escape(section.title)}</a></li>`).join('')}</ol></nav></aside>
<main class="docs-manual" id="manual">${sections.map((section,index)=>`<section class="docs-chapter" id="${section.id}" data-docs-chapter><div class="docs-chapter-heading"><span>${String(index+1).padStart(2,'0')}</span><h2 tabindex="-1">${escape(section.title)}</h2><a href="#${section.id}" aria-label="${escape(section.title)}">#</a></div>${section.html}<a class="docs-to-top" href="#top">↑ ${escape(text.top)}</a></section>`).join('\n')}</main></div>
<footer class="docs-footer"><span>SkyMP Worlds · ${escape(text.status)}</span><a href="#sources">${escape(text.source)}</a><button type="button" data-docs-print>${escape(text.print)}</button></footer></div></body></html>\n`;
  const file = language==='de' ? join(root,'index.html') : join(root,language,'index.html');
  await mkdir(resolve(file,'..'), {recursive:true}); await writeFile(file,html);
  reports.push({language,chapters:sections.length,jsonExamples:examples.length,sourceBytes:Buffer.byteLength(source),outputBytes:Buffer.byteLength(html)});
}
await writeFile(join(root,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(languages).map(code=>`<url><loc>${platform.docsUrl}${code==='de'?'':code+'/'}</loc><lastmod>2026-10-22</lastmod></url>`).join('')}</urlset>\n`);
await writeFile(join(root,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${platform.docsUrl}sitemap.xml\n`);
console.log(JSON.stringify({docsBuilt:true,languages:reports,chapterAnchors:expectedIds}));
