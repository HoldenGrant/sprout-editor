// services/github-auth.js
//
// Authentication layer, deliberately separated from services/github-api.js so
// the *how* of getting a token can change without touching anything that
// calls the GitHub API.
//
// Two ways to connect, both ending in the same place — a token in
// chrome.storage.local, read by getAuthHeaders()/hasToken():
//
//   1. RECOMMENDED: GitHub OAuth Device Flow (signInWithDeviceFlow below).
//      No client secret is involved — that's the whole point of device flow,
//      it's designed for apps (like this one) that can't protect one — so it
//      runs entirely client-side, no backend server required. The user just
//      clicks "Connect with GitHub", gets a short code, enters it at
//      github.com/login/device, and picks which repos to grant access to.
//   2. FALLBACK: a user-pasted Personal Access Token (fine-grained "Contents:
//      Read and write"), for advanced users or before GITHUB_APP_CLIENT_ID
//      (shared/constants.js) is configured.
//
// Both paths write to the exact same storage key via setToken(), so
// services/github-api.js never needs to know or care which one was used.

import {
  STORAGE_KEYS,
  GITHUB_API_BASE,
  GITHUB_API_VERSION,
  GITHUB_DEVICE_CODE_URL,
  GITHUB_DEVICE_TOKEN_URL,
  GITHUB_APP_CLIENT_ID,
} from '../shared/constants.js';

const tokenStorageStrategy = {
  async getToken() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.GITHUB_TOKEN);
    return result[STORAGE_KEYS.GITHUB_TOKEN] || null;
  },

  async setToken(token) {
    await chrome.storage.local.set({ [STORAGE_KEYS.GITHUB_TOKEN]: token });
  },

  async clearToken() {
    await chrome.storage.local.remove(STORAGE_KEYS.GITHUB_TOKEN);
  },
};

export async function getToken() {
  return tokenStorageStrategy.getToken();
}

export async function setToken(token) {
  return tokenStorageStrategy.setToken(token);
}

export async function clearToken() {
  return tokenStorageStrategy.clearToken();
}

export async function hasToken() {
  return Boolean(await tokenStorageStrategy.getToken());
}

/** Build fetch() headers for an authenticated GitHub API request. */
export async function getAuthHeaders() {
  const token = await tokenStorageStrategy.getToken();
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Verify a token actually works by calling GET /user. Returns the
 * authenticated login on success, throws a descriptive error otherwise.
 * Does not depend on the stored token, so a token can be checked before
 * saving it (used by both the manual-PAT and device-flow paths).
 */
export async function validateToken(token) {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('That token was rejected by GitHub (invalid or expired).');
    }
    // A 403 here isn't necessarily a bad token — GitHub reports "you've hit
    // the hourly API limit" the same way. Same distinction as
    // services/github-api.js's toApiError; duplicated rather than imported
    // to avoid a circular import (github-api.js already imports from here).
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new Error("GitHub's hourly API limit for this account was hit — wait a bit and try again, this isn't a problem with the token.");
    }
    throw new Error(`GitHub returned an unexpected error (${response.status}).`);
  }

  const user = await response.json();
  return user.login;
}

// ---------- OAuth Device Flow ----------
// Reference: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow

export function isDeviceFlowConfigured() {
  return Boolean(GITHUB_APP_CLIENT_ID) && !GITHUB_APP_CLIENT_ID.startsWith('REPLACE_WITH');
}

/**
 * Step 1: ask GitHub for a device code + short user-facing code.
 * @returns {{ deviceCode: string, userCode: string, verificationUri: string, expiresIn: number, interval: number }}
 */
async function requestDeviceCode() {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: GITHUB_APP_CLIENT_ID }),
  });
  if (!response.ok) throw new Error('Could not start GitHub sign-in. Check your connection and try again.');

  const data = await response.json();
  if (data.error) throw new Error(data.error_description || 'Could not start GitHub sign-in.');

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
}

/**
 * Step 2: poll GitHub until the user finishes authorizing at verificationUri
 * (or the code expires / they deny it). Respects the server-given interval,
 * including "slow_down" backoff, per the device flow spec.
 * @returns {string} access_token
 */
async function pollForAccessToken({ deviceCode, interval, expiresIn, onTick }) {
  const deadline = Date.now() + expiresIn * 1000;
  let waitSeconds = interval;

  while (Date.now() < deadline) {
    await sleep(waitSeconds * 1000);
    onTick?.();

    const response = await fetch(GITHUB_DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: GITHUB_APP_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = await response.json();

    if (data.access_token) return data.access_token;

    switch (data.error) {
      case 'authorization_pending':
        continue; // user hasn't entered the code yet — keep polling
      case 'slow_down':
        waitSeconds += 5; // GitHub asking us to back off, per spec
        continue;
      case 'expired_token':
        throw new Error('That sign-in code expired. Click "Connect with GitHub" to get a new one.');
      case 'access_denied':
        throw new Error('Sign-in was cancelled.');
      default:
        throw new Error(data.error_description || 'GitHub sign-in failed.');
    }
  }

  throw new Error('That sign-in code expired. Click "Connect with GitHub" to get a new one.');
}

/**
 * Full device-flow sign-in, driven from the Options page.
 * @param {{ onCodeReady: (info: {userCode: string, verificationUri: string}) => void, onPolling?: () => void }} callbacks
 * @returns {{ login: string, hasInstallation: boolean }} hasInstallation is
 *   false when the user authorized the app but hasn't installed it on any
 *   repos yet — see hasAnyInstallation() below for why that's a distinct step.
 */
export async function signInWithDeviceFlow({ onCodeReady, onPolling } = {}) {
  if (!isDeviceFlowConfigured()) {
    throw new Error(
      'GitHub sign-in isn’t configured yet (missing GITHUB_APP_CLIENT_ID in shared/constants.js). Use a Personal Access Token below instead.'
    );
  }

  const { deviceCode, userCode, verificationUri, expiresIn, interval } = await requestDeviceCode();
  onCodeReady?.({ userCode, verificationUri });

  const accessToken = await pollForAccessToken({ deviceCode, interval, expiresIn, onTick: onPolling });
  await setToken(accessToken);
  const login = await validateToken(accessToken);
  const hasInstallation = await hasAnyInstallation(accessToken);
  return { login, hasInstallation };
}

/**
 * Authorizing a GitHub App (what device flow does) and INSTALLING it on
 * specific repos are two separate consent steps in GitHub's model — a user
 * can complete device flow successfully and still have a token with zero
 * repo access until they also visit the app's install page. GET
 * /user/installations lists installations the token can see; an empty list
 * means "authorized but not installed anywhere yet".
 */
async function hasAnyInstallation(token) {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/user/installations`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return true; // don't block sign-in on an unexpected check failure
    const data = await response.json();
    return (data.total_count ?? 0) > 0;
  } catch {
    return true; // fail open — worst case, the user hits the normal 404-with-hint later
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
