"use client";

import { useEffect, useMemo, useState } from "react";
import { readBoxAwardSpreadsheet } from "../../../lib/boxAwardSpreadsheetImport";
import { clearPddSession, currentPddSession } from "../../../lib/pdd-auth";
import "./box-awards.css";

type PublicLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
};
type Deal = {
  deal_number: string;
  title: string;
  status: string;
  quantity: number;
  public_lines?: PublicLine[];
};
type BidLine = {
  lineNumber: number;
  quantity: number;
  unitBid: number;
  boxNumber?: string;
  boxBid?: number;
};
type Bid = {
  internal_bid_number: string;
  company: string;
  contact_name: string;
  offer_type: string;
  status: string;
  line_items: BidLine[];
};
type Award = { box_number: string; internal_bid_number: string };
type BoxGroup = {
  boxNumber: string;
  controlNumber: string;
  quantity: number;
  lineNumbers: number[];
};

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const field = (values: Record<string, string>, aliases: string[]) => {
  const wanted = new Set(aliases.map(key));
  return String(
    Object.entries(values).find(([name]) => wanted.has(key(name)))?.[1] || "",
  ).trim();
};

function boxesFor(deal?: Deal) {
  const groups = new Map<string, BoxGroup>();
  let currentBox = "",
    currentControl = "";
  for (const line of [...(deal?.public_lines || [])].sort(
    (a, b) => a.line - b.line,
  )) {
    if (
      Object.values(line.values || {}).some((value) =>
        /^\s*((?:box|lot)\s*)?totals?:?\s*$/i.test(String(value)),
      )
    )
      continue;
    const explicitBox = field(line.values || {}, [
      "Box #",
      "Box Number",
      "Box",
      "Lot #",
      "Lot Number",
      "Lot",
      "Container #",
      "Container Number",
    ]);
    const explicitControl = field(line.values || {}, [
      "Control #",
      "Control Number",
      "Control",
    ]);
    if (explicitBox)
      currentBox = explicitBox.replace(/^(?:box|lot)\s*/i, "").trim();
    if (explicitControl) currentControl = explicitControl;
    if (!currentBox) continue;
    const group = groups.get(currentBox) || {
      boxNumber: currentBox,
      controlNumber: currentControl,
      quantity: 0,
      lineNumbers: [],
    };
    group.controlNumber ||= currentControl;
    group.quantity += Math.max(0, Math.trunc(Number(line.quantity) || 0));
    group.lineNumbers.push(Number(line.line));
    groups.set(currentBox, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.boxNumber.localeCompare(b.boxNumber, undefined, { numeric: true }),
  );
}

function offerFor(bid: Bid, box: BoxGroup) {
  const lines = new Set(box.lineNumbers);
  const priced = (bid.line_items || []).filter((line) =>
    lines.has(Number(line.lineNumber)),
  );
  const storedBox = priced.find(
    (line) =>
      String(line.boxNumber || "")
        .replace(/^(?:box|lot)\s*/i, "")
        .trim() === box.boxNumber &&
      Number.isFinite(Number(line.boxBid)) &&
      Number(line.boxBid) > 0,
  );
  return {
    amount: storedBox
      ? Number(storedBox.boxBid)
      : priced.reduce(
          (sum, line) =>
            sum + Number(line.quantity || 0) * Number(line.unitBid || 0),
          0,
        ),
    quantity: priced.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
  };
}

export default function BoxAwardsPage() {
  const [token, setToken] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealNumber, setDealNumber] = useState("");
  const [bids, setBids] = useState<Bid[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [uploadedBoxes, setUploadedBoxes] = useState<BoxGroup[] | null>(null);
  const [uploadedFile, setUploadedFile] = useState("");
  const [uploadedSheet, setUploadedSheet] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const session = await currentPddSession();
      if (!session) {
        window.location.replace(
          "/employee-login?return_to=/employee/box-awards",
        );
        return;
      }
      setToken(session.access_token);
      const response = await fetch("/api/admin/deals", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.status === 401) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      const data = await response.json();
      const available = [...(data.deals || [])].sort((a: Deal, b: Deal) =>
        b.deal_number.localeCompare(a.deal_number, undefined, {
          numeric: true,
        }),
      );
      setDeals(available);
      const requested = new URLSearchParams(window.location.search)
        .get("deal")
        ?.toUpperCase();
      setDealNumber(
        available.some((deal: Deal) => deal.deal_number === requested)
          ? requested || ""
          : available[0]?.deal_number || "",
      );
      setLoading(false);
    })();
  }, []);

  const deal = useMemo(
    () => deals.find((item) => item.deal_number === dealNumber),
    [deals, dealNumber],
  );
  const dealBoxes = useMemo(() => boxesFor(deal), [deal]);
  const boxes = uploadedBoxes || dealBoxes;

  useEffect(() => {
    if (!dealNumber || !token) {
      setBids([]);
      setAssignments({});
      return;
    }
    let active = true;
    setMessage("Loading customer bids and saved box awards…");
    void fetch(`/api/admin/box-awards?deal=${encodeURIComponent(dealNumber)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok) {
          setMessage(data.error || "Box awards could not be loaded.");
          return;
        }
        setBids(data.bids || []);
        setAssignments(
          Object.fromEntries(
            (data.awards || []).map((award: Award) => [
              award.box_number,
              award.internal_bid_number,
            ]),
          ),
        );
        setMessage("");
      });
    return () => {
      active = false;
    };
  }, [dealNumber, token]);

  const awardedCount = boxes.filter((box) => assignments[box.boxNumber]).length;
  const winners = useMemo(() => {
    const grouped = new Map<
      string,
      {
        company: string;
        bidNumber: string;
        boxes: string[];
        quantity: number;
        amount: number;
      }
    >();
    for (const box of boxes) {
      const bid = bids.find(
        (item) => item.internal_bid_number === assignments[box.boxNumber],
      );
      if (!bid) continue;
      const offer = offerFor(bid, box);
      const current = grouped.get(bid.internal_bid_number) || {
        company: bid.company,
        bidNumber: bid.internal_bid_number,
        boxes: [],
        quantity: 0,
        amount: 0,
      };
      current.boxes.push(box.boxNumber);
      current.quantity += box.quantity;
      current.amount += offer.amount;
      grouped.set(bid.internal_bid_number, current);
    }
    return [...grouped.values()];
  }, [assignments, bids, boxes]);

  async function uploadSpreadsheet(file: File) {
    setUploading(true);
    setMessage("Reading box-award spreadsheet…");
    try {
      const parsed = await readBoxAwardSpreadsheet(file);
      let targetDeal = deal;
      if (!targetDeal || parsed.totalQuantity !== Number(targetDeal.quantity)) {
        const quantityMatches = deals.filter(
          (item) => Number(item.quantity) === parsed.totalQuantity,
        );
        if (quantityMatches.length === 1) {
          targetDeal = quantityMatches[0];
          setDealNumber(targetDeal.deal_number);
        } else if (targetDeal) {
          throw new Error(
            `This spreadsheet contains ${parsed.totalQuantity.toLocaleString()} units, but ${targetDeal.deal_number} contains ${Number(targetDeal.quantity).toLocaleString()}. Choose the matching deal and upload the spreadsheet again.`,
          );
        } else {
          throw new Error(
            `No deal could be matched to the spreadsheet’s ${parsed.totalQuantity.toLocaleString()} units. Choose the matching deal and upload the spreadsheet again.`,
          );
        }
      }
      const targetDealBoxes = boxesFor(targetDeal),
        byBox = new Map(targetDealBoxes.map((box) => [box.boxNumber, box]));
      const reconciled = parsed.boxes.map((box) => {
        const published = byBox.get(box.boxNumber);
        return {
          ...box,
          controlNumber: box.controlNumber || published?.controlNumber || "",
          lineNumbers: published?.lineNumbers.length
            ? published.lineNumbers
            : box.lineNumbers,
        };
      });
      setUploadedBoxes(reconciled);
      setUploadedFile(file.name);
      setUploadedSheet(parsed.sheetName);
      setMessage(
        `${file.name} loaded for ${targetDeal.deal_number}: ${reconciled.length} boxes, ${parsed.totalQuantity.toLocaleString()} units from ${parsed.sheetName}.`,
      );
    } catch (error) {
      setUploadedBoxes(null);
      setUploadedFile("");
      setUploadedSheet("");
      setMessage(
        error instanceof Error
          ? error.message
          : "The box-award spreadsheet could not be opened.",
      );
      setFileInputKey((current) => current + 1);
    } finally {
      setUploading(false);
    }
  }

  function clearSpreadsheet() {
    setUploadedBoxes(null);
    setUploadedFile("");
    setUploadedSheet("");
    setFileInputKey((current) => current + 1);
    setMessage(
      "Uploaded spreadsheet cleared. Using the selected deal’s published box rows.",
    );
  }

  async function save() {
    if (!dealNumber) return;
    setSaving(true);
    setMessage("Saving box awards…");
    const awards = boxes.flatMap((box) => {
      const internalBidNumber = assignments[box.boxNumber];
      const bid = bids.find(
        (item) => item.internal_bid_number === internalBidNumber,
      );
      if (!bid) return [];
      const offer = offerFor(bid, box);
      return [
        {
          boxNumber: box.boxNumber,
          controlNumber: box.controlNumber,
          quantity: box.quantity,
          lineNumbers: box.lineNumbers,
          internalBidNumber,
          awardAmount: offer.amount,
        },
      ];
    });
    const response = await fetch("/api/admin/box-awards", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dealNumber, awards }),
    });
    const data = await response.json();
    setSaving(false);
    setMessage(
      response.ok
        ? `${data.saved} box award${data.saved === 1 ? "" : "s"} saved. ${data.saved === boxes.length && boxes.length ? "This deal is fully awarded." : `${boxes.length - data.saved} box${boxes.length - data.saved === 1 ? " remains" : "es remain"} unawarded.`}`
        : data.error || "Box awards could not be saved.",
    );
  }

  if (loading)
    return (
      <main className="boxAwardsPage">
        <p>Opening Box Awards…</p>
      </main>
    );
  return (
    <main className="boxAwardsPage">
      <header>
        <div>
          <p className="eyebrow">DEAL WORKFLOW</p>
          <h1>Multiple Awards by Box/Lot</h1>
          <p>
            Keep one deal together while awarding each Box # or Lot # to the
            customer who won it.
          </p>
        </div>
        <a className="button secondary" href="/employee">
          ← Dashboard
        </a>
      </header>
      <section className="boxAwardControls">
        <label>
          Deal
          <select
            value={dealNumber}
            onChange={(event) => {
              setDealNumber(event.target.value);
              setUploadedBoxes(null);
              setUploadedFile("");
              setUploadedSheet("");
              setFileInputKey((current) => current + 1);
            }}
          >
            <option value="">Choose a deal</option>
            {deals.map((item) => (
              <option key={item.deal_number} value={item.deal_number}>
                {item.deal_number} — {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="boxAwardProgress">
          <strong>
            {awardedCount} of {boxes.length}
          </strong>
          <span>boxes assigned</span>
        </div>
        <button
          className="button"
          type="button"
          disabled={saving || !boxes.length}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save Box Awards"}
        </button>
      </section>
      <section className="boxAwardUpload">
        <div>
          <p className="eyebrow">ORIGINAL AWARD SPREADSHEET</p>
          <h2>Upload the spreadsheet containing the Box # or Lot # groups</h2>
          <p>
            Use the original Excel file for this deal. The workbook may contain
            a Container Log, Detail by Box/Lot, or both.
          </p>
        </div>
        <label className="boxAwardFileButton">
          {uploading
            ? "Reading Spreadsheet…"
            : uploadedFile
              ? "Choose a Different Spreadsheet"
              : "Choose Spreadsheet"}
          <input
            key={fileInputKey}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={uploading || !dealNumber}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadSpreadsheet(file);
            }}
          />
        </label>
        {uploadedFile && (
          <div className="boxAwardFileStatus">
            <strong>{uploadedFile}</strong>
            <span>
              {uploadedSheet} · {boxes.length} boxes
            </span>
            <button type="button" onClick={clearSpreadsheet}>
              Remove
            </button>
          </div>
        )}
      </section>
      {message && <p className="boxAwardMessage">{message}</p>}
      {!boxes.length ? (
        <section className="boxAwardEmpty">
          <h2>Upload the original deal spreadsheet</h2>
          <p>
            Choose the matching deal above, then upload the workbook containing
            its Box # or Lot # and Qty columns.
          </p>
        </section>
      ) : (
        <>
          <section className="boxAwardTable">
            <table>
              <thead>
                <tr>
                  <th>Box/Lot #</th>
                  <th>Control #</th>
                  <th>Qty</th>
                  <th>Award to customer bid</th>
                  <th>Winning amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {boxes.map((box) => {
                  const selectedBid = bids.find(
                    (bid) =>
                      bid.internal_bid_number === assignments[box.boxNumber],
                  );
                  const selectedOffer = selectedBid
                    ? offerFor(selectedBid, box)
                    : null;
                  return (
                    <tr key={box.boxNumber}>
                      <td>
                        <strong>{box.boxNumber}</strong>
                        <small>
                          {box.lineNumbers.length} source line
                          {box.lineNumbers.length === 1 ? "" : "s"}
                        </small>
                      </td>
                      <td>{box.controlNumber || "—"}</td>
                      <td>{box.quantity.toLocaleString()}</td>
                      <td>
                        <select
                          value={assignments[box.boxNumber] || ""}
                          onChange={(event) =>
                            setAssignments((current) => ({
                              ...current,
                              [box.boxNumber]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Not awarded</option>
                          {bids.map((bid) => {
                            const offer = offerFor(bid, box);
                            const complete =
                              offer.quantity === box.quantity &&
                              offer.amount > 0;
                            return (
                              <option
                                key={bid.internal_bid_number}
                                value={bid.internal_bid_number}
                                disabled={!complete}
                              >
                                {bid.company} · {bid.internal_bid_number}
                                {complete
                                  ? ` · ${dollars.format(offer.amount)}`
                                  : ` · incomplete (${offer.quantity}/${box.quantity})`}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      <td>
                        {selectedOffer
                          ? dollars.format(selectedOffer.amount)
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={
                            selectedBid ? "boxAwardWon" : "boxAwardOpen"
                          }
                        >
                          {selectedBid ? "Awarded" : "Unawarded"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <section className="boxAwardSummary">
            <div>
              <p className="eyebrow">AWARD SUMMARY</p>
              <h2>Orders grouped by winning customer</h2>
            </div>
            {winners.length ? (
              winners.map((winner) => (
                <article key={winner.bidNumber}>
                  <div>
                    <strong>{winner.company}</strong>
                    <span>{winner.bidNumber}</span>
                  </div>
                  <p>Boxes {winner.boxes.join(", ")}</p>
                  <p>{winner.quantity.toLocaleString()} units</p>
                  <b>{dollars.format(winner.amount)}</b>
                </article>
              ))
            ) : (
              <p className="boxAwardEmptyLine">
                Assign a customer bid to a box to build the winner summary.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
