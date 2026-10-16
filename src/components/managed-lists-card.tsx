import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from '@tanstack/react-router'
import { GripVertical } from 'lucide-react'
import { useTranslations } from 'use-intl'
import { cn } from 'cn'
import { PaymentMethodIcon } from '@/components/payment-method-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  archiveMyCategory,
  archiveMyPaymentMethod,
  createMyCategory,
  createMyPaymentMethod,
  listMyCategories,
  listMyPaymentMethods,
  purgeMyCategory,
  purgeMyPaymentMethod,
  reorderMyCategories,
  reorderMyPaymentMethods,
  restoreMyCategory,
  restoreMyPaymentMethod,
  updateMyCategory,
  updateMyPaymentMethod,
} from '@/lib/app.functions'

/** New categories cycle this, so a fresh list does not come out one colour. */
const PALETTE = [
  '#7c3aed',
  '#0369a1',
  '#0f766e',
  '#b45309',
  '#be123c',
  '#15803d',
  '#4f46e5',
  '#a21caf',
]

export type ManagedRow = {
  id: string
  name: string
  color?: string | null
  icon?: string | null
  archivedAt?: string | Date | null
}

type ListApi = {
  load: () => Promise<ManagedRow[]>
  create: (name: string, color: string | null) => Promise<unknown>
  rename: (id: string, name: string) => Promise<unknown>
  archive: (id: string) => Promise<unknown>
  restore: (id: string) => Promise<unknown>
  reorder: (ids: string[]) => Promise<unknown>
  purge: (id: string) => Promise<{ status: string; references?: number }>
}

const CATEGORY_API: ListApi = {
  load: () => listMyCategories({ data: { includeArchived: true } }),
  create: (name, color) => createMyCategory({ data: { name, color } }),
  rename: (id, name) => updateMyCategory({ data: { id, name } }),
  archive: (id) => archiveMyCategory({ data: { id } }),
  restore: (id) => restoreMyCategory({ data: { id } }),
  reorder: (ids) => reorderMyCategories({ data: { ids } }),
  purge: (id) => purgeMyCategory({ data: { id } }),
}

const PAYMENT_API: ListApi = {
  load: () => listMyPaymentMethods({ data: { includeArchived: true } }),
  create: (name) => createMyPaymentMethod({ data: { name } }),
  rename: (id, name) => updateMyPaymentMethod({ data: { id, name } }),
  archive: (id) => archiveMyPaymentMethod({ data: { id } }),
  restore: (id) => restoreMyPaymentMethod({ data: { id } }),
  reorder: (ids) => reorderMyPaymentMethods({ data: { ids } }),
  purge: (id) => purgeMyPaymentMethod({ data: { id } }),
}

function message(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback
}

export function ManagedListsCard() {
  const t = useTranslations('managedLists')
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-10">
        <ManagedList
          title={t('categories')}
          placeholder={t('categoriesPlaceholder')}
          showSwatch="color"
          api={CATEGORY_API}
        />
        <ManagedList
          title={t('paymentMethods')}
          placeholder={t('paymentMethodsPlaceholder')}
          showSwatch="icon"
          api={PAYMENT_API}
        />
      </CardContent>
    </Card>
  )
}

function ManagedList({
  title,
  placeholder,
  showSwatch,
  api,
}: {
  title: string
  placeholder: string
  showSwatch: 'color' | 'icon'
  api: ListApi
}) {
  const router = useRouter()
  const t = useTranslations('managedLists')
  const [rows, setRows] = useState<ManagedRow[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{
    id: string
    references: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    let live = true
    api
      .load()
      .then((items) => {
        if (live) setRows(items)
      })
      .catch((caught) => {
        if (live) setError(message(caught, t('errGeneric')))
      })
    return () => {
      live = false
    }
  }, [api, t])

  const active = (rows ?? []).filter((row) => !row.archivedAt)
  const archived = (rows ?? []).filter((row) => row.archivedAt)

  async function reload() {
    setRows(await api.load())
  }

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await action()
      await reload()
      await router.invalidate()
    } catch (caught) {
      setError(message(caught, t('errGeneric')))
    } finally {
      setPending(false)
    }
  }

  async function add() {
    const name = newName.trim()
    if (!name) return
    const color =
      showSwatch === 'color'
        ? (PALETTE[(rows?.length ?? 0) % PALETTE.length] ?? null)
        : null
    await run(async () => {
      await api.create(name, color)
      setNewName('')
    })
  }

  function commitEdit(id: string, name: string) {
    setEditingId(null)
    const trimmed = name.trim()
    const row = rows?.find((entry) => entry.id === id)
    if (!trimmed || !row || trimmed === row.name) return
    void run(() => api.rename(id, trimmed))
  }

  async function purge(id: string) {
    setPending(true)
    setError(null)
    setBlocked(null)
    try {
      const result = await api.purge(id)
      if (result.status === 'in-use') {
        setConfirmId(null)
        setBlocked({ id, references: result.references ?? 0 })
        return
      }
      setConfirmId(null)
      await reload()
      await router.invalidate()
    } catch (caught) {
      setError(message(caught, t('errGeneric')))
    } finally {
      setPending(false)
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event
    if (!rows || !over || dragged.id === over.id) return
    const from = active.findIndex((row) => row.id === String(dragged.id))
    const to = active.findIndex((row) => row.id === String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(active, from, to)
    const previous = rows
    setRows([...next, ...archived])
    api.reorder(next.map((row) => row.id)).catch((caught) => {
      setRows(previous)
      setError(message(caught, t('errGeneric')))
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {archived.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived
              ? t('hideArchived')
              : t('showArchived', { count: archived.length })}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={active.map((row) => row.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col divide-y overflow-hidden rounded-md border">
              {active.map((row) => (
                <ActiveRow
                  key={row.id}
                  row={row}
                  showSwatch={showSwatch}
                  pending={pending}
                  editingId={editingId}
                  onStartEdit={() => setEditingId(row.id)}
                  onCommitEdit={(name) => commitEdit(row.id, name)}
                  onArchive={() => void run(() => api.archive(row.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {showArchived && archived.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-md border border-dashed">
          {archived.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Swatch row={row} showSwatch={showSwatch} muted />
                <span className="truncate text-sm text-muted-foreground">
                  {row.name}
                </span>
                <Badge variant="outline">{t('archived')}</Badge>
              </span>
              {confirmId === row.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('deleteConfirm')}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => void purge(row.id)}
                  >
                    {t('delete')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmId(null)}
                  >
                    {t('keep')}
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void run(() => api.restore(row.id))}
                  >
                    {t('restore')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmId(row.id)
                      setBlocked(null)
                    }}
                  >
                    {t('deleteDots')}
                  </Button>
                </span>
              )}
              {blocked?.id === row.id ? (
                <p className="w-full text-xs text-muted-foreground">
                  {t('inUse', { count: blocked.references })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          value={newName}
          placeholder={placeholder}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void add()
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={pending || newName.trim() === ''}
          onClick={() => void add()}
        >
          {t('add')}
        </Button>
      </div>
    </section>
  )
}

function Swatch({
  row,
  showSwatch,
  muted = false,
}: {
  row: ManagedRow
  showSwatch: 'color' | 'icon'
  muted?: boolean
}) {
  if (showSwatch === 'icon') {
    return (
      <PaymentMethodIcon
        icon={row.icon ?? null}
        className={cn(muted && 'opacity-60')}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-3 shrink-0 rounded-full',
        !row.color && 'bg-muted-foreground/50',
        muted && 'opacity-60',
      )}
      style={row.color ? { backgroundColor: row.color } : undefined}
    />
  )
}

function ActiveRow({
  row,
  showSwatch,
  pending,
  editingId,
  onStartEdit,
  onCommitEdit,
  onArchive,
}: {
  row: ManagedRow
  showSwatch: 'color' | 'icon'
  pending: boolean
  editingId: string | null
  onStartEdit: () => void
  onCommitEdit: (name: string) => void
  onArchive: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id })
  const t = useTranslations('managedLists')
  const isEditing = editingId === row.id
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 px-2 py-2',
        isDragging && 'relative z-10 bg-background opacity-90 shadow-sm',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('reorderAria', { name: row.name })}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <GripVertical className="size-4" />
      </button>
      <Swatch row={row} showSwatch={showSwatch} />
      {isEditing ? (
        <Input
          ref={inputRef}
          className="h-7 max-w-xs"
          defaultValue={row.name}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              event.currentTarget.value = row.name
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => onCommitEdit(event.currentTarget.value)}
        />
      ) : (
        <button
          type="button"
          title={t('renameTitle')}
          className="min-w-0 flex-1 truncate rounded px-1 text-left text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onStartEdit}
        >
          {row.name}
        </button>
      )}
      <Button variant="ghost" size="sm" disabled={pending} onClick={onArchive}>
        {t('archive')}
      </Button>
    </li>
  )
}
