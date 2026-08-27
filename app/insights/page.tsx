import type {Metadata} from "next";
import Link from "next/link";
import {PageHero,Shell} from "../../components/SiteShell";

export const metadata:Metadata={
  title:"Technology Remarketing Insights | Mac2MacOnline",
  description:"Practical guidance for selling surplus RAM, SSDs, GPUs, Apple equipment and other business technology.",
};

export default function InsightsPage(){return <Shell><main>
  <PageHero eyebrow="Insights" title="Technology remarketing insights" intro="Practical guidance for businesses and individuals selling surplus technology, parts and Apple equipment."/>
  <section className="insightsHub"><div className="wrap">
    <Link className="insightCard" href="/insights/where-to-sell-used-server-ram-and-ssds-in-bulk">
      <span>RAM &amp; SSD selling guide · August 24, 2026</span>
      <h2>Where to Sell Used Server RAM and SSDs in Bulk</h2>
      <p>What buyers need to evaluate server memory and enterprise storage, from exact part numbers and testing status to quantities and shipping details.</p>
      <b>Read the selling guide →</b>
    </Link>
    <Link className="insightCard" href="/insights/sell-surplus-ram-ssds-gpus-apple-equipment">
      <span>Equipment remarketing · August 24, 2026</span>
      <h2>Where to Sell Surplus RAM, SSDs, GPUs and Apple Equipment</h2>
      <p>What Mac2MacOnline buys, what information to submit and how certified operations support responsible handling of used technology.</p>
      <b>Read the article →</b>
    </Link>
  </div></section>
 </main></Shell>}
