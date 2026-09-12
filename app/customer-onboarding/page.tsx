import { Shell } from "@/components/SiteShell";
import OnboardingForm from "@/components/OnboardingForm";
import "../onboarding.css";
export const metadata = {
  title: "Customer Onboarding",
  description: "Apply for a Mac2MacOnline customer account.",
  alternates: { canonical: "/customer-onboarding" },
};
export default function Page() {
  return (
    <Shell>
      <main className="onboardPage">
        <OnboardingForm kind="customer" site="Mac2MacOnline" />
      </main>
    </Shell>
  );
}
