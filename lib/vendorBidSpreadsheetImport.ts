import {readSpreadsheetFile} from "./spreadsheetFile";

export type ImportedVendorBidLine = {
  lineNumber: number;
  quantity: number;
  unitBid: number;
  lineTotal: number;
};

export type ImportedVendorBidSheet = {
  lines: ImportedVendorBidLine[];
  sheetName: string;
};

const clean = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const money = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const negative = /^\(.*\)$/.test(text);
  const parsed = Number(text.replace(/[$,%()\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
};

const aliases = {
  line: ["line", "line id", "lbb line", "lbb line id", "pdd line", "pdd line id", "line number", "item", "item number", "item no"],
  quantity: ["qty", "quantity", "quantity available", "units", "unit quantity"],
  unit: ["unit bid", "unit price", "bid price", "price each", "each", "unit cost", "price", "bid"],
  total: ["total bid", "line total", "extended price", "extended total", "total price", "amount", "total"],
};

function indexOf(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(clean(header)));
}

function parseSheet(rows: string[][]) {
  const headerRow = rows.findIndex((row) => {
    const headers = row.map(clean);
    return (
      (indexOf(headers, aliases.unit) >= 0 || indexOf(headers, aliases.total) >= 0) &&
      (indexOf(headers, aliases.line) >= 0 || indexOf(headers, aliases.quantity) >= 0)
    );
  });
  if (headerRow < 0) return [];
  const headers = rows[headerRow].map(clean),
    lineIndex = indexOf(headers, aliases.line),
    quantityIndex = indexOf(headers, aliases.quantity),
    unitIndex = indexOf(headers, aliases.unit),
    totalIndex = indexOf(headers, aliases.total),
    parsed: ImportedVendorBidLine[] = [];
  for (const row of rows.slice(headerRow + 1)) {
    const first = clean(row[lineIndex >= 0 ? lineIndex : 0]);
    if (first.includes("total") || row.some((cell) => clean(cell) === "grand total"))
      continue;
    const explicitLine = lineIndex >= 0 ? Math.trunc(money(row[lineIndex])) : 0,
      quantity = quantityIndex >= 0 ? money(row[quantityIndex]) : 0,
      sourceUnit = unitIndex >= 0 ? money(row[unitIndex]) : 0,
      sourceTotal = totalIndex >= 0 ? money(row[totalIndex]) : 0;
    if (lineIndex >= 0 && explicitLine <= 0) continue;
    if (sourceUnit <= 0 && sourceTotal <= 0) continue;
    parsed.push({
      lineNumber: explicitLine > 0 ? explicitLine : parsed.length + 1,
      quantity,
      unitBid: sourceUnit,
      lineTotal: sourceTotal,
    });
  }
  return parsed;
}

export async function readVendorBidSpreadsheet(
  file: File,
): Promise<ImportedVendorBidSheet> {
  try {
    const imported: ImportedVendorBidLine[] = [],
      importedSheets: string[] = [];
    for (const sheet of await readSpreadsheetFile(file,{label:"bid spreadsheet"})) {
      const lines = parseSheet(sheet.rows);
      if (lines.length) {
        imported.push(...lines);
        importedSheets.push(sheet.name);
      }
    }
    if (imported.length) {
      const byLine = new Map<number, ImportedVendorBidLine>();
      for (const line of imported) {
        if (byLine.has(line.lineNumber))
          throw new Error(
            `Line ${line.lineNumber} appears more than once in the uploaded bid.`,
          );
        byLine.set(line.lineNumber, line);
      }
      return {
        lines: [...byLine.values()].sort((a, b) => a.lineNumber - b.lineNumber),
        sheetName:
          importedSheets.length === 1
            ? importedSheets[0]
            : `${importedSheets.length} worksheets`,
      };
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Please choose") ||
        error.message.includes("spreadsheet is empty") ||
        error.message.includes("must be 10 MB") ||
        error.message.includes("appears more than once"))
    )
      throw error;
    throw new Error("This bid spreadsheet could not be opened.");
  }
  throw new Error(
    "No priced bid lines were found. Include Line plus Unit Bid, or Qty plus Total.",
  );
}
