import {
  validateCopy,
  validateDesign,
  validateTopics,
} from "./content-workflow.mjs";
const string = { type: "string", minLength: 1 };
const array = (items, minItems = 0, maxItems = 1000) => ({
  type: "array",
  items,
  minItems,
  maxItems,
});
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
});
const bounded = (n) => ({ ...string, maxLength: n });
const number = { type: "integer", minimum: 0 };
const nullableNumber = { anyOf: [number, { type: "null" }] };
const copy = object({
  title: bounded(120),
  caption: bounded(6000),
  slides: array(object({ title: bounded(30), body: bounded(130) }), 3, 6),
});
const file = object({
  name: string,
  width: { const: 1080 },
  height: { const: 1350 },
  sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
});
const rendered = object({ ...copy.properties, files: array(file, 3, 6) });
export const artifactSchemas = {
  EvidenceSet: {
    anyOf: [
      { type: "null" },
      object({ sources: array(object({ id: string }), 1, 30) }),
    ],
  },
  ResearchReport: string,
  TopicOptions: array(
    object({
      title: bounded(120),
      angle: bounded(1000),
      sourceIds: array(string, 1, 30),
    }),
    1,
    5,
  ),
  Copy: copy,
  DesignPlan: object({
    style: { enum: ["graphic", "street", "surreal", "typographic", "warm-editorial"] },
  }),
  RenderedSet: rendered,
  Delivery: object({ ...rendered.properties, approvedAt: string }),
  Synthesis: string,
  ScheduleDraft: object({
    snapshot: object({
      title: string,
      caption: string,
      images: array(file, 3, 6),
      deliveryId: string,
      deliveryHash: string,
    }),
    scheduledAt: string,
    timezone: { const: "Asia/Taipei" },
    accountId: string,
  }),
  InsightReport: object({
    observations: array(
      object({
        metric: string,
        value: nullableNumber,
        knownRows: number,
        totalRows: number,
        citations: array(
          object({
            rowId: string,
            field: string,
            value: number,
            source: string,
          }),
        ),
      }),
    ),
    hypotheses: array(string),
    experiments: array(string),
    datasetHash: string,
  }),
  TrackingReceipt: array({}),
  Result: {},
  Text: string,
  Plan: object({
    workflowId: { anyOf: [string, { type: "null" }] },
    reply: string,
  }),
};
export function validateArtifact(type, value, { sources = [] } = {}) {
  const schema = artifactSchemas[type];
  if (!schema) throw Error("未知 Artifact 型別：" + type);
  const check = (s, v) => {
    if (s.const !== undefined) return v === s.const;
    if (s.enum) return s.enum.includes(v);
    if (s.type === "integer")
      return Number.isSafeInteger(v) && v >= (s.minimum ?? -Infinity);
    if (s.anyOf) return s.anyOf.some((x) => check(x, v));
    if (s.type === "null") return v === null;
    if (s.type === "array")
      return (
        Array.isArray(v) &&
        (!s.minItems || v.length >= s.minItems) &&
        (!s.maxItems || v.length <= s.maxItems) &&
        (!s.items || v.every((x) => check(s.items, x)))
      );
    if (s.type === "string")
      return (
        typeof v === "string" &&
        v.trim().length > 0 &&
        (!s.maxLength || v.length <= s.maxLength) &&
        (!s.pattern || new RegExp(s.pattern).test(v))
      );
    if (s.type === "object")
      return (
        !!v &&
        !Array.isArray(v) &&
        typeof v === "object" &&
        (!s.required || s.required.every((k) => Object.hasOwn(v, k))) &&
        (!s.properties ||
          Object.entries(s.properties).every(
            ([k, x]) => !Object.hasOwn(v, k) || check(x, v[k]),
          ))
      );
    return true;
  };
  if (!check(schema, value))
    throw Object.assign(Error(type + " 結構驗證失敗。"), {
      code: "schema_invalid",
    });
  if (type === "Copy") validateCopy(value);
  if (type === "DesignPlan") validateDesign(value);
  if (type === "TopicOptions") validateTopics({ topics: value }, sources);
  if (["RenderedSet", "Delivery"].includes(type)) {
    validateCopy(value);
    if (
      value.files.length !== value.slides.length ||
      value.files.some(
        (f) =>
          !f.name ||
          f.width !== 1080 ||
          f.height !== 1350 ||
          !/^([a-f0-9]{64})$/.test(f.sha256),
      )
    )
      throw Error("PNG metadata 不完整。");
  }
  const refs = value?.sourceIds;
  if (
    refs &&
    (!Array.isArray(refs) ||
      refs.some((id) => !sources.some((s) => s.id === id)))
  )
    throw Error("Artifact 引用不存在的 sourceId。");
  return value;
}
