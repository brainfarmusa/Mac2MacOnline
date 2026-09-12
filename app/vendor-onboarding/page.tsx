import { Shell } from "@/components/SiteShell";
import OnboardingForm from "@/components/OnboardingForm";
import "../onboarding.css";
export const metadata = {
  title: "Vendor Onboarding",
  description: "Apply to become a Mac2MacOnline equipment vendor.",
  alternates: { canonical: "/vendor-onboarding" },
};
export default function Page() {
  return (
    <Shell>
      <main className="onboardPage">
        <OnboardingForm kind="vendor" site="Mac2MacOnline" />
      </main>
    </Shell>
  );
}
