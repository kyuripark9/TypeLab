/* The designs the slides show saved in My designs: the gallery's looks (a card and a few settings) and four of the
   fonts the opening title card plays, as the API takes them ({ name, styleId, params }), in the order they are to show
   (My designs lists the newest first, so they are saved last to first). Writes JSON to the path given. */
import { readFileSync, writeFileSync } from 'node:fs';
import { card, design } from './letters.mts';
const looks: [string, string, string[]][] = [
  ['Extended', 'grotesque', ['width=1', 'weight=1']],
  ['Octagon', 'squircle', ['chamfer=1']],
  ['Couture Inline', 'didone', ['fill=inline']],
  ['Pixels', 'grotesque', ['fill=pixels', 'module=0.25', 'width=0.8']],
  ['Vogue', 'didone', ['width=0', 'weight=0.9']],
  ['Orbital Outline', 'squircle', ['fill=outline', 'width=1']],
  ['Groovy', 'softslab', ['weight=1', 'width=0.8']],
  ['Poster', 'woodtype', ['fill=halftone']]
];
const mine = async (file: string, name: string) => {
  const j = JSON.parse(readFileSync(`Asset/intro/${file}.typelab.json`, 'utf8'));
  return { name, styleId: j.styleId, params: await design(`Asset/intro/${file}.typelab.json`) };
};
const L = async (i: number) => { const [name, id, sets] = looks[i]; return { name, styleId: id, params: await card(id, sets) }; };
const order = [
  await mine('ink-trap-display', 'Ink Trap Display'), await L(0), await mine('hand-hex', 'Hand Hex'), await L(1),
  await L(2), await mine('nodes', 'Nodes'), await L(3), await L(4),
  await mine('my-chunky-rounded', 'My Chunky Rounded'), await L(5), await L(6), await L(7)
];
writeFileSync(process.argv[2], JSON.stringify(order.reverse()));
console.log(order.length, 'designs');
