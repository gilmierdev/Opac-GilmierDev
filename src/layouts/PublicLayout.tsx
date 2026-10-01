import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LibraryBig, Lock, X, BookMarked, RefreshCw } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { imageUrl } from '../lib/utils'

interface PublicLayoutProps {
  children: ReactNode
  showBack?: boolean
}

export default function PublicLayout({ children, showBack = false }: PublicLayoutProps) {
  const settings = useAppStore((s) => s.settings)
  const mode = useAppStore((s) => s.mode)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const logo = imageUrl(settings.library_logo)
  const location = useLocation()
  const isUser = mode === 'user'
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const updated = await window.api.settings.getAll()
      useAppStore.getState().setSettings(updated)
    } catch {
      // ignore
    }
    triggerRefresh()
    setTimeout(() => setRefreshing(false), 500)
  }

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-surface/80 backdrop-blur-xl dark:border-slate-700/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/catalog" className="ring-focus group flex items-center gap-3">
            {logo ? (
              <img
                src={logo}
                alt={`${settings.library_name} logo`}
                className="h-10 w-10 rounded-xl object-cover shadow-card ring-1 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-800 shadow-glow transition-shadow group-hover:shadow-lifted">
                <LibraryBig className="h-5 w-5 text-white" />
              </span>
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-foreground">{settings.library_name}</span>
              <span className="flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-400">
                <BookMarked className="h-3 w-3" />
                Online Catalog
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {showBack && (
              <button
                onClick={() => history.back()}
                className="ring-focus inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-foreground hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <X className="mr-1 h-3.5 w-3.5" /> Back
              </button>
            )}
            {isUser ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-300">
                  <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_0_3px_rgb(34_197_94/0.2)] animate-pulse" />
                  Live Catalog
                </span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="ring-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-foreground shadow-card transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
                  title="Refresh catalog data"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-primary-500 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            ) : (
              <Link
                to="/admin/login"
                state={{ from: location.pathname }}
                className="ring-focus inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-card transition-colors hover:bg-primary-700"
              >
                <Lock className="h-3.5 w-3.5" />
                Admin Login
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      {isUser && (
        <footer className="border-t border-slate-200 dark:border-slate-700">
          <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-4 text-center text-xs text-muted sm:px-6">
            <LibraryBig className="h-3.5 w-3.5 text-primary-400" />
            © 2026 GilmierDev · Powered by OPAC Library System
          </p>
        </footer>
      )}
    </div>
  )
}