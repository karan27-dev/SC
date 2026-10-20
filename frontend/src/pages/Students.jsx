import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Search, Upload } from "lucide-react";
import { api } from "../api";
import { Card, PageHead, ProbBar, RiskBadge, Seg, Skeleton, pct, useToast } from "../components/ui";

const SIZE = 15;

export default function Students() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(params.get("q") || "");
  const [toast, notify] = useToast();
  const fileRef = useRef(null);
  const risk = params.get("risk") || "";
  const subject = params.get("subject") || "";
  const sort = params.get("sort") || "risk";
  const page = Number(params.get("page") || 1);

  const update = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    if (k !== "page") p.delete("page");
    setParams(p, { replace: true });
  };

  useEffect(() => {
    if (q === (params.get("q") || "")) return;
    const t = setTimeout(() => update("q", q), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const load = () => {
    const query = { page, size: SIZE, sort };
    if (params.get("q")) query.q = params.get("q");
    if (risk) query.risk = risk;
    if (subject) query.subject = subject;
    api.students(query).then(setData);
  };
  useEffect(load, [params]); // eslint-disable-line

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await api.uploadStudents(f);
      notify(`Imported ${r.created} students · ${r.high_risk} high risk`);
      load();
    } catch (ex) { notify(ex.message); }
    e.target.value = "";
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <>
      <PageHead index="02" eyebrow="Students" title="Every student, ranked by risk."
        sub="Pass probability comes from the early-warning model. Add period grades on a student's page to switch to the full model.">
        <input ref={fileRef} type="file" accept=".csv" hidden onChange={onUpload} />
        <button className="btn btn-ghost" onClick={() => fileRef.current.click()}><Upload size={16} /> Import CSV</button>
        <Link to="/predict" className="btn btn-primary"><Plus size={16} /> Add student</Link>
      </PageHead>

      <Card i={1} style={{ padding: 0 }}>
        <div className="row wrap" style={{ padding: 16, gap: 10, borderBottom: "1px solid var(--line)" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
            <Search size={16} style={{ position: "absolute", left: 14, top: 15, opacity: 0.4 }} />
            <input className="input" style={{ paddingLeft: 40 }} placeholder="Search name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Seg options={[["", "All"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} value={risk} onChange={(v) => update("risk", v)} />
          <Seg options={[["", "All subjects"], ["maths", "Maths"], ["science", "Science"], ["english", "English"], ["hindi", "Hindi"], ["history", "History"]]} value={subject} onChange={(v) => update("subject", v)} />
          <select className="select" style={{ width: 170, height: 38, marginLeft: "auto" }} value={sort} onChange={(e) => update("sort", e.target.value)}>
            <option value="risk">Sort: highest risk</option>
            <option value="grade">Sort: best grade</option>
            <option value="name">Sort: name</option>
            <option value="recent">Sort: newest</option>
          </select>
        </div>

        {!data ? <div style={{ padding: 16 }}><Skeleton h={420} /></div> : data.items.length === 0 ? (
          <div className="empty">No students match these filters.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Subject</th><th>Pass probability</th><th>Pred. grade</th><th>Actual</th><th>Model</th><th>Risk</th></tr></thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} onClick={() => nav(`/students/${s.id}`)}>
                    <td>
                      <div className="row" style={{ gap: 12 }}>
                        <div className="avatar" style={{ background: "var(--paper-2)", color: "var(--ink)", border: "1px solid var(--line)" }}>{s.name[0]}</div>
                        <div><div style={{ fontWeight: 500 }}>{s.name}</div><div className="mono muted" style={{ fontSize: 11 }}>{s.code}</div></div>
                      </div>
                    </td>
                    <td className="muted" style={{ textTransform: "capitalize" }}>{s.subject}</td>
                    <td><div className="row" style={{ gap: 10 }}><ProbBar value={s.pass_probability} /><span className="mono" style={{ fontSize: 12 }}>{pct(s.pass_probability)}</span></div></td>
                    <td className="mono">{s.predicted_grade?.toFixed(1)}</td>
                    <td className="mono muted">{s.actual_grade ?? "—"}</td>
                    <td><span className="tag">{s.mode}</span></td>
                    <td><RiskBadge risk={s.risk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row between" style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
          <span className="mono muted" style={{ fontSize: 12 }}>{data?.total ?? 0} students</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => update("page", page - 1)}><ChevronLeft size={14} /></button>
            <span className="mono" style={{ fontSize: 12 }}>{page} / {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => update("page", page + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      </Card>
      {toast}
    </>
  );
}
