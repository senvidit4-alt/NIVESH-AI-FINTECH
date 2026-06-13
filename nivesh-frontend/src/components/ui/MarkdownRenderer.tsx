/**
 * MarkdownRenderer.tsx
 * Lightweight markdown renderer for Nivesh AI chat.
 * Supports: tables, **bold**, *italic*, `code`, ```blocks```, # headings, lists, ---
 * Zero external deps — uses pure React + regex parsing.
 */

import React from "react";

// ── Inline parser ────────────────────────────────────────────────────────────
function parseInline(text: string): React.ReactNode[] {
  // Handle inline patterns: **bold**, *italic*, `code`, and plain text
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));

    if (m[2] !== undefined) {
      parts.push(<strong key={m.index} className="font-semibold text-foreground">{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      parts.push(<em key={m.index} className="italic text-foreground/90">{m[3]}</em>);
    } else if (m[4] !== undefined) {
      parts.push(
        <code key={m.index} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary border border-primary/20">
          {m[4]}
        </code>
      );
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ── Table renderer ───────────────────────────────────────────────────────────
function parseTable(lines: string[]): React.ReactNode {
  const rows = lines.map((l) =>
    l
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())
  );

  if (rows.length < 2) return null;

  const headers = rows[0];
  // Row 1 is the separator (|---|---|), skip it
  const bodyRows = rows.slice(2);

  // Detect alignment from separator row
  const sepRow = rows[1] ?? [];
  const alignments: ("left" | "right" | "center")[] = sepRow.map((s) => {
    if (s.startsWith(":") && s.endsWith(":")) return "center";
    if (s.endsWith(":")) return "right";
    return "left";
  });

  const alignClass = (i: number) =>
    alignments[i] === "right"
      ? "text-right"
      : alignments[i] === "center"
      ? "text-center"
      : "text-left";

  return (
    <div className="my-3 w-full overflow-x-auto rounded-xl border border-white/10 shadow-lg">
      <table className="w-full border-collapse text-[12px] leading-relaxed">
        <thead>
          <tr className="border-b border-white/10 bg-primary/10">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 font-semibold text-primary tracking-wide whitespace-nowrap ${alignClass(i)}`}
              >
                {parseInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-white/5 transition-colors hover:bg-white/5 ${
                ri % 2 === 0 ? "bg-black/10" : "bg-transparent"
              }`}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 text-foreground/90 whitespace-nowrap ${alignClass(ci)}`}
                >
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Block classifier ─────────────────────────────────────────────────────────
type Block =
  | { type: "heading"; level: number; content: string }
  | { type: "hr" }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "table"; lines: string[] }
  | { type: "bullet"; items: string[] }
  | { type: "paragraph"; content: string };

function tokenise(raw: string): Block[] {
  const lines = raw.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", lang, lines: codeLines });
      continue;
    }

    // Markdown table (line starts and ends with |, or next line is separator)
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "table", lines: tableLines });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, content: headingMatch[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*•]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && (/^[-*•]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
        items.push(lines[i].replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "bullet", items });
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — accumulate until empty line or block-level element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("|") &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !/^[-*•]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^[-*_]{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ── Main component ───────────────────────────────────────────────────────────
export function MarkdownRenderer({ content }: { content: string }) {
  const blocks = tokenise(content);

  return (
    <div className="markdown-body space-y-1.5 leading-relaxed">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "heading": {
            const Tag = `h${Math.min(block.level, 4)}` as "h1" | "h2" | "h3" | "h4";
            const sizeClass =
              block.level === 1
                ? "text-base font-bold"
                : block.level === 2
                ? "text-sm font-semibold"
                : "text-sm font-medium";
            return (
              <Tag key={idx} className={`${sizeClass} text-foreground mt-2 mb-0.5`}>
                {parseInline(block.content)}
              </Tag>
            );
          }

          case "hr":
            return <hr key={idx} className="my-2 border-white/10" />;

          case "code":
            return (
              <pre
                key={idx}
                className="my-2 overflow-x-auto rounded-lg bg-black/40 border border-white/10 p-3 font-mono text-[11px] text-primary/90 leading-relaxed"
              >
                <code>{block.lines.join("\n")}</code>
              </pre>
            );

          case "table":
            return <React.Fragment key={idx}>{parseTable(block.lines)}</React.Fragment>;

          case "bullet":
            return (
              <ul key={idx} className="my-1 space-y-0.5 pl-4">
                {block.items.map((item, ii) => (
                  <li key={ii} className="flex gap-2 text-foreground/90">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span>{parseInline(item)}</span>
                  </li>
                ))}
              </ul>
            );

          case "paragraph":
            return (
              <p key={idx} className="text-foreground/90">
                {parseInline(block.content)}
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
