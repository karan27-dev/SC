import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "framer-motion";

export const pct = (v, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
export const riskColor = { high: "var(--high)", medium: "var(--medium)", low: "var(--low)" };

export const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};
export const stagger = (i) => ({ ...fadeUp, transition: { duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] } });

export function PageHead({ index, eyebrow, title, sub, children }) {
  return (
    <motion.header className="page-head" {...stagger(0)}>
      <div>
        <div className="eyebrow">{index} — {eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </motion.header>
  );
}

export function Card({ children, className = "", i = 1, ...rest }) {
  return <motion.section className={`card ${className}`} {...stagger(i)} {...rest}>{children}</motion.section>;
}

export function CardHead({ eyebrow, title, children }) {
  return (
    <div className="card-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        {title && <h3 className="card-title">{title}</h3>}
      </div>
      {children}
    </div>
  );
}

export function CountUp({ value, decimals = 0, suffix = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView || value == null) return;
    const c = animate(from.current, value, {
      duration: from.current === 0 ? 1.1 : 0.5, ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => { from.current = n; setV(n); },
    });
    return () => c.stop();
  }, [value, inView]);
  return <span ref={ref} className="num">{v.toFixed(decimals)}{suffix}</span>;
}

export function RiskBadge({ risk }) {
  if (!risk) return <span className="badge neutral">—</span>;
  return <span className={`badge ${risk}`}>{risk}</span>;
}

export function ProbBar({ value }) {
  const color = value < 0.4 ? "var(--high)" : value < 0.7 ? "var(--medium)" : "var(--low)";
  return <div className="prob-bar"><i style={{ width: `${value * 100}%`, background: color }} /></div>;
}

/** Semi-circular gauge for pass probability. */
export function Gauge({ value, size = 220, label = "pass probability", dark = false }) {
  const r = size / 2 - 14;
  const c = Math.PI * r;
  const color = value < 0.4 ? "var(--high)" : value < 0.7 ? "var(--medium)" : dark ? "var(--mint)" : "var(--green)";
  return (
    <div style={{ position: "relative", width: size, height: size / 2 + 22 }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path d={`M14 ${size / 2} A${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none"
          stroke={dark ? "rgba(255,255,255,.1)" : "var(--paper-2)"} strokeWidth="14" strokeLinecap="round" />
        <motion.path d={`M14 ${size / 2} A${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none" stroke={color}
          strokeWidth="14" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
        {[0.25, 0.5, 0.75].map((t) => {
          const a = Math.PI * (1 - t);
          return <line key={t} x1={size / 2 + (r - 12) * Math.cos(a)} y1={size / 2 - (r - 12) * Math.sin(a)}
            x2={size / 2 + (r - 18) * Math.cos(a)} y2={size / 2 - (r - 18) * Math.sin(a)}
            stroke={dark ? "rgba(255,255,255,.25)" : "var(--line-strong)"} strokeWidth="2" />;
        })}
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center" }}>
        <div style={{ fontSize: size / 5, fontWeight: 500, letterSpacing: "-0.05em", lineHeight: 1 }}>
          <CountUp value={value * 100} /><span style={{ fontSize: size / 11, opacity: 0.5 }}>%</span>
        </div>
        <div className="eyebrow" style={{ marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

export function Seg({ options, value, onChange, wide }) {
  return (
    <div className={`seg ${wide ? "wide" : ""}`}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <button key={String(v)} type="button" className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>;
      })}
    </div>
  );
}

export function Toggle({ value, onChange }) {
  return <button type="button" role="switch" aria-checked={value} className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} />;
}

export function Slider({ min, max, value, onChange, step = 1 }) {
  const p = ((value - min) / (max - min)) * 100;
  return <input type="range" className="slider" min={min} max={max} step={step} value={value}
    style={{ "--p": `${p}%` }} onChange={(e) => onChange(Number(e.target.value))} />;
}

export function Skeleton({ h = 120, style }) {
  return <div className="skeleton" style={{ height: h, ...style }} />;
}

export function ChartTip({ active, payload, label, fmt = (v) => v, labelFmt = (l) => l }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div style={{ opacity: 0.6, marginBottom: 4 }}>{labelFmt(label, payload)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row" style={{ gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill }} />
          <span>{p.name}</span><span className="mono" style={{ marginLeft: "auto" }}>{fmt(p.value, p)}</span>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  const node = msg && (
    <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <span className="pulse" /> {msg}
    </motion.div>
  );
  return [node, setMsg];
}
