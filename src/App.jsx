import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar, Users, Upload, ChevronLeft, ChevronRight, Trash2,
  Check, AlertCircle, X, Search, FileText, AlertTriangle,
  BarChart3, Plus, Edit2, BookOpen, ArrowRight, Merge,
  CheckCircle2, Info, ChevronDown, Bell, Eye, Download, Copy, Table2,
  Settings, Database, Wifi, WifiOff, ExternalLink, ShieldCheck,
  Undo2, Redo2
} from 'lucide-react';

// --- Constants ---
const DAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];

// Paleta extendida de colores para evitar repeticiones y blancos
const COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-violet-50 text-violet-700 border-violet-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-orange-50 text-orange-700 border-orange-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-pink-50 text-pink-700 border-pink-200',
  'bg-slate-100 text-slate-700 border-slate-300',
  'bg-lime-50 text-lime-700 border-lime-200',
  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-yellow-50 text-yellow-700 border-yellow-300',
  'bg-sky-50 text-sky-700 border-sky-200',
  'bg-emerald-100 text-emerald-800 border-emerald-300',
  'bg-rose-100 text-rose-800 border-rose-300',
  'bg-indigo-100 text-indigo-800 border-indigo-300',
  'bg-orange-100 text-orange-800 border-orange-300'
];

const FIXED_PERIODS = [
  { id:1,  start:'07:20', end:'08:20', type:'class', mod:1 },
  { id:2,  start:'08:20', end:'09:20', type:'class', mod:2 },
  { id:100,label:'RECREO',             type:'break'        },
  { id:3,  start:'09:40', end:'10:35', type:'class', mod:3 },
  { id:4,  start:'10:35', end:'11:30', type:'class', mod:4 },
  { id:101,label:'RECREO',             type:'break'        },
  { id:5,  start:'11:50', end:'12:50', type:'class', mod:5 },
  { id:6,  start:'12:50', end:'13:50', type:'class', mod:6 },
  { id:102,label:'TURNO TARDE / ED. FÍSICA', type:'separator'},
  { id:7,  start:'14:00', end:'15:00', type:'pe',   mod:7 },
  { id:8,  start:'15:00', end:'16:00', type:'pe',   mod:8 },
  { id:9,  start:'16:00', end:'17:00', type:'pe',   mod:9 },
];
const DAYS_NORM = DAYS.map(d => d.normalize('NFD').replace(/[\u0300-\u036f]/g,''));

// --- Utilities ---
const nc = s => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim() : '';
const ns = s => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim() : '';
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const cleanCell = s => s ? s.replace(/[()'"]/g,'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim() : '';

// --- CSV PARSER ---
function parseCSV(csvText) {
  const splitCSV = (line) =>
    line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map(c => c.trim().replace(/^"|"$/g, ''));

  const rows = csvText
    .split(/\r?\n(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .filter(r => r.trim() !== '');

  const warnings = [];
  const parsedPairs = [];
  let detectedCourses = [];
  let activeDayIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const cells = splitCSV(rows[i]);
    if (!cells.length) continue;

    const firstNorm = cells[0].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dayIdx = DAYS_NORM.indexOf(firstNorm);
    if (dayIdx !== -1) {
      activeDayIdx = dayIdx;
      const possible = cells.slice(1)
        .map(c => cleanCell(c))
        .filter(c => c.length > 0 && c.length < 30);
      if (possible.length > 0) detectedCourses = possible.map((name, idx) => ({ id: idx + 1, name }));
      continue;
    }

    if (activeDayIdx === -1) continue;

    const modMatch = cells[0].match(/^(\d+)$/);
    if (!modMatch) continue;

    const modNum = parseInt(modMatch[1]);
    const period = FIXED_PERIODS.find(p => p.mod === modNum);
    if (!period) {
      warnings.push(`Módulo ${modNum} no existe en la configuración de períodos — ignorado`);
      continue;
    }

    const subjectsRow = cells.slice(1);
    const nextRowIdx = i + 1;
    let teachersRow = [];
    if (nextRowIdx < rows.length) {
      const nextCells = splitCSV(rows[nextRowIdx]);
      teachersRow = nextCells.slice(1);
      i = nextRowIdx;
    } else {
      warnings.push(`${DAYS[activeDayIdx]} Mód.${modNum}: fila de docentes ausente (fin de archivo)`);
    }

    detectedCourses.forEach((course, ci) => {
      const rawSubject = cleanCell(subjectsRow[ci] ?? '');
      const rawTeacher = cleanCell(teachersRow[ci] ?? '');
      parsedPairs.push({
        dayIdx:     activeDayIdx,
        dayName:    DAYS[activeDayIdx],
        modNum,
        courseIdx:  ci,
        courseName: course.name,
        rawSubject,
        rawTeacher,
      });
    });
  }

  return { detectedCourses, parsedPairs, warnings };
}

// --- Micro-components ---
function CloudDot({ status, firebase }) {
  const dot = { saved:'bg-emerald-500', syncing:'bg-amber-400 animate-pulse', error:'bg-red-400', loading:'bg-slate-300 animate-pulse' };
  const lbl = { saved: firebase ? 'Firebase' : 'Local', syncing:'Guardando...', error:'Error', loading:'Conectando...' };
  return (
    <div className="flex items-center gap-1.5">
      {firebase
        ? <Database size={10} className={status==='saved'?'text-emerald-500':status==='error'?'text-red-400':'text-amber-400'}/>
        : <div className={`w-1.5 h-1.5 rounded-full ${dot[status]??dot.loading}`}/>
      }
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{lbl[status]??''}</span>
    </div>
  );
}

// --- Firebase dynamic loader ---
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.12.2/';

async function loadFirebase(config) {
  if (!window._fbApp) {
    const [
      { initializeApp },
      { getFirestore, doc, setDoc, onSnapshot, getDoc },
      { getAuth, signInAnonymously }
    ] = await Promise.all([
      import(FIREBASE_CDN + 'firebase-app.js'),
      import(FIREBASE_CDN + 'firebase-firestore.js'),
      import(FIREBASE_CDN + 'firebase-auth.js'),
    ]);
    
    window._fbApp = initializeApp(config, 'masterschedule');
    window._fbFirestore = getFirestore(window._fbApp);
    window._fbAuth = getAuth(window._fbApp);
    window._fbOps = { doc, setDoc, onSnapshot, getDoc, signInAnonymously };
  }
  return { db: window._fbFirestore, auth: window._fbAuth, ...window._fbOps };
}

const FB_CONFIG_KEY = 'masterschedule-firebase-config';

async function loadSavedFBConfig() {
  try {
    const r = await window.storage.get(FB_CONFIG_KEY);
    if (r?.value) return JSON.parse(r.value);
  } catch(_) {}
  return null;
}

async function saveFBConfig(cfg) {
  await window.storage.set(FB_CONFIG_KEY, JSON.stringify(cfg));
}

function useFirestore(fbConfig) {
  const [status, setStatus] = React.useState('idle'); 
  const opsRef  = React.useRef(null);
  const docPath = 'masterschedule/v1';

  React.useEffect(() => {
    if (!fbConfig) { setStatus('idle'); return; }
    setStatus('connecting');
    loadFirebase(fbConfig)
      .then(async (ops) => {
        try {
          await ops.signInAnonymously(ops.auth);
          opsRef.current = ops;
          setStatus('connected');
        } catch (authErr) {
          console.error("Error de Auth:", authErr);
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [fbConfig]);

  const save = React.useCallback(async (data) => {
    if (!opsRef.current || status !== 'connected') return false;
    const { db, doc, setDoc } = opsRef.current;
    await setDoc(doc(db, docPath), { ...data, _ts: Date.now() }, { merge: true });
    return true;
  }, [status]);

  const subscribe = React.useCallback((onData) => {
    if (!opsRef.current || status !== 'connected') return () => {};
    const { db, doc, onSnapshot } = opsRef.current;
    return onSnapshot(doc(db, docPath), snap => {
      if (snap.exists()) onData(snap.data());
    });
  }, [status]);

  return { ready: status === 'connected', status, save, subscribe };
}

// --- Main App ---
export default function App() {
  // Cambio de título de la pestaña del navegador
  useEffect(() => {
    document.title = "Horaria";
  }, []);

  const [courses,  setCourses]  = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [schedule,  setSchedule]  = useState({});
  const [mappings,  setMappings]   = useState({ teachers:{}, subjects:{} });
  
  const history    = useRef([{}]); 
  const historyIdx = useRef(0);    
  const [historyIdx_s, setHistoryIdxS] = useState(0);

  const [activeTab,   setActiveTab]  = useState('grid');
  const [currentDay,  setCurrentDay] = useState(0);
  const [csvContent,  setCsvContent] = useState('');
  const [message,     setMessage]    = useState(null);
  const [searchTerm,  setSearchTerm] = useState('');
  const [cloudStatus, setCloudStatus]= useState('loading');

  const [fbConfig,     setFbConfig]     = useState(null);   
  const [fbConfigText, setFbConfigText] = useState('');     
  const [fbConfigErr,  setFbConfigErr]  = useState('');     

  const { ready: fbReady, status: fbStatus, save: fbSave, subscribe: fbSubscribe } = useFirestore(fbConfig);

  useEffect(() => {
    loadSavedFBConfig().then(cfg => {
      if (cfg) { setFbConfig(cfg); setFbConfigText(JSON.stringify(cfg, null, 2)); }
    });
  }, []);

  useEffect(() => {
    if (!fbReady) return;
    setCloudStatus('syncing');
    const unsub = fbSubscribe(data => {
      if (data.courses)    setCourses(data.courses);
      if (data.teachers)   setTeachers(data.teachers);
      if (data.subjects)   setSubjects(data.subjects);
      if (data.schedule)   setSchedule(data.schedule);
      if (data.mappings)   setMappings(data.mappings);
      setCloudStatus('saved');
    });
    return unsub;
  }, [fbReady, fbSubscribe]);

  const saveAll = useCallback(async (c, t, subj, s, maps) => {
    const data = { courses:c, teachers:t, subjects:subj, schedule:s, mappings: maps ?? mappings };
    setCloudStatus('syncing');
    try {
      if (fbReady) {
        await fbSave(data);
      } else {
        await window.storage.set('masterschedule-v3', JSON.stringify(data));
      }
      setCloudStatus('saved');
    } catch (_) { setCloudStatus('error'); }
  }, [fbReady, fbSave, mappings]);

  const handleConnectFirebase = useCallback(async () => {
    setFbConfigErr('');
    let parsed = null;
    try {
      const keysToFind = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
      const extractedConfig = {};
      keysToFind.forEach(key => {
        const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
        const match = fbConfigText.match(regex);
        if (match && match[1]) { extractedConfig[key] = match[1]; }
      });
      if (extractedConfig.apiKey && extractedConfig.projectId) {
        parsed = extractedConfig;
      } else {
        try { parsed = JSON.parse(fbConfigText.trim()); } catch (jsonErr) {
          throw new Error('No se detectaron credenciales válidas.');
        }
      }
      if (!parsed || !parsed.apiKey || !parsed.projectId) throw new Error('Faltan campos obligatorios.');
    } catch(e) {
      setFbConfigErr('Error al leer la configuración.');
      return;
    }
    window._fbApp = null; window._fbFirestore = null; window._fbOps = null;
    await saveFBConfig(parsed);
    setFbConfig(parsed);
  }, [fbConfigText]);

  const handleImport = () => {
    if (!csvContent.trim()) return;
    const { detectedCourses, parsedPairs } = parseCSV(csvContent);
    
    const subjectByNorm = new Map();
    const teacherMap = new Map();
    const newSchedule = {};

    const getOrCreateSubject = (name) => {
      const key = nc(name);
      if (subjectByNorm.has(key)) return subjectByNorm.get(key);
      const s = { id:`s-${uid()}`, name };
      subjectByNorm.set(key, s);
      return s;
    };

    const getOrCreateTeacher = (name) => {
      const key = nc(name);
      if (teacherMap.has(key)) return teacherMap.get(key);
      // Asigna un color de la paleta extendida basado en el índice actual
      const color = COLORS[teacherMap.size % COLORS.length];
      const t = { id:`t-${uid()}`, name, color, subject:'' };
      teacherMap.set(key, t);
      return t;
    };

    const courseNames = [...new Set(parsedPairs.map(p => p.courseName))];
    const newCourses = courseNames.map((name, i) => ({ id: i+1, name }));
    const courseIdByName = new Map(newCourses.map(c => [c.name, c.id]));

    parsedPairs.forEach(p => {
      if (!p.rawSubject) return;
      const subject = getOrCreateSubject(p.rawSubject);
      const teacher = p.rawTeacher ? getOrCreateTeacher(p.rawTeacher) : null;
      const period = FIXED_PERIODS.find(fp => fp.mod === p.modNum);
      const courseId = courseIdByName.get(p.courseName);
      if (period && courseId) {
        newSchedule[`${p.dayIdx}-${period.id}-${courseId}`] = { 
          teacherId: teacher?.id ?? '', 
          subjectId: subject.id 
        };
      }
    });

    const newSubj = Array.from(subjectByNorm.values());
    const newTeach = Array.from(teacherMap.values());
    
    setCourses(newCourses);
    setTeachers(newTeach);
    setSubjects(newSubj);
    setSchedule(newSchedule);
    saveAll(newCourses, newTeach, newSubj, newSchedule);
    setActiveTab('grid');
    setCsvContent('');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl text-white">
              <Calendar size={20} />
            </div>
            <h1 className="text-xl font-black tracking-tight text-indigo-900">Horaria</h1>
            <CloudDot status={cloudStatus} firebase={!!fbConfig} />
          </div>
          
          <nav className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button onClick={() => setActiveTab('grid')} 
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${activeTab==='grid'?'bg-white text-indigo-600 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
              Grilla
            </button>
            <button onClick={() => setActiveTab('import')} 
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${activeTab==='import'?'bg-white text-indigo-600 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
              Importar
            </button>
            <button onClick={() => setActiveTab('settings')} 
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${activeTab==='settings'?'bg-white text-indigo-600 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
              Ajustes
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'import' && (
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200 max-w-2xl mx-auto">
            <h2 className="text-2xl font-black text-slate-800 mb-2">Importar Horario Maestro</h2>
            <p className="text-slate-500 text-sm mb-6">Pegue el CSV exportado de su sistema de gestión.</p>
            <textarea 
              className="w-full h-64 p-4 text-xs font-mono bg-slate-50 border border-slate-200 rounded-2xl mb-6 outline-none focus:ring-2 ring-indigo-100"
              placeholder="LUNES,1A,1B...&#10;1,MATEMATICA,LENGUA...&#10;,PEREZ,GOMEZ..."
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
            />
            <button onClick={handleImport} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
              Procesar Horario
            </button>
          </div>
        )}

        {activeTab === 'grid' && courses.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentDay(d => Math.max(0, d-1))} className="p-2 hover:bg-slate-200 rounded-xl"><ChevronLeft/></button>
                <h2 className="text-3xl font-black text-slate-800 min-w-[180px] text-center">{DAYS[currentDay]}</h2>
                <button onClick={() => setCurrentDay(d => Math.min(4, d+1))} className="p-2 hover:bg-slate-200 rounded-xl"><ChevronRight/></button>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                <input type="text" placeholder="Buscar materia o docente..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50 z-10">Módulo</th>
                      {courses.map(c => (
                        <th key={c.id} className="p-4 text-center text-sm font-black text-indigo-900 border-l border-slate-100">{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FIXED_PERIODS.map(p => (
                      <tr key={p.id} className={p.type==='break'?'bg-slate-50/50':'hover:bg-slate-50/30'}>
                        <td className="p-4 border-b border-slate-100 sticky left-0 bg-white z-10">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{p.start}</div>
                          <div className="text-sm font-black text-indigo-600 leading-none">{p.mod ? `${p.mod}°` : p.label}</div>
                          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{p.end}</div>
                        </td>
                        {courses.map(c => {
                          const cell = schedule[`${currentDay}-${p.id}-${c.id}`];
                          const teacher = teachers.find(t => t.id === cell?.teacherId);
                          const subject = subjects.find(s => s.id === cell?.subjectId);
                          return (
                            <td key={c.id} className="p-1 border-b border-l border-slate-100 min-w-[140px]">
                              {cell ? (
                                <div className={`p-3 rounded-2xl border ${teacher?.color || 'bg-white border-slate-200'} h-full transition-all hover:scale-105 cursor-pointer`}>
                                  <div className="text-[10px] font-black uppercase opacity-60 mb-1 truncate">{subject?.name}</div>
                                  <div className="text-xs font-black leading-tight">{teacher?.name || 'S/D'}</div>
                                </div>
                              ) : (
                                <div className="h-full min-h-[60px] flex items-center justify-center text-slate-200 hover:text-indigo-200 cursor-pointer transition-colors group">
                                  <Plus size={14} className="opacity-0 group-hover:opacity-100"/>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200">
              <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <Database className="text-indigo-600"/> Sincronización Cloud
              </h2>
              <textarea 
                className="w-full h-48 p-4 text-xs font-mono bg-slate-900 text-indigo-300 rounded-2xl mb-4 border-4 border-slate-800"
                placeholder="Pegue aquí el bloque firebaseConfig de su consola..."
                value={fbConfigText}
                onChange={e => setFbConfigText(e.target.value)}
              />
              <button onClick={handleConnectFirebase} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all">
                Vincular Firebase
              </button>
              {fbConfigErr && <p className="mt-4 text-red-500 text-xs font-bold">{fbConfigErr}</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
