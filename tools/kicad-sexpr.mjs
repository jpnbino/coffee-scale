/** Parse KiCad's S-expression data without interpreting it as executable code. */
export function parseSexpr(source) {
  const root = [], stack = [root];
  const token = /\s+|;[^\n]*|[()]|"(?:\\.|[^"\\])*"|[^\s()";]+/gy;
  let offset = 0;
  while (offset < source.length) {
    token.lastIndex = offset;
    const match = token.exec(source);
    if (!match) throw new Error(`Invalid S-expression at character ${offset}`);
    offset = token.lastIndex;
    const value = match[0];
    if (/^\s|^;/.test(value)) continue;
    if (value === "(") { const child = []; stack.at(-1).push(child); stack.push(child); }
    else if (value === ")") { if (stack.length === 1) throw new Error("Unexpected closing parenthesis"); stack.pop(); }
    else stack.at(-1).push(value.startsWith('"') ? JSON.parse(value) : value);
  }
  if (stack.length !== 1 || root.length !== 1 || !Array.isArray(root[0])) throw new Error("Incomplete or multiple S-expression roots");
  return root[0];
}
export const children = (node, name) => node.filter(item => Array.isArray(item) && item[0] === name);
export const child = (node, name) => children(node, name)[0];
export const atom = (node, name, fallback = "") => child(node, name)?.[1] ?? fallback;
export function number(value, fallback = 0) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid geometry number: ${value}`);
  return result;
}
export const point = node => [number(node?.[1]), number(node?.[2])];
export const angle = value => ((number(value) % 360) + 360) % 360;
