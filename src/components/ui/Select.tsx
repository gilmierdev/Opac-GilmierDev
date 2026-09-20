import type { SelectHTMLAttributes } from 'react'
import { classNames } from '../../lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export default function Select({ label, className, children, id, ...rest }: SelectProps) {
  const selectId = id ?? rest.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={classNames(
          'ring-focus w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground shadow-card outline-none transition-colors',
          'border-slate-300 dark:border-slate-600'
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  )
}