import { env } from "cloudflare:workers";
import { sendBidNotifications } from "../../../lib/bid-email";
import { supabaseReady, supabaseRequest } from "../../../lib/supabase";
import { customerUser } from "../../../lib/customer-server";
import { employeeUser } from "../../../lib/employee-server";
import { pddSupabaseKey, pddSupabaseUrl } from "../../../lib/pdd-auth";
import { ensureCustomerCompany } from "../../../lib/business-company";
import {
  groupBidLinesByBox,
  isMultipleAwardDeal,
  type BoxBidSourceLine,
} from "../../../lib/boxBidGroups";

type LiveLine = BoxBidSourceLine & {
  award_mode?: "single" | "multiple";
};

type SubmittedLine = {
  lineNumber: number;
  assetId: string;
  brand: string;
  model: string;
  modelNumber: string;
  processor: string;
  ram: string;
  hardDrive: string;
  condition: string;
  issues: string;
  quantity: number;
  unitBid: number;
  comments: string;
  boxNumber?: string;
  boxBid?: number;
};
const clean = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function notificationOwnerEmail(dealNumber: string) {
  try {
    const owner = await env.DB.prepare(
      "SELECT employee_email FROM deal_notification_owners WHERE deal_number=? LIMIT 1",
    )
      .bind(dealNumber)
      .first<{ employee_email: string }>();
    return clean(owner?.employee_email, 200);
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const dealNumber = clean(body.dealNumber, 40);
    let company = clean(body.company, 160);
    let contactName = clean(body.contactName, 160);
    let email = clean(body.email, 200);
    let phone = clean(body.phone, 80);
    let address1 = clean(body.address1, 200);
    let address2 = clean(body.address2, 200);
    let city = clean(body.city, 120);
    let region = clean(body.region, 120);
    let postalCode = clean(body.postalCode, 40);
    let country = clean(body.country, 100);
    const customerNotes = clean(body.customerNotes, 3000);
    const submittedOnBehalf = body.submittedOnBehalf === true;
    const enteredBy = submittedOnBehalf ? await employeeUser(request) : null;
    if (submittedOnBehalf && !enteredBy)
      return Response.json(
        {
          error: "Employee access is required to submit a bid for a customer.",
        },
        { status: 401 },
      );
    let user: { id: string; email: string } | null = null;
    if (!submittedOnBehalf) {
      try {
        user = await customerUser(request);
      } catch {
        /* A visitor may still submit using the form fields. */
      }
      if (user) {
        try {
          const saved = (await env.DB.prepare(
            "SELECT company,contact_name,email,phone,address1,address2,city,region,postal_code,country FROM customer_profiles WHERE user_id=?",
          )
            .bind(user.id)
            .first()) as Record<string, unknown> | null;
          company ||= clean(saved?.company, 160);
          contactName ||= clean(saved?.contact_name, 160);
          email ||= clean(saved?.email, 200) || user.email;
          phone ||= clean(saved?.phone, 80);
          address1 ||= clean(saved?.address1, 200);
          address2 ||= clean(saved?.address2, 200);
          city ||= clean(saved?.city, 120);
          region ||= clean(saved?.region, 120);
          postalCode ||= clean(saved?.postal_code, 40);
          country ||= clean(saved?.country, 100);
        } catch {
          email ||= user.email;
        }
      }
    }
    let liveDeal = false,
      dealQuantity = 0,
      liveLines: LiveLine[] = [],
      dealOwnerName = "",
      dealOwnerEmail = "";
    if (!liveDeal && supabaseReady()) {
      const dealSelect = "deal_number,quantity,public_lines";
      const publicDealPath = `/rest/v1/pdd_public_deals?select=${dealSelect}&deal_number=eq.${encodeURIComponent(dealNumber)}&status=in.(open,closing_soon)&limit=1`;
      let dealResponse = await supabaseRequest(publicDealPath);
      let rows = dealResponse.ok
        ? ((await dealResponse.json()) as {
            quantity: number;
            public_lines?: LiveLine[];
            owner_name?: string;
            owner_email?: string;
          }[])
        : [];
      if (submittedOnBehalf && rows.length === 0) {
        const employeeDealPath = `/rest/v1/pdd_public_deals?select=${dealSelect}&deal_number=eq.${encodeURIComponent(dealNumber)}&status=in.(open,closing_soon,working,pending,won)&limit=1`;
        dealResponse = await fetch(`${pddSupabaseUrl}${employeeDealPath}`, {
            headers: {
              apikey: pddSupabaseKey,
              Authorization: request.headers.get("authorization") || "",
            },
          });
        rows = dealResponse.ok
          ? ((await dealResponse.json()) as {
            quantity: number;
            public_lines?: LiveLine[];
            owner_name?: string;
            owner_email?: string;
          }[])
          : [];
      }
      liveDeal = rows.length > 0;
      dealQuantity = Number(rows[0]?.quantity || 0);
      liveLines = Array.isArray(rows[0]?.public_lines)
        ? rows[0].public_lines
        : [];
    }
    if (!liveDeal)
      return Response.json(
        { error: "This deal is not accepting bids." },
        { status: 400 },
      );
    if (
      !submittedOnBehalf &&
      (!company ||
        !contactName ||
        !email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
      return Response.json(
        {
          error: "Please enter your company, contact name and a valid email address.",
        },
        { status: 400 },
      );
    const offerType = body.offerType === "take_all" ? "take_all" : "line_item",
      takeAllAmount = Number(body.takeAllAmount);
    if (
      offerType === "line_item" &&
      (!Array.isArray(body.lineItems) ||
        body.lineItems.length < 1 ||
        body.lineItems.length > 1000)
    )
      return Response.json(
        { error: "Enter an offer on at least one line item." },
        { status: 400 },
      );
    if (
      offerType === "take_all" &&
      (!Number.isFinite(takeAllAmount) || takeAllAmount <= 0)
    )
      return Response.json(
        { error: "Enter a valid take-all offer greater than $0." },
        { status: 400 },
      );
    const lineItems: SubmittedLine[] =
      offerType === "take_all"
        ? []
        : (body.lineItems as unknown[]).map((raw, index) => {
            const row = (raw && typeof raw === "object" ? raw : {}) as Record<
              string,
              unknown
            >;
            return {
              lineNumber: Number(row.lineNumber) || index + 1,
              assetId: clean(row.assetId, 60),
              brand: clean(row.brand, 80),
              model: clean(row.model, 120),
              modelNumber: clean(row.modelNumber, 120),
              processor: clean(row.processor, 240),
              ram: clean(row.ram, 160),
              hardDrive: clean(row.hardDrive, 160),
              condition: clean(row.condition, 80),
              issues: clean(row.issues, 300),
              quantity: Number(row.quantity),
              unitBid: Number(row.unitBid),
              comments: clean(row.comments, 500),
            };
          });
    if (
      lineItems.some(
        (line) =>
          !Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > 10000 ||
          !Number.isFinite(line.unitBid) ||
          line.unitBid <= 0,
      )
    )
      return Response.json(
        {
          error:
            "Each selected line must have a valid quantity and unit offer.",
        },
        { status: 400 },
      );
    if (offerType === "line_item") {
      const availableByLine = new Map(
        liveLines.map((line) => [Number(line.line), Number(line.quantity)]),
      );
      if (lineItems.some((line) => !availableByLine.has(Number(line.lineNumber)) || line.quantity > Number(availableByLine.get(Number(line.lineNumber)))))
        return Response.json(
          { error: "A bid quantity cannot exceed the quantity available on that deal line." },
          { status: 400 },
        );
    }
    const multipleAwards = isMultipleAwardDeal(liveLines);
    let boxCount = 0;
    if (offerType === "line_item" && multipleAwards) {
      const boxGroups = groupBidLinesByBox(liveLines);
      if (!boxGroups.length || boxGroups.some((box) => box.boxNumber === "Unassigned"))
        return Response.json(
          {
            error:
              "This multiple-award deal is missing a Box # or Lot # on its first item. Please contact Mac2MacOnline before submitting.",
          },
          { status: 400 },
        );
      const liveByLine = new Map(
        liveLines.map((line) => [Number(line.line), line]),
      );
      const submittedByLine = new Map<number, SubmittedLine>();
      for (const submitted of lineItems) {
        const lineNumber = Number(submitted.lineNumber);
        const liveLine = liveByLine.get(lineNumber);
        if (
          !Number.isInteger(lineNumber) ||
          submittedByLine.has(lineNumber) ||
          !liveLine ||
          Number(submitted.quantity) > Number(liveLine.quantity)
        )
          return Response.json(
            {
              error:
                "One or more submitted lines no longer match this deal. Refresh the page and enter the box bid again.",
            },
            { status: 400 },
          );
        submittedByLine.set(lineNumber, submitted);
      }
      for (const box of boxGroups) {
        const submitted = box.lineNumbers
          .map((lineNumber) => submittedByLine.get(lineNumber))
          .filter((line): line is SubmittedLine => Boolean(line));
        if (!submitted.length) continue;
        if (submitted.length !== box.lineNumbers.length)
          return Response.json(
            {
              error: `Complete every line in Box/Lot ${box.boxNumber}, or remove that group from the bid.`,
            },
            { status: 400 },
          );
        const boxBid =
          Math.round(
            submitted.reduce(
              (sum, line) => sum + line.quantity * line.unitBid,
              0,
            ) * 100,
          ) / 100;
        submitted.forEach((line) => {
          line.boxNumber = box.boxNumber;
          line.boxBid = boxBid;
        });
        boxCount += 1;
      }
      if (!boxCount)
        return Response.json(
          { error: "Enter unit bids for at least one complete box." },
          { status: 400 },
        );
    }
    const totalQuantity =
      offerType === "take_all"
        ? dealQuantity
        : lineItems.reduce((sum, line) => sum + line.quantity, 0);
    const totalBid =
      offerType === "take_all"
        ? Math.round(takeAllAmount * 100) / 100
        : Math.round(
            lineItems.reduce(
              (sum, line) => sum + line.quantity * line.unitBid,
              0,
            ) * 100,
          ) / 100;
    const storedNotes =
      offerType === "take_all"
        ? [
            "TAKE-ALL OFFER — Itemized line pricing is required before an award can be finalized.",
            customerNotes,
          ]
            .filter(Boolean)
            .join("\n\n")
        : customerNotes;
    const now = new Date();
    const id = crypto.randomUUID();
    const stamp = now.toISOString().replace(/\D/g, "").slice(2, 14);
    const internalBidNumber = `IB-${dealNumber}-${stamp}`;
    const db = env.DB;
    const editBidNumber = submittedOnBehalf
      ? clean(body.editBidNumber, 140)
      : "";
    if (editBidNumber) {
      const current = await db
        .prepare(
          "SELECT id,internal_bid_number FROM internal_bids WHERE internal_bid_number=? AND deal_number=? LIMIT 1",
        )
        .bind(editBidNumber, dealNumber)
        .first<{ id: string; internal_bid_number: string }>();
      if (!current)
        return Response.json({ error: "The bid being updated was not found." }, { status: 404 });
      await db.batch([
        db.prepare(
          "UPDATE internal_bids SET company=?,contact_name=?,email=?,phone=?,customer_notes=?,line_items_json=?,line_count=?,total_quantity=?,total_bid=?,offer_type=? WHERE id=?",
        ).bind(company,contactName,email,phone,storedNotes,JSON.stringify(lineItems),lineItems.length,totalQuantity,totalBid,offerType,current.id),
        db.prepare(
          "INSERT INTO internal_bid_customers (bid_id,customer_user_id,address1,address2,city,region,postal_code,country) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(bid_id) DO UPDATE SET customer_user_id=excluded.customer_user_id,address1=excluded.address1,address2=excluded.address2,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code,country=excluded.country",
        ).bind(current.id,clean(body.customerUserId,100)||null,address1,address2,city,region,postalCode,country),
      ]);
      return Response.json({ok:true,updated:true,internalBidNumber:current.internal_bid_number,lineCount:lineItems.length,boxCount,totalQuantity,totalBid,offerType});
    }
    const itemizeWinningOffer =
      submittedOnBehalf &&
      body.itemizeWinningOffer === true &&
      offerType === "line_item";
    if (itemizeWinningOffer) {
      const winner = (await db
        .prepare(
          "SELECT id,internal_bid_number FROM internal_bids WHERE deal_number=? AND lower(status)='won' AND lower(company)=lower(?) ORDER BY submitted_at DESC LIMIT 1",
        )
        .bind(dealNumber, company)
        .first()) as { id: string; internal_bid_number: string } | null;
      if (!winner)
        return Response.json(
          { error: "The winning customer offer could not be found." },
          { status: 404 },
        );
      await db
        .prepare(
          "UPDATE internal_bids SET contact_name=?,email=?,phone=?,customer_notes=?,line_items_json=?,line_count=?,total_quantity=?,total_bid=?,offer_type='line_item' WHERE id=?",
        )
        .bind(
          contactName,
          email,
          phone,
          customerNotes,
          JSON.stringify(lineItems),
          lineItems.length,
          totalQuantity,
          totalBid,
          winner.id,
        )
        .run();
      return Response.json({
        ok: true,
        internalBidNumber: winner.internal_bid_number,
        lineCount: lineItems.length,
        boxCount,
        totalQuantity,
        totalBid,
        offerType,
        itemizedWinningOffer: true,
      });
    }
    const customerUserId = submittedOnBehalf
      ? clean(body.customerUserId, 100) || null
      : user?.id || null;
    const customerCompany = await ensureCustomerCompany({
        company,
        contactName,
        email,
        phone,
        assignedEmployeeName: dealOwnerName,
        assignedEmployeeEmail: dealOwnerEmail,
        source: user ? "customer-account-bid" : "website-bid",
      });
    if (multipleAwards && offerType === "line_item") {
      const lotGroups = new Map<string, SubmittedLine[]>();
      for (const line of lineItems) {
        const lotNumber = clean(line.boxNumber, 80);
        if (!lotNumber) continue;
        lotGroups.set(lotNumber, [...(lotGroups.get(lotNumber) || []), line]);
      }
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS internal_bids (
      id TEXT PRIMARY KEY,
      internal_bid_number TEXT NOT NULL UNIQUE,
      deal_number TEXT NOT NULL,
      company TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      customer_notes TEXT NOT NULL DEFAULT '',
      line_items_json TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      total_quantity INTEGER NOT NULL,
      total_bid REAL NOT NULL,
      offer_type TEXT NOT NULL DEFAULT 'line_item',
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_at TEXT NOT NULL
    )`,
      ).run();
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS internal_bid_customers (bid_id TEXT PRIMARY KEY,customer_user_id TEXT,address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT '')`,
      ).run();
      if (enteredBy)
        await db.prepare(
          `CREATE TABLE IF NOT EXISTS internal_bid_agents (bid_id TEXT PRIMARY KEY,employee_user_id TEXT NOT NULL,employee_name TEXT NOT NULL,employee_email TEXT NOT NULL,customer_key TEXT NOT NULL DEFAULT '',uploaded_file_name TEXT NOT NULL DEFAULT '',entered_at TEXT NOT NULL)`,
        ).run();
      const lotBids = [...lotGroups].map(([lotNumber, lotLines], index) => {
        const lotSlug = lotNumber.replace(/[^A-Z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 24) || String(index + 1);
        return {
          id: crypto.randomUUID(),
          number: `IB-${dealNumber}-${stamp}-LOT-${lotSlug}-${index + 1}`,
          lotNumber,
          lines: lotLines,
          quantity: lotLines.reduce((sum, line) => sum + line.quantity, 0),
          total: Math.round(lotLines.reduce((sum, line) => sum + line.quantity * line.unitBid, 0) * 100) / 100,
        };
      });
      const statements = lotBids.flatMap((lotBid) => {
        const core = [
          db.prepare(
            "INSERT INTO internal_bids (id,internal_bid_number,deal_number,company,contact_name,email,phone,customer_notes,line_items_json,line_count,total_quantity,total_bid,offer_type,status,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          ).bind(lotBid.id,lotBid.number,dealNumber,company,contactName,email,phone,storedNotes,JSON.stringify(lotBid.lines),lotBid.lines.length,lotBid.quantity,lotBid.total,"line_item","submitted",now.toISOString()),
          db.prepare(
            "INSERT INTO internal_bid_customers (bid_id,customer_user_id,address1,address2,city,region,postal_code,country) VALUES (?,?,?,?,?,?,?,?)",
          ).bind(lotBid.id,customerUserId,address1,address2,city,region,postalCode,country),
        ];
        if (enteredBy)
          core.push(db.prepare(
            "INSERT INTO internal_bid_agents (bid_id,employee_user_id,employee_name,employee_email,customer_key,uploaded_file_name,entered_at) VALUES (?,?,?,?,?,?,?)",
          ).bind(lotBid.id,enteredBy.id,enteredBy.displayName,enteredBy.email,clean(body.customerKey,200),clean(body.uploadedFileName,240),now.toISOString()));
        return core;
      });
      await db.batch(statements);
      const runtime = env as unknown as Record<string, string | undefined>;
      const ownerKey = `DEAL_OWNER_EMAIL_${dealNumber.replace(/[^A-Z0-9]/g, "_")}`;
      const assignedEmployeeEmail =
        (await notificationOwnerEmail(dealNumber)) ||
        runtime[ownerKey] ||
        runtime.BID_EMPLOYEE_EMAIL;
      const notifications = await Promise.all(lotBids.map((lotBid) =>
        sendBidNotifications({
          apiKey: runtime.RESEND_API_KEY,
          from: runtime.BID_EMAIL_FROM,
          adminEmail: runtime.BID_ADMIN_EMAIL,
          employeeEmail: assignedEmployeeEmail,
          customerRepEmail: customerCompany?.assignedEmployeeEmail,
          bidderEmail: email,
          bidderName: contactName,
          company,
          bidNumber: lotBid.number,
          dealNumber: `${dealNumber} · Lot ${lotBid.lotNumber}`,
          total: lotBid.total,
          quantity: lotBid.quantity,
          lines: lotBid.lines,
          notes: customerNotes,
        })
      ));
      return Response.json({
        ok: true,
        internalBidNumbers: lotBids.map((lotBid) => lotBid.number),
        lineCount: lineItems.length,
        boxCount: lotBids.length,
        totalQuantity,
        totalBid,
        offerType,
        emailNotification: notifications.every((item) => item.status === "sent") ? "sent" : "partial",
      }, { status: 201 });
    }
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS internal_bids (
      id TEXT PRIMARY KEY,
      internal_bid_number TEXT NOT NULL UNIQUE,
      deal_number TEXT NOT NULL,
      company TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      customer_notes TEXT NOT NULL DEFAULT '',
      line_items_json TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      total_quantity INTEGER NOT NULL,
      total_bid REAL NOT NULL,
      offer_type TEXT NOT NULL DEFAULT 'line_item',
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_at TEXT NOT NULL
    )`,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO internal_bids (id,internal_bid_number,deal_number,company,contact_name,email,phone,customer_notes,line_items_json,line_count,total_quantity,total_bid,offer_type,status,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        internalBidNumber,
        dealNumber,
        company,
        contactName,
        email,
        phone,
        storedNotes,
        JSON.stringify(lineItems),
        lineItems.length,
        totalQuantity,
        totalBid,
        offerType,
        "submitted",
        now.toISOString(),
      )
      .run();
    try {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS internal_bid_customers (bid_id TEXT PRIMARY KEY,customer_user_id TEXT,address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT '')`,
        )
        .run();
      await db
        .prepare(
          "INSERT INTO internal_bid_customers (bid_id,customer_user_id,address1,address2,city,region,postal_code,country) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          customerUserId,
          address1,
          address2,
          city,
          region,
          postalCode,
          country,
        )
        .run();
    } catch {
      /* Account linkage must never block a valid bid. */
    }
    if (enteredBy)
      try {
        await db
          .prepare(
            `CREATE TABLE IF NOT EXISTS internal_bid_agents (bid_id TEXT PRIMARY KEY,employee_user_id TEXT NOT NULL,employee_name TEXT NOT NULL,employee_email TEXT NOT NULL,customer_key TEXT NOT NULL DEFAULT '',uploaded_file_name TEXT NOT NULL DEFAULT '',entered_at TEXT NOT NULL)`,
          )
          .run();
        await db
          .prepare(
            "INSERT INTO internal_bid_agents (bid_id,employee_user_id,employee_name,employee_email,customer_key,uploaded_file_name,entered_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            enteredBy.id,
            enteredBy.displayName,
            enteredBy.email,
            clean(body.customerKey, 200),
            clean(body.uploadedFileName, 240),
            now.toISOString(),
          )
          .run();
      } catch {
        /* Employee attribution must never block a valid customer bid. */
      }
    const runtime = env as unknown as Record<string, string | undefined>;
    const ownerKey = `DEAL_OWNER_EMAIL_${dealNumber.replace(/[^A-Z0-9]/g, "_")}`;
    const assignedEmployeeEmail =
      (await notificationOwnerEmail(dealNumber)) ||
      runtime[ownerKey] ||
      runtime.BID_EMPLOYEE_EMAIL;
    const notification = await sendBidNotifications({
      apiKey: runtime.RESEND_API_KEY,
      from: runtime.BID_EMAIL_FROM,
      adminEmail: runtime.BID_ADMIN_EMAIL,
      employeeEmail: assignedEmployeeEmail,
      customerRepEmail: customerCompany?.assignedEmployeeEmail,
      bidderEmail: email,
      bidderName: contactName,
      company,
      bidNumber: internalBidNumber,
      dealNumber,
      total: totalBid,
      quantity: totalQuantity,
      lines: lineItems,
      notes: customerNotes,
    });
    try {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS bid_notification_log (
        id TEXT PRIMARY KEY,
        bid_number TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          "INSERT INTO bid_notification_log (id,bid_number,channel,status,error,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          internalBidNumber,
          "email",
          notification.status,
          notification.error || "",
          new Date().toISOString(),
        )
        .run();
    } catch {
      /* The bid remains valid even if delivery-status logging is unavailable. */
    }
    return Response.json(
      {
        ok: true,
        internalBidNumber,
        lineCount: lineItems.length,
        boxCount,
        totalQuantity,
        totalBid,
        offerType,
        emailNotification: notification.status,
      },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "The internal bid could not be generated. Please try again." },
      { status: 500 },
    );
  }
}
