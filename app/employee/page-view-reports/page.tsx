"use client";
import { useEffect, useMemo, useState } from "react";
import { clearPddSession, currentPddSession } from "../../../lib/pdd-auth";

type ViewRow = {
  view_day: string;
  path: string;
  view_count: number;
  unique_viewers: number;
};
const label = (path: string) =>
  path === "/public-deal-desk" || path === "/live-bid-board"
    ? "Live Bid Board"
    : decodeURIComponent(path.split("/").pop() || path);
export default function PageViewReports() {
  const [rows, setRows] = useState<ViewRow[]>([]),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  useEffect(() => {
    void (async () => {
      const session = await currentPddSession();
      if (!session) {
        location.replace(
          "/employee-login?return_to=/employee/page-view-reports",
        );
        return;
      }
      const response = await fetch("/api/admin/page-views", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (response.status === 401) {
        clearPddSession();
        location.replace("/employee-login");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        rows?: ViewRow[];
        error?: string;
      };
      if (!response.ok)
        setMessage(data.error || "Page-view reports could not be loaded.");
      else setRows(data.rows || []);
      setLoading(false);
    })();
  }, []);
  const totals = useMemo(
    () => ({
      views: rows.reduce((sum, row) => sum + Number(row.view_count), 0),
      unique: rows.reduce((sum, row) => sum + Number(row.unique_viewers), 0),
      pages: new Set(rows.map((row) => row.path)).size,
    }),
    [rows],
  );
  const byPage = useMemo(() => {
    const result = new Map<
      string,
      { path: string; views: number; unique: number }
    >();
    for (const row of rows) {
      const current = result.get(row.path) || {
        path: row.path,
        views: 0,
        unique: 0,
      };
      current.views += Number(row.view_count);
      current.unique += Number(row.unique_viewers);
      result.set(row.path, current);
    }
    return [...result.values()].sort((a, b) => b.views - a.views);
  }, [rows]);
  return (
    <>
      <main className="reportsPage pageViewReports">
        <header>
          <div>
            <p className="eyebrow">LIVE BID BOARD</p>
            <h1>Page View Reports</h1>
            <p>
              Daily page loads and anonymous unique viewers for the past 90
              days. Dates use Pacific Time.
            </p>
          </div>
          <a href="/employee">← Dashboard</a>
        </header>
        <div className="reportGenerateActions">
          <button className="button secondary" type="button" onClick={() => window.print()}>
            Print Report
          </button>
        </div>
        {loading ? (
          <p className="reportMessage">Loading page-view reports…</p>
        ) : message ? (
          <p className="reportMessage">{message}</p>
        ) : (
          <>
            <section className="reportTotals">
              <article>
                <span>Total views</span>
                <strong>{totals.views.toLocaleString()}</strong>
                <small>Page loads</small>
              </article>
              <article>
                <span>Unique viewers</span>
                <strong>{totals.unique.toLocaleString()}</strong>
                <small>Anonymous browsers per page/day</small>
              </article>
              <article>
                <span>Pages viewed</span>
                <strong>{totals.pages.toLocaleString()}</strong>
                <small>Main board and deal pages</small>
              </article>
              <article>
                <span>Reporting period</span>
                <strong>90</strong>
                <small>Rolling days</small>
              </article>
            </section>
            <section className="reportPanel">
              <header>
                <h2>Totals by page</h2>
                <span>{byPage.length} pages</span>
              </header>
              <div className="reportTable">
                <table>
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Path</th>
                      <th>Views</th>
                      <th>Unique viewers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPage.map((row) => (
                      <tr key={row.path}>
                        <td>
                          <b>{label(row.path)}</b>
                        </td>
                        <td>
                          <a href={row.path} target="_blank" rel="noreferrer">
                            {row.path} ↗
                          </a>
                        </td>
                        <td>{row.views.toLocaleString()}</td>
                        <td>{row.unique.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="reportPanel">
              <header>
                <h2>Daily activity</h2>
                <span>{rows.length} records</span>
              </header>
              <div className="reportTable">
                <table>
                  <thead>
                    <tr>
                      <th>Date (PT)</th>
                      <th>Page</th>
                      <th>Views</th>
                      <th>Unique viewers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.view_day}-${row.path}`}>
                        <td>
                          <b>{row.view_day}</b>
                        </td>
                        <td>{label(row.path)}</td>
                        <td>{Number(row.view_count).toLocaleString()}</td>
                        <td>{Number(row.unique_viewers).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
