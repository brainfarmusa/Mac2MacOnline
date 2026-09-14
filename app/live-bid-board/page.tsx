import PublicDealDesk from "../public-deal-desk/page";
import PddPageViewTracker from "../../components/PddPageViewTracker";

export const metadata={title:"Live Bid Board",description:"Review active Mac2MacOnline wholesale technology lots, download deal spreadsheets and submit confidential offers.",alternates:{canonical:"/live-bid-board"},openGraph:{title:"Live Bid Board | Mac2MacOnline",description:"Review active wholesale technology lots, download deal spreadsheets and submit confidential offers.",url:"/live-bid-board",type:"website"},twitter:{card:"summary_large_image",title:"Live Bid Board | Mac2MacOnline",description:"Review active wholesale technology lots and submit confidential offers."}};

export default function LiveBidBoardPage(){return <><PddPageViewTracker/><PublicDealDesk/></>}
