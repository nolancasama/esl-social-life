// Dev-only fault injection for recovery tests (window.__esl.fault(name)).
// A named point throws once when armed. Production builds never arm a point:
// `import.meta.env.DEV` is false there, so faultPoint() is a no-op.

let armed = null;
const DEV = (() => { try { return !!import.meta.env?.DEV; } catch { return false; } })();

/** Arm one fault point (dev builds only). Returns whether it was armed. */
export function armFault(name, { force = false } = {}) {
  if (!DEV && !force) return false;
  armed = typeof name === 'string' && name ? name : null;
  return armed !== null;
}

export function armedFault() { return armed; }

/** Throw once at this point if it is armed. */
export function faultPoint(name) {
  if (armed && armed === name) {
    armed = null;
    throw new Error(`[fault] injected at ${name}`);
  }
}
