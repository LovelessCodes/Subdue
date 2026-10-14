import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { getMySettings, updateMySettings } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { fromMajorUnits, toMajorUnits } from '@/lib/money'
import type { Settings } from '@/server/services/settings'

const LOCALES = [
  'en',
  'da',
  'de',
  'sv',
  'nb',
  'fi',
  'nl',
  'fr',
  'es',
  'it',
  'pl',
]
const THEMES = ['light', 'dark', 'system'] as const
const WEEK_STARTS = ['monday', 'sunday'] as const

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => ({ settings: await getMySettings() }),
  component: SettingsPage,
})

export function applyTheme(theme: string) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('subdue-theme', theme)
  } catch {
    // private mode: the theme still applies for this session
  }
}

function SettingsPage() {
  const { settings } = Route.useLoaderData()
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState(() => formFrom(settings))

  function set(key: keyof typeof form, value: string) {
    setSaved(false)
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setError(null)
    const currency = form.currency.trim().toUpperCase() || settings.currency
    const budgetAmount = Number(form.budget.replace(',', '.'))

    if (
      form.budget.trim() !== '' &&
      (!Number.isFinite(budgetAmount) || budgetAmount < 0)
    ) {
      setError('The budget needs to be a positive number (or empty).')
      return
    }

    setPending(true)
    try {
      await updateMySettings({
        data: {
          currency,
          locale: form.locale,
          weekStart: form.weekStart,
          theme: form.theme,
          budgetAmountMinor:
            form.budget.trim() === ''
              ? null
              : fromMajorUnits(budgetAmount, currency),
          payAnchorDay: form.anchor.trim() === '' ? null : Number(form.anchor),
          remindDaysBefore:
            form.remindDays.trim() === '' ? null : Number(form.remindDays),
        },
      })
      applyTheme(form.theme)
      await router.invalidate()
      setSaved(true)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not save settings.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              How amounts and dates are shown, and how the app looks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="settings-currency">
                    Main currency
                  </FieldLabel>
                  <Input
                    id="settings-currency"
                    value={form.currency}
                    onChange={(event) =>
                      set('currency', event.target.value.toUpperCase())
                    }
                    maxLength={3}
                  />
                  <FieldDescription>
                    Everything converts into this currency using daily ECB
                    rates.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Language for formatting</FieldLabel>
                  <Select
                    value={form.locale}
                    onValueChange={(value) => set('locale', String(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set([settings.locale, ...LOCALES])].map(
                        (locale) => (
                          <SelectItem key={locale} value={locale}>
                            {locale}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Week starts on</FieldLabel>
                  <Select
                    value={form.weekStart}
                    onValueChange={(value) => set('weekStart', String(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEK_STARTS.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Theme</FieldLabel>
                  <Select
                    value={form.theme}
                    onValueChange={(value) => set('theme', String(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEMES.map((theme) => (
                        <SelectItem key={theme} value={theme}>
                          {theme}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget</CardTitle>
            <CardDescription>
              A ceiling for the dashboard’s spend bar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="settings-budget">
                    Budget per period ({settings.currency})
                  </FieldLabel>
                  <Input
                    id="settings-budget"
                    value={form.budget}
                    onChange={(event) => set('budget', event.target.value)}
                    inputMode="decimal"
                    placeholder="Empty = no budget"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-anchor">
                    Pay day anchor (1–31)
                  </FieldLabel>
                  <Input
                    id="settings-anchor"
                    value={form.anchor}
                    onChange={(event) => set('anchor', event.target.value)}
                    inputMode="numeric"
                    placeholder="Empty = calendar months"
                  />
                </Field>
              </div>
              <FieldDescription>
                Anchor the budget period to your pay day. Set 25 and the period
                runs the 25th to the 24th — so a salary landing on 25 September
                covers 25 Sep – 24 Oct. Anchors also clamp like the recurrence
                engine: day 31 becomes the 28th of February.
              </FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
            <CardDescription>
              When to start nudging before a charge.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="settings-remind">
                Days before a charge
              </FieldLabel>
              <Input
                id="settings-remind"
                value={form.remindDays}
                onChange={(event) => set('remindDays', event.target.value)}
                inputMode="numeric"
                placeholder="Empty = default (3)"
                className="max-w-40"
              />
              <FieldDescription>
                Per-subscription overrides win over this default.
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save settings'}
          </Button>
          {saved ? (
            <span className="text-sm text-muted-foreground">Saved</span>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function formFrom(settings: Settings) {
  return {
    currency: settings.currency,
    locale: settings.locale,
    weekStart: settings.weekStart,
    theme: settings.theme,
    budget:
      settings.budgetAmountMinor === null
        ? ''
        : String(toMajorUnits(settings.budgetAmountMinor, settings.currency)),
    anchor: settings.payAnchorDay === null ? '' : String(settings.payAnchorDay),
    remindDays: String(settings.remindDaysBefore),
  }
}
