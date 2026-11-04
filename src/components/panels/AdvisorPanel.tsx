"use client";

import { useEffect, useRef, useState } from "react";
import { suggestedQuestions } from "@/ai";
import { AiNotice } from "@/components/ui/AiNotice";
import { useAction } from "@/components/ui/useAction";
import { useProject } from "@/state/ProjectContext";

interface Message {
  role: "user" | "advisor";
  text: string;
  references?: string[];
}

export function AdvisorPanel({ focusComponentId }: { focusComponentId?: string }) {
  const { project, ai } = useProject();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const { busy, error, run } = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  const questions = suggestedQuestions(project);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setDraft("");
    const answer = await run(() => ai.askAdvisor(project, q, focusComponentId));
    if (answer) setMessages((m) => [...m, { role: "advisor", text: answer.answer, references: answer.references }]);
  };

  return (
    <div className="d-flex flex-column h-100">
      <AiNotice what="answer" />

      <div className="flex-grow-1" aria-live="polite">
        {messages.length === 0 && (
          <div className="mb-3">
            <p className="fw-semibold mb-2">Ask about this architecture</p>
            {questions.length === 0 ? (
              <p className="text-muted-ar fs-xs">Add components to the architecture to get suggested questions.</p>
            ) : (
              <div className="d-grid gap-2">
                {questions.map((q) => (
                  <button key={q} type="button" className="btn btn-outline-primary btn-sm text-start" onClick={() => ask(q)}>{q}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="d-grid gap-2">
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              <div style={{ whiteSpace: "pre-line" }}>{m.text}</div>
              {m.references && m.references.length > 0 && (
                <div className="fs-xs mt-2 text-muted-ar">Based on: {m.references.join(", ")}</div>
              )}
            </div>
          ))}
          {busy && <div className="chat-bubble advisor text-muted-ar">Thinking…</div>}
        </div>
        {error && <div className="alert alert-danger py-2 fs-xs mt-2" role="alert">{error}</div>}
        {messages.length > 0 && questions.length > 0 && (
          <div className="d-flex flex-wrap gap-1 mt-3">
            {questions.map((q) => (
              <button key={q} type="button" className="btn btn-sm btn-light border fs-xs" onClick={() => ask(q)}>{q}</button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="d-flex gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="advisor-input" className="visually-hidden">Ask the architecture advisor</label>
        <input id="advisor-input" className="form-control" placeholder="Ask a question…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim() || busy} aria-label="Send question">
          <i className="bi bi-send" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
