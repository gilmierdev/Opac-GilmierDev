import type { InputHTMLAttributes, ReactNode } from 'react'
import { classNames } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: ReactNode
  error?: string
}

export default function Input({ label, icon, error, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={classNames(
            'ring-focus w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground shadow-card outline-none transition-colors placeholder:text-muted/70',
            icon ? 'pl-10' : '',
            error
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-300 dark:border-slate-600',
            className
          )}
          {...rest}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}