import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { postJSON } from './api';
import { setState } from '../state/store';

interface Source { label: string; section: string; title: string; pages: number[] }
interface Msg { role: 'user' | 'assistant'; content: string; sources?: Source[]; error?: boolean }

// conversation persists while the page is open (shared by the floating panel and the Assistant tab)
let messages: Msg[] = [];
let pending = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const useChat = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => messages);
const usePending = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => pending);

const SUGGESTIONS = [
  'Who is Muhammad Hamza Alam?',
  'What AI and machine-learning projects has he built?',
  'Explain TerraTrace AI.',
  'Which certifications has he earned?',
];

async function ask(text: string) {
  const q = text.trim();
  if (!q || pending) return;
  const history = messages.filter((m) => !m.error).slice(-8).map(({ role, content }) => ({ role, content }));
  messages = [...messages, { role: 'user', content: q }];
  pending = true;
  emit();
  const res = await postJSON<{ ok: true; answer: string; sources: Source[] }>('/api/chat', { message: q, history }, 45000);
  pending = false;
  messages = res.ok
    ? [...messages, { role: 'assistant', content: res.answer, sources: res.sources }]
    : [...messages, { role: 'assistant', content: res.error, error: true }];
  emit();
}

/** Renders answer text: [S1] markers become small references; bare https links become anchors. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[S\d+\]|https?:\/\/[^\s)\]]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[S\d+\]$/.test(p) ? <sup key={i} className="chat__ref">{p.slice(1, -1)}</sup>
          : /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>
          : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

export function ChatPanel({ embedded = false }: { embedded?: boolean }) {
  const msgs = useChat();
  const busy = usePending();
  const [input, setInput] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, busy]);
  useEffect(() => { if (!embedded) inputRef.current?.focus(); }, [embedded]);

  const send = () => { const q = input; setInput(''); void ask(q); };
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');

  return (
    <section className={'chat' + (embedded ? ' chat--embedded' : '')} role={embedded ? undefined : 'dialog'} aria-label="HRZ AI Portfolio Assistant">
      <header className="chat__head">
        <div>
          <div className="chat__title">HRZ AI Portfolio Assistant</div>
          <div className="mono tiny muted">Answers from Muhammad Hamza Alam's résumé · powered by Gemini</div>
        </div>
        <div className="chat__actions">
          <button className="hbtn hbtn--sm" onClick={() => { messages = []; emit(); }} disabled={!msgs.length || busy}>CLEAR</button>
          {!embedded && <button className="hbtn hbtn--sm" aria-label="Close assistant" onClick={() => setState({ chatOpen: false })}>✕</button>}
        </div>
      </header>
      <div className="chat__log" ref={logRef} aria-live="polite">
        {!msgs.length && (
          <div className="chat__intro">
            <p>Hi — I'm the HRZ AI Portfolio Assistant. I answer questions about Muhammad Hamza Alam's professional background and engineering projects, using his résumé as my only source. If something isn't in the résumé, I'll say so.</p>
            <div className="chat__suggest">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => void ask(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`chat__msg chat__msg--${m.role}` + (m.error ? ' chat__msg--error' : '')}>
            <div className="chat__bubble"><Rich text={m.content} /></div>
            {m.sources && m.sources.length > 0 && (
              <ul className="chat__sources" aria-label="Sources">
                {m.sources.map((s) => (
                  <li key={s.label}><span className="chat__ref">{s.label}</span> {s.section} — {s.title} · p.{s.pages.join(', ')}</li>
                ))}
              </ul>
            )}
            {m.error && i === msgs.length - 1 && lastUser && (
              <button className="hbtn hbtn--sm" onClick={() => { messages = messages.slice(0, -2); emit(); void ask(lastUser.content); }}>RETRY</button>
            )}
          </div>
        ))}
        {busy && <div className="chat__msg chat__msg--assistant"><div className="chat__bubble chat__typing" aria-label="Assistant is thinking"><span /><span /><span /></div></div>}
      </div>
      <form className="chat__form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea ref={inputRef} rows={1} maxLength={1000} value={input} placeholder="Ask about Hamza's projects, skills, education…" aria-label="Your question"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>{busy ? '…' : 'SEND'}</button>
      </form>
    </section>
  );
}
