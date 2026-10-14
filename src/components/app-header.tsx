import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

const linkClass =
  'rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'
const activeClass = 'rounded-md px-3 py-1.5 bg-muted text-foreground'

export function AppHeader() {
  async function signOut() {
    await authClient.signOut()
    window.location.assign('/sign-in')
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-6 py-4">
        <span className="font-semibold">Subdue</span>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <Link
            to="/"
            className={linkClass}
            activeProps={{ className: activeClass }}
            activeOptions={{ exact: true }}
          >
            Dashboard
          </Link>
          <Link
            to="/calendar"
            className={linkClass}
            activeProps={{ className: activeClass }}
          >
            Calendar
          </Link>
          <Link
            to="/subscriptions"
            className={linkClass}
            activeProps={{ className: activeClass }}
          >
            Subscriptions
          </Link>
          <Link
            to="/inbox"
            className={linkClass}
            activeProps={{ className: activeClass }}
          >
            Inbox
          </Link>
          <Link
            to="/settings"
            className={linkClass}
            activeProps={{ className: activeClass }}
          >
            Settings
          </Link>
          <Link
            to="/integrations"
            className={linkClass}
            activeProps={{ className: activeClass }}
          >
            Integrations
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </nav>
      </div>
    </header>
  )
}
