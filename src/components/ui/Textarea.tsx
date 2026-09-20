import type { TextareaHTMLAttributes } from 'react'
import { classNames } from '../../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export default function Textarea({ label, className, id, ...rest }: TextareaProps) {
  const textareaId = id ?? rest.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={classNames(
          'ring-focus w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground shadow-card outline-none transition-colors',
          'border-slate-300 dark:border-slate-600',
          'scrollbar-thin'
        )}
        {...rest}
      />
    </div>
  )
}