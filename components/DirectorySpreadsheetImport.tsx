"use client";

import {useRef,useState} from "react";
import {readSpreadsheetFile} from "@/lib/spreadsheetFile";

export type DirectoryImportKind="vendor"|"customer"|"prospect";
export type DirectoryImportRow=Record<string,string>;
export type DirectoryImportResult={added:number;updated:number;skipped:number;errors:string[]};
export type DirectoryExportRow=Record<string,unknown>;

const templates:Record<DirectoryImportKind,string[]>={
  vendor:["Company","Contact Name","Email","Phone","Address 1","Address 2","City","State / Region","Postal Code","Country","Assigned Employee Email"],
  customer:["Company","Contact Name","Email","Phone","Address 1","Address 2","City","State / Region","Postal Code","Country","Assigned Employee Email"],
  prospect:["Company","Website","Contact Name","Job Title","Email","Phone","Address 1","Address 2","City","State / Region","Postal Code","Country","Market","Organization Size","Government Level","Contractor Type","NAICS Codes","Source","Status","Priority","Assigned Employee Email","Follow-Up Date","Opportunity Notes","Locations","Organization Role","Business Focus","Product Fit","Product Angles","Supplier Entry Method","Supplier Requirements","Supplier Watchouts","Recommended Next Move","Supplier URL","Secondary Source URL","Application Submitted","Application Submitted Date","Application Status","Sell To Prospect","Buy From Prospect","Trade-In Candidate"],
};
const aliases:Record<string,string>={
  company:"company",companyname:"company",businessname:"company",organization:"company",
  contact:"contact_name",contactname:"contact_name",fullname:"contact_name",name:"contact_name",
  email:"email",emailaddress:"email",phone:"phone",phonenumber:"phone",telephone:"phone",
  address:"address1",address1:"address1",street:"address1",streetaddress:"address1",address2:"address2",
  city:"city",state:"region",region:"region",stateregion:"region",province:"region",zip:"postal_code",zipcode:"postal_code",postalcode:"postal_code",country:"country",
  assignedemployee:"assigned_employee_email",assignedemployeeemail:"assigned_employee_email",owner:"assigned_employee_email",salesperson:"assigned_employee_email",
  website:"website",url:"website",jobtitle:"job_title",title:"job_title",market:"market",organizationsize:"organization_size",governmentlevel:"government_level",contractortype:"contractor_type",naics:"naics_codes",naicscodes:"naics_codes",source:"source",status:"status",priority:"priority",followupdate:"follow_up_date",opportunitynotes:"opportunity_notes",notes:"opportunity_notes",locations:"locations",organizationrole:"organization_role",businessfocus:"business_focus",productfit:"product_fit",productangles:"product_angles",supplierentrymethod:"supplier_entry_method",supplierrequirements:"supplier_requirements",supplierwatchouts:"supplier_watchouts",recommendednextmove:"recommended_next_move",supplierurl:"supplier_url",secondarysourceurl:"secondary_source_url",applicationsubmitted:"application_submitted",applicationsubmitteddate:"application_submitted_date",applicationstatus:"application_status",selltoprospect:"sell_to_prospect",buyfromprospect:"buy_from_prospect",tradeincandidate:"trade_in_candidate",
};
const key=(value:unknown)=>String(value??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
const exportExtras:Record<DirectoryImportKind,{header:string;field:string}[]>={
  vendor:[
    {header:"Assigned Employee Name",field:"assigned_employee_name"},
    {header:"Last Updated",field:"updated_at"},
  ],
  customer:[
    {header:"Assigned Employee Name",field:"assigned_employee_name"},
    {header:"Bid Count",field:"bid_count"},
    {header:"Last Bid",field:"last_bid_at"},
    {header:"Customer Account",field:"has_account"},
    {header:"Last Updated",field:"updated_at"},
  ],
  prospect:[
    {header:"Assigned Employee Name",field:"assigned_employee_name"},
    {header:"Created By",field:"created_by_name"},
    {header:"Created At",field:"created_at"},
    {header:"Last Contacted At",field:"last_contacted_at"},
    {header:"Last Updated",field:"updated_at"},
  ],
};
const exportValue=(value:unknown)=>value===null||value===undefined?"":typeof value==="boolean"?(value?"Yes":"No"):value;

export default function DirectorySpreadsheetImport({kind,label,onImport,downloadRows}:{kind:DirectoryImportKind;label:string;onImport:(rows:DirectoryImportRow[])=>Promise<DirectoryImportResult>;downloadRows:DirectoryExportRow[]}){
  const input=useRef<HTMLInputElement>(null),[rows,setRows]=useState<DirectoryImportRow[]>([]),[fileName,setFileName]=useState(""),[busy,setBusy]=useState(false),[downloading,setDownloading]=useState(false),[message,setMessage]=useState("");
  async function downloadTemplate(){
    const XLSX=await import("@e965/xlsx"),sheet=XLSX.utils.aoa_to_sheet([templates[kind]]);
    sheet["!cols"]=templates[kind].map(header=>({wch:Math.max(15,header.length+3)}));
    const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,`${label} Import`);XLSX.writeFile(workbook,`${label.replaceAll(" ","_")}_Import_Template.xlsx`);
  }
  async function downloadDirectory(){
    if(!downloadRows.length||downloading)return;setDownloading(true);setMessage("");
    try{
      const XLSX=await import("@e965/xlsx"),columns=[...templates[kind].map(header=>({header,field:aliases[key(header)]})),...exportExtras[kind]],values=[columns.map(column=>column.header),...downloadRows.map(row=>columns.map(column=>exportValue(row[column.field])))],sheet=XLSX.utils.aoa_to_sheet(values);
      sheet["!cols"]=columns.map(column=>({wch:Math.min(55,Math.max(14,column.header.length+2,...downloadRows.slice(0,250).map(row=>String(exportValue(row[column.field])).length+2)))}));
      sheet["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:downloadRows.length,c:columns.length-1}})};
      const workbook=XLSX.utils.book_new(),safeLabel=label.replaceAll(" ","_");XLSX.utils.book_append_sheet(workbook,sheet,`${label.replaceAll("_"," ")} Directory`.slice(0,31));XLSX.writeFile(workbook,`${safeLabel}_Directory_${new Date().toISOString().slice(0,10)}.xlsx`);setMessage(`${downloadRows.length} ${downloadRows.length===1?"record":"records"} downloaded.`);
    }catch{setMessage("The directory spreadsheet could not be created.")}finally{setDownloading(false)}
  }
  async function choose(file?:File){
    if(!file)return;setMessage("");setRows([]);setFileName(file.name);
    try{
      const sheets=await readSpreadsheetFile(file,{label:"directory spreadsheet"}),parsed:DirectoryImportRow[]=[];
      let companyHeaderFound=false;
      for(const sheet of sheets){
        const headerIndex=sheet.rows.findIndex(line=>line.some(value=>["company","companyname","businessname","organization"].includes(key(value))));
        if(headerIndex<0)continue;
        companyHeaderFound=true;
        const headers=(sheet.rows[headerIndex]||[]).map(value=>aliases[key(value)]||"");
        for(const [offset,line] of sheet.rows.slice(headerIndex+1).entries()){
          const row=Object.fromEntries(headers.map((header,index)=>[header,String(line[index]??"").trim()]).filter(([header])=>header));
          if(row.company)parsed.push({...row,__sheet_name:sheet.name,__row_number:String(headerIndex+offset+2)});
        }
      }
      if(!companyHeaderFound)throw new Error("The spreadsheet needs a Company column.");
      if(!parsed.length)throw new Error("No company rows were found below the header. Confirm that the populated workbook was saved before selecting it.");
      setRows(parsed);setMessage(`${parsed.length} ${parsed.length===1?"row":"rows"} ready. Review the count, then select Update Directory.`);
    }catch(error){setMessage(error instanceof Error?error.message:"The spreadsheet could not be opened.")}
  }
  async function run(){if(!rows.length||busy)return;setBusy(true);setMessage("Matching existing records and updating the directory…");try{const result=await onImport(rows),summary=`${result.added} added, ${result.updated} updated, ${result.skipped} skipped.`,details=result.errors.length?` ${result.errors.slice(0,5).join(" ")}${result.errors.length>5?` ${result.errors.length-5} more row errors were found.`:""}`:"";setMessage(result.added+result.updated===0&&result.skipped?`Nothing was imported. ${summary}${details}`:`${summary}${details}`);if(!result.skipped){setRows([]);setFileName("");if(input.current)input.current.value=""}}catch(error){setMessage(error instanceof Error?error.message:"The spreadsheet could not be imported.")}finally{setBusy(false)}}
  return <section className="directoryImportPanel"><div><h3>Update from spreadsheet</h3><p>Download the current directory or use the {label.toLowerCase()} template to add and update records.</p></div><div className="directoryImportActions"><button className="button directoryDownloadButton" type="button" disabled={!downloadRows.length||downloading} onClick={()=>void downloadDirectory()}>{downloading?"Preparing Download…":`Download Directory (${downloadRows.length})`}</button><button type="button" onClick={()=>void downloadTemplate()}>Download Template</button><label className="button">Choose Spreadsheet<input ref={input} type="file" accept=".xlsx,.xls,.csv" onChange={event=>void choose(event.target.files?.[0])}/></label>{rows.length>0&&<button className="button" type="button" disabled={busy} onClick={()=>void run()}>{busy?"Updating…":`Update Directory (${rows.length})`}</button>}</div>{fileName&&<p><strong>{fileName}</strong></p>}{message&&<p className="directoryImportMessage">{message}</p>}</section>;
}
