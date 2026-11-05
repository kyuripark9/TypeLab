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
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "0d201728b0018b9cb7cf5d1af9f6e8b02058a49309414e8950231a66dafa3315",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "b1d895b196720b3f6bcfd46574e27cfe233292b4fbab84095e8aaa699a80c3ef",
    "digest": "56f1c6123f276a92603e99acfea6f1a82565bf663ee55a621cff01cae5f7e9a1",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "ac4614a38ccf8c0c8a0f33e7d5d4baeaefc582f377ad6d9cfbe6336fd1d244ac",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "098caa1e5829607adcba6068505b72b32a4d7e0379c9abb8f7ad876ca392fec3",
    "digest": "76160506fb7a528b21b6769be7ff8c28feb97a645b5fa0573e10dbd16ba7d866",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "1b08919dddeab642d3900c15f9dbacd93e8e3142872f74fda89653b0250bcec2",
      "fontId": "Compass:300"
    },
    "paramsDigest": "39e31ca94a709cab4c5251cd1c945acf4510b78b22b7c17e4b3428d1b5dd030e",
    "digest": "a6ff9ea24367f1e379c1fd07731fb08b1c1abee23ef0d6d102961504a4d6755f",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "c01b88298a75712555b73fe1524c970afa4f7b0c6e0f1cbc22896c568d106bca",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "ab39d44b6b390cd4f5820825bda54e283804674e222fe299ac960f5f4f7c95ef",
    "digest": "16ef8ff31f98411480b5da2d8d10f871b8ec96d9b559efae392fc2e8d2e26649",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "37a330daab124085e6fe17dfd02768774ac1296040f8166aa16d068994bc460e",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "07d7687f38cbc9c70e642b581cd21cb4832e7635c5a571f09fe06e2abfdf0f76",
    "digest": "17ccd2103eb9b0ab48a5b10e0c3d617a72b24065e0611f687c66ae083e5b92ad",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "2933247b351f8835976cce06c812de2a7fdac234e77591ee9f3aed78f3eaf394",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "09f33d50f5b4c6f5cb81a3ab25a8df586db4bbcc46379ca49c0b1787b999e4e3",
    "digest": "776bb559cb3e444c8581811e0dbcd5c5de2ff8c8f6b10cbfbf0c04ca6eca7813",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "34367d1b4524f8431b7dd96d510daf6e23f1918628fb4d92a2a0a58109a5f860",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "e879c857e1591554feb2e28173240cf9ae3e1bca61c24e733d62dad8c9997e65",
    "digest": "6cf4d7205b681e413b552cceafdf6111b3ffb72bcc8296e31e3074a55439c0ae",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "1fb88d0fd7943b85e18ef81f3ce27dc6ccbbf76725721fddd6e7ee0bf83ce024",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "360cc3f5f80f065b8201e9072d0e2415520a278755cb4fdeff5347808e9d30c7",
    "digest": "9f79162b55e14e61fbbd2af8ae49f44688960f15f93f2acef33a23c90977b269",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "20356dffafe552f71627a25efb5b64357254712939b23d8d0be16ff50a1e5ea0",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "e547b0191ac62c03a11dae5a51a3e6c9166de76ddfe2d20f3e141e8aac6b05bb",
    "digest": "837def0034e091e879625f2c9e0a31c937d44897d045f23359adc0228438e91e",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "7db96d1e5bd83c08fb78e69bcbf85640fdd588f92d8f5d6174131934b0bd38b2",
      "fontId": "Couture:600"
    },
    "paramsDigest": "cc05ee1130febc3cc8ef44519c39a8cb4e3be17cb43720a2a5db4016db78fb7b",
    "digest": "7e23aefc8d2ceaa715ba8645f8ecdf5a5c4c61937e1c1b10c479d5ec67c63148",
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
      "digest": "09c5f2fa941ad3df7707fab6249e9967655035bfc99a2c45b4582a35fd9152ee",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "d2bf8c1d1fa9b8401f1b0159d0d769a301be0a35843afd4634afd26c2cbc59a5",
    "digest": "1a0064a566fe546070645840bf22c6eaa56f88f8ff24cc5f731d466661c18a2a",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "2401380f60ce3f475fe37653cae36396ba0b7e6e36472791a21c05a0be570b35",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "095467d3bdde8e9b11e3821d726329141854c988b0f2a994a4ed5f07ee73f4d4",
    "digest": "fae2675733848301c3d9d37b4f37871bb4ed3b44db84252777a54497f9177809",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "c4bc9f5f19247780b98e64117b602a0d70a4728b1a8f52a289e8164410ecb134",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "6e628197da40c81ba101c84b877e7b220432f930deb66a5b42d92316e675f503",
    "digest": "3d6e379ef249d9b57d40d3d48edfc738718199cb1f6cb14011d369ce44831c5e",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "45c91fa2d367e1089e4e190e942156b642fb7f3f04748a7a21ba3acddaeafcb3",
      "fontId": "Timber:400"
    },
    "paramsDigest": "e256a1374800232fde8b4510d299bb8549412c2f86ff313e8a80f273ffc30f08",
    "digest": "a6adb2eeb50308b89fcafd05aec2335928bef2cbfbac4e9dd50c3bde02e9f8e5",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "ecba216cb9476639d24e5f1fe318485086e1c304ae821a3273f75a101ad8cc9e",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "d21b6fbbc7219602d45f2e633f2a28724d166c2ce8106db11009a7de510e41ad",
    "digest": "0ae77ad8e835091478f21394629872754aa7340832f844cbce6cd194a8c9d08a",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "d97fccc3e4ad5efe93b1ba9428c8a56a13607203a4c3a0d0d0b31580851e8f33",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "333d680cd89533ab3fd5c23c827b234fad89da3e8b1578737946acf76e619480",
    "digest": "a02736f69196431610e55c3595391218ad8858ea5821658b7ae568e9c0fcb5f0",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "6f8f1ac39eff9fb5fda9b4d2c647058a63163920497e0030e317b6fdf0653aab",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "d4f5a71b1279619f1b9cf30df90dd53044a9ef0252076de2f748d77cac5e0649",
    "digest": "7db0071d597c736a257252e8f18cbfecb34d0e6d1388b913953a5b84c2471b73",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "4847c0fbb188835387ef314fe948b22cc2eb0dabe4bf17e7f5bd74e3e24b474b",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "4fd2568b82eb77a35223484a6021d1564e26d9a052431467409c18690ff70a4e",
    "digest": "2a697ba91083c073266fb78cafd9801eb3712b74f91bffd7cf48f5f360c997a9",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "45e2c7f7ba29027394de2a113e5d64dd630b45be66db4762442ffc02467e54a4",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "a234bf9534ed7dc386eda7e9b840452282883dbd1efb0784e002164b0da4f67d",
    "digest": "3f67ae1101d11e708f2037d4c95ad29525793456f4d7c8a4668d925038077707",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "3805cfc25cf30b4fc9ff9c4fee72152535f064267c1230f0fd0c41800e6418f8",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "c4721222460243bb19a398662a4c72d1db080dfa32385f61f8c5570deee295e4",
    "digest": "0d4063fa1f0c44ad1ba4414854f12bf9de9cd1adf8d1d6e4a7507666fb6976cc",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "9492341d2f7d79a860e97f58cec2cf979479419b1ac9df47fd087e7a4d6f018c",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "b32d944518fde32cb49ad11e0f754c6396230eee846dca540d5aba9a371c2726",
    "digest": "bef13d3967622a1bef6c4ecb8958e4ef2555e574a59b9ea7a8d6edb1af656db6",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "62d046346c48c232dae6c303ee7d0054767bb05ca4374510cfd9a52486087f9b",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "59f03a2036712702c0118e9ff8ed558ca93921c3c6fa1aba23c60b93f2577d89",
    "digest": "7c9175f1bbc77e7b336d723dc04d7d8547391bcd8b13164b5dac4c296777952d",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "d79fa816a3647b144f420a9b2b96c41c9b2633535fbc2d34213d96434a6299a0",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "78961f8a275fa83611ce398f27bb6e69e6bd6099f208221224d3f5691b9f9a02",
    "digest": "8998f43cc81b9f516f3eb6c46467cc59dc2862fe83765f1fe1a885fe987da6f6",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "67933f03482d3158251ac1fee35f83f54e7eed55968039bbbead4b33017a30ab",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "727961d5364c4192a1e9da17c951e3d2feab62d862c07f10c35ddad09939f50e",
    "digest": "62ce9ca5570464c2502f3e256bd86a07340e202de493d63783181e5b4ad4a5f4",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "5bc6b39fd60dbe8827e686bae1f7a5fbae0ea6f84a51a7d7682d8789ca8c719c",
      "fontId": "Compass:300"
    },
    "paramsDigest": "412ae456e26fdba503c22bb0bfd030f912132ff7bcc55a564e479275b19865d9",
    "digest": "d4e0c7113fcdf6914c69eb6d64dda0b384bbb4c0c5ad02bb039af811b2d1c4cf",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "251dd90b04b824cbb6e529a8250f5523be0015e8d9f0268461ecb792604d1673",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "ae0d9a96cc42881ca662bd37ec3e4b8145b8e48df2809da999320e12c983beb8",
    "digest": "77063185ea0cd5d87a96bb7e0714b1e8df3e7b570b4407e0bb69d3575de9f260",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "ac7ebd6668ef41c7155df9bd05a937bfb07b6c02890401df26aacc6c4b024959",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "8fc3de6d7f75776ca68dc255a13fa60304c7e12e68ff5cb10d74c7b6779d2bb2",
    "digest": "fb357f999b22a98c816289445f3b4fcf80c08c0f0edc5526ea4878c7b2125a0f",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "f1eada3017114bb4912073e8393ae548e2694243949155f1ef89dfceca8acf52",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "91988c13f5ecbf4b5535272bd6d32ca837127dd6a1ff035aca7c230cb806e1d4",
    "digest": "ee60c2e1f6ea7a13f0300420cb0487a3d95fd6a62c16000f35342f22de19073d",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "d9e57c66050e4749018d6947adbebf79cb0bf2b38decb0b8c607a53a01c3a64b",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "02e292283cf0477463116787ed61664753d86f8ce436413266764c52c0966659",
    "digest": "6c67fc96b69d89006829bbb039b1dc406ace95c30e9be1df7a31284b726744ba",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "b28e0dc0f11af7dd5c4489795d8026111e526f0f4e7197d4fbb4016451f030b8",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "b46d6e93a5873d0b559f8ba5eda4575bda3105e60581176fdfa0a8523e116d12",
    "digest": "aa5a4e7e412159f8a22d2b159901f556dc75ccd8303a120e1f41d27d7642b955",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "5afc389de83fee87b0ed270fe2230a4edd000b7a8f880ae50437b353862d248e",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "fc48c70097932a588396a3657af7d07d865b16afc0103fc6f5a16f2134ca6bd1",
    "digest": "d4b21924ad7a1c2afaac6aaf1c4088b5c9b01614e74d4d352d71f6c54c6fda09",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "c2051068d00fffafed0f741685bc84e79740ffd390c68537af21e3db7a841193",
      "fontId": "Couture:600"
    },
    "paramsDigest": "aafa72bd5e622e0ac21d3f9436de8d0f7a3dcd2d5a3daa216a513dc5216e47ed",
    "digest": "b0655c46300009f85785dc2a16caee824d1bab959aadbafecde706b3ef8dd5ad",
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
      "digest": "dd54fd94764c48c0f7fd743b341675ac3f416243d266ad40694dfe1ec0d1b6b5",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "4fce97300c1e0ac03cf04836289e5de10724124fc20261fb4d10a7f23ccf3748",
    "digest": "288edd2a0d0c671e982be1006bff3f6f8676ab5213438dc9a4e1defbd4d489c7",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "8096960f5f321690ae3a246d97b6b7f80c84ed6957c489bdc7f312995d223f57",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "119f0c0ef7bd8b66bba2d0285e9545712e2b5669a655996696ed7230c06fbf76",
    "digest": "955bbb67e7e9d680526c75a9d8f5ec0bc05256d6697c7c6eb4d2da045fb5d192",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "338e5453efbf002adf5474461632dbb5f67414f1f311ccf86ed0c84a38af5abb",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "c129afb2614649aceb9f7692244bae2a1f8709b413ca93835e180c113916e676",
    "digest": "4cfd8e30cb673000903cd93930a52ae49a167b9865cfda0aa055d27989b29ae5",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "f851d92d07b52a07df118014ea66775f88727dc275bc8d485924365ea47d3ed7",
      "fontId": "Timber:400"
    },
    "paramsDigest": "651e5bc4245497a1cb589148ea9aec74777a9daf574b4a1eea3d61fe9221ab2d",
    "digest": "b9bb23f9132f8c1bce825115b3c4cc1af334f79615f40eaa3151850bb0c08524",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "88ac576766d947f0e8d7c20dc6fc40b3e7d8f00cf1b74d3d9c3c54c73d1b6bc1",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "38ac729c2bf3ba2714e97e1292bf133cf1d2ba9e2e566307485b1aaf480a6d15",
    "digest": "af545960a3e0df304fc130de915a87bc7b75311b5339b5c88b11bdf5ee1cf849",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "715b58ad4900f5c5cbab4ac18938a331e572b6d6f63494467db03ca86d059420",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "95235b5375f86636c95f8745909c0a86d3e953e4a44f855f0cca9fb6b7b0688e",
    "digest": "44ee4aa7fe5380c3a5eb86b816a25a60b39c459e293d5569f5ae0f30f7103565",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "76e0dc4a15b259dd45924ac3f9fab11b02a007c21f0a1efe9d103d01bdd07bbd",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "560a1d57a6453d824573b871c95bfa1c15dcb497afcdb6e2ba40b489b1bf1afd",
    "digest": "b37564a88549cf3cc59554cc328047f198de30c037d50ee1c3f019f2a55d07f2",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "82adc47756ab388a20d95773dfdce95fac0f051e62fb709fff6d0b3ed4a0b38e",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "a02ca9850f5fac60dee36a4b2ce961dfb130c7a8c31a35399a914a32892429e6",
    "digest": "e6f87db5239390f78eeef3b0765ee450be6c2633239f2b7e1d855bb7671578e6",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "b8f4b99e06db293bb9406c23df9d164c16a75d2cd351e94d00645f234dfdec80",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "ba191e8ce7af34791373c90978a9eae4c290c8a7a2ec0715e4dd834d5a71ea43",
    "digest": "a3489a77ef43bfd408d5c0f5232195d13e031abbafd9b472897a7a4223bc0234",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "a8403b37bc6cd3105ba8bb3d823d3537c3164d8c66639868b2bcb37e1f7bfde6",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "1b00e54598cccd0a11e33bd58b96e99dae9b36ceadc4d58cb13f1deb484f4966",
    "digest": "133ddc682aff10df1c8fc37f2f97c443ff937628d0ca900fc691d6cc73a3c948",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "5e762f5288c94591e16549b9a218d25992a9c367f80610316f100218ff1f0e73",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "31faebe4c3086c2fee3ed57492778b6dcbadb54bd6869125ad19fce69a2fe18d",
    "digest": "fbebeabf8c0ab045d370a03b9fc845f859e54262c5c1eec38e512de004729b9a",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "a76bd585762570c8ce8003b51f338cb71c0d5d9535327cc33544c436c0bfa5bc",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "f4141e579f1c1e5a15408d46f1b08d873a61d162d057ce31aa690acd636296af",
    "digest": "7cfebf440e3160d35e90d32840429c2d76174ef2bde3f99b849a97918f013e1e",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "c298c3529d1805e19ca82134429c926a766835c8bf34913cbc6a0c1a06ba8bcc",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "5380591319fe708ddc3557f9dc6cffdc48f13e4864400025d85c9d639df3b80e",
    "digest": "cacfe991c9ed177cfa9fc5fbba6f168b92c9d5a0774a814dae0954f56d2b524b",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "721a3a6304015abfcbb6bded2dc8eb3f36662a2ae1d18115f91ebeadf563d412",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "ba33b52f78a81d76201378abdeedd72b26fae0260893bd5e9f0071b901fa449b",
    "digest": "f17ccd9c6a628d84ab36aec71dbe59579d7756b2ee514309960e1edddb64b2c7",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "18c0dc7f8f3666c82211f24eda7426e3692366817eb2a25ea1a27567d71606ec",
      "fontId": "Compass:300"
    },
    "paramsDigest": "be7c3df9e8586c3e832490d32c667b9c4d6a434535afbbe9cf69b28bb881b356",
    "digest": "586ced6f3bc16d05f9023ef2b60e6c6bedcb08a4cdc08e396155eeca1965709d",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "dac555d623153668d7db6f74047087e37442f2e8fa4f2bf70cabd4b8c4dfefe3",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "7db9213a8d08f0642f24ae42b0109c5e8bf2988c5c36f846705de1a02f42b3a4",
    "digest": "be8a75d014d6f30007ec7481992aafe1669f108410c0f9ccd01b5778ed1ee28c",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "0e74132f853f0edda6a8f6b28ab3d900fb7c52d48c824f63410650784539a25d",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "2fc20d1cb5fdbe9d559eee1aa82468a7ede3245c07dab6440ae4b48894edc3da",
    "digest": "7e5de08dc8a8dda75d30ed8889645edce8bf5f2f47e0d57ea0fd6dfde1982a29",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "e41a7d05cbb7fe3cec29170fcfecb2004a95320f7232eaf442640ccd5f718b5b",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "9c12368fe1f8855bfb95bb721363b9f2807db42dddae1beb3deaa5a7da66114c",
    "digest": "dd3306e9b8b454a11ed872fe31880c0fa76a8e5c2c928f67ec2b2cd2e63eb59e",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "721c3d674d13de4789b1f78123ca1b85acd29c25774b04111ecae6614c61aa59",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "69016e0de73ce0b630d94c846a7bb7f15e5fe20a88ecea871de6b0847434283b",
    "digest": "5beed9d8fa365fdd090b52f8df9c47dab97ee56027e3b771a7c6b5205deb1376",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "574fa95e40fe79a16b899869cc1b2b6192a330c99920e129f2b6e67adb098409",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "963f8a1c420850096da1b9b4e47e4794893aa7795274401cf0be926e4a95d6f0",
    "digest": "1ff5ed38955e9ba55f791fa263a9aff8e322687b1379784d824aa936d519f5ff",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "4b14cc450672df042e8171568cd2e5cd8cf302de8f7012a2f5697bbd2c428271",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "d91e3523266802daf79af87c1288e30d3e3de23ef72babf1fc6d3cfff588fcb1",
    "digest": "40a21cb9fde7c52816aa7b01137d92094b8d43221da6807df50ec64aeee2971d",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "048f5eb3177630d711ca27531d5d8c60e5b759f32ba274989446d42faf57f792",
      "fontId": "Couture:600"
    },
    "paramsDigest": "49d3feb55426f3bc5de535090e39b187105340d1016266fc345ffa12af9d67ff",
    "digest": "eee6092e36a26adb4bec44da18cfb6aeff1d1b2744dcd56500bb96c8ff78c1d6",
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
      "digest": "ac89c78ce99a800a965896ed84828610002b039b039131208ca51e9f3004cccd",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "0a7abdbfc04709976ec60bb868b6b73b80ea66664f2d89bf3aa8146852f9005e",
    "digest": "8e00497e822523803b1f6bc4618147da02bb2df21accbe3d6df525862e4371d1",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "762ce110f693a9c3c69bca11f7d615806217d8a0934d8d96275bb9108c7a6b3f",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "004c4508ef637e61a5f8ee7d6c3b294c744cabd8905d255f31a03b7383b1f764",
    "digest": "a7005425e418d08a4f41b369295a1a6de58c64bcdf0eb0e6f1599fd1fa69d8d0",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "ba40432e3524b8ccb56d8b9ddf2816b2e63f43e9106ae63f7f9503328205cd4e",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "e36541d3ba55181ce3d5824702134fdd28941f5d305969fdaa0ed7ab5fb5129e",
    "digest": "70c30b109c7510048cf86ac692f59508cfa207cc717c4c4214d586fc0f66e143",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "585c84a0681e8b51132e896a08400f91e7fae29395e8a804f9255b442a716e5b",
      "fontId": "Timber:400"
    },
    "paramsDigest": "d8939f2284b24180b5fe17490f96f0f5f61c575cf4624b118f0046106dacf4bc",
    "digest": "36d68211de74ce22f83fb56b07abb27abb9f3fc0533be4034c878b73cb3dee6a",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "5d2417ceefea24386f342ccff2167998de196a9e80219a67357abb183f5c1142",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "b737e457e2833baa6130084e67d318edea33419e2b1c17b25b4e087013414de7",
    "digest": "ff8c599914770f6236391844f4cfbe56f38ea7e2a51f205424ceb87ab5ee6a62",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "7966cfd845012ccce7ba56a2d26eb407966668b07afebcbf7f4650f126a03648",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "a194473674c38182a74387effc311d35d7edb317fcac3f51cfd588f3659b0822",
    "digest": "03cea21507d3a76ffab453e97b27bab6ea5a228ade80da7900d039237627bea0",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "c957fe4fc795cb93a4732a3613e822b2760d2f0f892f645aeb523698deaf6d44",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "db357c31b1af008321ea43f3c4da45166d2b738847c4e02b6533fe448de0d540",
    "digest": "3062b7574a186c8b272ed38eb2d14b076159ece3b6d0ec431dc0c521893547b9",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "006ef944bed6b282eb225b23407cc15106d563c902cf3c5dc02b7ce489cf134d",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "3cf7f506689e4e3cf10badad88176032f6caa7aabed5ea4b8e1a1eb28baae305",
    "digest": "cbcf437755b0d5620edeb7df3e3cfae1b74720dadc9590723bc5208ac332d6dc",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "11816bf84473f92927d686b43c8e829e39dec2de661f7ba1d6243963f120b5ad",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "b0b84fe78d6139eb73a750433ae5c8b6879027edb36ec2bae9eb0a80ade37a36",
    "digest": "1bdb522921c004f6ea99eb85f5a0d1dccaba547c492d33f5a921a24520018ede",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "236d4513deb76563fab0e12b4ec8efaf6dc197e9ab37d11e932f77fd901b9195",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "788d4305200afb4d54acd0af649c9fb11ffd37c2104a7b769adceab6e52515e3",
    "digest": "1eb2df6eaf7703b9259e797a006a508c060d9f5627fa4d74c7536f471cb9e43b",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "6b0e8026a09d2ea069ad5edae265d61dc20d4b7bf1c7cef88770f80861cce19b",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "718c87430ca8fb586e88dd710b225ceec4e2f5e2fb91c207152b7f245772c3e1",
    "digest": "84a2599e5048f1033a3397213eff2c10302fea3653b25d9c53a2d6bf1c6c6bc9",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "38b7e0f09e0b6c0b7b1b9867fb0d2c0f362b4c642d7a791130ae79e5ac499f65",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "e59b87756bbc70c8d583fdcd01c0c87270866f4ed72ebdad17d85505ce962a99",
    "digest": "7c12db504bfd854d15e88e292c08f1fd380da64625e7313e5488bc27d1f4f99b",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "62b8ca8dbf3f6bb2b146ddee74dd16ef900457ea2e9e1fc821ff1611776edb5f",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "4338611531a7f015c79ce1a31edf1d3a6da4858a10c0a5c5a546cb21675d2fd2",
    "digest": "8b75ac46f5114c6828f75a3d01f162cc65b4180ef36f69a2a75d5f8eadc3e21b",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "2e1f7a98de1937966a344d0512f0bbec9ea91747091c53f1061b633dbc26f61d",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "e0174240bb0effb6c8530229cd90c06d17b2510df3911726dfe0af44f390c534",
    "digest": "e5e6b22a4e191aa7eeecc502ffe243c3b9d32d995c3188c2842e89569bc53b46",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "bd54cd9dd21cdde48fc7c59097ff795bd3a3cb6706345bddd4980bcd9af91a6c",
      "fontId": "Compass:300"
    },
    "paramsDigest": "e8540422a575e0d403f61baf5ac49f97adef19d60e79fafc936375e8d5acb2ef",
    "digest": "aa1e6e052d84e57aca695b0dbdde0e04338efb02aa3e7dae5a1cac3e15d519f5",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "923af8a46914b5d0d498a8a627a29cc433942e1772de2c65319965770315eb9a",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "487569b2e68c83f14e8dde1ae1d9f97d325b16850c0177e6749c758638dc2d01",
    "digest": "05135369bf36a03a4ee4c15e5a342ab726d25218d9d8991fcb9725389fb866f2",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "d8c2201f24ef97d505b30788707b5f7d8550a81ac19f1dfe98683283801476a1",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "e3d6dcfb6929e0d5db0879e416dd8864582a27031df64b327053a24609023741",
    "digest": "1906c56df45d64db08541c7cc91d81ae8c878b990f5e8b31cbfc2aa621dad1b9",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "cea038f96fb7c8ab04fa969a26fe349532471fb525ec0ff716a4fa2469f82c2e",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "18911fbbfab9f5902f736113759fa67069ff997310649780d1cdce6edceb147e",
    "digest": "a32f6c7150f01c18ceb59c5f1cd90e07f37844d843014d600430e23d220af6c0",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "bb172ca16ef451b833e29c9b5c3388ba94b0b0110d37d6ceea42735d9fea2600",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "e78e007b62a9029e788e4aa7e5dfb4137acf949bacbc0daf27701bb206a3e34c",
    "digest": "0bb760474312d905a8e50a39fefcc9c7b8322da2c9a007c5025b0b903e02aa37",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "9efffa085c505dd6364d22e6d88b8dc40e75dac96b4679934753c789b1aae4e0",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "defe7594b7201a4774a2fefdbf831a4da096f3c7c08bbbf27e29cebed2209cae",
    "digest": "2100bd83de82e9528e6629178f1beefcbe5e8cfa5fa6285d3c59a0802778dba4",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "c4c05c54cfa18781544ebca20029fd3d2b2b32dd71f1916eb4d5dc62ecd48892",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "88e8f92553b78e226ba9180e9307553d025160aa992c63acaea3a3626be4ae20",
    "digest": "6e773221ecd1de585b350af210f7682c283ac79211a674cf8929a5a7c5460936",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "8cc5d4cfa32718045d5251a3ddbc1dcb84cb3e16085578e08e437273035cd970",
      "fontId": "Couture:600"
    },
    "paramsDigest": "48c8cf1ccc9e77b067db9fa0f23481c314b344a73f0342f0d98dc317b2f43628",
    "digest": "d6b9cf3e98e56d674ca85b38ded45c08e54fb84b586483999c58df59d3ea6741",
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
      "digest": "20a156e6f5cbf3f82e807897ff10a12ffde7468ba91658529ef37a551bfc2857",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "f193fbc22e7b2ed20afa528cb7e70d3454855e086c6e27be3a7662856592a239",
    "digest": "d6f2d9b7a7d4de742274a48cfc7098b47b260187ded24e1eb31932b9ea4c5da8",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "2c55a8dea6761fa257c65eda3f4ab1210fabb135bab22d98f8ea844faaffa34f",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "22cc137dcee513d968372ae0f997715210d4ab72e3e00cfb847019431a6dda7d",
    "digest": "076a5859f2c9453001c1e4c30e2934a48697b672de97b08a4ff93001a806f503",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "7c7d190566f9e632339f65adc28a1596c57d404272bdba3d005f7cdaaeb46694",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "809351be37e8c6eeaf6a8f80128c5d0926dc11938b46a7593d7e028231278f7d",
    "digest": "65dd348df6bda65998c61849ba39b71193365e167cb690db1d99a083cb13275e",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "5910e54bac0853779aecbd3fbe10692c5891f55873dbf7a5888e2699d4135a35",
      "fontId": "Timber:400"
    },
    "paramsDigest": "65780a0137bc81c6c82bdc0b55364bffce0b87bb2002d332537ee2e5417ab68b",
    "digest": "c29bc2acfc385acb6878f016cf419e2e0fa63c5bbd1091cbbc4ae06e8a6928ca",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "64d338794ecd5a296283e3a5d5714b528b6666c6d4533d758e669dcc87d7103f",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "1637257f68cb5a8687c6dd8e4e9584ff35dabedb3d59b12e2663aea2bc392bf0",
    "digest": "68d56a769ceb6a826a116dd40eb7190bd4e3b7bdecbc3688f2220a2be744f24e",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "b9bc40843c0b1c493c54d708fd8f1533eb14009ebf174c8bd81aeeef82b1451c",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "fb6d86a5eec5470c8c351013db4634f6c24e25dbe616c8a56cf7213c279fb1ce",
    "digest": "1873aa374f369aa99ef14493e15e3ed14af3f2d33e4047679d1136a7d9790bac",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "c49755630ff59c0313f00a188eecd13bebf5411a8b7fd4b855ed175e3e91e761",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "467144cf50e19daf012734336e2ae2aec6411be24550af68ae79a5a77dbc022f",
    "digest": "4f43e29ba19eeed9552a6914369776f93fc3582e058506f5a83e2fab634f41ed",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "ac109adb47d3460f9a926b44fd9a667503b9385d9ac0290c4325dd9b987f896e",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "adaf3cbe30493cd475b42ed172154e84cc66837bdec2b2cf05fc79d64ac35295",
    "digest": "89dbb5cfc0e95c182cdd8bcee6c9d7b5b0b4b2e3a6c5379ddb1d88fc790c5b9d",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "5a1d450959d10ccf47c3e69db006be1570f5456e814476a6a5d77da1fc4e7a31",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "5a486b32de5ebfd5dd7924e81a04630b90536406e0422030fbaf099a74a13f8b",
    "digest": "8a2f2e2cd48fe8d1619386bdb5205896131f27419ee69c2392e6f45232cb32b9",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "25316d3005bef31e7751bcdf9974a8494c31cd20d6f664abadfda710e17366cf",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "3091ab515e841d9a164b9970deaff8cc627ad0dfa41ebbfb5858c8d7a546dad2",
    "digest": "9516f03b1fb26f435f4d2b1fa0349241a8fcde430e92fc802ccb5df70f316623",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "883c8c828eeb8e7b4870a5122999c5fcb9b35048d9d1b76516709f0b9c44deb5",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "6f8899bdd690eaa127cd0093c444aadb1e5a510d1fdc3f9a3ebd506de235958d",
    "digest": "d6188b2c723dd1e37083d8e1616f9dbd2a1ca596ea9137b69409e02470f1103e",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "b0e35dc8cb66d601bddbd08b591a25a4aa321196b806a62d37e6308e750bbcb5",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "39b1fd45ac22141e6bacfa662408465b8170504f9eb5162009cea11e87f03262",
    "digest": "07bb03f5c6f097f3c4c10f246fb6047219ce0890465c96e4d96bd1a8eb5325e0",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "7985ba85f8f38ffd281a67ef2bcc61628736a6c41447b0cde7cdbea4a637c048",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "a2dc21bdbc6d312f51d9002d5068ce0c3b000982d6acac0bcbc20d886db7b368",
    "digest": "2dfa67e1562075ec207baf730ba509dceb6e635de711f4b32e3db2539bf0a6ab",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "ebc099fdccffcf9b8ce333db7046f674adcaf85d21c00b11029cad9b2e35e874",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "bf9474c67a9baa43f60e8f6261c8fbe0fe54eb9d05bc8153c947a6c8402a9540",
    "digest": "fa2efdbddced5fefd7ca5557de1fd7acbc282ba6c51493ae48442d9d1b7f0987",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "528f27f1c13c881bc941038f34b7b43b372b274f550466f53cbb1a7a898efa7e",
      "fontId": "Compass:300"
    },
    "paramsDigest": "10a796a2d81b47d3d5d5711624b16381111ff1ab58c2f5fb9e7ab238c4c9315b",
    "digest": "8f26156ff6cb869a5a50606ea06b2135e6a41694d9ba46a1cd5d8e5b05a893e5",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "2e83f42c5d292e4e46046cad261f785cdd2baffb86ffd9aa8cf91cb355849a5f",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "1943027998fec02d9d5a7eae5c5adbf6dd0efe044228cf58005eb675a2cfad53",
    "digest": "a6d46aec13781c862ce4907d894084f36cd6128060d8df6650058dc02e3c589c",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "a18825083c1b7500a2f916fb26b4ce500e595b8d89e64f0e451734f4f56ede8a",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "a6c61aa72ee68debaa9a428186a9d570cced57520eacc9fb11af89fa087121a9",
    "digest": "ec9601dbdf73028f6299b15af7302f006ec207c8ddc5519ffef292da3eea5015",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "d958155bc5c39a0d325028473cd4325d0e9452345615180795bd960bc3f3430b",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "1ffd2c08860f3ab52faf5353991217fa72a91d77b9ddfae0406bcea77ac37e77",
    "digest": "5b62fbc6e1ea87f2b9b02b31aaefe31bbc51f3f1b393e97333a7004efd44092e",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "5e733594cb97fd0b3d476efc508d923af9d072734716a630c81dbf77ae226d49",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "7b2c3c4a57fcc291ce8417e5fb239ee82971034229da4dd2bcacd4207f66afdf",
    "digest": "314a406ffad2262c52a8eb7620aebde850cf7caa5025f8f8bdeac9b92d543d2d",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "122852d43dfc7624bb9f125321edaf203a8eabae045d1f85a14776e9eb8fc0f9",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "6196fdf53ded5fd32f6523801d098b47c7b289a8d2d22cf98dc3c5cb1c4e0229",
    "digest": "6d5b9668f89165088e02ee86ea9c8dec422879c51a5cc88ed68782a3563e13dd",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "00eafe5966e7f46570befe3a484853224322104df59c6f494f638b9ec96ec929",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "468ca87f3da28b6c15466d97c56a2404ee42302a3014d36420a10e63a53107c5",
    "digest": "3e0623b83b04615d21ad810a09f1e9f599fd3bd3123cd51276aec655272a785b",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "23716775b39f719419fd12e45644d02ca3b46b855b4fe2d02ab6a5adb277223a",
      "fontId": "Couture:600"
    },
    "paramsDigest": "e798e817682229e5a3635860838911fcbf034e93d070bda873d55c241b6a230a",
    "digest": "9b5fe52b4a65260a6e83772461a3aeb3092666117b53cac765a2fa83f7110a8e",
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
      "digest": "6caee29b042bde18c77d9a13cb1e54ce2ac2bd6013757f81fcb7363b04d01da4",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "8ceb904eff15198da5352645444525777d03c1ca79c3d305e7329ddbd6d41bb3",
    "digest": "7a9da55728f52a3dc3ecf09e104607a3acd97d00d23e0a42f705aaad151c7936",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "b05c03bb9ba85e790c264fac9dd24f634d8c56b66def683077d577142f8e8310",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "ec02d81fa97125439e6c3cfa780a6786c9e1ab84f47263ac816ca87bedc2a154",
    "digest": "c482dac63a8b592542c2763d2f7dbbd4bdbea106e2d2811aa26313462a4dd65a",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "bd8757116ad205acadb4c518f5a57956c9fc7bf5878935c678747275224382a6",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "f233eea6b848dd76e94fa34bb70695ee44ef22d56c1fe9a8e40c4ea7323955b8",
    "digest": "ff3f86a9dcc5b53b022b9e9f7792826f9674972a12dff6b3c79d43528287786a",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "213f1e3974813622a0535516a44adb6526a8e43a59e1269e66b8e4017ec864f7",
      "fontId": "Timber:400"
    },
    "paramsDigest": "3d7f188a95c5f93277b6ee474e5e775956dca42246fb43b4afcdaf06e696d900",
    "digest": "bba6d47410db481a5e3c69a52a9e1addc550a27a122961af20f524823e358147",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "9309852f2f227feed2cd413410fd9ad8e72d52cf150c99ec4174558998821a5a",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "d361add471b6338dd54035dd0d546b27b831992fcffd9541c9c04c059d2c42ff",
    "digest": "f72c40a38dfecde0c626037fc7d0c3795003350a50b05d4c669cf798d9573c4f",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "e54fe1b68658598e54cd0ea642d3ef0958b9bdb960b8f34449cd817b6f222d61",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "992380ff09e4733d959667e986ab3ceed835074450ba7f55ecd85768c278a270",
    "digest": "af2fe3286a5e7bdefe8f21679653f54779285109c0a8d1dbd265223652411fda",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "5f4f32f5deccf988392e10e5ec08eb5c7e920f109ac4d551fe0a1765520cf58d",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "4f6662cdf78be2cab2d5f154560bb5d46c39c42375619543992ae655fa6af345",
    "digest": "4d402390aae651b39aa4058f34f13a413af1dbfcf1eb40f1b9e7d890ff1657f3",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "ec28eb439f02fe80bab04433b07008648000fbd9271a53e492087d1b76fbafc6",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "4499b415654fe571ffbc4171b47c127d6552c9a0a1754b74964e68cca63da19e",
    "digest": "6f22d5d70164349890abdd08765a420fcbd78962ea5c12d1ac8f44598e45eaac",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "ead32fd1a5af13c2b4b21f49e7f088633c7b94873a0504d6a3b973343c6e7128",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "b2332fd47fb01fab84c76dff6f676e30914ff03a11c2a2598618a691ff3f3c82",
    "digest": "454e19f40e330d24062e078a0f8f8684674951cd99f021bc55b0b704fe82e702",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "a6852601d9906db29487f61196fcbd0053b6cf984d932a95e8fe4be824478a50",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "03e6030cbb68a29f7f30d59e9a6bc12cb4dbfa14a8a2247581644c47ca44ac89",
    "digest": "a52b4f71e17fef095994a444284b5b195cd93b6bf998bbc31d687010f6474f01",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "4dee2b0aa8c82b92506e0734092fc8678beca590ddec9a495d1e2c76392b9b9d",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "835f507dfc4b8765ede3a5f755559c8915b45c4286097c9f4623731cba11c0bb",
    "digest": "9776da3ca6a564700561375306852b5ed6cc27b61b21b7188ce681309a4a2b6b",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "89185d8990a888e4e5ec974d91f1ee10900bd3f21d7d32ce2bb9409c6931da30",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "4a445829066f0b2aca111ef854a6d9632dc646451cd67a8ba76eaf4e629dcfbb",
    "digest": "86f9e13c58f21f09411605e4969c068cd00011d0b77f812774b56c28d9ae0380",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "7c44f94e779fb8515125e4ab706d2d432d95365d08aee4cddbc1a57a9e7e36aa",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "faef25cf44df462fca636b04f882e704fb2a03f65f1dcac9a24df596af55d45c",
    "digest": "fc5869fba1dc52cd7f6cf5cea06f3e912f80e0f1355dbacfc73aec16c7b843b4",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "438c12beefbc0fae215aadcd6a92ff31ae78aa6f6c1a04a9cfbfb340eb7a31e8",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "eb73767e5180f491e98183a0fd5d64276b28c2e9233ab9998e87304d438b9080",
    "digest": "6bb4027fb1955463498a96761ebc090ebe2579e7d6af7b06701763f0c27436e1",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "e5e825dfdbe1f90183a15c8027c162d142e2a0932c0fcd758b8dbff79903b6c3",
      "fontId": "Compass:300"
    },
    "paramsDigest": "11ee5ec0f85505d7469867611c6175b495cc3f41e15a08959956d7528fb9a07b",
    "digest": "cc453554b27e52fc15f199ce520abc5d99f1e3f0695d47a4e8ffc107f0176f56",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "b0f4ff3031f4bbc4dd21d94ec58a001b870c761f09dc6db4f39b396f11531db7",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "68207d73794d314bc66bf3f7a7066b1c63248f3ac487b49ad7ee3245664d4734",
    "digest": "f7fd36c72e4e7834ab08ed69c23513e2794ca74b3e161155682a38041fa4c740",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "ec3ba72f22f7cb50c21892fa10d5d144806e2647d2fe0f71f64705da4fb3aaee",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "bc519705fb19a0526acf1e320bf96e5bccef02f98b9b4969e1bade714a800fa7",
    "digest": "8264bca3d7f321fa25d7bb9cbd3dfa88a4e34d6d57f674f3c32598fab5194863",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "5ee55e342783fa4fdbb1fc2069093b76ef808df28c83e800a53e15ee8ee87740",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "daa5b38987cbe194d1f3e2bd5f2be2c38d231d0d08ea6b56bb4dbfebefc74a8e",
    "digest": "abb36a8d7f2b79b1812a499d4529544340a20a0e67cf08661ea3d7316f14cee4",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "848d743b528b89d775fc3e2881470653a13c0a44bf72eba059049dd797d1d7de",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "5b3d68c5844a1cd336be2ae2021dd818066b4cb058315f42431ad5d2ed57f2c1",
    "digest": "220a6e595291a38ea4f3ea5460b07abc77ab549c4e4da079e3fdb1cf64e6d61e",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "064086c8fe776126d9c6de4a718890316c8b1c1723c60808b515dc47f0ca01d4",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "1ae0f79df291a9dace8e33e818cfb13108b539c5a365e4629ca2f85d9984c319",
    "digest": "a8fbdb042407937726f5e96b97da0aacf8a8ec138584981a70e209f7e2b1b567",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "e854bbf93769cc2bc50ce3bdfe7b966d185e9fb7872e78ea6d1c45d8be7fadd2",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "8c901047feb1355d45100b1462f810f3e61c8437485465ffda004aa60dd78f38",
    "digest": "b064ac3a07037f9e4e94d5f8d8e104661729048ea0b2ee5bdc9dcfbfb7041b47",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "ffc361642e219696403e4fb0f6d3ea102ce5fe59098c67608672dba178466e4d",
      "fontId": "Couture:600"
    },
    "paramsDigest": "4efa357b1acfefcb928b01bcfe71c57d9f01da66a3b67f1e488b4f52c137a22c",
    "digest": "070bbb309823efa3986c8663d336f66a0c7bd5d12bdc47ed5de661333c5a71ce",
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
      "digest": "58ffda59e7d41d94e8223666d54ab4d5870aea995cb15bc7fd0134d34cfa9da4",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "f44bbbb410321391520d6ad256643566ddc923332653a36b202e030d8652d8f5",
    "digest": "7097a9faf33546c3acc51823dd9d4e0041d36eefa632779d79cd3318483f973d",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "e5b9fcbd5462fb95697e746cdabba4d13712d897f0276a08772497ebaba80061",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "908d6612cce1af90d99d12a842b950f78783c8eed177f4f9e275872074a9dba0",
    "digest": "70be53f3dbd21cb6bf246d68f4a1e71790fd3f5fe0f9bec39ca5715a8d70e2cb",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "25a60d9365fcc031eea9c7698385b20c84a175e023ee25a266484132b1bb2ab6",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "b8184a436fc21350a1a71d3ecf9b9d911f84f35e352749ad811779428c3482fc",
    "digest": "be8a4789157fa81ad316951a74958c9e65e91e926ef66d879c9ad0a390ca9f89",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "4179381450e07d283590a7cb82b48d3a422dca869bf95d4f76c975380ec27851",
      "fontId": "Timber:400"
    },
    "paramsDigest": "1d94224659e17b55a942be703fc829e87935dcfa214b843c502184b1fc020892",
    "digest": "8b98339da4c3460596791400cb3eb04b11bebe209c6e90e4f78d826cd1916f1f",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "c8f56c731b08bbc3e89b0431eede4d31a2be0055faf6b9f8dfef89fb12f3b0c3",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "c6a30a24304ef81d56f5b4bee1af46a92f09628b10300e35c7bb54dcf3185497",
    "digest": "9bab0298cc3c7294dbaee57de89044a9f924fba2aa0be211137e685fc8f58d37",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "ba120ed6b154cac986f914c64a24162bc55e941d00ed9109f8b50dcf80cb2a3c",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "e76625246bef32c05b7b30cc765168225e0e5e3df1297357111818cde8e22aad",
    "digest": "94a28a407ca061ad813904b1be433390ee47fca7584fed5eb68fde07c7e7900f",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "354baaa072498c41da3c5f00fa986f54efe1d34a50879cb495c309356bc082e0",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "28592a1b1d02baca87fb564f6fd8969181f23a9aa1df0acfb83b99d11f5fdf98",
    "digest": "bb353cd1deb1a89d4e632ff44e6d79bd5b3c42188e05735527b467a56cbf6c44",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "fe8d79d3b0e046f03cb4f00cb4e896dddc9ae5bd7d2cfbe4326b4a9cef214aa0",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "08e1f4efa6065ea720692be71d15822aea82d04ef109caf8f9cc6dd33540d409",
    "digest": "658b7186a955c7fa55d0a57230e15ff577754fbf59b8acb130bca9a14220972b",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "dc24bc954090752a65e2d888a810328da37e6246c22e07cc6c247c0328e52a20",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "f5e51afdb79ff4b4caac37e565177633217226d8ddd4ce45abf915a2a0d84989",
    "digest": "0c3deee129083379f9d9e7f19ac1ebe877ee7a658614c8b450d8218abb6847a9",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "028bf88de1e026ebf2a32a957c8014dcdefbc3394d3584ef7969f0225326b5c3",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "856658ee12a6cfdc2c807e212c6ddd2fa6a260aecb1270f5e7dfaa6d510b0240",
    "digest": "2c3ed5cb942cefd40414aed7be5db840e6e492afd99f113a467d56081b745698",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "386025f8dafc7a276134c283150bdba9df2e613851d394fb3c27e153fdf45380",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "f21a2f611afacdf2aa6ce1c18319b7e3d78853de64f18bd03ee8a536df126bf3",
    "digest": "f791ba80e9d5ad92148323c7ecf3f6e6751b8e4f5bbfac7080585c6719b28590",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "grotesque",
    "source": {
      "kind": "program-v1",
      "digest": "3cf16e175ae78193cbee111ebfe729e8d961f6ba3dcb5e4c34cc61fc928181d8",
      "fontId": "Mainline:600"
    },
    "paramsDigest": "c0971646869a3aae328f98d1c6d1cb6e92b18883e34e0e863186fbfb2563f8ed",
    "digest": "b0451346d3cf271901e8ae2597f48b05951f2eaf0ebc018fe6935a38856281bd",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "humanist",
    "source": {
      "kind": "program-v1",
      "digest": "9f5840dcc94c6f53eb93887bc63ce7c4d14902f759a806ffb8140dd3c39cc121",
      "fontId": "Parlance:500"
    },
    "paramsDigest": "513a09b32827d94bc397c9519a964c05064ae6342c50fc718b5a3bb4d82f9805",
    "digest": "4e837961d9a570f96f9ee121ae5081db1fb7b13ba667b693c9660367e4cc6a76",
    "ascent": 771,
    "descent": 308.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "geometric",
    "source": {
      "kind": "program-v1",
      "digest": "ba4bfefd18a19258a6a68da8adb7145e3b83ab4339f6667a661dd7d26086641a",
      "fontId": "Compass:300"
    },
    "paramsDigest": "102f253cc1c9da0b183e944a2b6305dac56c48b7242351fa5f6f0aa545270985",
    "digest": "4ebfef08ce25535271088f227583ee6a546993aa7fba1c7ddcf1685a9bca687d",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "soft",
    "source": {
      "kind": "program-v1",
      "digest": "da8bdca7b5b95c48c5afa11aca3fe75c522025a20e6536502fe15870487f62e3",
      "fontId": "Cotton:300"
    },
    "paramsDigest": "2bda7d8736bde27e4421766bd24b90f274e3f1249b67402ebd1ab122321454d7",
    "digest": "99c8fe7bbfa94775ca2192d78f72db3e5ecd609220ba67680616b10d2baf4dc3",
    "ascent": 705,
    "descent": 282,
    "endCorrections": {}
  },
  {
    "styleId": "industrial",
    "source": {
      "kind": "program-v1",
      "digest": "bc067c6d51b58f46f46f8687097ad6fd958ac7e80e7f08bcb53f5ec94f2e3520",
      "fontId": "Turnpike:500"
    },
    "paramsDigest": "df48ccbdac4f44fdf6261b46fd8f0b20dd6cf68be9b0454f4c547599e6453b36",
    "digest": "b3b547bafa1b2c225ff1f6c8fad7440be55a98acf5f4b087c4786d59e6c8baf5",
    "ascent": 634,
    "descent": 253.60000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "squircle",
    "source": {
      "kind": "program-v1",
      "digest": "7eb6dda404bde7454141f9742605eb7ccb8c4260922d66bd856ac8070f70bd7a",
      "fontId": "Orbital:600"
    },
    "paramsDigest": "78a33455fc3fd334ade8df2f221a3570a9cc628f4fe792c6be57204ca0a11e68",
    "digest": "1b77387c8c9f4709447a8e9ca9708b687bfeb76d348133f5fc25b53e7c193846",
    "ascent": 768,
    "descent": 307.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "chunkyround",
    "source": {
      "kind": "program-v1",
      "digest": "90c88707be81b8fb278e2c80e3517c65ca8dffe4a55ef48c09378443439f256d",
      "fontId": "Gumdrop:700"
    },
    "paramsDigest": "6dd2a05711b2059ceb294ee26944113cde7610b6a178ba4be8ecdbe390d9bfcc",
    "digest": "db4b761876ce8ee9e017faf11dd63b40da3e5e22071a4dcbc0ed6f58a472530f",
    "ascent": 690,
    "descent": 276,
    "endCorrections": {}
  },
  {
    "styleId": "serif",
    "source": {
      "kind": "program-v1",
      "digest": "0d45a05590eeda204b40aef88fdd1826b213e6a2323c05dc459b3371b42c2f04",
      "fontId": "Almanac:500"
    },
    "paramsDigest": "5c4bc2f40d7490d0a9dd05adc826ac648b5d176e139ef0a25e3bf0a4336fe1a9",
    "digest": "4cff250bbc5a51a46f4f2444f9bac6be0f61fcdd87c8eb03c8dae5a36d0fb64e",
    "ascent": 770,
    "descent": 308,
    "endCorrections": {}
  },
  {
    "styleId": "oldstyle",
    "source": {
      "kind": "program-v1",
      "digest": "4461f5e4082015eef0b6704892c3139cd5a8532c6c383f5a3516840aed2bd35e",
      "fontId": "Vellum:400"
    },
    "paramsDigest": "8eef67481dc0327f8a84159557c8a7325939fac720b0d6347d6fbc81925aa05d",
    "digest": "b59f991fc5da1d8f802c9d20ac86b9ef3ce93aff199bc32333c67bf341c4f1e1",
    "ascent": 731,
    "descent": 292.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "didone",
    "source": {
      "kind": "program-v1",
      "digest": "c7626432b5ca3d74bfe4c88ffea0952041170d867257058192d37f90f60c9bfe",
      "fontId": "Couture:600"
    },
    "paramsDigest": "7ae8c0e64ccbf8571b9f53570de507e1e854b8499361aa8e8a2d14a5ae8e5176",
    "digest": "2cd33e0bcc165838b59d53cf8024a6c98b9ac16cd8684dfd96f06867ca0f1277",
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
      "digest": "01659817758dec44b00c680f4f069eb9b39cffc51a1872e146b4f475334e6f9a",
      "fontId": "Sonnet:400i"
    },
    "paramsDigest": "be10d0d3f492a5019ff8342357fc32c207aecca58674164023c63d6a50aef80d",
    "digest": "d520227f4a1c24174402694f8f46c82c04b1f962704bcafe7fc6f5eac4d1b1e5",
    "ascent": 708,
    "descent": 283.2,
    "endCorrections": {}
  },
  {
    "styleId": "fatface",
    "source": {
      "kind": "program-v1",
      "digest": "795d29a3a6e491aac6572a6cc8bef81350a2bd8ae80255d71b1ef5cb6fc3c91b",
      "fontId": "Ballyhoo:400"
    },
    "paramsDigest": "35e5f970ffd802620061f2375136b8bf07507fb7ca9b53bdca297edbc068280c",
    "digest": "81559bf3da54a3197ae595446d02ae452771a9c33f2b6a379a195dc0a6d4ead1",
    "ascent": 700,
    "descent": 280,
    "endCorrections": {}
  },
  {
    "styleId": "softslab",
    "source": {
      "kind": "program-v1",
      "digest": "a0dbeafa7e140d7bc305edcce624a1726936c7b3a0b56b93c6f8bfe76f769e46",
      "fontId": "Hearth:600"
    },
    "paramsDigest": "edf8494925ddf2410234ae9a5f3187fac0579a7bd8bfd78b441a7b2fbd51d532",
    "digest": "282f425802128c6d4c2f2fab4814c98c284a9ee32edac2e69113679558e9db00",
    "ascent": 711,
    "descent": 284.40000000000003,
    "endCorrections": {}
  },
  {
    "styleId": "woodtype",
    "source": {
      "kind": "program-v1",
      "digest": "9b1bd451880186dbc5a286dad3cde3780a13b2e2385a8151e34ae49b57f2e365",
      "fontId": "Timber:400"
    },
    "paramsDigest": "524eaf50025f242bffef6cce520caec38e9c9ee1d2e6a3370ab1802f9566159b",
    "digest": "48b14d45a87612e91992e96b21436747c92a1bd610a73de8dfd005771ea722fe",
    "ascent": 778,
    "descent": 311.20000000000005,
    "endCorrections": {}
  },
  {
    "styleId": "code",
    "source": {
      "kind": "program-v1",
      "digest": "c9ebdd35401bb135c8855290fc73eee6c7d15bab1d8992c5c656ee3a06987d03",
      "fontId": "Kernel:500"
    },
    "paramsDigest": "e05d1fc96576e0e14469f08bf2683f2f7f583682569ddd1fd4f17c03a56299fc",
    "digest": "7211c11deac2bf805dc67fce5a77d408c2d26e96bbc2f3abe7d3c0e5401fade7",
    "ascent": 698,
    "descent": 279.2,
    "endCorrections": {}
  },
  {
    "styleId": "typewriter",
    "source": {
      "kind": "program-v1",
      "digest": "b71ffb6a695f2bd9a8f2ce05d72502e5b643e55bca0413f97317561ce5b45971",
      "fontId": "Dispatch:400"
    },
    "paramsDigest": "107edb30cc2aab2e09ed8610c5c7bb65d3faa0e34309626e4d4239441f0f775b",
    "digest": "ec7b71a4d50781a58591db19c9cf7a2c72a9ee9f26762a762a2de69fc3b45bee",
    "ascent": 568,
    "descent": 227.20000000000002,
    "endCorrections": {}
  },
  {
    "styleId": "comic",
    "source": {
      "kind": "program-v1",
      "digest": "a120fc1edb7ee4a9afc1e51f054903160bf419c68589e102271220f82f994401",
      "fontId": "Funnies:400"
    },
    "paramsDigest": "40449889a0e1205d264a3a1bf713a07c09c955dc7863a1be42ac6993e6b71bf3",
    "digest": "a82679c101871ed09735ca823e909c5863eb7761d57f64e03e6c5c2a9b2f8584",
    "ascent": 782,
    "descent": 312.8,
    "endCorrections": {}
  },
  {
    "styleId": "casual",
    "source": {
      "kind": "program-v1",
      "digest": "6816ab7b2e5a027610245b27e0ef41b9bc9a5f80b9496872107d252abef27dae",
      "fontId": "Jotter:400"
    },
    "paramsDigest": "03972f9a7a0b1c95ee8ee096c2743a190cfeef60c40f94d2d666dc7c6615a095",
    "digest": "43305cfc7281c6b067f40f82365cb168999be07ece870e9ec6bcce1e583f4dae",
    "ascent": 606,
    "descent": 242.4,
    "endCorrections": {}
  },
  {
    "styleId": "informal",
    "source": {
      "kind": "program-v1",
      "digest": "e075548b814728d6b056749b248bc576c0a7e220044066d80a3e7d26145cc8a1",
      "fontId": "Boardwalk:400"
    },
    "paramsDigest": "0fe115308f8e28ec7be25a505dd10af8c0ceeaee3571aa5c0d37bac9c173e2d5",
    "digest": "f028d25146f94a4b7631086d7814c83b44a0e1253e0e658292fe8b10be022baa",
    "ascent": 822,
    "descent": 328.8,
    "endCorrections": {}
  },
  {
    "styleId": "chancery",
    "source": {
      "kind": "program-v1",
      "digest": "774127758a96e90bc23e19a4e1f184789899714c66ed79478dfd5081962e4cac",
      "fontId": "Serenade:400"
    },
    "paramsDigest": "af446a987face1b49cf539b2a7d98551bb43b757e57565da3e62d81c811cabfd",
    "digest": "91210b144dfd044aad9f77365608689e711e79f29af68d86d448bcb243cf4391",
    "ascent": 750,
    "descent": 300,
    "endCorrections": {}
  },
  {
    "styleId": "blackletter",
    "source": {
      "kind": "program-v1",
      "digest": "bf2b627c34ac223970026211c24752b27813178bf68f7bda280aaf52f2408d33",
      "fontId": "Cathedral:400"
    },
    "paramsDigest": "c3ea6e8c4926dfce25df4a215c3d9a529c9ae8ca0483f06ed91c86b44448ec4e",
    "digest": "ee41693be97efbfcecc6e574f659e321a3084baaf8fc2470b984b7eb196bbbaa",
    "ascent": 694,
    "descent": 277.6,
    "endCorrections": {}
  },
  {
    "styleId": "block",
    "source": {
      "kind": "program-v1",
      "digest": "ca954f955bc58a9e25eac8dc7398542c7a3a8d457c9a45d46f2bcf342be7a804",
      "fontId": "Bulwark:700"
    },
    "paramsDigest": "3a575feb711d976d12a3eb3cf2287679ba2bd6f6db6ea9f76e9643e078327e7f",
    "digest": "76bba178c1142206ede58ee0fa804d110a2251541c12fde3f9f13f7fb0acc1a9",
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
