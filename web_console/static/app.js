const APP_CONFIG = window.__APP_CONFIG__ || {};
const T = APP_CONFIG.translations || {};

const state = {
  credentials: [],
  proxies: [],
  tasks: [],
  schedules: [],
  apiKeys: [],
  defaults: {},
  dashboard: {},
  platforms: {},
  selectedTaskId: null,
  taskFilterStatus: 'all',
};

const sections = Array.from(document.querySelectorAll('.section-card'));
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const appShell = document.getElementById('app-shell');
const sectionIndicator = document.getElementById('section-indicator');
const sidebarToggle = document.getElementById('sidebar-toggle');
const mobileNavButton = document.getElementById('mobile-nav-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const SIDEBAR_STORAGE_KEY = 'mregister-sidebar-collapsed';

function tr(key, vars = {}) {
  let value = T[key] || key;
  Object.entries(vars).forEach(([name, replacement]) => {
    value = value.replaceAll(`{${name}}`, String(replacement));
  });
  return value;
}

function statusLabel(status) {
  return T[`status_${status}`] || status;
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 960px)').matches;
}

function setSidebarCollapsed(collapsed) {
  if (!appShell) {
    return;
  }
  appShell.classList.toggle('sidebar-collapsed', collapsed);
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
}

function setSidebarOpen(open) {
  if (!appShell) {
    return;
  }
  appShell.classList.toggle('sidebar-open', open);
}

function closeMobileSidebar() {
  if (isMobileLayout()) {
    setSidebarOpen(false);
  }
}

function syncSectionIndicator(button) {
  if (!sectionIndicator || !button) {
    return;
  }
  sectionIndicator.textContent = button.dataset.label || button.textContent.trim();
}

function showSection(sectionId) {
  sections.forEach((section) => {
    section.classList.toggle('active', section.id === `section-${sectionId}`);
  });
  navButtons.forEach((button) => {
    const active = button.dataset.section === sectionId;
    button.classList.toggle('active', active);
    if (active) {
      syncSectionIndicator(button);
    }
  });
  closeMobileSidebar();
}

function initChrome() {
  if (!appShell) {
    return;
  }

  const storedCollapsed = window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  if (!isMobileLayout()) {
    setSidebarCollapsed(storedCollapsed);
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      if (isMobileLayout()) {
        setSidebarOpen(true);
      } else {
        setSidebarCollapsed(!appShell.classList.contains('sidebar-collapsed'));
      }
    });
  }

  if (mobileNavButton) {
    mobileNavButton.addEventListener('click', () => {
      setSidebarOpen(true);
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      setSidebarOpen(false);
    });
  }

  window.addEventListener('resize', () => {
    if (isMobileLayout()) {
      appShell.classList.remove('sidebar-collapsed');
    } else {
      setSidebarOpen(false);
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');
    }
  });
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => showSection(button.dataset.section));
});

function handleUnauthorized() {
  window.location.reload();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (response.status === 401 || response.status === 403) {
    handleUnauthorized();
    throw new Error(tr('request_failed'));
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: tr('request_failed') }));
    throw new Error(data.detail || tr('request_failed'));
  }

  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response;
}

function formToObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach((key) => {
    if (data[key] === '') {
      data[key] = null;
    }
  });
  return data;
}

function setOptions(select, items, emptyLabel, selectedValue = null) {
  const options = [`<option value="">${emptyLabel}</option>`];
  items.forEach((item) => {
    options.push(`<option value="${item.id}">${item.name}</option>`);
  });
  select.innerHTML = options.join('');
  if (selectedValue !== null && selectedValue !== undefined) {
    select.value = String(selectedValue);
  }
}

function syncCredentialForm() {
  const kind = document.getElementById('credential-kind');
  if (!kind) {
    return;
  }
  const isMail = kind.value === 'gptmail';
  document.getElementById('base-url-field').style.display = isMail ? 'grid' : 'none';
  document.getElementById('prefix-field').style.display = isMail ? 'grid' : 'none';
  document.getElementById('domain-field').style.display = isMail ? 'grid' : 'none';
}

function syncTaskForm() {
  const platformSelect = document.getElementById('platform-select');
  if (!platformSelect) {
    return;
  }
  const spec = state.platforms[platformSelect.value];
  if (!spec) {
    return;
  }
  document.getElementById('email-select-field').style.display = spec.requires_email_credential ? 'grid' : 'none';
  document.getElementById('captcha-select-field').style.display = spec.requires_captcha_credential ? 'grid' : 'none';
  document.getElementById('concurrency-field').style.display = 'grid';
  document.getElementById('proxy-select-field').style.display =
    document.getElementById('proxy-mode-select').value === 'custom' && spec.supports_proxy ? 'grid' : 'none';
}

function renderDashboard() {
  const metrics = document.getElementById('dashboard-metrics');
  if (!metrics) {
    return;
  }

  const data = state.dashboard || {};
  metrics.innerHTML = `
    <article class="metric-card"><strong>${data.running_tasks || 0}</strong><span>${tr('dashboard_running_tasks')}</span></article>
    <article class="metric-card"><strong>${data.completed_tasks || 0}</strong><span>${tr('dashboard_completed_tasks')}</span></article>
    <article class="metric-card"><strong>${data.credential_count || 0}</strong><span>${tr('dashboard_credential_count')}</span></article>
    <article class="metric-card"><strong>${data.proxy_count || 0}</strong><span>${tr('dashboard_proxy_count')}</span></article>
  `;

  const recent = document.getElementById('dashboard-tasks');
  const tasks = data.recent_tasks || [];
  recent.innerHTML = tasks.length ? tasks.map((task) => `
    <button class="simple-row" data-task-id="${task.id}">
      <span>${task.name}</span>
      <span>${task.results_count}/${task.quantity} | ${statusLabel(task.status)}</span>
    </button>
  `).join('') : `<p class="empty">${tr('empty_tasks')}</p>`;

  recent.querySelectorAll('[data-task-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTaskId = Number(button.dataset.taskId);
      showSection('task-detail');
      renderTaskDetail();
    });
  });
}

function renderDefaults() {
  const mailCredentials = state.credentials.filter((item) => item.kind === 'gptmail');
  const captchaCredentials = state.credentials.filter((item) => item.kind === 'yescaptcha');

  setOptions(
    document.getElementById('default-gptmail'),
    mailCredentials,
    tr('no_default_gptmail'),
    state.defaults.default_gptmail_credential_id,
  );
  setOptions(
    document.getElementById('default-yescaptcha'),
    captchaCredentials,
    tr('no_default_yescaptcha'),
    state.defaults.default_yescaptcha_credential_id,
  );
  setOptions(
    document.getElementById('default-proxy'),
    state.proxies,
    tr('no_default_proxy'),
    state.defaults.default_proxy_id,
  );
}

async function saveDefaults(partial) {
  const payload = {
    default_gptmail_credential_id: state.defaults.default_gptmail_credential_id || null,
    default_yescaptcha_credential_id: state.defaults.default_yescaptcha_credential_id || null,
    default_proxy_id: state.defaults.default_proxy_id || null,
    ...partial,
  };
  await api('/api/defaults', { method: 'POST', body: JSON.stringify(payload) });
}

function renderCredentialsList() {
  const list = document.getElementById('credentials-list');
  const template = document.getElementById('entity-template');
  list.innerHTML = '';

  state.credentials.forEach((item) => {
    const node = template.content.cloneNode(true);
    const isDefault = item.kind === 'gptmail'
      ? state.defaults.default_gptmail_credential_id === item.id
      : state.defaults.default_yescaptcha_credential_id === item.id;

    node.querySelector('h3').textContent = item.name;
    node.querySelector('.meta').textContent = `${item.kind} | ${tr('created_at', { value: item.created_at })}${isDefault ? ` | ${tr('default_badge')}` : ''}`;
    node.querySelector('.notes').textContent = item.notes || '';

    const actions = node.querySelector('.entity-actions');

    const setDefaultButton = document.createElement('button');
    setDefaultButton.type = 'button';
    setDefaultButton.textContent = isDefault ? tr('current_default') : tr('set_default');
    setDefaultButton.disabled = isDefault;
    setDefaultButton.addEventListener('click', async () => {
      if (item.kind === 'gptmail') {
        await saveDefaults({ default_gptmail_credential_id: item.id });
      } else {
        await saveDefaults({ default_yescaptcha_credential_id: item.id });
      }
      await refreshState();
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = tr('delete');
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm(tr('delete_credential_confirm', { name: item.name }))) {
        return;
      }
      await api(`/api/credentials/${item.id}`, { method: 'DELETE' });
      await refreshState();
    });

    actions.append(setDefaultButton, deleteButton);
    list.appendChild(node);
  });

  if (!state.credentials.length) {
    list.innerHTML = `<p class="empty">${tr('empty_credentials')}</p>`;
  }
}

function renderProxyList() {
  const list = document.getElementById('proxy-list');
  const template = document.getElementById('entity-template');
  list.innerHTML = '';

  state.proxies.forEach((item) => {
    const node = template.content.cloneNode(true);
    const isDefault = state.defaults.default_proxy_id === item.id;

    node.querySelector('h3').textContent = item.name;
    node.querySelector('.meta').textContent = `${item.proxy_url}${isDefault ? ` | ${tr('default_badge')}` : ''}`;
    node.querySelector('.notes').textContent = item.notes || '';

    const actions = node.querySelector('.entity-actions');

    const setDefaultButton = document.createElement('button');
    setDefaultButton.type = 'button';
    setDefaultButton.textContent = isDefault ? tr('current_default') : tr('set_default');
    setDefaultButton.disabled = isDefault;
    setDefaultButton.addEventListener('click', async () => {
      await saveDefaults({ default_proxy_id: item.id });
      await refreshState();
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = tr('delete');
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm(tr('delete_proxy_confirm', { name: item.name }))) {
        return;
      }
      await api(`/api/proxies/${item.id}`, { method: 'DELETE' });
      await refreshState();
    });

    actions.append(setDefaultButton, deleteButton);
    list.appendChild(node);
  });

  if (!state.proxies.length) {
    list.innerHTML = `<p class="empty">${tr('empty_proxies')}</p>`;
  }
}

function getFilteredTasks() {
  if (state.taskFilterStatus === 'all') {
    return state.tasks;
  }
  return state.tasks.filter((task) => task.status === state.taskFilterStatus);
}

function renderTasksSidebar() {
  const wrap = document.getElementById('task-list');
  const tasks = getFilteredTasks();
  wrap.innerHTML = tasks.length ? tasks.map((task) => `
    <button class="task-side-item ${state.selectedTaskId === task.id ? 'selected' : ''}" data-id="${task.id}">
      <strong>${task.name}</strong>
      <span>${task.results_count}/${task.quantity}</span>
      <span>${statusLabel(task.status)}</span>
    </button>
  `).join('') : `<p class="empty">${tr('empty_filtered_tasks')}</p>`;

  wrap.querySelectorAll('[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTaskId = Number(button.dataset.id);
      renderTaskDetail();
    });
  });
}

function renderTaskDetail() {
  renderTasksSidebar();

  const header = document.getElementById('task-detail-header');
  const actions = document.getElementById('task-detail-actions');
  const consoleBox = document.getElementById('task-console');
  const tasks = getFilteredTasks();
  const task = tasks.find((item) => item.id === state.selectedTaskId) || tasks[0] || null;

  if (!task) {
    header.innerHTML = `<h3>${tr('task_detail_empty_title')}</h3><p class="meta">${tr('task_detail_empty_desc')}</p>`;
    actions.innerHTML = '';
    consoleBox.textContent = tr('console_wait');
    return;
  }

  state.selectedTaskId = task.id;
  header.innerHTML = `
    <div>
      <h3>${task.name} (#${task.id})</h3>
      <p class="meta">${tr('task_header_meta', {
        platform: task.platform,
        quantity: task.quantity,
        completed: task.results_count,
        status: statusLabel(task.status),
      })}</p>
    </div>
  `;

  actions.innerHTML = '';

  const stopButton = document.createElement('button');
  stopButton.type = 'button';
  stopButton.textContent = tr('stop_task');
  stopButton.disabled = !['queued', 'running', 'stopping'].includes(task.status);
  stopButton.addEventListener('click', async () => {
    try {
      await api(`/api/tasks/${task.id}/stop`, { method: 'POST' });
      await refreshState();
    } catch (error) {
      window.alert(error.message);
    }
  });

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.textContent = tr('download_zip');
  downloadButton.disabled = ['queued', 'running', 'stopping'].includes(task.status);
  downloadButton.addEventListener('click', () => {
    window.open(`/api/tasks/${task.id}/download`, '_blank');
  });

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'danger';
  deleteButton.textContent = tr('delete_task');
  deleteButton.disabled = ['queued', 'running', 'stopping'].includes(task.status);
  deleteButton.addEventListener('click', async () => {
    if (!window.confirm(tr('delete_task_confirm', { id: task.id }))) {
      return;
    }
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      state.selectedTaskId = null;
      await refreshState();
    } catch (error) {
      window.alert(error.message);
    }
  });

  actions.append(stopButton, downloadButton, deleteButton);
  consoleBox.textContent = task.console_tail || tr('console_empty');
  requestAnimationFrame(() => {
    consoleBox.scrollTop = consoleBox.scrollHeight;
  });
}

function renderSchedules() {
  const wrap = document.getElementById('schedule-list');
  wrap.innerHTML = state.schedules.length ? state.schedules.map((item) => `
    <article class="entity-card">
      <div>
        <h3>${item.name}</h3>
        <p class="meta">${tr('schedule_meta', {
          platform: item.platform,
          time: item.time_of_day,
          quantity: item.quantity,
          enabled: item.enabled ? tr('enable') : tr('disable'),
        })}</p>
        <p class="notes">${item.use_proxy ? tr('schedule_proxy_on') : tr('schedule_proxy_off')}</p>
      </div>
      <div class="entity-actions">
        <button type="button" data-toggle="${item.id}">${item.enabled ? tr('disable') : tr('enable')}</button>
        <button type="button" class="danger" data-delete="${item.id}">${tr('delete')}</button>
      </div>
    </article>
  `).join('') : `<p class="empty">${tr('empty_schedules')}</p>`;

  wrap.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api(`/api/schedules/${button.dataset.toggle}/toggle`, { method: 'POST' });
      await refreshState();
    });
  });

  wrap.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm(tr('delete_schedule_confirm'))) {
        return;
      }
      await api(`/api/schedules/${button.dataset.delete}`, { method: 'DELETE' });
      await refreshState();
    });
  });
}

function renderApiKeys() {
  const wrap = document.getElementById('api-key-list');
  wrap.innerHTML = state.apiKeys.length ? state.apiKeys.map((item) => `
    <article class="entity-card">
      <div>
        <h3>${item.name}</h3>
        <p class="meta">${tr('api_key_meta', { prefix: item.key_prefix, created_at: item.created_at })}</p>
        <p class="notes">${item.last_used_at ? tr('last_used_at', { value: item.last_used_at }) : tr('unused')}</p>
      </div>
      <div class="entity-actions">
        <button type="button" class="danger" data-id="${item.id}">${tr('delete')}</button>
      </div>
    </article>
  `).join('') : `<p class="empty">${tr('empty_api_keys')}</p>`;

  wrap.querySelectorAll('[data-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm(tr('delete_api_key_confirm'))) {
        return;
      }
      await api(`/api/api-keys/${button.dataset.id}`, { method: 'DELETE' });
      await refreshState();
    });
  });
}

function populateSelectors() {
  const mailCredentials = state.credentials.filter((item) => item.kind === 'gptmail');
  const captchaCredentials = state.credentials.filter((item) => item.kind === 'yescaptcha');
  const emailSelect = document.getElementById('email-select');
  const captchaSelect = document.getElementById('captcha-select');
  const proxySelect = document.getElementById('proxy-select');

  const selectedEmailId = emailSelect ? emailSelect.value : '';
  const selectedCaptchaId = captchaSelect ? captchaSelect.value : '';
  const selectedProxyId = proxySelect ? proxySelect.value : '';

  const nextEmailId = mailCredentials.some((item) => String(item.id) === selectedEmailId) ? selectedEmailId : '';
  const nextCaptchaId = captchaCredentials.some((item) => String(item.id) === selectedCaptchaId) ? selectedCaptchaId : '';
  const nextProxyId = state.proxies.some((item) => String(item.id) === selectedProxyId) ? selectedProxyId : '';

  setOptions(emailSelect, mailCredentials, tr('use_default_gptmail'), nextEmailId);
  setOptions(captchaSelect, captchaCredentials, tr('use_default_yescaptcha'), nextCaptchaId);
  setOptions(proxySelect, state.proxies, tr('choose_proxy'), nextProxyId);
}

async function refreshState() {
  const payload = await api('/api/state');
  state.credentials = payload.credentials;
  state.proxies = payload.proxies;
  state.tasks = payload.tasks;
  state.schedules = payload.schedules;
  state.apiKeys = payload.api_keys;
  state.defaults = payload.defaults;
  state.dashboard = payload.dashboard;
  state.platforms = payload.platforms;

  if (!state.tasks.some((task) => task.id === state.selectedTaskId)) {
    state.selectedTaskId = state.tasks[0]?.id || null;
  }

  populateSelectors();
  renderDefaults();
  renderDashboard();
  renderCredentialsList();
  renderProxyList();
  renderSchedules();
  renderApiKeys();
  renderTaskDetail();
  syncTaskForm();
}

const credentialKind = document.getElementById('credential-kind');
if (credentialKind) {
  credentialKind.addEventListener('change', syncCredentialForm);
}

const platformSelect = document.getElementById('platform-select');
if (platformSelect) {
  platformSelect.addEventListener('change', syncTaskForm);
}

const proxyModeSelect = document.getElementById('proxy-mode-select');
if (proxyModeSelect) {
  proxyModeSelect.addEventListener('change', syncTaskForm);
}

const taskFilterStatus = document.getElementById('task-filter-status');
if (taskFilterStatus) {
  taskFilterStatus.addEventListener('change', (event) => {
    state.taskFilterStatus = event.currentTarget.value;
    renderTaskDetail();
  });
}

const logoutButton = document.getElementById('logout-btn');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  });
}

const defaultsForm = document.getElementById('defaults-form');
if (defaultsForm) {
  defaultsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    ['default_gptmail_credential_id', 'default_yescaptcha_credential_id', 'default_proxy_id'].forEach((key) => {
      payload[key] = payload[key] ? Number(payload[key]) : null;
    });
    await api('/api/defaults', { method: 'POST', body: JSON.stringify(payload) });
    await refreshState();
  });
}

const credentialForm = document.getElementById('credential-form');
if (credentialForm) {
  credentialForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/credentials', { method: 'POST', body: JSON.stringify(formToObject(event.currentTarget)) });
    event.currentTarget.reset();
    syncCredentialForm();
    await refreshState();
  });
}

const proxyForm = document.getElementById('proxy-form');
if (proxyForm) {
  proxyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/proxies', { method: 'POST', body: JSON.stringify(formToObject(event.currentTarget)) });
    event.currentTarget.reset();
    await refreshState();
  });
}

const taskForm = document.getElementById('task-form');
if (taskForm) {
  taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    payload.quantity = Number(payload.quantity);
    payload.concurrency = Number(payload.concurrency || 1);
    payload.email_credential_id = payload.email_credential_id ? Number(payload.email_credential_id) : null;
    payload.captcha_credential_id = payload.captcha_credential_id ? Number(payload.captcha_credential_id) : null;
    payload.proxy_id = payload.proxy_id ? Number(payload.proxy_id) : null;

    const result = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    await refreshState();

    if (window.confirm(tr('created_task_confirm', { id: result.id }))) {
      state.selectedTaskId = Number(result.id);
      showSection('task-detail');
      renderTaskDetail();
    }
  });
}

const scheduleForm = document.getElementById('schedule-form');
if (scheduleForm) {
  scheduleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formToObject(form);
    payload.quantity = Number(payload.quantity);
    payload.concurrency = Number(payload.concurrency || 1);
    payload.use_proxy = new FormData(form).get('use_proxy') === 'on';
    payload.enabled = true;
    await api('/api/schedules', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    await refreshState();
  });
}

const apiKeyForm = document.getElementById('api-key-form');
if (apiKeyForm) {
  apiKeyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('/api/api-keys', { method: 'POST', body: JSON.stringify(formToObject(event.currentTarget)) });
    document.getElementById('api-key-created').innerHTML = `
      <div class="flash-key">
        <strong>${tr('save_now')}</strong>
        <code>${result.api_key}</code>
      </div>
    `;
    event.currentTarget.reset();
    await refreshState();
  });
}

if (appShell) {
  document.title = tr('site_title');
  initChrome();
  syncCredentialForm();
  syncTaskForm();
  showSection('dashboard');
  refreshState();
  setInterval(refreshState, 3000);
}
