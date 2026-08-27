import type {MetadataRoute} from "next";

export default function sitemap():MetadataRoute.Sitemap{
  const base="https://www.mac2maconline.com";
  const routes=["","/about","/equipment-we-buy","/sell-ram-ssds-gpus-apple","/we-buy-ram","/we-buy-ssds","/we-buy-gpus","/we-buy-apple-equipment","/insights","/insights/sell-surplus-ram-ssds-gpus-apple-equipment","/insights/where-to-sell-used-server-ram-and-ssds-in-bulk","/consignment","/want-to-buy","/want-to-sell","/request-quote","/live-bid-board","/public-deal-desk"];
  return routes.map(path=>({
    url:`${base}${path}`,
    lastModified:new Date(),
    changeFrequency:path==="/public-deal-desk"||path==="/live-bid-board"?"daily":"monthly",
    priority:path===""?1:(path==="/public-deal-desk"||path==="/sell-ram-ssds-gpus-apple"?0.9:0.7),
  }));
}
