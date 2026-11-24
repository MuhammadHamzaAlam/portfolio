import { useRef, useSyncExternalStore } from 'react';
import type { DestId, Domain } from '../data/registry';

export type Mode = 'intro' | 'plaza' | 'guided' | 'travel' | 'arrived' | 'explore' | 'map';
export type Quality = 'high' | 'balanced' | 'low';

export interface State {
  started: boolean; // visitor pressed ENTER
  introDone: boolean;
  mode: Mode;
  location: DestId; // where the visitor currently is
  target: DestId | null; // where a journey is heading
  journeyPaused: boolean;
  journeyProgress: number;
  hoverDomain: Domain | null;
  selectedDomain: Domain | null;
  mapSelection: DestId | null;
  aionText: string | null;
  aionOpen: boolean;
  menu: null | 'menu' | 'content';
  contentSection: string;
  quality: Quality;
  reducedMotion: boolean;
  hint: string;
  doorOpen: DestId | null;
  aionReady: boolean;
  chatOpen: boolean;
}

const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isSmall = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700;

let state: State = {
  started: false,
  introDone: false,
  mode: 'intro',
  location: 'plaza',
  target: null,
  journeyPaused: false,
  journeyProgress: 0,
  hoverDomain: null,
  selectedDomain: null,
  mapSelection: null,
  aionText: null,
  aionOpen: false,
  menu: null,
  contentSection: 'about',
  quality: isSmall ? 'balanced' : 'high',
  reducedMotion: !!prefersReduced,
  hint: '',
  doorOpen: null,
  aionReady: false,
  chatOpen: false,
};

const subs = new Set<() => void>();
export const getState = () => state;
export function setState(p: Partial<State> | ((s: State) => Partial<State>)) {
  const patch = typeof p === 'function' ? p(state) : p;
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function subscribe(f: () => void) { subs.add(f); return () => subs.delete(f); }
function shallowEq(a: any, b: any) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
}
export function useStore<T>(sel: (s: State) => T): T {
  const cache = useRef<{ v: T } | null>(null);
  const get = () => {
    const v = sel(state);
    if (cache.current && shallowEq(cache.current.v, v)) return cache.current.v;
    cache.current = { v };
    return v;
  };
  return useSyncExternalStore(subscribe, get);
}

// imperative command bus: UI -> 3D controllers
type Cmd =
  | { type: 'go'; dest: DestId; how: 'guided' | 'direct' }
  | { type: 'skip' }
  | { type: 'selectDomain'; domain: Domain | null }
  | { type: 'plazaView' }
  | { type: 'skipIntro' }
  | { type: 'explore'; on: boolean };
const cmdSubs = new Set<(c: Cmd) => void>();
export const send = (c: Cmd) => cmdSubs.forEach((f) => f(c));
export const onCmd = (f: (c: Cmd) => void) => { cmdSubs.add(f); return () => { cmdSubs.delete(f); }; };
