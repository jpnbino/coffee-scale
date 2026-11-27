// Deep links into the interactive design viewer, e.g. explore.html?part=U5 or
// explore.html?net=HX_DOUT. Documentation uses them to point at the exact part
// or net a paragraph is about.

/** Reads `part` and `net` from a query string; anything malformed is ignored. */
export function viewerLink(search) {
  const params = new URLSearchParams(search);
  const part = params.get('part')?.trim() ?? '';
  const net = params.get('net')?.trim() ?? '';
  return {
    part: /^[A-Za-z]{1,4}\d{1,4}$/.test(part) ? part.toUpperCase() : null,
    net: net && net.length <= 120 ? net : null,
  };
}

/** Schematic nets carry a leading `/` (`/HX_DOUT`); links may leave it out. */
export function resolveNet(name, isKnown) {
  if (!name) return null;
  for (const candidate of [name, `/${name.replace(/^\/+/, '')}`]) if (isKnown(candidate)) return candidate;
  return null;
}
