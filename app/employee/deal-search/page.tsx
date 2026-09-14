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

type Bid = {
  internal_bid_number: string;
  deal_number: string;
  company: string;
  contact_name: string;
  email?: string;
  phone?: string;
  line_count: number;
  total_quantity: number;
  total_bid: number;
  status: string;
  submitted_at: string;
  entered_by_name?: string;
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
    submitted: "Pending",
  } as Record<string, string>)[status] || status.replaceAll("_", " ");

const searchableText = (deal: Deal, bids: Bid[]) =>
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
    bids.map((bid) => `${bid.internal_bid_number} ${bid.company} ${bid.contact_name} ${bid.email || ""} ${bid.phone || ""} ${bid.total_bid} ${bid.status}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export default function DealSearchPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
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
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [dealResponse, bidResponse] = await Promise.all([
        fetch("/api/admin/deals", { headers }),
        fetch("/api/admin/bids?all=1", { headers }),
      ]);
      if (dealResponse.status === 401 || bidResponse.status === 401) {
        clearPddSession();
        window.location.replace("/employee-login?return_to=/employee/deal-search");
        return;
      }
      const [dealData, bidData] = await Promise.all([
        dealResponse.json().catch(() => ({})),
        bidResponse.json().catch(() => ({})),
      ]);
      if (!dealResponse.ok || !bidResponse.ok) {
        setError(dealData.error || bidData.error || "Deals and customer offers could not be loaded.");
        setLoading(false);
        return;
      }
      setDeals(dealData.deals || []);
      setBids(bidData.bids || []);
      setLoading(false);
    })();
  }, []);

  const statuses = useMemo(
    () => [...new Set(deals.map((deal) => deal.status))].sort(),
    [deals],
  );
  const bidsByDeal = useMemo(() => {
    const grouped = new Map<string, Bid[]>();
    for (const bid of bids) {
      const current = grouped.get(bid.deal_number) || [];
      current.push(bid);
      grouped.set(bid.deal_number, current);
    }
    for (const offers of grouped.values())
      offers.sort((a, b) => Number(b.total_bid) - Number(a.total_bid));
    return grouped;
  }, [bids]);
  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return deals.filter((deal) => {
      if (status !== "all" && deal.status !== status) return false;
      const haystack = searchableText(deal, bidsByDeal.get(deal.deal_number) || []);
      return terms.every((term) => haystack.includes(term));
    });
  }, [deals, query, status, bidsByDeal]);

  return (
    <main className="dealSearchPage">
      <header>
        <div>
          <p className="eyebrow">DEAL WORKFLOW</p>
          <h1>Search All Deals</h1>
          <p>Find any deal and review every customer offer, regardless of status.</p>
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
            placeholder="Deal, vendor, item, part number, customer, bid number…"
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
                  <th>Customer Offers</th>
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
                    <td>
                      <div className="dealSearchOffers">
                        {(bidsByDeal.get(deal.deal_number) || []).map((bid) => (
                          <a key={bid.internal_bid_number} href={`/employee/customer-bid?deal=${encodeURIComponent(deal.deal_number)}&bid=${encodeURIComponent(bid.internal_bid_number)}`}>
                            <span><b>{bid.company}</b> · {bid.contact_name}</span>
                            <span>{bid.internal_bid_number} · {statusLabel(bid.status)}</span>
                            <strong>{Number(bid.total_bid || 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong>
                            <small>{Number(bid.total_quantity || 0).toLocaleString()} units · {bid.line_count || 0} lines · {new Date(bid.submitted_at).toLocaleDateString("en-US")}</small>
                          </a>
                        ))}
                        {!(bidsByDeal.get(deal.deal_number) || []).length && <span className="dealSearchNoOffers">No customer offers</span>}
                      </div>
                    </td>
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
