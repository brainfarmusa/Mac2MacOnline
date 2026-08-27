export type RawSpreadsheetPreview={headers:string[];rows:string[][];rowCount:number;headerRow:number};
export type SpreadsheetSelection={mode:"single"|"all"|"lots";names:string[]};

function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i];if(quoted){if(char==='"'&&text[i+1]==='"'){cell+='"';i++}else if(char==='"')quoted=false;else cell+=char}else if(char==='"')quoted=true;else if(char===","){row.push(cell);cell=""}else if(char==="\n"){row.push(cell.replace(/\r$/,""));rows.push(row);row=[];cell=""}else cell+=char}
  if(cell||row.length){row.push(cell.replace(/\r$/,""));rows.push(row)}return rows;
}

async function readWorkbook(file:File){
  try{const XLSX=await import("@e965/xlsx");return XLSX.read(await file.arrayBuffer(),{type:"array",raw:false,cellText:true})}catch{throw new Error("This Excel workbook could not be opened. Please use a valid .xls or .xlsx file.")}
}

export async function spreadsheetSheetNames(file:File):Promise<string[]>{
  const lower=file.name.toLowerCase();
  if(lower.endsWith(".csv"))return ["CSV"];
  if(!lower.endsWith(".xls")&&!lower.endsWith(".xlsx"))throw new Error("Please select an .xls, .xlsx or .csv spreadsheet.");
  const workbook=await readWorkbook(file);return workbook.SheetNames.filter(name=>Boolean(workbook.Sheets[name]));
}

function normalizeSheet(parsed:string[][],sheetName:string){
  const headerIndex=parsed.findIndex(row=>row.filter(value=>String(value||"").trim()).length>=2);
  if(headerIndex<0)throw new Error(`A header row could not be found on the “${sheetName}” tab.`);
  const headers=(parsed[headerIndex]||[]).map(value=>String(value||"").trim());
  const lastHeader=headers.reduce((last,value,index)=>value?index:last,-1);
  if(lastHeader<1)throw new Error(`The “${sheetName}” tab needs at least two named columns.`);
  const normalizedHeaders=headers.slice(0,lastHeader+1);
  const rows=parsed.slice(headerIndex+1).map(row=>normalizedHeaders.map((_,index)=>String(row[index]??"").trim())).filter(row=>row.some(Boolean));
  if(!rows.length)throw new Error(`No item rows were found on the “${sheetName}” tab.`);
  return {headers:normalizedHeaders,rows,headerRow:headerIndex+1};
}

export async function previewRawSpreadsheet(file:File,selection?:SpreadsheetSelection):Promise<RawSpreadsheetPreview>{
  if(file.size===0)throw new Error("The selected spreadsheet is empty.");
  if(file.size>10*1024*1024)throw new Error("The raw spreadsheet must be 10 MB or smaller.");
  const lower=file.name.toLowerCase();
  if(!lower.endsWith(".xls")&&!lower.endsWith(".xlsx")&&!lower.endsWith(".csv"))throw new Error("Please select an .xls, .xlsx or .csv spreadsheet.");
  if(lower.endsWith(".csv")){const sheet=normalizeSheet(parseCsv(await file.text()),"CSV");return {...sheet,rowCount:sheet.rows.length}}
  const XLSX=await import("@e965/xlsx");const workbook=await readWorkbook(file);const available=workbook.SheetNames.filter(name=>Boolean(workbook.Sheets[name]));
  const chosen=selection?.mode==="all"?available:selection?.names?.length?selection.names:[available[0]];
  if(!chosen.length)throw new Error("No worksheet was found in this Excel workbook.");
  const sheets=chosen.map(name=>{if(!workbook.Sheets[name])throw new Error(`The “${name}” tab is no longer available.`);const parsed=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1,raw:false,defval:""}).map(row=>row.map(value=>String(value??"")));return {name,...normalizeSheet(parsed,name)}});
  if(sheets.length===1)return {headers:sheets[0].headers,rows:sheets[0].rows,rowCount:sheets[0].rows.length,headerRow:sheets[0].headerRow};
  const headers=["Source Tab",...Array.from(new Set(sheets.flatMap(sheet=>sheet.headers)))];
  const rows=sheets.flatMap(sheet=>sheet.rows.map(row=>{const values=new Map(sheet.headers.map((header,index)=>[header,row[index]||""]));return [sheet.name,...headers.slice(1).map(header=>values.get(header)||"")]}));
  return {headers,rows,rowCount:rows.length,headerRow:1};
}
