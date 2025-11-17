import { atomWithStorage } from 'jotai/utils'

export interface GitHubSelection {
  owner: string
  repo: string
  branch?: string
}

export const githubSelectionAtom = atomWithStorage<GitHubSelection | null>('github-selection', null)

