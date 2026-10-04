/* * ==========================================================================
 * [轮回空间] 主神终端系统 UI (Samsara Destiny UI) v2
 * 重构特性：
 *   - 多主题换肤(暗夜/绯红/靛蓝/羊皮纸) 通过 data-theme + CSS变量
 *   - 数据编辑模式(行内编辑器→赋值回MVU: replaceMvuData)
 *   - 顶栏(时间地点 + 刷新/设置/关闭) + 中部(头像/名称/层级 + HP/EP/THP) + 底部状态图标条
 *   - 左侧Tab(任务/信息/持有/血统/关系/经营/传闻/世界) + 右侧内容
 *   - 弹窗式状态详情与物品详情
 *   - 全量字段渲染覆盖ZOD Schema
 * ==========================================================================
 */
(function () {
    'use strict';
    try { console.log('%c[主神终端] ⚡ 轮回终端 v2 接入中...', 'color:#8f9fff;font-weight:bold'); } catch (e) {}

    /* ===== 1. 父窗口重定向 ===== */
    var GS_PARENT = (function () {
        try { if (window.parent && window.parent !== window && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
        try { if (window.top && window.top !== window && window.top.document && window.top.document.body) return window.top; } catch (e) {}
        return window;
    })();
    var $ = (GS_PARENT.jQuery || GS_PARENT.$ || window.jQuery || window.$);
    var document = GS_PARENT.document;
    var _ = (GS_PARENT._ || window._);

    /* 当前酒馆 Persona：状态栏内部与其他 Samsara 模块共用同一份玩家身份。 */
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

    /* ===== 2. 状态存储配置 ===== */
    var SAM_CONFIG = {
        pos: 'samsara_ball_pos_v2',
        open: 'samsara_panel_open_v2',
        theme: 'samsara_theme_v2',
        tab: 'samsara_tab_v2',
        edit: 'samsara_edit_v2'
    };

    /* ===== 3. 主题定义 ===== */
    var THEMES = {
        'night':   { name: '暗夜', accent: '#8f9fff', hp: '#e4587d', thp: '#e5c166', ep: '#5d97ff', bg: 'rgba(14,19,32,0.88)', card: 'rgba(22,30,46,0.7)', border: 'rgba(143,159,255,0.28)', text: '#f3f5f8', sub: '#8b95a6', dark: '#07090e' },
        'crimson': { name: '绯红', accent: '#ff5f57', hp: '#ff4757', thp: '#ffa502', ep: '#5b8cff', bg: 'rgba(28,12,16,0.9)', card: 'rgba(46,18,24,0.72)', border: 'rgba(255,95,87,0.3)', text: '#fff0f3', sub: '#b08896', dark: '#0e0406' },
        'indigo':  { name: '靛蓝', accent: '#7c5cff', hp: '#ff6b8a', thp: '#ffd166', ep: '#4dabff', bg: 'rgba(14,16,38,0.9)', card: 'rgba(28,30,58,0.72)', border: 'rgba(124,92,255,0.32)', text: '#eef0ff', sub: '#9094c0', dark: '#06081a' },
        'parchment': { name: '羊皮', accent: '#a8761e', hp: '#c0392b', thp: '#d4a017', ep: '#2c6fbb', bg: 'rgba(245,235,210,0.95)', card: 'rgba(235,222,190,0.8)', border: 'rgba(168,118,30,0.35)', text: '#3a2a14', sub: '#7a6440', dark: '#e8d8b8' },
        'sakura':   { name: '樱白', accent: '#ff80ab', hp: '#e91e63', thp: '#ffb300', ep: '#42a5f5', bg: 'rgba(255,240,245,0.95)', card: 'rgba(255,224,233,0.82)', border: 'rgba(255,128,171,0.36)', text: '#3d1e2a', sub: '#8a6172', dark: '#f7d4e0' },
        'matcha':   { name: '抹茶', accent: '#66bb6a', hp: '#ef5350', thp: '#ffa726', ep: '#26c6da', bg: 'rgba(238,246,232,0.95)', card: 'rgba(224,240,210,0.82)', border: 'rgba(102,187,106,0.34)', text: '#1f3320', sub: '#5a7560', dark: '#d6ecc8' }
    };
    var THEME_ORDER = ['night', 'crimson', 'indigo', 'parchment', 'sakura', 'matcha'];

    /* ===== 4. 受保护(只读)字段定义 ===== */
    var READONLY_PATHS = [
        '角色.HP_MAX', '角色.EP_MAX', '角色.最终属性', '角色.层级',
        '角色.当前形态', '角色.形态库',
        '世界.稳定', '世界.当前轮次', '系统状态.当前轮次'
    ];
    /* 层级阈值表: F→E→D→C→B→A→S→SS→SSS (下限值; 进阶任务才升层级, 故进度条只显示进度不自动升级) */
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
    /* 装备穿戴槽位配置: type=装备类型枚举索引, cap=槽位上限(0表示无上限如特殊);
       cap>=2 满则拒绝穿戴; cap===1 穿戴时替换同类型已装备; cap===0 无限制;
       renderEquipSlotsBar 与 handleItemAction 共用此表, 修改上限只需改一处 */
    var EQUIP_SLOTS = [
        {label:'武器', type:0, cap:2},
        {label:'手套', type:1, cap:1},
        {label:'头部', type:2, cap:1},
        {label:'胸部', type:3, cap:1},
        {label:'腿部', type:4, cap:1},
        {label:'鞋子', type:5, cap:1},
        {label:'披风', type:6, cap:1},
        {label:'饰品', type:7, cap:2},
        {label:'世界遗物', type:8, cap:0}
    ];
    /* 道具战术栏槽位上限 */
    var ITEM_SLOT_CAP = 5;
    /* 血统数量上限(与 EQUIP_SLOTS / ITEM_SLOT_CAP 同级常量, 不写入数据库) */
    var BLOODLINE_CAP = 1;
    function isReadonlyPath(path) {
        if (!path) return false;
        // 精确匹配 + 前缀匹配(针对最终属性子字段、NPC层级等)
        for (var i = 0; i < READONLY_PATHS.length; i++) {
            var rp = READONLY_PATHS[i];
            if (path === rp || path.indexOf(rp + '.') === 0) return true;
        }
        // NPC 的 HP_MAX / EP_MAX / 最终属性 / 层级
        if (/^关系列表\.[^.]+\.HP_MAX$/.test(path)) return true;
        if (/^关系列表\.[^.]+\.EP_MAX$/.test(path)) return true;
        if (/^关系列表\.[^.]+\.最终属性/.test(path)) return true;
        if (/^关系列表\.[^.]+\.层级$/.test(path)) return true;
        // 装备/技能的"类型"是数字枚举(武器/胸部/.../主动/被动/特殊), 用户改字符串会导致解析为"未知", 一律只读; (道具的"类型"是字符串, 可编辑)
        if (/\.(装备|技能)\.[^.]+\.类型$/.test(path)) return true;
        return false;
    }

    /* ===== 5. 预清理旧实例 ===== */
    function samPreClean() {
        try {
            if ($) {
                $('#samsara-ball, #samsara-panel, #samsara-modal, #samsara-theme-style').remove();
                $(document).off('.sam .samPanel .samBall .samModal');
            }
            if (window.samsaraGuardTimer) clearInterval(window.samsaraGuardTimer);
        } catch (e) { console.warn('[主神终端] 预清理失败:', e.message); }
    }
    samPreClean();

    /* ===== 6. 获取数据 ===== */
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
                if (r && r.stat_data) return r.stat_data;
                if (r) return r;
            }
            if (typeof GS_PARENT.getMessageVar === 'function') return GS_PARENT.getMessageVar('stat_data');
            if (typeof window.getMessageVar === 'function') return window.getMessageVar('stat_data');
        } catch (e) { console.warn('[主神终端] 数据读取异常:', e.message); }
        return null;
    }

    /* ===== 7. 写回MVU(编辑模式保存) ===== */
    /* opts.tierPermit: 角色层级"普升通行证"(罗马数字层级字符串, 如 'Ⅱ')
       仅"开始进阶"按钮传入; 配合 辅助计算脚本 tierPermitAllows() 放行
       replaceMvuData 异步触发的二次 VARIABLE_UPDATE_ENDED 中的层级变化,
       否则异步事件落在 __samsaraUIMutation 窗口期之外, 会被变量守卫当 AI 篡改回滚 → 普升"闪一下又降回" */
    function writeBackMvu(mutator, opts) {
        var tierPermitInstalled = false;
        try {
            var win = getMvuGlobal();
            if (!win || !win.Mvu || typeof win.Mvu.getMvuData !== 'function' || typeof win.Mvu.replaceMvuData !== 'function') {
                console.warn('[主神终端] MVU写回API不可用');
                return false;
            }
            // 获取最新完整数据(含stat_data) —— 作为"更新前"快照(before)
            var mvuData = win.Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            if (!mvuData || !mvuData.stat_data) { console.warn('[主神终端] 无可写数据'); return false; }
            // 备份"更新前"数据(深拷贝, 供事件回调的 variables_before_update 参数使用)
            var before = (_ && _.cloneDeep) ? _.cloneDeep(mvuData) : JSON.parse(JSON.stringify(mvuData));
            // lodash深拷贝避免直接污染原对象(走replaceMvuData正式通道) —— 作为"更新后"数据(after)
            var cloned = (_ && _.cloneDeep) ? _.cloneDeep(mvuData) : JSON.parse(JSON.stringify(mvuData));
            // 应用修改器(在克隆的新数据上原地改)
            if (typeof mutator === 'function') mutator(cloned.stat_data);
            // 写入前设置晋升通行证，覆盖 replaceMvuData 同步/异步触发的守卫。
            //   replaceMvuData 是异步的, 它自己会再触发一次 VARIABLE_UPDATE_ENDED(不经过本函数),
            //   那次事件里 __samsaraUIMutation 已复位 → 守卫会回滚层级; 通行证覆盖该异步事件
            if (opts && opts.tierPermit) {
                try {
                    var permitObj = (win && typeof win === 'object') ? win : window;
                    permitObj.__samsaraTierPermit = opts.tierPermit;
                    if (GS_PARENT !== permitObj) GS_PARENT.__samsaraTierPermit = opts.tierPermit;
                    try { window.__samsaraTierPermit = opts.tierPermit; } catch(eT1) {}
                    tierPermitInstalled = true;
                } catch(eT2) {}
                // 兜底清除: 20s 后无论消费与否都过期(防止持久残留把守卫豁免变成摆设)
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
            // 写回 message 通道
            win.Mvu.replaceMvuData(cloned, { type: 'message', message_id: 'latest' });
            // 同步 chat 通道
            try { win.Mvu.replaceMvuData(cloned, { type: 'chat' }); } catch (e2) {}
            // ★ 关键: 手动广播 VARIABLE_UPDATE_ENDED 事件, 把 (after, before) 传给监听者
            //   这会让"辅助计算脚本"的 onUpdateData(after, before) 跑一遍, 后台重算属性/HP/EP
            //   事件签名见 exported.mvu.d.ts:186 -> (variables, variables_before_update) => void
            // ★ 标记本次更新来源为"UI操作", 供辅助计算脚本跳过战斗轮次推进/冷却递减
            //   辅助计算脚本运行在iframe, 它通过 GS_PARENT(主窗口) 读此标志, 故必须写在 GS_PARENT 上
            //   同时双写到 win(若不同), 保险起见
            try {
                var evtName = win.Mvu.events && win.Mvu.events.VARIABLE_UPDATE_ENDED;
                if (evtName && typeof win.eventEmit === 'function') {
                    win.eventEmit(evtName, cloned, before);
                } else if (evtName && typeof eventEmit === 'function') {
                    eventEmit(evtName, cloned, before);
                }
            } catch (e3) { console.warn('[主神终端] 广播VARIABLE_UPDATE_ENDED失败:', e3.message); }
            // 事件回调同步执行完毕后, 立即清除标志(eventEmit 同步触发 onUpdateData, 返回后即安全)
            try {
                GS_PARENT.__samsaraUIMutation = false;
                if (win !== GS_PARENT) win.__samsaraUIMutation = false;
            } catch(e6) { try { window.__samsaraUIMutation = false; } catch(e7){} }
            try { console.log('%c[主神终端] ✅ 数据已写回MVU并广播更新事件', 'color:#86efac'); } catch(e){}
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
            console.error('[主神终端] 写回MVU失败:', e);
            return false;
        }
    }

    /* ===== 8. 工具函数 ===== */
    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function safeNum(v, def) { var n = Number(v); return Number.isFinite(n) ? n : (def || 0); }
    function safeStr(v, def) { return (v === null || v === undefined) ? (def || '') : String(v); }
    /* 编辑模式暂存: {path: {val, type}} —— 点击即编辑,失焦/回车暂存,统一保存写回 */
    var pendingEdits = {};
    function stageEdit(path, val, type) {
        if (!path) return;
        pendingEdits[path] = { val: val, type: type || 'text' };
    }
    /* 把处于编辑态的输入框还原为显示态(保留新值并暂存) */
    function flushStagedDisplay($el) {
        if (!$el || !$el.length) return;
        var path = $el.attr('data-path');
        if (!path) return;
        var type = $el.attr('data-type') || 'text';
        var val = $el.is('select') ? $el.val() : $el.val();
        if (type === 'number') { var n = Number(val); val = Number.isFinite(n) ? n : 0; }
        // ★ tags 类型(标签数组): 逗号/顿号分隔输入→拆为数组
        if (type === 'tags') {
            val = String(val).split(/[,，、]/).map(function(s){return s.trim();}).filter(Boolean);
            if (/^资产\.[^.]+\.所属对象$/.test(path)) {
                val = val.filter(function(owner, idx, arr){ return owner !== '无主' && arr.indexOf(owner) === idx; });
            }
        }
        // ★ json 类型(嵌套对象): 尝试还原为对象; 非法JSON保留原字符串(ZOD层会拒绝并回退)
        if (type === 'json') {
            var _jt = String(val).trim();
            if (_jt === '') val = {};
            else { try { val = JSON.parse(_jt); } catch(e2) {} }
        }
        // ★ 身份仍为字符串数组(逗号/斜杠分隔输入→拆为数组); 职业已改为「以职业名为键的记录对象」,不再拆分
        if (path.indexOf('.身份') >= 0) {
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
        return (vs === '' ? '<span class="sam-ed-ph">空</span>' : esc(vs));
    }
    /* 显示态HTML: 文本 + ✎ 角标, 点击才变输入框(避免变形) */
    function editDisplayInnerTyped(val, type) {
        if (type === 'textarea' || type === 'json') {
            // 多行文本(JSON等): 用 <pre> 保留换行与缩进, 避免被折叠成一行"乱码"
            var vs = (val === null || val === undefined) ? '' : String(val);
            return (vs === '' ? '<span class="sam-ed-ph">空</span>' : '<pre class="sam-ed-pre">'+esc(vs)+'</pre>');
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
    /* 真正的输入框(仅在点击后插入, 失焦还原) */
    function editRealInputHtml(path, val, type) {
        var v = (val === null || val === undefined) ? '' : String(val);
        if (type === 'textarea' || type === 'json') {
            // 多行(职业JSON等): 较大默认可视行高+等宽字体
            return '<textarea class="sam-edit-input sam-edit-active" data-path="'+esc(path)+'" data-type="'+esc(type)+'" rows="8" style="width:100%;min-height:100px;resize:vertical;font-family:monospace;line-height:1.5;white-space:pre;">'+esc(v)+'</textarea>';
        }
        // tags 类型: 普通文本输入(逗号分隔), 暂存时拆数组
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
        // 精确匹配 F~SSS 枚举
        if (['F','E','D','C','B','A','S','SS','SSS'].indexOf(s) >= 0) return s;
        // 宽容解析: 兼容 "D级"/"S级"/"SSS级" 等带"级"后缀的变体(多字母档位从长到短匹配, 防止 SSS 被截成 S)
        var m = s.match(/^(SSS|SS|S|A|B|C|D|E|F)\s*级?$/);
        return m ? m[1] : 'E';
    }
    /* 生命层级(Ⅰ~Ⅸ) ↔ 品质字母(F~SSS) 双向映射: 罗马数字用于显示文本, 品质字母用于着色CSS类
       两序列各9档, 一一对应: Ⅰ↔F Ⅱ↔E Ⅲ↔D Ⅳ↔C Ⅴ↔B Ⅵ↔A Ⅶ↔S Ⅷ↔SS Ⅸ↔SSS */
    var TIER_ROMAN = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'];
    var TIER_QUALITY = ['F','E','D','C','B','A','S','SS','SSS'];
    /* 生命层级单维属性加成区间上下限(与辅助计算脚本.LIFE_TIER_RANGE 对齐; 用于段位分判定)
       ★ 仅用于UI段位显示, 实际数值结算/截断在辅助计算脚本中完成 */
    var LIFE_TIER_RANGE = {
        'Ⅰ': [1, 29],     'Ⅱ': [30, 99],     'Ⅲ': [100, 299],
        'Ⅳ': [300, 999],  'Ⅴ': [1000, 2999], 'Ⅵ': [3000, 9999],
        'Ⅶ': [10000, 29999], 'Ⅷ': [30000, 99999], 'Ⅸ': [100000, Infinity]
    };
    /* 进阶试炼阈值: 五维段位分累计 ≥ 24 → 可申请进阶(约五维均达当前层级 B 段以上) */
    var TRIAL_SCORE_THRESHOLD = 24;
    /* 源力灌注普升费用：仅允许当前层级 → 下一层级，且必须消耗对应下一阶权限凭证×1。 */
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
    /* 规范化生命层级(大层级)为 Ⅰ~Ⅸ; 非法值回落 Ⅰ */
    function normalizeLifeTier(t) {
        var s = String(t || '').trim();
        return TIER_ROMAN.indexOf(s) >= 0 ? s : 'Ⅰ';
    }
    /* 单维属性值 → 当前层级下的段位分(F=1 … SSS=9), 与辅助计算脚本.attrTierScore 逻辑一致
       取当前层级 LIFE_TIER_RANGE [lo,hi], 9 等分; 属性值落在第几段即该段分
       低于 lo 保底 1 分(F); 达到/超过 hi 满分 9 分(SSS)
       层级 Ⅸ 上限 Infinity → 用 lo*10(100万)作分段上限基准 */
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
    /* 段位分(1~9) → 品质字母(F~SSS), 用于显示与着色 */
    function scoreToQuality(score) {
        var i = Math.max(0, Math.min(8, Math.floor(safeNum(score, 1)) - 1));
        return TIER_QUALITY[i];
    }
    /* 计算五维在当前层级下的段位分累计(力量+敏捷+体质+精神+魅力), 用于进阶进度条 */
    function calcTrialScore(fa, lifeTier) {
        var attrs = fa || {};
        var total = 0;
        ['力量','敏捷','体质','精神','魅力'].forEach(function(an) {
            total += attrTierScore(attrs[an], lifeTier);
        });
        return total;
    }
    // SOURCE_INFUSION_CREDENTIAL_START
    /* 权限凭证持有数：只读取角色.权限凭证.<品质>。 */
    function sourceInfusionCredentialQty(reincarnator, credentialGrade) {
        if (!reincarnator || !credentialGrade) return 0;
        var ledger = reincarnator.权限凭证 || {};
        return Math.max(0, Math.floor(safeNum(ledger[credentialGrade], 0)));
    }

    /* 消耗恰好1枚指定品质凭证；凭证为独立数值账本，不再从道具/状态中查找。 */
    function sourceInfusionConsumeCredential(reincarnator, credentialGrade) {
        if (!reincarnator || !credentialGrade) return false;
        reincarnator.权限凭证 = reincarnator.权限凭证 || {};
        var q = Math.max(0, Math.floor(safeNum(reincarnator.权限凭证[credentialGrade], 0)));
        if (q < 1) return false;
        reincarnator.权限凭证[credentialGrade] = q - 1;
        return true;
    }
    // SOURCE_INFUSION_CREDENTIAL_END    /* 统一生成一次“当前层级→下一层级”的源力灌注计划；绝不按凭证品质跳级。 */
    function sourceInfusionPlan(sd, targetName) {
        if (!sd || !sd.角色) return { error:'数据未就绪' };
        var isReincarnator = (targetName === '角色');
        var target = isReincarnator ? sd.角色 : (sd.关系列表 && sd.关系列表[targetName]);
        if (!target) return { error:'未找到目标角色' };
        if (!isReincarnator && target.是否队友 !== true) return { error:'仅队友可使用源力灌注' };
        if (sd.系统状态 && sd.系统状态.是否战斗中 === true) return { error:'请在安全区域内再重新尝试' };
        if (isReincarnator && sd.系统状态 && sd.系统状态.试炼已完成 === true) return { error:'晋升试炼已完成，请直接使用「开始进阶」' };

        var currentTier = normalizeLifeTier(target.层级);
        var idx = TIER_ROMAN.indexOf(currentTier);
        if (idx < 0) idx = 0;
        if (idx >= TIER_ROMAN.length - 1) return { error:'当前已是最高层级' };
        var score = calcTrialScore(target.最终属性 || {}, currentTier);
        if (score < TRIAL_SCORE_THRESHOLD) return { error:'段位累计尚未满足普升要求' };

        var nextTier = TIER_ROMAN[idx + 1];
        var nextGrade = TIER_QUALITY[idx + 1];
        var credentialName = nextGrade + '级权限凭证';
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
            coin: safeNum(sd.角色.空间币, 0),
            credentialQty: sourceInfusionCredentialQty(sd.角色, nextGrade)
        };
    }

    function sourceInfusionFmtNum(v) {
        var n = Math.max(0, Math.floor(safeNum(v, 0)));
        return n.toLocaleString ? n.toLocaleString() : String(n);
    }

    function openSourceInfusion(targetName) {
        targetName = targetName || '角色';
        var first = sourceInfusionPlan(getStatData(), targetName);
        if (first.error) { samToast('warning', first.error); return; }
        var label = first.isReincarnator ? '角色' : first.targetName;
        var body = '目标: '+label+' '+first.currentTier+' → '+first.nextTier+'（'+first.nextGrade+'）'
            +' ｜ 空间币: '+sourceInfusionFmtNum(first.cost)+'（持有 '+sourceInfusionFmtNum(first.coin)+'）'
            +' ｜ 凭证: '+first.credentialName+' ×1（持有 ×'+first.credentialQty+'）'
            +' ｜ 确认后由角色账户支付，并直接完成本次普升。';
        samConfirm('源力灌注 · '+first.currentTier+' → '+first.nextTier, body, function() {
            var latest = sourceInfusionPlan(getStatData(), targetName);
            if (latest.error) { samToast('warning', latest.error); return; }
            if (latest.coin < latest.cost) {
                samToast('warning', '空间币不足：需要 '+sourceInfusionFmtNum(latest.cost));
                return;
            }
            if (latest.credentialQty < 1) {
                samToast('warning', '缺少 '+latest.credentialName+' ×1');
                return;
            }

            var applied = false;
            var opts = latest.isReincarnator ? { tierPermit: latest.nextTier } : undefined;
            var ok = writeBackMvu(function(statData) {
                var check = sourceInfusionPlan(statData, targetName);
                if (check.error || check.nextTier !== latest.nextTier || check.nextGrade !== latest.nextGrade) return;
                if (check.coin < check.cost || check.credentialQty < 1) return;
                var payer = statData.角色;
                var target = check.isReincarnator ? payer : (statData.关系列表 && statData.关系列表[check.targetName]);
                if (!target || (!check.isReincarnator && target.是否队友 !== true)) return;
                if (!sourceInfusionConsumeCredential(payer, check.credentialGrade)) return;
                payer.空间币 = Math.max(0, safeNum(payer.空间币, 0) - check.cost);
                target.层级 = check.nextTier;
                var receiptActor = check.isReincarnator ? '角色' : check.targetName;
                shopAppendReceipt(statData, '[普升]['+receiptActor+'] 源力灌注：'+check.currentTier+' → '+check.nextTier+'｜消耗 '+sourceInfusionFmtNum(check.cost)+'空间币、'+check.credentialName+'×1');
                if (check.isReincarnator && statData.系统状态) statData.系统状态.试炼已完成 = false;
                applied = true;
            }, opts);
            if (ok && applied) {
                samToast('success', label+' 已通过源力灌注提升至 '+latest.nextTier+' 级');
                renderAll();
            } else {
                samToast('error', '源力灌注失败，资源或角色状态已发生变化');
            }
        });
    }

    /* 取层级显示文本(罗马数字); 兼容旧数据中存的品质字母→转对应罗马数字; 非法值回落 Ⅰ */
    function tierRomanOf(raw) {
        var s = String(raw || '').trim();
        var i = TIER_ROMAN.indexOf(s);
        if (i >= 0) return s;
        i = TIER_QUALITY.indexOf(s.toUpperCase());
        if (i >= 0) return TIER_ROMAN[i];
        return 'Ⅰ';
    }
    /* 取层级品质色阶(F~SSS, 用于CSS q-class着色); 兼容旧数据中的品质字母; 非法值回落 F */
    function tierQOfClass(raw) {
        var s = String(raw || '').trim();
        var i = TIER_ROMAN.indexOf(s);
        if (i >= 0) return TIER_QUALITY[i];
        i = TIER_QUALITY.indexOf(s.toUpperCase());
        if (i >= 0) return s.toUpperCase();
        return 'F';
    }
    /* 层级显示源值：当前形态激活(激活===true 且名称非空)且形态层级 > 自身层级时，
       返回形态层级；否则返回自身层级。仅用于UI显示（绝不写回数据）。
       判定规则与各渲染函数里已有的 formActive / npcFormName 判定一致。
       形态变身结束后 当前形态.激活 不再为 true → 自动回落到自身层级显示。 */
    function displayTierRaw(char) {
        var ownRaw = (char && char.层级 != null) ? char.层级 : '';
        var cf = char && char.当前形态 ? char.当前形态 : null;
        if (!cf || cf.激活 !== true || !safeStr(cf.名称)) return ownRaw;
        var entry = char.形态库 && char.形态库[cf.名称];
        if (!entry || typeof entry !== 'object') return ownRaw;
        var fTierRaw = (entry.层级 != null) ? entry.层级 : entry.品质;  // 旧存档可能用 品质 字段兜底
        var ownIdx = TIER_ROMAN.indexOf(tierRomanOf(ownRaw));     // 归一为 Ⅰ~Ⅸ 索引
        var formIdx = TIER_ROMAN.indexOf(tierRomanOf(fTierRaw));
        if (formIdx > ownIdx) return fTierRaw;  // 形态层级更高 → 显示形态层级
        return ownRaw;                          // 形态层级 ≤ 自身 → 显示自身层级
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
        // 重建style块(变量+固定CSS)
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
        // 进入/退出编辑模式时清空暂存, 避免脏数据
        pendingEdits = {};
    }

    /* ===== 9. CSS 注入(含多主题变量) ===== */
    function buildCSS(th, themeKey) {
        var isLight = (themeKey === 'parchment');
        return `
        :root {
            --sam-accent: ${th.accent};
            --sam-hp: ${th.hp}; --sam-thp: ${th.thp}; --sam-ep: ${th.ep};
            --sam-bg: ${th.bg}; --sam-card: ${th.card}; --sam-dark: ${th.dark};
            --sam-border: ${th.border}; --sam-text: ${th.text}; --sam-sub: ${th.sub};
            /* 品质/层级色: 基础冷色→高阶暖色→破格霓虹 (F~SSS 九档, 品质徽章/层级字母/卡片边框统一引用) */
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
        /* 中等屏幕: 居中显示(不贴右) */
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

        /* 顶栏 */
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

        /* 中部:角色条(左头像列+层级/种族/形态 / 右HP+EP+THP三栏 纯色) */
        .sam-reincarnator { display:flex; padding:8px 12px; gap:10px; border-bottom:1px solid var(--sam-border); flex-shrink:0; align-items:center; }
        .sam-reincarnator-left { display:flex; align-items:center; gap:10px; flex:0 1 auto; min-width:0; }
        /* 头像: 大头像, 空态点击=上传, 有图点击=放大, 右上角✎按钮=上传 */
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
        /* 战斗状态徽章: 红色脉冲, 平时不渲染(由JS按 是否战斗中 输出) */
        .sam-reincarnator-combat { align-self:flex-start; display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:bold; color:#fff; background:linear-gradient(135deg, rgba(228,88,125,0.92), rgba(170,38,66,0.9)); border:1px solid var(--sam-hp); border-radius:10px; padding:2px 10px; letter-spacing:0.5px; box-shadow:0 0 8px rgba(228,88,125,0.5); animation:samCombatPulse 1.4s ease-in-out infinite; }
        @keyframes samCombatPulse { 0%,100% { box-shadow:0 0 7px rgba(228,88,125,0.45); } 50% { box-shadow:0 0 16px rgba(228,88,125,0.85); } }
        /* 层级: 品质描边徽章(文字色由 .q-X 提供, 边框跟随 currentColor) - 独立成行
           固定深色底保证浅色主题下浅色品质文字(F/E)依旧高对比可读 */
        .sam-reincarnator-tier { align-self:flex-start; display:inline-flex; align-items:baseline; font-weight:900; line-height:1; color:var(--sam-accent); padding:3px 12px; border:2px solid currentColor; border-radius:9px; background:rgba(15,18,28,0.78); box-shadow:0 1px 4px rgba(0,0,0,0.35), inset 0 0 8px rgba(0,0,0,0.3); }
        .sam-reincarnator-tier-num { font-size:19px; text-shadow:0 1px 2px rgba(0,0,0,0.65); }
        .sam-reincarnator-tier-suf { font-size:11px; opacity:0.8; margin-left:1px; text-shadow:0 1px 2px rgba(0,0,0,0.65); }
        /* 种族: 次要标签 - 独立成行 */
        .sam-reincarnator-race { align-self:flex-start; display:inline-flex; align-items:center; font-size:12px; font-weight:bold; color:var(--sam-text); line-height:1.2; padding:3px 9px; background:rgba(255,255,255,0.05); border:1px solid var(--sam-border); border-radius:8px; }
        /* 形态: 金色发光标签 */
        .sam-reincarnator-form { align-self:flex-start; display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:bold; color:var(--sam-thp); line-height:1.2; padding:2px 9px; background:rgba(229,193,102,0.1); border:1px solid rgba(229,193,102,0.4); border-radius:8px; box-shadow:0 0 7px rgba(229,193,102,0.18); }
        .sam-reincarnator-form-name { font-size:13px; }
        /* 右侧HP/EP/THP三排 */
        /* 右侧HP/EP/THP三排 */
        .sam-reincarnator-bars { 
            flex: 1 1 auto;             /* 允许伸缩，自动填充剩余空间 */
            display: flex; 
            flex-direction: column; 
            gap: 5px; 
            min-width: 150px;           /* 设定一个最小宽度，防止被左侧挤没 */
            max-width: 210px;           /* 👈 核心修改：将最大宽度限制在 200px 左右，这就是黄金比例 */
            margin-left: auto;          /* 把它推到最右侧 */
        }
        .sam-reincarnator-bars .stat-bar-box { min-width: 0; }
        .stat-labels { display:flex; justify-content:space-between; font-size:11px; font-weight:bold; margin-bottom:2px; color:var(--sam-sub); }
        .bar-track { width:100%; height:13px; background:var(--sam-dark); border-radius:6px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.08); }
        .bar-fill { height:100%; position:absolute; top:0; left:0; border-radius:6px; transition:width 0.5s cubic-bezier(0.2,0.8,0.2,1); }
        .fill-hp { background:var(--sam-hp); z-index:1; }
        .fill-thp { background:var(--sam-thp); z-index:2; opacity:0.85; box-shadow:0 0 6px var(--sam-thp); }
        .fill-ep { background:var(--sam-ep); }
        .fill-thp2 { background:var(--sam-thp); }
        /* THP行(顶部角色): 临时护盾/额外生命值, 无进度条, 外框包裹, 略向下偏移 */
        .sam-thp-row { margin-top:3px; padding:5px 10px; border:1px solid var(--sam-thp); border-radius:6px; background:rgba(255,255,255,0.04); }
        .sam-thp-row .stat-labels { margin-bottom:0; }
        /* THP行(NPC): 外框包裹, 标签可完整显示 */
        .sam-npc-thp-row { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:3px 8px; border:1px solid var(--sam-thp); border-radius:5px; background:rgba(255,255,255,0.04); margin-top:3px; }
        .sam-npc-thp-row .lbl { font-size:10px; font-weight:bold; color:var(--sam-thp); }
        .sam-npc-thp-row .num { font-size:11px; color:var(--sam-text); font-weight:bold; }
        /* 层级进度条: 左当前层级 / 中总点+进度条 / 右下一层级 */
        .sam-tier-prog { display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--sam-hover); border-radius:8px; border:1px solid var(--sam-border); margin-bottom:8px; }
        .sam-tier-side { font-size:18px; font-weight:900; color:var(--sam-accent); min-width:34px; text-align:center; line-height:1; }
        .sam-tier-side.next { color:var(--sam-sub); opacity:0.7; }
        .sam-tier-side.max { color:var(--sam-hp); }
        .sam-tier-mid { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
        .sam-tier-sum { font-size:11px; color:var(--sam-sub); font-weight:bold; display:flex; justify-content:space-between; }
        .sam-tier-sum .v { color:var(--sam-text); }
        .sam-tier-bar { width:100%; height:14px; background:var(--sam-dark); border-radius:7px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.1); }
        .sam-tier-bar .bar-fill { background:linear-gradient(90deg, var(--sam-accent), var(--sam-hp)); box-shadow:0 0 8px var(--sam-accent); }
        /* 进阶按钮: 由辅助计算脚本维护的“是否可试炼”控制；源力灌注与申请进阶并列。 */
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
        /* 副本成就: 已达成卡片金色描边高亮 + 头部达成徽章 */
        .sam-ach-item.done .sam-full-card { border-left-color:#d4af37; box-shadow:0 0 8px rgba(212,175,55,0.25); }
        .sam-ach-item.done .sam-fc-title { color:var(--sam-thp, #e5c166); }
        .sam-ach-done-chip { flex:0 0 auto; font-size:10px; font-weight:900; color:#d4af37; border:1px solid rgba(212,175,55,0.55); background:rgba(212,175,55,0.12); border-radius:8px; padding:1px 8px; white-space:nowrap; letter-spacing:0.5px; }
        /* 血统/形态/技能卡片删除按钮: 编辑模式显示在卡片头部右侧 */
        .sam-fc-del-btn { margin-left:auto; width:22px; height:22px; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; font-size:13px; line-height:1; cursor:pointer; color:var(--sam-hp); background:rgba(228,72,72,0.12); border:1px solid rgba(228,72,72,0.45); border-radius:6px; transition:all 0.18s; }
        .sam-fc-del-btn:hover { background:var(--sam-hp); color:#fff; box-shadow:0 0 8px rgba(228,72,72,0.6); }
        @media (max-width:768px) {
            /* 手机端 tier 进度条紧凑化(面板主适配规则在下方 @media max-width:768px 统一处理) */
            .sam-tier-prog { padding:6px 8px; gap:6px; }
            .sam-tier-side { font-size:15px; min-width:28px; }
            .sam-tier-bar { height:11px; }
        }
        /* 战术栏穿戴槽位信息栏: 各类型 当前数/上限; 未满白/满绿/超限红(整个字段变色) */
        .sam-slots-bar { display:flex; flex-wrap:wrap; gap:4px 8px; padding:6px 10px; background:var(--sam-hover); border-radius:8px; border:1px solid var(--sam-border); margin-bottom:8px; }
        .sam-slot-chip { font-size:11px; color:var(--sam-text); font-weight:bold; white-space:nowrap; }
        .sam-slot-chip.full { color:#4ade80; }      /* 满: 绿 */
        .sam-slot-chip.over { color:var(--sam-hp); } /* 超限: 红 */
        /* 立绘放大查看器 — 全屏 + dvh/safe-area，避免刘海/底栏裁切 */
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

        /* 底部状态按钮条(状态名+持续时间, 点击弹二级详情) —— 强制单行横向滚动, 状态再多也不换行/不竖排 */
        .sam-buff-rail { display:flex; flex-wrap:nowrap; gap:5px; padding:6px 12px; border-bottom:1px solid var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; background:var(--sam-card); -webkit-overflow-scrolling:touch; white-space:nowrap; }
        .sam-buff-rail::-webkit-scrollbar { height:4px; }
        .sam-buff-rail::-webkit-scrollbar-track { background:transparent; }
        .sam-buff-rail::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:2px; }
        /* 商城面板: 顶部紧凑余额条 */
        .sam-shop-coin-mini { display:flex; align-items:center; justify-content:center; gap:6px; padding:4px 10px; background:linear-gradient(135deg, rgba(212,175,55,0.12), rgba(255,247,214,0.06)); border:1px solid rgba(229,193,102,0.4); border-radius:16px; font-size:12px; color:var(--sam-thp); margin-bottom:6px; line-height:1.2; }
        .sam-shop-coin-mini .lbl { font-weight:normal; color:var(--sam-sub); opacity:0.85; }
        .sam-shop-coin-mini .val { font-weight:900; text-shadow:0 0 6px rgba(229,193,102,0.5); }
        .sam-shop-credential-mini { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:5px; padding:5px 8px; margin-bottom:6px; background:rgba(143,159,255,0.06); border:1px solid var(--sam-border); border-radius:8px; font-size:11px; line-height:1.25; }
        .sam-shop-credential-mini .lbl { color:var(--sam-sub); margin-right:2px; }
        .sam-shop-credential-chip { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border:1px solid var(--sam-border); border-radius:10px; color:var(--sam-accent); background:var(--sam-card); font-weight:800; }
        .sam-shop-credential-empty { color:var(--sam-sub); opacity:0.75; }
        .sam-shop-warn { font-size:12px; color:var(--sam-hp); padding:8px 10px; background:rgba(228,88,125,0.10); border:1px solid rgba(228,88,125,0.35); border-radius:6px; margin-bottom:8px; line-height:1.5; }
        .sam-shop-ok { font-size:12px; color:#56bf7b; padding:8px 10px; background:rgba(86,191,123,0.10); border:1px solid rgba(86,191,123,0.35); border-radius:6px; margin-bottom:8px; line-height:1.5; }
        /* 商城入口: 输入框独占一排(手机端不被挤窄); 目标下拉框 + 刷新按钮占下一排 */
        .sam-shop-entry { display:flex; flex-direction:column; gap:8px; }
        .sam-shop-entry .sam-shop-req { width:100%; box-sizing:border-box; background:var(--sam-input-bg, rgba(0,0,0,0.25)); border:1px solid var(--sam-border); border-radius:6px; padding:8px 10px; font-size:12px; color:var(--sam-fg, #d1d8e0); outline:none; transition:border-color 0.15s, box-shadow 0.15s; }
        .sam-shop-entry .sam-shop-req:focus { border-color:var(--sam-thp, #e5c166); box-shadow:0 0 0 2px rgba(229,193,102,0.18); }
        .sam-shop-entry .sam-shop-req::placeholder { color:var(--sam-sub, #7a8499); opacity:0.9; }
        .sam-shop-entry-actions { display:flex; align-items:stretch; gap:8px; flex-wrap:wrap; }
        .sam-shop-refresh-btn { flex:1 1 auto; display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:0 14px; border:1px solid rgba(229,193,102,0.5); border-radius:6px; background:linear-gradient(135deg, rgba(212,175,55,0.18), rgba(255,247,214,0.08)); color:var(--sam-thp, #e5c166); font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:transform 0.15s, box-shadow 0.15s, background 0.15s; }
        .sam-shop-refresh-btn:hover { transform:translateY(-1px); box-shadow:0 3px 8px rgba(229,193,102,0.25); background:linear-gradient(135deg, rgba(212,175,55,0.28), rgba(255,247,214,0.14)); }
        .sam-shop-refresh-btn:active { transform:translateY(0); }
        .sam-shop-refresh-btn[disabled] { opacity:0.5; cursor:not-allowed; transform:none; box-shadow:none; }
        /* ★ 多角色商城: 目标角色下拉框 */
        .sam-shop-entry .sam-shop-actor-select { flex:0 0 auto; min-width:92px; max-width:140px; background:var(--sam-input-bg, rgba(0,0,0,0.25)); border:1px solid var(--sam-border); border-radius:6px; padding:6px 8px; font-size:12px; color:var(--sam-fg, #d1d8e0); outline:none; cursor:pointer; }
        .sam-shop-actor-select:focus { border-color:var(--sam-thp, #e5c166); box-shadow:0 0 0 2px rgba(229,193,102,0.18); }
        .sam-shop-actor-select[disabled] { opacity:0.5; cursor:not-allowed; }
        .sam-shop-actor-label { flex:0 0 auto; align-self:center; font-size:11px; color:var(--sam-sub, #7a8499); white-space:nowrap; }
        /* "停止刷新"按钮: 仅在刷新中表示层显示, 用于打破卡死的AI请求 */
        .sam-shop-stop-btn { margin-top:4px; padding:7px 14px; border:1px solid rgba(228,72,72,0.55); border-radius:6px; background:linear-gradient(135deg, rgba(228,72,72,0.18), rgba(255,180,180,0.06)); color:#ffb3b3; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:transform 0.15s, box-shadow 0.15s, background 0.15s; }
        .sam-shop-stop-btn:hover { transform:translateY(-1px); box-shadow:0 3px 8px rgba(228,72,72,0.28); background:linear-gradient(135deg, rgba(228,72,72,0.28), rgba(255,180,180,0.12)); }
        .sam-shop-stop-btn:active { transform:translateY(0); }
        /* ===== 商城市场区(刷新商品后展示) ===== */
        /* 区域Tab条: 装备|道具|技能|血统 */
        .sam-shop-tabs { display:flex; flex-wrap:nowrap; gap:4px; padding:6px 4px; border-bottom:1px solid var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; -webkit-overflow-scrolling:touch; }
        .sam-shop-tabs::-webkit-scrollbar { height:3px; }
        .sam-shop-tab { flex:0 0 auto; padding:5px 12px; font-size:12px; color:var(--sam-sub); background:transparent; border:1px solid transparent; border-radius:14px; cursor:pointer; white-space:nowrap; transition:all 0.15s; line-height:1.2; }
        .sam-shop-tab:hover { color:var(--sam-accent); }
        .sam-shop-tab.active { color:#0d1220; background:var(--sam-accent); border-color:var(--sam-accent); box-shadow:0 0 10px rgba(143,159,255,0.3); font-weight:bold; }
        .sam-shop-tab .sam-shop-tab-cnt { font-size:10px; opacity:0.75; margin-left:2px; }
        /* 持有面板子Tab条: 战术栏|装备背包|道具背包|仓库 (四等分卡片式) */
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
        /* 持有面板专属分类行: 每个子Tab下方按物品类型二次筛选(全部+已有类型); 背包为空时内容为空不占位 */
        .sam-hold-types-wrap:empty { display:none; margin:0; padding:0; }
        /* 分类行: 强制单行横向滚动(类型再多也不换行/不竖排), 左右留padding避免首尾胶囊阴影被裁切 */
        .sam-hold-types { display:flex; flex-wrap:nowrap; gap:4px; padding:2px 10px 8px; margin-bottom:4px; border-bottom:1px dashed var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; -webkit-overflow-scrolling:touch; }
        /* 注意: 此处不可写 scrollbar-width(thin等), Chromium 121+ 会因此忽略 ::-webkit-scrollbar 自定义样式而回退系统灰滚动条 */
        .sam-hold-types::-webkit-scrollbar { height:4px; }
        .sam-hold-types::-webkit-scrollbar-track { background:transparent; }
        .sam-hold-types::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:2px; }
        .sam-hold-type { flex:0 0 auto; display:inline-flex; align-items:center; gap:3px; padding:3px 10px; font-size:11px; color:var(--sam-sub); background:transparent; border:1px solid transparent; border-radius:12px; cursor:pointer; white-space:nowrap; transition:all 0.15s; line-height:1.2; }
        .sam-hold-type:hover { color:var(--sam-accent); }
        .sam-hold-type.active { color:#0d1220; background:var(--sam-accent); border-color:var(--sam-accent); box-shadow:0 0 10px color-mix(in srgb, var(--sam-accent) 35%, transparent); font-weight:bold; }
        .sam-hold-type .sam-hold-type-cnt { font-size:10px; opacity:0.75; }
        /* 持有面板内容区 */
        .sam-hold-content { padding:2px 2px 6px; }
        .sam-hold-hint { display:inline-flex; align-items:center; gap:4px; font-size:10px; color:var(--sam-sub); background:rgba(0,0,0,0.25); border:1px solid var(--sam-border); border-radius:10px; padding:2px 9px; margin-bottom:8px; opacity:0.85; }
        /* 上方归类Tab条 + 中部list(滚动) + 底部购物车栏(常驻) 三段式固定布局 */
        .sam-shop-market { display:flex; flex-direction:column; gap:0; flex:1; min-height:0; }
        .sam-shop-tabs { flex-shrink:0; }
        .sam-shop-nav { display:flex; flex-direction:row; flex-wrap:nowrap; gap:4px; padding:6px 4px; border-bottom:1px solid var(--sam-border); overflow-x:auto; overflow-y:hidden; flex-shrink:0; -webkit-overflow-scrolling:touch; }
        .sam-shop-nav::-webkit-scrollbar { height:3px; }
        .sam-shop-nav-btn { flex:0 0 auto; display:flex; align-items:center; gap:4px; padding:5px 11px; font-size:12px; color:var(--sam-sub); background:transparent; border:1px solid transparent; border-radius:14px; cursor:pointer; white-space:nowrap; transition:all 0.15s; line-height:1.2; }
        .sam-shop-nav-btn:hover { color:var(--sam-accent); }
        .sam-shop-nav-btn.active { color:#0d1220; background:var(--sam-accent); border-color:var(--sam-accent); box-shadow:0 0 10px rgba(143,159,255,0.3); font-weight:bold; }
        .sam-shop-nav-btn .sam-shop-nav-cnt { font-size:10px; opacity:0.75; margin-left:2px; }
        /* 中部list: flex:1 占满剩余空间, 自身滚动 */
        .sam-shop-list { flex:1 1 auto; min-height:0; padding:8px 6px 12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; }
        .sam-shop-list::-webkit-scrollbar { width:5px; }
        .sam-shop-list::-webkit-scrollbar-thumb { background:var(--sam-border); border-radius:3px; }
        /* 刷新中提示(替代列表区) */
        .sam-shop-refreshing { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:20px; text-align:center; color:var(--sam-sub); font-size:13px; line-height:1.6; }
        .sam-shop-refreshing .sam-shop-refreshing-spin { font-size:24px; animation:sam-spin 1.2s linear infinite reverse; }
        @keyframes sam-spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
        /* 血统融合进行中: 🧬 放大缩小缓动(非旋转), 与商城刷新的旋转图标区分 */
        .sam-fusion-pulse { display:inline-block; font-size:26px; line-height:1; transform-origin:center; animation:samFusionPulse 1.4s ease-in-out infinite; }
        @keyframes samFusionPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.25); } }
        /* 商品卡片(参考 开局.html .item-card 选中/禁用模式) */
        .sam-shop-item { background:var(--sam-card); border:1px solid var(--sam-border); border-radius:8px; padding:10px; cursor:pointer; transition:all 0.15s; position:relative; overflow:visible; }
        .sam-shop-item::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sam-border); opacity:0; transition:opacity 0.15s; border-radius:8px 0 0 8px; }
        .sam-shop-item:hover:not(.disabled) { border-color:var(--sam-accent); transform:translateY(-1px); }
        .sam-shop-item:hover:not(.disabled)::before { opacity:0.6; }
        /* 选中态: 边框亮起(主题主色) + 辉光 + 左条加粗 */
        .sam-shop-item.selected { background:linear-gradient(180deg, var(--sam-card), rgba(0,0,0,0.04)); border-color:var(--sam-accent); box-shadow:0 0 0 1px var(--sam-border), 0 0 12px rgba(0,0,0,0.18); }
        .sam-shop-item.selected::before { background:var(--sam-accent); opacity:1; width:4px; }
        /* 右下角"已选"角标(默认隐藏, 选中时显示) */
        .sam-shop-item .sam-shop-sel-corner { position:absolute; right:-1px; bottom:-1px; background:var(--sam-accent); color:var(--sam-dark); font-size:10px; font-weight:bold; padding:2px 8px; border-top-left-radius:6px; border-bottom-right-radius:8px; box-shadow:0 0 6px rgba(0,0,0,0.25); display:none; letter-spacing:0.5px; line-height:1.4; }
        .sam-shop-item.selected .sam-shop-sel-corner { display:block; }
        /* 禁用态(余额不足): 灰调 + 不可点击 + hover无变化 */
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
        /* 形态/形态升级 技能子列表: 外层"技能(N)"折叠块(顶部分隔线) + 内层各技能子折叠块 */
        details.sam-shop-sk-list { margin-top:6px; }
        details.sam-shop-sk-list > .sam-fc-collapse-sum { border-top:1px dashed var(--sam-border); padding-top:4px; }
        details.sam-shop-sk-item { margin-bottom:4px; margin-left:6px; }
        details.sam-shop-sk-item > .sam-fc-collapse-sum { color:var(--sam-text); font-size:11px; }
        details.sam-shop-sk-item > .sam-fc-content { padding-left:6px; }
        .sam-shop-item-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; }
        .sam-shop-price { font-size:13px; font-weight:bold; color:var(--sam-thp, #e5c166); text-shadow:0 0 5px rgba(229,193,102,0.4); }
        /* 商城商品卡：结构化分区，效果逐条展示 */
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
        /* 底部购物车条: flex 末项常驻底部(不再用 sticky) */
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
        .sam-buff-chip.增益 { color:#56bf7b; border-color:#56bf7b; background:rgba(86,191,123,0.14); }
        .sam-buff-chip.减益 { color:var(--sam-hp); border-color:var(--sam-hp); background:rgba(228,88,125,0.14); }
        .sam-buff-chip.特殊 { color:var(--sam-accent); border-color:var(--sam-accent); background:rgba(143,159,255,0.14); }
        /* 编辑模式: 右侧预留删除按钮空间; 删除按钮在chip内缩成小圆点(覆盖sam-fc-del-btn默认22px) */
        .sam-buff-chip.is-edit { padding-right:16px; }
        .sam-buff-chip .sam-fc-del-btn { position:absolute; top:1px; right:1px; width:14px; height:14px; font-size:9px; line-height:1; margin:0; padding:0; border:none; border-radius:50%; z-index:3; }
        .sam-buff-empty { font-size:11px; color:var(--sam-sub); padding:4px 0; }

        /* Tab主体 — flex 滚动链需 min-height:0，否则展开后无法内部滚动 */
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

        /* 卡片/网格 */
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
        /* ===== 经营/资产: 每个资产一个可折叠栏目, 展开显示全部资料(精美排版) ===== */
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
        /* 概览区: 完整度进度条 / 规模点阵 / 类型 */
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
        /* 分节 */
        .sam-asset-sec { display:flex; flex-direction:column; gap:6px; }
        .sam-asset-sec-t { font-size:12px; font-weight:900; color:var(--sam-accent); padding-left:6px; border-left:3px solid var(--sam-accent); }
        .sam-asset-text { font-size:12px; color:var(--sam-text); line-height:1.6; white-space:pre-wrap; word-break:break-word; padding:6px 9px; background:rgba(0,0,0,0.16); border-radius:5px; }
        .sam-asset-none { color:var(--sam-sub); font-style:italic; opacity:0.7; }
        /* 能源 */
        .sam-asset-energy { display:flex; align-items:center; gap:8px; }
        .sam-asset-energy-num { flex:0 0 auto; font-size:11px; font-weight:bold; color:var(--sam-text); }
        /* 消耗单元 */
        .sam-asset-unit { padding:7px 9px; background:rgba(0,0,0,0.16); border-radius:5px; border-left:2px solid var(--sam-ep); display:flex; flex-direction:column; gap:5px; }
        .sam-asset-unit-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .sam-asset-unit-name { font-size:12px; font-weight:bold; color:var(--sam-text); }
        .sam-asset-unit-num { font-size:11px; color:var(--sam-sub); font-weight:bold; }
        .sam-asset-unit-bonus { margin-top:2px; }
        /* 标签 chips */
        .sam-asset-tags { display:flex; flex-wrap:wrap; gap:4px; }
        .sam-asset-tag { font-size:10px; padding:2px 8px; border-radius:9px; background:rgba(143,159,255,0.12); color:var(--sam-accent); border:1px solid rgba(143,159,255,0.22); }
        /* 建设序列 */
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
        /* 驻扎人员 */
        .sam-asset-staff { display:flex; flex-direction:column; gap:4px; }
        .sam-asset-staff-item { display:flex; justify-content:space-between; gap:8px; font-size:12px; padding:4px 9px; background:rgba(0,0,0,0.16); border-radius:5px; }
        .sam-asset-staff-name { color:var(--sam-text); font-weight:bold; }
        .sam-asset-staff-role { color:var(--sam-sub); }
        /* 待办事件 */
        .sam-asset-todo { display:flex; flex-direction:column; gap:4px; }
        .sam-asset-todo-item { font-size:12px; color:var(--sam-text); line-height:1.5; padding:5px 9px 5px 12px; position:relative; background:rgba(229,193,102,0.06); border-radius:5px; border-left:2px solid var(--sam-thp); }
        /* 待办事件可点击: 点击填入输入框 */
        .sam-asset-todo-item.clickable { display:flex; align-items:center; gap:6px; cursor:pointer; transition:background 0.15s, border-color 0.15s; }
        .sam-asset-todo-item.clickable:hover { background:rgba(229,193,102,0.18); border-left-color:var(--sam-hp); }
        .sam-asset-todo-item.clickable:active { transform:scale(0.98); }
        .sam-asset-todo-text { flex:1 1 auto; word-break:break-word; }
        .sam-asset-todo-go { flex:0 0 auto; font-size:11px; opacity:0.45; transition:opacity 0.15s; }
        .sam-asset-todo-item.clickable:hover .sam-asset-todo-go { opacity:1; }
        /* NPC单列卡片(关系面板) */
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
        /* 原生伸缩框(NPC在场面板折叠区) */
        .sam-npc-details { margin-top:6px; }
        .sam-npc-details > summary { font-size:11px; color:var(--sam-accent); cursor:pointer; padding:3px 6px; background:rgba(143,159,255,0.08); border-radius:4px; user-select:none; list-style:none; }
        .sam-npc-details > summary::-webkit-details-marker { display:none; }
        .sam-npc-details > summary::before { content:'▸ '; }
        .sam-npc-details[open] > summary::before { content:'▾ '; }
        .sam-npc-details[open] > summary { margin-bottom:4px; }
        /* NPC卡片内紧凑进度条(HP/EP/THP) */
        .sam-npc-bars { display:flex; flex-direction:column; gap:4px; margin:6px 0 4px; }
        .sam-npc-bar { display:flex; align-items:center; gap:6px; }
        .sam-npc-bar .lbl { font-size:10px; font-weight:bold; width:28px; flex-shrink:0; }
        .sam-npc-bar .trk { flex:1; height:9px; background:var(--sam-dark); border-radius:5px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); position:relative; }
        .sam-npc-bar .fl { height:100%; border-radius:5px; transition:width 0.5s cubic-bezier(0.2,0.8,0.2,1); }
        .sam-npc-bar .num { font-size:10px; color:var(--sam-sub); width:64px; text-align:right; flex-shrink:0; }
        /* NPC卡片字段网格(种族/身份等双列排版) */
        .sam-npc-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 12px; margin:4px 0; }
        .sam-npc-grid .sam-npc-row { font-size:11px; line-height:1.5; }
        .sam-npc-sec { height:0; margin:6px 0; border:0; border-top:1px solid rgba(143,159,255,0.16); padding:0; font-size:0; }
        /* 技能可伸缩分组(形态/血统技能用) */
        .sam-skill-group { margin:4px 0 6px; }
        .sam-skill-group > summary { font-size:12px; font-weight:bold; color:var(--sam-accent); cursor:pointer; padding:4px 8px; background:rgba(143,159,255,0.08); border-radius:4px; user-select:none; list-style:none; border-left:3px solid var(--sam-accent); }
        .sam-skill-group > summary::-webkit-details-marker { display:none; }
        .sam-skill-group > summary::before { content:'▸ '; }
        .sam-skill-group[open] > summary::before { content:'▾ '; }
        .sam-skill-group[open] > summary { margin-bottom:4px; }
        .sam-skill-group .sam-card-list { grid-template-columns:1fr; margin-top:4px; }
        /* ===== 详情弹窗精美排版 ===== */
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
        /* 传闻: 顶部一键删除全部 + 单条删除 + 交易按钮 */
        .sam-rumor-toolbar { display:flex; justify-content:flex-end; gap:6px; margin-bottom:6px; }
        .sam-rumor-clearall-btn { padding:4px 10px; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid var(--sam-hp); color:var(--sam-hp); background:rgba(228,88,125,0.10); cursor:pointer; }
        .sam-rumor-clearall-btn:hover { background:var(--sam-hp); color:#fff; }
        .sam-rumor-del-btn { flex:0 0 auto; width:20px; height:20px; border-radius:4px; border:1px solid var(--sam-hp); background:rgba(228,88,125,0.10); color:var(--sam-hp); cursor:pointer; font-size:12px; line-height:1; display:flex; align-items:center; justify-content:center; padding:0; }
        .sam-rumor-del-btn:hover { background:var(--sam-hp); color:#fff; }
        .sam-rumor-trade-btn { margin-left:6px; padding:1px 8px; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid var(--sam-thp); color:var(--sam-thp); background:rgba(229,193,102,0.10); cursor:pointer; }
        .sam-rumor-trade-btn:hover { background:var(--sam-thp); color:#1a1a1a; }
        .sam-rumor-price { display:inline-flex; align-items:center; gap:4px; }
        /* 确认弹窗: 宽度自适应 + 长文可滚 + 触控热区 */
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
        /* 世界稳定度：0~120，100为正常基准线。 */
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
        /* 经营面板空状态: 引导说明(能做什么/怎么获得), 替代干瘪的[无资产] */
        .sam-asset-empty { padding:18px 16px; color:var(--sam-sub); }
        .sam-asset-empty .ae-title { font-size:14px; font-weight:bold; color:var(--sam-text); text-align:center; margin-bottom:10px; }
        .sam-asset-empty .ae-desc { font-size:11.5px; line-height:1.7; color:var(--sam-sub); }
        .sam-asset-empty .ae-section { margin-top:12px; }
        .sam-asset-empty .ae-h { font-size:11.5px; font-weight:bold; color:var(--sam-accent); margin-bottom:4px; }
        .sam-asset-empty ul { margin:0; padding-left:16px; }
        .sam-asset-empty li { font-size:11.5px; line-height:1.7; color:var(--sam-sub); }
        .sam-asset-empty li b { color:var(--sam-text); font-weight:bold; }
        /* ===== NPC角色档案(详情弹窗专用, 替代通用dump式渲染) ===== */
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
        /* ===== 武器攻击面板(角色衍生属性 + NPC详情最终属性) ===== */
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
        /* ===== 物资转移弹窗(向在场NPC转移装备/道具) ===== */
        .sam-npc-transfer { position:absolute; top:4px; z-index:2; padding:3px 8px; font-size:10px; font-weight:bold; color:var(--sam-thp); background:rgba(229,193,102,0.12); border:1px solid rgba(229,193,102,0.4); border-radius:5px; cursor:pointer; line-height:1.4; white-space:nowrap; }
        .sam-npc-transfer:hover { background:rgba(229,193,102,0.28); box-shadow:0 0 8px rgba(229,193,102,0.3); }
        .sam-npc-loot { position:absolute; top:4px; z-index:2; padding:3px 8px; font-size:10px; font-weight:bold; color:#f87171; background:rgba(248,113,113,0.12); border:1px solid rgba(248,113,113,0.4); border-radius:5px; cursor:pointer; line-height:1.4; white-space:nowrap; }
        .sam-npc-loot:hover { background:rgba(248,113,113,0.28); box-shadow:0 0 8px rgba(248,113,113,0.3); }
        /* 转移列表：不再固定 50vh 嵌套滚动，交给 .sam-modal-body 单层滚 */
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

        /* 子Tab */
        .sam-subtabs { display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; }
        .sam-subtab { padding:4px 10px; font-size:11px; border-radius:4px; cursor:pointer; border:1px solid var(--sam-border); color:var(--sam-sub); background:var(--sam-card); }
        .sam-subtab:hover { color:var(--sam-text); }
        .sam-subtab.active { color:#fff; background:var(--sam-accent); border-color:var(--sam-accent); }

        /* 编辑器 */
        .sam-edit-field { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
        .sam-edit-label { font-size:11px; color:var(--sam-sub); min-width:70px; }
        .sam-edit-input { flex:1; background:var(--sam-input-bg); border:1px solid var(--sam-border); color:var(--sam-text); padding:3px 6px; border-radius:3px; font-size:12px; min-width:0; }
        .sam-edit-input:focus { outline:none; border-color:var(--sam-accent); box-shadow:0 0 4px var(--sam-accent); }
        .sam-edit-readonly { color:var(--sam-sub); font-style:italic; font-size:11px; }
        /* 点击即编辑: 显示态(文本+✎角标, 不变形) */
        .sam-ed-wrap { display:inline-flex; align-items:center; gap:2px; cursor:pointer; border-radius:3px; padding:0 3px; transition:background 0.12s; position:relative; max-width:100%; }
        .sam-ed-wrap:hover { background:rgba(143,159,255,0.14); }
        .sam-ed-wrap .sam-ed-val { color:var(--sam-text); font-weight:bold; word-break:break-word; overflow-wrap:anywhere; }
        .sam-ed-wrap .sam-ed-ph { color:var(--sam-sub); font-style:italic; font-weight:normal; opacity:0.7; }
        .sam-ed-wrap .sam-ed-ico { font-size:10px; color:var(--sam-sub); opacity:0; transition:opacity 0.12s; }
        .sam-ed-wrap:hover .sam-ed-ico { opacity:1; }
        .sam-ed-wrap.editing { background:rgba(143,159,255,0.10); }
        .sam-ed-wrap .sam-edit-active { flex:1; min-width:60px; max-width:100%; background:var(--sam-input-bg); border:1px solid var(--sam-accent); color:var(--sam-text); padding:2px 4px; border-radius:3px; font-size:12px; box-shadow:0 0 4px rgba(143,159,255,0.4); }
        .sam-ed-wrap .sam-edit-active[type="textarea"], .sam-ed-wrap textarea.sam-edit-active { width:100%; min-height:90px; resize:vertical; font-family:monospace; line-height:1.5; white-space:pre; }
        /* textarea 多行显示态(保留换行缩进, 避免JSON被折叠成乱码) */
        .sam-ed-wrap.pre-wrap { display:block; }
        .sam-ed-pre { display:block; margin:0; padding:6px 8px; background:var(--sam-hover); border:1px solid var(--sam-border); border-radius:4px; font-family:monospace; font-size:11px; line-height:1.5; white-space:pre-wrap; word-break:break-word; color:var(--sam-text); max-height:240px; overflow:auto; }
        .sam-ed-wrap .sam-edit-active:focus { outline:none; }
        .sam-ed-wrap .sam-edit-active[type="number"] { max-width:90px; }
        /* 在.card-meta等紧凑容器里也保持inline */
        .sam-card-meta .sam-ed-wrap, .sam-card-meta .sam-ed-val { display:inline; }
        .sam-edit-badge { position:fixed; top:8px; right:50%; transform:translateX(50%); background:var(--sam-accent); color:#fff; padding:3px 12px; border-radius:12px; font-size:11px; font-weight:bold; z-index:999999; box-shadow:0 0 10px var(--sam-accent); }
        .sam-save-btn { position:fixed; bottom:10px; left:10px; z-index:999999; padding:3px 9px; border-radius:10px; border:none; background:var(--sam-accent); color:#fff; font-size:10px; font-weight:bold; cursor:pointer; box-shadow:0 1px 6px rgba(0,0,0,0.4); }
        .sam-save-btn:hover { transform:scale(1.05); }
        /* NPC档案(弹窗内)编辑模式: 提示条 + 弹窗内保存按钮(modal 内 fixed 定位仍相对视口, 可用) */
        .sam-nd-edit-tip { margin:10px 0 4px; padding:5px 10px; font-size:11px; color:var(--sam-accent); background:rgba(143,159,255,0.10); border:1px dashed var(--sam-accent); border-radius:6px; text-align:center; }
        .sam-nd-save { position:static; display:block; margin:8px auto 2px; padding:6px 22px; font-size:12px; }
        .sam-nd-save:hover { transform:scale(1.06); }
        /* NPC档案编辑行: 值单元格内嵌编辑控件 */
        .sam-nd-row .v .sam-ed-wrap { font-weight:normal; }
        .sam-npc-bar .num-ed { display:inline-flex; align-items:center; gap:2px; min-width:54px; }
        .sam-npc-bar .num-ed .sam-ed-wrap .sam-ed-val { font-weight:bold; }
        .sam-npc-bar .mx.readonly { color:var(--sam-sub); font-size:11px; }
        /* 头部徽章区内嵌开关: 缩小开关尺寸避免撑爆 */
        .sam-nd-badge.edit-toggle { display:inline-flex; align-items:center; gap:4px; }
        .sam-nd-badge.edit-toggle .sam-toggle-switch { width:30px; height:15px; border-radius:8px; }
        .sam-nd-badge.edit-toggle .sam-toggle-switch .knob { width:11px; height:11px; top:2px; }
        .sam-nd-badge.edit-toggle .sam-toggle-switch.on .knob { left:17px; }
        /* 人物档案文本块内的 textarea 编辑控件占满块宽 */
        .sam-nd-block-ct .sam-ed-wrap { display:block; }
        .sam-nd-block-ct .sam-ed-wrap.pre-wrap { display:block; }
        .sam-nd-block-ct .sam-ed-pre { max-height:180px; }

        /* 弹窗(必须高于面板999998) — 遮罩不滚，仅 .sam-modal-body 单层滚动 */
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
        /* 内联完整资料卡片(装备/道具/技能/血统/形态) */
        .sam-full-card { padding:8px 10px; background:linear-gradient(180deg,var(--sam-card),rgba(0,0,0,0.15)); border:1px solid var(--sam-border); border-left:3px solid var(--sam-sub); border-radius:6px; margin-bottom:6px; transition:box-shadow 0.2s; }
        /* 单列列表(任务/传闻 一条一排) */
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
        /* 层级字母(顶部角色层级 / 进度条左右层级 / NPC层级): 按档着色, 与品质徽章同色板 */
        .sam-reincarnator-tier.q-F,.sam-tier-side.q-F,.sam-npc-tier.q-F,.sam-nd-tier.q-F { color:var(--sam-q-f); }
        .sam-reincarnator-tier.q-E,.sam-tier-side.q-E,.sam-npc-tier.q-E,.sam-nd-tier.q-E { color:var(--sam-q-e); }
        .sam-reincarnator-tier.q-D,.sam-tier-side.q-D,.sam-npc-tier.q-D,.sam-nd-tier.q-D { color:var(--sam-q-d); }
        .sam-reincarnator-tier.q-C,.sam-tier-side.q-C,.sam-npc-tier.q-C,.sam-nd-tier.q-C { color:var(--sam-q-c); }
        .sam-reincarnator-tier.q-B,.sam-tier-side.q-B,.sam-npc-tier.q-B,.sam-nd-tier.q-B { color:var(--sam-q-b); }
        .sam-reincarnator-tier.q-A,.sam-tier-side.q-A,.sam-npc-tier.q-A,.sam-nd-tier.q-A { color:var(--sam-q-a); }
        .sam-reincarnator-tier.q-S,.sam-tier-side.q-S,.sam-npc-tier.q-S,.sam-nd-tier.q-S { color:var(--sam-q-s); text-shadow:0 0 4px rgba(234,179,8,0.5); }
        .sam-reincarnator-tier.q-SS,.sam-tier-side.q-SS,.sam-npc-tier.q-SS,.sam-nd-tier.q-SS { color:var(--sam-q-ss); text-shadow:0 0 5px rgba(239,68,68,0.6); }
        .sam-reincarnator-tier.q-SSS,.sam-tier-side.q-SSS,.sam-npc-tier.q-SSS,.sam-nd-tier.q-SSS { color:var(--sam-q-sss); text-shadow:0 0 6px rgba(236,72,153,0.7); }
        /* ★ 职业记录渲染: 折叠面板 {职业名:{类型,特性[],来源}} */
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
        .sam-occ-sumtype.战斗 { color:#e57373; border-color:#e57373; }
        .sam-occ-sumtype.生活 { color:#66bb6a; border-color:#66bb6a; }
        .sam-occ-sumtype.辅助 { color:#7dbde0; border-color:#7dbde0; }
        .sam-occ-body { padding:8px 10px; display:flex; flex-direction:column; gap:8px; border-top:1px dashed var(--sam-border); }
        .sam-occ-card { padding:9px 12px; border:1px solid var(--sam-border); border-left:3px solid var(--sam-accent); border-radius:8px; background:var(--sam-bg); }
        .sam-occ-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .sam-occ-name { font-size:14px; font-weight:bold; color:var(--sam-text); }
        .sam-occ-type { font-size:10px; font-weight:bold; padding:2px 10px; border-radius:10px; border:1px solid; white-space:nowrap; }
        .sam-occ-type.战斗 { color:#e57373; border-color:#e57373; background:rgba(229,115,115,0.14); }
        .sam-occ-type.生活 { color:#66bb6a; border-color:#66bb6a; background:rgba(102,187,106,0.14); }
        .sam-occ-type.辅助 { color:#7dbde0; border-color:#7dbde0; background:rgba(125,189,224,0.14); }
        .sam-occ-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
        .sam-occ-tag { font-size:10px; padding:2px 9px; border-radius:10px; background:rgba(143,159,255,0.10); color:var(--sam-sub); border:1px solid rgba(143,159,255,0.18); }
        .sam-occ-src { font-size:10px; color:var(--sam-sub); margin-top:7px; padding-top:6px; border-top:1px dashed rgba(143,159,255,0.12); display:flex; align-items:center; gap:3px; }
        .sam-occ-inline { display:inline-flex; flex-wrap:wrap; gap:5px; align-items:center; }
        .sam-occ-chip { font-size:11px; padding:2px 4px 2px 8px; border-radius:10px; border:1px solid var(--sam-border); background:rgba(143,159,255,0.05); color:var(--sam-text); display:inline-flex; align-items:center; gap:5px; }
        .sam-occ-chip .sam-occ-sumtype { font-size:9px; padding:1px 5px; border-radius:7px; }
        /* ★ 职业结构化编辑器(编辑模式): 逐职业卡片+类型下拉+特性/来源输入+删除按钮+"添加职业"按钮 */
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
        /* 效果/描述 全宽块(标签在上, 内容左对齐独占整行) */
        .sam-fc-body { margin-top:4px; }
        .sam-fc-block { margin-bottom:5px; }
        .sam-fc-block .sam-fc-label { font-size:11px; font-weight:bold; color:var(--sam-sub); margin-bottom:2px; }
        .sam-fc-block .sam-fc-content { font-size:12px; color:var(--sam-text); text-align:left; line-height:1.6; word-break:break-word; white-space:pre-wrap; padding-left:2px; }
        .sam-fc-block .sam-fc-content.sam-fc-effects { padding-left:0; }
        /* 装备/道具操作按钮栏 */
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
        /* 效果对象分行显示 */
        .sam-effects { display:flex; flex-direction:column; gap:2px; align-items:flex-start; }
        .sam-effect-line { font-size:11px; color:var(--sam-text); padding:1px 0 1px 8px; border-left:2px solid var(--sam-border); line-height:1.4; text-align:left; }
        .sam-effect-line .ek { color:var(--sam-accent); font-weight:bold; }
        /* 标签 */
        .sam-tags { display:flex; gap:3px; flex-wrap:wrap; }
        .sam-tag { font-size:10px; padding:1px 5px; border-radius:3px; background:rgba(143,159,255,0.12); color:var(--sam-sub); border:1px solid var(--sam-border); }
        /* 数值徽章: 自适应多列, 容器变窄时自动从多列降到 1 列, 不再溢出右侧 */
        .sam-stat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(70px,1fr)); gap:4px; margin-top:4px; }
        .sam-stat-cell { text-align:center; padding:3px 2px; background:rgba(0,0,0,0.2); border-radius:3px; }
        /* 容器太窄时(手机/弹窗右栏)强制 2 列, 再窄则 1 列 */
        @media (max-width:480px) { .sam-stat-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:340px) { .sam-stat-grid { grid-template-columns:1fr; } }
        /* 持有面板 / 商城卡片网格: PC 端自动多列(220-260px 一卡), 手机端单列, 避免整宽过大或有空床宽 */
        .sam-list-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; }
        .sam-list-grid .sam-full-card { margin-bottom:0; }
        .sam-list-grid .sam-empty { grid-column:1/-1; }
        @media (max-width:768px) { .sam-list-grid { display:flex; flex-direction:column; gap:6px; } }
        /* 商城持有双栏(装备背包/道具背包 多项时 PC 双栏, 手机单列) */
        .sam-shop-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:8px; }
        .sam-shop-grid .sam-shop-item { margin-bottom:0; }
        @media (max-width:768px) { .sam-shop-grid { display:flex; flex-direction:column; gap:8px; } }
        .sam-stat-cell .sn { font-size:9px; color:var(--sam-sub); }
        .sam-stat-cell .sv { font-size:13px; font-weight:bold; color:var(--sam-text); }

        /* 设置弹窗 */
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

        /* ===== MVU 变量更新方式 ===== */
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

        /* ===== API 配置区块(移植自 Zsd网游论坛) ===== */
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
            /* 手机端：上下贴边自适应固定视口，内部由 .sam-tab-content 滚动 */
            /* 手机端: 上下贴边自适应固定视口, 内部由 .sam-tab-content 滚动。
               优先用 100dvh(动态视口高度)以避开浏览器地址栏/底部工具栏遮挡;
               不支持 dvh 的浏览器自动回退到 100vh 版本。同时显式给出 top/bottom,
               便于被 env(safe-area-inset-*) 兜住任务栏安全区。 */
            #samsara-panel {
                top: calc(8px + env(safe-area-inset-top, 0px)) !important;
                /* bottom 用 dvh 兜底而非 env(safe-area-inset-bottom): 浏览器工具栏/地址栏不属于
                   系统 safe-area, env() 测不到它; 用动态视口 dvh 自动收缩才能避开。
                   dvh 不支持时回退 vh(老浏览器 layout viewport, 至少不会被遮到看不见)。 */
                bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
                left: 0 !important; right: 0 !important;
                margin: 0 auto !important; width: 94vw !important; max-width: 440px !important;
                /* 高度顺序: vh 在前作 fallback, dvh 在后覆盖(支持时优先动态视口, 浏览器
                   地址栏/工具栏显隐会自动收缩面板高度, 不再被挡)。 */
                height: calc(100vh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
                height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
                min-height: 0 !important; max-height: none !important;
                border-radius: 12px !important;
            }
            /* 面板内部滚动容器同样对底部安全区补齐, 避免内容被浏览器底栏遮住 */
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
            /* 二级弹窗手机加固 */
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
        /* ===== 血统融合舱 UI ===== */
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

    /* ===== 10. 面板开关 ===== */
    function toggleSamsaraPanel() {
        var $panel = $('#samsara-panel');
        var $ball = $('#samsara-ball');
        var isOpen = $panel.hasClass('open');
        if (isOpen) {
            // 打开时写了内联 display:flex，仅 removeClass('open') 不会立刻隐藏
            // 以前空等 300ms 才 display:none，又没有退场动画，体感像卡了约 1 秒
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

    /* ===== 11. 拖拽系统(球+面板) ===== */
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

    /* ===== 13. 弹窗 ===== */
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
        // 停止按钮(.sam-shop-stop-btn, 通过 data-sam-act 分发): modal 在 body 之下独立于 #samsara-panel,
        // 故在 modal 自身追加分发委托(同 bloodFusionStop / shopStopRefresh), 与 panel 内同名委托解耦共存
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
        // 解绑所有可能残留的 modal 相关事件(防止 samConfirm 的遮罩点外关闭残留到下次 showModal 复用)
        $m.off('click.samModal').off('click.samModalBg').off('click.samConfirm').off('click.samConfirmBg');
    }

    /* ===== 血统融合：结果完全由正文 API 返回，前端只负责选择、等待与写回 ===== */
    /* bloodFusionBusy 仅锁定"血统相关"操作(打开融合舱/执行融合/购买商城血统),
       其他商城操作(切换区域Tab/选装备/道具/技能/刷新商品)不受影响 */
    var bloodFusionBusy = false;
    var bloodFusionShopItem = null;
    var bloodFusionActionActor = '角色'; // 本次融合的写入目标(面板入口=角色, 商店入口跟随 shopCurrentActor)
    var bloodFusionLastVals = { a: null, b: null }; // A/B 联动: 记录各方上次选中值, 用于撞值时交换
    var BLOODLINE_RANK = { F:1, E:2, D:3, C:4, B:5, A:6, S:7, SS:8, SSS:9 };
    function bloodFusionEntries(extra) {
        var sd = getStatData(), ctx = shopResolveCharacter(sd, shopCurrentActor);
        var ch = ctx.character || {};
        var blood = ch && ch.血统 || {};
        var list = [];
        Object.keys(blood).forEach(function(name) { list.push({ name:name, data:blood[name] || {}, owned:true }); });
        if (extra) list.push({ name:extra.name, data:extra, owned:false });
        return list;
    }
    function bloodFusionOption(entry, selected, hidden) {
        return '<option value="'+esc(entry.name)+'"'+(selected ? ' selected' : '')+(hidden ? ' hidden' : '')+'>'+esc(entry.name)+' · '+esc(entry.data.品质 || 'F')+'</option>';
    }
    /* 血统融合规则库: 同级 / 高低级 两套结果公式, 用于融合舱规则面板展示 + 前端概率算法 */
    var BLOOD_FUSION_RULES = {
        same: [ // 同级血统融合
            { name:'完美升阶', weight:20, cls:'r-good', list:['品质+1阶','五维补全至目标品质正常区间','A/B 双优质词条融合','若双方血统均具有形态倾向，可生成1个融合形态，形态层级与属性独立判定'] },
            { name:'瑕疵升阶', weight:35, cls:'r-mid', list:['品质+1阶','五维补全至目标品质最低区间','A/B 双普通词条融合','附加高危负面代价词条 1 条'] },
            { name:'变异觉醒', weight:30, cls:'r-mid', list:['品质不变','属性变化随融合度','清空双方所有词条','随机生成变异词条','根据融合结果判定是否觉醒新形态，形态层级与属性独立判定'] },
            { name:'基因崩溃', weight:15, cls:'r-bad', list:['A 保持原状','B 永久消耗','不产生收益'] }
        ],
        diff: [ // 高低级
            { name:'稳定强化', weight:35, cls:'r-good', list:['品质不变','五维增加 B 的 20%','融合 B 一条适配被动','若A/B血统存在形态，根据融合结果决定继承、改造，形态层级与属性独立判定'] },
            { name:'词条变异', weight:35, cls:'r-mid', list:['品质不变','属性保持 A 不变','词条能力重构'] },
            { name:'基因排斥', weight:20, cls:'r-bad', list:['品质不变','属性保持 A 不变','生成负面基因杂质词条'] },
            { name:'崩坏消散', weight:10, cls:'r-bad', list:['A 保持原状','B 永久消耗','不产生收益'] }
        ]
    };
    /* 前端概率算法: 按 weight 权重 roll 出一个确定结果(同步 '脚本/脚本测试.js' 算法)
       输入 mode='same'|'diff', 返回 BLOOD_FUSION_RULES[mode] 中的某个规则对象 {name, weight, list, cls} */
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
    /* 上一次前端 roll 出的结果(供 bloodFusionStart → bloodFusionBuildPrompt 传给 AI;
       AI 仅按此结果渲染血统数据, 禁止自行选择) */
    var bloodFusionResult = null;
    /* 本次融合正在消耗的血统名(A 与 B), 用于:
       1) 融合进行中: 升级区里"替换目标 = 这些血统"的升级卡片灰显锁定;
       2) 融合成功: 升级区里"替换目标 = 被删血统"的升级条目一并从商城升级列表删除
       (原血统已被融合消耗, 对应的旧升级服务失去意义) */
    var bloodFusionConsumedNames = [];
    /* 融合回合计数: 每次 bloodFusionStart +1, 旧 Promise 回调回合不匹配时丢弃结果(支持"停止融合"打断卡死请求);
       bloodFusionSnap 保存开始时已扣除的空间币与商品库快照, 供 bloodFusionStop / 失败时回滚 */
    var bloodFusionEpoch = 0;
    var bloodFusionSnap = null;
    /* 血统卡片预览(复用 fullCard, 只读): 质量/标签/原始属性/效果/描述 */
    function bloodFusionPreviewCardHtml(entry) {
        if (!entry) return '<div class="sam-fusion-preview-empty">— 无可用血统 —</div>';
        var b = entry.data || {}, q = parseRarity(b.品质);
        var rows = '', body = '<div class="sam-fc-body">';
        body += fcBody('标签', formatTags(b.标签 || [], '', false), 'sam-fc-tags');
        if (b.原始属性 && typeof b.原始属性 === 'object' && Object.keys(b.原始属性).length > 0) {
            body += fcBodyCollapsible('原始属性', formatStatGrid(b.原始属性, 3), 'sam-fc-stats', false);
        }
        body += fcBody('效果', formatEffects(b.效果 || {}, '', false), 'sam-fc-effects');
        body += fcBody('描述', esc(safeStr(b.描述)));
        body += '</div>';
        var badge = entry.owned ? '<span class="sam-fusion-owned-pill" style="font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(143,159,255,0.18);color:var(--sam-sub)">已持有</span>' : '<span class="sam-fusion-shop-pill" style="font-size:10px;padding:2px 6px;border-radius:8px;background:var(--sam-hp);color:#fff">商城商品</span>';
        return '<div class="sam-fusion-preview">'+fullCard(q, entry.name, rows, body, badge)+'</div>';
    }
    /* 规则面板: 按 mode=same/diff 渲染对应结果公式卡片网格 */
    function bloodFusionRulePanelHtml(mode) {
        var list = BLOOD_FUSION_RULES[mode] || [];
        var title = (mode === 'same') ? '同级融合 · 概率分布' : '高低级融合 · 概率分布';
        var cards = list.map(function(r) {
            var lis = r.list.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('');
            return '<div class="sam-fusion-rule-card '+r.cls+'">'
                + '<div class="rhead"><span class="rname">'+esc(r.name)+'</span><span class="rw">'+r.weight+'%</span></div>'
                + '<ul class="rlist">'+lis+'</ul>'
                + '</div>';
        }).join('');
        return '<div class="sam-fusion-rule">'
            + '<div class="sam-fusion-rule-title"><span class="name">'+esc(title)+'</span><span class="pill">前端按权重 roll · AI 仅渲染数据</span></div>'
            + '<div class="sam-fusion-rule-grid">'+cards+'</div></div>';
    }
    /* 取 entry 品质数值 */
    function bloodFusionRankOf(entry) {
        if (!entry || !entry.data) return 1;
        return BLOODLINE_RANK[String(entry.data.品质 || 'F').toUpperCase()] || 1;
    }
    /* 渲染融合舱内 A/B 下拉框(撞值交换 + 过滤规则, A/B 双向对称):
       - 本方当前选中项: selected + hidden(展开列表隐藏, select 仍显示当前值)
       - B 列 maxRank 约束: 品质 > maxRank(A 品质) 的项直接跳过(B 不得高于 A)
       - excludeName 对方当前同名项: 双方都仅当 A 与 B 当前同品质(同级)时显示 '(= 对方, 点击交换)',
         否则隐藏(同级才允许交换, 不同级时交换会让 B>A 违反 B≤A)
       规则总结: B 选项必须 ≤ A 品质; 同名同条血统不可同时被选 A 与 B;
                 A 与 B 同品质(同级)时, A/B 双方下拉都显示对方当前项作为撞值交换入口 */
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
                // 双方都仅当 A 与 B 同品质(同级)时才显示 '(= 对方, 点击交换)', 否则隐藏
                if (sameRank) {
                    var peer = (role === 'a') ? 'B' : 'A';
                    html += '<option value="'+esc(x.name)+'">'+esc(x.name)+' · '+esc(x.data.品质 || 'F')+' (点击交换)</option>';
                }
                return;
            }
            if (role === 'b' && maxRank != null && bloodFusionRankOf(x) > maxRank) return;
            html += bloodFusionOption(x, false, false);
        });
        html += '</select>';
        return html;
    }
    /* 重建 A/B 两个下拉框:
       - A 列: B 当前同名项仅当 A、B 同品质时显示为 '(= B, 点击交换)', 否则隐藏; 其他项可见可选
       - B 列: A 当前同名项仅当 A、B 同品质时显示为 '(= A, 点击交换)', 否则隐藏; 品质>A 的项跳过 */
    function bloodFusionRebuildSelects(entries, aVal, bVal) {
        var aEntry = null;
        for (var i = 0; i < entries.length; i++) { if (entries[i].name === aVal) { aEntry = entries[i]; break; } }
        var maxRank = aEntry ? bloodFusionRankOf(aEntry) : 9;
        $('.sam-fusion-select[data-fusion-role="a"]').replaceWith(bloodFusionSelectHtml(entries, 'a', aVal, null, bVal));
        $('.sam-fusion-select[data-fusion-role="b"]').replaceWith(bloodFusionSelectHtml(entries, 'b', bVal, maxRank, aVal));
    }
    /* 计算直接购买按钮状态: 血统数已满 → 灰度+左侧提示文案(不弹窗); 否则正常可点 */
    function bloodFusionDirectBtnState() {
        if (!bloodFusionShopItem) return { show: false };
        var sd = getStatData();
        var bctx = shopResolveCharacter(sd, bloodFusionActionActor);
        var bch = bctx.character || {};
        var cap = BLOODLINE_CAP, count = Object.keys(bch.血统 || {}).length;
        var full = (count >= cap);
        return { show: true, full: full, count: count, cap: cap };
    }
    /* 智能 A/B 初始选值:
       - 无 shopItem(从血统面板进入): entries 全部为自身血统, 按品质降序, A=最高, B=次高(A≥B)
       - 有 shopItem(从血统商店进入): B 默认 = 商店血统; A = 自身最高品质血统
         (除非商店血统品质 > 自身最高品质 → A=商店血统, B=自身最高品质血统) */
    function bloodFusionPickInitialAB(entries, shopItem) {
        if (entries.length < 2) return { aName: null, bName: null };
        var owned = entries.filter(function(e){ return e.owned; }).sort(function(p,q){ return bloodFusionRankOf(q) - bloodFusionRankOf(p); });
        var shopEntry = shopItem ? entries.filter(function(e){ return !e.owned; })[0] : null;
        if (!shopEntry) {
            // 面板入口: A=最高, B=次高
            return { aName: owned[0].name, bName: owned[1].name };
        }
        if (owned.length === 0) return { aName: shopEntry.name, bName: null };
        var topOwned = owned[0];
        if (bloodFusionRankOf(shopEntry) > bloodFusionRankOf(topOwned)) {
            // 商店血统更高级 → A=商店, B=自身最高(同级或更低)
            return { aName: shopEntry.name, bName: topOwned.name };
        }
        // 商店血统 ≤ 自身最高 → A=自身最高, B=商店血统
        return { aName: topOwned.name, bName: shopEntry.name };
    }
    /* 在 entries 中按品质降序, 找到第一个 ≠ excludeName 且 rank ≤ maxRank 的可用项(用于 B 回退) */
    function bloodFusionPickBUnderA(entries, excludeName, maxRank) {
        var sorted = entries.slice().sort(function(p,q){ return bloodFusionRankOf(q) - bloodFusionRankOf(p); });
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].name === excludeName) continue;
            if (bloodFusionRankOf(sorted[i]) > maxRank) continue;
            return sorted[i].name;
        }
        return null;
    }
    /* 判定融合类型: A/B 品质同级 → 'same'(同级融合); 否则 → 'diff'(高低级融合) */
    function bloodFusionJudgeMode(aName, bName, entries) {
        var find = function(n) {
            for (var i = 0; i < entries.length; i++) { if (entries[i].name === n) return entries[i]; }
            return null;
        };
        var a = find(aName), b = find(bName);
        if (!a || !b) return 'same';
        var ar = BLOODLINE_RANK[String(a.data.品质 || 'F').toUpperCase()] || 1;
        var br = BLOODLINE_RANK[String(b.data.品质 || 'F').toUpperCase()] || 1;
        return (ar === br) ? 'same' : 'diff';
    }
    /* 同步刷新舱内 A/B 预览卡片 + 规则面板(不重建下拉框, 由调用方负责 selects) */
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
    /* 渲染融合舱头部行动条(商城入口: 已满→[替换当前血统|融合当前血统]二选一, 未满→直接购买; 面板入口: 取消/开始融合) */
    function bloodFusionActionsHtml(shopItem) {
        var html = '<div class="sam-fusion-actions" style="display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap">';
        if (shopItem) {
            var st = bloodFusionDirectBtnState();
            if (st.full) {
                // ★ 血统栏已满(CAP=1时为常态): 不再灰度卡死, 提供两种处置 —— 融合当前血统 / 替换当前血统
                html += '<span class="sam-fusion-direct-hint" style="flex:1;min-width:160px;font-size:11px;color:var(--sam-hp);line-height:1.4">⚠ 血统栏已满 ('+st.count+'/'+st.cap+')。可将新血统与当前血统融合，或直接替换掉当前血统。</span>'
                    + '<button type="button" class="sam-confirm-btn cancel sam-fusion-replace-open">替换当前血统</button>';
            } else {
                html += '<span class="sam-fusion-direct-hint" style="flex:1;min-width:160px;font-size:11px;color:var(--sam-sub);line-height:1.4">血统栏余位 '+st.count+'/'+st.cap+'，可直接购入。</span>'
                    + '<button type="button" class="sam-confirm-btn cancel sam-fusion-direct">直接购买</button>';
            }
        } else {
            html += '<button type="button" class="sam-confirm-btn cancel sam-fusion-direct">取消</button>';
        }
        html += '<button type="button" class="sam-confirm-btn ok sam-fusion-start">'+(shopItem ? '融合当前血统' : '开始融合')+'</button></div>';
        return html;
    }
    function openBloodFusionModal(shopItem) {
        // ★ 融合进行中: 仍允许打开舱门查看进度, 但只显示等待提示(不可再次发起融合)
        if (bloodFusionBusy) {
            showModal('血统融合进行中', '<div class="sam-shop-refreshing"><div class="sam-fusion-pulse">🧬</div><div>主神正在校验血统相性并执行融合算法…<br>请等待当前融合完成后再发起下一次。</div><button type="button" class="sam-shop-stop-btn" data-sam-act="blood-fusion-stop">⏹ 停止融合(卡住时点此恢复)</button></div>');
            return;
        }
        bloodFusionShopItem = shopItem || null;
        // ★ 融合写入目标: 血统面板入口(无商店血统) → 角色; 商店入口(有 shopItem) → 跟随当前商城选中角色
        bloodFusionActionActor = shopItem ? (shopCurrentActor || SHOP_ACTOR_REINCARNATOR) : SHOP_ACTOR_REINCARNATOR;
        var extra = shopItem ? { name:shopItem.name, 品质:shopItem.rating, 标签:shopItem.tags || [], 原始属性:shopItem.raw_attrs || {}, 效果:shopItem.effects || {}, 描述:shopItem.description || '' } : null;
        var entries = bloodFusionEntries(extra);
        var title = shopItem ? '血统购入与融合确认' : '血统融合舱';
        var head = '<div class="sam-fusion-head">'
            + '<span class="ico" style="font-size:22px">🧬</span>'
            + '<span class="ttl" style="font-size:15px;font-weight:600;color:var(--sam-fg)">血统融合舱</span>'
            + '<span class="sub" style="font-size:11px;color:var(--sam-sub);line-height:1.5">主血统 <b style="color:var(--sam-accent)">A</b> 决定核心方向 · 外貌与主要能力<br>副素材 <b style="color:var(--sam-hp)">B</b> 融合后永久消耗 · 结果不可撤销</span>'
            + '</div>';
        // ★ 血统不足2条: 仍打开弹窗, A/B 下拉框为空+灰度不可点, 预览显示空态, 不再弹 toast 拦截
        if (entries.length < 2) {
            var emptySelHtml = '<select class="sam-fusion-select" data-fusion-role="" disabled style="opacity:0.5;cursor:not-allowed;filter:grayscale(1)"><option value="" selected disabled>— 无可用血统 —</option></select>';
            bloodFusionLastVals = { a: null, b: null };
            var emptyCard = bloodFusionPreviewCardHtml(null);
            var html2 = '<div class="sam-fusion-wrap">'
                + head
                + '<div class="sam-fusion-pair">'
                + '<div class="sam-fusion-col" data-role="a"><div class="sam-fusion-col-label"><span class="tag a">A</span><span class="role">主血统</span><span class="note">决定核心方向</span></div>'+emptySelHtml+'<div class="sam-fusion-preview-wrap">'+emptyCard+'</div></div>'
                + '<div class="sam-fusion-arrow">⇌</div>'
                + '<div class="sam-fusion-col" data-role="b"><div class="sam-fusion-col-label"><span class="tag b">B</span><span class="role">副素材</span><span class="note">永久消耗</span></div>'+emptySelHtml+'<div class="sam-fusion-preview-wrap">'+emptyCard+'</div></div>'
                + '</div>'
                + '<div class="sam-shop-warn" style="margin-top:2px">'+(shopItem ? '当前角色暂无可用于融合的现有血统，可直接购入该血统。' : '至少需要两条血统才能进行融合。当前血统栏不足。')+'</div>'
                + (shopItem ? bloodFusionActionsHtml(shopItem).replace('class="sam-confirm-btn ok sam-fusion-start"', 'class="sam-confirm-btn ok sam-fusion-start" disabled style="opacity:0.5;cursor:not-allowed;filter:grayscale(1)"').replace('>融合当前血统<', '>开始融合<') : '<div style="display:flex;justify-content:flex-end;margin-top:2px"><button type="button" class="sam-confirm-btn cancel sam-fusion-direct">取消</button></div>')
                + '</div>';
            showModal(title, html2);
            return;
        }
        // ★ 智能 A/B 初始选值: 面板入口(无 shopItem) → A=自身最高, B=次高; 商店入口 → A=高级方, B=低级方/商店血统
        var pick = bloodFusionPickInitialAB(entries, shopItem);
        var aEntry = null, bEntry = null;
        for (var pi = 0; pi < entries.length; pi++) {
            if (entries[pi].name === pick.aName) aEntry = entries[pi];
            if (entries[pi].name === pick.bName) bEntry = entries[pi];
        }
        bloodFusionLastVals = { a: pick.aName, b: pick.bName }; // 记录初始值, 供联动交换使用
        var maxRank0 = aEntry ? bloodFusionRankOf(aEntry) : 9;
        var mode = bloodFusionJudgeMode(pick.aName, pick.bName, entries);
        var html = '<div class="sam-fusion-wrap">'
            + head
            + '<div class="sam-fusion-pair">'
            + '<div class="sam-fusion-col" data-role="a"><div class="sam-fusion-col-label"><span class="tag a">A</span><span class="role">主血统</span><span class="note">决定核心方向</span></div>'+bloodFusionSelectHtml(entries, 'a', pick.aName, null, pick.bName)+'<div class="sam-fusion-preview-wrap">'+bloodFusionPreviewCardHtml(aEntry)+'</div></div>'
            + '<div class="sam-fusion-arrow">⇌</div>'
            + '<div class="sam-fusion-col" data-role="b"><div class="sam-fusion-col-label"><span class="tag b">B</span><span class="role">副素材</span><span class="note">永久消耗</span></div>'+bloodFusionSelectHtml(entries, 'b', pick.bName, maxRank0, pick.aName)+'<div class="sam-fusion-preview-wrap">'+bloodFusionPreviewCardHtml(bEntry)+'</div></div>'
            + '</div>'
            + '<div class="sam-fusion-rule-host">'+bloodFusionRulePanelHtml(mode)+'</div>'
            + '<div class="sam-shop-warn" style="margin-top:2px">A 须为主血统(品质 ≥ B); B 选项不可高于 A。品质不同时以较高品质血统作为主血统 A。融合结果由主神算法接口返回，无法撤销、不可回档。</div>'
            + bloodFusionActionsHtml(shopItem)
            + '</div>';
        showModal(title, html);
    }
    /* A/B 联动(撞值交换 + B≤A 约束):
       - 撞值交换: 一方切到对方当前同名项 → 对方自动切回本方旧值
         例: A=D1, B=D2, 在 B 下拉点 'D1 (= A, 点击交换)' → B=D1, A 自动变 D2
       - A 切换后若 B 失效(品质>A 或与新 A 同名) → B 回退到品质 ≤ A 的最高可用项(≠A 同名)
       - B 切换后: 已被下拉过滤保证 ≤A; 若 B 新品质 > A 品质(理论不会发生)则兜底回退 */
    function bloodFusionSyncSelect(role) {
        var $a = $('.sam-fusion-select[data-fusion-role="a"]');
        var $b = $('.sam-fusion-select[data-fusion-role="b"]');
        if (!$a.length || !$b.length) return;
        var entries = bloodFusionEntries(bloodFusionShopItem ? { name:bloodFusionShopItem.name, 品质:bloodFusionShopItem.rating, 标签:bloodFusionShopItem.tags || [], 原始属性:bloodFusionShopItem.raw_attrs || {}, 效果:bloodFusionShopItem.effects || {}, 描述:bloodFusionShopItem.description || '' } : null);
        var oldA = bloodFusionLastVals.a, oldB = bloodFusionLastVals.b;
        var newVal = (role === 'a') ? $a.val() : $b.val();
        var otherVal = (role === 'a') ? $b.val() : $a.val();
        var aVal = (role === 'a') ? newVal : otherVal;
        var bVal = (role === 'b') ? newVal : otherVal;
        // 撞值交换: 本方新值 = 对方当前值 → 对方切回本方旧值
        //   例: role='a', A 由 D1 改为 D2(=B 当前), 此时 A 接 B 的旧位 D2, B 应自动接 A 的旧位 D1 → bVal = oldA
        //   例: role='b', B 由 D2 改为 D1(=A 当前), 此时 B 接 A 的旧位 D1, A 应自动接 B 的旧位 D2 → aVal = oldB
        if (newVal === otherVal && oldA && oldB && oldA !== oldB) {
            if (role === 'a') { bVal = oldA; }
            else { aVal = oldB; }
        }
        // B≤A 约束: 若 B 品质 > A 品质 → B 回退到品质 ≤ A 的最高可用项(≠A 同名)
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
        if (!aName || !bName || aName === bName) { samToast('warning', '请为 A 与 B 选择两条不同的血统'); return; }
        var entries = bloodFusionEntries(bloodFusionShopItem ? { name:bloodFusionShopItem.name, 品质:bloodFusionShopItem.rating, 标签:bloodFusionShopItem.tags || [], 原始属性:bloodFusionShopItem.raw_attrs || {}, 效果:bloodFusionShopItem.effects || {}, 描述:bloodFusionShopItem.description || '' } : null);
        var a = entries.filter(function(x){return x.name === aName;})[0], b = entries.filter(function(x){return x.name === bName;})[0];
        if (!a || !b) { samToast('error', '血统数据已变化，请重新打开融合舱'); return; }
        if (bloodFusionShopItem && a.name !== bloodFusionShopItem.name && b.name !== bloodFusionShopItem.name) {
            samToast('warning', '商城血统必须作为本次融合的 A 或 B'); return;
        }
        var ar = BLOODLINE_RANK[String(a.data.品质 || 'F').toUpperCase()] || 1, br = BLOODLINE_RANK[String(b.data.品质 || 'F').toUpperCase()] || 1;
        if (ar < br) { var swap = a; a = b; b = swap; }
        // AI 接口检查推迟到 roll 之后: 基因崩溃/崩坏消散 不调用 AI(纯本地写回), 无需接口; 其他结果仍要求接口
        var _mode0 = (ar === br) ? 'same' : 'diff';
        var _roll0 = bloodFusionRoll(_mode0);
        var _isNoAIResult = _roll0 && (_roll0.name === '基因崩溃' || _roll0.name === '崩坏消散');
        // 启用额外模型配置时走自托管API, 否则需 generateRaw 做融合结果生成
        if (!_isNoAIResult && !isApiConfigEnabled() && !shopGetAI()) { samToast('error', '未检测到融合算法接口(或在设置里启用额外模型配置)'); return; }
        if (!_isNoAIResult && isApiConfigEnabled() && !getApiConfig().model) { samToast('error', '额外模型配置已启用但未选择模型, 请先在设置面板选择模型'); return; }
        // ★ 商城血统融合: 开始融合时立即扣币 + 从商店删除血统商品(不等融合结束)
        //   融合失败/被用户停止则回滚(还原空间币+商品库), 保证原子性; 成功后不再重复扣币/删商品库
        bloodFusionSnap = null;
        if (bloodFusionShopItem) {
            var prePrice = safeNum(bloodFusionShopItem.price, 0);
            var preSd = getStatData();
            var preCoin = preSd && preSd.角色 ? safeNum(preSd.角色.空间币, 0) : 0;
            if (preCoin < prePrice) { samToast('warning', '空间币不足，无法购买此血统进行融合'); return; }
            // ★ 多角色: 货币/凭证仍从 角色 账户扣除; 血统商品从 当次融合目标角色 的 商城库 删除
            var preActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
            var preActorCtx = shopResolveCharacter(preSd, preActor);
            var preCredentialRequirements = {};
            var preCredentialRequirement = shopCredentialRequirement(preActorCtx.character || {}, bloodFusionShopItem);
            if (preCredentialRequirement.required) preCredentialRequirements[preCredentialRequirement.grade] = 1;
            var preCredentialShortages = shopCredentialShortages(preSd && preSd.角色 && preSd.角色.权限凭证, preCredentialRequirements);
            if (preCredentialShortages.length) { samToast('warning', '权限凭证不足：'+shopCredentialShortageText(preCredentialShortages)); return; }
            var preActorLib = shopGetActorLibRaw(preSd && preSd.商城, preActor);
            var preBloodArr = (preActorLib && Array.isArray(preActorLib.血统列表)) ? preActorLib.血统列表.slice() : null;
            // 备份扣币/扣凭证/删除商品前的快照, 供失败/停止回滚
            bloodFusionSnap = {
                price: prePrice,
                preCoin: preCoin,
                preActor: preActor,
                preBloodLib: preBloodArr,
                credentialRequirements: preCredentialRequirements
            };
            var preOk = writeBackMvu(function(statData) {
                statData.角色 = statData.角色 || {};
                statData.角色.权限凭证 = statData.角色.权限凭证 || {};
                if (!shopCredentialConsume(statData.角色.权限凭证, preCredentialRequirements)) throw new Error('权限凭证扣除失败');
                statData.角色.空间币 = Math.max(0, safeNum(statData.角色.空间币, 0) - prePrice);
                var _lib = shopGetActorLibRaw(statData.商城, preActor);
                if (_lib && Array.isArray(_lib.血统列表)) {
                    _lib.血统列表 = _lib.血统列表.filter(function(item) { return safeStr(item.名称) !== bloodFusionShopItem.name; });
                }
            });
            if (!preOk) { samToast('error', '扣除空间币失败，无法开始融合'); return; }
            // 立即同步本地缓存, 商店列表中该血统即刻消失
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
        // ★ 前端按权重 roll 出确定性结果(同步脚本测试.js 算法), AI 仅渲染该结果对应血统数据
        //   复用 line ~1685 处已 roll 的 _roll0(避免重复随机导致前后不一致)
        bloodFusionResult = _roll0;
        bloodFusionBusy = true;
        // ★ 推进回合号: 用户点"停止融合"或重发起一次新融合时 epoch 已变, 旧 Promise 回调回合不匹配即丢弃结果
        bloodFusionEpoch += 1;
        var myEpoch = bloodFusionEpoch;
        // 记录本次融合将消耗的角色侧原血统名(A、B 中所有 owned:true 的条目),
        // 用于:1) 融合进行中升级区"replace_target=这些血统"的升级卡片灰锁;
        //       2) 融合成功后从商城升级列表删除已无对应血统的升级条目
        bloodFusionConsumedNames = [];
        if (a && a.owned) bloodFusionConsumedNames.push(a.name);
        if (b && b.owned) bloodFusionConsumedNames.push(b.name);

        // ★ 短路径: roll 出【基因崩溃 / 崩坏消散】时无需调用 AI 渲染,
        //   规则为 "A 保持原状 / B 永久消耗 / 不产生收益" — 直接弹融合进行中 → 10s 倒计时后写回(仅删除 B, 不增新血统, 不增形态)
        var rollName0 = bloodFusionResult ? bloodFusionResult.name : '';
        if (rollName0 === '基因崩溃' || rollName0 === '崩坏消散') {
            closeModal();
            renderAll();
            showModal('血统融合进行中', '<div class="sam-shop-refreshing"><div class="sam-fusion-pulse">🧬</div><br>主神正在按法则融合血统数据…<br>你可以关闭窗口，结果会在返回后自动写入。<button type="button" class="sam-shop-stop-btn" data-sam-act="blood-fusion-stop">⏹ 停止融合(卡住时点此恢复)</button></div></div>');
            var delayMs = 10000;
            // 使用 Promise 化的 setTimeout 以兼容 epoch 守卫(若用户点停止, epoch 变化即丢弃迟到回写)
            await new Promise(function(resolve){ setTimeout(resolve, delayMs); });
            if (myEpoch !== bloodFusionEpoch || !bloodFusionBusy) return;  // 期间被"停止融合"打断 → 不写回
            // 写回: 只删除角色侧的 B 血统(b.owned 才删除), 不增新血统, 不写形态库; A 保持原状;
            //   升级列表的清理逻辑沿用成功路径(replace_target 命中已删 B 的升级条目一并剔除)
            var consumedNames0 = bloodFusionConsumedNames.slice();
            var _actor0 = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
            var ok0 = writeBackMvu(function(statData) {
                var _ctx0 = shopResolveCharacter(statData, _actor0);
                var _ch0 = _ctx0.character || {};
                _ch0.血统 = _ch0.血统 || {};
                if (b.owned) delete _ch0.血统[b.name];
                if (bloodFusionSnap && bloodFusionShopItem) {
                    shopAppendReceipt(statData, shopReceiptLine('血统融合', bloodFusionShopItem.name+' → '+rollName0, bloodFusionSnap.price, statData.角色.空间币, (bloodFusionActionActor === SHOP_ACTOR_REINCARNATOR ? '角色' : bloodFusionActionActor)));
                }
                var _ulib0 = shopGetActorLibRaw(statData.商城, _actor0);
                if (_ulib0 && Array.isArray(_ulib0.升级列表) && consumedNames0.length) {
                    _ulib0.升级列表 = _ulib0.升级列表.filter(function(u) {
                        var upCat = String(shopPick(u, 'category','所属大类','类型','type') || '');
                        var tgt = String(shopPick(u, 'replace_target','替换目标') || '');
                        if (upCat === '血统' && tgt && consumedNames0.indexOf(tgt) >= 0) return false;
                        return true;
                    });
                }
            });
            if (!ok0) {  // 极少见: MVU 写回失败 → 按现有失败回滚处理(回补空间币+商品库)
                if (bloodFusionSnap) {
                    try {
                        writeBackMvu(function(statData) {
                            statData.角色 = statData.角色 || {};
                            statData.角色.空间币 = safeNum(statData.角色.空间币, 0) + bloodFusionSnap.price;
                            statData.角色.权限凭证 = statData.角色.权限凭证 || {};
                            shopCredentialRefund(statData.角色.权限凭证, bloodFusionSnap.credentialRequirements || {});
                            if (bloodFusionSnap.preBloodLib !== null && statData.商城) {
                                var _rlib0 = shopGetActorLibRaw(statData.商城, bloodFusionSnap.preActor);
                                if (_rlib0) _rlib0.血统列表 = bloodFusionSnap.preBloodLib.slice();
                            }
                        });
                    } catch(eRoll0) { try { console.warn('[主神终端] '+rollName0+' 写回失败回滚异常:', eRoll0.message); } catch(e2){} }
                }
                bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = []; bloodFusionSnap = null; closeModal();
                renderAll();
                samToast('error', rollName0+' 写回失败，已回滚');
                return;
            }
            // 升级区本地缓存同步
            try {
                var freshSd0 = getStatData();
                var freshLib0a = shopGetActorLibRaw(freshSd0 && freshSd0.商城, bloodFusionActionActor);
                if (freshLib0a) {
                    shopMarketData = shopNormalizeMarketData(freshLib0a);
                    if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
                }
            } catch(eFresh0) {}
            // 写回成功, 回滚快照不再需要
            bloodFusionSnap = null;
            var rollResult0 = bloodFusionResult;
            var rollWeight0 = rollResult0 ? rollResult0.weight : '';
            closeModal(); bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = [];
            renderAll();
            showModal('融合结果 · '+rollName0, '<div class="sam-shop-warn">融合结果：'+esc(rollName0)+'</div>'
                + '<div class="sam-full-card">'+esc(a.name)+' 保持原状；'+esc(b.name)+' 已永久消散，不再产生任何收益。</div>'
                + '<div class="sam-full-card" style="opacity:0.85">规则: '+(rollResult0 && rollResult0.list ? rollResult0.list.join(' / ') : 'A 保持原状 / B 永久消耗 / 不产生收益')+'</div>');
            return;  // 短路径结束, 不走后续 AI 流程
        }

        closeModal();
        renderAll();
        showModal('血统融合进行中', '<div class="sam-shop-refreshing"><div class="sam-fusion-pulse">🧬</div><br>主神正在按法则融合血统数据…<br>你可以关闭窗口，结果会在返回后自动写入。<button type="button" class="sam-shop-stop-btn" data-sam-act="blood-fusion-stop">⏹ 停止融合(卡住时点此恢复)</button></div></div>');
        
        var content = ''
            + '属性系统 (底层定义):\n'
            + '  基础五维 (判定依据):\n'
            + '    力量: 近战/负重/破坏\n'
            + '    敏捷: 平衡/潜行/瞄准\n'
            + '    体质: 生命/耐性/恢复\n'
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
            + '    先攻DC: 行动顺序\n'
            + '    防御DC: 被命中难度\n';
        // 获取世界书内容的调用
        content += await getWorldBookContent('⚙️生命层级与社会生态'); 
        content += await getWorldBookContent('⚙️品质效果数值规则'); 
        content += await getWorldBookContent('⚙️实体生成规则'); 
        content += await getWorldBookContent('⚙️状态协议'); 
        content += await getWorldBookContent('⚙️行为判定[mvu_plot]'); 

        // 构造系统提示词: 融合渲染端定位 + 属性系统底层定义 + 世界书规则内容
        var sysPrompt = ''
            + '你是主神血统融合算法的渲染端。融合结果已由前端系统按权重 roll 出, 你【不得】自行选择结果、改写概率或拒绝执行。\n'
            + '只能按用户给出的已定结果与规则生成具体血统数据, 并返回规定 YAML。\n'
            + '【系统设定】\n'
            + content + '\n'
            + '【严格输出格式】\n'
            + '仅输出 YAML 文本, 不要解释、不要 markdown 代码围栏。\n'
            + '字段类型必须严格遵守:\n'
            + '  - 品质: 字符串, 仅可选 F / E / D / C / B / A / S / SS / SSS\n'
            + '  - 标签: 行内数组 [\'标签1\', \'标签2\'...]\n'
            + '  - 原始属性: 行内对象，定档遵循《品质效果数值规则》；血统必须完整包含五维（力量、敏捷、体质、精神、魅力），装备仅写有效非0项\n'
            + '  - 效果: 行内对象 {效果名: \'描述\'}, 键为字符串, 值为字符串描述\n'
            + '  - 价格: 数字(空间币)\n'
            + '  - 描述/消耗: 字符串\n'
            + '  - 类型:\n'
            + '      技能列表.类型 = 数字 0(主动) / 1(被动) / 2(特殊)\n'
            + '  - 替换目标: 字符串 (仅【形态列表】内必填，必须与玩家当前拥有的原物品名称一字不差！)\n'
            + '  - 道具列表.数量 = 数字(该商品可购入的库存份数, ≥1)\n'
            + '对象键禁止使用英文句点，口径类X.Ymm统一写作X·Y（例：5.56mm弹药→5·56弹药）;\n'

        // 构造融合渲染 prompt: 前端已用 bloodFusionRoll 按权重 roll 出【确定结果】,
        // AI 仅作为"渲染端"按结果对应的规则生成具体血统数据(名称/品质/属性/效果/描述),
        // 严禁自行选择结果或改写概率。result = {name, weight, list, cls}
        function bloodFusionBuildPrompt(a, b, mode, result) {
            var modeText = (mode === 'same') ? '同级融合' : '高低级融合';
            var rulesText = (result.list || []).map(function(s, idx){ return '  ' + (idx + 1) + '. ' + s; }).join('\n');
            return '血统融合渲染引擎。融合结果已由系统按权重 roll 出, 你【不得】自行选择结果或改写概率, 只能按给定结果渲染血统数据。\n'
                + 'A 为主血统, B 为副素材; 品质不同时以高品质为 A。\n'
                + '本次融合类型: ' + modeText + '\n'
                + '本次融合结果(系统已确定): ' + result.name + '\n'
                + '该结果对应的规则如下, 必须严格按此规则生成格式数据:\n' + rulesText + '\n\n'
                + '  - 【组件替换规则】:\n'
                + '     * 当融合结果产生新形态替换旧形态时，必须填写替换目标。\n'
                + '     * 替换目标必须从下方【已有形态】实际名单中逐字选取; 不得使用名单外、已删除或不存在的形态名。\n'
                + '     * 替换目标对应组件将在后台删除，不允许通过描述形式继续保留。\n'
                + '     * 若融合规则要求清空词条，则允许重新构筑，不继承旧词条。\n'
                + '     * 若融合规则要求强化继承，则必须完整迁移有效词条。\n'
                + '     * 若融合结果未产生形态能力，形态列表输出为空，不得强行创造变身体系, 替换目标填"无"。\n'
                + '     * 描述中禁止出现"已删除形态"、"删除 XX 形态"等任何对已不存在的形态的引用, 仅依据【已有形态】名单客观陈述。\n'
                + '  - 【形态生成规则】:\n'
                + '     * 形态属于独立战斗模式，不继承主血统的层级判定。\n'
                + '     * 形态层级独立于血统品质与角色当前生命层级，按形态自身战斗位格生成。\n'
                + '     * 形态原始属性按自身特征和战斗定位生成，不得复制、继承或微调主血统属性。\n'
                + '请仅输出 YAML 格式, 字段如下:\n'
                + '融合结果: ' + result.name + '\n'
                + '血统列表:\n'
                + '  - 名称: 最终血统名称\n'
                + '    品质: F\n'
                + '    标签: [标签]\n'
                + '    原始属性: {力量: C, 敏捷: E, 体质: D, 精神: F, 魅力: E}\n'
                + '    效果: {词条: 描述}\n'
                + '    描述: 结果说明\n\n'
                + '形态列表:\n'
                + '  - 名称: 形态名称\n'
                + '    替换目标: 原有形态确切名称 (例: 狼人形态)\n'
                + '    层级: {按形态自身战斗位格生成，Ⅰ－Ⅸ}\n'
                + '    消耗: HP/EP/特殊资源\n'
                + '    状态: 完好\n'
                + '    标签: ["主神空间", 依赖的道具/血统/来源等]\n'
                + '    原始属性: {基础属性/衍生属性: 品质}\n'
                + '    效果: { [词条]: 描述 }\n'
                + '    技能: {\n'
                + '     - 名称: 技能名\n'
                + '       品质: F\n'
                + '       类型: 0\n'
                + '       标签: ["主神空间", "被动"]\n'
                + '       效果: {射击校准: 射击检定+5}\n'
                + '       描述: 简短描述\n'
                + '       消耗: 无}\n'
                + '    描述: 简短描述\n'
                + '注意: "基因崩溃" 与 "崩坏消散" 不产生新血统, 但仍需返回 A 原血统作为结果(描述中说明 B 永久消耗)。\n\n'
                + 'A=' + JSON.stringify(a)
                + '\nB=' + JSON.stringify(b);
        }

        // —— 用户提示: 玩家上下文 + 需求 + 输出模板示例 ——
        var sd = getStatData();
        var _pctx = shopResolveCharacter(sd, bloodFusionActionActor);
        var p = _pctx.character || {};
        var parts = [];
        // ★ 核心辅助函数：提取物品的所有关键信息，拼接成紧凑的单行文本，既全面又省 Token
        function formatDict(dict) {
            var keys = Object.keys(dict || {});
            if (keys.length === 0) return '无';
            
            return keys.map(function(k) {
                var v = dict[k] || {};
                var info = [];

                if (v.品质) info.push(v.品质 + '级');
                if (v.数量 != null) info.push('数量:' + v.数量);
                if (v.消耗) info.push('消耗:' + v.消耗);
                if (Array.isArray(v.标签) && v.标签.length > 0) info.push('标签:' + v.标签.join('、'));
                // 属性和效果是对象，用 JSON.stringify 拍平显示
                if (v.原始属性 && Object.keys(v.原始属性).length > 0) info.push('属性:' + JSON.stringify(v.原始属性));
                if (v.效果 && Object.keys(v.效果).length > 0) info.push('效果:' + JSON.stringify(v.效果));
                if (v.技能) info.push('技能:' + JSON.stringify(v.技能));
                if (v.描述) info.push('描述:' + v.描述);
                
                // 输出格式例: "  - 御剑术 [F级 | 消耗:8MP | 效果:{"主动":"..."} | 描述:...]"
                return '  - ' + k + ' [' + info.join(' | ') + ']';
            }).join('\n');
        }
        // 已有形态名称(帮助AI避免重复+贴合构筑)
        var formData = p.形态库 || {};
        if (Object.keys(formData).length) parts.push('已有形态:\n' + formatDict(formData));
        
        var playerCtx = parts.join('\n');
        var userPrompt = '\n【当前玩家数据】\n' + (playerCtx || '(无)') + '\n';
        userPrompt += bloodFusionBuildPrompt(a, b, _mode0, bloodFusionResult);
        // console.log(sysPrompt, userPrompt);
        // 用 try/await 替代原 then/catch, 失败回滚空间币+商品库
        try {
            var out = await shopCallAI(sysPrompt, userPrompt);
            // 回合校验: 用户点"停止融合"或重发起一次新融合时 epoch 已变, 丢弃这次迟到结果
            if (myEpoch !== bloodFusionEpoch || !bloodFusionBusy) return;
            var parsed = shopParseMarketText(out), result = parsed.血统列表 && parsed.血统列表[0];
            if (!result || !result.名称) throw new Error('融合结果格式无效');
            var resultName = result.名称;
            // AI 可能返回 形态列表(融合出新形态), 同升级列表的 replace_target 处理方式:
            // 先删"替换目标"对应旧形态, 再写入新形态到 形态库
            var formList = Array.isArray(parsed.形态列表) ? parsed.形态列表 : [];
            // 归一化单条原始形态(对齐 32e 的 形态库 数据结构)
            // 归一化单条原始形态 → 形态库 数据结构
            // 注意: ZOD form_item 的 技能 是 z.record(z.string(), skill_item) 对象图(key=技能名, 技能值中文键 品质/类型/标签/效果/描述/消耗)
            //   form_item 顶层无 名称/替换目标(由 形态库 record 的 key 承担, 替换目标仅作删除逻辑用)
            //   故 normalizeForm 仅留 ZOD schema 中的顶层字段, 名称/替换目标 放 _name/_replace 由写入代码消费(ZOD strip)
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
                    var stn = shopPick(s, 'type','类型');
                    var stNum = (typeof stn === 'number') ? stn
                        : (typeof stn === 'string' && /^\d+$/.test(String(stn))) ? parseInt(String(stn), 10) : 0;
                    skillsMap[sn] = {
                        品质:  shopPick(s, 'rating','品质','品级','评级') || 'F',
                        类型:  stNum,
                        标签:  shopEnsureSourceTag(shopPick(s, 'tags','标签')),
                        效果:  shopPick(s, 'effects','效果') || {},
                        描述:  shopPick(s, 'description','描述','说明') || '',
                        消耗:  shopPick(s, '消费','消耗','cost') || '无'
                    };
                });
                var tagsVal = shopPick(raw, 'tags','标签');
                if (typeof tagsVal === 'string') tagsVal = [tagsVal];
                return {
                    _name:      name,                                                   // 写入 形态库 时的 key (ZOD strip, 不入库)
                    _replace:   shopPick(raw, 'replace_target','替换目标') || '',         // 写入前删除旧形态用 (ZOD strip, 不入库)
                    // 形态字段已由"品质"改为"层级"(生命层级 Ⅰ~Ⅸ); 优先取 层级/tier, 兼容 AI 仍输出 品质 字段
                    层级:       tierRomanOf(shopPick(raw, 'tier','层级','rating','品质','品级','评级') || 'Ⅰ'),
                    消耗:       shopPick(raw, 'cost','消耗') || '',
                    冷却:       shopPick(raw, 'cooldown','冷却') || '0回合',
                    状态:       shopPick(raw, 'status','状态') || '完好',
                    标签:       shopEnsureSourceTag(Array.isArray(tagsVal) ? tagsVal : []),
                    原始属性:   shopPick(raw, '原始属性','基础属性','属性') || {},
                    效果:       shopPick(raw, 'effects','效果','特效','特殊效果') || {},
                    技能:       skillsMap,
                    描述:       shopPick(raw, 'description','描述','说明') || ''
                };
            }
            var forms = [];
            for (var fi = 0; fi < formList.length; fi++) {
                var nf = normalizeForm(formList[fi]);
                if (nf) forms.push(nf);
            }
            // 被本次融合消耗的角色侧原血统名(命中即从升级列表清除其对应升级条目)
            var consumedNames = bloodFusionConsumedNames.slice();
            // 融合成功: 写回血统变更(删旧增新) + 清理升级列表里 replace_target 命中已删血统的升级服务
            //   + 写入新形态(删替换目标旧形态→写新形态, 同升级列表处理);
            //   空间币与血统商品库已在开始时处理, 不再重复扣币/删商品
            var _fActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
            var ok = writeBackMvu(function(statData) {
                var _fctx = shopResolveCharacter(statData, _fActor);
                var _fch = _fctx.character || {};
                _fch.血统 = _fch.血统 || {};
                delete _fch.血统[a.name];
                if (b.owned) delete _fch.血统[b.name];
                _fch.血统[resultName] = result;
                if (bloodFusionSnap && bloodFusionShopItem) {
                    shopAppendReceipt(statData, shopReceiptLine('血统融合', bloodFusionShopItem.name+' → '+resultName, bloodFusionSnap.price, statData.角色.空间币, (bloodFusionActionActor === SHOP_ACTOR_REINCARNATOR ? '角色' : bloodFusionActionActor)));
                }
                // 清理升级列表: "类型=血统 的升级条目" 且 replace_target 命中本次被消耗的原血统名 → 删除
                var _fulib = shopGetActorLibRaw(statData.商城, _fActor);
                if (_fulib && Array.isArray(_fulib.升级列表) && consumedNames.length) {
                    _fulib.升级列表 = _fulib.升级列表.filter(function(u) {
                        var upCat = String(shopPick(u, 'category','所属大类','类型','type') || '');
                        var tgt = String(shopPick(u, 'replace_target','替换目标') || '');
                        if (upCat === '血统' && tgt && consumedNames.indexOf(tgt) >= 0) return false;
                        return true;
                    });
                }
                // 写入新形态: 先删替换目标对应旧形态(若有), 再写新形态, 模型同 升级列表 replace_target
                //   normalizeForm 出的 spec 含 _name/_replace(被 ZOD form_item strip, 仅作定位用),
                //   故严格克隆仅保留 form_item schema 字段写入 形态库, 不携带 _name/_replace
                if (forms.length) {
                    _fch.形态库 = _fch.形态库 || {};
                    for (var fk = 0; fk < forms.length; fk++) {
                        var f = forms[fk];
                        // 防御: AI 填的"替换目标"若不在当前形态库(已删除/编造), 强制改成"无"避免对孤儿形态的引用溢出到结果文案
                        if (f._replace && f._replace !== '无' && !_fch.形态库[f._replace]) {
                            f._replace = '无';
                        }
                        if (f._replace && f._replace !== '无' && _fch.形态库[f._replace]) {
                            delete _fch.形态库[f._replace];
                        }
                        // 衍生项(ATK/DEF/MATK/MDEF/AP)值为0的剔除，不写入数据库
                        var _fDerived = ['ATK','DEF','MATK','MDEF','AP'];
                        var _fAttrs = (f.原始属性 && typeof f.原始属性 === 'object') ? Object.assign({}, f.原始属性) : {};
                        for (var _dk = 0; _dk < _fDerived.length; _dk++) {
                            if (String(_fAttrs[_fDerived[_dk]]).trim() === '0') delete _fAttrs[_fDerived[_dk]];
                        }
                        // 形态字段已由"品质"改为"层级"(生命层级 Ⅰ~Ⅸ); 兼容 AI 仍输出 品质 字段做兜底归正
                        var _fTier = f.层级 != null ? f.层级 : f.品质;
                        _fch.形态库[f._name] = {
                            层级:     tierRomanOf(_fTier || 'Ⅰ'),
                            消耗:     f.消耗,
                            冷却:     f.冷却,
                            状态:     f.状态,
                            标签:     f.标签,
                            原始属性: _fAttrs,
                            效果:     f.效果,
                            技能:     f.技能,
                            描述:     f.描述
                        };
                    }
                }
            });
            if (!ok) throw new Error('MVU 写回失败');
            // 升级区本地缓存同步: 立即从 shopMarketData.升级区 移除已被清理的升级条目
            try {
                var freshSd2 = getStatData();
                var freshLib2 = shopGetActorLibRaw(freshSd2 && freshSd2.商城, bloodFusionActionActor);
                if (freshLib2) {
                    shopMarketData = shopNormalizeMarketData(freshLib2);
                    if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
                }
            } catch(eFresh2) {}
            // 融合已成功写入, 回滚快照不再需要
            bloodFusionSnap = null;
            // 先取出前端 roll 出的结果(供结果弹窗显示), 再清理本轮状态
            var rollResult = bloodFusionResult;
            var rollName = rollResult ? rollResult.name : '结果已生成';
            var rollWeight = rollResult ? rollResult.weight : '';
            closeModal(); bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = [];
            renderAll();
            // 清理结果描述中可能残留的"已删除形态/删除 XX 形态"误导文案(AI 偶发对不存在形态的引用)
            var descRaw = String(result.描述 || '主神融合算法已完成本次血统重构。');
            var descClean = descRaw.replace(/已删除(的)?\s*[^，。、;；\n]*形态/g, '已重置形态槽').replace(/删除\s*[^，。、;；\n]*形态/g, '重置形态槽');
            showModal('融合结果 · '+rollName, '<div class="sam-shop-ok">融合完成：'+esc(rollName)+'</div><div class="sam-full-card">'+esc(descClean)+'</div>'
                + (forms.length ? '<div class="sam-shop-ok" style="margin-top:8px">本次融合获得新形态：'+forms.map(function(f){return esc(f._name);}).join('、')+'</div>' : ''));
        } catch(err) {
            bloodFusionResult = null;
            // 回合校验: 已被"停止融合"打断则不再处理失败回滚/弹提示
            if (myEpoch !== bloodFusionEpoch) return;
            // 融合失败: 回滚开始时已扣除的空间币与已删除的商品库
            if (bloodFusionSnap) {
                try {
                    writeBackMvu(function(statData) {
                        statData.角色 = statData.角色 || {};
                        statData.角色.空间币 = safeNum(statData.角色.空间币, 0) + bloodFusionSnap.price;
                        statData.角色.权限凭证 = statData.角色.权限凭证 || {};
                        shopCredentialRefund(statData.角色.权限凭证, bloodFusionSnap.credentialRequirements || {});
                        if (bloodFusionSnap.preBloodLib !== null && statData.商城) {
                            var _rlibF = shopGetActorLibRaw(statData.商城, bloodFusionSnap.preActor);
                            if (_rlibF) _rlibF.血统列表 = bloodFusionSnap.preBloodLib.slice();
                        }
                    });
                } catch(eRoll) { try { console.warn('[主神终端] 融合失败回滚异常:', eRoll.message); } catch(e2){} }
            }
            bloodFusionBusy = false; bloodFusionShopItem = null; bloodFusionResult = null; bloodFusionConsumedNames = []; bloodFusionSnap = null; closeModal();
            renderAll();
            samToast('error', '融合未完成：'+(err && err.message ? err.message : err));
        }
    }
    function bloodFusionDirectPurchase() {
        var item = bloodFusionShopItem, sd = getStatData();
        if (!item || !sd || !sd.角色) return;
        var dpActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
        var dpCtx = shopResolveCharacter(sd, dpActor);
        var dpCh = dpCtx.character;
        if (!dpCh) { samToast('error', '目标角色数据不存在, 无法购买'); return; }
        if (safeNum(sd.角色.空间币, 0) < safeNum(item.price, 0)) { samToast('warning', '空间币不足，无法购买'); return; }
        var dpCredentialRequirements = {};
        var dpCredentialRequirement = shopCredentialRequirement(dpCh, item);
        if (dpCredentialRequirement.required) dpCredentialRequirements[dpCredentialRequirement.grade] = 1;
        var dpCredentialShortages = shopCredentialShortages(sd.角色.权限凭证, dpCredentialRequirements);
        if (dpCredentialShortages.length) { samToast('warning', '权限凭证不足：'+shopCredentialShortageText(dpCredentialShortages)); return; }
        // 血统已满时前端已改走"融合/替换"双选项, 此处仅作兜底静默拦截, 不弹窗
        var cap = BLOODLINE_CAP, count = Object.keys(dpCh.血统 || {}).length;
        if (count >= cap) return;
        var blood = shopToBloodlineVar(item);
        var ok = writeBackMvu(function(statData) {
            var _dctx = shopResolveCharacter(statData, dpActor);
            var _dch = _dctx.character || {};
            _dch.血统 = _dch.血统 || {}; _dch.血统[item.name] = blood;
            statData.角色.权限凭证 = statData.角色.权限凭证 || {};
            if (!shopCredentialConsume(statData.角色.权限凭证, dpCredentialRequirements)) throw new Error('权限凭证扣除失败');
            statData.角色.空间币 = Math.max(0, safeNum(statData.角色.空间币, 0) - safeNum(item.price, 0));
            var _dlib = shopGetActorLibRaw(statData.商城, dpActor);
            if (_dlib && Array.isArray(_dlib.血统列表)) _dlib.血统列表 = _dlib.血统列表.filter(function(x){ return safeStr(x.名称) !== item.name; });
            shopAppendReceipt(statData, shopReceiptLine('购买血统', item.name, item.price, statData.角色.空间币, (dpActor === SHOP_ACTOR_REINCARNATOR ? '角色' : dpActor)));
        });
        if (ok) { closeModal(); bloodFusionShopItem = null; shopCart = []; renderAll(); samToast('success', '已购入血统：'+item.name); }
    }
    /* ★ 商城血统替换: 选择一条现有血统, 用商店购入的新血统直接顶替(不走融合算法, 无随机结果) */
    function openBloodReplaceModal() {
        var item = bloodFusionShopItem;
        if (!item) return;
        var sd = getStatData();
        var rctx = shopResolveCharacter(sd, bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR);
        var rch = rctx.character || {};
        var rblood = rch.血统 || {};
        var rkeys = Object.keys(rblood);
        if (rkeys.length === 0) { samToast('warning', '当前没有可被替换的血统'); return; }
        // 候选按品质降序展示, 默认选中最后一项(通常为品质最低、最适合被替换的)
        var sorted = rkeys.slice().sort(function(p,q){ return bloodFusionRankOf({data:rblood[q]||{}}) - bloodFusionRankOf({data:rblood[p]||{}}); });
        var opts = '';
        for (var i = 0; i < sorted.length; i++) {
            opts += '<option value="'+esc(sorted[i])+'"'+(i === sorted.length-1 ? ' selected' : '')+'>'+esc(sorted[i])+' · '+esc((rblood[sorted[i]]||{}).品质 || 'F')+'</option>';
        }
        var html = '<div style="font-size:12px;color:var(--sam-sub);line-height:1.7;margin-bottom:10px">'
            + '购入 <b style="color:var(--sam-accent)">'+esc(item.name)+' · '+esc(item.rating || 'F')+'</b>(价格 '+safeNum(item.price,0)+' 空间币)后，选中的现有血统将被<b style="color:var(--sam-hp)">永久移除</b>，其关联的升级服务商品同步删除。该操作不可撤销。</div>'
            + '<div style="font-size:11px;color:var(--sam-sub);margin-bottom:4px">选择要被替换的现有血统：</div>'
            + '<select id="sam-replace-target" style="width:100%;padding:6px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:var(--sam-fg);font-size:12px">'+opts+'</select>'
            + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">'
            + '<button type="button" class="sam-confirm-btn cancel sam-fusion-replace-cancel">取消</button>'
            + '<button type="button" class="sam-confirm-btn ok sam-fusion-replace-confirm">确认替换</button>'
            + '</div>';
        showModal('替换血统 · '+item.name, html, true);
    }
    function bloodFusionReplacePurchase(targetName) {
        var item = bloodFusionShopItem, sd = getStatData();
        if (!item || !sd || !sd.角色 || !targetName) return;
        var rpActor = bloodFusionActionActor || SHOP_ACTOR_REINCARNATOR;
        var rpCtx = shopResolveCharacter(sd, rpActor);
        var rpCh = rpCtx.character;
        if (!rpCh) { samToast('error', '目标角色数据不存在, 无法购买'); return; }
        if (!(rpCh.血统 && rpCh.血统[targetName])) { samToast('error', '未找到待替换的血统'); return; }
        if (safeNum(sd.角色.空间币, 0) < safeNum(item.price, 0)) { samToast('warning', '空间币不足，无法购买'); return; }
        var rpCredentialRequirements = {};
        var rpCredentialRequirement = shopCredentialRequirement(rpCh, item);
        if (rpCredentialRequirement.required) rpCredentialRequirements[rpCredentialRequirement.grade] = 1;
        var rpCredentialShortages = shopCredentialShortages(sd.角色.权限凭证, rpCredentialRequirements);
        if (rpCredentialShortages.length) { samToast('warning', '权限凭证不足：'+shopCredentialShortageText(rpCredentialShortages)); return; }
        var blood = shopToBloodlineVar(item);
        var ok = writeBackMvu(function(statData) {
            var _rctx = shopResolveCharacter(statData, rpActor);
            var _rch = _rctx.character || {};
            _rch.血统 = _rch.血统 || {};
            statData.角色.权限凭证 = statData.角色.权限凭证 || {};
            if (!shopCredentialConsume(statData.角色.权限凭证, rpCredentialRequirements)) throw new Error('权限凭证扣除失败');
            delete _rch.血统[targetName];              // 移除被替换的旧血统
            _rch.血统[item.name] = blood;              // 写入商店购入的新血统
            statData.角色.空间币 = Math.max(0, safeNum(statData.角色.空间币, 0) - safeNum(item.price, 0));
            var _rlib = shopGetActorLibRaw(statData.商城, rpActor);
            if (_rlib && Array.isArray(_rlib.血统列表)) _rlib.血统列表 = _rlib.血统列表.filter(function(x){ return safeStr(x.名称) !== item.name; });
            // ★ 同步删除升级服务中针对被替换血统的商品(所属大类=血统 且 replace_target 指向该血统)
            if (_rlib && Array.isArray(_rlib.升级列表)) {
                _rlib.升级列表 = _rlib.升级列表.filter(function(u) {
                    var upCat = String(shopPick(u, 'category','所属大类','类型','type') || '');
                    var tgt = String(shopPick(u, 'replace_target','替换目标') || '');
                    if (upCat === '血统' && tgt && tgt === targetName) return false;
                    return true;
                });
            }
            shopAppendReceipt(statData, shopReceiptLine('替换血统', targetName+' → '+item.name, item.price, statData.角色.空间币, (rpActor === SHOP_ACTOR_REINCARNATOR ? '角色' : rpActor)));
        });
        if (ok) { closeModal(); bloodFusionShopItem = null; shopCart = []; renderAll(); samToast('success', '已替换血统：'+targetName+' → '+item.name); }
    }

    /* ===== 13.5 物资转移(向在场NPC转移装备/道具) ===== */
    var transferTarget = null;                  // 转移目标NPC名
    var transferCart = { 装备: {}, 道具: {} };   // 选中项: { 装备: {key:1}, 道具: {key:qty} }
    function openTransferModal(npcName) {
        var sd = getStatData();
        var npc = sd && sd.关系列表 && sd.关系列表[npcName];
        if (!npc) { samToast('error', '未找到该角色'); return; }
        transferTarget = npcName;
        transferCart = { 装备: {}, 道具: {} };
        showModal('向「'+npcName+'」转移物资', renderTransferList(sd));
    }
    function renderTransferList(sd) {
        var equips = (sd.角色 && sd.角色.装备) || {};
        var backpack = (sd.角色 && sd.角色.道具) || {};
        var eqList = [], bpList = [];
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            if (safeNum(e.状态, 0) === 1) return;   // 已装备: 排除
            if (safeNum(e.类型, 0) === 8) return;    // 特殊类型: 排除
            eqList.push({ key: k, val: e });
        });
        Object.keys(backpack).forEach(function(k) {
            var b = backpack[k] || {};
            if (safeNum(b.数量, 0) <= 0) return;
            bpList.push({ key: k, val: b, qty: safeNum(b.数量, 0) });
        });
        var html = '<div class="sam-trf-list">';
        if (eqList.length) {
            html += '<div class="sam-trf-sec">⚔ 装备 · '+eqList.length+'</div>';
            eqList.forEach(function(it) { html += transferItemCard('装备', it.key, it.val, 1); });
        }
        if (bpList.length) {
            html += '<div class="sam-trf-sec">🎒 道具 · '+bpList.length+'</div>';
            bpList.forEach(function(it) { html += transferItemCard('道具', it.key, it.val, it.qty); });
        }
        if (!eqList.length && !bpList.length) {
            html += '<div class="sam-empty">无可转移物资（已装备与特殊装备已自动排除）</div>';
        }
        html += '</div>';
        var hasSel = Object.keys(transferCart.装备).length + Object.keys(transferCart.道具).length > 0;
        html += '<div class="sam-trf-footer">';
        html += '<div class="sam-trf-warn">⚠️ 确认转移后<strong>不可取消、不可取回</strong>，物资将直接归属目标角色，请认真考虑。</div>';
        html += '<div class="sam-trf-actions">';
        html += '<button type="button" class="sam-trf-btn cancel">取消</button>';
        html += '<button type="button" class="sam-trf-btn confirm"'+(hasSel ? '' : ' disabled')+'>确认转移</button>';
        html += '</div></div>';
        return html;
    }
    function transferItemCard(cat, key, item, maxQty) {
        var sel = transferCart[cat][key] != null;
        var selQty = sel ? transferCart[cat][key] : 0;
        var q = parseRarity(item.品质);
        var isItem = (cat === '道具');
        var corner = sel ? (isItem ? '已选 ×'+selQty : '已选') : '';
        var typeLabel = isItem ? safeStr(item.类型) : (EQUIP_TYPE_MAP[safeNum(item.类型, 0)] || '');
        var attrs = item.原始属性 || {};
        // 展示属性: 品质字母原样显示, 数值隐藏0(与 formatStatGrid / 装备卡一致)
        var attrStr = Object.keys(attrs).filter(function(k) {
            var v = attrs[k];
            if (isStatQuality(v)) return true;
            return safeNum(v, 0) !== 0;
        }).map(function(k) {
            var v = attrs[k];
            return esc(k)+' '+(isStatQuality(v) ? safeStr(v) : safeNum(v, 0));
        }).join(' / ');
        var desc = safeStr(item.描述) || '';
        var inner = '<div class="sam-trf-head"><span class="sam-trf-name">'+esc(key)+'</span><span class="sam-trf-qtag q-'+q+'">'+esc(q)+'</span></div>';
        if (typeLabel) inner += '<div class="sam-trf-sub">'+esc(typeLabel) + (isItem ? ' · 持有 '+maxQty : '') + '</div>';
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
        if (cat === '道具') max = safeNum(sd.角色.道具[key] && sd.角色.道具[key].数量, 1);
        var cur = transferCart[cat][key] != null ? transferCart[cat][key] : 1;
        if (dir === 'plus') cur = Math.min(max, cur + 1);
        else cur = Math.max(1, cur - 1);
        transferCart[cat][key] = cur;
        refreshTransferModal();
    }
    function transferInputQty(cat, key, val) {
        var sd = getStatData();
        var max = 1;
        if (cat === '道具') max = safeNum(sd.角色.道具[key] && sd.角色.道具[key].数量, 1);
        var v = Math.max(1, Math.min(max, parseInt(val, 10) || 1));
        transferCart[cat][key] = v;
        refreshTransferModal();
    }
    function refreshTransferModal() {
        var $body = $('#samsara-modal .sam-modal-body');
        // 列表已改为 body 单层滚动，恢复 body 的 scrollTop
        var saved = $body.length ? ($body[0].scrollTop || 0) : 0;
        var sd = getStatData();
        $body.html(renderTransferList(sd));
        if ($body.length && saved > 0) { try { $body[0].scrollTop = saved; } catch(e){} }
    }
    function executeTransfer() {
        var eqKeys = Object.keys(transferCart.装备);
        var bpKeys = Object.keys(transferCart.道具);
        if (eqKeys.length + bpKeys.length === 0) return;
        var npcName = transferTarget;
        samConfirm('确认转移', '确定将选中的物资转移给「'+npcName+'」吗？此操作不可取消、不可取回。', function() {
            var ok = writeBackMvu(function(statData) {
                if (!statData) return;
                var mc = statData.角色 = statData.角色 || {};
                mc.装备 = mc.装备 || {}; mc.道具 = mc.道具 || {};
                var rel = statData.关系列表 = statData.关系列表 || {};
                var npc = rel[npcName] = rel[npcName] || {};
                npc.装备 = npc.装备 || {}; npc.道具 = npc.道具 || {};
                var movedParts = []; // ★ 实际转移成功的明细, 用于待播报记录
                // 装备: 整件复制给NPC(状态置0未装备), 删除角色的
                eqKeys.forEach(function(key) {
                    var e = mc.装备[key];
                    if (!e) return;
                    var copy = (_ && _.cloneDeep) ? _.cloneDeep(e) : JSON.parse(JSON.stringify(e));
                    copy.状态 = 0;
                    npc.装备[key] = copy;
                    delete mc.装备[key];
                    movedParts.push('装备「' + key + '」');
                });
                // 道具: 按数量转移(NPC已有则累加, 否则新建; 角色扣减, 归0则删)
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
                // ★ 前端赠送NPC物资 → 记入待播报记录(与本次写回同一落盘, 待正文模型叙事后自动清空)
                if (movedParts.length) {
                    shopAppendReceipt(statData, '[赠送][角色] 向「' + npcName + '」转移 ' + movedParts.join('、'));
                }
            });
            if (ok) {
                var cnt = eqKeys.length + bpKeys.length;
                transferCart = { 装备: {}, 道具: {} };
                transferTarget = null;
                closeModal();
                samToast('success', '已向「'+npcName+'」转移 '+cnt+' 项物资');
                renderAll();
            } else {
                samToast('error', '转移失败: 数据写回不可用');
            }
        });
    }

    /* ===== 13b. NPC死亡检测 + 遗物获取(复用转移模板, 方向: NPC→角色, 无二次确认) ===== */
    function isNpcDead(n) {
        if (!n || typeof n !== 'object') return false;
        var hp = safeNum(n.HP, 0);
        if (hp <= 0) return true;
        var isExplicitlyDead = n.状态 && Object.keys(n.状态).some(function(key) { return key.indexOf('死亡') >= 0; });
        return !!isExplicitlyDead;
    }
    var lootTarget = null;
    var lootCart = { 装备: {}, 道具: {} };
    function openLootModal(npcName) {
        var sd = getStatData();
        var npc = sd && sd.关系列表 && sd.关系列表[npcName];
        if (!npc) { samToast('error', '未找到该角色'); return; }
        lootTarget = npcName;
        lootCart = { 装备: {}, 道具: {} };
        showModal('从「'+npcName+'」获取遗物', renderLootList(npc));
    }
    function renderLootList(npc) {
        var equips = npc.装备 || {};
        var backpack = npc.道具 || {};
        var eqList = [], bpList = [];
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            if (safeNum(e.类型, 0) === 8) return;
            eqList.push({ key: k, val: e });
        });
        Object.keys(backpack).forEach(function(k) {
            var b = backpack[k] || {};
            if (safeNum(b.数量, 0) <= 0) return;
            bpList.push({ key: k, val: b, qty: safeNum(b.数量, 0) });
        });
        var html = '<div class="sam-trf-list">';
        if (eqList.length) {
            html += '<div class="sam-trf-sec">⚔ 装备 · '+eqList.length+'</div>';
            eqList.forEach(function(it) { html += lootItemCard('装备', it.key, it.val, 1); });
        }
        if (bpList.length) {
            html += '<div class="sam-trf-sec">🎒 道具 · '+bpList.length+'</div>';
            bpList.forEach(function(it) { html += lootItemCard('道具', it.key, it.val, it.qty); });
        }
        if (!eqList.length && !bpList.length) {
            html += '<div class="sam-empty">该角色身上没有可获取的物资</div>';
        }
        html += '</div>';
        var hasSel = Object.keys(lootCart.装备).length + Object.keys(lootCart.道具).length > 0;
        html += '<div class="sam-trf-footer">';
        html += '<div class="sam-trf-warn">⚠️ 获取遗物后将直接归属角色, 不可退回。</div>';
        html += '<div class="sam-trf-actions">';
        html += '<button type="button" class="sam-loot-btn cancel">取消</button>';
        html += '<button type="button" class="sam-loot-btn confirm"'+(hasSel ? '' : ' disabled')+'>确认获取</button>';
        html += '</div></div>';
        return html;
    }
    function lootItemCard(cat, key, item, maxQty) {
        var sel = lootCart[cat][key] != null;
        var selQty = sel ? lootCart[cat][key] : 0;
        var q = parseRarity(item.品质);
        var isItem = (cat === '道具');
        var corner = sel ? (isItem ? '已选 ×'+selQty : '已选') : '';
        var typeLabel = isItem ? safeStr(item.类型) : (EQUIP_TYPE_MAP[safeNum(item.类型, 0)] || '');
        var attrs = item.原始属性 || {};
        // 展示属性: 品质字母原样显示, 数值隐藏0(与 formatStatGrid / 装备卡一致)
        var attrStr = Object.keys(attrs).filter(function(k) {
            var v = attrs[k];
            if (isStatQuality(v)) return true;
            return safeNum(v, 0) !== 0;
        }).map(function(k) {
            var v = attrs[k];
            return esc(k)+' '+(isStatQuality(v) ? safeStr(v) : safeNum(v, 0));
        }).join(' / ');
        var desc = safeStr(item.描述) || '';
        var inner = '<div class="sam-trf-head"><span class="sam-trf-name">'+esc(key)+'</span><span class="sam-trf-qtag q-'+q+'">'+esc(q)+'</span></div>';
        if (typeLabel) inner += '<div class="sam-trf-sub">'+esc(typeLabel) + (isItem ? ' · 持有 '+maxQty : '') + '</div>';
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
        var npc = sd && sd.关系列表 && sd.关系列表[lootTarget];
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
        var npc = sd && sd.关系列表 && sd.关系列表[lootTarget];
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
        var npc = sd && sd.关系列表 && sd.关系列表[lootTarget];
        if (npc) $body.html(renderLootList(npc));
        if ($body.length && saved > 0) { try { $body[0].scrollTop = saved; } catch(e){} }
    }
    function executeLoot() {
        var eqKeys = Object.keys(lootCart.装备);
        var bpKeys = Object.keys(lootCart.道具);
        if (eqKeys.length + bpKeys.length === 0) return;
        var npcName = lootTarget;
        var ok = writeBackMvu(function(statData) {
            if (!statData) return;
            var mc = statData.角色 = statData.角色 || {};
            mc.装备 = mc.装备 || {}; mc.道具 = mc.道具 || {};
            var rel = statData.关系列表 = statData.关系列表 || {};
            var npc = rel[npcName] = rel[npcName] || {};
            npc.装备 = npc.装备 || {}; npc.道具 = npc.道具 || {};
            var lootedParts = []; // ★ 实际拿取成功的明细, 用于待播报记录
            // 装备: 从NPC复制给角色(状态置0), 删除NPC的
            eqKeys.forEach(function(key) {
                var e = npc.装备[key];
                if (!e) return;
                var copy = (_ && _.cloneDeep) ? _.cloneDeep(e) : JSON.parse(JSON.stringify(e));
                copy.状态 = 0;
                mc.装备[key] = copy;
                delete npc.装备[key];
                lootedParts.push('装备「' + key + '」');
            });
            // 道具: 按数量从NPC转移给角色
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
            // ★ 前端从NPC拿取物资 → 记入待播报记录(与本次写回同一落盘, 待正文模型叙事后自动清空)
            if (lootedParts.length) {
                shopAppendReceipt(statData, '[获取][角色] 从「' + npcName + '」处获得 ' + lootedParts.join('、'));
            }
        });
        if (ok) {
            var cnt = eqKeys.length + bpKeys.length;
            lootCart = { 装备: {}, 道具: {} };
            lootTarget = null;
            closeModal();
            samToast('success', '从「'+npcName+'」获取 '+cnt+' 项遗物');
            renderAll();
        } else {
            samToast('error', '获取失败: 数据写回不可用');
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
            if ($(this).is('[disabled]')) return; // 不足2条血统: 开始融合按钮灰度不响应
            bloodFusionStart($('.sam-fusion-select[data-fusion-role="a"]').val(), $('.sam-fusion-select[data-fusion-role="b"]').val());
        });
        $(document).off('click.samFusionDirect').on('click.samFusionDirect', '.sam-fusion-direct', function(e) {
            e.stopPropagation();
            if ($(this).is('[disabled]')) return; // 血统已满: 灰度按钮不响应
            if (bloodFusionShopItem) bloodFusionDirectPurchase(); else closeModal();
        });
        // ★ 商城血统替换流程(血统栏已满时): 打开选择弹窗 / 取消返回融合舱 / 确认执行替换
        $(document).off('click.samFusionReplaceOpen').on('click.samFusionReplaceOpen', '.sam-fusion-replace-open', function(e) {
            e.stopPropagation();
            if ($(this).is('[disabled]')) return;
            openBloodReplaceModal();
        });
        $(document).off('click.samFusionReplaceCancel').on('click.samFusionReplaceCancel', '.sam-fusion-replace-cancel', function(e) {
            e.stopPropagation();
            openBloodFusionModal(bloodFusionShopItem); // 返回融合舱
        });
        $(document).off('click.samFusionReplaceConfirm').on('click.samFusionReplaceConfirm', '.sam-fusion-replace-confirm', function(e) {
            e.stopPropagation();
            var tgt = $('#sam-replace-target').val();
            if (!tgt) { samToast('warning', '请先选择要替换的血统'); return; }
            bloodFusionReplacePurchase(tgt);
        });
        // ★ A/B 下拉框联动: 改变一方时, 另一方排除新选中值(避免A=B); 若对方当前值被排除则回退到第一个可用项
        $(document).off('change.samFusionSync').on('change.samFusionSync', '.sam-fusion-select', function(e) {
            e.stopPropagation();
            var role = $(this).attr('data-fusion-role') || 'a';
            bloodFusionSyncSelect(role);
        });
        // 关闭(编辑模式开启时, 先退出编辑模式再关闭面板)
        $panel.off('click.samClose').on('click.samClose', '.sam-icon-btn.close', function() {
            if (isEditMode()) setEditMode(false);
            if ($('#samsara-panel').hasClass('open')) toggleSamsaraPanel();
        });
        // 刷新(编辑模式开启时, 先退出编辑模式再刷新数据)
        $panel.off('click.samRefresh').on('click.samRefresh', '.sam-icon-btn.refresh', function() {
            if (isEditMode()) setEditMode(false);
            renderAll();
            try { console.log('%c[主神终端] 🔄 手动刷新', 'color:#8f9fff'); } catch(e){}
        });
        // 设置
        $panel.off('click.samSettings').on('click.samSettings', '.sam-icon-btn.settings', function() { openSettings(); });
        // Tab切换
        $panel.off('click.samTab').on('click.samTab', '.sam-tab-btn', function() {
            var tab = $(this).data('tab');
            if (tab === 'world') {
                var engine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
                if (engine && typeof engine.isConfigured === 'function' && engine.isConfigured()) {
                    engine.open();
                    return;
                }
                // 世界推进总开关关闭（或独立脚本未加载）时，恢复原来的世界面板。
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
        // 子Tab切换
        $panel.off('click.samSubtab').on('click.samSubtab', '.sam-subtab', function() {
            var sub = $(this).data('sub');
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            $panel.find('.sam-subpane').removeClass('active').hide();
            $panel.find('.sam-subpane[data-sub="'+sub+'"]').addClass('active').show();
            // 记住关系面板当前激活的子Tab, 避免 renderAll 后跳回"全部"
            try { relationActiveSub = sub; } catch(e) {}
        });
        // 卡片点击→详情弹窗
        $panel.off('click.samCard').on('click.samCard', '.sam-card', function(e) {
            if ($(e.target).closest('.sam-tier-infuse-btn').length) return;
            var path = $(this).data('path');
            // ★ 编辑模式: NPC 卡片仍放行(弹角色档案以编辑其数据); 其他卡片保持拦截,避免误触只读详情
            var isNpcPath = (typeof path === 'string' && path.indexOf('关系列表.') === 0);
            if (isEditMode() && !isNpcPath) return;
            var title = $(this).data('title') || '详情';
            if (path) openDetailModal(path, title);
        });
        // NPC删除按钮(编辑模式)→从MVU删除该NPC
        $panel.off('click.samNpcDel').on('click.samNpcDel', '.sam-npc-del', function(e) {
            e.stopPropagation();
            var name = $(this).data('del-npc');
            if (!name) return;
            deleteNpc(name);
        });
        // ★ NPC转移按钮(在场NPC)→打开物资转移弹窗
        $panel.off('click.samTransfer').on('click.samTransfer', '.sam-npc-transfer', function(e) {
            e.stopPropagation();
            var name = $(this).data('transfer-npc');
            if (name) openTransferModal(name);
        });
        // ★ NPC获取遗物按钮(死亡NPC)→打开获取弹窗
        $panel.off('click.samLoot').on('click.samLoot', '.sam-npc-loot', function(e) {
            e.stopPropagation();
            var name = $(this).data('loot-npc');
            if (name) openLootModal(name);
        });
        // ★ 获取弹窗内交互(委托到document)
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
        // ★ 转移弹窗内交互(委托到document, 因modal容器首次showModal时才创建)
        $(document).off('click.samTrfItem').on('click.samTrfItem', '.sam-trf-item', function(e) {
            if ($(e.target).closest('.sam-trf-qty').length) return; // 数量控件区不触发toggle
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
        // ★ 世界条目删除按钮(编辑模式, 探索点/势力)→从MVU删除该条目
        $panel.off('click.samWorldDel').on('click.samWorldDel', '.sam-rumor-del-btn[data-world-del]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-del-path') || '';
            if (!path) return;
            // 解析出父路径和末段key(用于确认文案)
            var parts = path.split('.');
            var key = parts.pop();
            var parentPath = parts.join('.');
            var label = key;
            samConfirm('删除条目', '确定删除「'+label+'」吗？此操作不可撤销。', function() {
                deleteWorldEntry(path, parentPath, key);
            });
        });
        // ★ 资产删除按钮(编辑模式)→从MVU删除该资产(复用通用按点路径删除)
        $panel.off('click.samAssetDel').on('click.samAssetDel', '.sam-fc-del-btn[data-asset-del]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-asset-del') || '';
            if (!path) return;
            var parts = path.split('.');
            var key = parts.pop();
            var parentPath = parts.join('.');
            samConfirm('删除资产', '确定删除资产「'+key+'」吗？此操作不可撤销。', function() {
                deleteWorldEntry(path, parentPath, key);
            });
        });
        // ★ 建设序列删除按钮(编辑模式)→从MVU删除该建设序列
        $panel.off('click.samAssetSeqDel').on('click.samAssetSeqDel', '.sam-fc-del-btn[data-asset-seq-del]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-asset-seq-del') || '';
            if (!path) return;
            var parts = path.split('.');
            var key = parts.pop();
            var parentPath = parts.join('.');
            samConfirm('删除建设序列', '确定删除建设序列「'+key+'」吗？此操作不可撤销。', function() {
                deleteWorldEntry(path, parentPath, key);
            });
        });
        // ★ R21-传闻交易: 可交易按钮 → 发送文字到输入框(找{卖家}购买情报「{名}」)
        $panel.off('click.samRumorTrade').on('click.samRumorTrade', '.sam-rumor-trade-btn', function(e) {
            e.stopPropagation();
            var name = $(this).attr('data-rumor-name') || '';
            var seller = $(this).attr('data-rumor-seller') || '不明';
            if (!name) return;
            var text = '找'+seller+'购买情报「'+name+'」';
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '已发送到输入框: '+text);
            else samToast('warning', '未找到输入框, 已复制到剪贴板');
        });
        // ★ 经营面板: 待办事件整条可点击 → 将该条文本填入输入框
        $panel.off('click.samAssetTodo').on('click.samAssetTodo', '.sam-asset-todo-item.clickable', function(e) {
            e.stopPropagation();
            var text = $(this).attr('data-asset-todo') || '';
            if (!text) return;
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '已填入输入框');
            else samToast('warning', '未找到输入框');
        });
        // ★ R21-传闻交易: 单条删除按钮 → 写回MVU删除该条传闻(需确认)
        $panel.off('click.samRumorDel').on('click.samRumorDel', '.sam-rumor-del-btn[data-rumor-del]', function(e) {
            e.stopPropagation();
            var section = $(this).attr('data-rumor-section') || '';
            var name = $(this).attr('data-rumor-name') || '';
            if (!section || !name) return;
            samConfirm('删除传闻', '确定删除「'+name+'」这条'+section+'吗？此操作不可撤销。', function() {
                handleRumorDelete(section, name);
            });
        });
        // ★ R21-传闻交易: 分类一键清除 → 清空该分类(街头巷议/情报交易/布告与檄文), 需确认
        $panel.off('click.samRumorClearSec').on('click.samRumorClearSec', '.sam-rumor-clear-btn', function(e) {
            e.stopPropagation();
            e.preventDefault(); // 阻止 summary 展开/收起
            var section = $(this).attr('data-rumor-clear-section') || '';
            if (!section) return;
            samConfirm('清空分类', '确定一键清除「'+section+'」中的全部传闻吗？此操作不可撤销。', function() {
                handleRumorClearSection(section);
            });
        });
        // ★ R21-传闻交易: 顶部一键删除全部传闻 → 清空 传闻.街头巷议/情报交易/布告与檄文, 需确认
        $panel.off('click.samRumorClearAll').on('click.samRumorClearAll', '.sam-rumor-clearall-btn', function(e) {
            e.stopPropagation();
            samConfirm('删除全部传闻', '确定删除全部传闻(街头巷议/情报交易/布告与檄文)吗？此操作不可撤销。', function() {
                handleRumorClearAll();
            });
        });
        // 装备/道具操作按钮(穿戴/脱下/存放/取回/删除)→写回MVU+刷新
        $panel.off('click.samAct').on('click.samAct', '.sam-act-btn', function(e) {
            e.stopPropagation();
            var $b = $(this);
            var action = $b.attr('data-act');
            // 形态激活/取消激活按钮(单独分发, 不走装备/道具 handler)
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
            // 删除操作先弹二级确认框, 确认后再执行
            if (action === 'delete') {
                var label = key || (path ? path.split('.').pop() : '');
                var cat = (kind === 'equip') ? '装备' : '道具';
                samConfirm('删除'+cat, '确定删除'+cat+'「'+label+'」吗？此操作不可撤销。', function() {
                    handleItemAction(action, path, kind, type, key);
                });
                return;
            }
            handleItemAction(action, path, kind, type, key);
        });
        // 状态按钮点击→二级详情弹窗(复用主面板卡片渲染风格)
        // ★ 编辑模式: 状态详情也走递归编辑渲染(renderDetailNode 编辑态), 底部追加保存按钮
        $panel.off('click.samBuff').on('click.samBuff', '.sam-buff-chip', function() {
            var name = $(this).data('name');
            var path = $(this).data('path');
            var sd = getStatData();
            if (!sd || !path) return;
            var obj = resolvePath(sd, path);
            if (!obj) return;
            var ed = isEditMode();
            var html = renderDetailNode(obj, ['真属性'], ['状态', name], ed, ed ? path : '');
            if (!ed) {
                // 只读态兜底: 空对象(如仅有真属性被屏蔽)给出占位
                if (!html || !html.trim()) html = '<div class="sam-empty">无可见内容</div>';
                showModal(name + ' · 状态详情', '<div class="sam-detail">'+html+'</div>');
                return;
            }
            var foot = '<div class="sam-nd-edit-tip">✎ 编辑模式 · 点击数值就地修改, 失焦自动暂存</div><button type="button" class="sam-save-btn sam-nd-save">💾 保存</button>';
            showModal(name + ' · 状态详情 · 编辑', '<div class="sam-detail">'+html+'</div>'+foot);
            bindEditorEvents($('#samsara-modal')); // modal 独立DOM, 需单独委托编辑事件
        });
        // ★ 职业结构化编辑器事件已迁移至 bindEditorEvents($root)(panel/modal 共用)
        // ★ 源力灌注：角色/队友共用同一执行器；只允许当前层级→下一层级。
        $panel.off('click.samSourceInfusion').on('click.samSourceInfusion', '.sam-tier-infuse-btn', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openSourceInfusion($(this).attr('data-tier-target') || '角色');
        });
        // ★ 进阶按钮(层级进度条中部): 属性总点达下层级下限才显示; 战斗中拦截
        //   - 申请进阶(进阶试炼未完成): 发送"【当前进阶条件已满足，申请进阶试炼】"到输入框
        //   - 开始进阶(试炼已完成): writeBackMvu(角色.层级=nextTier) + renderAll() 刷新进度条/顶部层级
        $panel.off('click.samTierAdv').on('click.samTierAdv', '.sam-tier-adv-btn', function(e) {
            e.stopPropagation();
            var $b = $(this);
            var act = $b.attr('data-tier-act') || '';
            var nextTier = $b.attr('data-tier-next') || '';
            var sd = getStatData();
            if (!sd || !sd.角色) { samToast('error', '数据未就绪'); return; }
            var sys = sd.系统状态 || {};
            // 战斗中拦截: 任何进阶操作均不可在战斗中执行
            if (sys.是否战斗中 === true) {
                samToast('warning', '请在安全区域内再重新尝试');
                return;
            }
            if (act === 'apply') {
                if (sys.是否可试炼 !== true || sys.试炼已完成 === true) { samToast('warning', '晋升条件已变化，请刷新后重试'); renderAll(); return; }
                // 申请进阶: 写入一句话到输入框(同情报交易可购买按钮, 不自动发送)
                var text = '当前进阶条件已满足，申请【晋升试炼任务】';
                var ok = sendToInputBox(text, false);
                if (ok) samToast('success', '已发送到输入框: '+text);
                else samToast('warning', '未找到输入框, 已复制到剪贴板');
            } else if (act === 'start') {
                // 开始进阶: 直接提升角色层级到下一级(F→E→...→SSS), 进阶试炼完成后执行
                var advance = validateTrialAdvancement(sd, nextTier);
                if (advance.error) { samToast('warning', advance.error); renderAll(); return; }
                nextTier = advance.nextTier;
                // ★ 传入层级通行证: replaceMvuData 异步触发的二次 VARIABLE_UPDATE_ENDED
                //   不在 __samsaraUIMutation 窗口期内, 需凭通行证放行层级变化(否则被守卫回滚)
                var ok2 = writeBackMvu(function(statData) {
                    var latestAdvance = validateTrialAdvancement(statData, nextTier);
                    if (latestAdvance.error) throw new Error(latestAdvance.error);
                    if (statData.角色) {
                        var oldTier = normalizeLifeTier(statData.角色.层级);
                        statData.角色.层级 = nextTier;
                        shopAppendReceipt(statData, '[普升][角色] 晋升试炼完成：'+oldTier+' → '+nextTier);
                    }
                    // 进阶完成后重置试炼标记, 为下一轮进阶流程做准备
                    if (statData.系统状态) statData.系统状态.试炼已完成 = false;
                }, { tierPermit: nextTier });
                if (ok2) {
                    samToast('success', '层级已提升至 '+nextTier+' 级');
                    renderAll(); // 刷新进度条与顶部层级显示, 按钮随之隐藏(达新层级未满足下一级条件)
                } else {
                    samToast('error', '进阶失败: MVU写回不可用');
                }
            }
        });
        // ★ 结算任务按钮: 顶栏入口；副本内非战斗时常驻显示，点击发送【结算任务】到输入框
        $panel.off('click.samMissionSettle').on('click.samMissionSettle', '[data-mission-settle]', function(e) {
            e.stopPropagation();
            var text = '【结算任务】';
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '已发送到输入框: '+text);
            else samToast('warning', '未找到输入框, 已复制到剪贴板');
        });
        // ★ 血统/形态/技能卡片删除按钮(编辑模式显示): 二级确认 → 写回MVU删除
        $panel.off('click.samFcDel').on('click.samFcDel', '.sam-fc-del-btn[data-del-path]', function(e) {
            e.stopPropagation();
            var path = $(this).attr('data-del-path') || '';
            if (!path) return;
            // 提取末段名用于提示
            var seg = path.split('.');
            var name = seg[seg.length - 1] || path;
            samConfirm('确认删除', '确定要删除「'+name+'」吗? 此操作将写入变量并刷新面板。', function() {
                var ok = writeBackMvu(function(statData) {
                    if (!statData) return;
                    var cur = statData, i;
                    for (i = 0; i < seg.length - 1; i++) {
                        if (!cur[seg[i]] || typeof cur[seg[i]] !== 'object') return;
                        cur = cur[seg[i]];
                    }
                    if (cur[seg[seg.length - 1]] !== undefined) delete cur[seg[seg.length - 1]];
                    // ★ 删除形态库中的形态时, 若该形态正被角色"当前形态"激活/引用,
                    //   须同步重置 当前形态(激活:false, 名称清空), 否则残留指向已删除形态,
                    //   会导致后续血统购买/AI 拼附形构筑时持续误读为"已存在的形态", 拒绝或报错
                    if (seg.length === 3 && seg[0] === '角色' && seg[1] === '形态库'
                        && statData.角色 && statData.角色.当前形态) {
                        var cf = statData.角色.当前形态;
                        if (cf && cf.名称 === name) {
                            cf.激活 = false; cf.名称 = '';
                        }
                    }
                });
                if (ok) {
                    samToast('success', '已删除: '+name);
                    renderAll();
                } else {
                    samToast('error', '删除失败: MVU写回不可用');
                }
            });
        });
        // ★ 选择世界按钮(顶栏, 仅在主神空间且非战斗时渲染): 点击发送【选择世界】到输入框
        $panel.off('click.samChooseWorld').on('click.samChooseWorld', '[data-choose-world]', function(e) {
            e.stopPropagation();
            var text = '【选择世界】';
            var ok = sendToInputBox(text, false);
            if (ok) samToast('success', '已发送到输入框: '+text);
            else samToast('warning', '未找到输入框, 已复制到剪贴板');
        });
        // ★ 商城刷新商品按钮: 调正文AI generateRaw 按新ZOD结构生成商品库, 写回 stat_data.商城
        $panel.off('click.samShopRefresh').on('click.samShopRefresh', '.sam-shop-refresh-btn', async function(e) {
            e.stopPropagation();
            var $btn = $(this);
            if ($btn.is('[disabled]')) return;
            var $req = $panel.find('.sam-shop-req').first();
            var req = $req.length ? String($req.val() || '').trim() : '';
            // 保存需求输入到模块级(刷新后 renderAll 重建DOM仍能回填, 不清除: 不满意可继续刷)
            shopReqText = req;
            
            var content = ''
                + '属性系统 (底层定义):\n'
                + '  基础五维 (判定依据):\n'
                + '    力量: 近战/负重/破坏\n'
                + '    敏捷: 平衡/潜行/瞄准\n'
                + '    体质: 生命/耐性/恢复\n'
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
                + '    先攻DC: 行动顺序\n'
                + '    防御DC: 被命中难度\n';
            // 获取世界书内容的调用
            content += await getWorldBookContent('⚙️生命层级与社会生态'); 
            content += await getWorldBookContent('⚙️品质效果数值规则'); 
            content += await getWorldBookContent('⚙️实体生成规则'); 
            content += await getWorldBookContent('⚙️状态协议'); 
            content += await getWorldBookContent('⚙️行为判定[mvu_plot]'); 
            
            if (content) {
                // 在这里可以把拿到的世界书内容传进去
                handleShopRefresh(req, content); 
            }
        });
        // ★ 需求输入框: 输入时实时同步到模块级 shopReqText, 切Tab/其他 renderAll 重建DOM仍能回填(不丢内容)
        $panel.off('input.samShopReq').on('input.samShopReq', '.sam-shop-req', function() {
            shopReqText = String($(this).val() || '');
        });
        // ★ "停止"按钮(商城停止刷新 / 血统融合停止): 通过 data-sam-act 分发, dub 打断卡死的AI请求并推进对应 epoch 让旧 Promise 回调丢弃结果
        $panel.off('click.samShopStop').on('click.samShopStop', '.sam-shop-stop-btn', function(e) {
            e.stopPropagation();
            var act = String($(this).attr('data-sam-act') || '');
            if (act === 'blood-fusion-stop') bloodFusionStop();
            else shopStopRefresh();
        });
        // 待播报记录: 用户手动清空(模型正常叙事后也会通过JSONPatch自动清空)
        $panel.off('click.samReceiptClear').on('click.samReceiptClear', '[data-receipt-clear]', function(e) {
            e.stopPropagation();
            shopClearReceipt();
        });
        // ★ 商城市场区: 区域Tab切换(装备|道具|技能|血统)
        $panel.off('click.samShopTab').on('click.samShopTab', '.sam-shop-tab', function(e) {
            e.stopPropagation();
            var tab = $(this).attr('data-shop-tab');
            if (!tab || tab === shopActiveTab) return;
            shopActiveTab = tab;
            shopActiveSlot = ''; // 切区时重置槽位
            shopRefreshMarket();
        });
        // ★ 持有面板: 子Tab切换(战术栏|装备背包|道具背包|仓库)
        $panel.off('click.samHoldTab').on('click.samHoldTab', '.sam-hold-tab', function(e) {
            e.stopPropagation();
            var tab = $(this).attr('data-hold-tab');
            if (!tab || tab === holdActiveTab) return;
            holdActiveTab = tab;
            holdTypeFilter = ''; // 切换子Tab时重置类型筛选(每个Tab的分类体系不同)
            // 仅切换Tab条active态 + 局部替换内容区(不重建Tab条, 消除整排抖动/错位)
            $panel.find('.sam-hold-tab').removeClass('active');
            $(this).addClass('active');
            var sdHold = getStatData();
            if (sdHold) {
                // 分类行随内容一起重建(不同Tab类型集合不同; 外层容器常驻, 空Tab时清空内容)
                $('#sam-hold-types-wrap').html(renderHoldTypeRow(sdHold));
                $('#sam-hold-body').html(renderHoldBody(sdHold));
            }
        });
        // ★ 持有面板: 专属分类行筛选(全部/各类型) —— 点击后仅刷新 active 态 + 内容区, 不重建Tab条与分类行结构
        //   分类很多时行内横向滚动; 点击视口边缘外的胶囊时把它平滑滚入可见区域(inline:center)
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
        // ★ 商城市场区: 装备区 左nav槽位切换
        $panel.off('click.samShopSlot').on('click.samShopSlot', '.sam-shop-nav-btn', function(e) {
            e.stopPropagation();
            var slot = $(this).attr('data-shop-slot');
            if (!slot || slot === shopActiveSlot) return;
            shopActiveSlot = slot;
            shopRefreshMarket();
        });
        // ★ 商城市场区: 商品卡片点击(选中/取消); 道具区不响应卡片整体点击(由数量控件决定)
        $panel.off('click.samShopItem').on('click.samShopItem', '.sam-shop-item', function(e) {
            // 若点击源自数量控件(按钮/输入框), 则放行由 qty 委托处理
            var $tgt = $(e.target);
            if ($tgt.closest('.sam-shop-qty').length) return;
            // 技能折叠块(<details>/<summary>)的点击不触发卡片选中/加数量, 否则与商品选中冲突
            if ($tgt.closest('.sam-shop-sk-list').length) return;
            e.stopPropagation();
            var $card = $(this);
            // 禁用态拦截: 按禁用原因给出对应提示
            if ($card.hasClass('disabled')) {
                var reason = $card.attr('data-dis-reason');
                if (reason === 'fusionbusy') { samToast('warning', '血统融合进行中, 请等待融合完成后再购买血统'); return; }
                if (reason === 'permission') { samToast('warning', '权限不足, 当前层级/权限凭证无法购买该档位商品'); return; }
                samToast('warning', '空间币不足, 无法购买'); return;
            }
            var name = $card.attr('data-name');
            var cat  = $card.attr('data-cat');
            var slot = $card.attr('data-slot') || '';
            if (!name || !cat) return;
            // 道具区: 点击卡片=+1数量(便捷操作); 加1前预检余额
            if (cat === '道具区') {
                var cur = 0, unitPrice = 0;
                for (var i = 0; i < shopCart.length; i++) {
                    if (shopCart[i].name === name && shopCart[i]._cat === cat) { cur = shopCart[i].quantity || 0; unitPrice = Number(shopCart[i].price || 0); break; }
                }
                if (!unitPrice) {
                    var fnd = shopFindItems(cat, slot, name);
                    if (fnd.length) unitPrice = Number(fnd[0].price || 0);
                }
                var coinNow = (function(){ var sd = getStatData(); return sd && sd.角色 ? safeNum(sd.角色.空间币, 0) : 0; })();
                // 剩余余额 = 原始余额 - 已选合计(含本商品已选数量)
                var remainNow = shopRemain(coinNow) + (cur * unitPrice); // 移除本商品已占额度后才是真正可加的剩余
                if (remainNow < unitPrice * (cur + 1)) { samToast('warning', '空间币不足, 无法再加1(剩余 '+remainNow.toLocaleString()+')'); return; }
                shopSetQty(name, cat, cur + 1);
                return;
            }
            var items = shopFindItems(cat, slot, name);
            if (items.length) shopToggleSelect(items[0], cat, slot);
        });
        // ★ 商城市场区: 道具数量控件(+/− 按钮 + 输入框); 加数量时预检余额
        $panel.off('click.samShopQty').on('click.samShopQty', '.sam-shop-qty-btn', function(e) {
            e.stopPropagation();
            var $btn = $(this);
            var name = $btn.attr('data-name');
            var isPlus = ($btn.attr('data-shop-qty-btn') === 'plus');
            var $inp = $btn.siblings('.sam-shop-qty-inp').first();
            var cur = $inp.length ? (parseInt($inp.val(), 10) || 0) : 0;
            var nxt = Math.max(0, cur + (isPlus ? 1 : -1));
            if (isPlus && nxt > cur) {
                // 查单价并预检余额
                var up = 0;
                for (var k = 0; k < shopCart.length; k++) { if (shopCart[k].name === name && shopCart[k]._cat === '道具区') { up = Number(shopCart[k].price || 0); break; } }
                if (!up) { var f = shopFindItems('道具区', '', name); if (f.length) up = Number(f[0].price || 0); }
                var cn = (function(){ var sd = getStatData(); return sd && sd.角色 ? safeNum(sd.角色.空间币, 0) : 0; })();
                // 剩余余额 = 原始余额 - 已选合计; 但本商品已选数量应排除(因为是把它从 cur 改到 nxt)
                var curQty = shopGetQty(name, '道具区') || 0;
                var remainB = shopRemain(cn) + (curQty * up);
                if (remainB < up * nxt) { samToast('warning', '空间币不足, 无法加到 '+nxt+' 件(剩余 '+remainB.toLocaleString()+')'); return; }
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
            // 余额预检: 直接输入大数字也需拦截(防止绕过 +/- 按钮的预检)
            if (qty > 0) {
                var upInp = 0;
                for (var k2 = 0; k2 < shopCart.length; k2++) { if (shopCart[k2].name === name && shopCart[k2]._cat === '道具区') { upInp = Number(shopCart[k2].price || 0); break; } }
                if (!upInp) { var fInp = shopFindItems('道具区', '', name); if (fInp.length) upInp = Number(fInp[0].price || 0); }
                var cnInp = (function(){ var sd = getStatData(); return sd && sd.角色 ? safeNum(sd.角色.空间币, 0) : 0; })();
                var curQtyInp = shopGetQty(name, '道具区') || 0;
                var remainInp = shopRemain(cnInp) + (curQtyInp * upInp);
                if (remainInp < upInp * qty) {
                    // 计算可承受最大数量, 回填并提示
                    var maxQty = upInp > 0 ? Math.floor(remainInp / upInp) : qty;
                    if (maxQty < 0) maxQty = 0;
                    samToast('warning', '空间币不足, 最多可购 '+maxQty+' 件(剩余 '+remainInp.toLocaleString()+')');
                    qty = maxQty;
                    $inp.val(qty);
                }
            }
            shopSetQty(name, '道具区', qty);
        });
        // ★ 商城市场区: 执行交易按钮
        $panel.off('click.samShopExec').on('click.samShopExec', '.sam-shop-exec-btn', function(e) {
            e.stopPropagation();
            var $btn = $(this);
            if ($btn.is('[disabled]')) return;
            shopHandleExec();
        });
        // ★ 商城: 切换购买目标角色下拉框
        //   切换时: 校验入参合法性; 若刷新进行中则忽略(下拉框已置灰, 双保险);
        //   持久化保存当前角色购物状态不需要额外操作(库存已持久化到 MVU 成员商库);
        //   切换后清空购物车(避免为上一角色购买的商品误派发到新角色) + 重置激活区域 + 重渲染
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
                if (!okOpt) { samToast('warning', '该角色不可选(可能已离场或非队友)'); return; }
            }
            shopCurrentActor = newActor;
            // 清空购物车(每角色库存独立, 切换角色时上一角色的待买清单不保留)
            shopCart = [];
            shopActiveTab = '';
            shopActiveSlot = '';
            renderAll();
        });
        // ★ 编辑器事件(点击即编辑/失焦暂存/字段开关): 提取为独立函数, panel 与 modal(独立DOM)共用
        bindEditorEvents($panel);
        // 保存按钮
        $(document).off('click.samSave').on('click.samSave', '.sam-save-btn', saveEdits);
        // <details> 折叠记忆: 监听 summary 点击(用户主动切换), 记录open状态供下次渲染还原
        // 注: 用 click 而非原生 toggle 事件, 因 jQuery 对 toggle 的委托在部分版本有兼容问题;
        // key 取 summary 文本并剥离尾部 "(N)" 数量括号, 保证跨数据增减稳定匹配
        $panel.off('click.samDetails').on('click.samDetails', 'details > summary', function(e) {
            // 仅处理本面板内栏目标题点击(冒泡到的 summary)
            var $d = $(this).closest('details');
            if (!$d.length) return;
            // 异步读取: click 先触发默认toggle切换, 之后再读 open 属性
            var $sum = $(this);
            setTimeout(function() {
                var raw = $sum.text().trim();
                var key = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
                if (key) detailsOpenState[key] = $d.prop('open');
            }, 0);
        });
    }
    /* 编辑器事件绑定: $root 可为 #samsara-panel 或 #samsara-modal (两者为兄弟节点, 需分别委托) */
    function bindEditorEvents($root) {
        if (!$root || !$root.length) return;
        // 编辑器input变更(实时暂存, 不立即写回)
        $root.off('input.samEdit change.samEdit', '.sam-edit-input').on('input.samEdit change.samEdit', '.sam-edit-input', function() {
            $(this).addClass('sam-dirty');
        });
        // 点击即编辑: 点击显示态(.sam-ed-wrap)→插入真实输入框→聚焦
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
        // 失焦/回车: 暂存到pendingEdits并还原显示态
        $root.off('blur.samEd keydown.samEd', '.sam-edit-active').on('blur.samEd', '.sam-edit-active', function() {
            flushStagedDisplay($(this));
        });
        $root.on('keydown.samEd', '.sam-edit-active', function(e) {
            if (e.which === 13 && $(this).is('input')) { e.preventDefault(); this.blur(); }
            else if (e.which === 27) { e.preventDefault(); this.blur(); }
        });
        // 字段级开关(编辑模式内)
        $root.off('click.samFieldToggle').on('click.samFieldToggle', '.sam-toggle-switch[data-toggle="field"]', function(e) {
            e.stopPropagation();
            $(this).toggleClass('on');
            var path = $(this).data('path');
            if (path) stageEdit(path, $(this).hasClass('on'), 'toggle');
        });
        // ★ 职业结构化编辑器: 输入失焦/变更→重组暂存; 删除→移除卡片重组; 添加→追加空卡片重组
        //   (modal 内编辑职业时同样生效, occEditAdd 已按 data-occ-path 全局 filter 查找容器)
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
    /* ===== 14b. 立绘相关事件绑定(头像点击放大/上传 + 查看器关闭) ===== */
    function bindPortraitEvents() {
        // 角色头像点击: 不管有无立绘, 直接弹自定义立绘框(不再放大/不再有✎角标)
        $(document).off('click.samPortrait', '.sam-avatar').on('click.samPortrait', '.sam-avatar', function(e) {
            e.stopPropagation();
            openReincarnatorPortraitUp();
        });
        // NPC头像点击: 不管有无立绘, 直接弹自定义立绘框(阻止冒泡到卡片详情)
        $(document).off('click.samNpcAvatar', '.sam-npc-avatar').on('click.samNpcAvatar', '.sam-npc-avatar', function(e) {
            e.stopPropagation();
            openPortraitUpload($(this).data('name') || '');
        });
        // NPC无立绘时的"立绘"小按钮→上传(阻止冒泡)
        $(document).off('click.samNpcPortraitBtn', '.sam-npc-portrait-btn').on('click.samNpcPortraitBtn', '.sam-npc-portrait-btn', function(e) {
            e.stopPropagation();
            openPortraitUpload($(this).data('name') || '');
        });
        // 立绘查看器点击关闭
        $(document).off('click.samPvClose', '#samsara-portrait-viewer').on('click.samPvClose', '#samsara-portrait-viewer', function() {
            $(this).removeClass('show');
        });
    }

    /* ===== 15. 设置弹窗 ===== */
    /* ===== 15a. MVU变量更新方式（额外API / 随主AI） ===== */
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
        if (!getNames || !getWorldbookFn || !updateWorldbookFn) return { ok:false, error:'未检测到世界书切换接口，请确认酒馆助手脚本已启用。' };

        var namesInfo;
        try { namesInfo = await Promise.resolve(getNames('current')); }
        catch(e) { return { ok:false, error:'读取当前角色世界书失败: ' + (e && e.message ? e.message : e) }; }
        namesInfo = namesInfo || {};
        var worldbookNames = [];
        [namesInfo.primary].concat(Array.isArray(namesInfo.additional) ? namesInfo.additional : []).forEach(function(name) {
  if (name && worldbookNames.indexOf(name) < 0) worldbookNames.push(name);
        });
        if (!worldbookNames.length) return { ok:false, error:'当前角色没有可切换的世界书。' };

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
  return { ok:false, error:'切换变量更新方式失败: ' + (e4 && e4.message ? e4.message : e4), worldbookMatched:worldbookMatched, worldbookChanged:worldbookChanged, presetMatched:presetMatched, presetChanged:presetChanged };
        }
        if (!worldbookMatched) return { ok:false, error:'未在当前角色世界书中找到变量更新模式条目，请检查条目名称。', worldbookMatched:0, worldbookChanged:0, presetMatched:presetMatched, presetChanged:presetChanged };
        saveVariableApiMode(mode);
        return { ok:true, mode:mode, worldbookMatched:worldbookMatched, worldbookChanged:worldbookChanged, presetMatched:presetMatched, presetChanged:presetChanged };
    }

    /* ===== 15a. 额外模型配置(移植自 Zsd网游论坛_本地内联版) =====
       存储位置: localStorage['samsara_api_config'] = {
         enabled:      是否启用额外模型配置(开 → 商城/血统融合走自托管API, 关 → 走 generateRaw 正文AI)
         apiUrl:       自定义 API 地址
         apiKey:       API Key
         model:        当前使用模型
         apiPresets:   [{name, apiUrl, apiKey, model}] 用户保存的多套预设
         fetchedModels:[] 从 /models 接口加载到的模型列表
       }
       说明: 配置存 localStorage(脱离 MVU, 避免被剧情/辅助脚本覆盖; 不广播 VARIABLE_UPDATE_ENDED, 零重渲染副作用)。
             首次读取时若 localStorage 为空, 自动从旧 MVU stat_data.设置.API 迁移一次。
             此配置为统一"额外模型"通道: 商城刷新与血统融合的 AI 请求都在 shopCallAI 处统一分发,
             开关开启 → 走自托管API, 关闭 → 继续 generateRaw 正文AI */
    var API_DEFAULT_MODELS = {
        openai:  ['gpt-4o','gpt-4o-mini','gpt-4-turbo','o1','o3-mini','o1-mini'],
        claude:  ['claude-3-5-sonnet','claude-3-opus','claude-3-haiku','claude-3-5-sonnet-20241022'],
        deepseek:['deepseek-chat','deepseek-reasoner','deepseek-v4-pro','deepseek-v4-flash'],
        gemini:  ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash'],
        azure:   ['gpt-4o','gpt-4o-mini','gpt-4']
    };
    /* ★ API 配置存 localStorage(脱离 MVU, 避免被剧情辅助脚本/变量更新覆盖; 不广播事件, 杜绝重渲染副作用) */
    var API_CFG_KEY = 'samsara_api_config';
    /* 读取当前 API 配置(返回安全深拷贝; 首次若有旧 MVU 数据则自动迁移一次) */
    function getApiConfig() {
        try {
            var raw = localStorage.getItem(API_CFG_KEY);
            if (!raw) {
                // 兼容旧 MVU 数据: 尝试从 stat_data.设置.API 迁移一次
                var sd = getStatData();
                var old = sd && sd.设置 && sd.设置.API;
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
        } catch(e) { console.warn('[主神终端] 读取API配置失败:', e.message); }
        return { enabled:false, apiUrl:'', apiKey:'', model:'', apiPresets:[], fetchedModels:[] };
    }
    /* 写回 API 配置(localStorage, 不经过 MVU/广播事件, 零副作用) */
    function saveApiConfig(mutator) {
        try {
            var cfg = getApiConfig();
            if (typeof mutator === 'function') mutator(cfg);
            localStorage.setItem(API_CFG_KEY, JSON.stringify(cfg));
            return true;
        } catch(e) { console.warn('[主神终端] 保存API配置失败:', e.message); return false; }
    }
    /* 额外模型聊天补全：世界引擎可请求结构化 JSON。
       structured=auto 时依次尝试 json_schema → json_object → plain，并按 endpoint+model 缓存可用模式。 */
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
        if (!url || !cfg.enabled) throw new Error('额外模型配置未启用或 API 地址为空');
        var endpoint = url;
        if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
        if (endpoint.endsWith('/chat/completions')) {
            // 已是完整端点
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
            if (!content) throw new Error('API 返回的回复内容为空');
            if (wantsStructured) API_STRUCTURED_MODE_CACHE[cacheKey]=mode;
            return content;
        }
        throw new Error(lastError || 'API 不支持当前结构化输出模式');
    }
    /* 是否启用额外模型通道(供 shopCallAI 统一分发判断) */
    function isApiConfigEnabled() {
        var c = getApiConfig();
        return (c.enabled === true) && !!(c.apiUrl && c.apiUrl.trim());
    }
    /* 计算当前可用模型列表: 优先 fetchedModels, 其次按 apiUrl 关键词推断默认列表 */
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
    /* 加载模型列表: 拼接 /v1/models 并带 Authorization 头请求; 成功写入 fetchedModels */
    async function apiFetchModels() {
        var cfg = getApiConfig();
        var url = (cfg.apiUrl || '').trim();
        if (!url) throw new Error('请先填写自定义 API 地址');
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
        if (!models.length) throw new Error('API 返回的模型列表为空');
        return models;
    }
    function openSettings() {
        var cur = getTheme();
        var editOn = isEditMode();
        var stat = getStatData() || {};
        var cfg = stat.设置 || {};
        var superStable = (cfg.世界超稳 === true);
        var singleWorld = (cfg.单一世界 === true);
        var worldEngine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
        var worldAdvanceOn = !!(worldEngine && typeof worldEngine.isConfigured === 'function' && worldEngine.isConfigured());
        var worldAdvanceReady = !!(worldEngine && typeof worldEngine.isEnabled === 'function' && worldEngine.isEnabled());
        var worldUsesDedicatedApi = !!(worldEngine && typeof worldEngine.usesDedicatedApi === 'function' && worldEngine.usesDedicatedApi());
        var worldAdvanceWaitingText = worldUsesDedicatedApi ? '已开启 · 等待世界推进专属 API 配置' : '已开启 · 等待额外模型配置';
        var themeHtml = '';
        THEME_ORDER.forEach(function(key) {
            var th = THEMES[key];
            themeHtml += '<div class="sam-theme-card '+(key===cur?'active':'')+'" data-theme="'+key+'">'
                + '<div class="swatch" style="background:linear-gradient(90deg,'+th.dark+','+th.accent+','+th.hp+');"></div>'
                + '<div class="name" style="color:'+th.text+';background:'+th.bg+';">'+th.name+'</div></div>';
        });
        var html = secBlock('🎨 换肤',
              '<div class="sam-settings-grid">'+themeHtml+'</div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">✏️ 修改数据</div><div style="font-size:11px;color:var(--sam-sub);">开启后点击任意数值即可就地编辑(不变形),保存写回MVU</div></div>'
            + '<div class="sam-toggle-switch '+(editOn?'on':'')+'" data-toggle="edit"><div class="knob"></div></div></div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">🌐 世界超稳</div><div style="font-size:11px;color:var(--sam-sub);">开启后世界稳定性锁定,因果轨道不再偏移</div></div>'
            + '<div class="sam-toggle-switch '+(superStable?'on':'')+'" data-toggle="世界超稳"><div class="knob"></div></div></div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">🪐 单一世界</div><div style="font-size:11px;color:var(--sam-sub);">开启后仅存在单一世界,关闭后可在多世界间选择</div></div>'
            + '<div class="sam-toggle-switch '+(singleWorld?'on':'')+'" data-toggle="单一世界"><div class="knob"></div></div></div>'
            + '<div class="sam-toggle-row"><div><div style="font-weight:bold;">🌍 世界推进</div><div id="sam-world-engine-state" style="font-size:11px;color:var(--sam-sub);">'+(worldAdvanceOn?(worldAdvanceReady?'已开启 · 独立世界引擎接管':worldAdvanceWaitingText):'已关闭 · 使用原世界面板与原推演规则')+'</div></div>'
            + '<div class="sam-toggle-switch '+(worldAdvanceOn?'on':'')+'" data-toggle="world-engine"><div class="knob"></div></div></div>');

        var difficulty = ['体验', '正常', '困难', '挑战'].indexOf(cfg.难度) >= 0 ? cfg.难度 : '体验';
        var difficultyNotes = {
            '体验': '血统、技能、装备、状态和形态至少与人物生命层级齐平，原始属性不额外提升。',
            '正常': '体验基础上，原始属性品质提升 2 阶。',
            '困难': '原始属性品质提升 4 阶，体质保底 S；血统、技能至少与人物生命层级齐平，装备、状态、形态至少高于人物生命层级 1 阶。',
            '挑战': '原始属性品质提升 6 阶，体质 SSS；血统、装备、状态、形态至少高于人物生命层级 1 阶，技能至少与人物生命层级齐平。'
        };
        html += secBlock('⚔️ 难度 (实验功能)', '<div id="sam-difficulty-note" aria-live="polite" style="margin-bottom:10px;min-height:3em;font-size:12px;line-height:1.5;color:var(--sam-sub);">'+difficultyNotes[difficulty]+'</div><div role="group" aria-label="难度选择" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">' + ['体验', '正常', '困难', '挑战'].map(function(mode) {
            return '<button type="button" class="sam-varmode-btn '+(difficulty===mode?'active':'')+'" data-difficulty="'+mode+'" aria-pressed="'+(difficulty===mode?'true':'false')+'" style="text-align:center;padding:9px 4px;">'+mode+'</button>';
        }).join('') + '</div><div style="margin-top:8px;color:var(--sam-sub);font-size:11px;">仅影响后续新建且好感度为负的非队友 NPC。各组件仅补足所选标准，已有更高品质不降低；原始属性仍独立提升，困难/挑战的体质按固定档位补足。品质最高 SSS，生命层级最高 Ⅸ。</div>');
        var variableMode = getVariableApiMode();
        var variableModeHtml = '<div class="sam-varmode-grid">'
  + '<button type="button" class="sam-varmode-btn '+(variableMode==='额外API'?'active':'')+'" data-variable-api-mode="额外API">'
    + '<div class="ttl">额外API输出 <span class="tag">推荐</span></div>'
    + '<div class="desc">独立模型单独更新变量，正文更干净；需在 MVU 扩展中配置额外模型。</div></button>'
  + '<button type="button" class="sam-varmode-btn '+(variableMode==='随主API'?'active':'')+'" data-variable-api-mode="随主API">'
    + '<div class="ttl">随主AI输出 <span class="tag">开箱即用</span></div>'
    + '<div class="desc">正文模型同轮输出变量更新，无需额外模型；长文本更容易出现格式错误。</div></button>'
  + '</div>'
  + '<div class="sam-varmode-status" id="sam-varmode-status"></div>'
  + '<div style="margin-top:5px;font-size:10px;line-height:1.5;color:var(--sam-sub);">此项只切换 MVU 世界书/预设。下方「额外模型配置」供商城刷新、血统融合使用；世界推进未启用专属 API 时也会复用该通道。若世界推进启用专属 API，则两套接口完全分离。</div>';
        html += secBlock('🧭 变量更新方式', variableModeHtml);

        /* ----- 🔌 API 配置区块(移植自 Zsd网游论坛_本地内联版) ----- */
        var apiCfg = getApiConfig();
        // 预设下拉框: 完全在 DOM 插入后由 apiRefreshFields() 用 jQuery text() 填值(避免转义/注入问题)
        var presetOpts = '<option value="">— 选择已保存预设 —</option>';
        apiCfg.apiPresets.forEach(function(p) {
            presetOpts += '<option value=""></option>';
        });

        var modelList = apiAvailableModels(apiCfg);
        var modelOpts = '<option value="">(未选择模型)</option>';
        modelList.forEach(function(m){
            modelOpts += '<option value="'+esc(m)+'"'+(m===apiCfg.model?' selected':'')+'>'+esc(m)+'</option>';
        });
        if (apiCfg.model && modelList.indexOf(apiCfg.model) < 0) {
            modelOpts = '<option value="'+esc(apiCfg.model)+'" selected>'+esc(apiCfg.model)+'</option>' + modelOpts;
        }

        var fetchedTag = apiCfg.fetchedModels && apiCfg.fetchedModels.length
            ? '<span class="sam-api-status ok">已加载 '+apiCfg.fetchedModels.length+' 个模型</span>'
            : '<span class="sam-api-status warn">未加载(使用默认列表)</span>';

        // 启用开关提示语
        var apiEnableHint = apiCfg.enabled
            ? '<span class="sam-api-status ok">已启用: 商城刷新 / 血统融合可使用自托管 API'+(worldUsesDedicatedApi?'；世界推进使用专属 API':'；世界推进可复用此通道')+'</span>'
            : '<span class="sam-api-status warn">未启用: 商城刷新 / 血统融合将走正文 API'+(worldUsesDedicatedApi?'；世界推进继续使用专属 API':'；世界推进等待额外模型配置')+'</span>';
        var apiHtml = '<div class="sam-api-section">'
            // 启用开关
            + '<div class="sam-toggle-row" style="margin-bottom:8px;">'
              + '<div><div style="font-weight:bold;">🔌 启用额外模型配置</div>'
              + '<div id="sam-api-enable-state" style="margin-top:2px;">'+apiEnableHint+'</div>'
              + '</div>'
              + '<div class="sam-toggle-switch '+(apiCfg.enabled?'on':'')+'" data-toggle="api-enabled"><div class="knob"></div></div>'
            + '</div>'
            // 下方配置(开关关时隐藏)
            + '<div id="sam-api-fields" style="'+(apiCfg.enabled?'':'display:none;')+'">'
            // 预设管理
            + '<div class="sam-api-block-label">📜 API 预设(多套配置存档)</div>'
            + '<div class="sam-api-row">'
              + '<select class="sam-api-select" id="sam-api-preset-sel" style="flex:1;">'+presetOpts+'</select>'
              + '<button class="sam-api-btn danger" data-act="delete-preset">删除</button>'
            + '</div>'
            + '<div class="sam-api-row" style="margin-top:4px;">'
              + '<input class="sam-api-input" id="sam-api-preset-name" placeholder="预设名称(保存当前配置为新预设/覆盖同名)" style="flex:1;">'
              + '<button class="sam-api-btn save" data-act="save-preset">保存预设</button>'
            + '</div>'
            // 字段
            + '<div class="sam-api-field"><label>自定义 API 地址</label>'
              + '<input class="sam-api-input" data-field="apiUrl" value="'+esc(apiCfg.apiUrl)+'" placeholder="http://127.0.0.1:8808/v1"></div>'
            + '<div class="sam-api-field"><label>API Key</label>'
              + '<input class="sam-api-input" data-field="apiKey" type="password" value="'+esc(apiCfg.apiKey)+'" placeholder="sk-..."></div>'
            + '<div class="sam-api-field"><label>模型</label>'
              + '<select class="sam-api-select" data-field="model">'+modelOpts+'</select></div>'
            // 加载模型
            + '<div class="sam-api-row" style="margin-top:6px;">'
              + '<button class="sam-api-btn" data-act="load-models">📡 加载模型列表</button>'
              + '<button class="sam-api-btn" data-act="clear-models">清除</button>'
              + '<span id="sam-api-models-status" style="margin-left:auto;align-self:center;">'+fetchedTag+'</span>'
            + '</div>'
            + '</div>'
            + '</div>';

        html += '<div class="sam-api-section" style="margin-top:12px;">' + apiHtml + '</div>';
        showModal('⚙️ 设置', html, true);   // 第三参 true = 设置弹窗禁止点击框外自动关闭(避免误触丢失表单输入)
        /* ===== API 配置: 声明(必须在 apiRefreshFields 调用前就位, 否则 $apiModal 为 undefined, 虽 jQuery 回退到 document 仍能命中但属脆弱路径) ===== */
        var $apiModal = $('#samsara-modal');
        var apiFieldTimer = null;   // 字段实时保存防抖计时器(载入/保存预设前需 clearTimeout 防止旧值回写覆盖)
        // 主题选择
        // 初始用 jQuery 安全填值: 预设下拉框名字/模型下拉框等(避免 HTML 转义/注入问题)
        try { apiRefreshFields(); } catch(_e){ console.warn('[主神终端] apiRefreshFields 初始刷新异常:', _e && _e.message); }
        $('#samsara-modal').off('click.samTheme').on('click.samTheme', '.sam-theme-card', function() {
            var tk = $(this).data('theme');
            setTheme(tk);
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            // 重渲染(变量变更需重建style + 重新渲染面板)
            renderAll();
        });
        // 编辑开关
        $('#samsara-modal').off('click.samToggle').on('click.samToggle', '.sam-toggle-switch[data-toggle="edit"]', function() {
            var on = !$(this).hasClass('on');
            $(this).toggleClass('on', on);
            setEditMode(on);
            closeModal();
            renderAll();
        });
        $('#samsara-modal').off('change.samDifficulty').off('click.samDifficulty').on('click.samDifficulty', 'button[data-difficulty]', function() {
            var mode = $(this).attr('data-difficulty');
            if (['体验', '正常', '困难', '挑战'].indexOf(mode) < 0) return;
            var ok = writeBackMvu(function(statData) {
                if (!statData.设置) statData.设置 = {};
                statData.设置.难度 = mode;
            });
            if (!ok) { samToast('error', '难度保存失败'); openSettings(); return; }
            $('#samsara-modal button[data-difficulty]').removeClass('active').attr('aria-pressed', 'false');
            $(this).addClass('active').attr('aria-pressed', 'true');
            $('#sam-difficulty-note').text(difficultyNotes[mode]);
            samToast('success', '难度已设为'+mode+'，对后续新敌对 NPC 生效');
            renderAll();
        });
        // 世界超稳 / 单一世界 开关(写回 MVU 设置节点)
        $('#samsara-modal').off('click.samCfgToggle').on('click.samCfgToggle', '.sam-toggle-switch[data-toggle="世界超稳"], .sam-toggle-switch[data-toggle="单一世界"]', function() {
            var key = $(this).data('toggle');
            var on = !$(this).hasClass('on');
            $(this).toggleClass('on', on);
            writeBackMvu(function(statData) {
                if (!statData.设置) statData.设置 = {};
                statData.设置[key] = on;
            });
            renderAll();
        });
        // 世界推进总开关：专属 API 优先；只有未启用专属 API 时才复用/启用主神终端额外模型。
        $('#samsara-modal').off('click.samWorldEngine').on('click.samWorldEngine', '.sam-toggle-switch[data-toggle="world-engine"]', function() {
            var engine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
            if (!engine || typeof engine.setEnabled !== 'function') { samToast('error', '请先加载独立脚本：世界推进系统.js'); return; }
            var on = !$(this).hasClass('on');
            engine.setEnabled(on);
            $(this).toggleClass('on', on);
            var ready = !!(typeof engine.isEnabled === 'function' && engine.isEnabled());
            var dedicated = !!(typeof engine.usesDedicatedApi === 'function' && engine.usesDedicatedApi());
            $('#sam-world-engine-state', $apiModal).text(on ? (ready ? '已开启 · 独立世界引擎接管' : (dedicated ? '已开启 · 等待世界推进专属 API 配置' : '已开启 · 等待额外模型配置')) : '已关闭 · 使用原世界面板与原推演规则');
            if (on) {
                apiRefreshFields();
                if (ready) samToast('success', dedicated ? '世界推进已开启 · 使用专属 API' : '世界推进已开启 · 使用主神终端额外模型');
                else if (dedicated) samToast('warning', '世界推进已开启，请在世界推进「设置」中完成专属 API 配置');
                else samToast('warning', '世界推进已开启，主神终端额外模型尚未配置完整');
            } else samToast('success', '世界推进已关闭，已恢复原世界面板与推演规则');
        });

        // MVU变量更新方式：同开局页共享 localStorage，并立即同步世界书/当前预设
        function refreshVariableModeFields(message, state) {
  var mode = getVariableApiMode();
  $('[data-variable-api-mode]', $apiModal).each(function() {
      $(this).toggleClass('active', $(this).attr('data-variable-api-mode') === mode);
  });
  var $st = $('#sam-varmode-status', $apiModal);
  if (!$st.length) return;
  $st.removeClass('ok err').addClass(state || '');
  $st.text(message || (mode === '额外API' ? '当前：额外API输出' : '当前：随主AI输出'));
        }
        refreshVariableModeFields();
        $apiModal.off('click.samVariableMode').on('click.samVariableMode', '[data-variable-api-mode]', async function() {
  var mode = normalizeVariableApiMode($(this).attr('data-variable-api-mode'));
  var $buttons = $('[data-variable-api-mode]', $apiModal).prop('disabled', true);
  refreshVariableModeFields('正在切换世界书与预设条目…', '');
  var result = await applyVariableApiMode(mode);
  $buttons.prop('disabled', false);
  if (result.ok) {
      refreshVariableModeFields('已切换 · 世界书变更 '+result.worldbookChanged+' 项 · 预设变更 '+result.presetChanged+' 项', 'ok');
      samToast('success', '变量更新方式已切换为' + (mode === '额外API' ? '额外API输出' : '随主AI输出'));
  } else {
      refreshVariableModeFields(result.error || '切换失败', 'err');
      samToast('error', result.error || '变量更新方式切换失败');
  }
        });

        /* ===== API 配置: 事件绑定 ===== */
        // ($apiModal / apiFieldTimer 已在上方 showModal 后声明)
        // 局部辅助: 依据 stat 重建模型下拉
        function apiRenderModelSelect(c) {
            var list = apiAvailableModels(c);
            var $m = $('[data-field="model"]', $apiModal);
            $m.empty().append('<option value="">(未选择模型)</option>');
            list.forEach(function(m) {
                var $o = $('<option></option>').val(m).text(m);
                if (m === c.model) $o.prop('selected', true);
                $m.append($o);
            });
            if (c.model && list.indexOf(c.model) < 0) {
                $m.prepend($('<option></option>').val(c.model).text(c.model).prop('selected', true));
            }
        }
        // 局部辅助: 依据 stat 刷新 API 区块所有字段(不重开弹窗)
        function apiRefreshFields() {
            var c = getApiConfig();
            // 同步启用开关
            $('.sam-toggle-switch[data-toggle="api-enabled"]', $apiModal).toggleClass('on', c.enabled === true);
            $('#sam-api-fields', $apiModal).toggle(c.enabled === true);
            // 启用状态提示
            var $hint = $('#sam-api-enable-state', $apiModal);
            if (c.enabled === true) {
                var _engineForApiHint = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
                var _dedicatedForApiHint = !!(_engineForApiHint && typeof _engineForApiHint.usesDedicatedApi === 'function' && _engineForApiHint.usesDedicatedApi());
                $hint.html('<span class="sam-api-status ok">已启用: 商城刷新 / 血统融合可使用自托管 API'+(_dedicatedForApiHint?'；世界推进使用专属 API':'；世界推进可复用此通道')+'</span>');
            } else {
                var _engineForApiHint = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
                var _dedicatedForApiHint = !!(_engineForApiHint && typeof _engineForApiHint.usesDedicatedApi === 'function' && _engineForApiHint.usesDedicatedApi());
                $hint.html('<span class="sam-api-status warn">未启用: 商城刷新 / 血统融合将走正文 API'+(_dedicatedForApiHint?'；世界推进继续使用专属 API':'；世界推进等待额外模型配置')+'</span>');
            }
            var $ps = $('#sam-api-preset-sel').empty().append('<option value="">— 选择已保存预设 —</option>');
            c.apiPresets.forEach(function(p) { $ps.append($('<option></option>').val(p.name).text(p.name)); });
            $('[data-field="apiUrl"]', $apiModal).val(c.apiUrl);
            $('[data-field="apiKey"]', $apiModal).val(c.apiKey);
            apiRenderModelSelect(c);
            if (c.fetchedModels && c.fetchedModels.length) {
                $('#sam-api-models-status').html('<span class="sam-api-status ok">已加载 '+c.fetchedModels.length+' 个模型</span>');
            } else {
                $('#sam-api-models-status').html('<span class="sam-api-status warn">未加载(使用默认列表)</span>');
            }
            var engine = GS_PARENT.Samsara && GS_PARENT.Samsara.worldEngine;
            if (engine && typeof engine.isConfigured === 'function') {
                var engineOn = engine.isConfigured();
                var engineReady = typeof engine.isEnabled === 'function' && engine.isEnabled();
                $('.sam-toggle-switch[data-toggle="world-engine"]', $apiModal).toggleClass('on', engineOn);
                var engineDedicated = typeof engine.usesDedicatedApi === 'function' && engine.usesDedicatedApi();
                $('#sam-world-engine-state', $apiModal).text(engineOn ? (engineReady ? '已开启 · 独立世界引擎接管' : (engineDedicated ? '已开启 · 等待世界推进专属 API 配置' : '已开启 · 等待额外模型配置')) : '已关闭 · 使用原世界面板与原推演规则');
                if (typeof engine.render === 'function') engine.render();
            }
        }
        // 启用开关: 切换 enabled, 同步显隐下方字段
        $apiModal.off('click.samApiEnable').on('click.samApiEnable', '.sam-toggle-switch[data-toggle="api-enabled"]', function() {
            var on = !$(this).hasClass('on');
            saveApiConfig(function(cfg) { cfg.enabled = on; });
            apiRefreshFields();
        });
        // 选中预设即载入: 把预设里的地址/Key/来源/代理直接贴到输入框, 模型下拉清空到只剩预设中的模型, 预设名同步到下方输入框
        $apiModal.off('change.samApiPreset').on('change.samApiPreset', '#sam-api-preset-sel', function() {
            clearTimeout(apiFieldTimer);
            var $sel = $(this);
            var name = ($sel.val() || '').trim();
            if (!name) { $('#sam-api-preset-name').val(''); return; }   // 选回"选择已保存预设"占位项则只清空名称
            var snap = null, curCfg = getApiConfig();
            for (var i = 0; i < curCfg.apiPresets.length; i++) {
                if (curCfg.apiPresets[i].name === name) { snap = curCfg.apiPresets[i]; break; }
            }
            if (!snap) { samToast('err', '预设不存在: ' + name); return; }
            // 写回 localStorage(切换到新 API 地址,旧的已加载模型列表失效,一并清空以初始化)
            saveApiConfig(function(cfg) {
                cfg.apiUrl = snap.apiUrl; cfg.apiKey = snap.apiKey; cfg.model = snap.model;
                cfg.fetchedModels = [];
            });
            // 直接贴到输入框
            $('[data-field="apiUrl"]', $apiModal).val(snap.apiUrl || '');
            $('[data-field="apiKey"]', $apiModal).val(snap.apiKey || '');
            // 模型下拉: 清空, 只放预设中的模型(若有则选中, 否则置空)
            var $m = $('[data-field="model"]', $apiModal).empty().append('<option value="">(未选择模型)</option>');
            if (snap.model) $m.append($('<option></option>').val(snap.model).text(snap.model));
            $m.val(snap.model || '');
            // 预设名同步到下方输入框(便于直接覆盖保存) —— 切换即载入, 无额外提示(字段刷新即为反馈)
            $('#sam-api-preset-name').val(name);
            // 初始化已加载模型状态提示(切换到新 API 后旧模型列表已失效)
            $('#sam-api-models-status').html('<span class="sam-api-status warn">未加载(使用默认列表)</span>');
        });
        // 删除预设
        $apiModal.off('click.samApiDel').on('click.samApiDel', '.sam-api-btn[data-act="delete-preset"]', function() {
            var name = ($('#sam-api-preset-sel option:selected').text() || '').trim();
            if (!name) { samToast('warn', '请先选择要删除的预设'); return; }
            samConfirm('删除预设', '确认删除预设「' + name + '」?此操作不可撤销。', function() {
                saveApiConfig(function(cfg) {
                    var idx = (cfg.apiPresets || []).findIndex(function(p){ return p.name === name; });
                    if (idx >= 0) cfg.apiPresets.splice(idx, 1);
                    cfg.fetchedModels = [];   // 删除预设同时初始化已加载模型状态
                });
                apiRefreshFields();
                samToast('ok', '已删除预设: ' + name);
            });
        });
        // 保存预设(以弹窗内当前字段值为快照, 写入预设列表, 同名覆盖)
        $apiModal.off('click.samApiSave').on('click.samApiSave', '.sam-api-btn[data-act="save-preset"]', function() {
            clearTimeout(apiFieldTimer);   // 取消待写回计时器, 确保快照读到的就是当前屏幕值并随后不被旧值回写覆盖
            var name = ($('#sam-api-preset-name').val() || '').trim();
            if (!name) { samToast('warn', '请输入预设名称'); return; }
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
            samToast('ok', '已保存预设: ' + name);
        });
        // 字段实时保存(防抖 + apiUrl 变更时刷新模型下拉; apiFieldTimer 已在前面声明)
        $apiModal.off('input.samApiField change.samApiField').on('input.samApiField change.samApiField', '[data-field]', function() {
            var field = $(this).data('field');
            var val = $(this).val() || '';
            clearTimeout(apiFieldTimer);
            apiFieldTimer = setTimeout(function() {
                saveApiConfig(function(cfg) { cfg[field] = val; });
                if (field === 'apiUrl') apiRenderModelSelect(getApiConfig());
            }, 400);
        });
        // 加载模型列表(异步 fetch /v1/models, 成功写入 fetchedModels)
        $apiModal.off('click.samApiLoad').on('click.samApiLoad', '.sam-api-btn[data-act="load-models"]', function() {
            var $btn = $(this); var $st = $('#sam-api-models-status');
            $btn.prop('disabled', true).text('加载中…');
            $st.html('<span class="sam-api-status">正在请求模型列表…</span>');
            var url = ($('[data-field="apiUrl"]', $apiModal).val() || '').trim();
            var key = ($('[data-field="apiKey"]', $apiModal).val() || '').trim();
            saveApiConfig(function(cfg) { cfg.apiUrl = url; cfg.apiKey = key; });
            apiFetchModels().then(function(models) {
                // 成功: 清理旧模型 + 旧选择, 列表仅保留本次 API 返回的模型, 跳到"未选择"
                saveApiConfig(function(cfg) { cfg.fetchedModels = models; cfg.model = ''; });
                var fresh = getApiConfig();
                apiRenderModelSelect(fresh);
                $('[data-field="model"]', $apiModal).val('');
                $st.html('<span class="sam-api-status ok">已加载 ' + models.length + ' 个模型(已重置选择)</span>');
                samToast('ok', '已加载 ' + models.length + ' 个模型, 已重置为"未选择模型"');
            }).catch(function(err) {
                $st.html('<span class="sam-api-status err">失败: ' + esc(err && err.message || String(err)) + '</span>');
                samToast('err', '加载失败: ' + (err && err.message || err));
            }).then(function() {
                $btn.prop('disabled', false).text('📡 加载模型列表');
            });
        });
        // 清除已加载模型列表(回退到默认模型推荐, 并重置选择)
        $apiModal.off('click.samApiClear').on('click.samApiClear', '.sam-api-btn[data-act="clear-models"]', function() {
            saveApiConfig(function(cfg) { cfg.fetchedModels = []; cfg.model = ''; });
            apiRenderModelSelect(getApiConfig());
            $('[data-field="model"]', $apiModal).val('');
            $('#sam-api-models-status').html('<span class="sam-api-status warn">未加载(使用默认列表)</span>');
            samToast('ok', '已清除已加载模型列表, 已重置为"未选择模型"');
        });
    }

    /* ===== 16. 路径解析(读) ===== */
    function resolvePath(obj, path) {
        if (!path) return obj;
        try {
            if (_ && _.get) return _.get(obj, path);
        } catch(e){}
        return path.split('.').reduce(function(o, k) { return (o == null) ? undefined : o[k]; }, obj);
    }

    /* ===== 17. 主渲染入口 ===== */
    function renderAll() {
        refreshPlayerName();
        // 重建前失焦面板内输入框, 防止ST AutoComplete绑定已移除的输入框报错(getBoundingClientRect on null)
        try {
            var _ae = document.activeElement;
            if (_ae && (_ae.tagName === 'INPUT' || _ae.tagName === 'TEXTAREA')) {
                var _pn = document.getElementById('samsara-panel');
                if (_pn && _pn.contains(_ae)) _ae.blur();
            }
        } catch(_e) {}
        var statData = getStatData();
        var $panel = $('#samsara-panel');
        if (!statData || !statData.角色) {
            // 终端未响应: 顶栏仍提供 刷新/关闭 按钮(刷新复用.sam-icon-btn.refresh, 事件已在bindUIEvents委托)
            $panel.html('<div class="sam-topbar"><div class="tl-info"><div class="tl-time" style="color:var(--sam-sub);">终端未响应</div></div><div class="tl-actions"><div class="sam-icon-btn refresh" title="刷新数据">🔄</div><div class="sam-icon-btn close" title="关闭">✕</div></div></div><div class="sam-empty"><div style="font-size:36px;opacity:0.6;animation:samPulse 2s infinite;">📡</div><div style="margin-top:10px;">因果链尚未接入...</div><div style="font-size:11px;opacity:0.6;">(请等待新剧本初始化或推进时间, 或点右上🔄刷新)</div></div>');
            $('#samsara-ball').removeClass('combat-mode');
            // 仅在"终端未响应"时启动5秒自动刷新定时器; 收到数据正常渲染后由下方清除
            if (!window.samsaraRefreshTimer) {
                window.samsaraRefreshTimer = setInterval(function() {
                    try { if ($('#samsara-panel').hasClass('open') && !isEditMode()) renderAll(); } catch (e) {}
                }, 5000);
            }
            return;
        }
        // 已收到数据: 清除"终端未响应"自动刷新定时器, 避免影响用户滚动/操作与无谓性能消耗
        if (window.samsaraRefreshTimer) { clearInterval(window.samsaraRefreshTimer); window.samsaraRefreshTimer = null; }
        var p = statData.角色;
        var sys = statData.系统状态 || {};
        var world = statData.世界 || {};
        // 新开局检测: 种族为空 + 身份为空数组 + 空间币为0 (已获取信息后判定)
        // → 清除角色立绘 + 所有NPC立绘(避免上一局头像残留到新角色)
        try {
            var raceStr = safeStr(p.种族, '');
            var idArr = Array.isArray(p.身份) ? p.身份 : [];
            var coin = safeNum(p.空间币, 0);
            var freshSig = (raceStr === '' && idArr.length === 0 && coin === 0) ? 'FRESH' : 'PLAY';
            if (freshSig === 'FRESH' && lastReincarnatorSig !== 'FRESH') {
                clearAllPortraits();
            }
            lastReincarnatorSig = freshSig;
        } catch(e) {}
        var isCombat = sys.是否战斗中 === true;
        if (isCombat) $('#samsara-ball').addClass('combat-mode');
        else $('#samsara-ball').removeClass('combat-mode');

        var editMode = isEditMode();
        var html = '';
        // 顶栏
        html += renderTopbar(world, sys, editMode, statData);
        // 中部角色条
        html += renderReincarnatorBar(p, sys, editMode);
        // 底部状态图标条
        html += renderBuffRail(p, editMode);
        // Tab主体
        html += '<div class="sam-main">';
        html += renderTabRail(getCurrentTab());
        html += '<div class="sam-tab-content" id="sam-tab-content"></div>';
        html += '</div>';
        // 编辑模式额外UI
        if (editMode) {
            html += '<div class="sam-edit-badge">编辑模式 · 点击数值就地修改,失焦自动暂存</div>';
            html += '<button class="sam-save-btn">💾 保存</button>';
        }
        // 刷新前保存滚动位置(整个panel重建会丢失容器scrollTop)
        var $oldContent = $('#sam-tab-content');
        var savedScrollTop = ($oldContent.length ? ($oldContent[0].scrollTop || 0) : 0);
        $panel.html(html);
        renderTabContent(getCurrentTab());
        // 同Tab刷新: 同步恢复滚动位置(避免重建后先渲染顶部再跳回中间的抖动)
        // 注: renderTabContent 内读到的 scrollTop 是新空容器的0, 故须用此处的 savedScrollTop
        if (savedScrollTop > 0) {
            var $newContent = $('#sam-tab-content');
            if ($newContent.length) {
                // 同步设置(内容已填入, 高度通常已定型); rAF兜底确保布局完成后再校正一次
                try { $newContent[0].scrollTop = savedScrollTop; } catch(e){}
                var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
                if (raf) raf(function(){ try { $newContent[0].scrollTop = savedScrollTop; } catch(e){} });
            }
        }
    }

    function shouldShowSettlementButton(sd) {
        var sys = (sd && sd.系统状态) || {};
        return sys.是否在主神空间 === false && sys.是否战斗中 !== true;
    }

    /* ===== 18. 顶栏 ===== */
    function renderTopbar(world, sys, editMode, sd) {
        var time = safeStr(world.时间, '未知时间');
        var place = safeStr(world.地点, '未知地点');
        if (editMode) {
            time = editInput('世界.时间', time, 'text');
            place = editInput('世界.地点', place, 'text');
        }
        // 主神空间显示“选择世界”；副本内非战斗时常驻显示“结算任务”，不判断任务是否完成。
        var worldBtn = '';
        if (sys && sys.是否在主神空间 === true && sys.是否战斗中 !== true) {
            worldBtn = '<div class="sam-icon-btn choose-world" title="选择世界" data-choose-world>🌐选择世界</div>';
        }
        var settlementBtn = '';
        if (shouldShowSettlementButton(sd)) {
            settlementBtn = '<div class="sam-icon-btn choose-world mission-settle" title="结算任务" data-mission-settle>📋结算任务</div>';
        }
        return '<div class="sam-topbar">'
            + '<div class="tl-info"><div class="tl-time">🕒 '+time+'</div><div class="tl-place">📍 '+place+'</div></div>'
            + '<div class="tl-actions">'
            + worldBtn
            + settlementBtn
            + '<div class="sam-icon-btn refresh" title="刷新">🔄</div>'
            + '<div class="sam-icon-btn settings '+(editMode?'edit-on':'')+'" title="设置">⚙️</div>'
            + '<div class="sam-icon-btn close" title="关闭">✕</div>'
            + '</div></div>';
    }

    /* ===== 19. 角色条(左头像列+层级/种族/形态 / 右HP+EP+THP三栏 纯色) ===== */
    var SAM_PORTRAIT_KEY = 'samsara_reincarnator_portrait';
    var SAM_NPC_PORTRAIT_PREFIX = 'samsara_npc_portrait_';
    // 角色签名: 用于检测新开局(种族空+身份空+空间币0)→清除旧立绘
    var lastReincarnatorSig = null;
    // <details>折叠状态记忆: key=summary纯文本, value=true(展开)/false(折叠); 跨刷新保持
    var detailsOpenState = {};
    // 清除角色立绘 + 所有NPC立绘(localStorage中以SAM_NPC_PORTRAIT_PREFIX开头的键)
    function clearAllPortraits() {
        try {
            localStorage.removeItem(SAM_PORTRAIT_KEY);
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf(SAM_NPC_PORTRAIT_PREFIX) === 0) keysToRemove.push(k);
            }
            keysToRemove.forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} });
            try { console.log('%c[主神终端] 🧹 检测到新开局, 已清除全部旧立绘 ('+(1+keysToRemove.length)+'个)', 'color:#fbbf24'); } catch(e){}
        } catch(e) { try { console.warn('[主神终端] 清除立绘失败:', e.message); } catch(x){} }
    }
    function getReincarnatorPortrait() {
        try { return localStorage.getItem(SAM_PORTRAIT_KEY) || ''; } catch(e) { return ''; }
    }
    function saveReincarnatorPortrait(dataUrl) {
        try {
            if (dataUrl) localStorage.setItem(SAM_PORTRAIT_KEY, dataUrl);
            else localStorage.removeItem(SAM_PORTRAIT_KEY);
        } catch(e) { try { console.warn('[主神终端] 立绘存储失败:', e.message); } catch(x){} }
        closeModal();
        renderAll();
    }
    // NPC立绘(localStorage, 以名称为键; 独立于角色)
    function getNpcPortrait(name) {
        if (!name) return '';
        try { return localStorage.getItem(SAM_NPC_PORTRAIT_PREFIX + name) || ''; } catch(e) { return ''; }
    }
    function saveNpcPortrait(name, dataUrl) {
        if (!name) return;
        try {
            if (dataUrl) localStorage.setItem(SAM_NPC_PORTRAIT_PREFIX + name, dataUrl);
            else localStorage.removeItem(SAM_NPC_PORTRAIT_PREFIX + name);
        } catch(e) { try { console.warn('[主神终端] NPC立绘存储失败:', e.message); } catch(x){} }
        closeModal();
        renderAll();
    }
    // 立绘放大查看器
    function showPortraitViewer(url, label) {
        var pv = document.getElementById('samsara-portrait-viewer');
        if (!pv || !url) return;
        var img = document.getElementById('sam-pv-img');
        var lbl = document.getElementById('sam-pv-label');
        if (img) img.src = url;
        if (lbl) lbl.textContent = label || '';
        pv.classList.add('show');
    }
    // 自定义立绘上传弹窗(角色/NPC通用; name为角色时存SAM_PORTRAIT_KEY, 否则存NPC键)
    function openPortraitUpload(name) {
        var isReincarnator = (!name || name === '角色');
        var title = isReincarnator ? '自定义角色立绘' : ('自定义立绘 · ' + name);
        var body = '<div style="display:flex;gap:8px;margin-bottom:10px;">'
            + '<input type="text" id="sam-portrait-url" placeholder="粘贴图片URL..." style="flex:1;font-size:13px;padding:8px;background:var(--sam-input-bg);color:var(--sam-text);border:1px solid var(--sam-border);border-radius:3px;">'
            + '</div>'
            + '<div style="display:flex;gap:8px;">'
            + '<button type="button" id="sam-portrait-url-btn" style="flex:1;padding:8px;cursor:pointer;background:var(--sam-accent);color:#fff;border:none;border-radius:3px;font-weight:bold;">📥 载入链接</button>'
            + '<button type="button" id="sam-portrait-file-btn" style="flex:1;padding:8px;cursor:pointer;background:var(--sam-accent);color:#fff;border:none;border-radius:3px;font-weight:bold;">📂 选择文件</button>'
            + '</div>'
            + '<input type="file" id="sam-portrait-file" accept="image/*" style="display:none;">'
            + '<div style="margin-top:10px;"><button type="button" id="sam-portrait-clear-btn" style="width:100%;padding:8px;cursor:pointer;background:rgba(40,15,10,0.6);color:var(--sam-hp);border:1px solid var(--sam-border);border-radius:3px;font-weight:bold;">🗑️ 清除自定义立绘</button></div>'
            + '<div style="margin-top:8px;font-size:11px;color:var(--sam-sub);">本地图片不做大小限制(仅受浏览器存储上限约束)。</div>';
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
    function openReincarnatorPortraitUp() { openPortraitUpload('角色'); }
    function renderReincarnatorBar(p, sys, editMode) {
        var maxHp = safeNum(p.HP_MAX, 1), curHp = safeNum(p.HP, 0), curThp = safeNum(p.THP, 0);
        var maxEp = safeNum(p.EP_MAX, 1), curEp = safeNum(p.EP, 0);
        var hpPct = Math.min(100, Math.max(0, (curHp/maxHp)*100));
        var epPct = Math.min(100, Math.max(0, (curEp/maxEp)*100));
        // 注: THP 是临时护盾/额外生命值, 无上限概念, 不渲染进度条, 仅显示纯数值
        // 层级显示: 形态激活且形态层级>自身时显示形态层级(仅显示); 编辑框仍绑定真实自身层级避免写回污染
        var dispRaw = displayTierRaw(p);
        var tier = tierRomanOf(dispRaw); var tierQ = tierQOfClass(dispRaw);
        var ownTier = tierRomanOf(p.层级);   // 编辑模式输入框用真实自身层级
        var race = safeStr(p.种族, '人类');
        var cf = p.当前形态 || {};
        var formActive = (cf.激活 === true && safeStr(cf.名称));
        // 战斗状态徽章: 平时隐藏, 进入战斗(系统状态.是否战斗中)时显示, 附当前轮次
        var combatBadge = '';
        if (sys && sys.是否战斗中 === true) {
            var combatRound = safeNum(sys.当前轮次, 0);
            combatBadge = '<div class="sam-reincarnator-combat">⚔️ 战斗中'+(combatRound > 0 ? ' · 第'+combatRound+'轮' : '')+'</div>';
        }
        // 顶部排版: 竖排四行 战斗徽章(战斗时) / 层级 / 种族 / 形态标签(激活时)
        var tierField = (editMode && !isReadonlyPath('角色.层级')) ? editInput('角色.层级', ownTier, 'text') : '<span class="sam-reincarnator-tier-num">'+esc(tier)+'</span><span class="sam-reincarnator-tier-suf">级</span>';
        var raceField = editMode ? editInput('角色.种族', race, 'text') : esc(race);
        var formField = '';
        if (formActive) {
            // 当前形态由能力面板"激活按钮"统一管理, 修改模式下也不可手动编辑名称
            formField = '<div class="sam-reincarnator-form">🌀 <span class="sam-reincarnator-form-name">'+esc(safeStr(cf.名称))+'</span></div>';
        }
        // 头像: 自定义立绘优先, 否则占位符; 不管有无图, 点击框体均弹自定义立绘框
        var portraitUrl = getReincarnatorPortrait();
        if (portraitUrl) {
            var avatarHtml = '<div class="sam-avatar" data-portrait="'+esc(portraitUrl)+'">'
                + '<img src="'+esc(portraitUrl)+'" alt="立绘">'
                + '</div>';
        } else {
            var avatarHtml = '<div class="sam-avatar empty">'
                + '<div class="sam-ava-ph"><span class="sam-ava-ico">📷</span><span class="sam-ava-hint">点击设置<br>立绘</span></div>'
                + '</div>';
        }
        // HP/EP/THP 三栏(编辑模式下数字可改,HP_MAX/EP_MAX只读)
        var hpNum = editMode ? editInput('角色.HP', curHp, 'number') : (curHp + ' / ' + maxHp);
        var epNum = editMode ? editInput('角色.EP', curEp, 'number') : (curEp + ' / ' + maxEp);
        var thpNum = editMode ? editInput('角色.THP', curThp, 'number') : curThp;
        return '<div class="sam-reincarnator">'
            + '<div class="sam-reincarnator-left">'+avatarHtml
            + '<div class="sam-reincarnator-text">'+combatBadge
            + '<div class="sam-reincarnator-tier q-'+tierQ+'">'+tierField+'</div>'
            + '<div class="sam-reincarnator-race">'+raceField+'</div>'
            + formField+'</div></div>'
            + '<div class="sam-reincarnator-bars">'
            + '<div class="stat-bar-box"><div class="stat-labels"><span style="color:var(--sam-hp)">HP</span><span>'+hpNum+'</span></div><div class="bar-track"><div class="bar-fill fill-hp" style="width:'+hpPct+'%;"></div></div></div>'
            + '<div class="stat-bar-box"><div class="stat-labels"><span style="color:var(--sam-ep)">EP</span><span>'+epNum+'</span></div><div class="bar-track"><div class="bar-fill fill-ep" style="width:'+epPct+'%;"></div></div></div>'
            + '<div class="sam-thp-row"><div class="stat-labels"><span style="color:var(--sam-thp)">THP (临时护盾/额外生命值)</span><span>'+thpNum+'</span></div></div>'
            + '</div></div>';
    }

    /* ===== 20. 状态按钮条(状态名+持续时间, 点击弹二级详情) ===== */
    function renderBuffRail(p, editMode) {
        var buffs = p.状态 || {};
        var keys = Object.keys(buffs);
        // 无状态时不渲染任何占位,直接返回空
        if (keys.length === 0) return '';
        var chips = '';
        keys.forEach(function(k) {
            var b = buffs[k] || {};
            var type = safeStr(b.类型, '增益');
            var dur = safeStr(b.持续, '');
            var path = '角色.状态.'+k;
            // 按钮显示: 状态名 + 持续时间(若有)
            var durHtml = dur ? '<span class="sam-buff-dur">⏳ '+esc(dur)+'</span>' : '';
            var label = (editMode ? '📝 ' : '') + esc(k);
            // 编辑模式: 追加删除按钮(复用sam-fc-del-btn事件 → 二级确认 → 写回MVU删除 → 刷新; stopPropagation防误触详情弹窗)
            var delBtn = editMode ? '<button type="button" class="sam-fc-del-btn sam-buff-del" data-del-path="'+esc(path)+'" title="删除该状态">✕</button>' : '';
            chips += '<div class="sam-buff-chip '+esc(type)+(editMode?' is-edit':'')+'" data-path="'+esc(path)+'" data-name="'+esc(k)+'">'
                + '<span class="sam-buff-name">'+label+'</span>'+durHtml+delBtn+'</div>';
        });
        return '<div class="sam-buff-rail">'+chips+'</div>';
    }

    /* ===== 21. Tab导航 ===== */
    function renderTabRail(curTab) {
        var tabs = [
            {key:'mission', label:'任务', icon:'📜'},
            {key:'info', label:'信息', icon:'📋'},
            {key:'hold', label:'持有', icon:'🎒'},
            {key:'blood', label:'能力', icon:'🧬'},
            {key:'relation', label:'关系', icon:'👥'},
            {key:'asset', label:'经营', icon:'🏗️'},
            {key:'rumor', label:'传闻', icon:'📰'},
            {key:'world', label:'世界', icon:'🌍'},
            {key:'shop', label:'商城', icon:'🛒'}
        ];
        var html = '<div class="sam-tab-rail">';
        tabs.forEach(function(t) {
            html += '<div class="sam-tab-btn '+(t.key===curTab?'active':'')+'" data-tab="'+t.key+'">'+t.icon+'<br>'+t.label+'</div>';
        });
        html += '</div>';
        return html;
    }

    /* ===== 22. Tab内容路由 =====
       同一Tab刷新(非切换)时保持滚动位置; 切换Tab时回到顶部 */
    var lastRenderedTab = null;
    function renderTabContent(tab) {
        var $c = $('#sam-tab-content');
        if (!$c.length) return;
        var sameTab = (tab === lastRenderedTab);
        var savedScroll = sameTab ? ($c[0].scrollTop || 0) : 0;
        var sd = getStatData();
        if (!sd) { $c.html('<div class="sam-empty">无数据</div>'); lastRenderedTab = tab; return; }
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
                    ? '<div class="sam-empty">世界推进已开启，请点击左侧「世界」进入独立世界引擎。</div>'
                    : renderWorldTab(sd);
                break;
            case 'shop': html = renderShopTab(sd); break;
            default: html = '<div class="sam-empty">未知Tab</div>';
        }
        $c.html(html);
        // 还原<details>折叠状态: 按summary文本(剥离数量括号)查detailsOpenState, 覆盖默认open
        // 必须同步执行(在滚动恢复前), 因open属性不依赖reflow时序
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
        // 同Tab刷新: 同步恢复滚动位置(切Tab时sameTab=false, 天然保持顶部)
        // 注: renderAll路径下此处savedScroll=0(新空容器), 恢复由renderAll用savedScrollTop处理
        if (sameTab && savedScroll > 0) {
            try { $c[0].scrollTop = savedScroll; } catch(e){}
        }
        lastRenderedTab = tab;
    }

    /* ===== 23. Tab: 任务 ===== */
    /* 副本成就难度: 写死1~6星, 任何值强制归一为★数(数字1~6 或 数★个数, 越界截断, 无★默认1星) */
    function achDiffStars(v) {
        var s = safeStr(v, '').trim();
        var n = /^[1-6]$/.test(s) ? parseInt(s, 10) : (s.match(/★/g) || []).length;
        if (n < 1) n = 1;
        if (n > 6) n = 6;
        return '★★★★★★'.slice(0, n);
    }
    function renderMissionTab(sd) {
        var m = sd.任务 || {};
        var list = m.列表 || {};
        var kills = m.击杀 || {};
        var isSingleWorld = (sd.设置 && sd.设置.单一世界 === true);
        var editMode = isEditMode();
        var html = '';
        // 任务列表
        var tHtml = '';
        var listKeys = Object.keys(list);
        var taskDoneCnt = 0;   // 可交付/可结算 计为完成
        var taskFailCnt = 0;   // 失败 单独计数
        if (listKeys.length === 0) tHtml += '<div class="sam-empty">[无任务]</div>';
        else {
            tHtml += '<div class="sam-list-1col">';
            listKeys.forEach(function(k) {
                var q = list[k] || {};
                var path = '任务.列表.'+k;
                // 难度徽章(任务卡标题最右显示): 用品质色板, 复用 sam-fc-q 样式; 无难度时不渲染
                var diffRaw = safeStr(q.难度, '');
                var diffQ = parseRarity(diffRaw);
                var diffBadge = diffRaw ? '<div class="sam-fc-q q-'+diffQ+'" title="难度">'+esc(diffQ)+'</div>' : '';
                // 编辑模式: 标题区追加删除按钮(挂 data-del-path, 复用通用删除事件)
                var delBtn = editMode ? samDelBtn(path, editMode, '删除该任务') : '';
                var headExtra = delBtn + diffBadge;
                // 状态行: editSelect/editInput 返回 HTML, 不能再走 fcRow(会二次转义导致乱码)
                var statusVal = safeStr(q.状态, '进行中');
                if (statusVal === '可交付' || statusVal === '可结算') taskDoneCnt++;
                else if (statusVal === '失败') taskFailCnt++;
                var statusCell = editMode
                    ? editSelect(path+'.状态', ['进行中','可交付','可结算','失败'], statusVal)
                    : esc(statusVal);
                var statusRow = '<div class="sam-row"><span class="k">状态</span><span class="v">'+statusCell+'</span></div>';
                var rows = '';
                rows += fcRow('委托方', q.委托方, path+'.委托方', editMode);
                rows += statusRow;
                rows += fcRow('目标', q.目标, path+'.目标', editMode);
                rows += fcRow('奖励', q.奖励, path+'.奖励', editMode);
                rows += fcRow('交付', q.交付, path+'.交付', editMode);
                var body = fcRow('惩罚', q.惩罚, path+'.惩罚', editMode);
                tHtml += fullCard('', k, rows, body, headExtra);
            });
            tHtml += '</div>';
        }
        var taskTitle = '📜 任务列表 (完成 '+taskDoneCnt+'/'+listKeys.length+')';
        if (taskFailCnt > 0) taskTitle += ' · 失败 '+taskFailCnt;
        html += secBlock(taskTitle, tHtml, listKeys.length > 0);
        // 单一世界完全隐藏副本成就；多世界模式照常显示并即时发放首次达成奖励
        if (!isSingleWorld) {
            var ach = m.副本成就 || {};
            var achKeys = Object.keys(ach);
            var achDoneCnt = 0;
            achKeys.forEach(function(k) {
                var st = safeStr(ach[k] && ach[k].状态);
                if (st === '已达成') achDoneCnt++;
            });
            var aHtml = '';
            if (achKeys.length === 0) {
                aHtml += '<div class="sam-empty">[无副本成就]</div>';
            } else {
                aHtml += '<div class="sam-list-1col">';
                achKeys.forEach(function(k) {
                    var a = ach[k] || {};
                    var path = '任务.副本成就.'+k;
                    var statusVal = safeStr(a.状态, '未达成') || '未达成';
                    var done = statusVal === '已达成';
                    // 编辑模式: 标题区追加删除按钮(挂 data-del-path, 复用通用删除事件)
                    var delBtn = editMode ? samDelBtn(path, editMode, '删除该成就') : '';
                    // 已达成: 头部金色✓徽章 + 卡片金色描边(一眼区分达成进度)
                    var doneChip = done ? '<span class="sam-ach-done-chip">✓ '+esc(statusVal)+'</span>' : '';
                    var headExtra = delBtn + doneChip;
                    // 状态行: editSelect 返回 HTML, 不能再走 fcRow(会二次转义导致乱码)
                    var statusCell = editMode
                        ? editSelect(path+'.状态', ['未达成','已达成'], statusVal)
                        : esc(statusVal);
                    var statusRow = '<div class="sam-row"><span class="k">状态</span><span class="v">'+statusCell+'</span></div>';
                    var rows = '';
                    rows += statusRow;
                    // 难度: 写死★~★★★★★★ 六档下拉(编辑写回★数), 显示态强制★数
                    var diffVal = achDiffStars(a.难度);
                    var diffCell = editMode
                        ? editSelect(path+'.难度', ['★','★★','★★★','★★★★','★★★★★','★★★★★★'], diffVal)
                        : esc(diffVal);
                    rows += '<div class="sam-row"><span class="k">难度</span><span class="v">'+diffCell+'</span></div>';
                    rows += fcRow('奖励', a.奖励, path+'.奖励', editMode);
                    var body = fcRow('说明', a.说明, path+'.说明', editMode);
                    aHtml += '<div class="sam-ach-item'+(done?' done':'')+'">'+fullCard('', k, rows, body, headExtra)+'</div>';
                });
                aHtml += '</div>';
            }
            html += secBlock('🏅 副本成就 (达成 '+achDoneCnt+'/'+achKeys.length+')', aHtml, achKeys.length > 0);
        }
        // 击杀统计(键用罗马数字Ⅰ~Ⅸ读取MVU数据库; CSS着色类用对应品质字母F~SSS)
        var kHtml = '<div class="sam-grid">';
        ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'].forEach(function(q) {
            var v = safeNum(kills[q], 0);
            var path = '任务.击杀.'+q;
            var qc = tierQOfClass(q);       // 罗马数字→品质字母(F~SSS)用于CSS着色类
            kHtml += '<div class="sam-card q-'+qc+'"><div class="sam-card-title">'+q+'</div><div class="sam-card-meta">'+(editMode ? editInput(path, v, 'number') : v)+' 击杀</div></div>';
        });
        kHtml += '</div>';
        // 击杀奖励说明(参考衍生属性减伤率说明面板样式)
        kHtml += '<div style="margin-top:8px;padding:8px 10px;background:var(--sam-hover);border:1px solid var(--sam-border);border-left:3px solid var(--sam-accent);border-radius:6px;font-size:11px;line-height:1.7;color:var(--sam-sub);">'
            + '<div style="color:var(--sam-accent);font-weight:bold;margin-bottom:3px;">💰 击杀奖励说明</div>'
            + '<div>目标低于自身层级 <b style="color:var(--sam-text);">-2级</b> 的击杀不予记录</div>'
            + '<div style="margin-top:3px;">各阶位击杀单价（空间币）：</div>'
            + '<div style="color:var(--sam-text);margin-top:2px;letter-spacing:0.3px;">Ⅰ:10　Ⅱ:50　Ⅲ:250　Ⅳ:1200　Ⅴ:5000　Ⅵ:2万　Ⅶ:8万　Ⅷ:32万　Ⅸ:128万</div>'
            + '<div style="margin-top:3px;">击杀奖励 = Σ(单价 × 击杀数)，上限为任务基础收益 × 10</div>'
            + (!isSingleWorld ? '<div style="margin-top:3px;">跨世界额外收益：<b style="color:var(--sam-text);">世界探索</b>(上限×300%) 与 <b style="color:var(--sam-text);">势力羁绊</b>(上限×300%) 附加收益通常高于击杀奖励</div>' : '')
            + '</div>';
        html += secBlock('⚔️ 击杀统计', kHtml);
        return html;
    }

    /* 层级进度条: 普升只读取角色自身层级；段位累计≥24后可走试炼或源力灌注两条路径。 */
    function validateTrialAdvancement(sd, expectedNext) {
        if (!sd || !sd.角色) return {error:'角色数据未就绪'};
        var sys = sd.系统状态 || {};
        if (sys.是否战斗中 === true) return {error:'战斗中不能晋升'};
        if (sys.试炼已完成 !== true) return {error:'试炼尚未结算完成，或本次晋升资格已经使用'};
        var current = normalizeLifeTier(sd.角色.层级);
        var index = TIER_ROMAN.indexOf(current);
        if (index < 0 || index >= TIER_ROMAN.length - 1) return {error:'当前层级无法继续晋升'};
        var next = TIER_ROMAN[index + 1];
        if (expectedNext && expectedNext !== next) return {error:'层级已变化，请刷新后重试'};
        return {currentTier:current,nextTier:next};
    }
    function renderTierProgressBar(p, fa, sys) {
        var lifeTier = normalizeLifeTier(p && p.层级);
        var curTier = tierQOfClass(lifeTier);
        var attrs = fa || p.最终属性 || {};
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
            advBtnHtml = '<button type="button" class="sam-tier-adv-btn start" data-tier-act="start" data-tier-next="'+esc(TIER_ROMAN[idx+1])+'">✦ 开始进阶</button>';
        } else if (!isMax && canTrial) {
            advBtnHtml = '<div class="sam-tier-actions">'
                + '<button type="button" class="sam-tier-adv-btn apply" data-tier-act="apply" data-tier-next="'+esc(TIER_ROMAN[idx+1])+'">☠ 申请进阶</button>'
                + '<button type="button" class="sam-tier-infuse-btn" data-tier-target="角色">✧ 源力灌注</button>'
                + '</div>';
        }
        var leftHtml = '<div class="sam-tier-side q-'+curTier+'">'+esc(TIER_ROMAN[idx])+'</div>';
        var rightHtml = isMax
            ? '<div class="sam-tier-side max">MAX</div>'
            : '<div class="sam-tier-side next q-'+TIER_QUALITY[idx+1]+'">'+esc(TIER_ROMAN[idx+1])+'</div>';
        var midHtml = '<div class="sam-tier-mid">'
            + '<div class="sam-tier-sum"><span>段位累计</span><span class="v">'+score+' / '+TRIAL_SCORE_THRESHOLD+'</span></div>'
            + '<div class="sam-tier-bar"><div class="bar-fill" style="width:'+pct+'%;"></div></div>'
            + advBtnHtml
            + '</div>';
        return '<div class="sam-tier-prog">'+leftHtml+midHtml+rightHtml+'</div>';
    }

    /* 队友段位累计：满24点时提供源力灌注，不建立NPC专属试炼状态。 */
    function renderNpcTierProgressBar(n, name) {
        if (!n || n.是否队友 !== true) return '';
        var lifeTier = normalizeLifeTier(n.层级);
        var idx = TIER_ROMAN.indexOf(lifeTier);
        if (idx < 0) idx = 0;
        var isMax = (idx >= TIER_ROMAN.length - 1);
        var score = calcTrialScore(n.最终属性 || {}, lifeTier);
        var pct = isMax ? 100 : Math.max(0, Math.min(100, Math.floor((score / TRIAL_SCORE_THRESHOLD) * 100)));
        var btn = (!isMax && score >= TRIAL_SCORE_THRESHOLD)
            ? '<button type="button" class="sam-tier-infuse-btn" data-tier-target="'+esc(name)+'">✧ 源力灌注</button>'
            : '';
        var left = '<div class="sam-tier-side q-'+TIER_QUALITY[idx]+'">'+esc(lifeTier)+'</div>';
        var right = isMax
            ? '<div class="sam-tier-side max">MAX</div>'
            : '<div class="sam-tier-side next q-'+TIER_QUALITY[idx+1]+'">'+esc(TIER_ROMAN[idx+1])+'</div>';
        var mid = '<div class="sam-tier-mid">'
            + '<div class="sam-tier-sum"><span>段位累计</span><span class="v">'+score+' / '+TRIAL_SCORE_THRESHOLD+'</span></div>'
            + '<div class="sam-tier-bar"><div class="bar-fill" style="width:'+pct+'%;"></div></div>'
            + (btn ? '<div class="sam-tier-actions">'+btn+'</div>' : '')
            + '</div>';
        return '<div class="sam-tier-prog npc">'+left+mid+right+'</div>';
    }

    /* ===== 24. Tab: 信息(角色详情) ===== */
    function renderInfoTab(sd) {
        var p = sd.角色 || {};
        var editMode = isEditMode();
        var html = '';
        // 角色信息
        var infoHtml = '';
        var fields = [
            {k:'身份', path:'角色.身份', type:'text', arr:true}
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
        // ★ 职业: 已改为记录对象 {职业名:{类型,特性[],来源}}; 显示态折叠面板, 编辑态结构化编辑器
        html += secBlock('📋 角色信息', infoHtml);
        {
            var occ = resolvePath(sd, '角色.职业');
            if (editMode && !isReadonlyPath('角色.职业')) {
                html += secBlock('🎖 职业', occupationEditHtml(occ, '角色.职业'));
            } else if (occupationNames(occ).length) {
                html += occupationCardsHtml(occ);
            }
        }
        // 最终属性 - 拆分为基础属性/修正值/衍生属性三个面板(只读,系统计算)
        var fa = p.最终属性 || {};
        var lifeTier = displayTierRaw(p); // 段位显示层级: 形态激活且层级更高时取形态层级, 否则取自身层级
        // 1.基础属性(6项) - 每项数值右侧追加当前层级段位徽章(F~SSS, 按当前层级范围9等分判定)
        var baseHtml = '<div class="sam-grid-2">';
        ['力量','敏捷','体质','精神','魅力'].forEach(function(an) {
            var v = safeNum(fa[an], 0);
            var path = '角色.最终属性.'+an;
            var valCell = (editMode && !isReadonlyPath(path) ? editInput(path, v, 'number') : '<span class="sam-edit-readonly">'+v+'</span>');
            // 段位徽章: 取当前层级下单维属性值对应的段位分→品质字母(F~SSS), 复用 sam-fc-q 着色样式
            var score = attrTierScore(v, lifeTier);
            var q = scoreToQuality(score);
            var tierBadge = '<span class="sam-fc-q q-'+q+'" title="当前层级段位" style="margin-left:6px;">'+esc(q)+'</span>';
            baseHtml += '<div class="sam-row"><span class="k">'+esc(an)+'</span><span class="v">'+valCell+tierBadge+'</span></div>';
        });
        baseHtml += '</div>';
        // 层级进度条: 当前层级(取自角色.层级,只读) → 下一层级; 中间显示基础属性总点数与进度
        html += renderTierProgressBar(p, fa, sd.系统状态 || {});
        html += secBlock('💪 基础属性', baseHtml);
        // 2.修正值(6项)
        var modHtml = '<div class="sam-grid-2">';
        ['力量修正','敏捷修正','体质修正','精神修正','魅力修正'].forEach(function(an) {
            var v = safeNum(fa[an], 0);
            var path = '角色.最终属性.'+an;
            modHtml += '<div class="sam-row"><span class="k">'+esc(an)+'</span><span class="v">'+(editMode && !isReadonlyPath(path) ? editInput(path, v, 'number') : '<span class="sam-edit-readonly">'+v+'</span>')+'</span></div>';
        });
        modHtml += '</div>';
        html += secBlock('✨ 修正值', modHtml);
        // 3.衍生属性
        var derHtml = '<div class="sam-grid-2">';
        // 衍生属性: 数据键(key, 与辅助计算脚本写入字段一致) + 显示名(label, 带中文后缀)
        var derList = [
            {key:'DEF', label:'DEF(物防)'},
            {key:'MDEF', label:'MDEF(术防)'},
            {key:'物理减伤率', label:'物理减伤率'},
            {key:'魔法减伤率', label:'魔法减伤率'},
            {key:'AP', label:'AP(法术增幅)'},
            {key:'先攻DC', label:'先攻DC'},
            {key:'防御DC', label:'防御DC'}
        ];
        derList.forEach(function(item) {
            var key = item.key, label = item.label;
            var v = safeNum(fa[key], 0);
            var unit = (key === 'AP' || key.indexOf('减伤率')>=0) ? '%' : '';
            var path = '角色.最终属性.'+key;
            derHtml += '<div class="sam-row"><span class="k">'+esc(label)+'</span><span class="v">'+(editMode && !isReadonlyPath(path) ? editInput(path, v, 'number') : '<span class="sam-edit-readonly">'+v+unit+'</span>')+'</span></div>';
        });
        derHtml += '</div>';
        // 3b. 武器攻击(并入衍生属性, 减伤说明上方; 无武装常驻+已装备武器; ATK/MATK分两排)
        var wpn = fa.武器 || {};
        derHtml += '<div class="sam-wpn-divider">⚔ 武器攻击</div>';
        derHtml += '<div class="sam-wpn-list">';
        derHtml += '<div class="sam-wpn-row base"><div class="sam-wpn-name">无武装</div><div class="sam-wpn-stat atk">ATK(物攻) <b>'+safeNum(wpn.无武装 && wpn.无武装.ATK, 0)+'</b></div><div class="sam-wpn-stat matk">MATK(术攻) <b>'+safeNum(wpn.无武装 && wpn.无武装.MATK, 0)+'</b></div></div>';
        Object.keys(wpn).forEach(function(name) {
            if (name === '无武装') return;
            var w = wpn[name] || {};
            derHtml += '<div class="sam-wpn-row"><div class="sam-wpn-name">⚔ '+esc(name)+'</div><div class="sam-wpn-stat atk">ATK(物攻) <b>'+safeNum(w.ATK, 0)+'</b></div><div class="sam-wpn-stat matk">MATK(术攻) <b>'+safeNum(w.MATK, 0)+'</b></div></div>';
        });
        derHtml += '</div>';
        // 减伤率说明标签: 上限与各阶位满防基准
        derHtml += '<div style="margin-top:8px;padding:8px 10px;background:var(--sam-hover);border:1px solid var(--sam-border);border-left:3px solid var(--sam-accent);border-radius:6px;font-size:11px;line-height:1.7;color:var(--sam-sub);">'
            + '<div style="color:var(--sam-accent);font-weight:bold;margin-bottom:3px;">🛡️ 减伤率说明</div>'
            + '<div>减伤率上限：<b style="color:var(--sam-text);">75%</b>（超过不再叠加）</div>'
            + '<div>各阶位满防基准（DEF/MDEF 达到对应值即满减伤）：</div>'
            + '<div style="color:var(--sam-text);margin-top:2px;letter-spacing:0.3px;">Ⅰ:70　Ⅱ:200　Ⅲ:480　Ⅳ:1280　Ⅴ:3300　Ⅵ:9200　Ⅶ:24000　Ⅷ:70000　Ⅸ:150000</div>'
            + '</div>';
        html += secBlock('⚡ 衍生属性', derHtml);
        // 注: "当前形态"栏已移除 — 顶部头像旁已显示形态名, 由能力面板激活按钮统一管理
        return html;
    }

    /* 战术栏穿戴槽位信息栏: 统计装备(status=1)各类型穿戴数 + 道具(status=1)数, 显示 当前/上限
       超限(当前>上限)标红; 满(当前==上限且上限>0)标蓝; 特殊(类型8)无上限显示 当前/X */
    function renderEquipSlotsBar(p) {
        var equips = p.装备 || {};
        var items = p.道具 || {};
        // 装备类型与上限来自模块级常量 EQUIP_SLOTS; 道具上限来自 ITEM_SLOT_CAP
        // 统计各类型已穿戴数
        var counts = {};
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            if (Number(e.状态) === 1) {
                var t = Number(e.类型);
                counts[t] = (counts[t] || 0) + 1;
            }
        });
        // 道具已穿戴数
        var itemCount = 0;
        Object.keys(items).forEach(function(k) {
            if (Number(items[k].状态) === 1) itemCount++;
        });
        var html = '<div class="sam-slots-bar">';
        EQUIP_SLOTS.forEach(function(s) {
            var cur = counts[s.type] || 0;
            var cls = 'sam-slot-chip';
            var right;
            if (s.cap === 0) {
                // 特殊: 无上限, 显示 cur/X (X=cur自身, 表示当前穿戴数)
                right = cur+'/X';
            } else {
                right = cur+'/'+s.cap;
                if (cur > s.cap) cls += ' over';      // 超限标红
                else if (cur === s.cap) cls += ' full'; // 满标蓝
            }
            html += '<span class="'+cls+'">'+s.label+' <span class="n">'+right+'</span></span>';
        });
        // 道具槽 (上限来自 ITEM_SLOT_CAP)
        var iCls = 'sam-slot-chip';
        if (itemCount > ITEM_SLOT_CAP) iCls += ' over';
        else if (itemCount === ITEM_SLOT_CAP) iCls += ' full';
        html += '<span class="'+iCls+'">道具 <span class="n">'+itemCount+'/'+ITEM_SLOT_CAP+'</span></span>';
        html += '</div>';
        return html;
    }

    /* ===== 25. Tab: 持有(战术栏/装备/道具/仓库) =====
       改版: 装备背包/道具背包/仓库 由折叠栏改为顶部子Tab(战术栏 + 三仓)
       - 顶部常驻穿戴槽位信息栏 + 4个子Tab(带数量角标)
       - 子Tab选择存于模块级 holdActiveTab, 切聊天/重渲染保持
       - 内容区按当前子Tab渲染对应状态的卡片列表, 附战斗可见性提示 */
    var holdActiveTab = 'tactical';   // 持有子Tab: tactical|equip|item|storage
    var holdTypeFilter = '';          // 当前子Tab下的类型筛选(空='全部'; 切换子Tab时重置)
    /* 取条目分类标签: 装备用类型数字→槽位名(EQUIP_SLOTS); 道具用字符串类型字段(空→未分类) */
    function holdEntryTypeLabel(val, isEquip) {
        if (isEquip) {
            var t = Number(val && val.类型);
            for (var i = 0; i < EQUIP_SLOTS.length; i++) { if (EQUIP_SLOTS[i].type === t) return EQUIP_SLOTS[i].label; }
            return '未知';
        }
        var s = safeStr(val && val.类型).trim();
        return s || '未分类';
    }
    /* 收集当前子Tab下已有条目的类型计数(按该Tab对应状态过滤)
       返回 {counts:{类型:条目数}, order:[类型...]} —— 装备类型按 EQUIP_SLOTS 顺序在前, 道具类型按首次出现顺序在后 */
    function holdCollectTypes(sd) {
        var p = sd.角色 || {};
        var equips = p.装备 || {}, items = p.道具 || {};
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
            if (statuses.indexOf(Number(e.状态)) < 0) return;
            var label = holdEntryTypeLabel(e, true), w = 99;
            for (var i = 0; i < EQUIP_SLOTS.length; i++) { if (EQUIP_SLOTS[i].label === label) { w = i; break; } }
            add(label, w);
        });
        if (useItem) Object.keys(items).forEach(function(k) {
            var it = items[k] || {};
            if (statuses.indexOf(Number(it.状态)) < 0) return;
            add(holdEntryTypeLabel(it, false), 1000 + Object.keys(seen).length);
        });
        var order = Object.keys(seen).sort(function(a, b) { return seen[a].w - seen[b].w; });
        return { counts: seen, order: order };
    }
    /* 类型筛选行HTML: [全部 N] + 各已有类型(带计数); 该子Tab无任何条目 → 整行不渲染(背包为空不显示)
       含副作用: 筛选值已失效(该类型条目被清空)时自动回落'全部' */
    function renderHoldTypeRow(sd) {
        var info = holdCollectTypes(sd);
        var total = 0;
        info.order.forEach(function(l) { total += info.counts[l].cnt; });
        if (total === 0) return '';
        if (holdTypeFilter && !(holdTypeFilter in info.counts)) holdTypeFilter = '';
        var html = '<div class="sam-hold-types">'
            + '<button type="button" class="sam-hold-type'+(holdTypeFilter === '' ? ' active' : '')+'" data-hold-type="">全部 <span class="sam-hold-type-cnt">'+total+'</span></button>';
        info.order.forEach(function(l) {
            html += '<button type="button" class="sam-hold-type'+(holdTypeFilter === l ? ' active' : '')+'" data-hold-type="'+esc(l)+'">'+esc(l)+' <span class="sam-hold-type-cnt">'+info.counts[l].cnt+'</span></button>';
        });
        html += '</div>';
        return html;
    }
    /* 类型筛选字典: holdTypeFilter 为空时原样返回; 否则生成仅含匹配类型条目的浅拷贝字典 */
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
        var p = sd.角色 || {};
        var editMode = isEditMode();
        var equips = p.装备 || {};
        var items = p.道具 || {};
        // 统计字典中 状态 命中 statuses 的条目数(用于子Tab角标计数)
        function countByStatus(dict, statuses) {
            var n = 0;
            Object.keys(dict || {}).forEach(function(k) {
                var st = Number((dict[k] || {}).状态);
                if (statuses.indexOf(st) >= 0) n++;
            });
            return n;
        }
        // 各子Tab条目数(供角标)
        var tCount = countByStatus(equips, [1]) + countByStatus(items, [1]);
        var eCount = countByStatus(equips, [0]);
        var iCount = countByStatus(items, [0]);
        var wCount = countByStatus(equips, [2]) + countByStatus(items, [2]);
        var tabs = [
            {key:'tactical', icon:'🎯', label:'战术栏', cnt:tCount},
            {key:'equip',    icon:'⚔️', label:'装备背包', cnt:eCount},
            {key:'item',     icon:'🎒', label:'道具背包', cnt:iCount},
            {key:'storage',  icon:'📦', label:'仓库', cnt:wCount}
        ];
        // 校验当前激活子Tab有效(防脏值)
        var validKeys = tabs.map(function(t){ return t.key; });
        if (validKeys.indexOf(holdActiveTab) < 0) holdActiveTab = 'tactical';
        var html = '';
        // 穿戴槽位信息栏(各类装备/道具 当前穿戴数/上限, 常驻顶部)
        html += renderEquipSlotsBar(p);
        // 子Tab条
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
        // 专属分类行: 常驻外层容器(保证子Tab切换时可回填), 内部按已有条目类型细分; 该Tab为空则内容为空不占位
        html += '<div class="sam-hold-types-wrap" id="sam-hold-types-wrap">'+renderHoldTypeRow(sd)+'</div>';
        // 内容区: 独立容器, 切Tab时仅替换其内容(不重建Tab条, 避免整排抖动/错位)
        html += '<div class="sam-hold-content" id="sam-hold-body">'+renderHoldBody(sd)+'</div>';
        return html;
    }
    /* 持有面板内容区: 按当前 holdActiveTab 渲染对应状态卡片列表 + 战斗可见性提示
       独立于Tab条, 供子Tab切换时局部刷新(不触发Tab条DOM重建, 消除抖动) */
    function renderHoldBody(sd) {
        var p = sd.角色 || {};
        var editMode = isEditMode();
        // 类型筛选: holdTypeFilter 非空时仅保留匹配类型的条目(在原字典上做浅拷贝过滤)
        var equips = holdFilterByType(p.装备 || {}, true);
        var items = holdFilterByType(p.道具 || {}, false);
        // 剥离[无]占位, 仅保留真实卡片HTML(避免空占位被grid当作单格占位导致视觉空格)
        function stripEmpty(s){ return (s||'').replace(/<div class="sam-empty">\[无\]<\/div>/g,'').trim(); }
        function mergeList(htmlA, htmlB, emptyMsg){
            var cards = stripEmpty(htmlA) + stripEmpty(htmlB);
            if (cards === '') return '<div class="sam-empty">'+emptyMsg+'</div>';
            // 持有面板卡片一律单列(一行一个), 不与其他面板共用的 sam-card-list 两列布局
            return '<div class="sam-card-list sam-card-list-1col">'+cards+'</div>';
        }
        var content = '', hint = '';
        if (holdActiveTab === 'tactical') {
            // 战术栏: 已装备的装备(status=1) + 已装备的道具(status=1)
            content = mergeList(
                renderEquipFullList(equips, '角色.装备', editMode, [1]),
                renderItemFullList(items, '角色.道具', editMode, [1]),
                '尚未装备任何战术项'
            );
        } else if (holdActiveTab === 'equip') {
            // 装备背包: status=0
            content = mergeList(
                renderEquipFullList(equips, '角色.装备', editMode, [0]),
                '', '装备背包空空如也'
            );
            hint = '战斗时 AI 不可见';
        } else if (holdActiveTab === 'item') {
            // 道具背包: status=0
            content = mergeList(
                renderItemFullList(items, '角色.道具', editMode, [0]),
                '', '道具背包空空如也'
            );
            hint = '战斗时 AI 不可见';
        } else {
            // 仓库: 装备status=2 + 道具status=2
            content = mergeList(
                renderEquipFullList(equips, '角色.装备', editMode, [2]),
                renderItemFullList(items, '角色.道具', editMode, [2]),
                '仓库中没有存放任何物品'
            );
            hint = 'AI 不可见';
        }
        var hintHtml = hint ? '<div class="sam-hold-hint">🔒 '+hint+'</div>' : '';
        return hintHtml + content;
    }
    /* 装备完整资料卡片列表(内联展示, 不用弹窗; 品质仅在标题右侧徽章展示) */
    function renderEquipFullList(equips, basePath, editMode, statuses) {
        var filtered = [];
        Object.keys(equips).forEach(function(k) {
            var e = equips[k] || {};
            var st = Number(e.状态);
            if (statuses.indexOf(st) >= 0) filtered.push({key:k, val:e});
        });
        if (filtered.length === 0) return '<div class="sam-empty">[无]</div>';
        var typeMap = ['武器','手套','头部','胸部','腿部','鞋子','披风','饰品','世界遗物'];
        var html = '';
        filtered.forEach(function(it) {
            var e = it.val;
            var st = Number(e.状态);
            var path = basePath+'.'+it.key;
            var q = parseRarity(e.品质);
            var typeStr = typeMap[e.类型] || '未知';
            var rows = '';
            rows += fcRow('类型', typeStr, path+'.类型', false); // 类型是数字枚举, 不可编辑
            if (!isCostEmpty(e.消耗)) rows += fcRow('消耗', e.消耗, path+'.消耗', editMode);
            var body = '<div class="sam-fc-body">';
            if (editMode || (Array.isArray(e.标签) && e.标签.length > 0)) body += fcBody('标签', formatTags(e.标签, path+'.标签', editMode), 'sam-fc-tags');
            if (e.原始属性 && typeof e.原始属性 === 'object' && Object.keys(e.原始属性).length > 0) {
                body += fcBodyCollapsible('原始属性', formatStatGrid(e.原始属性, 3), 'sam-fc-stats', false);
            }
            body += fcBody('效果', formatEffects(e.效果, path+'.效果', editMode), 'sam-fc-effects');
            var descContent;
            if (editMode && !isReadonlyPath(path+'.描述')) {
                descContent = editInput(path+'.描述', safeStr(e.描述), 'textarea');
            } else {
                descContent = esc(safeStr(e.描述));
            }
            body += fcBody('描述', descContent);
            // 操作按钮(类型8特殊装备无按钮无限制); 删除按钮仅在修改模式显示
            var btns = equipActionButtons(path, st, Number(e.类型), editMode);
            if (btns) body += fcBody('操作', btns, 'sam-fc-actions');
            body += '</div>';
            html += fullCard(q, it.key, rows, body, '');
        });
        return html;
    }
    /* 道具完整资料卡片列表(内联展示, 不用弹窗; 品质仅在标题右侧徽章展示) */
    function renderItemFullList(items, basePath, editMode, statuses) {
        var filtered = [];
        Object.keys(items).forEach(function(k) {
            var it = items[k] || {};
            var st = Number(it.状态);
            if (statuses.indexOf(st) >= 0) filtered.push({key:k, val:it});
        });
        if (filtered.length === 0) return '<div class="sam-empty">[无]</div>';
        var html = '';
        filtered.forEach(function(it) {
            var v = it.val;
            var st = Number(v.状态);
            var path = basePath+'.'+it.key;
            var q = parseRarity(v.品质);
            var qty = safeNum(v.数量, 1);
            var rows = '';
            rows += fcRow('类型', v.类型, path+'.类型', editMode);
            rows += fcRow('数量', qty, path+'.数量', editMode, 'number');
            var body = '<div class="sam-fc-body">';
            if (editMode || (Array.isArray(v.标签) && v.标签.length > 0)) body += fcBody('标签', formatTags(v.标签, path+'.标签', editMode), 'sam-fc-tags');
            body += fcBody('效果', formatEffects(v.效果, path+'.效果', editMode), 'sam-fc-effects');
            var descContent;
            if (editMode && !isReadonlyPath(path+'.描述')) {
                descContent = editInput(path+'.描述', safeStr(v.描述), 'textarea');
            } else {
                descContent = esc(safeStr(v.描述));
            }
            body += fcBody('描述', descContent);
            body += fcBody('操作', itemActionButtons(path, st, editMode), 'sam-fc-actions');
            body += '</div>';
            html += fullCard(q, it.key, rows, body);
        });
        return html;
    }
    /* 技能完整资料卡片列表(用于血统Tab; 品质仅在标题右侧徽章展示)
       主动/被动/特殊 三栏改为可伸缩<details>, 标题显示数量 */
    function renderSkillFullList(skills, basePath, editMode) {
        var cats = [
            {idx:0, label:'主动'},
            {idx:1, label:'被动'},
            {idx:2, label:'特殊'}
        ];
        var html = '';
        cats.forEach(function(cat) {
            var list = [];
            Object.keys(skills).forEach(function(k) {
                var s = skills[k] || {};
                if (Number(s.类型) === cat.idx) list.push({key:k, val:s});
            });
            // ★ 该类别数量为 0 → 整栏隐藏(不渲染空折叠栏), 能力面板/形态卡片/NPC详情 共用此函数
            if (list.length === 0) return;
            // 可伸缩分组, 标题带数量
            html += '<details class="sam-skill-group">';  // 默认折叠; 折叠记忆优先覆盖
            html += '<summary>✨ '+cat.label+'技能 ('+list.length+')</summary>';
            html += '<div class="sam-card-list">';
            list.forEach(function(it) {
                var s = it.val;
                var path = basePath+'.'+it.key;
                var q = parseRarity(s.品质);
                var rows = '';
                if (!isCostEmpty(s.消耗)) rows += fcRow('消耗', s.消耗, path+'.消耗', editMode);
                var body = '<div class="sam-fc-body">';
                if (editMode || (Array.isArray(s.标签) && s.标签.length > 0)) body += fcBody('标签', formatTags(s.标签, path+'.标签', editMode), 'sam-fc-tags');
                body += fcBody('效果', formatEffects(s.效果, path+'.效果', editMode), 'sam-fc-effects');
                var descContent;
                if (editMode && !isReadonlyPath(path+'.描述')) {
                    descContent = editInput(path+'.描述', safeStr(s.描述), 'textarea');
                } else {
                    descContent = esc(safeStr(s.描述));
                }
                body += fcBody('描述', descContent);
                body += '</div>';
                html += fullCard(q, it.key, rows, body, samDelBtn(path, editMode, '删除技能'));
            });
            html += '</div>';
            html += '</details>';
        });
        return html;
    }

    /* ===== 26. Tab: 血统(血统/形态库/技能) ===== */
    function renderBloodTab(sd) {
        var p = sd.角色 || {};
        var bl = p.血统 || {};
        var editMode = isEditMode();
        var keys = Object.keys(bl);
        // 血统数量限制: 取自顶部常量 BLOODLINE_CAP(默认3), 用于栏目标题与商城上限判定
        var bloodLimit = BLOODLINE_CAP;
        var html = '';
        // 血统
        var blHtml = '';
        if (keys.length === 0) blHtml += '<div class="sam-empty">[无血统]</div>';
        else {
            blHtml += '<div class="sam-card-list sam-card-list-1col">';
            keys.forEach(function(k) {
                var b = bl[k] || {};
                var path = '角色.血统.'+k;
                var q = parseRarity(b.品质);
                var rows = '';
                var body = '<div class="sam-fc-body">';
                if (editMode || (Array.isArray(b.标签) && b.标签.length > 0)) body += fcBody('标签', formatTags(b.标签, path+'.标签', editMode), 'sam-fc-tags');
                if (b.原始属性 && typeof b.原始属性 === 'object' && Object.keys(b.原始属性).length > 0) {
                    body += fcBodyCollapsible('原始属性', formatStatGrid(b.原始属性, 3), 'sam-fc-stats', false);
                }
                body += fcBody('效果', formatEffects(b.效果, path+'.效果', editMode), 'sam-fc-effects');
                var descContent;
                if (editMode && !isReadonlyPath(path+'.描述')) {
                    descContent = editInput(path+'.描述', safeStr(b.描述), 'textarea');
                } else {
                    descContent = esc(safeStr(b.描述));
                }
                body += fcBody('描述', descContent);
                body += '</div>';
                blHtml += fullCard(q, k, rows, body, samDelBtn(path, editMode, '删除血统'));
            });
            blHtml += '</div>';
        }
        // ★ 血统融合入口: 仅当玩家实际持有血统数>1时显示(副本/奇遇中额外获得的血统也可在此融合)
        if (keys.length > 1) {
            blHtml += '<div style="display:flex;justify-content:center;margin-top:12px"><button type="button" class="sam-act-btn sam-blood-fusion-open" style="min-width:160px">🧬 血统融合</button></div>';
        }
        html += secBlock('🧬 血统 ('+keys.length+'/'+bloodLimit+')', blHtml, false);  // 默认折叠; 折叠记忆优先覆盖
        // 形态库
        var forms = p.形态库 || {};
        var fkeys = Object.keys(forms);
        var fHtml = '';
        if (fkeys.length === 0) fHtml += '<div class="sam-empty">[无形态]</div>';
        else {
            fHtml += '<div class="sam-card-list sam-card-list-1col">';
            fkeys.forEach(function(k) {
                var f = forms[k] || {};
                var path = '角色.形态库.'+k;
                // 形态走层级(Ⅰ~Ⅸ): 徽章显示罗马数字, 色阶用对应品质字母(q-class); 兼容旧品质字母数据
                var _fTierRaw = f.层级 != null ? f.层级 : f.品质;
                var q = { label: tierRomanOf(_fTierRaw), cls: tierQOfClass(_fTierRaw) };
                var rows = '';
                rows += fcRow('状态', f.状态, path+'.状态', editMode);
                if (!isCostEmpty(f.消耗)) rows += fcRow('消耗', f.消耗, path+'.消耗', editMode);
                // 注: 冷却不再用 fcRow 显示, 由激活按钮(⏳ N回合)统一呈现, 避免重复
                var body = '<div class="sam-fc-body">';
                if (editMode || (Array.isArray(f.标签) && f.标签.length > 0)) body += fcBody('标签', formatTags(f.标签, path+'.标签', editMode), 'sam-fc-tags');
                if (f.原始属性 && typeof f.原始属性 === 'object' && Object.keys(f.原始属性).length > 0) {
                    body += fcBodyCollapsible('原始属性', formatStatGrid(f.原始属性, 3), 'sam-fc-stats', false);
                }
                body += fcBody('效果', formatEffects(f.效果, path+'.效果', editMode), 'sam-fc-effects');
                var descContent;
                if (editMode && !isReadonlyPath(path+'.描述')) {
                    descContent = editInput(path+'.描述', safeStr(f.描述), 'textarea');
                } else {
                    descContent = esc(safeStr(f.描述));
                }
                body += fcBody('描述', descContent);
                // 形态自带技能子表
                var formSkills = f.技能 || {};
                if (formSkills && typeof formSkills === 'object' && Object.keys(formSkills).length > 0) {
                    body += fcBody('技能', renderSkillFullList(formSkills, path+'.技能', editMode), 'sam-fc-skills');
                }
                // 激活/取消按钮: 放在品质徽章左侧(headExtra); 已激活→✕取消(可点), 冷却中→禁用⏳, 归零→⚡激活
                var cf = p.当前形态 || {};
                var isThisActive = (cf.激活 === true && safeStr(cf.名称) === k);
                var cdCur = 0;
                var cdM = safeStr(f.冷却).match(/^(\d+)\s*\/\s*(\d+)/);
                if (cdM) cdCur = parseInt(cdM[1], 10) || 0;
                var actBtnHtml;
                if (isThisActive) {
                    actBtnHtml = '<button class="sam-act-btn" data-act="deactivate" data-form="'+esc(k)+'">✕ 取消</button>';
                } else if (cdCur > 0) {
                    actBtnHtml = '<button class="sam-act-btn" disabled style="opacity:0.6;cursor:not-allowed;">⏳ '+cdCur+'回合</button>';
                } else {
                    actBtnHtml = '<button class="sam-act-btn" data-act="activate" data-form="'+esc(k)+'">⚡ 激活</button>';
                }
                body += '</div>';
                fHtml += fullCard(q, k, rows, body, (actBtnHtml||'') + samDelBtn(path, editMode, '删除形态'));
            });
            fHtml += '</div>';
        }
        // 无形态时整个形态库折叠栏自动隐藏
        if (fkeys.length > 0) {
            html += secBlock('🌀 形态库 ('+fkeys.length+')', fHtml, false);  // 默认折叠; 折叠记忆优先覆盖
        }
        // 技能(直接列出主动/被动/特殊三个折叠栏, 不再套外层"主技能栏"section)
        var skills = p.技能 || {};
        html += renderSkillFullList(skills, '角色.技能', editMode);
        return html;
    }

    /* ===== 27. Tab: 关系 ===== */
    /* 记住关系面板当前激活的子Tab(全部/在场/不在场/小队), 避免 renderAll 后跳回"全部" */
    var relationActiveSub = 'all';
    function renderRelationTab(sd) {
        var rel = sd.关系列表 || {};
        var editMode = isEditMode();
        var all = [], present = [], absent = [], team = [];
        Object.keys(rel).forEach(function(k) {
            var n = rel[k] || {};
            var item = {key:k, val:n};
            all.push(item);
            if (n.在场 === true) present.push(item); else absent.push(item);
            if (n.是否队友 === true) team.push(item);
        });
        // 使用记住的子Tab状态(若无效则回退到'all')
        var activeSub = relationActiveSub;
        var validSubs = ['all','present','absent','team'];
        if (validSubs.indexOf(activeSub) < 0) activeSub = 'all';
        var html = '<div class="sam-subtabs">'
            + '<div class="sam-subtab'+(activeSub==='all'?' active':'')+'" data-sub="all">全部('+all.length+')</div>'
            + '<div class="sam-subtab'+(activeSub==='present'?' active':'')+'" data-sub="present">在场('+present.length+')</div>'
            + '<div class="sam-subtab'+(activeSub==='absent'?' active':'')+'" data-sub="absent">不在场('+absent.length+')</div>'
            + '<div class="sam-subtab'+(activeSub==='team'?' active':'')+'" data-sub="team">小队('+team.length+')</div>'
            + '</div>';
        html += '<div class="sam-subpane'+(activeSub==='all'?' active':'')+'" data-sub="all"'+(activeSub==='all'?'':' style="display:none;"')+'>'+renderNpcList(all, editMode, 'all')+'</div>';
        html += '<div class="sam-subpane'+(activeSub==='present'?' active':'')+'" data-sub="present"'+(activeSub==='present'?'':' style="display:none;"')+'>'+renderNpcList(present, editMode, 'present')+'</div>';
        html += '<div class="sam-subpane'+(activeSub==='absent'?' active':'')+'" data-sub="absent"'+(activeSub==='absent'?'':' style="display:none;"')+'>'+renderNpcList(absent, editMode, 'absent')+'</div>';
        html += '<div class="sam-subpane'+(activeSub==='team'?' active':'')+'" data-sub="team"'+(activeSub==='team'?'':' style="display:none;"')+'>'+renderNpcList(team, editMode, 'present')+'</div>';
        return html;
    }
    /* NPC单列卡片: mode决定字段
       all    -> 名字/在场状态/种族/身份/HP·好感/外貌/态度
       present-> 能显示都显示+伸缩框(性格/着装/喜爱/状态/装备/技能等)
       absent -> 姓名/种族/身份/层级/好感度/外貌/背景故事 */
    /* 仅AI可见的身份关键词: 不在玩家面板显示(只在数据库中给AI看) */
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
        if (list.length === 0) return '<div class="sam-empty">[无]</div>';
        var html = '<div class="sam-list-1col">';
        list.forEach(function(it) {
            var n = it.val;
            var path = '关系列表.'+it.key;
            // 层级显示: 形态激活且形态层级>自身时显示形态层级(仅显示, 不写回)
            var _dispRaw = displayTierRaw(n);
            var tierRoman = tierRomanOf(_dispRaw); var q = tierQOfClass(_dispRaw);
            var hp = safeNum(n.HP,0), hpmax = safeNum(n.HP_MAX,1);
            var ep = safeNum(n.EP,0), epmax = safeNum(n.EP_MAX,1);
            var thp = safeNum(n.THP,0);
            var favor = safeNum(n.好感度,0);
            var race = safeStr(n.种族) || '-';
            // 阵营身份默认隐藏(仅AI可见); 但小队成员或好感度>60时不隐藏
            var rawIdArr = Array.isArray(n.身份) ? n.身份 : [];
            var showAllIdentity = (n.是否队友 === true) || (favor > 60);
            var idArr = showAllIdentity ? rawIdArr : filterHiddenIdentity(rawIdArr);
            var idStr = idArr.length ? idArr.join(' / ') : '-';
            var jobStrHtml = occupationInlineHtml(n.职业) || '<span class="sam-ed-ph">-</span>';
            var looks = safeStr(n.外貌) || '';
            var dress = safeStr(n.着装) || '';
            var persona = safeStr(n.性格) || '';
            var likes = safeStr(n.喜爱) || '';
            var mind = safeStr(n.态度) || '';
            var bg = safeStr(n.背景故事) || '';
            var presentTxt = (n.在场 === true) ? '是' : '否';
            // 在场卡片点击弹详情(同全部/不在场)
            var cls = 'sam-card sam-npc-card q-'+q;
            var card = '<div class="'+cls+'" data-path="'+esc(path)+'" data-title="'+esc(it.key)+'">';
            // 编辑模式: 右上角删除按钮
            if (editMode) card += '<button type="button" class="sam-npc-del" data-del-npc="'+esc(it.key)+'" title="删除该NPC">✕</button>';
            // 在场卡片: 右上角转移按钮(仅在场时显示; 编辑模式时左移避开删除按钮)
            if (mode === 'present' && n.在场 === true) {
                var trfPos = editMode ? 'right:30px;' : 'right:4px;';
                card += '<button type="button" class="sam-npc-transfer" data-transfer-npc="'+esc(it.key)+'" style="'+trfPos+'" title="向该角色转移物资">📦 转移</button>';
                // 获取按钮: 仅死亡NPC显示
                if (isNpcDead(n)) {
                    var lootPos = editMode ? 'right:88px;' : 'right:62px;';
                    card += '<button type="button" class="sam-npc-loot" data-loot-npc="'+esc(it.key)+'" style="'+lootPos+'" title="获取该角色遗物">💀 获取</button>';
                }
            }
            // 头像+名字 横排: 有立绘=小头像(点击放大), 无立绘=小按钮(点击上传)
            var npcPUrl = getNpcPortrait(it.key);
            card += '<div class="sam-npc-head">';
            if (npcPUrl) {
                card += '<div class="sam-npc-avatar has-img" data-name="'+esc(it.key)+'" data-portrait="'+esc(npcPUrl)+'">';
                card += '<img src="'+esc(npcPUrl)+'" alt="'+esc(it.key)+'">';
                card += '</div>';
            } else {
                card += '<button type="button" class="sam-npc-portrait-btn" data-name="'+esc(it.key)+'" title="设置立绘">📷 立绘</button>';
            }
            // NPC 变身形态: 若 当前形态.激活===true 且有名称, 名字右侧显示形态名
            var npcCf = n.当前形态 || {};
            var npcFormName = (npcCf.激活 === true && safeStr(npcCf.名称)) ? safeStr(npcCf.名称) : '';
            var npcFormTag = npcFormName ? '<span class="sam-npc-form-tag">🌀 '+esc(npcFormName)+'</span>' : '';
            card += '<div class="sam-npc-head-info"><div class="sam-npc-head-name">'+esc(it.key)+npcFormTag+'</div></div>';
            card += '</div>';
            if (mode === 'all') {
                // 紧凑双列网格: 短字段并排, 节省纵向空间
                var allGrid = '';
                allGrid += npcRow('在场', presentTxt);
                allGrid += npcRow('种族', race);
                allGrid += npcRow('身份', idStr);
                allGrid += npcRow('好感', favor);
                var qty = safeNum(n.数量, 1);
                if (qty > 1) {
                    allGrid += npcRow('THP', thp);
                    allGrid += npcRow('数量', 'x'+qty);
                } else {
                    allGrid += npcRow('HP', hp+'/'+hpmax);
                }
                card += '<div class="sam-npc-grid">'+allGrid+'</div>';
                // 长文本全宽
                if (looks) card += npcRow('外貌', looks);
                if (bg) card += npcRow('背景故事', bg);
            } else if (mode === 'present') {
                // 基础信息双列网格
                var grid = '';
                grid += npcRow('在场', presentTxt);
                grid += npcRow('种族', race);
                grid += npcRow('身份', idStr);
                grid += '<div class="sam-npc-row"><span class="k">职业:</span> <span class="v" style="flex:1;">'+jobStrHtml+'</span></div>';
                grid += npcRow('层级', tierRoman, 'sam-npc-tier q-'+q);
                grid += npcRow('好感度', favor);
                card += '<div class="sam-npc-grid">'+grid+'</div>';
                if (n.是否队友 === true) card += renderNpcTierProgressBar(n, it.key);
                // 进度条 HP/EP/THP
                card += '<div class="sam-npc-sec"></div>';
                card += npcBar('HP', hp, hpmax, 'var(--sam-hp)');
                card += npcBar('EP', ep, epmax, 'var(--sam-ep)');
                card += npcThpRow(thp);
                // 外貌(含着装)
                if (looks || dress) {
                    card += '<div class="sam-npc-sec"></div>';
                    if (looks) card += npcRow('外貌', looks);
                    if (dress) card += npcRow('着装', dress);
                }
                // 态度
                if (mind) { card += '<div class="sam-npc-sec"></div>'; card += '<div class="sam-npc-quote">'+esc(mind)+'</div>'; }
            } else { // absent
                card += npcRow('种族', race);
                card += npcRow('身份', idStr);
                card += npcRow('层级', tierRoman, 'sam-npc-tier q-'+q);
                card += npcRow('好感度', favor);
                if (looks) card += npcRow('外貌', looks);
                if (bg) card += npcRow('背景故事', bg);
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
    /* NPC THP行: 纯数值(临时护盾/额外生命值, 无上限无进度条) */
    function npcThpRow(cur) {
        return '<div class="sam-npc-thp-row">'
            + '<span class="lbl">THP (临时护盾/额外生命值)</span>'
            + '<span class="num">'+cur+'</span>'
            + '</div>';
    }

    /* ===== 28. Tab: 经营(资产) —— 每个资产名为一个可折叠栏目, 展开显示全部资料(不再弹详情窗) ===== */
    function renderAssetTab(sd) {
        var assets = sd.资产 || {};
        var editMode = isEditMode();
        var keys = Object.keys(assets);
        if (keys.length === 0) return ''
            + '<div class="sam-asset-empty">'
            +   '<div class="ae-title">🏗️ 经营资产</div>'
            +   '<div class="ae-desc">这里显示数据库中的全部资产，包括玩家、NPC、势力共同资产与无主遗迹；只有所属对象包含当前玩家的资产才启用玩家自动收菜。</div>'
            +   '<div class="ae-section"><div class="ae-h">可经营类型</div>'
            +     '<ul>'
            +       '<li><b>固定地产</b>：领地 / 庄园 / 店铺 / 秘密据点，含建设序列、驻扎人员、待办事件</li>'
            +       '<li><b>大型载具或要塞</b>：星舰 / 战争兵器，可下场参战或场外火力支援，受能源与完整度约束</li>'
            +     '</ul>'
            +   '</div>'
            +   '<div class="ae-section"><div class="ae-h">如何获得</div>'
            +   '<div class="ae-desc">通过剧情事件、任务奖励或扩张领土获得（资产不得凭空生成）。获得领土级资产时，初始建设序列直接解锁满额 8 条。</div>'
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

    // 资产类型 → 图标
    function assetTypeIcon(type) {
        if (type === '大型载具' || type === '要塞' || type === '载具') return '🚀';
        if (type === '便携式据点' || type === '据点' || type === '安全屋') return '🎒';
        return '🏛️';
    }
    // 完整度 → 状态色类
    function assetIntegClass(v) {
        if (v >= 80) return 'good';
        if (v >= 40) return 'warn';
        return 'bad';
    }
    // 建设阶段 → 色类
    function assetStageClass(stage) {
        var map = { '基础':'s1', '进阶':'s2', '专业':'s3', '顶尖':'s4', '禁忌':'s5' };
        return map[stage] || 's1';
    }
    // 标量: 编辑态返回可编辑组件, 否则纯文本
    function assetScalar(path, val, type, editMode) {
        return editMode ? editInput(path, val, type || 'text') : esc(safeStr(val, '-'));
    }
    // 标签数组 → chips
    function assetTagChips(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return '<span class="sam-asset-none">无</span>';
        return '<div class="sam-asset-tags">' + arr.map(function(t) {
            return '<span class="sam-asset-tag">' + esc(safeStr(t)) + '</span>';
        }).join('') + '</div>';
    }
    // 规模点阵(1-10); 编辑态改用输入框
    function assetScaleDots(scale, path, editMode) {
        if (editMode) return editInput(path + '.主体规模', scale, 'number');
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
    /* 单个资产可折叠栏目(默认展开, 展开后显示全部资料) */
    function renderAssetBlock(name, a, path, editMode) {
        var type = safeStr(a.类型, '固定地产');
        var integ = safeNum(a.完整度, 100);
        var scale = safeNum(a.主体规模, 1);
        var integCls = assetIntegClass(integ);
        var integW = Math.max(0, Math.min(100, integ));
        var owners = normalizeAssetOwnersUi(a.所属对象);
        var ownerHead = owners.length === 0 ? '无主' : (owners.length === 1 ? displayPlayerIdentity(owners[0]) : '共管 ' + owners.length);

        // 头部: 图标 + 名字 + 类型徽章 + 完整度 + (编辑模式)删除按钮
        var assetDelBtn = editMode ? '<button type="button" class="sam-fc-del-btn sam-asset-del" data-asset-del="' + esc(path) + '" title="删除该资产">✕</button>' : '';
        var head = '<summary class="sam-asset-sum">'
            + '<span class="sam-asset-ico">' + assetTypeIcon(type) + '</span>'
            + '<span class="sam-asset-name">' + esc(name) + '</span>'
            + '<span class="sam-asset-badge">' + esc(type) + '</span>'
            + '<span class="sam-asset-badge">' + esc(ownerHead) + '</span>'
            + '<span class="sam-asset-integ ' + integCls + '">' + integ + '%</span>'
            + assetDelBtn
            + '</summary>';

        var body = '<div class="sam-asset-body">';

        // 概览: 完整度进度条 / 主体规模 / 类型
        body += '<div class="sam-asset-overview">'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">完整度</span>'
            +   '<div class="sam-asset-bar"><div class="sam-asset-bar-fill ' + integCls + '" style="width:' + integW + '%;"></div></div>'
            +   '<span class="sam-asset-ov-val">' + (editMode ? editInput(path + '.完整度', integ, 'number') : integ + '%') + '</span>'
            + '</div>'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">主体规模</span>'
            +   '<div class="sam-asset-scale">' + assetScaleDots(scale, path, editMode) + '</div>'
            + '</div>'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">类型</span>'
            +   '<span class="sam-asset-ov-val">' + (editMode ? editSelect(path + '.类型', ['固定地产', '大型载具与要塞', '便携式据点'], type) : esc(type)) + '</span>'
            + '</div>'
            + '<div class="sam-asset-ov-row">'
            +   '<span class="sam-asset-ov-lbl">所属对象</span>'
            +   '<span class="sam-asset-ov-val">' + (editMode ? editInput(path + '.所属对象', owners, 'tags') : assetOwnerChips(owners)) + '</span>'
            + '</div>'
            + '</div>';

        // 状态(长文本)
        var status = safeStr(a.状态, '');
        body += '<div class="sam-asset-sec">'
            + '<div class="sam-asset-sec-t">📋 状态</div>'
            + '<div class="sam-asset-text">' + (editMode ? editInput(path + '.状态', status, 'textarea') : (status ? esc(status) : '<span class="sam-asset-none">无</span>')) + '</div>'
            + '</div>';

        // 能源(可选)
        var energy = a.能源;
        if (energy && typeof energy === 'object' && (safeStr(energy.类型) || safeNum(energy.上限) > 0 || safeStr(energy.描述))) {
            var eCur = safeNum(energy.当前, 0);
            var eMax = safeNum(energy.上限, 0);
            var ePct = eMax > 0 ? Math.max(0, Math.min(100, Math.round(eCur / eMax * 100))) : 0;
            body += '<div class="sam-asset-sec">'
                + '<div class="sam-asset-sec-t">⚡ 能源 · ' + esc(safeStr(energy.类型, '-')) + '</div>'
                + '<div class="sam-asset-energy">'
                +   '<div class="sam-asset-bar"><div class="sam-asset-bar-fill energy" style="width:' + ePct + '%;"></div></div>'
                +   '<span class="sam-asset-energy-num">' + (editMode ? editInput(path + '.能源.当前', eCur, 'number') : eCur) + ' / ' + (editMode ? editInput(path + '.能源.上限', eMax, 'number') : eMax) + '</span>'
                + '</div>';
            var eDesc = safeStr(energy.描述, '');
            if (eDesc || editMode) {
                body += '<div class="sam-asset-text">' + (editMode ? editInput(path + '.能源.描述', eDesc, 'textarea') : esc(eDesc)) + '</div>';
            }
            body += '</div>';
        }

        // 消耗单元(可选)
        var units = a.消耗单元 || {};
        var uKeys = Object.keys(units);
        if (uKeys.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">🔋 消耗单元 (' + uKeys.length + ')</div>';
            uKeys.forEach(function(uk) {
                var u = units[uk] || {};
                var upath = path + '.消耗单元.' + uk;
                var rem = safeNum(u.余量, 0);
                var cap = safeNum(u.上限, 0);
                var upct = cap > 0 ? Math.max(0, Math.min(100, Math.round(rem / cap * 100))) : 0;
                body += '<div class="sam-asset-unit">'
                    + '<div class="sam-asset-unit-head"><span class="sam-asset-unit-name">' + esc(uk) + '</span>'
                    +   '<span class="sam-asset-unit-num">' + (editMode ? editInput(upath + '.余量', rem, 'number') : rem) + ' / ' + (editMode ? editInput(upath + '.上限', cap, 'number') : cap) + '</span></div>'
                    + '<div class="sam-asset-bar"><div class="sam-asset-bar-fill" style="width:' + upct + '%;"></div></div>'
                    + (Array.isArray(u.加成) && u.加成.length ? '<div class="sam-asset-unit-bonus">' + assetTagChips(u.加成) + '</div>' : '')
                    + '</div>';
            });
            body += '</div>';
        }

        // 建设序列(可选)
        var seqs = a.建设序列 || {};
        var sKeys = Object.keys(seqs);
        if (sKeys.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">🏗️ 建设序列 (' + sKeys.length + ')</div>';
            sKeys.forEach(function(sk) {
                var s = seqs[sk] || {};
                var spath = path + '.建设序列.' + sk;
                var stage = safeStr(s.阶段, '基础');
                var seqDelBtn = editMode ? '<button type="button" class="sam-fc-del-btn sam-asset-seq-del" data-asset-seq-del="' + esc(spath) + '" title="删除该建设序列">✕</button>' : '';
                body += '<div class="sam-asset-seq">'
                    + '<div class="sam-asset-seq-head">'
                    +   '<span class="sam-asset-seq-name">' + esc(sk) + '</span>'
                    +   '<span class="sam-asset-stage ' + assetStageClass(stage) + '">' + esc(stage) + '</span>'
                    +   seqDelBtn
                    + '</div>'
                    + '<div class="sam-asset-seq-rows">'
                    +   assetKvRow('功能', assetScalar(spath + '.功能', safeStr(s.功能), 'text', editMode))
                    +   (function() {
                            var cv = safeStr(s.产出);
                            // 产出为空或"无"时隐藏该字段与下次产出日期(编辑模式仍保留以便录入)
                            if (!editMode && (!cv || cv === '无')) return '';
                            return assetKvRow('产出', assetScalar(spath + '.产出', cv, 'text', editMode))
                                + assetKvRow('下次产出日期', assetScalar(spath + '.下次产出日期', safeStr(s.下次产出日期, '无'), 'text', editMode));
                        })()
                    + '</div>'
                    + (Array.isArray(s.加成) && s.加成.length ? '<div class="sam-asset-seq-bonus">' + assetTagChips(s.加成) + '</div>' : '')
                    + '</div>';
            });
            body += '</div>';
        }

        // 驻扎人员(可选)
        var staff = a.驻扎人员 || {};
        var stKeys = Object.keys(staff);
        if (stKeys.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">👥 驻扎人员 (' + stKeys.length + ')</div>'
                + '<div class="sam-asset-staff">';
            stKeys.forEach(function(pn) {
                body += '<div class="sam-asset-staff-item"><span class="sam-asset-staff-name">' + esc(pn) + '</span><span class="sam-asset-staff-role">' + esc(safeStr(staff[pn], '-')) + '</span></div>';
            });
            body += '</div></div>';
        }

        // 待办事件(可选) —— 非编辑模式下整条可点击, 点击将该条文本填入输入框
        var todo = a.待办事件;
        if (Array.isArray(todo) && todo.length > 0) {
            body += '<div class="sam-asset-sec"><div class="sam-asset-sec-t">📌 待办事件 (' + todo.length + ')</div>'
                + '<div class="sam-asset-todo">';
            todo.forEach(function(t) {
                var todoText = safeStr(t);
                if (editMode) {
                    body += '<div class="sam-asset-todo-item">' + esc(todoText) + '</div>';
                } else {
                    body += '<div class="sam-asset-todo-item clickable" data-asset-todo="' + esc(todoText) + '" title="点击将该待办事件填入输入框">'
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

    /* ===== 29. Tab: 传闻(全部一屏展示; 根据变量全部显示, 情报交易.真实内幕除外) =====
       R21-传闻交易: 移植自 创世状态栏.txt
         - 顶部工具栏: 一键删除全部传闻(需确认)
         - 每个分类标题右侧: 一键清除(仅清该分类, 需确认)
         - 情报交易卡片: 要价数字旁加"可交易"按钮, 点击发送文字到输入框(找{卖家}购买情报「{名}」)
         - 每条传闻名字最右侧: 单条删除按钮
    */
    function renderRumorTab(sd) {
        var r = sd.传闻 || {};
        var editMode = isEditMode();
        var html = '';
        var street = r.街头巷议 || {};
        var intel = r.情报交易 || {};
        var notice = r.布告与檄文 || {};
        // 顶部工具栏: 一键删除全部传闻(仅当确实有传闻时才出现)
        var total = Object.keys(street).length + Object.keys(intel).length + Object.keys(notice).length;
        if (total > 0) {
            html += '<div class="sam-rumor-toolbar">'
                + '<button type="button" class="sam-rumor-clearall-btn" data-rumor-clearall="1">🗑 一键删除全部传闻 ('+total+')</button>'
                + '</div>';
        }
        // 分类清除按钮(挂在 secBlock summary 右侧) — 仅当该分类传闻数 ≥ 2 才显示
        function clearBtn(sectionKey, count) {
            if (count < 2) return '';
            return '<button type="button" class="sam-rumor-clear-btn" data-rumor-clear-section="'+esc(sectionKey)+'">一键清除</button>';
        }
        var nStreet = Object.keys(street).length;
        var nIntel = Object.keys(intel).length;
        var nNotice = Object.keys(notice).length;
        // 街头巷议
        html += secBlock('🗣️ 街头巷议 ('+nStreet+')',
            renderRumorFullList(street, '传闻.街头巷议', editMode, [
                {k:'来源', f:'来源', type:'text'},
                {k:'可信度', f:'可信度', type:'select', options:['酒话','可疑','或许可信']},
                {k:'内容', f:'内容', type:'textarea', block:true}
            ], '街头巷议'), nStreet > 0, clearBtn('街头巷议', nStreet));
        // 情报交易: 要价字段标记 tradeable:true, 触发交易按钮
        html += secBlock('💎 情报交易 ('+nIntel+')',
            renderRumorFullList(intel, '传闻.情报交易', editMode, [
                {k:'卖家', f:'卖家', type:'text'},
                {k:'情报评级', f:'情报评级', type:'select', options:['F','E','D','C','B','A','S','SS','SSS','日常','战略']},
                // ★ 要价字段按世界书规则为字符串(带货币单位如"50万日元"), 不能用 number 类型强转
                {k:'要价', f:'要价', type:'text', tradeable:true},
                {k:'摘要', f:'摘要', type:'textarea', block:true}
            ], '情报交易'), nIntel > 0, clearBtn('情报交易', nIntel));
        // 布告与檄文
        html += secBlock('📜 布告与檄文 ('+nNotice+')',
            renderRumorFullList(notice, '传闻.布告与檄文', editMode, [
                {k:'发布者', f:'发布者', type:'text'},
                {k:'张贴位置', f:'张贴位置', type:'text'},
                {k:'内容', f:'内容', type:'textarea', block:true}
            ], '布告与檄文'), nNotice > 0, clearBtn('布告与檄文', nNotice));
        return html;
    }
    /* 传闻/布告等通用完整字段列表(按schema字段全量展示, 长文本字段独占一行)
       sectionKey: 当前分类 key(街头巷议/情报交易/布告与檄文), 用于单条删除按钮回写路径
       fd.tradeable=true 的字段, 在值旁追加"可交易"按钮(仅情报交易.要价)
    */
    function renderRumorFullList(obj, basePath, editMode, fields, sectionKey) {
        var keys = Object.keys(obj);
        if (keys.length === 0) return '<div class="sam-empty">[无]</div>';
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
                    // ★ 可交易按钮: 紧贴要价数字右侧(仅情报交易.要价 字段)
                    if (fd.tradeable) {
                        var seller = safeStr(it.卖家) || '不明';
                        // ★ 要价为带货币单位的字符串(如"50万日元"), 保留原值透传给按钮 data-rumor-price,
                        //   不可强转 number 否则非纯数字字符串被归零(导致按钮也是0)
                        var priceStr = safeStr(val) || '0';
                        display = '<span class="sam-rumor-price">'+display
                            + '<button type="button" class="sam-rumor-trade-btn" data-rumor-trade="1" data-rumor-name="'+esc(k)+'" data-rumor-seller="'+esc(seller)+'" data-rumor-price="'+esc(priceStr)+'" title="发送交易请求到输入框">🛒 可交易</button>'
                            + '</span>';
                    }
                    rows += '<div class="sam-row"><span class="k">'+esc(fd.k)+'</span><span class="v">'+display+'</span></div>';
                }
            });
            // ★ 单条删除按钮: 挂在卡片标题最右侧(仅编辑模式显示)
            var delBtn = editMode ? '<button type="button" class="sam-rumor-del-btn" data-rumor-del="1" data-rumor-section="'+esc(sectionKey||'')+'" data-rumor-name="'+esc(k)+'" title="删除该条传闻">✕</button>' : '';
            html += '<div class="sam-full-card">'
                + '<div class="sam-fc-head"><div class="sam-fc-title">'+esc(k)+'</div>'+delBtn+'</div>'
                + '<div class="sam-fc-rows">'+rows+'</div>'
                + blockHtml
                + '</div>';
        });
        html += '</div>';
        return html;
    }

    /* ===== 30. Tab: 世界(全部一屏展示) ===== */
    function renderWorldTab(sd) {
        var w = sd.世界 || {};
        var isSingleWorld = (sd.设置 && sd.设置.单一世界 === true);
        var isInHub = (sd.系统状态 && sd.系统状态.是否在主神空间 === true);
        var editMode = isEditMode();
        var html = '';
        var alienRadar = w.异端雷达 || {};
        var alienRoster = alienRadar.名单 && typeof alienRadar.名单 === 'object' && !Array.isArray(alienRadar.名单) ? alienRadar.名单 : {};
        var alienNames = Object.keys(alienRoster);
        var alienAliveCount = alienNames.filter(function(name) {
            return safeStr((alienRoster[name] || {}).状态) !== '死亡';
        }).length;
        // 世界介绍(时间/地点已在顶部 topbar 显示, 此处不重复)
        var introFields = [
            {k:'名称', path:'世界.名称', type:'text'},
            {k:'位格', path:'世界.位格', type:'text'},
            {k:'难度', path:'世界.难度', type:'text'},
            {k:'模式', path:'世界.异端雷达.当前模式', type:'text', hideOnSingle:true}
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
        var stabilityValue = Math.max(0, Math.min(120, safeNum(w.稳定, 100)));
        var stabilityPct = Math.max(0, Math.min(100, (stabilityValue / 120) * 100));
        var stabilityOverClass = stabilityValue > 100 ? ' over' : '';
        introHtml += '<div class="sam-world-stability">'
            + '<div class="sam-world-stability-head"><span class="k">稳定度</span><span class="v">'+esc(stabilityValue)+'</span></div>'
            + '<div class="sam-world-stability-track"><div class="sam-world-stability-fill'+stabilityOverClass+'" style="width:'+stabilityPct+'%"></div><span class="sam-world-stability-mark100"></span></div>'
            + '<div class="sam-world-stability-scale"><span class="s0">0</span><span class="s100">100</span><span class="s120">120</span></div>'
            + '</div>';
        if (!isSingleWorld && !isInHub) {
            introHtml += '<div class="sam-row"><span class="k">异端存活数量</span><span class="v"><span class="sam-edit-readonly">'+alienAliveCount+'</span></span></div>';
        }
        html += secBlock('🌍 世界介绍', introHtml);
        // 异端详情暂时对角色隐藏；保留完整折叠栏代码，后续只需将此开关改为 true 即可恢复。
        var SHOW_ALIEN_ROSTER_DETAILS = false;
        if (SHOW_ALIEN_ROSTER_DETAILS && !isSingleWorld && !isInHub && alienNames.length) {
            var alienHtml = '<div class="sam-alien-list">';
            alienNames.forEach(function(name) {
                var alien = alienRoster[name] || {};
                var status = safeStr(alien.状态) === '死亡' ? '死亡' : '活跃';
                var stateClass = status === '死亡' ? 'dead' : 'active';
                var sourceText = alien.来源 ? (alien.来源 === '原创' ? '原创' : '《' + alien.来源 + '》') : '';
                var meta = [sourceText, alien.阵营, alien.职业, alien.层级 ? alien.层级 + '级' : ''].filter(Boolean).join(' · ');
                alienHtml += '<div class="sam-alien-item"><div class="sam-alien-main"><div class="sam-alien-name">'+esc(name)+'</div>'
                    + (meta ? '<div class="sam-alien-meta">'+esc(meta)+'</div>' : '')
                    + (alien.经历 ? '<div class="sam-alien-meta">履历 · '+esc(alien.经历)+'</div>' : '')
                    + '</div><span class="sam-alien-state '+stateClass+'">'+esc(status)+'</span></div>';
            });
            alienHtml += '</div>';
            html += secBlock('☄️ 异端名单 · ' + alienAliveCount + '/' + alienNames.length, alienHtml, false);
        }
        // 法则(移到世界介绍下方)
        var laws = Array.isArray(w.法则) ? w.法则 : [];
        var lawHtml = '';
        if (laws.length === 0) lawHtml += '<div class="sam-empty">[无法则]</div>';
        else laws.forEach(function(law, i) { lawHtml += '<div class="sam-row"><span class="k">法则'+(i+1)+'</span><span class="v">'+(editMode ? editInput('世界.法则.'+i, safeStr(law), 'text') : esc(law))+'</span></div>'; });
        html += secBlock('📜 法则', lawHtml);
        // 货币
        var cur = w.货币 || {};
        var curHtml = '';
        curHtml += '<div class="sam-row"><span class="k">体系</span><span class="v">'+(editMode ? editInput('世界.货币.体系', safeStr(cur.体系), 'text') : esc(cur.体系||'-'))+'</span></div>';
        curHtml += '<div class="sam-row"><span class="k">购买力</span><span class="v">'+(editMode ? editInput('世界.货币.购买力基准', safeStr(cur.购买力基准), 'text') : esc(cur.购买力基准||'-'))+'</span></div>';
        curHtml += '<div class="sam-row"><span class="k">经济波动</span><span class="v">'+(editMode ? editInput('世界.货币.经济波动', safeStr(cur.经济波动), 'text') : esc(cur.经济波动||'-'))+'</span></div>';
        html += secBlock('💰 货币', curHtml);
        // 因果轨道(移到货币下方、探索点上方)
        var ko = w.因果轨道 || {};
        var koHtml = '';
        koHtml += '<div class="sam-row"><span class="k">当前阶段</span><span class="v">'+(editMode ? editInput('世界.因果轨道.当前阶段', safeStr(ko.当前阶段), 'text') : esc(ko.当前阶段||'-'))+'</span></div>';
        koHtml += '<div class="sam-row"><span class="k">故事线</span><span class="v">'+(editMode ? editInput('世界.因果轨道.故事线', safeStr(ko.故事线), 'text') : esc(ko.故事线||'-'))+'</span></div>';
        koHtml += '<div class="sam-row"><span class="k">下一节点</span><span class="v">'+(editMode ? editInput('世界.因果轨道.下一节点', safeStr(ko.下一节点), 'text') : esc(ko.下一节点||'-'))+'</span></div>';
        var off = ko.偏移记录 || {};
        var okeys = Object.keys(off);
        var offHtml = '';
        okeys.forEach(function(k) {
            var o = off[k] || {};
            var path = '世界.因果轨道.偏移记录.'+k;
            offHtml += '<div class="sam-row"><span class="k">'+esc(k)+'</span><span class="v">'+(editMode ? editInput(path+'.描述', safeStr(o.描述), 'text') : esc(o.描述||'-'))+'</span></div>';
        });
        if (okeys.length > 0) {
            koHtml += '<details class="sam-sec" style="margin-top:6px;">'
                + '<summary class="sam-sec-sum"><span class="sam-sec-title">偏差记录 ('+okeys.length+')</span></summary>'
                + '<div class="sam-sec-body">' + offHtml + '</div>'
                + '</details>';
        }
        html += secBlock('🌀 因果轨道', koHtml);
        // 探索点
        var exp = w.探索 || {};
        // 编辑模式删除按钮(探索点/势力通用, 挂在卡片 head 右侧)
        function worldDelBtn(path) {
            if (!editMode) return '';
            return '<button type="button" class="sam-rumor-del-btn" data-world-del="1" data-del-path="'+esc(path)+'" title="删除该条目">✕</button>';
        }
        var ekeys = Object.keys(exp);
        var expHtml = '';
        if (ekeys.length === 0) expHtml += '<div class="sam-empty">[无探索点]</div>';
        else ekeys.forEach(function(k) {
            var e = exp[k] || {};
            var path = '世界.探索.'+k;
            var q = e.风险 ? parseRarity(e.风险) : '';
            var rows = fcRow('探索度', safeNum(e.探索度,0)+'%', path+'.探索度', editMode, 'number');
            var body = fcRow('描述', e.描述, path+'.描述', editMode);
            expHtml += fullCard(q, k, rows, body, worldDelBtn(path));
        });
        html += secBlock('🧭 探索点 ('+Object.keys(w.探索||{}).length+')', expHtml, Object.keys(w.探索||{}).length > 0);
        // 势力
        var forces = w.势力 || {};
        var fkeys = Object.keys(forces);
        var forceHtml = '';
        if (fkeys.length === 0) forceHtml += '<div class="sam-empty">[无势力]</div>';
        else fkeys.forEach(function(k) {
            var f = forces[k] || {};
            var path = '世界.势力.'+k;
            var q = f.实力 ? parseRarity(f.实力) : '';
            var rows = '';
            rows += fcRow('声望', safeNum(f.声望,0), path+'.声望', editMode, 'number');
            var body = fcRow('描述', f.描述, path+'.描述', editMode);
            forceHtml += fullCard(q, k, rows, body, worldDelBtn(path));
        });
        html += secBlock('⚔️ 势力 ('+Object.keys(w.势力||{}).length+')', forceHtml, Object.keys(w.势力||{}).length > 0);
        return html;
    }

    /* ===== 30b. Tab: 商城(主神空间交易终端) =====
       - 顶部紧凑余额条: 显示当前空间币(角色.空间币, 只读, 由系统结算发放)
       - 状态提示条: 战斗中/任务世界/主神空间 三态, 置于商城入口栏目上方
       - 交易规则栏目(折叠): 双轨经济/物价锚点等, 置于商城入口上方
       - 商城入口栏目: 需求输入框(左) + 刷新商品按钮(右); 不在主神空间/战斗中时禁用
         刷新商品按钮: 调正文AI generateRaw 生成商品库 → 写回 stat_data.商城 → renderAll
     */
    function renderShopTab(sd) {
        var p = sd.角色 || {};
        var sys = sd.系统状态 || {};
        var editMode = isEditMode();
        var coin = safeNum(p.空间币, 0);
        var inHub = (sys.是否在主神空间 === true);
        var isCombat = (sys.是否战斗中 === true);
        // ★ 多角色商城: 校正 shopCurrentActor(若当前NPC已离场则退回角色), 并解析当前角色对象
        shopEnsureActorValid(sd);
        var actorCtx = shopResolveCharacter(sd, shopCurrentActor);
        var curCharacter = actorCtx.character;
        // 血统数量上限判定: 以当前选中角色的血统数为准(用于商城血统区灰显)
        shopBloodCount = Object.keys(curCharacter.血统 || {}).length;
        shopBloodLimit = BLOODLINE_CAP;
        var isSingleWorld = (sd && sd.设置 && sd.设置.单一世界 === true);
        var html = '';
        // 顶部紧凑余额条(空间币由系统结算发放, 余额只读展示; 编辑模式仅作兜底)
        var coinDisplay = editMode ? editInput('角色.空间币', coin, 'number') : esc(String(coin));
        html += '<div class="sam-shop-coin-mini"><span class="lbl">💰 余额</span><span class="val">' + coinDisplay + '</span><span class="lbl">空间币</span></div>';
        var credentialLedger = p.权限凭证 || {};
        var credentialChips = [];
        for (var _uiCi = 0; _uiCi < SHOP_PERMISSION_QUALITY_ORDER.length; _uiCi++) {
            var _uiGrade = SHOP_PERMISSION_QUALITY_ORDER[_uiCi];
            var _uiQty = Math.max(0, Math.floor(safeNum(credentialLedger[_uiGrade], 0)));
            if (_uiQty > 0) credentialChips.push('<span class="sam-shop-credential-chip">'+esc(_uiGrade)+' ×'+_uiQty+'</span>');
        }
        html += '<div class="sam-shop-credential-mini"><span class="lbl">🎫 权限凭证</span>'
            + (credentialChips.length ? credentialChips.join('') : '<span class="sam-shop-credential-empty">无</span>')
            + '</div>';
        // 状态提示条: 置于商城入口上方(独立于栏目, 不折叠)
        if (isCombat) {
            html += '<div class="sam-shop-warn">⚔️ 战斗中无法交易, 请在安全区域后再试</div>';
        } else if (!inHub && !isSingleWorld) {
            html += '<div class="sam-shop-warn">🔒 当前位于任务世界, 空间币已锁定<br>需返回主神空间后才能开启商城交易</div>';
        } else {
            if (isSingleWorld) {
                html += '<div class="sam-shop-ok">✅ 已在安全区域, 可开启商城交易</div>';
            }else{
                html += '<div class="sam-shop-ok">✅ 已在主神空间, 可开启商城交易</div>';
            }
        }
        // 交易规则(折叠): 置于商城入口上方
        var ruleHtml = '<div class="sam-row"><span class="k">交易货币</span><span class="v">空间币(主神空间专用)</span></div>'
            + '<div class="sam-row"><span class="k">商品类别</span><span class="v">装备 / 道具 / 技能 / 血统 / 升级服务</span></div>'
            + '<div class="sam-row"><span class="k">物价区间</span><span class="v">F(10-99) · E(100-999) · D(1k-4.9k) · C(5k-2w) · B(2w-8w) · A(8w-32w) · S(32w-127w) · SS(128w-511w) · SSS(512w+)</span></div>'
            + '<div class="sam-row"><span class="k">权限锁</span><span class="v">C级起，购买/升级高于购买对象当前层级的商品额外消耗同品质权限凭证×1；同级及以下不消耗，血统融合结果不消耗</span></div>'
            + '<div class="sam-row"><span class="k">双轨隔离</span><span class="v">任务世界内强制使用本地货币, 空间币不可流通</span></div>';
        html += secBlock('📜 交易规则', ruleHtml, false);
        // 商城入口(含商品市场): 需求输入框(左) + 刷新商品按钮(右) + Tab条 + 列表 + 购物车条
        // 不在主神空间时禁用入口控件, 但商品库仍可浏览(已购入的库存)
        var canShop = (!isCombat && (inHub || isSingleWorld));
        // 刷新中: 按钮置灰 + 文案变更, 需求输入框也禁用(由模块级 shopRefreshing 驱动, 切换界面/重渲染仍保持)
        var refreshDisabled = (!canShop || shopRefreshing) ? ' disabled' : '';
        var refreshBtnText = shopRefreshing ? '🔄 正在刷新商品…' : '🔄 刷新商品';
        var reqDisabled = (!canShop || shopRefreshing) ? ' disabled' : '';
        // ★ 角色下拉框: 角色自身 + 在场队友NPC; 刷新中也一并禁用
        var actorDisabled = (!canShop || shopRefreshing) ? ' disabled' : '';
        var actorOpts = shopBuildActorOptions(sd);
        var actorHtml = '<span class="sam-shop-actor-label">为目标:</span>'
            + '<select class="sam-shop-actor-select" data-shop-actor'+actorDisabled+'>';
        for (var ao = 0; ao < actorOpts.length; ao++) {
            var optEntry = actorOpts[ao];
            var sel = (optEntry.name === shopCurrentActor) ? ' selected' : '';
            actorHtml += '<option value="'+esc(optEntry.name)+'"'+sel+'>'+esc(optEntry.label)+'</option>';
        }
        actorHtml += '</select>';
        // 布局: 输入框单独一排(手机端不被挤窄); 目标下拉框 + 刷新按钮占另一排
        // 跨刷新保留输入内容: 渲染时回填模块级 shopReqText(刷新后 renderAll 重建DOM, value属性使其不丢)
        var entryHtml = '<div class="sam-shop-entry">'
            + '<input type="text" class="sam-shop-req" data-shop-req placeholder="写入需求内容(刷新后内容保留, 不满意可直接再刷)"'+reqDisabled+' value="'+esc(shopReqText)+'">'
            + '<div class="sam-shop-entry-actions">'
            + actorHtml
            + '<button type="button" class="sam-shop-refresh-btn" data-shop-refresh'+refreshDisabled+'>'+refreshBtnText+'</button>'
            + '</div>'
            + '</div>';
        // ===== 市场区: 从 stat_data.商城[当前角色的成员商库] 读取持久化商品数据 =====
        // 每个角色独有商品库, 切换角色时清空当前显示并加载该角色的库存; 库存由AI在刷新后写入, 持久保存在MVU中
        var rawMarket = (sd.商城 && sd.商城) ? sd.商城 : null;
        var actorLib = shopGetActorLibRaw(rawMarket, shopCurrentActor);
        if (actorLib) {
            shopMarketData = shopNormalizeMarketData(actorLib);
            // 切换聊天/新商品上架时, 若当前区域无数据则回退到首个有数据的区域
            var fallback = shopPickFirstAvailableTab();
            if (!shopActiveTab || !shopTabHasData(shopActiveTab)) shopActiveTab = fallback;
        } else {
            shopMarketData = null;
        }
        // 商品面板与"刷新/购买"能力绑定: 不能刷新(战斗中/不在主神空间)时, 直接隐藏下方整个商品面板
        //   canShop 下再细分三态:
        //     刷新中 → 固定高容器 + 刷新中提示(隐藏原列表)
        //     已刷新 → 固定高容器 + Tab条 + 列表 + 购物车条(三段式, footer常驻底部)
        //     空库   → 空库提示
        //   !canShop → 不渲染任何商品面板(原因由上方状态提示条说明)
        if (canShop) {
            if (shopRefreshing) {
                entryHtml += '<div class="sam-shop-market"><div class="sam-shop-refreshing">'
                    + '<div class="sam-shop-refreshing-spin">🔄</div>'
                    + '<div>正在请求正文AI生成商品…<br>可以关闭界面或等待, 商品刷新完成后会弹窗提示。</div>'
                    + '<button type="button" class="sam-shop-stop-btn" data-sam-act="shop-stop-refresh">⏹ 停止刷新(卡住时点此恢复)</button>'
                    + '</div></div>';
            } else if (shopMarketData) {
                var hasAnyItem = shopMarketHasAnyData();
                entryHtml += '<div class="sam-shop-market">' + shopRenderTabs() + shopRenderContent(coin) + (hasAnyItem ? shopRenderFooter(coin) : '') + '</div>';
            } else {
                entryHtml += '<div class="sam-shop-empty">尚未刷新商品, 请在上方写入需求后点击「刷新商品」</div>';
            }
        }
        html += secBlock('🛒 商城入口', entryHtml, true);
        var receiptText = safeStr(sys.待播报记录, '').trim();
        var receiptHtml = receiptText
            ? '<div style="white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.55;color:var(--sam-text)">'+esc(receiptText)+'</div>'
                + '<div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="sam-confirm-btn cancel" data-receipt-clear>删除小票</button></div>'
            : '<div class="sam-empty">暂无待叙事交易</div>';
        html += secBlock('🧾 待播报记录', receiptHtml, true);
        return html;
    }

    // 市场区辅助: 判断某区域是否有数据
    function shopTabHasData(cat) {
        if (!shopMarketData) return false;
        // 装备区/技能区/道具区: 分组对象 {类型label: [...]}; 血统区: 扁平数组
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
    // 检测商城全部区域是否至少有一个商品(用于决定是否渲染购物车栏)
    function shopMarketHasAnyData() {
        if (!shopMarketData) return false;
        var cats = ['装备区','道具区','技能区','血统区','形态区','升级区'];
        for (var i = 0; i < cats.length; i++) { if (shopTabHasData(cats[i])) return true; }
        return false;
    }
    // 按区域/槽位/名称查找标准化商品条目(返回数组, 供 toggleSelect 使用)
    function shopFindItems(cat, slot, name) {
        if (!shopMarketData) return [];
        var out = [];
        // 装备区/技能区/道具区: 分组对象(slot=类型label); 血统区: 扁平数组(slot忽略)
        if (cat === '装备区' || cat === '技能区' || cat === '道具区') {
            var groups = shopMarketData[cat] || {};
            if (slot) {
                // 有slot: 精确定位该类型分组
                var arr = groups[slot] || [];
                for (var i = 0; i < arr.length; i++) { if (arr[i].name === name) out.push(arr[i]); }
            } else {
                // 无slot(数量控件等场景): 遍历全部分组查找
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

    /* ===== 31. 详情弹窗(点击卡片) ===== */
    // 角色不可见的敏感字段(不给角色看)
    var HIDDEN_FIELDS = ['隐藏真相', '真实内幕', '态度', '真属性'];
    function openDetailModal(path, title) {
        var sd = getStatData();
        if (!sd) return;
        var obj = resolvePath(sd, path);
        if (obj == null) { showModal(title, '<div class="sam-empty">数据不存在</div>'); return; }
        // NPC详情: 走专用角色档案面板(分区精美排版, 空值不显示, 不裸露技术字段)
        var isNpc = (typeof path === 'string' && path.indexOf('关系列表.') === 0);
        if (isNpc) {
            // ★ 编辑模式: NPC档案内嵌可编辑字段(种族/身份/好感度/战斗数值/档案文本), 底部追加保存按钮
            var editMode = isEditMode();
            var npcHtml = renderNpcDetail(obj, title, editMode, path);
            var footHtml = editMode ? '<div class="sam-nd-edit-tip">✎ 编辑模式 · 点击数值就地修改, 失焦自动暂存</div><button type="button" class="sam-save-btn sam-nd-save">💾 保存</button>' : '';
            showModal(title + ' · 角色档案' + (editMode ? ' · 编辑' : ''), '<div class="sam-nd">'+npcHtml+footHtml+'</div>');
            if (editMode) bindEditorEvents($('#samsara-modal')); // modal 独立DOM, 需单独委托编辑事件
            return;
        }
        // ★ 编辑模式: 通用详情(世界条目/角色状态等)也走递归编辑渲染, 底部追加保存按钮
        var ed2 = isEditMode();
        var hidden = HIDDEN_FIELDS;
        var html = ed2 ? renderDetailNode(obj, hidden, [], ed2, path) : renderDetailNode(obj, hidden);
        var footHtml2 = ed2 ? '<div class="sam-nd-edit-tip">✎ 编辑模式 · 点击数值就地修改, 失焦自动暂存</div><button type="button" class="sam-save-btn sam-nd-save">💾 保存</button>' : '';
        showModal(title + ' · 详情' + (ed2 ? ' · 编辑' : ''), '<div class="sam-detail">'+html+'</div>'+footHtml2);
        if (ed2) bindEditorEvents($('#samsara-modal')); // modal 独立DOM, 需单独委托编辑事件
    }
    /* NPC角色档案专用渲染: 分区卡片式, 仅显示有值字段, 不裸露HP_MAX/EP_MAX/空对象/未激活形态等技术字段
       ★ editMode(编辑模式): 基础信息/好感度/战斗数值/档案文本渲染为点击即编辑控件(editInput), 层级/最终属性保持只读(受 isReadonlyPath 保护) */
    function renderNpcDetail(n, name, editMode, npcPath) {
        if (!n || typeof n !== 'object') return '<div class="sam-empty">数据不存在</div>';
        editMode = !!editMode;
        npcPath = npcPath || ('关系列表.' + name);
        // 层级显示: 形态激活且形态层级>自身时显示形态层级(仅显示, 不写回)
        var _dispRaw = displayTierRaw(n);
        var tierRoman = tierRomanOf(_dispRaw); var q = tierQOfClass(_dispRaw);
        var hp = safeNum(n.HP,0), hpmax = safeNum(n.HP_MAX,0);
        var ep = safeNum(n.EP,0), epmax = safeNum(n.EP_MAX,0);
        var thp = safeNum(n.THP,0);
        var favor = safeNum(n.好感度,0);
        var race = safeStr(n.种族) || '';
        var rawIdArr = Array.isArray(n.身份) ? n.身份 : [];
        var showAllId = (n.是否队友 === true) || (favor > 60);
        var idArr = showAllId ? rawIdArr : filterHiddenIdentity(rawIdArr);
        // 编辑态字段取值辅助: 值单元格(可编辑=editInput, 只读/非编辑=纯文本)
        var edCell = function(field, val, type) {
            var p = npcPath + '.' + field;
            if (editMode && !isReadonlyPath(p)) {
                var v = (type === 'number') ? safeNum(val, 0) : val;
                return '<span class="v">'+editInput(p, v, type || 'text')+'</span>';
            }
            return '<span class="v">'+esc(safeStr(val))+'</span>';
        };
        // 编辑态开关辅助(在场/是否队友)
        var edToggle = function(field, val) {
            var p = npcPath + '.' + field;
            if (editMode && !isReadonlyPath(p)) return editToggle(p, val);
            return (val === true) ? '是' : '否';
        };
        var cf = n.当前形态 || {};
        var formName = (cf.激活 === true && safeStr(cf.名称)) ? safeStr(cf.名称) : '';
        var attrs = n.最终属性 || {};
        var html = '';
        // ① 头部: 名字 + 形态标签 + 层级徽章 + 在场/队友徽章
        html += '<div class="sam-nd-head"><div class="sam-nd-name">'+esc(name||'')+(formName?'<span class="sam-nd-form">🌀 '+esc(formName)+'</span>':'')+'</div>';
        html += '<div class="sam-nd-badges"><span class="sam-nd-tier q-'+q+'">'+esc(tierRoman)+'</span>';
        if (n.在场 === true) html += '<span class="sam-nd-badge present">在场</span>';
        if (n.是否队友 === true) html += '<span class="sam-nd-badge team">队友</span>';
        // 编辑模式: 头部徽章区追加 在场/队友 开关(点击切换, 保存时写回)
        if (editMode) {
            html += '<span class="sam-nd-badge edit-toggle">在场 '+editToggle(npcPath+'.在场', n.在场 === true)+'</span>';
            html += '<span class="sam-nd-badge edit-toggle">队友 '+editToggle(npcPath+'.是否队友', n.是否队友 === true)+'</span>';
        }
        html += '</div></div>';
        // ② 好感度双向条 (中线=0, 正向右绿, 负向左红); 编辑模式数值部分可编辑
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
        // ③ 基础信息网格 (编辑模式恒渲染可编辑行; 只读态仅有值时)
        var grid = '';
        if (editMode) {
            grid += ndEditRow('种族', edCell('种族', race));
            // ★ 身份编辑用原始数组(未过滤隐藏阵营身份), 避免保存时把隐藏身份冲掉; flushStagedDisplay 对 .身份 自动拆数组
            grid += ndEditRow('身份', edCell('身份', rawIdArr.join(',')));
            var npcQty2 = safeNum(n.数量, 1);
            grid += ndEditRow('数量', edCell('数量', npcQty2, 'number'));
        } else {
            if (race) grid += ndRow('种族', race);
            if (idArr.length) grid += ndRow('身份', idArr.join(' / '));
            var npcQty = safeNum(n.数量, 1);
            if (npcQty > 1) grid += ndRow('数量', 'x'+npcQty);
        }
        if (grid) html += '<div class="sam-nd-grid">'+grid+'</div>';
        // ★ 职业: 编辑模式→结构化编辑器(同角色面板); 只读态→折叠面板(自带 🎖 标题)
        if (editMode && !isReadonlyPath(npcPath+'.职业')) {
            html += occupationEditHtml(n.职业, npcPath+'.职业');
        } else {
            var occHtml = occupationCardsHtml(n.职业);
            if (occHtml) html += occHtml;
        }
        // ④ 态度 (编辑模式: 全宽可编辑块(textarea 在 2 列网格中过窄, 故独立渲染); 只读态: 仅有值时显示引用)
        if (editMode) {
            if (!isReadonlyPath(npcPath+'.态度')) {
                html += '<div class="sam-nd-block"><div class="sam-nd-block-lbl">态度</div><div class="sam-nd-block-ct">'+editInput(npcPath+'.态度', safeStr(n.态度), 'textarea')+'</div></div>';
            }
        } else if (safeStr(n.态度)) {
            html += '<div class="sam-nd-quote">💬 '+esc(safeStr(n.态度))+'</div>';
        }
        // ⑤ 战斗属性条 (HP_MAX/EP_MAX/THP 任一>0 才显示; 编辑模式: HP/EP/THP 当前值可编辑, 上限只读)
        if (editMode || hpmax > 0 || epmax > 0 || thp > 0) {
            html += '<div class="sam-nd-sec-lbl">⚔ 战斗属性</div><div class="sam-nd-bars">';
            if (editMode) {
                // 编辑模式: 直接用编辑行(标签+当前值编辑框+只读上限), 不再重复渲染只读进度条
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
        // ⑤ 最终属性 (仅非零项, 排除武器对象) + 武器攻击(并入最终属性, ATK/MATK分两排)
        // 固定顺序: 五维 → 力量修正等(修正) → DEF/MDEF/AP → 武器 → 减伤率 → 检定
        var ATTR_ORDER = [
            '力量','敏捷','体质','精神','魅力',
            '力量修正','敏捷修正','体质修正','精神修正','魅力修正',
            'DEF','MDEF','AP',
            '物理减伤率','魔法减伤率',
            '先攻DC','防御DC'
        ];
        var attrKeys = ATTR_ORDER.filter(function(k){
            return Object.prototype.hasOwnProperty.call(attrs, k) && k !== '武器' && safeNum(attrs[k],0) !== 0;
        });
        // 兜底: ATTR_ORDER 之外的非0非武器键(防漏新字段)
        Object.keys(attrs).forEach(function(k){
            if (k === '武器' || ATTR_ORDER.indexOf(k) >= 0) return;
            if (safeNum(attrs[k],0) !== 0 && attrKeys.indexOf(k) < 0) attrKeys.push(k);
        });
        var wpn = attrs.武器;
        var wpnKeys = (wpn && typeof wpn === 'object') ? Object.keys(wpn) : [];
        if (attrKeys.length || wpnKeys.length) {
            html += '<div class="sam-nd-sec-lbl">📊 最终属性</div>';
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
                    html += '<div class="sam-nd-wpn-row'+(isBase?' base':'')+'"><div class="nm">'+(isBase?'无武装':'⚔ '+esc(name))+'</div><div class="atk">ATK (物攻) <b>'+safeNum(w.ATK,0)+'</b></div><div class="matk">MATK (术攻) <b>'+safeNum(w.MATK,0)+'</b></div></div>';
                });
                html += '</div>';
            }
        }
        // ⑥ 人物档案 (外貌/着装/性格/喜爱/背景故事, 仅有值时; 编辑模式→可编辑文本块, 恒渲染)
        var profile = '';
        var profileFields = ['外貌','着装','性格','喜爱','背景故事'];
        if (editMode) {
            profileFields.forEach(function(f) {
                var p = npcPath + '.' + f;
                var v = safeStr(n[f]);
                if (isReadonlyPath(p)) return;
                profile += '<div class="sam-nd-block"><div class="sam-nd-block-lbl">'+esc(f)+'</div><div class="sam-nd-block-ct">'+editInput(p, v, 'textarea')+'</div></div>';
            });
        } else {
            if (safeStr(n.外貌)) profile += ndBlock('外貌', n.外貌);
            if (safeStr(n.着装)) profile += ndBlock('着装', n.着装);
            if (safeStr(n.性格)) profile += ndBlock('性格', n.性格);
            if (safeStr(n.喜爱)) profile += ndBlock('喜爱', n.喜爱);
            if (safeStr(n.背景故事)) profile += ndBlock('背景故事', n.背景故事);
        }
        if (profile) html += '<details class="sam-nd-sub" '+(editMode?'open':'')+'><summary>👤 人物档案</summary><div class="sam-nd-sub-body">'+profile+'</div></details>';
        // ⑨ 子系统 (装备/技能/血统/形态库/状态, 仅非空时才折叠显示)
        var subs = [{k:'状态',d:n.状态},{k:'血统',d:n.血统},{k:'形态库',d:n.形态库},{k:'技能',d:n.技能},{k:'装备',d:n.装备},{k:'道具',d:n.道具}];
        subs.forEach(function(s) {
            var d = s.d || {};
            var ks = Object.keys(d);
            // ★ 编辑模式: 子系统(状态/血统/技能/装备/形态库/道具)内所有条目递归就地编辑
            if (editMode && ks.length > 0 && !isReadonlyPath(npcPath+'.'+s.k)) {
                var subEdHtml = renderDetailNode(d, ['隐藏真相','真实内幕','真属性'], [s.k], true, npcPath+'.'+s.k);
                html += '<details class="sam-nd-sub" open><summary>✎ '+esc(s.k)+' ('+ks.length+')</summary><div class="sam-nd-sub-body">'+subEdHtml+'</div></details>';
                return;
            }
            if (ks.length === 0) return;
            var subHtml = renderDetailNode(d, ['隐藏真相','真实内幕','真属性'], [s.k]);
            html += '<details class="sam-nd-sub"><summary>'+esc(s.k)+' ('+ks.length+')</summary><div class="sam-nd-sub-body">'+subHtml+'</div></details>';
        });
        return html;
    }
    function ndRow(k, v) {
        return '<div class="sam-nd-row"><span class="k">'+esc(k)+'</span><span class="v">'+esc(safeStr(v))+'</span></div>';
    }
    /* NPC档案编辑行: vHtml 为已构造的值单元格(含 editInput 控件), 不再二次转义 */
    function ndEditRow(k, vHtml) {
        return '<div class="sam-nd-row"><span class="k">'+esc(k)+'</span>'+vHtml+'</div>';
    }
    /* NPC战斗属性编辑行: 标签 + 当前值编辑框 + (可选)只读上限; max=null 时不显示上限(如 THP) */
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
    /* 精美递归渲染: 标量分短值(网格行)/长文本(块); 子对象/数组用可伸缩details; 字符串数组用tag chips */
    var DETAIL_LONG_FIELDS = ['描述','外貌','着装','性格','喜爱','态度','背景故事','内容','状态','效果','摘要','真实内幕','隐藏真相'];
    function isLongField(k, v) {
        if (DETAIL_LONG_FIELDS.indexOf(k) >= 0) return true;
        if (typeof v === 'string' && v.length > 30) return true;
        return false;
    }
    /* 枚举翻译表(装备类型/装备状态/技能类型) */
    var EQUIP_TYPE_MAP = ['武器','手部','头部','胸部','腿部','鞋子','披风','饰品','世界遗物'];
    var EQUIP_STATUS_MAP = ['未装备','已装备','仓库'];
    var SKILL_TYPE_MAP = ['主动','被动','特殊'];
    // 父级容器键 -> 判定枚举字段
    var ENUM_PARENTS = { 装备: { 类型: EQUIP_TYPE_MAP, 状态: EQUIP_STATUS_MAP }, 道具: { 状态: EQUIP_STATUS_MAP }, 技能: { 类型: SKILL_TYPE_MAP }, 形态: { 状态: EQUIP_STATUS_MAP } };
    function translateEnum(field, value, ancestors) {
        if (!ancestors || ancestors.length < 2) return null;
        // ancestors: [..., 容器键(装备/技能/道具/形态), 条目名, field]
        // 找到最近的容器键
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
    /* 统一判定"消耗"是否为空/无, 应隐藏不渲染
       覆盖: undefined/null/''/'无'/'0'/0/'0MP'/'0EP'/'0回合'/'无消耗'/'0 EP' 等一切等价于无消耗的形式 */
    function isCostEmpty(c) {
        if (c == null) return true;
        if (typeof c === 'number') return c === 0;
        if (typeof c !== 'string') return false;
        var s = String(c).trim();
        if (s === '') return true;
        if (s === '无' || s === '无消耗' || s === '消耗无' || s === '无消耗。' || s === '无。') return true;
        // 纯数字 0 / 形如 "0"、"0.0"
        if (/^[0-9.]+$/.test(s)) return parseFloat(s) === 0 || isNaN(parseFloat(s));
        // 形如 "0MP"、"0 EP"、"0EP"、"0 回合"、"0点"… 消耗数量为0
        if (/^0(\s|点)?(MP|EP|HP|SP|回合|点|怒气|能量|p|P)?$/.test(s)) return true;
        return false;
    }
    /* ★ 通用递归详情渲染(世界条目/NPC子系统等): editMode+basePath 时标量/标签/数值网格就地编辑
       - basePath 为 MVU 完整路径前缀(如 关系列表.李三.技能), 递归逐层拼接
       - 受 isReadonlyPath 保护; 真属性/隐藏真相等 hidden 字段不渲染更不可编辑 */
    function renderDetailNode(node, hidden, ancestors, editMode, basePath) {
        ancestors = ancestors || [];
        var ed = !!(editMode && basePath);
        var selfPath = ed ? basePath : '';
        if (node == null) return '<div class="sam-empty">无</div>';
        if (typeof node !== 'object') {
            return '<div class="sam-d-block"><div class="sam-d-content">'+esc(fmtScalar(node, ancestors))+'</div></div>';
        }
        if (Array.isArray(node)) {
            if (node.length === 0) return '<div class="sam-empty">无</div>';
            return renderDetailArray(node, hidden, ancestors, editMode, basePath);
        }
        var keys = Object.keys(node);
        if (keys.length === 0) return '<div class="sam-empty">无</div>';
        // 分三类: 短标量/长文本/对象数组
        var shortRows = '', longBlocks = '', subBlocks = '';
        // 当前节点是否为纯数值对象(如 原始属性 {力量:0, ATK:5}): 值为0的项统一隐藏
        var nodeIsNumObj = isNumObj(node);
        keys.forEach(function(k) {
            if (hidden && hidden.indexOf(k) >= 0) return;
            var v = node[k];
            if (v == null) return;
            if (v === '' && !ed) return; // ★ 编辑模式保留空字符串字段(可填入内容), 只读态隐藏
            // ★ 消耗字段: 无/0/0MP 等"等价于无消耗"的形式统一隐藏
            if (k === '消耗' && isCostEmpty(v)) return;
            // 身份数组: 过滤仅AI可见的关键词(守护者/篡夺者/织梦者/残魂/穿越者)
            if (k === '身份' && Array.isArray(v)) {
                // 小队成员或好感度>60时不隐藏阵营身份
                var _showAllId = (node.是否队友 === true) || (safeNum(node.好感度,0) > 60);
                if (!_showAllId) v = filterHiddenIdentity(v);
                if (v.length === 0) return;
            }
            var childAnc = ancestors.concat([k]);
            var childPath = ed ? (selfPath + '.' + k) : '';
            // 原始属性是血统/装备/形态/状态等条目的基准值，只展示、不允许在编辑模式改写。
            // 递归调用也使用 childEditMode，保证品质字母属性和数值属性均不会漏出编辑框。
            var childEditMode = ed && k !== '原始属性';
            if (ed && isReadonlyPath(childPath)) {
                // 只读路径: 仍渲染(只读态), 但不进入编辑
            } else if (typeof v === 'object') {
                // 对象/数组 -> 可伸缩
                if (Array.isArray(v)) {
                    if (v.length === 0) {
                        // 空数组: 跳过, 不渲染空折叠栏
                    } else if (isStringArray(v)) {
                        // 纯字符串数组 -> tag chips, 不折叠(编辑态渲染 tags 编辑器)
                        subBlocks += detailTagBlock(k, v, childAnc, childEditMode, childPath);
                    } else {
                        subBlocks += detailSub(k, renderDetailArray(v, hidden, childAnc, childEditMode, childPath), v.length <= 2);
                    }
                } else if (Object.keys(v).length === 0) {
                    // 空对象(如原始属性/效果为{}): 跳过, 不渲染空折叠栏
                } else if (isNumObj(v)) {
                    // 纯数值属性对象(原始属性等): 原始属性固定只读，其余编辑态全量+就地编辑
                    var gridHtml = formatStatGrid(v, 6, childEditMode, childPath);
                    if (gridHtml) subBlocks += detailSub(k, '<div class="sam-d-sub-body">'+gridHtml+'</div>', false);
                } else {
                    var childHtml = renderDetailNode(v, hidden, childAnc, childEditMode, childPath);
                    // 子节点过滤后可能为空(如原始属性全0), 不渲染空折叠栏
                    if (childHtml && childHtml.trim() && !/class="sam-empty"/.test(childHtml)) {
                        subBlocks += detailSub(k, '<div class="sam-d-sub-body">'+childHtml+'</div>', Object.keys(v).length <= 2 || ed);
                    }
                }
            } else {
                // 标量: 纯数值对象内的0值跳过; 枚举字段(类型/状态=0)保留翻译显示
                // ★ 编辑模式不做0值过滤(否则0值字段不渲染, 无法编辑修改)
                if (!ed) {
                    if (nodeIsNumObj && safeNum(v, 0) === 0) return;
                    if (!nodeIsNumObj && safeNum(v, NaN) === 0 && (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(String(v).trim())))) {
                        // 非数值对象中的数值0: 枚举字段(装备类型0=武器/状态0=未装备)保留, 其他属性加成类0隐藏
                        var isEnumField = false;
                        for (var ei = ancestors.length - 1; ei >= 0; ei--) {
                            if (ENUM_PARENTS[ancestors[ei]] && ENUM_PARENTS[ancestors[ei]][k]) { isEnumField = true; break; }
                        }
                        // 当前节点自身作为容器时也查 ENUM_PARENTS
                        if (!isEnumField && ENUM_PARENTS[ancestors[ancestors.length - 1]] && ENUM_PARENTS[ancestors[ancestors.length - 1]][k]) isEnumField = true;
                        // 直接挂在装备/道具/技能条目下: ancestors 末段是条目名, 再前是容器
                        if (!isEnumField && ancestors.length >= 2) {
                            var contKey = ancestors[ancestors.length - 2];
                            if (ENUM_PARENTS[contKey] && ENUM_PARENTS[contKey][k]) isEnumField = true;
                        }
                        if (!isEnumField && k !== '好感度' && k !== '数量') return;
                    }
                }
                // ★ 编辑模式: 标量就地编辑(布尔→开关, 长文本→textarea, 数值→number, 其他→text)
                if (childEditMode) {
                    if (typeof v === 'boolean') {
                        // 布尔字段用开关(直接暂存true/false, 避免文本写回破坏类型)
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
        // 标量数组: tag chips(编辑态: 纯字符串→tags编辑器; 含数字/布尔→JSON编辑器保持元素类型)
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
        // ★ 编辑模式: 对象数组整体用 JSON 编辑器(逐元素无法构造稳定MVU路径, 避免互相覆盖)
        if (editMode && basePath) {
            var jsonStr = '';
            try { jsonStr = JSON.stringify(arr, null, 1); } catch(e2) { jsonStr = ''; }
            return '<div class="sam-d-block"><div class="sam-d-label">'+esc(ancestors[ancestors.length-1]||'数组')+'</div><div class="sam-d-content">'+editInput(basePath, jsonStr, 'json')+'</div></div>';
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
            // 纯字符串数组→tags编辑器; 含数字/布尔的标量数组→JSON编辑器(拆分写回会破坏元素类型)
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
    /* 标量格式化: 布尔→是/否; 枚举字段(装备类型/状态/技能类型)→翻译; 其他→字符串 */
    function fmtScalar(v, ancestors) {
        if (v === true) return '是';
        if (v === false) return '否';
        if (ancestors && ancestors.length) {
            var field = ancestors[ancestors.length - 1];
            var tr = translateEnum(field, v, ancestors);
            if (tr != null) return tr;
        }
        return safeStr(v);
    }

    /* ===== 32. 编辑器组件 ===== */
    /* ★ 职业记录渲染助手: 职业 已从字符串数组改为 {职业名:{类型,品质,特性[],来源}} 记录对象 */
    // 取职业名列表(兼容旧字符串数组/标量回退)
    function occupationNames(occ) {
        if (!occ) return [];
        if (Array.isArray(occ)) return occ.map(function(s){return safeStr(s);}).filter(Boolean);
        if (typeof occ === 'string') return [occ];
        if (typeof occ === 'object') return Object.keys(occ).filter(function(k){return k && String(k).trim();});
        return [];
    }
    // 紧凑内联(每个职业名+类型小徽章)，用于 NPC 卡片/行内简要展示
    function occupationInlineHtml(occ) {
        var names = occupationNames(occ);
        if (names.length === 0) return '';
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        var html = '<span class="sam-occ-inline">';
        names.forEach(function(nm) {
            var e = (rec && rec[nm]) ? rec[nm] : {};
            var t = safeStr(e.类型) || '辅助';
            if (['战斗','生活','辅助'].indexOf(t) < 0) t = '辅助';
            html += '<span class="sam-occ-chip">'+esc(nm)+'<span class="sam-occ-sumtype '+esc(t)+'">'+esc(t)+'</span></span>';
        });
        html += '</span>';
        return html;
    }
    // 折叠面板: summary(标题+数量+各职业名/类型速览) → 展开后逐职业卡片(名+类型徽章+特性chips+来源)，用于角色信息面板/NPC详情面板
    function occupationCardsHtml(occ) {
        var names = occupationNames(occ);
        if (names.length === 0) return '';
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        function typeOf(e) { var t = safeStr(e.类型) || '辅助'; return (['战斗','生活','辅助'].indexOf(t) < 0) ? '辅助' : t; }
        // summary 行: 职业名 + 类型小品徽
        var sumRow = '';
        names.forEach(function(nm) {
            var e = (rec && rec[nm]) ? rec[nm] : {};
            sumRow += '<span class="sam-occ-sumname">'+esc(nm)+'<span class="sam-occ-sumtype '+esc(typeOf(e))+'">'+esc(typeOf(e))+'</span></span>';
        });
        var html = '<details class="sam-occ-panel" open>'
            + '<summary class="sam-occ-summary">'
              + '<span class="sam-occ-sumtitle">🎖 职业</span>'
              + '<span class="sam-occ-sumcount">'+names.length+'</span>'
              + '<span class="sam-occ-sumrow">'+sumRow+'</span>'
            + '</summary>'
            + '<div class="sam-occ-body">';
        names.forEach(function(nm) {
            var entry = (rec && rec[nm]) ? rec[nm] : {};
            var type = typeOf(entry);
            var tags = Array.isArray(entry.特性) ? entry.特性 : [];
            var src = safeStr(entry.来源) || '';
            html += '<div class="sam-occ-card">'
                + '<div class="sam-occ-head"><span class="sam-occ-name">'+esc(nm)+'</span>'
                + '<span class="sam-occ-type '+esc(type)+'">'+esc(type)+'</span></div>';
            if (tags.length) {
                html += '<div class="sam-occ-tags">';
                tags.forEach(function(t) { html += '<span class="sam-occ-tag">'+esc(safeStr(t))+'</span>'; });
                html += '</div>';
            }
            if (src) html += '<div class="sam-occ-src">📍 来源: '+esc(src)+'</div>';
            html += '</div>';
        });
        html += '</div></details>';
        return html;
    }
    // 单行文本摘要(供商城AI上下文使用): "职业名[类型] 特性1/特性2 来源:xxx"
    function occupationSummaryText(occ) {
        var names = occupationNames(occ);
        if (names.length === 0) return '';
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        return names.map(function(nm) {
            var entry = (rec && rec[nm]) ? rec[nm] : {};
            var type = safeStr(entry.类型) || '辅助';
            var tags = Array.isArray(entry.特性) ? entry.特性 : [];
            var src = safeStr(entry.来源) || '';
            var parts = [nm + '[' + type + ']'];
            if (tags.length) parts.push(tags.join('/'));
            if (src) parts.push('来源:' + src);
            return parts.join(' ');
        }).join(', ');
    }
    /* ★ 职业结构化编辑器(编辑模式): 逐职业卡片(职业名/类型下拉/特性逗号输入/来源输入)+删除按钮+"添加职业"按钮
       整个对象作为一个快照暂存到 pendingEdits[path]; 输入失焦/变更→occReassemble 重组并暂存; 删除/添加→改DOM后重组.
       data-occ-field 取值: key(职业名)/类型/特性/来源 */
    function occupationEditHtml(occ, basePath) {
        var names = occupationNames(occ);
        var rec = (occ && typeof occ === 'object' && !Array.isArray(occ)) ? occ : null;
        var html = '<div class="sam-occ-edit" data-occ-path="'+esc(basePath)+'">';
        names.forEach(function(nm) {
            var e = (rec && rec[nm]) ? rec[nm] : {};
            var type = safeStr(e.类型) || '辅助';
            if (['战斗','生活','辅助'].indexOf(type) < 0) type = '辅助';
            var tags = Array.isArray(e.特性) ? e.特性 : [];
            var src = safeStr(e.来源) || '';
            html += occupationEditCardHtml(nm, type, tags, src);
        });
        html += '</div>';
        html += '<button type="button" class="sam-occ-add-btn" data-occ-path="'+esc(basePath)+'">+ 添加职业</button>';
        return html;
    }
    // 单张职业编辑卡片(供 occupationEditHtml 与"添加"按钮复用)
    function occupationEditCardHtml(name, type, tags, src) {
        type = type || '辅助';
        if (['战斗','生活','辅助'].indexOf(type) < 0) type = '辅助';
        var tagsStr = Array.isArray(tags) ? tags.join(',') : safeStr(tags);
        var nameVal = (name === undefined || name === null) ? '' : String(name);
        // 类型下拉选项
        var typeOpts = ['战斗','生活','辅助'].map(function(t) {
            return '<option value="'+esc(t)+'"'+(t === type ? ' selected' : '')+'>'+esc(t)+'</option>';
        }).join('');
        // 用 sam-occ-field 类(非 sam-edit-input/sam-edit-active), 避免 flushStagedDisplay/saveEdits 默认走"点击即编辑"逻辑
        return '<div class="sam-occ-edit-card" data-occ-key="'+esc(nameVal)+'">'
            + '<div class="sam-occ-edit-head">'
              + '<input class="sam-occ-field sam-occ-edit-name" data-occ-field="key" type="text" value="'+esc(nameVal)+'" placeholder="职业名" />'
              + '<select class="sam-occ-field sam-occ-edit-type" data-occ-field="类型">'+typeOpts+'</select>'
              + '<button type="button" class="sam-occ-del-btn" title="删除该职业">✕</button>'
            + '</div>'
            + '<div class="sam-occ-edit-row"><span class="k">特性</span>'
              + '<input class="sam-occ-field sam-occ-edit-tags" data-occ-field="特性" type="text" value="'+esc(tagsStr)+'" placeholder="逗号分隔, 如: 剑术,格挡" /></div>'
            + '<div class="sam-occ-edit-row"><span class="k">来源</span>'
              + '<input class="sam-occ-field sam-occ-edit-src" data-occ-field="来源" type="text" value="'+esc(src)+'" placeholder="来源(可选)" /></div>'
            + '</div>';
    }
    /* 职业编辑器: 重组当前容器的所有卡片为对象并暂存到 pendingEdits[path] */
    function occReassemble($container) {
        if (!$container || !$container.length) return;
        var path = $container.attr('data-occ-path');
        if (!path) return;
        var out = {};
        var usedKeys = {};
        $container.find('.sam-occ-edit-card').each(function(idx) {
            var $c = $(this);
            var name = String($c.find('[data-occ-field="key"]').val() || '').trim();
            var type = String($c.find('[data-occ-field="类型"]').val() || '辅助');
            if (['战斗','生活','辅助'].indexOf(type) < 0) type = '辅助';
            var tagsStr = String($c.find('[data-occ-field="特性"]').val() || '');
            var tags = tagsStr.split(/[\/,，]/).map(function(s){return String(s).trim();}).filter(Boolean);
            var src = String($c.find('[data-occ-field="来源"]').val() || '').trim();
            // 职业名为空 → 用占位键 "新职业<i>" 避免覆盖, 保存时ZOD会校验
            var key = name || ('新职业' + (idx + 1));
            // 键去重: 重名则追加序号
            var k = key, n = 2;
            while (usedKeys[k]) { k = key + '_' + (n++); }
            usedKeys[k] = true;
            out[k] = { 类型: type, 特性: tags, 来源: src };
        });
        stageEdit(path, out, 'object');
    }
    /* 职业编辑器: 删除指定卡片后重组暂存 */
    function occEditDelete($card) {
        var $container = $card.closest('.sam-occ-edit');
        $card.remove();
        occReassemble($container);
    }
    /* 职业编辑器: 追加一张空卡片后重组暂存 */
    function occEditAdd($btn) {
        var path = $btn.attr('data-occ-path');
        // 用 filter 按属性匹配, 避免路径含选择器特殊字符
        var $container = $('.sam-occ-edit').filter(function(){ return $(this).attr('data-occ-path') === path; });
        if (!$container.length) return;
        $container.append(occupationEditCardHtml('', '辅助', [], ''));
        occReassemble($container);
    }
    /* 编辑模式不再直接渲染输入框; 改为"点击即编辑":
       editInput/editSelect 返回显示态HTML(文本+✎), 点击后由事件动态插入真实输入框, 失焦/回车暂存到 pendingEdits 并还原显示态. 这样不会让所有输入框同时撑开导致变形. */
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
    /* 效果对象分行渲染 {a:b,c:d} → 多行 */
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
                // 对象值(嵌套效果)用 json 编辑器, 标量用文本
                html += '<div class="sam-effect-line"><span class="ek">'+esc(k)+':</span> '+editInput(path+'.'+k, vs, isObj ? 'json' : 'text')+'</div>';
            } else {
                html += '<div class="sam-effect-line"><span class="ek">'+esc(k)+':</span> '+esc(vs)+'</div>';
            }
        });
        html += '</div>';
        return html;
    }
    /* 标签数组渲染 */
    function formatTags(tags, path, editMode) {
        if (!Array.isArray(tags)) tags = [];
        if (tags.length === 0 && !editMode) return '<span class="sam-empty" style="padding:2px 0;">无</span>';
        if (editMode && path) return editInput(path, tags.join(','), 'tags');
        var html = '<div class="sam-tags">';
        tags.forEach(function(t) { html += '<span class="sam-tag">'+esc(t)+'</span>'; });
        html += '</div>';
        return html;
    }
    /* 品质枚举（F~SSS），用于识别五维属性中的品质字母（成长/功法状态） */
    var STAT_QUALITY_SET = { 'F':1, 'E':1, 'D':1, 'C':1, 'B':1, 'A':1, 'S':1, 'SS':1, 'SSS':1 };
    function isStatQuality(v) {
        if (typeof v !== 'string') return false;
        return Object.prototype.hasOwnProperty.call(STAT_QUALITY_SET, v.toUpperCase().trim());
    }
    /* 属性值标准化: 品质字母(F~SSS)保留为字符串, 其余 parseFloat 为数字(非数字→0)
       用于解析商城/角色 原始属性 {力量:'B', ATK:5} 时兼容字母与数值混合写法 */
    function attrMapVal(raw) {
        if (raw == null) return 0;
        if (typeof raw === 'string' && STAT_QUALITY_SET.hasOwnProperty(raw.trim().toUpperCase())) {
            return raw.trim().toUpperCase();
        }
        var n = parseFloat(raw);
        return isFinite(n) ? n : 0;
    }
    /* 数值属性网格: 隐藏值为0的属性(装备/血统/形态/状态详情等共用; 装备仅写非0项)
       ★ 状态五维双修: 品质字母(如 力量:'B')原样显示, 数值(如 ATK:15 / 力量:-5)走原数值逻辑
       ★ editMode: 每格数值就地编辑(含0值全量渲染); path 为空时退化为只读网格 */
    function formatStatGrid(stats, cols, editMode, path) {
        if (!stats || typeof stats !== 'object') return '';
        var keys = Object.keys(stats);
        if (!editMode) {
            keys = keys.filter(function(k) {
                var v = stats[k];
                if (isStatQuality(v)) return true;          // 品质字母: 保留
                return safeNum(v, 0) !== 0;                  // 数值: 隐藏0
            });
        }
        if (keys.length === 0) return '';
        var html = '<div class="sam-stat-grid">';
        keys.forEach(function(k) {
            var v = stats[k];
            if (editMode && path && !isReadonlyPath(path+'.'+k)) {
                // 编辑模式: 品质字母用文本编辑, 数值用数字编辑
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
    /* 内联完整资料卡片(装备/道具/技能/血统/形态) */
    // 删除按钮HTML(编辑模式时显示, 挂在卡片头部右侧; 点击触发二级确认→写MVU删除)
    function samDelBtn(path, editMode, label) {
        if (!editMode) return '';
        return '<button type="button" class="sam-fc-del-btn" data-del-path="'+esc(path)+'" title="'+(label||'删除')+'">✕</button>';
    }
    function fullCard(q, title, rowsHtml, bodyHtml, headExtra) {
        // q 可为: 字符串(品质字母, 显示=着色) 或对象 {label:显示文本, cls:色阶字母}
        //   形态走层级(Ⅰ~Ⅸ): label=罗马数字(显示), cls=对应品质字母(着色 q-class)
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
    /* 全宽左对齐块: 标签在上, 内容独占整行(效果/描述等长文本用) */
    function fcBody(label, contentHtml, extraClass) {
        if (!contentHtml || !String(contentHtml).trim()) return '';
        return '<div class="sam-fc-block">'
            + '<div class="sam-fc-label">'+esc(label)+'</div>'
            + '<div class="sam-fc-content '+(extraClass||'')+'">'+contentHtml+'</div>'
            + '</div>';
    }
    /* 可伸缩全宽块: <details> 折叠(原始属性等大块用); 内容为空时不渲染(全0属性被过滤后) */
    function fcBodyCollapsible(label, contentHtml, extraClass, openByDefault) {
        if (!contentHtml || !String(contentHtml).trim()) return '';
        return '<details class="sam-fc-collapse '+(extraClass||'')+'" '+(openByDefault?'open':'')+'>'
            + '<summary class="sam-fc-collapse-sum">'+esc(label)+'</summary>'
            + '<div class="sam-fc-content '+(extraClass||'')+'">'+contentHtml+'</div>'
            + '</details>';
    }
    /* 栏目级可伸缩块: title(含emoji) + 内容; 默认展开 */
    function secBlock(title, contentHtml, openByDefault, headExtra) {
        return '<details class="sam-sec" '+(openByDefault === false ? '' : 'open')+'>'
            + '<summary class="sam-sec-sum"><span class="sam-sec-title">'+esc(title)+'</span>'+(headExtra||'')+'</summary>'
            + '<div class="sam-sec-body">'+(contentHtml||'')+'</div>'
            + '</details>';
    }

    /* ===== 32b. 删除NPC(写回MVU) ===== */
    function deleteNpc(name) {
        if (!name) return;
        var ok = writeBackMvu(function(statData) {
            if (statData && statData.关系列表 && statData.关系列表[name]) {
                delete statData.关系列表[name];
                try { console.log('%c[主神终端] ✅ NPC已删除: '+name, 'color:#86efac'); } catch(e){}
            }
        });
        if (ok) { try { closeModal(); } catch(e){} renderAll(); }
    }

    /* ===== 32b2. 删除世界条目(探索点/势力等, 写回MVU) =====
       fullKey: 完整路径如 "世界.探索.城镇废墟" / "世界.势力.黑鹰团"
       parentPath: 父对象路径如 "世界.探索" / "世界.势力"
       key: 末段名, 用于提示
    */
    function deleteWorldEntry(fullKey, parentPath, key) {
        if (!fullKey) return;
        var ok = writeBackMvu(function(statData) {
            // 通用按点路径删除: 沿路径走到最后第二段, 删末段
            var parts = fullKey.split('.');
            var obj = statData;
            for (var i = 0; i < parts.length - 1; i++) {
                if (!obj || typeof obj !== 'object') return;
                obj = obj[parts[i]];
            }
            if (obj && typeof obj === 'object' && obj.hasOwnProperty(parts[parts.length-1])) {
                delete obj[parts[parts.length-1]];
                try { console.log('%c[主神终端] ✅ 世界条目已删除: '+fullKey, 'color:#86efac'); } catch(e){}
            }
        });
        if (ok) { samToast('success', '已删除: ' + (key || fullKey)); renderAll(); }
        else samToast('error', '删除失败: MVU写回不可用');
    }

    /* ===== 32c. 装备/道具操作按钮(穿戴/脱下/存放/取回/删除) ===== */
    function actBtn(label, action, path, kind, type, key) {
        return '<button class="sam-act-btn" data-act="'+esc(action)+'" data-path="'+esc(path)+'" data-kind="'+esc(kind)+'" data-type="'+esc(String(type==null?'':type))+'" data-key="'+esc(key||'')+'">'+esc(label)+'</button>';
    }
    /* 装备操作按钮: 状态0(装备箱)=穿戴/存放/删除; 状态1(战术栏)=脱下/存放/删除; 状态2(仓库)=穿戴/取回/删除; 类型8(特殊)无按钮
       editMode 为 true 时才生成删除按钮(否则仅显示穿戴/脱下/存放/取回) */
    function equipActionButtons(path, status, type, editMode) {
        if (type === 8) return ''; // 特殊装备: 无限制也无按钮
        var key = path.split('.').pop();
        var delBtn = editMode ? actBtn('删除','delete',path,'equip',type,key) : '';
        if (status === 0) return actBtn('穿戴','wear',path,'equip',type,key)+actBtn('存放','store',path,'equip',type,key)+delBtn;
        if (status === 1) return actBtn('脱下','remove',path,'equip',type,key)+actBtn('存放','store',path,'equip',type,key)+delBtn;
        if (status === 2) return actBtn('穿戴','wear',path,'equip',type,key)+actBtn('取回','takeback',path,'equip',type,key)+delBtn;
        return '';
    }
    /* 道具操作按钮: 状态0(道具箱)=穿戴/存放/删除; 状态1(战术栏)=脱下/存放/删除; 状态2(仓库)=穿戴/取回/删除
       editMode 为 true 时才生成删除按钮 */
    function itemActionButtons(path, status, editMode) {
        var key = path.split('.').pop();
        var delBtn = editMode ? actBtn('删除','delete',path,'item','',key) : '';
        if (status === 0) return actBtn('穿戴','wear',path,'item','',key)+actBtn('存放','store',path,'item','',key)+delBtn;
        if (status === 1) return actBtn('脱下','remove',path,'item','',key)+actBtn('存放','store',path,'item','',key)+delBtn;
        if (status === 2) return actBtn('穿戴','wear',path,'item','',key)+actBtn('取回','takeback',path,'item','',key)+delBtn;
        return '';
    }
    function samToast(type, msg) {
        try {
            if (typeof toastr !== 'undefined' && toastr[type]) { toastr[type]('[主神终端] '+msg); return; }
        } catch(e){}
        try { console.log('%c[主神终端] '+msg, 'color:'+(type==='success'?'#86efac':type==='warning'?'#fbbf24':type==='error'?'#f87171':'#8b95a6')); } catch(e){}
    }
    /* ===== 32c2. 商城市场区: 归一化/解析/购物车/渲染/执行 =====
       移植自 打开商店代码.html, 删除同伴交易(空间币互转+多收件人分账),
       仅保留角色单人购物. 区域改为 装备|道具|技能|血统(4类).
       装备区遵循"左类型nav + 右物品list"布局; 其余区为单列list. */
    // ---- 字段归一化层(ES5改写) ----
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
    // 装备类型(数字0-8)→槽位label, 复用 EQUIP_SLOTS 映射表
    function shopEquipTypeLabel(typeNum) {
        var n = parseInt(typeNum, 10);
        if (isNaN(n)) return '装备';
        for (var i = 0; i < EQUIP_SLOTS.length; i++) {
            if (EQUIP_SLOTS[i].type === n) return EQUIP_SLOTS[i].label;
        }
        return '装备';
    }
    // 技能类型(数字0-2)→中文label: 0-主动 1-被动 2-特殊
    function shopSkillTypeLabel(typeNum) {
        var n = parseInt(typeNum, 10);
        if (n === 1) return '被动';
        if (n === 2) return '特殊';
        return '主动';
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
    // 兜底: 商城商品若标签中无来源关键词(主神/系统/手工), 强制注入"主神空间"标签
    // 原因: 商城在主神空间运行, 售出商品天然为合法资产; AI偶尔漏写来源标签时兜底, 保证享受免除自适应压缩
    var SHOP_SOURCE_KEYWORDS = ['主神', '系统', '手工'];
    function shopEnsureSourceTag(rawTags) {
        var arr = shopNormalizeTags(rawTags);
        var hasSource = arr.some(function(t) {
            return SHOP_SOURCE_KEYWORDS.some(function(kw) { return String(t).indexOf(kw) >= 0; });
        });
        if (!hasSource) arr.push('主神空间');
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
    // passive_stats 统一解析成 { hp_bonus, atk_bonus, ... }(支持结构化对象与字符串两种格式)
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
        var rawCat = shopPick(raw, '类型','category');
        // 保留原始数字(匹配角色侧 skill_item.类型: clampNum(0,0,2))
        var catNum = (typeof rawCat === 'number') ? rawCat
            : (typeof rawCat === 'string' && /^\d+$/.test(String(rawCat))) ? parseInt(String(rawCat), 10)
            : 0;
        var category = shopSkillTypeLabel(catNum);
        var item = {
            name:        shopPick(raw, 'name','名称','技能名','技能名称') || '未命名',
            level:       shopPickNum(raw, 'level','等级','数值等级'),
            rating:      shopPick(raw, 'rating','品级','品质','评级'),
            price:       parseInt(String(shopPick(raw, 'price','价格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            category_num: catNum,
            category:    category,                          // 类型label(主动/被动/特殊)
            cost:        shopPick(raw, '消耗','mp_cost','MP消耗','法力消耗','mp','MP'),  // 新结构: 字符串如 '8MP'
            effects:     shopPick(raw, '效果','effect','技能效果'),  // 新结构: 对象 {主动:'对单体造成3d6火焰伤害'}
            description: shopPick(raw, 'description','描述','技能描述','说明'),
            tags:        shopEnsureSourceTag(shopPick(raw, 'tags','标签'))
        };
        return item;
    }
    function shopNormalizeBloodline(raw) {
        var rawAttrs = shopPick(raw, '原始属性','基础属性','属性');  // 新结构: 对象 {力量:4, 体质:4}
        var rawEffects = shopPick(raw, '效果','特殊效果','特效');    // 新结构: 对象 {被动:'每回合回复5%HP'}
        var item = {
            name:       shopPick(raw, 'name','名称','血统名','血统名称') || '未命名',
            level:      shopPickNum(raw, 'level','等级','数值等级'),
            rating:     shopPick(raw, 'rating','品级','品质','评级'),
            price:      parseInt(String(shopPick(raw, 'price','价格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            raw_attrs:  rawAttrs,
            effects:    rawEffects,
            description: shopPick(raw, 'description','描述','血统描述','说明','效果'),
            tags:        shopEnsureSourceTag(shopPick(raw, 'tags','标签'))
        };
        return item;
    }
    // 形态列表归一化: 对齐角色侧 形态库 条目结构 {层级, 消耗, 状态, 标签, 原始属性, 效果, 技能, 描述}
    //   技能子列表规范化为与角色侧 skill_item 一致: {品质, 类型(0-2), 标签, 效果, 描述, 消耗}
    function shopNormalizeFormSkill(raw) {
        var rawType = shopPick(raw, '类型','type');
        var catNum = (typeof rawType === 'number') ? rawType
            : (typeof rawType === 'string' && /^\d+$/.test(String(rawType))) ? parseInt(String(rawType), 10) : 0;
        return {
            name:    shopPick(raw, 'name','名称','技能名','技能名称') || '',
            品质:    shopPick(raw, 'rating','品质','品级','评级') || '',
            类型:    catNum,
            标签:    shopEnsureSourceTag(shopPick(raw, 'tags','标签')),
            效果:    shopPick(raw, '效果','effect','技能效果') || {},
            描述:    shopPick(raw, 'description','描述','技能描述','说明') || '',
            消耗:    shopPick(raw, '消耗','mp_cost','MP消耗','法力消耗','mp','MP') || '无'
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
        // 层级字段已取代"品质"; 兼容AI仍输出 品质 字段兜底
        var tier = shopPick(raw, '层级','level','tier');
        if (tier == null || tier === '') tier = shopPick(raw, 'rating','品质','品级','评级') || '';
        // 归正为罗马数字(Ⅰ~Ⅸ); AI 可能输出品质字母(F~SSS) → 转对应罗马数字, 不入库原始字母
        if (tier !== '') tier = tierRomanOf(tier);
        return {
            name:          shopPick(raw, 'name','名称','形态名','形态名称') || '未命名',
            price:         parseInt(String(shopPick(raw, 'price','价格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            tier:          String(tier),
            cost:          shopPick(raw, '消耗','mp_cost','MP消耗','法力消耗','mp','MP') || '',
            status:        shopPick(raw, 'status','状态') || '完好',
            raw_attrs:     shopPick(raw, '原始属性','基础属性','属性') || {},
            effects:       shopPick(raw, '效果','特效','特殊效果') || {},
            skills:        skills,
            description:   shopPick(raw, 'description','描述','说明') || '',
            tags:          shopEnsureSourceTag(shopPick(raw, 'tags','标签'))
        };
    }
    // 升级列表归一化: 按所属大类(血统/技能/装备/形态)保留原始结构 + 替换目标
    function shopNormalizeUpgrade(raw) {
        var rawType = shopPick(raw, '类型','type');
        var typeNum = (typeof rawType === 'number') ? rawType
            : (typeof rawType === 'string' && /^\d+$/.test(String(rawType))) ? parseInt(String(rawType), 10) : 0;
        var rawCat = shopPick(raw, '所属大类','category') || '';
        // 形态升级: 层级(罗马数字) 取代 品质 字母, 用于卡片右上角与入库
        var formTier = (rawCat === '形态') ? tierRomanOf(shopPick(raw, '层级','level','tier','rating','品质','品级','评级') || 'Ⅰ') : '';
        // 形态升级: 归一化 技能 子数组 + 状态 字段(供 shopBuildUpgradeCard 渲染技能块, shopToFormVar 入库)
        var formSkills = [], formStatus = '完好';
        if (rawCat === '形态') {
            formStatus = shopPick(raw, 'status','状态') || '完好';
            var rawSkills = shopPick(raw, '技能','skills');
            if (Array.isArray(rawSkills)) {
                for (var si = 0; si < rawSkills.length; si++) {
                    if (rawSkills[si] && typeof rawSkills[si] === 'object') formSkills.push(shopNormalizeFormSkill(rawSkills[si]));
                }
            }
        }
        return {
            name:           shopPick(raw, 'name','名称') || '未命名',
            level:          shopPickNum(raw, 'level','等级','数值等级'),
            rating:         shopPick(raw, 'rating','品级','品质','评级'),
            tier:           formTier,
            category:       rawCat,
            price:          parseInt(String(shopPick(raw, 'price','价格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            replace_target: shopPick(raw, 'replace_target','替换目标') || '',
            category_num:   typeNum,
            slot_type:      shopEquipTypeLabel(typeNum),
            slot_type_num:  typeNum,
            cost:           shopPick(raw, '消耗','mp_cost','MP消耗','法力消耗','mp','MP') || '',
            raw_attrs:      shopPick(raw, '原始属性','基础属性','属性'),
            effects:        shopPick(raw, '效果','特效','特殊效果'),
            description:    shopPick(raw, 'description','描述','说明'),
            '描述':         shopPick(raw, 'description','描述','说明'),
            tags:           shopEnsureSourceTag(shopPick(raw, 'tags','标签')),
            skills:         formSkills,
            status:         formStatus
        };
    }
    function shopNormalizeEquip(raw) {
        var rawType = shopPick(raw, '类型','type','槽位','部位','slot_type');
        // 保留原始数字(匹配角色侧 equip_item.类型: clampNum(0,0,8))
        var typeNum = (typeof rawType === 'number') ? rawType
            : (typeof rawType === 'string' && /^\d+$/.test(String(rawType))) ? parseInt(String(rawType), 10)
            : 0;
        var slotType = shopEquipTypeLabel(typeNum);
        var item = {
            name:      shopPick(raw, 'name','名称','装备名','装备名称') || '未命名',
            level:     shopPickNum(raw, 'level','等级','数值等级'),
            rating:    shopPick(raw, 'rating','品级','品质','评级'),
            price:     parseInt(String(shopPick(raw, 'price','价格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            slot_type: slotType,
            slot_type_num: typeNum,
            raw_attrs: shopPick(raw, '原始属性','基础属性','属性'),  // 新结构: 对象 {力量:1, 体质:2}
            effects:   shopPick(raw, '效果','特效','special_effect','特殊效果','特性'),  // 新结构: 对象 {被动:'物理防御+3'}
            cost:      shopPick(raw, '消耗','mp_cost','MP消耗','法力消耗','mp','MP') || '',
            '描述':    shopPick(raw, '描述','description','说明'),
            tags:      shopEnsureSourceTag(shopPick(raw, 'tags','标签'))
        };
        return item;
    }
    function shopNormalizeConsume(raw) {
        return {
            name:            shopPick(raw, 'name','名称','道具名','物品名') || '未命名',
            level:           shopPickNum(raw, 'level','等级','数值等级'),
            rating:          shopPick(raw, 'rating','品级','品质','评级'),
            price:           parseInt(String(shopPick(raw, 'price','价格','售价','价钱') || '0').replace(/[^0-9]/g,''), 10) || 0,
            consumable_type: shopPick(raw, 'consumable_type','类型','道具类型','分类') || '道具',
            charges:         shopPickNum(raw, 'charges','数量','次数','使用次数'),
            effects:         shopPick(raw, '效果','usage','使用效果'),  // 新结构: 对象 {使用:'恢复2d4+2HP'}
            description:     shopPick(raw, 'description','描述','说明'),
            tags:            shopEnsureSourceTag(shopPick(raw, 'tags','标签'))
        };
    }
    // 标准化整个商城数据: 产出 { 装备区:{typeLabel:[...]}, 技能区:{typeLabel:[...]}, 道具区:{typeLabel:[...]}, 血统区:[] }
    // 新结构: 商城.装备列表/技能列表/血统列表/道具列表 均为扁平数组
    // 装备/技能/道具按「类型」分组到子对象, 供左nav按类型切换; 血统为纯数组
    function shopNormalizeMarketData(raw) {
        var out = { 装备区:{}, 道具区:{}, 技能区:{}, 血统区:[], 升级区:[], 形态区:[] };
        if (!raw || typeof raw !== 'object') return out;
        // 装备列表(扁平数组) → 按 类型(数字0-8) 分组到 {槽位label: [...]}
        var equips = raw['装备列表'];
        if (Array.isArray(equips)) {
            for (var i = 0; i < equips.length; i++) {
                if (!equips[i] || typeof equips[i] !== 'object') continue;
                var e = shopNormalizeEquip(equips[i]);
                var sl = e.slot_type || '装备';
                if (!out.装备区[sl]) out.装备区[sl] = [];
                out.装备区[sl].push(e);
            }
        }
        // 技能列表(扁平数组) → 按 类型(数字0-2) 分组到 {类型label: [...]}
        var skills = raw['技能列表'];
        if (Array.isArray(skills)) {
            for (var j = 0; j < skills.length; j++) {
                if (!skills[j] || typeof skills[j] !== 'object') continue;
                var s = shopNormalizeSkill(skills[j]);
                var sc = s.category || '主动';
                if (!out.技能区[sc]) out.技能区[sc] = [];
                out.技能区[sc].push(s);
            }
        }
        // 道具列表(扁平数组) → 按 类型(字符串, 如恢复/战术/特殊) 分组到 {类型label: [...]}
        var consumables = raw['道具列表'];
        if (Array.isArray(consumables)) {
            for (var ci = 0; ci < consumables.length; ci++) {
                if (!consumables[ci] || typeof consumables[ci] !== 'object') continue;
                var c = shopNormalizeConsume(consumables[ci]);
                var ct = c.consumable_type || '道具';
                if (!out.道具区[ct]) out.道具区[ct] = [];
                out.道具区[ct].push(c);
            }
        }
        // 血统列表(扁平数组)
        var bloods = raw['血统列表'];
        if (Array.isArray(bloods)) {
            for (var bi = 0; bi < bloods.length; bi++) {
                if (bloods[bi] && typeof bloods[bi] === 'object') out.血统区.push(shopNormalizeBloodline(bloods[bi]));
            }
        }
        // 升级列表(扁平数组, 无子分组)
        var upgrades = raw['升级列表'];
        if (Array.isArray(upgrades)) {
            for (var ui = 0; ui < upgrades.length; ui++) {
                if (upgrades[ui] && typeof upgrades[ui] === 'object') out.升级区.push(shopNormalizeUpgrade(upgrades[ui]));
            }
        }
        // 形态列表(扁平数组, 无子分组)
        var forms = raw['形态列表'];
        if (Array.isArray(forms)) {
            for (var fi = 0; fi < forms.length; fi++) {
                if (forms[fi] && typeof forms[fi] === 'object') out.形态区.push(shopNormalizeForm(forms[fi]));
            }
        }
        return out;
    }
    // ---- 变量转换层: 标准化条目 → MVU变量格式 ----
    function shopParsePercent(value) {
        if (value === undefined || value === null) return 0;
        if (typeof value === 'number') return value;
        var text = String(value);
        return parseFloat(text) || 0;
    }
    // 转换归一化商品 → 角色侧变量(技能: 类型输出数字0-2匹配skill_item)
    function shopToSkillVar(item) {
        var out = {
            等级: item.level,
            品质: item.rating,
            类型: item.category_num != null ? item.category_num : 0,
            消耗: item.cost || '',
            效果: item.effects || {},
            描述: item.description || ''
        };
        if (item.tags && item.tags.length) out.标签 = item.tags;
        return out;
    }
    // 转换归一化商品 → 角色侧变量(血统: 原始属性/效果均为对象)
    function shopToBloodlineVar(item) {
        var out = {
            等级: item.level,
            品质: item.rating,
            原始属性: item.raw_attrs || {},
            效果: item.effects || {},
            描述: item.description || ''
        };
        if (item.tags && item.tags.length) out.标签 = item.tags;
        return out;
    }
    // 转换归一化商品 → 角色侧变量(装备: 类型输出数字0-8匹配equip_item, 状态默认未装备=0)
    function shopToEquipVar(item, slot) {
        var out = {
            类型: item.slot_type_num != null ? item.slot_type_num : 0,
            状态: 0,
            品质: item.rating,
            标签: (item.tags && item.tags.length) ? item.tags : [],
            原始属性: item.raw_attrs || {},
            效果: item.effects || {},
            描述: item['描述'] || '',
            消耗: item.cost || ''
        };
        return out;
    }
    // 转换归一化商品 → 角色侧变量(道具: 类型字符串, 数量合并, 效果对象)
    function shopToConsumeVar(item, qty) {
        var out = {
            品质: item.rating,
            类型: item.consumable_type || '道具',
            数量: qty,
            标签: (item.tags && item.tags.length) ? item.tags : [],
            效果: item.effects || {},
            描述: item.description || '',
            状态: 0
        };
        return out;
    }
    // 转换归一化商品 → 角色侧变量(形态: 对齐 形态库 条目结构, 键为形态名)
    //   结构 {层级, 消耗, 状态, 标签, 原始属性, 效果, 技能, 描述}; 冷却缺省由系统按1回合兜底
    function shopToFormVar(item, formName) {
        // 技能子列表按 skill_item 结构规整 {品质, 类型, 标签, 效果, 描述, 消耗}
        var skillsOut = {};
        var srcSkills = Array.isArray(item.skills) ? item.skills : [];
        for (var i = 0; i < srcSkills.length; i++) {
            var sk = srcSkills[i] || {};
            var skName = shopPick(sk, 'name','名称') || ('技能' + (i + 1));
            skillsOut[skName] = {
                品质: sk.品质 || '',
                类型: (sk.类型 != null) ? sk.类型 : 0,
                标签: (sk.标签 && sk.标签.length) ? sk.标签 : [],
                效果: sk.效果 || {},
                描述: sk.描述 || '',
                消耗: sk.消耗 || '无'
            };
        }
        return {
            层级:     (item.tier != null && item.tier !== '') ? tierRomanOf(item.tier) : '',
            消耗:     item.cost || '',
            状态:     item.status || '完好',
            标签:     (item.tags && item.tags.length) ? item.tags : [],
            原始属性: item.raw_attrs || {},
            效果:     item.effects || {},
            技能:     skillsOut,
            描述:     item.description || ''
        };
    }
    // 重算衍生属性(体力/精神 + 血统被动 + 已装备DEF/MDEF)
    function shopRecalcDerived(character) {
        if (!character) return;
        var base = character.基础属性 || {};
        var old = character.衍生属性 || {};
        var oldHpMax = Math.max(Number(old.HP上限 || old.HP || 1), 1);
        var oldMpMax = Math.max(Number(old.MP上限 || old.MP || 1), 1);
        var hpRatio = Math.min(1, Math.max(0, Number(old.HP || 0) / oldHpMax));
        var mpRatio = Math.min(1, Math.max(0, Number(old.MP || 0) / oldMpMax));
        var bonus = { HP加成:0, MP加成:0, ATK加成:0, DEF加成:0, 法术ATK加成:0, 法术强度加成:0, MDEF加成:0, 豁免加成:0 };
        var bloods = character.血统 || {};
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
        var eqs = character.装备 || {};
        for (var en in eqs) {
            if (!eqs.hasOwnProperty(en)) continue;
            var eq = eqs[en];
            if (!eq || eq.状态 !== '已装备') continue;
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
        derived.ATK = Math.floor(Number(base.力量 || 0) / 5) + bonus.ATK加成;
        derived.DEF = equipDef + bonus.DEF加成;
        derived.MDEF = equipMdef + bonus.MDEF加成;
        derived.法术ATK = Math.floor(Number(base.智力 || 0) / 5) + bonus.法术ATK加成;
        derived.法术强度 = shopParsePercent(bonus.法术强度加成) / 100;
        if (bonus.豁免加成) derived.豁免加成 = bonus.豁免加成;
        character.衍生属性 = derived;
    }
    // ---- 商城状态(模块级, 切聊天/重渲染时持久) ----
    var shopMarketData = null;     // 归一化后的市场数据(4区)
    var shopActiveTab = '';        // 当前区域: 装备|道具|技能|血统
    var shopActiveSlot = '';       // 当前装备区槽位
    var shopBloodCount = 0;        // 当前玩家已拥有血统数(用于商城血统区上限判定)
    var shopBloodLimit = 3;        // 血统数量上限(取自 共同.血统限制数)
    var shopCart = [];             // 购物车(角色单人, 每项 {item副本, _cat, _slot, quantity})
    var shopRefreshing = false;    // 刷新商品进行中(模块级标志, 切聊天/重渲染时持久, 避免按钮状态丢失)
    var shopRefreshEpoch = 0;      // 刷新回合计数: 每次 handleShopRefresh +1, 旧 Promise 回调回合不匹配时丢弃结果(支持"停止刷新"打断卡死请求)
    var shopReqText = '';          // 需求输入框内容(模块级, 跨刷新保留: 刷新后 renderAll 重建DOM, 用 value 属性回填使其不丢; 不满意可基于原需求继续刷)
    // ★ 多角色商城: 当前选中的购买对象。'角色' 为角色自身, 否则为 关系列表 中的 NPC 名字
    var shopCurrentActor = '角色';
    // 角色独有商城商品库的存储名称: 商城.成员商库 = { '<角色名键>': { 血统列表:[...], 技能列表:[...], 装备列表:[...], 道具列表:[...], 升级列表:[...] } }
    // '角色'键 对应角色自己的商城商品(与旧的 stat_data.商城 顶层结构兼容); NPC 键 对应该 NPC 的商城商品
    var SHOP_ACTOR_LIB_KEY = '成员商库';  // 商城下存放多角色商品库的子键名
    var SHOP_ACTOR_REINCARNATOR = '角色';          // 角色键名常量
    // ===== ★ 多角色商城: 角色切换与商品库隔离辅助 =====
    // 获取可选角色下拉项: 角色自己 + 关系列表中 在场=true 且 是否队友=true 的 NPC
    // 返回 [{name, label}], name='角色' 或 NPC名; label 用于下拉显示
    function shopBuildActorOptions(sd) {
        var list = [{ name: SHOP_ACTOR_REINCARNATOR, label: '角色(自身)' }];
        var relations = (sd && sd.关系列表) ? sd.关系列表 : null;
        if (relations && typeof relations === 'object') {
            var allNpc = Object.keys(relations);
            allNpc.sort();
            for (var i = 0; i < allNpc.length; i++) {
                var nm = allNpc[i];
                var npc = relations[nm];
                if (!npc || typeof npc !== 'object') continue;
                if (npc.在场 !== true) continue;
                if (npc.是否队友 !== true) continue;
                list.push({ name: nm, label: nm });
            }
        }
        return list;
    }
    // 解析当前角色对象 {character, path, isReincarnator, name}
    function shopResolveCharacter(sd, actorName) {
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        if (actorName === SHOP_ACTOR_REINCARNATOR) {
            return { character: (sd && sd.角色) || {}, path: '角色', isReincarnator: true, name: SHOP_ACTOR_REINCARNATOR };
        }
        var npc = (sd && sd.关系列表 && sd.关系列表[actorName]) ? sd.关系列表[actorName] : null;
        return { character: npc || {}, path: '关系列表.' + actorName, isReincarnator: false, name: actorName };
    }
// SHOP_PERMISSION_GUARD_START
var SHOP_PERMISSION_QUALITY_ORDER = ['F','E','D','C','B','A','S','SS','SSS'];
var SHOP_PERMISSION_TIER_ORDER = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'];
var SHOP_CREDENTIAL_SPEND_MIN_RANK = 3; // C级起才执行越阶购买/升级凭证消耗
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
    var tierRank = shopPermissionRank(character && character.层级);
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
    var name = item && item.name ? item.name : '该商品';
    if (!decision || decision.requiredRank < 0) return '商城权限校验失败: ' + name + ' 的品质/层级无效';
    return '权限不足: 当前商城上限为' + decision.capGrade + '级，' + name + '为' + decision.requiredGrade + '级';
}
/*
 * 商城凭证消耗：只负责“实际购买/升级”的资源成本，不改变既有商城可见权限。
 * - F~D级：永不因本规则消耗凭证。
 * - C级及以上：目标品质高于购买对象当前生命层级对应品质时，消耗目标品质凭证×1。
 * - 跨多级也只看最终目标品质；血统融合结果本身不经过此函数。
 */
function shopCredentialRequirement(character, item) {
    var actorRank = shopPermissionRank(character && character.层级);
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
    return list.map(function(x) { return x.grade + '级×' + x.need + '（持有' + x.have + '）'; }).join(' / ');
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
    // 校正 shopCurrentActor: 若当前选中的NPC不在候选列表里(已离场/非队友), 退回角色
    function shopEnsureActorValid(sd) {
        if (shopCurrentActor === SHOP_ACTOR_REINCARNATOR) return;
        var opts = shopBuildActorOptions(sd);
        var found = false;
        for (var i = 0; i < opts.length; i++) { if (opts[i].name === shopCurrentActor) { found = true; break; } }
        if (!found) shopCurrentActor = SHOP_ACTOR_REINCARNATOR;
    }
    // 取得当前角色对应的商品库对象(读写时直接深拷贝该对象的引用; 不存在则创建空结构)
    //★ 兼容升级: 角色读取商库时, 若 成员商库 不存在, 则沿用旧的 stat_data.商城 顶层结构(向后兼容)
    function shopGetActorLibRaw(rawMarket, actorName) {
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        if (!rawMarket) return null;
        var libMap = rawMarket[SHOP_ACTOR_LIB_KEY];
        if (libMap && typeof libMap === 'object' && libMap[actorName]) {
            return libMap[actorName];
        }
        if (actorName === SHOP_ACTOR_REINCARNATOR) {
            // 兼容旧数据: 顶层有 血统列表/技能列表... 则作为角色商库
            if (Array.isArray(rawMarket.血统列表) || Array.isArray(rawMarket.技能列表)
                || Array.isArray(rawMarket.装备列表) || Array.isArray(rawMarket.道具列表) || Array.isArray(rawMarket.升级列表) || Array.isArray(rawMarket.形态列表)) {
                return rawMarket;
            }
        }
        return null;
    }
    // 保存并恢复 .sam-shop-list 滚动位置(参考持有面板 renderAll 的 scrollTop 保持模式)
    // 原因: renderAll 重建面板后, 内部 .sam-shop-list(max-height:340px; overflow-y:auto)
    // 的 scrollTop 会归零, 导致点+/-按钮或选卡片时商品列表跳回顶部
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
    // 局部刷新商城市场区(tabs+content+footer), 不重建入口栏目的需求输入框, 避免AutoComplete绑定已移除输入框报错
    function shopRefreshMarket() {
        shopPreserveScroll(function() {
            var $market = $('#samsara-panel .sam-shop-market');
            if ($market.length) { var sd = getStatData(); var coin = sd && sd.角色 ? safeNum(sd.角色.空间币, 0) : 0; $market.html(shopRenderTabs() + shopRenderContent(coin) + shopRenderFooter(coin)); }
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
    // 剩余余额 = 原始余额 - 购物车已选合计(用于禁用判定/预检/购物车条展示)
    function shopRemain(coin) { return coin - shopCartCost(); }
    function shopIsSelected(name, cat, slot) {
        for (var i = 0; i < shopCart.length; i++) {
            if (shopCart[i].name !== name || shopCart[i]._cat !== cat) continue;
            // 道具区: 卡片按类型(恢复/战术/特殊)分组渲染(slot非空), 但数量控件写入购物车的 _slot 恒为空,
            // 若仍按 slot 精确匹配会导致"已选/已选×N"角标永远不显示(选中态丢失)。
            // 故道具区选中身份仅按 name+cat 判定(与 shopGetQty 一致), 忽略 slot。
            if (cat === '道具区') return true;
            if (shopCart[i]._slot === (slot||'')) return true;
        }
        return false;
    }
    // 读取道具区数量(用于回填输入框, 避免全量 renderAll 后归零)
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
            var permission = shopPermissionDecision(permissionCtx.character || {}, item, permissionSd.角色 && permissionSd.角色.权限凭证);
            if (!permission.allowed) { samToast('warning', shopPermissionMessage(permission, item)); return; }
            // ★ 血统区单选: 选中新血统前, 先剔除购物车里已有的其他血统条目(避免多血统混入),
            //   保证入口只有 1 条血统被选中, 后续 shopHandleExec 不必再额外收敛
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
            // 道具区已改为分组对象, 需遍历全部分组查找
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
    // ---- 渲染层 ----
    function shopRatingClass(r) {
        if (!r) return '';
        if (String(r).indexOf('SS') === 0) return 'r-SS';
        if (r === 'S') return 'r-S';
        return 'r-' + r;
    }
    function shopChip(label, value) {
        return '<span class="sam-shop-chip"><b>'+esc(label)+':</b> '+esc(value)+'</span>';
    }
    // 对象展开成 chip 列表(如 原始属性 {力量:1, 体质:2} → [力量:1][体质:2])
    function shopObjChips(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
        var html = '';
        for (var k in obj) {
            if (!obj.hasOwnProperty(k)) continue;
            var v = obj[k];
            if (v === undefined || v === null || v === '') continue;
            // 数值0不展示(装备/技能属性加成仅写非0项)
            if (typeof v === 'number' && v === 0) continue;
            if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && Number(v) === 0) continue;
            html += shopChip(k, v);
        }
        return html;
    }
    // 效果按独立卡片逐条展示；其他对象详情仍保留紧凑文本模式
    function shopObjDetails(label, obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
        var parts = [];
        for (var k2 in obj) {
            if (!obj.hasOwnProperty(k2)) continue;
            var v2 = obj[k2];
            if (v2 === undefined || v2 === null || v2 === '') continue;
            if (label === '效果') {
                parts.push('<div class="sam-shop-effect-card"><div class="sam-shop-effect-card-name">'+esc(k2)+'</div><div class="sam-shop-effect-card-text">'+esc(String(v2))+'</div></div>');
            } else {
                parts.push(esc(k2)+'：'+esc(String(v2)));
            }
        }
        if (!parts.length) return '';
        if (label === '效果') {
            return '<section class="sam-shop-section sam-shop-effects-block"><div class="sam-shop-section-title">效果</div><div class="sam-shop-effect-list">'+parts.join('')+'</div></section>';
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
                // 数值0不展示
                if (safeNum(stats[key], 0) === 0) continue;
                html += shopChip(SHOP_STAT_LABELS[key], shopSigned(stats[key]));
            }
        }
        return html;
    }
    function shopTagChips(tags) {
        if (!tags || !tags.length) return '';
        var html = '';
        for (var i = 0; i < tags.length; i++) html += shopChip('标签', tags[i]);
        return html;
    }
    function shopSpecialSummary(benefits, drawbacks) {
        var bt = (benefits && benefits.length) ? benefits.join('；') : '无';
        var dt = (drawbacks && drawbacks.length) ? drawbacks.join('；') : '无';
        return '增益：'+bt+'；副作用：'+dt;
    }
    function shopDetail(label, value) {
        if (value === undefined || value === null || value === '') return '';
        return '<div class="sam-shop-item-detail"><b>'+esc(label)+':</b> '+esc(String(value))+'</div>';
    }
    function shopAttrsBlock(attrs) {
        if (!attrs) return '';
        return '<section class="sam-shop-section sam-shop-basic-block"><div class="sam-shop-section-title">基础信息</div><div class="sam-shop-item-attrs">'+attrs+'</div></section>';
    }
    function shopDescription(value) {
        if (value === undefined || value === null || value === '') return '';
        return '<section class="sam-shop-section sam-shop-description-block"><div class="sam-shop-section-title">描述</div><div class="sam-shop-description-text">'+esc(String(value))+'</div></section>';
    }
    // 卡片头部(name + 品质徽章, 共同品质色)
    function shopCardHead(item, tier) {
        var qc = parseRarity(item.rating);
        var hasTier = (tier != null && tier !== '');
        // 有层级徽章时(形态商品/形态升级): 隐藏品质字母框, 由层级徽章替代(右上角唯一标识)
        var metaHtml = hasTier ? '' : '<div class="sam-shop-item-meta q-'+qc+'">'+esc(item.rating || '')+'</div>';
        // 层级徽章: 复用品质徽章样式(.sam-shop-item-meta + .q-{品质字母}), 仅显示罗马数字, 配同品质色调
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
        return '<div class="sam-shop-credential-cost" style="font-size:11px;line-height:1.35;color:var(--sam-warning);font-weight:700">所需凭证：'+esc(req.grade)+'级权限凭证 ×1</div>';
    }
    function shopCardFoot(item, isConsume) {
        var curQty = isConsume ? shopGetQty(item.name, '道具区') : 0;
        var qtyHtml = isConsume ? '<div class="sam-shop-qty">'
            + '<button type="button" class="sam-shop-qty-btn" data-shop-qty-btn="minus" data-name="'+esc(item.name)+'">−</button>'
            + '<input type="number" class="sam-shop-qty-inp" min="0" value="'+curQty+'" data-name="'+esc(item.name)+'">'
            + '<button type="button" class="sam-shop-qty-btn" data-shop-qty-btn="plus" data-name="'+esc(item.name)+'">+</button></div>' : '';
        var priceText = item.price ? item.price.toLocaleString() : '0';
        var costHtml = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0">'
            + '<div class="sam-shop-price">所需空间币：'+priceText+'</div>'
            + shopCredentialCostHtml(item)
            + '</div>';
        return '<div class="sam-shop-item-foot">'+costHtml+qtyHtml+'</div>';
    }
    // attrs: 仅保留 原始属性/消耗(技能)/标签; 类型与效果已在上方Tab条和details区展示, 不重复
    function shopBuildSkillCard(item) {
        var attrs = '';
        if (item.cost) attrs += shopChip('消耗', item.cost);
        attrs += shopObjChips(item.raw_attrs);    // 技能可能带原始属性加成
        attrs += shopTagChips(item.tags);
        var details = shopObjDetails('效果', item.effects) + shopDescription(item.description);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, false);
    }
    function shopBuildBloodlineCard(item) {
        var attrs = shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('效果', item.effects) + shopDescription(item.description);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, false);
    }
    function shopBuildEquipCard(item) {
        var attrs = '';
        if (item.cost) attrs += shopChip('消耗', item.cost);
        attrs += shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('效果', item.effects) + shopDescription(item['描述']);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, false);
    }
    function shopBuildUpgradeCard(item) {
        var attrs = '';
        if (item.replace_target) attrs += shopChip('替换', item.replace_target);
        if (item.category) attrs += shopChip('大类', item.category);
        attrs += shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('效果', item.effects) + shopDescription(item.description);
        // 形态升级: 右上角显示 层级(罗马数字) 替代 品质字母; 渲染技能子列表(与形态商品卡一致)
        var headTier = null;
        var formExtra = '';
        if (item.category === '形态' && item.tier) {
            headTier = item.tier;
            if (Array.isArray(item.skills) && item.skills.length) formExtra = shopBuildFormSkillsBlock(item.skills);
        }
        return shopCardHead(item, headTier) + shopAttrsBlock(attrs) + details + formExtra + shopCardFoot(item, false);
    }
    // 形态卡片技能子列表块(形态商品/形态升级共用): 详情式展开, 与 效果/描述 风格一致;
    // 每个技能以"(技能名)"标题 + 品质/类型/消耗/标签/效果/描述 各字段行, 空字段省略
    function shopBuildFormSkillsBlock(skills) {
        var rows = '';
        for (var i = 0; i < skills.length; i++) {
            var sk = skills[i] || {};
            var skName = shopPick(sk, 'name','名称','技能名','技能名称') || ('技能' + (i + 1));
            var fields = '';
            if (sk.品质) fields += shopDetail('品质', sk.品质);
            fields += shopDetail('类型', shopSkillTypeLabel(sk.类型 != null ? sk.类型 : 0));
            if (sk.消耗 && sk.消耗 !== '无') fields += shopDetail('消耗', sk.消耗);
            var skTags = (sk.标签 && sk.标签.length) ? sk.标签.join('、') : '';
            if (skTags) fields += shopDetail('标签', skTags);
            var skEf = sk.效果;
            if (skEf && typeof skEf === 'object' && Object.keys(skEf).length) {
                var efParts = [];
                for (var ek in skEf) { if (skEf.hasOwnProperty(ek)) efParts.push(ek + ':' + String(skEf[ek])); }
                fields += shopDetail('效果', efParts.join('；'));
            }
            if (sk.描述) fields += shopDetail('描述', sk.描述);
            // 每个技能单独为可折叠块(<details>), 标题即技能名, 默认收起
            rows += fcBodyCollapsible(skName, fields, 'sam-shop-sk-item', false);
        }
        // 外层整体折叠块: "技能 (N)", 默认收起; 内部各技能子折叠
        return fcBodyCollapsible('技能 (' + skills.length + ')', rows, 'sam-shop-sk-list', false);
    }
    // 形态卡片: 层级徽章(右上角) + 消耗/状态/属性/标签 + 效果 + 技能子列表 + 描述
    function shopBuildFormCard(item) {
        var attrs = '';
        if (item.cost) attrs += shopChip('消耗', item.cost);
        if (item.status) attrs += shopChip('状态', item.status);
        attrs += shopObjChips(item.raw_attrs) + shopTagChips(item.tags);
        var details = shopObjDetails('效果', item.effects) + shopDescription(item.description);
        var skillsBlock = (Array.isArray(item.skills) && item.skills.length) ? shopBuildFormSkillsBlock(item.skills) : '';
        return shopCardHead(item, item.tier) + shopAttrsBlock(attrs) + details + skillsBlock + shopCardFoot(item, false);
    }
    function shopBuildConsumeCard(item) {
        var attrs = shopTagChips(item.tags);
        var details = shopObjDetails('效果', item.effects) + shopDescription(item.description);
        return shopCardHead(item) + shopAttrsBlock(attrs) + details + shopCardFoot(item, true);
    }
    // 区域Tab条
    function shopRenderTabs() {
        var cats = [
            { key:'装备区', label:'装备', data: shopMarketData ? shopMarketData['装备区'] : null },
            { key:'道具区', label:'道具', data: shopMarketData ? shopMarketData['道具区'] : null },
            { key:'技能区', label:'技能', data: shopMarketData ? shopMarketData['技能区'] : null },
            { key:'血统区', label:'血统', data: shopMarketData ? shopMarketData['血统区'] : null },
            { key:'形态区', label:'形态', data: shopMarketData ? shopMarketData['形态区'] : null },
            { key:'升级区', label:'升级服务', data: shopMarketData ? shopMarketData['升级区'] : null }
        ];
        var html = '<div class="sam-shop-tabs">';
        for (var i = 0; i < cats.length; i++) {
            var c = cats[i];
            var cnt = 0;
            if ((c.key === '装备区' || c.key === '技能区' || c.key === '道具区') && c.data) { for (var s in c.data) { if (c.data.hasOwnProperty(s) && c.data[s].length) cnt += c.data[s].length; } }
            else if (Array.isArray(c.data)) cnt = c.data.length;
            // 空列表: 不渲染该Tab按钮(例如道具列表为[]时, 道具按钮隐藏)
            if (!cnt) continue;
            var active = (shopActiveTab === c.key) || (!shopActiveTab && i === 0);
            html += '<button type="button" class="sam-shop-tab'+(active?' active':'')+'" data-shop-tab="'+esc(c.key)+'">'+esc(c.label)
                + '<span class="sam-shop-tab-cnt">'+cnt+'</span></button>';
        }
        html += '</div>';
        return html;
    }
    // 渲染当前区域内容(顶部nav + 中部list, 已无外层market容器——由 renderShopTab 统一包裹)
    // coin 用于卡片禁用判定(余额不足时灰调)
    function shopRenderContent(coin) {
        if (!shopMarketData) return '<div class="sam-shop-list"><div class="sam-shop-empty">尚未刷新商品, 请在上方商城入口写入需求后点击「刷新商品」</div></div>';
        var permissionCharacter = shopResolveCharacter(getStatData() || {}, shopCurrentActor).character || {};
        var cat = shopActiveTab || '装备区';
        // 装备区/技能区/道具区: 顶部nav(类型) + 中部list(按类型分组)
        if (cat === '装备区' || cat === '技能区' || cat === '道具区') {
            var groups = shopMarketData[cat] || {};
            var groupKeys = [];
            for (var g in groups) { if (groups.hasOwnProperty(g) && groups[g].length) groupKeys.push(g); }
            if (!groupKeys.length) return '<div class="sam-shop-nav"></div><div class="sam-shop-list"><div class="sam-shop-empty">'+esc(cat.replace('区',''))+'区暂无商品</div></div>';
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
        // 血统区: 纯list(无nav, 单列布局)
        var items = shopMarketData[cat] || [];
        if (!items.length) return '<div class="sam-shop-list"><div class="sam-shop-empty">'+esc(cat.replace('区',''))+'区暂无商品</div></div>';
        var listHtml3 = '';
        for (var j = 0; j < items.length; j++) {
            listHtml3 += shopRenderItemCard(items[j], cat, '', coin, permissionCharacter);
        }
        return '<div class="sam-shop-list">'+listHtml3+'</div>';
    }
    // 分组列表渲染(装备区/技能区/道具区通用: 按类型分组后的单组列表)
    function shopRenderGroupList(items, cat, slot, coin, permissionCharacter) {
        if (!items || !items.length) return '<div class="sam-shop-empty">此分类暂无商品</div>';
        var html = '';
        for (var i = 0; i < items.length; i++) {
            html += shopRenderItemCard(items[i], cat, slot, coin, permissionCharacter);
        }
        return html;
    }
    // 单卡片渲染(含选中态/禁用态/数量回填/已选角标)
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
        var permission = shopPermissionDecision(permissionCharacter || {}, item, permissionSd.角色 && permissionSd.角色.权限凭证);
        // 已选中的越权旧条目仍允许点击取消；未选中的越权商品直接锁死。
        var permissionLocked = (!isSelected && !permission.allowed);
        // 禁用判定: 已选中的不灰(允许调整数量/取消); 未选中且单件价格>余额 → 灰调禁用
        // 道具区按"1件价格"判定(可后续加数量); 其他区按单件价格
        var unitPrice = Number(item.price || 0);
        // 禁用判定基于"剩余余额"(原始余额-已选合计), 避免叠加选中后仍可继续点
        var remain = shopRemain(coin);
        var unaffordable = (!isSelected && remain < unitPrice);
        // ★ 血统区上限: 血统已满时【不禁用】商品卡片(融合会替换一条旧血统, 总数不变),
        //   仅追加"已满·需融合"提示条引导; "直接购买"的满额灰度在融合弹窗内处理
        var bloodFullHint = (cat === '血统区' && !isSelected && shopBloodCount >= shopBloodLimit);
        // ★ 血统区在融合进行中(bloodFusionBusy): 未选中的血统商品灰显(血统相关操作被屏蔽);
        //   已选中的仍允许取消; 其他区域(装备/道具/技能/升级)不受融合影响, 正常可购买
        var bloodFusionLock = (cat === '血统区' && !isSelected && bloodFusionBusy);
        // ★ 升级区在融合进行中: 若该升级卡片"replace_target = 本次正在被融合的某条血统" → 灰锁
        //   (原血统正在被消耗, 在融合结果出来之前先暂停其对应升级服务的购买)
        if (cat === '升级区' && !isSelected && bloodFusionBusy && item.category === '血统'
            && bloodFusionConsumedNames.length && bloodFusionConsumedNames.indexOf(item.replace_target || '') >= 0) {
            bloodFusionLock = true;
        }
        var disReason = permissionLocked ? 'permission' : (unaffordable ? 'unaffordable' : (bloodFusionLock ? 'fusionbusy' : ''));
        var dis = disReason ? ' disabled' : '';
        var dataAttrs = ' data-name="'+esc(item.name)+'" data-cat="'+esc(cat)+'" data-slot="'+esc(slot||'')+'" data-dis-reason="'+disReason+'"';
        // 已选角标(选中时显示); 道具区角标文案带数量
        var cornerLabel = isSelected ? (isConsume ? ('已选 ×'+(shopGetQty(item.name, cat)||0)) : '已选') : '';
        var cornerHtml = '<span class="sam-shop-sel-corner">'+esc(cornerLabel)+'</span>';
        // 血统已满提示条(不禁用卡片, 引导用户走融合替换流程)
        var hintHtml = bloodFullHint ? '<div class="sam-shop-blood-full-hint" style="margin-top:6px;padding:4px 8px;font-size:11px;color:var(--sam-hp);background:rgba(255,107,107,0.1);border-radius:6px;text-align:center;line-height:1.4">血统已满 · 购买将进入融合替换</div>' : '';
        var permissionHint = (!permission.allowed) ? '<div class="sam-shop-permission-hint" style="margin-top:6px;padding:5px 8px;font-size:11px;color:var(--sam-warning);background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);border-radius:6px;text-align:center;line-height:1.4">🔒 权限不足 · 当前上限 '+esc(permission.capGrade)+' · 商品 '+esc(permission.requiredGrade)+'</div>' : '';
        return '<div class="sam-shop-item'+sel+dis+'"'+dataAttrs+'>'+inner+cornerHtml+hintHtml+permissionHint+'</div>';
    }
    // 底部购物车条
    function shopRenderFooter(coin) {
        var cartCount = shopCart.length;
        var cost = shopCartCost();
        var remain = coin - cost;
        var insufficient = (remain < 0);
        var sd = getStatData() || {};
        var actorCtx = shopResolveCharacter(sd, shopCurrentActor);
        var credentialRequirements = shopCredentialCartRequirements(actorCtx.character || {}, shopCart);
        var credentialShortages = shopCredentialShortages(sd.角色 && sd.角色.权限凭证, credentialRequirements);
        var credentialInsufficient = credentialShortages.length > 0;
        var credentialText = shopCredentialRequirementText(credentialRequirements);
        var remainCls = insufficient ? ' insufficient' : '';
        var infoHtml = '';
        if (!cartCount) {
            infoHtml = '已选 <b>0</b> 项 · 合计 <b>0</b> · 剩余 <b>'+(coin ? coin.toLocaleString() : '0')+'</b>';
        } else if (insufficient || credentialInsufficient) {
            var warnings = [];
            if (insufficient) warnings.push('空间币不足');
            if (credentialInsufficient) warnings.push('权限凭证不足：'+shopCredentialShortageText(credentialShortages));
            infoHtml = '<span class="sam-shop-foot-warn">⚠️ '+warnings.join(' · ')+' · 已选 '+cartCount+' 项 · 合计 '+cost.toLocaleString()+' · 剩余 <span class="sam-shop-foot-remain'+remainCls+'">'+remain.toLocaleString()+'</span>'
                + (credentialText ? ' · 所需凭证 '+esc(credentialText) : '') + '</span>';
        } else {
            infoHtml = '已选 <b>'+cartCount+'</b> 项 · 合计 <b>'+cost.toLocaleString()+'</b> · 剩余 <span class="sam-shop-foot-remain'+remainCls+'"><b>'+remain.toLocaleString()+'</b></span>'
                + (credentialText ? ' · 所需凭证 <b>'+esc(credentialText)+'</b>' : '');
        }
        var disabled = (!cartCount || insufficient || credentialInsufficient) ? ' disabled' : '';
        var btnText = cartCount ? '授权执行交易' : '请先选择商品';
        return '<div class="sam-shop-foot"><div class="sam-shop-foot-info">'+infoHtml+'</div>'
            + '<button type="button" class="sam-shop-exec-btn" data-shop-exec'+disabled+'>'+btnText+'</button></div>';
    }
    // ---- 执行层: 提交交易(/send 文本|/trigger + 写回MVU) ----
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
                if (Date.now() - start > timeout) { reject(new Error('未能定位交易记录楼层')); return; }
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
                // 优先 triggerSlash(酒馆原生)
                if (typeof win.triggerSlash === 'function') { resolve(win.triggerSlash(cmd)); return; }
                if (typeof win.SillyTavern === 'object' && win.SillyTavern && typeof win.SillyTavern.triggerSlash === 'function') { resolve(win.SillyTavern.triggerSlash(cmd)); return; }
                // 兜底: 注册的 STScriptParser / executeSlashCommand
                if (typeof win.executeSlashCommand === 'function') { resolve(win.executeSlashCommand(cmd)); return; }
                if (typeof win.registeredSlashCommands !== 'undefined') {
                    // /send 走 sendToInputBox 自动发送替代
                    reject(new Error('triggerSlash 不可用'));
                    return;
                }
                reject(new Error('triggerSlash 不可用'));
            } catch(e) { reject(e); }
        });
    }
    // 小票只记录已经成功落地的本地商城行为；逐笔换行追加，等待正文模型叙事后清空。
    function shopAppendReceipt(statData, line) {
        if (!statData || !line) return;
        statData.系统状态 = statData.系统状态 || {};
        var oldText = safeStr(statData.系统状态.待播报记录, '').trim();
        statData.系统状态.待播报记录 = oldText ? (oldText + '\n' + line) : line;
    }
    function shopReceiptLine(action, detail, cost, balance, actorLabel) {
        var who = actorLabel || '角色';
        return '['+action+']['+who+'] '+detail+'｜支付 '+safeNum(cost, 0)+'空间币｜余额 '+safeNum(balance, 0);
    }
    function shopClearReceipt() {
        var ok = writeBackMvu(function(statData) {
            statData.系统状态 = statData.系统状态 || {};
            statData.系统状态.待播报记录 = '';
        });
        if (ok) { renderAll(); samToast('success', '待播报记录已删除'); }
        else samToast('error', '删除失败: MVU写回不可用');
    }
    // 构建交易: 在 stat_data 副本上执行扣币/入包, 返回 { statData, purchaseLog, receipts, actorName }
    // ★ 多角色商城: 接收者(打包装入背包的角色)由 shopCurrentActor 决定(角色或NPC); 货币永远从 角色.空间币 扣除
    function shopBuildTransaction(statData) {
        var coinOwner = statData.角色;
        if (!coinOwner) throw new Error('角色数据不存在');
        var actorName = shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        var character = (actorName === SHOP_ACTOR_REINCARNATOR) ? coinOwner : (statData.关系列表 && statData.关系列表[actorName]);
        if (!character) throw new Error('角色数据不存在: ' + actorName);
        for (var gateI = 0; gateI < shopCart.length; gateI++) {
            var gateItem = shopCart[gateI] || {};
            var gate = shopPermissionDecision(character, gateItem, coinOwner.权限凭证);
            if (!gate.allowed) throw new Error(shopPermissionMessage(gate, gateItem));
        }
        var credentialRequirements = shopCredentialCartRequirements(character, shopCart);
        var credentialShortages = shopCredentialShortages(coinOwner.权限凭证, credentialRequirements);
        if (credentialShortages.length) throw new Error('权限凭证不足：' + shopCredentialShortageText(credentialShortages));
        var total = shopCartCost();
        var startCoin = Number(coinOwner.空间币 || 0);
        if (startCoin < total) throw new Error('角色空间币不足');
        coinOwner.权限凭证 = coinOwner.权限凭证 || {};
        if (!shopCredentialConsume(coinOwner.权限凭证, credentialRequirements)) throw new Error('权限凭证扣除失败');
        coinOwner.空间币 = startCoin - total;
        if (!character.装备) character.装备 = {};
        if (!character.技能) character.技能 = {};
        if (!character.血统) character.血统 = {};
        if (!character.道具) character.道具 = {};
        if (!character.形态库) character.形态库 = {};
        var itemStrs = [];
        var receiptLines = [];
        var receiptBalance = startCoin;
        var _actorLabel = (actorName === SHOP_ACTOR_REINCARNATOR) ? '角色' : actorName;
        for (var i = 0; i < shopCart.length; i++) {
            var item = shopCart[i];
            var qty = item.quantity || 1;
            if (item._cat === '技能区') {
                character.技能[item.name] = shopToSkillVar(item);
            } else if (item._cat === '血统区') {
                // ★ 血统上限防御(兜底): 正常流程血统区商品在 shopHandleExec 被拦截进融合弹窗,
                //   直接购买路径(bloodFusionDirectPurchase)已含上限检查; 此分支防止未来改动
                //   绕过路由导致净增血统突破 BLOODLINE_CAP
                if (!character.血统[item.name] && Object.keys(character.血统).length >= BLOODLINE_CAP) {
                    throw new Error('血统已达上限(' + BLOODLINE_CAP + '), 无法购买: ' + item.name);
                }
                character.血统[item.name] = shopToBloodlineVar(item);
            } else if (item._cat === '装备区') {
                var nextEq = shopToEquipVar(item, item._slot);
                character.装备[item.name] = nextEq;
            } else if (item._cat === '道具区') {
                var old = character.道具[item.name];
                var nextCon = shopToConsumeVar(item, qty);
                if (old && typeof old === 'object') nextCon.数量 = Number(old.数量 || 0) + qty;
                var merged = {};
                if (old && typeof old === 'object') { for (var ok2 in old) { if (old.hasOwnProperty(ok2)) merged[ok2] = old[ok2]; } }
                for (var nk in nextCon) { if (nextCon.hasOwnProperty(nk)) merged[nk] = nextCon[nk]; }
                character.道具[item.name] = merged;
            } else if (item._cat === '形态区') {
                // 形态商品: 直接购买入形态库(键为形态名, 不强制替换; 同名覆盖)
                character.形态库[item.name] = shopToFormVar(item, item.name);
            } else if (item._cat === '升级区') {
                // 升级商品: 按所属大类决定写入哪个角色字段; 替换目标决定回收哪个旧物品
                var upCat = item.category || '';
                var tgtName = item.replace_target || item.name;
                if (upCat === '血统') {
                    // ★ 血统上限防御: 升级服务语义是"删旧加新"(数量不变), 但若 AI 生成的
                    //   replace_target 与角色实际持有的血统名不匹配(数据过期/已被融合/名字幻觉),
                    //   delete 会沦为空操作, 等效"净增1个血统"→ 绕过 BLOODLINE_CAP 上限。
                    //   故写入前校验: 替换目标不存在且非同名覆盖时, 购买后数量不得超上限。
                    var bTgtExists = !!character.血统[tgtName];
                    var bOverwrite = !!character.血统[item.name];
                    if (!bTgtExists && !bOverwrite && Object.keys(character.血统).length >= BLOODLINE_CAP) {
                        throw new Error('血统已达上限(' + BLOODLINE_CAP + '), 升级服务【' + item.name + '】的替换目标【' + tgtName + '】不存在, 无法购买');
                    }
                    if (bTgtExists) delete character.血统[tgtName];
                    character.血统[item.name] = shopToBloodlineVar(item);
                } else if (upCat === '技能') {
                    if (character.技能[tgtName]) delete character.技能[tgtName];
                    character.技能[item.name] = shopToSkillVar(item);
                } else if (upCat === '装备') {
                    var oldEquip = character.装备[tgtName];
                    var newEquip = shopToEquipVar(item, '');
                    if (oldEquip && typeof oldEquip === 'object' && oldEquip.状态 != null) newEquip.状态 = oldEquip.状态;
                    if (character.装备[tgtName]) delete character.装备[tgtName];
                    character.装备[item.name] = newEquip;
                } else if (upCat === '形态') {
                    // 升级形态: 删旧形态(替换目标)再写新形态; 与"购买形态"同走 shopToFormVar
                    if (character.形态库[tgtName]) delete character.形态库[tgtName];
                    character.形态库[item.name] = shopToFormVar(item, item.name);
                }
            }
            var qtyStr = qty > 1 ? ' ×'+qty : '';
            var ratingStr = item.rating ? ('（'+item.rating+'级）') : '';
            // 升级服务小票: 显示 "替换目标→新名称", 操作标记为"升级"; 其他商品为"购买 名称"
            var upTgtName = (item._cat === '升级区' && item.replace_target) ? item.replace_target : '';
            var itemDetail = upTgtName ? (upTgtName + ' → ' + item.name + ratingStr) : (item.name + qtyStr + ratingStr);
            var itemAction = upTgtName ? '升级' : '购买';
            var itemCost = Number(item.price || 0) * Number(qty);
            receiptBalance -= itemCost;
            itemStrs.push(itemDetail);
            receiptLines.push(shopReceiptLine(itemAction, itemDetail, itemCost, receiptBalance, _actorLabel));
        }
        shopRecalcDerived(character);
        // 从 当前角色对应的商库 移除已购买商品(持久化售出状态)
        shopRemovePurchasedFromLibrary(statData, shopCart, actorName);
        return {
            statData: statData,
            purchaseLog: _actorLabel + '兑换了 ' + itemStrs.join('、'),
            receipts: receiptLines,
            actorName: actorName
        };
    }
    // 从商品库移除已购物品: 商城.成员商库.<角色名> 下的 装备列表/技能列表/血统列表/道具列表/升级列表 均为扁平数组
    // 所有区域(含道具区)统一"整件移除"——买走的商品直接从商品库消失, 不做数量递减
    // (商店语义: 玩家买走的即下架, 不再陈列; 道具原数量字段仅作展示, 不作为可购上限)
    // ★ 多角色: actorName 指定从哪个角色的专属商库移除; 默认沿用 shopCurrentActor
    function shopRemovePurchasedFromLibrary(statData, cart, actorName) {
        if (!statData.商城) return;
        var libMap = statData.商城[SHOP_ACTOR_LIB_KEY];
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        var lib = null;
        if (libMap && libMap[actorName]) {
            lib = libMap[actorName];
        } else if (actorName === SHOP_ACTOR_REINCARNATOR) {
            // 兼容旧数据: 角色商库可能直接平铺在 商城 顶层
            if (Array.isArray(statData.商城.装备列表) || Array.isArray(statData.商城.技能列表)
                || Array.isArray(statData.商城.血统列表) || Array.isArray(statData.商城.道具列表) || Array.isArray(statData.商城.升级列表) || Array.isArray(statData.商城.形态列表)) {
                lib = statData.商城;
            }
        }
        if (!lib) return;
        // 收集已购物品名(全部整件移除)
        var removeNames = {};
        for (var i = 0; i < cart.length; i++) {
            removeNames[cart[i].name] = true;
        }
        // 新结构: 4个扁平数组, 逐个过滤(整件移除)
        var listKeys = ['装备列表','技能列表','血统列表','道具列表','升级列表','形态列表'];
        for (var ki = 0; ki < listKeys.length; ki++) {
            var key = listKeys[ki];
            if (Array.isArray(lib[key])) {
                lib[key] = shopFilterLibArray(lib[key], removeNames);
            }
        }
        // ★ 升级服务互斥: 玩家购买某升级服务后, 其替换目标(原物品)已被删除,
        //   升级列表里其余"替换目标=该同一原物品"的升级条目也失去意义, 一并移除
        //   例: 人类血统 → 升级列表有【修仙进化】【科技进化】【血肉进化】, 均以"人类血统"为替换目标;
        //       购买【修仙进化】后人类血统被删除, 剩余对应人类血统的升级商品全部移除
        if (Array.isArray(lib.升级列表) && lib.升级列表.length) {
            var consumeTargets = {};
            for (var ci = 0; ci < cart.length; ci++) {
                var ce = cart[ci];
                if (ce && ce._cat === '升级区' && ce.replace_target) {
                    consumeTargets[String(ce.replace_target)] = true;
                }
            }
            if (Object.keys(consumeTargets).length) {
                lib.升级列表 = lib.升级列表.filter(function(u) {
                    var upTgt = String(shopPick(u, 'replace_target','替换目标') || '');
                    // 同替换目标的升级条目一并移除(已购条目上面已整件移除, 这里兜底再清)
                    return !(upTgt && consumeTargets[upTgt]);
                });
            }
        }
    }
    // 商品库数组过滤(整件移除): 按名称移除已购物品, 其余保留
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
    // 返回对象上第一个匹配的 key 名(供原地修改数量字段)
    function shopPickKey(obj) {
        for (var i = 1; i < arguments.length; i++) {
            var k = arguments[i];
            if (obj && obj[k] !== undefined) return k;
        }
        return null;
    }
    function shopHandleExec() {
        var sd = getStatData();
        if (!sd) { samToast('error', '数据未就绪'); return; }
        if (!shopCart.length) { samToast('warning', '请先选择商品'); return; }
        // ★ 升级服务也有融合进行中屏蔽: 命中"replace_target=正在被融合的血统"的升级条目禁止结算
        if (bloodFusionBusy && bloodFusionConsumedNames.length) {
            var upgradeHit = shopCart.filter(function(entry) {
                return entry && entry._cat === '升级区' && entry.category === '血统'
                    && bloodFusionConsumedNames.indexOf(entry.replace_target || '') >= 0;
            });
            if (upgradeHit.length) { samToast('warning', '血统融合进行中, 对应升级服务暂不可购买, 请等待融合完成'); return; }
        }
        var bloodItems = shopCart.filter(function(entry) { return entry && entry._cat === '血统区'; });
        if (bloodItems.length) {
            // ★ 血统相关操作屏蔽: 融合进行中不允许再发起血统购买/融合; 其他商品交易不受影响
            if (bloodFusionBusy) { samToast('warning', '血统融合进行中, 请等待融合完成后再购买血统'); return; }
            // ★ 血统购买自动收敛: 清理购物车内其他类别商品 + 多余血统条目, 仅保留最后一个选中的血统,
            //   保证融合流程顺利发起(融合会替换 / 直接购买会入栏), 不再阻止用户进入融合舱
            var keepBlood = bloodItems[bloodItems.length - 1];
            if (bloodItems.length !== 1 || shopCart.length !== 1) {
                shopCart = [];
                var merged = {};
                for (var bk in keepBlood) { if (keepBlood.hasOwnProperty(bk)) merged[bk] = keepBlood[bk]; }
                merged._cat = '血统区'; merged._slot = ''; merged.quantity = 1;
                shopCart.push(merged);
                shopRefreshMarket();
                samToast('info', '血统需单独结算, 已自动清空购物车其他商品');
            }
            openBloodFusionModal(keepBlood);
            return;
        }
        // ★ 多角色商城: 货币永远从 角色.空间币 扣除; 校验角色空间币余额
        var coin = safeNum(sd.角色 && sd.角色.空间币, 0);
        if (coin < shopCartCost()) { samToast('error', '空间币不足, 无法执行交易'); return; }
        // ★ 校验当前目标角色(NPC) 是否仍在场(切换后可能离场)
        if (shopCurrentActor !== SHOP_ACTOR_REINCARNATOR) {
            var actorNpc = (sd.关系列表 && sd.关系列表[shopCurrentActor]) ? sd.关系列表[shopCurrentActor] : null;
            if (!actorNpc) { samToast('error', '目标角色已离场, 无法为其购买, 请重新选择'); return; }
        }
        // 1) 在 stat_data 副本上构建交易结果(扣币/入包/商品库一次性移除全部已购)
        var result;
        try {
            // 深拷贝 stat_data, 避免污染原对象
            var snapshot = (_ && _.cloneDeep) ? _.cloneDeep(sd) : JSON.parse(JSON.stringify(sd));
            result = shopBuildTransaction(snapshot);
        } catch(e) {
            samToast('error', '交易构建失败: '+e.message);
            return;
        }
        var $execBtn = $('.sam-shop-exec-btn');
        if ($execBtn.length) { $execBtn.prop('disabled', true).text('执行中...'); }
        // 2) ★ 同步优先直写 MVU(原子操作): 立即把交易结果写回, 商品库一次性移除全部已购物品
        //    旧流程先 /trigger 触发AI回复, AI的[mvu_update]会覆盖我们的写回(导致只删1个),
        //    改为: 先直写MVU(不可被覆盖) → 清空购物车 → 再 /send 记录文本(不触发AI)
        var writeOk = writeBackMvu(function(statData) {
            // 用构建好的交易结果整体覆盖角色字段 + 商城商品库
            var rs = result.statData;
            // ★ 写回: 角色(含空间币扣除, 角色购物时含新装备) + 商城(商品库已移除已购) + 关系列表(NPC购物时含新装备)
            if (rs.角色) statData.角色 = rs.角色;
            if (rs.商城) statData.商城 = rs.商城;
            if (rs.关系列表) statData.关系列表 = rs.关系列表;
            for (var ri = 0; ri < result.receipts.length; ri++) {
                shopAppendReceipt(statData, result.receipts[ri]);
            }
        });
        if (!writeOk) {
            samToast('error', '交易失败: MVU写回不可用');
            if ($execBtn.length) { $execBtn.prop('disabled', false).text('授权执行交易'); }
            return;
        }
        // 3) 清空购物车 + 刷新UI(立即反映商品库已移除已购)
        shopCart = [];
        // 重新读取当前角色的商品库以同步本地缓存(shopMarketData), 避免显示已售商品
        var freshSd = getStatData();
        var freshLib = shopGetActorLibRaw((freshSd && freshSd.商城) ? freshSd.商城 : null, shopCurrentActor);
        if (freshLib) {
            shopMarketData = shopNormalizeMarketData(freshLib);
            if (!shopTabHasData(shopActiveTab)) shopActiveTab = shopPickFirstAvailableTab();
        } else {
            shopMarketData = null;
        }
        samToast('success', '交易已完成');
        renderAll();
        // 4) /send 记录交易文本(仅创建用户楼层, 不带 /trigger, 不触发AI回复, 避免AI的mvu_update覆盖商品库)
        var msg = result.purchaseLog + '。';
        try {
            shopTriggerSlash('/send ' + msg).then(function() {
                if ($execBtn.length) { $execBtn.prop('disabled', false).text('授权执行交易'); }
            }).catch(function(eSend) {
                try { console.warn('[主神终端] /send 记录失败(交易已生效):', eSend.message); } catch(e2){}
                if ($execBtn.length) { $execBtn.prop('disabled', false).text('授权执行交易'); }
            });
        } catch(eSync) {
            try { console.warn('[主神终端] /send 异常(交易已生效):', eSync.message); } catch(e2){}
            if ($execBtn.length) { $execBtn.prop('disabled', false).text('授权执行交易'); }
        }
    }
    /* ===== 32d. 商城: 刷新商品(调正文AI generateRaw, 按新ZOD结构生成商品库) =====
       - 二次校验 战斗中/不在主神空间(按钮已禁用, 此处兜底)
       - 通过 generateRaw 调用正文AI, 让其按新结构(YAML式)输出4个商品列表
       - 解析返回文本 → 写入 stat_data.商城(经ZOD校验归一化) + 重置本地缓存 + renderAll
       - 刷新中用模块级 shopRefreshing 标志驱动渲染: 置 true 后 renderAll 即隐藏原列表、
         改显示"正在请求…可关闭或等待"提示且按钮/输入框置灰; 切聊天/关再开面板均不丢失
         (标志为模块级, 不随 renderAll 重建而清零)
       - AI 成功 → 清缓存重渲染 + toast"商品列表已刷新, 共N件"; 失败/解析空 → toast +
         保留 shopMarketData 使原列表恢复显示; 两路径均置 shopRefreshing=false 解除锁定 */
    // 32d-1. 定位正文AI接口 generateRaw(跨作用域: 当前/父/TavernHelper)
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
    // 32d-2. 统一封装AI调用(返回Promise, 兼容同步/异步)
    //  统一分发: 若"额外模型配置"开关开启 → 走自托管API(apiChat); 否则 → 走 generateRaw 正文AI
    function shopCallAI(systemPrompt, userMsg) {
        if (isApiConfigEnabled()) {
            // 额外模型通道: OpenAI 兼容 /chat/completions 直连(商城刷新/血统融合共用)
            return apiChat(systemPrompt, userMsg).then(function(content){
                // generateRaw 返回的通常是字符串; 保持调用方语义一致
                return content;
            });
        }
        return new Promise(function (resolve, reject) {
            var fn = shopGetAI();
            if (!fn) { reject(new Error('未找到正文AI接口 generateRaw')); return; }
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
    // 32d-3. 解析AI返回的YAML式文本 → { 血统列表:[], 技能列表:[], 装备列表:[], 道具列表:[] }
    //   容错: 兼容 ```yaml / ``` 代码围栏; 字段名大小写不敏感; 行内 {a:1,b:2} 与 ['a','b'] 内联语法
    //   严格匹配ZOD新结构: 血统(原始属性/效果) 技能(类型0-2) 装备(类型0-8) 道具(类型str/数量)
    function shopParseMarketText(text) {
        var result = { 血统列表: [], 技能列表: [], 装备列表: [], 道具列表: [], 升级列表: [], 形态列表: [] };
        if (!text || typeof text !== 'string') return result;
        // 剥离代码围栏
        var cleaned = text.replace(/```(?:ya?ml|json)?/gi, '').replace(/```/g, '');
        var lines = cleaned.split('\n');
        // 内联对象/数组解析: {a:1, b:2} → {a:1,b:2}; ['a','b'] → ['a','b']
        function parseInline(raw) {
            if (raw == null) return null;
            var s = String(raw).trim();
            if (!s) return null;
            // 行内 {...}
            if (/^\{.*\}$/.test(s)) {
                try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) {}
                // 手动拆分 键:值 对
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
            // 行内 [...]
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
            // 剥离 YAML 字符串外层配对引号(双引号或单引号), 如 "材料" → 材料
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
        // 属性对象(用于 原始属性: {力量:'B', ATK:5} 兼容品质字母与数值)
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
        // 缩进式YAML解析: 按列表头(血统列表/技能列表/...)分段, 每段内 - 项为新条目, 同级缩进键为字段
        var listKeys = ['血统列表', '技能列表', '装备列表', '道具列表', '升级列表', '形态列表'];
        var curList = null;     // 当前所在列表名(result的key)
        var curItem = null;     // 当前正在填充的条目对象
        var itemIndent = -1;    // 当前条目的 - 行缩进
        function flushItem() {
            if (curItem && curList && Array.isArray(result[curList])) {
                if (curItem.名称) result[curList].push(curItem);
            }
            curItem = null;
            itemIndent = -1;
        }
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            // 跳过空行与注释
            if (!line.trim() || /^\s*#/.test(line)) continue;
            // 顶层列表头(无缩进或极小缩进的 "xxx列表:")
            var headM = line.match(/^\s{0,2}(血统列表|技能列表|装备列表|道具列表|升级列表|形态列表)\s*:\s*$/);
            if (headM) {
                flushItem();
                curList = headM[1];
                continue;
            }
            // 列表项起始: 行内含 "  - " 前缀
            var itemM = line.match(/^(\s*)-\s+(.*)$/);
            if (itemM && curList) {
                flushItem();
                curItem = {};
                itemIndent = itemM[1].length;
                // 行内可能带 名称: xxx
                var rest = itemM[2];
                var inlineKV = rest.match(/^([^\s:]+)\s*:\s*(.*)$/);
                if (inlineKV) {
                    var _pv = parseInline(inlineKV[2]);
                    curItem[inlineKV[1]] = _pv !== null ? _pv : str(inlineKV[2]);
                }
                continue;
            }
            // 字段行: 缩进大于列表头, 形如 "  字段: 值"
            var fieldM = line.match(/^(\s+)([^\s:]+)\s*:\s*(.*)$/);
            if (fieldM && curItem && curList) {
                var k = fieldM[2];
                var v = fieldM[3];
                var fieldIndent = fieldM[1].length;
                // 多行对象字段: 形态列表内 技能 子块, 值为空时, 向下收集更深层缩进的 "- 名称: ..." 子技能
                // (形态条目内嵌 技能: { - 名称: ...\n  品质: ...\n  类型: ...\n  效果: {...}\n  标签: [...] } 子列表,
                //  子技能的 效果/原始属性 也可能展开为多行 YAML, 需前瞻收集)
                // 技能 子块收集: 形态列表 内, 或 升级列表 内且当前条目 所属大类=形态(形态升级条目内嵌 技能 子列表)
                var _isFormSkillBlock = (curList === '形态列表') || (curList === '升级列表' && curItem && (curItem.所属大类 === '形态' || curItem.category === '形态'));
                if (!v.trim() && _isFormSkillBlock && k === '技能') {
                    var skillsArr = [];
                    var sCur = null;        // 当前正在填充的子技能
                    var sIndent = -1;       // 子技能 "- " 行缩进
                    var j3 = i + 1;
                    // 子技能字段值处理器: 行内值 sv → 归一化为对应类型
                    function pushSkillField(obj, fk, fv) {
                        if (fk === '标签') obj[fk] = tags(fv);
                        else if (fk === '类型') {
                            var _stn = parseInt(fv, 10);
                            obj[fk] = isFinite(_stn) ? _stn : 0;
                        } else if (fk === '效果') {
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
                        // 字段行: 缩进大于 sIndent → 当前子技能字段
                        var sfM = sLine.match(/^(\s+)([^\s:]+)\s*:\s*(.*)$/);
                        if (sfM && sCur && sfM[1].length > sIndent) {
                            var sk = sfM[2], sv = sfM[3];
                            var sFieldIndent = sfM[1].length;
                            // 子技能 效果/原始属性 多行展开: 值为空时前瞻收集更深层缩进 key:value
                            if (!sv.trim() && (sk === '效果' || sk === '原始属性')) {
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
                        // 子技能项起始: 缩进大于 技能 字段缩进(fieldIndent), 形如 "     - 名称: xxx"
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
                        // 缩进回退到 ≤ fieldIndent → 子块结束
                        if (sfM && sfM[1].length <= fieldIndent) break;
                        // 缩进更小的非字段(如下一个形态 - 项) → 结束
                        if (sItemM && sItemM[1].length <= fieldIndent) break;
                        break;
                    }
                    if (sCur) skillsArr.push(sCur);
                    curItem['技能'] = skillsArr;
                    i = j3 - 1;
                    continue;
                }
                // 多行对象字段: 效果/原始属性 值为空时, 向下收集更深层缩进的 key:value 对
                // (AI 常将嵌套对象展开为多行 YAML 而非行内 {k:v}, 需前瞻收集)
                if (!v.trim() && (k === '效果' || k === '原始属性')) {
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
                // 数值字段
                if (k === '价格' || k === '数量') {
                    curItem[k] = num(v, k === '数量' ? 1 : 0);
                } else if (k === '类型') {
                    // 技能(0-2)/装备(0-8)为数字, 道具为字符串
                    var tn = parseInt(v, 10);
                    if (curList === '技能列表' || curList === '装备列表') {
                        curItem[k] = isFinite(tn) ? tn : 0;
                    } else {
                        curItem[k] = str(v);
                    }
                } else if (k === '原始属性') {
                    curItem[k] = numMap(v);
                } else if (k === '效果') {
                    curItem[k] = objMap(v);
                } else if (k === '标签') {
                    curItem[k] = tags(v);
                } else if (k === '品质' || k === '层级' || k === '消耗' || k === '描述' || k === '名称') {
                    curItem[k] = str(v);
                } else {
                    // 未知字段原样保留
                    curItem[k] = parseInline(v) !== null ? parseInline(v) : str(v);
                }
                continue;
            }
        }
        flushItem();
        return result;
    }
    // 32d-4. 构造玩家上下文摘要(供AI参考玩家构筑与层级)
    // ★ 多角色商城: actorName 指定本次为谁生成上下文(角色或NPC); 空间币始终展示角色余额(由角色支付)
    function shopBuildPlayerContext(sd, actorName) {
        actorName = actorName || shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
        var ctx = shopResolveCharacter(sd, actorName);
        var p = ctx.character || {};
        var reincarnatorCoin = (sd.角色 && sd.角色.空间币 != null) ? sd.角色.空间币 : null;
        var reincarnatorCredentials = (sd.角色 && sd.角色.权限凭证 && typeof sd.角色.权限凭证 === 'object') ? sd.角色.权限凭证 : {};
        var parts = [];
        // 顶部标注本次生成目标(角色/队友名), 供AI对齐构筑
        parts.push('本次购买目标: ' + (ctx.isReincarnator ? '角色(玩家本人)' : (actorName + '(队友)')));
        if (p.种族) parts.push('种族: ' + p.种族);
        if (Array.isArray(p.身份) && p.身份.length) parts.push('身份: ' + p.身份.join('/'));
        {
            var _occTxt = occupationSummaryText(p.职业);
            if (_occTxt) parts.push('职业: ' + _occTxt);
        }
        if (p.层级) parts.push('层级: ' + p.层级);
        // 空间币与权限凭证都属于角色账户；即使当前为NPC购买，也使用角色账户支付/授权。
        if (reincarnatorCoin != null) parts.push('空间币: ' + reincarnatorCoin);
        var credentialParts = [];
        for (var _ci = 0; _ci < SHOP_PERMISSION_QUALITY_ORDER.length; _ci++) {
            var _cg = SHOP_PERMISSION_QUALITY_ORDER[_ci];
            var _cq = Math.max(0, Math.floor(safeNum(reincarnatorCredentials[_cg], 0)));
            if (_cq > 0) credentialParts.push(_cg + '×' + _cq);
        }
        parts.push('权限凭证(角色账户): ' + (credentialParts.length ? credentialParts.join(' / ') : '无'));

        // ★ 核心辅助函数：提取物品的所有关键信息，拼接成紧凑的单行文本，既全面又省 Token
        function formatDict(dict) {
            var keys = Object.keys(dict || {});
            if (keys.length === 0) return '无';
            
            return keys.map(function(k) {
                var v = dict[k] || {};
                var info = [];
                
                if (v.品质) info.push(v.品质 + '级');
                if (v.数量 != null) info.push('数量:' + v.数量);
                if (v.消耗) info.push('消耗:' + v.消耗);
                // 属性和效果是对象，用 JSON.stringify 拍平显示
                if (v.原始属性 && Object.keys(v.原始属性).length > 0) info.push('属性:' + JSON.stringify(v.原始属性));
                if (v.效果 && Object.keys(v.效果).length > 0) info.push('效果:' + JSON.stringify(v.效果));
                if (v.描述) info.push('描述:' + v.描述);
                
                // 输出格式例: "  - 御剑术 [F级 | 消耗:8MP | 效果:{"主动":"..."} | 描述:...]"
                return '  - ' + k + ' [' + info.join(' | ') + ']';
            }).join('\n');
        }

        // 已有装备/技能/血统名称(帮助AI避免重复+贴合构筑)
        var blData = p.血统 || {};
        if (Object.keys(blData).length) parts.push('已有血统:\n' + formatDict(blData));
        
        var skData = p.技能 || {};
        if (Object.keys(skData).length) parts.push('已有技能:\n' + formatDict(skData));
        
        var eqData = p.装备 || {};
        if (Object.keys(eqData).length) parts.push('已有装备:\n' + formatDict(eqData));
        
        var invData = p.道具 || {};
        if (Object.keys(invData).length) parts.push('已有物品:\n' + formatDict(invData));

        var statusData = p.状态 || {};
        if (Object.keys(statusData).length) parts.push('已有状态:\n' + formatDict(statusData));

        // 已有形态库(供AI贴合规避重复构筑; 形态升级服务需据此填"替换目标")
        var formData = p.形态库 || {};
        if (Object.keys(formData).length) parts.push('已有形态:\n' + formatDict(formData));
        
        // 世界/任务上下文
        var w = sd.世界 || {};
        if (w.当前世界) parts.push('当前世界: ' + w.当前世界);
        
        return parts.join('\n');
    }
    // 32d-4-1. 获取世界书内容
    async function getWorldBookContent(searchTitle) {
        var win = GS_PARENT; 

        if (!win.EjsTemplate || typeof win.EjsTemplate.evalTemplate !== 'function') {
            console.error('[主神终端] 致命错误：未找到 EjsTemplate.evalTemplate 扩展接口！');
            return null;
        }
        
        try {
            // 4. 因为上面的 ceshiBUG 加了 async，这里的 await 才完全合法
            var env = await win.EjsTemplate.prepareContext({ targetTitle: searchTitle });
            var code = '<%- await getwi(targetTitle) %>';
            var content = await win.EjsTemplate.evalTemplate(code, env);
            
            if (content && content.trim() !== '') {
                return content + '\n';
            }
            return null;
        } catch (error) {
            console.error('[主神终端] 世界书读取异常:', searchTitle, error);
            return null;
        }
    }
    // 32d-5. 主入口: 刷新商品
    function handleShopRefresh(reqText, worldBookContent) {
        var sd = getStatData();
        if (!sd) { samToast('error', '数据未就绪'); return; }
        var sys = sd.系统状态 || {};
        if (sys.是否战斗中 === true) { samToast('warning', '战斗中无法交易, 请在安全区域后再试'); return; }
        if (sys.是否在主神空间 !== true && !(sd.设置 && sd.设置.单一世界 === true)) { samToast('warning', '需返回主神空间后才能开启商城交易'); return; }
        // 检查AI接口: 启用额外模型配置时走自托管API, 否则需 generateRaw
        if (!isApiConfigEnabled() && !shopGetAI()) { samToast('error', '未检测到正文AI接口 generateRaw(或在设置里启用额外模型配置)'); return; }
        if (isApiConfigEnabled()) {
            var _apiCfgChk = getApiConfig();
            if (!_apiCfgChk.model) { samToast('error', '额外模型配置已启用但未选择模型, 请先在设置面板选择模型'); return; }
        }
        // 防重入: 已在刷新中则忽略
        if (shopRefreshing) return;
        // 进入刷新中状态(模块级标志, 切换界面/重渲染仍保持禁用); 立即重渲染以隐藏列表+显示提示
        shopRefreshing = true;
        shopRefreshEpoch += 1;          // 新一轮回合, 此前未完成的旧请求回调会被回合号不匹配丢弃
        var myEpoch = shopRefreshEpoch;
        renderAll();
        // —— 判断是否为精准搜索 ——
        var hasReq = (reqText && reqText.trim() !== '');
        // —— 系统提示词: 主神兑换终端设定 + 新结构说明 ——
       var sysPrompt = ''
            + '你是「主神兑换终端」的商品生成子系统。玩家在主神空间开启商城, 需要你生成一批可购买商品。\n'
            + '世界观: 轮回战场, 玩家穿越各副本世界完成任务, 在主神空间用「空间币」兑换装备/技能/血统/道具/形态。\n'
            + '【系统设定】\n'
            + worldBookContent + '\n'
            + '【生成约束】\n'
            + '1. 贴合度: 根据玩家当前的构筑（偏向物理/近战/生存）、职业和购买力生成。\n'
            + '2. 品质与视野权限控制 (商城解锁铁律):\n'
            + '   - 【前置扫描】: 生成商品前，必须读取【当前角色数据】中的购买对象层级，以及独立字段【权限凭证(角色账户)】。权限凭证不在道具/状态中查找。\n'
            + '   - 【基础视野】: 若无更高权限凭证，商城视野 =【购买对象当前层级+1阶】，最高封顶SSS（Ⅰ=F，Ⅱ=E……Ⅸ=SSS）。\n'
            + '   - 【凭证覆盖】: 若【权限凭证(角色账户)】中存在数量>0且高于【购买对象当前层级+1阶】的X级凭证，则商城视野提升至X级；多个有效凭证只取最高品质。凭证数量不会叠加品质。\n'
            + '   - 【绝对红线】: 商品最高品质不得超过【商城视野】。商城视野只能来源于【基础视野】或【权限凭证】其中之一，禁止叠加计算。阶位序列:F→E→D→C→B→A→S→SS→SSS。权限凭证绝不出售或展示！\n'
            + '   - 【纯净展示】: 权限凭证仅用于决定商城视野；选购与结算仍由程序按同一上限硬校验。合法视野内商品无需再次写权限条件，超出商城视野的商品不得生成。\n'
            + '   - 避免与玩家已有物品功能完全重复。\n'
            + '3. 升级重铸机制: \n'
            + '   - 仔细检阅【当前角色数据】，挑选玩家现有的低阶血统、技能、装备或形态，生成高阶强化版本放入「升级列表」。必须直接生成升级后的完整成品面板，绝对禁止采用词条增量打补丁！必须提供精准的 `替换目标`，以便系统进行回收替换。同一目标可提供多个选项。\n'
            + '   - 【升级命名】: 成品必须使用简洁完整的名称；禁止在旧名称后追加或累积“改/强化/进阶/精制/Ⅰ/Ⅱ/Plus”等升级后缀，需要改名时直接整体重命名。\n'
            + '   - 【阶位限制规则】: 升级与重铸的阶位上限，严格与上述第2条的【品质与视野权限控制】同步。绝不能生成超出玩家视野上限的升级方案。\n'
            + '   - 【升级继承规则】:\n'
            + '      * 升级商品必须完整继承替换目标的已有有效词条。\n'
            + '      * 禁止使用“融合了原能力”“保留部分能力”等模糊描述替代实际词条记录。\n'
            + '      * 原装备/技能/血统的已有效果必须逐条迁移到新面板【效果】字段中。\n'
            + '      * 若旧词条被改造、合并或替换，必须明确记录原词条 → 新词条的对应关系。\n'
            + (hasReq
                ? '4. 核心聚焦: 玩家提出了明确的【核心需求】。商品生成必须以此为绝对中心。允许某些分类为空（不生成）。若生成其他类型的商品，必须与核心需求构成【流派联动】（例如需求是"狙击枪"，则配套生成"隐身技能"、"穿甲弹药道具"等）。总数控制在 16~24 个。\n'
                : '4. 均衡刷新: 一次生成约 18~28 个商品，血统/形态/技能/装备/道具 均衡分布，升级列表 2~4 项。\n')
            + '5. 商品职责隔离:\n'
            + '   - 【血统与形态严格隔离】: 两者必须彻底解耦，绝对禁止生成“附带变身形态的血统”。血统是底层生命本质的被动改造；形态是可激活的独立战斗变身面板或外置武装系统。\n'
            + '   - 【形态列表】: 禁止Ⅶ级以上形态商品出售。\n'
            + '   - 【血统列表】: 仅生成玩家未拥有的独立血统体系。若属于玩家已有血统的同源强化、进化、觉醒版本，必须进入升级列表。禁止S级以上血统商品出售。\n'
            + '   - 【升级列表】: \n'
            + '      * 仅处理玩家当前已有血统、技能、装备、形态的强化、升阶或重铸。必须填写准确替换目标。\n'
            + '      * 同阶强化与跨阶升阶均为有效升级方案，同一目标可同时提供同阶强化和跨阶升阶选项。\n'
            + '   - 【世界遗物规则】:\n'
            + '      * 世界遗物禁止作为商城普通商品生成。\n'
            + '      * 世界遗物只能通过任务世界探索、特殊事件、剧情奖励或世界结算获得。\n'
            + '      * 主神空间仅提供世界遗物的解析、修复、强化、融合等服务，不直接出售新的世界遗物。\n'
            + '      * 世界遗物不可进入普通装备栏体系，不作为常规装备替代品处理。\n'
            + '   - 同一目标禁止同时作为普通商品与升级商品出现。\n'
            + '   - 禁止提供金融类服务，如贷款，彩票等一切让玩家额外获得空间币的商品或能力。\n'
            + '6. 修炼类道具规则:\n'
            + '   - 【道具列表】允许生成秘籍、功法、心法、修炼资料等成长型道具。\n'
            + '   - 修炼类道具属于学习媒介，不直接生成技能或被动效果；购买后需通过修炼过程生成对应成长型状态。\n'
            + '   - 若商品描述为功法、修真秘籍、内功心法、魔法研究资料、身体强化方案等，应优先作为【道具】生成，而非【技能】。\n'
            + '   - 技能列表仅用于角色已经掌握、可直接使用的能力，不用于记录学习材料或成长路径。\n'
            + '   - 技能列表禁止生成需要长期学习、修炼积累或改变生命结构才能获得的体系能力。\n'
            + '   - 品质参考:\n'
            + '      * 普通武学、基础训练类秘籍: F-E级\n'
            + '      * 高深武学、内功心法、特殊技艺传承: D-C级\n'
            + '      * 修炼体系、生命进化、长期身体改造类秘籍: 通常不低于D级，依据实际成长潜力评估\n'
            + '   - 禁止将长期修炼体系压缩为单个技能出售，例如禁止把“修真功法”“血脉觉醒法”“内功心法”直接生成技能。\n'
            + '【严格输出格式】\n'
            + '仅输出 YAML 文本, 不要解释、不要 markdown 代码围栏。顶层为六个列表键: 血统列表 / 形态列表 / 技能列表 / 装备列表 / 道具列表 / 升级列表, 每项以 "  - " 开头。\n'
            + '字段类型必须严格遵守:\n'
            + '  - 层级: 字符串, 仅可选 Ⅰ / Ⅱ / Ⅲ / Ⅳ / Ⅴ / Ⅵ / Ⅶ / Ⅷ / Ⅸ\n'
            + '  - 品质: 字符串, 仅可选 F / E / D / C / B / A / S / SS / SSS\n'
            + '  - 标签: 行内数组 [\'标签1\', \'标签2\'...]\n'
            + '  - 原始属性: 行内对象，定档遵循《品质效果数值规则》；血统必须完整包含五维（力量、敏捷、体质、精神、魅力），【形态】必须完整包含五维并附加相关【衍生属性】，装备仅写有效非0项。\n'
            + '  - 效果: 行内对象 {效果名: \'描述\'}, 键为字符串, 值为字符串描述\n'
            + '  - 价格: 数字(空间币)\n'
            + '  - 描述/消耗: 字符串\n'
            + '  - 类型:\n'
            + '      技能列表.类型 = 数字 0(主动) / 1(被动) / 2(特殊)\n'
            + '      装备列表.类型 = 数字 0(武器) / 1(手套) / 2(头部) / 3(胸部) / 4(腿部) / 5(鞋子) / 6(披风) / 7(饰品)\n'
            + '      道具列表.类型 = 字符串(消耗品/材料/特殊等, 同类型需复用且不得细分)\n'
            + '  - 替换目标: 字符串 (仅【升级列表】内商品必填，必须与玩家当前拥有的原物品名称一字不差！)\n'
            + '  - 所属大类: 字符串 (仅【升级列表】内商品必填，仅限填写: 血统 / 形态 / 技能 / 装备)\n'
            + '  - 道具列表.数量 = 数字(该商品可购入的库存份数, ≥1)\n'
            + '对象键禁止使用英文句点，口径类X.Ymm统一写作X·Y（例：5.56mm弹药→5·56弹药）;\n'

        // —— 用户提示词: 玩家上下文 + 需求 + 输出模板示例 ——
        // ★ 多角色: 上下文以当前选中角色为准; AI据此为该角色量身生成商品/升级方案
        var playerCtx = shopBuildPlayerContext(sd, shopCurrentActor);
        var userPrompt = '\n【当前角色数据】\n' + (playerCtx || '(无)') + '\n';
        userPrompt += '\n【输出结构】\n以下内容仅演示字段格式，具体档位按商品定位生成。\n'
            + '血统列表:\n'
            + '  - 名称: 血统名\n'
            + '    品质: E\n'
            + '    标签: ["主神空间", "强化"]\n'
            + '    原始属性: {"力量": "C", "敏捷": "F", "体质": "D", "精神": "E", "魅力": "F"}\n'
            + '    效果: {体能充沛: 基础生命恢复速度小幅提升}\n'
            + '    描述: 简短描述\n'
            + '    价格: 450\n'
            + '技能列表:\n'
            + '  - 名称: 技能名\n'
            + '    品质: F\n'
            + '    类型: 0\n'
            + '    标签: ["主神空间", "被动"]\n'
            + '    效果: {射击校准: 射击检定+5}\n'
            + '    描述: 简短描述\n'
            + '    消耗: 无\n'
            + '    价格: 80\n'
            + '装备列表:\n'
            + '  - 名称: 装备名\n'
            + '    品质: D\n'
            + '    类型: 0\n'
            + '    标签: ["主神空间", "科技"]\n'
            + '    原始属性: {"ATK": "C", "敏捷": "F"}\n'
            + '    效果: {射击稳定: 连续射击检定+15}\n'
            + '    描述: 简短描述\n'
            + '    消耗: 无\n'
            + '    价格: 3000\n'
            + '道具列表:\n'
            + '  - 名称: 道具名\n'
            + '    品质: F\n'
            + '    类型: 消耗品\n'
            + '    数量: 3\n'
            + '    标签: ["主神空间", "辅助"]\n'
            + '    效果: {急救: 恢复10HP}\n'
            + '    描述: 简短描述\n'
            + '    价格: 50\n'
            + '形态列表:\n'
            + '  - 名称: 形态名称\n'
            + '    层级: {按形态自身战斗位格生成，Ⅰ－Ⅸ}\n'
            + '    消耗: HP/EP/特殊资源\n'
            + '    状态: 完好\n'
            + '    标签: ["主神空间", 依赖的道具/血统/来源等]\n'
            + '    原始属性: {基础属性/衍生属性: 品质}\n'
            + '    效果: { [词条]: 描述 }\n'
            + '    技能: {\n'
            + '     - 名称: 技能名\n'
            + '       品质: F\n'
            + '       类型: 0\n'
            + '       标签: ["主神空间", "被动"]\n'
            + '       效果: {射击校准: 射击检定+5}\n'
            + '       描述: 简短描述\n'
            + '       消耗: 无}\n'
            + '    描述: 简短描述\n'
            + '    价格: 300\n'
            + '升级列表:\n'
            + '  - 名称: 进阶装备/技能/血统/形态名称 (例: M16A2突击步枪·改)\n'
            + '    替换目标: 原有物品确切名称 (例: M16A2突击步枪)\n'
            + '    所属大类: 装备 (必填: 血统/技能/装备/形态)\n'
            + '    层级: Ⅰ\n'
            + '    品质: E\n'
            + '    类型: 0\n'
            + '    标签: ["主神空间", "科技", "升级"]\n'
            + '    原始属性: {"ATK": "C", "敏捷": "E"}\n'
            + '    效果: {精密射击: 瞄准射击检定+10}\n'
            + '    描述: 回收旧型号进行重铸升阶后的成品\n'
            + '    消耗: 无\n'
            + '    价格: 300\n'
// 🌟 核心优化：动态结尾指令
if (hasReq) {
    userPrompt += '\n【本次核心商品需求】\n  ' + reqText + '\n';
    userPrompt += '\n现在请基于上述核心需求进行精准检索与配套生成（允许部分列表为空），仅输出 YAML:\n';
} else {
    userPrompt += '\n现在请执行商城日常刷新，仔细检阅玩家数据生成升级方案。仅输出 YAML:\n';
}
            // console.log('系统提示词:', sysPrompt, '\n用户提示词:', userPrompt);
        shopCallAI(sysPrompt, userPrompt).then(function (out) {
            // 回合校验: 用户点了"停止刷新"或重发起一次新刷新时 epoch 已变, 丢弃这次迟到结果
            if (myEpoch !== shopRefreshEpoch || !shopRefreshing) return;
            var parsed = shopParseMarketText(out);
            // 统计生成数量
            var total = (parsed.血统列表.length + parsed.技能列表.length + parsed.装备列表.length + parsed.道具列表.length + parsed.升级列表.length + parsed.形态列表.length);
            if (total === 0) {
                // 解析失败: 退出刷新中态, 恢复原列表显示, 弹提示
                shopRefreshing = false;
                renderAll();
                samToast('error', 'AI返回内容无法解析为商品, 已恢复原商品列表');
                return;
            }
            // ★ 写回 当前角色的专属商库(商城.成员商库.<角色名>); 不影响其他角色的商库
            //   角色键沿用旧顶层结构时迁入 成员商库.角色, 以实现多角色隔离
            var refreshActor = shopCurrentActor || SHOP_ACTOR_REINCARNATOR;
            var ok = writeBackMvu(function (statData) {
                if (!statData.商城 || typeof statData.商城 !== 'object') statData.商城 = {};
                var market = statData.商城;
                // 懒初始化 成员商库
                if (!market[SHOP_ACTOR_LIB_KEY] || typeof market[SHOP_ACTOR_LIB_KEY] !== 'object') {
                    market[SHOP_ACTOR_LIB_KEY] = {};
                }
                var libMap = market[SHOP_ACTOR_LIB_KEY];
                // 角色首次迁入: 将旧顶层扁平商库作为角色初始库存(仅当尚未存在角色键时)
                if (refreshActor === SHOP_ACTOR_REINCARNATOR && !libMap[SHOP_ACTOR_REINCARNATOR]) {
                    var oldTop = null;
                    if (Array.isArray(market.血统列表) || Array.isArray(market.技能列表)
                        || Array.isArray(market.装备列表) || Array.isArray(market.道具列表) || Array.isArray(market.升级列表) || Array.isArray(market.形态列表)) {
                        oldTop = {
                            血统列表: Array.isArray(market.血统列表) ? market.血统列表 : [],
                            技能列表: Array.isArray(market.技能列表) ? market.技能列表 : [],
                            装备列表: Array.isArray(market.装备列表) ? market.装备列表 : [],
                            道具列表: Array.isArray(market.道具列表) ? market.道具列表 : [],
                            升级列表: Array.isArray(market.升级列表) ? market.升级列表 : [],
                            形态列表: Array.isArray(market.形态列表) ? market.形态列表 : []
                        };
                    }
                    libMap[SHOP_ACTOR_REINCARNATOR] = oldTop || { 血统列表:[], 技能列表:[], 装备列表:[], 道具列表:[], 升级列表:[], 形态列表:[] };
                    // 清除旧顶层冗余字段, 统一迁移到成员商库
                    delete market.血统列表;
                    delete market.技能列表;
                    delete market.装备列表;
                    delete market.道具列表;
                    delete market.升级列表;
                    delete market.形态列表;
                }
                // 写入当前角色的新刷新结果(整库覆盖)
                libMap[refreshActor] = {
                    血统列表: parsed.血统列表,
                    技能列表: parsed.技能列表,
                    装备列表: parsed.装备列表,
                    道具列表: parsed.道具列表,
                    升级列表: parsed.升级列表,
                    形态列表: parsed.形态列表
                };
            });
            // 退出刷新中态
            shopRefreshing = false;
            if (ok) {
                shopMarketData = null;   // 触发 renderAll 时从 stat_data 重新归一化
                shopCart = [];
                shopActiveTab = '';
                shopActiveSlot = '';
                renderAll();
                samToast('success', '商品列表已刷新, 共生成 ' + total + ' 件商品');
            } else {
                renderAll();
                samToast('error', '商品已生成但MVU写回失败, 已恢复原商品列表');
            }
        }).catch(function (e) {
            // 失败: 退出刷新中态, 恢复原商品列表显示, 弹提示
            if (myEpoch !== shopRefreshEpoch) return;  // 已被打断, 不再处理失败
            shopRefreshing = false;
            renderAll();
            samToast('error', 'AI生成失败, 已恢复原商品列表: ' + (e && e.message ? e.message : e));
        });
    }
    /* 32d-6. 停止刷新: 用户在"正在刷新…"态点击停止按钮时调用
       - 立即解除 shopRefreshing 锁定, renderAll 恢复刷新按钮可用 + 原商品列表显示
       - 通过推进 shopRefreshEpoch 让已在飞行中的旧 Promise 回调在回合校验处自动丢弃结果,
         AI 迟到的回复不会再覆盖用户当前操作或写入 商城 */
    function shopStopRefresh() {
        if (!shopRefreshing) return;
        shopRefreshEpoch += 1;          // 让旧回调回合不匹配 → 丢弃返回结果
        shopRefreshing = false;
        renderAll();
        samToast('warning', '已停止商品刷新, 可重新点击「刷新商品」');
    }
    /* 32d-7. 停止融合: 用户在"血统融合进行中…"态点击停止按钮时调用
       - 立即解除 bloodFusionBusy 锁定, renderAll 恢复可发起融合
       - 通过推进 bloodFusionEpoch 让已在飞行中的旧 Promise 回调在回合校验处自动丢弃结果,
         AI 迟到的回复不会再覆盖血统库/升级列表/形态库
       - 若本次为商城血统融合(开始时已扣币+删除商品库), 需回滚 bloodFusionSnap 还原空间币+商品库 */
    function bloodFusionStop() {
        if (!bloodFusionBusy) return;
        bloodFusionEpoch += 1;          // 让旧回调回合不匹配 → 丢弃返回结果
        bloodFusionBusy = false;
        bloodFusionShopItem = null;
        bloodFusionResult = null;
        bloodFusionConsumedNames = [];
        // 回滚开始时已扣除的空间币与已删除的商品库
        if (bloodFusionSnap) {
            try {
                writeBackMvu(function(statData) {
                    statData.角色 = statData.角色 || {};
                    statData.角色.空间币 = safeNum(statData.角色.空间币, 0) + bloodFusionSnap.price;
                    statData.角色.权限凭证 = statData.角色.权限凭证 || {};
                    shopCredentialRefund(statData.角色.权限凭证, bloodFusionSnap.credentialRequirements || {});
                    if (bloodFusionSnap.preBloodLib !== null && statData.商城) {
                        var _rlibS = shopGetActorLibRaw(statData.商城, bloodFusionSnap.preActor);
                        if (_rlibS) _rlibS.血统列表 = bloodFusionSnap.preBloodLib.slice();
                    }
                });
            } catch(eStop) { try { console.warn('[主神终端] 停止融合回滚异常:', eStop.message); } catch(e2){} }
            // 商店列表本地缓存还原: 让被删除的血统商品回到血统区
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
        samToast('warning', '已停止血统融合, 空间币与商品库已回滚, 可重新发起融合');
    }
    /* 统一处理装备/道具操作 */
    function handleItemAction(action, path, kind, typeStr, key) {
        if (!action || !path) return;
        var type = Number(typeStr);
        var sd = getStatData();
        if (!sd || !sd.角色) { samToast('error', '数据未就绪'); return; }
        var isEquip = (kind === 'equip');
        var dict = isEquip ? (sd.角色.装备 || {}) : (sd.角色.道具 || {});
        var basePath = isEquip ? '角色.装备' : '角色.道具';
        // 删除: 直接从字典移除
        if (action === 'delete') {
            var ok = writeBackMvu(function(statData) {
                var d = isEquip ? (statData.角色.装备||{}) : (statData.角色.道具||{});
                if (d[key] !== undefined) delete d[key];
            });
            if (ok) { samToast('success', (isEquip?'装备':'道具')+'已删除: '+key); renderAll(); }
            else samToast('error', '删除失败: MVU写回不可用');
            return;
        }
        // 目标状态映射
        var targetStatus;
        if (action === 'wear') targetStatus = 1;
        else if (action === 'remove') targetStatus = 0;
        else if (action === 'store') targetStatus = 2;
        else if (action === 'takeback') targetStatus = 0;
        else { samToast('error', '未知操作: '+action); return; }
        // 穿戴前的限制校验 (上限配置来自模块级常量 EQUIP_SLOTS / ITEM_SLOT_CAP)
        if (action === 'wear') {
            if (isEquip) {
                // 查 EQUIP_SLOTS 取该类型 cap: cap>=2 满则拒绝; cap===1 替换同类型已装备; cap===0 无限制
                var slotCfg = null;
                for (var si = 0; si < EQUIP_SLOTS.length; si++) { if (EQUIP_SLOTS[si].type === type) { slotCfg = EQUIP_SLOTS[si]; break; } }
                var cap = slotCfg ? slotCfg.cap : 0;
                var slotLabel = slotCfg ? slotCfg.label : '装备';
                if (cap >= 2) {
                    // 多槽位类型(武器2/饰品2): 满则拒绝
                    var wCount = 0;
                    Object.keys(dict).forEach(function(k){ if (Number(dict[k].类型)===type && Number(dict[k].状态)===1) wCount++; });
                    if (wCount >= cap) { samToast('warning', '身上'+slotLabel+'已满('+cap+'件), 先脱下现有'+slotLabel+'后再尝试'); return; }
                } else if (cap === 1) {
                    // 单槽位类型(手套/头部/.../披风): 替换同类型已装备
                    var replaced = [];
                    Object.keys(dict).forEach(function(k){
                        if (k !== key && Number(dict[k].类型) === type && Number(dict[k].状态) === 1) replaced.push(k);
                    });
                    if (replaced.length > 0) {
                        var okR = writeBackMvu(function(statData) {
                            var d = statData.角色.装备 || {};
                            replaced.forEach(function(k){ if (d[k]) d[k].状态 = 0; });
                            if (d[key]) d[key].状态 = 1;
                        });
                        if (okR) { samToast('success', '已穿戴: '+key+(replaced.length?' (替换:'+replaced.join(',')+')':'')); renderAll(); }
                        else samToast('error', '穿戴失败: MVU写回不可用');
                        return;
                    }
                }
                // cap === 0 (特殊): 无限制, 直接走通用穿戴流程
            } else {
                // 道具战术栏限 ITEM_SLOT_CAP 个
                var iCount = 0;
                Object.keys(dict).forEach(function(k){ if (Number(dict[k].状态)===1) iCount++; });
                if (iCount >= ITEM_SLOT_CAP) { samToast('warning', '身上负重已满('+ITEM_SLOT_CAP+'个道具), 先卸载现有道具后再尝试'); return; }
            }
        }
        // 通用: 设目标状态
        var ok2 = writeBackMvu(function(statData) {
            var d = isEquip ? (statData.角色.装备||{}) : (statData.角色.道具||{});
            if (d[key]) d[key].状态 = targetStatus;
        });
        if (ok2) {
            var actLabel = {wear:'穿戴',remove:'脱下',store:'存放',takeback:'取回'}[action];
            samToast('success', actLabel+'成功: '+key);
            renderAll();
        } else {
            samToast('error', '操作失败: MVU写回不可用');
        }
    }

    /* ===== 32d. 形态激活(写回MVU) ===== */
    function handleFormActivate(formName) {
        if (!formName) return;
        var sd = getStatData();
        if (!sd || !sd.角色) { samToast('error', '数据未就绪'); return; }
        var p = sd.角色;
        var cf = p.当前形态 || {};
        // 已激活的形态(当前生效)不可重复激活
        if (cf.激活 === true && safeStr(cf.名称) === formName) {
            samToast('warning', '该形态已激活: ' + formName);
            return;
        }
        // 冷却未归零不可激活(只有归零才能重新激活)
        var forms = p.形态库 || {};
        var f = forms[formName] || {};
        var cdM = safeStr(f.冷却).match(/^(\d+)\s*\/\s*(\d+)/);
        var cdCur = cdM ? (parseInt(cdM[1], 10) || 0) : 0;
        if (cdCur > 0) {
            samToast('warning', '冷却中, 无法激活: ' + formName + ' (剩余' + cdCur + '回合)');
            return;
        }
        // 写回: 设当前形态 + 该形态冷却2回合(不清理其他形态冷却)
        var ok = writeBackMvu(function(statData) {
            var pp = statData.角色;
            if (!pp) return;
            // 设当前形态
            pp.当前形态 = { 激活: true, 名称: formName };
            // 该形态冷却置为 2/2 回合(不触碰其他形态的冷却)
            var ff = pp.形态库 || {};
            if (ff[formName]) {
                ff[formName].冷却 = '2/2 回合';
            }
            // ★ 前端形态激活 → 记入待播报记录(与本次写回同一落盘, 待正文模型叙事后自动清空)
            shopAppendReceipt(statData, '[变身][角色] 激活形态「' + formName + '」');
        });
        if (ok) {
            samToast('success', '形态已激活: ' + formName + ' (冷却1回合)');
            renderAll();
        } else {
            samToast('error', '激活失败: MVU写回不可用');
        }
    }

    /* ===== 32e. 形态取消激活(写回MVU) ===== */
    function handleFormDeactivate(formName) {
        if (!formName) return;
        var sd = getStatData();
        if (!sd || !sd.角色) { samToast('error', '数据未就绪'); return; }
        var p = sd.角色;
        var cf = p.当前形态 || {};
        // 只有当前激活的就是这个形态才能取消
        if (!(cf.激活 === true && safeStr(cf.名称) === formName)) {
            samToast('warning', '该形态未激活, 无需取消: ' + formName);
            return;
        }
        // 写回: 当前形态设为未激活 + 清空名称(冷却不动, 按原倒数继续走)
        var ok = writeBackMvu(function(statData) {
            var pp = statData.角色;
            if (!pp) return;
            pp.当前形态 = { 激活: false, 名称: '' };
            // ★ 前端形态取消激活 → 记入待播报记录(与本次写回同一落盘, 待正文模型叙事后自动清空)
            shopAppendReceipt(statData, '[变身结束][角色] 取消形态「' + formName + '」');
        });
        if (ok) {
            samToast('success', '已取消形态: ' + formName);
            renderAll();
        } else {
            samToast('error', '取消失败: MVU写回不可用');
        }
    }

    /* ===== 32f. R21-传闻交易: 通用确认弹窗(替代原生 confirm) =====
       samConfirm(title, body, onOk) → 渲染模态框, onOk 在用户点确认时同步调用
    */
    function samConfirm(title, body, onOk) {
        // 复用 #samsara-modal 遮罩层(z-index:1000000, 已带 blur 背景, 高于面板999998)
        // 这样确认框不会被主界面/面板挡住
        var $m = $('#samsara-modal');
        if (!$m.length) { $('body').append('<div id="samsara-modal"></div>'); }
        $m = $('#samsara-modal');
        var box = '<div class="sam-confirm-box">'
            + '<div class="sam-confirm-title">'+esc(title)+'</div>'
            + '<div class="sam-confirm-body">'+esc(body)+'</div>'
            + '<div class="sam-confirm-actions">'
            + '<button type="button" class="sam-confirm-btn cancel">取消</button>'
            + '<button type="button" class="sam-confirm-btn ok">确认</button>'
            + '</div></div>';
        $m.html(box).addClass('open');
        // 按钮点击: 取消/确认 → 关闭弹窗; 确认则回调 onOk
        $m.off('click.samConfirm').on('click.samConfirm', '.sam-confirm-btn', function(e) {
            e.stopPropagation();
            var isOk = $(this).hasClass('ok');
            // 清理 samConfirm 自身全部事件(含遮罩点外关闭), 防止残留到下次复用 #samsara-modal 的 showModal
            $m.off('click.samConfirm').off('click.samConfirmBg');
            $m.removeClass('open').empty();
            if (isOk && typeof onOk === 'function') {
                try { onOk(); } catch(err) { console.error('[主神终端] samConfirm onOk error:', err); }
            }
        });
        // 点遮罩(弹窗外部)取消
        $m.off('click.samConfirmBg').on('click.samConfirmBg', function(e) {
            if (e.target === this) {
                $m.off('click.samConfirm').off('click.samConfirmBg');
                $m.removeClass('open').empty();
            }
        });
    }

    /* ===== 32g. R21-传闻交易: 发送文字到 SillyTavern 输入框 =====
       sendToInputBox(text, autoSend):
         - autoSend=true: 填入并点击发送按钮
         - autoSend=false: 仅追加到输入框(不自动发送), 若已存在则不重复追加
       返回 true=成功, false=未找到输入框
       参考 创世状态栏.txt sendToChat/sendMessageToChat
    */
    function sendToInputBox(text, autoSend) {
        try {
            var win = GS_PARENT || window;
            var $jq = (win.jQuery || window.jQuery || $);
            if (!$jq) return false;
            var $ta = $jq(win.document || document).find('#send_textarea');
            if (!$ta.length) return false;
            if (autoSend) {
                // 自动发送模式: 覆盖输入框 + 触发 input + 点击发送按钮
                var textarea = $ta[0];
                textarea.value = String(text || '');
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                var sendBtn = (win.document || document).getElementById('send_but');
                if (sendBtn) sendBtn.click();
                return true;
            }
            // 追加模式: 不覆盖已有内容, 若已包含相同文本则跳过
            var cur = $ta.val() || '';
            if (cur.indexOf(text) !== -1) return true;
            $ta.val((cur.trim() ? cur + ' ' : '') + text);
            $ta.trigger('input');
            return true;
        } catch (err) {
            console.error('[主神终端] sendToInputBox 失败:', err);
            return false;
        }
    }

    /* ===== 32h. R21-传闻交易: 删除单条传闻(写回MVU) =====
       sectionKey: '街头巷议' | '情报交易' | '布告与檄文'
       name: 传闻的 key(名字)
    */
    function handleRumorDelete(sectionKey, name) {
        if (!sectionKey || !name) return;
        var ok = writeBackMvu(function(statData) {
            if (!statData || !statData.传闻 || !statData.传闻[sectionKey]) return;
            if (statData.传闻[sectionKey][name]) {
                delete statData.传闻[sectionKey][name];
                try { console.log('%c[主神终端] ✅ 传闻已删除: '+sectionKey+'/'+name, 'color:#86efac'); } catch(e){}
            }
        });
        if (ok) { samToast('success', '已删除传闻: ' + name); renderAll(); }
        else samToast('error', '删除失败: MVU写回不可用');
    }

    /* ===== 32i. R21-传闻交易: 清空指定分类的全部传闻(写回MVU) ===== */
    function handleRumorClearSection(sectionKey) {
        if (!sectionKey) return;
        var ok = writeBackMvu(function(statData) {
            if (!statData || !statData.传闻) return;
            statData.传闻[sectionKey] = {};
            try { console.log('%c[主神终端] ✅ 已清空传闻分类: '+sectionKey, 'color:#86efac'); } catch(e){}
        });
        if (ok) { samToast('success', '已清空分类: ' + sectionKey); renderAll(); }
        else samToast('error', '清空失败: MVU写回不可用');
    }

    /* ===== 32j. R21-传闻交易: 删除全部传闻(街头巷议+情报交易+布告与檄文) ===== */
    function handleRumorClearAll() {
        var ok = writeBackMvu(function(statData) {
            if (!statData || !statData.传闻) return;
            statData.传闻 = { 街头巷议: {}, 情报交易: {}, 布告与檄文: {} };
            try { console.log('%c[主神终端] ✅ 已删除全部传闻', 'color:#86efac'); } catch(e){}
        });
        if (ok) { samToast('success', '已删除全部传闻'); renderAll(); }
        else samToast('error', '删除失败: MVU写回不可用');
    }

    /* ===== 33. 保存编辑(写回MVU) ===== */
    function saveEdits() {
        var $panel = $('#samsara-panel');
        var $modal = $('#samsara-modal'); // ★ modal 内(NPC档案编辑等)也有输入框, 一并扫描
        var changes = [];
        // 先把仍在编辑态(没失焦)的输入框暂存进pendingEdits
        $panel.find('.sam-edit-active').each(function() { flushStagedDisplay($(this)); });
        $modal.find('.sam-edit-active').each(function() { flushStagedDisplay($(this)); });
        // ★ 职业结构化编辑器: 焦点仍在卡片内时也需暂存, 重组所有容器
        $panel.find('.sam-occ-edit').each(function() { occReassemble($(this)); });
        $modal.find('.sam-occ-edit').each(function() { occReassemble($(this)); });
        // 从pendingEdits收集变更(点击即编辑的暂存区)
        Object.keys(pendingEdits).forEach(function(path) {
            if (isReadonlyPath(path)) return;
            changes.push({ path: path, val: pendingEdits[path].val });
        });
        // toggle 字段(开关也写进pendingEdits了, 兜底再扫一次; modal 内 NPC 档案的开关同样收集)
        $panel.add($modal).find('.sam-toggle-switch[data-toggle="field"]').each(function() {
            var $el = $(this);
            var path = $el.data('path');
            if (!path) return;
            if (isReadonlyPath(path)) return;
            if (pendingEdits[path]) return; // 已暂存则跳过
            changes.push({path: path, val: $el.hasClass('on')});
        });
        if (changes.length === 0) {
            try { console.log('%c[主神终端] 无变更', 'color:#8b95a6'); } catch(e){}
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
                    // ★ 职业已改为记录对象: 编辑模式下以JSON文本提交, 写回前尝试还原为对象
                    if (/^(?:角色|关系列表\.[^.]+)\.职业$/.test(c.path) && typeof v === 'string') {
                        var trimmed = v.trim();
                        if (trimmed === '') { v = {}; }
                        else { try { v = JSON.parse(trimmed); } catch(e2) { /* 非法JSON保留原字符串,ZOD层会拒绝并回退 */ } }
                    }
                    if (_ && _.set) _.set(statData, c.path, v);
                    else setByPathFallback(statData, c.path, v);
                } catch(e) { console.warn('[主神终端] 写入路径失败:', c.path, e); }
            });
        });
        if (ok) {
            pendingEdits = {};
            // 退出编辑模式
            setEditMode(false);
            closeModal();
            setTimeout(renderAll, 300);
        } else {
            showModal('保存失败', '<div class="sam-empty">MVU写回API不可用,请检查环境</div>');
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

    /* ===== 34. 启动器 ===== */
    function init() {
        initSamsaraCSS();
        initSamsaraDOM();
        // 仅共享调用能力，密钥仍由终端管理。面板交接不修改正式开关。
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
        // ★ 防抖刷新: 500ms 内多次事件只触发一次 renderAll
        //   - 留时间给"辅助计算脚本"重算属性(避免读到旧值)
        //   - 合并连续事件(删多层/连续swipe/多次变量更新)避免逐次重绘卡顿
        //   - renderAll 为纯读, 不写回 MVU, 故无死循环风险
        var _refreshTimer = null;
        var debouncedRefresh = function() {
            if (_refreshTimer) clearTimeout(_refreshTimer);
            _refreshTimer = setTimeout(function() {
                _refreshTimer = null;
                if ($('#samsara-panel').hasClass('open') && !isEditMode()) renderAll();
            }, 500);
        };
        try {
            // 1) MVU 变量更新结束 → 刷新(原 updateFunc, 改用防抖版)
            if (win && win.Mvu && win.Mvu.events) {
                $(document).off('VARIABLE_UPDATE_ENDED.sam');
                $(document).on('VARIABLE_UPDATE_ENDED.sam', debouncedRefresh);
                if (typeof eventOn === 'function') eventOn(win.Mvu.events.VARIABLE_UPDATE_ENDED, debouncedRefresh);
            }
            // 2) 酒馆原生事件: 删楼层/切swipe/切聊天 → MVU 快照回退或切换, 需刷新
            //    MVU 事件体系只覆盖"变量更新", 不覆盖"楼层变更", 故须补酒馆事件
            if (typeof tavern_events !== 'undefined') {
                if (tavern_events.MESSAGE_DELETED && typeof eventOn === 'function') eventOn(tavern_events.MESSAGE_DELETED, debouncedRefresh);
                if (tavern_events.MESSAGE_SWIPED  && typeof eventOn === 'function') eventOn(tavern_events.MESSAGE_SWIPED,  debouncedRefresh);
                if (tavern_events.CHAT_CHANGED    && typeof eventOn === 'function') eventOn(tavern_events.CHAT_CHANGED,    debouncedRefresh);
            }
        } catch (e) {}
        // DOM守护定时器: 球/面板被移除则重建
        window.samsaraGuardTimer = setInterval(function() {
            if (!document.getElementById('samsara-ball') || !document.getElementById('samsara-panel')) {
                initSamsaraDOM();
                renderAll();
                if (GS_PARENT.Samsara.worldEngine && GS_PARENT.Samsara.worldEngine.isOpen()) GS_PARENT.Samsara.terminal.suspend();
            }
        }, 15000);
        if (GS_PARENT.Samsara.worldEngine && GS_PARENT.Samsara.worldEngine.isOpen()) GS_PARENT.Samsara.terminal.suspend();
        try { (window.parent || window).__悬浮球状态栏_loaded__ = true; } catch(e) { window.__悬浮球状态栏_loaded__ = true; }
        // 注: 数据刷新定时器已移至 renderAll() 的"终端未响应"分支内按需启动, 收到数据后自动清除, 避免无谓刷新影响滚动与性能
        try { console.log('%c[主神终端] ✅ v2 初始化完成,监听因果链...', 'color:#86efac;font-weight:bold'); } catch(e){}
    }

    (function bootstrap() {
        if ($ && document.body) init();
        else setTimeout(bootstrap, 200);
    })();

    try { $(window).on('unload.sam', samPreClean); } catch (e) {}
})();
