import { useEffect, useRef, useState } from 'react';
import { api, type Locality } from '../api';

export function LocalitySearch({ onSelect }: { onSelect: (l: Locality) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Locality[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<Locality[]>(`/api/localities?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => { setResults(r); setActive(0); setOpen(true); })
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(l: Locality) {
    onSelect(l);
    setQuery(`${l.name} ${l.state} ${l.postcode}`);
    setOpen(false);
  }

  return (
    <div className="search" ref={boxRef}>
      <input
        type="search"
        placeholder="Postcode or town"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul className="search-results">
          {results.length === 0 && <li className="muted">No matches</li>}
          {results.map((l, i) => (
            <li key={l.id} className={i === active ? 'active' : ''} onMouseDown={() => choose(l)} onMouseEnter={() => setActive(i)}>
              <span>{l.name}{l.stationCount > 0 && <span className="muted small"> · {l.stationCount} ⛽</span>}</span>
              <span className="muted">{l.state} {l.postcode}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
