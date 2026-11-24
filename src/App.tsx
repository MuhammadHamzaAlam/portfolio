import { useEffect, useState, lazy, Suspense } from 'react';
import { useStore, setState } from './state/store';
import { Hud, Intro, Identity, MonumentLabels, MapPanel, JourneyBar, Arrival, AionPanel, Menu, ExploreUI } from './ui/Hud';
import { ContentView } from './ui/Content';
import { ChatPanel } from './ui/Chat';

const CityCanvas = lazy(() => import('./world/CityCanvas'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function App() {
  const [gl] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const menu = useStore((s) => s.menu);
  const quality = useStore((s) => s.quality);
  const chatOpen = useStore((s) => s.chatOpen);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setState((s) => ({ menu: null, chatOpen: s.menu ? s.chatOpen : false, aionOpen: s.menu || s.chatOpen ? s.aionOpen : false })); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);

  if (!gl) return <main className="fallback"><p className="note">Your browser cannot render the 3D city (WebGL unavailable). All portfolio content is available below.</p><ContentView standalone /></main>;

  return (
    <main className="app">
      <Suspense fallback={null}>
        <CityCanvas key={quality} onReady={() => setReady(true)} />
      </Suspense>
      {!ready && <div className="loading mono tiny" role="status">LOADING HRZ — BUILDING THE CITY…</div>}
      <Intro ready={ready} />
      <Hud />
      <Identity />
      <MonumentLabels />
      <MapPanel />
      <JourneyBar />
      <Arrival />
      <AionPanel />
      <ExploreUI />
      <Menu />
      {menu === 'content' && <ContentView />}
      {chatOpen && menu !== 'content' && <ChatPanel />}
    </main>
  );
}
