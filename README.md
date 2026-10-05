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
| `mvu_zod.js` | 4,705 | Vendored from `StageDog/tavern_resource@dist/util/mvu_zod.js` — the exact revision the card imports. Unmodified. |
| `bundle.js` | 601,243 | Vendored from `MagicalAstrogy/MagVarUpdate@artifact/bundle.js` (build `2026-10-01 17:28`, commit `6527d5c`) — the exact revision the card imports. **Modified** — Japanese localization of the embedded i18n table only; carries an Apache-2.0 §4(b) change notice. |
| `bundle.js.LICENSE.txt` | 107 | The upstream build's own third-party license notices (pinia v3.0.3, MIT), mirrored byte-for-byte from `MagicalAstrogy/MagVarUpdate@artifact/bundle.js.LICENSE.txt`. This is the file the banner at the top of `bundle.js` refers to. |
| `结算任务美化.html` | 143,929 | **Japanese** (localized derivative). |
| `辅助计算脚本.js` | 122,639 | **Japanese** (localized derivative). |
| `开局.html` | 215,788 | **Japanese** (localized derivative) — the character-creation wizard, including the full item/skill/world catalogue. |
| `悬浮球状态栏.js` | 728,415 | **Japanese** (localized derivative) — the floating-ball status bar / 主神端末 HUD. |
| `世界推进系统.js` | 673,120 | **Japanese** (localized derivative) — the standalone world-engine panel. |

The five UI files are **Japanese-localized derivatives** of
`Unspoken-MomoTea/Battlefield-of-Reincarnation@main/dist/V20260916/`. They are re-hosted here
under the same file names with the same DOM structure, CSS, script logic, event timing and
dependency architecture as the source, so the Japanese edition renders identically; the only
changes are to visible UI text, which is now Japanese. **Pushing the repository now is safe and
useful**: every file is self-consistent, the paths never change, and updated Japanese files
simply overwrite the same names later.

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
* `bundle.js` — upstream `MagicalAstrogy/MagVarUpdate`. **Changed by Frank0200**: only the
  string *values* of the embedded i18n table were translated into Japanese — 459 `zh-CN` and
  455 `en` values, 914 of 4,252 string literals. Stripping the contents of every string
  literal from both the upstream artifact and this file leaves a byte-identical
  131,528-byte code skeleton, the literal count is unchanged, no key was renamed, and no
  code logic was touched. Apache License 2.0 §4(b) requires a prominent notice that the file
  was changed; that notice is the second line of `bundle.js`, directly beneath the upstream
  license banner, and the banner itself is unaltered. The file also still carries its
  embedded `bundle.js.map` reference, which resolves only when a source map is published
  upstream.
* `bundle.js.LICENSE.txt` — upstream `MagicalAstrogy/MagVarUpdate`. Kept unmodified
  (byte-for-byte); it records the third-party notices the upstream build emitted.
* The five UI files are localized derivatives of the original author's work
  (`Unspoken-MomoTea/Battlefield-of-Reincarnation`). Copyright in the original work remains
  with that author; this repository only adds a Japanese localization of visible UI text,
  and the files are re-hosted here for interoperability with the Japanese edition.
* `LICENSE` — Apache License 2.0, matching the layout used by the other
  `Frank0200/*-jsDelivr` repositories.

## Note on `@main`

URLs pin `@main`, matching the convention already used by `Frank0200/40k-jsDelivr` and
`Frank0200/pkman-jsDelivr`. `@main` is mutable: any future commit to this repository
changes what live cards load. Switch to an immutable tag before a wide release if that
risk matters.
