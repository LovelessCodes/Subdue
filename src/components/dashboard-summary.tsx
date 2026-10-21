import { useEffect, useState } from 'react'
import { useTranslations } from 'use-intl'
import { CategoryBreakdown } from '@/components/category-breakdown'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDate, formatMinor } from '@/lib/money'
import type { BudgetStatus } from '@/server/services/budget'
import type { DashboardSummary as Summary } from '@/server/services/dashboard'

type Props = {
  summary: Summary
  budget: BudgetStatus
}

function periodLabel(period: BudgetStatus['period'], locale: string): string {
  const start = new Date(period.start)
  const end = new Date(period.end)

  if (!period.anchored) {
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(start)
  }

  const short = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return `${short.format(start)} – ${short.format(end)}`
}

function changeMonth(since: string, locale: string): string {
  const [year, month] = since.split('-').map(Number)
  if (!year || !month) return since
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function Cell({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-medium tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {note}
      </p>
    </div>
  )
}

export function DashboardSummary({ summary, budget }: Props) {
  const t = useTranslations('dashboard')
  const [drawn, setDrawn] = useState(false)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  function toggleCategory(key: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const budgetMoney = (minor: number) =>
    formatMinor(minor, budget.currency, budget.locale)
  const summaryMoney = (minor: number, currency = summary.currency) =>
    formatMinor(minor, currency, summary.locale)

  const next = summary.upcoming[0]
  const budgetMinor = budget.budgetMinor
  const visibleDue =
    hidden.size === 0
      ? budget.dueMinor
      : budget.byCategory
          .filter((category) => !hidden.has(category.id ?? 'uncategorized'))
          .reduce((sum, category) => sum + category.amountMinor, 0)
  const visibleOver = budgetMinor !== null && visibleDue > budgetMinor
  const percent =
    budgetMinor !== null && budgetMinor > 0
      ? Math.min(100, Math.round((visibleDue / budgetMinor) * 100))
      : 0
  const change = summary.change
    ? t('changeSince', {
        amount: `${summary.change.amountMinor >= 0 ? '+' : ''}${summaryMoney(
          summary.change.amountMinor,
        )}`,
        month: changeMonth(summary.change.since, summary.locale),
      })
    : t('firstMonth')
  const monthlyRates =
    summary.unconvertibleCurrencies.length > 0
      ? ` · ${t('noRates', {
          currencies: summary.unconvertibleCurrencies.join(', '),
        })}`
      : ''

  const arrivingValue =
    budget.incomeMinor === null ? '—' : budgetMoney(budget.incomeMinor)
  const arrivingNote =
    budget.incomeMinor === null
      ? t('noIncomeSources')
      : budget.incomeMinor > 0
        ? budget.ceilingMinor !== null
          ? t('cappedAt', {
              amount: budgetMoney(budget.ceilingMinor),
            })
          : t('arrivingThisPeriod')
        : budget.nextIncome
          ? budget.nextIncome.amountMinor > 0
            ? t('nextPay', {
                date: formatDate(
                  new Date(budget.nextIncome.date),
                  budget.locale,
                ),
                amount: formatMinor(
                  budget.nextIncome.amountMinor,
                  budget.nextIncome.currency,
                  budget.locale,
                ),
              })
            : t('nextPayDate', {
                date: formatDate(
                  new Date(budget.nextIncome.date),
                  budget.locale,
                ),
              })
          : t('noneThisPeriod')

  const leftValue =
    budgetMinor === null ? '—' : budgetMoney(budgetMinor - visibleDue)
  const leftNote =
    budgetMinor === null
      ? t('noBudgetSet')
      : visibleOver
        ? t('overBy', {
            amount: budgetMoney(visibleDue - budgetMinor),
          })
        : t('percentLeft', { percent: 100 - percent })

  return (
    <>
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {periodLabel(budget.period, budget.locale)}
            </p>
            {budgetMinor === null ? (
              <Badge variant="outline">{t('noBudget')}</Badge>
            ) : visibleOver ? (
              <Badge variant="destructive" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-destructive" />
                {t('overBudget')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-primary" />
                {t('onTrack')}
              </Badge>
            )}
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[11px] text-muted-foreground">
              {t('upcomingCount', { count: summary.upcoming.length })} ·{' '}
              {t('subscriptionCount', { count: summary.subscriptionCount })} ·{' '}
              {t('monthlyEquivalent', {
                amount: summaryMoney(summary.monthlyTotalMinor),
              })}
              {monthlyRates}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{change}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-5 border-t px-5 py-5 lg:grid-cols-4 lg:divide-x lg:divide-border">
          <Cell
            label={t('dueThisPeriod')}
            value={budgetMoney(visibleDue)}
            note={
              budgetMinor !== null
                ? t('ofBudgetAmount', { amount: budgetMoney(budgetMinor) })
                : t('noBudgetSet')
            }
          />
          <Cell
            label={t('arriving')}
            value={arrivingValue}
            note={arrivingNote}
          />
          <Cell label={t('left')} value={leftValue} note={leftNote} />
          <Cell
            label={t('nextCharge')}
            value={
              next ? summaryMoney(next.viewerShareMinor, next.currency) : '—'
            }
            note={
              next
                ? `${next.name} · ${formatDate(next.nextDue, summary.locale)}`
                : t('nothingDueWindow')
            }
          />
        </div>

        {budgetMinor !== null ? (
          <div className="px-5 pb-5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {visibleOver ? t('overBudget') : t('percentUsed', { percent })}
              </span>
              <span>
                {visibleOver
                  ? t('overBy', {
                      amount: budgetMoney(visibleDue - budgetMinor),
                    })
                  : t('percentLeft', { percent: 100 - percent })}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className={`h-full origin-left rounded-full transition-transform duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
                  visibleOver ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ transform: `scaleX(${drawn ? percent / 100 : 0})` }}
              />
            </div>
            {budget.unconvertibleCurrencies.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t('noRates', {
                  currencies: budget.unconvertibleCurrencies.join(', '),
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="border-t px-5 py-4">
            <p className="text-[11px] text-muted-foreground">
              {t('noBudgetHint')}
            </p>
          </div>
        )}
      </Card>

      {budget.byCategory.length > 0 ? (
        <CategoryBreakdown
          categories={budget.byCategory}
          hidden={hidden}
          onToggle={toggleCategory}
          onReset={() => setHidden(new Set())}
          visibleDueMinor={visibleDue}
          budgetMinor={budgetMinor}
          currency={budget.currency}
          locale={budget.locale}
        />
      ) : null}
    </>
  )
}
