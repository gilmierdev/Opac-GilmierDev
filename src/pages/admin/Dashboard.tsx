import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Layers,
  CheckCircle2,
  Repeat,
  AlertTriangle,
  Users,
  Tags,
  Building2,
  Clock,
  Network as NetworkIcon,
  Server
} from 'lucide-react'
import { useAppStore } from '../../stores/app'
import Spinner from '../../components/ui/Spinner'
import BookCover from '../../components/BookCover'
import Badge from '../../components/ui/Badge'
import type { DashboardStats, Book, ServerStatus } from '@shared/types'
import { formatDate, errorMessage, classNames } from '../../lib/utils'

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  to
}: {
  label: string
  value: number
  icon: React.ElementType
  tone: string
  to?: string
}) {
  const inner = (
    <div
      className={classNames(
        'flex items-start justify-between rounded-xl border p-4 shadow-card dark:border-slate-700',
        tone
      )}
    >
      <div>
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      </div>
      <span className="rounded-lg bg-surface p-2 shadow-sm">
        <Icon className="h-5 w-5 text-primary-500" />
      </span>
    </div>
  )
  if (to) {
    return (
      <Link to={to} className="ring-focus block">
        {inner}
      </Link>
    )
  }
  return inner
}

export default function Dashboard() {
  const user = useAppStore((s) => s.user)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [server, setServer] = useState<ServerStatus | null>(null)

  useEffect(() => {
    void window.api.books
      .stats()
      .then(setStats)
      .catch((err) => setError(errorMessage(err)))
    window.api.network
      .status()
      .then(setServer)
      .catch(() => setServer(null))
  }, [])

  if (error) {
    return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
  }
  if (!stats) return <Spinner label="Loading dashboard..." full />

  const recent = stats.recentBooks.slice(0, 6)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome{user ? ` back, ${user.full_name ?? user.username}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted">Here's what's happening in your library today.</p>
      </div>

      <Link
        to="/admin/network"
        className="ring-focus flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-surface p-4 shadow-card dark:border-slate-700"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-primary-50 p-2 dark:bg-primary-900/30">
            <NetworkIcon className="h-5 w-5 text-primary-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Network Server</p>
            <p className="text-xs text-muted">
              {server ? (
                server.running ? (
                  <>Online · {server.connectedUsers} connected user{server.connectedUsers === 1 ? '' : 's'}</>
                ) : (
                  'Offline — start sharing your catalog'
                )
              ) : (
                'Status unavailable'
              )}
            </p>
          </div>
        </div>
        {server?.running ? (
          <Badge tone="success" icon={Server}>Online</Badge>
        ) : (
          <Badge tone="muted" icon={Server}>Offline</Badge>
        )}
      </Link>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Total Books" value={stats.totalBooks} icon={BookOpen} tone="bg-orange-50 dark:bg-slate-800/60" to="/admin/books" />
        <StatCard label="Total Copies" value={stats.totalCopies} icon={Layers} tone="bg-sky-50 dark:bg-slate-800/60" to="/admin/books" />
        <StatCard label="Available" value={stats.availableCopies} icon={CheckCircle2} tone="bg-green-50 dark:bg-slate-800/60" to="/admin/books" />
        <StatCard label="On Loan" value={stats.borrowedCopies} icon={Repeat} tone="bg-amber-50 dark:bg-slate-800/60" to="/admin/borrowings" />
        <StatCard label="Authors" value={stats.authors} icon={Users} tone="bg-purple-50 dark:bg-slate-800/60" to="/admin/authors" />
        <StatCard label="Categories" value={stats.categories} icon={Tags} tone="bg-teal-50 dark:bg-slate-800/60" to="/admin/categories" />
        <StatCard label="Publishers" value={stats.publishers} icon={Building2} tone="bg-indigo-50 dark:bg-slate-800/60" to="/admin/publishers" />
        <StatsOverdue value={stats.overdueBooks} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-surface p-5 shadow-card dark:border-slate-700">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Clock className="h-4 w-4 text-primary-500" /> Recently Added Books
          </h2>
          <Link to="/admin/books" className="ring-focus text-sm font-medium text-primary-600 hover:underline dark:text-primary-300">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No books yet.{' '}
            <Link to="/admin/books/new" className="text-primary-600 hover:underline dark:text-primary-300">
              Add your first book
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((book: Book) => (
              <li key={book.id}>
                <Link to={`/admin/books/${book.id}/edit`} className="ring-focus flex items-center gap-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <BookCover filename={book.cover_image} title={book.title} sizes="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{book.title}</p>
                    <p className="text-xs text-muted">
                      {book.author_name ?? 'Unknown Author'} · {book.category_name ?? 'Uncategorized'}
                    </p>
                  </div>
                  <div className="text-right">
                    {book.available ? (
                      <Badge tone="success">Available</Badge>
                    ) : (
                      <Badge tone="danger">Unavailable</Badge>
                    )}
                    <p className="mt-1 text-[11px] text-muted">{formatDate(book.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatsOverdue({ value }: { value: number }) {
  return (
    <Link
      to="/admin/borrowings?status=overdue"
      className="ring-focus block rounded-xl border border-slate-200 p-4 shadow-card dark:border-slate-700 dark:bg-slate-800/60"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted">Overdue</p>
          <p className={classNames('mt-1 text-2xl font-bold', value > 0 ? 'text-red-600' : 'text-foreground')}>
            {value}
          </p>
        </div>
        <span className="rounded-lg bg-surface p-2 shadow-sm">
          <AlertTriangle className={classNames('h-5 w-5', value > 0 ? 'text-red-500' : 'text-muted')} />
        </span>
      </div>
    </Link>
  )
}