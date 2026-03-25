/**
 * Registry — maps string names to Three.js objects, property setters,
 * legend builders, and per-frame tickers.
 */
export class Registry {
  constructor() {
    this._objects = new Map()       // name → Object3D | Vector3
    this._properties = new Map()    // 'obj.prop' → setter fn
    this._legends = new Map()       // name → builder fn
    this._tickers = new Map()       // objName → [fn, ...]
  }

  // --- Objects ---

  register(name, obj) {
    this._objects.set(name, obj)
  }

  resolve(name) {
    if (typeof name !== 'string') return name // passthrough Vector3, Object3D
    const obj = this._objects.get(name)
    if (!obj) throw new Error(`Registry: '${name}' not registered`)
    return obj
  }

  tryResolve(name) {
    if (typeof name !== 'string') return name
    return this._objects.get(name) ?? null
  }

  has(name) {
    return this._objects.has(name)
  }

  // --- Properties ---

  registerProperty(objName, propName, setter) {
    this._properties.set(`${objName}.${propName}`, setter)
  }

  resolveProperty(objName, propName) {
    return this._properties.get(`${objName}.${propName}`) ?? null
  }

  // --- Legends ---

  registerLegend(name, builderFn) {
    this._legends.set(name, builderFn)
  }

  resolveLegend(name) {
    return this._legends.get(name) ?? null
  }

  // --- Tickers ---

  registerTicker(objName, fn) {
    if (!this._tickers.has(objName)) this._tickers.set(objName, [])
    this._tickers.get(objName).push(fn)
  }

  /** Returns [{ name, obj, fns }] for all tickers whose object is visible */
  getVisibleTickers() {
    const result = []
    for (const [name, fns] of this._tickers) {
      const obj = this._objects.get(name)
      if (obj && obj.visible !== false) {
        result.push({ name, obj, fns })
      }
    }
    return result
  }
}
