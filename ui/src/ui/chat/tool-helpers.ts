/**
 * 工具卡片渲染的辅助函数。
 */

import { PREVIEW_MAX_CHARS, PREVIEW_MAX_LINES } from "./constants.ts";

/**
 * 格式化工具输出内容以在侧边栏显示。
 * 检测 JSON 并将其包装在带有格式的代码块中。
 */
export function formatToolOutputForSidebar(text: string): string {
  const trimmed = text.trim();
  // 尝试检测并格式化 JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    } catch {
      // 不是有效的 JSON，按原样返回
    }
  }
  return text;
}

/**
 * 获取工具输出文本的截断预览。
 * 截断为前 N 行或前 N 个字符，以较短者为准。
 */
export function getTruncatedPreview(text: string): string {
  const allLines = text.split("\n");
  const lines = allLines.slice(0, PREVIEW_MAX_LINES);
  const preview = lines.join("\n");
  if (preview.length > PREVIEW_MAX_CHARS) {
    return preview.slice(0, PREVIEW_MAX_CHARS) + "…";
  }
  return lines.length < allLines.length ? preview + "…" : preview;
}
