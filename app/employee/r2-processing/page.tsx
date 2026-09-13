"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Shell } from "../../../components/SiteShell";
import {
  clearPddSession,
  currentPddSession,
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
type Item = {
  id: string;
  deal_id: string;
  serial_number: string;
  technician: string;
  model_sku: string;
  tech_data: Record<string, string>;
  bitraser_report_id: string;
  bitraser_data: Record<string, unknown>;
  status: string;
  updated_at: string;
};
type BitRaser = {
  report: { id: string; reportDate: string };
  erasure: { successfulDisks: string; failedDisks: string };
  device: {
    manufacturer: string;
    model: string;
    sku: string;
    systemSerial: string;
    memory: string;
  };
  hardwareTests: { name: string; status: string }[];
  disks: { size: string; mediaType: string; status: string }[];
  processors: { model: string; speed: string }[];
  memoryModules: { sizeBytes: string }[];
};
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
    [nextPoNumber, setNextPoNumber] = useState(""),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [creating, setCreating] = useState(false);
  const [newDeal, setNewDeal] = useState({
    customer: "",
    locationStatus: "inbound",
    notes: "",
  });
  const [uploadName, setUploadName] = useState(""),
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
    grade: "",
    gradeComments: "",
    finalResult: "",
    techData: { ...emptyTech(), testDate: today() },
    bitraserReportId: "",
    bitraserData: {} as Record<string, unknown>,
  });
  const headers = useMemo(
    () =>
      session ? { Authorization: `Bearer ${session.access_token}` } : null,
    [session],
  );
  async function load(active = session) {
    if (!active) return;
    const auth = { Authorization: `Bearer ${active.access_token}` },
      [response, customerResponse] = await Promise.all([
        fetch("/api/admin/r2-processing", { headers: auth, cache: "no-store" }),
        fetch("/api/admin/contacts", { headers: auth, cache: "no-store" }),
      ]);
    if (response.status === 401 || customerResponse.status === 401) {
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
    setNextPoNumber(data.nextPoNumber || "");
    setSelected((current) => current || data.deals?.[0]?.id || "");
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
    dealItems = items.filter((row) => row.deal_id === selected);
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
      setUploadPreview(preview);
      setSerialColumn(serial);
      setModelColumn(model);
    } catch (error) {
      setUploadName("");
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
    if (uploadPreview && serialColumn < 0) {
      setMessage(
        "Choose the spreadsheet column that contains each serial number.",
      );
      return;
    }
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
      uploadName,
      items: imported,
    });
    if (data) {
      setCreating(false);
      setNewDeal({ customer: "", locationStatus: "inbound", notes: "" });
      setUploadName("");
      setUploadPreview(null);
      setSerialColumn(-1);
      setModelColumn(-1);
      await load();
      setSelected(data.id);
      setMessage(
        imported.length
          ? `${data.poNumber || nextPoNumber} created with ${imported.length} serialized items.`
          : `${data.poNumber || nextPoNumber} created.`,
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
        grade: "",
        gradeComments: "",
        finalResult: "",
        techData: { ...emptyTech(), testDate: today() },
        bitraserReportId: "",
        bitraserData: {},
      });
      return;
    }
    setItem({
      id: row.id,
      serialNumber: row.serial_number,
      technician: row.technician,
      modelSku: row.model_sku,
      status: row.status,
      grade: row.tech_data.grade || "",
      gradeComments: row.tech_data.gradeComments || "",
      finalResult: row.tech_data.finalResult || "",
      techData: {
        ...emptyTech(),
        ...row.tech_data,
        testDate: row.tech_data.testDate || today(),
      },
      bitraserReportId: row.bitraser_report_id,
      bitraserData: row.bitraser_data,
    });
  }
  async function pullBitRaser() {
    if (!headers || !item.serialNumber) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/bitraser", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ value: item.serialNumber }),
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
      techData: tech,
    }));
    setMessage(`BitRaser report ${r.report.id} loaded.`);
  }
  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const techData = {
      ...item.techData,
      grade: item.grade,
      gradeComments: item.gradeComments,
      finalResult: item.finalResult,
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
      status: deal.status,
      locationStatus: deal.location_status,
      notes: deal.notes,
    });
    if (data) {
      await load();
      setMessage("R2 deal updated.");
    }
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
            <span>DEAL WORKBOOK · R2 PROCESSING</span>
            <h1>In-Process R2 Deals</h1>
            <p>
              Track inbound and in-house equipment by serial number through
              testing, data wipe and grading.
            </p>
          </div>
          <a className="button secondary" href="/employee">
            Back to workbook
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
                  {row.po_number} · {row.customer} ·{" "}
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
                    Each row becomes a separate serialized R2 item. Items are
                    not quantified.
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
                      Serial-number column *
                      <select
                        required
                        value={serialColumn}
                        onChange={(e) =>
                          setSerialColumn(Number(e.target.value))
                        }
                      >
                        <option value={-1}>Choose column…</option>
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
              {busy ? "Creating…" : "Create R2 Deal"}
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
          <>
            <section className="r2DealHeader">
              <div>
                <small>PO NUMBER</small>
                <h2>{deal.po_number}</h2>
                <p>{deal.customer}</p>
              </div>
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
                  <option value="in_process">In process</option>
                  <option value="ready_for_workbook">
                    Ready for Deal Workbook
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
                        <th>Grade</th>
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
                          <td>{row.tech_data.grade || "—"}</td>
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
                <p className="r2Empty">No serialized items have been added.</p>
              )}
            </section>
            <form className="r2TechSheet" onSubmit={saveItem}>
              <header>
                <div>
                  <span>COMPUTER TEST SHEET · PO {deal.po_number}</span>
                  <h2>
                    {item.id ? "Edit serialized item" : "Add serialized item"}
                  </h2>
                </div>
                {item.bitraserReportId && (
                  <b>BitRaser #{item.bitraserReportId}</b>
                )}
              </header>
              <div className="r2Identity">
                <label>
                  Serial number *
                  <input
                    required
                    value={item.serialNumber}
                    onChange={(e) =>
                      setItem({
                        ...item,
                        serialNumber: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button"
                  disabled={busy || !item.serialNumber}
                  onClick={pullBitRaser}
                >
                  Pull from BitRaser
                </button>
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
                  Grade
                  <select
                    value={item.grade}
                    onChange={(e) =>
                      setItem({ ...item, grade: e.target.value })
                    }
                  >
                    <option value="">Not graded</option>
                    {["A", "B", "C", "D", "F"].map((g) => (
                      <option key={g}>{g}</option>
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
          </>
        )}
      </main>
    </Shell>
  );
}
