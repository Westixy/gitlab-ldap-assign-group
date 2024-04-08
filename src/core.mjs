import { parse } from 'yaml'
import fs from "node:fs"
import { Entity, Assignment, Membership } from "./entities.mjs"
import { memoized } from "./tools.mjs"
import { debug, fatal, info } from "./log.mjs"
import { config } from "./config.mjs"
import { toName } from './gitlab-static.mjs'

export class Core {
  constructor() {
    this.definition = parse(fs.readFileSync(config.rules_path).toString())
  }

  getEntity(name) {
    if (!this.definition.entities[name]) fatal(5, `Entity "${name}" do not exist in entites list`)
    return memoized(this, "entities", name, _ => new Entity(name, this.definition.entities[name]))
  }

  getAssignment(name) {
    if (!this.definition.assignments[name]) fatal(5, `Assignment "${name}" do not exist in assigments list`)
    return memoized(this, "assigments", name, _ => new Assignment(this, this.definition.assignments[name]))
  }

  getMembership(name) {
    if (!this.definition.memberships[name]) fatal(5, `Membership "${name}" do not exist in memberships list`)
    return memoized(this, "memberships", name, _ => new Membership(this, this.definition.memberships[name]))
  }

  async play() {

    // Compute all changes (one by one, but could be executed concurrently)
    const changes = { assignments: {}, memberships: {} }
    for (const assignmentName in this.definition.assignments) {
      const assignment = await this.getAssignment(assignmentName)
      changes.assignments[assignmentName] = { controller: assignment, actions: await assignment.computeExpectedChanges() }
    }
    for (const membershipName in this.definition.memberships) {
      const membership = await this.getMembership(membershipName)
      changes.memberships[membershipName] = { controller: membership, actions: await membership.computeExpectedChanges() }
    }
    debug("Planned changes", changes)

    //Pretty print changes (probably need to be improved)
    for (const kind in changes) {
      info(`Planned ${kind} changes:`)
      for (const name in changes[kind]) {
        const change = changes[kind][name]
        info(`  For ${name} (${change.controller.definition.path})`)
        for (const toAdd of change.actions.toBeAdded) {
          info(`    + ${toAdd.username ?? toAdd.path} with access level ${toName(toAdd.level)}`)
        }
        for (const toUpdate of change.actions.toBeUpdated) {
          info(`    ~ ${toUpdate.username ?? toUpdate.path} with access level ${toName(toUpdate.fromLevel)} => ${toName(toUpdate.level)}`)
        }
        for (const toDelete of change.actions.toBeDeleted) {
          info(`    - ${toDelete.username ?? toDelete.path} (${toName(toDelete.level)})`)
        }
      }
    }


    info()
    if(config.dry_run !== "false") {
      info("Dry run => not applying changes...")
    } else {
      info("Applying changes...")
    }
    // apply changes
    for (const kind in changes) {
      for (const name in changes[kind]) {
        const change = changes[kind][name]
        await change.controller.applyChanges()
      }
    }
  }
}