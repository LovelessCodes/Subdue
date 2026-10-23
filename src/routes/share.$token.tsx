import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useLocale, useTranslations } from 'use-intl'
import { Check, LoaderCircle, ShieldCheck } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { FristMark } from '@/components/frist-mark'
import { Button } from '@/components/ui/button'
import { acceptSharedInvite, getSharedInvite } from '@/lib/app.functions'
import { formatDate, formatMinor } from '@/lib/money'
import { cycleText } from '@/lib/sharing-copy'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/share/$token')({
  loader: async ({ params }) => ({
    invite: await getSharedInvite({ data: { token: params.token } }),
  }),
  component: ShareInvite,
})

const rise =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 fill-mode-both motion-reduce:animate-none'

function ShareInvite() {
  const { invite } = Route.useLoaderData()
  const { token } = Route.useParams()
  const t = useTranslations('sharing')
  const locale = useLocale()
  const [accepted, setAccepted] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const path = `/share/${token}`

  async function accept() {
    setPending(true)
    setError(null)
    try {
      await acceptSharedInvite({ data: { token } })
      setAccepted(true)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      if (message.includes('ALREADY_MEMBER')) {
        setAccepted(true)
      } else if (message.includes('INVITE_NOT_FOUND')) {
        setError(t('inviteInvalidTitle'))
      } else {
        setError(t('errGeneric'))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {invite.status === 'invalid' ? (
        <Card title={t('inviteInvalidTitle')} body={t('inviteInvalidBody')} />
      ) : accepted || invite.viewer === 'member' ? (
        <Card
          title={accepted ? t('inviteAcceptedTitle') : t('inviteAlreadyTitle')}
          body={
            accepted
              ? t('inviteAcceptedBody', { owner: invite.ownerName })
              : t('inviteAlreadyBody')
          }
          action={
            <Button
              className="mt-4 w-full"
              nativeButton={false}
              render={<Link to="/subscriptions" />}
            >
              {t('openFrist')}
            </Button>
          }
        />
      ) : declined ? (
        <Card
          title={t('inviteDeclinedTitle')}
          body={t('inviteDeclinedBody', {
            owner: invite.ownerName,
          })}
          action={
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setDeclined(false)}
            >
              {t('backToLink')}
            </Button>
          }
        />
      ) : (
        <section
          className={cn(
            rise,
            'w-full max-w-md overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10',
          )}
        >
          <div className="border-b bg-muted/40 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t('inviteEyebrow')}
              </p>
              <FristMark className="size-5" />
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {t('inviteTitle', { owner: invite.ownerName })}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {invite.subscription.name}
            </p>
          </div>

          <div className="px-6 py-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t('yourShare')}
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {formatMinor(
                    invite.shareMinor,
                    invite.subscription.currency,
                    locale,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cycleText(
                    t,
                    invite.subscription.cycleCount,
                    invite.subscription.cycleUnit,
                  )}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{t('inviteFullPrice')}</p>
                <p className="mt-0.5 tabular-nums">
                  {formatMinor(
                    invite.subscription.price,
                    invite.subscription.currency,
                    locale,
                  )}
                </p>
                <p className="mt-2">{t('inviteNextCharge')}</p>
                <p className="mt-0.5">
                  {formatDate(invite.subscription.nextPayment, locale)}
                </p>
              </div>
            </div>

            <ul className="mt-5 flex flex-col gap-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {t('inviteBulletSee')}
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {t('inviteBulletReminder')}
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                {t('inviteBulletPrivacy')}
              </li>
            </ul>

            {error ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  if (invite.viewer === 'anonymous') {
                    window.location.assign(
                      `/sign-in?next=${encodeURIComponent(path)}`,
                    )
                    return
                  }
                  void accept()
                }}
              >
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                {invite.viewer === 'anonymous'
                  ? t('inviteSignIn')
                  : t('inviteAccept')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeclined(true)}
              >
                {t('inviteDecline')}
              </Button>
            </div>

            {invite.viewer === 'anonymous' ? (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {t('inviteNewHere')}{' '}
                <a
                  className="underline underline-offset-2 hover:text-foreground"
                  href={`/sign-up?next=${encodeURIComponent(path)}`}
                >
                  {t('inviteCreateAccount')}
                </a>
              </p>
            ) : null}

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {t('inviteNote')}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function Card({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        rise,
        'w-full max-w-sm rounded-2xl bg-card p-6 text-center ring-1 ring-foreground/10',
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action}
    </section>
  )
}
