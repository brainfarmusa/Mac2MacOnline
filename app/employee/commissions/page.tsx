"use client";
import { useEffect, useMemo, useState } from "react";
import {
  clearPddSession,
  currentPddEmployeeEmail,
  currentPddSession,
  pddAuthFetch,
} from "../../../lib/pdd-auth";
import "./commissions.css";
import "./fees.css";

type Session = { access_token: string };
type User = { id: string };
type Profile = { email: string; display_name: string };
type PO = {
  id: string;
  po_number: string;
  deal_number: string;
  vendor_total: number;
  purchasing_owner_name: string;
  purchasing_owner_email: string;
  vendor: { company_name: string } | null;
};
type SO = {
  id: string;
  so_number: string;
  deal_number: string;
  sales_total: number;
  sales_owner_name: string;
  sales_owner_email: string;
  customer_company: string;
};
type ExpenseKey =
  | "shipping_cost"
  | "credit_card_fee"
  | "insurance_cost"
  | "receiving_labor_cost"
  | "processing_labor_cost"
  | "parts_cost"
  | "shipping_labor_cost"
  | "shipping_supplies_cost"
  | "outgoing_freight_cost"
  | "wire_fee"
  | "miscellaneous_cost";
type Commission = {
  id: string;
  purchase_order_number: string;
  sales_order_number: string;
  buyer_name: string;
  salesperson_name: string;
  purchase_cost: number;
  sales_total: number;
  gross_profit: number;
  buyer_rate: number;
  salesperson_rate: number;
  buyer_commission: number;
  salesperson_commission: number;
  commission_rule: string;
  created_at: string;
} & Record<ExpenseKey, number>;
const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }),
  round = (n: number) => Math.round(n * 100) / 100,
  normalized = (v: string) => v.trim().toLowerCase();
const expenseFields: { key: ExpenseKey; label: string }[] = [
  { key: "shipping_cost", label: "Shipping cost" },
  { key: "credit_card_fee", label: "Credit card fee" },
  { key: "insurance_cost", label: "Insurance" },
  { key: "receiving_labor_cost", label: "Receiving labor" },
  { key: "processing_labor_cost", label: "Processing labor" },
  { key: "parts_cost", label: "Parts" },
  { key: "shipping_labor_cost", label: "Shipping labor" },
  { key: "shipping_supplies_cost", label: "Shipping supplies" },
  { key: "outgoing_freight_cost", label: "Outgoing freight" },
  { key: "wire_fee", label: "Wire fee" },
  { key: "miscellaneous_cost", label: "Miscellaneous" },
];
const emptyExpenses = Object.fromEntries(
  expenseFields.map(({ key }) => [key, "0"]),
) as Record<ExpenseKey, string>;
const expenseTotal = (item: Partial<Record<ExpenseKey, number>>) =>
  expenseFields.reduce((sum, { key }) => sum + (Number(item[key]) || 0), 0);

export default function CommissionsPage() {
  const [session, setSession] = useState<Session | null>(null),
    [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [purchaseOrders, setPurchaseOrders] = useState<PO[]>([]),
    [salesOrders, setSalesOrders] = useState<SO[]>([]),
    [records, setRecords] = useState<Commission[]>([]),
    [poId, setPoId] = useState(""),
    [soId, setSoId] = useState(""),
    [expenses, setExpenses] =
      useState<Record<ExpenseKey, string>>(emptyExpenses),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  async function load(active: Session) {
    const email = await currentPddEmployeeEmail(active);
    if (!email) throw new Error("Employee account could not be identified.");
    const headers = { Authorization: `Bearer ${active.access_token}` };
    const [ur, pr, por, sor, cr] = await Promise.all([
      pddAuthFetch("/auth/v1/user", { headers }),
      pddAuthFetch(
        `/rest/v1/pdd_employee_access?select=email,display_name&email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`,
        { headers },
      ),
      pddAuthFetch(
        "/rest/v1/pdd_purchase_orders?select=id,po_number,deal_number,vendor_total,purchasing_owner_name,purchasing_owner_email,vendor:pdd_vendors(company_name)&order=po_number.asc",
        { headers },
      ),
      pddAuthFetch(
        "/rest/v1/pdd_sales_orders?select=id,so_number,deal_number,sales_total,sales_owner_name,sales_owner_email,customer_company&order=so_number.asc",
        { headers },
      ),
      pddAuthFetch("/rest/v1/pdd_commissions?select=*&order=created_at.desc", {
        headers,
      }),
    ]);
    if ([ur, pr, por, sor].some((r) => r.status === 401)) {
      clearPddSession();
      window.location.replace(
        "/employee-login?return_to=/employee/commissions",
      );
      return;
    }
    if (!ur.ok || !pr.ok || !por.ok || !sor.ok)
      throw new Error("Orders could not be loaded.");
    setUser((await ur.json()) as User);
    setProfile(((await pr.json()) as Profile[])[0] || null);
    setPurchaseOrders((await por.json()) as PO[]);
    setSalesOrders((await sor.json()) as SO[]);
    if (cr.ok) setRecords((await cr.json()) as Commission[]);
  }
  useEffect(() => {
    void (async () => {
      const active = await currentPddSession();
      if (!active) {
        window.location.replace(
          "/employee-login?return_to=/employee/commissions",
        );
        return;
      }
      setSession(active);
      try {
        await load(active);
      } catch (e) {
        setMessage(
          e instanceof Error
            ? e.message
            : "Commission data could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const po = useMemo(
      () => purchaseOrders.find((x) => x.id === poId) || null,
      [purchaseOrders, poId],
    ),
    matchingSalesOrders = useMemo(
      () =>
        po
          ? salesOrders.filter((order) => order.deal_number === po.deal_number)
          : [],
      [salesOrders, po],
    ),
    so = useMemo(
      () => matchingSalesOrders.find((x) => x.id === soId) || null,
      [matchingSalesOrders, soId],
    );
  const calculation = useMemo(() => {
    if (!po || !so) return null;
    const cost = Number(po.vendor_total),
      sale = Number(so.sales_total),
      expenseValues = Object.fromEntries(
        expenseFields.map(({ key }) => [
          key,
          Math.max(0, Number(expenses[key]) || 0),
        ]),
      ) as Record<ExpenseKey, number>,
      totalExpenses = round(expenseTotal(expenseValues)),
      profit = round(sale - cost - totalExpenses),
      base = Math.max(0, profit),
      buyerEmail = normalized(po.purchasing_owner_email || ""),
      sellerEmail = normalized(so.sales_owner_email || ""),
      buyerName = normalized(po.purchasing_owner_name || ""),
      sellerName = normalized(so.sales_owner_name || ""),
      same = Boolean(
        (buyerEmail && sellerEmail && buyerEmail === sellerEmail) ||
        (buyerName && sellerName && buyerName === sellerName),
      ),
      darrell = buyerName.includes("darrell") || buyerEmail.includes("darrell");
    let buyerRate = 15,
      sellerRate = 15,
      rule = "Different buyer and salesperson — 15% each";
    if (same) {
      buyerRate = 30;
      sellerRate = 0;
      rule = "Same employee bought and sold — 30%";
    } else if (darrell) {
      buyerRate = 0;
      sellerRate = 20;
      rule = "Darrell purchased — salesperson receives 20%";
    }
    return {
      cost,
      sale,
      expenseValues,
      totalExpenses,
      profit,
      buyerRate,
      sellerRate,
      buyerCommission: round((base * buyerRate) / 100),
      sellerCommission: round((base * sellerRate) / 100),
      rule,
    };
  }, [po, so, expenses]);
  async function save() {
    if (!session || !user || !profile || !po || !so || !calculation) return;
    const buyer = po.purchasing_owner_name?.trim(),
      seller = so.sales_owner_name?.trim();
    if (
      !buyer ||
      buyer === "Unassigned" ||
      !seller ||
      seller === "Unassigned"
    ) {
      setMessage(
        "Assign the vendor owner and customer salesperson before calculating commission.",
      );
      return;
    }
    if (expenseFields.some(({ key }) => Number(expenses[key]) < 0)) {
      setMessage("Expenses cannot be negative.");
      return;
    }
    setSaving(true);
    setMessage("");
    const record = {
      purchase_order_id: po.id,
      sales_order_id: so.id,
      purchase_order_number: po.po_number,
      sales_order_number: so.so_number,
      buyer_name: buyer,
      buyer_email: po.purchasing_owner_email || "",
      salesperson_name: seller,
      salesperson_email: so.sales_owner_email || "",
      purchase_cost: calculation.cost,
      sales_total: calculation.sale,
      ...calculation.expenseValues,
      gross_profit: calculation.profit,
      buyer_rate: calculation.buyerRate,
      salesperson_rate: calculation.sellerRate,
      buyer_commission: calculation.buyerCommission,
      salesperson_commission: calculation.sellerCommission,
      commission_rule: calculation.rule,
      created_by: user.id,
      created_by_name: profile.display_name,
      created_by_email: profile.email,
      updated_at: new Date().toISOString(),
    };
    try {
      const response = await pddAuthFetch(
        "/rest/v1/pdd_commissions?on_conflict=purchase_order_id,sales_order_id",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify(record),
        },
      );
      if (!response.ok)
        throw new Error("Commission record could not be saved.");
      const saved = ((await response.json()) as Commission[])[0];
      setRecords((current) => [
        saved,
        ...current.filter((x) => x.id !== saved.id),
      ]);
      setMessage(
        `Commission saved. Total commission: ${money.format(calculation.buyerCommission + calculation.sellerCommission)}.`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Commission record could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <main className="commissionsPage">
        <p>Loading commissions…</p>
      </main>
    );
  return (
    <main className="commissionsPage">
      <header>
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h1>Commissions</h1>
          <p>
            Match a purchase order to a sales order. Employee credit comes from
            the owners attached to those orders.
          </p>
        </div>
        <div className="commissionLinks">
          <a href="/employee/reverse-offer">Create PO</a>
          <a href="/employee/purchase-order-upload">PO From Spreadsheet</a>
          <a href="/employee/sales-order">Create Sales Order</a>
        </div>
      </header>
      <div className="reportGenerateActions">
        <button className="button secondary" type="button" onClick={() => window.print()}>
          Print Report
        </button>
      </div>
      <section className="commissionBuilder">
        <h2>Calculate commission</h2>
        <p>
          Select both sides of the deal, then add any costs that reduce gross
          profit.
        </p>
        <div className="commissionSelectors">
          <label>
            Purchase side (cost)
            <select
              value={poId}
              onChange={(e) => {
                setPoId(e.target.value);
                setSoId("");
              }}
            >
              <option value="">Select purchase order…</option>
              {purchaseOrders.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.po_number} · {x.vendor?.company_name || "Vendor"} ·{" "}
                  {money.format(Number(x.vendor_total))} ·{" "}
                  {x.purchasing_owner_name || "Unassigned"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sales side (revenue)
            <select
              value={soId}
              onChange={(e) => setSoId(e.target.value)}
              disabled={!poId || matchingSalesOrders.length === 0}
            >
              <option value="">
                {!poId
                  ? "Select a purchase order first…"
                  : matchingSalesOrders.length
                    ? "Select associated sales order…"
                    : "No sales orders associated with this PO"}
              </option>
              {matchingSalesOrders.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.so_number} · {x.customer_company} ·{" "}
                  {money.format(Number(x.sales_total))} ·{" "}
                  {x.sales_owner_name || "Unassigned"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="commissionFees">
          {expenseFields.map(({ key, label }) => (
            <label key={key}>
              {label} ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={expenses[key]}
                onChange={(e) =>
                  setExpenses((current) => ({
                    ...current,
                    [key]: e.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </label>
          ))}
          <small>
            All expenses are deducted from gross profit before commissions are
            calculated.
          </small>
        </div>
        {calculation && (
          <>
            <div className="commissionSummary">
              <article>
                <span>Purchase cost</span>
                <strong>{money.format(calculation.cost)}</strong>
              </article>
              <article>
                <span>Sales total</span>
                <strong>{money.format(calculation.sale)}</strong>
              </article>
              <article>
                <span>Total expenses</span>
                <strong>{money.format(calculation.totalExpenses)}</strong>
              </article>
              <article>
                <span>Net gross profit</span>
                <strong>{money.format(calculation.profit)}</strong>
              </article>
              <article>
                <span>
                  {po?.purchasing_owner_name || "Buyer"} (
                  {calculation.buyerRate}%)
                </span>
                <strong>{money.format(calculation.buyerCommission)}</strong>
              </article>
              <article>
                <span>
                  {so?.sales_owner_name || "Seller"} ({calculation.sellerRate}%)
                </span>
                <strong>{money.format(calculation.sellerCommission)}</strong>
              </article>
              <article>
                <span>Total commission</span>
                <strong>
                  {money.format(
                    calculation.buyerCommission + calculation.sellerCommission,
                  )}
                </strong>
              </article>
            </div>
            <p
              className={`commissionRule ${calculation.profit <= 0 ? "warning" : ""}`}
            >
              {calculation.profit <= 0
                ? "No positive gross profit, so commission is $0. "
                : ""}
              {calculation.rule}.
            </p>
            <button
              className="button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save Commission"}
            </button>
          </>
        )}
        {message && <p className="commissionMessage">{message}</p>}
      </section>
      <section className="commissionHistory">
        <header>
          <h2>Commission history</h2>
          <span>{records.length} records</span>
        </header>
        <div className="commissionTable">
          <table>
            <thead>
              <tr>
                <th>Orders</th>
                <th>Buyer</th>
                <th>Salesperson</th>
                <th>Cost</th>
                <th>Sale</th>
                <th>Expenses</th>
                <th>Net gross profit</th>
                <th>Buyer commission</th>
                <th>Sales commission</th>
                <th>Total</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              {records.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.purchase_order_number}</strong>
                    <small>{item.sales_order_number}</small>
                  </td>
                  <td>{item.buyer_name}</td>
                  <td>{item.salesperson_name}</td>
                  <td>{money.format(Number(item.purchase_cost))}</td>
                  <td>{money.format(Number(item.sales_total))}</td>
                  <td>
                    <strong>{money.format(expenseTotal(item))}</strong>
                    <small>
                      {expenseFields
                        .filter(({ key }) => Number(item[key]) > 0)
                        .map(
                          ({ key, label }) =>
                            `${label}: ${money.format(Number(item[key]))}`,
                        )
                        .join(" · ") || "No expenses"}
                    </small>
                  </td>
                  <td>{money.format(Number(item.gross_profit))}</td>
                  <td>
                    {money.format(Number(item.buyer_commission))}{" "}
                    <small>{Number(item.buyer_rate)}%</small>
                  </td>
                  <td>
                    {money.format(Number(item.salesperson_commission))}{" "}
                    <small>{Number(item.salesperson_rate)}%</small>
                  </td>
                  <td className="commissionTotal">
                    {money.format(
                      Number(item.buyer_commission) +
                        Number(item.salesperson_commission),
                    )}
                  </td>
                  <td>
                    {item.commission_rule}
                    <small>
                      {new Date(item.created_at).toLocaleDateString()}
                    </small>
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td colSpan={11}>No commissions saved yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
