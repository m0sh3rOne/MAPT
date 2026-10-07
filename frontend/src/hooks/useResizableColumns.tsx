import React, { useState, useCallback, useRef, useEffect } from 'react';

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

  const widthsRef = useRef<Record<T, number>>(widths);
  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  const onMouseDown = useCallback(
    (colKey: T, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = widthsRef.current[colKey] || defaultWidths[colKey] || 150;
      let currentWidth = startWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        currentWidth = Math.max(minWidth, startWidth + delta);
        setWidths((prev) => ({
          ...prev,
          [colKey]: currentWidth,
        }));
      };

      const onMouseUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Save to localStorage
        try {
          const updated = {
            ...widthsRef.current,
            [colKey]: currentWidth,
          };
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (err) {
          console.warn('Failed to save column widths to localStorage', err);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [defaultWidths, minWidth, storageKey]
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
      className={`absolute right-0 top-0 bottom-0 w-3 cursor-col-resize select-none flex items-center justify-center group/resize z-20 hover:bg-emerald-500/25 active:bg-emerald-500/40 transition ${className}`}
      title="Glisser pour redimensionner (Double-clic pour réinitialiser)"
    >
      <div className="w-0.5 h-4 bg-slate-700/80 group-hover/resize:bg-emerald-400 group-active/resize:bg-emerald-300 transition rounded-full pointer-events-none" />
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
