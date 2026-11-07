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
      <div className="border-input bg-surface-2/60 hover:border-brand-ink/60 focus-within:border-brand-ink focus-within:bg-surface focus-within:shadow-glow flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border-[1.5px] px-3 py-2 transition-[border-color,box-shadow,background-color] duration-(--ap-dur-fast)">
        {value.map((tag) => (
          <span
            key={tag}
            className="bg-gradient-brand text-on-brand animate-pop-in inline-flex items-center gap-0.5 rounded-full py-0.5 pr-0.5 pl-3 text-sm font-bold"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remover hashtag ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="focus-visible:ring-on-brand relative flex size-8 items-center justify-center rounded-full outline-none after:absolute after:-inset-1.5 after:content-[''] hover:bg-white/15 focus-visible:ring-2"
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
          className="placeholder:text-muted-foreground md:text-body min-h-8 min-w-32 flex-1 bg-transparent text-base outline-none"
        />
      </div>
      <p
        className={
          value.length >= MAX_TAGS
            ? "text-warning-ink mt-1 text-right text-xs font-bold"
            : "text-muted-foreground mt-1 text-right text-xs font-semibold"
        }
        aria-live="polite"
      >
        {value.length}/{MAX_TAGS}
      </p>
    </div>
  );
}
