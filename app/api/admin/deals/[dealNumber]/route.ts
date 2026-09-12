import { employeeUser } from "../../../../../lib/employee-server";
import {
  pddSupabaseKey,
  pddSupabaseUrl,
} from "../../../../../lib/pdd-auth";

const activeStatuses = ["open", "working", "pending"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dealNumber: string }> },
) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json(
      { error: "Employee access required." },
      { status: 401 },
    );

  const token = (request.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  const { dealNumber } = await params;
  const columns =
    "id,deal_number,title,description,quantity,closes_at,location,public_lines,spreadsheet_filename,status,published";
  const response = await fetch(
    `${pddSupabaseUrl}/rest/v1/pdd_public_deals?select=${columns}&deal_number=eq.${encodeURIComponent(dealNumber.toUpperCase())}&limit=1`,
    {
      headers: {
        apikey: pddSupabaseKey,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok)
    return Response.json(
      { error: "The deal could not be opened." },
      { status: 502 },
    );

  const deal = (await response.json() as Array<Record<string, unknown>>)[0];
  if (!deal)
    return Response.json({ error: "Deal not found." }, { status: 404 });
  if (!activeStatuses.includes(String(deal.status || "").toLowerCase()))
    return Response.json(
      { error: "This deal is not accepting bids." },
      { status: 400 },
    );

  return Response.json({ deal }, { headers: { "Cache-Control": "no-store" } });
}
