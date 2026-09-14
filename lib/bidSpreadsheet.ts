import { strToU8, unzipSync, zipSync } from "fflate";

export type BidSheetColumn = {
  header: string;
  value: (rowIndex: number) => string | number;
};
export type ImportedBidRow = {
  lineId: string;
  unitBid: string;
  comments: string;
};
export type BidSpreadsheetOptions = {
  awardMode?: "single" | "multiple";
  picture?: { bytes: Uint8Array; contentType: string };
};

const xmlEscape = (value: string | number) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const columnName = (index: number) => {
  let value = index + 1,
    result = "";
  while (value) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};
const bidColumnWidth = (header: string, values: Array<string | number> = []) => {
  const name = header.trim().toLowerCase(),
    longest = Math.max(header.length, ...values.map((value) => String(value ?? "").length)),
    between = (minimum: number, maximum: number) =>
      Math.max(minimum, Math.min(maximum, longest + 2));
  if (name === "line") return 9;
  if (/description|configuration|specification|details/.test(name))
    return between(38, 58);
  if (/comments?|notes?/.test(name)) return between(30, 42);
  if (/item name|part|model|sku|product/.test(name)) return between(22, 34);
  if (/^(qty|quantity)$/.test(name)) return 12;
  if (/unit bid|total bid|price|cost|amount/.test(name)) return 16;
  return between(14, 30);
};
const inlineCell = (
  reference: string,
  value: string | number,
  style: number,
) =>
  typeof value === "number"
    ? `<c r="${reference}" s="${style}"><v>${value}</v></c>`
    : `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;

function displayBidName(dealNumber: string, assignedFileName?: string) {
  return (assignedFileName?.trim() || `${dealNumber}-Customer-Bid.xlsx`)
    .replace(/\.xlsx$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const compactLotValue = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\s*[|;]+\s*/g, " · ")
    .trim()
    .slice(0, 82)
    .replace(/[,:;·\s]+$/g, "");
const isBoxHeader = (header: string) =>
  /^(?:(?:box|lot|container)(?:\s*(?:#|number|no\.?))?)$/i.test(
    header.trim(),
  );

// Keep every customer-facing deal workbook in the same predictable order.
// Unrecognized equipment-specific fields remain in their original order in
// the middle of the sheet, before notes, grade, quantity and pricing.
function orderDealColumns(columns: BidSheetColumn[]) {
  const normalized = (header: string) =>
    header.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  const rank = (header: string) => {
    const name = normalized(header);
    if (/^(mfg|manufacturer|brand|make)$/.test(name)) return 10;
    if (/^(model|model number|model no|model #)$/.test(name)) return 20;
    if (/^(part number|part no|part #|pn|p n|mpn|manufacturer part number)$/.test(name)) return 30;
    if (/^(description|item description|product description|configuration|config)$/.test(name)) return 40;
    if (/^(ram|memory|memory size|ram size|memory capacity)$/.test(name)) return 50;
    if (/^(cpu|processor|processor type|cpu model)$/.test(name)) return 60;
    if (/^(ssd|hdd|ssd hdd|hdd ssd|storage|drive|drive type|storage capacity)$/.test(name)) return 70;
    if (/comments?|notes?|remarks?/.test(name)) return 900;
    if (/^(grade|condition|cosmetic grade|functional grade)$/.test(name)) return 910;
    return 100;
  };
  return columns
    .map((column, index) => ({ column, index, rank: rank(column.header) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ column }) => column);
}

const isGradeColumn = (column: BidSheetColumn) =>
  /^(?:grade|condition|cosmetic grade|functional grade)$/i.test(
    column.header.trim(),
  );
type BidRowPlanEntry =
  | { kind: "data"; sourceIndex: number; dataIndex: number }
  | { kind: "subtotal"; sourceIndexes: number[] };

const manufacturerColumn = (columns: BidSheetColumn[]) =>
  columns.find((column) =>
    /^(?:manufacturer|mfg|brand)$/i.test(column.header.trim()),
  );

const modelColumn = (columns: BidSheetColumn[]) =>
  columns.find((column) =>
    /^(?:model|model number|model no\.?|model #)$/i.test(column.header.trim()),
  );

function sortIndexesByManufacturerAndModel(
  sourceIndexes: number[],
  columns: BidSheetColumn[],
  awardMode: "single" | "multiple" = "single",
) {
  const manufacturer = manufacturerColumn(columns);
  const model = modelColumn(columns);
  if (!manufacturer && !model) return [...sourceIndexes];
  const compare = (left: number, right: number) => {
    const leftBrand = String(manufacturer?.value(left) ?? "").trim();
    const rightBrand = String(manufacturer?.value(right) ?? "").trim();
    if (!leftBrand && rightBrand) return 1;
    if (leftBrand && !rightBrand) return -1;
    const brandOrder = leftBrand.localeCompare(rightBrand, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    if (brandOrder) return brandOrder;
    const leftModel = String(model?.value(left) ?? "").trim();
    const rightModel = String(model?.value(right) ?? "").trim();
    if (!leftModel && rightModel) return 1;
    if (leftModel && !rightModel) return -1;
    return leftModel.localeCompare(rightModel, undefined, {
      sensitivity: "base",
      numeric: true,
    }) || left - right;
  };
  const box = awardMode === "multiple"
    ? columns.find((column) => isBoxHeader(column.header))
    : undefined;
  if (!box) return [...sourceIndexes].sort(compare);

  const groups: number[][] = [];
  let current: number[] = [];
  let currentBox = "";
  for (const sourceIndex of sourceIndexes) {
    const explicitBox = String(box.value(sourceIndex) ?? "").trim();
    if (explicitBox && current.length && explicitBox !== currentBox) {
      groups.push(current);
      current = [];
    }
    if (explicitBox) currentBox = explicitBox;
    current.push(sourceIndex);
  }
  if (current.length) groups.push(current);
  return groups.flatMap((group) => {
    const everyRowNamesBox = group.every((index) =>
      String(box.value(index) ?? "").trim(),
    );
    return everyRowNamesBox
      ? [...group].sort(compare)
      : [group[0], ...group.slice(1).sort(compare)];
  });
}

function createBidRowPlan(
  sourceIndexes: number[],
  boxColumn: BidSheetColumn | undefined,
  awardMode: "single" | "multiple",
): BidRowPlanEntry[] {
  if (awardMode !== "multiple")
    return sourceIndexes.map((sourceIndex, dataIndex) => ({
      kind: "data" as const,
      sourceIndex,
      dataIndex,
    }));

  const plan: BidRowPlanEntry[] = [];
  let currentBox = "";
  let groupKey = "";
  let groupIndexes: number[] = [];
  const finishGroup = () => {
    if (groupIndexes.length)
      plan.push({ kind: "subtotal", sourceIndexes: groupIndexes });
    groupIndexes = [];
  };

  sourceIndexes.forEach((sourceIndex, dataIndex) => {
    const explicitBox = String(boxColumn?.value(sourceIndex) || "").trim();
    if (explicitBox) currentBox = explicitBox;
    const nextGroupKey = boxColumn
      ? currentBox || `Unassigned ${sourceIndex + 1}`
      : `Line ${sourceIndex + 1}`;
    if (groupKey && nextGroupKey !== groupKey) finishGroup();
    groupKey = nextGroupKey;
    plan.push({ kind: "data", sourceIndex, dataIndex });
    groupIndexes.push(sourceIndex);
  });
  finishGroup();
  return plan;
}

/** Build the same short, quantity-weighted lot summary used by the bid sheet and PDD. */
export function buildLotNotes(rowCount: number, columns: BidSheetColumn[]) {
  const qty = columns.find((column) =>
    /^(qty|quantity|units?)$/i.test(column.header.trim()),
  );
  const detail =
    columns.find((column) =>
      /^(description|configuration|config|product|item description|model description)$/i.test(
        column.header.trim(),
      ),
    ) ||
    columns.find((column) =>
      /description|configuration|product|model/i.test(column.header),
    );
  const grade = columns.find((column) =>
    /^(grade|condition)$/i.test(column.header.trim()),
  );
  const manufacturer = columns.find((column) =>
    /^(manufacturer|mfg|make|brand)$/i.test(column.header.trim()),
  );
  const weighted = (column: BidSheetColumn) => {
    const totals = new Map<string, number>();
    for (let index = 0; index < rowCount; index++) {
      const value = compactLotValue(String(column.value(index) || ""));
      if (!value) continue;
      const amount = Math.max(1, Number(qty?.value(index)) || 1);
      totals.set(value, (totals.get(value) || 0) + amount);
    }
    return [...totals].sort((a, b) => b[1] - a[1]);
  };
  const rowText = (index: number) =>
    columns.map((column) => String(column.value(index) || "")).join(" ");
  const rankedBrands = manufacturer ? weighted(manufacturer) : [];
  const brandSummary = rankedBrands.length
    ? `Brands: ${rankedBrands
        .slice(0, 4)
        .map(([name, amount]) => `${name} (${amount.toLocaleString()})`)
        .join(", ")}${rankedBrands.length > 4 ? ` +${rankedBrands.length - 4} more` : ""}`
    : "";
  const ipadRows = Array.from({ length: rowCount }, (_, index) => index).filter(
    (index) => /\bipad\b/i.test(rowText(index)),
  );
  if (ipadRows.length && ipadRows.length >= rowCount * 0.7) {
    const families = new Map<string, number>();
    const grades = new Map<string, number>();
    const capacities: number[] = [];
    let unlocked = 0;
    let scuffed = 0;
    for (const index of ipadRows) {
      const text = rowText(index);
      const amount = Math.max(1, Number(qty?.value(index)) || 1);
      const generation = text.match(
        /\b(iPad(?: Air| mini)?)\s*\((\d+)(?:st|nd|rd|th) generation\)/i,
      );
      if (generation) {
        const family = generation[1]
          .replace(/ipad mini/i, "iPad mini")
          .replace(/ipad air/i, "iPad Air")
          .replace(/^ipad$/i, "iPad");
        const key = `${family} ${generation[2]}${Number(generation[2]) === 1 ? "st" : Number(generation[2]) === 2 ? "nd" : Number(generation[2]) === 3 ? "rd" : "th"} Gen`;
        families.set(key, (families.get(key) || 0) + amount);
      }
      const gradeValue = text.match(/\bGrade\s*([A-D])\b/i)?.[1] ||
        columns.find((column) => /^grade$/i.test(column.header.trim()))?.value(index);
      if (gradeValue) {
        const key = `Grade ${String(gradeValue).toUpperCase().replace(/^GRADE\s*/i, "")}`;
        grades.set(key, (grades.get(key) || 0) + amount);
      }
      for (const match of text.matchAll(/\b(\d{1,4})\s*(?:GB|G)\b/gi))
        capacities.push(Number(match[1]));
      for (const column of columns) {
        if (!/^(?:hdd|ssd|storage|capacity)$/i.test(column.header.trim())) continue;
        const value = String(column.value(index) || "").trim();
        if (/^\d{1,4}$/.test(value)) capacities.push(Number(value));
      }
      if (/\bunlocked\b/i.test(text)) unlocked += amount;
      if (/scuff(?:ed|s|ing)?\s+screen/i.test(text)) scuffed += amount;
    }
    const ranked = [...families].sort((a, b) => b[1] - a[1]);
    const leaders = ranked.slice(0, 3).map(([name, amount]) => `${name} (${amount})`);
    const remainderNames = ranked.slice(3).map(([name]) => name);
    const compactRemainder = ["iPad", "iPad Air", "iPad mini"]
      .map((family) => {
        const generations = remainderNames
          .map((name) => name.match(new RegExp(`^${family} (\\d+)(?:st|nd|rd|th) Gen$`, "i"))?.[1])
          .filter(Boolean);
        return generations.length
          ? `${family} ${generations.join("/")} Gen`
          : "";
      })
      .filter(Boolean)
      .join(", ");
    const gradeSummary = [...grades]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => `${amount} ${name}`)
      .join(" / ");
    const capacitySummary = capacities.length
      ? `${Math.min(...capacities)}GB–${Math.max(...capacities)}GB`
      : "";
    return [
      brandSummary,
      `Primarily ${leaders.join(", ")}`,
      compactRemainder ? `plus ${compactRemainder}` : "",
      capacitySummary,
      gradeSummary,
      unlocked ? "unlocked" : "",
      scuffed ? "some scuffed screens" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const ignoredSummaryHeader =
    /^(?:line|row|qty|quantity|units?|source tab|inventory(?: id| number| tag)?|asset(?: id| tag)?|serial(?: number)?|barcode|location|warehouse|price|unit (?:price|bid)|total|extended(?: price)?|comments?|notes?)$/i;
  const summaryPriority = (header: string) => {
    const value = header.trim();
    if (/^(?:description|item description|product description)$/i.test(value)) return 100;
    if (/^(?:product|item|configuration|config)$/i.test(value)) return 90;
    if (/^(?:model|model number|part number|mpn|sku)$/i.test(value)) return 80;
    if (/^(?:manufacturer|mfg|brand)$/i.test(value)) return 70;
    if (/cpu|processor|ram|memory|storage|drive|capacity|screen|generation/i.test(value)) return 60;
    return ignoredSummaryHeader.test(value) || /^(?:grade|condition)$/i.test(value)
      ? 0
      : 20;
  };
  const informative = columns
    .filter((column) => column !== manufacturer && summaryPriority(column.header) > 0)
    .sort((a, b) => summaryPriority(b.header) - summaryPriority(a.header));
  const summaries = new Map<string, number>();
  for (let index = 0; index < rowCount; index++) {
    const values: string[] = [];
    for (const column of informative) {
      const value = compactLotValue(String(column.value(index) || ""));
      if (!value || values.some((current) => current.toLowerCase() === value.toLowerCase()))
        continue;
      values.push(value);
      if (values.length >= 4 || values.join(" · ").length >= 120) break;
    }
    const summary = compactLotValue(values.join(" · "));
    if (!summary) continue;
    const amount = Math.max(1, Number(qty?.value(index)) || 1);
    summaries.set(summary, (summaries.get(summary) || 0) + amount);
  }
  const details = [...summaries].sort((a, b) => b[1] - a[1]);
  const total = details.reduce((sum, item) => sum + item[1], 0);
  const leaders: string[] = [];
  let represented = 0;
  for (const [value, amount] of details) {
    if (leaders.length >= 3) break;
    leaders.push(value);
    represented += amount;
    if (leaders.length >= 2 && represented >= total * 0.7) break;
  }
  const dominantGrade = grade ? weighted(grade)[0]?.[0] : "";
  const fallback = informative[0] || detail;
  const fallbackValue = fallback ? weighted(fallback)[0]?.[0] : "";
  return [
    brandSummary,
    dominantGrade && `${dominantGrade} condition`,
    leaders.join(" • ") ||
      fallbackValue ||
      `${rowCount.toLocaleString()} bid lines`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function safeTabName(raw: string, used: Set<string>) {
  const forbidden = '\\/:*?"<>|';
  const cleaned =
    raw
      .split("")
      .map((char) => (forbidden.includes(char) ? " " : char))
      .join("")
      .replace(/\s+/g, " ")
      .trim() || "Lot";
  const base = cleaned.slice(0, 31);
  let name = base,
    suffix = 2;
  while (used.has(name)) {
    const ending = ` ${suffix++}`;
    name = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  used.add(name);
  return name;
}

async function downloadTabbedBidSpreadsheet(
  dealNumber: string,
  rowCount: number,
  columns: BidSheetColumn[],
  assignedFileName?: string,
  options: BidSpreadsheetOptions = {},
) {
  const XLSX = await import("@e965/xlsx");
  const source = columns.find((column) => column.header === "Source Tab");
  const qty = columns.find((column) => column.header === "Qty") || {
    header: "Qty",
    value: () => 1,
  };
  const details = orderDealColumns(
    columns.filter((column) => column !== source && column !== qty),
  );
  const gradeDetails = details.filter(isGradeColumn);
  const mainDetails = details.filter((column) => !isGradeColumn(column));
  const groups = new Map<string, number[]>();
  for (let index = 0; index < rowCount; index++) {
    const name =
      String(source?.value(index) || "Customer Bid").trim() || "Customer Bid";
    groups.set(name, [...(groups.get(name) || []), index]);
  }
  const workbook = XLSX.utils.book_new(),
    used = new Set<string>();
  const summaryRows: (string | number)[][] = [
    ["Lot", "Bid Lines", "Quantity", "Bid Subtotal"],
  ];
  const summaryFormulas: string[] = [];
  for (const [rawName, unsortedIndexes] of groups) {
    const indexes = sortIndexesByManufacturerAndModel(
      unsortedIndexes,
      details,
      options.awardMode || "single",
    );
    const name = safeTabName(rawName, used),
      headers = [
        "Line",
        ...mainDetails.map((column) => column.header),
        "Bid Comments",
        ...gradeDetails.map((column) => column.header),
        "Qty",
        "Unit Bid",
        "Total Bid",
      ];
    const rowPlan = createBidRowPlan(
      indexes,
      details.find((column) => isBoxHeader(column.header)),
      options.awardMode || "single",
    );
    // Multiple-award generation only inserts subtotal rows. Source values are
    // copied into data rows without filling, normalizing, or replacing cells.
    const rows = rowPlan.map((entry) =>
      entry.kind === "data"
        ? [
            "",
            entry.sourceIndex + 1,
            ...mainDetails.map((column) => column.value(entry.sourceIndex)),
            "",
            ...gradeDetails.map((column) => column.value(entry.sourceIndex)),
            qty.value(entry.sourceIndex),
            "",
            "",
          ]
        : [
            "",
            "",
            ...mainDetails.map(() => ""),
            "",
            ...gradeDetails.map(() => ""),
            "",
            "Total",
            "",
          ],
    );
    const groupColumns = columns
      .filter((column) => column !== source)
      .map((column) => ({
        header: column.header,
        value: (offset: number) => column.value(indexes[offset]),
      }));
    const sheet = XLSX.utils.aoa_to_sheet([
      [""],
      ["", displayBidName(dealNumber, assignedFileName)],
      ["", `LOT NOTES: ${buildLotNotes(indexes.length, groupColumns)}`],
      ["", ...headers],
      ...rows,
      [],
    ]);
    // Column A is the permanent blank margin, so every displayed header is
    // one column farther right than its zero-based position in `headers`.
    const qtyColumn = columnName(headers.indexOf("Qty") + 1),
      bidColumn = columnName(headers.indexOf("Unit Bid") + 1),
      totalColumn = columnName(headers.indexOf("Total Bid") + 1);
    const subtotalRows: number[] = [];
    let currentDataRows: number[] = [];
    rowPlan.forEach((entry, offset) => {
      const row = offset + 5;
      if (entry.kind === "data") {
        currentDataRows.push(row);
        sheet[`${totalColumn}${row}`] = {
          t: "n",
          f: `IF(${bidColumn}${row}=\"\",\"\",${qtyColumn}${row}*${bidColumn}${row})`,
          z: "$#,##0.00",
        };
        return;
      }
      const first = currentDataRows[0];
      const last = currentDataRows[currentDataRows.length - 1];
      sheet[`${qtyColumn}${row}`] = {
        t: "n",
        f: `SUM(${qtyColumn}${first}:${qtyColumn}${last})`,
        z: "#,##0",
      };
      sheet[`${totalColumn}${row}`] = {
        t: "n",
        f: `SUM(${totalColumn}${first}:${totalColumn}${last})`,
        z: "$#,##0.00",
      };
      subtotalRows.push(row);
      currentDataRows = [];
    });
    const totalRow = rowPlan.length + 5;
    sheet[`${bidColumn}${totalRow}`] = { t: "s", v: "GRAND TOTAL" };
    sheet[`${qtyColumn}${totalRow}`] = {
      t: "n",
      f: subtotalRows.length
        ? `SUM(${subtotalRows.map((row) => `${qtyColumn}${row}`).join(",")})`
        : `SUM(${qtyColumn}5:${qtyColumn}${totalRow - 1})`,
      z: "#,##0",
    };
    sheet[`${totalColumn}${totalRow}`] = {
      t: "n",
      f: subtotalRows.length
        ? `SUM(${subtotalRows.map((row) => `${totalColumn}${row}`).join(",")})`
        : `SUM(${totalColumn}5:${totalColumn}${totalRow - 1})`,
      z: "$#,##0.00",
    };
    const border = {
      top: { style: "thin", color: { rgb: "CBD5E1" } },
      bottom: { style: "thin", color: { rgb: "CBD5E1" } },
      left: { style: "thin", color: { rgb: "CBD5E1" } },
      right: { style: "thin", color: { rgb: "CBD5E1" } },
    };
    for (let headerIndex = 0; headerIndex < headers.length; headerIndex++) {
      const column = headerIndex + 1;
      const header = headers[headerIndex];
      const leftAligned = /description|comments?|notes?/i.test(header);
      const cell = sheet[`${columnName(column)}4`];
      if (cell)
        cell.s = {
          font: {
            name: "Calibri",
            sz: 14,
            bold: true,
            color: { rgb: "FFFFFF" },
          },
          fill: { patternType: "solid", fgColor: { rgb: "123A59" } },
          border,
          alignment: { horizontal: "center", vertical: "center" },
        };
      for (let row = 5; row <= totalRow; row++) {
        const dataCell = sheet[`${columnName(column)}${row}`];
        const subtotal = rowPlan[row - 5]?.kind === "subtotal";
        if (dataCell)
          dataCell.s = {
            font: {
              name: "Calibri",
              sz: 12,
              bold: row === totalRow || subtotal,
              color: row === totalRow ? { rgb: "FFFFFF" } : undefined,
            },
            fill: {
              patternType: "solid",
              fgColor: {
                rgb:
                  row === totalRow
                    ? "123A59"
                    : subtotal || row % 2
                      ? "DCEAF4"
                      : "FFFFFF",
              },
            },
            border,
            alignment: {
              horizontal: leftAligned ? "left" : "center",
              vertical: "center",
              wrapText: leftAligned,
            },
          };
      }
    }
    if (sheet.B2)
      sheet.B2.s = {
        font: { name: "Calibri", sz: 18, bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "123A59" } },
        border,
        alignment: { horizontal: "center", vertical: "center" },
      };
    if (sheet.B3)
      sheet.B3.s = {
        font: { name: "Calibri", sz: 12 },
        fill: { patternType: "solid", fgColor: { rgb: "DCEAF4" } },
        border,
        alignment: { wrapText: true, vertical: "center" },
      };
    sheet["!merges"] = [
      { s: { r: 1, c: 1 }, e: { r: 1, c: headers.length } },
      { s: { r: 2, c: 1 }, e: { r: 2, c: headers.length } },
    ];
    sheet["!rows"] = [{ hpt: 36 }, { hpt: 28 }, { hpt: 30 }, { hpt: 24 }];
    sheet["!cols"] = [
      { wch: 5 },
      ...headers.map((header, headerIndex) => ({
        wch: bidColumnWidth(
          header,
          rows.map((row) => row[headerIndex + 1] ?? ""),
        ),
      })),
    ];
    sheet["!autofilter"] = { ref: `B4:${totalColumn}${totalRow - 1}` };
    sheet["!freeze"] = {
      ySplit: 4,
      topLeftCell: "A5",
      activePane: "bottomLeft",
      state: "frozen",
    };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
    summaryRows.push([
      rawName,
      indexes.length,
      indexes.reduce((sum, index) => sum + Number(qty.value(index) || 0), 0),
      "",
    ]);
    summaryFormulas.push(
      `'${name.replace(/'/g, "''")}'!${totalColumn}${totalRow}`,
    );
  }
  summaryRows.push(["GRAND TOTAL", "", "", ""]);
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryFormulas.forEach((formula, index) => {
    summary[`D${index + 2}`] = { t: "n", f: formula, z: "$#,##0.00" };
  });
  summary[`D${summaryRows.length}`] = {
    t: "n",
    f: `SUM(D2:D${summaryRows.length - 1})`,
    z: "$#,##0.00",
  };
  for (const cell of Object.values(summary)) {
    if (cell && typeof cell === "object" && "t" in cell)
      cell.s = {
        ...(cell.s || {}),
        alignment: { horizontal: "center", vertical: "center" },
      };
  }
  summary["!cols"] = [{ wch: 31 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Bid Summary");
  XLSX.writeFile(
    workbook,
    assignedFileName?.trim() || `${dealNumber}-Customer-Bid.xlsx`,
    { compression: true, cellStyles: true },
  );
}

export function buildBidSpreadsheet(
  dealNumber: string,
  rowCount: number,
  columns: BidSheetColumn[],
  assignedFileName?: string,
  options: BidSpreadsheetOptions = {},
) {
  const sourceTab = columns.find((column) => column.header === "Source Tab");
  // Multi-tab source workbooks become one customer-bid worksheet. Each
  // source tab is represented as a Lot so every lot, its price inputs and its
  // subtotal remain visible together on the same page.
  const preparedColumns =
    options.awardMode === "multiple" && sourceTab
      ? [
          { header: "Lot", value: (index: number) => sourceTab.value(index) },
          ...columns.filter((column) => column !== sourceTab),
        ]
      : columns;
  const qtyIndex = preparedColumns.findIndex((column) => column.header === "Qty");
  const qtyColumn =
    qtyIndex >= 0 ? preparedColumns[qtyIndex] : { header: "Qty", value: () => 1 };
  const detailColumns = orderDealColumns(
    preparedColumns.filter((_, index) => index !== qtyIndex),
  );
  const gradeColumns = detailColumns.filter(isGradeColumn);
  const mainColumns = detailColumns.filter((column) => !isGradeColumn(column));
  const headers = [
    "Line",
    ...mainColumns.map((column) => column.header),
    "Bid Comments",
    ...gradeColumns.map((column) => column.header),
    "Qty",
    "Unit Bid",
    "Total Bid",
  ];
  const sortedIndexes = sortIndexesByManufacturerAndModel(
    Array.from({ length: rowCount }, (_, index) => index),
    detailColumns,
    options.awardMode || "single",
  );
  const tableRows = Array.from({ length: rowCount }, (_, index) => [
    "",
    index + 1,
    ...mainColumns.map((column) => column.value(index)),
    "",
    ...gradeColumns.map((column) => column.value(index)),
    qtyColumn.value(index),
    "",
  ]);
  const rowPlan = createBidRowPlan(
    sortedIndexes,
    detailColumns.find((column) => isBoxHeader(column.header)),
    options.awardMode || "single",
  );
  // Column A is intentionally blank to match the approved workbook template.
  const qtyHeaderIndex = headers.indexOf("Qty") + 1,
    unitBidIndex = headers.indexOf("Unit Bid") + 1,
    totalIndex = headers.indexOf("Total Bid") + 1;
  const totalColumn = columnName(totalIndex),
    title = displayBidName(dealNumber, assignedFileName),
    notes = `LOT NOTES: ${buildLotNotes(rowCount, preparedColumns)}`;
  const spacerXml = `<row r="1" ht="36" customHeight="1"></row>`;
  const titleXml = `<row r="2">${inlineCell("B2", title, 7)}</row>`,
    notesXml = `<row r="3">${inlineCell("B3", notes, 8)}</row>`;
  const headerXml = `<row r="4">${headers.map((value, index) => inlineCell(`${columnName(index + 1)}4`, value === "Line" ? "LINE #" : value === "Unit Bid" ? "UNIT BID (USD)" : value === "Total Bid" ? "TOTAL BID (USD)" : value.toUpperCase(), 1)).join("")}</row>`;
  const subtotalRows: number[] = [];
  let currentGroupRows: number[] = [];
  // Multiple-award generation only inserts subtotal rows. Every source-backed
  // data cell is copied exactly as it is provided to this generator.
  const rowsXml = rowPlan
    .map((entry, planIndex) => {
      const excelRow = planIndex + 5;
      if (entry.kind === "subtotal") {
        const first = currentGroupRows[0],
          last = currentGroupRows[currentGroupRows.length - 1];
        subtotalRows.push(excelRow);
        currentGroupRows = [];
        return `<row r="${excelRow}">${headers
          .map((_, index) => {
            const sheetIndex = index + 1;
            const column = columnName(sheetIndex);
            if (sheetIndex === qtyHeaderIndex)
              return `<c r="${column}${excelRow}" s="2"><f>SUM(${column}${first}:${column}${last})</f><v>0</v></c>`;
            if (sheetIndex === unitBidIndex)
              return inlineCell(`${column}${excelRow}`, "Total", 2);
            if (sheetIndex === totalIndex)
              return `<c r="${column}${excelRow}" s="4"><f>SUM(${column}${first}:${column}${last})</f><v>0</v></c>`;
            return inlineCell(`${column}${excelRow}`, "", 2);
          })
          .join("")}</row>`;
      }
      const row = tableRows[entry.sourceIndex],
        qtyCell = `${columnName(qtyHeaderIndex)}${excelRow}`,
        unitCell = `${columnName(unitBidIndex)}${excelRow}`,
        rowStyle = entry.dataIndex % 2 === 0 ? 2 : 3,
        currencyStyle = entry.dataIndex % 2 === 0 ? 4 : 9;
      currentGroupRows.push(excelRow);
      return `<row r="${excelRow}">${row
        .map((value, index) => {
          const header = headers[index - 1] || "";
          const style = index === 0
            ? 0
            : /description|comments?|notes?/i.test(header)
              ? entry.dataIndex % 2 === 0
                ? 10
                : 11
              : rowStyle;
          return inlineCell(
            `${columnName(index)}${excelRow}`,
            value,
            style,
          );
        })
        .join("")}<c r="${columnName(totalIndex)}${excelRow}" s="${currencyStyle}"><f>IF(${unitCell}="","",${qtyCell}*${unitCell})</f><v></v></c></row>`;
    })
    .join("");
  const grandRow = rowPlan.length + 5,
    unitColumn = columnName(unitBidIndex),
    qtyColumnName = columnName(qtyHeaderIndex);
  const sumRows = (column: string) =>
    subtotalRows.length
      ? `SUM(${subtotalRows.map((row) => `${column}${row}`).join(",")})`
      : `SUM(${column}5:${column}${grandRow - 1})`;
  const grandCells = headers.map((_, index) => {
    const column = columnName(index + 1);
    if (column === "B")
      return inlineCell(`${column}${grandRow}`, "TOTAL UNITS:", 5);
    if (column === qtyColumnName)
      return `<c r="${column}${grandRow}" s="5"><f>${sumRows(column)}</f><v>0</v></c>`;
    if (column === totalColumn)
      return `<c r="${column}${grandRow}" s="6"><f>${sumRows(column)}</f><v>0</v></c>`;
    return inlineCell(`${column}${grandRow}`, "", 5);
  }).join("");
  const grandXml = `<row r="${grandRow}">${grandCells}</row>`;
  const warningRow=grandRow+1,instructionRow=grandRow+2,pictureRow=grandRow+4,hasPicture=Boolean(options.picture?.bytes?.length),lastRow=hasPicture?pictureRow+15:instructionRow;
  const footerXml=`<row r="${warningRow}">${inlineCell(`B${warningRow}`,"DO NOT SORT, DELETE, MOVE, OR MODIFY ROW ORDER.",12)}</row><row r="${instructionRow}" ht="40.5" customHeight="1">${inlineCell(`B${instructionRow}`,"Please return completed bid sheet by the listed due date/time. Award may be based on take-all offer, line-item pricing, or best overall offer.",13)}</row>`;
  const drawingTag=hasPicture?'<drawing r:id="rId1"/>':"";
  const totalLabelEnd=columnName(Math.max(1,qtyHeaderIndex-1));
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${totalColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="6.14" customWidth="1"/>${headers.map((header, index) => `<col min="${index + 2}" max="${index + 2}" width="${bidColumnWidth(header, tableRows.map((row) => row[index + 1] ?? ""))}" customWidth="1"/>`).join("")}</cols><sheetData>${spacerXml}${titleXml}${notesXml}${headerXml}${rowsXml}${grandXml}${footerXml}</sheetData><mergeCells count="5"><mergeCell ref="B2:${totalColumn}2"/><mergeCell ref="B3:${totalColumn}3"/><mergeCell ref="B${grandRow}:${totalLabelEnd}${grandRow}"/><mergeCell ref="B${warningRow}:${totalColumn}${warningRow}"/><mergeCell ref="B${instructionRow}:${totalColumn}${instructionRow}"/></mergeCells>${drawingTag}</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="6"><font><sz val="12"/><name val="Arial"/></font><font><b/><color rgb="FF000000"/><sz val="12"/><name val="Arial"/></font><font><b/><color rgb="FF000000"/><sz val="12"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Arial"/></font><font><b/><color rgb="FF000000"/><sz val="14"/><name val="Arial"/></font><font><b/><color rgb="FFCC0000"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF000000"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="5" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Customer Bid" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
  const pictureType=options.picture?.contentType||"",pictureExtension=pictureType.includes("png")?"png":pictureType.includes("gif")?"gif":pictureType.includes("webp")?"webp":"jpeg";
  const files:Record<string,Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasPicture?`<Default Extension="${pictureExtension}" ContentType="${xmlEscape(pictureType||"image/jpeg")}"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`:""}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
  };
  if(hasPicture&&options.picture){
    files[`xl/media/deal-photo.${pictureExtension}`]=options.picture.bytes;
    files["xl/worksheets/_rels/sheet1.xml.rels"]=strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
    files["xl/drawings/drawing1.xml"]=strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${pictureRow-1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="4000500" cy="2667000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Deal photo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
    files["xl/drawings/_rels/drawing1.xml.rels"]=strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/deal-photo.${pictureExtension}"/></Relationships>`);
  }
  const zipped = zipSync(files, { level: 6 });
  return {
    bytes: zipped,
    filename: assignedFileName?.trim() || `${dealNumber}-Customer-Bid.xlsx`,
  };
}

export function downloadBidSpreadsheet(
  dealNumber: string,
  rowCount: number,
  columns: BidSheetColumn[],
  assignedFileName?: string,
  options: BidSpreadsheetOptions = {},
) {
  const {bytes,filename}=buildBidSpreadsheet(dealNumber,rowCount,columns,assignedFileName,options);
  const link = document.createElement("a");
  const fileBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  link.href = URL.createObjectURL(
    new Blob([fileBytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, "").trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, "").trim());
    rows.push(row);
  }
  return rows;
}

function parseSpreadsheetXml(text: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error(
      "This Excel file could not be read. Please use the spreadsheet downloaded from this deal.",
    );
  return [...document.getElementsByTagNameNS("*", "Row")].map((row) => {
    const result: string[] = [];
    let columnIndex = 0;
    for (const cell of [...row.getElementsByTagNameNS("*", "Cell")]) {
      const explicitIndex =
        cell.getAttributeNS(
          "urn:schemas-microsoft-com:office:spreadsheet",
          "Index",
        ) || cell.getAttribute("ss:Index");
      if (explicitIndex) columnIndex = Math.max(0, Number(explicitIndex) - 1);
      result[columnIndex] =
        cell.getElementsByTagNameNS("*", "Data")[0]?.textContent?.trim() || "";
      columnIndex++;
    }
    return result;
  });
}

function columnIndex(reference: string) {
  const letters = (reference.match(/^[A-Z]+/i)?.[0] || "").toUpperCase();
  let result = 0;
  for (const letter of letters)
    result = result * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, result - 1);
}

async function parseXlsx(file: File) {
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error(
      "This .xlsx file could not be opened. Please use the spreadsheet downloaded from this deal.",
    );
  }
  const decoder = new TextDecoder();
  const sharedXml = files["xl/sharedStrings.xml"]
    ? decoder.decode(files["xl/sharedStrings.xml"])
    : "";
  const shared = sharedXml
    ? [
        ...new DOMParser()
          .parseFromString(sharedXml, "application/xml")
          .getElementsByTagNameNS("*", "si"),
      ].map((item) =>
        [...item.getElementsByTagNameNS("*", "t")]
          .map((text) => text.textContent || "")
          .join(""),
      )
    : [];
  const sheetPaths = Object.keys(files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort();
  if (!sheetPaths.length)
    throw new Error("No worksheet was found in the uploaded Excel file.");
  return sheetPaths.flatMap((sheetPath) => {
    const document = new DOMParser().parseFromString(
      decoder.decode(files[sheetPath]),
      "application/xml",
    );
    if (document.querySelector("parsererror"))
      throw new Error("The Excel worksheet could not be read.");
    return [...document.getElementsByTagNameNS("*", "row")].map((row) => {
      const result: string[] = [];
      for (const cell of [...row.getElementsByTagNameNS("*", "c")]) {
        const index = columnIndex(cell.getAttribute("r") || "");
        const type = cell.getAttribute("t"),
          raw = cell.getElementsByTagNameNS("*", "v")[0]?.textContent || "";
        result[index] =
          type === "s"
            ? shared[Number(raw)] || ""
            : type === "inlineStr"
              ? [...cell.getElementsByTagNameNS("*", "t")]
                  .map((text) => text.textContent || "")
                  .join("")
              : raw;
      }
      return result;
    });
  });
}

export async function readBidSpreadsheet(
  file: File,
): Promise<ImportedBidRow[]> {
  if (!file.size) throw new Error("The selected bid spreadsheet is empty.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("The bid spreadsheet must be 10 MB or smaller.");
  const name = file.name.toLowerCase();
  if (
    !name.endsWith(".xls") &&
    !name.endsWith(".xlsx") &&
    !name.endsWith(".xml") &&
    !name.endsWith(".csv")
  )
    throw new Error(
      "Please upload the completed Excel bid spreadsheet downloaded from this deal.",
    );
  const rows = name.endsWith(".xlsx")
    ? await parseXlsx(file)
    : name.endsWith(".csv")
      ? parseCsv(await file.text())
      : parseSpreadsheetXml(await file.text());
  let lineIndex = -1,
    bidIndex = -1,
    commentsIndex = -1;
  const imported: ImportedBidRow[] = [];
  const normalizedHeader = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  for (const row of rows) {
    const normalized = row.map((value) => normalizedHeader(value || ""));
    const possibleLineIndex = normalized.findIndex((value) =>
      ["line", "line id", "lbb line id", "pdd line id"].includes(value),
    );
    if (possibleLineIndex >= 0) {
      lineIndex = possibleLineIndex;
      bidIndex = normalized.findIndex((value) =>
        ["unit bid", "unit price", "bid price"].includes(value),
      );
      commentsIndex = normalized.findIndex((value) =>
        ["bid comments", "bid comment"].includes(value),
      );
      continue;
    }
    if (lineIndex >= 0 && bidIndex >= 0 && row.some(Boolean))
      imported.push({
        lineId: (row[lineIndex] || "").trim(),
        unitBid: (row[bidIndex] || "").replace(/[$,]/g, "").trim(),
        comments: commentsIndex >= 0 ? (row[commentsIndex] || "").trim() : "",
      });
  }
  if (!imported.length)
    throw new Error(
      "No bid lines were found. Please use the spreadsheet downloaded from this deal.",
    );
  return imported;
}
