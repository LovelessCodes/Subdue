import { useEffect, useId, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  archiveMyIncomeSource,
  createMyIncomeSource,
  deleteMyIncomeSource,
  listMyIncomeSources,
  restoreMyIncomeSource,
  updateMyIncomeSource,
} from '@/lib/app.functions'
import {
  formatDate,
  formatMinor,
  fromMajorUnits,
  toMajorUnits,
} from '@/lib/money'
import type { CycleUnit } from '@/server/services/recurrence'
import type { IncomeSource } from '@/server/services/income-sources'

type IncomeSourceRow = IncomeSource & { nextPayday: Date }

/** The cadences the picker offers; anything else edits as a custom cycle. */
const CADENCES = [
  { value: '1w', labelKey: 'cadenceWeekly', cycleCount: 1, cycleUnit: 'weeks' },
  {
    value: '2w',
    labelKey: 'cadenceFortnightly',
    cycleCount: 2,
    cycleUnit: 'weeks',
  },
  {
    value: '4w',
    labelKey: 'cadenceFourWeekly',
    cycleCount: 4,
    cycleUnit: 'weeks',
  },
  {
    value: '1m',
    labelKey: 'cadenceMonthly',
    cycleCount: 1,
    cycleUnit: 'months',
  },
  {
    value: '3m',
    labelKey: 'cadenceQuarterly',
    cycleCount: 3,
    cycleUnit: 'months',
  },
  { value: '1y', labelKey: 'cadenceYearly', cycleCount: 1, cycleUnit: 'years' },
] as const

const CUSTOM = 'custom'
const UNITS: CycleUnit[] = ['days', 'weeks', 'months', 'years']

const UNIT_LABEL_KEYS = {
  days: 'unitDays',
  weeks: 'unitWeeks',
  months: 'unitMonths',
  years: 'unitYears',
} as const

const EVERY_KEYS = {
  days: 'everyDays',
  weeks: 'everyWeeks',
  months: 'everyMonths',
  years: 'everyYears',
} as const

type DraftError =
  | 'errName'
  | 'errCurrency'
  | 'errAmount'
  | 'errNext'
  | 'errStart'
  | 'errStartAfterNext'
  | 'errCycle'
  | 'errUnit'

type Draft = {
  name: string
  amount: string
  currency: string
  cadence: string
  count: string
  unit: string
  startDate: string
  nextArrival: string
}

type ParsedDraft = {
  name: string
  amountMinor: number
  currency: string
  cycleUnit: string
  cycleCount: number
  startDate: string
  nextArrival: string
}

function isoDay(value: Date | string | null | undefined): string {
  if (!value) {
    return ''
  }
  return new Date(value).toISOString().slice(0, 10)
}

function emptyDraft(currency: string): Draft {
  return {
    name: '',
    amount: '',
    currency,
    cadence: '1m',
    count: '1',
    unit: 'months',
    startDate: isoDay(new Date()),
    nextArrival: isoDay(new Date()),
  }
}

function draftFrom(source: IncomeSource): Draft {
  const preset = CADENCES.find(
    (cadence) =>
      cadence.cycleCount === source.cycleCount &&
      cadence.cycleUnit === source.cycleUnit,
  )

  return {
    name: source.name,
    amount: String(toMajorUnits(source.amountMinor, source.currency)),
    currency: source.currency,
    cadence: preset?.value ?? CUSTOM,
    count: String(source.cycleCount),
    unit: source.cycleUnit,
    startDate: isoDay(source.startDate ?? source.nextArrival),
    nextArrival: isoDay(source.nextArrival),
  }
}

function draftCycle(draft: Draft): { count: number; unit: string } {
  const preset = CADENCES.find((cadence) => cadence.value === draft.cadence)
  if (preset) {
    return { count: preset.cycleCount, unit: preset.cycleUnit }
  }
  return { count: Number(draft.count), unit: draft.unit }
}

function parseDraft(
  draft: Draft,
  fallbackCurrency: string,
): { input: ParsedDraft } | { error: DraftError } {
  const name = draft.name.trim()
  if (!name) {
    return { error: 'errName' }
  }

  const currency = draft.currency.trim().toUpperCase() || fallbackCurrency
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: 'errCurrency' }
  }

  const amount = Number(draft.amount.replace(',', '.'))
  if (draft.amount.trim() === '' || !Number.isFinite(amount) || amount < 0) {
    return { error: 'errAmount' }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.nextArrival)) {
    return { error: 'errNext' }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) {
    return { error: 'errStart' }
  }

  if (draft.startDate > draft.nextArrival) {
    return { error: 'errStartAfterNext' }
  }

  const cycle = draftCycle(draft)
  if (!Number.isInteger(cycle.count) || cycle.count < 1 || cycle.count > 365) {
    return { error: 'errCycle' }
  }
  if (!UNITS.includes(cycle.unit as CycleUnit)) {
    return { error: 'errUnit' }
  }

  return {
    input: {
      name,
      amountMinor: fromMajorUnits(amount, currency),
      currency,
      cycleUnit: cycle.unit,
      cycleCount: cycle.count,
      startDate: `${draft.startDate}T00:00:00.000Z`,
      nextArrival: `${draft.nextArrival}T00:00:00.000Z`,
    },
  }
}

function message(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback
}

/**
 * Salaries and side gigs, each on its own schedule. The calendar shows every
 * arrival and the budget period sums them, so this list is what the
 * dashboard's headroom is built from.
 */
export function IncomeSourcesCard({
  currency,
  locale,
}: {
  currency: string
  locale: string
}) {
  const router = useRouter()
  const t = useTranslations('incomeSources')
  const [rows, setRows] = useState<IncomeSourceRow[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(
    null,
  )
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [draft, setDraft] = useState(() => emptyDraft(currency))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let live = true
    listMyIncomeSources({ data: { includeArchived: true } })
      .then((items) => {
        if (live) setRows(items)
      })
      .catch((caught) => {
        if (live) setError(message(caught, t('errGeneric')))
      })
    return () => {
      live = false
    }
  }, [t])

  const active = (rows ?? []).filter((row) => !row.archivedAt)
  const archived = (rows ?? []).filter((row) => row.archivedAt)

  async function reload() {
    setRows(await listMyIncomeSources({ data: { includeArchived: true } }))
  }

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await action()
      await reload()
      await router.invalidate()
    } catch (caught) {
      setError(message(caught, t('errGeneric')))
    } finally {
      setPending(false)
    }
  }

  async function add() {
    const parsed = parseDraft(draft, currency)
    if ('error' in parsed) {
      setError(t(parsed.error))
      return
    }
    await run(async () => {
      await createMyIncomeSource({ data: parsed.input })
      setDraft(emptyDraft(currency))
    })
  }

  async function saveEdit() {
    if (!editing) return
    const parsed = parseDraft(editing.draft, currency)
    if ('error' in parsed) {
      setError(t(parsed.error))
      return
    }
    setEditing(null)
    await run(() =>
      updateMyIncomeSource({ data: { id: editing.id, ...parsed.input } }),
    )
  }

  function cadenceLabel(source: {
    cycleCount: number
    cycleUnit: string
  }): string {
    const preset = CADENCES.find(
      (cadence) =>
        cadence.cycleCount === source.cycleCount &&
        cadence.cycleUnit === source.cycleUnit,
    )
    if (preset) {
      return t(preset.labelKey)
    }
    const unit = source.cycleUnit as CycleUnit
    if (UNITS.includes(unit)) {
      return t(EVERY_KEYS[unit], { count: source.cycleCount })
    }
    return `${source.cycleCount} ${source.cycleUnit}`
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{t('title')}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        {archived.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived
              ? t('hideArchived')
              : t('showArchived', { count: archived.length })}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-md border">
          {active.map((source) =>
            editing?.id === source.id ? (
              <li key={source.id} className="px-3 py-3">
                <SourceForm
                  draft={editing.draft}
                  currency={currency}
                  pending={pending}
                  submitLabel={t('save')}
                  framed={false}
                  onChange={(next) =>
                    setEditing({ id: source.id, draft: next })
                  }
                  onSubmit={() => void saveEdit()}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {source.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('rowMeta', {
                      cadence: cadenceLabel(source),
                      start: formatDate(
                        new Date(source.startDate ?? source.nextArrival),
                        locale,
                      ),
                      next: formatDate(new Date(source.nextPayday), locale),
                    })}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {formatMinor(source.amountMinor, source.currency, locale)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setError(null)
                      setEditing({ id: source.id, draft: draftFrom(source) })
                    }}
                  >
                    {t('edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run(() =>
                        archiveMyIncomeSource({ data: { id: source.id } }),
                      )
                    }
                  >
                    {t('archive')}
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {showArchived && archived.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-md border border-dashed">
          {archived.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm text-muted-foreground">
                  {source.name}
                </span>
                <Badge variant="outline">{t('archived')}</Badge>
              </span>
              {confirmId === source.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('deleteConfirm')}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        await deleteMyIncomeSource({
                          data: { id: source.id },
                        })
                        setConfirmId(null)
                      })
                    }
                  >
                    {t('delete')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmId(null)}
                  >
                    {t('keep')}
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run(() =>
                        restoreMyIncomeSource({ data: { id: source.id } }),
                      )
                    }
                  >
                    {t('restore')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setError(null)
                      setConfirmId(source.id)
                    }}
                  >
                    {t('deleteDots')}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <SourceForm
        draft={draft}
        currency={currency}
        pending={pending}
        submitLabel={t('add')}
        onChange={setDraft}
        onSubmit={() => void add()}
      />
    </section>
  )
}

/**
 * One form for adding and for editing in place; it is a plain controlled
 * component so the parent decides what a submit means.
 */
function SourceForm({
  draft,
  currency,
  pending,
  submitLabel,
  framed = true,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft
  currency: string
  pending: boolean
  submitLabel: string
  framed?: boolean
  onChange: (draft: Draft) => void
  onSubmit: () => void
  onCancel?: () => void
}) {
  const t = useTranslations('incomeSources')
  const id = useId()

  function change(key: keyof Draft, value: string) {
    onChange({ ...draft, [key]: value })
  }

  const cadenceItems = [
    ...CADENCES.map((cadence) => ({
      value: cadence.value,
      label: t(cadence.labelKey),
    })),
    { value: CUSTOM, label: t('custom') },
  ]

  return (
    <form
      className={
        framed
          ? 'flex w-full flex-col gap-3 rounded-md border p-3'
          : 'flex w-full flex-col gap-3'
      }
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>{t('name')}</FieldLabel>
          <Input
            id={`${id}-name`}
            value={draft.name}
            placeholder={t('namePlaceholder')}
            onChange={(event) => change('name', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-amount`}>{t('amount')}</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-amount`}
              className="flex-1"
              value={draft.amount}
              placeholder={t('amountPlaceholder')}
              inputMode="decimal"
              onChange={(event) => change('amount', event.target.value)}
            />
            <Input
              className="w-16"
              aria-label={t('currencyAria')}
              value={draft.currency}
              maxLength={3}
              placeholder={currency}
              onChange={(event) =>
                change('currency', event.target.value.toUpperCase())
              }
            />
          </div>
        </Field>
        <Field>
          <FieldLabel>{t('arrives')}</FieldLabel>
          <Select
            value={draft.cadence}
            items={cadenceItems}
            onValueChange={(value) => change('cadence', String(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cadenceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-next`}>{t('nextArrival')}</FieldLabel>
          <Input
            id={`${id}-next`}
            type="date"
            value={draft.nextArrival}
            onChange={(event) => change('nextArrival', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-started`}>{t('started')}</FieldLabel>
          <Input
            id={`${id}-started`}
            type="date"
            value={draft.startDate}
            onChange={(event) => change('startDate', event.target.value)}
          />
        </Field>
      </div>

      {draft.cadence === CUSTOM ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor={`${id}-count`}>{t('everyCount')}</FieldLabel>
            <Input
              id={`${id}-count`}
              value={draft.count}
              inputMode="numeric"
              onChange={(event) => change('count', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{t('unit')}</FieldLabel>
            <Select
              value={draft.unit}
              items={UNITS.map((unit) => ({
                value: unit,
                label: t(UNIT_LABEL_KEYS[unit]),
              }))}
              onValueChange={(value) => change('unit', String(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {t(UNIT_LABEL_KEYS[unit])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
