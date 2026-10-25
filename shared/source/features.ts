/* Separated dots identified in the pinned source curves. Serenade j has overlapping vertical extents and
   keeps the whole-outline height map. New source revisions need their own reviewed contour identities. */
export interface SourceDot {
  readonly contours: readonly number[];
  readonly bodyTop: number;
  readonly bottom: number;
}

type Dots = Readonly<Partial<Record<'i' | 'j', SourceDot>>>;
const DOTS: Readonly<Record<string, Dots>> = {
  // Almanac:500
  '1e88ba172d6cf23b7fa0b83d1780ae45685e043daedad44549191a55bd941800': {
    i: { contours: [0], bodyTop: 540, bottom: 678 },
    j: { contours: [0], bodyTop: 540, bottom: 678 },
  },
  // Ballyhoo:400
  'a932fd59c3cc30c5bb2764dd961ef7f91772a219e8ced1e4abcc00d17fea1d42': {
    i: { contours: [0], bodyTop: 476, bottom: 534 },
    j: { contours: [0], bodyTop: 476, bottom: 534 },
  },
  // Boardwalk:400
  'e86e9bb8de0f75e1118894bad5f96f857ad1d4f305e6942dbd8b994cfe90f1f6': {
    i: { contours: [1], bodyTop: 515, bottom: 555 },
    j: { contours: [2], bodyTop: 487, bottom: 555 },
  },
  // Bulwark:100
  '56d8b12a2ce323c83d622772ddaccc169205918426a148aec960dab5ed02bf79': {
    i: { contours: [1], bodyTop: 508, bottom: 596 },
    j: { contours: [1], bodyTop: 508, bottom: 596 },
  },
  // Bulwark:200
  '660456b6e29e9cdd40dff9f969de2c42e5a02886ddaefdecf54ec7b429c51f9c': {
    i: { contours: [1], bodyTop: 508, bottom: 588 },
    j: { contours: [1], bodyTop: 508, bottom: 588 },
  },
  // Bulwark:300
  'c84fbe6264f678907b3df2f026542e413a2d4caed1a40b1d222b0ce71a6906e8': {
    i: { contours: [1], bodyTop: 508, bottom: 579 },
    j: { contours: [1], bodyTop: 508, bottom: 579 },
  },
  // Bulwark:400
  '568251e3b4101b788419972767decabf4b64ce6d6bedfc55a063af6216b181ad': {
    i: { contours: [1], bodyTop: 508, bottom: 570 },
    j: { contours: [1], bodyTop: 508, bottom: 570 },
  },
  // Bulwark:500
  '129cf30a675ec430ee8c7cb4c2fb1b8aebe04f26cf25d961725dffcb32a60f68': {
    i: { contours: [1], bodyTop: 508, bottom: 574 },
    j: { contours: [1], bodyTop: 508, bottom: 574 },
  },
  // Bulwark:600
  'c140b665a7162bd4c70b1fa6e2b0c1ef3857253a26419add7f03a6ac4413977e': {
    i: { contours: [1], bodyTop: 508, bottom: 583 },
    j: { contours: [1], bodyTop: 508, bottom: 583 },
  },
  // Bulwark:700
  '340d6c1566c754ff5ea0d90fdac2f77ab988393c6c62d6b4f421aabd64ea1ed3': {
    i: { contours: [1], bodyTop: 508, bottom: 583 },
    j: { contours: [1], bodyTop: 508, bottom: 583 },
  },
  // Bulwark:800
  '780895ffdcb0720684abffcce3038865e2a789bb467c0d64b39756da690d5bf4': {
    i: { contours: [1], bodyTop: 508, bottom: 583 },
    j: { contours: [1], bodyTop: 508, bottom: 583 },
  },
  // Bulwark:900
  '04a0394c577b3e48528e356648c049b42b55f1db76752f8617ec93772ce23889': {
    i: { contours: [1], bodyTop: 508, bottom: 583 },
    j: { contours: [1], bodyTop: 508, bottom: 583 },
  },
  // Cathedral:400
  'feba4842866ac4dcd356e137b6891d7ad4685baa1be419ead699e158b11f0eee': {
    i: { contours: [0], bodyTop: 524, bottom: 561 },
    j: { contours: [0], bodyTop: 538, bottom: 575 },
  },
  // Compass:300
  '552a68b0a230d7344c6e538c0367d4a4182fef80ef3085034f676d50f3c93baf': {
    i: { contours: [1], bodyTop: 550, bottom: 617 },
    j: { contours: [0], bodyTop: 553, bottom: 616 },
  },
  // Cotton:300
  '5de06410779deca73e7248a42dd2f629e2fa9853b2532dbe6fd18b597d37fb47': {
    i: { contours: [1], bodyTop: 489, bottom: 610 },
    j: { contours: [0], bodyTop: 492, bottom: 610 },
  },
  // Couture:600
  'a743231893ba1e3c471e1bfa2bfed2bb7768b4863000854413e7b96712281d58': {
    i: { contours: [0], bodyTop: 528, bottom: 629 },
    j: { contours: [0], bodyTop: 528, bottom: 629 },
  },
  // Dispatch:400
  '2a837e87780f1c6f17a10f23cfc6173c5807da5685b66f50a475539c1d9274f1': {
    i: { contours: [0], bodyTop: 441, bottom: 538 },
    j: { contours: [0], bodyTop: 440, bottom: 539 },
  },
  // Funnies:400
  'dea1b0739e641d4da7c878181885b402f6cec2de792102601cdc4ea5ab74c1d1': {
    i: { contours: [1], bodyTop: 583, bottom: 641 },
    j: { contours: [1], bodyTop: 587, bottom: 645 },
  },
  // Gumdrop:700
  'd2558f23006bf2fa5dcca491e00dc1050bf2d57358c4ab81d04a96e491611b2b': {
    i: { contours: [1], bodyTop: 478, bottom: 546 },
    j: { contours: [1], bodyTop: 481, bottom: 549 },
  },
  // Hearth:600
  '1bb3719536d0b63d06f5fc081dc22149c6c6a867fb80d30cde6900e6aa4f4cc4': {
    i: { contours: [0], bodyTop: 529, bottom: 645 },
    j: { contours: [0], bodyTop: 529, bottom: 645 },
  },
  // Jotter:400
  '9140ce5613eb89165b23f8cf655a3e6c738ea6374248c78bc3d88fd65a4e5082': {
    i: { contours: [1], bodyTop: 298, bottom: 422 },
    j: { contours: [1], bodyTop: 348, bottom: 473 },
  },
  // Kernel:500
  '148815302716f99a57ce4ee13edc167fa5fee3baa81387b705a22f200a375cb2': {
    i: { contours: [0], bodyTop: 516, bottom: 610 },
    j: { contours: [0], bodyTop: 516, bottom: 610 },
  },
  // Mainline:600
  'e25df3eccf1f1e498264f6232907f9c46e00b4c1d2afc33cd41f18ffa9bf9250': {
    i: { contours: [1], bodyTop: 528, bottom: 584 },
    j: { contours: [0], bodyTop: 528, bottom: 584 },
  },
  // Orbital:600
  'a6fbb24a6752a93e1ecbda250e05f6974eb812733b348bf0a694ec980e32f15a': {
    i: { contours: [1], bodyTop: 599, bottom: 630 },
    j: { contours: [1], bodyTop: 599, bottom: 630 },
  },
  // Parlance:500
  'e859f4ecf83097411e5b2ac2a59fa4457898afd8992f1b66c06bf019dd8b5f9c': {
    i: { contours: [1], bodyTop: 581, bottom: 675 },
    j: { contours: [0], bodyTop: 581, bottom: 675 },
  },
  // Serenade:400
  '9acdea1f08cd809a7d3020098175581adc725d54efcd45077ff2330931e8f147': {
    i: { contours: [0], bodyTop: 378, bottom: 407 },
  },
  // Sonnet:400i
  '7a841c89c6d8e76a396ded16f0d961b24fbda45acb45d984dc0eb9e48ab2c9f2': {
    i: { contours: [0], bodyTop: 523, bottom: 634 },
    j: { contours: [0], bodyTop: 522, bottom: 642 },
  },
  // Timber:400
  '87c8d705282e3e8e616a0e542ed6a52cca18d570e7a380a52224f12959134fb2': {
    i: { contours: [0], bodyTop: 556, bottom: 615 },
    j: { contours: [0], bodyTop: 556, bottom: 615 },
  },
  // Turnpike:500
  '7bbb4db5a4f8f5cb8412806ce4f18d7a2259dfb1c0f4eff3381884e90c36fbf9': {
    i: { contours: [1], bodyTop: 418, bottom: 548 },
    j: { contours: [0], bodyTop: 418, bottom: 548 },
  },
  // Vellum:400
  '4792c42fdcd5497e632d3360ccbfe6a706fad0caabb6272b7211a9a4724bee5f': {
    i: { contours: [0], bodyTop: 494, bottom: 584 },
    j: { contours: [0], bodyTop: 491, bottom: 584 },
  },
};

export function sourceDot(digest: string, ch: string): SourceDot | null {
  return ch === 'i' || ch === 'j' ? DOTS[digest]?.[ch] ?? null : null;
}
