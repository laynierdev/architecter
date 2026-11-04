"use client";

import { useRef, useState } from "react";
import type { Project } from "@/domain/types";

interface Message {
  role: "user" | "advisor";
  text: string;
}

const FALLBACK =
  "I can only answer the suggested questions in this prototype. Free-form questions about your architecture will be answered by the AI provider in Stage 3.";

export function AdvisorPanel({ project }: { project: Project }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const ask = (question: string) => {
    const scripted = project.advisorScript.find((s) => s.question.toLowerCase() === question.trim().toLowerCase());
    setMessages((m) => [...m, { role: "user", text: question }, { role: "advisor", text: scripted?.answer ?? FALLBACK }]);
    setDraft("");
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
  };

  return (
    <div className="d-flex flex-column h-100">
      <div className="alert alert-warning py-2 fs-xs d-flex gap-2" role="note">
        <i className="bi bi-robot" aria-hidden="true" />
        <div>
          <strong>Mock advisor.</strong> Answers are pre-written for this demo project. Real AI answers arrive in Stage 3.
        </div>
      </div>

      <div className="flex-grow-1" aria-live="polite">
        {messages.length === 0 && (
          <div className="mb-3">
            <p className="fw-semibold mb-2">Ask about this architecture</p>
            <div className="d-grid gap-2">
              {project.advisorScript.map((s) => (
                <button key={s.question} type="button" className="btn btn-outline-primary btn-sm text-start" onClick={() => ask(s.question)}>
                  {s.question}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="d-grid gap-2">
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.text}
            </div>
          ))}
        </div>
        {messages.length > 0 && (
          <div className="d-flex flex-wrap gap-1 mt-3">
            {project.advisorScript.map((s) => (
              <button key={s.question} type="button" className="btn btn-sm btn-light border fs-xs" onClick={() => ask(s.question)}>
                {s.question}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="d-flex gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) ask(draft);
        }}
      >
        <label htmlFor="advisor-input" className="visually-hidden">
          Ask the architecture advisor
        </label>
        <input id="advisor-input" className="form-control" placeholder="Ask a question…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()} aria-label="Send question">
          <i className="bi bi-send" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
