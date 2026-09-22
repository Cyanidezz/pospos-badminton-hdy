'use client';
import {useEffect,useRef} from 'react';
import {Download} from 'lucide-react';
import JsBarcode from 'jsbarcode';

// A printable barcode label for a product: its name above a scannable Code128 barcode, with a button to save it
// as a PNG. Code128 reads back the exact same digits/text either way, so one symbology covers both a real
// manufacturer barcode and our own auto-generated "wingpro-N" codes - useful when the product came with no
// physical barcode to scan and the shop wants to print one to stick on it.
export function BarcodeLabel({name,code}:{name:string;code:string}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!canvasRef.current||!code.trim())return;
    try{JsBarcode(canvasRef.current,code,{format:'CODE128',width:2,height:56,fontSize:15,margin:10,displayValue:true});}
    catch{/* an empty canvas is a harmless no-op if the code can't be encoded */}
  },[code]);
  if(!code.trim())return null;
  const download=()=>{
    const source=canvasRef.current;if(!source)return;
    // Redraw onto a fresh canvas with the product name printed above the barcode, so the saved image carries it.
    const pad=16,nameHeight=28,label=document.createElement('canvas');
    label.width=source.width+pad*2;label.height=source.height+pad*2+nameHeight;
    const ctx=label.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,label.width,label.height);
    ctx.fillStyle='#161f2e';ctx.font='600 16px Arial, sans-serif';ctx.textAlign='center';
    ctx.fillText(name||'สินค้า',label.width/2,pad+18,label.width-pad*2);
    ctx.drawImage(source,pad,pad+nameHeight);
    const link=document.createElement('a');
    link.download=`barcode-${code.trim()}.png`;
    link.href=label.toDataURL('image/png');
    link.click();
  };
  return <div className="barcode-label">
    <div className="barcode-label-name">{name||'สินค้า'}</div>
    <canvas ref={canvasRef}/>
    <button type="button" className="secondary small barcode-download" onClick={download}><Download size={14}/>ดาวน์โหลดรูปบาร์โค้ด</button>
  </div>;
}
