import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import {
  formatDayShort,
  formatMoney,
  weekdayLabels,
  type CalendarVariantProps,
} from '@/lib/calendar-view'

export function CalendarWall({
  calendar,
  model,
  onPrev,
  onNext,
  onToday,
  canPrev,
  canNext,
}: CalendarVariantProps) {
  const [selectedIso, setSelectedIso] = useState<string | null>(
    model.eventDays[0]?.iso ?? null,
  )
  const selected =
    model.grid.find((day) => day.iso === selectedIso) ??
    model.days.find((day) => day.iso === selectedIso) ??
    null
  const labels = weekdayLabels(calendar.weekStart, calendar.locale)

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Calendar
          </p>
          <h1 className="mt-1 text-[2rem] font-semibold tracking-[-0.035em] capitalize">
            {model.monthLabel}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {model.dueCount} {model.dueCount === 1 ? 'charge' : 'charges'}
            {' · '}
            <span className="text-foreground">
              {formatMoney(
                calendar.totalMinor,
                calendar.currency,
                calendar.locale,
              )}
            </span>{' '}
            due
            {calendar.arrivingMinor > 0 ? (
              <>
                {' · '}
                <span className="text-primary">
                  {formatMoney(
                    calendar.arrivingMinor,
                    calendar.currency,
                    calendar.locale,
                  )}
                </span>{' '}
                arriving
              </>
            ) : null}
            {calendar.unconvertibleCurrencies.length > 0 ? (
              <span className="text-muted-foreground/70">
                {' · '}no rates for{' '}
                {calendar.unconvertibleCurrencies.join(', ')}
              </span>
            ) : null}
          </p>
        </div>

        <nav className="flex items-center gap-1" aria-label="Calendar month">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={onPrev}
            disabled={!canPrev}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            disabled={model.isCurrentMonth}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={onNext}
            disabled={!canNext}
          >
            <ChevronRight />
          </Button>
        </nav>
      </header>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-7 border-b bg-muted/25">
              {labels.map((label) => (
                <div
                  key={label}
                  className="px-2.5 py-2 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {model.grid.map((day) => {
                const isSelected = selectedIso === day.iso
                const charges = day.due.length + day.income.length

                return (
                  <button
                    key={day.iso}
                    type="button"
                    onClick={() => setSelectedIso(day.iso)}
                    aria-label={`${formatDayShort(day.date, calendar.locale)}, ${charges} ${charges === 1 ? 'entry' : 'entries'}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'relative flex min-h-[104px] flex-col border-r border-b p-2 text-left transition-colors duration-100 ease-out outline-none last:border-r-0 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0',
                      !day.inMonth && 'bg-muted/20 text-muted-foreground/60',
                      day.isToday && 'bg-primary/[0.035]',
                      isSelected &&
                        'bg-primary/[0.065] ring-1 ring-primary/40 ring-inset',
                      'hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                          day.isToday
                            ? 'bg-primary font-semibold text-primary-foreground'
                            : 'text-muted-foreground',
                          !day.inMonth && 'opacity-60',
                        )}
                      >
                        {day.day}
                      </span>
                      {day.due.length > 0 ? (
                        <span className="text-[9px] tabular-nums text-muted-foreground/70">
                          {day.due.length}×
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 flex min-h-0 flex-col gap-[3px]">
                      {day.due.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-baseline justify-between gap-1.5 text-[10.5px] leading-[1.35]"
                        >
                          <span className="truncate text-foreground/75">
                            {item.name}
                          </span>
                          <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground/80">
                            {formatMoney(
                              item.amountMinor,
                              item.currency,
                              calendar.locale,
                            )}
                          </span>
                        </div>
                      ))}
                      {day.due.length > 3 ? (
                        <span className="text-[9.5px] text-muted-foreground">
                          +{day.due.length - 3} more
                        </span>
                      ) : null}
                      {day.income.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-baseline justify-between gap-1.5 text-[10.5px] leading-[1.35] text-primary"
                        >
                          <span className="truncate font-medium">
                            {item.name}
                          </span>
                          <span className="shrink-0 text-[9.5px] tabular-nums">
                            +
                            {formatMoney(
                              item.amountMinor,
                              item.currency,
                              calendar.locale,
                            )}
                          </span>
                        </div>
                      ))}
                      {charges === 0 ? (
                        <span className="text-[9.5px] text-muted-foreground/45">
                          —
                        </span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex min-h-[76px] flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-3">
          {selected ? (
            <>
              <div className="min-w-[132px]">
                <p className="text-[9px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Selected day
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  {formatDayShort(selected.date, calendar.locale)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {selected.due.length + selected.income.length}
                  {}
                  {selected.due.length + selected.income.length === 1
                    ? 'entry'
                    : 'entries'}
                  {selected.dueMinor > 0
                    ? ` · ${formatMoney(selected.dueMinor, calendar.currency, calendar.locale)} due`
                    : ''}
                </p>
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {selected.due.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex max-w-full items-baseline gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px]"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatMoney(
                        item.amountMinor,
                        item.currency,
                        calendar.locale,
                      )}
                    </span>
                  </span>
                ))}
                {selected.income.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex max-w-full items-baseline gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary"
                  >
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      +
                      {formatMoney(
                        item.amountMinor,
                        item.currency,
                        calendar.locale,
                      )}
                    </span>
                  </span>
                ))}
                {selected.due.length === 0 && selected.income.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Nothing scheduled.
                  </span>
                ) : null}
              </div>

              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear selected day"
                onClick={() => setSelectedIso(null)}
                className="text-muted-foreground"
              >
                <X />
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select a day for the full breakdown.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-foreground/30" />
              Charge
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" />
              Income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary/25 ring-1 ring-primary/40" />
              Today
            </span>
          </div>
          <span>
            {model.incomeCount}{' '}
            {model.incomeCount === 1 ? 'arrival' : 'arrivals'}
          </span>
        </div>
      </section>
    </div>
  )
}
