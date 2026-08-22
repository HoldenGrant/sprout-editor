# Sprout Editor — Privacy Policy

*Last updated: 2026-08-22*

Sprout Editor is a Chrome extension that lets you visually edit an HTML file stored in a
GitHub repository and save the result back as a commit. This policy explains exactly what
data the extension touches, where it goes, and what it doesn't do.

## What Sprout Editor accesses

- **The GitHub file you choose to edit.** When you click "Edit with Sprout" on a GitHub
  `.html`/`.htm` file page, the extension fetches that file's content, and any local
  CSS/image files it references, directly from GitHub's API (`api.github.com`) so it can
  render an editable preview.
- **Your GitHub identity, if you connect an account.** Signing in ("Connect with GitHub")
  uses GitHub's standard OAuth Device Flow. This confirms your GitHub username and issues
  an access token scoped to the repositories you explicitly choose to grant access to
  during that sign-in.

Sprout Editor only activates on `github.com` pages that match a specific HTML file URL
pattern. It does not read, collect, or transmit anything from any other website you visit.

## What Sprout Editor stores

- **A GitHub access token**, saved only in your browser's local extension storage
  (`chrome.storage.local`) on your own device.
- **Nothing else.** No edit history, file contents, or browsing activity is retained
  beyond the current editing session in the extension's own tab.

## What Sprout Editor never does

- It does not operate any server of its own. There is no backend — every network request
  the extension makes goes directly from your browser to `github.com` or `api.github.com`.
- It does not use analytics, tracking pixels, or crash reporting of any kind.
- It does not share, sell, or transmit your data to any third party.
- It does not display ads.
- Your GitHub access token is never written into source code, logged, or sent anywhere
  other than GitHub's own API.

## Permissions this extension requests, and why

| Permission | Why it's needed |
|---|---|
| `storage` | To save your GitHub access token locally so you don't have to reconnect every time. |
| Host access to `github.com` | To detect supported file pages and inject the "Edit with Sprout" button, and to complete GitHub's OAuth Device Flow sign-in. |
| Host access to `api.github.com` | To read the file (and its local assets) you're editing, and to save your changes back as a commit. |

## Your control over access

You choose exactly which repositories Sprout Editor can access when you install the
companion GitHub App during sign-in — you can review or revoke this at any time from
[github.com/settings/installations](https://github.com/settings/installations). Removing
the saved token from the extension's Options page (or uninstalling the extension) deletes
all locally stored data immediately.

## Changes to this policy

If this policy changes, the updated version will be published at this same URL with a new
"Last updated" date.

## Contact

Questions about this policy can be directed to the developer via the GitHub repository
this extension is published from.
