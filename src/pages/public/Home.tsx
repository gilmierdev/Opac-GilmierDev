import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, LibraryBig, ArrowDownUp } from 'lucide-react'
import PublicLayout from '../../layouts/PublicLayout'
import BookCard from '../../components/BookCard'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Pagination from '../../components/ui/Pagination'
import Select from '../../components/ui/Select'
import type { Book, BookFilters, CategoryListItem } from '@shared/types'
import { errorMessage } from '../../lib/utils'

const PAGE_SIZES = [12, 24, 48]

export default function Home() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')

  const searchQuery = params.get('q') ?? ''
  const categoryId = params.get('category')
  const publisherId = params.get('publisher')
  const yearFrom = params.get('year_from')
  const yearTo = params.get('year_to')
  const availability = params.get('availability') ?? 'all'
  const sort = params.get('sort') ?? 'title_asc'
  const page = Number(params.get('page') ?? '1')

  const [loading, setLoading] = useState(true)
  const [books, setBooks] = useState<Book[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [categories, setCategories] = useState<CategoryListItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filters: BookFilters = useMemo(
    () => ({
      search: searchQuery || null,
      category_id: categoryId ? Number(categoryId) : null,
      publisher_id: publisherId ? Number(publisherId) : null,
      year_from: yearFrom ? Number(yearFrom) : null,
      year_to: yearTo ? Number(yearTo) : null,
      availability: (availability as BookFilters['availability']) ?? 'all',
      sort: (sort as BookFilters['sort']) ?? 'title_asc',
      page,
      pageSize: PAGE_SIZES[0]
    }),
    [searchQuery, categoryId, publisherId, yearFrom, yearTo, availability, sort, page]
  )

  useEffect(() => {
    void window.api.categories.list().then(setCategories).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    void window.api.books
      .list(filters)
      .then((res) => {
        setBooks(res.items)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [filters])

  const updateUrl = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '' || value === 'all' || value === '1') {
          next.delete(key)
        } else {
          next.set(key, value)
        }
      }
      if (resetPage) next.delete('page')
      setParams(next, { replace: true })
    },
    [params, setParams]
  )

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateUrl({ q: searchInput || null })
  }

  const onQuickSearch = (value: string) => {
    setSearchInput(value)
    updateUrl({ q: value || null })
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateUrl({ q: searchInput || null })
    }, 450)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput, updateUrl])

  return (
    <PublicLayout showBack={false}>
      {/* Hero search */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-surface dark:border-slate-700">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary-200/60 to-primary-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Find a book in our library
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Search by title, author, ISBN, subject, or keyword across the whole collection.
          </p>
          <form onSubmit={onSearchSubmit} className="mt-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search title, author, ISBN, subject…"
                className="ring-focus w-full rounded-2xl border border-slate-300 bg-surface py-3.5 pl-12 pr-4 text-sm text-foreground shadow-lifted placeholder:text-muted/70 focus:border-primary-500 dark:border-slate-600"
              />
            </div>
            <button
              type="submit"
              className="ring-focus rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 px-6 text-sm font-semibold text-white shadow-card transition-all hover:shadow-lifted hover:brightness-105"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => navigate('/catalog/advanced')}
              className="ring-focus inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-surface px-4 text-sm font-medium text-foreground hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Advanced</span>
            </button>
          </form>

          {/* Category chips */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => onQuickSearch('')}
              className={`ring-focus rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                !searchQuery && !categoryId
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-card'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => updateUrl({ category: String(c.id) })}
                className={`ring-focus rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  categoryId === String(c.id)
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-card'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Result bar */}
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            <span className="font-semibold text-foreground">{loading ? '…' : total}</span> book
            {total === 1 ? '' : 's'} found
            {searchQuery && (
              <>
                {' '}
                for “<span className="font-medium text-foreground">{searchQuery}</span>”
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-muted" />
            <Select
              value={sort}
              onChange={(e) => updateUrl({ sort: e.target.value })}
              aria-label="Sort books"
              className="w-48"
            >
              <option value="title_asc">Title A–Z</option>
              <option value="title_desc">Title Z–A</option>
              <option value="author_asc">Author A–Z</option>
              <option value="year_desc">Newest</option>
              <option value="year_asc">Oldest</option>
              <option value="recent">Recently Added</option>
            </Select>
            <Select
              value={availability}
              onChange={(e) => updateUrl({ availability: e.target.value })}
              aria-label="Filter by availability"
              className="w-40"
            >
              <option value="all">All Availability</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </Select>
          </div>
        </div>

        {/* Body */}
        {error ? (
          <EmptyState
            icon={LibraryBig}
            title="Unable to load books"
            description="Please try again in a moment."
          />
        ) : loading ? (
          <Spinner label="Loading books..." full />
        ) : books.length === 0 ? (
          <EmptyState
            icon={LibraryBig}
            title="No books found"
            description={
              searchQuery || categoryId
                ? 'Try another search or clear the filters.'
                : 'The library catalog is empty.'
            }
          />
        ) : (
          <>
            <div className="mt-4 grid animate-fade-in grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5">
              {books.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZES[0]}
              onPageChange={(p) => updateUrl({ page: String(p) })}
            />
          </>
        )}
      </div>
    </PublicLayout>
  )
}