import React from "react";

const statusLabel = {
  running: "進行中",
  completed: "已完成",
  failed: "失敗",
  cancelled: "已停止",
  interrupted: "已中斷",
};
const checkLabel = {
  facts: "事實依據",
  hook: "開場與讀者價值",
  sequence: "逐頁敘事",
  voice: "語氣與觀點",
  caption: "貼文文案",
};

export function IGWorkflowLog({ run }) {
  if (run?.workflow !== "ig-carousel" || !run.steps?.length) return null;
  return (
    <details className="ig-workflow-log">
      <summary>製作紀錄 · {run.steps.length} 個步驟</summary>
      <p>這裡記錄內容創作與文字審查；尚未進行圖片視覺驗收。</p>
      {run.steps.map((step) => (
        <details key={step.id}>
          <summary>
            {step.name} · {statusLabel[step.status] || step.status}
          </summary>
          {step.result?.reply && <p>{step.result.reply}</p>}
          {step.result?.summary && <p>{step.result.summary}</p>}
          {step.result?.proposals?.map((proposal, index) => (
            <div key={index}>
              <strong>
                提案 {index + 1}
                {proposal.title ? `：${proposal.title}` : ""}
              </strong>
              {proposal.caption && <p>{proposal.caption}</p>}
              {proposal.slides && (
                <ol>
                  {proposal.slides.map((slide, i) => (
                    <li key={i}>
                      <strong>{slide.title}</strong>
                      <p>{slide.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              {proposal.checks && (
                <ul>
                  {proposal.checks.map((check) => (
                    <li key={check.id}>
                      <strong>
                        {checkLabel[check.id]} ·{" "}
                        {check.passed ? "通過" : "需修改"}
                      </strong>
                      <p>{check.evidence}</p>
                      {!check.passed && <p>修改方向：{check.action}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </details>
      ))}
    </details>
  );
}
