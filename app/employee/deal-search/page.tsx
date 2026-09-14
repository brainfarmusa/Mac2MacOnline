"use client";

import { useEffect, useMemo, useState } from "react";
import { clearPddSession, currentPddSession } from "../../../lib/pdd-auth";
import "./deal-search.css";

type Deal = {
  id: string;
  deal_number: string;
  direction: "buying" | "selling";
  category?: string;
  title: string;
  description: string;
  quantity: number;
  closes_at: string;
  location?: string;
  public_lines?: Array<{ values?: Record<string, unknown> }>;
  status: string;
  owner_name?: string;
  owner_email?: string;
  vendor_name?: string;
};

const statusLabel = (status: string) =>
  ({
    open: "Open",
    closing: "Closing Soon",
    closing_soon: "Closing Soon",
    working: "Working",
    pending: "Pending Fulfillment",
    won: "Won",
    no_bid: "No Bid",
    lost: "Lost",
    completed: "Fulfilled",
    closed: "Closed",
    archived: "Archived",
  } as Record<string, string>)[status] || status.replaceAll("_", " ");

const searchableText = (deal: Deal) =>
  [
    deal.deal_number,
    deal.direction,
    deal.category,
    deal.title,
    deal.description,
    deal.location,
    deal.status,
    statusLabel(deal.status),
    deal.owner_name,
    deal.owner_email,
    deal.vendor_name,
    JSON.stringify(deal.public_lines || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export default function DealSearchPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const session = await currentPddSession();
      if (!session) {
        window.location.replace("/employee-login?return_to=/employee/deal-search");
        return;
      }
      const response = await fetch("/api/admin/deals", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.status === 401) {
        clearPddSession();
        window.location.replace("/employee-login?return_to=/employee/deal-search");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Deals could not be loaded.");
        setLoading(false);
        return;
      }
      setDeals(data.deals || []);
      setLoading(false);
    })();
  }, []);

  const statuses = useMemo(
    () => [...new Set(deals.map((deal) => deal.status))].sort(),
    [deals],
  );
  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return deals.filter((deal) => {
      if (status !== "all" && deal.status !== status) return false;
      const haystack = searchableText(deal);
      return terms.every((term) => haystack.includes(term));
    });
  }, [deals, query, status]);

  return (
    <main className="dealSearchPage">
      <header>
        <div>
          <p className="eyebrow">DEAL WORKFLOW</p>
          <h1>Search All Deals</h1>
          <p>Find any deal, including completed, lost, closed and archived records.</p>
        </div>
        <nav>
          <a href="/employee">Deal Workbook</a>
          <a href="/employee/active-bids">Deal Dashboard</a>
        </nav>
      </header>

      <section className="dealSearchControls" aria-label="Deal search filters">
        <label>
          Search deals
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Deal number, vendor, item, part number, owner…"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>{statusLabel(item)}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>
          Clear
        </button>
      </section>

      {loading && <p className="dealSearchNotice">Loading all deals…</p>}
      {error && <p className="dealSearchNotice error" role="alert">{error}</p>}
      {!loading && !error && (
        <>
          <p className="dealSearchCount"><b>{results.length}</b> of {deals.length} deals</p>
          <div className="dealSearchTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Status</th>
                  <th>Vendor</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Owner</th>
                  <th>Closing Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((deal) => (
                  <tr key={deal.id}>
                    <td><b>{deal.deal_number}</b></td>
                    <td><span className={`dealSearchStatus status-${deal.status}`}>{statusLabel(deal.status)}</span></td>
                    <td>{deal.vendor_name || "Unassigned"}</td>
                    <td>{deal.description || deal.title}</td>
                    <td>{deal.category || "—"}</td>
                    <td>{Number(deal.quantity || 0).toLocaleString()}</td>
                    <td>{deal.owner_name || "Unassigned"}</td>
                    <td>{deal.closes_at ? new Date(deal.closes_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "—"}</td>
                    <td><a className="dealSearchAction" href={`/employee/deals?search=${encodeURIComponent(deal.deal_number)}`}>Open deal</a></td>
                  </tr>
                ))}
                {!results.length && (
                  <tr><td className="dealSearchEmpty" colSpan={9}>No deals match this search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
