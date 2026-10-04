import { Link } from 'react-router-dom'
import { Eye, CheckCircle2, XCircle } from 'lucide-react'
import BookCover from './BookCover'
import type { Book } from '@shared/types'

interface BookCardProps {
  book: Book
  admin?: boolean
}

export default function BookCard({ book, admin = false }: BookCardProps) {
  const href = admin ? `/admin/books?edit=${book.id}` : `/catalog/book/${book.id}`
  return (
    <Link
      to={href}
      className="flex h-full flex-col overflow-hidden rounded border border-border bg-surface"
    >
      <div className="flex justify-center bg-surface-2 p-4 pb-2">
        <BookCover filename={book.cover_image} title={book.title} sizes="md" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4 pt-2">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-xs text-muted">{book.author_name ?? 'Unknown Author'}</p>
        {book.category_name && (
          <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-foreground">
            {book.category_name}
          </span>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
          <span className="text-xs">
            {book.available ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-red-500 dark:text-red-400">
                <XCircle className="h-3.5 w-3.5" /> Unavailable
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors group-hover:bg-primary-50 group-hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-primary-900/40 dark:group-hover:text-primary-300">
            <Eye className="h-3 w-3" />
            {admin ? 'Edit' : 'Details'}
          </span>
        </div>
      </div>
    </Link>
  )
}