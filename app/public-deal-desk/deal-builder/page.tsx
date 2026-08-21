"use client";

import {useEffect,useMemo,useState} from "react";
import {Shell} from "@/components/SiteShell";
import "./deal-builder.css";

type ColumnChoice={source:string;label:string;included:boolean};

const RECOMMENDED=new Set(["Lot","Brand","Model","Model#","Processor","RAM","RAM_Type","Hard_Drive","HD_Type","Optical","Unit_Condition","Condition","Raid_Controller","Module","PowerSupply","Issues & Comments"]);
const DEFAULT_LABELS:Record<string,string>={"Model#":"Model Number",RAM_Type:"RAM Type",Hard_Drive:"Hard Drive",HD_Type:"Drive Type",Unit_Condition:"Testing Status",Raid_Controller:"RAID Controller",PowerSupply:"Power Supply"};

function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i];if(quoted){if(char==='"'&&text[i+1]==='"'){cell+='"';i++}else if(char==='"'){quoted=false}else{cell+=char}}else if(char==='"'){quoted=true}else if(char===","){row.push(cell);cell=""}else if(char==="\n"){row.push(cell.replace(/\r$/,""));rows.push(row);row=[];cell=""}else{cell+=char}}
  if(cell||row.length){row.push(cell.replace(/\r$/,""));rows.push(row)}return rows;
}
function xml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}

export default function DealBuilder(){
  const [choices,setChoices]=useState<ColumnChoice[]>([]);
  const [rows,setRows]=useState<string[][]>([]);
  const [status,setStatus]=useState("Reading the ITAMG spreadsheet headers…");
  const [title,setTitle]=useState("181-Unit Mixed Enterprise Server Lot");
  const [dealNumber,setDealNumber]=useState("PDD-SERVER-001");
  const [description,setDescription]=useState("Mixed enterprise server lot including Dell, Lenovo, IBM, HP, HPE, Buffalo and Intel systems.");
  const [location,setLocation]=useState("California, USA");
  const [closeDate,setCloseDate]=useState("");

  useEffect(()=>{fetch("/deals/itamg-server-lot-source.csv").then(r=>r.text()).then(text=>{const parsed=parseCsv(text);const headers=parsed.shift()||[];setChoices(headers.map(source=>({source,label:DEFAULT_LABELS[source]||source,included:RECOMMENDED.has(source)})));setRows(parsed.filter(row=>row.some(Boolean)));setStatus(`${parsed.length.toLocaleString()} records and ${headers.length} spreadsheet columns loaded.`)}).catch(()=>setStatus("The ITAMG spreadsheet could not be loaded."))},[]);
  const selected=useMemo(()=>choices.map((choice,index)=>({...choice,index})).filter(choice=>choice.included),[choices]);
  const includedCount=selected.length;

  function setPreset(mode:"recommended"|"all"|"none"){setChoices(current=>current.map(choice=>({...choice,included:mode==="all"||(mode==="recommended"&&RECOMMENDED.has(choice.source))})))}
  function update(index:number,patch:Partial<ColumnChoice>){setChoices(current=>current.map((choice,i)=>i===index?{...choice,...patch}:choice))}
  function move(index:number,direction:-1|1){setChoices(current=>{const target=index+direction;if(target<0||target>=current.length)return current;const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next})}
  function downloadSpreadsheet(){
    if(!selected.length)return;
    const table=[selected.map(c=>c.label),...rows.map(row=>selected.map(c=>row[c.index]??""))];
    const worksheet=table.map((row,rowIndex)=>`<Row>${row.map(value=>`<Cell ss:StyleID="${rowIndex===0?"Header":"Data"}"><Data ss:Type="String">${xml(String(value))}</Data></Cell>`).join("")}</Row>`).join("");
    const content=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#123A59" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style><Style ss:ID="Data"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style></Styles><Worksheet ss:Name="Customer Bid"><Table>${worksheet}</Table></Worksheet></Workbook>`;
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([content],{type:"application/vnd.ms-excel"}));link.download=`${dealNumber||"PDD-Deal"}_Customer_Bid.xls`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }

  return <Shell><main className="builderPage"><section className="builderHero"><div><span className="builderKicker">PDD ADMIN PROTOTYPE · ITAMG SERVER LOT</span><h1>Build the customer spreadsheet column by column.</h1><p>The form read the actual header row from the uploaded ITAMG server spreadsheet. Choose what customers may see, rename any heading and preview the result before creating the PDD spreadsheet.</p></div><aside><strong>{rows.length||"—"}</strong><span>server records</span><strong>{choices.length||"—"}</strong><span>source columns</span><strong>{includedCount}</strong><span>customer columns</span></aside></section>
  <section className="builderBody"><div className="builderIntro"><div><span className="builderKicker">STEP 1</span><h2>Deal information</h2></div><p>{status}</p></div><div className="dealFields"><label>Deal number<input value={dealNumber} onChange={e=>setDealNumber(e.target.value)}/></label><label>Deal title<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="wide">Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Location<input value={location} onChange={e=>setLocation(e.target.value)}/></label><label>Offers close<input type="datetime-local" value={closeDate} onChange={e=>setCloseDate(e.target.value)}/></label></div>
  <div className="builderIntro columnIntro"><div><span className="builderKicker">STEP 2</span><h2>Select customer-facing columns</h2></div><div className="presetButtons"><button onClick={()=>setPreset("recommended")}>Recommended</button><button onClick={()=>setPreset("all")}>Include all</button><button onClick={()=>setPreset("none")}>Exclude all</button></div></div>
  <div className="columnTable"><div className="columnHeader"><span>Order</span><span>Include?</span><span>Original spreadsheet header</span><span>Customer-facing header</span></div>{choices.map((choice,index)=><div className={`columnRow ${choice.included?"included":"excluded"}`} key={choice.source}><div className="orderButtons"><button aria-label={`Move ${choice.source} up`} onClick={()=>move(index,-1)} disabled={index===0}>↑</button><button aria-label={`Move ${choice.source} down`} onClick={()=>move(index,1)} disabled={index===choices.length-1}>↓</button></div><label className="switch"><input type="checkbox" checked={choice.included} onChange={e=>update(index,{included:e.target.checked})}/><span>{choice.included?"Include":"Exclude"}</span></label><strong>{choice.source}</strong><input aria-label={`Customer header for ${choice.source}`} value={choice.label} disabled={!choice.included} onChange={e=>update(index,{label:e.target.value})}/></div>)}</div>
  <div className="builderIntro previewIntro"><div><span className="builderKicker">STEP 3</span><h2>Preview and generate</h2></div><button className="downloadButton" disabled={!selected.length} onClick={downloadSpreadsheet}>Generate Customer Spreadsheet</button></div><div className="dealPreview"><div className="previewCard"><span>FOR SALE · {dealNumber||"Deal number"}</span><h3>{title||"Deal title"}</h3><p>{description||"Deal description"}</p><dl><div><dt>Quantity</dt><dd>{rows.length||0}</dd></div><div><dt>Location</dt><dd>{location||"—"}</dd></div><div><dt>Offers close</dt><dd>{closeDate?new Date(closeDate).toLocaleString():"Not set"}</dd></div></dl></div><div className="sheetPreview"><table><thead><tr>{selected.map(choice=><th key={choice.source}>{choice.label}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((row,rowIndex)=><tr key={rowIndex}>{selected.map(choice=><td key={choice.source}>{row[choice.index]}</td>)}</tr>)}</tbody></table>{selected.length===0&&<p>Select at least one column to preview the customer spreadsheet.</p>}</div></div>
  <p className="prototypeNote"><strong>Prototype note:</strong> this page creates the customer spreadsheet locally for review. The next step will connect the approved settings and generated file to the PDD listing workflow.</p></section></main></Shell>}
