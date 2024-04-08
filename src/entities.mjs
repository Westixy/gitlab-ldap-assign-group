import { gitlabProjects, gitlabGroups, gitlabUsers } from "./gitlab-api.mjs"
import { fromName } from "./gitlab-static.mjs"
import { debug, fatal } from "./log.mjs"
import { asyncFilter, once } from "./tools.mjs"


export class Entity {
  constructor(name, definition) {
    this.name = name
    this.definition = definition
  }
  get users() {
    if (!this[`_caller_${this.definition.provider}_${this.definition.kind}`]) fatal(4, `Unable to obtain Entity users from this definition:`, this.definition)
    return once(this, "users", _ => this[`_caller_${this.definition.provider}_${this.definition.kind}`]())
  }

  async _caller_ldap_group() {
    return asyncFilter(await gitlabUsers.ldapLinked, async user => {
      const isFromLdapGroup = await user.isMemberOfLdapGroup(this.definition.selector)
      debug(`User "${user.username}" is from group ${this.definition.selector}: ${isFromLdapGroup}`)
      return isFromLdapGroup
    })
  }

  async _caller_gitlab_user() {
    return [(await gitlabUsers.all).find(user => user.username.toLowerCase() === this.definition.selector.toLowerCase())]
  }
}

export class Assignment {
  constructor(core, definition) {
    this.core = core
    this.definition = definition
  }

  get group() {
    return once(this, "group", _ => gitlabGroups.fromPath(this.definition.path))
  }

  get entities() {
    return once(this, "entities", async _ => {
      let res = []
      for (const [level, names] of Object.entries(this.definition.entities)) {
        for (const name of names) {
          let entity = await this.core.getEntity(name)
          entity.level_name = level
          entity.level = fromName(level)
          res.push(entity)
        }
      }
      return res
    })
  }

  /**
   * Collapsed entities users of the current assigment 
   */
  get expectedMembers() {
    return once(this, "expectedMembers", async _ => {
      let res = []
      for (const entity of (await this.entities)) {
        const users = await entity.users
        debug(`users for entity ${entity.name}`, users)
        users.map(user => {
          if (user.level === undefined || user.level < entity.level) {
            user.level = entity.level
            user.level_name = entity.level_name
          }
          return user
        })
        // filter out already inserted users
        res = res.concat(users.filter(user => res.find(user2 => user.username === user2.username) === undefined))
      }
      res = res.map(user => ({ username: user.username, id: user.id, level: user.level }))
      return res
    })
  }
  /**
   * simplified members list of current gitlabGroup
   */
  get currentMembers() {
    return this.group
      .then(group => group.getMembers())
      .then(async members => members.map(member => ({ username: member.username, id: member.id, level: member.level })))
  }

  async computeExpectedChanges() {
    const currentMembers = await this.currentMembers
    const expectedMembers = await this.expectedMembers
    const toBeAdded = expectedMembers.filter(member => currentMembers.find(member2 => member.username === member2.username) === undefined)
    const toBeUpdated = expectedMembers.filter(member => {
      let toUpdateMember = currentMembers.find(member2 => member.username === member2.username && member.level !== member2.level)
      if (toUpdateMember !== undefined) {
        member.fromLevel = toUpdateMember.level
      }
      return toUpdateMember !== undefined
    })
    const toBeDeleted = currentMembers.filter(member => expectedMembers.find(member2 => member.username === member2.username) === undefined)
    return { toBeAdded, toBeUpdated, toBeDeleted }
  }

  async applyChanges() {
    const changes = await this.computeExpectedChanges()
    const group = await this.group
    for(const change of changes.toBeAdded) {
      debug("Applying assignment member", change)
      await group.addMember(change)
    }
    for(const change of changes.toBeUpdated) {
      debug("Updating assignment member", change)
      await group.updateMember(change)
    }
    for(const change of changes.toBeDeleted) {
      debug("Deleting assignment member", change)
      await group.deleteMember(change)
    }
  }
}

export class Membership {
  constructor(core, definition) {
    this.core = core
    this.definition = definition
  }

  get group() {
    return {
      group: () => once(this, "group", _ => gitlabGroups.fromPath(this.definition.path)),
      project: () => once(this, "group", _ => gitlabProjects.fromPath(this.definition.path))
    }[this.definition.kind]()
  }

  get assignments() {
    return once(this, "assignments", async _ => {
      let res = []
      for (const [level, names] of Object.entries(this.definition.assignments)) {
        for (const name of names) {
          let assignment = await this.core.getAssignment(name)
          assignment.level_name = level
          assignment.level = fromName(level)
          res.push(assignment)
        }
      }
      return res
    })
  }

  /**
   * simplified SharedGroupList list of current gitlabGroup / gitlabProject
   */
    get currentSharedGroups() {
      return this.group
        .then(group => group.getSharedGroups())
        .then(async sharedGroups => sharedGroups.map(sharedGroup => ({ path: sharedGroup.group_full_path, id: sharedGroup.group_id, level: sharedGroup.group_access_level })))
    }

  /**
   * Collapsed assigment SharedGroupList of the current gitlabGroup / gitlabProject 
   */
  get expectedSharedGroups() {
    return once(this, "expectedSharedGroups", async _ => {
      let res = []
      for (const assignment of (await this.assignments)) {
        const group = await assignment.group
        group.level = assignment.level
        res.push(group)
      }
      res = res.map(group => ({ path: group.path, id: group.id, level: group.level }))
      return res
    })
  }

  async computeExpectedChanges() {
    const currentSharedGroups = await this.currentSharedGroups
    const expectedSharedGroups = await this.expectedSharedGroups
    const toBeAdded = expectedSharedGroups.filter(group => currentSharedGroups.find(group2 => group.id === group2.id) === undefined)
    const toBeUpdated = expectedSharedGroups.filter(group => {
      let toUpdateGroup = currentSharedGroups.find(group2 => group.id === group2.id && group.level !== group2.level)
      if (toUpdateGroup !== undefined) {
        group.fromLevel = toUpdateGroup.level
      }
      return toUpdateGroup !== undefined
    })
    const toBeDeleted = currentSharedGroups.filter(group => expectedSharedGroups.find(group2 => group.id === group2.id) === undefined)
    return { toBeAdded, toBeUpdated, toBeDeleted }
  }

  async applyChanges() {
    const changes = await this.computeExpectedChanges()
    const group = await this.group
    for(const change of changes.toBeAdded) {
      debug("Applying membership", change)
      await group.addSharedGroup(change)
    }
    for(const change of changes.toBeUpdated) {
      debug("Updating membership", change)
      await group.updateSharedGroup(change)
    }
    for(const change of changes.toBeDeleted) {
      debug("Deleting membership", change)
      await group.deleteSharedGroup(change)
    }
  }
}