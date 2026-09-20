import { useState } from 'react'
import { BookImage, Library } from 'lucide-react'
import { imageUrl, classNames } from '../lib/utils'

interface BookCoverProps {
  filename: string | null | undefined
  title: string
  className?: string
  sizes?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZES: Record<NonNullable<BookCoverProps['sizes']>, string> = {
  sm: 'h-24 w-16 text-[10px]',
  md: 'h-32 w-22 text-xs',
  lg: 'h-40 w-28 text-sm',
  xl: 'h-56 w-40 text-sm'
}

export default function BookCover({ filename, title, className, sizes = 'md' }: BookCoverProps) {
  const url = imageUrl(filename)
  const [failed, setFailed] = useState(false)

  if (!url || failed) {
    return (
      <div
        role="img"
        aria-label={`Cover of ${title}`}
        className={classNames(
          'flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-gradient-to-br from-primary-50 to-primary-100 p-3 text-center',
          'dark:from-slate-800 dark:to-primary-900/40 dark:border-slate-700',
          SIZES[sizes],
          className
        )}
      >
        <Library className="h-1/3 w-1/3 max-h-10 text-primary-400" />
        <span className="line-clamp-3 font-medium text-primary-700 dark:text-primary-300">
          {title}
        </span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={`Cover of ${title}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={classNames(
        'rounded-lg border border-slate-200 object-cover shadow-card dark:border-slate-700',
        SIZES[sizes],
        className
      )}
    />
  )
}

export function CoverIcon() {
  return <BookImage className="h-5 w-5" />
}