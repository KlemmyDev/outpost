import type { OverviewWidget } from './widget'
import { widget as internet } from '#/features/internet/overview'
import { widget as library } from '#/features/library/overview'
import { widget as firstAid } from '#/features/first-aid/overview'
import { widget as map } from '#/features/map/overview'
import { widget as messages } from '#/features/messages/overview'
import { widget as power } from '#/features/power/overview'
import { widget as emergency } from '#/features/emergency/overview'

/** Overview cards by feature id. A feature without one isn't shown on the Overview. */
export const WIDGETS: Readonly<Record<string, OverviewWidget>> = {
  internet,
  library,
  'first-aid': firstAid,
  map,
  messages,
  power,
  emergency,
}
