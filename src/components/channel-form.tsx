import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { createMyChannel, updateMyChannel } from '@/lib/app.functions'
import type { ChannelView } from '@/server/services/channels'

const CHANNEL_TYPES = [
  'email',
  'ntfy',
  'telegram',
  'discord',
  'webhook',
] as const

type TypeLabelKey =
  | 'typeEmail'
  | 'typeNtfy'
  | 'typeTelegram'
  | 'typeDiscord'
  | 'typeWebhook'

const TYPE_LABELS: Record<string, TypeLabelKey | undefined> = {
  email: 'typeEmail',
  ntfy: 'typeNtfy',
  telegram: 'typeTelegram',
  discord: 'typeDiscord',
  webhook: 'typeWebhook',
}

function typeLabel(type: string, t: (key: TypeLabelKey) => string): string {
  const key = TYPE_LABELS[type]
  return key ? t(key) : type
}

type FieldLabelKey =
  | 'fieldSmtpHost'
  | 'fieldPort'
  | 'fieldUsername'
  | 'fieldPassword'
  | 'fieldFrom'
  | 'fieldTo'
  | 'fieldServer'
  | 'fieldTopic'
  | 'fieldToken'
  | 'fieldBotToken'
  | 'fieldChatId'
  | 'fieldWebhookUrl'
  | 'fieldUrl'
  | 'fieldSecret'

type FieldDef = {
  key: string
  labelKey: FieldLabelKey
  placeholder?: string
  secret?: boolean
}

const TYPE_FIELDS: Record<string, FieldDef[]> = {
  email: [
    { key: 'host', labelKey: 'fieldSmtpHost', placeholder: 'smtp.example.com' },
    { key: 'port', labelKey: 'fieldPort', placeholder: '587' },
    { key: 'username', labelKey: 'fieldUsername' },
    { key: 'password', labelKey: 'fieldPassword', secret: true },
    {
      key: 'from',
      labelKey: 'fieldFrom',
      placeholder: 'subdue@example.com',
    },
    { key: 'to', labelKey: 'fieldTo', placeholder: 'you@example.com' },
  ],
  ntfy: [
    { key: 'server', labelKey: 'fieldServer', placeholder: 'https://ntfy.sh' },
    { key: 'topic', labelKey: 'fieldTopic' },
    { key: 'token', labelKey: 'fieldToken', secret: true },
  ],
  telegram: [
    { key: 'botToken', labelKey: 'fieldBotToken', secret: true },
    { key: 'chatId', labelKey: 'fieldChatId' },
  ],
  discord: [{ key: 'webhookUrl', labelKey: 'fieldWebhookUrl' }],
  webhook: [
    {
      key: 'url',
      labelKey: 'fieldUrl',
      placeholder: 'https://example.com/hook',
    },
    { key: 'secret', labelKey: 'fieldSecret', secret: true },
  ],
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  email: ['host', 'from', 'to'],
  ntfy: ['topic'],
  telegram: ['botToken', 'chatId'],
  discord: ['webhookUrl'],
  webhook: ['url'],
}

const OPTIONAL_FIELDS = ['username', 'password', 'token', 'secret']

function configString(config: ChannelView['config'], key: string): string {
  if (typeof config !== 'object' || config === null) {
    return ''
  }
  const value = (config as Record<string, unknown>)[key]
  return value === undefined || value === null ? '' : String(value)
}

export function ChannelForm({
  open,
  onOpenChange,
  channel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: ChannelView | null
}) {
  const router = useRouter()
  const t = useTranslations('channels')
  const [type, setType] = useState<string>(CHANNEL_TYPES[0])
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [secure, setSecure] = useState(false)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setError(null)
    if (channel) {
      setType(channel.type)
      setName(channel.name)
      setEnabled(channel.enabled)
      setSecure(
        channel.type === 'email'
          ? configString(channel.config, 'secure') === 'true' ||
              configString(channel.config, 'secure') === '1'
          : false,
      )
      const values: Record<string, string> = {}
      for (const field of TYPE_FIELDS[channel.type] ?? []) {
        values[field.key] = configString(channel.config, field.key)
      }
      if (values.port === '') {
        values.port = '587'
      }
      if (values.server === '') {
        values.server = 'https://ntfy.sh'
      }
      setConfig(values)
    } else {
      setType(CHANNEL_TYPES[0])
      setName('')
      setEnabled(true)
      setSecure(false)
      setConfig({ port: '587', server: 'https://ntfy.sh' })
    }
  }, [open, channel])

  function setValue(key: string, value: string) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError(t('errName'))
      return
    }
    const missing = (REQUIRED_FIELDS[type] ?? []).filter(
      (key) => !(config[key] ?? '').trim(),
    )
    if (missing.length > 0) {
      const labels = missing.map((key) => {
        const field = (TYPE_FIELDS[type] ?? []).find(
          (entry) => entry.key === key,
        )
        return field ? t(field.labelKey) : key
      })
      setError(t('errMissing', { fields: labels.join(', ') }))
      return
    }

    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      if (OPTIONAL_FIELDS.includes(key) && !value.trim()) {
        continue
      }
      payload[key] = value.trim()
    }
    if (type === 'email') {
      payload.port = Number(payload.port ?? 587)
      payload.secure = secure
    }

    setPending(true)
    try {
      if (channel) {
        await updateMyChannel({
          data: { id: channel.id, name: name.trim(), config: payload, enabled },
        })
      } else {
        await createMyChannel({
          data: {
            type: type as (typeof CHANNEL_TYPES)[number],
            name: name.trim(),
            config: payload,
            enabled,
          },
        })
      }
      await router.invalidate()
      onOpenChange(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('errGeneric')
      setError(
        message.includes('CHANNEL_CONFIG_INVALID') ? t('errConfig') : message,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {channel
              ? t('formEditTitle', { name: channel.name })
              : t('addChannel')}
          </DialogTitle>
          <DialogDescription>{t('formDescription')}</DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="channel-name">{t('name')}</FieldLabel>
              <Input
                id="channel-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('namePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel>{t('type')}</FieldLabel>
              {channel ? (
                <Input readOnly value={typeLabel(type, t)} />
              ) : (
                <Select
                  value={type}
                  onValueChange={(value) => setType(String(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {typeLabel(option, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          {(TYPE_FIELDS[type] ?? []).map((field) => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`channel-${field.key}`}>
                {t(field.labelKey)}
              </FieldLabel>
              <Input
                id={`channel-${field.key}`}
                type={field.secret ? 'password' : 'text'}
                value={config[field.key] ?? ''}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
              />
            </Field>
          ))}

          {type === 'email' ? (
            <Field orientation="horizontal">
              <Switch checked={secure} onCheckedChange={setSecure} />
              <FieldLabel>{t('fieldSecure')}</FieldLabel>
            </Field>
          ) : null}

          <Field orientation="horizontal">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <FieldLabel>{t('fieldEnabled')}</FieldLabel>
          </Field>
        </FieldGroup>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
