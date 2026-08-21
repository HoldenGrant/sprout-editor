// services/github-auth.js
//
// Authentication layer, deliberately separated from services/github-api.js so
// the *how* of getting a token can change without touching anything that
// calls the GitHub API.
//
// v1 strategy: a user-supplied Personal Access Token (fine-grained "Contents:
// Read and write" scope on the target repo), entered on the Options page and
// stored only in chrome.storage.local. It never appears in source code.
//
// To add OAuth later (device flow or a GitHub App + small token-exchange
// backend, since a browser extension cannot keep a client secret), implement
// a new strategy object with the same {getToken, setToken, clearToken} shape
// and swap `activeStrategy` below — services/github-api.js and every UI
// caller only ever use getAuthHeaders()/hasToken(), so nothing else changes.

import { STORAGE_KEYS, GITHUB_API_BASE, GITHUB_API_VERSION } from '../shared/constants.js';

const personalAccessTokenStrategy = {
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

// Swap this to change auth strategy (see comment above).
const activeStrategy = personalAccessTokenStrategy;

export async function getToken() {
  return activeStrategy.getToken();
}

export async function setToken(token) {
  return activeStrategy.setToken(token);
}

export async function clearToken() {
  return activeStrategy.clearToken();
}

export async function hasToken() {
  return Boolean(await activeStrategy.getToken());
}

/** Build fetch() headers for an authenticated GitHub API request. */
export async function getAuthHeaders() {
  const token = await activeStrategy.getToken();
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
 * Used by the Options page's "Validate" button — does not depend on the
 * stored token, so a token can be checked before saving it.
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
    throw new Error(`GitHub returned an unexpected error (${response.status}).`);
  }

  const user = await response.json();
  return user.login;
}
