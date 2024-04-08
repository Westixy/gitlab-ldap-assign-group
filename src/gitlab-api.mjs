import { toName as toGitlabAccessName } from "./gitlab-static.mjs"
import { config } from './config.mjs'
import { debug, error, fatal } from "./log.mjs"
import { ldapSearch } from "./ldap_provider.mjs"
import { memoized, once } from "./tools.mjs"

/**
 * 
 * @param {string} endpoint the name of the gitlab resource api 
 * @param {object} opts fetch options
 * @returns 
 */
export function fetchGitlab(endpoint, opts = {}) {
  const url = `${config.gitlab_host}/api/v4${endpoint}`
  debug(`Request gitlab ${url}`, opts)
  if (config.dry_run !== "false" && ["POST", "DELETE", "PATCH", "PUT"].includes(opts?.method)) {
    debug(`Dry run: request not sent`)
    return Promise.resolve({})
  }
  return fetch(url, {
    headers: {
      "PRIVATE-TOKEN": config.giltab_token,
      "Content-Type": "application/json"
    },
    ...opts
  })
    .catch(e => fatal(`Unable to get data from gitlab for api ${endpoint} \n`, e))
    .then(r => r.json().catch(async e => fatal(8, `reply was not a json:`, e, `\n`, await r.text())))
    .then(r => {
      debug(r)
      if (r?.error) error(`Gitlab error on request ${endpoint} /`, opts, r)
      return r
    })
}

export class GitlabUser {
  constructor(username, name, id, uid, provider, email) {
    this.username = username
    this.name = name
    this.id = id
    this.uid = uid
    this.provider = provider
    this.email = email
  }

  async isMemberOfLdapGroup(dn) {
    return memoized(this, "isMemberOfLdapGroup", dn, async () => (await ldapSearch(
      this.uid,
      { filter: `(memberOf:1.2.840.113556.1.4.1941:=${dn})` }
    )).length !== 0)
  }
}

GitlabUser.fromRawGitlabAPI = function (rawGitlabUser) {
  return new GitlabUser(
    rawGitlabUser.username,
    rawGitlabUser.name,
    rawGitlabUser.id,
    rawGitlabUser.identities?.[0]?.extern_uid ?? rawGitlabUser.id,
    rawGitlabUser.identities?.[0]?.provider === "ldapmain" ? "ldap" : "gitlab",
    rawGitlabUser.email
  )

}

export class GitlabUsers {
  constructor() { }

  /**
   * list of all gitlab users
   */
  get all() {
    return once(this, "all", async () => (await fetchGitlab("/users")).map(GitlabUser.fromRawGitlabAPI))
  }

  /**
   * Gitlab users from ldap
   */
  get ldapLinked() {
    return once(this, "ldapLinked", async () => (await this.all).filter(user => user.provider === "ldap"))
  }

  async find(username) {
    return (await this.all).find(u => u.username === username)
  }
}

export const gitlabUsers = new GitlabUsers()


export class GitlabGroupProject {
  constructor(id, name, fullName, path, description) {
    this.id = id
    this.name = name
    this.fullName = fullName
    this.path = path
    this.description = description
  }

  _getRawMembers(update = false) {
    return once(this, "rawMembers", async _ => fetchGitlab(`/${this.kind}s/${this.id}/members`)
      .then(members => members.map(user => ({
        username: user.username,
        id: user.id,
        level: user.access_level,
        level_name: toGitlabAccessName(user.access_level),
      }))), update)
  }
  async getMembers(update) {
    const members = await this._getRawMembers(update)
    for (let member of members) {
      member.user = await gitlabUsers.find(member.username)
    }
    return members
  }

  getSharedGroups(update = false) {
    return once(this, "sharedGroups", async _ => fetchGitlab(`/${this.kind}s/${this.id}/`)
      .then(groupDetails => groupDetails.shared_with_groups), update)
  }

  /**
   * mutate current group to add shared group
   */
  addSharedGroup(expectedAddChange) {
    return fetchGitlab(`/${this.kind}s/${this.id}/share`, {
      method: 'POST',
      body: JSON.stringify({
        group_id: expectedAddChange.id,
        group_access: expectedAddChange.level
      })
    })
  }

  /**
   * mutate current group to deltte shared group
   */
  deleteSharedGroup(expectedDelChange) {
    return fetchGitlab(`/${this.kind}s/${this.id}/share/${expectedDelChange.id}`, {
      method: 'DELETE',
    })
  }

  /**
   * mutate current group to update shared group
   */
  async updateSharedGroup(expectedUpdateChange) {
    await this.deleteSharedGroup(expectedUpdateChange)
    await this.addSharedGroup(expectedUpdateChange)
  }

  /**
   * mutate current group to add a member
   */
  addMember(expectedAddChange) {
    return fetchGitlab(`/${this.kind}s/${this.id}/members`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: expectedAddChange.id,
        access_level: expectedAddChange.level
      })
    })
  }

  /**
   * mutate current group to update a member
   */
  updateMember(expectedUpdateChange) {
    return fetchGitlab(`/${this.kind}s/${this.id}/members/${expectedUpdateChange.id}?access_level=${expectedUpdateChange.level}`, {
      method: 'PUT',
    })
  }

  /**
   * mutate current group to deltte shared group
   */
  deleteMember(expectedDelChange) {
    return fetchGitlab(`/${this.kind}s/${this.id}/members/${expectedDelChange.id}`, {
      method: 'DELETE',
    })
  }

}
export class GitlabGroup extends GitlabGroupProject {
  constructor(...base) {
    super(...base)
    this.kind = "group"
  }
}
export class GitlabProject extends GitlabGroupProject {
  constructor(...base) {
    super(...base)
    this.kind = "project"
  }
}

GitlabGroup.fromRawGitlabAPI = function (rawGitlabGroup) {
  return new GitlabGroup(
    rawGitlabGroup.id,
    rawGitlabGroup.name,
    rawGitlabGroup.full_name,
    rawGitlabGroup.full_path,
    rawGitlabGroup.description,
  )
}
GitlabProject.fromRawGitlabAPI = function (rawGitlabProject) {
  return new GitlabProject(
    rawGitlabProject.id,
    rawGitlabProject.name,
    rawGitlabProject.name_with_namespace,
    rawGitlabProject.path_with_namespace,
    rawGitlabProject.description,
  )
}
export class GitlabGroups {
  constructor() { }

  get all() {
    return once(this, "all", async _ => await fetchGitlab(`/groups`))
  }

  async fromPath(path) {
    return GitlabGroup.fromRawGitlabAPI((await this.all).find(group => group.full_path === path) || fatal(6, `Unable to get group on gitlab with path "${path}"`))
  }
}

export const gitlabGroups = new GitlabGroups()

export class GitlabProjects {
  constructor() { }

  get all() {
    return once(this, "all", async _ => await fetchGitlab("/projects"))
  }

  async fromPath(path) {
    return GitlabProject.fromRawGitlabAPI((await this.all).find(project => project.path_with_namespace === path) || fatal(6, `Unable to get project on gitlab with path "${path}"`))
  }
}

export const gitlabProjects = new GitlabProjects()
