/** Shared between the server and the First aid pages. No Node imports. */

export interface FirstAidData {
  /** Guide ids saved in the Library's Australian guides. */
  saved: string[]
  /** Guide ids being saved right now. */
  saving: string[]
  /** How many of the first aid guides there are. */
  total: number
  /** WikiMed's content id, when it's installed. */
  wikimed: string | null
}

export interface FirstAidStatus {
  guidesSaved: number
  guidesTotal: number
  wikimed: boolean
}
