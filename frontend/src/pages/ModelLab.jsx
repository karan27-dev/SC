import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Database, GitFork, Loader2, Play, Rocket, Search, ShieldCheck, Target, Wrench } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, ErrorBar, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { api } from "../api";
import { useAuth } from "../auth";
import { Card, CardHead, ChartTip, PageHead, Seg, Skeleton, useToast } from "../components/ui";

const STAGES = [
  ["ingest", "Ingest", Database], ["validate", "Validate", ShieldCheck], ["explore", "Explore", Search],
  ["engineer", "Engineer", Wrench], ["split", "Split", GitFork], ["train", "Train", Cpu],
  ["evaluate", "Evaluate", Target], ["deploy", "Deploy", Rocket],
];
const ORDER = Object.fromEntries(STAGES.map(([k], i) => [k, i]));

function Details({ step }) {
  if (!step) return null;
  const rows = Object.entries(step.details).flatMap(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, typeof v2 === "object" ? JSON.stringify(v2) : String(v2)]);
    }
    return [[k, Array.isArray(v) ? v.map((x) => (typeof x === "object" ? x.feature ?? JSON.stringify(x) : x)).join(", ") : String(v)]];
  });
  return (
    <dl className="kv">
      {rows.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + "v"} style={{ wordBreak: "break-word" }}>{v}</dd>])}
      <dt>duration</dt><dd>{step.duration_ms} ms</dd>
    </dl>
  );
}

export default function ModelLab() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [sel, setSel] = useState("validate");
  const [mode, setMode] = useState("early");
  const [toast, notify] = useToast();
  const logRef = useRef(null);

  const refresh = () => { api.report().then(setReport); api.runs().then(setRuns); };
  useEffect(() => { refresh(); api.status().then(setStatus); }, []);

  // poll training status while a run is in flight
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(async () => {
      const s = await api.status();
      setStatus(s);
      if (!s.running) { refresh(); notify(s.error ? `Training failed: ${s.error}` : "Training complete — models redeployed"); }
    }, 600);
    return () => clearInterval(t);
  }, [status?.running]); // eslint-disable-line

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [status?.logs?.length]);

  const retrain = async () => {
    try { setStatus(await api.retrain()); } catch (e) { notify(e.message); }
  };

  if (!report) return <Skeleton h={600} />;
  const running = status?.running;
  const activeIdx = running ? ORDER[status.stage] ?? -1 : 8;
  const m = report.models[mode];
  const cls = m.classification, reg = m.regression;
  const bestC = cls.leaderboard.find((r) => r.name === cls.selected);
  const cm = cls.confusion_matrix; // rows: actual pass/fail, cols: predicted pass/fail
  const logs = status?.logs?.length ? status.logs : report.steps.map((s, i) => ({ t: "", stage: s.key, message: `${s.title} — ${s.duration_ms} ms`, i }));
  const stepByKey = Object.fromEntries(report.steps.map((s) => [s.key, s]));

  return (
    <>
      <PageHead index="05" eyebrow="Model Lab" title={<>Under the hood.<br /><em>Every step, in the open.</em></>}
        sub={`Last trained ${new Date(report.trained_at).toLocaleString()} in ${(report.duration_ms / 1000).toFixed(1)}s. Admins can retrain and watch each stage run live.`}>
        {user?.role === "admin" && (
          <button className="btn btn-primary" onClick={retrain} disabled={running}>
            {running ? <><Loader2 size={16} className="spin" /> Training… {status.progress}%</> : <><Play size={16} /> Retrain models</>}
          </button>
        )}
      </PageHead>

      <Card i={1}>
        <CardHead eyebrow="Pipeline" title="Data → model → deployment">
          <span className="mono muted" style={{ fontSize: 12 }}>{running ? `${status.stage} · ${status.progress}%` : "idle · click a stage"}</span>
        </CardHead>
        <div className="pipeline">
          {STAGES.map(([key, label, Icon], i) => (
            <button key={key} className={`pipe-node ${i < activeIdx ? "done" : ""} ${i === activeIdx ? "active" : ""} ${sel === key ? "sel" : ""}`} onClick={() => setSel(key)}>
              <motion.div className="dot" animate={i === activeIdx ? { scale: [1, 1.08, 1] } : {}} transition={{ repeat: Infinity, duration: 1.2 }}>
                {i === activeIdx ? <Loader2 size={16} className="spin" /> : <Icon size={16} />}
              </motion.div>
              <div className="t">{label}</div>
              <div className="d">{stepByKey[key] ? `${stepByKey[key].duration_ms} ms` : ""}</div>
            </button>
          ))}
        </div>
        {running && <div className="progress" style={{ marginTop: 20 }}><i style={{ width: `${status.progress}%` }} /></div>}
        <div className="divider" />
        <div className="grid g-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Stage detail · {stepByKey[sel]?.title}</div>
            <Details step={stepByKey[sel]} />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{running || status?.logs?.length ? "Live training log" : "Last run summary"}</div>
            <div className="log" ref={logRef}>
              {logs.map((l, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <span className="t">{l.t !== "" ? `${Number(l.t).toFixed(1)}s` : `0${i + 1}`}</span><span className="s">{l.stage}</span>{l.message}
                </motion.div>
              ))}
              {running && <div className="spin" style={{ display: "inline-block", color: "var(--mint)" }}>◐</div>}
            </div>
          </div>
        </div>
      </Card>

      <div className="row between wrap" style={{ margin: "30px 0 16px", gap: 12 }}>
        <div>
          <div className="eyebrow">Two feature regimes</div>
          <h2 style={{ margin: "4px 0 0", fontWeight: 500, letterSpacing: "-0.03em" }}>
            {mode === "early" ? "Early-warning model — no grades needed" : "Full model — uses period grades G1 & G2"}
          </h2>
        </div>
        <Seg options={[["early", "Early warning"], ["full", "Full (with grades)"]]} value={mode} onChange={setMode} />
      </div>

      <div className="grid g-12">
        <Card className="span-7" i={2}>
          <CardHead eyebrow="Classification · will they pass?" title="Model leaderboard">
            <span className="tag">5-fold CV · selected by AUC</span>
          </CardHead>
          <div className="table-wrap">
            <table className="table leader">
              <thead><tr><th>Model</th><th>CV AUC</th><th>Test AUC</th><th>Accuracy</th><th>Recall (fail)</th><th>F1</th></tr></thead>
              <tbody>
                {cls.leaderboard.map((r) => (
                  <tr key={r.name} className={r.name === cls.selected ? "best" : ""} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 500 }}>{r.name} {r.name === cls.selected && <span className="tag" style={{ marginLeft: 6 }}>selected</span>}</td>
                    <td className="mono">{r.cv_auc.toFixed(3)} <span className="muted">±{r.cv_auc_std.toFixed(3)}</span></td>
                    <td className="mono">{r.test_auc.toFixed(3)}</td>
                    <td className="mono">{(r.test_accuracy * 100).toFixed(1)}%</td>
                    <td className="mono">{(r.test_recall * 100).toFixed(1)}%</td>
                    <td className="mono">{r.test_f1.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="eyebrow" style={{ margin: "22px 0 4px" }}>Regression · predicted final grade (0–20)</div>
          <div className="table-wrap">
            <table className="table leader">
              <thead><tr><th>Model</th><th>CV RMSE</th><th>Test RMSE</th><th>MAE</th><th>R²</th></tr></thead>
              <tbody>
                {reg.leaderboard.map((r) => (
                  <tr key={r.name} className={r.name === reg.selected ? "best" : ""} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 500 }}>{r.name} {r.name === reg.selected && <span className="tag" style={{ marginLeft: 6 }}>selected</span>}</td>
                    <td className="mono">{r.cv_rmse.toFixed(2)}</td><td className="mono">{r.test_rmse.toFixed(2)}</td>
                    <td className="mono">{r.test_mae.toFixed(2)}</td><td className="mono">{r.test_r2.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="span-5" i={3}>
          <CardHead eyebrow={`ROC · ${cls.selected}`} title={`AUC ${bestC.test_auc.toFixed(3)} on hold-out`} />
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <AreaChart data={cls.roc} margin={{ left: -20, right: 8 }}>
                <defs><linearGradient id="roc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--mint)" stopOpacity={.8} /><stop offset="1" stopColor="var(--mint)" stopOpacity={.05} /></linearGradient></defs>
                <XAxis dataKey="fpr" type="number" domain={[0, 1]} tickCount={6} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 1]} tickCount={6} axisLine={false} tickLine={false} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--line-strong)" strokeDasharray="4 4" />
                <Tooltip content={<ChartTip fmt={(v) => v.toFixed(3)} labelFmt={(l) => `FPR ${Number(l).toFixed(2)}`} />} />
                <Area type="stepAfter" dataKey="tpr" name="True positive rate" stroke="var(--ink)" strokeWidth={2} fill="url(#roc)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="eyebrow" style={{ margin: "16px 0 10px" }}>Confusion matrix · threshold 0.5</div>
          <div className="cm">
            <div /><div className="eyebrow" style={{ textAlign: "center" }}>pred. pass</div><div className="eyebrow" style={{ textAlign: "center" }}>pred. fail</div>
            <div className="eyebrow" style={{ alignSelf: "center" }}>actual pass</div>
            <div className="cell" style={{ background: "var(--ink)", color: "var(--mint)" }}>{cm[0][0]}<small>true pass</small></div>
            <div className="cell" style={{ background: "var(--medium-soft)" }}>{cm[0][1]}<small>false alarm</small></div>
            <div className="eyebrow" style={{ alignSelf: "center" }}>actual fail</div>
            <div className="cell" style={{ background: "var(--high-soft)", color: "var(--high)" }}>{cm[1][0]}<small>missed</small></div>
            <div className="cell" style={{ background: "var(--ink)", color: "var(--mint)" }}>{cm[1][1]}<small>caught</small></div>
          </div>
        </Card>

        <Card className="span-7" i={4}>
          <CardHead eyebrow="Permutation importance · hold-out" title="What the model actually relies on">
            <span className="tag">Δ AUC when shuffled</span>
          </CardHead>
          <div style={{ height: 360 }}>
            <ResponsiveContainer>
              <BarChart layout="vertical" data={m.importance.slice(0, 12)} margin={{ left: 0, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={170} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--ink)" }} />
                <Tooltip cursor={{ fill: "var(--paper-2)" }} content={<ChartTip fmt={(v) => v.toFixed(4)} />} />
                <Bar dataKey="importance" name="Δ AUC" fill="var(--ink)" radius={[0, 6, 6, 0]} barSize={14}>
                  <ErrorBar dataKey="std" width={4} stroke="var(--green)" direction="x" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="span-5" i={5}>
          <CardHead eyebrow={`Residuals · ${reg.selected}`} title="Predicted vs actual grade" />
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -20, right: 8 }}>
                <XAxis dataKey="actual" type="number" domain={[0, 20]} name="Actual" axisLine={false} tickLine={false} />
                <YAxis dataKey="predicted" type="number" domain={[0, 20]} name="Predicted" axisLine={false} tickLine={false} />
                <ZAxis range={[26, 26]} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 20, y: 20 }]} stroke="var(--line-strong)" strokeDasharray="4 4" />
                <Tooltip cursor={false} content={<ChartTip fmt={(v) => Number(v).toFixed(1)} labelFmt={() => "Student"} />} />
                <Scatter data={reg.residuals} fill="var(--green)" fillOpacity={0.55} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Points on the dashed line are perfect predictions. The early-warning model flattens toward the mean, which is expected: without grades it has much less to go on.</div>
        </Card>

        <Card className="span-12" i={6}>
          <CardHead eyebrow="Audit trail" title="Training runs" />
          {runs.length === 0 ? <div className="muted" style={{ fontSize: 14 }}>The initial model was trained at startup via <span className="mono">python train.py</span>. Retrains triggered here are logged below.</div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Run</th><th>Status</th><th>Duration</th><th>Early AUC</th><th>Full AUC</th><th>When</th></tr></thead>
              <tbody>{runs.map((r) => (
                <tr key={r.id} style={{ cursor: "default" }}>
                  <td className="mono">#{r.id}</td><td><span className={`badge ${r.status === "succeeded" ? "low" : r.status === "failed" ? "high" : "medium"}`}>{r.status}</span></td>
                  <td className="mono">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="mono">{r.early_auc?.toFixed(3) ?? "—"}</td><td className="mono">{r.full_auc?.toFixed(3) ?? "—"}</td>
                  <td className="muted">{new Date(r.created_at + (r.created_at.endsWith("Z") ? "" : "Z")).toLocaleString()}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
      {toast}
    </>
  );
}
