import { describe, expect, it } from 'vitest'
import { FIRST_AID_GUIDES, searchTopics, TOPIC_GROUPS, TOPICS, topic } from '#/features/first-aid/topics'
import { guide } from '#/features/library/guides/catalog'

describe('first aid topics', () => {
  it('are complete and link to guides that exist', () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length)
    for (const t of TOPICS) {
      expect(TOPIC_GROUPS).toContain(t.group)
      expect(t.steps.length).toBeGreaterThanOrEqual(3)
      if (t.guide) expect(guide(t.guide), `${t.id} links to ${t.guide}`).toBeDefined()
      // A topic that doesn't always need 000 says when it does.
      if (!t.always000) expect(t.callWhen.length, t.id).toBeGreaterThan(0)
    }
    for (const g of FIRST_AID_GUIDES) expect(guide(g), g).toBeDefined()
  })

  it('keep the Australian specifics', () => {
    expect(topic('burns')!.steps.join(' ')).toMatch(/20 minutes/)
    expect(topic('asthma')!.steps.join(' ')).toMatch(/4 separate puffs/)
    expect(topic('snake-bite')!.dont.join(' ')).toMatch(/Don’t wash the bite/)
    expect(topic('marine-sting')!.dont.join(' ')).toMatch(/vinegar on bluebottle/)
    expect(topic('cpr')!.steps.join(' ')).toMatch(/30 compressions, then 2 breaths/)
  })

  it('are found by what people call things', () => {
    expect(searchTopics('snake')[0]!.id).toBe('snake-bite')
    expect(searchTopics('epipen')[0]!.id).toBe('anaphylaxis')
    expect(searchTopics('funnel web')[0]!.id).toBe('spider-bite')
    expect(searchTopics('bluebottle')[0]!.id).toBe('marine-sting')
    expect(searchTopics('hypo').map((t) => t.id)).toContain('diabetes')
    expect(searchTopics('xyzzy')).toEqual([])
  })
})
