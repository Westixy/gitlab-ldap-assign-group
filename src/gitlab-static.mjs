// https://docs.gitlab.com/ee/api/members.html#roles
export const GITLAB_ACCESS_LEVEL = {
  NO_ACCESS: 0,
  MINIMAL_ACCESS: 5,
  GUEST: 10,
  REPORTER: 20,
  DEVELOPER: 30,
  MAINTAINER: 40,
  OWNER: 50
}

export function isAccessLevel(accessLevelNum, accessLevelName) {
  return GITLAB_ACCESS_LEVEL[accessLevelName.toUpperCase()] === accessLevelNum
}

export function toName(accessLevelNum) {
  return Object.entries(GITLAB_ACCESS_LEVEL).find(([_, id]) => id === accessLevelNum)?.[0]
}

export function fromName(accessLevelName) {
  return Object.entries(GITLAB_ACCESS_LEVEL).find(([name, _]) => name === accessLevelName)?.[1]
}