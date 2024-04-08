import {config} from './config.mjs'

export const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
}

export let log_level = config.log_level

export function _log(kind, ...text) {
  if (LOG_LEVEL[kind] < log_level) return;
  console.error(`[${kind}]`, ...text)
}


export function debug(...text) {
  _log("DEBUG", ...text)
}

export function info(...text) {
  _log("INFO", ...text)
}

export function warn(...text) {
  _log("WARN", ...text)
}

export function error(...text) {
  _log("ERROR", ...text)
}

export function fatal(code = 2, ...text) {
  _log("FATAL", ...text)
  process.exit(code)
}