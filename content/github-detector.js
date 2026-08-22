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

    // GitHub's Turbo-based navigation (clicking a file in the repo tree,
    // breadcrumbs, etc.) swaps the page's content without a real browser
    // navigation, so window "load"/history APIs alone can silently miss it.
    // None of turbo:render / turbo:load / a DOM mutation firing reliably is
    // guaranteed across GitHub's frontend versions, so none of these are
    // trusted alone — a plain interval poll below is what actually
    // guarantees detection regardless of which (if any) of these fire.
    ['turbo:render', 'turbo:load', 'turbo:frame-render', 'pjax:end'].forEach((eventName) =>
      document.addEventListener(eventName, check)
    );
    window.addEventListener('popstate', check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Belt-and-suspenders: a cheap, framework-agnostic poll. Worst case this
    // is what catches a navigation, at most ~400ms after it happens — far
    // less than the time it takes a human to notice the button is missing
    // and go looking for it.
    setInterval(check, 400);

    check(); // run once for the initial page load
  }

  window.SproutDetector = { parseGithubHtmlUrl, observeGithubNavigation };
})();
