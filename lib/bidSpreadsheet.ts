import {strToU8,unzipSync,zipSync} from "fflate";

export type BidSheetColumn={header:string;value:(rowIndex:number)=>string|number};
export type ImportedBidRow={lineId:string;unitBid:string;comments:string};

const xmlEscape=(value:string|number)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const columnName=(index:number)=>{let value=index+1,result="";while(value){value--;result=String.fromCharCode(65+(value%26))+result;value=Math.floor(value/26)}return result};
const inlineCell=(reference:string,value:string|number,style:number)=>typeof value==="number"?`<c r="${reference}" s="${style}"><v>${value}</v></c>`:`<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;

function displayBidName(dealNumber:string,assignedFileName?:string){return(assignedFileName?.trim()||`${dealNumber}-Customer-Bid.xlsx`).replace(/\.xlsx$/i,"").replace(/[-_]+/g," ").replace(/\s+/g," ").trim()}
function createLotNotes(rowCount:number,columns:BidSheetColumn[]){const priority=/storage|capacity|size|condition|grade|health|test|status|notes?|comments?|description|type/i,candidates=columns.filter(column=>column.header!=="Qty"&&priority.test(column.header)),selected=(candidates.length?candidates:columns.filter(column=>column.header!=="Qty").slice(0,3)).slice(0,5),details=selected.map(column=>{const values=[...new Set(Array.from({length:rowCount},(_,index)=>String(column.value(index)||"").trim()).filter(Boolean))].slice(0,6);return values.length?`${column.header.toUpperCase()}: ${values.join(", ")}`:""}).filter(Boolean);return`LOT NOTES: ${details.join(" · ")||`${rowCount.toLocaleString()} bid lines; review item details below.`}`}

function safeTabName(raw:string,used:Set<string>){
  const forbidden="\\/:*?\"<>|";
  const cleaned=raw.split("").map(char=>forbidden.includes(char)?" ":char).join("").replace(/\s+/g," ").trim()||"Lot";
  const base=cleaned.slice(0,31);let name=base,suffix=2;
  while(used.has(name)){const ending=` ${suffix++}`;name=`${base.slice(0,31-ending.length)}${ending}`}
  used.add(name);return name;
}

async function downloadTabbedBidSpreadsheet(dealNumber:string,rowCount:number,columns:BidSheetColumn[],assignedFileName?:string){
  const XLSX=await import("@e965/xlsx");
  const source=columns.find(column=>column.header==="Source Tab");
  const qty=columns.find(column=>column.header==="Qty")||{header:"Qty",value:()=>1};
  const details=columns.filter(column=>column!==source&&column!==qty);
  const groups=new Map<string,number[]>();
  for(let index=0;index<rowCount;index++){const name=String(source?.value(index)||"Customer Bid").trim()||"Customer Bid";groups.set(name,[...(groups.get(name)||[]),index])}
  const workbook=XLSX.utils.book_new(),used=new Set<string>();
  const summaryRows:(string|number)[][]=[["Lot","Bid Lines","Quantity","Bid Subtotal"]];
  const summaryFormulas:string[]=[];
  for(const [rawName,indexes] of groups){
    const name=safeTabName(rawName,used),headers=["Line",...details.map(column=>column.header),"Bid Comments","Qty","Unit Bid","Total Bid"];
    const rows=indexes.map(index=>[index+1,...details.map(column=>column.value(index)),"",qty.value(index),"",""]);
    const sheet=XLSX.utils.aoa_to_sheet([headers,...rows,["LOT TOTAL"]]);
    const qtyColumn=columnName(headers.indexOf("Qty")),bidColumn=columnName(headers.indexOf("Unit Bid")),totalColumn=columnName(headers.indexOf("Total Bid"));
    indexes.forEach((_,offset)=>{const row=offset+2;sheet[`${totalColumn}${row}`]={t:"n",f:`IF(${bidColumn}${row}=\"\",\"\",${qtyColumn}${row}*${bidColumn}${row})`,z:"$#,##0.00"}});
    const totalRow=indexes.length+2;sheet[`A${totalRow}`]={t:"s",v:"LOT TOTAL"};sheet[`${qtyColumn}${totalRow}`]={t:"n",f:`SUM(${qtyColumn}2:${qtyColumn}${totalRow-1})`,z:"#,##0"};sheet[`${totalColumn}${totalRow}`]={t:"n",f:`SUM(${totalColumn}2:${totalColumn}${totalRow-1})`,z:"$#,##0.00"};
    sheet["!cols"]=headers.map(header=>({wch:header.includes("Comments")?28:Math.max(10,Math.min(24,header.length+3))}));sheet["!autofilter"]={ref:`A1:${totalColumn}${totalRow-1}`};sheet["!freeze"]={xSplit:0,ySplit:1,topLeftCell:"A2",activePane:"bottomLeft",state:"frozen"};
    XLSX.utils.book_append_sheet(workbook,sheet,name);summaryRows.push([rawName,indexes.length,indexes.reduce((sum,index)=>sum+Number(qty.value(index)||0),0),""]);summaryFormulas.push(`'${name.replace(/'/g,"''")}'!${totalColumn}${totalRow}`);
  }
  summaryRows.push(["GRAND TOTAL","","",""]);const summary=XLSX.utils.aoa_to_sheet(summaryRows);
  summaryFormulas.forEach((formula,index)=>{summary[`D${index+2}`]={t:"n",f:formula,z:"$#,##0.00"}});summary[`D${summaryRows.length}`]={t:"n",f:`SUM(D2:D${summaryRows.length-1})`,z:"$#,##0.00"};summary["!cols"]=[{wch:31},{wch:12},{wch:14},{wch:18}];
  XLSX.utils.book_append_sheet(workbook,summary,"Bid Summary");XLSX.writeFile(workbook,assignedFileName?.trim()||`${dealNumber}-Customer-Bid.xlsx`,{compression:true});
}

export function downloadBidSpreadsheet(dealNumber:string,rowCount:number,columns:BidSheetColumn[],assignedFileName?:string){
  if(columns.some(column=>column.header==="Source Tab")){void downloadTabbedBidSpreadsheet(dealNumber,rowCount,columns,assignedFileName);return}
  const qtyIndex=columns.findIndex(column=>column.header==="Qty");
  const qtyColumn=qtyIndex>=0?columns[qtyIndex]:{header:"Qty",value:()=>1};
  const detailColumns=columns.filter((_,index)=>index!==qtyIndex);
  const headers=["Line",...detailColumns.map(column=>column.header),"Bid Comments","Qty","Unit Bid","Total Bid"];
  const tableRows=Array.from({length:rowCount},(_,index)=>([
    index+1,
    ...detailColumns.map(column=>column.value(index)),
    "",
    qtyColumn.value(index),
    ""
  ]));
  const qtyHeaderIndex=headers.indexOf("Qty"),unitBidIndex=headers.indexOf("Unit Bid"),totalIndex=headers.indexOf("Total Bid");
  const totalColumn=columnName(totalIndex),title=displayBidName(dealNumber,assignedFileName),notes=createLotNotes(rowCount,columns);
  const titleXml=`<row r="1" ht="23" customHeight="1">${inlineCell("A1",title,7)}</row>`,notesXml=`<row r="2" ht="30" customHeight="1">${inlineCell("A2",notes,8)}</row>`;
  const headerXml=`<row r="3" ht="24" customHeight="1">${headers.map((value,index)=>inlineCell(`${columnName(index)}3`,value,1)).join("")}</row>`;
  const rowsXml=tableRows.map((row,rowIndex)=>{const excelRow=rowIndex+4,qtyCell=`${columnName(qtyHeaderIndex)}${excelRow}`,unitCell=`${columnName(unitBidIndex)}${excelRow}`,rowStyle=rowIndex%2===0?2:3,currencyStyle=rowIndex%2===0?4:9;return `<row r="${excelRow}">${row.map((value,index)=>inlineCell(`${columnName(index)}${excelRow}`,value,rowStyle)).join("")}<c r="${columnName(totalIndex)}${excelRow}" s="${currencyStyle}"><f>IF(${unitCell}="","",${qtyCell}*${unitCell})</f><v></v></c></row>`}).join("");
  const grandRow=rowCount+4,unitColumn=columnName(unitBidIndex),qtyColumnName=columnName(qtyHeaderIndex);
  const grandXml=`<row r="${grandRow}"><c r="${qtyColumnName}${grandRow}" s="5"><f>SUM(${qtyColumnName}4:${qtyColumnName}${rowCount+3})</f><v>0</v></c><c r="${unitColumn}${grandRow}" s="5" t="inlineStr"><is><t>GRAND TOTAL</t></is></c><c r="${totalColumn}${grandRow}" s="6"><f>SUM(${totalColumn}4:${totalColumn}${rowCount+3})</f><v>0</v></c></row>`;
  const worksheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${totalColumn}${grandRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${headers.map((header,index)=>`<col min="${index+1}" max="${index+1}" width="${header.includes("Comments")?30:header==="Line"?8:header.length>15?22:15}" customWidth="1"/>`).join("")}</cols><sheetData>${titleXml}${notesXml}${headerXml}${rowsXml}${grandXml}</sheetData><autoFilter ref="A3:${totalColumn}${rowCount+3}"/><mergeCells count="2"><mergeCell ref="A1:${totalColumn}1"/><mergeCell ref="A2:${totalColumn}2"/></mergeCells></worksheet>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCEAF4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123A59"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right"/></xf><xf numFmtId="164" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Customer Bid" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
  const files={"[Content_Types].xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),"_rels/.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),"xl/workbook.xml":strToU8(workbook),"xl/_rels/workbook.xml.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),"xl/styles.xml":strToU8(styles),"xl/worksheets/sheet1.xml":strToU8(worksheet)};
  const zipped=zipSync(files,{level:6});
  const link=document.createElement("a");
  const bytes=zipped.buffer.slice(zipped.byteOffset,zipped.byteOffset+zipped.byteLength) as ArrayBuffer;
  link.href=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  link.download=assignedFileName?.trim()||`${dealNumber}-Customer-Bid.xlsx`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}

function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i];if(quoted){if(char==='"'&&text[i+1]==='"'){cell+='"';i++}else if(char==='"')quoted=false;else cell+=char}else if(char==='"')quoted=true;else if(char===","){row.push(cell);cell=""}else if(char==="\n"){row.push(cell.replace(/\r$/,"").trim());rows.push(row);row=[];cell=""}else cell+=char}
  if(cell||row.length){row.push(cell.replace(/\r$/,"").trim());rows.push(row)}return rows;
}

function parseSpreadsheetXml(text:string){
  const document=new DOMParser().parseFromString(text,"application/xml");
  if(document.querySelector("parsererror"))throw new Error("This Excel file could not be read. Please use the spreadsheet downloaded from this deal.");
  return [...document.getElementsByTagNameNS("*","Row")].map(row=>{
    const result:string[]=[];let columnIndex=0;
    for(const cell of [...row.getElementsByTagNameNS("*","Cell")]){
      const explicitIndex=cell.getAttributeNS("urn:schemas-microsoft-com:office:spreadsheet","Index")||cell.getAttribute("ss:Index");
      if(explicitIndex)columnIndex=Math.max(0,Number(explicitIndex)-1);
      result[columnIndex]=cell.getElementsByTagNameNS("*","Data")[0]?.textContent?.trim()||"";
      columnIndex++;
    }
    return result;
  });
}

function columnIndex(reference:string){
  const letters=(reference.match(/^[A-Z]+/i)?.[0]||"").toUpperCase();
  let result=0;for(const letter of letters)result=(result*26)+(letter.charCodeAt(0)-64);return Math.max(0,result-1);
}

async function parseXlsx(file:File){
  let files:ReturnType<typeof unzipSync>;
  try{files=unzipSync(new Uint8Array(await file.arrayBuffer()))}catch{throw new Error("This .xlsx file could not be opened. Please use the spreadsheet downloaded from this deal.")}
  const decoder=new TextDecoder();
  const sharedXml=files["xl/sharedStrings.xml"]?decoder.decode(files["xl/sharedStrings.xml"]):"";
  const shared=sharedXml?[...new DOMParser().parseFromString(sharedXml,"application/xml").getElementsByTagNameNS("*","si")].map(item=>[...item.getElementsByTagNameNS("*","t")].map(text=>text.textContent||"").join("")):[];
  const sheetPaths=Object.keys(files).filter(path=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).sort();
  if(!sheetPaths.length)throw new Error("No worksheet was found in the uploaded Excel file.");
  return sheetPaths.flatMap(sheetPath=>{const document=new DOMParser().parseFromString(decoder.decode(files[sheetPath]),"application/xml");if(document.querySelector("parsererror"))throw new Error("The Excel worksheet could not be read.");return [...document.getElementsByTagNameNS("*","row")].map(row=>{
    const result:string[]=[];
    for(const cell of [...row.getElementsByTagNameNS("*","c")]){
      const index=columnIndex(cell.getAttribute("r")||"");
      const type=cell.getAttribute("t"),raw=cell.getElementsByTagNameNS("*","v")[0]?.textContent||"";
      result[index]=type==="s"?(shared[Number(raw)]||""):type==="inlineStr"?[...cell.getElementsByTagNameNS("*","t")].map(text=>text.textContent||"").join(""):raw;
    }
    return result;
  })});
}

export async function readBidSpreadsheet(file:File):Promise<ImportedBidRow[]>{
  if(file.size>10*1024*1024)throw new Error("The bid spreadsheet must be 10 MB or smaller.");
  const name=file.name.toLowerCase();
  if(!name.endsWith(".xls")&&!name.endsWith(".xlsx")&&!name.endsWith(".xml")&&!name.endsWith(".csv"))throw new Error("Please upload the completed Excel bid spreadsheet downloaded from this deal.");
  const rows=name.endsWith(".xlsx")?await parseXlsx(file):name.endsWith(".csv")?parseCsv(await file.text()):parseSpreadsheetXml(await file.text());let headers:string[]=[];let lineIndex=-1,bidIndex=-1,commentsIndex=-1;const imported:ImportedBidRow[]=[];
  for(const row of rows){if(row.some(cell=>cell==="Line"||cell==="PDD Line ID")){headers=row.map(value=>value.trim());lineIndex=headers.includes("Line")?headers.indexOf("Line"):headers.indexOf("PDD Line ID");bidIndex=headers.indexOf("Unit Bid");commentsIndex=headers.indexOf("Bid Comments");continue}if(lineIndex>=0&&bidIndex>=0&&row.some(Boolean))imported.push({lineId:(row[lineIndex]||"").trim(),unitBid:(row[bidIndex]||"").replace(/[$,]/g,"").trim(),comments:commentsIndex>=0?(row[commentsIndex]||"").trim():""})}
  if(!imported.length)throw new Error("No bid lines were found. Please use the spreadsheet downloaded from this deal.");return imported;
}
