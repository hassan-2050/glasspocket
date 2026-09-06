"use client";

import { useEffect, useRef, useState } from "react";

interface CharityChatProps {
  ein: number;
  orgName: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
}

const MAX_QUESTION_LENGTH = 400;

const STARTER_QUESTIONS = [
  "Why did reserves change over the years?",
  "Is the staff spending share a red flag?",
  "How does this compare to similar charities?",
  "What's the biggest risk in these numbers?",
];

export default function CharityChat({ ein, orgName }: CharityChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const trimmed = question.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!trimmed || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", text: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/charity/${ein}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: nextMessages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", text: data.error ?? "Something went wrong.", isError: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Network error -- couldn't reach the server.", isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="rounded-xl border p-5 sm:p-6" style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}>
      <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Ask about {orgName}
      </h2>
      <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Answers are grounded only in this org&apos;s filed financial data above -- it won&apos;t guess at their
        programs, leadership, or anything not shown on this page.
      </p>

      {messages.length === 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded-full border px-3 py-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div ref={scrollRef} className="mb-4 max-h-96 space-y-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed"
                style={
                  m.role === "user"
                    ? { background: "var(--series-1)", color: "#ffffff" }
                    : {
                        background: "var(--background)",
                        color: m.isError ? "var(--status-critical)" : "var(--text-primary)",
                        border: "1px solid var(--border-hairline)",
                      }
                }
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--background)", color: "var(--text-muted)", border: "1px solid var(--border-hairline)" }}
              >
                Thinking…
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this charity's finances..."
          maxLength={MAX_QUESTION_LENGTH}
          disabled={loading}
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-60"
          style={{ background: "var(--background)", borderColor: "var(--border-hairline)", color: "var(--text-primary)" }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--series-1)" }}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
