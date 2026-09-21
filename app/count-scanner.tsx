'use client';
import {useEffect,useRef,useState} from 'react';

// Camera scanner that stays open: every barcode that comes into view is reported once. The same code is ignored while
// it stays in front of the camera (or comes back within 1.5 s), so holding an item still does not count it twice.
export function CountScanner({active,onCode}:{active:boolean;onCode:(code:string)=>void}){
  const video=useRef<HTMLVideoElement>(null),callback=useRef(onCode),[error,setError]=useState('');
  callback.current=onCode;
  useEffect(()=>{
    if(!active)return;
    let cancelled=false,stream:MediaStream|undefined,controls:{stop:()=>void}|undefined;
    const last={code:'',at:0};
    setError('');
    (async()=>{
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('กล้องไม่พร้อม กรุณาเปิดเว็บใน Safari หรือ Chrome');
        const {BrowserMultiFormatReader}=await import('@zxing/browser');
        if(cancelled)return;
        stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
        if(cancelled){stream.getTracks().forEach(t=>t.stop());return}
        controls=await new BrowserMultiFormatReader().decodeFromStream(stream,video.current!,result=>{
          if(!result||cancelled)return;
          const code=result.getText(),time=Date.now();
          const repeat=code===last.code&&time-last.at<1500;
          last.code=code;last.at=time;
          if(!repeat)callback.current(code);
        });
        if(cancelled)controls.stop();
      }catch(e:any){if(!cancelled)setError(e?.name==='NotAllowedError'?'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์':(e?.message||'เปิดกล้องไม่สำเร็จ'))}
    })();
    return()=>{cancelled=true;controls?.stop();stream?.getTracks().forEach(t=>t.stop())};
  },[active]);
  if(!active)return null;
  return <div className="count-camera"><video ref={video} autoPlay muted playsInline/><div className="scanner-guide" aria-hidden="true"/>{error&&<p role="alert" className="notice">{error}</p>}</div>;
}
