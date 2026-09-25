import { useMemo } from 'react';
import { TEXTS } from '../../shared/content';
import { useEditor } from '../state/editor';

export interface Block { text: string; size: number; sub?: boolean }

/** What to set: the typed text, or the default sentence while the field is empty. */
export const sampleText = (custom: string) => custom.trim() ? custom : TEXTS.sentence;

export function useBlocks() {
  const custom = useEditor(s => s.custom), size = useEditor(s => s.size);
  return useMemo((): Block[] => [{ text: sampleText(custom), size }], [custom, size]);
}

/** Characters on screen right now: these get rebuilt first while a slider moves. */
export function useVisibleChars() {
  const blocks = useBlocks(), inspect = useEditor(s => s.inspect);
  return useMemo(() => {
    const set = new Set(blocks.map(b => b.text).join(''));
    if (inspect) set.add(inspect);
    return set;
  }, [blocks, inspect]);
}
