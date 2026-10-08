// 補助計算スクリプトの唯一の開発ソースは src/Calculator から生成。
(function () {
    'use strict';

    var CALCULATOR_VERSION = '1.0.1';
    var CALCULATOR_HOST = (function () {
        var host = window;
        try {
            while (host.parent && host.parent !== host) { void host.parent.document; host = host.parent; }
        } catch (_) {}
        return host;
    })();
    var GS_PARENT = CALCULATOR_HOST;
    var CALCULATOR_LOADER = CALCULATOR_HOST.SamsaraCalculatorLoader || {};

    class CalculatorRuntimeLifecycle {
        constructor(host, loader) {
            this.host = host;
            this.version = CALCULATOR_VERSION;
            this.ref = String(loader && loader.ref || '');
            this.sha = String(loader && loader.sha || '');
            this.url = String(loader && loader.url || '');
            this.startedAt = Date.now();
            this.subscriptions = [];
        }
        track(subscription) {
            if (subscription && typeof subscription.stop === 'function') this.subscriptions.push(subscription);
            return subscription;
        }
        stopSubscriptions() {
            var current = this.subscriptions.splice(0);
            for (var i = 0; i < current.length; i++) {
                try { current[i].stop(); } catch (_) {}
            }
        }
        stop() { this.stopSubscriptions(); }
    }

    function calculatorPreClean() {
        try {
            var previous = CALCULATOR_HOST.SamsaraCalculatorRuntime;
            if (previous && typeof previous.stopSubscriptions === 'function') previous.stopSubscriptions();
            else if (previous && typeof previous.stop === 'function') previous.stop();
            try { CALCULATOR_HOST.__辅助计算脚本_loaded__ = false; } catch (_) {}
        } catch (error) {
            try { console.warn('[辅助计算脚本] ホットリロード事前クリーンアップに失敗:', error && error.message ? error.message : error); } catch (_) {}
        }
    }
    calculatorPreClean();

    var CALCULATOR_RUNTIME = new CalculatorRuntimeLifecycle(CALCULATOR_HOST, CALCULATOR_LOADER);
    CALCULATOR_HOST.SamsaraCalculatorRuntime = CALCULATOR_RUNTIME;
    CALCULATOR_HOST.Samsara = CALCULATOR_HOST.Samsara || {};
    CALCULATOR_HOST.Samsara.CalculatorInfo = {
        version: CALCULATOR_VERSION,
        ref: CALCULATOR_RUNTIME.ref,
        sha: CALCULATOR_RUNTIME.sha,
        url: CALCULATOR_RUNTIME.url,
        startedAt: CALCULATOR_RUNTIME.startedAt
    };
    function trackCalculatorSubscription(subscription) {
        return CALCULATOR_RUNTIME.track(subscription);
    }


    function getMvuGlobal() {
        try {
            if (typeof window.Mvu !== 'undefined') return window;
            if (typeof GS_PARENT.Mvu !== 'undefined') return GS_PARENT;
        } catch (e) {}
        return null;
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
    /* F2_LEGACY_PATH_COMPAT: 旧セーブの簡体字 MVU キーを正規キーへ読み取り時に移行する。入力境界専用・冪等。 */
    /* 半移行(接頭辞 JP + 葉 CN)のパスはどちらのスキーマでも解決しないため, 旧セーブだけでなく
       移行期に書かれたデータもここで回収する。canonical が既にあれば常にそちらを優先する。 */
var LEGACY_KEY_PREFERRED = {"关系リスト":true};
    var LEGACY_KEY_RENAMES = {"传闻":"噂","布告与檄文":"布告と檄文","发布者":"発布者","张贴位置":"掲示位置","街头巷议":"街頭の噂","可信度":"信頼度","来源":"出典","情报交易":"情報取引","卖家":"売り手","情报评级":"情報評価","要价":"要求価格","摘要":"要約","真实内幕":"真の内幕","关系リスト":"関係リスト","背景故事":"背景","层级":"階層","当前形态":"現在形態","标签":"タグ","标签[]":"タグ[]","类型":"タイプ","描述":"説明","品质":"品質","效果":"効果","状态":"状態","消耗":"消費","身份":"身分","身份[]":"身分[]","是否队友":"仲間","态度":"態度","外貌":"外見","喜爱":"好み","形态库":"形態庫","力量":"筋力","体质":"体力","血统":"血統","在场":"登場","着装":"服装","职业":"職業","种族":"種族","装备":"装備","持续":"持続","最终属性":"最終属性","魔法减伤率":"魔法軽減率","物理减伤率":"物理軽減率","先攻DC":"先制DC","角色":"キャラ","空间币":"スペースコイン","权限凭证":"権限証憑","任务":"任務","副本成就":"インスタンス実績","奖励":"報酬","难度":"難易度","说明":"説明","击杀":"撃破","列表":"リスト","惩罚":"罰則","交付":"納品","目标":"目標","委托方":"依頼元","隐藏真相":"隠された真実","成员商库":"メンバー商品庫","道具列表":"道具リスト","道具列表[]":"道具リスト[]","价格":"価格","技能列表":"技能リスト","技能列表[]":"技能リスト[]","升级列表":"升級リスト","升级列表[]":"升級リスト[]","所属大类":"所属カテゴリ","替换目标":"置換対象","血统列表":"血統リスト","血统列表[]":"血統リスト[]","装备列表":"装備リスト","装备列表[]":"装備リスト[]","设置":"設定","单一世界":"単一世界","世界超稳":"世界超安定","法则":"法則","法则[]":"法則[]","后台":"バックステージ","货币":"通貨","购买力基准":"購買力基準","经济波动":"経済変動","历法":"暦法","闰年规则":"閏年規則","月份天数":"月日数","月份天数[]":"月日数[]","时间":"時間","势力":"勢力","领地":"領地","实力":"実力","风险":"リスク","稳定":"安定","异端雷达":"異端レーダー","当前模式":"現在モード","名单":"名簿","经历":"経歴","阵营":"陣営","因果轨道":"因果軌道","当前阶段":"現在段階","故事线":"ストーリーライン","偏移记录":"偏移記録","引发者":"誘発者","影响程度":"影響度","下一节点":"次ノード","系统状态":"システム状態","待播报记录":"配信待ち記録","当前轮次":"現在ラウンド","上次世界日期":"前回世界日付","试炼任务名单":"試練任務名簿","试炼任务名单[]":"試練任務名簿[]","试炼已完成":"試練完了","是否可试炼":"試練可能","是否试炼任务":"試練任務中","是否在主神空间":"主神空間滞在中","是否战斗中":"戦闘中","游玩天数":"プレイ日数","待办事件":"待機イベント","待办事件[]":"待機イベント[]","建设序列":"建設シーケンス","产出":"産出","功能":"機能","阶段":"段階","下次产出日期":"次回産出日","下次产出游天":"次回産出游日","能源":"エネルギー","当前":"現在","所属对象":"所属対象","所属对象[]":"所属対象[]","完整度":"完全度","消耗单元":"消耗ユニット","余量":"残量","主体规模":"主体規模","驻扎人员":"駐留人員","关系列表":"関係リスト"};
    /* F5B_ENGINE_RECORD_SCOPE: 世界エンジン自身の自由形式レコードコンテナ。ZOD はこれらを
       z.record(z.string(), z.any()) / z.array(z.any()) として宣言しており、内部キーは MVU キーでは
       なくエンジン自身の記録モデル(RECORDS/DETAILS, 簡体字のまま読む)である。再帰リネームの
       走査対象から除外する。除外リストは live ZOD と 世界推進システム.js L745 から導出
    (伝播 は 传播 の日本語表記に対する防御的別名)。 */
    var LEGACY_OPAQUE_SUBTREES = { '世界.バックステージ.事件': true, '世界.バックステージ.人物': true, '世界.バックステージ.势力地区': true, '世界.バックステージ.历史': true, '世界.バックステージ.历史总结': true, '世界.バックステージ.传播': true, '世界.バックステージ.运行记录': true, '世界.バックステージ.最近变化': true, '世界.バックステージ.资产墓碑': true, '世界.バックステージ.正文承接': true, '世界.バックステージ.伝播': true };
                        function normalizeLegacyWorldKeys(stat) {
        if (!stat || typeof stat !== 'object') return stat;
        var seen = new Set();
        (function walk(node, path) {
            if (!node || typeof node !== 'object' || seen.has(node)) return;
            seen.add(node);
            if (path && Object.prototype.hasOwnProperty.call(LEGACY_OPAQUE_SUBTREES, path)) return;
            if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) walk(node[i], path + '[]'); return; }
            /* Two legacy spellings can target the SAME canonical key, so the pass runs in
               two phases: preferred sources first, then the rest.  A source only fills the
               canonical slot if neither a real canonical value nor a preferred source
               already claimed it.  Both legacy keys are always removed. */
            var preexisting = {};
            var claimed = {};
            var keys = Object.keys(node);
            for (var p = 0; p < keys.length; p++) preexisting[keys[p]] = true;
            var phases = [LEGACY_KEY_PREFERRED, null];
            for (var ph = 0; ph < phases.length; ph++) {
                for (var k = 0; k < keys.length; k++) {
                    var from = keys[k];
                    var to = LEGACY_KEY_RENAMES[from];
                    if (!to || to === from) continue;
                    var preferred = Object.prototype.hasOwnProperty.call(LEGACY_KEY_PREFERRED, from);
                    if (ph === 0 ? !preferred : preferred) continue;
                    if (!Object.prototype.hasOwnProperty.call(node, from)) continue;
                    if (!preexisting[to] && !claimed[to]) { node[to] = node[from]; claimed[to] = true; }
                    delete node[from];
                }
            }
            var next = Object.keys(node);
            for (var j = 0; j < next.length; j++) walk(node[next[j]], path ? path + '.' + next[j] : next[j]);
        })(stat, '');
        return stat;
    }
    // F5_QUEST_KEY_COMPAT: 旧セーブ/旧バージョンの 任務.リスト / 任務.インスタンス実績 レコードが
    // 簡体字のフィールド名(委托方/目标/难度/奖励/交付/状态/惩罚/说明)で保存されていても、読み取り時に
    // ZOD が宣言する正規名(依頼元/目標/難易度/報酬/納品/状態/罰則/説明)へ移行する。入力境界専用。
    // 冪等: 旧名が一つも無ければ即 return する。正規名が既にあれば常にそちらを優先し、旧名は必ず削除する。
    // 走査範囲はこの二つのコンテナだけに限定する — 世界エンジン自身の記録モデル
    // (世界.バックステージ.* は ZOD 上 z.record(z.string(), z.any()) であり MVU キーではない)には触れない。
    const QUEST_ROOT_CANONICAL = '任務';
    const QUEST_ROOT_LEGACY = '任务';
    const QUEST_CONTAINER_NAMES = ['リスト', 'インスタンス実績'];
    const QUEST_CONTAINER_RENAMES = { 列表: 'リスト', 副本成就: 'インスタンス実績' };
    const QUEST_FIELD_RENAMES = {
        委托方: '依頼元', 目标: '目標', 难度: '難易度', 奖励: '報酬',
        交付: '納品', 状态: '状態', 惩罚: '罰則', 隐藏真相: '隠された真実', 说明: '説明'
    };
    function questRecordHasLegacyKey(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
        for (const legacy of Object.keys(QUEST_FIELD_RENAMES)) {
            if (Object.prototype.hasOwnProperty.call(record, legacy)) return true;
        }
        return false;
    }
    function renameQuestKeys(record, table) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
        let moved = false;
        for (const legacy of Object.keys(table)) {
            if (!Object.prototype.hasOwnProperty.call(record, legacy)) continue;
            const canonical = table[legacy];
            if (canonical === legacy) continue;
            const value = record[legacy];
            delete record[legacy];
            if (record[canonical] === undefined || record[canonical] === null) record[canonical] = value;
            moved = true;
        }
        return moved;
    }
    function normalizeLegacyQuestKeys(stat) {
        if (!stat || typeof stat !== 'object') return stat;
        const hasLegacyRoot = Object.prototype.hasOwnProperty.call(stat, QUEST_ROOT_LEGACY);
        const root = hasLegacyRoot ? stat[QUEST_ROOT_LEGACY] : stat[QUEST_ROOT_CANONICAL];
        if (!root || typeof root !== 'object') return stat;
        // early return: 旧ルート名・旧コンテナ名・旧フィールド名のいずれも無ければ何もしない
        let present = hasLegacyRoot;
        if (!present) {
            for (const legacy of Object.keys(QUEST_CONTAINER_RENAMES)) {
                if (Object.prototype.hasOwnProperty.call(root, legacy)) { present = true; break; }
            }
        }
        if (!present) {
            for (const container of QUEST_CONTAINER_NAMES) {
                const bucket = root[container];
                if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue;
                for (const name of Object.keys(bucket)) {
                    if (questRecordHasLegacyKey(bucket[name])) { present = true; break; }
                }
                if (present) break;
            }
        }
        if (!present) return stat;
        if (hasLegacyRoot) {
            const legacyRoot = stat[QUEST_ROOT_LEGACY];
            delete stat[QUEST_ROOT_LEGACY];
            if (stat[QUEST_ROOT_CANONICAL] === undefined || stat[QUEST_ROOT_CANONICAL] === null) stat[QUEST_ROOT_CANONICAL] = legacyRoot;
        }
        const canonicalRoot = stat[QUEST_ROOT_CANONICAL];
        if (!canonicalRoot || typeof canonicalRoot !== 'object') return stat;
        renameQuestKeys(canonicalRoot, QUEST_CONTAINER_RENAMES);
        for (const container of QUEST_CONTAINER_NAMES) {
            const bucket = canonicalRoot[container];
            if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue;
            for (const name of Object.keys(bucket)) renameQuestKeys(bucket[name], QUEST_FIELD_RENAMES);
        }
        return stat;
    }
    function getStatData() {
        try {
            var win = getMvuGlobal();
            if (win && win.Mvu && typeof win.Mvu.getMvuData === 'function') {
                var r = win.Mvu.getMvuData({ type: 'message', message_id: 'latest' });
                if (r && r.stat_data) { normalizeLegacyCharacterKey(r.stat_data); normalizeLegacyWorldKeys(r.stat_data); return r.stat_data; }
                if (r) return r;
            }
            if (typeof GS_PARENT.getMessageVar === 'function') return GS_PARENT.getMessageVar('stat_data');
            if (typeof window.getMessageVar === 'function') return window.getMessageVar('stat_data');
        } catch (e) { console.warn('[主神终端] データ読み取り異常:', e.message); }
        return null;
    }

    /**
     * MVU への書き戻し：stat_data への変更を Mvu.replaceMvuData で正式に保存する
     *   - CHARACTER_MESSAGE_RENDERED などの"非 VARIABLE_UPDATE_ENDED"コールバックに使用：
     *     この種のコールバックで getStatData() が返す stat_data が MVU 主記憶と同一の参照オブジェクトである保証はなく、
     *     その場でフィールドを書き換えてもデータベースへ永続化されないため、replaceMvuData で message/chat チャネルへ正式に書き戻す必要がある。
     *   - mutator(sd) はディープコピーした副本に対して変更を行い、MVU のメモリスナップショットを汚染しない。
     *   - VARIABLE_UPDATE_ENDEDはブロードキャストしない：決算クリーンアップが変更するのは剧情/世界/任务データであり、属性を再計算する必要もなく、
     *     決算の途中で onUpdateData が走ることによる schema reconciliation のリスクも避けられる。
     *   - 実装は 悬浮球状态栏.js の writeBackMvu と揃えている(イベントブロードキャストのみ削除)。
     * @param {(sd:object)=>void} mutator 変更関数。stat_data の副本を受け取る
     * @returns {boolean} 書き戻しに成功したか
     */
    function writeBackMvu(mutator) {
        try {
            var win = getMvuGlobal();
            if (!win || !win.Mvu || typeof win.Mvu.getMvuData !== 'function' || typeof win.Mvu.replaceMvuData !== 'function') {
                console.warn('[辅助计算脚本] MVU書き戻しAPIが利用できないため、変更は保存されていない');
                return false;
            }
            var mvuData = win.Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            if (!mvuData || !mvuData.stat_data) {
                console.warn('[辅助计算脚本] 書き込み可能なデータがなく、変更は保存されていない');
                return false;
            }
            // ディープコピーした副本を書き換え、最後に全体を書き戻す(正式なチャネル経由で確実に保存)
            var cloned = (typeof _ !== 'undefined' && _ && _.cloneDeep) ? _.cloneDeep(mvuData) : JSON.parse(JSON.stringify(mvuData));
            normalizeLegacyQuestKeys(cloned.stat_data);
            if (typeof mutator === 'function') mutator(cloned.stat_data);
            // message チャネルへ書き戻す
            win.Mvu.replaceMvuData(cloned, { type: 'message', message_id: 'latest' });
            // chat チャネルも同期する
            try { win.Mvu.replaceMvuData(cloned, { type: 'chat' }); } catch (e2) {}
            return true;
        } catch (e) {
            console.error('[辅助计算脚本] MVU書き戻しに失敗:', e);
            return false;
        }
    }

    /** ログ初期化済みかどうか */
    let isInitLog = false;
    /**
     * 再入防止フラグ：スクリプトが stat_data を変更した後に schema reconciliation が
     * 再び VARIABLE_UPDATE_ENDED へ入り、無限ループになるのを防ぐ
     */
    let isProcessing = false;
    /**
     * 本文フロア単位のターン重複防止。スクリプトのメモリ内にのみ保持し、MVU へは書き込まない。
     * 同一の AI 本文フロアで発生する世界進行、UI、schema などの追加変数書き戻しは、状態やクールダウンを重複して消費してはならない。
     */
    let lastTurnMessageKey = '';

    function currentAssistantTurnKey() {
        try {
            const context = SillyTavern.getContext();
            const chat = Array.isArray(context?.chat) ? context.chat : [];
            const chatId = String(context?.chatId ?? '');
            for (let i = chat.length - 1; i >= 0; i--) {
                const msg = chat[i];
                if (!msg) continue;
                const role = String(msg.role || '').toLowerCase();
                if (msg.is_user === true || msg.is_system === true || role === 'user' || role === 'system') continue;
                return `${chatId}:${i}`;
            }
        } catch (_) {}
        return '';
    }

    function initializeTurnMessageBaseline() {
        lastTurnMessageKey = currentAssistantTurnKey();
    }
    /**
     * 中核関数：stat_data の更新完了後に実行し、数値計算と属性更新を行う
     * @param {*} rawVariables 元の変数
     * @param {*} rawVariablesBefore 更新前の元の変数
     */
    function onUpdateData(rawVariables, rawVariablesBefore) {
        // 再入防止：処理中の場合はそのままスキップする
        if (isProcessing) {
            return;
        }
        isProcessing = true;
        
        try {
            /** 現在のデータ */
            const statData = rawVariables?.stat_data;
            /** 更新前の現在データ */
            const statDataBefore = rawVariablesBefore?.stat_data;

            if (!statData) return;
            // F5_QUEST_KEY_COMPAT: イベント payload は生データなので、ガードの前に正規名へ移行する。
            normalizeLegacyQuestKeys(statData);
            if (statDataBefore) normalizeLegacyQuestKeys(statDataBefore);

            // ★ 関係リストは、通常キャラクターが引き続きバックエンド人物管理の対象かどうかを示すライフサイクル信号。
            //   関係リストから明示的に削除されたキャラクターは 世界.バックステージ.人物 からも同期削除し、世界進行コンテキストを占有し続けないようにする；異端レーダーは独立管理のためここでは変更しない。
            syncRemovedRelationshipPeople(statData, statDataBefore);
            // 資産の削除と再構築も同じくプログラム側ライフサイクルの墓碑を通す。
            syncRemovedAssets(statData, statDataBefore);
            // ★ 異端のライフサイクルは通常の関係リストとは独立：死亡は不可逆；死亡後は関係実体とバックエンド人物活動の両方を退役させ、レーダーには死亡記録を残す。
            syncAlienLifecycle(statData, statDataBefore);

            // ★ タスク生成の同層まるごとロック：後続の計算より前に、美化プログラムの権威スナップショットを復元する。
            //   影響するのは 任務.リスト / 任務.インスタンス実績 のみで、任務.撃破 やその他の変数には影響しない。
            guardTaskGenerationLock(statData);

            // ★ 後続フロアのタスク委託元ガード：主神任务 / 晋升试炼 の委託元のみを保護する。
            guardPersistedSystemTaskOwner(statData, statDataBefore);

            const users = statData.キャラ;
            if (!users) return;

            // 状態の持続時間、戦闘ラウンド、クールダウンは「新規の AI 本文フロア」でのみ一度だけ進む。
            // 世界進行、UI 操作、schema reconciliation など同一フロアでの二度目以降の書き戻しはデータ整合性の計算のみを行い、ターンを消費しない。
            const turnMessageKey = currentAssistantTurnKey();
            const uiMutation = isUIMutationActive();
            let shouldAdvanceTurn = false;
            if (turnMessageKey) {
                if (!lastTurnMessageKey) lastTurnMessageKey = turnMessageKey;
                else shouldAdvanceTurn = !uiMutation && turnMessageKey !== lastTurnMessageKey;
            }

            // ★ まず保護フィールドをロールバックし、その後で後続の計算を実行する
            guardProtectedFields(statData, statDataBefore);

            // ★ 原住民NPCの位格/血統品質の抑制: 新規登場した原住民の 层级/血统品质 が 世界.位格 を超える → 世界位格まで押し戻す
            //   (主神空間内では抑制しない; 角色/穿越者/守护者/织梦者/篡夺者/残魂 などの特殊身分は抑制しない)
            clampNativeNpcToWorldTier(statData, statDataBefore);
            applyNewNpcDifficulty(statData, statDataBefore);

            // 初期化ログ（一度だけ出力）
            if (!isInitLog) {
                isInitLog = true;
            }

            // 全キャラクターの属性を再計算（before を渡し、NPC 集団の THP/数量 同期判定に用いる）
            recalcAllCharacters(statData, statDataBefore);

            // ★ キャラクター昇格判定：五維階位の累計≥24 → システム状態.試練可能=true/false
            //   recalcAllCharacters の後に実行する必要がある(最終属性の確定+階層打ち切りに依存)
            if (statData.キャラ && statData.システム状態) {
                checkTrialEligibility(statData.キャラ, statData.システム状態);
            }

            // 挿入：功法熟練度ガード (モジュール4)
            // guardProficiency(statData.キャラ);

            // 挿入：伴生神器の自動成長 (モジュール3)
            // processArtifactGrowth(statData.キャラ);

            // 挿入：実プレイ日数の進行 (世界.時間 の日付変動 → システム状態.プレイ日数+1)
            updatePlayDays(statData);

            // 挿入：全自動収穫システム (モジュール1, プレイ日数軸で駆動, インスタンスの時間跳躍の影響を受けない)
            autoHarvestAssets(statData, statDataBefore);

            // 【追加】：三つのバックエンド整理ロジックを実行
            const isCombat = statData.システム状態?.戦闘中 === true;

            // 1. キャラクターの道具と状態を整理
            if (statData.キャラ) {
                cleanupZeroQuantityItems(statData.キャラ);
                if (shouldAdvanceTurn) {
                    processStatusDuration(statData.キャラ, isCombat);
                }
            }
            
            // 2. NPC の道具と状態を整理
            if (statData.関係リスト) {
                Object.values(statData.関係リスト).forEach(npc => {
                    if (!npc) return;
                    cleanupZeroQuantityItems(npc);
                    if (shouldAdvanceTurn) {
                        processStatusDuration(npc, isCombat);
                    }
                });
                
                // 3. 死亡済み NPC の整理
                cleanupDeadNPCs(statData);
            }

            // 4. 世界安定値の自動推計 (モジュール9)
            calcWorldStability(statData);

            // 5. 戦闘ラウンドと形態クールダウンの全自動管理 (モジュール10)
            if (shouldAdvanceTurn) {
                processCombatAndCooldowns(statData, statDataBefore);
                // 消費型ターンロジックが完全に実行された後にのみ本フロアを記憶し、例外時は同一フロアでの再試行を許可する。
                lastTurnMessageKey = turnMessageKey;
            }

        } finally {
            isProcessing = false;
        }
    };

    // ===== 軽量パスツール(データガード用) =====
    /** a.b.c パスでネスト値を読み取る */
    function getByPath(obj, path) {
        return path.split('.').reduce((o, k) => o?.[k], obj);
    }

    /** a.b.c パスでネスト値へ書き込む(親ノードが存在しない場合は作成せず,中断) */
    function setByPath(obj, path, value) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur[keys[i]] === undefined) return;
            cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
    }

    /** 変更検出:オブジェクトは JSON シリアライズで比較し,基本型は === で比較する */
    function hasChanged(oldVal, newVal) {
        if (oldVal === newVal) return false;
        if (typeof oldVal === 'object' && typeof newVal === 'object') {
            return JSON.stringify(oldVal) !== JSON.stringify(newVal);
        }
        return true;
    }

    /** 安全なディープコピー( lodash, 無ければ JSON) */
    function clonePlainValue(value) {
        if (value === undefined) return undefined;
        if (typeof _ !== 'undefined' && _?.cloneDeep) return _.cloneDeep(value);
        return JSON.parse(JSON.stringify(value));
    }

    /**
     * 関係リストからの削除 → 世界バックエンド人物の同期退役。
     * 「前状態に存在し、現状態で消えた」明確な削除のみに反応し、関係リストへ一度も入っていない純粋な場外NPCは整理しない。
     * 世界.異端レーダー.名簿 は独立したライフサイクルであり、この関数では決して変更しない。
     */
    function syncRemovedRelationshipPeople(statData, statDataBefore) {
        if (!statData || !statDataBefore) return [];
        const beforeRelations = statDataBefore.関係リスト;
        const currentRelations = statData.関係リスト;
        const backendPeople = statData.世界?.バックステージ?.人物;
        if (!beforeRelations || typeof beforeRelations !== 'object' || Array.isArray(beforeRelations)) return [];
        if (!currentRelations || typeof currentRelations !== 'object' || Array.isArray(currentRelations)) return [];
        if (!backendPeople || typeof backendPeople !== 'object' || Array.isArray(backendPeople)) return [];

        const nameKey = (value) => String(value || '').toLowerCase().replace(/[\\/／·・._\-\s]+/g, '');
        const currentKeys = new Set(Object.keys(currentRelations).map(nameKey));
        const removedNames = Object.keys(beforeRelations).filter(name => !currentKeys.has(nameKey(name)));
        const deleted = [];

        removedNames.forEach((relationName) => {
            if (Object.prototype.hasOwnProperty.call(backendPeople, relationName)) {
                delete backendPeople[relationName];
                deleted.push(relationName);
                return;
            }
            const key = nameKey(relationName);
            const matches = Object.keys(backendPeople).filter(name => nameKey(name) === key);
            // 正規化後の一致が一意な場合のみ自動削除し、名前衝突で他のキャラクターを誤って消さないようにする。
            if (matches.length === 1) {
                delete backendPeople[matches[0]];
                deleted.push(matches[0]);
            }
        });

        if (deleted.length) {
            console.log('[バックエンド人物同期] 関係リストから削除されたキャラクターを人物管理でも同期退役：' + deleted.join('、'));
        }
        return deleted;
    }

    /**
     * 異端ライフサイクルガード。
     * - レーダーの死亡は不可逆であり、後続モデルが 活動中 へ戻すことを拒否する。
     * - 関係実体の HP<=0 または状態が明確に死亡のとき、レーダーも=死亡 に同期する。
     * - 死亡した異端は関係リストと 世界.バックステージ.人物 から同期削除し、本文への再登場や世界エンジンの活動継続を防ぐ；レーダーの死亡記録は保持する。
     */
    function syncAlienLifecycle(statData, statDataBefore) {
        const roster = statData?.世界?.異端レーダー?.名簿;
        if (!roster || typeof roster !== 'object' || Array.isArray(roster)) return { 死亡: [], 删除关系: [], 删除后台: [] };

        const beforeRoster = statDataBefore?.世界?.異端レーダー?.名簿 || {};
        const relations = statData.関係リスト && typeof statData.関係リスト === 'object' ? statData.関係リスト : {};
        const backendPeople = statData.世界?.バックステージ?.人物 && typeof statData.世界.バックステージ.人物 === 'object' ? statData.世界.バックステージ.人物 : {};
        const nameKey = (value) => String(value || '').toLowerCase().replace(/[\\/／·・._\-\s]+/g, '');
        const uniqueMatch = (bucket, name) => {
            if (!bucket || typeof bucket !== 'object') return '';
            if (Object.prototype.hasOwnProperty.call(bucket, name)) return name;
            const key = nameKey(name);
            const matches = Object.keys(bucket).filter(item => nameKey(item) === key);
            return matches.length === 1 ? matches[0] : '';
        };
        const relationDead = (npc) => {
            if (!npc || typeof npc !== 'object') return false;
            if (typeof npc.HP === 'number' && npc.HP <= 0) return true;
            const statuses = npc.状態 && typeof npc.状態 === 'object' ? Object.keys(npc.状態) : [];
            return statuses.some(key => String(key).includes('死亡'));
        };

        const report = { 死亡: [], 删除关系: [], 删除后台: [] };
        for (const [alienName, alien] of Object.entries(roster)) {
            if (!alien || typeof alien !== 'object') continue;
            const previousName = uniqueMatch(beforeRoster, alienName);
            const wasDead = previousName && beforeRoster[previousName]?.状態 === '死亡';
            const relationName = uniqueMatch(relations, alienName);
            const npc = relationName ? relations[relationName] : null;

            if (wasDead && alien.状態 !== '死亡') {
                alien.状態 = '死亡';
                console.warn('[異端ライフサイクル] ' + alienName + ' は死亡済みのため、活跃 への復帰を拒否。');
            }
            if (alien.状態 !== '死亡' && relationDead(npc)) {
                alien.状態 = '死亡';
                console.log('[異端ライフサイクル] ' + alienName + ' はキャラクター死亡の事実により死亡へ同期。');
            }
            if (alien.状態 !== '死亡') continue;

            report.死亡.push(alienName);
            if (relationName && Object.prototype.hasOwnProperty.call(relations, relationName)) {
                delete relations[relationName];
                report.删除关系.push(relationName);
            }
            const backendName = uniqueMatch(backendPeople, alienName);
            if (backendName && Object.prototype.hasOwnProperty.call(backendPeople, backendName)) {
                delete backendPeople[backendName];
                report.删除后台.push(backendName);
            }
        }
        return report;
    }

    /**
     * 現在のフロアより前で、実際に 任務.リスト を含む直近の MVU メッセージスナップショットを読み取る。
     * VARIABLE_UPDATE_ENDED の rawVariablesBefore には依存しない：酒場では一部の追加変数更新時に、
     * before 引数が「前フロアで既に保存されたデータ」と等価であるとは限らない。
     */
    function readPreviousMessageTaskList() {
        try {
            const win = getMvuGlobal();
            const currentId = latestMessageIdForTaskLock();
            if (!win || !win.Mvu || typeof win.Mvu.getMvuData !== 'function') return null;
            if (!Number.isInteger(currentId) || currentId <= 0) return null;

            const minId = Math.max(0, currentId - 4);
            for (let id = currentId - 1; id >= minId; id--) {
                try {
                    const data = win.Mvu.getMvuData({ type: 'message', message_id: id });
                    if (!data) continue;
                    const stat = data.stat_data || data;
                    normalizeLegacyQuestKeys(stat);
                    const list = stat?.任務?.リスト;
                    if (!list || typeof list !== 'object') continue;
                    return list;
                } catch (e) {}
            }
        } catch (e) {
            console.warn('[タスク委託元ガード] 前フロアのタスクスナップショット読取に失敗:', e);
        }
        return null;
    }

    /**
     * 後続フロアのタスク委託元ガード。
     * 唯一の保護フィールド：委托方。
     * 前フロアの実際の MVU スナップショットで 主神任务 / 晋升试炼 に属する同名タスクについて、
     * 現フロアで AI が委託元を何に書き換えても元の委託元へ復元する；その他のフィールドには一切介入しない。
     */
    function guardPersistedSystemTaskOwner(statData, statDataBefore) {
        if (!statData) return false;

        // 前フロアで実際に保存された MVU を優先し、取得できない場合のみイベントの before 引数へフォールバックする。
        const previousList = readPreviousMessageTaskList() || statDataBefore?.任務?.リスト;
        const currentList = statData?.任務?.リスト;
        if (!previousList || typeof previousList !== 'object') return false;
        if (!currentList || typeof currentList !== 'object') return false;

        let repaired = false;
        Object.entries(previousList).forEach(([taskName, oldTask]) => {
            if (!oldTask || typeof oldTask !== 'object') return;
            const oldOwner = String(oldTask.依頼元 || '').trim();
            if (oldOwner !== '主神任務' && oldOwner !== '主神任务' && oldOwner !== '昇格試練' && oldOwner !== '晋升试炼') return;

            const currentTask = currentList[taskName];
            if (!currentTask || typeof currentTask !== 'object') return;

            const newOwner = String(currentTask.依頼元 || '').trim();
            if (newOwner === oldOwner) return;

            // 復元するのは 委托方 のみ；状態、目標、報酬、難易度、ペナルティなどはすべて AI の今回の更新結果を保持する。
            currentTask.依頼元 = oldTask.依頼元;
            repaired = true;
            console.warn(`[タスク委託元ガード] ${taskName}.依頼元 が ${newOwner || '(空)'}, 前フロアのMVUに従い復元 ${oldOwner}`);
        });

        return repaired;
    }

    /**
     * タスク生成の同層まるごとミラーロック。
     * 主神任务/试炼任务美化器 が現メッセージでタスク代入を完了した後、完全な
     * 任務.リスト と 任務.インスタンス実績 のスナップショットを __samsaraTaskGenerationLock に保存する。
     * 同一 message_id の追加変数更新が、フィールドの変更・削除・改名・近似タスクの追加のいずれであっても、
     * そのスナップショットでまるごと上書きする；次のメッセージに入るとロックは自動解除される。
     */
    function taskLockWindows() {
        const wins = [];
        const add = (w) => { if (w && !wins.includes(w)) wins.push(w); };
        try { if (typeof GS_PARENT !== 'undefined') add(GS_PARENT); } catch(e){}
        try { add(window.parent); } catch(e){}
        try { add(window.top); } catch(e){}
        try { add(window); } catch(e){}
        return wins;
    }

    function latestMessageIdForTaskLock() {
        const wins = taskLockWindows();
        for (const w of wins) {
            try {
                if (w && typeof w.getChatMessages === 'function') {
                    const latest = w.getChatMessages(-1)?.[0];
                    const id = Number(latest && (latest.message_id != null ? latest.message_id : latest.id));
                    if (Number.isInteger(id) && id >= 0) return id;
                }
            } catch(e){}
        }
        try {
            if (typeof getChatMessages === 'function') {
                const latest = getChatMessages(-1)?.[0];
                const id = Number(latest && (latest.message_id != null ? latest.message_id : latest.id));
                if (Number.isInteger(id) && id >= 0) return id;
            }
        } catch(e){}
        try {
            if (typeof getCurrentMessageId === 'function') {
                const id = Number(getCurrentMessageId());
                if (Number.isInteger(id) && id >= 0) return id;
            }
        } catch(e){}
        return null;
    }

    function clearTaskGenerationLock(lock) {
        taskLockWindows().forEach((w) => {
            try {
                const cur = w.__samsaraTaskGenerationLock;
                if (!cur) return;
                if (cur === lock || Number(cur.messageId) === Number(lock?.messageId)) {
                    w.__samsaraTaskGenerationLock = null;
                }
            } catch(e){}
        });
    }

    function guardTaskGenerationLock(statData) {
        if (!statData || typeof statData !== 'object') return false;

        // 単一世界 ではデータ層の時点で副本実績の存在を許さない。旧バージョンのタスクロックが実績スナップショットを保持していても、
        // 復元できるのはタスクリストのみで、副本実績を現在の世界へ持ち戻すことはできない。
        const singleWorld = statData?.設定?.単一世界 === true || statData?.設定?.単一世界 === true;
        let singleWorldAchievementClear = false;
        if (singleWorld) {
            if (!statData.任務 || typeof statData.任務 !== 'object') statData.任務 = {};
            const currentAchievements = statData.任務.インスタンス実績;
            if (currentAchievements && typeof currentAchievements === 'object' && Object.keys(currentAchievements).length) {
                statData.任務.インスタンス実績 = {};
                singleWorldAchievementClear = true;
            }
        }

        let lock = null;
        for (const w of taskLockWindows()) {
            try {
                const candidate = w.__samsaraTaskGenerationLock;
                if (candidate && candidate.messageId != null && candidate.taskList && candidate.achievements) {
                    lock = candidate;
                    break;
                }
            } catch(e){}
        }
        if (!lock) return singleWorldAchievementClear;

        const currentMessageId = latestMessageIdForTaskLock();
        // フロア番号が取得できない場合は、層をまたぐ可能性のある復元を行うよりもロックを一時的に保持する方を選ぶ。
        if (currentMessageId === null) return false;

        if (Number(lock.messageId) !== Number(currentMessageId)) {
            clearTaskGenerationLock(lock);
            return false;
        }

        if (!statData.任務 || typeof statData.任務 !== 'object') statData.任務 = {};

        const oldList = statData.任務.リスト || {};
        const oldAchievements = statData.任務.インスタンス実績 || {};
        const expectedAchievements = singleWorld ? {} : (lock.achievements || {});
        const listChanged = hasChanged(oldList, lock.taskList);
        const achievementsChanged = hasChanged(oldAchievements, expectedAchievements);

        // フィールド単位の修正ではなくまるごと復元する：タスク名を一、二字変えて追加された近似タスクも直接消去される。
        statData.任務.リスト = clonePlainValue(lock.taskList) || {};
        statData.任務.インスタンス実績 = clonePlainValue(expectedAchievements) || {};

        if (listChanged || achievementsChanged) {
            console.warn(
                `[任务生成锁] ⚠️ 同層の追加変数更新によるタスクデータの変更を検出したため、まるごと復元した ` +
                `(message_id=${currentMessageId}, source=${lock.source || '任务美化器'})`
            );
        }
        return true;
    }

    /**
     * 「フローティング玉UI操作」のウィンドウ期間中かどうか。
     * ここでは正当な UI フィールド変更（例：キャラクター進階）の識別にのみ用い、状態/クールダウンのターン重複防止は担わない。
     */
    function isUIMutationActive() {
        try {
            let flagWin = null;
            try { if (typeof GS_PARENT !== 'undefined' && GS_PARENT) flagWin = GS_PARENT; } catch(e){}
            if (!flagWin) { try { if (window.parent && window.parent !== window) flagWin = window.parent; } catch(e){} }
            if (!flagWin) { try { if (window.top && window.top !== window) flagWin = window.top; } catch(e){} }
            if (!flagWin) flagWin = window;
            return !!(flagWin && flagWin.__samsaraUIMutation === true);
        } catch (e) {
            return false;
        }
    }

    /**
     * キャラクター階層"昇格通行証"の検証
     *   "開始進階"ボタンの writeBackMvu 実行時に opts.tierPermit=対象階層(例 'Ⅱ'), を書き込み
     *   win/GS_PARENT/window の __samsaraTierPermit。原因: Mvu.replaceMvuData は非同期であり,
     *   それ自体がもう一度 VARIABLE_UPDATE_ENDED を発火する——そのイベント発生時には __samsaraUIMutation が既にリセットされており,
     *   階層変化が guardProtectedFields により AI の改竄とみなされてロールバックされる → 昇格"一瞬上がって元に戻る"。
     *   通行証は newVal === permit(この一档のみ)のとき階層変化を許可し, 消費後は直ちに無効化する(使い捨て);
     *   複数ウィンドウ(win/GS_PARENT/parent/top/window)のいずれかで一致すれば有効とみなす( isUIMutationActive と同じ方針)。
     *   permit はフローティング玉が書き込み, 20s 後に同スクリプトが保険として消去する, 長期的には残留しない。
     * @param {string} newVal 今回のイベントにおける キャラ.階層 の新しい値
     * @returns {boolean} 許可するかどうか
     */
    function tierPermitAllows(newVal) {
        try {
            const permitWins = [];
            try { if (typeof GS_PARENT !== 'undefined' && GS_PARENT) permitWins.push(GS_PARENT); } catch(e){}
            try { if (window.parent && window.parent !== window) permitWins.push(window.parent); } catch(e){}
            try { if (window.top && window.top !== window) permitWins.push(window.top); } catch(e){}
            permitWins.push(window);
            for (const w of permitWins) {
                const permit = w && w.__samsaraTierPermit;
                if (permit && newVal === permit) {
                    // 使い捨て消費: 許可した直後に無効化し, AI がたまたま同じ値へ変更した場合まで免除されないようにする
                    try { w.__samsaraTierPermit = null; } catch(e2) {}
                    return true;
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * データガード：AI に改竄された読み取り専用フィールドのロールバック + 新規追加装備の正規化
     * キャラクターおよび関係リストの、登場中の全NPCを対象とする
     * @param {object} statData 今回の更新後の stat_data
     * @param {object} statDataBefore 前フレームの stat_data
     */
    function guardProtectedFields(statData, statDataBefore) {
        if (!statDataBefore) return;

        // —— 1. 保護対象パスの定義（キャラクターオブジェクトからの相対） ——
        // これらのフィールドは schema で readonly: true と指定されている
        const PROTECTED_RELATIVE_PATHS = [
            'HP_MAX',
            'EP_MAX',
            '最終属性',   // 属性オブジェクト全体はバックエンドが全量計算するため、AI による変更は禁止
        ];
        // キャラクター専用の保護パス: 階層は 進階フロー(フローティング玉の"開始進階"ボタン→writeBackMvu) によってのみ変更可能であり,
        //   ★ 制限はキャラクターのみ; NPC の階層はシナリオ進行に応じた自由な変動(例：敵役の突破/成長)を許可し, ガードしない
        const REINCARNATOR_ONLY_PROTECTED_PATHS = [
            '階層',
        ];

        // —— 2. 汎用ロールバック関数：キャラクターオブジェクトの読み取り専用フィールドを比較してロールバックする ——
        //   extraPaths: 追加の保護パス(例：キャラクター専用の"階層"), 呼び出し側が指定した場合のみ有効
        function rollbackProtectedFields(char, charBefore, label, extraPaths) {
            if (!char || typeof char !== 'object') return;
            if (!charBefore || typeof charBefore !== 'object') return;

            for (const path of [...PROTECTED_RELATIVE_PATHS, ...(extraPaths || [])]) {
                const oldVal = getByPath(charBefore, path);
                const newVal = getByPath(char, path);
                if (oldVal !== undefined && hasChanged(oldVal, newVal)) {
                    console.warn(
                        `[変数ガード] ⚠️ ${label} の読み取り専用フィールドが外部から変更された: ${path} ` +
                        `(${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)})としてロールバック済み`
                    );
                    setByPath(char, path, oldVal);
                }
            }
        }

        // —— 3. キャラクターのロールバック ——
        const user = statData?.キャラ;
        const userBefore = statDataBefore?.キャラ;
        if (user && userBefore) {
            // キャラクターは"階層"を追加保護: 進階フローのみ変更可能で, AI の改竄は一律ロールバック
            //   ★ UI 操作ウィンドウ期(フローティング玉の"開始進階"ボタン→writeBackMvu のイベントブロードキャスト)は階層変化を許可し,
            //     そうでなければ正当な進階がガードにロールバックされてしまう
            //   ★ 昇格通行証: replaceMvuData が非同期で発火する二度目の VARIABLE_UPDATE_ENDED は
            //     __samsaraUIMutation のウィンドウ期内ではない(フラグはリセット済み)ため, __samsaraTierPermit
            //     (=対象階層, "開始進階"ボタンが書き込み, 20s で保険失効)により許可し, "一瞬上がって戻る"不具合を解消する
            const extraReincarnatorPaths = isUIMutationActive()
                ? []
                : (tierPermitAllows(user.階層) ? [] : REINCARNATOR_ONLY_PROTECTED_PATHS);
            rollbackProtectedFields(user, userBefore, 'キャラ', extraReincarnatorPaths);
        }

        // —— 4. 関係リストの登場中 NPC をすべてロールバック ——
        const rel = statData?.関係リスト;
        const relBefore = statDataBefore?.関係リスト;
        if (rel && typeof rel === 'object' && relBefore && typeof relBefore === 'object') {
            for (const [name, npc] of Object.entries(rel)) {
                if (!npc || typeof npc !== 'object') continue;

                const npcBefore = relBefore[name];
                if (!npcBefore || typeof npcBefore !== 'object') continue;

                rollbackProtectedFields(npc, npcBefore, `NPC:${name}`);
            }
        }

         // —— 5. 新規装備ガード（キャラクター装備。既存ロジックは変更なし） ——
        // 「新規追加された装備」のみを処理し、既存の装備には触れない
        const oldEquip = statDataBefore?.キャラ?.装備 || {};
        const newEquip = statData?.キャラ?.装備 || {};
        for (const [equipKey, equipVal] of Object.entries(newEquip)) {
            if (!equipVal || typeof equipVal !== 'object') continue;
            const isNewEquip = oldEquip[equipKey] === undefined;
            if (!isNewEquip) continue;

            // 状態の正規化：0|1 のみ許可し、それ以外は一律 0（未装着）に補正する
            if (equipVal.状態 !== 0 && equipVal.状態 !== 1) {
                console.warn(
                    `[変数ガード] ⚠️ 新規装備 "${equipKey}" の状態が不正(${JSON.stringify(equipVal.状態)})のため 0(未装着)に補正`
                );
                equipVal.状態 = 0;
            }

            // 型チェック：0-9 の整数であるべき。不正でも警告のみ（装備計算段階での処理に委ねる）
            const typeVal = equipVal.タイプ;
            const isValidType = Number.isInteger(typeVal) && typeVal >= 0 && typeVal <= 9;
            if (!isValidType) {
                console.warn(
                    `[変数ガード] ⚠️ 新規装備 "${equipKey}" の型が不正(${JSON.stringify(typeVal)})。` +
                    ` 0-9 の整数であるべきだが、装備計算段階での処理に委ねる`
                );
            }
        }
    }

    // ===== 属性の全量再計算（属性パネルは読み取り専用の集計で、バックエンドが各ソースの加値を集計する）=====
    // 設計モデル（ユーザー確認済み）：
    //   1. 属性パネル = 読み取り専用の集計。AI は血統/装備/スキル/状態/形態のみを操作し、バックエンドが加値を 属性 へ集計する
    //   2. 五維：血統 + (発動形態) + 装着中の装備五維 + 状態五維
    //      - 形態の発動時は形態五維の真属性を血統へ直接加算する（血統を置き換える二択は行わない）
    //      - 未装着(状態!==1)の装備は参加しない
    //   3. 派生属性：計算式 + 加値の重ね合わせ（ATK=(力+敏)/2 + 装備ATK + 形態ATK ...）
    //   4. 判定：先攻DC/防御DC のみ；基礎値 + 装備加値（形態には判定フィールドがない）
    //   5. 階層(位格)：読み取り専用で、修正値の上限としてのみ機能し、決して書き戻さない
    //   6. HP/EP：最上位フィールドへ書き込む（属性オブジェクトは全量読み取り専用であり、その内部に HP/EP を書くとガードと衝突するため避ける）
    //   注：状态.效果、形态.效果 は文字列であり、第三段階の文字列パーサーで一括処理する

    const ATTR_NAMES = ['筋力', '敏捷', '体力', '精神', '魅力'];
    const DERIVED_ATTRS = ['ATK', 'DEF', 'MATK', 'MDEF', 'AP'];
    const CHECK_ATTRS = ['先制DC', '防御DC'];
    // 装備/形態が提供しうる加値キー（汎用の累加に使用）
    const BONUS_KEYS = [...DERIVED_ATTRS, ...CHECK_ATTRS];
    // 位格 → 属性修正値の上限
    const TIER_MODIFIER_CAPS = {
        'F': 12, 'E': 30, 'D': 60, 'C': 90, 'B': 120,
        'A': 150, 'S': 180, 'SS': 230, 'SSS': 270
    };
    // 品質階位の序列（低 → 高）
    const TIER_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    // 五維キー定数（ZOD の attr5_keys と揃える）
    const attr5_keys_const = ['筋力', '敏捷', '体力', '精神', '魅力'];
    // 生命階層（大階層）の序列と、単一属性ボーナス区間の上下限
    //   ★ 大階層は【最終的な単一累加値の打ち切り上限】にのみ用い、品質→数値の変換には関与しない
    const LIFE_TIER_ORDER = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ'];
    // ★ ローマ数字(大階層) ↔ 品質字母 の双方向マッピング（両序列は各 9 段階が一対一で対応）
    //   Ⅰ↔F Ⅱ↔E Ⅲ↔D Ⅳ↔C Ⅴ↔B Ⅵ↔A Ⅶ↔S Ⅷ↔SS Ⅸ↔SSS
    //   AI が品質字母を誤ってローマ数字で渡すことがある（例 力量:Ⅲ）ため、実行時に補正するために用いる
    const ROMAN_TO_QUALITY = Object.assign({}, ...LIFE_TIER_ORDER.map((r, i) => ({ [r]: TIER_ORDER[i] })));
    const QUALITY_TIER_SET = Object.assign({}, ...TIER_ORDER.map(q => ({ [q]: 1 })));
    const LIFE_TIER_RANGE = {
        'Ⅰ': [1, 29],     'Ⅱ': [30, 99],     'Ⅲ': [100, 299],
        'Ⅳ': [300, 999],  'Ⅴ': [1000, 2999], 'Ⅵ': [3000, 9999],
        'Ⅶ': [10000, 29999], 'Ⅷ': [30000, 99999], 'Ⅸ': [100000, Infinity]
    };
    // ——— 品質字母の判定（ZOD の E_quality と揃える） ———
    //   ★ AI が誤って渡したローマ数字にも対応：'Ⅲ' などは品質字母とみなす（後続の normalizeTier が 'D' へ補正する）
    const QUALITY_STRING_SET = { 'F':1, 'E':1, 'D':1, 'C':1, 'B':1, 'A':1, 'S':1, 'SS':1, 'SSS':1 };
    function isQualityString(v) {
        if (typeof v !== 'string') return false;
        const s = v.trim();
        if (Object.prototype.hasOwnProperty.call(QUALITY_STRING_SET, s.toUpperCase())) return true;
        return Object.prototype.hasOwnProperty.call(ROMAN_TO_QUALITY, s);
    }
    /**
     * 【血統/形態/成長状態 の基礎属性ボーナス段階】（実体の品質で主区間を固定）
     *   key = 実体の品質 ; value = [下限, 上限]
     *   D 級の血統: 力量の原始属性がどの品質でも → D 段階 120-180 内を 9 等分した区間から取得
     */
    const GROW_QUALITY_RANGE = {
        'F':   [1, 20],
        'E':   [5, 60],
        'D':   [12, 180],
        'C':   [36, 600],
        'B':   [120, 1800],
        'A':   [360, 6000],
        'S':   [1200, 18000],
        'SS':  [3600, 60000],
        'SSS': [12000, 299999]
    };
    /**
     * 【装備と形態の基礎数値表】（派生項目の種類ごとに列を分ける）
     *   列: ATK/MATK | DEF/MDEF | AP(ポイント) | 単一属性ボーナス(五維)
     *   key = 列名 ; value = { 品質: [下限, 上限] }
     */
    const EQUIP_QUALITY_RANGE = {
        'ATK':  { 'F':[3,15], 'E':[10,40], 'D':[25,100], 'C':[70,250], 'B':[180,600], 'A':[450,1400], 'S':[1000,3000], 'SS':[2200,6500], 'SSS':[5000,20000] },
        'MATK': { 'F':[3,15], 'E':[10,40], 'D':[25,100], 'C':[70,250], 'B':[180,600], 'A':[450,1400], 'S':[1000,3000], 'SS':[2200,6500], 'SSS':[5000,20000] },
        'DEF':  { 'F':[1,9],  'E':[5,25],  'D':[15,55],  'C':[40,130], 'B':[100,300], 'A':[250,700],  'S':[550,1500],  'SS':[1200,3300], 'SSS':[2600,7000] },
        'MDEF': { 'F':[1,9],  'E':[5,25],  'D':[15,55],  'C':[40,130], 'B':[100,300], 'A':[250,700],  'S':[550,1500],  'SS':[1200,3300], 'SSS':[2600,7000] },
        'AP':   { 'F':[1,15], 'E':[10,30], 'D':[20,45],  'C':[35,65],  'B':[55,90],   'A':[80,120],   'S':[110,150],   'SS':[140,180],   'SSS':[170,220] },
        // 装備の単一属性ボーナス(五維)列
        '五维': { 'F':[1,9],  'E':[4,18],  'D':[10,45],  'C':[30,110], 'B':[80,260],  'A':[200,600],  'S':[450,1300],  'SS':[1000,2800], 'SSS':[2200,6000] }
    };
    /**
     * 中核：単一項目の品質字母 → 数値
     *   規則：実体品質 Q が主区間 [lo, hi] を固定し、単一項目の品質 q が 9 等分中のどの段かを決める；
     *         段幅 w=floor((hi-lo)/9)；段の開始 base=lo + rank(q)*w；値 = base + random(1..w)
     * @param {string} attrTier 単一項目の品質（段位の選択）：'F'~'SSS'
     * @param {[number,number]} range [下限,上限] 主区間
     * @returns {number}
     */
    function qualitySegValue(attrTier, range) {
        const lo = safeNum(range && range[0], 0);
        const hi = safeNum(range && range[1], lo);
        const span = Math.max(1, hi - lo);
        const w = Math.max(1, Math.floor(span / 9));
        const segBase = lo + tierRank(attrTier) * w;        // 段の開始点
        return segBase + Math.floor(Math.random() * w) + 1; // 段内でランダム [1, w]
    }
    /**
     * 品質字母 → その項目が収まるべき"段位区間" [下限, 上限]
     *   qualitySegValue と同じ式から逆算する：segBase + [1, w]
     *   before から独立した"区間検証"に用いる：旧真属性がこの区間内なら → 品質は未変更 → 保持；
     *   区間外の場合(単一項目の品質字母が変化 / 実体全体の品質が変化) → 品質変化 → 再ランダム。
     *   区間データがない場合(派生の取りこぼし)は [Infinity, -Infinity] を返し、常に再計算させる。
     */
    function attrSegRange(attrKey, attrTier, itemTier, kind) {
        const q = normalizeTier(attrTier);
        const it = normalizeTier(itemTier);
        let range;
        if (kind === 'status') {
            range = attr5_keys_const.includes(attrKey)
                ? GROW_QUALITY_RANGE[it]
                : (EQUIP_QUALITY_RANGE[attrKey] && EQUIP_QUALITY_RANGE[attrKey][it]);
        } else if (kind === 'blood' || kind === 'form') {
            if (attr5_keys_const.includes(attrKey)) {
                range = GROW_QUALITY_RANGE[it];
            } else {
                range = EQUIP_QUALITY_RANGE[attrKey] && EQUIP_QUALITY_RANGE[attrKey][it];
            }
        } else { // equip
            const col = attr5_keys_const.includes(attrKey) ? '五维' : attrKey;
            range = EQUIP_QUALITY_RANGE[col] && EQUIP_QUALITY_RANGE[col][it];
        }
        if (!range) return [Infinity, -Infinity];
        const lo = safeNum(range && range[0], 0);
        const hi = safeNum(range && range[1], lo);
        const span = Math.max(1, hi - lo);
        const w = Math.max(1, Math.floor(span / 9));
        const segBase = lo + tierRank(q) * w;
        return [segBase + 1, segBase + w];
    }
    /**
     * 品質字母 → 数値（実体タイプ/列ごとに振り分け）
     * @param {string} attrKey 属性キー（力量/ATK/...）
     * @param {string} attrTier その項目の品質字母
     * @param {string} itemTier 実体全体の品質（主区間を固定）
     * @param {'blood'|'equip'|'form'|'status'} kind ソースの種類
     * @returns {number}
     */
    function qualityToValue(attrKey, attrTier, itemTier, kind) {
        const q = normalizeTier(attrTier);
        const it = normalizeTier(itemTier);
        const grow = () => qualitySegValue(q, GROW_QUALITY_RANGE[it]);
        const equipCol = (col) => {
            const r = EQUIP_QUALITY_RANGE[col] && EQUIP_QUALITY_RANGE[col][it];
            return r ? qualitySegValue(q, r) : 0;
        };
        if (kind === 'status') {
            if (attr5_keys_const.includes(attrKey)) return grow();
            return equipCol(attrKey);
        }
        if (kind === 'blood' || kind === 'form') {
            if (attr5_keys_const.includes(attrKey)) return grow();
            return equipCol(attrKey);
        }
        // equip：五維は"単一属性ボーナス"列、派生項目は対応する列を使う
        if (attr5_keys_const.includes(attrKey)) return equipCol('五维');
        return equipCol(attrKey);
    }
    /**
     * 実体の"真属性" を解析する：原始属性(品質字母/数値) を 数値 へ変換する
     *   - キャッシュ/スナップショット/before の比較は一切使わず、"段位区間の検証"で品質変化を独立に判定する
     *   - 品質が未変更(旧真属性が現在の品質から算出した段位 [segBase+1, segBase+w] 内) → 旧乱数を再利用し、再ランダムしない
     *   - 品質変化(単一項目の字母が変化 / 実体全体の品質が変化 → 旧区間の外へ出る) → 再ランダム
     *   - 状態：基礎/派生属性はいずれも字母→数値に対応し、数値はそのまま保持する
     * @param {object} item 実体（血統/装備/状態/形態）
     * @param {'blood'|'equip'|'form'|'status'} kind 来源类型
     * @param {object} [itemBefore] 前フレームの実体（実体品質の変化を検出）
     * @param {string} [effectiveTier] 有効なキャラクター階層に対応する品質；形態以外のソースの五維主区間のみを制限する
     * @param {string} [effectiveTierBefore] 前フレームの有効キャラクター階層に対応する品質
     * @returns {object} 真属性オブジェクト（数値）
     */
    function resolveRealAttr(item, kind, itemBefore, effectiveTier, effectiveTierBefore) {
        if (!item || typeof item !== 'object') return {};
        const raw = item.原始属性;
        if (!raw || typeof raw !== 'object') return item.真属性 || {};
        if (!item.真属性 || typeof item.真属性 !== 'object') item.真属性 = {};
        const real = item.真属性;
        // 形態のフィールドは"品質"から"階層"(Ⅰ~Ⅸ)へ変更済み; normalizeTier がローマ数字を品質字母へ自動補正する; 旧セーブの 品質 フィールドにも対応
        const it = normalizeTier(item.階層 != null ? item.階層 : item.品質);
        const capFiveTier = (itemTier, capTier) => {
            if (kind === 'form' || capTier == null) return itemTier;
            return TIER_ORDER[Math.min(tierRank(itemTier), tierRank(capTier))];
        };
        const fiveTier = capFiveTier(it, effectiveTier);
        // ★ Bug 修正: 実体全体の階層が変化(Ⅰ→Ⅱ…)した場合は、すべての品質型属性を強制再計算し, "区間検証"の偶然に頼らない
        //   原因: 区間検証(seg range)は item.階層 の変更で全体がずれるため, 旧真属性がたまたま新しい区間内に収まることがある
        //         → inSeg に命中 → 再計算されない → 真属性が旧階層の段位に留まる; よってここで itemBefore の階層変化を明示的に比較する。
        let tierChanged = false;
        let fiveTierChanged = false;
        if (itemBefore && typeof itemBefore === 'object') {
            const beforeTierRaw = itemBefore.階層 != null ? itemBefore.階層 : itemBefore.品質;
            const beforeIt = normalizeTier(beforeTierRaw);
            if (beforeIt !== it) tierChanged = true;
            const beforeFiveTier = capFiveTier(beforeIt, effectiveTierBefore != null ? effectiveTierBefore : effectiveTier);
            if (beforeFiveTier !== fiveTier) fiveTierChanged = true;
        }
        for (const k of Object.keys(raw)) {
            const v = raw[k];
            const isQ = isQualityString(v);
            // 状態 / 装備 / 血統 / 形態：品質字母→数値；数値→そのまま
            //   ★ 区間検証は before から独立しており、旧真属性が現在の段位区間内なら → 保持；そうでなければ再ランダム
            const tier = isQ ? normalizeTier(v) : null;
            if (isQ) {
                // 血統/装備/状態の五維主区間は有効なキャラクター階層より高くできない；
                // 形態の五維およびすべての派生属性は、コンポーネント自身の品質/階層を引き続き使用する。
                const itemTier = attr5_keys_const.includes(k) && kind !== 'form' ? fiveTier : it;
                //   区間検証( beforeから独立): 旧真属性が現在の品質から算出した段位区間
                //   [segBase+1, segBase+w] 内 → 品質は未変更 → 旧乱数を保持(装備の着脱で値が跳ねない);
                //   区間外の場合(単一項目の品質字母が変化 / 実体全体の品質が変化) → 品質変化 → 再ランダム。
                //   before で比較しない理由: writeBackMvu の before は現在のメモリ cloneに由来し,
                //   ユーザーによる品質の変更を既に含む → beforeTier === tier が常に真 → 機能しない。
                //   ★ ただし"全体階層の変化"(tierChanged) は writeBackMvu の経路でも 血統/装備/状態 に対して検出可能
                //     (階層フィールドは読み取り専用の保護対象で, clone の before はユーザー編集前の階層を保持する)ため, tierChanged を明示的に判定した
                //     場合は強制再計算とし, 区間検証が見落とす可能性のあるケースを補う。
                const old = real[k];
                const [segLo, segHi] = attrSegRange(k, tier, itemTier, kind);
                const inSeg = typeof old === 'number' && isFinite(old) && old >= segLo && old <= segHi;
                const effectiveTierChanged = attr5_keys_const.includes(k) && kind !== 'form' && fiveTierChanged;
                if (!inSeg || tierChanged || effectiveTierChanged) {
                    real[k] = qualityToValue(k, tier, itemTier, kind);
                }
                // inSeg かつ !tierChanged の場合は real[k]（旧乱数）を保持し、再ランダムしない
            } else {
                real[k] = safeNum(v, 0);
            }
        }
        // 原始属性から削除されたキーを整理する
        for (const k of Object.keys(real)) {
            if (raw[k] === undefined) delete real[k];
        }
        return real;
    }
    /** 安全な数値取得 */
    function safeNum(v, def = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    /** 品質文字列を F~SSS に正規化する；ローマ数字は対応する品質字母へ補正する；不正値は F にフォールバック */
    function normalizeTier(q) {
        const s = String(q || '').trim();
        const up = s.toUpperCase();
        if (TIER_ORDER.includes(up)) return up;
        if (ROMAN_TO_QUALITY[s]) return ROMAN_TO_QUALITY[s]; // AI が誤って Ⅲ を渡した場合 → D
        return 'F';
    }

    /** 生命階層(大階層)の文字列を Ⅰ~Ⅸ に正規化する；不正値は Ⅰ にフォールバック */
    function normalizeLifeTier(t) {
        const s = String(t || '').trim();
        return LIFE_TIER_ORDER.includes(s) ? s : 'Ⅰ';
    }

    /** 品質の序列（高いほど大きい） */
    function tierRank(q) {
        const i = TIER_ORDER.indexOf(normalizeTier(q));
        return i >= 0 ? i : 0;
    }

    /**
     * 原住民NPCの位格/血統品質の抑制
     *   発動条件 (すべて満たす場合のみ抑制):
     *     1. 新規登場の NPC: 前フレームの 関係リスト に同名が存在しない (シナリオ上妥当な成長を繰り返し上書きしないため)
     *     2. 主神空間内ではない (システム状態.主神空間滞在中 !== true)
     *     3. 身分に キャラ/穿越者/守护者/织梦者/篡夺者/残魂 を含まない (特殊身分には別ルートを残す)
     *   抑制ルール:
     *     - NPC.階層 (Ⅰ~Ⅸ) が 世界.位格 を超える → 世界.位格 へ押し戻す
     *     - 各 血統[name].层级 または .品質 が 世界.位格 に対応する品質字母を超える → capQuality へ押し戻す
     *   マッピング: Ⅰ↔F Ⅱ↔E Ⅲ↔D Ⅳ↔C Ⅴ↔B Ⅵ↔A Ⅶ↔S Ⅷ↔SS Ⅸ↔SSS ( ROMAN_TO_QUALITY / TIER_ORDER) を再利用
     */
    const NATIVE_SPECIAL_IDENTITY_SET = {
        '輪廻者': 1, '轮回者': 1, '穿越者': 1, '守护者': 1, '织梦者': 1, '篡夺者': 1, '残魂': 1
    };
    function clampNativeNpcToWorldTier(statData, statDataBefore) {
        if (!statData) return;
        const rel = statData.関係リスト;
        if (!rel || typeof rel !== 'object') return;
        const relBefore = statDataBefore && statDataBefore.関係リスト;
        const inMainSpace = !!(statData.システム状態 && statData.システム状態.主神空間滞在中 === true);
        if (inMainSpace) return;
        const worldTier = statData.世界 && statData.世界.位格;
        if (!worldTier) return;
        const capLifeIdx = LIFE_TIER_ORDER.indexOf(normalizeLifeTier(worldTier));
        if (capLifeIdx < 0) return;
        const capQuality = TIER_ORDER[capLifeIdx];
        const capQualityRank = TIER_ORDER.indexOf(capQuality);
        const overCapQ = q => tierRank(q) > capQualityRank;
        const overCapLife = r => (LIFE_TIER_ORDER.indexOf(normalizeLifeTier(r)) > capLifeIdx);

        for (const [name, npc] of Object.entries(rel)) {
            if (!npc || typeof npc !== 'object') continue;
            if (relBefore && typeof relBefore === 'object' && relBefore[name]) continue;
            const identList = npc.身分;
            let isSpecial = false;
            if (Array.isArray(identList)) {
                for (const it of identList) {
                    if (typeof it === 'string' && NATIVE_SPECIAL_IDENTITY_SET[it.trim()]) { isSpecial = true; break; }
                }
            } else if (typeof identList === 'string') {
                if (NATIVE_SPECIAL_IDENTITY_SET[identList.trim()]) isSpecial = true;
            }
            if (isSpecial) continue;

            if (npc.階層 && overCapLife(npc.階層)) {
                console.warn(`[位格抑制] 新規登場NPC "${name}" の階層 ${npc.階層} が世界位格 ${worldTier}を超えたため, ${worldTier}へ押し戻した`);
                npc.階層 = worldTier;
            }
            const bloodDict = npc.血統;
            if (bloodDict && typeof bloodDict === 'object') {
                for (const [bname, b] of Object.entries(bloodDict)) {
                    if (!b || typeof b !== 'object') continue;
                    if (b.階層 && isQualityString(b.階層) === false && overCapLife(b.階層)) {
                        console.warn(`[位格抑制] NPC "${name}" の血統[${bname}] 階層 ${b.階層} が ${worldTier}を超えたため, ${worldTier}へ押し戻した`);
                        b.階層 = worldTier;
                        delete b.品質;
                    } else if (b.品質 && isQualityString(b.品質) && overCapQ(b.品質)) {
                        console.warn(`[位格抑制] NPC "${name}" の血統[${bname}] 品質 ${b.品質} が ${capQuality}を超えたため, ${capQuality}へ押し戻した`);
                        b.品質 = capQuality;
                    }
                }
            }
        }
    }

    // 更新前スナップショットが存在する場合のみ新規キャラクターを識別する；旧セーブの読み込みでは遡って強化しない。
    // 血統、スキル、状態、形態の元の難易度強化は保持する；装備とその付帯内容は一切書き換えず、戦利品が難易度ボーナスを継承しないようにする。
    function applyNewNpcDifficulty(statData, statDataBefore) {
        if (!statDataBefore) return;
        const mode = statData.設定?.難易度 || '体験';
        if (!['体験', '正常', '困難', '挑戦'].includes(mode)) return;
        const before = statDataBefore.関係リスト || {};
        const steps = { '体験': 0, '正常': 2, '困難': 4, '挑戦': 6 }[mode];
        const boostedAttrs = [...ATTR_NAMES, ...DERIVED_ATTRS];
        for (const [name, npc] of Object.entries(statData.関係リスト || {})) {
            if (!npc || typeof npc !== 'object' || Object.hasOwn(before, name)) continue;
            if (npc.仲間 === true || !(Number(npc.好感度) < 0)) continue;
            const life = LIFE_TIER_ORDER.indexOf(normalizeLifeTier(npc.階層));
            const baseRank = life >= 0 ? life : 0;
            if (!npc.状態 || typeof npc.状態 !== 'object') npc.状態 = {};
            if (steps > 0) {
                // 追加強化は難易度処理済みのマーカーも兼ね、同一の新規敵が書き戻しのたびに連続で昇格しないようにする。
                if (npc.状態.额外强化) continue;
                const extraRule = {
                    正常: { qualityOffset: 0, attrTier: 'E', attrs: DERIVED_ATTRS },
                    困難: { qualityOffset: 0, attrTier: 'C', attrs: boostedAttrs },
                    挑戦: { qualityOffset: 1, attrTier: 'B', attrs: boostedAttrs }
                }[mode];
                npc.状態.额外强化 = {
                    タイプ: 'バフ',
                    品質: TIER_ORDER[Math.min(8, baseRank + extraRule.qualityOffset)],
                    持続: '持続',
                    出典: '難易度メカニクス',
                    原始属性: Object.fromEntries(extraRule.attrs.map(attr => [attr, extraRule.attrTier])),
                    効果: '全属性強化'
                };
            }
            function upgrade(item, kind) {
                if (!item || typeof item !== 'object') return;
                const aboveLife = (mode === '困難' || mode === '挑戦') && ['状態', '形態庫'].includes(kind)
                    || mode === '挑戦' && kind === '血統';
                const floor = Math.min(8, baseRank + (aboveLife ? 1 : 0));
                const rank = Math.max(floor, tierRank(item.階層 ?? item.品質));
                if (kind === '形態庫' || item.階層 != null) item.階層 = LIFE_TIER_ORDER[rank];
                else item.品質 = TIER_ORDER[rank];
                const raw = item.原始属性;
                if (raw && typeof raw === 'object') {
                    const constitutionFloor = mode === '挑戦' ? 'SSS' : mode === '困難' ? 'S' : null;
                    const fixedConstitution = constitutionFloor && (kind === '血統' || kind === '形態庫' || Object.hasOwn(raw, '体力'));
                    const originalConstitution = raw.体力;
                    for (const key of Object.keys(raw)) {
                        if (key === '体力' && fixedConstitution) continue;
                        // 数値型の一時的な加減値および 0 は品質階位ではないため、その意味を保つ。
                        if (isQualityString(raw[key])) raw[key] = TIER_ORDER[Math.min(8, tierRank(raw[key]) + steps)];
                    }
                    // 固定した体質の段階は下限を補うのみで、元から基準より高い体質は降格しない。
                    if (fixedConstitution) raw.体力 = TIER_ORDER[Math.max(tierRank(constitutionFloor), isQualityString(originalConstitution) ? tierRank(originalConstitution) : 0)];
                    item.真属性 = {};
                }
                for (const skill of Object.values(item.技能 || {})) upgrade(skill, '技能');
            }
            // 装備は意図的に難易度強化のフローに入れない；品質、原始属性、付帯スキルはいずれも生成時の値を保持する。
            for (const kind of ['血統', '技能', '状態', '形態庫']) {
                for (const item of Object.values(npc[kind] || {})) {
                    // 追加強化は難易度専用の固定値を使用し、汎用の +2/+4/+6 強化には入らない。
                    if (kind === '状態' && item === npc.状態.额外强化) continue;
                    upgrade(item, kind);
                }
            }
        }
    }

    /** 新版 calcModifier：属性値 → 修正値カーブ */
    function calcModifier(attrVal) {
        const x = safeNum(attrVal, 0);
        if (x <= 0) return 0;

        // ブレークポイント配列: [属性値, 修正値]
        const points = [
            [0, 0],
            [20, 12],
            [60, 30],
            [180, 60],
            [600, 90],
            [1800, 120],
            [6000, 150],
            [18000, 180],
            [60000, 230],
            [180000, 270]
        ];

        // 180000を超えた場合は引き続き緩やかに増加する（対数減衰で、上限は設けず、30万で286になる）
        if (x >= 180000) {
            const extra = Math.floor(Math.log10((x - 180000) / 10000 + 1) * 15);
            return Math.min(350, 270 + extra);
        }

        // 区分的な線形補間
        for (let i = 0; i < points.length - 1; i++) {
            const [x1, y1] = points[i];
            const [x2, y2] = points[i + 1];
            if (x >= x1 && x < x2) {
                const slope = (y2 - y1) / (x2 - x1);
                return Math.floor(y1 + slope * (x - x1));
            }
        }

        return points[points.length - 1][1];
    }

    /**
     * 現在の形態が発動中かどうかを判定する（発動中なら形態の真属性を血統へ加算する）
     * 状態フィールドは AI の叙事記録にすぎず、発動可否は 悬浮球状态栏.js が決定するため、ここでは検査しない
     * @returns {object|null} 発動中の形態ライブラリ項目；未発動なら null
     */
    function getActiveForm(char) {
        const cur = char.現在形態;
        if (!cur || typeof cur !== 'object') return null;
        if (cur.激活 !== true) return null;
        const name = cur.名称;
        if (!name) return null;
        const entry = char.形態庫 && char.形態庫[name];
        if (!entry || typeof entry !== 'object') return null;
        return entry;
    }

    /** 有効キャラクター階層 = キャラクター自身の階層と現在発動中の形態階層のうち高い方。 */
    function getEffectiveLifeTier(char, activeForm) {
        const charTier = normalizeLifeTier(char && char.階層);
        const formTierRaw = activeForm && (activeForm.階層 != null ? activeForm.階層 : activeForm.品質);
        const formTier = formTierRaw != null ? normalizeLifeTier(formTierRaw) : null;
        if (formTier && LIFE_TIER_ORDER.indexOf(formTier) > LIFE_TIER_ORDER.indexOf(charTier)) return formTier;
        return charTier;
    }

    /**
     * NPC 集団単位の THP/数量 同期
     * ルール（NPCのみ）:
     *   - 新規実体 / 前フレームなし：常に [数量] を信頼し、THP = HP_MAX*(数量-1) を強制する
     *     （AI は誤った HP で THP を事前入力することが多く、クライアント側で必ず上書きする）
     *   - 既存実体で THP が前フレームより減少：THP から人数を逆算する
     *   - 増援（数量が増加）：新しい編成に合わせて THP を満タンにする
     *   - 個々のメンバーの属性/HP_MAX は人数を掛けない；THP は「残りのメンバー」の生命プールを表す
     * @param {object} char 現在の NPC
     * @param {object|null} charBefore 前フレームの NPC（未指定可）
     * @param {string} label ログ識別子
     */
    function syncNpcGroupThp(char, charBefore, label) {
        if (!char || typeof char !== 'object') return;
        // 関係リストの NPC のみを処理する；キャラクターには「数量」の集団的な意味がない
        if (!label || String(label).indexOf('NPC:') !== 0) return;
        // 数量 フィールドのない旧データは単体として扱う
        if (char.数量 === undefined || char.数量 === null) return;

        const maxHp = Math.max(1, safeNum(char.HP_MAX, 1));
        let qty = Math.max(1, Math.floor(safeNum(char.数量, 1)));
        let thp = Math.max(0, Math.floor(safeNum(char.THP, 0)));
        const isNew = !(charBefore && typeof charBefore === 'object');
        const thpBefore = isNew ? 0 : Math.max(0, safeNum(charBefore.THP, 0));
        const qtyBefore = (!isNew && charBefore.数量 != null)
            ? Math.max(1, Math.floor(safeNum(charBefore.数量, 1)))
            : qty;
        const fullPool = function(n) { return maxHp * (Math.max(1, n) - 1); };

        // 単体（数量<=1）：THP は通常のシールドにすぎず、集団編成には関与しない
        if (qty <= 1) {
            if (char.数量 !== 1 && char.数量 !== undefined) char.数量 = 1;
            return;
        }

        // 1) 新規集団：数量 に従って THP を強制的に満タンにし、AI が事前入力した誤った THP は無視する
        //    例：AI が HP=30,THP=60,数量=3 と書いても、実際の HP_MAX=80 → THP=160,数量=3 とすべき
        if (isNew) {
            const pool = fullPool(qty);
            // if (thp !== pool) {
            //     console.log(
            //         `[集団単位] ${label}: 新規プール充填 THP ${thp} → ${pool} ` +
            //         `(数量=${qty}, HP_MAX=${maxHp})`
            //     );
            // } else {
            //     console.log(
            //         `[集団単位] ${label}: 新規プール充填 THP=${pool} ` +
            //         `(数量=${qty}, HP_MAX=${maxHp})`
            //     );
            // }
            char.THP = pool;
            char.数量 = qty;
            return;
        }

        // 2) 増援：AI が明示的に 数量 を増やした → 新しい編成で集団 THP プールを満タンにする
        if (qty > qtyBefore) {
            const need = fullPool(qty);
            if (thp < need) {
                // console.log(
                //     `[集団単位] ${label}: 編成増援 数量 ${qtyBefore} → ${qty}, THP ${thp} → ${need}`
                // );
                char.THP = need;
            }
            char.数量 = qty;
            return;
        }

        // 3) 離脱/ゼロ化後の再充填：数量>1 かつ現在と前フレームの THP がともに 0
        if (thp === 0 && thpBefore === 0) {
            const pool = fullPool(qty);
            char.THP = pool;
            char.数量 = qty;
            // console.log(
            //     `[集団単位] ${label}: 集団THP再充填=${pool} ` +
            //     `(数量=${qty}, HP_MAX=${maxHp})`
            // );
            return;
        }

        // [無効化済み] THP の被ダメージ→数量減少ロジック: 数量は AI が管理し, バックエンドでは逆算しない
        // THP が未変化、またはその他の場合: 現状維持とし, 数量 を書き換えない
    }

    /**
     * 単一キャラクター（キャラクターまたはNPC）の属性パネル一式を再計算する
     * @param {object} char キャラクターオブジェクト（角色 または 関係リスト[某NPC]）
     * @param {string} label ログ識別子
     * @param {object|null} [charBefore] 前フレームのキャラクターオブジェクト（NPC 集団同期用）
     */
    function recalcCharacter(char, label, charBefore) {
        if (!char || typeof char !== 'object') return;
        // ★ バックエンドガード: 現在の形態が未発動のとき, 名称を自動で空にする(残留した不正データにより getActiveForm が誤判定するのを防ぐ)
        try {
            const cur = char.現在形態;
            if (cur && typeof cur === 'object' && cur.激活 !== true && cur.名称) {
                cur.名称 = '';
                // if (label) console.log(`[属性再計算] ${label}: 現在の形態が未発動のため, 残留した名称を空にした`);
            }
        } catch (e) {}

        if (!char.最終属性) char.最終属性 = {};
        const attr = char.最終属性;
        const 血統 = char.血統 || {};
        const 装備 = char.装備 || {};
        const 状態 = char.状態 || {};
        // 前フレームの対応するサブコレクション（resolveRealAttr が品質変化を判定するため。未変更なら旧乱数を再利用する）
        const 血统Before = (charBefore && charBefore.血統) || {};
        const 装备Before = (charBefore && charBefore.装備) || {};
        const 状态Before = (charBefore && charBefore.状態) || {};

        // —— 0. 形態の発動判定（発動後は形態の真属性を血統へ加算する）——
        const activeForm = getActiveForm(char);
        const formActive = activeForm !== null;
        const activeFormBefore = charBefore ? getActiveForm(charBefore) : null;
        const effectiveLifeTier = getEffectiveLifeTier(char, activeForm);
        const effectiveTier = ROMAN_TO_QUALITY[effectiveLifeTier] || 'F';
        const effectiveLifeTierBefore = charBefore ? getEffectiveLifeTier(charBefore, activeFormBefore) : effectiveLifeTier;
        const effectiveTierBefore = ROMAN_TO_QUALITY[effectiveLifeTierBefore] || 'F';
        // 形態の発動：形態の真属性を血統へ直接加算し、血統を置き換える二択は行わない
        // ★ 新機構：原始属性は品質字母であり、resolveRealAttr で 真属性(数値) へ変換してから累加する
        //   before を渡す：品質が未変更なら前回の乱数を再利用し、品質が変化した場合のみ再ランダムする（装備の着脱で値が跳ねるのを防ぐ）
        // ★ Bug 修正: 形態が"未発動"から"発動"へ切り替わるとき, 形態の真属性を強制クリアし現在の階層で再計算する
        //   原因: 形態が未発動の間にユーザーが階層を編集(Ⅰ→Ⅱ)しても, 未発動の形態は resolveRealAttr に処理されず,
        //         その真属性は旧階層の数値のまま; 発動の瞬間には before クローンが既に新しい階層を含む → tierChanged の検出が無効 → 再計算されない。
        //   対処: 真属性をクリア + null を beforeに渡し, resolveRealAttr を"空真属性→inSeg が全て false→全量再計算"の経路へ導く。
        const forceFormRecompute = formActive && activeForm && !activeFormBefore;
        if (forceFormRecompute && activeForm.真属性 && typeof activeForm.真属性 === 'object') {
            Object.keys(activeForm.真属性).forEach(k => { delete activeForm.真属性[k]; });
        }
        const sixSource = formActive ? resolveRealAttr(activeForm, 'form', forceFormRecompute ? null : activeFormBefore) : null;

        // —— 1. 最終五維 ——
        // ソース：血統 + (発動形態) + 装着中の装備五維 + 状態五維
        // 真属性(数値)を累加；状態の原始属性は品質字母→真属性、または数値をそのまま使用できる
        const statusSix = {};
        ATTR_NAMES.forEach(a => { statusSix[a] = 0; });
        Object.entries(状態).forEach(([sname, s]) => {
            if (s && typeof s === 'object' && s.原始属性) {
                const sb = 状态Before[sname];
                const rs = resolveRealAttr(s, 'status', sb, effectiveTier, effectiveTierBefore);
                // ★ デバフ状態: 原始属性が品質字母のとき, その項目の真属性は負値として最終五維に計上する
                //   (真属性自体は正値のまま保持し, resolveRealAttr の段位区間キャッシュの安定を保つ;
                //    数値型の原始属性は元のロジックどおり正負そのまま累加し, ここでは処理しない)
                const isDebuff = String(s.タイプ).trim() === 'デバフ';
                ATTR_NAMES.forEach(a => {
                    const v = safeNum(rs[a]);
                    if (isDebuff && isQualityString(s.原始属性[a]) && v > 0) {
                        statusSix[a] -= v;
                    } else {
                        statusSix[a] += v;
                    }
                });
            }
        });
        // 装着済み装備(状態===1)の五維ボーナス（品質表は装備の五維を許容するため、最終属性に計上する必要がある）
        const equipSix = {};
        ATTR_NAMES.forEach(a => { equipSix[a] = 0; });
        Object.entries(装備).forEach(([ename, e]) => {
            if (!e || typeof e !== 'object' || e.状態 !== 1) return;
            if (!e.原始属性 || typeof e.原始属性 !== 'object') return;
            const eb = 装备Before[ename];
            const re = resolveRealAttr(e, 'equip', eb, effectiveTier, effectiveTierBefore);
            ATTR_NAMES.forEach(a => { equipSix[a] += safeNum(re[a]); });
        });

        // 血統五維の真属性合計（常に参加：形態の発動後も血統は有効で、形態と累加する）
        const bloodSix = {};
        ATTR_NAMES.forEach(a => { bloodSix[a] = 0; });
        Object.entries(血統).forEach(([bname, b]) => {
            if (b && typeof b === 'object' && b.原始属性) {
                const bb = 血统Before[bname];
                const rb = resolveRealAttr(b, 'blood', bb, effectiveTier, effectiveTierBefore);
                ATTR_NAMES.forEach(a => { bloodSix[a] += safeNum(rb[a]); });
            }
        });

        // 五維 = 血統 + (発動形態) + 装着済み装備 + 状態
        const finalBase = {};
        ATTR_NAMES.forEach(a => {
            finalBase[a] = bloodSix[a]
                + (formActive ? safeNum(sixSource[a]) : 0)
                + equipSix[a]
                + statusSix[a];
        });

        // —— 1.5 生命階層による単一属性上限の打ち切り（中核の新ルール）——
        // 各単一属性の最終累加値は、キャラクターの現在の生命階層におけるその属性の上限(+1)を超えてはならない
        //   例：階層Ⅰ→単一属性上限29+1=30；30を超えたら30に打ち切る
        // ★ 形態の発動時は、上限階層に"形態階層 vs キャラクター自身の階層"の高い方を採用する：
        //   形態階層が高い → 形態階層を打ち切り上限とする；そうでなければキャラクター自身の階層で打ち切る
        const lt = effectiveLifeTier;
        const lifeCap = LIFE_TIER_RANGE[lt] ? (LIFE_TIER_RANGE[lt][1] + 1) : Infinity;
        ATTR_NAMES.forEach(a => {
            finalBase[a] = Math.min(finalBase[a], lifeCap);
            attr[a] = finalBase[a];
        });

        // —— 2. 修正値（位格上限の制約を受ける；位格は読み取り専用で書き戻さない）——
        // ★ 階層は Ⅰ-Ⅸ のローマ数字で統一（新機構。属性の合計点から逆算して書き戻すことはなく、開局/AI/進階ボタンが書き込む）
        //    修正値の位格上限表 TIER_MODIFIER_CAPS は字母品質 F-SSS を key とするため、Ⅰ→F … Ⅸ→SSS の同順マッピングで cap を取得する
        // ★ Bug 修正: 以前は常に char.階層 で修正上限を計算していた → 本体がⅠ階でⅣ階形態を発動すると、
        //   五維上限は形態に合わせてⅣ階へ上がる( 1.5 のltを参照)が、修正値はⅠ階の段(TIER_MODIFIER_CAPS['F']=12)に押さえ込まれていた。
        //   現在は 1.5 節で"キャラクター階層 vs 発動形態階層の高い方"に調整済みの lt を再利用し、属性の単一上限と同一の基準とする：
        //   変身中は修正上限が高い側を継承し、変身終了で getActiveForm()=null → lt が本体階層へ戻る → 上限も自動的に復元される。
        const lifeIdx = LIFE_TIER_ORDER.indexOf(lt);
        const tierForCap = (lifeIdx >= 0 && lifeIdx < TIER_ORDER.length) ? TIER_ORDER[lifeIdx] : 'F';
        const modifierCap = TIER_MODIFIER_CAPS[tierForCap];
        ATTR_NAMES.forEach(a => {
            let m = calcModifier(finalBase[a]);
            if (Number.isFinite(modifierCap)) m = Math.min(m, modifierCap);
            attr[`${a}修正`] = m;
        });

        // —— 3. 装備 + 形態の派生/判定加値を集計する（いずれも真属性の数値を使用） ——
        // 武器(類型0,状態1)のATK/MATKは独立して収集する(後でそれぞれ+無武装で項目化); 非武器の装備は全属性をbonusに計上; 武器のDEFなどもbonusに計上する
        const bonus = {};
        BONUS_KEYS.forEach(k => { bonus[k] = 0; });
        const weapons = []; // [{name, atk, matk}]
        Object.entries(装備).forEach(([wname, e]) => {
            if (!e || typeof e !== 'object' || e.状態 !== 1) return;
            if (!e.原始属性) return;
            const eb = 装备Before[wname];
            const re = resolveRealAttr(e, 'equip', eb, effectiveTier, effectiveTierBefore);
            if (safeNum(e.タイプ, 0) === 0) {
                // 武器: ATK/MATKは個別に記録し, その他の属性(DEF/MDEF/AP/判定)は引き続きbonusに計上する
                weapons.push({ name: wname, atk: safeNum(re.ATK), matk: safeNum(re.MATK) });
                BONUS_KEYS.forEach(k => { if (k !== 'ATK' && k !== 'MATK') bonus[k] += safeNum(re[k]); });
            } else {
                // 非武器: 全属性(含ATK/MATK)をbonusに計上 → 無武装へ合流
                BONUS_KEYS.forEach(k => { bonus[k] += safeNum(re[k]); });
            }
        });
        // 形態（発動時のみ）：形态.原始属性 にATK/DEF/MATK/MDEF/AP（11キー、判定なし）; ATK/MATKは無武装に計上
        if (formActive) {
            DERIVED_ATTRS.forEach(k => { bonus[k] += safeNum(sixSource[k]); });
        }
        // 状态.原始属性：派生項目はすべてbonusに計上；デバフ型の品質属性は負値で計算する
        Object.entries(状態).forEach(([sname, s]) => {
            if (s && typeof s === 'object' && s.原始属性) {
                const sb = 状态Before[sname];
                const rs = resolveRealAttr(s, 'status', sb, effectiveTier, effectiveTierBefore);
                const isDebuff = String(s.タイプ).trim() === 'デバフ';
                BONUS_KEYS.forEach(k => {
                    const v = safeNum(rs[k]);
                    if (isDebuff && isQualityString(s.原始属性[k]) && v > 0) bonus[k] -= v;
                    else bonus[k] += v;
                });
            }
        });

        // —— 4. HP_MAX / EP_MAX（旧式；最上位フィールドへ書き込む）——
        const { 体力, 精神} = finalBase;
        const oldMaxHP = safeNum(char.HP_MAX, safeNum(attr.HP_MAX));
        const newMaxHP = Math.max(1, Math.floor(体力 * 8));
        const oldMaxEP = safeNum(char.EP_MAX, safeNum(attr.EP_MAX));
        const newMaxEP = Math.max(0, Math.floor(精神 * 4));
        char.HP_MAX = newMaxHP;
        char.EP_MAX = newMaxEP;

        // —— 5. スマートHP/EP管理（上昇時は増分を加算、下降時は打ち切り、初期化時は満タン）——
        const isInit = (!oldMaxHP || oldMaxHP <= 10);
        const curHP = safeNum(char.HP, safeNum(attr.HP));
        const curEP = safeNum(char.EP, safeNum(attr.EP));
        if (isInit) {
            char.HP = newMaxHP;
            char.EP = newMaxEP;
        } else {
            if (newMaxHP > oldMaxHP) {
                char.HP = Math.min(curHP + (newMaxHP - oldMaxHP), newMaxHP);
            } else if (curHP > newMaxHP) {
                char.HP = newMaxHP;
            }
            if (newMaxEP > oldMaxEP) {
                char.EP = Math.min(curEP + (newMaxEP - oldMaxEP), newMaxEP);
            } else if (curEP > newMaxEP) {
                char.EP = newMaxEP;
            }
        }

        // —— 5.5 NPC 集団単位：THP プールの初期化 + THP からの数量逆算 ——
        // HP_MAX の確定後に実行する必要がある；キャラクターはスキップ；数量<=1 のとき THP は通常のシールドのまま
        syncNpcGroupThp(char, charBefore || null, label);

        // —— 6. 派生属性（計算式 + 加値の重ね合わせ）——
        // ATK/MATK は最上位へ書かず, "保持法則"に従って 最终属性.武器へ振り分ける:
        //   無武装 = 計算式による換算 + 非武器の装備/形態のATK/MATK(bonus.ATK/MATKは武器を除外済み)
        //   {武器名} = 武器の原始属性ATK/MATK + 無武装ATK/MATK
        const { 筋力, 敏捷 } = finalBase;
        const unarmedATK  = Math.floor((筋力 + 敏捷) / 2) + bonus.ATK;
        const unarmedMATK = Math.floor(精神 / 2) + bonus.MATK;
        // 武器オブジェクトを再構築する(毎回全量を再構築し, 外した後の旧項目の残留を防ぐ)
        attr.武器 = {};
        attr.武器.无武装 = { ATK: unarmedATK, MATK: unarmedMATK };
        weapons.forEach(w => {
            attr.武器[w.name] = { ATK: w.atk + unarmedATK, MATK: w.matk + unarmedMATK };
        });
        // 最上位のATK/MATKを削除する(武器構造へ移動済み; 旧データの残留も併せて消去)
        delete attr.ATK;
        delete attr.MATK;
        // DEF/MDEF/AP は最上位のまま(武器のDEFなどのボーナスはbonusに計上済み)
        attr.DEF  = Math.floor(体力 / 2) + bonus.DEF;
        attr.MDEF = Math.floor((体力 + 精神) / 4) + bonus.MDEF;
        attr.AP   = bonus.AP;

        // —— 追加：防御力を軽減率へ換算し、パネルへ書き戻す（フロント側で固定防御の代わりに使用）——
        attr.物理軽減率 = calcReduction(attr.DEF, char.階層 || 'E');
        attr.魔法軽減率 = calcReduction(attr.MDEF, char.階層 || 'E');

        // —— 7. 判定（基礎値 + 装備加値；先攻DC/防御DC のみ）——
        attr.先制DC = Math.floor((attr.敏捷修正 + attr.精神修正 / 2) / 2) + bonus.先制DC;
        attr.防御DC = 30 + Math.floor((attr.体质修正 + attr.敏捷修正) / 2) + bonus.防御DC;

        const formTag = formActive ? `[形態:${char.現在形態.名称}]` : '[血統]';
        // console.log(
        //     `[属性再計算] ${label} ${formTag}: ` +
        //     `五維={力${finalBase.筋力}/敏${finalBase.敏捷}/体${finalBase.体力}/精${finalBase.精神}/魅${finalBase.魅力}} ` +
        //     `HP=${char.HP}/${newMaxHP} EP=${char.EP}/${newMaxEP} ` +
        //     `無武装ATK=${unarmedATK} MATK=${unarmedMATK} 武器x${weapons.length} ` +
        //     `DEF=${attr.DEF}(+${bonus.DEF}) ` +
        //     `先攻=${attr.先制DC}(+${bonus.先制DC}) 防御=${attr.防御DC}(+${bonus.防御DC})` +
        //     (Number.isFinite(modifierCap) ? '' : '(位格未命中,修正は無制限)')
        // );
    }

    /**
     * キャラクター昇格判定：最終五維の属性値が【現在の生命階層】内でどの段位にあるかで判定し、五維の累計≥24 → 試練可能=true
     *   - 単一属性の点数：キャラクターの現在の階層(Ⅰ~Ⅸ)に対応する LIFE_TIER_RANGE [lo,hi]を9等分し F~SSSの九段とする
     *     属性値がどの段に入るか → 段位点(F=1, E=2 … SSS=9) qualitySegValue の分段ロジックと揃える
     *   - 現在の階層の下限(lo)未満 → 最低保証 F=1 点（属性が低すぎても基礎点を与える。0 点にはしない）
     *     例：階層Ⅲの範囲[100,299]で魅力=20 < 100 → F=1点と判定
     *   - しきい値 24：五維の満点は 45(5×9)で、24 ≈ 五維がすべて現在の階層の B 段(5点)以上に達して初めて試練可能
     *   - 進階後は新しい階層の範囲が広がり、属性は再び基準を満たす必要がある；属性低下で累計<24 → 直ちに false にする
     *   - キャラクターにのみ作用する(システム状態.試練可能)。NPC にこの仕組みはない
     * @param {object} reincarnator キャラクターオブジェクト
     * @param {object} sys システム状態 オブジェクト
     */
    const TRIAL_SCORE_THRESHOLD = 24;
    /**
     * 単一属性値 → 現在の階層における段位点(F=1 … SSS=9)
     *   現在の階層の LIFE_TIER_RANGE [lo,hi]を9等分し、属性値が入る段がそのまま点数になる
     *   lo 未満は最低保証 1 点(F)；到達/超過 hi で満点 9 点(SSS)
     * @param {number} val 単一属性の最終値
     * @param {string} lifeTier 現在の生命階層(Ⅰ~Ⅸ)
     * @returns {number} 段位点 1~9
     */
    function attrTierScore(val, lifeTier) {
        const v = safeNum(val, 0);
        const lt = normalizeLifeTier(lifeTier);
        const range = LIFE_TIER_RANGE[lt];
        if (!range) return 1; // 階層が無効なため最低保証の 1 点
        const lo = range[0], hi = range[1];
        // 現在の階層の下限未満 → 最低保証 F=1 点
        if (v < lo) return 1;
        // 階層Ⅸの上限は Infinity：直接 9 等分できないため、下限の 10 倍(100万)を分段上限の基準とする
        //   ロジック：Ⅸ は半神階層であり、単一属性 100万 をその階層の満档(SSS)とみなす；超えた場合は 9 点で頭打ち
        const effectiveHi = Number.isFinite(hi) ? hi : lo * 10;
        // 上限以上に達した → 満点 SSS=9
        if (v >= effectiveHi) return 9;
        // [lo, effectiveHi] 内を 9 等分し、どの段に入るかを判定する（qualitySegValue の w=floor(span/9) と揃える）
        const span = Math.max(1, effectiveHi - lo);
        const w = Math.max(1, Math.floor(span / 9));
        const segIdx = Math.min(8, Math.floor((v - lo) / w));
        return segIdx + 1;
    }
    function checkTrialEligibility(reincarnator, sys) {
        if (!reincarnator || !sys) return;
        const attr = reincarnator.最終属性;
        if (!attr || typeof attr !== 'object') return;
        const lifeTier = reincarnator.階層;
        let total = 0;
        ATTR_NAMES.forEach(a => { total += attrTierScore(attr[a], lifeTier); });
        const eligible = total >= TRIAL_SCORE_THRESHOLD;
        if (sys.試練可能 !== eligible) {
            sys.試練可能 = eligible;
            // console.log(`[昇格判定] キャラクター階層=${lifeTier} 五維段位累計=${total} (しきい値${TRIAL_SCORE_THRESHOLD}) → 是否可试炼=${eligible}`);
        }
    }

    /** キャラクター + 全NPC を走査して個別に再計算する（バックエンドの全量計算であり、登場中かどうかとは無関係） */
    function recalcAllCharacters(statData, statDataBefore) {
        if (!statData) return;
        // キャラクター
        if (statData.キャラ) {
            recalcCharacter(statData.キャラ, 'キャラ', statDataBefore?.キャラ);
        }
        // 関係リストの全NPC（未登場でも属性の再計算が必要。パネルでの確認用。AI へ表示するかは変数の可視性で制御する）
        const rel = statData.関係リスト;
        const relBefore = statDataBefore?.関係リスト;
        if (rel && typeof rel === 'object') {
            Object.entries(rel).forEach(([name, npc]) => {
                if (!npc || typeof npc !== 'object') return;
                const npcBefore = (relBefore && typeof relBefore === 'object') ? relBefore[name] : null;
                recalcCharacter(npc, `NPC:${name}`, npcBefore);
            });
        }
    }

    /** 実プレイ日数の進行: 世界.時間 の日付(年月日)が変わるたびに → システム状態.プレイ日数+1 (単調増加, インスタンス内の時間跳躍/巻き戻しの影響を受けない) */
    function updatePlayDays(statData) {
        const worldTime = statData?.世界?.時間;
        const sys = statData?.システム状態;
        if (!sys || !worldTime) return;

        // 「日付が変わったかどうか」のみを判定し、実際に経過した日数では累計しない；紀年は古代/異世界のテキストを許容する。
        const DATE_RE = /([^年月日]+?)\s*年\s*-?\s*(\d+)\s*月\s*-?\s*(\d+)\s*日/;
        const m = String(worldTime).match(DATE_RE);
        if (!m) return;

        // 紀年/月/日のみを取得する；同一日付内で時刻が変わっても重複して数えない。
        const dateKey = `${String(m[1] || '').trim()}-${+m[2]}-${+m[3]}`;
        const lastDate = String(sys.前回世界日付 || '');

        if (!lastDate) {
            // 初回初期化: 開局時点で第1日
            sys.プレイ日数 = 1;
        } else if (lastDate !== dateKey) {
            // 日付変動(日跨ぎ/インスタンス入場/退場はいずれも1日として計上)
            sys.プレイ日数 = Number(sys.プレイ日数 || 0) + 1;
        }
        sys.前回世界日付 = dateKey;
    }

    function getPlayerName() {
        try {
            if (typeof SillyTavern === 'undefined') return '';
            return String(SillyTavern.getContext?.()?.name1 || SillyTavern.name1 || '').trim();
        } catch (e) {
            return '';
        }
    }

    function isPlayerOwner(owner, playerName = getPlayerName()) {
        const value = String(owner || '').trim();
        if (!value) return false;
        return (!!playerName && value === playerName)
            || value === '<user>'
            || value === '{{user}}'
            || value === '玩家';
    }

    function isPlayerOwnedAsset(asset) {
        const owners = Array.isArray(asset?.所属対象)
            ? asset.所属対象
            : (typeof asset?.所属対象 === 'string' ? [asset.所属対象] : []);
        const playerName = getPlayerName();
        return owners.some(owner => isPlayerOwner(owner, playerName));
    }

    /** 資産の明示的な削除を記録し、世界エンジンが古いシナリオの記憶から同名資産を再作成するのを防ぐ。 */
    function syncRemovedAssets(statData, statDataBefore) {
        if (!statData || !statDataBefore) return [];
        // 通常のインスタンス決算で主神空間へ戻る際の一括削除は世界ライフサイクルの整理であり、世界をまたぐ資産墓碑として記録してはならない。
        if (statData?.システム状態?.主神空間滞在中 === true && statDataBefore?.システム状態?.主神空間滞在中 !== true) return [];
        const beforeAssets = statDataBefore.资产 && typeof statDataBefore.资产 === 'object' ? statDataBefore.资产 : {};
        const currentAssets = statData.资产 && typeof statData.资产 === 'object' ? statData.资产 : {};
        statData.世界 = statData.世界 || {};
        statData.世界.バックステージ = statData.世界.バックステージ || {};
        const tombstones = statData.世界.バックステージ.资产墓碑 = statData.世界.バックステージ.资产墓碑 || {};
        const removed = [];
        Object.keys(beforeAssets).forEach(name => {
            if (Object.prototype.hasOwnProperty.call(currentAssets, name)) return;
            tombstones[name] = String(statData.世界.時間 || '削除済み');
            removed.push(name);
        });
        // ユーザー/MVU が明示的に同名資産を再構築した場合は墓碑を解除する。
        Object.keys(currentAssets).forEach(name => { if (Object.prototype.hasOwnProperty.call(tombstones, name)) delete tombstones[name]; });
        return removed;
    }

    /** 資産の自動収穫：システム状態.プレイ日数 のみでスケジュールし、期限到来時は待辦のみを生成する。 */
    function autoHarvestAssets(statData, statDataBefore) {
        const assets = statData?.资产;
        const sys = statData?.システム状態;
        if (!assets || typeof assets !== 'object' || !sys) return;

        const playDays = Number(sys.プレイ日数 || 0);
        if (!(playDays > 0)) return;
        const cycle = 7;
        const formatRemaining = (nextPlay) => `${Math.max(0, Math.ceil(nextPlay - playDays))}日後`;

        Object.entries(assets).forEach(([assetName, asset]) => {
            if (!asset || typeof asset !== 'object' || !isPlayerOwnedAsset(asset)) return;
            const seqs = asset.建設シーケンス;
            if (!seqs || typeof seqs !== 'object') return;
            if (!Array.isArray(asset.待機イベント)) asset.待機イベント = [];

            Object.entries(seqs).forEach(([seqName, seq]) => {
                if (!seq || typeof seq !== 'object') return;
                const output = String(seq.産出 || '').trim();
                if (!output || output === '无' || output === '待定') {
                    seq.次回産出日 = '';
                    seq.次回産出游日 = 0;
                    return;
                }

                let nextPlay = Number(seq.次回産出游日);
                if (!Number.isFinite(nextPlay) || nextPlay <= 0) {
                    // 旧形式の相対表示/プレイ日表示に対応；旧世界の絶対日付はもうスケジュールに関与しない。
                    const shown = String(seq.次回産出日 || '').trim();
                    const remainingMatch = shown.match(/^(\d+)\s*(?:天后|日後)$/);
                    const legacyPlayMatch = shown.match(/^第?\s*(\d+)\s*游玩日$/);
                    if (remainingMatch) nextPlay = playDays + Number(remainingMatch[1]);
                    else if (legacyPlayMatch) nextPlay = Number(legacyPlayMatch[1]);
                    else nextPlay = playDays + cycle;
                }

                seq.次回産出游日 = nextPlay;

                if (playDays >= nextPlay) {
                    const harvestCount = Math.floor((playDays - nextPlay) / cycle) + 1;
                    const prefix = `【自動収穫】${assetName}-${seqName}`;
                    const legacyPrefix = `【自动收菜】${assetName}-${seqName}`;
                    let pendingIndex = asset.待機イベント.findIndex(item => String(item || '').startsWith(prefix));
                    // 旧セーブ互換: 旧中国語プレフィックスの保留レコードを新形式へ一度だけ正規化する(冪等)
                    if (pendingIndex < 0) {
                        const legacyIndex = asset.待機イベント.findIndex(item => String(item || '').startsWith(legacyPrefix));
                        if (legacyIndex >= 0) {
                            asset.待機イベント[legacyIndex] = prefix + String(asset.待機イベント[legacyIndex] || '').slice(legacyPrefix.length);
                            pendingIndex = legacyIndex;
                        }
                    }
                    let totalCount = harvestCount;
                    if (pendingIndex >= 0) {
                        const oldCount = String(asset.待機イベント[pendingIndex] || '').match(/共\s*(\d+)\s*(?:份|件)/);
                        if (oldCount) totalCount += Number(oldCount[1]);
                    }
                    const todoMsg = `${prefix}：${output}（全${totalCount}件、受取待ち）`;
                    if (pendingIndex >= 0) asset.待機イベント[pendingIndex] = todoMsg;
                    else asset.待機イベント.push(todoMsg);

                    nextPlay += harvestCount * cycle;
                    seq.次回産出游日 = nextPlay;
                }

                seq.次回産出日 = formatRemaining(nextPlay);
            });
        });
    };

    // ===== モジュール 2：防御力の収益逓減 (対数防御カーブ - 動的階層適応版) =====
    const REDUCTION_CAP = 75; // 最大軽減 75%
    const ALPHA = 16;
    const LOG_DEN = Math.log(1 + ALPHA); // ln(17)

    /**
     * 【中核修正】：各階位に対応する理論上の満防御値（防具上限 + 体質換算上限）
     * 根拠：あなたの《品質効果数値規則》における各階位の五維合計と防御しきい値から推算
    */ 
    const TIER_DEF_SCALE = {
        'Ⅰ': 70,       // F級の新顔の満防御基準
        'Ⅱ': 200,      // E級の満防御基準
        'Ⅲ': 480,      // D級
        'Ⅳ': 1280,     // C級
        'Ⅴ': 3300,     // B級
        'Ⅵ': 9200,     // A級
        'Ⅶ': 24000,    // S級
        'Ⅷ': 70000,    // SS級
        'Ⅸ': 150000    // SSS級の半神の満防御基準
    };

    /** 防御合計値とキャラクターの現在の階層を渡す */
    function calcReduction(defenseValue, tier) {
        // 現在の階位の満防御基準を取得する（フォールバックはE級）
        const fullScale = TIER_DEF_SCALE[tier] || TIER_DEF_SCALE['E'];
        const defense = Math.max(0, safeNum(defenseValue, 0));
        
        // 現在の防御を現在の階位における比率へ換算する
        const scale = defense / fullScale;
        
        // 対数逓減の式に代入する
        const rawReduction = REDUCTION_CAP * Math.log(1 + ALPHA * scale) / LOG_DEN;
        
        // 最大でも 75% を超えないようにする
        return Math.min(REDUCTION_CAP, Math.round(rawReduction)); 
    }

    /** 伴生神器の自動成長 */
    function processArtifactGrowth(char) {
        if (!char || !char.装備) return;
        
        // 伴生神器の装備タグが "伴生神器" または "可成长" であると仮定し、装備リストから検索する
        const artifact = Object.values(char.装備).find(e => e.タグ?.includes("伴生神器") || e.タグ?.includes("可成长"));
        
        if (!artifact) return;

        const currentTier = char.階層; // F ~ SSS
        const oldTier = artifact.品質;

        // 神器の品質が既にキャラクターの階層と等しい場合は成長不要
        if (oldTier === currentTier) return;

        // 装備の品質をキャラクターの位格へ自動的に揃える
        artifact.品質 = currentTier;
        
        // 特殊効果と属性を動的に書き換える
        if (!artifact.効果) artifact.効果 = {};
        if (!artifact.原始属性) artifact.原始属性 = {};

        // 階層に応じて詞条を解放する (修仙小説の本命法宝の封印解除のように)
        switch(currentTier) {
            case 'E':
                artifact.効果['真名初现'] = "攻击时额外造成小幅灵魂震荡";
                artifact.原始属性['ATK'] = 50;
                break;
            case 'C':
                artifact.効果['火之高兴'] = "无视目标 20% 物理軽減率";
                artifact.原始属性['ATK'] = 500;
                break;
            case 'A':
                artifact.効果['焚天'] = "每次攻击附带基于目标最大HP 5% 的真实灼烧";
                artifact.原始属性['ATK'] = 3000;
                break;
            case 'SSS':
                artifact.効果['概念级·初火'] = "绝对必中，且击杀目标后直接抹除其在世界法则中的因果";
                artifact.原始属性['ATK'] = 50000;
                break;
        }
        
        // console.log(`[神器成長] 伴生神器がキャラクターの突破に伴い成長！現在の品質: ${currentTier}`);
    }

    /** 功法/熟練度のオーバーフロー進階ガード */
    function guardProficiency(char) {
        if (!char || !char.技能) return;
        
        // 階位昇格のしきい値を設定する
        const TIER_THRESHOLDS = { '入門': 100, '熟練': 300, '精通': 1000, '宗師': 5000, '化境': Infinity };
        const TIER_ORDER = Object.keys(TIER_THRESHOLDS);

        Object.entries(char.技能).forEach(([skillName, skill]) => {
            // 「熟練度」フィールドで制御することを想定
            if (skill.熟练度 === undefined || skill.掌握程度 === undefined) return;

            let currentExp = safeNum(skill.熟练度, 0);
            let currentTier = skill.掌握程度; // 例 "入门"
            
            let threshold = TIER_THRESHOLDS[currentTier] || Infinity;

            // 熟練度がオーバーフローした場合は自動で進階する
            while (currentExp >= threshold && threshold !== Infinity) {
                currentExp -= threshold; // しきい値を差し引き、オーバーフロー分を保持する
                
                const nextIndex = TIER_ORDER.indexOf(currentTier) + 1;
                currentTier = TIER_ORDER[nextIndex];
                threshold = TIER_THRESHOLDS[currentTier];
                
                // console.log(`[功法突破] おめでとう！${skillName} が ${currentTier}へ突破！`);
                
                // 進階時にスキルのダメージ係数を自動で強化する
                if (skill.効果 && skill.効果['基础伤害倍率']) {
                    skill.効果['基础伤害倍率'] = (parseFloat(skill.効果['基础伤害倍率']) + 0.5) + "x";
                }
            }

            // データを書き戻す
            skill.掌握程度 = currentTier;
            skill.熟练度 = currentExp;
            skill.升阶阈值 = threshold;
        });
    }

    /** アイテム数量がゼロになったものの整理 */
    function cleanupZeroQuantityItems(char) {
        if (!char || !char.道具) return;
        Object.keys(char.道具).forEach(itemName => {
            const item = char.道具[itemName];
            // 数量 <= 0、またはフィールドが欠落している場合は直ちに削除する
            if (item && (item.数量 === undefined || item.数量 === null || item.数量 <= 0)) {
                delete char.道具[itemName];
                console.log(`[道具整理] アイテム "${itemName}" の数量がゼロになったため、自動的に削除した。`);
            }
        });
    }

    /** 状態ターンの減衰と期限切れの整理 */
    function processStatusDuration(char, isCombat) {
        if (!char || !char.状態) return;
        const statusesToRemove = [];
        
        Object.entries(char.状態).forEach(([statusName, statusData]) => {
            if (!statusData || typeof statusData.持続 !== 'string') return;
            
            // 戦闘中のみ、「回合」の文字を含む状態のカウントダウンを処理する
            if (isCombat && statusData.持続.includes('回合')) {
                let rounds = parseInt(statusData.持続);
                if (!isNaN(rounds) && rounds > 0) {
                    rounds -= 1; // ターン数を -1
                    if (rounds <= 0) {
                        statusesToRemove.push(statusName);
                    } else {
                        // 文字列へ書き戻す。例 "2回合"
                        statusData.持続 = `${rounds}回合`;
                    }
                }
            }
            // 非戦闘状態の持続時間（例 "3天"や"直至被净化"）は AI がシナリオ内で判断する
        });
        
        // 期限切れの状態をまとめて削除する
        statusesToRemove.forEach(name => {
            delete char.状態[name];
            console.log(`[状態整理] ${char.名称 || 'キャラ'} の状態 [${name}] が期限切れのため、バックエンドで自動削除した。`);
        });
    }

    /** 死亡 NPC の整理 (誤削除防止強化版) */
    function cleanupDeadNPCs(statData) {
        if (!statData || !statData.関係リスト) return;
        Object.keys(statData.関係リスト).forEach(npcName => {
            const npc = statData.関係リスト[npcName];
            if (!npc) return;
            
            // 1. 最終保護 チームメイト、または好感度 > 30の場合は絶対に削除しない（蘇生アイテム/スキルのために肉体を保持する）;登場中は処理しない
            const isTeammate = npc.仲間 === true;
            const highAffinity = typeof npc.好感度 === 'number' && npc.好感度 > 30;
            const isPresent = npc.登場 === true;
            if (isTeammate || highAffinity || isPresent) {
                return; // そのままスキップし、整理の対象外とする
            }

            // 2. 死亡の判定
            // 判定条件 A：HP がゼロ
            const isHpDead = (typeof npc.HP === 'number' && npc.HP <= 0);
            
            // 判定条件 B：AI が状態に「死亡」を含む語を明示的に書いた（二重の保険）
            const isExplicitlyDead = npc.状態 && Object.keys(npc.状態).some(key => key.includes('死亡'));

            // 3. いずれかの死亡条件を満たし、保護もない場合はメモリから直接抹消する
            if (isHpDead || isExplicitlyDead) {
                delete statData.関係リスト[npcName];
                console.log(`[戦死整理] 敵対または通行人の NPC "${npcName}" は死亡確認済み（蘇生価値なし）のため、バックエンドで自動削除した。`);
            }
        });
    }

    /** 世界安定値の自動推計 */
    function calcWorldStability(statData) {
        if (!statData || !statData.世界) return;
        if (statData.設定?.世界超安定 === true) {
            statData.世界.安定 = 100;
            return;
        }
        if (!statData.世界.因果軌道) return;
        const records = statData.世界.因果軌道.偏移記録;
        
        let totalOffset = 0;
        if (records && typeof records === 'object') {
            Object.values(records).forEach(record => {
                if (record && typeof record.影响程度 === 'number') {
                    totalOffset += record.影响程度;
                }
            });
        }
        
        // 安定値: 基礎 100 + 偏移記録の累加値, 上下限 [0, 120]
        //   - 上限 120: 正の偏移(好都合な出来事)がオーバーフローしてシステム上限を超えるのを防ぐ
        //   - 下限 0: 負の偏移(災難)が負値まで突き抜けるのを防ぐ
        const STABILITY_MIN = 0, STABILITY_MAX = 120;
        const newStability = Math.max(STABILITY_MIN, Math.min(STABILITY_MAX, 100 + totalOffset));

        if (statData.世界.安定 !== newStability) {
            console.log(`[世界法則] 安定値の再計算: 100 + ${totalOffset}(偏移合計) = ${newStability} (リミット[${STABILITY_MIN},${STABILITY_MAX}])`);
            statData.世界.安定 = newStability;
        }
    }

    /** 戦闘ラウンドとスキルクールダウンの全自動管理 */
    function processCombatAndCooldowns(statData, statDataBefore) {
        const combat = statData?.システム状態;
        const combatBefore = statDataBefore?.システム状態;
        if (!combat) return;

        let deltaRound = 0;
        let isCombatNow = combat.戦闘中 === true;
        const wasCombatBefore = combatBefore?.是否战斗中 === true;

        // —— 0. 戦場の敵対勢力の生存検出：登場中で生存している敵対 NPC がいない場合は強制的に戦闘離脱させる ——
        //   敵対の定義: 登場中 かつ 非チームメイト かつ 好感度<0(仇視以上の敵意)
        //   生存の定義: HP>0 かつ 状態に「死亡」が明示されていない
        function isHostileAlive(npc) {
            if (!npc) return false;
            // チームメイト / 好感度が非負 → 非敵対
            if (npc.仲間 === true) return false;
            const affinity = safeNum(npc.好感度, 0);
            if (affinity >= 0) return false;
            // 死亡判定: HP がゼロ または 状態に「死亡」を含む
            const isHpDead = (typeof npc.HP === 'number' && npc.HP <= 0);
            const isExplicitlyDead = npc.状態 && Object.keys(npc.状態).some(k => k.includes('死亡'));
            if (isHpDead || isExplicitlyDead) return false;
            // 生存しており、なお戦闘能力を持つ敵対単位
            return true;
        }

        let hasHostileOnScene = false;
        if (statData.関係リスト && typeof statData.関係リスト === 'object') {
            hasHostileOnScene = Object.values(statData.関係リスト).some(npc =>
                npc && npc.登場 !== false && isHostileAlive(npc)
            );
        }

        // 戦闘中でも現場に生存する敵対単位がいない → バックエンドで強制離脱させ、AI が空転する戦闘を維持しないようにする
        if (isCombatNow && !hasHostileOnScene) {
            // console.log(`[戦闘システム] 現場に生存する敵対 NPCがいないため、バックエンドで戦闘を強制終了`);
            combat.戦闘中 = false;
            // 後続の「離脱分岐」がこのフレームで発動できるようにし、クールダウン/THP の整理プロトコルを即座に有効化する
            isCombatNow = false;
        }

        // —— 1. ラウンドの自動増加処理 ——
        if (isCombatNow) {
            if (!wasCombatBefore) {
                combat.現在ラウンド = 1; // 戦闘に入った直後
                // console.log(`[戦闘システム] 戦闘に入り、現在のラウンドを 1に初期化`);
            } else {
                const beforeRound = safeNum(combatBefore.現在ラウンド, 1);
                const aiRound = safeNum(combat.現在ラウンド, 1);
                // バックエンドが強力に引き継いで増加させ、AI による二重加算を防ぐ
                if (aiRound <= beforeRound) {
                    combat.現在ラウンド = beforeRound + 1;
                }
                deltaRound = combat.現在ラウンド - beforeRound;
                // console.log(`[戦闘システム] ラウンド進行: ${beforeRound} -> ${combat.現在ラウンド}`);
            }
        } else {
            combat.現在ラウンド = 0;
            // ★ 非戦闘: AI メッセージごとに 1 ターンと数え, 形態/状態のクールダウンをターン単位で減少させる(3ターン後にゼロになり再発動可能)
            //   旧ロジックの deltaRound=999 は tickCooldowns にクールダウンを強制ゼロさせていた → 非戦闘メッセージごとにクールダウンが 0 に戻る → 形態をいつでも発動/解除できてしまう
            //   現在は deltaRound=1: 離脱してもクールダウンはゼロにせず, 毎ターン-1(戦闘中と同じカウントダウンのリズム); 離脱の瞬間に THP はゼロにする(下方の wasCombatBefore ブロックを参照)
            deltaRound = 1;

            // ただし「ちょうど戦闘から離脱した」この瞬間にのみゼロ化を発動する！
            if (wasCombatBefore) {
                // console.log(`[戦闘システム] 戦闘から離脱し、クールダウンとシールド(THP)のクリアプロトコルを発動`);
                
                // 1. キャラクターの一時生命値をクリアする
                if (statData.キャラ && typeof statData.キャラ.THP !== 'undefined') {
                    statData.キャラ.THP = 0;
                    // console.log(`[戦闘システム] キャラクターの THP を離脱時にゼロにした`);
                }

                // 2. すべてのNPCの一時生命値をクリアする
                //    注意：このフレームの recalc は完了済み；集団単位の THP はゼロ化された後、同一フレームで 数量 に従って再充填する必要がある
                if (statData.関係リスト) {
                    Object.entries(statData.関係リスト).forEach(([npcName, npc]) => {
                        if (!npc || npc.登場 === false) return;
                        if (typeof npc.THP !== 'undefined') npc.THP = 0;
                        // 集団：THP をゼロにした後、現在の 数量 に従って再充填する（人数は戦闘中に THP から逆算済みのため、満員には戻さない）
                        const qty = Math.max(1, Math.floor(safeNum(npc.数量, 1)));
                        if (qty > 1) {
                            const maxHp = Math.max(1, safeNum(npc.HP_MAX, 1));
                            const pool = maxHp * (qty - 1);
                            npc.THP = pool;
                            // console.log(`[戦闘システム] 集団 NPC:${npcName} の離脱時再充填 THP=${pool} (数量=${qty})`);
                        }
                    });
                }
            }
        }

        // —— 2. クールダウン減少ロジックエンジン ——
        function tickCooldowns(actor, actorBefore, label) {
            if (!actor) return;
            
            const processDict = (dict, dictBefore) => {
                if (!dict) return;
                Object.entries(dict).forEach(([name, item]) => {
                    if (!item || typeof item.冷却 !== 'string') return;
                    
                    const oldItem = dictBefore?.[name];
                    const oldCdStr = oldItem?.冷却 || "0";
                    const newCdStr = item.冷却;
                    
                    // 文字列を解析する。例 "2/3 回合" から cur=2, max=3 を取り出す
                    const parseCD = (str) => {
                        if (!str || str === "0") return { cur: 0, max: 0 };
                        const m = str.match(/^(\d+)\s*\/\s*(\d+)/);
                        if (m) return { cur: parseInt(m[1]), max: parseInt(m[2]) };
                        return { cur: 0, max: 0 };
                    };

                    const oldCD = parseCD(oldCdStr);
                    const newCD = parseCD(newCdStr);

                    if (newCD.max === 0) return; // 0/0のCDなしスキルはそのままスキップ

                    // 【最強の割り込み】：AI がちょうど現在のクールダウンを引き上げた場合（＝このターンにそのスキルを発動した場合）は、このターンは絶対に減算しない！
                    if (newCD.cur > oldCD.cur && isCombatNow) {
                        // console.log(`[クールダウンシステム] ${label} が [${name}] を発動した直後のため、クールダウンは ${newCdStr}に設定済みで、このラウンドは減算しない。`);
                        return;
                    }

                    // ラウンドに応じた減算を開始する
                    let finalCur = newCD.cur;
                    if (deltaRound === 999) {
                        finalCur = 0; // (互換のため保持)明示的な離脱ゼロ化信号: 現在の呼び出し側は 999 を渡していない
                    } else if (deltaRound > 0) {
                        finalCur = Math.max(0, newCD.cur - deltaRound);
                    }

                    // 標準フォーマットで書き戻す
                    const finalStr = finalCur === 0 ? "0" : `${finalCur}/${newCD.max} 回合`;
                    if (item.冷却 !== finalStr) {
                        // console.log(`[クールダウンシステム] ${label} の [${name}] クールダウン進行: ${item.冷却} -> ${finalStr}`);
                        item.冷却 = finalStr;
                    }
                });
            };

            // スキルライブラリと形態ライブラリを走査する
            // processDict(actor.技能, actorBefore?.技能);
            processDict(actor.形態庫, actorBefore?.形態庫);
        }

        // キャラクターのクールダウン減少を実行する
        tickCooldowns(statData.キャラ, statDataBefore?.キャラ, "キャラ");
        // 登場中の NPC のクールダウン減少を実行する
        if (statData.関係リスト) {
            Object.entries(statData.関係リスト).forEach(([npcName, npc]) => {
                if (npc.登場 !== false) {
                    tickCooldowns(npc, statDataBefore?.関係リスト?.[npcName], `NPC:${npcName}`);
                }
            });
        }
    }



    // イベント登録の初期化；すべての購読は Runtime が保持し、ワークショップのホットリロード前に旧インスタンスを安全に停止できる。
    const init = async () => {
        await waitGlobalInitialized('Mvu');
        initializeTurnMessageBaseline();
        var subscription = eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, onUpdateData);
        trackCalculatorSubscription(subscription);
        try { CALCULATOR_HOST.__辅助计算脚本_loaded__ = true; } catch (_) {}
        try { toastr.success('[補助計算スクリプト] スクリプトを読み込みました '); } catch (_) {}
    };

    try {
        var pagehideHandler = function () { calculatorPreClean(); };
        if (window && typeof window.addEventListener === 'function') {
            window.addEventListener('pagehide', pagehideHandler);
            trackCalculatorSubscription({ stop: function () { try { window.removeEventListener('pagehide', pagehideHandler); } catch (_) {} } });
        }
    } catch (_) {}

    $(init);
})();
