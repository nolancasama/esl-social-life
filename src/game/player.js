// Player controller: smooth acceleration, camera-relative movement,
// collision sliding, and walk-to-target (tap to move / tap to talk).

import { Character } from '../engine/character.js';
import { damp, angleDelta } from '../core/util.js';
import { sfx } from '../core/audio.js';

const WALK = 3.6;
const ACCEL = 9;

export class Player {
  constructor(game, look) {
    this.game = game;
    this.char = new Character(look, { id: 'player', blobSize: 0.8 });
    this.vx = 0;
    this.vz = 0;
    this.radius = 0.32;
    this.target = null;      // { x, z, onArrive }
    this.collider = { x: 0, z: 0, r: 0.3, owner: this };
    this.stepTimer = 0;
  }

  setLook(look) {
    const parent = this.char.root.parent;
    const pos = this.char.root.position.clone();
    const yaw = this.char.yaw;
    if (parent) parent.remove(this.char.root);
    this.char.dispose();
    this.char = new Character(look, { id: 'player', blobSize: 0.8 });
    this.char.setPosition(pos.x, pos.z);
    this.char.setYaw(yaw);
    if (parent) parent.add(this.char.root);
  }

  place(x, z, yaw = 0) {
    this.char.setPosition(x, z);
    this.char.setYaw(yaw);
    this.vx = this.vz = 0;
    this.target = null;
    this.collider.x = x; this.collider.z = z;
  }

  stop() { this.vx = this.vz = 0; this.target = null; this.char.speed = 0; this.char.setBase('idle'); }

  walkTo(x, z, onArrive = null, stopDist = 0.25) { this.target = { x, z, onArrive, stopDist, t: 0, lastD: Infinity, stuck: 0 }; }

  get x() { return this.char.root.position.x; }
  get z() { return this.char.root.position.z; }

  update(dt, axis, canMove) {
    const scene = this.game.scene;
    const cam = this.game.camera;
    let dx = 0, dz = 0, forward = 0;
    if (canMove) {
      if (axis.x || axis.y) {
        this.target = null;
        const b = cam.basis();
        dx = b.fx * axis.y + b.rx * axis.x;
        dz = b.fz * axis.y + b.rz * axis.x;
        forward = axis.y;
      } else if (this.target) {
        const tx = this.target.x - this.x, tz = this.target.z - this.z;
        const d = Math.hypot(tx, tz);
        this.target.t += dt;
        if (d < this.target.lastD - 0.02) { this.target.lastD = d; this.target.stuck = 0; } else this.target.stuck += dt;
        if (d <= this.target.stopDist || this.target.stuck > 0.9 || this.target.t > 12) {
          const t = this.target;
          this.target = null;
          t.onArrive?.(d <= t.stopDist + 0.05 || d < 1.6);
        } else {
          const s = Math.min(1, d / 0.8);
          dx = (tx / d) * s; dz = (tz / d) * s;
          forward = 0.6;
        }
      }
    }
    const want = Math.hypot(dx, dz);
    const tvx = dx * WALK, tvz = dz * WALK;
    const k = damp(want > 0.01 ? ACCEL : ACCEL * 1.4, dt);
    this.vx += (tvx - this.vx) * k;
    this.vz += (tvz - this.vz) * k;
    const speed = Math.hypot(this.vx, this.vz);
    if (speed > 0.02 && scene) {
      const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
      const r = scene.collision.resolve(nx, nz, this.radius, this);
      // Only keep velocity along the free direction (wall sliding).
      const movedX = r.x - this.x, movedZ = r.z - this.z;
      this.char.root.position.x = r.x;
      this.char.root.position.z = r.z;
      if (dt > 0) { this.vx = movedX / dt * 0.98; this.vz = movedZ / dt * 0.98; }
      const heading = Math.atan2(this.vx, this.vz);
      if (want > 0.05) this.char.turnTo(heading, 12);
      cam.autoFollow(this.char.yaw, forward, speed, dt);
      this.stepTimer -= dt * speed;
      if (this.stepTimer <= 0) { this.stepTimer = 1.25; if (this.game.settings.sfx) sfx.step(); }
    }
    this.char.speed = speed;
    this.char.setBase(speed > 0.15 ? 'walk' : 'idle');
    this.collider.x = this.x;
    this.collider.z = this.z;
    this.char.update(dt);
  }
}
