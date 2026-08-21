// options/options.js
//
// Two ways to connect a GitHub account, both landing in the same storage
// (see services/github-auth.js):
//   - "Connect with GitHub" (OAuth device flow) — the recommended path.
//   - The "Advanced" <details> section — paste a Personal Access Token by hand.

import {
  getToken,
  setToken,
  clearToken,
  validateToken,
  signInWithDeviceFlow,
  isDeviceFlowConfigured,
} from '../services/github-auth.js';

const els = {
  connectedBanner: document.getElementById('connectedBanner'),
  connectedBannerText: document.getElementById('connectedBannerText'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  connectBtn: document.getElementById('connectBtn'),
  connectStatus: document.getElementById('connectStatus'),
  advancedSection: document.getElementById('advancedSection'),
  tokenInput: document.getElementById('tokenInput'),
  tokenState: document.getElementById('tokenState'),
  validateBtn: document.getElementById('validateBtn'),
  saveBtn: document.getElementById('saveBtn'),
  statusMessage: document.getElementById('statusMessage'),
};

init();

async function init() {
  await refreshConnectedState();

  if (!isDeviceFlowConfigured()) {
    // No GitHub App Client ID configured yet — device flow can't work, so
    // don't offer a button that's guaranteed to fail. The Advanced/PAT path
    // still works regardless. See shared/constants.js GITHUB_APP_CLIENT_ID.
    els.connectBtn.disabled = true;
    els.connectBtn.textContent = 'Connect with GitHub (not configured)';
    els.advancedSection.open = true;
    showConnectStatus('GitHub sign-in isn’t set up yet — use a Personal Access Token below.', 'info');
  }

  els.connectBtn.addEventListener('click', handleConnectClick);
  els.disconnectBtn.addEventListener('click', handleDisconnect);
  els.validateBtn.addEventListener('click', handleValidate);
  els.saveBtn.addEventListener('click', handleSave);
}

async function refreshConnectedState() {
  const existingToken = await getToken();
  if (!existingToken) {
    els.connectedBanner.style.display = 'none';
    return;
  }

  els.connectedBanner.style.display = 'flex';
  els.connectedBannerText.textContent = 'Checking connection…';
  try {
    const login = await validateToken(existingToken);
    els.connectedBannerText.textContent = `✓ Connected to GitHub as @${login}`;
  } catch {
    els.connectedBannerText.textContent = '⚠ A saved token was rejected by GitHub — reconnect below.';
  }
}

async function handleDisconnect() {
  await clearToken();
  els.connectedBanner.style.display = 'none';
  els.tokenInput.value = '';
  els.tokenInput.placeholder = 'github_pat_…';
  els.tokenState.textContent = '';
  showStatus('Disconnected.', 'success');
}

// ---------- Device flow ("Connect with GitHub") ----------

async function handleConnectClick() {
  els.connectBtn.disabled = true;
  els.connectBtn.textContent = 'Connecting…';
  hideConnectStatus();

  try {
    const { login } = await signInWithDeviceFlow({
      onCodeReady: ({ userCode, verificationUri }) => {
        showConnectStatus(
          `1. Go to ${verificationUri}\n2. Enter this code:`,
          'info',
          userCode
        );
      },
      onPolling: () => {
        els.connectBtn.textContent = 'Waiting for you to authorize…';
      },
    });

    await refreshConnectedState();
    hideConnectStatus();
    showStatus(`✓ Connected as @${login}.`, 'success');
  } catch (error) {
    showConnectStatus(error.message, 'error');
  } finally {
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'Connect with GitHub';
  }
}

function showConnectStatus(message, type, code) {
  els.connectStatus.className = `status-box ${type}`;
  els.connectStatus.innerHTML = '';
  const text = document.createElement('div');
  text.style.whiteSpace = 'pre-line';
  text.textContent = message;
  els.connectStatus.appendChild(text);
  if (code) {
    const codeBox = document.createElement('div');
    codeBox.className = 'device-code';
    codeBox.textContent = code;
    els.connectStatus.appendChild(codeBox);
  }
}

function hideConnectStatus() {
  els.connectStatus.className = '';
  els.connectStatus.innerHTML = '';
}

// ---------- Advanced: manual Personal Access Token ----------

async function handleValidate() {
  const token = els.tokenInput.value.trim();
  if (!token) return showStatus('Paste a token first.', 'error');

  setBusy(true, els.validateBtn, 'Checking…');
  try {
    const login = await validateToken(token);
    showStatus(`✓ Token works — authenticated as @${login}.`, 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    setBusy(false, els.validateBtn, 'Validate');
  }
}

async function handleSave() {
  const token = els.tokenInput.value.trim();
  if (!token) return showStatus('Paste a token first.', 'error');

  setBusy(true, els.saveBtn, 'Saving…');
  try {
    // Validate before saving so a typo doesn't get silently stored.
    const login = await validateToken(token);
    await setToken(token);
    els.tokenInput.value = '';
    els.tokenInput.placeholder = maskToken(token);
    els.tokenState.textContent = 'A token is currently saved.';
    await refreshConnectedState();
    showStatus(`✓ Saved. Sprout Editor will commit as @${login}.`, 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    setBusy(false, els.saveBtn, 'Save Token');
  }
}

function maskToken(token) {
  return `${'•'.repeat(Math.max(token.length - 4, 4))}${token.slice(-4)}`;
}

function setBusy(isBusy, button, label) {
  button.disabled = isBusy;
  button.textContent = label;
}

function showStatus(message, type) {
  els.statusMessage.textContent = message;
  els.statusMessage.className = type;
}
