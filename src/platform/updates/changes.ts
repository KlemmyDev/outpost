export interface CompareCommit {
  sha: string
  parents: { sha: string }[]
  commit: { message: string }
}

const VERSION_BUMP = /^Version \d/

/**
 * Counts the changes between two commits the way people think of them: one per
 * merged pull request or direct commit on main, not one per commit inside a
 * PR. It walks first parents back from `head` through the commits GitHub's
 * compare API returned, and skips the automatic "Version …" bump commits.
 */
export function countChanges(commits: readonly CompareCommit[], head: string): number {
  const bySha = new Map(commits.map((c) => [c.sha, c]))
  let count = 0
  let cursor = bySha.get(head)
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor.sha)) {
    seen.add(cursor.sha)
    if (!VERSION_BUMP.test(cursor.commit.message)) count++
    const parent = cursor.parents[0]?.sha
    cursor = parent ? bySha.get(parent) : undefined
  }
  return count
}
