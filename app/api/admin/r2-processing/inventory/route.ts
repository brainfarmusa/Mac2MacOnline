import { env } from "cloudflare:workers";
import { employeeUser } from "../../../../../lib/employee-server";

const key = (dealId: string) => `r2-processing/${dealId}/original-inventory`;
const safe = (value: string) => value.replace(/[\r\n"]/g, "").slice(0, 220);

export async function POST(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json(
      { error: "Employee access required." },
      { status: 401 },
    );
  const form = await request.formData(),
    dealId = String(form.get("dealId") || "").trim(),
    file = form.get("file");
  if (!dealId || !(file instanceof File) || !file.size)
    return Response.json(
      { error: "Choose an inventory spreadsheet." },
      { status: 400 },
    );
  if (file.size > 25 * 1024 * 1024)
    return Response.json(
      { error: "The inventory spreadsheet must be under 25MB." },
      { status: 400 },
    );
  if (!/\.(xlsx?|csv)$/i.test(file.name))
    return Response.json(
      { error: "Use an XLSX, XLS, or CSV inventory spreadsheet." },
      { status: 400 },
    );
  const deal = await env.DB.prepare(
    "SELECT id FROM r2_processing_deals WHERE id=?",
  )
    .bind(dealId)
    .first();
  if (!deal)
    return Response.json({ error: "R2 deal not found." }, { status: 404 });
  await env.BUCKET.put(key(dealId), await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { filename: safe(file.name), uploadedBy: employee.email },
  });
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json(
      { error: "Employee access required." },
      { status: 401 },
    );
  const dealId = new URL(request.url).searchParams.get("deal") || "",
    object = await env.BUCKET.get(key(dealId));
  if (!object)
    return Response.json(
      { error: "Inventory spreadsheet not found." },
      { status: 404 },
    );
  const filename = safe(object.customMetadata?.filename || "R2-inventory.xlsx");
  return new Response(object.body, {
    headers: {
      "content-type":
        object.httpMetadata?.contentType || "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
