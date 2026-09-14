"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearPddSession, currentPddSession } from "../../../lib/pdd-auth";
import {nextBusinessDate,pacificIso} from "../../../lib/businessDays";
import "./active-bids.css";
import "./r2-summary.css";

type PublicLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
};
type Deal = {
  id: string;
  deal_number: string;
  direction: "buying" | "selling";
  category: string;
  title: string;
  description: string;
  quantity: number;
  closes_at: string;
  updated_at: string;
  status:
    | "open"
    | "working"
    | "pending"
    | "no_bid"
    | "lost"
    | "completed"
    | "closed"
    | "archived";
  owner_name: string;
  vendor_name: string;
  vendor_id: string;
  line_count: number;
  tab_count: number;
  public_lines?: PublicLine[];
};
type Bid = {
  internal_bid_number: string;
  deal_number: string;
  company: string;
  customer_id: string;
  sales_owner_name: string;
  total_bid: number;
  status: "submitted" | "won" | "lost";
};
type Comment = {
  id: string;
  deal_id: string;
  deal_number: string;
  author_user_id: string;
  comment: string;
  created_at: string;
  edited_at?: string;
};
type Estimate = {
  deal_id: string;
  deal_number: string;
  proposed_amount: number;
  updated_by: string;
  updated_at: string;
};
type R2Deal={id:string;po_number:string;customer:string;location_status:string;status:string;updated_at:string};
type R2Item={deal_id:string;status:string;tech_data:Record<string,string>};
type Group =
  | "want_to_buy"
  | "open"
  | "closing"
  | "working"
  | "pending"
  | "no_bid"
  | "lost"
  | "completed"
  | "closed"
  | "archived";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const pacificInputFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function closeParts(value: string) {
  const parts = Object.fromEntries(
    pacificInputFormat
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
function categoryFor(deal: Deal) {
  return deal.category || "Other";
}
function repInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || name.toLowerCase() === "unassigned") return "—";
  return `${parts[0]?.[0] || ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : ""}`.toUpperCase();
}
function businessRecordHref(type: "vendors" | "customers", recordId: string) {
  return `/employee/contacts?type=${type}&record=${encodeURIComponent(recordId)}&edit=1`;
}
function groupFor(deal: Deal): Group {
  if (["no_bid", "lost", "completed", "closed", "archived"].includes(deal.status))
    return deal.status as Group;
  if (deal.direction === "buying") return "want_to_buy";
  if (deal.status === "pending") return "pending";
  if (deal.status === "working") return "working";
  const remaining = new Date(deal.closes_at).getTime() - Date.now();
  if (
    remaining <= 0 &&
    (!deal.updated_at ||
      new Date(deal.updated_at).getTime() <= new Date(deal.closes_at).getTime())
  )
    return "working";
  if (remaining <= 0) return "open";
  return remaining <= 24 * 60 * 60 * 1000 ? "closing" : "open";
}

export default function ActiveBidsPage() {
  const [deals, setDeals] = useState<Deal[]>([]),
    [bids, setBids] = useState<Bid[]>([]),
    [r2Deals,setR2Deals]=useState<R2Deal[]>([]),
    [r2Items,setR2Items]=useState<R2Item[]>([]),
    [comments, setComments] = useState<Comment[]>([]),
    [estimates, setEstimates] = useState<Estimate[]>([]),
    [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({}),
    [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({}),
    [dateDrafts, setDateDrafts] = useState<Record<string, string>>({}),
    [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [token, setToken] = useState(""),
    [, setClock] = useState(0),
    [bidHover, setBidHover] = useState<{
      dealNumber: string;
      bids: Bid[];
      left: number;
      top: number;
    } | null>(null),
    hoverCloseTimer = useRef<number | null>(null);
  const cancelHoverClose = () => {
    if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  };
  const closeBidHover = (delay = 0) => {
    cancelHoverClose();
    hoverCloseTimer.current = window.setTimeout(() => setBidHover(null), delay);
  };
  const [query, setQuery] = useState(""),
    [rep, setRep] = useState("all"),
    [vendor, setVendor] = useState("all"),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState("active");
  useEffect(() => {
    void (async () => {
      const requestedStatus = new URLSearchParams(window.location.search).get("status");
      if (requestedStatus && ["active", "all", "open", "closing", "working", "pending", "no_bid", "lost", "completed", "closed", "archived"].includes(requestedStatus))
        setStatus(requestedStatus);
      const session = await currentPddSession();
      if (!session) {
        window.location.replace(
          "/employee-login?return_to=/employee/active-bids",
        );
        return;
      }
      setToken(session.access_token);
      const headers = { Authorization: `Bearer ${session.access_token}` };
      try {
        const [dealResponse, bidResponse,r2Response] = await Promise.all([
          fetch("/api/admin/deals", { headers }),
          fetch("/api/admin/bids", { headers }),
          fetch("/api/admin/r2-processing",{headers}),
        ]);
        if (dealResponse.status === 401 || bidResponse.status === 401 || r2Response.status===401) {
          clearPddSession();
          window.location.replace("/employee-login");
          return;
        }
        if (!dealResponse.ok || !bidResponse.ok)
          throw new Error("Deal Dashboard data could not be loaded.");
        const dealData = await dealResponse.json(),
          bidData = await bidResponse.json(),
          r2Data=r2Response.ok?await r2Response.json():{deals:[],items:[]};
        setDeals(dealData.deals || []);
        setComments(dealData.comments || []);
        setEstimates(dealData.estimates || []);
        setAmountDrafts(
          Object.fromEntries(
            (dealData.estimates || []).map((item: Estimate) => [
              item.deal_id,
              String(Number(item.proposed_amount) || ""),
            ]),
          ),
        );
        setBids(bidData.bids || []);
        setR2Deals(r2Data.deals||[]);
        setR2Items(r2Data.items||[]);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Deal Dashboard data could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function setDealStatus(deal: Deal, status: Deal["status"] | "won") {
    if (!token) return;
    if (status === "won") {
      const eligible = bids
        .filter((bid) => bid.deal_number === deal.deal_number && bid.status !== "lost")
        .sort((a, b) => Number(b.total_bid) - Number(a.total_bid));
      if (!eligible.length) {
        setMessage(`No customer bid is available to mark Won for ${deal.deal_number}.`);
        return;
      }
      await awardBid(eligible[0]);
      return;
    }
    setMessage("");
    const response = await fetch("/api/admin/deals", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: deal.id, status }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "The deal status could not be updated.");
      return;
    }
    setDeals((current) =>
      current
        .map((item) =>
          item.id === deal.id ? { ...item, ...data.deal, status } : item,
        ),
    );
  }
  useEffect(() => {
    if (!token) return;
    const tick = () => {
      setClock(Date.now());
      deals
        .filter(
          (deal) =>
            deal.status === "open" &&
            new Date(deal.closes_at).getTime() <= Date.now() &&
            (!deal.updated_at ||
              new Date(deal.updated_at).getTime() <=
                new Date(deal.closes_at).getTime()),
        )
        .forEach((deal) => void setDealStatus(deal, "working"));
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [token, deals]);
  async function saveNote(
    deal: Deal,
    existing: Comment | undefined,
    value: string,
  ) {
    const comment = value.trim();
    if (!token || !comment || comment === existing?.comment) return;
    const response = await fetch("/api/admin/deals", {
      method: existing ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(
        existing
          ? { commentId: existing.id, comment }
          : { dealId: deal.id, dealNumber: deal.deal_number, comment },
      ),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "The comment could not be saved.");
      return;
    }
    setComments((current) =>
      existing
        ? current.map((item) =>
            item.id === existing.id
              ? { ...item, comment, edited_at: data.comment?.edited_at }
              : item,
          )
        : [...current, data.comment],
    );
    setMessage("Comment saved.");
  }
  async function saveAmount(deal: Deal, value: string) {
    const amount = Number(value || 0);
    if (!token || !Number.isFinite(amount) || amount < 0) return;
    const current = estimates.find((item) => item.deal_id === deal.id);
    if (current && Number(current.proposed_amount) === amount) return;
    const response = await fetch("/api/admin/deals", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: deal.id,
        dealNumber: deal.deal_number,
        proposedAmount: amount,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "The proposed amount could not be saved.");
      return;
    }
    setEstimates((items) => [
      ...items.filter((item) => item.deal_id !== deal.id),
      data.estimate,
    ]);
    setMessage("Proposed purchase amount saved.");
  }
  async function saveClosing(
    deal: Deal,
    dateValue?: string,
    timeValue?: string,
  ) {
    if (!token) return;
    const current = closeParts(deal.closes_at),
      requestedDate = dateValue || dateDrafts[deal.id] || current.date,
      date = nextBusinessDate(requestedDate),
      time = timeValue || timeDrafts[deal.id] || current.time;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
      return;
    const closesAt = pacificIso(date, time);
    if (closesAt === deal.closes_at) return;
    setMessage("");
    const response = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: deal.id, closesAt }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(
        data.error || "The closing date and time could not be updated.",
      );
      return;
    }
    setDeals((items) =>
      items.map((item) =>
        item.id === deal.id ? { ...item, ...data.deal } : item,
      ),
    );
    setDateDrafts((values) => ({ ...values, [deal.id]: date }));
    setTimeDrafts((values) => ({ ...values, [deal.id]: time }));
    const reopened = deal.status === "working" && new Date(closesAt).getTime() > Date.now();
    setMessage(
      reopened
        ? `${deal.deal_number} reopened for bidding with its new closing time.`
        : `${deal.deal_number} closing time saved.`,
    );
  }
  const reps = useMemo(
      () => Array.from(new Set(deals.map((item) => item.owner_name))).sort(),
      [deals],
    ),
    vendors = useMemo(
      () => Array.from(new Set(deals.map((item) => item.vendor_name))).sort(),
      [deals],
    ),
    categories = useMemo(
      () => Array.from(new Set(deals.map(categoryFor))).sort(),
      [deals],
    );
  const filtered = useMemo(
    () =>
      deals
        .filter((deal) => {
          const categoryName = categoryFor(deal),
            statusGroup = groupFor(deal),
            activeStatus = [
              "want_to_buy",
              "open",
              "closing",
              "working",
              "pending",
            ].includes(statusGroup),
            haystack =
              `${deal.deal_number} ${deal.owner_name} ${deal.vendor_name} ${deal.title} ${deal.description} ${categoryName} ${deal.status} ${statusGroup}`.toLowerCase();
          return (
            (rep === "all" || deal.owner_name === rep) &&
            (vendor === "all" || deal.vendor_name === vendor) &&
            (category === "all" || categoryName === category) &&
            (status === "all" ||
              (status === "active" && activeStatus) ||
              statusGroup === status) &&
            haystack.includes(query.toLowerCase())
          );
        })
        .sort(
          (a, b) =>
            new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime(),
        ),
    [deals, query, rep, vendor, category, status],
  );
  const bidInfo = (deal: Deal) => {
    const allBids = bids
        .filter((item) => item.deal_number === deal.deal_number)
        .sort((a, b) => Number(b.total_bid) - Number(a.total_bid)),
      dealBids = allBids
        .filter((item) => item.status !== "lost")
        .sort((a, b) => Number(b.total_bid) - Number(a.total_bid)),
      top = dealBids[0],
      estimate = estimates.find((item) => item.deal_id === deal.id),
      proposed = Number(estimate?.proposed_amount || 0);
    return {
      top,
      bids: allBids,
      count: allBids.length,
      proposed,
      profit: top && proposed > 0 ? Number(top.total_bid) - proposed : null,
    };
  };
  const latestNote = (deal: Deal) =>
    comments
      .filter((item) => item.deal_id === deal.id)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
  const sections: { key: Group; title: string }[] = [
    { key: "open", title: "Open" },
    { key: "closing", title: "Closing Soon" },
    { key: "working", title: "Working" },
    { key: "pending", title: "Pending Fulfillment" },
    { key: "want_to_buy", title: "Want to Buy" },
    { key: "r2_processing", title: "R2 In Process" },
    { key: "no_bid", title: "No Bid" },
    { key: "lost", title: "Lost" },
    { key: "completed", title: "Fulfilled" },
    { key: "closed", title: "Closed (Legacy)" },
    { key: "archived", title: "Archived (Legacy)" },
  ];
  async function awardBid(bid: Bid) {
    if (
      !window.confirm(
        `Award ${bid.deal_number} to ${bid.company} for ${money.format(Number(bid.total_bid))}? All other bids on this deal will be marked Lost.`,
      )
    )
      return;
    setMessage(`Awarding ${bid.deal_number} to ${bid.company}…`);
    const response = await fetch("/api/admin/bids", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bidNumber: bid.internal_bid_number,
          status: "won",
        }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "The bid could not be awarded.");
      return;
    }
    setBids((current) =>
      current.map((item) =>
        item.deal_number !== bid.deal_number
          ? item
          : {
              ...item,
              status:
                item.internal_bid_number === bid.internal_bid_number
                  ? "won"
                  : "lost",
            },
      ),
    );
    setDeals((current) =>
      current.map((deal) =>
        deal.deal_number === bid.deal_number
          ? { ...deal, status: "pending" }
          : deal,
      ),
    );
    setBidHover(null);
    setMessage(
      `${bid.company} won ${bid.deal_number}. The deal moved to Pending Fulfillment.`,
    );
  }
  const clear = () => {
    setQuery("");
    setRep("all");
    setVendor("all");
    setCategory("all");
    setStatus("active");
  };
  if (loading)
    return (
      <main className="activeBidsPage">
        <p>Loading Deal Dashboard…</p>
      </main>
    );
  return (
    <main className="activeBidsPage">
      <header>
        <div>
          <p className="eyebrow">DEAL MANAGEMENT</p>
          <h1>Deal Dashboard</h1>
          <p>
            A consolidated view of every active bid, current offer and next
            deadline.
          </p>
        </div>
        <nav>
          <a href="/employee">Deal Workbook</a>
          <a href="/employee/deals">Manage Deals &amp; Awards</a>
        </nav>
      </header>
      <section className="activeBidFilters">
        <label>
          Search event or item
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Deal, vendor, description…"
          />
        </label>
        <label>
          Rep
          <select value={rep} onChange={(event) => setRep(event.target.value)}>
            <option value="all">All reps</option>
            {reps.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Vendor
          <select
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
          >
            <option value="all">All vendors</option>
            {vendors.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="active">Active statuses</option>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="closing">Closing Soon</option>
            <option value="working">Working</option>
            <option value="pending">Pending Fulfillment</option>
            <option value="no_bid">No Bid</option>
            <option value="lost">Lost</option>
            <option value="completed">Fulfilled</option>
            <option value="closed">Closed (Legacy)</option>
            <option value="archived">Archived (Legacy)</option>
          </select>
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={clear}>
          Clear filters
        </button>
      </section>
      {message && (
        <p className="activeBidNotice" role="alert">
          {message}
        </p>
      )}
      <div className="activeBidCounts">
        <span>
          <b>{filtered.length}</b> {status === "active" ? "active deals" : "deals"}
        </span>
        <span>
          <b>
            {filtered.filter((item) => groupFor(item) === "want_to_buy").length}
          </b>{" "}
          want to buy
        </span>
        <span>
          <b>
            {filtered.filter((item) => groupFor(item) === "closing").length}
          </b>{" "}
          closing soon
        </span>
        <span>
          <b>
            {filtered.filter((item) => groupFor(item) === "working").length}
          </b>{" "}
          working
        </span>
        <span>
          <b>
            {filtered.filter((item) => groupFor(item) === "pending").length}
          </b>{" "}
          pending fulfillment
        </span>
      </div>
      {sections.map((section) => {
        if(section.key==="r2_processing")return r2Deals.some(row=>row.status!=="completed")?<section className="activeBidSection r2InProcess" key={section.key}>
          <div className="activeBidSectionTitle"><h2>R2 In Process</h2><span>{r2Deals.filter(row=>row.status!=="completed").length}</span></div>
          <div className="r2SummaryRows">{r2Deals.filter(row=>row.status!=="completed").map(row=>{const equipment=r2Items.filter(item=>item.deal_id===row.id),complete=equipment.filter(item=>item.status==="complete").length;return <a key={row.id} href={`/employee/r2-processing?deal=${encodeURIComponent(row.id)}`}><b>{row.po_number}</b><span>{row.customer}</span><span>{row.location_status.replace("_"," ")}</span><span>{complete} of {equipment.length} completed</span><strong>{row.status.replaceAll("_"," ")}</strong></a>})}</div>
        </section>:null;
        const rows = filtered.filter((item) => groupFor(item) === section.key);
        if (!rows.length) return null;
        return (
          <section
            className={`activeBidSection ${section.key}`}
            key={section.key}
          >
            <div className="activeBidSectionTitle">
              <h2>{section.title}</h2>
              <span>{rows.length}</span>
            </div>
            <div className="activeBidTableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Type</th>
                    <th>Rep</th>
                    <th>Vendor</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Lines</th>
                    <th>Tabs</th>
                    <th>Due date</th>
                    <th>Due time</th>
                    <th>Comments / Notes</th>
                    <th>Bid count</th>
                    <th>Top bidder</th>
                    <th>Rep</th>
                    <th>Highest bid</th>
                    <th>Our offer</th>
                    <th>Projected profit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((deal) => {
                    const info = bidInfo(deal),
                      cat = categoryFor(deal),
                      note = latestNote(deal);
                    return (
                      <tr
                        className="activeBidClickableRow"
                        key={deal.id}
                        title={`Add an offer to ${deal.deal_number}`}
                        onClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              "a,button,input,select,textarea,label",
                            )
                          )
                            return;
                          window.location.assign(
                            `/employee/customer-bid?deal=${encodeURIComponent(deal.deal_number)}&from=summary`,
                          );
                        }}
                      >
                        <td>
                          <a
                            href={`/public-deal-desk/${deal.deal_number.toLowerCase()}?from=summary`}
                          >
                            {deal.deal_number}
                          </a>
                        </td>
                        <td>
                          {info.bids.find((bid) => bid.status === "won") ? (
                            <div className="activeBidOrderLinks">
                              <a
                                href={`/employee/reverse-offer?bid=${encodeURIComponent(info.bids.find((bid) => bid.status === "won")!.internal_bid_number)}&from=summary`}
                              >
                                PO
                              </a>
                              <a
                                href={`/employee/sales-order?bid=${encodeURIComponent(info.bids.find((bid) => bid.status === "won")!.internal_bid_number)}&from=summary`}
                              >
                                SO
                              </a>
                            </div>
                          ) : (
                            <a
                              className="activeBidOfferLink"
                              href={`/employee/customer-bid?deal=${encodeURIComponent(deal.deal_number)}&from=summary`}
                            >
                              {info.count ? "Add / edit offers" : "Add offer"}
                            </a>
                          )}
                        </td>
                        <td title={deal.owner_name}>
                          {deal.vendor_id ? (
                            <a
                              className="activeBidRecordLink"
                              href={businessRecordHref("vendors", deal.vendor_id)}
                              title={`Edit ${deal.vendor_name} vendor record`}
                            >
                              {repInitials(deal.owner_name)}
                            </a>
                          ) : repInitials(deal.owner_name)}
                        </td>
                        <td>{deal.vendor_name}</td>
                        <td title={deal.description}>
                          {deal.description ||
                            deal.title
                              .replace(/^\d[\d,]*-Piece\s+/i, "")
                              .replace(/\s+Lot$/i, "")}
                        </td>
                        <td>
                          <b className="activeBidCategory">{cat}</b>
                        </td>
                        <td>{Number(deal.quantity).toLocaleString()}</td>
                        <td>{Number(deal.line_count || deal.public_lines?.length || 1).toLocaleString()}</td>
                        <td>{Number(deal.tab_count || 1).toLocaleString()}</td>
                        <td>
                          <input
                            className="activeBidDateInput"
                            aria-label={`Closing date for ${deal.deal_number}`}
                            type="date"
                            value={
                              dateDrafts[deal.id] ??
                              closeParts(deal.closes_at).date
                            }
                            onChange={(event) =>
                              setDateDrafts((values) => ({
                                ...values,
                                [deal.id]: event.target.value,
                              }))
                            }
                            onBlur={(event) =>
                              void saveClosing(
                                deal,
                                event.target.value,
                                undefined,
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="activeBidTimeInput"
                            aria-label={`Closing time for ${deal.deal_number}`}
                            type="time"
                            value={
                              timeDrafts[deal.id] ??
                              closeParts(deal.closes_at).time
                            }
                            onChange={(event) =>
                              setTimeDrafts((values) => ({
                                ...values,
                                [deal.id]: event.target.value,
                              }))
                            }
                            onBlur={(event) =>
                              void saveClosing(
                                deal,
                                undefined,
                                event.target.value,
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="activeBidNoteInput"
                            aria-label={`Comment for ${deal.deal_number}`}
                            value={noteDrafts[deal.id] ?? note?.comment ?? ""}
                            onChange={(event) =>
                              setNoteDrafts((current) => ({
                                ...current,
                                [deal.id]: event.target.value,
                              }))
                            }
                            onBlur={(event) =>
                              void saveNote(deal, note, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter")
                                event.currentTarget.blur();
                            }}
                            placeholder="Add comment"
                          />
                        </td>
                        <td className="activeBidBidCount">
                          <button
                            type="button"
                            aria-label={`${info.count} bids for ${deal.deal_number}`}
                            onMouseEnter={(event) => {
                              cancelHoverClose();
                              const rect =
                                  event.currentTarget.getBoundingClientRect(),
                                width = 270,
                                left = Math.max(
                                  8,
                                  Math.min(
                                    rect.left + rect.width / 2 - width / 2,
                                    window.innerWidth - width - 8,
                                  ),
                                ),
                                estimatedHeight = Math.min(
                                  280,
                                  60 + info.count * 30,
                                ),
                                top =
                                  rect.bottom + 8 + estimatedHeight >
                                  window.innerHeight
                                    ? Math.max(
                                        8,
                                        rect.top - estimatedHeight - 8,
                                      )
                                    : rect.bottom + 8;
                              setBidHover({
                                dealNumber: deal.deal_number,
                                bids: info.bids,
                                left,
                                top,
                              });
                            }}
                            onMouseLeave={() => closeBidHover(120)}
                            onFocus={(event) => {
                              const rect =
                                  event.currentTarget.getBoundingClientRect(),
                                width = 270,
                                left = Math.max(
                                  8,
                                  Math.min(
                                    rect.left + rect.width / 2 - width / 2,
                                    window.innerWidth - width - 8,
                                  ),
                                );
                              setBidHover({
                                dealNumber: deal.deal_number,
                                bids: info.bids,
                                left,
                                top: rect.bottom + 8,
                              });
                            }}
                            onBlur={() => closeBidHover(120)}
                          >
                            {info.count}
                          </button>
                        </td>
                        <td>{info.top?.company || ""}</td>
                        <td>
                          {info.top?.customer_id ? (
                            <a
                              className="activeBidRecordLink"
                              href={businessRecordHref("customers", info.top.customer_id)}
                              title={`Edit ${info.top.company} customer record`}
                            >
                              {info.top.sales_owner_name
                                ? repInitials(info.top.sales_owner_name)
                                : "WEB"}
                            </a>
                          ) : ""}
                        </td>
                        <td>
                          {info.top
                            ? money.format(Number(info.top.total_bid))
                            : ""}
                        </td>
                        <td>
                          <div className="activeBidAmountInput">
                            <span>$</span>
                            <input
                              aria-label={`Our offer for ${deal.deal_number}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                amountDrafts[deal.id] ??
                                (info.proposed ? String(info.proposed) : "")
                              }
                              onChange={(event) =>
                                setAmountDrafts((current) => ({
                                  ...current,
                                  [deal.id]: event.target.value,
                                }))
                              }
                              onBlur={(event) =>
                                void saveAmount(deal, event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter")
                                  event.currentTarget.blur();
                              }}
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                        <td className="activeBidProfit">
                          {info.profit === null
                            ? ""
                            : money.format(info.profit)}
                        </td>
                        <td>
                          <select
                            className="activeBidStatusSelect"
                            value={deal.status}
                            aria-label={`Status for ${deal.deal_number}`}
                            onChange={(event) =>
                              void setDealStatus(
                                deal,
                                event.target.value as Deal["status"] | "won",
                              )
                            }
                          >
                            <option value="archived">Archived (legacy)</option>
                            <option value="closed">Closed (legacy)</option>
                            <option value="completed">Fulfilled</option>
                            <option value="lost">Lost</option>
                            <option value="no_bid">No Bid</option>
                            <option value="open">Open</option>
                            <option value="pending">Pending Fulfillment</option>
                            <option value="won">Won</option>
                            <option value="working">Working</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr>
                      <td className="activeBidEmpty" colSpan={19}>
                        No bids in this section.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {bidHover && (
        <aside
          className="activeBidHoverCard"
          style={{ left: bidHover.left, top: bidHover.top }}
          role="tooltip"
          onMouseEnter={cancelHoverClose}
          onMouseLeave={() => closeBidHover()}
        >
          <strong>{bidHover.dealNumber} bids</strong>
          {bidHover.bids.length ? (
            <ul>
              {bidHover.bids.map((bid) => (
                <li key={bid.internal_bid_number}>
                  <span>
                    {bid.company}
                    <small>
                      {bid.status === "won"
                        ? "Won"
                        : bid.status === "lost"
                          ? "Lost"
                          : "Pending"}
                      {` · ${bid.sales_owner_name ? repInitials(bid.sales_owner_name) : "WEB"}`}
                    </small>
                  </span>
                  <b>{money.format(Number(bid.total_bid))}</b>
                  <a href={`/employee/customer-bid?deal=${encodeURIComponent(bid.deal_number)}&bid=${encodeURIComponent(bid.internal_bid_number)}&from=summary`}>Edit</a>
                  {bid.status === "submitted" && (
                    <button type="button" onClick={() => void awardBid(bid)}>
                      Award
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No bids submitted yet.</p>
          )}
        </aside>
      )}
    </main>
  );
}
