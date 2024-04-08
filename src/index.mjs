import { ldapClient } from "./ldap_provider.mjs"
import { debug } from "./log.mjs"
import { Core } from "./core.mjs"


const core = new Core()
await core.play()

// needed to cleanly finish the connection
debug("END")
ldapClient.destroy()