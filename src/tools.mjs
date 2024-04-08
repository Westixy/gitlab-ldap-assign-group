
/**
 * Simple wrapper to help run a function once
 * 
 * @param {object} handler object that will has the memoized variable
 * @param {string} varName name of the saved variable
 * @param {Function} valueCallback what to run to obtain the value
 * @param {boolean} forceUpdate force updates the value inside handler
 * @returns Promise<any>
 */
export function once(handler, varName, valueCall, forceUpdate = false) {
  const vname = `_oncemem_${varName}`
  if (handler[vname] === undefined || forceUpdate === true) {
    handler[vname] = valueCall()
  }
  return handler[vname]
}

export function memoized(handler, varName, key, valueCall) {
  const vname = `_memoized_${varName}`
  if (handler[vname]?.[key] === undefined) {
    if (handler[vname] === undefined) handler[vname] = {}
    handler[vname][key] = valueCall()
  }
  return handler[vname][key]
}

export async function asyncFilter(arr, predicate) {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
}