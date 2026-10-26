/* Literal execution of saved spacing frames; the full font matrix belongs to the deferred test pass. */
import assert from 'node:assert/strict';
import { cleanDrawn, type Drawn } from '../../shared/engine/outline';
import { spaceSourceDrawing, unspaceSourceDrawing } from '../../shared/source/spacing';

const source: Drawn = { adv: 400, contours: [[
  { x: 20, y: 0, ox: 40, oy: 15 }, { x: 350, y: 0, ix: 300, iy: 10 }, { x: 180, y: 500 }
]] };
assert.strictEqual(spaceSourceDrawing(source, { cell: 600, amount: 0 }), source);
assert.strictEqual(spaceSourceDrawing(source, { cell: 400, amount: 1 }), source);
const half = spaceSourceDrawing(source, { cell: 600, amount: .5 });
assert.equal(half.adv, 500); assert.equal(half.contours[0][0].x, 70);
const full = spaceSourceDrawing(source, { cell: 600, amount: 1 });
assert.equal(full.adv, 600); assert.equal(full.contours[0][0].x, 120);
const reopened = cleanDrawn(JSON.parse(JSON.stringify(full)));
assert.ok(reopened); assert.deepEqual(unspaceSourceDrawing(reopened), source);
assert.strictEqual(spaceSourceDrawing(reopened, { cell: 600, amount: 1 }), reopened);
const edited = { ...reopened, contours: reopened.contours.map(contour => contour.map((node, i) => i ? node : { ...node, x: node.x + 12 })) };
const restored = unspaceSourceDrawing(edited);
assert.equal(restored.adv, 400); assert.equal(restored.contours[0][0].x, 32);
assert.equal(restored.contours[0][0].ox, 40); assert.equal(restored.contours[0][0].y, 0);
assert.deepEqual(spaceSourceDrawing(edited, null), restored);
assert.equal(spaceSourceDrawing({ ...edited, adv: 650 }, { cell: 600, amount: 1 }).adv, 600);
assert.equal(unspaceSourceDrawing({ ...edited, adv: 650 }).adv, 450);
process.stdout.write('Source spacing literal: neutral identity, translation, full-Mono edit, serialized reopen, and proportional restoration pass.\n');
