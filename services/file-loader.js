// services/file-loader.js
//
// Orchestrates loading a GitHub HTML file into a renderable preview:
// fetch the entry file, tag its editable elements, then find and inline any
// local (same-repo) CSS and images it references so the sandboxed iframe can
// render it faithfully. Network access is isolated to services/github-api.js;
// DOM parsing/rewriting logic is isolated to services/html-utils.js — this
// file just wires the two together.
//
// Known v1 limitation: the GitHub Contents API returns file content inline
// only for files up to ~1MB; very large assets would need the Git Blobs API
// instead (not implemented in v1) and are skipped with a console warning.

import { getFile, base64ToUtf8, base64ToDataUri } from './github-api.js';
import * as htmlUtils from './html-utils.js';
import { mimeTypeForPath, originalValueAttr } from '../shared/constants.js';

/**
 * @returns {{
 *   owner, repo, branch, path, fileName, sha, originalHtml, previewHtml,
 *   useSproutMode, editableCount
 * }}
 */
export async function loadGithubHtmlFile({ owner, repo, branch, path }) {
  const fileRecord = await getFile(owner, repo, path, branch);
  const originalHtml = base64ToUtf8(fileRecord.base64);
  const preview = await buildPreviewFromHtml(originalHtml, { owner, repo, branch, path });

  return {
    owner,
    repo,
    branch,
    path,
    fileName: fileRecord.name,
    sha: fileRecord.sha,
    originalHtml,
    ...preview,
  };
}

/**
 * Builds a renderable preview (tagged uids + inlined local assets) from an
 * HTML string already in hand. Used both by loadGithubHtmlFile() above and
 * by editor.js right after a successful save: the just-saved HTML becomes
 * the new baseline, and re-running this — rather than patching the live
 * iframe DOM in place — guarantees every data-sprout-uid and
 * data-sprout-original-* marker (see shared/constants.js originalValueAttr)
 * is rebuilt fresh and consistent with that new baseline, instead of
 * potentially going stale (e.g. an asset marker still pointing at a value
 * from before the save).
 * @returns {{ previewHtml: string, useSproutMode: boolean, editableCount: number }}
 */
export async function buildPreviewFromHtml(html, { owner, repo, branch, path }) {
  const previewDoc = htmlUtils.parseHtmlDocument(html);
  const { useSproutMode, registry } = htmlUtils.tagEditableElements(previewDoc);
  await inlineLocalAssets(previewDoc, path, owner, repo, branch);

  return {
    previewHtml: htmlUtils.serializeDocument(previewDoc),
    useSproutMode,
    editableCount: registry.size,
  };
}

async function inlineLocalAssets(doc, htmlRepoPath, owner, repo, branch) {
  const refs = htmlUtils.collectAssetReferences(doc, htmlRepoPath);

  await Promise.all(
    refs.map(async (ref) => {
      try {
        const asset = await getFile(owner, repo, ref.resolvedPath, branch);

        if (ref.kind === 'stylesheet') {
          const cssText = base64ToUtf8(asset.base64);
          const rewrittenCss = await inlineCssAssets(cssText, ref.resolvedPath, owner, repo, branch);
          const styleEl = doc.createElement('style');
          styleEl.setAttribute('data-sprout-source', ref.resolvedPath);
          styleEl.textContent = rewrittenCss;
          ref.element.replaceWith(styleEl);
        } else if (ref.kind === 'image') {
          const mime = mimeTypeForPath(ref.resolvedPath);
          // Stash the pre-rewrite (real, relative) value before overwriting it with
          // a data: URI, so the Inspector/editor.js never mistake the preview
          // rewrite for a real edit (see shared/constants.js originalValueAttr).
          ref.element.setAttribute(originalValueAttr(ref.attr), ref.element.getAttribute(ref.attr));
          ref.element.setAttribute(ref.attr, base64ToDataUri(asset.base64, mime));
        }
      } catch (error) {
        // A single missing/unreadable asset shouldn't block the whole preview.
        console.warn(`Sprout Editor: could not load asset "${ref.resolvedPath}".`, error);
      }
    })
  );
}

async function inlineCssAssets(cssText, cssRepoPath, owner, repo, branch) {
  const refs = htmlUtils.collectCssUrlReferences(cssText, cssRepoPath);
  if (refs.length === 0) return cssText;

  const replacements = new Map();
  await Promise.all(
    refs.map(async (ref) => {
      try {
        const asset = await getFile(owner, repo, ref.resolvedPath, branch);
        const mime = mimeTypeForPath(ref.resolvedPath);
        replacements.set(ref.original, base64ToDataUri(asset.base64, mime));
      } catch (error) {
        console.warn(`Sprout Editor: could not load CSS asset "${ref.resolvedPath}".`, error);
      }
    })
  );

  return htmlUtils.applyCssUrlReplacements(cssText, replacements);
}
