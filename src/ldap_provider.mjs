import ldapjs from "ldapjs"
import { debug, error, fatal } from "./log.mjs";
import { config } from "./config.mjs";

export const ldapClient = ldapjs.createClient({
  url: [config.ldap_url],
  timeout: 1000,
  //log: {info:console.log,debug:console.log,warn:console.log,error:console.log,trace:console.log,setlevel:()=>{}},
  tlsOptions: {
    rejectUnauthorized: false,
    //enableTrace: true
  },
});


ldapClient.on('error ', x => error('ldap error ', x))
ldapClient.on('connectRefused ', x => error('ldap connectRefused ', x))
ldapClient.on('connectTimeout ', x => error('ldap connectTimeout ', x))
ldapClient.on('connectError ', x => error('ldap connectError ', x))
ldapClient.on('setupError ', x => error('ldap setupError ', x))
ldapClient.on('socketTimeout ', x => error('ldap socketTimeout ', x))
ldapClient.on('resultError ', x => error('ldap resultError ', x))
ldapClient.on('timeout ', x => error('ldap timeout ', x))
ldapClient.on('destroy ', x => debug('ldap destroy ', x))
ldapClient.on('end ', x => debug('ldap end ', x))
ldapClient.on('close ', x => debug('ldap close ', x))
ldapClient.on('connect ', x => debug('ldap connect ', x))
ldapClient.on('idle ', x => debug('ldap idle ', x))

ldapClient.bind(config.ldap_bind_dn, config.ldap_bind_pass, err => {
  if (err) {
    fatal(3, "Ldap bind error\n", err)
  }
})

export function ldapSearch(selector, opts = {}, normalize = true) {
  const selectorNormalized = normalize ? selector.normalize("NFD").replace(/\p{Diacritic}/gu, "") : selector
  return new Promise((res, rej) => {
    debug(`Ldap search for: "${selector}"`, Object.entries(opts).length ? `/ Options: ${JSON.stringify(opts)}` : "")
    ldapClient.search(selectorNormalized, opts, (err, result) => {
      if (err) {
        error("Ldap search failed\n", err)
        rej(err)
      }

      const data = []
      result.on('error', (err2) => {
        error("Ldap search result error\n", err2)
        debug("selector normalized:", selectorNormalized)
        rej(err2, data)
      })
      result.on('searchEntry', entry => data.push(entry.pojo))
      result.on('end', endResult => {
        if (endResult.status !== 0) {
          error("Ldap search failed", endResult)
          return rej(endResult.status)
        }
        else {
          debug("Ldap search success", data)
          res(data)
        }
      })
    })
  })
}