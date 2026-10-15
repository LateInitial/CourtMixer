// CourtMixer - core helpers: version, ids, escaping, seeded random (storage access is in store.js)
// Moved verbatim from index.html in Phase 0 (v1.9.0). Loaded as a classic script;
// all top-level declarations share one global scope, exactly as before the split.

/* ===== CourtMixer core helpers ===== */
const APP_VERSION = "1.15.0";
function uid() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  var b = null;
  try { if (typeof crypto !== "undefined" && crypto.getRandomValues) { b = new Uint8Array(16); crypto.getRandomValues(b); } } catch (e) { b = null; }
  if (!b) { b = new Uint8Array(16); for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  var h = []; for (var j = 0; j < 16; j++) h.push((b[j] + 0x100).toString(16).slice(1));
  return h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" + h.slice(6, 8).join("") + "-" + h.slice(8, 10).join("") + "-" + h.slice(10, 16).join("");
}
// Single escaper for every place a name or free-text value is interpolated into HTML.
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
function nm(v) { return "<strong>" + esc(v == null ? "?" : v) + "</strong>"; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Changes only when a score is added, edited or removed -- not on every re-render.
