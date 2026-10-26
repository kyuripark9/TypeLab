/* One immutable correspondence per exact original-outline and first-master pair. */
import type { MasterSourceRef, OutlineSourceRef } from './model';
import type { OutlineMasterMapRef } from './program';

export interface OriginMapInfo { ref: OutlineMasterMapRef; from: OutlineSourceRef; to: MasterSourceRef }
export const ORIGIN_MAP_REVISIONS: readonly OriginMapInfo[] = [
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "a7fe3327fa2cdef62ff20e208c1ac89f46ccbbe69a238261c7957d64b9ebf073",
      "fontId": "Almanac:500"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "1e88ba172d6cf23b7fa0b83d1780ae45685e043daedad44549191a55bd941800",
      "fontId": "Almanac:500"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "7d9763e7bc6cb7a98fbf56eec740d3562e17695888517ef8b41480b61ab76626",
      "fontId": "Almanac:500"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "edbcf5f8ed12e858c7a13e8062f3b4f023dd9304066ec1756a11bb33de5319a3",
      "fontId": "Ballyhoo:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "a932fd59c3cc30c5bb2764dd961ef7f91772a219e8ced1e4abcc00d17fea1d42",
      "fontId": "Ballyhoo:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "30648f5f599154f5393cf7d533881d4174376a21e26a96d30c9394ae1fc247ab",
      "fontId": "Ballyhoo:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "352d355ba49ab9454a1f3d9b6e42fea496af49842d361b97778cb37927e51ba9",
      "fontId": "Boardwalk:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "e86e9bb8de0f75e1118894bad5f96f857ad1d4f305e6942dbd8b994cfe90f1f6",
      "fontId": "Boardwalk:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "9b2eb66ea10d73d5829d753a25c887071fd466b5152178c508f3fefb87b1406b",
      "fontId": "Boardwalk:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "d96264c9923760c63629bfd80cf685da1141d5204fd03656d3e24852152f4467",
      "fontId": "Bulwark:700"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "340d6c1566c754ff5ea0d90fdac2f77ab988393c6c62d6b4f421aabd64ea1ed3",
      "fontId": "Bulwark:700"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "f6ff9d219c8dd03f29b36f30acb13767530de4a8197f61c481eef19166848ed5",
      "fontId": "Bulwark:700"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "ede557d99638ec0ca26584218ce3b74d2ffd89dafa7e0647e04098aea26550eb",
      "fontId": "Cathedral:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "feba4842866ac4dcd356e137b6891d7ad4685baa1be419ead699e158b11f0eee",
      "fontId": "Cathedral:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "783a5a5cdc77d95ce7e0212a5899de26851ff1cc261ffe4b899c093a4849bc06",
      "fontId": "Cathedral:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "ccf3fb017ec7d812d2d82a7f5721a14cc75d708ca06ecdd617e5f7646e895ede",
      "fontId": "Compass:300"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "552a68b0a230d7344c6e538c0367d4a4182fef80ef3085034f676d50f3c93baf",
      "fontId": "Compass:300"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "01baf750ad45fa49fe3cf3fb768cd729534a416d0c63407ce179763aed49f91d",
      "fontId": "Compass:300"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "f97788a9a7d4bba072f887979bc45e13f653c523e3c66de1de8631afa9f9a8ed",
      "fontId": "Cotton:300"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "5de06410779deca73e7248a42dd2f629e2fa9853b2532dbe6fd18b597d37fb47",
      "fontId": "Cotton:300"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "bbef63cb6315effcfd88971ea84aa20324700567c771b1ddbbc7e6ae215682c4",
      "fontId": "Cotton:300"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "41040fb88ee480c95a694a0eb3c4ef88f5c2b01e212a48e0d1205b9a0cb54dc7",
      "fontId": "Couture:600"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "a743231893ba1e3c471e1bfa2bfed2bb7768b4863000854413e7b96712281d58",
      "fontId": "Couture:600"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "3c4dfe69b87c432a1d1938e53099ac0620eaa3f75a656dc08309d2eace9d5b89",
      "fontId": "Couture:600"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "57f4da663c96a6c36b18a6875703acfb4693d842132c90fe1570a1ad45c9ada3",
      "fontId": "Dispatch:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "2a837e87780f1c6f17a10f23cfc6173c5807da5685b66f50a475539c1d9274f1",
      "fontId": "Dispatch:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "c9f822303b920e03051563dd11d6792e18af9a42a4e015d44737b85003107f2c",
      "fontId": "Dispatch:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "95c508f35001fb3b6b44a6586ba03976e7925b2eef08fcbebc2fef7a477f1c09",
      "fontId": "Funnies:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "dea1b0739e641d4da7c878181885b402f6cec2de792102601cdc4ea5ab74c1d1",
      "fontId": "Funnies:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "f5ab2b02de6583bdf4255d3aeb25127df0459d53e44b2996ff152a47dc0dd761",
      "fontId": "Funnies:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "dd564576d892d66bab1ef66051ad69dd1ea7f04b89304532ce602c4dcce81414",
      "fontId": "Gumdrop:700"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "d2558f23006bf2fa5dcca491e00dc1050bf2d57358c4ab81d04a96e491611b2b",
      "fontId": "Gumdrop:700"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "73a3ea6fabc80057f93f0e61739973da35ed789fa08b1980af73a7e91a7b8d0c",
      "fontId": "Gumdrop:700"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "7207f24d6c2d256f9b08631897c58bf277c54e2a4ab57a4e835edef1255fad7b",
      "fontId": "Hearth:600"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "1bb3719536d0b63d06f5fc081dc22149c6c6a867fb80d30cde6900e6aa4f4cc4",
      "fontId": "Hearth:600"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "a5b2b12dbd85c33f2619533efb9309a27cabb3b95a07890bbd54d22675fda623",
      "fontId": "Hearth:600"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "ef36fe3f8bfe3d52a1eb2ece666c032b768128332306da07f35ce1c36fbf8192",
      "fontId": "Jotter:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "9140ce5613eb89165b23f8cf655a3e6c738ea6374248c78bc3d88fd65a4e5082",
      "fontId": "Jotter:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "6cb627262b5aab591f2d5ac2a4e6ccc6d3aafe776037d7a72852426a078edf89",
      "fontId": "Jotter:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "d1edc4b847fdfdf5a5f7869f78cbf7ac7ec5ae44025548ea9cf308da46e55994",
      "fontId": "Kernel:500"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "148815302716f99a57ce4ee13edc167fa5fee3baa81387b705a22f200a375cb2",
      "fontId": "Kernel:500"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "edf4313600883ebd93ff0f398e95ade1d952bbc3d4fa79ef3e2c9a8f27bc654f",
      "fontId": "Kernel:500"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "809239ddc57742c1c7526b73b81f392aec4b829c2454a3fc01949913ae66c743",
      "fontId": "Mainline:600"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "e25df3eccf1f1e498264f6232907f9c46e00b4c1d2afc33cd41f18ffa9bf9250",
      "fontId": "Mainline:600"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "44ce1daebc31f46d098f0f37a84023aba0f2689404d5aa529a8c0bcb261d3033",
      "fontId": "Mainline:600"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "29fe10559d0a70c31c378bdd3d4bca47e333086923dcb1e56c4b216f0de35c12",
      "fontId": "Orbital:600"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "a6fbb24a6752a93e1ecbda250e05f6974eb812733b348bf0a694ec980e32f15a",
      "fontId": "Orbital:600"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "4a6962ffca3871797860ddefdfacb14ae9a30f01300c40c71f7ac4203e98689b",
      "fontId": "Orbital:600"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "525aa724bf0db758657e7c83b9ae7b2bd31d20a2bc30baa5d76860d55d5b65ad",
      "fontId": "Parlance:500"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "e859f4ecf83097411e5b2ac2a59fa4457898afd8992f1b66c06bf019dd8b5f9c",
      "fontId": "Parlance:500"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "3f5e7e22afe6910db983a6532ae90df62aa3b3611b2698f4caedd34193ee5b95",
      "fontId": "Parlance:500"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "1db44453b42417d719327493ebd0088e593ee949f0790ba2295592024ce33960",
      "fontId": "Serenade:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "9acdea1f08cd809a7d3020098175581adc725d54efcd45077ff2330931e8f147",
      "fontId": "Serenade:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "b14ef9c968068311f01f20a0eb664afab87e0ceed02b71067ee640301862081b",
      "fontId": "Serenade:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "874d24275af303ba58d5b43d37b340a7ff61def67f289d914019fe35cf270b5a",
      "fontId": "Sonnet:400i"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "7a841c89c6d8e76a396ded16f0d961b24fbda45acb45d984dc0eb9e48ab2c9f2",
      "fontId": "Sonnet:400i"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "160daa6aaeeed615152244759f3d27c62a274de63015ffe1f0b4052a74839905",
      "fontId": "Sonnet:400i"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "993aeea8525f6d5b9487c2b7e18577475c95cc37d6cc2dae0bc325a6256c66ef",
      "fontId": "Timber:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "87c8d705282e3e8e616a0e542ed6a52cca18d570e7a380a52224f12959134fb2",
      "fontId": "Timber:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "6289d00b276b5bf14cc6d8bed7c0181694bad3462858e7df95e0e0be4a2b3730",
      "fontId": "Timber:400"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "6d06ecb1ebc0a68bebebcbaad57ac0641a0f9e88732695a52724c5e501e12e67",
      "fontId": "Turnpike:500"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "7bbb4db5a4f8f5cb8412806ce4f18d7a2259dfb1c0f4eff3381884e90c36fbf9",
      "fontId": "Turnpike:500"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "6eb346c64e6be82aaab845475c9630d4e730d4fce3a13fb34533142113bac98c",
      "fontId": "Turnpike:500"
    }
  },
  {
    "ref": {
      "kind": "outline-master-map-v1",
      "digest": "b4a5c7e148e5783ff464326a206d5035e7d494a3fca533928569161d5f7afcf7",
      "fontId": "Vellum:400"
    },
    "from": {
      "kind": "outline-v1",
      "digest": "4792c42fdcd5497e632d3360ccbfe6a706fad0caabb6272b7211a9a4724bee5f",
      "fontId": "Vellum:400"
    },
    "to": {
      "kind": "masters-v1",
      "digest": "c72eda230c2c2d7e7489bc6ab119c3d6468b5ee7ae1c56c3ee5efd33762249c9",
      "fontId": "Vellum:400"
    }
  }
];

export function originMapInfo(ref: OutlineMasterMapRef): OriginMapInfo | undefined {
  return ORIGIN_MAP_REVISIONS.find(m => m.ref.digest === ref.digest && m.ref.fontId === ref.fontId);
}
export function originMapFor(from: OutlineSourceRef, to: MasterSourceRef): OriginMapInfo | undefined {
  return ORIGIN_MAP_REVISIONS.find(m => m.from.digest === from.digest && m.to.digest === to.digest
    && m.from.fontId === from.fontId && m.to.fontId === to.fontId);
}
