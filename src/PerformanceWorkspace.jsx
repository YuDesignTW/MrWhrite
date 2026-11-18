import React, { useEffect, useState } from "react";
import { api } from "./api";
export function PerformanceWorkspace({ team, project }) {
  const base = `/teams/${team.id}/projects/${project.id}`;
  const [datasets, setDatasets] = useState([]),
    [source, setSource] = useState(""),
    [rows, setRows] = useState(""),
    [report, setReport] = useState(null),
    [error, setError] = useState("");
  const load = () =>
    api(base + "/performance")
      .then(setDatasets)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [base]);
  async function submit(e) {
    e.preventDefault();
    try {
      await api(base + "/performance", "POST", {
        source,
        rows: JSON.parse(rows),
      });
      setRows("");
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="tw-right-scroll rw-panel">
      <h2>成效資料與洞察</h2>
      <p>只分析你提供的資料。尚未連接平台；未知數值使用 null。</p>
      <form onSubmit={submit}>
        <label>
          資料來源與期間
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
          />
        </label>
        <label>
          匯入 JSON 資料列
          <textarea
            rows={7}
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            placeholder={
              '[{"id":"post-1","views":null,"likes":null,"comments":null,"saves":null,"shares":null}]'
            }
            required
          />
        </label>
        <button type="submit">保存資料</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {datasets.map((d) => (
        <article key={d.id}>
          <h3>{d.source}</h3>
          <p>{d.rows.length} 筆 · 手動提供</p>
          <button
            onClick={async () => {
              try {
                setReport(
                  (
                    await api(
                      base + "/performance/" + d.id + "/insight",
                      "POST",
                      {},
                    )
                  ).content,
                );
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            產生可追溯洞察
          </button>
        </article>
      ))}
      {report && (
        <section>
          <h3>資料觀察</h3>
          {report.observations.map((o) => (
            <details key={o.metric}>
              <summary>
                {o.metric}：{o.value ?? "未知"}（{o.knownRows}/{o.totalRows}{" "}
                筆已知）
              </summary>
              <pre>{JSON.stringify(o.citations, null, 2)}</pre>
            </details>
          ))}
          <p>{report.limitations}</p>
          {report.hypotheses.map((v, i) => (
            <p key={i}>{v}</p>
          ))}
          {report.experiments.map((v, i) => (
            <p key={i}>{v}</p>
          ))}
        </section>
      )}
    </div>
  );
}
