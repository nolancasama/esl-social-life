// Tiny event bus used to decouple systems (relationships → UI toasts, etc.).

export class Emitter {
  constructor() { this.handlers = new Map(); }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) { this.handlers.get(event)?.delete(fn); }

  emit(event, payload) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[bus] ${event} handler failed`, err); }
    }
  }
}

export const bus = new Emitter();
