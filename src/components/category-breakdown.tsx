import { useMemo, useState } from 'react'
import { useTranslations } from 'use-intl'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { defineChart } from '@tanstack/charts'
import { pie, polar, radialArc } from '@tanstack/charts/polar'
import { Chart } from '@tanstack/charts/react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatMinor } from '@/lib/money'
import type { CategorySpend } from '@/server/services/budget'

const UNCATEGORIZED_KEY = 'uncategorized'

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'color-mix(in oklch, var(--chart-1) 55%, var(--muted))',
  'color-mix(in oklch, var(--chart-2) 55%, var(--muted))',
  'color-mix(in oklch, var(--chart-3) 55%, var(--muted))',
  'color-mix(in oklch, var(--chart-4) 55%, var(--muted))',
  'color-mix(in oklch, var(--chart-5) 55%, var(--muted))',
]

function categoryKey(category: CategorySpend): string {
  return category.id ?? UNCATEGORIZED_KEY
}

type Props = {
  categories: CategorySpend[]
  hidden: ReadonlySet<string>
  onToggle: (key: string) => void
  onReset: () => void
  visibleDueMinor: number
  budgetMinor: number | null
  currency: string
  locale: string
}

export function CategoryBreakdown({
  categories,
  hidden,
  onToggle,
  onReset,
  visibleDueMinor,
  budgetMinor,
  currency,
  locale,
}: Props) {
  const t = useTranslations('dashboard')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const money = (amountMinor: number) =>
    formatMinor(amountMinor, currency, locale)

  const colorByKey = useMemo(
    () =>
      new Map(
        categories.map((category, index) => [
          categoryKey(category),
          category.color ?? PALETTE[index % PALETTE.length],
        ]),
      ),
    [categories],
  )

  const keys = useMemo(() => categories.map(categoryKey), [categories])

  const visibleRows = useMemo(
    () =>
      categories
        .filter((category) => !hidden.has(categoryKey(category)))
        .map((category) => ({
          ...category,
          key: categoryKey(category),
        })),
    [categories, hidden],
  )

  const definition = useMemo(() => {
    if (visibleRows.length === 0) return null

    const slices = pie(visibleRows, { value: 'amountMinor' })

    return defineChart({
      marks: [
        polar({
          inset: 6,
          radiusRatio: 0.9,
          marks: [
            radialArc(slices, {
              innerRadius: ({ radius }) => radius * 0.62,
              cornerRadius: 3,
              color: 'key',
              key: 'key',
            }),
          ],
          scales: { angle: null, radius: null },
        }),
      ],
      scales: { x: null, y: null },
      color: {
        domain: keys,
        range: keys.map((key) => colorByKey.get(key) ?? PALETTE[0]),
      },
    })
  }, [colorByKey, keys, visibleRows])

  const percent =
    budgetMinor !== null && budgetMinor > 0
      ? Math.min(100, Math.round((visibleDueMinor / budgetMinor) * 100))
      : null
  const excluded = categories.filter((category) =>
    hidden.has(categoryKey(category)),
  ).length
  const expandedCategory = expandedKey
    ? categories.find((category) => categoryKey(category) === expandedKey)
    : undefined

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('byCategory')}</CardTitle>
            <CardDescription>{t('byCategoryHint')}</CardDescription>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {percent !== null ? (
              <div className="text-right">
                <p className="text-lg font-medium tabular-nums">{percent}%</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('ofBudget')}
                </p>
              </div>
            ) : null}
            {excluded > 0 ? (
              <Button variant="ghost" size="xs" onClick={onReset}>
                <RotateCcw />
                {t('reset')}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
          <div className="relative mx-auto size-[180px] sm:mx-0">
            {definition ? (
              <Chart
                ariaLabel={t('categoryChartLabel')}
                definition={definition}
                height={180}
                initialWidth={180}
              />
            ) : (
              <div className="size-full rounded-full border border-dashed border-border" />
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium leading-tight tabular-nums">
                {money(visibleDueMinor)}
              </p>
              <p className="mt-0.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                {excluded > 0 ? t('shown') : t('thisPeriod')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {categories.map((category) => {
              const key = categoryKey(category)
              const isHidden = hidden.has(key)
              const isExpanded = expandedKey === key

              return (
                <div
                  key={key}
                  className={`flex items-center gap-1 ${
                    isHidden ? 'opacity-45' : ''
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={!isHidden}
                    onClick={() => onToggle(key)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 ease-out hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span
                      className={`size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10 ${
                        isHidden ? 'opacity-30' : ''
                      }`}
                      style={{ backgroundColor: colorByKey.get(key) }}
                    />
                    <span
                      className={`truncate ${
                        isHidden ? 'text-muted-foreground' : ''
                      }`}
                    >
                      {category.name}
                    </span>
                    <span
                      className={`ml-auto shrink-0 text-xs tabular-nums ${
                        isHidden ? 'text-muted-foreground line-through' : ''
                      }`}
                    >
                      {money(category.amountMinor)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={`category-${key}`}
                    aria-label={t(
                      isExpanded ? 'hideSubscriptions' : 'showSubscriptions',
                      { name: category.name },
                    )}
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <ChevronRight
                      className={`size-3.5 transition-transform duration-150 ease-out ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {expandedCategory ? (
          <div id={`category-${expandedKey}`} className="mt-5 border-t pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
                  style={{
                    backgroundColor: colorByKey.get(expandedKey ?? ''),
                  }}
                />
                <p className="truncate text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  {expandedCategory.name}
                </p>
              </div>
              <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {money(expandedCategory.amountMinor)}
              </p>
            </div>
            <ul className="mt-2 flex flex-col divide-y">
              {expandedCategory.subscriptions.map((subscription) => (
                <li
                  key={subscription.id}
                  className="flex items-baseline justify-between gap-4 py-1.5 text-sm"
                >
                  <span className="truncate">{subscription.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {money(subscription.amountMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
