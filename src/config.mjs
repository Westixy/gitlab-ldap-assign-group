
/**
 * @param {string} varName 
 * @param {string} defaultValue 
 * @returns string
 */
function env(varName, defaultValue) {
  return process.env[varName.toLowerCase()] || process.env[varName.toUpperCase()] || defaultValue
}


/**
 * 
 * @param {string} varName 
 * @param {string} errorMessage 
 * @returns string
 */
function requiredEnv(varName, errorMessage = "") {
  let envVar = process.env[varName.toLowerCase()] || process.env[varName.toUpperCase()]
  if (envVar) return envVar
  console.error(`[ERROR] Env variable ${varName} is required, but seems like it is not provided\n${errorMessage}`)
  process.exit(1)
}


export const config = {
  gitlab_host: env("GITLAB_HOST", "https://gitlab.com"),
  giltab_token: requiredEnv("GITLAB_TOKEN"),
  log_level: env("LOG_LEVEL", "1"),
  ldap_url: requiredEnv("LDAP_URL"),
  ldap_bind_dn: requiredEnv("LDAP_BIND_DN"),
  ldap_bind_pass: requiredEnv("LDAP_BIND_PASS"),
  rules_path: env("rules_path", "./rules.yml"),
  dry_run: env("dry_run", "true"),
}