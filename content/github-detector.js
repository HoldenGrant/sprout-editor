// content/github-detector.js
//
// Pure URL parsing for GitHub HTML file pages. Deliberately does NOT make any
// network calls — this file runs on every github.com page load, and burning
// API rate limit just from browsing GitHub would be wasteful and surprising.
//
// Classic (non-module) script: exposes its API on `window.SproutDetector` so
// content/github-toolbar.js, loaded right after it, can use it directly.

(function () {
  // Matches: /{owner}/{repo}/blob/{branch}/{path...}.html  (or .htm)
  //
  // Known v1 limitation: branch names containing "/" (e.g. "feature/foo") are
  // ambiguous to resolve from the URL alone without querying the branches API.
  // We assume the branch is the single path segment right after "/blob/",
  // which covers "main", "master", and typical branch names.
  const FILE_URL_PATTERN =
    /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.html?)$/i;

  /**
   * Parse a GitHub blob URL into its repo/file components.
   * @param {string} url - full URL or pathname of the current page.
   * @returns {{owner: string, repo: string, branch: string, path: string, fileName: string} | null}
   */
  function parseGithubHtmlUrl(url) {
    let pathname;
    try {
      pathname = new URL(url, window.location.origin).pathname;
    } catch {
      pathname = url;
    }

    const match = pathname.match(FILE_URL_PATTERN);
    if (!match) return null;

    const [, owner, repo, branch, path] = match;
    const fileName = path.split('/').pop();

    return { owner, repo, branch, path, fileName };
  }

  /**
   * Invoke `onChange(parsedResult|null)` whenever the current page becomes
   * (or stops being) a supported GitHub HTML file page. Handles GitHub's
   * Turbo/pjax-based navigation, which does not trigger full page reloads.
   * @param {(result: ReturnType<typeof parseGithubHtmlUrl>) => void} onChange
   */
  function observeGithubNavigation(onChange) {
    let lastHref = null;

    const check = () => {
      if (window.location.href === lastHref) return;
      lastHref = window.location.href;
      onChange(parseGithubHtmlUrl(window.location.href));
    };

    // Turbo (GitHub's SPA navigation library) fires this on every route change.
    document.addEventListener('turbo:render', check);
    // Fallbacks in case GitHub's frontend framework changes internals.
    window.addEventListener('popstate', check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    check(); // run once for the initial page load
  }

  window.SproutDetector = { parseGithubHtmlUrl, observeGithubNavigation };
})();
