"use client";

import {
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Shell } from "@/components/SiteShell";
import { detectProductCategory } from "@/lib/productCategory";
import { dealSpreadsheetFilename } from "@/lib/dealFilename";
import {
  downloadBidSpreadsheet,
  readBidSpreadsheet,
} from "@/lib/bidSpreadsheet";
import { currentCustomerSession } from "@/lib/customer-auth";
import type { PddSession } from "@/lib/pdd-auth";
import DealSellForm from "@/components/DealSellForm";
import DealViewerPresence from "@/components/DealViewerPresence";
import {
  groupBidLinesByBox,
  isMultipleAwardDeal,
} from "@/lib/boxBidGroups";
import "../line-bid.css";
import "../line-bid-download.css";
import "../line-item-totals.css";
import "../bidder-fields.css";
import "../bidder-tighter.css";
import "../guest-buttons.css";

type PublicLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
  award_mode?: "single" | "multiple";
};
type Deal = {
  deal_number: string;
  direction: "buying" | "selling";
  category: string;
  title: string;
  description: string;
  quantity: number;
  closes_at: string;
  location: string;
  public_lines: PublicLine[];
  spreadsheet_filename: string;
};
type BidEntry = { unitBid: string; comments: string };
type DealPhoto = { id: string; filename: string; url: string };
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function DynamicLineItemBid() {
  const autoDownloaded = useRef(false);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealPhotos, setDealPhotos] = useState<DealPhoto[]>([]);
  const [entries, setEntries] = useState<Record<number, BidEntry>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bidMode, setBidMode] = useState<"line_item" | "take_all">("line_item");
  const [takeAllAmount, setTakeAllAmount] = useState("");
  const [confirmation, setConfirmation] = useState<{
    number: string;
    lines: number;
    boxes: number;
    total: number;
    offerType: "line_item" | "take_all";
  } | null>(null);
  const [customerSession, setCustomerSession] = useState<PddSession | null>(
    null,
  );
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [editProfile, setEditProfile] = useState(false);
  const [sellPage, setSellPage] = useState(false);
  const [fromSummary, setFromSummary] = useState(false);
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setSellPage(search.get("sell") === "1");
    setFromSummary(search.get("from") === "summary");
    const dealNumber = decodeURIComponent(
      window.location.pathname.split("/").filter(Boolean).pop() || "",
    ).toUpperCase();
    fetch(`/api/deals/${encodeURIComponent(dealNumber)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "This deal could not be opened.");
        setDeal(data.deal);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "This deal could not be opened.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!deal) return;
    void fetch(`/api/deal-photos?deal=${encodeURIComponent(deal.deal_number)}`)
      .then((response) => (response.ok ? response.json() : { photos: [] }))
      .then((data) => setDealPhotos(data.photos || []));
  }, [deal?.deal_number]);
  useEffect(() => {
    (async () => {
      const session = await currentCustomerSession();
      if (!session) return;
      setCustomerSession(session);
      let local: Record<string, string> = {};
      try {
        local = JSON.parse(
          localStorage.getItem("m2m-pdd-customer-profile") || "{}",
        ) as Record<string, string>;
        if (Object.keys(local).length) setProfile(local);
      } catch {}
      const response = await fetch("/api/customer/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const remote = (data.profile || {}) as Record<string, string>;
        const merged = {
          ...local,
          ...Object.fromEntries(
            Object.entries(remote).filter(([, value]) => Boolean(value)),
          ),
        };
        setProfile(merged);
        if (Object.keys(merged).length)
          localStorage.setItem(
            "m2m-pdd-customer-profile",
            JSON.stringify(merged),
          );
      }
    })();
  }, []);
  const lines = deal?.public_lines || [];
  const headers = useMemo(
    () => [...new Set(lines.flatMap((line) => Object.keys(line.values)))],
    [lines],
  );
  const multipleAwards = isMultipleAwardDeal(lines);
  const boxGroups = useMemo(
    () => (multipleAwards ? groupBidLinesByBox(lines) : []),
    [lines, multipleAwards],
  );
  const lots = useMemo(() => {
    const grouped = new Map<string, number[]>();
    lines.forEach((line, index) => {
      const name = line.values["Source Tab"] || "All Items";
      grouped.set(name, [...(grouped.get(name) || []), index]);
    });
    return [...grouped.entries()];
  }, [lines]);
  const selected = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index, entry: entries[index] }))
        .filter((item) => Number(item.entry?.unitBid) > 0),
    [lines, entries],
  );
  const boxBidSummaries = useMemo(
    () =>
      boxGroups.map((group) => {
        const pricedIndexes = group.indexes.filter(
          (index) => Number(entries[index]?.unitBid) > 0,
        );
        return {
          ...group,
          pricedCount: pricedIndexes.length,
          started: pricedIndexes.length > 0,
          complete:
            pricedIndexes.length > 0 &&
            pricedIndexes.length === group.indexes.length,
          amount: pricedIndexes.reduce(
            (sum, index) =>
              sum + lines[index].quantity * Number(entries[index]?.unitBid),
            0,
          ),
        };
      }),
    [boxGroups, entries, lines],
  );
  const completedBoxes = boxBidSummaries.filter((box) => box.complete);
  const incompleteBoxes = boxBidSummaries.filter(
    (box) => box.started && !box.complete,
  );
  const profileComplete = Boolean(
    profile.company &&
    profile.contact_name &&
    profile.email,
  );
  const total = multipleAwards
    ? completedBoxes.reduce((sum, box) => sum + box.amount, 0)
    : selected.reduce(
        (sum, item) => sum + item.line.quantity * Number(item.entry.unitBid),
        0,
      );
  const totalQty = multipleAwards
    ? completedBoxes.reduce((sum, box) => sum + box.quantity, 0)
    : selected.reduce((sum, item) => sum + item.line.quantity, 0);
  const takeAll = bidMode === "take_all";
  const isWtb = deal?.direction === "buying";
  const wantedProductNames = [
    ...new Set(
      lines
        .map(
          (line) =>
            line.values.Product ||
            line.values.Description ||
            line.values.Model ||
            "",
        )
        .filter(Boolean),
    ),
  ];
  const savedWantedTitle = deal?.title.replace(/^\d[\d,]*-Piece\s+/i, "") || "";
  const wantedCategory = (() => {
    const savedCategory = deal?.category?.trim();
    if (savedCategory) return savedCategory;
    const text = `${savedWantedTitle} ${wantedProductNames.join(" ")}`.toLowerCase();
    return detectProductCategory(text, "Technology");
  })();
  const generalizedWantedTitle = wantedCategory === "RAM"
    ? "RAM Memory Modules"
    : wantedCategory === "SSD"
      ? "Enterprise SSDs"
      : wantedCategory === "GPUs"
        ? "GPUs"
        : wantedCategory;
  const wantedTitle = /mixed it equipment|mixed technology|wanted equipment/i.test(savedWantedTitle) ||
    /^we (?:are|'re) looking to buy\b/i.test(savedWantedTitle) ||
    savedWantedTitle.length > 72
    ? wantedProductNames.length === 1
      ? wantedProductNames[0]
      : generalizedWantedTitle
    : savedWantedTitle;
  const offerTotal = takeAll ? Number(takeAllAmount) || 0 : total;
  const offerQty = takeAll ? deal?.quantity || 0 : totalQty;
  const canSubmit = takeAll
    ? offerTotal > 0
    : multipleAwards
      ? completedBoxes.length > 0 && incompleteBoxes.length === 0
      : selected.length > 0;
  function update(index: number, patch: Partial<BidEntry>) {
    setEntries((current) => ({
      ...current,
      [index]: {
        unitBid: current[index]?.unitBid || "",
        comments: current[index]?.comments || "",
        ...patch,
      },
    }));
  }
  function pricingRow(line: PublicLine, index: number) {
    return (
      <tr
        className={Number(entries[index]?.unitBid) > 0 ? "hasBid" : ""}
        key={line.line}
      >
        <td>{line.line}</td>
        {headers.map((header) => (
          <td
            className="detailCell"
            title={line.values[header] || ""}
            key={header}
          >
            {line.values[header] || "—"}
          </td>
        ))}
        <td>
          <input
            value={entries[index]?.comments || ""}
            onChange={(event) =>
              update(index, { comments: event.target.value })
            }
            placeholder="Optional"
          />
        </td>
        <td className="bidSticky bidQty">
          <b>{line.quantity}</b>
        </td>
        <td className="bidSticky bidPrice">
          <div className="priceInput">
            <span>$</span>
            <input
              aria-label={`Unit bid for line ${line.line}`}
              type="number"
              min="0"
              step="0.01"
              value={entries[index]?.unitBid || ""}
              onChange={(event) =>
                update(index, { unitBid: event.target.value })
              }
            />
          </div>
        </td>
        <td className="bidSticky bidTotal">
          <output className="lineTotal">
            {money.format(
              line.quantity * Number(entries[index]?.unitBid || 0),
            )}
          </output>
        </td>
      </tr>
    );
  }
  function downloadSheet() {
    if (!deal) return;
    downloadBidSpreadsheet(
      deal.deal_number,
      lines.length,
      [
        ...headers.map((header) => ({
          header,
          value: (index: number) => lines[index].values[header] || "",
        })),
        { header: "Qty", value: (index: number) => lines[index].quantity },
      ],
      dealSpreadsheetFilename(deal),
      { awardMode: multipleAwards ? "multiple" : "single" },
    );
  }
  useEffect(() => {
    if (
      deal &&
      !autoDownloaded.current &&
      new URLSearchParams(window.location.search).get("download") === "1"
    ) {
      autoDownloaded.current = true;
      downloadSheet();
    }
  }, [deal]);
  async function importSheet(file: File) {
    if (!deal) return;
    setError("");
    setNotice("");
    try {
      const imported = await readBidSpreadsheet(file);
      const next: Record<number, BidEntry> = {};
      let priced = 0;
      for (const item of imported) {
        const numericId = /^\d+$/.test(item.lineId),
          legacyId = item.lineId.startsWith(`${deal.deal_number}-`),
          index =
            (numericId
              ? Number(item.lineId)
              : legacyId
                ? Number(item.lineId.slice(deal.deal_number.length + 1))
                : 0) - 1;
        if (
          (!numericId && !legacyId) ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= lines.length
        ) {
          if (Number(item.unitBid) > 0)
            throw new Error(`Line ${item.lineId || "(blank)"} was not found.`);
          continue;
        }
        if (Number(item.unitBid) > 0) {
          next[index] = { unitBid: item.unitBid, comments: item.comments };
          priced++;
        }
      }
      if (!priced)
        throw new Error(
          "No positive Unit Bid amounts were found in the spreadsheet.",
        );
      setEntries(next);
      setNotice(
        `${priced} spreadsheet bids were placed into their matching lines. Review and submit below.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The spreadsheet could not be imported.",
      );
    }
  }
  async function saveBidderProfile(form: HTMLFormElement) {
    if (!customerSession) return;
    setError("");
    const data = new FormData(form);
    const bidder = {
      company: String(data.get("company") || ""),
      contactName: String(data.get("contact") || ""),
      email: String(data.get("email") || ""),
      phone: String(data.get("phone") || ""),
      address1: String(data.get("address1") || ""),
      address2: String(data.get("address2") || ""),
      city: String(data.get("city") || ""),
      region: String(data.get("region") || ""),
      postalCode: String(data.get("postalCode") || ""),
      country: String(data.get("country") || ""),
    };
    if (
      !bidder.company ||
      !bidder.contactName ||
      !bidder.email
    ) {
      setError("Complete all required bidder information before saving.");
      return;
    }
    const saved = {
      company: bidder.company,
      contact_name: bidder.contactName,
      email: bidder.email,
      phone: bidder.phone,
      address1: bidder.address1,
      address2: bidder.address2,
      city: bidder.city,
      region: bidder.region,
      postal_code: bidder.postalCode,
      country: bidder.country,
    };
    setProfile(saved);
    localStorage.setItem("m2m-pdd-customer-profile", JSON.stringify(saved));
    setEditProfile(false);
    setNotice(
      "Your bidder information is saved and will be used for future bids.",
    );
    try {
      await fetch("/api/customer/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSession.access_token}`,
        },
        body: JSON.stringify({ ...bidder, dealNumber: deal?.deal_number }),
      });
    } catch {
      /* The locally saved profile remains available while remote sync recovers. */
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deal || !canSubmit) return;
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const bidder = {
      company: form.get("company"),
      contactName: form.get("contact"),
      email: form.get("email"),
      phone: form.get("phone"),
      address1: form.get("address1"),
      address2: form.get("address2"),
      city: form.get("city"),
      region: form.get("region"),
      postalCode: form.get("postalCode"),
      country: form.get("country"),
    };
    const lineItems = selected.map(({ line, entry }) => ({
      lineNumber: line.line,
      assetId: "",
      brand: line.values.MFG || line.values.Manufacturer || "",
      model: line.values.Model || "",
      modelNumber:
        line.values["Model Number"] || line.values["Part Number"] || "",
      processor: line.values.CPU || line.values.Processor || "",
      ram: line.values.RAM || "",
      hardDrive: line.values.Storage || line.values["Hard Drive"] || "",
      condition:
        line.values.Condition || line.values["Grading Description"] || "",
      issues: Object.entries(line.values)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · "),
      quantity: line.quantity,
      unitBid: Number(entry.unitBid),
      comments: entry.comments,
    }));
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (customerSession)
        headers.Authorization = `Bearer ${customerSession.access_token}`;
      const response = await fetch("/api/line-item-bids", {
        method: "POST",
        headers,
        body: JSON.stringify({
          dealNumber: deal.deal_number,
          ...bidder,
          customerNotes: form.get("notes"),
          offerType: bidMode,
          takeAllAmount: offerTotal,
          lineItems: takeAll ? [] : lineItems,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The bid could not be submitted.");
      if (customerSession)
        await fetch("/api/customer/profile", {
          method: "PUT",
          headers,
          body: JSON.stringify({ ...bidder, dealNumber: deal.deal_number }),
        });
      setConfirmation({
        number: data.internalBidNumber,
        lines: data.lineCount,
        boxes: data.boxCount || 0,
        total: data.totalBid,
        offerType: data.offerType,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The bid could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  if (loading)
    return (
      <Shell>
        <main className="lineBid">
          <p className="lineBidError">Opening deal…</p>
        </main>
      </Shell>
    );
  if (!deal)
    return (
      <Shell>
        <main className="lineBid">
          <p className="lineBidError">{error || "This deal is not open."}</p>
        </main>
      </Shell>
    );
  if (isWtb && !sellPage)
    return (
      <Shell>
        <main className="wtbDealLanding">
          <section className="wtbLandingHero">
            <div className="wtbLandingNav">
              <a href="/live-bid-board">← Back to Live Bid Board</a>
              <span>{deal.deal_number}</span>
            </div>
            <p>MAC2MACONLINE IS ACTIVELY BUYING</p>
            <h1>{wantedTitle}</h1>
            <div className="wtbLandingStats">
              <span>{deal.quantity.toLocaleString()} units wanted</span>
              <span>{lines.length} product lines</span>
              <span>{deal.category || "Technology"}</span>
            </div>
            <a className="wtbSellCta" href={`?sell=1`} onClick={() => setSellPage(true)}>
              Sell These Products to Mac2MacOnline →
            </a>
            <small className="wtbResponsePromise">
              Send us what you have and we will generally respond with an offer within 24 hours.
            </small>
          </section>
          <section className="wtbLandingContent">
            <header>
              <div>
                <span>WHAT WE ARE LOOKING TO BUY</span>
                <h2>Review the requested products and quantities.</h2>
              </div>
              <p>
                You may offer all or part of the requested quantity. Include
                condition, availability and location when submitting your offer.
              </p>
            </header>
            <div className="wtbProductCards">
              {lines.map((line) => {
                const product =
                  line.values.Product ||
                  line.values.Description ||
                  line.values.Model ||
                  line.values[headers[0]] ||
                  `Wanted item ${line.line}`;
                const details = Object.entries(line.values).filter(
                  ([key, value]) => value && key !== "Product" && key !== "Description",
                );
                return (
                  <article key={line.line}>
                    <div>
                      <b>QTY {line.quantity.toLocaleString()}</b>
                      <span>Line {line.line}</span>
                    </div>
                    <h3>{product}</h3>
                    <dl>
                      {details.slice(0, 4).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                );
              })}
            </div>
            <div className="wtbLandingBottom">
              <div>
                <span>HAVE THIS INVENTORY?</span>
                <h2>Send us your availability and price.</h2>
              </div>
              <a className="wtbSellCta" href="?sell=1" onClick={() => setSellPage(true)}>
                Open Custom Want-to-Sell Page →
              </a>
            </div>
          </section>
        </main>
      </Shell>
    );
  if (isWtb && sellPage)
    return (
      <Shell>
        <main className="customDealSellPage">
          <section className="customDealSellHero">
            <a href={`/public-deal-desk/${encodeURIComponent(deal.deal_number)}`} onClick={() => setSellPage(false)}>
              ← Back to Wanted Products
            </a>
            <p>MAC2MACONLINE WANTS TO BUY · {wantedCategory.toUpperCase()}</p>
            <h1>{wantedTitle}</h1>
            <div>
              <span>{deal.deal_number}</span>
              <span>{deal.quantity.toLocaleString()} units requested</span>
              <span>General response within 24 hours</span>
            </div>
          </section>
          <section className="customDealSellBody">
            <DealSellForm
              dealNumber={deal.deal_number}
              category={wantedCategory}
              lines={lines}
            />
          </section>
        </main>
      </Shell>
    );
  return (
    <Shell>
      <main className="lineBid">
        <section className={`lineBidHero ${isWtb ? "wtbDealHero" : ""}`}>
          <div className="lineBidHeroNav">
            <div className="summaryReturnNav">
              {fromSummary && <a href="/employee/active-bids">← Back to Summary</a>}
              {fromSummary && <a href="/employee">Deal Workbook</a>}
              {!fromSummary && <a href={isWtb ? `/public-deal-desk/${encodeURIComponent(deal.deal_number)}` : "/live-bid-board"}>
                {isWtb ? "← Back to Wanted Products" : "← Back to Live Bid Board"}
              </a>}
            </div>
            <div className="lineBidHeroTools">
              <DealViewerPresence dealNumber={deal.deal_number} />
              <a
                className="lineBidDownload"
                href={`/api/deals/${encodeURIComponent(deal.deal_number.toLowerCase())}/spreadsheet`}
              >
                Download Bid Excel
              </a>
            </div>
          </div>
          <p>{isWtb ? `CUSTOM WANT-TO-SELL PAGE · ${deal.category || "TECHNOLOGY"}` : "LINE-ITEM BID ENTRY"}</p>
          <h1>{deal.deal_number}</h1>
          <h2>{deal.title}</h2>
          <div>
            <span>
              Closes{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/Los_Angeles",
                timeZoneName: "short",
              }).format(new Date(deal.closes_at))}
            </span>
            <span>{deal.quantity.toLocaleString()} total items</span>
            <span>{isWtb ? "Tell us what you can supply" : "No asking prices published"}</span>
          </div>
        </section>
        {isWtb && (
          <section className="wtbBuyingBanner">
            <div>
              <span>MAC2MACONLINE WANTED INVENTORY</span>
              <h2>We are actively buying {wantedTitle}.</h2>
              <p>
                Review the exact products and quantities below, then enter your
                unit prices online or upload a completed offer spreadsheet.
                Partial quantities and condition notes are welcome. We will
                generally respond to submitted inventory within 24 hours.
              </p>
            </div>
            <div className="wtbWantedHighlights">
              {lines.slice(0, 3).map((line) => {
                const product =
                  line.values.Product ||
                  line.values.Description ||
                  line.values.Model ||
                  line.values[headers[0]] ||
                  `Wanted item ${line.line}`;
                return (
                  <article key={line.line}>
                    <b>WANTED · QTY {line.quantity.toLocaleString()}</b>
                    <h3>{product}</h3>
                    <p>{line.values["Part Number"] || line.values.MPN || "Send available specifications and condition."}</p>
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {dealPhotos.length > 0 && (
          <section className="customerDealGallery" aria-label="Deal pictures">
            {dealPhotos.map((photo, index) => (
              <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}>
                <img src={photo.url} alt={`${deal.title} — picture ${index + 1}`} />
              </a>
            ))}
          </section>
        )}
        {confirmation && (
          <section className="bidConfirmation">
            <strong>Internal bid generated</strong>
            <h2>{confirmation.number}</h2>
            <p>
              {confirmation.offerType === "take_all"
                ? "Take-All Offer"
                : confirmation.boxes
                  ? `${confirmation.boxes} box/lot groups · ${confirmation.lines} line items`
                  : `${confirmation.lines} line items`}{" "}
              · {money.format(confirmation.total)} total
            </p>
            <p>
              Please save this confirmation number. Mac2MacOnline will contact
              you after bids are reviewed.
            </p>
          </section>
        )}
        <form className="lineBidForm" onSubmit={submit}>
          <section
            className={`bidderPanel ${customerSession && profileComplete && !editProfile ? "savedProfilePanel" : ""}`}
          >
            <div className="bidderIntro">
              <h2>{isWtb ? "Supplier information" : "Bidder information"}</h2>
              {customerSession ? (
                <p>
                  Signed in · <a href="/my-bids">View My Bids</a>
                </p>
              ) : (
                <>
                  <p>
                    You may submit an offer as a visitor or create an account to
                    save your information and track results. To bid as a guest,
                    you must enter Company, Contact Name and email, then click
                    the &quot;Continue as Guest&quot; button below.
                  </p>
                  <div className="bidderAccountActions">
                    <button
                      type="button"
                      onClick={(event) => {
                        const form = event.currentTarget.form;
                        if (!form) return;
                        const requiredGuestFields = [
                          form.elements.namedItem("company"),
                          form.elements.namedItem("contact"),
                          form.elements.namedItem("email"),
                        ].filter(
                          (field): field is HTMLInputElement =>
                            field instanceof HTMLInputElement,
                        );
                        for (const field of requiredGuestFields) {
                          field.value = field.value.trim();
                          field.setCustomValidity(
                            field.value ? "" : "This field is required to continue as a guest.",
                          );
                          if (!field.checkValidity()) {
                            field.reportValidity();
                            field.focus();
                            return;
                          }
                        }
                        const bidOptions = document.querySelector(".bidMethod");
                        if (bidOptions instanceof HTMLElement) {
                          const top =
                            bidOptions.getBoundingClientRect().top +
                            window.scrollY -
                            90;
                          window.scrollTo({
                            top: Math.max(0, top),
                            behavior: "smooth",
                          });
                        }
                      }}
                    >
                      Continue as Guest
                    </button>
                    <a href="/customer-login">Create Customer Account</a>
                  </div>
                </>
              )}
            </div>
            {customerSession && profileComplete && !editProfile ? (
              <>
                <div className="savedBidder">
                  <span>Submitting as</span>
                  <strong>{profile.company}</strong>
                  <p>{profile.contact_name} · {profile.email}</p>
                  <button type="button" onClick={() => setEditProfile(true)}>
                    Edit information
                  </button>
                </div>
                <input type="hidden" name="company" value={profile.company} />
                <input
                  type="hidden"
                  name="contact"
                  value={profile.contact_name}
                />
                <input type="hidden" name="email" value={profile.email} />
                <input type="hidden" name="phone" value={profile.phone || ""} />
                <input type="hidden" name="address1" value={profile.address1 || ""} />
                <input
                  type="hidden"
                  name="address2"
                  value={profile.address2 || ""}
                />
                <input type="hidden" name="city" value={profile.city || ""} />
                <input type="hidden" name="region" value={profile.region || ""} />
                <input
                  type="hidden"
                  name="postalCode"
                  value={profile.postal_code || ""}
                />
                <input type="hidden" name="country" value={profile.country || ""} />
              </>
            ) : (
              <>
                <label>
                  Company *
                  <input
                    required
                    name="company"
                    onInput={(event) => event.currentTarget.setCustomValidity("")}
                    defaultValue={profile.company || ""}
                  />
                </label>
                <label>
                  Contact Name *
                  <input
                    required
                    name="contact"
                    onInput={(event) => event.currentTarget.setCustomValidity("")}
                    defaultValue={profile.contact_name || ""}
                  />
                </label>
                <label>
                  Email *
                  <input
                    required
                    type="email"
                    name="email"
                    onInput={(event) => event.currentTarget.setCustomValidity("")}
                    defaultValue={
                      profile.email || customerSession?.user?.email || ""
                    }
                  />
                </label>
              </>
            )}
            <label className="wide">
              {isWtb ? "Supply, condition and availability notes" : "General bid notes"}
              <textarea name="notes" rows={3} />
            </label>
          </section>
          {(!profileComplete || editProfile) && (
            <div className="saveBidderRow">
              <button
                type="button"
                onClick={(event) => {
                  if (!customerSession) {
                    window.location.assign("/customer-login");
                    return;
                  }
                  if (event.currentTarget.form)
                    void saveBidderProfile(event.currentTarget.form);
                }}
              >
                Save Bidder Information
              </button>
              <span>
                {customerSession
                  ? "Save once to hide these fields on future bids."
                  : "Sign in to save these details, or continue bidding as a visitor."}
              </span>
            </div>
          )}
          <section className="bidMethod">
            <div className={bidMode === "line_item" ? "selectedBidMethod" : ""}>
              <span>OPTION 1</span>
              <h2>
                {multipleAwards
                  ? "Enter bids online by box/lot"
                  : isWtb
                    ? "Enter your offer online"
                    : "Enter bids online"}
              </h2>
              <p>
                {multipleAwards
                  ? "Complete every line in each box or lot you want to bid. Each group is submitted separately."
                  : isWtb
                    ? "Tell us your unit price for any product you can supply."
                    : "Type a unit bid directly into any line below."}
              </p>
              <button type="button" onClick={() => setBidMode("line_item")}>
                {multipleAwards ? "Use Box/Lot Pricing" : "Use Line-Item Pricing"}
              </button>
            </div>
            <div className={bidMode === "line_item" ? "selectedBidMethod" : ""}>
              <span>OPTION 2</span>
              <h2>{isWtb ? "Upload an offer spreadsheet" : "Use the Excel bid sheet"}</h2>
              <p>
                Download our wanted-items spreadsheet, enter Unit Bid and offer
                notes, then upload it here.
              </p>
              <div className="sheetActions">
                <a href={`/api/deals/${encodeURIComponent(deal.deal_number.toLowerCase())}/spreadsheet`}>
                  Download Bid Spreadsheet
                </a>
                <label>
                  Upload Completed Spreadsheet
                  <input
                    type="file"
                    accept=".xls,.xlsx,.xml,.csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importSheet(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div className={bidMode === "take_all" ? "selectedBidMethod" : ""}>
              <span>OPTION 3</span>
              <h2>Submit a Take-All Offer</h2>
              <p>Enter one total price for the entire deal.</p>
              <button type="button" onClick={() => setBidMode("take_all")}>
                Use Take-All Offer
              </button>
            </div>
            <div className="customerBidMethod">
              <span>OPTION 4</span>
              <h2>Add Customer Bid</h2>
              <p>
                Employees can record a line-item or take-all offer for a
                customer.
              </p>
              <a
                href={`/employee/customer-bid?deal=${encodeURIComponent(deal.deal_number)}`}
              >
                Add Customer Bid
              </a>
            </div>
          </section>
          {takeAll && (
            <section className="takeAllPanel">
              <h2>Take-All Offer</h2>
              <p>
                Submit one total for the entire deal. If your offer is selected
                for award, you must provide itemized unit pricing for every line
                before the award can be finalized and purchase or sales orders
                can be issued.
              </p>
              <label>
                Total offer for all {deal.quantity.toLocaleString()} items
                <div className="takeAllInput">
                  <span>$</span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={takeAllAmount}
                    onChange={(event) => setTakeAllAmount(event.target.value)}
                  />
                </div>
              </label>
            </section>
          )}
          {notice && <p className="sheetImportNotice">{notice}</p>}
          <section className="bidSummary">
            <div>
              <span>
                {takeAll
                  ? "Offer type"
                  : multipleAwards
                    ? "Boxes/lots bid"
                    : "Lines bid"}
              </span>
              <strong>
                {takeAll
                  ? "Take All"
                  : multipleAwards
                    ? completedBoxes.length
                    : selected.length}
              </strong>
            </div>
            <div>
              <span>Total units</span>
              <strong>{offerQty}</strong>
            </div>
            <div>
              <span>Grand total</span>
              <strong>{money.format(offerTotal)}</strong>
            </div>
            <button disabled={submitting || !canSubmit}>
              {submitting
                ? "Generating internal bid…"
                : takeAll
                  ? "Submit Take-All Offer"
                  : multipleAwards
                    ? "Submit Box/Lot Bids"
                    : "Submit Line-Item Bid"}
            </button>
          </section>
          {!takeAll && multipleAwards && incompleteBoxes.length > 0 && (
            <p className="boxBidWarning">
              Complete every line in Box/Lot{" "}
              {incompleteBoxes.map((box) => box.boxNumber).join(", ")} or
              clear that group&apos;s prices before submitting.
            </p>
          )}
          {error && <p className="lineBidError">{error}</p>}
          {!takeAll && (
            <section className="lineItems">
              <div className="lineItemsHeading">
                <div>
                  <h2>
                    {multipleAwards
                      ? "Enter your unit prices by box/lot"
                      : "Enter your unit price by line"}
                  </h2>
                  <p>
                    {multipleAwards
                      ? "Price every line in a box or lot you want. Each group subtotal is kept separate for award."
                      : "The blue Unit Bid box is next to each quantity. Leave it blank for lines you do not want."}
                  </p>
                </div>
                <strong>
                  {multipleAwards
                    ? `${boxGroups.length} boxes/lots · ${lines.length} quantified lines`
                    : `${lines.length} quantified lines`}
                </strong>
              </div>
              <div className="lineTableWrap">
                <table className="pricingTable">
                  <thead>
                    <tr>
                      <th>Line</th>
                      {headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                      <th>Bid Comments</th>
                      <th className="bidSticky bidQty">Qty</th>
                      <th className="bidSticky bidPrice">Unit Bid</th>
                      <th className="bidSticky bidTotal">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multipleAwards
                      ? boxGroups.map((group) => {
                          const summary = boxBidSummaries.find(
                            (box) => box.boxNumber === group.boxNumber,
                          );
                          return (
                            <Fragment key={group.boxNumber}>
                              <tr className="boxBidGroupHeader">
                                <td colSpan={headers.length + 5}>
                                  <div className="boxBidGroupTitle">
                                    <strong>Box/Lot {group.boxNumber}</strong>
                                    <span>
                                      {group.indexes.length} line
                                      {group.indexes.length === 1 ? "" : "s"} ·{" "}
                                      {group.quantity.toLocaleString()} units
                                    </span>
                                    <b
                                      className={
                                        summary?.complete
                                          ? "complete"
                                          : summary?.started
                                            ? "incomplete"
                                            : ""
                                      }
                                    >
                                      {summary?.complete
                                        ? "Ready to submit"
                                        : summary?.started
                                          ? `${summary.pricedCount} of ${group.indexes.length} lines priced`
                                          : "No bid entered"}
                                    </b>
                                  </div>
                                </td>
                              </tr>
                              {group.indexes.map((index) =>
                                pricingRow(lines[index], index),
                              )}
                              <tr className="boxBidSubtotal">
                                <td colSpan={headers.length + 2}>
                                  Box/Lot {group.boxNumber} subtotal
                                </td>
                                <td className="bidSticky bidQty">
                                  {group.quantity.toLocaleString()}
                                </td>
                                <td className="bidSticky bidPrice">
                                  BOX TOTAL
                                </td>
                                <td className="bidSticky bidTotal">
                                  {money.format(summary?.amount || 0)}
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })
                      : lines.map((line, index) => pricingRow(line, index))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="bidSubmitBar">
            <div>
              <span>
                {takeAll
                  ? `Take-all offer · ${deal.quantity.toLocaleString()} items`
                  : multipleAwards
                    ? `${completedBoxes.length} box/lot group${completedBoxes.length === 1 ? "" : "s"} ready · ${totalQty.toLocaleString()} units`
                    : `Grand total · ${selected.length} lines selected`}
              </span>
              <strong>{money.format(offerTotal)}</strong>
            </div>
            <button disabled={submitting || !canSubmit}>
              {takeAll
                ? "Submit Take-All Offer"
                : multipleAwards
                  ? "Submit Box/Lot Bids"
                  : "Submit Line-Item Bid"}
            </button>
          </section>
        </form>
      </main>
    </Shell>
  );
}
