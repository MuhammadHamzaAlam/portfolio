import { useEffect, useRef, useState } from 'react';
import { useStore, setState, send, getState } from '../state/store';
import { DEST, DESTINATIONS, DOMAINS, type DestId } from '../data/registry';
import { OWNER } from '../data/content';
import { runtime, } from '../world/CityCanvas';
import { frameHooks } from '../world/runtime';

const rt = () => runtime!;

// ---------------------------------------------------------------- persistent HUD (spec 9.2)
export function Hud() {
  const s = useStore((x) => x);
  if (!s.introDone) return null;
  const locName = DEST[s.location].name;
  const hint =
    s.mode === 'plaza' ? (s.selectedDomain ? 'CHOOSE GUIDED OR DIRECT TRAVEL' : 'DRAG TO INSPECT · SELECT A MONUMENT BRANCH') :
    s.mode === 'guided' ? 'FOLLOW AION' : s.mode === 'travel' ? 'TRAVELLING' : s.mode === 'map' ? 'SELECT A BUILDING' :
    s.mode === 'explore' ? 'WASD / ARROWS TO WALK · MOUSE TO LOOK · E TO INTERACT · ESC TO RELEASE' : s.mode === 'arrived' ? 'DOORS OPEN · CLICK AION FOR THE INTRODUCTION' : '';
  return (
    <>
      <header className="hud-top">
        <button className="wordmark" onClick={() => send({ type: 'go', dest: 'plaza', how: s.location === 'plaza' ? 'direct' : 'guided' })} aria-label="HRZ — return to Central Plaza">
          <span className="wordmark__hrz">HRZ</span>
          <span className="wordmark__sub">AI INNOVATION CITY</span>
        </button>
        <TourRail />
        <nav className="hud-actions" aria-label="City navigation">
          <button className={'hbtn' + (s.mode === 'map' ? ' hbtn--on' : '')} onClick={() => rt().openMap(s.mode !== 'map')} aria-pressed={s.mode === 'map'}>MAP</button>
          <button className={'hbtn' + (s.mode === 'explore' ? ' hbtn--on' : '')} onClick={() => send({ type: 'explore', on: s.mode !== 'explore' })} aria-pressed={s.mode === 'explore'}>{s.mode === 'explore' ? 'GUIDED' : 'EXPLORE'}</button>
          <button className={'hbtn' + (s.aionOpen ? ' hbtn--on' : '')} onClick={() => setState({ aionOpen: !s.aionOpen, aionText: s.aionText ?? DEST[s.location].aionIntro })} aria-pressed={s.aionOpen}>AION</button>
          <button className={'hbtn' + (s.chatOpen ? ' hbtn--on' : '')} onClick={() => setState({ chatOpen: !s.chatOpen })} aria-pressed={s.chatOpen}>ASSISTANT</button>
          <button className="hbtn" onClick={() => setState({ menu: s.menu ? null : 'menu' })} aria-expanded={!!s.menu}>MENU</button>
        </nav>
      </header>
      <div className="hud-loc" aria-live="polite">
        <span className="hud-loc__dot" aria-hidden />
        <div>
          <div className="mono tiny muted">CURRENT LOCATION</div>
          <div className="hud-loc__name">{locName.toUpperCase()}</div>
        </div>
      </div>
      {hint && <div className="hud-hint mono">{hint}</div>}
      <div className="hud-settings">
        <label className="mono tiny">
          QUALITY
          <select value={s.quality} onChange={(e) => setState({ quality: e.target.value as any })} aria-label="Rendering quality">
            <option value="high">High</option>
            <option value="balanced">Balanced</option>
            <option value="low">Low</option>
          </select>
        </label>
        <button className={'hbtn hbtn--sm' + (s.reducedMotion ? ' hbtn--on' : '')} aria-pressed={s.reducedMotion} onClick={() => setState({ reducedMotion: !s.reducedMotion })}>REDUCED MOTION</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- guided tour rail (ZEPHYR)
const STAGES: { label: string; dest: DestId }[] = [
  { label: 'Arrival', dest: 'plaza' },
  { label: 'Explore Projects', dest: 'earth-observation-center' },
  { label: 'Discover Engineering', dest: 'smart-warehouse' },
  { label: 'Connect', dest: 'career-pavilion' },
];
function TourRail() {
  const loc = useStore((s) => s.location);
  const stage = DEST[loc].tourStage;
  return (
    <ol className="rail" aria-label="Guided tour progress">
      {STAGES.map((st, i) => (
        <li key={st.label} className={'rail__step' + (i === stage ? ' is-on' : i < stage ? ' is-done' : '')}>
          <button onClick={() => send({ type: 'go', dest: st.dest, how: 'guided' })} aria-current={i === stage ? 'step' : undefined}>
            <span className="rail__n mono">0{i + 1}</span>
            <span className="rail__l">{st.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- intro + identity
export function Intro({ ready }: { ready: boolean }) {
  const s = useStore((x) => ({ started: x.started, introDone: x.introDone, hint: x.hint, mode: x.mode }));
  if (s.introDone) return null;
  if (!s.started)
    return (
      <div className="intro">
        <div className="intro__copy">
          <div className="mono tiny gold">AN INTERACTIVE AI ENGINEERING EXPERIENCE</div>
          <h1 className="hero"><span className="hero__hrz">HRZ</span><span>ENTER THE MIND</span><span>BEHIND THE MACHINE.</span></h1>
          <div className="intro__actions">
            <button className="btn" disabled={!ready} onClick={() => rt().startIntro()}>{ready ? 'ENTER THE CITY' : 'PREPARING THE CITY…'}</button>
            <button className="btn btn--ghost" disabled={!ready} onClick={() => { setState({ started: true }); send({ type: 'skipIntro' }); }}>Skip intro</button>
            <button className="btn btn--ghost" onClick={() => setState({ menu: 'content', contentSection: 'about' })}>Content without 3D</button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="intro intro--playing">
      <div className={'caption' + (s.hint === 'approach' ? ' is-on' : '')}><span className="mono tiny gold">THE CITY</span><p>Seven buildings. Each one holds real engineering work.</p></div>
      <div className={'caption' + (s.hint === 'plaza' ? ' is-on' : '')}><span className="mono tiny gold">CENTRAL PLAZA</span><p>The Intelligence Monument connects five engineering domains to their buildings.</p></div>
      <button className="btn btn--ghost skip" onClick={() => send({ type: 'skipIntro' })}>Skip intro ⏭</button>
    </div>
  );
}

export function Identity() {
  const s = useStore((x) => ({ introDone: x.introDone, mode: x.mode, menu: x.menu, dismissed: x.hint === 'identity-closed', sel: x.selectedDomain }));
  if (!s.introDone || s.mode !== 'plaza' || s.dismissed || s.sel) return null;
  return (
    <section className="identity" aria-label="About the owner">
      <div className="mono tiny gold">AI / ML ENGINEER — ENGINEERING INTELLIGENCE.</div>
      <h2 className="identity__name display"><span>{OWNER.first}</span><span>{OWNER.last}</span></h2>
      <p>{OWNER.summary}</p>
      <div className="identity__actions">
        <button className="btn" onClick={() => send({ type: 'explore', on: true })}>EXPLORE THE CITY</button>
        <button className="btn btn--line" onClick={() => send({ type: 'go', dest: 'earth-observation-center', how: 'guided' })}>START GUIDED TOUR</button>
        <button className="btn btn--line" onClick={() => setState({ aionOpen: true, aionText: DEST.plaza.aionIntro })}>TALK TO AION</button>
        <button className="btn btn--line" onClick={() => setState({ menu: 'content', contentSection: 'about' })}>VIEW RÉSUMÉ</button>
        <button className="btn btn--line" onClick={() => rt().openMap(true)}>OPEN MAP</button>
      </div>
      <button className="identity__close" aria-label="Hide introduction panel" onClick={() => setState({ hint: 'identity-closed' })}>✕</button>
    </section>
  );
}

// ---------------------------------------------------------------- monument annotations (KATANA) + keyboard domain bar
export function MonumentLabels() {
  const s = useStore((x) => ({ mode: x.mode, hover: x.hoverDomain, sel: x.selectedDomain, introDone: x.introDone }));
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    const f = () => {
      const r = runtime;
      if (!r) return;
      for (const d of DOMAINS) {
        const el = refs.current[d.id];
        const p = r.projected[d.id];
        if (el && p) { el.style.transform = `translate(${p.x}px, ${p.y}px)`; el.style.opacity = p.visible ? '' : '0'; }
      }
    };
    frameHooks.add(f);
    return () => { frameHooks.delete(f); };
  }, []);
  if (!s.introDone || s.mode !== 'plaza') return null;
  return (
    <>
      <div className="labels" aria-hidden>
        {DOMAINS.map((d) => {
          const on = s.hover === d.id || s.sel === d.id;
          return (
            <div key={d.id} ref={(el) => (refs.current[d.id] = el)} className={'anno' + (on ? ' anno--on' : '') + (s.sel && s.sel !== d.id ? ' anno--dim' : '')} style={{ ['--c' as any]: d.color }}>
              <span className="anno__dot" />
              <div className="anno__card">
                <div className="anno__title">{d.label.toUpperCase()}</div>
                {on && <><div className="mono tiny">{d.tech}</div><div className="anno__proj">{DEST[d.dest].project}</div></>}
              </div>
            </div>
          );
        })}
      </div>
      <DomainBar />
    </>
  );
}

function DomainBar() {
  const sel = useStore((x) => x.selectedDomain);
  const dom = DOMAINS.find((d) => d.id === sel);
  return (
    <div className="domainbar" role="group" aria-label="Monument domains">
      <div className="domainbar__list">
        {DOMAINS.map((d) => (
          <button key={d.id} className={'dbtn' + (sel === d.id ? ' dbtn--on' : '')} style={{ ['--c' as any]: d.color }} aria-pressed={sel === d.id}
            onClick={() => send({ type: 'selectDomain', domain: sel === d.id ? null : d.id })}
            onFocus={() => { rt().monument.setHover(d.id); }} onBlur={() => rt().monument.setHover(null)}>
            <span className="dbtn__sw" />{d.label}
          </button>
        ))}
      </div>
      {dom && (
        <div className="domainbar__go">
          <div><div className="mono tiny muted">{dom.tech}</div><strong>{DEST[dom.dest].name} — {DEST[dom.dest].project}</strong></div>
          <button className="btn" onClick={() => send({ type: 'go', dest: dom.dest, how: 'guided' })}>FOLLOW AION</button>
          <button className="btn btn--line" onClick={() => send({ type: 'go', dest: dom.dest, how: 'direct' })}>TRAVEL DIRECTLY</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- map (spec 9.6)
export function MapPanel() {
  const s = useStore((x) => ({ mode: x.mode, sel: x.mapSelection, loc: x.location }));
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const f = () => {
      const r = runtime; if (!r) return;
      for (const d of DESTINATIONS) {
        const el = refs.current[d.id]; const p = r.projected[d.id];
        if (el && p) { el.style.transform = `translate(${p.x}px, ${p.y}px)`; el.style.opacity = p.visible ? '' : '0'; }
      }
    };
    frameHooks.add(f);
    return () => { frameHooks.delete(f); };
  }, []);
  if (s.mode !== 'map') return null;
  const sel = s.sel ? DEST[s.sel] : null;
  return (
    <>
      <div className="labels">
        {DESTINATIONS.map((d) => (
          <button key={d.id} ref={(el) => (refs.current[d.id] = el)} className={'maplabel' + (s.sel === d.id ? ' maplabel--on' : '') + (s.loc === d.id ? ' maplabel--here' : '')} onClick={() => rt().previewRoute(d.id)}>
            {s.loc === d.id && <span className="mono tiny gold">YOU ARE HERE · </span>}{d.name}
          </button>
        ))}
      </div>
      <aside className="mappanel" aria-label="City map">
        <div className="mono tiny muted">CITY MAP · SITE MODEL</div>
        <ul className="maplist">
          {DESTINATIONS.map((d) => (
            <li key={d.id}><button className={s.sel === d.id ? 'on' : ''} onClick={() => rt().previewRoute(d.id)}>{d.name}<span className="muted">{d.project}</span></button></li>
          ))}
        </ul>
        {sel && (
          <div className="mapsel">
            <div className="mono tiny gold">{sel.project}</div>
            <h3>{sel.name}</h3>
            <p className="muted">{sel.short}</p>
            <div className="mapsel__actions">
              <button className="btn" onClick={() => send({ type: 'go', dest: sel.id, how: 'guided' })} disabled={sel.id === s.loc}>GUIDE ME THERE</button>
              <button className="btn btn--line" onClick={() => send({ type: 'go', dest: sel.id, how: 'direct' })} disabled={sel.id === s.loc}>TRAVEL DIRECTLY</button>
            </div>
          </div>
        )}
        <div className="mapsel__actions">
          <button className="btn btn--ghost" onClick={() => send({ type: 'go', dest: 'plaza', how: 'direct' })}>RETURN TO PLAZA</button>
          <button className="btn btn--ghost" onClick={() => rt().openMap(false)}>CLOSE MAP</button>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------- journey bar (spec 9.4)
export function JourneyBar() {
  const s = useStore((x) => ({ mode: x.mode, target: x.target, loc: x.location, p: x.journeyProgress, paused: x.journeyPaused }));
  if ((s.mode !== 'guided' && s.mode !== 'travel') || !s.target) return null;
  return (
    <div className="journey" role="status">
      <div className="journey__route mono tiny"><span>{DEST[s.loc].name.toUpperCase()}</span><span className="journey__arrow">→</span><span className="gold">{DEST[s.target].name.toUpperCase()}</span></div>
      <div className="journey__bar"><div style={{ width: `${Math.round(s.p * 100)}%` }} /></div>
      <div className="journey__status mono tiny muted">{s.mode === 'guided' ? (s.paused ? 'PAUSED' : 'AION IS LEADING THE WAY') : 'DIRECT TRAVEL'}</div>
      <div className="journey__actions">
        {s.mode === 'guided' && <button className="hbtn" onClick={() => rt().setPaused(!s.paused)}>{s.paused ? 'RESUME' : 'PAUSE'}</button>}
        <button className="hbtn" onClick={() => send({ type: 'skip' })}>SKIP JOURNEY</button>
        <button className="hbtn" onClick={() => { send({ type: 'skip' }); setTimeout(() => rt().openMap(true), 50); }}>RETURN TO MAP</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- arrival card
export function Arrival() {
  const s = useStore((x) => ({ mode: x.mode, loc: x.location }));
  if (s.mode !== 'arrived') return null;
  const d = DEST[s.loc];
  return (
    <section className="arrival" aria-label={`${d.name} entrance`}>
      <div className="mono tiny gold">{d.project.toUpperCase()}</div>
      <h2 className="display">{d.name}</h2>
      <p className="muted">{d.short}</p>
      <div className="arrival__actions">
        <button className="btn" disabled aria-describedby="interior-note">ENTER BUILDING</button>
        <button className="btn btn--line" onClick={() => send({ type: 'go', dest: 'plaza', how: 'guided' })}>BACK TO PLAZA WITH AION</button>
        <button className="btn btn--ghost" onClick={() => rt().openMap(true)}>MAP</button>
      </div>
      <p id="interior-note" className="note">Doors are open. This building's interior exhibition is the next build stage and is not available yet.</p>
    </section>
  );
}

// ---------------------------------------------------------------- AION panel (text only; no audio)
const TOPICS: { label: string; act: () => void }[] = [
  { label: "Show me Hamza's computer vision work", act: () => send({ type: 'selectDomain', domain: 'cv' }) },
  { label: 'Show me the RAG project', act: () => send({ type: 'selectDomain', domain: 'rag' }) },
  { label: 'Show me the voice AI work', act: () => send({ type: 'selectDomain', domain: 'voice' }) },
  { label: 'Show me predictive ML', act: () => send({ type: 'selectDomain', domain: 'ml' }) },
  { label: 'Show me data engineering', act: () => send({ type: 'selectDomain', domain: 'data' }) },
  { label: 'Take me to the Career Pavilion', act: () => send({ type: 'go', dest: 'career-pavilion', how: 'guided' }) },
];
export function AionPanel() {
  const s = useStore((x) => ({ open: x.aionOpen, text: x.aionText, mode: x.mode, introDone: x.introDone, loc: x.location }));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = () => {
      const p = runtime?.projected.aion; const el = ref.current;
      if (!el || !p) return;
      // docked panel; a thin leader line points at AION when visible
      const lead = el.querySelector<HTMLElement>('.aion__lead');
      if (!lead) return;
      const r = el.getBoundingClientRect();
      if (!p.visible || innerWidth < 760) { lead.style.opacity = '0'; return; }
      const x0 = r.left, y0 = r.top + 18, dx = p.x - x0, dy = p.y - y0;
      lead.style.opacity = '1';
      lead.style.width = `${Math.hypot(dx, dy)}px`;
      lead.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    };
    frameHooks.add(f);
    return () => { frameHooks.delete(f); };
  }, []);
  if (!s.open || !s.introDone || s.mode === 'guided' || s.mode === 'travel' || s.mode === 'map' || s.mode === 'explore') return null;
  return (
    <div className="aion" ref={ref} role="dialog" aria-label="AION, the city guide">
      <span className="aion__lead" aria-hidden />
      <div className="aion__head"><span className="aion__glyph" aria-hidden /> <span className="mono tiny">AION · AI CITY GUIDE</span><button className="aion__x" aria-label="Close AION" onClick={() => setState({ aionOpen: false })}>✕</button></div>
      <p>{s.text}</p>
      {s.loc === 'plaza' && s.mode === 'plaza' && (
        <details className="aion__topics">
          <summary className="mono tiny">ASK AION · prewritten guide responses</summary>
          {TOPICS.map((t) => <button key={t.label} onClick={t.act}>{t.label}</button>)}
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- menu
export function Menu() {
  const menu = useStore((x) => x.menu);
  if (menu !== 'menu') return null;
  const go = (sec: string) => setState({ menu: 'content', contentSection: sec });
  return (
    <nav className="menu" aria-label="Main menu">
      <div className="mono tiny muted">DESTINATIONS</div>
      {DESTINATIONS.map((d) => <button key={d.id} onClick={() => send({ type: 'go', dest: d.id, how: 'direct' })}>{d.name}<span className="muted"> · {d.project}</span></button>)}
      <div className="mono tiny muted" style={{ marginTop: 14 }}>CONTENT (NO 3D REQUIRED)</div>
      {['about', 'projects', 'education', 'experience', 'certifications', 'contact'].map((x) => <button key={x} onClick={() => go(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
      <button onClick={() => setState({ menu: null, chatOpen: true })}>Ask the HRZ AI Portfolio Assistant</button>
    </nav>
  );
}

// ---------------------------------------------------------------- explore controls (desktop + touch)
export function ExploreUI() {
  const mode = useStore((x) => x.mode);
  const [touch] = useState(() => matchMedia('(pointer: coarse)').matches);
  const knob = useRef<HTMLDivElement>(null);
  if (mode !== 'explore') return null;
  const onJoy = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
    const l = Math.min(1, Math.hypot(x, y)), a = Math.atan2(y, x);
    runtime?.setJoystick(Math.cos(a) * l, -Math.sin(a) * l);
    if (knob.current) knob.current.style.transform = `translate(${Math.cos(a) * l * 34}px, ${Math.sin(a) * l * 34}px)`;
  };
  const end = () => { runtime?.setJoystick(0, 0); if (knob.current) knob.current.style.transform = ''; };
  return (
    <>
      <div className="crosshair" aria-hidden />
      <div className="explore-help mono tiny">{touch ? 'LEFT STICK TO WALK · DRAG RIGHT SIDE TO LOOK' : 'CLICK THE VIEW TO LOCK THE MOUSE · ESC RELEASES IT · E OPENS NEARBY DOORS'}</div>
      <div className="joy" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onJoy(e); }} onPointerMove={(e) => e.buttons && onJoy(e)} onPointerUp={end} onPointerCancel={end} aria-label="Movement joystick" role="application">
        <div className="joy__knob" ref={knob} />
      </div>
      <div className="explore-exit">
        <button className="btn btn--line" onClick={() => send({ type: 'go', dest: 'plaza', how: 'direct' })}>RETURN TO PLAZA</button>
        <button className="btn btn--line" onClick={() => runtime?.openMap(true)}>OPEN MAP</button>
      </div>
    </>
  );
}
void getState;
