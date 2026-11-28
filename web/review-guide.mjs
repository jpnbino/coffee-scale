// Guided pre-order review on the Gerber page. Steps come from review-record.mjs;
// answers are kept in localStorage per board SHA-256 and can be downloaded as a
// JSON record. Browser storage may be unavailable (private windows, file://), so
// every read and write is guarded and the review still works for the visit.
import { reviewSteps, emptyRecord, mark, progress, nextPending, exportRecord, recordMatches, storageKey } from "./review-record.mjs";

const byId = id => document.getElementById(id);

function load(key) { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* visit-only */ } }
function forget(key) { try { localStorage.removeItem(key); } catch { /* nothing stored */ } }

export function createReviewGuide({ focus }) {
  const root = byId("review-guide");
  if (!root) return { load() {}, hide() {} };
  let steps = [], record = null, index = -1, key = null, meta = null;

  const persist = () => { if (key) save(key, record); };
  function showProgress() {
    const c = progress(record, steps);
    byId("review-progress").textContent = !steps.length ? "Nothing to step through for this revision."
      : c.done === 0 ? `${c.total} steps: ${steps.filter(s => s.kind !== "pinmap").length} findings, ${steps.filter(s => s.kind === "pinmap").length} pin maps.`
      : `${c.done} of ${c.total} reviewed · ${c.ok} look right · ${c.change} need a change${c.pending ? "" : " · complete"}.`;
    byId("review-start").textContent = c.done === 0 ? "Start review" : c.pending ? "Continue" : "Review again";
    byId("review-start").disabled = !steps.length;
    byId("review-download").disabled = c.done === 0;
    byId("review-clear").disabled = c.done === 0;
  }
  function show(i) {
    index = i;
    const panel = byId("review-step");
    if (i < 0 || i >= steps.length) { panel.hidden = true; return; }
    const step = steps[i], item = record.items[step.id];
    panel.hidden = false;
    panel.dataset.status = item?.status ?? "pending";
    byId("review-count").textContent = `Step ${i + 1} of ${steps.length} · ${step.kind === "pinmap" ? (step.fine ? "pin map, fine pitch" : "pin map") : step.kind === "paste" ? "solder paste finding" : "placement finding"}`;
    byId("review-title").textContent = step.title;
    byId("review-prompt").textContent = step.prompt;
    byId("review-note").value = item?.note ?? "";
    byId("review-back").disabled = i === 0;
    byId("review-next").disabled = i === steps.length - 1;
    focus(step.ref, step.at);
  }
  function answer(status) {
    if (index < 0) return;
    record = mark(record, steps[index].id, status, byId("review-note").value);
    persist(); showProgress();
    const next = nextPending(record, steps, index);
    if (next === -1) { show(-1); byId("review-progress").focus?.(); }
    else show(next);
  }

  byId("review-start").addEventListener("click", () => {
    const c = progress(record, steps);
    show(c.pending ? Math.max(0, nextPending(record, steps, -1)) : 0);
    // Board on top, the step right under it: both in view while reviewing.
    document.getElementById("gerber-canvas")?.scrollIntoView({ block: "start", behavior: "smooth" });
    byId("review-ok").focus({ preventScroll: true });
  });
  byId("review-ok").addEventListener("click", () => answer("ok"));
  byId("review-change").addEventListener("click", () => {
    if (!byId("review-note").value.trim()) { byId("review-note").focus(); byId("review-note").placeholder = "Say what needs changing, then press Needs a change again"; if (!byId("review-note").dataset.asked) { byId("review-note").dataset.asked = "1"; return; } }
    delete byId("review-note").dataset.asked;
    answer("change");
  });
  byId("review-skip").addEventListener("click", () => { if (index < steps.length - 1) show(index + 1); else show(-1); });
  byId("review-back").addEventListener("click", () => show(Math.max(0, index - 1)));
  byId("review-next").addEventListener("click", () => show(Math.min(steps.length - 1, index + 1)));
  byId("review-clear").addEventListener("click", () => {
    record = emptyRecord({ ...meta, reviewer: byId("review-reviewer").value.trim() }); forget(key); show(-1); showProgress();
  });
  byId("review-download").addEventListener("click", () => {
    record = { ...record, reviewer: byId("review-reviewer").value.trim() }; persist();
    const out = exportRecord(record, steps);
    const blob = new Blob([`${JSON.stringify(out, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pre-order-review-${(meta.revision ?? "board").replace(/[^A-Za-z0-9._-]+/g, "-")}-${String(meta.boardSha256 ?? "").slice(0, 8)}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  root.addEventListener("keydown", event => {
    if (byId("review-step").hidden || event.target.tagName === "TEXTAREA") return;
    if (event.key === "ArrowRight" && !byId("review-next").disabled) { event.preventDefault(); show(index + 1); }
    if (event.key === "ArrowLeft" && !byId("review-back").disabled) { event.preventDefault(); show(index - 1); }
  });

  return {
    load(version, check) {
      steps = reviewSteps(check);
      meta = { boardSha256: version.boardSha256 ?? null, revision: version.label ?? version.id, versionId: version.id };
      key = meta.boardSha256 ? storageKey(meta.boardSha256) : null;
      const stored = key ? load(key) : null;
      record = recordMatches(stored, meta.boardSha256) ? stored : emptyRecord(meta);
      byId("review-reviewer").value = record.reviewer ?? "";
      root.hidden = !check;
      show(-1); showProgress();
    },
    hide() { root.hidden = true; },
  };
}
