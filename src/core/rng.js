// Seeded randomness. Every generated thing in the world (NPC looks, interests,
// schedules, weather, daily events) is derived from string seeds so a saved
// class stays identical across sessions and machines.

export function hashString(str) {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.state = (typeof seed === 'number' ? seed : hashString(seed)) >>> 0;
  }

  next() {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Pick `n` distinct items. */
  sample(arr, n) { return this.shuffle(arr).slice(0, Math.max(0, n)); }

  /** items: array, weight: (item) => number >= 0 */
  weighted(items, weight) {
    let total = 0;
    const ws = items.map((it) => { const w = Math.max(0, weight(it)); total += w; return w; });
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/** Deterministic RNG from any list of seed parts. */
export function rngFor(...parts) {
  return new RNG(hashString(parts.join('|')));
}
