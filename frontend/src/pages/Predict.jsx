import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Save, Sparkles, Wand2 } from "lucide-react";
import { api } from "../api";
import FeatureField from "../components/FeatureField";
import { Contributions, Interventions, Verdict } from "../components/PredictionResult";
import { Card, Gauge, PageHead, RiskBadge, Skeleton, useToast } from "../components/ui";

export function useSchema() {
  const [schema, setSchema] = useState(null);
  useEffect(() => { api.schema().then(setSchema); }, []);
  return schema;
}

export const defaultsFrom = (schema) =>
  Object.fromEntries(Object.entries(schema.features).map(([k, m]) => [k, m.default]));

const PRESETS = {
  "Thriving": { studytime: 3, failures: 0, absences: 2, higher: true, goout: 2, Dalc: 1, Walc: 1, Medu: 4, Fedu: 3, famsup: true, internet: true },
  "Struggling": { studytime: 1, failures: 2, absences: 16, higher: false, goout: 5, Dalc: 3, Walc: 5, schoolsup: false, famsup: false, subject: "maths" },
  "Borderline": { studytime: 2, failures: 1, absences: 8, goout: 4, Walc: 3, subject: "science" },
};

export default function Predict() {
  const schema = useSchema();
  const nav = useNavigate();
  const [x, setX] = useState(null);
  const [step, setStep] = useState(0);
  const [live, setLive] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [toast, notify] = useToast();

  useEffect(() => { if (schema && !x) setX(defaultsFrom(schema)); }, [schema]); // eslint-disable-line

  const groups = useMemo(() => {
    if (!schema) return [];
    return Object.entries(schema.groups).map(([key, label]) => ({
      key, label, fields: Object.entries(schema.features).filter(([, m]) => m.group === key),
    }));
  }, [schema]);

  // live scoring — debounced what-if call on every change
  useEffect(() => {
    if (!x) return;
    const t = setTimeout(() => api.simulate(x).then(setLive).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [x]);

  const set = (k, v) => { setX((s) => ({ ...s, [k]: v })); setResult(null); };

  const analyse = async () => {
    setBusy(true);
    try {
      setResult(await api.predict(x));
      setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  const saveStudent = async () => {
    if (name.trim().length < 2) return notify("Enter the student's name first");
    try {
      const s = await api.createStudent({ name: name.trim(), features: x });
      nav(`/students/${s.id}`);
    } catch (e) { notify(e.message); }
  };

  if (!schema || !x) return <Skeleton h={500} />;
  const g = groups[step];
  const last = step === groups.length - 1;

  return (
    <>
      <PageHead index="03" eyebrow="Predict" title="Score a student in seconds."
        sub="Fill in what you know — every field has a sensible default. The gauge updates live as you change inputs.">
        {Object.keys(PRESETS).map((p) => (
          <button key={p} className="btn btn-ghost btn-sm" onClick={() => { setX({ ...defaultsFrom(schema), ...PRESETS[p] }); setResult(null); }}>
            <Wand2 size={13} /> {p}
          </button>
        ))}
      </PageHead>

      <div className="grid g-12" style={{ alignItems: "start" }}>
        <Card className="span-8" i={1}>
          <div className="steps">
            {groups.map((gr, i) => (
              <button key={gr.key} className={`step-pill ${i === step ? "on" : i < step ? "done" : ""}`} onClick={() => setStep(i)}>
                <i>{i < step ? <Check size={12} /> : i + 1}</i>{gr.label}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={g.key} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
              {g.key === "grades" && (
                <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
                  Adding both period grades switches to the <b style={{ color: "var(--ink)" }}>full model</b> (AUC ≈ 0.97 vs ≈ 0.82).
                  Leave them empty to see the start-of-year early-warning view.
                </p>
              )}
              <div className="fields">
                {g.fields.map(([k, m]) => <FeatureField key={k} name={k} meta={m} value={x[k]} onChange={set} />)}
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="divider" />
          <div className="row between">
            <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</button>
            {last
              ? <button className="btn btn-primary" onClick={analyse} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} Run full analysis</button>
              : <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next <ArrowRight size={16} /></button>}
          </div>
        </Card>

        <div className="span-4" style={{ position: "sticky", top: 24 }}>
          <Card className="dark" i={2}>
            <div className="row between"><div className="eyebrow">Live score</div><span className="row mono" style={{ gap: 6, fontSize: 11, color: "var(--mint)" }}><span className="pulse" />{live?.mode ?? "…"}</span></div>
            <div style={{ display: "grid", placeItems: "center", margin: "20px 0 6px" }}>
              {live ? <Gauge value={live.pass_probability} dark size={240} /> : <div style={{ height: 142 }} />}
            </div>
            {live && (
              <div className="row between" style={{ marginTop: 12 }}>
                <div><div className="eyebrow">Predicted grade</div><div style={{ fontSize: 24, fontWeight: 500 }}>{live.predicted_grade.toFixed(1)}<span style={{ opacity: .4, fontSize: 13 }}> /20 · {live.grade_band}</span></div></div>
                <RiskBadge risk={live.risk} />
              </div>
            )}
            <button className="btn btn-mint" style={{ width: "100%", marginTop: 18 }} onClick={analyse} disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} Explain &amp; recommend
            </button>
          </Card>
          <Card i={3} style={{ marginTop: 18 }}>
            <div className="eyebrow">Save to roster</div>
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" placeholder="Student name" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-primary" onClick={saveStudent} title="Save student"><Save size={16} /></button>
            </div>
          </Card>
        </div>
      </div>

      {result && (
        <div id="result" className="grid g-12" style={{ marginTop: 18, scrollMarginTop: 24 }}>
          <div className="span-4"><Verdict r={result} i={0} /></div>
          <div className="span-8"><Contributions items={result.explanation} i={1} /></div>
          <div className="span-12"><Interventions items={result.interventions} i={2} /></div>
        </div>
      )}
      {toast}
    </>
  );
}
