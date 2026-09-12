import Link from "next/link";
import {Shell} from "@/components/SiteShell";
import TradeInForm from "@/components/TradeInForm";

export const metadata={
  title:"Technology Trade-In Program",
  description:"Tell Mac2MacOnline what technology equipment you want to buy and what you have to trade. Submit systems, servers, GPUs, Apple equipment, RAM, SSDs and more for review.",
  alternates:{canonical:"/trade-in"},
};

const accepted=[
  ["Apple equipment","MacBooks, iMacs, Mac minis, Mac Studios, Studio Displays, parts and accessories."],
  ["Enterprise hardware","Servers, storage arrays, networking equipment, workstations and complete systems."],
  ["Components","RAM, SSDs, CPUs, GPUs, AI accelerators, cards, drives and service parts."],
  ["Mixed technology lots","Upgrades, retired fleets, surplus inventory, working pulls and untested equipment."],
];

export default function Page(){return <Shell><main className="tradeInPage">
  <section className="tradeHero"><div className="wrap tradeHeroGrid"><div><span className="eyebrow">MAC2MACONLINE TRADE-IN PROGRAM</span><h1>Turn the equipment you have into the equipment you need.</h1><p>Tell us what you are looking to buy and what you have available to trade. We will review both sides, establish the values separately and propose a practical transaction.</p><div className="tradeHeroPoints"><span>Business and individual trade-ins</span><span>Single items or wholesale lots</span><span>Transparent purchase and trade values</span><span>R2v3 &amp; ISO-certified operations</span></div><a className="button" href="#trade-form">Start Your Trade-In</a></div><aside><b>ONE REVIEW. BOTH SIDES OF THE DEAL.</b><ol><li><strong>Tell us what you need</strong><span>Models, part numbers, quantities, specifications and timing.</span></li><li><strong>Show us what you have</strong><span>Inventory details, condition, photos and location.</span></li><li><strong>Review the proposal</strong><span>See the equipment price, trade value and balance clearly.</span></li></ol></aside></div></section>

  <section className="partsTrust"><div className="wrap"><div><strong>R2v3</strong><span>Responsible reuse and recycling</span></div><div><strong>ISO 9001</strong><span>Quality management</span></div><div><strong>ISO 14001</strong><span>Environmental management</span></div><div><strong>ISO 45001</strong><span>Health and safety management</span></div></div></section>

  <section className="tradeAccepted wrap"><div className="tradeSectionHead"><span className="eyebrow">WHAT CAN BE TRADED</span><h2>A broad technology trade-in program.</h2><p>Exact part numbers make valuation faster, but a rough list or clear label photos are enough to begin.</p></div><div className="tradeAcceptedGrid">{accepted.map(([title,copy],index)=><article key={title}><b>0{index+1}</b><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

  <section className="tradeValue"><div className="wrap"><div><span className="eyebrow">HOW WE DETERMINE VALUE</span><h2>Clear information produces a stronger, faster proposal.</h2><p>We evaluate manufacturer, model or part number, configuration, quantity, testing status, cosmetic condition, locks, data requirements, packaging, location and current market demand. The equipment you are buying and the equipment you are trading are valued separately so the transaction remains understandable.</p></div><div className="tradeValueCards"><article><strong>Purchase value</strong><p>The price and availability of the equipment you want, including configuration, quantity and delivery considerations.</p></article><article><strong>Trade-in value</strong><p>The market value of your equipment based on specifications, condition, quantity, demand and logistics.</p></article><article><strong>Net balance</strong><p>The difference between the two values, documented before either side commits to the transaction.</p></article></div></div></section>

  <section className="tradeFormSection" id="trade-form"><div className="wrap tradeFormLayout"><div><span className="eyebrow">START HERE</span><h2>Build your trade-in request.</h2><p>Enter the equipment you want to purchase and the equipment you are offering. You can upload a spreadsheet, specifications and photos with the same request.</p><div className="tradeFormTips"><h3>Helpful information</h3><ul><li>Manufacturer, exact model or part number</li><li>Quantity and configuration</li><li>Testing and cosmetic condition</li><li>Known locks, defects or missing parts</li><li>Equipment location and desired timing</li><li>Photos of labels and visible damage</li></ul></div><p className="tradeFinePrint">Submitting this form is a request for review and does not obligate either party. Final values are subject to inspection, availability and written agreement.</p></div><TradeInForm/></div></section>

  <section className="tradeNext"><div className="wrap"><div><span className="eyebrow">WHAT HAPPENS NEXT</span><h2>From request to completed exchange.</h2></div><ol><li><b>1</b><h3>Initial review</h3><p>We check both equipment lists and follow up for any critical details.</p></li><li><b>2</b><h3>Valuation</h3><p>We establish the purchase price and trade-in value as separate figures.</p></li><li><b>3</b><h3>Inspection</h3><p>We confirm condition, configuration, ownership and data-handling needs.</p></li><li><b>4</b><h3>Complete the trade</h3><p>Once approved, we coordinate payment, credit, shipping or pickup and documentation.</p></li></ol><p className="tradeAlternative">Only looking to sell? <Link href="/want-to-sell">Submit equipment for a direct purchase offer →</Link></p></div></section>
  </main></Shell>}
