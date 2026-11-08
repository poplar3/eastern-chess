import { useEffect, useRef, useState } from 'react';
import type { GameId, Variant } from '../core/types';
import { EXTRA_GAME_IDS, MAIN_GAME_IDS, VARIANTS } from '../core/variants';

interface Props {
  current: Variant;
  onChoose: (id: GameId) => void;
}

/** Выбор игры в шапке: кнопка с названием текущей игры и список всех игр по группам. */
export function GamePicker({ current, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (id: GameId) => {
    const v = VARIANTS[id];
    const on = id === current.id;
    return (
      <li key={id}>
        <button
          role="option"
          aria-selected={on}
          className={`gp-item${on ? ' on' : ''}`}
          onClick={() => {
            setOpen(false);
            onChoose(id);
          }}
        >
          <span className={`gp-mark brand-${id}`}>{v.mark}</span>
          <span className="gp-text">
            <span className="gp-name">{v.name}</span>
            <span className="gp-sub">{v.subtitle}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="game-picker" ref={root}>
      <button className={`gp-trigger${open ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Выбрать игру">
        <span className={`brand-mark brand-${current.id}`}>{current.mark}</span>
        <span className="gp-trigger-text">
          <span className="gp-trigger-name">{current.name}</span>
          <span className="gp-trigger-sub">{current.subtitle}</span>
        </span>
        <svg className="gp-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="gp-menu" role="listbox" aria-label="Игра">
          <div className="gp-group">Основные игры</div>
          <ul>{MAIN_GAME_IDS.map(item)}</ul>
          <div className="gp-group">Необычные вариации</div>
          <ul>{EXTRA_GAME_IDS.map(item)}</ul>
        </div>
      )}
    </div>
  );
}
