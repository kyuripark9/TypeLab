/* Small field-only execution; source clipping and full-font review use the normal pattern path. */
import { signedArea, toPolys } from '../../shared/engine/geom';
import { organicPatternContours, type OrganicPatternKind } from '../../shared/source/organic-patterns';

const results = (['blobs', 'liquid'] as const).flatMap((kind: OrganicPatternKind) => {
  let previousArea = 0;
  return [.22, .61, 1].map(gain => {
    const count = { cells: 0, points: 0, work: 0 };
    const loops = organicPatternContours(kind, { bounds: { x0: -50, x1: 50, y0: -50, y1: 50 }, origin: { x: 0, y: 0 }, cell: 12, gain }, {
      addCells(n) { count.cells += n; if (count.cells > 16384) throw new Error('Cell budget exceeded'); },
      addPoints(n) { count.points += n; if (count.points > 131072) throw new Error('Point budget exceeded'); },
      visit(n) { count.work += n; if (count.work > 8000000) throw new Error('Work budget exceeded'); }
    });
    const area = loops.flatMap(cmds => toPolys(cmds)).reduce((sum, poly) => sum + signedArea(poly), 0);
    if (!Number.isFinite(area) || area <= previousArea) throw new Error(`${kind} Spread did not enlarge the material`);
    previousArea = area;
    return { kind, gain, loops: loops.length, area: Math.round(area), ...count };
  });
});
process.stdout.write(JSON.stringify(results, null, 2) + '\n');
