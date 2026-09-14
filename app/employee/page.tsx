"use client";
import { useEffect, useState } from "react";
import {
  clearPddSession,
  currentPddEmployeeEmail,
  currentPddSession,
  pddAuthFetch,
} from "../../lib/pdd-auth";
import { Shell } from "../../components/SiteShell";
type Profile = {
  email: string;
  display_name: string;
  role: "administrator" | "employee";
};
export default function EmployeeDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const session = await currentPddSession();
      if (!session) {
        window.location.replace("/employee-login");
        return;
      }
      const employeeEmail = await currentPddEmployeeEmail(session);
      if (!employeeEmail) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      const response = await pddAuthFetch(
        `/rest/v1/pdd_employee_access?select=email,display_name,role&email=eq.${encodeURIComponent(employeeEmail)}&active=eq.true&limit=1`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!response.ok) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      const rows = (await response.json()) as Profile[];
      if (!rows[0]) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      setProfile(rows[0]);
      setLoading(false);
    })();
  }, []);
  function signOut() {
    clearPddSession();
    window.location.assign("/employee-login");
  }
  if (loading)
    return (
      <Shell>
        <main className="employeeDashboard">
          <p>Loading your Deal Desk…</p>
        </main>
      </Shell>
    );
  return (
    <Shell>
      <main className="employeeDashboard">
        <header>
          <div>
            <p className="eyebrow">M2M DASHBOARD</p>
            <h1>Welcome, {profile?.display_name}</h1>
            <p>
              {profile?.email} ·{" "}
              {profile?.role === "administrator" ? "Administrator" : "Employee"}
            </p>
          </div>
          <button className="button secondary" onClick={signOut}>
            Sign out
          </button>
        </header>
        <section className="employeeDashboardGrid groupedDashboard">
          <article className="dashboardReports">
            <span>REPORTS</span>
            <h2>Reports</h2>
            <p>Review Deal Desk traffic and business performance reports.</p>
            <div className="workbookActionList">
              <a href="/employee/page-view-reports">
                LBB Page View Reports <b>→</b>
              </a>
              <a href="/employee/reports">
                Employee Sales &amp; Purchasing Reports <b>→</b>
              </a>
              <a href="/employee/commissions">
                Commission Reports <b>→</b>
              </a>
              <a href="/employee/product-analysis">
                Product Analysis <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardBusinessRecords">
            <span>RECORDS &amp; REPORTS</span>
            <h2>Business records</h2>
            <p>
              Find contacts, review all orders and compare purchasing and sales
              across every employee.
            </p>
            <div className="workbookActionList">
              <a href="/employee/orders">
                All Order History <b>→</b>
              </a>
              {profile?.role === "administrator" && (
                <a href="/employee/access">
                  Manage Access &amp; Send Activation Emails <b>→</b>
                </a>
              )}
              <a href="/employee/contacts">
                Vendors &amp; Customers <b>→</b>
              </a>
              <a href="/employee/export-compliance">
                Export Compliance Reviews <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardSales">
            <span>SALES</span>
            <h2>Sales</h2>
            <p>
              Record customer offers, create sales orders and review sales
              history.
            </p>
            <div className="workbookActionList">
              <a href="/employee/sales-order">
                Create Sales Order <b>→</b>
              </a>
              <a href="/employee/contacts?type=customers">
                Customers <b>→</b>
              </a>
              <a href="/employee/applications?site=m2m&amp;type=customer">M2M Customer Onboarding <b>→</b></a>
              <a href="/employee/orders?type=sales">
                Sales Order History <b>→</b>
              </a>
              <a href="/employee/pending-fulfillment?view=fulfilled">
                Fulfilled Deals <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardDealWorkflow">
            <span>DEALS</span>
            <h2>Deal workflow</h2>
            <p>Upload, continue and manage customer bidding opportunities.</p>
            <div className="workbookActionList">
              <a className="greenWorkflowAction" href="/employee/active-bids">
                Deal Workbook <b>→</b>
              </a>
              <a
                className="primaryWorkflowAction"
                href="/public-deal-desk/deal-builder?new=1&amp;award=single"
              >
                Create New Deal <b>→</b>
              </a>
              <a href="/employee/deal-search">
                Search All Deals <b>→</b>
              </a>
              <a href="/employee/customer-bid">
                Submit Customer Bid <b>→</b>
              </a>
              <a href="/employee/vendor-bid">
                Revert to Original Bid <b>→</b>
              </a>
              <a href="/employee/deals">
                Manage Deals &amp; Awards <b>→</b>
              </a>
              <a className="primaryWorkflowAction" href="/employee/finalize-deal">
                Finalize a Deal <b>→</b>
              </a>
              <a className="greenWorkflowAction" href="/employee/pending-fulfillment">
                Pending Fulfillment <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardProspects">
            <span>CONTRACT TARGETS</span>
            <h2>Prospect directories</h2>
            <p>
              Build relationships with end users, brokers, international
              companies, OEMs and contract targets.
            </p>
            <div className="workbookActionList">
              <a href="/employee/end-user-customers?type=broker">
                Broker Prospects <b>→</b>
              </a>
              <a href="/employee/end-user-customers">
                End User Prospects <b>→</b>
              </a>
              <a href="/employee/end-user-customers?type=international">
                International Prospects <b>→</b>
              </a>
              <a href="/employee/end-user-customers?type=oem">
                OEM Prospects <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardPurchasing">
            <span>PURCHASING</span>
            <h2>Purchasing</h2>
            <p>
              Create vendor purchase orders and manage vendor purchasing
              records.
            </p>
            <div className="workbookActionList">
              <a href="/employee/reverse-offer">
                Create Purchase Order <b>→</b>
              </a>
              <a href="/employee/contacts?type=vendors">
                Vendors <b>→</b>
              </a>
              <a href="/employee/applications?site=m2m&amp;type=vendor">M2M Vendor Onboarding <b>→</b></a>
              <a href="/employee/orders?type=purchase">
                Purchase Order History <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardR2Processing">
            <span>R2 OPERATIONS</span>
            <h2>R2 Processing</h2>
            <p>
              Open the approved data-erasure system used during R2 processing.
            </p>
            <div className="workbookActionList">
              <a className="greenWorkflowAction" href="/employee/r2-processing">
                In-Process R2 Deals <b>→</b>
              </a>
              <a href="/employee/bitraser">
                BitRaser Connection <b>→</b>
              </a>
              <a href="/employee/imei-checker">
                IMEI &amp; Serial Checker <b>→</b>
              </a>
              <a
                href="https://www.bitraser.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                BitRaser <b>↗</b>
              </a>
            </div>
          </article>
          <article className="dashboardResearch">
            <span>RESEARCH</span>
            <h2>Research</h2>
            <p>
              Analyze product configurations, market pricing, condition and
              cost before submitting a purchase offer.
            </p>
            <div className="workbookActionList">
              <a href="/employee/spec-bid-analysis?purchase=end-user">
                Spec Bid Analysis (End-User Purchase) <b>→</b>
              </a>
              <a href="/employee/spec-bid-analysis?purchase=broker">
                Spec Bid Analysis (Broker Purchase) <b>→</b>
              </a>
              <a href="/employee/spec-bid-analysis?purchase=itad">
                Spec Bid Analysis (ITAD Purchase) <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardBrainFarm">
            <span>BRAINFARM</span>
            <h2>BrainFarm</h2>
            <p>
              Configure AI systems, component costs and customer pricing by
              build level.
            </p>
            <div className="workbookActionList">
              <a href="/employee/applications?site=brainfarm&amp;type=customer">
                BrainFarm Customer Onboarding <b>→</b>
              </a>
              <a href="/employee/applications?site=brainfarm&amp;type=vendor">
                BrainFarm Vendor Onboarding <b>→</b>
              </a>
              <a href="/employee/system-builds/custom">
                Custom Build <b>→</b>
              </a>
              <a href="/employee/system-builds/entry-level">
                Entry Level <b>→</b>
              </a>
              <a href="/employee/system-builds/mid-range">
                Mid-Range <b>→</b>
              </a>
              <a href="/employee/system-builds/enterprise">
                Enterprise <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardChicoStock">
            <span>INVENTORY</span>
            <h2>Chico Stock</h2>
            <p>
              Receive, review and track inventory stored at the Chico
              warehouse.
            </p>
            <div className="workbookActionList">
              <a href="/employee/chico-stock?view=current">
                Current Inventory <b>→</b>
              </a>
              <a href="/employee/chico-stock?view=receive">
                Receive Inventory <b>→</b>
              </a>
              <a href="/employee/chico-stock?view=activity">
                Inventory Activity <b>→</b>
              </a>
              <a href="/employee/chico-stock?view=reports">
                Inventory Reports <b>→</b>
              </a>
            </div>
          </article>
          <article className="dashboardIntegrations">
            <span>CONNECTED TOOLS</span>
            <h2>Integrations</h2>
            <p>
              Open the Deal Manager to prepare and publish approved inventory
              listings through connected sales channels.
            </p>
            <div className="workbookActionList">
              <a href="/employee/integrations/brokerbin">
                <span className="integrationLinkLabel"><img src="https://brokerbin.com/favicon.ico" alt="" aria-hidden="true" />BrokerBin Posting</span> <b>→</b>
              </a>
              <a href="/employee/integrations/facebook">
                <span className="integrationLinkLabel"><img src="https://www.facebook.com/favicon.ico" alt="" aria-hidden="true" />Facebook Posting</span> <b>→</b>
              </a>
              <a href="/employee/integrations/linkedin">
                <span className="integrationLinkLabel"><img src="https://www.linkedin.com/favicon.ico" alt="" aria-hidden="true" />LinkedIn Posting</span> <b>→</b>
              </a>
              <a href="/employee/mailchimp">
                <span className="integrationLinkLabel"><img src="https://mailchimp.com/favicon.ico" alt="" aria-hidden="true" />Mailchimp</span> <b>→</b>
              </a>
              <a href="/employee/integrations/tbs">
                <span className="integrationLinkLabel"><img src="https://www.thebrokersite.com/favicon.png" alt="" aria-hidden="true" />TBS Posting</span> <b>→</b>
              </a>
              <a href="/employee/integrations/tradeloop">
                <span className="integrationLinkLabel"><img src="https://www.tradeloop.com/favicon.ico" alt="" aria-hidden="true" />TradeLoop Posting</span> <b>→</b>
              </a>
            </div>
          </article>
        </section>
      </main>
    </Shell>
  );
}
