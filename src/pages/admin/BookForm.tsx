import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, Upload, Trash2, ImageIcon } from 'lucide-react'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import BookCover from '../../components/BookCover'
import type { AuthorListItem, BookInput, CategoryListItem, PublisherListItem } from '@shared/types'
import { errorMessage } from '../../lib/utils'

interface FormFields {
  title: string
  isbn: string
  author_id: string
  category_id: string
  publisher_id: string
  publication_year: string
  edition: string
  subject: string
  description: string
  call_number: string
  shelf_location: string
  total_copies: string
  available_copies: string
  cover_image: string | null
}

const EMPTY: FormFields = {
  title: '',
  isbn: '',
  author_id: '',
  category_id: '',
  publisher_id: '',
  publication_year: '',
  edition: '',
  subject: '',
  description: '',
  call_number: '',
  shelf_location: '',
  total_copies: '1',
  available_copies: '1',
  cover_image: null
}

export default function BookForm() {
  const { id } = useParams<{ id: string }>()
  const editing = !!id
  const navigate = useNavigate()

  const [fields, setFields] = useState<FormFields>(EMPTY)
  const [categories, setCategories] = useState<CategoryListItem[]>([])
  const [authors, setAuthors] = useState<AuthorListItem[]>([])
  const [publishers, setPublisher] = useState<PublisherListItem[]>([])

  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.categories.list().then(setCategories).catch(() => undefined)
    void window.api.authors.list().then(setAuthors).catch(() => undefined)
    void window.api.publishers.list().then(setPublisher).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!editing) return
    void window.api.books
      .get(Number(id))
      .then((book) => {
        if (!book) {
          setError('Book not found.')
          return
        }
        setFields({
          title: book.title,
          isbn: book.isbn ?? '',
          author_id: book.author_id ? String(book.author_id) : '',
          category_id: book.category_id ? String(book.category_id) : '',
          publisher_id: book.publisher_id ? String(book.publisher_id) : '',
          publication_year: book.publication_year ? String(book.publication_year) : '',
          edition: book.edition ?? '',
          subject: book.subject ?? '',
          description: book.description ?? '',
          call_number: book.call_number ?? '',
          shelf_location: book.shelf_location ?? '',
          total_copies: String(book.total_copies),
          available_copies: String(book.available_copies),
          cover_image: book.cover_image
        })
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [editing, id])

  const set = <K extends keyof FormFields>(key: K, value: string) =>
    setFields((f) => ({ ...f, [key]: value }))

  const handlePickCover = async () => {
    setUploading(true)
    setError(null)
    try {
      const res = await window.api.images.pickCover()
      if (res.filename) setFields((f) => ({ ...f, cover_image: res.filename }))
      else if (res.error) setError(res.error)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveCover = async () => {
    if (fields.cover_image) {
      try {
        await window.api.images.delete(fields.cover_image)
      } catch {
        // ignore cleanup errors
      }
    }
    setFields((f) => ({ ...f, cover_image: null }))
  }

  const validate = (): string | null => {
    if (!fields.title.trim()) return 'Title is required.'
    const total = Number(fields.total_copies)
    if (!Number.isInteger(total) || total < 0) return 'Total copies must be a non-negative whole number.'
    const available = Number(fields.available_copies)
    if (!Number.isInteger(available) || available < 0) return 'Available copies must be a non-negative whole number.'
    if (available > total) return 'Available copies cannot exceed total copies.'
    if (fields.publication_year && (Number(fields.publication_year) < 0 || Number(fields.publication_year) > 9999)) {
      return 'Publication year must be between 0 and 9999.'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const invalid = validate()
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)
    setError(null)
    const input: BookInput = {
      title: fields.title.trim(),
      isbn: fields.isbn.trim() || null,
      author_id: fields.author_id ? Number(fields.author_id) : null,
      category_id: fields.category_id ? Number(fields.category_id) : null,
      publisher_id: fields.publisher_id ? Number(fields.publisher_id) : null,
      publication_year: fields.publication_year ? Number(fields.publication_year) : null,
      edition: fields.edition.trim() || null,
      subject: fields.subject.trim() || null,
      description: fields.description.trim() || null,
      call_number: fields.call_number.trim() || null,
      shelf_location: fields.shelf_location.trim() || null,
      total_copies: Number(fields.total_copies),
      available_copies: Number(fields.available_copies),
      cover_image: fields.cover_image
    }
    try {
      if (editing) {
        await window.api.books.update(Number(id), input)
        navigate(`/admin/books`)
      } else {
        await window.api.books.create(input)
        navigate('/admin/books')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading book…" full />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to="/admin/books" className="ring-focus inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to books
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-foreground">
          {editing ? 'Edit Book' : 'Add New Book'}
        </h1>
        <p className="text-sm text-muted">
          {editing ? 'Update the details of this catalog entry.' : 'Add a new title to the library catalog.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-surface p-6 shadow-card dark:border-slate-700">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Cover */}
        <div className="mb-6 flex items-start gap-4">
          {fields.cover_image ? (
            <BookCover filename={fields.cover_image} title={fields.title || 'Cover'} sizes="lg" />
          ) : (
            <div className="flex h-40 w-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-muted dark:border-slate-600">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">No cover</span>
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={handlePickCover} loading={uploading} icon={<Upload className="h-4 w-4" />}>
              {uploading ? 'Importing…' : 'Upload cover image'}
            </Button>
            {fields.cover_image && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemoveCover} icon={<Trash2 className="h-4 w-4" />}>
                Remove cover
              </Button>
            )}
            <p className="max-w-xs text-xs text-muted">JPG, PNG, WEBP or GIF up to 12 MB.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Title *" name="title" value={fields.title} onChange={(e) => set('title', e.target.value)} required />
          <Input label="ISBN" name="isbn" value={fields.isbn} onChange={(e) => set('isbn', e.target.value)} placeholder="e.g. 978-0-306-40615-7" />
          <Select label="Author" name="author_id" value={fields.author_id} onChange={(e) => set('author_id', e.target.value)}>
            <option value="">Select author…</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Select label="Category" name="category_id" value={fields.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select label="Publisher" name="publisher_id" value={fields.publisher_id} onChange={(e) => set('publisher_id', e.target.value)}>
            <option value="">Select publisher…</option>
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Input label="Publication Year" name="publication_year" type="number" min="0" max="9999" value={fields.publication_year} onChange={(e) => set('publication_year', e.target.value)} placeholder="e.g. 2023" />
          <Input label="Edition" name="edition" value={fields.edition} onChange={(e) => set('edition', e.target.value)} placeholder="e.g. 2nd Edition" />
          <Input label="Call Number" name="call_number" value={fields.call_number} onChange={(e) => set('call_number', e.target.value)} placeholder="e.g. QA76.76.C65" />
          <Input label="Shelf Location" name="shelf_location" value={fields.shelf_location} onChange={(e) => set('shelf_location', e.target.value)} placeholder="e.g. Aisle 3, Shelf B" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Total Copies *" name="total_copies" type="number" min="0" value={fields.total_copies} onChange={(e) => set('total_copies', e.target.value)} />
            <Input label="Available *" name="available_copies" type="number" min="0" value={fields.available_copies} onChange={(e) => set('available_copies', e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <Textarea label="Subject" name="subject" value={fields.subject} onChange={(e) => set('subject', e.target.value)} rows={2} placeholder="Keywords or tags for searching" />
        </div>
        <div className="mt-4">
          <Textarea label="Description" name="description" value={fields.description} onChange={(e) => set('description', e.target.value)} rows={5} placeholder="A short synopsis of the book…" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/books')}>Cancel</Button>
          <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Book'}
          </Button>
        </div>
      </form>
    </div>
  )
}