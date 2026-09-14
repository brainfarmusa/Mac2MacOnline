import { env } from "cloudflare:workers";
import { employeeUser } from "../../../../lib/employee-server";

type CustomerRow = {
  user_id?: string | null;
  email?: string | null;
  company?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  assigned_employee_name?: string | null;
  assigned_employee_email?: string | null;
};
type DeletedCustomerRow = {
  customer_id?: string | null;
  email?: string | null;
};
const text = (value: unknown) => String(value || "").trim();
const deletedCustomerSchema =
  "CREATE TABLE IF NOT EXISTS deleted_directory_customers (customer_key TEXT PRIMARY KEY,customer_id TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',deleted_by TEXT NOT NULL,deleted_at TEXT NOT NULL)";

async function clearDeletedCustomer(id: string, email: string) {
  await env.DB.prepare(deletedCustomerSchema).run();
  await env.DB.prepare(
    "DELETE FROM deleted_directory_customers WHERE customer_id=? OR (?<>'' AND lower(trim(email))=lower(trim(?)))",
  )
    .bind(id, email, email)
    .run();
}

export async function GET(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json(
      { error: "Employee access required." },
      { status: 401 },
    );
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS customer_profiles (user_id TEXT PRIMARY KEY,email TEXT NOT NULL,company TEXT NOT NULL DEFAULT '',contact_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT 'United States',updated_at TEXT NOT NULL)",
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS imported_customers (id TEXT PRIMARY KEY,email TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',contact_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT 'United States',assigned_employee_name TEXT NOT NULL,assigned_employee_email TEXT NOT NULL,source TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL)",
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS internal_bid_customers (bid_id TEXT PRIMARY KEY,customer_user_id TEXT,address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT '')",
  ).run();
  await env.DB.prepare(deletedCustomerSchema).run();
  const [profiles, imports, bids, deleted] = await Promise.all([
    env.DB.prepare(
      "SELECT user_id,email,company,contact_name,phone,address1,address2,city,region,postal_code,country,updated_at FROM customer_profiles ORDER BY company,email",
    ).all<CustomerRow>(),
    env.DB.prepare(
      "SELECT id user_id,email,company,contact_name,phone,address1,address2,city,region,postal_code,country,updated_at,assigned_employee_name,assigned_employee_email FROM imported_customers ORDER BY company,email",
    ).all<CustomerRow>(),
    env.DB.prepare(
      "SELECT c.customer_user_id user_id,b.email,b.company,b.contact_name,b.phone,c.address1,c.address2,c.city,c.region,c.postal_code,c.country,b.submitted_at FROM internal_bids b LEFT JOIN internal_bid_customers c ON c.bid_id=b.id ORDER BY b.submitted_at DESC",
    ).all<CustomerRow>(),
    env.DB.prepare(
      "SELECT customer_id,email FROM deleted_directory_customers",
    ).all<DeletedCustomerRow>(),
  ]);
  const deletedIds = new Set(
      (deleted.results || []).map((row) => text(row.customer_id)).filter(Boolean),
    ),
    deletedEmails = new Set(
      (deleted.results || [])
        .map((row) => text(row.email).toLowerCase())
        .filter(Boolean),
    ),
    isDeleted = (row: CustomerRow) =>
      deletedIds.has(text(row.user_id)) ||
      deletedEmails.has(text(row.email).toLowerCase());
  const customers = new Map<string, Record<string, unknown>>();
  for (const row of profiles.results || []) {
    if (isDeleted(row)) continue;
    const key = text(row.email).toLowerCase() || text(row.user_id);
    if (!key) continue;
    customers.set(key, {
      id: text(row.user_id) || key,
      email: text(row.email),
      company: text(row.company),
      contact_name: text(row.contact_name),
      phone: text(row.phone),
      address1: text(row.address1),
      address2: text(row.address2),
      city: text(row.city),
      region: text(row.region),
      postal_code: text(row.postal_code),
      country: text(row.country),
      updated_at: text(row.updated_at),
      last_bid_at: "",
      bid_count: 0,
      has_account: Boolean(row.user_id),
    });
  }
  for (const row of imports.results || []) {
    if (isDeleted(row)) continue;
    const key = text(row.email).toLowerCase() || text(row.user_id);
    if (!key) continue;
    const current = customers.get(key);
    if (current) {
      for (const field of [
        "company",
        "contact_name",
        "phone",
        "address1",
        "address2",
        "city",
        "region",
        "postal_code",
        "country",
      ] as const) {
        if (!text(current[field]) && text(row[field]))
          current[field] = text(row[field]);
      }
      current.assigned_employee_name = text(row.assigned_employee_name);
      current.assigned_employee_email = text(row.assigned_employee_email);
      continue;
    }
    customers.set(key, {
      id: text(row.user_id) || key,
      email: text(row.email),
      company: text(row.company),
      contact_name: text(row.contact_name),
      phone: text(row.phone),
      address1: text(row.address1),
      address2: text(row.address2),
      city: text(row.city),
      region: text(row.region),
      postal_code: text(row.postal_code),
      country: text(row.country),
      updated_at: text(row.updated_at),
      last_bid_at: "",
      bid_count: 0,
      has_account: false,
      assigned_employee_name: text(row.assigned_employee_name),
      assigned_employee_email: text(row.assigned_employee_email),
    });
  }
  for (const row of bids.results || []) {
    if (isDeleted(row)) continue;
    const key = text(row.email).toLowerCase() || text(row.user_id);
    if (!key) continue;
    const current = customers.get(key) || {
      id: text(row.user_id) || key,
      email: text(row.email),
      company: "",
      contact_name: "",
      phone: "",
      address1: "",
      address2: "",
      city: "",
      region: "",
      postal_code: "",
      country: "",
      updated_at: "",
      last_bid_at: "",
      bid_count: 0,
      has_account: Boolean(row.user_id),
    };
    for (const field of [
      "email",
      "company",
      "contact_name",
      "phone",
      "address1",
      "address2",
      "city",
      "region",
      "postal_code",
      "country",
    ] as const) {
      if (!text(current[field]) && text(row[field]))
        current[field] = text(row[field]);
    }
    current.bid_count = Number(current.bid_count || 0) + 1;
    if (!text(current.last_bid_at))
      current.last_bid_at = text(row.submitted_at);
    customers.set(key, current);
  }
  return Response.json({
    customers: [...customers.values()].sort((a, b) =>
      text(a.company || a.email).localeCompare(text(b.company || b.email)),
    ),
    currentUserRole: employee.role,
  });
}

export async function PATCH(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json(
      { error: "Employee access required." },
      { status: 401 },
    );
  const body = (await request.json()) as Record<string, unknown>,
    id = text(body.id),
    hasAccount = body.hasAccount === true,
    email = text(body.email),
    company = text(body.company),
    contactName = text(body.contactName),
    phone = text(body.phone),
    address1 = text(body.address1),
    address2 = text(body.address2),
    city = text(body.city),
    region = text(body.region),
    postalCode = text(body.postalCode),
    country = text(body.country) || "United States",
    assignedEmployeeName = text(body.assignedEmployeeName) || employee.displayName,
    assignedEmployeeEmail = text(body.assignedEmployeeEmail) || employee.email,
    updatedAt = new Date().toISOString();
  if (!id || !company)
    return Response.json(
      { error: "Customer ID and company are required." },
      { status: 400 },
    );
  await clearDeletedCustomer(id, email);
  if (hasAccount) {
    await env.DB.prepare(
      "UPDATE customer_profiles SET email=?,company=?,contact_name=?,phone=?,address1=?,address2=?,city=?,region=?,postal_code=?,country=?,updated_at=? WHERE user_id=?",
    )
      .bind(
        email,
        company,
        contactName,
        phone,
        address1,
        address2,
        city,
        region,
        postalCode,
        country,
        updatedAt,
        id,
      )
      .run();
  }
  await env.DB.prepare(
      "INSERT INTO imported_customers (id,email,company,contact_name,phone,address1,address2,city,region,postal_code,country,assigned_employee_name,assigned_employee_email,source,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,company=excluded.company,contact_name=excluded.contact_name,phone=excluded.phone,address1=excluded.address1,address2=excluded.address2,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code,country=excluded.country,assigned_employee_name=excluded.assigned_employee_name,assigned_employee_email=excluded.assigned_employee_email,updated_at=excluded.updated_at",
    )
      .bind(
        id,
        email,
        company,
        contactName,
        phone,
        address1,
        address2,
        city,
        region,
        postalCode,
        country,
        assignedEmployeeName,
        assignedEmployeeEmail,
        "directory-edit",
        updatedAt,
      )
      .run();
  return Response.json({
    ok: true,
    customer: {
      id,
      email,
      company,
      contact_name: contactName,
      phone,
      address1,
      address2,
      city,
      region,
      postal_code: postalCode,
      country,
      assigned_employee_name: assignedEmployeeName,
      assigned_employee_email: assignedEmployeeEmail,
      updated_at: updatedAt,
    },
  });
}

export async function POST(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json(
      { error: "Employee access required." },
      { status: 401 },
    );
  const body = (await request.json()) as Record<string, unknown>,
    email = text(body.email),
    company = text(body.company),
    contactName = text(body.contactName),
    phone = text(body.phone),
    address1 = text(body.address1),
    address2 = text(body.address2),
    city = text(body.city),
    region = text(body.region),
    postalCode = text(body.postalCode),
    country = text(body.country) || "United States",
    assignedEmployeeName = text(body.assignedEmployeeName) || employee.displayName,
    assignedEmployeeEmail = text(body.assignedEmployeeEmail) || employee.email,
    updatedAt = new Date().toISOString(),
    id = crypto.randomUUID();
  if (!company || !contactName || !email)
    return Response.json({ error: "Company, contact name and email are required." }, { status: 400 });
  if (!email.split(",").map(value => value.trim()).every(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
    return Response.json({ error: "Enter valid email addresses separated by commas." }, { status: 400 });
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS imported_customers (id TEXT PRIMARY KEY,email TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',contact_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT 'United States',assigned_employee_name TEXT NOT NULL,assigned_employee_email TEXT NOT NULL,source TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL)",
  ).run();
  await clearDeletedCustomer(id, email);
  await env.DB.prepare(
    "INSERT INTO imported_customers (id,email,company,contact_name,phone,address1,address2,city,region,postal_code,country,assigned_employee_name,assigned_employee_email,source,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      email,
      company,
      contactName,
      phone,
      address1,
      address2,
      city,
      region,
      postalCode,
      country,
      assignedEmployeeName,
      assignedEmployeeEmail,
      "directory-new",
      updatedAt,
    )
    .run();
  return Response.json({
    ok: true,
    customer: {
      id,
      email,
      company,
      contact_name: contactName,
      phone,
      address1,
      address2,
      city,
      region,
      postal_code: postalCode,
      country,
      updated_at: updatedAt,
      last_bid_at: "",
      bid_count: 0,
      has_account: false,
      assigned_employee_name: assignedEmployeeName,
      assigned_employee_email: assignedEmployeeEmail,
    },
  });
}

export async function DELETE(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json(
      { error: "Employee access required." },
      { status: 401 },
    );
  if (employee.role !== "administrator")
    return Response.json(
      { error: "Only an administrator can delete customers." },
      { status: 403 },
    );
  const body = (await request.json()) as Record<string, unknown>,
    id = text(body.id),
    email = text(body.email).toLowerCase(),
    company = text(body.company),
    deletedAt = new Date().toISOString(),
    key = email ? `email:${email}` : `id:${id}`;
  if (!id)
    return Response.json(
      { error: "Customer ID is required." },
      { status: 400 },
    );
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS imported_customers (id TEXT PRIMARY KEY,email TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',contact_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT 'United States',assigned_employee_name TEXT NOT NULL,assigned_employee_email TEXT NOT NULL,source TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL)",
  ).run();
  await env.DB.prepare(deletedCustomerSchema).run();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM imported_customers WHERE id=? OR (?<>'' AND lower(trim(email))=?)",
    ).bind(id, email, email),
    env.DB.prepare(
      "INSERT INTO deleted_directory_customers (customer_key,customer_id,email,company,deleted_by,deleted_at) VALUES (?,?,?,?,?,?) ON CONFLICT(customer_key) DO UPDATE SET customer_id=excluded.customer_id,email=excluded.email,company=excluded.company,deleted_by=excluded.deleted_by,deleted_at=excluded.deleted_at",
    ).bind(key, id, email, company, employee.email, deletedAt),
  ]);
  return Response.json({ ok: true });
}
