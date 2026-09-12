/**
 * Veltrix landing — crop-tool reveal intro (mobile-responsive)
 *
 * GSAP animates a crop-selection frame from a small centered box to a
 * padded-inset full-viewport frame, then stops — the frame stays visible
 * permanently as a framing element around the hero content.
 */

import gsap from "gsap";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crop, Maximize2, Gauge, ShieldCheck,
  PackageCheck, Tag, Printer, ScanFace,
} from "lucide-react";

// ─── Color constants ──────────────────────────────────────────────────────────
const FRAME_COLOR   = "#ffffff";
const FRAME_GLO     = "rgba(255,255,255,0.40)";

const UI_ACCENT     = "#7c6af7";
const UI_ACCENT_DIM = "rgba(124,106,247,0.18)";
const UI_ACCENT_MED = "rgba(124,106,247,0.35)";
const UI_ACCENT_88  = "#7c6af788";

// ─── Feature list ─────────────────────────────────────────────────────────────
interface Feature { label: string; icon: React.ReactElement; }

const FEATURES: Feature[] = [
  { label: "Batch Crop",       icon: <Crop         size={13} strokeWidth={2} /> },
  { label: "Perspective Warp", icon: <Maximize2    size={13} strokeWidth={2} /> },
  { label: "Smart Compress",   icon: <Gauge        size={13} strokeWidth={2} /> },
  { label: "Auto Crop",        icon: <ScanFace     size={13} strokeWidth={2} /> },
  { label: "ZIP Export",       icon: <PackageCheck size={13} strokeWidth={2} /> },
  { label: "Bulk Rename",      icon: <Tag          size={13} strokeWidth={2} /> },
  { label: "Print Studio",     icon: <Printer      size={13} strokeWidth={2} /> },
  { label: "Non-Destructive",  icon: <ShieldCheck  size={13} strokeWidth={2} /> },
];

// ─── Viewport helpers ─────────────────────────────────────────────────────────
/**
 * Frame inset from the edge.  Portrait-mobile gets a tighter pad so the
 * frame doesn't eat too much of the narrow screen.
 */
function framePad(vw: number, vh: number): number {
  const portrait = vh > vw;
  const min = portrait ? 12 : 16;
  const max = portrait ? 28 : 44;
  return Math.round(Math.min(max, Math.max(min, vw * (portrait ? 0.032 : 0.026))));
}

/** True viewport height that excludes mobile browser chrome. */
function viewportH(): number {
  // window.visualViewport.height is the most reliable on mobile;
  // fall back to innerHeight.
  if (typeof window === "undefined") return 800;
  return window.visualViewport?.height ?? window.innerHeight;
}
function viewportW(): number {
  if (typeof window === "undefined") return 1280;
  return window.innerWidth;
}

/** Reactive viewport dimensions — re-reads on resize / orientation change. */
function useViewport() {
  const [size, setSize] = useState({ vw: viewportW(), vh: viewportH() });
  useEffect(() => {
    const update = () => setSize({ vw: viewportW(), vh: viewportH() });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return size;
}

// ─── CropFrameReveal ──────────────────────────────────────────────────────────
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
  // Individual refs for each thirds line so GSAP sets pixel positions directly
  const th1Ref = useRef<HTMLDivElement>(null); // horizontal 1/3
  const th2Ref = useRef<HTMLDivElement>(null); // horizontal 2/3
  const tv1Ref = useRef<HTMLDivElement>(null); // vertical   1/3
  const tv2Ref = useRef<HTMLDivElement>(null); // vertical   2/3
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
    const th1       = th1Ref.current;
    const th2       = th2Ref.current;
    const tv1       = tv1Ref.current;
    const tv2       = tv2Ref.current;
    const crosshair = crosshairRef.current;

    if (!overlay || !frame || !dimTop || !dimBot || !dimLeft || !dimRight
        || !handles || !th1 || !th2 || !tv1 || !tv2 || !crosshair) return;

    const vw  = viewportW();
    const vh  = viewportH();
    const pad = framePad(vw, vh);
    const smaller = Math.min(vw, vh);

    // Initial small frame
    const initW = smaller * 0.30;
    const initH = initW * 0.55;
    const initL = (vw - initW) / 2;
    const initT = (vh - initH) / 2;

    gsap.set(frame, { left: initL, top: initT, width: initW, height: initH });
    gsap.set(dimTop,   { top: 0,             left: 0, width: vw, height: initT });
    gsap.set(dimBot,   { top: initT + initH, left: 0, width: vw, height: vh - initT - initH });
    gsap.set(dimLeft,  { top: initT, left: 0,             width: initL,              height: initH });
    gsap.set(dimRight, { top: initT, left: initL + initW, width: vw - initL - initW, height: initH });

    // Grid lines — initial pixel positions derived from the initial frame bounds.
    // Horizontal lines span the full width of the frame; positioned absolutely
    // inside the overlay (not inside the frame div) so their positions are
    // independent of the frame's own box model and any GSAP inline style quirks.
    // top = frame top + (1/3 or 2/3) * frame height
    // left = frame left, width = frame width, height = 1px
    gsap.set(th1, { position: "absolute", top: initT + initH / 3,       left: initL, width: initW, height: 1 });
    gsap.set(th2, { position: "absolute", top: initT + (initH * 2) / 3, left: initL, width: initW, height: 1 });
    // Vertical lines span the full height of the frame
    // left = frame left + (1/3 or 2/3) * frame width
    // top = frame top, height = frame height, width = 1px
    gsap.set(tv1, { position: "absolute", left: initL + initW / 3,       top: initT, height: initH, width: 1 });
    gsap.set(tv2, { position: "absolute", left: initL + (initW * 2) / 3, top: initT, height: initH, width: 1 });

    // Final padded bounds
    const finalL = pad;
    const finalT = pad;
    const finalW = vw - pad * 2;
    const finalH = vh - pad * 2;

    if (instant) {
      gsap.set(frame,     { left: finalL, top: finalT, width: finalW, height: finalH });
      gsap.set(dimTop,    { height: 0 });
      gsap.set(dimBot,    { top: vh, height: 0 });
      gsap.set(dimLeft,   { width: 0 });
      gsap.set(dimRight,  { left: vw, width: 0 });
      gsap.set(crosshair, { opacity: 0 });
      // Set grid lines to final positions
      gsap.set(th1, { top: finalT + finalH / 3,       left: finalL, width: finalW });
      gsap.set(th2, { top: finalT + (finalH * 2) / 3, left: finalL, width: finalW });
      gsap.set(tv1, { left: finalL + finalW / 3,       top: finalT, height: finalH });
      gsap.set(tv2, { left: finalL + (finalW * 2) / 3, top: finalT, height: finalH });
      [dimTop, dimBot, dimLeft, dimRight].forEach(el => { el.style.display = "none"; });
      onDone();
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        [dimTop, dimBot, dimLeft, dimRight].forEach(el => { el.style.display = "none"; });
        onDone();
      },
    });
    tlRef.current = tl;

    const dur  = 1.2;
    const ease = "power3.inOut";

    tl.to(frame,    { left: finalL, top: finalT, width: finalW, height: finalH, duration: dur, ease }, 0);
    tl.to(dimTop,   { height: 0,            duration: dur, ease }, 0);
    tl.to(dimBot,   { top: vh, height: 0,   duration: dur, ease }, 0);
    tl.to(dimLeft,  { width: 0,             duration: dur, ease }, 0);
    tl.to(dimRight, { left: vw, width: 0,   duration: dur, ease }, 0);
    // Animate grid lines to their final pixel positions in sync with the frame
    tl.to(th1, { top: finalT + finalH / 3,       left: finalL, width: finalW, duration: dur, ease }, 0);
    tl.to(th2, { top: finalT + (finalH * 2) / 3, left: finalL, width: finalW, duration: dur, ease }, 0);
    tl.to(tv1, { left: finalL + finalW / 3,       top: finalT, height: finalH, duration: dur, ease }, 0);
    tl.to(tv2, { left: finalL + (finalW * 2) / 3, top: finalT, height: finalH, duration: dur, ease }, 0);
    tl.to(crosshair, { opacity: 0, duration: 0.45, ease: "power2.in" }, 0.70);

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
      style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none" }}
    >
      <div ref={dimTopRef}   style={dimPanelStyle} />
      <div ref={dimBotRef}   style={dimPanelStyle} />
      <div ref={dimLeftRef}  style={dimPanelStyle} />
      <div ref={dimRightRef} style={dimPanelStyle} />

      {/* Rule-of-thirds grid lines — positioned directly in the overlay (not
          inside the frame div) so GSAP pixel positions are unambiguous and
          never subject to percentage resolution inside a runtime-sized box. */}
      <div ref={th1Ref} style={gridLineHStyle} />
      <div ref={th2Ref} style={gridLineHStyle} />
      <div ref={tv1Ref} style={gridLineVStyle} />
      <div ref={tv2Ref} style={gridLineVStyle} />

      <div
        ref={frameRef}
        style={{
          position: "absolute",
          boxSizing: "border-box",
          border: `1.4px solid ${FRAME_COLOR}`,
          boxShadow: `0 0 0 1px ${FRAME_COLOR}22, 0 0 20px 2px ${FRAME_COLOR}14`,
        }}
      >
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

        <div
          ref={crosshairRef}
          style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ position: "absolute", width: 14, height: 1, background: FRAME_COLOR, opacity: 0.85 }} />
          <div style={{ position: "absolute", width: 1, height: 14, background: FRAME_COLOR, opacity: 0.85 }} />
          <div style={{ width: 3, height: 3, borderRadius: "50%", background: FRAME_COLOR,
                        boxShadow: `0 0 6px 2px ${FRAME_GLO}` }} />
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

// Grid line base styles — geometry (top/left/width/height) set entirely by GSAP
const DASH = `repeating-linear-gradient(90deg,
  ${FRAME_COLOR}44 0px, ${FRAME_COLOR}44 5px, transparent 5px, transparent 11px)`;
const DASH_V = `repeating-linear-gradient(180deg,
  ${FRAME_COLOR}44 0px, ${FRAME_COLOR}44 5px, transparent 5px, transparent 11px)`;

const gridLineHStyle: React.CSSProperties = {
  position: "absolute",
  height: "1px",
  pointerEvents: "none",
  backgroundImage: DASH,
};
const gridLineVStyle: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  pointerEvents: "none",
  backgroundImage: DASH_V,
};

// ── Corner handle ─────────────────────────────────────────────────────────────
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
    ...(isTop  ? { top: OFF }  : { bottom: OFF }),
    ...(isLeft ? { left: OFF } : { right: OFF }),
  };
  const h: React.CSSProperties = {
    position: "absolute",
    height: CORNER_THK, width: CORNER_ARM + CORNER_THK,
    background: FRAME_COLOR, boxShadow: `0 0 5px 1px ${FRAME_GLO}`,
    ...(isTop ? { top: 0 } : { bottom: 0 }), left: 0,
  };
  const v: React.CSSProperties = {
    position: "absolute",
    width: CORNER_THK, height: CORNER_ARM,
    background: FRAME_COLOR, boxShadow: `0 0 5px 1px ${FRAME_GLO}`,
    ...(isTop  ? { top: CORNER_THK }  : { bottom: CORNER_THK }),
    ...(isLeft ? { left: 0 }          : { right: 0 }),
  };
  return <div style={group}><div style={h} /><div style={v} /></div>;
}

// ── Edge handle ───────────────────────────────────────────────────────────────
const EDGE_SZ   = 7;
const EDGE_HALF = EDGE_SZ / 2;
type EdgePos = "t" | "b" | "l" | "r";

function EdgeHandle({ pos }: { pos: EdgePos }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: EDGE_SZ, height: EDGE_SZ,
    background: FRAME_COLOR,
    border: "1.5px solid rgba(255,255,255,0.85)",
    boxShadow: `0 0 6px 1px ${FRAME_GLO}`,
    borderRadius: 1,
  };
  const p: React.CSSProperties =
    pos === "t" ? { top:    -EDGE_HALF, left: `calc(50% - ${EDGE_HALF}px)` } :
    pos === "b" ? { bottom: -EDGE_HALF, left: `calc(50% - ${EDGE_HALF}px)` } :
    pos === "l" ? { left:   -EDGE_HALF, top:  `calc(50% - ${EDGE_HALF}px)` } :
                  { right:  -EDGE_HALF, top:  `calc(50% - ${EDGE_HALF}px)` };
  return <div style={{ ...base, ...p }} />;
}

// ─── Watermark logo ───────────────────────────────────────────────────────────
function WatermarkLogo({ vw }: { vw: number }) {
  const [hovered, setHovered] = useState(false);
  // Scale down watermark on portrait mobile so it doesn't dominate
  const size = vw < 480 ? "min(72vw, 300px)" : "min(55vw, 520px)";
  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: size,
        zIndex: 1,
        pointerEvents: "auto",
        userSelect: "none",
        transition: "opacity 0.35s ease, filter 0.35s ease",
        opacity: hovered ? 0.18 : 0.07,
        filter: hovered
          ? `drop-shadow(0 0 18px ${UI_ACCENT}) drop-shadow(0 0 40px ${UI_ACCENT_MED})`
          : "none",
      }}
    >
      <img src="/veltrix_logo.png" alt="" draggable={false}
           style={{ width: "100%", height: "auto", display: "block" }} />
    </div>
  );
}

// ─── Hero content ─────────────────────────────────────────────────────────────
function HeroContent({
  heroRef,
  vw,
  vh,
}: {
  heroRef: React.RefObject<HTMLDivElement | null>;
  vw: number;
  vh: number;
}) {
  const navigate = useNavigate();
  const WIN_URL  = import.meta.env.VITE_WINDOWS_URL || "#";
  const LIN_URL  = import.meta.env.VITE_LINUX_URL   || "#";

  const isSmall  = vw < 480;   // phone portrait
  const isMedium = vw < 768;   // tablet / large phone

  const pad   = framePad(vw, vh);
  // Inner margin inside the frame — tighter on small screens
  const inner = isSmall ? 16 : isMedium ? 20 : 28;
  const inset = pad + inner;

  // Vertical rhythm — shrink spacing so everything fits in the frame height
  const mb1 = isSmall ? 10 : 14;   // logo → headline gap
  const mb2 = isSmall ?  8 : 10;   // headline → subtext gap
  const mb3 = isSmall ? 18 : 24;   // subtext → buttons gap
  const mb4 = isSmall ? 18 : 26;   // buttons → feature list gap

  return (
    <div
      ref={heroRef}
      style={{
        position: "absolute", inset: 0,
        opacity: 0, pointerEvents: "none",
        zIndex: 10,
        // Use a scroll container inside the frame so content never clips
        // on very constrained screens (e.g. small phone in landscape)
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        // Symmetric inset keeps content within the frame border
        padding: `${inset}px`,
        textAlign: "center",
        // Allow scroll only when content genuinely overflows
        overflowY: "auto",
        overflowX: "hidden",
        // Hide scrollbar visually — it's an emergency escape hatch not UI
        scrollbarWidth: "none",
      }}
    >
      {/* ── Logo + wordmark ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: isSmall ? 8 : 12,
        marginBottom: mb1,
        flexShrink: 0,
      }}>
        <img
          src="/veltrix_logo.png"
          alt="Veltrix"
          style={{
            width:  isSmall ? 28 : 36,
            height: isSmall ? 28 : 36,
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
        <span
          className="font-kola"
          style={{
            fontSize: isSmall ? 28 : "clamp(26px, 2.8vw, 48px)",
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
          fontSize: isSmall ? "clamp(22px, 7vw, 32px)" : "clamp(24px, 3.8vw, 62px)",
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          color: "#FFFFFF",
          marginBottom: mb2,
          flexShrink: 0,
        }}
      >
        Batch Edit.{" "}
        <span style={{ color: UI_ACCENT }}>Privately.</span>
      </h1>

      {/* ── Subtext ── */}
      <p
        style={{
          fontSize: isSmall ? 13 : "clamp(12px, 1.05vw, 16px)",
          color: "#888899",
          lineHeight: 1.55,
          maxWidth: isSmall ? "28ch" : "36ch",
          marginBottom: mb3,
          flexShrink: 0,
        }}
      >
        Crop, resize, rename, and export — hundreds of files at once,
        instantly, right in your browser.
      </p>

      {/* ── CTA buttons ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          // On very small screens stack buttons vertically for readability
          flexDirection: isSmall ? "column" : "row",
          gap: isSmall ? 10 : 12,
          marginBottom: mb4,
          flexShrink: 0,
          width: "100%",
        }}
      >
        {/* Try Now — always shown */}
        <button
          onClick={() => navigate("/editor")}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 8,
            // Full-width on tiny screens, auto on larger ones
            width: isSmall ? "100%" : "auto",
            padding: isSmall ? "12px 0" : "11px 28px",
            borderRadius: 10,
            fontSize: isSmall ? 15 : "clamp(13px, 1vw, 15px)",
            fontWeight: 700,
            color: "#FFFFFF",
            background: UI_ACCENT,
            border: "none",
            cursor: "pointer",
            boxShadow: `0 4px 22px ${UI_ACCENT_DIM}`,
            transition: "transform 0.18s ease, box-shadow 0.18s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = `0 8px 32px ${UI_ACCENT_MED}`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = `0 4px 22px ${UI_ACCENT_DIM}`;
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
               strokeLinecap="round" strokeLinejoin="round"
               style={{ width: 15, height: 15, flexShrink: 0 }} aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
          </svg>
          Try Now
        </button>

        {/* Windows + Linux — hidden on smallest phones to avoid crowding */}
        {!isSmall && (
          <>
            <a
              href={WIN_URL} target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                gap: 8,
                padding: isMedium ? "9px 18px" : "10px 24px",
                borderRadius: 10,
                fontSize: isMedium ? 13 : "clamp(13px, 1vw, 15px)",
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
                e.currentTarget.style.borderColor = UI_ACCENT_88;
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

            <a
              href={LIN_URL} target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                gap: 8,
                padding: isMedium ? "9px 18px" : "10px 24px",
                borderRadius: 10,
                fontSize: isMedium ? 13 : "clamp(13px, 1vw, 15px)",
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
                e.currentTarget.style.borderColor = UI_ACCENT_88;
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
          </>
        )}
      </div>

      {/* ── Horizontal feature list — icon + label, no borders ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          // Tighter row gap on mobile so the list fits in two rows
          gap: isSmall ? "6px 14px" : "8px 20px",
          maxWidth: "100%",
          flexShrink: 0,
        }}
      >
        {FEATURES.map(({ label, icon }) => (
          <span
            key={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: isSmall ? 11 : "clamp(10px, 0.82vw, 13px)",
              color: "#68688A",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
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

// ─── Root ─────────────────────────────────────────────────────────────────────
export interface StackSpreadProps {
  bgColor?:         string;
  cardRadius?:      number;
  stackScale?:      number;
  textFadeStart?:   number;
  textColor?:       string;
  clusterRotation?: boolean;
  showScrollHint?:  boolean;
}

export default function StackSpread({ bgColor = "#050508" }: StackSpreadProps) {
  const reduce       = useReducedMotion();
  const heroRef      = useRef<HTMLDivElement>(null);
  const { vw, vh }   = useViewport();

  const handleRevealDone = () => {
    const hero = heroRef.current;
    if (!hero) return;
    gsap.to(hero, { opacity: 1, duration: 0.35, ease: "power2.out" });
    hero.style.pointerEvents = "auto";
  };

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh" as React.CSSProperties["height"],
        backgroundColor: bgColor,
      }}
    >
      {/* Inner wrapper matches the section height exactly */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Background radial glow */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,106,247,0.055) 0%, transparent 70%)",
          }}
        />

        {/* Watermark */}
        <WatermarkLogo vw={vw} />

        {/* Hero — fades in after animation */}
        <HeroContent heroRef={heroRef} vw={vw} vh={vh} />

        {/* Crop frame — stays permanently */}
        <CropFrameReveal onDone={handleRevealDone} instant={reduce === true} />
      </div>
    </section>
  );
}
