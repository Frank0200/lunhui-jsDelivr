/* * ==========================================================================
 * [輪廻空間] 主神端末システム UI (Samsara Destiny UI) v2
 * 再構築の特徴：
 *   - マルチテーマ切替(ナイト/クリムゾン/インディゴ/パーチメント) data-theme + CSS変数で実現
 *   - データ編集モード(インラインエディタ→MVUへ代入: replaceMvuData)
 *   - トップバー(時間・場所 + 更新/設定/閉じる) + 中央(アバター/名称/階層 + HP/EP/THP) + 下部ステータスアイコン列
 *   - 左側Tab(任務/情報/所持/血統/関係/経営/噂/世界) + 右側コンテンツ
 *   - ポップアップ式のステータス詳細とアイテム詳細
 *   - 全フィールドをZOD Schemaに合わせてレンダリング
 * ==========================================================================
 */
(function () {
    'use strict';
    try { console.log('%c[主神端末] ⚡ 輪廻端末 v2 接続中...', 'color:#8f9fff;font-weight:bold'); } catch (e) {}

    /* ===== 1. 親ウィンドウへのリダイレクト ===== */
    var GS_PARENT = (function () {
        try { if (window.parent && window.parent !== window && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
        try { if (window.top && window.top !== window && window.top.document && window.top.document.body) return window.top; } catch (e) {}
        return window;
    })();
    var $ = (GS_PARENT.jQuery || GS_PARENT.$ || window.jQuery || window.$);
    var document = GS_PARENT.document;
    var _ = (function () { try { return GS_PARENT._ || window._; } catch (e) { try { return window._; } catch (e2) { return undefined; } } })();

    /* 現在の酒場 Persona：ステータスバー内部および他の Samsara モジュールと同一のプレイヤー身元を共有する。 */
    var PLAYER_NAME = '';
    function refreshPlayerName() {
        try {
            var tavern = GS_PARENT && GS_PARENT.SillyTavern;
            var context = tavern && typeof tavern.getContext === 'function' ? tavern.getContext() : null;
            PLAYER_NAME = String((context && context.name1) || (tavern && tavern.name1) || '').trim();
        } catch (e) {
            PLAYER_NAME = '';
        }
        try {
            GS_PARENT.Samsara = GS_PARENT.Samsara || {};
            GS_PARENT.Samsara.playerName = PLAYER_NAME;
            GS_PARENT.Samsara.getPlayerName = getPlayerName;
            GS_PARENT.Samsara.refreshPlayerName = refreshPlayerName;
        } catch (e2) {}
        return PLAYER_NAME;
    }
    function getPlayerName() {
        return PLAYER_NAME || refreshPlayerName();
    }
    function isPlayerIdentity(value) {
        var text = String(value == null ? '' : value).trim();
        if (!text) return false;
        var playerName = getPlayerName();
        return (!!playerName && text === playerName)
            || text === '<user>'
            || text === '{{user}}'
            || text === '玩家';
    }
    function canonicalPlayerIdentity(value) {
        var text = String(value == null ? '' : value).trim();
        return isPlayerIdentity(text) ? (getPlayerName() || text) : text;
    }
    function displayPlayerIdentity(value) {
        var text = String(value == null ? '' : value).trim();
        return isPlayerIdentity(text) ? (getPlayerName() || '玩家') : text;
    }
    refreshPlayerName();

    /* ===== 2. 状態ストレージ設定 ===== */
    var SAM_CONFIG = {
        pos: 'samsara_ball_pos_v2',
        open: 'samsara_panel_open_v2',
        theme: 'samsara_theme_v2',
        tab: 'samsara_tab_v2',
        edit: 'samsara_edit_v2'
    };

    /* ===== 3. テーマ定義 ===== */
    var THEMES = {
        'night':   { name: 'ナイト', accent: '#8f9fff', hp: '#e4587d', thp: '#e5c166', ep: '#5d97ff', bg: 'rgba(14,19,32,0.88)', card: 'rgba(22,30,46,0.7)', border: 'rgba(143,159,255,0.28)', text: '#f3f5f8', sub: '#8b95a6', dark: '#07090e' },
        'crimson': { name: 'クリムゾン', accent: '#ff5f57', hp: '#ff4757', thp: '#ffa502', ep: '#5b8cff', bg: 'rgba(28,12,16,0.9)', card: 'rgba(46,18,24,0.72)', border: 'rgba(255,95,87,0.3)', text: '#fff0f3', sub: '#b08896', dark: '#0e0406' },
        'indigo':  { name: 'インディゴ', accent: '#7c5cff', hp: '#ff6b8a', thp: '#ffd166', ep: '#4dabff', bg: 'rgba(14,16,38,0.9)', card: 'rgba(28,30,58,0.72)', border: 'rgba(124,92,255,0.32)', text: '#eef0ff', sub: '#9094c0', dark: '#06081a' },
        'parchment': { name: 'パーチメント', accent: '#a8761e', hp: '#c0392b', thp: '#d4a017', ep: '#2c6fbb', bg: 'rgba(245,235,210,0.95)', card: 'rgba(235,222,190,0.8)', border: 'rgba(168,118,30,0.35)', text: '#3a2a14', sub: '#7a6440', dark: '#e8d8b8' },
        'sakura':   { name: 'サクラ', accent: '#ff80ab', hp: '#e91e63', thp: '#ffb300', ep: '#42a5f5', bg: 'rgba(255,240,245,0.95)', card: 'rgba(255,224,233,0.82)', border: 'rgba(255,128,171,0.36)', text: '#3d1e2a', sub: '#8a6172', dark: '#f7d4e0' },
        'matcha':   { name: '抹茶', accent: '#66bb6a', hp: '#ef5350', thp: '#ffa726', ep: '#26c6da', bg: 'rgba(238,246,232,0.95)', card: 'rgba(224,240,210,0.82)', border: 'rgba(102,187,106,0.34)', text: '#1f3320', sub: '#5a7560', dark: '#d6ecc8' }
    };
    var THEME_ORDER = ['night', 'crimson', 'indigo', 'parchment', 'sakura', 'matcha'];

    /* ===== 4. 保護(読み取り専用)フィールド定義 ===== */
    var READONLY_PATHS = [
        'キャラ.HP_MAX', 'キャラ.EP_MAX', 'キャラ.最終属性', 'キャラ.階層',
        'キャラ.現在形态', 'キャラ.形態庫',
        '世界.安定', '世界.現在ラウンド', 'システム状態.現在ラウンド'
    ];
    /* 階層閾値表: F→E→D→C→B→A→S→SS→SSS (下限値; 階層が上がるのは昇格任務のみ, そのためプログレスバーは進捗のみ表示し自動昇格しない) */
    var TIER_THRESHOLDS = [
        {tier:'F',   min:0},
        {tier:'E',   min:30},
        {tier:'D',   min:100},
        {tier:'C',   min:300},
        {tier:'B',   min:1000},
        {tier:'A',   min:3000},
        {tier:'S',   min:10000},
        {tier:'SS',  min:30000},
        {tier:'SSS', min:100000}
    ];
    /* 装備装着スロット設定: type=装備タイプ列挙インデックス, cap=スロット上限(0は無制限で特殊など);
       cap>=2 で満杯なら装着を拒否; cap===1 は装着時に同タイプの装備済みを置換; cap===0 は無制限;
       renderEquipSlotsBar と handleItemAction がこの表を共用, 上限変更は一箇所で済む */
    var EQUIP_SLOTS = [
        {label:'武器', type:0, cap:2},
        {label:'手袋', type:1, cap:1},
        {label:'頭部', type:2, cap:1},
        {label:'胸部', type:3, cap:1},
        {label:'脚部', type:4, cap:1},
        {label:'靴', type:5, cap:1},
        {label:'マント', type:6, cap:1},
        {label:'アクセサリー', type:7, cap:2},
        {label:'世界遺物', type:8, cap:0}
    ];
    /* アイテム戦術スロット上限 */
    var ITEM_SLOT_CAP = 5;
    /* 血統数上限( EQUIP_SLOTS / ITEM_SLOT_CAP と同じモジュール定数, データベースには書き込まない) */
    var BLOODLINE_CAP = 1;
    function isReadonlyPath(path) {
        if (!path) return false;
        // 完全一致 + 前方一致(最终属性のサブフィールド、NPC階層など)
        for (var i = 0; i < READONLY_PATHS.length; i++) {
            var rp = READONLY_PATHS[i];
            if (path === rp || path.indexOf(rp + '.') === 0) return true;
        }
        // NPC の HP_MAX / EP_MAX / 最终属性 / 层级
        if (/^关系列表\.[^.]+\.HP_MAX$/.test(path)) return true;
        if (/^关系列表\.[^.]+\.EP_MAX$/.test(path)) return true;
        if (/^关系列表\.[^.]+\.最终属性/.test(path)) return true;
        if (/^关系列表\.[^.]+\.层级$/.test(path)) return true;
        // 装備/スキルの"类型"は数値列挙(武器/胸部/.../主动/被动/特殊), ユーザーが文字列に変更すると"未知"と解析されるため, 一律読み取り専用; (道具の"类型"は文字列なので, 編集可)
        if (/\.(装备|技能)\.[^.]+\.类型$/.test(path)) return true;
        return false;
    }

    /* B4_CURRENCY_KEY_COMPAT: 旧セーブの通貨キーを正規キーへ読み取り時に移行する。入力境界専用・冪等。 */
    var CURRENCY_KEY_CANONICAL = 'スペースコイン';
    var CURRENCY_KEY_LEGACY = '空间币';
    function normalizeLegacyCurrencyKey(character) {
        if (!character || typeof character !== 'object') return character;
        if (!Object.prototype.hasOwnProperty.call(character, CURRENCY_KEY_LEGACY)) return character;
        var legacy = character[CURRENCY_KEY_LEGACY];
        delete character[CURRENCY_KEY_LEGACY];
        if (character[CURRENCY_KEY_CANONICAL] === undefined || character[CURRENCY_KEY_CANONICAL] === null) character[CURRENCY_KEY_CANONICAL] = legacy;
        return character;
    }
    /* B3_SETTINGS_KEY_COMPAT: 旧セーブの設定キーを正規キーへ読み取り時に移行する。入力境界専用・冪等。 */
    var SETTINGS_KEY_CANONICAL = '単一世界';
    var SETTINGS_KEY_LEGACY = '単一世界';
    function normalizeLegacySettingsKey(settings) {
        if (!settings || typeof settings !== 'object') return settings;
        if (!Object.prototype.hasOwnProperty.call(settings, SETTINGS_KEY_LEGACY)) return settings;
        var legacy = settings[SETTINGS_KEY_LEGACY];
        delete settings[SETTINGS_KEY_LEGACY];
        if (settings[SETTINGS_KEY_CANONICAL] === undefined || settings[SETTINGS_KEY_CANONICAL] === null) settings[SETTINGS_KEY_CANONICAL] = legacy;
        return settings;
    }
    /* BATCH_A_CHARACTER_KEY_COMPAT: 旧セーブの 角色 コンテナを正規キーへ読み取り時に移行する。入力境界専用・冪等。 */
    var CHARACTER_KEY_CANONICAL = 'キャラ';
    var CHARACTER_KEY_LEGACY = '角色';
    function normalizeLegacyCharacterKey(stat) {
        if (!stat || typeof stat !== 'object') return stat;
        if (!Object.prototype.hasOwnProperty.call(stat, CHARACTER_KEY_LEGACY)) return stat;
        var legacy = stat[CHARACTER_KEY_LEGACY];
        delete stat[CHARACTER_KEY_LEGACY];
        if (stat[CHARACTER_KEY_CANONICAL] === undefined || stat[CHARACTER_KEY_CANONICAL] === null) stat[CHARACTER_KEY_CANONICAL] = legacy;
        return stat;
    }
    /* ===== 5. 旧インスタンスの事前クリーンアップ ===== */
    function samPreClean() {
        try {
            if ($) {
                $('#samsara-ball, #samsara-panel, #samsara-modal, #samsara-theme-style').remove();
                $(document).off('.sam .samPanel .samBall .samModal');
            }
            if (window.samsaraGuardTimer) clearInterval(window.samsaraGuardTimer);
        } catch (e) { console.warn('[主神端末] 事前クリーンアップ失敗:', e.message); }
    }
    samPreClean();

    /* ===== 6. データ取得 ===== */
    function getMvuGlobal() {
        try {
            if (typeof window.Mvu !== 'undefined') return window;
            if (typeof GS_PARENT.Mvu !== 'undefined') return GS_PARENT;
        } catch (e) {}
        return null;
    }
    function getStatData() {
        try {
            var win = getMvuGlobal();
            if (win && win.Mvu && typeof win.Mvu.getMvuData === 'function') {
                var r = win.Mvu.getMvuData({ type: 'message', message_id: 'latest' });
                if (r && r.stat_data) { normalizeLegacyCharacterKey(r.stat_data); normalizeLegacyCurrencyKey(r.stat_data.キャラ); normalizeLegacySettingsKey(r.stat_data.設定); return r.stat_data; }
                if (r) return r;
            }
            if (typeof GS_PARENT.getMessageVar === 'function') return GS_PARENT.getMessageVar('stat_data');
            if (typeof window.getMessageVar === 'function') return window.getMessageVar('stat_data');
        } catch (e) { console.warn('[主神端末] データ読み取り異常:', e.message); }
        return null;
    }

    /* ===== 7. MVUへの書き戻し(編集モード保存) ===== */
    /* opts.tierPermit: 角色階層の"昇格通行証"(ローマ数字の階層文字列, 例 'Ⅱ')
       "昇格開始"ボタンからのみ渡される; 補助計算スクリプトの tierPermitAllows() と連携して許可する
       replaceMvuData が非同期で発火する二回目の VARIABLE_UPDATE_ENDED における階層変化を許可し,
       さもなければ非同期イベントが __samsaraUIMutation のウィンドウ期から外れ, 変数ガードに AI 改ざんと見なされてロールバックされる → 昇格が"一瞬上がって戻る"現象になる */
    function writeBackMvu(mutator, opts) {
        var tierPermitInstalled = false;
        try {
            var win = getMvuGlobal();
            if (!win || !win.Mvu || typeof win.Mvu.getMvuData !== 'function' || typeof win.Mvu.replaceMvuData !== 'function') {
                console.warn('[主神端末] MVU書き戻しAPIを利用できません');
                return false;
            }
            // 最新の完全なデータ(stat_dataを含む)を取得 —— "更新前"スナップショット(before)とする
            var mvuData = win.Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            if (!mvuData || !mvuData.stat_data) { console.warn('[主神端末] 書き込み可能なデータなし'); return false; }
            // "更新前"データをバックアップ(ディープコピー, イベントコールバックの variables_before_update 引数用)
            var before = (_ && _.cloneDeep) ? _.cloneDeep(mvuData) : JSON.parse(JSON.stringify(mvuData));
            // lodashのディープコピーで元オブジェクトの直接汚染を回避(replaceMvuDataの正規チャネルを通す) —— "更新後"データ(after)とする
            var cloned = (_ && _.cloneDeep) ? _.cloneDeep(mvuData) : JSON.parse(JSON.stringify(mvuData));
            // ミューテータを適用(クローンした新データをその場で変更)
            if (typeof mutator === 'function') mutator(cloned.stat_data);
            // 書き込み前に昇格通行証を設定し，replaceMvuData が同期/非同期で発火するガードを上書きする。
            //   replaceMvuData は非同期で, 自身がもう一度 VARIABLE_UPDATE_ENDED(本関数を経由しない)を発火し,
            //   そのイベントでは __samsaraUIMutation が既にリセット済み → ガードが階層をロールバックする; 通行証がその非同期イベントを上書きする
            if (opts && opts.tierPermit) {
                try {
                    var permitObj = (win && typeof win === 'object') ? win : window;
                    permitObj.__samsaraTierPermit = opts.tierPermit;
                    if (GS_PARENT !== permitObj) GS_PARENT.__samsaraTierPermit = opts.tierPermit;
                    try { window.__samsaraTierPermit = opts.tierPermit; } catch(eT1) {}
                    tierPermitInstalled = true;
                } catch(eT2) {}
                // フォールバック削除: 20s 後に消費の有無にかかわらず失効(永続残留でガード免除が形骸化するのを防ぐ)
                setTimeout(function() {
                    try {
                        if (win && win.__samsaraTierPermit === opts.tierPermit) win.__samsaraTierPermit = null;
                        if (GS_PARENT.__samsaraTierPermit === opts.tierPermit) GS_PARENT.__samsaraTierPermit = null;
                        if (window.__samsaraTierPermit === opts.tierPermit) window.__samsaraTierPermit = null;
                    } catch(eT3) {}
                }, 20000);
            }
            try {
                GS_PARENT.__samsaraUIMutation = true;
                if (win !== GS_PARENT) win.__samsaraUIMutation = true;
            } catch(e4) { try { window.__samsaraUIMutation = true; } catch(e5){} }
            // message チャネルへ書き戻し
            win.Mvu.replaceMvuData(cloned, { type: 'message', message_id: 'latest' });
            // chat チャネルを同期
            try { win.Mvu.replaceMvuData(cloned, { type: 'chat' }); } catch (e2) {}
            // ★ 重要: VARIABLE_UPDATE_ENDED イベントを手動でブロードキャストし, (after, before) をリスナーへ渡す
            //   これにより"補助計算スクリプト"の onUpdateData(after, before) が一度走り, バックグラウンドで属性/HP/EPを再計算する
            //   イベントシグネチャは exported.mvu.d.ts:186 -> (variables, variables_before_update) => void を参照
            // ★ 今回の更新ソースを"UI操作"としてマークし, 補助計算スクリプトが戦闘ラウンド進行/クールダウン減少をスキップできるようにする
            //   補助計算スクリプトは iframe上で動作し, GS_PARENT(メインウィンドウ) 経由でこのフラグを読むため, GS_PARENT に書く必要がある
            //   同時に win(異なる場合)にも二重書き込みする, 念のため
            try {
                var evtName = win.Mvu.events && win.Mvu.events.VARIABLE_UPDATE_ENDED;
                if (evtName && typeof win.eventEmit === 'function') {
                    win.eventEmit(evtName, cloned, before);
                } else if (evtName && typeof eventEmit === 'function') {
                    eventEmit(evtName, cloned, before);
                }
            } catch (e3) { console.warn('[主神端末] VARIABLE_UPDATE_ENDEDのブロードキャスト失敗:', e3.message); }
            // イベントコールバックの同期実行が完了したら, 直ちにフラグをクリア(eventEmit は onUpdateDataを同期で発火し, 戻れば安全)
            try {
                GS_PARENT.__samsaraUIMutation = false;
                if (win !== GS_PARENT) win.__samsaraUIMutation = false;
            } catch(e6) { try { window.__samsaraUIMutation = false; } catch(e7){} }
            try { console.log('%c[主神端末] ✅ データをMVUへ書き戻し、更新イベントをブロードキャストしました', 'color:#86efac'); } catch(e){}
            return true;
        } catch (e) {
            try {
                GS_PARENT.__samsaraUIMutation = false;
                if (win) win.__samsaraUIMutation = false;
                if (tierPermitInstalled && opts && opts.tierPermit) {
                    if (win && win.__samsaraTierPermit === opts.tierPermit) win.__samsaraTierPermit = null;
                    if (GS_PARENT.__samsaraTierPermit === opts.tierPermit) GS_PARENT.__samsaraTierPermit = null;
                    if (window.__samsaraTierPermit === opts.tierPermit) window.__samsaraTierPermit = null;
                }
            } catch (_) {}
            console.error('[主神端末] MVUへの書き戻し失敗:', e);
            return false;
        }
    }

    /* ===== 8. ユーティリティ関数 ===== */
    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function safeNum(v, def) { var n = Number(v); return Number.isFinite(n) ? n : (def || 0); }
    function safeStr(v, def) { return (v === null || v === undefined) ? (def || '') : String(v); }
    /* 編集モードの一時保持: {path: {val, type}} —— クリックで即編集,フォーカス喪失/確定で一時保持,保存時にまとめて書き戻す */
    var pendingEdits = {};
    function stageEdit(path, val, type) {
        if (!path) return;
        pendingEdits[path] = { val: val, type: type || 'text' };
    }
    /* 編集状態の入力欄を表示状態へ戻す(新しい値は保持して一時保存) */
    function flushStagedDisplay($el) {
        if (!$el || !$el.length) return;
        var path = $el.attr('data-path');
        if (!path) return;
        var type = $el.attr('data-type') || 'text';
        var val = $el.is('select') ? $el.val() : $el.val();
        if (type === 'number') { var n = Number(val); val = Number.isFinite(n) ? n : 0; }
        // ★ tags 型(タグ配列): カンマ/読点区切りの入力を配列へ分割
        if (type === 'tags') {
            val = String(val).split(/[,，、]/).map(function(s){return s.trim();}).filter(Boolean);
            if (/^资产\.[^.]+\.所属对象$/.test(path)) {
                val = val.filter(function(owner, idx, arr){ return owner !== '无主' && arr.indexOf(owner) === idx; });
            }
        }
        // ★ json 型(ネストオブジェクト): オブジェクトへの復元を試みる; 不正なJSONは元の文字列を保持(ZOD層が拒否してフォールバック)
        if (type === 'json') {
            var _jt = String(val).trim();
            if (_jt === '') val = {};
            else { try { val = JSON.parse(_jt); } catch(e2) {} }
        }
        // ★ 身份は引き続き文字列配列(カンマ/スラッシュ区切りの入力を配列へ分割); 职业は「职业名をキーとするレコードオブジェクト」に変更済みのため, 分割しない
        if (path.indexOf('.身分') >= 0) {
            val = String(val).split(/[\/,，]/).map(function(s){return s.trim();}).filter(Boolean);
        }
        stageEdit(path, val, type);
        var $wrap = $el.closest('.sam-ed-wrap');
        if (!$wrap.length) { $wrap = $el.wrap('<span class="sam-ed-wrap"></span>').closest('.sam-ed-wrap'); }
        var optsStr = $el.attr('data-opts') || '';
        var disp = editDisplayInnerTyped(val, type);
        $wrap.attr('data-path', path).attr('data-type', type);
        if (optsStr) $wrap.attr('data-opts', optsStr);
        $wrap.removeClass('editing').html(disp + '<span class="sam-ed-ico">✎</span>');
    }
    function editDisplayInner(val) {
        var vs = (val === null || val === undefined) ? '' : (Array.isArray(val) ? val.join(',') : String(val));
        return (vs === '' ? '<span class="sam-ed-ph">なし</span>' : esc(vs));
    }
    /* 表示状態HTML: テキスト + ✎ バッジ, クリックで初めて入力欄に変わる(レイアウト崩れ防止) */
    function editDisplayInnerTyped(val, type) {
        if (type === 'textarea' || type === 'json') {
            // 複数行テキスト(JSON等): <pre> で改行とインデントを保持し, 一行に潰れて"文字化け"するのを防ぐ
            var vs = (val === null || val === undefined) ? '' : String(val);
            return (vs === '' ? '<span class="sam-ed-ph">なし</span>' : '<pre class="sam-ed-pre">'+esc(vs)+'</pre>');
        }
        return editDisplayInner(val);
    }
    function editDisplayHtml(path, val, type, optsStr) {
        var optsAttr = optsStr ? ' data-opts="'+esc(optsStr)+'"' : '';
        var isTa = (type === 'textarea');
        return '<span class="sam-ed-wrap'+(isTa?' pre-wrap':'')+'" data-path="'+esc(path)+'" data-type="'+esc(type||'text')+'"'+optsAttr+'>'
            + '<span class="sam-ed-val">'+editDisplayInnerTyped(val, type||'text')+'</span>'
            + '<span class="sam-ed-ico">'+(isTa?' ✎':'✎')+'</span>'
            + '</span>';
    }
    /* 実際の入力欄(クリック後のみ挿入, フォーカス喪失で復元) */
    function editRealInputHtml(path, val, type) {
        var v = (val === null || val === undefined) ? '' : String(val);
        if (type === 'textarea' || type === 'json') {
            // 複数行(职业JSON等): やや大きめの既定行高+等幅フォント
            return '<textarea class="sam-edit-input sam-edit-active" data-path="'+esc(path)+'" data-type="'+esc(type)+'" rows="8" style="width:100%;min-height:100px;resize:vertical;font-family:monospace;line-height:1.5;white-space:pre;">'+esc(v)+'</textarea>';
        }
        // tags 型: 通常のテキスト入力(カンマ区切り), 一時保存時に配列へ分割
        return '<input class="sam-edit-input sam-edit-active" type="'+esc(type||'text')+'" data-path="'+esc(path)+'" data-type="'+esc(type||'text')+'" value="'+esc(v)+'" />';
    }
    function editRealSelectHtml(path, options, val) {
        var html = '<select class="sam-edit-input sam-edit-active" data-path="'+esc(path)+'" data-type="select">';
        options.forEach(function(o) {
            html += '<option value="'+esc(o)+'"'+(String(o)===String(val)?' selected':'')+'>'+esc(o)+'</option>';
        });
        html += '</select>';
        return html;
    }
    function optsToStr(options) { return (options||[]).map(function(o){return String(o);}).join('|'); }
    function strToOpts(s) { return String(s||'').split('|'); }
    function parseRarity(q) {
        if (!q) return 'E';
        var s = String(q).trim().toUpperCase();
        // F~SSS 列挙の完全一致
        if (['F','E','D','C','B','A','S','SS','SSS'].indexOf(s) >= 0) return s;
        // 寛容な解析: "D级"/"S级"/"SSS级" など"级"接尾辞付きの変種に対応(複数文字の段位は長い順にマッチし, SSS が Sに切り詰められるのを防ぐ)
        var m = s.match(/^(SSS|SS|S|A|B|C|D|E|F)\s*级?$/);
        return m ? m[1] : 'E';
    }
    /* 生命階層(Ⅰ~Ⅸ) ↔ 品質アルファベット(F~SSS) の双方向マッピング: ローマ数字は表示テキスト用, 品質アルファベットは着色CSSクラス用
       両系列は各9段で, 一対一対応: Ⅰ↔F Ⅱ↔E Ⅲ↔D Ⅳ↔C Ⅴ↔B Ⅵ↔A Ⅶ↔S Ⅷ↔SS Ⅸ↔SSS */
    var TIER_ROMAN = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'];
    var TIER_QUALITY = ['F','E','D','C','B','A','S','SS','SSS'];
    /* 生命階層の単一次元属性ボーナス区間の上下限(補助計算スクリプト.LIFE_TIER_RANGE と整合; 段位分判定に使用)
       ★ UIの段位表示のみに使用し, 実際の数値計算/切り捨ては補助計算スクリプト内で行う */
    var LIFE_TIER_RANGE = {
        'Ⅰ': [1, 29],     'Ⅱ': [30, 99],     'Ⅲ': [100, 299],
        'Ⅳ': [300, 999],  'Ⅴ': [1000, 2999], 'Ⅵ': [3000, 9999],
        'Ⅶ': [10000, 29999], 'Ⅷ': [30000, 99999], 'Ⅸ': [100000, Infinity]
    };
    /* 昇格試練の閾値: 五維の段位分累計 ≥ 24 → 昇格申請が可能(五維すべてが現在階層の B 段以上に達した程度) */
    var TRIAL_SCORE_THRESHOLD = 24;
    /* 源力注入による昇格コスト：現在階層 → 次階層のみ許可し，対応する次段階の权限凭证×1を必ず消費する。 */
    var SOURCE_INFUSION_COSTS = {
        'E': 2500,
        'D': 10000,
        'C': 50000,
        'B': 250000,
        'A': 1000000,
        'S': 5000000,
        'SS': 25000000,
        'SSS': 100000000
    };
    /* 生命階層(大階層)を Ⅰ~Ⅸに正規化; 不正値は Ⅰ へフォールバック */
    function normalizeLifeTier(t) {
        var s = String(t || '').trim();
        return TIER_ROMAN.indexOf(s) >= 0 ? s : 'Ⅰ';
    }
    /* 単一次元の属性値 → 現在階層での段位分(F=1 … SSS=9), 補助計算スクリプト.attrTierScore と同一ロジック
       現在階層の LIFE_TIER_RANGE [lo,hi], 9 等分; 属性値がどの段に入るかでその段位分とする
       lo 未満は最低 1 点(F); 達成/超過 hi は満点 9 点(SSS)
       階層 Ⅸ の上限は Infinity → lo*10(100万)を区分上限の基準とする */
    function attrTierScore(val, lifeTier) {
        var v = safeNum(val, 0);
        var lt = normalizeLifeTier(lifeTier);
        var range = LIFE_TIER_RANGE[lt];
        if (!range) return 1;
        var lo = range[0], hi = range[1];
        if (v < lo) return 1;
        var effectiveHi = Number.isFinite(hi) ? hi : lo * 10;
        if (v >= effectiveHi) return 9;
        var span = Math.max(1, effectiveHi - lo);
        var w = Math.max(1, Math.floor(span / 9));
        var segIdx = Math.min(8, Math.floor((v - lo) / w));
        return segIdx + 1;
    }
    /* 段位分(1~9) → 品質アルファベット(F~SSS), 表示と着色に使用 */
    function scoreToQuality(score) {
        var i = Math.max(0, Math.min(8, Math.floor(safeNum(score, 1)) - 1));
        return TIER_QUALITY[i];
    }
    /* 五維の現在階層での段位分累計(力量+敏捷+体质+精神+魅力)を計算, 昇格プログレスバーに使用 */
    function calcTrialScore(fa, lifeTier) {
        var attrs = fa || {};
        var total = 0;
        ['筋力','敏捷','体力','精神','魅力'].forEach(function(an) {
            total += attrTierScore(attrs[an], lifeTier);
        });
        return total;
    }
    // SOURCE_INFUSION_CREDENTIAL_START
    /* 权限凭证の所持数：角色.権限証憑.<品质>のみを読む。 */
    function sourceInfusionCredentialQty(reincarnator, credentialGrade) {
        if (!reincarnator || !credentialGrade) return 0;
        var ledger = reincarnator.権限証憑 || {};
        return Math.max(0, Math.floor(safeNum(ledger[credentialGrade], 0)));
    }

    /* 指定品質の証憑をちょうど1枚消費する；証憑は独立した数値台帳で，道具/状態からは検索しない。 */
    function sourceInfusionConsumeCredential(reincarnator, credentialGrade) {
        if (!reincarnator || !credentialGrade) return false;
        reincarnator.権限証憑 = reincarnator.権限証憑 || {};
        var q = Math.max(0, Math.floor(safeNum(reincarnator.権限証憑[credentialGrade], 0)));
        if (q < 1) return false;
        reincarnator.権限証憑[credentialGrade] = q - 1;
        return true;
    }
    // SOURCE_INFUSION_CREDENTIAL_END    /* “現在階層→次階層”の源力注入プランを一度だけ生成する；証憑の品質による段階飛ばしは絶対に行わない。 */
    function sourceInfusionPlan(sd, targetName) {
        if (!sd || !sd.キャラ) return { error:'データが未準備です' };
        var isReincarnator = (targetName === 'キャラ');
        var target = isReincarnator ? sd.キャラ : (sd.关系リスト && sd.关系リスト[targetName]);
        if (!target) return { error:'対象キャラクターが見つかりません' };
        if (!isReincarnator && target.仲間 !== true) return { error:'源力注入はチームメイトのみ使用できます' };
        if (sd.システム状態 && sd.システム状態.戦闘中 === true) return { error:'安全なエリアで再度お試しください' };
        if (isReincarnator && sd.システム状態 && sd.システム状態.試練完了 === true) return { error:'昇格試練は完了済みです。「昇格開始」を直接使用してください' };

        var currentTier = normalizeLifeTier(target.階層);
        var idx = TIER_ROMAN.indexOf(currentTier);
        if (idx < 0) idx = 0;
        if (idx >= TIER_ROMAN.length - 1) return { error:'現在はすでに最高階層です' };
        var score = calcTrialScore(target.最終属性 || {}, currentTier);
        if (score < TRIAL_SCORE_THRESHOLD) return { error:'段位累計が昇格要件を満たしていません' };

        var nextTier = TIER_ROMAN[idx + 1];
        var nextGrade = TIER_QUALITY[idx + 1];
        var credentialName = nextGrade + '級権限証憑';
        return {
            isReincarnator: isReincarnator,
            targetName: targetName,
            currentTier: currentTier,
            nextTier: nextTier,
            nextGrade: nextGrade,
            score: score,
            cost: safeNum(SOURCE_INFUSION_COSTS[nextGrade], 0),
            credentialName: credentialName,
            credentialGrade: nextGrade,
            coin: safeNum(sd.キャラ.スペースコイン, 0),
            credentialQty: sourceInfusionCredentialQty(sd.キャラ, nextGrade)
        };
    }

    function sourceInfusionFmtNum(v) {
        var n = Math.max(0, Math.floor(safeNum(v, 0)));
        return n.toLocaleString ? n.toLocaleString() : String(n);
    }

    function openSourceInfusion(targetName) {
        targetName = targetName || 'キャラ';
        var first = sourceInfusionPlan(getStatData(), targetName);
        if (first.error) { samToast('warning', first.error); return; }
        var label = first.isReincarnator ? 'キャラ' : first.targetName;
        var body = '対象: '+label+' '+first.currentTier+' → '+first.nextTier+'（'+first.nextGrade+'）'
            +' ｜ スペースコイン: '+sourceInfusionFmtNum(first.cost)+'（所持 '+sourceInfusionFmtNum(first.coin)+'）'
            +' ｜ 証憑: '+first.credentialName+' ×1（所持 ×'+first.credentialQty+'）'
            +' ｜ 確認後は角色アカウントから支払われ，今回の昇格がそのまま完了します。';
        samConfirm('源力注入 · '+first.currentTier+' → '+first.nextTier, body, function() {
            var latest = sourceInfusionPlan(getStatData(), targetName);
            if (latest.error) { samToast('warning', latest.error); return; }
            if (latest.coin < latest.cost) {
                samToast('warning', 'スペースコイン不足：必要 '+sourceInfusionFmtNum(latest.cost));
                return;
            }
            if (latest.credentialQty < 1) {
                samToast('warning', '不足 '+latest.credentialName+' ×1');
                return;
            }

            var applied = false;
            var opts = latest.isReincarnator ? { tierPermit: latest.nextTier } : undefined;
            var ok = writeBackMvu(function(statData) {
                var check = sourceInfusionPlan(statData, targetName);
                if (check.error || check.nextTier !== latest.nextTier || check.nextGrade !== latest.nextGrade) return;
                if (check.coin < check.cost || check.credentialQty < 1) return;
                var payer = statData.キャラ;
                var target = check.isReincarnator ? payer : (statData.关系リスト && statData.关系リスト[check.targetName]);
                if (!target || (!check.isReincarnator && target.仲間 !== true)) return;
                if (!sourceInfusionConsumeCredential(payer, check.credentialGrade)) return;
                payer.スペースコイン = Math.max(0, safeNum(payer.スペースコイン, 0) - check.cost);
                target.階層 = check.nextTier;
                var receiptActor = check.isReincarnator ? 'キャラ' : check.targetName;
                shopAppendReceipt(statData, '[昇格]['+receiptActor+'] 源力注入：'+check.currentTier+' → '+check.nextTier+'｜消費 '+sourceInfusionFmtNum(check.cost)+'スペースコイン、'+check.credentialName+'×1');
                if (check.isReincarnator && statData.システム状態) statData.システム状態.試練完了 = false;
                applied = true;
            }, opts);
            if (ok && applied) {
                samToast('success', label+' は源力注入により '+latest.nextTier+' 級へ上昇しました');
                renderAll();
            } else {
                samToast('error', '源力注入に失敗しました。リソースまたは角色の状態が変化しています');
            }
        });
    }

    /* 階層の表示テキスト(ローマ数字)を取得; 旧データに保存された品質アルファベットは対応するローマ数字へ変換; 不正値は Ⅰ にフォールバック */
    function tierRomanOf(raw) {
        var s = String(raw || '').trim();
        var i = TIER_ROMAN.indexOf(s);
        if (i >= 0) return s;
        i = TIER_QUALITY.indexOf(s.toUpperCase());
        if (i >= 0) return TIER_ROMAN[i];
        return 'Ⅰ';
    }
    /* 階層の品質色階(F~SSS, CSS q-classの着色に使用)を取得; 旧データの品質アルファベットに対応; 不正値は F にフォールバック */
    function tierQOfClass(raw) {
        var s = String(raw || '').trim();
        var i = TIER_ROMAN.indexOf(s);
        if (i >= 0) return TIER_QUALITY[i];
        i = TIER_QUALITY.indexOf(s.toUpperCase());
        if (i >= 0) return s.toUpperCase();
        return 'F';
    }
    /* 階層表示の元値：現在形態が有効(激活===true かつ名称が非空)で形態階層 > 自身階層のとき，
       形態階層を返す；それ以外は自身階層を返す。UI表示のみに使用（データへは絶対に書き戻さない）。
       判定規則は各レンダリング関数に既存の formActive / npcFormName 判定と一致する。
       形態変身の終了後は 現在形態.激活 が trueでなくなる → 自動的に自身階層の表示へ戻る。 */
    function displayTierRaw(char) {
        var ownRaw = (char && char.階層 != null) ? char.階層 : '';
        var cf = char && char.現在形態 ? char.現在形態 : null;
        if (!cf || cf.激活 !== true || !safeStr(cf.名称)) return ownRaw;
        var entry = char.形態庫 && char.形態庫[cf.名称];
        if (!entry || typeof entry !== 'object') return ownRaw;
        var fTierRaw = (entry.階層 != null) ? entry.階層 : entry.品質;  // 旧セーブでは 品质 フィールドでフォールバックする可能性がある
        var ownIdx = TIER_ROMAN.indexOf(tierRomanOf(ownRaw));     // Ⅰ~Ⅸ のインデックスへ正規化
        var formIdx = TIER_ROMAN.indexOf(tierRomanOf(fTierRaw));
        if (formIdx > ownIdx) return fTierRaw;  // 形態階層がより高い → 形態階層を表示
        return ownRaw;                          // 形態階層 ≤ 自身 → 自身階層を表示
    }
    function getTheme() {
        try { var t = localStorage.getItem(SAM_CONFIG.theme); if (t && THEMES[t]) return t; } catch(e){}
        return 'night';
    }
    function setTheme(t) {
        try { localStorage.setItem(SAM_CONFIG.theme, t); } catch(e){}
        var $p = $('#samsara-panel');
        if ($p.length) {
            if (t === 'night') $p.removeAttr('data-theme');
            else $p.attr('data-theme', t);
        }
        applyThemeCSSVars(t);
    }
    function applyThemeCSSVars(t) {
        var th = THEMES[t] || THEMES.night;
        var root = document.getElementById('samsara-theme-style');
        if (!root) return;
        // styleブロックを再構築(変数+固定CSS)
        root.innerHTML = buildCSS(th, t);
    }
    function isMobile() { return (GS_PARENT.innerWidth || document.documentElement.clientWidth) <= 768; }
    function getCurrentTab() {
        try { var t = localStorage.getItem(SAM_CONFIG.tab); if (t) return t; } catch(e){}
        return 'mission';
    }
    function setCurrentTab(t) { try { localStorage.setItem(SAM_CONFIG.tab, t); } catch(e){} }
    function isEditMode() {
        try { return localStorage.getItem(SAM_CONFIG.edit) === '1'; } catch(e){ return false; }
    }
    function setEditMode(on) {
        try { localStorage.setItem(SAM_CONFIG.edit, on ? '1' : '0'); } catch(e){}
        // 編集モードの開始/終了時に一時保持をクリアし, 汚れたデータを避ける
        pendingEdits = {};
    }

    /* ===== 9. CSS 注入(マルチテーマ変数を含む) ===== */
    function buildCSS(th, themeKey) {
        var isLight = (themeKey === 'parchment');
        return `
        :root {
            --sam-accent: ${th.accent};
            --sam-hp: ${th.hp}; --sam-thp: ${th.thp}; --sam-ep: ${th.ep};
            --sam-bg: ${th.bg}; --sam-card: ${th.card}; --sam-dark: ${th.dark};
            --sam-border: ${th.border}; --sam-text: ${th.text}; --sam-sub: ${th.sub};
            /* 品質/階層色: 基本寒色→高段暖色→破格ネオン (F~SSS 九段, 品質バッジ/階層文字/カード枠で統一的に参照) */
            --sam-q-f:#94a3b8; --sam-q-e:#f8fafc; --sam-q-d:#22c55e; --sam-q-c:#3b82f6;
            --sam-q-b:#a855f7; --sam-q-a:#f97316; --sam-q-s:#eab308; --sam-q-ss:#ef4444; --sam-q-sss:#ec4899;
            --sam-modal-overlay: ${isLight ? 'rgba(60,40,10,0.45)' : 'rgba(0,0,0,0.65)'};
            --sam-input-bg: ${isLight ? 'rgba(255,250,235,0.9)' : 'rgba(0,0,0,0.4)'};
            --sam-hover: ${isLight ? 'rgba(168,118,30,0.12)' : 'rgba(255,255,255,0.06)'};
        }
        #samsara-ball {
            position: fixed; top: 15%; right: 20px; z-index: 999999;
            width: 34px; height: 34px; border-radius: 50%;
            background: radial-gradient(circle, var(--sam-bg) 30%, var(--sam-dark) 100%);
            border: 1.5px solid var(--sam-border); box-shadow: 0 0 10px var(--sam-accent);
            cursor: pointer; user-select: none; touch-action: none;
            display: flex; justify-content: center; align-items: center;
            backdrop-filter: blur(8px); transition: box-shadow 0.3s, transform 0.25s;
        }
        #samsara-ball:hover { transform: scale(1.1); box-shadow: 0 0 18px var(--sam-ep); }
        #samsara-ball:active { transform: scale(0.95); }
        #samsara-ball.combat-mode { box-shadow: 0 0 18px var(--sam-hp); border-color: var(--sam-hp); }
        #samsara-ball .core { width: 11px; height: 11px; background: var(--sam-accent); border-radius: 50%; box-shadow: 0 0 7px var(--sam-accent); pointer-events: none; }
        #samsara-ball.combat-mode .core { background: var(--sam-hp); box-shadow: 0 0 10px var(--sam-hp); animation: samPulse 1.2s ease-in-out infinite; }
        @keyframes samPulse { 0%,100% { transform: scale(1); box-shadow: 0 0 10px var(--sam-hp); } 50% { transform: scale(1.3); box-shadow: 0 0 20px var(--sam-hp); } }

        #samsara-panel {
            position: fixed !important; right: 70px; top: 6%; z-index: 999998;
            width: 470px; max-width: 94vw; height: 82vh; height: 82dvh; max-height: 800px; min-height: 280px;
            display: none; flex-direction: column;
            background: var(--sam-bg); border: 1px solid var(--sam-border); border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3);
            backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
            color: var(--sam-text); font-family: 'Segoe UI', system-ui, sans-serif; overflow: hidden;
        }
        /* 中画面: 中央寄せ表示(右寄せにしない) */
        @media (max-width: 1100px) and (min-width: 769px) {
            #samsara-panel {
                left: 0 !important; right: 0 !important; margin: 0 auto !important;
                top: 6% !important;
            }
        }
        #samsara-panel.open { display: flex; animation: samPanelIn 0.28s cubic-bezier(0.16,1,0.3,1) forwards; }
        #samsara-panel.closing { display: flex; pointer-events: none; animation: samPanelOut 0.18s cubic-bezier(0.4,0,1,1) forwards; }
        @keyframes samPanelIn { from { opacity: 0; transform: scale(0.94) translateY(20px); } to { opacity: 1; transform: none; } }
        @keyframes samPanelOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(0.96) translateY(12px); } }

        /* トップバー */
        .sam-topbar { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--sam-border); background:linear-gradient(90deg,var(--sam-dark) 0%,transparent 100%); cursor:grab; user-select:none; flex-shrink:0; }
        .sam-topbar:active { cursor:grabbing; }
        .sam-topbar .tl-info { display:flex; flex-direction:column; gap:2px; font-size:12px; min-width:0; }
        .sam-topbar .tl-time { color:var(--sam-text); font-weight:bold; }
        .sam-topbar .tl-place { color:var(--sam-sub); font-size:11px; }
        .sam-topbar .tl-actions { display:flex; gap:6px; align-items:center; }
        .sam-icon-btn { width:28px; height:28px; border-radius:6px; border:1px solid var(--sam-border); background:var(--sam-card); color:var(--sam-text); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; transition:all 0.2s; flex-shrink:0; }
        .sam-icon-btn:hover { background:var(--sam-accent); color:#fff; transform:translateY(-1px); box-shadow:0 0 8px var(--sam-accent); }
        .sam-icon-btn.choose-world { width:auto; padding:0 8px; font-size:12px; gap:3px; white-space:nowrap; }
        .sam-icon-btn.close { border-color:var(--sam-hp); color:var(--sam-hp); }
        .sam-icon-btn.close:hover { background:var(--sam-hp); color:#fff; }
        .sam-icon-btn.edit-on { background:var(--sam-accent); color:#fff; box-shadow:0 0 10px var(--sam-accent); }

        /* 中央:キャラクター行(左アバター列+階層/種族/形態 / 右 HP+EP+THP 三欄 単色) */
        .sam-reincarnator { display:flex; padding:8px 12px; gap:10px; border-bottom:1px solid var(--sam-border); flex-shrink:0; align-items:center; }
        .sam-reincarnator-left { display:flex; align-items:center; gap:10px; flex:0 1 auto; min-width:0; }
        /* アバター: 大きめ表示, 空状態クリック=アップロード, 画像ありクリック=拡大, 右上の✎ボタン=アップロード */
        .sam-avatar { width:90px; height:110px; border-radius:6px; border:2px solid var(--sam-accent); background:var(--sam-card); display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:28px; flex-shrink:0; overflow:hidden; cursor:pointer; box-shadow:0 0 10px rgba(143,159,255,0.25); position:relative; transition:box-shadow 0.2s, transform 0.15s; }
        .sam-avatar:hover { box-shadow:0 0 16px rgba(143,159,255,0.5); transform:translateY(-1px); }
        .sam-avatar.empty { cursor:pointer; gap:4px; }
        .sam-avatar.empty img { display:none; }
        .sam-avatar:not(.empty) .sam-ava-ph { display:none; }
        .sam-avatar:not(.empty) { cursor:pointer; }
        .sam-avatar img { width:100%; height:100%; object-fit:cover; }
        .sam-ava-ph { display:flex; flex-direction:column; align-items:center; gap:4px; color:var(--sam-sub); }
        .sam-ava-ph .sam-ava-ico { font-size:30px; opacity:0.7; }
        .sam-ava-ph .sam-ava-hint { font-size:9px; text-align:center; line-height:1.2; opacity:0.8; }
        .sam-reincarnator-text { display:flex; flex-direction:column; min-width:0; flex:1 1 auto; gap:5px; }
        /* 戦闘状態バッジ: 赤いパルス, 通常は描画しない(JSが 是否战斗中 に応じて出力) */
        .sam-reincarnator-combat { align-self:flex-start; display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:bold; color:#fff; background:linear-gradient(135deg, rgba(228,88,125,0.92), rgba(170,38,66,0.9)); border:1px solid var(--sam-hp); border-radius:10px; padding:2px 10px; letter-spacing:0.5px; box-shadow:0 0 8px rgba(228,88,125,0.5); animation:samCombatPulse 1.4s ease-in-out infinite; }
        @keyframes samCombatPulse { 0%,100% { box-shadow:0 0 7px rgba(228,88,125,0.45); } 50% { box-shadow:0 0 16px rgba(228,88,125,0.85); } }
        /* 階層: 品質ストロークのバッジ(文字色は .q-X が提供, 枠線は currentColorに追従) - 独立した行
           固定の暗色背景により明るいテーマでも明色の品質文字(F/E)が高コントラストで読める */
        .sam-reincarnator-tier { align-self:flex-start; display:inline-flex; align-items:baseline; font-weight:900; line-height:1; color:var(--sam-accent); padding:3px 12px; border:2px solid currentColor; border-radius:9px; background:rgba(15,18,28,0.78); box-shadow:0 1px 4px rgba(0,0,0,0.35), inset 0 0 8px rgba(0,0,0,0.3); }
        .sam-reincarnator-tier-num { font-size:19px; text-shadow:0 1px 2px rgba(0,0,0,0.65); }
        .sam-reincarnator-tier-suf { font-size:11px; opacity:0.8; margin-left:1px; text-shadow:0 1px 2px rgba(0,0,0,0.65); }
        /* 種族: 副次ラベル - 独立した行 */
        .sam-reincarnator-race { align-self:flex-start; display:inline-flex; align-items:center; font-size:12px; font-weight:bold; color:var(--sam-text); line-height:1.2; padding:3px 9px; background:rgba(255,255,255,0.05); border:1px solid var(--sam-border); border-radius:8px; }
        /* 形態: 金色に発光するラベル */
        .sam-reincarnator-form { align-self:flex-start; display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--sam-thp); line-height:1.2; padding:2px 9px; background:rgba(229,193,102,0.1); border:1px solid rgba(229,193,102,0.4); border-radius:8px; box-shadow:0 0 7px rgba(229,193,102,0.18); }
        .sam-reincarnator-form-name { font-size:13px; }
        /* 右側 HP/EP/THP の三列 */
        /* 右側 HP/EP/THP の三列 */
        .sam-reincarnator-bars { 
            flex: 1 1 auto;             /* 伸縮を許可し，残りのスペースを自動で埋める */
            display: flex; 
            flex-direction: column; 
            gap: 5px; 
            min-width: 150px;           /* 最小幅を設定し，左側に押し潰されるのを防ぐ */
            max-width: 210px;           /* 👈 核心の変更：最大幅を 200px 前後に制限する，これが黄金比 */
            margin-left: auto;          /* 右端へ押しやる */
        }
        .sam-reincarnator-bars .stat-bar-box { min-width: 0; }
        .stat-labels { display:flex; justify-content:space-between; font-size:11px; font-weight:bold; margin-bottom:2px; color:var(--sam-sub); }
        .bar-track { width:100%; height:13px; background:var(--sam-dark); border-radius:6px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.08); }
        .bar-fill { height:100%; position:absolute; top:0; left:0; border-radius:6px; transition:width 0.5s cubic-bezier(0.2,0.8,0.2,1); }
        .fill-hp { background:var(--sam-hp); z-index:1; }
        .fill-thp { background:var(--sam-thp); z-index:2; opacity:0.85; box-shadow:0 0 6px var(--sam-thp); }
        .fill-ep { background:var(--sam-ep); }
        .fill-thp2 { background:var(--sam-thp); }
        /* THP行(トップのキャラクター): 一時シールド/追加ライフ, プログレスバーなし, 外枠で囲み, やや下へオフセット */
        .sam-thp-row { margin-top:3px; padding:5px 10px; border:1px solid var(--sam-thp); border-radius:6px; background:rgba(255,255,255,0.04); }
        .sam-thp-row .stat-labels { margin-bottom:0; }
        /* THP行(NPC): 外枠で囲み, ラベルを完全に表示 */
        .sam-npc-thp-row { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:3px 8px; border:1px solid var(--sam-thp); border-radius:5px; background:rgba(255,255,255,0.04); margin-top:3px; }
        .sam-npc-thp-row .lbl { font-size:10px; font-weight:bold; color:var(--sam-thp); }
        .sam-npc-thp-row .num { font-size:11px; color:var(--sam-text); font-weight:bold; }
        /* 階層プログレスバー: 左 現在階層 / 中 合計点+バー / 右 次階層 */
        .sam-tier-prog { display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--sam-hover); border-radius:8px; border:1px solid var(--sam-border); margin-bottom:8px; }
        .sam-tier-side { font-size:18px; font-weight:900; color:var(--sam-accent); min-width:34px; text-align:center; line-height:1; }
        .sam-tier-side.next { color:var(--sam-sub); opacity:0.7; }
        .sam-tier-side.max { color:var(--sam-hp); }
        .sam-tier-mid { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
        .sam-tier-sum { font-size:11px; color:var(--sam-sub); font-weight:bold; display:flex; justify-content:space-between; }
        .sam-tier-sum .v { color:var(--sam-text); }
        .sam-tier-bar { width:100%; height:14px; background:var(--sam-dark); border-radius:7px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.1); }
        .sam-tier-bar .bar-fill { background:linear-gradient(90deg, var(--sam-accent), var(--sam-hp)); box-shadow:0 0 8px var(--sam-accent); }
        /* 昇格ボタン: 補助計算スクリプトが管理する“試練可否”で制御；源力注入と昇格申請を並置。 */
        .sam-tier-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:4px; }
        .sam-tier-adv-btn, .sam-tier-infuse-btn { padding:5px 14px; font-size:12px; font-weight:900; border:1px solid; border-radius:6px; cursor:pointer; transition:all 0.18s; letter-spacing:1px; }
        .sam-tier-adv-btn.apply { border-color:#7a1f1f; color:#e04848; background:rgba(122,31,31,0.18); text-shadow:0 0 4px rgba(224,72,72,0.5); }
        .sam-tier-adv-btn.apply:hover { background:#7a1f1f; color:#fff; box-shadow:0 0 10px rgba(224,72,72,0.7); }
        .sam-tier-adv-btn.start { margin-top:4px; align-self:flex-start; border-color:#d4af37; color:#fff7d6; background:linear-gradient(135deg, rgba(212,175,55,0.25), rgba(255,247,214,0.12)); text-shadow:0 0 5px rgba(255,247,214,0.8); box-shadow:0 0 8px rgba(212,175,55,0.5); }
        .sam-tier-adv-btn.start:hover { background:linear-gradient(135deg, #d4af37, #fff7d6); color:#2a2300; box-shadow:0 0 14px rgba(255,247,214,0.9); }
        .sam-tier-infuse-btn { border-color:#7c5cff; color:#c9c0ff; background:rgba(124,92,255,0.14); text-shadow:0 0 5px rgba(124,92,255,0.55); }
        .sam-tier-infuse-btn:hover { background:#7c5cff; color:#fff; box-shadow:0 0 12px rgba(124,92,255,0.75); }
        .sam-tier-prog.npc { margin:7px 0 3px; padding:6px 8px; }
        .sam-tier-prog.npc .sam-tier-side { font-size:15px; min-width:28px; }
        .sam-tier-prog.npc .sam-tier-bar { height:11px; }
        /* 副本実績: 達成済みカードは金色の枠線でハイライト + ヘッダに達成バッジ */
        .sam-ach-item.done .sam-full-card { border-left-color:#d4af37; box-shadow:0 0 8px rgba(212,175,55,0.25); }
        .sam-ach-item.done .sam-fc-title { color:var(--sam-thp, #e5c166); }
        .sam-ach-done-chip { flex:0 0 auto; font-size:10px; font-weight:900; color:#d4af37; border:1px solid rgba(212,175,55,0.55); background:rgba(212,175,55,0.12); border-radius:8px; padding:1px 8px; white-space:nowrap; letter-spacing:0.5px; }
        /* 血統/形態/スキルカードの削除ボタン: 編集モードでカードヘッダ右側に表示 */
        .sam-fc-del-btn { margin-left:auto; width:22px; height:22px; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; font-size:13px; line-height:1; cursor:pointer; color:var(--sam-hp); background:rgba(228,72,72,0.12); border:1px solid rgba(228,72,72,0.45); border-radius:6px; transition:all 0.18s; }
        .sam-fc-del-btn:hover { background:var(--sam-hp); color:#fff; box-shadow:0 0 8px rgba(228,72,72,0.6); }
        @media (max-width:768px) {
            /* スマホ向けに tier プログレスバーをコンパクト化(パネル全体の適応規則は下部の @media max-width:768px で一括処理) */
            .sam-tier-prog { padding:6px 8px; gap:6px; }
            .sam-tier-side { font-size:15px; min-width:28px; }
            .sam-tier-bar { height:11px; }
        }
        /* 戦術スロット装着情報バー: 各タイプの 現在数/上限; 未満は白/満杯は緑/超過は赤(フィールド全体が変色) */
        .sam-slots-bar { display:flex; flex-wrap:wrap; gap:4px 8px; padding:6px 10px; background:var(--sam-hover); border-radius:8px; border:1px solid var(--sam-border); margin-bottom:8px; }
        .sam-slot-chip { font-size:11px; color:var(--sam-text); font-weight:bold; white-space:nowrap; }
        .sam-slot-chip.full { color:#4ade80; }      /* 満杯: 緑 */
        .sam-slot-chip.over { color:var(--sam-hp); } /* 超過: 赤 */
        /* 立ち絵拡大ビューア — 全画面 + dvh/safe-areaでノッチ/下部バーの切れを回避 */
        #samsara-portrait-viewer {
            display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; height:100dvh;
            background:rgba(5,5,12,0.94); backdrop-filter:blur(14px); z-index:999999999;
            justify-content:center; align-items:center; flex-direction:column; cursor:zoom-out;
            padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
            box-sizing:border-box;
        }
        #samsara-portrait-viewer.show { display:flex; animation:samPvFade 0.2s ease; }
        @keyframes samPvFade { from{opacity:0;} to{opacity:1;} }
        #sam-pv-img {
            max-width:min(88vw, 100%);
            max-height:calc(86vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            max-height:calc(86dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            object-fit:contain; border:2px solid var(--sam-accent); border-radius:6px;
            box-shadow:0 0 60px rgba(143,159,255,0.4); display:block;
        }
        #sam-pv-label { margin-top:10px; color:var(--sam-accent); font-size:14px; font-weight:bold; text-align:center; padding:0 12px; }

        /* 下部ステータスボタン列(ステータス名+持続時間, クリックで二次詳細を表示) —— 強制的に一行の横スクロール, ステータスが増えても折り返し/縦積みしない */
        .sam-buff-rail { display:flex; flex-wrap:nowrap; gap:5px; padding:6px 12px; border-bottom:1px solid var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; background:var(--sam-card); -webkit-overflow-scrolling:touch; white-space:nowrap; }
        .sam-buff-rail::-webkit-scrollbar { height:4px; }
        .sam-buff-rail::-webkit-scrollbar-track { background:transparent; }
        .sam-buff-rail::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:2px; }
        /* ショップパネル: 上部のコンパクトな残高バー */
        .sam-shop-coin-mini { display:flex; align-items:center; justify-content:center; gap:6px; padding:4px 10px; background:linear-gradient(135deg, rgba(212,175,55,0.12), rgba(255,247,214,0.06)); border:1px solid rgba(229,193,102,0.4); border-radius:16px; font-size:12px; color:var(--sam-thp); margin-bottom:6px; line-height:1.2; }
        .sam-shop-coin-mini .lbl { font-weight:normal; color:var(--sam-sub); opacity:0.85; }
        .sam-shop-coin-mini .val { font-weight:900; text-shadow:0 0 6px rgba(229,193,102,0.5); }
        .sam-shop-credential-mini { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:5px; padding:5px 8px; margin-bottom:6px; background:rgba(143,159,255,0.06); border:1px solid var(--sam-border); border-radius:8px; font-size:11px; line-height:1.25; }
        .sam-shop-credential-mini .lbl { color:var(--sam-sub); margin-right:2px; }
        .sam-shop-credential-chip { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border:1px solid var(--sam-border); border-radius:10px; color:var(--sam-accent); background:var(--sam-card); font-weight:800; }
        .sam-shop-credential-empty { color:var(--sam-sub); opacity:0.75; }
        .sam-shop-warn { font-size:12px; color:var(--sam-hp); padding:8px 10px; background:rgba(228,88,125,0.10); border:1px solid rgba(228,88,125,0.35); border-radius:6px; margin-bottom:8px; line-height:1.5; }
        .sam-shop-ok { font-size:12px; color:#56bf7b; padding:8px 10px; background:rgba(86,191,123,0.10); border:1px solid rgba(86,191,123,0.35); border-radius:6px; margin-bottom:8px; line-height:1.5; }
        /* ショップ入口: 入力欄が一行を占有(スマホでも狭くならない); 対象ドロップダウン + 更新ボタンが次の行 */
        .sam-shop-entry { display:flex; flex-direction:column; gap:8px; }
        .sam-shop-entry .sam-shop-req { width:100%; box-sizing:border-box; background:var(--sam-input-bg, rgba(0,0,0,0.25)); border:1px solid var(--sam-border); border-radius:6px; padding:8px 10px; font-size:12px; color:var(--sam-fg, #d1d8e0); outline:none; transition:border-color 0.15s, box-shadow 0.15s; }
        .sam-shop-entry .sam-shop-req:focus { border-color:var(--sam-thp, #e5c166); box-shadow:0 0 0 2px rgba(229,193,102,0.18); }
        .sam-shop-entry .sam-shop-req::placeholder { color:var(--sam-sub, #7a8499); opacity:0.9; }
        .sam-shop-entry-actions { display:flex; align-items:stretch; gap:8px; flex-wrap:wrap; }
        .sam-shop-refresh-btn { flex:1 1 auto; display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:0 14px; border:1px solid rgba(229,193,102,0.5); border-radius:6px; background:linear-gradient(135deg, rgba(212,175,55,0.18), rgba(255,247,214,0.08)); color:var(--sam-thp, #e5c166); font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:transform 0.15s, box-shadow 0.15s, background 0.15s; }
        .sam-shop-refresh-btn:hover { transform:translateY(-1px); box-shadow:0 3px 8px rgba(229,193,102,0.25); background:linear-gradient(135deg, rgba(212,175,55,0.28), rgba(255,247,214,0.14)); }
        .sam-shop-refresh-btn:active { transform:translateY(0); }
        .sam-shop-refresh-btn[disabled] { opacity:0.5; cursor:not-allowed; transform:none; box-shadow:none; }
        /* ★ 複数キャラのショップ: 対象キャラのドロップダウン */
        .sam-shop-entry .sam-shop-actor-select { flex:0 0 auto; min-width:92px; max-width:140px; background:var(--sam-input-bg, rgba(0,0,0,0.25)); border:1px solid var(--sam-border); border-radius:6px; padding:6px 8px; font-size:12px; color:var(--sam-fg, #d1d8e0); outline:none; cursor:pointer; }
        .sam-shop-actor-select:focus { border-color:var(--sam-thp, #e5c166); box-shadow:0 0 0 2px rgba(229,193,102,0.18); }
        .sam-shop-actor-select[disabled] { opacity:0.5; cursor:not-allowed; }
        .sam-shop-actor-label { flex:0 0 auto; align-self:center; font-size:11px; color:var(--sam-sub, #7a8499); white-space:nowrap; }
        /* "更新停止"ボタン: 更新中レイヤーでのみ表示, ハングしたAIリクエストを打ち切るために使用 */
        .sam-shop-stop-btn { margin-top:4px; padding:7px 14px; border:1px solid rgba(228,72,72,0.55); border-radius:6px; background:linear-gradient(135deg, rgba(228,72,72,0.18), rgba(255,180,180,0.06)); color:#ffb3b3; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:transform 0.15s, box-shadow 0.15s, background 0.15s; }
        .sam-shop-stop-btn:hover { transform:translateY(-1px); box-shadow:0 3px 8px rgba(228,72,72,0.28); background:linear-gradient(135deg, rgba(228,72,72,0.28), rgba(255,180,180,0.12)); }
        .sam-shop-stop-btn:active { transform:translateY(0); }
        /* ===== ショップ市場エリア(商品更新後に表示) ===== */
        /* エリアTab列: 装備|アイテム|スキル|血統 */
        .sam-shop-tabs { display:flex; flex-wrap:nowrap; gap:4px; padding:6px 4px; border-bottom:1px solid var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; -webkit-overflow-scrolling:touch; }
        .sam-shop-tabs::-webkit-scrollbar { height:3px; }
        .sam-shop-tab { flex:0 0 auto; padding:5px 12px; font-size:12px; color:var(--sam-sub); background:transparent; border:1px solid transparent; border-radius:14px; cursor:pointer; white-space:nowrap; transition:all 0.15s; line-height:1.2; }
        .sam-shop-tab:hover { color:var(--sam-accent); }
        .sam-shop-tab.active { color:#0d1220; background:var(--sam-accent); border-color:var(--sam-accent); box-shadow:0 0 10px rgba(143,159,255,0.3); font-weight:bold; }
        .sam-shop-tab .sam-shop-tab-cnt { font-size:10px; opacity:0.75; margin-left:2px; }
        /* 所持パネルの子Tab列: 戦術スロット|装備バッグ|アイテムバッグ|倉庫 (四等分のカード式) */
        .sam-hold-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:8px 2px 10px; flex-shrink:0; }
        .sam-hold-tab { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:8px 4px 7px; background:var(--sam-card); border:1px solid var(--sam-border); border-radius:10px; cursor:pointer; transition:all 0.18s; position:relative; overflow:visible; line-height:1.1; }
        .sam-hold-tab:hover { border-color:var(--sam-accent); transform:translateY(-1px); }
        .sam-hold-tab.active { background:linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.04)); border-color:var(--sam-accent); box-shadow:0 0 0 1px var(--sam-border), 0 0 12px rgba(0,0,0,0.18); }
        .sam-hold-tab .sam-hold-tab-ico { font-size:17px; line-height:1; filter:grayscale(0.35); transition:filter 0.18s; }
        .sam-hold-tab.active .sam-hold-tab-ico { filter:grayscale(0); }
        .sam-hold-tab .sam-hold-tab-lbl { font-size:11px; color:var(--sam-text); white-space:nowrap; transition:color 0.18s; }
        .sam-hold-tab.active .sam-hold-tab-lbl { color:var(--sam-accent); font-weight:bold; }
        .sam-hold-tab .sam-hold-tab-cnt { position:absolute; top:-5px; right:-4px; min-width:16px; height:16px; padding:0 4px; font-size:10px; font-weight:bold; line-height:16px; text-align:center; color:var(--sam-dark); background:var(--sam-accent); border-radius:9px; box-shadow:0 0 6px color-mix(in srgb, var(--sam-accent) 45%, transparent); }
        .sam-hold-tab .sam-hold-tab-cnt:empty, .sam-hold-tab .sam-hold-tab-cnt.zero { display:none; }
        /* 所持パネル専用の分類行: 各子Tabの下で物品タイプにより二次絞り込み(すべて+既存タイプ); バッグが空なら内容も空で場所を取らない */
        .sam-hold-types-wrap:empty { display:none; margin:0; padding:0; }
        /* 分類行: 強制的に一行の横スクロール(タイプが増えても折り返し/縦積みしない), 左右にpaddingを残して先頭と末尾のカプセル影の切れを防ぐ */
        .sam-hold-types { display:flex; flex-wrap:nowrap; gap:4px; padding:2px 10px 8px; margin-bottom:4px; border-bottom:1px dashed var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; -webkit-overflow-scrolling:touch; }
        /* 注意: ここに scrollbar-width(thin等)を書いてはならない, Chromium 121+ では ::-webkit-scrollbarのカスタムスタイルが無視されシステムの灰色スクロールバーへ戻る */
        .sam-hold-types::-webkit-scrollbar { height:4px; }
        .sam-hold-types::-webkit-scrollbar-track { background:transparent; }
        .sam-hold-types::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:2px; }
        .sam-hold-type { flex:0 0 auto; display:inline-flex; align-items:center; gap:3px; padding:3px 10px; font-size:11px; color:var(--sam-sub); background:transparent; border:1px solid transparent; border-radius:12px; cursor:pointer; white-space:nowrap; transition:all 0.15s; line-height:1.2; }
        .sam-hold-type:hover { color:var(--sam-accent); }
        .sam-hold-type.active { color:#0d1220; background:var(--sam-accent); border-color:var(--sam-accent); box-shadow:0 0 10px color-mix(in srgb, var(--sam-accent) 35%, transparent); font-weight:bold; }
        .sam-hold-type .sam-hold-type-cnt { font-size:10px; opacity:0.75; }
        /* 所持パネル内容エリア */
        .sam-hold-content { padding:2px 2px 6px; }
        .sam-hold-hint { display:inline-flex; align-items:center; gap:4px; font-size:10px; color:var(--sam-sub); background:rgba(0,0,0,0.25); border:1px solid var(--sam-border); border-radius:10px; padding:2px 9px; margin-bottom:8px; opacity:0.85; }
        /* 上部の分類Tab列 + 中央list(スクロール) + 下部カートバー(常駐) の三段固定レイアウト */
        .sam-shop-market { display:flex; flex-direction:column; gap:0; flex:1; min-height:0; }
        .sam-shop-tabs { flex-shrink:0; }
        .sam-shop-nav { display:flex; flex-direction:row; flex-wrap:nowrap; gap:4px; padding:6px 4px; border-bottom:1px solid var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; -webkit-overflow-scrolling:touch; }
        .sam-shop-nav::-webkit-scrollbar { height:3px; }
        .sam-shop-nav-btn { flex:0 0 auto; display:flex; align-items:center; gap:4px; padding:5px 11px; font-size:12px; color:var(--sam-sub); background:transparent; border:1px solid transparent; border-radius:14px; cursor:pointer; white-space:nowrap; transition:all 0.15s; line-height:1.2; }
        .sam-shop-nav-btn:hover { color:var(--sam-accent); }
        .sam-shop-nav-btn.active { color:#0d1220; background:var(--sam-accent); border-color:var(--sam-accent); box-shadow:0 0 10px rgba(143,159,255,0.3); font-weight:bold; }
        .sam-shop-nav-btn .sam-shop-nav-cnt { font-size:10px; opacity:0.75; margin-left:2px; }
        /* 中央list: flex:1 で残りスペースを占有し, 自身がスクロール */
        .sam-shop-list { flex:1 1 auto; min-height:0; padding:8px 6px 12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; }
        .sam-shop-list::-webkit-scrollbar { width:5px; }
        .sam-shop-list::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:3px; }
        /* 更新中の表示(リストエリアを置き換え) */
        .sam-shop-refreshing { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:20px; text-align:center; color:var(--sam-sub); font-size:13px; line-height:1.6; }
        .sam-shop-refreshing .sam-shop-refreshing-spin { font-size:24px; animation:sam-spin 1.2s linear infinite reverse; }
        @keyframes sam-spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
        /* 血統融合中: 🧬 拡大縮小のイージング(回転ではない), ショップ更新の回転アイコンと区別 */
        .sam-fusion-pulse { display:inline-block; font-size:26px; line-height:1; transform-origin:center; animation:samFusionPulse 1.4s ease-in-out infinite; }
        @keyframes samFusionPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.25); } }
        /* 商品カード( 开局.html の .item-card 選択/無効モードを参考) */
        .sam-shop-item { background:var(--sam-card); border:1px solid var(--sam-border); border-radius:8px; padding:10px; cursor:pointer; transition:all 0.15s; position:relative; overflow:visible; }
        .sam-shop-item::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sam-border); opacity:0; transition:opacity 0.15s; border-radius:8px 0 0 8px; }
        .sam-shop-item:hover:not(.disabled) { border-color:var(--sam-accent); transform:translateY(-1px); }
        .sam-shop-item:hover:not(.disabled)::before { opacity:0.6; }
        /* 選択状態: 枠線が点灯(テーマ主色) + 発光 + 左バーを太く */
        .sam-shop-item.selected { background:linear-gradient(180deg, var(--sam-card), rgba(0,0,0,0.04)); border-color:var(--sam-accent); box-shadow:0 0 0 1px var(--sam-border), 0 0 12px rgba(0,0,0,0.18); }
        .sam-shop-item.selected::before { background:var(--sam-accent); opacity:1; width:4px; }
        /* 右下の"選択済み"バッジ(既定は非表示, 選択時に表示) */
        .sam-shop-item .sam-shop-sel-corner { position:absolute; right:-1px; bottom:-1px; background:var(--sam-accent); color:var(--sam-dark); font-size:10px; font-weight:bold; padding:2px 8px; border-top-left-radius:6px; border-bottom-right-radius:8px; box-shadow:0 0 6px rgba(0,0,0,0.25); display:none; letter-spacing:0.5px; line-height:1.4; }
        .sam-shop-item.selected .sam-shop-sel-corner { display:block; }
        /* 無効状態(残高不足): グレー調 + クリック不可 + hover変化なし */
        .sam-shop-item.disabled { opacity:0.45; cursor:not-allowed; filter:grayscale(0.7); }
        .sam-shop-item.disabled:hover { transform:none; box-shadow:none; border-color:var(--sam-border); }
        .sam-shop-item.disabled:hover::before { opacity:0; }
        .sam-shop-item-head { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; margin-bottom:6px; min-width:0; }
        .sam-shop-item-name { font-weight:bold; font-size:13px; color:var(--sam-text); line-height:1.25; min-width:0; overflow-wrap:anywhere; }
        .sam-shop-item.selected .sam-shop-item-name { color:var(--sam-accent); }
        .sam-shop-item-meta { flex-shrink:0; font-size:11px; font-weight:900; padding:1px 7px; border-radius:3px; border:1px solid; line-height:1.4; min-width:30px; text-align:center; }
        .sam-shop-item-meta.q-F { color:var(--sam-q-f); border-color:var(--sam-q-f); background:rgba(148,163,184,0.14); }
        .sam-shop-item-meta.q-E { color:var(--sam-q-e); border-color:var(--sam-q-e); background:rgba(248,250,252,0.10); }
        .sam-shop-item-meta.q-D { color:var(--sam-q-d); border-color:var(--sam-q-d); background:rgba(34,197,94,0.14); }
        .sam-shop-item-meta.q-C { color:var(--sam-q-c); border-color:var(--sam-q-c); background:rgba(59,130,246,0.14); }
        .sam-shop-item-meta.q-B { color:var(--sam-q-b); border-color:var(--sam-q-b); background:rgba(168,85,247,0.16); }
        .sam-shop-item-meta.q-A { color:var(--sam-q-a); border-color:var(--sam-q-a); background:rgba(249,115,22,0.16); }
        .sam-shop-item-meta.q-S { color:var(--sam-q-s); border-color:var(--sam-q-s); background:rgba(234,179,8,0.16); text-shadow:0 0 4px rgba(234,179,8,0.5); }
        .sam-shop-item-meta.q-SS { color:var(--sam-q-ss); border-color:var(--sam-q-ss); background:rgba(239,68,68,0.18); text-shadow:0 0 4px rgba(239,68,68,0.6); }
        .sam-shop-item-meta.q-SSS { color:var(--sam-q-sss); border-color:var(--sam-q-sss); background:rgba(236,72,153,0.20); text-shadow:0 0 5px rgba(236,72,153,0.7); box-shadow:0 0 6px rgba(236,72,153,0.4); }
        .sam-shop-item-attrs { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
        .sam-shop-chip { font-size:10px; padding:1px 6px; border-radius:8px; background:var(--sam-dark); border:1px solid var(--sam-border); color:var(--sam-text); line-height:1.4; }
        .sam-shop-chip b { color:var(--sam-accent); font-weight:normal; }
        .sam-shop-item-detail { font-size:11px; color:var(--sam-text); padding:4px 0 2px; border-top:1px dashed var(--sam-border); line-height:1.5; }
        .sam-shop-item-detail b { color:var(--sam-accent); }
        /* 形態/形態強化 スキル子リスト: 外側"スキル(N)"折りたたみブロック(上部の区切り線) + 内側の各スキル子折りたたみブロック */
        details.sam-shop-sk-list { margin-top:6px; }
        details.sam-shop-sk-list > .sam-fc-collapse-sum { border-top:1px dashed var(--sam-border); padding-top:4px; }
        details.sam-shop-sk-item { margin-bottom:4px; margin-left:6px; }
        details.sam-shop-sk-item > .sam-fc-collapse-sum { color:var(--sam-text); font-size:11px; }
        details.sam-shop-sk-item > .sam-fc-content { padding-left:6px; }
        .sam-shop-item-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; }
        .sam-shop-price { font-size:13px; font-weight:bold; color:var(--sam-thp, #e5c166); text-shadow:0 0 5px rgba(229,193,102,0.4); }
        /* ショップ商品カード：構造化された区分け，効果を一件ずつ表示 */
        #samsara-panel .sam-shop-item { display:flex; flex-direction:column; }
        #samsara-panel .sam-shop-section { margin-top:8px; }
        #samsara-panel .sam-shop-section-title { margin-bottom:5px; color:var(--sam-sub); font-size:10.5px; font-weight:700; letter-spacing:.04em; }
        #samsara-panel .sam-shop-basic-block { padding-top:7px; border-top:1px solid color-mix(in srgb,var(--sam-border) 72%,transparent); }
        #samsara-panel .sam-shop-item-attrs { display:flex; flex-wrap:wrap; gap:5px; margin-top:0; }
        #samsara-panel .sam-shop-effect-list { display:grid; gap:6px; }
        #samsara-panel .sam-shop-effect-card { padding:7px 8px; border:1px solid var(--sam-border); border-radius:7px; background:color-mix(in srgb,var(--sam-card) 78%,transparent); }
        #samsara-panel .sam-shop-effect-card-name { margin-bottom:3px; color:var(--sam-text); font-size:11.5px; font-weight:700; line-height:1.35; }
        #samsara-panel .sam-shop-effect-card-text { color:var(--sam-sub); font-size:11.5px; line-height:1.55; white-space:normal; overflow-wrap:anywhere; word-break:break-word; }
        #samsara-panel .sam-shop-description-block { padding:7px 8px; border-left:2px solid color-mix(in srgb,var(--sam-accent) 55%,var(--sam-border)); border-radius:0 6px 6px 0; background:color-mix(in srgb,var(--sam-card) 48%,transparent); }
        #samsara-panel .sam-shop-description-block .sam-shop-section-title { margin-bottom:3px; }
        #samsara-panel .sam-shop-description-text { color:var(--sam-sub); font-size:11.5px; line-height:1.5; white-space:normal; overflow-wrap:anywhere; word-break:break-word; }
        #samsara-panel .sam-shop-item-foot { margin-top:10px; padding-top:8px; border-top:1px solid var(--sam-border); flex-wrap:wrap; }

        .sam-shop-qty { display:flex; align-items:center; gap:2px; }
        .sam-shop-qty-btn { width:22px; height:22px; border:1px solid var(--sam-border); border-radius:4px; background:var(--sam-dark); color:var(--sam-text); font-size:12px; cursor:pointer; line-height:1; }
        .sam-shop-qty-btn:hover { border-color:var(--sam-accent); color:var(--sam-accent); }
        .sam-shop-qty-inp { width:36px; height:22px; text-align:center; border:1px solid var(--sam-border); border-radius:4px; background:var(--sam-dark); color:var(--sam-text); font-size:11px; outline:none; }
        .sam-shop-empty { font-size:12px; color:var(--sam-sub); padding:20px 8px; text-align:center; }
        /* 下部カートバー: flex の最終項目として常に下部に固定( stickyは使用しない) */
        .sam-shop-foot { flex-shrink:0; display:flex; align-items:center; gap:8px; padding:8px 10px; border-top:1px solid var(--sam-border); background:var(--sam-card); z-index:5; }
        .sam-shop-foot-info { flex:1 1 auto; min-width:0; font-size:11px; color:var(--sam-sub); line-height:1.3; }
        .sam-shop-foot-info b { color:var(--sam-thp, #e5c166); font-weight:bold; }
        .sam-shop-foot-info .sam-shop-foot-warn { color:var(--sam-hp); }
        .sam-shop-foot-info .sam-shop-foot-remain { color:var(--sam-mn, #7fd4c1); font-weight:bold; }
        .sam-shop-foot-info .sam-shop-foot-remain.insufficient { color:var(--sam-hp); }
        .sam-shop-exec-btn { flex:0 0 auto; padding:6px 16px; border:1px solid rgba(229,193,102,0.5); border-radius:6px; background:linear-gradient(135deg, rgba(212,175,55,0.2), rgba(255,247,214,0.1)); color:var(--sam-thp, #e5c166); font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:all 0.15s; }
        .sam-shop-exec-btn:hover:not([disabled]) { transform:translateY(-1px); box-shadow:0 3px 8px rgba(229,193,102,0.25); }
        .sam-shop-exec-btn[disabled] { opacity:0.5; cursor:not-allowed; }
        .sam-buff-chip { display:flex; flex-direction:column; align-items:center; gap:1px; padding:4px 10px; border-radius:8px; font-size:11px; cursor:pointer; border:1px solid; flex-shrink:0; transition:transform 0.15s, box-shadow 0.15s; line-height:1.2; position:relative; }
        .sam-buff-chip:hover { transform:translateY(-2px); box-shadow:0 3px 8px rgba(0,0,0,0.4); }
        .sam-buff-chip .sam-buff-name { font-weight:bold; }
        .sam-buff-chip .sam-buff-dur { font-size:9px; opacity:0.85; }
        .sam-buff-chip.バフ { color:#56bf7b; border-color:#56bf7b; background:rgba(86,191,123,0.14); }
        .sam-buff-chip.デバフ { color:var(--sam-hp); border-color:var(--sam-hp); background:rgba(228,88,125,0.14); }
        .sam-buff-chip.特殊 { color:var(--sam-accent); border-color:var(--sam-accent); background:rgba(143,159,255,0.14); }
        /* 編集モード: 右側に削除ボタン用の余白を確保; 削除ボタンはchip内で小さな丸点に縮小(sam-fc-del-btnの既定22pxを上書き) */
        .sam-buff-chip.is-edit { padding-right:16px; }
        .sam-buff-chip .sam-fc-del-btn { position:absolute; top:1px; right:1px; width:14px; height:14px; font-size:9px; line-height:1; margin:0; padding:0; border:none; border-radius:50%; z-index:3; }
        .sam-buff-empty { font-size:11px; color:var(--sam-sub); padding:4px 0; }

        /* Tab本体 — flexのスクロールチェーンには min-height:0が必要，でないと展開後に内部スクロールできない */
        .sam-main { display:flex; flex:1; min-height:0; overflow:hidden; }
        .sam-tab-rail { flex:0 0 58px; display:flex; flex-direction:column; border-right:1px solid var(--sam-border); background:var(--sam-dark); overflow-y:auto; min-height:0; -webkit-overflow-scrolling:touch; }
        .sam-tab-rail::-webkit-scrollbar { width:4px; }
        .sam-tab-rail::-webkit-scrollbar-thumb { background:var(--sam-border); }
        .sam-tab-btn { padding:8px 2px; text-align:center; font-size:11px; font-weight:bold; cursor:pointer; border-left:3px solid transparent; color:var(--sam-sub); transition:all 0.2s; line-height:1.2; }
        .sam-tab-btn:hover { background:var(--sam-hover); color:var(--sam-text); }
        .sam-tab-btn.active { color:var(--sam-accent); border-left-color:var(--sam-accent); background:var(--sam-hover); }
        .sam-tab-content { flex:1; min-height:0; overflow-x:hidden; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; touch-action:pan-y; padding:8px 10px; }
        .sam-tab-content::-webkit-scrollbar { width:6px; }
        .sam-tab-content::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:3px; }

        /* カード/グリッド */
        .sam-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:6px; }
        .sam-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:0 4px; }
        .sam-grid-2 > .sam-row { padding:5px 8px; background:rgba(0,0,0,0.18); border-radius:4px; border-bottom:1px solid rgba(143,159,255,0.06); }
        .sam-grid-2 > .sam-row .k { min-width:48px; }
        .sam-grid-2 > .sam-row .v { padding-left:10px; }
        .sam-card { padding:8px 10px; background:var(--sam-card); border:1px solid var(--sam-border); border-left:3px solid var(--sam-sub); border-radius:5px; cursor:pointer; transition:transform 0.15s,background 0.15s; }
        .sam-card:hover { transform:translateY(-2px); background:var(--sam-hover); }
        .sam-card.q-F{border-left-color:var(--sam-q-f);} .sam-card.q-E{border-left-color:var(--sam-q-e);}
        .sam-card.q-D{border-left-color:var(--sam-q-d);} .sam-card.q-C{border-left-color:var(--sam-q-c);}
        .sam-card.q-B{border-left-color:var(--sam-q-b);} .sam-card.q-A{border-left-color:var(--sam-q-a);}
        .sam-card.q-S{border-left-color:var(--sam-q-s);} .sam-card.q-SS{border-left-color:var(--sam-q-ss);}
        .sam-card.q-SSS{border-left-color:var(--sam-q-sss);}
        .sam-card-title { font-size:13px; font-weight:bold; color:var(--sam-text); margin-bottom:3px; }
        .sam-card-meta { font-size:11px; color:var(--sam-sub); }
        .sam-card-desc { font-size:11px; color:var(--sam-sub); margin-top:4px; line-height:1.4; }
        /* ===== 経営/資産: 各資産を折りたたみ欄にし, 展開で全資料を表示(整形レイアウト) ===== */
        .sam-asset-wrap { display:flex; flex-direction:column; gap:10px; }
        .sam-asset { background:linear-gradient(160deg,var(--sam-card),rgba(0,0,0,0.22)); border:1px solid var(--sam-border); border-radius:9px; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.25); transition:box-shadow 0.2s,border-color 0.2s; }
        .sam-asset[open] { border-color:var(--sam-accent); box-shadow:0 3px 16px rgba(0,0,0,0.4); }
        .sam-asset-sum { display:flex; align-items:center; gap:8px; padding:9px 12px; cursor:pointer; user-select:none; list-style:none; background:rgba(143,159,255,0.05); }
        .sam-asset-sum::-webkit-details-marker { display:none; }
        .sam-asset-sum::after { content:'▾'; margin-left:auto; font-size:11px; color:var(--sam-sub); transition:transform 0.2s; }
        .sam-asset:not([open]) .sam-asset-sum::after { transform:rotate(-90deg); }
        .sam-asset-ico { font-size:18px; flex:0 0 auto; filter:drop-shadow(0 0 3px rgba(143,159,255,0.4)); }
        .sam-asset-name { font-size:14px; font-weight:900; color:var(--sam-text); flex:0 1 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sam-asset-badge { font-size:10px; font-weight:bold; color:var(--sam-accent); background:rgba(143,159,255,0.14); border:1px solid rgba(143,159,255,0.28); border-radius:10px; padding:1px 8px; flex:0 0 auto; }
        .sam-asset-integ { font-size:11px; font-weight:900; padding:1px 7px; border-radius:8px; flex:0 0 auto; }
        .sam-asset-integ.good { color:#7fd6a0; background:rgba(127,214,160,0.12); }
        .sam-asset-integ.warn { color:var(--sam-thp); background:rgba(229,193,102,0.12); }
        .sam-asset-integ.bad { color:var(--sam-hp); background:rgba(228,88,125,0.12); }
.sam-asset-owner-chip { display:inline-flex; align-items:center; max-width:180px; padding:1px 7px; border-radius:9px; border:1px solid var(--sam-border); background:var(--sam-hover); color:var(--sam-text); font-size:10px; line-height:1.5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sam-asset-owner-chip.player { color:var(--sam-accent); border-color:var(--sam-accent); }
        .sam-asset-owner-chip.unowned { color:var(--sam-sub); border-style:dashed; }
        .sam-asset-owner-list { display:flex; align-items:center; justify-content:flex-end; gap:4px; flex-wrap:wrap; min-width:0; }
                .sam-asset-body { padding:10px 12px 12px; border-top:1px solid rgba(143,159,255,0.10); display:flex; flex-direction:column; gap:10px; }
        /* 概要エリア: 完成度プログレスバー / 規模ドット / タイプ */
        .sam-asset-overview { display:flex; flex-direction:column; gap:6px; padding:8px 10px; background:rgba(0,0,0,0.16); border-radius:6px; }
        .sam-asset-ov-row { display:flex; align-items:center; gap:8px; font-size:12px; }
        .sam-asset-ov-lbl { flex:0 0 auto; min-width:52px; color:var(--sam-sub); }
        .sam-asset-ov-val { flex:0 0 auto; color:var(--sam-text); font-weight:bold; margin-left:auto; }
        .sam-asset-bar { flex:1 1 auto; height:8px; background:rgba(0,0,0,0.35); border-radius:5px; overflow:hidden; min-width:60px; }
        .sam-asset-bar-fill { height:100%; border-radius:5px; background:var(--sam-accent); transition:width 0.3s; }
        .sam-asset-bar-fill.good { background:linear-gradient(90deg,#5db487,#7fd6a0); }
        .sam-asset-bar-fill.warn { background:linear-gradient(90deg,#c9a544,var(--sam-thp)); }
        .sam-asset-bar-fill.bad { background:linear-gradient(90deg,#c04663,var(--sam-hp)); }
        .sam-asset-bar-fill.energy { background:linear-gradient(90deg,var(--sam-ep),#8f9fff); }
        .sam-asset-scale { display:flex; align-items:center; gap:3px; flex:1 1 auto; }
        .sam-asset-dot { width:8px; height:8px; border-radius:50%; background:rgba(143,159,255,0.18); flex:0 0 auto; }
        .sam-asset-dot.on { background:var(--sam-accent); box-shadow:0 0 4px var(--sam-accent); }
        .sam-asset-scale-num { margin-left:6px; font-size:11px; color:var(--sam-sub); }
        /* セクション */
        .sam-asset-sec { display:flex; flex-direction:column; gap:6px; }
        .sam-asset-sec-t { font-size:12px; font-weight:900; color:var(--sam-accent); padding-left:6px; border-left:3px solid var(--sam-accent); }
        .sam-asset-text { font-size:12px; color:var(--sam-text); line-height:1.6; white-space:pre-wrap; word-break:break-word; padding:6px 9px; background:rgba(0,0,0,0.16); border-radius:5px; }
        .sam-asset-none { color:var(--sam-sub); font-style:italic; opacity:0.7; }
        /* エネルギー */
        .sam-asset-energy { display:flex; align-items:center; gap:8px; }
        .sam-asset-energy-num { flex:0 0 auto; font-size:11px; font-weight:bold; color:var(--sam-text); }
        /* 消費ユニット */
        .sam-asset-unit { padding:7px 9px; background:rgba(0,0,0,0.16); border-radius:5px; border-left:2px solid var(--sam-ep); display:flex; flex-direction:column; gap:5px; }
        .sam-asset-unit-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .sam-asset-unit-name { font-size:12px; font-weight:bold; color:var(--sam-text); }
        .sam-asset-unit-num { font-size:11px; color:var(--sam-sub); font-weight:bold; }
        .sam-asset-unit-bonus { margin-top:2px; }
        /* タグ chips */
        .sam-asset-tags { display:flex; flex-wrap:wrap; gap:4px; }
        .sam-asset-tag { font-size:10px; padding:2px 8px; border-radius:9px; background:rgba(143,159,255,0.12); color:var(--sam-accent); border:1px solid rgba(143,159,255,0.22); }
        /* 建設シーケンス */
        .sam-asset-seq { padding:7px 9px; background:rgba(0,0,0,0.16); border-radius:5px; display:flex; flex-direction:column; gap:6px; }
        .sam-asset-seq-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .sam-asset-seq-name { font-size:12px; font-weight:900; color:var(--sam-text); }
        .sam-asset-stage { font-size:10px; font-weight:bold; padding:1px 8px; border-radius:8px; flex:0 0 auto; }
        .sam-asset-stage.s1 { color:var(--sam-sub); background:rgba(143,159,255,0.10); border:1px solid rgba(143,159,255,0.18); }
        .sam-asset-stage.s2 { color:#7fd6a0; background:rgba(127,214,160,0.12); border:1px solid rgba(127,214,160,0.28); }
        .sam-asset-stage.s3 { color:var(--sam-ep); background:rgba(143,159,255,0.14); border:1px solid rgba(143,159,255,0.30); }
        .sam-asset-stage.s4 { color:var(--sam-thp); background:rgba(229,193,102,0.14); border:1px solid rgba(229,193,102,0.32); }
        .sam-asset-stage.s5 { color:var(--sam-hp); background:rgba(228,88,125,0.14); border:1px solid rgba(228,88,125,0.32); }
        .sam-asset-seq-rows { display:flex; flex-direction:column; gap:2px; }
        .sam-asset-kv { display:flex; gap:8px; font-size:12px; line-height:1.6; padding:1px 0; }
        .sam-asset-kv .k { flex:0 0 auto; min-width:72px; color:var(--sam-sub); }
        .sam-asset-kv .v { flex:1 1 auto; color:var(--sam-text); font-weight:bold; word-break:break-word; }
        .sam-asset-seq-bonus { margin-top:2px; }
        /* 駐留人員 */
        .sam-asset-staff { display:flex; flex-direction:column; gap:4px; }
        .sam-asset-staff-item { display:flex; justify-content:space-between; gap:8px; font-size:12px; padding:4px 9px; background:rgba(0,0,0,0.16); border-radius:5px; }
        .sam-asset-staff-name { color:var(--sam-text); font-weight:bold; }
        .sam-asset-staff-role { color:var(--sam-sub); }
        /* 未処理イベント */
        .sam-asset-todo { display:flex; flex-direction:column; gap:4px; }
        .sam-asset-todo-item { font-size:12px; color:var(--sam-text); line-height:1.5; padding:5px 9px 5px 12px; position:relative; background:rgba(229,193,102,0.06); border-radius:5px; border-left:2px solid var(--sam-thp); }
        /* 未処理イベントはクリック可能: クリックで入力欄へ流し込む */
        .sam-asset-todo-item.clickable { display:flex; align-items:center; gap:6px; cursor:pointer; transition:background 0.15s, border-color 0.15s; }
        .sam-asset-todo-item.clickable:hover { background:rgba(229,193,102,0.18); border-left-color:var(--sam-hp); }
        .sam-asset-todo-item.clickable:active { transform:scale(0.98); }
        .sam-asset-todo-text { flex:1 1 auto; word-break:break-word; }
        .sam-asset-todo-go { flex:0 0 auto; font-size:11px; opacity:0.45; transition:opacity 0.15s; }
        .sam-asset-todo-item.clickable:hover .sam-asset-todo-go { opacity:1; }
        /* NPC単列カード(関係パネル) */
        .sam-npc-card { padding:8px 10px; background:var(--sam-card); border:1px solid var(--sam-border); border-left:3px solid var(--sam-sub); border-radius:6px; margin-bottom:6px; cursor:pointer; transition:transform 0.15s,background 0.15s,box-shadow 0.2s; }
        .sam-npc-card:hover { transform:translateY(-1px); background:var(--sam-hover); box-shadow:0 2px 10px rgba(0,0,0,0.3); }
        .sam-npc-card.q-F{border-left-color:var(--sam-q-f);} .sam-npc-card.q-E{border-left-color:var(--sam-q-e);}
        .sam-npc-card.q-D{border-left-color:var(--sam-q-d);} .sam-npc-card.q-C{border-left-color:var(--sam-q-c);}
        .sam-npc-card.q-B{border-left-color:var(--sam-q-b);} .sam-npc-card.q-A{border-left-color:var(--sam-q-a);}
        .sam-npc-card.q-S{border-left-color:var(--sam-q-s);} .sam-npc-card.q-SS{border-left-color:var(--sam-q-ss);}
        .sam-npc-card.q-SSS{border-left-color:var(--sam-q-sss);}
        .sam-npc-name { font-size:13px; font-weight:bold; color:var(--sam-text); margin-bottom:4px; }
        .sam-npc-head { display:flex; gap:8px; align-items:center; margin-bottom:6px; }
        .sam-npc-avatar { position:relative; width:54px; height:66px; border-radius:6px; overflow:hidden; background:rgba(0,0,0,0.25); border:1px solid var(--sam-border); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:box-shadow 0.2s, transform 0.15s; }
        .sam-npc-avatar:hover { box-shadow:0 0 12px rgba(143,159,255,0.4); transform:translateY(-1px); }
        .sam-npc-avatar img { width:100%; height:100%; object-fit:cover; object-position:center top; }
        .sam-npc-avatar-ph { font-size:20px; opacity:0.55; }
        .sam-npc-avatar.has-img .sam-npc-avatar-ph { display:none; }
        .sam-npc-portrait-btn { flex-shrink:0; padding:4px 8px; font-size:11px; color:var(--sam-accent); background:rgba(143,159,255,0.1); border:1px solid rgba(143,159,255,0.3); border-radius:4px; cursor:pointer; line-height:1.4; white-space:nowrap; }
        .sam-npc-portrait-btn:hover { background:rgba(143,159,255,0.22); }
        .sam-npc-head-info { flex:1; min-width:0; }
        .sam-npc-head-name { font-size:14px; font-weight:bold; color:var(--sam-text); line-height:1.3; word-break:break-all; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .sam-npc-form-tag { font-size:11px; font-weight:bold; font-style:italic; color:var(--sam-thp); background:rgba(102,170,170,0.15); border:1px solid rgba(102,170,170,0.35); padding:1px 6px; border-radius:8px; white-space:nowrap; }
        .sam-npc-del { position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:4px; background:rgba(180,40,30,0.85); color:#fff; border:none; cursor:pointer; font-size:13px; line-height:1; display:flex; align-items:center; justify-content:center; flex-shrink:0; z-index:2; }
        .sam-npc-del:hover { background:rgba(220,60,40,1); }
        .sam-npc-card { position:relative; }
        .sam-npc-row { font-size:11px; color:var(--sam-sub); line-height:1.5; }
        .sam-npc-row .k { color:var(--sam-accent); font-weight:bold; }
        .sam-npc-row .v { color:var(--sam-text); }
        .sam-npc-quote { font-size:11px; color:var(--sam-sub); font-style:italic; margin-top:4px; padding:4px 8px; border-left:2px solid var(--sam-border); background:rgba(0,0,0,0.15); border-radius:0 4px 4px 0; line-height:1.5; }
        .sam-npc-quote::before { content:'💬 '; }
        /* ネイティブの折りたたみ枠(NPC在席パネルの折りたたみ領域) */
        .sam-npc-details { margin-top:6px; }
        .sam-npc-details > summary { font-size:11px; color:var(--sam-accent); cursor:pointer; padding:3px 6px; background:rgba(143,159,255,0.08); border-radius:4px; user-select:none; list-style:none; }
        .sam-npc-details > summary::-webkit-details-marker { display:none; }
        .sam-npc-details > summary::before { content:'▸ '; }
        .sam-npc-details[open] > summary::before { content:'▾ '; }
        .sam-npc-details[open] > summary { margin-bottom:4px; }
        /* NPCカード内のコンパクトなプログレスバー(HP/EP/THP) */
        .sam-npc-bars { display:flex; flex-direction:column; gap:4px; margin:6px 0 4px; }
        .sam-npc-bar { display:flex; align-items:center; gap:6px; }
        .sam-npc-bar .lbl { font-size:10px; font-weight:bold; width:28px; flex-shrink:0; }
        .sam-npc-bar .trk { flex:1; height:9px; background:var(--sam-dark); border-radius:5px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); position:relative; }
        .sam-npc-bar .fl { height:100%; border-radius:5px; transition:width 0.5s cubic-bezier(0.2,0.8,0.2,1); }
        .sam-npc-bar .num { font-size:10px; color:var(--sam-sub); width:64px; text-align:right; flex-shrink:0; }
        /* NPCカードのフィールドグリッド(種族/身份などの二列レイアウト) */
        .sam-npc-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 12px; margin:4px 0; }
        .sam-npc-grid .sam-npc-row { font-size:11px; line-height:1.5; }
        .sam-npc-sec { height:0; margin:6px 0; border:0; border-top:1px solid rgba(143,159,255,0.16); padding:0; font-size:0; }
        /* スキルの折りたたみグループ(形態/血統スキル用) */
        .sam-skill-group { margin:4px 0 6px; }
        .sam-skill-group > summary { font-size:12px; font-weight:bold; color:var(--sam-accent); cursor:pointer; padding:4px 8px; background:rgba(143,159,255,0.08); border-radius:4px; user-select:none; list-style:none; border-left:3px solid var(--sam-accent); }
        .sam-skill-group > summary::-webkit-details-marker { display:none; }
        .sam-skill-group > summary::before { content:'▸ '; }
        .sam-skill-group[open] > summary::before { content:'▾ '; }
        .sam-skill-group[open] > summary { margin-bottom:4px; }
        .sam-skill-group .sam-card-list { grid-template-columns:1fr; margin-top:4px; }
        /* ===== 詳細ポップアップの整形レイアウト ===== */
        .sam-detail { padding:4px 2px; }
        .sam-detail .sam-stat-grid { grid-template-columns:repeat(6,1fr); gap:3px; }
        .sam-detail .sam-stat-cell { padding:2px 0; background:rgba(0,0,0,0.25); }
        .sam-detail .sam-stat-cell .sn { font-size:9px; }
        .sam-detail .sam-stat-cell .sv { font-size:12px; }
        .sam-detail-sec { font-size:12px; font-weight:900; color:var(--sam-accent); margin:10px 0 5px; padding:3px 8px; border-left:3px solid var(--sam-accent); background:rgba(143,159,255,0.06); border-radius:0 4px 4px 0; }
        .sam-detail-sec:first-child { margin-top:0; }
        .sam-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px 14px; }
        .sam-detail-grid .sam-d-row { display:flex; gap:6px; font-size:12px; line-height:1.6; padding:2px 0; border-bottom:1px dashed rgba(143,159,255,0.06); }
        .sam-detail-grid .sam-d-row .k { color:var(--sam-sub); flex:0 0 auto; min-width:52px; }
        .sam-detail-grid .sam-d-row .v { color:var(--sam-text); font-weight:bold; }
        .sam-d-block { margin:4px 0 8px; }
        .sam-d-block .sam-d-label { font-size:11px; font-weight:bold; color:var(--sam-accent); margin-bottom:2px; }
        .sam-d-block .sam-d-content { font-size:12px; color:var(--sam-text); line-height:1.6; text-align:left; word-break:break-word; white-space:pre-wrap; padding:5px 8px; background:rgba(0,0,0,0.18); border-radius:4px; border-left:2px solid var(--sam-border); }
        .sam-d-tags { display:flex; flex-wrap:wrap; gap:4px; padding:2px 0; }
        .sam-d-tag { font-size:11px; padding:2px 8px; border-radius:10px; background:rgba(143,159,255,0.14); color:var(--sam-accent); border:1px solid rgba(143,159,255,0.25); }
        .sam-d-sub { margin:4px 0 6px; }
        .sam-d-sub > summary { font-size:12px; font-weight:bold; color:var(--sam-accent); cursor:pointer; padding:4px 8px; background:rgba(143,159,255,0.08); border-radius:4px; user-select:none; list-style:none; border-left:3px solid var(--sam-accent); }
        .sam-d-sub > summary::-webkit-details-marker { display:none; }
        .sam-d-sub > summary::before { content:'▸ '; }
        .sam-d-sub[open] > summary::before { content:'▾ '; }
        .sam-d-sub[open] > summary { margin-bottom:4px; }
        .sam-d-sub-body { padding:4px 0 0 10px; border-left:2px solid rgba(143,159,255,0.12); margin-left:4px; }
        @media (max-width:768px) { .sam-detail-grid { grid-template-columns:1fr; } }
        .sam-sec { margin:8px 0; }
        .sam-sec:first-child { margin-top:0; }
        .sam-sec > .sam-sec-sum { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:900; color:var(--sam-accent); cursor:pointer; padding:4px 8px; border-left:3px solid var(--sam-accent); background:rgba(143,159,255,0.06); border-radius:0 4px 4px 0; user-select:none; list-style:none; }
        .sam-sec > .sam-sec-sum::-webkit-details-marker { display:none; }
        .sam-sec > .sam-sec-sum::before { content:'▾ '; }
        .sam-sec:not([open]) > .sam-sec-sum::before { content:'▸ '; }
        .sam-sec > .sam-sec-sum .sam-sec-title { flex:1 1 auto; min-width:0; }
        .sam-sec > .sam-sec-sum .sam-sec-cnt { font-size:11px; font-weight:normal; color:var(--sam-sub); margin-left:4px; }
        .sam-sec > .sam-sec-sum .sam-rumor-clear-btn { flex:0 0 auto; padding:2px 8px; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid var(--sam-hp); color:var(--sam-hp); background:rgba(228,88,125,0.08); cursor:pointer; }
        .sam-sec > .sam-sec-sum .sam-rumor-clear-btn:hover { background:var(--sam-hp); color:#fff; }
        .sam-sec > .sam-sec-body { margin-top:4px; }
        /* 噂: 上部に一括全削除 + 個別削除 + 交易ボタン */
        .sam-rumor-toolbar { display:flex; justify-content:flex-end; gap:6px; margin-bottom:6px; }
        .sam-rumor-clearall-btn { padding:4px 10px; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid var(--sam-hp); color:var(--sam-hp); background:rgba(228,88,125,0.10); cursor:pointer; }
        .sam-rumor-clearall-btn:hover { background:var(--sam-hp); color:#fff; }
        .sam-rumor-del-btn { flex:0 0 auto; width:20px; height:20px; border-radius:4px; border:1px solid var(--sam-hp); background:rgba(228,88,125,0.10); color:var(--sam-hp); cursor:pointer; font-size:12px; line-height:1; display:flex; align-items:center; justify-content:center; padding:0; }
        .sam-rumor-del-btn:hover { background:var(--sam-hp); color:#fff; }
        .sam-rumor-trade-btn { margin-left:6px; padding:1px 8px; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid var(--sam-thp); color:var(--sam-thp); background:rgba(229,193,102,0.10); cursor:pointer; }
        .sam-rumor-trade-btn:hover { background:var(--sam-thp); color:#1a1a1a; }
        .sam-rumor-price { display:inline-flex; align-items:center; gap:4px; }
        /* 確認ポップアップ: 幅は自動適応 + 長文スクロール可 + タッチ領域確保 */
        .sam-confirm-box {
            width:min(360px, 100%); min-width:0; max-width:100%; margin:auto;
            max-height:calc(100vh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            max-height:calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            overflow-x:hidden; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain;
            background:var(--sam-bg); border:1px solid var(--sam-accent); border-radius:10px;
            padding:16px; box-shadow:0 12px 40px rgba(0,0,0,0.7); box-sizing:border-box;
        }
        .sam-confirm-title { font-size:14px; font-weight:900; color:var(--sam-accent); margin-bottom:10px; }
        .sam-confirm-body { font-size:12px; color:var(--sam-text); line-height:1.5; margin-bottom:14px; word-break:break-word; overflow-wrap:anywhere; }
        .sam-confirm-actions { display:flex; justify-content:flex-end; gap:8px; }
        .sam-confirm-btn { min-height:40px; min-width:72px; padding:10px 16px; font-size:13px; font-weight:bold; border-radius:6px; border:1px solid var(--sam-border); background:rgba(143,159,255,0.10); color:var(--sam-text); cursor:pointer; }
        .sam-confirm-btn.ok { border-color:var(--sam-hp); color:var(--sam-hp); }
        .sam-confirm-btn.ok:hover { background:var(--sam-hp); color:#fff; }
        .sam-confirm-btn.cancel:hover { background:rgba(143,159,255,0.25); }
        @media (max-width:768px) { .sam-sec > .sam-sec-sum { font-size:12px; padding:3px 6px; } }
        .sam-row { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:4px 0; border-bottom:1px dashed rgba(143,159,255,0.08); font-size:12px; }
        .sam-row .k { color:var(--sam-sub); flex:0 0 auto; min-width:60px; }
        .sam-row .v { color:var(--sam-text); font-weight:bold; text-align:right; flex:1; word-break:break-word; overflow-wrap:anywhere; }
        /* 世界安定度：0~120，100が正常基準線。 */
        .sam-world-stability { padding:8px 0 5px; }
        .sam-world-stability-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:5px; font-size:11px; }
        .sam-world-stability-head .k { color:var(--sam-sub); }
        .sam-world-stability-head .v { color:var(--sam-text); font-weight:900; font-size:12px; }
        .sam-world-stability-track { position:relative; height:12px; border-radius:7px; overflow:hidden; background:rgba(0,0,0,0.3); border:1px solid rgba(143,159,255,0.18); box-shadow:inset 0 1px 4px rgba(0,0,0,0.42); }
        .sam-world-stability-fill { height:100%; min-width:0; border-radius:6px; background:linear-gradient(90deg, var(--sam-hp), var(--sam-accent)); box-shadow:0 0 9px var(--sam-accent); transition:width .25s ease; }
        .sam-world-stability-fill.over { background:linear-gradient(90deg, var(--sam-accent), var(--sam-thp)); box-shadow:0 0 10px var(--sam-thp); }
        .sam-world-stability-mark100 { position:absolute; left:83.333333%; top:-2px; bottom:-2px; width:2px; background:rgba(255,255,255,0.82); box-shadow:0 0 5px rgba(255,255,255,0.65); pointer-events:none; }
        .sam-world-stability-scale { position:relative; height:14px; margin-top:2px; color:var(--sam-sub); font-size:9px; line-height:14px; }
        .sam-world-stability-scale .s0 { position:absolute; left:0; }
        .sam-world-stability-scale .s100 { position:absolute; left:83.333333%; transform:translateX(-50%); color:var(--sam-text); }
        .sam-world-stability-scale .s120 { position:absolute; right:0; }
        .sam-alien-list { display:flex; flex-direction:column; gap:6px; }
        .sam-alien-item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 9px; border:1px solid rgba(143,159,255,0.12); border-radius:6px; background:rgba(0,0,0,0.14); }
        .sam-alien-main { min-width:0; }
        .sam-alien-name { color:var(--sam-text); font-size:12px; font-weight:800; }
        .sam-alien-meta { margin-top:2px; color:var(--sam-sub); font-size:10.5px; word-break:break-word; }
        .sam-alien-state { flex:0 0 auto; padding:2px 7px; border-radius:9px; font-size:10px; font-weight:800; border:1px solid currentColor; }
        .sam-alien-state.waiting { color:var(--sam-sub); }
        .sam-alien-state.active { color:#56bf7b; background:rgba(86,191,123,0.08); }
        .sam-alien-state.dead { color:var(--sam-hp); opacity:0.7; }
        .sam-empty { color:var(--sam-sub); font-size:12px; text-align:center; padding:14px 0; font-style:italic; opacity:0.7; }
        /* 経営パネルの空状態: ガイド説明(何ができる/どう入手する), 味気ない[資産なし]の代替 */
        .sam-asset-empty { padding:18px 16px; color:var(--sam-sub); }
        .sam-asset-empty .ae-title { font-size:14px; font-weight:bold; color:var(--sam-text); text-align:center; margin-bottom:10px; }
        .sam-asset-empty .ae-desc { font-size:11.5px; line-height:1.7; color:var(--sam-sub); }
        .sam-asset-empty .ae-section { margin-top:12px; }
        .sam-asset-empty .ae-h { font-size:11.5px; font-weight:bold; color:var(--sam-accent); margin-bottom:4px; }
        .sam-asset-empty ul { margin:0; padding-left:16px; }
        .sam-asset-empty li { font-size:11.5px; line-height:1.7; color:var(--sam-sub); }
        .sam-asset-empty li b { color:var(--sam-text); font-weight:bold; }
        /* ===== NPCキャラクター・プロフィール(詳細ポップアップ専用, 汎用dump式レンダリングの代替) ===== */
        .sam-nd { padding:2px; }
        .sam-nd-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; padding-bottom:8px; border-bottom:1px solid var(--sam-border); margin-bottom:8px; }
        .sam-nd-name { font-size:16px; font-weight:900; color:var(--sam-text); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .sam-nd-form { font-size:11px; font-weight:bold; font-style:italic; color:var(--sam-thp); background:rgba(102,170,170,0.15); border:1px solid rgba(102,170,170,0.35); padding:2px 8px; border-radius:10px; }
        .sam-nd-badges { display:flex; gap:5px; align-items:center; }
        .sam-nd-tier { font-size:13px; font-weight:900; width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(15,18,28,0.78); border:2px solid currentColor; box-shadow:0 1px 3px rgba(0,0,0,0.3); text-shadow:0 1px 2px rgba(0,0,0,0.6); }
        .sam-nd-badge { font-size:10px; font-weight:bold; padding:2px 8px; border-radius:8px; }
        .sam-nd-badge.present { color:#56bf7b; background:rgba(86,191,123,0.14); border:1px solid rgba(86,191,123,0.4); }
        .sam-nd-badge.team { color:var(--sam-thp); background:rgba(229,193,102,0.14); border:1px solid rgba(229,193,102,0.4); }
        .sam-nd-favor { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
        .sam-nd-favor-lbl { font-size:11px; color:var(--sam-sub); flex-shrink:0; }
        .sam-nd-favor-track { position:relative; flex:1; height:8px; background:rgba(0,0,0,0.3); border-radius:5px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); }
        .sam-nd-favor-track::before { content:''; position:absolute; left:50%; top:0; bottom:0; width:1px; background:rgba(255,255,255,0.25); z-index:1; }
        .sam-nd-favor-fill { position:absolute; top:0; bottom:0; border-radius:2px; transition:width 0.4s; }
        .sam-nd-favor-fill.pos { left:50%; }
        .sam-nd-favor-fill.neg { right:50%; }
        .sam-nd-favor-val { font-size:12px; font-weight:900; min-width:36px; text-align:right; }
        .sam-nd-sec-lbl { font-size:11px; font-weight:900; color:var(--sam-accent); margin:10px 0 5px; padding:3px 8px; border-left:3px solid var(--sam-accent); background:rgba(143,159,255,0.06); border-radius:0 4px 4px 0; }
        .sam-nd-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 14px; margin-bottom:8px; }
        .sam-nd-row { display:flex; gap:6px; font-size:12px; line-height:1.7; padding:2px 0; border-bottom:1px dashed rgba(143,159,255,0.06); }
        .sam-nd-row .k { color:var(--sam-sub); flex:0 0 auto; min-width:42px; }
        .sam-nd-row .v { color:var(--sam-text); font-weight:bold; word-break:break-all; }
        .sam-nd-bars { display:flex; flex-direction:column; gap:5px; margin-bottom:6px; }
        .sam-nd-attrs { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
        .sam-nd-attr { display:flex; flex-direction:column; align-items:center; padding:4px 10px; background:rgba(0,0,0,0.25); border:1px solid var(--sam-border); border-radius:6px; min-width:54px; }
        .sam-nd-attr .k { font-size:10px; color:var(--sam-sub); }
        .sam-nd-attr .v { font-size:14px; font-weight:900; color:var(--sam-text); }
        .sam-nd-block { margin:4px 0 8px; }
        .sam-nd-block-lbl { font-size:11px; font-weight:bold; color:var(--sam-accent); margin-bottom:2px; }
        .sam-nd-block-ct { font-size:12px; color:var(--sam-text); line-height:1.7; word-break:break-word; white-space:pre-wrap; padding:6px 10px; background:rgba(0,0,0,0.18); border-radius:5px; border-left:2px solid var(--sam-accent); }
        .sam-nd-quote { font-size:12px; color:var(--sam-sub); font-style:italic; margin:6px 0 10px; padding:6px 10px; border-left:3px solid var(--sam-thp); background:rgba(229,193,102,0.06); border-radius:0 5px 5px 0; line-height:1.6; }
        .sam-nd-sub { margin:4px 0; }
        .sam-nd-sub > summary { font-size:12px; font-weight:bold; color:var(--sam-accent); cursor:pointer; padding:4px 8px; background:rgba(143,159,255,0.08); border-radius:4px; user-select:none; list-style:none; border-left:3px solid var(--sam-accent); }
        .sam-nd-sub > summary::-webkit-details-marker { display:none; }
        .sam-nd-sub > summary::before { content:'▸ '; }
        .sam-nd-sub[open] > summary::before { content:'▾ '; }
        .sam-nd-sub[open] > summary { margin-bottom:4px; }
        .sam-nd-sub-body { padding:4px 0 0 10px; border-left:2px solid rgba(143,159,255,0.12); margin-left:4px; }
        @media (max-width:520px) { .sam-nd-grid { grid-template-columns:1fr; } }
        /* ===== 武器攻撃パネル(キャラクターの派生属性 + NPC詳細の最終属性) ===== */
        .sam-wpn-divider { font-size:11px; font-weight:bold; color:var(--sam-accent); margin:10px 0 5px; padding-bottom:3px; border-bottom:1px solid rgba(143,159,255,0.15); }
        .sam-wpn-list { display:flex; flex-direction:column; gap:5px; }
        .sam-wpn-row { display:flex; flex-direction:column; gap:3px; padding:5px 10px; border-radius:5px; background:rgba(0,0,0,0.15); border:1px solid var(--sam-border); }
        .sam-wpn-row.base { background:rgba(143,159,255,0.04); border-style:dashed; border-color:rgba(143,159,255,0.2); }
        .sam-wpn-name { font-size:12px; font-weight:bold; color:var(--sam-text); }
        .sam-wpn-row.base .sam-wpn-name { color:var(--sam-sub); font-weight:normal; }
        .sam-wpn-stat { display:flex; justify-content:space-between; align-items:center; font-size:11px; padding:3px 8px; border-radius:4px; }
        .sam-wpn-stat.atk { color:var(--sam-hp); background:rgba(228,88,125,0.1); border:1px solid rgba(228,88,125,0.2); }
        .sam-wpn-stat.matk { color:var(--sam-accent); background:rgba(143,159,255,0.1); border:1px solid rgba(143,159,255,0.2); }
        .sam-wpn-stat b { font-weight:900; font-size:13px; }
        .sam-nd-wpn { display:flex; flex-direction:column; gap:5px; margin-bottom:8px; }
        .sam-nd-wpn-row { display:flex; flex-direction:column; gap:3px; padding:5px 10px; border-radius:5px; background:rgba(0,0,0,0.2); border:1px solid var(--sam-border); }
        .sam-nd-wpn-row.base { background:rgba(143,159,255,0.04); border-style:dashed; border-color:rgba(143,159,255,0.2); }
        .sam-nd-wpn-row .nm { font-size:12px; font-weight:bold; color:var(--sam-text); }
        .sam-nd-wpn-row.base .nm { color:var(--sam-sub); font-weight:normal; }
        .sam-nd-wpn-row .atk { display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--sam-hp); background:rgba(228,88,125,0.1); padding:3px 8px; border-radius:4px; }
        .sam-nd-wpn-row .matk { display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--sam-accent); background:rgba(143,159,255,0.1); padding:3px 8px; border-radius:4px; }
        .sam-nd-wpn-row .atk b, .sam-nd-wpn-row .matk b { font-weight:900; font-size:13px; }
        /* ===== 物資移譲ダイアログ(在場NPCへ装備/アイテムを移譲) ===== */
        .sam-npc-transfer { position:absolute; top:4px; z-index:2; padding:3px 8px; font-size:10px; font-weight:bold; color:var(--sam-thp); background:rgba(229,193,102,0.12); border:1px solid rgba(229,193,102,0.4); border-radius:5px; cursor:pointer; line-height:1.4; white-space:nowrap; }
        .sam-npc-transfer:hover { background:rgba(229,193,102,0.28); box-shadow:0 0 8px rgba(229,193,102,0.3); }
        .sam-npc-loot { position:absolute; top:4px; z-index:2; padding:3px 8px; font-size:10px; font-weight:bold; color:#f87171; background:rgba(248,113,113,0.12); border:1px solid rgba(248,113,113,0.4); border-radius:5px; cursor:pointer; line-height:1.4; white-space:nowrap; }
        .sam-npc-loot:hover { background:rgba(248,113,113,0.28); box-shadow:0 0 8px rgba(248,113,113,0.3); }
        /* 移譲リスト：50vh の入れ子スクロールをやめ、.sam-modal-body の単層スクロールに委ねる */
        .sam-trf-list { padding:2px; }
        .sam-trf-sec { font-size:11px; font-weight:900; color:var(--sam-accent); margin:8px 0 5px; padding:3px 8px; border-left:3px solid var(--sam-accent); background:rgba(143,159,255,0.06); border-radius:0 4px 4px 0; }
        .sam-trf-sec:first-child { margin-top:0; }
        .sam-trf-item { position:relative; padding:8px 10px; margin-bottom:6px; background:var(--sam-card); border:1px solid var(--sam-border); border-left:3px solid var(--sam-sub); border-radius:6px; cursor:pointer; transition:transform 0.15s,box-shadow 0.15s,border-color 0.15s; }
        .sam-trf-item:hover { transform:translateY(-1px); box-shadow:0 2px 10px rgba(0,0,0,0.3); }
        .sam-trf-item.selected { background:linear-gradient(180deg,rgba(22,30,46,0.7),rgba(143,159,255,0.08)); border-color:var(--sam-accent); box-shadow:0 0 0 1px rgba(143,159,255,0.35),0 0 12px rgba(143,159,255,0.18); }
        .sam-trf-item.selected { border-left-color:var(--sam-accent); }
        .sam-trf-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:2px; }
        .sam-trf-name { font-size:13px; font-weight:bold; color:var(--sam-text); word-break:break-all; }
        .sam-trf-qtag { font-size:11px; font-weight:900; padding:1px 7px; border-radius:4px; border:1px solid currentColor; flex-shrink:0; }
        .sam-trf-qtag.q-F{color:var(--sam-q-f);} .sam-trf-qtag.q-E{color:var(--sam-q-e);} .sam-trf-qtag.q-D{color:var(--sam-q-d);} .sam-trf-qtag.q-C{color:var(--sam-q-c);}
        .sam-trf-qtag.q-B{color:var(--sam-q-b);} .sam-trf-qtag.q-A{color:var(--sam-q-a);} .sam-trf-qtag.q-S{color:var(--sam-q-s);} .sam-trf-qtag.q-SS{color:var(--sam-q-ss);} .sam-trf-qtag.q-SSS{color:var(--sam-q-sss);}
        .sam-trf-sub { font-size:11px; color:var(--sam-sub); margin-bottom:3px; }
        .sam-trf-attrs { font-size:11px; color:var(--sam-thp); margin-bottom:3px; font-weight:bold; }
        .sam-trf-desc { font-size:11px; color:var(--sam-sub); line-height:1.5; }
        .sam-trf-corner { position:absolute; right:-1px; bottom:-1px; background:var(--sam-accent); color:#0a0e14; font-size:10px; font-weight:bold; padding:2px 8px; border-top-left-radius:6px; border-bottom-right-radius:8px; box-shadow:0 0 6px rgba(143,159,255,0.5); display:none; }
        .sam-trf-item.selected .sam-trf-corner { display:block; }
        .sam-trf-qty { display:flex; align-items:center; gap:6px; margin-top:6px; }
        .sam-trf-qty-btn { width:26px; height:26px; border:1px solid var(--sam-accent); background:rgba(143,159,255,0.1); color:var(--sam-accent); border-radius:5px; cursor:pointer; font-size:15px; font-weight:bold; line-height:1; padding:0; }
        .sam-trf-qty-btn:hover { background:rgba(143,159,255,0.25); }
        .sam-trf-qty-inp { width:52px; text-align:center; background:rgba(0,0,0,0.3); border:1px solid var(--sam-border); color:var(--sam-text); border-radius:5px; padding:3px 4px; font-size:12px; font-weight:bold; }
        .sam-trf-qty-max { font-size:11px; color:var(--sam-sub); }
        .sam-trf-footer { flex-shrink:0; margin-top:10px; padding-top:10px; border-top:1px solid var(--sam-border); }
        .sam-trf-warn { font-size:11px; color:var(--sam-hp); line-height:1.6; margin-bottom:8px; padding:6px 10px; background:rgba(228,88,125,0.08); border:1px solid rgba(228,88,125,0.25); border-radius:5px; }
        .sam-trf-warn strong { color:var(--sam-hp); font-weight:900; }
        .sam-trf-actions { display:flex; gap:8px; justify-content:flex-end; }
        .sam-trf-btn { min-height:40px; padding:10px 18px; font-size:13px; font-weight:bold; border-radius:6px; cursor:pointer; border:1px solid var(--sam-border); transition:all 0.18s; }
        .sam-trf-btn.cancel { background:rgba(143,159,255,0.1); color:var(--sam-text); }
        .sam-trf-btn.cancel:hover { background:rgba(143,159,255,0.22); }
        .sam-trf-btn.confirm { background:rgba(228,88,125,0.15); color:var(--sam-hp); border-color:var(--sam-hp); }
        .sam-trf-btn.confirm:hover:not(:disabled) { background:var(--sam-hp); color:#fff; box-shadow:0 0 10px rgba(228,88,125,0.5); }
        .sam-trf-btn.confirm:disabled { opacity:0.4; cursor:not-allowed; }
        .sam-loot-btn { min-height:40px; padding:10px 18px; font-size:13px; font-weight:bold; border-radius:6px; cursor:pointer; border:1px solid var(--sam-border); transition:all 0.18s; }
        .sam-loot-btn.cancel { background:rgba(143,159,255,0.1); color:var(--sam-text); }
        .sam-loot-btn.cancel:hover { background:rgba(143,159,255,0.22); }
        .sam-loot-btn.confirm { background:rgba(248,113,113,0.15); color:#f87171; border-color:rgba(248,113,113,0.5); }
        .sam-loot-btn.confirm:hover:not(:disabled) { background:rgba(248,113,113,0.4); color:#fff; box-shadow:0 0 10px rgba(248,113,113,0.4); }
        .sam-loot-btn.confirm:disabled { opacity:0.4; cursor:not-allowed; }

        /* サブTab */
        .sam-subtabs { display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; }
        .sam-subtab { padding:4px 10px; font-size:11px; border-radius:4px; cursor:pointer; border:1px solid var(--sam-border); color:var(--sam-sub); background:var(--sam-card); }
        .sam-subtab:hover { color:var(--sam-text); }
        .sam-subtab.active { color:#fff; background:var(--sam-accent); border-color:var(--sam-accent); }

        /* エディタ */
        .sam-edit-field { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
        .sam-edit-label { font-size:11px; color:var(--sam-sub); min-width:70px; }
        .sam-edit-input { flex:1; background:var(--sam-input-bg); border:1px solid var(--sam-border); color:var(--sam-text); padding:3px 6px; border-radius:3px; font-size:12px; min-width:0; }
        .sam-edit-input:focus { outline:none; border-color:var(--sam-accent); box-shadow:0 0 4px var(--sam-accent); }
        .sam-edit-readonly { color:var(--sam-sub); font-style:italic; font-size:11px; }
        /* クリックで即編集: 表示状態(テキスト+✎マーク、変形なし) */
        .sam-ed-wrap { display:inline-flex; align-items:center; gap:2px; cursor:pointer; border-radius:3px; padding:0 3px; transition:background 0.12s; position:relative; max-width:100%; }
        .sam-ed-wrap:hover { background:rgba(143,159,255,0.14); }
        .sam-ed-wrap .sam-ed-val { color:var(--sam-text); font-weight:bold; word-break:break-word; overflow-wrap:anywhere; }
        .sam-ed-wrap .sam-ed-ph { color:var(--sam-sub); font-style:italic; font-weight:normal; opacity:0.7; }
        .sam-ed-wrap .sam-ed-ico { font-size:10px; color:var(--sam-sub); opacity:0; transition:opacity 0.12s; }
        .sam-ed-wrap:hover .sam-ed-ico { opacity:1; }
        .sam-ed-wrap.editing { background:rgba(143,159,255,0.10); }
        .sam-ed-wrap .sam-edit-active { flex:1; min-width:60px; max-width:100%; background:var(--sam-input-bg); border:1px solid var(--sam-accent); color:var(--sam-text); padding:2px 4px; border-radius:3px; font-size:12px; box-shadow:0 0 4px rgba(143,159,255,0.4); }
        .sam-ed-wrap .sam-edit-active[type="textarea"], .sam-ed-wrap textarea.sam-edit-active { width:100%; min-height:90px; resize:vertical; font-family:monospace; line-height:1.5; white-space:pre; }
        /* textarea の複数行表示状態(改行とインデントを保持し、JSON が折り畳まれて文字化けするのを防ぐ) */
        .sam-ed-wrap.pre-wrap { display:block; }
        .sam-ed-pre { display:block; margin:0; padding:6px 8px; background:var(--sam-hover); border:1px solid var(--sam-border); border-radius:4px; font-family:monospace; font-size:11px; line-height:1.5; white-space:pre-wrap; word-break:break-word; color:var(--sam-text); max-height:240px; overflow:auto; }
        .sam-ed-wrap .sam-edit-active:focus { outline:none; }
        .sam-ed-wrap .sam-edit-active[type="number"] { max-width:90px; }
        /* .card-meta などの狭いコンテナ内でも inline を維持 */
        .sam-card-meta .sam-ed-wrap, .sam-card-meta .sam-ed-val { display:inline; }
        .sam-edit-badge { position:fixed; top:8px; right:50%; transform:translateX(50%); background:var(--sam-accent); color:#fff; padding:3px 12px; border-radius:12px; font-size:11px; font-weight:bold; z-index:999999; box-shadow:0 0 10px var(--sam-accent); }
        .sam-save-btn { position:fixed; bottom:10px; left:10px; z-index:999999; padding:3px 9px; border-radius:10px; border:none; background:var(--sam-accent); color:#fff; font-size:10px; font-weight:bold; cursor:pointer; box-shadow:0 1px 6px rgba(0,0,0,0.4); }
        .sam-save-btn:hover { transform:scale(1.05); }
        /* NPCプロフィール(ダイアログ内)の編集モード: ヒントバー + ダイアログ内保存ボタン(modal 内の fixed 配置はビューポート基準のため使用可) */
        .sam-nd-edit-tip { margin:10px 0 4px; padding:5px 10px; font-size:11px; color:var(--sam-accent); background:rgba(143,159,255,0.10); border:1px dashed var(--sam-accent); border-radius:6px; text-align:center; }
        .sam-nd-save { position:static; display:block; margin:8px auto 2px; padding:6px 22px; font-size:12px; }
        .sam-nd-save:hover { transform:scale(1.06); }
        /* NPCプロフィール編集行: 値セルに埋め込まれた編集コントロール */
        .sam-nd-row .v .sam-ed-wrap { font-weight:normal; }
        .sam-npc-bar .num-ed { display:inline-flex; align-items:center; gap:2px; min-width:54px; }
        .sam-npc-bar .num-ed .sam-ed-wrap .sam-ed-val { font-weight:bold; }
        .sam-npc-bar .mx.readonly { color:var(--sam-sub); font-size:11px; }
        /* ヘッダーバッジ領域の埋め込みスイッチ: スイッチを小型化してはみ出しを防ぐ */
        .sam-nd-badge.edit-toggle { display:inline-flex; align-items:center; gap:4px; }
        .sam-nd-badge.edit-toggle .sam-toggle-switch { width:30px; height:15px; border-radius:8px; }
        .sam-nd-badge.edit-toggle .sam-toggle-switch .knob { width:11px; height:11px; top:2px; }
        .sam-nd-badge.edit-toggle .sam-toggle-switch.on .knob { left:17px; }
        /* 人物プロフィールのテキストブロック内の textarea 編集コントロールをブロック幅いっぱいに */
        .sam-nd-block-ct .sam-ed-wrap { display:block; }
        .sam-nd-block-ct .sam-ed-wrap.pre-wrap { display:block; }
        .sam-nd-block-ct .sam-ed-pre { max-height:180px; }

        /* ダイアログ(パネル999998より前面であること) — オーバーレイはスクロールせず、.sam-modal-body のみ単層スクロール */
        #samsara-modal {
            position:fixed; top:0; left:0; width:100vw; height:100vh; height:100dvh; z-index:1000000;
            display:none; align-items:center; justify-content:center;
            background:var(--sam-modal-overlay); backdrop-filter:blur(4px);
            overflow:hidden;
            padding:max(8px, env(safe-area-inset-top, 0px), 3dvh) 12px max(8px, env(safe-area-inset-bottom, 0px), 3dvh);
            box-sizing:border-box;
        }
        #samsara-modal.open { display:flex; animation:samFade 0.2s; }
        @keyframes samFade { from{opacity:0;} to{opacity:1;} }

        .sam-modal-box {
            width:520px; max-width:100%; margin:0 auto;
            max-height:100%;
            display:flex; flex-direction:column; box-sizing:border-box;
            background:var(--sam-bg); border:1px solid var(--sam-accent); border-radius:10px;
            box-shadow:0 12px 40px rgba(0,0,0,0.7); color:var(--sam-text);
            min-height:0; overflow:hidden;
        }
        .sam-modal-head { flex-shrink:0; display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--sam-border); font-weight:900; gap:8px; }
        .sam-modal-head > span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sam-modal-body {
            flex:1 1 auto; min-height:0;
            overflow-x:hidden; overflow-y:auto;
            -webkit-overflow-scrolling:touch; overscroll-behavior:contain; touch-action:pan-y;
            padding:12px 16px;
        }
        .sam-modal-body::-webkit-scrollbar { width:6px; }
        .sam-modal-body::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:3px; }
        .sam-modal-close { cursor:pointer; color:var(--sam-hp); font-size:20px; line-height:1; padding:4px 6px; flex-shrink:0; min-width:32px; min-height:32px; display:inline-flex; align-items:center; justify-content:center; }
        /* インラインの詳細カード(装備/アイテム/スキル/血統/形態) */
        .sam-full-card { padding:8px 10px; background:linear-gradient(180deg,var(--sam-card),rgba(0,0,0,0.15)); border:1px solid var(--sam-border); border-left:3px solid var(--sam-sub); border-radius:6px; margin-bottom:6px; transition:box-shadow 0.2s; }
        /* 単一列リスト(任務/噂 を1件1行) */
        .sam-list-1col { display:flex; flex-direction:column; gap:6px; }
        .sam-list-1col .sam-full-card { margin-bottom:0; }
        .sam-card-list { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
        .sam-card-list.sam-card-list-1col { grid-template-columns:1fr; }
        .sam-card-list > * { min-width:0; }
        .sam-card-list .sam-full-card { margin-bottom:0; }
        .sam-card-list .sam-empty { grid-column:1/-1; }
        .sam-card-list .sam-empty { grid-column:1/-1; }
        .sam-full-card:hover { box-shadow:0 2px 12px rgba(0,0,0,0.4); }
        .sam-full-card.q-F{border-left-color:var(--sam-q-f);} .sam-full-card.q-E{border-left-color:var(--sam-q-e);}
        .sam-full-card.q-D{border-left-color:var(--sam-q-d);} .sam-full-card.q-C{border-left-color:var(--sam-q-c);}
        .sam-full-card.q-B{border-left-color:var(--sam-q-b);} .sam-full-card.q-A{border-left-color:var(--sam-q-a);}
        .sam-full-card.q-S{border-left-color:var(--sam-q-s);} .sam-full-card.q-SS{border-left-color:var(--sam-q-ss);}
        .sam-full-card.q-SSS{border-left-color:var(--sam-q-sss);box-shadow:0 0 8px rgba(255,77,77,0.2);}
        .sam-fc-head { display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px; }
        .sam-fc-title { font-size:14px; font-weight:900; color:var(--sam-text); flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sam-fc-head .sam-act-btn { flex:0 0 auto; flex-shrink:0; }
        .sam-fc-q { font-size:11px; font-weight:900; padding:1px 6px; border-radius:3px; border:1px solid; min-width:34px; text-align:center; }
        .sam-fc-q.q-F { color:var(--sam-q-f); border-color:var(--sam-q-f); background:rgba(148,163,184,0.14); }
        .sam-fc-q.q-E { color:var(--sam-q-e); border-color:var(--sam-q-e); background:rgba(248,250,252,0.10); }
        .sam-fc-q.q-D { color:var(--sam-q-d); border-color:var(--sam-q-d); background:rgba(34,197,94,0.14); }
        .sam-fc-q.q-C { color:var(--sam-q-c); border-color:var(--sam-q-c); background:rgba(59,130,246,0.14); }
        .sam-fc-q.q-B { color:var(--sam-q-b); border-color:var(--sam-q-b); background:rgba(168,85,247,0.16); }
        .sam-fc-q.q-A { color:var(--sam-q-a); border-color:var(--sam-q-a); background:rgba(249,115,22,0.16); }
        .sam-fc-q.q-S { color:var(--sam-q-s); border-color:var(--sam-q-s); background:rgba(234,179,8,0.16); text-shadow:0 0 4px rgba(234,179,8,0.5); }
        .sam-fc-q.q-SS { color:var(--sam-q-ss); border-color:var(--sam-q-ss); background:rgba(239,68,68,0.18); text-shadow:0 0 4px rgba(239,68,68,0.6); }
        .sam-fc-q.q-SSS { color:var(--sam-q-sss); border-color:var(--sam-q-sss); background:rgba(236,72,153,0.20); text-shadow:0 0 5px rgba(236,72,153,0.7); box-shadow:0 0 6px rgba(236,72,153,0.4); }
        /* 階層文字(上部のキャラクター階層 / プログレスバー左右の階層 / NPC階層): 段階ごとに着色、品質バッジと同配色 */
        .sam-reincarnator-tier.q-F,.sam-tier-side.q-F,.sam-npc-tier.q-F,.sam-nd-tier.q-F { color:var(--sam-q-f); }
        .sam-reincarnator-tier.q-E,.sam-tier-side.q-E,.sam-npc-tier.q-E,.sam-nd-tier.q-E { color:var(--sam-q-e); }
        .sam-reincarnator-tier.q-D,.sam-tier-side.q-D,.sam-npc-tier.q-D,.sam-nd-tier.q-D { color:var(--sam-q-d); }
        .sam-reincarnator-tier.q-C,.sam-tier-side.q-C,.sam-npc-tier.q-C,.sam-nd-tier.q-C { color:var(--sam-q-c); }
        .sam-reincarnator-tier.q-B,.sam-tier-side.q-B,.sam-npc-tier.q-B,.sam-nd-tier.q-B { color:var(--sam-q-b); }
        .sam-reincarnator-tier.q-A,.sam-tier-side.q-A,.sam-npc-tier.q-A,.sam-nd-tier.q-A { color:var(--sam-q-a); }
        .sam-reincarnator-tier.q-S,.sam-tier-side.q-S,.sam-npc-tier.q-S,.sam-nd-tier.q-S { color:var(--sam-q-s); text-shadow:0 0 4px rgba(234,179,8,0.5); }
        .sam-reincarnator-tier.q-SS,.sam-tier-side.q-SS,.sam-npc-tier.q-SS,.sam-nd-tier.q-SS { color:var(--sam-q-ss); text-shadow:0 0 5px rgba(239,68,68,0.6); }
        .sam-reincarnator-tier.q-SSS,.sam-tier-side.q-SSS,.sam-npc-tier.q-SSS,.sam-nd-tier.q-SSS { color:var(--sam-q-sss); text-shadow:0 0 6px rgba(236,72,153,0.7); }
        /* ★ 職業記録の描画: 折りたたみパネル {职业名:{类型,特性[],来源}} */
        .sam-occ-panel { margin:4px 0; border:1px solid var(--sam-border); border-radius:8px; background:rgba(143,159,255,0.04); overflow:hidden; }
        .sam-occ-summary { list-style:none; cursor:pointer; padding:8px 10px; font-weight:bold; font-size:13px; color:var(--sam-text); display:flex; align-items:center; gap:8px; flex-wrap:wrap; user-select:none; }
        .sam-occ-summary::-webkit-details-marker { display:none; }
        .sam-occ-summary::before { content:'▸'; font-size:10px; color:var(--sam-sub); display:inline-block; transition:transform .15s; }
        .sam-occ-panel[open] > .sam-occ-summary::before { content:'▾'; }
        .sam-occ-sumtitle { display:inline-flex; align-items:center; }
        .sam-occ-sumcount { font-size:11px; font-weight:normal; color:var(--sam-sub); padding:1px 7px; border-radius:9px; background:rgba(143,159,255,0.10); border:1px solid rgba(143,159,255,0.16); }
        .sam-occ-sumrow { display:inline-flex; flex-wrap:wrap; gap:4px; margin-left:auto; }
        .sam-occ-sumname { font-size:11px; font-weight:normal; padding:1px 4px 1px 8px; border-radius:9px; background:rgba(143,159,255,0.07); border:1px solid rgba(143,159,255,0.14); display:inline-flex; align-items:center; gap:5px; color:var(--sam-text); }
        .sam-occ-sumtype { font-size:9px; font-weight:bold; padding:0 6px; border-radius:7px; border:1px solid; }
        .sam-occ-sumtype.戦闘 { color:#e57373; border-color:#e57373; }
        .sam-occ-sumtype.生活 { color:#66bb6a; border-color:#66bb6a; }
        .sam-occ-sumtype.支援 { color:#7dbde0; border-color:#7dbde0; }
        .sam-occ-body { padding:8px 10px; display:flex; flex-direction:column; gap:8px; border-top:1px dashed var(--sam-border); }
        .sam-occ-card { padding:9px 12px; border:1px solid var(--sam-border); border-left:3px solid var(--sam-accent); border-radius:8px; background:var(--sam-bg); }
        .sam-occ-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .sam-occ-name { font-size:14px; font-weight:bold; color:var(--sam-text); }
        .sam-occ-type { font-size:10px; font-weight:bold; padding:2px 10px; border-radius:10px; border:1px solid; white-space:nowrap; }
        .sam-occ-type.戦闘 { color:#e57373; border-color:#e57373; background:rgba(229,115,115,0.14); }
        .sam-occ-type.生活 { color:#66bb6a; border-color:#66bb6a; background:rgba(102,187,106,0.14); }
        .sam-occ-type.支援 { color:#7dbde0; border-color:#7dbde0; background:rgba(125,189,224,0.14); }
        .sam-occ-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
        .sam-occ-tag { font-size:10px; padding:2px 9px; border-radius:10px; background:rgba(143,159,255,0.10); color:var(--sam-sub); border:1px solid rgba(143,159,255,0.18); }
        .sam-occ-src { font-size:10px; color:var(--sam-sub); margin-top:7px; padding-top:6px; border-top:1px dashed rgba(143,159,255,0.12); display:flex; align-items:center; gap:3px; }
        .sam-occ-inline { display:inline-flex; flex-wrap:wrap; gap:5px; align-items:center; }
        .sam-occ-chip { font-size:11px; padding:2px 4px 2px 8px; border-radius:10px; border:1px solid var(--sam-border); background:rgba(143,159,255,0.05); color:var(--sam-text); display:inline-flex; align-items:center; gap:5px; }
        .sam-occ-chip .sam-occ-sumtype { font-size:9px; padding:1px 5px; border-radius:7px; }
        /* ★ 職業の構造化エディタ(編集モード): 職業ごとのカード+種別ドロップダウン+特性/来源入力+削除ボタン+"職業追加"ボタン */
        .sam-occ-edit { display:flex; flex-direction:column; gap:7px; margin:4px 0; }
        .sam-occ-edit-card { padding:8px 10px; border:1px solid var(--sam-border); border-left:3px solid var(--sam-accent); border-radius:6px; background:rgba(143,159,255,0.04); }
        .sam-occ-edit-head { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
        .sam-occ-edit-row { display:flex; align-items:center; gap:6px; margin-top:4px; }
        .sam-occ-edit-row .k { font-size:11px; color:var(--sam-sub); min-width:32px; text-align:right; white-space:nowrap; }
        .sam-occ-field { flex:1; background:var(--sam-input-bg); border:1px solid var(--sam-border); color:var(--sam-text); padding:3px 6px; border-radius:3px; font-size:12px; min-width:0; }
        .sam-occ-field:focus { outline:none; border-color:var(--sam-accent); box-shadow:0 0 4px var(--sam-accent); }
        .sam-occ-edit-name { font-weight:bold; }
        .sam-occ-edit-type { flex:0 0 auto; min-width:70px; cursor:pointer; }
        .sam-occ-edit-tags { font-size:11px; }
        .sam-occ-edit-src { font-size:11px; }
        .sam-occ-del-btn { flex:0 0 auto; width:24px; height:24px; line-height:22px; text-align:center; border-radius:50%; border:1px solid var(--sam-hp); background:rgba(239,68,68,0.10); color:var(--sam-hp); cursor:pointer; font-size:12px; font-weight:bold; transition:background 0.12s,transform 0.1s; }
        .sam-occ-del-btn:hover { background:var(--sam-hp); color:#fff; transform:translateY(-1px); }
        .sam-occ-del-btn:active { transform:translateY(0); }
        .sam-occ-add-btn { margin-top:6px; padding:5px 12px; font-size:12px; font-weight:bold; border-radius:5px; border:1px dashed var(--sam-accent); background:rgba(143,159,255,0.08); color:var(--sam-accent); cursor:pointer; transition:background 0.12s,transform 0.1s; }
        .sam-occ-add-btn:hover { background:var(--sam-accent); color:#fff; border-style:solid; transform:translateY(-1px); }
        .sam-occ-add-btn:active { transform:translateY(0); }
        .sam-fc-rows { font-size:12px; }
        .sam-fc-rows .sam-row { padding:3px 0; }
        .sam-fc-rows .sam-row .v { max-width:75%; }
        /* 効果/描述 の全幅ブロック(ラベルが上、内容は左揃えで行全体を占有) */
        .sam-fc-body { margin-top:4px; }
        .sam-fc-block { margin-bottom:5px; }
        .sam-fc-block .sam-fc-label { font-size:11px; font-weight:bold; color:var(--sam-sub); margin-bottom:2px; }
        .sam-fc-block .sam-fc-content { font-size:12px; color:var(--sam-text); text-align:left; line-height:1.6; word-break:break-word; white-space:pre-wrap; padding-left:2px; }
        .sam-fc-block .sam-fc-content.sam-fc-effects { padding-left:0; }
        /* 装備/アイテムの操作ボタン列 */
        .sam-fc-actions { display:flex; flex-wrap:wrap; gap:5px; padding:4px 2px 2px; }
        .sam-act-btn { padding:3px 9px; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid var(--sam-border); background:rgba(143,159,255,0.10); color:var(--sam-text); cursor:pointer; transition:background 0.12s,border-color 0.12s,transform 0.1s; }
        .sam-act-btn:hover { background:var(--sam-accent); border-color:var(--sam-accent); color:#fff; transform:translateY(-1px); }
        .sam-act-btn:active { transform:translateY(0); }
        .sam-act-btn[data-act="delete"] { border-color:var(--sam-hp); color:var(--sam-hp); }
        .sam-act-btn[data-act="delete"]:hover { background:var(--sam-hp); border-color:var(--sam-hp); color:#fff; }
        .sam-act-btn[data-act="wear"] { border-color:#27ae60; color:#2ecc71; background:rgba(46,204,113,0.12); }
        .sam-act-btn[data-act="wear"]:hover { background:#27ae60; border-color:#27ae60; color:#fff; box-shadow:0 0 8px rgba(46,204,113,0.6); }
        .sam-act-btn[data-act="remove"] { border-color:#d35400; color:#e67e22; background:rgba(230,126,34,0.12); }
        .sam-act-btn[data-act="remove"]:hover { background:#d35400; border-color:#d35400; color:#fff; box-shadow:0 0 8px rgba(230,126,34,0.6); }
        .sam-act-btn[data-act="store"] { border-color:#2980b9; color:#3498db; background:rgba(52,152,219,0.12); }
        .sam-act-btn[data-act="store"]:hover { background:#2980b9; border-color:#2980b9; color:#fff; box-shadow:0 0 8px rgba(52,152,219,0.6); }
        .sam-act-btn[data-act="takeback"] { border-color:#8e44ad; color:#9b59b6; background:rgba(155,89,182,0.12); }
        .sam-act-btn[data-act="takeback"]:hover { background:#8e44ad; border-color:#8e44ad; color:#fff; box-shadow:0 0 8px rgba(155,89,182,0.6); }
        .sam-act-btn[data-act="activate"] { border-color:#d4af37; color:#f1c40f; background:linear-gradient(135deg, rgba(212,175,55,0.18), rgba(241,196,15,0.10)); text-shadow:0 0 4px rgba(241,196,15,0.6); }
        .sam-act-btn[data-act="activate"]:hover { background:linear-gradient(135deg, #d4af37, #f1c40f); border-color:#d4af37; color:#2a2300; text-shadow:none; box-shadow:0 0 10px rgba(241,196,15,0.8); }
        .sam-act-btn[data-act="deactivate"] { border-color:#7a1f1f; color:#e04848; background:rgba(224,72,72,0.12); }
        .sam-act-btn[data-act="deactivate"]:hover { background:#7a1f1f; border-color:#7a1f1f; color:#fff; box-shadow:0 0 8px rgba(224,72,72,0.6); }
        .sam-fc-collapse { margin-bottom:5px; }
        .sam-fc-collapse > .sam-fc-collapse-sum { font-size:11px; font-weight:bold; color:var(--sam-sub); cursor:pointer; padding:3px 6px; background:rgba(143,159,255,0.06); border-radius:4px; user-select:none; list-style:none; border-left:3px solid var(--sam-border); }
        .sam-fc-collapse > .sam-fc-collapse-sum::-webkit-details-marker { display:none; }
        .sam-fc-collapse > .sam-fc-collapse-sum::before { content:'▸ '; color:var(--sam-accent); }
        .sam-fc-collapse[open] > .sam-fc-collapse-sum::before { content:'▾ '; }
        .sam-fc-collapse > .sam-fc-content { margin-top:4px; }
        /* 効果オブジェクトを行ごとに表示 */
        .sam-effects { display:flex; flex-direction:column; gap:2px; align-items:flex-start; }
        .sam-effect-line { font-size:11px; color:var(--sam-text); padding:1px 0 1px 8px; border-left:2px solid var(--sam-border); line-height:1.4; text-align:left; }
        .sam-effect-line .ek { color:var(--sam-accent); font-weight:bold; }
        /* タグ */
        .sam-tags { display:flex; gap:3px; flex-wrap:wrap; }
        .sam-tag { font-size:10px; padding:1px 5px; border-radius:3px; background:rgba(143,159,255,0.12); color:var(--sam-sub); border:1px solid var(--sam-border); }
        /* 数値バッジ: 自動多列、コンテナが狭くなると多列から1列へ自動縮退し、右側へはみ出さない */
        .sam-stat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(70px,1fr)); gap:4px; margin-top:4px; }
        .sam-stat-cell { text-align:center; padding:3px 2px; background:rgba(0,0,0,0.2); border-radius:3px; }
        /* コンテナが狭すぎる場合(スマホ/ダイアログ右カラム)は2列を強制、さらに狭ければ1列 */
        @media (max-width:480px) { .sam-stat-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:340px) { .sam-stat-grid { grid-template-columns:1fr; } }
        /* 所持パネル / ショップカードのグリッド: PCでは自動多列(220-260pxで1カード)、スマホでは単一列、横幅の過大化や無駄な余白を回避 */
        .sam-list-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; }
        .sam-list-grid .sam-full-card { margin-bottom:0; }
        .sam-list-grid .sam-empty { grid-column:1/-1; }
        @media (max-width:768px) { .sam-list-grid { display:flex; flex-direction:column; gap:6px; } }
        /* ショップ所持の2カラム(装備バッグ/アイテムバッグが複数の場合PCは2カラム、スマホは単一列) */
        .sam-shop-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:8px; }
        .sam-shop-grid .sam-shop-item { margin-bottom:0; }
        @media (max-width:768px) { .sam-shop-grid { display:flex; flex-direction:column; gap:8px; } }
        .sam-stat-cell .sn { font-size:9px; color:var(--sam-sub); }
        .sam-stat-cell .sv { font-size:13px; font-weight:bold; color:var(--sam-text); }

        /* 設定ダイアログ */
        .sam-settings-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .sam-theme-card { padding:10px 6px; text-align:center; border-radius:8px; cursor:pointer; border:2px solid transparent; transition:all 0.2s; }
        .sam-theme-card:hover { transform:scale(1.03); }
        .sam-theme-card.active { border-color:var(--sam-accent); box-shadow:0 0 10px var(--sam-accent); }
        .sam-theme-card .swatch { width:100%; height:24px; border-radius:4px; margin-bottom:6px; }
        .sam-theme-card .name { font-size:13px; font-weight:bold; }
        .sam-toggle-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--sam-border); }
        .sam-toggle-switch { width:44px; height:22px; border-radius:11px; background:var(--sam-dark); border:1px solid var(--sam-border); position:relative; cursor:pointer; transition:background 0.2s; }
        .sam-toggle-switch.on { background:var(--sam-accent); }
        .sam-toggle-switch .knob { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left 0.2s; }
        .sam-toggle-switch.on .knob { left:24px; }

        /* ===== MVU 変数の更新方式 ===== */
        .sam-varmode-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
        .sam-varmode-btn { width:100%; padding:9px 10px; text-align:left; border:1px solid var(--sam-border); border-radius:7px; background:var(--sam-card); color:var(--sam-text); cursor:pointer; transition:all .16s; font:inherit; }
        .sam-varmode-btn:hover { border-color:var(--sam-accent); transform:translateY(-1px); }
        .sam-varmode-btn.active { border-color:var(--sam-accent); background:rgba(143,159,255,.12); box-shadow:0 0 8px rgba(143,159,255,.18); }
        .sam-varmode-btn[disabled] { opacity:.55; cursor:wait; transform:none; }
        .sam-varmode-btn .ttl { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:900; }
        .sam-varmode-btn .tag { font-size:9px; padding:1px 5px; border:1px solid var(--sam-border); border-radius:7px; color:var(--sam-accent); }
        .sam-varmode-btn .desc { margin-top:4px; font-size:10px; line-height:1.45; color:var(--sam-sub); }
        .sam-varmode-status { min-height:17px; margin-top:6px; font-size:10px; line-height:1.45; color:var(--sam-sub); }
        .sam-varmode-status.ok { color:#56bf7b; }
        .sam-varmode-status.err { color:var(--sam-hp); }
        @media (max-width:520px) { .sam-varmode-grid { grid-template-columns:1fr; } }

        /* ===== API 設定ブロック(Zsdネットフォーラムから移植) ===== */
        .sam-api-section { padding-top:6px; }
        .sam-api-block-label { font-size:12px; font-weight:bold; color:var(--sam-sub); margin:10px 0 4px; }
        .sam-api-field { margin-bottom:6px; }
        .sam-api-field > label { display:block; font-size:11px; color:var(--sam-sub); margin-bottom:2px; }
        .sam-api-input { width:100%; box-sizing:border-box; background:var(--sam-input-bg); border:1px solid var(--sam-border); color:var(--sam-text); padding:5px 8px; border-radius:5px; font-size:12px; outline:none; transition:border-color 0.15s,box-shadow 0.15s; }
        .sam-api-input:focus { border-color:var(--sam-accent); box-shadow:0 0 0 2px rgba(143,159,255,0.18); }
        .sam-api-input::placeholder { color:var(--sam-sub); opacity:0.6; }
        .sam-api-select { width:100%; box-sizing:border-box; background:var(--sam-input-bg); border:1px solid var(--sam-border); color:var(--sam-text); padding:5px 8px; border-radius:5px; font-size:12px; outline:none; cursor:pointer; }
        .sam-api-select:focus { border-color:var(--sam-accent); }
        .sam-api-row { display:flex; gap:6px; align-items:stretch; }
        .sam-api-row > .sam-api-input,
        .sam-api-row > .sam-api-select { flex:1 1 auto; min-width:0; }
        .sam-api-btn { flex:0 0 auto; padding:5px 10px; font-size:11px; font-weight:bold; border-radius:5px; border:1px solid var(--sam-border); background:rgba(143,159,255,0.12); color:var(--sam-text); cursor:pointer; transition:background 0.15s,border-color 0.15s,transform 0.1s; white-space:nowrap; }
        .sam-api-btn:hover { background:var(--sam-accent); border-color:var(--sam-accent); color:#fff; transform:translateY(-1px); }
        .sam-api-btn:active { transform:translateY(0); }
        .sam-api-btn.danger { border-color:var(--sam-hp); color:var(--sam-hp); background:rgba(228,88,125,0.12); }
        .sam-api-btn.danger:hover { background:var(--sam-hp); color:#fff; }
        .sam-api-btn.save { border-color:#27ae60; color:#2ecc71; background:rgba(46,204,113,0.12); }
        .sam-api-btn.save:hover { background:#27ae60; color:#fff; }
        .sam-api-btn[disabled] { opacity:0.5; cursor:not-allowed; transform:none; box-shadow:none; }
        .sam-api-status { font-size:11px; color:var(--sam-sub); margin-top:2px; line-height:1.4; }
        .sam-api-status.warn { color:var(--sam-thp); }
        .sam-api-status.err { color:var(--sam-hp); }
        .sam-api-status.ok { color:#56bf7b; }

        @media (max-width:768px) {
            #samsara-ball { top:calc(70px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important; width:30px !important; height:30px !important; }
            /* スマホ: 上下端に貼り付けて固定ビューポートに自動適応、内部は .sam-tab-content がスクロール */
            /* スマホ: 上下端に貼り付けて固定ビューポートに自動適応、内部は .sam-tab-content がスクロール。
               ブラウザのアドレスバー/下部ツールバーによる遮蔽を避けるため 100dvh(動的ビューポート高)を優先;
               dvh 非対応ブラウザは 100vh 版へ自動フォールバック。あわせて top/bottom を明示し、
               env(safe-area-inset-*) でタスクバーのセーフエリアを確保できるようにする。 */
            #samsara-panel {
                top: calc(8px + env(safe-area-inset-top, 0px)) !important;
                /* bottom は env(safe-area-inset-bottom) ではなく dvh で担保する: ブラウザのツールバー/アドレスバーは
                   システムの safe-area に含まれず env() では検出できない; 動的ビューポート dvh の自動縮小でのみ回避できる。
                   dvh 非対応時は vh にフォールバック(旧ブラウザの layout viewport、少なくとも見えなくなることはない)。 */
                bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
                left: 0 !important; right: 0 !important;
                margin: 0 auto !important; width: 94vw !important; max-width: 440px !important;
                /* 高さの順序: vh を先に書いて fallback、dvh を後に書いて上書き(対応時は動的ビューポートを優先、ブラウザの
                   アドレスバー/ツールバーの表示切替でパネル高が自動縮小し、隠されなくなる)。 */
                height: calc(100vh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
                height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
                min-height: 0 !important; max-height: none !important;
                border-radius: 12px !important;
            }
            /* パネル内部のスクロールコンテナも下部セーフエリアを補正し、ブラウザ下部バーに内容が隠れるのを防ぐ */
            .sam-tab-content {
                padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
            }
            .sam-topbar { padding:10px; cursor:default; }
            .sam-topbar .tl-info { font-size:11px; }
            .sam-topbar .tl-place { font-size:10px; }
            .sam-icon-btn { width:26px; height:26px; font-size:13px; }
            .sam-tab-rail { flex:0 0 48px; }
            .sam-tab-btn { font-size:10px; padding:6px 1px; }
            .sam-tab-content { padding:6px 8px; }
            .sam-grid { grid-template-columns:1fr; }
            .sam-grid-2, .sam-card-list, .sam-list-1col { display:flex; flex-direction:column; gap:6px; }
            .sam-grid-2 { gap:6px; }
            .sam-grid-2 > .sam-row { padding:4px 6px; }
            .sam-reincarnator { padding:6px 8px; gap:6px; }
            .sam-avatar { width:64px; height:80px; font-size:22px; }
            .sam-ava-ph .sam-ava-ico { font-size:22px; }
            .sam-ava-ph .sam-ava-hint { font-size:8px; }
            .sam-reincarnator-tier { padding:2px 8px; }
            .sam-reincarnator-tier-num { font-size:16px; }
            .sam-reincarnator-race { font-size:11px; padding:2px 7px; }
            .sam-reincarnator-bars { gap:4px; max-width:none; flex:1; margin-left:10px; }
            .stat-labels { font-size:9px; }
            .bar-track { height:10px; }
            .sam-row { font-size:11px; padding:3px 0; }
            .sam-row .k { min-width:50px; }
            .sam-full-card { padding:6px 8px; }
            .sam-fc-title { font-size:13px; }
            .sam-fc-rows { font-size:11px; }
            .sam-save-btn { bottom:8px; left:8px; padding:2px 7px; font-size:9px; }
            /* 2段目ダイアログのスマホ向け補強 */
            #samsara-modal {
                padding:max(8px, env(safe-area-inset-top, 0px)) 10px max(8px, env(safe-area-inset-bottom, 0px));
            }
            .sam-modal-box { width:100%; border-radius:12px; }
            .sam-modal-head { padding:10px 12px; font-size:14px; }
            .sam-modal-body { padding:10px 12px; }
            .sam-settings-grid { grid-template-columns:1fr; }
            .sam-toggle-row { gap:10px; align-items:flex-start; }
            .sam-confirm-box { width:100%; padding:14px; }
            .sam-confirm-actions { gap:10px; }
            .sam-confirm-btn { flex:1; min-height:44px; }
            .sam-trf-actions { gap:10px; }
            .sam-trf-btn { flex:1; min-height:44px; }
            .sam-trf-qty-btn { width:36px; height:36px; }
        }
        /* ===== 血統融合ポッド UI ===== */
        .sam-fusion-wrap { display:flex; flex-direction:column; gap:14px; }
        .sam-fusion-head { display:flex; align-items:center; gap:10px; padding:10px 12px; background:linear-gradient(135deg,rgba(143,159,255,0.12),rgba(0,0,0,0.15)); border:1px solid var(--sam-border); border-radius:8px; }
        .sam-fusion-head .ico { font-size:22px; }
        .sam-fusion-head .ttl { font-weight:600; letter-spacing:0.5px; }
        .sam-fusion-head .sub { font-size:11px; color:var(--sam-sub); margin-left:auto; text-align:right; line-height:1.4; }
        .sam-fusion-pair { display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:start; }
        .sam-fusion-col { display:flex; flex-direction:column; gap:6px; min-width:0; }
        .sam-fusion-col-label { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--sam-sub); }
        .sam-fusion-col-label .tag { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; font-weight:700; font-size:11px; color:#0a0e14; }
        .sam-fusion-col-label .tag.a { background:var(--sam-accent); }
        .sam-fusion-col-label .tag.b { background:var(--sam-hp); }
        .sam-fusion-col-label .role { font-weight:600; color:var(--sam-fg); }
        .sam-fusion-col-label .note { color:var(--sam-sub); font-size:10px; margin-left:auto; }
        .sam-fusion-select { width:100%; padding:6px 8px; background:var(--sam-card); color:var(--sam-fg); border:1px solid var(--sam-border); border-radius:6px; font-size:12px; box-sizing:border-box; }
        .sam-fusion-preview { min-height:60px; }
        .sam-fusion-preview .sam-full-card { margin-bottom:0; }
        .sam-fusion-preview-empty { padding:14px 10px; text-align:center; color:var(--sam-sub); font-size:12px; border:1px dashed var(--sam-border); border-radius:6px; }
        .sam-fusion-arrow { display:flex; align-items:center; justify-content:center; font-size:22px; color:var(--sam-accent); opacity:0.7; animation:samFusionPulse 1.8s ease-in-out infinite; padding-top:24px; }
        @keyframes samFusionPulse { 0%,100%{transform:scale(1);opacity:0.7;} 50%{transform:scale(1.15);opacity:1;} }
        .sam-fusion-rule { padding:10px 12px; background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.18)); border:1px solid var(--sam-border); border-radius:8px; }
        .sam-fusion-rule-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .sam-fusion-rule-title .name { font-weight:600; font-size:13px; color:var(--sam-thp); }
        .sam-fusion-rule-title .pill { font-size:10px; padding:2px 8px; border-radius:10px; background:var(--sam-accent); color:#0a0e14; font-weight:600; }
        .sam-fusion-rule-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .sam-fusion-rule-card { padding:8px 10px; background:var(--sam-card); border:1px solid var(--sam-border); border-left:3px solid var(--sam-sub); border-radius:6px; }
        .sam-fusion-rule-card .rhead { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
        .sam-fusion-rule-card .rname { font-weight:600; font-size:12px; }
        .sam-fusion-rule-card .rw { font-size:10px; padding:1px 6px; border-radius:8px; background:rgba(143,159,255,0.18); color:var(--sam-sub); }
        .sam-fusion-rule-card .rlist { list-style:none; margin:0; padding:0; }
        .sam-fusion-rule-card .rlist li { font-size:11px; color:var(--sam-fg); padding:2px 0 2px 10px; position:relative; line-height:1.5; }
        .sam-fusion-rule-card .rlist li::before { content:'▸'; position:absolute; left:0; color:var(--sam-accent); }
        .sam-fusion-rule-card.r-good { border-left-color:var(--sam-lb); }
        .sam-fusion-rule-card.r-bad { border-left-color:var(--sam-hp); }
        .sam-fusion-rule-card.r-mid { border-left-color:var(--sam-thp); }
        .sam-fusion-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-top:4px; }
        .sam-fusion-direct-hint { flex:1; text-align:left; font-size:11px; line-height:1.4; }
        @media (max-width:560px){
            .sam-fusion-pair { grid-template-columns:1fr; }
            .sam-fusion-arrow { transform:rotate(90deg); padding:4px 0; }
            .sam-fusion-rule-grid { grid-template-columns:1fr; }
        }
        `;
    }
    function initSamsaraCSS() {
        var old = document.getElementById('samsara-theme-style');
        if (old) old.remove();
        var styleEl = document.createElement('style');
        styleEl.id = 'samsara-theme-style';
        styleEl.type = 'text/css';
        styleEl.innerHTML = buildCSS(THEES_DEFAULT(), getTheme());
        document.head.appendChild(styleEl);
    }
    function THEES_DEFAULT() { return THEMES[getTheme()] || THEMES.night; }

    /* ===== 10. パネル開閉 ===== */
    function toggleSamsaraPanel() {
        var $panel = $('#samsara-panel');
        var $ball = $('#samsara-ball');
        var isOpen = $panel.hasClass('open');
        if (isOpen) {
            // 開く際にインラインで display:flex を書いているため、removeClass('open') だけでは即座に隠れない
            // 以前は 300ms 空待ちしてから display:none にしており、退場アニメも無いため約1秒固まったように感じた
            if ($panel.data('samCloseTimer')) {
                clearTimeout($panel.data('samCloseTimer'));
                $panel.removeData('samCloseTimer');
            }
            $panel.removeClass('open').addClass('closing');
            var closeTimer = setTimeout(function() {
                $panel.removeClass('closing').css('display', 'none');
                $panel.removeData('samCloseTimer');
            }, 180);
            $panel.data('samCloseTimer', closeTimer);
            $ball.stop(true, true).fadeIn(160);
            try { localStorage.setItem(SAM_CONFIG.open, '0'); } catch(e){}
        } else {
            if ($panel.data('samCloseTimer')) {
                clearTimeout($panel.data('samCloseTimer'));
                $panel.removeData('samCloseTimer');
            }
            $panel.removeClass('closing');
            if (isMobile()) { $panel.css({left:'',top:'',right:'',bottom:'',margin:'',height:''}); }
            else {
                var r = $ball[0].getBoundingClientRect();
                var vw = GS_PARENT.innerWidth, vh = GS_PARENT.innerHeight;
                var pw = $panel.outerWidth() || 720;
                var nl = Math.max(20, Math.min(vw - pw - 20, r.left > vw/2 ? r.left - pw - 20 : r.left + 60));
                var nt = Math.max(20, Math.min(vh - 700, r.top));
                $panel.css({left:nl+'px', top:nt+'px', right:'auto', bottom:'auto'});
            }
            $panel.css('display', 'flex');
            $panel[0].offsetHeight;
            $panel.addClass('open');
            $ball.stop(true, true).fadeOut(160);
            try { localStorage.setItem(SAM_CONFIG.open, '1'); } catch(e){}
            renderAll();
        }
    }

    /* ===== 11. ドラッグシステム(ボール+パネル) ===== */
    function setupDragEngines() {
        var $ball = $('#samsara-ball');
        var $panel = $('#samsara-panel');
        if (!$ball.length || !$panel.length) return;

        if (!$ball.data('samDragBound')) {
            $ball.data('samDragBound', '1');
            var sx1=0, sy1=0, ox1=0, oy1=0, dragging1=false, moved1=false;
            try {
                var savedPos = localStorage.getItem(SAM_CONFIG.pos);
                if (savedPos && !isMobile()) {
                    var arr = savedPos.split(',');
                    if (arr.length === 2) {
                        $ball[0].style.setProperty('left', arr[0]+'px', 'important');
                        $ball[0].style.setProperty('top', arr[1]+'px', 'important');
                        $ball[0].style.setProperty('right', 'auto', 'important');
                    }
                }
            } catch(e){}
            $ball[0].addEventListener('touchstart', handleBallDown, { passive: false });
            $ball.on('mousedown', function(e) { if (e.button !== 0) return; handleBallDown(e); });
            function handleBallDown(e) {
                var p = e.originalEvent && e.originalEvent.touches ? e.originalEvent.touches[0] : (e.touches ? e.touches[0] : e);
                sx1 = p.clientX; sy1 = p.clientY;
                var r = $ball[0].getBoundingClientRect(); ox1 = r.left; oy1 = r.top;
                dragging1 = true;
                document.addEventListener('mousemove', handleBallMove);
                document.addEventListener('touchmove', handleBallMove, { passive: false });
                document.addEventListener('mouseup', handleBallUp);
                document.addEventListener('touchend', handleBallUp);
            }
            function handleBallMove(me) {
                if (!dragging1) return;
                var mp = me.originalEvent && me.originalEvent.touches ? me.originalEvent.touches[0] : (me.touches ? me.touches[0] : me);
                var dx = mp.clientX - sx1, dy = mp.clientY - sy1;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    moved1 = true;
                    var vw = GS_PARENT.innerWidth||1024, vh = GS_PARENT.innerHeight||768;
                    var sz = $ball[0].offsetWidth || 34;
                    var nl = Math.max(10, Math.min(vw-sz-10, ox1+dx));
                    var nt = Math.max(10, Math.min(vh-sz-10, oy1+dy));
                    $ball[0].style.setProperty('right','auto','important');
                    $ball[0].style.setProperty('bottom','auto','important');
                    $ball[0].style.setProperty('left', nl+'px','important');
                    $ball[0].style.setProperty('top', nt+'px','important');
                    if (me.type === 'touchmove' && me.cancelable) me.preventDefault();
                }
            }
            function handleBallUp() {
                if (dragging1 && moved1) {
                    try { localStorage.setItem(SAM_CONFIG.pos, parseInt($ball[0].style.left)+','+parseInt($ball[0].style.top)); } catch(e){}
                }
                dragging1 = false;
                document.removeEventListener('mousemove', handleBallMove);
                document.removeEventListener('touchmove', handleBallMove);
                document.removeEventListener('mouseup', handleBallUp);
                document.removeEventListener('touchend', handleBallUp);
                setTimeout(function() { moved1 = false; }, 50);
            }
            $ball.on('click', function() { if (!moved1) toggleSamsaraPanel(); });
        }

        if (!$panel.data('samDragBound')) {
            $panel.data('samDragBound', '1');
            var sx2=0, sy2=0, ox2=0, oy2=0, dragging2=false;
            $panel.on('mousedown touchstart', '.sam-topbar', function(e) {
                if (e.type === 'mousedown' && e.button !== 0) return;
                if ($(e.target).closest('.sam-icon-btn').length) return;
                if (isMobile()) return;
                var p = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
                sx2 = p.clientX; sy2 = p.clientY;
                var r = $panel[0].getBoundingClientRect(); ox2 = r.left; oy2 = r.top;
                dragging2 = true;
                $(document).on('mousemove.samPanel touchmove.samPanel', function(me) {
                    if (!dragging2) return;
                    var mp = me.originalEvent.touches ? me.originalEvent.touches[0] : me;
                    var dx = mp.clientX - sx2, dy = mp.clientY - sy2;
                    var vw = GS_PARENT.innerWidth||1024, vh = GS_PARENT.innerHeight||768;
                    var pw = $panel.outerWidth(), ph = $panel.outerHeight();
                    var nl = Math.max(0, Math.min(vw-pw, ox2+dx));
                    var nt = Math.max(0, Math.min(vh-ph, oy2+dy));
                    $panel.css({left:nl+'px', top:nt+'px', right:'auto', bottom:'auto'});
                    if (me.type === 'touchmove' && me.cancelable) me.preventDefault();
                });
                $(document).on('mouseup.samPanel touchend.samPanel', function() {
                    dragging2 = false;
                    $(document).off('mousemove.samPanel touchmove.samPanel mouseup.samPanel touchend.samPanel');
                });
            });
        }
    }

    /* ===== 12. DOM 注入 ===== */
    function initSamsaraDOM() {
        if (!document.getElementById('samsara-ball')) {
            var t = getTheme();
            var panelAttr = (t === 'night') ? '' : ('data-theme="'+t+'"');
            var tpl = '<div id="samsara-ball"><div class="core"></div></div><div id="samsara-panel" '+panelAttr+'></div><div id="samsara-modal"></div><div id="samsara-portrait-viewer"><img id="sam-pv-img" alt=""><div id="sam-pv-label"></div></div>';
            $('body').append(tpl);
            setupDragEngines();
            bindUIEvents();
            bindPortraitEvents();
        }
    }

    /* ===== 13. ダイアログ ===== */
    function showModal(title, bodyHtml, noBgClose) {
        var $m = $('#samsara-modal');
        if (!$m.length) { $('body').append('<div id="samsara-modal"></div>'); }
        $m = $('#samsara-modal');
        $m.html('<div class="sam-modal-box"><div class="sam-modal-head"><span>'+esc(title)+'</span><span class="sam-modal-close">✕</span></div><div class="sam-modal-body">'+bodyHtml+'</div></div>');
        $m[0].scrollTop = 0;
        $m.addClass('open');
        $m.off('click.samModal').on('click.samModal', '.sam-modal-close', closeModal);
        $m.off('click.samModalBg');
        if (!noBgClose) $m.on('click.samModalBg', function(e) { if (e.target === this) closeModal(); });
        // 停止ボタン(.sam-shop-stop-btn、data-sam-act で振り分け): modal は body 直下にあり #samsara-panel とは独立,
        // そのため modal 自身に委譲を追加する(bloodFusionStop / shopStopRefresh と同一)、panel 内の同名委譲とは分離して共存
        $m.off('click.samModalStop').on('click.samModalStop', '.sam-shop-stop-btn', function(e) {
            e.stopPropagation();
            var act = String($(this).attr('data-sam-act') || '');
            if (act === 'blood-fusion-stop') bloodFusionStop();
            else shopStopRefresh();
        });
    }
    function closeModal() {
        var $m = $('#samsara-modal');
        $m.removeClass('open');
        // 残留しうる modal 関連イベントをすべて解除(samConfirm のオーバーレイ外クリック解除が次回 showModal に残るのを防ぐ)
        $m.off('click.samModal').off('click.samModalBg').off('click.samConfirm').off('click.samConfirmBg');
    }

    /* ===== 血統融合: 結果は完全に本文 API が返し、フロントは選択・待機・書き戻しのみを担う ===== */
    /* bloodFusionBusy は"血統関連"の操作のみをロックする(融合ポッドを開く/融合を実行/ショップ血統を購入),
       その他のショップ操作(エリアTab切替/装備・アイテム・スキル選択/商品更新)には影響しない */
    var bloodFusionBusy = false;
    var bloodFusionShopItem = null;
    var bloodFusionActionActor = 'キャラ'; // 今回の融合の書き込み先(パネル入口=角色、ショップ入口は shopCurrentActor に追従)
    var bloodFusionLastVals = { a: null, b: null }; // A/B 連動: 各側の前回選択値を記録し、値衝突時の交換に使用
    var BLOODLINE_RANK = { F:1, E:2, D:3, C:4, B:5, A:6, S:7, SS:8, SSS:9 };
    function bloodFusionEntries(extra) {
        var sd = getStatData(), ctx = shopResolveCharacter(sd, shopCurrentActor);
        var ch = ctx.character || {};
        var blood = ch && ch.血統 || {};
        var list = [];
        Object.keys(blood).forEach(function(name) { list.push({ name:name, data:blood[name] || {}, owned:true }); });
        if (extra) list.push({ name:extra.name, data:extra, owned:false });
        return list;
    }
    function bloodFusionOption(entry, selected, hidden) {
        return '<option value="'+esc(entry.name)+'"'+(selected ? ' selected' : '')+(hidden ? ' hidden' : '')+'>'+esc(entry.name)+' · '+esc(entry.data.品質 || 'F')+'</option>';
    }
    /* 血統融合の規則ライブラリ: 同級 / 高低級 の2系統の結果式、融合ポッドの規則パネル表示 + フロントの確率アルゴリズムに使用 */
    var BLOOD_FUSION_RULES = {
        same: [ // 同級血統の融合
            { name:'完美升阶', weight:20, cls:'r-good', list:['品質+1階','五維を目標品質の正常域まで補完','A/B 双方の優良詞条を融合','双方の血統が形態傾向を持つ場合、融合形態を1つ生成可能、形態の階層と属性は独立に判定'] },
            { name:'瑕疵升阶', weight:35, cls:'r-mid', list:['品質+1階','五維を目標品質の最低域まで補完','A/B 双方の通常詞条を融合','高リスクの負面コスト詞条を1条付加'] },
            { name:'变异觉醒', weight:30, cls:'r-mid', list:['品質不変','属性変化は融合度に依存','双方の全詞条を消去','変異詞条をランダム生成','融合結果に応じて新形態の覚醒を判定、形態の階層と属性は独立に判定'] },
            { name:'基因崩溃', weight:15, cls:'r-bad', list:['A は原状維持','B は永久消耗','収益は発生しない'] }
        ],
        diff: [ // 高低級
            { name:'稳定强化', weight:35, cls:'r-good', list:['品質不変','五維に B の 20% を加算','B の適合パッシブを1条融合','A/B 血統に形態が存在する場合、融合結果に応じて継承・改造を決定、形態の階層と属性は独立に判定'] },
            { name:'词条变异', weight:35, cls:'r-mid', list:['品質不変','属性は A のまま不変','詞条能力を再構築'] },
            { name:'基因排斥', weight:20, cls:'r-bad', list:['品質不変','属性は A のまま不変','負面の遺伝子不純物詞条を生成'] },
            { name:'崩坏消散', weight:10, cls:'r-bad', list:['A は原状維持','B は永久消耗','収益は発生しない'] }
        ]
    };
    /* フロントの確率アルゴリズム: weight の重みで確定結果を1つ roll する('脚本/脚本测试.js' のアルゴリズムと同期)
       入力 mode='same'|'diff'、BLOOD_FUSION_RULES[mode] 内のいずれかの規則オブジェクト {name, weight, list, cls} を返す */
    function bloodFusionRoll(mode) {
        var t = BLOOD_FUSION_RULES[mode] || BLOOD_FUSION_RULES.same;
        var total = 0;
        for (var i = 0; i < t.length; i++) total += t[i].weight;
        var r = Math.random() * total;
        for (var j = 0; j < t.length; j++) {
            r -= t[j].weight;
            if (r < 0) return t[j];
        }
        return t[t.length - 1];
    }
    /* 前回フロントが roll した結果(bloodFusionStart → bloodFusionBuildPrompt で AI に渡す;
       AI はこの結果に従って血統データを描画するのみで、自ら選択することは禁止) */
    var bloodFusionResult = null;
    /* 今回の融合で消費される血統名(A と B)、用途:
       1) 融合進行中: アップグレード欄で"置換対象 = これらの血統"のアップグレードカードをグレーアウトしてロック;
       2) 融合成功: アップグレード欄で"置換対象 = 削除された血統"のアップグレード項目もショップのアップグレード一覧から削除
       (元の血統は融合で消費済みのため、対応する旧アップグレードサービスは意味を失う) */
    var bloodFusionConsumedNames = [];
    /* 融合のターン番号: bloodFusionStart ごとに +1、旧 Promise のコールバックはターン不一致で結果を破棄("融合停止"でスタックしたリクエストを打ち切るため);
       bloodFusionSnap は開始時に控除済みのスペースコインと商品プールのスナップショットを保持し、bloodFusionStop / 失敗時のロールバックに供する */
    var bloodFusionEpoch = 0;
    var bloodFusionSnap = null;
    /* 血統カードのプレビュー(fullCard を再利用、読み取り専用): 品質/タグ/原始属性/効果/描述 */
    function bloodFusionPreviewCardHtml(entry) {
        if (!entry) return '<div class="sam-fusion-preview-empty">— 利用可能な血統なし —</div>';
        var b = entry.data || {}, q = parseRarity(b.品質);
        var rows = '', body = '<div class="sam-fc-body">';
        body += fcBody('タグ', formatTags(b.タグ || [], '', false), 'sam-fc-tags');
        if (b.原始属性 && typeof b.原始属性 === 'object' && Object.keys(b.原始属性).length > 0) {
            body += fcBodyCollapsible('原始属性', formatStatGrid(b.原始属性, 3), 'sam-fc-stats', false);
        }
        body += fcBody('効果', formatEffects(b.効果 || {}, '', false), 'sam-fc-effects');
        body += fcBody('説明', esc(safeStr(b.説明)));
        body += '</div>';
        var badge = entry.owned ? '<span class="sam-fusion-owned-pill" style="font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(143,159,255,0.18);color:var(--sam-sub)">所持済み</span>' : '<span class="sam-fusion-shop-pill" style="font-size:10px;padding:2px 6px;border-radius:8px;background:var(--sam-hp);color:#fff">ショップ商品</span>';
        return '<div class="sam-fusion-preview">'+fullCard(q, entry.name, rows, body, badge)+'</div>';
    }
    /* 規則パネル: mode=same/diff に応じて対応する結果式カードのグリッドを描画 */
    function bloodFusionRulePanelHtml(mode) {
        var list = BLOOD_FUSION_RULES[mode] || [];
        var title = (mode === 'same') ? '同級融合 · 確率分布' : '高低級融合 · 確率分布';
        var cards = list.map(function(r) {
            var lis = r.list.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('');
            return '<div class="sam-fusion-rule-card '+r.cls+'">'
                + '<div class="rhead"><span class="rname">'+esc(r.name)+'</span><span class="rw">'+r.weight+'%</span></div>'
                + '<ul class="rlist">'+lis+'</ul>'
                + '</div>';
        }).join('');
        return '<div class="sam-fusion-rule">'
            + '<div class="sam-fusion-rule-title"><span class="name">'+esc(title)+'</span><span class="pill">フロントが重みで roll · AI はデータを描画するのみ</span></div>'
            + '<div class="sam-fusion-rule-grid">'+cards+'</div></div>';
    }
    /* entry の品質数値を取得 */
    function bloodFusionRankOf(entry) {
        if (!entry || !entry.data) return 1;
        return BLOODLINE_RANK[String(entry.data.品質 || 'F').toUpperCase()] || 1;
    }
    /* 融合ポッド内の A/B ドロップダウンを描画(値衝突の交換 + フィルタ規則、A/B 双方向で対称):
       - 自側の現在選択項目: selected + hidden(展開リストでは隠すが、select は現在値を表示)
       - B 列の maxRank 制約: 品質 > maxRank(A の品質) の項目はスキップ(B は A より高くできない)
       - excludeName 相手の現在同名項目: 双方とも A と B が現在同品質(同級)のときのみ '(= 相手, クリックで交換)' を表示,
         それ以外は隠す(同級のときのみ交換可、不同級で交換すると B>A となり B≤A に違反)
       規則まとめ: B の選択肢は必ず ≤ A の品質; 同名同一の血統を A と B に同時に選ぶことは不可;
                 A と B が同品質(同級)のとき、A/B 双方のドロップダウンに相手の現在項目を値衝突交換の入口として表示 */
    function bloodFusionSelectHtml(entries, role, selName, maxRank, excludeName) {
        var selRank = null, exclRank = null;
        for (var k = 0; k < entries.length; k++) {
            if (entries[k].name === selName) selRank = bloodFusionRankOf(entries[k]);
            if (excludeName && entries[k].name === excludeName) exclRank = bloodFusionRankOf(entries[k]);
        }
        var sameRank = (selRank !== null && exclRank !== null && selRank === exclRank);
        var html = '<select class="sam-fusion-select" data-fusion-role="'+role+'" style="width:100%;margin-top:4px">';
        entries.forEach(function(x) {
            if (x.name === selName) { html += bloodFusionOption(x, true, true); return; }
            if (excludeName && x.name === excludeName) {
                // 双方とも A と B が同品質(同級)のときのみ '(= 相手, クリックで交換)' を表示、それ以外は隠す
                if (sameRank) {
                    var peer = (role === 'a') ? 'B' : 'A';
                    html += '<option value="'+esc(x.name)+'">'+esc(x.name)+' · '+esc(x.data.品質 || 'F')+' (クリックで交換)</option>';
                }
                return;
            }
            if (role === 'b' && maxRank != null && bloodFusionRankOf(x) > maxRank) return;
            html += bloodFusionOption(x, false, false);
        });
        html += '</select>';
        return html;
    }
    /* A/B 2つのドロップダウンを再構築:
       - A 列: B の現在同名項目は A・B が同品質のときのみ '(= B, クリックで交換)' として表示、それ以外は隠す; 他の項目は表示・選択可
       - B 列: A の現在同名項目は A・B が同品質のときのみ '(= A, クリックで交換)' として表示、それ以外は隠す; 品質>A の項目はスキップ */
    function bloodFusionRebuildSelects(entries, aVal, bVal) {
        var aEntry = null;
        for (var i = 0; i < entries.length; i++) { if (entries[i].name === aVal) { aEntry = entries[i]; break; } }
        var maxRank = aEntry ? bloodFusionRankOf(aEntry) : 9;
        $('.sam-fusion-select[data-fusion-role="a"]').replaceWith(bloodFusionSelectHtml(entries, 'a', aVal, null, bVal));
        $('.sam-fusion-select[data-fusion-role="b"]').replaceWith(bloodFusionSelectHtml(entries, 'b', bVal, maxRank, aVal));
    }
    /* 直接購入ボタンの状態を計算: 血統数が満杯 → グレーアウト+左側にヒント文言(ダイアログは出さない); それ以外は通常どおりクリック可 */
    function bloodFusionDirectBtnState() {
        if (!bloodFusionShopItem) return { show: false };
        var sd = getStatData();
        var bctx = shopResolveCharacter(sd, bloodFusionActionActor);
        var bch = bctx.character || {};
        var cap = BLOODLINE_CAP, count = Object.keys(bch.血統 || {}).length;
        var full = (count >= cap);
        return { show: true, full: full, count: count, cap: cap };
    }
    /* スマートな A/B 初期選択値:
       - shopItem なし(血統パネルから進入): entries はすべて自身の血統、品質降順で A=最高、B=次点(A≥B)
       - shopItem あり(血統ショップから進入): B の既定 = ショップ血統; A = 自身の最高品質血統
         (ショップ血統の品質 > 自身の最高品質 の場合を除く → A=ショップ血統、B=自身の最高品質血統) */
    function bloodFusionPickInitialAB(entries, shopItem) {
        if (entries.length < 2) return { aName: null, bName: null };
        var owned = entries.filter(function(e){ return e.owned; }).sort(function(p,q){ return bloodFusionRankOf(q) - bloodFusionRankOf(p); });
        var shopEntry = shopItem ? entries.filter(function(e){ return !e.owned; })[0] : null;
        if (!shopEntry) {
            // パネル入口: A=最高、B=次点
            return { aName: owned[0].name, bName: owned[1].name };
        }
        if (owned.length === 0) return { aName: shopEntry.name, bName: null };
        var topOwned = owned[0];
        if (bloodFusionRankOf(shopEntry) > bloodFusionRankOf(topOwned)) {
            // ショップ血統の方が高級 → A=ショップ、B=自身の最高(同級またはそれ以下)
            return { aName: shopEntry.name, bName: topOwned.name };
        }
        // ショップ血統 ≤ 自身の最高 → A=自身の最高、B=ショップ血統
        return { aName: topOwned.name, bName: shopEntry.name };
    }
    /* entries を品質降順に並べ、最初の ≠ excludeName かつ rank ≤ maxRank の有効項目を探す(B のフォールバック用) */
    function bloodFusionPickBUnderA(entries, excludeName, maxRank) {
        var sorted = entries.slice().sort(function(p,q){ return bloodFusionRankOf(q) - bloodFusionRankOf(p); });
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].name === excludeName) continue;
            if (bloodFusionRankOf(sorted[i]) > maxRank) continue;
            return sorted[i].name;
        }
        return null;
    }
    /* 融合タイプを判定: A/B の品質が同級 → 'same'(同級融合); それ以外 → 'diff'(高低級融合) */
    function bloodFusionJudgeMode(aName, bName, entries) {
        var find = function(n) {
            for (var i = 0; i < entries.length; i++) { if (entries[i].name === n) return entries[i]; }
            return null;
        };
        var a = find(aName), b = find(bName);
        if (!a || !b) return 'same';
        var ar = BLOODLINE_RANK[String(a.data.品質 || 'F').toUpperCase()] || 1;
        var br = BLOODLINE_RANK[String(b.data.品質 || 'F').toUpperCase()] || 1;
        return (ar === br) ? 'same' : 'diff';
    }
    /* ポッド内の A/B プレビューカード + 規則パネルを同期更新(ドロップダウンは再構築しない、selects は呼び出し側の責務) */
    function bloodFusionRefreshPreview(entries, aName, bName) {
        var find = function(n) {
            for (var i = 0; i < entries.length; i++) { if (entries[i].name === n) return entries[i]; }
            return null;
        };
        $('.sam-fusion-col[data-role="a"] .sam-fusion-preview-wrap').html(bloodFusionPreviewCardHtml(find(aName)));
        $('.sam-fusion-col[data-role="b"] .sam-fusion-preview-wrap').html(bloodFusionPreviewCardHtml(find(bName)));
        var mode = bloodFusionJudgeMode(aName, bName, entries);
        $('.sam-fusion-rule-host').html(bloodFusionRulePanelHtml(mode));
    }
    /* 融合ポッドのヘッダー行動バーを描画(ショップ入口: 満杯→[現在の血統を置換|現在の血統を融合]の二択、未満→直接購入; パネル入口: キャンセル/融合開始) */
    function bloodFusionActionsHtml(shopItem) {
        var html = '<div class="sam-fusion-actions" style="display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap">';
        if (shopItem) {
            var st = bloodFusionDirectBtnState();
            if (st.full) {
                // ★ 血統枠が満杯(CAP=1では常態): グレーアウトで封じず、2通りの処理を用意 —— 現在の血統を融合 / 現在の血統を置換
                html += '<span class="sam-fusion-direct-hint" style="flex:1;min-width:160px;font-size:11px;color:var(--sam-hp);line-height:1.4">⚠ 血統枠が満杯 ('+st.count+'/'+st.cap+')。新しい血統を現在の血統と融合するか、現在の血統を直接置き換えられます。</span>'
                    + '<button type="button" class="sam-confirm-btn cancel sam-fusion-replace-open">現在の血統を置換</button>';
            } else {
                html += '<span class="sam-fusion-direct-hint" style="flex:1;min-width:160px;font-size:11px;color:var(--sam-sub);line-height:1.4">血統枠の残り '+st.count+'/'+st.cap+'、そのまま購入できます。</span>'
                    + '<button type="button" class="sam-confirm-btn cancel sam-fusion-direct">直接購入</button>';
            }
        } else {
            html += '<button type="button" class="sam-confirm-btn cancel sam-fusion-direct">キャンセル</button>';
        }
        html += '<button type="button" class="sam-confirm-btn ok sam-fusion-start">'+(shopItem ? '現在の血統を融合' : '融合を開始')+'</button></div>';
        return html;
    }
    function openBloodFusionModal(shopItem) {
        // ★ 融合進行中: ポッドを開いて進捗を見ることは可能だが、待機ヒントのみ表示(再度の融合開始は不可)
        if (bloodFusionBusy) {
            showModal('血統融合中', '<div class="sam-shop-refreshing"><div class="sam-fusion-pulse">🧬</div><div>主神が血統の相性を検証し、融合アルゴリズムを実行しています…<br>現在の融合が完了してから次回を開始してください。</div><button type="button" class="sam-shop-stop-btn" data-sam-act="blood-fusion-stop">⏹ 融合を停止(停止した場合はここをクリックして復帰)</button></div>');
            return;
        }
        bloodFusionShopItem = shopItem || null;
        // ★ 融合の書き込み先: 血統パネル入口(ショップ血統なし) → 角色; ショップ入口(shopItem あり) → 現在のショップ選択キャラクターに追従
        bloodFusionActionActor = shopItem ? (shopCurrentActor || SHOP_ACTOR_REINCARNATOR) : SHOP_ACTOR_REINCARNATOR;
        var extra = shopItem ? { name:shopItem.name, 品質:shopItem.rating, タグ:shopItem.tags || [], 原始属性:shopItem.raw_attrs || {}, 効果:shopItem.effects || {}, 説明:shopItem.description || '' } : null;
        var entries = bloodFusionEntries(extra);
        var title = shopItem ? '血統の購入と融合の確認' : '血統融合ポッド';
        var head = '<div class="sam-fusion-head">'
            + '<span class="ico" style="font-size:22px">🧬</span>'
            + '<span class="ttl" style="font-size:15px;font-weight:600;color:var(--sam-fg)">血統融合ポッド</span>'
            + '<span class="sub" style="font-size:11px;color:var(--sam-sub);line-height:1.5">主血統 <b style="color:var(--sam-accent)">A</b> が核心方向・外見と主要能力を決定<br>副素材 <b style="color:var(--sam-hp)">B</b> は融合後に永久消耗 · 結果は取り消し不可</span>'
            + '</div>';
        // ★ 血統が2つ未満: ダイアログは開き、A/B ドロップダウンは空+グレーアウトでクリック不可、プレビューは空状態、toast によるブロックはしない
        if (entries.length < 2) {
            var emptySelHtml = '<select class="sam-fusion-select" data-fusion-role="" disabled style="opacity:0.5;cursor:not-allowed;filter:grayscale(1)"><option value="" selected disabled>— 利用可能な血統なし —</option></select>';
            bloodFusionLastVals = { a: null, b: null };
            var emptyCard = bloodFusionPreviewCardHtml(null);
            var html2 = '<div class="sam-fusion-wrap">'
                + head
                + '<div class="sam-fusion-pair">'
                + '<div class="sam-fusion-col" data-role="a"><div class="sam-fusion-col-label"><span class="tag a">A</span><span class="role">主血統</span><span class="note">核心方向を決定</span></div>'+emptySelHtml+'<div class="sam-fusion-preview-wrap">'+emptyCard+'</div></div>'
                + '<div class="sam-fusion-arrow">⇌</div>'
                + '<div class="sam-fusion-col" data-role="b"><div class="sam-fusion-col-label"><span class="tag b">B</span><span class="role">副素材</span><span class="note">永久消耗</span></div>'+emptySelHtml+'<div class="sam-fusion-preview-wrap">'+emptyCard+'</div></div>'
                + '</div>'
                + '<div class="sam-shop-warn" style="margin-top:2px">'+(shopItem ? '現在のキャラクターには融合に使用できる既存の血統がありません。この血統を直接購入できます。' : '融合には少なくとも2つの血統が必要です。現在の血統枠が不足しています。')+'</div>'
                + (shopItem ? bloodFusionActionsHtml(shopItem).replace('class="sam-confirm-btn ok sam-fusion-start"', 'class="sam-confirm-btn ok sam-fusion-start" disabled style="opacity:0.5;cursor:not-allowed;filter:grayscale(1)"').replace('>現在の血統を融合<', '>融合を開始<') : '<div style="display:flex;justify-content:flex-end;margin-top:2px"><button type="button" class="sam-confirm-btn cancel sam-fusion-direct">キャンセル</button></div>')
                + '</div>';
            showModal(title, html2);
            return;
        }
        // ★ スマートな A/B 初期選択値: パネル入口(shopItem なし) → A=自身の最高、B=次点; ショップ入口 → A=高級側、B=低級側/ショップ血統
        var pick = bloodFusionPickInitialAB(entries, shopItem);
        var aEntry = null, bEntry = null;
        for (var pi = 0; pi < entries.length; pi++) {
            if (entries[pi].name === pick.aName) aEntry = entries[pi];
            if (entries[pi].name === pick.bName) bEntry = entries[pi];
        }
        bloodFusionLastVals = { a: pick.aName, b: pick.bName }; // 初期値を記録し、連動交換に使用
        var maxRank0 = aEntry ? bloodFusionRankOf(aEntry) : 9;
        var mode = bloodFusionJudgeMode(pick.aName, pick.bName, entries);
        var html = '<div class="sam-fusion-wrap">'
            + head
            + '<div class="sam-fusion-pair">'
            + '<div class="sam-fusion-col" data-role="a"><div class="sam-fusion-col-label"><span class="tag a">A</span><span class="role">主血統</span><span class="note">核心方向を決定</span></div>'+bloodFusionSelectHtml(entries, 'a', pick.aName, null, pick.bName)+'<div class="sam-fusion-preview-wrap">'+bloodFusionPreviewCardHtml(aEntry)+'</div></div>'
            + '<div class="sam-fusion-arrow">⇌</div>'
            + '<div class="sam-fusion-col" data-role="b"><div class="sam-fusion-col-label"><span class="tag b">B</span><span class="role">副素材</span><span class="note">永久消耗</span></div>'+bloodFusionSelectHtml(entries, 'b', pick.bName, maxRank0, pick.aName)+'<div class="sam-fusion-preview-wrap">'+bloodFusionPreviewCardHtml(bEntry)+'</div></div>'
            + '</div>'
            + '<div class="sam-fusion-rule-host">'+bloodFusionRulePanelHtml(mode)+'</div>'
            + '<div class="sam-shop-warn" style="margin-top:2px">A は主血統でなければならない(品質 ≥ B)。B の選択肢は A より高くできない。品質が異なる場合は高い方の血統を主血統 A とする。融合結果は主神アルゴリズム API が返し、取り消し・ロールバックは不可。</div>'
            + bloodFusionActionsHtml(shopItem)
            + '</div>';
        showModal(title, html);
    }
    /* A/B 連動(値衝突の交換 + B≤A 制約):
       - 値衝突の交換: 一方が相手の現在同名項目へ切り替える → 相手は自動で自側の旧値へ戻る
         例: A=D1, B=D2 で B のドロップダウンから 'D1 (= A, クリックで交換)' を選択 → B=D1、A は自動で D2 に
       - A 切替後に B が無効になる場合(品質>A または新しい A と同名) → B は品質 ≤ A の最高有効項目(≠A 同名)へフォールバック
       - B 切替後: ドロップダウンのフィルタで ≤A は保証済み; もし B の新品質 > A の品質(理論上は発生しない)なら保険としてフォールバック */
    function bloodFusionSyncSelect(role) {
        var $a = $('.sam-fusion-select[data-fusion-role="a"]');
        var $b = $('.sam-fusion-select[data-fusion-role="b"]');
        if (!$a.length || !$b.length) return;
        var entries = bloodFusionEntries(bloodFusionShopItem ? { name:bloodFusionShopItem.name, 品質:bloodFusionShopItem.rating, タグ:bloodFusionShopItem.tags || [], 原始属性:bloodFusionShopItem.raw_attrs || {}, 効果:bloodFusionShopItem.effects || {}, 説明:bloodFusionShopItem.description || '' } : null);
        var oldA = bloodFusionLastVals.a, oldB = bloodFusionLastVals.b;
        var newVal = (role === 'a') ? $a.val() : $b.val();
        var otherVal = (role === 'a') ? $b.val() : $a.val();
        var aVal = (role === 'a') ? newVal : otherVal;
        var bVal = (role === 'b') ? newVal : otherVal;
        // 値衝突の交換: 自側の新値 = 相手の現在値 → 相手は自側の旧値へ戻る
        //   例: role='a', A を D1 から D2(=B の現在値)へ変更 → A は B の旧位置 D2 を引き継ぎ、B は自動で A の旧位置 D1 を引き継ぐ → bVal = oldA
        //   例: role='b', B を D2 から D1(=A の現在値)へ変更 → B は A の旧位置 D1 を引き継ぎ、A は自動で B の旧位置 D2 を引き継ぐ → aVal = oldB
        if (newVal === otherVal && oldA && oldB && oldA !== oldB) {
            if (role === 'a') { bVal = oldA; }
            else { aVal = oldB; }
        }
        // B≤A 制約: B の品質 > A の品質 なら → B を品質 ≤ A の最高有効項目(≠A 同名)へフォールバック
        var aEntryFinal = null;
        for (var af = 0; af < entries.length; af++) { if (entries[af].name === aVal) { aEntryFinal = entries[af]; break; } }
        if (aEntryFinal) {
            var maxRankF = bloodFusionRankOf(aEntryFinal);
            var bEntryFinal = null;
            for (var bf = 0; bf < entries.length; bf++) { if (entries[bf].name === bVal) { bEntryFinal = entries[bf]; break; } }
            if (!bEntryFinal || bVal === aVal || bloodFusionRankOf(bEntryFinal) > maxRankF) {
                var pickB = bloodFusionPickBUnderA(entries, aVal, maxRankF);
                if (pickB) bVal = pickB;
            }
        }
        bloodFusionLastVals = { a:aVal, b:bVal };
        bloodFusionRebuildSelects(entries, aVal, bVal);
        bloodFusionRefreshPreview(entries, aVal, bVal);
    }
    async function bloodFusionStart(aName, bName) {
        if (!aName || !bName || aName === bName) { samToast('warning', 'A と B には異なる2つの血統を選択してください'); return; }
        var entries = bloodFusionEntries(bloodFusionShopItem ? { name:bloodFusionShopItem.name, 品質:bloodFusionShopItem.rating, タグ:bloodFusionShopItem.tags || [], 原始属性:bloodFusionShopItem.raw_attrs || {}, 効果:bloodFusionShopItem.effects || {}, 説明:bloodFusionShopItem.description || '' } : null);
        var a = entries.filter(function(x){return x.name === aName;})[0], b = entries.filter(function(x){return x.name === bName;})[0];
        if (!a || !b) { samToast('error', '血統データが変化しました。融合ポッドを開き直してください'); return; }
        if (bloodFusionShopItem && a.name !== bloodFusionShopItem.name && b.name !== bloodFusionShopItem.name) {
            samToast('warning', 'ショップの血統は今回の融合で A または B にする必要があります'); return;
        }
        var ar = BLOODLINE_RANK[String(a.data.品質 || 'F').toUpperCase()] || 1, br = BLOODLINE_RANK[String(b.data.品質 || 'F').toUpperCase()] || 1;
        if (ar < br) { var swap = a; a = b; b = swap; }
        // AI インターフェースのチェックは roll の後に延期: 基因崩溃/崩坏消散 は AI を呼ばない(純ローカル書き戻し)ため不要; その他の結果はインターフェースを要求
        var _mode0 = (ar === br) ? 'same' : 'diff';
        var _roll0 = bloodFusionRoll(_mode0);
        var _isNoAIResult = _roll0 && (_roll0.name === '基因崩溃' || _roll0.name === '崩坏消散');
        // 追加モデル設定が有効なら自ホストAPI、そうでなければ generateRaw で融合結果を生成
        if (!_isNoAIResult && !isApiConfigEnabled() && !shopGetAI()) { samToast('error', '融合アルゴリズム API が検出できません(設定で「追加モデル設定」を有効にしてください)'); return; }
        if (!_isNoAIResult && isApiConfigEnabled() && !getApiConfig().model) { samToast('error', '追加モデル設定は有効ですがモデルが未選択です。先に設定パネルでモデルを選択してください'); return; }
        // ★ ショップ血統の融合: 融合開始時に即座にコインを控除 + ストアから血統商品を削除(融合終了は待たない)
        //   融合失敗/ユーザー停止ならロールバック(スペースコイン+商品プールを復元)して原子性を保証; 成功後はコイン控除/商品プール削除を繰り返さない
        bloodFusionSnap = null;
        if (bloodFusionShopItem) {
            var prePrice = safeNum(bloodFusionShopItem.price, 0);
            var preSd = getStatData();
            var preCoin = preSd && preSd.キャラ ? safeNum(preSd.キャラ.スペースコイン, 0) : 0;
            if (preCoin < prePrice) { samToast('warning', 'スペースコインが不足しているため、この血統を購入して融合できません'); return; }
            // ★ 複数キャラクター: 通貨/証憑は引き続き 角色 アカウントから控除; 血統商品は今回の融合対象キャラクターの 商城 ライブラリから削除
            var preActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
            var preActorCtx = shopResolveCharacter(preSd, preActor);
            var preCredentialRequirements = {};
            var preCredentialRequirement = shopCredentialRequirement(preActorCtx.character || {}, bloodFusionShopItem);
            if (preCredentialRequirement.required) preCredentialRequirements[preCredentialRequirement.grade] = 1;
            var preCredentialShortages = shopCredentialShortages(preSd && preSd.キャラ && preSd.キャラ.権限証憑, preCredentialRequirements);
            if (preCredentialShortages.length) { samToast('warning', '権限証憑が不足：'+shopCredentialShortageText(preCredentialShortages)); return; }
            var preActorLib = shopGetActorLibRaw(preSd && preSd.商城, preActor);
            var preBloodArr = (preActorLib && Array.isArray(preActorLib.血統リスト)) ? preActorLib.血統リスト.slice() : null;
            // コイン控除/証憑消費/商品削除の前のスナップショットを保存し、失敗/停止時のロールバックに供する
            bloodFusionSnap = {
                price: prePrice,
                preCoin: preCoin,
                preActor: preActor,
                preBloodLib: preBloodArr,
                credentialRequirements: preCredentialRequirements
            };
            var preOk = writeBackMvu(function(statData) {
                statData.キャラ = statData.キャラ || {};
                statData.キャラ.権限証憑 = statData.キャラ.権限証憑 || {};
                if (!shopCredentialConsume(statData.キャラ.権限証憑, preCredentialRequirements)) throw new Error('权限凭证扣除失败');
                statData.キャラ.スペースコイン = Math.max(0, safeNum(statData.キャラ.スペースコイン, 0) - prePrice);
                var _lib = shopGetActorLibRaw(statData.商城, preActor);
                if (_lib && Array.isArray(_lib.血統リスト)) {
                    _lib.血統リスト = _lib.血統リスト.filter(function(item) { return safeStr(item.名称) !== bloodFusionShopItem.name; });
                }
            });
            if (!preOk) { samToast('error', 'スペースコインの控除に失敗したため、融合を開始できません'); return; }
            // ローカルキャッシュを即時同期、ストア一覧から当該血統が即座に消える
            try {
                var freshSd = getStatData();
                var freshLib0 = shopGetActorLibRaw(freshSd && freshSd.商城, preActor);
                if (freshLib0) {
                    shopMarketData = shopNormalizeMarketData(freshLib0);
                    if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
                }
            } catch(eSnap) {}
            shopCart = [];
        }
        // ★ フロントが重みに従って確定結果を roll('脚本测试.js' のアルゴリズムと同期), AI はその結果に対応する血統データを描画するのみ
        //   line ~1685 で roll 済みの _roll0 を再利用(再ランダムによる前後の不一致を回避)
        bloodFusionResult = _roll0;
        bloodFusionBusy = true;
        // ★ ターン番号を進める: ユーザーが"融合停止"を押すか新しい融合を再開すると epoch が変わり、旧 Promise のコールバックはターン不一致で結果を破棄
        bloodFusionEpoch += 1;
        var myEpoch = bloodFusionEpoch;
        // 今回の融合で消費されるキャラクター側の元血統名(A、B のうち owned:true の全項目)を記録,
        // 用途: 1) 融合進行中にアップグレード欄の"replace_target=これらの血統"のアップグレードカードをグレーロック;
        //       2) 融合成功後にショップのアップグレード一覧から対応血統が無くなったアップグレード項目を削除
        bloodFusionConsumedNames = [];
        if (a && a.owned) bloodFusionConsumedNames.push(a.name);
        if (b && b.owned) bloodFusionConsumedNames.push(b.name);

        // ★ ショートパス: roll で【基因崩溃 / 崩坏消散】が出た場合は AI 描画の呼び出しが不要,
        //   規則は "A は原状維持 / B は永久消耗 / 収益なし" — 融合中ダイアログを出し → 10s カウントダウン後に書き戻し(B のみ削除、新血統なし、形態なし)
        var rollName0 = bloodFusionResult ? bloodFusionResult.name : '';
        if (rollName0 === '基因崩溃' || rollName0 === '崩坏消散') {
            closeModal();
            renderAll();
            showModal('血統融合中', '<div class="sam-shop-refreshing"><div class="sam-fusion-pulse">🧬</div><br>主神が法則に従って血統データを融合しています…<br>ウィンドウを閉じても、結果は返り次第自動で書き込まれます。<button type="button" class="sam-shop-stop-btn" data-sam-act="blood-fusion-stop">⏹ 融合を停止(停止した場合はここをクリックして復帰)</button></div></div>');
            var delayMs = 10000;
            // epoch ガードに対応するため Promise 化した setTimeout を使用(ユーザーが停止を押すと epoch が変わり、遅れて届いた書き戻しを破棄)
            await new Promise(function(resolve){ setTimeout(resolve, delayMs); });
            if (myEpoch !== bloodFusionEpoch || !bloodFusionBusy) return;  // この間に"融合停止"で打ち切られた → 書き戻さない
            // 書き戻し: キャラクター側の B 血統のみ削除(b.owned のときのみ削除)、新血統は追加せず、形態ライブラリも書かない; A は原状維持;
            //   アップグレード一覧のクリーンアップ処理は成功パスを踏襲(replace_target が削除済み B に一致するアップグレード項目も併せて除外)
            var consumedNames0 = bloodFusionConsumedNames.slice();
            var _actor0 = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
            var ok0 = writeBackMvu(function(statData) {
                var _ctx0 = shopResolveCharacter(statData, _actor0);
                var _ch0 = _ctx0.character || {};
                _ch0.血統 = _ch0.血統 || {};
                if (b.owned) delete _ch0.血統[b.name];
                if (bloodFusionSnap && bloodFusionShopItem) {
                    shopAppendReceipt(statData, shopReceiptLine('血統融合', bloodFusionShopItem.name+' → '+rollName0, bloodFusionSnap.price, statData.キャラ.スペースコイン, (bloodFusionActionActor === SHOP_ACTOR_REINCARNATOR ? 'キャラ' : bloodFusionActionActor)));
                }
                var _ulib0 = shopGetActorLibRaw(statData.商城, _actor0);
                if (_ulib0 && Array.isArray(_ulib0.升級リスト) && consumedNames0.length) {
                    _ulib0.升級リスト = _ulib0.升級リスト.filter(function(u) {
                        var upCat = String(shopPick(u, 'category','所属カテゴリ','タイプ','type') || '');
                        var tgt = String(shopPick(u, 'replace_target','置換対象') || '');
                        if (upCat === '血統' && tgt && consumedNames0.indexOf(tgt) >= 0) return false;
                        return true;
                    });
                }
            });
            if (!ok0) {  // ごく稀: MVU 書き戻し失敗 → 既存の失敗ロールバック処理に準ずる(スペースコイン+商品プールを復元)
                if (bloodFusionSnap) {
                    try {
                        writeBackMvu(function(statData) {
                            statData.キャラ = statData.キャラ || {};
                            statData.キャラ.スペースコイン = safeNum(statData.キャラ.スペースコイン, 0) + bloodFusionSnap.price;
                            statData.キャラ.権限証憑 = statData.キャラ.権限証憑 || {};
                            shopCredentialRefund(statData.キャラ.権限証憑, bloodFusionSnap.credentialRequirements || {});
                            if (bloodFusionSnap.preBloodLib !== null && statData.商城) {
                                var _rlib0 = shopGetActorLibRaw(statData.商城, bloodFusionSnap.preActor);
                                if (_rlib0) _rlib0.血統リスト = bloodFusionSnap.preBloodLib.slice();
                            }
                        });
                    } catch(eRoll0) { try { console.warn('[主神终端] '+rollName0+' 書き戻し失敗時のロールバック例外:', eRoll0.message); } catch(e2){} }
                }
                bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = []; bloodFusionSnap = null; closeModal();
                renderAll();
                samToast('error', rollName0+' の書き戻しに失敗したため、ロールバックしました');
                return;
            }
            // アップグレード欄のローカルキャッシュ同期
            try {
                var freshSd0 = getStatData();
                var freshLib0a = shopGetActorLibRaw(freshSd0 && freshSd0.商城, bloodFusionActionActor);
                if (freshLib0a) {
                    shopMarketData = shopNormalizeMarketData(freshLib0a);
                    if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
                }
            } catch(eFresh0) {}
            // 書き戻し成功、ロールバック用スナップショットは不要
            bloodFusionSnap = null;
            var rollResult0 = bloodFusionResult;
            var rollWeight0 = rollResult0 ? rollResult0.weight : '';
            closeModal(); bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = [];
            renderAll();
            showModal('融合結果 · '+rollName0, '<div class="sam-shop-warn">融合結果：'+esc(rollName0)+'</div>'
                + '<div class="sam-full-card">'+esc(a.name)+' は原状維持；'+esc(b.name)+' は永久に消散し、いかなる収益も生みません。</div>'
                + '<div class="sam-full-card" style="opacity:0.85">規則: '+(rollResult0 && rollResult0.list ? rollResult0.list.join(' / ') : 'A は原状維持 / B は永久消耗 / 収益なし')+'</div>');
            return;  // ショートパス終了, 以降の AI フローには進まない
        }

        closeModal();
        renderAll();
        showModal('血統融合中', '<div class="sam-shop-refreshing"><div class="sam-fusion-pulse">🧬</div><br>主神が法則に従って血統データを融合しています…<br>ウィンドウを閉じても、結果は返り次第自動で書き込まれます。<button type="button" class="sam-shop-stop-btn" data-sam-act="blood-fusion-stop">⏹ 融合を停止(停止した場合はここをクリックして復帰)</button></div></div>');
        
        var content = ''
            + '属性システム (下層定義):\n'
            + '  基礎五維 (判定基準):\n'
            + '    筋力: 近接/重量/破壊\n'
            + '    敏捷: 平衡/隠密/照準\n'
            + '    体力: 生命/耐性/回復\n'
            + '    精神: 詠唱/察知/意志\n'
            + '    魅力: 社交/欺瞞/威圧\n'
            + '  資源属性:\n'
            + '    HP: 生命値、HP≤0で死亡判定\n'
            + '    HP_MAX: 生命値の上限\n'
            + '    THP: 一時生命値/シールド、ダメージを受けた際に優先して減算、重複せず、戦闘離脱でゼロに戻る\n'
            + '    EP: エネルギー値、スキル消費に使用\n'
            + '    EP_MAX: エネルギー値の上限\n'
            + '  衍生属性:\n'
            + '    ATK: 物理攻撃\n'
            + '    DEF: 物理防御\n'
            + '    MATK: 術法攻撃\n'
            + '    MDEF: 術法防御\n'
            + '    AP: 術法強度の乗算区画\n'
            + '  行動属性 (グローバルで追加禁止):\n'
            + '    先制DC: 行動順\n'
            + '    防御DC: 被命中難易度\n';
        // ワールドブック内容の取得呼び出し
        content += await getWorldBookContent('⚙️生命层级与社会生态'); 
        content += await getWorldBookContent('⚙️品质效果数值规则'); 
        content += await getWorldBookContent('⚙️实体生成规则'); 
        content += await getWorldBookContent('⚙️状态协议'); 
        content += await getWorldBookContent('⚙️行为判定[mvu_plot]'); 

        // システムプロンプトの構築: 融合レンダラの位置づけ + 属性システムの下層定義 + ワールドブック規則の内容
        var sysPrompt = ''
            + 'あなたは主神血統融合アルゴリズムのレンダラです。融合結果はすでにフロントシステムが重みに従って roll 済みであり、あなたは自ら結果を選択したり、確率を書き換えたり、実行を拒否したりしてはなりません。\n'
            + 'ユーザーが提示した確定結果と規則に従って具体的な血統データのみを生成し、規定の YAML を返してください。\n'
            + '【系统设定】\n'
            + content + '\n'
            + '【严格输出格式】\n'
            + 'YAML テキストのみを出力し、説明や markdown のコードフェンスは不要です。\n'
            + 'フィールドの型は厳密に従ってください:\n'
            + '  - 品質: 文字列, F / E / D / C / B / A / S / SS / SSS のみ\n'
            + '  - タグ: インライン配列 [\'标签1\', \'标签2\'...]\n'
            + '  - 原始属性: インラインオブジェクト、段階付けは《品質効果数値規則》に従う; 血統は五維（力量、敏捷、体质、精神、魅力）を完全に含むこと、装備は有効な非0項目のみ記述\n'
            + '  - 効果: インラインオブジェクト {效果名: \'説明\'}, キーは文字列, 値は文字列の説明\n'
            + '  - 価格: 数値(スペースコイン)\n'
            + '  - 説明/消費: 字符串\n'
            + '  - タイプ:\n'
            + '      技能リスト.タイプ = 数値 0(アクティブ) / 1(パッシブ) / 2(特殊)\n'
            + '  - 置換対象: 文字列 (【形态列表】内でのみ必須、プレイヤーが現在所持する元アイテム名と一字一句違わず一致させること！)\n'
            + '  - 道具リスト.数量 = 数値(この商品を購入可能な在庫数, ≥1)\n'
            + 'オブジェクトのキーに英語のピリオドは使用禁止、口径系のX.YmmはX·Yと統一して記述（例：5.56mm弾薬→5·56弾薬）;\n'

        // 融合レンダリング prompt の構築: フロントはすでに bloodFusionRoll で重みに従って【确定结果】を roll 済み,
        // AI は"レンダラ"として結果に対応する規則に従い具体的な血統データ(名称/品质/属性/效果/描述)を生成するのみ,
        // 自ら結果を選択したり確率を書き換えたりすることは固く禁ずる。result = {name, weight, list, cls}
        function bloodFusionBuildPrompt(a, b, mode, result) {
            var modeText = (mode === 'same') ? '同級融合' : '高低級融合';
            var rulesText = (result.list || []).map(function(s, idx){ return '  ' + (idx + 1) + '. ' + s; }).join('\n');
            return '血統融合レンダリングエンジン。融合結果はすでにシステムが重みに従って roll 済みであり、あなたは自ら結果を選択したり確率を書き換えたりすることはできず、与えられた結果に従って血統データを描画するのみです。\n'
                + 'A は主血統、B は副素材; 品質が異なる場合は高品質の方を A とする。\n'
                + '今回の融合タイプ: ' + modeText + '\n'
                + '今回の融合結果(システムが確定済み): ' + result.name + '\n'
                + 'この結果に対応する規則は以下のとおりで、必ずこの規則に厳密に従ってフォーマットデータを生成すること:\n' + rulesText + '\n\n'
                + '  - 【组件替换规则】:\n'
                + '     * 融合結果が新形態を生み出して旧形態を置き換える場合、替换目标 を必ず記入すること。\n'
                + '     * 置換対象 は下記の【已有形态】の実際の名簿から一字一句選ぶこと; 名簿外・削除済み・存在しない形態名を使用してはならない。\n'
                + '     * 置換対象 に対応するコンポーネントはバックグラウンドで削除され、説明文の形で残すことは許されない。\n'
                + '     * 融合規則が詞条の消去を要求する場合、再構築を許可し、旧詞条は継承しない。\n'
                + '     * 融合規則が強化継承を要求する場合、有効な詞条を完全に移行すること。\n'
                + '     * 融合結果が形態能力を生まない場合、形态列表の出力は空とし、変身体系を無理に創造してはならない, 置換対象 には"无"を記入する。\n'
                + '     * 説明文に"已删除形态"、"删除 XX 形态"など、もはや存在しない形態への参照を一切含めてはならない, 【已有形态】の名簿のみに基づいて客観的に記述すること。\n'
                + '  - 【形态生成规则】:\n'
                + '     * 形態は独立した戦闘モードに属し、主血統の階層判定を継承しない。\n'
                + '     * 形態の階層は血統品質とキャラクターの現在の生命階層から独立し、形態自身の戦闘位格に従って生成する。\n'
                + '     * 形態の原始属性は自身の特徴と戦闘定位に従って生成し、主血統の属性を複製・継承・微調整してはならない。\n'
                + 'YAML 形式のみを出力すること, フィールドは以下のとおり:\n'
                + '融合结果: ' + result.name + '\n'
                + '血統リスト:\n'
                + '  - 名称: 最終血統の名称\n'
                + '    品質: F\n'
                + '    タグ: [タグ]\n'
                + '    原始属性: {筋力: C, 敏捷: E, 体力: D, 精神: F, 魅力: E}\n'
                + '    効果: {词条: 説明}\n'
                + '    説明: 結果の説明\n\n'
                + '形态列表:\n'
                + '  - 名称: 形態名\n'
                + '    置換対象: 元の形態の正確な名称 (例: 人狼形態)\n'
                + '    階層: {形態自身の戦闘位格に従って生成, Ⅰ－Ⅸ}\n'
                + '    消費: HP/EP/特殊資源\n'
                + '    状態: 完好\n'
                + '    タグ: ["主神空間", 依存する道具/血統/来源など]\n'
                + '    原始属性: {基础属性/衍生属性: 品質}\n'
                + '    効果: { [词条]: 説明 }\n'
                + '    技能: {\n'
                + '     - 名称: スキル名\n'
                + '       品質: F\n'
                + '       タイプ: 0\n'
                + '       タグ: ["主神空間", "被动"]\n'
                + '       効果: {射击校准: 射击检定+5}\n'
                + '       説明: 簡潔な説明\n'
                + '       消費: 无}\n'
                + '    説明: 簡潔な説明\n'
                + '注意: "基因崩溃" と "崩坏消散" は新しい血統を生まない, ただし結果として A の元血統を返す必要がある(説明の中で B が永久消耗することを述べる)。\n\n'
                + 'A=' + JSON.stringify(a)
                + '\nB=' + JSON.stringify(b);
        }

        // —— ユーザープロンプト: プレイヤーコンテキスト + 要求 + 出力テンプレート例 ——
        var sd = getStatData();
        var _pctx = shopResolveCharacter(sd, bloodFusionActionActor);
        var p = _pctx.character || {};
        var parts = [];
        // ★ コア補助関数：アイテムの重要情報をすべて抽出し、コンパクトな1行テキストに連結。網羅的かつ Token 節約
        function formatDict(dict) {
            var keys = Object.keys(dict || {});
            if (keys.length === 0) return 'なし';
            
            return keys.map(function(k) {
                var v = dict[k] || {};
                var info = [];

                if (v.品質) info.push(v.品質 + '级');
                if (v.数量 != null) info.push('数量:' + v.数量);
                if (v.消費) info.push('消費:' + v.消費);
                if (Array.isArray(v.タグ) && v.タグ.length > 0) info.push('タグ:' + v.タグ.join('、'));
                // 属性と効果はオブジェクトなので JSON.stringify で平坦化して表示
                if (v.原始属性 && Object.keys(v.原始属性).length > 0) info.push('属性:' + JSON.stringify(v.原始属性));
                if (v.効果 && Object.keys(v.効果).length > 0) info.push('効果:' + JSON.stringify(v.効果));
                if (v.技能) info.push('技能:' + JSON.stringify(v.技能));
                if (v.説明) info.push('説明:' + v.説明);
                
                // 出力形式の例: "  - 御剑术 [F级 | 消耗:8MP | 效果:{"主动":"..."} | 描述:...]"
                return '  - ' + k + ' [' + info.join(' | ') + ']';
            }).join('\n');
        }
        // 既存の形態名(AIの重複回避+構築適合を支援)
        var formData = p.形態庫 || {};
        if (Object.keys(formData).length) parts.push('已有形态:\n' + formatDict(formData));
        
        var playerCtx = parts.join('\n');
        var userPrompt = '\n【当前玩家数据】\n' + (playerCtx || '(无)') + '\n';
        userPrompt += bloodFusionBuildPrompt(a, b, _mode0, bloodFusionResult);
        // console.log(sysPrompt, userPrompt);
        // try/await を元の then/catch, 失敗時はスペースコイン+商品在庫をロールバック
        try {
            var out = await shopCallAI(sysPrompt, userPrompt);
            // ターン検証: ユーザーが"融合停止"を押すか新しい融合を再開すると epoch が変わる, 遅れて届いた結果は破棄
            if (myEpoch !== bloodFusionEpoch || !bloodFusionBusy) return;
            var parsed = shopParseMarketText(out), result = parsed.血統リスト && parsed.血統リスト[0];
            if (!result || !result.名称) throw new Error('融合結果の形式が無効');
            var resultName = result.名称;
            // AI が 形态列表(融合で新形態を生成)を返す場合がある, 升级列表 の replace_target と同じ処理方式:
            // 先に"替换目标"に対応する旧形態を削除し, その後 形态库 へ新形態を書き込む
            var formList = Array.isArray(parsed.形态列表) ? parsed.形态列表 : [];
            // 単一の原始形態を正規化( 32e の 形态库 データ構造に整合)
            // 単一の原始形態を正規化 → 形态库 データ構造
            // 注意: ZOD form_item の 技能 は z.record(z.string(), skill_item) のオブジェクトマップ(key=スキル名, スキル値の中国語キー 品质/类型/标签/效果/描述/消耗)
            //   form_item の最上位に 名称/替换目标(由 形态库 record の key が担い, 替换目标 は削除ロジック専用)
            //   よって normalizeForm は ZOD schema の最上位フィールドのみを残し, 名称/替换目标 は _name/_replace として書き込み側コードが消費(ZOD strip)
            function normalizeForm(raw) {
                if (!raw || typeof raw !== 'object') return null;
                var name = shopPick(raw, 'name','名称');
                if (!name) return null;
                var rawSkills = shopPick(raw, '技能','skills') || {};
                var sArr;
                if (Array.isArray(rawSkills)) sArr = rawSkills;
                else if (rawSkills && typeof rawSkills === 'object') sArr = Object.keys(rawSkills).map(function(k) { var v = rawSkills[k]; if (v && typeof v === 'object' && !v.名称 && !v.name) v.名称 = k; return v; });
                else sArr = [];
                var skillsMap = {};
                sArr.forEach(function(s) {
                    if (!s || typeof s !== 'object') return;
                    var sn = shopPick(s, 'name','名称');
                    if (!sn) return;
                    var stn = shopPick(s, 'type','タイプ');
                    var stNum = (typeof stn === 'number') ? stn
                        : (typeof stn === 'string' && /^\d+$/.test(String(stn))) ? parseInt(String(stn), 10) : 0;
                    skillsMap[sn] = {
                        品質:  shopPick(s, 'rating','品質','品级','评级') || 'F',
                        タイプ:  stNum,
                        タグ:  shopEnsureSourceTag(shopPick(s, 'tags','タグ')),
                        効果:  shopPick(s, 'effects','効果') || {},
                        説明:  shopPick(s, 'description','説明','説明') || '',
                        消費:  shopPick(s, '消费','消費','cost') || '无'
                    };
                });
                var tagsVal = shopPick(raw, 'tags','タグ');
                if (typeof tagsVal === 'string') tagsVal = [tagsVal];
                return {
                    _name:      name,                                                   // 形态库 へ書き込む際の key (ZOD strip, ライブラリには入らない)
                    _replace:   shopPick(raw, 'replace_target','置換対象') || '',         // 書き込み前に旧形態を削除する用途 (ZOD strip, ライブラリには入らない)
                    // 形態フィールドは"品质"から"层级"へ変更済み(生命階層 Ⅰ~Ⅸ); 层级/tier, AI が 品质 を出力する場合にも対応
                    階層:       tierRomanOf(shopPick(raw, 'tier','階層','rating','品質','品级','评级') || 'Ⅰ'),
                    消費:       shopPick(raw, 'cost','消費') || '',
                    冷却:       shopPick(raw, 'cooldown','冷却') || '0回合',
                    状態:       shopPick(raw, 'status','状態') || '完好',
                    タグ:       shopEnsureSourceTag(Array.isArray(tagsVal) ? tagsVal : []),
                    原始属性:   shopPick(raw, '原始属性','基础属性','属性') || {},
                    効果:       shopPick(raw, 'effects','効果','特效','特殊效果') || {},
                    技能:       skillsMap,
                    説明:       shopPick(raw, 'description','説明','説明') || ''
                };
            }
            var forms = [];
            for (var fi = 0; fi < formList.length; fi++) {
                var nf = normalizeForm(formList[fi]);
                if (nf) forms.push(nf);
            }
            // 今回の融合で消費されたキャラクター側の元血統名(一致したら升级列表から対応する昇級項目を削除)
            var consumedNames = bloodFusionConsumedNames.slice();
            // 融合成功: 血統変更を書き戻し(旧を削除し新を追加) + 升级列表 内で replace_target が削除済み血統に一致する昇級サービスを整理
            //   + 新形態を書き込み(替换目标の旧形態を削除→新形態を書き込み, 升级列表と同処理);
            //   スペースコインと血統商品在庫は開始時に処理済み, コインの再控除/商品削除の重複は行わない
            var _fActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
            var ok = writeBackMvu(function(statData) {
                var _fctx = shopResolveCharacter(statData, _fActor);
                var _fch = _fctx.character || {};
                _fch.血統 = _fch.血統 || {};
                delete _fch.血統[a.name];
                if (b.owned) delete _fch.血統[b.name];
                _fch.血統[resultName] = result;
                if (bloodFusionSnap && bloodFusionShopItem) {
                    shopAppendReceipt(statData, shopReceiptLine('血统融合', bloodFusionShopItem.name+' → '+resultName, bloodFusionSnap.price, statData.キャラ.スペースコイン, (bloodFusionActionActor === SHOP_ACTOR_REINCARNATOR ? 'キャラ' : bloodFusionActionActor)));
                }
                // 升级列表の整理: "类型=血统 の昇級項目" かつ replace_target が今回消費された元血統名に一致 → 削除
                var _fulib = shopGetActorLibRaw(statData.商城, _fActor);
                if (_fulib && Array.isArray(_fulib.升級リスト) && consumedNames.length) {
                    _fulib.升級リスト = _fulib.升級リスト.filter(function(u) {
                        var upCat = String(shopPick(u, 'category','所属カテゴリ','タイプ','type') || '');
                        var tgt = String(shopPick(u, 'replace_target','置換対象') || '');
                        if (upCat === '血統' && tgt && consumedNames.indexOf(tgt) >= 0) return false;
                        return true;
                    });
                }
                // 新形態の書き込み: 先に替换目标の旧形態を削除(あれば), その後新形態を書き込み, 升级列表の replace_targetと同じモデルで新形態を書く
                //   normalizeForm が出力する spec は _name/_replaceを含む( ZOD form_item で strip, 位置特定専用),
                //   よって厳密クローンでは form_item schema のフィールドのみを残して 形态库 へ書き込み, _name/_replaceを持ち込まない
                if (forms.length) {
                    _fch.形態庫 = _fch.形態庫 || {};
                    for (var fk = 0; fk < forms.length; fk++) {
                        var f = forms[fk];
                        // 防御: AI が記入した"替换目标"が現在の形态库に無い場合(削除済み/編造), 強制的に"无"へ変更して孤立形態への参照が結果テキストへ漏れるのを防ぐ
                        if (f._replace && f._replace !== '无' && !_fch.形態庫[f._replace]) {
                            f._replace = '无';
                        }
                        if (f._replace && f._replace !== '无' && _fch.形態庫[f._replace]) {
                            delete _fch.形態庫[f._replace];
                        }
                        // 派生項目(ATK/DEF/MATK/MDEF/AP)の値が0のものは除外し、データベースへ書き込まない
                        var _fDerived = ['ATK','DEF','MATK','MDEF','AP'];
                        var _fAttrs = (f.原始属性 && typeof f.原始属性 === 'object') ? Object.assign({}, f.原始属性) : {};
                        for (var _dk = 0; _dk < _fDerived.length; _dk++) {
                            if (String(_fAttrs[_fDerived[_dk]]).trim() === '0') delete _fAttrs[_fDerived[_dk]];
                        }
                        // 形態フィールドは"品质"から"层级"へ変更済み(生命階層 Ⅰ~Ⅸ); AI が 品质 を出力した場合のフォールバック補正に対応
                        var _fTier = f.階層 != null ? f.階層 : f.品質;
                        _fch.形態庫[f._name] = {
                            階層:     tierRomanOf(_fTier || 'Ⅰ'),
                            消費:     f.消費,
                            冷却:     f.冷却,
                            状態:     f.状態,
                            タグ:     f.タグ,
                            原始属性: _fAttrs,
                            効果:     f.効果,
                            技能:     f.技能,
                            説明:     f.説明
                        };
                    }
                }
            });
            if (!ok) throw new Error('MVU 書き戻し失敗');
            // 升级区 のローカルキャッシュ同期: shopMarketData.升级区 から整理済みの昇級項目を即時削除
            try {
                var freshSd2 = getStatData();
                var freshLib2 = shopGetActorLibRaw(freshSd2 && freshSd2.商城, bloodFusionActionActor);
                if (freshLib2) {
                    shopMarketData = shopNormalizeMarketData(freshLib2);
                    if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
                }
            } catch(eFresh2) {}
            // 融合は正常に書き込み済み, ロールバック用スナップショットは不要
            bloodFusionSnap = null;
            // 先にフロント側で roll した結果を取得(結果ダイアログ表示用), その後今回の状態をクリア
            var rollResult = bloodFusionResult;
            var rollName = rollResult ? rollResult.name : '結果生成済み';
            var rollWeight = rollResult ? rollResult.weight : '';
            closeModal(); bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = [];
            renderAll();
            // 結果説明に残り得る"已删除形态/删除 XX 形态"の誤導テキストを除去(AI が存在しない形態を参照することがある)
            var descRaw = String(result.説明 || '主神融合アルゴリズムが今回の血統再構成を完了しました。');
            var descClean = descRaw.replace(/已删除(的)?\s*[^，。、;；\n]*形态/g, '形態スロットをリセット済み').replace(/删除\s*[^，。、;；\n]*形态/g, '形態スロットをリセット済み');
            showModal('融合結果 · '+rollName, '<div class="sam-shop-ok">融合完了：'+esc(rollName)+'</div><div class="sam-full-card">'+esc(descClean)+'</div>'
                + (forms.length ? '<div class="sam-shop-ok" style="margin-top:8px">今回の融合で獲得した新形態：'+forms.map(function(f){return esc(f._name);}).join('、')+'</div>' : ''));
        } catch(err) {
            bloodFusionResult = null;
            // ターン検証: 既に"融合停止"で中断済みなら失敗ロールバック/通知は行わない
            if (myEpoch !== bloodFusionEpoch) return;
            // 融合失敗: 開始時に控除済みのスペースコインと削除済みの商品在庫をロールバック
            if (bloodFusionSnap) {
                try {
                    writeBackMvu(function(statData) {
                        statData.キャラ = statData.キャラ || {};
                        statData.キャラ.スペースコイン = safeNum(statData.キャラ.スペースコイン, 0) + bloodFusionSnap.price;
                        statData.キャラ.権限証憑 = statData.キャラ.権限証憑 || {};
                        shopCredentialRefund(statData.キャラ.権限証憑, bloodFusionSnap.credentialRequirements || {});
                        if (bloodFusionSnap.preBloodLib !== null && statData.商城) {
                            var _rlibF = shopGetActorLibRaw(statData.商城, bloodFusionSnap.preActor);
                            if (_rlibF) _rlibF.血統リスト = bloodFusionSnap.preBloodLib.slice();
                        }
                    });
                } catch(eRoll) { try { console.warn('[主神端末] 融合失敗ロールバック異常:', eRoll.message); } catch(e2){} }
            }
            bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = []; bloodFusionSnap = null; closeModal();
            renderAll();
            samToast('error', '融合未完了：'+(err && err.message ? err.message : err));
        }
    }
    function bloodFusionDirectPurchase() {
        var item = bloodFusionShopItem, sd = getStatData();
        if (!item || !sd || !sd.キャラ) return;
        var dpActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
        var dpCtx = shopResolveCharacter(sd, dpActor);
        var dpCh = dpCtx.character;
        if (!dpCh) { samToast('error', '対象キャラクターのデータが存在しない, 購入できません'); return; }
        if (safeNum(sd.キャラ.スペースコイン, 0) < safeNum(item.price, 0)) { samToast('warning', 'スペースコイン不足のため購入できません'); return; }
        var dpCredentialRequirements = {};
        var dpCredentialRequirement = shopCredentialRequirement(dpCh, item);
        if (dpCredentialRequirement.required) dpCredentialRequirements[dpCredentialRequirement.grade] = 1;
        var dpCredentialShortages = shopCredentialShortages(sd.キャラ.権限証憑, dpCredentialRequirements);
        if (dpCredentialShortages.length) { samToast('warning', '権限証憑不足：'+shopCredentialShortageText(dpCredentialShortages)); return; }
        // 血統が満杯の場合はフロント側で"融合/置換"の二択へ分岐済み, ここはフォールバックの無言ブロックのみで, ダイアログは出さない
        var cap = BLOODLINE_CAP, count = Object.keys(dpCh.血統 || {}).length;
        if (count >= cap) return;
        var blood = shopToBloodlineVar(item);
        var ok = writeBackMvu(function(statData) {
            var _dctx = shopResolveCharacter(statData, dpActor);
            var _dch = _dctx.character || {};
            _dch.血統 = _dch.血統 || {}; _dch.血統[item.name] = blood;
            statData.キャラ.権限証憑 = statData.キャラ.権限証憑 || {};
            if (!shopCredentialConsume(statData.キャラ.権限証憑, dpCredentialRequirements)) throw new Error('権限証憑の控除に失敗');
            statData.キャラ.スペースコイン = Math.max(0, safeNum(statData.キャラ.スペースコイン, 0) - safeNum(item.price, 0));
            var _dlib = shopGetActorLibRaw(statData.商城, dpActor);
            if (_dlib && Array.isArray(_dlib.血統リスト)) _dlib.血統リスト = _dlib.血統リスト.filter(function(x){ return safeStr(x.名称) !== item.name; });
            shopAppendReceipt(statData, shopReceiptLine('购买血统', item.name, item.price, statData.キャラ.スペースコイン, (dpActor === SHOP_ACTOR_REINCARNATOR ? 'キャラ' : dpActor)));
        });
        if (ok) { closeModal(); bloodFusionShopItem = null; shopCart = []; renderAll(); samToast('success', '血統を購入しました：'+item.name); }
    }
    /* ★ ショップ血統置換: 既存の血統をひとつ選び, ショップで購入した新血統で直接差し替える(融合アルゴリズムは通さず, ランダム結果も無し) */
    function openBloodReplaceModal() {
        var item = bloodFusionShopItem;
        if (!item) return;
        var sd = getStatData();
        var rctx = shopResolveCharacter(sd, bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR);
        var rch = rctx.character || {};
        var rblood = rch.血統 || {};
        var rkeys = Object.keys(rblood);
        if (rkeys.length === 0) { samToast('warning', '置換可能な血統がありません'); return; }
        // 候補は品質の降順で表示し, 既定では最後の項目を選択(通常は品質が最も低く、置換に最適)
        var sorted = rkeys.slice().sort(function(p,q){ return bloodFusionRankOf({data:rblood[q]||{}}) - bloodFusionRankOf({data:rblood[p]||{}}); });
        var opts = '';
        for (var i = 0; i < sorted.length; i++) {
            opts += '<option value="'+esc(sorted[i])+'"'+(i === sorted.length-1 ? ' selected' : '')+'>'+esc(sorted[i])+' · '+esc((rblood[sorted[i]]||{}).品質 || 'F')+'</option>';
        }
        var html = '<div style="font-size:12px;color:var(--sam-sub);line-height:1.7;margin-bottom:10px">'
            + '購入 <b style="color:var(--sam-accent)">'+esc(item.name)+' · '+esc(item.rating || 'F')+'</b>(価格 '+safeNum(item.price,0)+' スペースコイン)後、選択した既存血統は<b style="color:var(--sam-hp)">永久に削除</b>され、関連する昇級サービス商品も同時に削除されます。この操作は取り消せません。</div>'
            + '<div style="font-size:11px;color:var(--sam-sub);margin-bottom:4px">置換する既存血統を選択：</div>'
            + '<select id="sam-replace-target" style="width:100%;padding:6px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:var(--sam-fg);font-size:12px">'+opts+'</select>'
            + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">'
            + '<button type="button" class="sam-confirm-btn cancel sam-fusion-replace-cancel">キャンセル</button>'
            + '<button type="button" class="sam-confirm-btn ok sam-fusion-replace-confirm">置換を確定</button>'
            + '</div>';
        showModal('血統を置換 · '+item.name, html, true);
    }
    function bloodFusionReplacePurchase(targetName) {
        var item = bloodFusionShopItem, sd = getStatData();
        if (!item || !sd || !sd.キャラ || !targetName) return;
        var rpActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
        var rpCtx = shopResolveCharacter(sd, rpActor);
        var rpCh = rpCtx.character;
        if (!rpCh) { samToast('error', '対象キャラクターのデータが存在しない, 購入できません'); return; }
        if (!(rpCh.血統 && rpCh.血統[targetName])) { samToast('error', '置換対象の血統が見つかりません'); return; }
        if (safeNum(sd.キャラ.スペースコイン, 0) < safeNum(item.price, 0)) { samToast('warning', 'スペースコイン不足のため購入できません'); return; }
        var rpCredentialRequirements = {};
        var rpCredentialRequirement = shopCredentialRequirement(rpCh, item);
        if (rpCredentialRequirement.required) rpCredentialRequirements[rpCredentialRequirement.grade] = 1;
        var rpCredentialShortages = shopCredentialShortages(sd.キャラ.権限証憑, rpCredentialRequirements);
        if (rpCredentialShortages.length) { samToast('warning', '権限証憑不足：'+shopCredentialShortageText(rpCredentialShortages)); return; }
        var blood = shopToBloodlineVar(item);
        var ok = writeBackMvu(function(statData) {
            var _rctx = shopResolveCharacter(statData, rpActor);
            var _rch = _rctx.character || {};
            _rch.血統 = _rch.血統 || {};
            statData.キャラ.権限証憑 = statData.キャラ.権限証憑 || {};
            if (!shopCredentialConsume(statData.キャラ.権限証憑, rpCredentialRequirements)) throw new Error('権限証憑の控除に失敗');
            delete _rch.血統[targetName];              // 置換される旧血統を削除
            _rch.血統[item.name] = blood;              // ショップで購入した新血統を書き込む
            statData.キャラ.スペースコイン = Math.max(0, safeNum(statData.キャラ.スペースコイン, 0) - safeNum(item.price, 0));
            var _rlib = shopGetActorLibRaw(statData.商城, rpActor);
            if (_rlib && Array.isArray(_rlib.血統リスト)) _rlib.血統リスト = _rlib.血統リスト.filter(function(x){ return safeStr(x.名称) !== item.name; });
            // ★ 昇級サービス内の置換対象血統向け商品も同時削除(所属大类=血统 かつ replace_target が当該血統を指す)
            if (_rlib && Array.isArray(_rlib.升級リスト)) {
                _rlib.升級リスト = _rlib.升級リスト.filter(function(u) {
                    var upCat = String(shopPick(u, 'category','所属カテゴリ','タイプ','type') || '');
                    var tgt = String(shopPick(u, 'replace_target','置換対象') || '');
                    if (upCat === '血統' && tgt && tgt === targetName) return false;
                    return true;
                });
            }
            shopAppendReceipt(statData, shopReceiptLine('替换血统', targetName+' → '+item.name, item.price, statData.キャラ.スペースコイン, (rpActor === SHOP_ACTOR_REINCARNATOR ? 'キャラ' : rpActor)));
        });
        if (ok) { closeModal(); bloodFusionShopItem = null; shopCart = []; renderAll(); samToast('success', '血統を置換しました：'+targetName+' → '+item.name); }
    }

    /* ===== 13.5 物資転送(在场NPCへ装備/アイテムを転送) ===== */
    var transferTarget = null;                  // 転送対象NPC名
    var transferCart = { 装備: {}, 道具: {} };   // 選択項目: { 装备: {key:1}, 道具: {key:qty} }
    function openTransferModal(npcName) {
        var sd = getStatData();
        var npc = sd && sd.关系リスト && sd.关系リスト[npcName];
        if (!npc) { samToast('error', '該当キャラクターが見つかりません'); return; }
        transferTarget = npcName;
        transferCart = { 装備: {}, 道具: {} };
        showModal('「'+npcName+'」へ物資を転送', renderTransferList(sd));
    }
    function renderTransferList(sd) {
        var equips = (sd.キャラ && sd.キャラ.装備) || {};
        var backpack = (sd.キャラ && sd.キャラ.道具) || {};
        var eqList = [], bpList = [];
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            if (safeNum(e.状態, 0) === 1) return;   // 装備済み: 除外
            if (safeNum(e.タイプ, 0) === 8) return;    // 特殊タイプ: 除外
            eqList.push({ key: k, val: e });
        });
        Object.keys(backpack).forEach(function(k) {
            var b = backpack[k] || {};
            if (safeNum(b.数量, 0) <= 0) return;
            bpList.push({ key: k, val: b, qty: safeNum(b.数量, 0) });
        });
        var html = '<div class="sam-trf-list">';
        if (eqList.length) {
            html += '<div class="sam-trf-sec">⚔ 装備 · '+eqList.length+'</div>';
            eqList.forEach(function(it) { html += transferItemCard('装備', it.key, it.val, 1); });
        }
        if (bpList.length) {
            html += '<div class="sam-trf-sec">🎒 アイテム · '+bpList.length+'</div>';
            bpList.forEach(function(it) { html += transferItemCard('道具', it.key, it.val, it.qty); });
        }
        if (!eqList.length && !bpList.length) {
            html += '<div class="sam-empty">転送可能な物資がありません（装備中および特殊装備は自動的に除外）</div>';
        }
        html += '</div>';
        var hasSel = Object.keys(transferCart.装備).length + Object.keys(transferCart.道具).length > 0;
        html += '<div class="sam-trf-footer">';
        html += '<div class="sam-trf-warn">⚠️ 転送を確定すると<strong>取り消し・回収は不可</strong>。物資は直接対象キャラクターに帰属します。よく検討してください。</div>';
        html += '<div class="sam-trf-actions">';
        html += '<button type="button" class="sam-trf-btn cancel">キャンセル</button>';
        html += '<button type="button" class="sam-trf-btn confirm"'+(hasSel ? '' : ' disabled')+'>転送を確定</button>';
        html += '</div></div>';
        return html;
    }
    function transferItemCard(cat, key, item, maxQty) {
        var sel = transferCart[cat][key] != null;
        var selQty = sel ? transferCart[cat][key] : 0;
        var q = parseRarity(item.品質);
        var isItem = (cat === '道具');
        var corner = sel ? (isItem ? '選択済み ×'+selQty : '選択済み') : '';
        var typeLabel = isItem ? safeStr(item.タイプ) : (EQUIP_TYPE_MAP[safeNum(item.タイプ, 0)] || '');
        var attrs = item.原始属性 || {};
        // 属性表示: 品質の英字はそのまま表示し, 数値は0を非表示( formatStatGrid / 装備カードと同一)
        var attrStr = Object.keys(attrs).filter(function(k) {
            var v = attrs[k];
            if (isStatQuality(v)) return true;
            return safeNum(v, 0) !== 0;
        }).map(function(k) {
            var v = attrs[k];
            return esc(k)+' '+(isStatQuality(v) ? safeStr(v) : safeNum(v, 0));
        }).join(' / ');
        var desc = safeStr(item.説明) || '';
        var inner = '<div class="sam-trf-head"><span class="sam-trf-name">'+esc(key)+'</span><span class="sam-trf-qtag q-'+q+'">'+esc(q)+'</span></div>';
        if (typeLabel) inner += '<div class="sam-trf-sub">'+esc(typeLabel) + (isItem ? ' · 所持 '+maxQty : '') + '</div>';
        if (attrStr) inner += '<div class="sam-trf-attrs">'+attrStr+'</div>';
        if (desc) inner += '<div class="sam-trf-desc">'+esc(desc)+'</div>';
        if (isItem && sel) {
            inner += '<div class="sam-trf-qty">'
                + '<button type="button" class="sam-trf-qty-btn" data-trf-qty="minus" data-cat="'+esc(cat)+'" data-key="'+esc(key)+'">−</button>'
                + '<input type="number" class="sam-trf-qty-inp" min="1" max="'+maxQty+'" value="'+selQty+'" data-cat="'+esc(cat)+'" data-key="'+esc(key)+'">'
                + '<button type="button" class="sam-trf-qty-btn" data-trf-qty="plus" data-cat="'+esc(cat)+'" data-key="'+esc(key)+'">+</button>'
                + '<span class="sam-trf-qty-max">/'+maxQty+'</span></div>';
        }
        return '<div class="sam-trf-item'+(sel?' selected':'')+'" data-trf-cat="'+esc(cat)+'" data-trf-key="'+esc(key)+'">'+inner+'<span class="sam-trf-corner">'+esc(corner)+'</span></div>';
    }
    function transferToggle(cat, key) {
        if (transferCart[cat][key] != null) delete transferCart[cat][key];
        else transferCart[cat][key] = 1;
        refreshTransferModal();
    }
    function transferAdjustQty(cat, key, dir) {
        var sd = getStatData();
        var max = 1;
        if (cat === '道具') max = safeNum(sd.キャラ.道具[key] && sd.キャラ.道具[key].数量, 1);
        var cur = transferCart[cat][key] != null ? transferCart[cat][key] : 1;
        if (dir === 'plus') cur = Math.min(max, cur + 1);
        else cur = Math.max(1, cur - 1);
        transferCart[cat][key] = cur;
        refreshTransferModal();
    }
    function transferInputQty(cat, key, val) {
        var sd = getStatData();
        var max = 1;
        if (cat === '道具') max = safeNum(sd.キャラ.道具[key] && sd.キャラ.道具[key].数量, 1);
        var v = Math.max(1, Math.min(max, parseInt(val, 10) || 1));
        transferCart[cat][key] = v;
        refreshTransferModal();
    }
    function refreshTransferModal() {
        var $body = $('#samsara-modal .sam-modal-body');
        // リストは body の単層スクロールへ変更済み。body の scrollTopを復元
        var saved = $body.length ? ($body[0].scrollTop || 0) : 0;
        var sd = getStatData();
        $body.html(renderTransferList(sd));
        if ($body.length && saved > 0) { try { $body[0].scrollTop = saved; } catch(e){} }
    }
    function executeTransfer() {
        var eqKeys = Object.keys(transferCart.装備);
        var bpKeys = Object.keys(transferCart.道具);
        if (eqKeys.length + bpKeys.length === 0) return;
        var npcName = transferTarget;
        samConfirm('転送の確認', '選択した物資を「'+npcName+'」へ転送しますか？この操作は取り消し・回収できません。', function() {
            var ok = writeBackMvu(function(statData) {
                if (!statData) return;
                var mc = statData.キャラ = statData.キャラ || {};
                mc.装備 = mc.装備 || {}; mc.道具 = mc.道具 || {};
                var rel = statData.关系リスト = statData.关系リスト || {};
                var npc = rel[npcName] = rel[npcName] || {};
                npc.装備 = npc.装備 || {}; npc.道具 = npc.道具 || {};
                var movedParts = []; // ★ 実際に転送が成功した明細, 配信待ち記録用
                // 装備: そのままNPCへ複製(0で未装備), キャラクター側は削除
                eqKeys.forEach(function(key) {
                    var e = mc.装備[key];
                    if (!e) return;
                    var copy = (_ && _.cloneDeep) ? _.cloneDeep(e) : JSON.parse(JSON.stringify(e));
                    copy.状態 = 0;
                    npc.装備[key] = copy;
                    delete mc.装備[key];
                    movedParts.push('装备「' + key + '」');
                });
                // アイテム: 数量単位で転送(NPCが既に持つ場合は加算, 無ければ新規作成; キャラクター側は減算し, 0なら削除)
                bpKeys.forEach(function(key) {
                    var b = mc.道具[key];
                    if (!b) return;
                    var have = safeNum(b.数量, 0);
                    var move = Math.min(transferCart.道具[key] || 1, have);
                    if (move <= 0) return;
                    if (npc.道具[key]) {
                        npc.道具[key].数量 = safeNum(npc.道具[key].数量, 0) + move;
                    } else {
                        var copy2 = (_ && _.cloneDeep) ? _.cloneDeep(b) : JSON.parse(JSON.stringify(b));
                        copy2.数量 = move;
                        npc.道具[key] = copy2;
                    }
                    b.数量 = have - move;
                    if (b.数量 <= 0) delete mc.道具[key];
                    movedParts.push('道具「' + key + '」×' + move);
                });
                // ★ フロントからNPCへの物資贈与 → 配信待ち記録に登録(今回の書き戻しと同じタイミングで保存, 本文モデルの叙述後に自動クリア)
                if (movedParts.length) {
                    shopAppendReceipt(statData, '[赠送][キャラ] 向「' + npcName + '」转移 ' + movedParts.join('、'));
                }
            });
            if (ok) {
                var cnt = eqKeys.length + bpKeys.length;
                transferCart = { 装備: {}, 道具: {} };
                transferTarget = null;
                closeModal();
                samToast('success', '「'+npcName+'」へ '+cnt+' 件の物資を転送しました');
                renderAll();
            } else {
                samToast('error', '転送失敗: データ書き戻しが利用できません');
            }
        });
    }

    /* ===== 13b. NPC死亡検出 + 遺物取得(転送テンプレートを流用, 方向: NPC→キャラクター, 二次確認なし) ===== */
    function isNpcDead(n) {
        if (!n || typeof n !== 'object') return false;
        var hp = safeNum(n.HP, 0);
        if (hp <= 0) return true;
        var isExplicitlyDead = n.状態 && Object.keys(n.状態).some(function(key) { return key.indexOf('死亡') >= 0; });
        return !!isExplicitlyDead;
    }
    var lootTarget = null;
    var lootCart = { 装備: {}, 道具: {} };
    function openLootModal(npcName) {
        var sd = getStatData();
        var npc = sd && sd.关系リスト && sd.关系リスト[npcName];
        if (!npc) { samToast('error', '該当キャラクターが見つかりません'); return; }
        lootTarget = npcName;
        lootCart = { 装備: {}, 道具: {} };
        showModal('「'+npcName+'」から遺物を取得', renderLootList(npc));
    }
    function renderLootList(npc) {
        var equips = npc.装備 || {};
        var backpack = npc.道具 || {};
        var eqList = [], bpList = [];
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            if (safeNum(e.タイプ, 0) === 8) return;
            eqList.push({ key: k, val: e });
        });
        Object.keys(backpack).forEach(function(k) {
            var b = backpack[k] || {};
            if (safeNum(b.数量, 0) <= 0) return;
            bpList.push({ key: k, val: b, qty: safeNum(b.数量, 0) });
        });
        var html = '<div class="sam-trf-list">';
        if (eqList.length) {
            html += '<div class="sam-trf-sec">⚔ 装備 · '+eqList.length+'</div>';
            eqList.forEach(function(it) { html += lootItemCard('装備', it.key, it.val, 1); });
        }
        if (bpList.length) {
            html += '<div class="sam-trf-sec">🎒 アイテム · '+bpList.length+'</div>';
            bpList.forEach(function(it) { html += lootItemCard('道具', it.key, it.val, it.qty); });
        }
        if (!eqList.length && !bpList.length) {
            html += '<div class="sam-empty">このキャラクターから取得できる物資はありません</div>';
        }
        html += '</div>';
        var hasSel = Object.keys(lootCart.装備).length + Object.keys(lootCart.道具).length > 0;
        html += '<div class="sam-trf-footer">';
        html += '<div class="sam-trf-warn">⚠️ 遺物を取得すると直接キャラクターに帰属し, 返却できません。</div>';
        html += '<div class="sam-trf-actions">';
        html += '<button type="button" class="sam-loot-btn cancel">キャンセル</button>';
        html += '<button type="button" class="sam-loot-btn confirm"'+(hasSel ? '' : ' disabled')+'>取得を確定</button>';
        html += '</div></div>';
        return html;
    }
    function lootItemCard(cat, key, item, maxQty) {
        var sel = lootCart[cat][key] != null;
        var selQty = sel ? lootCart[cat][key] : 0;
        var q = parseRarity(item.品質);
        var isItem = (cat === '道具');
        var corner = sel ? (isItem ? '選択済み ×'+selQty : '選択済み') : '';
        var typeLabel = isItem ? safeStr(item.タイプ) : (EQUIP_TYPE_MAP[safeNum(item.タイプ, 0)] || '');
        var attrs = item.原始属性 || {};
        // 属性表示: 品質の英字はそのまま表示し, 数値は0を非表示( formatStatGrid / 装備カードと同一)
        var attrStr = Object.keys(attrs).filter(function(k) {
            var v = attrs[k];
            if (isStatQuality(v)) return true;
            return safeNum(v, 0) !== 0;
        }).map(function(k) {
            var v = attrs[k];
            return esc(k)+' '+(isStatQuality(v) ? safeStr(v) : safeNum(v, 0));
        }).join(' / ');
        var desc = safeStr(item.説明) || '';
        var inner = '<div class="sam-trf-head"><span class="sam-trf-name">'+esc(key)+'</span><span class="sam-trf-qtag q-'+q+'">'+esc(q)+'</span></div>';
        if (typeLabel) inner += '<div class="sam-trf-sub">'+esc(typeLabel) + (isItem ? ' · 所持 '+maxQty : '') + '</div>';
        if (attrStr) inner += '<div class="sam-trf-attrs">'+attrStr+'</div>';
        if (desc) inner += '<div class="sam-trf-desc">'+esc(desc)+'</div>';
        if (isItem && sel) {
            inner += '<div class="sam-trf-qty">'
                + '<button type="button" class="sam-loot-qty-btn" data-trf-qty="minus" data-cat="'+esc(cat)+'" data-key="'+esc(key)+'">−</button>'
                + '<input type="number" class="sam-loot-qty-inp" min="1" max="'+maxQty+'" value="'+selQty+'" data-cat="'+esc(cat)+'" data-key="'+esc(key)+'">'
                + '<button type="button" class="sam-loot-qty-btn" data-trf-qty="plus" data-cat="'+esc(cat)+'" data-key="'+esc(key)+'">+</button>'
                + '<span class="sam-trf-qty-max">/'+maxQty+'</span></div>';
        }
        return '<div class="sam-trf-item sam-loot-item'+(sel?' selected':'')+'" data-loot-cat="'+esc(cat)+'" data-loot-key="'+esc(key)+'">'+inner+'<span class="sam-trf-corner">'+esc(corner)+'</span></div>';
    }
    function lootToggle(cat, key) {
        if (lootCart[cat][key] != null) delete lootCart[cat][key];
        else lootCart[cat][key] = 1;
        refreshLootModal();
    }
    function lootAdjustQty(cat, key, dir) {
        var sd = getStatData();
        var npc = sd && sd.关系リスト && sd.关系リスト[lootTarget];
        if (!npc) return;
        var max = 1;
        if (cat === '道具') max = safeNum(npc.道具[key] && npc.道具[key].数量, 1);
        var cur = lootCart[cat][key] != null ? lootCart[cat][key] : 1;
        if (dir === 'plus') cur = Math.min(max, cur + 1);
        else cur = Math.max(1, cur - 1);
        lootCart[cat][key] = cur;
        refreshLootModal();
    }
    function lootInputQty(cat, key, val) {
        var sd = getStatData();
        var npc = sd && sd.关系リスト && sd.关系リスト[lootTarget];
        if (!npc) return;
        var max = 1;
        if (cat === '道具') max = safeNum(npc.道具[key] && npc.道具[key].数量, 1);
        var v = Math.max(1, Math.min(max, parseInt(val, 10) || 1));
        lootCart[cat][key] = v;
        refreshLootModal();
    }
    function refreshLootModal() {
        var $body = $('#samsara-modal .sam-modal-body');
        var saved = $body.length ? ($body[0].scrollTop || 0) : 0;
        var sd = getStatData();
        var npc = sd && sd.关系リスト && sd.关系リスト[lootTarget];
        if (npc) $body.html(renderLootList(npc));
        if ($body.length && saved > 0) { try { $body[0].scrollTop = saved; } catch(e){} }
    }
    function executeLoot() {
        var eqKeys = Object.keys(lootCart.装備);
        var bpKeys = Object.keys(lootCart.道具);
        if (eqKeys.length + bpKeys.length === 0) return;
        var npcName = lootTarget;
        var ok = writeBackMvu(function(statData) {
            if (!statData) return;
            var mc = statData.キャラ = statData.キャラ || {};
            mc.装備 = mc.装備 || {}; mc.道具 = mc.道具 || {};
            var rel = statData.关系リスト = statData.关系リスト || {};
            var npc = rel[npcName] = rel[npcName] || {};
            npc.装備 = npc.装備 || {}; npc.道具 = npc.道具 || {};
            var lootedParts = []; // ★ 実際に取得が成功した明細, 配信待ち記録用
            // 装備: NPCからキャラクターへ複製(0で未装備), NPC側は削除
            eqKeys.forEach(function(key) {
                var e = npc.装備[key];
                if (!e) return;
                var copy = (_ && _.cloneDeep) ? _.cloneDeep(e) : JSON.parse(JSON.stringify(e));
                copy.状態 = 0;
                mc.装備[key] = copy;
                delete npc.装備[key];
                lootedParts.push('装备「' + key + '」');
            });
            // アイテム: 数量単位でNPCからキャラクターへ転送
            bpKeys.forEach(function(key) {
                var b = npc.道具[key];
                if (!b) return;
                var have = safeNum(b.数量, 0);
                var move = Math.min(lootCart.道具[key] || 1, have);
                if (move <= 0) return;
                if (mc.道具[key]) {
                    mc.道具[key].数量 = safeNum(mc.道具[key].数量, 0) + move;
                } else {
                    var copy2 = (_ && _.cloneDeep) ? _.cloneDeep(b) : JSON.parse(JSON.stringify(b));
                    copy2.数量 = move;
                    mc.道具[key] = copy2;
                }
                b.数量 = have - move;
                if (b.数量 <= 0) delete npc.道具[key];
                lootedParts.push('道具「' + key + '」×' + move);
            });
            // ★ フロントでのNPCからの物資取得 → 配信待ち記録に登録(今回の書き戻しと同じタイミングで保存, 本文モデルの叙述後に自動クリア)
            if (lootedParts.length) {
                shopAppendReceipt(statData, '[获取][キャラ] 从「' + npcName + '」处获得 ' + lootedParts.join('、'));
            }
        });
        if (ok) {
            var cnt = eqKeys.length + bpKeys.length;
            lootCart = { 装備: {}, 道具: {} };
            lootTarget = null;
            closeModal();
            samToast('success', '「'+npcName+'」から '+cnt+' 件の遺物を取得しました');
            renderAll();
        } else {
            samToast('error', '取得失敗: データ書き戻しが利用できません');
        }
    }
    function bindUIEvents() {
        var $panel = $('#samsara-panel');
        $panel.off('click.samBloodFusion').on('click.samBloodFusion', '.sam-blood-fusion-open', function(e) {
            e.stopPropagation();
            if (!$(this).is('[disabled]')) openBloodFusionModal(null);
        });
        $(document).off('click.samFusionStart').on('click.samFusionStart', '.sam-fusion-start', function(e) {
            e.stopPropagation();
            if ($(this).is('[disabled]')) return; // 血統が2つ未満: 融合開始ボタンはグレーアウトし無反応
            bloodFusionStart($('.sam-fusion-select[data-fusion-role="a"]').val(), $('.sam-fusion-select[data-fusion-role="b"]').val());
        });
        $(document).off('click.samFusionDirect').on('click.samFusionDirect', '.sam-fusion-direct', function(e) {
            e.stopPropagation();
            if ($(this).is('[disabled]')) return; // 血統が満杯: グレーアウトしたボタンは無反応
            if (bloodFusionShopItem) bloodFusionDirectPurchase(); else closeModal();
        });
        // ★ ショップ血統置換フロー(血統枠が満杯時): 選択ダイアログを開く / キャンセルで融合ポッドへ戻る / 確定で置換を実行
        $(document).off('click.samFusionReplaceOpen').on('click.samFusionReplaceOpen', '.sam-fusion-replace-open', function(e) {
            e.stopPropagation();
            if ($(this).is('[disabled]')) return;
            openBloodReplaceModal();
        });
        $(document).off('click.samFusionReplaceCancel').on('click.samFusionReplaceCancel', '.sam-fusion-replace-cancel', function(e) {
            e.stopPropagation();
            openBloodFusionModal(bloodFusionShopItem); // 融合ポッドへ戻る
        });
        $(document).off('click.samFusionReplaceConfirm').on('click.samFusionReplaceConfirm', '.sam-fusion-replace-confirm', function(e) {
            e.stopPropagation();
            var tgt = $('#sam-replace-target').val();
            if (!tgt) { samToast('warning', '置換する血統を先に選択してください'); return; }
            bloodFusionReplacePurchase(tgt);
        });
        // ★ A/B セレクト連動: 片方を変更したとき, 相手側から新しい選択値を除外(A=Bを回避); 相手の現在値が除外される場合は最初の有効項目へ戻す
        $(document).off('change.samFusionSync').on('change.samFusionSync', '.sam-fusion-select', function(e) {
            e.stopPropagation();
            var role = $(this).attr('data-fusion-role') || 'a';
            bloodFusionSyncSelect(role);
        });
        // 閉じる(編集モードが有効な場合, 先に編集モードを終了してからパネルを閉じる)
        $panel.off('click.samClose').on('click.samClose', '.sam-icon-btn.close', function() {
            if (isEditMode()) setEditMode(false);
            if ($('#samsara-panel').hasClass('open')) toggleSamsaraPanel();
        });
        // 更新(編集モードが有効な場合, 先に編集モードを終了してからデータを更新)
        $panel.off('click.samRefresh').on('click.samRefresh', '.sam-icon-btn.refresh', function() {
            if (isEditMode()) setEditMode(false);
            renderAll();
            try { console.log('%c[主神端末] 🔄 手動更新', 'color:#8f9fff'); } catch(e){}
        });
        // 設定
        $panel.off('click.samSettings').on('click.samSettings', '.sam-icon-btn.settings', function() { openSettings(); });
        // Tab切替
        $panel.off('click.samTab').on('click.samTab', '.sam-tab-btn', function() {
            var tab = $(this).data('tab');
            if (tab === 'world') {
                var engine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
                if (engine && typeof engine.isConfigured === 'function' && engine.isConfigured()) {
                    engine.open();
                    return;
                }
                // 世界進行のマスタースイッチがオフ（または独立スクリプト未ロード）の場合、元の世界パネルを復元。
                setCurrentTab('world');
                renderTabContent('world');
                $panel.find('.sam-tab-btn').removeClass('active');
                $(this).addClass('active');
                return;
            }
            setCurrentTab(tab);
            renderTabContent(tab);
            $panel.find('.sam-tab-btn').removeClass('active');
            $(this).addClass('active');
        });
        // サブTab切替
        $panel.off('click.samSubtab').on('click.samSubtab', '.sam-subtab', function() {
            var sub = $(this).data('sub');
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            $panel.find('.sam-subpane').removeClass('active').hide();
            $panel.find('.sam-subpane[data-sub="'+sub+'"]').addClass('active').show();
            // 関係パネルで現在アクティブなサブTabを記憶し, renderAll 後に"全部"へ戻るのを防ぐ
            try { relationActiveSub = sub; } catch(e) {}
        });
        // カードクリック→詳細ダイアログ
        $panel.off('click.samCard').on('click.samCard', '.sam-card', function(e) {
            if ($(e.target).closest('.sam-tier-infuse-btn').length) return;
            var path = $(this).data('path');
            // ★ 編集モード: NPC カードは許可(キャラクター档案を開いてデータを編集); 他のカードはブロックを維持し,読み取り専用詳細への誤操作を防ぐ
            var isNpcPath = (typeof path === 'string' && path.indexOf('関係リスト.') === 0);
            if (isEditMode() && !isNpcPath) return;
            var title = $(this).data('title') || '詳細';
            if (path) openDetailModal(path, title);
        });
        // NPC削除ボタン(編集モード)→MVUから当該NPCを削除
        $panel.off('click.samNpcDel').on('click.samNpcDel', '.sam-npc-del', function(e) {
            e.stopPropagation();
            var name = $(this).data('del-npc');
            if (!name) return;
            deleteNpc(name);
        });
        // ★ NPC転送ボタン(在场NPC)→物資転送ダイアログを開く
        $panel.off('click.samTransfer').on('click.samTransfer', '.sam-npc-transfer', function(e) {
            e.stopPropagation();
            var name = $(this).data('transfer-npc');
            if (name) openTransferModal(name);
        });
        // ★ NPC遺物取得ボタン(死亡NPC)→取得ダイアログを開く
        $panel.off('click.samLoot').on('click.samLoot', '.sam-npc-loot', function(e) {
            e.stopPropagation();
            var name = $(this).data('loot-npc');
            if (name) openLootModal(name);
        });
        // ★ 取得ダイアログ内の操作(documentへ委譲)
        $(document).off('click.samLootItem').on('click.samLootItem', '.sam-loot-item', function(e) {
            if ($(e.target).closest('.sam-trf-qty').length) return;
            lootToggle($(this).data('loot-cat'), $(this).data('loot-key'));
        });
        $(document).off('click.samLootQty').on('click.samLootQty', '.sam-loot-qty-btn', function(e) {
            e.stopPropagation();
            lootAdjustQty($(this).data('cat'), $(this).data('key'), $(this).data('trf-qty'));
        });
        $(document).off('change.samLootInp').on('change.samLootInp', '.sam-loot-qty-inp', function(e) {
            e.stopPropagation();
            lootInputQty($(this).data('cat'), $(this).data('key'), this.value);
        });
        $(document).off('click.samLootConfirm').on('click.samLootConfirm', '.sam-loot-btn.confirm', function(e) {
            executeLoot();
        });
        $(document).off('click.samLootCancel').on('click.samLootCancel', '.sam-loot-btn.cancel', function(e) {
            closeModal();
        });
        // ★ 転送ダイアログ内の操作(documentへ委譲, modalコンテナは初回showModal時に生成されるため)
        $(document).off('click.samTrfItem').on('click.samTrfItem', '.sam-trf-item', function(e) {
            if ($(e.target).closest('.sam-trf-qty').length) return; // 数量コントロール領域ではtoggleを発火させない
            transferToggle($(this).data('trf-cat'), $(this).data('trf-key'));
        });
        $(document).off('click.samTrfQty').on('click.samTrfQty', '.sam-trf-qty-btn', function(e) {
            e.stopPropagation();
            transferAdjustQty($(this).data('cat'), $(this).data('key'), $(this).data('trf-qty'));
        });
        $(document).off('change.samTrfInp').on('change.samTrfInp', '.sam-trf-qty-inp', function(e) {
            e.stopPropagation();
            transferInputQty($(this).data('cat'), $(this).data('key'), this.value);
        });
        $(document).off('click.samTrfConfirm').on('click.samTrfConfirm', '.sam-trf-btn.confirm', function(e) {
            executeTransfer();
        });
        $(document).off('click.samTrfCancel').on('click.samTrfCancel', '.sam-trf-btn.cancel', function(e) {
            closeModal();
        });
        // ★ 世界項目削除ボタン(編集モード, 探索ポイント/勢力)→MVUから当該項目を削除
        $panel.off('click.samWorldDel').on('click.samWorldDel', '.sam-rumor-del-btn[data-world-del]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-del-path') || '';
            if (!path) return;
            // 親パスと末尾keyを解析(確認メッセージ用)
            var parts = path.split('.');
            var key = parts.pop();
            var parentPath = parts.join('.');
            var label = key;
            samConfirm('項目を削除', '「'+label+'」を削除しますか？この操作は取り消せません。', function() {
                deleteWorldEntry(path, parentPath, key);
            });
        });
        // ★ 資産削除ボタン(編集モード)→MVUから当該資産を削除(汎用のドットパス削除を流用)
        $panel.off('click.samAssetDel').on('click.samAssetDel', '.sam-fc-del-btn[data-asset-del]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-asset-del') || '';
            if (!path) return;
            var parts = path.split('.');
            var key = parts.pop();
            var parentPath = parts.join('.');
            samConfirm('資産を削除', '資産「'+key+'」を削除しますか？この操作は取り消せません。', function() {
                deleteWorldEntry(path, parentPath, key);
            });
        });
        // ★ 建設シーケンス削除ボタン(編集モード)→MVUから当該建設シーケンスを削除
        $panel.off('click.samAssetSeqDel').on('click.samAssetSeqDel', '.sam-fc-del-btn[data-asset-seq-del]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-asset-seq-del') || '';
            if (!path) return;
            var parts = path.split('.');
            var key = parts.pop();
            var parentPath = parts.join('.');
            samConfirm('建設シーケンスを削除', '建設シーケンス「'+key+'」を削除しますか？この操作は取り消せません。', function() {
                deleteWorldEntry(path, parentPath, key);
            });
        });
        // ★ R21-噂取引: 取引可能ボタン → 入力欄へテキストを送信(找{卖家}购买情报「{名}」)
        $panel.off('click.samRumorTrade').on('click.samRumorTrade', '.sam-rumor-trade-btn', function(e) {
            e.stopPropagation();
            var name = $(this).attr('data-rumor-name') || '';
            var seller = $(this).attr('data-rumor-seller') || '不明';
            if (!name) return;
            var text = '找'+seller+'购买情报「'+name+'」';
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '入力欄へ送信しました: '+text);
            else samToast('warning', '入力欄が見つかりません, クリップボードへコピーしました');
        });
        // ★ 経営パネル: 未完イベントの行全体がクリック可能 → そのテキストを入力欄へ入力
        $panel.off('click.samAssetTodo').on('click.samAssetTodo', '.sam-asset-todo-item.clickable', function(e) {
            e.stopPropagation();
            var text = $(this).attr('data-asset-todo') || '';
            if (!text) return;
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '入力欄へ入力しました');
            else samToast('warning', '入力欄が見つかりません');
        });
        // ★ R21-噂取引: 単体削除ボタン → MVUへ書き戻して当該の噂を削除(確認あり)
        $panel.off('click.samRumorDel').on('click.samRumorDel', '.sam-rumor-del-btn[data-rumor-del]', function(e) {
            e.stopPropagation();
            var section = $(this).attr('data-rumor-section') || '';
            var name = $(this).attr('data-rumor-name') || '';
            if (!section || !name) return;
            samConfirm('噂を削除', '「'+name+'」という'+section+'を削除しますか？この操作は取り消せません。', function() {
                handleRumorDelete(section, name);
            });
        });
        // ★ R21-噂取引: カテゴリ一括クリア → 当該カテゴリを空にする(街头巷议/情报交易/布告与檄文), 確認あり
        $panel.off('click.samRumorClearSec').on('click.samRumorClearSec', '.sam-rumor-clear-btn', function(e) {
            e.stopPropagation();
            e.preventDefault(); // summary の展開/折りたたみを防止
            var section = $(this).attr('data-rumor-clear-section') || '';
            if (!section) return;
            samConfirm('カテゴリをクリア', '「'+section+'」内の噂をすべて一括削除しますか？この操作は取り消せません。', function() {
                handleRumorClearSection(section);
            });
        });
        // ★ R21-噂取引: 上部の全噂一括削除 → 传闻.街頭の噂/情报交易/布告与檄文を空にする, 確認あり
        $panel.off('click.samRumorClearAll').on('click.samRumorClearAll', '.sam-rumor-clearall-btn', function(e) {
            e.stopPropagation();
            samConfirm('全噂を削除', 'すべての噂(街頭の噂/情報取引/布告と檄文)を削除しますか？この操作は取り消せません。', function() {
                handleRumorClearAll();
            });
        });
        // 装備/アイテム操作ボタン(装備/解除/収納/取り出し/削除)→MVUへ書き戻し+更新
        $panel.off('click.samAct').on('click.samAct', '.sam-act-btn', function(e) {
            e.stopPropagation();
            var $b = $(this);
            var action = $b.attr('data-act');
            // 形態の有効化/無効化ボタン(個別に振り分け, 装備/アイテム handlerは通さない)
            if (action === 'activate' || action === 'deactivate') {
                var formName = $b.attr('data-form');
                if (formName) {
                    if (action === 'activate') handleFormActivate(formName);
                    else handleFormDeactivate(formName);
                }
                return;
            }
            var path = $b.attr('data-path');
            var kind = $b.attr('data-kind');
            var type = $b.attr('data-type');
            var key = $b.attr('data-key');
            // 削除操作は先に二次確認ダイアログを表示し, 確認後に実行
            if (action === 'delete') {
                var label = key || (path ? path.split('.').pop() : '');
                var cat = (kind === 'equip') ? '装備' : 'アイテム';
                samConfirm('削除'+cat, '以下の'+cat+'「'+label+'」を削除しますか？この操作は取り消せません。', function() {
                    handleItemAction(action, path, kind, type, key);
                });
                return;
            }
            handleItemAction(action, path, kind, type, key);
        });
        // 状態ボタンのクリック→二次詳細ダイアログ(メインパネルのカード描画スタイルを流用)
        // ★ 編集モード: 状態詳細も再帰編集レンダリング(renderDetailNode の編集状態)を通し, 下部に保存ボタンを追加
        $panel.off('click.samBuff').on('click.samBuff', '.sam-buff-chip', function() {
            var name = $(this).data('name');
            var path = $(this).data('path');
            var sd = getStatData();
            if (!sd || !path) return;
            var obj = resolvePath(sd, path);
            if (!obj) return;
            var ed = isEditMode();
            var html = renderDetailNode(obj, ['真属性'], ['状態', name], ed, ed ? path : '');
            if (!ed) {
                // 読み取り専用時のフォールバック: 空オブジェクト(真属性のみがマスクされた場合など)にはプレースホルダを表示
                if (!html || !html.trim()) html = '<div class="sam-empty">表示できる内容がありません</div>';
                showModal(name + ' · 状態詳細', '<div class="sam-detail">'+html+'</div>');
                return;
            }
            var foot = '<div class="sam-nd-edit-tip">✎ 編集モード · 数値をクリックでその場編集, フォーカスを外すと自動で一時保存</div><button type="button" class="sam-save-btn sam-nd-save">💾 保存</button>';
            showModal(name + ' · 状態詳細 · 編集', '<div class="sam-detail">'+html+'</div>'+foot);
            bindEditorEvents($('#samsara-modal')); // modal は独立DOMのため, 編集イベントを個別に委譲する必要がある
        });
        // ★ 職業構造化エディタのイベントはbindEditorEvents($root)へ移行済み(panel/modal 共用)
        // ★ 源力灌注 キャラクター/味方は同一の実行器を共用；現在の階層→次の階層のみ許可。
        $panel.off('click.samSourceInfusion').on('click.samSourceInfusion', '.sam-tier-infuse-btn', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openSourceInfusion($(this).attr('data-tier-target') || 'キャラ');
        });
        // ★ 進階ボタン(階層プログレスバー中央): 属性の合計ポイントが次階層の下限に達した時のみ表示; 戦闘中はブロック
        //   - 進階申請(進階試練が未完了): "【当前进阶条件已满足，申请进阶试炼】"を入力欄へ送信
        //   - 進階開始(試練完了): writeBackMvu(角色.階層=nextTier) + renderAll() でプログレスバー/上部階層を更新
        $panel.off('click.samTierAdv').on('click.samTierAdv', '.sam-tier-adv-btn', function(e) {
            e.stopPropagation();
            var $b = $(this);
            var act = $b.attr('data-tier-act') || '';
            var nextTier = $b.attr('data-tier-next') || '';
            var sd = getStatData();
            if (!sd || !sd.キャラ) { samToast('error', 'データが未準備です'); return; }
            var sys = sd.システム状態 || {};
            // 戦闘中のブロック: 進階操作は戦闘中に一切実行できない
            if (sys.戦闘中 === true) {
                samToast('warning', '安全なエリアで再度お試しください');
                return;
            }
            if (act === 'apply') {
                if (sys.試練可能 !== true || sys.試練完了 === true) { samToast('warning', '昇格条件が変化しました。更新後にもう一度お試しください'); renderAll(); return; }
                // 進階申請: 入力欄へ一文を書き込む(情報取引の購入可能ボタンと同様, 自動送信はしない)
                var text = '当前进阶条件已满足，申请【昇格試練任務】';
                var ok = sendToInputBox(text, false);
                if (ok) samToast('success', '入力欄へ送信しました: '+text);
                else samToast('warning', '入力欄が見つかりません, クリップボードへコピーしました');
            } else if (act === 'start') {
                // 進階開始: キャラクターの階層を次へ直接引き上げる(F→E→...→SSS), 進階試練の完了後に実行
                var advance = validateTrialAdvancement(sd, nextTier);
                if (advance.error) { samToast('warning', advance.error); renderAll(); return; }
                nextTier = advance.nextTier;
                // ★ 階層通行証を渡す: replaceMvuData が非同期で発火する二度目の VARIABLE_UPDATE_ENDED
                //   __samsaraUIMutation のウィンドウ期内に無いため, 通行証で階層変化を許可する必要がある(でなければガードにロールバックされる)
                var ok2 = writeBackMvu(function(statData) {
                    var latestAdvance = validateTrialAdvancement(statData, nextTier);
                    if (latestAdvance.error) throw new Error(latestAdvance.error);
                    if (statData.キャラ) {
                        var oldTier = normalizeLifeTier(statData.キャラ.階層);
                        statData.キャラ.階層 = nextTier;
                        shopAppendReceipt(statData, '[昇格][キャラ] 昇格試練完成：'+oldTier+' → '+nextTier);
                    }
                    // 進階完了後に試練フラグをリセットし, 次の進階フローに備える
                    if (statData.システム状態) statData.システム状態.試練完了 = false;
                }, { tierPermit: nextTier });
                if (ok2) {
                    samToast('success', '階層が '+nextTier+' 級に上昇しました');
                    renderAll(); // プログレスバーと上部階層表示を更新し, ボタンは非表示になる(新階層で次階層の条件を満たしていないため)
                } else {
                    samToast('error', '進階失敗: MVU書き戻しが利用できません');
                }
            }
        });
        // ★ 決算任務ボタン: トップバーの入口。インスタンス内かつ非戦闘時に常時表示され、クリックで【決算任務】を入力欄へ送信
        $panel.off('click.samMissionSettle').on('click.samMissionSettle', '[data-mission-settle]', function(e) {
            e.stopPropagation();
            var text = '【決算任務】';
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '入力欄へ送信しました: '+text);
            else samToast('warning', '入力欄が見つかりません, クリップボードへコピーしました');
        });
        // ★ 血統/形態/スキルカードの削除ボタン(編集モードで表示): 二次確認 → MVUへ書き戻して削除
        $panel.off('click.samFcDel').on('click.samFcDel', '.sam-fc-del-btn[data-del-path]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-del-path') || '';
            if (!path) return;
            // 末尾セグメント名を取得して通知に使用
            var seg = path.split('.');
            var name = seg[seg.length - 1] || path;
            samConfirm('削除の確認', '「'+name+'」を削除しますか? この操作は変数へ書き込み、パネルを更新します。', function() {
                var ok = writeBackMvu(function(statData) {
                    if (!statData) return;
                    var cur = statData, i;
                    for (i = 0; i < seg.length - 1; i++) {
                        if (!cur[seg[i]] || typeof cur[seg[i]] !== 'object') return;
                        cur = cur[seg[i]];
                    }
                    if (cur[seg[seg.length - 1]] !== undefined) delete cur[seg[seg.length - 1]];
                    // ★ 形态库内の形態を削除する際, その形態がキャラクターの"当前形态"で有効化/参照されている場合は,
                    //   当前形态も同時にリセットする(激活:false, 名称を空に), でなければ削除済み形態への参照が残り,
                    //   以降の血統購入/AI の形態構築時に"既存の形態"と誤読され続け, 拒否やエラーを引き起こす
                    if (seg.length === 3 && seg[0] === 'キャラ' && seg[1] === '形態庫'
                        && statData.キャラ && statData.キャラ.現在形态) {
                        var cf = statData.キャラ.現在形态;
                        if (cf && cf.名称 === name) {
                            cf.激活 = false; cf.名称 = '';
                        }
                    }
                });
                if (ok) {
                    samToast('success', '削除しました: '+name);
                    renderAll();
                } else {
                    samToast('error', '削除失敗: MVU書き戻しが利用できません');
                }
            });
        });
        // ★ 世界選択ボタン(トップバー, 主神空間かつ非戦闘時のみ描画): クリックで【世界選択】を入力欄へ送信
        $panel.off('click.samChooseWorld').on('click.samChooseWorld', '[data-choose-world]', function(e) {
            e.stopPropagation();
            var text = '【世界選択】';
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '入力欄へ送信しました: '+text);
            else samToast('warning', '入力欄が見つかりません, クリップボードへコピーしました');
        });
        // ★ ショップ商品更新ボタン: 本文AI generateRaw を呼び新ZOD構造で商品在庫を生成し, stat_data.商城へ書き戻す
        $panel.off('click.samShopRefresh').on('click.samShopRefresh', '.sam-shop-refresh-btn', async function(e) {
            e.stopPropagation();
            var $btn = $(this);
            if ($btn.is('[disabled]')) return;
            var $req = $panel.find('.sam-shop-req').first();
            var req = $req.length ? String($req.val() || '').trim() : '';
            // 要望入力をモジュールレベルへ保存(更新後も renderAll がDOMを再構築して復元できる, クリアしない: 不満なら続けて更新可能)
            shopReqText = req;
            
            var content = ''
                + '属性系统 (底层定义):\n'
                + '  基礎五維 (判定根拠):\n'
                + '    筋力: 近战/负重/破坏\n'
                + '    敏捷: 平衡/潜行/瞄准\n'
                + '    体力: 生命/耐性/恢复\n'
                + '    精神: 施法/察觉/意志\n'
                + '    魅力: 社交/欺骗/威吓\n'
                + '  资源属性:\n'
                + '    HP: 生命值，HP≤0即判定死亡\n'
                + '    HP_MAX: 生命值上限\n'
                + '    THP: 临时生命值/护盾，受到伤害时优先扣减，不叠加，脱战归零\n'
                + '    EP: 能量值，用于技能消耗\n'
                + '    EP_MAX: 能量值上限\n'
                + '  衍生属性:\n'
                + '    ATK: 物理攻击\n'
                + '    DEF: 物理防御\n'
                + '    MATK: 法术攻击\n'
                + '    MDEF: 法术防御\n'
                + '    AP: 法术强度乘区\n'
                + '  行动属性 (全局禁止添加):\n'
                + '    先制DC: 行动顺序\n'
                + '    防御DC: 被命中难度\n';
            // 世界書の内容を取得する呼び出し
            content += await getWorldBookContent('⚙️生命层级与社会生态'); 
            content += await getWorldBookContent('⚙️品质效果数值规则'); 
            content += await getWorldBookContent('⚙️实体生成规则'); 
            content += await getWorldBookContent('⚙️状态协议'); 
            content += await getWorldBookContent('⚙️行为判定[mvu_plot]'); 
            
            if (content) {
                // ここで取得した世界書の内容を渡すことができる
                handleShopRefresh(req, content); 
            }
        });
        // ★ 要望入力欄: 入力時にリアルタイムでモジュールレベルのshopReqText, Tab切替/その他の renderAll によるDOM再構築後も復元できる(内容は失われない)
        $panel.off('input.samShopReq').on('input.samShopReq', '.sam-shop-req', function() {
            shopReqText = String($(this).val() || '');
        });
        // ★ "停止"ボタン(ショップ更新停止 / 血統融合停止): data-sam-act で振り分け, dub がハングしたAIリクエストを中断し対応する epoch を進めて旧 Promise コールバックの結果を破棄させる
        $panel.off('click.samShopStop').on('click.samShopStop', '.sam-shop-stop-btn', function(e) {
            e.stopPropagation();
            var act = String($(this).attr('data-sam-act') || '');
            if (act === 'blood-fusion-stop') bloodFusionStop();
            else shopStopRefresh();
        });
        // 配信待ち記録: ユーザーが手動でクリア(モデルが正常に叙述した後はJSONPatchでも自動クリアされる)
        $panel.off('click.samReceiptClear').on('click.samReceiptClear', '[data-receipt-clear]', function(e) {
            e.stopPropagation();
            shopClearReceipt();
        });
        // ★ ショップ市場エリア: 区域Tab切替(装備|アイテム|スキル|血統)
        $panel.off('click.samShopTab').on('click.samShopTab', '.sam-shop-tab', function(e) {
            e.stopPropagation();
            var tab = $(this).attr('data-shop-tab');
            if (!tab || tab === shopActiveTab) return;
            shopActiveTab = tab;
            shopActiveSlot = ''; // 区切替時にスロットをリセット
            shopRefreshMarket();
        });
        // ★ 所持パネル: サブTab切替(戦術スロット|装備バックパック|アイテムバックパック|倉庫)
        $panel.off('click.samHoldTab').on('click.samHoldTab', '.sam-hold-tab', function(e) {
            e.stopPropagation();
            var tab = $(this).attr('data-hold-tab');
            if (!tab || tab === holdActiveTab) return;
            holdActiveTab = tab;
            holdTypeFilter = ''; // サブTab切替時にタイプ絞り込みをリセット(各Tabで分類体系が異なる)
            // Tabバーのactive状態のみ切替 + 内容領域を部分的に差し替え(Tabバーを再構築せず, 行全体のガタつき/ズレを解消)
            $panel.find('.sam-hold-tab').removeClass('active');
            $(this).addClass('active');
            var sdHold = getStatData();
            if (sdHold) {
                // 分類行は内容と一緒に再構築(各Tabでタイプ集合が異なる; 外側コンテナは常駐し, 空Tab時は内容をクリア)
                $('#sam-hold-types-wrap').html(renderHoldTypeRow(sdHold));
                $('#sam-hold-body').html(renderHoldBody(sdHold));
            }
        });
        // ★ 所持パネル: 専用分類行の絞り込み(全部/各タイプ) —— クリック後は active 状態 + 内容領域のみ更新し, Tabバーと分類行の構造は再構築しない
        //   分類が多い場合は行内を横スクロール; ビューポート端の外にあるカプセルをクリックすると可視領域へスムーズにスクロールする(inline:center)
        $panel.off('click.samHoldType').on('click.samHoldType', '.sam-hold-type', function(e) {
            e.stopPropagation();
            var t = String($(this).attr('data-hold-type') || '');
            if (t !== holdTypeFilter) {
                holdTypeFilter = t;
                $panel.find('.sam-hold-type').removeClass('active');
                $(this).addClass('active');
                var sdType = getStatData();
                if (sdType) $('#sam-hold-body').html(renderHoldBody(sdType));
            }
            try { this.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' }); } catch(err) { try { this.scrollIntoView(false); } catch(e2){} }
        });
        // ★ ショップ市場エリア: 装備区 左navスロット切替
        $panel.off('click.samShopSlot').on('click.samShopSlot', '.sam-shop-nav-btn', function(e) {
            e.stopPropagation();
            var slot = $(this).attr('data-shop-slot');
            if (!slot || slot === shopActiveSlot) return;
            shopActiveSlot = slot;
            shopRefreshMarket();
        });
        // ★ ショップ市場エリア: 商品カードのクリック(選択/解除); アイテム区はカード全体のクリックに反応しない(数量コントロールで決定)
        $panel.off('click.samShopItem').on('click.samShopItem', '.sam-shop-item', function(e) {
            // クリック元が数量コントロール(ボタン/入力欄), qty の委譲処理へ流す
            var $tgt = $(e.target);
            if ($tgt.closest('.sam-shop-qty').length) return;
            // スキル折りたたみブロック(<details>/<summary>)のクリックではカード選択/数量加算を発火させない, 商品選択と衝突するため
            if ($tgt.closest('.sam-shop-sk-list').length) return;
            e.stopPropagation();
            var $card = $(this);
            // 無効状態のブロック: 無効理由に応じた通知を出す
            if ($card.hasClass('disabled')) {
                var reason = $card.attr('data-dis-reason');
                if (reason === 'fusionbusy') { samToast('warning', '血統融合中, 融合が完了してから血統を購入してください'); return; }
                if (reason === 'permission') { samToast('warning', '権限不足, 現在の階層/権限証憑ではこのランクの商品を購入できません'); return; }
                samToast('warning', 'スペースコイン不足, 購入できません'); return;
            }
            var name = $card.attr('data-name');
            var cat  = $card.attr('data-cat');
            var slot = $card.attr('data-slot') || '';
            if (!name || !cat) return;
            // アイテム区: カードクリック=+1数量(簡便操作); 1件加算前に残高を事前チェック
            if (cat === '道具区') {
                var cur = 0, unitPrice = 0;
                for (var i = 0; i < shopCart.length; i++) {
                    if (shopCart[i].name === name && shopCart[i]._cat === cat) { cur = shopCart[i].quantity || 0; unitPrice = Number(shopCart[i].price || 0); break; }
                }
                if (!unitPrice) {
                    var fnd = shopFindItems(cat, slot, name);
                    if (fnd.length) unitPrice = Number(fnd[0].price || 0);
                }
                var coinNow = (function(){ var sd = getStatData(); return sd && sd.キャラ ? safeNum(sd.キャラ.スペースコイン, 0) : 0; })();
                // 残り残高 = 元の残高 - 選択済み合計(本商品の選択済み数量を含む)
                var remainNow = shopRemain(coinNow) + (cur * unitPrice); // 本商品が占有している枠を除いて初めて、実際に追加可能な残りになる
                if (remainNow < unitPrice * (cur + 1)) { samToast('warning', 'スペースコイン不足, あと1件追加できません(残り '+remainNow.toLocaleString()+')'); return; }
                shopSetQty(name, cat, cur + 1);
                return;
            }
            var items = shopFindItems(cat, slot, name);
            if (items.length) shopToggleSelect(items[0], cat, slot);
        });
        // ★ ショップ市場エリア: アイテム数量コントロール(+/− ボタン + 入力欄); 数量加算時に残高を事前チェック
        $panel.off('click.samShopQty').on('click.samShopQty', '.sam-shop-qty-btn', function(e) {
            e.stopPropagation();
            var $btn = $(this);
            var name = $btn.attr('data-name');
            var isPlus = ($btn.attr('data-shop-qty-btn') === 'plus');
            var $inp = $btn.siblings('.sam-shop-qty-inp').first();
            var cur = $inp.length ? (parseInt($inp.val(), 10) || 0) : 0;
            var nxt = Math.max(0, cur + (isPlus ? 1 : -1));
            if (isPlus && nxt > cur) {
                // 単価を調べて残高を事前チェック
                var up = 0;
                for (var k = 0; k < shopCart.length; k++) { if (shopCart[k].name === name && shopCart[k]._cat === '道具区') { up = Number(shopCart[k].price || 0); break; } }
                if (!up) { var f = shopFindItems('道具区', '', name); if (f.length) up = Number(f[0].price || 0); }
                var cn = (function(){ var sd = getStatData(); return sd && sd.キャラ ? safeNum(sd.キャラ.スペースコイン, 0) : 0; })();
                // 残り残高 = 元の残高 - 選択済み合計; ただし本商品の選択済み数量は除外する(これは cur から nxtへ変更するため)
                var curQty = shopGetQty(name, '道具区') || 0;
                var remainB = shopRemain(cn) + (curQty * up);
                if (remainB < up * nxt) { samToast('warning', 'スペースコイン不足, あと '+nxt+' 件まで追加できません(残り '+remainB.toLocaleString()+')'); return; }
            }
            if ($inp.length) $inp.val(nxt);
            shopSetQty(name, '道具区', nxt);
        });
        $panel.off('input.samShopQty change.samShopQty', '.sam-shop-qty-inp').on('input.samShopQty change.samShopQty', '.sam-shop-qty-inp', function(e) {
            e.stopPropagation();
            var $inp = $(this);
            var name = $inp.attr('data-name');
            var qty = parseInt($inp.val(), 10) || 0;
            if (qty < 0) qty = 0;
            // 残高の事前チェック: 大きな数を直接入力した場合もブロックする(すなわち +/- ボタンの事前チェックを回避させない)
            if (qty > 0) {
                var upInp = 0;
                for (var k2 = 0; k2 < shopCart.length; k2++) { if (shopCart[k2].name === name && shopCart[k2]._cat === '道具区') { upInp = Number(shopCart[k2].price || 0); break; } }
                if (!upInp) { var fInp = shopFindItems('道具区', '', name); if (fInp.length) upInp = Number(fInp[0].price || 0); }
                var cnInp = (function(){ var sd = getStatData(); return sd && sd.キャラ ? safeNum(sd.キャラ.スペースコイン, 0) : 0; })();
                var curQtyInp = shopGetQty(name, '道具区') || 0;
                var remainInp = shopRemain(cnInp) + (curQtyInp * upInp);
                if (remainInp < upInp * qty) {
                    // 許容できる最大数量を計算し, 入力欄へ戻して通知
                    var maxQty = upInp > 0 ? Math.floor(remainInp / upInp) : qty;
                    if (maxQty < 0) maxQty = 0;
                    samToast('warning', 'スペースコイン不足, 最大 '+maxQty+' 個まで購入できます(残り '+remainInp.toLocaleString()+')');
                    qty = maxQty;
                    $inp.val(qty);
                }
            }
            shopSetQty(name, '道具区', qty);
        });
        // ★ ショップ市場エリア: 取引実行ボタン
        $panel.off('click.samShopExec').on('click.samShopExec', '.sam-shop-exec-btn', function(e) {
            e.stopPropagation();
            var $btn = $(this);
            if ($btn.is('[disabled]')) return;
            shopHandleExec();
        });
        // ★ ショップ: 購入対象キャラクターの切替セレクト
        //   切替時: 引数の正当性を検証; 更新中なら無視する(セレクトは既にグレーアウト済み, 二重の保険);
        //   現在のキャラクターの買い物状態の永続保存に追加操作は不要(在庫は MVU のメンバー商庫へ永続化済み);
        //   切替後にカートをクリア(前のキャラクター向けに購入した商品が新しいキャラクターへ誤配分されるのを防ぐ) + アクティブ区域をリセット + 再描画
        $panel.off('change.samShopActor').on('change.samShopActor', '.sam-shop-actor-select', function(e) {
            e.stopPropagation();
            var $sel = $(this);
            if ($sel.is('[disabled]')) return;
            var newActor = String($(this).val() || '').trim();
            if (!newActor || newActor === shopCurrentActor) return;
            var sdActor = getStatData();
            if (sdActor) {
                var opts = shopBuildActorOptions(sdActor);
                var okOpt = false;
                for (var oi = 0; oi < opts.length; oi++) { if (opts[oi].name === newActor) { okOpt = true; break; } }
                if (!okOpt) { samToast('warning', 'このキャラクターは選択できません(退場済み、または味方ではない可能性)'); return; }
            }
            shopCurrentActor = newActor;
            // カートをクリア(キャラクターごとに在庫は独立しており, 切替時に前のキャラクターの購入予定リストは保持しない)
            shopCart = [];
            shopActiveTab = '';
            shopActiveSlot = '';
            renderAll();
        });
        // ★ エディタイベント(クリックで編集/一時保存/フィールドのトグル): 独立関数として切り出し, panel と modal(独立DOM)で共用
        bindEditorEvents($panel);
        // 保存ボタン
        $(document).off('click.samSave').on('click.samSave', '.sam-save-btn', saveEdits);
        // <details> の折りたたみ記憶: summary のクリック(ユーザーの能動的な切替)を監視し, open状態を記録して次回描画時に復元
        // 注: click を使う。ネイティブの toggle イベントではなく, jQuery の toggle 委譲は一部バージョンで互換性問題があるため;
        // key は summary のテキストから末尾の "(N)" 数量括弧を除去し, データの増減をまたいで安定して一致させる
        $panel.off('click.samDetails').on('click.samDetails', 'details > summary', function(e) {
            // 本パネル内のセクションタイトルのクリック(バブリングした summary)のみを処理
            var $d = $(this).closest('details');
            if (!$d.length) return;
            // 非同期読み取り: click が先に既定の toggle切替を発火する, その後 open 属性を読む
            var $sum = $(this);
            setTimeout(function() {
                var raw = $sum.text().trim();
                var key = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
                if (key) detailsOpenState[key] = $d.prop('open');
            }, 0);
        });
    }
    /* エディタのイベントバインド: $root は #samsara-panel または #samsara-modal (両者は兄弟ノード, 個別に委譲が必要) */
    function bindEditorEvents($root) {
        if (!$root || !$root.length) return;
        // エディタのinput変更(リアルタイムで一時保存, 即時書き戻しはしない)
        $root.off('input.samEdit change.samEdit', '.sam-edit-input').on('input.samEdit change.samEdit', '.sam-edit-input', function() {
            $(this).addClass('sam-dirty');
        });
        // クリックで即編集: 表示状態(.sam-ed-wrap)をクリック→実入力欄を挿入→フォーカス
        $root.off('click.samEd', '.sam-ed-wrap').on('click.samEd', '.sam-ed-wrap', function(e) {
            e.stopPropagation();
            var $w = $(this);
            if ($w.hasClass('editing')) return;
            $w.addClass('editing');
            var path = $w.attr('data-path');
            var type = $w.attr('data-type') || 'text';
            var optsStr = $w.attr('data-opts') || '';
            var cur = $w.find('.sam-ed-val').first().text();
            var real;
            if (type === 'select') {
                real = editRealSelectHtml(path, strToOpts(optsStr), cur);
            } else {
                real = editRealInputHtml(path, cur, type);
            }
            $w.html(real);
            var $inp = $w.find('.sam-edit-active').first();
            if ($inp.is('input,textarea')) { $inp.trigger('focus'); if ($inp[0].select) $inp[0].select(); }
        });
        // ブラー/確定: pendingEdits に一時保存し表示状態へ戻す
        $root.off('blur.samEd keydown.samEd', '.sam-edit-active').on('blur.samEd', '.sam-edit-active', function() {
            flushStagedDisplay($(this));
        });
        $root.on('keydown.samEd', '.sam-edit-active', function(e) {
            if (e.which === 13 && $(this).is('input')) { e.preventDefault(); this.blur(); }
            else if (e.which === 27) { e.preventDefault(); this.blur(); }
        });
        // フィールド単位のトグル(編集モード内)
        $root.off('click.samFieldToggle').on('click.samFieldToggle', '.sam-toggle-switch[data-toggle="field"]', function(e) {
            e.stopPropagation();
            $(this).toggleClass('on');
            var path = $(this).data('path');
            if (path) stageEdit(path, $(this).hasClass('on'), 'toggle');
        });
        // ★ 職業構造化エディタ: 入力のブラー/変更→再構成して一時保存; 削除→カードを除去して再構成; 追加→空カードを追加して再構成
        //   (modal 内で職業を編集する場合も同様に有効, occEditAdd は data-occ-path でグローバルに filter してコンテナを探す)
        $root.off('blur.occEd change.occEd', '.sam-occ-field').on('blur.occEd change.occEd', '.sam-occ-field', function() {
            occReassemble($(this).closest('.sam-occ-edit'));
        });
        $root.off('click.occDel').on('click.occDel', '.sam-occ-del-btn', function(e) {
            e.stopPropagation();
            occEditDelete($(this).closest('.sam-occ-edit-card'));
        });
        $root.off('click.occAdd').on('click.occAdd', '.sam-occ-add-btn', function(e) {
            e.stopPropagation();
            occEditAdd($(this));
        });
    }
    /* ===== 14b. 立ち絵関連のイベントバインド(アバタークリックで拡大/アップロード + ビューアを閉じる) ===== */
    function bindPortraitEvents() {
        // キャラのアバタークリック: 立ち絵の有無にかかわらず, カスタム立ち絵ダイアログを直接表示(拡大は行わず/✎バッジも出さない)
        $(document).off('click.samPortrait', '.sam-avatar').on('click.samPortrait', '.sam-avatar', function(e) {
            e.stopPropagation();
            openReincarnatorPortraitUp();
        });
        // NPCアバタークリック: 立ち絵の有無にかかわらず, カスタム立ち絵ダイアログを直接表示(カード詳細へのバブリングを防ぐ)
        $(document).off('click.samNpcAvatar', '.sam-npc-avatar').on('click.samNpcAvatar', '.sam-npc-avatar', function(e) {
            e.stopPropagation();
            openPortraitUpload($(this).data('name') || '');
        });
        // NPCに立ち絵がない場合の"立ち絵"小ボタン→アップロード(バブリングを防ぐ)
        $(document).off('click.samNpcPortraitBtn', '.sam-npc-portrait-btn').on('click.samNpcPortraitBtn', '.sam-npc-portrait-btn', function(e) {
            e.stopPropagation();
            openPortraitUpload($(this).data('name') || '');
        });
        // 立ち絵ビューアをクリックで閉じる
        $(document).off('click.samPvClose', '#samsara-portrait-viewer').on('click.samPvClose', '#samsara-portrait-viewer', function() {
            $(this).removeClass('show');
        });
    }

    /* ===== 15. 設定ダイアログ ===== */
    /* ===== 15a. MVU変数更新方式（追加API / 主AI追従） ===== */
    var VARIABLE_API_MODE_KEY = 'samsara_variable_api_mode';
    var VARIABLE_API_WORLD_BOOK_RULES = {
        'output_format (随AI输出开，主API)': { '随主API': true, '额外API': false },
        '[mvu_update]output_format (使用额外模型更新变量开)': { '随主API': false, '额外API': true }
    };
    function normalizeVariableApiMode(mode) { return mode === '随主API' ? '随主API' : '额外API'; }
    function variableApiStorage() {
        try { if (GS_PARENT && GS_PARENT.localStorage) return GS_PARENT.localStorage; } catch(e) {}
        try { return window.localStorage; } catch(e2) { return null; }
    }
    function getVariableApiMode() {
        try {
  var storage = variableApiStorage();
  return normalizeVariableApiMode(storage ? storage.getItem(VARIABLE_API_MODE_KEY) : '额外API');
        } catch(e) { return '额外API'; }
    }
    function saveVariableApiMode(mode) {
        try {
  var storage = variableApiStorage();
  if (storage) storage.setItem(VARIABLE_API_MODE_KEY, normalizeVariableApiMode(mode));
        } catch(e) {}
    }
    function resolveVariableApiHostFunction(name) {
        var roots = [GS_PARENT, window];
        try { if (window.parent && roots.indexOf(window.parent) < 0) roots.push(window.parent); } catch(e) {}
        try { if (window.top && roots.indexOf(window.top) < 0) roots.push(window.top); } catch(e2) {}
        for (var i = 0; i < roots.length; i++) {
  var root = roots[i];
  try {
      if (root && typeof root[name] === 'function') return root[name].bind(root);
      if (root && root.TavernHelper && typeof root.TavernHelper[name] === 'function') return root.TavernHelper[name].bind(root.TavernHelper);
  } catch(e3) {}
        }
        return null;
    }
    function normalizeVariableApiEntryName(name) { return String(name || '').trim().replace(/\.(txt|ya?ml)$/i, ''); }
    function variableApiRuleForEntry(name) { return VARIABLE_API_WORLD_BOOK_RULES[normalizeVariableApiEntryName(name)] || null; }
    function normalizeVariableApiWorldbookEntries(wb) {
        if (Array.isArray(wb)) return wb;
        if (wb && Array.isArray(wb.entries)) return wb.entries;
        return [];
    }
    function variableApiPresetDesired(name, mode) {
        var text = String(name || '');
        if (text.indexOf('变量额外API') >= 0) return mode === '额外API';
        if (text.indexOf('变量主API') >= 0) return mode === '随主API';
        return null;
    }
    async function applyVariableApiMode(mode) {
        mode = normalizeVariableApiMode(mode);
        var getNames = resolveVariableApiHostFunction('getCharWorldbookNames');
        var getWorldbookFn = resolveVariableApiHostFunction('getWorldbook');
        var updateWorldbookFn = resolveVariableApiHostFunction('updateWorldbookWith');
        if (!getNames || !getWorldbookFn || !updateWorldbookFn) return { ok:false, error:'世界書の切り替えインターフェースが検出できません。酒場助手スクリプトが有効になっているか確認してください。' };

        var namesInfo;
        try { namesInfo = await Promise.resolve(getNames('current')); }
        catch(e) { return { ok:false, error:'現在のキャラクターの世界書の読み込みに失敗: ' + (e && e.message ? e.message : e) }; }
        namesInfo = namesInfo || {};
        var worldbookNames = [];
        [namesInfo.primary].concat(Array.isArray(namesInfo.additional) ? namesInfo.additional : []).forEach(function(name) {
  if (name && worldbookNames.indexOf(name) < 0) worldbookNames.push(name);
        });
        if (!worldbookNames.length) return { ok:false, error:'現在のキャラクターには切り替え可能な世界書がありません。' };

        var worldbookMatched = 0, worldbookChanged = 0, presetMatched = 0, presetChanged = 0;
        try {
  for (var wi = 0; wi < worldbookNames.length; wi++) {
      var wbName = worldbookNames[wi], wb;
      try { wb = await Promise.resolve(getWorldbookFn(wbName)); } catch(e2) { continue; }
      var entries = normalizeVariableApiWorldbookEntries(wb);
      var localMatched = 0, localChanged = 0;
      entries.forEach(function(entry) {
          var rule = entry && variableApiRuleForEntry(entry.name);
          if (!rule) return;
          localMatched++;
          if (entry.enabled !== rule[mode]) localChanged++;
      });
      if (!localMatched) continue;
      worldbookMatched += localMatched;
      if (localChanged) {
          await Promise.resolve(updateWorldbookFn(wbName, function(nextWb) {
              normalizeVariableApiWorldbookEntries(nextWb).forEach(function(entry) {
                  var rule = entry && variableApiRuleForEntry(entry.name);
                  if (rule) entry.enabled = rule[mode];
              });
              return nextWb;
          }));
          worldbookChanged += localChanged;
      }
  }
  var getPresetFn = resolveVariableApiHostFunction('getPreset');
  var updatePresetFn = resolveVariableApiHostFunction('updatePresetWith');
  if (getPresetFn && updatePresetFn) {
      var preset = null;
      try { preset = await Promise.resolve(getPresetFn('in_use')); } catch(e3) {}
      var prompts = preset && Array.isArray(preset.prompts) ? preset.prompts : [];
      prompts.forEach(function(prompt) {
          var desired = variableApiPresetDesired(prompt && (prompt.name || prompt.id), mode);
          if (desired === null) return;
          presetMatched++;
          if (prompt.enabled !== desired) presetChanged++;
      });
      if (presetChanged) {
          await Promise.resolve(updatePresetFn('in_use', function(nextPreset) {
              var list = nextPreset && Array.isArray(nextPreset.prompts) ? nextPreset.prompts : [];
              list.forEach(function(prompt) {
                  var desired = variableApiPresetDesired(prompt && (prompt.name || prompt.id), mode);
                  if (desired !== null) prompt.enabled = desired;
              });
              return nextPreset;
          }));
      }
  }
        } catch(e4) {
  return { ok:false, error:'変数更新方式の切り替えに失敗: ' + (e4 && e4.message ? e4.message : e4), worldbookMatched:worldbookMatched, worldbookChanged:worldbookChanged, presetMatched:presetMatched, presetChanged:presetChanged };
        }
        if (!worldbookMatched) return { ok:false, error:'現在のキャラクターの世界書に変数更新モードの項目が見つかりません。項目名を確認してください。', worldbookMatched:0, worldbookChanged:0, presetMatched:presetMatched, presetChanged:presetChanged };
        saveVariableApiMode(mode);
        return { ok:true, mode:mode, worldbookMatched:worldbookMatched, worldbookChanged:worldbookChanged, presetMatched:presetMatched, presetChanged:presetChanged };
    }

    /* ===== 15a. 追加モデル設定( Zsdオンラインゲームフォーラム_ローカル内蔵版から移植) =====
       保存場所: localStorage['samsara_api_config'] = {
         enabled:      追加モデル設定を有効にするか(オン → ショップ/血統融合は自前ホストAPI, オフ → generateRaw 本文AI)
         apiUrl:       カスタム API アドレス
         apiKey:       API Key
         model:        現在使用中のモデル
         apiPresets:   [{name, apiUrl, apiKey, model}] ユーザーが保存した複数セットのプリセット
         fetchedModels:[] /models エンドポイントから読み込んだモデル一覧
       }
       説明: 設定はlocalStorage( MVUから切り離し, シナリオ/補助スクリプトによる上書きを回避; VARIABLE_UPDATE_ENDEDをブロードキャストせず, 再レンダリングの副作用ゼロ)。
             初回読み込み時に localStorage が空なら, 旧 MVU の stat_data.設置.API から一度だけ自動移行する。
             この設定は統合"追加モデル"チャネル: ショップ更新と血統融合の AI リクエストは shopCallAI で一括して振り分ける,
             スイッチがオン → 自前ホストAPI, オフ → 引き続き generateRaw 本文AI */
    var API_DEFAULT_MODELS = {
        openai:  ['gpt-4o','gpt-4o-mini','gpt-4-turbo','o1','o3-mini','o1-mini'],
        claude:  ['claude-3-5-sonnet','claude-3-opus','claude-3-haiku','claude-3-5-sonnet-20241022'],
        deepseek:['deepseek-chat','deepseek-reasoner','deepseek-v4-pro','deepseek-v4-flash'],
        gemini:  ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash'],
        azure:   ['gpt-4o','gpt-4o-mini','gpt-4']
    };
    /* ★ API 設定はlocalStorage( MVUから切り離し, シナリオ補助スクリプト/変数更新による上書きを回避; イベントをブロードキャストせず, 再レンダリングの副作用を根絶) */
    var API_CFG_KEY = 'samsara_api_config';
    /* 現在の API 設定を読み込む(安全なディープコピーを返す; 初回に旧 MVU データがあれば一度だけ自動移行) */
    function getApiConfig() {
        try {
            var raw = localStorage.getItem(API_CFG_KEY);
            if (!raw) {
                // 旧 MVU データとの互換: stat_data.設置.API から一度だけ移行を試みる
                var sd = getStatData();
                var old = sd && sd.設定 && sd.設定.API;
                if (old && typeof old === 'object' && (old.apiUrl || old.apiPresets && old.apiPresets.length || old.enabled)) {
                    var migrated = {
                        enabled:    (old.enabled === true),
                        apiUrl:     safeStr(old.apiUrl),
                        apiKey:     safeStr(old.apiKey),
                        model:      safeStr(old.model),
                        apiPresets: (Array.isArray(old.apiPresets) ? old.apiPresets : []).map(function(p){ return {
                            name:safeStr(p.name), apiUrl:safeStr(p.apiUrl), apiKey:safeStr(p.apiKey), model:safeStr(p.model)
                        }; }),
                        fetchedModels: Array.isArray(old.fetchedModels) ? old.fetchedModels.slice() : []
                    };
                    localStorage.setItem(API_CFG_KEY, JSON.stringify(migrated));
                    return migrated;
                }
                return { enabled:false, apiUrl:'', apiKey:'', model:'', apiPresets:[], fetchedModels:[] };
            }
            var cfg = JSON.parse(raw);
            return {
                enabled:    (cfg.enabled === true),
                apiUrl:     safeStr(cfg.apiUrl),
                apiKey:     safeStr(cfg.apiKey),
                model:      safeStr(cfg.model),
                apiPresets: (Array.isArray(cfg.apiPresets) ? cfg.apiPresets : []).map(function(p){ return {
                    name:safeStr(p.name), apiUrl:safeStr(p.apiUrl), apiKey:safeStr(p.apiKey), model:safeStr(p.model)
                }; }),
                fetchedModels: Array.isArray(cfg.fetchedModels) ? cfg.fetchedModels.slice() : []
            };
        } catch(e) { console.warn('[主神终端] API設定の読み込みに失敗:', e.message); }
        return { enabled:false, apiUrl:'', apiKey:'', model:'', apiPresets:[], fetchedModels:[] };
    }
    /* API 設定を書き戻す(localStorage, MVU/イベントブロードキャストを経由しない, 副作用ゼロ) */
    function saveApiConfig(mutator) {
        try {
            var cfg = getApiConfig();
            if (typeof mutator === 'function') mutator(cfg);
            localStorage.setItem(API_CFG_KEY, JSON.stringify(cfg));
            return true;
        } catch(e) { console.warn('[主神终端] API設定の保存に失敗:', e.message); return false; }
    }
    /* 追加モデルのチャット補完：世界エンジンは構造化 JSON を要求できる。
       structured=auto の場合は json_schema → json_object → plain の順に試し、endpoint+model ごとに利用可能なモードをキャッシュする。 */
    var API_STRUCTURED_MODE_CACHE = {};
    function structuredFormatUnsupported(status, text) {
        var code=Number(status),body=String(text||'');
        var explicit=[400,404,415,422].indexOf(code) >= 0 &&
            /response[_ -]?format|json[_ -]?schema|json[_ -]?object|unknown (?:field|parameter)|unrecognized|unsupported|not supported|invalid.*schema/i.test(body);
        var genericInvalidArgument=code===400 &&
            /INVALID_ARGUMENT|invalid[_ -]?argument|Request contains an invalid argument/i.test(body);
        return explicit||genericInvalidArgument;
    }
    async function apiChat(systemPrompt, userMsg, options) {
        options = options || {};
        var cfg = getApiConfig();
        var url = (cfg.apiUrl || '').trim();
        if (!url || !cfg.enabled) throw new Error('追加モデル設定が有効でないか API アドレスが空です');
        var endpoint = url;
        if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
        if (endpoint.endsWith('/chat/completions')) {
            // すでに完全なエンドポイント
        } else if (endpoint.endsWith('/v1')) {
            endpoint += '/chat/completions';
        } else if (endpoint.indexOf('/v1/') >= 0) {
            endpoint = endpoint.replace(/\/v1\/.*$/, '') + '/v1/chat/completions';
        } else {
            endpoint += endpoint.indexOf('/v') >= 0 ? '/chat/completions' : '/v1/chat/completions';
        }
        var headers = { 'Content-Type': 'application/json' };
        if (cfg.apiKey && cfg.apiKey.trim()) headers.Authorization = 'Bearer ' + cfg.apiKey.trim();
        var model = cfg.model || 'gpt-4o-mini';
        var cacheKey = endpoint + '|' + model;
        var wantsStructured = options.structured === 'auto' && options.schema;
        var cached = wantsStructured ? API_STRUCTURED_MODE_CACHE[cacheKey] : '';
        var modes = ['plain'];
        if (wantsStructured) {
            if (cached === 'json_schema') modes=['json_schema','json_object','plain'];
            else if (cached === 'json_object') modes=['json_object','plain'];
            else if (cached === 'plain') modes=['plain'];
            else modes=['json_schema','json_object','plain'];
        }
        var lastError = '';

        for (var mi=0; mi<modes.length; mi++) {
            var mode=modes[mi];
            var body = {
                model: model,
                messages: [
                    { role: 'system', content: String(systemPrompt || '') },
                    { role: 'user',   content: String(userMsg || '') }
                ],
                stream: false,
                temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.7
            };
            if (mode === 'json_schema') {
                body.response_format = {
                    type:'json_schema',
                    json_schema:{
                        name:String(options.schemaName || 'samsara_structured_result').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),
                        strict:false,
                        schema:options.schema
                    }
                };
            } else if (mode === 'json_object') {
                body.response_format = {type:'json_object'};
            }

            var resp;
            try {
                resp = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: options.signal });
            } catch(fetchError) {
                throw fetchError;
            }
            if (!resp.ok) {
                var errTxt = '';
                try { errTxt = await resp.text(); } catch(_e){}
                lastError='HTTP ' + resp.status + ': ' + resp.statusText + (errTxt ? (' / ' + errTxt.slice(0, 300)) : '');
                if (mode !== 'plain' && structuredFormatUnsupported(resp.status,errTxt)) {
                    if (cached) delete API_STRUCTURED_MODE_CACHE[cacheKey];
                    continue;
                }
                throw new Error(lastError);
            }
            var data = await resp.json();
            var message = data && data.choices && data.choices[0] && data.choices[0].message;
            var raw = message && message.content;
            var content = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' ? JSON.stringify(raw) : '');
            if (!content && message && message.parsed) content=JSON.stringify(message.parsed);
            if (!content) throw new Error('API が返した応答内容が空です');
            if (wantsStructured) API_STRUCTURED_MODE_CACHE[cacheKey]=mode;
            return content;
        }
        throw new Error(lastError || 'API が現在の構造化出力モードに対応していません');
    }
    /* 追加モデルチャネルが有効か( shopCallAI の一括振り分け判定用) */
    function isApiConfigEnabled() {
        var c = getApiConfig();
        return (c.enabled === true) && !!(c.apiUrl && c.apiUrl.trim());
    }
    /* 現在利用可能なモデル一覧を算出: fetchedModelsを優先, 次に apiUrl のキーワードから既定の一覧を推定 */
    function apiAvailableModels(cfg) {
        if (cfg.fetchedModels && cfg.fetchedModels.length > 0) return cfg.fetchedModels.slice();
        var url = (cfg.apiUrl || '').toLowerCase();
        if (url.indexOf('deepseek') >= 0) return API_DEFAULT_MODELS.deepseek.slice();
        if (url.indexOf('openai') >= 0 || url.indexOf('chatgpt') >= 0) return API_DEFAULT_MODELS.openai.slice();
        if (url.indexOf('anthropic') >= 0 || url.indexOf('claude') >= 0) return API_DEFAULT_MODELS.claude.slice();
        if (url.indexOf('gemini') >= 0 || url.indexOf('google') >= 0) return API_DEFAULT_MODELS.gemini.slice();
        if (url.indexOf('azure') >= 0) return API_DEFAULT_MODELS.azure.slice();
        return [];
    }
    /* モデル一覧を読み込む: /v1/models を連結し Authorization ヘッダー付きでリクエスト; 成功したら fetchedModels に書き込む */
    async function apiFetchModels() {
        var cfg = getApiConfig();
        var url = (cfg.apiUrl || '').trim();
        if (!url) throw new Error('先にカスタム API アドレスを入力してください');
        var endpoint = url;
        if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
        if (!endpoint.endsWith('/models')) {
            endpoint += (endpoint.indexOf('/v') >= 0) ? '/models' : '/v1/models';
        }
        var headers = {};
        if (cfg.apiKey && cfg.apiKey.trim()) headers.Authorization = 'Bearer ' + cfg.apiKey.trim();
        var resp = await fetch(endpoint, { headers: headers });
        if (!resp.ok) {
            var errTxt = '';
            try { errTxt = await resp.text(); } catch(_e){}
            throw new Error('HTTP ' + resp.status + ': ' + resp.statusText + (errTxt ? (' / ' + errTxt.slice(0, 300)) : ''));
        }
        var body = await resp.json();
        var models = ((body && body.data) || []).map(function(m){ return m.id || m.model || m.name || ''; }).filter(Boolean);
        if (!models.length) throw new Error('API が返したモデル一覧が空です');
        return models;
    }
    function openSettings() {
        var cur = getTheme();
        var editOn = isEditMode();
        var stat = getStatData() || {};
        var cfg = stat.設定 || {};
        var superStable = (cfg.世界超安定 === true);
        var singleWorld = (cfg.単一世界 === true);
        var worldEngine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
        var worldAdvanceOn = !!(worldEngine && typeof worldEngine.isConfigured === 'function' && worldEngine.isConfigured());
        var worldAdvanceReady = !!(worldEngine && typeof worldEngine.isEnabled === 'function' && worldEngine.isEnabled());
        var worldUsesDedicatedApi = !!(worldEngine && typeof worldEngine.usesDedicatedApi === 'function' && worldEngine.usesDedicatedApi());
        var worldAdvanceWaitingText = worldUsesDedicatedApi ? '有効 · 世界進行専用 API の設定を待機中' : '有効 · 追加モデル設定を待機中';
        var themeHtml = '';
        THEME_ORDER.forEach(function(key) {
            var th = THEMES[key];
            themeHtml += '<div class="sam-theme-card '+(key===cur?'active':'')+'" data-theme="'+key+'">'
                + '<div class="swatch" style="background:linear-gradient(90deg,'+th.dark+','+th.accent+','+th.hp+');"></div>'
                + '<div class="name" style="color:'+th.text+';background:'+th.bg+';">'+th.name+'</div></div>';
        });
        var html = secBlock('🎨 スキン変更',
              '<div class="sam-settings-grid">'+themeHtml+'</div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">✏️ データ編集</div><div style="font-size:11px;color:var(--sam-sub);">有効にすると任意の数値をクリックしてその場で編集(レイアウトは崩れず),保存でMVUに書き戻し</div></div>'
            + '<div class="sam-toggle-switch '+(editOn?'on':'')+'" data-toggle="edit"><div class="knob"></div></div></div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">🌐 世界超安定</div><div style="font-size:11px;color:var(--sam-sub);">有効にすると世界の安定度が固定され,因果軌道がずれなくなる</div></div>'
            + '<div class="sam-toggle-switch '+(superStable?'on':'')+'" data-toggle="世界超安定"><div class="knob"></div></div></div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">🪐 単一世界</div><div style="font-size:11px;color:var(--sam-sub);">有効にすると単一の世界だけが存在し,無効にすると複数の世界から選択できる</div></div>'
            + '<div class="sam-toggle-switch '+(singleWorld?'on':'')+'" data-toggle="単一世界"><div class="knob"></div></div></div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">🌍 世界進行</div><div id="sam-world-engine-state" style="font-size:11px;color:var(--sam-sub);">'+(worldAdvanceOn?(worldAdvanceReady?'有効 · 独立世界エンジンが引き継ぎ':worldAdvanceWaitingText):'無効 · 元の世界パネルと元のシミュレーションルールを使用')+'</div></div>'
            + '<div class="sam-toggle-switch '+(worldAdvanceOn?'on':'')+'" data-toggle="world-engine"><div class="knob"></div></div></div>');

        var difficulty = ['体験', '正常', '困難', '挑戦'].indexOf(cfg.難易度) >= 0 ? cfg.難易度 : '体験';
        var difficultyNotes = {
            '体験': '血統・スキル・装備・状態・形態は最低でも人物の生命階級と同水準、原始属性の追加上昇なし。',
            '正常': '体験を基準に、原始属性の品質を 2 階級上昇。',
            '困難': '原始属性の品質を 4 階級上昇、体質は最低 S 保証；血統・スキルは最低でも人物の生命階級と同水準、装備・状態・形態は人物の生命階級より最低 1 階級上。',
            '挑戦': '原始属性の品質を 6 階級上昇、体質は SSS；血統・装備・状態・形態は人物の生命階級より最低 1 階級上、スキルは最低でも人物の生命階級と同水準。'
        };
        html += secBlock('⚔️ 難易度 (実験機能)', '<div id="sam-difficulty-note" aria-live="polite" style="margin-bottom:10px;min-height:3em;font-size:12px;line-height:1.5;color:var(--sam-sub);">'+difficultyNotes[difficulty]+'</div><div role="group" aria-label="難易度選択" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">' + ['体験', '正常', '困難', '挑戦'].map(function(mode) {
            return '<button type="button" class="sam-varmode-btn '+(difficulty===mode?'active':'')+'" data-difficulty="'+mode+'" aria-pressed="'+(difficulty===mode?'true':'false')+'" style="text-align:center;padding:9px 4px;">'+mode+'</button>';
        }).join('') + '</div><div style="margin-top:8px;color:var(--sam-sub);font-size:11px;">以降に新規作成され好感度が負の非チームメイト NPCにのみ影響。各コンポーネントは選択した基準を補うだけで、すでにより高い品質のものは下げない；原始属性は引き続き独立して上昇し、困難/挑戦の体質は固定段階で補う。品質の上限は SSS、生命階級の上限は Ⅸ。</div>');
        var variableMode = getVariableApiMode();
        var variableModeHtml = '<div class="sam-varmode-grid">'
  + '<button type="button" class="sam-varmode-btn '+(variableMode==='额外API'?'active':'')+'" data-variable-api-mode="额外API">'
    + '<div class="ttl">追加API出力 <span class="tag">推奨</span></div>'
    + '<div class="desc">独立したモデルが変数を個別に更新し、本文はよりクリーン； MVU 拡張機能で追加モデルを設定する必要があります。</div></button>'
  + '<button type="button" class="sam-varmode-btn '+(variableMode==='随主API'?'active':'')+'" data-variable-api-mode="随主API">'
    + '<div class="ttl">主AI追従出力 <span class="tag">すぐに使える</span></div>'
    + '<div class="desc">本文モデルが同じターンで変数更新も出力、追加モデルは不要；長文では形式エラーが起きやすくなります。</div></button>'
  + '</div>'
  + '<div class="sam-varmode-status" id="sam-varmode-status"></div>'
  + '<div style="margin-top:5px;font-size:10px;line-height:1.5;color:var(--sam-sub);">この項目は MVU の世界書/プリセットを切り替えるだけです。下の「追加モデル設定」はショップ更新・血統融合で使用；世界進行が専用 API を有効にしていない場合もこのチャネルを再利用します。世界進行が専用 APIを有効にしている場合、二つのインターフェースは完全に分離されます。</div>';
        html += secBlock('🧭 変数更新方式', variableModeHtml);

        /* ----- 🔌 API 設定ブロック( Zsdオンラインゲームフォーラム_ローカル内蔵版から移植) ----- */
        var apiCfg = getApiConfig();
        // プリセットのドロップダウン: DOM 挿入後に apiRefreshFields() が jQuery text() で値を設定(エスケープ/インジェクション問題を回避)
        var presetOpts = '<option value="">— 保存済みプリセットを選択 —</option>';
        apiCfg.apiPresets.forEach(function(p) {
            presetOpts += '<option value=""></option>';
        });

        var modelList = apiAvailableModels(apiCfg);
        var modelOpts = '<option value="">(モデル未選択)</option>';
        modelList.forEach(function(m){
            modelOpts += '<option value="'+esc(m)+'"'+(m===apiCfg.model?' selected':'')+'>'+esc(m)+'</option>';
        });
        if (apiCfg.model && modelList.indexOf(apiCfg.model) < 0) {
            modelOpts = '<option value="'+esc(apiCfg.model)+'" selected>'+esc(apiCfg.model)+'</option>' + modelOpts;
        }

        var fetchedTag = apiCfg.fetchedModels && apiCfg.fetchedModels.length
            ? '<span class="sam-api-status ok">読み込み済み '+apiCfg.fetchedModels.length+' 個のモデル</span>'
            : '<span class="sam-api-status warn">未読み込み(既定の一覧を使用)</span>';

        // 有効化スイッチのヒント文言
        var apiEnableHint = apiCfg.enabled
            ? '<span class="sam-api-status ok">有効: ショップ更新 / 血統融合は自前ホスト API'+(worldUsesDedicatedApi?'；世界進行は専用 API':'；世界進行はこのチャネルを再利用可能')+'</span>'
            : '<span class="sam-api-status warn">無効: ショップ更新 / 血統融合は本文 API'+(worldUsesDedicatedApi?'；世界進行は引き続き専用 API':'；世界進行は追加モデル設定を待機中')+'</span>';
        var apiHtml = '<div class="sam-api-section">'
            // 有効化スイッチ
            + '<div class="sam-toggle-row" style="margin-bottom:8px;">'
              + '<div><div style="font-weight:bold;">🔌 追加モデル設定を有効化</div>'
              + '<div id="sam-api-enable-state" style="margin-top:2px;">'+apiEnableHint+'</div>'
              + '</div>'
              + '<div class="sam-toggle-switch '+(apiCfg.enabled?'on':'')+'" data-toggle="api-enabled"><div class="knob"></div></div>'
            + '</div>'
            // 以下の設定(スイッチがオフのときは非表示)
            + '<div id="sam-api-fields" style="'+(apiCfg.enabled?'':'display:none;')+'">'
            // プリセット管理
            + '<div class="sam-api-block-label">📜 API プリセット(複数セットの設定を保存)</div>'
            + '<div class="sam-api-row">'
              + '<select class="sam-api-select" id="sam-api-preset-sel" style="flex:1;">'+presetOpts+'</select>'
              + '<button class="sam-api-btn danger" data-act="delete-preset">削除</button>'
            + '</div>'
            + '<div class="sam-api-row" style="margin-top:4px;">'
              + '<input class="sam-api-input" id="sam-api-preset-name" placeholder="プリセット名(現在の設定を新規保存/同名は上書き)" style="flex:1;">'
              + '<button class="sam-api-btn save" data-act="save-preset">プリセットを保存</button>'
            + '</div>'
            // フィールド
            + '<div class="sam-api-field"><label>カスタム API アドレス</label>'
              + '<input class="sam-api-input" data-field="apiUrl" value="'+esc(apiCfg.apiUrl)+'" placeholder="http://127.0.0.1:8808/v1"></div>'
            + '<div class="sam-api-field"><label>API Key</label>'
              + '<input class="sam-api-input" data-field="apiKey" type="password" value="'+esc(apiCfg.apiKey)+'" placeholder="sk-..."></div>'
            + '<div class="sam-api-field"><label>モデル</label>'
              + '<select class="sam-api-select" data-field="model">'+modelOpts+'</select></div>'
            // モデルを読み込む
            + '<div class="sam-api-row" style="margin-top:6px;">'
              + '<button class="sam-api-btn" data-act="load-models">📡 モデル一覧を読み込む</button>'
              + '<button class="sam-api-btn" data-act="clear-models">クリア</button>'
              + '<span id="sam-api-models-status" style="margin-left:auto;align-self:center;">'+fetchedTag+'</span>'
            + '</div>'
            + '</div>'
            + '</div>';

        html += '<div class="sam-api-section" style="margin-top:12px;">' + apiHtml + '</div>';
        showModal('⚙️ 設定', html, true);   // 第三引数 true = 設定ダイアログは枠外クリックでの自動クローズを禁止(誤タッチでフォーム入力が消えるのを防ぐ)
        /* ===== API 設定: 宣言( apiRefreshFields の呼び出し前に配置する必要がある, そうでないと $apiModal が undefinedの状態になり, jQuery が document にフォールバックして命中はするが脆弱な経路) ===== */
        var $apiModal = $('#samsara-modal');
        var apiFieldTimer = null;   // フィールドのリアルタイム保存デバウンスタイマー(プリセットの読み込み/保存前に clearTimeout して古い値の書き戻し上書きを防ぐ)
        // テーマ選択
        // 初期化時は jQuery で安全に値を設定: プリセットのドロップダウン名/モデルのドロップダウンなど( HTML エスケープ/インジェクション問題を回避)
        try { apiRefreshFields(); } catch(_e){ console.warn('[主神终端] apiRefreshFields の初期更新で例外:', _e && _e.message); }
        $('#samsara-modal').off('click.samTheme').on('click.samTheme', '.sam-theme-card', function() {
            var tk = $(this).data('theme');
            setTheme(tk);
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            // 再レンダリング(変数変更時はstyleの再構築 + パネルの再レンダリングが必要)
            renderAll();
        });
        // 編集スイッチ
        $('#samsara-modal').off('click.samToggle').on('click.samToggle', '.sam-toggle-switch[data-toggle="edit"]', function() {
            var on = !$(this).hasClass('on');
            $(this).toggleClass('on', on);
            setEditMode(on);
            closeModal();
            renderAll();
        });
        $('#samsara-modal').off('change.samDifficulty').off('click.samDifficulty').on('click.samDifficulty', 'button[data-difficulty]', function() {
            var mode = $(this).attr('data-difficulty');
            if (['体験', '正常', '困難', '挑戦'].indexOf(mode) < 0) return;
            var ok = writeBackMvu(function(statData) {
                if (!statData.設定) statData.設定 = {};
                statData.設定.難易度 = mode;
            });
            if (!ok) { samToast('error', '難易度の保存に失敗'); openSettings(); return; }
            $('#samsara-modal button[data-difficulty]').removeClass('active').attr('aria-pressed', 'false');
            $(this).addClass('active').attr('aria-pressed', 'true');
            $('#sam-difficulty-note').text(difficultyNotes[mode]);
            samToast('success', '難易度を'+mode+'に設定しました、以降の新規敵対 NPC に適用されます');
            renderAll();
        });
        // 世界超稳 / 単一世界 スイッチ( MVU の設定ノードに書き戻す)
        $('#samsara-modal').off('click.samCfgToggle').on('click.samCfgToggle', '.sam-toggle-switch[data-toggle="世界超安定"], .sam-toggle-switch[data-toggle="単一世界"]', function() {
            var key = $(this).data('toggle');
            var on = !$(this).hasClass('on');
            $(this).toggleClass('on', on);
            writeBackMvu(function(statData) {
                if (!statData.設定) statData.設定 = {};
                statData.設定[key] = on;
            });
            renderAll();
        });
        // 世界進行のマスタースイッチ：専用 API を優先；専用 API が無効なときだけ主神ターミナルの追加モデルを再利用/有効化する。
        $('#samsara-modal').off('click.samWorldEngine').on('click.samWorldEngine', '.sam-toggle-switch[data-toggle="world-engine"]', function() {
            var engine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
            if (!engine || typeof engine.setEnabled !== 'function') { samToast('error', '先に独立スクリプトを読み込んでください：世界進行システム.js'); return; }
            var on = !$(this).hasClass('on');
            engine.setEnabled(on);
            $(this).toggleClass('on', on);
            var ready = !!(typeof engine.isEnabled === 'function' && engine.isEnabled());
            var dedicated = !!(typeof engine.usesDedicatedApi === 'function' && engine.usesDedicatedApi());
            $('#sam-world-engine-state', $apiModal).text(on ? (ready ? '有効 · 独立世界エンジンが引き継ぎ' : (dedicated ? '有効 · 世界進行専用 API の設定を待機中' : '有効 · 追加モデル設定を待機中')) : '無効 · 元の世界パネルと元のシミュレーションルールを使用');
            if (on) {
                apiRefreshFields();
                if (ready) samToast('success', dedicated ? '世界進行：有効 · 専用 API' : '世界進行：有効 · 主神ターミナルの追加モデル');
                else if (dedicated) samToast('warning', '世界進行を有効にしました。世界進行の「設定」で専用 API の設定を完了してください');
                else samToast('warning', '世界進行を有効にしましたが、主神ターミナルの追加モデル設定が不完全です');
            } else samToast('success', '世界進行を無効にしました。元の世界パネルとシミュレーションルールに戻りました');
        });

        // MVU変数更新方式：開局ページと localStorageを共有し、世界書/現在のプリセットを即座に同期する
        function refreshVariableModeFields(message, state) {
  var mode = getVariableApiMode();
  $('[data-variable-api-mode]', $apiModal).each(function() {
      $(this).toggleClass('active', $(this).attr('data-variable-api-mode') === mode);
  });
  var $st = $('#sam-varmode-status', $apiModal);
  if (!$st.length) return;
  $st.removeClass('ok err').addClass(state || '');
  $st.text(message || (mode === '额外API' ? '現在：追加API出力' : '現在：主AI追従出力'));
        }
        refreshVariableModeFields();
        $apiModal.off('click.samVariableMode').on('click.samVariableMode', '[data-variable-api-mode]', async function() {
  var mode = normalizeVariableApiMode($(this).attr('data-variable-api-mode'));
  var $buttons = $('[data-variable-api-mode]', $apiModal).prop('disabled', true);
  refreshVariableModeFields('世界書とプリセットの項目を切り替えています…', '');
  var result = await applyVariableApiMode(mode);
  $buttons.prop('disabled', false);
  if (result.ok) {
      refreshVariableModeFields('切り替え完了 · 世界書の変更 '+result.worldbookChanged+' 件 · プリセットの変更 '+result.presetChanged+' 件', 'ok');
      samToast('success', '変数更新方式を切り替えました：' + (mode === '额外API' ? '追加API出力' : '主AI追従出力'));
  } else {
      refreshVariableModeFields(result.error || '切り替えに失敗', 'err');
      samToast('error', result.error || '変数更新方式の切り替えに失敗');
  }
        });

        /* ===== API 設定: イベントバインド ===== */
        // ($apiModal / apiFieldTimer は上部の showModal 後に宣言済み)
        // ローカル補助: stat に基づいてモデルのドロップダウンを再構築
        function apiRenderModelSelect(c) {
            var list = apiAvailableModels(c);
            var $m = $('[data-field="model"]', $apiModal);
            $m.empty().append('<option value="">(モデル未選択)</option>');
            list.forEach(function(m) {
                var $o = $('<option></option>').val(m).text(m);
                if (m === c.model) $o.prop('selected', true);
                $m.append($o);
            });
            if (c.model && list.indexOf(c.model) < 0) {
                $m.prepend($('<option></option>').val(c.model).text(c.model).prop('selected', true));
            }
        }
        // ローカル補助: stat に基づいて API ブロックの全フィールドを更新(ダイアログは開き直さない)
        function apiRefreshFields() {
            var c = getApiConfig();
            // 有効化スイッチを同期
            $('.sam-toggle-switch[data-toggle="api-enabled"]', $apiModal).toggleClass('on', c.enabled === true);
            $('#sam-api-fields', $apiModal).toggle(c.enabled === true);
            // 有効状態のヒント
            var $hint = $('#sam-api-enable-state', $apiModal);
            if (c.enabled === true) {
                var _engineForApiHint = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
                var _dedicatedForApiHint = !!(_engineForApiHint && typeof _engineForApiHint.usesDedicatedApi === 'function' && _engineForApiHint.usesDedicatedApi());
                $hint.html('<span class="sam-api-status ok">有効: ショップ更新 / 血統融合は自前ホスト API'+(_dedicatedForApiHint?'；世界進行は専用 API':'；世界進行はこのチャネルを再利用可能')+'</span>');
            } else {
                var _engineForApiHint = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
                var _dedicatedForApiHint = !!(_engineForApiHint && typeof _engineForApiHint.usesDedicatedApi === 'function' && _engineForApiHint.usesDedicatedApi());
                $hint.html('<span class="sam-api-status warn">無効: ショップ更新 / 血統融合は本文 API'+(_dedicatedForApiHint?'；世界進行は引き続き専用 API':'；世界進行は追加モデル設定を待機中')+'</span>');
            }
            var $ps = $('#sam-api-preset-sel').empty().append('<option value="">— 保存済みプリセットを選択 —</option>');
            c.apiPresets.forEach(function(p) { $ps.append($('<option></option>').val(p.name).text(p.name)); });
            $('[data-field="apiUrl"]', $apiModal).val(c.apiUrl);
            $('[data-field="apiKey"]', $apiModal).val(c.apiKey);
            apiRenderModelSelect(c);
            if (c.fetchedModels && c.fetchedModels.length) {
                $('#sam-api-models-status').html('<span class="sam-api-status ok">読み込み済み '+c.fetchedModels.length+' 個のモデル</span>');
            } else {
                $('#sam-api-models-status').html('<span class="sam-api-status warn">未読み込み(既定の一覧を使用)</span>');
            }
            var engine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
            if (engine && typeof engine.isConfigured === 'function') {
                var engineOn = engine.isConfigured();
                var engineReady = typeof engine.isEnabled === 'function' && engine.isEnabled();
                $('.sam-toggle-switch[data-toggle="world-engine"]', $apiModal).toggleClass('on', engineOn);
                var engineDedicated = typeof engine.usesDedicatedApi === 'function' && engine.usesDedicatedApi();
                $('#sam-world-engine-state', $apiModal).text(engineOn ? (engineReady ? '有効 · 独立世界エンジンが引き継ぎ' : (engineDedicated ? '有効 · 世界進行専用 API の設定を待機中' : '有効 · 追加モデル設定を待機中')) : '無効 · 元の世界パネルと元のシミュレーションルールを使用');
                if (typeof engine.render === 'function') engine.render();
            }
        }
        // 有効化スイッチ: enabledの切り替え, 下部フィールドの表示を同期
        $apiModal.off('click.samApiEnable').on('click.samApiEnable', '.sam-toggle-switch[data-toggle="api-enabled"]', function() {
            var on = !$(this).hasClass('on');
            saveApiConfig(function(cfg) { cfg.enabled = on; });
            apiRefreshFields();
        });
        // プリセットを選ぶと即読み込み: プリセット内のアドレス/Key/ソース/プロキシをそのまま入力欄に貼り付け, モデルのドロップダウンはプリセット内のモデルだけに絞り, プリセット名を下の入力欄に同期する
        $apiModal.off('change.samApiPreset').on('change.samApiPreset', '#sam-api-preset-sel', function() {
            clearTimeout(apiFieldTimer);
            var $sel = $(this);
            var name = ($sel.val() || '').trim();
            if (!name) { $('#sam-api-preset-name').val(''); return; }   // "保存済みプリセットを選択"のプレースホルダー項目に戻した場合は名前だけをクリアする
            var snap = null, curCfg = getApiConfig();
            for (var i = 0; i < curCfg.apiPresets.length; i++) {
                if (curCfg.apiPresets[i].name === name) { snap = curCfg.apiPresets[i]; break; }
            }
            if (!snap) { samToast('err', 'プリセットが存在しません: ' + name); return; }
            // localStorageに書き戻す(新しい API アドレスに切り替えると,古い読み込み済みモデル一覧が無効になるため,まとめてクリアして初期化する)
            saveApiConfig(function(cfg) {
                cfg.apiUrl = snap.apiUrl; cfg.apiKey = snap.apiKey; cfg.model = snap.model;
                cfg.fetchedModels = [];
            });
            // 入力欄に直接貼り付ける
            $('[data-field="apiUrl"]', $apiModal).val(snap.apiUrl || '');
            $('[data-field="apiKey"]', $apiModal).val(snap.apiKey || '');
            // モデルのドロップダウン: クリアし, プリセット内のモデルだけを入れる(あれば選択, なければ空にする)
            var $m = $('[data-field="model"]', $apiModal).empty().append('<option value="">(モデル未選択)</option>');
            if (snap.model) $m.append($('<option></option>').val(snap.model).text(snap.model));
            $m.val(snap.model || '');
            // プリセット名を下の入力欄に同期(そのまま上書き保存しやすくする) —— 切り替えで即読み込み, 追加の通知なし(フィールドの更新自体がフィードバック)
            $('#sam-api-preset-name').val(name);
            // 読み込み済みモデル状態のヒントを初期化(新しい API に切り替えると旧モデル一覧は無効)
            $('#sam-api-models-status').html('<span class="sam-api-status warn">未読み込み(既定の一覧を使用)</span>');
        });
        // プリセットを削除
        $apiModal.off('click.samApiDel').on('click.samApiDel', '.sam-api-btn[data-act="delete-preset"]', function() {
            var name = ($('#sam-api-preset-sel option:selected').text() || '').trim();
            if (!name) { samToast('warn', '先に削除するプリセットを選択してください'); return; }
            samConfirm('プリセットを削除', 'プリセット「' + name + '」を削除しますか?この操作は取り消せません。', function() {
                saveApiConfig(function(cfg) {
                    var idx = (cfg.apiPresets || []).findIndex(function(p){ return p.name === name; });
                    if (idx >= 0) cfg.apiPresets.splice(idx, 1);
                    cfg.fetchedModels = [];   // プリセット削除と同時に読み込み済みモデルの状態も初期化する
                });
                apiRefreshFields();
                samToast('ok', 'プリセットを削除しました: ' + name);
            });
        });
        // プリセットを保存(ダイアログ内の現在のフィールド値をスナップショットとし, プリセット一覧に書き込み, 同名は上書き)
        $apiModal.off('click.samApiSave').on('click.samApiSave', '.sam-api-btn[data-act="save-preset"]', function() {
            clearTimeout(apiFieldTimer);   // 書き戻し待ちタイマーを解除し, スナップショットが現在の画面の値を読みその後も古い値の書き戻しに上書きされないようにする
            var name = ($('#sam-api-preset-name').val() || '').trim();
            if (!name) { samToast('warn', 'プリセット名を入力してください'); return; }
            var snap = {
                apiUrl: $('[data-field="apiUrl"]', $apiModal).val() || '',
                apiKey: $('[data-field="apiKey"]', $apiModal).val() || '',
                model: $('[data-field="model"]', $apiModal).val() || ''
            };
            saveApiConfig(function(cfg) {
                var idx = (cfg.apiPresets || []).findIndex(function(p){ return p.name === name; });
                var entry = { name: name, apiUrl: snap.apiUrl, apiKey: snap.apiKey, model: snap.model };
                if (idx >= 0) cfg.apiPresets[idx] = entry; else cfg.apiPresets.push(entry);
            });
            apiRefreshFields();
            $('#sam-api-preset-name').val('');
            samToast('ok', 'プリセットを保存しました: ' + name);
        });
        // フィールドのリアルタイム保存(デバウンス + apiUrl 変更時にモデルのドロップダウンを更新; apiFieldTimer は前方で宣言済み)
        $apiModal.off('input.samApiField change.samApiField').on('input.samApiField change.samApiField', '[data-field]', function() {
            var field = $(this).data('field');
            var val = $(this).val() || '';
            clearTimeout(apiFieldTimer);
            apiFieldTimer = setTimeout(function() {
                saveApiConfig(function(cfg) { cfg[field] = val; });
                if (field === 'apiUrl') apiRenderModelSelect(getApiConfig());
            }, 400);
        });
        // モデル一覧を読み込む(非同期で fetch /v1/models, 成功したら fetchedModelsに書き込む)
        $apiModal.off('click.samApiLoad').on('click.samApiLoad', '.sam-api-btn[data-act="load-models"]', function() {
            var $btn = $(this); var $st = $('#sam-api-models-status');
            $btn.prop('disabled', true).text('読み込み中…');
            $st.html('<span class="sam-api-status">モデル一覧を要求しています…</span>');
            var url = ($('[data-field="apiUrl"]', $apiModal).val() || '').trim();
            var key = ($('[data-field="apiKey"]', $apiModal).val() || '').trim();
            saveApiConfig(function(cfg) { cfg.apiUrl = url; cfg.apiKey = key; });
            apiFetchModels().then(function(models) {
                // 成功: 古いモデル + 古い選択をクリア, 一覧は今回の API が返したモデルのみを保持し, "未選択"に戻す
                saveApiConfig(function(cfg) { cfg.fetchedModels = models; cfg.model = ''; });
                var fresh = getApiConfig();
                apiRenderModelSelect(fresh);
                $('[data-field="model"]', $apiModal).val('');
                $st.html('<span class="sam-api-status ok">読み込み済み ' + models.length + ' 個のモデル(選択をリセット)</span>');
                samToast('ok', '読み込み済み ' + models.length + ' 個のモデル, "モデル未選択"にリセットしました');
            }).catch(function(err) {
                $st.html('<span class="sam-api-status err">失敗: ' + esc(err && err.message || String(err)) + '</span>');
                samToast('err', '読み込みに失敗: ' + (err && err.message || err));
            }).then(function() {
                $btn.prop('disabled', false).text('📡 モデル一覧を読み込む');
            });
        });
        // 読み込み済みモデル一覧をクリア(既定のモデル推奨に戻し, 選択もリセット)
        $apiModal.off('click.samApiClear').on('click.samApiClear', '.sam-api-btn[data-act="clear-models"]', function() {
            saveApiConfig(function(cfg) { cfg.fetchedModels = []; cfg.model = ''; });
            apiRenderModelSelect(getApiConfig());
            $('[data-field="model"]', $apiModal).val('');
            $('#sam-api-models-status').html('<span class="sam-api-status warn">未読み込み(既定の一覧を使用)</span>');
            samToast('ok', '読み込み済みモデル一覧をクリアし, "モデル未選択"にリセットしました');
        });
    }

    /* ===== 16. パス解決(読み取り) ===== */
    function resolvePath(obj, path) {
        if (!path) return obj;
        try {
            if (_ && _.get) return _.get(obj, path);
        } catch(e){}
        return path.split('.').reduce(function(o, k) { return (o == null) ? undefined : o[k]; }, obj);
    }

    /* ===== 17. メインレンダリング入口 ===== */
    function renderAll() {
        refreshPlayerName();
        // 再構築前にパネル内の入力欄からフォーカスを外す, ST AutoCompleteが削除済みの入力欄に束縛されてエラーになるのを防ぐ(getBoundingClientRect on null)
        try {
            var _ae = document.activeElement;
            if (_ae && (_ae.tagName === 'INPUT' || _ae.tagName === 'TEXTAREA')) {
                var _pn = document.getElementById('samsara-panel');
                if (_pn && _pn.contains(_ae)) _ae.blur();
            }
        } catch(_e) {}
        var statData = getStatData();
        var $panel = $('#samsara-panel');
        if (!statData || !statData.キャラ) {
            // ターミナル未応答: 上部バーには 更新/閉じる ボタンを引き続き表示(更新は.sam-icon-btn.refreshを再利用, イベントは bindUIEventsで委譲済み)
            $panel.html('<div class="sam-topbar"><div class="tl-info"><div class="tl-time" style="color:var(--sam-sub);">ターミナル未応答</div></div><div class="tl-actions"><div class="sam-icon-btn refresh" title="データを更新">🔄</div><div class="sam-icon-btn close" title="閉じる">✕</div></div></div><div class="sam-empty"><div style="font-size:36px;opacity:0.6;animation:samPulse 2s infinite;">📡</div><div style="margin-top:10px;">因果チェーンはまだ接続されていません...</div><div style="font-size:11px;opacity:0.6;">(新しいシナリオの初期化か時間の進行を待つか, 右上の🔄で更新してください)</div></div>');
            $('#samsara-ball').removeClass('combat-mode');
            // "ターミナル未応答"の場合にのみ5秒の自動更新タイマーを起動; データを受信して正常にレンダリングしたら下部で解除する
            if (!window.samsaraRefreshTimer) {
                window.samsaraRefreshTimer = setInterval(function() {
                    try { if ($('#samsara-panel').hasClass('open') && !isEditMode()) renderAll(); } catch (e) {}
                }, 5000);
            }
            return;
        }
        // データ受信済み: "ターミナル未応答"の自動更新タイマーを解除し, ユーザーのスクロール/操作への影響と無駄な性能消費を避ける
        if (window.samsaraRefreshTimer) { clearInterval(window.samsaraRefreshTimer); window.samsaraRefreshTimer = null; }
        var p = statData.キャラ;
        var sys = statData.システム状態 || {};
        var world = statData.世界 || {};
        // 新規開局の検出: 種族が空 + 身分が空配列 + スペースコインが0 (情報取得後に判定)
        // → キャラの立ち絵 + すべてのNPC立ち絵をクリア(前のプレイのアバターが新しいキャラに残るのを防ぐ)
        try {
            var raceStr = safeStr(p.種族, '');
            var idArr = Array.isArray(p.身分) ? p.身分 : [];
            var coin = safeNum(p.スペースコイン, 0);
            var freshSig = (raceStr === '' && idArr.length === 0 && coin === 0) ? 'FRESH' : 'PLAY';
            if (freshSig === 'FRESH' && lastReincarnatorSig !== 'FRESH') {
                clearAllPortraits();
            }
            lastReincarnatorSig = freshSig;
        } catch(e) {}
        var isCombat = sys.戦闘中 === true;
        if (isCombat) $('#samsara-ball').addClass('combat-mode');
        else $('#samsara-ball').removeClass('combat-mode');

        var editMode = isEditMode();
        var html = '';
        // 上部バー
        html += renderTopbar(world, sys, editMode, statData);
        // 中央のキャラクターバー
        html += renderReincarnatorBar(p, sys, editMode);
        // 下部の状態アイコン列
        html += renderBuffRail(p, editMode);
        // Tab本体
        html += '<div class="sam-main">';
        html += renderTabRail(getCurrentTab());
        html += '<div class="sam-tab-content" id="sam-tab-content"></div>';
        html += '</div>';
        // 編集モードの追加UI
        if (editMode) {
            html += '<div class="sam-edit-badge">編集モード · 数値をクリックするとその場で変更,フォーカスを外すと自動で一時保存</div>';
            html += '<button class="sam-save-btn">💾 保存</button>';
        }
        // 更新前にスクロール位置を保存(panel全体の再構築でコンテナのscrollTopが失われる)
        var $oldContent = $('#sam-tab-content');
        var savedScrollTop = ($oldContent.length ? ($oldContent[0].scrollTop || 0) : 0);
        $panel.html(html);
        renderTabContent(getCurrentTab());
        // 同一Tabの更新: スクロール位置を同期的に復元(再構築後にまず上部を描画してから中央へ跳ぶガタつきを防ぐ)
        // 注: renderTabContent 内で読まれる scrollTop は新しい空コンテナの0なので, ここでの savedScrollTop を使う必要がある
        if (savedScrollTop > 0) {
            var $newContent = $('#sam-tab-content');
            if ($newContent.length) {
                // 設定を同期(内容は入力済みで, 高さは通常すでに確定している); rAFでフォールバックし、レイアウト完了後にもう一度補正する
                try { $newContent[0].scrollTop = savedScrollTop; } catch(e){}
                var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
                if (raf) raf(function(){ try { $newContent[0].scrollTop = savedScrollTop; } catch(e){} });
            }
        }
    }

    function shouldShowSettlementButton(sd) {
        var sys = (sd && sd.システム状態) || {};
        return sys.主神空間滞在中 === false && sys.戦闘中 !== true;
    }

    /* ===== 18. 上部バー ===== */
    function renderTopbar(world, sys, editMode, sd) {
        var time = safeStr(world.時間, '不明な時間');
        var place = safeStr(world.地点, '不明な場所');
        if (editMode) {
            time = editInput('世界.時間', time, 'text');
            place = editInput('世界.地点', place, 'text');
        }
        // 主神空間では「世界選択」を表示；インスタンス内で非戦闘のときは常時「決算任務」を表示し、任務の達成可否は判定しない。
        var worldBtn = '';
        if (sys && sys.主神空間滞在中 === true && sys.戦闘中 !== true) {
            worldBtn = '<div class="sam-icon-btn choose-world" title="世界選択" data-choose-world>🌐世界選択</div>';
        }
        var settlementBtn = '';
        if (shouldShowSettlementButton(sd)) {
            settlementBtn = '<div class="sam-icon-btn choose-world mission-settle" title="決算任務" data-mission-settle>📋決算任務</div>';
        }
        return '<div class="sam-topbar">'
            + '<div class="tl-info"><div class="tl-time">🕒 '+time+'</div><div class="tl-place">📍 '+place+'</div></div>'
            + '<div class="tl-actions">'
            + worldBtn
            + settlementBtn
            + '<div class="sam-icon-btn refresh" title="更新">🔄</div>'
            + '<div class="sam-icon-btn settings '+(editMode?'edit-on':'')+'" title="設定">⚙️</div>'
            + '<div class="sam-icon-btn close" title="閉じる">✕</div>'
            + '</div></div>';
    }

    /* ===== 19. キャラクターバー(左にアバター列+階層/種族/形態 / 右にHP+EP+THPの三列 単色) ===== */
    var SAM_PORTRAIT_KEY = 'samsara_reincarnator_portrait';
    var SAM_NPC_PORTRAIT_PREFIX = 'samsara_npc_portrait_';
    // キャラクター署名: 新規開局(種族が空+身分が空+スペースコイン0)の検出に使用→古い立ち絵をクリア
    var lastReincarnatorSig = null;
    // <details>の折りたたみ状態の記憶: key=summaryのプレーンテキスト, value=true(展開)/false(折りたたみ); 更新をまたいで保持
    var detailsOpenState = {};
    // キャラの立ち絵 + すべてのNPC立ち絵をクリア(localStorage内のSAM_NPC_PORTRAIT_PREFIXで始まるキー)
    function clearAllPortraits() {
        try {
            localStorage.removeItem(SAM_PORTRAIT_KEY);
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf(SAM_NPC_PORTRAIT_PREFIX) === 0) keysToRemove.push(k);
            }
            keysToRemove.forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} });
            try { console.log('%c[主神终端] 🧹 新規開局を検出, すべての古い立ち絵をクリアしました ('+(1+keysToRemove.length)+'個)', 'color:#fbbf24'); } catch(e){}
        } catch(e) { try { console.warn('[主神终端] 立ち絵のクリアに失敗:', e.message); } catch(x){} }
    }
    function getReincarnatorPortrait() {
        try { return localStorage.getItem(SAM_PORTRAIT_KEY) || ''; } catch(e) { return ''; }
    }
    function saveReincarnatorPortrait(dataUrl) {
        try {
            if (dataUrl) localStorage.setItem(SAM_PORTRAIT_KEY, dataUrl);
            else localStorage.removeItem(SAM_PORTRAIT_KEY);
        } catch(e) { try { console.warn('[主神终端] 立ち絵の保存に失敗:', e.message); } catch(x){} }
        closeModal();
        renderAll();
    }
    // NPC立ち絵(localStorage, 名前をキーにする; キャラクターとは独立)
    function getNpcPortrait(name) {
        if (!name) return '';
        try { return localStorage.getItem(SAM_NPC_PORTRAIT_PREFIX + name) || ''; } catch(e) { return ''; }
    }
    function saveNpcPortrait(name, dataUrl) {
        if (!name) return;
        try {
            if (dataUrl) localStorage.setItem(SAM_NPC_PORTRAIT_PREFIX + name, dataUrl);
            else localStorage.removeItem(SAM_NPC_PORTRAIT_PREFIX + name);
        } catch(e) { try { console.warn('[主神终端] NPC立ち絵の保存に失敗:', e.message); } catch(x){} }
        closeModal();
        renderAll();
    }
    // 立ち絵拡大ビューア
    function showPortraitViewer(url, label) {
        var pv = document.getElementById('samsara-portrait-viewer');
        if (!pv || !url) return;
        var img = document.getElementById('sam-pv-img');
        var lbl = document.getElementById('sam-pv-label');
        if (img) img.src = url;
        if (lbl) lbl.textContent = label || '';
        pv.classList.add('show');
    }
    // カスタム立ち絵アップロードダイアログ(キャラ/NPC共通; nameが角色のときはSAM_PORTRAIT_KEYに保存, それ以外はNPCキーに保存)
    function openPortraitUpload(name) {
        var isReincarnator = (!name || name === 'キャラ');
        var title = isReincarnator ? 'カスタムキャラ立ち絵' : ('カスタム立ち絵 · ' + name);
        var body = '<div style="display:flex;gap:8px;margin-bottom:10px;">'
            + '<input type="text" id="sam-portrait-url" placeholder="画像URLを貼り付け..." style="flex:1;font-size:13px;padding:8px;background:var(--sam-input-bg);color:var(--sam-text);border:1px solid var(--sam-border);border-radius:3px;">'
            + '</div>'
            + '<div style="display:flex;gap:8px;">'
            + '<button type="button" id="sam-portrait-url-btn" style="flex:1;padding:8px;cursor:pointer;background:var(--sam-accent);color:#fff;border:none;border-radius:3px;font-weight:bold;">📥 リンクを読み込む</button>'
            + '<button type="button" id="sam-portrait-file-btn" style="flex:1;padding:8px;cursor:pointer;background:var(--sam-accent);color:#fff;border:none;border-radius:3px;font-weight:bold;">📂 ファイルを選択</button>'
            + '</div>'
            + '<input type="file" id="sam-portrait-file" accept="image/*" style="display:none;">'
            + '<div style="margin-top:10px;"><button type="button" id="sam-portrait-clear-btn" style="width:100%;padding:8px;cursor:pointer;background:rgba(40,15,10,0.6);color:var(--sam-hp);border:1px solid var(--sam-border);border-radius:3px;font-weight:bold;">🗑️ カスタム立ち絵をクリア</button></div>'
            + '<div style="margin-top:8px;font-size:11px;color:var(--sam-sub);">ローカル画像にサイズ制限はありません(ブラウザのストレージ上限のみに従います)。</div>';
        showModal(title, body);
        var doSave = function(u) { isReincarnator ? saveReincarnatorPortrait(u) : saveNpcPortrait(name, u); };
        $('#sam-portrait-url-btn').off('click.samPt').on('click.samPt', function() {
            var u = ($('#sam-portrait-url').val() || '').trim();
            if (!u) return;
            doSave(u);
        });
        $('#sam-portrait-file-btn').off('click.samPt').on('click.samPt', function() { $('#sam-portrait-file').click(); });
        $('#sam-portrait-file').off('change.samPt').on('change.samPt', function() {
            var f = this.files && this.files[0];
            if (!f) return;
            var rd = new FileReader();
            rd.onload = function(ev) { doSave(ev.target.result); };
            rd.readAsDataURL(f);
        });
        $('#sam-portrait-clear-btn').off('click.samPt').on('click.samPt', function() { doSave(''); });
    }
    function openReincarnatorPortraitUp() { openPortraitUpload('キャラ'); }
    function renderReincarnatorBar(p, sys, editMode) {
        var maxHp = safeNum(p.HP_MAX, 1), curHp = safeNum(p.HP, 0), curThp = safeNum(p.THP, 0);
        var maxEp = safeNum(p.EP_MAX, 1), curEp = safeNum(p.EP, 0);
        var hpPct = Math.min(100, Math.max(0, (curHp/maxHp)*100));
        var epPct = Math.min(100, Math.max(0, (curEp/maxEp)*100));
        // 注: THP は一時シールド/追加ライフ値で, 上限の概念がなく, プログレスバーを描画せず, 数値のみを表示する
        // 階層表示: 形態が有効かつ形態の階層>自身のときは形態の階層を表示(表示のみ); 編集欄は引き続き実際の自身の階層に束縛し書き戻しの汚染を防ぐ
        var dispRaw = displayTierRaw(p);
        var tier = tierRomanOf(dispRaw); var tierQ = tierQOfClass(dispRaw);
        var ownTier = tierRomanOf(p.階層);   // 編集モードの入力欄には実際の自身の階層を使う
        var race = safeStr(p.種族, '人類');
        var cf = p.現在形態 || {};
        var formActive = (cf.激活 === true && safeStr(cf.名称));
        // 戦闘状態バッジ: 通常は非表示, 戦闘突入時(システム状態.戦闘中)に表示, 現在のラウンド数を付記
        var combatBadge = '';
        if (sys && sys.戦闘中 === true) {
            var combatRound = safeNum(sys.現在ラウンド, 0);
            combatBadge = '<div class="sam-reincarnator-combat">⚔️ 戦闘中'+(combatRound > 0 ? ' · 第'+combatRound+'ラウンド' : '')+'</div>';
        }
        // 上部レイアウト: 縦四行 戦闘バッジ(戦闘時) / 階層 / 種族 / 形態ラベル(有効時)
        var tierField = (editMode && !isReadonlyPath('キャラ.階層')) ? editInput('キャラ.階層', ownTier, 'text') : '<span class="sam-reincarnator-tier-num">'+esc(tier)+'</span><span class="sam-reincarnator-tier-suf">級</span>';
        var raceField = editMode ? editInput('キャラ.種族', race, 'text') : esc(race);
        var formField = '';
        if (formActive) {
            // 現在の形態は能力パネルの"有効化ボタン"が一括管理するため, 変更モードでも名前は手動編集できない
            formField = '<div class="sam-reincarnator-form">🌀 <span class="sam-reincarnator-form-name">'+esc(safeStr(cf.名称))+'</span></div>';
        }
        // アバター: カスタム立ち絵を優先, なければプレースホルダー; 画像の有無にかかわらず, 枠をクリックするとカスタム立ち絵ダイアログを表示
        var portraitUrl = getReincarnatorPortrait();
        if (portraitUrl) {
            var avatarHtml = '<div class="sam-avatar" data-portrait="'+esc(portraitUrl)+'">'
                + '<img src="'+esc(portraitUrl)+'" alt="立ち絵">'
                + '</div>';
        } else {
            var avatarHtml = '<div class="sam-avatar empty">'
                + '<div class="sam-ava-ph"><span class="sam-ava-ico">📷</span><span class="sam-ava-hint">クリックで<br>立ち絵を設定</span></div>'
                + '</div>';
        }
        // HP/EP/THP の三列(編集モードでは数値を変更可能,HP_MAX/EP_MAXは読み取り専用)
        var hpNum = editMode ? editInput('キャラ.HP', curHp, 'number') : (curHp + ' / ' + maxHp);
        var epNum = editMode ? editInput('キャラ.EP', curEp, 'number') : (curEp + ' / ' + maxEp);
        var thpNum = editMode ? editInput('キャラ.THP', curThp, 'number') : curThp;
        return '<div class="sam-reincarnator">'
            + '<div class="sam-reincarnator-left">'+avatarHtml
            + '<div class="sam-reincarnator-text">'+combatBadge
            + '<div class="sam-reincarnator-tier q-'+tierQ+'">'+tierField+'</div>'
            + '<div class="sam-reincarnator-race">'+raceField+'</div>'
            + formField+'</div></div>'
            + '<div class="sam-reincarnator-bars">'
            + '<div class="stat-bar-box"><div class="stat-labels"><span style="color:var(--sam-hp)">HP</span><span>'+hpNum+'</span></div><div class="bar-track"><div class="bar-fill fill-hp" style="width:'+hpPct+'%;"></div></div></div>'
            + '<div class="stat-bar-box"><div class="stat-labels"><span style="color:var(--sam-ep)">EP</span><span>'+epNum+'</span></div><div class="bar-track"><div class="bar-fill fill-ep" style="width:'+epPct+'%;"></div></div></div>'
            + '<div class="sam-thp-row"><div class="stat-labels"><span style="color:var(--sam-thp)">THP (一時シールド/追加ライフ値)</span><span>'+thpNum+'</span></div></div>'
            + '</div></div>';
    }

    /* ===== 20. 状態ボタン列(状態名+持続時間, クリックで二次詳細を表示) ===== */
    function renderBuffRail(p, editMode) {
        var buffs = p.状態 || {};
        var keys = Object.keys(buffs);
        // 状態がないときはプレースホルダーを描画せず, そのまま空を返す
        if (keys.length === 0) return '';
        var chips = '';
        keys.forEach(function(k) {
            var b = buffs[k] || {};
            var type = safeStr(b.タイプ, 'バフ');
            var dur = safeStr(b.持続, '');
            var path = 'キャラ.状態.'+k;
            // ボタン表示: 状態名 + 持続時間(あれば)
            var durHtml = dur ? '<span class="sam-buff-dur">⏳ '+esc(dur)+'</span>' : '';
            var label = (editMode ? '📝 ' : '') + esc(k);
            // 編集モード: 削除ボタンを追加(sam-fc-del-btn イベントを再利用 → 二次確認 → MVU に書き戻して削除 → 更新; stopPropagationで詳細ダイアログの誤発動を防ぐ)
            var delBtn = editMode ? '<button type="button" class="sam-fc-del-btn sam-buff-del" data-del-path="'+esc(path)+'" title="この状態を削除">✕</button>' : '';
            chips += '<div class="sam-buff-chip '+esc(type)+(editMode?' is-edit':'')+'" data-path="'+esc(path)+'" data-name="'+esc(k)+'">'
                + '<span class="sam-buff-name">'+label+'</span>'+durHtml+delBtn+'</div>';
        });
        return '<div class="sam-buff-rail">'+chips+'</div>';
    }

    /* ===== 21. Tabナビゲーション ===== */
    function renderTabRail(curTab) {
        var tabs = [
            {key:'mission', label:'任務', icon:'📜'},
            {key:'info', label:'情報', icon:'📋'},
            {key:'hold', label:'所持', icon:'🎒'},
            {key:'blood', label:'能力', icon:'🧬'},
            {key:'relation', label:'関係', icon:'👥'},
            {key:'asset', label:'経営', icon:'🏗️'},
            {key:'rumor', label:'噂', icon:'📰'},
            {key:'world', label:'世界', icon:'🌍'},
            {key:'shop', label:'ショップ', icon:'🛒'}
        ];
        var html = '<div class="sam-tab-rail">';
        tabs.forEach(function(t) {
            html += '<div class="sam-tab-btn '+(t.key===curTab?'active':'')+'" data-tab="'+t.key+'">'+t.icon+'<br>'+t.label+'</div>';
        });
        html += '</div>';
        return html;
    }

    /* ===== 22. Tab内容ルーティング =====
       同一Tabの更新(切り替え以外)ではスクロール位置を保持; Tab切り替え時は先頭に戻る */
    var lastRenderedTab = null;
    function renderTabContent(tab) {
        var $c = $('#sam-tab-content');
        if (!$c.length) return;
        var sameTab = (tab === lastRenderedTab);
        var savedScroll = sameTab ? ($c[0].scrollTop || 0) : 0;
        var sd = getStatData();
        if (!sd) { $c.html('<div class="sam-empty">データなし</div>'); lastRenderedTab = tab; return; }
        var html = '';
        switch (tab) {
            case 'mission': html = renderMissionTab(sd); break;
            case 'info': html = renderInfoTab(sd); break;
            case 'hold': html = renderHoldTab(sd); break;
            case 'blood': html = renderBloodTab(sd); break;
            case 'relation': html = renderRelationTab(sd); break;
            case 'asset': html = renderAssetTab(sd); break;
            case 'rumor': html = renderRumorTab(sd); break;
            case 'world':
                var activeWorldEngine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
                html = (activeWorldEngine && typeof activeWorldEngine.isConfigured === 'function' && activeWorldEngine.isConfigured())
                    ? '<div class="sam-empty">世界進行が有効です。左側の「世界」をクリックして独立世界エンジンに入ってください。</div>'
                    : renderWorldTab(sd);
                break;
            case 'shop': html = renderShopTab(sd); break;
            default: html = '<div class="sam-empty">不明なTab</div>';
        }
        $c.html(html);
        // <details>の折りたたみ状態を復元: summaryのテキスト(件数のかっこを除去)でdetailsOpenStateを引き, 既定のopenを上書きする
        // 同期実行が必要(スクロール復元の前), open属性はreflowのタイミングに依存しないため
        if (Object.keys(detailsOpenState).length) {
            $c.find('details').each(function() {
                var $d = $(this);
                var raw = $d.children('summary').first().text().trim();
                var key = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
                if (key && Object.prototype.hasOwnProperty.call(detailsOpenState, key)) {
                    $d.prop('open', !!detailsOpenState[key]);
                }
            });
        }
        // 同一Tabの更新: スクロール位置を同期的に復元(Tab切り替え時はsameTab=falseで, 自然に先頭を維持)
        // 注: renderAllの経路ではここでsavedScroll=0(新しい空コンテナ), 復元はrenderAllがsavedScrollTopで処理する
        if (sameTab && savedScroll > 0) {
            try { $c[0].scrollTop = savedScroll; } catch(e){}
        }
        lastRenderedTab = tab;
    }

    /* ===== 23. Tab: 任務 ===== */
    /* 副本実績の難易度: 1~6星に固定, どの値も強制的に★の数へ正規化(数字1~6 または ★の個数を数える, 範囲外は切り捨て, ★なしは既定で1星) */
    function achDiffStars(v) {
        var s = safeStr(v, '').trim();
        var n = /^[1-6]$/.test(s) ? parseInt(s, 10) : (s.match(/★/g) || []).length;
        if (n < 1) n = 1;
        if (n > 6) n = 6;
        return '★★★★★★'.slice(0, n);
    }
    function renderMissionTab(sd) {
        var m = sd.任務 || {};
        var list = m.リスト || {};
        var kills = m.撃破 || {};
        var isSingleWorld = (sd.設定 && sd.設定.単一世界 === true);
        var editMode = isEditMode();
        var html = '';
        // 任務一覧
        var tHtml = '';
        var listKeys = Object.keys(list);
        var taskDoneCnt = 0;   // 引渡可能/決算可能 は完了として数える
        var taskFailCnt = 0;   // 失敗 は別途数える
        if (listKeys.length === 0) tHtml += '<div class="sam-empty">[任務なし]</div>';
        else {
            tHtml += '<div class="sam-list-1col">';
            listKeys.forEach(function(k) {
                var q = list[k] || {};
                var path = '任務.リスト.'+k;
                // 難易度バッジ(任務カードのタイトル右端に表示): 品質のカラーパレットを使い, sam-fc-q スタイルを再利用; 難易度がないときは描画しない
                var diffRaw = safeStr(q.難易度, '');
                var diffQ = parseRarity(diffRaw);
                var diffBadge = diffRaw ? '<div class="sam-fc-q q-'+diffQ+'" title="難易度">'+esc(diffQ)+'</div>' : '';
                // 編集モード: タイトル部に削除ボタンを追加( data-del-pathを付け, 汎用の削除イベントを再利用)
                var delBtn = editMode ? samDelBtn(path, editMode, 'この任務を削除') : '';
                var headExtra = delBtn + diffBadge;
                // 状態行: editSelect/editInput はHTMLを返すので, fcRowを通してはいけない(二重エスケープで文字化けする)
                var statusVal = safeStr(q.状態, '進行中');
                if (statusVal === '提出可能' || statusVal === '決算可能') taskDoneCnt++;
                else if (statusVal === '失败') taskFailCnt++;
                var statusCell = editMode
                    ? editSelect(path+'.状態', ['進行中','提出可能','決算可能','失败'], statusVal)
                    : esc(statusVal);
                var statusRow = '<div class="sam-row"><span class="k">状態</span><span class="v">'+statusCell+'</span></div>';
                var rows = '';
                rows += fcRow('依頼主', q.依頼元, path+'.依頼元', editMode);
                rows += statusRow;
                rows += fcRow('目標', q.目標, path+'.目標', editMode);
                rows += fcRow('報酬', q.報酬, path+'.報酬', editMode);
                rows += fcRow('納品', q.納品, path+'.納品', editMode);
                var body = fcRow('ペナルティ', q.罰則, path+'.罰則', editMode);
                tHtml += fullCard('', k, rows, body, headExtra);
            });
            tHtml += '</div>';
        }
        var taskTitle = '📜 任務一覧 (達成 '+taskDoneCnt+'/'+listKeys.length+')';
        if (taskFailCnt > 0) taskTitle += ' · 失敗 '+taskFailCnt;
        html += secBlock(taskTitle, tHtml, listKeys.length > 0);
        // 単一世界では副本実績を完全に非表示；マルチワールドモードでは通常どおり表示し、初回達成報酬を即時付与する
        if (!isSingleWorld) {
            var ach = m.インスタンス実績 || {};
            var achKeys = Object.keys(ach);
            var achDoneCnt = 0;
            achKeys.forEach(function(k) {
                var st = safeStr(ach[k] && ach[k].状態);
                if (st === '達成済み') achDoneCnt++;
            });
            var aHtml = '';
            if (achKeys.length === 0) {
                aHtml += '<div class="sam-empty">[副本実績なし]</div>';
            } else {
                aHtml += '<div class="sam-list-1col">';
                achKeys.forEach(function(k) {
                    var a = ach[k] || {};
                    var path = '任務.インスタンス実績.'+k;
                    var statusVal = safeStr(a.状態, '未達成') || '未達成';
                    var done = statusVal === '達成済み';
                    // 編集モード: タイトル部に削除ボタンを追加( data-del-pathを付け, 汎用の削除イベントを再利用)
                    var delBtn = editMode ? samDelBtn(path, editMode, 'この実績を削除') : '';
                    // 達成済み: ヘッダーに金色の✓バッジ + カードに金の枠線(達成状況が一目でわかる)
                    var doneChip = done ? '<span class="sam-ach-done-chip">✓ '+esc(statusVal)+'</span>' : '';
                    var headExtra = delBtn + doneChip;
                    // 状態行: editSelect はHTMLを返すので, fcRowを通してはいけない(二重エスケープで文字化けする)
                    var statusCell = editMode
                        ? editSelect(path+'.状態', ['未達成','達成済み'], statusVal)
                        : esc(statusVal);
                    var statusRow = '<div class="sam-row"><span class="k">状態</span><span class="v">'+statusCell+'</span></div>';
                    var rows = '';
                    rows += statusRow;
                    // 難易度: ★~★★★★★★ の六段階ドロップダウンに固定(編集時は★の数を書き戻す), 表示は★の数を強制
                    var diffVal = achDiffStars(a.難易度);
                    var diffCell = editMode
                        ? editSelect(path+'.難易度', ['★','★★','★★★','★★★★','★★★★★','★★★★★★'], diffVal)
                        : esc(diffVal);
                    rows += '<div class="sam-row"><span class="k">難易度</span><span class="v">'+diffCell+'</span></div>';
                    rows += fcRow('報酬', a.報酬, path+'.報酬', editMode);
                    var body = fcRow('説明', a.説明, path+'.説明', editMode);
                    aHtml += '<div class="sam-ach-item'+(done?' done':'')+'">'+fullCard('', k, rows, body, headExtra)+'</div>';
                });
                aHtml += '</div>';
            }
            html += secBlock('🏅 副本実績 (達成 '+achDoneCnt+'/'+achKeys.length+')', aHtml, achKeys.length > 0);
        }
        // 撃破統計(キーはローマ数字Ⅰ~ⅨでMVUデータベースを読む; CSSの着色クラスは対応する品質文字F~SSS)
        var kHtml = '<div class="sam-grid">';
        ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'].forEach(function(q) {
            var v = safeNum(kills[q], 0);
            var path = '任務.撃破.'+q;
            var qc = tierQOfClass(q);       // ローマ数字→品質文字(F~SSS)をCSSの着色クラスに使用
            kHtml += '<div class="sam-card q-'+qc+'"><div class="sam-card-title">'+q+'</div><div class="sam-card-meta">'+(editMode ? editInput(path, v, 'number') : v)+' 撃破</div></div>';
        });
        kHtml += '</div>';
        // 撃破報酬の説明(派生属性のダメージ軽減率の説明パネルのスタイルを参考)
        kHtml += '<div style="margin-top:8px;padding:8px 10px;background:var(--sam-hover);border:1px solid var(--sam-border);border-left:3px solid var(--sam-accent);border-radius:6px;font-size:11px;line-height:1.7;color:var(--sam-sub);">'
            + '<div style="color:var(--sam-accent);font-weight:bold;margin-bottom:3px;">💰 撃破報酬の説明</div>'
            + '<div>目標が自身の階層より <b style="color:var(--sam-text);">-2級</b> 低い撃破は記録されません</div>'
            + '<div style="margin-top:3px;">各階位の撃破単価（スペースコイン）：</div>'
            + '<div style="color:var(--sam-text);margin-top:2px;letter-spacing:0.3px;">Ⅰ:10　Ⅱ:50　Ⅲ:250　Ⅳ:1200　Ⅴ:5000　Ⅵ:2万　Ⅶ:8万　Ⅷ:32万　Ⅸ:128万</div>'
            + '<div style="margin-top:3px;">撃破報酬 = Σ(単価 × 撃破数)、上限は任務の基礎収益 × 10</div>'
            + (!isSingleWorld ? '<div style="margin-top:3px;">世界を跨ぐ追加収益：<b style="color:var(--sam-text);">世界探索</b>(上限×300%) と <b style="color:var(--sam-text);">勢力の絆</b>(上限×300%) の付加収益は通常、撃破報酬を上回ります</div>' : '')
            + '</div>';
        html += secBlock('⚔️ 撃破統計', kHtml);
        return html;
    }

    /* 階層プログレスバー: 通常昇格はキャラクター自身の階層のみを参照する；段位累計が24以上になると試練か源力注入の二経路を選べる。 */
    function validateTrialAdvancement(sd, expectedNext) {
        if (!sd || !sd.キャラ) return {error:'キャラクターデータが未準備です'};
        var sys = sd.システム状態 || {};
        if (sys.戦闘中 === true) return {error:'戦闘中は昇格できません'};
        if (sys.試練完了 !== true) return {error:'試練がまだ決算完了していないか、今回の昇格資格はすでに使用済みです'};
        var current = normalizeLifeTier(sd.キャラ.階層);
        var index = TIER_ROMAN.indexOf(current);
        if (index < 0 || index >= TIER_ROMAN.length - 1) return {error:'現在の階層ではこれ以上昇格できません'};
        var next = TIER_ROMAN[index + 1];
        if (expectedNext && expectedNext !== next) return {error:'階層が変化しました。更新後にもう一度お試しください'};
        return {currentTier:current,nextTier:next};
    }
    function renderTierProgressBar(p, fa, sys) {
        var lifeTier = normalizeLifeTier(p && p.階層);
        var curTier = tierQOfClass(lifeTier);
        var attrs = fa || p.最終属性 || {};
        var score = calcTrialScore(attrs, lifeTier);
        var idx = TIER_ROMAN.indexOf(lifeTier);
        if (idx < 0) idx = 0;
        var isMax = (idx >= TIER_ROMAN.length - 1);
        var pct = isMax ? 100 : Math.max(0, Math.min(100, Math.floor((score / TRIAL_SCORE_THRESHOLD) * 100)));
        var advBtnHtml = '';
        var st = sys || {};
        var canTrial = (st.是否可试炼 === true);
        var trialDone = (st.试炼已完成 === true);
        if (!isMax && trialDone) {
            advBtnHtml = '<button type="button" class="sam-tier-adv-btn start" data-tier-act="start" data-tier-next="'+esc(TIER_ROMAN[idx+1])+'">✦ 昇格開始</button>';
        } else if (!isMax && canTrial) {
            advBtnHtml = '<div class="sam-tier-actions">'
                + '<button type="button" class="sam-tier-adv-btn apply" data-tier-act="apply" data-tier-next="'+esc(TIER_ROMAN[idx+1])+'">☠ 昇格申請</button>'
                + '<button type="button" class="sam-tier-infuse-btn" data-tier-target="キャラ">✧ 源力注入</button>'
                + '</div>';
        }
        var leftHtml = '<div class="sam-tier-side q-'+curTier+'">'+esc(TIER_ROMAN[idx])+'</div>';
        var rightHtml = isMax
            ? '<div class="sam-tier-side max">MAX</div>'
            : '<div class="sam-tier-side next q-'+TIER_QUALITY[idx+1]+'">'+esc(TIER_ROMAN[idx+1])+'</div>';
        var midHtml = '<div class="sam-tier-mid">'
            + '<div class="sam-tier-sum"><span>段位累計</span><span class="v">'+score+' / '+TRIAL_SCORE_THRESHOLD+'</span></div>'
            + '<div class="sam-tier-bar"><div class="bar-fill" style="width:'+pct+'%;"></div></div>'
            + advBtnHtml
            + '</div>';
        return '<div class="sam-tier-prog">'+leftHtml+midHtml+rightHtml+'</div>';
    }

    /* 仲間の段位累計：24ポイント到達で源力注入を提供する。NPC専用の試練状態は作成しない。 */
    function renderNpcTierProgressBar(n, name) {
        if (!n || n.仲間 !== true) return '';
        var lifeTier = normalizeLifeTier(n.階層);
        var idx = TIER_ROMAN.indexOf(lifeTier);
        if (idx < 0) idx = 0;
        var isMax = (idx >= TIER_ROMAN.length - 1);
        var score = calcTrialScore(n.最終属性 || {}, lifeTier);
        var pct = isMax ? 100 : Math.max(0, Math.min(100, Math.floor((score / TRIAL_SCORE_THRESHOLD) * 100)));
        var btn = (!isMax && score >= TRIAL_SCORE_THRESHOLD)
            ? '<button type="button" class="sam-tier-infuse-btn" data-tier-target="'+esc(name)+'">✧ 源力注入</button>'
            : '';
        var left = '<div class="sam-tier-side q-'+TIER_QUALITY[idx]+'">'+esc(lifeTier)+'</div>';
        var right = isMax
            ? '<div class="sam-tier-side max">MAX</div>'
            : '<div class="sam-tier-side next q-'+TIER_QUALITY[idx+1]+'">'+esc(TIER_ROMAN[idx+1])+'</div>';
        var mid = '<div class="sam-tier-mid">'
            + '<div class="sam-tier-sum"><span>段位累計</span><span class="v">'+score+' / '+TRIAL_SCORE_THRESHOLD+'</span></div>'
            + '<div class="sam-tier-bar"><div class="bar-fill" style="width:'+pct+'%;"></div></div>'
            + (btn ? '<div class="sam-tier-actions">'+btn+'</div>' : '')
            + '</div>';
        return '<div class="sam-tier-prog npc">'+left+mid+right+'</div>';
    }

    /* ===== 24. Tab: 情報(キャラクター詳細) ===== */
    function renderInfoTab(sd) {
        var p = sd.キャラ || {};
        var editMode = isEditMode();
        var html = '';
        // キャラクター情報
        var infoHtml = '';
        var fields = [
            {k:'身分', path:'キャラ.身分', type:'text', arr:true}
        ];
        fields.forEach(function(f) {
            var v = resolvePath(sd, f.path);
            var display;
            if (f.readonly || isReadonlyPath(f.path)) {
                display = '<span class="sam-edit-readonly">'+esc(Array.isArray(v)?v.join('/'):v)+'</span>';
            } else if (editMode) {
                var val = f.arr ? (Array.isArray(v) ? v.join(',') : safeStr(v)) : v;
                display = editInput(f.path, val, f.type);
            } else {
                display = esc(Array.isArray(v) ? v.join(' / ') : safeStr(v));
            }
            infoHtml += '<div class="sam-row"><span class="k">'+esc(f.k)+'</span><span class="v">'+display+'</span></div>';
        });
        // ★ 職業: 記録オブジェクト {职业名:{类型,特性[],来源}}に変更; 表示時は折りたたみパネル, 編集時は構造化エディタ
        html += secBlock('📋 キャラクター情報', infoHtml);
        {
            var occ = resolvePath(sd, 'キャラ.職業');
            if (editMode && !isReadonlyPath('キャラ.職業')) {
                html += secBlock('🎖 職業', occupationEditHtml(occ, 'キャラ.職業'));
            } else if (occupationNames(occ).length) {
                html += occupationCardsHtml(occ);
            }
        }
        // 最終属性 - 基础属性/補正値/衍生属性の三パネルに分割(読み取り専用,システム計算)
        var fa = p.最終属性 || {};
        var lifeTier = displayTierRaw(p); // 段位表示階層: 形態が発動中で形態階層がより高い場合は形態階層を, そうでなければ自身の階層を取得
        // 1.基础属性(6項目) - 各数値の右側に現在階層の段位バッジを付加(F~SSS, 現在階層の範囲を9等分して判定)
        var baseHtml = '<div class="sam-grid-2">';
        ['筋力','敏捷','体力','精神','魅力'].forEach(function(an) {
            var v = safeNum(fa[an], 0);
            var path = 'キャラ.最終属性.'+an;
            var valCell = (editMode && !isReadonlyPath(path) ? editInput(path, v, 'number') : '<span class="sam-edit-readonly">'+v+'</span>');
            // 段位バッジ: 現在階層における単一属性値の段位スコア→品質文字(F~SSS)を取得し, sam-fc-q の配色スタイルを再利用
            var score = attrTierScore(v, lifeTier);
            var q = scoreToQuality(score);
            var tierBadge = '<span class="sam-fc-q q-'+q+'" title="現在の階層段位" style="margin-left:6px;">'+esc(q)+'</span>';
            baseHtml += '<div class="sam-row"><span class="k">'+esc(an)+'</span><span class="v">'+valCell+tierBadge+'</span></div>';
        });
        baseHtml += '</div>';
        // 階層プログレスバー: 現在階層(角色.階層由来,読み取り専用) → 次階層; 中央に基础属性の合計ポイントと進捗を表示
        html += renderTierProgressBar(p, fa, sd.システム状態 || {});
        html += secBlock('💪 基础属性', baseHtml);
        // 2.補正値(6項目)
        var modHtml = '<div class="sam-grid-2">';
        ['力量修正','敏捷修正','体质修正','精神修正','魅力修正'].forEach(function(an) {
            var v = safeNum(fa[an], 0);
            var path = 'キャラ.最終属性.'+an;
            modHtml += '<div class="sam-row"><span class="k">'+esc(an)+'</span><span class="v">'+(editMode && !isReadonlyPath(path) ? editInput(path, v, 'number') : '<span class="sam-edit-readonly">'+v+'</span>')+'</span></div>';
        });
        modHtml += '</div>';
        html += secBlock('✨ 補正値', modHtml);
        // 3.衍生属性
        var derHtml = '<div class="sam-grid-2">';
        // 衍生属性: データキー(key, 補助計算スクリプトが書き込むフィールドと一致) + 表示名(label, 日本語サフィックス付き)
        var derList = [
            {key:'DEF', label:'DEF(物理防御)'},
            {key:'MDEF', label:'MDEF(魔法防御)'},
            {key:'物理軽減率', label:'物理軽減率'},
            {key:'魔法軽減率', label:'魔法軽減率'},
            {key:'AP', label:'AP(魔法増幅)'},
            {key:'先制DC', label:'先制DC'},
            {key:'防御DC', label:'防御DC'}
        ];
        derList.forEach(function(item) {
            var key = item.key, label = item.label;
            var v = safeNum(fa[key], 0);
            var unit = (key === 'AP' || key.indexOf('减伤率')>=0) ? '%' : '';
            var path = 'キャラ.最終属性.'+key;
            derHtml += '<div class="sam-row"><span class="k">'+esc(label)+'</span><span class="v">'+(editMode && !isReadonlyPath(path) ? editInput(path, v, 'number') : '<span class="sam-edit-readonly">'+v+unit+'</span>')+'</span></div>';
        });
        derHtml += '</div>';
        // 3b. 武器攻撃(衍生属性に統合, 軽減率説明の上; 非武装の常時表示+装備中の武器; ATK/MATKは二行)
        var wpn = fa.武器 || {};
        derHtml += '<div class="sam-wpn-divider">⚔ 武器攻撃</div>';
        derHtml += '<div class="sam-wpn-list">';
        derHtml += '<div class="sam-wpn-row base"><div class="sam-wpn-name">非武装</div><div class="sam-wpn-stat atk">ATK(物理) <b>'+safeNum(wpn.无武装 && wpn.无武装.ATK, 0)+'</b></div><div class="sam-wpn-stat matk">MATK(魔法) <b>'+safeNum(wpn.无武装 && wpn.无武装.MATK, 0)+'</b></div></div>';
        Object.keys(wpn).forEach(function(name) {
            if (name === '无武装') return;
            var w = wpn[name] || {};
            derHtml += '<div class="sam-wpn-row"><div class="sam-wpn-name">⚔ '+esc(name)+'</div><div class="sam-wpn-stat atk">ATK(物理) <b>'+safeNum(w.ATK, 0)+'</b></div><div class="sam-wpn-stat matk">MATK(魔法) <b>'+safeNum(w.MATK, 0)+'</b></div></div>';
        });
        derHtml += '</div>';
        // 軽減率説明ラベル: 上限と各階位の最大防御基準
        derHtml += '<div style="margin-top:8px;padding:8px 10px;background:var(--sam-hover);border:1px solid var(--sam-border);border-left:3px solid var(--sam-accent);border-radius:6px;font-size:11px;line-height:1.7;color:var(--sam-sub);">'
            + '<div style="color:var(--sam-accent);font-weight:bold;margin-bottom:3px;">🛡️ ダメージ軽減率の説明</div>'
            + '<div>軽減率上限：<b style="color:var(--sam-text);">75%</b>（超過分は加算されません）</div>'
            + '<div>各階位の最大防御基準（DEF/MDEF が対応値に達すると軽減率が最大）：</div>'
            + '<div style="color:var(--sam-text);margin-top:2px;letter-spacing:0.3px;">Ⅰ:70　Ⅱ:200　Ⅲ:480　Ⅳ:1280　Ⅴ:3300　Ⅵ:9200　Ⅶ:24000　Ⅷ:70000　Ⅸ:150000</div>'
            + '</div>';
        html += secBlock('⚡ 衍生属性', derHtml);
        // 注: "現在形態"欄は削除済み — トップのアバター横に形態名を表示し, アビリティパネルの発動ボタンで一元管理する
        return html;
    }

    /* 戦術パネル装備スロット情報バー: 装備(status=1)のタイプ別装着数 + アイテム(status=1)数を集計し, 現在/上限を表示
       超過(現在>上限)は赤; 満杯(現在==上限かつ上限>0)は青; 特殊(タイプ8)は上限なしで 現在/X を表示 */
    function renderEquipSlotsBar(p) {
        var equips = p.装備 || {};
        var items = p.道具 || {};
        // 装備タイプと上限はモジュール定数 EQUIP_SLOTS由来; アイテム上限は ITEM_SLOT_CAP 由来
        // タイプ別の装着済み数を集計
        var counts = {};
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            if (Number(e.状態) === 1) {
                var t = Number(e.タイプ);
                counts[t] = (counts[t] || 0) + 1;
            }
        });
        // アイテム装着済み数
        var itemCount = 0;
        Object.keys(items).forEach(function(k) {
            if (Number(items[k].状態) === 1) itemCount++;
        });
        var html = '<div class="sam-slots-bar">';
        EQUIP_SLOTS.forEach(function(s) {
            var cur = counts[s.type] || 0;
            var cls = 'sam-slot-chip';
            var right;
            if (s.cap === 0) {
                // 特殊: 上限なし, cur/X を表示 (X=cur自身, 現在の装着数を表す)
                right = cur+'/X';
            } else {
                right = cur+'/'+s.cap;
                if (cur > s.cap) cls += ' over';      // 超過は赤
                else if (cur === s.cap) cls += ' full'; // 満杯は青
            }
            html += '<span class="'+cls+'">'+s.label+' <span class="n">'+right+'</span></span>';
        });
        // アイテム枠 (上限は ITEM_SLOT_CAP由来)
        var iCls = 'sam-slot-chip';
        if (itemCount > ITEM_SLOT_CAP) iCls += ' over';
        else if (itemCount === ITEM_SLOT_CAP) iCls += ' full';
        html += '<span class="'+iCls+'">アイテム <span class="n">'+itemCount+'/'+ITEM_SLOT_CAP+'</span></span>';
        html += '</div>';
        return html;
    }

    /* ===== 25. Tab: 所持(戦術パネル/装備/アイテム/倉庫) =====
       改修: 装備バッグ/アイテムバッグ/倉庫 を折りたたみ欄からトップのサブ Tab(戦術パネル + 三倉)へ変更
       - トップに装備スロット情報バーを常駐 + 4つのサブTab(数量バッジ付き)
       - サブTabの選択はモジュール変数 holdActiveTabに保存し, チャット切替/再描画でも維持
       - 内容領域は現在のサブTabに応じた状態のカード一覧を描画し, 戦闘時の可視性ヒントを付す */
    var holdActiveTab = 'tactical';   // 所持サブTab: tactical|equip|item|storage
    var holdTypeFilter = '';          // 現在のサブTabでのタイプ絞り込み(空='すべて'; サブTab切替時にリセット)
    /* 項目の分類ラベルを取得: 装備はタイプ数値→スロット名(EQUIP_SLOTS); アイテムは文字列タイプフィールド(空→未分類) */
    function holdEntryTypeLabel(val, isEquip) {
        if (isEquip) {
            var t = Number(val && val.タイプ);
            for (var i = 0; i < EQUIP_SLOTS.length; i++) { if (EQUIP_SLOTS[i].type === t) return EQUIP_SLOTS[i].label; }
            return '不明';
        }
        var s = safeStr(val && val.タイプ).trim();
        return s || '未分類';
    }
    /* 現在のサブTabにある項目のタイプ別件数を収集(そのTabに対応する状態で絞り込み)
       戻り値 {counts:{タイプ:件数}, order:[タイプ...]} —— 装備タイプは EQUIP_SLOTS 順が先, アイテムタイプは初出順が後 */
    function holdCollectTypes(sd) {
        var p = sd.キャラ || {};
        var equips = p.装備 || {}, items = p.道具 || {};
        var statuses, useEquip, useItem;
        if (holdActiveTab === 'tactical')      { statuses = [1]; useEquip = true;  useItem = true;  }
        else if (holdActiveTab === 'equip')    { statuses = [0]; useEquip = true;  useItem = false; }
        else if (holdActiveTab === 'item')     { statuses = [0]; useEquip = false; useItem = true;  }
        else                                   { statuses = [2]; useEquip = true;  useItem = true;  }
        var seen = {};
        function add(label, w) {
            if (!seen[label]) seen[label] = { cnt: 0, w: w };
            seen[label].cnt++;
        }
        if (useEquip) Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            if (statuses.indexOf(Number(e.状態)) < 0) return;
            var label = holdEntryTypeLabel(e, true), w = 99;
            for (var i = 0; i < EQUIP_SLOTS.length; i++) { if (EQUIP_SLOTS[i].label === label) { w = i; break; } }
            add(label, w);
        });
        if (useItem) Object.keys(items).forEach(function(k) {
            var it = items[k] || {};
            if (statuses.indexOf(Number(it.状態)) < 0) return;
            add(holdEntryTypeLabel(it, false), 1000 + Object.keys(seen).length);
        });
        var order = Object.keys(seen).sort(function(a, b) { return seen[a].w - seen[b].w; });
        return { counts: seen, order: order };
    }
    /* タイプ絞り込み行HTML: [すべて N] + 既存の各タイプ(件数付き); そのサブTab に項目がなければ行ごと非描画(バッグが空なら非表示)
       副作用あり: 絞り込み値が無効になった(そのタイプの項目が消えた)場合は自動的に'すべて'へ戻す */
    function renderHoldTypeRow(sd) {
        var info = holdCollectTypes(sd);
        var total = 0;
        info.order.forEach(function(l) { total += info.counts[l].cnt; });
        if (total === 0) return '';
        if (holdTypeFilter && !(holdTypeFilter in info.counts)) holdTypeFilter = '';
        var html = '<div class="sam-hold-types">'
            + '<button type="button" class="sam-hold-type'+(holdTypeFilter === '' ? ' active' : '')+'" data-hold-type="">すべて <span class="sam-hold-type-cnt">'+total+'</span></button>';
        info.order.forEach(function(l) {
            html += '<button type="button" class="sam-hold-type'+(holdTypeFilter === l ? ' active' : '')+'" data-hold-type="'+esc(l)+'">'+esc(l)+' <span class="sam-hold-type-cnt">'+info.counts[l].cnt+'</span></button>';
        });
        html += '</div>';
        return html;
    }
    /* タイプ絞り込み辞書: holdTypeFilter が空ならそのまま返す; それ以外は一致タイプの項目のみを含む浅いコピー辞書を生成 */
    function holdFilterByType(dict, isEquip) {
        if (!holdTypeFilter) return dict;
        var out = {};
        Object.keys(dict || {}).forEach(function(k) {
            var v = dict[k] || {};
            if (holdEntryTypeLabel(v, isEquip) === holdTypeFilter) out[k] = v;
        });
        return out;
    }
    function renderHoldTab(sd) {
        var p = sd.キャラ || {};
        var editMode = isEditMode();
        var equips = p.装備 || {};
        var items = p.道具 || {};
        // 辞書内で 状态 が statuses に一致する項目数を集計(サブTabバッジの件数用)
        function countByStatus(dict, statuses) {
            var n = 0;
            Object.keys(dict || {}).forEach(function(k) {
                var st = Number((dict[k] || {}).状態);
                if (statuses.indexOf(st) >= 0) n++;
            });
            return n;
        }
        // 各サブTabの項目数(バッジ用)
        var tCount = countByStatus(equips, [1]) + countByStatus(items, [1]);
        var eCount = countByStatus(equips, [0]);
        var iCount = countByStatus(items, [0]);
        var wCount = countByStatus(equips, [2]) + countByStatus(items, [2]);
        var tabs = [
            {key:'tactical', icon:'🎯', label:'戦術パネル', cnt:tCount},
            {key:'equip',    icon:'⚔️', label:'装備バッグ', cnt:eCount},
            {key:'item',     icon:'🎒', label:'アイテムバッグ', cnt:iCount},
            {key:'storage',  icon:'📦', label:'倉庫', cnt:wCount}
        ];
        // 現在アクティブなサブTabが有効か検証(不正値対策)
        var validKeys = tabs.map(function(t){ return t.key; });
        if (validKeys.indexOf(holdActiveTab) < 0) holdActiveTab = 'tactical';
        var html = '';
        // 装備スロット情報バー(各装備/アイテム の現在装着数/上限, トップに常駐)
        html += renderEquipSlotsBar(p);
        // サブTab列
        html += '<div class="sam-hold-tabs">';
        tabs.forEach(function(t) {
            var active = (t.key === holdActiveTab);
            html += '<button type="button" class="sam-hold-tab'+(active?' active':'')+'" data-hold-tab="'+t.key+'">'
                + '<span class="sam-hold-tab-ico">'+t.icon+'</span>'
                + '<span class="sam-hold-tab-lbl">'+t.label+'</span>'
                + '<span class="sam-hold-tab-cnt'+(t.cnt?'':' zero')+'">'+t.cnt+'</span>'
                + '</button>';
        });
        html += '</div>';
        // 専用分類行: 外側コンテナを常駐(サブTab切替時に差し替え可能), 内部は既存項目のタイプで細分化; そのTabが空なら内容も空で場所を取らない
        html += '<div class="sam-hold-types-wrap" id="sam-hold-types-wrap">'+renderHoldTypeRow(sd)+'</div>';
        // 内容領域: 独立コンテナ, Tab切替時は中身のみ差し替え(Tab列を再構築せず, 行全体のガタつき/ズレを防ぐ)
        html += '<div class="sam-hold-content" id="sam-hold-body">'+renderHoldBody(sd)+'</div>';
        return html;
    }
    /* 所持パネル内容領域: 現在の holdActiveTab に応じた状態のカード一覧 + 戦闘時の可視性ヒントを描画
       Tab列から独立し, サブTab切替時の部分更新に使用(Tab列DOMの再構築を起こさず, ガタつきを解消) */
    function renderHoldBody(sd) {
        var p = sd.キャラ || {};
        var editMode = isEditMode();
        // タイプ絞り込み: holdTypeFilter が非空なら一致タイプの項目のみ残す(元辞書に対する浅いコピーで絞り込み)
        var equips = holdFilterByType(p.装備 || {}, true);
        var items = holdFilterByType(p.道具 || {}, false);
        // [なし]プレースホルダを除去し, 実際のカードHTMLのみ残す(空プレースホルダがgridのセルとして扱われ空白に見えるのを防ぐ)
        function stripEmpty(s){ return (s||'').replace(/<div class="sam-empty">\[なし\]<\/div>/g,'').trim(); }
        function mergeList(htmlA, htmlB, emptyMsg){
            var cards = stripEmpty(htmlA) + stripEmpty(htmlB);
            if (cards === '') return '<div class="sam-empty">'+emptyMsg+'</div>';
            // 所持パネルのカードは常に単列(一行に一枚), 他パネルと共用の sam-card-list 二列レイアウトは使わない
            return '<div class="sam-card-list sam-card-list-1col">'+cards+'</div>';
        }
        var content = '', hint = '';
        if (holdActiveTab === 'tactical') {
            // 戦術パネル: 装着済みの装備(status=1) + 装着済みのアイテム(status=1)
            content = mergeList(
                renderEquipFullList(equips, 'キャラ.装備', editMode, [1]),
                renderItemFullList(items, 'キャラ.道具', editMode, [1]),
                '戦術パネルに何も装備していません'
            );
        } else if (holdActiveTab === 'equip') {
            // 装備バッグ: status=0
            content = mergeList(
                renderEquipFullList(equips, 'キャラ.装備', editMode, [0]),
                '', '装備バッグは空です'
            );
            hint = '戦闘中は AI に不可視';
        } else if (holdActiveTab === 'item') {
            // アイテムバッグ: status=0
            content = mergeList(
                renderItemFullList(items, 'キャラ.道具', editMode, [0]),
                '', 'アイテムバッグは空です'
            );
            hint = '戦闘中は AI に不可視';
        } else {
            // 倉庫: 装備status=2 + アイテムstatus=2
            content = mergeList(
                renderEquipFullList(equips, 'キャラ.装備', editMode, [2]),
                renderItemFullList(items, 'キャラ.道具', editMode, [2]),
                '倉庫には何も保管されていません'
            );
            hint = 'AI に不可視';
        }
        var hintHtml = hint ? '<div class="sam-hold-hint">🔒 '+hint+'</div>' : '';
        return hintHtml + content;
    }
    /* 装備の詳細カード一覧(インライン表示, ポップアップ不使用; 品質はタイトル右側のバッジのみで表示) */
    function renderEquipFullList(equips, basePath, editMode, statuses) {
        var filtered = [];
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            var st = Number(e.状態);
            if (statuses.indexOf(st) >= 0) filtered.push({key:k, val:e});
        });
        if (filtered.length === 0) return '<div class="sam-empty">[なし]</div>';
        var typeMap = ['武器','手袋','頭部','胴','脚部','靴','マント','アクセサリー','世界の遺物'];
        var html = '';
        filtered.forEach(function(it) {
            var e = it.val;
            var st = Number(e.状態);
            var path = basePath+'.'+it.key;
            var q = parseRarity(e.品質);
            var typeStr = typeMap[e.タイプ] || '不明';
            var rows = '';
            rows += fcRow('タイプ', typeStr, path+'.タイプ', false); // 类型は数値列挙, 編集不可
            if (!isCostEmpty(e.消費)) rows += fcRow('コスト', e.消費, path+'.消費', editMode);
            var body = '<div class="sam-fc-body">';
            if (editMode || (Array.isArray(e.タグ) && e.タグ.length > 0)) body += fcBody('タグ', formatTags(e.タグ, path+'.タグ', editMode), 'sam-fc-tags');
            if (e.原始属性 && typeof e.原始属性 === 'object' && Object.keys(e.原始属性).length > 0) {
                body += fcBodyCollapsible('原始属性', formatStatGrid(e.原始属性, 3), 'sam-fc-stats', false);
            }
            body += fcBody('効果', formatEffects(e.効果, path+'.効果', editMode), 'sam-fc-effects');
            var descContent;
            if (editMode && !isReadonlyPath(path+'.説明')) {
                descContent = editInput(path+'.説明', safeStr(e.説明), 'textarea');
            } else {
                descContent = esc(safeStr(e.説明));
            }
            body += fcBody('説明', descContent);
            // 操作ボタン(タイプ8の特殊装備はボタンなし・制限なし); 削除ボタンは編集モードのみ表示
            var btns = equipActionButtons(path, st, Number(e.タイプ), editMode);
            if (btns) body += fcBody('操作', btns, 'sam-fc-actions');
            body += '</div>';
            html += fullCard(q, it.key, rows, body, '');
        });
        return html;
    }
    /* アイテムの詳細カード一覧(インライン表示, ポップアップ不使用; 品質はタイトル右側のバッジのみで表示) */
    function renderItemFullList(items, basePath, editMode, statuses) {
        var filtered = [];
        Object.keys(items).forEach(function(k) {
            var it = items[k] || {};
            var st = Number(it.状態);
            if (statuses.indexOf(st) >= 0) filtered.push({key:k, val:it});
        });
        if (filtered.length === 0) return '<div class="sam-empty">[なし]</div>';
        var html = '';
        filtered.forEach(function(it) {
            var v = it.val;
            var st = Number(v.状態);
            var path = basePath+'.'+it.key;
            var q = parseRarity(v.品質);
            var qty = safeNum(v.数量, 1);
            var rows = '';
            rows += fcRow('タイプ', v.タイプ, path+'.タイプ', editMode);
            rows += fcRow('数量', qty, path+'.数量', editMode, 'number');
            var body = '<div class="sam-fc-body">';
            if (editMode || (Array.isArray(v.タグ) && v.タグ.length > 0)) body += fcBody('タグ', formatTags(v.タグ, path+'.タグ', editMode), 'sam-fc-tags');
            body += fcBody('効果', formatEffects(v.効果, path+'.効果', editMode), 'sam-fc-effects');
            var descContent;
            if (editMode && !isReadonlyPath(path+'.説明')) {
                descContent = editInput(path+'.説明', safeStr(v.説明), 'textarea');
            } else {
                descContent = esc(safeStr(v.説明));
            }
            body += fcBody('説明', descContent);
            body += fcBody('操作', itemActionButtons(path, st, editMode), 'sam-fc-actions');
            body += '</div>';
            html += fullCard(q, it.key, rows, body);
        });
        return html;
    }
    /* スキルの詳細カード一覧(血統Tabで使用; 品質はタイトル右側のバッジのみで表示)
       アクティブ/パッシブ/特殊 の各欄を伸縮可能な<details>に変更, タイトルに件数を表示 */
    function renderSkillFullList(skills, basePath, editMode) {
        var cats = [
            {idx:0, label:'アクティブ'},
            {idx:1, label:'パッシブ'},
            {idx:2, label:'特殊'}
        ];
        var html = '';
        cats.forEach(function(cat) {
            var list = [];
            Object.keys(skills).forEach(function(k) {
                var s = skills[k] || {};
                if (Number(s.タイプ) === cat.idx) list.push({key:k, val:s});
            });
            // ★ そのカテゴリの件数が 0 → 欄ごと非表示(空の折りたたみ欄を描画しない), アビリティパネル/形態カード/NPC詳細で共用
            if (list.length === 0) return;
            // 伸縮可能なグループ, タイトルに件数付き
            html += '<details class="sam-skill-group">';  // 既定は折りたたみ; 折りたたみ記憶を優先して上書き
            html += '<summary>✨ '+cat.label+'スキル ('+list.length+')</summary>';
            html += '<div class="sam-card-list">';
            list.forEach(function(it) {
                var s = it.val;
                var path = basePath+'.'+it.key;
                var q = parseRarity(s.品質);
                var rows = '';
                if (!isCostEmpty(s.消費)) rows += fcRow('コスト', s.消費, path+'.消費', editMode);
                var body = '<div class="sam-fc-body">';
                if (editMode || (Array.isArray(s.タグ) && s.タグ.length > 0)) body += fcBody('タグ', formatTags(s.タグ, path+'.タグ', editMode), 'sam-fc-tags');
                body += fcBody('効果', formatEffects(s.効果, path+'.効果', editMode), 'sam-fc-effects');
                var descContent;
                if (editMode && !isReadonlyPath(path+'.説明')) {
                    descContent = editInput(path+'.説明', safeStr(s.説明), 'textarea');
                } else {
                    descContent = esc(safeStr(s.説明));
                }
                body += fcBody('説明', descContent);
                body += '</div>';
                html += fullCard(q, it.key, rows, body, samDelBtn(path, editMode, 'スキルを削除'));
            });
            html += '</div>';
            html += '</details>';
        });
        return html;
    }

    /* ===== 26. Tab: 血統(血統/形態ライブラリ/スキル) ===== */
    function renderBloodTab(sd) {
        var p = sd.キャラ || {};
        var bl = p.血統 || {};
        var editMode = isEditMode();
        var keys = Object.keys(bl);
        // 血統数の上限: トップの定数 BLOODLINE_CAP(既定3)を使用し, 欄タイトルとショップの上限判定に用いる
        var bloodLimit = BLOODLINE_CAP;
        var html = '';
        // 血統
        var blHtml = '';
        if (keys.length === 0) blHtml += '<div class="sam-empty">[血統なし]</div>';
        else {
            blHtml += '<div class="sam-card-list sam-card-list-1col">';
            keys.forEach(function(k) {
                var b = bl[k] || {};
                var path = 'キャラ.血統.'+k;
                var q = parseRarity(b.品質);
                var rows = '';
                var body = '<div class="sam-fc-body">';
                if (editMode || (Array.isArray(b.タグ) && b.タグ.length > 0)) body += fcBody('タグ', formatTags(b.タグ, path+'.タグ', editMode), 'sam-fc-tags');
                if (b.原始属性 && typeof b.原始属性 === 'object' && Object.keys(b.原始属性).length > 0) {
                    body += fcBodyCollapsible('原始属性', formatStatGrid(b.原始属性, 3), 'sam-fc-stats', false);
                }
                body += fcBody('効果', formatEffects(b.効果, path+'.効果', editMode), 'sam-fc-effects');
                var descContent;
                if (editMode && !isReadonlyPath(path+'.説明')) {
                    descContent = editInput(path+'.説明', safeStr(b.説明), 'textarea');
                } else {
                    descContent = esc(safeStr(b.説明));
                }
                body += fcBody('説明', descContent);
                body += '</div>';
                blHtml += fullCard(q, k, rows, body, samDelBtn(path, editMode, '血統を削除'));
            });
            blHtml += '</div>';
        }
        // ★ 血統融合の入口: プレイヤーの実所持血統数>1の場合のみ表示(インスタンス/遭遇で追加獲得した血統もここで融合可能)
        if (keys.length > 1) {
            blHtml += '<div style="display:flex;justify-content:center;margin-top:12px"><button type="button" class="sam-act-btn sam-blood-fusion-open" style="min-width:160px">🧬 血統融合</button></div>';
        }
        html += secBlock('🧬 血統 ('+keys.length+'/'+bloodLimit+')', blHtml, false);  // 既定は折りたたみ; 折りたたみ記憶を優先して上書き
        // 形態ライブラリ
        var forms = p.形態庫 || {};
        var fkeys = Object.keys(forms);
        var fHtml = '';
        if (fkeys.length === 0) fHtml += '<div class="sam-empty">[形態なし]</div>';
        else {
            fHtml += '<div class="sam-card-list sam-card-list-1col">';
            fkeys.forEach(function(k) {
                var f = forms[k] || {};
                var path = 'キャラ.形態庫.'+k;
                // 形態は階層(Ⅰ~Ⅸ): バッジはローマ数字を表示し, 色階は対応する品質文字(q-class)を使用; 旧品質文字データとも互換
                var _fTierRaw = f.階層 != null ? f.階層 : f.品質;
                var q = { label: tierRomanOf(_fTierRaw), cls: tierQOfClass(_fTierRaw) };
                var rows = '';
                rows += fcRow('状態', f.状態, path+'.状態', editMode);
                if (!isCostEmpty(f.消費)) rows += fcRow('コスト', f.消費, path+'.消費', editMode);
                // 注: クールダウンは fcRow では表示せず, 発動ボタン(⏳ Nターン)で一元表示し, 重複を避ける
                var body = '<div class="sam-fc-body">';
                if (editMode || (Array.isArray(f.タグ) && f.タグ.length > 0)) body += fcBody('タグ', formatTags(f.タグ, path+'.タグ', editMode), 'sam-fc-tags');
                if (f.原始属性 && typeof f.原始属性 === 'object' && Object.keys(f.原始属性).length > 0) {
                    body += fcBodyCollapsible('原始属性', formatStatGrid(f.原始属性, 3), 'sam-fc-stats', false);
                }
                body += fcBody('効果', formatEffects(f.効果, path+'.効果', editMode), 'sam-fc-effects');
                var descContent;
                if (editMode && !isReadonlyPath(path+'.説明')) {
                    descContent = editInput(path+'.説明', safeStr(f.説明), 'textarea');
                } else {
                    descContent = esc(safeStr(f.説明));
                }
                body += fcBody('説明', descContent);
                // 形態が持つスキル子テーブル
                var formSkills = f.技能 || {};
                if (formSkills && typeof formSkills === 'object' && Object.keys(formSkills).length > 0) {
                    body += fcBody('スキル', renderSkillFullList(formSkills, path+'.技能', editMode), 'sam-fc-skills');
                }
                // 発動/解除ボタン: 品質バッジの左側(headExtra)に配置; 発動中→✕解除(クリック可), クールダウン中→⏳無効, ゼロ→⚡発動
                var cf = p.現在形態 || {};
                var isThisActive = (cf.激活 === true && safeStr(cf.名称) === k);
                var cdCur = 0;
                var cdM = safeStr(f.冷却).match(/^(\d+)\s*\/\s*(\d+)/);
                if (cdM) cdCur = parseInt(cdM[1], 10) || 0;
                var actBtnHtml;
                if (isThisActive) {
                    actBtnHtml = '<button class="sam-act-btn" data-act="deactivate" data-form="'+esc(k)+'">✕ 解除</button>';
                } else if (cdCur > 0) {
                    actBtnHtml = '<button class="sam-act-btn" disabled style="opacity:0.6;cursor:not-allowed;">⏳ '+cdCur+'ターン</button>';
                } else {
                    actBtnHtml = '<button class="sam-act-btn" data-act="activate" data-form="'+esc(k)+'">⚡ 発動</button>';
                }
                body += '</div>';
                fHtml += fullCard(q, k, rows, body, (actBtnHtml||'') + samDelBtn(path, editMode, '形態を削除'));
            });
            fHtml += '</div>';
        }
        // 形態がない場合は形態ライブラリの折りたたみ欄ごと自動的に非表示
        if (fkeys.length > 0) {
            html += secBlock('🌀 形態ライブラリ ('+fkeys.length+')', fHtml, false);  // 既定は折りたたみ; 折りたたみ記憶を優先して上書き
        }
        // スキル(アクティブ/パッシブ/特殊の各折りたたみ欄を直接列挙し, 外側の"メインスキル欄"section)
        var skills = p.技能 || {};
        html += renderSkillFullList(skills, 'キャラ.技能', editMode);
        return html;
    }

    /* ===== 27. Tab: 関係 ===== */
    /* 関係パネルで現在アクティブなサブTab(すべて/在席/不在/チーム)を記憶し, renderAll 後に"すべて"へ戻るのを防ぐ */
    var relationActiveSub = 'all';
    function renderRelationTab(sd) {
        var rel = sd.关系リスト || {};
        var editMode = isEditMode();
        var all = [], present = [], absent = [], team = [];
        Object.keys(rel).forEach(function(k) {
            var n = rel[k] || {};
            var item = {key:k, val:n};
            all.push(item);
            if (n.登場 === true) present.push(item); else absent.push(item);
            if (n.仲間 === true) team.push(item);
        });
        // 記憶したサブTab状態を使用(無効なら'all'へフォールバック)
        var activeSub = relationActiveSub;
        var validSubs = ['all','present','absent','team'];
        if (validSubs.indexOf(activeSub) < 0) activeSub = 'all';
        var html = '<div class="sam-subtabs">'
            + '<div class="sam-subtab'+(activeSub==='all'?' active':'')+'" data-sub="all">すべて('+all.length+')</div>'
            + '<div class="sam-subtab'+(activeSub==='present'?' active':'')+'" data-sub="present">在席('+present.length+')</div>'
            + '<div class="sam-subtab'+(activeSub==='absent'?' active':'')+'" data-sub="absent">不在('+absent.length+')</div>'
            + '<div class="sam-subtab'+(activeSub==='team'?' active':'')+'" data-sub="team">チーム('+team.length+')</div>'
            + '</div>';
        html += '<div class="sam-subpane'+(activeSub==='all'?' active':'')+'" data-sub="all"'+(activeSub==='all'?'':' style="display:none;"')+'>'+renderNpcList(all, editMode, 'all')+'</div>';
        html += '<div class="sam-subpane'+(activeSub==='present'?' active':'')+'" data-sub="present"'+(activeSub==='present'?'':' style="display:none;"')+'>'+renderNpcList(present, editMode, 'present')+'</div>';
        html += '<div class="sam-subpane'+(activeSub==='absent'?' active':'')+'" data-sub="absent"'+(activeSub==='absent'?'':' style="display:none;"')+'>'+renderNpcList(absent, editMode, 'absent')+'</div>';
        html += '<div class="sam-subpane'+(activeSub==='team'?' active':'')+'" data-sub="team"'+(activeSub==='team'?'':' style="display:none;"')+'>'+renderNpcList(team, editMode, 'present')+'</div>';
        return html;
    }
    /* NPC単列カード: mode でフィールドを決定
       all    -> 名前/在席状態/種族/身分/HP・好感/外見/態度
       present-> 表示可能なものは全て表示+伸縮枠(性格/服装/好み/状態/装備/スキル等)
       absent -> 名前/種族/身分/階層/好感度/外見/背景 */
    /* AIにのみ見える身分キーワード: プレイヤーパネルには表示しない(データベース上でAIに見せるだけ) */
    var HIDDEN_IDENTITY_KEYWORDS = ['守护者', '篡夺者', '织梦者', '残魂', '穿越者'];
    function isHiddenIdentity(s) {
        if (typeof s !== 'string') return false;
        for (var i = 0; i < HIDDEN_IDENTITY_KEYWORDS.length; i++) {
            if (s.indexOf(HIDDEN_IDENTITY_KEYWORDS[i]) >= 0) return true;
        }
        return false;
    }
    function filterHiddenIdentity(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.filter(function(x) { return !isHiddenIdentity(x); });
    }
    function renderNpcList(list, editMode, mode) {
        if (list.length === 0) return '<div class="sam-empty">[なし]</div>';
        var html = '<div class="sam-list-1col">';
        list.forEach(function(it) {
            var n = it.val;
            var path = '関係リスト.'+it.key;
            // 階層表示: 形態が発動中で形態階層>自身の場合は形態階層を表示(表示のみ, 書き戻しなし)
            var _dispRaw = displayTierRaw(n);
            var tierRoman = tierRomanOf(_dispRaw); var q = tierQOfClass(_dispRaw);
            var hp = safeNum(n.HP,0), hpmax = safeNum(n.HP_MAX,1);
            var ep = safeNum(n.EP,0), epmax = safeNum(n.EP_MAX,1);
            var thp = safeNum(n.THP,0);
            var favor = safeNum(n.好感度,0);
            var race = safeStr(n.種族) || '-';
            // 陣営の身分は既定で非表示(AIのみ可視); ただしチームメンバーか好感度>60の場合は隠さない
            var rawIdArr = Array.isArray(n.身分) ? n.身分 : [];
            var showAllIdentity = (n.仲間 === true) || (favor > 60);
            var idArr = showAllIdentity ? rawIdArr : filterHiddenIdentity(rawIdArr);
            var idStr = idArr.length ? idArr.join(' / ') : '-';
            var jobStrHtml = occupationInlineHtml(n.職業) || '<span class="sam-ed-ph">-</span>';
            var looks = safeStr(n.外見) || '';
            var dress = safeStr(n.服装) || '';
            var persona = safeStr(n.性格) || '';
            var likes = safeStr(n.好み) || '';
            var mind = safeStr(n.態度) || '';
            var bg = safeStr(n.背景) || '';
            var presentTxt = (n.登場 === true) ? 'はい' : 'いいえ';
            // 在席カードはクリックで詳細を表示(すべて/不在と同様)
            var cls = 'sam-card sam-npc-card q-'+q;
            var card = '<div class="'+cls+'" data-path="'+esc(path)+'" data-title="'+esc(it.key)+'">';
            // 編集モード: 右上の削除ボタン
            if (editMode) card += '<button type="button" class="sam-npc-del" data-del-npc="'+esc(it.key)+'" title="このNPCを削除">✕</button>';
            // 在席カード: 右上に転送ボタン(在席時のみ表示; 編集モードでは削除ボタンを避けて左へ)
            if (mode === 'present' && n.登場 === true) {
                var trfPos = editMode ? 'right:30px;' : 'right:4px;';
                card += '<button type="button" class="sam-npc-transfer" data-transfer-npc="'+esc(it.key)+'" style="'+trfPos+'" title="このキャラクターへ物資を転送">📦 転送</button>';
                // 回収ボタン: 死亡したNPCのみ表示
                if (isNpcDead(n)) {
                    var lootPos = editMode ? 'right:88px;' : 'right:62px;';
                    card += '<button type="button" class="sam-npc-loot" data-loot-npc="'+esc(it.key)+'" style="'+lootPos+'" title="このキャラクターの遺物を回収">💀 回収</button>';
                }
            }
            // アバター + 名前の横並び: 立ち絵あり=小アバター(クリックで拡大), 立ち絵なし=小ボタン(クリックでアップロード)
            var npcPUrl = getNpcPortrait(it.key);
            card += '<div class="sam-npc-head">';
            if (npcPUrl) {
                card += '<div class="sam-npc-avatar has-img" data-name="'+esc(it.key)+'" data-portrait="'+esc(npcPUrl)+'">';
                card += '<img src="'+esc(npcPUrl)+'" alt="'+esc(it.key)+'">';
                card += '</div>';
            } else {
                card += '<button type="button" class="sam-npc-portrait-btn" data-name="'+esc(it.key)+'" title="立ち絵を設定">📷 立ち絵</button>';
            }
            // NPC 変身形態: 当前形态.激活===true かつ名称がある場合, 名前の右側に形態名を表示
            var npcCf = n.現在形態 || {};
            var npcFormName = (npcCf.激活 === true && safeStr(npcCf.名称)) ? safeStr(npcCf.名称) : '';
            var npcFormTag = npcFormName ? '<span class="sam-npc-form-tag">🌀 '+esc(npcFormName)+'</span>' : '';
            card += '<div class="sam-npc-head-info"><div class="sam-npc-head-name">'+esc(it.key)+npcFormTag+'</div></div>';
            card += '</div>';
            if (mode === 'all') {
                // コンパクトな二列グリッド: 短いフィールドを並べ, 縦方向のスペースを節約
                var allGrid = '';
                allGrid += npcRow('在席', presentTxt);
                allGrid += npcRow('種族', race);
                allGrid += npcRow('身分', idStr);
                allGrid += npcRow('好感', favor);
                var qty = safeNum(n.数量, 1);
                if (qty > 1) {
                    allGrid += npcRow('THP', thp);
                    allGrid += npcRow('数量', 'x'+qty);
                } else {
                    allGrid += npcRow('HP', hp+'/'+hpmax);
                }
                card += '<div class="sam-npc-grid">'+allGrid+'</div>';
                // 長文は全幅
                if (looks) card += npcRow('外見', looks);
                if (bg) card += npcRow('背景', bg);
            } else if (mode === 'present') {
                // 基本情報の二列グリッド
                var grid = '';
                grid += npcRow('在席', presentTxt);
                grid += npcRow('種族', race);
                grid += npcRow('身分', idStr);
                grid += '<div class="sam-npc-row"><span class="k">職業:</span> <span class="v" style="flex:1;">'+jobStrHtml+'</span></div>';
                grid += npcRow('階層', tierRoman, 'sam-npc-tier q-'+q);
                grid += npcRow('好感度', favor);
                card += '<div class="sam-npc-grid">'+grid+'</div>';
                if (n.仲間 === true) card += renderNpcTierProgressBar(n, it.key);
                // プログレスバー HP/EP/THP
                card += '<div class="sam-npc-sec"></div>';
                card += npcBar('HP', hp, hpmax, 'var(--sam-hp)');
                card += npcBar('EP', ep, epmax, 'var(--sam-ep)');
                card += npcThpRow(thp);
                // 外見(服装を含む)
                if (looks || dress) {
                    card += '<div class="sam-npc-sec"></div>';
                    if (looks) card += npcRow('外見', looks);
                    if (dress) card += npcRow('服装', dress);
                }
                // 態度
                if (mind) { card += '<div class="sam-npc-sec"></div>'; card += '<div class="sam-npc-quote">'+esc(mind)+'</div>'; }
            } else { // absent
                card += npcRow('種族', race);
                card += npcRow('身分', idStr);
                card += npcRow('階層', tierRoman, 'sam-npc-tier q-'+q);
                card += npcRow('好感度', favor);
                if (looks) card += npcRow('外見', looks);
                if (bg) card += npcRow('背景', bg);
            }
            card += '</div>';
            html += card;
        });
        html += '</div>';
        return html;
    }
    function npcRow(k, v, vClass) {
        var cls = vClass ? ' v '+vClass : ' v';
        return '<div class="sam-npc-row"><span class="k">'+esc(k)+':</span> <span class="'+cls.trim()+'">'+esc(safeStr(v))+'</span></div>';
    }
    function npcBar(label, cur, max, color) {
        var pct = (max > 0) ? Math.min(100, Math.round(cur / max * 100)) : 0;
        return '<div class="sam-npc-bar">'
            + '<span class="lbl" style="color:'+color+';">'+esc(label)+'</span>'
            + '<div class="trk"><div class="fl" style="width:'+pct+'%;background:'+color+';"></div></div>'
            + '<span class="num">'+cur+'/'+max+'</span>'
            + '</div>';
    }
    /* NPC THP行: 数値のみ(一時シールド/追加耐久, 上限なし・プログレスバーなし) */
    function npcThpRow(cur) {
        return '<div class="sam-npc-thp-row">'
            + '<span class="lbl">THP (一時シールド/追加耐久)</span>'
            + '<span class="num">'+cur+'</span>'
            + '</div>';
    }

    /* ===== 28. Tab: 経営(資産) —— 各資産名が折りたたみ欄となり, 展開すると全情報を表示(詳細ウィンドウは使わない) ===== */
    function renderAssetTab(sd) {
        var assets = sd.资产 || {};
        var editMode = isEditMode();
        var keys = Object.keys(assets);
        if (keys.length === 0) return ''
            + '<div class="sam-asset-empty">'
            +   '<div class="ae-title">🏗️ 経営資産</div>'
            +   '<div class="ae-desc">ここにはデータベース内の全資産を表示します。プレイヤー・NPC・勢力の共有資産や無主の遺跡も含まれます。所属対象に現在のプレイヤーが含まれる資産のみ、自動収穫が有効になります。</div>'
            +   '<div class="ae-section"><div class="ae-h">経営可能なタイプ</div>'
            +     '<ul>'
            +       '<li><b>固定不動産</b>：領地 / 荘園 / 店舗 / 秘密拠点。建設シーケンス、駐在人員、未処理イベントを含む</li>'
            +       '<li><b>大型車両または要塞</b>：星艦 / 戦争兵器。戦場に投入するか場外から火力支援が可能で、エネルギーと完全度の制約を受ける</li>'
            +     '</ul>'
            +   '</div>'
            +   '<div class="ae-section"><div class="ae-h">入手方法</div>'
            +   '<div class="ae-desc">ストーリーイベント、任務報酬、領土拡張によって獲得します（資産が無から生成されることはありません）。領土級の資産を獲得すると、初期の建設シーケンスが最大 8 件まで直接解放されます。</div>'
            +   '</div>'
            + '</div>';
        var html = '<div class="sam-asset-wrap">';
        keys.forEach(function(k) {
            html += renderAssetBlock(k, assets[k] || {}, '资产.' + k, editMode);
        });
        html += '</div>';
        return html;
    }
    function normalizeAssetOwnersUi(value) {
        var fallbackPlayer = getPlayerName() || '<user>';
        var source = Array.isArray(value) ? value : (value == null ? [fallbackPlayer] : [value]);
        var out = [];
        source.forEach(function(raw) {
            var owner = canonicalPlayerIdentity(raw);
            if (!owner || owner === '无主' || out.indexOf(owner) >= 0) return;
            out.push(owner);
        });
        return out;
    }
    function assetOwnerChips(owners) {
        if (!owners.length) return '<span class="sam-asset-owner-chip unowned">无主</span>';
        return '<span class="sam-asset-owner-list">' + owners.map(function(owner) {
            var player = isPlayerIdentity(owner);
            var label = displayPlayerIdentity(owner);
            return '<span class="sam-asset-owner-chip'+(player ? ' player' : '')+'">'+esc(label)+'</span>';
        }).join('') + '</span>';
    }

    // 資産タイプ → アイコン
    function assetTypeIcon(type) {
        if (type === '大型载具' || type === '要塞' || type === '载具') return '🚀';
        if (type === '便携式据点' || type === '据点' || type === '安全屋') return '🎒';
        return '🏛️';
    }
    // 完全度 → 状態の色クラス
    function assetIntegClass(v) {
        if (v >= 80) return 'good';
        if (v >= 40) return 'warn';
        return 'bad';
    }
    // 建設段階 → 色クラス
    function assetStageClass(stage) {
        var map = { '基礎':'s1', '上級':'s2', '専門':'s3', '最上級':'s4', '禁忌':'s5' };
        return map[stage] || 's1';
    }
    // スカラー: 編集時は編集コンポーネント, それ以外はプレーンテキスト
    function assetScalar(path, val, type, editMode) {
        return editMode ? editInput(path, val, type || 'text') : esc(safeStr(val, '-'));
    }
    // タグ配列 → chips
    function assetTagChips(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return '<span class="sam-asset-none">なし</span>';
        return '<div class="sam-asset-tags">' + arr.map(function(t) {
            return '<span class="sam-asset-tag">' + esc(safeStr(t)) + '</span>';
        }).join('') + '</div>';
    }
    // 規模ドット(1-10); 編集時は入力欄に切替
    function assetScaleDots(scale, path, editMode) {
        if (editMode) return editInput(path + '.主体規模', scale, 'number');
        var dots = '';
        for (var i = 1; i <= 10; i++) {
            dots += '<span class="sam-asset-dot' + (i <= scale ? ' on' : '') + '"></span>';
        }
        return dots + '<span class="sam-asset-scale-num">' + scale + '/10</span>';
    }
    // KV行
    function assetKvRow(k, vHtml) {
        return '<div class="sam-asset-kv"><span class="k">' + esc(k) + '</span><span class="v">' + vHtml + '</span></div>';
    }
    /* 単一資産の折りたたみ欄(既定は展開, 展開すると全情報を表示) */
    function renderAssetBlock(name, a, path, editMode) {
        var type = safeStr(a.タイプ, '固定地产');
        var integ = safeNum(a.完全度, 100);
        var scale = safeNum(a.主体規模, 1);
        var integCls = assetIntegClass(integ);
        var integW = Math.max(0, Math.min(100, integ));
        var owners = normalizeAssetOwnersUi(a.所属対象);
        var ownerHead = owners.length === 0 ? '无主' : (owners.length === 1 ? displayPlayerIdentity(owners[0]) : '共同管理 ' + owners.length);

        // ヘッダー: アイコン + 名前 + タイプバッジ + 完全度 + (編集モード)削除ボタン
        var assetDelBtn = editMode ? '<button type="button" class="sam-fc-del-btn sam-asset-del" data-asset-del="' + esc(path) + '" title="この資産を削除">✕</button>' : '';
        var head = '<summary class="sam-asset-sum">'
            + '<span class="sam-asset-ico">' + assetTypeIcon(type) + '</span>'
            + '<span class="sam-asset-name">' + esc(name) + '</span>'
            + '<span class="sam-asset-badge">' + esc(type) + '</span>'
            + '<span class="sam-asset-badge">' + esc(ownerHead) + '</span>'
            + '<span class="sam-asset-integ ' + integCls + '">' + integ + '%</span>'
            + assetDelBtn
            + '</summary>';

        var body = '<div class="sam-asset-body">';

        // 概要: 完全度プログレスバー / 本体規模 / タイプ
        body += '<div class="sam-asset-overview">'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">完全度</span>'
            +   '<div class="sam-asset-bar"><div class="sam-asset-bar-fill ' + integCls + '" style="width:' + integW + '%;"></div></div>'
            +   '<span class="sam-asset-ov-val">' + (editMode ? editInput(path + '.完全度', integ, 'number') : integ + '%') + '</span>'
            + '</div>'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">本体規模</span>'
            +   '<div class="sam-asset-scale">' + assetScaleDots(scale, path, editMode) + '</div>'
            + '</div>'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">タイプ</span>'
            +   '<span class="sam-asset-ov-val">' + (editMode ? editSelect(path + '.タイプ', ['固定地产', '大型载具与要塞', '便携式据点'], type) : esc(type)) + '</span>'
            + '</div>'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">所属対象</span>'
            +   '<span class="sam-asset-ov-val">' + (editMode ? editInput(path + '.所属対象', owners, 'tags') : assetOwnerChips(owners)) + '</span>'
            + '</div>'
            + '</div>';

        // 状態(長文)
        var status = safeStr(a.状態, '');
        body += '<div class="sam-asset-sec">'
            + '<div class="sam-asset-sec-t">📋 状態</div>'
            + '<div class="sam-asset-text">' + (editMode ? editInput(path + '.状態', status, 'textarea') : (status ? esc(status) : '<span class="sam-asset-none">なし</span>')) + '</div>'
            + '</div>';

        // エネルギー(任意)
        var energy = a.エネルギー;
        if (energy && typeof energy === 'object' && (safeStr(energy.タイプ) || safeNum(energy.上限) > 0 || safeStr(energy.説明))) {
            var eCur = safeNum(energy.現在, 0);
            var eMax = safeNum(energy.上限, 0);
            var ePct = eMax > 0 ? Math.max(0, Math.min(100, Math.round(eCur / eMax * 100))) : 0;
            body += '<div class="sam-asset-sec">'
                + '<div class="sam-asset-sec-t">⚡ エネルギー · ' + esc(safeStr(energy.タイプ, '-')) + '</div>'
                + '<div class="sam-asset-energy">'
                +   '<div class="sam-asset-bar"><div class="sam-asset-bar-fill energy" style="width:' + ePct + '%;"></div></div>'
                +   '<span class="sam-asset-energy-num">' + (editMode ? editInput(path + '.エネルギー.現在', eCur, 'number') : eCur) + ' / ' + (editMode ? editInput(path + '.能源.上限', eMax, 'number') : eMax) + '</span>'
                + '</div>';
            var eDesc = safeStr(energy.説明, '');
            if (eDesc || editMode) {
                body += '<div class="sam-asset-text">' + (editMode ? editInput(path + '.エネルギー.説明', eDesc, 'textarea') : esc(eDesc)) + '</div>';
            }
            body += '</div>';
        }

        // 消耗ユニット(任意)
        var units = a.消耗ユニット || {};
        var uKeys = Object.keys(units);
        if (uKeys.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">🔋 消耗ユニット (' + uKeys.length + ')</div>';
            uKeys.forEach(function(uk) {
                var u = units[uk] || {};
                var upath = path + '.消耗ユニット.' + uk;
                var rem = safeNum(u.残量, 0);
                var cap = safeNum(u.上限, 0);
                var upct = cap > 0 ? Math.max(0, Math.min(100, Math.round(rem / cap * 100))) : 0;
                body += '<div class="sam-asset-unit">'
                    + '<div class="sam-asset-unit-head"><span class="sam-asset-unit-name">' + esc(uk) + '</span>'
                    +   '<span class="sam-asset-unit-num">' + (editMode ? editInput(upath + '.残量', rem, 'number') : rem) + ' / ' + (editMode ? editInput(upath + '.上限', cap, 'number') : cap) + '</span></div>'
                    + '<div class="sam-asset-bar"><div class="sam-asset-bar-fill" style="width:' + upct + '%;"></div></div>'
                    + (Array.isArray(u.加成) && u.加成.length ? '<div class="sam-asset-unit-bonus">' + assetTagChips(u.加成) + '</div>' : '')
                    + '</div>';
            });
            body += '</div>';
        }

        // 建設シーケンス(任意)
        var seqs = a.建設シーケンス || {};
        var sKeys = Object.keys(seqs);
        if (sKeys.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">🏗️ 建設シーケンス (' + sKeys.length + ')</div>';
            sKeys.forEach(function(sk) {
                var s = seqs[sk] || {};
                var spath = path + '.建設シーケンス.' + sk;
                var stage = safeStr(s.段階, '基礎');
                var seqDelBtn = editMode ? '<button type="button" class="sam-fc-del-btn sam-asset-seq-del" data-asset-seq-del="' + esc(spath) + '" title="この建設シーケンスを削除">✕</button>' : '';
                body += '<div class="sam-asset-seq">'
                    + '<div class="sam-asset-seq-head">'
                    +   '<span class="sam-asset-seq-name">' + esc(sk) + '</span>'
                    +   '<span class="sam-asset-stage ' + assetStageClass(stage) + '">' + esc(stage) + '</span>'
                    +   seqDelBtn
                    + '</div>'
                    + '<div class="sam-asset-seq-rows">'
                    +   assetKvRow('機能', assetScalar(spath + '.機能', safeStr(s.機能), 'text', editMode))
                    +   (function() {
                            var cv = safeStr(s.産出);
                            // 生産が空または"无"の場合はこのフィールドと次回生産日を非表示(編集モードでは入力用に保持)
                            if (!editMode && (!cv || cv === '无')) return '';
                            return assetKvRow('生産', assetScalar(spath + '.産出', cv, 'text', editMode))
                                + assetKvRow('次回生産日', assetScalar(spath + '.次回産出日', safeStr(s.次回産出日, '无'), 'text', editMode));
                        })()
                    + '</div>'
                    + (Array.isArray(s.加成) && s.加成.length ? '<div class="sam-asset-seq-bonus">' + assetTagChips(s.加成) + '</div>' : '')
                    + '</div>';
            });
            body += '</div>';
        }

        // 駐在人員(任意)
        var staff = a.駐留人員 || {};
        var stKeys = Object.keys(staff);
        if (stKeys.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">👥 駐在人員 (' + stKeys.length + ')</div>'
                + '<div class="sam-asset-staff">';
            stKeys.forEach(function(pn) {
                body += '<div class="sam-asset-staff-item"><span class="sam-asset-staff-name">' + esc(pn) + '</span><span class="sam-asset-staff-role">' + esc(safeStr(staff[pn], '-')) + '</span></div>';
            });
            body += '</div></div>';
        }

        // 未処理イベント(任意) —— 非編集モードでは行全体がクリック可能で, クリックするとそのテキストを入力欄へ入れる
        var todo = a.待機イベント;
        if (Array.isArray(todo) && todo.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">📌 未処理イベント (' + todo.length + ')</div>'
                + '<div class="sam-asset-todo">';
            todo.forEach(function(t) {
                var todoText = safeStr(t);
                if (editMode) {
                    body += '<div class="sam-asset-todo-item">' + esc(todoText) + '</div>';
                } else {
                    body += '<div class="sam-asset-todo-item clickable" data-asset-todo="' + esc(todoText) + '" title="クリックでこの未処理イベントを入力欄へ">'
                        + '<span class="sam-asset-todo-text">' + esc(todoText) + '</span>'
                        + '<span class="sam-asset-todo-go">📩</span>'
                        + '</div>';
                }
            });
            body += '</div></div>';
        }

        body += '</div>';
        return '<details class="sam-asset" open>' + head + body + '</details>';
    }

    /* ===== 29. Tab: 噂(すべてを一画面に表示; 変数に応じて全件表示, 情报交易.真の内幕を除く) =====
       R21-噂取引: 创世状态栏.txt から移植
         - トップツールバー: すべての噂を一括削除(確認あり)
         - 各カテゴリのタイトル右側: 一括クリア(そのカテゴリのみ, 確認あり)
         - 情報取引カード: 要求価格の数字の隣に"取引可"ボタンを追加し, クリックでテキストを入力欄へ送信(找{売り手}购买情报「{名}」)
         - 各噂の名前の右端: 単件削除ボタン
    */
    function renderRumorTab(sd) {
        var r = sd.噂 || {};
        var editMode = isEditMode();
        var html = '';
        var street = r.街頭の噂 || {};
        var intel = r.情報取引 || {};
        var notice = r.布告と檄文 || {};
        // トップツールバー: すべての噂を一括削除(噂が実際にある場合のみ表示)
        var total = Object.keys(street).length + Object.keys(intel).length + Object.keys(notice).length;
        if (total > 0) {
            html += '<div class="sam-rumor-toolbar">'
                + '<button type="button" class="sam-rumor-clearall-btn" data-rumor-clearall="1">🗑 すべての噂を一括削除 ('+total+')</button>'
                + '</div>';
        }
        // カテゴリ一括クリアボタン( secBlock の summary 右側に配置) — そのカテゴリの噂が2件以上の場合のみ表示
        function clearBtn(sectionKey, count) {
            if (count < 2) return '';
            return '<button type="button" class="sam-rumor-clear-btn" data-rumor-clear-section="'+esc(sectionKey)+'">一括クリア</button>';
        }
        var nStreet = Object.keys(street).length;
        var nIntel = Object.keys(intel).length;
        var nNotice = Object.keys(notice).length;
        // 巷の噂
        html += secBlock('🗣️ 巷の噂 ('+nStreet+')',
            renderRumorFullList(street, '噂.街頭の噂', editMode, [
                {k:'情報源', f:'出典', type:'text'},
                {k:'信頼度', f:'信頼度', type:'select', options:['酒話','疑わしい','信頼できるかも']},
                {k:'内容', f:'内容', type:'textarea', block:true}
            ], '街頭の噂'), nStreet > 0, clearBtn('街頭の噂', nStreet));
        // 情報取引: 要价 フィールドに tradeable:trueを付けて, 取引ボタンを発火
        html += secBlock('💎 情報取引 ('+nIntel+')',
            renderRumorFullList(intel, '噂.情報取引', editMode, [
                {k:'売り手', f:'売り手', type:'text'},
                {k:'情報評価', f:'情報評価', type:'select', options:['F','E','D','C','B','A','S','SS','SSS','日常','戦略']},
                // ★ 要价 フィールドは世界書の規則により文字列("50万日元"のような通貨単位付き)であり, number 型へ強制変換してはならない
                {k:'要求価格', f:'要求価格', type:'text', tradeable:true},
                {k:'要約', f:'要約', type:'textarea', block:true}
            ], '情報取引'), nIntel > 0, clearBtn('情報取引', nIntel));
        // 布告と檄文
        html += secBlock('📜 布告と檄文 ('+nNotice+')',
            renderRumorFullList(notice, '噂.布告と檄文', editMode, [
                {k:'発布者', f:'発布者', type:'text'},
                {k:'掲示場所', f:'掲示位置', type:'text'},
                {k:'内容', f:'内容', type:'textarea', block:true}
            ], '布告と檄文'), nNotice > 0, clearBtn('布告と檄文', nNotice));
        return html;
    }
    /* 噂/布告など汎用の全フィールド一覧(schemaのフィールドを全量表示, 長文フィールドは一行を独占)
       sectionKey: 現在の分類 key(街頭の噂/情報取引/布告と檄文), 単件削除ボタンの書き戻しパスに使用
       fd.tradeable=true のフィールド, つまり値の隣に"取引可"ボタンを追加(情報取引.要求価格のみ)
    */
    function renderRumorFullList(obj, basePath, editMode, fields, sectionKey) {
        var keys = Object.keys(obj);
        if (keys.length === 0) return '<div class="sam-empty">[なし]</div>';
        var html = '<div class="sam-list-1col">';
        keys.forEach(function(k) {
            var it = obj[k] || {};
            var path = basePath+'.'+k;
            var rows = '';
            var blockHtml = '';
            fields.forEach(function(fd) {
                var val = it[fd.f];
                var fpath = path+'.'+fd.f;
                var isReadonly = isReadonlyPath(fpath);
                if (fd.block) {
                    var content;
                    if (editMode && !isReadonly) {
                        content = editInput(fpath, safeStr(val), fd.type === 'textarea' ? 'textarea' : 'text');
                    } else if (isReadonly) {
                        content = '<span class="sam-edit-readonly">'+esc(safeStr(val))+'</span>';
                    } else {
                        content = esc(safeStr(val) || '-');
                    }
                    blockHtml += '<div class="sam-rumor-content" style="margin-top:4px;">'
                        + '<div style="font-size:11px;color:var(--sam-sub);margin-bottom:3px;">'+esc(fd.k)+'</div>'
                        + '<div style="font-size:12px;color:var(--sam-text);line-height:1.6;word-break:break-word;white-space:pre-wrap;">'+content+'</div>'
                        + '</div>';
                } else {
                    var display;
                    if (fd.type === 'select') {
                        display = editMode && !isReadonly ? editSelect(fpath, fd.options, safeStr(val)) : esc(safeStr(val) || '-');
                    } else if (fd.type === 'number') {
                        var nv = safeNum(val, 0);
                        display = editMode && !isReadonly ? editInput(fpath, nv, 'number') : nv;
                    } else {
                        display = editMode && !isReadonly ? editInput(fpath, safeStr(val), 'text') : (isReadonly ? '<span class="sam-edit-readonly">'+esc(safeStr(val))+'</span>' : esc(safeStr(val) || '-'));
                    }
                    // ★ 取引可ボタン: 要求価格の数字のすぐ右側(情报交易.要求価格 フィールドのみ)
                    if (fd.tradeable) {
                        var seller = safeStr(it.売り手) || '不明';
                        // ★ 要价 は通貨単位付きの文字列("50万日元"など)であり, 元の値をそのままボタンの data-rumor-priceへ渡す,
                        //   number へ強制変換すると非数値文字列がゼロ化される(ボタンも0になる)
                        var priceStr = safeStr(val) || '0';
                        display = '<span class="sam-rumor-price">'+display
                            + '<button type="button" class="sam-rumor-trade-btn" data-rumor-trade="1" data-rumor-name="'+esc(k)+'" data-rumor-seller="'+esc(seller)+'" data-rumor-price="'+esc(priceStr)+'" title="取引リクエストを入力欄へ送信">🛒 取引可</button>'
                            + '</span>';
                    }
                    rows += '<div class="sam-row"><span class="k">'+esc(fd.k)+'</span><span class="v">'+display+'</span></div>';
                }
            });
            // ★ 単件削除ボタン: カードタイトルの右端に配置(編集モードのみ表示)
            var delBtn = editMode ? '<button type="button" class="sam-rumor-del-btn" data-rumor-del="1" data-rumor-section="'+esc(sectionKey||'')+'" data-rumor-name="'+esc(k)+'" title="この噂を削除">✕</button>' : '';
            html += '<div class="sam-full-card">'
                + '<div class="sam-fc-head"><div class="sam-fc-title">'+esc(k)+'</div>'+delBtn+'</div>'
                + '<div class="sam-fc-rows">'+rows+'</div>'
                + blockHtml
                + '</div>';
        });
        html += '</div>';
        return html;
    }

    /* ===== 30. Tab: 世界(全画面一括表示) ===== */
    function renderWorldTab(sd) {
        var w = sd.世界 || {};
        var isSingleWorld = (sd.設定 && sd.設定.単一世界 === true);
        var isInHub = (sd.システム状態 && sd.システム状態.主神空間滞在中 === true);
        var editMode = isEditMode();
        var html = '';
        var alienRadar = w.異端レーダー || {};
        var alienRoster = alienRadar.名簿 && typeof alienRadar.名簿 === 'object' && !Array.isArray(alienRadar.名簿) ? alienRadar.名簿 : {};
        var alienNames = Object.keys(alienRoster);
        var alienAliveCount = alienNames.filter(function(name) {
            return safeStr((alienRoster[name] || {}).状態) !== '死亡';
        }).length;
        // 世界紹介(時間/場所は上部 topbar に表示済み, ここでは繰り返さない)
        var introFields = [
            {k:'名称', path:'世界.名称', type:'text'},
            {k:'位格', path:'世界.位格', type:'text'},
            {k:'難易度', path:'世界.難易度', type:'text'},
            {k:'モード', path:'世界.異端レーダー.現在模式', type:'text', hideOnSingle:true}
        ];
        var introHtml = '';
        introFields.forEach(function(f) {
            if (f.hideOnSingle && (isSingleWorld || isInHub)) return;
            var v = resolvePath(sd, f.path);
            var display;
            if (f.readonly || isReadonlyPath(f.path)) display = '<span class="sam-edit-readonly">'+esc(v)+'</span>';
            else if (editMode) display = editInput(f.path, v, f.type);
            else display = esc(safeStr(v));
            introHtml += '<div class="sam-row"><span class="k">'+esc(f.k)+'</span><span class="v">'+display+'</span></div>';
        });
        var stabilityValue = Math.max(0, Math.min(120, safeNum(w.安定, 100)));
        var stabilityPct = Math.max(0, Math.min(100, (stabilityValue / 120) * 100));
        var stabilityOverClass = stabilityValue > 100 ? ' over' : '';
        introHtml += '<div class="sam-world-stability">'
            + '<div class="sam-world-stability-head"><span class="k">安定度</span><span class="v">'+esc(stabilityValue)+'</span></div>'
            + '<div class="sam-world-stability-track"><div class="sam-world-stability-fill'+stabilityOverClass+'" style="width:'+stabilityPct+'%"></div><span class="sam-world-stability-mark100"></span></div>'
            + '<div class="sam-world-stability-scale"><span class="s0">0</span><span class="s100">100</span><span class="s120">120</span></div>'
            + '</div>';
        if (!isSingleWorld && !isInHub) {
            introHtml += '<div class="sam-row"><span class="k">異端生存数</span><span class="v"><span class="sam-edit-readonly">'+alienAliveCount+'</span></span></div>';
        }
        html += secBlock('🌍 世界紹介', introHtml);
        // 異端の詳細は当面キャラクターには非表示；折りたたみ欄のコードは完全なまま残し、後でこのスイッチを true にするだけで復元できる。
        var SHOW_ALIEN_ROSTER_DETAILS = false;
        if (SHOW_ALIEN_ROSTER_DETAILS && !isSingleWorld && !isInHub && alienNames.length) {
            var alienHtml = '<div class="sam-alien-list">';
            alienNames.forEach(function(name) {
                var alien = alienRoster[name] || {};
                var status = safeStr(alien.状態) === '死亡' ? '死亡' : '活動中';
                var stateClass = status === '死亡' ? 'dead' : 'active';
                var sourceText = alien.出典 ? ((alien.出典 === 'オリジナル' || alien.出典 === '原创') ? 'オリジナル' : '《' + alien.出典 + '》') : '';
                var meta = [sourceText, alien.陣営, alien.職業, alien.階層 ? alien.階層 + '級' : ''].filter(Boolean).join(' · ');
                alienHtml += '<div class="sam-alien-item"><div class="sam-alien-main"><div class="sam-alien-name">'+esc(name)+'</div>'
                    + (meta ? '<div class="sam-alien-meta">'+esc(meta)+'</div>' : '')
                    + (alien.経歴 ? '<div class="sam-alien-meta">経歴 · '+esc(alien.経歴)+'</div>' : '')
                    + '</div><span class="sam-alien-state '+stateClass+'">'+esc(status)+'</span></div>';
            });
            alienHtml += '</div>';
            html += secBlock('☄️ 異端名簿 · ' + alienAliveCount + '/' + alienNames.length, alienHtml, false);
        }
        // 法則(世界紹介の下へ移動)
        var laws = Array.isArray(w.法則) ? w.法則 : [];
        var lawHtml = '';
        if (laws.length === 0) lawHtml += '<div class="sam-empty">[法則なし]</div>';
        else laws.forEach(function(law, i) { lawHtml += '<div class="sam-row"><span class="k">法則'+(i+1)+'</span><span class="v">'+(editMode ? editInput('世界.法則.'+i, safeStr(law), 'text') : esc(law))+'</span></div>'; });
        html += secBlock('📜 法則', lawHtml);
        // 通貨
        var cur = w.通貨 || {};
        var curHtml = '';
        curHtml += '<div class="sam-row"><span class="k">体系</span><span class="v">'+(editMode ? editInput('世界.通貨.体系', safeStr(cur.体系), 'text') : esc(cur.体系||'-'))+'</span></div>';
        curHtml += '<div class="sam-row"><span class="k">購買力</span><span class="v">'+(editMode ? editInput('世界.通貨.購買力基準', safeStr(cur.購買力基準), 'text') : esc(cur.購買力基準||'-'))+'</span></div>';
        curHtml += '<div class="sam-row"><span class="k">経済変動</span><span class="v">'+(editMode ? editInput('世界.通貨.経済変動', safeStr(cur.経済変動), 'text') : esc(cur.経済変動||'-'))+'</span></div>';
        html += secBlock('💰 通貨', curHtml);
        // 因果軌道(通貨の下、探索ポイントの上へ移動)
        var ko = w.因果軌道 || {};
        var koHtml = '';
        koHtml += '<div class="sam-row"><span class="k">現在フェーズ</span><span class="v">'+(editMode ? editInput('世界.因果軌道.現在段階', safeStr(ko.現在段階), 'text') : esc(ko.現在段階||'-'))+'</span></div>';
        koHtml += '<div class="sam-row"><span class="k">ストーリーライン</span><span class="v">'+(editMode ? editInput('世界.因果軌道.ストーリーライン', safeStr(ko.ストーリーライン), 'text') : esc(ko.ストーリーライン||'-'))+'</span></div>';
        koHtml += '<div class="sam-row"><span class="k">次のノード</span><span class="v">'+(editMode ? editInput('世界.因果軌道.次ノード', safeStr(ko.次ノード), 'text') : esc(ko.次ノード||'-'))+'</span></div>';
        var off = ko.偏移記録 || {};
        var okeys = Object.keys(off);
        var offHtml = '';
        okeys.forEach(function(k) {
            var o = off[k] || {};
            var path = '世界.因果軌道.偏移記録.'+k;
            offHtml += '<div class="sam-row"><span class="k">'+esc(k)+'</span><span class="v">'+(editMode ? editInput(path+'.説明', safeStr(o.説明), 'text') : esc(o.説明||'-'))+'</span></div>';
        });
        if (okeys.length > 0) {
            koHtml += '<details class="sam-sec" style="margin-top:6px;">'
                + '<summary class="sam-sec-sum"><span class="sam-sec-title">偏差記録 ('+okeys.length+')</span></summary>'
                + '<div class="sam-sec-body">' + offHtml + '</div>'
                + '</details>';
        }
        html += secBlock('🌀 因果軌道', koHtml);
        // 探索ポイント
        var exp = w.探索 || {};
        // 編集モードの削除ボタン(探索ポイント/勢力共通, カード head の右側に設置)
        function worldDelBtn(path) {
            if (!editMode) return '';
            return '<button type="button" class="sam-rumor-del-btn" data-world-del="1" data-del-path="'+esc(path)+'" title="この項目を削除">✕</button>';
        }
        var ekeys = Object.keys(exp);
        var expHtml = '';
        if (ekeys.length === 0) expHtml += '<div class="sam-empty">[探索ポイントなし]</div>';
        else ekeys.forEach(function(k) {
            var e = exp[k] || {};
            var path = '世界.探索.'+k;
            var q = e.リスク ? parseRarity(e.リスク) : '';
            var rows = fcRow('探索度', safeNum(e.探索度,0)+'%', path+'.探索度', editMode, 'number');
            var body = fcRow('説明', e.説明, path+'.説明', editMode);
            expHtml += fullCard(q, k, rows, body, worldDelBtn(path));
        });
        html += secBlock('🧭 探索ポイント ('+Object.keys(w.探索||{}).length+')', expHtml, Object.keys(w.探索||{}).length > 0);
        // 勢力
        var forces = w.勢力 || {};
        var fkeys = Object.keys(forces);
        var forceHtml = '';
        if (fkeys.length === 0) forceHtml += '<div class="sam-empty">[勢力なし]</div>';
        else fkeys.forEach(function(k) {
            var f = forces[k] || {};
            var path = '世界.勢力.'+k;
            var q = f.実力 ? parseRarity(f.実力) : '';
            var rows = '';
            rows += fcRow('声望', safeNum(f.声望,0), path+'.声望', editMode, 'number');
            var body = fcRow('説明', f.説明, path+'.説明', editMode);
            forceHtml += fullCard(q, k, rows, body, worldDelBtn(path));
        });
        html += secBlock('⚔️ 勢力 ('+Object.keys(w.勢力||{}).length+')', forceHtml, Object.keys(w.勢力||{}).length > 0);
        return html;
    }

    /* ===== 30b. Tab: ショップ(主神空間の取引端末) =====
       - 上部のコンパクト残高バー: 現在のスペースコイン(キャラ.スペースコイン, 読み取り専用, システムの決算で付与)を表示
       - ステータス通知バー: 戦闘中/任務世界/主神空間 の三態, ショップ入口欄の上に配置
       - 取引ルール欄(折りたたみ): 二重経済/物価アンカーなど, ショップ入口の上に配置
       - ショップ入口欄: 要望入力欄(左) + 商品更新ボタン(右); 主神空間外/戦闘中は無効化
         商品更新ボタン: 本文AI generateRaw を呼び商品ライブラリを生成 → stat_data.商城 へ書き戻し → renderAll
     */
    function renderShopTab(sd) {
        var p = sd.キャラ || {};
        var sys = sd.システム状態 || {};
        var editMode = isEditMode();
        var coin = safeNum(p.スペースコイン, 0);
        var inHub = (sys.主神空間滞在中 === true);
        var isCombat = (sys.戦闘中 === true);
        // ★ 複数キャラのショップ: shopCurrentActor(現在のNPCが退場済みなら角色へフォールバック)を補正, 現在のキャラクターオブジェクトを解決
        shopEnsureActorValid(sd);
        var actorCtx = shopResolveCharacter(sd, shopCurrentActor);
        var curCharacter = actorCtx.character;
        // 血統数の上限判定: 現在選択中キャラクターの血統数を基準にする(ショップ血統エリアのグレー表示に使用)
        shopBloodCount = Object.keys(curCharacter.血統 || {}).length;
        shopBloodLimit = BLOODLINE_CAP;
        var isSingleWorld = (sd && sd.設定 && sd.設定.単一世界 === true);
        var html = '';
        // 上部コンパクト残高バー(スペースコインはシステムの決算で付与, 残高は読み取り専用表示; 編集モードはフォールバックのみ)
        var coinDisplay = editMode ? editInput('キャラ.スペースコイン', coin, 'number') : esc(String(coin));
        html += '<div class="sam-shop-coin-mini"><span class="lbl">💰 残高</span><span class="val">' + coinDisplay + '</span><span class="lbl">スペースコイン</span></div>';
        var credentialLedger = p.権限証憑 || {};
        var credentialChips = [];
        for (var _uiCi = 0; _uiCi < SHOP_PERMISSION_QUALITY_ORDER.length; _uiCi++) {
            var _uiGrade = SHOP_PERMISSION_QUALITY_ORDER[_uiCi];
            var _uiQty = Math.max(0, Math.floor(safeNum(credentialLedger[_uiGrade], 0)));
            if (_uiQty > 0) credentialChips.push('<span class="sam-shop-credential-chip">'+esc(_uiGrade)+' ×'+_uiQty+'</span>');
        }
        html += '<div class="sam-shop-credential-mini"><span class="lbl">🎫 権限証憑</span>'
            + (credentialChips.length ? credentialChips.join('') : '<span class="sam-shop-credential-empty">なし</span>')
            + '</div>';
        // ステータス通知バー: ショップ入口の上に配置(欄とは独立, 折りたたみなし)
        if (isCombat) {
            html += '<div class="sam-shop-warn">⚔️ 戦闘中は取引できません, 安全な場所に移動してから再試行してください</div>';
        } else if (!inHub && !isSingleWorld) {
            html += '<div class="sam-shop-warn">🔒 現在は任務世界にいます, スペースコインはロックされています<br>主神空間に戻らないとショップ取引を開始できません</div>';
        } else {
            if (isSingleWorld) {
                html += '<div class="sam-shop-ok">✅ 安全な場所にいます, ショップ取引を開始できます</div>';
            }else{
                html += '<div class="sam-shop-ok">✅ 主神空間にいます, ショップ取引を開始できます</div>';
            }
        }
        // 取引ルール(折りたたみ): ショップ入口の上に配置
        var ruleHtml = '<div class="sam-row"><span class="k">取引通貨</span><span class="v">スペースコイン(主神空間専用)</span></div>'
            + '<div class="sam-row"><span class="k">商品カテゴリ</span><span class="v">装備 / アイテム / スキル / 血統 / アップグレードサービス</span></div>'
            + '<div class="sam-row"><span class="k">物価レンジ</span><span class="v">F(10-99) · E(100-999) · D(1k-4.9k) · C(5k-2w) · B(2w-8w) · A(8w-32w) · S(32w-127w) · SS(128w-511w) · SSS(512w+)</span></div>'
            + '<div class="sam-row"><span class="k">権限ロック</span><span class="v">C級から購入対象の現在階層より高い商品を購入/アップグレードする際は同品質の権限証憑を追加で消費×1；同級以下では消費なし、血統融合の結果も消費なし</span></div>'
            + '<div class="sam-row"><span class="k">二重経済の分離</span><span class="v">任務世界内は現地通貨の使用が必須, スペースコインは流通しない</span></div>';
        html += secBlock('📜 取引ルール', ruleHtml, false);
        // ショップ入口(商品マーケット含む): 要望入力欄(左) + 商品更新ボタン(右) + Tabバー + リスト + カートバー
        // 主神空間外では入口コントロールを無効化, ただし商品ライブラリは閲覧可能(購入済みの在庫)
        var canShop = (!isCombat && (inHub || isSingleWorld));
        // 更新中: ボタンをグレーアウト + 文言変更, 要望入力欄も無効化(モジュールレベルの shopRefreshing で駆動, 画面切替/再レンダリングでも維持)
        var refreshDisabled = (!canShop || shopRefreshing) ? ' disabled' : '';
        var refreshBtnText = shopRefreshing ? '🔄 商品を更新中…' : '🔄 商品を更新';
        var reqDisabled = (!canShop || shopRefreshing) ? ' disabled' : '';
        // ★ キャラクターのドロップダウン: 自身 + 同行中のチームメイトNPC; 更新中も同時に無効化
        var actorDisabled = (!canShop || shopRefreshing) ? ' disabled' : '';
        var actorOpts = shopBuildActorOptions(sd);
        var actorHtml = '<span class="sam-shop-actor-label">対象:</span>'
            + '<select class="sam-shop-actor-select" data-shop-actor'+actorDisabled+'>';
        for (var ao = 0; ao < actorOpts.length; ao++) {
            var optEntry = actorOpts[ao];
            var sel = (optEntry.name === shopCurrentActor) ? ' selected' : '';
            actorHtml += '<option value="'+esc(optEntry.name)+'"'+sel+'>'+esc(optEntry.label)+'</option>';
        }
        actorHtml += '</select>';
        // レイアウト: 入力欄は単独の行(モバイルで狭くならないように); 対象ドロップダウン + 更新ボタンは別の行
        // 更新をまたいで入力内容を保持: レンダリング時にモジュールレベルの shopReqText(更新後の renderAll で DOM再構築, value属性により不消失)を復元
        var entryHtml = '<div class="sam-shop-entry">'
            + '<input type="text" class="sam-shop-req" data-shop-req placeholder="要望内容を入力(更新後も内容は保持, 不満ならそのまま再更新可)"'+reqDisabled+' value="'+esc(shopReqText)+'">'
            + '<div class="sam-shop-entry-actions">'
            + actorHtml
            + '<button type="button" class="sam-shop-refresh-btn" data-shop-refresh'+refreshDisabled+'>'+refreshBtnText+'</button>'
            + '</div>'
            + '</div>';
        // ===== マーケットエリア: stat_data.商城[現在のキャラクターの商庫] から永続化された商品データを読み込む =====
        // キャラクターごとに固有の商品ライブラリ, キャラクター切替時は現在の表示をクリアしてそのキャラクターの在庫を読み込む; 在庫は更新後にAIが書き込み, MVU に永続保存される
        var rawMarket = (sd.商城 && sd.商城) ? sd.商城 : null;
        var actorLib = shopGetActorLibRaw(rawMarket, shopCurrentActor);
        if (actorLib) {
            shopMarketData = shopNormalizeMarketData(actorLib);
            // チャット切替/新商品入荷時, 現在のエリアにデータがなければ最初にデータのあるエリアへフォールバック
            var fallback = shopPickFirstAvailableTab();
            if (!shopActiveTab || !shopTabHasData(shopActiveTab)) shopActiveTab = fallback;
        } else {
            shopMarketData = null;
        }
        // 商品パネルは"更新/購入"能力と連動: 更新できない(戦闘中/主神空間外)ときは, 下の商品パネル全体を非表示にする
        //   canShop をさらに三態に細分:
        //     更新中 → 固定高コンテナ + 更新中の通知(元のリストは非表示)
        //     更新済み → 固定高コンテナ + Tabバー + リスト + カートバー(三段構成, footer常に下部)
        //     空ライブラリ → 空ライブラリの通知
        //   !canShop → 商品パネルを一切描画しない(理由は上部のステータス通知バーで説明)
        if (canShop) {
            if (shopRefreshing) {
                entryHtml += '<div class="sam-shop-market"><div class="sam-shop-refreshing">'
                    + '<div class="sam-shop-refreshing-spin">🔄</div>'
                    + '<div>本文AIに商品生成をリクエスト中…<br>画面を閉じても待ってもかまいません, 商品の更新が完了するとポップアップで通知します。</div>'
                    + '<button type="button" class="sam-shop-stop-btn" data-sam-act="shop-stop-refresh">⏹ 更新を停止(固まったときはここをクリックして復帰)</button>'
                    + '</div></div>';
            } else if (shopMarketData) {
                var hasAnyItem = shopMarketHasAnyData();
                entryHtml += '<div class="sam-shop-market">' + shopRenderTabs() + shopRenderContent(coin) + (hasAnyItem ? shopRenderFooter(coin) : '') + '</div>';
            } else {
                entryHtml += '<div class="sam-shop-empty">まだ商品を更新していません, 上の欄に要望を入力して「商品を更新」をクリックしてください</div>';
            }
        }
        html += secBlock('🛒 ショップ入口', entryHtml, true);
        var receiptText = safeStr(sys.配信待ち記録, '').trim();
        var receiptHtml = receiptText
            ? '<div style="white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.55;color:var(--sam-text)">'+esc(receiptText)+'</div>'
                + '<div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="sam-confirm-btn cancel" data-receipt-clear>レシートを削除</button></div>'
            : '<div class="sam-empty">ナレーション待ちの取引はありません</div>';
        html += secBlock('🧾 配信待ち記録', receiptHtml, true);
        return html;
    }

    // マーケットエリア補助: あるエリアにデータがあるか判定
    function shopTabHasData(cat) {
        if (!shopMarketData) return false;
        // 装備エリア/スキルエリア/アイテムエリア: グループ化オブジェクト {类型label: [...]}; 血統エリア: フラット配列
        if (cat === '装备区' || cat === '技能区' || cat === '道具区') {
            var groups = shopMarketData[cat] || {};
            for (var g in groups) { if (groups.hasOwnProperty(g) && groups[g] && groups[g].length) return true; }
            return false;
        }
        return (shopMarketData[cat] || []).length > 0;
    }
    function shopPickFirstAvailableTab() {
        var order = ['装备区','道具区','技能区','血统区','形态区','升级区'];
        for (var i = 0; i < order.length; i++) { if (shopTabHasData(order[i])) return order[i]; }
        return '装备区';
    }
    // ショップの全エリアに少なくともひとつの商品があるか検出(カートバーを描画するかの判断に使用)
    function shopMarketHasAnyData() {
        if (!shopMarketData) return false;
        var cats = ['装备区','道具区','技能区','血统区','形态区','升级区'];
        for (var i = 0; i < cats.length; i++) { if (shopTabHasData(cats[i])) return true; }
        return false;
    }
    // エリア/スロット/名称で正規化済みの商品エントリを検索(配列を返し, toggleSelect で使用)
    function shopFindItems(cat, slot, name) {
        if (!shopMarketData) return [];
        var out = [];
        // 装備エリア/スキルエリア/アイテムエリア: グループ化オブジェクト(slot=类型label); 血統エリア: フラット配列(slotは無視)
        if (cat === '装备区' || cat === '技能区' || cat === '道具区') {
            var groups = shopMarketData[cat] || {};
            if (slot) {
                // slot有り: 該当する类型グループを正確に特定
                var arr = groups[slot] || [];
                for (var i = 0; i < arr.length; i++) { if (arr[i].name === name) out.push(arr[i]); }
            } else {
                // slot無し(数量コントロールなどの場面): すべてのグループを走査して検索
                for (var g2 in groups) {
                    if (!groups.hasOwnProperty(g2)) continue;
                    var arr2 = groups[g2] || [];
                    for (var i2 = 0; i2 < arr2.length; i2++) { if (arr2[i2].name === name) out.push(arr2[i2]); }
                }
            }
        } else {
            var items = shopMarketData[cat] || [];
            for (var k = 0; k < items.length; k++) { if (items[k].name === name) out.push(items[k]); }
        }
        return out;
    }

    /* ===== 31. 詳細ポップアップ(カードをクリック) ===== */
    // キャラクターからは見えない機密フィールド(角色には見せない)
    var HIDDEN_FIELDS = ['隠された真実', '真の内幕', '態度', '真属性'];
    function openDetailModal(path, title) {
        var sd = getStatData();
        if (!sd) return;
        var obj = resolvePath(sd, path);
        if (obj == null) { showModal(title, '<div class="sam-empty">データが存在しない</div>'); return; }
        // NPC詳細: 専用のキャラクター・プロフィールパネルを使用(セクション別の整形レイアウト, 空値は非表示, 技術フィールドを露出しない)
        var isNpc = (typeof path === 'string' && path.indexOf('関係リスト.') === 0);
        if (isNpc) {
            // ★ 編集モード: NPCプロフィールに編集可能フィールドを埋め込み(種族/身分/好感度/戦闘数値/プロフィール本文), 下部に保存ボタンを追加
            var editMode = isEditMode();
            var npcHtml = renderNpcDetail(obj, title, editMode, path);
            var footHtml = editMode ? '<div class="sam-nd-edit-tip">✎ 編集モード · 数値をクリックでその場編集, フォーカスを外すと自動で一時保存</div><button type="button" class="sam-save-btn sam-nd-save">💾 保存</button>' : '';
            showModal(title + ' · キャラクター・プロフィール' + (editMode ? ' · 編集' : ''), '<div class="sam-nd">'+npcHtml+footHtml+'</div>');
            if (editMode) bindEditorEvents($('#samsara-modal')); // modal は独立DOMのため, 編集イベントを個別に委譲する必要がある
            return;
        }
        // ★ 編集モード: 汎用詳細(世界エントリ/キャラクター状態など)も再帰編集レンダリングを使用, 下部に保存ボタンを追加
        var ed2 = isEditMode();
        var hidden = HIDDEN_FIELDS;
        var html = ed2 ? renderDetailNode(obj, hidden, [], ed2, path) : renderDetailNode(obj, hidden);
        var footHtml2 = ed2 ? '<div class="sam-nd-edit-tip">✎ 編集モード · 数値をクリックでその場編集, フォーカスを外すと自動で一時保存</div><button type="button" class="sam-save-btn sam-nd-save">💾 保存</button>' : '';
        showModal(title + ' · 詳細' + (ed2 ? ' · 編集' : ''), '<div class="sam-detail">'+html+'</div>'+footHtml2);
        if (ed2) bindEditorEvents($('#samsara-modal')); // modal は独立DOMのため, 編集イベントを個別に委譲する必要がある
    }
    /* NPCキャラクター・プロフィール専用レンダリング: セクション別カード形式, 値のあるフィールドのみ表示, HP_MAX/EP_MAX/空オブジェクト/未アクティブ形態などの技術フィールドを露出しない
       ★ editMode(編集モード): 基本情報/好感度/戦闘数値/プロフィール本文はクリック即編集コントロール(editInput)としてレンダリング, 階層/最終属性は読み取り専用を維持( isReadonlyPath の保護下) */
    function renderNpcDetail(n, name, editMode, npcPath) {
        if (!n || typeof n !== 'object') return '<div class="sam-empty">データが存在しない</div>';
        editMode = !!editMode;
        npcPath = npcPath || ('関係リスト.' + name);
        // 階層表示: 形態が発動中で形態階層>自身の場合は形態階層を表示(表示のみ, 書き戻しなし)
        var _dispRaw = displayTierRaw(n);
        var tierRoman = tierRomanOf(_dispRaw); var q = tierQOfClass(_dispRaw);
        var hp = safeNum(n.HP,0), hpmax = safeNum(n.HP_MAX,0);
        var ep = safeNum(n.EP,0), epmax = safeNum(n.EP_MAX,0);
        var thp = safeNum(n.THP,0);
        var favor = safeNum(n.好感度,0);
        var race = safeStr(n.種族) || '';
        var rawIdArr = Array.isArray(n.身分) ? n.身分 : [];
        var showAllId = (n.仲間 === true) || (favor > 60);
        var idArr = showAllId ? rawIdArr : filterHiddenIdentity(rawIdArr);
        // 編集状態のフィールド値取得補助: 値セル(編集可=editInput, 読み取り専用/非編集=プレーンテキスト)
        var edCell = function(field, val, type) {
            var p = npcPath + '.' + field;
            if (editMode && !isReadonlyPath(p)) {
                var v = (type === 'number') ? safeNum(val, 0) : val;
                return '<span class="v">'+editInput(p, v, type || 'text')+'</span>';
            }
            return '<span class="v">'+esc(safeStr(val))+'</span>';
        };
        // 編集状態のトグル補助(在场/是否队友)
        var edToggle = function(field, val) {
            var p = npcPath + '.' + field;
            if (editMode && !isReadonlyPath(p)) return editToggle(p, val);
            return (val === true) ? 'はい' : 'いいえ';
        };
        var cf = n.現在形態 || {};
        var formName = (cf.激活 === true && safeStr(cf.名称)) ? safeStr(cf.名称) : '';
        var attrs = n.最終属性 || {};
        var html = '';
        // ① ヘッダー: 名前 + 形態タグ + 階層バッジ + 在场/チームメイトバッジ
        html += '<div class="sam-nd-head"><div class="sam-nd-name">'+esc(name||'')+(formName?'<span class="sam-nd-form">🌀 '+esc(formName)+'</span>':'')+'</div>';
        html += '<div class="sam-nd-badges"><span class="sam-nd-tier q-'+q+'">'+esc(tierRoman)+'</span>';
        if (n.登場 === true) html += '<span class="sam-nd-badge present">在席</span>';
        if (n.仲間 === true) html += '<span class="sam-nd-badge team">チームメイト</span>';
        // 編集モード: ヘッダーのバッジ領域に 在场/チームメイト のトグルを追加(クリックで切替, 保存時に書き戻し)
        if (editMode) {
            html += '<span class="sam-nd-badge edit-toggle">在席 '+editToggle(npcPath+'.登場', n.登場 === true)+'</span>';
            html += '<span class="sam-nd-badge edit-toggle">チームメイト '+editToggle(npcPath+'.仲間', n.仲間 === true)+'</span>';
        }
        html += '</div></div>';
        // ② 好感度の双方向バー (中線=0, 正は右へ緑, 負は左へ赤); 編集モードでは数値部分が編集可能
        var favorColor = favor > 60 ? '#56bf7b' : (favor < 0 ? 'var(--sam-hp)' : 'var(--sam-accent)');
        var favorPct = Math.min(50, Math.abs(favor) / 2);
        var favorDir = favor >= 0 ? 'pos' : 'neg';
        html += '<div class="sam-nd-favor"><span class="sam-nd-favor-lbl">好感度</span>';
        html += '<div class="sam-nd-favor-track"><div class="sam-nd-favor-fill '+favorDir+'" style="width:'+favorPct+'%;background:'+favorColor+';"></div></div>';
        if (editMode && !isReadonlyPath(npcPath+'.好感度')) {
            html += '<span class="sam-nd-favor-val" style="color:'+favorColor+';">'+editInput(npcPath+'.好感度', favor, 'number')+'</span>';
        } else {
            html += '<span class="sam-nd-favor-val" style="color:'+favorColor+';">'+(favor>0?'+':'')+favor+'</span>';
        }
        html += '</div>';
        // ③ 基本情報グリッド (編集モードでは常に編集行を描画; 読み取り専用時は値がある場合のみ)
        var grid = '';
        if (editMode) {
            grid += ndEditRow('種族', edCell('種族', race));
            // ★ 身分の編集には元の配列を使用(非表示の陣営身分をフィルタしない), 保存時に非表示身分が消えるのを防ぐ; flushStagedDisplay は .身份 を自動で配列に分割する
            grid += ndEditRow('身分', edCell('身分', rawIdArr.join(',')));
            var npcQty2 = safeNum(n.数量, 1);
            grid += ndEditRow('数量', edCell('数量', npcQty2, 'number'));
        } else {
            if (race) grid += ndRow('種族', race);
            if (idArr.length) grid += ndRow('身分', idArr.join(' / '));
            var npcQty = safeNum(n.数量, 1);
            if (npcQty > 1) grid += ndRow('数量', 'x'+npcQty);
        }
        if (grid) html += '<div class="sam-nd-grid">'+grid+'</div>';
        // ★ 職業: 編集モード→構造化エディタ(キャラクターパネルと同一); 読み取り専用→折りたたみパネル(🎖 タイトル付き)
        if (editMode && !isReadonlyPath(npcPath+'.職業')) {
            html += occupationEditHtml(n.職業, npcPath+'.職業');
        } else {
            var occHtml = occupationCardsHtml(n.職業);
            if (occHtml) html += occHtml;
        }
        // ④ 態度 (編集モード: 全幅の編集可能ブロック(textarea は 2 列グリッドでは狭すぎるため, 独立レンダリング); 読み取り専用: 値があるときのみ引用として表示)
        if (editMode) {
            if (!isReadonlyPath(npcPath+'.態度')) {
                html += '<div class="sam-nd-block"><div class="sam-nd-block-lbl">態度</div><div class="sam-nd-block-ct">'+editInput(npcPath+'.態度', safeStr(n.態度), 'textarea')+'</div></div>';
            }
        } else if (safeStr(n.態度)) {
            html += '<div class="sam-nd-quote">💬 '+esc(safeStr(n.態度))+'</div>';
        }
        // ⑤ 戦闘属性バー (HP_MAX/EP_MAX/THP のいずれかが>0 のときのみ表示; 編集モード: HP/EP/THP の現在値は編集可, 上限は読み取り専用)
        if (editMode || hpmax > 0 || epmax > 0 || thp > 0) {
            html += '<div class="sam-nd-sec-lbl">⚔ 戦闘属性</div><div class="sam-nd-bars">';
            if (editMode) {
                // 編集モード: 編集行を直接使用(ラベル+現在値の編集ボックス+読み取り専用の上限), 読み取り専用のプログレスバーは重複描画しない
                html += npcEdBar('HP', npcPath+'.HP', hp, hpmax > 0 ? hpmax : null, 'var(--sam-hp)', editMode);
                html += npcEdBar('EP', npcPath+'.EP', ep, epmax > 0 ? epmax : null, 'var(--sam-ep)', editMode);
                html += npcEdBar('THP', npcPath+'.THP', thp, null, 'var(--sam-thp)', editMode);
            } else {
                if (hpmax > 0) html += npcBar('HP', hp, hpmax, 'var(--sam-hp)');
                if (epmax > 0) html += npcBar('EP', ep, epmax, 'var(--sam-ep)');
                if (thp > 0) html += npcThpRow(thp);
            }
            html += '</div>';
        }
        // ⑤ 最終属性 (非ゼロ項目のみ, 武器オブジェクトは除外) + 武器攻撃(最終属性に統合, ATK/MATKを二段に分ける)
        // 固定順: 五維 → 力量修正など(修正) → DEF/MDEF/AP → 武器 → 軽減率 → 判定
        var ATTR_ORDER = [
            '筋力','敏捷','体力','精神','魅力',
            '力量修正','敏捷修正','体质修正','精神修正','魅力修正',
            'DEF','MDEF','AP',
            '物理軽減率','魔法軽減率',
            '先制DC','防御DC'
        ];
        var attrKeys = ATTR_ORDER.filter(function(k){
            return Object.prototype.hasOwnProperty.call(attrs, k) && k !== '武器' && safeNum(attrs[k],0) !== 0;
        });
        // フォールバック: ATTR_ORDER 以外の非0かつ武器以外のキー(新フィールドの漏れ防止)
        Object.keys(attrs).forEach(function(k){
            if (k === '武器' || ATTR_ORDER.indexOf(k) >= 0) return;
            if (safeNum(attrs[k],0) !== 0 && attrKeys.indexOf(k) < 0) attrKeys.push(k);
        });
        var wpn = attrs.武器;
        var wpnKeys = (wpn && typeof wpn === 'object') ? Object.keys(wpn) : [];
        if (attrKeys.length || wpnKeys.length) {
            html += '<div class="sam-nd-sec-lbl">📊 最終属性</div>';
            if (attrKeys.length) {
                html += '<div class="sam-nd-attrs">';
                attrKeys.forEach(function(k){ html += '<div class="sam-nd-attr"><span class="k">'+esc(k)+'</span><span class="v">'+safeNum(attrs[k],0)+'</span></div>'; });
                html += '</div>';
            }
            if (wpnKeys.length) {
                html += '<div class="sam-nd-wpn">';
                wpnKeys.forEach(function(name) {
                    var w = wpn[name] || {};
                    var isBase = (name === '无武装');
                    html += '<div class="sam-nd-wpn-row'+(isBase?' base':'')+'"><div class="nm">'+(isBase?'非武装':'⚔ '+esc(name))+'</div><div class="atk">ATK (物理) <b>'+safeNum(w.ATK,0)+'</b></div><div class="matk">MATK (魔法) <b>'+safeNum(w.MATK,0)+'</b></div></div>';
                });
                html += '</div>';
            }
        }
        // ⑥ 人物プロフィール (外貌/着装/性格/喜爱/背景故事, 値があるときのみ; 編集モード→編集可能テキストブロック, 常に描画)
        var profile = '';
        var profileFields = ['外見','服装','性格','好み','背景'];
        if (editMode) {
            profileFields.forEach(function(f) {
                var p = npcPath + '.' + f;
                var v = safeStr(n[f]);
                if (isReadonlyPath(p)) return;
                profile += '<div class="sam-nd-block"><div class="sam-nd-block-lbl">'+esc(f)+'</div><div class="sam-nd-block-ct">'+editInput(p, v, 'textarea')+'</div></div>';
            });
        } else {
            if (safeStr(n.外見)) profile += ndBlock('外見', n.外見);
            if (safeStr(n.服装)) profile += ndBlock('服装', n.服装);
            if (safeStr(n.性格)) profile += ndBlock('性格', n.性格);
            if (safeStr(n.好み)) profile += ndBlock('好み', n.好み);
            if (safeStr(n.背景)) profile += ndBlock('背景', n.背景);
        }
        if (profile) html += '<details class="sam-nd-sub" '+(editMode?'open':'')+'><summary>👤 人物プロフィール</summary><div class="sam-nd-sub-body">'+profile+'</div></details>';
        // ⑨ サブシステム (装備/スキル/血統/形態ライブラリ/状態, 空でないときのみ折りたたみ表示)
        var subs = [{k:'状態',d:n.状態},{k:'血統',d:n.血統},{k:'形態庫',d:n.形態庫},{k:'技能',d:n.技能},{k:'装備',d:n.装備},{k:'道具',d:n.道具}];
        subs.forEach(function(s) {
            var d = s.d || {};
            var ks = Object.keys(d);
            // ★ 編集モード: サブシステム(状态/血统/技能/装备/形态库/道具)内の全エントリを再帰的にその場で編集
            if (editMode && ks.length > 0 && !isReadonlyPath(npcPath+'.'+s.k)) {
                var subEdHtml = renderDetailNode(d, ['隠された真実','真の内幕','真属性'], [s.k], true, npcPath+'.'+s.k);
                html += '<details class="sam-nd-sub" open><summary>✎ '+esc(s.k)+' ('+ks.length+')</summary><div class="sam-nd-sub-body">'+subEdHtml+'</div></details>';
                return;
            }
            if (ks.length === 0) return;
            var subHtml = renderDetailNode(d, ['隠された真実','真の内幕','真属性'], [s.k]);
            html += '<details class="sam-nd-sub"><summary>'+esc(s.k)+' ('+ks.length+')</summary><div class="sam-nd-sub-body">'+subHtml+'</div></details>';
        });
        return html;
    }
    function ndRow(k, v) {
        return '<div class="sam-nd-row"><span class="k">'+esc(k)+'</span><span class="v">'+esc(safeStr(v))+'</span></div>';
    }
    /* NPCプロフィールの編集行: vHtml は構築済みの値セル( editInput コントロールを含む), 再度エスケープしない */
    function ndEditRow(k, vHtml) {
        return '<div class="sam-nd-row"><span class="k">'+esc(k)+'</span>'+vHtml+'</div>';
    }
    /* NPC戦闘属性の編集行: ラベル + 現在値の編集ボックス + (任意)読み取り専用の上限; max=null のときは上限を表示しない( THPの場合) */
    function npcEdBar(label, path, cur, max, color, editMode) {
        if (!editMode) return '';
        var maxTxt = (max != null) ? '<span class="mx readonly">/ '+max+'</span>' : '';
        var valHtml = '<span class="num-ed">'+editInput(path, cur, 'number')+'</span>';
        return '<div class="sam-npc-bar">'
            + '<span class="lbl" style="color:'+color+';">'+esc(label)+'</span>'
            + valHtml + maxTxt
            + '</div>';
    }
    function ndBlock(label, content) {
        return '<div class="sam-nd-block"><div class="sam-nd-block-lbl">'+esc(label)+'</div><div class="sam-nd-block-ct">'+esc(safeStr(content))+'</div></div>';
    }
    /* 整形された再帰レンダリング: スカラーは短い値(グリッド行)/長文(ブロック)に分ける; 子オブジェクト/配列は伸縮可能なdetails; 文字列配列は tag chips */
    var DETAIL_LONG_FIELDS = ['説明','外見','服装','性格','好み','態度','背景','内容','状態','効果','要約','真の内幕','隠された真実'];
    function isLongField(k, v) {
        if (DETAIL_LONG_FIELDS.indexOf(k) >= 0) return true;
        if (typeof v === 'string' && v.length > 30) return true;
        return false;
    }
    /* 列挙の翻訳テーブル(装備タイプ/装備状態/スキルタイプ) */
    var EQUIP_TYPE_MAP = ['武器','手袋','頭部','胸部','脚部','靴','マント','アクセサリー','世界遺物'];
    var EQUIP_STATUS_MAP = ['未装備','装備済み','倉庫'];
    var SKILL_TYPE_MAP = ['アクティブ','パッシブ','特殊'];
    // 親コンテナのキー -> 列挙フィールドの判定
    var ENUM_PARENTS = { 装備: { タイプ: EQUIP_TYPE_MAP, 状態: EQUIP_STATUS_MAP }, 道具: { 状態: EQUIP_STATUS_MAP }, 技能: { タイプ: SKILL_TYPE_MAP }, 形态: { 状態: EQUIP_STATUS_MAP } };
    function translateEnum(field, value, ancestors) {
        if (!ancestors || ancestors.length < 2) return null;
        // ancestors: [..., コンテナキー(装备/技能/道具/形态), エントリ名, field]
        // 最も近いコンテナキーを探す
        for (var i = ancestors.length - 2; i >= 0; i--) {
            var container = ancestors[i];
            if (ENUM_PARENTS[container] && ENUM_PARENTS[container][field]) {
                var map = ENUM_PARENTS[container][field];
                var idx = (typeof value === 'number') ? value : parseInt(value, 10);
                if (!isNaN(idx) && idx >= 0 && idx < map.length) return map[idx];
                return null;
            }
        }
        return null;
    }
    /* "消耗"が空/無と等価かどうかを統一的に判定し, その場合は非表示にする
       対象: undefined/null/''/'无'/'0'/0/'0MP'/'0EP'/'0回合'/'无消耗'/'0 EP' など無消耗と等価なすべての形式 */
    function isCostEmpty(c) {
        if (c == null) return true;
        if (typeof c === 'number') return c === 0;
        if (typeof c !== 'string') return false;
        var s = String(c).trim();
        if (s === '') return true;
        if (s === '无' || s === '无消耗' || s === '消耗无' || s === '无消耗。' || s === '无。') return true;
        // 純粋な数値 0 / "0"、"0.0" の形
        if (/^[0-9.]+$/.test(s)) return parseFloat(s) === 0 || isNaN(parseFloat(s));
        // "0MP"、"0 EP"、"0EP"、"0 回合"、"0点"… の形は消費量が0
        if (/^0(\s|点)?(MP|EP|HP|SP|回合|点|怒气|能量|p|P)?$/.test(s)) return true;
        return false;
    }
    /* ★ 汎用の再帰詳細レンダリング(世界エントリ/NPCサブシステムなど): editMode+basePath のときスカラー/タグ/数値グリッドをその場で編集
       - basePath は MVU の完全なパス接頭辞( 関係リスト.李三.技能), 再帰的に階層ごとに連結
       - isReadonlyPath の保護下; 真属性/隐藏真相等の hidden フィールドは描画せず編集も不可 */
    function renderDetailNode(node, hidden, ancestors, editMode, basePath) {
        ancestors = ancestors || [];
        var ed = !!(editMode && basePath);
        var selfPath = ed ? basePath : '';
        if (node == null) return '<div class="sam-empty">なし</div>';
        if (typeof node !== 'object') {
            return '<div class="sam-d-block"><div class="sam-d-content">'+esc(fmtScalar(node, ancestors))+'</div></div>';
        }
        if (Array.isArray(node)) {
            if (node.length === 0) return '<div class="sam-empty">なし</div>';
            return renderDetailArray(node, hidden, ancestors, editMode, basePath);
        }
        var keys = Object.keys(node);
        if (keys.length === 0) return '<div class="sam-empty">なし</div>';
        // 三種類に分ける: 短いスカラー/長文/オブジェクト配列
        var shortRows = '', longBlocks = '', subBlocks = '';
        // 現在のノードが純粋な数値オブジェクトか( 原始属性 {力量:0, ATK:5}): 値が0の項目は一律非表示
        var nodeIsNumObj = isNumObj(node);
        keys.forEach(function(k) {
            if (hidden && hidden.indexOf(k) >= 0) return;
            var v = node[k];
            if (v == null) return;
            if (v === '' && !ed) return; // ★ 編集モードは空文字列フィールドを保持(内容を入力可能), 読み取り専用時は非表示
            // ★ 消耗 フィールド: 无/0/0MP など"無消耗と等価"な形式は一律非表示
            if (k === '消費' && isCostEmpty(v)) return;
            // 身份 配列: AIのみに表示されるキーワードを除外(守护者/篡夺者/织梦者/残魂/穿越者)
            if (k === '身分' && Array.isArray(v)) {
                // チームメンバーまたは好感度>60のときは陣営身分を隠さない
                var _showAllId = (node.仲間 === true) || (safeNum(node.好感度,0) > 60);
                if (!_showAllId) v = filterHiddenIdentity(v);
                if (v.length === 0) return;
            }
            var childAnc = ancestors.concat([k]);
            var childPath = ed ? (selfPath + '.' + k) : '';
            // 原始属性は血統/装備/形態/状態などのエントリの基準値であり、表示のみで編集モードの書き換えは許可しない。
            // 再帰呼び出しも childEditMode を使用し、品質アルファベット属性と数値属性が編集ボックスとして露出しないようにする。
            var childEditMode = ed && k !== '原始属性';
            if (ed && isReadonlyPath(childPath)) {
                // 読み取り専用パス: 描画はする(読み取り専用状態), 編集には入らない
            } else if (typeof v === 'object') {
                // オブジェクト/配列 -> 伸縮可能
                if (Array.isArray(v)) {
                    if (v.length === 0) {
                        // 空配列: スキップ, 空の折りたたみ欄は描画しない
                    } else if (isStringArray(v)) {
                        // 純粋な文字列配列 -> tag chips, 折りたたまない(編集状態は tags エディタを描画)
                        subBlocks += detailTagBlock(k, v, childAnc, childEditMode, childPath);
                    } else {
                        subBlocks += detailSub(k, renderDetailArray(v, hidden, childAnc, childEditMode, childPath), v.length <= 2);
                    }
                } else if (Object.keys(v).length === 0) {
                    // 空オブジェクト(原始属性/效果が{}): スキップ, 空の折りたたみ欄は描画しない
                } else if (isNumObj(v)) {
                    // 純粋な数値属性オブジェクト(原始属性など): 原始属性は固定で読み取り専用、それ以外は編集状態では全量+その場編集
                    var gridHtml = formatStatGrid(v, 6, childEditMode, childPath);
                    if (gridHtml) subBlocks += detailSub(k, '<div class="sam-d-sub-body">'+gridHtml+'</div>', false);
                } else {
                    var childHtml = renderDetailNode(v, hidden, childAnc, childEditMode, childPath);
                    // 子ノードはフィルタ後に空になる可能性がある(原始属性が全て0など), 空の折りたたみ欄は描画しない
                    if (childHtml && childHtml.trim() && !/class="sam-empty"/.test(childHtml)) {
                        subBlocks += detailSub(k, '<div class="sam-d-sub-body">'+childHtml+'</div>', Object.keys(v).length <= 2 || ed);
                    }
                }
            } else {
                // スカラー: 純粋な数値オブジェクト内の0値はスキップ; 列挙フィールド(类型/状态=0)は翻訳表示を保持
                // ★ 編集モードでは0値フィルタを行わない(そうしないと0値フィールドが描画されず, 編集できない)
                if (!ed) {
                    if (nodeIsNumObj && safeNum(v, 0) === 0) return;
                    if (!nodeIsNumObj && safeNum(v, NaN) === 0 && (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(String(v).trim())))) {
                        // 非数値オブジェクト内の数値0: 列挙フィールド(装備タイプ0=武器/状態0=未装備)は保持, その他の属性ボーナス系の0は非表示
                        var isEnumField = false;
                        for (var ei = ancestors.length - 1; ei >= 0; ei--) {
                            if (ENUM_PARENTS[ancestors[ei]] && ENUM_PARENTS[ancestors[ei]][k]) { isEnumField = true; break; }
                        }
                        // 現在のノード自身がコンテナである場合も ENUM_PARENTS を参照する
                        if (!isEnumField && ENUM_PARENTS[ancestors[ancestors.length - 1]] && ENUM_PARENTS[ancestors[ancestors.length - 1]][k]) isEnumField = true;
                        // 装备/道具/技能のエントリ直下: ancestors の末尾はエントリ名, その前がコンテナ
                        if (!isEnumField && ancestors.length >= 2) {
                            var contKey = ancestors[ancestors.length - 2];
                            if (ENUM_PARENTS[contKey] && ENUM_PARENTS[contKey][k]) isEnumField = true;
                        }
                        if (!isEnumField && k !== '好感度' && k !== '数量') return;
                    }
                }
                // ★ 編集モード: スカラーをその場で編集(ブール→トグル, 長文→textarea, 数値→number, その他→text)
                if (childEditMode) {
                    if (typeof v === 'boolean') {
                        // ブールフィールドはトグルを使用(true/falseを直接一時保存し, テキスト書き戻しによる型破壊を防ぐ)
                        shortRows += '<div class="sam-d-row"><span class="k">'+esc(k)+':</span><span class="v">'+editToggle(childPath, v)+'</span></div>';
                    } else {
                        var etype = isLongField(k, v) ? 'textarea' : (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? 'number' : 'text');
                        var ev = (etype === 'number') ? safeNum(v, 0) : safeStr(v);
                        if (isLongField(k, v)) {
                            longBlocks += '<div class="sam-d-block"><div class="sam-d-label">'+esc(k)+'</div><div class="sam-d-content">'+editInput(childPath, ev, etype)+'</div></div>';
                        } else {
                            shortRows += '<div class="sam-d-row"><span class="k">'+esc(k)+':</span><span class="v">'+editInput(childPath, ev, etype)+'</span></div>';
                        }
                    }
                } else {
                    var fv = fmtScalar(v, childAnc);
                    if (isLongField(k, v)) {
                        longBlocks += '<div class="sam-d-block"><div class="sam-d-label">'+esc(k)+'</div><div class="sam-d-content">'+esc(fv)+'</div></div>';
                    } else {
                        shortRows += '<div class="sam-d-row"><span class="k">'+esc(k)+':</span><span class="v">'+esc(fv)+'</span></div>';
                    }
                }
            }
        });
        var html = '';
        if (shortRows) html += '<div class="sam-detail-grid">'+shortRows+'</div>';
        if (longBlocks) html += longBlocks;
        if (subBlocks) html += subBlocks;
        return html;
    }
    function renderDetailArray(arr, hidden, ancestors, editMode, basePath) {
        // スカラー配列: tag chips(編集状態: 純粋な文字列→tagsエディタ; 数値/ブールを含む→要素型を保つためJSONエディタ)
        if (isStringArray(arr)) {
            if (editMode && basePath) {
                var allStr = arr.every(function(x) { return typeof x === 'string'; });
                if (allStr) return '<div class="sam-d-tags">'+editInput(basePath, arr.join(','), 'tags')+'</div>';
                var js2 = '';
                try { js2 = JSON.stringify(arr); } catch(e3) { js2 = ''; }
                return '<div class="sam-d-tags">'+editInput(basePath, js2, 'json')+'</div>';
            }
            var chips = arr.map(function(item) { return '<span class="sam-d-tag">'+esc(fmtScalar(item, ancestors))+'</span>'; }).join('');
            return '<div class="sam-d-tags">'+chips+'</div>';
        }
        // ★ 編集モード: オブジェクト配列は全体をJSON エディタで扱う(要素ごとに安定したMVUパスを構築できないため, 相互上書きを避ける)
        if (editMode && basePath) {
            var jsonStr = '';
            try { jsonStr = JSON.stringify(arr, null, 1); } catch(e2) { jsonStr = ''; }
            return '<div class="sam-d-block"><div class="sam-d-label">'+esc(ancestors[ancestors.length-1]||'配列')+'</div><div class="sam-d-content">'+editInput(basePath, jsonStr, 'json')+'</div></div>';
        }
        var html = '';
        arr.forEach(function(item, i) {
            if (typeof item === 'object' && item !== null) {
                html += '<div class="sam-d-block">'+renderDetailNode(item, hidden, ancestors, editMode, basePath)+'</div>';
            } else {
                html += '<div class="sam-d-row"><span class="v">'+esc(fmtScalar(item, ancestors))+'</span></div>';
            }
        });
        return html;
    }
    function detailSub(label, contentHtml, openByDefault) {
        return '<details class="sam-d-sub" '+(openByDefault?'open':'')+'><summary>'+esc(label)+'</summary><div class="sam-d-sub-body">'+contentHtml+'</div></details>';
    }
    function detailTagBlock(label, arr, ancestors, editMode, path) {
        var inner;
        if (editMode && path) {
            // 純粋な文字列配列→tagsエディタ; 数値/ブールを含むスカラー配列→JSONエディタ(分割して書き戻すと要素型が壊れる)
            var allStr = arr.every(function(x) { return typeof x === 'string'; });
            if (allStr) {
                inner = editInput(path, arr.join(','), 'tags');
            } else {
                var js = '';
                try { js = JSON.stringify(arr); } catch(e2) { js = ''; }
                inner = editInput(path, js, 'json');
            }
        } else {
            inner = arr.map(function(item) { return '<span class="sam-d-tag">'+esc(fmtScalar(item, ancestors))+'</span>'; }).join('');
        }
        return '<div class="sam-d-block"><div class="sam-d-label">'+esc(label)+'</div><div class="sam-d-tags">'+inner+'</div></div>';
    }
    function isNumObj(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        var keys = Object.keys(obj);
        if (keys.length === 0) return false;
        return keys.every(function(k) { var v = obj[k]; return typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(String(v).trim())); });
    }
    function isStringArray(arr) {
        return arr.every(function(x) { return typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'; });
    }
    /* スカラーの整形: ブール→はい/いいえ; 列挙フィールド(装備タイプ/状態/スキルタイプ)→翻訳; その他→文字列 */
    function fmtScalar(v, ancestors) {
        if (v === true) return 'はい';
        if (v === false) return 'いいえ';
        if (ancestors && ancestors.length) {
            var field = ancestors[ancestors.length - 1];
            var tr = translateEnum(field, v, ancestors);
            if (tr != null) return tr;
        }
        return safeStr(v);
    }

    /* ===== 32. エディタコンポーネント ===== */
    /* ★ 職業記録のレンダリング補助: 职业 は文字列配列から {职业名:{类型,品质,特性[],来源}} の記録オブジェクトへ変更 */
    // 職業名のリストを取得(旧文字列配列/スカラーのフォールバックに対応)
    function occupationNames(occ) {
        if (!occ) return [];
        if (Array.isArray(occ)) return occ.map(function(s){return safeStr(s);}).filter(Boolean);
        if (typeof occ === 'string') return [occ];
        if (typeof occ === 'object') return Object.keys(occ).filter(function(k){return k && String(k).trim();});
        return [];
    }
    // コンパクトなインライン表示(各職業名+タイプの小バッジ) NPC カード/インラインの簡易表示に使用
    function occupationInlineHtml(occ) {
        var names = occupationNames(occ);
        if (names.length === 0) return '';
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        var html = '<span class="sam-occ-inline">';
        names.forEach(function(nm) {
            var e = (rec && rec[nm]) ? rec[nm] : {};
            var t = safeStr(e.タイプ) || '支援';
            if (['戦闘','生活','支援'].indexOf(t) < 0) t = '支援';
            html += '<span class="sam-occ-chip">'+esc(nm)+'<span class="sam-occ-sumtype '+esc(t)+'">'+esc(t)+'</span></span>';
        });
        html += '</span>';
        return html;
    }
    // 折りたたみパネル: summary(タイトル+件数+各職業名/タイプの一覧) → 展開後は職業ごとのカード(名前+タイプバッジ+特性chips+来源)、キャラクター情報パネル/NPC詳細パネルに使用
    function occupationCardsHtml(occ) {
        var names = occupationNames(occ);
        if (names.length === 0) return '';
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        function typeOf(e) { var t = safeStr(e.タイプ) || '支援'; return (['戦闘','生活','支援'].indexOf(t) < 0) ? '支援' : t; }
        // summary 行: 職業名 + タイプの小バッジ
        var sumRow = '';
        names.forEach(function(nm) {
            var e = (rec && rec[nm]) ? rec[nm] : {};
            sumRow += '<span class="sam-occ-sumname">'+esc(nm)+'<span class="sam-occ-sumtype '+esc(typeOf(e))+'">'+esc(typeOf(e))+'</span></span>';
        });
        var html = '<details class="sam-occ-panel" open>'
            + '<summary class="sam-occ-summary">'
              + '<span class="sam-occ-sumtitle">🎖 職業</span>'
              + '<span class="sam-occ-sumcount">'+names.length+'</span>'
              + '<span class="sam-occ-sumrow">'+sumRow+'</span>'
            + '</summary>'
            + '<div class="sam-occ-body">';
        names.forEach(function(nm) {
            var entry = (rec && rec[nm]) ? rec[nm] : {};
            var type = typeOf(entry);
            var tags = Array.isArray(entry.特性) ? entry.特性 : [];
            var src = safeStr(entry.出典) || '';
            html += '<div class="sam-occ-card">'
                + '<div class="sam-occ-head"><span class="sam-occ-name">'+esc(nm)+'</span>'
                + '<span class="sam-occ-type '+esc(type)+'">'+esc(type)+'</span></div>';
            if (tags.length) {
                html += '<div class="sam-occ-tags">';
                tags.forEach(function(t) { html += '<span class="sam-occ-tag">'+esc(safeStr(t))+'</span>'; });
                html += '</div>';
            }
            if (src) html += '<div class="sam-occ-src">📍 出典: '+esc(src)+'</div>';
            html += '</div>';
        });
        html += '</div></details>';
        return html;
    }
    // 一行テキスト要約(ショップAIのコンテキスト用): "職業名[タイプ] 特性1/特性2 来源:xxx"
    function occupationSummaryText(occ) {
        var names = occupationNames(occ);
        if (names.length === 0) return '';
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        return names.map(function(nm) {
            var entry = (rec && rec[nm]) ? rec[nm] : {};
            var type = safeStr(entry.タイプ) || '支援';
            var tags = Array.isArray(entry.特性) ? entry.特性 : [];
            var src = safeStr(entry.出典) || '';
            var parts = [nm + '[' + type + ']'];
            if (tags.length) parts.push(tags.join('/'));
            if (src) parts.push('出典:' + src);
            return parts.join(' ');
        }).join(', ');
    }
    /* ★ 職業の構造化エディタ(編集モード): 職業ごとのカード(職業名/タイプドロップダウン/特性カンマ入力/来源入力)+削除ボタン+"職業を追加"ボタン
       オブジェクト全体をひとつのスナップショットとして pendingEdits[path]に一時保存; 入力のフォーカス喪失/変更→occReassemble で再構成し一時保存; 削除/追加→DOM変更後に再構成.
       data-occ-field の値: key(職業名)/タイプ/特性/出典 */
    function occupationEditHtml(occ, basePath) {
        var names = occupationNames(occ);
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        var html = '<div class="sam-occ-edit" data-occ-path="'+esc(basePath)+'">';
        names.forEach(function(nm) {
            var e = (rec && rec[nm]) ? rec[nm] : {};
            var type = safeStr(e.タイプ) || '支援';
            if (['戦闘','生活','支援'].indexOf(type) < 0) type = '支援';
            var tags = Array.isArray(e.特性) ? e.特性 : [];
            var src = safeStr(e.出典) || '';
            html += occupationEditCardHtml(nm, type, tags, src);
        });
        html += '</div>';
        html += '<button type="button" class="sam-occ-add-btn" data-occ-path="'+esc(basePath)+'">+ 職業を追加</button>';
        return html;
    }
    // 職業編集カード一枚分( occupationEditHtml と"追加"ボタンで共用)
    function occupationEditCardHtml(name, type, tags, src) {
        type = type || '支援';
        if (['戦闘','生活','支援'].indexOf(type) < 0) type = '支援';
        var tagsStr = Array.isArray(tags) ? tags.join(',') : safeStr(tags);
        var nameVal = (name === undefined || name === null) ? '' : String(name);
        // タイプのドロップダウン選択肢
        var typeOpts = ['戦闘','生活','支援'].map(function(t) {
            return '<option value="'+esc(t)+'"'+(t === type ? ' selected' : '')+'>'+esc(t)+'</option>';
        }).join('');
        // sam-occ-field クラスを使用( sam-edit-input/sam-edit-activeではない), flushStagedDisplay/saveEdits が既定で"クリック即編集"ロジックを通るのを避ける
        return '<div class="sam-occ-edit-card" data-occ-key="'+esc(nameVal)+'">'
            + '<div class="sam-occ-edit-head">'
              + '<input class="sam-occ-field sam-occ-edit-name" data-occ-field="key" type="text" value="'+esc(nameVal)+'" placeholder="職業名" />'
              + '<select class="sam-occ-field sam-occ-edit-type" data-occ-field="タイプ">'+typeOpts+'</select>'
              + '<button type="button" class="sam-occ-del-btn" title="この職業を削除">✕</button>'
            + '</div>'
            + '<div class="sam-occ-edit-row"><span class="k">特性</span>'
              + '<input class="sam-occ-field sam-occ-edit-tags" data-occ-field="特性" type="text" value="'+esc(tagsStr)+'" placeholder="カンマ区切り, 例: 剣術,受け" /></div>'
            + '<div class="sam-occ-edit-row"><span class="k">出典</span>'
              + '<input class="sam-occ-field sam-occ-edit-src" data-occ-field="出典" type="text" value="'+esc(src)+'" placeholder="出典(任意)" /></div>'
            + '</div>';
    }
    /* 職業エディタ: 現在のコンテナの全カードをオブジェクトに再構成し pendingEdits[path] に一時保存 */
    function occReassemble($container) {
        if (!$container || !$container.length) return;
        var path = $container.attr('data-occ-path');
        if (!path) return;
        var out = {};
        var usedKeys = {};
        $container.find('.sam-occ-edit-card').each(function(idx) {
            var $c = $(this);
            var name = String($c.find('[data-occ-field="key"]').val() || '').trim();
            var type = String($c.find('[data-occ-field="タイプ"]').val() || '支援');
            if (['戦闘','生活','支援'].indexOf(type) < 0) type = '支援';
            var tagsStr = String($c.find('[data-occ-field="特性"]').val() || '');
            var tags = tagsStr.split(/[\/,，]/).map(function(s){return String(s).trim();}).filter(Boolean);
            var src = String($c.find('[data-occ-field="出典"]').val() || '').trim();
            // 職業名が空 → プレースホルダキー "新职业<i>" で上書きを回避, 保存時に ZOD が検証する
            var key = name || ('新职业' + (idx + 1));
            // キーの重複排除: 同名なら連番を付与
            var k = key, n = 2;
            while (usedKeys[k]) { k = key + '_' + (n++); }
            usedKeys[k] = true;
            out[k] = { タイプ: type, 特性: tags, 出典: src };
        });
        stageEdit(path, out, 'object');
    }
    /* 職業エディタ: 指定カードを削除して再構成・一時保存 */
    function occEditDelete($card) {
        var $container = $card.closest('.sam-occ-edit');
        $card.remove();
        occReassemble($container);
    }
    /* 職業エディタ: 空カードを一枚追加して再構成・一時保存 */
    function occEditAdd($btn) {
        var path = $btn.attr('data-occ-path');
        // filter で属性により照合, パスにセレクタの特殊文字が含まれるのを避ける
        var $container = $('.sam-occ-edit').filter(function(){ return $(this).attr('data-occ-path') === path; });
        if (!$container.length) return;
        $container.append(occupationEditCardHtml('', '支援', [], ''));
        occReassemble($container);
    }
    /* 編集モードでは入力ボックスを直接描画しない; 代わりに"クリック即編集":
       editInput/editSelect は表示状態の HTML(テキスト+✎)を返し, クリック時にイベントが実際の入力ボックスを動的に挿入, フォーカス喪失/確定 で pendingEdits に一時保存して表示状態へ戻す. これにより全入力ボックスが同時に開いてレイアウトが崩れるのを防ぐ. */
    function editInput(path, val, type) {
        return editDisplayHtml(path, val, type || 'text', '');
    }
    function editSelect(path, options, val) {
        return editDisplayHtml(path, val, 'select', optsToStr(options));
    }
    function editToggle(path, val) {
        return '<span class="sam-toggle-switch '+(val?'on':'')+'" data-toggle="field" data-path="'+esc(path)+'"><div class="knob"></div></span>';
    }
    function modalRow(k, v) {
        var vs = (typeof v === 'object') ? JSON.stringify(v) : safeStr(v);
        return '<div class="sam-row"><span class="k">'+esc(k)+'</span><span class="v">'+esc(vs)+'</span></div>';
    }
    /* 効果オブジェクトを行ごとにレンダリング {a:b,c:d} → 複数行 */
    function formatEffects(effects, path, editMode) {
        if (!effects || typeof effects !== 'object') return '';
        var keys = Object.keys(effects);
        if (keys.length === 0 && !editMode) return '';
        var html = '<div class="sam-effects">';
        keys.forEach(function(k) {
            var v = effects[k];
            var isObj = (v !== null && typeof v === 'object');
            var vs = isObj ? JSON.stringify(v) : safeStr(v);
            if (editMode && path && !isReadonlyPath(path+'.'+k)) {
                // オブジェクト値(ネストした効果)は json エディタ, スカラーはテキスト
                html += '<div class="sam-effect-line"><span class="ek">'+esc(k)+':</span> '+editInput(path+'.'+k, vs, isObj ? 'json' : 'text')+'</div>';
            } else {
                html += '<div class="sam-effect-line"><span class="ek">'+esc(k)+':</span> '+esc(vs)+'</div>';
            }
        });
        html += '</div>';
        return html;
    }
    /* タグ配列のレンダリング */
    function formatTags(tags, path, editMode) {
        if (!Array.isArray(tags)) tags = [];
        if (tags.length === 0 && !editMode) return '<span class="sam-empty" style="padding:2px 0;">なし</span>';
        if (editMode && path) return editInput(path, tags.join(','), 'tags');
        var html = '<div class="sam-tags">';
        tags.forEach(function(t) { html += '<span class="sam-tag">'+esc(t)+'</span>'; });
        html += '</div>';
        return html;
    }
    /* 品質の列挙（F~SSS），五維属性内の品質アルファベット（成長/功法状態）の識別に使用 */
    var STAT_QUALITY_SET = { 'F':1, 'E':1, 'D':1, 'C':1, 'B':1, 'A':1, 'S':1, 'SS':1, 'SSS':1 };
    function isStatQuality(v) {
        if (typeof v !== 'string') return false;
        return Object.prototype.hasOwnProperty.call(STAT_QUALITY_SET, v.toUpperCase().trim());
    }
    /* 属性値の正規化: 品質アルファベット(F~SSS)は文字列として保持, それ以外は parseFloat で数値化(非数値→0)
       ショップ/キャラ の 原始属性 {筋力:'B', ATK:5} を解析する際にアルファベットと数値の混在表記に対応するために使用 */
    function attrMapVal(raw) {
        if (raw == null) return 0;
        if (typeof raw === 'string' && STAT_QUALITY_SET.hasOwnProperty(raw.trim().toUpperCase())) {
            return raw.trim().toUpperCase();
        }
        var n = parseFloat(raw);
        return isFinite(n) ? n : 0;
    }
    /* 数値属性グリッド: 値が0の属性は非表示(装備/血統/形態/状態詳細などで共用; 装備は非0項目のみ書き込み)
       ★ 状態の五維両対応: 品質アルファベット(例 筋力:'B')はそのまま表示, 数値(例 ATK:15 / 力量:-5)は元の数値ロジックを通す
       ★ editMode: 各セルの数値をその場で編集(0値を含む全量レンダリング); path が空のときは読み取り専用グリッドへ退化する */
    function formatStatGrid(stats, cols, editMode, path) {
        if (!stats || typeof stats !== 'object') return '';
        var keys = Object.keys(stats);
        if (!editMode) {
            keys = keys.filter(function(k) {
                var v = stats[k];
                if (isStatQuality(v)) return true;          // 品質アルファベット: 保持
                return safeNum(v, 0) !== 0;                  // 数値: 0 は非表示
            });
        }
        if (keys.length === 0) return '';
        var html = '<div class="sam-stat-grid">';
        keys.forEach(function(k) {
            var v = stats[k];
            if (editMode && path && !isReadonlyPath(path+'.'+k)) {
                // 編集モード: 品質アルファベットはテキスト編集, 数値は数値編集
                var t = isStatQuality(v) ? 'text' : 'number';
                var dv = isStatQuality(v) ? safeStr(v) : safeNum(v, 0);
                html += '<div class="sam-stat-cell"><div class="sn">'+esc(k)+'</div><div class="sv">'+editInput(path+'.'+k, dv, t)+'</div></div>';
            } else {
                var display = isStatQuality(v) ? safeStr(v) : safeNum(v, 0);
                html += '<div class="sam-stat-cell"><div class="sn">'+esc(k)+'</div><div class="sv">'+esc(String(display))+'</div></div>';
            }
        });
        html += '</div>';
        return html;
    }
    /* インラインの完全資料カード(装備/アイテム/スキル/血統/形態) */
    // 削除ボタンの HTML(編集モード時に表示, カードヘッダ右側に設置; クリックで二次確認→MVUへ削除を書き込み)
    function samDelBtn(path, editMode, label) {
        if (!editMode) return '';
        return '<button type="button" class="sam-fc-del-btn" data-del-path="'+esc(path)+'" title="'+(label||'削除')+'">✕</button>';
    }
    function fullCard(q, title, rowsHtml, bodyHtml, headExtra) {
        // q の形式: 文字列(品質アルファベット, 表示=着色)またはオブジェクト {label:表示テキスト, cls:色階アルファベット}
        //   形態は階層(Ⅰ~Ⅸ)を使用: label=ローマ数字(表示), cls=対応する品質アルファベット(着色 q-class)
        var label, qc;
        if (q && typeof q === 'object') { label = q.label || ''; qc = q.cls ? parseRarity(q.cls) : ''; }
        else { qc = q ? parseRarity(q) : ''; label = qc; }
        var badge = qc ? '<div class="sam-fc-q q-'+qc+'">'+esc(label)+'</div>' : '';
        var head = '<div class="sam-fc-head"><div class="sam-fc-title">'+esc(title)+'</div>'+(headExtra||'')+badge+'</div>';
        return '<div class="sam-full-card'+(qc?' q-'+qc:'')+'">'+head+(rowsHtml?'<div class="sam-fc-rows">'+rowsHtml+'</div>':'')+(bodyHtml||'')+'</div>';
    }
    function fcRow(k, v, path, editMode, type) {
        if (editMode && path && !isReadonlyPath(path)) {
            var val = (type === 'number') ? safeNum(v,0) : v;
            return '<div class="sam-row"><span class="k">'+esc(k)+'</span><span class="v">'+editInput(path, val, type||'text')+'</span></div>';
        }
        if (v === null || v === undefined || v === '') return '';
        var vs = (typeof v === 'object') ? JSON.stringify(v) : safeStr(v);
        return '<div class="sam-row"><span class="k">'+esc(k)+'</span><span class="v">'+esc(vs)+'</span></div>';
    }
    /* 全幅左寄せブロック: ラベルが上, 内容が行全体を占める(効果/説明などの長文用) */
    function fcBody(label, contentHtml, extraClass) {
        if (!contentHtml || !String(contentHtml).trim()) return '';
        return '<div class="sam-fc-block">'
            + '<div class="sam-fc-label">'+esc(label)+'</div>'
            + '<div class="sam-fc-content '+(extraClass||'')+'">'+contentHtml+'</div>'
            + '</div>';
    }
    /* 伸縮可能な全幅ブロック: <details> 折りたたみ(原始属性などの大きなブロック用); 内容が空のときは描画しない(全0属性がフィルタされた後) */
    function fcBodyCollapsible(label, contentHtml, extraClass, openByDefault) {
        if (!contentHtml || !String(contentHtml).trim()) return '';
        return '<details class="sam-fc-collapse '+(extraClass||'')+'" '+(openByDefault?'open':'')+'>'
            + '<summary class="sam-fc-collapse-sum">'+esc(label)+'</summary>'
            + '<div class="sam-fc-content '+(extraClass||'')+'">'+contentHtml+'</div>'
            + '</details>';
    }
    /* セクション級の伸縮可能ブロック: title(emojiを含む) + 内容; 既定で展開 */
    function secBlock(title, contentHtml, openByDefault, headExtra) {
        return '<details class="sam-sec" '+(openByDefault === false ? '' : 'open')+'>'
            + '<summary class="sam-sec-sum"><span class="sam-sec-title">'+esc(title)+'</span>'+(headExtra||'')+'</summary>'
            + '<div class="sam-sec-body">'+(contentHtml||'')+'</div>'
            + '</details>';
    }

    /* ===== 32b. NPC削除(MVUへ書き戻し) ===== */
    function deleteNpc(name) {
        if (!name) return;
        var ok = writeBackMvu(function(statData) {
            if (statData && statData.关系リスト && statData.关系リスト[name]) {
                delete statData.关系リスト[name];
                try { console.log('%c[主神端末] ✅ NPCを削除しました: '+name, 'color:#86efac'); } catch(e){}
            }
        });
        if (ok) { try { closeModal(); } catch(e){} renderAll(); }
    }

    /* ===== 32b2. 世界エントリの削除(探索ポイント/勢力など, MVUへ書き戻し) =====
       fullKey: 完全なパス 例 "世界.探索.城镇废墟" / "世界.勢力.黑鹰团"
       parentPath: 親オブジェクトのパス 例 "世界.探索" / "世界.勢力"
       key: 末尾セグメント名, 通知に使用
    */
    function deleteWorldEntry(fullKey, parentPath, key) {
        if (!fullKey) return;
        var ok = writeBackMvu(function(statData) {
            // 汎用のドットパス削除: パスに沿って最後から二番目のセグメントまで進み, 末尾セグメントを削除
            var parts = fullKey.split('.');
            var obj = statData;
            for (var i = 0; i < parts.length - 1; i++) {
                if (!obj || typeof obj !== 'object') return;
                obj = obj[parts[i]];
            }
            if (obj && typeof obj === 'object' && obj.hasOwnProperty(parts[parts.length-1])) {
                delete obj[parts[parts.length-1]];
                try { console.log('%c[主神端末] ✅ 世界エントリを削除しました: '+fullKey, 'color:#86efac'); } catch(e){}
            }
        });
        if (ok) { samToast('success', '削除しました: ' + (key || fullKey)); renderAll(); }
        else samToast('error', '削除失敗: MVU書き戻しが利用できません');
    }

    /* ===== 32c. 装備/アイテム操作ボタン(装備/外す/収納/取り出す/削除) ===== */
    function actBtn(label, action, path, kind, type, key) {
        return '<button class="sam-act-btn" data-act="'+esc(action)+'" data-path="'+esc(path)+'" data-kind="'+esc(kind)+'" data-type="'+esc(String(type==null?'':type))+'" data-key="'+esc(key||'')+'">'+esc(label)+'</button>';
    }
    /* 装備操作ボタン: 状態0(装備ボックス)=装備/収納/削除; 状態1(タクティカル枠)=外す/収納/削除; 状態2(倉庫)=装備/取り出す/削除; 类型8(特殊)はボタンなし
       editMode が true のときのみ削除ボタンを生成(それ以外は装備/外す/収納/取り出すのみ表示) */
    function equipActionButtons(path, status, type, editMode) {
        if (type === 8) return ''; // 特殊装備: 制限もボタンもなし
        var key = path.split('.').pop();
        var delBtn = editMode ? actBtn('削除','delete',path,'equip',type,key) : '';
        if (status === 0) return actBtn('装備','wear',path,'equip',type,key)+actBtn('収納','store',path,'equip',type,key)+delBtn;
        if (status === 1) return actBtn('外す','remove',path,'equip',type,key)+actBtn('収納','store',path,'equip',type,key)+delBtn;
        if (status === 2) return actBtn('装備','wear',path,'equip',type,key)+actBtn('取り出す','takeback',path,'equip',type,key)+delBtn;
        return '';
    }
    /* アイテム操作ボタン: 状態0(アイテムボックス)=装備/収納/削除; 状態1(タクティカル枠)=外す/収納/削除; 状態2(倉庫)=装備/取り出す/削除
       editMode が true のときのみ削除ボタンを生成 */
    function itemActionButtons(path, status, editMode) {
        var key = path.split('.').pop();
        var delBtn = editMode ? actBtn('削除','delete',path,'item','',key) : '';
        if (status === 0) return actBtn('装備','wear',path,'item','',key)+actBtn('収納','store',path,'item','',key)+delBtn;
        if (status === 1) return actBtn('外す','remove',path,'item','',key)+actBtn('収納','store',path,'item','',key)+delBtn;
        if (status === 2) return actBtn('装備','wear',path,'item','',key)+actBtn('取り出す','takeback',path,'item','',key)+delBtn;
        return '';
    }
    function samToast(type, msg) {
        try {
            if (typeof toastr !== 'undefined' && toastr[type]) { toastr[type]('[主神端末] '+msg); return; }
        } catch(e){}
        try { console.log('%c[主神端末] '+msg, 'color:'+(type==='success'?'#86efac':type==='warning'?'#fbbf24':type==='error'?'#f87171':'#8b95a6')); } catch(e){}
    }
    /* ===== 32c2. ショップ市場エリア: 正規化/解析/カート/描画/実行 =====
       打开商店代码.htmlから移植, パートナー取引(スペースコイン相互送金+複数受取人の分帳)を削除,
       キャラクター単独の買い物のみを保持. エリアは 装備|アイテム|スキル|血統(4類)に変更.
       装備エリアは"左タイプnav + 右アイテムlist"レイアウトに従う; その他のエリアは単一列list. */
    // ---- フィールド正規化層(ES5書き換え) ----
    function shopPick(obj) {
        for (var i = 1; i < arguments.length; i++) {
            var k = arguments[i];
            var v = obj[k];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        return undefined;
    }
    function shopPickNum(obj) {
        var v = shopPick.apply(null, arguments);
        if (v === undefined) return undefined;
        var n = parseInt(String(v).replace(/[^0-9\-]/g, ''), 10);
        return isNaN(n) ? undefined : n;
    }
    // 装備タイプ(数値0-8)→スロットlabel, EQUIP_SLOTS マップ表を再利用
    function shopEquipTypeLabel(typeNum) {
        var n = parseInt(typeNum, 10);
        if (isNaN(n)) return '装備';
        for (var i = 0; i < EQUIP_SLOTS.length; i++) {
            if (EQUIP_SLOTS[i].type === n) return EQUIP_SLOTS[i].label;
        }
        return '装備';
    }
    // スキルタイプ(数値0-2)→日本語label: 0-アクティブ 1-パッシブ 2-特殊
    function shopSkillTypeLabel(typeNum) {
        var n = parseInt(typeNum, 10);
        if (n === 1) return 'パッシブ';
        if (n === 2) return '特殊';
        return 'アクティブ';
    }
    function shopNormalizeTags() {
        var tags = [];
        var add = function(value) {
            if (!value) return;
            if (Array.isArray(value)) { value.forEach(add); return; }
            String(value).split(/[;；,，、|]/).forEach(function(s) {
                var t = s.trim();
                if (t && tags.indexOf(t) < 0) tags.push(t);
            });
        };
        for (var i = 0; i < arguments.length; i++) add(arguments[i]);
        return tags;
    }
    // フォールバック: ショップ商品のタグに出所キーワード(主神/系统/手工)が無い場合, "主神空間"タグを強制注入
    // 理由: ショップは主神空間で稼働しており, 売却された商品は天然に合法資産; AIが出所タグを書き漏らした場合のフォールバックで, 適応圧縮の免除を受けられるようにする
    var SHOP_SOURCE_KEYWORDS = ['主神', '系统', '手工'];
    function shopEnsureSourceTag(rawTags) {
        var arr = shopNormalizeTags(rawTags);
        var hasSource = arr.some(function(t) {
            return SHOP_SOURCE_KEYWORDS.some(function(kw) { return String(t).indexOf(kw) >= 0; });
        });
        if (!hasSource) arr.push('主神空間');
        return arr;
    }
    function shopNormalizeDamageAttr(value) {
        var text = String(value || '').trim();
        if (!text) return undefined;
        if (text === '物理' || text === '法术' || text === '真实') return text;
        if (/真|穿透|无视/.test(text)) return '真实';
        if (/物理|斩|刺|钝|枪|弹|箭|刀|剑/.test(text)) return '物理';
        return '法术';
    }
    function shopNormalizeSlotType(value) {
        var text = String(value || '').trim();
        if (text === '法器' || text === '法术武器') return '武器';
        return text || undefined;
    }
    // passive_stats を統一的に解析し { hp_bonus, atk_bonus, ... }(構造化オブジェクトと文字列の両形式に対応) を返す
    function shopNormalizePassiveStats(raw) {
        var out = {};
        if (!raw) return out;
        if (typeof raw === 'object' && !Array.isArray(raw)) {
            var keyMap = {
                hp_bonus:           ['hp_bonus','HP上限','HP加成','生命上限','HP','hp'],
                mp_bonus:           ['mp_bonus','MP上限','MP加成','法力上限','MP','mp'],
                atk_bonus:          ['atk_bonus','ATK加成','ATK','攻击','力量加成'],
                def_bonus:          ['def_bonus','DEF加成','DEF','防御','防御加成'],
                spell_atk_bonus:    ['spell_atk_bonus','法术ATK加成','法术ATK','法攻','法术攻击'],
                spell_power_bonus:  ['spell_power_bonus','法术强度加成','法术强度','法强'],
                mdef_bonus:          ['mdef_bonus','MDEF加成','魔法防御加成','MDEF','魔防'],
                saving_throw_bonus: ['saving_throw_bonus','豁免','豁免加成']
            };
            for (var std in keyMap) {
                if (!keyMap.hasOwnProperty(std)) continue;
                var v = shopPick.apply(null, [raw].concat(keyMap[std]));
                if (v !== undefined) out[std] = parseInt(v, 10) || 0;
            }
            return out;
        }
        if (typeof raw === 'string') {
            var attrMap = {
                hp_bonus:           /HP上限|HP加成|hp_bonus|生命上限|HP/i,
                mp_bonus:           /MP上限|MP加成|mp_bonus|法力上限|MP/i,
                atk_bonus:          /atk_bonus|攻击加成|ATK加成|ATK(?!加成)/i,
                def_bonus:          /def_bonus|防御加成|DEF加成|DEF/i,
                spell_atk_bonus:    /spell_atk_bonus|法术ATK加成|法术ATK|法攻/i,
                spell_power_bonus:  /spell_power_bonus|法术强度加成|法术强度|法强/i,
                mdef_bonus:          /mdef_bonus|MDEF加成|魔法防御加成|MDEF|魔防/i,
                saving_throw_bonus: /saving_throw_bonus|豁免加成|豁免/i
            };
            for (var s2 in attrMap) {
                if (!attrMap.hasOwnProperty(s2)) continue;
                var m = raw.match(new RegExp(attrMap[s2].source + '[\\s]*[\\+＋]([\\d]+)', 'i'));
                if (m) out[s2] = parseInt(m[1], 10);
            }
        }
        return out;
    }
    function shopNormalizeSkill(raw) {
        var rawCat = shopPick(raw, 'タイプ','category');
        // 元の数値を保持(キャラクター側 skill_item.タイプ: clampNum(0,0,2))
        var catNum = (typeof rawCat === 'number') ? rawCat
            : (typeof rawCat === 'string' && /^\d+$/.test(String(rawCat))) ? parseInt(String(rawCat), 10)
            : 0;
        var category = shopSkillTypeLabel(catNum);
        var item = {
            name:        shopPick(raw, 'name','名称','技能名','技能名称') || '名称未設定',
            level:       shopPickNum(raw, 'level','等级','数值等级'),
            rating:      shopPick(raw, 'rating','品级','品質','评级'),
            price:       parseInt(String(shopPick(raw, 'price','価格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            category_num: catNum,
            category:    category,                          // タイプlabel(アクティブ/パッシブ/特殊)
            cost:        shopPick(raw, '消費','mp_cost','MP消耗','法力消耗','mp','MP'),  // 新構造: '8MP' のような文字列
            effects:     shopPick(raw, '効果','effect','技能效果'),  // 新構造: オブジェクト {主动:'単体に3d6の火炎ダメージを与える'}
            description: shopPick(raw, 'description','説明','技能描述','説明'),
            tags:        shopEnsureSourceTag(shopPick(raw, 'tags','タグ'))
        };
        return item;
    }
    function shopNormalizeBloodline(raw) {
        var rawAttrs = shopPick(raw, '原始属性','基础属性','属性');  // 新構造: オブジェクト {力量:4, 体质:4}
        var rawEffects = shopPick(raw, '効果','特殊效果','特效');    // 新構造: オブジェクト {被动:'毎ターン5%HP回復'}
        var item = {
            name:       shopPick(raw, 'name','名称','血统名','血统名称') || '名称未設定',
            level:      shopPickNum(raw, 'level','等级','数值等级'),
            rating:     shopPick(raw, 'rating','品级','品質','评级'),
            price:      parseInt(String(shopPick(raw, 'price','価格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            raw_attrs:  rawAttrs,
            effects:    rawEffects,
            description: shopPick(raw, 'description','説明','血统描述','説明','効果'),
            tags:        shopEnsureSourceTag(shopPick(raw, 'tags','タグ'))
        };
        return item;
    }
    // 形態リストの正規化: キャラクター側の 形态库 エントリ構造 {层级, 消耗, 状态, 标签, 原始属性, 效果, 技能, 描述} に合わせる
    //   スキル子リストはキャラクター側 skill_item と一致するよう正規化: {品质, 类型(0-2), 标签, 效果, 描述, 消耗}
    function shopNormalizeFormSkill(raw) {
        var rawType = shopPick(raw, 'タイプ','type');
        var catNum = (typeof rawType === 'number') ? rawType
            : (typeof rawType === 'string' && /^\d+$/.test(String(rawType))) ? parseInt(String(rawType), 10) : 0;
        return {
            name:    shopPick(raw, 'name','名称','技能名','技能名称') || '',
            品質:    shopPick(raw, 'rating','品質','品级','评级') || '',
            タイプ:    catNum,
            タグ:    shopEnsureSourceTag(shopPick(raw, 'tags','タグ')),
            効果:    shopPick(raw, '効果','effect','技能效果') || {},
            説明:    shopPick(raw, 'description','説明','技能描述','説明') || '',
            消費:    shopPick(raw, '消費','mp_cost','MP消耗','法力消耗','mp','MP') || '无'
        };
    }
    function shopNormalizeForm(raw) {
        var rawSkills = shopPick(raw, '技能','skills');
        var skills = [];
        if (Array.isArray(rawSkills)) {
            for (var i = 0; i < rawSkills.length; i++) {
                if (rawSkills[i] && typeof rawSkills[i] === 'object') skills.push(shopNormalizeFormSkill(rawSkills[i]));
            }
        }
        // 层级 フィールドが"品质"に取って代わった; AI が依然 品质 フィールドを出力する場合の互換フォールバック
        var tier = shopPick(raw, '階層','level','tier');
        if (tier == null || tier === '') tier = shopPick(raw, 'rating','品質','品级','评级') || '';
        // ローマ数字(Ⅰ~Ⅸ)へ正規化; AI が品質文字(F~SSS)を出力する可能性 → 対応するローマ数字へ変換し, 元の文字は保存しない
        if (tier !== '') tier = tierRomanOf(tier);
        return {
            name:          shopPick(raw, 'name','名称','形态名','形态名称') || '名称未設定',
            price:         parseInt(String(shopPick(raw, 'price','価格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            tier:          String(tier),
            cost:          shopPick(raw, '消費','mp_cost','MP消耗','法力消耗','mp','MP') || '',
            status:        shopPick(raw, 'status','状態') || '完好',
            raw_attrs:     shopPick(raw, '原始属性','基础属性','属性') || {},
            effects:       shopPick(raw, '効果','特效','特殊效果') || {},
            skills:        skills,
            description:   shopPick(raw, 'description','説明','説明') || '',
            tags:          shopEnsureSourceTag(shopPick(raw, 'tags','タグ'))
        };
    }
    // アップグレードリストの正規化: 所属大分類(血統/スキル/装備/形態)ごとに元の構造 + 置換対象を保持
    function shopNormalizeUpgrade(raw) {
        var rawType = shopPick(raw, 'タイプ','type');
        var typeNum = (typeof rawType === 'number') ? rawType
            : (typeof rawType === 'string' && /^\d+$/.test(String(rawType))) ? parseInt(String(rawType), 10) : 0;
        var rawCat = shopPick(raw, '所属カテゴリ','category') || '';
        // 形態アップグレード: 层级(ローマ数字) が 品质 文字に取って代わる, カード右上と保存に使用
        var formTier = (rawCat === '形态') ? tierRomanOf(shopPick(raw, '階層','level','tier','rating','品質','品级','评级') || 'Ⅰ') : '';
        // 形態アップグレード: 技能 子配列 + 状态 フィールドを正規化( shopBuildUpgradeCard のスキルブロック描画, shopToFormVar の保存に供する)
        var formSkills = [], formStatus = '完好';
        if (rawCat === '形态') {
            formStatus = shopPick(raw, 'status','状態') || '完好';
            var rawSkills = shopPick(raw, '技能','skills');
            if (Array.isArray(rawSkills)) {
                for (var si = 0; si < rawSkills.length; si++) {
                    if (rawSkills[si] && typeof rawSkills[si] === 'object') formSkills.push(shopNormalizeFormSkill(rawSkills[si]));
                }
            }
        }
        return {
            name:           shopPick(raw, 'name','名称') || '名称未設定',
            level:          shopPickNum(raw, 'level','等级','数值等级'),
            rating:         shopPick(raw, 'rating','品级','品質','评级'),
            tier:           formTier,
            category:       rawCat,
            price:          parseInt(String(shopPick(raw, 'price','価格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            replace_target: shopPick(raw, 'replace_target','置換対象') || '',
            category_num:   typeNum,
            slot_type:      shopEquipTypeLabel(typeNum),
            slot_type_num:  typeNum,
            cost:           shopPick(raw, '消費','mp_cost','MP消耗','法力消耗','mp','MP') || '',
            raw_attrs:      shopPick(raw, '原始属性','基础属性','属性'),
            effects:        shopPick(raw, '効果','特效','特殊效果'),
            description:    shopPick(raw, 'description','説明','説明'),
            '説明':         shopPick(raw, 'description','説明','説明'),
            tags:           shopEnsureSourceTag(shopPick(raw, 'tags','タグ')),
            skills:         formSkills,
            status:         formStatus
        };
    }
    function shopNormalizeEquip(raw) {
        var rawType = shopPick(raw, 'タイプ','type','槽位','部位','slot_type');
        // 元の数値を保持(キャラクター側 equip_item.タイプ: clampNum(0,0,8))
        var typeNum = (typeof rawType === 'number') ? rawType
            : (typeof rawType === 'string' && /^\d+$/.test(String(rawType))) ? parseInt(String(rawType), 10)
            : 0;
        var slotType = shopEquipTypeLabel(typeNum);
        var item = {
            name:      shopPick(raw, 'name','名称','装备名','装备名称') || '名称未設定',
            level:     shopPickNum(raw, 'level','等级','数值等级'),
            rating:    shopPick(raw, 'rating','品级','品質','评级'),
            price:     parseInt(String(shopPick(raw, 'price','価格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            slot_type: slotType,
            slot_type_num: typeNum,
            raw_attrs: shopPick(raw, '原始属性','基础属性','属性'),  // 新構造: オブジェクト {力量:1, 体质:2}
            effects:   shopPick(raw, '効果','特效','special_effect','特殊效果','特性'),  // 新構造: オブジェクト {被动:'物理防御+3'}
            cost:      shopPick(raw, '消費','mp_cost','MP消耗','法力消耗','mp','MP') || '',
            '説明':    shopPick(raw, '説明','description','説明'),
            tags:      shopEnsureSourceTag(shopPick(raw, 'tags','タグ'))
        };
        return item;
    }
    function shopNormalizeConsume(raw) {
        return {
            name:            shopPick(raw, 'name','名称','道具名','物品名') || '名称未設定',
            level:           shopPickNum(raw, 'level','等级','数值等级'),
            rating:          shopPick(raw, 'rating','品级','品質','评级'),
            price:           parseInt(String(shopPick(raw, 'price','価格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            consumable_type: shopPick(raw, 'consumable_type','タイプ','道具类型','分类') || '道具',
            charges:         shopPickNum(raw, 'charges','数量','次数','使用次数'),
            effects:         shopPick(raw, '効果','usage','使用效果'),  // 新構造: オブジェクト {使用:'恢复2d4+2HP'}
            description:     shopPick(raw, 'description','説明','説明'),
            tags:            shopEnsureSourceTag(shopPick(raw, 'tags','タグ'))
        };
    }
    // ショップデータ全体を標準化: { 装备区:{typeLabel:[...]}, 技能区:{typeLabel:[...]}, 道具区:{typeLabel:[...]}, 血统区:[] } を産出
    // 新構造: 商城.装備リスト/技能列表/血统列表/道具列表 はいずれもフラット配列
    // 装備/スキル/アイテムは「类型」ごとに子オブジェクトへグループ化し, 左navのタイプ切替に供する; 血統は純粋な配列
    function shopNormalizeMarketData(raw) {
        var out = { 装备区:{}, 道具区:{}, 技能区:{}, 血统区:[], 升级区:[], 形态区:[] };
        if (!raw || typeof raw !== 'object') return out;
        // 装备列表(フラット配列) → 类型(数値0-8)ごとに {スロットlabel: [...]} へグループ化
        var equips = raw['装備リスト'];
        if (Array.isArray(equips)) {
            for (var i = 0; i < equips.length; i++) {
                if (!equips[i] || typeof equips[i] !== 'object') continue;
                var e = shopNormalizeEquip(equips[i]);
                var sl = e.slot_type || '装備';
                if (!out.装备区[sl]) out.装备区[sl] = [];
                out.装备区[sl].push(e);
            }
        }
        // 技能列表(フラット配列) → 类型(数値0-2)ごとに {タイプlabel: [...]} へグループ化
        var skills = raw['技能リスト'];
        if (Array.isArray(skills)) {
            for (var j = 0; j < skills.length; j++) {
                if (!skills[j] || typeof skills[j] !== 'object') continue;
                var s = shopNormalizeSkill(skills[j]);
                var sc = s.category || 'アクティブ';
                if (!out.技能区[sc]) out.技能区[sc] = [];
                out.技能区[sc].push(s);
            }
        }
        // 道具列表(フラット配列) → 类型(文字列, 恢复/战术/特殊など)ごとに {タイプlabel: [...]} へグループ化
        var consumables = raw['道具リスト'];
        if (Array.isArray(consumables)) {
            for (var ci = 0; ci < consumables.length; ci++) {
                if (!consumables[ci] || typeof consumables[ci] !== 'object') continue;
                var c = shopNormalizeConsume(consumables[ci]);
                var ct = c.consumable_type || '道具';
                if (!out.道具区[ct]) out.道具区[ct] = [];
                out.道具区[ct].push(c);
            }
        }
        // 血统列表(フラット配列)
        var bloods = raw['血統リスト'];
        if (Array.isArray(bloods)) {
            for (var bi = 0; bi < bloods.length; bi++) {
                if (bloods[bi] && typeof bloods[bi] === 'object') out.血统区.push(shopNormalizeBloodline(bloods[bi]));
            }
        }
        // 升级列表(フラット配列, 子グループ無し)
        var upgrades = raw['升級リスト'];
        if (Array.isArray(upgrades)) {
            for (var ui = 0; ui < upgrades.length; ui++) {
                if (upgrades[ui] && typeof upgrades[ui] === 'object') out.升级区.push(shopNormalizeUpgrade(upgrades[ui]));
            }
        }
        // 形态列表(フラット配列, 子グループ無し)
        var forms = raw['形态列表'];
        if (Array.isArray(forms)) {
            for (var fi = 0; fi < forms.length; fi++) {
                if (forms[fi] && typeof forms[fi] === 'object') out.形态区.push(shopNormalizeForm(forms[fi]));
            }
        }
        return out;
    }
    // ---- 変数変換層: 標準化エントリ → MVU変数形式 ----
    function shopParsePercent(value) {
        if (value === undefined || value === null) return 0;
        if (typeof value === 'number') return value;
        var text = String(value);
        return parseFloat(text) || 0;
    }
    // 正規化商品 → キャラクター側変数へ変換(スキル: 类型は数値0-2を出力しskill_itemに一致)
    function shopToSkillVar(item) {
        var out = {
            等级: item.level,
            品質: item.rating,
            タイプ: item.category_num != null ? item.category_num : 0,
            消費: item.cost || '',
            効果: item.effects || {},
            説明: item.description || ''
        };
        if (item.tags && item.tags.length) out.タグ = item.tags;
        return out;
    }
    // 正規化商品 → キャラクター側変数へ変換(血統: 原始属性/效果はいずれもオブジェクト)
    function shopToBloodlineVar(item) {
        var out = {
            等级: item.level,
            品質: item.rating,
            原始属性: item.raw_attrs || {},
            効果: item.effects || {},
            説明: item.description || ''
        };
        if (item.tags && item.tags.length) out.タグ = item.tags;
        return out;
    }
    // 正規化商品 → キャラクター側変数へ変換(装備: 类型は数値0-8を出力しequip_itemに一致, 状态の既定は未装備=0)
    function shopToEquipVar(item, slot) {
        var out = {
            タイプ: item.slot_type_num != null ? item.slot_type_num : 0,
            状態: 0,
            品質: item.rating,
            タグ: (item.tags && item.tags.length) ? item.tags : [],
            原始属性: item.raw_attrs || {},
            効果: item.effects || {},
            説明: item['説明'] || '',
            消費: item.cost || ''
        };
        return out;
    }
    // 正規化商品 → キャラクター側変数へ変換(アイテム: 类型 は文字列, 数量 は併合, 效果 はオブジェクト)
    function shopToConsumeVar(item, qty) {
        var out = {
            品質: item.rating,
            タイプ: item.consumable_type || '道具',
            数量: qty,
            タグ: (item.tags && item.tags.length) ? item.tags : [],
            効果: item.effects || {},
            説明: item.description || '',
            状態: 0
        };
        return out;
    }
    // 正規化商品 → キャラクター側変数へ変換(形態: 形态库 のエントリ構造に合わせ, キーは形態名)
    //   構造 {层级, 消耗, 状态, 标签, 原始属性, 效果, 技能, 描述}; クールダウン未指定時はシステムが1ターンでフォールバック
    function shopToFormVar(item, formName) {
        // スキル子リストを skill_item 構造 {品质, 类型, 标签, 效果, 描述, 消耗} に整える
        var skillsOut = {};
        var srcSkills = Array.isArray(item.skills) ? item.skills : [];
        for (var i = 0; i < srcSkills.length; i++) {
            var sk = srcSkills[i] || {};
            var skName = shopPick(sk, 'name','名称') || ('技能' + (i + 1));
            skillsOut[skName] = {
                品質: sk.品質 || '',
                タイプ: (sk.タイプ != null) ? sk.タイプ : 0,
                タグ: (sk.タグ && sk.タグ.length) ? sk.タグ : [],
                効果: sk.効果 || {},
                説明: sk.説明 || '',
                消費: sk.消費 || '无'
            };
        }
        return {
            階層:     (item.tier != null && item.tier !== '') ? tierRomanOf(item.tier) : '',
            消費:     item.cost || '',
            状態:     item.status || '完好',
            タグ:     (item.tags && item.tags.length) ? item.tags : [],
            原始属性: item.raw_attrs || {},
            効果:     item.effects || {},
            技能:     skillsOut,
            説明:     item.description || ''
        };
    }
    // 派生属性を再計算(体力/精神 + 血統パッシブ + 装備済みDEF/MDEF)
    function shopRecalcDerived(character) {
        if (!character) return;
        var base = character.基础属性 || {};
        var old = character.衍生属性 || {};
        var oldHpMax = Math.max(Number(old.HP上限 || old.HP || 1), 1);
        var oldMpMax = Math.max(Number(old.MP上限 || old.MP || 1), 1);
        var hpRatio = Math.min(1, Math.max(0, Number(old.HP || 0) / oldHpMax));
        var mpRatio = Math.min(1, Math.max(0, Number(old.MP || 0) / oldMpMax));
        var bonus = { HP加成:0, MP加成:0, ATK加成:0, DEF加成:0, 法术ATK加成:0, 法术强度加成:0, MDEF加成:0, 豁免加成:0 };
        var bloods = character.血統 || {};
        for (var bn in bloods) {
            if (!bloods.hasOwnProperty(bn)) continue;
            var ps = bloods[bn] ? bloods[bn].被动属性 : null;
            if (!ps) continue;
            for (var bk in bonus) {
                if (!bonus.hasOwnProperty(bk)) continue;
                var val = (bk === '法术强度加成') ? shopParsePercent(ps[bk]) : Number(ps[bk] || 0);
                bonus[bk] += Number.isFinite(val) ? val : 0;
            }
        }
        var equipDef = 0, equipMdef = 0;
        var eqs = character.装備 || {};
        for (var en in eqs) {
            if (!eqs.hasOwnProperty(en)) continue;
            var eq = eqs[en];
            if (!eq || eq.状態 !== '已装备') continue;
            equipDef  += Number(eq.DEF || 0);
            equipMdef += Number(eq.MDEF || 0);
        }
        var hpMax = Math.max(1, Number(base.体力 || 0) * 5 + bonus.HP加成);
        var mpMax = Math.max(0, Number(base.精神 || 0) * 5 + bonus.MP加成);
        var derived = {};
        for (var ok in old) { if (old.hasOwnProperty(ok)) derived[ok] = old[ok]; }
        derived.HP上限 = hpMax;
        derived.HP = Math.max(1, Math.min(hpMax, Math.round(hpMax * hpRatio)));
        derived.MP上限 = mpMax;
        derived.MP = Math.max(0, Math.min(mpMax, Math.round(mpMax * mpRatio)));
        derived.ATK = Math.floor(Number(base.筋力 || 0) / 5) + bonus.ATK加成;
        derived.DEF = equipDef + bonus.DEF加成;
        derived.MDEF = equipMdef + bonus.MDEF加成;
        derived.法术ATK = Math.floor(Number(base.智力 || 0) / 5) + bonus.法术ATK加成;
        derived.法术强度 = shopParsePercent(bonus.法术强度加成) / 100;
        if (bonus.豁免加成) derived.豁免加成 = bonus.豁免加成;
        character.衍生属性 = derived;
    }
    // ---- ショップ状態(モジュール級, チャット切替/再描画時も持続) ----
    var shopMarketData = null;     // 正規化後の市場データ(4区)
    var shopActiveTab = '';        // 現在の区域: 装備|アイテム|スキル|血統
    var shopActiveSlot = '';       // 現在の装備区スロット
    var shopBloodCount = 0;        // 現在のプレイヤーが所持する血統数(ショップ血統区の上限判定に使用)
    var shopBloodLimit = 3;        // 血統数の上限(取得元 共同.血统限制数)
    var shopCart = [];             // カート(角色単独, 各項目 {itemの複製, _cat, _slot, quantity})
    var shopRefreshing = false;    // 商品更新実行中(モジュール級フラグ, チャット切替/再描画時も持続, ボタン状態の消失を回避)
    var shopRefreshEpoch = 0;      // 更新ラウンドのカウンタ: handleShopRefresh ごとに +1, 旧 Promise のコールバックはラウンド不一致時に結果を破棄("更新を停止"でハングしたリクエストを中断可能)
    var shopReqText = '';          // 要望入力欄の内容(モジュール級, 更新を跨いで保持: 更新後 renderAll がDOMを再構築するため, value 属性で再設定して失われないようにする; 不満なら元の要望を基に再更新可能)
    // ★ 複数キャラのショップ: 現在選択中の購入対象。'角色' はキャラクター自身, それ以外は 关系列表 内の NPC 名
    var shopCurrentActor = 'キャラ';
    // キャラクター固有のショップ商品ライブラリの保存名: 商城.メンバー商品庫 = { '<角色名键>': { 血统列表:[...], 技能列表:[...], 装备列表:[...], 道具列表:[...], 升级列表:[...] } }
    // '角色'キー はキャラクター自身のショップ商品に対応(旧来の stat_data.商城 トップレベル構造と互換); NPC キー はその NPC のショップ商品に対応
    var SHOP_ACTOR_LIB_KEY = 'メンバー商品庫';  // 商城 の下で複数キャラの商品ライブラリを格納する子キー名
    var SHOP_ACTOR_REINCARNATOR = 'キャラ';          // 角色 キー名の定数
    // ===== ★ 複数キャラのショップ: 角色 切替と商品ライブラリ分離の補助 =====
    // 選択可能なキャラクターのドロップダウン項目を取得: 角色 自身 + 关系列表 内で 在场=true かつ 是否队友=true の NPC
    // [{name, label}]を返す, name='角色' または NPC名; label はドロップダウン表示に使用
    function shopBuildActorOptions(sd) {
        var list = [{ name: SHOP_ACTOR_REINCARNATOR, label: 'キャラ(自身)' }];
        var relations = (sd && sd.关系リスト) ? sd.关系リスト : null;
        if (relations && typeof relations === 'object') {
            var allNpc = Object.keys(relations);
            allNpc.sort();
            for (var i = 0; i < allNpc.length; i++) {
                var nm = allNpc[i];
                var npc = relations[nm];
                if (!npc || typeof npc !== 'object') continue;
                if (npc.登場 !== true) continue;
                if (npc.仲間 !== true) continue;
                list.push({ name: nm, label: nm });
            }
        }
        return list;
    }
    // 現在のキャラクターオブジェクトを解決 {character, path, isReincarnator, name}
    function shopResolveCharacter(sd, actorName) {
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        if (actorName === SHOP_ACTOR_REINCARNATOR) {
            return { character: (sd && sd.キャラ) || {}, path: 'キャラ', isReincarnator: true, name: SHOP_ACTOR_REINCARNATOR };
        }
        var npc = (sd && sd.关系リスト && sd.关系リスト[actorName]) ? sd.关系リスト[actorName] : null;
        return { character: npc || {}, path: '関係リスト.' + actorName, isReincarnator: false, name: actorName };
    }
// SHOP_PERMISSION_GUARD_START
var SHOP_PERMISSION_QUALITY_ORDER = ['F','E','D','C','B','A','S','SS','SSS'];
var SHOP_PERMISSION_TIER_ORDER = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'];
var SHOP_CREDENTIAL_SPEND_MIN_RANK = 3; // C級から越階購入/アップグレードの証憑消費を実行
function shopPermissionRank(value) {
    var raw = String(value == null ? '' : value).trim().toUpperCase().replace(/\s+/g, '').replace(/级$/, '');
    var qualityIndex = SHOP_PERMISSION_QUALITY_ORDER.indexOf(raw);
    if (qualityIndex >= 0) return qualityIndex;
    var tierIndex = SHOP_PERMISSION_TIER_ORDER.indexOf(raw);
    if (tierIndex >= 0) return tierIndex;
    if (/^[1-9]$/.test(raw)) return Number(raw) - 1;
    return -1;
}
function shopPermissionGrade(rank) {
    rank = Number(rank);
    if (!Number.isFinite(rank)) return '?';
    rank = Math.max(0, Math.min(SHOP_PERMISSION_QUALITY_ORDER.length - 1, Math.floor(rank)));
    return SHOP_PERMISSION_QUALITY_ORDER[rank];
}
function shopPermissionCredentialRank(credentials) {
    var best = -1;
    var ledger = credentials && typeof credentials === 'object' ? credentials : {};
    for (var i = 0; i < SHOP_PERMISSION_QUALITY_ORDER.length; i++) {
        var grade = SHOP_PERMISSION_QUALITY_ORDER[i];
        if (Number(ledger[grade] || 0) > 0) best = i;
    }
    return best;
}
function shopPermissionCapRank(character, credentials) {
    var tierRank = shopPermissionRank(character && character.階層);
    if (tierRank < 0) tierRank = 0;
    var baseRank = Math.min(SHOP_PERMISSION_QUALITY_ORDER.length - 1, tierRank + 1);
    var credentialRank = shopPermissionCredentialRank(credentials || {});
    return Math.max(baseRank, credentialRank);
}
function shopPermissionItemRank(item) {
    if (!item || typeof item !== 'object') return -1;
    var tierRank = shopPermissionRank(item.tier);
    if (tierRank >= 0) return tierRank;
    return shopPermissionRank(item.rating);
}
function shopPermissionDecision(character, item, credentials) {
    var capRank = shopPermissionCapRank(character || {}, credentials || {});
    var requiredRank = shopPermissionItemRank(item);
    return {
        allowed: requiredRank >= 0 && requiredRank <= capRank,
        capRank: capRank,
        requiredRank: requiredRank,
        capGrade: shopPermissionGrade(capRank),
        requiredGrade: requiredRank >= 0 ? shopPermissionGrade(requiredRank) : '?'
    };
}
function shopPermissionMessage(decision, item) {
    var name = item && item.name ? item.name : '当該商品';
    if (!decision || decision.requiredRank < 0) return 'ショップ権限の検証に失敗: ' + name + ' の品質/階層が無効です';
    return '権限不足: 現在のショップ上限は' + decision.capGrade + '級，' + name + 'は' + decision.requiredGrade + '級';
}
/*
 * ショップ証憑消費：あくまで“実際の購入/アップグレード”のリソースコストを担い，既存のショップ可視権限は変更しない。
 * - F~D級：この規則によって証憑を消費することは決してない。
 * - C級以上：対象品質が購入対象の現在の生命階層に対応する品質より高い場合，対象品質の証憑×1を消費する。
 * - 複数階級を跨ぐ場合も最終的な対象品質のみを見る；血統融合の結果自体はこの関数を通らない。
 */
function shopCredentialRequirement(character, item) {
    var actorRank = shopPermissionRank(character && character.階層);
    if (actorRank < 0) actorRank = 0;
    var targetRank = shopPermissionItemRank(item);
    var required = targetRank >= SHOP_CREDENTIAL_SPEND_MIN_RANK && targetRank > actorRank;
    return {
        required: required,
        actorRank: actorRank,
        targetRank: targetRank,
        grade: required ? shopPermissionGrade(targetRank) : '',
        quantity: required ? 1 : 0
    };
}
function shopCredentialQty(credentials, grade) {
    var ledger = credentials && typeof credentials === 'object' ? credentials : {};
    return Math.max(0, Math.floor(Number(ledger[grade] || 0) || 0));
}
function shopCredentialUnits(item) {
    if (!item || item._cat !== '道具区') return 1;
    return Math.max(1, Math.floor(Number(item.quantity || 1) || 1));
}
function shopCredentialCartRequirements(character, cart) {
    var result = {};
    var list = Array.isArray(cart) ? cart : [];
    for (var i = 0; i < list.length; i++) {
        var item = list[i] || {};
        var req = shopCredentialRequirement(character || {}, item);
        if (!req.required) continue;
        var units = shopCredentialUnits(item);
        result[req.grade] = (result[req.grade] || 0) + units;
    }
    return result;
}
function shopCredentialShortages(credentials, requirements) {
    var missing = [];
    var reqs = requirements && typeof requirements === 'object' ? requirements : {};
    for (var i = 0; i < SHOP_PERMISSION_QUALITY_ORDER.length; i++) {
        var grade = SHOP_PERMISSION_QUALITY_ORDER[i];
        var need = Math.max(0, Math.floor(Number(reqs[grade] || 0) || 0));
        if (!need) continue;
        var have = shopCredentialQty(credentials, grade);
        if (have < need) missing.push({ grade: grade, need: need, have: have });
    }
    return missing;
}
function shopCredentialRequirementText(requirements) {
    var parts = [];
    var reqs = requirements && typeof requirements === 'object' ? requirements : {};
    for (var i = 0; i < SHOP_PERMISSION_QUALITY_ORDER.length; i++) {
        var grade = SHOP_PERMISSION_QUALITY_ORDER[i];
        var need = Math.max(0, Math.floor(Number(reqs[grade] || 0) || 0));
        if (need > 0) parts.push(grade + '×' + need);
    }
    return parts.join(' / ');
}
function shopCredentialShortageText(shortages) {
    var list = Array.isArray(shortages) ? shortages : [];
    return list.map(function(x) { return x.grade + '級×' + x.need + '（所持' + x.have + '）'; }).join(' / ');
}
function shopCredentialConsume(credentials, requirements) {
    if (!credentials || typeof credentials !== 'object') return Object.keys(requirements || {}).length === 0;
    if (shopCredentialShortages(credentials, requirements).length) return false;
    var reqs = requirements && typeof requirements === 'object' ? requirements : {};
    for (var i = 0; i < SHOP_PERMISSION_QUALITY_ORDER.length; i++) {
        var grade = SHOP_PERMISSION_QUALITY_ORDER[i];
        var need = Math.max(0, Math.floor(Number(reqs[grade] || 0) || 0));
        if (need > 0) credentials[grade] = shopCredentialQty(credentials, grade) - need;
    }
    return true;
}
function shopCredentialRefund(credentials, requirements) {
    if (!credentials || typeof credentials !== 'object') return;
    var reqs = requirements && typeof requirements === 'object' ? requirements : {};
    for (var i = 0; i < SHOP_PERMISSION_QUALITY_ORDER.length; i++) {
        var grade = SHOP_PERMISSION_QUALITY_ORDER[i];
        var qty = Math.max(0, Math.floor(Number(reqs[grade] || 0) || 0));
        if (qty > 0) credentials[grade] = shopCredentialQty(credentials, grade) + qty;
    }
}
// SHOP_PERMISSION_GUARD_END
    // shopCurrentActor: 現在選択中のNPCが候補リストに無い場合(退場済み/非チームメイト), 角色 へフォールバック
    function shopEnsureActorValid(sd) {
        if (shopCurrentActor === SHOP_ACTOR_REINCARNATOR) return;
        var opts = shopBuildActorOptions(sd);
        var found = false;
        for (var i = 0; i < opts.length; i++) { if (opts[i].name === shopCurrentActor) { found = true; break; } }
        if (!found) shopCurrentActor = SHOP_ACTOR_REINCARNATOR;
    }
    // 現在のキャラクターに対応する商品ライブラリオブジェクトを取得(読み書き時はそのオブジェクト参照を直接ディープコピー; 存在しなければ空構造を作成)
    //★ 互換アップグレード: 角色 が商庫を読む際, 成员商库 が存在しない場合, 旧来の stat_data.商城 トップレベル構造を踏襲する(後方互換)
    function shopGetActorLibRaw(rawMarket, actorName) {
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        if (!rawMarket) return null;
        var libMap = rawMarket[SHOP_ACTOR_LIB_KEY];
        if (libMap && typeof libMap === 'object' && libMap[actorName]) {
            return libMap[actorName];
        }
        if (actorName === SHOP_ACTOR_REINCARNATOR) {
            // 旧データ互換: トップレベルに 血统列表/技能列表... があれば 角色 の商庫として扱う
            if (Array.isArray(rawMarket.血統リスト) || Array.isArray(rawMarket.技能リスト)
                || Array.isArray(rawMarket.装備リスト) || Array.isArray(rawMarket.道具リスト) || Array.isArray(rawMarket.升級リスト) || Array.isArray(rawMarket.形态列表)) {
                return rawMarket;
            }
        }
        return null;
    }
    // .sam-shop-list のスクロール位置を保存・復元する(所持パネル renderAll の scrollTop 保持パターンを参考)
    // 原因: renderAll がパネルを再構築すると, 内部の .sam-shop-list(max-height:340px; overflow-y:auto)
    // の scrollTop がゼロに戻り, +/-ボタンやカード選択時に商品リストが先頭へ跳ぶ
    function shopPreserveScroll(fn) {
        var $list = $('#samsara-panel .sam-shop-list');
        var saved = $list.length ? ($list[0].scrollTop || 0) : 0;
        if (typeof fn === 'function') fn();
        if (saved > 0) {
            var $newList = $('#samsara-panel .sam-shop-list');
            if ($newList.length) {
                try { $newList[0].scrollTop = saved; } catch(e){}
                var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
                if (raf) raf(function(){ try { $newList[0].scrollTop = saved; } catch(e){} });
            }
        }
    }
    // ショップ市場エリアのみを部分更新(tabs+content+footer), 入口欄の要望入力欄は再構築しない, 削除済み入力欄への AutoComplete バインドエラーを回避
    function shopRefreshMarket() {
        shopPreserveScroll(function() {
            var $market = $('#samsara-panel .sam-shop-market');
            if ($market.length) { var sd = getStatData(); var coin = sd && sd.キャラ ? safeNum(sd.キャラ.スペースコイン, 0) : 0; $market.html(shopRenderTabs() + shopRenderContent(coin) + shopRenderFooter(coin)); }
            else renderAll();
        });
    }
    function shopCartCost() {
        var sum = 0;
        for (var i = 0; i < shopCart.length; i++) {
            sum += Number(shopCart[i].price || 0) * Number(shopCart[i].quantity || 1);
        }
        return sum;
    }
    // 残り残高 = 元の残高 - カート選択済み合計(無効化判定/事前チェック/カートバー表示に使用)
    function shopRemain(coin) { return coin - shopCartCost(); }
    function shopIsSelected(name, cat, slot) {
        for (var i = 0; i < shopCart.length; i++) {
            if (shopCart[i].name !== name || shopCart[i]._cat !== cat) continue;
            // アイテム区: カードは类型(恢复/战术/特殊)ごとにグループ描画される(slot非空)が, 数量コントロールがカートへ書き込む _slot は常に空,
            // それでも slot で厳密一致させると"選択済み/選択済み×N"バッジが永久に表示されない(選択状態の消失)。
            // よってアイテム区の選択同一性は name+cat のみで判定する( shopGetQty と一致), slot は無視する。
            if (cat === '道具区') return true;
            if (shopCart[i]._slot === (slot||'')) return true;
        }
        return false;
    }
    // アイテム区の数量を読み取る(入力欄への再設定用, 全量 renderAll 後のゼロ戻りを回避)
    function shopGetQty(name, cat) {
        for (var i = 0; i < shopCart.length; i++) {
            if (shopCart[i].name === name && shopCart[i]._cat === cat) return shopCart[i].quantity || 0;
        }
        return 0;
    }
    function shopToggleSelect(item, cat, slot) {
        var idx = -1;
        for (var i = 0; i < shopCart.length; i++) {
            if (shopCart[i].name === item.name && shopCart[i]._cat === cat && shopCart[i]._slot === (slot||'')) { idx = i; break; }
        }
        if (idx > -1) {
            shopCart.splice(idx, 1);
        } else {
            var permissionSd = getStatData() || {};
            var permissionCtx = shopResolveCharacter(permissionSd, shopCurrentActor);
            var permission = shopPermissionDecision(permissionCtx.character || {}, item, permissionSd.キャラ && permissionSd.キャラ.権限証憑);
            if (!permission.allowed) { samToast('warning', shopPermissionMessage(permission, item)); return; }
            // ★ 血統区の単一選択: 新しい血統を選ぶ前に, カート内の既存の他の血統エントリを除去する(複数血統の混入を回避),
            //   入口で選択される血統を必ず 1 件にし, 後続の shopHandleExec で追加の収束を不要にする
            if (cat === '血统区') {
                for (var j = shopCart.length - 1; j >= 0; j--) {
                    if (shopCart[j]._cat === '血统区') shopCart.splice(j, 1);
                }
            }
            var copy = {};
            for (var k2 in item) { if (item.hasOwnProperty(k2)) copy[k2] = item[k2]; }
            copy._cat = cat; copy._slot = slot || ''; copy.quantity = 1;
            shopCart.push(copy);
        }
        shopRefreshMarket();
    }
    function shopSetQty(name, cat, qty) {
        var s = null, idx = -1;
        for (var i = 0; i < shopCart.length; i++) {
            if (shopCart[i].name === name && shopCart[i]._cat === cat) { s = shopCart[i]; idx = i; break; }
        }
        if (qty <= 0) { if (idx > -1) shopCart.splice(idx, 1); }
        else if (s) { s.quantity = qty; }
        else {
            // アイテム区はグループ化オブジェクトに変更されたため, 全グループを走査して検索する
            var found = shopFindItems('道具区', '', name);
            found = found.length ? found[0] : null;
            if (found) {
                var c2 = {}; for (var k3 in found) { if (found.hasOwnProperty(k3)) c2[k3] = found[k3]; }
                c2._cat = cat; c2._slot = ''; c2.quantity = qty;
                shopCart.push(c2);
            }
        }
        shopRefreshMarket();
    }
    // ---- 描画層 ----
    function shopRatingClass(r) {
        if (!r) return '';
        if (String(r).indexOf('SS') === 0) return 'r-SS';
        if (r === 'S') return 'r-S';
        return 'r-' + r;
    }
    function shopChip(label, value) {
        return '<span class="sam-shop-chip"><b>'+esc(label)+':</b> '+esc(value)+'</span>';
    }
    // オブジェクトを chip リストへ展開(例 原始属性 {力量:1, 体质:2} → [力量:1][体质:2])
    function shopObjChips(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
        var html = '';
        for (var k in obj) {
            if (!obj.hasOwnProperty(k)) continue;
            var v = obj[k];
            if (v === undefined || v === null || v === '') continue;
            // 数値0は表示しない(装備/スキルの属性ボーナスは非0項目のみ書き込む)
            if (typeof v === 'number' && v === 0) continue;
            if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && Number(v) === 0) continue;
            html += shopChip(k, v);
        }
        return html;
    }
    // 効果は独立カードで逐次表示；その他のオブジェクト詳細は引き続きコンパクトなテキストモード
    function shopObjDetails(label, obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
        var parts = [];
        for (var k2 in obj) {
            if (!obj.hasOwnProperty(k2)) continue;
            var v2 = obj[k2];
            if (v2 === undefined || v2 === null || v2 === '') continue;
            if (label === '効果') {
                parts.push('<div class="sam-shop-effect-card"><div class="sam-shop-effect-card-name">'+esc(k2)+'</div><div class="sam-shop-effect-card-text">'+esc(String(v2))+'</div></div>');
            } else {
                parts.push(esc(k2)+'：'+esc(String(v2)));
            }
        }
        if (!parts.length) return '';
        if (label === '効果') {
            return '<section class="sam-shop-section sam-shop-effects-block"><div class="sam-shop-section-title">効果</div><div class="sam-shop-effect-list">'+parts.join('')+'</div></section>';
        }
        return '<div class="sam-shop-item-detail"><b>'+esc(label)+':</b> '+parts.join('；')+'</div>';
    }
    function shopSigned(v) {
        var n = Number(v);
        if (Number.isFinite(n)) return n > 0 ? '+'+n : String(n);
        return String(v);
    }
    var SHOP_STAT_LABELS = { hp_bonus:'HP', mp_bonus:'MP', atk_bonus:'ATK', def_bonus:'DEF', spell_atk_bonus:'法术ATK', spell_power_bonus:'法术强度', mdef_bonus:'MDEF', saving_throw_bonus:'豁免' };
    function shopStatChips(stats) {
        var html = '';
        for (var key in SHOP_STAT_LABELS) {
            if (!SHOP_STAT_LABELS.hasOwnProperty(key)) continue;
            if (stats && stats[key] !== undefined && stats[key] !== null) {
                // 数値0は表示しない
                if (safeNum(stats[key], 0) === 0) continue;
                html += shopChip(SHOP_STAT_LABELS[key], shopSigned(stats[key]));
            }
        }
        return html;
    }
    function shopTagChips(tags) {
        if (!tags || !tags.length) return '';
        var html = '';
        for (var i = 0; i < tags.length; i++) html += shopChip('タグ', tags[i]);
        return html;
    }
    function shopSpecialSummary(benefits, drawbacks) {
        var bt = (benefits && benefits.length) ? benefits.join('；') : '无';
        var dt = (drawbacks && drawbacks.length) ? drawbacks.join('；') : '无';
        return 'バフ：'+bt+'；副作用：'+dt;
    }
    function shopDetail(label, value) {
        if (value === undefined || value === null || value === '') return '';
        return '<div class="sam-shop-item-detail"><b>'+esc(label)+':</b> '+esc(String(value))+'</div>';
    }
    function shopAttrsBlock(attrs) {
        if (!attrs) return '';
        return '<section class="sam-shop-section sam-shop-basic-block"><div class="sam-shop-section-title">基本情報</div><div class="sam-shop-item-attrs">'+attrs+'</div></section>';
    }
    function shopDescription(value) {
        if (value === undefined || value === null || value === '') return '';
        return '<section class="sam-shop-section sam-shop-description-block"><div class="sam-shop-section-title">説明</div><div class="sam-shop-description-text">'+esc(String(value))+'</div></section>';
    }
    // カードヘッダ(name + 品質バッジ, 共通の品質色)
    function shopCardHead(item, tier) {
        var qc = parseRarity(item.rating);
        var hasTier = (tier != null && tier !== '');
        // 階層バッジがある場合(形態商品/形態アップグレード): 品質文字枠を隠し, 階層バッジで代替する(右上の唯一の識別子)
        var metaHtml = hasTier ? '' : '<div class="sam-shop-item-meta q-'+qc+'">'+esc(item.rating || '')+'</div>';
        // 階層バッジ: 品質バッジのスタイル(.sam-shop-item-meta + .q-{品質文字})を再利用し, ローマ数字のみを表示, 同じ品質の色調を適用
        var tierQc = parseRarity(tierQOfClass(tier));
        var tierBadge = hasTier ? '<div class="sam-shop-item-meta q-'+tierQc+'">'+esc(String(tier))+'</div>' : '';
        return '<div class="sam-shop-item-head"><div class="sam-shop-item-name">'+esc(item.name)+'</div>'
            + '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">'+tierBadge+metaHtml+'</div></div>';
    }
    function shopCredentialCostHtml(item) {
        var sd = getStatData() || {};
        var ctx = shopResolveCharacter(sd, shopCurrentActor);
        var req = shopCredentialRequirement(ctx.character || {}, item);
        if (!req.required) return '';
        return '<div class="sam-shop-credential-cost" style="font-size:11px;line-height:1.35;color:var(--sam-warning);font-weight:700">必要証憑：'+esc(req.grade)+'級権限証憑 ×1</div>';
    }
    function shopCardFoot(item, isConsume) {
        var curQty = isConsume ? shopGetQty(item.name, '道具区') : 0;
        var qtyHtml = isConsume ? '<div class="sam-shop-qty">'
            + '<button type="button" class="sam-shop-qty-btn" data-shop-qty-btn="minus" data-name="'+esc(item.name)+'">−</button>'
            + '<input type="number" class="sam-shop-qty-inp" min="0" value="'+curQty+'" data-name="'+esc(item.name)+'">'
            + '<button type="button" class="sam-shop-qty-btn" data-shop-qty-btn="plus" data-name="'+esc(item.name)+'">+</button></div>' : '';
        var priceText = item.price ? item.price.toLocaleString() : '0';
        var costHtml = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0">'
            + '<div class="sam-shop-price">必要スペースコイン：'+priceText+'</div>'
            + shopCredentialCostHtml(item)
            + '</div>';
        return '<div class="sam-shop-item-foot">'+costHtml+qtyHtml+'</div>';
    }
    // attrs: 原始属性/消費(スキル)/タグのみを保持; 类型 と 效果 は上部のTabバーとdetails区で表示済み, 重複しない
    function shopBuildSkillCard(item) {
        var attrs = '';
        if (item.cost) attrs += shopChip('消費', item.cost);
        attrs += shopObjChips(item.raw_attrs);    // スキルは原始属性ボーナスを持つ場合がある
        attrs += shopTagChips(item.tags);
        var details = shopObjDetails('効果', item.effects) + shopDescription(item.description);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, false);
    }
    function shopBuildBloodlineCard(item) {
        var attrs = shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('効果', item.effects) + shopDescription(item.description);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, false);
    }
    function shopBuildEquipCard(item) {
        var attrs = '';
        if (item.cost) attrs += shopChip('消費', item.cost);
        attrs += shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('効果', item.effects) + shopDescription(item['説明']);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, false);
    }
    function shopBuildUpgradeCard(item) {
        var attrs = '';
        if (item.replace_target) attrs += shopChip('置換', item.replace_target);
        if (item.category) attrs += shopChip('大分類', item.category);
        attrs += shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('効果', item.effects) + shopDescription(item.description);
        // 形態アップグレード: 右上に 层级(ローマ数字) を表示し 品質文字 を代替; スキル子リストを描画(形態商品カードと一致)
        var headTier = null;
        var formExtra = '';
        if (item.category === '形态' && item.tier) {
            headTier = item.tier;
            if (Array.isArray(item.skills) && item.skills.length) formExtra = shopBuildFormSkillsBlock(item.skills);
        }
        return shopCardHead(item, headTier) + shopAttrsBlock(attrs) + details + formExtra + shopCardFoot(item, false);
    }
    // 形態カードのスキル子リストブロック(形態商品/形態アップグレード共用): 詳細式に展開, 効果/説明 と同一スタイル;
    // 各スキルは"(スキル名)"見出し + 品質/タイプ/消費/タグ/効果/説明 の各フィールド行, 空フィールドは省略
    function shopBuildFormSkillsBlock(skills) {
        var rows = '';
        for (var i = 0; i < skills.length; i++) {
            var sk = skills[i] || {};
            var skName = shopPick(sk, 'name','名称','技能名','技能名称') || ('技能' + (i + 1));
            var fields = '';
            if (sk.品質) fields += shopDetail('品質', sk.品質);
            fields += shopDetail('タイプ', shopSkillTypeLabel(sk.タイプ != null ? sk.タイプ : 0));
            if (sk.消費 && sk.消費 !== '无') fields += shopDetail('消費', sk.消費);
            var skTags = (sk.タグ && sk.タグ.length) ? sk.タグ.join('、') : '';
            if (skTags) fields += shopDetail('タグ', skTags);
            var skEf = sk.効果;
            if (skEf && typeof skEf === 'object' && Object.keys(skEf).length) {
                var efParts = [];
                for (var ek in skEf) { if (skEf.hasOwnProperty(ek)) efParts.push(ek + ':' + String(skEf[ek])); }
                fields += shopDetail('効果', efParts.join('；'));
            }
            if (sk.説明) fields += shopDetail('説明', sk.説明);
            // 各スキルを個別の折りたたみブロック(<details>)とし, 見出しはスキル名, 既定は折りたたみ
            rows += fcBodyCollapsible(skName, fields, 'sam-shop-sk-item', false);
        }
        // 外側は全体の折りたたみブロック: "スキル (N)", 既定は折りたたみ; 内部は各スキルの子折りたたみ
        return fcBodyCollapsible('スキル (' + skills.length + ')', rows, 'sam-shop-sk-list', false);
    }
    // 形態カード: 階層バッジ(右上) + 消費/状態/属性/タグ + 効果 + スキル子リスト + 説明
    function shopBuildFormCard(item) {
        var attrs = '';
        if (item.cost) attrs += shopChip('消費', item.cost);
        if (item.status) attrs += shopChip('状態', item.status);
        attrs += shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('効果', item.effects) + shopDescription(item.description);
        var skillsBlock = (Array.isArray(item.skills) && item.skills.length) ? shopBuildFormSkillsBlock(item.skills) : '';
        return shopCardHead(item, item.tier) + shopAttrsBlock(attrs) + details + skillsBlock + shopCardFoot(item, false);
    }
    function shopBuildConsumeCard(item) {
        var attrs = shopTagChips(item.tags);
        var details = shopObjDetails('効果', item.effects) + shopDescription(item.description);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, true);
    }
    // 区域Tabバー
    function shopRenderTabs() {
        var cats = [
            { key:'装备区', label:'装備', data: shopMarketData ? shopMarketData['装备区'] : null },
            { key:'道具区', label:'アイテム', data: shopMarketData ? shopMarketData['道具区'] : null },
            { key:'技能区', label:'スキル', data: shopMarketData ? shopMarketData['技能区'] : null },
            { key:'血统区', label:'血統', data: shopMarketData ? shopMarketData['血统区'] : null },
            { key:'形态区', label:'形態', data: shopMarketData ? shopMarketData['形态区'] : null },
            { key:'升级区', label:'アップグレードサービス', data: shopMarketData ? shopMarketData['升级区'] : null }
        ];
        var html = '<div class="sam-shop-tabs">';
        for (var i = 0; i < cats.length; i++) {
            var c = cats[i];
            var cnt = 0;
            if ((c.key === '装备区' || c.key === '技能区' || c.key === '道具区') && c.data) { for (var s in c.data) { if (c.data.hasOwnProperty(s) && c.data[s].length) cnt += c.data[s].length; } }
            else if (Array.isArray(c.data)) cnt = c.data.length;
            // 空リスト: そのTabボタンは描画しない(道具列表が[]のとき, 道具 ボタンは非表示)
            if (!cnt) continue;
            var active = (shopActiveTab === c.key) || (!shopActiveTab && i === 0);
            html += '<button type="button" class="sam-shop-tab'+(active?' active':'')+'" data-shop-tab="'+esc(c.key)+'">'+esc(c.label)
                + '<span class="sam-shop-tab-cnt">'+cnt+'</span></button>';
        }
        html += '</div>';
        return html;
    }
    // 現在の区域内容を描画(上部nav + 中部list, 外側のmarket コンテナは無い——renderShopTab が一括で包む)
    // coin はカードの無効化判定に使用(残高不足時はグレーアウト)
    function shopRenderContent(coin) {
        if (!shopMarketData) return '<div class="sam-shop-list"><div class="sam-shop-empty">まだ商品を更新していません, 上の欄に要望を入力して「商品を更新」をクリックしてください</div></div>';
        var permissionCharacter = shopResolveCharacter(getStatData() || {}, shopCurrentActor).character || {};
        var cat = shopActiveTab || '装备区';
        // 装備区/技能区/道具区: 上部nav(タイプ) + 中部list(タイプ別グループ)
        if (cat === '装备区' || cat === '技能区' || cat === '道具区') {
            var groups = shopMarketData[cat] || {};
            var groupKeys = [];
            for (var g in groups) { if (groups.hasOwnProperty(g) && groups[g].length) groupKeys.push(g); }
            if (!groupKeys.length) return '<div class="sam-shop-nav"></div><div class="sam-shop-list"><div class="sam-shop-empty">'+esc(cat.replace('区',''))+'区には商品がありません</div></div>';
            var activeSlot = shopActiveSlot && groups[shopActiveSlot] ? shopActiveSlot : groupKeys[0];
            if (shopActiveSlot !== activeSlot) shopActiveSlot = activeSlot;
            var navHtml = '';
            for (var i = 0; i < groupKeys.length; i++) {
                var sk = groupKeys[i];
                var cnt = groups[sk].length;
                navHtml += '<button type="button" class="sam-shop-nav-btn'+(sk === activeSlot ? ' active' : '')+'" data-shop-slot="'+esc(sk)+'">'+esc(sk)+'<span class="sam-shop-nav-cnt">'+cnt+'</span></button>';
            }
            var listHtml = shopRenderGroupList(groups[activeSlot] || [], cat, activeSlot, coin, permissionCharacter);
            return '<div class="sam-shop-nav">'+navHtml+'</div><div class="sam-shop-list">'+listHtml+'</div>';
        }
        // 血統区: 純粋なlist(nav無し, 単一列レイアウト)
        var items = shopMarketData[cat] || [];
        if (!items.length) return '<div class="sam-shop-list"><div class="sam-shop-empty">'+esc(cat.replace('区',''))+'区には商品がありません</div></div>';
        var listHtml3 = '';
        for (var j = 0; j < items.length; j++) {
            listHtml3 += shopRenderItemCard(items[j], cat, '', coin, permissionCharacter);
        }
        return '<div class="sam-shop-list">'+listHtml3+'</div>';
    }
    // グループリスト描画(装備区/技能区/道具区共通: タイプ別グループ後の単一グループリスト)
    function shopRenderGroupList(items, cat, slot, coin, permissionCharacter) {
        if (!items || !items.length) return '<div class="sam-shop-empty">この分類には商品がありません</div>';
        var html = '';
        for (var i = 0; i < items.length; i++) {
            html += shopRenderItemCard(items[i], cat, slot, coin, permissionCharacter);
        }
        return html;
    }
    // 単一カード描画(選択状態/無効状態/数量再設定/選択済みバッジを含む)
    function shopRenderItemCard(item, cat, slot, coin, permissionCharacter) {
        var inner = '';
        var isConsume = (cat === '道具区');
        if (cat === '技能区') inner = shopBuildSkillCard(item);
        else if (cat === '血统区') inner = shopBuildBloodlineCard(item);
        else if (cat === '装备区') inner = shopBuildEquipCard(item);
        else if (cat === '升级区') inner = shopBuildUpgradeCard(item);
        else if (cat === '形态区') inner = shopBuildFormCard(item);
        else if (isConsume) inner = shopBuildConsumeCard(item);
        else inner = shopBuildSkillCard(item);
        var isSelected = shopIsSelected(item.name, cat, slot);
        var sel = isSelected ? ' selected' : '';
        var permissionSd = getStatData() || {};
        var permission = shopPermissionDecision(permissionCharacter || {}, item, permissionSd.キャラ && permissionSd.キャラ.権限証憑);
        // 選択済みの権限超過の旧エントリはクリックで解除可能；未選択の権限超過商品は直接ロックする。
        var permissionLocked = (!isSelected && !permission.allowed);
        // 無効化判定: 選択済みはグレーにしない(数量調整/解除を許可); 未選択かつ単価 > 残高 → グレーアウトで無効
        // アイテム区は"1件の価格"で判定(後から数量追加可能); その他の区は単価で判定
        var unitPrice = Number(item.price || 0);
        // 無効化判定は"残高"(元の残高-選択済み合計)に基づく, 選択を重ねてもさらにクリックできてしまうのを防ぐ
        var remain = shopRemain(coin);
        var unaffordable = (!isSelected && remain < unitPrice);
        // ★ 血統区の上限: 血統が満杯でも【無効化しない】商品カード(融合は古い血統を置換し, 総数は変わらない),
        //   "満杯·融合が必要"のヒントバーを追加して誘導するのみ; "直接購入"の満額時のグレーアウトは融合ダイアログ内で処理する
        var bloodFullHint = (cat === '血统区' && !isSelected && shopBloodCount >= shopBloodLimit);
        // ★ 血統区が融合進行中(bloodFusionBusy): 未選択の血統商品はグレー表示(血統関連操作がブロックされる);
        //   選択済みは引き続き解除可能; 他の区域(装備/アイテム/スキル/アップグレード)は融合の影響を受けず, 通常どおり購入可能
        var bloodFusionLock = (cat === '血统区' && !isSelected && bloodFusionBusy);
        // ★ アップグレード区が融合進行中: そのアップグレードカードの"replace_target = 今回融合されている血統" → グレーロック
        //   (元の血統が消費中であり, 融合結果が出るまで対応するアップグレードサービスの購入を一時停止する)
        if (cat === '升级区' && !isSelected && bloodFusionBusy && item.category === '血統'
            && bloodFusionConsumedNames.length && bloodFusionConsumedNames.indexOf(item.replace_target || '') >= 0) {
            bloodFusionLock = true;
        }
        var disReason = permissionLocked ? 'permission' : (unaffordable ? 'unaffordable' : (bloodFusionLock ? 'fusionbusy' : ''));
        var dis = disReason ? ' disabled' : '';
        var dataAttrs = ' data-name="'+esc(item.name)+'" data-cat="'+esc(cat)+'" data-slot="'+esc(slot||'')+'" data-dis-reason="'+disReason+'"';
        // 選択済みバッジ(選択時に表示); アイテム区のバッジ文言は数量付き
        var cornerLabel = isSelected ? (isConsume ? ('選択済み ×'+(shopGetQty(item.name, cat)||0)) : '選択済み') : '';
        var cornerHtml = '<span class="sam-shop-sel-corner">'+esc(cornerLabel)+'</span>';
        // 血統満杯のヒントバー(カードは無効化せず, 融合置換フローへ誘導する)
        var hintHtml = bloodFullHint ? '<div class="sam-shop-blood-full-hint" style="margin-top:6px;padding:4px 8px;font-size:11px;color:var(--sam-hp);background:rgba(255,107,107,0.1);border-radius:6px;text-align:center;line-height:1.4">血統が満杯 · 購入すると融合置換へ進みます</div>' : '';
        var permissionHint = (!permission.allowed) ? '<div class="sam-shop-permission-hint" style="margin-top:6px;padding:5px 8px;font-size:11px;color:var(--sam-warning);background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);border-radius:6px;text-align:center;line-height:1.4">🔒 権限不足 · 現在の上限 '+esc(permission.capGrade)+' · 商品 '+esc(permission.requiredGrade)+'</div>' : '';
        return '<div class="sam-shop-item'+sel+dis+'"'+dataAttrs+'>'+inner+cornerHtml+hintHtml+permissionHint+'</div>';
    }
    // 下部カートバー
    function shopRenderFooter(coin) {
        var cartCount = shopCart.length;
        var cost = shopCartCost();
        var remain = coin - cost;
        var insufficient = (remain < 0);
        var sd = getStatData() || {};
        var actorCtx = shopResolveCharacter(sd, shopCurrentActor);
        var credentialRequirements = shopCredentialCartRequirements(actorCtx.character || {}, shopCart);
        var credentialShortages = shopCredentialShortages(sd.キャラ && sd.キャラ.権限証憑, credentialRequirements);
        var credentialInsufficient = credentialShortages.length > 0;
        var credentialText = shopCredentialRequirementText(credentialRequirements);
        var remainCls = insufficient ? ' insufficient' : '';
        var infoHtml = '';
        if (!cartCount) {
            infoHtml = '選択済み <b>0</b> 件 · 合計 <b>0</b> · 残り <b>'+(coin ? coin.toLocaleString() : '0')+'</b>';
        } else if (insufficient || credentialInsufficient) {
            var warnings = [];
            if (insufficient) warnings.push('スペースコイン不足');
            if (credentialInsufficient) warnings.push('権限証憑不足：'+shopCredentialShortageText(credentialShortages));
            infoHtml = '<span class="sam-shop-foot-warn">⚠️ '+warnings.join(' · ')+' · 選択済み '+cartCount+' 件 · 合計 '+cost.toLocaleString()+' · 残り <span class="sam-shop-foot-remain'+remainCls+'">'+remain.toLocaleString()+'</span>'
                + (credentialText ? ' · 必要証憑 '+esc(credentialText) : '') + '</span>';
        } else {
            infoHtml = '選択済み <b>'+cartCount+'</b> 件 · 合計 <b>'+cost.toLocaleString()+'</b> · 残り <span class="sam-shop-foot-remain'+remainCls+'"><b>'+remain.toLocaleString()+'</b></span>'
                + (credentialText ? ' · 必要証憑 <b>'+esc(credentialText)+'</b>' : '');
        }
        var disabled = (!cartCount || insufficient || credentialInsufficient) ? ' disabled' : '';
        var btnText = cartCount ? '取引を承認実行' : '先に商品を選択してください';
        return '<div class="sam-shop-foot"><div class="sam-shop-foot-info">'+infoHtml+'</div>'
            + '<button type="button" class="sam-shop-exec-btn" data-shop-exec'+disabled+'>'+btnText+'</button></div>';
    }
    // ---- 実行層: 取引の送信(/send テキスト|/trigger + MVU書き戻し) ----
    function shopGetLastMessageId() {
        try {
            var win = GS_PARENT || window;
            var helper = win.TavernHelper || {};
            var ctx = (win.SillyTavern && typeof win.SillyTavern.getContext === 'function') ? win.SillyTavern.getContext() : null;
            var fn = helper.getLastMessageId || win.getLastMessageId || (ctx ? ctx.getLastMessageId : null);
            var id = typeof fn === 'function' ? Number(fn.call(ctx || win)) : NaN;
            if (Number.isFinite(id)) return id;
            if (ctx && Array.isArray(ctx.chat)) return ctx.chat.length - 1;
        } catch(e) {}
        return 0;
    }
    function shopReadMessageById(messageId) {
        try {
            var win = GS_PARENT || window;
            if (typeof win.getChatMessages !== 'function') return null;
            var messages = win.getChatMessages(messageId);
            if (messages && messages.length) {
                return messages[messages.length - 1] || messages[0];
            }
        } catch(e) {}
        return null;
    }
    function shopWaitForCreatedUserMessage(afterId, timeout) {
        timeout = timeout || 10000;
        var start = Date.now();
        return new Promise(function(resolve, reject) {
            function check() {
                if (Date.now() - start > timeout) { reject(new Error('取引記録の階層を特定できませんでした')); return; }
                try {
                    var latestId = shopGetLastMessageId();
                    var found = false;
                    var pending = latestId - afterId;
                    if (pending <= 0) { setTimeout(check, 80); return; }
                    var checked = 0;
                    var next = function(id) {
                        if (id > latestId) {
                            if (!found) setTimeout(check, 80);
                            return;
                        }
                        var msg = shopReadMessageById(id);
                        if (msg && msg.role === 'user') { resolve(id); return; }
                        next(id + 1);
                    };
                    next(afterId + 1);
                } catch(e) { setTimeout(check, 80); }
            }
            check();
        });
    }
    function shopTriggerSlash(cmd) {
        return new Promise(function(resolve, reject) {
            try {
                var win = GS_PARENT || window;
                // 優先 triggerSlash(酒場ネイティブ)
                if (typeof win.triggerSlash === 'function') { resolve(win.triggerSlash(cmd)); return; }
                if (typeof win.SillyTavern === 'object' && win.SillyTavern && typeof win.SillyTavern.triggerSlash === 'function') { resolve(win.SillyTavern.triggerSlash(cmd)); return; }
                // フォールバック: 登録済みの STScriptParser / executeSlashCommand
                if (typeof win.executeSlashCommand === 'function') { resolve(win.executeSlashCommand(cmd)); return; }
                if (typeof win.registeredSlashCommands !== 'undefined') {
                    // /send は sendToInputBox の自動送信で代替する
                    reject(new Error('triggerSlash が使用できません'));
                    return;
                }
                reject(new Error('triggerSlash が使用できません'));
            } catch(e) { reject(e); }
        });
    }
    // レシートは既に正常に確定したローカルショップ動作のみを記録する；各件を改行で追記し、本文モデルの叙述後にクリアされる。
    function shopAppendReceipt(statData, line) {
        if (!statData || !line) return;
        statData.システム状態 = statData.システム状態 || {};
        var oldText = safeStr(statData.システム状態.配信待ち記録, '').trim();
        statData.システム状態.配信待ち記録 = oldText ? (oldText + '\n' + line) : line;
    }
    function shopReceiptLine(action, detail, cost, balance, actorLabel) {
        var who = actorLabel || 'キャラ';
        return '['+action+']['+who+'] '+detail+'｜支払 '+safeNum(cost, 0)+'スペースコイン｜残高 '+safeNum(balance, 0);
    }
    function shopClearReceipt() {
        var ok = writeBackMvu(function(statData) {
            statData.システム状態 = statData.システム状態 || {};
            statData.システム状態.配信待ち記録 = '';
        });
        if (ok) { renderAll(); samToast('success', '配信待ち記録を削除しました'); }
        else samToast('error', '削除に失敗: MVU書き戻しが使用できません');
    }
    // 取引の構築: stat_data のコピー上でコイン控除/バッグ格納を実行し, { statData, purchaseLog, receipts, actorName } を返す
    // ★ 複数キャラのショップ: 受取人(荷造りしてバッグへ入れるキャラクター)は shopCurrentActor が決定する(角色またはNPC); 通貨は常に 角色.スペースコイン から控除する
    function shopBuildTransaction(statData) {
        var coinOwner = statData.キャラ;
        if (!coinOwner) throw new Error('キャラクターデータが存在しません');
        var actorName = shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        var character = (actorName === SHOP_ACTOR_REINCARNATOR) ? coinOwner : (statData.关系リスト && statData.关系リスト[actorName]);
        if (!character) throw new Error('キャラクターデータが存在しません: ' + actorName);
        for (var gateI = 0; gateI < shopCart.length; gateI++) {
            var gateItem = shopCart[gateI] || {};
            var gate = shopPermissionDecision(character, gateItem, coinOwner.権限証憑);
            if (!gate.allowed) throw new Error(shopPermissionMessage(gate, gateItem));
        }
        var credentialRequirements = shopCredentialCartRequirements(character, shopCart);
        var credentialShortages = shopCredentialShortages(coinOwner.権限証憑, credentialRequirements);
        if (credentialShortages.length) throw new Error('権限証憑不足：' + shopCredentialShortageText(credentialShortages));
        var total = shopCartCost();
        var startCoin = Number(coinOwner.スペースコイン || 0);
        if (startCoin < total) throw new Error('キャラクターのスペースコインが不足しています');
        coinOwner.権限証憑 = coinOwner.権限証憑 || {};
        if (!shopCredentialConsume(coinOwner.権限証憑, credentialRequirements)) throw new Error('権限証憑の控除に失敗しました');
        coinOwner.スペースコイン = startCoin - total;
        if (!character.装備) character.装備 = {};
        if (!character.技能) character.技能 = {};
        if (!character.血統) character.血統 = {};
        if (!character.道具) character.道具 = {};
        if (!character.形態庫) character.形態庫 = {};
        var itemStrs = [];
        var receiptLines = [];
        var receiptBalance = startCoin;
        var _actorLabel = (actorName === SHOP_ACTOR_REINCARNATOR) ? 'キャラ' : actorName;
        for (var i = 0; i < shopCart.length; i++) {
            var item = shopCart[i];
            var qty = item.quantity || 1;
            if (item._cat === '技能区') {
                character.技能[item.name] = shopToSkillVar(item);
            } else if (item._cat === '血统区') {
                // ★ 血統上限の防御(フォールバック): 通常フローでは血統区の商品は shopHandleExec で融合ダイアログへ横取りされ,
                //   直接購入パス(bloodFusionDirectPurchase)は既に上限チェックを含む; この分岐は将来の変更で
                //   ルーティングを迂回し血統が純増して BLOODLINE_CAP を突破するのを防ぐ
                if (!character.血統[item.name] && Object.keys(character.血統).length >= BLOODLINE_CAP) {
                    throw new Error('血統が上限に達しました(' + BLOODLINE_CAP + '), 購入できません: ' + item.name);
                }
                character.血統[item.name] = shopToBloodlineVar(item);
            } else if (item._cat === '装备区') {
                var nextEq = shopToEquipVar(item, item._slot);
                character.装備[item.name] = nextEq;
            } else if (item._cat === '道具区') {
                var old = character.道具[item.name];
                var nextCon = shopToConsumeVar(item, qty);
                if (old && typeof old === 'object') nextCon.数量 = Number(old.数量 || 0) + qty;
                var merged = {};
                if (old && typeof old === 'object') { for (var ok2 in old) { if (old.hasOwnProperty(ok2)) merged[ok2] = old[ok2]; } }
                for (var nk in nextCon) { if (nextCon.hasOwnProperty(nk)) merged[nk] = nextCon[nk]; }
                character.道具[item.name] = merged;
            } else if (item._cat === '形态区') {
                // 形態商品: 直接購入して 形态库 へ入れる(キーは形態名, 置換は強制しない; 同名は上書き)
                character.形態庫[item.name] = shopToFormVar(item, item.name);
            } else if (item._cat === '升级区') {
                // アップグレード商品: 所属大分類に応じて書き込むキャラクター項目を決める; 置換対象が回収する旧アイテムを決める
                var upCat = item.category || '';
                var tgtName = item.replace_target || item.name;
                if (upCat === '血統') {
                    // ★ 血統上限の防御: アップグレードサービスの意味は"旧を削除して新を追加"(数量不変)だが, AI が生成した
                    //   replace_target がキャラクターの実際の所持血統名と一致しない場合(データ陳腐化/融合済み/名前の幻覚),
                    //   delete が空操作に堕し, 実質"血統1件の純増"→ BLOODLINE_CAP 上限を迂回する。
                    //   よって書き込み前に検証: 置換対象が存在せず同名上書きでもない場合, 購入後の数量は上限を超えてはならない。
                    var bTgtExists = !!character.血統[tgtName];
                    var bOverwrite = !!character.血統[item.name];
                    if (!bTgtExists && !bOverwrite && Object.keys(character.血統).length >= BLOODLINE_CAP) {
                        throw new Error('血統が上限に達しました(' + BLOODLINE_CAP + '), アップグレードサービス【' + item.name + '】の置換対象【' + tgtName + '】が存在しないため, 購入できません');
                    }
                    if (bTgtExists) delete character.血統[tgtName];
                    character.血統[item.name] = shopToBloodlineVar(item);
                } else if (upCat === '技能') {
                    if (character.技能[tgtName]) delete character.技能[tgtName];
                    character.技能[item.name] = shopToSkillVar(item);
                } else if (upCat === '装備') {
                    var oldEquip = character.装備[tgtName];
                    var newEquip = shopToEquipVar(item, '');
                    if (oldEquip && typeof oldEquip === 'object' && oldEquip.状態 != null) newEquip.状態 = oldEquip.状態;
                    if (character.装備[tgtName]) delete character.装備[tgtName];
                    character.装備[item.name] = newEquip;
                } else if (upCat === '形态') {
                    // 形態アップグレード: 旧形態(置換対象)を削除してから新形態を書き込む; "形態購入"と同じく shopToFormVar を通る
                    if (character.形態庫[tgtName]) delete character.形態庫[tgtName];
                    character.形態庫[item.name] = shopToFormVar(item, item.name);
                }
            }
            var qtyStr = qty > 1 ? ' ×'+qty : '';
            var ratingStr = item.rating ? ('（'+item.rating+'級）') : '';
            // アップグレードサービスのレシート: "置換対象→新名称", 操作は"アップグレード"と記す; その他の商品は"購入 名称"
            var upTgtName = (item._cat === '升级区' && item.replace_target) ? item.replace_target : '';
            var itemDetail = upTgtName ? (upTgtName + ' → ' + item.name + ratingStr) : (item.name + qtyStr + ratingStr);
            var itemAction = upTgtName ? 'アップグレード' : '購入';
            var itemCost = Number(item.price || 0) * Number(qty);
            receiptBalance -= itemCost;
            itemStrs.push(itemDetail);
            receiptLines.push(shopReceiptLine(itemAction, itemDetail, itemCost, receiptBalance, _actorLabel));
        }
        shopRecalcDerived(character);
        // 現在のキャラクターに対応する商庫から購入済み商品を削除する(売却状態を永続化)
        shopRemovePurchasedFromLibrary(statData, shopCart, actorName);
        return {
            statData: statData,
            purchaseLog: _actorLabel + 'が交換した ' + itemStrs.join('、'),
            receipts: receiptLines,
            actorName: actorName
        };
    }
    // 商品ライブラリから購入済み物品を削除: 商城.メンバー商品庫.<角色名> 配下の 装备列表/技能列表/血统列表/道具列表/升级列表 はいずれもフラット配列
    // すべての区域(アイテム区を含む)で統一的に"丸ごと削除"——買われた商品は商品ライブラリから直接消え, 数量の逓減は行わない
    // (ストアの意味論: プレイヤーが買った時点で陳列終了, 再陳列はしない; アイテムの元数量フィールドは表示専用で, 購入可能上限とはしない)
    // ★ 複数キャラ: actorName はどのキャラクターの専用商庫から削除するかを指定する; 既定は shopCurrentActor を踏襲
    function shopRemovePurchasedFromLibrary(statData, cart, actorName) {
        if (!statData.商城) return;
        var libMap = statData.商城[SHOP_ACTOR_LIB_KEY];
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        var lib = null;
        if (libMap && libMap[actorName]) {
            lib = libMap[actorName];
        } else if (actorName === SHOP_ACTOR_REINCARNATOR) {
            // 旧データ互換: 角色 の商庫が 商城 のトップレベルに直接並んでいる場合がある
            if (Array.isArray(statData.商城.装備リスト) || Array.isArray(statData.商城.技能リスト)
                || Array.isArray(statData.商城.血統リスト) || Array.isArray(statData.商城.道具リスト) || Array.isArray(statData.商城.升级リスト) || Array.isArray(statData.商城.形态リスト)) {
                lib = statData.商城;
            }
        }
        if (!lib) return;
        // 購入済み物品名を収集する(すべて丸ごと削除)
        var removeNames = {};
        for (var i = 0; i < cart.length; i++) {
            removeNames[cart[i].name] = true;
        }
        // 新構造: 4本のフラット配列, 逐次フィルタ(丸ごと削除)
        var listKeys = ['装備リスト','技能リスト','血統リスト','道具リスト','升級リスト','形态列表'];
        for (var ki = 0; ki < listKeys.length; ki++) {
            var key = listKeys[ki];
            if (Array.isArray(lib[key])) {
                lib[key] = shopFilterLibArray(lib[key], removeNames);
            }
        }
        // ★ アップグレードサービスの相互排他: プレイヤーがあるアップグレードサービスを購入すると, その置換対象(元の物品)は既に削除されており,
        //   升级列表 内の残りの"置換対象=その同一の元物品"のアップグレード項目も意味を失うため, まとめて削除する
        //   例: 人类血统 → 升级列表 に【修仙进化】【科技进化】【血肉进化】があり, いずれも"人类血统"を置換対象とする;
        //       【修仙进化】購入後は人类血统が削除され, 人类血统に対応する残りのアップグレード商品はすべて削除される
        if (Array.isArray(lib.升級リスト) && lib.升級リスト.length) {
            var consumeTargets = {};
            for (var ci = 0; ci < cart.length; ci++) {
                var ce = cart[ci];
                if (ce && ce._cat === '升级区' && ce.replace_target) {
                    consumeTargets[String(ce.replace_target)] = true;
                }
            }
            if (Object.keys(consumeTargets).length) {
                lib.升級リスト = lib.升級リスト.filter(function(u) {
                    var upTgt = String(shopPick(u, 'replace_target','置換対象') || '');
                    // 同じ置換対象のアップグレード項目もまとめて削除(購入済み項目は上で丸ごと削除済み, ここはフォールバックの再クリア)
                    return !(upTgt && consumeTargets[upTgt]);
                });
            }
        }
    }
    // 商品ライブラリ配列のフィルタ(丸ごと削除): 名前で購入済み物品を削除し, 残りは保持する
    function shopFilterLibArray(arr, removeNames) {
        if (!Array.isArray(arr) || !removeNames) return arr || [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            var nm = String(shopPick(it, '名称','name','道具名','物品名') || '');
            if (removeNames[nm]) continue;
            out.push(it);
        }
        return out;
    }
    // オブジェクト上で最初に一致した key 名を返す(数量フィールドの直接変更用)
    function shopPickKey(obj) {
        for (var i = 1; i < arguments.length; i++) {
            var k = arguments[i];
            if (obj && obj[k] !== undefined) return k;
        }
        return null;
    }
    function shopHandleExec() {
        var sd = getStatData();
        if (!sd) { samToast('error', 'データが未準備です'); return; }
        if (!shopCart.length) { samToast('warning', '先に商品を選択してください'); return; }
        // ★ アップグレードサービスにも融合進行中のブロックがある: "replace_target=融合中の血統"に該当するアップグレード項目は決算を禁止する
        if (bloodFusionBusy && bloodFusionConsumedNames.length) {
            var upgradeHit = shopCart.filter(function(entry) {
                return entry && entry._cat === '升级区' && entry.category === '血統'
                    && bloodFusionConsumedNames.indexOf(entry.replace_target || '') >= 0;
            });
            if (upgradeHit.length) { samToast('warning', '血統融合中, 対応するアップグレードサービスは購入できません, 融合の完了をお待ちください'); return; }
        }
        var bloodItems = shopCart.filter(function(entry) { return entry && entry._cat === '血统区'; });
        if (bloodItems.length) {
            // ★ 血統関連操作のブロック: 融合進行中は血統の購入/融合を新たに開始できない; その他の商品取引は影響を受けない
            if (bloodFusionBusy) { samToast('warning', '血統融合中, 融合が完了してから血統を購入してください'); return; }
            // ★ 血統購入の自動収束: カート内の他カテゴリ商品 + 余分な血統エントリを整理し, 最後に選択した血統のみを残す,
            //   融合フローの円滑な開始を保証する(融合は置換 / 直接購入は欄へ格納), ユーザーの融合ポッドへの侵入を妨げない
            var keepBlood = bloodItems[bloodItems.length - 1];
            if (bloodItems.length !== 1 || shopCart.length !== 1) {
                shopCart = [];
                var merged = {};
                for (var bk in keepBlood) { if (keepBlood.hasOwnProperty(bk)) merged[bk] = keepBlood[bk]; }
                merged._cat = '血统区'; merged._slot = ''; merged.quantity = 1;
                shopCart.push(merged);
                shopRefreshMarket();
                samToast('info', '血統は単独で決算する必要があるため, カートの他の商品は自動的にクリアされました');
            }
            openBloodFusionModal(keepBlood);
            return;
        }
        // ★ 複数キャラのショップ: 通貨は常に 角色.スペースコイン から控除する; 角色 のスペースコイン残高を検証
        var coin = safeNum(sd.キャラ && sd.キャラ.スペースコイン, 0);
        if (coin < shopCartCost()) { samToast('error', 'スペースコイン不足, 取引を実行できません'); return; }
        // ★ 現在の対象キャラクター(NPC) がまだ在場しているかを検証(切替後に退場する可能性)
        if (shopCurrentActor !== SHOP_ACTOR_REINCARNATOR) {
            var actorNpc = (sd.关系リスト && sd.关系リスト[shopCurrentActor]) ? sd.关系リスト[shopCurrentActor] : null;
            if (!actorNpc) { samToast('error', '対象キャラクターは退場済み, 購入できません, 再選択してください'); return; }
        }
        // 1) stat_data のコピー上で取引結果を構築(コイン控除/バッグ格納/商品ライブラリから購入済みを一括削除)
        var result;
        try {
            // stat_dataをディープコピーし, 元オブジェクトの汚染を回避
            var snapshot = (_ && _.cloneDeep) ? _.cloneDeep(sd) : JSON.parse(JSON.stringify(sd));
            result = shopBuildTransaction(snapshot);
        } catch(e) {
            samToast('error', '取引の構築に失敗: '+e.message);
            return;
        }
        var $execBtn = $('.sam-shop-exec-btn');
        if ($execBtn.length) { $execBtn.prop('disabled', true).text('実行中...'); }
        // 2) ★ 同期を優先して MVU(アトミック操作)へ直接書き込む: 取引結果を即座に書き戻し, 商品ライブラリから購入済み物品を一括削除
        //    旧フローは先に /trigger でAI返信を誘発し, AIの[mvu_update]が我々の書き戻しを上書きした(1件しか削除されない),
        //    変更後: 先にMVUへ直接書き込み(上書き不可) → カートを空にする → さらに /send でテキスト記録(AIは誘発しない)
        var writeOk = writeBackMvu(function(statData) {
            // 構築済みの取引結果でキャラクター項目 + ショップ商品ライブラリを丸ごと上書きする
            var rs = result.statData;
            // ★ 書き戻し: 角色(スペースコイン控除を含む, 角色 の買い物時は新装備を含む) + 商城(商品ライブラリは購入済みを削除済み) + 关系列表(NPCの買い物時は新装備を含む)
            if (rs.キャラ) statData.キャラ = rs.キャラ;
            if (rs.商城) statData.商城 = rs.商城;
            if (rs.関係リスト) statData.关系リスト = rs.関係リスト;
            for (var ri = 0; ri < result.receipts.length; ri++) {
                shopAppendReceipt(statData, result.receipts[ri]);
            }
        });
        if (!writeOk) {
            samToast('error', '取引失敗: MVU書き戻しが使用できません');
            if ($execBtn.length) { $execBtn.prop('disabled', false).text('取引を承認実行'); }
            return;
        }
        // 3) カートを空にする + UIを更新(商品ライブラリの購入済み削除を即座に反映)
        shopCart = [];
        // 現在のキャラクターの商品ライブラリを再読込してローカルキャッシュ(shopMarketData)を同期し, 売却済み商品の表示を回避
        var freshSd = getStatData();
        var freshLib = shopGetActorLibRaw((freshSd && freshSd.商城) ? freshSd.商城 : null, shopCurrentActor);
        if (freshLib) {
            shopMarketData = shopNormalizeMarketData(freshLib);
            if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
        } else {
            shopMarketData = null;
        }
        samToast('success', '取引が完了しました');
        renderAll();
        // 4) /send で取引テキストを記録(ユーザー階層のみ作成, /trigger, は付けずAI返信も誘発させない, AIのmvu_updateによる商品ライブラリ上書きを回避)
        var msg = result.purchaseLog + '。';
        try {
            shopTriggerSlash('/send ' + msg).then(function() {
                if ($execBtn.length) { $execBtn.prop('disabled', false).text('取引を承認実行'); }
            }).catch(function(eSend) {
                try { console.warn('[主神端末] /send 記録失敗(取引は反映済み):', eSend.message); } catch(e2){}
                if ($execBtn.length) { $execBtn.prop('disabled', false).text('取引を承認実行'); }
            });
        } catch(eSync) {
            try { console.warn('[主神端末] /send 例外(取引は反映済み):', eSync.message); } catch(e2){}
            if ($execBtn.length) { $execBtn.prop('disabled', false).text('取引を承認実行'); }
        }
    }
    /* ===== 32d. ショップ: 商品更新(本文AI generateRawを呼び出し, 新ZOD構造で商品ライブラリを生成) =====
       - 二重チェック 戦闘中/主神空間外(ボタンは無効化済み, ここはフォールバック)
       - generateRaw 経由で本文AIを呼び出し, 新構造(YAML形式)で4つの商品リストを出力させる
       - 返却テキストを解析 → stat_data.商城へ書き込み(ZOD検証で正規化) + ローカルキャッシュをリセット + renderAll
       - 更新中はモジュールレベルの shopRefreshing フラグで描画を制御: true にすると renderAll が元のリストを隠し、
         代わりに"リクエスト中…閉じるか待機できます"のヒントを出しボタン/入力欄をグレーアウト; チャット切替/パネルを閉じて再度開いても失われない
         (フラグはモジュールレベル, renderAll の再構築ではクリアされない)
       - AI 成功 → キャッシュを消して再描画 + toast"商品リストを更新しました, 計N件"; 失敗/解析結果が空 → toast +
         shopMarketData を保持して元のリスト表示を復元; どちらの経路でも shopRefreshing=false にしてロックを解除 */
    // 32d-1. 本文AIインターフェース generateRawを特定(スコープ横断: 現在/親/TavernHelper)
    function shopGetAI() {
        var win = GS_PARENT || window;
        try {
            if (typeof win.generateRaw === 'function') return win.generateRaw;
        } catch (e) {}
        try {
            if (typeof generateRaw === 'function') return generateRaw;
        } catch (e2) {}
        try {
            if (win.TavernHelper && typeof win.TavernHelper.generateRaw === 'function') return win.TavernHelper.generateRaw;
        } catch (e3) {}
        return null;
    }
    // 32d-2. AI呼び出しの共通ラッパー(Promiseを返し, 同期/非同期に対応)
    //  振り分け: "追加モデル設定"のスイッチが有効なら → 自前ホストAPI(apiChat); それ以外 → generateRaw の本文AI
    function shopCallAI(systemPrompt, userMsg) {
        if (isApiConfigEnabled()) {
            // 追加モデル経路: OpenAI 互換 /chat/completions へ直接接続(ショップ更新/血統融合で共用)
            return apiChat(systemPrompt, userMsg).then(function(content){
                // generateRaw の戻り値は通常は文字列; 呼び出し側のセマンティクスを維持
                return content;
            });
        }
        return new Promise(function (resolve, reject) {
            var fn = shopGetAI();
            if (!fn) { reject(new Error('本文AIインターフェース generateRawが見つかりません')); return; }
            try {
                var p = fn({
                    ordered_prompts: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user',   content: userMsg }
                    ]
                });
                Promise.resolve(p).then(function (r) { resolve(r); }).catch(function (e) { reject(e); });
            } catch (e) { reject(e); }
        });
    }
    // 32d-3. AIが返すYAML形式テキストを解析 → { 血统列表:[], 技能列表:[], 装备列表:[], 道具列表:[] }
    //   寛容性: ```yaml / ``` のコードフェンスに対応; フィールド名は大文字小文字を区別しない; インライン {a:1,b:2} と ['a','b'] のインライン構文
    //   新ZOD構造に厳密対応: 血统(原始属性/效果) 技能(类型0-2) 装备(类型0-8) 道具(类型str/数量)
    function shopParseMarketText(text) {
        var result = { 血統リスト: [], 技能リスト: [], 装備リスト: [], 道具リスト: [], 升級リスト: [], 形态列表: [] };
        if (!text || typeof text !== 'string') return result;
        // コードフェンスを除去
        var cleaned = text.replace(/```(?:ya?ml|json)?/gi, '').replace(/```/g, '');
        var lines = cleaned.split('\n');
        // インラインオブジェクト/配列の解析: {a:1, b:2} → {a:1,b:2}; ['a','b'] → ['a','b']
        function parseInline(raw) {
            if (raw == null) return null;
            var s = String(raw).trim();
            if (!s) return null;
            // インライン {...}
            if (/^\{.*\}$/.test(s)) {
                try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) {}
                // 手動で キー:値 のペアを分割
                var obj = {};
                var inner = s.slice(1, -1);
                var parts = inner.split(',');
                for (var i = 0; i < parts.length; i++) {
                    var kv = parts[i].split(':');
                    if (kv.length >= 2) {
                        var k = kv[0].trim().replace(/['"]/g, '');
                        var v = parts[i].slice(kv[0].length + 1).trim().replace(/['"]/g, '');
                        if (k) obj[k] = v;
                    }
                }
                return Object.keys(obj).length ? obj : null;
            }
            // インライン [...]
            if (/^\[.*\]$/.test(s)) {
                try { return JSON.parse(s.replace(/'/g, '"')); } catch (e2) {}
                var innerA = s.slice(1, -1);
                var arr = innerA.split(',').map(function(x) { return x.trim().replace(/['"]/g, ''); }).filter(Boolean);
                return arr.length ? arr : null;
            }
            return null;
        }
        function num(v, def) { var n = parseFloat(v); return isFinite(n) ? n : (def || 0); }
        function str(v) {
            var s = (v == null) ? '' : String(v).trim();
            // YAML 文字列の外側の対応する引用符(二重引用符または単一引用符)を除去, 例 "材料" → 材料
            if (s.length >= 2 && (s.charAt(0) === '"' || s.charAt(0) === "'") && s.charAt(s.length - 1) === s.charAt(0)) {
                s = s.slice(1, -1);
            }
            return s;
        }
        function tags(v) {
            var p = parseInline(v);
            if (Array.isArray(p)) return p.map(function(x) { return String(x); });
            if (typeof v === 'string' && v.trim()) return v.split(/[,，、]/).map(function(x){return x.trim();}).filter(Boolean);
            return [];
        }
        function objMap(v) {
            var p = parseInline(v);
            return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
        }
        // 属性オブジェクト(用途 原始属性: {力量:'B', ATK:5} の品質文字と数値に対応)
        function numMap(v) {
            var p = parseInline(v);
            if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
            var out = {};
            for (var key in p) {
                if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
                out[key] = attrMapVal(p[key]);
            }
            return out;
        }
        // インデント式YAML解析: リスト見出し(血统列表/技能列表/...)で区切り, 各段落内の - 項目が新規エントリ, 同階層のインデントキーがフィールド
        var listKeys = ['血統リスト', '技能リスト', '装備リスト', '道具リスト', '升級リスト', '形态列表'];
        var curList = null;     // 現在のリスト名(resultのkey)
        var curItem = null;     // 現在充填中のエントリオブジェクト
        var itemIndent = -1;    // 現在のエントリの - 行インデント
        function flushItem() {
            if (curItem && curList && Array.isArray(result[curList])) {
                if (curItem.名称) result[curList].push(curItem);
            }
            curItem = null;
            itemIndent = -1;
        }
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            // 空行とコメントをスキップ
            if (!line.trim() || /^\s*#/.test(line)) continue;
            // トップレベルのリスト見出し(インデントなしまたは極小インデントの "xxx列表:")
            var headM = line.match(/^\s{0,2}(血统列表|技能列表|装备列表|道具列表|升级列表|形态列表)\s*:\s*$/);
            if (headM) {
                flushItem();
                curList = headM[1];
                continue;
            }
            // リスト項目の開始: 行内に "  - " の接頭辞を含む
            var itemM = line.match(/^(\s*)-\s+(.*)$/);
            if (itemM && curList) {
                flushItem();
                curItem = {};
                itemIndent = itemM[1].length;
                // 行内に 名称: xxx が付く場合がある
                var rest = itemM[2];
                var inlineKV = rest.match(/^([^\s:]+)\s*:\s*(.*)$/);
                if (inlineKV) {
                    var _pv = parseInline(inlineKV[2]);
                    curItem[inlineKV[1]] = _pv !== null ? _pv : str(inlineKV[2]);
                }
                continue;
            }
            // フィールド行: インデントがリスト見出しより深い, "  フィールド: 値" の形式
            var fieldM = line.match(/^(\s+)([^\s:]+)\s*:\s*(.*)$/);
            if (fieldM && curItem && curList) {
                var k = fieldM[2];
                var v = fieldM[3];
                var fieldIndent = fieldM[1].length;
                // 複数行オブジェクトフィールド: 形态列表 内の 技能 サブブロック, 値が空のときは, より深いインデントの "- 名称: ..." サブスキルを下方から収集
                // (形態エントリに内蔵される 技能: { - 名称: ...\n  品质: ...\n  类型: ...\n  效果: {...}\n  标签: [...] } のサブリスト,
                //  サブスキルの 效果/原始属性 も複数行 YAML, という形で展開される場合があるため先読みして収集する必要がある)
                // 技能 サブブロックの収集: 形态列表 内, または 升级列表 内で現在のエントリの 所属大类=形态(形態アップグレード項目に内蔵される 技能 サブリスト)
                var _isFormSkillBlock = (curList === '形态列表') || (curList === '升級リスト' && curItem && (curItem.所属カテゴリ === '形态' || curItem.category === '形态'));
                if (!v.trim() && _isFormSkillBlock && k === '技能') {
                    var skillsArr = [];
                    var sCur = null;        // 現在充填中のサブスキル
                    var sIndent = -1;       // サブスキルの "- " 行インデント
                    var j3 = i + 1;
                    // サブスキルフィールド値の処理: 行内値 sv → 対応する型へ正規化
                    function pushSkillField(obj, fk, fv) {
                        if (fk === 'タグ') obj[fk] = tags(fv);
                        else if (fk === 'タイプ') {
                            var _stn = parseInt(fv, 10);
                            obj[fk] = isFinite(_stn) ? _stn : 0;
                        } else if (fk === '効果') {
                            obj[fk] = objMap(fv);
                        } else if (fk === '原始属性') {
                            obj[fk] = numMap(fv);
                        } else {
                            obj[fk] = (fv && parseInline(fv) !== null) ? parseInline(fv) : str(fv);
                        }
                    }
                    for (; j3 < lines.length; j3++) {
                        var sLine = lines[j3];
                        if (!sLine.trim() || /^\s*#/.test(sLine)) continue;
                        // フィールド行: インデントが sIndent より深い → 現在のサブスキルのフィールド
                        var sfM = sLine.match(/^(\s+)([^\s:]+)\s*:\s*(.*)$/);
                        if (sfM && sCur && sfM[1].length > sIndent) {
                            var sk = sfM[2], sv = sfM[3];
                            var sFieldIndent = sfM[1].length;
                            // サブスキルの 效果/原始属性 の複数行展開: 値が空のときはより深いインデントの key:value を先読み収集
                            if (!sv.trim() && (sk === '効果' || sk === '原始属性')) {
                                var sSub = {};
                                var jj = j3 + 1;
                                for (; jj < lines.length; jj++) {
                                    var sSubLine = lines[jj];
                                    if (!sSubLine.trim() || /^\s*#/.test(sSubLine)) continue;
                                    if (/^\s*-\s+/.test(sSubLine)) break;
                                    var sSubM = sSubLine.match(/^(\s+)([^\s:]+)\s*:\s*(.*)$/);
                                    if (!sSubM || sSubM[1].length <= sFieldIndent) break;
                                    if (sSubM[2]) sSub[sSubM[2]] = str(sSubM[3]);
                                }
                                if (sk === '原始属性') {
                                    var numSubObj = {};
                                    for (var nsk in sSub) { if (sSub.hasOwnProperty(nsk)) numSubObj[nsk] = attrMapVal(sSub[nsk]); }
                                    sCur[sk] = numSubObj;
                                } else {
                                    sCur[sk] = sSub;
                                }
                                j3 = jj - 1;
                                continue;
                            }
                            pushSkillField(sCur, sk, sv);
                            continue;
                        }
                        // サブスキル項目の開始: インデントが 技能 フィールドのインデント(fieldIndent)より深く, "     - 名称: xxx" の形式
                        var sItemM = sLine.match(/^(\s*)-\s+(.*)$/);
                        if (sItemM && sItemM[1].length > fieldIndent) {
                            if (sCur) skillsArr.push(sCur);
                            sCur = {};
                            sIndent = sItemM[1].length;
                            var sRest = sItemM[2];
                            var sInlineKV = sRest.match(/^([^\s:]+)\s*:\s*(.*)$/);
                            if (sInlineKV) {
                                var _spv = parseInline(sInlineKV[2]);
                                sCur[sInlineKV[1]] = _spv !== null ? _spv : str(sInlineKV[2]);
                            }
                            continue;
                        }
                        // インデントが ≤ fieldIndent まで戻る → サブブロック終了
                        if (sfM && sfM[1].length <= fieldIndent) break;
                        // より浅い非フィールド(次の形態の - 項目など) → 終了
                        if (sItemM && sItemM[1].length <= fieldIndent) break;
                        break;
                    }
                    if (sCur) skillsArr.push(sCur);
                    curItem['技能'] = skillsArr;
                    i = j3 - 1;
                    continue;
                }
                // 複数行オブジェクトフィールド: 效果/原始属性 の値が空のとき, より深いインデントの key:value ペアを下方から収集
                // (AI はネストしたオブジェクトを複数行 YAML 形式で展開することが多く 行内 {k:v}, ではなく先読み収集が必要)
                if (!v.trim() && (k === '効果' || k === '原始属性')) {
                    var subObj = {};
                    var j2 = i + 1;
                    for (; j2 < lines.length; j2++) {
                        var subLine = lines[j2];
                        if (!subLine.trim() || /^\s*#/.test(subLine)) continue;
                        if (/^\s*-\s+/.test(subLine)) break;
                        var subM = subLine.match(/^(\s+)([^\s:]+)\s*:\s*(.*)$/);
                        if (!subM || subM[1].length <= fieldIndent) break;
                        if (subM[2]) subObj[subM[2]] = str(subM[3]);
                    }
                    if (k === '原始属性') {
                        var numObj = {};
                        for (var nk in subObj) { if (subObj.hasOwnProperty(nk)) numObj[nk] = attrMapVal(subObj[nk]); }
                        curItem[k] = numObj;
                    } else {
                        curItem[k] = subObj;
                    }
                    i = j2 - 1;
                    continue;
                }
                // 数値フィールド
                if (k === '価格' || k === '数量') {
                    curItem[k] = num(v, k === '数量' ? 1 : 0);
                } else if (k === 'タイプ') {
                    // 技能(0-2)/装备(0-8)は数値, 道具は文字列
                    var tn = parseInt(v, 10);
                    if (curList === '技能リスト' || curList === '装備リスト') {
                        curItem[k] = isFinite(tn) ? tn : 0;
                    } else {
                        curItem[k] = str(v);
                    }
                } else if (k === '原始属性') {
                    curItem[k] = numMap(v);
                } else if (k === '効果') {
                    curItem[k] = objMap(v);
                } else if (k === 'タグ') {
                    curItem[k] = tags(v);
                } else if (k === '品質' || k === '階層' || k === '消費' || k === '説明' || k === '名称') {
                    curItem[k] = str(v);
                } else {
                    // 未知のフィールドはそのまま保持
                    curItem[k] = parseInline(v) !== null ? parseInline(v) : str(v);
                }
                continue;
            }
        }
        flushItem();
        return result;
    }
    // 32d-4. プレイヤーコンテキスト要約を構築(AIがプレイヤーのビルドと階層を参照するため)
    // ★ 複数角色ショップ: actorName で今回誰のためにコンテキストを生成するかを指定(角色またはNPC); スペースコインは常に角色の残高を表示(角色が支払う)
    function shopBuildPlayerContext(sd, actorName) {
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        var ctx = shopResolveCharacter(sd, actorName);
        var p = ctx.character || {};
        var reincarnatorCoin = (sd.キャラ && sd.キャラ.スペースコイン != null) ? sd.キャラ.スペースコイン : null;
        var reincarnatorCredentials = (sd.キャラ && sd.キャラ.権限証憑 && typeof sd.キャラ.権限証憑 === 'object') ? sd.キャラ.権限証憑 : {};
        var parts = [];
        // 先頭に今回の生成対象(角色/チームメイト名)を明記し, AI がビルドを合わせられるようにする
        parts.push('本次购买目标: ' + (ctx.isReincarnator ? 'キャラ(プレイヤー本人)' : (actorName + '(チームメイト)')));
        if (p.種族) parts.push('種族: ' + p.種族);
        if (Array.isArray(p.身分) && p.身分.length) parts.push('身分: ' + p.身分.join('/'));
        {
            var _occTxt = occupationSummaryText(p.職業);
            if (_occTxt) parts.push('職業: ' + _occTxt);
        }
        if (p.階層) parts.push('階層: ' + p.階層);
        // スペースコインも権限証憑も角色アカウントに属する；現在がNPCの購入であっても角色アカウントで支払い/認可する。
        if (reincarnatorCoin != null) parts.push('スペースコイン: ' + reincarnatorCoin);
        var credentialParts = [];
        for (var _ci = 0; _ci < SHOP_PERMISSION_QUALITY_ORDER.length; _ci++) {
            var _cg = SHOP_PERMISSION_QUALITY_ORDER[_ci];
            var _cq = Math.max(0, Math.floor(safeNum(reincarnatorCredentials[_cg], 0)));
            if (_cq > 0) credentialParts.push(_cg + '×' + _cq);
        }
        parts.push('権限証憑(角色账户): ' + (credentialParts.length ? credentialParts.join(' / ') : '无'));
        
        // ★ コア補助関数：アイテムの重要情報をすべて抽出し、コンパクトな単一行テキストに連結。網羅的かつ Token 節約
        function formatDict(dict) {
            var keys = Object.keys(dict || {});
            if (keys.length === 0) return '无';
            
            return keys.map(function(k) {
                var v = dict[k] || {};
                var info = [];
                
                if (v.品質) info.push(v.品質 + '级');
                if (v.数量 != null) info.push('数量:' + v.数量);
                if (v.消費) info.push('消費:' + v.消費);
                // 属性と効果はオブジェクトなので JSON.stringify で平坦化して表示
                if (v.原始属性 && Object.keys(v.原始属性).length > 0) info.push('属性:' + JSON.stringify(v.原始属性));
                if (v.効果 && Object.keys(v.効果).length > 0) info.push('効果:' + JSON.stringify(v.効果));
                if (v.説明) info.push('説明:' + v.説明);
                
                // 出力形式の例: "  - 御剑术 [F级 | 消耗:8MP | 效果:{"主动":"..."} | 描述:...]"
                return '  - ' + k + ' [' + info.join(' | ') + ']';
            }).join('\n');
        }

        // 既存の装備/スキル/血統名(AIの重複回避+ビルド適合を支援)
        var blData = p.血統 || {};
        if (Object.keys(blData).length) parts.push('已有血统:\n' + formatDict(blData));
        
        var skData = p.技能 || {};
        if (Object.keys(skData).length) parts.push('已有技能:\n' + formatDict(skData));
        
        var eqData = p.装備 || {};
        if (Object.keys(eqData).length) parts.push('已有装备:\n' + formatDict(eqData));
        
        var invData = p.道具 || {};
        if (Object.keys(invData).length) parts.push('已有物品:\n' + formatDict(invData));

        var statusData = p.状態 || {};
        if (Object.keys(statusData).length) parts.push('已有状态:\n' + formatDict(statusData));

        // 既存の 形态库(AIがビルドに合わせ重複を避けるため; 形態アップグレード機能はこれに基づき"替换目标"を記入する)
        var formData = p.形態庫 || {};
        if (Object.keys(formData).length) parts.push('已有形态:\n' + formatDict(formData));
        
        // 世界/任務コンテキスト
        var w = sd.世界 || {};
        if (w.当前世界) parts.push('当前世界: ' + w.当前世界);
        
        return parts.join('\n');
    }
    // 32d-4-1. 世界書の内容を取得
    async function getWorldBookContent(searchTitle) {
        var win = GS_PARENT; 

        if (!win.EjsTemplate || typeof win.EjsTemplate.evalTemplate !== 'function') {
            console.error('[主神端末] 致命的エラー：EjsTemplate.evalTemplate 拡張インターフェースが見つかりません！');
            return null;
        }
        
        try {
            // 4. 上記の ceshiBUG に async を追加したため、ここでの await が完全に合法になる
            var env = await win.EjsTemplate.prepareContext({ targetTitle: searchTitle });
            var code = '<%- await getwi(targetTitle) %>';
            var content = await win.EjsTemplate.evalTemplate(code, env);
            
            if (content && content.trim() !== '') {
                return content + '\n';
            }
            return null;
        } catch (error) {
            console.error('[主神端末] 世界書の読み取り異常:', searchTitle, error);
            return null;
        }
    }
    // 32d-5. メイン入口: 商品更新
    function handleShopRefresh(reqText, worldBookContent) {
        var sd = getStatData();
        if (!sd) { samToast('error', 'データが未準備です'); return; }
        var sys = sd.システム状態 || {};
        if (sys.戦闘中 === true) { samToast('warning', '戦闘中は取引できません, 安全な場所に移動してから再試行してください'); return; }
        if (sys.主神空間滞在中 !== true && !(sd.設定 && sd.設定.単一世界 === true)) { samToast('warning', '主神空間に戻らないとショップ取引を開始できません'); return; }
        // AIインターフェースを確認: 追加モデル設定が有効なら自前ホストAPI, それ以外は generateRaw が必要
        if (!isApiConfigEnabled() && !shopGetAI()) { samToast('error', '本文AIインターフェース generateRawが検出できません(設定で「追加モデル設定」を有効にしてください)'); return; }
        if (isApiConfigEnabled()) {
            var _apiCfgChk = getApiConfig();
            if (!_apiCfgChk.model) { samToast('error', '追加モデル設定は有効ですがモデルが未選択です, 先に設定パネルでモデルを選択してください'); return; }
        }
        // 再入防止: すでに更新中なら無視
        if (shopRefreshing) return;
        // 更新中状態へ移行(モジュールレベルフラグ, 画面切替/再描画でも無効状態を維持); 即座に再描画してリストを隠す+ヒントを表示
        shopRefreshing = true;
        shopRefreshEpoch += 1;          // 新しいターン, 以前の未完了リクエストのコールバックはターン番号不一致で破棄される
        var myEpoch = shopRefreshEpoch;
        renderAll();
        // —— 精密検索かどうかを判定 ——
        var hasReq = (reqText && reqText.trim() !== '');
        // —— システムプロンプト: 主神交換端末の設定 + 新構造の説明 ——
       var sysPrompt = ''
            + 'あなたは「主神交換端末」の商品生成サブシステムである。プレイヤーが主神空間でショップを開いた, 購入可能な商品を生成すること。\n'
            + '世界観: 輪廻戦場, プレイヤーは各インスタンス世界を渡り歩いて任務を達成し, 主神空間で「スペースコイン」を使い装備/スキル/血統/アイテム/形態を交換する。\n'
            + '【系统设定】\n'
            + worldBookContent + '\n'
            + '【生成约束】\n'
            + '1. 適合度: プレイヤーの現在のビルド（物理/近接/生存寄り）、職業と購買力に基づいて生成すること。\n'
            + '2. 品質と視野権限の制御 (ショップ解放の鉄則):\n'
            + '   - 【前置扫描】: 商品を生成する前に、必ず【当前角色数据】内の購入対象階層と、独立フィールド【权限凭证(角色账户)】を読み取ること。権限証憑は道具/状態からは検索しない。\n'
            + '   - 【基础视野】: より高権限の証憑がない場合、ショップ視野 =【购买对象当前层级+1阶】、上限はSSS（Ⅰ=F、Ⅱ=E……Ⅸ=SSS）。\n'
            + '   - 【凭证覆盖】: 【权限凭证(角色账户)】内に数量>0かつ【购买对象当前层级+1阶】より高いX級の証憑が存在する場合、ショップ視野はX級まで引き上げられる；複数の有効な証憑がある場合は最高品質のみを取る。証憑の数量は品質に加算されない。\n'
            + '   - 【绝对红线】: 商品の最高品質は【商城视野】を超えてはならない。ショップ視野は【基础视野】または【权限凭证】のいずれか一方のみに由来し、重複加算は禁止。階位序列:F→E→D→C→B→A→S→SS→SSS。権限証憑は決して販売・提示してはならない！\n'
            + '   - 【纯净展示】: 権限証憑はショップ視野の決定にのみ使用する；選択と決算はプログラムが同一の上限で厳密に検証する。合法な視野内の商品には権限条件を再度書く必要はなく、ショップ視野を超える商品は生成してはならない。\n'
            + '   - プレイヤーが既に所持するアイテムと機能が完全に重複するものは避けること。\n'
            + '3. アップグレード再鋳造の仕組み: \n'
            + '   - 【当前角色数据】を精査し、プレイヤーが現在所持する低階層の血統・スキル・装備・形態から選び、高階層の強化版を生成して「升级列表」へ入れること。アップグレード後の完成パネルを直接生成すること。詞条の差分でパッチを当てる方式は絶対に禁止！システムが回収・置換できるよう、正確な `置換対象`を必ず提供すること。同一の対象に複数の選択肢を用意してもよい。\n'
            + '   - 【升级命名】: 完成品には簡潔で完全な名称を使用すること；旧名称の後ろに“改/強化/進階/精製/Ⅰ/Ⅱ/Plus”などのアップグレード接尾辞を追加・累積することは禁止。改名が必要な場合は全体をそのままリネームすること。\n'
            + '   - 【阶位限制规则】: アップグレードと再鋳造の階位上限は、上記第2条の【品质与视野权限控制】と厳密に同期させること。プレイヤーの視野上限を超えるアップグレード案を生成してはならない。\n'
            + '   - 【升级继承规则】:\n'
            + '      * アップグレード商品は、替换目标が持つ有効な詞条を完全に継承すること。\n'
            + '      * “原能力を融合した”“能力の一部を保持する”などの曖昧な説明で実際の詞条記録を置き換えることは禁止。\n'
            + '      * 元の装備/スキル/血統が持つ有効な効果は、一件ずつ新しいパネルの【效果】フィールドへ移行すること。\n'
            + '      * 旧詞条が改造・統合・置換された場合は、旧詞条 → 新詞条の対応関係を明確に記録すること。\n'
            + (hasReq
                ? '4. コア集中: プレイヤーが明確な【核心需求】を提示した。商品生成はこれを絶対的な中心とすること。一部のカテゴリが空（生成しない）であってもよい。他のタイプの商品を生成する場合は、核心需求と【流派联动】を構成する必要がある（例 要望が"狙撃銃"なら、"隠密スキル"、"徹甲弾アイテム"などを併せて生成する）。総数は 16~24 個に収めること。\n'
                : '4. 均衡更新: 一度に約 18~28 個の商品を生成し、血統/形態/スキル/装備/アイテム を均衡に分布させ、升级列表 は 2~4 項目とする。\n')
            + '5. 商品責務の分離:\n'
            + '   - 【血统与形态严格隔离】: 両者は完全に分離すること。“変身形態を伴う血統”の生成は絶対に禁止。血統は生命の本質を根底から改造するパッシブであり、形態はアクティブ化できる独立した戦闘変身パネル、または外部装備システムである。\n'
            + '   - 【形态列表】: Ⅶ級以上の形態商品の販売は禁止。\n'
            + '   - 【血统列表】: プレイヤーが未所持の独立した血統体系のみを生成する。プレイヤーが既に所持する血統の同源強化・進化・覚醒版である場合は、必ず升级列表 へ入れること。S級以上の血統商品の販売は禁止。\n'
            + '   - 【升级列表】: \n'
            + '      * プレイヤーが現在所持する血統・スキル・装備・形態の強化・昇階・再鋳造のみを扱う。正確な替换目标 を必ず記入すること。\n'
            + '      * 同階強化と跨階昇階はいずれも有効なアップグレード案であり、同一の対象に同階強化と跨階昇階の選択肢を同時に提供してもよい。\n'
            + '   - 【世界遺物規則】:\n'
            + '      * 世界遺物はショップの一般商品として生成することを禁止。\n'
            + '      * 世界遺物は任務世界の探索、特殊イベント、シナリオ報酬、または世界決算によってのみ獲得できる。\n'
            + '      * 主神空間は世界遺物の解析・修復・強化・融合などのサービスのみを提供し、新しい世界遺物を直接販売しない。\n'
            + '      * 世界遺物は通常の装備欄体系へ入れることはできず、通常装備の代替品として扱わない。\n'
            + '   - 同一の対象を通常商品とアップグレード商品の両方として出現させることは禁止。\n'
            + '   - 融資・宝くじなど、プレイヤーがスペースコインを余分に獲得できる商品や能力を提供することを禁止。\n'
            + '6. 修練系アイテムの規則:\n'
            + '   - 【道具列表】では秘伝書、功法、心法、修練資料などの成長型アイテムを生成できる。\n'
            + '   - 修練系アイテムは学習の媒体であり、スキルやパッシブ効果を直接生成しない；購入後は修練の過程を経て対応する成長型状態を生成する必要がある。\n'
            + '   - 商品説明が功法、修真秘伝書、内功心法、魔法研究資料、身体強化案などである場合は、【道具】として生成することを優先し、【技能】としては生成しない。\n'
            + '   - 技能リスト はキャラクターが既に習得し直接使用できる能力にのみ用い、学習教材や成長経路の記録には用いない。\n'
            + '   - 技能リスト では、長期的な学習・修練の蓄積・生命構造の変更を要して初めて得られる体系能力を生成することを禁止。\n'
            + '   - 品質の参考:\n'
            + '      * 一般武学・基礎訓練系の秘伝書: F-E級\n'
            + '      * 高度な武学・内功心法・特殊技能の伝承: D-C級\n'
            + '      * 修練体系・生命進化・長期的な身体改造系の秘伝書: 通常はD級以上、実際の成長潜在力に基づいて評価する\n'
            + '   - 長期的な修練体系を単一のスキルへ圧縮して販売することを禁止。例えば「修真功法」「血脉觉醒法」「内功心法」を直接スキルとして生成してはならない。\n'
            + '【严格输出格式】\n'
            + '出力は YAML テキストのみ, 説明や markdown のコードフェンスは不要。トップレベルは六つのリストキー: 血統リスト / 形态列表 / 技能列表 / 装备列表 / 道具列表 / 升级列表, 各項目は "  - " で始める。\n'
            + 'フィールドの型は厳密に従うこと:\n'
            + '  - 階層: 文字列, Ⅰ / Ⅱ / Ⅲ / Ⅳ / Ⅴ / Ⅵ / Ⅶ / Ⅷ / Ⅸ のみ\n'
            + '  - 品質: 文字列, F / E / D / C / B / A / S / SS / SSSのみ\n'
            + '  - タグ: インライン配列 [\'标签1\', \'标签2\'...]\n'
            + '  - 原始属性: インラインオブジェクト、段階付けは《品質効果数値規則》に従う；血統は五維（力量、敏捷、体质、精神、魅力）を完全に含むこと、【形态】は五維を完全に含み関連する【衍生属性】を付加する、装備は有効な非0項目のみ記述。\n'
            + '  - 効果: インラインオブジェクト {效果名: \'説明\'}, キーは文字列, 値は文字列の説明\n'
            + '  - 価格: 数値(スペースコイン)\n'
            + '  - 説明/消費: 字符串\n'
            + '  - タイプ:\n'
            + '      技能リスト.タイプ = 数値 0(アクティブ) / 1(パッシブ) / 2(特殊)\n'
            + '      装備リスト.タイプ = 数値 0(武器) / 1(手袋) / 2(頭部) / 3(胸部) / 4(脚部) / 5(靴) / 6(マント) / 7(アクセサリー)\n'
            + '      道具リスト.タイプ = 文字列(消耗品/材料/特殊など, 同類型は再利用し細分化しない)\n'
            + '  - 置換対象: 文字列 (【升级列表】内の商品でのみ必須、プレイヤーが現在所有する元アイテム名と一字一句違わず一致させること！)\n'
            + '  - 所属カテゴリ: 文字列 (【升级列表】内の商品でのみ必須、記入可能な値: 血統 / 形态 / 技能 / 装备)\n'
            + '  - 道具リスト.数量 = 数値(この商品を購入可能な在庫数, ≥1)\n'
            + 'オブジェクトのキーに英語のピリオドは使用禁止、口径系のX.YmmはX·Yと統一して記述（例：5.56mm弾薬→5·56弾薬）;\n'

        // —— ユーザープロンプト: プレイヤーコンテキスト + 要件 + 出力テンプレート例 ——
        // ★ 複数角色: コンテキストは現在選択中の角色を基準にする; AIはこれに基づきその角色向けに商品/アップグレード案を生成する
        var playerCtx = shopBuildPlayerContext(sd, shopCurrentActor);
        var userPrompt = '\n【当前角色数据】\n' + (playerCtx || '(无)') + '\n';
        userPrompt += '\n【输出结构】\n以下はフィールド形式のデモのみ、具体的な段階は商品の位置づけに応じて生成すること。\n'
            + '血統リスト:\n'
            + '  - 名称: 血統名\n'
            + '    品質: E\n'
            + '    タグ: ["主神空間", "强化"]\n'
            + '    原始属性: {"筋力": "C", "敏捷": "F", "体力": "D", "精神": "E", "魅力": "F"}\n'
            + '    効果: {体能充沛: 基础生命恢复速度小幅提升}\n'
            + '    説明: 簡潔な説明\n'
            + '    価格: 450\n'
            + '技能リスト:\n'
            + '  - 名称: スキル名\n'
            + '    品質: F\n'
            + '    タイプ: 0\n'
            + '    タグ: ["主神空間", "被动"]\n'
            + '    効果: {射击校准: 射击检定+5}\n'
            + '    説明: 簡潔な説明\n'
            + '    消費: 无\n'
            + '    価格: 80\n'
            + '装備リスト:\n'
            + '  - 名称: 装備名\n'
            + '    品質: D\n'
            + '    タイプ: 0\n'
            + '    タグ: ["主神空間", "科技"]\n'
            + '    原始属性: {"ATK": "C", "敏捷": "F"}\n'
            + '    効果: {射击稳定: 连续射击检定+15}\n'
            + '    説明: 簡潔な説明\n'
            + '    消費: 无\n'
            + '    価格: 3000\n'
            + '道具リスト:\n'
            + '  - 名称: アイテム名\n'
            + '    品質: F\n'
            + '    タイプ: 消耗品\n'
            + '    数量: 3\n'
            + '    タグ: ["主神空間", "支援"]\n'
            + '    効果: {急救: 恢复10HP}\n'
            + '    説明: 簡潔な説明\n'
            + '    価格: 50\n'
            + '形态列表:\n'
            + '  - 名称: 形態名\n'
            + '    階層: {形態自身の戦闘位格に従って生成、Ⅰ－Ⅸ}\n'
            + '    消費: HP/EP/特殊資源\n'
            + '    状態: 完好\n'
            + '    タグ: ["主神空間", 依存する道具/血統/来源など]\n'
            + '    原始属性: {基础属性/衍生属性: 品質}\n'
            + '    効果: { [词条]: 説明 }\n'
            + '    技能: {\n'
            + '     - 名称: スキル名\n'
            + '       品質: F\n'
            + '       タイプ: 0\n'
            + '       タグ: ["主神空間", "被动"]\n'
            + '       効果: {射击校准: 射击检定+5}\n'
            + '       説明: 簡潔な説明\n'
            + '       消費: 无}\n'
            + '    説明: 簡潔な説明\n'
            + '    価格: 300\n'
            + '升級リスト:\n'
            + '  - 名称: アップグレード後の装備/スキル/血統/形態の名称 (例: M16A2突撃銃·改)\n'
            + '    置換対象: 元のアイテムの正確な名称 (例: M16A2突撃銃)\n'
            + '    所属カテゴリ: 装備 (必須: 血統/技能/装備/形态)\n'
            + '    階層: Ⅰ\n'
            + '    品質: E\n'
            + '    タイプ: 0\n'
            + '    タグ: ["主神空間", "科技", "升级"]\n'
            + '    原始属性: {"ATK": "C", "敏捷": "E"}\n'
            + '    効果: {精密射击: 瞄准射击检定+10}\n'
            + '    説明: 旧型を回収し再鋳造・昇階した完成品\n'
            + '    消費: 无\n'
            + '    価格: 300\n'
// 🌟 コア最適化：動的な末尾指示
if (hasReq) {
    userPrompt += '\n【本次核心商品需求】\n  ' + reqText + '\n';
    userPrompt += '\nそれでは上記の核心需求に基づき精密な検索とセット生成を行ってください（一部のリストが空でも可）。出力は YAML:\n';
} else {
    userPrompt += '\nそれではショップの日常更新を実行し、プレイヤーデータを精査してアップグレード案を生成してください。出力は YAML:\n';
}
            // console.log('システムプロンプト:', sysPrompt, '\nユーザープロンプト:', userPrompt);
        shopCallAI(sysPrompt, userPrompt).then(function (out) {
            // ターン検証: ユーザーが"停止刷新"を押すか新たに更新を開始すると epoch が変わる, 遅れて届いた結果は破棄
            if (myEpoch !== shopRefreshEpoch || !shopRefreshing) return;
            var parsed = shopParseMarketText(out);
            // 生成数を集計
            var total = (parsed.血統リスト.length + parsed.技能リスト.length + parsed.装備リスト.length + parsed.道具リスト.length + parsed.升級リスト.length + parsed.形态列表.length);
            if (total === 0) {
                // 解析失敗: 更新中状態を解除, 元のリスト表示へ戻し, トースト通知
                shopRefreshing = false;
                renderAll();
                samToast('error', 'AIの返答を商品として解析できませんでした, 元の商品リストに戻しました');
                return;
            }
            // ★ 現在の角色専用の商庫(商城.メンバー商品庫.<角色名>)へ書き戻す; 他の角色の商庫には影響しない
            //   角色キーが旧トップレベル構造の場合は 成员商库.角色へ移行し, 複数角色の分離を実現
            var refreshActor = shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
            var ok = writeBackMvu(function (statData) {
                if (!statData.商城 || typeof statData.商城 !== 'object') statData.商城 = {};
                var market = statData.商城;
                // 成员商库 を遅延初期化
                if (!market[SHOP_ACTOR_LIB_KEY] || typeof market[SHOP_ACTOR_LIB_KEY] !== 'object') {
                    market[SHOP_ACTOR_LIB_KEY] = {};
                }
                var libMap = market[SHOP_ACTOR_LIB_KEY];
                // 角色の初回移行: 旧トップレベルのフラット商庫を 角色 の初期在庫として扱う(角色キーが未存在の場合のみ)
                if (refreshActor === SHOP_ACTOR_REINCARNATOR && !libMap[SHOP_ACTOR_REINCARNATOR]) {
                    var oldTop = null;
                    if (Array.isArray(market.血統リスト) || Array.isArray(market.技能リスト)
                        || Array.isArray(market.装備リスト) || Array.isArray(market.道具リスト) || Array.isArray(market.升級リスト) || Array.isArray(market.形态列表)) {
                        oldTop = {
                            血統リスト: Array.isArray(market.血統リスト) ? market.血統リスト : [],
                            技能リスト: Array.isArray(market.技能リスト) ? market.技能リスト : [],
                            装備リスト: Array.isArray(market.装備リスト) ? market.装備リスト : [],
                            道具リスト: Array.isArray(market.道具リスト) ? market.道具リスト : [],
                            升級リスト: Array.isArray(market.升級リスト) ? market.升級リスト : [],
                            形态列表: Array.isArray(market.形态列表) ? market.形态列表 : []
                        };
                    }
                    libMap[SHOP_ACTOR_REINCARNATOR] = oldTop || { 血統リスト:[], 技能リスト:[], 装備リスト:[], 道具リスト:[], 升級リスト:[], 形态列表:[] };
                    // 旧トップレベルの冗長フィールドを削除し, 成员商库 へ統合移行
                    delete market.血統リスト;
                    delete market.技能リスト;
                    delete market.装備リスト;
                    delete market.道具リスト;
                    delete market.升級リスト;
                    delete market.形态列表;
                }
                // 現在の角色の新しい更新結果を書き込む(ライブラリ全体を上書き)
                libMap[refreshActor] = {
                    血統リスト: parsed.血統リスト,
                    技能リスト: parsed.技能リスト,
                    装備リスト: parsed.装備リスト,
                    道具リスト: parsed.道具リスト,
                    升級リスト: parsed.升級リスト,
                    形态列表: parsed.形态列表
                };
            });
            // 更新中状態を解除
            shopRefreshing = false;
            if (ok) {
                shopMarketData = null;   // renderAll 時に stat_data から再正規化させる
                shopCart = [];
                shopActiveTab = '';
                shopActiveSlot = '';
                renderAll();
                samToast('success', '商品リストを更新しました, 計 ' + total + ' 件の商品を生成');
            } else {
                renderAll();
                samToast('error', '商品は生成されましたがMVU書き戻しに失敗, 元の商品リストに戻しました');
            }
        }).catch(function (e) {
            // 失敗: 更新中状態を解除, 元の商品リスト表示へ戻し, トースト通知
            if (myEpoch !== shopRefreshEpoch) return;  // 中断済み, 失敗処理は行わない
            shopRefreshing = false;
            renderAll();
            samToast('error', 'AI生成に失敗, 元の商品リストに戻しました: ' + (e && e.message ? e.message : e));
        });
    }
    /* 32d-6. 更新停止: ユーザーが"更新中…"状態で停止ボタンを押した時に呼ばれる
       - shopRefreshing のロックを即座に解除し, renderAll が更新ボタンを使用可能に戻す + 元の商品リスト表示
       - shopRefreshEpoch を進めて飛行中の旧 Promise コールバックをターン検証で自動的に結果破棄させる,
         AI の遅延応答がユーザーの現在の操作を上書きしたり 商城 へ書き込むことはない */
    function shopStopRefresh() {
        if (!shopRefreshing) return;
        shopRefreshEpoch += 1;          // 旧コールバックのターンを不一致にして → 返却結果を破棄
        shopRefreshing = false;
        renderAll();
        samToast('warning', '商品の更新を停止しました, 「商品を更新」を再度クリックできます');
    }
    /* 32d-7. 融合停止: ユーザーが"血統融合進行中…"状態で停止ボタンを押した時に呼ばれる
       - bloodFusionBusy のロックを即座に解除し, renderAll が融合を再開できる状態に戻る
       - bloodFusionEpoch を進めて飛行中の旧 Promise コールバックをターン検証で自動的に結果破棄させる,
         AI の遅延応答が血統ライブラリ/升級リスト/形態庫 を上書きすることはなくなる
       - 今回がショップ血統融合の場合(開始時にスペースコインを差し引き+商品ライブラリを削除済み), bloodFusionSnap をロールバックしてスペースコイン+商品ライブラリを復元する必要がある */
    function bloodFusionStop() {
        if (!bloodFusionBusy) return;
        bloodFusionEpoch += 1;          // 旧コールバックのターンを不一致にして → 返却結果を破棄
        bloodFusionBusy = false;
        bloodFusionShopItem = null;
        bloodFusionResult = null;
        bloodFusionConsumedNames = [];
        // 開始時に差し引かれたスペースコインと削除済みの商品ライブラリをロールバック
        if (bloodFusionSnap) {
            try {
                writeBackMvu(function(statData) {
                    statData.キャラ = statData.キャラ || {};
                    statData.キャラ.スペースコイン = safeNum(statData.キャラ.スペースコイン, 0) + bloodFusionSnap.price;
                    statData.キャラ.権限証憑 = statData.キャラ.権限証憑 || {};
                    shopCredentialRefund(statData.キャラ.権限証憑, bloodFusionSnap.credentialRequirements || {});
                    if (bloodFusionSnap.preBloodLib !== null && statData.商城) {
                        var _rlibS = shopGetActorLibRaw(statData.商城, bloodFusionSnap.preActor);
                        if (_rlibS) _rlibS.血統リスト = bloodFusionSnap.preBloodLib.slice();
                    }
                });
            } catch(eStop) { try { console.warn('[主神端末] 融合停止ロールバック異常:', eStop.message); } catch(e2){} }
            // ショップリストのローカルキャッシュを復元: 削除された血統商品を血統エリアへ戻す
            try {
                var freshSd = getStatData();
                var freshLibS = shopGetActorLibRaw(freshSd && freshSd.商城, bloodFusionSnap.preActor);
                if (freshLibS) {
                    shopMarketData = shopNormalizeMarketData(freshLibS);
                    if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
                }
            } catch(eSnapStop) {}
            bloodFusionSnap = null;
        }
        closeModal();
        renderAll();
        samToast('warning', '血統融合を停止しました, スペースコインと商品ライブラリをロールバックしました, 再度融合を開始できます');
    }
    /* 装備/アイテム操作の共通処理 */
    function handleItemAction(action, path, kind, typeStr, key) {
        if (!action || !path) return;
        var type = Number(typeStr);
        var sd = getStatData();
        if (!sd || !sd.キャラ) { samToast('error', 'データが未準備です'); return; }
        var isEquip = (kind === 'equip');
        var dict = isEquip ? (sd.キャラ.装備 || {}) : (sd.キャラ.道具 || {});
        var basePath = isEquip ? 'キャラ.装備' : 'キャラ.道具';
        // 削除: 辞書から直接取り除く
        if (action === 'delete') {
            var ok = writeBackMvu(function(statData) {
                var d = isEquip ? (statData.キャラ.装備||{}) : (statData.キャラ.道具||{});
                if (d[key] !== undefined) delete d[key];
            });
            if (ok) { samToast('success', (isEquip?'装備':'アイテム')+'を削除しました: '+key); renderAll(); }
            else samToast('error', '削除失敗: MVU書き戻しを利用できません');
            return;
        }
        // 目標状態のマッピング
        var targetStatus;
        if (action === 'wear') targetStatus = 1;
        else if (action === 'remove') targetStatus = 0;
        else if (action === 'store') targetStatus = 2;
        else if (action === 'takeback') targetStatus = 0;
        else { samToast('error', '不明な操作: '+action); return; }
        // 装着前の上限チェック (上限設定はモジュールレベル定数 EQUIP_SLOTS / ITEM_SLOT_CAP由来)
        if (action === 'wear') {
            if (isEquip) {
                // EQUIP_SLOTS を参照して該当タイプの capを取得: cap>=2 は満杯で拒否; cap===1 は同タイプの装着済みと置換; cap===0 は無制限
                var slotCfg = null;
                for (var si = 0; si < EQUIP_SLOTS.length; si++) { if (EQUIP_SLOTS[si].type === type) { slotCfg = EQUIP_SLOTS[si]; break; } }
                var cap = slotCfg ? slotCfg.cap : 0;
                var slotLabel = slotCfg ? slotCfg.label : '装備';
                if (cap >= 2) {
                    // 複数スロット型(武器2/アクセサリー2): 満杯なら拒否
                    var wCount = 0;
                    Object.keys(dict).forEach(function(k){ if (Number(dict[k].タイプ)===type && Number(dict[k].状態)===1) wCount++; });
                    if (wCount >= cap) { samToast('warning', '体上の'+slotLabel+'が満杯です('+cap+'件), 現在の'+slotLabel+'を外してから再試行してください'); return; }
                } else if (cap === 1) {
                    // 単一スロット型(手袋/頭部/.../マント): 同タイプの装着済みと置換
                    var replaced = [];
                    Object.keys(dict).forEach(function(k){
                        if (k !== key && Number(dict[k].タイプ) === type && Number(dict[k].状態) === 1) replaced.push(k);
                    });
                    if (replaced.length > 0) {
                        var okR = writeBackMvu(function(statData) {
                            var d = statData.キャラ.装備 || {};
                            replaced.forEach(function(k){ if (d[k]) d[k].状態 = 0; });
                            if (d[key]) d[key].状態 = 1;
                        });
                        if (okR) { samToast('success', '装着しました: '+key+(replaced.length?' (置換:'+replaced.join(',')+')':'')); renderAll(); }
                        else samToast('error', '装着失敗: MVU書き戻しを利用できません');
                        return;
                    }
                }
                // cap === 0 (特殊): 無制限, そのまま共通の装着フローへ
            } else {
                // アイテム戦術枠は ITEM_SLOT_CAP 個まで
                var iCount = 0;
                Object.keys(dict).forEach(function(k){ if (Number(dict[k].状態)===1) iCount++; });
                if (iCount >= ITEM_SLOT_CAP) { samToast('warning', '体上の負重が満杯です(アイテム'+ITEM_SLOT_CAP+'個), 現在のアイテムを外してから再試行してください'); return; }
            }
        }
        // 共通: 目標状態を設定
        var ok2 = writeBackMvu(function(statData) {
            var d = isEquip ? (statData.キャラ.装備||{}) : (statData.キャラ.道具||{});
            if (d[key]) d[key].状態 = targetStatus;
        });
        if (ok2) {
            var actLabel = {wear:'装着',remove:'取り外し',store:'収納',takeback:'取り戻し'}[action];
            samToast('success', actLabel+'成功: '+key);
            renderAll();
        } else {
            samToast('error', '操作失敗: MVU書き戻しを利用できません');
        }
    }

    /* ===== 32d. 形態アクティブ化(MVUへ書き戻し) ===== */
    function handleFormActivate(formName) {
        if (!formName) return;
        var sd = getStatData();
        if (!sd || !sd.キャラ) { samToast('error', 'データが未準備です'); return; }
        var p = sd.キャラ;
        var cf = p.現在形態 || {};
        // アクティブ化済みの形態(現在有効)は重複してアクティブ化できない
        if (cf.激活 === true && safeStr(cf.名称) === formName) {
            samToast('warning', 'この形態はすでにアクティブです: ' + formName);
            return;
        }
        // クールダウンがゼロでないとアクティブ化できない(ゼロになって初めて再アクティブ化できる)
        var forms = p.形態庫 || {};
        var f = forms[formName] || {};
        var cdM = safeStr(f.冷却).match(/^(\d+)\s*\/\s*(\d+)/);
        var cdCur = cdM ? (parseInt(cdM[1], 10) || 0) : 0;
        if (cdCur > 0) {
            samToast('warning', 'クールダウン中です, アクティブ化できません: ' + formName + ' (残り' + cdCur + 'ターン)');
            return;
        }
        // 書き戻し: 当前形态 を設定 + 当該形態のクールダウンを2ターンに(他の形態のクールダウンは触らない)
        var ok = writeBackMvu(function(statData) {
            var pp = statData.キャラ;
            if (!pp) return;
            // 当前形态 を設定
            pp.現在形態 = { 激活: true, 名称: formName };
            // 当該形態のクールダウンを 2/2 回合に設定(他の形態のクールダウンには触れない)
            var ff = pp.形態庫 || {};
            if (ff[formName]) {
                ff[formName].冷却 = '2/2 回合';
            }
            // ★ フロントの形態アクティブ化 → 待播报记录 へ記録(今回の書き戻しと同じタイミングで保存, 本文モデルの叙述後に自動クリア)
            shopAppendReceipt(statData, '[変身][キャラ] 形態「' + formName + '」をアクティブ化');
        });
        if (ok) {
            samToast('success', '形態をアクティブ化しました: ' + formName + ' (クールダウン1ターン)');
            renderAll();
        } else {
            samToast('error', 'アクティブ化失敗: MVU書き戻しを利用できません');
        }
    }

    /* ===== 32e. 形態アクティブ化解除(MVUへ書き戻し) ===== */
    function handleFormDeactivate(formName) {
        if (!formName) return;
        var sd = getStatData();
        if (!sd || !sd.キャラ) { samToast('error', 'データが未準備です'); return; }
        var p = sd.キャラ;
        var cf = p.現在形態 || {};
        // 現在アクティブな形態がこれと一致する場合のみ解除できる
        if (!(cf.激活 === true && safeStr(cf.名称) === formName)) {
            samToast('warning', 'この形態はアクティブではありません, 解除の必要はありません: ' + formName);
            return;
        }
        // 書き戻し: 当前形态 を非アクティブに + 名称をクリア(クールダウンはそのまま, 元のカウントダウンを継続)
        var ok = writeBackMvu(function(statData) {
            var pp = statData.キャラ;
            if (!pp) return;
            pp.現在形態 = { 激活: false, 名称: '' };
            // ★ フロントの形態アクティブ化解除 → 待播报记录 へ記録(今回の書き戻しと同じタイミングで保存, 本文モデルの叙述後に自動クリア)
            shopAppendReceipt(statData, '[変身終了][キャラ] 形態「' + formName + '」を解除');
        });
        if (ok) {
            samToast('success', '形態を解除しました: ' + formName);
            renderAll();
        } else {
            samToast('error', '解除失敗: MVU書き戻しを利用できません');
        }
    }

    /* ===== 32f. R21-噂取引: 汎用確認ダイアログ(ネイティブ confirmの代替) =====
       samConfirm(title, body, onOk) → モーダルを描画, onOk はユーザーが確認を押した時に同期的に呼び出される
    */
    function samConfirm(title, body, onOk) {
        // #samsara-modal のオーバーレイを再利用(z-index:1000000, blur 背景付き, パネルの999998より上位)
        // これにより確認ダイアログがメイン画面/パネルに隠れない
        var $m = $('#samsara-modal');
        if (!$m.length) { $('body').append('<div id="samsara-modal"></div>'); }
        $m = $('#samsara-modal');
        var box = '<div class="sam-confirm-box">'
            + '<div class="sam-confirm-title">'+esc(title)+'</div>'
            + '<div class="sam-confirm-body">'+esc(body)+'</div>'
            + '<div class="sam-confirm-actions">'
            + '<button type="button" class="sam-confirm-btn cancel">キャンセル</button>'
            + '<button type="button" class="sam-confirm-btn ok">確認</button>'
            + '</div></div>';
        $m.html(box).addClass('open');
        // ボタンクリック: キャンセル/確認 → ダイアログを閉じる; 確認なら onOk をコールバック
        $m.off('click.samConfirm').on('click.samConfirm', '.sam-confirm-btn', function(e) {
            e.stopPropagation();
            var isOk = $(this).hasClass('ok');
            // samConfirm 自身の全イベント(オーバーレイの外側クリックで閉じる処理を含む)を掃除し, 次回 #samsara-modal を再利用する showModal に残留しないようにする
            $m.off('click.samConfirm').off('click.samConfirmBg');
            $m.removeClass('open').empty();
            if (isOk && typeof onOk === 'function') {
                try { onOk(); } catch(err) { console.error('[主神端末] samConfirm onOk error:', err); }
            }
        });
        // オーバーレイ(ダイアログ外)のクリックでキャンセル
        $m.off('click.samConfirmBg').on('click.samConfirmBg', function(e) {
            if (e.target === this) {
                $m.off('click.samConfirm').off('click.samConfirmBg');
                $m.removeClass('open').empty();
            }
        });
    }

    /* ===== 32g. R21-噂取引: SillyTavern の入力欄へテキストを送信 =====
       sendToInputBox(text, autoSend):
         - autoSend=true: 入力して送信ボタンをクリック
         - autoSend=false: 入力欄へ追記のみ(自動送信しない), 既に存在する場合は重複追記しない
       戻り値 true=成功, false=入力欄が見つからない
       参考 创世状态栏.txt の sendToChat/sendMessageToChat
    */
    function sendToInputBox(text, autoSend) {
        try {
            var win = GS_PARENT || window;
            var $jq = (win.jQuery || window.jQuery || $);
            if (!$jq) return false;
            var $ta = $jq(win.document || document).find('#send_textarea');
            if (!$ta.length) return false;
            if (autoSend) {
                // 自動送信モード: 入力欄を上書き + input を発火 + 送信ボタンをクリック
                var textarea = $ta[0];
                textarea.value = String(text || '');
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                var sendBtn = (win.document || document).getElementById('send_but');
                if (sendBtn) sendBtn.click();
                return true;
            }
            // 追記モード: 既存の内容を上書きせず, 同じテキストが含まれていればスキップ
            var cur = $ta.val() || '';
            if (cur.indexOf(text) !== -1) return true;
            $ta.val((cur.trim() ? cur + ' ' : '') + text);
            $ta.trigger('input');
            return true;
        } catch (err) {
            console.error('[主神端末] sendToInputBox 失敗:', err);
            return false;
        }
    }

    /* ===== 32h. R21-噂取引: 単一の噂を削除(MVUへ書き戻し) =====
       sectionKey: '街頭の噂' | '情報取引' | '布告と檄文'
       name: 噂の key(名前)
    */
    function handleRumorDelete(sectionKey, name) {
        if (!sectionKey || !name) return;
        var ok = writeBackMvu(function(statData) {
            if (!statData || !statData.噂 || !statData.噂[sectionKey]) return;
            if (statData.噂[sectionKey][name]) {
                delete statData.噂[sectionKey][name];
                try { console.log('%c[主神端末] ✅ 噂を削除しました: '+sectionKey+'/'+name, 'color:#86efac'); } catch(e){}
            }
        });
        if (ok) { samToast('success', '噂を削除しました: ' + name); renderAll(); }
        else samToast('error', '削除失敗: MVU書き戻しを利用できません');
    }

    /* ===== 32i. R21-噂取引: 指定カテゴリの噂を全てクリア(MVUへ書き戻し) ===== */
    function handleRumorClearSection(sectionKey) {
        if (!sectionKey) return;
        var ok = writeBackMvu(function(statData) {
            if (!statData || !statData.噂) return;
            statData.噂[sectionKey] = {};
            try { console.log('%c[主神端末] ✅ 噂カテゴリをクリアしました: '+sectionKey, 'color:#86efac'); } catch(e){}
        });
        if (ok) { samToast('success', 'カテゴリをクリアしました: ' + sectionKey); renderAll(); }
        else samToast('error', 'クリア失敗: MVU書き戻しを利用できません');
    }

    /* ===== 32j. R21-噂取引: 全ての噂を削除(街头巷议+情报交易+布告与檄文) ===== */
    function handleRumorClearAll() {
        var ok = writeBackMvu(function(statData) {
            if (!statData || !statData.噂) return;
            statData.噂 = { 街頭の噂: {}, 情報取引: {}, 布告と檄文: {} };
            try { console.log('%c[主神端末] ✅ 全ての噂を削除しました', 'color:#86efac'); } catch(e){}
        });
        if (ok) { samToast('success', '全ての噂を削除しました'); renderAll(); }
        else samToast('error', '削除失敗: MVU書き戻しを利用できません');
    }

    /* ===== 33. 保存編集(MVUへ書き戻し) ===== */
    function saveEdits() {
        var $panel = $('#samsara-panel');
        var $modal = $('#samsara-modal'); // ★ modal 内(NPCプロフィール編集など)にも入力欄がある, 一括スキャン
        var changes = [];
        // まず編集状態のまま(フォーカスが外れていない)の入力欄を一時保存してpendingEdits へ入れる
        $panel.find('.sam-edit-active').each(function() { flushStagedDisplay($(this)); });
        $modal.find('.sam-edit-active').each(function() { flushStagedDisplay($(this)); });
        // ★ 職業構造化エディタ: カード内にフォーカスが残っていても一時保存が必要, 全てのコンテナを再構成
        $panel.find('.sam-occ-edit').each(function() { occReassemble($(this)); });
        $modal.find('.sam-occ-edit').each(function() { occReassemble($(this)); });
        // pendingEditsから変更を収集(クリック即編集の一時保存領域)
        Object.keys(pendingEdits).forEach(function(path) {
            if (isReadonlyPath(path)) return;
            changes.push({ path: path, val: pendingEdits[path].val });
        });
        // toggle フィールド(スイッチも書き込まれpendingEditsに入る, 念のため再スキャン; modal 内 NPC プロフィールのスイッチも同様に収集)
        $panel.add($modal).find('.sam-toggle-switch[data-toggle="field"]').each(function() {
            var $el = $(this);
            var path = $el.data('path');
            if (!path) return;
            if (isReadonlyPath(path)) return;
            if (pendingEdits[path]) return; // 一時保存済みならスキップ
            changes.push({path: path, val: $el.hasClass('on')});
        });
        if (changes.length === 0) {
            try { console.log('%c[主神端末] 変更なし', 'color:#8b95a6'); } catch(e){}
            pendingEdits = {};
            setEditMode(false);
            closeModal();
            renderAll();
            return;
        }
        var ok = writeBackMvu(function(statData) {
            changes.forEach(function(c) {
                try {
                    var v = c.val;
                    // ★ 職業は記録オブジェクトに変更済み: 編集モードではJSONテキストとして送信, 書き戻し前にオブジェクトへ復元を試みる
                    if (/^(?:角色|关系列表\.[^.]+)\.职业$/.test(c.path) && typeof v === 'string') {
                        var trimmed = v.trim();
                        if (trimmed === '') { v = {}; }
                        else { try { v = JSON.parse(trimmed); } catch(e2) { /* 不正なJSONは元の文字列を保持,ZOD層が拒否してフォールバックする */ } }
                    }
                    if (_ && _.set) _.set(statData, c.path, v);
                    else setByPathFallback(statData, c.path, v);
                } catch(e) { console.warn('[主神端末] 書き込みパス失敗:', c.path, e); }
            });
        });
        if (ok) {
            pendingEdits = {};
            // 編集モードを終了
            setEditMode(false);
            closeModal();
            setTimeout(renderAll, 300);
        } else {
            showModal('保存失敗', '<div class="sam-empty">MVU書き戻しAPIを利用できません,環境を確認してください</div>');
        }
    }
    function setByPathFallback(obj, path, value) {
        var keys = path.split('.');
        var cur = obj;
        for (var i = 0; i < keys.length - 1; i++) {
            if (cur[keys[i]] === undefined) cur[keys[i]] = {};
            cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
    }

    /* ===== 34. 起動処理 ===== */
    function init() {
        initSamsaraCSS();
        initSamsaraDOM();
        // 共有するのは呼び出し能力のみ、キーは引き続き端末が管理する。パネルの受け渡しは正式なスイッチを変更しない。
        GS_PARENT.Samsara = GS_PARENT.Samsara || {};
        GS_PARENT.Samsara.terminal = {
            request: function(system, input, options) { return apiChat(system, input, options); },
            apiReady: function() { return isApiConfigEnabled() && !!getApiConfig().model; },
            enableApi: function() {
                saveApiConfig(function(cfg) { cfg.enabled = true; });
                return isApiConfigEnabled();
            },
            suspend: function() {
                var panel = $('#samsara-panel');
                var state = { open: panel.hasClass('open'), scroll: $('#sam-tab-content').scrollTop() || 0 };
                panel.hide(); $('#samsara-ball').hide();
                return state;
            },
            restore: function(state) {
                if (state && state.open) {
                    if (!isEditMode()) renderAll();
                    $('#samsara-panel').css('display', 'flex').addClass('open');
                    $('#samsara-ball').hide();
                    $('#sam-tab-content').scrollTop(state.scroll || 0);
                } else { $('#samsara-ball').show(); }
            }
        };
        if (GS_PARENT.Samsara.worldEngine && typeof GS_PARENT.Samsara.worldEngine.isConfigured === 'function' && GS_PARENT.Samsara.worldEngine.isConfigured()) {
            var _worldUsesDedicated = typeof GS_PARENT.Samsara.worldEngine.usesDedicatedApi === 'function' && GS_PARENT.Samsara.worldEngine.usesDedicatedApi();
            if (!_worldUsesDedicated) GS_PARENT.Samsara.terminal.enableApi();
        }
        renderAll();
        try {
            if (localStorage.getItem(SAM_CONFIG.open) === '1') {
                var $panel = $('#samsara-panel');
                var $ball = $('#samsara-ball');
                if (!isMobile()) {
                    var r = $ball[0].getBoundingClientRect();
                    var vw = GS_PARENT.innerWidth, vh = GS_PARENT.innerHeight;
                    var pw = $panel.outerWidth() || 720;
                    var nl = Math.max(20, Math.min(vw - pw - 20, r.left > vw/2 ? r.left - pw - 20 : r.left + 60));
                    var nt = Math.max(20, Math.min(vh - 700, r.top));
                    $panel.css({left:nl+'px', top:nt+'px', right:'auto', bottom:'auto'});
                } else {
                    $panel.css({left:'', top:'', right:'', bottom:'', margin:''});
                }
                $panel.css('display','flex').addClass('open');
                $ball.hide();
            }
        } catch (e) {}

        var win = getMvuGlobal();
        // ★ デバウンス更新: 500ms 以内に複数イベントが起きても renderAll は一度だけ発火
        //   - "補助計算スクリプト"が属性を再計算する時間を確保(古い値を読まないように)
        //   - 連続イベント(複数階層の削除/連続swipe/複数回の変数更新)をまとめて毎回の再描画によるカクつきを防ぐ
        //   - renderAll は読み取り専用, MVU, への書き戻しを行わないため無限ループの危険はない
        var _refreshTimer = null;
        var debouncedRefresh = function() {
            if (_refreshTimer) clearTimeout(_refreshTimer);
            _refreshTimer = setTimeout(function() {
                _refreshTimer = null;
                if ($('#samsara-panel').hasClass('open') && !isEditMode()) renderAll();
            }, 500);
        };
        try {
            // 1) MVU 変数更新終了 → 更新(元の updateFunc, デバウンス版に変更)
            if (win && win.Mvu && win.Mvu.events) {
                $(document).off('VARIABLE_UPDATE_ENDED.sam');
                $(document).on('VARIABLE_UPDATE_ENDED.sam', debouncedRefresh);
                if (typeof eventOn === 'function') eventOn(win.Mvu.events.VARIABLE_UPDATE_ENDED, debouncedRefresh);
            }
            // 2) 酒場ネイティブイベント: 階層削除/swipe切替/チャット切替 → MVU スナップショットのロールバックや切替が起きる, 更新が必要
            //    MVU のイベント体系は"変数更新"のみをカバーし, "階層変更"はカバーしない, 酒場イベントで補う必要がある
            if (typeof tavern_events !== 'undefined') {
                if (tavern_events.MESSAGE_DELETED && typeof eventOn === 'function') eventOn(tavern_events.MESSAGE_DELETED, debouncedRefresh);
                if (tavern_events.MESSAGE_SWIPED  && typeof eventOn === 'function') eventOn(tavern_events.MESSAGE_SWIPED,  debouncedRefresh);
                if (tavern_events.CHAT_CHANGED    && typeof eventOn === 'function') eventOn(tavern_events.CHAT_CHANGED,    debouncedRefresh);
            }
        } catch (e) {}
        // DOM監視タイマー: 玉/パネルが削除されたら再構築
        window.samsaraGuardTimer = setInterval(function() {
            if (!document.getElementById('samsara-ball') || !document.getElementById('samsara-panel')) {
                initSamsaraDOM();
                renderAll();
                if (GS_PARENT.Samsara.worldEngine && GS_PARENT.Samsara.worldEngine.isOpen()) GS_PARENT.Samsara.terminal.suspend();
            }
        }, 15000);
        if (GS_PARENT.Samsara.worldEngine && GS_PARENT.Samsara.worldEngine.isOpen()) GS_PARENT.Samsara.terminal.suspend();
        try { (window.parent || window).__悬浮球状态栏_loaded__ = true; } catch(e) { window.__悬浮球状态栏_loaded__ = true; }
        // 注: データ更新タイマーは renderAll() の"端末未応答"分岐内へ移し必要時に起動, データ受信後に自動クリア, 無駄な更新でスクロールとパフォーマンスへ影響するのを避ける
        try { console.log('%c[主神端末] ✅ v2 初期化完了,因果連鎖を監視...', 'color:#86efac;font-weight:bold'); } catch(e){}
    }

    (function bootstrap() {
        if (!$ || !_ || !document.body) { try { _ = (GS_PARENT._ || window._); } catch (e) {} return setTimeout(bootstrap, 200); }
        init();
    })();

    try { $(window).on('unload.sam', samPreClean); } catch (e) {}
})();
