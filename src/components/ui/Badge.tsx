import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { classNames } from '../../lib/utils'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'primary'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  muted: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
}

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  icon?: LucideIcon
  className?: string
}

export default function Badge({ children, tone = 'muted', icon: Icon, className }: BadgeProps) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}