// popup/popup.js
//
// The toolbar-icon popup — a quick at-a-glance "are we connected?" plus a
// one-click way into the full Settings page. Deliberately thin: it never
// runs the GitHub OAuth device flow itself (see note below), it only reads
// existing connection state and offers navigation.

import { getToken, clearToken, validateToken } from '../services/github-auth.js';

const els = {
  status: document.getElementById('status'),
  statusText: document.getElementById('statusText'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
};

init();

async function init() {
  els.settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  els.disconnectBtn.addEventListener('click', handleDisconnect);
  await refreshStatus();
}

async function refreshStatus() {
  const token = await getToken();

  if (!token) {
    setStatus('disconnected', 'Not connected — open Settings to connect a GitHub account.');
    els.disconnectBtn.style.display = 'none';
    return;
  }

  // A token exists locally — offer Disconnect regardless of whether it still
  // validates, so a stale/revoked one can be cleared right from here.
  els.disconnectBtn.style.display = 'block';
  setStatus('loading', 'Checking connection…');

  try {
    const login = await validateToken(token);
    setStatus('connected', `Connected as @${login}`);
  } catch {
    setStatus('disconnected', 'Saved connection was rejected by GitHub — reconnect in Settings.');
  }
}

async function handleDisconnect() {
  els.disconnectBtn.disabled = true;
  await clearToken();
  await refreshStatus();
  els.disconnectBtn.disabled = false;
}

function setStatus(kind, text) {
  els.status.className = `status status--${kind}`;
  els.statusText.textContent = text;
}

// NOTE: "Connect with GitHub" (the OAuth device flow) intentionally lives
// only on the Settings page, not here. It needs its own tab to stay open
// while polling GitHub for authorization — an extension popup like this one
// closes the instant focus moves to a new tab (e.g. the github.com/login/
// device tab the flow sends you to), which would silently kill the flow
// partway through. See services/github-auth.js signInWithDeviceFlow().
