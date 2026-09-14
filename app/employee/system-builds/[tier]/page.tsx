"use client";

import { useEffect, useMemo, useState } from "react";
import { currentPddSession } from "@/lib/pdd-auth";

type BuildLine = {
  id: number;
  component: string;
  manufacturer: string;
  specification: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
};

const tierNames: Record<string, string> = {
  custom: "Custom Build",
  "entry-level": "Entry Level",
  "mid-range": "Mid-Range",
  enterprise: "Enterprise",
};

const tierParts: Record<string, string[]> = {
  custom: ["Chassis", "Motherboard", "CPU", "Memory", "Storage", "GPU", "Power Supply", "Networking"],
  "entry-level": ["2U Chassis", "Motherboard", "CPU", "DDR5 Memory", "NVMe Storage", "NVIDIA L4 GPU", "Power Supply", "Networking"],
  "mid-range": ["4U Chassis", "Motherboard", "CPU", "DDR5 Memory", "Enterprise NVMe Storage", "AI GPU", "Power Supply", "Networking"],
  enterprise: ["Enterprise Chassis", "Server Motherboard", "Dual CPU", "ECC DDR5 Memory", "Enterprise NVMe Storage", "Enterprise AI GPU", "Redundant Power Supply", "High-Speed Networking"],
};

const entryLevelSystems = [
  {
    name: "BrainFarm Entry Level 2U System",
    parts: ["2U Chassis", "Motherboard", "CPU", "DDR5 Memory", "NVMe Storage", "NVIDIA L4 GPU", "Power Supply", "Networking"],
  },
  {
    name: "BrainFarm Entry Level 4U System",
    parts: ["4U Chassis", "Motherboard", "CPU", "DDR5 Memory", "NVMe Storage", "NVIDIA L4 GPU", "Power Supply", "Networking"],
  },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function BrainFarmSystemBuilder() {
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState("custom");
  const [buildNames, setBuildNames] = useState<string[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [buildLines, setBuildLines] = useState<BuildLine[][]>([]);

  useEffect(() => {
    (async () => {
      if (!(await currentPddSession())) {
        window.location.replace("/employee-login");
        return;
      }
      const selected = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "custom");
      const safeTier = tierNames[selected] ? selected : "custom";
      const title = tierNames[safeTier];
      setTier(safeTier);
      const systems = safeTier === "entry-level"
        ? entryLevelSystems
        : [{ name: `BrainFarm ${title} System`, parts: tierParts[safeTier] || tierParts.custom }];
      setBuildNames(systems.map((system) => system.name));
      setCustomers(systems.map(() => ""));
      setNotes(systems.map(() => ""));
      setBuildLines(systems.map((system) => system.parts.map((component, index) => ({
        id: index + 1,
        component,
        manufacturer: "",
        specification: component === "DDR5 Memory" ? "512GB DDR5" : component === "NVIDIA L4 GPU" ? "NVIDIA L4 24GB" : "",
        quantity: component.includes("GPU") && safeTier === "entry-level" ? 2 : 1,
        unitCost: 0,
        unitPrice: 0,
      }))));
      setReady(true);
    })();
  }, []);

  const totals = useMemo(() => buildLines.map((lines) => lines.reduce((result, line) => ({
    cost: result.cost + line.quantity * line.unitCost,
    price: result.price + line.quantity * line.unitPrice,
  }), { cost: 0, price: 0 })), [buildLines]);

  function update(buildIndex: number, id: number, patch: Partial<BuildLine>) {
    setBuildLines((current) => current.map((lines, index) => index === buildIndex ? lines.map((line) => line.id === id ? { ...line, ...patch } : line) : lines));
  }

  function addLine(buildIndex: number) {
    setBuildLines((current) => current.map((lines, index) => index === buildIndex ? [...lines, {
      id: Math.max(0, ...lines.map((line) => line.id)) + 1,
      component: "New Component",
      manufacturer: "",
      specification: "",
      quantity: 1,
      unitCost: 0,
      unitPrice: 0,
    }] : lines));
  }

  function downloadBuild(buildIndex: number) {
    const lines = buildLines[buildIndex];
    const buildName = buildNames[buildIndex];
    const total = totals[buildIndex];
    const rows = [
      ["BrainFarm System Build", buildName],
      ["Build Level", tierNames[tier]],
      ["Customer", customers[buildIndex]],
      ["Notes", notes[buildIndex]],
      [],
      ["Component", "Manufacturer", "Specification / Part Number", "Quantity", "Unit Cost", "Extended Cost", "Unit Price", "Extended Price"],
      ...lines.map((line) => [line.component, line.manufacturer, line.specification, line.quantity, line.unitCost, line.quantity * line.unitCost, line.unitPrice, line.quantity * line.unitPrice]),
      [],
      ["Totals", "", "", "", "", total.cost, "", total.price],
      ["Gross Profit", "", "", "", "", "", "", total.price - total.cost],
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${buildName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "BrainFarm-System-Build"}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  if (!ready) return <main className="systemBuildPage"><p>Opening system builder…</p></main>;

  return (
    <main className="systemBuildPage">
      <header>
        <div>
          <p className="eyebrow">BRAINFARM SYSTEM BUILDS</p>
          <h1>{tierNames[tier]}</h1>
          <p>{tier === "entry-level" ? "Choose either entry-level system and configure its line items, costs and customer pricing." : "Configure components, costs and customer pricing for this system."}</p>
        </div>
        <a href="/employee">← Dashboard</a>
      </header>
      <div className="systemBuildCards">
      {buildLines.map((lines, buildIndex) => {
        const total = totals[buildIndex];
        return <article className="systemBuildCard" key={`${tier}-${buildIndex}`}>
      <div className="systemBuildCardTitle"><div><span>System configuration</span><h2>{buildNames[buildIndex]}</h2></div><button className="button" type="button" onClick={() => downloadBuild(buildIndex)}>Download Build Sheet</button></div>
      <section className="systemBuildDetails">
        <label>Build name<input value={buildNames[buildIndex]} onChange={(event) => setBuildNames((current) => current.map((value, index) => index === buildIndex ? event.target.value : value))} /></label>
        <label>Customer or project<input value={customers[buildIndex]} onChange={(event) => setCustomers((current) => current.map((value, index) => index === buildIndex ? event.target.value : value))} placeholder="Customer, proposal or internal project" /></label>
        <label className="wide">Build notes<textarea rows={3} value={notes[buildIndex]} onChange={(event) => setNotes((current) => current.map((value, index) => index === buildIndex ? event.target.value : value))} placeholder="Use case, performance target, delivery requirements or special instructions" /></label>
      </section>
      <section className="systemBuildTable">
        <header><h2>System components</h2><button type="button" onClick={() => addLine(buildIndex)}>+ Add Component</button></header>
        <div className="systemBuildTableScroll">
          <table>
            <thead><tr><th>Component</th><th>Manufacturer</th><th>Specification / Part Number</th><th>Qty</th><th>Unit Cost</th><th>Extended Cost</th><th>Unit Price</th><th>Extended Price</th><th></th></tr></thead>
            <tbody>{lines.map((line) => <tr key={line.id}>
              <td><input value={line.component} onChange={(event) => update(buildIndex, line.id, { component: event.target.value })} /></td>
              <td><input value={line.manufacturer} onChange={(event) => update(buildIndex, line.id, { manufacturer: event.target.value })} /></td>
              <td><input value={line.specification} onChange={(event) => update(buildIndex, line.id, { specification: event.target.value })} /></td>
              <td><input type="number" min="1" value={line.quantity} onChange={(event) => update(buildIndex, line.id, { quantity: Number(event.target.value) || 1 })} /></td>
              <td><input type="number" min="0" step="0.01" value={line.unitCost || ""} onChange={(event) => update(buildIndex, line.id, { unitCost: Number(event.target.value) || 0 })} /></td>
              <td>{money(line.quantity * line.unitCost)}</td>
              <td><input type="number" min="0" step="0.01" value={line.unitPrice || ""} onChange={(event) => update(buildIndex, line.id, { unitPrice: Number(event.target.value) || 0 })} /></td>
              <td>{money(line.quantity * line.unitPrice)}</td>
              <td><button type="button" aria-label={`Remove ${line.component}`} onClick={() => setBuildLines((current) => current.map((build, index) => index === buildIndex ? build.filter((item) => item.id !== line.id) : build))}>×</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="systemBuildTotals">
        <div><span>Total component cost</span><strong>{money(total.cost)}</strong></div>
        <div><span>Customer price</span><strong>{money(total.price)}</strong></div>
        <div><span>Gross profit</span><strong>{money(total.price - total.cost)}</strong></div>
        <div><span>Gross margin</span><strong>{total.price ? `${(((total.price - total.cost) / total.price) * 100).toFixed(1)}%` : "0.0%"}</strong></div>
      </section>
      </article>;
      })}
      </div>
    </main>
  );
}
