# Source texture

Current source programs can pin `source-texture-v1` in their finish policy. Hand-drawn (`wobble`) and Rough edges (`rough`) are independent absolute amounts; zero is an exact no-op. New styles and program adoption initialize both to zero.

The finished ink passes through a continuous horizontal shear followed by a vertical shear for each active frequency band. Every point at the same position receives the same displacement, including attachment boundaries and separate contours. Each shear has an exact inverse and determinant one, so the underlying field cannot tear a join, collapse a counter, or reverse orientation. The fitted cubic output still needs the deferred geometric and optical review.

Hand-drawn reaches 0.9% of cap height with a 42%-cap wavelength. Rough edges reaches 0.09% with a 1.8%-cap wavelength. Rough edges changes the contour rather than removing ink chips. Policy parsing bounds each band's displacement and slope. A policy-owned seed and glyph identity select stable phases; enabling a second band does not reseed the first. Preview, saved designs, and export use the same evaluator.

The curve compiler transports endpoint tangents through the field's Jacobian, subdivides to at most one eighth of the shortest wavelength, and samples the cubic fit against a 0.004-font-unit tolerance. Its 65,536-work-segment budget and depth bound produce a typed, recoverable effect error rather than a partial drawing. These sampled bounds are not a continuous error proof.

Texture runs before Slice and the selected material. Advances stay unchanged, editable Points retain their clean source curves, and ascent/descent include the maximum displacement, including per-letter Hand-drawn overrides. Active texture uses fractional CFF coordinates. Recovery can disable both textures across the font and per-letter overrides while preserving drawings, or undo the last change.

Implementation checks cover exact neutral identity, repeatable finite output, closed contours, and compilation. Full parameter sweeps, all-style text specimens, saved Points interactions, and browser/export review are deferred to the testing pass.
