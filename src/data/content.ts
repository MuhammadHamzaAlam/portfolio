// Verified portfolio content. Source: owner's HRZ specification (résumé facts quoted there).
// Nothing here may be embellished. No invented links, metrics, achievements or URLs.

export const OWNER = {
  name: 'Muhammad Hamza Alam',
  first: 'MUHAMMAD',
  last: 'HAMZA ALAM',
  title: 'AI / ML Engineer',
  identity: 'AI / ML Engineer · Generative AI Developer · Computer Vision & Voice AI Developer',
  location: 'Karachi, Pakistan',
  email: 'muhammadhamzaalam2@gmail.com',
  summary:
    'From geospatial computer vision to conversational AI, I build intelligent systems connecting research with practical applications.',
};

export const EDUCATION = {
  school: 'NED University of Engineering and Technology',
  degree: 'Bachelor of Science in Computer Science',
  period: 'October 2023 – August 2027 (expected)',
  cgpa: '3.5 / 4.0',
  focus: ['Artificial Intelligence', 'Data Science', 'Web Development'],
};

export const EXPERIENCE = [
  {
    org: 'Skyline Builders and Developers',
    role: 'Data Analyst Intern',
    period: 'July – August 2025',
    items: ['Data cleaning', 'Exploratory data analysis', 'SQL', 'Power BI', 'Excel', 'Tableau'],
  },
  {
    org: 'Karachi Development Authority',
    role: 'IT Trainee',
    period: 'June 22 – August 15, 2026',
    items: ['IT support', 'Computer systems', 'Software troubleshooting', 'Routine IT operations'],
  },
];

export type Cert = { org: 'Google' | 'IBM' | 'Deloitte Australia'; title: string; id: string; platform?: string; note?: string };
export const CERTS: Cert[] = [
  { org: 'Google', title: 'Google AI Professional Certificate', id: 'SYKY1UUPNW98' },
  { org: 'IBM', title: 'Python for Data Science and Artificial Intelligence', id: 'TGC1K6KWLTRV' },
  { org: 'IBM', title: 'Developing AI Applications with Python and Flask', id: 'O4DFCTTFYJNF' },
  { org: 'IBM', title: 'Building Generative AI-Powered Applications with Python', id: 'CLS9T9O72C3A' },
  { org: 'IBM', title: 'Machine Learning With Python', id: 'LNH502SIYFL3' },
  {
    org: 'Deloitte Australia',
    title: 'Deloitte Australia — Technology Job Simulation',
    id: 'RgJSahZbumZRcuEoF',
    platform: 'Forage',
    note: 'A completed job simulation on Forage — simulated work experience, not employment at Deloitte.',
  },
];

export const PROJECTS = [
  {
    dest: 'earth-observation-center',
    name: 'TerraTrace AI',
    area: 'Computer vision · Geospatial change detection',
    body: 'Detects building change between two co-registered satellite images using a Siamese U-Net with a shared ResNet18 encoder, feature comparison, a decoder producing a change mask, and geospatial post-processing for analyst review.',
    facts: ['F1 0.857', 'IoU 0.749', 'Precision 0.834', '128 held-out test images'],
  },
  {
    dest: 'knowledge-library',
    name: 'RAG Document QA',
    area: 'Generative AI · Retrieval-augmented generation',
    body: 'Answers questions over PDFs: ingestion, recursive chunking, embeddings stored in ChromaDB, MMR retrieval for diverse relevant evidence, and source-grounded answers generated locally with Qwen3-4B via Ollama.',
    facts: ['ChromaDB', 'MMR retrieval', 'Qwen3-4B via Ollama'],
  },
  {
    dest: 'communication-tower',
    name: 'VoxAI',
    area: 'Voice AI',
    body: 'A voice assistant pipeline: speech recognition, a language-model response and speech synthesis. The original project used IBM Watson STT/TTS and GPT-5 nano.',
    facts: ['IBM Watson STT / TTS', 'GPT-5 nano'],
  },
  {
    dest: 'smart-warehouse',
    name: 'NexoRa',
    area: 'Predictive machine learning',
    body: 'Machine-learning-based inventory decisions and demand forecasting, presented here with a local economic-order-quantity simulation.',
    facts: ['Demand forecasting', 'Inventory replenishment', 'EOQ'],
  },
  {
    dest: 'data-center',
    name: 'Data Engineering',
    area: 'ETL and data quality',
    body: 'Ingests CSV, JSON, XML and web-extracted data, cleans and validates it, and loads it into SQLite — with Pandas, NumPy, SQL, unittest, Flake8 and process logging.',
    facts: ['Pandas', 'NumPy', 'SQL / SQLite', 'unittest', 'Flake8', 'Logging'],
  },
] as const;
