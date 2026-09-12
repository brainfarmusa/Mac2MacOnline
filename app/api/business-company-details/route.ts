import { env } from "cloudflare:workers";
import { employeeUser } from "../../../lib/employee-server";

const clean = (value: unknown, max = 300) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const allowedTypes = new Set(["customer", "vendor", "prospect"]);

export async function GET(request: Request) {
  const employee = await employeeUser(request);
  if (!employee) return Response.json({ error: "Employee access required." }, { status: 401 });
  const url = new URL(request.url), recordType = clean(url.searchParams.get("recordType"), 20), recordId = clean(url.searchParams.get("recordId"), 200);
  if (!allowedTypes.has(recordType) || !recordId) return Response.json({ error: "A valid company record is required." }, { status: 400 });
  const [contacts, address] = await Promise.all([
    env.DB.prepare("SELECT id,contact_name,job_title,email,phone,is_primary,created_at,updated_at FROM business_company_contacts WHERE record_type=? AND record_id=? ORDER BY is_primary DESC,contact_name,email").bind(recordType, recordId).all(),
    env.DB.prepare("SELECT * FROM business_company_addresses WHERE record_type=? AND record_id=? LIMIT 1").bind(recordType, recordId).first(),
  ]);
  return Response.json({ contacts: contacts.results || [], address: address || null });
}

export async function PUT(request: Request) {
  const employee = await employeeUser(request);
  if (!employee) return Response.json({ error: "Employee access required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>, recordType = clean(body.recordType, 20), recordId = clean(body.recordId, 200), contacts = Array.isArray(body.contacts) ? body.contacts : [], address = (body.address && typeof body.address === "object" ? body.address : {}) as Record<string, unknown>;
  if (!allowedTypes.has(recordType) || !recordId) return Response.json({ error: "A valid company record is required." }, { status: 400 });
  const normalized = contacts.slice(0, 50).map((raw) => { const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>; return { id: clean(row.id, 100) || crypto.randomUUID(), name: clean(row.contactName, 160), title: clean(row.jobTitle, 160), email: clean(row.email, 200).toLowerCase(), phone: clean(row.phone, 80), primary: row.isPrimary === true }; }).filter(row => row.name || row.email);
  const now = new Date().toISOString(), same = address.shippingSameAsBilling !== false;
  const statements = [env.DB.prepare("DELETE FROM business_company_contacts WHERE record_type=? AND record_id=?").bind(recordType, recordId), ...normalized.map((row, index) => env.DB.prepare("INSERT INTO business_company_contacts (id,record_type,record_id,contact_name,job_title,email,phone,is_primary,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(row.id,recordType,recordId,row.name,row.title,row.email,row.phone,index===0||row.primary?1:0,now,now)), env.DB.prepare("INSERT INTO business_company_addresses (id,record_type,record_id,billing_address1,billing_address2,billing_city,billing_region,billing_postal_code,billing_country,shipping_same_as_billing,shipping_address1,shipping_address2,shipping_city,shipping_region,shipping_postal_code,shipping_country,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(record_type,record_id) DO UPDATE SET billing_address1=excluded.billing_address1,billing_address2=excluded.billing_address2,billing_city=excluded.billing_city,billing_region=excluded.billing_region,billing_postal_code=excluded.billing_postal_code,billing_country=excluded.billing_country,shipping_same_as_billing=excluded.shipping_same_as_billing,shipping_address1=excluded.shipping_address1,shipping_address2=excluded.shipping_address2,shipping_city=excluded.shipping_city,shipping_region=excluded.shipping_region,shipping_postal_code=excluded.shipping_postal_code,shipping_country=excluded.shipping_country,updated_at=excluded.updated_at").bind(crypto.randomUUID(),recordType,recordId,clean(address.billingAddress1),clean(address.billingAddress2),clean(address.billingCity),clean(address.billingRegion),clean(address.billingPostalCode,80),clean(address.billingCountry,120)||"United States",same?1:0,same?clean(address.billingAddress1):clean(address.shippingAddress1),same?clean(address.billingAddress2):clean(address.shippingAddress2),same?clean(address.billingCity):clean(address.shippingCity),same?clean(address.billingRegion):clean(address.shippingRegion),same?clean(address.billingPostalCode,80):clean(address.shippingPostalCode,80),same?(clean(address.billingCountry,120)||"United States"):(clean(address.shippingCountry,120)||"United States"),now)];
  await env.DB.batch(statements);
  return Response.json({ ok: true });
}
