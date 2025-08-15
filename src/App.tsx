import React, { useEffect, useRef, useState } from "react";

const frames = [
  { id: "sparkle", name: "キラキラ", draw: (g:CanvasRenderingContext2D,w:number,h:number)=>{
      g.strokeStyle="rgba(255,255,255,0.85)"; g.lineWidth=18; g.strokeRect(16,16,w-32,h-32);
    }},
  { id: "ribbon", name: "リボン", draw: (g,w,h)=>{
      g.strokeStyle="rgba(244,114,182,0.9)"; g.lineWidth=24; g.strokeRect(20,20,w-40,h-40);
      g.fillStyle="rgba(244,114,182,1)"; const rw=260; g.fillRect((w-rw)/2,8,rw,56);
      g.fillStyle="#fff"; g.font="bold 28px system-ui"; g.textAlign="center"; g.fillText("With ❤️ from Oshi", w/2,45);
    }},
  { id: "neon", name: "ネオン", draw: (g,w,h)=>{
      g.strokeStyle="rgba(0,255,255,0.8)"; (g as any).shadowColor="rgba(0,255,255,0.6)";
      (g as any).shadowBlur=25; g.lineWidth=16; g.strokeRect(26,26,w-52,h-52); (g as any).shadowBlur=0;
      g.fillStyle="#fff"; g.font="bold 34px system-ui"; g.textAlign="center"; g.fillText("Oshi Camera", w/2,h-28);
    }},
];

export default function App(){
  const videoRef = useRef<HTMLVideoElement|null>(null);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const params = new URLSearchParams(location.search);
  const [ready,setReady]=useState(false);
  const [placeholder,setPlaceholder]=useState(false);
  const [frame,setFrame]=useState(params.get("frame")||frames[0].id);
  const [aspect,setAspect]=useState(params.get("aspect")||"3:4");
  const [shots,setShots]=useState<{url:string,ts:number}[]>([]);
  const [countdown,setCountdown]=useState(0);
  const [facing,setFacing]=useState<'user'|'environment'>('user');
  const isMirror = facing==='user';

  const stopStream=()=>{
    const v=videoRef.current as any; const st:MediaStream|undefined=v?.srcObject;
    st?.getTracks?.().forEach(t=>t.stop()); if(v) v.srcObject=null;
  };
  const startStream=async(to:'user'|'environment')=>{
    try{
      stopStream(); setReady(false); setPlaceholder(false);
      const wants = to==='environment'
        ? [{video:{facingMode:{exact:'environment'}},audio:false},
           {video:{facingMode:'environment'},audio:false},
           {video:true,audio:false}]
        : [{video:{facingMode:{exact:'user'}},audio:false},
           {video:{facingMode:'user'},audio:false},
           {video:true,audio:false}];
      let stream:MediaStream|null=null;
      for(const c of wants){ try{ stream=await navigator.mediaDevices.getUserMedia(c as any); break; }catch{} }
      if(!stream) throw new Error('no stream');
      if(videoRef.current){ (videoRef.current as any).srcObject=stream; await videoRef.current.play(); }
      setReady(true);
    }catch{ setPlaceholder(true); setReady(true); }
  };
  useEffect(()=>{ startStream(facing); return ()=>stopStream(); },[facing]);

  const capture=async()=>{
    for(let i=3;i>=1;i--){ setCountdown(i); await new Promise(r=>setTimeout(r,400)); }
    setCountdown(0);
    const c=canvasRef.current!, g=c.getContext('2d')!;
    const [w,h]=aspect==="1:1"?[900,900]:aspect==="16:9"?[1280,720]:[900,1200]; c.width=w; c.height=h;

    if(!placeholder && videoRef.current && (videoRef.current as any).videoWidth){
      const vw=(videoRef.current as any).videoWidth, vh=(videoRef.current as any).videoHeight;
      const s=Math.max(w/vw,h/vh), dw=vw*s, dh=vh*s, dx=(w-dw)/2, dy=(h-dh)/2;
      if(isMirror){ g.save(); g.translate(w,0); g.scale(-1,1); g.drawImage(videoRef.current!, w-dx-dw, dy, dw, dh); g.restore(); }
      else{ g.drawImage(videoRef.current!, dx, dy, dw, dh); }
    }else{
      const grad=g.createLinearGradient(0,0,w,h); grad.addColorStop(0,"#6ee7b7"); grad.addColorStop(1,"#93c5fd");
      g.fillStyle=grad; g.fillRect(0,0,w,h); g.fillStyle="rgba(255,255,255,0.9)"; g.font="bold 42px system-ui"; g.textAlign="center";
      g.fillText("(no camera permission)", w/2, h/2);
    }

    (frames.find(f=>f.id===frame)!.draw)(g,w,h);
    const url=c.toDataURL("image/png");
    setShots(p=>[{url,ts:Date.now()},...p].slice(0,12));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold">NFC×Web その場でフォトフレーム</h1>

        <div className="flex flex-wrap items-center gap-3">
          <select value={frame} onChange={e=>setFrame(e.target.value)} className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2">
            {frames.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={aspect} onChange={e=>setAspect(e.target.value)} className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2">
            <option value="3:4">3:4</option><option value="1:1">1:1</option><option value="16:9">16:9</option>
          </select>
          <button onClick={()=>setFacing(p=>p==='user'?'environment':'user')} className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600">
            カメラ切替（今：{facing==='user'?'自撮り':'背面'}）
          </button>
          <button onClick={capture} className="rounded-2xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 font-semibold shadow">
            撮影する
          </button>
          <span className="text-slate-300 text-sm">{placeholder ? "※ダミー表示" : ready ? "カメラ準備OK" : "準備中…"}</span>
        </div>

        <div className="relative w-full overflow-hidden rounded-3xl bg-black" style={{aspectRatio:(aspect as any).replace(":","/")}}>
          {!placeholder
            ? <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover"
                     style={{transform:isMirror?'scaleX(-1)':'none'}} />
            : <div className="absolute inset-0 grid place-items-center text-black/70 font-semibold bg-gradient-to-br from-emerald-300 to-sky-300">
                (no camera)
              </div>
          }
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {countdown>0 && (
          <div className="fixed inset-0 grid place-items-center pointer-events-none">
            <div className="bg-black/50 rounded-full w-28 h-28 grid place-items-center border border-white/40">
              <div className="text-5xl font-black">{countdown}</div>
            </div>
          </div>
        )}

        {shots.length>0 && (
          <div>
            <h3 className="font-semibold mb-2">保存候補</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {shots.map((s,i)=>(
                <a key={s.ts+i} href={s.url} download={`oshi_photo_${s.ts}.png`} className="group block">
                  <img src={s.url} className="w-full h-40 object-cover rounded-xl border border-white/10 group-hover:opacity-90" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
