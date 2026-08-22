# Data Usage Disclosure (for the Web Store "Privacy practices" tab)

Chrome Web Store review requires checking off which data types the extension handles.
Answers below reflect what Sprout Editor actually does — verify against the live form,
since Google's exact categories/wording change over time.

## Data types

| Category | Collected? | Notes |
|---|---|---|
| Personally identifiable information | **Yes** | GitHub username, obtained via OAuth sign-in, to know which account is connected. Stays local — never sent anywhere except GitHub's own API. |
| Authentication information | **Yes** | GitHub access token. Stored only in `chrome.storage.local` on the user's device; used solely as the `Authorization` header on requests to `api.github.com`/`github.com`. Never logged, never sent elsewhere. |
| Website content | **Yes** | The HTML/CSS/image file content the user opens to edit. Read from and written back to the *same* GitHub repository the user already owns/has access to — never sent to any third party or to the developer. |
| Health info | No | — |
| Financial info | No | — |
| Personal communications | No | — |
| Location | No | — |
| Web history | No | The extension only activates on `github.com` file pages it explicitly detects; it doesn't observe or record browsing elsewhere. |
| User activity (clicks, keystrokes) | No | Interactions with the editor's own UI are used only to update the editor's on-screen state — none are recorded, logged, or transmitted. |

## Certifications (all true for Sprout Editor)

- [x] Does not sell or transfer user data to third parties, outside of approved use cases
- [x] Does not use or transfer user data for purposes unrelated to the extension's single
      purpose (visually editing a GitHub HTML file and saving it back)
- [x] Does not use or transfer user data to determine creditworthiness or for lending
      purposes

## Privacy policy URL

Point the Web Store listing's privacy policy field at a hosted copy of
`docs/webstore/privacy-policy.md` (see `submission-checklist.md` for hosting options).
