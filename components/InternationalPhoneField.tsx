"use client";

import {useEffect,useRef,useState} from "react";

const countries=[
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

export default function InternationalPhoneField({required=false}:{required?:boolean}){
  const [country,setCountry]=useState("US");
  const [number,setNumber]=useState("");
  const shell=useRef<HTMLDivElement>(null);
  const selected=countries.find(item=>item[0]===country)||countries[0];
  useEffect(()=>{const form=shell.current?.closest("form");if(!form)return;const reset=()=>{setCountry("US");setNumber("")};form.addEventListener("reset",reset);return()=>form.removeEventListener("reset",reset)},[]);
  const local=number.trim();
  const international=local?(local.startsWith("+")?local:`+${selected[3]} ${local}`):"";
  return <label>Phone<div className="international-phone" ref={shell}>
    <select aria-label="Phone country" name="Phone country" value={country} onChange={event=>setCountry(event.target.value)}>
      {countries.map(([code,flag,name,dial])=><option key={code} value={code}>{flag} {name} (+{dial})</option>)}
    </select>
    <input aria-label="International phone number" required={required} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Phone number" value={number} onChange={event=>setNumber(event.target.value)}/>
    <input type="hidden" name="Phone" value={international}/>
  </div><small className="phone-help">{selected[1]} {selected[2]} · International code +{selected[3]}</small></label>
}
