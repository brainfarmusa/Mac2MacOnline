import PublicDealDesk from "../public-deal-desk/page";
import PddPageViewTracker from "../../components/PddPageViewTracker";

export const metadata={title:"Live Bid Board",description:"Review active Mac2MacOnline wholesale technology lots, download deal spreadsheets and submit confidential offers.",alternates:{canonical:"/live-bid-board"}};

export default function LiveBidBoardPage(){return <><PddPageViewTracker/><PublicDealDesk/></>}
