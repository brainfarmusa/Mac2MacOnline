import WeBuyLanding from "@/components/WeBuyLanding";

export const metadata = {
  title: "IT Asset Disposition in Chico & Northern California",
  description:
    "IT asset disposition, technology remarketing and responsible electronics recovery for businesses in Chico and Northern California.",
  alternates: { canonical: "/itad-chico-northern-california" },
};

export default function Page() {
  return (
    <WeBuyLanding
      category="business IT assets"
      headline="IT asset disposition in Chico and Northern California."
      intro="Mac2MacOnline helps businesses, schools, agencies and technology partners evaluate retired computers and enterprise equipment for resale, reuse and responsible downstream processing through Sierra Circuit Repair’s certified Chico operation."
      items={[
        "Retired computers & business fleets",
        "Servers, storage & networking",
        "RAM, SSDs, GPUs & components",
        "Apple systems, displays & mobile devices",
      ]}
      details={[
        "Equipment type, manufacturer and model",
        "Estimated quantity and condition",
        "Data-bearing devices and sanitization needs",
        "Current packaging, pallets or pickup requirements",
        "Chico or Northern California location",
      ]}
      source="Chico Northern California ITAD page"
    />
  );
}
