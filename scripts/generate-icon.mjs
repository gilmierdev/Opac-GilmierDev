import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'build')

// ---------- minimal PNG encoder ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const data = Buffer.alloc(rgba.length)
  let src = 0
  let dst = 0
  for (let y = 0; y < height; y++) {
    data[dst++] = 0
    for (let x = 0; x < width * 4; x++) {
      data[dst++] = rgba[src++]
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(data)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- geometry helpers (float coords) ----------
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
}

function cross(ox, oy, ax, ay, bx, by) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
}

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  const cx = Math.min(Math.max(px, x0 + r), x1 - r)
  const cy = Math.min(Math.max(py, y0 + r), y1 - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

function inQuad(px, py, q) {
  const s1 = cross(q[0][0], q[0][1], q[1][0], q[1][1], px, py)
  const s2 = cross(q[1][0], q[1][1], q[2][0], q[2][1], px, py)
  const s3 = cross(q[2][0], q[2][1], q[3][0], q[3][1], px, py)
  const s4 = cross(q[3][0], q[3][1], q[0][0], q[0][1], px, py)
  return (s1 >= 0 && s2 >= 0 && s3 >= 0 && s4 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0 && s4 <= 0)
}

function inTriangle(px, py, t) {
  return inQuad(px, py, [t[0], t[1], t[2], t[0]])
}

// ---------- drawing ----------
const GRAD_TOP = [30, 64, 175] // primary-800
const GRAD_BOTTOM = [96, 165, 250] // primary-400
const PAGE = [255, 255, 255]
const PAGE_SHADE = [224, 242, 254] // primary-100
const BOOKMARK = [245, 158, 11] // amber-500

function renderCanvas(size) {
  const ss = size * 4
  const buf = Buffer.alloc(ss * ss * 4)

  const pad = 0.06 * ss
  const rr = 0.18 * ss
  const x0 = pad
  const y0 = pad
  const x1 = ss - pad
  const y1 = ss - pad

  const leftPage = [
    [0.2 * ss, 0.3 * ss],
    [0.5 * ss, 0.4 * ss],
    [0.5 * ss, 0.68 * ss],
    [0.2 * ss, 0.58 * ss]
  ]
  const rightPage = [
    [0.8 * ss, 0.3 * ss],
    [0.5 * ss, 0.4 * ss],
    [0.5 * ss, 0.68 * ss],
    [0.8 * ss, 0.58 * ss]
  ]
  const bmX0 = 0.44 * ss
  const bmX1 = 0.56 * ss
  const bmY0 = 0.52 * ss
  const bmY1 = 0.79 * ss
  const bmNotch = [
    [bmX0, bmY1],
    [bmX1, bmY1],
    [0.5 * ss, 0.72 * ss]
  ]

  for (let y = 0; y < ss; y++) {
    const t = y / (ss - 1)
    const bg = mix(GRAD_TOP, GRAD_BOTTOM, t)
    for (let x = 0; x < ss; x++) {
      const i = (y * ss + x) * 4
      let color = null
      if (inRoundedRect(x + 0.5, y + 0.5, x0, y0, x1, y1, rr)) {
        color = bg
        const px = x + 0.5
        const py = y + 0.5
        if (inQuad(px, py, leftPage) || inQuad(px, py, rightPage)) {
          color = py > 0.62 * ss ? PAGE_SHADE : PAGE
        }
        if (inTriangle(px, py, bmNotch)) {
          color = bg
        } else if (px >= bmX0 && px <= bmX1 && py >= bmY0 && py <= bmY1) {
          color = BOOKMARK
        }
      }
      if (color) {
        buf[i] = color[0]
        buf[i + 1] = color[1]
        buf[i + 2] = color[2]
        buf[i + 3] = 255
      }
    }
  }

  // 4x4 box downsample
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const i = ((y * 4 + dy) * ss + (x * 4 + dx)) * 4
          r += buf[i]
          g += buf[i + 1]
          b += buf[i + 2]
          a += buf[i + 3]
        }
      }
      const o = (y * size + x) * 4
      out[o] = Math.round(r / 16)
      out[o + 1] = Math.round(g / 16)
      out[o + 2] = Math.round(b / 16)
      out[o + 3] = Math.round(a / 16)
    }
  }
  return out
}

// ---------- ICO wrapper (PNG-compressed entry, 256x256 supported size) ----------
function encodeIco(png256) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png256.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png256])
}

// ---------- main ----------
mkdirSync(OUT_DIR, { recursive: true })

const png512 = encodePng(512, 512, renderCanvas(512))
const png256 = encodePng(256, 256, renderCanvas(256))

writeFileSync(join(OUT_DIR, 'icon.png'), png512)
writeFileSync(join(OUT_DIR, 'icon.ico'), encodeIco(png256))

console.log(`Generated build/icon.png (512x512, ${png512.length} bytes)`)
console.log(`Generated build/icon.ico (256x256 entry, ${png256.length} bytes)`)
console.log('Reference in electron-builder.base.yml via "directories.buildIcon" or build/icon.ico/icon.png')