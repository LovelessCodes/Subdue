import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from 'cn'
import { ManagedListsCard } from '@/components/managed-lists-card'
import { PasskeyCard } from '@/components/passkey-card'
import { TwoFactorCard } from '@/components/two-factor-card'
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
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/coss-tabs'
import { getMySettings, updateMySettings } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { fromMajorUnits, toMajorUnits } from '@/lib/money'
import type { Settings, Theme, WeekStart } from '@/server/services/settings'

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
  'zh',
  'fo',
  'uk',
]

/** Own-language names, so the list reads the same wherever you are. */
const ENDONYMS: Record<string, string> = {
  en: 'English',
  da: 'Dansk',
  de: 'Deutsch',
  sv: 'Svenska',
  nb: 'Norsk bokmål',
  fi: 'Suomi',
  nl: 'Nederlands',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pl: 'Polski',
  zh: '简体中文',
  fo: 'Føroyskt',
  uk: 'Українська',
}
const THEMES = ['light', 'dark', 'system'] as const
const WEEK_STARTS = ['monday', 'sunday'] as const

const SECTIONS = [
  'preferences',
  'budget',
  'reminders',
  'lists',
  'security',
] as const
type Section = (typeof SECTIONS)[number]

const SECTION_LABELS: Record<Section, string> = {
  preferences: 'Preferences',
  budget: 'Budget',
  reminders: 'Reminders',
  lists: 'Lists',
  security: 'Security',
}

const SECTION_DESCRIPTIONS: Record<Section, string> = {
  preferences: 'How amounts and dates are shown, and how the app looks.',
  budget: 'A ceiling for the dashboard’s spend bar.',
  reminders: 'When to start nudging before a charge.',
  lists: 'Categories and payment methods across the app.',
  security: 'Ways to sign in, and keeping the account safe.',
}

export const Route = createFileRoute('/_app/settings')({
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
  const [section, setSection] = useState<Section>('preferences')
  const [form, setForm] = useState(() => formFrom(settings))
  const [baseline, setBaseline] = useState(() => formFrom(settings))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const savedTimer = useRef<number | null>(null)

  const dirty = (Object.keys(form) as Array<keyof typeof form>).some(
    (key) => form[key] !== baseline[key],
  )

  const localeOptions = [...new Set([settings.locale, ...LOCALES])].map(
    (code) => ({ value: code, label: ENDONYMS[code] ?? code }),
  )
  const themeOptions = THEMES.map((theme) => ({
    value: theme,
    label: titleCase(theme),
  }))
  const weekOptions = WEEK_STARTS.map((day) => ({
    value: day,
    label: titleCase(day),
  }))

  function change(key: keyof typeof form, value: string) {
    setError(null)
    setForm((current) => ({ ...current, [key]: value }))
    if (key === 'theme') {
      applyTheme(value)
    }
  }

  /**
   * Everything saves on its own (shortly after you stop typing), so there is
   * no save button to hunt for. Validation mirrors the server's schema, and
   * the error stays up until the next edit.
   */
  const save = useCallback(
    async (next: ReturnType<typeof formFrom>) => {
      const currency = next.currency.trim().toUpperCase() || settings.currency
      if (!/^[A-Z]{3}$/.test(currency)) {
        setError('Use a 3-letter currency code, like DKK or EUR.')
        return
      }
      const budgetAmount = Number(next.budget.replace(',', '.'))
      if (
        next.budget.trim() !== '' &&
        (!Number.isFinite(budgetAmount) || budgetAmount < 0)
      ) {
        setError('The budget needs to be a positive number (or empty).')
        return
      }
      const anchorDay = next.anchor.trim() === '' ? null : Number(next.anchor)
      if (
        anchorDay !== null &&
        (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31)
      ) {
        setError('Pay day anchors run from 1 to 31 — or leave it empty.')
        return
      }
      const remindDays =
        next.remindDays.trim() === '' ? null : Number(next.remindDays)
      if (
        remindDays !== null &&
        (!Number.isInteger(remindDays) || remindDays < 0 || remindDays > 60)
      ) {
        setError('Reminders run from 0 to 60 days before a charge.')
        return
      }

      const normalized = { ...next, currency }
      setStatus('saving')
      try {
        await updateMySettings({
          data: {
            currency,
            locale: next.locale,
            weekStart: next.weekStart as WeekStart,
            theme: next.theme as Theme,
            budgetAmountMinor:
              next.budget.trim() === ''
                ? null
                : fromMajorUnits(budgetAmount, currency),
            payAnchorDay: anchorDay,
            remindDaysBefore: remindDays,
          },
        })
        applyTheme(normalized.theme)
        // Reflect fallbacks (an emptied currency snaps back) without stomping
        // edits made while the save was in flight.
        setForm((current) => ({ ...current, currency: normalized.currency }))
        setBaseline(normalized)
        setStatus('saved')
        if (savedTimer.current !== null) {
          window.clearTimeout(savedTimer.current)
        }
        savedTimer.current = window.setTimeout(() => setStatus('idle'), 1800)
        void router.invalidate()
      } catch (caught) {
        setStatus('idle')
        setError(
          caught instanceof Error ? caught.message : 'Could not save settings.',
        )
      }
    },
    [router, settings.currency],
  )

  useEffect(() => {
    if (!dirty) return
    const id = window.setTimeout(() => void save(form), 650)
    return () => window.clearTimeout(id)
  }, [dirty, form, save])

  useEffect(() => {
    return () => {
      if (savedTimer.current !== null) {
        window.clearTimeout(savedTimer.current)
      }
    }
  }, [])

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h1 className="font-heading text-lg font-medium">Settings</h1>
          <SaveStatus state={status} error={error} />
        </header>

        <Tabs
          value={section}
          onValueChange={(value) => setSection(value as Section)}
          className="gap-6"
        >
          <TabsList
            variant="underline"
            className="w-full max-sm:overflow-x-auto"
          >
            {SECTIONS.map((id) => (
              <TabsTab key={id} value={id} className="sm:basis-0">
                {SECTION_LABELS[id]}
              </TabsTab>
            ))}
          </TabsList>

          <TabsPanel value="preferences" className="flex flex-col gap-5">
            <SectionLead section="preferences" />
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
                      change('currency', event.target.value.toUpperCase())
                    }
                    maxLength={3}
                  />
                  <FieldDescription>
                    Everything converts into this currency using daily ECB
                    rates.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Language</FieldLabel>
                  <Select
                    value={form.locale}
                    items={localeOptions}
                    onValueChange={(value) => change('locale', String(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {localeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Applies to the app&rsquo;s text and to how amounts and dates
                    are shown.
                  </FieldDescription>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Week starts on</FieldLabel>
                  <Select
                    value={form.weekStart}
                    items={weekOptions}
                    onValueChange={(value) =>
                      change('weekStart', String(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {weekOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Theme</FieldLabel>
                  <Select
                    value={form.theme}
                    items={themeOptions}
                    onValueChange={(value) => change('theme', String(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {themeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FieldGroup>
          </TabsPanel>

          <TabsPanel value="budget" className="flex flex-col gap-5">
            <SectionLead section="budget" />
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="settings-budget">
                    Budget per period ({form.currency})
                  </FieldLabel>
                  <Input
                    id="settings-budget"
                    value={form.budget}
                    onChange={(event) => change('budget', event.target.value)}
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
                    onChange={(event) => change('anchor', event.target.value)}
                    inputMode="numeric"
                    placeholder="Empty = calendar months"
                  />
                </Field>
              </div>
              <AnchorNote />
            </FieldGroup>
          </TabsPanel>

          <TabsPanel value="reminders" className="flex flex-col gap-5">
            <SectionLead section="reminders" />
            <Field>
              <FieldLabel htmlFor="settings-remind">
                Days before a charge
              </FieldLabel>
              <Input
                id="settings-remind"
                value={form.remindDays}
                onChange={(event) => change('remindDays', event.target.value)}
                inputMode="numeric"
                placeholder="Empty = default (3)"
                className="max-w-40"
              />
              <FieldDescription>
                Per-subscription overrides win over this default.
              </FieldDescription>
            </Field>
          </TabsPanel>

          <TabsPanel value="lists" className="flex flex-col gap-5">
            <SectionLead section="lists" />
            <ManagedListsCard />
          </TabsPanel>

          <TabsPanel value="security" className="flex flex-col gap-5">
            <SectionLead section="security" />
            <div className="flex flex-col gap-4">
              <PasskeyCard />
              <TwoFactorCard />
            </div>
          </TabsPanel>
        </Tabs>

        <p className="text-sm text-muted-foreground">
          Running this instance?{' '}
          <Link
            to="/admin"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Administration, social sign-in and roles
          </Link>
          .
        </p>
      </main>
    </div>
  )
}

function SectionLead({ section }: { section: Section }) {
  return (
    <p className="text-sm text-muted-foreground">
      {SECTION_DESCRIPTIONS[section]}
    </p>
  )
}

function SaveStatus({
  state,
  error,
}: {
  state: 'idle' | 'saving' | 'saved'
  error: string | null
}) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {error !== null ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : (
        <span
          className={cn(
            'flex items-center gap-1 text-sm text-muted-foreground transition-opacity duration-200 ease-out',
            state === 'idle' && 'opacity-0',
          )}
        >
          {state === 'saving' ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="size-3.5" />
              Saved
            </>
          )}
        </span>
      )}
    </div>
  )
}

/** The pay-day anchor explanation, folded away until asked for. */
function AnchorNote({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        How anchoring works
        <ChevronDown
          className={cn(
            'size-4 transition-transform duration-200 ease-out',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={id}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <p className="pt-2 text-sm leading-relaxed text-muted-foreground">
            Anchor the budget period to your pay day. Set 25 and the period runs
            the 25th to the 24th — so a salary landing on 25 September covers 25
            Sep – 24 Oct. Anchors also clamp like the recurrence engine: day 31
            becomes the 28th of February.
          </p>
        </div>
      </div>
    </div>
  )
}

function titleCase(value: string) {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1)
}

function formFrom(settings: Settings) {
  return {
    currency: settings.currency,
    locale: settings.locale,
    weekStart: String(settings.weekStart),
    theme: String(settings.theme),
    budget:
      settings.budgetAmountMinor === null
        ? ''
        : String(toMajorUnits(settings.budgetAmountMinor, settings.currency)),
    anchor: settings.payAnchorDay === null ? '' : String(settings.payAnchorDay),
    remindDays: String(settings.remindDaysBefore),
  }
}
