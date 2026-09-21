import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { bootstrapApp, useAppStore } from './stores/app'
import StartScreen from './pages/public/StartScreen'
import Home from './pages/public/Home'
import AdvancedSearch from './pages/public/AdvancedSearch'
import BookDetails from './pages/public/BookDetails'
import Connect from './pages/public/Connect'
import Login from './pages/admin/Login'
import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Books from './pages/admin/Books'
import BookForm from './pages/admin/BookForm'
import Authors from './pages/admin/Authors'
import Categories from './pages/admin/Categories'
import Publishers from './pages/admin/Publishers'
import Borrowings from './pages/admin/Borrowings'
import Network from './pages/admin/Network'
import SettingsPage from './pages/admin/Settings'
import LoadingScreen from './components/LoadingScreen'

export default function App() {
  const ready = useAppStore((s) => s.ready)
  const mode = useAppStore((s) => s.mode)
  const connection = useAppStore((s) => s.connection)

  useEffect(() => {
    void bootstrapApp()
  }, [])

  if (!ready) {
    return <LoadingScreen label="Starting OPAC Library..." />
  }

  if (mode === 'user' && !connection) {
    return (
      <Routes>
        <Route path="/connect" element={<Connect />} />
        <Route path="*" element={<Navigate to="/connect" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={mode === 'user' && connection ? <Navigate to="/catalog" replace /> : <StartScreen />} />
      <Route path="/catalog" element={<Home />} />
      <Route path="/catalog/advanced" element={<AdvancedSearch />} />
      <Route path="/catalog/book/:id" element={<BookDetails />} />

      {mode === 'user' && <Route path="/connect" element={<Connect />} />}

      {mode === 'admin' && (
        <>
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="books" element={<Books />} />
            <Route path="books/new" element={<BookForm />} />
            <Route path="books/:id/edit" element={<BookForm />} />
            <Route path="authors" element={<Authors />} />
            <Route path="categories" element={<Categories />} />
            <Route path="publishers" element={<Publishers />} />
            <Route path="borrowings" element={<Borrowings />} />
            <Route path="network" element={<Network />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </>
      )}

      {mode === 'admin' ? <Route path="*" element={<Navigate to="/" replace />} /> : <Route path="*" element={<Navigate to="/catalog" replace />} />}
    </Routes>
  )
}