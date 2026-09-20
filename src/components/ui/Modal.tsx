import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { classNames } from '../../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg'
}

const WIDTHS: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl'
}

export default function Modal({ open, onClose, title, children, maxWidth = 'md' }: ModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={classNames(
          'animate-fade-in w-full rounded-xl border bg-surface p-0 shadow-lifted',
          'border-slate-200 dark:border-slate-700',
          WIDTHS[maxWidth]
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5 border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="ring-focus rounded-md p-1 text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
      </div>
    </div>
  )
}