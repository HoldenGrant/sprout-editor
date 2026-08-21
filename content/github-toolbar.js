// content/github-toolbar.js
//
// Injects the "🌱 Edit with Sprout" button on supported GitHub HTML file
// pages and kicks off the OPEN_EDITOR message to the background worker when
// clicked. Classic (non-module) script — depends on window.SproutDetector
// from content/github-detector.js, loaded first per manifest.json order.

(function () {
  // Must match shared/constants.js MESSAGE_TYPES.OPEN_EDITOR (see note there).
  const OPEN_EDITOR_MESSAGE = 'SPROUT_OPEN_EDITOR';

  const BUTTON_ID = 'sprout-edit-button';

  // Candidate selectors for GitHub's file-view action bar (Raw / Copy / Download
  // buttons), tried in order. GitHub's DOM changes periodically, so we fall
  // back to a floating button if none match rather than silently doing nothing.
  const TOOLBAR_SELECTORS = [
    '[data-testid="raw-button"]', // sits inside the actions bar we want to join
    'div[class*="react-blob-header-edit-and-raw-actions"]',
    'div[class*="BlobHeader"] [class*="Box-sc"]',
  ];

  function findInsertionTarget() {
    for (const selector of TOOLBAR_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && el.parentElement) return el.parentElement;
    }
    return null;
  }

  function createButton(fileInfo) {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'sprout-edit-button';
    button.textContent = '🌱 Edit with Sprout';
    button.title = `Visually edit ${fileInfo.fileName} with Sprout Editor`;
    button.addEventListener('click', () => handleEditClick(fileInfo));
    return button;
  }

  function handleEditClick(fileInfo) {
    chrome.runtime.sendMessage(
      { type: OPEN_EDITOR_MESSAGE, payload: fileInfo },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          console.error(
            'Sprout Editor: failed to open editor.',
            chrome.runtime.lastError || response?.error
          );
          alert('Sprout Editor could not open. Please try again.');
        }
      }
    );
  }

  function removeExistingButton() {
    document.getElementById(BUTTON_ID)?.remove();
    document.getElementById('sprout-floating-container')?.remove();
  }

  function injectButton(fileInfo) {
    removeExistingButton();

    const target = findInsertionTarget();
    const button = createButton(fileInfo);

    if (target) {
      target.prepend(button);
      return;
    }

    // Fallback: GitHub's DOM didn't match any known selector. Show a floating
    // button instead of silently failing.
    const container = document.createElement('div');
    container.id = 'sprout-floating-container';
    container.appendChild(button);
    document.body.appendChild(container);
  }

  window.SproutDetector.observeGithubNavigation((fileInfo) => {
    if (fileInfo) {
      injectButton(fileInfo);
    } else {
      removeExistingButton();
    }
  });
})();
