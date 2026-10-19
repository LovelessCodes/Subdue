import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useLocale, useTranslations } from 'use-intl'
import {
  Check,
  Copy,
  Link2,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerDescription,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  addSplitMember,
  createSplitInvite,
  getSubscriptionSplit,
  removeSplitMember,
  revokeSplitInvite,
  updateSplitMember,
} from '@/lib/app.functions'
import { formatMinor } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  cycleText,
  splitErrorText,
  suggestedShare,
  type SharingTranslator,
} from '@/lib/sharing-copy'
import type { MemberView } from '@/server/services/sharing'
import type { SubscriptionWithRecurrence } from '@/server/services/subscriptions'

const MS_PER_DAY = 24 * 60 * 60 * 1000

type Props = {
  subscription: SubscriptionWithRecurrence
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The owner's side of a shared subscription: one row per person, the owner's
 * remainder as a first-class row, and the links for people who have not
 * accepted yet.
 */
export function SubscriptionSplitDrawer({
  subscription,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations('sharing')
  const locale = useLocale()
  const router = useRouter()
  const [members, setMembers] = useState<MemberView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<MemberView | null>(null)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')

  const subscriptionId = subscription.id

  // The translator identity can change when the page re-renders around the
  // sheet; the fetch must not restart because of that.
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  const refresh = useCallback(async () => {
    try {
      const data = await getSubscriptionSplit({ data: { id: subscriptionId } })
      setMembers(data.members)
    } catch (caught) {
      setMembers([])
      setError(splitErrorText(caught, tRef.current))
    }
  }, [subscriptionId])

  useEffect(() => {
    if (!open) return
    setMembers(null)
    setError(null)
    setTokens({})
    setCopiedId(null)
    setConfirmRemove(null)
    setAddName('')
    setAddAmount('')
    void refresh()
  }, [open, refresh])

  const people = members ?? []
  const allocated = people.reduce((sum, member) => sum + member.shareMinor, 0)
  const over = Math.max(0, allocated - subscription.price)
  const ownerShare = Math.max(0, subscription.price - allocated)
  const percent =
    subscription.price > 0
      ? Math.min(100, Math.round((allocated / subscription.price) * 100))
      : 0
  const suggested = suggestedShare(subscription.price, allocated, people.length)

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setError(null)
    try {
      await action()
      await refresh()
      await router.invalidate()
    } catch (caught) {
      setError(splitErrorText(caught, t))
    } finally {
      setBusyId(null)
    }
  }

  function copyLink(memberId: string, token: string) {
    const url = `${window.location.origin}/share/${token}`
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedId(memberId)
        window.setTimeout(
          () =>
            setCopiedId((current) => (current === memberId ? null : current)),
          2000,
        )
      })
      .catch(() => setError(t('errGeneric')))
  }

  async function addPerson() {
    const name = addName.trim()
    if (!name) return
    const parsed = addAmount.trim()
      ? Number(addAmount.replace(',', '.'))
      : suggested / 100
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(t('errGeneric'))
      return
    }
    await run('add', async () => {
      await addSplitMember({
        data: {
          subscriptionId,
          displayName: name,
          shareMinor: Math.round(parsed * 100),
        },
      })
      setAddName('')
      setAddAmount('')
    })
  }

  async function createLink(member: MemberView) {
    setBusyId(member.id)
    setError(null)
    try {
      const invite = await createSplitInvite({ data: { id: member.id } })
      setTokens((current) => ({ ...current, [member.id]: invite.token }))
      await refresh()
      await router.invalidate()
      copyLink(member.id, invite.token)
    } catch (caught) {
      setError(splitErrorText(caught, t))
    } finally {
      setBusyId(null)
    }
  }

  async function revokeLink(member: MemberView) {
    await run(member.id, async () => {
      await revokeSplitInvite({ data: { id: member.id } })
    })
    setTokens((current) => {
      const next = { ...current }
      delete next[member.id]
      return next
    })
  }

  const invited = people.filter((member) => member.status !== 'active')

  return (
    <Drawer open={open} onOpenChange={onOpenChange} position="right">
      <DrawerPopup variant="inset" showCloseButton className="sm:max-w-lg">
        <DrawerHeader>
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t('splitEyebrow')}
          </p>
          <DrawerTitle className="truncate">{subscription.name}</DrawerTitle>
          <DrawerDescription>
            {cycleText(t, subscription.cycleCount, subscription.cycleUnit)} ·{' '}
            {formatMinor(subscription.price, subscription.currency, locale)}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerPanel className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {members === null ? (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          ) : (
            <>
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                  <div>
                    <h3 className="text-sm font-medium">{t('splitTitle')}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t('splitCaption', { count: people.length })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-medium tabular-nums',
                      over > 0 && 'text-destructive',
                    )}
                  >
                    {over > 0
                      ? t('overBy', {
                          amount: formatMinor(
                            over,
                            subscription.currency,
                            locale,
                          ),
                        })
                      : t('percentCovered', { percent })}
                  </span>
                </div>

                <div className="h-1 w-full bg-muted">
                  <div
                    className={cn(
                      'h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none',
                      over > 0 && 'bg-destructive',
                    )}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium max-sm:px-3">
                        {t('colWho')}
                      </th>
                      <th className="w-24 px-4 py-2 font-medium max-sm:w-0 max-sm:p-0">
                        <span className="max-sm:hidden">{t('colStatus')}</span>
                      </th>
                      <th className="w-28 px-4 py-2 text-right font-medium max-sm:px-3">
                        {t('colShare')}
                      </th>
                      <th className="w-10 px-2 py-2">
                        <span className="sr-only">{t('colActions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr className="bg-muted/20">
                      <td className="px-4 py-3 max-sm:px-3">
                        <span className="flex min-w-0 items-center gap-2 font-medium">
                          <UserRound className="size-4 text-muted-foreground" />
                          {t('you')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-sm:p-0">
                        <span className="max-sm:hidden">{t('payer')}</span>
                      </td>
                      <td className="truncate px-4 py-3 text-right tabular-nums max-sm:px-3">
                        {formatMinor(ownerShare, subscription.currency, locale)}
                      </td>
                      <td />
                    </tr>

                    {people.map((member) => (
                      <tr key={member.id} className="group">
                        <td className="px-4 py-2.5 max-sm:px-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <UsersRound className="size-4 shrink-0 text-muted-foreground" />
                            {member.status === 'active' ? (
                              <span className="truncate">
                                {member.displayName}
                              </span>
                            ) : (
                              <Input
                                defaultValue={member.displayName}
                                aria-label={t('addName')}
                                className="h-7 w-full max-w-28 max-sm:max-w-20"
                                onBlur={(event) => {
                                  const name = event.target.value.trim()
                                  if (name && name !== member.displayName) {
                                    void run(member.id, () =>
                                      updateSplitMember({
                                        data: {
                                          id: member.id,
                                          displayName: name,
                                        },
                                      }),
                                    )
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.currentTarget.blur()
                                  }
                                }}
                              />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-sm:p-0">
                          <span className="max-sm:hidden">
                            <MemberBadge member={member} t={t} />
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right max-sm:px-3">
                          <AmountInput
                            member={member}
                            disabled={busyId === member.id}
                            ariaLabel={t('colShare')}
                            onCommit={(minor) => {
                              if (minor !== member.shareMinor) {
                                void run(member.id, () =>
                                  updateSplitMember({
                                    data: { id: member.id, shareMinor: minor },
                                  }),
                                )
                              }
                            }}
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t('removeMember', {
                              name: member.displayName,
                            })}
                            disabled={busyId === member.id}
                            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
                            onClick={() => setConfirmRemove(member)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}

                    <tr>
                      <td className="px-4 py-3 max-sm:px-3" colSpan={2}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            value={addName}
                            onChange={(event) => setAddName(event.target.value)}
                            placeholder={t('addName')}
                            className="h-7 w-full max-w-28"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void addPerson()
                            }}
                          />
                          <Input
                            value={addAmount}
                            onChange={(event) =>
                              setAddAmount(event.target.value)
                            }
                            placeholder={(suggested / 100).toFixed(2)}
                            inputMode="decimal"
                            className="h-7 w-full max-w-20 tabular-nums"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void addPerson()
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {over > 0
                          ? t('overBy', {
                              amount: formatMinor(
                                over,
                                subscription.currency,
                                locale,
                              ),
                            })
                          : null}
                      </td>
                      <td className="px-2 py-3">
                        <Button
                          size="icon-xs"
                          variant="outline"
                          aria-label={t('addPerson')}
                          disabled={!addName.trim() || busyId === 'add'}
                          onClick={() => void addPerson()}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                  <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    {t('yourBudget')}
                  </p>
                  <p className="mt-1 text-lg font-medium tabular-nums">
                    {formatMinor(
                      subscription.price,
                      subscription.currency,
                      locale,
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('yourBudgetCaption', {
                      covered: formatMinor(
                        allocated,
                        subscription.currency,
                        locale,
                      ),
                    })}
                  </p>
                </div>
                <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                  <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    {t('coveredByOthers')}
                  </p>
                  <p className="mt-1 text-lg font-medium tabular-nums">
                    {people.length === 0
                      ? '—'
                      : formatMinor(allocated, subscription.currency, locale)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {people.length === 0
                      ? t('coveredByOthersEmpty')
                      : t('coveredByOthersCaption', { count: people.length })}
                  </p>
                </div>
              </section>

              {invited.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    {t('links')}
                  </h3>
                  {invited.map((member) => {
                    const days = member.inviteExpiresAt
                      ? Math.max(
                          0,
                          Math.ceil(
                            (new Date(member.inviteExpiresAt).getTime() -
                              Date.now()) /
                              MS_PER_DAY,
                          ),
                        )
                      : 0
                    const open = member.status === 'invited' && days > 0
                    const held = tokens[member.id]

                    return (
                      <div
                        key={member.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
                      >
                        <Link2 className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {member.displayName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {open
                              ? t('linkExpires', { count: days })
                              : member.status === 'invited'
                                ? t('linkExpired')
                                : t('linkNone')}
                          </p>
                        </div>
                        {open ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === member.id}
                              onClick={() => {
                                if (held) copyLink(member.id, held)
                                else void createLink(member)
                              }}
                            >
                              {copiedId === member.id ? (
                                <Check className="size-3.5" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              {copiedId === member.id
                                ? t('linkCopied')
                                : held
                                  ? t('linkCopy')
                                  : t('linkNew')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === member.id}
                              onClick={() => void revokeLink(member)}
                            >
                              {t('linkRevoke')}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === member.id}
                            onClick={() => void createLink(member)}
                          >
                            <Link2 className="size-3.5" />
                            {t('linkCreate')}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </section>
              ) : null}
            </>
          )}
        </DrawerPanel>

        <Dialog
          open={confirmRemove !== null}
          onOpenChange={(next) => {
            if (!next) setConfirmRemove(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('removeTitle', { name: confirmRemove?.displayName ?? '' })}
              </DialogTitle>
              <DialogDescription>{t('removeBody')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t('cancel')}
              </DialogClose>
              <Button
                variant="destructive"
                disabled={confirmRemove !== null && busyId === confirmRemove.id}
                onClick={() => {
                  const member = confirmRemove
                  if (!member) return
                  void run(member.id, async () => {
                    await removeSplitMember({ data: { id: member.id } })
                    setConfirmRemove(null)
                  })
                }}
              >
                {t('removeConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DrawerPopup>
    </Drawer>
  )
}

function AmountInput({
  member,
  disabled,
  ariaLabel,
  onCommit,
}: {
  member: MemberView
  disabled: boolean
  ariaLabel: string
  onCommit: (minor: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      value={draft ?? (member.shareMinor / 100).toFixed(2)}
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      className="ml-auto h-7 w-20 text-right tabular-nums"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setDraft((member.shareMinor / 100).toFixed(2))}
      onBlur={() => {
        if (draft !== null) {
          const parsed = Number(draft.replace(',', '.'))
          if (Number.isFinite(parsed) && parsed >= 0) {
            onCommit(Math.round(parsed * 100))
          }
        }
        setDraft(null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function MemberBadge({
  member,
  t,
}: {
  member: MemberView
  t: SharingTranslator
}) {
  if (member.status === 'active') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" />
        {t('statusActive')}
      </Badge>
    )
  }
  if (member.status === 'invited') {
    const days = member.inviteExpiresAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(member.inviteExpiresAt).getTime() - Date.now()) /
              MS_PER_DAY,
          ),
        )
      : 0
    if (days > 0) {
      return (
        <Badge variant="outline">{t('statusInvited', { count: days })}</Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-destructive">
        {t('statusExpired')}
      </Badge>
    )
  }
  return <Badge variant="outline">{t('statusPlaceholder')}</Badge>
}
