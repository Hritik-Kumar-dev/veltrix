/**
 * Veltrix landing — crop-tool reveal intro
 *
 * GSAP animates a crop-selection frame from a small centered box to a
 * padded-inset full-viewport frame, then stops — the frame stays visible
 * permanently as a framing element around the hero content.
 *
 * Changes from previous version:
 *  - Frame never fades out (items 1, 2, 3)
 *  - Frame stops with responsive inset padding, not flush to edge (item 2)
 *  - Large Kola wordmark watermark removed; smaller logo watermark with
 *    hover-glow added (item 4)
 *  - Button row gap and padding increased (item 5)
 *  - "V" placeholder replaced with actual logo image (item 6)
 *  - 8 feature cards removed; horizontal icon-label feature list added (item 7)
 *  - Hero content scoped inside the frame's padding bounds (item 8)
 *  - Single accent color (#7c6af7), all cyan/multi-accent removed (item 9)
 *  - No borders on feature list (item 10)
 */

import gsap from "gsap";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crop, Maximize2, Gauge, ShieldCheck,
  PackageCheck, Tag, Printer, ScanFace,
} from "lucide-react";

// ─── Single accent color (matches editor PerspectiveCropOverlay handle color) ─
const ACCENT      = "#7c6af7";
const ACCENT_DIM  = "rgba(124,106,247,0.18)";
const ACCENT_GLO  = "rgba(124,106,247,0.50)";
const ACCENT_MED  = "rgba(124,106,247,0.35)";

// ─── Feature list (icon + label only — no card backgrounds, no borders) ───────
interface Feature { label: string; icon: React.ReactElement; }

const FEATURES: Feature[] = [
  { label: "Batch Crop",       icon: <Crop         size={14} strokeWidth={2} /> },
  { label: "Perspective Warp", icon: <Maximize2    size={14} strokeWidth={2} /> },
  { label: "Smart Compress",   icon: <Gauge        size={14} strokeWidth={2} /> },
  { label: "Auto Crop",        icon: <ScanFace     size={14} strokeWidth={2} /> },
  { label: "ZIP Export",       icon: <PackageCheck size={14} strokeWidth={2} /> },
  { label: "Bulk Rename",      icon: <Tag          size={14} strokeWidth={2} /> },
  { label: "Print Studio",     icon: <Printer      size={14} strokeWidth={2} /> },
  { label: "Non-Destructive",  icon: <ShieldCheck  size={14} strokeWidth={2} /> },
];

// ─── Frame padding: how far the fully-expanded frame sits from the viewport edge
// Responsive: at 320px screen → 20px, at 1440px → 40px, caps at 48px.
const FRAME_PAD_MIN = 20;   // px
const FRAME_PAD_MAX = 48;   // px
function framePad(vw: number): number {
  return Math.round(Math.min(FRAME_PAD_MAX, Math.max(FRAME_PAD_MIN, vw * 0.028)));
}

// ─── Initial frame: small centered box framing the logo area ──────────────────
const INITIAL_FRAME_FRACTION = 0.30;   // fraction of smaller viewport dimension

// ─── CropFrameReveal ──────────────────────────────────────────────────────────
/**
 * Renders the crop-tool overlay.  On mount GSAP plays the expand sequence,
 * then calls onDone.  The frame (border, handles) stays visible forever after.
 *
 * Phases:
 *   0.00 → 1.20 s  frame expands; dim panels collapse outward
 *   0.70 → 1.15 s  crosshair fades out (frame nearing final size)
 *   1.20 s          done — dim panels gone, frame border + handles remain
 */

interface CropFrameRevealProps {
  onDone:  () => void;
  instant: boolean;
}

function CropFrameReveal({ onDone, instant }: CropFrameRevealProps) {
  const overlayRef   = useRef<HTMLDivElement>(null);
  const frameRef     = useRef<HTMLDivElement>(null);
  const dimTopRef    = useRef<HTMLDivElement>(null);
  const dimBotRef    = useRef<HTMLDivElement>(null);
  const dimLeftRef   = useRef<HTMLDivElement>(null);
  const dimRightRef  = useRef<HTMLDivElement>(null);
  const handlesRef   = useRef<HTMLDivElement>(null);
  const thirdsRef    = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const tlRef        = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const overlay   = overlayRef.current;
    const frame     = frameRef.current;
    const dimTop    = dimTopRef.current;
    const dimBot    = dimBotRef.current;
    const dimLeft   = dimLeftRef.current;
    const dimRight  = dimRightRef.current;
    const handles   = handlesRef.current;
    const thirds    = thirdsRef.current;
    const crosshair = crosshairRef.current;

    if (!overlay || !frame || !dimTop || !dimBot || !dimLeft || !dimRight
        || !handles || !thirds || !crosshair) return;

    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const pad = framePad(vw);
    const smaller = Math.min(vw, vh);

    // ── Initial frame ──────────────────────────────────────────────────────
    const initW = smaller * INITIAL_FRAME_FRACTION;
    const initH = initW * 0.55;
    const initL = (vw - initW) / 2;
    const initT = (vh - initH) / 2;

    gsap.set(frame, { left: initL, top: initT, width: initW, height: initH });

    // Dim panels cover everything outside the initial frame
    gsap.set(dimTop,   { top: 0,             left: 0, width: vw, height: initT });
    gsap.set(dimBot,   { top: initT + initH, left: 0, width: vw, height: vh - initT - initH });
    gsap.set(dimLeft,  { top: initT, left: 0,              width: initL,             height: initH });
    gsap.set(dimRight, { top: initT, left: initL + initW,  width: vw - initL - initW, height: initH });

    // ── Final frame bounds (padded inset) ──────────────────────────────────
    const finalL = pad;
    const finalT = pad;
    const finalW = vw - pad * 2;
    const finalH = vh - pad * 2;

    if (instant) {
      // Reduced motion: jump straight to final state, no dim panels
      gsap.set(frame,   { left: finalL, top: finalT, width: finalW, height: finalH });
      gsap.set(dimTop,  { height: 0 });
      gsap.set(dimBot,  { top: vh, height: 0 });
      gsap.set(dimLeft, { width: 0 });
      gsap.set(dimRight,{ left: vw, width: 0 });
      gsap.set(crosshair, { opacity: 0 });
      // Remove dim overlay from paint tree; frame stays
      [dimTop, dimBot, dimLeft, dimRight].forEach(el => { el.style.display = "none"; });
      onDone();
      return;
    }

    // ── GSAP timeline ──────────────────────────────────────────────────────
    const expandDur  = 1.2;
    const expandEase = "power3.inOut";

    const tl = gsap.timeline({
      onComplete: () => {
        // Dim panels are now 0-size; remove them from paint to save layers.
        [dimTop, dimBot, dimLeft, dimRight].forEach(el => { el.style.display = "none"; });
        onDone();
        // NOTE: frame, handles, thirds stay fully visible — no fade-out.
      },
    });
    tlRef.current = tl;

    // Phase 1: frame expands to padded final bounds
    tl.to(frame, { left: finalL, top: finalT, width: finalW, height: finalH,
                   duration: expandDur, ease: expandEase }, 0);

    // Dim panels collapse to zero as frame opens
    tl.to(dimTop,  { height: 0,             duration: expandDur, ease: expandEase }, 0);
    tl.to(dimBot,  { top: vh,  height: 0,   duration: expandDur, ease: expandEase }, 0);
    tl.to(dimLeft, { width: 0,              duration: expandDur, ease: expandEase }, 0);
    tl.to(dimRight,{ left: vw, width: 0,    duration: expandDur, ease: expandEase }, 0);

    // Phase 2: crosshair fades as frame nears final size
    tl.to(crosshair, { opacity: 0, duration: 0.45, ease: "power2.in" }, 0.70);

    // Frame border, handles, thirds remain at full opacity — intentionally not faded.

    return () => {
      tlRef.current?.kill();
      tlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none", overflow: "hidden" }}
    >
      {/* Dim panels */}
      <div ref={dimTopRef}   style={dimPanelStyle} />
      <div ref={dimBotRef}   style={dimPanelStyle} />
      <div ref={dimLeftRef}  style={dimPanelStyle} />
      <div ref={dimRightRef} style={dimPanelStyle} />

      {/* Crop frame — stays visible permanently after animation */}
      <div
        ref={frameRef}
        style={{
          position: "absolute",
          boxSizing: "border-box",
          border: `1.5px solid ${ACCENT}`,
          boxShadow: `0 0 0 1px ${ACCENT}22, 0 0 20px 2px ${ACCENT}14`,
        }}
      >
        {/* Rule-of-thirds grid */}
        <div ref={thirdsRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={thirdLineH(1)} />
          <div style={thirdLineH(2)} />
          <div style={thirdLineV(1)} />
          <div style={thirdLineV(2)} />
        </div>

        {/* Corner + edge handles */}
        <div ref={handlesRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <CornerHandle pos="tl" />
          <CornerHandle pos="tr" />
          <CornerHandle pos="br" />
          <CornerHandle pos="bl" />
          <EdgeHandle pos="t" />
          <EdgeHandle pos="b" />
          <EdgeHandle pos="l" />
          <EdgeHandle pos="r" />
        </div>

        {/* Center crosshair — fades out during animation */}
        <div
          ref={crosshairRef}
          style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ position: "absolute", width: 14, height: 1, background: ACCENT, opacity: 0.85 }} />
          <div style={{ position: "absolute", width: 1, height: 14, background: ACCENT, opacity: 0.85 }} />
          <div style={{ width: 3, height: 3, borderRadius: "50%", background: ACCENT,
                        boxShadow: `0 0 6px 2px ${ACCENT_GLO}` }} />
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const dimPanelStyle: React.CSSProperties = {
  position: "absolute",
  background: "rgba(5,5,8,0.80)",
};

function thirdLineH(n: 1 | 2): React.CSSProperties {
  return {
    position: "absolute", left: 0, right: 0,
    top: `${(n / 3) * 100}%`, height: 1,
    backgroundImage: `repeating-linear-gradient(90deg,
      ${ACCENT}44 0px, ${ACCENT}44 5px, transparent 5px, transparent 11px)`,
  };
}
function thirdLineV(n: 1 | 2): React.CSSProperties {
  return {
    position: "absolute", top: 0, bottom: 0,
    left: `${(n / 3) * 100}%`, width: 1,
    backgroundImage: `repeating-linear-gradient(180deg,
      ${ACCENT}44 0px, ${ACCENT}44 5px, transparent 5px, transparent 11px)`,
  };
}

// ── Corner handle (L-shape) ───────────────────────────────────────────────────
const CORNER_ARM = 12;
const CORNER_THK = 2;
type CornerPos = "tl" | "tr" | "br" | "bl";

function CornerHandle({ pos }: { pos: CornerPos }) {
  const isTop  = pos === "tl" || pos === "tr";
  const isLeft = pos === "tl" || pos === "bl";
  const OFF    = -1;

  const group: React.CSSProperties = {
    position: "absolute",
    width: CORNER_ARM + CORNER_THK, height: CORNER_ARM + CORNER_THK,
    ...(isTop  ? { top: OFF }    : { bottom: OFF }),
    ...(isLeft ? { left: OFF }   : { right: OFF }),
  };
  const h: React.CSSProperties = {
    position: "absolute",
    height: CORNER_THK, width: CORNER_ARM + CORNER_THK,
    background: ACCENT, boxShadow: `0 0 5px 1px ${ACCENT_GLO}`,
    ...(isTop ? { top: 0 } : { bottom: 0 }), left: 0,
  };
  const v: React.CSSProperties = {
    position: "absolute",
    width: CORNER_THK, height: CORNER_ARM,
    background: ACCENT, boxShadow: `0 0 5px 1px ${ACCENT_GLO}`,
    ...(isTop  ? { top: CORNER_THK }    : { bottom: CORNER_THK }),
    ...(isLeft ? { left: 0 }            : { right: 0 }),
  };
  return <div style={group}><div style={h} /><div style={v} /></div>;
}

// ── Edge handle (filled square) ───────────────────────────────────────────────
const EDGE_SZ   = 7;
const EDGE_HALF = EDGE_SZ / 2;
type EdgePos = "t" | "b" | "l" | "r";

function EdgeHandle({ pos }: { pos: EdgePos }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: EDGE_SZ, height: EDGE_SZ,
    background: ACCENT,
    border: "1.5px solid rgba(255,255,255,0.85)",
    boxShadow: `0 0 6px 1px ${ACCENT_GLO}`,
    borderRadius: 1,
  };
  const p: React.CSSProperties =
    pos === "t" ? { top:    -EDGE_HALF, left: `calc(50% - ${EDGE_HALF}px)` } :
    pos === "b" ? { bottom: -EDGE_HALF, left: `calc(50% - ${EDGE_HALF}px)` } :
    pos === "l" ? { left:   -EDGE_HALF, top:  `calc(50% - ${EDGE_HALF}px)` } :
                  { right:  -EDGE_HALF, top:  `calc(50% - ${EDGE_HALF}px)` };
  return <div style={{ ...base, ...p }} />;
}

// ─── Watermark logo with hover glow ───────────────────────────────────────────
function WatermarkLogo() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        // Smaller than before — 22vw capped at 220px, so it's a tasteful watermark
        width: "min(22vw, 220px)",
        zIndex: 1,
        pointerEvents: "auto",
        userSelect: "none",
        transition: "opacity 0.35s ease, filter 0.35s ease",
        opacity:    hovered ? 0.18 : 0.07,
        filter:     hovered
          ? `drop-shadow(0 0 18px ${ACCENT}) drop-shadow(0 0 40px ${ACCENT_MED})`
          : "none",
      }}
    >
      <img
        src="/veltrix_logo.png"
        alt=""
        draggable={false}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

// ─── Hero content ─────────────────────────────────────────────────────────────
/**
 * All content is inset by PAD_INNER pixels from the absolute edge — this keeps
 * everything visually within the crop frame's border at all viewport sizes.
 *
 * PAD_INNER = frame padding + a comfortable inner margin.
 * We compute it from the same framePad() function so it scales identically.
 */
function HeroContent({
  heroRef,
}: {
  heroRef: React.RefObject<HTMLDivElement | null>;
}) {
  const navigate = useNavigate();
  const WIN_URL  = import.meta.env.VITE_WINDOWS_URL || "#";
  const LIN_URL  = import.meta.env.VITE_LINUX_URL   || "#";

  // Compute inset once on the client; re-render not needed on resize for now.
  const vw     = typeof window !== "undefined" ? window.innerWidth : 1280;
  const pad    = framePad(vw);
  // Inner breathing room on top of frame border
  const INNER  = 28;
  const inset  = pad + INNER;

  return (
    // opacity:0 and pointerEvents:none until CropFrameReveal calls onDone
    <div
      ref={heroRef}
      style={{
        position: "absolute", inset: 0,
        opacity: 0, pointerEvents: "none",
        // All content constrained inside the frame
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: `${inset}px ${inset}px`,
        textAlign: "center",
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      {/* ── Logo + wordmark ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 12, marginBottom: 16 }}>
        {/* Actual logo image — replaces the "V" placeholder */}
        <img
          src="/veltrix_logo.png"
          alt="Veltrix"
          style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
        />
        <span
          className="font-kola"
          style={{
            fontSize: "clamp(26px, 2.8vw, 48px)",
            fontWeight: 900,
            color: "#FFFFFF",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          Veltrix
        </span>
      </div>

      {/* ── Headline ── */}
      <h1
        style={{
          fontSize: "clamp(24px, 3.8vw, 62px)",
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          color: "#FFFFFF",
          marginBottom: 12,
        }}
      >
        Batch Edit.{" "}
        {/* Single accent color — no cyan gradient */}
        <span style={{ color: ACCENT }}>Privately.</span>
      </h1>

      {/* ── Subtext ── */}
      <p
        style={{
          fontSize: "clamp(12px, 1.05vw, 16px)",
          color: "#888899",
          lineHeight: 1.6,
          maxWidth: "36ch",
          marginBottom: 28,
        }}
      >
        Crop, resize, rename, and export — hundreds of files at once,
        instantly, right in your browser.
      </p>

      {/* ── CTA buttons — wider gap, generous padding ── */}
      <div
        style={{
          display: "flex", flexWrap: "wrap",
          alignItems: "center", justifyContent: "center",
          gap: 14,   // increased from 10px
          marginBottom: 32,
        }}
      >
        {/* Try Now — solid accent fill */}
        <button
          onClick={() => navigate("/editor")}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 8,
            padding: "11px 28px",    // generous internal padding
            borderRadius: 10,
            fontSize: "clamp(13px, 1vw, 15px)",
            fontWeight: 700,
            color: "#FFFFFF",
            background: ACCENT,
            border: "none",
            cursor: "pointer",
            boxShadow: `0 4px 22px ${ACCENT_DIM}`,
            transition: "transform 0.18s ease, box-shadow 0.18s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = `0 8px 32px ${ACCENT_MED}`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = `0 4px 22px ${ACCENT_DIM}`;
          }}
        >
          {/* Globe icon */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
               strokeLinecap="round" strokeLinejoin="round"
               style={{ width: 15, height: 15, flexShrink: 0 }} aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
          </svg>
          Try Now
        </button>

        {/* Windows — ghost style, no colored background */}
        <a
          href={WIN_URL} target="_blank" rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 8,
            padding: "10px 24px",
            borderRadius: 10,
            fontSize: "clamp(13px, 1vw, 15px)",
            fontWeight: 600,
            color: "#AAAACC",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            textDecoration: "none",
            transition: "color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#FFFFFF";
            e.currentTarget.style.borderColor = `${ACCENT}88`;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#AAAACC";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor"
               style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true">
            <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
          </svg>
          Windows
        </a>

        {/* Linux — ghost style */}
        <a
          href={LIN_URL} target="_blank" rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 8,
            padding: "10px 24px",
            borderRadius: 10,
            fontSize: "clamp(13px, 1vw, 15px)",
            fontWeight: 600,
            color: "#AAAACC",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            textDecoration: "none",
            transition: "color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#FFFFFF";
            e.currentTarget.style.borderColor = `${ACCENT}88`;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#AAAACC";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor"
               style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true">
            <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.44.134.09.34-.405.48-.595.137-1.13.2-1.386.35-.233.143-.358.46-.305.655a.067.067 0 00.01.03c.12.267.35.48.636.594.286.113.594.14.893.078.6-.124 1.09-.5 1.414-1.024.193-.31.295-.668.3-1.035a.42.42 0 00.05-.197c-.024-.198-.12-.377-.2-.532-.2-.394-.363-.7-.245-1.07.12-.377.458-.68.842-.867.387-.188.82-.275 1.22-.36.395-.08.752-.18 1.047-.39.298-.21.51-.538.516-.945a1.05 1.05 0 00-.147-.53 1.3 1.3 0 00-.448-.43 1.95 1.95 0 00-.61-.23 2.1 2.1 0 00-.618-.029c-.38.034-.726.175-.992.39-.273.218-.457.522-.536.87a.97.97 0 00.024.47.86.86 0 00.267.396l.09.055c.054.026.11.045.166.058a.573.573 0 00.358-.028.6.6 0 00.272-.235.58.58 0 00.1-.337.413.413 0 00-.04-.18.46.46 0 00-.126-.159.528.528 0 00-.21-.088.533.533 0 00-.243.014.573.573 0 00-.217.118.617.617 0 00-.16.22c-.02.056-.031.115-.032.175a.527.527 0 00.038.198z"/>
          </svg>
          Linux
        </a>
      </div>

      {/* ── Horizontal feature list — icon + label, no borders, no backgrounds ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px 20px",
          maxWidth: "100%",
        }}
      >
        {FEATURES.map(({ label, icon }) => (
          <span
            key={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "clamp(10px, 0.82vw, 13px)",
              color: "#68688A",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {/* Icon inherits the muted color */}
            <span style={{ color: "#68688A", display: "flex", alignItems: "center" }}
                  aria-hidden="true">
              {icon}
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Root: StackSpread ────────────────────────────────────────────────────────
export interface StackSpreadProps {
  bgColor?:         string;
  cardRadius?:      number;   // kept for API compat — unused
  stackScale?:      number;   // kept for API compat — unused
  textFadeStart?:   number;   // kept for API compat — unused
  textColor?:       string;
  clusterRotation?: boolean;
  showScrollHint?:  boolean;
}

export default function StackSpread({ bgColor = "#050508" }: StackSpreadProps) {
  const reduce  = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);

  const handleRevealDone = () => {
    const hero = heroRef.current;
    if (!hero) return;
    gsap.to(hero, { opacity: 1, duration: 0.35, ease: "power2.out" });
    hero.style.pointerEvents = "auto";
  };

  return (
    <section
      style={{ position: "relative", width: "100%", height: "100vh", backgroundColor: bgColor }}
      aria-label="Veltrix landing"
    >
      <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>

        {/* Background radial glow */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,106,247,0.055) 0%, transparent 70%)",
          }}
        />

        {/* Watermark logo — smaller, centered, hover-glow (item 4) */}
        <WatermarkLogo />

        {/* Hero content — fades in after crop-frame animation */}
        <HeroContent heroRef={heroRef} />

        {/* Crop frame overlay — stays visible permanently */}
        <CropFrameReveal onDone={handleRevealDone} instant={reduce === true} />

      </div>
    </section>
  );
}
