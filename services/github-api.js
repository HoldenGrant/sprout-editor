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

  if (response.status === 401 || response.status === 403) {
    return new GitHubAuthError(
      `GitHub rejected the request — check your Personal Access Token in the Sprout Editor options page.${detail}`,
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
      ? 'If this is a private repository, make sure your GitHub token in Sprout Editor’s options has access to it.'
      : 'If this is a private repository, add a GitHub Personal Access Token in Sprout Editor’s options (⋮ menu → Options) — GitHub reports private files as "not found" to anyone without access.';
    return new GitHubApiError(`Not found.${detail} ${fallbackMessage} ${hint}`, 404);
  }
  return new GitHubApiError(`${fallbackMessage}${detail}`, response.status);
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
