/* Every slider has an icon in client/components/SliderIcons.tsx, and every icon there belongs to a slider. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTROLS, SUBS, type ControlKey } from '../shared/content';
import { SLIDER_ICON_KEYS } from '../client/components/SliderIcons';

describe('slider icons', () => {
  it('draws every slider, and nothing that is not one', () => {
    const sliders = [
      ...(Object.keys(CONTROLS) as ControlKey[]).filter(k => !CONTROLS[k].type),
      ...Object.keys(SUBS).filter(k => k !== 'stencil' && k !== 'slice'),
      // Stencil and Slice head their controls; their Thickness sliders share the key, so draw apart
      'stencilGap', 'sliceGap'
    ];
    for (const k of sliders) assert.ok(SLIDER_ICON_KEYS.includes(k), `no icon for ${k}`);
    for (const k of SLIDER_ICON_KEYS) assert.ok(sliders.includes(k), `${k} is not a slider`);
  });
});
