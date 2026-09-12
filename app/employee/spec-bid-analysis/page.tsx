"use client";
import { useEffect, useState } from "react";
import * as XLSX from "@e965/xlsx";
import { clearPddSession, currentPddSession } from "@/lib/pdd-auth";
type Row = {
  r: number;
  text: string;
  description: string;
  query: string;
  qty: number;
  base: number;
  ebay: boolean;
};
type Result = {
  row: number;
  description: string;
  grade: string;
  base: number;
  unit: number | null;
  total: number | null;
  analysis: string;
  url: string;
};
const cash = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }),
  text = (v: unknown) => String(v ?? "").trim(),
  num = (v: unknown) => {
    const n = Number(String(v ?? "").replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  },
  find = (h: string[], p: RegExp[]) =>
    h.findIndex((x) => p.some((r) => r.test(x)));
function price(notes: string, base: number, ebay: boolean) {
  const s = notes.toLowerCase();
  let grade = (s.match(/\bgrade\s*([a-d])\b/i)?.[1] || "A").toUpperCase();
  if (
    (/\bdent(?:ed|s)?\b/.test(s) ||
      (/\b(?:case|housing|chassis)\s+scratch/.test(s) &&
        !/\bminor\s+(?:case\s+)?scratch/.test(s))) &&
    grade < "C"
  )
    grade = "C";
  let f = ebay ? 0.7 : 0.9;
  const why = [ebay ? "eBay sold median less 30%" : "wholesale less 10%"];
  if (grade === "B") {
    f *= 0.95;
    why.push("Grade B less 5%");
  }
  if (grade === "C") {
    f *= 0.95 * 0.8;
    why.push("Grade C less 20% than B");
  }
  if (grade === "D") {
    f *= 0.95 * 0.8 * 0.7;
    why.push("Grade D less 30% than C");
  }
  if (
    /(?:broken|cracked|bad|failed|non[- ]?working).{0,12}(?:lcd|screen|display)|(?:lcd|screen|display).{0,12}(?:broken|cracked|bad|failed)/.test(
      s,
    )
  ) {
    f *= 0.5;
    why.push("broken LCD less 50%");
  }
  if (
    /(?:icloud|mdm|fim).{0,8}(?:locked|lock)|(?:locked|lock).{0,8}(?:icloud|mdm|fim)/.test(
      s,
    )
  ) {
    f *= 0.1;
    why.push("iCloud/MDM/FIM less 90%");
  }
  why.push("configuration and notes analyzed");
  return {
    grade,
    unit: base ? Math.round(base * f * 100) / 100 : null,
    why: why.join("; "),
  };
}
export default function Page() {
  const [ready, setReady] = useState(false),
    [token, setToken] = useState(""),
    [purchaseType, setPurchaseType] = useState("End-User Purchase"),
    [book, setBook] = useState<XLSX.WorkBook | null>(null),
    [sheetName, setSheetName] = useState(""),
    [fileName, setFileName] = useState(""),
    [rows, setRows] = useState<Row[]>([]),
    [heads, setHeads] = useState<string[]>([]),
    [headRow, setHeadRow] = useState(0),
    [results, setResults] = useState<Result[]>([]),
    [message, setMessage] = useState(""),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0);
  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("purchase");
    setPurchaseType(
      mode === "broker"
        ? "Broker Purchase"
        : mode === "itad"
          ? "ITAD Purchase"
          : "End-User Purchase",
    );
    void currentPddSession().then((s) => {
      if (!s) {
        location.replace(
          `/employee-login?return_to=${encodeURIComponent(location.pathname + location.search)}`,
        );
        return;
      }
      setToken(s.access_token);
      setReady(true);
    });
  }, []);
  async function upload(file: File) {
    setBook(null);
    setRows([]);
    setResults([]);
    setMessage("Reading spreadsheet…");
    try {
      if (!file.size) throw new Error("The selected bid spreadsheet is empty.");
      if (file.size > 10 * 1024 * 1024)
        throw new Error("The bid spreadsheet must be 10 MB or smaller.");
      if (!/\.xlsx?$/i.test(file.name))
        throw new Error("Please choose an .xls or .xlsx bid spreadsheet.");
      const wb = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellStyles: true,
        cellFormula: true,
      });
      const selected = wb.SheetNames.map((name) => ({
        name,
        data: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
          header: 1,
          defval: "",
          raw: false,
        }),
      })).find((sheet) =>
        sheet.data.some((row) => row.filter(text).length >= 2),
      );
      if (!selected)
        throw new Error(
          "No populated worksheet was found. Save the workbook, then select it again.",
        );
      const { name, data } = selected,
        hr = data.findIndex((r) => r.filter(text).length >= 2),
        h = (data[hr] || []).map(text),
        qty = find(h, [/^qty$/i, /^quantity$/i, /^units?$/i]),
        eb = find(h, [/ebay.*(?:sold|price)/i]),
        wh = find(h, [
          /wholesale.*price/i,
          /^wcp$/i,
          /market.*price/i,
          /^price$/i,
          /^cost$/i,
        ]),
        des = h
          .map((x, i) =>
            /description|manufacturer|mfg|model|part|configuration|spec|cpu|ram|memory|storage|condition|grade|comment|note/i.test(
              x,
            )
              ? i
              : -1,
          )
          .filter((i) => i >= 0),
        list: Row[] = [];
      for (let r = hr + 1; r < data.length; r++) {
        const line = data[r] || [];
        if (!line.some(text)) continue;
        const vals = (
            des.length ? des.map((i) => text(line[i])) : line.map(text)
          ).filter(Boolean),
          ebase = eb >= 0 ? num(line[eb]) : 0;
        list.push({
          r,
          text: line.map(text).join(" | "),
          description: vals.slice(0, 8).join(" · "),
          query: vals
            .filter((v) => !/^grade\s*[a-d]$/i.test(v))
            .slice(0, 6)
            .join(" ")
            .slice(0, 220),
          qty: qty >= 0 ? Math.max(1, num(line[qty])) : 1,
          base: ebase || (wh >= 0 ? num(line[wh]) : 0),
          ebay: Boolean(ebase),
        });
      }
      if (!list.length)
        throw new Error(
          `No item rows were found below the header on the “${name}” tab.`,
        );
      setBook(wb);
      setSheetName(name);
      setFileName(file.name);
      setRows(list);
      setHeads(h);
      setHeadRow(hr);
      setProgress(0);
      setMessage(
        `${list.length} lines loaded from “${name}”. Click Run Analysis to research sold prices and calculate cost.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The bid spreadsheet could not be opened.",
      );
    }
  }
  async function run() {
    if (!book || running) return;
    setRunning(true);
    setResults([]);
    setProgress(0);
    const h = [...heads];
    for (const n of [
      "Unit Bid",
      "Total Bid",
      "Cost Analysis",
      "Market Research",
      "Research Source",
    ])
      if (find(h, [new RegExp(`^${n}$`, "i")]) < 0) h.push(n);
    const ui = find(h, [/^unit bid$/i]),
      ti = find(h, [/^total bid$/i]),
      ai = find(h, [/^cost analysis$/i]),
      mi = find(h, [/^market research$/i]),
      si = find(h, [/^research source$/i]),
      sheet = book.Sheets[sheetName],
      out: Result[] = [];
    for (let start = 0; start < rows.length; start += 3) {
      const batch = rows.slice(start, start + 3),
        market = await Promise.all(
          batch.map(async (x) => {
            if (x.base)
              return {
                median: x.base,
                url: "",
                note: x.ebay
                  ? "Used uploaded eBay sold reference."
                  : "Used uploaded wholesale reference.",
              };
            try {
              const res = await fetch("/api/admin/spec-bid-research", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ query: x.query }),
              });
              return (await res.json()) as {
                median: number;
                url: string;
                note: string;
              };
            } catch {
              return {
                median: 0,
                url: "",
                note: "Research unavailable; review manually.",
              };
            }
          }),
        );
      batch.forEach((x, i) => {
        const m = market[i],
          p = price(x.text, Number(m.median || 0), x.base ? x.ebay : true),
          total =
            p.unit === null ? null : Math.round(p.unit * x.qty * 100) / 100,
          analysis = m.median
            ? `${m.note} ${p.why}`
            : `${m.note} No bid calculated.`,
          result = {
            row: x.r + 1,
            description: x.description,
            grade: p.grade,
            base: Number(m.median || 0),
            unit: p.unit,
            total,
            analysis,
            url: m.url || "",
          };
        out.push(result);
        for (const [c, v] of [
          [ui, p.unit ?? ""],
          [ti, total ?? ""],
          [ai, analysis],
          [
            mi,
            m.median ? `${m.note} Reference ${cash.format(m.median)}` : m.note,
          ],
          [si, m.url || ""],
        ] as [number, string | number][])
          sheet[XLSX.utils.encode_cell({ r: x.r, c })] = {
            t: typeof v === "number" ? "n" : "s",
            v,
          };
      });
      setProgress(Math.min(start + batch.length, rows.length));
      setResults([...out]);
    }
    h.forEach(
      (v, c) =>
        (sheet[XLSX.utils.encode_cell({ r: headRow, c })] = { t: "s", v }),
    );
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    range.e.c = Math.max(range.e.c, h.length - 1);
    sheet["!ref"] = XLSX.utils.encode_range(range);
    setHeads(h);
    setRunning(false);
    setMessage(
      `Analysis complete: ${out.filter((x) => x.unit !== null).length} of ${out.length} lines priced. Review lines marked manual.`,
    );
  }
  function download() {
    if (book)
      XLSX.writeFile(book, fileName.replace(/\.xlsx?$/i, "") + "-COST.xlsx");
  }
  if (!ready)
    return <main className="builderLoading">Opening Spec Bid Analysis…</main>;
  return (
    <main className="specAnalysisPage">
      <header>
        <div>
          <p className="eyebrow">VENDOR PURCHASING</p>
          <h1>Spec Bid Analysis ({purchaseType})</h1>
          <p>
            Research market prices, analyze configurations and notes, apply the
            permanent cost rules and download the priced workbook.
          </p>
        </div>
        <a href="/employee">← Deal Workbook</a>
      </header>
      <section className="specRuleCard">
        <h2>Permanent cost rules</h2>
        <p>
          Wholesale less 10%; eBay sold less 30%; Grade B less 5% from A; Grade
          C less 20% from B; Grade D less 30% from C; broken LCD less 50%;
          iCloud, MDM or FIM lock less 90%. Functional dents and non-minor case
          scratches are Grade C.
        </p>
      </section>
      <section className="specUpload">
        <label>
          Upload bid spreadsheet
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
        {message && <p>{message}</p>}
        <div className="specActions">
          {book && (
            <button
              className="button"
              disabled={running}
              onClick={() => void run()}
            >
              {running
                ? `Researching ${progress}/${rows.length}…`
                : "Run Analysis"}
            </button>
          )}
          {results.length > 0 && !running && (
            <button className="button" onClick={download}>
              Download Cost Results
            </button>
          )}
        </div>
      </section>
      {results.length > 0 && (
        <section className="specResults">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Configuration</th>
                <th>Grade</th>
                <th>Market Reference</th>
                <th>Unit Bid</th>
                <th>Total Bid</th>
                <th>Research & Analysis</th>
              </tr>
            </thead>
            <tbody>
              {results.map((x) => (
                <tr key={x.row}>
                  <td>{x.row}</td>
                  <td>{x.description}</td>
                  <td>{x.grade}</td>
                  <td>
                    {x.url ? (
                      <a href={x.url} target="_blank" rel="noreferrer">
                        {x.base ? cash.format(x.base) : "Review"} ↗
                      </a>
                    ) : x.base ? (
                      cash.format(x.base)
                    ) : (
                      "Needed"
                    )}
                  </td>
                  <td>{x.unit === null ? "—" : cash.format(x.unit)}</td>
                  <td>{x.total === null ? "—" : cash.format(x.total)}</td>
                  <td>{x.analysis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <button
        className="specSignOut"
        onClick={() => {
          clearPddSession();
          location.assign("/employee-login");
        }}
      >
        Sign out
      </button>
    </main>
  );
}
