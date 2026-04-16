"use client";

/**
 * Retro 8-bit animated background — little cars drive across the screen
 * eating Portuguese things (pastel de nata, coffee, wine, sardine).
 * Pure CSS animations + inline SVG. Kept at low opacity so the form
 * on top stays fully readable.
 */

// Tiny pixel-art SVGs (crisp edges, flat colours, 16x16 grid)
const shapeRendering = { shapeRendering: "crispEdges" as const };

function PastelDeNata() {
  return (
    <svg width="32" height="32" viewBox="0 0 16 16" style={shapeRendering}>
      {/* Cup */}
      <rect x="2" y="6" width="12" height="2" fill="#d4a373" />
      <rect x="3" y="8" width="10" height="4" fill="#e6c79c" />
      <rect x="4" y="12" width="8" height="1" fill="#b08968" />
      {/* Custard top */}
      <rect x="3" y="4" width="10" height="2" fill="#ffd166" />
      <rect x="4" y="3" width="8" height="1" fill="#ffe38a" />
      {/* Burn marks */}
      <rect x="5" y="4" width="1" height="1" fill="#8b4513" />
      <rect x="9" y="4" width="1" height="1" fill="#8b4513" />
    </svg>
  );
}

function CoffeeCup() {
  return (
    <svg width="32" height="32" viewBox="0 0 16 16" style={shapeRendering}>
      {/* Saucer */}
      <rect x="1" y="13" width="14" height="1" fill="#d0d0d0" />
      <rect x="2" y="14" width="12" height="1" fill="#a0a0a0" />
      {/* Cup */}
      <rect x="4" y="7" width="8" height="6" fill="#ffffff" stroke="#333" strokeWidth="0.3" />
      <rect x="4" y="7" width="8" height="2" fill="#5c2a0e" />
      {/* Handle */}
      <rect x="12" y="9" width="2" height="2" fill="#ffffff" />
      <rect x="13" y="9" width="1" height="2" fill="#333" />
      {/* Steam */}
      <rect x="6" y="4" width="1" height="2" fill="#ddd" opacity="0.6" />
      <rect x="9" y="3" width="1" height="3" fill="#ddd" opacity="0.6" />
    </svg>
  );
}

function WineGlass() {
  return (
    <svg width="32" height="32" viewBox="0 0 16 16" style={shapeRendering}>
      {/* Wine */}
      <rect x="4" y="3" width="8" height="5" fill="#722f37" />
      <rect x="5" y="2" width="6" height="1" fill="#8b3a42" />
      {/* Glass bowl */}
      <rect x="3" y="2" width="1" height="6" fill="#cce" />
      <rect x="12" y="2" width="1" height="6" fill="#cce" />
      <rect x="4" y="8" width="8" height="1" fill="#cce" />
      {/* Stem */}
      <rect x="7" y="9" width="2" height="4" fill="#cce" />
      {/* Base */}
      <rect x="4" y="13" width="8" height="1" fill="#cce" />
    </svg>
  );
}

function Sardine() {
  return (
    <svg width="36" height="32" viewBox="0 0 18 16" style={shapeRendering}>
      {/* Body */}
      <rect x="2" y="6" width="12" height="4" fill="#9ec5e8" />
      <rect x="3" y="5" width="10" height="1" fill="#7fa8cc" />
      <rect x="3" y="10" width="10" height="1" fill="#7fa8cc" />
      {/* Stripes */}
      <rect x="5" y="7" width="1" height="2" fill="#4a7a9a" />
      <rect x="8" y="7" width="1" height="2" fill="#4a7a9a" />
      <rect x="11" y="7" width="1" height="2" fill="#4a7a9a" />
      {/* Tail */}
      <rect x="14" y="5" width="2" height="6" fill="#7fa8cc" />
      <rect x="16" y="6" width="1" height="4" fill="#4a7a9a" />
      {/* Eye */}
      <rect x="3" y="7" width="1" height="1" fill="#000" />
    </svg>
  );
}

function Car({ colour }: { colour: string }) {
  return (
    <svg width="60" height="32" viewBox="0 0 30 16" style={shapeRendering}>
      {/* Body */}
      <rect x="2" y="7" width="26" height="5" fill={colour} />
      {/* Roof */}
      <rect x="8" y="3" width="14" height="4" fill={colour} />
      {/* Windows */}
      <rect x="9" y="4" width="5" height="3" fill="#b3e0ff" />
      <rect x="16" y="4" width="5" height="3" fill="#b3e0ff" />
      {/* Headlight */}
      <rect x="0" y="8" width="2" height="2" fill="#fff7ae" />
      {/* Taillight */}
      <rect x="28" y="8" width="2" height="2" fill="#ff4444" />
      {/* Wheels */}
      <rect x="4" y="12" width="4" height="3" fill="#222" />
      <rect x="22" y="12" width="4" height="3" fill="#222" />
      <rect x="5" y="13" width="2" height="1" fill="#888" />
      <rect x="23" y="13" width="2" height="1" fill="#888" />
    </svg>
  );
}

export default function RetroBackground() {
  return (
    <div className="retro-bg" aria-hidden="true">
      {/* Track 1 — top */}
      <div className="track track-1">
        <div className="food food-1"><PastelDeNata /></div>
        <div className="food food-2"><CoffeeCup /></div>
        <div className="car car-1"><Car colour="#e63946" /></div>
      </div>

      {/* Track 2 — upper-middle */}
      <div className="track track-2">
        <div className="food food-3"><WineGlass /></div>
        <div className="food food-4"><Sardine /></div>
        <div className="car car-2"><Car colour="#457b9d" /></div>
      </div>

      {/* Track 3 — lower-middle */}
      <div className="track track-3">
        <div className="food food-5"><CoffeeCup /></div>
        <div className="food food-6"><PastelDeNata /></div>
        <div className="car car-3"><Car colour="#f4a261" /></div>
      </div>

      {/* Track 4 — bottom */}
      <div className="track track-4">
        <div className="food food-7"><Sardine /></div>
        <div className="food food-8"><WineGlass /></div>
        <div className="car car-4"><Car colour="#2a9d8f" /></div>
      </div>

      <style jsx>{`
        .retro-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          opacity: 0.25;
          z-index: 0;
        }

        .track {
          position: absolute;
          left: 0;
          right: 0;
          height: 40px;
        }
        .track-1 { top: 8%; }
        .track-2 { top: 32%; }
        .track-3 { top: 58%; }
        .track-4 { top: 82%; }

        .car {
          position: absolute;
          left: -80px;
          top: 0;
          animation-name: drive;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .car-1 { animation-duration: 22s; animation-delay: 0s; }
        .car-2 { animation-duration: 28s; animation-delay: -5s; }
        .car-3 { animation-duration: 25s; animation-delay: -12s; }
        .car-4 { animation-duration: 30s; animation-delay: -8s; }

        @keyframes drive {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(100vw + 80px)); }
        }

        .food {
          position: absolute;
          top: 4px;
          animation-timing-function: steps(1, end);
          animation-iteration-count: infinite;
        }

        /* Each food fades out when the car is ~over it, reappears for next loop.
           The "eaten window" is approx 5% of the loop so it matches the car pass. */
        @keyframes eaten-22 {
          0%, 27%  { opacity: 1; }
          28%, 33% { opacity: 0; }
          34%, 100%{ opacity: 1; }
        }
        @keyframes eaten-22-late {
          0%, 60%  { opacity: 1; }
          61%, 66% { opacity: 0; }
          67%, 100%{ opacity: 1; }
        }
        @keyframes eaten-28 {
          0%, 30%  { opacity: 1; }
          31%, 36% { opacity: 0; }
          37%, 100%{ opacity: 1; }
        }
        @keyframes eaten-28-late {
          0%, 65%  { opacity: 1; }
          66%, 71% { opacity: 0; }
          72%, 100%{ opacity: 1; }
        }
        @keyframes eaten-25 {
          0%, 25%  { opacity: 1; }
          26%, 31% { opacity: 0; }
          32%, 100%{ opacity: 1; }
        }
        @keyframes eaten-25-late {
          0%, 55%  { opacity: 1; }
          56%, 61% { opacity: 0; }
          62%, 100%{ opacity: 1; }
        }
        @keyframes eaten-30 {
          0%, 28%  { opacity: 1; }
          29%, 34% { opacity: 0; }
          35%, 100%{ opacity: 1; }
        }
        @keyframes eaten-30-late {
          0%, 63%  { opacity: 1; }
          64%, 69% { opacity: 0; }
          70%, 100%{ opacity: 1; }
        }

        .food-1 { left: 28%; animation: eaten-22 22s infinite; }
        .food-2 { left: 62%; animation: eaten-22-late 22s infinite; }
        .food-3 { left: 32%; animation: eaten-28 28s infinite -5s; }
        .food-4 { left: 68%; animation: eaten-28-late 28s infinite -5s; }
        .food-5 { left: 26%; animation: eaten-25 25s infinite -12s; }
        .food-6 { left: 56%; animation: eaten-25-late 25s infinite -12s; }
        .food-7 { left: 30%; animation: eaten-30 30s infinite -8s; }
        .food-8 { left: 64%; animation: eaten-30-late 30s infinite -8s; }

        @media (prefers-reduced-motion: reduce) {
          .retro-bg { display: none; }
        }
      `}</style>
    </div>
  );
}
