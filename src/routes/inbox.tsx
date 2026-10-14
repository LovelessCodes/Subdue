import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getInbox, markInboxRead } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'

export const Route = createFileRoute('/inbox')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    return { inbox: await getInbox() }
  },
  component: Inbox,
})

function Inbox() {
  const { inbox } = Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function markAll() {
    setPending(true)
    try {
      await markInboxRead({ data: {} })
      await router.invalidate()
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Inbox</CardTitle>
                <CardDescription>
                  {inbox.unread} unread of {inbox.items.length} reminders
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={markAll}
                disabled={pending || inbox.unread === 0}
              >
                Mark all read
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {inbox.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing here yet — reminders about upcoming and overdue charges
                land here.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {inbox.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-sm ${
                          item.readAt ? 'text-muted-foreground' : 'font-medium'
                        }`}
                      >
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                    {item.readAt ? null : <Badge>new</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
