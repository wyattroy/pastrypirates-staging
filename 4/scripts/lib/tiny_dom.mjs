// scripts/lib/tiny_dom.mjs
//
// REVIEW TOOLING ONLY. Nothing in `src/` or `index.html` may import this, and it never ships to a
// player. It exists for exactly one caller: scripts/lib/audit_page_headless.mjs, which needs to RUN
// art-review/narration-audit.html's own module script under plain `node` so `npm test` can answer
// "how many cards does that page actually render, and what does its own D-21 self-check say?"
//
// ============================================================================
// WHY A DOM SHIM AND NOT A STATIC READ OF THE PAGE (15-07 second pass, 2026-07-30)
// ============================================================================
// scripts/narration_audit_check.js was written STATIC on purpose — it reads the page as text. That
// caught five real classes of decay and it stays. But a static read has one blind spot, and the
// blind spot is the failure mode that has now killed this page TWICE:
//
//   an exception inside a card builder, at render time.
//
// Measured at 2cbe551: `adhocCards()` calls `buildAdhocKeyCards(entry, fileLine)` and `fileLine`
// does not exist in that scope any more — it was the old line-keyed parameter, deleted by 15-07
// Task 3's re-key. Every call throws ReferenceError. The page's per-group safe boundary turns each
// throwing NODE_GROUP into ONE error card, so instead of a blank page (the 15-06 failure) the page
// renders a plausible-looking 61 cards and silently drops the other ~150. `npm test` reported
// 22/22 PASS the whole time, because every assertion it makes is answerable from the page's TEXT,
// and the text is fine. Only EXECUTING it reveals the ReferenceError.
//
// scripts/no_undef_check.js would have caught this identifier — it is exactly its failure class —
// but it is scoped to `src/**/*.js` and the audit page is not in `src/`. Executing the page covers
// that gap for real rather than by extending a heuristic.
//
// ============================================================================
// WHAT THIS IS AND IS NOT
// ============================================================================
// It is a deliberately small, hand-rolled HTML parser plus the ~30 DOM methods that page uses. No
// dependency (this repo has no build step and a zero-dependency stance — docs/MODULES.md), no
// jsdom, no CDN. It is NOT a spec-correct DOM and must never be treated as one:
//
//   - Text nodes keep their RAW source bytes, entities un-decoded. So `innerHTML` round-trips
//     exactly (which is what the page's D-38 sign-rule scan needs — it regex-matches innerHTML),
//     while `textContent` returns still-escaped text. The page only ever reads textContent for card
//     TITLES and labels, never for a copy comparison, so this is safe here and nowhere else.
//   - Layout is fake: every getBoundingClientRect() is zeros and requestAnimationFrame never
//     fires, so the page's flow-chart edge drawing and scroll restore (both rAF-deferred) do not
//     run. They render no cards, so no coverage question depends on them.
//   - The selector engine handles what this page uses: comma groups, descendant combinators, and
//     compounds of tag / #id / .class / [attr="value"]. Nothing else. It THROWS on a selector it
//     cannot parse rather than silently matching nothing — a shim that quietly returns [] would
//     manufacture exactly the false "everything is missing" the gate exists to distinguish from a
//     real gap.
// ============================================================================

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
// Elements whose content is text, never markup — a `<style>` block full of CSS `a > b` selectors
// would otherwise be parsed as tags.
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

/* ================= parsing ================= */

const ATTR_RE = /([:@\w.-]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(raw) {
  const attrs = {};
  if (!raw) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : "";
    attrs[name] = value;
  }
  return attrs;
}

/** Parse `html` into a list of nodes, all parented to `owner` (an Element or null). */
export function parseFragment(html, doc) {
  const root = new Element("#fragment", {}, doc);
  let stack = [root];
  const src = String(html == null ? "" : html);
  let i = 0;
  const pushText = (text) => {
    if (!text) return;
    stack[stack.length - 1].childNodes.push(new TextNode(text, stack[stack.length - 1]));
  };
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) { pushText(src.slice(i)); break; }
    pushText(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<!", lt)) {
      const end = src.indexOf(">", lt);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    const gt = src.indexOf(">", lt);
    if (gt === -1) { pushText(src.slice(lt)); break; }
    const inner = src.slice(lt + 1, gt);
    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim().toLowerCase();
      // Close the nearest matching open element; ignore a stray close tag rather than unwinding
      // the whole stack (this page's generated HTML is well formed, but its hand-written head is
      // ordinary human HTML).
      for (let d = stack.length - 1; d > 0; d--) {
        if (stack[d].tagName === name) { stack = stack.slice(0, d); break; }
      }
      i = gt + 1;
      continue;
    }
    const sm = /^([\w:-]+)([\s\S]*)$/.exec(inner);
    if (!sm) { pushText(src.slice(lt, gt + 1)); i = gt + 1; continue; }
    const name = sm[1].toLowerCase();
    let attrRaw = sm[2];
    const selfClosing = /\/\s*$/.test(attrRaw);
    if (selfClosing) attrRaw = attrRaw.replace(/\/\s*$/, "");
    const el = new Element(name, parseAttrs(attrRaw), doc);
    const parent = stack[stack.length - 1];
    el.parentNode = parent;
    parent.childNodes.push(el);
    i = gt + 1;
    if (VOID_TAGS.has(name) || selfClosing) continue;
    if (RAW_TEXT_TAGS.has(name)) {
      const closeIdx = src.toLowerCase().indexOf(`</${name}`, i);
      const end = closeIdx === -1 ? src.length : closeIdx;
      const text = src.slice(i, end);
      if (text) el.childNodes.push(new TextNode(text, el));
      const gt2 = closeIdx === -1 ? src.length : src.indexOf(">", closeIdx);
      i = gt2 === -1 ? src.length : gt2 + 1;
      continue;
    }
    stack.push(el);
  }
  const kids = root.childNodes.slice();
  kids.forEach((k) => { k.parentNode = null; });
  return kids;
}

/* ================= selectors ================= */

// A compound: optional tag, optional #id, any number of .class and [attr="value"].
const COMPOUND_RE = /^(?:([\w:-]+|\*))?((?:[#.][\w:-]+|\[[^\]]+\])*)$/;
const PIECE_RE = /([#.])([\w:-]+)|\[\s*([\w:-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*)?\]/g;

function parseCompound(text) {
  const m = COMPOUND_RE.exec(text);
  if (!m) throw new Error(`tiny_dom: unsupported selector compound "${text}"`);
  const out = { tag: m[1] && m[1] !== "*" ? m[1].toLowerCase() : null, id: null, classes: [], attrs: [] };
  PIECE_RE.lastIndex = 0;
  let p;
  while ((p = PIECE_RE.exec(m[2] || ""))) {
    if (p[1] === "#") out.id = unescapeCss(p[2]);
    else if (p[1] === ".") out.classes.push(unescapeCss(p[2]));
    else {
      const value = p[5] !== undefined ? p[5] : p[6] !== undefined ? p[6] : p[7];
      if (p[4] && p[4] !== "=") throw new Error(`tiny_dom: unsupported attribute operator "${p[4]}" in "${text}"`);
      out.attrs.push({ name: p[3].toLowerCase(), value: value === undefined ? null : unescapeCss(value) });
    }
  }
  return out;
}

// A real CSS parser consumes backslash escapes before the value is compared, so
// `[data-id="table\:fish\~empty"]` (what CSS.escape produces for `table:fish~empty`) matches the
// unescaped attribute. Without this, every CSS.escape()'d lookup on the audit page — and the page
// does that for EVERY card id, all of which contain `:` — would miss, and the harness would invent
// findings the browser does not have. Measured: leaving it out reported 129 self-check failures
// where Chrome reports 128, and the one extra was purely this. Only the identity form is needed
// (CSS.escape never emits a hex escape for the characters card ids use).
function unescapeCss(value) {
  return String(value).replace(/\\(.)/g, "$1");
}

const SELECTOR_CACHE = new Map();
function parseSelector(sel) {
  const key = String(sel);
  if (SELECTOR_CACHE.has(key)) return SELECTOR_CACHE.get(key);
  const groups = key.split(",").map((g) => g.trim()).filter(Boolean).map((g) =>
    g.split(/\s+/).filter(Boolean).map(parseCompound));
  if (!groups.length) throw new Error(`tiny_dom: empty selector "${key}"`);
  SELECTOR_CACHE.set(key, groups);
  return groups;
}

function matchesCompound(el, c) {
  if (el.nodeType !== 1) return false;
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.getAttribute("id") !== c.id) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v === null) return false;
    if (a.value !== null && v !== a.value) return false;
  }
  return true;
}

// Descendant-only combinator (the page uses no ">", "+" or "~").
function matchesGroup(el, group) {
  if (!matchesCompound(el, group[group.length - 1])) return false;
  let gi = group.length - 2;
  let node = el.parentNode;
  while (gi >= 0) {
    if (!node) return false;
    if (matchesCompound(node, group[gi])) gi--;
    node = node.parentNode;
  }
  return true;
}

function matchesSelector(el, sel) {
  return parseSelector(sel).some((g) => matchesGroup(el, g));
}

/* ================= nodes ================= */

class TextNode {
  constructor(data, parent) {
    this.nodeType = 3;
    this.data = data;
    this.parentNode = parent || null;
  }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

function serialize(node) {
  if (node.nodeType === 3) return node.data;
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v}"`).join("");
  if (VOID_TAGS.has(node.tagName)) return `<${node.tagName}${attrs}>`;
  return `<${node.tagName}${attrs}>${node.childNodes.map(serialize).join("")}</${node.tagName}>`;
}

class Element {
  constructor(tagName, attrs, doc) {
    this.nodeType = 1;
    this.tagName = String(tagName).toLowerCase();
    this.attrs = attrs || {};
    this.childNodes = [];
    this.parentNode = null;
    this.ownerDocument = doc || null;
    this.style = {};
    this._listeners = {};
    // Live form-control state the page reads back (checkbox seeding, select values, textarea copy).
    this._value = undefined;
    this._checked = undefined;
  }

  /* ---- attributes ---- */
  getAttribute(name) {
    const v = this.attrs[String(name).toLowerCase()];
    return v === undefined ? null : v;
  }
  setAttribute(name, value) { this.attrs[String(name).toLowerCase()] = String(value); }
  removeAttribute(name) { delete this.attrs[String(name).toLowerCase()]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, String(name).toLowerCase()); }

  get id() { return this.getAttribute("id") || ""; }
  set id(v) { this.setAttribute("id", v); }

  get className() { return this.getAttribute("class") || ""; }
  set className(v) { this.setAttribute("class", v); }

  get classList() {
    const el = this;
    const list = () => (el.className || "").split(/\s+/).filter(Boolean);
    return {
      contains: (c) => list().includes(c),
      add: (...cs) => { const s = list(); cs.forEach((c) => { if (!s.includes(c)) s.push(c); }); el.className = s.join(" "); },
      remove: (...cs) => { el.className = list().filter((c) => !cs.includes(c)).join(" "); },
      toggle: (c, force) => {
        const has = list().includes(c);
        const want = force === undefined ? !has : !!force;
        if (want) el.classList.add(c); else el.classList.remove(c);
        return want;
      },
    };
  }

  get dataset() {
    const el = this;
    const toAttr = (k) => "data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    return new Proxy({}, {
      get(_t, k) {
        if (typeof k !== "string") return undefined;
        const v = el.getAttribute(toAttr(k));
        return v === null ? undefined : v;
      },
      set(_t, k, v) { el.setAttribute(toAttr(k), v); return true; },
      has(_t, k) { return el.hasAttribute(toAttr(k)); },
    });
  }

  /* ---- form-control state ---- */
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === "select") {
      const opts = this.querySelectorAll("option");
      const sel = opts.find((o) => o.hasAttribute("selected"));
      const pick = sel || opts[0];
      return pick ? (pick.getAttribute("value") ?? pick.textContent) : "";
    }
    if (this.tagName === "textarea") return this.textContent;
    return this.getAttribute("value") || "";
  }
  set value(v) { this._value = String(v); }
  get checked() {
    if (this._checked !== undefined) return this._checked;
    return this.hasAttribute("checked");
  }
  set checked(v) { this._checked = !!v; }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(v) { if (v) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }

  /* ---- content ---- */
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get textContent() { return this.childNodes.map((n) => (n.nodeType === 3 ? n.data : n.textContent)).join(""); }
  set textContent(v) {
    this.childNodes = [];
    const text = v == null ? "" : String(v);
    if (text) this.childNodes.push(new TextNode(text, this));
  }
  get innerHTML() { return this.childNodes.map(serialize).join(""); }
  set innerHTML(html) {
    this.childNodes = parseFragment(html, this.ownerDocument);
    this.childNodes.forEach((n) => { n.parentNode = this; });
  }
  get outerHTML() { return serialize(this); }

  appendChild(node) {
    if (node.parentNode) node.remove();
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  insertBefore(node, ref) {
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (node.parentNode) node.remove();
    node.parentNode = this;
    if (idx === -1) this.childNodes.push(node); else this.childNodes.splice(idx, 0, node);
    return node;
  }
  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    node.parentNode = null;
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  insertAdjacentHTML(position, html) {
    const nodes = parseFragment(html, this.ownerDocument);
    const pos = String(position).toLowerCase();
    if (pos === "beforeend") { nodes.forEach((n) => this.appendChild(n)); return; }
    if (pos === "afterbegin") { nodes.reverse().forEach((n) => this.insertBefore(n, this.childNodes[0] || null)); return; }
    if (!this.parentNode) throw new Error(`tiny_dom: insertAdjacentHTML("${pos}") on a node with no parent`);
    if (pos === "beforebegin") { nodes.forEach((n) => this.parentNode.insertBefore(n, this)); return; }
    if (pos === "afterend") {
      const sibs = this.parentNode.childNodes;
      const at = sibs.indexOf(this) + 1;
      nodes.forEach((n, k) => { n.parentNode = this.parentNode; sibs.splice(at + k, 0, n); });
      return;
    }
    throw new Error(`tiny_dom: unsupported insertAdjacentHTML position "${position}"`);
  }

  /* ---- traversal ---- */
  _walk(fn) {
    for (const child of this.childNodes) {
      if (child.nodeType !== 1) continue;
      fn(child);
      child._walk(fn);
    }
  }
  querySelectorAll(sel) {
    const groups = parseSelector(sel);
    const out = [];
    this._walk((el) => { if (groups.some((g) => matchesGroup(el, g))) out.push(el); });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches(sel) { return matchesSelector(this, sel); }
  closest(sel) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (matchesSelector(node, sel)) return node;
      node = node.parentNode;
    }
    return null;
  }

  /* ---- events / layout (inert) ---- */
  addEventListener(type, fn) { (this._listeners[type] || (this._listeners[type] = [])).push(fn); }
  removeEventListener(type, fn) {
    const l = this._listeners[type] || [];
    const i = l.indexOf(fn);
    if (i !== -1) l.splice(i, 1);
  }
  dispatchEvent(ev) {
    (this._listeners[(ev && ev.type) || ""] || []).forEach((fn) => fn.call(this, ev || { target: this }));
    return true;
  }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  scrollIntoView() {}
  focus() {}
  click() { this.dispatchEvent({ type: "click", target: this }); }
}

/* ================= document ================= */

class Document {
  constructor(html) {
    this.nodeType = 9;
    const nodes = parseFragment(html, this);
    this.documentElement = nodes.find((n) => n.nodeType === 1 && n.tagName === "html")
      || (() => { const r = new Element("html", {}, this); nodes.forEach((n) => r.appendChild(n)); return r; })();
    this.documentElement.ownerDocument = this;
    this.body = this.documentElement.querySelector("body") || this.documentElement;
    this.head = this.documentElement.querySelector("head") || this.documentElement;
    this._listeners = {};
  }
  createElement(tag) { return new Element(tag, {}, this); }
  createTextNode(text) { return new TextNode(String(text), null); }
  getElementById(id) {
    let found = null;
    this.documentElement._walk((el) => { if (!found && el.getAttribute("id") === id) found = el; });
    return found;
  }
  querySelector(sel) { return this.documentElement.querySelector(sel); }
  querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); }
  addEventListener(type, fn) { (this._listeners[type] || (this._listeners[type] = [])).push(fn); }
  removeEventListener() {}
}

/** Build a Document from a full HTML string. */
export function parseDocument(html) { return new Document(html); }

/**
 * CSS.escape, restricted to what this page needs (card ids: letters, digits, `:._~-`). Never
 * silently drops a character it does not recognise — it escapes it, exactly like the real thing.
 */
export function cssEscape(value) {
  return String(value).replace(/[^\w-]/g, (c) => "\\" + c);
}
