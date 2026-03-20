import React, { useEffect, useRef, useState } from 'react';
import {
  APP_CONFIG,
  NAV_ITEMS,
  TASK_STATUSES,
  api,
  getPlatformKeys,
  getTaskDisplayName,
  initialTaskDraft,
  isMobileLayout,
  normalizeTaskDraft,
  parseIntOrNull,
  SIDEBAR_STORAGE_KEY,
  statusLabel,
  tr,
} from './config.js';
import { BusyButton, Modal } from './ui.jsx';

export function ConsoleApp() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busyKeys, setBusyKeys] = useState({});
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [taskFilterStatus, setTaskFilterStatus] = useState('all');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [flashKey, setFlashKey] = useState('');
  const [modalState, setModalState] = useState(null);
  const [statePayload, setStatePayload] = useState({
    credentials: [],
    proxies: [],
    tasks: [],
    schedules: [],
    apiKeys: [],
    defaults: {},
    dashboard: {},
    platforms: APP_CONFIG.platforms || {},
  });
  const [defaultsDraft, setDefaultsDraft] = useState({
    default_gptmail_credential_id: '',
    default_yescaptcha_credential_id: '',
    default_proxy_id: '',
  });
  const [credentialDraft, setCredentialDraft] = useState({
    name: '',
    kind: 'gptmail',
    api_key: '',
    base_url: '',
    prefix: '',
    domain: '',
    notes: '',
  });
  const [proxyDraft, setProxyDraft] = useState({
    name: '',
    proxy_url: '',
    notes: '',
  });
  const [taskDraft, setTaskDraft] = useState(initialTaskDraft(APP_CONFIG.platforms || {}));
  const [scheduleDraft, setScheduleDraft] = useState({
    name: '',
    platform: getPlatformKeys(APP_CONFIG.platforms || {})[0] || 'openai-register',
    quantity: '1',
    concurrency: '1',
    time_of_day: '',
    use_proxy: false,
  });
  const [apiKeyName, setApiKeyName] = useState('');
  const modalResolverRef = useRef(null);
  const consoleRef = useRef(null);

  const mailCredentials = statePayload.credentials.filter((item) => item.kind === 'gptmail');
  const captchaCredentials = statePayload.credentials.filter((item) => item.kind === 'yescaptcha');
  const filteredTasks = taskFilterStatus === 'all'
    ? statePayload.tasks
    : statePayload.tasks.filter((task) => task.status === taskFilterStatus);
  const visibleTask = filteredTasks.find((item) => item.id === selectedTaskId) || filteredTasks[0] || null;
  const currentPlatformSpec = statePayload.platforms[taskDraft.platform] || {};

  useEffect(() => {
    const onResize = () => {
      if (!isMobileLayout()) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobileLayout()) {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (visibleTask) {
      setSelectedTaskId(visibleTask.id);
    }
  }, [visibleTask?.id]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [visibleTask?.id, visibleTask?.console_tail]);

  useEffect(() => {
    refreshState({ initial: true }).catch((error) => {
      setLoadError(error.message);
      setLoaded(true);
    });

    const timer = window.setInterval(() => {
      refreshState().catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshState({ initial = false } = {}) {
    const payload = await api('/api/state');
    setStatePayload(payload);
    setLoaded(true);
    setLoadError('');
    setDefaultsDraft({
      default_gptmail_credential_id: payload.defaults.default_gptmail_credential_id ? String(payload.defaults.default_gptmail_credential_id) : '',
      default_yescaptcha_credential_id: payload.defaults.default_yescaptcha_credential_id ? String(payload.defaults.default_yescaptcha_credential_id) : '',
      default_proxy_id: payload.defaults.default_proxy_id ? String(payload.defaults.default_proxy_id) : '',
    });
    setTaskDraft((current) => normalizeTaskDraft(initial ? initialTaskDraft(payload.platforms) : current, payload.platforms, payload.credentials, payload.proxies));
    setScheduleDraft((current) => {
      const platform = payload.platforms[current.platform] ? current.platform : (getPlatformKeys(payload.platforms)[0] || 'openai-register');
      return { ...current, platform };
    });
    setSelectedTaskId((current) => {
      if (payload.tasks.some((item) => item.id === current)) {
        return current;
      }
      return payload.tasks[0]?.id || null;
    });
  }

  async function withBusy(key, action) {
    setBusyKeys((current) => ({ ...current, [key]: true }));
    try {
      return await action();
    } finally {
      setBusyKeys((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function isBusy(key) {
    return Boolean(busyKeys[key]);
  }

  function closeModal(result) {
    const resolver = modalResolverRef.current;
    modalResolverRef.current = null;
    setModalState(null);
    if (resolver) {
      resolver(result);
    }
  }

  function openModal(options) {
    return new Promise((resolve) => {
      modalResolverRef.current = resolve;
      setModalState(options);
    });
  }

  async function confirmAction(options) {
    return openModal({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel || tr('delete'),
      cancelLabel: options.cancelLabel || tr('created_task_modal_cancel'),
    });
  }

  function switchSection(sectionId) {
    setActiveSection(sectionId);
    if (isMobileLayout()) {
      setSidebarOpen(false);
    }
  }

  async function handleDefaultsSubmit(event) {
    event.preventDefault();
    await withBusy('defaults-save', async () => {
      await api('/api/defaults', {
        method: 'POST',
        body: JSON.stringify({
          default_gptmail_credential_id: parseIntOrNull(defaultsDraft.default_gptmail_credential_id),
          default_yescaptcha_credential_id: parseIntOrNull(defaultsDraft.default_yescaptcha_credential_id),
          default_proxy_id: parseIntOrNull(defaultsDraft.default_proxy_id),
        }),
      });
      await refreshState();
    });
  }

  async function handleCredentialSubmit(event) {
    event.preventDefault();
    await withBusy('credential-save', async () => {
      await api('/api/credentials', {
        method: 'POST',
        body: JSON.stringify({
          ...credentialDraft,
          base_url: credentialDraft.kind === 'gptmail' ? credentialDraft.base_url || null : null,
          prefix: credentialDraft.kind === 'gptmail' ? credentialDraft.prefix || null : null,
          domain: credentialDraft.kind === 'gptmail' ? credentialDraft.domain || null : null,
          notes: credentialDraft.notes || null,
        }),
      });
      setCredentialDraft({
        name: '',
        kind: 'gptmail',
        api_key: '',
        base_url: '',
        prefix: '',
        domain: '',
        notes: '',
      });
      await refreshState();
    });
  }

  async function handleProxySubmit(event) {
    event.preventDefault();
    await withBusy('proxy-save', async () => {
      await api('/api/proxies', {
        method: 'POST',
        body: JSON.stringify({
          ...proxyDraft,
          notes: proxyDraft.notes || null,
        }),
      });
      setProxyDraft({ name: '', proxy_url: '', notes: '' });
      await refreshState();
    });
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    await withBusy('task-save', async () => {
      const result = await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...taskDraft,
          quantity: Number(taskDraft.quantity),
          concurrency: Number(taskDraft.concurrency || 1),
          email_credential_id: parseIntOrNull(taskDraft.email_credential_id),
          captcha_credential_id: parseIntOrNull(taskDraft.captcha_credential_id),
          proxy_id: taskDraft.proxy_mode === 'custom' ? parseIntOrNull(taskDraft.proxy_id) : null,
        }),
      });
      await refreshState();
      const shouldOpenTask = await openModal({
        title: tr('created_task_modal_title'),
        message: tr('created_task_confirm', { id: result.id }),
        confirmLabel: tr('created_task_modal_confirm'),
        cancelLabel: tr('created_task_modal_cancel'),
      });
      if (shouldOpenTask) {
        setSelectedTaskId(Number(result.id));
        setActiveSection('task-detail');
      }
    });
  }

  async function handleScheduleSubmit(event) {
    event.preventDefault();
    await withBusy('schedule-save', async () => {
      await api('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          ...scheduleDraft,
          quantity: Number(scheduleDraft.quantity),
          concurrency: Number(scheduleDraft.concurrency || 1),
          enabled: true,
        }),
      });
      setScheduleDraft({
        name: '',
        platform: getPlatformKeys(statePayload.platforms)[0] || 'openai-register',
        quantity: '1',
        concurrency: '1',
        time_of_day: '',
        use_proxy: false,
      });
      await refreshState();
    });
  }

  async function handleApiKeySubmit(event) {
    event.preventDefault();
    await withBusy('api-key-save', async () => {
      const result = await api('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: apiKeyName }),
      });
      setApiKeyName('');
      setFlashKey(result.api_key);
      await refreshState();
    });
  }

  async function handleLogout() {
    await withBusy('logout', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    });
  }

  async function handleSetDefault(kind, id) {
    await withBusy(`set-default-${kind}-${id}`, async () => {
      await api('/api/defaults', {
        method: 'POST',
        body: JSON.stringify({
          default_gptmail_credential_id: kind === 'default_gptmail_credential_id'
            ? id
            : (statePayload.defaults.default_gptmail_credential_id || null),
          default_yescaptcha_credential_id: kind === 'default_yescaptcha_credential_id'
            ? id
            : (statePayload.defaults.default_yescaptcha_credential_id || null),
          default_proxy_id: kind === 'default_proxy_id'
            ? id
            : (statePayload.defaults.default_proxy_id || null),
        }),
      });
      await refreshState();
    });
  }

  async function handleDeleteCredential(item) {
    if (!await confirmAction({
      title: tr('delete'),
      message: tr('delete_credential_confirm', { name: item.name }),
      confirmLabel: tr('delete'),
    })) {
      return;
    }
    await withBusy(`credential-delete-${item.id}`, async () => {
      await api(`/api/credentials/${item.id}`, { method: 'DELETE' });
      await refreshState();
    });
  }

  async function handleDeleteProxy(item) {
    if (!await confirmAction({
      title: tr('delete'),
      message: tr('delete_proxy_confirm', { name: item.name }),
      confirmLabel: tr('delete'),
    })) {
      return;
    }
    await withBusy(`proxy-delete-${item.id}`, async () => {
      await api(`/api/proxies/${item.id}`, { method: 'DELETE' });
      await refreshState();
    });
  }

  async function handleStopTask(task) {
    await withBusy(`task-stop-${task.id}`, async () => {
      await api(`/api/tasks/${task.id}/stop`, { method: 'POST' });
      await refreshState();
    });
  }

  async function handleDeleteTask(task) {
    if (!await confirmAction({
      title: tr('delete_task'),
      message: tr('delete_task_confirm', { id: task.id }),
      confirmLabel: tr('delete_task'),
    })) {
      return;
    }
    await withBusy(`task-delete-${task.id}`, async () => {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      setSelectedTaskId(null);
      await refreshState();
    });
  }

  async function handleToggleSchedule(item) {
    await withBusy(`schedule-toggle-${item.id}`, async () => {
      await api(`/api/schedules/${item.id}/toggle`, { method: 'POST' });
      await refreshState();
    });
  }

  async function handleDeleteSchedule(item) {
    if (!await confirmAction({
      title: tr('delete'),
      message: tr('delete_schedule_confirm'),
      confirmLabel: tr('delete'),
    })) {
      return;
    }
    await withBusy(`schedule-delete-${item.id}`, async () => {
      await api(`/api/schedules/${item.id}`, { method: 'DELETE' });
      await refreshState();
    });
  }

  async function handleDeleteApiKey(item) {
    if (!await confirmAction({
      title: tr('delete'),
      message: tr('delete_api_key_confirm'),
      confirmLabel: tr('delete'),
    })) {
      return;
    }
    await withBusy(`api-key-delete-${item.id}`, async () => {
      await api(`/api/api-keys/${item.id}`, { method: 'DELETE' });
      await refreshState();
    });
  }

  function renderDashboard() {
    const metrics = statePayload.dashboard || {};
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_dashboard')}</p>
            <h2>{tr('section_overview')}</h2>
          </div>
        </div>
        <div className="metric-grid">
          <article className="metric-card"><strong>{metrics.running_tasks || 0}</strong><span>{tr('dashboard_running_tasks')}</span></article>
          <article className="metric-card"><strong>{metrics.completed_tasks || 0}</strong><span>{tr('dashboard_completed_tasks')}</span></article>
          <article className="metric-card"><strong>{metrics.credential_count || 0}</strong><span>{tr('dashboard_credential_count')}</span></article>
          <article className="metric-card"><strong>{metrics.proxy_count || 0}</strong><span>{tr('dashboard_proxy_count')}</span></article>
        </div>
        <article className="panel compact">
          <div className="panel-head">
            <div>
              <h3>{tr('panel_defaults_title')}</h3>
              <span>{tr('panel_defaults_desc')}</span>
            </div>
          </div>
          <form className="grid-two form-grid" onSubmit={handleDefaultsSubmit}>
            <label className="field-card">
              <span>{tr('default_gptmail')}</span>
              <select value={defaultsDraft.default_gptmail_credential_id} onChange={(event) => setDefaultsDraft((current) => ({ ...current, default_gptmail_credential_id: event.target.value }))}>
                <option value="">{tr('no_default_gptmail')}</option>
                {mailCredentials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="field-card">
              <span>{tr('default_yescaptcha')}</span>
              <select value={defaultsDraft.default_yescaptcha_credential_id} onChange={(event) => setDefaultsDraft((current) => ({ ...current, default_yescaptcha_credential_id: event.target.value }))}>
                <option value="">{tr('no_default_yescaptcha')}</option>
                {captchaCredentials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="field-card">
              <span>{tr('default_proxy')}</span>
              <select value={defaultsDraft.default_proxy_id} onChange={(event) => setDefaultsDraft((current) => ({ ...current, default_proxy_id: event.target.value }))}>
                <option value="">{tr('no_default_proxy')}</option>
                {statePayload.proxies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <div className="form-actions">
              <BusyButton type="submit" busy={isBusy('defaults-save')}>{tr('save_defaults')}</BusyButton>
            </div>
          </form>
        </article>
        <article className="panel compact">
          <div className="panel-head">
            <div>
              <h3>{tr('panel_recent_tasks_title')}</h3>
              <span>{tr('panel_recent_tasks_desc')}</span>
            </div>
          </div>
          <div className="simple-list">
            {(statePayload.dashboard.recent_tasks || []).length ? statePayload.dashboard.recent_tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="simple-row"
                onClick={() => {
                  setSelectedTaskId(task.id);
                  setActiveSection('task-detail');
                }}
              >
                <span>{getTaskDisplayName(task)}</span>
                <span>{task.results_count}/{task.quantity} | {statusLabel(task.status)}</span>
              </button>
            )) : <p className="empty">{tr('empty_tasks')}</p>}
          </div>
        </article>
      </section>
    );
  }

  function renderCredentials() {
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_credentials')}</p>
            <h2>{tr('section_credentials')}</h2>
          </div>
        </div>
        <div className="grid-two">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('credentials_create_title')}</h3>
                <span>{tr('credentials_create_desc')}</span>
              </div>
            </div>
            <form className="stack" onSubmit={handleCredentialSubmit}>
              <label className="field-card">
                <span>{tr('field_name')}</span>
                <input required value={credentialDraft.name} onChange={(event) => setCredentialDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field-card">
                <span>{tr('field_kind')}</span>
                <select value={credentialDraft.kind} onChange={(event) => setCredentialDraft((current) => ({ ...current, kind: event.target.value }))}>
                  <option value="gptmail">GPTMail</option>
                  <option value="yescaptcha">YesCaptcha</option>
                </select>
              </label>
              <label className="field-card">
                <span>{tr('field_api_key')}</span>
                <input required value={credentialDraft.api_key} onChange={(event) => setCredentialDraft((current) => ({ ...current, api_key: event.target.value }))} />
              </label>
              {credentialDraft.kind === 'gptmail' ? (
                <>
                  <label className="field-card">
                    <span>{tr('field_base_url')}</span>
                    <input value={credentialDraft.base_url} onChange={(event) => setCredentialDraft((current) => ({ ...current, base_url: event.target.value }))} />
                  </label>
                  <label className="field-card">
                    <span>{tr('field_prefix')}</span>
                    <input value={credentialDraft.prefix} onChange={(event) => setCredentialDraft((current) => ({ ...current, prefix: event.target.value }))} />
                  </label>
                  <label className="field-card">
                    <span>{tr('field_domain')}</span>
                    <input value={credentialDraft.domain} onChange={(event) => setCredentialDraft((current) => ({ ...current, domain: event.target.value }))} />
                  </label>
                </>
              ) : null}
              <label className="field-card">
                <span>{tr('field_notes')}</span>
                <textarea rows="3" value={credentialDraft.notes} onChange={(event) => setCredentialDraft((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <BusyButton type="submit" busy={isBusy('credential-save')}>{tr('save_credential')}</BusyButton>
            </form>
          </article>
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('credentials_saved_title')}</h3>
                <span>{tr('credentials_saved_desc')}</span>
              </div>
            </div>
            <div className="entity-list">
              {statePayload.credentials.length ? statePayload.credentials.map((item) => {
                const isDefault = item.kind === 'gptmail'
                  ? statePayload.defaults.default_gptmail_credential_id === item.id
                  : statePayload.defaults.default_yescaptcha_credential_id === item.id;
                const defaultKey = item.kind === 'gptmail' ? 'default_gptmail_credential_id' : 'default_yescaptcha_credential_id';
                return (
                  <article className="entity-card" key={item.id}>
                    <div>
                      <h3>{item.name}</h3>
                      <p className="meta">{item.kind} | {tr('created_at', { value: item.created_at })}{isDefault ? ` | ${tr('default_badge')}` : ''}</p>
                      <p className="notes">{item.notes || ''}</p>
                    </div>
                    <div className="entity-actions">
                      <BusyButton type="button" busy={isBusy(`set-default-${defaultKey}-${item.id}`)} disabled={isDefault} onClick={() => handleSetDefault(defaultKey, item.id)}>
                        {isDefault ? tr('current_default') : tr('set_default')}
                      </BusyButton>
                      <BusyButton type="button" className="danger" busy={isBusy(`credential-delete-${item.id}`)} onClick={() => handleDeleteCredential(item)}>{tr('delete')}</BusyButton>
                    </div>
                  </article>
                );
              }) : <p className="empty">{tr('empty_credentials')}</p>}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderProxies() {
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_proxies')}</p>
            <h2>{tr('section_proxies')}</h2>
          </div>
        </div>
        <div className="grid-two">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('proxies_create_title')}</h3>
                <span>{tr('proxies_create_desc')}</span>
              </div>
            </div>
            <form className="stack" onSubmit={handleProxySubmit}>
              <label className="field-card">
                <span>{tr('field_name')}</span>
                <input required value={proxyDraft.name} onChange={(event) => setProxyDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field-card">
                <span>{tr('field_proxy_url')}</span>
                <input required value={proxyDraft.proxy_url} onChange={(event) => setProxyDraft((current) => ({ ...current, proxy_url: event.target.value }))} />
              </label>
              <label className="field-card">
                <span>{tr('field_notes')}</span>
                <textarea rows="3" value={proxyDraft.notes} onChange={(event) => setProxyDraft((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <BusyButton type="submit" busy={isBusy('proxy-save')}>{tr('save_proxy')}</BusyButton>
            </form>
          </article>
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('proxies_saved_title')}</h3>
                <span>{tr('proxies_saved_desc')}</span>
              </div>
            </div>
            <div className="entity-list">
              {statePayload.proxies.length ? statePayload.proxies.map((item) => {
                const isDefault = statePayload.defaults.default_proxy_id === item.id;
                return (
                  <article className="entity-card" key={item.id}>
                    <div>
                      <h3>{item.name}</h3>
                      <p className="meta">{item.proxy_url}{isDefault ? ` | ${tr('default_badge')}` : ''}</p>
                      <p className="notes">{item.notes || ''}</p>
                    </div>
                    <div className="entity-actions">
                      <BusyButton type="button" busy={isBusy(`set-default-default_proxy_id-${item.id}`)} disabled={isDefault} onClick={() => handleSetDefault('default_proxy_id', item.id)}>
                        {isDefault ? tr('current_default') : tr('set_default')}
                      </BusyButton>
                      <BusyButton type="button" className="danger" busy={isBusy(`proxy-delete-${item.id}`)} onClick={() => handleDeleteProxy(item)}>{tr('delete')}</BusyButton>
                    </div>
                  </article>
                );
              }) : <p className="empty">{tr('empty_proxies')}</p>}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderCreateTask() {
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_create_task')}</p>
            <h2>{tr('section_tasks')}</h2>
          </div>
        </div>
        <article className="panel">
          <form className="grid-two form-grid" onSubmit={handleTaskSubmit}>
            <label className="field-card">
              <span>{tr('field_task_name')}</span>
              <input required value={taskDraft.name} onChange={(event) => setTaskDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field-card">
              <span>{tr('field_platform')}</span>
              <select
                value={taskDraft.platform}
                onChange={(event) => {
                  const nextPlatform = event.target.value;
                  const nextSpec = statePayload.platforms[nextPlatform] || {};
                  setTaskDraft((current) => normalizeTaskDraft({
                    ...current,
                    platform: nextPlatform,
                    concurrency: String(nextSpec.default_concurrency || current.concurrency || 1),
                  }, statePayload.platforms, statePayload.credentials, statePayload.proxies));
                }}
              >
                {Object.entries(statePayload.platforms).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select>
            </label>
            <label className="field-card">
              <span>{tr('field_quantity')}</span>
              <input type="number" min="1" max="100000" required value={taskDraft.quantity} onChange={(event) => setTaskDraft((current) => ({ ...current, quantity: event.target.value }))} />
            </label>
            <label className="field-card">
              <span>{tr('field_concurrency')}</span>
              <input type="number" min="1" max="64" value={taskDraft.concurrency} onChange={(event) => setTaskDraft((current) => ({ ...current, concurrency: event.target.value }))} />
            </label>
            {currentPlatformSpec.requires_email_credential ? (
              <label className="field-card">
                <span>{tr('field_email_credential')}</span>
                <select value={taskDraft.email_credential_id} onChange={(event) => setTaskDraft((current) => ({ ...current, email_credential_id: event.target.value }))}>
                  <option value="">{tr('use_default_gptmail')}</option>
                  {mailCredentials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
            {currentPlatformSpec.requires_captcha_credential ? (
              <label className="field-card">
                <span>{tr('field_captcha_credential')}</span>
                <select value={taskDraft.captcha_credential_id} onChange={(event) => setTaskDraft((current) => ({ ...current, captcha_credential_id: event.target.value }))}>
                  <option value="">{tr('use_default_yescaptcha')}</option>
                  {captchaCredentials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
            <label className="field-card">
              <span>{tr('field_proxy_mode')}</span>
              <select
                value={taskDraft.proxy_mode}
                onChange={(event) => setTaskDraft((current) => normalizeTaskDraft({ ...current, proxy_mode: event.target.value }, statePayload.platforms, statePayload.credentials, statePayload.proxies))}
                disabled={!currentPlatformSpec.supports_proxy}
              >
                <option value="none">{tr('proxy_mode_none')}</option>
                <option value="default">{tr('proxy_mode_default')}</option>
                <option value="custom">{tr('proxy_mode_custom')}</option>
              </select>
            </label>
            {currentPlatformSpec.supports_proxy && taskDraft.proxy_mode === 'custom' ? (
              <label className="field-card">
                <span>{tr('field_proxy_select')}</span>
                <select value={taskDraft.proxy_id} onChange={(event) => setTaskDraft((current) => ({ ...current, proxy_id: event.target.value }))}>
                  <option value="">{tr('choose_proxy')}</option>
                  {statePayload.proxies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
            <div className="form-actions full-row">
              <BusyButton type="submit" busy={isBusy('task-save')}>{tr('save_task')}</BusyButton>
            </div>
          </form>
        </article>
      </section>
    );
  }

  function renderTaskDetail() {
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_task_detail')}</p>
            <h2>{tr('section_task_detail')}</h2>
            <p className="subtle task-detail-note">{tr('task_detail_note')}</p>
          </div>
        </div>
        <div className="detail-layout">
          <aside className="task-side-wrap">
            <article className="panel task-side-panel">
              <div className="panel-head panel-head--stack">
                <div>
                  <h3>{tr('task_list_title')}</h3>
                  <span>{tr('task_list_desc')}</span>
                </div>
              </div>
              <div className="task-filter-bar">
                <label className="field-card field-card--compact">
                  <span>{tr('task_filter_status')}</span>
                  <select value={taskFilterStatus} onChange={(event) => setTaskFilterStatus(event.target.value)}>
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>{status === 'all' ? tr('task_filter_all') : statusLabel(status)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="task-side-list">
                {filteredTasks.length ? filteredTasks.map((task) => (
                  <button key={task.id} type="button" className={`task-side-item ${visibleTask?.id === task.id ? 'selected' : ''}`.trim()} onClick={() => setSelectedTaskId(task.id)}>
                    <div className="task-side-item__top">
                      <strong className="task-side-item__name">{getTaskDisplayName(task)}</strong>
                      <span className="task-side-item__id">#{task.id}</span>
                    </div>
                    <div className="task-side-item__meta">
                      <span className="task-side-item__count">{task.results_count}/{task.quantity}</span>
                      <span className={`status-pill status-pill--${task.status}`}>{statusLabel(task.status)}</span>
                    </div>
                  </button>
                )) : <p className="empty">{tr('empty_filtered_tasks')}</p>}
              </div>
            </article>
          </aside>
          <article className="panel task-detail-panel">
            {visibleTask ? (
              <>
                <div className="task-detail-header">
                  <div>
                    <h3>{getTaskDisplayName(visibleTask)} (#{visibleTask.id})</h3>
                    <p className="meta">{tr('task_header_meta', {
                      platform: visibleTask.platform,
                      quantity: visibleTask.quantity,
                      completed: visibleTask.results_count,
                      status: statusLabel(visibleTask.status),
                    })}</p>
                  </div>
                </div>
                <div className="task-actions">
                  <BusyButton type="button" busy={isBusy(`task-stop-${visibleTask.id}`)} disabled={!['queued', 'running', 'stopping'].includes(visibleTask.status)} onClick={() => handleStopTask(visibleTask)}>{tr('stop_task')}</BusyButton>
                  <button type="button" disabled={['queued', 'running', 'stopping'].includes(visibleTask.status)} onClick={() => window.open(`/api/tasks/${visibleTask.id}/download`, '_blank')}>{tr('download_zip')}</button>
                  <BusyButton type="button" className="danger" busy={isBusy(`task-delete-${visibleTask.id}`)} disabled={['queued', 'running', 'stopping'].includes(visibleTask.status)} onClick={() => handleDeleteTask(visibleTask)}>{tr('delete_task')}</BusyButton>
                </div>
                <div className="console-box large-console">
                  <div className="console-title">{tr('console_title')}</div>
                  <pre id="task-console" ref={consoleRef}>{visibleTask.console_tail || tr('console_empty')}</pre>
                </div>
              </>
            ) : (
              <div className="task-empty">
                <h3>{tr('task_detail_empty_title')}</h3>
                <p className="meta">{tr('task_detail_empty_desc')}</p>
              </div>
            )}
          </article>
        </div>
      </section>
    );
  }

  function renderSchedules() {
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_schedules')}</p>
            <h2>{tr('section_schedules')}</h2>
          </div>
        </div>
        <div className="grid-two">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('schedules_create_title')}</h3>
                <span>{tr('schedules_create_desc')}</span>
              </div>
            </div>
            <form className="stack" onSubmit={handleScheduleSubmit}>
              <label className="field-card">
                <span>{tr('field_name')}</span>
                <input required value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field-card">
                <span>{tr('field_platform')}</span>
                <select value={scheduleDraft.platform} onChange={(event) => setScheduleDraft((current) => ({ ...current, platform: event.target.value }))}>
                  {Object.entries(statePayload.platforms).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
                </select>
              </label>
              <label className="field-card">
                <span>{tr('field_quantity')}</span>
                <input type="number" min="1" max="100000" required value={scheduleDraft.quantity} onChange={(event) => setScheduleDraft((current) => ({ ...current, quantity: event.target.value }))} />
              </label>
              <label className="field-card">
                <span>{tr('field_concurrency')}</span>
                <input type="number" min="1" max="64" value={scheduleDraft.concurrency} onChange={(event) => setScheduleDraft((current) => ({ ...current, concurrency: event.target.value }))} />
              </label>
              <label className="field-card">
                <span>{tr('field_time_of_day')}</span>
                <input type="time" required value={scheduleDraft.time_of_day} onChange={(event) => setScheduleDraft((current) => ({ ...current, time_of_day: event.target.value }))} />
              </label>
              <label className="checkbox-row field-card field-card--checkbox">
                <input type="checkbox" checked={scheduleDraft.use_proxy} onChange={(event) => setScheduleDraft((current) => ({ ...current, use_proxy: event.target.checked }))} />
                <span>{tr('field_use_default_proxy')}</span>
              </label>
              <BusyButton type="submit" busy={isBusy('schedule-save')}>{tr('save_schedule')}</BusyButton>
            </form>
          </article>
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('schedules_saved_title')}</h3>
                <span>{tr('schedules_saved_desc')}</span>
              </div>
            </div>
            <div className="entity-list">
              {statePayload.schedules.length ? statePayload.schedules.map((item) => (
                <article className="entity-card" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <p className="meta">{tr('schedule_meta', {
                      platform: item.platform,
                      time: item.time_of_day,
                      quantity: item.quantity,
                      enabled: item.enabled ? tr('enable') : tr('disable'),
                    })}</p>
                    <p className="notes">{item.use_proxy ? tr('schedule_proxy_on') : tr('schedule_proxy_off')}</p>
                  </div>
                  <div className="entity-actions">
                    <BusyButton type="button" busy={isBusy(`schedule-toggle-${item.id}`)} onClick={() => handleToggleSchedule(item)}>{item.enabled ? tr('disable') : tr('enable')}</BusyButton>
                    <BusyButton type="button" className="danger" busy={isBusy(`schedule-delete-${item.id}`)} onClick={() => handleDeleteSchedule(item)}>{tr('delete')}</BusyButton>
                  </div>
                </article>
              )) : <p className="empty">{tr('empty_schedules')}</p>}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderApiKeys() {
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_api_keys')}</p>
            <h2>{tr('section_api')}</h2>
          </div>
        </div>
        <div className="grid-two">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('api_create_title')}</h3>
                <span>{tr('api_create_desc')}</span>
              </div>
            </div>
            <form className="stack" onSubmit={handleApiKeySubmit}>
              <label className="field-card">
                <span>{tr('field_name')}</span>
                <input required value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} />
              </label>
              <BusyButton type="submit" busy={isBusy('api-key-save')}>{tr('save_api_key')}</BusyButton>
            </form>
            {flashKey ? (
              <div className="flash-key">
                <strong>{tr('save_now')}</strong>
                <code>{flashKey}</code>
              </div>
            ) : null}
          </article>
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3>{tr('api_saved_title')}</h3>
                <span>{tr('api_saved_desc')}</span>
              </div>
            </div>
            <div className="entity-list">
              {statePayload.apiKeys.length ? statePayload.apiKeys.map((item) => (
                <article className="entity-card" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <p className="meta">{tr('api_key_meta', { prefix: item.key_prefix, created_at: item.created_at })}</p>
                    <p className="notes">{item.last_used_at ? tr('last_used_at', { value: item.last_used_at }) : tr('unused')}</p>
                  </div>
                  <div className="entity-actions">
                    <BusyButton type="button" className="danger" busy={isBusy(`api-key-delete-${item.id}`)} onClick={() => handleDeleteApiKey(item)}>{tr('delete')}</BusyButton>
                  </div>
                </article>
              )) : <p className="empty">{tr('empty_api_keys')}</p>}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderDocs() {
    return (
      <section className="section-card active">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr('nav_docs')}</p>
            <h2>{tr('section_docs')}</h2>
          </div>
        </div>
        <article className="panel">
          <div className="doc-block">
            <h3>{tr('docs_intro_title')}</h3>
            <p>{tr('docs_intro_desc')}</p>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_deploy_title')}</h3>
            <p>{tr('docs_deploy_desc')}</p>
            <h4>{tr('docs_local_deploy_title')}</h4>
            <pre className="doc-pre">python -m pip install -r web_console/requirements.txt{'\n'}uvicorn web_console.app:app --host 0.0.0.0 --port 8000</pre>
            <h4>{tr('docs_compose_deploy_title')}</h4>
            <pre className="doc-pre">docker compose pull{'\n'}docker compose up -d</pre>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_api_flow_title')}</h3>
            <p>{tr('docs_api_flow_desc')}</p>
            <pre className="doc-pre">{tr('docs_flow_1')}{'\n'}{tr('docs_flow_2')}{'\n'}{tr('docs_flow_3')}{'\n'}{tr('docs_flow_4')}</pre>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_endpoints_title')}</h3>
            <table className="doc-table">
              <thead>
                <tr><th>{tr('table_method')}</th><th>{tr('table_path')}</th><th>{tr('table_desc')}</th></tr>
              </thead>
              <tbody>
                <tr><td>POST</td><td><code>/api/external/tasks</code></td><td>{tr('endpoint_create_desc')}</td></tr>
                <tr><td>GET</td><td><code>/api/external/tasks/{'{task_id}'}</code></td><td>{tr('endpoint_query_desc')}</td></tr>
                <tr><td>GET</td><td><code>/api/external/tasks/{'{task_id}'}/download</code></td><td>{tr('endpoint_download_desc')}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_create_params_title')}</h3>
            <table className="doc-table">
              <thead>
                <tr><th>{tr('table_field')}</th><th>{tr('table_type')}</th><th>{tr('table_required')}</th><th>{tr('table_desc')}</th></tr>
              </thead>
              <tbody>
                <tr><td><code>platform</code></td><td>string</td><td>{tr('required_yes')}</td><td>{tr('param_platform_desc')}</td></tr>
                <tr><td><code>quantity</code></td><td>integer</td><td>{tr('required_yes')}</td><td>{tr('param_quantity_desc')}</td></tr>
                <tr><td><code>use_proxy</code></td><td>boolean</td><td>{tr('required_no')}</td><td>{tr('param_use_proxy_desc')}</td></tr>
                <tr><td><code>concurrency</code></td><td>integer</td><td>{tr('required_no')}</td><td>{tr('param_concurrency_desc')}</td></tr>
                <tr><td><code>name</code></td><td>string</td><td>{tr('required_no')}</td><td>{tr('param_name_desc')}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_create_example_title')}</h3>
            <pre className="doc-pre">{`POST ${APP_CONFIG.apiBaseUrl}/api/external/tasks
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "platform": "openai-register",
  "quantity": 10,
  "use_proxy": true,
  "concurrency": 1
}`}</pre>
            <pre className="doc-pre">{`curl -X POST "${APP_CONFIG.apiBaseUrl}/api/external/tasks" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\"platform\":\"openai-register\",\"quantity\":10,\"use_proxy\":true,\"concurrency\":1}"`}</pre>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_query_example_title')}</h3>
            <pre className="doc-pre">{`GET ${APP_CONFIG.apiBaseUrl}/api/external/tasks/TASK_ID
Authorization: Bearer YOUR_API_KEY`}</pre>
            <pre className="doc-pre">{`curl "${APP_CONFIG.apiBaseUrl}/api/external/tasks/TASK_ID" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</pre>
            <pre className="doc-pre">{`{
  "task_id": 12,
  "status": "running",
  "completed_count": 4,
  "target_quantity": 10,
  "auto_delete_at": "2026-03-16 20:15:00",
  "download_url": null
}`}</pre>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_download_example_title')}</h3>
            <pre className="doc-pre">{`GET ${APP_CONFIG.apiBaseUrl}/api/external/tasks/TASK_ID/download
Authorization: Bearer YOUR_API_KEY`}</pre>
            <pre className="doc-pre">{`curl -L "${APP_CONFIG.apiBaseUrl}/api/external/tasks/TASK_ID/download" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -o result.zip`}</pre>
          </div>
          <div className="doc-block">
            <h3>{tr('docs_response_title')}</h3>
            <p>{tr('docs_response_desc')}</p>
          </div>
        </article>
      </section>
    );
  }

  function renderContent() {
    if (loadError && !loaded) {
      return <section className="section-card active"><div className="panel"><p className="empty">{loadError}</p></div></section>;
    }
    switch (activeSection) {
      case 'dashboard':
        return renderDashboard();
      case 'credentials':
        return renderCredentials();
      case 'proxies':
        return renderProxies();
      case 'create-task':
        return renderCreateTask();
      case 'task-detail':
        return renderTaskDetail();
      case 'schedules':
        return renderSchedules();
      case 'api-keys':
        return renderApiKeys();
      case 'docs':
        return renderDocs();
      default:
        return renderDashboard();
    }
  }

  return (
    <>
      <div className={`admin-shell ${sidebarCollapsed && !isMobileLayout() ? 'sidebar-collapsed' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="sidebar-brand">
              <div className="brand-copy">
                <p className="eyebrow">{tr('brand_console')}</p>
                <h1>{tr('brand_name')}</h1>
              </div>
            </div>
            <button type="button" className="sidebar-toggle" aria-label={tr('toggle_sidebar')} onClick={() => {
              if (isMobileLayout()) {
                setSidebarOpen(true);
              } else {
                setSidebarCollapsed((current) => !current);
              }
            }}>
              <span>{sidebarCollapsed && !isMobileLayout() ? '>' : '<'}</span>
            </button>
          </div>
          <nav className="sidebar-nav">
            {NAV_ITEMS.map(([sectionId, labelKey]) => (
              <button key={sectionId} type="button" className={`nav-btn ${activeSection === sectionId ? 'active' : ''}`.trim()} onClick={() => switchSection(sectionId)}>
                <span className="nav-btn__label">{tr(labelKey)}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <BusyButton type="button" className="sidebar-logout" busy={isBusy('logout')} onClick={handleLogout}>{tr('nav_logout')}</BusyButton>
          </div>
        </aside>
        <button type="button" className="sidebar-overlay" aria-label={tr('close_sidebar')} onClick={() => setSidebarOpen(false)} />
        <main className="content-shell">
          <div className="content-topbar">
            <button type="button" className="mobile-nav-btn" aria-label={tr('open_sidebar')} onClick={() => setSidebarOpen(true)}>
              <span>≡</span>
            </button>
            <div className="content-topbar-copy">
              <p className="eyebrow">{tr('topbar_workspace')}</p>
              <strong>{tr(NAV_ITEMS.find(([sectionId]) => sectionId === activeSection)?.[1] || 'nav_dashboard')}</strong>
            </div>
          </div>
          {loadError && loaded ? <div className="toast-error">{loadError}</div> : null}
          {!loaded ? <section className="section-card active"><div className="panel"><p className="empty">Loading...</p></div></section> : renderContent()}
        </main>
      </div>
      <Modal
        open={Boolean(modalState)}
        title={modalState?.title || ''}
        message={modalState?.message || ''}
        confirmLabel={modalState?.confirmLabel || tr('created_task_modal_confirm')}
        cancelLabel={modalState?.cancelLabel || tr('created_task_modal_cancel')}
        onConfirm={() => closeModal(true)}
        onCancel={() => closeModal(false)}
      />
    </>
  );
}
