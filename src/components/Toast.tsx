import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, Info, X, Loader2 } from 'lucide-react'
import { classNames } from '../lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, type?: ToastType, duration?: number) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, type = 'info', duration = 4000) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    if (type !== 'loading') {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  success: (message: string) => useToastStore.getState().push(message, 'success'),
  error: (message: string, duration = 5000) => useToastStore.getState().push(message, 'error', duration),
  info: (message: string) => useToastStore.getState().push(message, 'info'),
  loading: (message: string) => useToastStore.getState().push(message, 'loading'),
  dismiss: (id: number) => useToastStore.getState().dismiss(id)
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={classNames(
            'animate-fade-in pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface px-4 py-3 shadow-lifted',
            t.type === 'success' && 'border-green-200 dark:border-green-800',
            t.type === 'error' && 'border-red-200 dark:border-red-800',
            t.type === 'info' && 'border-slate-200 dark:border-slate-700',
            t.type === 'loading' && 'border-slate-200 dark:border-slate-700'
          )}
        >
          <span className="mt-0.5">
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
            {t.type === 'error' && <AlertTriangle className="h-4 w-4 text-red-600" />}
            {t.type === 'info' && <Info className="h-4 w-4 text-primary-600" />}
            {t.type === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-primary-600" />}
          </span>
          <span className="flex-1 text-sm text-foreground">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="ring-focus rounded p-0.5 text-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}