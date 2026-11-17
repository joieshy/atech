'use strict';

/* ==========================================================================
   ATECH — public site script
   ========================================================================== */

const ICONS = {
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01M2 8.82a15 15 0 0 1 20 0"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/>',
  box: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  star: '<path d="m12 3 2.7 5.8 6.3.8-4.6 4.3 1.2 6.1-5.6-3-5.6 3 1.2-6.1L3 9.6l6.3-.8L12 3Z" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z"/>',
  telegram: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3V9Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
};

const state = {
  site: null,
  stats: { installers: 0, downloads: 0, categories: 0 },
  categories: [],
  installers: [],
  category: 'all',
  q: '',
  sort: 'latest',
  loading: false
};

const numberFormat = new Intl.NumberFormat('en-PH');
const $ = (selector, root = document) => root.querySelector(selector);

function icon(name, className = '') {
  const markup = ICONS[name] || ICONS.box;
  return `<svg viewBox="0 0 24 24"${className ? ` class="${className}"` : ''} aria-hidden="true">${markup}</svg>`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function api(path) {
  return fetch(path, { headers: { Accept: 'application/json' } }).then(async (response) => {
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error((data && data.error) || `Request failed (${response.status})`);
    return data;
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[index]}`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function categoryFor(slug) {
  return state.categories.find((category) => category.slug === slug) || null;
}

function visibleCategories() {
  return state.categories.filter((category) => Number(category.installers) > 0);
}

/* ------------------------------- bootstrapping ---------------------------- */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindStaticEvents();
  $('#year').textContent = String(new Date().getFullYear());

  try {
    const [site, list] = await Promise.all([api('/api/site'), api('/api/installers')]);
    state.site = site.site;
    state.stats = site.stats;
    state.categories = site.categories || [];
    state.installers = list.installers || [];

    applySiteMeta();
    renderStats();
    renderCategories();
    renderFilters();
    syncHeaderCategories();
    renderInstallers(state.installers);
    renderSocials();
  } catch (error) {
    console.error('[ATECH]', error);
    showLoadError();
  }
}

function applySiteMeta() {
  if (!state.site) return;
  const { name, tagline, description } = state.site;
  if (name) document.title = `${name} — ${tagline || 'Installer Hub'}`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta && description) meta.setAttribute('content', description);
  if (description) $('#heroDescription').textContent = description;
}

function renderStats() {
  animateNumber($('#statInstallers'), state.stats.installers || 0);
  animateNumber($('#statDownloads'), state.stats.downloads || 0);
  animateNumber($('#statCategories'), state.stats.categories || state.categories.length || 0);
}

function animateNumber(node, target) {
  const duration = 900;
  const start = performance.now();
  const from = 0;

  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = numberFormat.format(Math.round(from + (target - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }

  if (target === 0) {
    node.textContent = '0';
    return;
  }
  requestAnimationFrame(tick);
}

/* -------------------------------- categories ------------------------------ */

function renderCategories() {
  const grid = $('#categoryGrid');
  const section = document.getElementById('categories');
  const links = document.querySelectorAll('a[href="#categories"]');
  const visible = visibleCategories();
  const show = visible.length >= 2;

  grid.textContent = '';
  if (section) section.hidden = !show;
  links.forEach((link) => {
    link.hidden = !show;
  });

  if (!show) return;

  for (const category of visible) {
    const card = el('button', 'category-card');
    card.type = 'button';
    card.style.setProperty('--cat', category.color);
    card.dataset.category = category.slug;
    card.setAttribute('aria-label', `Ipakita ang ${category.name} installers`);

    const iconBox = el('span', 'cat-icon');
    iconBox.innerHTML = icon(category.icon);

    const title = el('h3', null, category.name);
    const description = el('p', null, category.description || '');
    const foot = el('span', 'cat-foot');
    foot.append(
      el('span', null, `${category.installers} installer${Number(category.installers) === 1 ? '' : 's'}`),
      el('span', 'cat-arrow', '→')
    );

    card.append(iconBox, title, description, foot);
    card.addEventListener('click', () => {
      if (state.category === category.slug) {
        setCategory('all');
      } else {
        setCategory(category.slug);
      }
      document.getElementById('installers').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    grid.append(card);
  }

  syncCategoryCards();
}

function syncCategoryCards() {
  document.querySelectorAll('.category-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.category === state.category);
  });
}

function syncHeaderCategories() {
  document.querySelectorAll('[data-header-category]').forEach((button) => {
    const active = button.dataset.headerCategory === state.category;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

/* --------------------------------- filters -------------------------------- */

function renderFilters() {
  const chips = $('#categoryChips');
  const visible = visibleCategories();
  const show = visible.length >= 2;

  chips.textContent = '';
  chips.hidden = !show;
  if (!show) return;

  const all = el('button', 'chip' + (state.category === 'all' ? ' is-active' : ''), 'Lahat');
  all.type = 'button';
  all.dataset.category = 'all';
  all.addEventListener('click', () => setCategory('all'));
  chips.append(all);

  for (const category of visible) {
    const chip = el('button', 'chip' + (state.category === category.slug ? ' is-active' : ''));
    chip.type = 'button';
    chip.dataset.category = category.slug;
    chip.style.setProperty('--cat', category.color);
    chip.append(el('span', null, category.name), el('span', 'chip-count', String(category.installers)));
    chip.addEventListener('click', () => setCategory(category.slug));
    chips.append(chip);
  }
}

function setCategory(slug) {
  if (state.category === slug) {
    syncCategoryCards();
    return;
  }
  state.category = slug;
  document.querySelectorAll('#categoryChips .chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.category === slug);
  });
  syncHeaderCategories();
  syncCategoryCards();
  updateClearButton();
  loadInstallers();
}

function updateClearButton() {
  const visible = state.category !== 'all' || Boolean(state.q) || state.sort !== 'latest';
  $('#clearFilters').hidden = !visible;
}

let searchTimer = null;

function scheduleSearch(value) {
  state.q = value.trim();
  updateClearButton();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadInstallers, 260);
}

async function loadInstallers() {
  if (state.loading) return;
  state.loading = true;
  renderSkeletons();

  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category && state.category !== 'all') params.set('category', state.category);
  if (state.sort) params.set('sort', state.sort);

  try {
    const data = await api(`/api/installers${params.toString() ? `?${params}` : ''}`);
    state.installers = data.installers || [];
    renderInstallers(state.installers);
  } catch (error) {
    console.error('[ATECH]', error);
    showLoadError();
  } finally {
    state.loading = false;
  }
}

/* ------------------------------- installer UI ----------------------------- */

function renderSkeletons() {
  const grid = $('#installerGrid');
  grid.textContent = '';
  $('#emptyState').hidden = true;
  $('#resultCount').textContent = 'Naglo-load ng installers...';
  for (let index = 0; index < 6; index += 1) {
    grid.append(el('div', 'installer-skeleton'));
  }
}

function renderInstallers(items) {
  const grid = $('#installerGrid');
  grid.textContent = '';
  const empty = $('#emptyState');

  if (!items || items.length === 0) {
    empty.hidden = false;
    const heading = empty.querySelector('h3');
    const paragraph = empty.querySelector('p');
    const category = state.categories.find((item) => item.slug === state.category);

    if (category && !state.q) {
      heading.textContent = `Wala pang installer sa ${category.name}`;
      paragraph.textContent = `Mag-a-appear dito ang ${category.name} installers kapag may na-upload na.`;
      $('#resultCount').textContent = `0 ${category.name} installer`;
    } else {
      heading.textContent = 'Walang nahanap na installer';
      paragraph.textContent = 'Subukan ang ibang keyword o category. Baka wala pa lang naka-upload na installer sa category na ito.';
      $('#resultCount').textContent = '0 installer ang nahanap';
    }
    return;
  }

  empty.hidden = true;
  $('#resultCount').textContent = `${items.length} installer${items.length === 1 ? '' : 's'} ang nahanap`;

  items.forEach((item, index) => {
    grid.append(buildInstallerCard(item, index));
  });
}

function buildInstallerCard(item, index) {
  const category = categoryFor(item.category);
  const color = category ? category.color : '#94a3b8';

  const card = el('article', 'installer-card');
  card.style.setProperty('--cat', color);
  card.style.animationDelay = `${Math.min(index, 8) * 35}ms`;

  if (item.coverUrl) {
    const cover = el('div', 'card-cover');
    const coverImage = el('img');
    coverImage.src = item.coverUrl;
    coverImage.alt = '';
    coverImage.decoding = 'async';
    cover.append(coverImage);
    card.append(cover);
  }

  const top = el('div', 'card-top');
  const iconBox = el('span', 'installer-icon');
  iconBox.innerHTML = icon(category ? category.icon : 'box');
  top.append(iconBox);

  const badge = el('span', 'badge', category ? category.name : 'Installer');
  top.append(badge);

  if (item.featured) {
    const featured = el('span', 'card-featured');
    featured.innerHTML = `${icon('star')} Featured`;
    top.append(featured);
  }

  const title = el('h3', null, item.title);
  const description = el('p', null, item.description || 'Walang description ang installer na ito.');
  const meta = el('ul', 'meta-row');
  if (item.version) meta.append(el('li', null, `v${item.version}`));
  meta.append(el('li', null, formatBytes(item.fileSize)));
  if (item.fileType) meta.append(el('li', null, item.fileType));

  const foot = el('div', 'card-foot');
  const count = el('span', 'download-count');
  count.innerHTML = `${icon('download')} ${numberFormat.format(item.downloads || 0)}`;
  count.title = `${numberFormat.format(item.downloads || 0)} downloads`;

  const actions = el('div', 'card-actions');
  const download = el('a', 'btn btn--primary btn--sm');
  download.href = `/download/${encodeURIComponent(item.slug)}`;
  download.innerHTML = `${icon('download')} Download`;

  const details = el('button', 'icon-btn');
  details.type = 'button';
  details.setAttribute('aria-label', `Tingnan ang detalye ng ${item.title}`);
  details.title = 'Detalye';
  details.innerHTML = icon('info');
  details.addEventListener('click', () => openModal(item));

  actions.append(download, details);
  foot.append(count, actions);

  card.append(top, title, description, meta, foot);
  return card;
}

/* -------------------------------- console UI ------------------------------ */

/* hero console removed */

/* --------------------------------- modal ---------------------------------- */

let lastFocused = null;

function openModal(item) {
  const category = categoryFor(item.category);
  const color = category ? category.color : '#94a3b8';
  const modal = $('#installerModal');

  $('#modalIcon').style.setProperty('--cat', color);
  $('#modalIcon').innerHTML = icon(category ? category.icon : 'box');

  const coverWrap = $('#modalCoverWrap');
  const coverImage = $('#modalCover');
  if (coverWrap && coverImage) {
    if (item.coverUrl) {
      coverImage.src = item.coverUrl;
      coverWrap.hidden = false;
    } else {
      coverImage.removeAttribute('src');
      coverWrap.hidden = true;
    }
  }

  const badge = $('#modalCategory');
  badge.textContent = category ? category.name : 'Installer';
  badge.style.setProperty('--cat', color);

  $('#modalTitle').textContent = item.title;
  $('#modalVersion').textContent = [item.version ? `v${item.version}` : null, item.fileType, formatBytes(item.fileSize)]
    .filter(Boolean)
    .join(' · ');
  $('#modalDescription').textContent = item.description || 'Walang description ang installer na ito.';

  const meta = $('#modalMeta');
  meta.textContent = '';
  const pairs = [
    ['Version', item.version || '—'],
    ['File type', item.fileType || '—'],
    ['File size', formatBytes(item.fileSize)],
    ['Downloads', numberFormat.format(item.downloads || 0)],
    ['Na-upload', formatDate(item.createdAt)],
    ['Category', category ? category.name : '—']
  ];
  for (const [label, value] of pairs) {
    const wrap = el('div');
    wrap.append(el('dt', null, label), el('dd', null, value));
    meta.append(wrap);
  }

  $('#modalDownload').href = `/download/${encodeURIComponent(item.slug)}`;
  $('#modalCopy').dataset.slug = item.slug;

  const guide = $('#modalGuide');
  if (guide) {
    const title = `${item.title || ''} ${item.fileType || ''}`.toLowerCase();
    let anchor = 'minipc';
    if (/apk|android|pisotab/.test(title)) anchor = 'android';
    else if (/orange ?pi|armbian|raspberry/.test(title)) anchor = 'orangepi';
    else if (/\brouter\b|network tool/.test(title)) anchor = 'router';
    guide.href = `/setup#${anchor}`;
  }

  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.modal-close', modal).focus();
}

function closeModal() {
  const modal = $('#installerModal');
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
}

/* -------------------------------- socials --------------------------------- */

function renderSocials() {
  const socials = (state.site && state.site.socials) || {};
  const entries = [
    { key: 'facebook', label: 'Facebook', href: socials.facebook },
    { key: 'telegram', label: 'Telegram', href: socials.telegram },
    { key: 'youtube', label: 'YouTube', href: socials.youtube },
    { key: 'mail', label: 'Email', href: socials.email ? `mailto:${socials.email}` : '' }
  ].filter((entry) => entry.href);

  for (const containerId of ['#socials', '#footerSocials']) {
    const container = $(containerId);
    if (!container) continue;
    container.textContent = '';
    if (entries.length === 0) {
      container.append(el('span', 'footer-note', 'Idadagdag pa lang ang social links.'));
      continue;
    }
    for (const entry of entries) {
      const link = el('a', 'social-link');
      link.href = entry.href;
      link.target = entry.key === 'mail' ? '_self' : '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', entry.label);
      link.title = entry.label;
      link.innerHTML = icon(entry.key);
      container.append(link);
    }
  }
}

/* --------------------------------- helpers -------------------------------- */

function showLoadError() {
  const grid = $('#installerGrid');
  grid.textContent = '';
  const empty = $('#emptyState');
  empty.hidden = false;
  const heading = empty.querySelector('h3');
  const paragraph = empty.querySelector('p');
  if (heading) heading.textContent = 'Hindi ma-load ang mga installer';
  if (paragraph) paragraph.textContent = 'Siguraduhing naka-on ang server at may internet connection, tapos i-refresh ang page.';
  $('#resultCount').textContent = 'Hindi ma-load ang listahan';
  const reset = $('#emptyReset');
  if (reset) reset.textContent = 'I-refresh';
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return new Promise((resolve) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      const ok = document.execCommand('copy');
      resolve(ok);
    } catch {
      resolve(false);
    } finally {
      area.remove();
    }
  });
}

let toastTimer = null;

function showToast(message) {
  const toast = $('#toast');
  $('#toastText').textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => {
      toast.hidden = true;
    }, 250);
  }, 2400);
}

/* --------------------------------- events --------------------------------- */

function bindStaticEvents() {
  const header = $('#siteHeader');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const navToggle = $('#navToggle');
  const nav = $('#mainNav');
  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Isara ang menu' : 'Buksan ang menu');
  });
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  document.querySelectorAll('[data-header-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const slug = button.dataset.headerCategory;
      setCategory(state.category === slug ? 'all' : slug);
      document.getElementById('installers').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const searchInput = $('#searchInput');
  searchInput.addEventListener('input', (event) => scheduleSearch(event.target.value));

  const headerSearch = $('#headerSearch');
  if (headerSearch) {
    headerSearch.addEventListener('click', () => {
      $('#installers').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        searchInput.focus({ preventScroll: true });
        searchInput.select();
      }, 480);
    });
  }

  $('#sortSelect').addEventListener('change', (event) => {
    state.sort = event.target.value;
    updateClearButton();
    loadInstallers();
  });

  $('#clearFilters').addEventListener('click', resetFilters);
  $('#emptyReset').addEventListener('click', () => {
    if ($('#resultCount').textContent === 'Hindi ma-load ang listahan') {
      window.location.reload();
      return;
    }
    resetFilters();
  });

  document.addEventListener('keydown', (event) => {
    const tag = (event.target && event.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable;

    if (event.key === '/' && !typing) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput.focus();
    }

    if (event.key === 'Escape') closeModal();
  });

  document.querySelectorAll('[data-close-modal]').forEach((node) => {
    node.addEventListener('click', closeModal);
  });

  $('#modalCopy').addEventListener('click', async (event) => {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    const url = `${window.location.origin}/download/${slug}`;
    const ok = await copyText(url);
    showToast(ok ? 'Na-copy ang download link.' : 'Hindi na-copy. Subukan ulit.');
  });
}

function resetFilters() {
  state.category = 'all';
  state.q = '';
  state.sort = 'latest';
  $('#searchInput').value = '';
  $('#sortSelect').value = 'latest';
  document.querySelectorAll('#categoryChips .chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.category === 'all');
  });
  syncHeaderCategories();
  syncCategoryCards();
  updateClearButton();
  loadInstallers();
}
