import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NOTICE_BASE = '/notice/';
export const noticePath = notice => `${NOTICE_BASE}${notice.slug}/`;
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateNotices(data) {
  if (data?.version !== 1 || !validDate(data.updatedAt) || !Array.isArray(data.notices)) throw new Error('Invalid notice catalog');
  const seen = new Set();
  for (const notice of data.notices) {
    if (typeof notice.slug !== 'string' || notice.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(notice.slug) || ['index', 'feed', 'admin', 'preview', 'assets'].includes(notice.slug) || seen.has(notice.slug)) throw new Error(`Invalid/duplicate notice slug: ${notice.slug}`);
    seen.add(notice.slug);
    for (const [key, max] of [['title', 160], ['summary', 500], ['category', 40]]) if (typeof notice[key] !== 'string' || !notice[key].trim() || notice[key].length > max) throw new Error(`${notice.slug}: invalid ${key}`);
    if (!validDate(notice.publishedAt) || !validDate(notice.modifiedAt) || notice.modifiedAt < notice.publishedAt || data.updatedAt < notice.modifiedAt) throw new Error(`${notice.slug}: invalid publication/modification dates`);
    if (!['published', 'draft', 'archived'].includes(notice.status) || typeof notice.pinned !== 'boolean') throw new Error(`${notice.slug}: invalid visibility/pin`);
    if (!Array.isArray(notice.content) || !notice.content.length || notice.content.length > 100) throw new Error(`${notice.slug}: invalid content`);
    for (const block of notice.content) {
      if (['paragraph', 'heading'].includes(block.type)) {
        if (typeof block.text !== 'string' || !block.text.trim() || block.text.length > 10000) throw new Error(`${notice.slug}: invalid text`);
      } else if (block.type === 'list') {
        if (!Array.isArray(block.items) || !block.items.length || block.items.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`${notice.slug}: invalid list`);
      } else if (block.type === 'links') {
        if (!Array.isArray(block.items) || !block.items.length) throw new Error(`${notice.slug}: missing links`);
        for (const item of block.items) {
          if (typeof item.label !== 'string' || !item.label || item.label.length > 160 || typeof item.href !== 'string' || item.href.length > 2048 || /[\s\\\u0000-\u001f]/.test(item.href) || !/^(?:\/(?!\/)|https:\/\/)/.test(item.href)) throw new Error(`${notice.slug}: invalid link`);
          try { new URL(item.href, 'https://nothingmatters.co.kr'); } catch { throw new Error(`${notice.slug}: invalid link`); }
        }
      } else if (block.type === 'shippingProducts') {
        if (!Array.isArray(block.items) || !block.items.length || block.items.some(item => !item.name || !/^\/(?:products|out)\/[a-z0-9/-]+\/$/.test(item.page))) throw new Error(`${notice.slug}: invalid shipping products`);
      } else if (block.type !== 'christmasProducts') throw new Error(`${notice.slug}: unsupported content block ${block.type}`);
    }
  }
  return data;
}
export function loadNotices(root = SITE_ROOT) {
  return validateNotices(JSON.parse(fs.readFileSync(path.join(root, 'data/notices.json'), 'utf8')));
}
export function publicNotices(data, { pinnedFirst = true } = {}) {
  return data.notices.filter(notice => notice.status === 'published').sort((a, b) =>
    (pinnedFirst ? Number(b.pinned) - Number(a.pinned) : 0) || b.publishedAt.localeCompare(a.publishedAt)
  );
}
export function registryEntries(data) {
  return [
    { path: NOTICE_BASE, status: 'active', indexing: 'index', sitemap: true, lastmod: data.updatedAt, breadcrumbName: '공지사항', urlRole: 'notice-index' },
    ...publicNotices(data).map(notice => ({ path: noticePath(notice), status: 'active', indexing: 'index', sitemap: true, lastmod: notice.modifiedAt, breadcrumbName: notice.title, urlRole: 'notice-article', noticeSlug: notice.slug }))
  ];
}
export function shippingUrl(item, root = SITE_ROOT) {
  const allowedPages = new Set(['/products/cookie-flight/', '/products/terminal-sand-cookie/', '/out/fortune/']);
  if (!allowedPages.has(item.page)) throw new Error(`Unverified shipping product: ${item.page}`);
  const html = fs.readFileSync(path.join(root, item.page.slice(1), 'index.html'), 'utf8');
  const urls = [...new Set([...html.matchAll(/href=["'](https:\/\/mkt\.shopping\.naver\.com\/link\/[a-zA-Z0-9]+)["']/g)].map(match => match[1]))];
  if (urls.length !== 1) throw new Error(`Cannot identify the exact existing Smartstore link: ${item.page}`);
  return urls[0];
}
export function renderNoticeContent(notice, { root = SITE_ROOT } = {}) {
  const e = escapeHtml;
  return notice.content.map(block => {
    if (block.type === 'paragraph') return `<p>${e(block.text)}</p>`;
    if (block.type === 'heading') return `<h2>${e(block.text)}</h2>`;
    if (block.type === 'list') return `<ul>${block.items.map(item => `<li>${e(item)}</li>`).join('')}</ul>`;
    if (block.type === 'christmasProducts') {
      const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/christmas-products.json'), 'utf8'));
      return `<ul class="nm-notice-product-list">${catalog.products.map(product => `<li><span><strong>${e(product.name)}</strong><small>${e(product.composition)}</small></span><b>${product.price.toLocaleString('ko-KR')}원</b></li>`).join('')}</ul>`;
    }
    if (block.type === 'shippingProducts') return `<ul class="nm-notice-shipping-list">${block.items.map(item => `<li><strong>${e(item.name)}</strong><a href="${e(shippingUrl(item, root))}" target="_blank" rel="noopener noreferrer">${e(item.name)} 스마트스토어 ↗</a><a href="${e(item.page)}">상품 안내 보기 →</a></li>`).join('')}</ul>`;
    if (block.type === 'links') return `<nav class="nm-notice-actions" aria-label="관련 안내">${block.items.map(item => `<a class="showroom-button ${item.href.startsWith('https:') ? 'showroom-button--paper' : 'showroom-button--dark'}" href="${e(item.href)}"${item.href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${e(item.label)}${item.href.startsWith('https:') ? ' ↗' : ' →'}</a>`).join('')}</nav>`;
    throw new Error(`Unsupported notice content: ${block.type}`);
  }).join('\n');
}
