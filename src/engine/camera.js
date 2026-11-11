// Camera rig: third-person follow (outdoors), "dollhouse" room view
// (interiors), conversation framing and fixed activity shots. All moves glide;
// nothing cuts or spins so it stays comfortable for children.

import * as THREE from 'three';
import { damp, angleDelta, clamp } from '../core/util.js';

const tmp = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'follow';          // 'follow' | 'room' | 'talk' | 'shot'
    this.yaw = 0;                  // camera sits at target + (sin yaw, ., cos yaw) * dist
    this.pitch = 0.43;
    this.dist = 6.6;
    this.pos = new THREE.Vector3(0, 5, 8);
    this.look = new THREE.Vector3();
    this.goalPos = new THREE.Vector3();
    this.goalLook = new THREE.Vector3();
    this.cfg = { mode: 'follow', yaw: 0, pitch: 0.43, dist: 6.6 };
    this.target = null;            // character to follow
    this.collision = null;
    this.manualUntil = 0;
    this.speed = 6;
    this.time = 0;
    this.talkShot = null;
  }

  /** Apply a scene's camera config and snap into place. */
  configure(cfg, target, collision) {
    this.cfg = { mode: 'follow', yaw: 0, pitch: 0.43, dist: 6.6, ...cfg };
    this.mode = this.cfg.mode;
    this.yaw = this.cfg.yaw;
    this.pitch = this.cfg.pitch;
    this.dist = this.cfg.dist;
    this.target = target;
    this.collision = collision;
    this.talkShot = null;
    this._computeGoal(0);
    this.pos.copy(this.goalPos);
    this.look.copy(this.goalLook);
    this._apply();
  }

  /** Camera-relative movement basis. */
  basis() {
    const y = this.mode === 'room' || this.mode === 'follow' ? this.yaw : this.cfg.yaw;
    return { fx: -Math.sin(y), fz: -Math.cos(y), rx: Math.cos(y), rz: -Math.sin(y) };
  }

  rotateBy(dYaw) {
    if (this.mode === 'room') {
      this.yaw = this.cfg.yaw + clamp(angleDelta(this.cfg.yaw, this.yaw + dYaw), -0.55, 0.55);
    } else if (this.mode === 'follow') {
      this.yaw += dYaw;
    }
    this.manualUntil = this.time + 2.5;
  }

  /** Called by the player controller each frame while walking. */
  autoFollow(heading, forwardAmount, speed, dt) {
    if (this.mode !== 'follow' || this.time < this.manualUntil) return;
    if (forwardAmount < 0.35 || speed < 0.5) return;
    const want = heading + Math.PI;
    const d = angleDelta(this.yaw, want);
    const rate = 1.1 * forwardAmount * Math.min(1, speed / 3);
    this.yaw += clamp(d, -rate * dt, rate * dt);
  }

  /**
   * Frame a conversation between two or three people. Tries several angles
   * and avoids bystanders standing between the camera and the speakers.
   */
  frameTalk(people, { occluders = [] } = {}) {
    const pts = people.map((p) => (p.root ? p.root.position : p));
    const c = new THREE.Vector3();
    for (const p of pts) c.add(p);
    c.multiplyScalar(1 / pts.length);
    const a = pts[0], b = pts[1] || pts[0];
    const v = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    const spread = Math.max(v.length(), ...pts.map((p) => tmp.set(p.x - c.x, 0, p.z - c.z).length() * 2));
    if (v.lengthSq() < 1e-4) v.set(0, 0, -1);
    v.normalize();
    const indoor = this.cfg.mode === 'room';
    const dist = Math.max(3.1, spread * 1.3 + 2.0);
    const height = indoor ? 2.05 : 1.75;
    const base = Math.atan2(-v.z, v.x); // perpendicular to the speakers' line
    const candidates = [];
    for (const side of [0, Math.PI]) {
      for (const off of [0, 0.45, -0.45, 0.9, -0.9]) {
        const ang = base + side + off;
        const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
        const pos = c.clone().addScaledVector(dir, dist).addScaledVector(v, -dist * 0.25);
        pos.y = height;
        candidates.push({ pos, off: Math.abs(off) });
      }
    }
    const bnd = this.cfg.bounds;
    const score = (cand) => {
      const p = cand.pos;
      let sc = p.distanceTo(this.pos) * 0.25 + cand.off * 1.5;
      if (bnd) {
        const cx = clamp(p.x, bnd.minX, bnd.maxX), cz = clamp(p.z, bnd.minZ, bnd.maxZ);
        sc += (Math.abs(cx - p.x) + Math.abs(cz - p.z)) * 8;
      }
      if (indoor && p.z < c.z - 0.5) sc += 6; // rooms are open to the south
      if (this.collision && this.collision.heightAt(p.x, p.z) > 1.4) sc += 40;
      if (this.collision) {
        for (let i = 1; i <= 6; i++) {
          const t = i / 7;
          const x = p.x + (c.x - p.x) * t, z = p.z + (c.z - p.z) * t;
          if (this.collision.heightAt(x, z) > height - 0.2) { sc += 25; break; }
        }
      }
      // Bystanders near the line of sight block the view.
      for (const o of occluders) {
        const dx = c.x - p.x, dz = c.z - p.z;
        const len2 = dx * dx + dz * dz || 1;
        const t = clamp(((o.x - p.x) * dx + (o.z - p.z) * dz) / len2, 0, 1);
        if (t > 0.93) continue;
        const px = p.x + dx * t, pz = p.z + dz * t;
        const d = Math.hypot(o.x - px, o.z - pz);
        if (d < 0.7) sc += (0.7 - d) * 40 + 8;
      }
      return sc;
    };
    candidates.sort((x, y) => score(x) - score(y));
    const pos = candidates[0].pos.clone();
    if (bnd) { pos.x = clamp(pos.x, bnd.minX, bnd.maxX); pos.z = clamp(pos.z, bnd.minZ, bnd.maxZ); }
    const look = c.clone();
    look.y = 0.95;
    this.talkShot = { pos, look };
    this.mode = 'talk';
    this.speed = 4.2;
  }

  shot(pos, look, speed = 4) {
    this.talkShot = { pos: pos.clone(), look: look.clone() };
    this.mode = 'shot';
    this.speed = speed;
  }

  release() {
    this.mode = this.cfg.mode;
    this.talkShot = null;
    this.speed = 3.5;
    if (this.mode === 'follow' && this.target) {
      // Keep the current viewing direction instead of swinging back.
      this.yaw = Math.atan2(this.pos.x - this.target.root.position.x, this.pos.z - this.target.root.position.z);
    }
    setTimeout(() => { this.speed = 6; }, 900);
  }

  _computeGoal(dt) {
    if ((this.mode === 'talk' || this.mode === 'shot') && this.talkShot) {
      this.goalPos.copy(this.talkShot.pos);
      this.goalLook.copy(this.talkShot.look);
      return;
    }
    const t = this.target ? this.target.root.position : new THREE.Vector3();
    if (this.mode === 'room') {
      const ctr = this.cfg.center || { x: 0, z: 0 };
      const f = this.cfg.follow ?? 0.7;
      this.goalLook.set(ctr.x + (t.x - ctr.x) * f, 0.85, ctr.z + (t.z - ctr.z) * f);
    } else {
      this.goalLook.set(t.x, t.y + 1.05, t.z);
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    let dist = this.dist;
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    if (this.mode === 'follow' && this.collision) {
      // Pull in when a building is between the player and the camera.
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const d = (i / steps) * this.dist;
        const px = this.goalLook.x + off.x * d, py = this.goalLook.y + off.y * d, pz = this.goalLook.z + off.z * d;
        if (this.collision.cameraBlocked(px, py, pz)) { dist = Math.max(2.0, d - 0.6); break; }
      }
    }
    this.goalPos.copy(this.goalLook).addScaledVector(off, dist);
  }

  update(dt) {
    this.time += dt;
    this._computeGoal(dt);
    const f = damp(this.speed, dt);
    this.pos.lerp(this.goalPos, f);
    this.look.lerp(this.goalLook, f);
    this._apply();
  }

  snap() { this._computeGoal(0); this.pos.copy(this.goalPos); this.look.copy(this.goalLook); this._apply(); }

  _apply() {
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
