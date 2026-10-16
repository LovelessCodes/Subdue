import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'use-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

function friendlyPasskeyError(
  message: string,
): 'cancelled' | 'alreadyRegistered' | null {
  if (/cancel|NotAllowedError|abort/i.test(message)) {
    return 'cancelled'
  }
  if (/PREVIOUSLY_REGISTERED/.test(message)) {
    return 'alreadyRegistered'
  }
  return null
}

export function PasskeyCard() {
  const t = useTranslations('passkey')
  const locale = useLocale()
  const { data: passkeys, refetch } = authClient.useListPasskeys()
  const [supported, setSupported] = useState<'unknown' | 'ok' | 'unavailable'>(
    'unknown',
  )
  const [insecureContext, setInsecureContext] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function friendly(message: string): string {
    const key = friendlyPasskeyError(message)
    return key === null ? message : t(key)
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    setInsecureContext(!window.isSecureContext)
    setSupported(
      window.isSecureContext && window.PublicKeyCredential
        ? 'ok'
        : 'unavailable',
    )
  }, [])

  async function addPasskey() {
    setPending(true)
    setError(null)
    try {
      const result = await authClient.passkey.addPasskey({
        name: name.trim() || undefined,
      })
      if (result?.error) {
        setError(friendly(result.error.message ?? t('errCreate')))
        return
      }
      setName('')
      await refetch()
    } catch (caught) {
      setError(
        friendly(
          caught instanceof Error ? caught.message : t('errCreateShort'),
        ),
      )
    } finally {
      setPending(false)
    }
  }

  async function removePasskey(id: string) {
    setPending(true)
    setError(null)
    try {
      const result = await authClient.$fetch('/passkey/delete-passkey', {
        method: 'POST',
        body: { id },
      })
      if (result && 'error' in result && result.error) {
        setError(friendly(String(result.error.message ?? t('errRemove'))))
        return
      }
      setConfirmDelete(null)
      await refetch()
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {insecureContext ? (
          <p className="text-sm text-muted-foreground">{t('insecure')}</p>
        ) : null}

        {supported === 'unavailable' && !insecureContext ? (
          <p className="text-sm text-muted-foreground">{t('unsupported')}</p>
        ) : null}

        {supported === 'ok' ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <Field className="max-w-xs">
                <FieldLabel htmlFor="passkey-name">{t('name')}</FieldLabel>
                <Input
                  id="passkey-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('namePlaceholder')}
                />
                <FieldDescription>{t('nameHelp')}</FieldDescription>
              </Field>
              <Button size="sm" onClick={addPasskey} disabled={pending}>
                {pending ? t('waiting') : t('add')}
              </Button>
            </div>

            {(passkeys ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {(passkeys ?? []).map((passkey) => (
                  <li
                    key={passkey.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {passkey.name ?? t('defaultName')}
                        {passkey.deviceType ? (
                          <span className="ml-2 align-middle">
                            <Badge variant="outline">
                              {passkey.deviceType === 'singleDevice'
                                ? t('deviceSingle')
                                : passkey.deviceType === 'multiDevice'
                                  ? t('deviceMulti')
                                  : passkey.deviceType}
                            </Badge>
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('addedOn', {
                          date: new Intl.DateTimeFormat(locale).format(
                            new Date(passkey.createdAt),
                          ),
                        })}
                      </p>
                    </div>
                    {confirmDelete === passkey.id ? (
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={pending}
                          onClick={() => removePasskey(passkey.id)}
                        >
                          {t('confirmRemove')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(null)}
                        >
                          {t('keep')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDelete(passkey.id)}
                      >
                        {t('remove')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
