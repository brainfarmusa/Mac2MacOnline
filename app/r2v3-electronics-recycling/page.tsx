import WeBuyLanding from "@/components/WeBuyLanding";

export const metadata = {
  title: "R2v3-Certified Electronics Recycling & Reuse",
  description:
    "Work with Mac2MacOnline and Sierra Circuit Repair for R2v3-certified electronics reuse, technology remarketing and responsible downstream management.",
  alternates: { canonical: "/r2v3-electronics-recycling" },
};

export default function Page() {
  return (
    <WeBuyLanding
      category="reusable electronics and IT equipment"
      headline="R2v3-certified electronics recycling and reuse."
      intro="Sierra Circuit Repair, Inc., doing business as Mac2MacOnline, operates an actively certified R2v3 facility in Chico. Our scope supports logical data sanitization, testing and repair, brokering used electronics and components, and downstream-vendor management."
      items={[
        "Computers, laptops & Apple equipment",
        "Servers, storage & networking",
        "Data-bearing devices",
        "Reusable parts, components & mixed IT assets",
      ]}
      details={[
        "Equipment type and approximate quantity",
        "Manufacturer, model and part numbers",
        "Condition and known functionality",
        "Data status and handling requirements",
        "Location, packaging and desired timeline",
      ]}
      source="R2v3 electronics recycling page"
    />
  );
}
