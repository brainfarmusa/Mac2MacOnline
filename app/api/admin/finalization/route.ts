import { env } from "cloudflare:workers";
import { employeeUser } from "../../../../lib/employee-server";
import { pddSupabaseKey, pddSupabaseUrl } from "../../../../lib/pdd-auth";

const schema = `CREATE TABLE IF NOT EXISTS deal_finalizations (
  deal_number TEXT PRIMARY KEY NOT NULL,
  vendor_accepted INTEGER NOT NULL DEFAULT 0,
  vendor_accepted_by TEXT NOT NULL DEFAULT '',
  vendor_accepted_at TEXT,
  customer_email_sent_to TEXT NOT NULL DEFAULT '',
  customer_email_sent_at TEXT,
  vendor_email_sent_to TEXT NOT NULL DEFAULT '',
  vendor_email_sent_at TEXT,
  terms_conditions TEXT NOT NULL DEFAULT '',
  finalized_by TEXT NOT NULL DEFAULT '',
  finalized_at TEXT,
  updated_at TEXT NOT NULL
)`;

const defaultTerms = "Payment is due according to the terms shown on the purchase order. Vendor confirms lawful ownership, accurate quantities and configurations, and secure packaging. Goods are subject to inspection and acceptance by Mac2MacOnline.";
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char);
const recipientEmails = (value: unknown) => String(value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
const validRecipients = (value: unknown) => {
  const emails = recipientEmails(value);
  return emails.length > 0 && emails.every((email) => /^\S+@\S+\.\S+$/.test(email));
};

function upstream(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", pddSupabaseKey);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${pddSupabaseUrl}${path}`, { ...init, headers });
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function attachment(path: string, token: string, filename: string) {
  const response = await fetch(`${pddSupabaseUrl}/storage/v1/object/authenticated/pdd-deal-uploads/${encodePath(path)}`, { headers: { apikey: pddSupabaseKey, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${filename} could not be retrieved.`);
  return { filename, content: arrayBufferToBase64(await response.arrayBuffer()) };
}

async function sendAwardEmail(to: string, subject: string, html: string, attachments: Array<{ filename: string; content: string }>) {
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!runtime.RESEND_API_KEY) throw new Error("Award email is not configured.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${runtime.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: runtime.BID_EMAIL_FROM || "Mac2MacOnline Deal Desk <bids@mac2maconline.com>", to: recipientEmails(to), subject, html, attachments }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Email service returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function state(dealNumber: string) {
  await env.DB.prepare(schema).run();
  return env.DB.prepare("SELECT * FROM deal_finalizations WHERE deal_number=? LIMIT 1").bind(dealNumber).first();
}

export async function GET(request: Request) {
  if (!(await employeeUser(request))) return Response.json({ error: "Employee access required." }, { status: 401 });
  const dealNumber = (new URL(request.url).searchParams.get("deal") || "").trim().toUpperCase();
  if (!dealNumber) return Response.json({ error: "Deal number is required." }, { status: 400 });
  return Response.json({ finalization: await state(dealNumber), defaultTerms });
}

export async function POST(request: Request) {
  const employee = await employeeUser(request);
  if (!employee) return Response.json({ error: "Employee access required." }, { status: 401 });
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const body = await request.json() as { action?: string; dealNumber?: string; terms?: string; to?: string; subject?: string; message?: string };
  const deal = String(body.dealNumber || "").trim().toUpperCase();
  if (!deal) return Response.json({ error: "Deal number is required." }, { status: 400 });
  await env.DB.prepare(schema).run();
  const now = new Date().toISOString();
  try {
    if (body.action === "vendor_accepted") {
      await env.DB.prepare("INSERT INTO deal_finalizations (deal_number,vendor_accepted,vendor_accepted_by,vendor_accepted_at,terms_conditions,updated_at) VALUES (?,1,?,?,?,?) ON CONFLICT(deal_number) DO UPDATE SET vendor_accepted=1,vendor_accepted_by=excluded.vendor_accepted_by,vendor_accepted_at=excluded.vendor_accepted_at,updated_at=excluded.updated_at").bind(deal, employee.displayName, now, defaultTerms, now).run();
    } else if (body.action === "send_customer") {
      const response = await upstream(`/rest/v1/pdd_sales_orders?deal_number=eq.${encodeURIComponent(deal)}&select=so_number,customer_company,customer_contact,customer_email,xlsx_storage_path,pdf_storage_path&limit=1`, token);
      const order = response.ok ? (await response.json() as Array<Record<string, string>>)[0] : null;
      const recipient = String(body.to || order?.customer_email || "").trim(), subject = String(body.subject || `Deal ${deal} awarded — ${order?.so_number || "Sales Order"}`).trim(), emailMessage = String(body.message || "").trim();
      if (!validRecipients(recipient) || !order?.pdf_storage_path) throw new Error("Enter valid customer email addresses separated by commas and create the sales order PDF before sending the award.");
      const files = [await attachment(order.pdf_storage_path, token, `${order.so_number}.pdf`)];
      if (order.xlsx_storage_path) files.push(await attachment(order.xlsx_storage_path, token, `${order.so_number}.xlsx`));
      const html = emailMessage ? `<p>${escapeHtml(emailMessage).replace(/\n/g, "<br>")}</p>` : `<h2>Your company has been awarded Deal ${escapeHtml(deal)}.</h2><p>Hello ${escapeHtml(order.customer_contact || order.customer_company)},</p><p>Congratulations. Your offer has been accepted. The attached sales order <strong>${escapeHtml(order.so_number)}</strong> confirms the award and order details.</p><p>Please reply with any questions.</p>`;
      await sendAwardEmail(recipient, subject, html, files);
      await env.DB.prepare("INSERT INTO deal_finalizations (deal_number,customer_email_sent_to,customer_email_sent_at,terms_conditions,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(deal_number) DO UPDATE SET customer_email_sent_to=excluded.customer_email_sent_to,customer_email_sent_at=excluded.customer_email_sent_at,updated_at=excluded.updated_at").bind(deal, recipient, now, defaultTerms, now).run();
    } else if (body.action === "send_vendor") {
      const response = await upstream(`/rest/v1/pdd_purchase_orders?deal_number=eq.${encodeURIComponent(deal)}&select=po_number,xlsx_storage_path,pdf_storage_path,vendor_id&limit=1`, token);
      const order = response.ok ? (await response.json() as Array<{ po_number: string; xlsx_storage_path: string | null; pdf_storage_path: string | null; vendor_id: string }>)[0] : null;
      const vendorResponse = order?.vendor_id ? await upstream(`/rest/v1/pdd_vendors?id=eq.${encodeURIComponent(order.vendor_id)}&select=company_name,contact_name,email&limit=1`, token) : null;
      const vendor = vendorResponse?.ok ? (await vendorResponse.json() as Array<{ company_name: string; contact_name: string; email: string }>)[0] : null;
      const terms = String(body.terms || defaultTerms).trim(), recipient=String(body.to||vendor?.email||"").trim(), subject=String(body.subject||`Purchase award for Deal ${deal} — ${order?.po_number||"Purchase Order"}`).trim(), emailMessage=String(body.message||"").trim();
      if (!validRecipients(recipient) || !order?.pdf_storage_path) throw new Error("Enter valid vendor email addresses separated by commas and create the purchase-order PDF before sending the award.");
      const files = [await attachment(order.pdf_storage_path, token, `${order.po_number}.pdf`)];
      if (order.xlsx_storage_path) files.push(await attachment(order.xlsx_storage_path, token, `${order.po_number}.xlsx`));
      const html=emailMessage?`<p>${escapeHtml(emailMessage).replace(/\n/g,"<br>")}</p><h3>Terms and conditions</h3><p>${escapeHtml(terms).replace(/\n/g,"<br>")}</p>`:`<h2>Mac2MacOnline confirms the purchase award for Deal ${escapeHtml(deal)}.</h2><p>Hello ${escapeHtml(vendor?.contact_name || vendor?.company_name)},</p><p>The attached purchase order <strong>${escapeHtml(order.po_number)}</strong> confirms our award.</p><h3>Terms and conditions</h3><p>${escapeHtml(terms).replace(/\n/g, "<br>")}</p><p>Please reply to confirm receipt.</p>`;
      await sendAwardEmail(recipient,subject,html,files);
      await env.DB.prepare("INSERT INTO deal_finalizations (deal_number,vendor_email_sent_to,vendor_email_sent_at,terms_conditions,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(deal_number) DO UPDATE SET vendor_email_sent_to=excluded.vendor_email_sent_to,vendor_email_sent_at=excluded.vendor_email_sent_at,terms_conditions=excluded.terms_conditions,updated_at=excluded.updated_at").bind(deal,recipient,now,terms,now).run();
    } else if (body.action === "finalize") {
      const current = await state(deal) as { customer_email_sent_at?: string; vendor_email_sent_at?: string } | null;
      if (!current?.customer_email_sent_at || !current?.vendor_email_sent_at) throw new Error("Send both award emails before finalizing the deal.");
      const update = JSON.stringify({ order_status: "awarded_pending_fulfillment", completed_at: null, updated_at: now });
      const [po, so] = await Promise.all([
        upstream(`/rest/v1/pdd_purchase_orders?deal_number=eq.${encodeURIComponent(deal)}`, token, { method: "PATCH", headers: { Prefer: "return=representation" }, body: update }),
        upstream(`/rest/v1/pdd_sales_orders?deal_number=eq.${encodeURIComponent(deal)}`, token, { method: "PATCH", headers: { Prefer: "return=representation" }, body: update }),
      ]);
      if (!po.ok || !so.ok || !(await po.json() as unknown[]).length || !(await so.json() as unknown[]).length) throw new Error("Both orders must exist before the deal can be finalized.");
      await env.DB.prepare("UPDATE deal_finalizations SET finalized_by=?,finalized_at=?,updated_at=? WHERE deal_number=?").bind(employee.displayName, now, now, deal).run();
    } else return Response.json({ error: "Choose a valid finalization action." }, { status: 400 });
    return Response.json({ ok: true, finalization: await state(deal) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The finalization step could not be completed." }, { status: 400 });
  }
}
