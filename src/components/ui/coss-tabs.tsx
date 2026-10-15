'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import * as React from 'react'
import {
  type SegmentedControlSize,
  segmentedControlItemLayoutClassName,
  segmentedControlItemSizeClassNames,
} from '@/lib/segmented-control'
import { cn } from 'cn'

/**
 * `square` is the Base UI folder-tab strip (horizontal only): a rule under
 * the tabs, the active tab wearing its own outline.
 */
type TabsVariant = 'default' | 'underline' | 'square'
type TabsSize = SegmentedControlSize

const TabsListContext: React.Context<TabsSize> =
  React.createContext<TabsSize>('default')

export function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={cn(
        'flex flex-col gap-2 data-[orientation=vertical]:flex-row',
        className,
      )}
      data-slot="tabs"
      {...props}
    />
  )
}

export function TabsList({
  variant = 'default',
  size = 'default',
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  size?: TabsSize
  variant?: TabsVariant
}): React.ReactElement {
  return (
    <TabsPrimitive.List
      className={cn(
        'relative z-0 flex w-fit items-center justify-center gap-x-0.5 text-muted-foreground',
        'data-[orientation=vertical]:flex-col',
        variant === 'default'
          ? 'rounded-lg bg-muted p-0.5 text-muted-foreground/72'
          : variant === 'square'
            ? 'shadow-[inset_0_-1px_0_0_color-mix(in_oklab,var(--foreground)_20%,transparent)] *:data-[slot=tabs-tab]:rounded-none *:data-[slot=tabs-tab]:hover:text-foreground'
            : 'data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1 *:data-[slot=tabs-tab]:hover:bg-accent',
        className,
      )}
      data-size={size}
      data-slot="tabs-list"
      {...props}
    >
      <TabsListContext.Provider value={size}>
        {children}
      </TabsListContext.Provider>
      <TabsPrimitive.Indicator
        className={cn(
          'absolute left-0 w-(--active-tab-width) translate-x-(--active-tab-left) transition-[width,translate] duration-200 ease-in-out',
          variant === 'underline'
            ? 'z-10 bottom-0 h-(--active-tab-height) -translate-y-(--active-tab-bottom) bg-primary data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:-translate-x-px data-[orientation=horizontal]:translate-y-px'
            : variant === 'square'
              ? '-z-1 top-0 h-full border-x border-t border-foreground/20 bg-background'
              : '-z-1 bottom-0 h-(--active-tab-height) -translate-y-(--active-tab-bottom) rounded-md bg-background shadow-sm/5 dark:bg-input',
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  )
}

export function TabsTab({
  className,
  size,
  ...props
}: TabsPrimitive.Tab.Props & {
  size?: TabsSize
}): React.ReactElement {
  const contextSize: TabsSize = React.useContext(TabsListContext)
  const resolvedSize: TabsSize = size ?? contextSize

  return (
    <TabsPrimitive.Tab
      className={cn(
        'relative flex shrink-0 grow cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent font-medium text-base outline-none transition-[color,background-color,box-shadow] hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-active:text-foreground data-disabled:opacity-64 sm:text-sm',
        segmentedControlItemLayoutClassName,
        segmentedControlItemSizeClassNames[resolvedSize],
        className,
      )}
      data-size={resolvedSize}
      data-slot="tabs-tab"
      {...props}
    />
  )
}

/**
 * Stack wrapper for animated panels: puts every panel in one grid cell so the
 * leaving panel cross-fades in place, and clips the direction slides. The
 * `-mx-1`/`px-1` pair pushes the clip edge off the content edge so focus rings
 * sitting on it stay uncut.
 */
export function TabsPanels({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      className={cn('-mx-1 grid flex-1 overflow-x-clip px-1', className)}
      data-slot="tabs-panels"
      {...props}
    />
  )
}

export function TabsPanel({
  className,
  ...props
}: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={cn(
        // One grid cell for every panel (see TabsPanels): entering and leaving
        // panels overlap so they can cross-fade in place.
        'col-start-1 row-start-1 flex-1 outline-none',
        // Base UI animated-panels pattern: the fade runs short, the slide runs
        // longer on a strong ease-out, and it trails in the tab's direction.
        '[transition:opacity_175ms_ease,translate_350ms_cubic-bezier(0.22,1,0.36,1)] data-starting-style:opacity-0 data-ending-style:opacity-0',
        'motion-safe:data-starting-style:data-[activation-direction=left]:-translate-x-8 motion-safe:data-starting-style:data-[activation-direction=right]:translate-x-8 motion-safe:data-ending-style:data-[activation-direction=left]:translate-x-8 motion-safe:data-ending-style:data-[activation-direction=right]:-translate-x-8',
        className,
      )}
      data-slot="tabs-content"
      {...props}
    />
  )
}

export {
  TabsPrimitive,
  TabsTab as TabsTrigger,
  TabsPanel as TabsContent,
  type TabsSize,
  type TabsVariant,
}
