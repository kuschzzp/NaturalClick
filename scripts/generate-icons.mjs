import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const ICON_SIZES = [16, 32, 48, 128];
const OUT_DIR = join(process.cwd(), "public", "icons");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    rows[rowStart] = 0;
    rgba.copy(rows, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    header,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function setPixel(buffer, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= width) return;
  const index = (y * width + x) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  buffer[index] = Math.round(color[0] * alpha + buffer[index] * inverse);
  buffer[index + 1] = Math.round(color[1] * alpha + buffer[index + 1] * inverse);
  buffer[index + 2] = Math.round(color[2] * alpha + buffer[index + 2] * inverse);
  buffer[index + 3] = Math.round(color[3] + buffer[index + 3] * inverse);
}

function fillCircle(buffer, width, cx, cy, radius, color) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
        setPixel(buffer, width, x, y, color);
      }
    }
  }
}

function fillRoundedRect(buffer, width, x, y, w, h, radius, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
      const dx = Math.max(x - px, 0, px - (x + w - 1));
      const dy = Math.max(y - py, 0, py - (y + h - 1));
      const cornerX = px < x + radius ? x + radius : px > x + w - radius ? x + w - radius : px;
      const cornerY = py < y + radius ? y + radius : py > y + h - radius ? y + h - radius : py;
      const inCorner = (px - cornerX) ** 2 + (py - cornerY) ** 2 <= radius ** 2;
      if ((dx === 0 && dy === 0) || inCorner) {
        setPixel(buffer, width, px, py, color);
      }
    }
  }
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPolygon(buffer, width, points, color) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
      if (insidePolygon(x + 0.5, y + 0.5, points)) {
        setPixel(buffer, width, x, y, color);
      }
    }
  }
}

function drawLine(buffer, width, x1, y1, x2, y2, radius, color) {
  const minX = Math.floor(Math.min(x1, x2) - radius);
  const maxX = Math.ceil(Math.max(x1, x2) + radius);
  const minY = Math.floor(Math.min(y1, y2) - radius);
  const maxY = Math.ceil(Math.max(y1, y2) + radius);
  const lenSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lenSquared));
      const px = x1 + t * (x2 - x1);
      const py = y1 + t * (y2 - y1);
      if ((x - px) ** 2 + (y - py) ** 2 <= radius ** 2) {
        setPixel(buffer, width, x, y, color);
      }
    }
  }
}

function downsample(buffer, highSize, size, factor) {
  const output = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const source = ((y * factor + sy) * highSize + (x * factor + sx)) * 4;
          totals[0] += buffer[source];
          totals[1] += buffer[source + 1];
          totals[2] += buffer[source + 2];
          totals[3] += buffer[source + 3];
        }
      }
      const target = (y * size + x) * 4;
      const samples = factor * factor;
      output[target] = Math.round(totals[0] / samples);
      output[target + 1] = Math.round(totals[1] / samples);
      output[target + 2] = Math.round(totals[2] / samples);
      output[target + 3] = Math.round(totals[3] / samples);
    }
  }
  return output;
}

function renderIcon(size) {
  const factor = size <= 32 ? 6 : 4;
  const highSize = size * factor;
  const buffer = Buffer.alloc(highSize * highSize * 4);
  const s = highSize;

  fillRoundedRect(buffer, s, s * 0.06, s * 0.06, s * 0.88, s * 0.88, s * 0.18, [16, 34, 61, 255]);
  fillCircle(buffer, s, s * 0.32, s * 0.32, s * 0.17, [31, 122, 100, 255]);
  fillCircle(buffer, s, s * 0.32, s * 0.32, s * 0.08, [255, 255, 255, 230]);
  drawLine(buffer, s, s * 0.32, s * 0.32, s * 0.68, s * 0.72, s * 0.035, [66, 153, 225, 235]);

  const cursor = [
    [s * 0.40, s * 0.33],
    [s * 0.76, s * 0.66],
    [s * 0.60, s * 0.68],
    [s * 0.69, s * 0.86],
    [s * 0.58, s * 0.91],
    [s * 0.50, s * 0.72],
    [s * 0.36, s * 0.85]
  ];
  fillPolygon(buffer, s, cursor, [255, 255, 255, 250]);
  drawLine(buffer, s, s * 0.48, s * 0.40, s * 0.70, s * 0.61, s * 0.018, [16, 34, 61, 120]);
  fillCircle(buffer, s, s * 0.73, s * 0.66, s * 0.055, [31, 122, 100, 255]);

  return encodePng(size, size, downsample(buffer, highSize, size, factor));
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of ICON_SIZES) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), renderIcon(size));
}
