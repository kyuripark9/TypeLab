import { drawnCmds } from "../../shared/engine/outline.ts";
import { toPolys, signedArea } from "../../shared/engine/geom.ts";
import { shape, combine } from "../../shared/engine/boolean.ts";
function topology(contours) {
  const ink = shape(toPolys(drawnCmds(contours)));
  const areas = combine([ink], ink.has).map(signedArea).filter((area) => Math.abs(area) > 0.1);
  return { pieces: areas.filter((area) => area > 0).length, counters: areas.filter((area) => area < 0).length, area: areas.reduce((sum, area) => sum + area, 0) };
}
export {
  topology
};
