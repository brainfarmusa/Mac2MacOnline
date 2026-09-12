import { env } from "cloudflare:workers";

const clean = (value: unknown, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
export const companyKey = (value: unknown) => clean(value, 180).toLowerCase().replace(/&/g, "and").replace(/\b(incorporated|corporation|company|limited|inc|corp|co|llc|ltd)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export async function ensureCustomerCompany(input: { company: string; contactName: string; email: string; phone?: string; assignedEmployeeName?: string; assignedEmployeeEmail?: string; source: string }) {
  const key = companyKey(input.company), email = clean(input.email, 200).toLowerCase(), now = new Date().toISOString();
  if (!key || !email) return null;
  const rows = await env.DB.prepare("SELECT id,company,assigned_employee_name,assigned_employee_email FROM imported_customers").all<{id:string;company:string;assigned_employee_name:string;assigned_employee_email:string}>();
  const existing = (rows.results || []).find(row => companyKey(row.company) === key);
  const recordId = existing?.id || crypto.randomUUID();
  if (!existing) await env.DB.prepare("INSERT INTO imported_customers (id,email,company,contact_name,phone,address1,address2,city,region,postal_code,country,assigned_employee_name,assigned_employee_email,source,updated_at) VALUES (?,?,?,?,?,'','','','','','United States',?,?,?,?)").bind(recordId,email,clean(input.company,180),clean(input.contactName,160),clean(input.phone,80),clean(input.assignedEmployeeName,160)||"Unassigned",clean(input.assignedEmployeeEmail,200),clean(input.source,80),now).run();
  await env.DB.prepare("INSERT INTO business_company_contacts (id,record_type,record_id,contact_name,job_title,email,phone,is_primary,created_at,updated_at) VALUES (?,'customer',?,?,?,?,?,CASE WHEN EXISTS (SELECT 1 FROM business_company_contacts WHERE record_type='customer' AND record_id=?) THEN 0 ELSE 1 END,?,?) ON CONFLICT(record_type,record_id,email) DO UPDATE SET contact_name=CASE WHEN excluded.contact_name<>'' THEN excluded.contact_name ELSE business_company_contacts.contact_name END,phone=CASE WHEN excluded.phone<>'' THEN excluded.phone ELSE business_company_contacts.phone END,updated_at=excluded.updated_at").bind(crypto.randomUUID(),recordId,clean(input.contactName,160),"",email,clean(input.phone,80),recordId,now,now).run();
  return { recordId, existing: Boolean(existing), assignedEmployeeName: existing?.assigned_employee_name || clean(input.assignedEmployeeName,160), assignedEmployeeEmail: existing?.assigned_employee_email || clean(input.assignedEmployeeEmail,200) };
}
