import type { DB } from './connection'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { renderPlaceholderPng, type RGB } from './seed-images'
import { logger } from '../utils/logger'

interface SeedOptions {
  imagesDir: string
  isDev: boolean
}

const AUTHORS = [
  { name: 'Ada Lovelace', biography: 'Pioneer of computing and analytical machine programming.' },
  { name: 'Grace Hopper', biography: 'Computer scientist and creator of the first compiler.' },
  { name: 'Alan Turing', biography: 'Foundational mathematician in computer science and AI.' },
  { name: 'Barbara Kingsolver', biography: 'Award-winning novelist and essayist.' },
  { name: 'Carl Sagan', biography: 'Astronomer, cosmologist, and science communicator.' }
]

const CATEGORIES = [
  { name: 'Computer Science', description: 'Algorithms, programming, and computing theory.' },
  { name: 'Science', description: 'Natural sciences and scientific exploration.' },
  { name: 'Mathematics', description: 'Numbers, structures, and mathematical theory.' },
  { name: 'History', description: 'Human history and historical analysis.' },
  { name: 'Literature', description: 'Fiction, poetry, and literary studies.' }
]

const PUBLISHERS = [
  { name: 'MIT Press', address: 'One Broadway, Cambridge, MA', website: 'https://mitpress.mit.edu' },
  { name: 'Addison-Wesley', address: 'Boston, MA', website: 'https://www.pearson.com' },
  { name: 'Random House', address: 'New York, NY', website: 'https://www.penguinrandomhouse.com' }
]

const BOOKS: Array<{
  title: string
  isbn: string
  author: number
  category: number
  publisher: number
  year: number
  edition: string
  subject: string
  description: string
  callNumber: string
  shelfLocation: string
  totalCopies: number
  availableCopies: number
  coverTop: [number, number, number]
  coverBottom: [number, number, number]
}> = [
  {
    title: 'Programming Fundamentals',
    isbn: '9780262033848',
    author: 0,
    category: 0,
    publisher: 0,
    year: 2023,
    edition: '1st Edition',
    subject: 'Computer programming',
    description: 'An accessible introduction to the essential concepts of computer programming, from variables to algorithms.',
    callNumber: '005.1 LOV',
    shelfLocation: 'Shelf A-01',
    totalCopies: 5,
    availableCopies: 4,
    coverTop: [79, 70, 229],
    coverBottom: [99, 102, 241]
  },
  {
    title: 'Introduction to Programming',
    isbn: '9780131103627',
    author: 1,
    category: 0,
    publisher: 1,
    year: 2022,
    edition: '2nd Edition',
    subject: 'Computer programming',
    description: 'A classic text that teaches structured programming using clear, practical examples.',
    callNumber: '005.1 HOP',
    shelfLocation: 'Shelf A-02',
    totalCopies: 3,
    availableCopies: 2,
    coverTop: [16, 185, 129],
    coverBottom: [5, 150, 105]
  },
  {
    title: 'Advanced Programming',
    isbn: '9780262531962',
    author: 2,
    category: 0,
    publisher: 0,
    year: 2024,
    edition: '3rd Edition',
    subject: 'Computer science',
    description: 'Covers advanced programming techniques including concurrency, memory management, and performance.',
    callNumber: '005.1 TUR',
    shelfLocation: 'Shelf A-03',
    totalCopies: 2,
    availableCopies: 2,
    coverTop: [245, 158, 11],
    coverBottom: [217, 119, 6]
  },
  {
    title: 'Programming with Java',
    isbn: '9780321349606',
    author: 1,
    category: 0,
    publisher: 1,
    year: 2021,
    edition: '1st Edition',
    subject: 'Java programming language',
    description: 'A comprehensive guide to object-oriented programming in Java for beginners and intermediates.',
    callNumber: '005.133 HOP',
    shelfLocation: 'Shelf A-04',
    totalCopies: 4,
    availableCopies: 0,
    coverTop: [239, 68, 68],
    coverBottom: [220, 38, 38]
  },
  {
    title: 'Cosmos and the Universe',
    isbn: '9780345539434',
    author: 4,
    category: 1,
    publisher: 2,
    year: 2019,
    edition: '1st Edition',
    subject: 'Astronomy',
    description: 'A journey through the cosmos exploring galaxies, stars, planets, and the origins of the universe.',
    callNumber: '520 SAG',
    shelfLocation: 'Shelf B-01',
    totalCopies: 3,
    availableCopies: 3,
    coverTop: [14, 165, 233],
    coverBottom: [59, 130, 246]
  },
  {
    title: 'The Pine Tree Lab',
    isbn: '9780061524934',
    author: 3,
    category: 4,
    publisher: 2,
    year: 2020,
    edition: '1st Edition',
    subject: 'Contemporary fiction',
    description: 'A compelling novel exploring family, science, and the natural world.',
    callNumber: '813.6 KIN',
    shelfLocation: 'Shelf C-01',
    totalCopies: 2,
    availableCopies: 1,
    coverTop: [168, 85, 247],
    coverBottom: [147, 51, 234]
  },
  {
    title: 'Mathematics for Computer Science',
    isbn: '9780262034869',
    author: 2,
    category: 2,
    publisher: 0,
    year: 2023,
    edition: '2nd Edition',
    subject: 'Discrete mathematics',
    description: 'Foundational mathematical concepts using computer science examples and proofs.',
    callNumber: '510 TUR',
    shelfLocation: 'Shelf D-01',
    totalCopies: 4,
    availableCopies: 4,
    coverTop: [254, 240, 138],
    coverBottom: [250, 204, 21]
  },
  {
    title: 'History of Computing',
    isbn: '9780321361356',
    author: 0,
    category: 3,
    publisher: 1,
    year: 2018,
    edition: '1st Edition',
    subject: 'History of technology',
    description: 'From mechanical calculators to modern computers, a detailed history of computing technology.',
    callNumber: '004.09 LOV',
    shelfLocation: 'Shelf B-05',
    totalCopies: 3,
    availableCopies: 2,
    coverTop: [139, 92, 246],
    coverBottom: [109, 40, 217]
  },
  {
    title: 'Algorithms Explained',
    isbn: '9780262035026',
    author: 2,
    category: 2,
    publisher: 0,
    year: 2025,
    edition: '1st Edition',
    subject: 'Algorithms',
    description: 'A clear and visual guide to the most important algorithms and data structures.',
    callNumber: '005.1 TUR',
    shelfLocation: 'Shelf A-06',
    totalCopies: 5,
    availableCopies: 5,
    coverTop: [244, 63, 94],
    coverBottom: [190, 18, 60]
  },
  {
    title: 'Science for Everyone',
    isbn: '9780307382252',
    author: 4,
    category: 1,
    publisher: 2,
    year: 2022,
    edition: '2nd Edition',
    subject: 'Popular science',
    description: 'Making complex science accessible and exciting, backed by years of research.',
    callNumber: '500 SAG',
    shelfLocation: 'Shelf B-02',
    totalCopies: 2,
    availableCopies: 0,
    coverTop: [45, 212, 191],
    coverBottom: [13, 148, 136]
  }
]

/**
 * Seeds sample data. Intended for development: production installs start empty.
 */
export function seedDatabase(db: DB, options: SeedOptions): void {
  if (!options.isDev) return
  const existing = db.prepare('SELECT COUNT(*) as c FROM books').get() as { c: number }
  if (existing.c > 0) {
    logger.info('seed skipped: books already exist')
    return
  }

  const ts = new Date().toISOString()
  const insertAuthor = db.prepare(
    'INSERT INTO authors (name, biography, created_at) VALUES (?, ?, ?)'
  )
  const insertCategory = db.prepare(
    'INSERT INTO categories (name, description, created_at) VALUES (?, ?, ?)'
  )
  const insertPublisher = db.prepare(
    'INSERT INTO publishers (name, address, website, created_at) VALUES (?, ?, ?, ?)'
  )
  const insertBook = db.prepare(`
    INSERT INTO books (
      title, isbn, author_id, category_id, publisher_id, publication_year,
      edition, subject, description, call_number, shelf_location,
      total_copies, available_copies, cover_image, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const run = db.transaction(() => {
    const rgb = (v: [number, number, number]): RGB => ({ r: v[0], g: v[1], b: v[2] })
    const authorIds = AUTHORS.map((a) => Number(insertAuthor.run(a.name, a.biography, ts).lastInsertRowid))
    const categoryIds = CATEGORIES.map((c) => Number(insertCategory.run(c.name, c.description, ts).lastInsertRowid))
    const publisherIds = PUBLISHERS.map((p) => Number(insertPublisher.run(p.name, p.address, p.website, ts).lastInsertRowid))

    BOOKS.forEach((book, index) => {
      let coverImage: string | null = null
      const png = renderPlaceholderPng(400, 600, rgb(book.coverTop), rgb(book.coverBottom))
      const filename = `seed-book-${index + 1}.png`
      const fullPath = join(options.imagesDir, filename)
      if (!existsSync(fullPath)) {
        writeFileSync(fullPath, png)
      }
      coverImage = filename

      insertBook.run(
        book.title,
        book.isbn,
        authorIds[book.author],
        categoryIds[book.category],
        publisherIds[book.publisher],
        book.year,
        book.edition,
        book.subject,
        book.description,
        book.callNumber,
        book.shelfLocation,
        book.totalCopies,
        book.availableCopies,
        coverImage,
        ts,
        ts
      )
    })
  })

  run()
  logger.info(`seeded ${BOOKS.length} books, ${AUTHORS.length} authors, ${CATEGORIES.length} categories, ${PUBLISHERS.length} publishers`)
}