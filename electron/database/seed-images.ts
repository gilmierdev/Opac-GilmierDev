import { deflateSync } from 'node:zlib'

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

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

export interface RGB {
  r: number
  g: number
  b: number
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  }
}

/**
 * Renders a small, clean vertical-gradient placeholder PNG.
 * Used only for development seed data.
 */
export function renderPlaceholderPng(
  width: number,
  height: number,
  top: RGB,
  bottom: RGB,
  accent?: RGB
): Buffer {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset] = 0 // filter: none
    offset += 1
    const t = y / (height - 1)
    const base = mix(top, bottom, t)
    for (let x = 0; x < width; x++) {
      let color = base
      if (accent) {
        const border = 24
        if (x < border || x >= width - border || y < border || y >= height - border) {
          color = accent
        }
      }
      raw[offset] = color.r
      raw[offset + 1] = color.g
      raw[offset + 2] = color.b
      raw[offset + 3] = 255
      offset += 4
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}