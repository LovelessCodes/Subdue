import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import {
  formatDayShort,
  formatMoney,
  formatSignedMoney,
  formatWeekRange,
  formatWeekday,
  largestDue,
  type CalendarVariantProps,
} from '@/lib/calendar-view'

export function CalendarAgenda({
  calendar,
  model,
  onPrev,
  onNext,
  onToday,
  canPrev,
  canNext,
}: CalendarVariantProps) {
  const largest = largestDue(model)
  const peakDay = model.days.reduce((peak, day) =>
    day.dueMinor > peak.dueMinor ? day : peak,
  )
  const maxDue = Math.max(1, ...model.days.map((day) => day.dueMinor))

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            The month, in order
          </p>
          <h1 className="mt-1 text-[2.4rem] leading-none font-semibold tracking-[-0.045em] capitalize">
            {model.monthLabel}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {model.dueCount} {model.dueCount === 1 ? 'charge' : 'charges'}
            {' · '}
            {formatMoney(
              calendar.totalMinor,
              calendar.currency,
              calendar.locale,
            )}{' '}
            due
            {calendar.arrivingMinor > 0 ? (
              <>
                {' · '}
                {formatMoney(
                  calendar.arrivingMinor,
                  calendar.currency,
                  calendar.locale,
                )}{' '}
                arriving
              </>
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-10">
        <div className="min-w-0">
          {model.weeks
            .filter((week) => week.eventDays.length > 0)
            .map((week) => (
              <section
                key={week.start.toISOString()}
                className="border-t border-border/70 py-5 first:border-t-0 first:pt-0"
              >
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <p className="text-[9.5px] font-medium tracking-[0.15em] text-muted-foreground uppercase">
                    {formatWeekRange(week.start, week.end, calendar.locale)}
                  </p>
                  <div className="flex items-baseline gap-3 text-[10.5px] tabular-nums">
                    {week.dueMinor > 0 ? (
                      <span className="text-muted-foreground">
                        {formatMoney(
                          week.dueMinor,
                          calendar.currency,
                          calendar.locale,
                        )}
                      </span>
                    ) : null}
                    {week.incomeMinor > 0 ? (
                      <span className="font-medium text-primary">
                        +
                        {formatMoney(
                          week.incomeMinor,
                          calendar.currency,
                          calendar.locale,
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {week.eventDays.map((day) => (
                    <div
                      key={day.iso}
                      className="group grid grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-lg px-1 py-2 transition-colors duration-150 ease-out hover:bg-muted/40 sm:grid-cols-[62px_minmax(0,1fr)] sm:gap-4 sm:px-2"
                    >
                      <div className="flex flex-col items-start pl-1">
                        <span className="text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                          {formatWeekday(day.date, calendar.locale)}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 text-[1.6rem] leading-none font-medium tracking-[-0.03em] tabular-nums',
                            day.isToday ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          {day.day}
                        </span>
                      </div>

                      <div className="relative min-w-0 border-l border-border/70 pl-4">
                        <span
                          className={cn(
                            'absolute top-[7px] -left-[3px] size-1.5 rounded-full',
                            day.income.length > 0
                              ? 'bg-primary'
                              : 'bg-muted-foreground/45',
                          )}
                        />
                        {day.due.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-baseline justify-between gap-4 border-b border-border/35 py-1.5 last:border-b-0"
                          >
                            <span className="truncate text-[13px] text-foreground/85">
                              {item.name}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {formatMoney(
                                item.amountMinor,
                                item.currency,
                                calendar.locale,
                              )}
                            </span>
                          </div>
                        ))}
                        {day.income.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-baseline justify-between gap-4 rounded-md bg-primary/[0.07] px-2 py-1.5 text-primary"
                          >
                            <span className="truncate text-[13px] font-medium">
                              {item.name}
                            </span>
                            <span className="shrink-0 text-[11px] font-medium tabular-nums">
                              +
                              {formatMoney(
                                item.amountMinor,
                                item.currency,
                                calendar.locale,
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-6">
          <section className="rounded-2xl border bg-card p-4">
            <p className="text-[9.5px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Month at a glance
            </p>
            <dl className="mt-3 space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-muted-foreground">Due</dt>
                <dd className="text-sm font-medium tabular-nums">
                  {formatMoney(
                    calendar.totalMinor,
                    calendar.currency,
                    calendar.locale,
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-muted-foreground">Arriving</dt>
                <dd className="text-sm font-medium text-primary tabular-nums">
                  +
                  {formatMoney(
                    calendar.arrivingMinor,
                    calendar.currency,
                    calendar.locale,
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-2.5">
                <dt className="text-xs text-muted-foreground">Net</dt>
                <dd
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    model.netMinor >= 0 ? 'text-primary' : 'text-destructive',
                  )}
                >
                  {formatSignedMoney(
                    model.netMinor,
                    calendar.currency,
                    calendar.locale,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[9.5px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Daily charges
              </p>
              <span className="text-[9.5px] text-muted-foreground">
                1–{model.daysInMonth}
              </span>
            </div>
            <div className="mt-3 flex h-12 items-end gap-[2px]">
              {model.days.map((day) => (
                <div
                  key={day.iso}
                  className={cn(
                    'min-h-[2px] flex-1 rounded-[1px]',
                    day.dueMinor > 0
                      ? 'bg-foreground/25'
                      : 'bg-foreground/[0.07]',
                  )}
                  style={{
                    height:
                      day.dueMinor > 0
                        ? `${Math.max(8, (day.dueMinor / maxDue) * 100)}%`
                        : '2px',
                  }}
                  title={`${formatDayShort(day.date, calendar.locale)} · ${formatMoney(day.dueMinor, calendar.currency, calendar.locale)}`}
                />
              ))}
            </div>
            {peakDay.dueMinor > 0 ? (
              <p className="mt-2 text-[10.5px] text-muted-foreground">
                Peak on {formatDayShort(peakDay.date, calendar.locale)} ·{' '}
                <span className="text-foreground/75">
                  {formatMoney(
                    peakDay.dueMinor,
                    calendar.currency,
                    calendar.locale,
                  )}
                </span>
              </p>
            ) : null}
          </section>

          {largest ? (
            <section className="rounded-2xl border bg-card p-4">
              <p className="text-[9.5px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Largest charge
              </p>
              <p className="mt-2 text-sm font-medium">{largest.item.name}</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="text-[10.5px] text-muted-foreground">
                  {formatDayShort(largest.day.date, calendar.locale)}
                </p>
                <p className="text-sm font-medium tabular-nums">
                  {formatMoney(
                    largest.item.amountMinor,
                    largest.item.currency,
                    calendar.locale,
                  )}
                </p>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
