'use client';
import {useEffect,useState} from 'react';
import {WifiOff} from 'lucide-react';

type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};

export default function MobileApp(){
  const [online,setOnline]=useState(true);

  useEffect(()=>{
    const root=document.documentElement;
    let install:InstallEvent|null=null;
    const standalone=window.matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;
    root.classList.toggle('show-install-control',!standalone);
    setOnline(navigator.onLine);

    const off=()=>setOnline(false);
    const on=()=>setOnline(true);
    const ready=(event:Event)=>{event.preventDefault();install=event as InstallEvent;root.classList.add('show-install-control')};
    const installed=()=>{install=null;root.classList.remove('show-install-control')};
    const requestInstall=async()=>{
      if(install){
        await install.prompt();
        const choice=await install.userChoice;
        install=null;
        if(choice.outcome==='accepted')root.classList.remove('show-install-control');
        return;
      }
      window.alert('iPhone / iPad: เปิดใน Safari แล้วแตะ แชร์ → เพิ่มไปยังหน้าจอโฮม\nAndroid: เปิดใน Chrome แล้วแตะเมนู ⋮ → ติดตั้งแอป');
    };

    window.addEventListener('offline',off);
    window.addEventListener('online',on);
    window.addEventListener('beforeinstallprompt',ready);
    window.addEventListener('appinstalled',installed);
    window.addEventListener('wingpro:install-app',requestInstall);
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
    return()=>{
      root.classList.remove('show-install-control');
      window.removeEventListener('offline',off);
      window.removeEventListener('online',on);
      window.removeEventListener('beforeinstallprompt',ready);
      window.removeEventListener('appinstalled',installed);
      window.removeEventListener('wingpro:install-app',requestInstall);
    };
  },[]);

  return !online?<div role="status" className="connection-banner"><WifiOff size={18}/>ไม่มีอินเทอร์เน็ต กรุณาเชื่อมต่อก่อนขายหรือบันทึกข้อมูล</div>:null;
}
