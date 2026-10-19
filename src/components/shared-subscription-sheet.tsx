import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useLocale, useTranslations } from 'use-intl'
import { Bell, Check, LogOut } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { leaveSharedSubscription, setSharedReminder } from '@/lib/app.functions'
import { formatDate, formatMinor } from '@/lib/money'
import { splitErrorText } from '@/lib/sharing-copy'
import type { SubscriptionWithRecurrence } from '@/server/services/subscriptions'

type Props = {
  subscription: SubscriptionWithRecurrence
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * What a member sees: their share, the next charge, their own reminder, and
 * the way out. Everything else stays with the owner.
 */
export function SharedSubscriptionSheet({
  subscription,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations('sharing')
  const locale = useLocale()
  const router = useRouter()
  const [remind, setRemind] = useState(subscription.remindEnabled !== false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  useEffect(() => {
    if (open) {
      setRemind(subscription.remindEnabled !== false)
      setError(null)
      setConfirmLeave(false)
    }
  }, [open, subscription.remindEnabled, subscription.id])

  const owner = subscription.ownerName ?? ''
  const memberId = subscription.member?.id

  async function toggleReminder(enabled: boolean) {
    if (!memberId) return
    setRemind(enabled)
    setBusy(true)
    setError(null)
    try {
      await setSharedReminder({ data: { id: memberId, enabled } })
      await router.invalidate()
    } catch (caught) {
      setRemind(!enabled)
      setError(splitErrorText(caught, t))
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    if (!memberId) return
    setBusy(true)
    setError(null)
    try {
      await leaveSharedSubscription({ data: { id: memberId } })
      setConfirmLeave(false)
      onOpenChange(false)
      await router.invalidate()
    } catch (caught) {
      setError(splitErrorText(caught, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup side="right" variant="inset">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle className="truncate">{subscription.name}</SheetTitle>
            <Badge variant="secondary" className="gap-1">
              <Check className="size-3" />
              {t('memberBadge')}
            </Badge>
          </div>
          <SheetDescription>{t('splitWith', { owner })}</SheetDescription>
        </SheetHeader>

        <SheetPanel className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('yourShare')}
              </dt>
              <dd className="mt-0.5 text-lg font-medium tabular-nums">
                {formatMinor(subscription.price, subscription.currency, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('nextPayment')}
              </dt>
              <dd className="mt-0.5 text-lg font-medium tabular-nums">
                {formatDate(subscription.nextDue, locale)}
              </dd>
            </div>
            <div className="col-span-2 border-t pt-3 text-xs text-muted-foreground">
              {t('memberNote', { owner })}
            </div>
          </dl>

          <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
            <div className="flex items-start gap-2">
              <Bell className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t('remindMe')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('remindCaption', {
                    amount: formatMinor(
                      subscription.price,
                      subscription.currency,
                      locale,
                    ),
                  })}
                </p>
              </div>
            </div>
            <Switch
              checked={remind}
              disabled={busy}
              onCheckedChange={(value) => void toggleReminder(value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t('memberReadOnly')}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmLeave(true)}
            >
              <LogOut className="size-3.5" />
              {t('leave')}
            </Button>
          </div>
        </SheetPanel>

        <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('leaveTitle')}</DialogTitle>
              <DialogDescription>{t('leaveBody', { owner })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t('cancel')}
              </DialogClose>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void leave()}
              >
                {t('leaveConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetPopup>
    </Sheet>
  )
}
