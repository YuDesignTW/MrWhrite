import { unified } from "unified";
import remarkParse from "remark-parse";
export function toPlainText(markdown) {
  const tree = unified().use(remarkParse).parse(markdown);
  function visit(node) {
    if (node.type === "html" || node.type === "definition") return "";
    if (node.type === "image") return node.alt || "";
    if (node.type === "break") return "\n";
    if (typeof node.value === "string")
      return node.value + (node.type === "code" ? "\n\n" : "");
    const content = (node.children || []).map(visit).join("");
    if (["paragraph", "heading", "blockquote", "list"].includes(node.type))
      return content.trimEnd() + "\n\n";
    if (node.type === "listItem") return content.trimEnd() + "\n";
    return content;
  }
  return visit(tree).trim() + "\n";
}
