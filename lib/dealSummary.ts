import { buildLotNotes } from "./bidSpreadsheet";
import { detectProductCategory } from "./productCategory";

type PublicLine = {
  quantity?: number;
  values?: Record<string, string>;
};

type PublicDeal = {
  category?: string;
  title?: string;
  description?: string;
  quantity?: number;
  public_lines?: PublicLine[];
  spreadsheet_filename?: string;
};

const ordinal = (value: number) => {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
};

/** Improve Apple tablet titles and notes from the quantity-weighted configurations. */
export function enhanceDealSummary<T extends PublicDeal>(deal: T): T {
  const lines = Array.isArray(deal.public_lines) ? deal.public_lines : [];
  const savedCategory = String(deal.category || "").trim();
  const categoryText = `${deal.title || ""} ${deal.description || ""} ${lines.flatMap((line) => Object.values(line.values || {})).join(" ")}`;
  // A stored category is authoritative. Detection is only a fallback for legacy
  // records that have never been categorized.
  const normalizedCategory = savedCategory || detectProductCategory(categoryText, "Technology");
  const categorizedDeal = { ...deal, category: normalizedCategory } as T;
  const ipadLines = lines.filter((line) =>
    Object.values(line.values || {}).some((value) => /\bipad\b/i.test(value)),
  );
  if (!ipadLines.length || ipadLines.length < lines.length * 0.7) return categorizedDeal;

  const standardGenerations = new Set<number>();
  let airQuantity = 0;
  for (const line of ipadLines) {
    const text = Object.values(line.values || {}).join(" ");
    if (/\bipad air\b/i.test(text)) airQuantity += Number(line.quantity) || 1;
    else if (!/\bipad mini\b/i.test(text)) {
      const generation = text.match(/iPad\s*\((\d+)(?:st|nd|rd|th) generation\)/i);
      if (generation) standardGenerations.add(Number(generation[1]));
    }
  }
  const generations = [...standardGenerations].sort((a, b) => a - b);
  const range = generations.length
    ? `${ordinal(generations[0])}–${ordinal(generations.at(-1) || generations[0])} Gen`
    : "Mixed Generations";
  const headers = [...new Set(lines.flatMap((line) => Object.keys(line.values || {})))];
  const columns = [
    ...headers.map((header) => ({
      header,
      value: (index: number) => lines[index]?.values?.[header] || "",
    })),
    { header: "Qty", value: (index: number) => Number(lines[index]?.quantity) || 1 },
  ];
  const quantity = Number(deal.quantity) || lines.reduce((sum, line) => sum + (Number(line.quantity) || 1), 0);
  const shortName = `Apple-iPad-${range.replace(/[^a-zA-Z0-9]+/g, "-")}${airQuantity ? "-and-iPad-Air-Mix" : "-Mix"}`;
  return {
    ...categorizedDeal,
    title: `${quantity.toLocaleString("en-US")}-Piece Apple iPad ${range}${airQuantity ? " & iPad Air Mix" : " Mix"}`,
    description: buildLotNotes(lines.length, columns),
    spreadsheet_filename: deal.spreadsheet_filename?.replace(
      /(\d+PCS-).*?(\.xlsx)$/i,
      `$1${shortName}$2`,
    ),
  };
}
