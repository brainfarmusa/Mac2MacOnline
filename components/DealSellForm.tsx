"use client";

import { FormEvent, useState } from "react";
import InternationalPhoneField from "@/components/InternationalPhoneField";

type WantedLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
};

const productForLine = (line: WantedLine) =>
  line.values.Product ||
  line.values.Description ||
  line.values.Model ||
  Object.values(line.values)[0] ||
  `Requested item ${line.line}`;

export default function DealSellForm({
  dealNumber,
  category,
  lines,
}: {
  dealNumber: string;
  category: string;
  lines: WantedLine[];
}) {
  const [status, setStatus] = useState(
    "We will generally respond with an offer within 24 hours.",
  );
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<number[]>([]);

  function addItem() {
    setItems((current) => [...current, Math.max(...current, 0) + 1]);
  }

  function removeItem(item: number) {
    setItems((current) => current.filter((entry) => entry !== item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const files = Array.from(
      form.querySelector<HTMLInputElement>('input[type="file"]')?.files || [],
    );
    if (files.some((file) => !file.size)) {
      setState("error");
      setStatus("One of the selected attachments is empty. Save the file, then select it again.");
      return;
    }
    if (files.length > 5 || files.some((file) => file.size > 10 * 1024 * 1024)) {
      setState("error");
      setStatus("Attach no more than five files, up to 10MB each.");
      return;
    }
    setSubmitting(true);
    setState("working");
    setStatus("Securely sending your inventory response…");
    try {
      const data = new FormData(form);
      const csvRows = [
        ["Item", "Product", "Condition", "Manufacturer", "Part number", "Capacity / type", "Quantity", "Unit price", "Notes"],
        ...lines.map((line, index) => [
          String(index + 1),
          productForLine(line),
          String(data.get(`Line ${line.line} condition`) || ""),
          String(data.get(`Line ${line.line} manufacturer`) || ""),
          String(data.get(`Line ${line.line} part number`) || ""),
          String(data.get(`Line ${line.line} capacity and type`) || ""),
          String(data.get(`Line ${line.line} quantity available`) || ""),
          String(data.get(`Line ${line.line} unit price`) || ""),
          String(data.get(`Line ${line.line} notes`) || ""),
        ]),
        ...items.map((item, index) => [
          String(lines.length + index + 1),
          String(data.get(`Item ${item} product`) || ""),
          String(data.get(`Item ${item} condition`) || ""),
          String(data.get(`Item ${item} manufacturer`) || ""),
          String(data.get(`Item ${item} part number`) || ""),
          String(data.get(`Item ${item} capacity and type`) || ""),
          String(data.get(`Item ${item} quantity`) || ""),
          String(data.get(`Item ${item} unit price`) || ""),
          String(data.get(`Item ${item} notes`) || ""),
        ]),
      ];
      const csv = csvRows
        .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
        .join("\r\n");
      data.append(
        "Attachments",
        new File([csv], `${dealNumber}-inventory-response.csv`, { type: "text/csv" }),
      );
      data.append("Inventory item count", String(lines.length + items.length));

      const response = await fetch("/api/inquiries", {
        method: "POST",
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Your inventory response could not be submitted.");
      form.reset();
      setItems([]);
      setState("success");
      setStatus(
        `Thank you. Your ${dealNumber} response was received. Reference: ${result.reference || "submitted"}`,
      );
    } catch (reason) {
      setState("error");
      setStatus(
        reason instanceof Error
          ? reason.message
          : "Your inventory response could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="dealSellForm" onSubmit={submit} encType="multipart/form-data">
      <input type="hidden" name="Inquiry type" value="want-to-sell" />
      <input type="hidden" name="Website source" value={`WTB deal ${dealNumber}`} />
      <input type="hidden" name="WTB deal number" value={dealNumber} />
      <input type="hidden" name="Requested category" value={category} />
      <label className="form-trap" aria-hidden="true">
        Website<input name="Website" tabIndex={-1} autoComplete="off" />
      </label>
      <header>
        <span>RESPOND TO {dealNumber}</span>
        <h2>Tell us exactly what you can supply.</h2>
        <p>
          Complete the contact information and the fields for each requested
          product you have available. Leave unavailable products blank.
        </p>
      </header>
      <section className="dealSellContact">
        <label>Full name<input required name="Name" autoComplete="name" /></label>
        <label>Company (optional)<input name="Company" autoComplete="organization" /></label>
        <label>Email<input required type="email" name="Email" autoComplete="email" /></label>
        <InternationalPhoneField required />
        <label>Inventory location<input required name="Location" placeholder="City, state and country" /></label>
        <label>Available to ship<input name="Timing" placeholder="Now, date or lead time" /></label>
      </section>
      <section className="dealSellLines">
        <header>
          <h2>
            {category || "Requested products"}: <em>Enter what you have or upload a spreadsheet below.</em>
          </h2>
          <span>{lines.length} requested line{lines.length === 1 ? "" : "s"}</span>
        </header>
        {lines.map((line) => {
          const product = productForLine(line);
          const partNumber =
            line.values["Part Number"] || line.values.MPN || line.values.PN || "";
          const capacity =
            line.values.Capacity || line.values["Capacity / type"] || "";
          return (
            <article key={line.line}>
              <input type="hidden" name={`Line ${line.line} requested product`} value={product} />
              <div className="dealSellRequested">
                <span>REQUESTED LINE {line.line}</span>
                <h3>{product}</h3>
                <p>
                  Wanted quantity: <strong>{line.quantity.toLocaleString()}</strong>
                  {partNumber ? ` · Part number: ${partNumber}` : ""}
                </p>
              </div>
              <div className="dealSellLineFields">
                <label>Manufacturer<input name={`Line ${line.line} manufacturer`} defaultValue={line.values.Manufacturer || line.values.MFG || ""} /></label>
                <label>Part number<input name={`Line ${line.line} part number`} defaultValue={partNumber} /></label>
                <label>Capacity / type<input name={`Line ${line.line} capacity and type`} defaultValue={capacity} /></label>
                <label>Quantity available<input type="number" min="0" name={`Line ${line.line} quantity available`} /></label>
                <label>Condition<select name={`Line ${line.line} condition`} defaultValue=""><option value="">Select condition</option><option>New / sealed</option><option>Tested working</option><option>Working pulls</option><option>Untested</option><option>Mixed condition</option></select></label>
                <label>Unit price<input type="number" min="0" step="0.01" name={`Line ${line.line} unit price`} placeholder="$0.00" /></label>
                <label className="wide">Line notes<textarea rows={2} name={`Line ${line.line} notes`} placeholder="Testing, grade, packaging, substitutions or other details" /></label>
              </div>
            </article>
          );
        })}
        {items.map((item, index) => (
          <article key={`extra-${item}`}>
            <div className="dealSellRequested">
              <span>ADDITIONAL ITEM {index + 1}</span>
              <h3>Another item you can supply</h3>
              <button type="button" className="dealSellRemoveItem" onClick={() => removeItem(item)}>Remove item</button>
            </div>
            <div className="dealSellLineFields">
              <label className="wide">Product<input required name={`Item ${item} product`} defaultValue={category || "RAM"} /></label>
              <label>Manufacturer<input name={`Item ${item} manufacturer`} placeholder="Samsung, Micron, SK hynix…" /></label>
              <label>Part number<input name={`Item ${item} part number`} placeholder="Exact label part number" /></label>
              <label>Capacity / type<input name={`Item ${item} capacity and type`} placeholder="32GB DDR4, DDR5 RDIMM…" /></label>
              <label>Quantity available<input required type="number" min="1" name={`Item ${item} quantity`} /></label>
              <label>Condition<select required name={`Item ${item} condition`} defaultValue=""><option value="">Select condition</option><option>New / sealed</option><option>Tested working</option><option>Working pulls</option><option>Untested</option><option>Mixed condition</option></select></label>
              <label>Unit price<input type="number" min="0" step="0.01" name={`Item ${item} unit price`} placeholder="$0.00" /></label>
              <label className="wide">Line notes<textarea rows={2} name={`Item ${item} notes`} placeholder="Testing, grade, packaging, substitutions or other details" /></label>
            </div>
          </article>
        ))}
        <button className="dealSellAddItem" type="button" onClick={addItem}>+ Add Item</button>
        <p className="dealSellSpreadsheetNote">Each item will be included in a spreadsheet sent with your response.</p>
      </section>
      <label className="dealSellUpload">
        Attach an inventory spreadsheet or photos
        <input type="file" name="Attachments" multiple accept=".pdf,.csv,.xls,.xlsx,.doc,.docx,.jpg,.jpeg,.png" />
        <small>Optional. Up to 5 files, 10MB each.</small>
      </label>
      <label className="dealSellNotes">
        Additional inventory notes
        <textarea name="Inventory" rows={4} placeholder="Add testing details, packaging, shipping information or anything else we should know." />
      </label>
      <label className="check">
        <input type="checkbox" required /> I authorize Mac2MacOnline to contact me about this inventory response.
      </label>
      <button className="button" disabled={submitting} type="submit">
        {submitting ? "Submitting…" : `Submit Response to ${dealNumber}`}
      </button>
      <p className="form-note" data-state={state}>{status}</p>
    </form>
  );
}
