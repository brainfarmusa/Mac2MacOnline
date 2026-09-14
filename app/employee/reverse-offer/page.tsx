"use client";
import { useEffect, useMemo, useState } from "react";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  clearPddSession,
  currentPddSession,
  pddAuthFetch,
  pddSupabaseKey,
  pddSupabaseUrl,
  uploadPddDocument,
  type PddSession,
} from "../../../lib/pdd-auth";
import { createWebsiteBrandedOrderPdfBlob } from "../../../lib/orderPdf";
import { createOrderSpreadsheetBlob } from "../../../lib/orderSpreadsheet";
import "./purchase-order.css";

type Profile = { email: string; display_name: string };
type AuthUser = { id: string; email?: string };
type BidLine = { lineNumber: number; quantity: number; unitBid: number };
type Bid = {
  internal_bid_number: string;
  deal_number: string;
  company: string;
  total_bid: number;
  submitted_at: string;
  status: string;
  line_count: number;
  line_items?: BidLine[];
};
type Deal = {
  id: string;
  source_upload_id: string | null;
  deal_number: string;
  direction: "buying" | "selling";
  title: string;
  vendor_name: string;
  owner_name: string;
  owner_email: string;
  status: string;
};
type Estimate = { deal_number: string; proposed_amount: number };
type Source = { row: number; quantity: number };
type Vendor = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  created_by: string;
  created_by_name: string;
  created_by_email: string;
};
type UploadLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
  sources: Source[];
};
type Upload = {
  id: string;
  original_name: string;
  storage_path: string;
  header_row: number;
  vendor_id: string;
  quantified_lines: UploadLine[];
  vendor: Vendor;
};
type Pricing = { margin: number; target: number; mode: "margin" | "total" };
type PricedLine = BidLine & { unitPrice: number; lineTotal: number };

const col = (index: number) => {
  let n = index + 1,
    s = "";
  while (n) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};
const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const safe = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "Vendor";
const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const productSku = (values: Record<string, string>) =>
  values.SKU ||
  values["Part Number"] ||
  values["Part #"] ||
  values["Model Number"] ||
  values.Model ||
  "";
const productDescription = (values: Record<string, string>, line: number) =>
  Object.values(values).filter(Boolean).slice(0, 8).join(" · ") ||
  `Deal line ${line}`;
function pricedLines(bid: Bid, target: number): PricedLine[] {
  const lines = bid.line_items || [],
    weights = lines.map((line) => Math.max(0, line.unitBid * line.quantity)),
    weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (!lines.length || weightTotal <= 0) return [];
  const targetCents = Math.round(target * 100),
    raw = weights.map((weight) => (targetCents * weight) / weightTotal),
    cents = raw.map(Math.floor);
  const remaining = targetCents - cents.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++) cents[order[i % order.length].index]++;
  return lines.map((line, index) => {
    const lineTotal = cents[index] / 100;
    return {
      ...line,
      lineTotal,
      unitPrice: line.quantity ? lineTotal / line.quantity : 0,
    };
  });
}
function addCell(
  doc: Document,
  row: Element,
  ref: string,
  value: string | number,
  style?: number,
) {
  const existing = [...row.getElementsByTagNameNS("*", "c")].find(
    (candidate) => candidate.getAttribute("r") === ref,
  );
  existing?.remove();
  const cell = doc.createElementNS(
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "c",
  );
  cell.setAttribute("r", ref);
  if (style !== undefined) cell.setAttribute("s", String(style));
  if (typeof value === "number") {
    const v = doc.createElementNS(cell.namespaceURI, "v");
    v.textContent = String(Math.round(value * 1_000_000) / 1_000_000);
    cell.append(v);
  } else {
    cell.setAttribute("t", "inlineStr");
    const is = doc.createElementNS(cell.namespaceURI, "is"),
      t = doc.createElementNS(cell.namespaceURI, "t");
    t.textContent = value;
    is.append(t);
    cell.append(is);
  }
  const next = [...row.getElementsByTagNameNS("*", "c")].find(
    (candidate) => cellColumn(candidate.getAttribute("r") || "A1") > cellColumn(ref),
  );
  if (next) row.insertBefore(cell, next);
  else row.append(cell);
}
function addFormulaCell(
  doc: Document,
  row: Element,
  ref: string,
  formula: string,
  cached: number,
  style?: number,
) {
  const existing = [...row.getElementsByTagNameNS("*", "c")].find(
    (candidate) => candidate.getAttribute("r") === ref,
  );
  existing?.remove();
  const cell = doc.createElementNS(
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "c",
  );
  cell.setAttribute("r", ref);
  if (style !== undefined) cell.setAttribute("s", String(style));
  const f = doc.createElementNS(cell.namespaceURI, "f"),
    v = doc.createElementNS(cell.namespaceURI, "v");
  f.textContent = formula;
  v.textContent = String(Math.round(cached * 100) / 100);
  cell.append(f, v);
  const next = [...row.getElementsByTagNameNS("*", "c")].find(
    (candidate) => cellColumn(candidate.getAttribute("r") || "A1") > cellColumn(ref),
  );
  if (next) row.insertBefore(cell, next);
  else row.append(cell);
}
function addCurrencyStyle(files: ReturnType<typeof unzipSync>) {
  const path = "xl/styles.xml",
    decoder = new TextDecoder();
  if (!files[path]) return 0;
  const doc = new DOMParser().parseFromString(
      decoder.decode(files[path]),
      "application/xml",
    ),
    root = doc.documentElement;
  let numFmts = root.getElementsByTagNameNS("*", "numFmts")[0];
  if (!numFmts) {
    numFmts = doc.createElementNS(root.namespaceURI, "numFmts");
    numFmts.setAttribute("count", "0");
    root.insertBefore(numFmts, root.firstChild);
  }
  const ids = [...numFmts.getElementsByTagNameNS("*", "numFmt")].map(
      (node) => Number(node.getAttribute("numFmtId")) || 0,
    ),
    numFmtId = Math.max(176, ...ids) + 1,
    numFmt = doc.createElementNS(root.namespaceURI, "numFmt");
  numFmt.setAttribute("numFmtId", String(numFmtId));
  numFmt.setAttribute("formatCode", "$#,##0.00");
  numFmts.append(numFmt);
  numFmts.setAttribute("count", String(numFmts.children.length));
  const cellXfs = root.getElementsByTagNameNS("*", "cellXfs")[0];
  if (!cellXfs) return 0;
  const style = cellXfs.children.length,
    xf = doc.createElementNS(root.namespaceURI, "xf");
  for (const [key, value] of Object.entries({
    numFmtId: String(numFmtId),
    fontId: "0",
    fillId: "0",
    borderId: "0",
    xfId: "0",
    applyNumberFormat: "1",
  }))
    xf.setAttribute(key, value);
  cellXfs.append(xf);
  cellXfs.setAttribute("count", String(cellXfs.children.length));
  files[path] = strToU8(new XMLSerializer().serializeToString(doc));
  return style;
}

type ContainerSummaryLot = {
  box: string;
  control: string;
  quantity: number;
  total: number;
  detailSheet: string;
  detailTotalRow: number;
};

function mappedValue(values: Record<string, string>, headers: string[]) {
  const wanted = new Set(headers);
  return Object.entries(values).find(([header]) =>
    wanted.has(normalizedHeader(header)),
  )?.[1]?.trim() || "";
}

function addContainerLogSheet(
  files: ReturnType<typeof unzipSync>,
  lots: ContainerSummaryLot[],
  currencyStyle: number,
) {
  const decoder = new TextDecoder(),
    workbookPath = "xl/workbook.xml",
    relsPath = "xl/_rels/workbook.xml.rels",
    typesPath = "[Content_Types].xml",
    workbook = new DOMParser().parseFromString(decoder.decode(files[workbookPath]), "application/xml"),
    sheets = workbook.getElementsByTagNameNS("*", "sheets")[0],
    sheetNodes = [...sheets.getElementsByTagNameNS("*", "sheet")],
    rels = new DOMParser().parseFromString(decoder.decode(files[relsPath]), "application/xml"),
    relRoot = rels.documentElement,
    worksheetNumbers = [...relRoot.children]
      .map((node) => (node.getAttribute("Target") || "").match(/sheet(\d+)\.xml$/)?.[1])
      .map(Number)
      .filter(Number.isFinite),
    sheetNumber = Math.max(0, ...worksheetNumbers) + 1,
    relationNumbers = [...relRoot.children].map(
      (node) => Number((node.getAttribute("Id") || "").replace(/\D/g, "")) || 0,
    ),
    relId = `rId${Math.max(0, ...relationNumbers) + 1}`,
    relationship = rels.createElementNS(relRoot.namespaceURI, "Relationship");
  relationship.setAttribute("Id", relId);
  relationship.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet");
  relationship.setAttribute("Target", `worksheets/sheet${sheetNumber}.xml`);
  relRoot.append(relationship);
  files[relsPath] = strToU8(new XMLSerializer().serializeToString(rels));
  const sheet = workbook.createElementNS(sheets.namespaceURI, "sheet");
  sheet.setAttribute("name", "CONTAINER LOG");
  sheet.setAttribute("sheetId", String(Math.max(0, ...sheetNodes.map((node) => Number(node.getAttribute("sheetId")) || 0)) + 1));
  sheet.setAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "r:id", relId);
  sheets.insertBefore(sheet, sheets.firstChild);
  files[workbookPath] = strToU8(new XMLSerializer().serializeToString(workbook));
  const types = new DOMParser().parseFromString(decoder.decode(files[typesPath]), "application/xml"),
    typeRoot = types.documentElement,
    override = types.createElementNS(typeRoot.namespaceURI, "Override");
  override.setAttribute("PartName", `/xl/worksheets/sheet${sheetNumber}.xml`);
  override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml");
  typeRoot.append(override);
  files[typesPath] = strToU8(new XMLSerializer().serializeToString(types));
  const cells = (row: number, values: string[]) =>
      `<row r="${row}">${values.map((value, index) => `<c r="${col(index)}${row}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`).join("")}</row>`,
    lotRows = lots.map((lot, index) => {
      const row = index + 5,
        quotedSheet = lot.detailSheet.replace(/'/g, "''");
      return `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>${esc(lot.box)}</t></is></c><c r="B${row}" t="inlineStr"><is><t>LOT</t></is></c><c r="C${row}"><v>${lot.quantity}</v></c><c r="D${row}" t="inlineStr"><is><t>${esc(lot.control)}</t></is></c><c r="E${row}" s="${currencyStyle}"><f>'${esc(quotedSheet)}'!O${lot.detailTotalRow}</f><v>${lot.total}</v></c></row>`;
    }).join(""),
    lastLotRow = lots.length + 4,
    totalRow = lastLotRow + 2;
  files[`xl/worksheets/sheet${sheetNumber}.xml`] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="5" width="16" customWidth="1"/></cols><sheetData>${cells(1, ["CONTAINER LOG / LOT SUMMARY"])}${cells(4, ["BOX #", "TYPE", "QTY", "CONTROL #", "TOTAL BID"])}${lotRows}<row r="${totalRow}"><c r="B${totalRow}" t="inlineStr"><is><t>TOTAL</t></is></c><c r="C${totalRow}"><f>SUM(C5:C${lastLotRow})</f><v>${lots.reduce((sum, lot) => sum + lot.quantity, 0)}</v></c><c r="D${totalRow}" t="inlineStr"><is><t>TOTAL BID</t></is></c><c r="E${totalRow}" s="${currencyStyle}"><f>SUM(E5:E${lastLotRow})</f><v>${roundMoney(lots.reduce((sum, lot) => sum + lot.total, 0))}</v></c></row></sheetData></worksheet>`,
  );
}

function addPurchaseOrderSheet(
  files: ReturnType<typeof unzipSync>,
  upload: Upload,
  bid: Bid,
  pricing: Pricing,
  poNumber: string,
  currencyStyle: number,
  documentKind: "po" | "vendor-bid" = "po",
  terms: string[] = [],
) {
  const decoder = new TextDecoder(),
    workbookPath = "xl/workbook.xml",
    relsPath = "xl/_rels/workbook.xml.rels",
    typesPath = "[Content_Types].xml";
  const workbook = new DOMParser().parseFromString(
      decoder.decode(files[workbookPath]),
      "application/xml",
    ),
    sheets = workbook.getElementsByTagNameNS("*", "sheets")[0],
    sheetNodes = [...sheets.getElementsByTagNameNS("*", "sheet")],
    sheetNumber = sheetNodes.length + 1;
  const rels = new DOMParser().parseFromString(
      decoder.decode(files[relsPath]),
      "application/xml",
    ),
    relRoot = rels.documentElement,
    ids = [...relRoot.children].map(
      (node) => Number((node.getAttribute("Id") || "").replace(/\D/g, "")) || 0,
    ),
    relId = `rId${Math.max(0, ...ids) + 1}`;
  const relationship = rels.createElementNS(
    relRoot.namespaceURI,
    "Relationship",
  );
  relationship.setAttribute("Id", relId);
  relationship.setAttribute(
    "Type",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
  );
  relationship.setAttribute("Target", `worksheets/sheet${sheetNumber}.xml`);
  relRoot.append(relationship);
  files[relsPath] = strToU8(new XMLSerializer().serializeToString(rels));
  const sheet = workbook.createElementNS(sheets.namespaceURI, "sheet");
  sheet.setAttribute(
    "name",
    documentKind === "vendor-bid" ? "Official Bid" : "Purchase Order",
  );
  sheet.setAttribute(
    "sheetId",
    String(
      Math.max(
        0,
        ...sheetNodes.map((node) => Number(node.getAttribute("sheetId")) || 0),
      ) + 1,
    ),
  );
  sheet.setAttributeNS(
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "r:id",
    relId,
  );
  if (documentKind === "vendor-bid" && sheets.firstChild)
    sheets.insertBefore(sheet, sheets.firstChild);
  else sheets.append(sheet);
  files[workbookPath] = strToU8(
    new XMLSerializer().serializeToString(workbook),
  );
  const types = new DOMParser().parseFromString(
      decoder.decode(files[typesPath]),
      "application/xml",
    ),
    typeRoot = types.documentElement,
    override = types.createElementNS(typeRoot.namespaceURI, "Override");
  override.setAttribute("PartName", `/xl/worksheets/sheet${sheetNumber}.xml`);
  override.setAttribute(
    "ContentType",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  );
  typeRoot.append(override);
  files[typesPath] = strToU8(new XMLSerializer().serializeToString(types));
  const vendor = upload.vendor,
    date = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date()),
    address = [
      vendor.address1,
      vendor.address2,
      [vendor.city, vendor.region, vendor.postal_code]
        .filter(Boolean)
        .join(", "),
      vendor.country,
    ].filter(Boolean);
  const rows: Array<Array<string | number>> = [
    ["Mac2MacOnline"],
    [documentKind === "vendor-bid" ? "OFFICIAL VENDOR BID" : "PURCHASE ORDER"],
    [documentKind === "vendor-bid" ? "Bid Number" : "PO Number", poNumber, "Date", date],
    ["Vendor", vendor.company_name],
    ["Contact", vendor.contact_name],
    ["Email", vendor.email],
    ["Phone", vendor.phone],
    ["Address", address.join(" · ")],
    [],
    ["Deal", bid.deal_number],
    [documentKind === "vendor-bid" ? "Official Bid Total" : "PO Total", pricing.target],
    [],
    ["Line", "Description", "Qty", "Unit Price", "Line Total"],
  ];
  const byLine = new Map(
    upload.quantified_lines.map((line) => [line.line, line]),
  );
  for (const line of pricedLines(bid, pricing.target)) {
    const source = byLine.get(line.lineNumber),
      description = source
        ? Object.values(source.values).filter(Boolean).slice(0, 5).join(" · ")
        : `Deal line ${line.lineNumber}`;
    rows.push([
      line.lineNumber,
      description,
      line.quantity,
      line.unitPrice,
      line.lineTotal,
    ]);
  }
  rows.push([], ["TOTAL", "", "", "", pricing.target]);
  const totalRowIndex = rows.length;
  if (documentKind === "vendor-bid" && terms.length) {
    rows.push([], ["OFFER TERMS"]);
    for (const term of terms) rows.push(["", term]);
  }
  const firstLine = 14,
    lastLine = 13 + pricedLines(bid, pricing.target).length,
    qtyTotal = pricedLines(bid, pricing.target).reduce(
      (sum, line) => sum + line.quantity,
      0,
    );
  const xmlRows = rows
    .map((values, rowIndex) => {
      const rowNumber = rowIndex + 1;
      if (rowNumber === totalRowIndex)
        return `<row r="${rowNumber}"><c r="A${rowNumber}" t="inlineStr"><is><t>TOTAL</t></is></c><c r="C${rowNumber}"><f>SUM(C${firstLine}:C${lastLine})</f><v>${qtyTotal}</v></c><c r="E${rowNumber}" s="${currencyStyle}"><f>SUM(E${firstLine}:E${lastLine})</f><v>${pricing.target}</v></c></row>`;
      return `<row r="${rowNumber}">${values.map((value, index) => (typeof value === "number" ? `<c r="${col(index)}${rowNumber}"${index >= 3 ? ` s="${currencyStyle}"` : ""}><v>${Math.round(value * 100) / 100}</v></c>` : `<c r="${col(index)}${rowNumber}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`)).join("")}</row>`;
    })
    .join("");
  files[`xl/worksheets/sheet${sheetNumber}.xml`] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="58" customWidth="1"/><col min="3" max="5" width="18" customWidth="1"/></cols><sheetData>${xmlRows}</sheetData></worksheet>`,
  );
}

async function createPurchaseOrderPdf(
  upload: Upload,
  bid: Bid,
  pricing: Pricing,
  poNumber: string,
  preparedBy: string,
  documentKind: "po" | "vendor-bid" = "po",
  terms: string[] = [],
) {
  const vendor = upload.vendor,
    address = [
      vendor.address1,
      vendor.address2,
      [vendor.city, vendor.region, vendor.postal_code]
        .filter(Boolean)
        .join(", "),
      vendor.country,
    ].filter(Boolean),
    byLine = new Map(upload.quantified_lines.map((line) => [line.line, line]));
  const lines = pricedLines(bid, pricing.target).map((line) => {
    const source = byLine.get(line.lineNumber);
    return {
      line: line.lineNumber,
      description: source
        ? Object.values(source.values).filter(Boolean).slice(0, 5).join(" - ")
        : `Deal line ${line.lineNumber}`,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.lineTotal,
    };
  });
  const data = {
    kind:
      documentKind === "vendor-bid"
        ? "OFFICIAL VENDOR BID"
        : "PURCHASE ORDER",
    orderNumber: poNumber,
    dealNumber: bid.deal_number,
    partyLabel: "Vendor",
    partyName: vendor.company_name,
    contact: vendor.contact_name,
    email: vendor.email,
    phone: vendor.phone,
    address: address.join(" | "),
    generatedBy: preparedBy,
    issuerAddress: "1420 Locust Street, Chico, CA 95928",
    issuerPhone: "(530) 896-0490",
    issuerEmail: "sales@mac2maconline.com",
    lines,
    total: pricing.target,
    notes:
      documentKind === "vendor-bid"
        ? terms
        : [
            pricing.mode === "total"
              ? `Unit prices were proportionally adjusted to the exact PO total of ${pricing.target.toLocaleString(undefined, { style: "currency", currency: "USD" })}.`
              : `Profit margin of ${pricing.margin.toFixed(4)}% has already been removed from the customer offer.`,
          ],
    fileBase: `${poNumber}-${safe(vendor.company_name)}`,
  };
  return createWebsiteBrandedOrderPdfBlob(data);
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const normalizedHeader = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const quantityHeaders = new Set([
  "qty",
  "quantity",
  "units",
  "unitcount",
  "count",
]);
const sourceTabValue = (values: Record<string, string>) =>
  Object.entries(values).find(
    ([header]) =>
      normalizedHeader(header) === "sourcetab" ||
      ["lot", "lotno", "lotnumber"].includes(normalizedHeader(header)),
  )?.[1]?.trim() || "";
const normalizedSheetLot = (value: string) =>
  normalizedHeader(value).replace(/^(?:unicor|uincor)/, "");
function cellColumn(reference: string) {
  const letters = (reference.match(/^[A-Z]+/i)?.[0] || "A").toUpperCase();
  let number = 0;
  for (const letter of letters)
    number = number * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, number - 1);
}
function cellValue(cell: Element, shared: string[]) {
  const type = cell.getAttribute("t"),
    raw = cell.getElementsByTagNameNS("*", "v")[0]?.textContent || "";
  if (type === "s") return shared[Number(raw)] || "";
  if (type === "inlineStr")
    return [...cell.getElementsByTagNameNS("*", "t")]
      .map((text) => text.textContent || "")
      .join("");
  return raw;
}
function originalWorkbookSheets(files: ReturnType<typeof unzipSync>) {
  const decoder = new TextDecoder(),
    workbook = new DOMParser().parseFromString(
      decoder.decode(files["xl/workbook.xml"]),
      "application/xml",
    ),
    relationships = new DOMParser().parseFromString(
      decoder.decode(files["xl/_rels/workbook.xml.rels"]),
      "application/xml",
    ),
    targets = new Map(
      [...relationships.getElementsByTagNameNS("*", "Relationship")].map(
        (relationship) => [
          relationship.getAttribute("Id") || "",
          relationship.getAttribute("Target") || "",
        ],
      ),
    );
  return [...workbook.getElementsByTagNameNS("*", "sheet")]
    .map((sheet) => {
      const relation =
          sheet.getAttributeNS(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            "id",
          ) || sheet.getAttribute("r:id") || "",
        target = targets.get(relation) || "",
        path = target.startsWith("/")
          ? target.slice(1)
          : `xl/${target.replace(/^\.\//, "")}`;
      return { name: sheet.getAttribute("name") || "", path };
    })
    .filter((sheet) => files[sheet.path]);
}

function assertOriginalSheetsPreserved(
  files: ReturnType<typeof unzipSync>,
  original: Array<{ name: string; path: string }>,
) {
  const finalNames = new Set(
      originalWorkbookSheets(files).map((sheet) => sheet.name.trim().toLowerCase()),
    ),
    missing = original.find(
      (sheet) => !finalNames.has(sheet.name.trim().toLowerCase()),
    );
  if (missing)
    throw new Error(
      `The original “${missing.name}” worksheet could not be preserved. No workbook was created.`,
    );
}

async function generatePurchaseOrder(
  file: Blob,
  upload: Upload,
  bid: Bid,
  pricing: Pricing,
  poNumber: string,
  documentKind: "po" | "vendor-bid" = "po",
  terms: string[] = [],
) {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer())),
    currencyStyle = addCurrencyStyle(files),
    workbookSheets = originalWorkbookSheets(files);
  if (!workbookSheets.length)
    throw new Error("The original workbook does not contain a worksheet.");
  const decoder = new TextDecoder(),
    shared = files["xl/sharedStrings.xml"]
      ? [...new DOMParser().parseFromString(decoder.decode(files["xl/sharedStrings.xml"]), "application/xml").getElementsByTagNameNS("*", "si")].map((item) =>
          [...item.getElementsByTagNameNS("*", "t")].map((text) => text.textContent || "").join(""),
        )
      : [],
    containerSummaryLots: ContainerSummaryLot[] = [];
  const uploadByLine = new Map(upload.quantified_lines.map((line) => [line.line, line])),
    allocations: Array<{
      lineNumber: number;
      tab: string;
      row: number;
      quantity: number;
      values: Record<string, string>;
      unitPrice: number;
      total: number;
    }> = [];
  for (const line of pricedLines(bid, pricing.target)) {
    const uploadedLine = uploadByLine.get(line.lineNumber);
    if (!uploadedLine)
      throw new Error(`Original source mapping is missing for line ${line.lineNumber}.`);
    const sources = uploadedLine.sources,
      sourceQty = sources.reduce((sum, source) => sum + source.quantity, 0);
    let assignedCents = 0;
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index],
        cents =
        index === sources.length - 1
          ? Math.round(line.lineTotal * 100) - assignedCents
          : Math.round((line.lineTotal * 100 * source.quantity) / sourceQty);
      assignedCents += cents;
      const total = cents / 100,
        adjusted = source.quantity ? total / source.quantity : 0;
      allocations.push({
        lineNumber: line.lineNumber,
        tab: sourceTabValue(uploadedLine.values),
        row: source.row,
        quantity: source.quantity,
        values: uploadedLine.values,
        unitPrice: adjusted,
        total,
      });
    }
  }
  const allocationsByTab = new Map<string, typeof allocations>();
  for (const allocation of allocations)
    allocationsByTab.set(allocation.tab, [...(allocationsByTab.get(allocation.tab) || []), allocation]);
  const usedSheets = new Set<string>();
  for (const [tab, tabAllocations] of allocationsByTab) {
    const expectedHeaders = new Set(
      tabAllocations.flatMap((allocation) =>
        Object.keys(allocation.values)
          .map(normalizedHeader)
          .filter((header) => header && header !== "sourcetab" && header !== "lot" && header !== "lotno" && header !== "lotnumber"),
      ),
    );
    const inspect = (sheet: { name: string; path: string }) => {
      const doc = new DOMParser().parseFromString(decoder.decode(files[sheet.path]), "application/xml"),
        sheetData = doc.getElementsByTagNameNS("*", "sheetData")[0],
        rows = sheetData ? [...sheetData.getElementsByTagNameNS("*", "row")] : [],
        rowCells = rows.map((row) => ({
          row,
          values: new Map([...row.getElementsByTagNameNS("*", "c")].map((cell) => [cellColumn(cell.getAttribute("r") || "A1"), cellValue(cell, shared)])),
        })),
        candidates = rowCells.map((item) => {
          const normalized = [...item.values.values()].map((value) => normalizedHeader(value)),
            qtyColumn = [...item.values].find(([, value]) => quantityHeaders.has(normalizedHeader(value)))?.[0] ?? -1,
            matches = normalized.filter((value) => expectedHeaders.has(value)).length;
          return { ...item, qtyColumn, score: matches + (qtyColumn >= 0 ? 20 : 0) };
        }).sort((left, right) => right.score - left.score),
        header = candidates[0],
        headerNumber = Number(header?.row.getAttribute("r")) || 0,
        isTotalRow = (item: (typeof rowCells)[number]) =>
          [...item.values.values()].some((value) =>
            /^(?:grand\s+total|sub\s*total|totals?)\s*:?\s*$/i.test(String(value).trim()),
          ),
        dataRows = header && header.qtyColumn >= 0
          ? rowCells.filter((item) => {
              const rowNumber = Number(item.row.getAttribute("r")) || 0,
                quantity = Number(String(item.values.get(header.qtyColumn) || "").replace(/,/g, ""));
              return rowNumber > headerNumber && Number.isFinite(quantity) && quantity > 0 && !isTotalRow(item);
            })
          : [];
      return {
        sheet,
        doc,
        sheetData,
        rows,
        header,
        headerNumber,
        rowCells,
        isTotalRow,
        dataRows,
        totalRows: rowCells.filter((item) => Number(item.row.getAttribute("r")) > headerNumber && isTotalRow(item)),
        score: header?.score || 0,
      };
    };
    const inspected = workbookSheets.map(inspect),
      exact = tab
        ? inspected.find(
            (item) =>
              item.sheet.name.trim().toLowerCase() === tab.toLowerCase() ||
              normalizedSheetLot(item.sheet.name) === normalizedSheetLot(tab),
          )
        : undefined,
      selectedSheet = exact || inspected.filter((item) => !usedSheets.has(item.sheet.path)).sort((left, right) => right.score - left.score || right.dataRows.length - left.dataRows.length)[0];
    if (!selectedSheet || !selectedSheet.sheetData || !selectedSheet.header || selectedSheet.header.qtyColumn < 0)
      throw new Error(`The original ${tab ? `“${tab}” ` : ""}worksheet rows could not be matched.`);
    usedSheets.add(selectedSheet.sheet.path);
    const lastHeaderColumn = Math.max(
        ...[...selectedSheet.header.values]
          .filter(([, value]) => String(value).trim())
          .map(([column]) => column),
        0,
      ),
      existingUnitBid = [...selectedSheet.header.values].find(([, value]) =>
        ["unitbid", "bidunit", "unitprice", "bid"].includes(normalizedHeader(value)),
      )?.[0],
      existingTotalBid = [...selectedSheet.header.values].find(([, value]) =>
        ["totalbid", "bidamount", "linetotal"].includes(normalizedHeader(value)),
      )?.[0],
      start = lastHeaderColumn + 1,
      unitBidColumn = existingUnitBid ?? start,
      totalBidColumn = existingTotalBid ?? unitBidColumn + 1,
      headerRow = selectedSheet.headerNumber;
    if (existingUnitBid === undefined)
      addCell(selectedSheet.doc, selectedSheet.header.row, `${col(unitBidColumn)}${headerRow}`, "Unit Bid");
    if (documentKind !== "vendor-bid" && existingTotalBid === undefined)
      addCell(selectedSheet.doc, selectedSheet.header.row, `${col(totalBidColumn)}${headerRow}`, "Total Bid");
    const totalsByRow = new Map<number, number>(),
      usedTargetRows = new Set<number>(),
      assignedLineByRow = new Map<number, number>(),
      sourceColumns = new Map<string, number>(),
      comparable = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase(),
      candidateScore = (item: (typeof selectedSheet.rowCells)[number], allocation: (typeof tabAllocations)[number]) => {
        let score = 0,
          compared = 0;
        for (const [header, expected] of Object.entries(allocation.values)) {
          const normalized = normalizedHeader(header);
          if (["sourcetab", "lot", "lotno", "lotnumber"].includes(normalized) || !String(expected).trim()) continue;
          const column = sourceColumns.get(normalized);
          if (column === undefined) continue;
          compared++;
          score += comparable(String(item.values.get(column) || "")) === comparable(String(expected)) ? 4 : -1;
        }
        const actualQuantity = Number(String(item.values.get(selectedSheet.header.qtyColumn) || "").replace(/,/g, ""));
        if (Number.isFinite(actualQuantity) && actualQuantity === allocation.quantity) score += 2;
        return compared ? score : 0;
      };
    // Some vendor workbooks contain hidden helper columns with duplicate
    // headings. Prefer the first (visible table) occurrence for row matching.
    for (const [column, value] of selectedSheet.header.values) {
      const header = normalizedHeader(value);
      if (header && !sourceColumns.has(header)) sourceColumns.set(header, column);
    }
    for (const allocation of tabAllocations) {
      const allCandidates = selectedSheet.rowCells
          .filter((item) => {
            const row = Number(item.row.getAttribute("r")) || 0;
            return row > headerRow && !selectedSheet.isTotalRow(item);
          })
          .map((item) => ({ item, score: candidateScore(item, allocation) }))
          .sort((left, right) => right.score - left.score),
        candidates = allCandidates.filter(({ item }) => !usedTargetRows.has(Number(item.row.getAttribute("r")) || 0)),
        direct = selectedSheet.dataRows.find(
          (item) => Number(item.row.getAttribute("r")) === allocation.row && !usedTargetRows.has(allocation.row),
        ),
        reusable = allCandidates.find(({ item, score }) => {
          const row = Number(item.row.getAttribute("r")) || 0;
          return score > 0 && assignedLineByRow.get(row) === allocation.lineNumber;
        }),
        target = (tab ? candidates[0]?.score > 0 ? candidates[0].item.row : undefined : direct?.row)
          || reusable?.item.row
          || selectedSheet.dataRows.find((item) => !usedTargetRows.has(Number(item.row.getAttribute("r")) || 0))?.row
          || candidates[0]?.item.row,
        targetRow = Number(target?.getAttribute("r")) || 0;
      if (!target || !targetRow)
        throw new Error(`A priced line could not be returned to its original row on “${selectedSheet.sheet.name}”.`);
      usedTargetRows.add(targetRow);
      assignedLineByRow.set(targetRow, allocation.lineNumber);
      const rowTotal = roundMoney((totalsByRow.get(targetRow) || 0) + allocation.total),
        rowQuantity = Number(String(selectedSheet.rowCells.find((item) => item.row === target)?.values.get(selectedSheet.header.qtyColumn) || allocation.quantity).replace(/,/g, "")),
        rowUnitPrice = rowQuantity ? rowTotal / rowQuantity : allocation.unitPrice;
      addCell(selectedSheet.doc, target, `${col(unitBidColumn)}${targetRow}`, rowUnitPrice, currencyStyle);
      totalsByRow.set(targetRow, rowTotal);
      if (documentKind !== "vendor-bid")
        addFormulaCell(
          selectedSheet.doc,
          target,
          `${col(totalBidColumn)}${targetRow}`,
          `ROUND(${col(unitBidColumn)}${targetRow}*${col(selectedSheet.header.qtyColumn)}${targetRow},2)`,
          rowTotal,
          currencyStyle,
        );
    }
    if (documentKind !== "vendor-bid") {
      let lotStartRow = headerRow + 1;
      for (const total of selectedSheet.totalRows) {
        const totalRowNumber = Number(total.row.getAttribute("r")) || 0,
          pricedRows = [...totalsByRow.keys()].filter((row) => row >= lotStartRow && row < totalRowNumber),
          firstPricedRow = Math.min(...pricedRows),
          lastPricedRow = Math.max(...pricedRows);
        if (pricedRows.length) {
          addCell(selectedSheet.doc, total.row, `${col(unitBidColumn)}${totalRowNumber}`, "Total:");
          addFormulaCell(
            selectedSheet.doc,
            total.row,
            `${col(totalBidColumn)}${totalRowNumber}`,
            `SUM(${col(totalBidColumn)}${firstPricedRow}:${col(totalBidColumn)}${lastPricedRow})`,
            roundMoney(pricedRows.reduce((sum, row) => sum + (totalsByRow.get(row) || 0), 0)),
            currencyStyle,
          );
          const lotAllocations = tabAllocations.filter(
              (allocation) => allocation.row >= lotStartRow && allocation.row < totalRowNumber,
            ),
            firstLot = lotAllocations[0];
          if (firstLot)
            containerSummaryLots.push({
              box: mappedValue(firstLot.values, ["box", "boxnumber", "lot", "lotnumber"]) || `Lot ${containerSummaryLots.length + 1}`,
              control: mappedValue(firstLot.values, ["control", "controlnumber"]),
              quantity: lotAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0),
              total: roundMoney(lotAllocations.reduce((sum, allocation) => sum + allocation.total, 0)),
              detailSheet: selectedSheet.sheet.name,
              detailTotalRow: totalRowNumber,
            });
        }
        lotStartRow = totalRowNumber + 1;
      }
      const meaningfulRows = [
        headerRow,
        ...selectedSheet.dataRows.map((item) => Number(item.row.getAttribute("r")) || 0),
        ...selectedSheet.totalRows.map((item) => Number(item.row.getAttribute("r")) || 0),
        ],
        last = Math.max(...meaningfulRows) + 2,
        totalRow = selectedSheet.doc.createElementNS(selectedSheet.sheetData.namespaceURI, "row"),
        sheetTotal = roundMoney(tabAllocations.reduce((sum, allocation) => sum + allocation.total, 0)),
        subtotalRefs = selectedSheet.totalRows
          .map((item) => Number(item.row.getAttribute("r")) || 0)
          .filter((row) => row > headerRow)
          .map((row) => `${col(totalBidColumn)}${row}`),
        grandFormula = subtotalRefs.length
          ? `SUM(${subtotalRefs.join(",")})`
          : `SUM(${col(totalBidColumn)}${headerRow + 1}:${col(totalBidColumn)}${last - 2})`;
      totalRow.setAttribute("r", String(last));
      addCell(selectedSheet.doc, totalRow, `${col(unitBidColumn)}${last}`, "TOTAL");
      addFormulaCell(selectedSheet.doc, totalRow, `${col(totalBidColumn)}${last}`, grandFormula, sheetTotal, currencyStyle);
      selectedSheet.sheetData.append(totalRow);
    }
    files[selectedSheet.sheet.path] = strToU8(new XMLSerializer().serializeToString(selectedSheet.doc));
  }
  // Reverted vendor-bid Excel files must remain the vendor's original
  // workbook. Do not prepend a rebuilt summary sheet that flattens its lots.
  // The separately generated PDF remains the official branded bid document.
  if (
    !workbookSheets.some((sheet) => /^container\s+log$/i.test(sheet.name.trim())) &&
    containerSummaryLots.length
  )
    addContainerLogSheet(files, containerSummaryLots, currencyStyle);
  if (documentKind !== "vendor-bid")
    addPurchaseOrderSheet(
      files,
      upload,
      bid,
      pricing,
      poNumber,
      currencyStyle,
      documentKind,
      terms,
    );
  // Revert is additive: every worksheet from the stored vendor original,
  // including Container Log / summary tabs, must survive unchanged.
  assertOriginalSheetsPreserved(files, workbookSheets);
  const zipped = zipSync(files, { level: 6 }),
    bytes = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer;
  return {
    grand: pricing.target,
    excel: new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  };
}

export default function PurchaseOrderGenerator({
  vendorBidMode = false,
}: {
  vendorBidMode?: boolean;
} = {}) {
  const isVendorBid = vendorBidMode;
  const [session, setSession] = useState<PddSession | null>(null),
    [user, setUser] = useState<AuthUser | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [deals, setDeals] = useState<Deal[]>([]),
    [estimates, setEstimates] = useState<Estimate[]>([]),
    [selectedDeal, setSelectedDeal] = useState(""),
    [bids, setBids] = useState<Bid[]>([]),
    [selected, setSelected] = useState(""),
    [sourceUpload, setSourceUpload] = useState<Upload | null>(null),
    [sourceLoading, setSourceLoading] = useState(false),
    [pricingMode, setPricingMode] = useState<"margin" | "total">("margin"),
    [margin, setMargin] = useState("20"),
    [poTotal, setPoTotal] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [vendor, setVendor] = useState<Vendor | null>(null),
    [generated, setGenerated] = useState<{
      poNumber: string;
      vendor: Vendor;
      excel: Blob;
      pdf: Blob;
      originalName: string;
    } | null>(null);
  const [offerTerms, setOfferTerms] = useState(
    "Offer is subject to verification of quantities, configurations, condition, and lawful ownership.\nFinal pricing is subject to inspection and testing.\nUnless otherwise agreed in writing, the vendor is responsible for secure packaging and accurate inventory representation.\nAcceptance of this bid does not create a purchase order; a purchase order will be issued separately after final approval.",
  );
  const [reviewOpen, setReviewOpen] = useState(false),
    [reviewUrl, setReviewUrl] = useState(""),
    [emailTo, setEmailTo] = useState(""),
    [emailSubject, setEmailSubject] = useState(""),
    [emailMessage, setEmailMessage] = useState(""),
    [emailBusy, setEmailBusy] = useState(false);

  function openReview() {
    if (!generated) return;
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(URL.createObjectURL(generated.pdf));
    setEmailTo(generated.vendor.email || "");
    setEmailSubject(isVendorBid ? `Mac2MacOnline offer ${generated.poNumber}` : `Purchase award for ${generated.poNumber}`);
    setEmailMessage(isVendorBid
      ? `Hello ${generated.vendor.contact_name || generated.vendor.company_name},\n\nPlease review the attached official offer for ${generated.poNumber}. The PDF contains the offer total and terms, and the Excel workbook contains the detailed pricing.\n\nPlease reply to confirm acceptance or with any questions.`
      : `Hello ${generated.vendor.contact_name || generated.vendor.company_name},\n\nMac2MacOnline confirms the purchase award for ${generated.poNumber}. Please review the attached purchase order and terms and reply to confirm receipt.`,
    );
    setReviewOpen(true);
  }
  function closeReview() {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl("");
    setReviewOpen(false);
  }
  async function emailVendorOffer() {
    if (!session || !generated) return;
    setEmailBusy(true);
    setMessage("");
    try {
      let response:Response;
      if(isVendorBid){
        const pdfName=`${generated.poNumber}-${safe(generated.vendor.company_name)}.pdf`,form=new FormData();
        form.set("to",emailTo);form.set("subject",emailSubject);form.set("message",emailMessage);form.set("pdf",new File([generated.pdf],pdfName,{type:"application/pdf"}));form.set("excel",new File([generated.excel],generated.originalName,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
        response=await fetch("/api/admin/vendor-offer-email",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`},body:form});
      }else response=await fetch("/api/admin/finalization",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"send_vendor",dealNumber:sourceDealNumber,to:emailTo,subject:emailSubject,message:emailMessage,terms:offerTerms})});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || "The vendor offer email could not be delivered.");
      closeReview();
      window.location.assign(`/employee/finalize-deal?deal=${encodeURIComponent(sourceDealNumber||selectedDeal)}&email=vendor`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The vendor offer email could not be delivered.");
    } finally { setEmailBusy(false); }
  }
  useEffect(() => {
    (async () => {
      const active = await currentPddSession();
      if (!active) {
        window.location.replace("/employee-login");
        return;
      }
      setSession(active);
      const [bidResponse, dealResponse, userResponse, profileResponse] = await Promise.all([
        fetch("/api/admin/bids", {
          headers: { Authorization: `Bearer ${active.access_token}` },
        }),
        fetch("/api/admin/deals", {
          headers: { Authorization: `Bearer ${active.access_token}` },
        }),
        pddAuthFetch("/auth/v1/user", {
          headers: { Authorization: `Bearer ${active.access_token}` },
        }),
        pddAuthFetch("/rest/v1/pdd_employee_access?select=email,display_name", {
          headers: { Authorization: `Bearer ${active.access_token}` },
        }),
      ]);
      if (
        bidResponse.status === 401 ||
        dealResponse.status === 401 ||
        !userResponse.ok ||
        !profileResponse.ok
      ) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      const data = await bidResponse.json(),
        dealData = dealResponse.ok ? await dealResponse.json() : { deals: [] },
        requested = new URLSearchParams(window.location.search).get("bid"),
        requestedDeal = new URLSearchParams(window.location.search).get("deal")?.toUpperCase(),
        all = data.bids || [];
      setBids(
        [...all].sort((a: Bid, b: Bid) =>
          `${a.deal_number} ${a.company}`.localeCompare(`${b.deal_number} ${b.company}`),
        ),
      );
      setDeals(
        [...(dealData.deals || [])]
          .filter(
            (deal: Deal) =>
              deal.direction !== "buying" &&
              !deal.deal_number.toUpperCase().startsWith("WTB") &&
              ["open", "working", "pending"].includes(deal.status),
          )
          .sort((a: Deal, b: Deal) =>
            a.deal_number.localeCompare(b.deal_number),
          ),
      );
      setEstimates(dealData.estimates || []);
      const requestedBid = all.find(
        (bid: Bid) => bid.internal_bid_number === requested,
      );
      setSelectedDeal(
        isVendorBid ? requestedBid?.deal_number || requestedDeal || "" : "",
      );
      setSelected(
        all.some((bid: Bid) => bid.internal_bid_number === requested)
          ? requested
          : isVendorBid
            ? ""
            : all.find((bid: Bid) => bid.status === "won")?.internal_bid_number ||
              all[0]?.internal_bid_number ||
              "",
      );
      setUser((await userResponse.json()) as AuthUser);
      setProfile(((await profileResponse.json()) as Profile[])[0] || null);
    })();
  }, [isVendorBid]);
  const storedBid = useMemo(
    () => bids.find((bid) => bid.internal_bid_number === selected),
    [bids, selected],
  );
  useEffect(() => {
    if (!isVendorBid || !selectedDeal) return;
    const highest = [...bids]
      .filter(
        (bid) =>
          bid.deal_number === selectedDeal &&
          ["submitted", "won"].includes(bid.status) &&
          Number(bid.total_bid) > 0,
      )
      .sort((a, b) => Number(b.total_bid) - Number(a.total_bid))[0];
    setSelected(highest?.internal_bid_number || "");
    setGenerated(null);
  }, [bids, isVendorBid, selectedDeal]);
  const chosen = storedBid;
  const sourceDealNumber = isVendorBid ? selectedDeal : storedBid?.deal_number;
  const sourceUploadId = deals.find(
    (deal) => deal.deal_number === sourceDealNumber,
  )?.source_upload_id;
  const customerTotal = Number(chosen?.total_bid || 0),
    enteredTotal = Number(poTotal),
    calculatedTarget =
      pricingMode === "total"
        ? enteredTotal
        : roundMoney(customerTotal * (1 - (Number(margin) || 0) / 100)),
    calculatedMargin =
      customerTotal > 0 ? (1 - calculatedTarget / customerTotal) * 100 : 0;
  useEffect(()=>{
    if(isVendorBid||!storedBid)return;
    const saved=estimates.find(item=>item.deal_number===storedBid.deal_number);
    if(saved&&Number(saved.proposed_amount)>0){setPricingMode("total");setPoTotal(String(saved.proposed_amount))}
    else{setPricingMode("margin");setMargin("20");setPoTotal("")}
  },[isVendorBid,storedBid?.deal_number,estimates]);
  useEffect(() => {
    setVendor(null);
    setSourceUpload(null);
    const dealNumber = sourceDealNumber;
    if (!session || !dealNumber) {
      setSourceLoading(false);
      return;
    }
    setSourceLoading(true);
    void (async () => {
      const uploadFilter = sourceUploadId
        ? `id=eq.${encodeURIComponent(sourceUploadId)}`
        : `deal_number=eq.${encodeURIComponent(dealNumber)}&order=updated_at.desc`;
      const response = await pddAuthFetch(
        `/rest/v1/pdd_deal_uploads?select=id,original_name,storage_path,header_row,vendor_id,quantified_lines,vendor:pdd_vendors(id,company_name,contact_name,email,phone,address1,address2,city,region,postal_code,country,created_by,created_by_name,created_by_email)&${uploadFilter}&limit=1`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (response.ok) {
        const rows = (await response.json()) as Upload[];
        setSourceUpload(rows[0] || null);
        setVendor(rows[0]?.vendor || null);
      }
      setSourceLoading(false);
    })();
  }, [session, sourceDealNumber, sourceUploadId]);

  async function generate() {
    if (!session || !user || !profile || !chosen || (isVendorBid && !selectedDeal)) return;
    if (
      chosen.line_count === 0 &&
      !(isVendorBid && pricingMode === "total")
    ) {
      setMessage(
        isVendorBid
          ? "For a take-all offer, choose Enter exact vendor bid total. The total will be divided equally across all items."
          : "This take-all offer needs itemized line pricing before a purchase order can be created.",
      );
      return;
    }
    const target = calculatedTarget,
      percent = calculatedMargin;
    if (
      !Number.isFinite(target) ||
      target <= 0 ||
      target > Number(chosen.total_bid)
    ) {
      setMessage(
        `Enter a ${isVendorBid ? "vendor bid" : "PO"} total greater than $0 and no higher than the customer offer.`,
      );
      return;
    }
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      setMessage("Enter a margin from 0 through 99.99%.");
      return;
    }
    if (!isVendorBid && chosen.status !== "won") {
      setMessage(
        "Mark this customer offer as Won in Manage Deals before creating the purchase order.",
      );
      return;
    }
    setBusy(true);
    setGenerated(null);
    setMessage("");
    try {
      const bidResponse = await fetch(
        `/api/admin/bids?bid=${encodeURIComponent(selected)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const bidData = await bidResponse.json() as { bid: Bid; error?: string };
      if (!bidResponse.ok)
        throw new Error(bidData.error || "Bid could not be opened.");
      let upload = isVendorBid ? sourceUpload : null;
      if (!upload) {
        const deal = deals.find(
            (item) => item.deal_number === bidData.bid.deal_number,
          ),
          uploadFilter = deal?.source_upload_id
            ? `id=eq.${encodeURIComponent(deal.source_upload_id)}`
            : `deal_number=eq.${encodeURIComponent(bidData.bid.deal_number)}&order=updated_at.desc`,
          uploadResponse = await pddAuthFetch(
            `/rest/v1/pdd_deal_uploads?select=id,original_name,storage_path,header_row,vendor_id,quantified_lines,vendor:pdd_vendors(id,company_name,contact_name,email,phone,address1,address2,city,region,postal_code,country,created_by,created_by_name,created_by_email)&${uploadFilter}&limit=1`,
            { headers: { Authorization: `Bearer ${session.access_token}` } },
          ),
          uploads = (await uploadResponse.json()) as Upload[];
        upload = uploads[0] || null;
      }
      if (!upload)
        throw new Error("The original spreadsheet mapping was not found.");
      if (!upload.vendor_id || !upload.vendor)
        throw new Error(
          `This older deal does not have a vendor attached. Add its vendor before creating ${isVendorBid ? "an official bid" : "a purchase order"}.`,
        );
      if (isVendorBid && !upload.original_name.toLowerCase().endsWith(".xlsx"))
        throw new Error(
          "Official vendor bids currently require the original upload to be an .xlsx workbook.",
        );
      const pricingBid =
        isVendorBid && bidData.bid.line_count === 0 && pricingMode === "total"
          ? {
              ...bidData.bid,
              line_count: upload.quantified_lines.length,
              line_items: upload.quantified_lines.map((line) => ({
                lineNumber: line.line,
                quantity: line.quantity,
                unitBid: 1,
              })),
            }
          : bidData.bid;
      if (
        isVendorBid &&
        bidData.bid.line_count === 0 &&
        !pricingBid.line_items?.some((line) => line.quantity > 0)
      )
        throw new Error(
          "The original spreadsheet does not contain item quantities for this take-all offer.",
        );
      const pricing: Pricing = {
          margin: percent,
          target: roundMoney(target),
          mode: pricingMode,
        },
        poNumber = `${isVendorBid ? "BID" : "PO"}-${bidData.bid.deal_number}`.toUpperCase(),
        terms = offerTerms
          .split(/\n+/)
          .map((term) => term.trim())
          .filter(Boolean),
        record = {
          po_number: poNumber,
          deal_number: bidData.bid.deal_number,
          internal_bid_number: bidData.bid.internal_bid_number,
          source_upload_id: upload.id,
          vendor_id: upload.vendor_id,
          vendor_company: upload.vendor.company_name,
          vendor_contact: upload.vendor.contact_name,
          vendor_email: upload.vendor.email,
          vendor_phone: upload.vendor.phone,
          vendor_address1: upload.vendor.address1,
          vendor_address2: upload.vendor.address2,
          vendor_city: upload.vendor.city,
          vendor_region: upload.vendor.region,
          vendor_postal_code: upload.vendor.postal_code,
          vendor_country: upload.vendor.country,
          margin_percent: pricing.margin,
          customer_total: Number(bidData.bid.total_bid),
          vendor_total: pricing.target,
          purchasing_owner_id: upload.vendor.created_by || null,
          purchasing_owner_name: upload.vendor.created_by_name || "Unassigned",
          purchasing_owner_email: upload.vendor.created_by_email || "",
          generated_by: user.id,
          generated_by_name: profile.display_name,
          generated_by_email: profile.email,
          updated_at: new Date().toISOString(),
        };
      if (isVendorBid) {
        const fileResponse = await fetch(
          `${pddSupabaseUrl}/storage/v1/object/authenticated/pdd-deal-uploads/${upload.storage_path.split("/").map(encodeURIComponent).join("/")}`,
          {
            headers: {
              apikey: pddSupabaseKey,
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );
        if (!fileResponse.ok)
          throw new Error("The original spreadsheet could not be downloaded.");
        const built = await generatePurchaseOrder(
            await fileResponse.blob(),
            upload,
            pricingBid,
            pricing,
            poNumber,
            "vendor-bid",
            terms,
          ),
          pdf = await createPurchaseOrderPdf(
            upload,
            pricingBid,
            pricing,
            poNumber,
            deals.find((deal) => deal.deal_number === bidData.bid.deal_number)
              ?.owner_name || profile.display_name,
            "vendor-bid",
            terms,
          );
        setVendor(upload.vendor);
        const dealRecord=deals.find(deal=>deal.deal_number===bidData.bid.deal_number);
        if(dealRecord){const estimateResponse=await fetch("/api/admin/deals",{method:"PATCH",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({id:dealRecord.id,dealNumber:dealRecord.deal_number,proposedAmount:pricing.target})});if(!estimateResponse.ok)throw new Error("The vendor offer was created, but its total could not be saved for the purchase order.")}
        setGenerated({
          poNumber,
          vendor: upload.vendor,
          excel: built.excel,
          pdf,
          originalName: upload.original_name,
        });
        setMessage(
          `Official bid prepared for ${upload.vendor.company_name}. Vendor offer total: ${built.grand.toLocaleString(undefined, { style: "currency", currency: "USD" })}. No purchase order was created.`,
        );
        return;
      }
      const recordResponse = await pddAuthFetch(
        "/rest/v1/pdd_purchase_orders?on_conflict=deal_number",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify(record),
        },
      );
      if (!recordResponse.ok)
        throw new Error("The purchase-order record could not be saved.");
      const storedOrders = (await recordResponse.json()) as { id: string }[],
        purchaseOrderId = storedOrders[0]?.id;
      if (!purchaseOrderId)
        throw new Error("The stored purchase order could not be opened.");
      const byLine = new Map(
          upload.quantified_lines.map((line) => [line.line, line]),
        ),
        lineRows = pricedLines(bidData.bid, pricing.target).map((line) => {
          const source = byLine.get(line.lineNumber),
            values = source?.values || {};
          return {
            purchase_order_id: purchaseOrderId,
            line_number: line.lineNumber,
            product_sku: productSku(values),
            product_description: productDescription(values, line.lineNumber),
            quantity: line.quantity,
            unit_cost: line.unitPrice,
            line_total: line.lineTotal,
          };
        });
      if (lineRows.length) {
        const linesSaved = await pddAuthFetch(
          "/rest/v1/pdd_purchase_order_lines?on_conflict=purchase_order_id,line_number",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(lineRows),
          },
        );
        if (!linesSaved.ok)
          throw new Error(
            "The purchase order was saved, but its product lines could not be stored.",
          );
      }
      const pdf = await createPurchaseOrderPdf(
          upload,
          bidData.bid,
          pricing,
          poNumber,
          deals.find((deal) => deal.deal_number === bidData.bid.deal_number)
            ?.owner_name || profile.display_name,
        );
      let excel: Blob, generatedTotal = pricing.target;
      if (upload.original_name.toLowerCase().endsWith(".xlsx")) {
        const fileResponse = await fetch(
          `${pddSupabaseUrl}/storage/v1/object/authenticated/pdd-deal-uploads/${upload.storage_path.split("/").map(encodeURIComponent).join("/")}`,
          {
            headers: {
              apikey: pddSupabaseKey,
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );
        if (!fileResponse.ok)
          throw new Error("The original spreadsheet could not be downloaded.");
        const built = await generatePurchaseOrder(
          await fileResponse.blob(),
          upload,
          bidData.bid,
          pricing,
          poNumber,
        );
        excel = built.excel;
        generatedTotal = built.grand;
      } else {
        const byLine = new Map(upload.quantified_lines.map((line) => [line.line, line]));
        const address = [
          upload.vendor.address1,
          upload.vendor.address2,
          [upload.vendor.city, upload.vendor.region, upload.vendor.postal_code].filter(Boolean).join(", "),
          upload.vendor.country,
        ].filter(Boolean).join(" · ");
        excel = createOrderSpreadsheetBlob({
          kind: "PURCHASE ORDER",
          orderNumber: poNumber,
          dealNumber: bidData.bid.deal_number,
          partyLabel: "Vendor",
          partyName: upload.vendor.company_name,
          contact: upload.vendor.contact_name,
          email: upload.vendor.email,
          phone: upload.vendor.phone,
          address,
          generatedBy: profile.display_name,
          lines: pricedLines(bidData.bid, pricing.target).map((line) => {
            const source = byLine.get(line.lineNumber);
            return {
              line: line.lineNumber,
              description: source ? productDescription(source.values, line.lineNumber) : `Deal line ${line.lineNumber}`,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              total: line.lineTotal,
            };
          }),
          total: pricing.target,
          notes: [`Created from the winning customer offer using an exact PO total of ${pricing.target.toLocaleString(undefined,{style:"currency",currency:"USD"})}.`],
          fileBase: `${poNumber}-${safe(upload.vendor.company_name)}`,
        });
      }
      const
        base = `${user.id}/orders/purchase-orders/${poNumber}-${Date.now()}`,
        xlsxPath = `${base}.xlsx`,
        pdfPath = `${base}.pdf`;
      const [xlsxUpload, pdfUpload] = await Promise.all([
        uploadPddDocument(xlsxPath, excel, session),
        uploadPddDocument(pdfPath, pdf, session),
      ]);
      if (!xlsxUpload.ok || !pdfUpload.ok)
        throw new Error("The purchase-order files could not be stored.");
      const pathResponse = await pddAuthFetch(
        `/rest/v1/pdd_purchase_orders?deal_number=eq.${encodeURIComponent(bidData.bid.deal_number)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            xlsx_storage_path: xlsxPath,
            pdf_storage_path: pdfPath,
          }),
        },
      );
      if (!pathResponse.ok)
        throw new Error(
          "The stored purchase-order files could not be attached to the record.",
        );
      setVendor(upload.vendor);
      setGenerated({
        poNumber,
        vendor: upload.vendor,
        excel,
        pdf,
        originalName: upload.original_name,
      });
      setMessage(
        `${poNumber} was stored for ${upload.vendor.company_name} and credited to ${record.purchasing_owner_name}. Vendor total: ${generatedTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The purchase order could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="employeeDashboard reverseOfferPage">
      <header>
        <div>
          <p className="eyebrow">EMPLOYEE TOOL</p>
          <h1>
            {isVendorBid ? "Vendor Offer Generator" : "Purchase Order Generator"}
          </h1>
          <p>
            {isVendorBid
              ? "Create an official vendor offer from the highest customer bid while preserving the vendor’s original spreadsheet format."
              : "Create a vendor PO from a winning offer or directly from a priced spreadsheet."}
          </p>
        </div>
        <nav className="summaryReturnNav">
          <a className="button secondary" href="/employee/active-bids">← Back to Summary</a>
          <a className="button secondary" href="/employee">Deal Workbook</a>
        </nav>
      </header>
      <section className="reverseOfferCard">
        {!isVendorBid && <div className="poSourceTabs">
          <a className="active" href="/employee/reverse-offer">
            From Winning Offer
          </a>
          <a href="/employee/purchase-order-upload">From Spreadsheet</a>
        </div>}
        {isVendorBid && (
          <label>
            Vendor and deal
            <select
              value={selectedDeal}
              onChange={(event) => {
                setSelectedDeal(event.target.value);
                setGenerated(null);
                setMessage("");
              }}
            >
              <option value="">Select a vendor and deal…</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.deal_number}>
                  {deal.vendor_name} · {deal.deal_number} · {deal.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {isVendorBid && selectedDeal && chosen && (
          <div className="poStatus won">
            Highest customer offer selected automatically: {chosen.company} · {Number(chosen.total_bid).toLocaleString(undefined,{style:"currency",currency:"USD"})}
          </div>
        )}
        {!isVendorBid && <label>
          Winning customer offer
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {bids.map((bid) => (
              <option
                key={bid.internal_bid_number}
                value={bid.internal_bid_number}
              >
                {bid.status === "won" ? "✓ WON · " : ""}
                {bid.deal_number} · {bid.company} ·{" "}
                {`$${Number(bid.total_bid).toLocaleString()}`}
              </option>
            ))}
          </select>
        </label>}
        {isVendorBid && !selectedDeal && (
          <p className="poStatus pending">
            Select the vendor and deal you want to work with. This list matches
            the Deal Dashboard and excludes Want to Buy deals.
          </p>
        )}
        {isVendorBid && selectedDeal && sourceLoading && (
          <p className="poStatus pending">Loading the original deal spreadsheet…</p>
        )}
        {isVendorBid && selectedDeal && !sourceLoading && !sourceUpload && (
          <p className="poStatus pending">
            This deal does not have an original vendor spreadsheet available to revert.
          </p>
        )}
        {isVendorBid && selectedDeal && sourceUpload && !chosen && (
          <p className="poStatus pending">
            No priced customer offer was found in Bids Received for this deal.
          </p>
        )}
        {chosen && !isVendorBid && (
          <p
            className={`poStatus ${chosen.status === "won" ? "won" : "pending"}`}
          >
            {chosen.status === "won"
              ? "Winning offer confirmed"
              : "This offer must be marked Won before a PO can be created"}
          </p>
        )}
        {chosen &&
          chosen.line_count === 0 &&
          (!isVendorBid || pricingMode !== "total") && (
          <div className="poItemizationRequired">
            <b>
              {isVendorBid
                ? "This Take-All offer can use an exact vendor bid total."
                : "Line-item pricing is required before this PO can be generated."}
            </b>
            <span>
              {isVendorBid
                ? "Choose Enter exact vendor bid total. The amount will be divided equally across every item in the original spreadsheet."
                : `This offer was submitted as Take-All. Enter the customer's line-item prices for ${chosen.deal_number}, then mark that itemized bid Won.`}
            </span>
            {!isVendorBid && (
              <a href={`/employee/customer-bid?deal=${encodeURIComponent(chosen.deal_number)}`}>
                Enter Line-Item Bid
              </a>
            )}
          </div>
        )}
        {vendor && (
          <div className="poVendor">
            <span>VENDOR</span>
            <strong>{vendor.company_name}</strong>
            <small>
              {vendor.contact_name} ·{" "}
              {[vendor.city, vendor.region].filter(Boolean).join(", ")}
            </small>
          </div>
        )}
        <div className="poPricing" hidden={isVendorBid && !chosen}>
          <div
            className="poPricingTabs"
            role="group"
            aria-label={
              isVendorBid
                ? "Vendor bid pricing method"
                : "Purchase order pricing method"
            }
          >
            <button
              type="button"
              className={pricingMode === "margin" ? "active" : ""}
              onClick={() => setPricingMode("margin")}
            >
              {isVendorBid ? "Use percentage reduction" : "Use profit margin"}
            </button>
            <button
              type="button"
              className={pricingMode === "total" ? "active" : ""}
              onClick={() => {
                setPricingMode("total");
                if (!poTotal && chosen)
                  setPoTotal(
                    roundMoney(
                      Number(chosen.total_bid) *
                        (1 - (Number(margin) || 0) / 100),
                    ).toFixed(2),
                  );
              }}
            >
              Enter exact {isVendorBid ? "vendor bid" : "PO"} total
            </button>
          </div>
          {pricingMode === "margin" ? (
            <label>
              {isVendorBid ? "Percentage reduction" : "Required profit margin"}
              <div className="marginInput">
                <input
                  type="number"
                  min="0"
                  max="99.99"
                  step="0.01"
                  value={margin}
                  onChange={(event) => setMargin(event.target.value)}
                />
                <span>%</span>
              </div>
            </label>
          ) : (
            <label>
              Exact {isVendorBid ? "vendor bid" : "purchase order"} total
              <div className="moneyInput">
                <span>$</span>
                <input
                  type="number"
                  min="0.01"
                  max={customerTotal || undefined}
                  step="0.01"
                  value={poTotal}
                  onChange={(event) => setPoTotal(event.target.value)}
                  placeholder="7000.00"
                />
              </div>
              <small>
                The same proportional discount is applied across all winning
                unit prices.
              </small>
            </label>
          )}
        </div>
        {chosen && (
          <div className="marginPreview">
            <span>{isVendorBid ? "Uploaded bid total" : "Customer offer total"}</span>
            <strong>
              {customerTotal.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </strong>
            <span>
              {pricingMode === "total"
                ? "Calculated reduction"
                : isVendorBid
                  ? "Percentage reduction"
                  : "Profit margin"}
            </span>
            <strong>
              {Number.isFinite(calculatedMargin)
                ? `${calculatedMargin.toFixed(4)}%`
                : "—"}
            </strong>
            <span>
              {isVendorBid ? "Official vendor bid total" : "Purchase order total"}
            </span>
            <strong className={isVendorBid ? "officialVendorTotal" : ""}>
              {Number.isFinite(calculatedTarget) && calculatedTarget > 0
                ? calculatedTarget.toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD",
                  })
                : "—"}
            </strong>
            {isVendorBid && (
              <>
                <span>Profit</span>
                <strong className="vendorOfferProfit">
                  {Number.isFinite(calculatedTarget) && calculatedTarget > 0
                    ? (customerTotal - calculatedTarget).toLocaleString(
                        undefined,
                        { style: "currency", currency: "USD" },
                      )
                    : "—"}
                </strong>
              </>
            )}
          </div>
        )}
        {isVendorBid && chosen && (
          <label>
            Offer terms and conditions
            <textarea
              rows={7}
              value={offerTerms}
              onChange={(event) => setOfferTerms(event.target.value)}
            />
            <small>These terms appear on the official bid. Use one term per line.</small>
          </label>
        )}
        <div className="poIncludes" hidden={isVendorBid && !chosen}>
          <b>The Excel workbook and PDF include:</b>
          <span>
            {isVendorBid
              ? "Branded PDF with contact, bid number, total and terms"
              : "Purchase Order with vendor contact, PO number and totals"}
          </span>
          <span>
            Vendor&apos;s original spreadsheet format and lot layout with {isVendorBid ? "reduced" : "margin-adjusted"} Unit Bid and Total
          </span>
        </div>
        <button
          className="button"
          onClick={generate}
          hidden={isVendorBid && !chosen}
          disabled={
            busy ||
            !selected ||
            (!isVendorBid && chosen?.status !== "won")
          }
        >
          {busy
            ? `Creating ${isVendorBid ? "official bid" : "purchase order"}…`
            : isVendorBid
              ? "Generate Official Vendor Bid"
              : "Generate Purchase Order"}
        </button>
        {generated && (
          <div className="orderDownloadActions">
            <button type="button" className="button" onClick={openReview}>{isVendorBid?"Review & Email Offer":"Review & Email Purchase Order"}</button>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                downloadBlob(
                  generated.excel,
                  isVendorBid
                    ? generated.originalName
                    : `${generated.poNumber}-${safe(generated.vendor.company_name)}.xlsx`,
                )
              }
            >
              Download Excel
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                downloadBlob(
                  generated.pdf,
                  `${generated.poNumber}-${safe(generated.vendor.company_name)}.pdf`,
                )
              }
            >
              Download PDF
            </button>
          </div>
        )}
        {message && <p className="employeeAuthMessage">{message}</p>}
      </section>
      {reviewOpen && generated && <div className="offerReviewBackdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)closeReview()}}><section className="offerReviewDialog" role="dialog" aria-modal="true" aria-labelledby="offer-review-title"><header><div><p className="eyebrow">{isVendorBid?"VENDOR OFFER":"PURCHASE ORDER"}</p><h2 id="offer-review-title">Review and email {generated.poNumber}</h2></div><button type="button" className="offerReviewClose" onClick={closeReview} aria-label="Close review">×</button></header><div className="offerReviewBody"><div className="offerPdfPreview">{reviewUrl&&<iframe title={`Preview of ${generated.poNumber}`} src={reviewUrl}/>}</div><div className="offerEmailEditor"><label>To<input type="email" value={emailTo} onChange={event=>setEmailTo(event.target.value)}/></label><label>Subject<input value={emailSubject} onChange={event=>setEmailSubject(event.target.value)}/></label><label>Email message<textarea rows={10} value={emailMessage} onChange={event=>setEmailMessage(event.target.value)}/></label><p><b>Attachments:</b> {generated.poNumber}.pdf and {isVendorBid?generated.originalName:`${generated.poNumber}.xlsx`}</p><div><button type="button" className="button secondary" onClick={closeReview}>Cancel</button><button type="button" className="button" disabled={emailBusy||!emailTo.trim()||!emailSubject.trim()||!emailMessage.trim()} onClick={()=>void emailVendorOffer()}>{emailBusy?"Sending…":isVendorBid?"Send Offer to Vendor":"Send PO to Vendor"}</button></div></div></div></section></div>}
    </main>
  );
}
