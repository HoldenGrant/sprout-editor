// background/service-worker.js
//
// MV3 background service worker. Its only job: receive the OPEN_EDITOR
// message from the content script, hand the file context off to the editor
// page via chrome.storage.session (ephemeral, not persisted to disk), and
// open the editor in a new tab.

import { STORAGE_KEYS, MESSAGE_TYPES } from '../shared/constants.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPES.OPEN_EDITOR) return false;

  openEditorForFile(message.payload)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error('Sprout Editor: failed to open editor tab.', error);
      sendResponse({ ok: false, error: String(error) });
    });

  return true; // keep the message channel open for the async response
});

/**
 * Stash the parsed GitHub file context in session storage under a fresh id,
 * then open the editor tab pointed at that session id. The editor reads and
 * clears the record on load (see editor/editor.js).
 */
async function openEditorForFile(fileInfo) {
  if (!fileInfo?.owner || !fileInfo?.repo || !fileInfo?.branch || !fileInfo?.path) {
    throw new Error('Missing file info from content script.');
  }

  const sessionId = crypto.randomUUID();
  const key = `${STORAGE_KEYS.SESSION_PREFIX}${sessionId}`;

  await chrome.storage.session.set({ [key]: fileInfo });

  const editorUrl = chrome.runtime.getURL(
    `editor/editor.html?session=${encodeURIComponent(sessionId)}`
  );
  await chrome.tabs.create({ url: editorUrl });
}
