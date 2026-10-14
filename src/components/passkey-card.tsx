import { useEffect, useState } from 'react'
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

function friendlyPasskeyMessage(message: string): string {
  if (/cancel|NotAllowedError|abort/i.test(message)) {
    return 'The browser cancelled the passkey prompt.'
  }
  if (/PREVIOUSLY_REGISTERED/.test(message)) {
    return 'This device already holds a passkey for this account.'
  }
  return message
}

export function PasskeyCard() {
  const { data: passkeys, refetch } = authClient.useListPasskeys()
  const [supported, setSupported] = useState<'unknown' | 'ok' | 'unavailable'>(
    'unknown',
  )
  const [insecureContext, setInsecureContext] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

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
        setError(
          friendlyPasskeyMessage(
            result.error.message ?? 'Could not create the passkey.',
          ),
        )
        return
      }
      setName('')
      await refetch()
    } catch (caught) {
      setError(
        friendlyPasskeyMessage(
          caught instanceof Error ? caught.message : 'Could not create it.',
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
        setError(
          friendlyPasskeyMessage(
            String(result.error.message ?? 'Could not remove it.'),
          ),
        )
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
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Sign in with Touch ID, Windows Hello or a security key — nothing to
          type, nothing to phish.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {insecureContext ? (
          <p className="text-sm text-muted-foreground">
            Passkeys need a secure context — HTTPS, or http on localhost. This
            page is being served over plain http on a network name, so browsers
            will refuse to create passkeys here.
          </p>
        ) : null}

        {supported === 'unavailable' && !insecureContext ? (
          <p className="text-sm text-muted-foreground">
            This browser does not support WebAuthn.
          </p>
        ) : null}

        {supported === 'ok' ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <Field className="max-w-xs">
                <FieldLabel htmlFor="passkey-name">Name</FieldLabel>
                <Input
                  id="passkey-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="MacBook, YubiKey, phone…"
                />
                <FieldDescription>
                  Only a label — the key itself never leaves your device.
                </FieldDescription>
              </Field>
              <Button size="sm" onClick={addPasskey} disabled={pending}>
                {pending ? 'Waiting for your device…' : 'Add a passkey'}
              </Button>
            </div>

            {(passkeys ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No passkeys yet — add one to sign in without a password.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {(passkeys ?? []).map((passkey) => (
                  <li
                    key={passkey.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {passkey.name ?? 'Passkey'}
                        {passkey.deviceType ? (
                          <span className="ml-2 align-middle">
                            <Badge variant="outline">
                              {passkey.deviceType}
                            </Badge>
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        added {new Date(passkey.createdAt).toLocaleDateString()}
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
                          Confirm remove
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDelete(passkey.id)}
                      >
                        Remove
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
