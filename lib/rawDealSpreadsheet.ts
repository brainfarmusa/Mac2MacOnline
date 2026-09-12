import {readSpreadsheetFile} from "./spreadsheetFile";

export type SpreadsheetSkippedRow={sheet:string;row:number;reason:string;preview:string};
export type RawSpreadsheetPreview={headers:string[];rows:string[][];rowCount:number;headerRow:number;rowSources?:Array<{sheet:string;row:number}>;skippedRows?:SpreadsheetSkippedRow[]};
export type SpreadsheetSelection={mode:"single"|"all"|"lots";names:string[]};

// Container Log is reference material only. Keep it in the stored original
// workbook, but never use it to create, quantify, or publish bid lines.
const ignoredBidSheet = (name:string) => /^container\s+log$/i.test(name.trim());

export async function spreadsheetSheetNames(file:File):Promise<string[]>{
  return (await readSpreadsheetFile(file,{label:"raw spreadsheet"}))
    .map(sheet=>sheet.name)
    .filter(name=>!ignoredBidSheet(name));
}

const quantityHeader=/^(?:qty|quantity|units?|unit count|count)$/i;
const itemHeader=/^(?:make|manufacturer|mfg|brand|model|description|processor|cpu|memory(?: gb)?|ram|form factor|service tag)$/i;
const calculationHeader=/^(?:bid\s*\/\s*unit|unit bid|unit price|bid amount|total(?: bid| price| amount)?|extended(?: price| amount)?)$/i;

function headerScore(row:string[]){
  const values=row.map(value=>String(value||"").trim());
  return (values.some(value=>quantityHeader.test(value))?20:0)+values.filter(value=>itemHeader.test(value)).length*4+values.filter(Boolean).length;
}

function headerExtent(headers:string[]){
  let last=headers.reduce((found,value,index)=>value?index:found,-1);
  for(let index=0;index<headers.length-2;index++){
    if(headers[index]||headers[index+1]||headers[index+2])continue;
    if(headers.slice(0,index).filter(Boolean).length>=2){last=headers.slice(0,index).reduce((found,value,offset)=>value?offset:found,-1);break}
  }
  return last;
}

function sheetLotName(parsed:string[][],sheetName:string){
  for(const row of parsed.slice(0,20))for(let index=0;index<row.length;index++){
    if(!/^(?:pallet|box|lot)(?:\s*(?:#|number|no\.?))?\s*:?$/i.test(String(row[index]||"").trim()))continue;
    const value=row.slice(index+1).map(cell=>String(cell||"").trim()).find(Boolean);
    if(value)return value;
  }
  return sheetName;
}

function normalizeSheet(parsed:string[][],sheetName:string){
  const candidates=parsed.map((row,index)=>({index,score:headerScore(row)})).filter(candidate=>candidate.score>=20);
  const headerIndex=candidates.sort((left,right)=>right.score-left.score||left.index-right.index)[0]?.index??parsed.findIndex(row=>row.filter(value=>String(value||"").trim()).length>=2);
  if(headerIndex<0)throw new Error(`A header row could not be found on the “${sheetName}” tab.`);
  const headers=(parsed[headerIndex]||[]).map(value=>String(value||"").trim());
  const lastHeader=headerExtent(headers);
  if(lastHeader<1)throw new Error(`The “${sheetName}” tab needs at least two named columns.`);
  const sourceHeaders=headers.slice(0,lastHeader+1);
  const keptIndexes=sourceHeaders.map((header,index)=>calculationHeader.test(header)?-1:index).filter(index=>index>=0);
  const normalizedHeaders=keptIndexes.map(index=>sourceHeaders[index]);
  const quantityIndex=normalizedHeaders.findIndex(header=>quantityHeader.test(header));
  const skippedRows:SpreadsheetSkippedRow[]=[];
  const items=parsed.slice(headerIndex+1)
    .map((row,index)=>({values:keptIndexes.map(column=>String(row[column]??"").trim()),rowNumber:headerIndex+2+index}))
    .filter(item=>{
      const row=item.values,nonEmpty=row.filter(Boolean);
      if(!nonEmpty.length)return false;
      if(nonEmpty.length<2){
        skippedRows.push({sheet:sheetName,row:item.rowNumber,reason:"Only one populated cell was found, so this row was treated as notes or footer text.",preview:nonEmpty[0]});
        return false;
      }
      if(quantityIndex<0)return true;
      const rawQuantity=String(row[quantityIndex]||"").trim(),quantity=Number(rawQuantity.replace(/,/g,""));
      if(!Number.isFinite(quantity)||quantity<=0){
        skippedRows.push({sheet:sheetName,row:item.rowNumber,reason:`The quantity “${rawQuantity||"blank"}” is not a positive number.`,preview:nonEmpty.slice(0,3).join(" | ")});
        return false;
      }
      return true;
    });
  const rows=items.map(item=>item.values),rowNumbers=items.map(item=>item.rowNumber);
  if(!rows.length)throw new Error(`No item rows were found on the “${sheetName}” tab.`);
  return {headers:normalizedHeaders,rows,rowNumbers,skippedRows,headerRow:headerIndex+1,lotName:sheetLotName(parsed,sheetName)};
}

export async function previewRawSpreadsheet(file:File,selection?:SpreadsheetSelection):Promise<RawSpreadsheetPreview>{
  const workbook=await readSpreadsheetFile(file,{label:"raw spreadsheet"}),available=workbook.map(sheet=>sheet.name).filter(name=>!ignoredBidSheet(name));
  if(!available.length)throw new Error("No sale-inventory worksheet was found. Container Log tabs are retained in the original workbook but are not used to create bid lines.");
  const requested=(selection?.mode==="all"?available:selection?.names?.length?selection.names:[available[0]]).filter(name=>!ignoredBidSheet(name));
  const chosen=selection?.mode==="lots"?requested.filter(name=>!/(?:^|\b)(?:summary|instructions?|read\s*me)(?:\b|$)/i.test(name.trim())):requested;
  if(!chosen.length)throw new Error("No sale-inventory worksheet was found. Container Log tabs are retained in the original workbook but are not used to create bid lines.");
  const sheets=chosen.map(name=>{const selected=workbook.find(sheet=>sheet.name===name);if(!selected)throw new Error(`The “${name}” tab is no longer available.`);return {name,...normalizeSheet(selected.rows,name)}});
  if(sheets.length===1)return {headers:sheets[0].headers,rows:sheets[0].rows,rowCount:sheets[0].rows.length,headerRow:sheets[0].headerRow,rowSources:sheets[0].rows.map((_,index)=>({sheet:sheets[0].name,row:sheets[0].rowNumbers[index]})),skippedRows:sheets[0].skippedRows};
  const separateLots=selection?.mode==="lots";
  const headers=["Source Tab",...(separateLots?["Lot #"]:[]),...Array.from(new Set(sheets.flatMap(sheet=>sheet.headers)))];
  const dataHeaders=headers.slice(separateLots?2:1);
  const combined=sheets.flatMap(sheet=>sheet.rows.map((row,index)=>{const values=new Map(sheet.headers.map((header,column)=>[header,row[column]||""]));return {row:[sheet.name,...(separateLots?[sheet.lotName]:[]),...dataHeaders.map(header=>values.get(header)||"")],source:{sheet:sheet.name,row:sheet.rowNumbers[index]}}}));
  return {headers,rows:combined.map(item=>item.row),rowCount:combined.length,headerRow:1,rowSources:combined.map(item=>item.source),skippedRows:sheets.flatMap(sheet=>sheet.skippedRows)};
}
