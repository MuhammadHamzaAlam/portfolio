// HRZ destination registry + route graph.
// Single source of truth: the 3D world, the map, guided routes and the HTML content views
// all read from this file. Coordinates are meters. +Z = north, origin = Monument.

export type DestId =
  | 'plaza'
  | 'earth-observation-center'
  | 'knowledge-library'
  | 'communication-tower'
  | 'smart-warehouse'
  | 'data-center'
  | 'career-pavilion';

export type Domain = 'cv' | 'rag' | 'voice' | 'ml' | 'data';

export interface Destination {
  id: DestId;
  name: string;
  project: string;
  short: string; // map / annotation line
  pos: [number, number]; // x, z of building centre
  /** half extents of collision footprint in building-local space (x = width/2, z = depth/2) */
  half: [number, number];
  /** lateral offset of the main door along the facade (building-local x) */
  doorX: number;
  domain?: Domain;
  tourStage: 0 | 1 | 2 | 3;
  aionIntro: string; // prewritten, verified text shown by AION on arrival
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'plaza',
    name: 'Central Plaza',
    project: 'HRZ Headquarters',
    short: 'Intelligence Monument and AION arrival platform',
    pos: [0, 0],
    half: [0, 0],
    doorX: 0,
    tourStage: 0,
    aionIntro:
      'Welcome to HRZ. I am AION, the city guide — a fictional AI character, not Hamza himself. Each building around this plaza holds one area of his engineering work. Select a branch of the Monument, or open the map.',
  },
  {
    id: 'earth-observation-center',
    name: 'Earth Observation Center',
    project: 'TerraTrace AI',
    short: 'Satellite change detection — Siamese U-Net with a shared ResNet18 encoder',
    pos: [-88, 46],
    half: [19, 14],
    doorX: 7.5,
    domain: 'cv',
    tourStage: 1,
    aionIntro:
      'This is the Earth Observation Center. TerraTrace AI compares two satellite images of the same place and segments where buildings changed, using a Siamese U-Net with a shared ResNet18 encoder. On 128 held-out test images it reached F1 0.857, IoU 0.749 and precision 0.834.',
  },
  {
    id: 'knowledge-library',
    name: 'Knowledge Library',
    project: 'RAG Document QA',
    short: 'PDF ingestion, recursive chunking, embeddings, ChromaDB + MMR retrieval',
    pos: [0, 96],
    half: [16, 13],
    doorX: 0,
    domain: 'rag',
    tourStage: 1,
    aionIntro:
      'The Knowledge Library holds the RAG Document QA project: PDFs are ingested, split by recursive chunking, embedded, and retrieved from ChromaDB with MMR so answers stay grounded in their sources. The original project generated answers with Qwen3-4B through Ollama.',
  },
  {
    id: 'communication-tower',
    name: 'Communication Tower',
    project: 'VoxAI',
    short: 'Speech recognition → language model → speech synthesis',
    pos: [86, 58],
    half: [13, 11],
    doorX: 4.8,
    domain: 'voice',
    tourStage: 1,
    aionIntro:
      'The Communication Tower presents VoxAI, a voice assistant pipeline: speech recognition, a language-model response, then speech synthesis. The original project used IBM Watson speech services and GPT-5 nano. Inside, the pipeline is shown as a labelled sample — nothing here records your voice.',
  },
  {
    id: 'smart-warehouse',
    name: 'Smart Warehouse',
    project: 'NexoRa',
    short: 'Demand forecasting and inventory replenishment (EOQ)',
    pos: [104, -30],
    half: [24, 16],
    doorX: 8.5,
    domain: 'ml',
    tourStage: 2,
    aionIntro:
      'The Smart Warehouse represents NexoRa — machine-learning-based inventory decisions: forecast demand, then decide when and how much to reorder. Inside, a local simulation lets you change demand and cost inputs and see the economic order quantity recalculate.',
  },
  {
    id: 'data-center',
    name: 'Data Center',
    project: 'Data Engineering',
    short: 'ETL: CSV / JSON / XML / web sources → validation → SQLite',
    pos: [-104, -30],
    half: [19, 15],
    doorX: 0,
    domain: 'data',
    tourStage: 2,
    aionIntro:
      'The Data Center covers data engineering: ingesting CSV, JSON, XML and web-extracted data, cleaning and validating it with Pandas and NumPy, and loading it into SQLite — with unit tests, Flake8 and process logging.',
  },
  {
    id: 'career-pavilion',
    name: 'Career & Credentials Pavilion',
    project: 'About · Education · Experience · Certifications · Contact',
    short: 'NED University, two internships, six certifications',
    pos: [62, -84],
    half: [17, 13],
    doorX: -8.5,
    tourStage: 3,
    aionIntro:
      'This pavilion is about the person behind the work: Muhammad Hamza Alam, BS Computer Science at NED University of Engineering and Technology, his two internships, and six certifications from Google, IBM and a Deloitte Australia job simulation on Forage.',
  },
];

export const DEST = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d])) as Record<DestId, Destination>;

/** Unit vector from a building toward the plaza: buildings face the Monument. */
export function frontOf(d: Destination): [number, number] {
  const [x, z] = d.pos;
  const l = Math.hypot(x, z) || 1;
  return [-x / l, -z / l];
}
export function rotYOf(d: Destination) {
  const [fx, fz] = frontOf(d);
  return Math.atan2(fx, fz); // local +Z (front) -> world front
}
export function doorOf(d: Destination): [number, number] {
  const [fx, fz] = frontOf(d);
  // local +X axis in world = (fz, -fx) for a building rotated so local +Z = front
  return [d.pos[0] + fx * d.half[1] + fz * d.doorX, d.pos[1] + fz * d.half[1] - fx * d.doorX];
}

// ---------------------------------------------------------------- domains
export const DOMAINS: { id: Domain; label: string; tech: string; dest: DestId; color: string }[] = [
  { id: 'cv', label: 'Computer Vision', tech: 'Siamese U-Net / ResNet18', dest: 'earth-observation-center', color: '#36E4FF' },
  { id: 'rag', label: 'Generative AI & RAG', tech: 'Chunking · Embeddings · ChromaDB · MMR', dest: 'knowledge-library', color: '#835CFF' },
  { id: 'voice', label: 'Voice AI', tech: 'STT → LLM → TTS', dest: 'communication-tower', color: '#9FEFFF' },
  { id: 'ml', label: 'Predictive ML', tech: 'Demand forecasting · EOQ', dest: 'smart-warehouse', color: '#D6B58A' },
  { id: 'data', label: 'Data Engineering', tech: 'Pandas · SQL · SQLite · ETL', dest: 'data-center', color: '#E8EEF4' },
];

// ---------------------------------------------------------------- route graph
export interface NavNode { id: string; p: [number, number] }
export const RING_R = 33;
const nodes: NavNode[] = [];
const edges: [string, string][] = [];
const RING_N = 16;
for (let i = 0; i < RING_N; i++) {
  const a = (i / RING_N) * Math.PI * 2;
  nodes.push({ id: `ring${i}`, p: [Math.sin(a) * RING_R, Math.cos(a) * RING_R] });
  edges.push([`ring${i}`, `ring${(i + 1) % RING_N}`]);
}
nodes.push({ id: 'gate-out', p: [0, -138] }, { id: 'gate-in', p: [0, -100] }, { id: 'aion-pad', p: [-9.6, -8.8] });
edges.push(['gate-out', 'gate-in'], ['gate-in', `ring${RING_N / 2}`], ['aion-pad', `ring${RING_N / 2}`], ['aion-pad', `ring${RING_N / 2 + 1}`]);

function nearestRing(x: number, z: number) {
  let best = 0, bd = Infinity;
  nodes.slice(0, RING_N).forEach((n, i) => {
    const d = Math.hypot(n.p[0] - x, n.p[1] - z);
    if (d < bd) { bd = d; best = i; }
  });
  return `ring${best}`;
}
for (const d of DESTINATIONS) {
  if (d.id === 'plaza') continue;
  const [dx, dz] = doorOf(d);
  const [fx, fz] = frontOf(d);
  nodes.push({ id: `${d.id}:door`, p: [dx + fx * 1.5, dz + fz * 1.5] });
  nodes.push({ id: `${d.id}:approach`, p: [dx + fx * 12, dz + fz * 12] });
  edges.push([`${d.id}:door`, `${d.id}:approach`], [`${d.id}:approach`, nearestRing(dx + fx * 12, dz + fz * 12)]);
}
// cross-connections between neighbouring districts (no detour through the centre)
edges.push(
  ['earth-observation-center:approach', 'knowledge-library:approach'],
  ['knowledge-library:approach', 'communication-tower:approach'],
  ['communication-tower:approach', 'smart-warehouse:approach'],
  ['smart-warehouse:approach', 'career-pavilion:approach'],
  ['data-center:approach', 'earth-observation-center:approach'],
);

export const NAV_NODES = nodes;
export const NAV_EDGES = edges;
const NODE = Object.fromEntries(nodes.map((n) => [n.id, n]));

export function findRoute(from: string, to: string): [number, number][] {
  const dist: Record<string, number> = {}, prev: Record<string, string | null> = {};
  const q = new Set(nodes.map((n) => n.id));
  nodes.forEach((n) => { dist[n.id] = Infinity; prev[n.id] = null; });
  dist[from] = 0;
  while (q.size) {
    let u = '', best = Infinity;
    q.forEach((id) => { if (dist[id] < best) { best = dist[id]; u = id; } });
    if (!u || u === to) break;
    q.delete(u);
    for (const [a, b] of edges) {
      const v = a === u ? b : b === u ? a : null;
      if (!v || !q.has(v)) continue;
      const w = Math.hypot(NODE[u].p[0] - NODE[v].p[0], NODE[u].p[1] - NODE[v].p[1]);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  const out: [number, number][] = [];
  for (let c: string | null = to; c; c = prev[c]) out.unshift(NODE[c].p);
  return out;
}

/** nearest graph node to a world position (for routes starting wherever the visitor is) */
export function nearestNode(x: number, z: number) {
  let best = nodes[0].id, bd = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(n.p[0] - x, n.p[1] - z);
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}
export const nodeFor = (id: DestId) => (id === 'plaza' ? 'aion-pad' : `${id}:door`);
