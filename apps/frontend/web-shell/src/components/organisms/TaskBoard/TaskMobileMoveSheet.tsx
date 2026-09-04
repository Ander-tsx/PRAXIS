'use client';

import { colors } from '@praxis/commons';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TaskMobileMoveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  columns: { id: string; name: string }[];
  currentColumnId: string;
  onMoveToColumn: (columnId: string) => void;
}

export function TaskMobileMoveSheet({
  isOpen,
  onClose,
  columns,
  currentColumnId,
  onMoveToColumn,
}: TaskMobileMoveSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] transition-opacity"
        style={{ background: 'rgba(0, 0, 0, 0.4)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[100] flex flex-col gap-2 rounded-t-2xl border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform ease-out"
        style={{
          background: colors.surfaceElevated,
          borderColor: colors.border,
          maxHeight: '80vh',
          animation: 'slideUp 0.25s ease-out forwards',
        }}
      >
        <span
          aria-hidden="true"
          className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full"
          style={{ background: colors.border }}
        />
        <h3 className="shrink-0 px-2 text-center font-sans text-sm font-semibold text-text-primary">
          Mover a...
        </h3>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {columns.map((col) => {
            const isCurrent = col.id === currentColumnId;
            return (
              <button
                key={col.id}
                type="button"
                disabled={isCurrent}
                onClick={() => {
                  onMoveToColumn(col.id);
                  onClose();
                }}
                className={[
                  'flex w-full items-center justify-between rounded-xl px-4 py-3 font-sans text-sm transition-colors text-left',
                  isCurrent
                    ? 'opacity-50 cursor-default text-text-primary'
                    : 'cursor-pointer hover:bg-surface active:bg-surface text-text-primary',
                ].join(' ')}
              >
                <span className="truncate">{col.name}</span>
                {isCurrent && <span className="shrink-0 text-xs text-white">(Actual)</span>}
              </button>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>,
    document.body,
  );
}
