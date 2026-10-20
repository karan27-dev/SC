import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../auth";

const LOG_LINES = [
  ["ingest", "loaded 1044 records × 34 columns"],
  ["validate", "53 dropouts with absences=0 — artefact, excluded"],
  ["engineer", "alcohol_index = (5·Dalc + 2·Walc) / 7"],
  ["split", "835 train / 209 hold-out · stratified"],
  ["train", "Random Forest · 5-fold CV AUC 0.968"],
  ["evaluate", "permutation importance → failures, G2, absences"],
  ["deploy", "models.joblib written · serving"],
];

/** Students as particles: each drifts toward a "pass" or "fail" basin, like a classifier separating a cohort. */
function Field() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let w, h, raf;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const pts = Array.from({ length: 140 }, () => {
      const pass = Math.random() < 0.7;
      return { x: Math.random(), y: Math.random(), pass, vx: 0, vy: 0, r: 1.2 + Math.random() * 2, t: Math.random() * 6 };
    });
    let tick = 0;
    const draw = () => {
      tick += 1;
      ctx.clearRect(0, 0, w, h);
      // decision boundary: a slowly breathing curve
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h * 0.52 + Math.sin(x / 140 + tick / 120) * 34 + Math.cos(x / 60) * 6;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(164,252,161,.22)"; ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      for (const p of pts) {
        const ty = p.pass ? 0.28 : 0.76;
        p.vy += (ty - p.y) * 0.00012 + (Math.random() - 0.5) * 0.0004;
        p.vx += (Math.random() - 0.5) * 0.0004;
        p.vx *= 0.96; p.vy *= 0.96;
        p.x = (p.x + p.vx + 1) % 1; p.y = Math.min(0.98, Math.max(0.02, p.y + p.vy));
        p.t += 0.03;
        const a = 0.45 + Math.sin(p.t) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.pass ? `rgba(164,252,161,${a})` : `rgba(255,138,141,${a})`;
        ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        if (a.pass !== b.pass) continue;
        const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h, d = dx * dx + dy * dy;
        if (d < 3600) {
          ctx.strokeStyle = `rgba(164,252,161,${0.08 * (1 - d / 3600)})`;
          ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduce ? draw() || cancelAnimationFrame(raf) : draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} />;
}

function Terminal() {
  const [n, setN] = useState(1);
  useEffect(() => { const t = setInterval(() => setN((v) => (v % (LOG_LINES.length + 3)) + 1), 900); return () => clearInterval(t); }, []);
  return (
    <div className="terminal">
      {LOG_LINES.slice(Math.max(0, Math.min(n, LOG_LINES.length) - 5), Math.min(n, LOG_LINES.length)).map(([s, m]) => (
        <motion.div key={s} className="ln" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
          <b>{s.padEnd(9, " ")}</b> {m}
        </motion.div>
      ))}
    </div>
  );
}

export default function Login({ mode }) {
  const { login, register, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isReg = mode === "register";

  useEffect(() => { if (user) nav(loc.state?.from || "/", { replace: true }); }, [user]); // eslint-disable-line

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      isReg ? await register(form.name, form.email, form.password) : await login(form.email, form.password);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <motion.div className="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="auth-art">
        <Field />
        <div className="row">
          <div className="brand-mark"><Activity size={18} strokeWidth={2.4} /></div>
          <span className="brand-name">Cohort</span>
          <span className="tag" style={{ marginLeft: 8, background: "transparent", color: "var(--mint)", borderColor: "rgba(164,252,161,.25)" }}>v1.0</span>
        </div>
        <h2 className="auth-headline">See who's slipping <span>before</span> the final grade does.</h2>
        <p style={{ maxWidth: 480, color: "rgba(230,239,238,.65)", margin: "0 0 26px" }}>
          An early-warning system trained on 1,044 real student records. It predicts outcomes, explains them,
          and recommends the interventions most likely to change them.
        </p>
        <Terminal />
      </div>

      <div className="auth-form-wrap">
        <motion.form className="auth-form" onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="eyebrow">{isReg ? "01 — Create account" : "01 — Sign in"}</div>
          <h1>{isReg ? "Join your school's workspace" : "Welcome back"}</h1>
          <p className="muted" style={{ margin: "0 0 26px" }}>
            {isReg ? "Teachers get full access to predictions and student records." : "Sign in to your cohort dashboard."}
          </p>
          <div className="stack" style={{ gap: 16 }}>
            {isReg && (
              <label className="field"><span className="field-label">Full name</span>
                <input className="input" required minLength={2} value={form.name} onChange={set("name")} placeholder="Priya Sharma" autoComplete="name" /></label>
            )}
            <label className="field"><span className="field-label">Email</span>
              <input className="input" type="email" required value={form.email} onChange={set("email")} placeholder="you@school.edu" autoComplete="email" /></label>
            <label className="field"><span className="field-label">Password {isReg && <span className="mono">min 6 chars</span>}</span>
              <input className="input" type="password" required minLength={isReg ? 6 : 1} value={form.password} onChange={set("password")} placeholder="••••••••" autoComplete={isReg ? "new-password" : "current-password"} /></label>
            {err && <div className="error-text">{err}</div>}
            <button className="btn btn-primary" style={{ height: 48, marginTop: 6 }} disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <>{isReg ? "Create account" : "Sign in"} <ArrowRight size={16} /></>}
            </button>
          </div>
          {!isReg && (
            <div className="demo-box">
              <div><div className="eyebrow">Demo admin</div><span className="mono" style={{ fontSize: 12 }}>admin@spp.edu · admin123</span></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, email: "admin@spp.edu", password: "admin123" })}>Fill</button>
            </div>
          )}
          <p className="muted" style={{ fontSize: 14, marginTop: 22, textAlign: "center" }}>
            {isReg ? "Already have an account? " : "New here? "}
            <Link to={isReg ? "/login" : "/register"} style={{ color: "var(--ink)", fontWeight: 500, borderBottom: "1px solid var(--mint)" }}>
              {isReg ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </motion.form>
      </div>
    </motion.div>
  );
}
