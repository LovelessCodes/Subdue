import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { PaymentMethodIcon } from '@/components/payment-method-icon'
import { SubscriptionAvatar } from '@/components/subscription-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  createSubscription,
  deleteSubscription,
  updateSubscription,
} from '@/lib/app.functions'
import { isExternalLogo } from '@/lib/logo-source'
import { fromMajorUnits, toMajorUnits } from '@/lib/money'
import type { SubscriptionWithRecurrence } from '@/server/services/subscriptions'

const NONE = '__none__'
const CYCLE_UNITS = ['days', 'weeks', 'months', 'years'] as const

type FormState = {
  name: string
  price: string
  currency: string
  cycleUnit: string
  cycleCount: string
  nextPayment: string
  categoryId: string
  paymentMethodId: string
  url: string
  notes: string
  remindDaysBefore: string
  remindEnabled: boolean
  autoRenew: boolean
  cancelledAt: string
  logo: string | null
}

function isoDay(value: Date | string | null | undefined): string {
  if (!value) {
    return ''
  }
  return new Date(value).toISOString().slice(0, 10)
}

function initialForm(
  subscription: SubscriptionWithRecurrence | null,
  defaultCurrency: string,
): FormState {
  if (!subscription) {
    return {
      name: '',
      price: '',
      currency: defaultCurrency,
      cycleUnit: 'months',
      cycleCount: '1',
      nextPayment: isoDay(new Date()),
      categoryId: NONE,
      paymentMethodId: NONE,
      url: '',
      notes: '',
      remindDaysBefore: '',
      remindEnabled: true,
      autoRenew: true,
      cancelledAt: '',
      logo: null,
    }
  }

  return {
    name: subscription.name,
    price: String(toMajorUnits(subscription.price, subscription.currency)),
    currency: subscription.currency,
    cycleUnit: subscription.cycleUnit,
    cycleCount: String(subscription.cycleCount),
    nextPayment: isoDay(subscription.nextPayment),
    categoryId: subscription.categoryId ?? NONE,
    paymentMethodId: subscription.paymentMethodId ?? NONE,
    url: subscription.url ?? '',
    notes: subscription.notes ?? '',
    remindDaysBefore:
      subscription.remindDaysBefore === null
        ? ''
        : String(subscription.remindDaysBefore),
    remindEnabled: subscription.remindEnabled !== false,
    autoRenew: subscription.autoRenew ?? true,
    cancelledAt: isoDay(subscription.cancelledAt),
    logo: subscription.logo,
  }
}

function friendly(message: string): string {
  if (message.includes('PAYMENT_METHOD_NOT_FOUND')) {
    return 'That payment method no longer exists — pick another.'
  }
  if (message.includes('LOGO_NOT_FOUND')) {
    return 'The logo upload did not finish — try again.'
  }
  if (message.includes('SUBSCRIPTION_NOT_FOUND')) {
    return 'That subscription no longer exists.'
  }
  return message
}

export function SubscriptionForm({
  open,
  onOpenChange,
  subscription,
  categories,
  paymentMethods,
  defaultCurrency,
  defaultRemindDays,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: SubscriptionWithRecurrence | null
  categories: { id: string; name: string; archivedAt?: string | Date | null }[]
  paymentMethods: {
    id: string
    name: string
    icon?: string | null
    archivedAt?: string | Date | null
  }[]
  defaultCurrency: string
  defaultRemindDays: number
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() =>
    initialForm(subscription, defaultCurrency),
  )
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Archived rows are hidden, but the one already chosen stays visible so the
  // form never loses a value it was opened with.
  const shownCategories = categories.filter(
    (category) => !category.archivedAt || category.id === form.categoryId,
  )
  const shownMethods = paymentMethods.filter(
    (method) => !method.archivedAt || method.id === form.paymentMethodId,
  )

  useEffect(() => {
    if (open) {
      setForm(initialForm(subscription, defaultCurrency))
      setLogoFile(null)
      setError(null)
      setConfirmDelete(false)
    }
  }, [open, subscription, defaultCurrency])

  function set<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setError(null)

    const currency = form.currency.trim().toUpperCase() || defaultCurrency
    const priceNumber = Number(form.price.replace(',', '.'))
    const count = Number(form.cycleCount)

    if (!form.name.trim()) {
      setError('Give the subscription a name.')
      return
    }
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      setError('Price must be a positive number.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.nextPayment)) {
      setError('A next payment date is required.')
      return
    }
    if (!Number.isInteger(count) || count < 1) {
      setError('The cycle needs a whole number of at least 1.')
      return
    }

    setPending(true)
    try {
      let logo = form.logo
      if (logoFile) {
        const response = await fetch('/api/logos', {
          method: 'POST',
          body: logoFile,
        })
        if (!response.ok) {
          throw new Error(
            response.status === 413
              ? 'Logo is larger than 1 MiB.'
              : response.status === 415
                ? 'Logo must be a PNG, JPEG, GIF or WebP.'
                : 'Logo upload failed.',
          )
        }
        logo = ((await response.json()) as { logo: string }).logo
      }

      const payload = {
        name: form.name.trim(),
        price: fromMajorUnits(priceNumber, currency),
        currency,
        cycleUnit: form.cycleUnit,
        cycleCount: count,
        nextPayment: `${form.nextPayment}T00:00:00.000Z`,
        categoryId: form.categoryId === NONE ? null : form.categoryId,
        paymentMethodId:
          form.paymentMethodId === NONE ? null : form.paymentMethodId,
        url: form.url.trim() || null,
        notes: form.notes.trim() || null,
        remindDaysBefore:
          form.remindDaysBefore === '' ? null : Number(form.remindDaysBefore),
        remindEnabled: form.remindEnabled,
        autoRenew: form.autoRenew,
        cancelledAt: form.cancelledAt
          ? `${form.cancelledAt}T00:00:00.000Z`
          : null,
        logo,
      }

      if (subscription) {
        await updateSubscription({
          data: { id: subscription.id, ...payload },
        })
      } else {
        await createSubscription({ data: payload })
      }
      await router.invalidate()
      onOpenChange(false)
    } catch (caught) {
      setError(
        friendly(caught instanceof Error ? caught.message : 'Save failed.'),
      )
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!subscription) {
      return
    }
    setPending(true)
    try {
      await deleteSubscription({ data: { id: subscription.id } })
      await router.invalidate()
      onOpenChange(false)
    } catch (caught) {
      setError(
        friendly(caught instanceof Error ? caught.message : 'Delete failed.'),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {subscription ? `Edit ${subscription.name}` : 'Add subscription'}
          </DialogTitle>
          <DialogDescription>
            Everything is optional beyond the name, price, cycle and next
            payment date.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="subscription-name">Name</FieldLabel>
              <Input
                id="subscription-name"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="Spotify"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="subscription-price">Price</FieldLabel>
                <Input
                  id="subscription-price"
                  value={form.price}
                  onChange={(event) => set('price', event.target.value)}
                  inputMode="decimal"
                  placeholder="199"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-currency">
                  Currency
                </FieldLabel>
                <Input
                  id="subscription-currency"
                  value={form.currency}
                  onChange={(event) =>
                    set('currency', event.target.value.toUpperCase())
                  }
                  maxLength={3}
                  placeholder={defaultCurrency}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Cycle</FieldLabel>
                <Select
                  value={form.cycleUnit}
                  onValueChange={(value) => set('cycleUnit', String(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLE_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-count">
                  Every … cycles
                </FieldLabel>
                <Input
                  id="subscription-count"
                  value={form.cycleCount}
                  onChange={(event) => set('cycleCount', event.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="subscription-next">Next payment</FieldLabel>
              <Input
                id="subscription-next"
                type="date"
                value={form.nextPayment}
                onChange={(event) => set('nextPayment', event.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Select
                  value={form.categoryId}
                  items={[
                    { label: 'None', value: NONE },
                    ...shownCategories.map((category) => ({
                      label: category.archivedAt
                        ? `${category.name} (archived)`
                        : category.name,
                      value: category.id,
                    })),
                  ]}
                  onValueChange={(value) => set('categoryId', String(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {shownCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                        {category.archivedAt ? ' (archived)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {shownCategories.length === 0 ? (
                  <FieldDescription>
                    None yet — add categories in Settings.
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Payment method</FieldLabel>
                <Select
                  value={form.paymentMethodId}
                  items={[
                    { label: 'None', value: NONE },
                    ...shownMethods.map((method) => ({
                      label: (
                        <span className="flex items-center gap-1.5">
                          <PaymentMethodIcon icon={method.icon ?? null} />
                          <span>
                            {method.name}
                            {method.archivedAt ? ' (archived)' : ''}
                          </span>
                        </span>
                      ),
                      value: method.id,
                    })),
                  ]}
                  onValueChange={(value) =>
                    set('paymentMethodId', String(value))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {shownMethods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        <span className="flex items-center gap-1.5">
                          <PaymentMethodIcon icon={method.icon ?? null} />
                          <span>
                            {method.name}
                            {method.archivedAt ? ' (archived)' : ''}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {shownMethods.length === 0 ? (
                  <FieldDescription>
                    None yet — add payment methods in Settings.
                  </FieldDescription>
                ) : null}
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="subscription-url">URL</FieldLabel>
              <Input
                id="subscription-url"
                value={form.url}
                onChange={(event) => set('url', event.target.value)}
                placeholder="https://example.com/account"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="subscription-notes">Notes</FieldLabel>
              <Textarea
                id="subscription-notes"
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Anything worth remembering at renewal time"
              />
            </Field>

            <Field orientation="horizontal">
              <Switch
                checked={form.remindEnabled}
                onCheckedChange={(checked) => set('remindEnabled', checked)}
              />
              <FieldLabel>Notify me before it is due</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="subscription-remind">
                Days before the due date
              </FieldLabel>
              <Input
                id="subscription-remind"
                value={form.remindDaysBefore}
                onChange={(event) =>
                  set('remindDaysBefore', event.target.value)
                }
                inputMode="numeric"
                placeholder={`Default (${defaultRemindDays})`}
                disabled={!form.remindEnabled}
              />
              <FieldDescription>
                Leave empty to use the default; 0 reminds on the due date.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Switch
                checked={form.autoRenew}
                onCheckedChange={(checked) => set('autoRenew', checked)}
              />
              <FieldLabel>Auto-renew</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="subscription-cancelled">
                Ends on (optional)
              </FieldLabel>
              <Input
                id="subscription-cancelled"
                type="date"
                value={form.cancelledAt}
                onChange={(event) => set('cancelledAt', event.target.value)}
              />
              <FieldDescription>
                After this date the subscription stops counting toward totals,
                the calendar, the budget and reminders.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="subscription-logo">Logo</FieldLabel>
              <div className="flex items-center gap-3">
                <SubscriptionAvatar name={form.name || '?'} logo={form.logo} />
                <Input
                  id="subscription-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(event) =>
                    setLogoFile(event.target.files?.[0] ?? null)
                  }
                  className="text-xs"
                />
                {form.logo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set('logo', null)
                      setLogoFile(null)
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <Input
                id="subscription-logo-url"
                value={isExternalLogo(form.logo ?? '') ? (form.logo ?? '') : ''}
                onChange={(event) => {
                  const value = event.target.value
                  setLogoFile(null)
                  set('logo', value.trim() === '' ? null : value)
                }}
                placeholder="…or paste an image URL"
              />
              <FieldDescription>
                Upload a PNG, JPEG, GIF or WebP (up to 1 MiB), or paste an image
                URL — external ones load straight from that host.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </DialogPanel>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div>
            {subscription ? (
              confirmDelete ? (
                <Button
                  variant="destructive"
                  onClick={remove}
                  disabled={pending}
                >
                  Confirm delete
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  disabled={pending}
                >
                  Delete
                </Button>
              )
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
