import { cn } from 'cn'

// The app mark: #18181b tile, #f8f8f8 ring, #f97316 dot — mirrors public/icons.
export function FristMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#18181b]',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-[70%]">
        <circle
          cx="15"
          cy="14"
          r="7.5"
          fill="none"
          stroke="#f8f8f8"
          strokeWidth="4"
        />
        <circle cx="21" cy="20" r="3.6" fill="#f97316" />
      </svg>
    </span>
  )
}
