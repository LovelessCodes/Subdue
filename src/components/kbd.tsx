import type { ReactNode } from 'react'
import { cn } from 'cn'

export function Kbd({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 items-center rounded border border-border bg-background px-1 font-sans text-[10px] leading-none text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
