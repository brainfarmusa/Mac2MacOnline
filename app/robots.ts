import type {MetadataRoute} from "next";
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:"*",allow:"/",disallow:["/account","/customer-login","/employee","/employee-login","/my-bids","/public-deal-desk/deal-builder","/api/"]},sitemap:"https://www.mac2maconline.com/sitemap.xml",host:"https://www.mac2maconline.com"}}
