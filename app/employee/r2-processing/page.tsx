"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Shell } from "../../../components/SiteShell";
import {
  clearPddSession,
  currentPddSession,
  pddAuthFetch,
  type PddSession,
} from "../../../lib/pdd-auth";
import {
  previewRawSpreadsheet,
  type RawSpreadsheetPreview,
} from "../../../lib/rawDealSpreadsheet";
import "./r2-processing.css";
import "./r2-upload.css";

type Deal = {
  id: string;
  po_number: string;
  customer: string;
  vendor_id: string;
  vendor_name: string;
  location_status: string;
  status: string;
  notes: string;
  created_by: string;
  updated_at: string;
};
type Customer = {
  id: string;
  company: string;
  contact_name: string;
  email: string;
};
type Vendor = { id: string; company_name: string; contact_name: string };
type Item = {
  id: string;
  deal_id: string;
  serial_number: string;
  technician: string;
  model_sku: string;
  tech_data: Record<string, any>;
  bitraser_report_id: string;
  bitraser_data: Record<string, unknown>;
  status: string;
  updated_at: string;
};
type BitRaser = {
  result: string;
  report: { id: string; digitalId: string; reportDate: string; softwareVersion: string };
  erasure: { totalDisks: string; successfulDisks: string; failedDisks: string; method: string; verification: string; writePasses: string };
  device: {
    manufacturer: string;
    model: string;
    sku: string;
    systemSerial: string;
    chassisSerial: string;
    boardSerial: string;
    uuid: string;
    memory: string;
    autopilotStatus: string;
  };
  hardwareTests: { name: string; status: string }[];
  disks: { diskNumber: string; model: string; serial: string; size: string; mediaType: string; smartStatus: string; badSectors: string; method: string; status: string; started: string; completed: string; duration: string }[];
  processors: { manufacturer: string; model: string; cores: string; speed: string }[];
  memoryModules: { manufacturer: string; sizeBytes: string; speed: string; formFactor: string; serial: string }[];
};
type ImeiDevice = {
  model: string; serialNumber: string; activationStatus: string;
  warrantyStatus: string; estimatedPurchaseDate: string; coverageEndDate: string;
  technicalSupport: string; repairsServiceCoverage: string; appleCareEligible: string;
  replacedByApple: string; findMyStatus: string; mdmLockStatus: string;
  lockedCarrier: string; simLockStatus: string; orderId: string; price: string; duration: string;
};
const imeiFields: Array<[keyof ImeiDevice, string]> = [
  ["model", "Model"], ["serialNumber", "IMEI / serial"],
  ["activationStatus", "Activation status"], ["warrantyStatus", "Warranty status"],
  ["estimatedPurchaseDate", "Estimated purchase date"], ["coverageEndDate", "Coverage end date"],
  ["technicalSupport", "Telephone technical support"], ["repairsServiceCoverage", "Repairs and service coverage"],
  ["appleCareEligible", "AppleCare eligible"], ["replacedByApple", "Replaced by Apple"],
  ["findMyStatus", "Find My"], ["mdmLockStatus", "MDM lock status"],
  ["lockedCarrier", "Locked carrier"], ["simLockStatus", "SIM-lock status"],
  ["orderId", "Order ID"], ["price", "Check price"], ["duration", "Check duration"],
];
const checks = [
  ["bootsBattery", "Boots from battery"],
  ["batteryCharging", "Battery charging"],
  ["bootsAc", "Boots from AC"],
  ["driveInstalled", "HDD/SSD installed"],
  ["camera", "Camera"],
  ["internalSpeakers", "Internal speakers"],
  ["externalMonitorSpeakers", "External monitor/speakers"],
  ["microphone", "Microphone"],
  ["audioJack", "Audio jack"],
  ["wifi", "Wi-Fi"],
  ["keyboard", "Keyboard"],
  ["bootsOs", "Boots OS"],
  ["lcdOk", "LCD OK"],
  ["noDeadPixels", "No dead pixels"],
  ["touchpad", "Touchpad"],
  ["bluetooth", "Bluetooth"],
  ["hdmi", "HDMI"],
  ["bitraser", "BitRaser completed"],
] as const;
const texts = [
  ["cpuType", "CPU type"],
  ["cpuSpeed", "CPU speed"],
  ["ramSize", "RAM size"],
  ["ramSlots", "RAM slots"],
  ["driveSize", "HDD/SSD size"],
  ["osInstalled", "OS installed"],
  ["batteryCapacity", "Battery capacity (mAh)"],
  ["batteryCycles", "Battery cycle count"],
  ["lcdSize", "LCD size"],
  ["usbCount", "USB/USB-C quantity"],
] as const;
const processingCategories = [
  ["controlled_unevaluated", "R2 controlled — Unevaluated equipment"],
  ["controlled_unsanitized", "R2 controlled — Unsanitized device or media"],
  ["controlled_test_repair", "R2 controlled — Requires test or repair"],
  ["controlled_focus_material", "R2 controlled — Focus-material equipment"],
  ["unrestricted_new", "Unrestricted — New unopened OEM equipment"],
  ["unrestricted_non_data", "Unrestricted — Non-electronic/non-focus material"],
  ["unrestricted_return", "Unrestricted — Documented planned return"],
] as const;
const sanitizationStatuses = [
  ["not_evaluated", "Not evaluated — data presence unknown"],
  ["contains_data", "Contains data — sanitization required"],
  ["non_data_device", "Non-data device"],
  ["no_data_found", "Evaluated as not containing data"],
  ["physical_destruction", "Sanitized through physical destruction"],
  ["software", "Sanitized with software"],
] as const;
const cosmeticGrades = [
  ["C0", "Not categorized"],
  ["C1", "Damaged"],
  ["C2", "Used Poor"],
  ["C3", "Used Fair"],
  ["C4", "Used Good"],
  ["C5", "Used Very Good"],
  ["C6", "Used Excellent"],
  ["C7", "Certified Pre-Owned"],
  ["C8", "Unused"],
  ["C9", "New Open Box"],
] as const;
const functionalGrades = [
  ["F1", "Collectible or Specialty"],
  ["F2", "Verified Specialty Electronics"],
  ["F3", "Key Functions Working"],
  ["F4", "Hardware Functional"],
  ["F5", "Refurbished"],
  ["F6", "Like New"],
] as const;
const emptyTech = () =>
  Object.fromEntries([...checks, ...texts].map(([key]) => [key, ""])) as Record<
    string,
    string
  >;
const passed = (value: string) =>
  /success|pass/i.test(value) ? "yes" : value ? "no" : "";
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export default function R2ProcessingPage() {
  const [session, setSession] = useState<PddSession | null>(null),
    [deals, setDeals] = useState<Deal[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [vendors, setVendors] = useState<Vendor[]>([]),
    [nextPoNumber, setNextPoNumber] = useState(""),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [creating, setCreating] = useState(false);
  const [newDeal, setNewDeal] = useState({
    customer: "",
    vendorId: "",
    locationStatus: "inbound",
    notes: "",
  });
  const [uploadName, setUploadName] = useState(""),
    [uploadFile, setUploadFile] = useState<File | null>(null),
    [uploadPreview, setUploadPreview] = useState<RawSpreadsheetPreview | null>(
      null,
    ),
    [serialColumn, setSerialColumn] = useState(-1),
    [modelColumn, setModelColumn] = useState(-1);
  const [item, setItem] = useState({
    id: "",
    serialNumber: "",
    technician: "",
    modelSku: "",
    status: "testing",
    cosmeticGrade: "",
    functionalGrade: "",
    processingCategory: "controlled_unevaluated",
    sanitizationStatus: "not_evaluated",
    gradeComments: "",
    finalResult: "",
    techData: { ...emptyTech(), testDate: today() } as Record<string, any>,
    bitraserReportId: "",
    bitraserData: {} as Record<string, unknown>,
    imeiData: {} as Record<string, unknown>,
  });
  const headers = useMemo(
    () =>
      session ? { Authorization: `Bearer ${session.access_token}` } : null,
    [session],
  );
  async function load(active = session) {
    if (!active) return;
    const auth = { Authorization: `Bearer ${active.access_token}` },
      [response, customerResponse, vendorResponse] = await Promise.all([
        fetch("/api/admin/r2-processing", { headers: auth, cache: "no-store" }),
        fetch("/api/admin/contacts", { headers: auth, cache: "no-store" }),
        pddAuthFetch("/rest/v1/pdd_vendors?select=id,company_name,contact_name&order=company_name.asc", { headers: auth, cache: "no-store" }),
      ]);
    if (response.status === 401 || customerResponse.status === 401 || vendorResponse.status === 401) {
      clearPddSession();
      window.location.replace(
        "/employee-login?return_to=/employee/r2-processing",
      );
      return;
    }
    const data = await response.json(),
      customerData = customerResponse.ok ? await customerResponse.json() : {};
    setDeals(data.deals || []);
    setItems(data.items || []);
    setCustomers(
      [
        ...new Map<string, Customer>(
          (customerData.customers || [])
            .filter((row: Customer) => row.company)
            .map((row: Customer) => [row.company.trim().toLowerCase(), row]),
        ).values(),
      ].sort((a, b) => a.company.localeCompare(b.company)),
    );
    setVendors(vendorResponse.ok ? await vendorResponse.json() as Vendor[] : []);
    setNextPoNumber(data.nextPoNumber || "");
    // Keep the landing view unselected so an employee deliberately chooses
    // the R2 deal they are about to process.
    setSelected((current) => current);
    setLoading(false);
  }
  useEffect(() => {
    void (async () => {
      const active = await currentPddSession();
      if (!active) {
        window.location.replace(
          "/employee-login?return_to=/employee/r2-processing",
        );
        return;
      }
      setSession(active);
      await load(active);
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "1") setCreating(true);
      if (params.get("deal")) setSelected(params.get("deal") || "");
    })();
  }, []);
  const deal = deals.find((row) => row.id === selected),
    dealItems = items.filter((row) => row.deal_id === selected),
    imeiData = item.imeiData as unknown as ImeiDevice,
    bitRaserData = item.bitraserData as unknown as BitRaser;
  async function post(body: Record<string, unknown>) {
    if (!headers) return null;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/r2-processing", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "The R2 record could not be saved.");
      return null;
    }
    return data;
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    setMessage("");
    try {
      const preview = await previewRawSpreadsheet(file);
      const serial = preview.headers.findIndex((header) =>
          /^(?:system\s+)?serial(?:\s*(?:number|no\.?|#))?$|service\s*tag/i.test(
            header,
          ),
        ),
        model = preview.headers.findIndex((header) =>
          /model|sku|part\s*(?:number|no\.?|#)/i.test(header),
        );
      setUploadName(file.name);
      setUploadFile(file);
      setUploadPreview(preview);
      setSerialColumn(serial);
      setModelColumn(model);
    } catch (error) {
      setUploadName("");
      setUploadFile(null);
      setUploadPreview(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "The spreadsheet could not be read.",
      );
    }
  }
  async function createDeal(event: FormEvent) {
    event.preventDefault();
    const imported = (uploadPreview?.rows || [])
      .map((row) => ({
        serialNumber: String(row[serialColumn] || "")
          .trim()
          .toUpperCase(),
        modelSku: modelColumn >= 0 ? String(row[modelColumn] || "").trim() : "",
      }))
      .filter((row) => row.serialNumber);
    const data = await post({
      action: "create_deal",
      ...newDeal,
      vendorName: vendors.find((vendor) => vendor.id === newDeal.vendorId)?.company_name || "",
      uploadName,
      items: imported,
    });
    if (data) {
      setCreating(false);
      setNewDeal({ customer: "", vendorId: "", locationStatus: "inbound", notes: "" });
      setUploadName("");
      setUploadPreview(null);
      setSerialColumn(-1);
      setModelColumn(-1);
      let uploadWarning = "";
      if (uploadFile) {
        const form = new FormData();
        form.append("dealId", data.id);
        form.append("file", uploadFile);
        const uploadResponse = await fetch(
          "/api/admin/r2-processing/inventory",
          { method: "POST", headers: headers || undefined, body: form },
        );
        if (!uploadResponse.ok)
          uploadWarning =
            " The deal was created, but the original spreadsheet could not be stored.";
      }
      setUploadFile(null);
      await load();
      setSelected(data.id);
      setMessage(
        imported.length
          ? `${data.poNumber || nextPoNumber} created with ${imported.length} serialized items.${uploadWarning}`
          : `${data.poNumber || nextPoNumber} created for intake. Reopen it when the equipment arrives to add serial numbers and processing results.${uploadWarning}`,
      );
    }
  }
  function editItem(row?: Item) {
    if (!row) {
      setItem({
        id: "",
        serialNumber: "",
        technician: session?.user?.email?.split("@")[0] || "",
        modelSku: "",
        status: "testing",
        cosmeticGrade: "",
        functionalGrade: "",
        processingCategory: "controlled_unevaluated",
        sanitizationStatus: "not_evaluated",
        gradeComments: "",
        finalResult: "",
        techData: { ...emptyTech(), testDate: today() },
        bitraserReportId: "",
        bitraserData: {},
        imeiData: {},
      });
      return;
    }
    setItem({
      id: row.id,
      serialNumber: row.serial_number,
      technician: row.technician,
      modelSku: row.model_sku,
      status: row.status,
      cosmeticGrade: row.tech_data.cosmeticGrade || "",
      functionalGrade: row.tech_data.functionalGrade || "",
      processingCategory:
        row.tech_data.processingCategory || "controlled_unevaluated",
      sanitizationStatus:
        row.tech_data.sanitizationStatus ||
        (row.tech_data.bitraser === "yes" ? "software" : "not_evaluated"),
      gradeComments: row.tech_data.gradeComments || "",
      finalResult: row.tech_data.finalResult || "",
      techData: {
        ...emptyTech(),
        ...row.tech_data,
        testDate: row.tech_data.testDate || today(),
      },
      bitraserReportId: row.bitraser_report_id,
      bitraserData: row.bitraser_data,
      imeiData:
        row.tech_data.imeiCheck && typeof row.tech_data.imeiCheck === "object"
          ? row.tech_data.imeiCheck
          : {},
    });
  }
  async function pullBitRaser(serialNumber = item.serialNumber) {
    if (!headers || !serialNumber) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/bitraser", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ value: serialNumber }),
      }),
      data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "BitRaser report could not be loaded.");
      return;
    }
    const r = data.report as BitRaser,
      map = new Map(
        r.hardwareTests.map((test) => [test.name.toLowerCase(), test.status]),
      ),
      tech = { ...item.techData };
    tech.cpuType = r.processors[0]?.model || tech.cpuType;
    tech.cpuSpeed = r.processors[0]?.speed || tech.cpuSpeed;
    tech.ramSize = r.device.memory || tech.ramSize;
    tech.ramSlots = String(r.memoryModules.length || "");
    tech.driveSize = r.disks
      .map((d) => [d.size, d.mediaType].filter(Boolean).join(" "))
      .join(", ");
    tech.driveInstalled = r.disks.length ? "yes" : "";
    tech.keyboard = passed(map.get("keyboard") || "");
    tech.touchpad = passed(map.get("mouse") || "");
    tech.wifi = passed(map.get("wifi") || "");
    tech.bluetooth = passed(map.get("bluetooth") || "");
    tech.camera = passed(map.get("webcam") || "");
    tech.internalSpeakers = passed(map.get("speaker") || "");
    tech.microphone = passed(map.get("audio") || "");
    tech.lcdOk = passed(map.get("display") || "");
    tech.bitraser =
      Number(r.erasure.successfulDisks) > 0 &&
      Number(r.erasure.failedDisks) === 0
        ? "yes"
        : "no";
    setItem((current) => ({
      ...current,
      serialNumber: r.device.systemSerial || current.serialNumber,
      modelSku: [r.device.manufacturer, r.device.model, r.device.sku]
        .filter(Boolean)
        .join(" · "),
      bitraserReportId: r.report.id,
      bitraserData: r as unknown as Record<string, unknown>,
      sanitizationStatus:
        Number(r.erasure.successfulDisks) > 0 &&
        Number(r.erasure.failedDisks) === 0
          ? "software"
          : current.sanitizationStatus,
      techData: tech,
    }));
    setMessage(`BitRaser report ${r.report.id} loaded.`);
  }
  async function pullImei(serialNumber = item.serialNumber) {
    if (!headers || !serialNumber || !selected) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/imei-checker", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: selected, identifier: serialNumber }),
      }),
      data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "IMEI Checker data could not be loaded.");
      return;
    }
    const result = data.results?.[0], device = result?.device as ImeiDevice | undefined;
    if (!device) {
      setMessage("IMEI Checker returned no device data.");
      return;
    }
    setItem((current) => ({
      ...current,
      modelSku: current.modelSku || device.model || "",
      imeiData: {
        ...device,
        serviceId: result.service_id,
        serviceName: result.service_name,
        responseStatus: result.response_status,
        checkedAt: result.checked_at,
        checkedBy: result.checked_by,
        cached: Boolean(result.cached),
        raw: result.response,
      },
      techData: {
        ...current.techData,
        imeiModel: device.model,
        activationStatus: device.activationStatus,
        warrantyStatus: device.warrantyStatus,
        estimatedPurchaseDate: device.estimatedPurchaseDate,
        coverageEndDate: device.coverageEndDate,
        technicalSupport: device.technicalSupport,
        repairsServiceCoverage: device.repairsServiceCoverage,
        appleCareEligible: device.appleCareEligible,
        replacedByApple: device.replacedByApple,
        findMyStatus: device.findMyStatus,
        mdmLockStatus: device.mdmLockStatus || "Not Known",
        lockedCarrier: device.lockedCarrier,
        simLockStatus: device.simLockStatus,
      },
    }));
    setMessage(`IMEI Checker data loaded${result.cached ? " from the saved result" : ""}.`);
  }
  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const techData = {
      ...item.techData,
      cosmeticGrade: item.cosmeticGrade,
      functionalGrade: item.functionalGrade,
      processingCategory: item.processingCategory,
      sanitizationStatus: item.sanitizationStatus,
      gradeComments: item.gradeComments,
      finalResult: item.finalResult,
      imeiCheck: item.imeiData,
    };
    const data = await post({
      action: "save_item",
      dealId: selected,
      id: item.id,
      serialNumber: item.serialNumber,
      technician: item.technician,
      modelSku: item.modelSku,
      status: item.status,
      techData,
      bitraserReportId: item.bitraserReportId,
      bitraserData: item.bitraserData,
    });
    if (data) {
      await load();
      editItem();
      setMessage("Serialized item saved.");
    }
  }
  async function updateDeal() {
    if (!deal) return;
    const data = await post({
      action: "update_deal",
      id: deal.id,
      vendorId: deal.vendor_id,
      vendorName: deal.vendor_name,
      status: deal.status,
      locationStatus: deal.location_status,
      notes: deal.notes,
    });
    if (data) {
      await load();
      setMessage("R2 deal updated.");
    }
  }
  async function downloadOriginalInventory() {
    if (!deal || !headers) return;
    const response = await fetch(
      `/api/admin/r2-processing/inventory?deal=${encodeURIComponent(deal.id)}`,
      { headers },
    );
    if (!response.ok) {
      setMessage("The original inventory spreadsheet could not be downloaded.");
      return;
    }
    const blob = await response.blob(),
      disposition = response.headers.get("content-disposition") || "",
      encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1],
      link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = encoded
      ? decodeURIComponent(encoded)
      : `${deal.po_number}-inventory.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  const setTech = (key: string, value: string) =>
    setItem((current) => ({
      ...current,
      techData: { ...current.techData, [key]: value },
    }));
  if (loading)
    return (
      <Shell>
        <main className="r2Page">
          <p>Loading R2 processing…</p>
        </main>
      </Shell>
    );
  return (
    <Shell>
      <main className="r2Page">
        <header>
          <div>
            <span>DASHBOARD · R2 PROCESSING</span>
            <h1>In-Process R2 Deals</h1>
            <p>
              Track inbound and in-house equipment by serial number through
              testing, data wipe and grading.
            </p>
          </div>
          <a className="button secondary" href="/employee">
            Back to Dashboard
          </a>
        </header>
        <section className="r2Toolbar">
          <label>
            R2 deal
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                editItem();
              }}
            >
              <option value="">Select a deal…</option>
              {deals.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.po_number} · {row.customer} · {row.vendor_name || "Vendor required"} ·{" "}
                  {row.location_status.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            onClick={() => setCreating((value) => !value)}
          >
            + New R2 Deal
          </button>
        </section>
        {creating && (
          <form className="r2NewDeal" onSubmit={createDeal}>
            <label>
              PO number
              <input
                value={nextPoNumber}
                readOnly
                aria-label="Next automatically assigned PO number"
              />
              <small>Assigned automatically from the R2 PO queue.</small>
            </label>
            <label>
              Customer *
              <select
                required
                value={newDeal.customer}
                onChange={(e) =>
                  setNewDeal({ ...newDeal, customer: e.target.value })
                }
              >
                <option value="">Select customer…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.company}>
                    {customer.company}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vendor *
              <select
                required
                value={newDeal.vendorId}
                onChange={(e) => setNewDeal({ ...newDeal, vendorId: e.target.value })}
              >
                <option value="">Select vendor…</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.company_name}{vendor.contact_name ? ` · ${vendor.contact_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location *
              <select
                value={newDeal.locationStatus}
                onChange={(e) =>
                  setNewDeal({ ...newDeal, locationStatus: e.target.value })
                }
              >
                <option value="inbound">Inbound</option>
                <option value="in_house">In house</option>
              </select>
            </label>
            <section className="r2Upload wide">
              <header>
                <div>
                  <b>Upload original inventory spreadsheet</b>
                  <p>
                    Upload the information you have now. If serial numbers are
                    not available, create the intake deal and add them when the
                    equipment arrives.
                  </p>
                </div>
                <label className="button secondary">
                  Choose Spreadsheet
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => void chooseFile(e.target.files?.[0])}
                  />
                </label>
              </header>
              {uploadPreview && (
                <>
                  <div className="r2UploadMapping">
                    <label>
                      Serial-number column (optional at intake)
                      <select
                        value={serialColumn}
                        onChange={(e) =>
                          setSerialColumn(Number(e.target.value))
                        }
                      >
                        <option value={-1}>Not in this spreadsheet</option>
                        {uploadPreview.headers.map((header, index) => (
                          <option key={index} value={index}>
                            {header || `Column ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Model / SKU column
                      <select
                        value={modelColumn}
                        onChange={(e) => setModelColumn(Number(e.target.value))}
                      >
                        <option value={-1}>None</option>
                        {uploadPreview.headers.map((header, index) => (
                          <option key={index} value={index}>
                            {header || `Column ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <strong>
                      {uploadPreview.rowCount} rows · {uploadName}
                    </strong>
                  </div>
                  <div className="r2UploadPreview">
                    <table>
                      <thead>
                        <tr>
                          {uploadPreview.headers.map((header, index) => (
                            <th key={index}>
                              {header || `Column ${index + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {uploadPreview.rows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {uploadPreview.headers.map((_, column) => (
                              <td key={column}>{row[column] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
            <label className="wide">
              Deal notes
              <textarea
                value={newDeal.notes}
                onChange={(e) =>
                  setNewDeal({ ...newDeal, notes: e.target.value })
                }
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Creating…" : "Create Intake Deal"}
            </button>
          </form>
        )}
        {message && (
          <p
            className={
              /could not|already|required/i.test(message)
                ? "r2Message error"
                : "r2Message"
            }
          >
            {message}
          </p>
        )}
        {deal && (
          <div className="r2SelectedDeal">
            <section className="r2DealHeader">
              <div>
                <small>PO NUMBER</small>
                <h2>{deal.po_number}</h2>
                <p>Customer: {deal.customer}</p>
                <p><b>Vendor: {deal.vendor_name || "Assignment required"}</b></p>
              </div>
              <label>
                Vendor *
                <select
                  required
                  value={deal.vendor_id || ""}
                  onChange={(e) => {
                    const vendor = vendors.find((row) => row.id === e.target.value);
                    setDeals((rows) => rows.map((row) => row.id === deal.id ? { ...row, vendor_id: e.target.value, vendor_name: vendor?.company_name || "" } : row));
                  }}
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.company_name}</option>)}
                </select>
              </label>
              <label>
                Location
                <select
                  value={deal.location_status}
                  onChange={(e) =>
                    setDeals((rows) =>
                      rows.map((row) =>
                        row.id === deal.id
                          ? { ...row, location_status: e.target.value }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="inbound">Inbound</option>
                  <option value="in_house">In house</option>
                </select>
              </label>
              <label>
                Workflow status
                <select
                  value={deal.status}
                  onChange={(e) =>
                    setDeals((rows) =>
                      rows.map((row) =>
                        row.id === deal.id
                          ? { ...row, status: e.target.value }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="awaiting_arrival">Awaiting arrival</option>
                  <option value="in_process">In process</option>
                  <option value="ready_for_workbook">
                    Ready for Dashboard
                  </option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="notes">
                Notes
                <textarea
                  value={deal.notes}
                  onChange={(e) =>
                    setDeals((rows) =>
                      rows.map((row) =>
                        row.id === deal.id
                          ? { ...row, notes: e.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <button className="button secondary" onClick={updateDeal}>
                Save Deal
              </button>
              {/Original inventory:/i.test(deal.notes) && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void downloadOriginalInventory()}
                >
                  Download Original Inventory
                </button>
              )}
            </section>
            <section className="r2Stats">
              <article>
                <strong>{dealItems.length}</strong>
                <span>Serialized items</span>
              </article>
              <article>
                <strong>
                  {dealItems.filter((row) => row.status === "complete").length}
                </strong>
                <span>Completed</span>
              </article>
              <article>
                <strong>
                  {
                    dealItems.filter((row) => row.tech_data.bitraser === "yes")
                      .length
                  }
                </strong>
                <span>BitRaser complete</span>
              </article>
              <article>
                <strong>
                  {
                    dealItems.filter(
                      (row) => row.tech_data.finalResult === "pass",
                    ).length
                  }
                </strong>
                <span>Passed</span>
              </article>
            </section>
            <section className="r2Items">
              <header>
                <div>
                  <h2>Serialized items</h2>
                  <p>Items remain separate until R2 processing is complete.</p>
                </div>
                <button className="button" onClick={() => editItem()}>
                  + Add Item
                </button>
              </header>
              {dealItems.length ? (
                <div className="r2Table">
                  <table>
                    <thead>
                      <tr>
                        <th>Serial</th>
                        <th>Model / SKU</th>
                        <th>Technician</th>
                        <th>Stage</th>
                        <th>BitRaser</th>
                        <th>R2 Grade</th>
                        <th>Result</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dealItems.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <b>{row.serial_number}</b>
                          </td>
                          <td>{row.model_sku || "—"}</td>
                          <td>{row.technician}</td>
                          <td>{row.status.replace("_", " ")}</td>
                          <td>{row.tech_data.bitraser || "—"}</td>
                          <td>
                            {[
                              row.tech_data.functionalGrade,
                              row.tech_data.cosmeticGrade,
                            ]
                              .filter(Boolean)
                              .join(" / ") || "—"}
                          </td>
                          <td>{row.tech_data.finalResult || "—"}</td>
                          <td>
                            <button onClick={() => editItem(row)}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="r2Empty">
                  Intake deal created. When the equipment arrives, choose Add
                  Item to begin serial-number tracking, testing, data wiping and
                  R2 grading.
                </p>
              )}
            </section>
            <form className="r2TechSheet" onSubmit={saveItem}>
              <header>
                <div>
                  <span>COMPUTER TEST SHEET · PO {deal.po_number}</span>
                  <h2>
                    {item.id
                      ? "Edit serialized item"
                      : "Enter the first serial number to begin"}
                  </h2>
                </div>
                {item.bitraserReportId && (
                  <b>BitRaser #{item.bitraserReportId}</b>
                )}
              </header>
              <div className="r2SerialPicker">
                <label>
                  Serial number from uploaded deal
                  <select
                    value={item.id}
                    onChange={(e) => {
                      const row = dealItems.find((entry) => entry.id === e.target.value);
                      if (row) {
                        editItem(row);
                      }
                      else editItem();
                    }}
                  >
                    <option value="">Enter a new serial number…</option>
                    {dealItems.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.serial_number}{row.model_sku ? ` · ${row.model_sku}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {dealItems.length
                    ? `${dealItems.length} uploaded serial ${dealItems.length === 1 ? "number" : "numbers"} available`
                    : "No serial numbers were included in the uploaded deal"}
                </span>
              </div>
              <div className="r2Identity">
                <label>
                  Serial number *
                  <input
                    required
                    autoFocus={!item.id}
                    value={item.serialNumber}
                    onChange={(e) =>
                      setItem({
                        ...item,
                        serialNumber: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
                <div className="r2ConnectionButtons">
                  <button
                    type="button"
                    className="button"
                    disabled={busy || !item.serialNumber}
                    onClick={() => void pullImei()}
                  >
                    {busy ? "Loading…" : "Pull IMEI Data"}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || !item.serialNumber}
                    onClick={() => void pullBitRaser()}
                  >
                    {busy ? "Loading…" : "Pull BitRaser Data"}
                  </button>
                </div>
                <label>
                  Test date *
                  <input
                    required
                    type="date"
                    value={item.techData.testDate || today()}
                    onChange={(e) => setTech("testDate", e.target.value)}
                  />
                </label>
                <label>
                  Technician *
                  <input
                    required
                    value={item.technician}
                    onChange={(e) =>
                      setItem({ ...item, technician: e.target.value })
                    }
                  />
                </label>
                <label>
                  Model / SKU
                  <input
                    value={item.modelSku}
                    onChange={(e) =>
                      setItem({ ...item, modelSku: e.target.value })
                    }
                  />
                </label>
                <label>
                  Processing stage
                  <select
                    value={item.status}
                    onChange={(e) =>
                      setItem({ ...item, status: e.target.value })
                    }
                  >
                    <option value="testing">Testing</option>
                    <option value="data_wipe">Data wipe</option>
                    <option value="grading">Grading</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>
              </div>
              {Object.keys(item.imeiData).length > 0 && (
                <section className="r2ConnectionData">
                  <header>
                    <div>
                      <span>IMEI CHECKER</span>
                      <h3>Apple, carrier and lock information</h3>
                    </div>
                    <b>{String(item.imeiData.responseStatus || "received")}</b>
                  </header>
                  <dl className="r2DataGrid">
                    {imeiFields.map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{imeiData[key] || "Not Known"}</dd>
                      </div>
                    ))}
                    <div><dt>Service</dt><dd>{String(item.imeiData.serviceName || "Not Known")}</dd></div>
                    <div><dt>Checked</dt><dd>{String(item.imeiData.checkedAt || "Not Known")}</dd></div>
                    <div><dt>Checked by</dt><dd>{String(item.imeiData.checkedBy || "Not Known")}</dd></div>
                  </dl>
                </section>
              )}
              {Object.keys(item.bitraserData).length > 0 && bitRaserData.report && (
                <section className="r2ConnectionData">
                  <header>
                    <div>
                      <span>BITRASER</span>
                      <h3>Erasure report and hardware inventory</h3>
                    </div>
                    <b>{bitRaserData.result || "received"}</b>
                  </header>
                  <h4>Report and erasure</h4>
                  <dl className="r2DataGrid">
                    {[
                      ["Report ID", bitRaserData.report.id], ["Digital ID", bitRaserData.report.digitalId],
                      ["Report date", bitRaserData.report.reportDate], ["Software version", bitRaserData.report.softwareVersion],
                      ["Total disks", bitRaserData.erasure.totalDisks], ["Successful disks", bitRaserData.erasure.successfulDisks],
                      ["Failed disks", bitRaserData.erasure.failedDisks], ["Erasure method", bitRaserData.erasure.method],
                      ["Verification", bitRaserData.erasure.verification], ["Write passes", bitRaserData.erasure.writePasses],
                    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not Known"}</dd></div>)}
                  </dl>
                  <h4>Device</h4>
                  <dl className="r2DataGrid">
                    {[
                      ["Manufacturer", bitRaserData.device.manufacturer], ["Model", bitRaserData.device.model],
                      ["SKU", bitRaserData.device.sku], ["System serial", bitRaserData.device.systemSerial],
                      ["Chassis serial", bitRaserData.device.chassisSerial], ["Board serial", bitRaserData.device.boardSerial],
                      ["UUID", bitRaserData.device.uuid], ["Installed memory", bitRaserData.device.memory],
                      ["Autopilot status", bitRaserData.device.autopilotStatus],
                    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not Known"}</dd></div>)}
                  </dl>
                  <h4>Hardware tests</h4>
                  <dl className="r2DataGrid">
                    {(bitRaserData.hardwareTests || []).map((test) => <div key={test.name}><dt>{test.name}</dt><dd>{test.status || "Not Known"}</dd></div>)}
                  </dl>
                  <h4>Disks</h4>
                  <div className="r2ConnectionTable"><table><thead><tr><th>Disk</th><th>Model</th><th>Serial</th><th>Size</th><th>Media</th><th>SMART</th><th>Bad sectors</th><th>Method</th><th>Status</th><th>Started</th><th>Completed</th><th>Duration</th></tr></thead><tbody>{(bitRaserData.disks || []).map((disk, index) => <tr key={`${disk.serial}-${index}`}><td>{disk.diskNumber || index + 1}</td><td>{disk.model || "—"}</td><td>{disk.serial || "—"}</td><td>{disk.size || "—"}</td><td>{disk.mediaType || "—"}</td><td>{disk.smartStatus || "—"}</td><td>{disk.badSectors || "—"}</td><td>{disk.method || "—"}</td><td>{disk.status || "—"}</td><td>{disk.started || "—"}</td><td>{disk.completed || "—"}</td><td>{disk.duration || "—"}</td></tr>)}</tbody></table></div>
                  <h4>Processors</h4>
                  <div className="r2ConnectionTable"><table><thead><tr><th>Manufacturer</th><th>Model</th><th>Cores</th><th>Speed</th></tr></thead><tbody>{(bitRaserData.processors || []).map((cpu, index) => <tr key={index}><td>{cpu.manufacturer || "—"}</td><td>{cpu.model || "—"}</td><td>{cpu.cores || "—"}</td><td>{cpu.speed || "—"}</td></tr>)}</tbody></table></div>
                  <h4>Memory modules</h4>
                  <div className="r2ConnectionTable"><table><thead><tr><th>Manufacturer</th><th>Size</th><th>Speed</th><th>Form factor</th><th>Serial</th></tr></thead><tbody>{(bitRaserData.memoryModules || []).map((memory, index) => <tr key={index}><td>{memory.manufacturer || "—"}</td><td>{memory.sizeBytes || "—"}</td><td>{memory.speed || "—"}</td><td>{memory.formFactor || "—"}</td><td>{memory.serial || "—"}</td></tr>)}</tbody></table></div>
                </section>
              )}
              <div className="r2TextFields">
                {texts.map(([key, name]) => (
                  <label key={key}>
                    {name}
                    <input
                      value={item.techData[key] || ""}
                      onChange={(e) => setTech(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <div className="r2Checks">
                {checks.map(([key, name]) => (
                  <label key={key}>
                    <span>{name}</span>
                    <select
                      value={item.techData[key] || ""}
                      onChange={(e) => setTech(key, e.target.value)}
                    >
                      <option value="">Not tested</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                      <option value="n/a">N/A</option>
                    </select>
                  </label>
                ))}
              </div>
              <div className="r2Grade">
                <label>
                  R2 processing category
                  <select
                    value={item.processingCategory}
                    onChange={(e) =>
                      setItem({ ...item, processingCategory: e.target.value })
                    }
                  >
                    {processingCategories.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Data-sanitization status
                  <select
                    value={item.sanitizationStatus}
                    onChange={(e) =>
                      setItem({ ...item, sanitizationStatus: e.target.value })
                    }
                  >
                    {sanitizationStatuses.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cosmetic grade
                  <select
                    value={item.cosmeticGrade}
                    onChange={(e) =>
                      setItem({ ...item, cosmeticGrade: e.target.value })
                    }
                  >
                    <option value="">Not graded</option>
                    {cosmeticGrades.map(([value, label]) => (
                      <option key={value} value={value}>
                        {value} — {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Functionality grade
                  <select
                    value={item.functionalGrade}
                    onChange={(e) =>
                      setItem({ ...item, functionalGrade: e.target.value })
                    }
                  >
                    <option value="">Not graded</option>
                    {functionalGrades.map(([value, label]) => (
                      <option key={value} value={value}>
                        {value} — {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Final result
                  <select
                    value={item.finalResult}
                    onChange={(e) =>
                      setItem({ ...item, finalResult: e.target.value })
                    }
                  >
                    <option value="">Not complete</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </label>
                <div className="r2GradeSummary">
                  <span>Final R2 grade</span>
                  <strong>
                    {[item.functionalGrade, item.cosmeticGrade]
                      .filter(Boolean)
                      .join(" / ") || "Not assigned"}
                  </strong>
                  <a href="/m2m-r2-grading" target="_blank" rel="noreferrer">
                    Open M2M R2 Grading Guide
                  </a>
                </div>
                <label className="wide">
                  Grade comments
                  <textarea
                    value={item.gradeComments}
                    onChange={(e) =>
                      setItem({ ...item, gradeComments: e.target.value })
                    }
                  />
                </label>
              </div>
              <footer>
                <button className="button" disabled={busy}>
                  {busy ? "Saving…" : "Save Serialized Item"}
                </button>
              </footer>
            </form>
          </div>
        )}
      </main>
    </Shell>
  );
}
