import React, { useState, useCallback, useRef } from 'react';

export function useResizableColumns<T extends string>(
  tableKey: string,
  defaultWidths: Record<T, number>,
  minWidth: number = 60
) {
  const storageKey = `mapt_col_widths_${tableKey}`;

  const [widths, setWidths] = useState<Record<T, number>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return { ...defaultWidths, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load column widths from localStorage', e);
    }
    return defaultWidths;
  });

  const resizingRef = useRef<{
    colKey: T;
    startX: number;
    startWidth: number;
  } | null>(null);

  const onMouseDown = useCallback(
    (colKey: T, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = widths[colKey] || defaultWidths[colKey] || 150;
      resizingRef.current = {
        colKey,
        startX: e.clientX,
        startWidth,
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = moveEvent.clientX - resizingRef.current.startX;
        const newWidth = Math.max(minWidth, resizingRef.current.startWidth + delta);
        setWidths((prev) => {
          const updated = { ...prev, [resizingRef.current!.colKey]: newWidth };
          return updated;
        });
      };

      const onMouseUp = () => {
        if (resizingRef.current) {
          setWidths((current) => {
            try {
              localStorage.setItem(storageKey, JSON.stringify(current));
            } catch (e) {
              console.warn('Failed to save column widths to localStorage', e);
            }
            return current;
          });
        }
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [widths, defaultWidths, minWidth, storageKey]
  );

  const resetWidths = useCallback(() => {
    setWidths(defaultWidths);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
  }, [defaultWidths, storageKey]);

  const getColStyle = useCallback(
    (colKey: T): React.CSSProperties => {
      const w = widths[colKey] || defaultWidths[colKey];
      return {
        width: w ? `${w}px` : undefined,
        minWidth: `${minWidth}px`,
      };
    },
    [widths, defaultWidths, minWidth]
  );

  const ResizeHandle: React.FC<{ colKey: T; className?: string }> = ({ colKey, className = '' }) => (
    <div
      onMouseDown={(e) => onMouseDown(colKey, e)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setWidths((prev) => {
          const updated = { ...prev, [colKey]: defaultWidths[colKey] };
          try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
          } catch (err) {}
          return updated;
        });
      }}
      className={`absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none flex items-center justify-center group/resize z-20 hover:bg-emerald-500/25 transition ${className}`}
      title="Glisser pour redimensionner (Double-clic pour réinitialiser)"
    >
      <div className="w-0.5 h-4 bg-slate-700/80 group-hover/resize:bg-emerald-400 group-active/resize:bg-emerald-300 transition rounded-full" />
    </div>
  );

  return {
    widths,
    getColStyle,
    onMouseDown,
    resetWidths,
    ResizeHandle,
  };
}
