# lunhui-jsDelivr

Runtime assets for the Japanese edition of the SillyTavern character card
**輪廻戦場 再構築版 V3.6.9-JP** (Japanese derivative of「轮回战场 重构版 V3.6.9」).

Served through jsDelivr GitHub delivery:

```text
https://cdn.jsdelivr.net/gh/Frank0200/lunhui-jsDelivr@main/<file>
```

## Contents

| File | Bytes | Status |
| --- | ---: | --- |
| `mvu_zod.js` | 4,705 | Vendored from `StageDog/tavern_resource@dist/util/mvu_zod.js` — the exact revision the card imports. |
| `bundle.js` | 573,158 | Vendored from `MagicalAstrogy/MagVarUpdate@artifact/bundle.js` (build `2026-10-01 17:28`, commit `6527d5c`) — the exact revision the card imports. |
| `结算任务美化.html` | 143,929 | **Japanese** (localized). |
| `辅助计算脚本.js` | 122,639 | **Japanese** (localized). |
| `开局.html` | 215,473 | **Japanese** (localized) — the character-creation wizard, including the full item/skill/world catalogue. |
| `悬浮球状态栏.js` | 728,243 | **Japanese** (localized) — the floating-ball status bar / 主神端末 HUD. |
| `世界推进系统.js` | 673,120 | **Japanese** (localized) — the standalone world-engine panel. |

Files marked "mirror" are byte-for-byte copies of
`Unspoken-MomoTea/Battlefield-of-Reincarnation@main/dist/V20260916/`, re-hosted here so the
Japanese edition keeps identical runtime behaviour while the remaining surfaces are
localized. **Pushing the repository now is safe and useful**: every file is self-consistent,
the URLs never change, and updated Japanese files simply overwrite the same names later.

Localization boundary used throughout: **display chrome is Japanese, the protocol layer is
byte-identical Chinese.** Worldbook trigger tokens (`【结算任务】`, `【选择世界】`,
`【主神任务】`, `【晋升试炼任务】`…), worldbook entry names, MVU variable paths, enum values
and every parsing regex stay Chinese on purpose, because the worldbook content that
produces those tokens is not localized. Localizing only one side would silently break
triggering, so the pair must move together in a later phase.

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
