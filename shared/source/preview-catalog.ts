/* Immutable browser fonts generated from a style's original source instance. */
import { parseSourceRef, type SourceRef } from './model';

export interface PreviewFontInfo {
  styleId: string;
  source: SourceRef;
  paramsDigest: string;
  digest: string;
  ascent: number;
  descent: number;
  endCorrections: Readonly<Record<string, number>>;
}
export const PREVIEW_FONTS: readonly PreviewFontInfo[] = [
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "431ecba6fae0cb6f0f2a88c07523a5eb635f1451dcf71fe8808acdac8fb23104",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "7f987d2effd9eb6fa374d35ff3cd643758159f573d16ad6d1594327b6f2474cb",
    "digest": "f5d1d543fd29968038225e492932310ab88a3d02b79a4ebb1c416dc5dbe5f01b",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "e6b26930fac23fe4df08e6a3788727da8c71a6ac239b2382a4bc4742e86a94fd",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "7eb980277be834ea1a9b2f75ff9d9a472a7157c6d71a79eea3744030a2e61dcd",
    "digest": "2cbc5c08aa9cc6e04da9535948f6f051d09712d9c24e9a7ab18c23a281d37c31",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "cab93a39d277ca42f1211235f517f67c7757821b7bbfffab4b87fd07e8f29707",
      "fontId": "Compass:300"
    },
    "paramsDigest": "488b3eb2d5e664894a01fd6dc86d777aa49b9abac0b40e333e447d22f93cab82",
    "digest": "d9f41357ce665c7c1d94ef8b3613f3f48d05aa8035271ca3bfa3981daf83f56d",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "cff7aa89a5462513f0c0d9b075d2c42c01d6698720e848b7f6e21aefcb18ded4",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "6fafa02dea1e286a28077f309a80901f95f156f5561c9aa0d6966d4d6b40fd9a",
    "digest": "243528c304f0de524aabbc3cdbed8f165ab9dc077b94e3f950eaffb6005379c7",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "1dc3644fc945fb776b069136cea117fb7e41c67a554cf2f631b41ac63cd9777c",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "5229db7127d9a58375ae8dd13e2f68f175e388d7547316e5a3163903856854c6",
    "digest": "37f615a9b8aa4651e32f3b683f6b95393a17efc3c542db9f2d33665be1f00919",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "0825d0899eab174be6570ef932ce49538f81fdc23c020f4c68fb03d1e643b371",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "261ab073da526df3382ab53d44b837f4c0389e16d24f8a4bec2ba2ab3f257d4a",
    "digest": "b28e6f8e16d570891f179dde91ac6689eead5cfa5b0aecd6cb6d3ee32ee07ed8",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "d9136e22b6cd16ed84fbcfcd91030611864999daa36a29ee1757da4b56ebca3f",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "a8b53614aaaa6018652b222a656aca1a8123c21067e6e9e7182ab1e4cff22e41",
    "digest": "bc623867a9502122220a46f7436a913dc1ee6c073a02d015a47311648bdfaad9",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "37ffc3e5caa5dae7ae3e5b0d3bf724a74d2145ff6e7b5b6d03f1960a3b7c01c7",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "0b9b456a59b72188e37615a59bd2626bafef3fe28ab4cb4e0165f12cdbc93c98",
    "digest": "e3bf1e8fe8dc1c2d48387b9157306375eb479444c35bb0f38b78f7658dd9a257",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "860560fe133d0f140e511f77a81927e8427f2151bf151f09add1861e51b50109",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "c8c6c96b228f03748159da180c3683994bc794ece943d626d8751faf11ee7d1e",
    "digest": "cf484817c04b36e25bca65b62134c83eebcc332407c8a69dcd7b78da54d91e95",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "581f228f18bf390b5c034ff88b282e7f1d42186158dbc1831fa522f993b0eaaf",
      "fontId": "Couture:600"
    },
    "paramsDigest": "8b55c4eefa4495a7ef2a5af752f6114df2ae15fafc6c4138f8cbcc738f44d60c",
    "digest": "89f8d1612b88bdddea5b9d6fc8a1989ace63d4cc3fb52eba9dcbcb3d19bef9f9",
    "ascent": 717,
    "descent": 286.8,
    "endCorrections": {
      " ": 2.842170943040401e-14,
      " ": 2.842170943040401e-14
    }
  },
  {
    "styleId": "serifitalic",
    "source": {
      "kind": "program-v1",
      "digest": "130fc852c481b9e05b9d733394add882497c725c30f8f9aa23a593ff65e5c1c9",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "097f5bd000cc068bff2e8777c850a3f12a56a7317bf3a61b4410e1387b918af9",
    "digest": "5afc78d1660ef7104a71fe055361965b23e846f89e5b60321eb415a1a42e55e1",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "50e5a8120fc687739baf79f0c007439efa2844ebc2a3797622ad66bc8872cfb5",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "87e5e9ddd9c940d0452c51e91eddcb63558f2d33f8920c61bb3214e95213368c",
    "digest": "a5ebf6c0e9b2957b85395dfedc28f78eb3a3bb35784f3272fc97fd5d953e4a63",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "4c263aaef65cf87c9c69af6c8d625fcae1a6a3865d1a73f257e98b344beef6a7",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "43e831d6decee523e35cb0923a231cc4d18f4bcc5af783c928269969eefe2d87",
    "digest": "112bb97e8e327780db961794ef5c9c80bd3be8018c4e9c16951317db3592d420",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "20141d4ff93250d2e2ccf67875f6a65d1e736a87e7c4579d4c839e10dfd501b8",
      "fontId": "Timber:400"
    },
    "paramsDigest": "0765f9b9c3ec726326dc631a61436c544dc1e6c75fc8d3f843e039681681b2dd",
    "digest": "b8f2dc5c703417ff7add8a35aad41760becc500689115182b3c0c89145145e4d",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "62c98265197078d18147eb5987cce607d74b71957a468cbf2f759daff6abd849",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "298c63a39ba255b0a4145b14fb23d399c8d5608dc6dae60cdfc2c490f2bc85e8",
    "digest": "c0c4773bcaf4dd2e933ba76ae29b795861d3913488c7b38769a30807794368e7",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "c7796db251f4feeef645b20a526bb3bfb3b020fcfd7357121a1e28233b169f6d",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "9c0c5504a4ff417ee2ae79afa1ae65be521f6369061c75bbca4c70dc646837f7",
    "digest": "7479d6638a62c2158d1e5cd7707932cd5271f6a0d6b4b44c46c228250639d183",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "dc8d8f35e79b6b541c95a4209ae59b926e17ecbabda1a7faeef3b70315667705",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "e4e599d66a2ae2362529f558a7f477f4a4456e21867df6235fc81325c8adde26",
    "digest": "c45201f16e9ab0574996378d5cbb4f35ca51c3717677f74e02c3feceff9cf2a9",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "a2afeb056419c2e1e0dc7b55df6b5a2159e2f50f134a828fd1c3c02cc8762bc2",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "63c7b8a9c2664517a60123e977aeddb32ca13c44094c5eff77fd4c033e087241",
    "digest": "9fc0f36b21d5e074066399fbec220a2e732a388d98b07ccce05854cbed3d9904",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "66c83371ce33dab19fa108a8c6d4361ddcb32ce3c2cf1803db30d7f35473eef0",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "39b83f1989948c6e56c44c0fcefdaa99f792e8336dbb9fe8f320177773c82b8b",
    "digest": "72f6abde6d2970838a8544e76f97e005badc69d038ac2ca6da6130219d864010",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "50787065870ce08ba5798eddfb12951390e453094f8ed154e6aaca8949dcbc94",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "74e66d61c2a28708575382f092c616cd1107857c6fa8f3a8881ac0b321eebb1e",
    "digest": "b14ace9026c438b2b1827f202d48485f9b7118a3a1a105986566b8cc9912debd",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "41da2ab83ab261ad47ebeccc38e0dc6f895eb02ac3d2bbfcbd2b0bf9ddbe5bd2",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "afd25a14fd0d3326b139091e77666ef67411f551bc8a243a9794f7fa2503dc63",
    "digest": "9ebf7005c00ea5f5a5c6d9a466130901d8c6fa7a7d8309a3174da28b1c4ef0f0",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "ae7abf2c0c02a01eccd02920e810dd9817151ec694134319079a60c0b13984b5",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "447e4539eed3cc7d289c6cc91638e9e88d7a05ee708bf39d284b32e985013e5c",
    "digest": "0f2a61147f04f4c87e69be78e9194daba64a442c8642a7131b553b5a925fc686",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "7ba3d66f3af48ba7613f443b870926c2958d16b68b9a1e50f73f7ff58765ef0e",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "1c2cb70a8f6b202d469915a5cc7d70ffbeb1a1187a6c9e5f204ae46e2e514ecc",
    "digest": "ddf46a8a2f3b3183bf648d298c3bfea97d8a9fde973da7b93d8952d5c473baac",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "49f906283b281bc6170316baee68f503caaf9c5d587a20693d79e681093b4a3a",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "77eaa7cd87f793513d3169cf525d15277035e18781f09ba87eb70085adf2aaf5",
    "digest": "0636e3e00154a0deb40067d01148f29762f70ba893172047cc240a43d823e848",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "03beeb43bef0efc9c20807ed802e31235dc2964b417ee0a8b3ab6c7db93ca4a9",
      "fontId": "Compass:300"
    },
    "paramsDigest": "4ae6d5a630658575aecd92afd4a124eaf549225ca0414fecda54e7486b570d91",
    "digest": "f03a7b511953a8de0bb9c01bfc3efba500fc3c135643b66a585020bb1d3a60ac",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "947d90159552b1b1ffa1977e5447614dc1bcc0786feaa7c2ab23acc5055980bb",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "e86fc278b0fac87d0d9a52853bfe094a4137e7133f004c35c35b54031b9e7537",
    "digest": "a0bc2bdfc001ed0696ef076bed11c39be730aacd56104bc9fc629cf8f187fbc9",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "f91f41fe859db65f9a4fa6baa8d80368b7ff08be4948b0c655619fda516f580f",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "9016658dfa9d79d4a322f39e5fee6600b13f58aa02a4b3d41d35066f5371e2a5",
    "digest": "71ad129662d19ef4b64cdb7f6c712f1948988d62b04f5d65b2f4dc1514320dcc",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "12304bfc026e662622938acf28cfb5dd5f50c63cfc281cea64656169a4b476e4",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "da9e79440d92fc793ad042ae6d5414c93cb8e8194c74b74d608a25cde95b8e66",
    "digest": "80868e8540110663dfbdf196b22018f322dca75a5ee03dc5723fc306e15beab8",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "b5030f4d7d7571a6fa078b59f410a477ce163d244f4abfc0e2239b30ce4590d7",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "a3afe2c0a516307b904014e310caec42cfa34337ee6fe47a8335a39331e7dc01",
    "digest": "675fdb0264a537f1275f00a54514347e9357d217b73678e69afccbb1d9220b1d",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "67bfa00c1eca8d8b331304010044f6f5e55e86dbbeeb1224e4a859596fe4ab3f",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "486d403e2886519391cdaa2b44aed5762661db4f8ad2d991c48c327af04f2532",
    "digest": "5a5170fd29ec5ef97c972840ad00edaa9f2e825bb5b70726f50ef9f05cec8cdc",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "146e034faa7a8ed0836056dac563d0b3a2248c10c79fba5dbbe37a9c9a01ff01",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "9d0ead2c2cf8b05f9cbbea3945e1b5ba2c8b36de9313aeece91d24ebbbb6fb9a",
    "digest": "7f265521bb8b0ab2dd0033923a590383aef05e67ba52ba315584a6addfea1dd9",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "e506f02e566856eae1fed9116b3603e5f6b112799df4f1a9d667f5b84dcd8750",
      "fontId": "Couture:600"
    },
    "paramsDigest": "fed9b258957649f54f371d27b181b4d9e0cfa9d48d43015151a19ba6520d79d5",
    "digest": "024332a94124f4a3612e861cbb0949739dd28286d272d32643c06aeffef71893",
    "ascent": 717,
    "descent": 286.8,
    "endCorrections": {
      " ": 2.842170943040401e-14,
      " ": 2.842170943040401e-14
    }
  },
  {
    "styleId": "serifitalic",
    "source": {
      "kind": "program-v1",
      "digest": "cab08eb9a284ffb0632a637572b857c2640eece24393310dfcfe44e4708ad291",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "38839cf2eab2bbcfaa5c46e7f09034eab6e8e3db5566951767c4ee7322aa3fa5",
    "digest": "c544c58b36c2d3e6e4809c6339c3e1558558389a8a10a42e8fdd8068f9d58e7a",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "0a8c00da0dee46dd6b7c42635883493f3c9a2f4abe143f200946237fd5ec389e",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "723eb0e3b8b24a87886b23f96ffe9c734e364673b414c1fc911b41ca6c5d8d9e",
    "digest": "b628ee062ccb4822f727a22b7c9de219c4fad8ec3f1756533d8e35ac111e2229",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "c47d28932f400436b2db0ae8f1402af68330936894c323b422663975532d1ef0",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "ffba084a17ca7ceb00451991a96b47f0b5e418a1b84da65ec37768434a23dee7",
    "digest": "5631dbe639929f0adebfb15acea3371ef9d79a5f14b2fb3b694c15524f952d68",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "ab3f11ad692085dadc3ff36d25170c3cf0991709f95611ef550e0881625ae310",
      "fontId": "Timber:400"
    },
    "paramsDigest": "c8a9f36b7ebbed683218b299b9341359189da496f48e5d440e9bc4fa7bf0cafe",
    "digest": "df87420a379851c06c9484ac47133d5708ee4ce292072e6b37e49c3711cddb12",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "83accd381be645246e5ea202658125d98e3e844d8741d64206bad19407b7ccda",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "6e8879825b4634ccae5bedceec83eb0d72738c59e3fc5aa489753234179c5692",
    "digest": "757ffacb3320948a6e841b8eb6823a31004197db9002e189571a6a8268556202",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "d35fcbcc1ca8d7a329f5a7cd58c83730fbc711be2448d59e21415da4a51823aa",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "54eb0f1572f8c6cb2183c45f10b8a25bb1c3b58b2ec9cbd81f5de458136f0b55",
    "digest": "1c71ce0391721a10cd2cc1b9e8504f46037a4326735d4750616ee1c73af5474c",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "cea582d70a896e65d0b1032d3f5233a6d351abf18467e7e0d63fc0596aa8ffac",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "1e503dcf99e736a68f5fc73a433cce077123ffbc2389f3ca37334a0d09526312",
    "digest": "ec2410f1aaa2ccf6d127a414be75963872d6a466da149890335f67b887d1724f",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "2aa0e6399197122997de4b1c59873bad82d327562f369c6f286381cc4faae36b",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "df1a064763f23515eadaaddeeaba53f7a8fc1b78dab7c265a6bc1d96a9608adb",
    "digest": "0760406b74b62c96791c382f78c5361721b6da6bc574e09cf21409a65ab7203c",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "e094931e5899525025b5ebd187c882989a17f4f26856df2b93fabf6585704b0c",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "8a1b727302b07743d290a8b9a1212eafb95aae626e3ed6edf8cab65b8c956506",
    "digest": "8dfafa76e762c4a1f9550a26bbe8cf9618f7c22f8a9079759d7d12114a1db445",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "8ba48218933d8200c995138411be8f361bdf7f86e2cc25ab30bfab76ebbb6bc0",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "f93dac40a7e78e8007946d1c49b9453c319759c5a2f84cf62f078b1a15d396d8",
    "digest": "50c0e0ed28fc2b33a24eeb3543f42efb8860559cd34b52cb31397c29d15c557b",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "7c96f746dc38a570847c18eb212a08e8e26e796dbc6bdd706faa6e26d7527de2",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "20301121588bdf72bbaa345cb3a3e042f8ee41a4219381d54d9a5a166ca393f5",
    "digest": "c531fe184e7d6f8014499d26ef309e45499c1a1876cfdce4473c89b8157e3f62",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "eb1d631bd396fe57f2e6646c835dbe61c383d4db3f65a89c099feb805d4b41be",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "529cd75738580755254233342c51d15dc098d5659153d81e54654e4989837452",
    "digest": "88a5117ba1041ada517b9bbfad06aa812ca5895bc3ff0bac83d1da90b8bea9f3",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "414b84734493243819a58a46b0c7f9b26047bc9acddc7fa8c29e7191b14fc0a7",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "56a9cc9b5e9e37e4bd15904433d2240b52288de0dcbfef73d6523cec6d86284b",
    "digest": "7fad51b088e7fdc250096be41779a287310a0cbbb077adbb73d51d33946e2b94",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "47b095346f636f11e3b7b27f9a72b414018dccbdfbb57ac2c636496ee48730cf",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "0f01d0fc65642f9686fe93eb2a36265f7167194596ceabe429d6f5143c0df778",
    "digest": "b15938dca23dbbdca0fd7e1cffc4e35c37a21f2fa1987212f3c2174949dd48f7",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "873be55af86b53972f75d8cacf6bcfe22b393f5525d4ea7584bdb4c091152c81",
      "fontId": "Compass:300"
    },
    "paramsDigest": "d3f7dcf5eda47d5c73ca4b466ba09e002461c604bb5c5a494e4d5f8aaaccc5d0",
    "digest": "144a931e00b0d32ccc1ec4670e0a93f40388920ed9ccf980bc6ea635a5624aa1",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "3b6ca9f5744ead23f385c13e73dea9d1846cf52340a9a23e96d64bbd4860d749",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "df519d022a6f2df05458ac0df1b4fbd2c1c0dbff9fddfbea4009756b5257858b",
    "digest": "f402b12300968a44d3c418a098e033f1e5a30d4438eb339c894f1056724fffae",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "5b0065a29d69ddee12f2e189d0f0175038c7e2a7d344b71930d09fa457e264ff",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "adb677b394965dd2495433ef99fa3e13365530093f605224d7080db1ec64d65a",
    "digest": "444aeefa05fbdb40f4744f4ea36574a89bd542d50c6784cc77819311149b6f1e",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "fcf6851bfb843f65e48b2abfec4da079302c3483d053e06ef9bead8a21cdf6e6",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "41625ba89305722e0c6c408e9b81d93e6761ea6b25814a71e3e0268a4f40e574",
    "digest": "d5561b5b793faa82162d6ecddfaf49f7f5dd2106d34860dff3cb93fe358494e2",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "7ea018ae5e779e8542edf284f9e82e15d0be02705f85ed418eeda7b01bd62a3a",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "b22fe1379da856e83a5c19b51e62c9ffed9eec4e40f642c1f2bdfaf49be8bfb4",
    "digest": "236671c44d123f68d3e1705003ffff29c9c4f20166ef2ec69a6ea61ad0f84e73",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "1bebe2a596bec18e181f5a9c67e237e30794141d681e1e3b4ba105380a92626d",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "3ac74b54119acaeee12950ef994645af9c636ba9d03ed6f698fd6eb15dcc7c1f",
    "digest": "14fce2bd158be70e87baf66d620ba7136946c9619e7d5046574cc3b2b01185b7",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "0f456c7881101b4ec9d5892b0952224d0c9ca69afa8f29d663a16b71f2f7a942",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "4b62a70f4133b02fafb12a016dd6df49f8c541f2f50995638aa23f9bba20a9b8",
    "digest": "0447686b4f1443042c143e65bcb0ba81a14e20d663cf3fa4bf1aa7264dfa5b10",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "840852843b65a9f0e08008476e7a1475719020a4f5b45f380082b30c482a4629",
      "fontId": "Couture:600"
    },
    "paramsDigest": "d79bd360d338c6adbff0fe1c2b5b54fd56cab43b37f76db0f3f7f917ac394537",
    "digest": "68df0c00ae5fbe3707ea6e4a3d0e78d99e2ff19355d8b7a1dc94eb7374360f09",
    "ascent": 717,
    "descent": 286.8,
    "endCorrections": {
      " ": 2.842170943040401e-14,
      " ": 2.842170943040401e-14
    }
  },
  {
    "styleId": "serifitalic",
    "source": {
      "kind": "program-v1",
      "digest": "bee677f42bf2c03af77babe529de37e209ec1d185aadbb703abbef1441667125",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "f2157edf16bb49d8634f85a948f9fc5011284368108e044f7979b5757bcb1cc5",
    "digest": "122ae316ca38cc36ca8158e7a6a1caf7301766f8a02b6a0986e1dd4a2141b1cb",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "17464608717b11d7fbfe28af41619e701d3393ede0e110c004821b1a61c11531",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "9917316805ac8889c7e68c3d4b5763ac02299766505083d12dc80a113392a744",
    "digest": "0bb44df7412aba45a9d9d9252735a7c849381f82295f61b1acd0ba03c736d3b3",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "05beb86c52e665d396b4495f4f312637a7cf693c8e38f326e0111ab55209cb20",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "3c86c6a18a2efa2eacc8eacefb869b1e6f4b49346fb15ebb63b3813b07b7b538",
    "digest": "601c090d1b3b05052915ddecc436975c47ff313c4e0ba226bbccedd9745ac0e5",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "ee3f6a3bd81ce9f270840438ec0245e9b723660011ef5ea9d7d55e69e312099d",
      "fontId": "Timber:400"
    },
    "paramsDigest": "49812f7daff60a315a0d4ee569f1772ba1d35a253c544e96cdd84c2e59d83ad5",
    "digest": "41558b609184aa53e99d88bcb2a2828131927834c525ff634832bea26f1797c3",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "87e34b7142b856a7f300fcd0f49ead2a1f37cc86537768c0bfad3714bbe9d22f",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "3a916aa893075374b4d9318cc2a37510f8ffcd2ff21cf19846e9094b2f78a56a",
    "digest": "52ca8df2395cb7865fdb9090995e51ed13bef70c5dd3f0d6b32c52abb8312b12",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "a3e0f5ff80a8f91a8ef5a2e422d8630bf4afd970a27ef6f41c01b5ee37bd17ca",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "e8bb080468cfa911fbae2acab43c99cc1ec769c93d1ae5af8d442ba9c8c83b42",
    "digest": "e3fe38a4876153a33c7ebb2bf771e2f6138457d1d41ec550cbec59d2ce861345",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "9f86e32d202d76cf93e0a01242c2e502b5c02b8b6c9a6c54c3a6f35a9b537234",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "59934887242246059eb50bddb3dbd61a5e3eb1f64b77805dbccbf4bda420218f",
    "digest": "9a94c7d27e6a040ef4eeb514c962fb46c32f31919ffcb17b147a728f4c8cf06f",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "cc9787e770bd7bd9d0966e9712121cc788976a254a0aa0c88cfa95c4ceff820b",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "6fbcf8964e22ac292f9b94f19764b6041157562639a3a1d25d70818689214b68",
    "digest": "2076d8332ac18bf461a1fa12dcb737734ca5fffcc673b080780ea90c5656c4ad",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "53db0de51e2d9c25ee89de2d80b6911035d6b9a2d8c2fd99c1512077ba07ba0b",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "974ccd60db4cf608b5cf609b697036aeacd4d77d54ce9bc11bd1366098d43cc1",
    "digest": "b71480381c15c88cbbc778dbd0920ec938a78ae132c0fcc8901349725961125c",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "92aac3217925996f52d2db08af3f0b369ae4e5802a357383b12f8961c3742ff2",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "4f48aa86f736be93a5e5a21455c96df43c891b9048355f9ef26f3c230d21705f",
    "digest": "e3ff45bbee40c427ee3019fb30af81431012d054e7a10ff836cf2aafba76103b",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "e6e7e7b59c78911dc10acec93e4c3c403deb36eba105e3f9d619d4b4586b2628",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "5fe7710c7e942b681e15ea8deb5b76abefbb56285c577ce5afd72e1bbe9ce64d",
    "digest": "fb7adb443faaeb90593dcb181e7e9f1aa8df4ef9a9d92c9a4f23f763fcf23c7a",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "37aa414f0f61a88b790964bf00e8a2aed780a6c8f6fbaa7cb6f471dbb21aeccc",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "04e1770dd437d8af414c7f579e09c7836ce9b966bf765ed0d840c4e0941478a9",
    "digest": "25e78011b3a5b3b9cebb30c34d407cb6f8b6db7ab68f72fd698fc475b936aa2d",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "f94722ebc5207fb3d65b5d6f3050d114fe7e98cae3c0da1be0cb05eca76b70f5",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "e12d691897104ebe2790925e60138629d0aac597edbdc6c423b90149eec88026",
    "digest": "ab7c765b0f551af18d148e58c97e6b17211b1d0901d8f63420efc67d34e1bc7c",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "e82bb3361347956dc660db6cfdd6daea4477015b5f580d65b7775e4a28ced30e",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "fb03a01898bba1cc25eec0abb6d9b945db7b09caddc9d9b5e1ca41049d604f54",
    "digest": "d86e59edd838dd7f1044bbe1b7fbe9d5324339e3fb81d0fe9bd9d59a4ccd7068",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "f1aad574e634c13c683178069c0e2c16d8e12d2fda4f3d4e2df2d8b559592409",
      "fontId": "Compass:300"
    },
    "paramsDigest": "3d542291dc6e8f78499cb4b2c3ec3057c314999b5aae611541def66072b1f449",
    "digest": "307e0da34b0cc0a4790d72b989cd3aa9054e44305493d21cc523f67a0f8f92d5",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "1fb4a2094343833dc20895e2ef55aae97ebb2ac84193165e51e2ba17ae05cb2b",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "fedb2e8f15447bc1788c9fc541510a8759b4fd67b97bc2414161e1ff4324a0b5",
    "digest": "4fdfba5be2e2e949048c8378bd01d6fa1788764a88f8579862fb67b81655d8d2",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "2639d31bcf8b8e9ced7dbef91cebad2e6f728201383eea9b3605a4e057fc8f93",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "66595661e55960983a23ee3190ec24037fd01be5311070cbbbfb3c1498e34ca3",
    "digest": "89e50c8344931c2b81e8bfafed6f5d08e0ab11391d3cda0596e9fb09495ce7c1",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "5eee9e768c9b333ecb00de2a8aa066703c3132a24ab6688389f1a2bb509e8515",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "bfbfb08c28b753e4e0fc04e39bc75700db490cee03545d7adba5b78942e5f97c",
    "digest": "f65c4e03c29638e91b2e5278e16453d3c97583963b13b8a62f356df5086f7e5d",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "341468894dd4cc4a8f4ec8bcc5fd72ff7fab518eff9d3a3ae08f7a9d985aa165",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "635dd6d25e4d89026268619d818baeeacf87ce47b32bfd593308d547a33f4da1",
    "digest": "ddeffa821ac1bf655396cb03efe3ae249e9e5f5fd88e4a6c6f2af9248d561fb2",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "1fb2b61b6a6c2c6c860329a49fde3ed72f454651fbe4aba8b192422bd1edcd92",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "ec72ddff580647deac3130fbb2359ad4bdb2b818e7ca08409bb327e41ff426d4",
    "digest": "50a889fd0d18dd463cb6c0ac43350b15d49d3f7892fba10e759012e1e9091d63",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "846716eff7f4798bb17b68de6c5a61265da24e3915bfc26892f4b4ee3e8db2e6",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "d4494e8421c4be75d85eca8a5d1d028ec7e22ab4e1555a4513852bd13679fb7d",
    "digest": "75b3d9a9769ff7402cacde96d23bc10726c61dc64572f2a3a90283a1a2cd01de",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "88051a295e05043a86d61f545d93ffb5447ba10f04a1822c1a1cd63767975975",
      "fontId": "Couture:600"
    },
    "paramsDigest": "8a7e639d4ad3d3cf56e8c0c4879f20889f4341ea81d89f2498f7eb53bab5abb0",
    "digest": "a7835058da1b3fd47c55aa47323b47e461218a573717338d85d3d54d828af801",
    "ascent": 717,
    "descent": 286.8,
    "endCorrections": {
      " ": 2.842170943040401e-14,
      " ": 2.842170943040401e-14
    }
  },
  {
    "styleId": "serifitalic",
    "source": {
      "kind": "program-v1",
      "digest": "a89b80d1e545cba3a05536f158aed3438f580fdba3e89640cd22f73b2bf61e1a",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "a9148388a15b1a2f8b5a128f09ae35716328045e2369fe811ee375d986ff66bd",
    "digest": "cc68c2cc83eaffa6f53a7dede6475463b366a827173eabdc6ea08f2f159f015f",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "153c49f06fd9f9bbd83c857c37190f973ad29e6ec5fb42a9d67b7e0b8dfec082",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "d3b47c78af316769c849d6e6d01430bbcbf4d8ed178d161ec6428a5765863228",
    "digest": "dc0955366a9d89b500944105e242e6d4006d4a41e96625b5c94e47405688014d",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "e61721aa9cccb12b9ad48a369b25d67aeb2323c2cb6c1061b9bc0f0b667816e7",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "f6a44d0468b36267b99b2e850dd3f87a7f605f87651cd362e8b866ebfb525916",
    "digest": "8b126e9fdba9b696400cb5c634a44d3b614a6c9012d9764487a92f774a1a6487",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "e06070aa535563bc627cd4cfc82dd79f35d974cbe39946d3db05f740cc0bdf29",
      "fontId": "Timber:400"
    },
    "paramsDigest": "3a8dc759abde131103dd19d54df77e8ad5101fd5d5cbebad325a9a85ca55ef4b",
    "digest": "2bb77c24b729816e75d9259b48cfdae51af222d55baf78e98dd92c7b447b682e",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "6e0fe8aff9df061dd2c409a3c966a9a89c93112ebf745d84c38585ea4a729ba4",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "aa97cfb77279df6bf71c95119997dc642ffb8c72952d9b48a420be0fe8ab035d",
    "digest": "a0510ab97b2e4b631c9d50d32e58e55902072027ab27d43bbd571595e0236bd2",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "1940059d0b5bae3c017e0d0c94b346c33de6c315cdd442ad2ce37980a2b5d68a",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "f9f88c4bb7f522d46bd3a0506c8b0d76965b0a818774cabb4b5a11a65993be79",
    "digest": "b929d958f163a751215c34817a2624c97a3b93351655eb22668f18a5fe90450e",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "a885263bae72c0c97eddd40514978b852ffefbc9efd2d29a2df8d86727f8be04",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "914ddca824df2f6f03773298f8c91ecd1b148db6719ab0c70fb5965e89da9a6b",
    "digest": "34e1ee742126b96646b9e98a80aa2f164e2a0d511f7d554ff5b6733bdbe7d369",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "0ea3b13f7fdc315f177ef0c9792aff2bf2ab6eb21da1adcd32ac36f36d123a82",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "a8e52ff102ecd848aab1d561d6af298653a3c62691be3e4b57865afeacb906d8",
    "digest": "a86c6fa1e6746ec787e159a34f918a31abace3911d05d5b111db0672643725ee",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "f3d1c1cc256cb857d07f4185dbc49e0216dc5e5a7bb2b41ba45a5264b22a8077",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "6798d768702f7d65e982e60626b0d2c0a30f1d4349eef5c247ded6d770e0e2dc",
    "digest": "a4a1daf5a4bfbb8f19697a56853273ca1fb1eb16a87f931dcd10a78c00bf801b",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "ba96b7e8acb383c1c823fb7a0830e98ecdee2ad4c54782930c08fcbe7841f25e",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "08761c10a96da7d1c0d207e043ee854ec897d665def19fc11b4642b3bff73d7f",
    "digest": "5b8aeb25e804efa73756808285d39d1858d858282db3ad7f5724099fed2a070b",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "b58574c1fcb11d6db348de1aaa4af734d551124b9c2451abd4666cccf223032d",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "c2e99cfc0c1b2ac65a9ead6232a7869378144cbf3d3ae91d9e2448e9431bd24c",
    "digest": "11445c24c1d0c2c4f4abcb1bb9ddf0da783cafea0b63d4a466d726826580902c",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "8cd9d1d877ded9371691cecf66e95e0a2531df76e36e32b47156cd4de77dffc7",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "c620501430053119af23b22fb674ae7dee252e979d64f03d11cd5c21b084bb06",
    "digest": "331903097afb3da605602c802f69a8612d50cb4ab4ed8b2f8af4014fb0d00a82",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "fd82712041e11fbaa6f2738577c9fccb50f976e62cdcb6e0321c0857cfd66759",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "fc9d46302522ca2dd817250cd2ba2d38b979314f20a63bf11b9a88a89239f6de",
    "digest": "738eea92a25e3c54bf076f49fa3ced680de6005d7a9aeb202fa16ba16719b9cb",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "689dd8389eeb3663ea62f959cf06ba7e073a067bdcf17638151489772802c91e",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "d876ece7eb719b698acd3f330cc9a03f8e21b5114f4135d333abfc9edadea221",
    "digest": "446a1a74b01f7cee71af7e8759b774bdf703fc7d299a95eb98090ab306f7775e",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "4e44920b628812d66a81f34012de9fdab779c37928dd032327b84098e43aa087",
      "fontId": "Compass:300"
    },
    "paramsDigest": "4399820970568df7ad386abfc42361728ccac5ef6f80d849947c8738b2fcb4a9",
    "digest": "cf6066f094e6067c54fb33bff7446b842970d12708c33d6ff07de7ff9385928c",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "d7a2a30aa6f5be03bf2b0fd728fd78e278bd3024b519c089af3fcdfde1d0d65d",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "4ea1065aa6536b4a425002337b67bd0bf4674dc20bae0c238208318a3dc1f726",
    "digest": "894e26c2dce8758ca61c49dc5a9f44dcd2a483ab6eb209cf8819fcfd7cb4ff68",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "2639d31bcf8b8e9ced7dbef91cebad2e6f728201383eea9b3605a4e057fc8f93",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "189ed422f3ce0ad86ee07d4c37f6666277aa4d25922e54afa25b9878e398a5e3",
    "digest": "ee7d82e87233342b34ecbded4247fed87eac63f5c1fc5d47440002ae132bc136",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "5eee9e768c9b333ecb00de2a8aa066703c3132a24ab6688389f1a2bb509e8515",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "53914196915bcd2f0a7418cb459f912f64a5a65d9f5388cedf1fa14eee446ede",
    "digest": "c91f88adcedfb7396cc811be1b18ce0be6cc641f8bfabf3ed6ae7bec7d066770",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "341468894dd4cc4a8f4ec8bcc5fd72ff7fab518eff9d3a3ae08f7a9d985aa165",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "87d289c4fbb9b17c5cdfc507b3da53ed5e14581e0b39767cf462340a2c750915",
    "digest": "e6a2abe92ab2b53cc791368092cb82946023c255ec3ba0a1f9dfde9073789d4c",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "1fb2b61b6a6c2c6c860329a49fde3ed72f454651fbe4aba8b192422bd1edcd92",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "856b507cdc46608f3b2b23f28d23e70746fdd86d707122db47993a2e10a9f40b",
    "digest": "d5440e88c013581cdd10c942251fdc25b166d73f1b6d362f048633aec823315c",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "23344808f9ba98193bdcbb338fd18a69338688bc7eaaca5cc4ce9cb034946656",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "9512d8db4b4e3533e37a15d6a35d09a5ca5e9a622462d8f43f270ddbe99e0058",
    "digest": "b7ec3147c2736926d0c1aa7e039cbc04326bec5f76b9e272c2a9f4acb880c32b",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "88051a295e05043a86d61f545d93ffb5447ba10f04a1822c1a1cd63767975975",
      "fontId": "Couture:600"
    },
    "paramsDigest": "9803090711045a07e072d7eea5d4a24a10903ba45816eeb0667042a139eaa6c3",
    "digest": "94b4095a801c77b3c72c411cd24020429e2f65cd0bf66f9e6dc6ee4b879d9c14",
    "ascent": 717,
    "descent": 286.8,
    "endCorrections": {
      " ": 2.842170943040401e-14,
      " ": 2.842170943040401e-14
    }
  },
  {
    "styleId": "serifitalic",
    "source": {
      "kind": "program-v1",
      "digest": "a89b80d1e545cba3a05536f158aed3438f580fdba3e89640cd22f73b2bf61e1a",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "31e3d0e8f93b6046182225f2f4f9fac9bbee4cc57181308ad887f612f7dc1cf0",
    "digest": "348c10b736a96560c8885253f91266dc8571af8b25fe77059d7dc58e8702f7d1",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "153c49f06fd9f9bbd83c857c37190f973ad29e6ec5fb42a9d67b7e0b8dfec082",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "e1644385d75d0bb101688318ac6c0640c35a1c6834252e5e81446408260cef4b",
    "digest": "4f9508630f4c23ed6d6551a0e0dc99547b6582373fc59753a7495b673be246ab",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "71e553913a9a5d838378e048c79623f9d3c77142228fe7c6cf401b82d8c8c9d8",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "cd060d8daed94dc24ec203ba7c2977ba9f85c103fbd42345d9dfd33e49582457",
    "digest": "68cd17f084c2c413e3aa33c5ac5536ee675cc1e61a4202aed1a6c76c597db87e",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "e06070aa535563bc627cd4cfc82dd79f35d974cbe39946d3db05f740cc0bdf29",
      "fontId": "Timber:400"
    },
    "paramsDigest": "a2792858b33b7c443a8d4864fb54a3c12cf2a865f274dbb1952b8467196b79c7",
    "digest": "8831202418065e1c6757b20d28cb46828d92dc21657dacb54e200e0fc765f716",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "e317e421b5987ac5c43d401657b67bbdeb256f8e0daefac66c307c26a47d355f",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "f845b8aff083a5cddbc87b222686ce6e00b6da1b958f0b9d0cc971d2e4674ea4",
    "digest": "4bd8b4117d8d035cef6e3c30c2cb2f8f936895186e0e2289d9ecc7ec3a0b507e",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "1940059d0b5bae3c017e0d0c94b346c33de6c315cdd442ad2ce37980a2b5d68a",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "33c6ac570d016dd12939c6442ab4e3e75476a8af3a6e963ea1157cc3c03923fe",
    "digest": "b5fcee0c4957db42c6c9e8f3a5639abc5308b81d4b0ac7ff00292f8fbec1abd1",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "a885263bae72c0c97eddd40514978b852ffefbc9efd2d29a2df8d86727f8be04",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "819e8be62c404e9103de75b404cc577b4c8d2968035e020efd7a3f9d588d9e38",
    "digest": "400455818398af4428157f8d7577ed62c5ac2df71b971bc5fab5b11198a8dba7",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "0ea3b13f7fdc315f177ef0c9792aff2bf2ab6eb21da1adcd32ac36f36d123a82",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "57cba4ae2a629b7af39c126db6c8f7d7dcffbcb68f9c74b378ff980bc2f2d533",
    "digest": "e2f017244a0c4ecf4f868925bd6b7dd52a246e1bcc1bfd253c4d8909272e33ba",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "f3d1c1cc256cb857d07f4185dbc49e0216dc5e5a7bb2b41ba45a5264b22a8077",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "3a8c4ff97870e0f27ac8ce3a3c8951137359aeb07db0f06cd90f6fe426c2e462",
    "digest": "f904b39e809853740ad56da888107cfc356f5865ab343df301b2b33778295a55",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "ba96b7e8acb383c1c823fb7a0830e98ecdee2ad4c54782930c08fcbe7841f25e",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "4d2446ce9b0c4a526280780d903a137294a0a8ce49338c023e8e408ded3fd60f",
    "digest": "eb8084d7baa340ec330f348f1e50b7a75ccf021ecaafcc4da474e95cf0882f1f",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "b58574c1fcb11d6db348de1aaa4af734d551124b9c2451abd4666cccf223032d",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "93185ec4e20411bf38292aa0bc59add3f0e854e6e3aa00dbe60d578b49e515cc",
    "digest": "22a87653a468d0d01ccd6c5fc316ecfd78ea41562b834cb2a6945d66307b6372",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "8cd9d1d877ded9371691cecf66e95e0a2531df76e36e32b47156cd4de77dffc7",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "44633464e921a1f113e23a0597ff006c917453ed946c4d866ee953603af5a068",
    "digest": "e8d6fe26099051982b3af250e887064aa9ef6716d075cfb6a3e04965ece0b83f",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "62e7a899cfc93655e22acf0cc081a553d27969fcb73e658f884c4c149d4d484e",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "9fae78a5f3684161a1dad4e5e9284963e9bb0f40a1a282a035cc2db17ea65193",
    "digest": "7f0179266bb59ad83c7bc85d3d65a126b5ac3b44fc4f5a0eb3b0539cef18d320",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "d652789934b74d8821e80586e84d157b626b37bd432e8206a41176a4ba42948b",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "4639aa8b2ba5dd97183a910e36abfa32fbe3070d83d1dcf63267ba2be86a1571",
    "digest": "07186acb4537e130437f7ab003c5ebe1d4502d8d5c88275cd2e7e32ddb64cefa",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "8c5d87e20ad657368ff057f489000229357fb9cc7940c86ca5ecd9ac9de55b4d",
      "fontId": "Compass:300"
    },
    "paramsDigest": "ceee75b6dd9452d27a640424d2db558bdbc53d4a9f40ac6d5b0efce1558ab5b9",
    "digest": "29e746c57a7c4811cad50b678f5feaac6e2f020ccc58caa40df052f70701f85f",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "caf0997dcb78ee18904bd40c6f9a815f9bb3ff4978d1cf7a3636b945a328af4a",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "479bf4697cf9c35844e678a98f0bf8ca633e4452db5c33170f83b72d5381fd27",
    "digest": "2a4244125b879c289e376890f445ee8d4f4f817a16b593fda78c64b607c44d26",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "3efee0f2cb776dc3c6b3b8f9390a255ec65a7430aaa4a768e8914830e7554c1e",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "7b47a93d9753d60bea6f4bba529c3bd962137263927f6a1e56adf4eb0f10eab1",
    "digest": "d617d4e3076344f0f6c80c9ee3580c32f51fa15b26a1faac23f498f0d296cd4c",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "5552061474d18553138e2fece751166473b1943a3d9b2a400f1aa38687b9b086",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "58e42c3ab220b073109e98c3625af4e3a1f4b6ded665383836e63becad401e0a",
    "digest": "aae196abcc4b1ed26828d3f0f438f9fd7497328433887d3d2b8f3d46185e960f",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "acea394ba3aa17eae7a4e0bbeec9c1646d1c8908cd5134002b0f544f84c9859f",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "47347725706b331522bd7ec0765c379497db9675555f3df95c9bd0877299f41e",
    "digest": "c1112ebf9fc644491e30e0529d4d6d4bea3309a26511098d32cb47df96642753",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "457850e34ccba29bf75226ad8ca806eb2765983d55bd6900a12b7a11232c244b",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "1bdde31ea4c7d460e8def3e97c7da0eae3c494ef5930a9d187056b5fb7accc6d",
    "digest": "02ce81217811772572293f4644a0be09a2a2c5ccb892f35e9c97e6f16834044a",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "7a517f45f471a1e8cef1b6ba4046b0034eecc1bff7a3bf8b21d6961776f60d3d",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "164c9044a65bb882f388daffcf4d0b3c2386407da028374d3b803f7b81fb8e58",
    "digest": "a6e52b9988850f24b5d4468005f61c7434da6c8afe57f94a98431605683a401d",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "445e30fd34ef7b9398429c444e3a3b19b7ce0c5c3c61b630df8887b47f85f908",
      "fontId": "Couture:600"
    },
    "paramsDigest": "bd1caecaea12f6111046e94b4efe621aea27ade30da47ede3a0a2fc5b6985dec",
    "digest": "90c0454e2733c80ea8293e78e3dfc50a6157b425056e51a2e83f6dd6699b139b",
    "ascent": 717,
    "descent": 286.8,
    "endCorrections": {
      " ": 2.842170943040401e-14,
      " ": 2.842170943040401e-14
    }
  },
  {
    "styleId": "serifitalic",
    "source": {
      "kind": "program-v1",
      "digest": "53ced9f787fa0e2ec1b7832f9bde3b044efe71d59ff74ba202e1eca3361f3064",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "3ca59379cf13353a2f94f9badef1464331bdb25fdc29abc4d2dc65cc25933ffc",
    "digest": "dba38ce033fa6233c44fe948e5a43cedba021f0db838ac45cf503dd6a1665166",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "cfe406497fa8c8f5efe43fc0eecbbb2b6cbcef9363eb27f756a75662bddfd4bd",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "44a3f0421f4626ef506ac4c8ebd6aabe5250545f7421a6c5e3d04ea86cb26c61",
    "digest": "9cc25e52efbf6839d1f001fdf3433378f56492debf218f0768fd4237503202df",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "58db3d3dfb83f794d584b091c0001e90b07b9415de1191597de8c6ce418093d4",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "8c1b0047e70cee328169b3f026206a3ba6b95c5010f4fe0940aa1725f3490dbc",
    "digest": "02bdc81c14929e4e6ddd5fab5224454a634b447cdceb1e5ed35c8d6a0ab37835",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "df45ad36c9d797755a42e683309eab3006f83f925752db71fbf68cd705582c77",
      "fontId": "Timber:400"
    },
    "paramsDigest": "d87a985b8bb0aa9d19db37cd3dbceead0f555d97f387df63fa8f54e25999302a",
    "digest": "fb5138d826dcb3699560710139d4aea3f23e8ca6985bc88896bbf4a4132ec0b0",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "44db2559750418e057a3c65388e923fef145c6231e0e8b1bed2c8c0b30f37055",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "d1076f8285d852e3ab866e133cbfb382801d96a640c27ad45bfce871d82cf59e",
    "digest": "8330199101257662d8ed85cb33e7b7958cc6cb61ec035dc98ecf68a0d02e5205",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "b2a5e2096f0c89552bece11c25e04dd928c7bead1a2f681078de8d4201d99026",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "f3751e9b254e5513a409f042c27aff91bb5ece2574313aa03ba8996453562b7d",
    "digest": "aefe02a79dc2e6c27612fe3614693b9e2b879657ce0341d1121e538cdcdb162b",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "afdb1d3fc5911d1ed52166788eef298bdb5809b52f151120172a76beb90d2ae2",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "1968b5fb5c2964ca966cf38da994fd9a497a0eae9a80838b28b3c9187d71c0ac",
    "digest": "85ea8cb27010d42298aa6d625df7a2182e8a9f38b768bd0f2c12e19de3c6ac15",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "07540309400119788ebf42d947cd5a2eabc28d5baf595ce8d502592fa35eee5c",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "1a0be73fc4a43fddae03f777cb31511a9be72f52ef5a855eedf2cd5001929f15",
    "digest": "3c22c4653f55e177533f05efd497c04611ab9f0785f4661eb54cf8b84858be74",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "aa998f62f3855a056ef97900f443ed2d3d099a9858d196ef2e2315fbfe619f86",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "3193753f85706d5884d6aa8abbecc3642840879b4874da962cfe9a60af70c2f2",
    "digest": "53ee5047ce71fdb33dc194b416c211f547080a4bebc1b4fa0a48c2c37fc6b9aa",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "84af647855dab35fa42af1b93e1fffef00151b2d72e7d5ea68e1735a9893aade",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "4871296ae69a91251fff749604f831b9087f4ae12350611a8821ca30e252cb2c",
    "digest": "48300aaa74bd348b72ad025260fd44401a297fa1def48fa27e30b1e9afaba600",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "71f28a27fefa28c979678ff3edcd2976c0a19cd92a95a5a757ab4200f83b7e02",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "09473c69b5f16abb1fee2ada28d70b814637bc7d4cb112338e182549312632e3",
    "digest": "e64ac57856d0354bff2cbae4fd0ba5626613468e77bcd5b1c2c4cfc1546f879d",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "2470e6671982c0b83b61a80ff5bc0526a9a6fe7445f54ebeb24dccca50b6e5d4",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "e5bd7d4137f08b8dffba5c15b476a5cd37bf81085084cb6cced7dd906aa3e26d",
    "digest": "632d537df28cbc4ff455a7c52483e0e240c6be403856d74a985cdcfec2a0e5f4",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "a0ac63e891a456d42719dda8f93ba71df052d26a256b99a3e8f5cfd3d99855eb",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "a64bb319b4c234119d7ca5a5c4c382c18b874fcf83b75a9e9588ec2249864f26",
    "digest": "5a7b4a7ecde425f763654acf3df5dd0b76b37f0a38af4ef933c9c9a1135d080c",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "139b214e73a7582f2854665d725456a51fea4acb75568c663fd268ae7aa9abb1",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "6a9c03856eec0a1f970bda21e65295267d066bfa9118fcf8e0217446408b6293",
    "digest": "4f1aea95d2cc9e76586714aaae57c8253df13140110c9e0893fd1c8f886adb56",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "ee61eed802bb94881fe6abb3c99592aac6f72c81ae8eafb8f851cc76831260f8",
      "fontId": "Compass:300"
    },
    "paramsDigest": "ac0dfb44e09efdeab1349c4677f242b7e2f01fe358d9b0faca4a9f5c7ab79f61",
    "digest": "d2d9c7a80916819812efd9d931daaf9528d7f23d6ca7a0cde2981377b6e79dd5",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "8f4a2fa68b27e15eb8ec3541ea967a43a22901cd4dd9467b8ffeba7774f2cc0e",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "cefcbfdd678bb47fa420123a5f64b361fa005daa558a76328fef9d51f26cb764",
    "digest": "ceedd4952522ecb4713f0e604469883e4d049ef720d2307741330a24354a451f",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "2bd01d5d827475d44ba0221e4e283d402365ec03d1e3e61e9ed3790a6af893b7",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "ea5b099b0d0a5b452f6385c6039f6cd7b578ddb814f3422a6df07612d74af7b9",
    "digest": "761a8df7f79d5b5e4cbc8a4a0b53a6d778d2245c67a0ba1dfdd813ecc9499449",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "ddb7a8a92786bfae223af28085f5cd1cc5dbf62acc09cc24e761dd21b869ef68",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "6601b2b3a56506bb0afafa73ef4dd96dcb8f384248b8caa8c8060ecd06122022",
    "digest": "e6792c4b6b545828493c2b5c074a887474cdea550e5f3e05c8927891fc8e4cc9",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "e31f822f09b6a95dab2816aa8d5da21f910f158b1ca2c832553e4c24d04155bf",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "d86a4ccb065b58af59fd6892d8cdb29e31fa6151c421419d7d7cc853336cbb36",
    "digest": "ba9eb1ee533c49b5f53a1041ddb1491e0f4924c8e4f6885a3112a5d96f41f60b",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "4b136e3daf306f91cfbe77160133276dc1e4715e934980997d23244ad2dd7b54",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "d0e1e98ec37ee62b64b7ce6690c4a9d425c4962ccaf7a5654c34074fe60723e7",
    "digest": "22b9f07df8cf912e6546c8019ac7d1f92f35dc9f1ae05d883b77ae09926e09ce",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "c10065cbd5dddb3792882b2867c7566f1573c5fcd5a7394eab3223cb5692b4f0",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "b6db939363c579914eb741d7ca0bcd50d3424332f1158177c04ea7be1d13c589",
    "digest": "abde8a53875c7ecb74a501da7c67312f582a8ebb963d43130cdb53285f721fa6",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "340e807c83fd3e20fd3e9d2159f21b03c01e74846aaf87ce9aa0461388a349f5",
      "fontId": "Couture:600"
    },
    "paramsDigest": "8e3885bda178dd671031375d1b40c2dbde1de06c40b7131be507c1a6a9cf56c3",
    "digest": "de8461b8c0e165f7c5d8de771525f2cc9177fe5e9f26037f8664f2c00595f104",
    "ascent": 717,
    "descent": 286.8,
    "endCorrections": {
      " ": 2.842170943040401e-14,
      " ": 2.842170943040401e-14
    }
  },
  {
    "styleId": "serifitalic",
    "source": {
      "kind": "program-v1",
      "digest": "eb7a8316e4f0832f7e1afb5a6278a7c7579e369f19078cf731281f3547fedca5",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "fd82de885fbf3cd28d2badee8a7c4285358de60c8136ca51fd912c2ffaaae244",
    "digest": "3c26f0609698b04341901f591aa12c3b57f7d292d09525c0dbd8ca4d0f5e7a4f",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "54edcba4af295ad04d640e8692710e206bbf99446fca7be0539ee98b6a8ebc7b",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "2fed262ed5a522321e4b9dcfc075c017b7561b3b5a24f1e52699ac73161a3a67",
    "digest": "726231c8ae8d7cf291455dd1ae9314103730e95037adba29d74df3ab77889ac2",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "6f9067b2f146cc4c5a53542aab52e0fd1c514209d1999153dd7a62e886f97157",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "b2667d265987cefa712a9d27d8d98517537c71a8154eef1a8fd0c32a85af4c29",
    "digest": "81751423321f2161ea4daee9f9a829762012ae2899fa25c380a702604d0e61d4",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "db3742a5ff2afc65898883b4cb8a690f4d558618a32ead11cedba7af7631d4fb",
      "fontId": "Timber:400"
    },
    "paramsDigest": "278e55c7190dfb3f7b4867021afa70b8ef52d830b9b0fbd931b4387e29255dc4",
    "digest": "6a74423abdcde018e5e5acfbadd26bbbef32d0d9a64b1597d3603fc18aab577a",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "1bfc42b79ece104986563952db1e9cc2c2eaa58ef11c377b1be3ef867210e89d",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "875dbcd968ebfd98d6a3c5045281275f024cd592c4aac07b2f243548e9f4e334",
    "digest": "da7e70d00fab27b0231e2ec74e09a7b483fef295f7c09b96223bda0492db4e82",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "8e5f0d0a1e57a37f1bb2ea008c057895051fce04d95a732d15dc8a1c8149ab51",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "580a4ae36af8270fa95c9d2b8438a71900d17d8b82ae024c199b64105f30823b",
    "digest": "718d997f132c1f18fc39a0596b0997ac37bc23d47fe1f57a36b6678e809859b3",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "f17e8047c4748c8c77992f7dbe4a2d01edecbaaf9d1b3494df3a1b0a8bbb4750",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "9fa86f7f4e023abd68306bbe61fcf9586fcf8e225bf41c20d589da910b0bcd29",
    "digest": "226ae8b735cec523c5392f4f0c05ccc5ca0e6ee4fd9fd7d488c239256dfb2293",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "4cef2d6b9d3a670821820fa4a44ed7405e0807bd08c39cc08844b52d4a679801",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "0a7bc78d8991dde644b747b212aa8ab0b15357bdd2f73d29299a77e501ef26d8",
    "digest": "344c76e1d435a09aa8313d927595d82f55d62a44c3b7067f7e6e819cb78203e2",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "bb518a9b773f8749379707e76a922e35ef448be753cb10da62091ee66e1f930d",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "4f3fdb62ef9dd53f0e959b5ffe125b034b17314c988ffa9ef47ac44e00a5c0f8",
    "digest": "f75d3f5ad4056362dab59ca477359eb6e44297f014a34a8d69ffe056827b2611",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "6a8c7b25c7cbe6d641eec18102a8550bbf733812a33ae0b821c5749fa66d1ec2",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "018a4194780881cb2c679e85dd9611363a8c76801b090f12be15b9bd4c0aab1c",
    "digest": "2a66b27f01fc0a8be781cb67cee90401f60c44b629d80a8609457691f2dee59f",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "c8c21a3c2c33e374de1acdd4e737d1dbb04caac272a34f22fbda22665884a1a8",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "2d146edb6f1041e0ffeb7b1cfa2ca32b3cf0b8ab7d458c32c8f0a89610307753",
    "digest": "b1035c0e26d14e6f31a4f7ba254f9de170ad6613f67165a7b3eb677726430a48",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "c4f2901ce6b997f04a1186ab5508bb4aa373d6b7d4f910ccbbf0a7c3c534c433",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "12d1a1fd4ef8796e581611c76e8bc856d44e1788d3065f9f1c6c3065de9623a7",
    "digest": "3484510a2a6d4f16b2342f59f356a56f21cb817ac36e55292d2ff2039b14efb5",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  }
];

export function previewFontFor(styleId: string, source: SourceRef | null): PreviewFontInfo | undefined {
  return source ? PREVIEW_FONTS.findLast(info => info.styleId === styleId && info.source.kind === source.kind
    && info.source.digest === source.digest && info.source.fontId === source.fontId) : undefined;
}
export const previewFontUrl = (info: PreviewFontInfo) => `/api/source-previews/${info.digest}.otf`;

export function parsePreviewFonts(input: unknown): PreviewFontInfo[] {
  if (!Array.isArray(input)) throw new TypeError('Invalid preview font manifest');
  return input.map(value => {
    if (!value || typeof value !== 'object' || !('styleId' in value) || typeof value.styleId !== 'string' || !/^[a-z0-9-]+$/.test(value.styleId)
      || !('source' in value) || !('paramsDigest' in value) || typeof value.paramsDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.paramsDigest)
      || !('digest' in value) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)
      || !('ascent' in value) || typeof value.ascent !== 'number' || !Number.isFinite(value.ascent) || value.ascent <= 0
      || !('descent' in value) || typeof value.descent !== 'number' || !Number.isFinite(value.descent) || value.descent < 0
      || !('endCorrections' in value) || !value.endCorrections || typeof value.endCorrections !== 'object' || Array.isArray(value.endCorrections)) {
      throw new TypeError('Invalid preview font entry');
    }
    const source = parseSourceRef(value.source);
    if (!source) throw new TypeError('A preview font needs its source');
    const endCorrections: Record<string, number> = {};
    for (const [ch, correction] of Object.entries(value.endCorrections)) {
      if ([...ch].length !== 1 || typeof correction !== 'number' || !Number.isFinite(correction)) throw new TypeError('Invalid preview advance correction');
      endCorrections[ch] = correction;
    }
    return { styleId: value.styleId, source, paramsDigest: value.paramsDigest, digest: value.digest, ascent: value.ascent, descent: value.descent, endCorrections };
  });
}
