import { useTranslations } from 'use-intl'
import { formatMinor } from '@/lib/money'

/**
 * The same figures the dashboard shows, sized for the rail. Structural typing
 * on purpose: this renders whatever `getBudgetStatus` returns.
 */
type Budget = {
  dueMinor: number
  budgetMinor: number | null
  remainingMinor: number | null
  overBudget: boolean
  currency: string
  locale: string
  period: { start: string | Date }
}

export function BudgetSummary({ budget }: { budget: Budget }) {
  const t = useTranslations('budget')
  const money = (minor: number) =>
    formatMinor(minor, budget.currency, budget.locale)
  const month = new Intl.DateTimeFormat(budget.locale, {
    month: 'long',
  }).format(new Date(budget.period.start))
  const percent =
    budget.budgetMinor === null
      ? 0
      : Math.min(100, Math.round((budget.dueMinor / budget.budgetMinor) * 100))

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-2.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {month}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium">
        {t('due', { amount: money(budget.dueMinor) })}
      </p>
      {budget.budgetMinor === null ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('noBudget')}
        </p>
      ) : (
        <>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${
                budget.overBudget ? 'bg-destructive' : 'bg-primary'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
            {budget.overBudget
              ? t('overBy', { amount: money(-(budget.remainingMinor ?? 0)) })
              : t('left', { amount: money(budget.remainingMinor ?? 0) })}
          </p>
        </>
      )}
    </div>
  )
}
