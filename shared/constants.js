// Shared constants used across content scripts, background, editor, and services.
// Keeping these in one place avoids magic strings scattered across modules.

// chrome.storage keys
export const STORAGE_KEYS = {
  GITHUB_TOKEN: 'sprout_github_token',
  // Prefix for per-session handoff records written by the background worker and
  // read once by the editor page. Full key is `${SESSION_PREFIX}${sessionId}`.
  SESSION_PREFIX: 'sprout_session_',
};

// GitHub API base URLs. Only the REST Contents API is used (no GraphQL) so the
// same auth header logic covers reads, writes, and asset fetches uniformly.
export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_API_VERSION = '2022-11-28';

// GitHub OAuth Device Flow endpoints (github.com, NOT api.github.com) — see
// services/github-auth.js. Device flow needs no client secret (it's designed
// for apps, like this one, that can't protect one), so it can run entirely
// from the extension with no backend server.
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// The GitHub App's public Client ID (safe to embed — it identifies the app,
// it isn't a secret; device flow never uses a client secret at all).
// Create the app at https://github.com/settings/apps/new — repository
// permission "Contents: Read and write", "Enable Device Flow" checked under
// the app's settings, installable on "Any account" so anyone can connect
// their own repos — then paste its Client ID here. See README.md.
export const GITHUB_APP_CLIENT_ID = 'Iv23liH6tOU1eqyGUcG7';

// The GitHub App's slug (the URL-friendly name shown at github.com/apps/<slug>).
// Authorizing the app (device flow) and INSTALLING it on specific repos are two
// separate consent steps — a user can complete device flow successfully and
// still have zero repo access until they also visit this install URL. See
// github-auth.js hasAnyInstallation() / signInWithDeviceFlow().
export const GITHUB_APP_SLUG = 'sprout-editor';

export function githubAppInstallUrl() {
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;
}

// runtime.sendMessage type used by the content script to ask the background
// worker to open the editor. NOTE: content scripts are classic (non-module)
// scripts, so they cannot `import` this file — content/github-toolbar.js
// hardcodes the same literal string. Keep the two in sync if this changes.
export const MESSAGE_TYPES = {
  OPEN_EDITOR: 'SPROUT_OPEN_EDITOR',
};

// Tags eligible for MODE 1 "smart detection" text editing.
export const SMART_TEXT_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'LI'];

// Generic container tags that are ONLY treated as editable text when they're
// a "leaf" holding nothing but text (see html-utils.js isLeafTextElement).
// Unlike SMART_TEXT_TAGS above, these are never unconditionally editable —
// a bare <div> is usually a big structural wrapper with lots of nested
// content, and making every one of those individually clickable/
// contentEditable would be both noisy (divs are everywhere) and risky
// (typing inside a wrapper could mangle its nested structure). But a leaf
// div/td/etc. — no child elements, just text, e.g. a template's
// `<div class="stat-label">10+ years…</div>` — is exactly as safe to edit
// as a <p>, and this pattern is extremely common in real-world templates.
export const GENERIC_LEAF_TEXT_TAGS = ['DIV', 'TD', 'TH', 'DT', 'DD', 'LABEL', 'FIGCAPTION', 'SUMMARY', 'BLOCKQUOTE', 'CAPTION'];

// Tags eligible for MODE 1 "smart detection" button/link editing.
export const SMART_BUTTON_TAGS = ['A', 'BUTTON'];

// Tags eligible for MODE 1 "smart detection" image editing.
export const SMART_IMAGE_TAGS = ['IMG'];

// Structural container tags — reachable and editable (background color/image,
// padding/margin) via the Layers panel, but deliberately NOT wired for hover/
// click in the canvas itself (see canvas.js _wireInteractions). Every <div>
// on a real page would otherwise become individually hoverable/clickable,
// which is exactly the noise GENERIC_LEAF_TEXT_TAGS above was designed to
// avoid — the Layers panel is a more deliberate way to reach a specific
// section without cluttering the main click-to-edit surface.
export const CONTAINER_TAGS = ['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'NAV', 'UL', 'OL', 'FIGURE', 'TABLE', 'FORM'];

// MODE 2 explicit opt-in attribute. Value determines the editor kind.
export const SPROUT_ATTR = 'data-sprout';
export const SPROUT_KINDS = {
  TEXT: 'text',
  IMAGE: 'image',
  BUTTON: 'button',
  CONTAINER: 'container',
};

// Internal attribute the editor stamps on every editable element so it can be
// referenced reliably by history/inspector/save logic. Stripped before saving.
export const SPROUT_UID_ATTR = 'data-sprout-uid';

// When file-loader.js rewrites an attribute's value for preview purposes
// (e.g. an <img src> relative path becomes a data: URI so it renders in the
// iframe), it stashes the pre-rewrite value under this marker so the
// Inspector can display the real path and editor.js can use it as the
// correct undo/save baseline instead of the rewritten preview value.
export function originalValueAttr(attrName) {
  return `data-sprout-original-${attrName}`;
}

// Editor-only DOM markers that must never be written back to GitHub.
export const EDITOR_ONLY_STYLE_ID = 'sprout-editor-injected-styles';
export const EDITOR_HOVER_CLASS = 'sprout-hover-outline';
export const EDITOR_SELECTED_CLASS = 'sprout-selected-outline';

// Default commit message used when the user doesn't customize it.
export function defaultCommitMessage(fileName) {
  return `Update ${fileName} with Sprout Editor`;
}

// Extension -> MIME type map, used to build data: URIs for binary preview assets
// (images/fonts) fetched from the Contents API as base64.
export const EXT_MIME_MAP = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  css: 'text/css',
  js: 'text/javascript',
};

export function mimeTypeForPath(path) {
  const ext = path.split('.').pop().toLowerCase();
  return EXT_MIME_MAP[ext] || 'application/octet-stream';
}
