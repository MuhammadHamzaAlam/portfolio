import { useRef, useState } from 'react';
import { postJSON } from './api';
import { ChatPanel } from './Chat';
import { OWNER, EDUCATION, EXPERIENCE, CERTS, PROJECTS } from '../data/content';
import { setState, useStore, send } from '../state/store';
import type { DestId } from '../data/registry';

const SECTIONS = [
  ['about', 'About'],
  ['projects', 'Projects'],
  ['education', 'Education'],
  ['experience', 'Experience'],
  ['certifications', 'Certifications'],
  ['contact', 'Contact'],
  ['assistant', 'Assistant'],
] as const;

/** Conventional, fully readable content route (spec 6.7.7, 9 non-WebGL fallback). */
export function ContentView({ standalone = false }: { standalone?: boolean }) {
  const section = useStore((s) => s.contentSection);
  const close = () => setState({ menu: null });
  return (
    <div className={standalone ? 'content content--standalone' : 'content'} role="dialog" aria-modal={!standalone} aria-label="HRZ portfolio content">
      <header className="content__head">
        <div>
          <div className="eyebrow">HRZ · PORTFOLIO CONTENT</div>
          <h2 className="display">{OWNER.name}</h2>
        </div>
        {!standalone && <button className="btn btn--ghost" onClick={close} aria-label="Close content">Close ✕</button>}
      </header>
      <nav className="content__tabs" aria-label="Sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={'tab' + (section === id ? ' tab--on' : '')} aria-current={section === id} onClick={() => setState({ contentSection: id })}>{label}</button>
        ))}
      </nav>
      <div className="content__body">
        {section === 'about' && <About />}
        {section === 'projects' && <Projects standalone={standalone} />}
        {section === 'education' && <Education />}
        {section === 'experience' && <Experience />}
        {section === 'certifications' && <Certs />}
        {section === 'contact' && <Contact />}
        {section === 'assistant' && <ChatPanel embedded />}
      </div>
    </div>
  );
}

function About() {
  return (
    <section>
      <p className="mono muted">{OWNER.identity}</p>
      <p className="lede">{OWNER.summary}</p>
      <dl className="facts">
        <div><dt>Location</dt><dd>{OWNER.location}</dd></div>
        <div><dt>Email</dt><dd><a href={`mailto:${OWNER.email}`}>{OWNER.email}</a></dd></div>
        <div><dt>Education</dt><dd>BS Computer Science, NED University (expected 2027)</dd></div>
      </dl>
      <p className="note">Résumé: this site presents the résumé's verified contents (this view). A downloadable PDF has not been supplied yet.</p>
    </section>
  );
}

function Projects({ standalone }: { standalone: boolean }) {
  return (
    <section className="grid2">
      {PROJECTS.map((p) => (
        <article key={p.name} className="entry">
          <div className="eyebrow">{p.area}</div>
          <h3>{p.name}</h3>
          <p>{p.body}</p>
          <ul className="chips">{p.facts.map((f) => <li key={f}>{f}</li>)}</ul>
          {!standalone && <button className="btn btn--line" onClick={() => send({ type: 'go', dest: p.dest as DestId, how: 'direct' })}>Visit building →</button>}
        </article>
      ))}
    </section>
  );
}

function Education() {
  return (
    <section>
      <h3>{EDUCATION.school}</h3>
      <p>{EDUCATION.degree}</p>
      <dl className="facts">
        <div><dt>Period</dt><dd>{EDUCATION.period}</dd></div>
        <div><dt>CGPA</dt><dd>{EDUCATION.cgpa}</dd></div>
        <div><dt>Concentrations</dt><dd>{EDUCATION.focus.join(' · ')}</dd></div>
      </dl>
    </section>
  );
}

function Experience() {
  return (
    <section className="grid2">
      {EXPERIENCE.map((e) => (
        <article key={e.org} className="entry">
          <div className="eyebrow">{e.period}</div>
          <h3>{e.role}</h3>
          <p className="muted">{e.org}</p>
          <ul className="chips">{e.items.map((i) => <li key={i}>{i}</li>)}</ul>
        </article>
      ))}
    </section>
  );
}

function Certs() {
  return (
    <section>
      <p className="note">Organisation names are shown as plain text. No company logos are displayed and no endorsement is implied. Credential IDs are listed as recorded; verification links have not been supplied, so none are shown.</p>
      <ul className="certs">
        {CERTS.map((c) => (
          <li key={c.id} className="entry">
            <div className="eyebrow">{c.org}{c.platform ? ` · via ${c.platform}` : ''}</div>
            <h3>{c.title}</h3>
            <p className="mono">Credential ID: {c.id}</p>
            {c.note && <p className="muted">{c.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contact() {
  const [v, setV] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [serverMsg, setServerMsg] = useState('');
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const startedAt = useRef(Date.now());
  const inFlight = useRef(false);
  const errs = {
    name: v.name.trim().length < 2 ? 'Please enter your name.' : '',
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim()) ? '' : 'Please enter a valid email address.',
    subject: v.subject.trim().length < 3 ? 'Please add a subject.' : '',
    message: v.message.trim().length < 10 ? 'Message should be at least 10 characters.' : v.message.length > 5000 ? 'Message is too long (max 5000).' : '',
  };
  const valid = Object.values(errs).every((e) => !e);
  const fieldErr = (k: keyof typeof errs) => (touched && errs[k]) || serverFields[k] || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || inFlight.current) return; // prevent duplicate submissions
    inFlight.current = true;
    setStatus('sending'); setServerMsg(''); setServerFields({});
    const res = await postJSON<{ ok: true; id: string }>('/api/contact', {
      name: v.name.trim(), email: v.email.trim(), subject: v.subject.trim(), message: v.message.trim(),
      website: v.website, elapsed_ms: Date.now() - startedAt.current,
    });
    inFlight.current = false;
    if (res.ok) { setStatus('sent'); setV({ name: '', email: '', subject: '', message: '', website: '' }); setTouched(false); }
    else { setStatus('error'); setServerMsg(res.error); setServerFields(res.fields ?? {}); }
  };

  return (
    <section>
      <p className="lede">Send a message, or write directly to <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.</p>
      {status === 'sent' ? (
        <div className="form-ok" role="status">
          <strong>Message sent.</strong> Thank you — it has been delivered to Muhammad Hamza Alam's inbox, and he can reply to you directly by email.
          <div><button className="btn btn--line" onClick={() => { setStatus('idle'); startedAt.current = Date.now(); }}>Write another message</button></div>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate aria-busy={status === 'sending'}>
          {(['name', 'email', 'subject'] as const).map((k) => (
            <label key={k}>
              <span>{k === 'name' ? 'Your name' : k === 'email' ? 'Your email' : 'Subject'}</span>
              <input type={k === 'email' ? 'email' : 'text'} name={k} autoComplete={k === 'subject' ? 'off' : k} maxLength={k === 'email' ? 254 : k === 'name' ? 100 : 150}
                value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-invalid={!!fieldErr(k)} disabled={status === 'sending'} />
              {fieldErr(k) && <em role="alert">{fieldErr(k)}</em>}
            </label>
          ))}
          <label>
            <span>Message</span>
            <textarea rows={6} name="message" maxLength={5000} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} aria-invalid={!!fieldErr('message')} disabled={status === 'sending'} />
            {fieldErr('message') && <em role="alert">{fieldErr('message')}</em>}
          </label>
          {/* honeypot: hidden from people, filled by bots */}
          <label className="hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" name="website" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} /></label>
          <div className="form__row">
            <button type="submit" className="btn" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send message'}</button>
          </div>
          {status === 'error' && <p className="form-err" role="alert">{serverMsg} You can also email <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.</p>}
        </form>
      )}
    </section>
  );
}
