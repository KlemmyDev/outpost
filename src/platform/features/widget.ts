import type { ComponentType } from 'react'
import type { WidgetData } from '#/platform/overview.types'
import type { FeatureState } from './types'

export interface WidgetProps {
  feature: FeatureState
  data: WidgetData
  onOpen: () => void
}

export interface DetailProps {
  feature: FeatureState
  data: WidgetData
}

/**
 * A feature's presence on the Overview: a summary card, and optionally the
 * details that slide in when it's tapped. Lives in src/features/<id>/overview.tsx.
 */
export interface OverviewWidget {
  Card: ComponentType<WidgetProps>
  Detail?: ComponentType<DetailProps>
}
