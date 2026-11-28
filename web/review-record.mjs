// Guided pre-order review: the list of things a person should look at before
// ordering, and the record of what they decided. Pure functions, no DOM, so the
// same model is used by the Gerber page and the tests.
//
// A record is a human review note, not a test result or a supplier approval:
// the wording in the page and in the exported file says so.

export const RECORD_SCHEMA = 1;
export const STATUSES = ["pending", "ok", "change"];

const meaningfulName = name => name && !/^(Pin_)?\d+$/i.test(name);

// Smallest centre-to-centre distance between two pads of one part, in mm.
export function minimumPitch(pads) {
  let best = Infinity;
  for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) {
    const d = Math.hypot(pads[i].x - pads[j].x, pads[i].y - pads[j].y);
    if (d > 1e-6 && d < best) best = d;
  }
  return Number.isFinite(best) ? Math.round(best * 1000) / 1000 : null;
}

export const FINE_PITCH_MM = 0.65;

// Steps in the order a reviewer should take them: the checker's findings first
// (they are the likeliest problems), then every part with a pin map, smallest
// first (a swapped SOT-23 or diode is the likeliest mistake and the quickest
// check), fine-pitch parts flagged. One step per part, so nothing repeats.
export function reviewSteps(check) {
  if (!check?.parts) return [];
  const steps = [], seen = new Set();
  for (const finding of check.findings ?? []) {
    const id = `finding:${finding.kind ?? "note"}:${finding.ref}`;
    if (seen.has(id)) continue;
    seen.add(id);
    steps.push({
      id, ref: finding.ref, kind: /^paste/.test(finding.kind ?? "") ? "paste" : "placement",
      title: `${finding.ref}: ${/^paste/.test(finding.kind ?? "") ? "solder paste" : "placement"}`,
      prompt: finding.message,
      at: finding.at ?? null,
    });
  }
  const rows = part => part.pads.filter(pad => pad.number).length;
  const parts = check.parts
    .filter(part => part.pads.some(pad => meaningfulName(pad.name)))
    .map(part => ({ part, pitch: minimumPitch(part.pads.filter(pad => pad.type !== "np_thru_hole")) }))
    .sort((a, b) => rows(a.part) - rows(b.part) || a.part.ref.localeCompare(b.part.ref, undefined, { numeric: true }));
  for (const { part, pitch } of parts) {
    const fine = pitch !== null && pitch < FINE_PITCH_MM;
    steps.push({
      id: `pinmap:${part.ref}`, ref: part.ref, kind: "pinmap", fine, pitch,
      title: `${part.ref} ${part.value ?? ""}`.trim(),
      prompt: `Compare pin 1 and the pad → pin → net map of ${part.footprint ?? "this footprint"} with the part's datasheet.${fine ? ` Fine pitch (${pitch} mm): check the paste and mask between pads too.` : ""}`,
    });
  }
  return steps;
}

export function emptyRecord({ boardSha256 = null, revision = null, versionId = null, reviewer = "", now = new Date() } = {}) {
  return {
    schemaVersion: RECORD_SCHEMA,
    kind: "pre-order review",
    note: "A person's review of the order files. Not a test result, a DRC run or a supplier approval.",
    revision, versionId, boardSha256, reviewer,
    started: now.toISOString(), updated: now.toISOString(), completed: null,
    items: {},
  };
}

export function mark(record, stepId, status, note = "", now = new Date()) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown review status: ${status}`);
  const items = { ...record.items };
  if (status === "pending" && !note) delete items[stepId];
  else items[stepId] = { status, note: String(note).trim(), at: now.toISOString() };
  return { ...record, items, updated: now.toISOString() };
}

export function progress(record, steps) {
  const counts = { total: steps.length, ok: 0, change: 0, pending: 0 };
  for (const step of steps) counts[record.items[step.id]?.status ?? "pending"] += 1;
  counts.done = counts.ok + counts.change;
  return counts;
}

export function nextPending(record, steps, from = -1) {
  for (let k = 1; k <= steps.length; k++) {
    const i = (from + k) % steps.length;
    if ((record.items[steps[i].id]?.status ?? "pending") === "pending") return i;
  }
  return -1;
}

// The file a reviewer downloads (and may commit under reviews/). Items carry the
// step title and prompt so the record reads on its own, without the portal.
export function exportRecord(record, steps, now = new Date()) {
  const counts = progress(record, steps);
  return {
    ...record,
    completed: counts.pending === 0 ? (record.completed ?? now.toISOString()) : null,
    summary: { steps: counts.total, looksRight: counts.ok, needsChange: counts.change, notReviewed: counts.pending },
    items: steps.map(step => ({
      id: step.id, ref: step.ref, kind: step.kind, title: step.title, prompt: step.prompt,
      status: record.items[step.id]?.status ?? "pending", note: record.items[step.id]?.note ?? "", at: record.items[step.id]?.at ?? null,
    })),
  };
}

// A record only belongs to the board it was made for.
export function recordMatches(record, boardSha256) {
  return Boolean(record && record.schemaVersion === RECORD_SCHEMA && boardSha256 && record.boardSha256 === boardSha256);
}

export const storageKey = boardSha256 => `coffee-scale:pre-order-review:${boardSha256}`;
