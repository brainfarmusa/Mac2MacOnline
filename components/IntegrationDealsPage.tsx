"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearPddSession,
  currentPddSession,
  pddSupabaseKey,
  pddSupabaseUrl,
} from "../lib/pdd-auth";
import { Shell } from "./SiteShell";

type Deal = {
  id: string;
  deal_number: string;
  title: string;
  description: string;
  quantity: number;
  closes_at: string;
  location?: string;
  status: string;
  owner_name: string;
  direction: "buying" | "selling";
  public_lines?: {
    line: number;
    quantity: number;
    values: Record<string, string>;
  }[];
};
type TbsDraft = {
  eventId: string;
  broadcastList: string;
  broadcastType: string;
  quantity: string;
  brand: string;
  description: string;
  condition: string;
  productLink: string;
  price: string;
  currency: string;
  additionalMessage: string;
};

export function IntegrationDealsPage({
  channel,
}: {
  channel: "BrokerBin" | "Facebook" | "LinkedIn" | "TBS" | "TradeLoop";
}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [postingDeal, setPostingDeal] = useState("");
  const [tbsDraft, setTbsDraft] = useState<TbsDraft | null>(null);
  const [tbsNotice, setTbsNotice] = useState("");
  const tbsWindowRef = useRef<Window | null>(null);
  const route = channel.toLowerCase();

  useEffect(() => {
    void (async () => {
      const session = await currentPddSession();
      if (!session) {
        window.location.replace(
          `/employee-login?return_to=/employee/integrations/${route}`,
        );
        return;
      }
      const response = await fetch("/api/admin/deals", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.status === 401) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Active deals could not be loaded.");
        setLoading(false);
        return;
      }
      setDeals(data.deals || []);
      setToken(session.access_token);
      setCurrentUserRole(data.currentUserRole || "");
      setLoading(false);
    })();
  }, [route]);

  const activeDeals = useMemo(
    () =>
      deals
        .filter((deal) => deal.status === "open")
        .sort(
          (a, b) =>
            new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime(),
        ),
    [deals],
  );
  const favicon = {
    BrokerBin: "https://brokerbin.com/favicon.ico",
    Facebook: "https://www.facebook.com/favicon.ico",
    LinkedIn: "https://www.linkedin.com/favicon.ico",
    TBS: "https://www.thebrokersite.com/favicon.png",
    TradeLoop: "https://www.tradeloop.com/favicon.ico",
  }[channel];

  function publicLink(deal: Deal) {
    return `https://mac2maconline.com/public-deal-desk/${deal.deal_number.toLowerCase()}`;
  }

  function listingText(deal: Deal) {
    return [
      `${deal.direction === "buying" ? "WTB" : "WTS"}: ${deal.title}`,
      deal.description?.trim(),
      `${Number(deal.quantity || 0).toLocaleString()} units`,
      `Location: ${deal.location || "Chico, California, USA"}`,
      `Closes: ${new Date(deal.closes_at).toLocaleString()}`,
      publicLink(deal),
    ].filter(Boolean).join("\n\n");
  }

  function tbsCategory(deal: Deal) {
    const text = `${deal.title} ${deal.description} ${(deal.public_lines || [])
      .flatMap((line) => Object.values(line.values || {}))
      .join(" ")}`.toUpperCase();
    if (/MACBOOK|LAPTOP|NOTEBOOK|CHROMEBOOK/.test(text)) return "Laptop Broadcasts";
    if (/IPAD|TABLET/.test(text)) return "Tablet Broadcasts";
    if (/IPHONE|SMARTPHONE|\bPHONE/.test(text)) return "Mobile Broadcasts";
    if (/SERVER|STORAGE|\bSSD|\bHDD|HARD DRIVE/.test(text)) return "Server/Storage Broadcasts";
    if (/NETWORK|SWITCH|ROUTER|TELECOM/.test(text)) return "Networking/Telecom Broadcasts";
    if (/MONITOR|DISPLAY/.test(text)) return "Monitor Broadcasts";
    if (/DESKTOP|WORKSTATION|MINI PC|IMAC|MAC PRO|MAC MINI/.test(text)) return "PC Broadcasts";
    return "Components Broadcasts";
  }

  function tbsPayload(deal: Deal) {
    const lines = deal.public_lines || [];
    const lineItems = lines.map((line) => {
      const detail = Object.entries(line.values || {})
        .filter(([, value]) => String(value || "").trim())
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");
      return `${line.quantity} x ${detail || `Line ${line.line}`}`;
    });
    const brands = Array.from(
      new Set(
        lines.flatMap((line) =>
          Object.entries(line.values || {})
            .filter(
              ([key, value]) =>
                /brand|manufacturer|mfg|make/i.test(key) &&
                String(value || "").trim(),
            )
            .map(([, value]) => String(value).trim()),
        ),
      ),
    );
    const link = publicLink(deal);
    const fullMessage = [
      deal.description?.trim(),
      `Location: ${deal.location?.trim() || "Chico, California, USA"}`,
      lineItems.length ? lineItems.join("\n") : "",
      `Full deal: ${link}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    return {
      eventId: deal.deal_number,
      broadcastList: tbsCategory(deal),
      broadcastType: "WTS (Want to Sell)",
      quantity: String(deal.quantity),
      brand: brands.length === 1 ? brands[0] : "Mixed",
      description: deal.title
        .replace(/^\d[\d,]*-Piece\s+/i, "")
        .replace(/\s+Lot$/i, "")
        .slice(0, 120),
      condition: "Grade B",
      productLink: link,
      price: "BEST OFFER",
      currency: "USD",
      additionalMessage:
        fullMessage.length > 1800
          ? `${fullMessage.slice(0, 1700)}\n\nFull item list: ${link}`
          : fullMessage,
    };
  }

  async function copyListing(deal: Deal) {
    try {
      await navigator.clipboard.writeText(listingText(deal));
    } catch {
      setMessage("The browser blocked copying. Open the deal and copy the details manually.");
    }
  }

  function tbsText(draft: TbsDraft) {
    return [
      `WTS: ${draft.quantity} x ${draft.brand} ${draft.description}`,
      `Price: ${draft.price} ${draft.currency}`,
      draft.productLink,
      draft.additionalMessage,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async function copyTbs() {
    if (!tbsDraft) return;
    try {
      await navigator.clipboard.writeText(tbsText(tbsDraft));
      setTbsNotice("TBS listing copied. Paste it into the TBS WTS form.");
    } catch {
      setTbsNotice(
        "Copy was blocked by the browser. Select the description and copy it manually.",
      );
    }
  }

  async function openTbs() {
    if (!tbsDraft) return;
    const relayUrl = `https://script.google.com/macros/s/AKfycbwCxJITVDxlVSplAhiL0HNDimymOEGqXLhL07cKlmhbXTTUpRHJ0Rw_HFcSbPUCp4xoEA/exec?tbs=${encodeURIComponent(JSON.stringify(tbsDraft))}`;
    let opened = tbsWindowRef.current;
    try {
      if (!opened || opened.closed) {
        opened = window.open(relayUrl, "_blank");
        tbsWindowRef.current = opened;
      } else {
        opened.location.href = relayUrl;
        opened.focus();
      }
    } catch {
      opened = null;
    }
    if (opened) {
      setTbsNotice(
        "The listing opened in M2M’s TBS tab. If TBS asks you to sign in, sign in there, return to M2M and click this button again.",
      );
    } else {
      await copyTbs();
      setTbsNotice(
        "Your browser blocked the new tab. Allow popups for M2M and try again; the listing was also copied for manual entry.",
      );
    }
  }

  async function postFacebook(deal: Deal) {
    if (!token || currentUserRole !== "administrator") return;
    if (!window.confirm(`Publish ${deal.deal_number} to the Mac2MacOnline Facebook Page now?`)) return;
    setPostingDeal(deal.id);
    setMessage("");
    const link = publicLink(deal);
    let photoUrl = "";
    try {
      const photoResponse = await fetch(`/api/deal-photos?deal=${encodeURIComponent(deal.deal_number)}`);
      const photoData = await photoResponse.json() as { photos?: { url: string }[] };
      if (photoData.photos?.[0]?.url) photoUrl = new URL(photoData.photos[0].url, window.location.origin).href;
      const response = await fetch(`${pddSupabaseUrl}/functions/v1/post-facebook-deal`, {
        method: "POST",
        headers: {
          apikey: pddSupabaseKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dealNumber: deal.deal_number, message: listingText(deal), link, photoUrl }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Facebook rejected the post.");
      setMessage(`Posted ${deal.deal_number} to Facebook successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Facebook post failed.");
    } finally {
      setPostingDeal("");
    }
  }

  async function postDeal(deal: Deal) {
    if (channel === "Facebook") return postFacebook(deal);
    if (channel === "LinkedIn") {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicLink(deal))}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (channel === "TBS") {
      setTbsNotice("");
      setTbsDraft(tbsPayload(deal));
      return;
    } else if (channel === "TradeLoop") {
      window.open("https://www.tradeloop.com/home", "_blank", "noopener,noreferrer");
    } else {
      window.open("https://members.brokerbin.com/", "_blank", "noopener,noreferrer");
    }
    await copyListing(deal);
    setMessage(`${deal.deal_number} was copied and ${channel} was opened for posting.`);
  }

  return (
    <Shell>
      <main className="employeeDashboard integrationDealsPage">
        <header>
          <div>
            <p className="eyebrow">M2M DEAL WORKBOOK · INTEGRATIONS</p>
            <h1>{channel} active deals</h1>
            <p>
              A focused summary of active inventory available for {channel}{" "}
              posting.
            </p>
          </div>
          <a className="button secondary" href="/employee">
            Back to workbook
          </a>
        </header>

        <section className="integrationDealSummary">
          <div className="integrationSummaryHeader">
            <div>
              <span>ACTIVE DEALS</span>
              <h2>{loading ? "Loading…" : `${activeDeals.length} available`}</h2>
            </div>
            <p>Ordered by closing time</p>
          </div>

          {message && <p className="integrationEmpty">{message}</p>}
          {!loading && !message && activeDeals.length === 0 && (
            <p className="integrationEmpty">There are no active deals right now.</p>
          )}

          <div className="integrationDealTable">
            <table>
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Rep</th>
                  <th>Location</th>
                  <th>Closes</th>
                  <th>Status</th>
                  <th>Post</th>
                </tr>
              </thead>
              <tbody>
                {activeDeals.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      <a
                        href={`/public-deal-desk/${deal.deal_number.toLowerCase()}`}
                      >
                        {deal.deal_number}
                      </a>
                    </td>
                    <td title={deal.description}>{deal.title}</td>
                    <td>{Number(deal.quantity || 0).toLocaleString()}</td>
                    <td>{deal.owner_name || "Unassigned"}</td>
                    <td>{deal.location || "Not listed"}</td>
                    <td>{new Date(deal.closes_at).toLocaleString()}</td>
                    <td><b className="integrationActiveStatus">Active</b></td>
                    <td className="integrationPostCell">
                      {channel !== "Facebook" || currentUserRole === "administrator" ? (
                        <button
                          className={`integrationPostButton ${route}`}
                          type="button"
                          disabled={postingDeal === deal.id}
                          onClick={() => void postDeal(deal)}
                        >
                          <img src={favicon} alt="" aria-hidden="true" />
                          <span>{postingDeal === deal.id ? "Posting…" : `Post to ${channel}`}</span>
                        </button>
                      ) : (
                        <span className="integrationAdminOnly">Admin only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {tbsDraft && (
          <div
            className="tbsModalBackdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setTbsDraft(null);
            }}
          >
            <section
              className="tbsModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="integration-tbs-title"
            >
              <header>
                <div>
                  <p className="eyebrow">THE BROKER SITE</p>
                  <h2 id="integration-tbs-title">
                    Post {tbsDraft.eventId} as WTS
                  </h2>
                  <p>Review the fields below before opening TBS.</p>
                </div>
                <button
                  type="button"
                  aria-label="Close TBS listing"
                  onClick={() => setTbsDraft(null)}
                >
                  ×
                </button>
              </header>
              <label>
                Quantity
                <input
                  value={tbsDraft.quantity}
                  onChange={(event) =>
                    setTbsDraft((current) =>
                      current ? { ...current, quantity: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Brand
                <input
                  value={tbsDraft.brand}
                  onChange={(event) =>
                    setTbsDraft((current) =>
                      current ? { ...current, brand: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Description / part number
                <input
                  value={tbsDraft.description}
                  maxLength={120}
                  onChange={(event) =>
                    setTbsDraft((current) =>
                      current ? { ...current, description: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Product link
                <input
                  value={tbsDraft.productLink}
                  onChange={(event) =>
                    setTbsDraft((current) =>
                      current ? { ...current, productLink: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Currency
                <select
                  value={tbsDraft.currency}
                  onChange={(event) =>
                    setTbsDraft((current) =>
                      current ? { ...current, currency: event.target.value } : current,
                    )
                  }
                >
                  <option value="USD">US Dollar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="GBP">British Pound (GBP)</option>
                </select>
              </label>
              <label>
                Additional message
                <textarea
                  rows={15}
                  value={tbsDraft.additionalMessage}
                  onChange={(event) =>
                    setTbsDraft((current) =>
                      current
                        ? { ...current, additionalMessage: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              {tbsNotice && (
                <p className="tbsNotice" role="status">
                  {tbsNotice}
                </p>
              )}
              <footer>
                <button
                  type="button"
                  className="tbsSecondary"
                  onClick={() => setTbsDraft(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="tbsSecondary"
                  onClick={() => void copyTbs()}
                >
                  Copy listing
                </button>
                <button
                  type="button"
                  className="tbsPrimary"
                  onClick={() => void openTbs()}
                >
                  Open &amp; Autofill TBS
                </button>
              </footer>
            </section>
          </div>
        )}
      </main>
    </Shell>
  );
}
