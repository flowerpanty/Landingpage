import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ROOT, loadNotices, validateNotices, publicNotices, noticePath, registryEntries, escapeHtml as e, renderNoticeContent } from '../lib/notices.mjs';

const OWNED = '<!-- nm-notice-generated -->';
const SCHEMA = /\s*<script type="application\/ld\+json" data-nm-schema="static">[\s\S]*?<\/script>\s*/g;
const INDEX_TITLE = '공지사항 | 낫띵메터스 NOTHINGMATTERS';
const INDEX_DESCRIPTION = '낫띵메터스 공식 공지사항. 크리스마스 쿠키 상품, 김포공항 인근 예약 픽업, 스마트스토어 택배 주문 안내를 확인하세요.';
const RELATED = ['christmas/index.html', 'pickup/index.html', 'products/cookie-flight/index.html', 'products/terminal-sand-cookie/index.html', 'out/fortune/index.html'];
const dateLabel = value => value.replaceAll('-', '.');
const metaLine = notice => `<span class="nm-notice-category">${e(notice.category)}</span>${notice.pinned ? '<span class="nm-notice-pin">주요 공지</span>' : ''}<time datetime="${notice.publishedAt}">${dateLabel(notice.publishedAt)}</time>`;

function cards(notices, heading = 'h2') {
  return notices.map(notice => `<li class="nm-notice-card" data-notice-slug="${notice.slug}">
  <div class="nm-notice-meta">${metaLine(notice)}</div>
  <${heading}><a href="${noticePath(notice)}">${e(notice.title)}<span aria-hidden="true"> ↗</span></a></${heading}>
  <p>${e(notice.summary)}</p>
  <a class="nm-notice-more" href="${noticePath(notice)}" aria-label="${e(notice.title)} 자세히 보기">자세히 보기 <span aria-hidden="true">→</span></a>
</li>`).join('\n');
}

function template({ title, description, pathname, body, notice, business, home, preview = false }) {
  const url = `${business.siteUrl}${pathname}`;
  const image = `${business.siteUrl}${business.image}`;
  // Keep the existing site's verification token and GA4 configuration authoritative.
  const verification = home.match(/<meta name="naver-site-verification"[^>]+>/)?.[0] || '';
  const analytics = preview ? '' : [...home.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)]
    .map(match => match[0]).filter(script => /googletagmanager\.com\/gtag\/js|gtag\('config'/.test(script)).join('\n');
  const rootLinks = html => html.replace(/href="(?!https?:|mailto:|tel:|\/)([^"]+)"/g, (_, href) => `href="${new URL(href, business.siteUrl + '/').pathname}${new URL(href, business.siteUrl + '/').hash}"`);
  const header = rootLinks(home.match(/<header class="showroom-header">[\s\S]*?<\/header>/)?.[0] || '');
  const footer = rootLinks(home.match(/<footer class="showroom-footer">[\s\S]*?<\/footer>/)?.[0] || '');
  if (!header || !footer) throw new Error('Shared showroom header/footer missing');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <meta name="robots" content="${preview ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}">
  ${verification}
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="${notice ? 'article' : 'website'}">
  <meta property="og:site_name" content="NOTHINGMATTERS">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="낫띵메터스 쿠키 선물 안내">
${notice ? `  <meta property="article:published_time" content="${notice.publishedAt}">\n  <meta property="article:modified_time" content="${notice.modifiedAt}">\n  <meta property="article:section" content="${e(notice.category)}">\n` : ''}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${e(title)}">
  <meta name="twitter:description" content="${e(description)}">
  <meta name="twitter:image" content="${image}">
  <link rel="icon" type="image/svg+xml" href="/images/nm-bear-mark.svg">
  <link rel="alternate" type="application/rss+xml" title="낫띵메터스 공식 공지사항" href="/notice/feed.xml">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/showroom.css">
  <link rel="stylesheet" href="/assets/showroom-home.css">
  <link data-nm-accessibility rel="stylesheet" href="/assets/notices.css">
  ${analytics}
</head>
<body class="theme-showroom nm-notice-page">
${OWNED}
<a data-nm-skip-link class="nm-skip-link" href="#main-content">본문으로 건너뛰기</a>
<div class="showroom-page">
${header}
<main id="main-content" class="nm-notice-wrap" tabindex="-1">
  <nav class="nm-notice-breadcrumb" aria-label="탐색 경로"><a href="/">쿠키 메인</a><span aria-hidden="true">/</span>${notice ? '<a href="/notice/">공지사항</a><span aria-hidden="true">/</span><span>상세 안내</span>' : '<span aria-current="page">공지사항</span>'}</nav>
  ${body}
</main>
${footer}
</div>
</body>
</html>
`;
}

function listBody(data) {
  const notices = publicNotices(data);
  return `<section class="nm-notice-intro"><p class="nm-notice-eyebrow">OFFICIAL NOTICE</p><h1>낫띵메터스 소식</h1><p>상품과 주문, 수령에 관한 공식 안내를 모았어요.</p></section>
  ${notices.length ? `<p class="nm-notice-list-caption">전체 ${notices.length}건 · 주요 공지 우선, 최신 게시일 순</p><ul class="nm-notice-list">${cards(notices)}</ul>` : '<p class="nm-notice-empty">아직 공개된 공지사항이 없습니다. 상품과 수령 안내는 관련 페이지에서 확인해 주세요.</p>'}`;
}

function detailBody(notice, data, root) {
  const others = publicNotices(data).filter(item => item.slug !== notice.slug);
  return `<article class="nm-notice-article">
    <header><div class="nm-notice-meta">${metaLine(notice)}</div><h1>${e(notice.title)}</h1><p class="nm-notice-deck">${e(notice.summary)}</p><p class="nm-notice-dates">게시일 <time datetime="${notice.publishedAt}">${dateLabel(notice.publishedAt)}</time>${notice.modifiedAt !== notice.publishedAt ? ` · 수정일 <time datetime="${notice.modifiedAt}">${dateLabel(notice.modifiedAt)}</time>` : ''}</p></header>
    <div class="nm-notice-body" data-notice-body>${renderNoticeContent(notice, { root })}</div>
    <a class="nm-notice-back" href="/notice/">← 전체 공지사항</a>
  </article>
  ${others.length ? `<aside class="nm-notice-related" aria-labelledby="notice-related-title"><h2 id="notice-related-title">함께 확인해 주세요</h2><ul>${others.map(item => `<li><a href="${noticePath(item)}">${e(item.title)} <span aria-hidden="true">→</span></a></li>`).join('')}</ul></aside>` : ''}`;
}

function rss(data, business) {
  const site = business.siteUrl;
  // Dates are authored as calendar dates in Korea; no invented publication time is displayed.
  const rfcDate = date => new Date(`${date}T00:00:00+09:00`).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>낫띵메터스 공식 공지사항</title><link>${site}/notice/</link>
<description>${e(INDEX_DESCRIPTION)}</description><language>ko-KR</language>
<atom:link href="${site}/notice/feed.xml" rel="self" type="application/rss+xml"/>
<lastBuildDate>${rfcDate(data.updatedAt)}</lastBuildDate>
${publicNotices(data, { pinnedFirst: false }).map(notice => `<item><title>${e(notice.title)}</title><link>${site}${noticePath(notice)}</link><guid isPermaLink="true">${site}${noticePath(notice)}</guid><pubDate>${rfcDate(notice.publishedAt)}</pubDate><category>${e(notice.category)}</category><description>${e(notice.summary)}</description></item>`).join('\n')}
</channel></rss>
`;
}

function replaceManaged(text, name, content, insert) {
  const start = `<!-- NM_${name}:START -->`, end = `<!-- NM_${name}:END -->`;
  const block = `${start}\n${content}\n${end}`;
  if (text.includes(start)) return text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => block);
  return insert(text, block);
}

function syncRegistry(text, entries, updatedAt) {
  const anchor = text.indexOf('"pages": [');
  if (anchor < 0) throw new Error('Site registry pages array is missing');
  const start = text.indexOf('[', anchor);
  let inString = false, escaped = false, depth = 1, itemStart, end;
  const items = [];
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; continue; }
    if (c === '{' || c === '[') { if (depth === 1) itemStart = i; depth++; }
    if (c === '}' || c === ']') {
      depth--;
      if (depth === 1 && itemStart != null) { items.push(text.slice(itemStart, i + 1)); itemStart = null; }
      if (depth === 0) { end = i; break; }
    }
  }
  if (!end) throw new Error('Invalid site registry pages array');
  const kept = items.filter(item => !JSON.parse(item).path.startsWith('/notice/')).map(item => {
    if (JSON.parse(item).path !== '/') return item;
    const lastmod = [JSON.parse(item).lastmod || '', updatedAt].sort().at(-1);
    return item.replace(/"lastmod":\s*"[^"]+"/, `"lastmod": "${lastmod}"`);
  });
  const next = [...kept, ...entries.map(entry => JSON.stringify(entry))];
  return `${text.slice(0, start + 1)}\n${next.map(item => `    ${item}`).join(',\n')}\n  ${text.slice(end)}`;
}

export function renderNoticeOutputs({ root = SITE_ROOT, data = loadNotices(root), preview = false } = {}) {
  validateNotices(data);
  const business = JSON.parse(fs.readFileSync(path.join(root, 'data/business.json'), 'utf8'));
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const home = read('index.html');
  const outputs = new Map();
  outputs.set('notice/index.html', template({ title: INDEX_TITLE, description: INDEX_DESCRIPTION, pathname: '/notice/', body: listBody(data), business, home, preview }));
  for (const notice of publicNotices(data)) outputs.set(`notice/${notice.slug}/index.html`, template({ title: `${notice.title} | 낫띵메터스`, description: notice.summary, pathname: noticePath(notice), body: detailBody(notice, data, root), notice, business, home, preview }));
  outputs.set('notice/feed.xml', rss(data, business));
  outputs.set('data/site-pages.json', syncRegistry(read('data/site-pages.json'), registryEntries(data), data.updatedAt));
  const latest = publicNotices(data).slice(0, 3);
  const news = `<section class="nm-notice-home" id="official-notices" aria-labelledby="home-notice-title"><div class="showroom-wrap"><header><div><p class="nm-notice-eyebrow">NOTICE</p><h2 id="home-notice-title">낫띵메터스 소식</h2></div><a href="/notice/">전체 공지 보기 →</a></header>${latest.length ? `<ul class="nm-notice-home-grid">${cards(latest, 'h3')}</ul>` : '<p>공개된 공지사항이 없습니다.</p>'}</div></section>`;
  let nextHome = replaceManaged(home, 'NOTICE_HOME', news, (html, block) => html.replace(/(?=\s*<section[^>]*id="local-pickup")/, `\n${block}\n`));
  if (!nextHome.includes('href="/assets/notices.css"')) nextHome = nextHome.replace('</head>', '  <link data-nm-accessibility rel="stylesheet" href="/assets/notices.css">\n</head>');
  if (!/class="showroom-footer-links">\s*<a href="\/notice\/"/.test(nextHome)) nextHome = nextHome.replace('<div class="showroom-footer-links">', '<div class="showroom-footer-links">\n          <a href="/notice/">공지사항</a>');
  outputs.set('index.html', nextHome);
  for (const file of RELATED) {
    const html = read(file);
    if (html.includes('data-notice-link')) continue;
    const link = '<a data-notice-link href="/notice/" style="display:inline-flex;align-items:center;min-height:44px">공지사항</a>';
    let next;
    if (file === 'products/cookie-flight/index.html') next = html.replace('</main>', `<nav class="wrap" aria-label="공식 안내" style="padding:24px 20px">${link}</nav>\n</main>`);
    else next = html.replace(/<footer\b[\s\S]*?<\/footer>/, footer => {
      if (footer.includes('</nav>')) return footer.replace('</nav>', `${link}</nav>`);
      const lastDiv = footer.lastIndexOf('</div>');
      return `${footer.slice(0, lastDiv)} · ${link}${footer.slice(lastDiv)}`;
    });
    if (!next || next === html) throw new Error(`Cannot add notice navigation to ${file}`);
    outputs.set(file, next);
  }
  const sources = `## Official notices · 공식 공지사항\n\nOfficial product and fulfillment announcements: ${business.siteUrl}/notice/\nNotice RSS (separate from the cookie-guide feed at /feed.xml): ${business.siteUrl}/notice/feed.xml\n${publicNotices(data).map(notice => `- ${notice.title}: ${business.siteUrl}${noticePath(notice)}`).join('\n')}`;
  outputs.set('llms.txt', replaceManaged(read('llms.txt'), 'NOTICES', sources, (text, block) => `${text.trimEnd()}\n\n${block}\n`));
  return outputs;
}

export function buildNotices({ root = SITE_ROOT, check = false } = {}) {
  const data = loadNotices(root);
  const outputs = renderNoticeOutputs({ root, data });
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');

  // Visibility changes remove only files owned by this generator, never other assets.
  const stale = [];
  const directory = path.join(root, 'notice');
  if (fs.existsSync(directory)) for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = `notice/${entry.name}/index.html`;
    if (entry.isDirectory() && !outputs.has(file) && fs.existsSync(path.join(root, file)) && read(file).includes(OWNED)) stale.push(file);
  }
  const changed = [];
  for (const [file, expected] of outputs) {
    const actual = fs.existsSync(path.join(root, file)) ? read(file) : '';
    const normalize = value => file.startsWith('notice/') && file.endsWith('.html') ? value.replace(SCHEMA, '\n').replace(/\s*<\/head>/, '\n</head>') : value;
    if (normalize(actual) === normalize(expected)) continue;
    changed.push(file);
    if (!check) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), expected); }
  }
  if (!check) for (const file of stale) fs.unlinkSync(path.join(root, file));
  if (check && (changed.length || stale.length)) throw new Error(`Notice outputs are out of date: ${[...changed, ...stale].join(', ')}`);
  return { publicCount: publicNotices(data).length, changed, removed: stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildNotices({ check: process.argv.includes('--check') });
  console.log(`notices ${process.argv.includes('--check') ? 'check' : 'build'}: ${result.publicCount} public notices; ${result.changed.length} updated; ${result.removed.length} removed`);
}
