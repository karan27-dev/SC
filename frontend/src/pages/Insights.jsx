import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { Card, CardHead, ChartTip, PageHead, Skeleton, pct } from "../components/ui";

const BREAKDOWNS = {
  failures: { label: "Past failures", x: "Number of past class failures", note: "The single strongest early signal. Each extra failure sharply lowers the pass rate." },
  studytime: { label: "Study time", x: "1 = <2h · 2 = 2–5h · 3 = 5–10h · 4 = >10h per week", note: "More study time helps, with diminishing returns past 5–10 hours a week." },
  higher: { label: "Higher-ed plans", x: "Wants to go to university", note: "Motivation matters. Students without higher-education plans fail far more often." },
  absences: { label: "Absences", x: "Number of school absences", note: "Pass rates fall as absences pile up past about 10. (Dropouts' zero absences were removed as an artefact.)" },
  alcohol: { label: "Weekend alcohol", x: "1 = very low … 5 = very high", note: "Heavy weekend drinking goes with lower pass rates, partly through social time." },
  goout: { label: "Going out", x: "1 = very low … 5 = very high", note: "Moderate socialising is fine. The highest level is where outcomes drop." },
  parent_edu: { label: "Parent education", x: "Mother + father education (0–8)", note: "Family education helps, but it's not something a school can change. That's why it's excluded from interventions." },
  subject_group: { label: "Subject group", x: "STEM = Maths, Science · Languages & humanities = English, Hindi, History", note: "STEM subjects are much harder to pass than language & humanities subjects, so the model always conditions on the subject group." },
};

export default function Insights() {
  const [r, setR] = useState(null);
  const [key, setKey] = useState("failures");
  useEffect(() => { api.report().then(setR); }, []);
  if (!r) return <Skeleton h={600} />;
  const eda = r.eda;
  const b = BREAKDOWNS[key];
  const corr = eda.correlations.filter((c) => !["G1", "G2"].includes(c.feature)).slice(0, 12);
  const ingest = r.steps.find((s) => s.key === "ingest").details;
  const validate = r.steps.find((s) => s.key === "validate").details;

  return (
    <>
      <PageHead index="04" eyebrow="Insights" title={<>What the data says<br /><em>about how students succeed.</em></>}
        sub={`Exploratory analysis of ${ingest.rows.toLocaleString()} student records from two Portuguese secondary schools.`} />

      <div className="grid g-12">
        <Card className="span-8" i={1}>
          <CardHead eyebrow="Pass-rate breakdown" title={b.label}>
            <select className="select" style={{ width: 190, height: 38 }} value={key} onChange={(e) => setKey(e.target.value)}>
              {Object.entries(BREAKDOWNS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </CardHead>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={eda.breakdowns[key].map((d) => ({ ...d, bucket: { stem: "STEM", languages: "Languages & humanities" }[d.bucket] ?? d.bucket }))} margin={{ left: -16 }}>
                <XAxis dataKey="bucket" axisLine={false} tickLine={false} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => `${v * 100}%`} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "var(--paper-2)" }} content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="chart-tip"><div>{label}</div><div className="mono">{pct(payload[0].value, 1)} pass · n={payload[0].payload.n}</div>
                    <div className="mono">avg grade {payload[0].payload.avg_grade}</div></div>) : null} />
                <ReferenceLine y={validate.pass_rate} stroke="var(--green)" strokeDasharray="4 4" label={{ value: "overall", position: "right", fontSize: 11, fill: "var(--green)" }} />
                <Bar dataKey="pass_rate" radius={[8, 8, 0, 0]}>
                  {eda.breakdowns[key].map((d) => <Cell key={d.bucket} fill={d.pass_rate < validate.pass_rate - 0.1 ? "var(--high)" : d.pass_rate < validate.pass_rate ? "var(--medium)" : "var(--ink)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="row between wrap" style={{ gap: 10 }}>
            <span className="mono muted" style={{ fontSize: 11 }}>{b.x}</span>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 15 }}>{b.note}</p>
        </Card>

        <Card className="span-4 dark" i={2}>
          <div className="eyebrow">Dataset</div>
          <div style={{ fontSize: 22, letterSpacing: "-0.03em", fontWeight: 500, margin: "8px 0 16px" }}>UCI Student Performance</div>
          <dl className="kv" style={{ color: "#e6efee" }}>
            <dt>records</dt><dd>{ingest.rows}</dd>
            <dt>source: maths</dt><dd>{ingest.by_subject.math}</dd>
            <dt>source: portuguese</dt><dd>{ingest.by_subject.portuguese}</dd>
            <dt>raw attributes</dt><dd>{ingest.columns - 1}</dd>
            <dt>missing values</dt><dd>{validate.missing_values}</dd>
            <dt>dropouts removed</dt><dd>{validate.excluded}</dd>
            <dt>pass rate</dt><dd>{pct(validate.pass_rate, 1)}</dd>
          </dl>
          <div className="divider" style={{ background: "rgba(255,255,255,.1)" }} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            P. Cortez &amp; A. Silva, “Using Data Mining to Predict Secondary School Student Performance”, FUBUTEC 2008.
            Collected through school reports and questionnaires.
          </p>
          <div className="divider" style={{ background: "rgba(255,255,255,.1)" }} />
          <div className="eyebrow" style={{ marginBottom: 8 }}>Subject mapping</div>
          <p style={{ fontSize: 13, margin: 0, color: "rgba(230,239,238,.8)" }}>
            The source data has real grades for Maths and Portuguese only. Rather than invent data, the model learns per <b style={{ color: "var(--mint)" }}>subject group</b>:
            Maths &amp; Science use the STEM profile (learned from Maths), and English, Hindi &amp; History use the languages &amp; humanities profile (learned from Portuguese, a language &amp; literature course).
          </p>
        </Card>

        <Card className="span-6" i={3}>
          <CardHead eyebrow="Linear signal" title="Correlation with final grade (excl. G1/G2)" />
          <div style={{ height: 380 }}>
            <ResponsiveContainer>
              <BarChart layout="vertical" data={corr} margin={{ left: 0, right: 16 }}>
                <XAxis type="number" domain={[-0.5, 0.5]} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={170} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--ink)" }} />
                <ReferenceLine x={0} stroke="var(--line-strong)" />
                <Tooltip cursor={{ fill: "var(--paper-2)" }} content={<ChartTip fmt={(v) => `r = ${v.toFixed(3)}`} />} />
                <Bar dataKey="r" name="Pearson r" radius={4} barSize={12}>
                  {corr.map((c) => <Cell key={c.feature} fill={c.r >= 0 ? "var(--green)" : "var(--high)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>G1 and G2 correlate at r ≈ 0.8–0.9 and are hidden here so the behavioural signals stay visible.</p>
        </Card>

        <Card className="span-6" i={4}>
          <CardHead eyebrow="Target" title="Final grade distribution (G3)" />
          <div style={{ height: 380 }}>
            <ResponsiveContainer>
              <BarChart data={eda.grade_histogram} margin={{ left: -16 }}>
                <XAxis dataKey="grade" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "var(--paper-2)" }} content={<ChartTip labelFmt={(l) => `Grade ${l}`} />} />
                <ReferenceLine x={10} stroke="var(--ink)" strokeDasharray="4 4" label={{ value: "pass", position: "top", fontSize: 11 }} />
                <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                  {eda.grade_histogram.map((d) => <Cell key={d.grade} fill={d.grade === 0 ? "var(--faint)" : d.grade < 10 ? "var(--high)" : "var(--ink)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>The spike at 0 is students who dropped out, not students who sat the exam and scored zero.</p>
        </Card>

        <Card className="span-12" i={5}>
          <CardHead eyebrow="Methodology" title="How the system reasons" />
          <div className="grid g-4">
            {[
              ["01", "Two models, two moments", "The early-warning model uses only background and behaviour, so it works on day one. Once period grades exist, the full model takes over: AUC rises from about 0.82 to about 0.97."],
              ["02", "Honest evaluation", "Model choice uses 5-fold cross-validation on the training set only. The dashboard cohort is the 20% hold-out set the models never saw."],
              ["03", "Explain every score", "Baseline substitution: swap each feature for the population median or mode and measure how the pass probability moves. Teachers see why, not just what."],
              ["04", "Act, don't just predict", "The counterfactual planner re-scores realistic changes to actionable factors only, then greedily stacks the ones that still help together."],
            ].map(([n, t, d]) => (
              <div key={n}>
                <div className="mono" style={{ fontSize: 12, color: "var(--green)" }}>{n}</div>
                <div style={{ fontWeight: 500, fontSize: 17, letterSpacing: "-0.02em", margin: "6px 0" }}>{t}</div>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
