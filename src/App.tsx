import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const frames = [
  {
    id: "sparkle",
    name: "キラキラ・フレーム",
    render: () => (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-3 left-3 h-16 w-16 rounded-full blur-md opacity-70" style={{background:"radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)"}}/>
        <div className="absolute top-3 right-3 h-16 w-16 rounded-full blur-md opacity-70" style={{background:"radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)"}}/>
        <div className="absolute bottom-3 left-3 h-16 w-16 rounded-full blur-md opacity-70" style={{background:"radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)"}}/>
        <div className="absolute bottom-3 right-3 h-16 w-16 rounded-full blur-md opacity-70" style={{background:"radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)"}}/>
        <div className="absolute inset-2 rounded-2xl border-[6px] border-white/70 shadow-[0_0_40px_rgba(255,255,255,0.35)]" />
      </div>
    )
  },
  {
    id: "ribbon",
    name: "リボン・フレーム",
    render: () => (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-3 rounded-3xl border-8 border-pink-300/80" />
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-pink-400 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          With ❤️ from Oshi
        </div>
        <div className="absolute bottom-6 right-6 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-sm font-semibold">
          #Today
        </div>
      </div>
    )
  },
  {
    id: "neon",
    name: "ネオン・フレーム",
    render: () => (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-4 rounded-2xl" style={{boxShadow:"0 0 12px rgba(0,255,255,0.8), inset 0 0 24px rgba(0,255,255,0.35)"}} />
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-xl font-bold text-white" style={{background:"linear-gradient(90deg, rgba(0,255,255,0.5), rgba(255,0,255,0.5))", textShadow:"0 2px 8px rgba(0,0,0,0.6)"}}>
          Oshi Camera
        </div>
      </div>
    )
  }
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const params = new URLSearchParams(location.search);

  const initialFrame = params.get("frame") || frames[0].id;
  const initialAspect = params.get("aspect") || "3:4";

  const [ready, setReady] = useState(false);
  const [usingPlaceholder, setUsingPlaceholder] = useState(false);
  const [activeFrame, setActiveFrame] = useState(initialFrame);
  const [snapshots, setSnapshots] = useState<{url:string,ts:number}[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [aspect, setAspect] = useState(initialAspect);

  // 前後カメラ
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const isMirror = facing === 'user';

  // === ズーム：ハードウェア対応可否 & 値 ===
  const [hasOpticalZoom, setHasOpticalZoom] = useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoom, setZoom] = useState(1);

  // デジタルズーム（フォールバック用）
  const [digitalZoom, setDigitalZoom] = useState(1);

  // デバッグ補助表示
  const [debug, setDebug] = useState<{capZoom?: any}>({});

  const getTrack = () => {
    const v = videoRef.current as any;
    const stream: MediaStream | undefined = v?.srcObject;
    return stream?.getVideoTracks?.()[0];
  };

  const stopStream = () => {
    const v = videoRef.current as any;
    const stream: MediaStream | undefined = v?.srcObject;
    stream?.getTracks?.().forEach(t => t.stop());
    if (v) v.srcObject = null;
  };

  const probeCapabilities = () => {
    const track = getTrack();
    const caps: any = track?.getCapabilities?.();
    setDebug({ capZoom: caps?.zoom });

    if (caps && caps.zoom) {
      setHasOpticalZoom(true);
      setZoomMin(caps.zoom.min ?? 1);
      setZoomMax(caps.zoom.max ?? 1);
      setZoom(1);
    } else {
      setHasOpticalZoom(false);
      setZoomMin(1);
      setZoomMax(1);
      setZoom(1);
    }
  };

  const startStream = async (to: 'user' | 'environment') => {
    try {
      stopStream();
      setReady(false);
      setUsingPlaceholder(false);

      const candidates: MediaStreamConstraints[] =
        to === 'environment'
          ? [
              { video: { facingMode: { exact: 'environment' } }, audio: false },
              { video: { facingMode: 'environment' }, audio: false },
              { video: true, audio: false },
            ]
          : [
              { video: { facingMode: { exact: 'user' } }, audio: false },
              { video: { facingMode: 'user' }, audio: false },
              { video: true, audio: false },
            ];

      let stream: MediaStream | null = null;
      for (const c of candidates) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
        catch { /* next */ }
      }
      if (!stream) throw new Error("no stream");

      if (videoRef.current) {
        (videoRef.current as any).srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);

      // 能力確認
      probeCapabilities();

      // 初期値
      setDigitalZoom(1);
      if (hasOpticalZoom) {
        try { await getTrack()?.applyConstraints({ advanced: [{ zoom: 1 }] as any }); } catch {}
      }
    } catch {
      setUsingPlaceholder(true);
      setReady(true);
      setHasOpticalZoom(false);
      setDigitalZoom(1);
    }
  };

  useEffect(() => {
    startStream(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // ズーム変更：対応あればハードウェア、なければデジタル
  const onZoomChange = async (val: number) => {
    if (hasOpticalZoom) {
      setZoom(val);
      const track = getTrack();
      const caps: any = track?.getCapabilities?.();
      if (track && caps?.zoom) {
        try { await track.applyConstraints({ advanced: [{ zoom: val }] as any }); }
        catch (e) { console.warn("optical zoom not applied", e); }
      }
    } else {
      setDigitalZoom(val);
    }
  };

  const doCapture = async () => {
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 500));
    }
    setCountdown(0);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const [w, h] = aspect === "1:1" ? [900, 900] : aspect === "16:9" ? [1280, 720] : [900, 1200];
    canvas.width = w;
    canvas.height = h;

    if (!usingPlaceholder && videoRef.current && (videoRef.current as any).videoWidth) {
      const vw = (videoRef.current as any).videoWidth;
      const vh = (videoRef.current as any).videoHeight;

      // ベースのフィット倍率（cover）
      const baseScale = Math.max(w / vw, h / vh);
      // デジタルズーム時はさらに倍率を乗算
      const totalScale = baseScale * (hasOpticalZoom ? 1 : digitalZoom);

      const dw = vw * totalScale;
      const dh = vh * totalScale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;

      if (isMirror) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current!, w - dx - dw, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(videoRef.current!, dx, dy, dw, dh);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#6ee7b7");
      grad.addColorStop(1, "#93c5fd");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 48px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("(Camera preview placeholder)", w / 2, h / 2);
    }

    // フレーム描画
    switch (activeFrame) {
      case "sparkle": {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 18;
        ctx.strokeRect(16, 16, w - 32, h - 32);
        break;
      }
      case "ribbon": {
        ctx.strokeStyle = "rgba(244,114,182,0.9)";
        ctx.lineWidth = 24;
        ctx.strokeRect(20, 20, w - 40, h - 40);
        ctx.fillStyle = "rgba(244,114,182,1)";
        const rw = 260;
        ctx.fillRect((w - rw) / 2, 8, rw, 56);
        ctx.fillStyle = "white";
        ctx.font = "bold 28px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("With ❤️ from Oshi", w / 2, 45);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "600 26px system-ui";
        ctx.fillText("#Today", w - 120, h - 40);
        break;
      }
      case "neon": {
        ctx.strokeStyle = "rgba(0,255,255,0.8)";
        (ctx as any).shadowColor = "rgba(0,255,255,0.6)";
        (ctx as any).shadowBlur = 25;
        ctx.lineWidth = 16;
        ctx.strokeRect(26, 26, w - 52, h - 52);
        (ctx as any).shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = "bold 38px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Oshi Camera", w / 2, h - 32);
        break;
      }
    }

    const dataUrl = canvas.toDataURL("image/png");
    setSnapshots((prev) => [{ url: dataUrl, ts: Date.now() }, ...prev].slice(0, 12));
  };

  const FrameOverlay = (frames.find((f) => f.id === activeFrame) as any)?.render;

  // プレビュー側の表示：デジタルズーム時だけvideoを拡大
  const videoTransform =
    (isMirror ? "scaleX(-1) " : "") +
    (!hasOpticalZoom ? `scale(${digitalZoom})` : "scale(1)");

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white p-4 sm:p-8">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <motion.div
          className="lg:col-span-1 bg-slate-800/60 rounded-2xl p-5 sm:p-6 shadow-xl border border-white/10"
          initial={{opacity:0, y:12}} animate={{opacity:1, y:0}}
        >
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">NFC×Web その場でフォトフレーム</h1>
          <p className="text-slate-300 mb-4">カメラ撮影→フレーム合成→保存まで行う体験のサンプルです。</p>

          <div className="space-y-3">
            <Section title="ズーム">
              <div className="text-xs text-slate-400 mb-1">
                モード：{hasOpticalZoom ? "ハードウェアズーム" : "デジタルズーム（端末非対応のため代替）"}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={hasOpticalZoom ? zoomMin : 1}
                  max={hasOpticalZoom ? zoomMax : 3}
                  step="0.1"
                  value={hasOpticalZoom ? zoom : digitalZoom}
                  onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm tabular-nums">
                  {(hasOpticalZoom ? zoom : digitalZoom).toFixed(1)}x
                </span>
              </div>
            </Section>

            <Section title="体験フロー">
              <ol className="list-decimal ml-6 space-y-1 text-slate-200">
                <li>カメラ許可 → プレビュー表示</li>
                <li>フレーム選択・ズーム調整</li>
                <li>撮影（カウントダウン対応）</li>
                <li>端末へ保存 or SNS共有</li>
              </ol>
            </Section>

            {/* 任意の小さなデバッグ */}
            <div className="text-[11px] text-slate-400">
              <div>capabilities.zoom: {debug.capZoom ? JSON.stringify(debug.capZoom) : "なし"}</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="lg:col-span-2 bg-slate-800/60 rounded-2xl p-4 sm:p-6 shadow-xl border border-white/10"
          initial={{opacity:0, y:12}} animate={{opacity:1, y:0}}
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={activeFrame}
              onChange={(e) => setActiveFrame(e.target.value)}
              className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
            >
              {frames.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
            >
              <option value="3:4">3:4（スマホ向け）</option>
              <option value="1:1">1:1（SNS向け）</option>
              <option value="16:9">16:9（横長）</option>
            </select>

            <button
              onClick={() => setFacing(prev => prev === 'user' ? 'environment' : 'user')}
              className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600"
              title="フロント/背面を切り替え"
            >
              カメラ切替（今：{facing === 'user' ? '自撮り' : '背面'}）
            </button>

            <button onClick={doCapture} className="rounded-2xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 font-semibold shadow">
              撮影する
            </button>
            <span className="text-slate-300 text-sm">{usingPlaceholder ? "※プレビューはダミー背景です" : ready ? "カメラ準備OK" : "準備中…"}</span>
          </div>

          {/* プレビュー。デジタルズーム時はvideoを拡大、枠でトリミング */}
          <div
            className="relative w-full overflow-hidden rounded-3xl bg-black"
            style={{aspectRatio: (aspect as any).replace(":", "/")}}
          >
            {!usingPlaceholder ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: videoTransform, transformOrigin: "center center" }}
              />
            ) : (
              <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-emerald-300 to-sky-300 grid place-items-center">
                <div className="text-black/70 font-semibold text-lg">(カメラ権限なしのためダミー表示)</div>
              </div>
            )}

            <div className="absolute inset-0">
              {FrameOverlay && <FrameOverlay />}
            </div>

            {countdown > 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <motion.div
                  key={countdown}
                  initial={{scale:0.6, opacity:0}}
                  animate={{scale:1.2, opacity:1}}
                  className="bg-black/40 rounded-full w-28 h-28 grid place-items-center border border-white/30"
                >
                  <div className="text-5xl font-black">{countdown}</div>
                </motion.div>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {snapshots.length > 0 && (
            <div className="mt-5">
              <h3 className="font-semibold mb-2">保存候補（直近12件）</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {snapshots.map((s, i) => (
                  <a key={s.ts + i} href={s.url} download={`oshi_photo_${s.ts}.png`} className="group block">
                    <img src={s.url} alt="snapshot" className="w-full h-40 object-cover rounded-xl border border-white/10 group-hover:opacity-90" />
                    <div className="text-xs text-slate-300 mt-1">tapで保存</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Section({title, children}:{title:string, children:React.ReactNode}){
  return (
    <div>
      <div className="text-sm uppercase tracking-wide text-slate-400 mb-1">{title}</div>
      <div className="bg-slate-900/40 rounded-xl p-3 border border-white/5">{children}</div>
    </div>
  );
}
