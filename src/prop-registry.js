/**
 * PropRegistry — named, mutable state containers that scenes reference.
 *
 * Props are organized by type (e.g. 'camera', 'rotation').
 * Scenes reference props by name (string) or provide inline objects.
 * Two scenes sharing the same named prop skip transitions for that prop type.
 *
 * Content scenes get direct mutable access to props.
 * Transition scenes get read-only views or slaved clones.
 */
export class PropRegistry {
  /**
   * @param {object} propDefs — { type: { name: value, ... }, ... }
   */
  constructor(propDefs = {}) {
    this._defs = new Map() // type → Map(name → value)
    for (const [type, entries] of Object.entries(propDefs)) {
      this._defs.set(type, new Map(Object.entries(entries)))
    }
  }

  /** Resolve a scene field: string → prop lookup, object → pass through */
  resolve(type, ref) {
    if (typeof ref === 'string') {
      return this._defs.get(type)?.get(ref) ?? null
    }
    return ref // inline object
  }

  /** Check if two scene fields reference the same named prop */
  isSameProp(refA, refB) {
    return typeof refA === 'string' && typeof refB === 'string' && refA === refB
  }

  /** Get the live mutable state object for a named prop */
  getState(type, name) {
    return this._defs.get(type)?.get(name) ?? null
  }

  /**
   * Create a read-only Proxy that reads live state but throws on write.
   * Used by transition scenes to observe props without mutating them.
   */
  createReadOnlyView(type, name) {
    const live = this.getState(type, name)
    if (!live) return null
    return new Proxy(live, {
      get(target, prop) { return target[prop] },
      set(target, prop) {
        throw new Error(`PropRegistry: cannot write '${prop}' on read-only prop '${name}' (type '${type}')`)
      },
    })
  }

  /**
   * Create a slaved clone — a writable copy where selected keys auto-sync
   * from the live original each frame.
   *
   * @param {string} type — prop type
   * @param {string} name — prop name
   * @param {string[]} slavedKeys — keys that auto-track the original
   * @returns {{ data: object, sync: () => void }} clone with sync function
   */
  createSlavedCopy(type, name, slavedKeys = []) {
    const original = this.getState(type, name)
    if (!original) return null
    const copy = { ...original }
    return {
      data: copy,
      sync() {
        for (const key of slavedKeys) {
          copy[key] = original[key]
        }
      },
    }
  }
}
