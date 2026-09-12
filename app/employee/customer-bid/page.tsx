"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clearPddSession,
  currentPddSession,
  type PddSession,
} from "../../../lib/pdd-auth";
import { readBidSpreadsheet } from "../../../lib/bidSpreadsheet";
import {
  groupBidLinesByBox,
  isMultipleAwardDeal,
} from "../../../lib/boxBidGroups";
import ContactTemplateFields from "../../../components/ContactTemplateFields";

type Customer = {
  id: string;
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  has_account: boolean;
};
type PublicLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
  award_mode?: "single" | "multiple";
};
type DealSummary = {
  deal_number: string;
  title: string;
  quantity: number;
  closes_at: string;
};
type Deal = {
  deal_number: string;
  title: string;
  description: string;
  quantity: number;
  closes_at: string;
  public_lines: PublicLine[];
  spreadsheet_filename: string;
};
type BidEntry = { unitBid: string; comments: string };
type ExistingBid = {
  internal_bid_number: string;
  company: string;
  contact_name: string;
  total_bid: number;
  status: string;
  submitted_at: string;
  lot_number?: string;
};
type EditableBid = ExistingBid & {
  deal_number: string;
  email: string;
  phone: string;
  customer_notes: string;
  offer_type?: "line_item" | "take_all";
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  line_items: { lineNumber: number; unitBid: number; comments?: string }[];
};
type ContactDraft = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};
const emptyContact: ContactDraft = {
  company: "",
  contactName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "United States",
};
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function CustomerBidUpload() {
  const [session, setSession] = useState<PddSession | null>(null),
    [customers, setCustomers] = useState<Customer[]>([]),
    [deals, setDeals] = useState<DealSummary[]>([]),
    [customerId, setCustomerId] = useState(""),
    [addingCustomer, setAddingCustomer] = useState(false),
    [newCustomer, setNewCustomer] = useState({ company: "", contactName: "", email: "" }),
    [savingCustomer, setSavingCustomer] = useState(false),
    [contact, setContact] = useState<ContactDraft>(emptyContact),
    [dealNumber, setDealNumber] = useState(""),
    [deal, setDeal] = useState<Deal | null>(null),
    [existingBids, setExistingBids] = useState<ExistingBid[]>([]),
    [entries, setEntries] = useState<Record<number, BidEntry>>({}),
    [fileName, setFileName] = useState(""),
    [offerType, setOfferType] = useState<"line_item" | "take_all">(
      "line_item",
    ),
    [takeAllAmount, setTakeAllAmount] = useState(""),
    [notes, setNotes] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [editingBidNumber, setEditingBidNumber] = useState("");
  useEffect(() => {
    void (async () => {
      const active = await currentPddSession();
      if (!active) {
        window.location.replace(
          "/employee-login?return_to=/employee/customer-bid",
        );
        return;
      }
      setSession(active);
      const headers = { Authorization: `Bearer ${active.access_token}` };
      const [customerResponse, dealResponse] = await Promise.all([
        fetch("/api/admin/contacts", { headers }),
        fetch("/api/deals", { cache: "no-store" }),
      ]);
      if (customerResponse.status === 401) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      if (!customerResponse.ok || !dealResponse.ok) {
        setError("Customers or open deals could not be loaded.");
        setLoading(false);
        return;
      }
      const customerData = (await customerResponse.json()) as {
        customers: Customer[];
      };
      const dealData = (await dealResponse.json()) as { deals: DealSummary[] };
      setCustomers(
        [...(customerData.customers || [])].sort((a, b) =>
          (a.company || a.email).localeCompare(b.company || b.email),
        ),
      );
      const availableDeals = [...(dealData.deals || [])].sort((a, b) =>
        a.deal_number.localeCompare(b.deal_number),
      );
      const requestedDeal = new URLSearchParams(window.location.search)
        .get("deal")
        ?.toUpperCase();
      const requestedBid = new URLSearchParams(window.location.search).get("bid") || "";
      setEditingBidNumber(requestedBid);
      setDeals(
        requestedDeal &&
          !availableDeals.some((item) => item.deal_number === requestedDeal)
          ? [
              {
                deal_number: requestedDeal,
                title: "Selected active deal",
                quantity: 0,
                closes_at: "",
              },
              ...availableDeals,
            ]
          : availableDeals,
      );
      if (requestedDeal)
        setDealNumber(requestedDeal);
      setLoading(false);
    })();
  }, []);
  useEffect(() => {
    setEntries({});
    setFileName("");
    setTakeAllAmount("");
    setConfirmation("");
    setMessage("");
    if (!dealNumber) {
      setDeal(null);
      setExistingBids([]);
      return;
    }
    setBusy(true);
    Promise.all([
      fetch(`/api/admin/deals/${encodeURIComponent(dealNumber)}`, {
        cache: "no-store",
        headers: session
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      }),
      fetch(`/api/admin/bids?deal=${encodeURIComponent(dealNumber)}`, {
        cache: "no-store",
        headers: session
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      }),
      editingBidNumber
        ? fetch(`/api/admin/bids?bid=${encodeURIComponent(editingBidNumber)}`, {
            cache: "no-store",
            headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
          })
        : Promise.resolve(null),
    ])
      .then(async ([dealResponse, bidResponse, editResponse]) => {
        const data = await dealResponse.json();
        if (!dealResponse.ok)
          throw new Error(data.error || "The deal could not be opened.");
        setDeal(data.deal);
        setDeals((current) => {
          const summary: DealSummary = {
            deal_number: data.deal.deal_number,
            title: data.deal.title,
            quantity: data.deal.quantity,
            closes_at: data.deal.closes_at,
          };
          return current.some(
            (item) => item.deal_number === data.deal.deal_number,
          )
            ? current.map((item) =>
                item.deal_number === data.deal.deal_number ? summary : item,
              )
            : [summary, ...current];
        });
        if (bidResponse.ok) {
          const bidData = (await bidResponse.json()) as {
            bids?: ExistingBid[];
          };
          setExistingBids(bidData.bids || []);
        } else setExistingBids([]);
        if (editResponse) {
          const editData = await editResponse.json() as {bid?:EditableBid;error?:string};
          if (!editResponse.ok || !editData.bid) throw new Error(editData.error || "The bid could not be loaded for editing.");
          const bid = editData.bid;
          const matching = customers.find(item => item.email.trim().toLowerCase() === bid.email.trim().toLowerCase()) || {
            id: `guest:${bid.email}`,
            company: bid.company,
            contact_name: bid.contact_name,
            email: bid.email,
            phone: bid.phone,
            address1: bid.address1,
            address2: bid.address2,
            city: bid.city,
            region: bid.region,
            postal_code: bid.postal_code,
            country: bid.country,
            has_account: false,
          };
          setCustomers(current => current.some(item => item.id === matching.id) ? current : [...current, matching]);
          setCustomerId(matching.id);
          setContact({company:bid.company,contactName:bid.contact_name,email:bid.email,phone:bid.phone,address1:bid.address1,address2:bid.address2,city:bid.city,region:bid.region,postalCode:bid.postal_code,country:bid.country||"United States"});
          const takeAllBid = bid.offer_type === "take_all";
          setOfferType(takeAllBid ? "take_all" : "line_item");
          setTakeAllAmount(takeAllBid ? String(bid.total_bid) : "");
          setNotes(bid.customer_notes.replace(/^TAKE-ALL OFFER[^\n]*\n*/i, "").trim());
          const byLine = new Map((bid.line_items || []).map(line => [Number(line.lineNumber), line]));
          setEntries(Object.fromEntries((data.deal.public_lines || []).map((line:PublicLine,index:number) => {
            const saved = byLine.get(Number(line.line));
            return [index, {unitBid:saved ? String(saved.unitBid) : "",comments:saved?.comments || ""}];
          })));
        }
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "The deal could not be opened.",
        ),
      )
      .finally(() => setBusy(false));
  }, [dealNumber, session, editingBidNumber]);
  const customer = customers.find((item) => item.id === customerId) || null;
  async function addCustomer() {
    if (savingCustomer) return;
    setSavingCustomer(true); setError("");
    try {
      const email = newCustomer.email.trim().toLowerCase();
      if (!newCustomer.company.trim() || !newCustomer.contactName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter company, contact name and a valid email address.");
      const added: Customer = { id: `guest:${email}`, company: newCustomer.company.trim(), contact_name: newCustomer.contactName.trim(), email, phone: "", address1: "", address2: "", city: "", region: "", postal_code: "", country: "United States", has_account: false };
      setCustomers((current) => [...current, added].sort((a, b) => (a.company || a.email).localeCompare(b.company || b.email)));
      setCustomerId(added.id); setNewCustomer({ company: "", contactName: "", email: "" }); setAddingCustomer(false); setMessage(`${added.company} is ready to bid as a guest.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The guest bidder could not be entered."); }
    finally { setSavingCustomer(false); }
  }
  useEffect(() => {
    if (!customer) {
      setContact(emptyContact);
      return;
    }
    setContact({
      company: customer.company,
      contactName: customer.contact_name,
      email: customer.email,
      phone: customer.phone,
      address1: customer.address1,
      address2: customer.address2,
      city: customer.city,
      region: customer.region,
      postalCode: customer.postal_code,
      country: customer.country || "United States",
    });
  }, [customer]);
  const selected = useMemo(
    () =>
      deal?.public_lines
        .map((line, index) => ({ line, index, entry: entries[index] }))
        .filter((item) => Number(item.entry?.unitBid) > 0) || [],
    [deal, entries],
  );
  const multipleAwards = Boolean(
    deal && isMultipleAwardDeal(deal.public_lines),
  );
  const lotGroups = useMemo(
    () =>
      deal && multipleAwards
        ? groupBidLinesByBox(deal.public_lines)
        : [],
    [deal, multipleAwards],
  );
  const total = selected.reduce(
      (sum, item) => sum + item.line.quantity * Number(item.entry.unitBid),
      0,
    ),
    totalQty = selected.reduce((sum, item) => sum + item.line.quantity, 0);
  const takeAll = offerType === "take_all";
  const offerTotal = takeAll ? Number(takeAllAmount) || 0 : total;
  const offerQuantity = takeAll ? deal?.quantity || 0 : totalQty;
  const offerReady = takeAll ? offerTotal > 0 : selected.length > 0;
  const updateContact = (field: keyof ContactDraft, value: string) =>
    setContact((current) => ({ ...current, [field]: value }));
  async function importSheet(file: File) {
    if (!deal) return;
    setError("");
    setMessage("");
    setConfirmation("");
    try {
      const imported = await readBidSpreadsheet(file);
      const next: Record<number, BidEntry> = {};
      let priced = 0;
      for (const item of imported) {
        const numeric = /^\d+$/.test(item.lineId),
          legacy = item.lineId.startsWith(`${deal.deal_number}-`),
          index =
            (numeric
              ? Number(item.lineId)
              : legacy
                ? Number(item.lineId.slice(deal.deal_number.length + 1))
                : 0) - 1;
        if (
          (!numeric && !legacy) ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= deal.public_lines.length
        ) {
          if (Number(item.unitBid) > 0)
            throw new Error(
              `Line ${item.lineId || "(blank)"} does not belong to ${deal.deal_number}.`,
            );
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
      setFileName(file.name);
      setMessage(
        `${priced} priced lines matched ${deal.deal_number}. Review the customer and total, then submit.`,
      );
    } catch (reason) {
      setEntries({});
      setFileName("");
      setError(
        reason instanceof Error
          ? reason.message
          : "The spreadsheet could not be imported.",
      );
    }
  }
  async function submit() {
    if (!session || !deal || !customer || !offerReady) return;
    setBusy(true);
    setError("");
    setConfirmation("");
    const lineItems = selected.map(({ line, entry }) => ({
      lineNumber: line.line,
      assetId: "",
      brand: line.values.MFG || line.values.Manufacturer || "",
      model: line.values.Model || "",
      modelNumber:
        line.values["Model Number"] ||
        line.values["Part Number"] ||
        line.values["Part #"] ||
        "",
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
      const response = await fetch("/api/line-item-bids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          dealNumber: deal.deal_number,
          company: contact.company,
          contactName: contact.contactName,
          email: contact.email,
          phone: contact.phone,
          address1: contact.address1,
          address2: contact.address2,
          city: contact.city,
          region: contact.region,
          postalCode: contact.postalCode,
          country: contact.country,
          customerNotes: notes,
          offerType,
          takeAllAmount: offerTotal,
          lineItems: takeAll ? [] : lineItems,
          submittedOnBehalf: true,
          customerUserId: customer.has_account ? customer.id : null,
          customerKey: customer.id,
          uploadedFileName: fileName,
          editBidNumber: editingBidNumber || undefined,
          itemizeWinningOffer: existingBids.some(
            (bid) =>
              bid.status.toLowerCase() === "won" &&
              bid.company.trim().toLowerCase() ===
                customer.company.trim().toLowerCase(),
          ),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "The customer bid could not be submitted.",
        );
      window.location.replace("/employee/active-bids");
      return;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The customer bid could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="employeeCustomerBid">
        <p>Loading customers and open deals…</p>
      </main>
    );
  return (
    <main className="employeeCustomerBid">
      <header>
        <div>
          <p className="eyebrow">EMPLOYEE TOOL</p>
          <h1>{editingBidNumber ? "Update Customer Bid" : "Submit a Customer Bid"}</h1>
          <p>
            Enter line-item prices, upload a completed bid spreadsheet or enter
            a take-all offer and record it under the correct customer.
          </p>
        </div>
        <nav className="summaryReturnNav">
          <a href="/employee/active-bids">← Back to Summary</a>
          <a href="/employee">Deal Workbook</a>
        </nav>
      </header>
      <section className="customerBidSteps">
        <article className={dealNumber ? "complete" : ""}>
          <span>1</span>
          <h2>Select the deal</h2>
          <label>
            Deal
            <select
              value={dealNumber}
              onChange={(event) => {
                setDealNumber(event.target.value);
                setError("");
              }}
            >
              <option value="">Choose a deal…</option>
              {deals.map((item) => (
                <option key={item.deal_number} value={item.deal_number}>
                  {item.deal_number} · {item.title}
                </option>
              ))}
            </select>
          </label>
        </article>
        <article className={customer ? "complete" : ""}>
          <span>2</span>
          <h2>Select the customer</h2>
          <label>
            Customer
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setConfirmation("");
              }}
            >
              <option value="">Choose a saved customer…</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.company || item.email} ·{" "}
                  {item.contact_name || item.email}
                </option>
              ))}
            </select>
          </label>
          <button className="customerBidAddCustomer" type="button" onClick={() => setAddingCustomer((current) => !current)}>{addingCustomer ? "Cancel guest entry" : "+ Continue with Guest Bidder"}</button>
          {addingCustomer && <div className="customerBidNewCustomer">
            <label className="requiredEntryField"><span>Company <b className="requiredAsterisk" aria-hidden="true">*</b></span><input required value={newCustomer.company} onChange={(event) => setNewCustomer((current) => ({ ...current, company: event.target.value }))} /></label>
            <label className="requiredEntryField"><span>Contact name <b className="requiredAsterisk" aria-hidden="true">*</b></span><input required value={newCustomer.contactName} onChange={(event) => setNewCustomer((current) => ({ ...current, contactName: event.target.value }))} /></label>
            <label className="wide requiredEntryField"><span>Email <b className="requiredAsterisk" aria-hidden="true">*</b></span><input required type="email" value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} /></label>
            <button type="button" onClick={() => void addCustomer()} disabled={savingCustomer || !newCustomer.company.trim() || !newCustomer.contactName.trim() || !newCustomer.email.trim()}>{savingCustomer ? "Continuing…" : "Continue as Guest Bidder"}</button>
          </div>}
          {customer && (
            <div className="selectedCustomer">
              <strong>{customer.company}</strong>
              <small>
                {customer.contact_name} · {customer.email}
              </small>
              <small>
                {customer.phone} ·{" "}
                {[customer.city, customer.region].filter(Boolean).join(", ")}
              </small>
            </div>
          )}
        </article>
        <article className={offerReady ? "complete" : ""}>
          <span>3</span>
          <h2>Choose the offer type</h2>
          <div className="customerBidTypeTabs">
            <button
              type="button"
              className={!takeAll ? "active" : ""}
              onClick={() => setOfferType("line_item")}
            >
              Line-item bid
            </button>
            <button
              type="button"
              className={takeAll ? "active" : ""}
              onClick={() => setOfferType("take_all")}
            >
              Take-all offer
            </button>
          </div>
          {takeAll ? (
            <label className="customerTakeAllInput">
              Total offer for the entire deal
              <span>
                $
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={!deal || !customer || busy}
                  value={takeAllAmount}
                  onChange={(event) => setTakeAllAmount(event.target.value)}
                  placeholder="0.00"
                />
              </span>
              <small>
                Itemized line pricing will be required if the offer is awarded.
              </small>
            </label>
          ) : (
            <label
              className={`customerBidUpload ${!deal || !customer ? "disabled" : ""}`}
            >
              <input
                type="file"
                disabled={!deal || !customer || busy}
                accept=".xls,.xlsx,.xml,.csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importSheet(file);
                  event.currentTarget.value = "";
                }}
              />
              <b>{fileName || "Choose completed bid file"}</b>
              <small>
                {deal && customer
                  ? "Excel or CSV · up to 10 MB"
                  : "Select both the deal and customer first"}
              </small>
            </label>
          )}
        </article>
      </section>
      {!takeAll && deal && customer && (
        <section className="customerBidLineEntry">
          <div className="customerBidLineEntryHeading">
            <div>
              <span>{multipleAwards ? "LOT-BY-LOT BID" : "LINE-ITEM BID"}</span>
              <h2>Enter the customer’s unit prices</h2>
              <p>{multipleAwards ? "Each lot is shown and submitted as its own bid. Complete every line in any lot the customer is bidding on." : "Price any or all lines below. Quantity and total bid calculate automatically."}</p>
            </div>
            <div>
              <strong>{selected.length}</strong><small>priced lines</small>
              <strong>{money.format(total)}</strong><small>bid total</small>
            </div>
          </div>
          {deal.public_lines.length && multipleAwards ? (
            <div className="customerBidLotGroups">
              {lotGroups.map((lot) => {
                const lotTotal = lot.indexes.reduce((sum, index) => {
                  const entry = entries[index];
                  return sum + deal.public_lines[index].quantity * (Number(entry?.unitBid) || 0);
                }, 0);
                return <div className="customerBidLineTable" key={lot.boxNumber}>
                  <h3>Lot {lot.boxNumber} · {lot.quantity.toLocaleString()} items · {lotTotal > 0 ? money.format(lotTotal) : "No bid entered"}</h3>
                  <table>
                    <thead><tr><th>Line</th><th>Configuration / Description</th><th>Qty</th><th>Unit Bid</th><th>Lot Line Total</th><th>Bid Comments</th></tr></thead>
                    <tbody>{lot.indexes.map((index) => {
                      const line = deal.public_lines[index];
                      const entry = entries[index] || { unitBid: "", comments: "" };
                      const description = Object.entries(line.values).filter(([, value]) => String(value || "").trim()).map(([key, value]) => `${key}: ${value}`).join(" · ");
                      const lineTotal = line.quantity * (Number(entry.unitBid) || 0);
                      return <tr key={`${line.line}-${index}`}>
                        <td>{line.line}</td><td>{description || `Line ${line.line}`}</td><td>{line.quantity.toLocaleString()}</td>
                        <td><label className="customerBidMoneyInput"><span>$</span><input type="number" min="0" step="0.01" inputMode="decimal" value={entry.unitBid} onChange={(event) => setEntries((current) => ({ ...current, [index]: { ...entry, unitBid: event.target.value } }))} aria-label={`Unit bid for line ${line.line}`} placeholder="0.00" /></label></td>
                        <td className="customerBidLineTotal">{lineTotal > 0 ? money.format(lineTotal) : "—"}</td>
                        <td><input className="customerBidLineComment" value={entry.comments} onChange={(event) => setEntries((current) => ({ ...current, [index]: { ...entry, comments: event.target.value } }))} aria-label={`Comments for line ${line.line}`} placeholder="Optional" /></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>;
              })}
            </div>
          ) : deal.public_lines.length ? (
            <div className="customerBidLineTable">
              <table>
                <thead><tr><th>Line</th><th>Configuration / Description</th><th>Qty</th><th>Unit Bid</th><th>Total</th><th>Bid Comments</th></tr></thead>
                <tbody>
                  {deal.public_lines.map((line, index) => {
                    const entry = entries[index] || { unitBid: "", comments: "" };
                    const description = Object.entries(line.values).filter(([, value]) => String(value || "").trim()).map(([key, value]) => `${key}: ${value}`).join(" · ");
                    const lineTotal = line.quantity * (Number(entry.unitBid) || 0);
                    return (
                      <tr key={`${line.line}-${index}`}>
                        <td>{line.line}</td><td>{description || `Line ${line.line}`}</td><td>{line.quantity.toLocaleString()}</td>
                        <td><label className="customerBidMoneyInput"><span>$</span><input type="number" min="0" step="0.01" inputMode="decimal" value={entry.unitBid} onChange={(event) => setEntries((current) => ({ ...current, [index]: { ...entry, unitBid: event.target.value } }))} aria-label={`Unit bid for line ${line.line}`} placeholder="0.00" /></label></td>
                        <td className="customerBidLineTotal">{lineTotal > 0 ? money.format(lineTotal) : "—"}</td>
                        <td><input className="customerBidLineComment" value={entry.comments} onChange={(event) => setEntries((current) => ({ ...current, [index]: { ...entry, comments: event.target.value } }))} aria-label={`Comments for line ${line.line}`} placeholder="Optional" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="customerBidLineEmpty">This deal has no itemized lines. Upload its completed bid spreadsheet or use a take-all offer.</p>}
        </section>
      )}
      {deal && (
        <section className="customerBidExisting">
          <div>
            <span>EXISTING OFFERS</span>
            <h2>{deal.deal_number} bid history</h2>
          </div>
          {existingBids.length ? (
            <table>
              <thead>
                <tr>
                  <th>Bidder</th>
                  <th>Contact</th>
                  <th>Offer</th>
                  <th>Status</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {existingBids.map((bid) => (
                  <tr key={bid.internal_bid_number}>
                    <td>{bid.company}</td>
                    <td>{bid.contact_name}</td>
                    <td>{bid.lot_number ? `Lot ${bid.lot_number} · ` : ""}{money.format(Number(bid.total_bid))}</td>
                    <td>{bid.status}</td><td><a href={`/employee/customer-bid?deal=${encodeURIComponent(deal.deal_number)}&bid=${encodeURIComponent(bid.internal_bid_number)}`}>Edit</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No offers have been submitted for this deal yet.</p>
          )}
        </section>
      )}
      {customer && (
        <section className="customerBidContact">
          <div className="customerBidContactHeading">
            <div>
              <span>CUSTOMER DETAILS</span>
              <h2>Confirm contact and address</h2>
              <p>Customer information is optional on employee-entered bids.</p>
            </div>
            <b className="complete">Optional</b>
          </div>
          <div className="customerBidContactFields">
            <label>
              Company
              <input
                value={contact.company}
                onChange={(event) =>
                  updateContact("company", event.target.value)
                }
              />
            </label>
            <label>
              Contact name
              <input
                value={contact.contactName}
                onChange={(event) =>
                  updateContact("contactName", event.target.value)
                }
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={contact.email}
                onChange={(event) => updateContact("email", event.target.value)}
              />
            </label>
            <ContactTemplateFields
              phone={contact.phone}
              city={contact.city}
              region={contact.region}
              country={contact.country}
              onChange={(name, value) => updateContact(name, value)}
            />
            <label className="wide">
              Address
              <input
                value={contact.address1}
                onChange={(event) =>
                  updateContact("address1", event.target.value)
                }
              />
            </label>
            <label className="wide">
              Address line 2 <small>Optional</small>
              <input
                value={contact.address2}
                onChange={(event) =>
                  updateContact("address2", event.target.value)
                }
              />
            </label>
            <label>
              ZIP / Postal code
              <input
                value={contact.postalCode}
                onChange={(event) =>
                  updateContact("postalCode", event.target.value)
                }
              />
            </label>
          </div>
        </section>
      )}
      {offerReady && customer && (
        <section className="customerBidReview">
          <div>
            <span>CUSTOMER</span>
            <strong>{contact.company || customer.company}</strong>
            <small>
              {contact.contactName || customer.contact_name} ·{" "}
              {contact.email || customer.email}
            </small>
          </div>
          <div>
            <span>DEAL</span>
            <strong>{deal?.deal_number}</strong>
            <small>{takeAll ? "Take-all offer" : fileName}</small>
          </div>
          <div>
            <span>{takeAll ? "OFFER TYPE" : "PRICED LINES"}</span>
            <strong>{takeAll ? "Take All" : selected.length}</strong>
            <small>{offerQuantity.toLocaleString()} total units</small>
          </div>
          <div>
            <span>BID TOTAL</span>
            <strong>{money.format(offerTotal)}</strong>
            <small>
              {takeAll
                ? "One price for the entire deal"
                : "Calculated from unit bids"}
            </small>
          </div>
          <label>
            Internal notes
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes about the emailed offer"
            />
          </label>
          <button
            onClick={submit}
            disabled={busy || Boolean(confirmation)}
          >
            {busy
              ? editingBidNumber ? "Updating customer bid…" : "Submitting customer bid…"
              : confirmation
                ? "Bid submitted ✓"
                : editingBidNumber ? "Update Customer Bid" : "Submit Bid for Customer"}
          </button>
        </section>
      )}
      {message && <p className="customerBidMessage">{message}</p>}
      {confirmation && (
        <section className="customerBidConfirmation">
          <span>INTERNAL BID NUMBER</span>
          <strong>{confirmation}</strong>
          <a href="/employee/deals">Open Deal Management</a>
        </section>
      )}
      {error && (
        <p className="customerBidError" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
