import { readSpreadsheetFile, type SpreadsheetRows } from "./spreadsheetFile";

export type ImportedBoxAwardGroup = {
  boxNumber: string;
  controlNumber: string;
  quantity: number;
  lineNumbers: number[];
};

export type ImportedBoxAwardWorkbook = {
  boxes: ImportedBoxAwardGroup[];
  sheetName: string;
  totalQuantity: number;
  sourceLineCount: number;
};

const clean = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const number = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[$,()\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const aliases = {
  box: [
    "box", "box no", "box number",
    "lot", "lot no", "lot number",
    "container", "container no", "container number",
  ],
  control: ["control", "control no", "control number"],
  quantity: ["qty", "quantity", "units", "unit quantity"],
};

function indexOf(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(clean(header)));
}

function isTotalRow(row: string[]) {
  return row.some((cell) =>
    /^(grand )?totals?( bid)?$|^(?:box|lot) totals?$/.test(clean(cell)),
  );
}

function parseSheet(sheet: SpreadsheetRows) {
  const headerRow = sheet.rows.findIndex((row) => {
    const headers = row.map(clean);
    return indexOf(headers, aliases.box) >= 0 && indexOf(headers, aliases.quantity) >= 0;
  });
  if (headerRow < 0) return null;
  const headers = sheet.rows[headerRow].map(clean),
    boxIndex = indexOf(headers, aliases.box),
    controlIndex = indexOf(headers, aliases.control),
    quantityIndex = indexOf(headers, aliases.quantity),
    groups = new Map<string, ImportedBoxAwardGroup>();
  let currentBox = "", currentControl = "", sourceLine = 0;
  for (const row of sheet.rows.slice(headerRow + 1)) {
    if (!row.some((cell) => String(cell || "").trim()) || isTotalRow(row)) continue;
    const explicitBox = String(row[boxIndex] || "").replace(/^(?:box|lot)\s*/i, "").trim(),
      explicitControl = controlIndex >= 0 ? String(row[controlIndex] || "").trim() : "",
      quantity = Math.trunc(number(row[quantityIndex]));
    if (explicitBox) currentBox = explicitBox;
    if (explicitControl) currentControl = explicitControl;
    if (!currentBox || quantity < 1) continue;
    sourceLine += 1;
    const group = groups.get(currentBox) || {
      boxNumber: currentBox,
      controlNumber: currentControl,
      quantity: 0,
      lineNumbers: [],
    };
    group.controlNumber ||= currentControl;
    group.quantity += quantity;
    group.lineNumbers.push(sourceLine);
    groups.set(currentBox, group);
  }
  const boxes = [...groups.values()];
  if (!boxes.length) return null;
  return {
    boxes,
    sheetName: sheet.name,
    totalQuantity: boxes.reduce((sum, box) => sum + box.quantity, 0),
    sourceLineCount: sourceLine,
    score: (/detail/i.test(sheet.name) ? 100000 : 0) + boxes.length * 1000 + sourceLine,
  };
}

export async function readBoxAwardSpreadsheet(
  file: File,
): Promise<ImportedBoxAwardWorkbook> {
  const parsed = (await readSpreadsheetFile(file, { label: "box-award spreadsheet" }))
    .map(parseSheet)
    .filter((sheet): sheet is NonNullable<typeof sheet> => Boolean(sheet))
    .sort((a, b) => b.score - a.score)[0];
  if (!parsed)
    throw new Error(
      "No box or lot rows were found. The spreadsheet needs Box # or Lot # and Qty columns.",
    );
  return {
    boxes: parsed.boxes.sort((a, b) =>
      a.boxNumber.localeCompare(b.boxNumber, undefined, { numeric: true }),
    ),
    sheetName: parsed.sheetName,
    totalQuantity: parsed.totalQuantity,
    sourceLineCount: parsed.sourceLineCount,
  };
}
