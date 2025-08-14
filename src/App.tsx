import React, { useEffect, useRef, useState } from "react";

/** 画面オーバーレイ用の簡易フレーム（必要に応じて編集） */
const FrameOverlay: React.FC = () => (
  <div className="pointer-events-none absolute inset-0">
    <div className="absolute inset-3 rounded-3xl border-4 border-white/70 shadow-[0_0_30px_rgba(255,255,255,0.25)]" />
  </div>
);

type Facing = "user" | "environment";

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [ready, setReady] = useState(false);
  const [usingPlaceholder, setUsingPlaceholder] = useState(false);
  const [facing, setFacing] = useState<Facing>("user");
  const isMirror = facing === "user";

  // 撮影まわり
  const [countdown, setCountdown] = useState(0);
  const [aspect, setAspect] = useState<"3:4" | "1:1" | "16:9">("3:4");
  const [shots, setShots] = useState<{ url: string; ts: number }[]>([]);

  // ズーム（光学 or デジタル）
  const [hasOpticalZoom, setHasOpticalZoom] = useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomOptical, setZoomOptical] = useState(1);   // 光学ズーム値
  const [zoomDigital, setZoomDigital] = useState(1);   // デジタルズーム倍率（フォールバック）

  // タップAF/AE 対応状況（pointsOfInterestなど）
  const [hasPOI, setHasPOI] = useState(false);
  const [tapMarker, setTapMarker] = useState<{x:number;y:number;until:number}|null>(null);

  // デバッグ（簡易表示）
  const [capDebug, setCapDebug] = useState<{zoom?: any, poi?: boolean, focus?: any, exposure?: any}>({});

  /** 現在のVideoTrackを取得 */
  const getTrack = () => {
    const stream: MediaStream | undefined = (videoRef.current as any)?.srcObject;
    return stream?.getVideoTracks?.()[0];
  };

  /** 既存のカメラ停止 */
  const stopStream = () => {
    const stream: MediaStream | undefined = (videoRef.current as any)?.srcObject;
    stream?.getTracks?.().forEach(t => t.stop());
    if (videoRef.current) (videoRef.current as any).srcObject = null;
  };

  /** 能力を探ってUIと初期値をセット */
  const probeAndInit = async () => {
    const track = getTrack();
    const caps: any = track?.getCapabilities?.();

    const zoomCap = caps?.zoom;
    const poiCap = !!(caps && "pointsOfInterest" in caps);
    const focusCap = caps?.focusMode;
    const expoCap = caps?.exposureMode;

    setCapDebug({ zoom: zoomCap, poi: poiCap, focus: focusCap, exposure: expoCap });

    // ズーム
    if (zoomCap) {
      setHasOpticalZoom(true);
      setZoomMin(zoomCap.min ?? 1);
      setZoomMax(zoomCap.max ?? 1);
      setZoomOptical(1);
      try { await track?.applyConstraints({ advanced: [{ zoom: 1 }] as any }); } catch {}
    } else {
      setHasOpticalZoom(false);
      setZoomMin(1);
      setZoomMax(3); // デジタルズームのUI上限（必要なら変更）
      setZoomDigital(1);
    }

    // タップAF/AE（pointsOfInterestの有無）
    setHasPOI(poiCap || false);
  };

  /** カメラ起動（向きによって優先候補を変える） */
  const startStream = async (to: Facing) => {
    try {
      stopStream();
      setReady(false);
      setUsingPlaceholder(false);

      const candidates: MediaStreamConstraints[] =
        to === "environment"
          ? [
              { video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
              { video: { facingMode: "environment" }, audio: false },
              { video: true, audio: false },
            ]
          : [
              { video: { facingMode: { exact: "user" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
              { video: { facingMode: "user" }, audio: false },
              { video: true, audio: false },
            ];

      let stream: MediaStream | null = null;
      for (const c of candidates) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
        catch { /* 次へ */ }
      }
      if (!stream) throw new Error("no stream");

      if (videoRef.current) {
        (videoRef.current as any).srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);

      await probeAndInit();
    } catch {
      setUsingPlaceholder(true);
      setReady(true);
      setHasOpticalZoom(false);
      setZoomDigital(1);
      setHasPOI(false);
    }
  };

  useEffect(() => {
    startStream(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  /** ズーム変更（光学対応があればapplyConstraints、なければデジタル倍率） */
  const onZoomChange = async (val: number) => {
    if (hasOpticalZoom) {
      setZoomOptical(val);
      const track = getTrack();
      const caps: any = track?.getCapabilities?.();
      if (track && caps?.zoom) {
        try { await track.applyConstraints({ advanced: [{ zoom: val }] as any }); }
        catch (e) { console.warn("optical zoom not applied", e); }
      }
    } else {
      setZoomDigital(Math.max(1, Math.min(val, zoomMax)));
    }
  };

  /** プレビュー領域タップでAF/AE（対応端末のみベストエフォート） */
  const onVideoTap: React.MouseEventHandler<HTMLVideoElement> = async (e) => {
    const track = getTrack();
    const caps: any = track?.getCapabilities?.();
    if (!track || !caps) return;

    // 画面座標を0..1に正規化
    const rect = (e.currentTarget as HTMLVideoElement).getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    if (isMirror) x = 1 - x; // 自撮りはミラーに合わせる

    // 視覚マーカー（1.2秒）
    setTapMarker({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, until: Date.now() + 1200 });
    setTimeout(() => { setTapMarker(prev => (prev && Date.now() > prev.until ? null : prev)); }, 1300);

    try {
      const adv: any = [];

      // pointsOfInterest（対応端末でのみ有効）
      if ("pointsOfInterest" in caps) {
        adv.push({ pointsOfInterest: [{ x, y }] });
      }

      // フォーカスモード：single-shot/continuous等（対応端末のみ）
      if (caps.focusMode) {
        const fm = Array.isArray(caps.focusMode) ? caps.focusMode : [caps.focusMode];
        if (fm.includes("single-shot")) adv.push({ focusMode: "single-shot" });
        else if (fm.includes("continuous")) adv.push({ focusMode: "continuous" });
      }

      // 露出モード
      if (caps.exposureMode) {
        const em = Array.isArray(caps.exposureMode) ? caps.exposureMode : [caps.exposureMode];
        if (em.includes("continuous")) adv.push({ exposureMode: "continuous" });
      }

      if (adv.length > 0) {
        await track.applyConstraints({ advanced: adv });
      }
    } catch (err) {
      console.warn("AF/AE not applied", err);
    }
  };

  /** 撮影（プレビューと同じ拡大率で保存） */
  const capture = async () => {
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 400)); // 少し速めのカウント
    }
    setCountdown(0);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const [w, h] =
      aspect === "1:1" ? [900, 900] :
      aspect === "16:9" ? [1280, 720] : [900, 1200];

    canvas.width = w; canvas.height = h;

    if (!usingPlaceholder && videoRef.current && (videoRef.current as any).videoWidth) {
      const vw = (videoRef.current as any).videoWidth;
      const vh = (videoRef.current as any).videoHeight;

      const baseScale = Math.max(w / vw, h / vh);
      const totalScale = baseScale * (hasOpticalZoom ? 1 : zoomDigital);

      const dw = vw * totalScale;
      const dh = vh * totalScale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;

      if (isMirror) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current!, dx, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(videoRef.current!, dx, dy, dw, dh);
      }
    } else {
      // 権限なしダミー
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "white"; ctx.font = "bold 42px system-ui"; ctx.textAlign = "center";
      ctx.fillText("(Camera placeholder)", w/2, h/2);
    }

    // 簡易フレーム（Canvas側にも最低限描画）
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 16;
    ctx.strokeRect(14, 14, w - 28, h - 28);

    const dataUrl = canvas.toDataURL("image/png");
    setShots(prev => [{ url: dataUrl, ts: Date.now() }, ...prev].slice(0, 12));
  };

  // プレビュー側：デジタルズーム時は video を拡大（枠でトリミング）
  const videoTransform =
    (isMirror ? "scaleX(-1) " : "") +
    (!hasOpticalZoom ? `scale(${zoomDigital})` : "scale(1)");

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white p-4 sm:p-8">
      <div className="mx-auto max-w-5xl grid gap-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold">
            NFC×Web フォト（ズーム＆AF/AE） <span className="text-xs opacity-60">v-zoom-poi</span>
          </h1>
          <p className="text-slate-300 text-sm mt-1">
            光学ズーム非対応端末ではデジタル拡大に自動フォールバック。AF/AEは対応端末のみベストエフォート。
          </p>
        </header>

        {/* コントロール */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-white/10">
            <div className="text-sm uppercase tracking-wide text-slate-400 mb-1">ズーム</div>
            <div className="text-xs text-slate-400 mb-2">
              モード：{hasOpticalZoom ? "ハードウェア" : "デジタル（自動フォールバック）"}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={hasOpticalZoom ? zoomMin : 1}
                max={hasOpticalZoom ? zoomMax : 3}
                step="0.1"
                value={hasOpticalZoom ? zoomOptical : zoomDigital}
                onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                className="w-full"
              />
              <span className="text-sm tabular-nums">
                {(hasOpticalZoom ? zoomOptical : zoomDigital).toFixed(1)}x
              </span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-2xl p-4 border border-white/10">
            <div className="text-sm uppercase tracking-wide text-slate-400 mb-1">設定</div>
            <div className="flex flex-wrap gap-2">
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as any)}
                className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
              >
                <option value="3:4">3:4（スマホ向け）</option>
                <option value="1:1">1:1（SNS向け）</option>
                <option value="16:9">16:9（横長）</option>
              </select>
              <button
                className="rounded-xl px-3 py-2 bg-slate-700 hover:bg-slate-600"
                onClick={() => setFacing(p => p === "user" ? "environment" : "user")}
              >
                カメラ切替（今：{facing === "user" ? "自撮り" : "背面"}）
              </button>
              <button
                className="rounded-xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 font-semibold"
                onClick={capture}
              >
                撮影
              </button>
            </div>
          </div>
        </section>

        {/* プレビュー */}
        <section className="bg-slate-800/60 rounded-2xl p-3 sm:p-4 border border-white/10">
          <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect.replace(":", "/") }}>
            {!usingPlaceholder ? (
              <video
                ref={videoRef}
                playsInline
                muted
                onClick={hasPOI ? onVideoTap : undefined}
                className="absolute inset-0 h-full w-full object-cover will-change-transform"
                style={{ transform: videoTransform, transformOrigin: "center center", cursor: hasPOI ? "crosshair" : "default", touchAction: "manipulation" }}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-black/70 bg-gradient-to-br from-emerald-300 to-sky-300">
                (カメラ権限なしのためダミー表示)
              </div>
            )}

            {/* 枠フレーム */}
            <FrameOverlay />

            {/* タップ位置ガイド */}
            {tapMarker && Date.now() < tapMarker.until && (
              <div
                className="absolute pointer-events-none border-2 border-white rounded-full"
                style={{
                  left: `calc(${tapMarker.x * 100}% - 16px)`,
                  top:  `calc(${tapMarker.y * 100}% - 16px)`,
                  width: 32, height: 32, boxShadow: "0 0 10px rgba(0,0,0,.6)"
                }}
              />
            )}

            {/* カウントダウン */}
            {countdown > 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="bg-black/40 rounded-full w-24 h-24 grid place-items-center border border-white/30">
                  <div className="text-5xl font-black">{countdown}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* サムネイル */}
        {shots.length > 0 && (
          <section className="bg-slate-800/60 rounded-2xl p-4 border border-white/10">
            <h3 className="font-semibold mb-2">保存候補（直近12件）</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {shots.map(s => (
                <a key={s.ts} href={s.url} download={`shot_${s.ts}.png`} className="group block">
                  <img src={s.url} alt="shot" className="w-full h-40 object-cover rounded-xl border border-white/10 group-hover:opacity-90" />
                  <div className="text-xs text-slate-300 mt-1">タップで保存</div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ちょこっとデバッグ */}
        <section className="text-[11px] text-slate-400">
          <div>capabilities.zoom: {capDebug.zoom ? JSON.stringify(capDebug.zoom) : "なし"}</div>
          <div>pointsOfInterest: {String(capDebug.poi)}</div>
          <div>focusMode: {capDebug.focus ? JSON.stringify(capDebug.focus) : "なし"}</div>
          <div>exposureMode: {capDebug.exposure ? JSON.stringify(capDebug.exposure) : "なし"}</div>
        </section>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
