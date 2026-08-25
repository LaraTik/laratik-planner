import { crc32 } from "node:zlib";

/**
 * FEAT-15 (GAP-FULL-REVIEW-2026-08-25) — minimal store-only ZIP
 * writer. We need a single "Export brand assets" endpoint and the
 * size of an `archiver` / `jszip` dependency is disproportionate to
 * the value of true compression for the planner use case (a handful
 * of small logos + colour swatches).
 *
 * The store method writes each entry uncompressed with a CRC-32
 * checksum. The output is a valid ZIP that any OS unzip tool can
 * read. It is NOT a general-purpose archiver — it deliberately
 * does not support directories (entries are flat files), encryption,
 * or streaming. For the export endpoint this is the right trade.
 *
 * Format reference: APPNOTE.TXT v6.3.10. The two fields we need
 * that aren't covered by `node:zlib` are the DOS time/date stamp
 * (a 16-bit packed structure) and the central directory header at
 * the end of the file.
 */

export interface ZipEntry {
  /** File path inside the archive (use forward slashes, no `..`). */
  name: string;
  /** Raw bytes. */
  data: Buffer | Uint8Array;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function dosDateTime(d: Date): { date: number; time: number } {
  // DOS date: bits 0-4 = day-of-month, 5-8 = month, 9-15 = year-1980.
  // DOS time: bits 0-4 = seconds/2, 5-10 = minutes, 11-15 = hours.
  const date =
    (((d.getUTCFullYear() - 1980) & 0x7f) << 9) |
    (((d.getUTCMonth() + 1) & 0x0f) << 5) |
    (d.getUTCDate() & 0x1f);
  const time =
    ((d.getUTCHours() & 0x1f) << 11) |
    ((d.getUTCMinutes() & 0x3f) << 5) |
    (Math.floor(d.getUTCSeconds() / 2) & 0x1f);
  return { date, time };
}

export function buildZip(entries: ZipEntry[], now: Date = new Date()): Buffer {
  const { date: dosDate, time: dosTime } = dosDateTime(now);
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.includes("..") || entry.name.startsWith("/")) {
      throw new Error(`Invalid zip entry name: ${entry.name}`);
    }
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data) >>> 0;

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method = store
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.byteLength, 18);
    local.writeUInt32LE(data.byteLength, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    local.writeUInt16LE(0, 28); // extra
    localChunks.push(local, nameBytes, data);

    // Central directory record (46 bytes + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.byteLength, 20);
    central.writeUInt32LE(data.byteLength, 24);
    central.writeUInt16LE(nameBytes.byteLength, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk #
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBytes);

    offset += local.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const centralSize = centralChunks.reduce((sum, b) => sum + b.byteLength, 0);
  const centralOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}
