/* The design parameters a user edits. Every number is 0..1; the engine maps them to geometry. What each one
   defaults to, how it is checked and where it sits in the editor is in spec.ts: a setting added here needs its
   entry there (the compiler asks for it). */
import type { Drawn } from '../engine/outline';
import type { FreeAt, GlyphParams } from './spec';
import type { AForm, BarEnds, Bends, BowlForm, BowlJoin, Build, Diagonals, Dots, Fill, Flourish, GForm, IForm, KForm, Mirror, QForm, RForm,
  ScriptForm, SerifBase, SerifInner, SerifShape, SerifSide, SerifTip, SForm, Story, Terminal, TerminalForm, TerminalRun, YForm } from './options';

export interface Params {
  /** strokes or blocks (see BUILDS) */ build: Build;
  weight: number; width: number; height: number; slant: number;
  /** each letter turned about its own middle: 0.5 upright, lower anticlockwise and higher clockwise, half a turn at either end (see rotationDeg) */ rotation: number;
  /** thick and thin (see contrastOf): 0.5 as drawn, higher thins the horizontals against the stems,
      lower turns it round, to the mirror of 1 at 0 */ contrast: number;
  /** the vertical strokes alone (stems), and the horizontal ones alone (bars): 0.5 as Weight and
      Contrast make them, lower lighter, higher heavier */ vWeight: number; hWeight: number;
  /** one letter's strokes weighted one by one, by stroke id (see isStrokeId): 0.5 as drawn, lower lighter, higher heavier */ strokeWeights: Record<string, number>;
  xHeight: number; counter: number; aperture: number; crossbar: number;
  /** how far the crossbars stop short of the strokes they meet (e A H E F), 0 touching them (see joinGap), or with
      barEnds 'through', how far the strokes they run through are cut back above and below them (see barCut) */ barGap: number; barEnds: BarEnds;
  roundness: number; curve: number; apex: number; terminal: Terminal;
  /** how far stroke ends reach: 0.5 is the usual length, lower trims them back, higher draws them on */ terminalLength: number;
  /** one letter's ends set one by one, by end id (see isEndId): each overrides terminalLength for that end */ terminalEnds: Record<string, number>;
  /** how stroke ends bend: 0.5 as drawn, lower straightens them and then flares them out, higher
      curls them on round the way they turn */ terminalCurl: number;
  /** one letter's ends bent one by one, by end id: each overrides terminalCurl for that end */ terminalCurls: Record<string, number>;
  /** one letter's corners rounded one by one, by corner id (see isCornerId), from 0 sharp to 1 round;
      for a turn, its outside */ corners: Record<string, number>;
  /** one letter's turns rounded on the inside one by one, by turn id (see isTurnId), from 0 sharp to 1 round */ innerCorners: Record<string, number>;
  /** whether curved stroke ends follow the curve or run straight out (see TERMINAL_RUNS) */ terminalRun: TerminalRun;
  /** the form of the picked kind of stroke end (see TERMINAL_FORMS); one of another kind means its first */ terminalForm: TerminalForm;
  /* The finer shape of each form of stroke end. Each applies only while its form is picked, and
     its default draws the end as before. */
  /** flared: how much the end widens as it finishes */ terminalFlare: number;
  /** rounded: soft corners (0) to a full half circle (1) */ terminalRound: number;
  /** scooped and notched: how deep the end is hollowed */ terminalDepth: number;
  /** droplet and ball: how big the drop is */ terminalSize: number;
  /** sharp: how far the point reaches past the end, 0.5 as usual */ terminalPoint: number;
  /** clipped: how much of the point is cut off */ terminalClip: number;
  /** sharp: where the point sits across the end, 0 on the inner edge, 0.5 in the middle, 1 on the outer */ terminalLean: number;
  /** angled: how steeply the end is cut, 0.5 as usual */ terminalSlope: number;
  /** cut: the cut turned off level or plumb, 0.5 not at all */ terminalTilt: number;
  /** tapered: how fine the tip gets, 0.5 as usual */ terminalTip: number;
  /** tapered: how far back from the tip the taper starts, 0.5 as usual */ terminalTaper: number;
  /** hand-drawn irregularity */ wobble: number;
  /** strokes thin toward a level line, to a point at 1 (see pinchPos) */ pinch: number;
  /** the height of that line: 0 the baseline, 0.5 half the x-height, 1 the cap height */ pinchPos: number;
  /** a square step cut out of each corner of a letter (the turns of its strokes, and corners where two
      strokes end together, as at the foot of an L), from none to nearly the stroke's width */ steps: number;
  /** one letter's corners stepped one by one, by corner id (see isCornerId), each overriding steps */ cornerSteps: Record<string, number>;
  /** how round the inside corners of counters are, where strokes meet or turn, from 0 as the strokes
      draw them to 1, most of a cap height across, whatever the weight: light strokes fill in solid
      where the round leaves a square corner outside */ innerRound: number;
  /** capitals start with a curl: the top of the first stroke (the foot of an A, the left end of a T's
      bar) runs on and curls out into a flourish */ swash: number;
  /** the letter as drawn, or mirrored (see MIRRORS) */ mirror: Mirror;
  /** entry/exit strokes, looped descenders and italic letterforms */ cursive: number;
  /** round curves drawn as squircles */ squareness: number;
  /** curves replaced by straight, cut-off corners (octagonal) */ chamfer: number;
  /** strokes thin out where they join another stroke */ joints: number;
  /** length of ascenders and descenders */ extenders: number;
  /** descenders alone: 0.5 as long as the stem length makes them, lower shorter, higher longer */ descender: number;
  /** double- or single-storey a */ story: Story;
  /** how far a bowl sinks into its stem (b d p q): 1 branches out of it, 0 is a whole o beside it */ overlap: number;
  /** how bowls meet their stems (see BOWL_JOINS) */ bowlJoin: BowlJoin;
  /** the shape of the g (see G_FORMS) */ gForm: GForm;
  /** where the arm and leg of k and K meet (see K_FORMS) */ kForm: KForm;
  /** square or round dots (see DOTS) */ dots: Dots;
  /** how big the dots are: 0.5 as usual */ dotSize: number;
  /** plain I i J l, or with bars (see I_FORMS) */ iForm: IForm;
  /** the spine of s (see S_FORMS) */ sForm: SForm;
  /** the foot of the a (see A_FORMS) */ aForm: AForm;
  /** how round the inside corners are where one stroke meets another (see joinR), from 0 sharp;
      a letter can round each of them on its own (see isCornerId) */ joinRound: number;
  /** oval or box bowls (see BOWL_FORMS) */ bowlForm: BowlForm;
  /** box bowls: how far their corners round on the outside, from 0 sharp through one stroke wide (0.5) to two */ boxRound: number;
  /** symmetric A V W, with one side upright, or arches (see DIAGONALS) */ diagonals: Diagonals;
  /** sharp or round turns in A M N V W Z (see BENDS); Peaks sets how wide a round one is */ bends: Bends;
  /** the shape of the Y (see Y_FORMS) */ yForm: YForm;
  /** the tail of the Q (see Q_FORMS) */ qForm: QForm;
  /** the leg of the R (see R_FORMS) */ rForm: RForm;
  /** print or joined-up script letters (see SCRIPT_FORMS) */ scriptForm: ScriptForm;
  /** script letters plain or flourished (see FLOURISHES) */ flourish: Flourish;
  /** how gradually the pointed pen of the script letters presses into a downstroke and lets up: 0 at once,
      higher swelling from a point and easing off before the turn (see swell in stroke.ts) */ swell: number;
  /** length of tails and hooks (Q y j g t f, the comma, cursive exits): 0.5 is the usual length */ tail: number;
  fill: Fill;
  /** size of the pixels, dots or lines, or the wireframe's line weight */ module: number;
  /** gaps where strokes meet, like a stencil */ stencil: number;
  /** how far out along a stroke from the join its stencil gap is cut, from 0 right at the join */ stencilPos: number;
  /** how round the corners a stencil gap cuts are, from 0 sharp */ stencilRound: number;
  /** one letter's joins and turns opened one by one, by join id (see isJoinId): how far the stroke ending
      there (or the side of the turn running less upright) is pulled back from the one it meets, 0 joined,
      each overriding Stencil at that join (see joinGap) */ joinGaps: Record<string, number>;
  /** a horizontal cut through every letter */ slice: number;
  /** the height of the slice: 0 the baseline, 0.5 half the x-height, 1 the cap height */ slicePos: number;
  /** how round the corners the slice cuts are, from 0 sharp */ sliceRound: number;
  serif: boolean; serifSize: number; serifThickness: number; serifShape: SerifShape; serifAngle: number;
  /** bracketed serifs: how far the curve into the stem runs, 0.5 as usual */ serifBracket: number;
  /** how serifs finish at their tips (see SERIF_TIPS) */ serifTip: SerifTip;
  /** round tips: soft corners (0) to a full half circle (1) */ serifTipRound: number;
  /** angled tips: which way the cut leans and how far, 0.5 not at all: higher runs the foot of the tip further out, lower its top */ serifTipSlant: number;
  /** flat or cupped undersides (see SERIF_BASES) */ serifBase: SerifBase;
  /** cupped serifs: how high the base arches */ serifCup: number;
  /** which sides of a stem its serifs reach to (see SERIF_SIDES) */ serifSides: SerifSide;
  /** the shape of the serifs that reach into the letter (see SERIF_INNERS), and their length and thickness
      against the ones that reach out: 0.5 the same */ serifInner: SerifInner; serifInnerSize: number; serifInnerThickness: number;
  /** the serifs on stems, longer to the left (lower) or to the right (higher): 0.5 the same both ways */ serifBalance: number;
  /** the size of the serifs on top of stems, and of those on the ends of arms (E, F, T): 0.5 as drawn */ serifTops: number; serifArms: number;
  /** the serifs on the ends of arms: how heavy they are against the rest, 0.5 as drawn, and which way they lean,
      0.5 upright, higher splayed out away from the letter, lower in under the arm */ serifArmThickness: number; serifArmLean: number;
  letterSpacing: number; wordSpacing: number; sideBearing: number;
  /** blend toward one fixed advance width for every glyph */ mono: number;
  geoHuman: number; softSharp: number; classicFuture: number; playfulFormal: number;
  /** letters customized on their own: each overrides some of the settings above, by character */ glyphs: Record<string, GlyphParams>;
  /** letters drawn by hand with the pen, by character: drawn as they are, the settings above no longer shape them */ outlines: Record<string, Drawn>;
  /** the free font the letters are written in (a font id, see free-fonts.ts), '' for letters built from the settings:
      drawn as the font has them, and moved by the settings as far as they're moved from those it was picked at (freeAt) */ freeFont: string;
  /** the settings (of FREE_AT_KEYS) the free font's own letters stand for, as its style had them when it was picked:
      moved away from these, the font's letters move with them (bolder, wider, higher, slanted, filled, their ends, serifs,
      corners and joins drawn as the engine draws them) */ freeAt: FreeAt;
}
