# Permissions Justification (for the Web Store "Privacy practices" tab)

Chrome Web Store review asks for a written justification for every permission and host
permission declared in `manifest.json`. Paste the matching text into each field.

## `storage`

```
Used to save the user's GitHub access token locally (chrome.storage.local) so they don't
have to reconnect their GitHub account every time they open the editor. Also used
(chrome.storage.session) to pass the file the user clicked "Edit with Sprout" on from the
content script to the editor tab — this data is read once and immediately deleted.
```

## Host permission: `https://github.com/*`

```
Required for two things: (1) the content script that detects supported GitHub HTML file
pages and injects the "Edit with Sprout" button runs on github.com; (2) completing GitHub's
OAuth Device Flow sign-in requires two direct requests to github.com/login/device/code and
github.com/login/oauth/access_token. No other use is made of this host permission.
```

## Host permission: `https://api.github.com/*`

```
Required to read the HTML file (and its local CSS/image assets) the user is editing, and
to save the user's changes back to their repository as a commit, via GitHub's REST
Contents API. This is the extension's core function.
```

## content_scripts (github.com)

```
The content script only parses the current page's URL to detect a supported file pattern
(github.com/{owner}/{repo}/blob/{branch}/{path}.html) and, if matched, injects a single
button into the page. It makes no network requests and reads no page content beyond the
URL itself.
```

## Notes for the reviewer

- The extension operates no backend server of any kind. Every network request originates
  from the user's browser directly to github.com / api.github.com.
- No analytics, telemetry, or third-party scripts are included anywhere in the extension.
- The live preview of the user's HTML file renders inside a sandboxed iframe with
  `sandbox="allow-same-origin"` and no `allow-scripts` — the page being edited cannot
  execute any JavaScript.
