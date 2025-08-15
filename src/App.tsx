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
      aspect ===
