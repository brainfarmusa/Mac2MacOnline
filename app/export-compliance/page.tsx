import {Shell} from "@/components/SiteShell";
import ExportComplianceForm from "@/components/ExportComplianceForm";
import "./export-compliance.css";
export const metadata={title:"Export Compliance & End-Use Certification",description:"Submit end-user, destination and end-use information for Mac2MacOnline export compliance review.",alternates:{canonical:"/export-compliance"}};
export default function Page(){return <Shell><main className="exportPage"><ExportComplianceForm/></main></Shell>}
