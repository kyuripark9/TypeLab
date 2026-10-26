# Weight masters

This pass creates usable weight variations for all 22 bundled styles. Each style gets the range its drawings can support. Alternate letterforms and decorative effects remain separate work.

- [x] Ground the source engine, saved references, Points and export contracts.
- [x] Compare source-compatible offset, monotone coordinate-map and original-family master approaches.
- [x] Recover the original designed weights where they match the source artwork; otherwise author explicit compatible geometry and review it.
- [x] Package immutable masters with source provenance, licences, correspondence and reviewed ranges.
- [x] Add a separate versioned master interpreter. Existing outline-v1 documents keep their appearance and can explicitly enable weight variations.
- [x] Expose Weight and supported family exports only for packages that pass the checks.
- [x] Verify original style identity, interpolation, dot gaps, joins, counters, editing and OTF output. Review complete alphabets and text specimens.
- [x] Run regression checks, verify the editor and document actual coverage.

The weight milestone is implemented. Broader feature parity continues in [the capability plan](feature-parity.md), including designed widths, semantic letter-part controls, alternate forms, effects, and accents.

The original artwork identifies Roboto 600, Roboto Slab 600 and Playfair Display 600 as the starting sources. Recovering their authored variations is preferable to approximating type design through contour offsets. Geometry correspondence and differences from the sheets must be measured before accepting those weights.

The rejected alternatives remain useful evidence. Independent contour offsets can open holes where source contours overlap. Smooth whole-ink flows can change topology when represented by poorly approximated cubics. Monotone coordinate maps preserve topology but can make rounds pointed or distort dots. Passing a topology check alone does not establish optical quality.
