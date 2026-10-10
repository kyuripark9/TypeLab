/* Glyph skeletons: every character the engine draws itself, registered with def() in the glyph table (GLYPHS in
   font.ts) as this folder is imported (engine/index.ts does). The letter files register in this order:
   upper.ts, lower.ts, figures.ts, punctuation.ts (punctuation and symbols). What they share is in shared.ts,
   and the fitting of strokes that turn at a point in turns.ts. Script letters are script.ts's, swashes
   swash.ts's, block letters blocks.ts's.

   Every glyph is a function of the shared metrics `m` (cap height, x-height, stem,
   curve tension, aperture, crossbar height, apex…). It draws centerline strokes with the
   builder `g` and returns its body width. Because all glyphs read the same metrics, one
   slider reshapes the whole alphabet coherently.

   def(ch, sb, fn, meta?)
     sb    [left, right] side-bearing factors: 1 beside a straight stem, ~.55 round, ~.25 diagonal. A form
           with other sides (an arched V's stems) sets g.sb.
     fn    draws the glyph and returns its body width. Whatever reaches past the body (tails, hooks, cursive
           entry and exit strokes) notes how far in g.reachL / g.reachR, through tailEnd, exitMark and entry,
           and gets room for it.
     meta  params: the controls the inspector shows for the letter, in order, the first five of them (four
           with serifs on, which take a slot); without it the inspector picks them from the strokes.
   Other forms of a letter are glyphs of their own that buildFont (font.ts) picks by name: 'a.alt' the
   single-storey a, 'f.cur' and 'y.cur' the cursive f and y.

   The order a glyph draws its strokes in numbers them, and a letter's own values are saved under those
   numbers (a stroke's weight under '0', its turns' corners under '0t1', its ends under '0s' and '0e', and so
   on; see shared/params/scales.ts): a new stroke goes after the existing ones, or saved designs' values land
   on other strokes.

   Path commands (see Cmd and TurnR in types.ts): ['M',x,y] ['L',x,y,{w,turn}] ['C',x1,y1,x2,y2,x,y,{w}] ['hv'|'vh',x,y,{u0,u1,w}] ['Z']
   ('hv' a quarter turn leaving level and arriving plumb, 'vh' the other way; u0..u1 the share of it drawn;
   w 'thin' | 'thick' | a weight; turn the radii {o, i} the turn into this command is rounded by)
   Stroke ends (s = start, e = end): 'flat' | 'term' (styled terminal) | 'h'/'v' (axis cut) | 'join' */
import './upper';
import './lower';
import './figures';
import './punctuation';
