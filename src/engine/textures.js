// Canvas-generated textures: faces, signs, chalkboard, clock, floors.

import * as THREE from 'three';

const FONT = '"Nunito", "Hiragino Maru Gothic ProN", "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif';
export const FONT_STACK = FONT;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = null, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}

// ---------------------------------------------------------------------------
// Faces. 3 eye styles × 6 expressions, shared by every character.

export const EXPRESSIONS = ['neutral', 'happy', 'talk', 'surprised', 'blink', 'worried'];
const FW = 192, FH = 160;
const EYE_Y = 74, EYE_DX = 36, CX = FW / 2;

function eye(g, x, y, style, expr) {
  g.fillStyle = '#2B2230';
  g.strokeStyle = '#2B2230';
  g.lineCap = 'round';
  if (expr === 'happy') {
    g.lineWidth = 7;
    g.beginPath(); g.arc(x, y + 6, 12, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    return;
  }
  if (expr === 'blink') {
    g.lineWidth = 6;
    g.beginPath(); g.arc(x, y - 4, 12, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    return;
  }
  if (expr === 'surprised') {
    g.fillStyle = '#FFFFFF';
    g.beginPath(); g.ellipse(x, y, 15, 18, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.stroke();
    g.fillStyle = '#2B2230';
    g.beginPath(); g.ellipse(x, y + 2, 8, 10, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath(); g.arc(x - 3, y - 2, 3, 0, Math.PI * 2); g.fill();
    return;
  }
  const ry = style === 'sleepy' ? 13 : style === 'happy' ? 15 : 17;
  g.beginPath(); g.ellipse(x, y, 12.5, ry, 0, 0, Math.PI * 2); g.fill();
  if (style === 'sleepy') {
    // Heavy upper lid.
    g.fillStyle = '#2B2230';
    g.fillRect(x - 16, y - ry - 2, 32, 7);
  }
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.arc(x - 4, y - 6, 4.6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(x + 4, y + 6, 2.2, 0, Math.PI * 2); g.fill();
  if (style === 'happy') {
    g.fillStyle = 'rgba(0,0,0,0)';
  }
}

function brows(g, expr) {
  g.strokeStyle = 'rgba(60,40,35,0.85)';
  g.lineWidth = 4.5;
  g.lineCap = 'round';
  const lift = expr === 'surprised' ? -8 : 0;
  for (const s of [-1, 1]) {
    const x = CX + s * EYE_DX;
    g.beginPath();
    if (expr === 'worried') { g.moveTo(x - s * 12, EYE_Y - 26); g.lineTo(x + s * 10, EYE_Y - 32); }
    else { g.moveTo(x - 11, EYE_Y - 28 + lift); g.quadraticCurveTo(x, EYE_Y - 33 + lift, x + 11, EYE_Y - 28 + lift); }
    g.stroke();
  }
}

function mouth(g, expr) {
  const y = 122;
  g.lineCap = 'round';
  g.strokeStyle = '#5A2A2A';
  g.fillStyle = '#7A2E35';
  if (expr === 'happy') {
    g.beginPath(); g.moveTo(CX - 15, y - 5); g.quadraticCurveTo(CX, y + 22, CX + 15, y - 5); g.closePath(); g.fill();
    g.fillStyle = '#FF8FA3';
    g.beginPath(); g.ellipse(CX, y + 7, 7, 4, 0, 0, Math.PI * 2); g.fill();
  } else if (expr === 'talk') {
    g.beginPath(); g.ellipse(CX, y + 2, 9, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FF8FA3';
    g.beginPath(); g.ellipse(CX, y + 6, 5, 3, 0, 0, Math.PI * 2); g.fill();
  } else if (expr === 'surprised') {
    g.beginPath(); g.ellipse(CX, y + 2, 6, 7, 0, 0, Math.PI * 2); g.fill();
  } else if (expr === 'worried') {
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(CX - 10, y + 4); g.quadraticCurveTo(CX - 4, y - 2, CX, y + 3); g.quadraticCurveTo(CX + 4, y + 8, CX + 10, y + 2); g.stroke();
  } else {
    g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(CX - 11, y); g.quadraticCurveTo(CX, y + 10, CX + 11, y); g.stroke();
  }
}

let faceTextures = null;
export function getFaceTexture(style, expr) {
  if (!faceTextures) faceTextures = new Map();
  const key = `${style}:${expr}`;
  if (faceTextures.has(key)) return faceTextures.get(key);
  const [c, g] = canvas(FW, FH);
  g.clearRect(0, 0, FW, FH);
  // Blush
  g.fillStyle = 'rgba(255,140,160,0.45)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(CX + s * 52, 104, 15, 8, 0, 0, Math.PI * 2); g.fill(); }
  brows(g, expr);
  for (const s of [-1, 1]) eye(g, CX + s * EYE_DX, EYE_Y, style, expr);
  mouth(g, expr);
  const t = tex(c);
  faceTextures.set(key, t);
  return t;
}

const faceMats = new Map();
export function faceMaterial(style, expr) {
  const key = `${style}:${expr}`;
  if (!faceMats.has(key)) {
    faceMats.set(key, new THREE.MeshBasicMaterial({ map: getFaceTexture(style, expr), transparent: true, depthWrite: false, alphaTest: 0.02 }));
  }
  return faceMats.get(key);
}

// ---------------------------------------------------------------------------
// Text and signs

/** lines: [{ text, size, color, weight, y (0..1), font }] */
export function textTexture(w, h, { bg = null, border = null, radius = 0, lines = [], pad = 0 } = {}) {
  const [c, g] = canvas(w, h);
  if (bg) {
    g.fillStyle = bg;
    if (radius) { roundRect(g, pad, pad, w - pad * 2, h - pad * 2, radius); g.fill(); }
    else g.fillRect(0, 0, w, h);
  }
  if (border) {
    g.strokeStyle = border.color;
    g.lineWidth = border.width;
    roundRect(g, border.width / 2 + pad, border.width / 2 + pad, w - border.width - pad * 2, h - border.width - pad * 2, radius);
    g.stroke();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of lines) {
    g.fillStyle = l.color || '#222';
    g.font = `${l.weight || 800} ${l.size || 32}px ${l.font || FONT}`;
    const x = (l.x ?? 0.5) * w;
    if (l.align) g.textAlign = l.align;
    g.fillText(l.text, x, (l.y ?? 0.5) * h, w * 0.94);
    g.textAlign = 'center';
  }
  return tex(c);
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function plankTexture(a = '#C99A6B', b = '#B98A5D', planks = 8) {
  const [c, g] = canvas(256, 256);
  const h = 256 / planks;
  for (let i = 0; i < planks; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(0, i * h, 256, h);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, i * h, 256, 2);
    const off = (i * 97) % 256;
    g.fillRect(off, i * h, 2, h);
  }
  return tex(c, { repeat: [3, 3] });
}

export function tileTexture(a = '#F3EBDD', b = '#E8DCC8', n = 8) {
  const [c, g] = canvas(256, 256);
  const s = 256 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? a : b;
    g.fillRect(x * s, y * s, s, s);
  }
  return tex(c, { repeat: [2, 2] });
}

export function clockTexture(h, m) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3D4451'; g.lineWidth = 7; g.stroke();
  g.fillStyle = '#3D4451';
  g.font = `800 15px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(String(i), 64 + Math.cos(a) * 45, 64 + Math.sin(a) * 45);
  }
  const ha = ((h % 12) + m / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  const ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
  g.lineCap = 'round';
  g.lineWidth = 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(ha) * 26, 64 + Math.sin(ha) * 26); g.stroke();
  g.lineWidth = 4.5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(ma) * 40, 64 + Math.sin(ma) * 40); g.stroke();
  g.fillStyle = '#FF6B6B'; g.beginPath(); g.arc(64, 64, 5, 0, Math.PI * 2); g.fill();
  return tex(c);
}

/** Emoji drawn to a texture (used for small billboards like food and items). */
const emojiCache = new Map();
export function emojiTexture(emoji, size = 128) {
  const key = emoji + size;
  if (emojiCache.has(key)) return emojiCache.get(key);
  const [c, g] = canvas(size, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.floor(size * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(emoji, size / 2, size / 2 + size * 0.05);
  const t = tex(c);
  emojiCache.set(key, t);
  return t;
}

export function stripeTexture(colors, vertical = false) {
  const [c, g] = canvas(64, 64);
  const n = colors.length;
  colors.forEach((col, i) => {
    g.fillStyle = col;
    if (vertical) g.fillRect((i * 64) / n, 0, 64 / n + 1, 64);
    else g.fillRect(0, (i * 64) / n, 64, 64 / n + 1);
  });
  return tex(c);
}
