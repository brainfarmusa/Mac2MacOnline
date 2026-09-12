type DealFilenameInput = {
  deal_number: string;
  closes_at?: string;
  quantity?: number;
  title?: string;
  category?: string;
  spreadsheet_filename?: string;
};

const slug = (value: string) =>
  value.trim().replace(/&/g, " and ").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "Mixed-IT-Equipment";

const genericFilename = (value: string) =>
  !value || /^(?:(?:B|WTB)\d{6}-\d{2}-)?(?:customer[- ]?bid|bid[- ]?spreadsheet)(?:\.xlsx)?$/i.test(value.trim());

export function dealSpreadsheetFilename(deal: DealFilenameInput) {
  const saved = String(deal.spreadsheet_filename || "").trim();
  if (!genericFilename(saved)) return saved.endsWith(".xlsx") ? saved : `${saved}.xlsx`;
  const close = deal.closes_at ? new Date(deal.closes_at) : null;
  const validClose = close && !Number.isNaN(close.getTime());
  const parts = validClose
    ? Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "2-digit", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(close).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]))
    : {};
  const date = validClose ? `${parts.month}${parts.day}${parts.year}` : "Open";
  const minute = parts.minute && parts.minute !== "00" ? parts.minute : "";
  const time = validClose ? `${parts.hour}${minute}${parts.dayPeriod}` : "Offers";
  const quantity = Math.max(0, Math.round(Number(deal.quantity) || 0));
  const title = String(deal.title || "").replace(/^(?:qty\.?\s*[:#-]?\s*)?\d[\d,]*[-\s]*(?:piece|pcs?|units?)?\s*/i, "").replace(/\s+lot$/i, "").trim();
  const description = title && !/^(?:customer bid|mixed it equipment)$/i.test(title) ? title : String(deal.category || "Mixed IT Equipment");
  return `${deal.deal_number}-Closes-${date}-${time}-${quantity}PCS-${slug(description)}.xlsx`;
}
