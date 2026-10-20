import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, ShieldAlert, Sparkles } from "lucide-react";
import {
  Bar, BarChart, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { api } from "../api";
import { useAuth } from "../auth";
import { Card, CardHead, ChartTip, CountUp, PageHead, ProbBar, RiskBadge, Skeleton, pct, riskColor } from "../components/ui";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

export default function Overview() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.overview().then(setD).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="empty">{err}</div>;
  const t = d?.totals;
  const atRisk = t ? t.high_risk + t.medium_risk : 0;

  return (
    <>
      <PageHead index="01" eyebrow="Overview" title={<>{greet()}, {user?.name?.split(" ")[0]}.<br /><em>Here's your cohort today.</em></>}>
        <Link to="/predict" className="btn btn-primary"><Sparkles size={16} /> New prediction</Link>
      </PageHead>

      {!d ? <div className="grid g-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={170} />)}</div> : (
        <>
          <div className="grid g-4">
            <Card className="dark" i={1}>
              <div className="row between"><div className="eyebrow">Need attention</div><ShieldAlert size={18} color="var(--mint)" /></div>
              <div className="stat-value"><CountUp value={atRisk} /><small>/ {t.students}</small></div>
              <div className="stat-foot"><span style={{ color: "#ff8a8d" }}>{t.high_risk} high</span> · <span style={{ color: "#ffc66b" }}>{t.medium_risk} medium</span> risk</div>
            </Card>
            <Card i={2}>
              <div className="eyebrow">Avg. predicted grade</div>
              <div className="stat-value"><CountUp value={t.avg_predicted_grade} decimals={1} /><small>/ 20</small></div>
              <div className="stat-foot">Pass mark is 10 on the 0–20 scale</div>
            </Card>
            <Card i={3}>
              <div className="eyebrow">Verdict accuracy</div>
              <div className="stat-value"><CountUp value={d.validation.verdict_accuracy * 100} decimals={1} /><small>%</small></div>
              <div className="stat-foot">on {d.validation.known_outcomes} students with known results</div>
            </Card>
            <Card i={4}>
              <div className="eyebrow">Fails caught early</div>
              <div className="stat-value"><CountUp value={d.validation.fails_flagged} /><small>/ {d.validation.fails_total}</small></div>
              <div className="stat-foot">real fails flagged medium/high before any grade</div>
            </Card>
          </div>

          <Card i={5} style={{ marginTop: 18 }}>
            <CardHead eyebrow="By subject" title="How each subject is tracking">
              <Link to="/students" className="btn btn-ghost btn-sm">Filter roster <ArrowUpRight size={14} /></Link>
            </CardHead>
            <div className="subjects">
              {d.by_subject.map((s) => (
                <button key={s.subject} className="subject-tile" onClick={() => nav(`/students?subject=${s.subject}`)}>
                  <div className="row between">
                    <span style={{ fontWeight: 500, fontSize: 16, letterSpacing: "-0.02em" }}>{s.label}</span>
                    <span className="tag">{s.group === "STEM" ? "STEM" : "Lang & hum"}</span>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.05em", marginTop: 14 }}>
                    {pct(s.avg_pass_probability)}<span className="muted" style={{ fontSize: 12, letterSpacing: 0, marginLeft: 6 }}>avg pass</span>
                  </div>
                  <ProbBar value={s.avg_pass_probability} />
                  <div className="row between mono muted" style={{ fontSize: 11, marginTop: 12 }}>
                    <span>{s.count} students</span><span>grade {s.avg_predicted.toFixed(1)}</span>
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--high)" }}>{s.high_risk} high</span><span className="muted">·</span>
                    <span style={{ color: "#b06f00" }}>{s.at_risk - s.high_risk} medium</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <div className="grid g-12" style={{ marginTop: 18 }}>
            <Card className="span-4" i={5}>
              <CardHead eyebrow="Distribution" title="Risk tiers" />
              <div style={{ height: 200, position: "relative" }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.risk_distribution} dataKey="count" nameKey="risk" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
                      {d.risk_distribution.map((r) => <Cell key={r.risk} fill={riskColor[r.risk]} />)}
                    </Pie>
                    <Tooltip content={<ChartTip labelFmt={(_, p) => p?.[0]?.name} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.04em" }}>{pct(t.avg_pass_probability)}</div>
                    <div className="eyebrow">avg pass prob.</div>
                  </div>
                </div>
              </div>
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                {d.risk_distribution.map((r) => (
                  <div key={r.risk} className="row between" style={{ fontSize: 13 }}>
                    <RiskBadge risk={r.risk} /><span className="mono">{r.count} · {pct(r.count / t.students)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="span-8" i={6}>
              <CardHead eyebrow="Honest validation · unseen students" title="Predicted vs actual final grade">
                <span className="tag">hold-out cohort</span>
              </CardHead>
              <div style={{ height: 300 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
                    <XAxis type="number" dataKey="predicted" name="Predicted" domain={[0, 20]} tickCount={6} axisLine={false} tickLine={false} />
                    <YAxis type="number" dataKey="actual" name="Actual" domain={[0, 20]} tickCount={6} axisLine={false} tickLine={false} />
                    <ZAxis range={[36, 36]} />
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 20, y: 20 }]} stroke="var(--line-strong)" strokeDasharray="4 4" />
                    <ReferenceLine x={10} stroke="var(--line)" /><ReferenceLine y={10} stroke="var(--line)" />
                    <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? (
                      <div className="chart-tip"><div>{payload[0].payload.name}</div>
                        <div className="mono">pred {payload[0].payload.predicted.toFixed(1)} · actual {payload[0].payload.actual}</div></div>) : null} />
                    <Scatter data={d.scatter} onClick={(p) => nav(`/students/${p.id}`)} style={{ cursor: "pointer" }}>
                      {d.scatter.map((s) => <Cell key={s.id} fill={riskColor[s.risk]} fillOpacity={0.7} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>Dashed line = perfect prediction. These students were held out of training, so this is what accuracy looks like in the real world.</div>
            </Card>

            <Card className="span-7" i={7}>
              <CardHead eyebrow="Watchlist" title="Lowest pass probability">
                <Link to="/students?risk=high" className="btn btn-ghost btn-sm">View all <ArrowUpRight size={14} /></Link>
              </CardHead>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Student</th><th>Subject</th><th>Pass prob.</th><th>Grade</th><th>Risk</th></tr></thead>
                  <tbody>
                    {d.watchlist.map((s) => (
                      <tr key={s.id} onClick={() => nav(`/students/${s.id}`)}>
                        <td><div style={{ fontWeight: 500 }}>{s.name}</div><div className="mono muted" style={{ fontSize: 11 }}>{s.code}</div></td>
                        <td className="muted" style={{ textTransform: "capitalize" }}>{s.subject}</td>
                        <td><div className="row" style={{ gap: 10 }}><ProbBar value={s.pass_probability} /><span className="mono" style={{ fontSize: 12 }}>{pct(s.pass_probability)}</span></div></td>
                        <td className="mono">{s.predicted_grade.toFixed(1)}</td>
                        <td><RiskBadge risk={s.risk} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="span-5" i={8}>
              <CardHead eyebrow="Why they're at risk" title="Risk factor prevalence" />
              <div style={{ height: 320 }}>
                <ResponsiveContainer>
                  <BarChart layout="vertical" margin={{ left: 0, right: 8 }}
                    data={d.risk_factor_prevalence.at_risk.map((r, k) => ({ factor: r.factor, at: r.share, low: d.risk_factor_prevalence.low_risk[k].share }))}>
                    <XAxis type="number" hide domain={[0, "dataMax"]} />
                    <YAxis type="category" dataKey="factor" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--ink)" }} />
                    <Tooltip cursor={{ fill: "var(--paper-2)" }} content={<ChartTip fmt={(v) => pct(v)} />} />
                    <Bar dataKey="at" name="At-risk students" fill="var(--ink)" radius={[0, 4, 4, 0]} barSize={9} />
                    <Bar dataKey="low" name="Low-risk students" fill="var(--mint)" radius={[0, 4, 4, 0]} barSize={9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="row" style={{ gap: 16, fontSize: 12 }}>
                <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--ink)" }} />At-risk</span>
                <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--mint)" }} />Low risk</span>
              </div>
            </Card>

            <Card className="span-6" i={9}>
              <CardHead eyebrow="Outcome bands" title="Predicted grade bands" />
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={d.grade_bands} margin={{ left: -24 }}>
                    <XAxis dataKey="band" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "var(--paper-2)" }} content={<ChartTip />} />
                    <Bar dataKey="count" name="Students" radius={[8, 8, 0, 0]}>
                      {d.grade_bands.map((b) => <Cell key={b.band} fill={b.band === "F" ? "var(--high)" : b.band === "D" ? "var(--medium)" : "var(--ink)"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>A 16–20 · B 14–15 · C 12–13 · D 10–11 · F &lt; 10 (Cortez &amp; Silva 5-level scale)</div>
            </Card>

            <Card className="span-6" i={10}>
              <CardHead eyebrow="Activity" title="Recent predictions" />
              <div className="stack" style={{ gap: 0 }}>
                {d.recent_predictions.map((p) => (
                  <div key={p.id} className="row between" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
                    <div><div style={{ fontWeight: 500, fontSize: 14 }}>{p.student}</div>
                      <div className="mono muted" style={{ fontSize: 11 }}>{new Date(p.created_at + (p.created_at.endsWith("Z") ? "" : "Z")).toLocaleString()}</div></div>
                    <div className="row"><span className="mono" style={{ fontSize: 13 }}>{pct(p.pass_probability)}</span><RiskBadge risk={p.risk} /></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
