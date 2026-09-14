"use client";

import { useEffect, useState } from "react";
import { Shell } from "../../../components/SiteShell";
import { currentPddSession } from "../../../lib/pdd-auth";

const views = {
  current: {
    eyebrow: "INVENTORY",
    title: "Current Inventory",
    description: "Search and review all equipment currently stored at the Chico warehouse.",
  },
  receive: {
    eyebrow: "RECEIVING",
    title: "Receive Inventory",
    description: "Add incoming equipment, quantities, locations and source details to Chico stock.",
  },
  activity: {
    eyebrow: "INVENTORY HISTORY",
    title: "Inventory Activity",
    description: "Review receipts, adjustments, transfers, allocations and shipments.",
  },
  reports: {
    eyebrow: "REPORTING",
    title: "Inventory Reports",
    description: "Summarize on-hand quantity, inventory value, aging and movement.",
  },
} as const;

type View = keyof typeof views;

export default function ChicoStockPage() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("current");

  useEffect(() => {
    currentPddSession().then((session) => {
      if (!session) {
        window.location.replace("/employee-login");
        return;
      }
      const requested = new URLSearchParams(window.location.search).get("view");
      if (requested && requested in views) setView(requested as View);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <Shell><main className="employeeDashboard"><p>Loading Chico Stock…</p></main></Shell>;
  }

  const selected = views[view];

  return (
    <Shell>
      <main className="employeeDashboard chicoStockPage">
        <header>
          <div>
            <p className="eyebrow">M2M DASHBOARD · CHICO STOCK</p>
            <h1>Chico Stock</h1>
            <p>Inventory control for equipment stored at the Chico warehouse.</p>
          </div>
          <a className="button secondary" href="/employee">Back to Dashboard</a>
        </header>
        <nav className="chicoStockNav" aria-label="Chico Stock sections">
          {(Object.keys(views) as View[]).map((key) => (
            <a key={key} className={view === key ? "active" : ""} href={`/employee/chico-stock?view=${key}`}>
              {views[key].title}
            </a>
          ))}
        </nav>
        <section className="chicoStockWorkspace">
          <p className="eyebrow">{selected.eyebrow}</p>
          <h2>{selected.title}</h2>
          <p>{selected.description}</p>
          <div className="chicoStockEmpty">
            <strong>{selected.title} workspace ready</strong>
            <span>The inventory fields and workflow will be added here next.</span>
          </div>
        </section>
      </main>
    </Shell>
  );
}
