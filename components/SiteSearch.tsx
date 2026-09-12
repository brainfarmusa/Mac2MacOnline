"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const pages = [
  ["Home", "/", "Mac2MacOnline wholesale technology remarketing electronics"],
  ["Live Bid Board", "/live-bid-board", "public deal desk active deals inventory bids lots"],
  ["Equipment We Buy", "/equipment-we-buy", "computers servers parts technology"],
  ["Upgrade Trade-In Program", "/trade-in", "trade in upgrade equipment credit"],
  ["Consignment", "/consignment", "sell equipment commission market"],
  ["Want to Buy", "/want-to-buy", "request equipment purchasing"],
  ["Want to Sell", "/want-to-sell", "sell inventory quote"],
  ["RAM and Memory", "/we-buy-ram", "DDR3 DDR4 DDR5 ECC memory"],
  ["SSDs and Storage", "/we-buy-ssds", "NVMe SATA enterprise drives"],
  ["GPUs and AI Accelerators", "/we-buy-gpus", "NVIDIA graphics cards accelerators"],
  ["Apple Equipment", "/we-buy-apple-equipment", "MacBook Mac Studio iMac displays"],
  ["Servers and Networking", "/sell-used-servers-networking", "rack servers switches network"],
  ["R2v3 Electronics Recycling", "/r2v3-electronics-recycling", "recycling data destruction compliance"],
  ["Northern California ITAD", "/itad-chico-northern-california", "Chico asset disposition pickup"],
  ["M2M R2 Grading", "/m2m-r2-grading", "R2 cosmetic C0 C9 functional F1 F6 data sanitization equipment categories"],
  ["Certifications", "/certifications", "R2v3 ISO 9001 14001 45001"],
  ["Insights", "/insights", "articles guides surplus technology"],
  ["About Mac2MacOnline", "/about", "company partnership Sierra Circuit Repair"],
  ["Request a Quote", "/request-quote", "contact pricing offer"],
  ["My Account", "/account", "customer bids profile login"],
  ["Deal Workbook", "/employee", "employee dashboard administration"],
  ["Chico Stock", "/employee/chico-stock", "inventory receiving warehouse activity reports"],
  ["Active Bid Summary", "/employee/active-bids", "deal bid summary"],
  ["Manage Deals and Awards", "/employee/deals", "deal management awards"],
  ["Vendors and Customers", "/employee/contacts", "contacts vendors customers spreadsheet"],
  ["Open Orders", "/employee/open-orders", "purchase orders sales orders"],
  ["Reports", "/employee/reports", "sales purchasing employee reports"],
  ["Mailchimp", "/employee/mailchimp", "email marketing audience contacts"],
] as const;

export default function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return pages.slice(0, 8);
    return pages.filter((page) => terms.every((term) => page.join(" ").toLowerCase().includes(term))).slice(0, 10);
  }, [query]);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return <>
    <button className="siteSearchButton" type="button" aria-label="Search Mac2MacOnline" onClick={() => setOpen(true)}>⌕<span>Search</span></button>
    {open && <div className="siteSearchBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="siteSearchPanel" role="dialog" aria-modal="true" aria-label="Search Mac2MacOnline">
        <div className="siteSearchInput"><span>⌕</span><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Mac2MacOnline…" aria-label="Search pages"/><button type="button" onClick={() => setOpen(false)} aria-label="Close search">×</button></div>
        <div className="siteSearchResults">
          {results.map(([title, href, keywords]) => <a key={href} href={href}><strong>{title}</strong><small>{keywords}</small><b>→</b></a>)}
          {!results.length && <p>No matching pages found. Try a product, service or task.</p>}
        </div>
      </section>
    </div>}
  </>;
}
