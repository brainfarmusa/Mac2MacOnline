import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.mac2maconline.com";
  const routes = [
    "",
    "/about",
    "/certifications",
    "/privacy",
    "/export-compliance",
    "/equipment-we-buy",
    "/trade-in",
    "/sell-ram-ssds-gpus-apple",
    "/sell-used-servers-networking",
    "/sell-used-cpus-processors",
    "/sell-optical-transceivers-network-components",
    "/sell-business-laptops-desktops-workstations",
    "/sell-ddr4-server-ram",
    "/sell-ddr5-server-ram",
    "/sell-mixed-untested-ram",
    "/sell-enterprise-nvme-ssds",
    "/itad-chico-northern-california",
    "/m2m-r2-grading",
    "/r2v3-electronics-recycling",
    "/we-buy-ram",
    "/we-buy-ssds",
    "/we-buy-gpus",
    "/we-buy-apple-equipment",
    "/insights",
    "/insights/sell-surplus-ram-ssds-gpus-apple-equipment",
    "/insights/where-to-sell-used-server-ram-and-ssds-in-bulk",
    "/consignment",
    "/want-to-buy",
    "/want-to-sell",
    "/request-quote",
    "/live-bid-board",
    "/public-deal-desk",
  ];
  const highValue = new Set([
    "/equipment-we-buy",
    "/trade-in",
    "/want-to-sell",
    "/we-buy-ram",
    "/we-buy-ssds",
    "/we-buy-gpus",
    "/we-buy-apple-equipment",
    "/sell-used-servers-networking",
    "/sell-used-cpus-processors",
    "/sell-optical-transceivers-network-components",
    "/sell-business-laptops-desktops-workstations",
  ]);
  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date("2026-09-06"),
    changeFrequency:
      path === "/public-deal-desk" || path === "/live-bid-board"
        ? "daily"
        : highValue.has(path)
          ? "weekly"
          : "monthly",
    priority:
      path === ""
        ? 1
        : path === "/public-deal-desk" || highValue.has(path)
          ? 0.9
          : 0.7,
  }));
}
