"use client";

import {useState} from "react";
import type {MouseEvent,ReactNode} from "react";

type Props={href:string;children:ReactNode;className?:string};

function filenameFromDisposition(value:string|null){
  if(!value)return "deal-bid-sheet.xlsx";
  const utf8=value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if(utf8){try{return decodeURIComponent(utf8)}catch{}}
  return value.match(/filename="([^"]+)"/i)?.[1]||"deal-bid-sheet.xlsx";
}

export default function SpreadsheetDownloadLink({href,children,className}:Props){
  const [preparing,setPreparing]=useState(false);
  async function download(event:MouseEvent<HTMLAnchorElement>){
    event.preventDefault();
    if(preparing)return;
    setPreparing(true);
    try{await downloadSpreadsheet(href)}finally{
      setPreparing(false);
    }
  }
  return <a href={href} download className={className} onClick={download} aria-busy={preparing}>{preparing?"Preparing XLSX…":children}</a>;
}

export async function downloadSpreadsheet(href:string){
  try{
    const response=await fetch(href,{cache:"no-store",credentials:"same-origin"});
    if(!response.ok)throw new Error("download failed");
    const blob=await response.blob();
    const objectUrl=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=objectUrl;
    anchor.download=filenameFromDisposition(response.headers.get("content-disposition"));
    anchor.style.display="none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(objectUrl),30_000);
  }catch{
    window.location.assign(href);
  }
}
