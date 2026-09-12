import { env } from "cloudflare:workers";
import { employeeUser } from "../../../lib/employee-server";

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json({ error: "Employee access required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dealNumber = clean(body.dealNumber, 40).toUpperCase();
  const employeeEmail = clean(body.employeeEmail, 200).toLowerCase();
  if (!dealNumber || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employeeEmail))
    return Response.json({ error: "A valid deal and employee are required." }, { status: 400 });

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS deal_notification_owners (
      deal_number TEXT PRIMARY KEY,
      employee_email TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
  await env.DB.prepare(
    "INSERT INTO deal_notification_owners (deal_number,employee_email,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(deal_number) DO UPDATE SET employee_email=excluded.employee_email,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
  )
    .bind(dealNumber, employeeEmail, employee.email, new Date().toISOString())
    .run();

  return Response.json({ ok: true });
}
