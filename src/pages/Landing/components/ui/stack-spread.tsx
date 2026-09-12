// Veltrix landing — autoplay-on-mount stack scatter
// Cards represent Veltrix features (lucide-react icons, no external images)
// Center overlay: Veltrix logo + headline + CTA buttons

import {
  motion,
  animate,
  useTransform,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crop,
  Maximize2,
  Gauge,
  ShieldCheck,
  PackageCheck,
  Tag,
  Printer,
  ScanFace,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 2-color accent system
// ---------------------------------------------------------------------------
const PRIMARY   = "#6C63FF";
const SECONDARY = "#00D4FF";

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------
interface FeatureCard {
  label: string;
  sub: string;
  accent: string;
  icon: React.ReactElement;
}

const FEATURE_CARDS: FeatureCard[] = [
  { label: "Batch Crop",        sub: "Same edit, every file.",      accent: PRIMARY,   icon: <Crop size={24} strokeWidth={2} /> },
  { label: "Perspective Warp",  sub: "4-corner pin control.",        accent: PRIMARY,   icon: <Maximize2 size={24} strokeWidth={2} /> },
  { label: "Smart Compress",    sub: "Hit exact KB or MB targets.",  accent: PRIMARY,   icon: <Gauge size={24} strokeWidth={2} /> },
  { label: "Auto Crop",         sub: "Face & doc detection.",        accent: PRIMARY,   icon: <ScanFace size={24} strokeWidth={2} /> },
  { label: "ZIP Export",        sub: "One-click bundle.",            accent: SECONDARY, icon: <PackageCheck size={24} strokeWidth={2} /> },
  { label: "Bulk Rename",       sub: "Prefix + sequence.",           accent: SECONDARY, icon: <Tag size={24} strokeWidth={2} /> },
  { label: "Print Studio",      sub: "A4 / A3 · 300 DPI PDF.",      accent: SECONDARY, icon: <Printer size={24} strokeWidth={2} /> },
  { label: "Non-Destructive",   sub: "Originals always safe.",       accent: SECONDARY, icon: <ShieldCheck size={24} strokeWidth={2} /> },
];

// ---------------------------------------------------------------------------
// Scatter layout
// ---------------------------------------------------------------------------
interface ScatterCard {
  featureIndex: number;
  stackOffset: { x: number; y: number };
  stackRotate: number;
  target: { x: number; y: number; rotate: number; scale: number; w: number; h: number };
  targetSm: { x: number; y: number };
  z: number;
  floatPhase: number;
}

const CARDS: ScatterCard[] = [
  { featureIndex: 0, stackOffset: { x: -5,  y: -8  }, stackRotate: -14, target: { x: -34, y: -30, rotate: -4, scale: 0.88, w: 18, h: 22 }, targetSm: { x: -22, y: -42 }, z: 2,  floatPhase: 0.0 },
  { featureIndex: 1, stackOffset: { x:  8,  y: -8  }, stackRotate:  14, target: { x:  34, y: -30, rotate:  4, scale: 0.88, w: 18, h: 22 }, targetSm: { x:  22, y: -42 }, z: 3,  floatPhase: 0.8 },
  { featureIndex: 2, stackOffset: { x: -12, y:  0  }, stackRotate:  -6, target: { x: -38, y:   2, rotate: -2, scale: 0.90, w: 18, h: 22 }, targetSm: { x: -22, y: -20 }, z: 4,  floatPhase: 1.6 },
  { featureIndex: 3, stackOffset: { x:   2, y: -12 }, stackRotate:  -2, target: { x:   0, y: -34, rotate:  1, scale: 0.88, w: 18, h: 22 }, targetSm: { x:  22, y: -20 }, z: 5,  floatPhase: 2.4 },
  { featureIndex: 4, stackOffset: { x:  12, y:  0  }, stackRotate:   6, target: { x:  38, y:   2, rotate:  3, scale: 0.90, w: 18, h: 22 }, targetSm: { x: -22, y:  18 }, z: 6,  floatPhase: 3.2 },
  { featureIndex: 5, stackOffset: { x:  -8, y:  8  }, stackRotate:   8, target: { x: -34, y:  30, rotate: -3, scale: 0.88, w: 18, h: 22 }, targetSm: { x:  22, y:  18 }, z: 7,  floatPhase: 4.0 },
  { featureIndex: 6, stackOffset: { x:   2, y:  12 }, stackRotate:   3, target: { x:   0, y:  34, rotate:  2, scale: 0.88, w: 18, h: 22 }, targetSm: { x: -22, y:  40 }, z: 8,  floatPhase: 4.8 },
  { featureIndex: 7, stackOffset: { x:  14, y:  8  }, stackRotate:  -8, target: { x:  34, y:  30, rotate: -4, scale: 0.88, w: 18, h: 22 }, targetSm: { x:  22, y:  40 }, z: 9,  floatPhase: 5.6 },
];

const SCATTER_START = 0.12;
const SCATTER_END   = 0.9;

const PARALLAX_X = 0.8;
const PARALLAX_Y = 0.7;
const PARALLAX_SPRING = { stiffness: 90, damping: 22, mass: 0.6 };

const parallaxDepth = (i: number, total: number) =>
  total <= 1 ? 1 : 0.55 + (i / (total - 1)) * 0.75;

const RESPONSIVE = {
  desktop: { scale: null as number | null, small: false, colX: null as number | null },
  small:   { scale: 0.72,                  small: true,  colX: 22 },
};

function useResponsive() {
  const [r, setR] = useState(RESPONSIVE.desktop);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const read = () => setR(mq.matches ? RESPONSIVE.small : RESPONSIVE.desktop);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return r;
}

function usePointerParallax(active: boolean, enabled: boolean) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, PARALLAX_SPRING);
  const y = useSpring(rawY, PARALLAX_SPRING);

  useEffect(() => {
    if (!enabled) return;
    if (!active) { rawX.set(0); rawY.set(0); return; }

    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth)  * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onLeave = () => { rawX.set(0); rawY.set(0); };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [active, enabled, rawX, rawY]);

  return { x, y };
}

function useIdleFloat(phase: number, enabled: boolean) {
  const raw = useMotionValue(0);
  const spring = useSpring(raw, { stiffness: 60, damping: 18, mass: 1 });

  useEffect(() => {
    if (!enabled) { raw.set(0); return; }

    const AMPLITUDE = 0.6;
    const PERIOD    = 3800;
    let raf = 0;

    const tick = (t: number) => {
      raw.set(AMPLITUDE * Math.sin((t / PERIOD) * 2 * Math.PI + phase));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, phase, raw]);

  return spring;
}

// ---------------------------------------------------------------------------
// Feature card face
// ---------------------------------------------------------------------------
function FeatureCardFace({ feature, cardRadius }: { feature: FeatureCard; cardRadius: number }) {
  return (
    <div
      className="relative h-full w-full overflow-hidden flex flex-col items-center justify-center gap-3 select-none max-md:rounded-[4vw]"
      style={{
        borderRadius: `${cardRadius}px`,
        background: "linear-gradient(145deg,#13131E 0%,#0D0D18 100%)",
        border: `1px solid ${feature.accent}30`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 ${feature.accent}20`,
      }}
    >
      <div
        className="absolute top-0 left-4 right-4 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}CC, transparent)` }}
      />
      <div className="flex-shrink-0" style={{ color: feature.accent }} aria-hidden="true">
        {feature.icon}
      </div>
      <div className="px-3 text-center">
        <p className="text-[2.2vw] md:text-[1.05vw] font-bold leading-tight" style={{ color: "#E8E8F0" }}>
          {feature.label}
        </p>
        <p className="text-[1.6vw] md:text-[0.72vw] mt-0.5 leading-tight" style={{ color: "#7070A0" }}>
          {feature.sub}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single animated card
// ---------------------------------------------------------------------------
function FeatureCardItem({
  card, feature, progress, reduce, scaleMul, isSmall, colX,
  stackScale, cardRadius, pointer, depth,
}: {
  card: ScatterCard;
  feature: FeatureCard;
  progress: MotionValue<number>;
  reduce: boolean | null;
  scaleMul: number | null;
  isSmall: boolean;
  colX: number | null;
  stackScale: number;
  cardRadius: number;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  depth: number;
}) {
  const { target } = card;
  const flat        = reduce === true;
  const stackRotate = flat ? 0 : card.stackRotate;
  const stackOffset = card.stackOffset;
  const restScale   = scaleMul ?? target.scale;

  const sm   = isSmall && card.targetSm ? card.targetSm : null;
  const endX = sm ? (colX != null ? Math.sign(sm.x) * colX : sm.x) : target.x;
  const endY = sm ? sm.y : target.y;
  const endRotate = flat || isSmall ? 0 : target.rotate;

  const floatEnabled = reduce !== true && !isSmall;
  const floatY = useIdleFloat(card.floatPhase, floatEnabled);

  const translate = useTransform(
    [progress, pointer.x, pointer.y, floatY],
    ([p, px, py, fy]: number[]) => {
      const tx = stackOffset.x + (endX - stackOffset.x) * p;
      const ty = stackOffset.y + (endY - stackOffset.y) * p + fy * (1 - p);
      const drift = depth * p;
      const dx = tx - (px as number) * PARALLAX_X * drift;
      const dy = ty - (py as number) * PARALLAX_Y * drift;
      return `calc(-50% + ${dx}vw) calc(-50% + ${dy}vh)`;
    },
  );
  const rotate = useTransform(progress, [0, 1], [stackRotate, endRotate]);
  const scale  = useTransform(progress, [0, 1], [stackScale,  restScale]);

  const w = isSmall ? 40 : target.w;
  const h = isSmall ? 20 : target.h;

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 will-change-transform"
      style={{ width: `${w}vw`, height: `${h}vh`, zIndex: card.z, translate, rotate, scale }}
    >
      <FeatureCardFace feature={feature} cardRadius={cardRadius} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Center overlay — Veltrix branding + CTA buttons
// ---------------------------------------------------------------------------
function CenterOverlay({
  copyOpacity, copyScale, noScale, spread,
}: {
  copyOpacity: MotionValue<number>;
  copyScale:   MotionValue<number>;
  noScale:     boolean;
  spread:      boolean;
}) {
  const navigate = useNavigate();
  const WIN_URL = import.meta.env.VITE_WINDOWS_URL || "#";
  const LIN_URL = import.meta.env.VITE_LINUX_URL   || "#";

  const TRUST = ["Zero cloud uploads", "Works offline", "No account needed"];

  return (
    <motion.div
      className="absolute inset-0 z-[15] flex flex-col items-center justify-center px-6 text-center max-md:px-8"
      style={{
        opacity:       copyOpacity,
        scale:         noScale ? 1 : copyScale,
        pointerEvents: spread ? "auto" : "none",
      }}
    >
      {/* Logo */}
      <div className="mb-4 flex items-center justify-center gap-2.5">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#6C63FF,#00D4FF)", boxShadow: "0 0 28px rgba(108,99,255,0.55)" }}
        >
          <span className="text-white font-black text-base leading-none" aria-hidden="true">V</span>
        </div>
        <span className="text-[5vw] md:text-[2.5vw] font-black font-kola text-white tracking-tight leading-none">
          Veltrix
        </span>
      </div>

      {/* Headline */}
      <h1
        className="font-black leading-[1.1] tracking-tight text-white mb-3"
        style={{ fontSize: "clamp(28px, 4.5vw, 72px)" }}
      >
        Batch Edit.{" "}
        <span
          style={{
            background: "linear-gradient(135deg,#6C63FF 0%,#00D4FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor:  "transparent",
            backgroundClip:       "text",
          }}
        >
          Privately.
        </span>
      </h1>

      {/* Subtext */}
      <p
        className="leading-relaxed mb-6 max-w-[38ch]"
        style={{ fontSize: "clamp(12px, 1.1vw, 17px)", color: "#8888AA" }}
      >
        Crop, resize, rename, and export — hundreds of files at once,
        instantly, right in your browser.
      </p>

      {/* CTA row */}
      <div className="flex flex-row flex-wrap items-center justify-center gap-2.5">
        {/* Try Now — navigates to /editor (client-side, no reload) */}
        <button
          onClick={() => navigate("/editor")}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white transition-all duration-200 whitespace-nowrap cursor-pointer"
          style={{
            fontSize:   "clamp(12px, 1vw, 15px)",
            background: "linear-gradient(135deg,#6C63FF,#00D4FF)",
            boxShadow:  "0 4px 20px rgba(108,99,255,0.5)",
            border:     "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 8px 36px rgba(108,99,255,0.7)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(108,99,255,0.5)";
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
               strokeLinecap="round" strokeLinejoin="round"
               style={{ width: "clamp(13px,1.1vw,16px)", height: "clamp(13px,1.1vw,16px)" }}
               aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
          </svg>
          Try Now
        </button>

        {/* Windows */}
        <a
          href={WIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap"
          style={{
            fontSize:   "clamp(12px, 1vw, 15px)",
            color:      "#C8C3FF",
            background: "rgba(108,99,255,0.12)",
            border:     "1px solid rgba(108,99,255,0.35)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(108,99,255,0.22)";
            e.currentTarget.style.transform  = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(108,99,255,0.12)";
            e.currentTarget.style.transform  = "translateY(0)";
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor"
               style={{ width: "clamp(11px,0.95vw,14px)", height: "clamp(11px,0.95vw,14px)" }}
               aria-hidden="true">
            <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
          </svg>
          Windows
        </a>

        {/* Linux */}
        <a
          href={LIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap"
          style={{
            fontSize:   "clamp(12px, 1vw, 15px)",
            color:      "#C8C3FF",
            background: "rgba(108,99,255,0.12)",
            border:     "1px solid rgba(108,99,255,0.35)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(108,99,255,0.22)";
            e.currentTarget.style.transform  = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(108,99,255,0.12)";
            e.currentTarget.style.transform  = "translateY(0)";
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor"
               style={{ width: "clamp(11px,0.95vw,14px)", height: "clamp(11px,0.95vw,14px)" }}
               aria-hidden="true">
            <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.44.134.09.34-.405.48-.595.137-1.13.2-1.386.35-.233.143-.358.46-.305.655a.067.067 0 00.01.03c.12.267.35.48.636.594.286.113.594.14.893.078.6-.124 1.09-.5 1.414-1.024.193-.31.295-.668.3-1.035a.42.42 0 00.05-.197c-.024-.198-.12-.377-.2-.532-.2-.394-.363-.7-.245-1.07.12-.377.458-.68.842-.867.387-.188.82-.275 1.22-.36.395-.08.752-.18 1.047-.39.298-.21.51-.538.516-.945a1.05 1.05 0 00-.147-.53 1.3 1.3 0 00-.448-.43 1.95 1.95 0 00-.61-.23 2.1 2.1 0 00-.618-.029c-.38.034-.726.175-.992.39-.273.218-.457.522-.536.87a.97.97 0 00.024.47.86.86 0 00.267.396l.09.055c.054.026.11.045.166.058a.573.573 0 00.358-.028.6.6 0 00.272-.235.58.58 0 00.1-.337.413.413 0 00-.04-.18.46.46 0 00-.126-.159.528.528 0 00-.21-.088.533.533 0 00-.243.014.573.573 0 00-.217.118.617.617 0 00-.16.22c-.02.056-.031.115-.032.175a.527.527 0 00.038.198z"/>
          </svg>
          Linux
        </a>
      </div>

      {/* Mobile pill */}
      <div className="mt-2.5">
        <div
          className="inline-flex items-center gap-1.5 cursor-not-allowed select-none"
          aria-disabled="true"
          role="button"
          tabIndex={-1}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
               strokeLinecap="round" strokeLinejoin="round"
               style={{ width: "clamp(10px,0.8vw,13px)", height: "clamp(10px,0.8vw,13px)", color: "#44445A" }}
               aria-hidden="true">
            <rect x="5" y="2" width="14" height="20" rx="2"/>
            <path d="M12 18h.01"/>
          </svg>
          <span className="font-medium" style={{ fontSize: "clamp(10px,0.75vw,12px)", color: "#44445A" }}>
            Mobile App
          </span>
          <span
            className="px-1.5 py-0.5 rounded-full font-bold tracking-wide uppercase"
            style={{
              fontSize:   "clamp(8px,0.6vw,10px)",
              background: "rgba(139,139,170,0.08)",
              color:      "#44445A",
              border:     "1px solid rgba(139,139,170,0.12)",
            }}
          >
            Soon
          </span>
        </div>
      </div>

      {/* Trust line */}
      <div
        className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
        style={{ fontSize: "clamp(10px, 0.78vw, 12px)" }}
      >
        {TRUST.map((phrase) => (
          <span
            key={phrase}
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: "#9898B8" }}
          >
            <Check size={11} strokeWidth={2.5} style={{ color: SECONDARY, flexShrink: 0 }} aria-hidden="true" />
            {phrase}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main stage
// ---------------------------------------------------------------------------
export interface StackSpreadProps {
  bgColor?: string;
  textColor?: string;
  clusterRotation?: boolean;
  stackScale?: number;
  cardRadius?: number;
  textFadeStart?: number;
  showScrollHint?: boolean;
}

export default function StackSpread({
  bgColor       = "#050508",
  clusterRotation: _cr = true,
  stackScale    = 0.82,
  cardRadius    = 12,
  textFadeStart = 0.3,
  showScrollHint: _showScrollHint = false,
}: StackSpreadProps) {
  const reduce  = useReducedMotion();
  const { scale: scaleMul, small: isSmall, colX } = useResponsive();

  const rawProgress = useMotionValue(0);

  useEffect(() => {
    const duration = reduce === true ? 0 : 3.1;
    const delay    = reduce === true ? 0 : 0.35;

    const controls = animate(rawProgress, 1, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
    });

    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const progress = useTransform(
    rawProgress,
    [0, SCATTER_START, SCATTER_END, 1],
    [0, 0, 1, 1],
  );

  const [spread, setSpread] = useState(false);
  useMotionValueEvent(progress, "change", (p) => {
    setSpread((was) => (was ? p > 0.985 : p >= 0.999));
  });

  const parallaxEnabled = reduce !== true && !isSmall;
  const pointer = usePointerParallax(spread, parallaxEnabled);

  const copyOpacity = useTransform(progress, [textFadeStart, textFadeStart + 0.35], [0, 1]);
  const copyScale   = useTransform(progress, [textFadeStart, 0.9], [0.88, 1]);

  const wordmarkScrollOpacity = useTransform(progress, [0, 0.18], [0.07, 0]);
  const wordmarkOpacity = reduce === true ? 0.05 : wordmarkScrollOpacity;

  return (
    <section
      className="relative w-full"
      style={{ height: "100vh", backgroundColor: bgColor }}
      aria-label="Veltrix features"
    >
      <div className="h-screen w-full overflow-hidden flex items-center justify-center">

        {/* Background radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 75% 65% at 50% 50%, rgba(108,99,255,0.06) 0%, transparent 70%)" }}
        />

        {/* Logo watermark — z-0, behind everything */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-0 select-none"
          style={{
            top:       "50%",
            left:      "50%",
            transform: "translate(-50%, -50%)",
            width:     "min(90vw, 90vh)",
            maxWidth:  "820px",
            opacity:   0.09,
          }}
        >
          <img
            src="/veltrix_logo.png"
            alt=""
            draggable={false}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        {/* Background "Veltrix" wordmark */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center z-[1] select-none"
          style={{ opacity: wordmarkOpacity, paddingBottom: "32vh" }}
        >
          <span
            className="font-black font-kola text-white whitespace-nowrap"
            style={{ fontSize: "clamp(80px, 22vw, 320px)", letterSpacing: "-0.03em" }}
          >
            Veltrix
          </span>
        </motion.div>

        {/* Scattered feature cards */}
        <div className="absolute inset-0 z-10">
          {CARDS.map((card, i) => (
            <FeatureCardItem
              key={i}
              card={card}
              feature={FEATURE_CARDS[card.featureIndex]}
              progress={progress}
              reduce={reduce}
              scaleMul={scaleMul}
              isSmall={isSmall}
              colX={colX}
              stackScale={stackScale}
              cardRadius={cardRadius}
              pointer={pointer}
              depth={parallaxEnabled ? parallaxDepth(i, CARDS.length) : 0}
            />
          ))}
        </div>

        {/* Veltrix brand + CTAs */}
        <CenterOverlay
          copyOpacity={copyOpacity}
          copyScale={copyScale}
          noScale={reduce === true}
          spread={spread}
        />

      </div>
    </section>
  );
}
