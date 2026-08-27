// src/net/registry.js
//
// Phase 9 (NET-01/NET-02/D-03/D-04). The ONLY file in this repo permitted to
// call ref.on() or ref.off(). No import of UI code, no import of the engine
// or shared tiers, no reference to any caller's mutable state — pure
// transport bookkeeping.
//
// Why attach() itself performs the ref.on(...) call, rather than a caller
// calling .on() and then telling this module about it (the shape sketched
// in RESEARCH.md's "Code Examples"): putting the call inside attach() is
// what makes "no .on() call may bypass the registry" mechanically true —
// there is exactly one line in the whole repo that can ever call it — and
// lets a later contract check assert that by exempting a single file rather
// than trying to judge every call site by hand. Do not "simplify" this back
// to a two-step call-then-register shape.
//
// Why the original Reference object is stored, never a path string rebuilt
// at detach time: Firebase's .off(event, callback) is documented to match
// only against the exact function reference passed to .on(). Whether a
// *freshly constructed* reference to the same path can also detach a
// listener attached via a different reference instance is empirically
// plausible but only medium-confidence (one reproducible bug report, no
// maintainer confirmation — see RESEARCH.md Pitfall 1 / Assumption A1).
// Storing the original object costs nothing and makes the question moot:
// this registry never needs the answer to be true.
//
// Why detach() always uses the two-argument ref.off(event, callback) form
// and never the one-argument ref.off(event) form: the single-argument form
// removes *every* listener on that path for that event, including ones a
// caller elsewhere in the app still needs. It would make a broken teardown
// look correct in a listener count while quietly destroying unrelated
// listeners. Only the exact two-argument form is used, ever.

let nextId = 1;
const entries = new Map(); // id -> { id, key, scope, ref, event, callback, cancelCallback, label, path }

function keyFor(scope, ref, event, label) {
  return `${scope}|${ref.toString()}|${event}|${label || ""}`;
}

export function attach({ scope, ref, event, callback, cancelCallback, label }) {
  const key = keyFor(scope, ref, event, label);
  for (const e of entries.values()) {
    if (e.key === key) {
      // Loud, not silent: a duplicate attach for an already-tracked key is
      // almost always a double-invoked entry point (a re-submitted join
      // form, a re-entrant setup call) rather than an intentional second
      // listener. Refusing to attach a second time turns that from a
      // latent leak into a visible dev-console error.
      console.error(`[src/net/registry.js] duplicate attach refused for key "${key}" — was the caller's setup entry point invoked twice?`);
      return e.id;
    }
  }
  const id = nextId++;
  const path = ref.toString();
  if (cancelCallback) {
    ref.on(event, callback, cancelCallback);
  } else {
    ref.on(event, callback);
  }
  entries.set(id, { id, key, scope, ref, event, callback, cancelCallback, label, path });
  return id;
}

export function detach(id) {
  const e = entries.get(id);
  if (!e) return false;
  e.ref.off(e.event, e.callback);
  entries.delete(id);
  return true;
}

export function detachRoom() {
  let count = 0;
  for (const e of [...entries.values()]) {
    if (e.scope === "room") {
      detach(e.id);
      count++;
    }
  }
  return count;
}

export function detachAll() {
  let count = 0;
  for (const id of [...entries.keys()]) {
    detach(id);
    count++;
  }
  return count;
}

export function size(scope) {
  if (!scope) return entries.size;
  let n = 0;
  for (const e of entries.values()) if (e.scope === scope) n++;
  return n;
}

export function list() {
  return [...entries.values()].map(({ id, scope, event, label, path }) => ({ id, scope, event, label, path }));
}
