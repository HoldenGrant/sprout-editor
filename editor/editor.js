// editor/editor.js
//
// Top-level orchestrator for the Sprout Editor page. Owns EditorState (the
// single source of truth for what's been edited) and wires together
// canvas.js (preview + live DOM), inspector.js (edit controls), history.js
// (undo/redo), and the services layer (loading + saving). See the plan's
// "two DOM representations" note in services/html-utils.js for why `edits`
// is authoritative for saving rather than the live preview DOM.

import { STORAGE_KEYS, defaultCommitMessage, originalValueAttr } from '../shared/constants.js';
import { loadGithubHtmlFile, buildPreviewFromHtml } from '../services/file-loader.js';
import { getEditableKind, serializeForSave } from '../services/html-utils.js';
import { updateFile, utf8ToBase64, GitHubConflictError, GitHubAuthError } from '../services/github-api.js';
import { hasToken } from '../services/github-auth.js';
import { Canvas } from './canvas.js';
import { Inspector } from './inspector.js';
import { initSidebar } from './sidebar.js';
import { HistoryStack, attachHistoryKeyboardShortcuts } from './history.js';

// ---------- DOM references ----------

const els = {
  fileNameLabel: document.getElementById('fileNameLabel'),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  previewBtn: document.getElementById('previewBtn'),
  previewBtnLabel: document.getElementById('previewBtnLabel'),
  saveBtn: document.getElementById('saveBtn'),
  statusOverlay: document.getElementById('statusOverlay'),
  statusMessage: document.getElementById('statusMessage'),
  statusSettingsBtn: document.getElementById('statusSettingsBtn'),
  previewFrame: document.getElementById('previewFrame'),
  inspectorBody: document.getElementById('inspectorBody'),
  elementList: document.getElementById('elementList'),
  saveModal: document.getElementById('saveModal'),
  saveModalFileName: document.getElementById('saveModalFileName'),
  commitMessageInput: document.getElementById('commitMessageInput'),
  saveModalError: document.getElementById('saveModalError'),
  saveModalCancel: document.getElementById('saveModalCancel'),
  saveModalConfirm: document.getElementById('saveModalConfirm'),
  toastContainer: document.getElementById('toastContainer'),
};

// ---------- Editor state ----------

const state = {
  fileInfo: null, // { owner, repo, branch, path, fileName }
  sha: null,
  originalHtml: null, // pristine source of truth; save always re-parses THIS
  edits: new Map(), // uid -> { text?, attrs?: {}, styles?: {} } — see html-utils.js
  dirty: false,
  selected: null, // { uid, kind, el } | null
  selectionTextBaseline: null, // pre-edit text snapshot, captured on select (see handleTextChange)
};

let canvas;
let inspector;
let historyStack;
let previewModeActive = false;

// ---------- Boot ----------

init().catch((error) => showFatalError(error));

async function init() {
  historyStack = new HistoryStack({ onApply: handleHistoryApply });
  attachHistoryKeyboardShortcuts(historyStack, refreshToolbarButtons);

  canvas = new Canvas(els.previewFrame, {
    onSelect: handleSelect,
    onDeselect: handleDeselect,
    onTextChange: handleInlineTextChange,
  });
  inspector = new Inspector(els.inspectorBody, {
    onTextChange: handleInspectorTextChange,
    onAttrChange: handleAttrChange,
    onStyleChange: handleStyleChange,
  });

  initSidebar(els.elementList, {
    onCategoryClick: (category) => {
      if (!canvas.scrollToCategory(category)) {
        showToast(`No editable "${category}" element found on this page.`, 'info');
      }
    },
  });

  wireToolbar();
  wireSaveModal();
  els.statusSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  const fileInfo = await consumeSessionFileInfo();
  if (!fileInfo) {
    showFatalError(new Error('No file was selected. Open a GitHub .html file and click "Edit with Sprout" again.'));
    return;
  }

  state.fileInfo = fileInfo;
  els.fileNameLabel.textContent = fileInfo.fileName;
  document.title = `${fileInfo.fileName} — Sprout Editor`;

  await loadFile(fileInfo);
}

/** Reads the {owner,repo,branch,path} the content script stashed, then clears it (single-use handoff). */
async function consumeSessionFileInfo() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  if (!sessionId) return null;

  const key = `${STORAGE_KEYS.SESSION_PREFIX}${sessionId}`;
  const result = await chrome.storage.session.get(key);
  await chrome.storage.session.remove(key);
  return result[key] || null;
}

async function loadFile(fileInfo) {
  const tokenConfigured = await hasToken();
  setStatus(
    `Loading ${fileInfo.path} from ${fileInfo.owner}/${fileInfo.repo}@${fileInfo.branch}…` +
      (tokenConfigured ? '' : ' (no GitHub token configured — this will only work for public repos)')
  );
  try {
    const loaded = await loadGithubHtmlFile(fileInfo);
    state.sha = loaded.sha;
    state.originalHtml = loaded.originalHtml;
    const { hiddenPreloaderCount } = await canvas.load(loaded.previewHtml);
    hideStatus();

    if (hiddenPreloaderCount > 0) {
      showToast(
        'Hid a loading-screen overlay in the preview (its script never ran, since scripts are disabled for safety). Your saved file is unaffected.',
        'info',
        7000
      );
    }
    if (loaded.editableCount === 0) {
      showToast('No editable elements were detected on this page.', 'info');
    }
  } catch (error) {
    console.error('Sprout Editor: failed to load file.', error);
    showFatalError(error);
  }
}

// ---------- Selection / editing ----------

function handleSelect({ uid, kind, el }) {
  state.selected = { uid, kind, el };
  state.selectionTextBaseline = el.textContent;
  inspector.render({ uid, kind, el });
}

function handleDeselect() {
  state.selected = null;
  state.selectionTextBaseline = null;
  inspector.clear();
}

/** In-canvas contentEditable text commit (blur). The live DOM is already updated by the browser. */
function handleInlineTextChange(uid, newText) {
  const before = getFieldBaseline(uid, 'text', null);
  if (before === newText) return; // nothing actually changed
  commitFieldChange(uid, 'text', null, before, newText);
}

/** Inspector's "Text" field commit — DOM has NOT been touched yet, so it's applied here. */
function handleInspectorTextChange(uid, newText) {
  const before = getFieldBaseline(uid, 'text', null);
  if (before === newText) return;
  commitFieldChange(uid, 'text', null, before, newText);
}

function handleAttrChange(uid, name, newValue) {
  const before = getFieldBaseline(uid, 'attr', name);
  if (before === newValue) return;
  commitFieldChange(uid, 'attr', name, before, newValue);
}

function handleStyleChange(uid, prop, newValue) {
  const before = getFieldBaseline(uid, 'style', prop);
  if (before === newValue) return;
  commitFieldChange(uid, 'style', prop, before, newValue);
}

function commitFieldChange(uid, category, field, before, after) {
  applyFieldToCanvasAndState(uid, category, field, after);
  historyStack.push({ uid, category, field, before, after });
  markDirty();
  refreshToolbarButtons();
}

function handleHistoryApply(command, direction) {
  const value = direction === 'undo' ? command.before : command.after;
  applyFieldToCanvasAndState(command.uid, command.category, command.field, value);

  // Keep the inspector panel in sync if the affected element is selected.
  if (state.selected?.uid === command.uid) {
    const el = canvas.getElementByUid(command.uid);
    if (el) inspector.render({ uid: command.uid, kind: getEditableKind(el, canvas.useSproutMode), el });
  }
  markDirty();
  refreshToolbarButtons();
}

/**
 * Applies one field value to the live preview AND records it into state.edits.
 *
 * Known v1 limitation: undoing an <img src> edit all the way back to its
 * original value writes the real relative repo path (e.g. "images/logo.png")
 * into the live srcdoc iframe, which can't resolve it and will show a broken
 * image — the preview rewrote that same path to a data: URI at load time
 * (see file-loader.js) specifically so it WOULD resolve, but re-fetching on
 * every undo/redo isn't worth the complexity for v1. The saved file is never
 * affected either way — save always replays state.edits onto the pristine
 * original HTML, never the live DOM (see services/html-utils.js).
 */
function applyFieldToCanvasAndState(uid, category, field, value) {
  if (category === 'text') {
    canvas.applyText(uid, value);
    if (state.selected?.uid === uid) state.selectionTextBaseline = value;
    setEditEntry(uid, (entry) => { entry.text = value; });
  } else if (category === 'attr') {
    canvas.applyAttr(uid, field, value);
    setEditEntry(uid, (entry) => {
      entry.attrs = entry.attrs || {};
      entry.attrs[field] = value;
    });
  } else if (category === 'style') {
    canvas.applyStyle(uid, field, value);
    setEditEntry(uid, (entry) => {
      entry.styles = entry.styles || {};
      entry.styles[field] = value;
    });
  }
}

function setEditEntry(uid, mutate) {
  const entry = state.edits.get(uid) || {};
  mutate(entry);
  state.edits.set(uid, entry);
}

/** The value a field should revert to if this is the very first edit made to it. */
function getFieldBaseline(uid, category, field) {
  const entry = state.edits.get(uid);
  if (entry) {
    if (category === 'text' && typeof entry.text === 'string') return entry.text;
    if (category === 'attr' && entry.attrs && field in entry.attrs) return entry.attrs[field];
    if (category === 'style' && entry.styles && field in entry.styles) return entry.styles[field];
  }

  if (category === 'text') {
    // contentEditable may have already mutated the live DOM before we get here,
    // so the pre-edit snapshot captured at selection time is the reliable source.
    return state.selectionTextBaseline ?? '';
  }

  const el = canvas.getElementByUid(uid);
  if (!el) return '';
  if (category === 'attr') {
    // Prefer the pre-rewrite value if file-loader.js rewrote this attribute for
    // preview (e.g. img src -> data: URI) — never use a rewritten value as a
    // save baseline, or it could get written back to GitHub as a giant data URI.
    return el.getAttribute(originalValueAttr(field)) ?? el.getAttribute(field) ?? '';
  }
  return el.style.getPropertyValue(field) || '';
}

// ---------- Toolbar ----------

function wireToolbar() {
  els.undoBtn.addEventListener('click', () => {
    if (historyStack.undo()) refreshToolbarButtons();
  });
  els.redoBtn.addEventListener('click', () => {
    if (historyStack.redo()) refreshToolbarButtons();
  });
  els.previewBtn.addEventListener('click', () => {
    const enteringPreview = !previewModeActive;
    previewModeActive = enteringPreview;
    canvas.setPreviewMode(enteringPreview);
    // The eye / eye-off icon swap is pure CSS, gated on .is-active (see
    // editor.css) — only the text label needs updating here.
    els.previewBtn.classList.toggle('is-active', enteringPreview);
    els.previewBtnLabel.textContent = enteringPreview ? 'Exit Preview' : 'Preview';
  });
  els.saveBtn.addEventListener('click', handleSaveClick);
}

function refreshToolbarButtons() {
  els.undoBtn.disabled = !historyStack.canUndo();
  els.redoBtn.disabled = !historyStack.canRedo();
}

function markDirty() {
  state.dirty = true;
  els.fileNameLabel.classList.add('is-dirty');
  els.saveBtn.disabled = false;
}

function clearDirty() {
  state.dirty = false;
  els.fileNameLabel.classList.remove('is-dirty');
}

// ---------- Save flow ----------

async function handleSaveClick() {
  if (!(await hasToken())) {
    showToast('Connect a GitHub account in Sprout Editor’s options before saving.', 'error', 6000);
    chrome.runtime.openOptionsPage();
    return;
  }
  openSaveModal();
}

function wireSaveModal() {
  els.saveModalCancel.addEventListener('click', closeSaveModal);
  els.saveModal.addEventListener('click', (event) => {
    if (event.target === els.saveModal) closeSaveModal();
  });
  els.saveModalConfirm.addEventListener('click', handleConfirmSave);
}

function openSaveModal() {
  els.saveModalFileName.textContent = state.fileInfo.fileName;
  if (!els.commitMessageInput.value) {
    els.commitMessageInput.value = defaultCommitMessage(state.fileInfo.fileName);
  }
  hideModalError();
  els.saveModal.classList.remove('sprout-hidden');
}

function closeSaveModal() {
  els.saveModal.classList.add('sprout-hidden');
}

function hideModalError() {
  els.saveModalError.classList.add('sprout-hidden');
  els.saveModalError.textContent = '';
}

function showModalError(message) {
  els.saveModalError.textContent = message;
  els.saveModalError.classList.remove('sprout-hidden');
}

async function handleConfirmSave() {
  const message = els.commitMessageInput.value.trim() || defaultCommitMessage(state.fileInfo.fileName);
  hideModalError();
  els.saveModalConfirm.disabled = true;
  els.saveModalConfirm.textContent = 'Saving…';

  try {
    const finalHtml = serializeForSave(state.originalHtml, state.edits);
    const result = await updateFile(state.fileInfo.owner, state.fileInfo.repo, state.fileInfo.path, {
      base64Content: utf8ToBase64(finalHtml),
      message,
      sha: state.sha,
      branch: state.fileInfo.branch,
    });

    // New saved state becomes the baseline for future edits/diffs. Rebuild the
    // preview from it (rather than patching the live iframe in place) so every
    // uid/original-value marker is fresh and consistent — see
    // services/file-loader.js buildPreviewFromHtml() for why.
    state.sha = result.sha;
    state.originalHtml = finalHtml;
    state.edits.clear();
    historyStack.clear();
    handleDeselect();
    const preview = await buildPreviewFromHtml(finalHtml, state.fileInfo);
    await canvas.load(preview.previewHtml);
    clearDirty();
    refreshToolbarButtons();
    closeSaveModal();

    showToast(
      result.commitUrl ? `Saved! Commit: ${result.commitUrl}` : 'Saved to GitHub successfully.',
      'success',
      6000
    );
  } catch (error) {
    console.error('Sprout Editor: save failed.', error);
    if (error instanceof GitHubConflictError) {
      showModalError(error.message);
    } else if (error instanceof GitHubAuthError) {
      showModalError(error.message);
    } else {
      showModalError(error.message || 'Something went wrong while saving. Your changes are still here — try again.');
    }
  } finally {
    els.saveModalConfirm.disabled = false;
    els.saveModalConfirm.textContent = 'Save Changes';
  }
}

// ---------- Status / toasts ----------

function setStatus(message) {
  els.statusMessage.textContent = message;
  els.statusSettingsBtn.classList.add('sprout-hidden');
  els.statusOverlay.classList.remove('sprout-hidden', 'is-error');
}

function hideStatus() {
  els.statusOverlay.classList.add('sprout-hidden');
}

function showFatalError(error) {
  console.error('Sprout Editor:', error);
  els.statusMessage.textContent = error?.message || 'Something went wrong.';
  els.statusOverlay.classList.remove('sprout-hidden');
  els.statusOverlay.classList.add('is-error');
  // A load failure is very often a missing/insufficient GitHub token (private
  // repos 404 for anyone without access) — offer a direct way to fix it.
  els.statusSettingsBtn.classList.remove('sprout-hidden');
}

function showToast(message, type = 'info', durationMs = 4000) {
  const toast = document.createElement('div');
  toast.className = `sprout-toast sprout-toast--${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    // .is-leaving plays the fade/slide-out defined in editor.css; the actual
    // removal waits for it instead of vanishing mid-frame.
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, durationMs);
}
