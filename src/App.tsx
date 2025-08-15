import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

type Snapshot = { url: string; ts: number; blob?: Blob };

const frames = [
  {
    id: "sparkle",
    name: "キラキラ・フレーム",
    render: () => (
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-3 left-3 h-16 w-16 rounded-full blur-md opacity-70"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)",
          }}
        />
        <div
          className="absolute top-3 right-3 h-16 w-16 rounded-full blur-md opacity-70"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)",
          }}
        />
        <div
          className="absolute bottom-3 left-3 h-16 w-16 rounded-full blur-md opacity-70"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)",
          }}
        />
        <div
          className="absolute bottom-3 right-3 h-16 w-16 rounded-full blur-md opacity-70"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.0) 60%)",
          }}
        />
        <div className="absolute inset-2 rounded-2xl border-[6px] border-white/70 shadow-[0_0_40px_rgba(255,255,255,0.35)]" />
      </div>
    ),
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
    ),
  },
  {
    id: "neon",
    name: "ネオン・フレーム",
    render: () => (
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-4 rounded-2xl"
          style={{
            boxShadow:
              "0 0 12px rgba(0,255,255,0.8), inset 0 0 24px rgba(0,255,255,0.35)",
          }}
        />
        <div
          className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-xl font-bold text-white"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,255,255,0.5), rgba(255,0,255,0.5))",
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          Oshi Camera
        </div>
      </div>
    ),
  },
];

const SETTINGS_KEY = "oshi.camera.settings.v1";
const VOICE_URL = "/sounds/voice_shutter.mp3"; // ← WAVでもOK。存在しない場合は自動でビープにフォールバック

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
  const voiceRef = useRef<HTMLAudioElement | null>(null); // ★追加：音声ファイル再生用
  const params = useMemo(() => new URLSearchParams(location.search), []);

  // URLパラメータ or 保存値 or 既定
  const saved: Partial<Settings> = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      return {};
    }
  }, []);

  const initialFrame = (params.get("frame") ||
    saved.activeFrame ||
    frames[0].id) as string;

  const initialAspect = (params.get("aspect") ||
    saved.aspect ||
    "3:4") as Settings["aspect"];

  const initialFacing = (saved.facing || "user") as Settings["facing"];

  const initialTimer = (Number(params.get("timer")) ||
    saved.timerSec ||
    3) as Settings["timerSec"];

  const [ready, setReady] = useState(false);
  thed
  const [usingPlaceholder, setUsingPlaceholder] = useState(false);
  const [activeFrame, setActiveFrame] = useState(initialFrame);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [aspect, setAspect] = useState<Settings["aspect"]>(initialAspect);
  const [facing, setFacing] =
    useState<Settings["facing"]>(initialFacing);
  const [guideOn, setGuideOn] = useState<boolean>(saved.guideOn ?? false);
  const [shutterSoundOn, setShutterSoundOn] = useState<boolean>(
    saved.shutterSoundOn ?? true
  );
  const [timerSec, setTimerSec] = useState<Settings["timerSec"]>(
    initialTimer
  );
  const [flashOn, setFlashOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const isMirror = facing === "user";

  // ---- 保存 ----
  useEffect(() => {
    const s: Settings = {
      activeFrame,
      aspect,
      facing,
      guideOn,
      shutterSoundOn,
      timerSec,
    };
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
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch {
          /* 次の候補へ */
        }
      }
      if (!stream) throw new Error("no stream");

      if (videoRef.current) {
        (videoRef.current as any).srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);

      // Torch対応判定
      const track = stream.getVideoTracks?.()[0];
      const caps = (track?.getCapabilities?.() as any) || {};
      if (caps && "torch" in caps) {
        setTorchSupported(true);
      }
    } catch {
      setUsingPlaceholder(true);
      setReady(true);
    }
  };

  // 向きが変わるたびに取り直し（初期は user）
  useEffect(() => {
    startStream(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // Torch切替
  const applyTorch = async (on: boolean) => {
    try {
      const stream: MediaStream | undefined = (videoRef.current as any)
        ?.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      const caps = (track?.getCapabilities?.() as any) || {};
      if (!track || !("torch" in caps)) return;
      await track.applyConstraints({ advanced: [{ torch: on }] as any });
      setTorchOn(on);
    } catch {
      // 失敗時は何もしない
    }
  };

  // ★修正：シャッター音 > まずは音声ファイルを再生。ダメならビープにフォールバック
  const playShutter = async () => {
    if (!shutterSoundOn) return;
    // 1) 音声ファイル（MP3/WAV）
    try {
      const a = voiceRef.current;
      if (a) {
        a.currentTime = 0;
        a.volume = 1.0;
        await a.play(); // iOSはユーザー操作起点（撮影ボタン）なので再生可
        try { (navigator as any).vibrate?.(40); } catch {}
        return;
      }
    } catch {
      /* 音声再生不可 → ビープへフォールバック */
    }

    // 2) フォールバック：ビープ（WebAudio）
    try {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctor();
      if (ctx.state !== "running") await ctx.resume();

      const g = ctx.createGain();
      g.connect(ctx.destination);

      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = "square";
      o2.type = "sine";

      const t0 = ctx.currentTime;
      o1.frequency.setValueAtTime(1200, t0);
      o2.frequency.setValueAtTime(700, t0 + 0.06);

      o1.connect(g);
      o2.connect(g);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);

      o1.start(t0);
      o2.start(t0 + 0.06);
      o1.stop(t0 + 0.30);
      o2.stop(t0 + 0.30);
      o2.onended = () => ctx.close();
      try { (navigator as any).vibrate?.(50); } catch {}
    } catch {
      try { (navigator as any).vibrate?.(60); } catch {}
    }
  };

  // キャンバスへ描画＆保存
  const drawAndSave = async (): Promise<Snapshot> => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const [w, h] =
      aspect === "1:1" ? [900, 900] : aspect === "16:9" ? [1280, 720] : [900, 1200];
    canvas.width = w;
    canvas.height = h;

    if (!usingPlaceholder && videoRef.current && (videoRef.current as any).videoWidth) {
      const vw = (videoRef.current as any).videoWidth;
      const vh = (videoRef.current as any).videoHeight;
      const scale = Math.max(w / vw, h / vh);
      const dw = vw * scale;
      const dh = vh * scale;
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

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/png")
    );
    const url = URL.createObjectURL(blob);
    const shot: Snapshot = { url, ts: Date.now(), blob };
    setSnapshots((prev) => [shot, ...prev].slice(0, 12));
    return shot;
  };

  const doCapture = async () => {
    // カウントダウン
    if (timerSec > 0) {
      for (let i = timerSec; i >= 1; i--) {
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(0);
    }

    await playShutter(); // ← 音声ファイル（撮影するよ～等）or フォールバック

    // フラッシュ（0.35秒）
    setFlashOn(true);
    setTimeout(() => setFlashOn(false), 350);

    await drawAndSave();
  };

  const FrameOverlay = (frames.find((f) => f.id === activeFrame) as any)?.render;

  const shareLast = async () => {
    const shot = snapshots[0];
    if (!shot?.blob) return;
    try {
      const file = new File([shot.blob], `oshi_${shot.ts}.png`, {
        type: "image/png",
      });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({
          files: [file],
          title: "Oshi Camera",
          text: "その場でフォトフレーム📸",
        });
      } else {
        const a = document.createElement("a");
        a.href = shot.url;
        a.download = `oshi_${shot.ts}.png`;
        a.click();
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
                <li>
                  撮影: <code>getUserMedia</code> + <code>Canvas</code>
                </li>
                <li>フレーム: Canvas描画 or 透過PNG重畳</li>
                <li>
                  保存/共有: <code>canvas.toBlob</code> + Web Share / Clipboard
                </li>
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
              onClick={() =>
                setFacing((prev) => (prev === "user" ? "environment" : "user"))
              }
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

            {/* シャッター音 */}
            <button
              onClick={() => setShutterSoundOn((v) => !v)}
              className={`rounded-2xl px-3 py-2 ${
                shutterSoundOn ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"
              }`}
              title="シャッター音のオン/オフ"
            >
              撮影音{shutterSoundOn ? "ON" : "OFF"}
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
                {/* 縦線 */}
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                {/* 横線 */}
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              </div>
            )}

            {/* フレーム */}
            <div className="absolute inset-0">{FrameOverlay && <FrameOverlay />}</div>

            {/* カウントダウン */}
            {countdown > 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <motion.div
                  key={countdown}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 1 }}
                  className="bg-black/40 rounded-full w-28 h-28 grid place-items-center border border-white/30"
                >
                  <div className="text-5xl font-black">{countdown}</div>
                </motion.div>
              </div>
            )}

            {/* フラッシュ（白100% + 0.35s） */}
            {flashOn && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 0.35, ease: "easeOut", times: [0, 0.2, 1] }}
                className="absolute inset-0 bg-white"
              />
            )}
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
          {/* ★追加：音声タグ（事前プリロード）。撮影ボタン=ユーザー操作起点なのでiOSでも再生可 */}
          <audio ref={voiceRef} src={VOICE_URL} preload="auto" playsInline />

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
