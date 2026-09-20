import { Loader2 } from 'lucide-react'

interface LoadingScreenProps {
  label?: string
}

export default function LoadingScreen({ label = 'Loading...' }: LoadingScreenProps) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-app">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 shadow-lifted">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}