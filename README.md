# lunhui-jsDelivr

Runtime assets for the Japanese edition of the SillyTavern character card
**輪廻戦場 再構築版 V3.6.9-JP** (Japanese derivative of「轮回战场 重构版 V3.6.9」).

Served through jsDelivr GitHub delivery:

```text
https://cdn.jsdelivr.net/gh/Frank0200/lunhui-jsDelivr@main/<file>
```

## Contents

| File | Bytes | Origin |
| --- | ---: | --- |
| `mvu_zod.js` | 4,705 | Vendored from `StageDog/tavern_resource@dist/util/mvu_zod.js` — the exact revision the card imports. |
| `bundle.js` | 573,158 | Vendored from `MagicalAstrogy/MagVarUpdate@artifact/bundle.js` (build `2026-10-01 17:28`, commit `6527d5c`) — the exact revision the card imports. |
| `开局.html` | 200,785 | Mirror of the source card's character-creation wizard. **Phase 1: original text, to be localized.** |
| `结算任务美化.html` | 140,510 | Mirror of the source card's settlement panel. **Phase 1: original text.** |
| `辅助计算脚本.js` | 109,285 | Mirror. **Phase 1: original text.** |
| `悬浮球状态栏.js` | 673,911 | Mirror. **Phase 1: original text.** |
| `世界推进系统.js` | 636,210 | Mirror. **Phase 1: original text.** |

The five UI files are mirrored byte-for-byte from
`Unspoken-MomoTea/Battlefield-of-Reincarnation@main/dist/V20260916/` so the Japanese
edition keeps identical runtime behaviour while the card-internal surfaces are localized.
They are re-hosted here because card-controlled runtime files must live in a repository
owned by the card's publisher, and because the original repository cannot be modified.

The two libraries are vendored at the **exact revisions the card imports**, not at newer
versions, so that library behaviour does not change as part of localization.

## Provenance and licensing

* `mvu_zod.js` — upstream `StageDog/tavern_resource`. Kept unmodified.
* `bundle.js` — upstream `MagicalAstrogy/MagVarUpdate`. Kept unmodified; it is an
  unmodified upstream build artifact and carries its own embedded `bundle.js.map`
  reference, which resolves only when a source map is published upstream.
* The five UI files remain the property of their original author
  (`Unspoken-MomoTea/Battlefield-of-Reincarnation`). They are mirrored, unmodified, for
  interoperability with the Japanese edition.
* `LICENSE` — Apache License 2.0, matching the layout used by the other
  `Frank0200/*-jsDelivr` repositories.

## Note on `@main`

URLs pin `@main`, matching the convention already used by `Frank0200/40k-jsDelivr` and
`Frank0200/pkman-jsDelivr`. `@main` is mutable: any future commit to this repository
changes what live cards load. Switch to an immutable tag before a wide release if that
risk matters.
