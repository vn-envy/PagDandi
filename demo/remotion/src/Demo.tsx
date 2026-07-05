import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const FPS = 30;
const BG = "#0a0a0a";
const INK = "#f5f5f4";
const MUTED = "#a8a29e";
const RED = "#dc2626";

// ————— timing (frames) —————
const T = {
  title: [0, 150],
  map: [150, 480],
  sathi: [480, 840],
  bhasha: [840, 1140],
  lens: [1140, 1380],
  sos: [1380, 1710],
  close: [1710, 1800],
} as const;

const seg = (k: keyof typeof T) => ({ from: T[k][0], durationInFrames: T[k][1] - T[k][0] });

// ————— shared bits —————
const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(1200px 800px at 70% 30%, rgba(255,255,255,0.05), transparent 60%), radial-gradient(900px 700px at 20% 80%, rgba(255,255,255,0.03), transparent 55%)",
    }}
  />
);

const Phone: React.FC<{ src: string; startFrom?: number; endAt?: number; still?: boolean; accent?: string }> = ({
  src,
  startFrom = 0,
  endAt,
  still,
  accent = "rgba(255,255,255,0.14)",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, stiffness: 80 } });
  const w = 384;
  const h = 830;
  return (
    <div
      style={{
        position: "absolute",
        right: 150,
        top: "50%",
        transform: `translateY(-50%) translateY(${(1 - enter) * 60}px) scale(${0.97 + enter * 0.03})`,
        opacity: enter,
        width: w + 28,
        height: h + 28,
        borderRadius: 58,
        background: "#18181b",
        border: `1px solid ${accent}`,
        boxShadow: "0 40px 120px rgba(0,0,0,0.65), inset 0 0 0 2px rgba(255,255,255,0.05)",
        padding: 14,
      }}
    >
      <div style={{ width: w, height: h, borderRadius: 44, overflow: "hidden", background: "#000" }}>
        {still ? (
          <img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <OffthreadVideo
            src={staticFile(src)}
            startFrom={startFrom}
            endAt={endAt}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
      {/* notch */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
          width: 110,
          height: 26,
          borderRadius: 16,
          background: "#000",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />
    </div>
  );
};

const Caption: React.FC<{ kicker: string; title: string; lines: string[]; accent?: string }> = ({
  kicker,
  title,
  lines,
  accent = INK,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 90 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: "50%",
        transform: "translateY(-50%)",
        width: 900,
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div
        style={{
          opacity: a(0),
          transform: `translateY(${(1 - a(0)) * 24}px)`,
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 26,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: accent === INK ? MUTED : accent,
          marginBottom: 28,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          opacity: a(6),
          transform: `translateY(${(1 - a(6)) * 24}px)`,
          fontSize: 76,
          lineHeight: 1.08,
          color: INK,
          fontWeight: 700,
          marginBottom: 36,
          letterSpacing: -1,
        }}
      >
        {title}
      </div>
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            opacity: a(14 + i * 5),
            transform: `translateY(${(1 - a(14 + i * 5)) * 18}px)`,
            fontSize: 34,
            lineHeight: 1.5,
            color: MUTED,
            fontFamily: "Helvetica Neue, Arial, sans-serif",
            fontWeight: 400,
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
};

const Fade: React.FC<{ children: React.ReactNode; durationInFrames: number }> = ({
  children,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// ————— scenes —————
const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = (d: number) => spring({ frame: frame - d, fps, config: { damping: 200, stiffness: 80 } });
  const planeX = interpolate(frame, [20, 130], [-60, 60], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", fontFamily: "Georgia, serif" }}>
        <div
          style={{
            opacity: a(0),
            fontSize: 30,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: MUTED,
            fontFamily: "ui-monospace, Menlo, monospace",
            marginBottom: 30,
          }}
        >
          ✈ Airplane mode&nbsp;&nbsp;ON
        </div>
        <div
          style={{
            opacity: a(8),
            transform: `translateY(${(1 - a(8)) * 30}px) translateX(${planeX * 0}px)`,
            fontSize: 150,
            fontWeight: 700,
            color: INK,
            letterSpacing: -3,
          }}
        >
          PagDandi <span style={{ fontWeight: 400, color: MUTED }}>पगडंडी</span>
        </div>
        <div
          style={{
            opacity: a(20),
            fontSize: 44,
            color: MUTED,
            marginTop: 26,
            fontFamily: "Helvetica Neue, Arial, sans-serif",
          }}
        >
          An offline sherpa in your pocket — powered by Gemma&nbsp;4&nbsp;E4B, on device
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = (d: number) => spring({ frame: frame - d, fps, config: { damping: 200, stiffness: 80 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", fontFamily: "Georgia, serif" }}>
        <div style={{ opacity: a(0), fontSize: 76, color: INK, fontWeight: 700, letterSpacing: -1 }}>
          No signal. No server.
        </div>
        <div style={{ opacity: a(10), fontSize: 76, color: INK, fontWeight: 700, letterSpacing: -1 }}>
          The trail is the network.
        </div>
        <div
          style={{
            opacity: a(24),
            fontSize: 30,
            color: MUTED,
            marginTop: 44,
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: 2,
          }}
        >
          PagDandi · open source · MIT · Gemma 4 E4B + FunctionGemma + EmbeddingGemma
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Demo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Grain />

      <Sequence {...seg("title")}>
        <Fade durationInFrames={seg("title").durationInFrames}>
          <Title />
        </Fade>
      </Sequence>

      <Sequence {...seg("map")}>
        <Fade durationInFrames={seg("map").durationInFrames}>
          <Caption
            kicker="01 · Trek Pack"
            title="One download. A whole trail."
            lines={[
              "Offline PMTiles vector map, elevation profile,",
              "POIs and a flora almanac — one file bundle.",
              "Everything on screen works in airplane mode.",
            ]}
          />
          <Phone src="map.mp4" startFrom={2 * FPS} />
        </Fade>
      </Sequence>

      <Sequence {...seg("sathi")}>
        <Fade durationInFrames={seg("sathi").durationInFrames}>
          <Caption
            kicker="02 · Trail Sathi"
            title="“Can I make the top before sunset?”"
            lines={[
              "Gemma 4 E4B natively calls local trek tools —",
              "remaining_ascent() and sunset_time() — then answers",
              "with real numbers, not vibes.",
            ]}
          />
          <Phone src="sathi.mp4" startFrom={1 * FPS} />
        </Fade>
      </Sequence>

      <Sequence {...seg("bhasha")}>
        <Fade durationInFrames={seg("bhasha").durationInFrames}>
          <Caption
            kicker="03 · Bhasha Bridge"
            title="Speak to the shepherd."
            lines={[
              "Speech in → Gemma audio transcription + translation →",
              "spoken out. English · हिन्दी · नेपाली · Français.",
              "16 kHz audio, all on device.",
            ]}
          />
          <Phone src="bhasha.mp4" startFrom={2 * FPS} />
        </Fade>
      </Sequence>

      <Sequence {...seg("lens")}>
        <Fade durationInFrames={seg("lens").durationInFrames}>
          <Caption
            kicker="04 · Prakriti Lens"
            title="Point. Ask the mountain."
            lines={[
              "Gemma vision, grounded by the same trek tools —",
              "peaks, flora and fauna with altitude-aware context.",
            ]}
          />
          <Phone src="lens.mp4" startFrom={0} />
        </Fade>
      </Sequence>

      <Sequence {...seg("sos")}>
        <Fade durationInFrames={seg("sos").durationInFrames}>
          <Caption
            kicker="05 · Humsafar SOS"
            title="A beacon, not a prayer."
            lines={[
              "Peer dots over local radio. An SOS floods the mesh,",
              "and Gemma writes the rescue brief — ETA, bearing,",
              "hazards — as schema-constrained JSON.",
            ]}
            accent={RED}
          />
          <Phone src="sos.mp4" startFrom={4 * FPS} accent="rgba(220,38,38,0.45)" />
        </Fade>
      </Sequence>

      <Sequence {...seg("close")}>
        <Fade durationInFrames={seg("close").durationInFrames}>
          <Close />
        </Fade>
      </Sequence>
    </AbsoluteFill>
  );
};
