// ==========================================
// ANTIGRAVITY DASHBOARD - Enhanced UX
// ==========================================

// State Management
let currentStatus = null;
let currentQuotaStatus = null;
let availableModels = [];
let apiKeys = [];
let isLoading = true;
let usageChart = null;
let latencyChart = null;
let socket = null;

window.showManualAccountModal = function () {
  document.getElementById('manual-account-modal').style.display = 'flex';
};

window.hideManualAccountModal = function () {
  document.getElementById('manual-account-modal').style.display = 'none';
};

const manualAccForm = document.getElementById('manual-account-form');
if (manualAccForm) {
  manualAccForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      email: document.getElementById('acc-email').value,
      accessToken: document.getElementById('acc-access').value,
      refreshToken: document.getElementById('acc-refresh').value,
      expiryDate: parseInt(document.getElementById('acc-expiry').value),
    };
    try {
      const res = await fetch('/accounts/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('Account added manually!');
        hideManualAccountModal();
        fetchData();
      } else {
        showToast('Failed to add account', 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    }
  });
}

// Constants
const MODEL_OWNERS = {
  'gemini-3-pro-preview': 'google',
  'gemini-3-flash': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.5-flash-lite': 'google',
  'claude-sonnet-4-5': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'gpt-oss-120b-medium': 'openai',
};

const DEFAULT_MAX_TOKENS = {
  'claude-opus-4-5': 64000,
  'claude-sonnet-4-5': 64000,
  'gemini-3-pro-preview': 65536,
  'gemini-3-flash': 65536,
  'gemini-2.5-flash': 65536,
  'gemini-2.5-flash-lite': 65536,
  'gpt-oss-120b-medium': 32768,
};

const THINKING_LEVEL_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash',
  'gemini-2.5-flash',
];

const THINKING_ONLY_MODELS = ['claude-opus-4-5'];

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

function createToastContainer() {
  if (!document.querySelector('.toast-container')) {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

function showToast(message, type = 'success', duration = 3000) {
  createToastContainer();
  const container = document.querySelector('.toast-container');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon =
    type === 'success'
      ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
      : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';

  toast.innerHTML = `
        ${icon}
        <span class="toast-message">${message}</span>
    `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==========================================
// SKELETON LOADING
// ==========================================

function showSkeletonLoading() {
  // Stats skeleton
  const statsElements = [
    'stat-total',
    'stat-ready',
    'stat-cooldown',
    'stat-errors',
  ];
  statsElements.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="skeleton skeleton-stat"></div>';
  });

  // Grid skeleton
  const grid = document.getElementById('accounts-grid');
  if (grid) {
    grid.innerHTML = Array(3)
      .fill(null)
      .map(
        (_, i) => `
        <div class="account-card" style="animation-delay: ${i * 0.1}s">
            <div class="skeleton skeleton-text" style="width: 150px; height: 24px;"></div>
            <div class="skeleton skeleton-text" style="width: 100%; height: 60px;"></div>
            <div class="skeleton skeleton-text" style="width: 100%; height: 100px;"></div>
        </div>
    `,
      )
      .join('');
  }
}

// ==========================================
// THEME MANAGEMENT
// ==========================================

function getStoredTheme() {
  return localStorage.getItem('antigravity-theme') || 'dark';
}

function setTheme(theme) {
  localStorage.setItem('antigravity-theme', theme);

  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('icon-dark').style.display = 'none';
    document.getElementById('icon-light').style.display = 'block';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('icon-dark').style.display = 'block';
    document.getElementById('icon-light').style.display = 'none';
  }

  // Update charts theme
  if (usageChart) {
    usageChart.updateOptions({ theme: { mode: theme } });
  }
  if (latencyChart) {
    latencyChart.updateOptions({ theme: { mode: theme } });
  }

  // Update charts theme
  if (usageChart) {
    usageChart.updateOptions({ theme: { mode: theme } });
  }
  if (latencyChart) {
    latencyChart.updateOptions({ theme: { mode: theme } });
  }

  // Notify Swagger iframe
  const iframe = document.querySelector('.spa-frame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      { type: 'THEME_CHANGE', theme: theme },
      '*',
    );
  }
}

window.toggleTheme = function () {
  const currentTheme = getStoredTheme();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  showToast(`Switched to ${newTheme} mode`, 'success', 2000);
};

// ==========================================
// SPA NAVIGATION
// ==========================================

window.showView = function (viewId) {
  document
    .querySelectorAll('.spa-view')
    .forEach((el) => el.classList.remove('active'));
  document
    .querySelectorAll('.nav-tab')
    .forEach((el) => el.classList.remove('active'));

  const targetView = document.getElementById('view-' + viewId);
  const targetNav = document.getElementById('nav-' + viewId);

  if (targetView) targetView.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  // Re-trigger animations
  if (viewId === 'models') {
    const cards = document.querySelectorAll('.model-card');
    cards.forEach((card, i) => {
      card.style.animation = 'none';
      card.offsetHeight; // Force reflow
      card.style.animation = `fadeInUp 0.5s ease forwards ${i * 0.05}s`;
    });
  }

  if (viewId === 'keys') {
    fetchApiKeys();
  }
};

// ==========================================
// DATA FETCHING
// ==========================================

async function fetchData() {
  try {
    showSkeletonLoading();

    const [dashboardRes, modelsRes, analyticsRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/models'),
      fetch('/api/keys/stats/analytics'),
    ]);

    if (dashboardRes.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!dashboardRes.ok || !modelsRes.ok) {
      throw new Error('Failed to fetch data');
    }

    const dashboardData = await dashboardRes.json();
    const modelsData = await modelsRes.json();
    const analyticsData = analyticsRes.ok ? await analyticsRes.json() : null;

    currentStatus = dashboardData.status;
    currentQuotaStatus = dashboardData.quotaStatus;
    availableModels = modelsData.data.map((m) => m.id);

    isLoading = false;
    updateUI(analyticsData);

    // Also fetch keys in background if we're on the keys view
    if (document.getElementById('view-keys').classList.contains('active')) {
      fetchApiKeys();
    }
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    showToast('Failed to load dashboard data', 'error');
    isLoading = false;
  }
}

window.refreshQuota = async function () {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const response = await fetch('/api/quota/refresh');

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to refresh quota');
    }

    const data = await response.json();

    currentStatus = data.status;
    currentQuotaStatus = data.quotaStatus;

    updateUI();
    showToast('Quota refreshed successfully!', 'success');
  } catch (error) {
    console.error('Failed to refresh quota:', error);
    showToast('Failed to refresh quota', 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
};

// ==========================================
// API KEYS MANAGEMENT
// ==========================================

async function fetchApiKeys() {
  try {
    const response = await fetch('/api/keys');
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await response.json();
    apiKeys = data.keys;
    updateKeysUI();
  } catch (error) {
    console.error('Failed to fetch API keys:', error);
    showToast('Failed to load API keys', 'error');
  }
}

function updateKeysUI() {
  const grid = document.getElementById('keys-grid');
  const container = document.getElementById('keys-container');
  const emptyState = document.getElementById('keys-empty-state');

  const badgeEl = document.getElementById('keys-badge');
  if (badgeEl) badgeEl.textContent = `${apiKeys.length} keys`;

  if (grid) {
    if (apiKeys.length === 0) {
      if (container) container.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (container) container.style.display = 'block';
      if (emptyState) emptyState.style.display = 'none';

      grid.innerHTML = apiKeys
        .map(
          (key, index) => `
                <div class="key-card" style="animation-delay: ${index * 0.05}s">
                    <div class="key-card-header">
                        <div class="key-main-info">
                            <div class="key-name">
                                ${key.name}
                                ${key.is_active ? '' : '<span class="badge-sm badge-error" style="margin-left: 8px;">INACTIVE</span>'}
                            </div>
                            <div class="key-description-row text-dim">
                                ${key.description || 'No description provided'}
                            </div>
                            <div class="key-value-wrapper">
                                <code>${key.key}</code>
                            </div>
                        </div>
                        <div class="key-actions">
                            ${
                              key.is_active
                                ? `<button onclick="deactivateKey(${key.id})" class="btn-icon" title="Deactivate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/></svg></button>`
                                : `<button onclick="activateKey(${key.id})" class="btn-icon" title="Activate" style="color: var(--accent-green);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg></button>`
                            }
                            <button onclick="showEditKeyModal(${key.id})" class="btn-icon" title="Edit" style="color: var(--accent-yellow);">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onclick="toggleSmartContext(${key.id}, ${key.smart_context === 1 ? 'false' : 'true'})" class="btn-icon" title="${key.smart_context === 1 ? 'Disable Smart Context' : 'Enable Smart Context'}" style="color: ${key.smart_context === 1 ? 'var(--accent-blue)' : 'var(--text-dim)'};">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z"/><path d="M12 6a6 6 0 106 6 6 6 0 00-6-6z"/></svg>
                            </button>
                            <button onclick="deleteKey(${key.id})" class="btn-icon" title="Delete" style="color: var(--accent-red);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                        </div>
                    </div>
                    
                    <div class="key-config-summary">
                        <div class="config-pill ${key.smart_context === 1 ? 'active' : ''}" title="Smart Context">
                            🧠 Smart: ${key.smart_context === 1 ? key.smart_context_limit : 'Off'}
                        </div>
                        <div class="config-pill" title="Allowed Models">
                            📦 Models: ${key.allowed_models === '*' ? 'All' : 'Restricted'}
                        </div>
                        <div class="config-pill" title="CORS Origins">
                            🌐 CORS: ${key.cors_origin === '*' ? 'Any' : 'Restricted'}
                        </div>
                    </div>

                    <div class="key-stats-row">
                        <div class="mini-stat">
                            <span class="mini-stat-label">Requests</span>
                            <span class="mini-stat-value">${key.requests_count.toLocaleString()}</span>
                        </div>
                        <div class="mini-stat">
                            <span class="mini-stat-label">Tokens</span>
                            <span class="mini-stat-value">${key.tokens_used.toLocaleString()}</span>
                        </div>
                        <div class="mini-stat">
                            <span class="mini-stat-label">Limit</span>
                            <span class="mini-stat-value">${key.daily_limit === 0 ? '∞' : key.daily_limit.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="key-footer">
                        <span class="text-dim" style="font-size: 0.7rem;">Created: ${new Date(key.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            `,
        )
        .join('');
    }
  }
}

window.showCreateKeyModal = function () {
  const modal = document.getElementById('create-key-modal');
  if (modal) modal.style.display = 'flex';
};

window.hideCreateKeyModal = function () {
  const modal = document.getElementById('create-key-modal');
  if (modal) modal.style.display = 'none';
};

// Setup create key form - wrapped in function to ensure DOM is ready
function setupCreateKeyForm() {
  const createKeyForm = document.getElementById('create-key-form');
  if (!createKeyForm) return;

  // Show/hide limit based on checkbox
  const smartContextCheck = document.getElementById('key-smart-context');
  const limitContainer = document.getElementById(
    'key-smart-context-limit-container',
  );

  if (smartContextCheck && limitContainer) {
    smartContextCheck.addEventListener('change', () => {
      limitContainer.style.display = smartContextCheck.checked
        ? 'block'
        : 'none';
    });
    // Initial state
    limitContainer.style.display = smartContextCheck.checked ? 'block' : 'none';
  }

  createKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form elements safely
    const nameEl = document.getElementById('key-name');
    const descriptionEl = document.getElementById('key-description');
    const dailyLimitEl = document.getElementById('key-daily-limit');
    const rateLimitEl = document.getElementById('key-rate-limit');
    const allowedModelsEl = document.getElementById('key-allowed-models');
    const corsOriginEl = document.getElementById('key-cors-origin');
    const smartContextEl = document.getElementById('key-smart-context');
    const smartContextLimitEl = document.getElementById(
      'key-smart-context-limit',
    );

    const name = nameEl ? nameEl.value : '';
    const description = descriptionEl ? descriptionEl.value : '';
    const dailyLimit = parseInt(dailyLimitEl ? dailyLimitEl.value : '0', 10);
    const rateLimit = parseInt(rateLimitEl ? rateLimitEl.value : '60', 10);
    const allowedModels = allowedModelsEl ? allowedModelsEl.value : '*';
    const corsOrigin = corsOriginEl ? corsOriginEl.value : '*';
    const smartContext = smartContextEl && smartContextEl.checked ? 1 : 0;
    const smartContextLimit = parseInt(
      smartContextLimitEl ? smartContextLimitEl.value : '10',
      10,
    );

    if (!name) {
      showToast('Please enter a key name', 'error');
      return;
    }

    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          dailyLimit,
          rateLimitPerMinute: rateLimit,
          allowedModels,
          corsOrigin,
          smartContext,
          smartContextLimit,
        }),
      });

      const data = await response.json();

      if (data.success) {
        hideCreateKeyModal();
        showNewKeyModal(data.key);
        fetchApiKeys();
        // Reset form
        createKeyForm.reset();
        if (limitContainer) limitContainer.style.display = 'none';
        showToast('API key created!', 'success');
      } else {
        showToast(data.error || 'Failed to create key', 'error');
      }
    } catch (error) {
      console.error('Error creating key:', error);
      showToast('Connection error', 'error');
    }
  });
}

// setupCreateKeyForm will be called on DOMContentLoaded

window.showEditKeyModal = function (id) {
  const key = apiKeys.find((k) => k.id === id);
  if (!key) {
    console.error('API Key not found:', id);
    showToast('API Key not found', 'error');
    return;
  }

  const modal = document.getElementById('edit-key-modal');
  if (!modal) {
    console.error('Edit modal element not found');
    showToast('Error opening edit modal', 'error');
    return;
  }

  // Safely set form values with null checks
  const setInputValue = (elementId, value) => {
    const el = document.getElementById(elementId);
    if (el) {
      el.value = value;
    } else {
      console.warn('Element not found:', elementId);
    }
  };

  setInputValue('edit-key-id', key.id);
  setInputValue('edit-key-name', key.name);
  setInputValue('edit-key-description', key.description || '');
  setInputValue('edit-key-daily-limit', key.daily_limit);
  setInputValue('edit-key-rate-limit', key.rate_limit_per_minute);
  setInputValue('edit-key-allowed-models', key.allowed_models || '*');
  setInputValue('edit-key-cors-origin', key.cors_origin || '*');
  setInputValue('edit-key-smart-context-limit', key.smart_context_limit || 10);

  const smartContextEl = document.getElementById('edit-key-smart-context');
  if (smartContextEl) {
    smartContextEl.checked = key.smart_context === 1;
  }

  const limitContainer = document.getElementById(
    'edit-smart-context-limit-container',
  );
  if (limitContainer) {
    limitContainer.style.display = key.smart_context === 1 ? 'block' : 'none';
  }

  modal.style.display = 'flex';
};

window.hideEditKeyModal = function () {
  const modal = document.getElementById('edit-key-modal');
  if (modal) modal.style.display = 'none';
};

// Setup edit key form - wrapped in function to ensure DOM is ready
function setupEditKeyForm() {
  const editKeyForm = document.getElementById('edit-key-form');
  if (!editKeyForm) return;

  const smartContextCheck = document.getElementById('edit-key-smart-context');
  const limitContainer = document.getElementById(
    'edit-smart-context-limit-container',
  );

  if (smartContextCheck && limitContainer) {
    smartContextCheck.addEventListener('change', () => {
      limitContainer.style.display = smartContextCheck.checked
        ? 'block'
        : 'none';
    });
  }

  editKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form elements safely
    const idEl = document.getElementById('edit-key-id');
    const nameEl = document.getElementById('edit-key-name');
    const descriptionEl = document.getElementById('edit-key-description');
    const dailyLimitEl = document.getElementById('edit-key-daily-limit');
    const rateLimitEl = document.getElementById('edit-key-rate-limit');
    const allowedModelsEl = document.getElementById('edit-key-allowed-models');
    const corsOriginEl = document.getElementById('edit-key-cors-origin');
    const smartContextEl = document.getElementById('edit-key-smart-context');
    const smartContextLimitEl = document.getElementById(
      'edit-key-smart-context-limit',
    );

    const id = idEl ? idEl.value : '';
    const name = nameEl ? nameEl.value : '';
    const description = descriptionEl ? descriptionEl.value : '';
    const dailyLimit = parseInt(dailyLimitEl ? dailyLimitEl.value : '0', 10);
    const rateLimit = parseInt(rateLimitEl ? rateLimitEl.value : '60', 10);
    const allowedModels = allowedModelsEl ? allowedModelsEl.value : '*';
    const corsOrigin = corsOriginEl ? corsOriginEl.value : '*';
    const smartContext = smartContextEl && smartContextEl.checked ? 1 : 0;
    const smartContextLimit = parseInt(
      smartContextLimitEl ? smartContextLimitEl.value : '10',
      10,
    );

    if (!id) {
      showToast('Invalid key ID', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/keys/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          dailyLimit,
          rateLimitPerMinute: rateLimit,
          allowedModels,
          corsOrigin,
          smartContext,
          smartContextLimit,
        }),
      });

      const data = await response.json();

      if (data.success) {
        hideEditKeyModal();
        fetchApiKeys();
        showToast('API key updated!', 'success');
      } else {
        showToast(data.error || 'Failed to update key', 'error');
      }
    } catch (error) {
      console.error('Error updating key:', error);
      showToast('Connection error', 'error');
    }
  });
}

// setupEditKeyForm will be called on DOMContentLoaded

function showNewKeyModal(key) {
  const valEl = document.getElementById('new-key-value');
  const modEl = document.getElementById('new-key-modal');
  if (valEl) valEl.textContent = key;
  if (modEl) modEl.style.display = 'flex';
}

window.hideNewKeyModal = function () {
  const modal = document.getElementById('new-key-modal');
  if (modal) modal.style.display = 'none';
};

window.copyNewKey = function () {
  const valEl = document.getElementById('new-key-value');
  if (valEl) {
    const key = valEl.textContent;
    navigator.clipboard.writeText(key);
    showToast('Copied to clipboard!', 'success');
  }
};

window.deactivateKey = async function (id) {
  try {
    await fetch(`/api/keys/${id}/deactivate`, { method: 'POST' });
    fetchApiKeys();
    showToast('Key deactivated');
  } catch (error) {
    showToast('Failed to deactivate key', 'error');
  }
};

window.activateKey = async function (id) {
  try {
    await fetch(`/api/keys/${id}/activate`, { method: 'POST' });
    fetchApiKeys();
    showToast('Key activated', 'success');
  } catch (error) {
    showToast('Failed to activate key', 'error');
  }
};

window.deleteKey = async function (id) {
  if (
    !confirm(
      'Are you sure you want to delete this API key? This action cannot be undone.',
    )
  )
    return;
  try {
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    fetchApiKeys();
    showToast('Key deleted');
  } catch (error) {
    showToast('Failed to delete key', 'error');
  }
};

window.toggleSmartContext = async function (id, enabled) {
  try {
    const res = await fetch(`/api/keys/${id}/smart-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      fetchApiKeys();
      showToast(`Smart Context ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      showToast('Failed to update Smart Context', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  }
};

// ================= =========================
// AUTHENTICATION
// ==========================================

window.logout = async function () {
  try {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (error) {
    showToast('Logout failed', 'error');
  }
};

// ==========================================
// UI RENDERING
// ==========================================

function animateValue(element, start, end, duration = 500) {
  if (!element) return;
  const startTime = performance.now();
  const update = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * easeOut);
    element.textContent = current;
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  };
  requestAnimationFrame(update);
}

function initCharts(analyticsData) {
  const usageCategories =
    analyticsData?.usage?.categories ||
    Array(24)
      .fill(0)
      .map((_, i) => `${i.toString().padStart(2, '0')}:00`);

  // Support multiple series (per model)
  const usageSeries = analyticsData?.usage?.series || [
    { name: 'No Data', data: Array(24).fill(0) },
  ];

  const usageOptions = {
    series: usageSeries,
    chart: {
      height: 350,
      type: 'area',
      stacked: true, // Enable stacking for breakdown
      toolbar: { show: false },
      background: 'transparent',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
        animateGradually: {
          enabled: true,
          delay: 150,
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350,
        },
      },
    },
    theme: { mode: getStoredTheme() },
    // colors: ['#6366f1'], // Let ApexCharts pick colors or define a palette
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.2,
        stops: [0, 90, 100],
      },
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      categories: usageCategories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        show: true,
        rotate: -45,
        style: { fontSize: '10px' },
      },
    },
    yaxis: {
      labels: {
        formatter: (val) => (val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val),
      },
    },
    grid: { borderColor: 'rgba(255,255,255,0.05)' },
    tooltip: {
      theme: 'dark',
      x: { show: true },
    },
  };

  const latencyLabels = analyticsData?.latency?.labels || [];
  const latencySeries = analyticsData?.latency?.data || [];
  const avgLatency =
    latencySeries.length > 0
      ? Math.round(
          latencySeries.reduce((a, b) => a + b, 0) / latencySeries.length,
        )
      : 0;

  const latencyOptions = {
    series: latencySeries,
    chart: {
      type: 'donut',
      height: 350,
      background: 'transparent',
    },
    labels: latencyLabels,
    theme: { mode: getStoredTheme() },
    colors: ['#6366f1', '#fb923c', '#34d399', '#f43f5e', '#8b5cf6', '#06b6d4'],
    legend: { position: 'bottom' },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Avg Latency',
              formatter: () => `${avgLatency}ms`,
            },
          },
        },
      },
    },
  };

  if (!usageChart) {
    usageChart = new ApexCharts(
      document.querySelector('#usage-chart'),
      usageOptions,
    );
    usageChart.render();
  } else if (analyticsData) {
    usageChart.updateOptions({
      xaxis: { categories: usageCategories },
    });
    usageChart.updateSeries(usageSeries);
  }

  if (!latencyChart) {
    latencyChart = new ApexCharts(
      document.querySelector('#latency-chart'),
      latencyOptions,
    );
    latencyChart.render();
  } else if (analyticsData) {
    latencyChart.updateOptions({
      labels: latencyLabels,
      plotOptions: {
        pie: {
          donut: {
            labels: {
              total: {
                formatter: () => `${avgLatency}ms`,
              },
            },
          },
        },
      },
    });
    latencyChart.updateSeries(latencySeries);
  }
}

function updateUI(analyticsData) {
  if (!currentStatus) return;

  // Initialize/Update charts
  initCharts(analyticsData);

  // Update System Status dot
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  if (currentStatus.readyAccounts > 0) {
    if (statusDot) statusDot.style.background = 'var(--accent-green)';
    if (statusText) statusText.textContent = 'Operational';
  } else {
    if (statusDot) statusDot.style.background = 'var(--accent-red)';
    if (statusText) statusText.textContent = 'Degraded';
  }

  // Animate Stats
  const statsMapping = {
    'stat-total': currentStatus.totalAccounts,
    'stat-ready': currentStatus.readyAccounts,
    'stat-cooldown': currentStatus.cooldownAccounts,
    'stat-errors': currentStatus.errorAccounts,
  };

  Object.entries(statsMapping).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) animateValue(el, 0, value);
  });

  const accountBadge = document.getElementById('account-badge');
  if (accountBadge)
    accountBadge.textContent = `${currentStatus.totalAccounts} accounts`;

  // Update Grid
  const grid = document.getElementById('accounts-grid');
  const container = document.getElementById('accounts-container');
  const emptyState = document.getElementById('empty-state');

  if (grid) {
    if (currentStatus.totalAccounts === 0) {
      if (container) container.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (container) container.style.display = 'block';
      if (emptyState) emptyState.style.display = 'none';

      grid.innerHTML = currentStatus.accounts
        .map((acc, index) => renderAccountCard(acc, currentQuotaStatus, index))
        .join('');
    }
  }

  // Update Models Grid
  const modelsGrid = document.getElementById('models-grid');
  if (modelsGrid) {
    const mbEl = document.getElementById('models-badge');
    if (mbEl) mbEl.textContent = `${availableModels.length} models`;

    modelsGrid.innerHTML = availableModels
      .map((model, index) => {
        const owner = MODEL_OWNERS[model] || 'unknown';
        const maxTokens = DEFAULT_MAX_TOKENS[model] || 0;
        const hasThinking = THINKING_LEVEL_MODELS.includes(model);
        const thinkingOnly = THINKING_ONLY_MODELS.includes(model);

        const ownerColors = {
          google: {
            bg: 'rgba(99, 102, 241, 0.15)',
            border: 'rgba(99, 102, 241, 0.3)',
            text: '#818cf8',
          },
          anthropic: {
            bg: 'rgba(249, 115, 22, 0.15)',
            border: 'rgba(249, 115, 22, 0.3)',
            text: '#fb923c',
          },
          openai: {
            bg: 'rgba(16, 185, 129, 0.15)',
            border: 'rgba(16, 185, 129, 0.3)',
            text: '#34d399',
          },
          unknown: {
            bg: 'rgba(107, 114, 128, 0.15)',
            border: 'rgba(107, 114, 128, 0.3)',
            text: '#9ca3af',
          },
        };
        const colors = ownerColors[owner] || ownerColors.unknown;

        return `
                <div class="model-card" style="animation-delay: ${index * 0.05}s">
                    <div class="model-header">
                        <div class="model-name">${model}</div>
                        <span class="owner-badge" style="background: ${colors.bg}; border-color: ${colors.border}; color: ${colors.text};">
                            ${owner}
                        </span>
                    </div>
                    <div class="model-details">
                        <div class="model-detail">
                            <span class="detail-label">Max Tokens</span>
                            <span class="detail-value">${maxTokens.toLocaleString()}</span>
                        </div>
                        <div class="model-detail">
                            <span class="detail-label">Thinking</span>
                            <span class="detail-value">${thinkingOnly ? 'Required' : hasThinking ? 'Supported' : 'No'}</span>
                        </div>
                    </div>
                    <div class="model-features">
                        ${hasThinking ? '<span class="feature-tag thinking">🧠 Extended Thinking</span>' : ''}
                        ${thinkingOnly ? '<span class="feature-tag thinking-only">⚡ Thinking Only</span>' : ''}
                    </div>
                </div>
            `;
      })
      .join('');
  }
}

function renderAccountCard(acc, quotaStatus, index) {
  const accountQuota = quotaStatus?.accounts?.find(
    (q) => q.accountId === acc.id,
  );

  const statusClass =
    acc.status === 'ready'
      ? 'status-ready'
      : acc.status === 'cooldown'
        ? 'status-cooldown'
        : 'status-error';

  const statusIcon =
    acc.status === 'ready'
      ? '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
      : acc.status === 'cooldown'
        ? '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
        : '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';

  const quotaHtml = renderQuotaHtml(accountQuota);

  return `
        <div class="account-card" style="animation-delay: ${index * 0.05}s">
            <div class="account-card-header">
                <div class="account-main-info">
                    <span class="account-id-badge"><code>${acc.id}</code></span>
                    <div class="account-email" title="${acc.email}">${acc.email}</div>
                </div>
                <div class="account-actions">
                    <button onclick="copyAccountEnv('${acc.id}', ${index + 1})" class="btn-icon" title="Copy .env format" style="color: var(--accent-blue);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                    </button>
                    <button onclick="deleteAccount('${acc.id}')" class="btn-icon" title="Delete Account" style="color: var(--accent-red);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>

            <div class="account-status-row">
                <span class="status-badge ${statusClass}">
                    ${statusIcon}
                    ${acc.status.toUpperCase()}
                </span>
                <span class="text-dim" style="font-size: 0.75rem; align-self: center;">
                    Last used: ${acc.lastUsed ? formatTimeAgo(acc.lastUsed) : 'Never'}
                </span>
            </div>

            <div class="account-stats-row">
                <div class="mini-stat">
                    <span class="mini-stat-label">Requests</span>
                    <span class="mini-stat-value">${acc.requestCount.toLocaleString()}</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat-label">Errors</span>
                    <span class="mini-stat-value ${acc.errorCount > 0 ? 'text-error' : ''}">${acc.errorCount}</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat-label">Health</span>
                    <span class="mini-stat-value" style="color: var(--accent-green)">99%</span>
                </div>
            </div>

            <div class="account-quota-section">
                <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Model Quotas</div>
                ${quotaHtml}
            </div>
        </div>
    `;
}

window.deleteAccount = async function (id) {
  if (!confirm('Are you sure you want to delete this account?')) return;
  try {
    const res = await fetch(`/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Account deleted successfully');
      fetchData();
    } else {
      showToast('Failed to delete account', 'error');
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
};

window.copyAccountEnv = async function (id, index) {
  try {
    const res = await fetch(`/accounts/${id}/export`);
    if (!res.ok) throw new Error('Failed to fetch credentials');

    const creds = await res.json();
    // Remove properties that shouldn't be in the JSON for cleanliness
    const { email, accessToken, refreshToken, expiryDate } = creds;
    const jsonStr = JSON.stringify({
      email,
      accessToken,
      refreshToken,
      expiryDate,
    });

    const envString = `ANTIGRAVITY_ACCOUNTS_${index}='${jsonStr}'`;

    await navigator.clipboard.writeText(envString);
    showToast('Copied .env config to clipboard!', 'success');
  } catch (e) {
    console.error(e);
    showToast('Failed to copy configuration', 'error');
  }
};

window.resetDatabase = async function () {
  if (
    !confirm(
      '⚠️ CRITICAL: This will delete ALL accounts, API keys, and logs. Are you sure?',
    )
  )
    return;
  try {
    const res = await fetch('/api/database/reset', { method: 'POST' });
    if (res.ok) {
      showToast('Database reset successfully!');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast('Failed to reset database', 'error');
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
};

window.exportDatabase = function () {
  window.location.href = '/api/database/export';
};

window.triggerImport = function () {
  document.getElementById('db-import-file').click();
};

window.importDatabase = async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm('Importing will overwrite current data. Are you sure?')) {
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const res = await fetch('/api/database/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        showToast('Database imported successfully!');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const err = await res.json();
        showToast('Import failed: ' + err.error, 'error');
      }
    } catch (err) {
      showToast('Invalid JSON file', 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
};

function renderQuotaHtml(accountQuota) {
  if (
    !accountQuota ||
    !accountQuota.models ||
    accountQuota.models.length === 0
  ) {
    return '<span class="text-dim">No quota data</span>';
  }

  // Normalize models using a map to handle duplicates and overrides
  const modelMap = new Map();

  accountQuota.models.forEach((m) => {
    modelMap.set(m.modelName, m);
  });

  // Explicitly map gemini-3-pro-high to gemini-3-pro-preview
  // This overwrites any existing preview data with high data as requested
  const highModel = modelMap.get('gemini-3-pro-high');
  if (highModel) {
    modelMap.set('gemini-3-pro-preview', {
      ...highModel,
      modelName: 'gemini-3-pro-preview',
    });
  }

  // Map flash variations
  const flashPreview =
    modelMap.get('gemini-3-pro-flash-preview') ||
    modelMap.get('gemini-3-pro-flash');
  if (flashPreview) {
    modelMap.set('gemini-3-flash', {
      ...flashPreview,
      modelName: 'gemini-3-flash',
    });
  }

  const processedModels = Array.from(modelMap.values());

  const relevantModels = processedModels.filter((m) =>
    availableModels.some(
      (am) => am.toLowerCase() === m.modelName.toLowerCase().trim(),
    ),
  );

  if (relevantModels.length === 0) {
    return '<span class="text-dim">No quota data</span>';
  }

  // Sort to ensure consistency and prioritize important models
  relevantModels.sort((a, b) => {
    if (a.modelName === 'gemini-3-pro-preview') return -1;
    if (b.modelName === 'gemini-3-pro-preview') return 1;
    return a.modelName.localeCompare(b.modelName);
  });

  return `
        <div class="quota-container">
            ${relevantModels
              .slice(0, 6)
              .map((m) => {
                const percentage = Math.round((1 - m.quota) * 100);
                const colorClass =
                  percentage > 90
                    ? 'error-color'
                    : percentage > 70
                      ? 'warning-color'
                      : 'success-color';
                return `
                    <div class="quota-item">
                        <div class="quota-info">
                            <span class="quota-label" title="${m.modelName}">${truncateModel(m.modelName)}</span>
                            <span class="quota-value">${percentage}%</span>
                        </div>
                        <div class="quota-bar-container">
                            <div class="quota-bar ${colorClass}" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
              })
              .join('')}
        </div>
    `;
}

function truncateModel(name) {
  if (name.length > 18) {
    return name.substring(0, 15) + '...';
  }
  return name;
}

function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ==========================================
// OAUTH POPUP
// ==========================================

window.openAuthPopup = function () {
  const width = 600;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  const popup = window.open(
    '/oauth/authorize',
    'AntigravityLogin',
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`,
  );

  if (popup) {
    showToast('Opening authentication window...', 'success', 2000);
  }
};

window.addEventListener('message', (event) => {
  if (event.data.type === 'OAUTH_SUCCESS') {
    showToast('Account added successfully!', 'success');
    refreshQuota();
  }
});

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================

document.addEventListener('keydown', (e) => {
  // Alt + R = Refresh
  if (e.altKey && e.key === 'r') {
    e.preventDefault();
    refreshQuota();
  }

  // Alt + T = Toggle theme
  if (e.altKey && e.key === 't') {
    e.preventDefault();
    toggleTheme();
  }

  // Alt + 1/2/3/4 = Navigate
  if (e.altKey && e.key === '1') {
    e.preventDefault();
    showView('dashboard');
  }
  if (e.altKey && e.key === '2') {
    e.preventDefault();
    showView('models');
  }
  if (e.altKey && e.key === '3') {
    e.preventDefault();
    showView('keys');
  }
  if (e.altKey && e.key === '4') {
    e.preventDefault();
    showView('docs');
  }
});

// ==========================================
// DOCS TAB FUNCTIONS
// ==========================================

window.showCodeTab = function (tab) {
  // Remove active from all tabs and panels
  document
    .querySelectorAll('.docs-tab')
    .forEach((t) => t.classList.remove('active'));
  document
    .querySelectorAll('.docs-code-panel')
    .forEach((p) => p.classList.remove('active'));

  // Add active to selected tab and panel
  event.target.classList.add('active');
  const panel = document.getElementById('code-' + tab);
  if (panel) panel.classList.add('active');
};

window.copyToClipboard = function (text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  });
};

// ==========================================
// ==========================================
// REAL-TIME UPDATES (WebSockets)
// ==========================================

function initRealtime() {
  if (typeof io === 'undefined') {
    console.warn('Socket.io not loaded. Real-time updates disabled.');
    return;
  }

  // Connect to Socket.IO on the dedicated port (server port + 1)
  const wsPort = parseInt(window.location.port || '80', 10) + 1;
  const wsUrl = `${window.location.protocol}//${window.location.hostname}:${wsPort}`;

  console.log(`Connecting to Socket.IO at ${wsUrl}`);
  socket = io(wsUrl);

  socket.on('connect', () => {
    console.log('Connected to real-time events');
    const statusDot = document.querySelector('.status-dot');
    if (statusDot) statusDot.classList.add('pulse');
  });

  socket.on('disconnect', () => {
    console.warn('Disconnected from real-time events');
    const statusDot = document.querySelector('.status-dot');
    if (statusDot) statusDot.classList.remove('pulse');
  });

  socket.on('dashboard.update', (data) => {
    console.log('Real-time dashboard update received');
    currentStatus = data.status;
    currentQuotaStatus = data.quotaStatus;
    updateUI();
  });

  socket.on('analytics.newRequest', async (data) => {
    console.log('Real-time analytics event:', data);
    // Fetch fresh analytics data to keep charts accurate
    try {
      const res = await fetch('/api/keys/stats/analytics');
      if (res.ok) {
        const analyticsData = await res.json();
        initCharts(analyticsData);
      }

      // Also update the summary stats if we're on dashboard
      const resStats = await fetch('/api/dashboard');
      if (resStats.ok) {
        const dashboardData = await resStats.json();
        currentStatus = dashboardData.status;
        currentQuotaStatus = dashboardData.quotaStatus;
        updateUI(); // This will also call initCharts but we already did it
      }
    } catch (e) {
      console.error('Failed to update analytics real-time', e);
    }
  });

  socket.on('account.statusChange', (data) => {
    showToast(
      `Account ${data.email} is now ${data.status}`,
      data.status === 'ready' ? 'success' : 'warning',
    );
  });
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Set theme
  setTheme(getStoredTheme());

  // Create toast container
  createToastContainer();

  // Add pulse animation for status dot
  const style = document.createElement('style');
  style.textContent = `
      @keyframes fadeOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(20px); }
      }
      @keyframes pulse-green {
        0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
      }
      .status-dot.pulse {
        animation: pulse-green 2s infinite;
      }
  `;
  document.head.appendChild(style);

  // Setup forms (call again in case DOM wasn't ready before)
  setupCreateKeyForm();
  setupEditKeyForm();

  // Fetch initial data
  fetchData();

  // Initialize Real-time
  initRealtime();

  // Polling fallback (increased to 5 mins as we have real-time now)
  setInterval(() => {
    if (!document.hidden && (!socket || !socket.connected)) {
      fetchData();
    }
  }, 300000);
});

// Refresh when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !isLoading) {
    fetchData();
  }
});
