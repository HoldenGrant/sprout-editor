// services/github-api.js
//
// Thin wrapper around the GitHub REST Contents API. This is the ONLY module
// that knows about GitHub's HTTP endpoints — UI code (editor.js) and loading
// logic (file-loader.js) call these functions and never touch fetch()/URLs
// directly. Auth headers come from services/github-auth.js.

import { GITHUB_API_BASE } from '../shared/constants.js';
import { getAuthHeaders, hasToken } from './github-auth.js';

export class GitHubApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export class GitHubConflictError extends GitHubApiError {
  constructor(message) {
    super(message, 409);
    this.name = 'GitHubConflictError';
  }
}

export class GitHubAuthError extends GitHubApiError {
  constructor(message, status) {
    super(message, status);
    this.name = 'GitHubAuthError';
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  constructor(message, status) {
    super(message, status);
    this.name = 'GitHubRateLimitError';
  }
}

/**
 * GET a file's contents + metadata from a repo via the Contents API.
 * @returns {{ path: string, sha: string, base64: string, size: number, name: string }}
 */
export async function getFile(owner, repo, path, ref) {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
  const headers = await getAuthHeaders();

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw await toApiError(response, `Could not load ${path} from ${owner}/${repo}@${ref}.`);
  }

  const data = await response.json();

  if (Array.isArray(data) || data.type !== 'file') {
    throw new GitHubApiError(`${path} is not a file.`, 400);
  }

  return {
    path: data.path,
    sha: data.sha,
    base64: (data.content || '').replace(/\n/g, ''),
    size: data.size,
    name: data.name,
  };
}

/**
 * List every .html/.htm file in a repo at a given branch, at any depth —
 * powers the editor's file-switcher dropdown. Uses the Git Trees API (one
 * recursive call) rather than walking directories one at a time.
 * @returns {string[]} repo-relative paths, sorted
 */
export async function listHtmlFiles(owner, repo, branch) {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const headers = await getAuthHeaders();

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw await toApiError(response, `Could not list files in ${owner}/${repo}@${branch}.`);
  }

  const data = await response.json();
  if (data.truncated) {
    // GitHub caps the recursive tree response for very large repos — the
    // switcher just won't show every file in that case. Loading/saving the
    // one file the user is already on is unaffected either way.
    console.warn('Sprout Editor: repo file tree was truncated by GitHub — the file switcher may not list every .html file.');
  }

  return (data.tree || [])
    .filter((entry) => entry.type === 'blob' && /\.html?$/i.test(entry.path))
    .map((entry) => entry.path)
    .sort();
}

/**
 * PUT updated content for an existing file (create-a-commit). Requires the
 * current `sha` so GitHub can detect concurrent edits — if the file changed
 * since it was loaded, GitHub responds 409 and we surface a GitHubConflictError
 * rather than silently overwriting someone else's change.
 */
export async function updateFile(owner, repo, path, { base64Content, message, sha, branch }) {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const authHeaders = await getAuthHeaders();

  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: base64Content,
      sha,
      branch,
    }),
  });

  if (!response.ok) {
    if (response.status === 409) {
      throw new GitHubConflictError(
        'This file changed on GitHub since you loaded it. Reload the latest version before saving to avoid overwriting someone else’s changes.'
      );
    }
    throw await toApiError(response, `Could not save ${path} to ${owner}/${repo}.`);
  }

  const data = await response.json();
  return {
    sha: data.content?.sha,
    commitSha: data.commit?.sha,
    commitUrl: data.commit?.html_url,
  };
}

async function toApiError(response, fallbackMessage) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.message ? ` (${body.message})` : '';
  } catch {
    // response body wasn't JSON; ignore
  }

  // GitHub reports both "you've hit your hourly limit" (primary) and
  // "you're sending requests too fast" (secondary/abuse) rate limiting as a
  // plain 403 — the same status code a real bad-credentials rejection uses.
  // Telling someone to "reconnect" for a rate limit is actively wrong advice
  // (it does nothing, they just need to wait), so this has to be checked
  // *before* the generic 401/403 branch below, using the extra signals
  // GitHub sends only for rate limiting: an `x-ratelimit-remaining: 0`
  // header for the primary case, or "secondary rate limit" in the error
  // body's own message for the abuse case.
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    return new GitHubRateLimitError(
      `GitHub's hourly API limit for this account was hit — it resets ${formatRateLimitReset(response.headers.get('x-ratelimit-reset'))}. No need to reconnect, just wait and try again.${detail}`,
      response.status
    );
  }
  if ((response.status === 403 || response.status === 429) && /secondary rate limit/i.test(detail)) {
    return new GitHubRateLimitError(
      `GitHub is temporarily throttling requests from this account — wait ${formatRetryAfter(response.headers.get('retry-after'))} and try again.${detail}`,
      response.status
    );
  }

  if (response.status === 401 || response.status === 403) {
    // Message is deliberately connection-method-agnostic ("your GitHub
    // connection", not "Personal Access Token") — the user may have
    // connected via either the OAuth device flow or a pasted PAT, and a
    // stale reference to the wrong one is confusing either way.
    return new GitHubAuthError(
      `GitHub rejected the request (invalid or expired credentials). Reconnect in the Sprout Editor options page.${detail}`,
      response.status
    );
  }
  if (response.status === 404) {
    // GitHub returns 404 (not 403) for a private repo/branch/path the
    // requester can't see, to avoid leaking that it exists — so a 404 here
    // is very often really an auth problem, not a typo. Steer the user
    // toward the actual likely fix instead of a bare "Not found."
    const tokenConfigured = await hasToken();
    const hint = tokenConfigured
      ? 'If this is a private repository, make sure your GitHub connection in Sprout Editor’s options has access to it.'
      : 'If this is a private repository, connect a GitHub account in Sprout Editor’s options (⋮ menu → Options) — GitHub reports private files as "not found" to anyone without access.';
    return new GitHubApiError(`Not found.${detail} ${fallbackMessage} ${hint}`, 404);
  }
  return new GitHubApiError(`${fallbackMessage}${detail}`, response.status);
}

/** Turns the `x-ratelimit-reset` header (Unix seconds) into "in about N minutes". */
function formatRateLimitReset(resetHeaderValue) {
  const resetSeconds = Number(resetHeaderValue);
  if (!Number.isFinite(resetSeconds)) return 'shortly';
  const msRemaining = resetSeconds * 1000 - Date.now();
  if (msRemaining <= 0) return 'now — try again';
  const minutes = Math.ceil(msRemaining / 60000);
  return minutes <= 1 ? 'in about a minute' : `in about ${minutes} minutes`;
}

/** Turns a `retry-after` header (seconds) into "a minute" / "N minutes". */
function formatRetryAfter(retryAfterHeaderValue) {
  const seconds = Number(retryAfterHeaderValue);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'a minute';
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'a minute' : `${minutes} minutes`;
}

// Path segments must be individually percent-encoded but slashes preserved.
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Decode a GitHub Contents API base64 payload into a UTF-8 string (for text files). */
export function base64ToUtf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** Encode a UTF-8 string into the base64 payload the Contents API expects. */
export function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

/** Build a data: URI directly from a base64 payload + mime type (binary-safe, no re-encoding). */
export function base64ToDataUri(base64, mimeType) {
  return `data:${mimeType};base64,${base64}`;
}
