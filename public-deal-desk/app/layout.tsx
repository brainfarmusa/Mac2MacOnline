import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"Public Deal Desk | Mac2MacOnline",description:"Mac2MacOnline Public Deal Desk for wholesale technology buying requests, available inventory and secure awarded-order checkout."};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
