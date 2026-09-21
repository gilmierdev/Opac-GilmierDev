import { Link } from 'react-router-dom'
import { LibraryBig, Lock, BookOpenText, Search, Server } from 'lucide-react'
import { useAppStore } from '../../stores/app'
import { imageUrl, serverLabel } from '../../lib/utils'

export default function StartScreen() {
  const settings = useAppStore((s) => s.settings)
  const mode = useAppStore((s) => s.mode)
  const connection = useAppStore((s) => s.connection)
  const logo = imageUrl(settings.library_logo)
  const isUser = mode === 'user'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app px-6">
      <div className="animate-fade-in w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          {logo ? (
            <img
              src={logo}
              alt={`${settings.library_name} logo`}
              className="h-28 w-28 rounded-2xl object-cover shadow-lifted"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-lifted">
              <LibraryBig className="h-14 w-14 text-white" />
            </div>
          )}
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {settings.library_name}
        </h1>
        <p className="mt-1 text-lg font-medium text-primary-600 dark:text-primary-400">
          OPAC Library Catalog System
        </p>
        <p className="mx-auto mt-4 max-w-sm text-sm text-muted">
          Search and explore the library's book collection directly from the catalog.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            to="/catalog"
            className="ring-focus group inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-primary-700"
          >
            <BookOpenText className="h-5 w-5" />
            Browse the Catalog
          </Link>
          {isUser ? (
            <Link
              to="/connect"
              className="ring-focus group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-surface px-6 py-3.5 text-sm font-semibold text-foreground shadow-card transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <Server className="h-4 w-4" />
              {connection ? `Change Server (${serverLabel(connection.host, connection.port)})` : 'Connect to a Server'}
            </Link>
          ) : (
            <Link
              to="/admin/login"
              className="ring-focus group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-surface px-6 py-3.5 text-sm font-semibold text-foreground shadow-card transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <Lock className="h-4 w-4" />
              Admin Login
            </Link>
          )}
        </div>

        <div className="mt-10 flex items-center justify-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            {isUser ? 'Remote catalog' : 'Local catalog'}
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span>{isUser ? (connection ? `Server ${serverLabel(connection.host, connection.port)}` : 'Not connected') : 'Works offline'}</span>
        </div>
      </div>
    </div>
  )
}