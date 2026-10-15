import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getBudget, getDashboard, getInbox } from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import { AppShell } from '@/components/app-shell'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    const [dashboard, budget, inbox] = await Promise.all([
      getDashboard(),
      getBudget(),
      getInbox(),
    ])
    return {
      user: session.user,
      counts: {
        '/': dashboard.overdueCount,
        '/calendar': dashboard.upcoming.length,
        '/subscriptions': dashboard.subscriptionCount,
        '/inbox': inbox.unread,
      },
      budget,
    }
  },
  component: AppLayout,
})

/** Everything behind the sign-in wall shares one shell. */
function AppLayout() {
  const { user, counts, budget } = Route.useRouteContext()
  return (
    <AppShell isAdmin={user.role === 'admin'} counts={counts} budget={budget}>
      <Outlet />
    </AppShell>
  )
}
