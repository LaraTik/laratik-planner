import { Buffer } from "node:buffer";

type XlsxCell = string | number | null;

type ZipEntry = {
  name: string;
  data: Buffer;
};

export type XlsxWorkbookCell = string | number | null;

export interface XlsxWorkbookSheet {
  name: string;
  rows: readonly (readonly XlsxWorkbookCell[])[];
  /** Zero-based rows receiving the standard blue header style. */
  headerRows?: readonly number[];
  /** Zero-based rows receiving the larger title style. */
  titleRows?: readonly number[];
  /** Zero-based columns formatted as date/time serials. */
  dateColumns?: readonly number[];
  columnWidths?: readonly number[];
  rightToLeft?: boolean;
  freezeRows?: number;
  autoFilter?: boolean;
  wrapText?: boolean;
}

/** Convert an instant to an Excel serial using the workspace wall clock. */
export function excelDateTime(value: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  })
    .formatToParts(value)
    .reduce<Record<string, number>>((result, part) => {
      if (part.type !== "literal") result[part.type] = Number(part.value);
      return result;
    }, {});
  const utcMillis = Date.UTC(parts.year!, parts.month! - 1, parts.day!);
  const excelEpochMillis = Date.UTC(1899, 11, 30);
  const dayFraction = ((parts.hour! * 60 + parts.minute!) * 60 + parts.second!) / 86_400;
  return (utcMillis - excelEpochMillis) / 86_400_000 + dayFraction;
}

/**
 * Small dependency-free XLSX writer for bounded report exports.
 *
 * It writes inline strings and numeric cells into one worksheet, keeping the
 * export path auditable and avoiding a client-side spreadsheet dependency.
 */
export function rowsToXlsx(rows: readonly (readonly XlsxCell[])[]): Buffer {
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => cellXml(value, `${columnName(columnIndex)}${rowIndex + 1}`))
          .join("")}</row>`,
    )
    .join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Advertising report" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  return zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    {
      name: "_rels/.rels",
      data: Buffer.from(workbookRelationships),
    },
    { name: "xl/workbook.xml", data: Buffer.from(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(worksheet) },
  ]);
}

/**
 * Build a small styled workbook without a spreadsheet runtime dependency.
 * Text is emitted as inline strings (never formulas), and each worksheet is
 * independently bounded by Excel's row/column limits.
 */
export function workbookToXlsx(sheets: readonly XlsxWorkbookSheet[]): Buffer {
  if (sheets.length === 0) throw new Error("An XLSX workbook needs at least one sheet.");
  const names = new Set<string>();
  for (const sheet of sheets) {
    const validName = sheet.name.trim();
    if (!validName || validName.length > 31 || /[\\/*?:\[\]]/.test(validName)) {
      throw new Error(`Invalid XLSX worksheet name: ${sheet.name}`);
    }
    if (names.has(validName.toLowerCase())) throw new Error("XLSX worksheet names must be unique.");
    names.add(validName.toLowerCase());
    if (sheet.rows.length > 1_048_576) throw new Error("XLSX worksheet row limit exceeded.");
    if (sheet.rows.some((row) => row.length > 16_384)) {
      throw new Error("XLSX worksheet column limit exceeded.");
    }
  }

  const entries: ZipEntry[] = [];
  const sheetOverrides = sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookSheets = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${workbookSheets}</sheets></workbook>`;
  const sheetRelationships = sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  entries.push(
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    { name: "_rels/.rels", data: Buffer.from(rootRelationships) },
    { name: "xl/workbook.xml", data: Buffer.from(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRelationships) },
    { name: "xl/styles.xml", data: Buffer.from(workbookStyles) },
  );
  sheets.forEach((sheet, index) => {
    entries.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(worksheetXml(sheet)),
    });
  });
  return zipStore(entries);
}

const workbookStyles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3525CD"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF241A8A"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9DCE8"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2" wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2" wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2" wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2" wrapText="1" vertical="top"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function worksheetXml(sheet: XlsxWorkbookSheet): string {
  const maxColumns = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRows = new Set(sheet.headerRows ?? [0]);
  const titleRows = new Set(sheet.titleRows ?? []);
  const dateColumns = new Set(sheet.dateColumns ?? []);
  const rtlStyleOffset = sheet.rightToLeft ? 4 : 0;
  const wrapStyleOffset = sheet.wrapText ? 8 : 0;
  const rowXml = sheet.rows
    .map((row, rowIndex) => {
      const rowStyle = titleRows.has(rowIndex) ? 3 : headerRows.has(rowIndex) ? 1 : 0;
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (value === null || value === "") {
            return `<c r="${reference}" s="${rowStyle + rtlStyleOffset + wrapStyleOffset}"/>`;
          }
          if (typeof value === "number" && Number.isFinite(value)) {
            const style =
              (dateColumns.has(columnIndex) ? 2 : rowStyle) + rtlStyleOffset + wrapStyleOffset;
            return `<c r="${reference}" s="${style}" t="n"><v>${value}</v></c>`;
          }
          return `<c r="${reference}" s="${rowStyle + rtlStyleOffset + wrapStyleOffset}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const widths = (sheet.columnWidths ?? []).slice(0, maxColumns);
  const columns = widths
    .map((width, index) => {
      const safeWidth = Number.isFinite(width) ? Math.max(4, Math.min(80, width)) : 18;
      return `<col min="${index + 1}" max="${index + 1}" width="${safeWidth}" customWidth="1"/>`;
    })
    .join("");
  const freezeRows = Math.max(0, Math.floor(sheet.freezeRows ?? (headerRows.has(0) ? 1 : 0)));
  const views = `<sheetViews><sheetView workbookViewId="0"${sheet.rightToLeft ? ' rightToLeft="1"' : ""}>${freezeRows ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : ""}</sheetView></sheetViews>`;
  const filterRange =
    sheet.autoFilter && sheet.rows.length > 1 && maxColumns > 0
      ? `<autoFilter ref="A1:${columnName(maxColumns - 1)}${sheet.rows.length}"/>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}<cols>${columns}</cols><sheetData>${rowXml}</sheetData>${filterRange}</worksheet>`;
}

function cellXml(value: XlsxCell, reference: string): string {
  if (value === null || value === "") return `<c r="${reference}" t="inlineStr"><is><t/></is></c>`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" t="n"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function zipStore(entries: readonly ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    name.copy(localHeader, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = Buffer.alloc(46 + name.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    name.copy(centralHeader, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
