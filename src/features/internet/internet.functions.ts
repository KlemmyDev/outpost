import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { checkInternet } from './internet.server'

/** "Check again" in the Internet panel: runs the checks now, skipping the cache. */
export const recheckInternet = createServerFn({ method: 'POST' }).handler(async () => {
  if (!getPlatform().features.isEnabled('internet')) throw new Error('The Internet feature is switched off.')
  return checkInternet(true)
})
