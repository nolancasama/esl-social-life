// Small shared helpers.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shortest signed angle from a to b. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function lerpAngle(a, b, t) { return a + angleDelta(a, b) * t; }

/** Yaw (rotation.y) that makes a +Z-forward object face from (x1,z1) toward (x2,z2). */
export function yawTo(x1, z1, x2, z2) { return Math.atan2(x2 - x1, z2 - z1); }

export function dist2(x1, z1, x2, z2) { const dx = x2 - x1, dz = z2 - z1; return Math.sqrt(dx * dx + dz * dz); }

export function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let uid = 0;
export function makeId(prefix = 'id') {
  uid = (uid + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${uid.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
