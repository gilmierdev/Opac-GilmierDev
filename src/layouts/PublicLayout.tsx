import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LibraryBig, Lock, Server, X } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { imageUrl, serverLabel } from '../lib/utils'

interface PublicLayoutProps {
  children: ReactNode
  onCloseCatalog?: () => void
  showBack?: boolean
}

export default function PublicLayout({ children, showBack = false }: PublicLayoutProps) {
  const settings = useAppStore((s) => s.settings)
  const mode = useAppStore((s) => s.mode)
  const connection = useAppStore((s) => s.connection)
  const logo = imageUrl(settings.library_logo)
  const location = useLocation()
  const isUser = mode === 'user'

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-surface/90 backdrop-blur dark:border-slate-700">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/catalog" className="ring-focus flex items-center gap-3">
            {logo ? (
              <img
                src={logo}
                alt={`${settings.library_name} logo`}
                className="h-9 w-9 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-800">
                <LibraryBig className="h-5 w-5 text-white" />
              </span>
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">{settings.library_name}</span>
              <span className="text-[11px] text-muted">OPAC Catalog</span>
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
              <Link
                to="/connect"
                className="ring-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                <Server className="h-3.5 w-3.5" />
                {connection ? serverLabel(connection.host, connection.port) : 'Connect'}
              </Link>
            ) : (
              <Link
                to="/admin/login"
                state={{ from: location.pathname }}
                className="ring-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                <Lock className="h-3.5 w-3.5" />
                Admin Login
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 dark:border-slate-700">
        <p className="mx-auto max-w-7xl px-4 py-3 text-center text-xs text-muted sm:px-6">
          © 2026 GilmierDev
        </p>
      </footer>
    </div>
  )
}