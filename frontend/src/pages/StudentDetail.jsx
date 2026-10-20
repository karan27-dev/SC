import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Save, Trash2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import FeatureField from "../components/FeatureField";
import { Contributions, Interventions, Verdict } from "../components/PredictionResult";
import { Card, CardHead, ChartTip, PageHead, RiskBadge, Skeleton, pct, useToast } from "../components/ui";
import { useSchema } from "./Predict";

// levers a teacher can actually pull, plus period grades once they exist
const WHATIF = ["studytime", "absences", "goout", "Dalc", "Walc", "schoolsup", "famsup", "paid", "higher", "internet", "G1", "G2"];
const PROFILE = ["age", "sex", "address", "famsize", "Pstatus", "Medu", "Fedu", "Mjob", "Fjob", "guardian", "failures", "traveltime", "health", "famrel"];

export default function StudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const schema = useSchema();
  const [d, setD] = useState(null);
  const [x, setX] = useState(null);
  const [sim, setSim] = useState(null);
  const [toast, notify] = useToast();

  const load = () => api.student(id).then((r) => { setD(r); setX(r.student.features); setSim(null); }).catch((e) => notify(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const dirty = d && x && JSON.stringify(x) !== JSON.stringify(d.student.features);
  useEffect(() => {
    if (!dirty) { setSim(null); return; }
    const t = setTimeout(() => api.simulate(x).then(setSim), 200);
    return () => clearTimeout(t);
  }, [x]); // eslint-disable-line

  if (!d || !schema || !x) return <Skeleton h={600} />;
  const s = d.student, p = d.prediction;
  const delta = sim ? sim.pass_probability - p.pass_probability : 0;

  const save = async () => {
    await api.updateStudent(s.id, { name: s.name, features: x });
    notify("Saved — prediction updated");
    load();
  };
  const remove = async () => {
    await api.deleteStudent(s.id);
    nav("/students");
  };
  const fmt = (k) => {
    const m = schema.features[k], v = s.features[k];
    if (m.scale) return m.scale[v - m.min];
    if (m.optionLabels) return m.optionLabels[m.options.indexOf(v)] ?? v;
    return String(v);
  };

  return (
    <>
      <Link to="/students" className="row muted" style={{ gap: 6, fontSize: 13, marginBottom: 14 }}><ArrowLeft size={14} /> All students</Link>
      <PageHead index={s.code} eyebrow={`${s.subject} · ${s.source === "holdout" ? "hold-out cohort" : s.source}`} title={s.name}>
        <RiskBadge risk={s.risk} />
        {s.actual_grade != null && <span className="tag">actual final grade: {s.actual_grade}</span>}
        <button className="btn btn-ghost btn-sm" onClick={remove}><Trash2 size={14} /> Remove</button>
      </PageHead>

      <div className="grid g-12">
        <div className="span-4 stack" style={{ gap: 18 }}>
          <Verdict r={p} i={1} />
          <Card i={2}>
            <CardHead eyebrow="Profile" title="Background" />
            <dl className="kv">
              {PROFILE.map((k) => <Fragment key={k}><dt>{schema.features[k].label}</dt><dd>{fmt(k)}</dd></Fragment>)}
            </dl>
          </Card>
        </div>
        <div className="span-8 stack" style={{ gap: 18 }}>
          <Contributions items={p.explanation} i={2} />
          <Card i={3}>
            <CardHead eyebrow="What-if simulator" title="Change a lever, watch the outcome move">
              {dirty && <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setX(s.features)}><RotateCcw size={13} /> Reset</button>
                <button className="btn btn-primary btn-sm" onClick={save}><Save size={13} /> Save</button>
              </div>}
            </CardHead>
            <div className="row wrap" style={{ gap: 14, padding: 14, borderRadius: 14, background: "var(--paper-2)", marginBottom: 18 }}>
              <div><div className="eyebrow">Current</div><div className="mono" style={{ fontSize: 22 }}>{pct(p.pass_probability, 1)}</div></div>
              <div style={{ fontSize: 22, opacity: .3 }}>→</div>
              <div><div className="eyebrow">Simulated</div><div className="mono" style={{ fontSize: 22 }}>{sim ? pct(sim.pass_probability, 1) : "—"}</div></div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div className="eyebrow">Change</div>
                <div className="mono" style={{ fontSize: 22, color: delta > 0 ? "var(--green)" : delta < 0 ? "var(--high)" : "var(--muted)" }}>
                  {sim ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pp` : "move a slider"}
                </div>
              </div>
              {sim && sim.mode !== p.mode && <div className="tag" style={{ flexBasis: "100%" }}>switched to {sim.mode} model — period grades provided</div>}
            </div>
            <div className="fields">
              {WHATIF.map((k) => <FeatureField key={k} name={k} meta={schema.features[k]} value={x[k]} onChange={(kk, v) => setX({ ...x, [kk]: v })} />)}
            </div>
          </Card>
        </div>
        <div className="span-7"><Interventions items={p.interventions} i={4} /></div>
        <Card className="span-5" i={5}>
          <CardHead eyebrow="Timeline" title="Pass probability over time" />
          {d.history.length < 2 ? <div className="empty">One prediction so far. Save a change in the simulator to build a timeline.</div> : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <AreaChart data={d.history.map((h, i) => ({ ...h, i: i + 1 }))} margin={{ left: -20, right: 6 }}>
                  <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--green)" stopOpacity={.3} /><stop offset="1" stopColor="var(--green)" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="i" axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tickFormatter={(v) => `${v * 100}%`} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip fmt={(v) => pct(v, 1)} labelFmt={(l) => `Prediction #${l}`} />} />
                  <Area dataKey="pass_probability" name="Pass probability" stroke="var(--green)" strokeWidth={2} fill="url(#ga)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
      {toast}
    </>
  );
}
