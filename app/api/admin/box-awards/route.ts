import { env } from "cloudflare:workers";
import { employeeUser } from "../../../../lib/employee-server";

const awardSchema = `CREATE TABLE IF NOT EXISTS deal_box_awards (
  id TEXT PRIMARY KEY NOT NULL,
  deal_number TEXT NOT NULL,
  box_number TEXT NOT NULL,
  control_number TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  internal_bid_number TEXT NOT NULL,
  company TEXT NOT NULL,
  award_amount REAL NOT NULL,
  line_numbers_json TEXT NOT NULL DEFAULT '[]',
  awarded_by TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
const awardIndex = `CREATE UNIQUE INDEX IF NOT EXISTS deal_box_awards_deal_box_unique ON deal_box_awards (deal_number,box_number)`;

type StoredBid = {
  internal_bid_number: string;
  deal_number: string;
  company: string;
  contact_name: string;
  line_items_json: string;
  line_count: number;
  total_quantity: number;
  total_bid: number;
  offer_type: string;
  status: string;
};

async function ready() {
  await env.DB.prepare(awardSchema).run();
  await env.DB.prepare(awardIndex).run();
}

export async function GET(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json({ error: "Employee access required." }, { status: 401 });
  await ready();
  const dealNumber = (new URL(request.url).searchParams.get("deal") || "").trim().toUpperCase();
  if (!dealNumber)
    return Response.json({ error: "Choose a deal." }, { status: 400 });
  const [awardResult, bidResult] = await Promise.all([
    env.DB.prepare("SELECT id,deal_number,box_number,control_number,quantity,internal_bid_number,company,award_amount,line_numbers_json,awarded_by,awarded_at,updated_at FROM deal_box_awards WHERE deal_number=? ORDER BY box_number").bind(dealNumber).all(),
    env.DB.prepare("SELECT internal_bid_number,deal_number,company,contact_name,line_items_json,line_count,total_quantity,total_bid,offer_type,status FROM internal_bids WHERE deal_number=? ORDER BY total_bid DESC,submitted_at DESC").bind(dealNumber).all<StoredBid>(),
  ]);
  return Response.json({
    awards: (awardResult.results || []).map((award) => ({
      ...award,
      line_numbers: JSON.parse(String(award.line_numbers_json || "[]")),
      line_numbers_json: undefined,
    })),
    bids: (bidResult.results || []).map((bid) => ({
      ...bid,
      line_items: JSON.parse(String(bid.line_items_json || "[]")),
      line_items_json: undefined,
    })),
  });
}

export async function POST(request: Request) {
  const employee = await employeeUser(request);
  if (!employee)
    return Response.json({ error: "Employee access required." }, { status: 401 });
  await ready();
  const body = await request.json() as { dealNumber?: string; awards?: unknown[] };
  const dealNumber = String(body.dealNumber || "").trim().toUpperCase();
  const incoming = Array.isArray(body.awards) ? body.awards : [];
  if (!dealNumber || incoming.length > 500)
    return Response.json({ error: "Choose a valid deal and its box awards." }, { status: 400 });
  const bidResult = await env.DB.prepare("SELECT internal_bid_number,company FROM internal_bids WHERE deal_number=?").bind(dealNumber).all<{ internal_bid_number: string; company: string }>();
  const bidders = new Map((bidResult.results || []).map((bid) => [bid.internal_bid_number, bid.company]));
  const seen = new Set<string>();
  try {
    const awards = incoming.map((raw) => {
      const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const boxNumber = String(item.boxNumber || "").trim().slice(0, 80);
      const internalBidNumber = String(item.internalBidNumber || "").trim().slice(0, 100);
      const quantity = Math.trunc(Number(item.quantity));
      const awardAmount = Math.round(Number(item.awardAmount) * 100) / 100;
      const lineNumbers = Array.isArray(item.lineNumbers)
        ? [...new Set(item.lineNumbers.map(Number).filter((line) => Number.isInteger(line) && line > 0))]
        : [];
      if (!boxNumber || seen.has(boxNumber) || !bidders.has(internalBidNumber) || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(awardAmount) || awardAmount < 0 || !lineNumbers.length)
        throw new Error("Every award needs one unique box, a customer bid, quantity, amount and source lines.");
      seen.add(boxNumber);
      return {
        id: crypto.randomUUID(),
        boxNumber,
        controlNumber: String(item.controlNumber || "").trim().slice(0, 80),
        quantity,
        internalBidNumber,
        company: bidders.get(internalBidNumber) || "",
        awardAmount,
        lineNumbers,
      };
    });
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM deal_box_awards WHERE deal_number=?").bind(dealNumber),
      ...awards.map((award) => env.DB.prepare("INSERT INTO deal_box_awards (id,deal_number,box_number,control_number,quantity,internal_bid_number,company,award_amount,line_numbers_json,awarded_by,awarded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(award.id, dealNumber, award.boxNumber, award.controlNumber, award.quantity, award.internalBidNumber, award.company, award.awardAmount, JSON.stringify(award.lineNumbers), employee.email, now, now)),
    ]);
    return Response.json({ ok: true, saved: awards.length, awardedBoxes: awards.map((award) => award.boxNumber) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Box awards could not be saved." }, { status: 400 });
  }
}
