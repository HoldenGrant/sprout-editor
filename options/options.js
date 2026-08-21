// options/options.js
//
// Lets the user paste a GitHub Personal Access Token and stores it via
// services/github-auth.js (chrome.storage.local only — never written into
// source code or transmitted anywhere except https://api.github.com).

import { getToken, setToken, clearToken, validateToken } from '../services/github-auth.js';

const els = {
  tokenInput: document.getElementById('tokenInput'),
  tokenState: document.getElementById('tokenState'),
  validateBtn: document.getElementById('validateBtn'),
  saveBtn: document.getElementById('saveBtn'),
  clearBtn: document.getElementById('clearBtn'),
  statusMessage: document.getElementById('statusMessage'),
};

init();

async function init() {
  const existingToken = await getToken();
  if (existingToken) {
    els.tokenInput.placeholder = maskToken(existingToken);
    els.tokenState.textContent = 'A token is currently saved.';
  }

  els.validateBtn.addEventListener('click', handleValidate);
  els.saveBtn.addEventListener('click', handleSave);
  els.clearBtn.addEventListener('click', handleClear);
}

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
    showStatus(`✓ Saved. Sprout Editor will commit as @${login}.`, 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    setBusy(false, els.saveBtn, 'Save Token');
  }
}

async function handleClear() {
  await clearToken();
  els.tokenInput.value = '';
  els.tokenInput.placeholder = 'github_pat_…';
  els.tokenState.textContent = '';
  showStatus('Token removed.', 'success');
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
