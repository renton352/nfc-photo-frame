import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

type Snapshot = { url: string; ts: number; blob?: Blob };

const frames = [
  { id: "sparkle", name: "キラキラ・フレーム" },
  { id: "ribbon",  name: "リボン・フレーム"   },
  { id: "neon",    name: "ネオン・フレーム"   },
];

const SETTINGS_KEY = "oshi.camera.settings.v1";
// それぞれ /assets 配下のMP3/WAV（Viteがビルド時に解決）
const VOICE_PRE_URL   = new URL("./assets/voice_pre.mp3",   import.meta.url).href;
const VOICE_POST_URL  = new URL("./assets/voice_post.mp3",  import.meta.url).href;
// シャッター音には既存の fallback 音源を使います
const VOICE_FALLBACK  = new URL("./assets/voice_shutter.mp3", import.meta.url).href;

// ★ 追加：PNGフレームのマッピング（src/assets/frames/）
const FRAME_SRC: Record<string, Record<"3:4"|"1:1"|"16:9", string>> = {
  sparkle: {
    "3:4":  new URL("./assets/frames/sparkle_3x4.png",  import.meta.url).href,
    "1:1":  new URL("./assets/frames/sparkle_1x1.png",  import.meta.url).href,
    "16:9": new URL("./assets/frames/sparkle_16x9.png", import.meta.url).href,
  },
  ribbon: {
    "3:4":  new URL("./assets/frames/ribbon_3x4.png",   import.meta.url).href,
    "1:1":  new URL("./assets/frames/ribbon_1x1.png",   import.meta.url).href,
    "16:9": new URL("./assets/frames/ribbon_16x9.png",  import.meta.url).href,
  },
  neon: {
    "3:4":  new URL("./assets/frames/neon_3x4.png",     import.meta.url).href,
    "1:1":  new URL("./assets/frames/neon_1x1.png",     import.meta.url).href,
    "16:9": new URL("./assets/frames/neon_16x9.png",    import.meta.url).href,
  },
};
const getOverlaySrc = (frameId: string, aspect: "3:4"|"1:1"|"16:9") =>
  FRAME_SRC[frameId]?.[aspect];

type Settings = {
  activeFrame: string;
  aspect: "3:4" | "1:1" | "16:9";
  facing: "user" | "environment";
  guideOn: boolean;
  shutterSoundOn: boolean;
  timerSec: 0 | 3 | 5;
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const voicePreRef = useRef<HTMLAudioElement | null>(null);
  const voicePostRef = useRef<HTMLAudioElement | null>(null);
  const voiceShutterRef = useRef<HTMLAudioElement | null>(null); // シャッターSFX
  const params = useMemo(() => new URLSearchParams(location.search), []);

  // URLパラメータ or 保存値 or 既定
  const saved: Partial<Settings> = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
    catch { return {}; }
  }, []);

  const initialFrame = (params.get("frame") || saved.activeFrame || frames[0].id) as string;
  const initialAspect = (params.get("aspect") || saved.aspect || "3:4") as Settings["aspect"];
  const initialFacing = (saved.facing || "user") as Settings["facing"];
  const initialTimer = (Number(params.get("timer")) || saved.timerSec || 3) as Settings["timerSec"];

  const [ready, setReady] = useState(false);
  const [usingPlaceholder, setUsingPlaceholder] = useState(false);
  const [activeFrame, setActiveFrame] = useState(initialFrame);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [aspect, setAspect] = useState<Settings["aspect"]>(initialAspect);
  const [facing, setFacing] = useState<Settings["facing"]>(initialFacing);
  const [guideOn, setGuideOn] = useState<boolean>(saved.guideOn ?? false);
  const [shutterSoundOn, setShutterSoundOn] = useState<boolean>(saved.shutterSoundOn ?? true);
  const [timerSec, setTimerSec] = useState<Settings["timerSec"]>(initialTimer);
  const [flashOn, setFlashOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const isMirror = facing === "user";

  // ---- 保存 ----
  useEffect(() => {
    const s: Settings = { activeFrame, aspect, facing, guideOn, shutterSoundOn, timerSec };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }, [activeFrame, aspect, facing, guideOn, shutterSoundOn, timerSec]);

  // ---- カメラ制御 ----
  const stopStream = () => {
    const v = videoRef.current as any;
    const stream: MediaStream | undefined = v?.srcObject;
    stream?.getTracks?.().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  };

  const startStream = async (to: "user" | "environment") => {
    try {
      stopStream();
      setReady(false);
      setUsingPlaceholder(false);

      const candidates: MediaStreamConstraints[] =
        to === "environment"
          ? [
              { video: { facingMode: { exact: "environment" } }, audio: false },
              { video: { facingMode: "environment" }, audio: false },
              { video: true, audio: false },
            ]
          : [
              { video: { facingMode: { exact: "user" } }, audio: false },
              { video: { facingMode: "user" }, audio: false },
              { video: true, audio: false },
            ];

      let stream: MediaStream | null = null;
      for (const c of candidates) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
        catch {}
      }
      if (!stream) throw new Error("no stream");

      if (videoRef.current) {
        (videoRef.current as any).srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);

      const track = stream.getVideoTracks?.()[0];
      const caps = (track?.getCapabilities?.() as any) || {};
      if (caps && "torch" in caps) setTorchSupported(true);
    } catch {
      setUsingPlaceholder(true);
      setReady(true);
    }
  };

  useEffect(() => {
    startStream(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const applyTorch = async (on: boolean) => {
    try {
      const stream: MediaStream | undefined = (videoRef.current as any)?.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      const caps = (track?.getCapabilities?.() as any) || {};
      if (!track || !("torch" in caps)) return;
      await track.applyConstraints({ advanced: [{ torch: on }] as any });
      setTorchOn(on);
    } catch {}
  };

  // ====== 再生ヘルパー群 ======
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ユーザー操作直後に“無音ワンプレイ”して解錠（iOS対策）
  const primeAudio = async (el: HTMLAudioElement | null) => {
    if (!el) return;
    try {
      el.muted = true;
      el.currentTime = 0;
      await el.play();
      await sleep(50);
      el.pause();
      el.currentTime = 0;
    } catch {} finally {
      el.muted = false;
    }
  };

  /**
   * 音声再生（必要なら終了まで/または上限msまで待つ）
   * - waitEnd: true なら ended まで待機
   * - maxWaitMs: 上限ミリ秒（超えたら一旦停止して次へ進む）
   */
  const playVoice = async (
    el: HTMLAudioElement | null,
    opts: { waitEnd?: boolean; maxWaitMs?: number } = {}
  ) => {
    if (!el) return false;

    try { el.pause(); } catch {}
    el.currentTime = 0;
    el.volume = 1.0;

    const NO_SOURCE = 3 as number;
    if ((el as any).error || el.networkState === NO_SOURCE) {
      try { el.src = VOICE_FALLBACK; el.load(); } catch {}
    }

    if (!Number.isFinite(el.duration) || el.duration <= 0) {
      await new Promise<void>((res) => {
        let done = false;
        const finish = () => { if (!done) { done = true; res(); } };
        el.addEventListener("loadedmetadata", finish, { once: true });
        el.addEventListener("canplaythrough", finish, { once: true });
        setTimeout(finish, 700);
      });
    }

    try {
      await el.play();

      if (opts.waitEnd) {
        const remainMs = Number.isFinite(el.duration)
          ? Math.max(0, (el.duration - el.currentTime) * 1000)
          : 900;

        const waitMs = opts.maxWaitMs
          ? Math.min(remainMs + 120, opts.maxWaitMs)
          : (remainMs + 120);

        let ended = false;
        const endedP = new Promise<void>((res) =>
          el.addEventListener("ended", () => { ended = true; res(); }, { once: true })
        );

        await Promise.race([endedP, sleep(waitMs)]);

        if (!ended && opts.maxWaitMs) {
          try { el.pause(); } catch {}
        }
      }
      return true;
    } catch {
      try {
        if (el.src !== VOICE_FALLBACK) {
          el.src = VOICE_FALLBACK; el.load(); await el.play();

          if (opts.waitEnd) {
            const ms = Number.isFinite(el.duration)
              ? Math.max(0, (el.duration - el.currentTime) * 1000) + 120
              : 900;
            const waitMs = opts.maxWaitMs ? Math.min(ms, opts.maxWaitMs) : ms;

            let ended = false;
            const endedP = new Promise<void>((res) =>
              el.addEventListener("ended", () => { ended = true; res(); }, { once: true })
            );
            await Promise.race([endedP, sleep(waitMs)]);
            if (!ended && opts.maxWaitMs) { try { el.pause(); } catch {} }
          }
          return true;
        }
      } catch {}

      // 最後の手段：短いビープ
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        if (ctx.state !== "running") await ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square"; o.frequency.value = 1100;
        g.gain.value = 0.12; o.connect(g); g.connect(ctx.destination);
        o.start();
        const BEEP_MS = 180;
        const limit = opts.maxWaitMs ?? BEEP_MS;
        await sleep(Math.min(BEEP_MS, limit));
        setTimeout(() => { o.stop(); ctx.close(); }, BEEP_MS);
      } catch {}
      return false;
    }
  };

  // キャンバスへ描画＆保存
  const drawAndSave = async (): Promise<Snapshot> => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const [w, h] = aspect === "1:1" ? [900, 900] : aspect === "16:9" ? [1280, 720] : [900, 1200];
    canvas.width = w; canvas.height = h;

    if (!usingPlaceholder && videoRef.current && (videoRef.current as any).videoWidth) {
      const vw = (videoRef.current as any).videoWidth;
      const vh = (videoRef.current as any).videoHeight;
      const scale = Math.max(w / vw, h / vh);
      const dw = vw * scale; const dh = vh * scale;
      const dx = (w - dw) / 2; const dy = (h - dh) / 2;

      if (isMirror) {
        ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current!, w - dx - dw, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(videoRef.current!, dx, dy, dw, dh);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#6ee7b7"); grad.addColorStop(1, "#93c5fd");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 48px system-ui"; ctx.textAlign = "center";
      ctx.fillText("(Camera preview placeholder)", w / 2, h / 2);
    }

    // ★ 置き換え：Canvas に PNG フレームを合成
    try {
      const src = getOverlaySrc(activeFrame, aspect);
      if (src) {
        const overlay = new Image();
        overlay.src = src;
        await new Promise<void>((ok) => {
          overlay.onload = () => ok();
          overlay.onerror = () => ok(); // 無くても続行
        });
        ctx.drawImage(overlay, 0, 0, w, h);
      }
    } catch {}

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/png")
    );
    const url = URL.createObjectURL(blob);
    const shot: Snapshot = { url, ts: Date.now(), blob };
    setSnapshots((prev) => [shot, ...prev].slice(0, 12));
    return shot;
  };

  // —— シーケンス —— 前セリフ → カウントダウン → フラッシュ＆保存(＋同時シャッター音) → 後セリフ
  const doCapture = async () => {
    await primeAudio(voiceShutterRef.current);
    await primeAudio(voicePostRef.current);

    await playVoice(voicePreRef.current, { waitEnd: true, maxWaitMs: 30000 });

    if (timerSec > 0) {
      for (let i = timerSec; i >= 1; i--) {
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(0);
    }

    setFlashOn(true);
    const shutterP = playVoice(voiceShutterRef.current, { waitEnd: true, maxWaitMs: 1200 });
    setTimeout(() => setFlashOn(false), 350);
    await drawAndSave();

    try { await shutterP; } catch {}
    await playVoice(voicePostRef.current);
  };

  const shareLast = async () => {
    const shot = snapshots[0];
    if (!shot?.blob) return;
    try {
      const file = new File([shot.blob], `oshi_${shot.ts}.png`, { type: "image/png" });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({
          files: [file],
          title: "Oshi Camera",
          text: "その場でフォトフレーム📸",
        });
      } else {
        const a = document.createElement("a");
        a.href = shot.url; a.download = `oshi_${shot.ts}.png`; a.click();
      }
    } catch {}
  };

  const copyLastToClipboard = async () => {
    const shot = snapshots[0];
    if (!shot?.blob) return;
    try {
      await (navigator.clipboard as any).write([
        new (window as any).ClipboardItem({ "image/png": shot.blob }),
      ]);
      alert("クリップボードにコピーしました");
    } catch {
      alert("コピーに対応していない環境です");
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white p-4 sm:p-8">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <motion.div
          className="lg:col-span-1 bg-slate-800/60 rounded-2xl p-5 sm:p-6 shadow-xl border border-white/10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            NFC×Web その場でフォトフレーム
          </h1>
          <p className="text-slate-300 mb-4">
            NFCタグでWebアプリを起動し、その場でカメラ撮影→フレーム合成→保存/共有まで行う体験のサンプルです。
          </p>

          <div className="space-y-3">
            <Section title="体験フロー">
              <ol className="list-decimal ml-6 space-y-1 text-slate-200">
                <li>NFCタグタッチ → Webアプリ起動（PWA推奨）</li>
                <li>カメラ許可 → プレビューにフレーム重畳</li>
                <li>撮影（カウントダウン対応・ガイド表示）</li>
                <li>端末へ保存 / そのまま共有 / クリップボードコピー</li>
              </ol>
            </Section>
            <Section title="技術構成（簡易）">
              <ul className="list-disc ml-6 space-y-1 text-slate-200">
                <li>起動: NDEF（URL）/ iOSショートカット / PWA</li>
                <li>撮影: <code>getUserMedia</code> + <code>Canvas</code></li>
                <li>フレーム: 透過PNG重畳</li>
                <li>保存/共有: <code>canvas.toBlob</code> + Web Share / Clipboard</li>
              </ul>
            </Section>
            <Section title="商用メモ">
              <ul className="list-disc ml-6 space-y-1 text-slate-200">
                <li>HTTPS必須（カメラ利用）</li>
                <li>個人情報配慮：原則サーバー保存なし</li>
                <li>IP案件：フレーム差し替えで量産</li>
              </ul>
            </Section>
          </div>
        </motion.div>

        <motion.div
          className="lg:col-span-2 bg-slate-800/60 rounded-2xl p-4 sm:p-6 shadow-xl border border-white/10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={activeFrame}
              onChange={(e) => setActiveFrame(e.target.value)}
              className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
            >
              {frames.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value as Settings["aspect"])}
              className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
            >
              <option value="3:4">3:4（スマホ向け）</option>
              <option value="1:1">1:1（SNS向け）</option>
              <option value="16:9">16:9（横長）</option>
            </select>

            {/* カメラ切替 */}
            <button
              onClick={() => setFacing((prev) => (prev === "user" ? "environment" : "user"))}
              className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600"
              title="フロント/背面を切り替え"
            >
              カメラ切替（今：{facing === "user" ? "自撮り" : "背面"}）
            </button>

            {/* タイマー */}
            <select
              value={String(timerSec)}
              onChange={(e) => setTimerSec(Number(e.target.value) as 0 | 3 | 5)}
              className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
              title="カウントダウン秒数"
            >
              <option value="0">タイマーなし</option>
              <option value="3">3秒</option>
              <option value="5">5秒</option>
            </select>

            {/* ガイド */}
            <button
              onClick={() => setGuideOn((v) => !v)}
              className={`rounded-2xl px-3 py-2 ${
                guideOn ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"
              }`}
              title="ルールオブサードのガイド表示"
            >
              ガイド{guideOn ? "ON" : "OFF"}
            </button>

            {/* セリフ/効果音 ON/OFF */}
            <button
              onClick={() => setShutterSoundOn((v) => !v)}
              className={`rounded-2xl px-3 py-2 ${
                shutterSoundOn ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"
              }`}
              title="セリフ/効果音のオン/オフ"
            >
              セリフ/効果音{shutterSoundOn ? "ON" : "OFF"}
            </button>

            {/* Torch */}
            {torchSupported && facing === "environment" && (
              <button
                onClick={() => applyTorch(!torchOn)}
                className={`rounded-2xl px-3 py-2 ${
                  torchOn ? "bg-amber-600" : "bg-slate-700 hover:bg-slate-600"
                }`}
                title="背面ライト"
              >
                ライト{torchOn ? "ON" : "OFF"}
              </button>
            )}

            <button
              onClick={doCapture}
              className="rounded-2xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 font-semibold shadow"
            >
              撮影する
            </button>
            <span className="text-slate-300 text-sm">
              {usingPlaceholder ? "※プレビューはダミー背景です" : ready ? "カメラ準備OK" : "準備中…"}
            </span>
          </div>

          <div
            className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black"
            style={{ aspectRatio: (aspect as any).replace(":", "/") }}
          >
            {!usingPlaceholder ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: isMirror ? "scaleX(-1)" : "none" }}
              />
            ) : (
              <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-emerald-300 to-sky-300 grid place-items-center">
                <div className="text-black/70 font-semibold text-lg">
                  (カメラ権限なしのためダミー表示)
                </div>
              </div>
            )}

            {/* ガイド */}
            {guideOn && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              </div>
            )}

            {/* ★ PNGフレーム重畳（プレビュー） */}
            {(() => {
              const src = getOverlaySrc(activeFrame, aspect);
              return src ? (
                <img
                  src={src}
                  alt=""
                  className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                />
              ) : null;
            })()}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={shareLast}
              disabled={!snapshots.length}
              className="rounded-xl px-3 py-2 bg-sky-600 disabled:bg-slate-700 disabled:opacity-60"
              title="直近の1枚を共有"
            >
              共有
            </button>
            <button
              onClick={copyLastToClipboard}
              disabled={!snapshots.length}
              className="rounded-xl px-3 py-2 bg-slate-600 disabled:bg-slate-700 disabled:opacity-60"
              title="直近の1枚をクリップボードへ"
            >
              コピー
            </button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
          {/* 音源たち */}
          <audio ref={voicePreRef}     src={VOICE_PRE_URL}  preload="auto" playsInline />
          <audio ref={voiceShutterRef} src={VOICE_FALLBACK} preload="auto" playsInline />
          <audio ref={voicePostRef}    src={VOICE_POST_URL} preload="auto" playsInline />

          {snapshots.length > 0 && (
            <div className="mt-5">
              <h3 className="font-semibold mb-2">保存候補（直近12件）</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {snapshots.map((s, i) => (
                  <a
                    key={s.ts + i}
                    href={s.url}
                    download={`oshi_photo_${s.ts}.png`}
                    className="group block"
                  >
                    <img
                      src={s.url}
                      alt="snapshot"
                      className="w-full h-40 object-cover rounded-xl border border-white/10 group-hover:opacity-90"
                    />
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm uppercase tracking-wide text-slate-400 mb-1">
        {title}
      </div>
      <div className="bg-slate-900/40 rounded-xl p-3 border border-white/5">
        {children}
      </div>
    </div>
  );
}
