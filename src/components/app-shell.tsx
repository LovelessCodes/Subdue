import type { ReactNode } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import {
  BellRing,
  CalendarDays,
  CreditCard,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BudgetSummary } from '@/components/budget-summary'
import { SubdueMark } from '@/components/subdue-mark'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Drawer,
  DrawerPanel,
  DrawerPopup,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Menu as UserMenu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const PRIMARY = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/subscriptions', label: 'Subscriptions', Icon: CreditCard },
  { to: '/inbox', label: 'Inbox', Icon: Inbox },
] as const

const SECONDARY = [
  { to: '/channels', label: 'Channels', Icon: BellRing },
  { to: '/integrations', label: 'Integrations', Icon: Plug },
  { to: '/settings', label: 'Settings', Icon: Settings },
  { to: '/admin', label: 'Admin', Icon: ShieldCheck },
] as const

function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={
        'flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center ' +
        (className ?? '')
      }
    >
      <SubdueMark className="size-6 shrink-0" />
      <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
        Subdue
      </span>
    </span>
  )
}

function NavItem({
  entry,
  counts,
}: {
  entry: (typeof PRIMARY)[number] | (typeof SECONDARY)[number]
  counts: Record<string, number>
}) {
  const matchRoute = useMatchRoute()
  const active = Boolean(matchRoute({ to: entry.to, fuzzy: entry.to !== '/' }))
  const count = counts[entry.to] ?? 0

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={entry.to} aria-label={entry.label} />}
        isActive={active}
        tooltip={entry.label}
      >
        <entry.Icon />
        <span className="truncate">{entry.label}</span>
        {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

async function signOut() {
  await authClient.signOut()
  window.location.assign('/sign-in')
}

function AccountRows({ name, email }: { name: string; email: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium uppercase">
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <span className="block truncate text-xs leading-tight font-medium">
          {name}
        </span>
        <span className="block truncate text-[11px] leading-tight text-muted-foreground">
          {email}
        </span>
      </span>
    </span>
  )
}

function SignOutRow() {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={signOut}
      >
        <LogOut />
        <span>Sign out</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** The app chrome: a rail that collapses to icons, a bottom drawer on phones. */
export function AppShell({
  isAdmin,
  counts,
  budget,
  children,
}: {
  isAdmin: boolean
  counts: Record<string, number>
  budget: Parameters<typeof BudgetSummary>[0]['budget']
  children: ReactNode
}) {
  const session = authClient.useSession()
  const secondary = isAdmin
    ? SECONDARY
    : SECONDARY.filter((entry) => entry.to !== '/admin')
  const name = session.data?.user.name ?? ''
  const email = session.data?.user.email ?? ''

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-3">
          <Wordmark />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Track</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {PRIMARY.map((entry) => (
                  <NavItem key={entry.to} entry={entry} counts={counts} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Configure</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {secondary.map((entry) => (
                  <NavItem key={entry.to} entry={entry} counts={counts} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-0 p-0 pb-2">
          <div className="px-3 pb-2 group-data-[collapsible=icon]:hidden">
            <BudgetSummary budget={budget} />
          </div>

          <div className="px-3">
            <UserMenu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Account menu"
                    className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                  />
                }
              >
                <AccountRows name={name} email={email} />
              </MenuTrigger>
              <MenuPopup side="top" align="start" className="w-56">
                <MenuGroup>
                  <MenuGroupLabel>{email}</MenuGroupLabel>
                  <MenuItem
                    render={<Link to="/settings" aria-label="Settings" />}
                  >
                    Settings
                  </MenuItem>
                </MenuGroup>
                <MenuSeparator />
                <MenuItem variant="destructive" closeOnClick onClick={signOut}>
                  <LogOut />
                  Sign out
                </MenuItem>
              </MenuPopup>
            </UserMenu>
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="hidden md:inline-flex" />
          <Drawer>
            <DrawerTrigger
              render={
                <button
                  type="button"
                  aria-label="Open navigation"
                  className="-ml-1.5 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground md:hidden"
                />
              }
            >
              <Menu className="size-4.5" />
            </DrawerTrigger>
            <DrawerPopup>
              <DrawerPanel className="px-5 pt-2 pb-6">
                <Wordmark className="mb-4" />
                <SidebarMenu>
                  {PRIMARY.map((entry) => (
                    <NavItem key={entry.to} entry={entry} counts={counts} />
                  ))}
                </SidebarMenu>
                <div className="my-3 h-px bg-border" />
                <SidebarMenu>
                  {secondary.map((entry) => (
                    <NavItem key={entry.to} entry={entry} counts={counts} />
                  ))}
                </SidebarMenu>
                <div className="mt-4 border-t pt-2">
                  <SidebarMenu>
                    <SignOutRow />
                  </SidebarMenu>
                </div>
                <div className="mt-4">
                  <BudgetSummary budget={budget} />
                </div>

                <div className="mt-3 flex items-center gap-2.5 px-2">
                  <AccountRows name={name} email={email} />
                </div>
              </DrawerPanel>
            </DrawerPopup>
          </Drawer>
          <span className="text-sm font-medium md:hidden">Subdue</span>
          <div className="ml-auto flex items-center">
            <ThemeToggle />
          </div>
        </header>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          {children}
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}
