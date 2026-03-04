import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar, Users, Upload, ChevronLeft, ChevronRight, Trash2,
  Check, AlertCircle, X, Search, FileText, AlertTriangle,
  BarChart3, Plus, Edit2, BookOpen, ArrowRight, Merge,
  CheckCircle2, Info, ChevronDown, Bell, Eye, Download, Copy, Table2,
  Settings, Database, Wifi, WifiOff, ExternalLink, ShieldCheck,
  Undo2, Redo2
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
const HEX_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6',
  '#8b5cf6','#06b6d4','#f97316','#14b8a6','#ec4899',
  '#84cc16','#a855f7','#0ea5e9','#d946ef','#22c55e',
  '#fb923c','#e11d48','#7c3aed','#0891b2','#65a30d',
  '#dc2626','#2563eb',
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

// ─── Utilities ────────────────────────────────────────────────────────────────
const nc = s => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim() : '';
const ns = s => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim() : '';
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const cleanCell = s => s ? s.replace(/[()'"]/g,'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim() : '';

// Helper: get inline style from teacher (supports both legacy class-based and new hex colors)
const teacherStyle = (colorHex) => {
  if (!colorHex) return {};
  return { backgroundColor: colorHex + '22', borderColor: colorHex, color: colorHex };
};
const teacherAvatarStyle = (colorHex) => {
  if (!colorHex) return {};
  return { backgroundColor: colorHex, borderColor: colorHex, color: '#fff' };
};


// ─── CSV PARSER ──────────────────────────────────────────────────────────────
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
      const possible = cells.slice(1).map(c => cleanCell(c)).filter(c => c.length > 0 && c.length < 30);
      if (possible.length > 0) detectedCourses = possible.map((name, idx) => ({ id: idx + 1, name }));
      continue;
    }
    if (activeDayIdx === -1) continue;
    const modMatch = cells[0].match(/^(\d+)$/);
    if (!modMatch) continue;
    const modNum = parseInt(modMatch[1]);
    const period = FIXED_PERIODS.find(p => p.mod === modNum);
    if (!period) { warnings.push(`Módulo ${modNum} no existe en la configuración de períodos — ignorado`); continue; }
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
      parsedPairs.push({ dayIdx: activeDayIdx, dayName: DAYS[activeDayIdx], modNum, courseIdx: ci, courseName: course.name, rawSubject, rawTeacher });
    });
  }
  return { detectedCourses, parsedPairs, warnings };
}

// ─── Micro-components ─────────────────────────────────────────────────────────
function CloudDot({ status, fbStatus }) {
  // status = cloudStatus (save operations: saved/syncing/error/loading)
  // fbStatus = Firebase connection status (idle/connecting/connected/error)
  const isConnected = fbStatus === 'connected';
  const isConnecting = fbStatus === 'connecting';
  const isFbError = fbStatus === 'error';

  if (isFbError) {
    return (
      <div className="flex items-center gap-1 bg-red-100 border border-red-300 rounded-md px-1.5 py-0.5">
        <WifiOff size={9} className="text-red-500 shrink-0"/>
        <span className="text-[9px] font-black text-red-600 uppercase tracking-wider">Sin conexión</span>
      </div>
    );
  }
  if (isConnecting) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/>
        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Conectando…</span>
      </div>
    );
  }
  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5">
        <Database size={10} className={status==='syncing'?'text-amber-400 animate-pulse':status==='error'?'text-red-400':'text-emerald-500'}/>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${status==='error'?'text-red-500':status==='syncing'?'text-amber-500':'text-slate-400'}`}>
          {status==='syncing'?'Guardando…':status==='error'?'Error al guardar':'Firebase'}
        </span>
      </div>
    );
  }
  // Local storage
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${status==='syncing'?'bg-amber-400 animate-pulse':status==='error'?'bg-red-400':'bg-emerald-500'}`}/>
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
        {status==='syncing'?'Guardando…':status==='error'?'Error':'Local'}
      </span>
    </div>
  );
}

function Badge({ children, color='slate' }) {
  const map = { slate:'bg-slate-100 text-slate-500', indigo:'bg-indigo-50 text-indigo-600', red:'bg-red-50 text-red-600', amber:'bg-amber-50 text-amber-600', emerald:'bg-emerald-50 text-emerald-700' };
  return <span className={`px-2 py-0.5 rounded-lg text-sm font-bold ${map[color]}`}>{children}</span>;
}

function SearchableDropdown({ value, onChange, items, placeholder = '— Seleccionar —', emptyLabel = '— Sin asignar —' }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const selected = items.find(s => s.id === value);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = useMemo(() =>
    query.trim() ? items.filter(s => ns(s.name).includes(ns(query))) : items,
    [items, query]
  );
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setQuery(''); }}
        className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-left flex items-center justify-between gap-2 hover:border-slate-300 transition-colors outline-none focus:ring-2 ring-indigo-100">
        <span className={selected ? 'text-slate-800 font-semibold' : 'text-slate-400'}>{selected?.name ?? placeholder}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform shrink-0 ${open?'rotate-180':''}`}/>
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar…" className="w-full text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-indigo-100"/>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:bg-slate-50 transition-colors">{emptyLabel}</button>
            {filtered.length === 0
              ? <div className="px-4 py-3 text-xs text-slate-400 text-center">Sin resultados</div>
              : filtered.map(s => (
                  <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between
                      ${s.id===value?'bg-indigo-50 text-indigo-700 font-bold':'hover:bg-slate-50 text-slate-700 font-medium'}`}>
                    {s.name}{s.id===value&&<Check size={12}/>}
                  </button>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
// backward compat alias
function SubjectDropdown({ value, onChange, subjects }) {
  return <SearchableDropdown value={value} onChange={onChange} items={subjects} placeholder="— Seleccionar materia —" emptyLabel="— Sin materia —"/>;
}


// ─── Alerts Panel ─────────────────────────────────────────────────────────────
function AlertsPanel({ report, conflictList = [], allConflictList = [], acknowledgedConflicts = new Set(), onGoToConflict, onAcknowledge, liveCounts }) {
  if (!report && allConflictList.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-300">
      <Bell size={40} className="mb-3"/>
      <p className="text-slate-400 font-bold text-sm">Sin reportes de importación aún.</p>
    </div>
  );
  const hasIssues = report && (report.warnings.length > 0 || report.deduped.length > 0 || (report.dedupedTeachers||[]).length > 0 || report.skipped.length > 0);
  const acknowledgedList = allConflictList.filter(c => acknowledgedConflicts.has(c.id));
  return (
    <div className="space-y-4">
      {/* Active conflict alerts */}
      {conflictList.length > 0 && (
        <div className="bg-white border border-red-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-red-100 flex items-center gap-2 bg-red-50">
            <AlertTriangle size={15} className="text-red-500"/>
            <span className="text-sm font-black text-red-700">Conflictos de horario ({conflictList.length})</span>
          </div>
          <div className="divide-y divide-red-50">
            {conflictList.map((c, i) => (
              <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800">{c.teacher?.name ?? 'Docente desconocido'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {c.day} · {c.period.mod}° módulo ({c.period.start}–{c.period.end})
                  </p>
                  <p className="text-xs text-red-600 font-medium mt-1">
                    Asignado simultáneamente a: {c.entries.map(e => e.course.name).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <button onClick={() => onGoToConflict(c)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                    <Eye size={11}/>Ver en grilla
                  </button>
                  <button onClick={() => onAcknowledge(c)}
                    title="Marcar como aceptado — deja de mostrarse como conflicto"
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 px-3 py-1.5 rounded-lg transition-colors">
                    <CheckCircle2 size={11}/>Aceptar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acknowledged conflicts */}
      {acknowledgedList.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <CheckCircle2 size={15} className="text-emerald-500"/>
            <span className="text-sm font-black text-slate-500">Conflictos aceptados ({acknowledgedList.length})</span>
            <span className="text-[10px] text-slate-400 font-medium ml-1">— no se muestran en la grilla</span>
          </div>
          <div className="divide-y divide-slate-100">
            {acknowledgedList.map((c, i) => (
              <div key={i} className="px-4 py-3 flex items-start justify-between gap-3 opacity-60">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-600 line-through">{c.teacher?.name ?? 'Docente desconocido'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.day} · {c.period.mod}° módulo ({c.period.start}–{c.period.end})</p>
                  <p className="text-xs text-slate-400 mt-1">{c.entries.map(e => e.course.name).join(', ')}</p>
                </div>
                <button onClick={() => onAcknowledge(c)}
                  title="Reactivar — vuelve a mostrarse como conflicto"
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors shrink-0 mt-0.5">
                  <X size={11}/>Reactivar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <>
          {/* Summary cards — live counts when available */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label:'Cursos',    value: liveCounts?.courses   ?? report.courses,   color:'indigo' },
              { label:'Docentes',  value: liveCounts?.teachers  ?? report.teachers,  color:'indigo' },
              { label:'Materias',  value: liveCounts?.subjects  ?? report.subjects,  color:'indigo' },
              { label:'Módulos',   value: liveCounts?.modules   ?? report.imported,  color:'emerald'},
            ].map(s => (
              <div key={s.label} className={`rounded-2xl p-4 text-center border ${s.color==='emerald'?'bg-emerald-50 border-emerald-100':'bg-indigo-50 border-indigo-100'}`}>
                <div className={`text-2xl font-black ${s.color==='emerald'?'text-emerald-600':'text-indigo-600'}`}>{s.value}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {!hasIssues && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald-500 shrink-0"/>
              <p className="text-sm font-bold text-emerald-700">Importación perfecta — no se detectaron inconsistencias.</p>
            </div>
          )}
          {report.warnings.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-red-50">
                <AlertTriangle size={15} className="text-red-500"/>
                <span className="text-sm font-black text-red-700">Problemas de estructura ({report.warnings.length})</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {report.warnings.map((w,i) => (
                  <div key={i} className="px-4 py-2.5 text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-red-300 mt-0.5 shrink-0">·</span>{w}
                  </div>
                ))}
              </div>
            </div>
          )}
          {report.deduped.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-amber-50">
                <Merge size={15} className="text-amber-500"/>
                <span className="text-sm font-black text-amber-700">Materias unificadas ({report.deduped.length})</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {report.deduped.map((d,i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                    <span className="text-slate-400 line-through">{d.from}</span>
                    <ArrowRight size={10} className="text-slate-300 shrink-0"/>
                    <span className="font-bold text-slate-700">{d.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(report.dedupedTeachers||[]).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-amber-50">
                <Merge size={15} className="text-amber-500"/>
                <span className="text-sm font-black text-amber-700">Docentes unificados ({report.dedupedTeachers.length})</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {report.dedupedTeachers.map((d,i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                    <span className="text-slate-400 line-through">{d.from}</span>
                    <ArrowRight size={10} className="text-slate-300 shrink-0"/>
                    <span className="font-bold text-slate-700">{d.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {report.skipped.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                <Info size={15} className="text-slate-400"/>
                <span className="text-sm font-black text-slate-600">Celdas omitidas ({report.skipped.length})</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {report.skipped.map((s,i) => (
                  <div key={i} className="px-4 py-2.5 text-xs text-slate-500 flex items-start gap-2">
                    <span className="text-slate-300 mt-0.5 shrink-0">·</span>{s}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ─── Import Preview Table ─────────────────────────────────────────────────────
function ImportPreview({ parsedPairs, courses, onConfirm, onBack }) {
  const grouped = useMemo(() => {
    const map = new Map();
    parsedPairs.forEach(p => {
      const key = `${p.dayName}-${p.modNum}`;
      if (!map.has(key)) map.set(key, { dayName:p.dayName, modNum:p.modNum, entries:[] });
      map.get(key).entries.push(p);
    });
    return Array.from(map.values());
  }, [parsedPairs]);
  const totalOk      = parsedPairs.filter(p => p.rawSubject && p.rawTeacher).length;
  const totalNoTeach = parsedPairs.filter(p => p.rawSubject && !p.rawTeacher).length;
  const totalEmpty   = parsedPairs.filter(p => !p.rawSubject).length;
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'issues'
    ? grouped.filter(g => g.entries.some(e => !e.rawTeacher || !e.rawSubject))
    : grouped;
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-slate-800 text-base">Vista previa — confirmá antes de guardar</h3>
            <p className="text-xs text-slate-500 mt-1">Revisá que la información sea idéntica a tu archivo.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5 text-center">
              <div className="text-lg font-black text-emerald-600">{totalOk}</div>
              <div className="text-[9px] font-bold text-emerald-500 uppercase">Completos</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5 text-center">
              <div className="text-lg font-black text-amber-600">{totalNoTeach}</div>
              <div className="text-[9px] font-bold text-amber-500 uppercase">Sin docente</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-center">
              <div className="text-lg font-black text-slate-400">{totalEmpty}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Vacíos</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase">Ver:</span>
          {[['all','Todos'],['issues','Solo con problemas']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filter===v?'bg-indigo-600 text-white':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-auto" style={{maxHeight:'50vh'}}>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                {['Día','Mód.','Curso','Materia (CSV)','Docente (CSV)','Estado'].map(h => (
                  <th key={h} className="p-3 border-b border-slate-200 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(group =>
                group.entries.map((e, ei) => {
                  const status = !e.rawSubject && !e.rawTeacher ? 'empty' : !e.rawTeacher ? 'no-teacher' : !e.rawSubject ? 'no-subject' : 'ok';
                  const statusEl = {
                    ok: <span className="text-emerald-600 font-bold flex items-center gap-1"><Check size={11}/>OK</span>,
                    'no-teacher': <span className="text-amber-600 font-bold flex items-center gap-1"><AlertTriangle size={11}/>Sin docente</span>,
                    'no-subject': <span className="text-red-500 font-bold flex items-center gap-1"><AlertCircle size={11}/>Sin materia</span>,
                    empty: <span className="text-slate-300 font-bold">—</span>,
                  }[status];
                  return (
                    <tr key={`${group.dayName}-${group.modNum}-${ei}`}
                      className={`border-b border-slate-100 transition-colors
                        ${status==='ok'?'hover:bg-slate-50':status==='no-teacher'?'bg-amber-50/40 hover:bg-amber-50':status==='no-subject'?'bg-red-50/40 hover:bg-red-50':'bg-slate-50/40'}`}>
                      <td className="p-3 font-bold text-slate-600 whitespace-nowrap">{ei===0?group.dayName:''}</td>
                      <td className="p-3 font-black text-indigo-500 whitespace-nowrap">{ei===0?`${group.modNum}°`:''}</td>
                      <td className="p-3 font-bold text-slate-700 whitespace-nowrap">{e.courseName}</td>
                      <td className="p-3 text-slate-800">{e.rawSubject||<span className="text-slate-300 italic">vacío</span>}</td>
                      <td className="p-3 text-slate-800">{e.rawTeacher||<span className="text-slate-300 italic">vacío</span>}</td>
                      <td className="p-3 whitespace-nowrap">{statusEl}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onBack} className="px-5 py-2.5 rounded-xl font-bold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
          <ChevronLeft size={14}/> Volver y corregir
        </button>
        <button onClick={onConfirm} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2">
          <Check size={14}/> Confirmar e Importar
        </button>
      </div>
    </div>
  );
}


// ─── Firebase dynamic loader ──────────────────────────────────────────────────
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.12.2/';
async function loadFirebase(config) {
  if (!window._fbApp) {
    const [{ initializeApp },{ getFirestore, doc, setDoc, onSnapshot, getDoc },{ getAuth, signInAnonymously }] = await Promise.all([
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
  try { const v = localStorage.getItem(FB_CONFIG_KEY); if (v) return JSON.parse(v); } catch(_) {}
  return null;
}
async function saveFBConfig(cfg) { localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(cfg)); }

function useFirestore(fbConfig) {
  const [status, setStatus] = React.useState('idle');
  const opsRef   = React.useRef(null);
  const readyRef = React.useRef(false); // mutable flag, never stale in closures
  const docPath  = 'masterschedule/v1';

  React.useEffect(() => {
    if (!fbConfig) { setStatus('idle'); opsRef.current = null; readyRef.current = false; return; }
    setStatus('connecting');
    readyRef.current = false;
    loadFirebase(fbConfig).then(async (ops) => {
      try {
        await ops.signInAnonymously(ops.auth);
        opsRef.current = ops;
        readyRef.current = true;
        setStatus('connected');
      } catch (authErr) {
        console.error('Firebase Auth error:', authErr);
        readyRef.current = false;
        setStatus('error');
      }
    }).catch((e) => {
      console.error('Firebase load error:', e);
      readyRef.current = false;
      setStatus('error');
    });
  }, [fbConfig]);

  // No deps — always reads live refs, never stale
  const save = React.useCallback(async (data) => {
    if (!readyRef.current || !opsRef.current) return false;
    const { db, doc, setDoc } = opsRef.current;
    await setDoc(doc(db, docPath), { ...data, _ts: Date.now() }, { merge: true });
    return true;
  }, []);

  const subscribe = React.useCallback((onData, onError) => {
    if (!readyRef.current || !opsRef.current) return () => {};
    const { db, doc, onSnapshot } = opsRef.current;
    return onSnapshot(
      doc(db, docPath),
      snap => onData(snap.exists() ? snap.data() : null),
      err  => onError?.(err)
    );
  }, []);

  return { ready: status === 'connected', status, save, subscribe };
}

// ─── ConflictPanel ────────────────────────────────────────────────────────────
function ConflictPanel({ conflicts, onNavigate, onEdit }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-100/60 transition-colors text-left">
        <AlertTriangle size={15} className="text-red-500 shrink-0"/>
        <p className="flex-1 text-sm text-red-700 font-black">
          {conflicts.length} conflicto{conflicts.length !== 1 ? 's' : ''} detectado{conflicts.length !== 1 ? 's' : ''}
          <span className="font-medium ml-1.5">— docente asignado a más de un curso en el mismo módulo</span>
        </p>
        <ChevronDown size={15} className={`text-red-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <div className="border-t border-red-200 divide-y divide-red-100">
          {conflicts.map((c, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border text-xs font-black mt-0.5 text-white"
                style={teacherAvatarStyle(c.teacher?.colorHex)}>
                {c.teacher?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-red-800">{c.teacher?.name ?? 'Docente desconocido'}</p>
                <p className="text-xs text-red-600 font-medium mt-0.5">
                  {c.day} · {c.period.mod}° módulo ({c.period.start}–{c.period.end})
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {c.entries.map(e => (
                    <button key={e.key} onClick={() => onEdit(c.dayIdx, c.period.id, e.course.id)}
                      title="Clic para editar esta celda"
                      className="flex items-center gap-1 bg-white border border-red-300 text-red-700 text-xs font-bold px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors">
                      {e.course.name}<Edit2 size={10} className="opacity-60"/>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => onNavigate(c.dayIdx)}
                className="text-[10px] font-bold text-red-500 border border-red-200 bg-white hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors shrink-0 mt-0.5">
                Ver día
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {

  useEffect(() => { document.title = "Horaria"; }, []);

  // Core data
  const [courses,  setCourses]  = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [schedule,  setSchedule]  = useState({});
  const [mappings,  setMappings]   = useState({ teachers:{}, subjects:{} });
  const history    = useRef([{}]);
  const historyIdx = useRef(0);
  const [historyIdx_s, setHistoryIdxS] = useState(0);

  // UI
  const [activeTab,   setActiveTab]  = useState('grid');
  const [currentDay,  setCurrentDay] = useState(0);
  const [csvContent,  setCsvContent] = useState('');
  const [message,     setMessage]    = useState(null);
  const [searchTerm,  setSearchTerm] = useState('');
  const [cloudStatus, setCloudStatus]= useState('loading');
  const [importStep,    setImportStep]    = useState('input');
  const [parsedPreview, setParsedPreview] = useState(null);
  const [lastReport,    setLastReport]    = useState(null);
  const [editingCell,    setEditingCell]    = useState(null);
  const [changeLog,      setChangeLog]      = useState([]);
  const [acknowledgedConflicts, setAcknowledgedConflicts] = useState(new Set());
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [mergingSubject, setMergingSubject] = useState(null);
  const [mergeModal,     setMergeModal]     = useState(null);
  const [mergeKeepId,    setMergeKeepId]    = useState(null);
  const [listSearch,     setListSearch]     = useState('');
  const [configSubTab,   setConfigSubTab]   = useState('subjects');
  const [selectedItems,  setSelectedItems]  = useState(new Set());
  const [reportType,      setReportType]      = useState('teacher');
  const [reportSelection, setReportSelection] = useState('');
  const [fbConfig,     setFbConfig]     = useState(null);
  const [fbConfigText, setFbConfigText] = useState('');
  const [fbConfigErr,  setFbConfigErr]  = useState('');

  const { ready: fbReady, status: fbStatus, save: fbSave, subscribe: fbSubscribe } = useFirestore(fbConfig);
  const latestDataRef = useRef({ courses:[], teachers:[], subjects:[], schedule:{}, lastReport:null, mappings:{ teachers:{}, subjects:{} }, changeLog:[], acknowledgedConflicts:[] });
  useEffect(() => { latestDataRef.current = { courses, teachers, subjects, schedule, lastReport, mappings, changeLog, acknowledgedConflicts: [...acknowledgedConflicts] }; }, [courses, teachers, subjects, schedule, lastReport, mappings, changeLog, acknowledgedConflicts]);
  const seededFirebaseRef = useRef(false);
  const pendingWriteRef   = useRef(0); // counts in-flight local writes to Firebase

  useEffect(() => {
    loadSavedFBConfig().then(cfg => {
      if (cfg) { setFbConfig(cfg); setFbConfigText(JSON.stringify(cfg, null, 2)); }
    });
  }, []);

  useEffect(() => {
    if (!fbReady) return;
    setCloudStatus('syncing');

    const unsub = fbSubscribe((data) => {
      if (data) {
        // Skip snapshots triggered by our own writes — only accept external changes
        if (pendingWriteRef.current > 0) {
          setCloudStatus('saved');
          return;
        }
        setCourses(data.courses    || []);
        setTeachers(data.teachers  || []);
        setSubjects(data.subjects  || []);
        setSchedule(data.schedule  || {});
        setLastReport(data.lastReport || null);
        setMappings(data.mappings  || { teachers:{}, subjects:{} });
        setChangeLog(data.changeLog || []);
        setAcknowledgedConflicts(new Set(data.acknowledgedConflicts || []));
        setCloudStatus('saved');
        return;
      }
      // Doc missing — seed from local data if this browser has any
      const local = latestDataRef.current;
      const hasLocal =
        (local.courses?.length  || 0) > 0 ||
        (local.teachers?.length || 0) > 0 ||
        (local.schedule && Object.keys(local.schedule).length > 0);
      if (hasLocal && !seededFirebaseRef.current) {
        seededFirebaseRef.current = true;
        fbSave({
          courses:               local.courses               || [],
          teachers:              local.teachers              || [],
          subjects:              local.subjects              || [],
          schedule:              local.schedule              || {},
          lastReport:            local.lastReport            || null,
          mappings:              local.mappings              || { teachers:{}, subjects:{} },
          changeLog:             local.changeLog             || [],
          acknowledgedConflicts: local.acknowledgedConflicts || [],
        }).catch(() => setCloudStatus('error'));
      } else {
        setCloudStatus('saved');
      }
    }, (err) => {
      setCloudStatus('error');
      setMessage({ text: `Firebase: ${err?.message || 'Error de conexión o permisos'}`, type: 'error' });
      setTimeout(() => setMessage(null), 6000);
    });

    return unsub;
  }, [fbReady]); // fbSubscribe and fbSave are stable (no internal deps)

  useEffect(() => {
    if (fbConfig) return;
    (async () => {
      try {
        const raw = localStorage.getItem('masterschedule-v3');
        if (raw) {
          const d = JSON.parse(raw);
          if (d.courses)    setCourses(d.courses);
          if (d.teachers)   setTeachers(d.teachers);
          if (d.subjects)   setSubjects(d.subjects);
          if (d.schedule)   setSchedule(d.schedule);
          if (d.lastReport) setLastReport(d.lastReport);
          if (d.mappings)   setMappings(d.mappings);
          if (d.changeLog)  setChangeLog(d.changeLog);
          if (d.acknowledgedConflicts) setAcknowledgedConflicts(new Set(d.acknowledgedConflicts));
        }
      } catch (_) {}
      setCloudStatus('saved');
    })();
  }, [fbConfig]);

  const saveAll = useCallback(async (c, t, subj, s, report, maps, log, ackConflicts) => {
    const cur = latestDataRef.current;
    const data = {
      courses:               c,
      teachers:              t,
      subjects:              subj,
      schedule:              s,
      lastReport:            report,
      mappings:              maps         ?? cur.mappings,
      changeLog:             log          !== undefined ? log               : cur.changeLog,
      acknowledgedConflicts: ackConflicts !== undefined ? [...ackConflicts] : cur.acknowledgedConflicts,
    };
    setCloudStatus('syncing');
    try {
      if (fbReady) {
        pendingWriteRef.current += 1;
        await fbSave(data);
        // Keep flag up for 1.5s to absorb the echo snapshot Firebase sends back
        setTimeout(() => { pendingWriteRef.current = Math.max(0, pendingWriteRef.current - 1); }, 1500);
      } else {
        localStorage.setItem('masterschedule-v3', JSON.stringify(data));
      }
      setCloudStatus('saved');
    } catch (_) {
      pendingWriteRef.current = Math.max(0, pendingWriteRef.current - 1);
      setCloudStatus('error');
    }
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
        if (match && match[1]) extractedConfig[key] = match[1];
      });
      if (extractedConfig.apiKey && extractedConfig.projectId) { parsed = extractedConfig; }
      else {
        try { parsed = JSON.parse(fbConfigText.trim()); }
        catch (_) { throw new Error('No se detectaron credenciales válidas en el texto.'); }
      }
      if (!parsed || !parsed.apiKey || !parsed.projectId) throw new Error('Faltan campos obligatorios (apiKey, projectId).');
    } catch (_) {
      setFbConfigErr('No se pudo leer la configuración. Asegurate de copiar el bloque "const firebaseConfig = { ... }" que te da Firebase.');
      return;
    }
    window._fbApp = null; window._fbFirestore = null; window._fbOps = null;
    await saveFBConfig(parsed);
    setFbConfig(parsed);
    showMsg('Conectado a Firebase correctamente.');
  }, [fbConfigText]);

  const handleDisconnectFirebase = useCallback(async () => {
    window._fbApp = null; window._fbFirestore = null; window._fbOps = null;
    localStorage.removeItem(FB_CONFIG_KEY);
    setFbConfig(null); setFbConfigText(''); setFbConfigErr('');
    setCloudStatus('saved');
    showMsg('Desconectado de Firebase. Usando almacenamiento local.');
  }, []);

  const pushHistory = useCallback((newSchedule) => {
    const idx  = historyIdx.current;
    history.current = history.current.slice(0, idx + 1);
    history.current.push(newSchedule);
    historyIdx.current = history.current.length - 1;
    setHistoryIdxS(historyIdx.current);
  }, []);

  const undo = useCallback(() => {
    if (historyIdx.current <= 0) return;
    historyIdx.current -= 1;
    setHistoryIdxS(historyIdx.current);
    const prev = history.current[historyIdx.current];
    setSchedule(prev);
    saveAll(courses, teachers, subjects, prev, lastReport);
  }, [courses, teachers, subjects, lastReport, saveAll]);

  const redo = useCallback(() => {
    if (historyIdx.current >= history.current.length - 1) return;
    historyIdx.current += 1;
    setHistoryIdxS(historyIdx.current);
    const next = history.current[historyIdx.current];
    setSchedule(next);
    saveAll(courses, teachers, subjects, next, lastReport);
  }, [courses, teachers, subjects, lastReport, saveAll]);

  const showMsg = (text, type='success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const logChange = useCallback((action, detail) => {
    const ts   = new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const date = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' });
    setChangeLog(prev => {
      const newLog = [{ id: Date.now(), ts, date, action, detail }, ...prev].slice(0, 200);
      const { courses: c, teachers: t, subjects: s, schedule: sc, lastReport: lr, mappings: m, acknowledgedConflicts: ack } = latestDataRef.current;
      saveAll(c, t, s, sc, lr, m, newLog, new Set(ack));
      return newLog;
    });
  }, [saveAll]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
      if (e.key === 'Escape') {
        setEditingCell(null);
        setEditingTeacher(null);
        setEditingSubject(null);
        setMergeModal(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);


  // ── IMPORT ────────────────────────────────────────────────────────────────
  const handleAnalyze = () => {
    if (!csvContent.trim()) return;
    const { detectedCourses, parsedPairs, warnings } = parseCSV(csvContent);
    if (parsedPairs.length === 0) { showMsg('No se encontraron datos válidos en el CSV. Verificá el formato.', 'error'); return; }
    setParsedPreview({ parsedPairs, warnings, detectedCourses });
    setImportStep('preview');
  };

  const handleConfirmImport = () => {
    const { parsedPairs, warnings, detectedCourses } = parsedPreview;
    const subjectByNorm = new Map();
    subjects.forEach(s => subjectByNorm.set(nc(s.name), s));
    const teacherMap = new Map(teachers.map(t => [nc(t.name), t]));
    const applyMapping = (raw, type) => {
      if (!raw) return raw;
      const key = nc(raw);
      return mappings[type]?.[key] || raw;
    };
    const newSchedule = {};
    const dedupedSubjects = [];
    const dedupedTeachers = [];
    const skipped = [];
    let importedCount = 0;

    const getOrCreateSubject = (rawName) => {
      const name = applyMapping(rawName.trim(), 'subjects');
      if (!name) return null;
      const key = nc(name);
      if (subjectByNorm.has(key)) {
        const existing = subjectByNorm.get(key);
        if (existing.name !== name && !dedupedSubjects.find(d => d.from === name)) dedupedSubjects.push({ from: name, to: existing.name });
        return existing;
      }
      const s = { id:`s-${uid()}`, name };
      subjectByNorm.set(key, s);
      return s;
    };

    const getOrCreateTeacher = (rawName) => {
      const name = applyMapping(rawName.trim(), 'teachers');
      if (!name || name.length < 2) return null;
      const key = nc(name);
      if (teacherMap.has(key)) {
        const existing = teacherMap.get(key);
        if (existing.name !== name && !dedupedTeachers.find(d => d.from === rawName.trim())) dedupedTeachers.push({ from: rawName.trim(), to: existing.name });
        return existing;
      }
      const colorHex = HEX_COLORS[teacherMap.size % HEX_COLORS.length];
      const t = { id:`t-${uid()}`, name, color: '', colorHex, subject:'' };
      teacherMap.set(key, t);
      return t;
    };

    const courseNames = [...new Set(parsedPairs.map(p => p.courseName))];
    const newCourses = courseNames.map((name, i) => ({ id: i+1, name }));
    const courseIdByName = new Map(newCourses.map(c => [c.name, c.id]));

    parsedPairs.forEach(p => {
      if (nc(p.rawSubject).includes('recreo') || nc(p.rawSubject).includes('libre')) return;
      const subject = p.rawSubject ? getOrCreateSubject(p.rawSubject) : null;
      const teacher = p.rawTeacher ? getOrCreateTeacher(p.rawTeacher) : null;
      if (!subject) {
        if (p.rawSubject || p.rawTeacher) skipped.push(`${p.dayName} Mód.${p.modNum} ${p.courseName}: sin materia`);
        return;
      }
      if (!teacher && p.rawTeacher) skipped.push(`${p.dayName} Mód.${p.modNum} ${p.courseName}: docente inválido ("${p.rawTeacher}")`);
      const period = FIXED_PERIODS.find(fp => fp.mod === p.modNum);
      if (!period) return;
      const courseId = courseIdByName.get(p.courseName);
      if (!courseId) return;
      const key = `${p.dayIdx}-${period.id}-${courseId}`;
      newSchedule[key] = { teacherId: teacher?.id ?? '', subjectId: subject.id };
      importedCount++;
    });

    const newSubjectList = Array.from(subjectByNorm.values());
    const newTeacherList = Array.from(teacherMap.values()).map(t => {
      const mySubjIds = new Set(Object.values(newSchedule).filter(c=>c.teacherId===t.id).map(c=>c.subjectId));
      return { ...t, subject: newSubjectList.filter(s=>mySubjIds.has(s.id)).map(s=>s.name).join(', ') };
    });

    const report = { courses: newCourses.length, teachers: newTeacherList.length, subjects: newSubjectList.length, imported: importedCount, warnings, deduped: dedupedSubjects, dedupedTeachers, skipped, date: new Date().toLocaleString('es-AR') };
    setCourses(newCourses); setTeachers(newTeacherList); setSubjects(newSubjectList);
    pushHistory(newSchedule); setSchedule(newSchedule); setLastReport(report);
    saveAll(newCourses, newTeacherList, newSubjectList, newSchedule, report);
    setCsvContent(''); setParsedPreview(null); setImportStep('input');
    setActiveTab('alerts'); showMsg('Importación completada.'); logChange('Importación CSV', `${newCourses.length} cursos, ${newTeacherList.length} docentes, ${importedCount} módulos`);
  };

  // ── Conflicts ─────────────────────────────────────────────────────────────
  const conflictId = (dayIdx, periodId, teacherId) => `${dayIdx}-${periodId}-${teacherId}`;

  const { allConflictList } = useMemo(() => {
    const list = [];
    DAYS.forEach((day, dayIdx) => {
      FIXED_PERIODS.filter(p => p.type==='class'||p.type==='pe').forEach(period => {
        const byTeacher = new Map();
        courses.forEach(course => {
          const k    = `${dayIdx}-${period.id}-${course.id}`;
          const cell = schedule[k];
          if (!cell?.teacherId) return;
          if (!byTeacher.has(cell.teacherId)) byTeacher.set(cell.teacherId, []);
          byTeacher.get(cell.teacherId).push({ key: k, course });
        });
        byTeacher.forEach((entries, teacherId) => {
          if (entries.length < 2) return;
          const teacher = teachers.find(t => t.id === teacherId);
          list.push({ id: conflictId(dayIdx, period.id, teacherId), teacher, day, dayIdx, period, entries });
        });
      });
    });
    list.sort((a,b) => a.dayIdx - b.dayIdx || a.period.mod - b.period.mod);
    return { allConflictList: list };
  }, [schedule, courses, teachers]);

  const conflictList = useMemo(() =>
    allConflictList.filter(c => !acknowledgedConflicts.has(c.id)),
    [allConflictList, acknowledgedConflicts]
  );

  const conflictKeys = useMemo(() => {
    const keys = new Set();
    conflictList.forEach(c => c.entries.forEach(e => keys.add(e.key)));
    return keys;
  }, [conflictList]);

  const conflicts     = conflictKeys;
  const conflictPairs = conflictList.length;

  const toggleAcknowledgeConflict = useCallback((conflict) => {
    setAcknowledgedConflicts(prev => {
      const next = new Set(prev);
      const wasAck = next.has(conflict.id);
      wasAck ? next.delete(conflict.id) : next.add(conflict.id);
      const { courses: c, teachers: t, subjects: s, schedule: sc, lastReport: lr, mappings: m, changeLog: cl } = latestDataRef.current;
      const ts   = new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const date = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' });
      const action = wasAck ? 'Conflicto reactivado' : 'Conflicto aceptado';
      const detail = `${conflict.teacher?.name ?? 'Docente ?'} · ${conflict.day} Mód.${conflict.period.mod}° (${conflict.entries.map(e=>e.course.name).join(', ')})`;
      const newLog = [{ id: Date.now(), ts, date, action, detail }, ...cl].slice(0, 200);
      setChangeLog(newLog);
      saveAll(c, t, s, sc, lr, m, newLog, next);
      return next;
    });
  }, [saveAll]);

  // ── Search highlight ──────────────────────────────────────────────────────
  const isHighlighted = useCallback((cell) => {
    if (!searchTerm.trim()) return false;
    const term    = ns(searchTerm);
    const subj    = subjects.find(s => s.id === cell?.subjectId);
    const teacher = teachers.find(t => t.id === cell?.teacherId);
    return ns(subj?.name||'').includes(term) || ns(teacher?.name||'').includes(term);
  }, [searchTerm, subjects, teachers]);

  // ── Cell editor ───────────────────────────────────────────────────────────
  const openCellEditor = (periodId, courseId) => {
    const key  = `${currentDay}-${periodId}-${courseId}`;
    const cell = schedule[key] || {};
    setEditingCell({ key, teacherId: cell.teacherId||'', subjectId: cell.subjectId||'' });
  };
  const saveCell = (key, data) => {
    // Compute new schedule synchronously from current state
    setSchedule(cur => {
      const ns2 = { ...cur };
      const wasEmpty = !cur[key];
      if (!data.teacherId && !data.subjectId) delete ns2[key];
      else ns2[key] = { teacherId: data.teacherId, subjectId: data.subjectId };
      // Pass ns2 directly — never read latestDataRef.schedule which is the OLD value
      const { courses: c, teachers: t, subjects: s, lastReport: lr } = latestDataRef.current;
      pushHistory(ns2);
      saveAll(c, t, s, ns2, lr);
      // Log
      const [dIdx, pId, cId] = key.split('-');
      const courseName = c.find(x=>x.id===parseInt(cId))?.name || '?';
      const day = ['Lun','Mar','Mié','Jue','Vie'][parseInt(dIdx)] || '?';
      const period = FIXED_PERIODS.find(fp=>fp.id===parseInt(pId));
      const subjName = data.subjectId ? s.find(x=>x.id===data.subjectId)?.name : null;
      const teachName = data.teacherId ? t.find(x=>x.id===data.teacherId)?.name : null;
      const action = (!data.teacherId && !data.subjectId) ? 'Celda borrada' : wasEmpty ? 'Celda asignada' : 'Celda editada';
      const detail = `${day} Mód.${period?.mod||'?'} · ${courseName}` + (subjName ? ` → ${subjName}` : '') + (teachName ? ` / ${teachName}` : '');
      logChange(action, detail);
      return ns2;
    });
    setEditingCell(null);
  };

  // ── Teacher CRUD ──────────────────────────────────────────────────────────
  const deleteTeacher = id => {
    const nt = teachers.filter(t => t.id !== id);
    const ns2 = { ...schedule };
    Object.keys(ns2).forEach(k => { if (ns2[k].teacherId === id) ns2[k] = {...ns2[k], teacherId:''}; });
    setTeachers(nt); setSchedule(ns2);
    saveAll(courses, nt, subjects, ns2, lastReport);
    showMsg('Docente eliminado.'); logChange('Docente eliminado', teachers.find(t=>t.id===id)?.name || id);
  };
  const saveTeacher = t => {
    const isNew = !teachers.find(x=>x.id===t.id);
    const nt = isNew ? [...teachers, t] : teachers.map(x=>x.id===t.id?t:x);
    setTeachers(nt); saveAll(courses, nt, subjects, schedule, lastReport); setEditingTeacher(null);
    logChange(isNew ? 'Docente creado' : 'Docente editado', t.name);
  };

  // ── Subject CRUD ──────────────────────────────────────────────────────────
  const renameSubject = (id, newName) => {
    const t = newName.trim(); if (!t) return;
    const ns2 = subjects.map(s => s.id===id ? {...s, name:t} : s);
    const oldName = subjects.find(s=>s.id===id)?.name;
    setSubjects(ns2); saveAll(courses, teachers, ns2, schedule, lastReport);
    setEditingSubject(null); showMsg('Materia renombrada.'); logChange('Materia renombrada', `${oldName} → ${t}`);
  };
  const deleteSubject = id => {
    const ns2 = subjects.filter(s => s.id !== id);
    const sched2 = {...schedule};
    Object.keys(sched2).forEach(k => {
      if (sched2[k].subjectId === id) {
        if (sched2[k].teacherId) sched2[k] = { ...sched2[k], subjectId: '' };
        else delete sched2[k];
      }
    });
    setSubjects(ns2); setSchedule(sched2);
    saveAll(courses, teachers, ns2, sched2, lastReport); showMsg('Materia eliminada.'); logChange('Materia eliminada', subjects.find(s=>s.id===id)?.name || id);
  };
  const mergeSubjects = (keepId, removeId) => {
    if (keepId===removeId) return;
    const keepSubj   = subjects.find(s=>s.id===keepId);
    const removeSubj = subjects.find(s=>s.id===removeId);
    const sched2 = {...schedule};
    Object.keys(sched2).forEach(k => { if (sched2[k].subjectId===removeId) sched2[k]={...sched2[k],subjectId:keepId}; });
    const ns2 = subjects.filter(s=>s.id!==removeId);
    const newMaps = { ...mappings, subjects: { ...mappings.subjects, [nc(removeSubj?.name||'')]: keepSubj?.name||'' } };
    setMappings(newMaps); setSubjects(ns2); setSchedule(sched2);
    saveAll(courses, teachers, ns2, sched2, lastReport, newMaps);
    setMergingSubject(null); showMsg('Materias unificadas y aprendidas.');
  };
  const mergeTeachers = (keepId, removeId) => {
    if (keepId===removeId) return;
    const keepT   = teachers.find(t=>t.id===keepId);
    const removeT = teachers.find(t=>t.id===removeId);
    const sched2 = {...schedule};
    Object.keys(sched2).forEach(k => { if (sched2[k].teacherId===removeId) sched2[k]={...sched2[k],teacherId:keepId}; });
    const nt = teachers.filter(t=>t.id!==removeId);
    const newMaps = { ...mappings, teachers: { ...mappings.teachers, [nc(removeT?.name||'')]: keepT?.name||'' } };
    setMappings(newMaps); setTeachers(nt); setSchedule(sched2);
    saveAll(courses, nt, subjects, sched2, lastReport, newMaps);
    showMsg('Docentes unificados y aprendidos.');
  };
  const addSubject = name => {
    const t = name.trim(); if (!t) return;
    if (subjects.some(s => nc(s.name)===nc(t))) { showMsg('Ya existe una materia similar.','error'); return; }
    const ns2 = [...subjects, {id:`s-${uid()}`, name:t}];
    setSubjects(ns2); saveAll(courses, teachers, ns2, schedule, lastReport);
    setEditingSubject(null); showMsg('Materia creada.');
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const potentialDuplicates = useMemo(() => {
    const groups = new Map();
    subjects.forEach(s => { const key = nc(s.name); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); });
    return Array.from(groups.values()).filter(g => g.length > 1);
  }, [subjects]);

  const subjectUsage = useMemo(() => {
    const map = new Map();
    Object.values(schedule).forEach(c => { if (c.subjectId) map.set(c.subjectId,(map.get(c.subjectId)||0)+1); });
    return map;
  }, [schedule]);

  const alertCount = (lastReport?.warnings?.length||0) + (lastReport?.skipped?.length||0) + conflictList.length;


  // ── Report refs & export ─────────────────────────────────────────────────
  const reportTableRef = useRef(null);
  const gridTableRef   = useRef(null);
  const gridScrollRef  = useRef(null);
  const [gridScrolled, setGridScrolled] = useState(false);
  const reportTitleRef = useRef('Reporte');

  const copyToExcel = useCallback(() => {
    const table = reportTableRef.current;
    if (!table) { showMsg('No hay tabla para copiar.', 'error'); return; }
    const rows = Array.from(table.querySelectorAll('tr'));
    const tsv = rows.map(row =>
      Array.from(row.querySelectorAll('th,td'))
        .map(cell => cell.innerText.replace(/\t/g,' ').replace(/\n/g,' ').trim())
        .join('\t')
    ).join('\n');
    navigator.clipboard.writeText(tsv)
      .then(() => showMsg('Copiado — abrí Excel y pegá con Ctrl+V'))
      .catch(() => showMsg('No se pudo acceder al portapapeles.', 'error'));
  }, []);

  const exportPDF = useCallback(() => {
    const table = reportTableRef.current;
    if (!table) { showMsg('No hay tabla para exportar.', 'error'); return; }
    const title    = reportTitleRef.current || 'Reporte';
    const date     = new Date().toLocaleDateString('es-AR');
    const tableHtml = table.outerHTML;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${title}</title>
<style>
@page{size:A4 landscape;margin:12mm 14mm;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;font-size:8pt;color:#1e293b;}
h1{font-size:13pt;font-weight:900;margin-bottom:2mm;text-transform:uppercase;letter-spacing:.03em;}
.meta{font-size:7pt;color:#94a3b8;margin-bottom:5mm;}
table{width:100%;border-collapse:collapse;}
th{background:#4f46e5;color:#fff;font-size:7pt;font-weight:700;padding:4px 5px;text-align:left;text-transform:uppercase;border:1px solid #3730a3;}
td{padding:4px 5px;border:1px solid #e2e8f0;font-size:7.5pt;vertical-align:top;}
tr:nth-child(even) td{background:#f8fafc;}
td:first-child{background:#f1f5f9!important;font-weight:700;text-align:center;white-space:nowrap;}
.top{font-weight:700;color:#1e293b;}
.bot{font-size:6.5pt;color:#64748b;margin-top:1px;text-transform:uppercase;}
@media screen{body{padding:10mm;}}
</style></head><body>
<h1>${title}</h1><p class="meta">Horaria · ${date}</p>${tableHtml}
<script>
document.querySelectorAll('td div:first-child').forEach(el=>el.classList.add('top'));
document.querySelectorAll('td div:last-child:not(:first-child)').forEach(el=>el.classList.add('bot'));
window.print();window.onafterprint=()=>window.close();
<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, []);

  // ── Grid export (main schedule grid) ────────────────────────────────────
  const exportGridPDF = useCallback(() => {
    const day = DAYS[currentDay] || 'Día';
    const date = new Date().toLocaleDateString('es-AR');
    // Build table HTML from current schedule
    const classPeriods = FIXED_PERIODS.filter(p => p.type==='class' || p.type==='pe');
    const courseHeaders = courses.map(c => `<th>${c.name}</th>`).join('');
    const rows = classPeriods.map(p => {
      const cells = courses.map(course => {
        const key = `${currentDay}-${p.id}-${course.id}`;
        const cell = schedule[key];
        const subj = cell?.subjectId ? subjects.find(s => s.id === cell.subjectId)?.name || '' : '';
        const tch  = cell?.teacherId ? teachers.find(t => t.id === cell.teacherId)?.name || '' : '';
        return `<td><div class="top">${subj || '—'}</div>${tch ? `<div class="bot">${tch}</div>` : ''}</td>`;
      }).join('');
      return `<tr><td class="mod">${p.mod}°<br/><small>${p.start}–${p.end}</small></td>${cells}</tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Grilla ${day}</title>
<style>
@page{size:A4 landscape;margin:12mm 14mm;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;font-size:8pt;color:#1e293b;}
h1{font-size:13pt;font-weight:900;margin-bottom:2mm;text-transform:uppercase;}
.meta{font-size:7pt;color:#94a3b8;margin-bottom:5mm;}
table{width:100%;border-collapse:collapse;}
th{background:#4f46e5;color:#fff;font-size:7pt;font-weight:700;padding:4px 5px;text-align:left;border:1px solid #3730a3;}
td{padding:4px 5px;border:1px solid #e2e8f0;font-size:7.5pt;vertical-align:top;}
td.mod{background:#f1f5f9!important;font-weight:700;text-align:center;white-space:nowrap;width:48px;}
tr:nth-child(even) td:not(.mod){background:#f8fafc;}
.top{font-weight:700;color:#1e293b;}
.bot{font-size:6.5pt;color:#64748b;margin-top:1px;text-transform:uppercase;}
small{font-size:5.5pt;color:#94a3b8;display:block;}
</style></head><body>
<h1>Grilla: ${day}</h1><p class="meta">Horaria · ${date}</p>
<table><thead><tr><th>Mód.</th>${courseHeaders}</tr></thead><tbody>${rows}</tbody></table>
<script>window.print();window.onafterprint=()=>window.close();<\/script>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [currentDay, courses, subjects, teachers, schedule]);

  const exportGridExcel = useCallback(() => {
    const day = DAYS[currentDay] || 'Día';
    const classPeriods = FIXED_PERIODS.filter(p => p.type==='class' || p.type==='pe');
    const header = ['Mód.', ...courses.map(c => c.name)].join('\t');
    const rows = classPeriods.map(p => {
      const cells = courses.map(course => {
        const key = `${currentDay}-${p.id}-${course.id}`;
        const cell = schedule[key];
        const subj = cell?.subjectId ? subjects.find(s => s.id === cell.subjectId)?.name || '' : '';
        const tch  = cell?.teacherId ? teachers.find(t => t.id === cell.teacherId)?.name || '' : '';
        return subj ? (tch ? subj + ' / ' + tch : subj) : '';
      }).join('\t');
      return p.mod + '°\t' + cells;
    }).join('\n');
    const tsv = day + '\n' + header + '\n' + rows;
    navigator.clipboard.writeText(tsv)
      .then(() => showMsg('Copiado — abrí Excel y pegá con Ctrl+V'))
      .catch(() => showMsg('No se pudo acceder al portapapeles.', 'error'));
  }, [currentDay, courses, subjects, teachers, schedule]);

  // ── Schedule Grid (shared report component) ───────────────────────────────
  const ScheduleGrid = useCallback(({ title, cellFn, modCount, conflictFn, conflictDetailFn }) => {
    reportTitleRef.current = title;
    const classPeriods = FIXED_PERIODS.filter(p => p.type==='class' || p.type==='pe');
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">{title}</h3>
            {modCount != null && (
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                <span className="text-indigo-600 font-black text-base">{modCount}</span> módulos semanales
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={copyToExcel}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 active:scale-95 transition-all">
              <Copy size={12}/> Copiar para Excel
            </button>
            <button onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 active:scale-95 transition-all">
              <Download size={12}/> Descargar PDF
            </button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table ref={reportTableRef} className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase">
                  <th className="p-3 border-b border-r border-slate-200 w-20 text-center">Mód.</th>
                  {DAYS.map(d => <th key={d} className="p-3 border-b border-r border-slate-200 min-w-[140px]">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {classPeriods.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 border-b border-r border-slate-100 bg-slate-50/70 text-center align-middle">
                      <div className={`text-[11px] font-black leading-none ${p.type==='pe'?'text-emerald-600':'text-indigo-600'}`}>{p.mod}°</div>
                      <div className="text-[8px] text-slate-400 font-bold mt-1">{p.start}–{p.end}</div>
                    </td>
                    {DAYS.map((_, dI) => {
                      const cell = cellFn(dI, p);
                      const isConflict = conflictFn ? conflictFn(dI, p) : false;
                      const conflictDetail = (isConflict && conflictDetailFn) ? conflictDetailFn(dI, p) : null;
                      return (
                        <td key={dI} className={"p-2 border-b border-r align-top " + (isConflict ? "border-red-300 bg-red-50" : "border-slate-100")}>
                          {cell ? (
                            <div>
                              <div className={"text-[11px] font-bold leading-snug " + (isConflict ? "text-red-700" : "text-slate-800")}>{cell.top}</div>
                              {cell.bottom && <div className={"text-[9px] font-bold uppercase mt-0.5 " + (isConflict ? "text-red-400" : "text-slate-400")}>{cell.bottom}</div>}
                              {isConflict && (
                                <div className="mt-1 bg-red-100 border border-red-200 rounded px-1.5 py-1">
                                  <div className="text-[8px] text-red-600 font-black uppercase tracking-wide mb-0.5">⚠ Conflicto</div>
                                  {conflictDetail && conflictDetail.map((d,i) => (
                                    <div key={i} className="text-[8px] text-red-500 font-bold leading-tight">{d}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-slate-200 font-bold text-sm">—</span>}
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
    );
  }, [copyToExcel, exportPDF]);

  // ── Report render ─────────────────────────────────────────────────────────
  const renderReport = () => {
    if (!reportSelection) return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 size={44} className="text-slate-200 mb-4"/>
        <p className="font-bold text-slate-400 text-sm">Seleccioná un elemento para ver el reporte</p>
      </div>
    );
    if (reportType === 'teacher') {
      const teacher = teachers.find(t => t.id === reportSelection);
      if (!teacher) return null;
      const modCount = Object.values(schedule).filter(v => v.teacherId === teacher.id).length;
      const idx = {};
      Object.entries(schedule).forEach(([key, val]) => {
        if (val.teacherId !== teacher.id) return;
        const [dI, pI, cI] = key.split('-');
        const subj   = subjects.find(s => s.id === val.subjectId);
        const course = courses.find(c => c.id === parseInt(cI));
        idx[`${dI}-${pI}`] = { top: subj?.name || '—', bottom: course?.name || '' };
      });
      return (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 text-xl font-black shrink-0 text-white"
              style={teacherAvatarStyle(teacher.colorHex)}>
              {teacher.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-black text-slate-800 text-base uppercase">{teacher.name}</div>
              <div className="text-xs text-slate-400 font-bold mt-0.5">{teacher.subject || 'Sin materias asignadas'}</div>
            </div>
          </div>
          <ScheduleGrid title={`Horario docente: ${teacher.name}`} modCount={modCount}
            cellFn={(dI, p) => idx[`${dI}-${p.id}`] || null}
            conflictFn={(dI, p) => courses.some(c => conflictKeys.has(`${dI}-${p.id}-${c.id}`) && schedule[`${dI}-${p.id}-${c.id}`]?.teacherId === teacher.id)}
            conflictDetailFn={(dI, p) => {
              const conflicting = courses.filter(c => conflictKeys.has(`${dI}-${p.id}-${c.id}`) && schedule[`${dI}-${p.id}-${c.id}`]?.teacherId === teacher.id);
              return conflicting.map(c => { const subj = subjects.find(s => s.id === schedule[`${dI}-${p.id}-${c.id}`]?.subjectId); return `${c.name}: ${subj?.name || '—'}`; });
            }}/>
        </div>
      );
    }
    if (reportType === 'course') {
      const course = courses.find(c => c.id === parseInt(reportSelection));
      if (!course) return null;
      return (
        <ScheduleGrid title={`Horario curso: ${course.name}`}
          conflictFn={(dI, p) => conflictKeys.has(`${dI}-${p.id}-${course.id}`)}
          conflictDetailFn={(dI, p) => {
            const cell = schedule[`${dI}-${p.id}-${course.id}`];
            if (!cell?.teacherId) return [];
            const t = teachers.find(t => t.id === cell.teacherId);
            const otherCourses = courses.filter(c => c.id !== course.id && conflictKeys.has(`${dI}-${p.id}-${c.id}`) && schedule[`${dI}-${p.id}-${c.id}`]?.teacherId === cell.teacherId);
            return [`${t?.name || '—'} también en: ${otherCourses.map(c=>c.name).join(', ')}`];
          }}
          cellFn={(dI, p) => {
          const cell    = schedule[`${dI}-${p.id}-${course.id}`];
          if (!cell) return null;
          const subj    = subjects.find(s => s.id === cell.subjectId);
          const teacher = teachers.find(t => t.id === cell.teacherId);
          return { top: subj?.name || '—', bottom: teacher?.name || '' };
        }}/>
      );
    }
    if (reportType === 'subject') {
      const subj = subjects.find(s => s.id === reportSelection);
      if (!subj) return null;
      const idx = {};
      Object.entries(schedule).forEach(([key, val]) => {
        if (val.subjectId !== reportSelection) return;
        const [dI, pI, cI] = key.split('-');
        const teacher = teachers.find(t => t.id === val.teacherId);
        const course  = courses.find(c => c.id === parseInt(cI));
        const slot    = `${dI}-${pI}`;
        if (!idx[slot]) idx[slot] = [];
        idx[slot].push(`${teacher?.name || '—'} (${course?.name || '—'})`);
      });
      return (
        <ScheduleGrid title={`Materia: ${subj.name}`} cellFn={(dI, p) => {
          const entries = idx[`${dI}-${p.id}`];
          if (!entries || entries.length === 0) return null;
          return { top: entries[0], bottom: entries.length > 1 ? `+${entries.length-1} más` : '' };
        }}/>
      );
    }
  };


  const tabs = [
    { id:'grid',     label:'Grilla',   icon:<Calendar size={13}/> },
    { id:'teachers', label:'Plantel',  icon:<Users    size={13}/> },
    { id:'subjects', label:'Materias', icon:<BookOpen size={13}/> },
    { id:'reports',  label:'Reportes', icon:<FileText size={13}/> },
    { id:'import',   label:'Importar', icon:<Upload   size={13}/> },
    { id:'alerts',   label:'Alertas',  icon:<Bell     size={13}/> },
    { id:'config',   label:'Config',   icon:<Settings size={13}/> },
  ];

  const sortedSubjects = useMemo(() =>
    [...subjects].sort((a,b)=>a.name.localeCompare(b.name,'es')),
    [subjects]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-3 md:px-5 py-2.5 flex items-center justify-between shadow-sm gap-2">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="bg-indigo-600 p-1.5 rounded-lg"><Calendar className="text-white" size={16}/></div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">Horaria</h1>
            <CloudDot status={cloudStatus} fbStatus={fbConfig ? fbStatus : 'idle'}/>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {conflictPairs>0&&(
            <button
              onClick={()=>setActiveTab('alerts')}
              className="hidden sm:flex items-center gap-1 bg-red-50 text-red-600 px-2 py-1 rounded-lg border border-red-200 text-[10px] font-bold hover:bg-red-100 transition-colors cursor-pointer">
              <AlertTriangle size={10}/>{conflictPairs} conflicto{conflictPairs!==1?'s':''}
            </button>
          )}
          {potentialDuplicates.length>0&&(
            <button onClick={()=>setActiveTab('subjects')}
              className="hidden sm:flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded-lg border border-amber-100 text-[10px] font-bold hover:bg-amber-100 transition-colors">
              <AlertCircle size={10}/>{potentialDuplicates.length} dup.
            </button>
          )}
          <nav className="flex bg-slate-100 p-0.5 rounded-xl">
            {tabs.map(t => (
              <button key={t.id}
                onClick={() => { setActiveTab(t.id); setReportSelection(''); setListSearch(''); setSelectedItems(new Set()); if(t.id!=='import') setImportStep('input'); }}
                className={`relative px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1
                  ${activeTab===t.id?'bg-white text-indigo-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                {t.icon}
                <span className="hidden md:inline">{t.label}</span>
                {t.id==='alerts' && alertCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {alertCount > 9 ? '!' : alertCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Firebase error banner — shown when connection fails ── */}
      {fbConfig && fbStatus === 'error' && (
        <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <WifiOff size={15} className="shrink-0"/>
            <span className="text-sm font-bold">Sin conexión a Firebase — los cambios NO se están guardando en la nube.</span>
          </div>
          <button onClick={() => setActiveTab('config')}
            className="text-xs font-black bg-white text-red-600 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors shrink-0">
            Ver config
          </button>
        </div>
      )}

      {/* ── Toast ── */}
      {message&&(
        <div className={`fixed top-14 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2
          ${message.type==='error'?'bg-red-500':'bg-emerald-600'}`}>
          {message.type==='error'?<AlertCircle size={15}/>:<Check size={15}/>}
          <span className="font-bold">{message.text}</span>
        </div>
      )}

      <main className="p-3 md:p-5 max-w-[1400px] mx-auto">

        {/* ══ GRILLA ══════════════════════════════════════════════════════════ */}
        {activeTab==='grid'&&(
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-100">
                {DAYS.map((d,i)=>(
                  <button key={i} onClick={()=>setCurrentDay(i)}
                    className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wide transition-all border-b-2
                      ${i===currentDay?'border-indigo-600 text-indigo-600 bg-indigo-50/60':'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                    <span className="hidden sm:inline">{d}</span>
                    <span className="sm:hidden">{d.slice(0,3)}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Search — icons vertically centered with leading-none to avoid descender shift */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-0 bottom-0 my-auto text-slate-400 pointer-events-none" style={{height:'12px',width:'12px'}} size={12}/>
                  <input type="text" placeholder="Buscar docente o materia…"
                    className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-7 py-1.5 leading-none outline-none focus:ring-2 ring-indigo-100"
                    value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
                  {searchTerm&&<button onClick={()=>setSearchTerm('')} className="absolute right-2 top-0 bottom-0 my-auto flex items-center text-slate-400 h-full"><X size={11}/></button>}
                </div>
                {/* Export buttons */}
                {courses.length>0&&(
                  <div className="flex gap-1">
                    <button onClick={exportGridExcel} title="Copiar para Excel"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                      <Copy size={12}/><span className="hidden sm:inline">Excel</span>
                    </button>
                    <button onClick={exportGridPDF} title="Exportar PDF"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                      <Download size={12}/><span className="hidden sm:inline">PDF</span>
                    </button>
                  </div>
                )}
                {/* Undo/redo — right side */}
                <div className="flex gap-1 ml-auto">
                  <button onClick={undo} disabled={historyIdx_s<=0} title="Deshacer (Ctrl+Z)"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Undo2 size={13}/><span className="hidden sm:inline">Deshacer</span>
                  </button>
                  <button onClick={redo} disabled={historyIdx_s>=history.current.length-1} title="Rehacer (Ctrl+Y)"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Redo2 size={13}/><span className="hidden sm:inline">Rehacer</span>
                  </button>
                </div>
              </div>
            </div>

            {courses.length===0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center text-center gap-4">
                <Calendar size={44} className="text-slate-200"/>
                <div><h3 className="font-black text-slate-400 text-lg">Sin datos de horario</h3><p className="text-slate-400 text-sm mt-1">Importá un CSV desde la pestaña <strong>Importar</strong>.</p></div>
                <button onClick={()=>setActiveTab('import')} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"><Upload size={14}/>Importar</button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div ref={gridScrollRef} className="overflow-auto" style={{maxHeight:'calc(100vh - 175px)'}}
                  onScroll={e=>setGridScrolled(e.currentTarget.scrollTop>4)}>
                  <table className="w-full border-separate border-spacing-0 table-fixed">
                    <thead className="sticky top-0 z-20">
                      <tr className={gridScrolled?'bg-white/80 backdrop-blur-sm shadow-sm':'bg-slate-50'} style={{transition:'background 0.2s'}}>
                        <th className="p-2.5 border-b border-r border-slate-200 text-[10px] font-bold text-slate-500 uppercase w-16 sticky left-0 bg-slate-50 z-30">Mód.</th>
                        {courses.map(c=><th key={c.id} className={`p-2.5 border-b border-r border-slate-200 text-[11px] font-bold text-slate-700 text-left ${gridScrolled?'bg-white/80':''}`} style={{width:'140px',maxWidth:'140px',minWidth:'140px'}}><span className="block truncate">{c.name}</span></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {FIXED_PERIODS.map(period=>{
                        if (period.type==='break'||period.type==='separator') return (
                          <tr key={period.id}><td colSpan={courses.length+1}
                            className={`py-1.5 px-4 text-center text-[10px] font-black uppercase tracking-widest border-b
                              ${period.type==='break'?'bg-slate-50 text-slate-400':'bg-indigo-50 text-indigo-400'}`}>
                            {period.label}
                          </td></tr>
                        );
                        return (
                          <tr key={period.id} className="group">
                            <td className="p-2 border-b border-r border-slate-100 text-center sticky left-0 bg-white z-10 group-hover:bg-slate-50/70 transition-colors">
                              <span className={`text-[11px] font-black block ${period.type==='pe'?'text-emerald-600':'text-indigo-600'}`}>{period.mod}°</span>
                              <span className="text-[8px] text-slate-400 font-bold block leading-tight">{period.start}</span>
                              <span className="text-[8px] text-slate-400 font-bold block leading-tight">{period.end}</span>
                            </td>
                            {courses.map(course=>{
                              const key         = `${currentDay}-${period.id}-${course.id}`;
                              const cell        = schedule[key];
                              const teacher     = teachers.find(t=>t.id===cell?.teacherId);
                              const subject     = subjects.find(s=>s.id===cell?.subjectId);
                              const hasConflict = conflicts.has(key);
                              const highlighted = searchTerm?isHighlighted(cell):false;
                              const dimmed      = searchTerm&&!highlighted&&!!cell;
                              return (
                                <td key={course.id}
                                  style={{width:'140px',maxWidth:'140px',overflow:'hidden'}}
                                  className={`p-1.5 border-b border-r border-slate-100 cursor-pointer transition-colors ${highlighted?'bg-yellow-50':'hover:bg-slate-50/60'}`}
                                  onClick={()=>openCellEditor(period.id,course.id)}>
                                  {cell?(
                                    <div className={`rounded-lg p-2 border h-full transition-all ${dimmed?'opacity-20':''} ${hasConflict?'border-red-300 bg-red-50 text-red-700':'border-slate-200'}`}
                                      style={!hasConflict && teacher?.colorHex ? teacherStyle(teacher.colorHex) : {}}>
                                      <div className="text-[10px] font-bold leading-snug truncate overflow-hidden whitespace-nowrap">{subject?.name??<span className="italic text-slate-400">Sin materia</span>}</div>
                                      <div className="text-[8px] opacity-70 font-bold uppercase truncate overflow-hidden whitespace-nowrap mt-0.5">{teacher?.name??<span className="text-slate-300">Sin docente</span>}</div>
                                      {hasConflict&&<div className="flex items-center gap-0.5 mt-1"><AlertTriangle size={8} className="text-red-500 shrink-0"/><span className="text-[8px] text-red-500 font-bold">Conflicto</span></div>}
                                    </div>
                                  ):(
                                    <div className="rounded-lg p-2 border border-dashed border-transparent hover:border-slate-200 h-full min-h-[44px] flex items-center justify-center">
                                      <span className="text-slate-200 text-xl leading-none">+</span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {conflictPairs>0&&(
              <ConflictPanel
                conflicts={conflictList}
                onNavigate={(dayIdx) => setCurrentDay(dayIdx)}
                onEdit={(dayIdx, periodId, courseId) => { setCurrentDay(dayIdx); openCellEditor(periodId, courseId); }}
              />
            )}
          </div>
        )}


        {/* ══ PLANTEL & MATERIAS ══════════════════════════════════════════════ */}
        {(activeTab==='teachers'||activeTab==='subjects')&&(()=>{
          const isTeachers = activeTab==='teachers';
          const items = isTeachers
            ? [...teachers].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(t=>({
                id: t.id, name: t.name, subtitle: t.subject||'Sin materias asignadas',
                badge: `${Object.values(schedule).filter(v=>v.teacherId===t.id).length} mód. sem.`,
                avatar: t.name.charAt(0).toUpperCase(), colorHex: t.colorHex, isDupe: false,
              }))
            : sortedSubjects.map(s=>({
                id: s.id, name: s.name, subtitle: null,
                badge: `${subjectUsage.get(s.id)??0} uso${(subjectUsage.get(s.id)??0)!==1?'s':''}`,
                avatar: s.name.charAt(0).toUpperCase(), colorHex: null,
                isDupe: potentialDuplicates.some(g=>g.find(x=>x.id===s.id)),
              }));

          const filtered = listSearch.trim() ? items.filter(it=>ns(it.name).includes(ns(listSearch))) : items;
          const allIds   = new Set(filtered.map(it=>it.id));
          const selCount = [...selectedItems].filter(id=>allIds.has(id)).length;
          const allSel   = filtered.length>0 && selCount===filtered.length;

          const toggleItem = id => setSelectedItems(prev=>{ const next=new Set(prev); next.has(id)?next.delete(id):next.add(id); return next; });
          const toggleAll  = () => setSelectedItems(prev=>{ if(allSel){const next=new Set(prev);filtered.forEach(it=>next.delete(it.id));return next;} return new Set([...prev,...filtered.map(it=>it.id)]); });
          const openMergeModal = () => { const sel=filtered.filter(it=>selectedItems.has(it.id)); if(sel.length<2)return; setMergeKeepId(sel[0].id); setMergeModal({items:sel,isTeachers}); };
          const bulkDelete = () => {
            const sel=filtered.filter(it=>selectedItems.has(it.id)); if(!sel.length)return;
            if(!window.confirm(`¿Eliminar ${sel.length} elemento${sel.length!==1?'s':''}? Esta acción no se puede deshacer.`))return;
            sel.forEach(it=>isTeachers?deleteTeacher(it.id):deleteSubject(it.id)); setSelectedItems(new Set());
          };
          const hasSel = selCount>0;

          return(
            <div className="space-y-3">
              {/* sticky top bar */}
              <div className="sticky top-[57px] z-30 bg-slate-50/95 backdrop-blur-sm pb-2 space-y-2">
              {/* header */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <h2 className="text-xl font-black text-slate-800">
                  {isTeachers?'Plantel Docente':'Materias'}
                  <span className="text-slate-400 text-sm font-bold ml-2">{items.length}</span>
                </h2>
                <button
                  onClick={()=>isTeachers
                    ?setEditingTeacher({id:`t-${uid()}`,name:'',subject:'',color:'',colorHex:HEX_COLORS[teachers.length%HEX_COLORS.length]})
                    :setEditingSubject({id:'new',name:''})}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2">
                  <Plus size={13}/>{isTeachers?'Agregar Docente':'Nueva Materia'}
                </button>
              </div>

              {/* duplicate alert */}
              {!isTeachers&&potentialDuplicates.length>0&&(
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0"/>
                  <p className="text-xs text-amber-800 font-bold">
                    {potentialDuplicates.length} posible{potentialDuplicates.length!==1?'s duplicados':' duplicado'} — marcados con <span className="text-amber-500">⚠</span>. Seleccionalos y usá <strong>Unificar selección</strong>.
                  </p>
                </div>
              )}

              {/* toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13}/>
                  <input type="text" placeholder={isTeachers?'Buscar docente…':'Buscar materia…'}
                    className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:ring-2 ring-indigo-100"
                    value={listSearch} onChange={e=>{setListSearch(e.target.value);setSelectedItems(new Set());}}/>
                </div>
                {hasSel&&(
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5">
                    <span className="text-xs font-black text-indigo-600">{selCount} seleccionado{selCount!==1?'s':''}</span>
                    <button onClick={openMergeModal} disabled={selCount<2}
                      className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${selCount>=2?'text-indigo-700 bg-indigo-100 hover:bg-indigo-200 cursor-pointer':'text-slate-400 bg-slate-100 cursor-not-allowed opacity-60'}`}>
                      <Merge size={11}/>Unificar selección
                    </button>
                    <button onClick={bulkDelete}
                      className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors">
                      <Trash2 size={11}/>Eliminar
                    </button>
                    <button onClick={()=>setSelectedItems(new Set())} className="text-slate-400 hover:text-slate-600 transition-colors ml-1"><X size={13}/></button>
                  </div>
                )}
              </div>
              </div>{/* end sticky */}

              {/* list */}
              {filtered.length===0?(
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  {isTeachers?<Users size={36} className="text-slate-200 mx-auto mb-3"/>:<BookOpen size={36} className="text-slate-200 mx-auto mb-3"/>}
                  <p className="font-bold text-slate-400">{listSearch?'Sin resultados.':isTeachers?'Sin docentes registrados.':'Sin materias registradas.'}</p>
                </div>
              ):(
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* select-all */}
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"/>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">{allSel?'Deseleccionar todo':'Seleccionar todo'}</span>
                  </div>

                  {filtered.map(item=>{
                    const isSel = selectedItems.has(item.id);
                    const modCount = isTeachers ? parseInt(item.badge) : null;
                    return(
                      <div key={item.id}
                        className={`flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 last:border-0 transition-colors
                          ${isSel?'bg-indigo-50/60':item.isDupe?'bg-amber-50/30':'hover:bg-slate-50/60'}`}>

                        <input type="checkbox" checked={isSel} onChange={()=>toggleItem(item.id)}
                          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer shrink-0"/>

                        {/* avatar with color */}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border text-sm font-black text-white"
                          style={item.colorHex ? teacherAvatarStyle(item.colorHex) : {backgroundColor:'#e2e8f0', borderColor:'#cbd5e1', color:'#64748b'}}>
                          {item.avatar}
                        </div>

                        {/* name + subtitle + badge + actions — todo junto, sin espacio */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.isDupe&&<AlertTriangle size={11} className="text-amber-400 shrink-0"/>}
                            <span className="font-bold text-slate-800 text-sm truncate">{item.name}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${parseInt(item.badge)===0||item.badge.startsWith('0')?'bg-slate-100 text-slate-400':'bg-indigo-50 text-indigo-600'}`}>
                              {item.badge}
                            </span>
                            {/* actions inline, right after the name */}
                            <button
                              onClick={()=>isTeachers?setEditingTeacher({...teachers.find(t=>t.id===item.id)}):setEditingSubject({...subjects.find(s=>s.id===item.id)})}
                              className="p-1 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-indigo-500 transition-colors shrink-0" title="Editar">
                              <Edit2 size={13}/>
                            </button>
                            <button
                              onClick={()=>{if(window.confirm(`¿Eliminar "${item.name}"?`))isTeachers?deleteTeacher(item.id):deleteSubject(item.id);}}
                              className="p-1 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors shrink-0" title="Eliminar">
                              <Trash2 size={13}/>
                            </button>
                          </div>
                          {item.subtitle&&<p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{item.subtitle}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}


        {/* ══ REPORTES ════════════════════════════════════════════════════════ */}
        {activeTab==='reports'&&(
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Tipo</label>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  {[['teacher','Docente'],['course','Curso'],['subject','Materia']].map(([val,lbl])=>(
                    <button key={val} onClick={()=>{setReportType(val);setReportSelection('');}}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${reportType===val?'bg-white text-indigo-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">{reportType==='teacher'?'Docente':reportType==='course'?'Curso':'Materia'}</label>
                <SearchableDropdown
                  value={reportSelection}
                  onChange={v => setReportSelection(v)}
                  items={
                    reportType==='teacher' ? [...teachers].sort((a,b)=>a.name.localeCompare(b.name,'es')) :
                    reportType==='course'  ? courses :
                    [...subjects].sort((a,b)=>a.name.localeCompare(b.name,'es'))
                  }
                  placeholder="— Seleccionar —"
                  emptyLabel="— Seleccionar —"
                />
              </div>
            </div>
            {renderReport()}
          </div>
        )}

        {/* ══ IMPORTAR ════════════════════════════════════════════════════════ */}
        {activeTab==='import'&&(
          <>
            {importStep==='input'&&(
              <div className="space-y-4 max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Importar Horario</h2>
                    <p className="text-sm text-slate-500 mt-1">Pegá el contenido del CSV. Antes de guardar, podrás ver una tabla de preview completa para verificar que todo esté bien.</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Formato esperado</p>
                    {['LUNES,1A,1B,1C,1D','1,Matemática,Lengua,Historia,Biología',',García Juan,López María,Pérez Ana,Torres Luis','2,Física,Matemática,Arte,Química',',Romero Pedro,García Juan,Díaz Rosa,Vega Omar','… (repetir para cada día)'].map((line,i)=>(
                      <div key={i} className={`text-xs font-mono ${line.startsWith('…')?'text-slate-400 italic':'text-slate-600'}`}>{line}</div>
                    ))}
                    <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-200">La fila de docentes debe empezar con una coma.</p>
                  </div>
                  <textarea value={csvContent} onChange={e=>setCsvContent(e.target.value)}
                    placeholder="Pegá aquí el contenido CSV…"
                    className="w-full h-64 text-xs font-mono border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 ring-indigo-100 resize-y bg-white text-slate-700 placeholder-slate-300"/>
                  <div className="flex justify-end gap-3 flex-wrap">
                    {(courses.length>0||teachers.length>0)&&(
                      <button onClick={()=>{if(window.confirm('¿Eliminar todos los datos del horario?')){setCourses([]);setTeachers([]);setSubjects([]);setSchedule({});saveAll([],[],[],{},lastReport);showMsg('Datos eliminados.');}}}
                        className="px-4 py-2.5 rounded-xl font-bold text-sm border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2">
                        <Trash2 size={13}/>Limpiar Todo
                      </button>
                    )}
                    <button onClick={handleAnalyze} disabled={!csvContent.trim()}
                      className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                      <Eye size={13}/>Analizar y Previsualizar
                    </button>
                  </div>
                </div>
              </div>
            )}
            {importStep==='preview'&&parsedPreview&&(
              <ImportPreview parsedPairs={parsedPreview.parsedPairs} courses={parsedPreview.detectedCourses} onConfirm={handleConfirmImport} onBack={()=>setImportStep('input')}/>
            )}
          </>
        )}

        {/* ══ ALERTAS ═════════════════════════════════════════════════════════ */}
        {activeTab==='alerts'&&(
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-800">Alertas y Reportes</h2>
                {lastReport&&<p className="text-xs text-slate-400 font-medium mt-0.5">Última importación: {lastReport.date}</p>}
              </div>
            </div>
            {/* Historial de cambios — arriba, mismo estilo que deduped */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-slate-400"/>
                  <span className="text-sm font-black text-slate-600">Historial de cambios ({changeLog.length})</span>
                </div>
                {changeLog.length>0&&<button onClick={()=>{ setChangeLog([]); saveAll(courses, teachers, subjects, schedule, lastReport, mappings, [], acknowledgedConflicts); }} className="text-xs text-slate-400 hover:text-red-500 transition-colors font-bold">Limpiar</button>}
              </div>
              <div className="divide-y divide-slate-100 overflow-y-auto" style={{maxHeight:'240px'}}>
                {changeLog.length===0
                  ? <div className="px-4 py-2.5 text-sm text-slate-400">Sin cambios registrados aún.</div>
                  : changeLog.map(entry=>(
                    <div key={entry.id} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                      <span className="text-slate-400 shrink-0 font-mono">{entry.date} {entry.ts}</span>
                      <ArrowRight size={10} className="text-slate-300 shrink-0"/>
                      <span className="text-blue-600 font-bold shrink-0">{entry.action}</span>
                      <span className="text-slate-300 shrink-0">·</span>
                      <span className="font-medium text-slate-700 truncate">{entry.detail}</span>
                    </div>
                  ))
                }
              </div>
            </div>
            <AlertsPanel
              report={lastReport}
              conflictList={conflictList}
              allConflictList={allConflictList}
              acknowledgedConflicts={acknowledgedConflicts}
              onAcknowledge={toggleAcknowledgeConflict}
              liveCounts={{ courses: courses.length, teachers: teachers.length, subjects: subjects.length, modules: Object.keys(schedule).length }}
              onGoToConflict={(c) => {
                setSearchTerm(c.teacher?.name || '');
                setCurrentDay(c.dayIdx);
                setActiveTab('grid');
              }}
            />
          </div>
        )}

        {/* ══ CONFIG ══════════════════════════════════════════════════════════ */}
        {activeTab==='config'&&(
          <div className="max-w-2xl mx-auto space-y-5">
            <h2 className="text-xl font-black text-slate-800">Configuración de base de datos</h2>
            <div className={`rounded-2xl border p-5 flex items-center gap-4 ${
              fbConfig
                ? fbStatus==='connected' ? 'bg-emerald-50 border-emerald-200'
                : fbStatus==='error'     ? 'bg-red-50 border-red-300'
                : 'bg-amber-50 border-amber-200'
              : 'bg-slate-50 border-slate-200'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                fbConfig
                  ? fbStatus==='connected' ? 'bg-emerald-100'
                  : fbStatus==='error'     ? 'bg-red-100'
                  : 'bg-amber-100'
                : 'bg-slate-200'}`}>
                {fbConfig
                  ? fbStatus==='connected' ? <Database size={20} className="text-emerald-600"/>
                  : fbStatus==='error'     ? <WifiOff  size={20} className="text-red-500"/>
                  : <Database size={20} className="text-amber-500"/>
                  : <WifiOff size={20} className="text-slate-400"/>
                }
              </div>
              <div className="flex-1">
                <p className={`font-black text-sm ${fbConfig && fbStatus==='error' ? 'text-red-700' : 'text-slate-800'}`}>
                  {!fbConfig
                    ? 'Sin Firebase — usando almacenamiento local'
                    : fbStatus==='connected'  ? 'Conectado a Firebase'
                    : fbStatus==='connecting' ? 'Conectando a Firebase…'
                    : fbStatus==='error'      ? '⚠ Error de conexión — revisá las reglas de Firestore'
                    : 'Firebase configurado'}
                </p>
                <p className={`text-xs font-medium mt-0.5 ${fbConfig && fbStatus==='error' ? 'text-red-500' : 'text-slate-500'}`}>
                  {fbConfig
                    ? `Proyecto: ${fbConfig.projectId}${fbStatus==='error' ? ' · Causa probable: reglas de Firestore no permiten acceso anónimo' : ''}`
                    : 'Los datos solo se guardan en tu navegador.'}
                </p>
              </div>
              {fbConfig&&(
                <button onClick={handleDisconnectFirebase}
                  className="text-xs font-bold text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                  Desconectar
                </button>
              )}
            </div>

            {/* Correcciones aprendidas — siempre visible, con sub-pestañas */}
            {(() => {
              const subjectEntries = Object.entries(mappings.subjects || {});
              const teacherEntries = Object.entries(mappings.teachers || {});
              const totalEntries   = subjectEntries.length + teacherEntries.length;
              const subTabs = [
                { id:'subjects', label:'Materias c/ tilde', count: subjectEntries.length },
                { id:'teachers', label:'Docentes unificados', count: teacherEntries.length },
                { id:'all',      label:'Todas', count: totalEntries },
              ];
              const activeEntries =
                configSubTab === 'subjects' ? subjectEntries.map(e=>({...e, type:'subjects'})) :
                configSubTab === 'teachers' ? teacherEntries.map(e=>({...e, type:'teachers'})) :
                [
                  ...subjectEntries.map(([from,to])=>({ from, to, type:'subjects' })),
                  ...teacherEntries.map(([from,to])=>({ from, to, type:'teachers' })),
                ];
              return (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* header */}
                  <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-800 text-base">Correcciones aprendidas</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Se aplican automáticamente en cada importación.</p>
                    </div>
                    {totalEntries > 0 && (
                      <button
                        onClick={() => { const m={teachers:{},subjects:{}}; setMappings(m); saveAll(courses,teachers,subjects,schedule,lastReport,m); showMsg('Correcciones eliminadas.'); }}
                        className="text-xs font-bold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                        Limpiar todo
                      </button>
                    )}
                  </div>
                  {/* sub-tabs */}
                  <div className="flex border-b border-slate-100 bg-slate-50/60 px-3 pt-2 gap-1">
                    {subTabs.map(st => (
                      <button key={st.id} onClick={() => setConfigSubTab(st.id)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5
                          ${configSubTab === st.id
                            ? 'border-indigo-500 text-indigo-600 bg-white shadow-sm'
                            : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {st.label}
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${st.count > 0 ? 'bg-indigo-50 text-indigo-500' : 'bg-slate-100 text-slate-400'}`}>
                          {st.count}
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* content with scrollbar, same height as historial */}
                  <div className="overflow-y-auto" style={{maxHeight:'240px'}}>
                    {activeEntries.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <p className="text-sm text-slate-400 font-medium">Sin correcciones registradas aún.</p>
                        <p className="text-xs text-slate-300 mt-1">Se generan automáticamente al importar o unificar.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {activeEntries.map(entry => {
                          const from = entry[0] ?? entry.from;
                          const to   = entry[1] ?? entry.to;
                          const type = entry.type;
                          return (
                            <div key={`${type}-${from}`} className="flex items-center gap-3 px-4 py-2.5">
                              {configSubTab === 'all' && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${type==='subjects'?'bg-indigo-50 text-indigo-400':'bg-emerald-50 text-emerald-500'}`}>
                                  {type==='subjects'?'MAT':'DOC'}
                                </span>
                              )}
                              <span className="text-xs text-slate-500 font-mono flex-1 truncate line-through opacity-60">{from}</span>
                              <ArrowRight size={11} className="text-slate-300 shrink-0"/>
                              <span className="text-xs font-bold text-slate-800 flex-1 truncate">{to}</span>
                              <button
                                onClick={() => { const newMaps={...mappings,[type]:{...mappings[type]}}; delete newMaps[type][from]; setMappings(newMaps); saveAll(courses,teachers,subjects,schedule,lastReport,newMaps); }}
                                className="text-slate-300 hover:text-red-400 transition-colors shrink-0 ml-1"><X size={13}/></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Guide */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              <div>
                <h3 className="font-black text-slate-800 text-base">Cómo conectar Firebase (gratis)</h3>
                <p className="text-sm text-slate-500 mt-1">Una vez configurado, todos los que usen esta app verán y editarán los mismos datos en tiempo real.</p>
              </div>
              {[
                {n:1,title:'Crear cuenta y proyecto en Firebase',body:'Entrá a firebase.google.com y hacé click en "Comenzar". Iniciá sesión con una cuenta Google. Luego "Crear un proyecto", dale un nombre y completá el asistente.',link:'https://firebase.google.com',linkLabel:'Ir a Firebase →'},
                {n:2,title:'Registrar una app web',body:'Dentro del proyecto, hacé click en el ícono </> (Web). Dale un nombre y hacé click en "Registrar app". NO es necesario activar Firebase Hosting.'},
                {n:3,title:'Copiar la configuración',body:'Después de registrar la app, Firebase te muestra un bloque de código con "firebaseConfig". Copiá ese objeto completo.'},
                {n:4,title:'Configurar Firestore',body:'En el menú izquierdo del proyecto, andá a Build → Firestore Database → "Crear base de datos". Elegí "Empezar en modo de prueba" y cualquier ubicación.'},
                {n:5,title:'Pegar la configuración aquí abajo y conectar',body:'Pegá el objeto firebaseConfig en el campo de abajo y hacé click en Conectar.'},
              ].map(step=>(
                <div key={step.n} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{step.n}</div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">{step.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.body}</p>
                    {step.link&&(<a href={step.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 font-bold mt-1 hover:underline">{step.linkLabel}<ExternalLink size={10}/></a>)}
                  </div>
                </div>
              ))}
            </div>

            {/* Config paste */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide block mb-1.5">Pegá tu firebaseConfig aquí</label>
                <textarea value={fbConfigText} onChange={e=>{setFbConfigText(e.target.value);setFbConfigErr('');}}
                  placeholder={`{\n  "apiKey": "AIza...",\n  "authDomain": "tu-proyecto.firebaseapp.com",\n  "projectId": "tu-proyecto",\n  "storageBucket": "tu-proyecto.appspot.com",\n  "messagingSenderId": "123456789",\n  "appId": "1:123...:web:abc..."\n}`}
                  className="w-full h-52 text-xs font-mono border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 ring-indigo-100 resize-none bg-slate-50 text-slate-700 placeholder-slate-300"/>
                {fbConfigErr&&(
                  <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <AlertCircle size={13} className="text-red-500 shrink-0 mt-0.5"/>
                    <p className="text-xs text-red-700 font-medium">{fbConfigErr}</p>
                  </div>
                )}
              </div>
              <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <ShieldCheck size={13} className="text-slate-400 shrink-0 mt-0.5"/>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Tu configuración se guarda localmente en este navegador. Nunca se envía a ningún servidor externo al de Firebase que vos mismo configuraste.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleConnectFirebase} disabled={!fbConfigText.trim()}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                  <Database size={15}/>Conectar a Firebase
                </button>
              </div>
            </div>
          </div>
        )}

      </main>


      {/* ══ MODAL: Editar celda ════════════════════════════════════════════════ */}
      {editingCell&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={e=>e.target===e.currentTarget&&setEditingCell(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800">Editar Módulo</h3>
              <button onClick={()=>setEditingCell(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16}/></button>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Materia</label>
              <SubjectDropdown value={editingCell.subjectId} onChange={v=>setEditingCell(p=>({...p,subjectId:v}))} subjects={subjects}/>
              <button onClick={()=>{setEditingCell(null);setActiveTab('subjects');}} className="text-[10px] text-indigo-500 font-bold mt-1.5 hover:underline">+ Gestionar materias</button>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Docente</label>
              <SearchableDropdown
                value={editingCell.teacherId}
                onChange={v=>setEditingCell(p=>({...p,teacherId:v}))}
                items={[...teachers].sort((a,b)=>a.name.localeCompare(b.name,'es'))}
                placeholder="— Seleccionar docente —"
                emptyLabel="— Sin docente —"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={()=>saveCell(editingCell.key,{teacherId:'',subjectId:''})}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                <Trash2 size={13}/>Borrar
              </button>
              <button onClick={()=>saveCell(editingCell.key,{teacherId:editingCell.teacherId,subjectId:editingCell.subjectId})}
                className="flex-[2] bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                <Check size={13}/>Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Docente ═════════════════════════════════════════════════════ */}
      {editingTeacher&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={e=>e.target===e.currentTarget&&setEditingTeacher(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800">{teachers.find(t=>t.id===editingTeacher.id)?'Editar':'Agregar'} Docente</h3>
              <button onClick={()=>setEditingTeacher(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16}/></button>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Nombre completo</label>
              <input type="text" value={editingTeacher.name} onChange={e=>setEditingTeacher(p=>({...p,name:e.target.value}))}
                placeholder="Apellido, Nombre" className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 ring-indigo-100"/>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Color</label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={editingTeacher.colorHex || '#6366f1'}
                  onChange={e=>setEditingTeacher(p=>({...p, colorHex: e.target.value, color: ''}))}
                  className="w-12 h-12 rounded-xl border-2 border-slate-200 cursor-pointer p-0.5 hover:border-slate-400 transition-colors"
                />
                <div className="w-12 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-black text-white shadow-sm"
                  style={{backgroundColor: editingTeacher.colorHex || '#6366f1', borderColor: editingTeacher.colorHex || '#6366f1'}}>
                  {editingTeacher.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{editingTeacher.name || 'Docente'}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{editingTeacher.colorHex || '#6366f1'}</p>
                </div>
              </div>
            </div>
            <button onClick={()=>{if(editingTeacher.name.trim())saveTeacher(editingTeacher);}} disabled={!editingTeacher.name.trim()}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              <Check size={13}/>Guardar Docente
            </button>
          </div>
        </div>
      )}

      {/* ══ MODAL: Materia ═════════════════════════════════════════════════════ */}
      {editingSubject&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={e=>e.target===e.currentTarget&&setEditingSubject(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800">{editingSubject.id==='new'?'Nueva Materia':'Renombrar Materia'}</h3>
              <button onClick={()=>setEditingSubject(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16}/></button>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Nombre</label>
              <input autoFocus type="text" value={editingSubject.name} onChange={e=>setEditingSubject(p=>({...p,name:e.target.value}))}
                placeholder="Ej: Matemática" className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 ring-indigo-100"/>
              {editingSubject.id!=='new'&&<p className="text-[10px] text-slate-400 mt-1.5">El cambio se aplica en todas las celdas del horario automáticamente.</p>}
            </div>
            <button
              onClick={()=>{ if(!editingSubject.name.trim())return; editingSubject.id==='new'?addSubject(editingSubject.name):renameSubject(editingSubject.id,editingSubject.name); }}
              disabled={!editingSubject.name.trim()}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              <Check size={13}/>{editingSubject.id==='new'?'Crear':'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* ══ MODAL: Unificar ═════════════════════════════════════════════════════ */}
      {mergeModal&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={e=>e.target===e.currentTarget&&setMergeModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800 text-base">Unificar {mergeModal.isTeachers?'docentes':'materias'}</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">{mergeModal.items.length} elementos seleccionados</p>
              </div>
              <button onClick={()=>setMergeModal(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16}/></button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-800 font-medium">Elegí el nombre que querés <strong>conservar</strong>. Los demás quedarán eliminados y todas sus asignaciones se reasignarán automáticamente.</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">¿Cuál nombre conservar?</p>
              <div className="space-y-1.5">
                {mergeModal.items.map(it=>(
                  <label key={it.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all
                      ${mergeKeepId===it.id?'border-indigo-500 bg-indigo-50':'border-slate-200 hover:border-slate-300 bg-white'}`}>
                    <input type="radio" name="mergeKeepId" value={it.id} checked={mergeKeepId===it.id} onChange={()=>setMergeKeepId(it.id)} className="accent-indigo-600 w-4 h-4 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-800 text-sm block truncate">{it.name}</span>
                      {it.subtitle&&<span className="text-[10px] text-slate-400 font-medium block truncate">{it.subtitle}</span>}
                    </div>
                    {mergeKeepId===it.id&&<Check size={14} className="text-indigo-600 shrink-0"/>}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={()=>setMergeModal(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={()=>{
                  const keep = mergeKeepId;
                  const remove = mergeModal.items.filter(it=>it.id!==keep);
                  remove.forEach(r=>mergeModal.isTeachers?mergeTeachers(keep,r.id):mergeSubjects(keep,r.id));
                  setMergeModal(null); setSelectedItems(new Set());
                }}
                className="flex-[2] bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                <Merge size={14}/>Confirmar unificación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
