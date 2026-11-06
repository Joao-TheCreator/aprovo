"use client";

import { X } from "lucide-react";
import { useState } from "react";

const MAX_TAGS = 30;

export function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^#+/, "").toLowerCase())
    .filter((t) => /^[\p{L}\p{N}_]{1,100}$/u.test(t));
}

export function HashtagInput({
  value,
  onChange,
  id,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  id?: string;
}) {
  const [text, setText] = useState("");

  function commit(raw: string) {
    const next = [...value];
    for (const t of parseTags(raw)) if (!next.includes(t) && next.length < MAX_TAGS) next.push(t);
    onChange(next);
  }

  return (
    <div>
      <div className="border-input bg-card focus-within:ring-ring/50 flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 focus-within:ring-[3px]">
        {value.map((tag) => (
          <span
            key={tag}
            className="bg-lavanda text-roxo inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm font-semibold"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remover hashtag ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2"
            >
              <X aria-hidden className="size-4" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          disabled={value.length >= MAX_TAGS}
          placeholder={value.length ? "" : "Digite e use espaço ou vírgula"}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.target.value;
            if (/[\s,;]/.test(v)) {
              commit(v);
              setText("");
            } else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text) commit(text);
              setText("");
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (text) commit(text);
            setText("");
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (/[\s,;#]/.test(pasted)) {
              e.preventDefault();
              commit(pasted);
            }
          }}
          className="min-w-32 flex-1 bg-transparent text-[15px] outline-none"
        />
      </div>
      <p className="text-muted-foreground mt-1 text-right text-xs" aria-live="polite">
        {value.length}/{MAX_TAGS}
      </p>
    </div>
  );
}
