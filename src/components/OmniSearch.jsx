import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, FolderOpen, AlertCircle, Scale, ShieldAlert, CheckCircle, FileText, X, FileSearch } from 'lucide-react';
import { REAL_DISK_DATA } from '../realDiskData';
import { MOCK_CASOS } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';
import { cargarExpedientes } from '../utils/expedientes';
import { findDiscoFolder } from '../utils/folderMatcher';

export default function OmniSearch({ onSelectCaso }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Antes esto reconstruía los casos extrajudiciales desde una clave vieja de
  // localStorage ("lexcontrol_extrajudicial_mapping"), de antes de que
  // expedientes.json en el servidor fuera la fuente de verdad. Cualquier
  // expediente creado por los caminos actuales -Bitácora Omnicanal, el
  // chatbot, el modal de crear expediente- se guarda ahí y nunca tocaba esa
  // clave vieja, así que Ctrl+K nunca los encontraba. Se reemplaza por la
  // misma carga real que usa el resto de la app, en vez de mantener dos
  // fuentes de "casos extrajudiciales" que pueden desincronizarse.
  const [expedientesReales, setExpedientesReales] = useState([]);

  useEffect(() => {
    cargarExpedientes()
      .then(setExpedientesReales)
      .catch((e) => console.error('No se pudieron cargar los expedientes para Ctrl+K:', e));
  }, []);

  // Un mismo caso puede existir como expediente (rit espejo) Y como causa PJUD:
  // se prioriza el expediente -tiene las gestiones y el estado que el abogado
  // edita- y no se repite la causa si ya está cubierta por uno.
  //
  // Memoizado a propósito: `query` cambia en cada tecla que se escribe en el
  // buscador, y sin esto el combine+dedupe de ~4.000 casos se repetía en cada
  // letra -el mismo problema de fondo que hacía sentir lenta la Bitácora
  // Omnicanal-. Sólo depende de expedientesReales: MOCK_CASOS y PJUD_CASOS son
  // constantes del módulo, no cambian entre renders.
  const baseCasos = useMemo(() => {
    const vistos = new Set();
    const combinados = [];
    for (const caso of [...expedientesReales, ...MOCK_CASOS, ...PJUD_CASOS]) {
      const clave = String(caso.rit || caso.id || '').trim().toUpperCase();
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      combinados.push(caso);
    }
    return combinados;
  }, [expedientesReales]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();

    // Search across Rit, Caratula, Cliente, Contraparte
    const matched = baseCasos.filter(caso => {
      return (
        (caso.rit && caso.rit.toLowerCase().includes(q)) ||
        (caso.caratula && caso.caratula.toLowerCase().includes(q)) ||
        (caso.cliente && caso.cliente.toLowerCase().includes(q)) ||
        (caso.contraparte && caso.contraparte.toLowerCase().includes(q))
      );
    }).slice(0, 8); // Max 8 results

    setResults(matched);
    setSelectedIndex(0);
  }, [query, baseCasos]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const handleSelect = (caso) => {
    setIsOpen(false);
    setQuery('');
    onSelectCaso(caso);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingTop: '10vh'
    }} onClick={() => setIsOpen(false)}>
      <div 
        style={{
          background: 'var(--bg-modal)',
          width: '100%',
          maxWidth: '600px',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Search size={24} color="var(--text-muted)" style={{ marginRight: '16px' }} />
          <input 
            ref={inputRef}
            type="text"
            placeholder="Buscar por RIT, cliente, contraparte, carátula..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '1.2rem',
              width: '100%',
              fontFamily: 'var(--font-body)'
            }}
          />
          <button 
            onClick={() => setIsOpen(false)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={20} />
          </button>
        </div>

        {results.length > 0 && (
          <div style={{ padding: '8px' }}>
            {results.map((caso, idx) => {
              const isSelected = idx === selectedIndex;
              const hasFolder = findDiscoFolder(caso) !== null;
              
              return (
                <div 
                  key={caso.id || caso.rit}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelect(caso)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderLeft: isSelected ? '3px solid var(--accent-cyan)' : '3px solid transparent'
                  }}
                >
                  <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)' }}>
                    <Scale size={18} color="#3b82f6" />
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.95rem' }}>{caso.rit}</span>
                      {!hasFolder && (
                        <span title="Carpeta física no encontrada" style={{ color: 'var(--alert-red)' }}>
                          <FolderOpen size={14} />
                        </span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                        {caso.materia}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {caso.caratula}
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Intro para abrir
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {query.trim() !== '' && results.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileSearch size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <p style={{ margin: 0 }}>No se encontraron expedientes con "{query}"</p>
          </div>
        )}

        <div style={{ padding: '12px 24px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Usa las flechas para navegar</span>
          <span>Esc para cerrar</span>
        </div>
      </div>
    </div>
  );
}
