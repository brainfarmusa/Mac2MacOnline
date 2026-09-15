"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/SiteShell";
import ContactTemplateFields from "@/components/ContactTemplateFields";
import {
  clearPddSession,
  currentPddSession,
  pddAuthFetch,
  pddSupabaseKey,
  pddSupabaseUrl,
  PddSession,
} from "@/lib/pdd-auth";
import {
  previewRawSpreadsheet,
  RawSpreadsheetPreview,
  SpreadsheetSelection,
  spreadsheetSheetNames,
} from "@/lib/rawDealSpreadsheet";
import { buildLotNotes } from "@/lib/bidSpreadsheet";
import { detectProductCategory } from "@/lib/productCategory";
import { nextBusinessDate } from "@/lib/businessDays";
import { inventoryCategory, inventoryDescription } from "@/lib/inventorySummary";
import "./deal-builder.css";
import "./mapping.css";
import "./quantifying.css";
import "./review-mapping.css";
import "./deal-details.css";
import "./vendor.css";
import "./compact.css";
import "./photo-fit.css";
import "./r2-choice.css";

type Profile = {
  email: string;
  display_name: string;
  role: "administrator" | "employee";
};
type EmployeeOption = Profile;
type AuthUser = { id: string; email?: string };
type ColumnRole = "group" | "ignore" | "quantity";
type ColumnChoice = { index: number; header: string; role: ColumnRole };
type AwardMode = "single" | "multiple";
type ColumnMapping = {
  version: 1;
  columns: ColumnChoice[];
  sheets?: SpreadsheetSelection;
  productCategory?: string;
  dealDirection?: "buying" | "selling";
  sourceMode?: "spreadsheet" | "typed";
  awardMode?: AwardMode;
};
type QuantifiedSource = { row: number; quantity: number };
type QuantifiedLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
  sources: QuantifiedSource[];
};
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
  created_by_name: string;
  created_by_email: string;
};
type VendorDraft = Omit<Vendor, "id" | "created_by_name" | "created_by_email">;
type SavedUpload = {
  id: string;
  uploaded_by: string;
  employee_email: string;
  vendor_id: string | null;
  original_name: string;
  storage_path: string;
  created_at: string;
  source_row_count: number;
  source_headers: string[];
  status: string;
  header_row: number | null;
  column_mapping: ColumnMapping | null;
  quantified_lines: QuantifiedLine[];
  quantified_line_count: number;
  mapping_reviewed_at: string | null;
  mapping_reviewed_by: string | null;
  deal_number: string | null;
  short_description: string | null;
  bid_close_date: string | null;
  bid_close_time: string | null;
  bid_timezone: string;
  display_name: string | null;
  display_filename: string | null;
  details_completed_at: string | null;
  published_at: string | null;
};
type DealPhoto = { id: string; filename: string; url: string };

const emptyVendor: VendorDraft = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "United States",
};
const productCategories = [
  "Accessories",
  "Apple",
  "CPUs",
  "Desktops",
  "GPUs",
  "HDD",
  "HDD/SSD",
  "Laptops",
  "Monitors",
  "Networking",
  "Phones",
  "POS Systems",
  "RAM",
  "Server Components",
  "Servers",
  "SSD",
  "SSD/HDD",
  "Tablets",
  "Workstations",
] as const;

const manualCategoryColumns: Record<(typeof productCategories)[number], readonly string[]> = {
  Accessories: ["Accessory Type", "Compatibility", "Color"],
  Apple: ["Device Type", "Year", "Screen Size", "Processor", "Memory", "Storage", "Color", "Lock Status"],
  CPUs: ["Socket", "Cores", "Threads", "Base Speed", "Max Speed"],
  Desktops: ["Form Factor", "Processor", "Memory", "Storage", "Graphics"],
  GPUs: ["Memory Size", "Memory Type", "Interface", "Form Factor"],
  HDD: ["Capacity", "Interface", "Form Factor", "RPM"],
  "HDD/SSD": ["Drive Type", "Capacity", "Interface", "Form Factor"],
  Laptops: ["Screen Size", "Processor", "Memory", "Storage", "Graphics"],
  Monitors: ["Screen Size", "Resolution", "Panel Type", "Refresh Rate"],
  Networking: ["Equipment Type", "Ports", "Port Speed", "Interface", "Form Factor"],
  Phones: ["Carrier", "Storage", "Color", "Lock Status"],
  "POS Systems": ["Equipment Type", "Processor", "Memory", "Storage", "Screen Size"],
  RAM: ["Size", "Rank", "Speed", "Memory Type", "Form Factor"],
  "Server Components": ["Component Type", "Compatibility", "Capacity / Size", "Speed"],
  Servers: ["Form Factor", "Processor", "CPU Qty", "Memory", "Storage", "Drive Bays", "RAID", "NIC"],
  SSD: ["Capacity", "Interface", "Form Factor"],
  "SSD/HDD": ["Drive Type", "Capacity", "Interface", "Form Factor"],
  Tablets: ["Screen Size", "Processor", "Memory", "Storage", "Connectivity", "Lock Status"],
  Workstations: ["Form Factor", "Processor", "Memory", "Storage", "Graphics"],
};

const manualHeadersFor = (category: string, mode: "" | AwardMode) => {
  const related = manualCategoryColumns[category as keyof typeof manualCategoryColumns] || [];
  return [
    "Mfg",
    "Model",
    "Part Number",
    "Description",
    ...(mode === "multiple" ? ["Box #"] : []),
    ...related,
    "Condition",
    "Grade",
    "Comments",
    "Qty",
  ];
};

const steps = [
  [
    "01",
    "Add inventory",
    "Upload a spreadsheet or type the headers and item data.",
  ],
  ["02", "Confirm columns", "Choose the header row and identify columns."],
  [
    "03",
    "Quantify items",
    "Group like items while ignoring inventory IDs, serials, locations and row-specific fields.",
  ],
  [
    "04",
    "Deal details",
    "Set the deal number, title, description and closing date.",
  ],
  ["05", "Publish deal", "Create the customer listing and bid spreadsheet."],
] as const;

const safeFileName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120) || "raw-deal.xlsx";
const pacificDateParts = (date = new Date()) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
const dateCode = (date: string) => {
  const [year, month, day] = date.split("-");
  return `${month}${day}${year.slice(-2)}`;
};
const formatCloseTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return minutes
    ? `${hour}${String(minutes).padStart(2, "0")}${suffix}`
    : `${hour}${suffix}`;
};
const readableCloseTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2020, 0, 1, hours, minutes));
};
const slugDescription = (value: string) =>
  value
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Mixed-IT-Equipment";
const suggestedDescription = (name: string, lines: QuantifiedLine[]) => {
  const source = name.toLowerCase(),
    headers = new Set(
      lines.flatMap((line) =>
        Object.keys(line.values).map((key) => key.toLowerCase()),
      ),
    ),
    values = lines.flatMap((line) => Object.values(line.values));
  const makers = [
    ...new Set(
      lines
        .map(
          (line) =>
            line.values.MFG || line.values.Manufacturer || line.values.Brand,
        )
        .filter(Boolean),
    ),
  ];
  const models = [
    ...new Set(lines.map((line) => line.values.Model).filter(Boolean)),
  ];
  const transceiverProducts = values.filter((value) =>
    /\b(transceiver(?: module)?s?|optical modules?|osfp|qsfp(?:28|56|112)?|sfp\+?|cfp\d*|dr4|dr8|sr4|sr8|vr4|vr8|MMA[0-9A-Z-]+|MMS[0-9A-Z-]+)\b/i.test(value),
  ).length;
  if (
    /\b(transceiver|osfp|qsfp|sfp)\b/i.test(source) ||
    transceiverProducts >= Math.max(2, Math.ceil(lines.length * 0.25))
  )
    return makers.some((maker) => /nvidia/i.test(maker))
      ? "NVIDIA Optical Transceivers"
      : "Optical Transceivers";
  const memoryFile = /\b(ram|memory|dimm|sodimm|rdimm|udimm)\b/i.test(source),
    memoryColumns =
      headers.has("capacity") &&
      (headers.has("rank / organization") ||
        [...headers].some((header) => /type.*speed|memory|dimm/.test(header))),
    memoryProducts = values.filter((value) =>
      /\b(ddr[2-5]|pc[2-5][l]?-?\d|\d+r[xX]\d|dimm|sodimm|rdimm|udimm)\b/i.test(
        value,
      ),
    ).length;
  if (
    memoryFile ||
    memoryColumns ||
    memoryProducts >= Math.max(3, Math.ceil(lines.length * 0.15))
  )
    return "Mixed RAM";
  const ipadLines = lines.filter((line) =>
    Object.values(line.values).some((value) => /\bipad\b/i.test(value)),
  );
  if (ipadLines.length && ipadLines.length >= lines.length * 0.7) {
    const standardGenerations = new Set<number>();
    let airQuantity = 0;
    for (const line of ipadLines) {
      const text = Object.values(line.values).join(" ");
      if (/\bipad air\b/i.test(text)) airQuantity += line.quantity;
      else if (!/\bipad mini\b/i.test(text)) {
        const generation = text.match(/iPad\s*\((\d+)(?:st|nd|rd|th) generation\)/i);
        if (generation) standardGenerations.add(Number(generation[1]));
      }
    }
    const generations = [...standardGenerations].sort((a, b) => a - b);
    const generationLabel = generations.length
      ? `${generations[0]}th-${generations.at(-1)}th Gen`
      : "Mixed Generations";
    return `Apple iPad ${generationLabel}${airQuantity ? " & iPad Air Mix" : " Mix"}`;
  }
  if (models.length === 1)
    return [makers[0], models[0]].filter(Boolean).join(" ");
  if (
    source.includes("laptop") ||
    lines.some((line) =>
      Object.values(line.values).some((value) =>
        /laptop|notebook/i.test(value),
      ),
    )
  )
    return "Mixed Laptops";
  if (
    source.includes("server") ||
    lines.some((line) =>
      Object.values(line.values).some((value) => /server/i.test(value)),
    )
  )
    return "Mixed Servers";
  if (
    source.includes("monitor") ||
    lines.some((line) =>
      Object.values(line.values).some((value) =>
        /\b(lcd|monitor|display)\b/i.test(value),
      ),
    )
  )
    return "LCD Monitors";
  if (makers.length === 1 && /apple/i.test(makers[0]))
    return "Mixed Apple Equipment";
  return "Mixed IT Equipment";
};
const suggestedCategory = (name: string, lines: QuantifiedLine[]) => {
  return inventoryCategory(lines, detectProductCategory(name, "Accessories"));
};
const generalizedWtbDescription = (category: string, description: string) => {
  if (!/^we (?:are|'re) looking to buy\b/i.test(description) && description.length <= 72)
    return description;
  if (category === "RAM") return "RAM Memory Modules";
  if (category === "SSD") return "Enterprise SSDs";
  if (category === "GPUs") return "GPUs";
  if (category === "Apple") return "Apple Equipment";
  return category || "Wanted Equipment";
};
const closeTimes = Array.from({ length: 21 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");
const ignoredHeader =
  /\b(source tab|uid|uuid|inventory[\s_-]*(?:id|tag|number)|serial|service tag|asset (?:id|tag)|barcode|warehouse|location|sales order|order #|row|line #|pallet|battery current capacity|battery design capacity|battery wear level|extended(?:[\s_-]*price)?|total|price)\b/i;
const totalPriceHeader =
  /^(?:total|line total|extended (?:price|cost|amount)|total (?:price|cost|amount)|amount)$/i;
const quantityHeader = /^(qty|quantity|units|unit count|count)$/i;
const boxHeader =
  /^(?:box(?:\s*(?:#|number|no\.?))?|lot(?:\s*(?:#|number|no\.?))?|container(?:\s*(?:#|number|no\.?))?)$/i;
const isBoxHeader = (header: string) => boxHeader.test(header.trim());
const defaultRole = (header: string, separateLots = false): ColumnRole =>
  separateLots && header.trim() === "Source Tab"
    ? "group"
    : quantityHeader.test(header.trim())
      ? "quantity"
      : ignoredHeader.test(header.trim()) ||
          totalPriceHeader.test(header.trim())
        ? "ignore"
        : "group";
const choicesFor = (headers: string[], separateLots = false): ColumnChoice[] =>
  headers.map((header, index) => ({
    index,
    header: header || `Column ${index + 1}`,
    role: defaultRole(header, separateLots),
  }));
const totalRowLabel =
  /^(?:(?:box|lot)\s+totals?|grand\s+total|sub\s*total|totals?)(?:\s+(?:qty|quantity|pieces?|units?|items?))?\s*:?\s*$/i;
const hasItemData = (row: string[], columns: ColumnChoice[]) =>
  !row.some((value) => totalRowLabel.test(String(value || "").trim())) &&
  columns.some(
    (column) =>
      column.role === "group" && String(row[column.index] || "").trim() !== "",
  );
function quantifySpreadsheet(
  sheet: RawSpreadsheetPreview,
  columns: ColumnChoice[],
  awardMode: AwardMode = "single",
): QuantifiedLine[] {
  const groupColumns = columns.filter((column) => column.role === "group");
  const quantityColumn = columns.find((column) => column.role === "quantity");
  const boxColumn =
    awardMode === "multiple"
      ? groupColumns.find((column) => isBoxHeader(column.header))
      : undefined;
  const groups = new Map<string, QuantifiedLine>();
  let currentBox = "";
  sheet.rows.forEach((row, rowIndex) => {
    if (!hasItemData(row, columns)) return;
    const explicitBox = boxColumn
      ? String(row[boxColumn.index] || "").trim()
      : "";
    if (explicitBox) currentBox = explicitBox;
    const values = Object.fromEntries(
      groupColumns.map((column) => [column.header, row[column.index] || ""]),
    );
    const key = JSON.stringify(
      groupColumns.map((column) =>
        column === boxColumn ? currentBox : row[column.index] || "",
      ),
    );
    const parsed = quantityColumn
      ? Number(String(row[quantityColumn.index] || "").replace(/,/g, ""))
      : 1;
    const rowQuantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const source = {
      row: sheet.rowSources?.[rowIndex]?.row || sheet.headerRow + 1 + rowIndex,
      quantity: rowQuantity,
    };
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += rowQuantity;
      existing.sources.push(source);
    } else
      groups.set(key, {
        line: 0,
        quantity: rowQuantity,
        values,
        sources: [source],
      });
  });
  return [...groups.values()].map((line, index) => ({
    ...line,
    line: index + 1,
  }));
}

function automaticMappingIsSafe(
  sheet: RawSpreadsheetPreview,
  columns: ColumnChoice[],
  lines: QuantifiedLine[],
  awardMode: AwardMode,
) {
  const normalizedHeaders = sheet.headers.map((header) => header.trim().toLowerCase());
  const quantityColumns = columns.filter((column) => column.role === "quantity");
  const groupColumns = columns.filter((column) => column.role === "group");
  const itemRows = sheet.rows.filter((row) => hasItemData(row, columns));
  const mappedRows = lines.reduce((sum, line) => sum + line.sources.length, 0);
  const quantitiesAreValid = quantityColumns.length !== 1 || itemRows.every((row) => {
    const value = Number(String(row[quantityColumns[0].index] || "").replace(/,/g, ""));
    return Number.isFinite(value) && value > 0;
  });
  return Boolean(
    normalizedHeaders.length &&
    normalizedHeaders.every(Boolean) &&
    new Set(normalizedHeaders).size === normalizedHeaders.length &&
    groupColumns.length &&
    quantityColumns.length <= 1 &&
    quantitiesAreValid &&
    itemRows.length &&
    mappedRows === itemRows.length &&
    (awardMode !== "multiple" || groupColumns.some((column) => isBoxHeader(column.header))),
  );
}

export default function DealBuilder() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<PddSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [dealOwnerEmail, setDealOwnerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RawSpreadsheetPreview | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetMode, setSheetMode] = useState<"single" | "all" | "lots">(
    "single",
  );
  const [selectedSheet, setSelectedSheet] = useState("");
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [dealPhotos, setDealPhotos] = useState<DealPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [savingQuantified, setSavingQuantified] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState<SavedUpload | null>(null);
  const [replacementTarget, setReplacementTarget] =
    useState<SavedUpload | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const previousStepRef = useRef(activeStep);
  const [mapping, setMapping] = useState<ColumnChoice[]>([]);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [quantified, setQuantified] = useState<QuantifiedLine[]>([]);
  const [quantifiedSaved, setQuantifiedSaved] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [dealNumber, setDealNumber] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [dealDirection, setDealDirection] = useState<
    "" | "buying" | "selling"
  >("");
  const [awardMode, setAwardMode] = useState<"" | AwardMode>("");
  const [manualWantedItems, setManualWantedItems] = useState("");
  const [manualHeaderDraft, setManualHeaderDraft] = useState(manualHeadersFor("RAM", "single").join(", "));
  const [manualHeaders, setManualHeaders] = useState<string[]>([]);
  const [manualRows, setManualRows] = useState<string[][]>([]);
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("13:00");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [vendorDraft, setVendorDraft] = useState<VendorDraft>(emptyVendor);
  const [savingVendor, setSavingVendor] = useState(false);
  const [vendorFeedback, setVendorFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (inputRef.current)
      inputRef.current.accept =
        ".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
  });
  useEffect(() => {
    if (previousStepRef.current === activeStep) return;
    previousStepRef.current = activeStep;

    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(frame);
  }, [activeStep]);
  useEffect(() => {
    if (saved?.column_mapping?.productCategory)
      setProductCategory(saved.column_mapping.productCategory);
    if (saved?.column_mapping?.dealDirection)
      setDealDirection(saved.column_mapping.dealDirection);
    if (saved?.column_mapping?.awardMode)
      setAwardMode(saved.column_mapping.awardMode);
  }, [saved?.id]);
  useEffect(() => {
    if (!session || !dealNumber) {
      setDealPhotos([]);
      return;
    }
    void fetch(`/api/deal-photos?deal=${encodeURIComponent(dealNumber)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((response) => (response.ok ? response.json() : { photos: [] }))
      .then((data) => setDealPhotos(data.photos || []));
  }, [session, dealNumber]);

  useEffect(() => {
    (async () => {
      const active = await currentPddSession();
      if (!active) {
        window.location.replace(
          "/employee-login?return_to=/public-deal-desk/deal-builder",
        );
        return;
      }
      const [userResponse, profileResponse] = await Promise.all([
        pddAuthFetch("/auth/v1/user", {
          headers: { Authorization: `Bearer ${active.access_token}` },
        }),
        pddAuthFetch(
          "/rest/v1/pdd_employee_access?select=email,display_name,role&active=eq.true&order=display_name.asc",
          { headers: { Authorization: `Bearer ${active.access_token}` } },
        ),
      ]);
      if (!userResponse.ok || !profileResponse.ok) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      const authUser = (await userResponse.json()) as AuthUser;
      const profiles = (await profileResponse.json()) as Profile[];
      const currentProfile = profiles.find(
        (item) => item.email.toLowerCase() === authUser.email?.toLowerCase(),
      );
      if (!authUser.id || !currentProfile) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      setSession(active);
      setUser(authUser);
      setProfile(currentProfile);
      setEmployees(profiles);
      setDealOwnerEmail(currentProfile.email);
      const requestedDeal = new URLSearchParams(window.location.search)
        .get("edit")
        ?.trim()
        .toUpperCase();
      const ownershipFilter =
        requestedDeal && currentProfile.role === "administrator"
          ? ""
          : `&or=(uploaded_by.eq.${encodeURIComponent(authUser.id)},employee_email.eq.${encodeURIComponent(currentProfile.email)})`;
      const [dealResponse, vendorResponse] = await Promise.all([
        pddAuthFetch(
          `/rest/v1/pdd_deal_uploads?select=id,uploaded_by,employee_email,vendor_id,original_name,storage_path,created_at,source_row_count,source_headers,status,header_row,column_mapping,quantified_lines,quantified_line_count,mapping_reviewed_at,mapping_reviewed_by,deal_number,short_description,bid_close_date,bid_close_time,bid_timezone,display_name,display_filename,details_completed_at,published_at${requestedDeal ? `&deal_number=eq.${encodeURIComponent(requestedDeal)}` : ""}${ownershipFilter}&order=created_at.desc&limit=1`,
          { headers: { Authorization: `Bearer ${active.access_token}` } },
        ),
        pddAuthFetch(
          "/rest/v1/pdd_vendors?select=id,company_name,contact_name,email,phone,address1,address2,city,region,postal_code,country,created_by_name,created_by_email&order=company_name.asc",
          { headers: { Authorization: `Bearer ${active.access_token}` } },
        ),
      ]);
      if (vendorResponse.ok)
        setVendors((await vendorResponse.json()) as Vendor[]);
      if (dealResponse.ok) {
        const deals = (await dealResponse.json()) as SavedUpload[];
        if (deals[0]) {
          setSaved(deals[0]);
          setDealOwnerEmail(deals[0].employee_email || currentProfile.email);
          setVendorId(deals[0].vendor_id || "");
          setMapping(
            deals[0].column_mapping?.columns?.length
              ? deals[0].column_mapping.columns
              : choicesFor(deals[0].source_headers),
          );
          setMappingSaved(deals[0].status !== "uploaded");
          setReviewSaved(Boolean(deals[0].mapping_reviewed_at));
          setDetailsSaved(Boolean(deals[0].details_completed_at));
          setPublished(Boolean(deals[0].published_at));
          setDealNumber(deals[0].deal_number || "");
          setShortDescription(deals[0].short_description || "");
          setCloseDate(deals[0].bid_close_date || "");
          setCloseTime(deals[0].bid_close_time?.slice(0, 5) || "13:00");
          if (deals[0].quantified_lines?.length) {
            setQuantified(deals[0].quantified_lines);
            setQuantifiedSaved(true);
            if (deals[0].column_mapping?.sourceMode === "typed") {
              setMappingSaved(true);
              setReviewSaved(true);
            }
            setActiveStep(
              deals[0].published_at
                ? 6
                : deals[0].column_mapping?.sourceMode === "typed"
                  ? 5
                  : deals[0].details_completed_at
                    ? 5
                    : 3,
            );
          }
        }
      }
      setLoading(false);
    })();
  }, []);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (loading || parameters.get("new") !== "1") return;
    const requestedAwardMode = parameters.get("award");
    setFile(null);
    setPreview(null);
    setSaved(null);
    setVendorId("");
    setAddingVendor(false);
    setVendorDraft(emptyVendor);
    setMapping([]);
    setMappingSaved(false);
    setQuantified([]);
    setQuantifiedSaved(false);
    setReviewSaved(false);
    setDetailsSaved(false);
    setPublished(false);
    setDealNumber("");
    setDealOwnerEmail(profile?.email || "");
    setDealPhotos([]);
    setShortDescription("");
    setProductCategory("");
    setAwardMode(
      requestedAwardMode === "single" || requestedAwardMode === "multiple"
        ? requestedAwardMode
        : "",
    );
    setManualWantedItems("");
    setManualHeaders([]);
    setManualRows([]);
    setCloseDate("");
    setCloseTime("13:00");
    setActiveStep(1);
    window.history.replaceState({}, "", window.location.pathname);
  }, [loading]);

  async function uploadDealPhotos(files: FileList | null) {
    if (!files?.length || !session || !dealNumber) return;
    setUploadingPhotos(true);
    setError("");
    const form = new FormData();
    form.set("deal", dealNumber);
    Array.from(files).forEach((photo) => form.append("photos", photo));
    try {
      const response = await fetch("/api/deal-photos", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The pictures could not be uploaded.");
      setDealPhotos((current) => [...current, ...(data.photos || [])]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The pictures could not be uploaded.",
      );
    } finally {
      setUploadingPhotos(false);
    }
  }
  async function removeDealPhoto(photo: DealPhoto) {
    if (!session || !confirm(`Remove ${photo.filename}?`)) return;
    const response = await fetch(
      `/api/deal-photos?id=${encodeURIComponent(photo.id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );
    if (response.ok)
      setDealPhotos((current) =>
        current.filter((item) => item.id !== photo.id),
      );
    else setError("The picture could not be removed.");
  }

  async function saveVendor() {
    if (!session || !user) {
      setVendorFeedback({
        tone: "error",
        message: "Your employee session expired. Sign in again, then save the vendor.",
      });
      return;
    }
    const required = [
      ["company name", vendorDraft.company_name],
      ["contact name", vendorDraft.contact_name],
      ["email address", vendorDraft.email],
    ] as const;
    const missing = required
      .filter(([, value]) => !value.trim())
      .map(([label]) => label);
    if (missing.length > 0) {
      setVendorFeedback({
        tone: "error",
        message: `Complete the following fields: ${missing.join(", ")}.`,
      });
      return;
    }
    setSavingVendor(true);
    setVendorFeedback(null);
    setError("");
    try {
      const response = await pddAuthFetch("/rest/v1/pdd_vendors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          ...vendorDraft,
          company_name: vendorDraft.company_name.trim(),
          contact_name: vendorDraft.contact_name.trim(),
          email: vendorDraft.email.trim(),
          phone: vendorDraft.phone.trim(),
          address1: vendorDraft.address1.trim(),
          address2: vendorDraft.address2.trim(),
          city: vendorDraft.city.trim(),
          region: vendorDraft.region.trim(),
          postal_code: vendorDraft.postal_code.trim(),
          country: vendorDraft.country.trim() || "United States",
          created_by: user.id,
          created_by_name:
            profile?.display_name || profile?.email || "Employee",
          created_by_email: profile?.email || user.email || "",
        }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
          message?: string;
          details?: string;
          hint?: string;
        } | null;
        throw new Error(
          failure?.message ||
            failure?.details ||
            failure?.hint ||
            "The vendor could not be saved.",
        );
      }
      const records = (await response.json()) as Vendor[];
      if (!records[0]) throw new Error("The saved vendor could not be opened.");
      const savedVendor = records[0];
      const refreshedResponse = await pddAuthFetch(
        "/rest/v1/pdd_vendors?select=id,company_name,contact_name,email,phone,address1,address2,city,region,postal_code,country,created_by_name,created_by_email&order=company_name.asc",
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (refreshedResponse.ok) {
        const refreshedVendors = (await refreshedResponse.json()) as Vendor[];
        setVendors(
          refreshedVendors.some((vendor) => vendor.id === savedVendor.id)
            ? refreshedVendors
            : [...refreshedVendors, savedVendor].sort((a, b) =>
                a.company_name.localeCompare(b.company_name),
              ),
        );
      } else {
        setVendors((current) =>
          [...current.filter((vendor) => vendor.id !== savedVendor.id), savedVendor].sort(
            (a, b) => a.company_name.localeCompare(b.company_name),
          ),
        );
      }
      setVendorId(savedVendor.id);
      setAddingVendor(false);
      setVendorDraft(emptyVendor);
      setVendorFeedback({
        tone: "success",
        message: `${savedVendor.company_name} was saved and selected.`,
      });
    } catch (reason) {
      setVendorFeedback({
        tone: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "The vendor could not be saved.",
      });
    } finally {
      setSavingVendor(false);
    }
  }

  const sheetSelection = (): SpreadsheetSelection => ({
    mode: sheetMode,
    names:
      sheetMode === "single"
        ? [selectedSheet]
        : sheetMode === "all"
          ? sheetNames
          : selectedSheets,
  });
  async function chooseFile(next: File) {
    setError("");
    setSaved(null);
    setPreview(null);
    setSheetNames([]);
    setSheetMode("single");
    setSelectedSheet("");
    setSelectedSheets([]);
    setMapping([]);
    setMappingSaved(false);
    setQuantified([]);
    setQuantifiedSaved(false);
    setReviewSaved(false);
    setActiveStep(1);
    setFile(next);
    try {
      const names = await spreadsheetSheetNames(next);
      if (!names.length)
        throw new Error("No worksheet was found in this spreadsheet.");
      const inventorySheets=names.filter(name=>!/(?:^|\b)(?:summary|container log|instructions?|read\s*me)(?:\b|$)/i.test(name.trim()));
      setSheetNames([...names].sort((a, b) => a.localeCompare(b)));
      setSelectedSheet(inventorySheets[0]||names[0]);
      setSelectedSheets(inventorySheets);
      if(awardMode==="multiple"&&names.length>1)setSheetMode("lots");
      if (names.length === 1)
        setPreview(
          await previewRawSpreadsheet(next, {
            mode: "single",
            names: [names[0]],
          }),
        );
    } catch (reason) {
      setFile(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "The spreadsheet could not be read.",
      );
    }
  }

  async function useTypedWantedItems() {
    if (!session || !user || !profile || !vendorId || !dealOwnerEmail || !productCategory) return;
    try {
      setUploading(true);
      setError("");
      const rows: QuantifiedLine[] = manualWantedItems
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean)
        .map((row, index) => {
          const fields = row.split("|").map((field) => field.trim());
          const quantity = Number(fields[2] || "1");
          if (!fields[0])
            throw new Error(`Item ${index + 1} needs a product name.`);
          if (!Number.isFinite(quantity) || quantity <= 0)
            throw new Error(`Item ${index + 1} needs a valid quantity.`);
          return {
            line: index + 1,
            quantity,
            values: {
              Product: fields[0],
              ...(fields[1] ? { "Part Number": fields[1] } : {}),
              ...(fields.slice(3).join(" | ")
                ? { "Specifications / Condition": fields.slice(3).join(" | ") }
                : {}),
            },
            sources: [{ row: index + 1, quantity }],
          };
        });
      if (!rows.length)
        throw new Error("Type at least one wanted product before continuing.");
      const now = new Date().toISOString();
      const typedId = crypto.randomUUID();
      const category = productCategory;
      const productNames = [...new Set(rows.map((line) => line.values.Product).filter(Boolean))];
      const description =
        productNames.length === 1
          ? generalizedWtbDescription(category, productNames[0])
          : category === "RAM"
            ? "Mixed RAM"
            : category === "Accessories"
              ? productNames.slice(0, 2).join(" / ") || "Wanted Equipment"
              : `Mixed ${category}`;
      const recordResponse = await pddAuthFetch("/rest/v1/pdd_deal_uploads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          uploaded_by: user.id,
          employee_email: dealOwnerEmail,
          vendor_id: vendorId,
          original_name: "Typed WTB Request",
          storage_path: `${user.id}/typed-wtb/${typedId}`,
          content_type: "text/plain",
          size_bytes: 1,
          source_row_count: rows.length,
          source_headers: ["Product", "Part Number", "Specifications / Condition"],
          header_row: 1,
          status: "quantified",
          column_mapping: {
            version: 1,
            columns: [],
            dealDirection: "buying",
            productCategory: category,
            sourceMode: "typed",
            awardMode: "single",
          },
          quantified_lines: rows,
          quantified_line_count: rows.length,
          mapping_reviewed_at: now,
          mapping_reviewed_by: user.id,
          updated_at: now,
        }),
      });
      if (!recordResponse.ok)
        throw new Error("The typed WTB request could not be saved.");
      const records = (await recordResponse.json()) as SavedUpload[];
      const record = records[0];
      if (!record) throw new Error("The typed WTB request could not be opened.");

      const parts = pacificDateParts(new Date(record.created_at));
      const prefix = `WTB${parts.month}${parts.day}${parts.year.slice(-2)}-`;
      const numbersResponse = await pddAuthFetch(
        `/rest/v1/pdd_deal_uploads?select=deal_number&deal_number=like.${encodeURIComponent(prefix + "*")}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!numbersResponse.ok)
        throw new Error("The next WTB number could not be assigned.");
      const existing = (await numbersResponse.json()) as { deal_number: string | null }[];
      const sequence = Math.max(0, ...existing.map((item) => Number(item.deal_number?.slice(-2)) || 0)) + 1;
      const nextNumber = `${prefix}${String(sequence).padStart(2, "0")}`;
      const close = new Date();
      close.setDate(close.getDate() + 3);
      const closeParts = pacificDateParts(close);

      setFile(null);
      setPreview(null);
      setSaved(record);
      setDealDirection("buying");
      setQuantified(rows);
      setMapping([]);
      setMappingSaved(true);
      setQuantifiedSaved(true);
      setReviewSaved(true);
      setDetailsSaved(false);
      setPublished(false);
      setDealNumber(nextNumber);
      setProductCategory(category);
      setShortDescription(description);
      setCloseDate(nextBusinessDate(`${closeParts.year}-${closeParts.month}-${closeParts.day}`));
      setCloseTime("13:00");
      setActiveStep(5);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The typed wanted items could not be prepared.",
      );
    } finally {
      setUploading(false);
    }
  }
  function confirmManualHeaders() {
    const headers = manualHeaderDraft.split(/[,\n]/).map(value => value.trim()).filter(Boolean);
    if (headers.length < 2) { setError("Enter at least two column headers."); return; }
    if (new Set(headers.map(value => value.toLowerCase())).size !== headers.length) { setError("Each column header must be unique."); return; }
    if (!headers.some(header => quantityHeader.test(header))) { setError("Include a Quantity or Qty header."); return; }
    if (awardMode === "multiple" && !headers.some(isBoxHeader)) { setError("Multiple-award manual deals require a Box # or Lot # header."); return; }
    setError("");
    setManualHeaders(headers);
    setManualRows(Array.from({length:5},()=>headers.map(()=>"")));
  }
  function addManualHeader() {
    const value = window.prompt("Enter the new header name:")?.trim() || "";
    if (!value) return;
    const currentHeaders = manualHeaders.length
      ? manualHeaders
      : manualHeaderDraft.split(/[,\n]/).map(header => header.trim()).filter(Boolean);
    if (currentHeaders.some(header => header.toLowerCase() === value.toLowerCase())) {
      setError("That header already exists.");
      return;
    }
    setError("");
    if (manualHeaders.length) {
      setManualHeaders(headers => [...headers, value]);
      setManualRows(rows => rows.map(row => [...row, ""]));
    } else {
      setManualHeaderDraft(current => current.trim() ? `${current.trim()}, ${value}` : value);
    }
  }
  function updateManualCell(rowIndex:number,columnIndex:number,value:string){setManualRows(current=>current.map((row,index)=>index===rowIndex?row.map((cell,column)=>column===columnIndex?value:cell):row))}
  async function useManualDeal(){
    if(!session||!user||!profile||!vendorId||!dealOwnerEmail||!dealDirection||!awardMode||!productCategory)return;
    setUploading(true);setError("");
    try{
      const quantityIndex=manualHeaders.findIndex(header=>quantityHeader.test(header));
      const rows:QuantifiedLine[]=manualRows.filter(row=>row.some(cell=>cell.trim())).map((row,index)=>{
        const quantity=Number(String(row[quantityIndex]||"").replace(/,/g,""));
        if(!Number.isFinite(quantity)||quantity<=0)throw new Error(`Row ${index+1} needs a valid quantity.`);
        const values=Object.fromEntries(manualHeaders.map((header,column)=>[header,row[column]?.trim()||""]).filter((_,column)=>column!==quantityIndex));
        if(!Object.values(values).some(Boolean))throw new Error(`Row ${index+1} needs item data.`);
        return{line:index+1,quantity,values,sources:[{row:index+1,quantity}]};
      });
      if(!rows.length)throw new Error("Enter at least one item row before continuing.");
      const now=new Date().toISOString(),typedId=crypto.randomUUID(),category=productCategory,storagePath=`${user.id}/typed-deal/${typedId}.json`,sourceSnapshot=new Blob([JSON.stringify({headers:manualHeaders,rows})],{type:"application/octet-stream"}),objectUrl=`${pddSupabaseUrl}/storage/v1/object/pdd-deal-uploads/${encodePath(storagePath)}`,objectResponse=await fetch(objectUrl,{method:"POST",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/octet-stream","x-upsert":"false"},body:sourceSnapshot});
      if(!objectResponse.ok){const detail=await objectResponse.json().catch(()=>null) as {message?:string}|null;throw new Error(detail?.message||"The manually entered deal source could not be saved.")}
      const recordResponse=await pddAuthFetch("/rest/v1/pdd_deal_uploads",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,Prefer:"return=representation"},body:JSON.stringify({uploaded_by:user.id,employee_email:dealOwnerEmail.toLowerCase(),vendor_id:vendorId,original_name:"Typed Deal Entry",storage_path:storagePath,content_type:"application/octet-stream",size_bytes:sourceSnapshot.size,source_row_count:rows.length,source_headers:manualHeaders,header_row:1,status:"quantified",column_mapping:{version:1,columns:choicesFor(manualHeaders),dealDirection,productCategory:category,sourceMode:"typed",awardMode},quantified_lines:rows,quantified_line_count:rows.length,mapping_reviewed_at:now,mapping_reviewed_by:user.id,updated_at:now})});
      if(!recordResponse.ok){await fetch(objectUrl,{method:"DELETE",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${session.access_token}`}});const detail=await recordResponse.json().catch(()=>null) as {message?:string;details?:string}|null;throw new Error(detail?.message||detail?.details||"The manually entered deal could not be saved.")}
      const record=(await recordResponse.json() as SavedUpload[])[0];if(!record)throw new Error("The manually entered deal could not be opened.");
      const parts=pacificDateParts(new Date(record.created_at)),prefix=`${dealDirection==="buying"?"WTB":"B"}${parts.month}${parts.day}${parts.year.slice(-2)}-`,numbersResponse=await pddAuthFetch(`/rest/v1/pdd_deal_uploads?select=deal_number&deal_number=like.${encodeURIComponent(prefix+"*")}`,{headers:{Authorization:`Bearer ${session.access_token}`}});if(!numbersResponse.ok)throw new Error("The next deal number could not be assigned.");
      const existing=await numbersResponse.json() as {deal_number:string|null}[],sequence=Math.max(0,...existing.map(item=>Number(item.deal_number?.slice(-2))||0))+1,nextNumber=`${prefix}${String(sequence).padStart(2,"0")}`,close=new Date();close.setDate(close.getDate()+3);const closeParts=pacificDateParts(close);
      setFile(null);setPreview(null);setSaved(record);setQuantified(rows);setMapping(choicesFor(manualHeaders));setMappingSaved(true);setQuantifiedSaved(true);setReviewSaved(true);setDetailsSaved(false);setPublished(false);setDealNumber(nextNumber);setProductCategory(category);setShortDescription(suggestedDescription("typed deal entry",rows));setCloseDate(nextBusinessDate(`${closeParts.year}-${closeParts.month}-${closeParts.day}`));setCloseTime("13:00");setActiveStep(5);
    }catch(reason){setError(reason instanceof Error?reason.message:"The manually entered deal could not be prepared.")}finally{setUploading(false)}
  }
  async function confirmSheetSelection() {
    if (!file || !selectedSheet) return;
    if (sheetMode === "lots" && !selectedSheets.length) {
      setError("Select at least one tab to create customer lots.");
      return;
    }
    setError("");
    setPreview(null);
    try {
      const selection = sheetSelection();
      const next = await previewRawSpreadsheet(file, selection);
      setPreview(next);
      setMapping(choicesFor(next.headers, selection.mode === "lots"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The selected worksheet could not be read.",
      );
    }
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const next = event.dataTransfer.files?.[0];
    if (next) void chooseFile(next);
  }
  async function upload() {
    if (!file || !preview || !session || !user || !profile) return;
    if (!vendorId) {
      setError("Select or add the vendor before uploading the spreadsheet.");
      return;
    }
    if (!dealDirection) {
      setError("Choose WTB or WTS before uploading the spreadsheet.");
      return;
    }
    if (!awardMode) {
      setError("Choose New Deal or Multi-Tab/Lot Deal before uploading the spreadsheet.");
      return;
    }
    if (!productCategory) {
      setError("Select the product category before uploading the spreadsheet.");
      return;
    }
    if (!dealOwnerEmail) {
      setError("Select the employee who owns this deal.");
      return;
    }
    setError("");
    setUploading(true);
    const uploadId = crypto.randomUUID();
    const path = `${user.id}/${new Date().toISOString().slice(0, 10)}/${uploadId}-${safeFileName(file.name)}`;
    const objectUrl = `${pddSupabaseUrl}/storage/v1/object/pdd-deal-uploads/${encodePath(path)}`;
    try {
      const objectResponse = await fetch(objectUrl, {
        method: "POST",
        headers: {
          apikey: pddSupabaseKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });
      if (!objectResponse.ok) {
        const detail = (await objectResponse.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          detail?.message || "The spreadsheet could not be uploaded.",
        );
      }
      const uploadRecord = {
        uploaded_by: user.id,
        employee_email: dealOwnerEmail,
        vendor_id: vendorId,
        original_name: file.name,
        storage_path: path,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        source_row_count: preview.rowCount,
        source_headers: preview.headers,
        header_row: preview.headerRow,
        status: "uploaded",
        column_mapping: {
          version: 1,
          columns: [],
          sheets: sheetSelection(),
          dealDirection,
          productCategory,
          awardMode,
        },
        quantified_lines: [],
        quantified_line_count: 0,
        mapping_reviewed_at: null,
        mapping_reviewed_by: null,
        deal_number: null,
        short_description: null,
        bid_close_date: null,
        bid_close_time: null,
        display_name: null,
        display_filename: null,
        details_completed_at: null,
        published_at: null,
        updated_at: new Date().toISOString(),
      };
      const metadataResponse = await pddAuthFetch(
        replacementTarget
          ? `/rest/v1/pdd_deal_uploads?id=eq.${replacementTarget.id}`
          : "/rest/v1/pdd_deal_uploads",
        {
          method: replacementTarget ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify(uploadRecord),
        },
      );
      if (!metadataResponse.ok) {
        await fetch(objectUrl, {
          method: "DELETE",
          headers: {
            apikey: pddSupabaseKey,
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        throw new Error(
          "The uploaded file could not be attached to a new deal.",
        );
      }
      const records = (await metadataResponse.json()) as SavedUpload[];
      const record = records[0];
      if (!record) throw new Error("The deal record could not be opened.");
      if (replacementTarget?.published_at) {
        await pddAuthFetch(
          `/rest/v1/pdd_public_deals?source_upload_id=eq.${replacementTarget.id}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              published: false,
              status: "archived",
              updated_at: new Date().toISOString(),
            }),
          },
        );
      }
      if (
        replacementTarget?.storage_path &&
        replacementTarget.storage_path !== path
      ) {
        await fetch(
          `${pddSupabaseUrl}/storage/v1/object/pdd-deal-uploads/${encodePath(replacementTarget.storage_path)}`,
          {
            method: "DELETE",
            headers: {
              apikey: pddSupabaseKey,
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );
      }
      setReplacementTarget(null);
      const automaticColumns = choicesFor(preview.headers, sheetSelection().mode === "lots");
      const automaticLines = quantifySpreadsheet(preview, automaticColumns, awardMode);
      setMapping(automaticColumns);
      if (automaticMappingIsSafe(preview, automaticColumns, automaticLines, awardMode)) {
        const reviewedAt = new Date().toISOString();
        const nextColumnMapping: ColumnMapping = {
          ...(record.column_mapping || { version: 1, columns: [] }),
          version: 1,
          columns: automaticColumns,
          sheets: sheetSelection(),
          dealDirection,
          productCategory,
          awardMode,
        };
        const automaticResponse = await pddAuthFetch(
          `/rest/v1/pdd_deal_uploads?id=eq.${record.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              column_mapping: nextColumnMapping,
              quantified_lines: automaticLines,
              quantified_line_count: automaticLines.length,
              mapping_reviewed_at: reviewedAt,
              mapping_reviewed_by: user.id,
              status: "quantified",
              updated_at: reviewedAt,
            }),
          },
        );
        if (automaticResponse.ok) {
          const automaticRecords = (await automaticResponse.json()) as SavedUpload[];
          setSaved(automaticRecords[0] || {
            ...record,
            column_mapping: nextColumnMapping,
            quantified_lines: automaticLines,
            quantified_line_count: automaticLines.length,
            mapping_reviewed_at: reviewedAt,
            mapping_reviewed_by: user.id,
            status: "quantified",
          });
          setMappingSaved(false);
          setQuantified(automaticLines);
          setQuantifiedSaved(true);
          setReviewSaved(true);
          setActiveStep(2);
        } else {
          setSaved(record);
          setActiveStep(2);
        }
      } else {
        setSaved(record);
        setActiveStep(2);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The spreadsheet could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  }
  async function loadSavedPreview() {
    if (preview) return preview;
    if (!saved || !session)
      throw new Error("The saved spreadsheet is not available.");
    if (saved.column_mapping?.sourceMode === "typed") {
      const headers = saved.source_headers.some((header) =>
        quantityHeader.test(header),
      )
        ? saved.source_headers
        : [...saved.source_headers, "Qty"];
      const quantityIndex = headers.findIndex((header) =>
        quantityHeader.test(header),
      );
      const rows = saved.quantified_lines.map((line) =>
        headers.map((header, index) =>
          index === quantityIndex
            ? String(line.quantity)
            : line.values[header] || "",
        ),
      );
      const parsed: RawSpreadsheetPreview = {
        headers,
        rows,
        rowCount: rows.length,
        headerRow: 0,
        rowSources: saved.quantified_lines.map((line, index) => ({
          sheet: "Typed Deal Entry",
          row: line.sources[0]?.row || index + 1,
        })),
      };
      setPreview(parsed);
      if (!mapping.some((column) => column.role === "quantity"))
        setMapping(choicesFor(headers));
      return parsed;
    }
    const response = await fetch(
      `${pddSupabaseUrl}/storage/v1/object/authenticated/pdd-deal-uploads/${encodePath(saved.storage_path)}`,
      {
        headers: {
          apikey: pddSupabaseKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );
    if (!response.ok)
      throw new Error("The saved spreadsheet could not be reopened.");
    const blob = await response.blob();
    const parsed = await previewRawSpreadsheet(
      new File([blob], saved.original_name, { type: blob.type }),
      saved.column_mapping?.sheets,
    );
    setPreview(parsed);
    return parsed;
  }
  async function goToStep(step: 1 | 2 | 3 | 4 | 5 | 6) {
    setError("");
    if (step === 1) {
      startAnotherUpload();
      return;
    }
    if (!saved) return;
    if (step <= 4)
      try {
        await loadSavedPreview();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "The saved spreadsheet could not be reopened.",
        );
        return;
      }
    setActiveStep(step);
  }
  function startAnotherUpload() {
    resetDealBuilder(saved);
  }
  function startNewDeal() {
    if (
      (file || saved) &&
      !window.confirm(
        "Start a new deal? Your current deal will remain saved, but this screen will return to Step 1.",
      )
    )
      return;
    resetDealBuilder(null);
  }
  function resetDealBuilder(replacement: SavedUpload | null) {
    const nextOwnerEmail = saved?.employee_email || profile?.email || "";
    setReplacementTarget(replacement);
    setFile(null);
    setPreview(null);
    setSheetNames([]);
    setSheetMode("single");
    setSelectedSheet("");
    setSaved(null);
    setMapping([]);
    setMappingSaved(false);
    setQuantified([]);
    setQuantifiedSaved(false);
    setReviewSaved(false);
    setDetailsSaved(false);
    setPublished(false);
    setDealNumber("");
    setDealOwnerEmail(nextOwnerEmail);
    setDealPhotos([]);
    setShortDescription("");
    setProductCategory("");
    setAwardMode("");
    setManualHeaders([]);
    setManualRows([]);
    setCloseDate("");
    setCloseTime("13:00");
    setActiveStep(1);
  }
  async function openStepTwo() {
    if (!saved || !session) return;
    setError("");
    setActiveStep(2);
    if (mapping.length === 0) setMapping(choicesFor(saved.source_headers, saved.column_mapping?.sheets?.mode === "lots"));
    try {
      await loadSavedPreview();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The saved spreadsheet could not be reopened.",
      );
    }
  }
  function setRole(index: number, role: ColumnRole) {
    setMappingSaved(false);
    setQuantified([]);
    setQuantifiedSaved(false);
    setReviewSaved(false);
    setDetailsSaved(false);
    setPublished(false);
    setMapping((current) =>
      current.map((column) =>
        column.index === index
          ? { ...column, role }
          : role === "quantity" && column.role === "quantity"
            ? { ...column, role: "group" }
            : column,
      ),
    );
  }
  async function confirmMapping() {
    if (!saved || !session) return;
    setError("");
    const resolvedAwardMode =
      saved.column_mapping?.awardMode || awardMode || "single";
    if (
      resolvedAwardMode === "multiple" &&
      !mapping.some(
        (column) => column.role === "group" && isBoxHeader(column.header),
      )
    ) {
      setError(
        "Multiple-award deals require the Box # or Lot # column to be included as a Match items field.",
      );
      return;
    }
    setSavingMapping(true);
    const headerRow = preview?.headerRow || saved.header_row || 1;
    try {
      const parsed = preview || (await loadSavedPreview());
      const automaticLines = quantifySpreadsheet(parsed, mapping, resolvedAwardMode);
      const mappingPassed = automaticMappingIsSafe(
        parsed,
        mapping,
        automaticLines,
        resolvedAwardMode,
      );
      const reviewedAt = mappingPassed ? new Date().toISOString() : null;
      const sheets = saved.column_mapping?.sheets;
      const nextColumnMapping: ColumnMapping = {
        ...(saved.column_mapping || { version: 1, columns: [] }),
        version: 1,
        columns: mapping,
        sheets,
        dealDirection:
          dealDirection || saved.column_mapping?.dealDirection || undefined,
        awardMode: resolvedAwardMode,
      };
      const response = await pddAuthFetch(
        `/rest/v1/pdd_deal_uploads?id=eq.${saved.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            header_row: headerRow,
            column_mapping: nextColumnMapping,
            quantified_lines: automaticLines,
            quantified_line_count: automaticLines.length,
            mapping_reviewed_at: reviewedAt,
            mapping_reviewed_by: reviewedAt ? user?.id || null : null,
            details_completed_at: null,
            published_at: null,
            status: "quantified",
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (!response.ok)
        throw new Error("The column mapping could not be saved.");
      const records = (await response.json()) as SavedUpload[];
      setSaved(
        records[0] || {
          ...saved,
          header_row: headerRow,
          column_mapping: nextColumnMapping,
          quantified_lines: automaticLines,
          quantified_line_count: automaticLines.length,
          mapping_reviewed_at: reviewedAt,
          mapping_reviewed_by: reviewedAt ? user?.id || null : null,
          details_completed_at: null,
          published_at: null,
          status: "quantified",
        },
      );
      setQuantified(automaticLines);
      setQuantifiedSaved(true);
      setReviewSaved(mappingPassed);
      setMappingSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The column mapping could not be saved.",
      );
    } finally {
      setSavingMapping(false);
    }
  }
  async function openStepThree() {
    setError("");
    try {
      const parsed = await loadSavedPreview();
      const lines = saved?.quantified_lines?.length
        ? saved.quantified_lines
        : quantifySpreadsheet(
            parsed,
            mapping,
            saved?.column_mapping?.awardMode || awardMode || "single",
          );
      setQuantified(lines);
      setQuantifiedSaved(Boolean(saved?.quantified_lines?.length));
      setReviewSaved(Boolean(saved?.mapping_reviewed_at));
      setActiveStep(3);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The spreadsheet could not be quantified.",
      );
    }
  }
  function returnToFieldSelection() {
    setActiveStep(2);
  }
  async function saveQuantified() {
    if (!saved || !session || !quantified.length) return;
    setError("");
    setSavingQuantified(true);
    try {
      const response = await pddAuthFetch(
        `/rest/v1/pdd_deal_uploads?id=eq.${saved.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            quantified_lines: quantified,
            quantified_line_count: quantified.length,
            mapping_reviewed_at: null,
            mapping_reviewed_by: null,
            details_completed_at: null,
            published_at: null,
            status: "quantified",
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (!response.ok)
        throw new Error("The quantified deal could not be saved.");
      const records = (await response.json()) as SavedUpload[];
      setSaved(
        records[0] || {
          ...saved,
          quantified_lines: quantified,
          quantified_line_count: quantified.length,
          mapping_reviewed_at: null,
          mapping_reviewed_by: null,
          details_completed_at: null,
          published_at: null,
          status: "quantified",
        },
      );
      setReviewSaved(false);
      setDetailsSaved(false);
      setPublished(false);
      setQuantifiedSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The quantified deal could not be saved.",
      );
    } finally {
      setSavingQuantified(false);
    }
  }
  async function openStepFour() {
    setError("");
    try {
      await loadSavedPreview();
      setActiveStep(4);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The original rows could not be opened for review.",
      );
    }
  }
  async function confirmReview() {
    if (!saved || !session || !user || !mappingAuditValid) return;
    setError("");
    setSavingReview(true);
    const reviewedAt = new Date().toISOString();
    try {
      const response = await pddAuthFetch(
        `/rest/v1/pdd_deal_uploads?id=eq.${saved.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            mapping_reviewed_at: reviewedAt,
            mapping_reviewed_by: user.id,
            updated_at: reviewedAt,
          }),
        },
      );
      if (!response.ok)
        throw new Error("The mapping review could not be saved.");
      const records = (await response.json()) as SavedUpload[];
      setSaved(
        records[0] || {
          ...saved,
          mapping_reviewed_at: reviewedAt,
          mapping_reviewed_by: user.id,
        },
      );
      setReviewSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The mapping review could not be saved.",
      );
    } finally {
      setSavingReview(false);
    }
  }
  async function openStepFive() {
    if (!saved || !session) return;
    setError("");
    try {
      let nextNumber = saved.deal_number || dealNumber;
      if (!nextNumber) {
        const parts = pacificDateParts(new Date(saved.created_at));
        const prefix = `${dealDirection === "buying" ? "WTB" : "B"}${parts.month}${parts.day}${parts.year.slice(-2)}-`;
        const response = await pddAuthFetch(
          `/rest/v1/pdd_deal_uploads?select=deal_number&deal_number=like.${encodeURIComponent(prefix + "*")}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!response.ok)
          throw new Error("The next deal number could not be assigned.");
        const records = (await response.json()) as {
          deal_number: string | null;
        }[];
        const sequence =
          Math.max(
            0,
            ...records.map(
              (record) => Number(record.deal_number?.slice(-2)) || 0,
            ),
          ) + 1;
        nextNumber = `${prefix}${String(sequence).padStart(2, "0")}`;
        setDealNumber(nextNumber);
      }
      if (!shortDescription)
        setShortDescription(
          saved.short_description ||
            suggestedDescription(saved.original_name, quantified),
        );
      if (!productCategory)
        setProductCategory(
          saved.column_mapping?.productCategory ||
            suggestedCategory(saved.original_name, quantified),
        );
      if (!closeDate) {
        const suggested = new Date();
        suggested.setDate(suggested.getDate() + 3);
        const parts = pacificDateParts(suggested);
        setCloseDate(nextBusinessDate(`${parts.year}-${parts.month}-${parts.day}`));
      }
      setActiveStep(5);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Step 5 could not be opened.",
      );
    }
  }
  async function saveDetails() {
    if (
      !saved ||
      !session ||
      !dealNumber ||
      !shortDescription.trim() ||
      !productCategory ||
      !closeDate ||
      !closeTime
    )
      return;
    setError("");
    setSavingDetails(true);
    const businessCloseDate=nextBusinessDate(closeDate);
    if(businessCloseDate!==closeDate)setCloseDate(businessCloseDate);
    const completedAt = new Date().toISOString();
    const typedSource = saved.column_mapping?.sourceMode === "typed";
    const detectedCategory = suggestedCategory(shortDescription, quantified);
    // A reviewed category is authoritative; automatic analysis only fills an empty field.
    const resolvedCategory = productCategory.trim() || detectedCategory;
    const resolvedDescription = typedSource
      ? generalizedWtbDescription(resolvedCategory, shortDescription.trim())
      : shortDescription.trim();
    const filename = typedSource
      ? `${dealNumber}-${slugDescription(resolvedCategory)}-${slugDescription(resolvedDescription)}`
      : `${dealNumber}-Closes-${dateCode(businessCloseDate)}-${formatCloseTime(closeTime)}-${totalUnits}PCS-${slugDescription(shortDescription)}.xlsx`;
    const displayDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${businessCloseDate}T12:00:00`));
    const displayName = `${dealNumber} — ${totalUnits.toLocaleString()} pcs ${resolvedDescription} — Closes ${displayDate} at ${readableCloseTime(closeTime)} PT`;
    try {
      const response = await pddAuthFetch(
        `/rest/v1/pdd_deal_uploads?id=eq.${saved.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            deal_number: dealNumber,
            short_description: resolvedDescription,
            column_mapping: {
              ...(saved.column_mapping || { version: 1, columns: [] }),
              productCategory: resolvedCategory,
              dealDirection,
              awardMode:
                saved.column_mapping?.awardMode || awardMode || "single",
            },
            bid_close_date: businessCloseDate,
            bid_close_time: closeTime,
            bid_timezone: "America/Los_Angeles",
            display_name: displayName,
            display_filename: filename,
            details_completed_at: completedAt,
            published_at: null,
            status: "draft",
            updated_at: completedAt,
          }),
        },
      );
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          detail?.message?.includes("duplicate")
            ? "That deal number was just assigned to another deal. Reopen Step 5 to receive the next number."
            : "The deal details could not be saved.",
        );
      }
      const records = (await response.json()) as SavedUpload[];
      setProductCategory(resolvedCategory);
      setShortDescription(resolvedDescription);
      setSaved(
        records[0] || {
          ...saved,
          deal_number: dealNumber,
          short_description: resolvedDescription,
          bid_close_date: businessCloseDate,
          bid_close_time: closeTime,
          bid_timezone: "America/Los_Angeles",
          display_name: displayName,
          display_filename: filename,
          details_completed_at: completedAt,
          published_at: null,
          status: "draft",
        },
      );
      setPublished(false);
      setDetailsSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The deal details could not be saved.",
      );
    } finally {
      setSavingDetails(false);
    }
  }
  function openStepSix() {
    if (detailsSaved) setActiveStep(6);
  }
  async function publishDeal() {
    if (
      !saved ||
      !session ||
      !user ||
      !detailsSaved ||
      !dealNumber ||
      !closeDate ||
      !closeTime
    )
      return;
    setError("");
    setPublishing(true);
    const publishedAt = new Date().toISOString();
    const manufacturers = [
      ...new Set(
        quantified
          .map((line) => {
            const entry = Object.entries(line.values).find(([key]) =>
              /^(mfg|manufacturer|brand)$/i.test(key.trim()),
            );
            return entry?.[1] || "";
          })
          .filter(Boolean),
      ),
    ];
    const resolvedCategory = productCategory.trim() || suggestedCategory(shortDescription, quantified);
    const normalizedDescription = saved.column_mapping?.sourceMode === "typed"
      ? generalizedWtbDescription(resolvedCategory, shortDescription.trim())
      : /mixed it equipment/i.test(shortDescription)
        ? resolvedCategory
        : shortDescription.trim();
    const title = dealDirection === "buying"
      ? normalizedDescription
      : `${totalUnits.toLocaleString()}-Piece ${normalizedDescription}`;
    const lotNotes = buildLotNotes(quantified.length, [
      ...displayColumns.map((column) => ({
        header: column.header,
        value: (index: number) => quantified[index]?.values[column.header] || "",
      })),
      { header: "Qty", value: (index: number) => quantified[index]?.quantity || 0 },
    ]);
    const resolvedAwardMode =
      saved.column_mapping?.awardMode || awardMode || "single";
    const publicLines = quantified.map((line) => ({
      line: line.line,
      quantity: line.quantity,
      values: line.values,
      award_mode: resolvedAwardMode,
    }));
    const publicDeal = {
      source_upload_id: saved.id,
      deal_number: dealNumber,
      direction: dealDirection,
      category: resolvedCategory,
      title,
      description: inventoryDescription(quantified, resolvedCategory) || lotNotes,
      quantity: totalUnits,
      manufacturer: manufacturers.slice(0, 8).join(" / ") || "Mixed",
      part_number: `${quantified.length.toLocaleString()} quantified line items`,
      closes_at: new Date(`${closeDate}T${closeTime}:00`).toISOString(),
      location: "California, USA",
      public_lines: publicLines,
      spreadsheet_filename:
        saved.column_mapping?.sourceMode === "typed"
          ? ""
          : saved.display_filename || filenamePreview,
      status: "open",
      published: true,
      created_by: user.id,
      updated_at: publishedAt,
    };
    try {
      const existingResponse = await pddAuthFetch(
        `/rest/v1/pdd_public_deals?select=id&source_upload_id=eq.${saved.id}&limit=1`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const existing = existingResponse.ok
        ? ((await existingResponse.json()) as { id: string }[])
        : [];
      const publicResponse = await pddAuthFetch(
        existing[0]
          ? `/rest/v1/pdd_public_deals?id=eq.${existing[0].id}`
          : "/rest/v1/pdd_public_deals",
        {
          method: existing[0] ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify(publicDeal),
        },
      );
      if (!publicResponse.ok)
        throw new Error("The customer deal could not be published.");
      const notificationOwnerResponse = await fetch("/api/deal-notification-owner", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dealNumber,
          employeeEmail: saved.employee_email,
        }),
      });
      if (!notificationOwnerResponse.ok)
        throw new Error("The deal was published, but its employee notification could not be assigned.");
      const sourceResponse = await pddAuthFetch(
        `/rest/v1/pdd_deal_uploads?id=eq.${saved.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            status: "published",
            published_at: publishedAt,
            updated_at: publishedAt,
          }),
        },
      );
      if (!sourceResponse.ok)
        throw new Error(
          "The deal was published, but its employee status could not be updated.",
        );
      const records = (await sourceResponse.json()) as SavedUpload[];
      setSaved(
        records[0] || {
          ...saved,
          status: "published",
          published_at: publishedAt,
        },
      );
      setPublished(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The deal could not be published.",
      );
    } finally {
      setPublishing(false);
    }
  }
  function signOut() {
    clearPddSession();
    window.location.assign("/employee-login");
  }
  const grouped = mapping.filter((column) => column.role === "group").length,
    ignored = mapping.filter((column) => column.role === "ignore").length,
    quantity = mapping.find((column) => column.role === "quantity");
  const totalUnits = quantified.reduce((sum, line) => sum + line.quantity, 0);
  const combinedRows = Math.max(0, totalUnits - quantified.length);
  const displayColumns = mapping.filter((column) => column.role === "group");
  const ignoredColumns = mapping.filter((column) => column.role === "ignore");
  const mappedRows = quantified.flatMap((line) =>
    line.sources.map((source) => source.row),
  );
  const duplicateRows = [
    ...new Set(
      mappedRows.filter((row, index) => mappedRows.indexOf(row) !== index),
    ),
  ];
  const expectedRows = preview
    ? preview.rows.flatMap((row, index) =>
        hasItemData(row, mapping)
          ? [preview.rowSources?.[index]?.row || preview.headerRow + 1 + index]
          : [],
      )
    : [];
  const ignoredEmptyRows = preview
    ? preview.rows.length - expectedRows.length
    : 0;
  const missingRows = expectedRows.filter((row) => !mappedRows.includes(row));
  const mappingAuditValid = Boolean(
    preview &&
    mappedRows.length === expectedRows.length &&
    !duplicateRows.length &&
    !missingRows.length,
  );
  const sourceValue = (rowNumber: number, columnIndex: number) =>
    preview?.rows[rowNumber - (preview.headerRow + 1)]?.[columnIndex] || "—";
  const previewCategory = productCategory.trim() || suggestedCategory(shortDescription, quantified);
  const filenamePreview =
    dealNumber && closeDate && closeTime
      ? saved?.column_mapping?.sourceMode === "typed"
        ? `${dealNumber}-${slugDescription(previewCategory)}-${slugDescription(shortDescription)}`
        : `${dealNumber}-Closes-${dateCode(closeDate)}-${formatCloseTime(closeTime)}-${totalUnits}PCS-${slugDescription(shortDescription)}.xlsx`
      : "Complete the closing date to preview the filename";
  const displayDatePreview = closeDate
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${closeDate}T12:00:00`))
    : "closing date";
  const displayNamePreview = `${dealNumber || (dealDirection === "buying" ? "WTBMMDDYY-##" : "BMMDDYY-##")} — ${totalUnits.toLocaleString()} pcs ${shortDescription || "Short Description"} — Closes ${displayDatePreview}${closeTime ? ` at ${readableCloseTime(closeTime)} PT` : ""}`;
  const canEdit = useMemo(
    () =>
      Boolean(
        saved &&
        user &&
        (saved.uploaded_by === user.id ||
          saved.employee_email.toLowerCase() === profile?.email.toLowerCase() ||
          profile?.role === "administrator"),
      ),
    [saved, user, profile],
  );
  const uploadCounts = useMemo(() => {
    if (!preview) return null;
    const lines = quantifySpreadsheet(
      preview,
      choicesFor(preview.headers),
      awardMode || "single",
    );
    return {
      lineCount: lines.reduce((sum, line) => sum + line.sources.length, 0),
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }, [preview, awardMode]);

  if (loading)
    return (
      <main className="builderLoading">Opening the employee Deal Builder…</main>
    );
  return (
    <Shell>
      <main className="builderConsole">
        <header className="consoleHeader">
          <div>
            <a href="/employee">← Employee Deal Desk</a>
            <span className="builderKicker">EMPLOYEE CONSOLE</span>
            <h1>Deal Builder</h1>
            <p>
              Create a customer-ready LBB deal from a spreadsheet or manual entry.
            </p>
          </div>
          <aside>
            <strong>{profile?.display_name}</strong>
            <span>
              {profile?.role === "administrator" ? "Administrator" : "Employee"}
            </span>
            <button className="newDealButton" onClick={startNewDeal}>
              Reset / Start New Deal
            </button>
            <button onClick={signOut}>Sign out</button>
          </aside>
        </header>
        <section className="consoleLayout">
          <nav className="builderSteps" aria-label="Deal Builder steps">
            {steps.map(([number, title, description]) => {
              const step = (number === "04" ? 5 : number === "05" ? 6 : Number(number)) as 1 | 2 | 3 | 4 | 5 | 6;
              const complete =
                (step === 1 && Boolean(saved)) ||
                (step === 2 && mappingSaved) ||
                (step === 3 && quantifiedSaved) ||
                (step === 4 && reviewSaved) ||
                (step === 5 && detailsSaved) ||
                (step === 6 && published);
              const active = step === activeStep;
              const available =
                step === 1 ||
                (step === 2 && Boolean(saved)) ||
                (step === 3 && mappingSaved) ||
                (step === 4 && quantifiedSaved) ||
                (step === 5 && reviewSaved) ||
                (step === 6 && detailsSaved);
              return (
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => void goToStep(step)}
                  className={`${active ? "active" : ""} ${complete ? "complete" : ""}`}
                  key={number}
                >
                  <b>{complete ? "✓" : number}</b>
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                    {available && !active && <em>Open step</em>}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="builderWorkspace">
            {activeStep === 1 ? (
              <>
                <div className="workspaceHeading">
                  <div>
                    <span className="builderKicker">STEP 1 OF 5</span>
                    <h2>Add the deal inventory</h2>
                    <p>
                      Upload the original inventory file or define headers and
                      type the item data directly.
                    </p>
                  </div>
                  <div className="securityBadge">🔒 Employee-only upload</div>
                </div>
                {!saved ? (
                  <>
                    <section className="awardModeChooser">
                      <header>
                        <div>
                          <span>CHOOSE DEAL WORKFLOW</span>
                          <h3>How will this deal be awarded?</h3>
                          <p>
                            This choice controls the customer bid spreadsheet
                            and the award workflow after bids are received.
                          </p>
                        </div>
                        <b>
                          {awardMode
                            ? "✓ Workflow selected"
                            : "Selection required"}
                        </b>
                      </header>
                      <div className="awardModeChoices">
                        <button
                          type="button"
                          aria-pressed={awardMode === "single"}
                          className={awardMode === "single" ? "selected" : ""}
                          onClick={() => {
                            setAwardMode("single");
                            if (!manualHeaders.length && productCategory) setManualHeaderDraft(manualHeadersFor(productCategory, "single").join(", "));
                          }}
                        >
                          <strong>Create New Deal</strong>
                          <span>
                            Use the standard customer bid spreadsheet and award
                            the deal through the normal workflow.
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={awardMode === "multiple"}
                          className={awardMode === "multiple" ? "selected" : ""}
                          onClick={() => {
                            setAwardMode("multiple");
                            if (!manualHeaders.length && productCategory) setManualHeaderDraft(manualHeadersFor(productCategory, "multiple").join(", "));
                          }}
                        >
                          <strong>Multi-Tab/Lot Deal</strong>
                          <span>
                            Use Box # or Lot # groups and add a subtotal row after
                            each group so different boxes/lots can be awarded separately.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => window.location.assign("/employee/r2-processing?new=1")}
                        >
                          <strong>R2 In-Process Deal</strong>
                          <span>
                            Track inbound or in-house equipment by serial number
                            through testing, BitRaser data wipe and grading.
                            Quantifying is skipped until processing is complete.
                          </span>
                        </button>
                      </div>
                      <p className="awardModeRule">
                        <strong>Spreadsheet rule:</strong> Multi-tab/lot mode
                        only adds the subtotal rows. Every other source cell is
                        left unchanged.
                      </p>
                    </section>
                    <section className="vendorGate">
                      <header>
                        <div>
                          <span>REQUIRED CATEGORY</span>
                          <h3>What type of equipment is in this deal?</h3>
                          <p>Your selection controls the category and guides the description created from the spreadsheet details.</p>
                        </div>
                        <b>{productCategory ? `✓ ${productCategory} selected` : "Category required"}</b>
                      </header>
                      <label className="assignedEmployeeField">
                        <span>Product category</span>
                        <select required value={productCategory} onChange={(event)=>{
                          const category=event.target.value;
                          setProductCategory(category);
                          if (!manualHeaders.length && category) setManualHeaderDraft(manualHeadersFor(category, awardMode).join(", "));
                        }}>
                          <option value="">Select category…</option>
                          {productCategories.map((category)=><option key={category} value={category}>{category.toUpperCase()}</option>)}
                        </select>
                        <small>You can review or change this selection again before publishing.</small>
                      </label>
                    </section>
                    <section className="vendorGate">
                      <header>
                        <div>
                          <span>REQUIRED DEAL TYPE</span>
                          <h3>Is this a WTB or WTS deal?</h3>
                          <p>
                            Choose the deal type before adding the vendor and
                            uploading the spreadsheet.
                          </p>
                        </div>
                        <b>
                          {dealDirection
                            ? `✓ ${dealDirection === "buying" ? "WTB" : "WTS"} selected`
                            : "Deal type required"}
                        </b>
                      </header>
                      <label className="assignedEmployeeField">
                        <span>Deal type</span>
                        <select
                          required
                          value={dealDirection}
                          onChange={(event) =>
                            setDealDirection(
                              event.target.value as "" | "buying" | "selling",
                            )
                          }
                        >
                          <option value="">Select WTB or WTS…</option>
                          <option value="buying">WTB — Want to Buy</option>
                          <option value="selling">WTS — Want to Sell</option>
                        </select>
                        <small>
                          WTB means we want to buy the listed equipment. WTS
                          means we are offering the listed equipment for sale.
                        </small>
                      </label>
                    </section>
                    <section className="vendorGate">
                      <header>
                        <div>
                          <span>REQUIRED BEFORE UPLOAD</span>
                          <h3>Who is the vendor for this deal?</h3>
                          <p>
                            Select a saved vendor or add the company and
                            purchasing contact. This vendor will stay attached
                            to the deal for the purchase order.
                          </p>
                        </div>
                        <b>
                          {vendorId ? "✓ Vendor selected" : "Vendor required"}
                        </b>
                      </header>
                      <label className="assignedEmployeeField">
                        <span>Assigned employee</span>
                        <select
                          required
                          value={dealOwnerEmail}
                          onChange={(event) => setDealOwnerEmail(event.target.value)}
                        >
                          <option value="">Select the deal owner…</option>
                          {employees.map((employee) => (
                            <option key={employee.email} value={employee.email}>
                              {employee.display_name} · {employee.email}
                            </option>
                          ))}
                        </select>
                        <small>
                          Defaults to the employee currently logged in. Change it
                          when uploading a deal for another employee.
                        </small>
                      </label>
                      {vendors.length > 0 && !addingVendor && (
                        <div className="vendorPicker">
                          <label>
                            <span>Saved vendor</span>
                            <select
                              value={vendorId}
                              onChange={(event) =>
                                setVendorId(event.target.value)
                              }
                            >
                              <option value="">Select a vendor…</option>
                              {vendors.map((vendor) => (
                                <option key={vendor.id} value={vendor.id}>
                                  {vendor.company_name} · {vendor.contact_name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setVendorFeedback(null);
                              setAddingVendor(true);
                            }}
                          >
                            + Add new vendor
                          </button>
                        </div>
                      )}
                      {vendorFeedback && (
                        <p
                          className={`vendorFeedback ${vendorFeedback.tone}`}
                          role={vendorFeedback.tone === "error" ? "alert" : "status"}
                          aria-live="polite"
                        >
                          {vendorFeedback.message}
                        </p>
                      )}
                      {(addingVendor || vendors.length === 0) && (
                        <div className="vendorForm">
                          <label className="requiredVendorField">
                            <span>Company name <b aria-hidden="true">*</b></span>
                            <input
                              required
                              value={vendorDraft.company_name}
                              onChange={(event) =>
                                setVendorDraft((current) => ({
                                  ...current,
                                  company_name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="requiredVendorField">
                            <span>Contact name <b aria-hidden="true">*</b></span>
                            <input
                              required
                              value={vendorDraft.contact_name}
                              onChange={(event) =>
                                setVendorDraft((current) => ({
                                  ...current,
                                  contact_name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="requiredVendorField">
                            <span>Email address <b aria-hidden="true">*</b></span>
                            <input
                              required
                              type="text"
                              inputMode="email"
                              placeholder="name@company.com, second@company.com"
                              value={vendorDraft.email}
                              onChange={(event) =>
                                setVendorDraft((current) => ({
                                  ...current,
                                  email: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="wide">
                            <span>Street address</span>
                            <input
                              value={vendorDraft.address1}
                              onChange={(event) =>
                                setVendorDraft((current) => ({
                                  ...current,
                                  address1: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="wide">
                            <span>Address line 2</span>
                            <input
                              value={vendorDraft.address2}
                              onChange={(event) =>
                                setVendorDraft((current) => ({
                                  ...current,
                                  address2: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <ContactTemplateFields
                            phone={vendorDraft.phone}
                            city={vendorDraft.city}
                            region={vendorDraft.region}
                            country={vendorDraft.country}
                            onChange={(field, value) =>
                              setVendorDraft((current) => ({
                                ...current,
                                [field]: value,
                              }))
                            }
                          />
                          <label>
                            <span>Postal code</span>
                            <input
                              value={vendorDraft.postal_code}
                              onChange={(event) =>
                                setVendorDraft((current) => ({
                                  ...current,
                                  postal_code: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <div className="vendorActions">
                            <button
                              type="button"
                              onClick={saveVendor}
                              disabled={savingVendor}
                            >
                              {savingVendor ? "Saving vendor…" : "Save vendor"}
                            </button>
                            {vendors.length > 0 && (
                              <button
                                type="button"
                                className="cancel"
                                onClick={() => {
                                  setAddingVendor(false);
                                  setVendorDraft(emptyVendor);
                                  setVendorFeedback(null);
                                }}
                              >
                                Cancel
                              </button>
                            )}
                            <small>
                              Vendor will be tagged as entered by{" "}
                              {profile?.display_name}.
                            </small>
                          </div>
                        </div>
                      )}
                      {vendorId &&
                        (() => {
                          const vendor = vendors.find(
                            (item) => item.id === vendorId,
                          );
                          return vendor ? (
                            <div className="selectedVendor">
                              <strong>{vendor.company_name}</strong>
                              <span>
                                {vendor.contact_name} ·{" "}
                                {[vendor.city, vendor.region]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                              <small>Entered by {vendor.created_by_name}</small>
                            </div>
                          ) : null;
                        })()}
                    </section>
                    {awardMode === "single" &&
                      dealDirection === "buying" &&
                      vendorId && productCategory && (
                      <section className="typedWtbPanel">
                        <header>
                          <div>
                            <span>WTB QUICK ENTRY</span>
                            <h3>Type the products we want to buy</h3>
                            <p>
                              Use one line per product. A typed request skips
                              spreadsheet upload, column mapping and quantifying.
                            </p>
                          </div>
                          <b>Spreadsheet optional</b>
                        </header>
                        <label>
                          <span>Product | Part number | Quantity | Specifications / condition</span>
                          <textarea
                            rows={6}
                            value={manualWantedItems}
                            onChange={(event) =>
                              setManualWantedItems(event.target.value)
                            }
                            placeholder={"Samsung DDR4 32GB RDIMM | M393A4K40DB3-CWE | 500 | Tested pulls, Grade A/B\nNVIDIA RTX 6000 Ada | 900-5G133-2250-000 | 20 | New or used"}
                          />
                        </label>
                        <div>
                          <button type="button" onClick={() => void useTypedWantedItems()}>
                            Continue directly to WTB details
                          </button>
                          <small>Or use the spreadsheet upload below.</small>
                        </div>
                      </section>
                    )}
                    {awardMode && dealDirection && vendorId && productCategory && (
                      <section className="manualDealPanel">
                        <header><div><span>MANUAL DEAL ENTRY</span><h3>Type a deal instead of uploading a spreadsheet</h3><p>Define the column headers first, then enter the item data in the grid.</p></div><b>{manualHeaders.length ? "Step 2 · Enter data" : "Step 1 · Enter headers"}</b></header>
                        {!manualHeaders.length ? <div className="manualHeaderEntry"><label><span>Column headers</span><textarea rows={3} value={manualHeaderDraft} onChange={event=>setManualHeaderDraft(event.target.value)} placeholder="Mfg, Model, Part Number, Description, Size, Rank, Speed, Comments, Grade, Qty"/><small>Separate each header with a comma. Quantity or Qty is required.{awardMode==="multiple"?" Box # or Lot # is also required for this workflow.":""}</small></label><div className="manualHeaderActions"><button type="button" className="secondary" onClick={addManualHeader}>+ Add header</button><button type="button" onClick={confirmManualHeaders}>Create entry grid</button></div></div> : <><div className="manualDealTable"><table><thead><tr><th>Row</th>{manualHeaders.map(header=><th key={header}>{header}</th>)}<th></th></tr></thead><tbody>{manualRows.map((row,rowIndex)=><tr key={rowIndex}><td>{rowIndex+1}</td>{manualHeaders.map((header,columnIndex)=><td key={header}><input type={quantityHeader.test(header)?"number":"text"} min={quantityHeader.test(header)?"1":undefined} step={quantityHeader.test(header)?"1":undefined} value={row[columnIndex]||""} onChange={event=>updateManualCell(rowIndex,columnIndex,event.target.value)} aria-label={`${header}, row ${rowIndex+1}`}/></td>)}<td><button type="button" aria-label={`Remove row ${rowIndex+1}`} onClick={()=>setManualRows(current=>current.filter((_,index)=>index!==rowIndex))}>×</button></td></tr>)}</tbody></table></div><div className="manualDealActions"><button type="button" className="secondary" onClick={()=>{setManualHeaders([]);setManualRows([])}}>Change headers</button><button type="button" className="secondary" onClick={addManualHeader}>+ Add header</button><button type="button" className="secondary" onClick={()=>setManualRows(current=>[...current,manualHeaders.map(()=>"")])}>+ Add row</button><button type="button" onClick={()=>void useManualDeal()} disabled={uploading}>{uploading?"Saving typed deal…":"Continue with typed deal"}</button></div></>}
                      </section>
                    )}
                    <div
                      className={`uploadDropzone ${dragging ? "dragging" : ""} ${file ? "hasFile" : ""} ${!awardMode || !vendorId || !dealDirection || !productCategory ? "locked" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (awardMode && vendorId && dealDirection && productCategory)
                          setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(event) => {
                        if (awardMode && vendorId && dealDirection && productCategory)
                          onDrop(event);
                        else {
                          event.preventDefault();
                          setError(
                            "Choose the deal workflow, WTB or WTS, product category, and vendor before choosing the spreadsheet.",
                          );
                        }
                      }}
                    >
                      <input
                        ref={inputRef}
                        type="file"
                        disabled={!awardMode || !vendorId || !dealDirection || !productCategory}
                        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                        onChange={(event) => {
                          const next = event.target.files?.[0];
                          if (next) void chooseFile(next);
                          event.currentTarget.value = "";
                        }}
                      />
                      <div className="uploadIcon">↑</div>
                      <h3>
                        {file
                          ? file.name
                          : awardMode && vendorId && dealDirection && productCategory
                            ? "Drop the spreadsheet here"
                            : "Choose the workflow, deal type, category and vendor to unlock upload"}
                      </h3>
                      <p>
                        {file
                          ? `${(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB · Ready for review`
                          : awardMode && vendorId && dealDirection && productCategory
                            ? "or choose an .xlsx or .csv file from your computer"
                            : "Workflow, WTB/WTS, category and vendor information are required first"}
                      </p>
                      <button
                        type="button"
                        disabled={!awardMode || !vendorId || !dealDirection || !productCategory}
                        onClick={() => inputRef.current?.click()}
                      >
                        {file
                          ? "Choose a different file"
                          : "Choose spreadsheet"}
                      </button>
                      <small>Maximum file size: 10 MB</small>
                    </div>
                    {file && sheetNames.length > 1 && !preview && (
                      <section className="sheetChooser">
                        <header>
                          <div>
                            <span>MULTIPLE TABS DETECTED</span>
                            <h3>Which tabs should this deal use?</h3>
                          </div>
                          <strong>{sheetNames.length} tabs</strong>
                        </header>
                        <label className="sheetChoice">
                          <input
                            type="radio"
                            name="sheet-mode"
                            checked={sheetMode === "single"}
                            onChange={() => setSheetMode("single")}
                          />
                          <span>
                            <b>Choose one tab</b>
                            <small>
                              Only rows from the selected tab will be added.
                            </small>
                          </span>
                        </label>
                        {sheetMode === "single" && (
                          <select
                            value={selectedSheet}
                            onChange={(event) =>
                              setSelectedSheet(event.target.value)
                            }
                          >
                            {sheetNames.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        )}
                        <label className="sheetChoice">
                          <input
                            type="radio"
                            name="sheet-mode"
                            checked={sheetMode === "all"}
                            onChange={() => setSheetMode("all")}
                          />
                          <span>
                            <b>Include all tabs in one deal</b>
                            <small>
                              Rows are combined into one customer bidding table.
                            </small>
                          </span>
                        </label>
                        <label className="sheetChoice">
                          <input
                            type="radio"
                            name="sheet-mode"
                            checked={sheetMode === "lots"}
                            onChange={() => setSheetMode("lots")}
                          />
                          <span>
                            <b>Create separate lots from selected tabs</b>
                            <small>
                              Each selected tab remains a named customer-bidable
                              lot inside this deal.
                            </small>
                          </span>
                        </label>
                        {sheetMode === "lots" && (
                          <div className="lotTabPicker">
                            <div>
                              <button
                                type="button"
                                onClick={() => setSelectedSheets(sheetNames)}
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedSheets([])}
                              >
                                Clear
                              </button>
                            </div>
                            {sheetNames.map((name) => (
                              <label key={name}>
                                <input
                                  type="checkbox"
                                  checked={selectedSheets.includes(name)}
                                  onChange={(event) =>
                                    setSelectedSheets((current) =>
                                      event.target.checked
                                        ? [...current, name]
                                        : current.filter(
                                            (value) => value !== name,
                                          ),
                                    )
                                  }
                                />
                                <span>{name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        <button type="button" onClick={confirmSheetSelection}>
                          Continue with{" "}
                          {sheetMode === "all"
                            ? `all ${sheetNames.length} tabs`
                            : sheetMode === "lots"
                              ? `${selectedSheets.length} separate lots`
                              : selectedSheet}
                        </button>
                      </section>
                    )}
                    {preview && (
                      <section className="uploadPreview">
                        <header>
                          <div>
                            <span>FILE CHECK COMPLETE</span>
                            <h3>Spreadsheet totals</h3>
                          </div>
                          <strong>{preview.headers.length} columns</strong>
                        </header>
                        {sheetNames.length > 1 && (
                          <p className="sheetSelectionSummary">
                            Using{" "}
                            {sheetMode === "all"
                              ? `all ${sheetNames.length} tabs`
                              : selectedSheet}
                            .{" "}
                            <button
                              type="button"
                              onClick={() => setPreview(null)}
                            >
                              Change tab selection
                            </button>
                          </p>
                        )}
                        <div className="uploadCountSummary">
                          <div>
                            <strong>
                              {uploadCounts?.lineCount.toLocaleString() || "0"}
                            </strong>
                            <span>Lines</span>
                          </div>
                          <div>
                            <strong>
                              {uploadCounts?.itemCount.toLocaleString() || "0"}
                            </strong>
                            <span>Items</span>
                          </div>
                        </div>
                        {Boolean(preview.skippedRows?.length) && (
                          <details className="skippedRowNotice">
                            <summary>
                              {preview.skippedRows!.length.toLocaleString()} non-inventory {preview.skippedRows!.length === 1 ? "row was" : "rows were"} skipped automatically — review details
                            </summary>
                            <p>
                              You can continue this deal without editing or re-uploading the spreadsheet.
                            </p>
                            <ul>
                              {preview.skippedRows!.map((item) => (
                                <li key={`${item.sheet}-${item.row}`}>
                                  <b>{item.sheet}, row {item.row}:</b> {item.reason}{" "}
                                  <span>{item.preview}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        <div className="headerChips">
                          {preview.headers.map((header, index) => (
                            <span key={`${header}-${index}`}>
                              {header || `Column ${index + 1}`}
                            </span>
                          ))}
                        </div>
                        <div className="previewTable">
                          <table>
                            <thead>
                              <tr>
                                {preview.headers
                                  .slice(0, 8)
                                  .map((header, index) => (
                                    <th key={index}>
                                      {header || `Column ${index + 1}`}
                                    </th>
                                  ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.rows.slice(0, 3).map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                  {preview.headers
                                    .slice(0, 8)
                                    .map((_, index) => (
                                      <td key={index}>{row[index] || "—"}</td>
                                    ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button
                          className="startDealButton"
                          onClick={upload}
                          disabled={uploading || !vendorId || !dealOwnerEmail}
                        >
                          {uploading
                            ? "Uploading securely…"
                            : "Upload and start this deal"}
                        </button>
                      </section>
                    )}
                  </>
                ) : (
                  <section className="uploadSuccess">
                    <div className="successMark">✓</div>
                    <span>RAW SPREADSHEET SAVED</span>
                    <h2>{saved.original_name}</h2>
                    <p>
                      {saved.source_row_count.toLocaleString()} source rows are
                      stored and assigned to {employees.find((employee) => employee.email === saved.employee_email)?.display_name || saved.employee_email}. The original
                      file will remain unchanged for the reversible row mapping.
                    </p>
                    <dl>
                      <div>
                        <dt>Vendor</dt>
                        <dd>
                          {vendors.find(
                            (vendor) => vendor.id === saved.vendor_id,
                          )?.company_name || "Vendor record"}
                        </dd>
                      </div>
                      <div>
                        <dt>Award workflow</dt>
                        <dd>
                          {saved.column_mapping?.awardMode === "multiple"
                            ? "Multiple awards per line item"
                            : "Single deal"}
                        </dd>
                      </div>
                      <div>
                        <dt>Deal owner</dt>
                        <dd>{employees.find((employee) => employee.email === saved.employee_email)?.display_name || saved.employee_email}</dd>
                      </div>
                      <div>
                        <dt>Uploaded by</dt>
                        <dd>{profile?.display_name || profile?.email}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>
                          {quantifiedSaved
                            ? "Items quantified"
                            : mappingSaved
                              ? "Columns confirmed"
                              : "Ready for column confirmation"}
                        </dd>
                      </div>
                    </dl>
                    <button
                      onClick={
                        quantifiedSaved ? () => setActiveStep(3) : openStepTwo
                      }
                    >
                      {quantifiedSaved
                        ? "Open Step 3 results"
                        : "Continue to Step 2"}
                    </button>
                    <button
                      className="secondaryAction"
                      onClick={startAnotherUpload}
                    >
                      Upload a file again
                    </button>
                  </section>
                )}
              </>
            ) : activeStep === 2 ? (
              <>
                <div className="workspaceHeading">
                  <div>
                    <button
                      className="backStep"
                      onClick={() => setActiveStep(1)}
                    >
                      ← Step 1
                    </button>
                    <span className="builderKicker">STEP 2 OF 5</span>
                    <h2>Confirm the spreadsheet columns</h2>
                    <p>
                      Columns marked “Match items” must be identical before rows
                      are combined. Inventory IDs, serial numbers, locations, extended prices, totals, seller price and
                      other unit-specific data are preserved in the original
                      mapping but ignored when quantifying.
                    </p>
                  </div>
                  <div className="securityBadge">
                    Header row {preview?.headerRow || saved?.header_row || 1}
                  </div>
                </div>
                <section className="mappingSummary">
                  <div>
                    <strong>{saved?.source_row_count.toLocaleString()}</strong>
                    <span>Item rows</span>
                  </div>
                  <div>
                    <strong>{mapping.length}</strong>
                    <span>Total columns</span>
                  </div>
                  <div>
                    <strong>{grouped}</strong>
                    <span>Match items</span>
                  </div>
                  <div>
                    <strong>{ignored}</strong>
                    <span>Ignored for grouping</span>
                  </div>
                </section>
                <section className="mappingPanel">
                  <header>
                    <div>
                      <span>AUTOMATIC MAPPING</span>
                      <h3>{saved?.original_name}</h3>
                    </div>
                    <p>Review each selection, then confirm.</p>
                  </header>
                  <div className="mappingTable">
                    <table>
                      <thead>
                        <tr>
                          <th>Column</th>
                          <th>Use in deal builder</th>
                          <th>What this means</th>
                          <th>Sample value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapping.map((column) => (
                          <tr
                            key={column.index}
                            className={`role-${column.role}`}
                          >
                            <td>
                              <b>{column.header}</b>
                              <small>Column {column.index + 1}</small>
                            </td>
                            <td>
                              <select
                                value={column.role}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  setRole(
                                    column.index,
                                    event.target.value as ColumnRole,
                                  )
                                }
                                aria-label={`Use for ${column.header}`}
                              >
                                <option value="quantity">Existing quantity</option>
                                <option value="ignore">
                                  Ignore when quantifying
                                </option>
                                <option value="group">Match items</option>
                              </select>
                            </td>
                            <td>
                              {column.role === "group"
                                ? "Rows must match in this column."
                                : column.role === "ignore"
                                  ? "Kept for traceability; does not split quantities."
                                  : "Use this column's quantity instead of counting rows."}
                            </td>
                            <td>
                              {preview?.rows.find((row) => row[column.index])?.[
                                column.index
                              ] || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <div className="mappingFooter">
                  <div>
                    {quantity ? (
                      <>
                        <b>Quantity source:</b> {quantity.header}
                      </>
                    ) : (
                      <>
                        <b>Quantity method:</b> Count each original row as one
                        item
                      </>
                    )}
                  </div>
                  <button
                    onClick={confirmMapping}
                    disabled={!canEdit || savingMapping || grouped === 0}
                  >
                    {savingMapping
                      ? "Saving column mapping…"
                      : mappingSaved
                        ? "Column mapping confirmed ✓"
                        : "Confirm columns"}
                  </button>
                </div>
                {mappingSaved && (
                  <section className="nextStepNotice">
                    <strong>Step 2 is complete.</strong>
                    <span>
                      The file is ready for Step 3: quantify like items while
                      preserving the original row-by-row mapping.
                    </span>
                    <button onClick={openStepThree}>Continue to Step 3</button>
                  </section>
                )}
              </>
            ) : activeStep === 3 ? (
              <>
                <div className="workspaceHeading">
                  <div>
                    <button
                      className="backStep changeFieldsLink"
                      onClick={returnToFieldSelection}
                    >
                      ← Review mapping and fields
                    </button>
                    <span className="builderKicker">STEP 3 OF 5</span>
                    <h2>Quantify like items</h2>
                    <p>
                      Every quantified line below represents rows that match
                      exactly across the confirmed item fields. Ignored data
                      remains attached to its original spreadsheet row for later
                      bid-price restoration.
                    </p>
                  </div>
                  <div className="securityBadge">↔ Reversible row mapping</div>
                </div>
                <section className="quantifySummary">
                  <div>
                    <strong>{totalUnits.toLocaleString()}</strong>
                    <span>Total units</span>
                  </div>
                  <div>
                    <strong>{quantified.length.toLocaleString()}</strong>
                    <span>Quantified lines</span>
                  </div>
                  <div>
                    <strong>{combinedRows.toLocaleString()}</strong>
                    <span>Rows combined</span>
                  </div>
                  <div>
                    <strong>{ignored}</strong>
                    <span>Ignored fields</span>
                  </div>
                </section>
                <section className="quantifyPanel">
                  <header>
                    <div>
                      <span>QUANTIFIED PREVIEW</span>
                      <h3>{saved?.original_name}</h3>
                    </div>
                    <p>
                      Seller Price is ignored; your LBB pricing will be added
                      later.
                    </p>
                  </header>
                  <div className="quantifyTable">
                    <table>
                      <thead>
                        <tr>
                          <th>Line</th>
                          <th>Qty</th>
                          {displayColumns.map((column) => (
                            <th key={column.index}>{column.header}</th>
                          ))}
                          <th>Source rows</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quantified.map((line) => (
                          <tr key={line.line}>
                            <td>{line.line}</td>
                            <td>
                              <b>{line.quantity.toLocaleString()}</b>
                            </td>
                            {displayColumns.map((column) => (
                              <td key={column.index}>
                                {line.values[column.header] || "—"}
                              </td>
                            ))}
                            <td>
                              <span
                                className="sourceRows"
                                title={line.sources
                                  .map((source) => `Row ${source.row}`)
                                  .join(", ")}
                              >
                                {line.sources.length} original{" "}
                                {line.sources.length === 1 ? "row" : "rows"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <div className="quantifyActions">
                  <button
                    className="changeFieldsButton"
                    onClick={returnToFieldSelection}
                  >
                    Change fields and run again
                  </button>
                  <div className="quantifyFooter">
                    <div>
                      <b>{totalUnits.toLocaleString()} units</b> remain
                      traceable to {expectedRows.length.toLocaleString()}{" "}
                      original item rows.
                      {ignoredEmptyRows > 0
                        ? ` ${ignoredEmptyRows.toLocaleString()} empty ${ignoredEmptyRows === 1 ? "row was" : "rows were"} ignored.`
                        : ""}
                    </div>
                    <button
                      onClick={saveQuantified}
                      disabled={
                        !canEdit || savingQuantified || quantifiedSaved || !quantified.length
                      }
                    >
                      {savingQuantified
                        ? "Saving quantified deal…"
                        : quantifiedSaved
                          ? "Quantified deal saved ✓"
                          : "Save quantified deal"}
                    </button>
                  </div>
                </div>
                {quantifiedSaved && (
                  <section className="nextStepNotice">
                    <strong>{reviewSaved ? "Automatic mapping passed." : "Step 3 is complete."}</strong>
                    <span>
                      {reviewSaved
                        ? "Every original item row is accounted for. Continue to the deal details, or use Review Mapping if you want to inspect it."
                        : "The grouped lines and original source-row map are saved and ready for review."}
                    </span>
                    <button onClick={reviewSaved ? openStepFive : openStepFour}>
                      {reviewSaved ? "Continue to Deal Details" : "Review mapping exception"}
                    </button>
                  </section>
                )}
              </>
            ) : activeStep === 4 ? (
              <>
                <div className="workspaceHeading">
                  <div>
                    <button
                      className="backStep"
                      onClick={() => setActiveStep(3)}
                    >
                      ← Step 3
                    </button>
                    <span className="builderKicker">STEP 4 OF 6</span>
                    <h2>Review the original-row mapping</h2>
                    <p>
                      Expand any quantified line to inspect the exact original
                      rows behind its quantity. Empty rows are ignored. The
                      ignored fields remain untouched and will be used later to
                      return bid prices to their proper source lines.
                    </p>
                  </div>
                  <div
                    className={`auditBadge ${mappingAuditValid ? "valid" : "invalid"}`}
                  >
                    {mappingAuditValid
                      ? "✓ All rows accounted for"
                      : "! Mapping needs attention"}
                  </div>
                </div>
                <section className="auditSummary">
                  <div>
                    <strong>{quantified.length.toLocaleString()}</strong>
                    <span>Quantified lines</span>
                  </div>
                  <div>
                    <strong>{mappedRows.length.toLocaleString()}</strong>
                    <span>Source rows mapped</span>
                  </div>
                  <div>
                    <strong>{missingRows.length}</strong>
                    <span>Missing rows</span>
                  </div>
                  <div>
                    <strong>{duplicateRows.length}</strong>
                    <span>Duplicate rows</span>
                  </div>
                </section>
                <section className="auditPanel">
                  <header>
                    <div>
                      <span>REVERSIBLE MAPPING AUDIT</span>
                      <h3>{saved?.original_name}</h3>
                    </div>
                    <p>
                      Select a line to see serials, locations, seller prices and
                      other ignored values.
                    </p>
                  </header>
                  <div className="auditLines">
                    {quantified.map((line) => (
                      <details key={line.line}>
                        <summary>
                          <b>Line {line.line}</b>
                          <strong>Qty {line.quantity.toLocaleString()}</strong>
                          <span>
                            {[
                              line.values.MFG,
                              line.values.Model,
                              line.values["Grading Description"],
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Quantified item"}
                          </span>
                          <em>
                            {line.sources.length} source{" "}
                            {line.sources.length === 1 ? "row" : "rows"}
                          </em>
                        </summary>
                        <div className="auditRows">
                          <table>
                            <thead>
                              <tr>
                                <th>Original row</th>
                                <th>Row qty</th>
                                {ignoredColumns.map((column) => (
                                  <th key={column.index}>{column.header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {line.sources.map((source) => (
                                <tr key={source.row}>
                                  <td>
                                    <b>{source.row}</b>
                                  </td>
                                  <td>{source.quantity}</td>
                                  {ignoredColumns.map((column) => (
                                    <td key={column.index}>
                                      {sourceValue(source.row, column.index)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
                <div className="auditFooter">
                  <div>
                    <b>
                      {mappingAuditValid
                        ? "Audit passed."
                        : "Audit incomplete."}
                    </b>{" "}
                    {mappingAuditValid
                      ? `All ${mappedRows.length.toLocaleString()} original item rows are mapped exactly once.`
                      : `${missingRows.length} missing and ${duplicateRows.length} duplicated source rows were found.`}
                  </div>
                  <button
                    onClick={confirmReview}
                    disabled={!canEdit || !mappingAuditValid || savingReview}
                  >
                    {savingReview
                      ? "Saving review…"
                      : reviewSaved
                        ? "Mapping reviewed ✓"
                        : "Confirm mapping review"}
                  </button>
                </div>
                {reviewSaved && (
                  <section className="nextStepNotice">
                    <strong>Step 4 is complete.</strong>
                    <span>
                      The reversible source-row mapping has been reviewed and
                      saved.
                    </span>
                    <button onClick={openStepFive}>Continue to Step 5</button>
                  </section>
                )}
              </>
            ) : activeStep === 5 ? (
              <>
                <div className="workspaceHeading">
                  <div>
                    <button
                      className="backStep"
                      onClick={() => setActiveStep(3)}
                    >
                      ← Step 3
                    </button>
                    <span className="builderKicker">STEP 4 OF 5</span>
                    <h2>Name the deal and set its close</h2>
                    <p>
                      The deal number and item quantity are automatic. Choose
                      the Pacific closing date and time, then review exactly how
                      the deal will appear to customers.
                    </p>
                  </div>
                  <div className="securityBadge">Pacific Time (PT)</div>
                </div>
                <section className="detailsSummary">
                  <div>
                    <strong>{dealNumber || "Assigning…"}</strong>
                    <span>Automatic deal number</span>
                  </div>
                  <div>
                    <strong>{totalUnits.toLocaleString()}</strong>
                    <span>Total item quantity</span>
                  </div>
                  <div>
                    <strong>{quantified.length.toLocaleString()}</strong>
                    <span>Deal lines</span>
                  </div>
                </section>
                <section className="detailsPanel">
                  <header>
                    <div>
                      <span>DEAL IDENTITY</span>
                      <h3>Customer listing and spreadsheet name</h3>
                    </div>
                    <p>
                      Confirm the category, description and closing selection.
                    </p>
                  </header>
                  <div className="detailsForm">
                    <label className="dealDirectionField">
                      <span>Deal type</span>
                      <select
                        value={dealDirection}
                        disabled={!canEdit}
                        onChange={(event) => {
                          setDealDirection(
                            event.target.value as "buying" | "selling",
                          );
                          setDetailsSaved(false);
                        }}
                      >
                        <option value="buying">WTB — Want to Buy</option>
                        <option value="selling">WTS — Want to Sell</option>
                      </select>
                      <small>
                        WTB asks suppliers for offers. WTS invites customers to bid.
                      </small>
                    </label>
                    <label>
                      <span>Deal number</span>
                      <input value={dealNumber} readOnly aria-readonly="true" />
                      <small>
                        Based on the deal date and its sequence that day.
                      </small>
                    </label>
                    <label>
                      <span>Product category</span>
                      <select
                        value={productCategory}
                        disabled={!canEdit}
                        onChange={(event) => {
                          setProductCategory(event.target.value);
                          setDetailsSaved(false);
                        }}
                      >
                        <option value="">Select category</option>
                        {productCategories.map((category) => (
                          <option key={category} value={category}>
                            {category.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      <small>
                        Required. Your selection controls the published
                        category and helps generate the inventory description.
                      </small>
                    </label>
                    <label>
                      <span>Short description</span>
                      <input
                        value={shortDescription}
                        disabled={!canEdit}
                        maxLength={48}
                        onChange={(event) => {
                          setShortDescription(event.target.value);
                          setDetailsSaved(false);
                        }}
                        placeholder="Mixed Laptops"
                      />
                      <small>
                        Suggested from the inventory; edit it if a clearer
                        description is needed.
                      </small>
                    </label>
                    <label>
                      <span>Bid close date</span>
                      <input
                        type="date"
                        value={closeDate}
                        disabled={!canEdit}
                        onChange={(event) => {
                          setCloseDate(nextBusinessDate(event.target.value));
                          setDetailsSaved(false);
                        }}
                      />
                    </label>
                    <label>
                      <span>Bid close time</span>
                      <select
                        value={closeTime}
                        disabled={!canEdit}
                        onChange={(event) => {
                          setCloseTime(event.target.value);
                          setDetailsSaved(false);
                        }}
                      >
                        {closeTimes.map((time) => (
                          <option key={time} value={time}>
                            {readableCloseTime(time)} PT
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
                <section className="namingPreview">
                  <div>
                    <span>DISPLAYED ON THE SITE</span>
                    <strong>{displayNamePreview}</strong>
                  </div>
                  <div>
                    <span>SPREADSHEET FILE NAME</span>
                    <strong>{filenamePreview}</strong>
                  </div>
                </section>
                <section className="dealPhotoEditor">
                  <header>
                    <div>
                      <span>DEAL PICTURES</span>
                      <h3>Add pictures customers can view</h3>
                    </div>
                    <strong>{dealPhotos.length}/12</strong>
                  </header>
                  <label className={uploadingPhotos ? "uploading" : ""}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      disabled={
                        !canEdit || uploadingPhotos || dealPhotos.length >= 12
                      }
                      onChange={(event) => {
                        void uploadDealPhotos(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    <b>
                      {uploadingPhotos
                        ? "Uploading pictures…"
                        : "Choose pictures"}
                    </b>
                    <small>JPG, PNG, WebP or GIF · up to 10MB each</small>
                  </label>
                  {dealPhotos.length > 0 && (
                    <div className="dealPhotoGrid">
                      {dealPhotos.map((photo) => (
                        <figure key={photo.id}>
                          <img src={photo.url} alt={photo.filename} />
                          <figcaption>
                            <span>{photo.filename}</span>
                            <button
                              type="button"
                              onClick={() => void removeDealPhoto(photo)}
                            >
                              Remove
                            </button>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </section>
                <div className="detailsFooter">
                  <div>
                    <b>Locked values:</b> deal number and{" "}
                    {totalUnits.toLocaleString()}-item quantity cannot be
                    edited.
                  </div>
                  <button
                    onClick={saveDetails}
                    disabled={
                      !canEdit ||
                      savingDetails ||
                      !dealNumber ||
                      !shortDescription.trim() ||
                      !closeDate ||
                      !closeTime
                    }
                  >
                    {savingDetails
                      ? "Saving deal details…"
                      : detailsSaved
                        ? "Deal details saved ✓"
                        : "Save Step 4 details"}
                  </button>
                </div>
                {detailsSaved && (
                  <section className="nextStepNotice">
                    <strong>Step 4 is complete.</strong>
                    <span>
                      The deal name, closing details and spreadsheet filename
                      are saved.
                    </span>
                    <button onClick={openStepSix}>Continue to Step 5</button>
                  </section>
                )}
              </>
            ) : (
              <>
                <div className="workspaceHeading">
                  <div>
                    <button
                      className="backStep"
                      onClick={() => setActiveStep(5)}
                    >
                      ← Step 4
                    </button>
                    <span className="builderKicker">STEP 5 OF 5</span>
                    <h2>Review and publish the customer deal</h2>
                    <p>
                      This publishes only the quantified customer fields. Serial
                      numbers, locations, seller prices, source rows and other
                      ignored information remain private.
                    </p>
                  </div>
                  <div
                    className={`publishBadge ${published ? "live" : "ready"}`}
                  >
                    {published ? "● Live on LBB" : "Ready to publish"}
                  </div>
                </div>
                <section className="publishSummary">
                  <div>
                    <span>TYPE</span>
                    <strong>
                      {dealDirection === "buying" ? "WTB" : "WTS"}
                    </strong>
                  </div>
                  <div>
                    <span>DEAL</span>
                    <strong>{dealNumber}</strong>
                  </div>
                  <div>
                    <span>ITEMS</span>
                    <strong>{totalUnits.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>LINES</span>
                    <strong>{quantified.length.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>CLOSES</span>
                    <strong>
                      {displayDatePreview} · {readableCloseTime(closeTime)} PT
                    </strong>
                  </div>
                </section>
                <section className="publishPanel">
                  <header>
                    <div>
                      <span>FINAL CUSTOMER PREVIEW</span>
                      <h3>
                        {dealDirection === "buying"
                          ? shortDescription
                          : `${totalUnits.toLocaleString()}-Piece ${shortDescription}`}
                      </h3>
                    </div>
                    <b>{dealNumber}</b>
                  </header>
                  <p>
                    {quantified.length.toLocaleString()} quantified line items
                    totaling {totalUnits.toLocaleString()} pieces. Customers can
                    enter confidential unit bids online or download, complete
                    and upload the Excel bid sheet.
                  </p>
                  <div className="publishChecks">
                    <div>
                      <b>✓</b>
                      <span>
                        <strong>Customer-safe fields only</strong>
                        <small>
                          Ignored and source-specific columns stay private.
                        </small>
                      </span>
                    </div>
                    <div>
                      <b>✓</b>
                      <span>
                        <strong>Excel bid workflow enabled</strong>
                        <small>
                          Qty and totals are locked formulas; Unit Bid is
                          editable.
                        </small>
                      </span>
                    </div>
                    <div>
                      <b>✓</b>
                      <span>
                        <strong>Online line-item bidding enabled</strong>
                        <small>
                          Line totals and grand total calculate automatically.
                        </small>
                      </span>
                    </div>
                    <div>
                      <b>✓</b>
                      <span>
                        <strong>Reversible mapping retained</strong>
                        <small>
                          Submitted prices can be returned to the original rows.
                        </small>
                      </span>
                    </div>
                  </div>
                </section>
                <section className="publishFile">
                  <span>CUSTOMER SPREADSHEET</span>
                  <strong>{saved?.display_filename || filenamePreview}</strong>
                </section>
                <div className="publishFooter">
                  <div>
                    {published ? (
                      <>
                        <b>Deal published.</b> It is available on the Live Bid
                        Board.
                      </>
                    ) : (
                      <>
                        <b>Final action:</b> Publishing makes this deal visible
                        to customers immediately.
                      </>
                    )}
                  </div>
                  {published ? (
                    <a href={`/public-deal-desk/${dealNumber.toLowerCase()}`}>
                      Open customer deal
                    </a>
                  ) : (
                    <button
                      onClick={publishDeal}
                      disabled={!canEdit || publishing}
                    >
                      {publishing
                        ? "Publishing deal…"
                        : "Publish to Live Bid Board"}
                    </button>
                  )}
                </div>
              </>
            )}
            {error && (
              <p className="builderError" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    </Shell>
  );
}
