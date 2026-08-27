import InquiryForm from "@/components/InquiryForm";
import Link from "next/link";
import {Shell} from "@/components/SiteShell";

export type WeBuyLandingProps={
  category:string; headline:string; intro:string; items:string[]; details:string[]; source:string;
  guideHref?:string; guideTitle?:string;
};

export default function WeBuyLanding({category,headline,intro,items,details,source,guideHref,guideTitle}:WeBuyLandingProps){
  return <Shell><main className="partsSellPage">
    <section className="partsHero"><div className="wrap partsHeroGrid"><div><p className="eyebrow">MAC2MACONLINE IS BUYING</p><h1>{headline}</h1><p>{intro}</p><div className="actions"><a className="button" href="#inventory-form">Sell Your Equipment to Us</a><a className="button secondary" href="mailto:sales@mac2maconline.com">Email Your List</a></div></div><aside><b>GET A FASTER OFFER</b><h2>Send exact part numbers.</h2><ul>{details.slice(0,4).map(x=><li key={x}>{x}</li>)}</ul></aside></div></section>
    <section className="partsTrust"><div className="wrap"><div><strong>R2v3</strong><span>Responsible electronics reuse and recycling</span></div><div><strong>ISO 9001</strong><span>Quality management</span></div><div><strong>ISO 14001</strong><span>Environmental management</span></div><div><strong>ISO 45001</strong><span>Health and safety management</span></div></div></section>
    <section className="wrap partsCategories"><div className="section-head"><p className="eyebrow">WHAT WE BUY</p><h2>{category} wanted from individuals and businesses.</h2><p>We consider single items, small lots, retired fleets and recurring wholesale inventory.</p></div><div>{items.map(item=><article key={item}><span>BUYING</span><h3>{item}</h3><p>Send the model or part number, quantity and condition so our purchasing team can evaluate it.</p></article>)}</div></section>
    <section className="partsSecurity"><div className="wrap"><div><p className="eyebrow">CERTIFIED OPERATIONS</p><h2>Sell through a responsible technology recovery partner.</h2><p>Our R2v3 and ISO-certified operations support documented quality, environmental, health and safety practices—including appropriate handling of data-bearing devices.</p></div><div className="partsSecuritySteps"><article><b>01</b><h3>Submit inventory</h3><p>Upload a spreadsheet or clear photos of labels and equipment.</p></article><article><b>02</b><h3>We evaluate it</h3><p>We review specifications, condition, quantity, market demand and logistics.</p></article><article><b>03</b><h3>Receive an offer</h3><p>Our team follows up with questions and a purchase path when there is a fit.</p></article></div></div></section>
    {guideHref&&guideTitle?<section className="sellerGuideCallout"><div className="wrap"><div><p className="eyebrow">SELLER GUIDE</p><h2>{guideTitle}</h2><p>See what information to provide, how working pulls and untested inventory are evaluated, and what to expect after you submit a lot.</p></div><Link className="button secondary" href={guideHref}>Read the selling guide →</Link></div></section>:null}
    <section className="partsForm" id="inventory-form"><div className="wrap inquiry-layout"><div><p className="eyebrow">SUBMIT INVENTORY FOR AN OFFER</p><h2>Show us the {category.toLowerCase()} you want to sell.</h2><p>A formal spreadsheet is helpful but not required. Clear label photos and an estimated quantity are enough to start.</p><div className="detail-panel"><h3>Useful details</h3><ul>{details.map(x=><li key={x}>{x}</li>)}</ul></div></div><div data-source={source}><InquiryForm type="sell" individualFriendly sellerFocus/></div></div></section>
  </main></Shell>;
}
