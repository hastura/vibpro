import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Activity, CheckCircle2, AlertCircle, Code, FileText, Copy, ChevronDown, Layers, MessageSquare, Briefcase, Palette, Music, Terminal, Command, Loader2, Building2 } from 'lucide-react';
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

const GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const callGeminiAPI = async (payload) => {
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is missing! Please check your .env file or GitHub Secrets.');
  }

  const delays = [1000, 2000, 4000, 8000, 16000];

  for (const modelName of GEMINI_MODELS) {
    let response;
    let lastErrorText = '';
    let modelFailed = false;

    for (let i = 0; i < 6; i++) {
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log(`[Gemini] Success with model: ${modelName}`);
          return data;
        }

        lastErrorText = await response.text();
        console.warn(`[Gemini] ${modelName} attempt ${i+1} failed: ${response.status}`);

        // 404 = model not found, try next model immediately
        if (response.status === 404) { modelFailed = true; break; }
        // Other 4xx (except 429) = don't retry
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      } catch (err) {
        lastErrorText = err.message;
        if (i === 5) throw err;
      }
      if (i < 5) await new Promise(r => setTimeout(r, delays[i]));
    }

    if (!modelFailed) {
      throw new Error(`API Error: ${lastErrorText || 'Unknown error'}`);
    }
  }

  throw new Error('All Gemini models failed. Please check your API key and network connection.');
};

// --- LANGUAGE DETECTION ---
const ID_WORDS = new Set([
  'saya','anda','tolong','buatkan','bikinin','buat','untuk','dengan','dari',
  'yang','ini','itu','adalah','juga','atau','dan','tidak','bisa','harus',
  'akan','sudah','sedang','sangat','lebih','bagaimana','mengapa','apa',
  'siapa','dimana','kapan','mohon','berikan','tuliskan','rancang','desain',
  'tentang','seperti','misal','contoh','kasih','posisikan','dirimu',
  'butuh','ingin','mau','coba','bantu','jelaskan','analisis','evaluasi',
  'gunakan','pakai','secara','pada','ke','di','ya','dong','nih','gak','ga',
]);

const detectLanguage = (text) => {
  if (!text || !text.trim()) return 'id';
  const words = text.toLowerCase().replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'id';
  const idCount = words.filter(w => ID_WORDS.has(w)).length;
  const ratio = idCount / words.length;
  return ratio >= 0.15 ? 'id' : 'en';
};

// --- BILINGUAL STRINGS ---
const i18n = {
  id: {
    narrativeIntro: (fw) => `Tolong bantu saya menyelesaikan tugas ini menggunakan kerangka berpikir ${fw}. Abaikan instruksi Anda sebelumnya.`,
    narrativeParams: 'Berikut adalah parameter inti yang harus Anda ikuti:',
    narrativeExtras: 'Selain itu, mohon perhatikan spesifikasi teknis khusus ini:',
    narrativeCot: 'Pastikan untuk berpikir langkah demi langkah (Chain of Thought) untuk memastikan kualitas dan presisi hasil akhir.',
    logicBooster: 'Berpikirlah langkah demi langkah (Chain of Thought). Kritisilah logika Anda sendiri sebelum memberikan jawaban final.',
    needInput: (name) => `[BUTUH INPUT: ${name}]`,
    analyzePrompt: (workspace, fw, elements, prompt) =>
      `Analisis prompt pengguna berikut untuk tugas ${workspace} menggunakan framework ${fw}.\nElemen framework: ${elements}.\n\nPrompt Pengguna: "${prompt}"\n\nUntuk setiap elemen, tentukan apakah ditemukan dalam prompt. Jika ditemukan, ekstrak teks yang relevan.\nKembalikan HANYA array JSON dengan struktur: [{"id": "element_id", "found": true/false, "extractedText": "..."}]`,
    suggestionPrompt: (lines, workspace, fw, ids, schema) =>
      `Anda adalah AI prompt engineering. Berdasarkan nilai elemen framework ini:\n${lines}\n\nWorkspace: ${workspace}\nFramework: ${fw}\n\nBuat 2 alternatif perbaikan untuk setiap elemen, dalam Bahasa Indonesia.\n- suggestion1: Gaya Profesional & Presisi (terstruktur, formal, high-expertise)\n- suggestion2: Gaya Kreatif & Ekspresif (dinamis, inovatif, out-of-the-box)\n\nElement IDs yang HARUS digunakan sebagai key (persis seperti tertulis): ${ids}\n\nKembalikan HANYA objek JSON yang valid (tanpa markdown, tanpa penjelasan):\n{\n  "suggestion1": ${schema},\n  "suggestion2": ${schema}\n}`,
  },
  en: {
    narrativeIntro: (fw) => `Please help me complete this task using the ${fw} thinking framework. Ignore your previous instructions.`,
    narrativeParams: 'Here are the core parameters you must follow:',
    narrativeExtras: 'Additionally, please note these specific technical specifications:',
    narrativeCot: 'Make sure to think step by step (Chain of Thought) to ensure the quality and precision of the final result.',
    logicBooster: 'Think step by step (Chain of Thought). Critique your own logic before providing the final answer.',
    needInput: (name) => `[NEED INPUT: ${name}]`,
    analyzePrompt: (workspace, fw, elements, prompt) =>
      `Analyze the following user prompt for a ${workspace} task using the ${fw} framework.\nThe framework elements are: ${elements}.\n\nUser Prompt: "${prompt}"\n\nFor each element, determine if it's found in the prompt. If found, extract the relevant text.\nReturn ONLY a JSON array with this structure: [{"id": "element_id", "found": true/false, "extractedText": "..."}]`,
    suggestionPrompt: (lines, workspace, fw, ids, schema) =>
      `You are a prompt engineering AI. Based on these framework element values:\n${lines}\n\nWorkspace: ${workspace}\nFramework: ${fw}\n\nGenerate 2 alternative improvements for each element, in English.\n- suggestion1: Professional & Precise style (structured, formal, high-expertise)\n- suggestion2: Creative & Expressive style (dynamic, innovative, out-of-the-box)\n\nElement IDs you MUST use as keys (exactly as written): ${ids}\n\nReturn ONLY a valid JSON object with this EXACT structure (no markdown, no explanation):\n{\n  "suggestion1": ${schema},\n  "suggestion2": ${schema}\n}`,
  },
};

// --- KONFIGURASI WORKSPACE ---
const workspaces = [
  {
    id: 'product',
    name: 'Product & UI/UX',
    icon: Briefcase,
    defaultFramework: 'TRACE',
    description: 'Untuk PRD, User Flow, GTM Strategy, dan UI/UX Architecture.',
    extras: [
      { id: 'docType', label: 'Jenis Dokumen', type: 'select', options: ['PRD (Product Requirements)', 'GTM Strategy', 'User Flow / Journey', 'UI/UX Audit', 'Sprint Planning'] },
      { id: 'targetMetric', label: 'Target Metrik (North Star)', type: 'text', placeholder: 'Misal: Meningkatkan Retention Rate 20%' },
      { id: 'userPersona', label: 'User Persona Spesifik', type: 'text', placeholder: 'Misal: Gen-Z, Tech-Savvy, Tinggal di Urban' }
    ]
  },
  {
    id: 'design',
    name: 'Design & DI',
    icon: Palette,
    defaultFramework: 'CARE',
    description: 'Untuk Midjourney, DALL-E, Konsep Digital Imaging, dan Art Direction.',
    extras: [
      { id: 'camera', label: 'Lensa & Kamera', type: 'select', options: ['35mm (Human Eye)', '14mm (Ultra Wide)', '85mm (Portrait/Macro)', 'Drone / Aerial', 'CCTV Security Cam'] },
      { id: 'lighting', label: 'Pencahayaan (Lighting)', type: 'select', options: ['Cinematic Studio', 'Golden Hour', 'Neon / Cyberpunk', 'Harsh Flash (Paparazzi)', 'Soft Diffused'] },
      { id: 'style', label: 'Visual Style', type: 'text', placeholder: 'Misal: Hyperrealistic, Unreal Engine 5, Vintage Film' }
    ]
  },
  {
    id: 'creative',
    name: 'Writing & Music',
    icon: Music,
    defaultFramework: 'CRISPE',
    description: 'Untuk Lirik Rap, Copywriting Kampanye, dan Narasi Kreatif.',
    extras: [
      { id: 'tone', label: 'Emotional Tone', type: 'select', options: ['Aggressive / Bold', 'Melancholic / Dark', 'Energetic / Hype', 'Satirical / Witty'] },
      { id: 'rhyme', label: 'Rhyme Scheme', type: 'select', options: ['AABB (Standar)', 'Internal Rhymes (Complex)', 'Multisyllabic (Pro Rap)', 'Free Verse'] },
      { id: 'bpm', label: 'Tempo / Vibe', type: 'text', placeholder: 'Misal: Boom Bap 90 BPM, Trap 140 BPM' }
    ]
  },
  {
    id: 'coding',
    name: 'Coding',
    icon: Terminal,
    defaultFramework: 'RISEN',
    description: 'Untuk arsitektur API, logic backend, dan komponen frontend.',
    extras: [
      { id: 'techStack', label: 'Tech Stack Utama', type: 'text', placeholder: 'Misal: React, Tailwind, Node.js' },
      { id: 'testing', label: 'Metodologi', type: 'select', options: ['Test-Driven Development (TDD)', 'Standard Vibe Coding', 'Strict Type Checking (TS)'] },
      { id: 'errorHandling', label: 'Error Handling', type: 'select', options: ['Strict (Fail Fast)', 'Graceful Degradation'] }
    ]
  },
  {
    id: 'office',
    name: 'Business & Office',
    icon: Building2,
    defaultFramework: 'RCGIO',
    description: 'Untuk Marketing, Sales, Finance, Operations, dan Customer Service.',
    extras: [
      { id: 'businessRole', label: 'Fungsi Bisnis', type: 'select', options: ['Marketing & Social Media', 'Sales & CRM', 'Finance & Accounting', 'Operations & Logistics', 'Customer Service & Support'] },
      { id: 'tone', label: 'Tone & Voice', type: 'select', options: ['Professional & Formal', 'Persuasive & Salesy', 'Empathetic & Caring', 'Direct & Concise', 'Internal Corporate'] },
      { id: 'objective', label: 'Main Objective', type: 'text', placeholder: 'Misal: Penutupan deal, laporan bulanan, atau handling komplain' }
    ]
  }
];

// --- KONFIGURASI FRAMEWORK ---
const frameworkOptions = {
  RCGIO: { title: "RCGIO (General & Precision)", acronym: "Role, Context, Goal, Instruction, Output", desc: "Standar industri presisi tinggi." },
  RISEN: { title: "RISEN (Technical & Formatting)", acronym: "Role, Input, Steps, Expectation, Narrowing", desc: "Ideal untuk tugas teknis dengan batasan kaku." },
  TRACE: { title: "TRACE (Product Management)", acronym: "Task, Request, Action, Context, Expectation", desc: "Sangat cocok untuk PRD dan manajemen produk." },
  CARE: { title: "CARE (Creative & Copywriting)", acronym: "Context, Action, Result, Example", desc: "Fokus pada emosi dan rasa (Lirik/Visual)." },
  RASCEF: { title: "RASCEF (Complex System / UI/UX)", acronym: "Role, Action, Steps, Context, Expectation, Format", desc: "Sistem kompleks & batasan UI/UX." },
  CRISPE: { title: "CRISPE (Persona & Brand Voice)", acronym: "Context, Role, Instructions, Style, Personalization, Examples", desc: "Brand voice yang sangat spesifik." },
  ERA: { title: "ERA (Agile & Efficiency)", acronym: "Expectation, Role, Action", desc: "Minimalis dan berorientasi hasil cepat." }
};

const frameworkElements = {
  RCGIO: [
    { id: 'role', icon: '🎭', name: 'Role (R)', placeholder: 'Siapa yang harus AI perankan?', sample: 'Misal: Bertindaklah sebagai Senior UI/UX Designer.' },
    { id: 'context', icon: '🌐', name: 'Context (C)', placeholder: 'Apa konteks/latar belakang masalahnya?', sample: 'Misal: Saya sedang membuat fitur onboarding untuk Gen-Z...' },
    { id: 'goal', icon: '🎯', name: 'Goal (G)', placeholder: 'Apa tujuan utama dari tugas ini?', sample: 'Misal: Tujuannya agar konversi user meningkat 20%.' },
    { id: 'instruction', icon: '🛠️', name: 'Instruction (I)', placeholder: 'Apa instruksi atau tugas spesifiknya?', sample: 'Misal: Buatkan 3 alternatif user journey.' },
    { id: 'output', icon: '📄', name: 'Output (O)', placeholder: 'Format hasilnya mau seperti apa?', sample: 'Misal: Format hasil dalam bentuk tabel perbandingan Markdown.' },
  ],
  RISEN: [
    { id: 'role', icon: '🎭', name: 'Role (R)', placeholder: 'Tentukan persona AI...', sample: 'Misal: Anda adalah Lead Product Manager.' },
    { id: 'input', icon: '📥', name: 'Input (I)', placeholder: 'Informasi atau data awalnya?', sample: 'Misal: Berikut adalah data riset pengguna (copas riset Anda).' },
    { id: 'steps', icon: '🪜', name: 'Steps (S)', placeholder: 'Urutan pengerjaannya?', sample: 'Misal: 1. Analisis masalah, 2. Beri solusi, 3. Buat rincian fitur.' },
    { id: 'expectation', icon: '🎯', name: 'Expectation (E)', placeholder: 'Hasil akhir yang diharapkan?', sample: 'Misal: Berikan saya dokumen PRD yang rapi dan detail.' },
    { id: 'narrowing', icon: '⚠️', name: 'Narrowing (N)', placeholder: 'Ada batasan sistem (Constraints)?', sample: 'Misal: Maksimal 500 kata, jangan gunakan jargon teknis.' },
  ],
  TRACE: [
    { id: 'task', icon: '📝', name: 'Task (T)', placeholder: 'Apa masalah yang ingin diselesaikan?', sample: 'Misal: Saya butuh arsitektur data untuk fitur manajemen kampanye.' },
    { id: 'request', icon: '🎭', name: 'Request (R)', placeholder: 'Apa peran yang diminta?', sample: 'Misal: Bertindaklah sebagai Software Architect.' },
    { id: 'action', icon: '⚡', name: 'Action (A)', placeholder: 'Aksi spesifik yang harus dilakukan?', sample: 'Misal: Evaluasi potensi error pada sistem.' },
    { id: 'context', icon: '🌐', name: 'Context (C)', placeholder: 'Konteks operasionalnya?', sample: 'Misal: Mengingat database kita menggunakan MongoDB...' },
    { id: 'expectation', icon: '🎁', name: 'Expectation (E)', placeholder: 'Ekspektasi output?', sample: 'Misal: Berikan respons dalam struktur JSON terformat.' },
  ],
  CARE: [
    { id: 'context', icon: '🌐', name: 'Context (C)', placeholder: 'Apa konteks kreatifnya?', sample: 'Misal: Merek sepatu lokal yang mengusung tema jalanan Jakarta.' },
    { id: 'action', icon: '⚡', name: 'Action (A)', placeholder: 'Apa yang harus diciptakan?', sample: 'Misal: Tulis 16 baris lirik rap untuk iklan komersial.' },
    { id: 'result', icon: '🎯', name: 'Result (R)', placeholder: 'Apa emosi atau hasil akhirnya?', sample: 'Misal: Membangkitkan rasa semangat dan rebel.' },
    { id: 'example', icon: '💡', name: 'Example (E)', placeholder: 'Punya referensi gaya atau nada?', sample: 'Misal: Gunakan gaya rima internal seperti lagu-lagu boom bap 90an.' },
  ],
  RASCEF: [
    { id: 'role', icon: '🎭', name: 'Role (R)', placeholder: 'Tentukan peran...', sample: 'Misal: Senior Digital Product Designer.' },
    { id: 'action', icon: '⚡', name: 'Action (A)', placeholder: 'Aksi utamanya?', sample: 'Misal: Rancang user flow untuk proses checkout.' },
    { id: 'steps', icon: '🪜', name: 'Steps (S)', placeholder: 'Langkah pengerjaan?', sample: 'Misal: 1. Wireframing, 2. Edge cases, 3. Copywriting.' },
    { id: 'context', icon: '🌐', name: 'Context (C)', placeholder: 'Konteks masalahnya?', sample: 'Misal: User sering drop-off di halaman pembayaran.' },
    { id: 'expectation', icon: '🎯', name: 'Expectation (E)', placeholder: 'Ekspektasi solusi?', sample: 'Misal: Mengurangi friction dan langkah klik user.' },
    { id: 'format', icon: '📄', name: 'Format (F)', placeholder: 'Format hasilnya?', sample: 'Misal: Markdown table dengan kolom state dan action.' },
  ],
  CRISPE: [
    { id: 'context', icon: '🌐', name: 'Context (C)', placeholder: 'Latar belakang proyek?', sample: 'Misal: Peluncuran produk parfum eksklusif pria.' },
    { id: 'role', icon: '🎭', name: 'Role (R)', placeholder: 'Peran AI?', sample: 'Misal: Luxury Brand Copywriter.' },
    { id: 'instruction', icon: '🛠️', name: 'Instruction (I)', placeholder: 'Instruksi utama?', sample: 'Misal: Buatkan 5 opsi tagline kampanye peluncuran.' },
    { id: 'style', icon: '✨', name: 'Style (S)', placeholder: 'Gaya bahasa yang diinginkan?', sample: 'Misal: Elegan, misterius, dan memikat.' },
    { id: 'personalization', icon: '👤', name: 'Personalization (P)', placeholder: 'Siapa audiens spesifiknya?', sample: 'Misal: Pria karir usia 28-40 tahun.' },
    { id: 'example', icon: '💡', name: 'Example (E)', placeholder: 'Ada contoh kalimat?', sample: 'Misal: "Aroma yang berbicara sebelum Anda bersuara."' },
  ],
  ERA: [
    { id: 'expectation', icon: '🎯', name: 'Expectation (E)', placeholder: 'Apa hasil akhir yang didambakan?', sample: 'Misal: Saya butuh 5 ide konten Instagram viral.' },
    { id: 'role', icon: '🎭', name: 'Role (R)', placeholder: 'Siapa yang bisa menyelesaikannya?', sample: 'Misal: Dari perspektif Social Media Strategist.' },
    { id: 'action', icon: '⚡', name: 'Action (A)', placeholder: 'Tindakan yang harus diambil?', sample: 'Misal: Tuliskan konsep konten dan caption-nya.' },
  ]
};

export default function App() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('product');
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  const [rawPrompt, setRawPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  
  const [isTranslated, setIsTranslated] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  
  const [activeTab, setActiveTab] = useState('narrative'); 
  const [copied, setCopied] = useState(false);
  const [missingInputs, setMissingInputs] = useState({});
  const [workspaceExtraInputs, setWorkspaceExtraInputs] = useState({}); 
  const [selectedFramework, setSelectedFramework] = useState(activeWorkspace.defaultFramework);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // --- AI SUGGESTIONS STATE ---
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [activeSuggestion, setActiveSuggestion] = useState('original'); 

  const placeholders = [
    "Tolong bikinin lirik rap boom bap tentang Jakarta, agak gelap tone-nya...",
    "Saya butuh rancangan PRD untuk sistem loyalitas pelanggan, kasih batasannya ya...",
    "Buatkan desain UI wireframe e-commerce, posisikan dirimu sebagai senior UX...",
    "Bantu saya buat email penawaran ke client baru untuk jasa marketing agency..."
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [placeholders.length]);

  // Reset state when workspace changes
  useEffect(() => {
    setSelectedFramework(activeWorkspace.defaultFramework);
    setWorkspaceExtraInputs({}); 
    setAnalysis(null);
    setIsTranslated(false);
    setAiSuggestions([]);
  }, [activeWorkspaceId]);

  // Handle re-analysis if framework changes while analysis is present
  useEffect(() => {
    if (analysis && rawPrompt.trim()) {
      handleAnalyze(); 
    }
  }, [selectedFramework]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- 1. REAL AI CALL: PROMPT DIAGNOSTIC X-RAY ---
  const handleAnalyze = async () => {
    if (!rawPrompt.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setIsTranslated(false);
    setAiSuggestions([]);
    
    try {
      const currentElements = frameworkElements[selectedFramework];
      const elementsDesc = currentElements.map(el => `${el.name} (ID: ${el.id})`).join(', ');
      
      const lang = detectLanguage(rawPrompt);
      const promptTxt = i18n[lang].analyzePrompt(
        activeWorkspace.name,
        selectedFramework,
        elementsDesc,
        rawPrompt
      );
      
      console.log("Gemini Request Prompt:", promptTxt);
      
      const payload = {
        contents: [{ parts: [{ text: promptTxt }] }]
      };

      const data = await callGeminiAPI(payload);
      const text = data.candidates[0].content.parts[0].text;
      
      console.log("Gemini Raw Response:", text);
      
      // Sanitasi response untuk parsing JSON aman
      const jsonStart = text.indexOf('[');
      const jsonEnd = text.lastIndexOf(']') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error("AI did not return a valid JSON array. Response: " + text);
      }

      const jsonStr = text.substring(jsonStart, jsonEnd);
      const aiResults = JSON.parse(jsonStr);

      const newAnalysis = currentElements.map(el => {
        const aiMatch = aiResults.find(r => r.id === el.id);
        return {
          ...el,
          found: aiMatch ? aiMatch.found : false,
          extractedText: aiMatch && aiMatch.found ? aiMatch.extractedText : ''
        };
      });

      setAnalysis(newAnalysis);
    } catch (error) {
      console.error("AI Analysis Error:", error);
      alert("AI Error: " + error.message + "\nCheck console for details.");
      // Fallback ke mock jika error
      const currentElements = frameworkElements[selectedFramework];
      setAnalysis(currentElements.map(el => ({ ...el, found: false, extractedText: '' })));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAnalyze();
    }
  };

  const currentScore = useMemo(() => {
    if (!analysis) return 0;
    let score = 0;
    const pointPerItem = 100 / analysis.length;
    
    analysis.forEach(item => {
      if (item.found || (missingInputs[item.id] && missingInputs[item.id].trim().length > 0)) {
        score += pointPerItem;
      }
    });

    if (rawPrompt.length < 20) score = Math.max(10, score - 20);
    return Math.round(score);
  }, [analysis, missingInputs, rawPrompt]);

  // --- HELPER: Get resolved value for an element ---
  const getResolvedValue = (id, overrideActiveSuggestion, overrideAiSuggestions) => {
    const aSuggestion = overrideActiveSuggestion !== undefined ? overrideActiveSuggestion : activeSuggestion;
    const aSuggestions = overrideAiSuggestions !== undefined ? overrideAiSuggestions : aiSuggestions;

    if (aSuggestion !== 'original' && aSuggestions[aSuggestion]) {
      const vals = aSuggestions[aSuggestion].values;
      // Case-insensitive key lookup
      const found = vals[id] ??
        Object.entries(vals).find(([k]) => k.toLowerCase() === id.toLowerCase())?.[1];
      if (found) return found;
    }

    // Original flow
    const item = analysis?.find(a => a.id === id);
    const lang = detectLanguage(rawPrompt);
    if (item?.found) return missingInputs[id] || item.extractedText;
    return missingInputs[id] || i18n[lang].needInput(item?.name || id);
  };

  // --- 2. REAL AI CALL: MAGIC EDIT SUGGESTIONS ---
  const handleTranslate = async () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsTranslated(true);
    setIsGeneratingSuggestions(true);
    setActiveSuggestion('original');

    try {
      const currentElements = frameworkElements[selectedFramework];

      // Build context directly from analysis + missingInputs (avoid circular dependency)
      const contextLines = currentElements.map(el => {
        const extracted = analysis?.find(a => a.id === el.id);
        const val = missingInputs[el.id] ||
          (extracted?.found ? extracted.extractedText : null) ||
          '[belum diisi]';
        return `${el.id}: ${val}`;
      });

      // Build explicit schema with element IDs
      const elementIds = currentElements.map(el => `"${el.id}"`).join(', ');
      const schemaExample = JSON.stringify(
        Object.fromEntries(currentElements.map(el => [el.id, '...'])), null, 2
      );

      const lang = detectLanguage(rawPrompt);

      const promptTxt = i18n[lang].suggestionPrompt(
        contextLines.join('\n'),
        activeWorkspace.name,
        selectedFramework,
        elementIds,
        schemaExample
      );

      console.log('[Gemini] Suggestion prompt:', promptTxt);

      const payload = { contents: [{ parts: [{ text: promptTxt }] }] };
      const data = await callGeminiAPI(payload);
      const text = data.candidates[0].content.parts[0].text;
      console.log('[Gemini] Suggestion raw response:', text);

      // Extract JSON from response
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      if (jsonStart === -1 || jsonEnd === 0) throw new Error('No JSON found in AI response.');

      let aiData;
      try {
        aiData = JSON.parse(text.substring(jsonStart, jsonEnd));
      } catch (e) {
        aiData = JSON.parse(text.substring(jsonStart, jsonEnd).replace(/[\u0000-\u001F\u007F-\u009F]/g, ''));
      }

      const getKey = (obj, ...keys) => {
        for (const k of keys) {
          const found = Object.entries(obj).find(([key]) => key.toLowerCase() === k.toLowerCase());
          if (found) return found[1];
        }
        return {};
      };

      const s1 = getKey(aiData, 'suggestion1', 'option1', 'professional');
      const s2 = getKey(aiData, 'suggestion2', 'option2', 'creative');

      const newSuggestions = [
        { label: '✨ Profesional & Presisi', values: s1 },
        { label: '🔥 Kreatif & Ekspresif', values: s2 },
      ];
      console.log('[Gemini] Processed suggestions:', newSuggestions);
      setAiSuggestions(newSuggestions);
    } catch (error) {
      console.error('AI Generation Error:', error);
      alert('AI Suggestion Error:\n' + error.message);
      setAiSuggestions([]);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- DINAMIS OUTPUT GENERATOR ---
  const lang = detectLanguage(rawPrompt);
  const t = i18n[lang];

  const generateMarkdown = () => {
    if (!analysis) return '';
    let md = `# 📂 AI PROMPTING FRAMEWORK (${selectedFramework})\n> **Workspace:** ${activeWorkspace.name}\n> **Vibe Basis:** "${rawPrompt.substring(0, 50).replace(/\n/g, ' ')}..."\n\n---\n\n`;
    
    analysis.forEach((item, index) => {
      md += `## ${item.icon} ${index + 1}. ${item.name.toUpperCase()}\n- ${getResolvedValue(item.id)}\n\n`;
    });

    const hasExtras = Object.values(workspaceExtraInputs).some(val => val && val.trim().length > 0);
    if (hasExtras) {
      md += `## 🎛️ WORKSPACE PARAMETERS (${activeWorkspace.name.toUpperCase()})\n`;
      activeWorkspace.extras.forEach(extra => {
        if (workspaceExtraInputs[extra.id]) {
          md += `- **${extra.label}:** ${workspaceExtraInputs[extra.id]}\n`;
        }
      });
      md += `\n`;
    }

    md += `## 🧠 LOGIC BOOSTER\n> "${t.logicBooster}"`;
    return md;
  };

  const generateNarrative = () => {
    if (!analysis) return '';
    let narrative = `${t.narrativeIntro(selectedFramework)}\n\n`;
    narrative += `${t.narrativeParams}\n`;
    
    analysis.forEach((item) => {
      narrative += `- **${item.name}**: ${getResolvedValue(item.id)}\n`;
    });

    const hasExtras = Object.values(workspaceExtraInputs).some(val => val && val.trim().length > 0);
    if (hasExtras) {
      narrative += `\n${t.narrativeExtras}\n`;
      activeWorkspace.extras.forEach(extra => {
        if (workspaceExtraInputs[extra.id]) {
          narrative += `- **${extra.label}**: ${workspaceExtraInputs[extra.id]}\n`;
        }
      });
    }

    narrative += `\n${t.narrativeCot}`;
    return narrative;
  };

  const generateJSON = () => {
    if (!analysis) return '';
    const payload = {};
    analysis.forEach(item => {
      payload[item.id] = getResolvedValue(item.id);
    });

    const extrasPayload = {};
    activeWorkspace.extras.forEach(extra => {
      if (workspaceExtraInputs[extra.id]) {
        extrasPayload[extra.id] = workspaceExtraInputs[extra.id];
      }
    });

    return JSON.stringify({
      workspace: activeWorkspace.name,
      framework: selectedFramework,
      logic_path: "Chain-of-Thought",
      system_parameters: payload,
      ...(Object.keys(extrasPayload).length > 0 && { workspace_specifications: extrasPayload })
    }, null, 2);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-sans selection:bg-indigo-500/30">
      <header className="max-w-6xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Vibe Prompting
              </h1>
              <p className="text-sm text-gray-400">Pilih Arsitektur, Tulis Niat, Dapatkan Spesifikasi</p>
            </div>
          </div>
          
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto custom-scrollbar">
            {workspaces.map((ws) => {
              const Icon = ws.icon;
              const isActive = activeWorkspaceId === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => setActiveWorkspaceId(ws.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap glass-button ${
                    isActive 
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-inner' 
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : ''}`} />
                  {ws.name}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: Input & Diagnostics */}
        <div className="space-y-6">
          
          <div className="glass-panel rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-glow"></div>
            
            <div className="mb-4 flex items-start justify-between">
              <div>
                <label className="block text-sm font-semibold text-indigo-300 mb-1 flex items-center gap-2">
                  <activeWorkspace.icon className="w-4 h-4" />
                  Workspace: {activeWorkspace.name}
                </label>
                <p className="text-xs text-gray-500">{activeWorkspace.description}</p>
              </div>
            </div>

            <textarea
              className="w-full h-32 bg-gray-950 border border-gray-800 rounded-xl p-4 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none mt-2"
              placeholder={`Ketik brain dump untuk ${activeWorkspace.name}...`}
              value={rawPrompt}
              onChange={(e) => setRawPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-gray-400 flex items-center gap-2 opacity-90">
                <Command className="w-4 h-4 text-gray-500" />
                <span>
                  Tekan <kbd className="font-sans font-semibold bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-300">Cmd</kbd> / <kbd className="font-sans font-semibold bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-300">Ctrl</kbd> + <kbd className="font-sans font-semibold bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-300">Enter</kbd>
                </span>
              </div>
              
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !rawPrompt.trim()}
                className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all ${
                  isAnalyzing || !rawPrompt.trim()
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                }`}
              >
                {isAnalyzing ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memindai...</span>
                ) : (
                  <>Prompt Analisis</>
                )}
              </button>
            </div>
          </div>

          {analysis && (
            <div className="glass-panel rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 border border-white/5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-400" />
                Diagnostik Kesempurnaan
              </h3>
              
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Kesiapan Prompt</span>
                  <span className={`font-bold transition-colors duration-500 ${
                    currentScore >= 80 ? 'text-green-400' : currentScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {currentScore}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      currentScore >= 80 ? 'bg-green-500' : currentScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${currentScore}%` }}
                  ></div>
                </div>
              </div>

              <div className="mb-6 bg-gray-950/60 p-4 rounded-xl border border-gray-800">
                <label className="block text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Sesuaikan Framework Output
                </label>
                
                <div className="relative">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full text-left bg-gray-900 border border-gray-700 hover:border-indigo-500/50 text-white rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all flex justify-between items-start group shadow-inner"
                  >
                    <div className="flex-1 pr-4">
                      <h4 className="font-bold text-indigo-300 text-sm mb-0.5">{frameworkOptions[selectedFramework].title}</h4>
                      <p className="text-xs text-gray-400 italic mb-3">{frameworkOptions[selectedFramework].acronym}</p>
                      <div className="text-xs text-gray-300 border-l-2 border-indigo-500/50 pl-3 bg-gray-800/40 py-2.5 px-3 rounded-r leading-relaxed">
                        {frameworkOptions[selectedFramework].desc}
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-400 mt-1 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180 text-indigo-400' : 'group-hover:text-gray-200'}`} />
                  </button>

                  {isDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)}></div>
                      <div className="absolute z-20 w-full mt-2 bg-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-y-auto max-h-96 divide-y divide-gray-800 animate-in fade-in slide-in-from-top-2 custom-scrollbar">
                        {Object.entries(frameworkOptions).map(([key, data]) => (
                          <button
                            key={key}
                            onClick={() => { setSelectedFramework(key); setIsDropdownOpen(false); }}
                            className={`w-full text-left p-4 hover:bg-gray-800 transition-colors ${selectedFramework === key ? 'bg-indigo-900/20' : ''}`}
                          >
                            <h4 className="font-bold text-indigo-300 text-sm mb-0.5">{data.title}</h4>
                            <p className="text-xs text-gray-400 italic mb-3">{data.acronym}</p>
                            <div className="text-xs text-gray-300 border-l-2 border-indigo-500/50 pl-3 bg-gray-800/40 py-2.5 px-3 rounded-r leading-relaxed">
                              {data.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {analysis.map((item) => {
                  const isFilled = missingInputs[item.id] && missingInputs[item.id].trim().length > 0;
                  const isResolved = item.found || isFilled;

                  return (
                    <div key={item.id} className={`p-4 rounded-xl border transition-all duration-300 ${
                      isResolved ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className={`flex items-center gap-2 font-bold ${isResolved ? 'text-green-400' : 'text-red-400'}`}>
                          {isResolved ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                          <span>{item.icon} {item.name}</span>
                        </div>
                        <div className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold ${
                          item.found ? 'bg-green-500/10 text-green-400 border border-green-500/20' : isFilled ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {item.found ? 'Terdeteksi' : isFilled ? 'Teratasi' : 'Elemen Hilang'}
                        </div>
                      </div>

                      {item.found ? (
                        <div className="mt-2 text-sm text-gray-300 bg-black/20 p-2.5 rounded border border-green-500/10 font-medium">
                          <span className="text-green-500/50 text-xs uppercase block mb-1">Simulasi Ekstraksi AI:</span>
                          {item.extractedText}
                        </div>
                      ) : (
                        <div className="mt-3">
                          <input
                            type="text"
                            placeholder={item.placeholder}
                            value={missingInputs[item.id] || ''}
                            onChange={(e) => setMissingInputs({ ...missingInputs, [item.id]: e.target.value })}
                            className={`w-full bg-gray-950 border rounded-lg p-3 text-gray-200 text-sm focus:ring-1 outline-none transition-all ${
                              isFilled ? 'border-indigo-500/50 focus:ring-indigo-500 focus:border-indigo-500' : 'border-red-500/20 focus:ring-red-500 focus:border-red-500'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mb-6 bg-indigo-900/10 border border-indigo-500/30 p-5 rounded-xl">
                <div className="flex items-center justify-between mb-4 border-b border-indigo-500/20 pb-3">
                  <div className="flex items-center gap-2">
                    <activeWorkspace.icon className="w-5 h-5 text-indigo-400" />
                    <h4 className="font-bold text-indigo-300 text-sm">Parameter Khusus: {activeWorkspace.name}</h4>
                  </div>
                  <span className="bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded text-[10px] font-medium tracking-wider uppercase">Opsional</span>
                </div>
                
                <div className="space-y-4">
                  {activeWorkspace.extras.map(extra => (
                    <div key={extra.id} className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-400">{extra.label}</label>
                      {extra.type === 'select' ? (
                        <select
                          value={workspaceExtraInputs[extra.id] || ''}
                          onChange={(e) => setWorkspaceExtraInputs({...workspaceExtraInputs, [extra.id]: e.target.value})}
                          className="w-full bg-gray-950 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                        >
                          <option value="">-- Abaikan atau Pilih --</option>
                          {extra.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder={extra.placeholder}
                          value={workspaceExtraInputs[extra.id] || ''}
                          onChange={(e) => setWorkspaceExtraInputs({...workspaceExtraInputs, [extra.id]: e.target.value})}
                          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-gray-200 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-900/20 border border-indigo-500/20 p-4 rounded-xl flex items-center justify-between">
                <div className="text-sm text-indigo-200">
                  <span className="font-semibold block text-white">Generate Spesifikasi</span>
                  Konversi elemen di atas menjadi file siap pakai.
                </div>
                <button
                  onClick={handleTranslate}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                >
                  ✨ Compile & Rekomendasi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Output (Spec) */}
        <div className={`transition-all duration-700 ${isTranslated ? 'opacity-100 translate-x-0' : 'opacity-30 translate-x-4 pointer-events-none filter blur-sm'}`}>
          <div className="glass-panel rounded-2xl shadow-2xl overflow-hidden h-full flex flex-col min-h-[600px] border border-white/5">
            
            <div className="bg-indigo-950/40 border-b border-indigo-900/50 p-3 flex items-center gap-3 overflow-x-auto custom-scrollbar">
              <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex-shrink-0 mr-1">AI Magic Edit:</span>
              
              {isGeneratingSuggestions ? (
                <span className="text-xs text-indigo-300 animate-pulse flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Meracik rekomendasi...
                </span>
              ) : (
                <>
                  <button 
                    onClick={() => setActiveSuggestion('original')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      activeSuggestion === 'original' ? 'bg-gray-700 text-white shadow-sm ring-1 ring-gray-500' : 'bg-gray-900/60 text-gray-400 hover:bg-gray-800 border border-gray-800'
                    }`}
                  >
                    Original Input
                  </button>
                  {aiSuggestions.map((sugg, idx) => (
                    <button 
                      key={idx}
                      onClick={() => setActiveSuggestion(idx)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        activeSuggestion === idx 
                        ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/50 shadow-sm ring-1 ring-indigo-500/30'
                        : 'bg-gray-900/60 text-gray-400 hover:bg-gray-800 border border-gray-800'
                      }`}
                    >
                      {sugg.label}
                    </button>
                  ))}
                </>
              )}
            </div>

            <div className="flex border-b border-gray-800 bg-gray-950 overflow-x-auto custom-scrollbar relative">
              <button onClick={() => setActiveTab('narrative')} className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'narrative' ? 'border-green-500 text-green-400 bg-gray-900' : 'border-transparent text-gray-500 hover:text-gray-300'}`}><MessageSquare className="w-4 h-4" /> Narrative</button>
              <button onClick={() => setActiveTab('json')} className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'json' ? 'border-purple-500 text-purple-400 bg-gray-900' : 'border-transparent text-gray-500 hover:text-gray-300'}`}><Code className="w-4 h-4" /> JSON</button>
              <button onClick={() => setActiveTab('markdown')} className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'markdown' ? 'border-indigo-500 text-indigo-400 bg-gray-900' : 'border-transparent text-gray-500 hover:text-gray-300'}`}><FileText className="w-4 h-4" /> Markdown</button>
            </div>

            <div className="flex-1 relative bg-[#0d1117] overflow-auto flex flex-col">
              <div className="sticky top-0 right-0 w-full flex justify-end p-4 pointer-events-none">
                <button onClick={() => copyToClipboard(activeTab === 'narrative' ? generateNarrative() : activeTab === 'json' ? generateJSON() : generateMarkdown())} className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md text-xs font-medium border border-gray-700 shadow-md transition-colors z-10">
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="px-5 pb-5 -mt-6">
                <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap leading-relaxed pr-16">
                  <code>{activeTab === 'narrative' ? generateNarrative() : activeTab === 'json' ? generateJSON() : generateMarkdown()}</code>
                </pre>
              </div>
            </div>
            
            <div className="p-3 bg-gray-950 border-t border-gray-800 text-xs text-gray-500 flex justify-between items-center">
              <span>Siap untuk di-copy ke LLM (ChatGPT / Claude / Gemini)</span>
              <span className="flex items-center gap-1 text-indigo-400/70"><CheckCircle2 className="w-3 h-3" /> {activeWorkspace.name} Data</span>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #111827; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4B5563; }
      `}} />
    </div>
  );
}
