import WeBuyLanding from "@/components/WeBuyLanding";

export const metadata = {
  title: "Sell Used Servers & Networking Equipment",
  description:
    "Sell used rack servers, storage systems, switches, routers, optics and data-center networking equipment to Mac2MacOnline for wholesale evaluation.",
  alternates: { canonical: "/sell-used-servers-networking" },
};

export default function Page() {
  return (
    <WeBuyLanding
      category="servers and networking equipment"
      headline="Sell used servers and networking equipment."
      intro="Mac2MacOnline purchases rack and tower servers, enterprise storage, switches, routers, adapters, optics and related data-center equipment from businesses, IT teams, recyclers and wholesale suppliers."
      items={[
        "Rack & tower servers",
        "Enterprise storage systems",
        "Switches, routers & firewalls",
        "Network adapters, optics & components",
      ]}
      details={[
        "Manufacturer, model and service tag",
        "CPU, memory, storage and controller configuration",
        "Port count, speed and included optics",
        "Quantity, condition and testing status",
        "City, state and pallet or shipping details",
      ]}
      source="Servers and networking buying page"
    />
  );
}
