'use client';
import {useEffect,useRef} from 'react';
import {Download} from 'lucide-react';
import JsBarcode from 'jsbarcode';

// Draws one product's name above a scannable Code128 barcode (with its digits printed below), as a standalone
// canvas ready to save or lay out on a sheet. Code128 reads back the exact same digits/text either way, so one
// symbology covers both a real manufacturer barcode and our own auto-generated "wingpro-N" codes. Returns null
// for a blank code, or one JsBarcode can't encode.
function renderLabelCanvas(name:string,code:string):HTMLCanvasElement|null{
  const value=code.trim();
  if(!value)return null;
  const bars=document.createElement('canvas');
  try{JsBarcode(bars,value,{format:'CODE128',width:2,height:56,fontSize:15,margin:10,marginTop:2,displayValue:true});}
  catch{return null;}
  const pad=16,nameHeight=28,label=document.createElement('canvas');
  label.width=bars.width+pad*2;label.height=bars.height+pad*2+nameHeight;
  const ctx=label.getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,label.width,label.height);
  ctx.fillStyle='#161f2e';ctx.font='600 16px Arial, sans-serif';ctx.textAlign='center';
  ctx.fillText(name||'สินค้า',label.width/2,pad+18,label.width-pad*2);
  ctx.drawImage(bars,pad,pad+nameHeight);
  return label;
}

function triggerDownload(canvas:HTMLCanvasElement,filename:string){
  const link=document.createElement('a');
  link.download=filename;
  link.href=canvas.toDataURL('image/png');
  link.click();
}

// Shown on the product form: a live preview of the barcode/รหัสสินค้า field, with a button to save it as a PNG -
// useful for products (like our own auto-generated wingpro-N codes) that never had a physical barcode to begin
// with, so the shop can print one to stick on it. Hidden until there is a code to show.
export function BarcodeLabel({name,code}:{name:string;code:string}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!canvasRef.current||!code.trim())return;
    // JsBarcode pads all four sides equally by default; the top margin alone is trimmed down so the barcode sits
    // close under the product name above it instead of floating with a big gap.
    try{JsBarcode(canvasRef.current,code,{format:'CODE128',width:2,height:56,fontSize:15,margin:10,marginTop:2,displayValue:true});}
    catch{/* an empty canvas is a harmless no-op if the code can't be encoded */}
  },[code]);
  if(!code.trim())return null;
  return <div className="barcode-label">
    <div className="barcode-label-name">{name||'สินค้า'}</div>
    <canvas ref={canvasRef}/>
    <button type="button" className="secondary small barcode-download" onClick={()=>{const label=renderLabelCanvas(name,code);if(label)triggerDownload(label,`barcode-${code.trim()}.png`);}}><Download size={14}/>ดาวน์โหลดรูปบาร์โค้ด</button>
  </div>;
}

// A generous cap so a huge selection (the inventory can hold hundreds of products) never produces an
// unreasonably tall canvas or a multi-second freeze while every barcode renders.
const MAX_SHEET_LABELS=200;

// Bulk export from the inventory list's "เลือกแล้ว N รายการ" bar: every selected product's label laid out on one
// sheet (a browser blocks more than a couple of download clicks fired at once, so one combined image is the
// reliable way to get more than a handful of barcodes out at a time). Products with no usable barcode, and any
// past the cap, are left off and reported back as skipped so the caller can tell the user.
export function downloadBarcodeSheet(items:{name:string;barcode:string}[]):{printed:number;skipped:number}{
  const labels=items.slice(0,MAX_SHEET_LABELS).map(i=>renderLabelCanvas(i.name,i.barcode)).filter((c):c is HTMLCanvasElement=>!!c);
  if(!labels.length)return {printed:0,skipped:items.length};
  const cols=Math.min(3,labels.length),rows=Math.ceil(labels.length/cols);
  const cellW=Math.max(...labels.map(l=>l.width))+24,cellH=Math.max(...labels.map(l=>l.height))+24;
  const sheet=document.createElement('canvas');
  sheet.width=cellW*cols;sheet.height=cellH*rows;
  const ctx=sheet.getContext('2d');
  if(!ctx)return {printed:0,skipped:items.length};
  ctx.fillStyle='#fff';ctx.fillRect(0,0,sheet.width,sheet.height);
  labels.forEach((label,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    ctx.drawImage(label,col*cellW+(cellW-label.width)/2,row*cellH+(cellH-label.height)/2);
  });
  triggerDownload(sheet,`barcodes-${new Date().toISOString().slice(0,10)}.png`);
  return {printed:labels.length,skipped:items.length-labels.length};
}
