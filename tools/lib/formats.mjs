// Small, dependency-free readers/writers for the formats the release touches:
// CSV, the IPC-2581 component list, ZIP archives and the project's Markdown.
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { listFiles, toPosix } from './common.mjs';

// ------------------------------------------------------------------------- CSV

/** RFC 4180 CSV → array of objects keyed by the header row. */
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map(values => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ''])));
}

export const readCsv = path => parseCsv(readFileSync(path, 'utf8'));

/** Objects → CSV with every field quoted (the convention of the original exports). */
export function formatCsv(rows, columns = rows.length ? Object.keys(rows[0]) : []) {
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [columns.map(quote).join(','), ...rows.map(row => columns.map(column => quote(row[column])).join(','))].join('\n') + '\n';
}

export const writeCsv = (path, rows, columns) => writeFileSync(path, formatCsv(rows, columns), 'utf8');

// -------------------------------------------------------------------- IPC-2581

const decodeEntities = text => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
  if (named) return named;
  return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
});

function attributes(source) {
  const result = {};
  for (const [, name, , value] of source.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)) result[name] = decodeEntities(value);
  return result;
}

const localName = name => name.replace(/^.*:/, '');

/**
 * Components from an IPC-2581 document, namespace-agnostic:
 * [{ attributes, location: {x,y}|null, xform: {...}|null }].
 */
export function ipcComponents(xml) {
  const components = [];
  const elements = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let current = null; let depth = 0;
  for (const [, closing, rawName, rawAttributes, selfClosing] of xml.replace(/<!--[\s\S]*?-->/g, '').matchAll(elements)) {
    const name = localName(rawName);
    if (current) {
      if (closing) { depth--; if (depth === 0) { components.push(current); current = null; } continue; }
      if (depth === 1 && name === 'Location' && !current.location) current.location = attributes(rawAttributes);
      if (depth === 1 && name === 'Xform' && !current.xform) current.xform = attributes(rawAttributes);
      if (!selfClosing) depth++;
    } else if (!closing && name === 'Component') {
      current = { attributes: attributes(rawAttributes), location: null, xform: null };
      if (selfClosing) { components.push(current); current = null; } else depth = 1;
    }
  }
  if (current) throw new Error('Unterminated IPC-2581 Component element');
  return components;
}

// ------------------------------------------------------------------------- ZIP

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** Zip every file below `directory` (entries relative to it, forward slashes, deflated). */
export function zipDirectory(directory, archivePath) {
  const files = listFiles(directory, { includeHidden: true }).sort();
  if (files.length > 0xffff) throw new Error('Too many files for a non-ZIP64 archive');
  const local = []; const central = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(toPosix(relative(directory, file)), 'utf8');
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const { time, day } = dosDateTime(statSync(file).mtime);
    const crc = crc32(data);
    if (offset > 0xffffffff || data.length > 0xffffffff) throw new Error('Archive exceeds non-ZIP64 limits');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(time, 10); header.writeUInt16LE(day, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10); entry.writeUInt16LE(time, 12); entry.writeUInt16LE(day, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(header, name, packed); central.push(entry, name);
    offset += header.length + name.length + packed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(archivePath, Buffer.concat([...local, centralBytes, end]));
}

/** Read every entry back, inflate it and check its CRC. Returns the entry names. */
export function verifyZip(archivePath) {
  const zip = readFileSync(archivePath);
  const endOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0) throw new Error(`Not a ZIP archive: ${archivePath}`);
  const count = zip.readUInt16LE(endOffset + 10);
  let pointer = zip.readUInt32LE(endOffset + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(pointer) !== 0x02014b50) throw new Error(`Corrupt ZIP directory: ${archivePath}`);
    const method = zip.readUInt16LE(pointer + 10); const crc = zip.readUInt32LE(pointer + 16);
    const packedSize = zip.readUInt32LE(pointer + 20); const size = zip.readUInt32LE(pointer + 24);
    const nameLength = zip.readUInt16LE(pointer + 28); const extra = zip.readUInt16LE(pointer + 30); const comment = zip.readUInt16LE(pointer + 32);
    const localOffset = zip.readUInt32LE(pointer + 42);
    const name = zip.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const packed = zip.subarray(dataStart, dataStart + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : method === 0 ? packed : null;
    if (!data) throw new Error(`Unsupported ZIP compression in ${archivePath}: ${name}`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`ZIP entry failed verification: ${archivePath} / ${name}`);
    names.push(name);
    pointer += 46 + nameLength + extra + comment;
  }
  return names;
}

// -------------------------------------------------------------------- Markdown

const escapeHtml = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function inline(text) {
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);
  html = html
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([\s\S]+?)(?<!\s)\*(?![*\w])/g, '$1<em>$2</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[index]}</code>`);
}

/** Heading anchors in the style of Markdig's auto-identifiers. */
function identifier(text, used) {
  let id = text.replace(/<[^>]*>/g, '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 _.-]/g, '').trim().replace(/\s+/g, '-').replace(/^[^a-z]+/, '');
  if (!id) id = 'section';
  let unique = id; let n = 1;
  while (used.has(unique)) unique = `${id}-${n++}`;
  used.add(unique);
  return unique;
}

const splitRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

/**
 * Markdown → HTML for the maintained documentation: ATX headings, paragraphs,
 * bullet and numbered lists (with indented continuation lines), GFM pipe
 * tables, fenced code, block quotes, rules and inline code/emphasis/links.
 */
export function markdownToHtml(markdown) {
  const lines = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; const used = new Set();
  let i = 0;
  const blank = line => !line.trim();
  const listMarker = /^(\s{0,3})([-*+]|\d{1,9}[.)])\s+(.*)$/;
  const startsBlock = line => /^#{1,6}\s/.test(line) || /^```/.test(line) || listMarker.test(line) || /^>\s?/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let match;
    if ((match = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const level = match[1].length; const content = inline(match[2]);
      out.push(`<h${level} id="${identifier(content, used)}">${content}</h${level}>`); i++; continue;
    }
    if ((match = line.match(/^```\s*([\w-]*)/))) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code${match[1] ? ` class="language-${match[1]}"` : ''}>${escapeHtml(code.join('\n'))}\n</code></pre>`); continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr />'); i++; continue; }
    if (/^>\s?/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>\n${markdownToHtml(quoted.join('\n'))}</blockquote>`); continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null);
      const cell = (tag, text, index) => `<${tag}${align[index] ? ` style="text-align: ${align[index]};"` : ''}>${inline(text)}</${tag}>`;
      const rows = []; i += 2;
      while (i < lines.length && !blank(lines[i]) && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      out.push('<table>\n<thead>\n<tr>\n' + header.map((text, index) => cell('th', text, index)).join('\n') + '\n</tr>\n</thead>\n<tbody>\n'
        + rows.map(row => '<tr>\n' + header.map((_, index) => cell('td', row[index] ?? '', index)).join('\n') + '\n</tr>').join('\n') + '\n</tbody>\n</table>');
      continue;
    }
    if ((match = line.match(listMarker))) {
      const ordered = /\d/.test(match[2]);
      const start = ordered ? parseInt(match[2], 10) : 1;
      const items = [];
      while (i < lines.length && (match = lines[i].match(listMarker)) && /\d/.test(match[2]) === ordered) {
        const text = [match[3]]; i++;
        while (i < lines.length && !blank(lines[i]) && !listMarker.test(lines[i]) && (/^\s+/.test(lines[i]) || !startsBlock(lines[i]))) text.push(lines[i++].trim());
        items.push(`<li>${inline(text.join('\n'))}</li>`);
        if (i < lines.length && blank(lines[i]) && i + 1 < lines.length && (match = lines[i + 1].match(listMarker)) && /\d/.test(match[2]) === ordered) i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>\n${items.join('\n')}\n</${tag}>`); continue;
    }
    const paragraph = [];
    while (i < lines.length && !blank(lines[i]) && !(paragraph.length && startsBlock(lines[i]))) paragraph.push(lines[i++].trim());
    out.push(`<p>${inline(paragraph.join('\n'))}</p>`);
  }
  return out.join('\n') + '\n';
}
