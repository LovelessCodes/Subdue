import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import {
  Check,
  ChevronRight,
  ExternalLink,
  Pencil,
  UsersRound,
} from 'lucide-react'
import { SharedSubscriptionDrawer } from '@/components/shared-subscription-drawer'
import { SubscriptionSplitDrawer } from '@/components/subscription-split-drawer'
import { SubscriptionAvatar } from '@/components/subscription-avatar'
import { SubscriptionForm } from '@/components/subscription-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getMySettings,
  listMyCategories,
  listMyPaymentMethods,
  listMySubscriptions,
} from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { formatDate, formatMinor } from '@/lib/money'
import { cycleText, type SharingTranslator } from '@/lib/sharing-copy'
import type { SubscriptionWithRecurrence } from '@/server/services/subscriptions'

const PAYMENTS_PER_YEAR: Record<string, number> = {
  days: 365.25,
  weeks: 52.17857142857143,
  months: 12,
  years: 1,
}

const CATEGORY_COLORS = [
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

type CategoryGroup = {
  id: string
  name: string
  color: string | null
  items: SubscriptionWithRecurrence[]
  monthlyMinor: number
  totalsLabel: string
}

function monthlyEquivalentMinor(
  subscription: SubscriptionWithRecurrence,
): number {
  return Math.round(
    (subscription.price * (PAYMENTS_PER_YEAR[subscription.cycleUnit] ?? 12)) /
      subscription.cycleCount /
      12,
  )
}

function RowStatuses({
  subscription,
  locale,
  t,
}: {
  subscription: SubscriptionWithRecurrence
  locale: string
  t: SharingTranslator
}) {
  const tPage = useTranslations('subscriptions')

  return (
    <div className="flex flex-wrap items-center gap-1">
      {subscription.cancelledAt ? (
        <Badge variant="outline">
          {tPage('endsOn', {
            date: formatDate(subscription.cancelledAt, locale),
          })}
        </Badge>
      ) : subscription.autoRenew === false ? (
        <Badge variant="outline">{tPage('noAutoRenew')}</Badge>
      ) : null}
      {subscription.remindEnabled === false ? (
        <Badge variant="outline">{tPage('noReminders')}</Badge>
      ) : null}
      {subscription.sharedCount > 0 ? (
        <Badge variant="secondary" className="gap-1">
          <UsersRound className="size-3" />
          {t('sharedBadge', { count: subscription.sharedCount })}
        </Badge>
      ) : null}
    </div>
  )
}

function OwnRow({
  subscription,
  locale,
  t,
  onEdit,
  onSplit,
}: {
  subscription: SubscriptionWithRecurrence
  locale: string
  t: SharingTranslator
  onEdit: (subscription: SubscriptionWithRecurrence) => void
  onSplit: (subscription: SubscriptionWithRecurrence) => void
}) {
  const tPage = useTranslations('subscriptions')
  const amount = formatMinor(subscription.price, subscription.currency, locale)

  return (
    <div className="flex w-full items-start gap-3 px-4 py-2.5 sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SubscriptionAvatar name={subscription.name} logo={subscription.logo} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{subscription.name}</p>
            {subscription.url ? (
              <a
                href={subscription.url}
                target="_blank"
                rel="noreferrer"
                aria-label={tPage('openSubscription', {
                  name: subscription.name,
                })}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {cycleText(t, subscription.cycleCount, subscription.cycleUnit)} ·{' '}
            {tPage('nextOn', {
              date: formatDate(subscription.nextDue, locale),
            })}
            {subscription.paymentMethodName
              ? ` · ${subscription.paymentMethodName}`
              : ''}
          </p>
          <div className="mt-1.5 sm:hidden">
            <RowStatuses subscription={subscription} locale={locale} t={t} />
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums">{amount}</p>
        {subscription.sharedCount > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {tPage('yourShare', {
              amount: formatMinor(
                subscription.viewerShareMinor,
                subscription.currency,
                locale,
              ),
            })}
          </p>
        ) : null}
      </div>

      <div className="hidden shrink-0 sm:block">
        <RowStatuses subscription={subscription} locale={locale} t={t} />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('splitButton', {
            name: subscription.name,
          })}
          onClick={() => onSplit(subscription)}
        >
          <UsersRound />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tPage('editSubscription', {
            name: subscription.name,
          })}
          onClick={() => onEdit(subscription)}
        >
          <Pencil />
        </Button>
      </div>
    </div>
  )
}

function SharedRow({
  subscription,
  locale,
  t,
  onView,
}: {
  subscription: SubscriptionWithRecurrence
  locale: string
  t: SharingTranslator
  onView: (subscription: SubscriptionWithRecurrence) => void
}) {
  const tPage = useTranslations('subscriptions')

  return (
    <div className="flex w-full items-start gap-3 px-4 py-2.5 sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SubscriptionAvatar name={subscription.name} logo={subscription.logo} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{subscription.name}</p>
            {subscription.url ? (
              <a
                href={subscription.url}
                target="_blank"
                rel="noreferrer"
                aria-label={tPage('openSubscription', {
                  name: subscription.name,
                })}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {t('splitWith', { owner: subscription.ownerName ?? '' })} ·{' '}
            {cycleText(t, subscription.cycleCount, subscription.cycleUnit)} ·{' '}
            {tPage('nextOn', {
              date: formatDate(subscription.nextDue, locale),
            })}
          </p>
        </div>
      </div>

      <p className="shrink-0 text-sm tabular-nums">
        {formatMinor(subscription.price, subscription.currency, locale)}
      </p>

      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" />
        {t('memberBadge')}
      </Badge>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('viewDetails', {
          name: subscription.name,
        })}
        onClick={() => onView(subscription)}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/_app/subscriptions')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const [items, settings, categories, paymentMethods] = await Promise.all([
      listMySubscriptions(),
      getMySettings(),
      listMyCategories({ data: { includeArchived: true } }),
      listMyPaymentMethods({ data: { includeArchived: true } }),
    ])
    return { items, settings, categories, paymentMethods }
  },
  component: Subscriptions,
})

function Subscriptions() {
  const { items, settings, categories, paymentMethods } = Route.useLoaderData()
  const t = useTranslations('sharing')
  const tPage = useTranslations('subscriptions')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SubscriptionWithRecurrence | null>(
    null,
  )
  const [splitFor, setSplitFor] = useState<SubscriptionWithRecurrence | null>(
    null,
  )
  const [splitOpen, setSplitOpen] = useState(false)
  const [viewing, setViewing] = useState<SubscriptionWithRecurrence | null>(
    null,
  )
  const [viewingOpen, setViewingOpen] = useState(false)

  const own = items.filter((subscription) => subscription.viewer === 'owner')
  const shared = items.filter(
    (subscription) => subscription.viewer === 'member',
  )
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  const groups: CategoryGroup[] = (() => {
    const grouped = new Map<string, Omit<CategoryGroup, 'totalsLabel'>>()

    for (const subscription of own) {
      const category = subscription.categoryId
        ? categoryById.get(subscription.categoryId)
        : undefined
      const id = category?.id ?? 'uncategorized'
      const group = grouped.get(id) ?? {
        id,
        name: category?.name ?? tPage('uncategorized'),
        color: category?.color ?? null,
        items: [],
        monthlyMinor: 0,
      }
      group.items.push(subscription)
      grouped.set(id, group)
    }

    return [...grouped.values()]
      .map((group) => {
        const totals = new Map<string, number>()
        for (const subscription of group.items) {
          totals.set(
            subscription.currency,
            (totals.get(subscription.currency) ?? 0) +
              monthlyEquivalentMinor(subscription),
          )
        }
        return {
          ...group,
          monthlyMinor: group.items.reduce(
            (sum, subscription) => sum + monthlyEquivalentMinor(subscription),
            0,
          ),
          totalsLabel: [...totals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([currency, minor]) =>
              tPage('perMonth', {
                amount: formatMinor(minor, currency, settings.locale),
              }),
            )
            .join(' · '),
        }
      })
      .sort(
        (a, b) =>
          b.monthlyMinor - a.monthlyMinor || a.name.localeCompare(b.name),
      )
  })()

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(subscription: SubscriptionWithRecurrence) {
    setEditing(subscription)
    setOpen(true)
  }

  function openSplit(subscription: SubscriptionWithRecurrence) {
    setSplitFor(subscription)
    setSplitOpen(true)
  }

  function openView(subscription: SubscriptionWithRecurrence) {
    setViewing(subscription)
    setViewingOpen(true)
  }

  function ended(subscription: SubscriptionWithRecurrence) {
    return subscription.cancelledAt
      ? new Date(subscription.cancelledAt).getTime() + 86_400_000 <= Date.now()
      : false
  }

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{tPage('title')}</CardTitle>
                <CardDescription>
                  {tPage('trackedCount', { count: own.length })}
                  {settings.currency !== 'DKK'
                    ? ` · ${tPage('totalsIn', {
                        currency: settings.currency,
                      })}`
                    : ''}
                </CardDescription>
              </div>
              <Button size="sm" onClick={openCreate}>
                {tPage('addSubscription')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className={groups.length ? 'px-0' : undefined}>
            {own.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tPage('empty')}</p>
            ) : (
              groups.map((group, index) => (
                <section key={group.id} className={index > 0 ? 'border-t' : ''}>
                  <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
                        style={{
                          backgroundColor:
                            group.color ??
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                      <h2 className="truncate text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        {group.name}
                      </h2>
                      <span className="text-[11px] text-muted-foreground">
                        {group.items.length}
                      </span>
                    </div>
                    <p className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {group.totalsLabel}
                    </p>
                  </div>
                  <ul className="flex flex-col divide-y">
                    {group.items.map((subscription) => (
                      <li
                        key={subscription.id}
                        className={ended(subscription) ? 'opacity-60' : ''}
                      >
                        <OwnRow
                          subscription={subscription}
                          locale={settings.locale}
                          t={t}
                          onEdit={openEdit}
                          onSplit={openSplit}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </CardContent>
        </Card>

        {shared.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('sectionShared')}</CardTitle>
              <CardDescription>{t('sectionSharedDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="flex flex-col divide-y border-t">
                {shared.map((subscription) => (
                  <li
                    key={subscription.id}
                    className={ended(subscription) ? 'opacity-60' : ''}
                  >
                    <SharedRow
                      subscription={subscription}
                      locale={settings.locale}
                      t={t}
                      onView={openView}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </main>

      <SubscriptionForm
        open={open}
        onOpenChange={setOpen}
        subscription={editing}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          archivedAt: category.archivedAt,
        }))}
        paymentMethods={paymentMethods.map((method) => ({
          id: method.id,
          name: method.name,
          icon: method.icon,
          archivedAt: method.archivedAt,
        }))}
        defaultCurrency={settings.currency}
        defaultRemindDays={settings.remindDaysBefore}
      />

      <SubscriptionSplitDrawer
        subscription={splitFor}
        open={splitOpen}
        onOpenChange={setSplitOpen}
      />

      <SharedSubscriptionDrawer
        subscription={viewing}
        open={viewingOpen}
        onOpenChange={setViewingOpen}
      />
    </div>
  )
}
