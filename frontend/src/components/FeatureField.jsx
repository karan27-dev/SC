import { Seg, Slider, Toggle } from "./ui";

const titleCase = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Renders one model feature from the backend schema (range / select / bool). */
export default function FeatureField({ name, meta, value, onChange }) {
  if (meta.type === "bool") {
    const on = value === true || value === "yes";
    return (
      <div className="bool-field">
        <span style={{ fontSize: 14, fontWeight: 500 }}>{meta.label}</span>
        <Toggle value={on} onChange={(v) => onChange(name, v)} />
      </div>
    );
  }
  if (meta.type === "select") {
    const opts = meta.options.map((o, i) => [o, meta.optionLabels?.[i] ?? titleCase(o)]);
    return (
      <div className="field">
        <div className="field-label">{meta.label}</div>
        {opts.length <= 4
          ? <Seg wide options={opts} value={value} onChange={(v) => onChange(name, v)} />
          : <select className="select" value={value} onChange={(e) => onChange(name, e.target.value)}>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>}
        {meta.hint && <div className="muted" style={{ fontSize: 12 }}>{meta.hint}</div>}
      </div>
    );
  }
  const enabled = value !== null && value !== undefined && value !== "";
  const v = enabled ? Number(value) : meta.min;
  const shown = meta.scale ? meta.scale[v - meta.min] ?? v : v;
  return (
    <div className="field">
      <div className="field-label">
        <span>{meta.label}</span>
        {meta.optional && !enabled
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(name, Math.round((meta.min + meta.max) / 2))}>Add</button>
          : <span className="mono">{shown}{meta.optional && <button type="button" className="icon-btn" style={{ display: "inline", padding: "0 0 0 8px" }} onClick={() => onChange(name, null)}>×</button>}</span>}
      </div>
      {(!meta.optional || enabled) && <>
        <Slider min={meta.min} max={meta.max} value={v} onChange={(n) => onChange(name, n)} />
        <div className="ticks"><span>{meta.scale?.[0] ?? meta.min}</span><span>{meta.scale?.at(-1) ?? meta.max}</span></div>
      </>}
    </div>
  );
}
