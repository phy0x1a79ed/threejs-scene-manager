/**
 * PropRegistry — named, reusable configurations that scenes reference.
 *
 * Props are organized by type (e.g. 'camera', 'controls').
 * Scenes reference props by name (string) or provide inline objects.
 * Two scenes sharing the same named prop skip transitions for that prop type.
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
}
