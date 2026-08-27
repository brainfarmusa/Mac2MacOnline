"use client";

import {useEffect,useRef,useState} from "react";

export const phoneCountries=[
  ["US","🇺🇸","United States","1"],["CA","🇨🇦","Canada","1"],["MX","🇲🇽","Mexico","52"],["GB","🇬🇧","United Kingdom","44"],["IE","🇮🇪","Ireland","353"],
  ["AU","🇦🇺","Australia","61"],["NZ","🇳🇿","New Zealand","64"],["DE","🇩🇪","Germany","49"],["FR","🇫🇷","France","33"],["ES","🇪🇸","Spain","34"],
  ["IT","🇮🇹","Italy","39"],["NL","🇳🇱","Netherlands","31"],["BE","🇧🇪","Belgium","32"],["CH","🇨🇭","Switzerland","41"],["AT","🇦🇹","Austria","43"],
  ["PT","🇵🇹","Portugal","351"],["DK","🇩🇰","Denmark","45"],["SE","🇸🇪","Sweden","46"],["NO","🇳🇴","Norway","47"],["FI","🇫🇮","Finland","358"],
  ["PL","🇵🇱","Poland","48"],["CZ","🇨🇿","Czechia","420"],["RO","🇷🇴","Romania","40"],["HU","🇭🇺","Hungary","36"],["GR","🇬🇷","Greece","30"],
  ["UA","🇺🇦","Ukraine","380"],["TR","🇹🇷","Türkiye","90"],["IL","🇮🇱","Israel","972"],["AE","🇦🇪","United Arab Emirates","971"],["SA","🇸🇦","Saudi Arabia","966"],
  ["QA","🇶🇦","Qatar","974"],["KW","🇰🇼","Kuwait","965"],["ZA","🇿🇦","South Africa","27"],["EG","🇪🇬","Egypt","20"],["MA","🇲🇦","Morocco","212"],
  ["NG","🇳🇬","Nigeria","234"],["KE","🇰🇪","Kenya","254"],["GH","🇬🇭","Ghana","233"],["IN","🇮🇳","India","91"],["PK","🇵🇰","Pakistan","92"],
  ["BD","🇧🇩","Bangladesh","880"],["LK","🇱🇰","Sri Lanka","94"],["CN","🇨🇳","China","86"],["HK","🇭🇰","Hong Kong","852"],["TW","🇹🇼","Taiwan","886"],
  ["JP","🇯🇵","Japan","81"],["KR","🇰🇷","South Korea","82"],["SG","🇸🇬","Singapore","65"],["MY","🇲🇾","Malaysia","60"],["TH","🇹🇭","Thailand","66"],
  ["VN","🇻🇳","Vietnam","84"],["PH","🇵🇭","Philippines","63"],["ID","🇮🇩","Indonesia","62"],["BR","🇧🇷","Brazil","55"],["AR","🇦🇷","Argentina","54"],
  ["CL","🇨🇱","Chile","56"],["CO","🇨🇴","Colombia","57"],["PE","🇵🇪","Peru","51"],["EC","🇪🇨","Ecuador","593"],["UY","🇺🇾","Uruguay","598"],
  ["CR","🇨🇷","Costa Rica","506"],["PA","🇵🇦","Panama","507"],["DO","🇩🇴","Dominican Republic","1"],["JM","🇯🇲","Jamaica","1"],["PR","🇵🇷","Puerto Rico","1"]
] as const;

export default function InternationalPhoneField({required=false,name="Phone",initialValue=""}:{required?:boolean;name?:string;initialValue?:string}){
  const [country,setCountry]=useState("US");
  const [number,setNumber]=useState("");
  const shell=useRef<HTMLDivElement>(null);
  const selected=phoneCountries.find(item=>item[0]===country)||phoneCountries[0];
  const formatNumber=(value:string,code=country)=>{const digits=value.replace(/\D/g,"");if(["US","CA","PR","DO","JM"].includes(code)){const d=digits.slice(0,10);if(d.length<4)return d;if(d.length<7)return `(${d.slice(0,3)}) ${d.slice(3)}`;return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`}if(code==="MX"){const d=digits.slice(0,10);return [d.slice(0,2),d.slice(2,6),d.slice(6)].filter(Boolean).join(" ")}if(code==="GB"){const d=digits.slice(0,11);return [d.slice(0,4),d.slice(4,7),d.slice(7)].filter(Boolean).join(" ")}if(["AU","NZ"].includes(code)){const d=digits.slice(0,10);return [d.slice(0,4),d.slice(4,7),d.slice(7)].filter(Boolean).join(" ")}return digits.slice(0,15).replace(/(\d{3})(?=\d)/g,"$1 ")};
  useEffect(()=>{if(initialValue)setNumber(formatNumber(initialValue.replace(/^\+\d{1,3}\s*/,"")))},[initialValue]);
  useEffect(()=>{const form=shell.current?.closest("form");if(!form)return;const reset=()=>{setCountry("US");setNumber("")};form.addEventListener("reset",reset);return()=>form.removeEventListener("reset",reset)},[]);
  const local=number.trim();
  const international=local?(local.startsWith("+")?local:`+${selected[3]} ${local}`):"";
  return <label>Phone<div className="international-phone" ref={shell}>
    <select aria-label="Phone country" name="Phone country" value={country} onChange={event=>{const next=event.target.value;setCountry(next);setNumber(current=>formatNumber(current,next))}}>
      {phoneCountries.map(([code,flag,countryName,dial])=><option key={code} value={code}>{flag} {countryName} (+{dial})</option>)}
    </select>
    <input aria-label="International phone number" required={required} type="tel" inputMode="tel" autoComplete="tel-national" placeholder={["US","CA","PR","DO","JM"].includes(country)?"(555) 555-5555":"Phone number"} value={number} onChange={event=>setNumber(formatNumber(event.target.value))}/>
    <input type="hidden" name={name} value={international}/>
  </div><small className="phone-help">{selected[1]} {selected[2]} · International code +{selected[3]}</small></label>
}
