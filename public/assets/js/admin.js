'use strict';

/* ==========================================================================
   ATECH — admin dashboard script
   ========================================================================== */

const ICONS = {
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01M2 8.82a15 15 0 0 1 20 0"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/>',
  box: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  upload: '<path d="M12 19V5m0 0-6 6m6-6 6 6M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.16 3.19M6.61 6.61A17.7 17.7 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/>'
};

const state = {
  installers: [],
  categories: [],
  settings: {},
  overview: null,
  maxUploadMb: 2048,
  activeView: 'overview',
  filters: { q: '', category: 'all', status: 'all' },
  editing: null,
  pendingDelete: null,
  uploading: false,
  settingsLoaded: false
};

const numberFormat = new Intl.NumberFormat('en-PH');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const rounded = size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1);
  return `${rounded} ${units[index]}`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const then = new Date(isoString).getTime();
  if (!Number.isFinite(then)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 1) return 'ngayon lang';
  if (minutes < 60) return `${minutes} min ang nakalipas`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} oras ang nakalipas`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} araw ang nakalipas`;
  return formatDate(isoString);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  let body = options.body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, { ...options, headers, body });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error((data && data.error) || `Hindi nagtagumpay ang request (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/* ---------------------------------- boot ---------------------------------- */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  $('#loginYear').textContent = String(new Date().getFullYear());
  bindEvents();

  try {
    const session = await api('/api/admin/session');
    if (session.authenticated) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  document.body.style.overflow = '';
  closeUploadModal();
  $('#loginError').hidden = true;
  const password = $('#loginPassword');
  password.value = '';
  setTimeout(() => password.focus(), 120);
}

async function showDashboard() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  await loadData();
}

async function loadData() {
  try {
    const [overview, list, settings] = await Promise.all([
      api('/api/admin/overview'),
      api('/api/admin/installers'),
      api('/api/admin/settings')
    ]);
    state.overview = overview;
    state.installers = list.installers || [];
    state.settings = settings.settings || {};
    state.categories = settings.categories || [];
    state.maxUploadMb = settings.maxUploadMb || 2048;

    renderStats();
    renderChart();
    renderBreakdown();
    renderRecent();
    renderTop();
    renderInstallerTable();
    renderNavCount();
    renderCategoryOptions();
    fillSettingsForm();
    $('#infoMaxUpload').textContent = `${state.maxUploadMb} MB`;
    $('#infoNode').textContent = settings.runtime || 'Node.js';
  } catch (error) {
    handleApiError(error);
  }
}

async function refreshData() {
  try {
    const [overview, list] = await Promise.all([api('/api/admin/overview'), api('/api/admin/installers')]);
    state.overview = overview;
    state.installers = list.installers || [];
    renderStats();
    renderChart();
    renderBreakdown();
    renderRecent();
    renderTop();
    renderInstallerTable();
    renderNavCount();
  } catch (error) {
    handleApiError(error);
  }
}

function handleApiError(error) {
  if (error.status === 401) {
    showLogin();
    toast('Nag-expire ang session. Mag-login ulit.', 'error');
    return;
  }
  toast(error.message || 'May error na nangyari.', 'error');
}

/* -------------------------------- overview -------------------------------- */

function renderStats() {
  const totals = (state.overview && state.overview.totals) || {};
  const daily = (state.overview && state.overview.daily) || [];
  const today = daily.length ? daily[daily.length - 1].total : 0;
  const week = daily.reduce((sum, day) => sum + Number(day.total || 0), 0);

  $('#statTotal').textContent = numberFormat.format(totals.installers || 0);
  $('#statDownloads').textContent = numberFormat.format(totals.downloads || 0);
  $('#statStorage').textContent = formatBytes(totals.storage || 0);
  $('#statWeek').textContent = numberFormat.format(week);
  $('#statPublishedTag').textContent = `${totals.published || 0} live`;
  $('#statDrafts').textContent = `${totals.drafts || 0} draft`;
  $('#statDailyTag').textContent = `+${today} ngayon`;
  $('#statFileCount').textContent = `${totals.installers || 0} file${Number(totals.installers) === 1 ? '' : 's'}`;
  $('#storageUsed').textContent = formatBytes(totals.storage || 0);
  $('#chartTotal').textContent = `${numberFormat.format(week)} total`;
}

function renderChart() {
  const chart = $('#downloadChart');
  chart.textContent = '';
  const daily = (state.overview && state.overview.daily) || [];

  if (daily.length === 0) {
    chart.append(el('p', 'list-empty', 'Wala pang download data.'));
    return;
  }

  const max = Math.max(1, ...daily.map((day) => Number(day.total) || 0));

  daily.forEach((day, index) => {
    const column = el('div', 'chart-col' + (index === daily.length - 1 ? ' is-today' : ''));
    const value = el('span', 'chart-value', numberFormat.format(day.total || 0));
    const bar = el('div', 'chart-bar');
    const fill = el('i');
    const ratio = Number(day.total) / max;
    fill.style.height = `${Math.max(ratio * 100, day.total > 0 ? 8 : 2)}%`;
    bar.append(fill);

    const label = el('span', 'chart-label');
    const date = new Date(`${day.date}T00:00:00Z`);
    label.textContent = Number.isNaN(date.getTime())
      ? day.date
      : date.toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'UTC' });

    column.title = `${day.date}: ${numberFormat.format(day.total || 0)} downloads`;
    column.append(value, bar, label);
    chart.append(column);
  });
}

function renderBreakdown() {
  const list = $('#categoryBreakdown');
  list.textContent = '';
  const categories = (state.overview && state.overview.categories) || [];
  const max = Math.max(1, ...categories.map((category) => Number(category.installers) || 0));

  if (categories.length === 0) {
    list.append(el('li', 'list-empty', 'Wala pang categories.'));
    return;
  }

  for (const category of categories) {
    const item = el('li');
    item.style.setProperty('--cat', category.color);

    const dot = el('span', 'bd-dot');
    const name = el('span', 'bd-name', category.name);
    const count = el('span', 'bd-count', `${category.installers} file${Number(category.installers) === 1 ? '' : 's'} · ${category.downloads} dl`);
    const bar = el('div', 'bd-bar');
    const fill = el('i');
    fill.style.width = `${(Number(category.installers) / max) * 100}%`;
    bar.append(fill);

    item.append(dot, name, count, bar);
    list.append(item);
  }
}

function renderRecent() {
  const list = $('#recentList');
  list.textContent = '';
  const recent = (state.overview && state.overview.recent) || [];

  if (recent.length === 0) {
    list.append(el('li', 'list-empty', 'Wala pang download activity.'));
    return;
  }

  for (const entry of recent) {
    const item = el('li');
    const iconBox = el('span', 'activity-icon');
    iconBox.innerHTML = icon('download');

    const body = el('div', 'activity-body');
    body.append(el('strong', null, entry.title), el('span', null, timeAgo(entry.at)));

    item.append(iconBox, body, el('span', 'activity-type', String(entry.file_ext || 'file').replace('.', '').toUpperCase()));
    list.append(item);
  }
}

function renderTop() {
  const list = $('#topList');
  list.textContent = '';
  const top = (state.overview && state.overview.top) || [];

  if (top.length === 0) {
    list.append(el('li', 'list-empty', 'Wala pang installer.'));
    return;
  }

  top.forEach((entry, index) => {
    const item = el('li');
    item.append(
      el('span', 'rank', String(index + 1)),
      el('span', 'top-name', entry.title),
      el('span', 'top-count', `${numberFormat.format(entry.downloads || 0)} dl`)
    );
    item.title = entry.title;
    list.append(item);
  });
}

/* -------------------------------- table ----------------------------------- */

function getCategory(slug) {
  return state.categories.find((category) => category.slug === slug) || null;
}

function filteredInstallers() {
  const { q, category, status } = state.filters;
  const search = q.trim().toLowerCase();

  return state.installers.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (status === 'published' && !item.published) return false;
    if (status === 'draft' && item.published) return false;
    if (status === 'demo' && !item.isDemo) return false;
    if (!search) return true;
    return [item.title, item.slug, item.description, item.originalName, item.version]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
}

function renderInstallerTable() {
  const tbody = $('#installerRows');
  tbody.textContent = '';
  const items = filteredInstallers();
  const empty = $('#installersEmpty');
  const tableWrap = $('.table-wrap');

  $('#tableCount').textContent = `${items.length} of ${state.installers.length} file${state.installers.length === 1 ? '' : 's'}`;

  if (items.length === 0) {
    empty.hidden = false;
    tableWrap.hidden = true;

    if (state.installers.length === 0) {
      empty.querySelector('h3').textContent = 'Wala pang installer';
      empty.querySelector('p').textContent = 'I-upload ang unang installer file mo para lumabas ito sa public site.';
    } else {
      empty.querySelector('h3').textContent = 'Walang tugmang installer';
      empty.querySelector('p').textContent = 'Subukan ang ibang search keyword o filter.';
    }
    return;
  }

  empty.hidden = true;
  tableWrap.hidden = false;

  for (const item of items) {
    const category = getCategory(item.category);
    const color = category ? category.color : '#94a3b8';

    const row = el('tr');

    const cellInstaller = el('td');
    const wrap = el('div', 'cell-installer');
    const cellIcon = el('span', 'cell-icon');
    cellIcon.style.setProperty('--cat', color);
    cellIcon.innerHTML = icon(category ? category.icon : 'box');
    const text = el('div', 'cell-text');
    const title = el('strong', null, item.title);
    title.title = item.title;
    const meta = el('span', null, `${item.isDemo ? 'Sample · ' : ''}${item.originalName || item.slug}${item.version ? ` · v${item.version}` : ''}`);
    meta.title = item.originalName || item.slug;
    text.append(title, meta);
    wrap.append(cellIcon, text);
    cellInstaller.append(wrap);

    const cellCategory = el('td');
    const badge = el('span', 'cell-badge', category ? category.name : item.category);
    badge.style.setProperty('--cat', color);
    cellCategory.append(badge);

    const cellSize = el('td', 'cell-mono', formatBytes(item.fileSize));
    const cellDownloads = el('td', 'cell-mono', numberFormat.format(item.downloads || 0));

    const cellStatus = el('td');
    const statusBtn = el('button', 'status-pill' + (item.published ? ' is-live' : ''));
    statusBtn.type = 'button';
    statusBtn.title = item.published ? 'I-draft (itago sa site)' : 'I-publish (ipakita sa site)';
    const dot = el('i');
    statusBtn.append(dot, document.createTextNode(item.isDemo ? 'sample' : item.published ? 'live' : 'draft'));
    statusBtn.addEventListener('click', () => togglePublished(item, statusBtn));
    cellStatus.append(statusBtn);

    const cellUpdated = el('td', 'cell-mono', timeAgo(item.updatedAt || item.createdAt));
    cellUpdated.title = formatDate(item.updatedAt || item.createdAt);

    const cellActions = el('td');
    const actions = el('div', 'row-actions');
    const editBtn = el('button', 'icon-btn');
    editBtn.type = 'button';
    editBtn.title = 'I-edit';
    editBtn.setAttribute('aria-label', `I-edit ang ${item.title}`);
    editBtn.innerHTML = icon('edit');
    editBtn.addEventListener('click', () => openUploadModal(item));

    const deleteBtn = el('button', 'icon-btn icon-btn--danger');
    deleteBtn.type = 'button';
    deleteBtn.title = 'I-delete';
    deleteBtn.setAttribute('aria-label', `I-delete ang ${item.title}`);
    deleteBtn.innerHTML = icon('trash');
    deleteBtn.addEventListener('click', () => openConfirm(item));

    actions.append(editBtn, deleteBtn);
    cellActions.append(actions);

    row.append(cellInstaller, cellCategory, cellSize, cellDownloads, cellStatus, cellUpdated, cellActions);
    tbody.append(row);
  }
}

function renderNavCount() {
  $('#navInstallerCount').textContent = String(state.installers.length);
}

function renderCategoryOptions() {
  const filter = $('#adminCategoryFilter');
  const field = $('#fieldCategory');
  const currentFilter = filter.value || 'all';
  const currentField = field.value;

  filter.textContent = '';
  const all = el('option', null, 'Lahat ng category');
  all.value = 'all';
  filter.append(all);

  field.textContent = '';
  const placeholder = el('option', null, 'Pumili ng category');
  placeholder.value = '';
  field.append(placeholder);

  for (const category of state.categories) {
    const option = el('option', null, category.name);
    option.value = category.slug;
    filter.append(option);

    const uploadOption = el('option', null, category.name);
    uploadOption.value = category.slug;
    field.append(uploadOption);
  }

  filter.value = state.categories.some((category) => category.slug === currentFilter) ? currentFilter : 'all';
  if (currentField) field.value = currentField;
}

async function togglePublished(item, button) {
  button.disabled = true;
  try {
    const result = await api(`/api/admin/installers/${item.id}`, {
      method: 'PATCH',
      body: { published: !item.published }
    });
    Object.assign(item, result.installer);
    renderInstallerTable();
    toast(item.published ? 'Naka-publish na ang installer.' : 'Naka-draft na ang installer.');
    await refreshData();
  } catch (error) {
    handleApiError(error);
  } finally {
    button.disabled = false;
  }
}

/* -------------------------------- settings -------------------------------- */

function fillSettingsForm() {
  const form = $('#settingsForm');
  for (const [key, value] of Object.entries(state.settings)) {
    const field = form.elements.namedItem(key);
    if (field) field.value = value || '';
  }
  state.settingsLoaded = true;
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#saveSettingsBtn');
  const errorBox = $('#settingsError');
  errorBox.hidden = true;

  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = value;
  });

  button.disabled = true;
  button.textContent = 'Sinasave...';

  try {
    await api('/api/admin/settings', { method: 'PUT', body: data });
    state.settings = { ...state.settings, ...data };
    toast('Na-save ang site settings.');
  } catch (error) {
    errorBox.hidden = false;
    errorBox.querySelector('span').textContent = error.message;
    if (error.status === 401) handleApiError(error);
  } finally {
    button.disabled = false;
    button.textContent = 'I-save ang settings';
  }
}

/* ------------------------------- navigation ------------------------------- */

const VIEW_META = {
  overview: {
    title: 'Overview',
    subtitle: 'Mga numero ng site mo ngayon.'
  },
  installers: {
    title: 'Installers',
    subtitle: 'I-upload, i-edit at i-manage ang lahat ng files.'
  },
  settings: {
    title: 'Settings',
    subtitle: 'Branding at contact links ng public site.'
  }
};

function switchView(view) {
  if (!VIEW_META[view]) return;
  state.activeView = view;

  $$('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));

  $('#viewTitle').textContent = VIEW_META[view].title;
  $('#viewSubtitle').textContent = VIEW_META[view].subtitle;
  document.title = `${VIEW_META[view].title} — ATECH Admin`;

  if (view === 'settings' && !state.settingsLoaded) fillSettingsForm();
  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSidebar() {
  $('#appView').classList.add('sidebar-open');
  $('#sidebarOverlay').hidden = false;
}

function closeSidebar() {
  $('#appView').classList.remove('sidebar-open');
  $('#sidebarOverlay').hidden = true;
}

/* --------------------------------- modal ---------------------------------- */

function openUploadModal(item = null) {
  state.editing = item || null;
  const form = $('#uploadForm');
  form.reset();
  $('#fileInput').value = '';
  $('#uploadError').hidden = true;
  $('#uploadProgress').hidden = true;
  $('#uploadBar').style.width = '0%';
  $('#uploadPercent').textContent = '0%';
  $('#dropzone').classList.remove('has-file', 'is-dragover');
  $('#dropzoneFile').hidden = true;
  $('#dropzoneFile').textContent = '';

  if (item) {
    $('#uploadModalTitle').textContent = 'I-edit ang installer';
    $('#uploadModalSubtitle').textContent = 'I-update ang details o palitan ang file.';
    $('#dropzoneTitle').textContent = 'Palitan ang file (optional)';
    $('#dropzoneHint').textContent = 'Iwan blank kung hindi papalitan ang kasalukuyang file';
    $('#fieldTitle').value = item.title || '';
    $('#fieldCategory').value = item.category || '';
    $('#fieldVersion').value = item.version || '';
    $('#fieldDescription').value = item.description || '';
    $('#fieldSlug').value = item.slug || '';
    $('#fieldPublished').checked = Boolean(item.published);
    $('#fieldFeatured').checked = Boolean(item.featured);
    $('#uploadSubmit').querySelector('span').textContent = 'I-save ang changes';

    if (item.originalName) {
      const fileChip = $('#dropzoneFile');
      fileChip.hidden = false;
      fileChip.textContent = `Kasalukuyan: ${item.originalName} (${formatBytes(item.fileSize)})`;
    }
  } else {
    $('#uploadModalTitle').textContent = 'Bagong installer';
    $('#uploadModalSubtitle').textContent = 'I-upload ang file at punan ang details.';
    $('#dropzoneTitle').textContent = 'I-drop ang installer dito';
    $('#dropzoneHint').textContent = `o i-click para pumili ng file · max ${state.maxUploadMb} MB`;
    $('#fieldCategory').value = '';
    $('#fieldPublished').checked = true;
    $('#fieldFeatured').checked = false;
    $('#uploadSubmit').querySelector('span').textContent = 'I-upload';
  }

  $('#uploadSubmit').disabled = false;
  $('#uploadSubmit').querySelector('span').textContent = state.editing ? 'I-save ang changes' : 'I-upload';
  $('#uploadModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#fieldTitle').focus(), 100);
}

function closeUploadModal() {
  if (state.uploading) return;
  $('#uploadModal').hidden = true;
  state.editing = null;
  if ($('#confirmModal').hidden) document.body.style.overflow = '';
}

function setUploadError(message) {
  const box = $('#uploadError');
  box.hidden = false;
  box.querySelector('span').textContent = message;
}

function handleSelectedFile(file) {
  if (!file) return;
  const sizeMb = file.size / (1024 * 1024);
  const allowed = /\.(apk|apks|xapk|apkm|aab|obb|exe|msi|msix|msixbundle|appx|appxbundle|cab|zip|zipx|rar|7z|tar|gz|tgz|bz2|tbz2|xz|zst|lz|lzma|z|gzip|iso|img|bin|dmg|pkg|deb|run|apkg|pdf)$/i.test(file.name)
    || /\.(r\d{2}|z\d{2}|\d{3})$/i.test(file.name);

  if (!allowed) {
    setUploadError('Hindi supported ang file type na ito. Gumamit ng APK/APKS, EXE/MSI/MSIX, ZIP/RAR/7Z/XZ at split archives (.001, .r00, .z01).');
    $('#fileInput').value = '';
    $('#dropzone').classList.remove('has-file');
    $('#dropzoneFile').hidden = true;
    return;
  }

  if (sizeMb > state.maxUploadMb) {
    setUploadError(`Sobrang laki ng file (${formatBytes(file.size)}). Maximum na ${state.maxUploadMb} MB.`);
    $('#fileInput').value = '';
    $('#dropzone').classList.remove('has-file');
    $('#dropzoneFile').hidden = true;
    return;
  }

  $('#uploadError').hidden = true;
  $('#dropzone').classList.add('has-file');
  const chip = $('#dropzoneFile');
  chip.hidden = false;
  chip.textContent = `${file.name} · ${formatBytes(file.size)}`;
}

function uploadWithProgress(url, method, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = 'json';

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });

    xhr.addEventListener('load', () => {
      let data = xhr.response;
      if (!data) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const error = new Error((data && data.error) || `Hindi na-upload ang file (${xhr.status}).`);
        error.status = xhr.status;
        reject(error);
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Nawala ang koneksyon habang nag-upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Kinansela ang upload.')));
    xhr.send(formData);
  });
}

async function submitUpload(event) {
  event.preventDefault();
  if (state.uploading) return;

  const editing = state.editing;
  const title = $('#fieldTitle').value.trim();
  const category = $('#fieldCategory').value;
  const file = $('#fileInput').files[0];

  $('#uploadError').hidden = true;

  if (title.length < 3) {
    setUploadError('Ilagay ang pangalan ng installer (3 characters pataas).');
    $('#fieldTitle').focus();
    return;
  }

  if (!category) {
    setUploadError('Pumili ng category para sa installer.');
    $('#fieldCategory').focus();
    return;
  }

  if (!editing && !file) {
    setUploadError('Pumili ng installer file na i-upload.');
    $('#dropzone').classList.add('is-dragover');
    setTimeout(() => $('#dropzone').classList.remove('is-dragover'), 900);
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('version', $('#fieldVersion').value.trim());
  formData.append('description', $('#fieldDescription').value.trim());
  formData.append('slug', $('#fieldSlug').value.trim());
  formData.append('published', $('#fieldPublished').checked ? '1' : '0');
  formData.append('featured', $('#fieldFeatured').checked ? '1' : '0');
  if (file) formData.append('file', file);

  state.uploading = true;
  const submit = $('#uploadSubmit');
  const label = submit.querySelector('span');
  const originalLabel = label.textContent;
  submit.disabled = true;
  label.textContent = 'Nag-upload...';
  $('#uploadProgress').hidden = false;

  try {
    const result = await uploadWithProgress(
      editing ? `/api/admin/installers/${editing.id}` : '/api/admin/installers',
      editing ? 'PATCH' : 'POST',
      formData,
      (progress) => {
        const percent = Math.max(1, Math.min(100, Math.round(progress * 100)));
        $('#uploadBar').style.width = `${percent}%`;
        $('#uploadPercent').textContent = `${percent}%`;
      }
    );

    state.uploading = false;
    $('#uploadModal').hidden = true;
    document.body.style.overflow = '';
    state.editing = null;
    toast(editing ? 'Na-update ang installer.' : 'Nai-upload ang bagong installer.');
    await refreshData();
    void result;
  } catch (error) {
    state.uploading = false;
    setUploadError(error.message);
    if (error.status === 401) handleApiError(error);
  } finally {
    state.uploading = false;
    submit.disabled = false;
    label.textContent = originalLabel;
    $('#uploadProgress').hidden = true;
    $('#uploadBar').style.width = '0%';
  }
}

/* --------------------------------- delete --------------------------------- */

function openConfirm(item) {
  state.pendingDelete = item;
  $('#confirmText').textContent = `Mabubura ang "${item.title}" at ang file nito (${formatBytes(item.fileSize)}). Hindi na ito maibabalik.`;
  $('#confirmModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#confirmDeleteBtn').focus(), 100);
}

function closeConfirm() {
  $('#confirmModal').hidden = true;
  state.pendingDelete = null;
  if ($('#uploadModal').hidden) document.body.style.overflow = '';
}

async function deleteInstaller() {
  const item = state.pendingDelete;
  if (!item) return;
  const button = $('#confirmDeleteBtn');
  button.disabled = true;
  button.textContent = 'Binubura...';

  try {
    await api(`/api/admin/installers/${item.id}`, { method: 'DELETE' });
    closeConfirm();
    toast('Nabura ang installer at ang file nito.');
    await refreshData();
  } catch (error) {
    handleApiError(error);
  } finally {
    button.disabled = false;
    button.textContent = 'Oo, i-delete';
  }
}

/* ----------------------------- change password ----------------------------- */

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#savePasswordBtn');
  const errorBox = $('#passwordError');
  errorBox.hidden = true;

  const current = $('#currentPassword').value;
  const next = $('#newPassword').value;
  const confirm = $('#confirmPassword').value;

  const fail = (message) => {
    errorBox.hidden = false;
    errorBox.querySelector('span').textContent = message;
  };

  if (!current) return fail('Ilagay ang current password.');
  if (next.length < 10) return fail('Minimum 10 characters ang bagong password.');
  if (/\s/.test(next)) return fail('Walang spaces ang password.');
  if (next === current) return fail('Dapat iba ang bagong password sa current password.');
  if (next !== confirm) return fail('Hindi tugma ang confirm password.');

  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Sinasave...';

  try {
    await api('/api/admin/change-password', {
      method: 'POST',
      body: { currentPassword: current, newPassword: next, confirmPassword: confirm }
    });
    form.reset();
    toast('Napalitan ang password ng admin.');
  } catch (error) {
    if (error.status === 401) {
      handleApiError(error);
    } else {
      fail(error.message);
    }
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

/* ---------------------------------- toast --------------------------------- */

function toast(message, type = 'success') {
  const stack = $('#toastStack');
  const item = el('div', `toast-item toast-item--${type}`);
  const symbol = el('span');
  symbol.innerHTML = icon(type === 'error' ? 'alert' : 'check');
  item.append(symbol, el('span', null, message));
  stack.append(item);

  while (stack.children.length > 4) stack.firstElementChild.remove();

  setTimeout(() => {
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 240);
  }, 3400);
}

/* --------------------------------- events --------------------------------- */

function bindEvents() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#loginPassword').value;
    const button = $('#loginBtn');
    const errorBox = $('#loginError');

    errorBox.hidden = true;
    if (!password) {
      errorBox.hidden = false;
      $('#loginErrorText').textContent = 'Ilagay ang admin password.';
      return;
    }

    button.disabled = true;
    const label = button.querySelector('span');
    label.textContent = 'Naglo-login...';

    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      $('#loginPassword').value = '';
      showDashboard();
    } catch (error) {
      errorBox.hidden = false;
      $('#loginErrorText').textContent = error.message;
      $('#loginPassword').select();
    } finally {
      button.disabled = false;
      label.textContent = 'Mag-login';
    }
  });

  $('#togglePassword').addEventListener('click', () => {
    const input = $('#loginPassword');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('#togglePassword').setAttribute('aria-pressed', String(show));
    $('#togglePassword').setAttribute('aria-label', show ? 'Itago ang password' : 'Ipakita ang password');
    $('#togglePassword').innerHTML = icon(show ? 'eyeOff' : 'eye');
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    toast('Naka-logout ka na.');
    showLogin();
  });

  $$('.nav-item').forEach((item) => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  $$('[data-go-view]').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.goView));
  });

  $('#menuBtn').addEventListener('click', openSidebar);
  $('#sidebarOverlay').addEventListener('click', closeSidebar);

  $('#newUploadBtn').addEventListener('click', () => openUploadModal());
  $('#quickUploadBtn').addEventListener('click', () => openUploadModal());
  $('#tableUploadBtn').addEventListener('click', () => openUploadModal());
  $('#emptyUploadBtn').addEventListener('click', () => openUploadModal());

  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#passwordForm').addEventListener('submit', changePassword);

  $('#adminSearch').addEventListener('input', (event) => {
    state.filters.q = event.target.value;
    renderInstallerTable();
  });

  $('#adminCategoryFilter').addEventListener('change', (event) => {
    state.filters.category = event.target.value;
    renderInstallerTable();
  });

  $('#adminStatusFilter').addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    renderInstallerTable();
  });

  $('#fileInput').addEventListener('change', (event) => {
    handleSelectedFile(event.target.files[0]);
  });

  const dropzone = $('#dropzone');
  ['dragenter', 'dragover'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    $('#fileInput').files = transfer.files;
    handleSelectedFile(file);
  });

  $('#uploadForm').addEventListener('submit', submitUpload);

  $$('[data-close-upload]').forEach((node) => node.addEventListener('click', closeUploadModal));
  $$('[data-close-confirm]').forEach((node) => node.addEventListener('click', closeConfirm));
  $('#confirmDeleteBtn').addEventListener('click', deleteInstaller);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#uploadModal').hidden) {
      closeUploadModal();
    } else if (!$('#confirmModal').hidden) {
      closeConfirm();
    } else {
      closeSidebar();
    }
  });
}
