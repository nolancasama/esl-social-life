// Ground-plane collision: static AABBs and circles, plus dynamic circles for
// characters. Cheap enough to run for every character every frame.

export class CollisionWorld {
  constructor({ boxes = [], circles = [], bounds = null } = {}) {
    this.boxes = boxes;
    this.circles = circles;
    this.bounds = bounds; // { minX, maxX, minZ, maxZ }
    this.dynamic = [];    // { x, z, r, owner }
    this.canopies = [];   // camera-only blockers: { x, z, r, y0, y1 }
  }

  /** Would a camera at (x, y, z) sit inside a building or tree canopy? */
  cameraBlocked(x, y, z) {
    if (this.heightAt(x, z) > y - 0.3) return true;
    for (const c of this.canopies) if (y > c.y0 && y < c.y1 && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }

  addBox(b) { this.boxes.push(b); }
  addCircle(c) { this.circles.push(c); }

  /** Push (x,z) out of all colliders. Returns {x,z}. */
  resolve(x, z, r, ignore = null) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (x + r <= b.minX || x - r >= b.maxX || z + r <= b.minZ || z - r >= b.maxZ) continue;
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        let dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          if (d >= r) continue;
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the shallowest axis.
          const pl = x - b.minX + r, pr = b.maxX - x + r, pt = z - b.minZ + r, pb = b.maxZ - z + r;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r; else if (m === pr) x = b.maxX + r; else if (m === pt) z = b.minZ - r; else z = b.maxZ + r;
        }
        moved = true;
      }
      const all = this.circles.concat(this.dynamic);
      for (const c of all) {
        if (c.owner && c.owner === ignore) continue;
        const dx = x - c.x, dz = z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        x = c.x + (dx / d) * rr;
        z = c.z + (dz / d) * rr;
        moved = true;
      }
      if (this.bounds) {
        x = Math.max(this.bounds.minX + r, Math.min(this.bounds.maxX - r, x));
        z = Math.max(this.bounds.minZ + r, Math.min(this.bounds.maxZ - r, z));
      }
      if (!moved) break;
    }
    return { x, z };
  }

  isFree(x, z, r, { dynamic = false, ignore = null } = {}) {
    if (this.bounds && (x - r < this.bounds.minX || x + r > this.bounds.maxX || z - r < this.bounds.minZ || z + r > this.bounds.maxZ)) return false;
    for (const b of this.boxes) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    }
    const list = dynamic ? this.circles.concat(this.dynamic) : this.circles;
    for (const c of list) {
      if (c.owner && c.owner === ignore) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return false;
    }
    return true;
  }

  /** Nearest free point by spiral search. */
  nearestFree(x, z, r, opts) {
    if (this.isFree(x, z, r, opts)) return { x, z };
    for (let ring = 1; ring < 40; ring++) {
      const rad = ring * 0.2;
      const steps = 8 + ring * 2;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        if (this.isFree(px, pz, r, opts)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  /** Is the straight walk from A to B clear of static colliders? */
  clearLine(x1, z1, x2, z2, r) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(2, Math.ceil(d / 0.25));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, r)) return false;
    }
    return true;
  }

  /** Height of the tallest collider covering (x,z) (for camera occlusion). */
  heightAt(x, z) {
    let h = 0;
    for (const b of this.boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) h = Math.max(h, b.h || 0);
    for (const c of this.circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) h = Math.max(h, c.h || 0);
    return h;
  }
}
