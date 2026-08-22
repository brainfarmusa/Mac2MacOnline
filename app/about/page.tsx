import Link from "next/link";
import {PageHero,Shell} from "@/components/SiteShell";

export default function Page(){return <Shell>
  <PageHero eyebrow="Established market knowledge" title="Technology lifecycle, handled practically." intro="Mac2MacOnline is geared toward wholesale technology sales, backed by more than four decades of extensive experience and long-standing relationships throughout the global secondary market."/>
  <section className="wrap story"><div>
    <h2>Wholesale technology expertise with worldwide reach.</h2>
    <p>Our experience extends well beyond resale. We have worked across many areas of technology, including hardware identification and testing, component-level services, BGA rework, refurbishment, value recovery and international sales.</p>
    <p>Mac2MacOnline focuses on direct business-to-business and wholesale technology sales. We have built many long-standing relationships worldwide with ITAD companies, resellers, buyers and suppliers, giving us practical access to established markets for computers, enterprise equipment, mobile devices, parts and accessories.</p>
    <p>Our history includes more than 33,000 positive eBay feedbacks. Although we do not currently sell through e-commerce channels, that record reflects decades of accurate representation, dependable service and successful transactions.</p>
    <p>Our Chico operation is actively R2v3 certified, with a publicly listed scope that includes logical data sanitization, testing and repairing, brokering used electronics and components, and downstream-vendor management.</p>
    <p><a className="text-link" href="https://www.itadfinder.com/facility/sierra-circuit-repair-inc-dba-mac2maconline-chico/" target="_blank" rel="noreferrer">View the public certification listing ↗</a></p>
  </div><div className="fact-card">
    <b>Four decades</b><span>extensive technology experience</span>
    <b>33,000+</b><span>positive eBay feedbacks</span>
    <b>Wholesale</b><span>technology sales focus</span>
    <b>Worldwide</b><span>ITAD and reseller relationships</span>
    <b>BGA rework</b><span>hands-on technical experience</span>
    <b>Active R2v3</b><span>certified Chico operation</span>
  </div></section>
  <section className="program-details"><div className="wrap two-col"><div>
    <span className="eyebrow">Complementary companies</span><h2>Mac2MacOnline + BrainFarm USA</h2>
    <p>Mac2MacOnline is geared toward wholesale technology sales and global secondary-market relationships. In conjunction with BrainFarm USA, we also work directly with end users on asset recovery, equipment transitions and responsible value recovery.</p>
    <p>Our shared vision is to reduce unnecessary electronic waste and help lessen AI’s growing infrastructure burden. Mac2MacOnline identifies capable enterprise equipment for continued use; BrainFarm reconfigures suitable reclaimed technology into three levels of secure, on-premises AI hardware.</p>
    <p>This combination can lower the cost of business AI, extend the useful life of computers and components, reduce dependence on large data centers and keep customer data inside the customer’s own controlled environment.</p>
    <p>Together, the companies can help customers acquire private AI platforms, recover value from displaced equipment, source validated upgrades and responsibly manage each future hardware transition.</p>
  </div><div className="partner-mark"><img src="/assets/brainfarm-emblem.png" alt="BrainFarm USA emblem"/><strong>Two companies.</strong><span>One technology lifecycle.</span><a className="button" href="https://brainfarmusa.github.io/BrainFarm/" target="_blank" rel="noreferrer">Visit BrainFarm USA ↗</a></div></div></section>
  <section className="cta"><div className="wrap"><h2>Tell us what you are working on.</h2><Link className="button light" href="/request-quote">Start an inquiry</Link></div></section>
</Shell>}
