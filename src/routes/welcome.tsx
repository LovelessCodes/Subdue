import { ThemeToggle } from '@/components/theme-toggle'
import { createFileRoute, redirect } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { CircleAlert, Landmark, LoaderCircle } from 'lucide-react'
import { cn } from 'cn'
import { SubdueMark } from '@/components/subdue-mark'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  completeOnboarding,
  getOnboardingStatus,
  getSetupStatus,
} from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import {
  SEED_LOCALES,
  SEED_LOCALE_LABELS,
  defaultSeedSet,
} from '@/lib/seed-sets'

export const Route = createFileRoute('/welcome')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    const { onboarded } = await getOnboardingStatus()
    if (onboarded) {
      throw redirect({ to: '/' })
    }
    return { user: session.user }
  },
  loader: async () => ({ setup: await getSetupStatus() }),
  component: Welcome,
})

const EASE_OUT = 'ease-[cubic-bezier(0.23,1,0.32,1)]'
const rise = `animate-in fill-mode-both fade-in-0 slide-in-from-bottom-2 duration-300 ${EASE_OUT} motion-reduce:animate-none`
const fade =
  'animate-in fill-mode-both fade-in-0 duration-200 ease-out motion-reduce:animate-none'
const pop = `animate-in fill-mode-both fade-in-0 zoom-in-95 duration-200 ${EASE_OUT} motion-reduce:animate-none`

const chip =
  'inline-flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-1 text-xs'
const defaultLocale = SEED_LOCALES[0] ?? 'en'
const emptySubscribe = () => () => {}
const localeItems = SEED_LOCALES.map((code) => ({
  value: code,
  label: SEED_LOCALE_LABELS[code] ?? code,
}))

/** The browser's language when a seed set exists for it; the app default otherwise. */
function browserLocale(): string {
  const language = navigator.language?.split('-')[0]?.toLowerCase()
  return language && SEED_LOCALES.includes(language) ? language : defaultLocale
}

/**
 * Reads navigator without breaking hydration: the server and the first client
 * pass see the default, then React re-renders with the browser's answer.
 */
function usePreferredLocale(): string {
  return useSyncExternalStore(
    emptySubscribe,
    browserLocale,
    () => defaultLocale,
  )
}

function Welcome() {
  const { setup } = Route.useLoaderData()
  const preferred = usePreferredLocale()
  const [chosen, setChosen] = useState<string | null>(null)
  const [seed, setSeed] = useState(true)
  const [pending, setPending] = useState<'continue' | 'skip' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const locale = chosen ?? preferred
  const preview = useMemo(() => defaultSeedSet(locale), [locale])
  const busy = pending !== null
  const next = setup.hasAdmin ? '/' : '/setup'

  async function finish(seedChoice: boolean, used: 'continue' | 'skip') {
    setPending(used)
    setError(null)

    try {
      await completeOnboarding({ data: { locale, seed: seedChoice } })
      window.location.assign(next)
    } catch {
      setError('Could not save your choices. Please try again.')
    } finally {
      setPending(null)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!busy) {
      void finish(seed, 'continue')
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 15%, color-mix(in oklch, var(--foreground) 7%, transparent), transparent 72%)',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        <div
          className={cn(
            'overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-xl shadow-black/5 ring-1 ring-foreground/10 dark:shadow-black/40',
            pop,
          )}
        >
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <span className={cn('flex items-center gap-2', fade)}>
              <SubdueMark className="size-5" />
              <span className="text-sm font-semibold tracking-tight">
                Subdue
              </span>
            </span>
            <span className="text-xs text-muted-foreground">Welcome</span>
          </div>

          <form
            onSubmit={onSubmit}
            aria-label="Welcome"
            className="px-3 pt-2 pb-3"
          >
            <Field className={rise} style={{ animationDelay: '60ms' }}>
              <FieldLabel htmlFor="welcome-locale">Language</FieldLabel>
              <Select
                value={locale}
                items={localeItems}
                onValueChange={(value) => setChosen(String(value))}
                disabled={busy}
              >
                <SelectTrigger id="welcome-locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEED_LOCALES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {SEED_LOCALE_LABELS[code] ?? code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Formats dates and amounts — and the starter names below follow
                it.
              </FieldDescription>
            </Field>

            <div
              className={cn('mt-3 rounded-xl border p-3', rise)}
              style={{ animationDelay: '120ms' }}
            >
              <div className="flex items-start gap-2.5">
                <Checkbox
                  aria-label="Start with the basics"
                  checked={seed}
                  disabled={busy}
                  onCheckedChange={(checked) => setSeed(checked)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setSeed((value) => !value)}
                    disabled={busy}
                    className="block text-left text-sm font-medium disabled:opacity-50"
                  >
                    Start with the basics
                  </button>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Payment methods and categories you can rename, reorder or
                    remove.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  'mt-2.5 rounded-lg border bg-muted/30 p-2.5 transition-opacity duration-200 ease-out motion-reduce:transition-none',
                  seed ? 'opacity-100' : 'opacity-40',
                )}
              >
                <div
                  key={locale}
                  className={cn('flex flex-wrap gap-1.5', fade)}
                >
                  {preview.paymentMethods.map((method) => (
                    <span key={method.name} className={chip}>
                      {method.icon ? (
                        <img
                          src={method.icon}
                          alt=""
                          className="size-3.5 shrink-0"
                        />
                      ) : (
                        <Landmark className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {method.name}
                    </span>
                  ))}
                </div>
                <div
                  key={`${locale}-categories`}
                  className={cn('mt-1.5 flex flex-wrap gap-1.5', fade)}
                >
                  {preview.categories.map((entry) => (
                    <span key={entry.name} className={chip}>
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      {entry.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className={cn('mt-3 h-9 w-full', rise)}
              style={{ animationDelay: '180ms' }}
              disabled={busy}
            >
              {pending === 'continue' ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Setting things up…
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </form>

          {error ? (
            <p
              role="alert"
              className={cn(
                'flex items-center gap-2 border-t px-4 py-2.5 text-xs text-destructive',
                rise,
              )}
            >
              <CircleAlert className="size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground sm:justify-between">
            <p className="hidden sm:block">
              Nothing is locked in — change it later in Settings.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish(false, 'skip')}
              className="text-foreground underline underline-offset-4 hover:text-foreground/80 disabled:opacity-50"
            >
              {pending === 'skip' ? 'Skipping…' : 'Skip for now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
