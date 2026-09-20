import { Link } from 'react-router-dom'
import { Eye, CheckCircle2, XCircle } from 'lucide-react'
import BookCover from './BookCover'
import Badge from './ui/Badge'
import type { Book } from '@shared/types'

interface BookCardProps {
  book: Book
  admin?: boolean
}

export default function BookCard({ book, admin = false }: BookCardProps) {
  const href = admin ? `/admin/books/${book.id}/edit` : `/catalog/book/${book.id}`
  return (
    <Link
      to={href}
      className="ring-focus group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-card transition-shadow hover:shadow-lifted dark:border-slate-700"
    >
      <div className="flex justify-center bg-gradient-to-b from-primary-50/60 to-transparent p-4 pb-2 dark:from-slate-800/60">
        <BookCover filename={book.cover_image} title={book.title} sizes={book.available ? 'md' : 'md'} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4 pt-2">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary-600 dark:group-hover:text-primary-300">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-xs text-muted">{book.author_name ?? 'Unknown Author'}</p>
        {book.category_name && (
          <Badge tone="primary" className="mt-1 w-fit">
            {book.category_name}
          </Badge>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-xs">
            {book.available ? (
              <span className="inline-flex items-center gap-1 font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-red-500 dark:text-red-400">
                <XCircle className="h-3.5 w-3.5" /> Unavailable
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Eye className="h-3 w-3" />
            {admin ? 'Edit' : 'Details'}
          </span>
        </div>
      </div>
    </Link>
  )
}