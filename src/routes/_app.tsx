import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getDashboard, getInbox } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { AppShell } from '@/components/app-shell'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    const [dashboard, inbox] = await Promise.all([getDashboard(), getInbox()])
    return {
      user: session.user,
      counts: {
        '/': dashboard.overdueCount,
        '/calendar': dashboard.upcoming.length,
        '/subscriptions': dashboard.subscriptionCount,
        '/inbox': inbox.unread,
      },
    }
  },
  component: AppLayout,
})

/** Everything behind the sign-in wall shares one shell. */
function AppLayout() {
  const { user, counts } = Route.useRouteContext()
  return (
    <AppShell isAdmin={user.role === 'admin'} counts={counts}>
      <Outlet />
    </AppShell>
  )
}
