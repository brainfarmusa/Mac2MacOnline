import {unzipSync} from "fflate";

export type ImportedPurchaseLine={line:number;sku:string;description:string;values:Record<string,string>;quantity:number;unitPrice:number;lineTotal:number};
export type ImportedPurchaseSheet={lines:ImportedPurchaseLine[];total:number;quantity:number;fields:string[];requiredFields:string[]};

const columnIndex=(reference:string)=>{const letters=(reference.match(/^[A-Z]+/i)?.[0]||"").toUpperCase();let result=0;for(const letter of letters)result=result*26+letter.charCodeAt(0)-64;return Math.max(0,result-1)};
const clean=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const number=(value:string)=>Number(value.replace(/[$,()]/g,match=>match==="("?"-":match===")"?"":""))||0;

export async function readPurchaseOrderSpreadsheet(file:File):Promise<ImportedPurchaseSheet>{
 if(file.size>10*1024*1024)throw new Error("The spreadsheet must be 10 MB or smaller.");
 if(!file.name.toLowerCase().endsWith(".xlsx"))throw new Error("Please choose an .xlsx spreadsheet.");
 let files:ReturnType<typeof unzipSync>;try{files=unzipSync(new Uint8Array(await file.arrayBuffer()))}catch{throw new Error("This Excel workbook could not be opened.")}
 const decoder=new TextDecoder(),sharedXml=files["xl/sharedStrings.xml"]?decoder.decode(files["xl/sharedStrings.xml"]):"",shared=sharedXml?[...new DOMParser().parseFromString(sharedXml,"application/xml").getElementsByTagNameNS("*","si")].map(item=>[...item.getElementsByTagNameNS("*","t")].map(text=>text.textContent||"").join("")):[];
 const sheetPath=Object.keys(files).filter(path=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).sort()[0];if(!sheetPath)throw new Error("No worksheet was found in the workbook.");
 const document=new DOMParser().parseFromString(decoder.decode(files[sheetPath]),"application/xml"),rows=[...document.getElementsByTagNameNS("*","row")].map(row=>{const result:string[]=[];for(const cell of [...row.getElementsByTagNameNS("*","c")]){const index=columnIndex(cell.getAttribute("r")||""),type=cell.getAttribute("t"),raw=cell.getElementsByTagNameNS("*","v")[0]?.textContent||"";result[index]=type==="s"?(shared[Number(raw)]||""):type==="inlineStr"?[...cell.getElementsByTagNameNS("*","t")].map(text=>text.textContent||"").join(""):raw}return result});
 const headerRow=rows.findIndex(row=>row.some(value=>["qty","quantity"].includes(clean(value)))&&row.some(value=>["total","line total","extended total"].includes(clean(value))));if(headerRow<0)throw new Error("Could not find columns for Qty and Total.");
 const originalHeaders=rows[headerRow].map((value,index)=>value.trim()||`Column ${index+1}`),headers=originalHeaders.map(clean),find=(names:string[])=>headers.findIndex(header=>names.includes(header)),qtyIndex=find(["qty","quantity"]),totalIndex=find(["total","line total","extended total"]),unitIndex=find(["unit price","unit bid","unit cost","price","cost"]),lineIndex=find(["line","line number","item"]),skuIndex=find(["sku","part number","part no","part","model number"]),dealIndex=find(["deal","company","vendor"]);
 const excluded=new Set([qtyIndex,totalIndex,unitIndex,lineIndex]);const lines:ImportedPurchaseLine[]=[];
 for(const row of rows.slice(headerRow+1)){const first=clean(row[lineIndex>=0?lineIndex:0]||"");if(first.includes("total"))continue;const quantity=number(row[qtyIndex]||""),sourceTotal=number(row[totalIndex]||""),sourceUnit=unitIndex>=0?number(row[unitIndex]||""):0;if(quantity<=0||(sourceTotal<=0&&sourceUnit<=0))continue;const lineTotal=sourceTotal>0?sourceTotal:quantity*sourceUnit,unitPrice=sourceUnit>0?sourceUnit:lineTotal/quantity,values=Object.fromEntries(originalHeaders.map((header,index)=>[header,(row[index]||"").trim()])),parts=row.map((value,index)=>({value:value?.trim()||"",index})).filter(item=>item.value&&!excluded.has(item.index)&&item.index!==skuIndex).map(item=>item.value);const deal=dealIndex>=0?(row[dealIndex]||"").trim():"";lines.push({line:lines.length+1,sku:skuIndex>=0?(row[skuIndex]||"").trim():"",description:[deal,...parts.filter(value=>value!==deal)].filter(Boolean).join(" · "),values,quantity,unitPrice,lineTotal})}
 if(!lines.length)throw new Error("No priced item lines were found. The sheet needs Qty and Total values.");
 const fields=originalHeaders.filter((header,index)=>lines.some(line=>Boolean(line.values[header]))&&index!==lineIndex),requiredFields=[originalHeaders[qtyIndex],originalHeaders[totalIndex]].filter(Boolean);return{lines,total:Math.round(lines.reduce((sum,line)=>sum+line.lineTotal,0)*100)/100,quantity:lines.reduce((sum,line)=>sum+line.quantity,0),fields,requiredFields};
}
