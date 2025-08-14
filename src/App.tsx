import React, { useEffect, useRef, useState } from 'react'

type Shot = {
  url: string; // objectURL for preview/download
  ts: number;  // timestamp
  mirrored: boolean;
  facingMode: 'user' | 'environment';
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [mirrored, setMirrored] = useState<boolean>(true); // default mirror for selfie
  const [grid, setGrid] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [shutterOn, setShutterOn] = useState<boolean>(false);
  const shutterRef = useRef<HTMLAudioElement | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);

  useEffect(() => {
    // Start camera
    startCamera(facingMode);
    return () => {
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Restart camera when facingMode changes
    (async () => {
      await startCamera(facingMode);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  async function startCamera(mode: 'user' | 'environment') {
    try {
      stopCamera();
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
        setIsReady(true);
        // Try applying zoom track constraint if supported
        const [track] = s.getVideoTracks();
        const caps = track.getCapabilities?.();
        if (caps && 'zoom' in caps && typeof caps.zoom === 'object') {
          // @ts-ignore
          const min = caps.zoom.min ?? 1;
          // @ts-ignore
          const max = caps.zoom.max ?? 1;
          // Adjust initial zoom to 1
          setZoom(1);
        } else {
          setZoom(1);
        }
      }
    } catch (e) {
      alert('カメラを開始できませんでした。ブラウザの権限設定をご確認ください。');
      console.error(e);
    }
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null);
    setIsReady(false);
  }

  async function takeShot() {
    const vid = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas) return;

    // Countdown if configured
    if (countdown > 0) {
      for (let i = countdown; i > 0; i--) {
        setCountdown(i);
        await new Promise(r => setTimeout(r, 1000));
      }
      setCountdown(0);
    }

    // Play shutter if enabled
    if (shutterOn && shutterRef.current) {
      try { shutterRef.current.currentTime = 0; shutterRef.current.play(); } catch {}
    }

    // Draw video to canvas
    const w = vid.videoWidth;
    const h = vid.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    if (mirrored && facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(vid, 0, 0, w, h);
    ctx.restore();

    // Convert to blob and create objectURL
    const blob: Blob = await new Promise((res) => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92)!);
    const url = URL.createObjectURL(blob);
    const shot: Shot = { url, ts: Date.now(), mirrored, facingMode };
    setShots(prev => [shot, ...prev].slice(0, 50)); // keep last 50 in memory
  }

  function toggleFacing() {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }

  function clearGallery() {
    setShots(prev => {
      prev.forEach(s => URL.revokeObjectURL(s.url));
      return [];
    });
  }

  async function applyZoom(val: number) {
    setZoom(val);
    if (!stream) return;
    const [track] = stream.getVideoTracks();
    const sup = track.getCapabilities && track.getCapabilities();
    if (sup && 'zoom' in sup) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: val }] as any });
      } catch(e) {
        console.warn('Zoom not applied', e);
      }
    }
  }

  return (
    <div className="container">
      <h1 className="text-2xl font-bold">キャラクター撮影アプリ（ブラッシュアップ版）</h1>
      <p className="opacity-80 text-sm mt-1">データは端末内メモリのみ（サーバー保存なし）。</p>

      <div className="video-wrap mt-4">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={mirrored && facingMode === 'user' ? 'mirrored' : ''}
        />
        {grid && (
          <div className="grid-overlay">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} />)}
          </div>
        )}
        {countdown > 0 && <div className="countdown">{countdown}</div>}
      </div>

      <div className="toolbar">
        <button className="btn" onClick={takeShot} disabled={!isReady}>撮影</button>
        <button className="btn" onClick={toggleFacing}>カメラ切替</button>
        <button className="btn" onClick={() => setMirrored(m => !m)}>
          自撮りミラー {mirrored ? 'ON' : 'OFF'}
        </button>

        <button className="btn" onClick={() => setGrid(g => !g)}>
          グリッド {grid ? 'ON' : 'OFF'}
        </button>
        <button className="btn" onClick={() => setShutterOn(s => !s)}>
          シャッター音 {shutterOn ? 'ON' : 'OFF'}
        </button>
        <button className="btn" onClick={clearGallery} disabled={shots.length === 0}>ギャラリー消去</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>ズーム</label>
        <input type="range" min={1} max={5} step={0.1} value={zoom} onChange={(e) => applyZoom(parseFloat(e.target.value))} style={{ width: '100%' }} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label>セルフタイマー（秒）</label>
        <input type="number" min={0} max={10} value={countdown} onChange={(e) => setCountdown(parseInt(e.target.value || '0'))} className="btn" style={{ width: 120, marginLeft: 8 }} />
      </div>

      <audio ref={shutterRef} preload="auto" src="data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA..."></audio>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <h2 className="text-xl font-semibold mt-6">サムネイル（端末内メモリ）</h2>
      <div className="gallery">
        {shots.map(s => (
          <a className="thumb" key={s.ts} href={s.url} download={`shot-${s.ts}.jpg`} target="_blank" rel="noopener">
            <img src={s.url} alt="shot" />
            <span className="badge">{new Date(s.ts).toLocaleTimeString()}</span>
          </a>
        ))}
        {shots.length === 0 && <p className="opacity-70">まだありません。撮影するとここに表示されます。</p>}
      </div>

      <footer style={{marginTop: 24, fontSize: 12, opacity: .7}}>
        iOSではブラウザ仕様上、強制的なシャッター音は不可。音量を上げると効果音が鳴ります。
      </footer>
    </div>
  )
}
