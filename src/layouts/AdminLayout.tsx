import { useEffect } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  PlusCircle,
  Users,
  Tags,
  Building2,
  Repeat,
  Settings,
  LogOut,
  LibraryBig,
  ExternalLink,
  Moon,
  Sun
} from 'lucide-react'
import { useAppStore, applyTheme } from '../stores/app'
import { classNames, imageUrl, errorMessage } from '../lib/utils'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/books', label: 'All Books', icon: BookOpen, end: false },
  { to: '/admin/books/new', label: 'Add Book', icon: PlusCircle, end: false },
  { to: '/admin/authors', label: 'Authors', icon: Users, end: false },
  { to: '/admin/categories', label: 'Categories', icon: Tags, end: false },
  { to: '/admin/publishers', label: 'Publishers', icon: Building2, end: false },
  { to: '/admin/borrowings', label: 'Borrowings', icon: Repeat, end: false },
  { to: '/admin/settings', label: 'Settings', icon: Settings, end: false }
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const user = useAppStore((s) => s.user)
  const settings = useAppStore((s) => s.settings)
  const logo = imageUrl(settings.library_logo)
  const theme = settings.theme ?? 'light'

  useEffect(() => {
    if (!user) {
      void window.api.auth.session().then((session) => {
        useAppStore.getState().setUser(session)
        if (!session) navigate('/admin/login', { replace: true })
      })
    }
  }, [user, navigate])

  const handleLogout = async () => {
    try {
      await window.api.auth.logout()
    } catch (err) {
      console.error(errorMessage(err))
    }
    useAppStore.getState().setUser(null)
    navigate('/admin/login', { replace: true })
  }

  const toggleTheme = async (next: 'light' | 'dark') => {
    useAppStore.getState().setSettings({ ...settings, theme: next })
    applyTheme(next)
    void window.api.settings.set('theme', next).catch((err) => console.error(errorMessage(err)))
  }

  return (
    <div className="flex min-h-screen bg-app">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-surface dark:border-slate-700">
        <Link to="/" className="ring-focus flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          {logo ? (
            <img src={logo} alt="Library logo" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-800">
              <LibraryBig className="h-5 w-5 text-white" />
            </span>
          )}
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground">
            {settings.library_name}
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                classNames(
                  'ring-focus flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <button
            onClick={() => toggleTheme(theme === 'dark' ? 'light' : 'dark')}
            className="ring-focus flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <Link
            to="/catalog"
            className="ring-focus flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" />
            Public catalog
          </Link>
          {user && (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {user.full_name ?? user.username}
                </p>
                <p className="truncate text-[11px] text-muted">@{user.username}</p>
              </div>
              <button
                onClick={handleLogout}
                className="ring-focus shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="ml-60 flex-1">
        <main className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}