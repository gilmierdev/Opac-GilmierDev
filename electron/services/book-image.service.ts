import { dialog } from 'electron'
import { copyFileSync, existsSync, openSync, readSync, closeSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { logger } from '../utils/logger'
import type { ImageResult } from '@shared/types'

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const ALLOWED_MIME_SIGNATURES: Array<{ bytes: number[]; ext: string[] }> = [
  { bytes: [0xff, 0xd8, 0xff], ext: ['.jpg', '.jpeg'] },
  { bytes: [0x89, 0x50, 0x4e, 0x47], ext: ['.png'] },
  { bytes: [0x52, 0x49, 0x46, 0x46], ext: ['.webp'] }
]
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export interface ImageFileResult {
  filename: string | null
  error?: string
}

export interface BookImageService {
  pickCover(): Promise<ImageResult>
  pickLogo(): Promise<ImageResult>
  saveFromPath(sourcePath: string): ImageFileResult
  delete(filename: string): Promise<void>
}

export function bookImageService(imagesDir: string): BookImageService {
  function sanitizeExtension(filePath: string): string | null {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    return ALLOWED_EXTENSIONS.includes(ext) ? ext : null
  }

  function matchesSignature(filePath: string, ext: string): boolean {
    const signature = ALLOWED_MIME_SIGNATURES.find((s) => s.ext.includes(ext))
    if (!signature) return false
    try {
      const buf = Buffer.alloc(16)
      const handle = openSync(filePath, 'r')
      readSync(handle, buf, 0, 16, 0)
      closeSync(handle)
      return signature.bytes.every((byte, i) => buf[i] === byte)
    } catch {
      return false
    }
  }

  function save(sourcePath: string): ImageFileResult {
    try {
      if (!sourcePath || !existsSync(sourcePath)) {
        return { filename: null, error: 'Selected file does not exist' }
      }
      const ext = sanitizeExtension(sourcePath)
      if (!ext) {
        return { filename: null, error: 'Only JPG, PNG, and WEBP images are allowed' }
      }
      const size = statSync(sourcePath).size
      if (size > MAX_IMAGE_BYTES) {
        return { filename: null, error: 'Image is too large (maximum 12 MB)' }
      }
      if (!matchesSignature(sourcePath, ext)) {
        return { filename: null, error: 'The selected file is not a valid image' }
      }
      const filename = `book-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
      const dest = join(imagesDir, filename)
      copyFileSync(sourcePath, dest)
      return { filename }
    } catch (err) {
      logger.error('failed to save image', err)
      return { filename: null, error: 'Unable to save the image file' }
    }
  }

  async function pick(): Promise<ImageResult> {
    const result = await dialog.showOpenDialog({
      title: 'Select Image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { filename: null }
    }
    return save(result.filePaths[0])
  }

  return {
    pickCover: () => pick(),
    pickLogo: () => pick(),
    saveFromPath: (sourcePath) => save(sourcePath),
    async delete(filename: string) {
      const safeName = filename.replaceAll('\\', '/').split('/').pop() ?? ''
      if (!safeName || safeName !== filename || /\.\./.test(safeName)) {
        throw new Error('Invalid image filename')
      }
      const full = join(imagesDir, safeName)
      try {
        if (existsSync(full)) unlinkSync(full)
      } catch (err) {
        logger.warn('failed to delete image', { filename, error: err })
      }
    }
  }
}