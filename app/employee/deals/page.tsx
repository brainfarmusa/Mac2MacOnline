"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  clearPddSession,
  currentPddSession,
} from "../../../lib/pdd-auth";
import "./awards.css";
type Comment = {
  id: string;
  deal_id: string;
  deal_number: string;
  author_user_id: string;
  author_initials: string;
  author_name: string;
  comment: string;
  created_at: string;
  edited_at: string | null;
};
type DealStatus =
  | "open"
  | "working"
  | "pending"
  | "no_bid"
  | "lost"
  | "completed"
  | "closed"
  | "archived"
  | "won";
type PublicLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
};
type Deal = {
  id: string;
  deal_number: string;
  direction: "buying" | "selling";
  title: string;
  description: string;
  quantity: number;
  closes_at: string;
  location?: string;
  public_lines?: PublicLine[];
  status: DealStatus;
  published: boolean;
  created_by: string;
  owner_name: string;
  owner_email: string;
};
type Bid = {
  internal_bid_number: string;
  deal_number: string;
  company: string;
  contact_name: string;
  line_count: number;
  total_quantity: number;
  total_bid: number;
  status: "submitted" | "won" | "lost";
  submitted_at: string;
  entered_by_name?: string;
  entered_by_email?: string;
  uploaded_file_name?: string;
};
const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value),
  label = (value: string) =>
    ({
      submitted: "Pending",
      open: "Active",
      working: "Working",
      pending: "Pending Fulfillment",
      no_bid: "No Bid",
      lost: "Lost",
      completed: "Fulfilled",
      closed: "Closed",
      archived: "Archived",
      won: "Won",
    })[value] || value;
export default function DealManagement() {
  const [deals, setDeals] = useState<Deal[]>([]),
    [bids, setBids] = useState<Bid[]>([]),
    [comments, setComments] = useState<Comment[]>([]),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(() =>
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("search") || "",
    ),
    [scope, setScope] = useState<"all" | "mine">("all"),
    [currentUserId, setCurrentUserId] = useState(""),
    [currentUserEmail, setCurrentUserEmail] = useState(""),
    [currentUserRole, setCurrentUserRole] = useState("");
  const [token, setToken] = useState(""),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [posting, setPosting] = useState(""),
    [editingId, setEditingId] = useState(""),
    [editText, setEditText] = useState(""),
    [editingDealId, setEditingDealId] = useState(""),
    [editDealName, setEditDealName] = useState("");
  useEffect(() => {
    void (async () => {
      const session = await currentPddSession();
      if (!session) {
        window.location.replace("/employee-login?return_to=/employee/deals");
        return;
      }
      setToken(session.access_token);
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [dealResponse, bidResponse] = await Promise.all([
        fetch("/api/admin/deals", { headers }),
        fetch("/api/admin/bids", { headers }),
      ]);
      if (dealResponse.status === 401 || bidResponse.status === 401) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      const dealData = await dealResponse.json(),
        bidData = await bidResponse.json();
      setDeals(dealData.deals || []);
      setComments(dealData.comments || []);
      setCurrentUserId(dealData.currentUserId || "");
      setCurrentUserEmail(dealData.currentUserEmail || "");
      setCurrentUserRole(dealData.currentUserRole || "");
      setBids(bidData.bids || []);
      setLoading(false);
    })();
  }, []);
  const awardedDealNumbers = useMemo(
    () =>
      new Set(
        bids
          .filter((bid) => bid.status === "won")
          .map((bid) => bid.deal_number),
      ),
    [bids],
  );
  const visibleDeals = useMemo(
    () =>
      deals.filter(
        (deal) =>
          (scope === "all" ||
            deal.owner_email.toLowerCase() === currentUserEmail.toLowerCase()) &&
          (filter === "awarded"
            ? awardedDealNumbers.has(deal.deal_number)
            : filter === "want_to_buy"
              ? deal.direction === "buying"
            : filter === "all" || deal.status === filter) &&
          `${deal.deal_number} ${deal.title} ${deal.description} ${deal.owner_name} ${deal.owner_email}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [deals, filter, query, scope, currentUserEmail, awardedDealNumbers],
  );
  const visibleNumbers = useMemo(
    () => new Set(visibleDeals.map((deal) => deal.deal_number)),
    [visibleDeals],
  );
  const visibleBids = useMemo(
    () =>
      bids.filter(
        (bid) =>
          (scope === "all" || visibleNumbers.has(bid.deal_number)) &&
          (filter === "awarded"
            ? bid.status === "won"
            : filter === "all" ||
              filter === "bids" ||
              bid.status === filter ||
              (filter === "lost_bids" && bid.status === "lost")) &&
          `${bid.internal_bid_number} ${bid.deal_number} ${bid.company} ${bid.contact_name}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [bids, filter, query, scope, visibleNumbers],
  );
  async function setDealStatus(id: string, status: Deal["status"]) {
    setMessage("Saving deal status…");
    const response = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Could not update the deal.");
      return;
    }
    setDeals((current) =>
      current.map((deal) =>
        deal.id === id
          ? { ...deal, status, published: status !== "archived" }
          : deal,
      ),
    );
    setMessage("Deal status updated.");
  }
  async function deleteOpenDeal(deal: Deal) {
    if (
      !window.confirm(
        `Permanently delete open deal ${deal.deal_number}? This also removes its uploaded file, comments and customer bids. This cannot be undone.`,
      )
    )
      return;
    setMessage(`Deleting ${deal.deal_number}…`);
    const response = await fetch(
        `/api/admin/deals?deal=${encodeURIComponent(deal.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      ),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "The open deal could not be deleted.");
      return;
    }
    setDeals((current) => current.filter((item) => item.id !== deal.id));
    setComments((current) =>
      current.filter((item) => item.deal_id !== deal.id),
    );
    setBids((current) =>
      current.filter((item) => item.deal_number !== deal.deal_number),
    );
    setMessage(`Open deal ${deal.deal_number} deleted.`);
  }
  async function setBidStatus(bidNumber: string, status: Bid["status"]) {
    setMessage("Saving bid result…");
    const selected = bids.find((bid) => bid.internal_bid_number === bidNumber);
    const response = await fetch("/api/admin/bids", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bidNumber, status }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Could not update the bid.");
      return;
    }
    setBids((current) =>
      current.map((bid) =>
        status === "won" && selected && bid.deal_number === selected.deal_number
          ? {
              ...bid,
              status: bid.internal_bid_number === bidNumber ? "won" : "lost",
            }
          : bid.internal_bid_number === bidNumber
            ? { ...bid, status }
            : bid,
      ),
    );
    if (status === "won" && selected)
      setDeals((current) =>
        current.map((deal) =>
          deal.deal_number === selected.deal_number
            ? { ...deal, status: "pending", published: false }
            : deal,
        ),
      );
    setMessage(
      status === "won"
        ? "Bid awarded. Other bids were marked Lost and the deal moved to Pending Fulfillment."
        : "Bid result updated.",
    );
  }
  async function deleteAwardedBid(bid: Bid) {
    if (
      !window.confirm(
        `Permanently delete awarded bid ${bid.internal_bid_number} from ${bid.company}? This cannot be undone.`,
      )
    )
      return;
    setMessage(`Deleting ${bid.internal_bid_number}…`);
    const response = await fetch(
        `/api/admin/bids?bid=${encodeURIComponent(bid.internal_bid_number)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      ),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "The awarded bid could not be deleted.");
      return;
    }
    setBids((current) =>
      current.filter(
        (item) => item.internal_bid_number !== bid.internal_bid_number,
      ),
    );
    setMessage(`Awarded bid ${bid.internal_bid_number} deleted.`);
  }
  async function saveDealName(deal: Deal) {
    const dealName = editDealName.trim();
    if (!dealName) return;
    setMessage("Saving deal name…");
    const response = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: deal.id, dealName }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Could not update the deal name.");
      return;
    }
    setDeals((current) =>
      current.map((item) =>
        item.id === deal.id ? { ...item, title: data.deal.title } : item,
      ),
    );
    setEditingDealId("");
    setEditDealName("");
    setMessage("Deal name updated across the live listing and source deal.");
  }
  async function addComment(event: FormEvent, deal: Deal) {
    event.preventDefault();
    const comment = (drafts[deal.id] || "").trim();
    if (!comment) return;
    setPosting(deal.id);
    const response = await fetch("/api/admin/deals", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dealId: deal.id,
          dealNumber: deal.deal_number,
          comment,
        }),
      }),
      data = await response.json();
    setPosting("");
    if (!response.ok) {
      setMessage(data.error || "Comment could not be saved.");
      return;
    }
    setComments((current) => [
      ...current,
      { ...data.comment, edited_at: null },
    ]);
    setDrafts((current) => ({ ...current, [deal.id]: "" }));
    setMessage("Comment added.");
  }
  async function saveComment(id: string) {
    const comment = editText.trim();
    if (!comment) return;
    setPosting(id);
    const response = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ commentId: id, comment }),
      }),
      data = await response.json();
    setPosting("");
    if (!response.ok) {
      setMessage(data.error || "Comment could not be updated.");
      return;
    }
    setComments((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              comment: data.comment.comment,
              edited_at: data.comment.edited_at,
            }
          : item,
      ),
    );
    setEditingId("");
    setEditText("");
    setMessage("Comment updated.");
  }
  async function deleteComment(id: string) {
    if (!window.confirm("Delete this comment?")) return;
    const response = await fetch(
        `/api/admin/deals?comment=${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      ),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Comment could not be deleted.");
      return;
    }
    setComments((current) => current.filter((item) => item.id !== id));
    setMessage("Comment deleted.");
  }
  const open = deals.filter((deal) => deal.status === "open").length,
    working = deals.filter((deal) => deal.status === "working").length,
    pendingDeals = deals.filter((deal) => deal.status === "pending").length,
    wantToBuy = deals.filter((deal) => deal.direction === "buying").length,
    awarded = bids.filter((bid) => bid.status === "won").length;
  return (
    <main className="dealManagePage">
      <header>
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h1>Deal management</h1>
          <p>
            Every approved employee can review every deal, share comments,
            compare customer bids and manage awards.
          </p>
        </div>
        <nav>
          <a href="/employee">← Dashboard</a>
          <a href="/employee/active-bids">Deal Workbook</a>
          <a href="/public-deal-desk/deal-builder?new=1&amp;award=single">
            Create New Deal
          </a>
          <a href="/public-deal-desk/deal-builder?new=1&amp;award=multiple">
            Create Multi-Tab/Lot Deal
          </a>
        </nav>
      </header>
      <section className="dealManageStats">
        <article>
          <span>Active deals</span>
          <strong>{open}</strong>
        </article>
        <article>
          <span>Want to Buy</span>
          <strong>{wantToBuy}</strong>
        </article>
        <article>
          <span>Working</span>
          <strong>{working}</strong>
        </article>
        <article>
          <span>Pending completion</span>
          <strong>{pendingDeals}</strong>
        </article>
        <article>
          <span>Awarded bids</span>
          <strong>{awarded}</strong>
        </article>
      </section>
      <div className="dealScopeTabs" role="tablist" aria-label="Deal ownership">
        <button
          className={scope === "all" ? "active" : ""}
          onClick={() => setScope("all")}
        >
          All Deals <span>{deals.length}</span>
        </button>
        <button
          className={scope === "mine" ? "active" : ""}
          onClick={() => setScope("mine")}
        >
          My Deals{" "}
          <span>
            {
              deals.filter(
                (deal) =>
                  deal.owner_email.toLowerCase() ===
                  currentUserEmail.toLowerCase(),
              ).length
            }
          </span>
        </button>
      </div>
      <div
        className="dealLifecycleTabs"
        role="tablist"
        aria-label="Deal lifecycle"
      >
        {[
          ["all", "All"],
          ["want_to_buy", "Want to Buy"],
          ["open", "Active"],
          ["working", "Working"],
          ["pending", "Pending"],
          ["no_bid", "No Bid"],
          ["lost", "Lost"],
          ["completed", "Fulfilled"],
          ["awarded", "Awarded"],
        ].map(([value, title]) => (
          <button
            type="button"
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
            key={value}
          >
            {title}
            <span>
              {value === "all"
                ? deals.length
                : value === "want_to_buy"
                  ? wantToBuy
                : value === "awarded"
                  ? awarded
                  : deals.filter((deal) => deal.status === value).length}
            </span>
          </button>
        ))}
      </div>
      <section className="dealManageTools">
        <label>
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Deal, bid number, company, owner or item"
          />
        </label>
        <label>
          Show
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Everything</option>
            <option value="open">Active deals</option>
            <option value="completed">Fulfilled</option>
            <option value="lost">Lost archive</option>
            <option value="lost_bids">Lost customer bids</option>
            <option value="no_bid">No Bid archive</option>
            <option value="pending">Pending completion</option>
            <option value="submitted">Pending customer bids</option>
            <option value="won">Winning customer bids</option>
            <option value="working">Working</option>
            <option value="want_to_buy">Want to Buy</option>
          </select>
        </label>
      </section>
      {message && (
        <p className="dealManageNotice" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <p>Loading deal activity…</p>
      ) : (
        <>
          <section className="dealManageSection">
            <div className="dealManageHeading">
              <div>
                <p className="eyebrow">PUBLISHED DEALS</p>
                <h2>{scope === "mine" ? "My deals" : "All employee deals"}</h2>
              </div>
              <span>{visibleDeals.length} shown</span>
            </div>
            <div className="dealManageList">
              {visibleDeals.map((deal) => {
                const thread = comments.filter(
                  (item) => item.deal_id === deal.id,
                );
                return (
                  <article className="dealManageRow" key={deal.id}>
                    <div className="dealManageRowTop">
                      <div
                        className={`dealManageIdentity${editingDealId === deal.id ? " editingName" : ""}`}
                      >
                        <span>
                          {deal.deal_number} · OWNER: {deal.owner_name}
                          {deal.owner_email.toLowerCase() ===
                          currentUserEmail.toLowerCase()
                            ? " · MY DEAL"
                            : ""}
                          {deal.direction === "buying" && (
                            <b className="dealDirectionBadge">WTB</b>
                          )}
                        </span>
                        {editingDealId === deal.id ? (
                          <div className="dealNameEditor">
                            <input
                              maxLength={100}
                              value={editDealName}
                              onChange={(event) =>
                                setEditDealName(event.target.value)
                              }
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => saveDealName(deal)}
                              disabled={!editDealName.trim()}
                            >
                              Save name
                            </button>
                            <button
                              type="button"
                              className="cancelDealName"
                              onClick={() => {
                                setEditingDealId("");
                                setEditDealName("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <h3>{deal.title}</h3>
                            <button
                              type="button"
                              className="editDealName"
                              onClick={() => {
                                setEditingDealId(deal.id);
                                setEditDealName(
                                  deal.title
                                    .replace(/^.*?-Piece\s+/i, "")
                                    .replace(/\s+Lot$/i, ""),
                                );
                              }}
                            >
                              Edit deal name
                            </button>
                          </>
                        )}
                        <p>
                          {deal.quantity.toLocaleString()} units · Closes{" "}
                          {new Date(deal.closes_at).toLocaleString()}
                        </p>
                      </div>
                      <b className={`manageStatus ${deal.status}`}>
                        {label(deal.status)}
                      </b>
                      <div className="manageActions">
                        <a
                          href={`/public-deal-desk/${deal.deal_number.toLowerCase()}`}
                        >
                          View
                        </a>
                        {(currentUserRole === "administrator" ||
                          deal.created_by === currentUserId ||
                          deal.owner_email.toLowerCase() ===
                            currentUserEmail.toLowerCase()) && (
                          <a
                            className="editFullDealButton"
                            href={`/public-deal-desk/deal-builder?edit=${encodeURIComponent(deal.deal_number)}`}
                          >
                            Edit
                          </a>
                        )}
                        <select
                          aria-label={`Status for ${deal.deal_number}`}
                          value={deal.status}
                          onChange={(event) =>
                            setDealStatus(
                              deal.id,
                              event.target.value as Deal["status"],
                            )
                          }
                        >
                          <option value="open">Active</option>
                          <option value="archived">Archived (legacy)</option>
                          <option value="closed">Closed (legacy)</option>
                          <option value="completed">Fulfilled</option>
                          <option value="lost">Lost</option>
                          <option value="no_bid">No Bid</option>
                          <option value="pending">Pending Fulfillment</option>
                          <option value="won">Won</option>
                          <option value="working">Working</option>
                        </select>
                        {(currentUserRole === "administrator" ||
                          deal.created_by === currentUserId ||
                          deal.owner_email.toLowerCase() ===
                            currentUserEmail.toLowerCase()) &&
                          deal.status === "open" && (
                            <button
                              type="button"
                              className="deleteOpenDealButton"
                              onClick={() => deleteOpenDeal(deal)}
                            >
                              Delete
                            </button>
                          )}
                      </div>
                    </div>
                    <div className="dealComments">
                      <div className="commentThread">
                        {thread.map((item) => (
                          <div
                            className={`dealComment ${editingId === item.id ? "editing" : ""}`}
                            key={item.id}
                          >
                            <b title={item.author_name}>
                              {item.author_name === "Darrell"
                                ? "DP"
                                : item.author_initials.toUpperCase()}
                            </b>
                            {editingId === item.id ? (
                              <div className="commentEditor">
                                <textarea
                                  rows={2}
                                  maxLength={1000}
                                  value={editText}
                                  onChange={(event) =>
                                    setEditText(event.target.value)
                                  }
                                />
                                <div>
                                  <button
                                    type="button"
                                    disabled={
                                      posting === item.id || !editText.trim()
                                    }
                                    onClick={() => saveComment(item.id)}
                                  >
                                    {posting === item.id ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    className="cancelEdit"
                                    type="button"
                                    onClick={() => {
                                      setEditingId("");
                                      setEditText("");
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p>
                                {item.comment}
                                {item.edited_at && <small>Edited</small>}
                              </p>
                            )}
                            <time>
                              {new Date(item.created_at).toLocaleString()}
                            </time>
                            {editingId !== item.id && (
                                <button
                                  className="editComment"
                                  type="button"
                                  onClick={() => {
                                    setEditingId(item.id);
                                    setEditText(item.comment);
                                  }}
                                >
                                  Edit
                                </button>
                            )}
                            {(item.author_user_id === currentUserId ||
                              currentUserRole === "administrator") &&
                              editingId !== item.id && (
                                <button
                                  className="deleteComment"
                                  type="button"
                                  onClick={() => deleteComment(item.id)}
                                >
                                  Delete
                                </button>
                              )}
                          </div>
                        ))}
                        {!thread.length && (
                          <p className="noComments">No comments yet.</p>
                        )}
                      </div>
                      <form onSubmit={(event) => addComment(event, deal)}>
                        <label htmlFor={`comment-${deal.id}`}>
                          Add a comment
                        </label>
                        <div>
                          <textarea
                            id={`comment-${deal.id}`}
                            rows={2}
                            maxLength={1000}
                            value={drafts[deal.id] || ""}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [deal.id]: event.target.value,
                              }))
                            }
                            placeholder="Add an update or note for everyone…"
                          />
                          <button
                            disabled={
                              posting === deal.id ||
                              !(drafts[deal.id] || "").trim()
                            }
                          >
                            {posting === deal.id ? "Adding…" : "Comment"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </article>
                );
              })}
              {!visibleDeals.length && (
                <div className="dealManageEmpty">No deals match this view.</div>
              )}
            </div>
          </section>
          <section className="dealManageSection">
            <div className="dealManageHeading">
              <div>
                <p className="eyebrow">CUSTOMER OFFERS</p>
                <h2>Bids and awards</h2>
              </div>
              <span>{visibleBids.length} shown</span>
            </div>
            <div className="dealManageList">
              {visibleBids.map((bid) => (
                <article key={bid.internal_bid_number}>
                  <div className="dealManageIdentity">
                    <span>
                      {bid.deal_number} · {bid.internal_bid_number}
                    </span>
                    <h3>{bid.company}</h3>
                    <p>
                      {bid.contact_name} ·{" "}
                      {bid.line_count === 0
                        ? "Take-All Offer"
                        : `${bid.line_count} lines`}{" "}
                      · {bid.total_quantity.toLocaleString()} units
                    </p>
                    {bid.entered_by_name && (
                      <p>
                        <b>Entered for customer by {bid.entered_by_name}</b>
                        {bid.uploaded_file_name
                          ? ` · ${bid.uploaded_file_name}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <strong className="manageBidTotal">
                    {money(Number(bid.total_bid))}
                  </strong>
                  <b className={`manageStatus ${bid.status}`}>
                    {label(bid.status)}
                  </b>
                  <div className="manageActions">
                    <a
                      href={`/employee/reverse-offer?bid=${encodeURIComponent(bid.internal_bid_number)}`}
                    >
                      Review
                    </a>
                    {bid.status === "won" && (
                      <>
                        <a
                          href={`/employee/reverse-offer?bid=${encodeURIComponent(bid.internal_bid_number)}`}
                        >
                          Create PO
                        </a>
                        <a
                          href={`/employee/sales-order?bid=${encodeURIComponent(bid.internal_bid_number)}`}
                        >
                          Create Sales Order
                        </a>
                      </>
                    )}
                    <select
                      aria-label={`Result for ${bid.internal_bid_number}`}
                      value={bid.status}
                      onChange={(event) =>
                        setBidStatus(
                          bid.internal_bid_number,
                          event.target.value as Bid["status"],
                        )
                      }
                    >
                      <option value="lost">Lost</option>
                      <option value="submitted">Pending</option>
                      <option value="won">Won</option>
                    </select>
                    {currentUserRole === "administrator" &&
                      bid.status === "won" && (
                        <button
                          type="button"
                          className="deleteAwardButton"
                          onClick={() => deleteAwardedBid(bid)}
                        >
                          Delete
                        </button>
                      )}
                  </div>
                </article>
              ))}
              {!visibleBids.length && (
                <div className="dealManageEmpty">
                  No customer bids match this view.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
