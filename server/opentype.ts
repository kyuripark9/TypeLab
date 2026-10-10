/* opentype.js, as the server and the tests use it. */
import * as opentypeNs from 'opentype.js';

// opentype.js is CommonJS: under Node its API sits on the default export
export const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs;
