import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  BookText,
  MapPin,
  Hash,
  Calendar,
  Building2,
  Tag,
  User,
  Layers,
  Fingerprint
} from 'lucide-react'
import PublicLayout from '../../layouts/PublicLayout'
import BookCover from '../../components/BookCover'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'
import type { Book } from '@shared/types'
import { formatDate, errorMessage } from '../../lib/utils'

export default function BookDetails() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void window.api.books
      .get(Number(id))
      .then((b) => setBook(b))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <PublicLayout showBack>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {loading ? (
          <Spinner label="Loading book details..." full />
        ) : error || !book ? (
          <EmptyState
            icon={BookText}
            title="Book not found"
            description={error ?? 'This book is no longer in the catalog.'}
          />
        ) : (
          <div className="animate-fade-in space-y-6">
            <Link
              to="/catalog"
              className="ring-focus inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to catalog
            </Link>

            <div className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700 md:flex-row">
              <div className="flex justify-center md:w-48 md:shrink-0">
                <BookCover filename={book.cover_image} title={book.title} sizes="xl" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold leading-tight text-foreground">{book.title}</h1>

                <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-muted">
                    <User className="h-4 w-4 shrink-0 text-primary-500" />
                    <span className="font-medium text-foreground">{book.author_name ?? 'Unknown Author'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted">
                    <Fingerprint className="h-4 w-4 shrink-0 text-primary-500" />
                    <span>ISBN: <span className="text-foreground">{book.isbn ?? '—'}</span></span>
                  </div>
                  {book.category_name && (
                    <div className="flex items-center gap-2 text-muted">
                      <Tag className="h-4 w-4 shrink-0 text-primary-500" />
                      <span>
                        Category: <span className="text-foreground">{book.category_name}</span>
                      </span>
                    </div>
                  )}
                  {book.publisher_name && (
                    <div className="flex items-center gap-2 text-muted">
                      <Building2 className="h-4 w-4 shrink-0 text-primary-500" />
                      <span>
                        Publisher: <span className="text-foreground">{book.publisher_name}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted">
                    <Calendar className="h-4 w-4 shrink-0 text-primary-500" />
                    <span>
                      Year: <span className="text-foreground">{book.publication_year ?? '—'}</span>
                    </span>
                  </div>
                  {book.edition && (
                    <div className="flex items-center gap-2 text-muted">
                      <Layers className="h-4 w-4 shrink-0 text-primary-500" />
                      <span>
                        Edition: <span className="text-foreground">{book.edition}</span>
                      </span>
                    </div>
                  )}
                  {book.call_number && (
                    <div className="flex items-center gap-2 text-muted">
                      <Hash className="h-4 w-4 shrink-0 text-primary-500" />
                      <span>
                        Call No: <span className="font-mono text-foreground">{book.call_number}</span>
                      </span>
                    </div>
                  )}
                  {book.shelf_location && (
                    <div className="flex items-center gap-2 text-muted">
                      <MapPin className="h-4 w-4 shrink-0 text-primary-500" />
                      <span>
                        Location: <span className="font-medium text-foreground">{book.shelf_location}</span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  {book.available ? (
                    <Badge tone="success" icon={CheckCircle2} className="px-3 py-1 text-sm">
                      Available
                    </Badge>
                  ) : (
                    <Badge tone="danger" icon={XCircle} className="px-3 py-1 text-sm">
                      Unavailable
                    </Badge>
                  )}
                  <span className="text-sm text-muted">
                    <span className="font-semibold text-foreground">{book.available_copies}</span> of{' '}
                    <span className="font-semibold text-foreground">{book.total_copies}</span>{' '}
                    copies available
                  </span>
                </div>
              </div>
            </div>

            {book.description && (
              <div className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
                <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
                  <BookText className="h-4 w-4 text-primary-500" /> Description
                </h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {book.description}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-surface p-6 text-sm text-muted dark:border-slate-700">
              <p>
                Added to catalog: <span className="text-foreground">{formatDate(book.created_at)}</span>
              </p>
              {book.subject && (
                <p className="mt-1">
                  Subject: <span className="text-foreground">{book.subject}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  )
}