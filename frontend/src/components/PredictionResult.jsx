import { motion } from "framer-motion";
import { ArrowUpRight, Info, Target } from "lucide-react";
import { Card, CardHead, Gauge, RiskBadge, pct } from "./ui";

const fmtVal = (v) => (v === "yes" ? "Yes" : v === "no" ? "No" : typeof v === "number" ? +v.toFixed(1) : String(v));

export function Verdict({ r, i = 1 }) {
  return (
    <Card className="dark" i={i}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">Prediction · {r.mode === "full" ? "full model (with grades)" : "early-warning model"}</div>
          <div style={{ fontSize: 28, letterSpacing: "-0.04em", fontWeight: 500, marginTop: 6 }}>
            Likely to <span style={{ color: r.verdict === "pass" ? "var(--mint)" : "#ff8a8d" }}>{r.verdict}</span>
          </div>
        </div>
        <RiskBadge risk={r.risk} />
      </div>
      <div style={{ display: "grid", placeItems: "center", margin: "18px 0 8px" }}>
        <Gauge value={r.pass_probability} dark />
      </div>
      <div className="grid g-3" style={{ gap: 10, marginTop: 14 }}>
        {[
          ["Final grade", `${r.predicted_grade.toFixed(1)}`, "/20"],
          ["Grade band", r.grade_band, ""],
          ["Fail risk", pct(r.fail_probability), ""],
        ].map(([k, v, s]) => (
          <div key={k} style={{ background: "rgba(255,255,255,.05)", borderRadius: 12, padding: "12px 14px" }}>
            <div className="eyebrow">{k}</div>
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.03em", marginTop: 2 }}>{v}<span style={{ opacity: .45, fontSize: 13 }}>{s}</span></div>
          </div>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 11, opacity: .45, marginTop: 14 }}>
        {r.subject_group} profile · {r.model.classifier} + {r.model.regressor}
      </div>
    </Card>
  );
}

export function Contributions({ items, i = 2, limit = 10 }) {
  const top = items.slice(0, limit);
  const max = Math.max(0.01, ...top.map((d) => Math.abs(d.impact)));
  return (
    <Card i={i}>
      <CardHead eyebrow="Explainability" title="What drives this prediction">
        <span className="tag" title="Each feature is swapped for the population baseline; the bar is the change in pass probability.">
          <Info size={11} style={{ verticalAlign: -1 }} /> baseline substitution
        </span>
      </CardHead>
      {top.length === 0 && <div className="empty">This student matches the population baseline on every feature.</div>}
      {top.map((d, idx) => {
        const w = (Math.abs(d.impact) / max) * 50;
        const pos = d.impact >= 0;
        return (
          <div className="contrib" key={d.feature}>
            <div style={{ minWidth: 0 }}>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{fmtVal(d.value)} <span style={{ opacity: .6 }}>vs {fmtVal(d.baseline)}</span></div>
            </div>
            <div className="contrib-track">
              <motion.div className="contrib-bar"
                style={{ background: pos ? "var(--green)" : "var(--high)", [pos ? "left" : "right"]: "50%" }}
                initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.7, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <div className="mono" style={{ textAlign: "right", color: pos ? "var(--green)" : "var(--high)" }}>
              {pos ? "+" : ""}{(d.impact * 100).toFixed(1)}
            </div>
          </div>
        );
      })}
      <div className="row between muted" style={{ fontSize: 12, marginTop: 10 }}>
        <span>← lowers pass chance</span><span className="mono">pp</span><span>raises pass chance →</span>
      </div>
    </Card>
  );
}

export function Interventions({ items, i = 3 }) {
  return (
    <Card i={i}>
      <CardHead eyebrow="Counterfactual planner" title="Recommended interventions">
        <Target size={18} style={{ opacity: .4 }} />
      </CardHead>
      <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
        Each action is re-scored by the model. Only actionable factors are considered — nobody can change their parents' education.
      </p>
      <div className="stack">
        {items.length === 0 && <div className="empty">No actionable levers left — this student is already doing all the right things.</div>}
        {items.slice(0, 6).map((it, idx) => (
          <motion.div key={it.action} className={`intervention ${it.combined ? "combined" : ""}`}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + idx * 0.05 }}>
            <div style={{ fontWeight: 500 }}>{it.action}</div>
            <div className="uplift">{it.pass_uplift >= 0 ? "+" : ""}{(it.pass_uplift * 100).toFixed(1)} pp</div>
            <div className="muted" style={{ fontSize: 13 }}>{it.programme}</div>
            <div className="mono muted" style={{ fontSize: 11, textAlign: "right" }}>
              → {pct(it.new_pass_probability)} <ArrowUpRight size={11} style={{ verticalAlign: -1 }} />
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
