import { useMemo } from 'react';
import { TEXTS } from '../../shared/content';
import { useEditor, type PreviewMode } from '../state/editor';

export interface Block { text: string; size: number; sub?: boolean }

export function blocksFor(mode: PreviewMode, custom: string, size: number): Block[] {
  if (mode === 'sentence') return [{ text: TEXTS.sentence, size }, { text: TEXTS.alphabet, size: Math.max(18, size * 0.42), sub: true }];
  if (mode === 'alphabet') return [{ text: TEXTS.alphabet + '\n' + TEXTS.punct, size }];
  if (mode === 'paragraph') return [{ text: TEXTS.paragraph, size }];
  return [{ text: custom || ' ', size }];
}

export function useBlocks() {
  const mode = useEditor(s => s.mode), custom = useEditor(s => s.custom), size = useEditor(s => s.sizes[s.mode]);
  return useMemo(() => blocksFor(mode, custom, size), [mode, custom, size]);
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
