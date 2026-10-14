import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function AppHeader() {
  async function signOut() {
    await authClient.signOut()
    window.location.assign('/sign-in')
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
        <span className="font-semibold">Subdue</span>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            activeProps={{
              className: 'rounded-md px-3 py-1.5 bg-muted text-foreground',
            }}
            activeOptions={{ exact: true }}
          >
            Dashboard
          </Link>
          <Link
            to="/subscriptions"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            activeProps={{
              className: 'rounded-md px-3 py-1.5 bg-muted text-foreground',
            }}
          >
            Subscriptions
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </nav>
      </div>
    </header>
  )
}
