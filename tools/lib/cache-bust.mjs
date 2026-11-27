// Every deploy reuses the same file names, so a browser can mix a new page with
// scripts, styles or data it cached from the previous deploy. The build stamps
// each reference to the site's own scripts and styles with the build ID, so a new
// deploy is always fetched as a whole. Vendor files are referenced, never edited.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL = /^(?!\/\/|[a-zA-Z][\w+.-]*:)[\w./-]+\.(?:mjs|js|css)$/;

/** Appends `?v=<version>` to local .mjs/.js/.css references in HTML attributes and JS module specifiers. */
export function versionReferences(text, version) {
  const tag = `v=${encodeURIComponent(version)}`;
  return text
    .replace(/\b(src|href)="([^"?#]+)"/g, (match, attribute, path) => LOCAL.test(path) ? `${attribute}="${path}?${tag}"` : match)
    .replace(/(["'])(\.\.?\/[\w./-]+\.(?:mjs|js))\1/g, (_, quote, path) => `${quote}${path}?${tag}${quote}`);
}

/** Rewrites the top-level HTML pages and the site's own scripts in place (not vendor/). */
export function versionSite(site, version) {
  let files = 0;
  for (const name of readdirSync(site).filter(file => /\.(html|mjs|js)$/.test(file))) {
    const path = join(site, name), before = readFileSync(path, 'utf8'), after = versionReferences(before, version);
    if (after !== before) { writeFileSync(path, after, 'utf8'); files++; }
  }
  return files;
}
