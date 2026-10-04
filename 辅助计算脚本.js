// 辅助计算脚本唯一开发源码由 src/Calculator 生成。
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
            try { console.warn('[辅助计算脚本] 热更新预清理失败:', error && error.message ? error.message : error); } catch (_) {}
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

    /**
     * 写回 MVU：把对 stat_data 的修改通过 Mvu.replaceMvuData 正式落库
     *   - 用于 CHARACTER_MESSAGE_RENDERED 等"非 VARIABLE_UPDATE_ENDED"回调：
     *     这类回调里 getStatData() 返回的 stat_data 不保证是 MVU 主存储的同一引用对象，
     *     原地改字段不会持久化到数据库，必须走 replaceMvuData 正式写回 message/chat 通道。
     *   - mutator(sd) 在深拷贝的副本上执行修改，避免污染 MVU 内存快照。
     *   - 不广播 VARIABLE_UPDATE_ENDED：结算清理改的是剧情/世界/任务数据，无需触发属性重算，
     *     也避免 onUpdateData 在结算中途跑导致的 schema reconciliation 风险。
     *   - 实现与 悬浮球状态栏.js 的 writeBackMvu 对齐(仅去掉事件广播)。
     * @param {(sd:object)=>void} mutator 修改器，接收 stat_data 副本
     * @returns {boolean} 是否写回成功
     */
    function writeBackMvu(mutator) {
        try {
            var win = getMvuGlobal();
            if (!win || !win.Mvu || typeof win.Mvu.getMvuData !== 'function' || typeof win.Mvu.replaceMvuData !== 'function') {
                console.warn('[辅助计算脚本] MVU写回API不可用，修改未落库');
                return false;
            }
            var mvuData = win.Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            if (!mvuData || !mvuData.stat_data) {
                console.warn('[辅助计算脚本] 无可写数据，修改未落库');
                return false;
            }
            // 深拷贝副本，在副本上改，再整体写回(走正式通道，确保落库)
            var cloned = (typeof _ !== 'undefined' && _ && _.cloneDeep) ? _.cloneDeep(mvuData) : JSON.parse(JSON.stringify(mvuData));
            if (typeof mutator === 'function') mutator(cloned.stat_data);
            // 写回 message 通道
            win.Mvu.replaceMvuData(cloned, { type: 'message', message_id: 'latest' });
            // 同步 chat 通道
            try { win.Mvu.replaceMvuData(cloned, { type: 'chat' }); } catch (e2) {}
            return true;
        } catch (e) {
            console.error('[辅助计算脚本] 写回MVU失败:', e);
            return false;
        }
    }

    /** 是否已初始化日志 */
    let isInitLog = false;
    /**
     * 防重入标志：防止脚本修改 stat_data 后触发 schema reconciliation
     * 再次进入 VARIABLE_UPDATE_ENDED 导致无限循环
     */
    let isProcessing = false;
    /**
     * 正文楼层级回合防重，仅保存在脚本内存，不写入 MVU。
     * 同一 AI 正文楼层产生的世界推进、UI、schema 等额外变量写回，都不能重复消耗状态或冷却。
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
     * 核心函数：在 stat_data 更新完成后执行，进行数值计算和属性更新
     * @param {*} rawVariables 原始变量
     * @param {*} rawVariablesBefore 之前的原始变量
     */
    function onUpdateData(rawVariables, rawVariablesBefore) {
        // 防重入：如果正在处理中，直接跳过
        if (isProcessing) {
            return;
        }
        isProcessing = true;
        
        try {
            /** 当前数据 */
            const statData = rawVariables?.stat_data;
            /** 之前的当前数据 */
            const statDataBefore = rawVariablesBefore?.stat_data;

            if (!statData) return;

            // ★ 关系列表是普通角色是否继续受后台人物调度的生命周期信号。
            //   明确从关系列表删除的角色，同步从 世界.后台.人物 删除，避免继续占用世界推进上下文；异端雷达独立管理，不在此处修改。
            syncRemovedRelationshipPeople(statData, statDataBefore);
            // 资产删除与重新建立同样走程序生命周期墓碑。
            syncRemovedAssets(statData, statDataBefore);
            // ★ 异端生命周期独立于普通关系列表：死亡不可逆；死亡后同时退休关系实体和后台人物活动，雷达保留死亡记录。
            syncAlienLifecycle(statData, statDataBefore);

            // ★ 任务生成当层整块锁：任何后续计算前先恢复美化器权威快照。
            //   只影响 任务.列表 / 任务.副本成就，不影响 任务.击杀 与其他变量。
            guardTaskGenerationLock(statData);

            // ★ 后续楼层任务委托方守卫：只保护主神任务 / 晋升试炼的委托方。
            guardPersistedSystemTaskOwner(statData, statDataBefore);

            const users = statData.角色;
            if (!users) return;

            // 状态时长、战斗轮次与冷却只按“新 AI 正文楼层”推进一次。
            // 世界推进、UI 操作、schema reconciliation 等同楼层二次写回只做数据一致性计算，不再消耗回合。
            const turnMessageKey = currentAssistantTurnKey();
            const uiMutation = isUIMutationActive();
            let shouldAdvanceTurn = false;
            if (turnMessageKey) {
                if (!lastTurnMessageKey) lastTurnMessageKey = turnMessageKey;
                else shouldAdvanceTurn = !uiMutation && turnMessageKey !== lastTurnMessageKey;
            }

            // ★ 先回滚受保护字段，再执行后续计算
            guardProtectedFields(statData, statDataBefore);

            // ★ 原住民NPC位格/血统品质压制: 新登场原住民 层级/血统品质超出 世界.位格 → 压回世界位格
            //   (主神空间中不压制; 角色/穿越者/守护者/织梦者/篡夺者/残魂 等特殊身份不压制)
            clampNativeNpcToWorldTier(statData, statDataBefore);
            applyNewNpcDifficulty(statData, statDataBefore);

            // 初始化日志（只打印一次）
            if (!isInitLog) {
                isInitLog = true;
            }

            // 重算所有角色属性（传入 before 供 NPC 群体 THP/数量同步判断）
            recalcAllCharacters(statData, statDataBefore);

            // ★ 角色普升检测：五维阶位累计≥24 → 系统状态.是否可试炼=true/false
            //   必须在 recalcAllCharacters 之后执行(依赖最终属性已结算+层级截断)
            if (statData.角色 && statData.系统状态) {
                checkTrialEligibility(statData.角色, statData.系统状态);
            }

            // 插入：功法熟练度守卫 (模块4)
            // guardProficiency(statData.角色);

            // 插入：伴生神器自动成长 (模块3)
            // processArtifactGrowth(statData.角色);

            // 插入：真实游玩天数推进 (世界.时间日期变动 → 系统状态.游玩天数+1)
            updatePlayDays(statData);

            // 插入：全自动收菜系统 (模块1, 改由游玩天数轴驱动, 免疫副本时间跳跃)
            autoHarvestAssets(statData, statDataBefore);

            // 【新增】：执行三大后台清理逻辑
            const isCombat = statData.系统状态?.是否战斗中 === true;

            // 1. 清理角色的道具和状态
            if (statData.角色) {
                cleanupZeroQuantityItems(statData.角色);
                if (shouldAdvanceTurn) {
                    processStatusDuration(statData.角色, isCombat);
                }
            }
            
            // 2. 清理 NPC 的道具和状态
            if (statData.关系列表) {
                Object.values(statData.关系列表).forEach(npc => {
                    if (!npc) return;
                    cleanupZeroQuantityItems(npc);
                    if (shouldAdvanceTurn) {
                        processStatusDuration(npc, isCombat);
                    }
                });
                
                // 3. 清理已死亡的 NPC
                cleanupDeadNPCs(statData);
            }

            // 4. 世界稳定值自动推演 (模块9)
            calcWorldStability(statData);

            // 5. 战斗轮次与形态冷却全自动管理 (模块10)
            if (shouldAdvanceTurn) {
                processCombatAndCooldowns(statData, statDataBefore);
                // 只有消费型回合逻辑完整执行后才记住本楼，异常时允许同楼重试。
                lastTurnMessageKey = turnMessageKey;
            }

        } finally {
            isProcessing = false;
        }
    };

    // ===== 轻量路径工具(供数据守卫使用) =====
    /** 按 a.b.c 路径读取嵌套值 */
    function getByPath(obj, path) {
        return path.split('.').reduce((o, k) => o?.[k], obj);
    }

    /** 按 a.b.c 路径写入嵌套值(父节点不存在则放弃,不创建) */
    function setByPath(obj, path, value) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur[keys[i]] === undefined) return;
            cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
    }

    /** 变更检测:对象走 JSON 序列化比较,基本类型走 === */
    function hasChanged(oldVal, newVal) {
        if (oldVal === newVal) return false;
        if (typeof oldVal === 'object' && typeof newVal === 'object') {
            return JSON.stringify(oldVal) !== JSON.stringify(newVal);
        }
        return true;
    }

    /** 安全深拷贝(优先 lodash,回退 JSON) */
    function clonePlainValue(value) {
        if (value === undefined) return undefined;
        if (typeof _ !== 'undefined' && _?.cloneDeep) return _.cloneDeep(value);
        return JSON.parse(JSON.stringify(value));
    }

    /**
     * 关系列表删除 → 世界后台人物同步退休。
     * 只响应“上一状态存在、当前状态消失”的明确删除，不清理从未进入关系列表的纯场外NPC。
     * 世界.异端雷达.名单是独立生命周期，绝不在此函数中修改。
     */
    function syncRemovedRelationshipPeople(statData, statDataBefore) {
        if (!statData || !statDataBefore) return [];
        const beforeRelations = statDataBefore.关系列表;
        const currentRelations = statData.关系列表;
        const backendPeople = statData.世界?.后台?.人物;
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
            // 只有唯一规范化匹配时才自动删除，避免名称碰撞误伤其他角色。
            if (matches.length === 1) {
                delete backendPeople[matches[0]];
                deleted.push(matches[0]);
            }
        });

        if (deleted.length) {
            console.log('[后台人物同步] 关系列表已删除角色，人物管理同步退休：' + deleted.join('、'));
        }
        return deleted;
    }

    /**
     * 异端生命周期守卫。
     * - 雷达已死亡不可逆，拒绝被后续模型改回活跃。
     * - 关系实体 HP<=0 或状态明确死亡时，同步雷达=死亡。
     * - 死亡异端从关系列表与世界.后台.人物同步删除，避免正文继续发送、世界引擎继续活动；雷达死亡记录保留。
     */
    function syncAlienLifecycle(statData, statDataBefore) {
        const roster = statData?.世界?.异端雷达?.名单;
        if (!roster || typeof roster !== 'object' || Array.isArray(roster)) return { 死亡: [], 删除关系: [], 删除后台: [] };

        const beforeRoster = statDataBefore?.世界?.异端雷达?.名单 || {};
        const relations = statData.关系列表 && typeof statData.关系列表 === 'object' ? statData.关系列表 : {};
        const backendPeople = statData.世界?.后台?.人物 && typeof statData.世界.后台.人物 === 'object' ? statData.世界.后台.人物 : {};
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
            const statuses = npc.状态 && typeof npc.状态 === 'object' ? Object.keys(npc.状态) : [];
            return statuses.some(key => String(key).includes('死亡'));
        };

        const report = { 死亡: [], 删除关系: [], 删除后台: [] };
        for (const [alienName, alien] of Object.entries(roster)) {
            if (!alien || typeof alien !== 'object') continue;
            const previousName = uniqueMatch(beforeRoster, alienName);
            const wasDead = previousName && beforeRoster[previousName]?.状态 === '死亡';
            const relationName = uniqueMatch(relations, alienName);
            const npc = relationName ? relations[relationName] : null;

            if (wasDead && alien.状态 !== '死亡') {
                alien.状态 = '死亡';
                console.warn('[异端生命周期] ' + alienName + ' 已死亡，拒绝恢复为活跃。');
            }
            if (alien.状态 !== '死亡' && relationDead(npc)) {
                alien.状态 = '死亡';
                console.log('[异端生命周期] ' + alienName + ' 已由角色死亡事实同步为死亡。');
            }
            if (alien.状态 !== '死亡') continue;

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
     * 读取当前楼层之前最近一份真正包含 任务.列表 的 MVU 消息快照。
     * 不依赖 VARIABLE_UPDATE_ENDED 的 rawVariablesBefore：酒馆在部分额外变量更新时，
     * before 参数未必等价于“上一楼层已经落库的数据”。
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
                    const list = stat?.任务?.列表;
                    if (!list || typeof list !== 'object') continue;
                    return list;
                } catch (e) {}
            }
        } catch (e) {
            console.warn('[任务委托方守卫] 读取上一楼层任务快照失败:', e);
        }
        return null;
    }

    /**
     * 后续楼层任务委托方守卫。
     * 唯一保护字段：委托方。
     * 上一楼层真实 MVU 快照中属于 主神任务 / 晋升试炼 的同名任务，
     * 当前楼层无论 AI 把委托方改成什么，都恢复原委托方；其它字段完全不干预。
     */
    function guardPersistedSystemTaskOwner(statData, statDataBefore) {
        if (!statData) return false;

        // 优先使用上一楼层真正落库的 MVU；仅在无法取得时回退事件 before 参数。
        const previousList = readPreviousMessageTaskList() || statDataBefore?.任务?.列表;
        const currentList = statData?.任务?.列表;
        if (!previousList || typeof previousList !== 'object') return false;
        if (!currentList || typeof currentList !== 'object') return false;

        let repaired = false;
        Object.entries(previousList).forEach(([taskName, oldTask]) => {
            if (!oldTask || typeof oldTask !== 'object') return;
            const oldOwner = String(oldTask.委托方 || '').trim();
            if (oldOwner !== '主神任务' && oldOwner !== '晋升试炼') return;

            const currentTask = currentList[taskName];
            if (!currentTask || typeof currentTask !== 'object') return;

            const newOwner = String(currentTask.委托方 || '').trim();
            if (newOwner === oldOwner) return;

            // 只恢复委托方；状态、目标、奖励、难度、惩罚等全部保留 AI 当前更新结果。
            currentTask.委托方 = oldTask.委托方;
            repaired = true;
            console.warn(`[任务委托方守卫] ${taskName}.委托方 被修改为 ${newOwner || '(空)'}, 已按上一楼层MVU恢复为 ${oldOwner}`);
        });

        return repaired;
    }

    /**
     * 任务生成当层整块镜像锁。
     * 主神任务/试炼任务美化器在当前消息完成任务赋值后，把完整的
     * 任务.列表 与 任务.副本成就 快照保存在 __samsaraTaskGenerationLock。
     * 同一 message_id 的额外变量更新无论修改字段、删除、改名或新增近似任务，
     * 都直接以该快照整块覆盖；进入下一条消息时锁自动清除。
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

        // 单一世界从数据层就不允许存在副本成就。即使旧版本任务锁仍携带成就快照，
        // 也只能恢复任务列表，不能把副本成就重新带回当前世界。
        const singleWorld = statData?.设置?.单一世界 === true;
        let singleWorldAchievementClear = false;
        if (singleWorld) {
            if (!statData.任务 || typeof statData.任务 !== 'object') statData.任务 = {};
            const currentAchievements = statData.任务.副本成就;
            if (currentAchievements && typeof currentAchievements === 'object' && Object.keys(currentAchievements).length) {
                statData.任务.副本成就 = {};
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
        // 取不到楼层号时宁可暂时保留锁，也不做可能跨层的恢复。
        if (currentMessageId === null) return false;

        if (Number(lock.messageId) !== Number(currentMessageId)) {
            clearTaskGenerationLock(lock);
            return false;
        }

        if (!statData.任务 || typeof statData.任务 !== 'object') statData.任务 = {};

        const oldList = statData.任务.列表 || {};
        const oldAchievements = statData.任务.副本成就 || {};
        const expectedAchievements = singleWorld ? {} : (lock.achievements || {});
        const listChanged = hasChanged(oldList, lock.taskList);
        const achievementsChanged = hasChanged(oldAchievements, expectedAchievements);

        // 整块恢复而非逐字段修补：任务名只改一两个字后新增的近似任务，也会被直接清掉。
        statData.任务.列表 = clonePlainValue(lock.taskList) || {};
        statData.任务.副本成就 = clonePlainValue(expectedAchievements) || {};

        if (listChanged || achievementsChanged) {
            console.warn(
                `[任务生成锁] ⚠️ 检测到同层额外变量更新修改任务数据，已整块恢复 ` +
                `(message_id=${currentMessageId}, source=${lock.source || '任务美化器'})`
            );
        }
        return true;
    }

    /**
     * 是否处于“悬浮球UI操作”窗口期。
     * 这里只用于识别合法 UI 字段修改（例如角色进阶），不再承担状态/冷却的回合防重。
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
     * 角色层级"普升通行证"校验
     *   "开始进阶"按钮 writeBackMvu 时会携带 opts.tierPermit=目标层级(如 'Ⅱ'), 写入
     *   win/GS_PARENT/window 的 __samsaraTierPermit。原因: Mvu.replaceMvuData 是异步的,
     *   它自身会再触发一次 VARIABLE_UPDATE_ENDED——该次事件发生时 __samsaraUIMutation 已复位,
     *   层级变化会被 guardProtectedFields 当成 AI 篡改回滚 → 普升"闪一下又降回"。
     *   通行证允许 newVal === permit(仅此一档)时放行层级变化, 并在消费后立刻作废(一次性);
     *   多窗口(win/GS_PARENT/parent/top/window)任一命中即视为有效(与 isUIMutationActive 同策略)。
     *   permit 由悬浮球写入, 20s 后由其兜底清除, 不会长期残留。
     * @param {string} newVal 本次事件里的角色.层级 新值
     * @returns {boolean} 是否放行
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
                    // 一次性消费: 放行后立刻作废, 防止 AI 恰好改到同值也被豁免
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
     * 数据守卫：回滚被 AI 篡改的只读字段 + 规范化新增装备
     * 覆盖 角色 和 关系列表 中的所有在场 NPC
     * @param {object} statData 本次更新后的 stat_data
     * @param {object} statDataBefore 上一帧 stat_data
     */
    function guardProtectedFields(statData, statDataBefore) {
        if (!statDataBefore) return;

        // —— 1. 定义受保护的路径（相对于角色对象） ——
        // 这些字段在 schema 中标注了 readonly: true
        const PROTECTED_RELATIVE_PATHS = [
            'HP_MAX',
            'EP_MAX',
            '最终属性',   // 整个属性对象由后台全量计算，AI 禁止修改
        ];
        // 角色专属受保护路径: 层级仅可由 进阶流程(悬浮球"开始进阶"按钮→writeBackMvu) 修改,
        //   ★ 仅角色受限; NPC 层级允许剧情演进自由变动(如反派突破/成长), 不做守卫
        const REINCARNATOR_ONLY_PROTECTED_PATHS = [
            '层级',
        ];

        // —— 2. 通用的回滚函数：对比并回滚一个角色对象的只读字段 ——
        //   extraPaths: 额外受保护路径(如角色专属的"层级"), 仅调用方指定时生效
        function rollbackProtectedFields(char, charBefore, label, extraPaths) {
            if (!char || typeof char !== 'object') return;
            if (!charBefore || typeof charBefore !== 'object') return;

            for (const path of [...PROTECTED_RELATIVE_PATHS, ...(extraPaths || [])]) {
                const oldVal = getByPath(charBefore, path);
                const newVal = getByPath(char, path);
                if (oldVal !== undefined && hasChanged(oldVal, newVal)) {
                    console.warn(
                        `[变量守卫] ⚠️ ${label} 只读字段被外部修改: ${path} ` +
                        `(${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)})，已回滚`
                    );
                    setByPath(char, path, oldVal);
                }
            }
        }

        // —— 3. 回滚角色 ——
        const user = statData?.角色;
        const userBefore = statDataBefore?.角色;
        if (user && userBefore) {
            // 角色额外保护"层级": 仅进阶流程可改, AI 篡改一律回滚
            //   ★ UI 操作窗口期(悬浮球"开始进阶"按钮→writeBackMvu 广播事件)放行层级变化,
            //     否则合法进阶会被守卫回滚
            //   ★ 普升通行证: replaceMvuData 异步触发的二次 VARIABLE_UPDATE_ENDED 不在
            //     __samsaraUIMutation 窗口期内(标志已复位), 凭 __samsaraTierPermit
            //     (=目标层级, 由"开始进阶"按钮写入, 20s 兜底过期)放行, 覆盖"闪升又降回"缺陷
            const extraReincarnatorPaths = isUIMutationActive()
                ? []
                : (tierPermitAllows(user.层级) ? [] : REINCARNATOR_ONLY_PROTECTED_PATHS);
            rollbackProtectedFields(user, userBefore, '角色', extraReincarnatorPaths);
        }

        // —— 4. 回滚关系列表中的所有在场 NPC ——
        const rel = statData?.关系列表;
        const relBefore = statDataBefore?.关系列表;
        if (rel && typeof rel === 'object' && relBefore && typeof relBefore === 'object') {
            for (const [name, npc] of Object.entries(rel)) {
                if (!npc || typeof npc !== 'object') continue;

                const npcBefore = relBefore[name];
                if (!npcBefore || typeof npcBefore !== 'object') continue;

                rollbackProtectedFields(npc, npcBefore, `NPC:${name}`);
            }
        }

         // —— 5. 新增装备守卫（角色装备，原有逻辑保持不变） ——
        // 仅处理“新增装备”，不动已有装备
        const oldEquip = statDataBefore?.角色?.装备 || {};
        const newEquip = statData?.角色?.装备 || {};
        for (const [equipKey, equipVal] of Object.entries(newEquip)) {
            if (!equipVal || typeof equipVal !== 'object') continue;
            const isNewEquip = oldEquip[equipKey] === undefined;
            if (!isNewEquip) continue;

            // 状态规范化：仅允许 0|1，其余一律归正为 0（未穿戴）
            if (equipVal.状态 !== 0 && equipVal.状态 !== 1) {
                console.warn(
                    `[变量守卫] ⚠️ 新增装备 "${equipKey}" 状态非法(${JSON.stringify(equipVal.状态)})，已归正为 0(未穿戴)`
                );
                equipVal.状态 = 0;
            }

            // 类型校验：应为 0-9 整数，非法仅告警（留待装备计算阶段处理）
            const typeVal = equipVal.类型;
            const isValidType = Number.isInteger(typeVal) && typeVal >= 0 && typeVal <= 9;
            if (!isValidType) {
                console.warn(
                    `[变量守卫] ⚠️ 新增装备 "${equipKey}" 类型非法(${JSON.stringify(typeVal)})，` +
                    `应为 0-9 整数，留待装备计算阶段处理`
                );
            }
        }
    }

    // ===== 属性全量重算（属性面板是只读汇总，由后台统计各来源加值）=====
    // 设计模型（经用户确认）：
    //   1. 属性面板 = 只读汇总。AI 只动血统/装备/技能/状态/形态，后台把加值统计进 属性
    //   2. 五维：血统 + (激活形态) + 已穿戴装备五维 + 状态五维
    //      - 形态激活时形态五维真属性直接累加到血统之上（不再二选一替代血统）
    //      - 未穿戴(状态!==1)装备不参与
    //   3. 衍生属性：公式 + 加值叠加（ATK=(力+敏)/2 + 装备ATK + 形态ATK ...）
    //   4. 检定：仅 先攻DC/防御DC；基础值 + 装备加值（形态无检定字段）
    //   5. 层级(位格)：只读，仅作修正值上限，绝不写回
    //   6. HP/EP：写顶级字段（属性对象全量只读，不在其内写 HP/EP 避免与守卫打架）
    //   注：状态.效果、形态.效果 为字符串，留待第三阶段字符串解析器统一处理

    const ATTR_NAMES = ['力量', '敏捷', '体质', '精神', '魅力'];
    const DERIVED_ATTRS = ['ATK', 'DEF', 'MATK', 'MDEF', 'AP'];
    const CHECK_ATTRS = ['先攻DC', '防御DC'];
    // 装备/形态可能提供的加值键（用于通用累加）
    const BONUS_KEYS = [...DERIVED_ATTRS, ...CHECK_ATTRS];
    // 位格 → 属性修正值上限
    const TIER_MODIFIER_CAPS = {
        'F': 12, 'E': 30, 'D': 60, 'C': 90, 'B': 120,
        'A': 150, 'S': 180, 'SS': 230, 'SSS': 270
    };
    // 品质阶位序列（低 → 高）
    const TIER_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    // 五维键常量（与 ZOD 的 attr5_keys 对齐）
    const attr5_keys_const = ['力量', '敏捷', '体质', '精神', '魅力'];
    // 生命层级（大层级）序列与单维属性加成区间上下限
    //   ★ 大层级只用于【最终单维累加值的截断上限】，不参与品质→数值转换
    const LIFE_TIER_ORDER = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ'];
    // ★ 罗马数字(大层级) ↔ 品质字母 双向映射（两序列各 9 档一一对应）
    //   Ⅰ↔F Ⅱ↔E Ⅲ↔D Ⅳ↔C Ⅴ↔B Ⅵ↔A Ⅶ↔S Ⅷ↔SS Ⅸ↔SSS
    //   AI 有时把品质字母错传成罗马数字（如 力量:Ⅲ），运行期归正用
    const ROMAN_TO_QUALITY = Object.assign({}, ...LIFE_TIER_ORDER.map((r, i) => ({ [r]: TIER_ORDER[i] })));
    const QUALITY_TIER_SET = Object.assign({}, ...TIER_ORDER.map(q => ({ [q]: 1 })));
    const LIFE_TIER_RANGE = {
        'Ⅰ': [1, 29],     'Ⅱ': [30, 99],     'Ⅲ': [100, 299],
        'Ⅳ': [300, 999],  'Ⅴ': [1000, 2999], 'Ⅵ': [3000, 9999],
        'Ⅶ': [10000, 29999], 'Ⅷ': [30000, 99999], 'Ⅸ': [100000, Infinity]
    };
    // ——— 品质字母判定（与 ZOD 的 E_quality 对齐） ———
    //   ★ 兼容 AI 错传罗马数字：'Ⅲ' 等视为品质字母（后续 normalizeTier 会归正为 'D'）
    const QUALITY_STRING_SET = { 'F':1, 'E':1, 'D':1, 'C':1, 'B':1, 'A':1, 'S':1, 'SS':1, 'SSS':1 };
    function isQualityString(v) {
        if (typeof v !== 'string') return false;
        const s = v.trim();
        if (Object.prototype.hasOwnProperty.call(QUALITY_STRING_SET, s.toUpperCase())) return true;
        return Object.prototype.hasOwnProperty.call(ROMAN_TO_QUALITY, s);
    }
    /**
     * 【血统/形态/成长状态 基础属性加成档】（按实体品质锁主区间）
     *   key = 实体品质 ; value = [下限, 上限]
     *   D 级血统: 力量原属性任意品质 → 都在 D 档 120-180 内 9 等分取段
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
     * 【装备与形态基础数值表】（按衍生项类型分列）
     *   列: ATK/MATK | DEF/MDEF | AP(百分点) | 单维属性加成(五维)
     *   key = 列名 ; value = { 品质: [下限, 上限] }
     */
    const EQUIP_QUALITY_RANGE = {
        'ATK':  { 'F':[3,15], 'E':[10,40], 'D':[25,100], 'C':[70,250], 'B':[180,600], 'A':[450,1400], 'S':[1000,3000], 'SS':[2200,6500], 'SSS':[5000,20000] },
        'MATK': { 'F':[3,15], 'E':[10,40], 'D':[25,100], 'C':[70,250], 'B':[180,600], 'A':[450,1400], 'S':[1000,3000], 'SS':[2200,6500], 'SSS':[5000,20000] },
        'DEF':  { 'F':[1,9],  'E':[5,25],  'D':[15,55],  'C':[40,130], 'B':[100,300], 'A':[250,700],  'S':[550,1500],  'SS':[1200,3300], 'SSS':[2600,7000] },
        'MDEF': { 'F':[1,9],  'E':[5,25],  'D':[15,55],  'C':[40,130], 'B':[100,300], 'A':[250,700],  'S':[550,1500],  'SS':[1200,3300], 'SSS':[2600,7000] },
        'AP':   { 'F':[1,15], 'E':[10,30], 'D':[20,45],  'C':[35,65],  'B':[55,90],   'A':[80,120],   'S':[110,150],   'SS':[140,180],   'SSS':[170,220] },
        // 装备单维属性加成(五维)列
        '五维': { 'F':[1,9],  'E':[4,18],  'D':[10,45],  'C':[30,110], 'B':[80,260],  'A':[200,600],  'S':[450,1300],  'SS':[1000,2800], 'SSS':[2200,6000] }
    };
    /**
     * 核心：单项品质字母 → 数值
     *   规则：实体品质 Q 锁定主区间 [lo, hi]；单项品质 q 决定 9 等分中的第几段；
     *         段宽 w=floor((hi-lo)/9)；段起 base=lo + rank(q)*w；值 = base + random(1..w)
     * @param {string} attrTier 单项品质（选段位）：'F'~'SSS'
     * @param {[number,number]} range [下限,上限] 主区间
     * @returns {number}
     */
    function qualitySegValue(attrTier, range) {
        const lo = safeNum(range && range[0], 0);
        const hi = safeNum(range && range[1], lo);
        const span = Math.max(1, hi - lo);
        const w = Math.max(1, Math.floor(span / 9));
        const segBase = lo + tierRank(attrTier) * w;        // 段起点
        return segBase + Math.floor(Math.random() * w) + 1; // 段内随机 [1, w]
    }
    /**
     * 品质字母 → 该项应落到的"档位区间" [下限, 上限]
     *   与 qualitySegValue 同公式反推：segBase + [1, w]
     *   用于独立于 before 的"区间校验"：旧真属性若落在此区间内 → 品质未变 → 保留；
     *   若落在区间外(品质字母变 / 实体整体品质变) → 品质变化 → 重随机。
     *   无区间数据(衍生肖漏)返回 [Infinity, -Infinity] 触发始终重算。
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
     * 品质字母 → 数值（按实体类型/列分派）
     * @param {string} attrKey 属性键（力量/ATK/...）
     * @param {string} attrTier 该项的品质字母
     * @param {string} itemTier 实体整体品质（锁主区间）
     * @param {'blood'|'equip'|'form'|'status'} kind 来源类型
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
        // equip：五维走"单维属性加成"列，衍生项走对应列
        if (attr5_keys_const.includes(attrKey)) return equipCol('五维');
        return equipCol(attrKey);
    }
    /**
     * 解析实体"真属性"：把 原始属性(品质字母/数值) 转成 数值
     *   - 不用任何缓存/快照/before 对比；用"档位区间校验"独立判断品质是否变化
     *   - 品质未变(旧真属性落在当前品质算出的档位 [segBase+1, segBase+w] 内) → 复用旧随机数，不重随机
     *   - 品质变化(单项字母变 / 实体整体品质变 → 落到旧区间外) → 重随机
     *   - 状态：基础/衍生属性均支持字母→数值，数字则原样保留
     * @param {object} item 实体（血统/装备/状态/形态）
     * @param {'blood'|'equip'|'form'|'status'} kind 来源类型
     * @param {object} [itemBefore] 上一帧实体（检测实体品质变化）
     * @param {string} [effectiveTier] 有效角色层级对应品质；仅限制非形态来源的五维主区间
     * @param {string} [effectiveTierBefore] 上一帧有效角色层级对应品质
     * @returns {object} 真属性对象（数值）
     */
    function resolveRealAttr(item, kind, itemBefore, effectiveTier, effectiveTierBefore) {
        if (!item || typeof item !== 'object') return {};
        const raw = item.原始属性;
        if (!raw || typeof raw !== 'object') return item.真属性 || {};
        if (!item.真属性 || typeof item.真属性 !== 'object') item.真属性 = {};
        const real = item.真属性;
        // 形态字段已由"品质"改为"层级"(Ⅰ~Ⅸ); normalizeTier 兼容罗马数字自动归正为品质字母; 旧存档 品质 字段兜底
        const it = normalizeTier(item.层级 != null ? item.层级 : item.品质);
        const capFiveTier = (itemTier, capTier) => {
            if (kind === 'form' || capTier == null) return itemTier;
            return TIER_ORDER[Math.min(tierRank(itemTier), tierRank(capTier))];
        };
        const fiveTier = capFiveTier(it, effectiveTier);
        // ★ Bug 修复: 实体整体层级变化(Ⅰ→Ⅱ…)时强制重算所有品质型属性, 不依赖"区间校验"碰运气
        //   原因: 区间校验(seg range)在 item.层级 改变时会整体位移, 旧真属性可能恰好落在新区间内
        //         → inSeg 命中 → 不重算 → 真属性停留在旧层级档位; 故此处显式比对 itemBefore 的层级变化。
        let tierChanged = false;
        let fiveTierChanged = false;
        if (itemBefore && typeof itemBefore === 'object') {
            const beforeTierRaw = itemBefore.层级 != null ? itemBefore.层级 : itemBefore.品质;
            const beforeIt = normalizeTier(beforeTierRaw);
            if (beforeIt !== it) tierChanged = true;
            const beforeFiveTier = capFiveTier(beforeIt, effectiveTierBefore != null ? effectiveTierBefore : effectiveTier);
            if (beforeFiveTier !== fiveTier) fiveTierChanged = true;
        }
        for (const k of Object.keys(raw)) {
            const v = raw[k];
            const isQ = isQualityString(v);
            // 状态 / 装备 / 血统 / 形态：品质字母→数值；数字→原样
            //   ★ 区间校验独立于 before：旧真属性落在当前档位区间内 → 保留；否则重随机
            const tier = isQ ? normalizeTier(v) : null;
            if (isQ) {
                // 血统/装备/状态的五维主区间不得高于有效角色层级；
                // 形态五维及所有衍生属性仍使用组件自身品质/层级。
                const itemTier = attr5_keys_const.includes(k) && kind !== 'form' ? fiveTier : it;
                // 区间校验(独立于 before): 旧真属性若落在当前品质算出的档位区间
                //   [segBase+1, segBase+w] 内 → 品质未变 → 保留旧随机数(穿脱装备不跳变);
                //   落在区间外(单项品质字母变 / 实体整体品质变) → 品质变化 → 重随机。
                //   之所以不用 before 对比: writeBackMvu 的 before 来自当前内存 clone,
                //   已含用户对品质的修改 → beforeTier === tier 永真 → 失效。
                //   ★ 但"整体层级变化"(tierChanged) 在 writeBackMvu 路径下对 血统/装备/状态 仍可被检测到
                //     (层级字段属于只读保护字段, clone before 保留用户编辑前的层级), 故显式判定 tierChanged
                //     时强制重算, 覆盖区间校验可能漏判的情况。
                const old = real[k];
                const [segLo, segHi] = attrSegRange(k, tier, itemTier, kind);
                const inSeg = typeof old === 'number' && isFinite(old) && old >= segLo && old <= segHi;
                const effectiveTierChanged = attr5_keys_const.includes(k) && kind !== 'form' && fiveTierChanged;
                if (!inSeg || tierChanged || effectiveTierChanged) {
                    real[k] = qualityToValue(k, tier, itemTier, kind);
                }
                // inSeg 且 !tierChanged 时保留 real[k]（旧随机数）不重随机
            } else {
                real[k] = safeNum(v, 0);
            }
        }
        // 清理已从原始属性删除的键
        for (const k of Object.keys(real)) {
            if (raw[k] === undefined) delete real[k];
        }
        return real;
    }
    /** 安全取数 */
    function safeNum(v, def = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    /** 规范化品质字符串为 F~SSS；罗马数字归正为对应品质字母；非法值回落 F */
    function normalizeTier(q) {
        const s = String(q || '').trim();
        const up = s.toUpperCase();
        if (TIER_ORDER.includes(up)) return up;
        if (ROMAN_TO_QUALITY[s]) return ROMAN_TO_QUALITY[s]; // AI 错传 Ⅲ → D
        return 'F';
    }

    /** 规范化生命层级(大层级)字符串为 Ⅰ~Ⅸ；非法值回落 Ⅰ */
    function normalizeLifeTier(t) {
        const s = String(t || '').trim();
        return LIFE_TIER_ORDER.includes(s) ? s : 'Ⅰ';
    }

    /** 品质序位（越高越大） */
    function tierRank(q) {
        const i = TIER_ORDER.indexOf(normalizeTier(q));
        return i >= 0 ? i : 0;
    }

    /**
     * 原住民NPC位格/血统品质压制
     *   触发条件 (全部满足才压制):
     *     1. 新登场 NPC: 上一帧 关系列表 不存在该名字 (避免反复覆盖剧情合理成长)
     *     2. 不在主神空间 (系统状态.是否在主神空间 !== true)
     *     3. 身份不含 角色/穿越者/守护者/织梦者/篡夺者/残魂 (为特殊身份留通道)
     *   压制规则:
     *     - NPC.层级 (Ⅰ~Ⅸ) 超过 世界.位格 → 压回 世界.位格
     *     - 每条 血统[name].层级 或 .品质 超出 世界.位格 对应品质字母 → 压回 capQuality
     *   映射: Ⅰ↔F Ⅱ↔E Ⅲ↔D Ⅳ↔C Ⅴ↔B Ⅵ↔A Ⅶ↔S Ⅷ↔SS Ⅸ↔SSS (复用 ROMAN_TO_QUALITY / TIER_ORDER)
     */
    const NATIVE_SPECIAL_IDENTITY_SET = {
        '轮回者': 1, '穿越者': 1, '守护者': 1, '织梦者': 1, '篡夺者': 1, '残魂': 1
    };
    function clampNativeNpcToWorldTier(statData, statDataBefore) {
        if (!statData) return;
        const rel = statData.关系列表;
        if (!rel || typeof rel !== 'object') return;
        const relBefore = statDataBefore && statDataBefore.关系列表;
        const inMainSpace = !!(statData.系统状态 && statData.系统状态.是否在主神空间 === true);
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
            const identList = npc.身份;
            let isSpecial = false;
            if (Array.isArray(identList)) {
                for (const it of identList) {
                    if (typeof it === 'string' && NATIVE_SPECIAL_IDENTITY_SET[it.trim()]) { isSpecial = true; break; }
                }
            } else if (typeof identList === 'string') {
                if (NATIVE_SPECIAL_IDENTITY_SET[identList.trim()]) isSpecial = true;
            }
            if (isSpecial) continue;

            if (npc.层级 && overCapLife(npc.层级)) {
                console.warn(`[位格压制] 新登场NPC "${name}" 层级 ${npc.层级} 超出世界位格 ${worldTier}, 已压回 ${worldTier}`);
                npc.层级 = worldTier;
            }
            const bloodDict = npc.血统;
            if (bloodDict && typeof bloodDict === 'object') {
                for (const [bname, b] of Object.entries(bloodDict)) {
                    if (!b || typeof b !== 'object') continue;
                    if (b.层级 && isQualityString(b.层级) === false && overCapLife(b.层级)) {
                        console.warn(`[位格压制] NPC "${name}" 血统[${bname}] 层级 ${b.层级} 超出 ${worldTier}, 已压回 ${worldTier}`);
                        b.层级 = worldTier;
                        delete b.品质;
                    } else if (b.品质 && isQualityString(b.品质) && overCapQ(b.品质)) {
                        console.warn(`[位格压制] NPC "${name}" 血统[${bname}] 品质 ${b.品质} 超出 ${capQuality}, 已压回 ${capQuality}`);
                        b.品质 = capQuality;
                    }
                }
            }
        }
    }

    // 只在存在更新前快照时识别新角色；加载旧存档不追溯强化。
    // 保留血统、技能、状态与形态的原难度强化；装备及其附带内容完全不改写，避免战利品继承难度加成。
    function applyNewNpcDifficulty(statData, statDataBefore) {
        if (!statDataBefore) return;
        const mode = statData.设置?.难度 || '体验';
        if (!['体验', '正常', '困难', '挑战'].includes(mode)) return;
        const before = statDataBefore.关系列表 || {};
        const steps = { '体验': 0, '正常': 2, '困难': 4, '挑战': 6 }[mode];
        const boostedAttrs = [...ATTR_NAMES, ...DERIVED_ATTRS];
        for (const [name, npc] of Object.entries(statData.关系列表 || {})) {
            if (!npc || typeof npc !== 'object' || Object.hasOwn(before, name)) continue;
            if (npc.是否队友 === true || !(Number(npc.好感度) < 0)) continue;
            const life = LIFE_TIER_ORDER.indexOf(normalizeLifeTier(npc.层级));
            const baseRank = life >= 0 ? life : 0;
            if (!npc.状态 || typeof npc.状态 !== 'object') npc.状态 = {};
            if (steps > 0) {
                // 额外强化同时作为难度处理标记，避免同一新增敌人在重复写回时被连续升阶。
                if (npc.状态.额外强化) continue;
                const extraRule = {
                    正常: { qualityOffset: 0, attrTier: 'E', attrs: DERIVED_ATTRS },
                    困难: { qualityOffset: 0, attrTier: 'C', attrs: boostedAttrs },
                    挑战: { qualityOffset: 1, attrTier: 'B', attrs: boostedAttrs }
                }[mode];
                npc.状态.额外强化 = {
                    类型: '增益',
                    品质: TIER_ORDER[Math.min(8, baseRank + extraRule.qualityOffset)],
                    持续: '持续',
                    来源: '难度机制',
                    原始属性: Object.fromEntries(extraRule.attrs.map(attr => [attr, extraRule.attrTier])),
                    效果: '全属性强化'
                };
            }
            function upgrade(item, kind) {
                if (!item || typeof item !== 'object') return;
                const aboveLife = (mode === '困难' || mode === '挑战') && ['状态', '形态库'].includes(kind)
                    || mode === '挑战' && kind === '血统';
                const floor = Math.min(8, baseRank + (aboveLife ? 1 : 0));
                const rank = Math.max(floor, tierRank(item.层级 ?? item.品质));
                if (kind === '形态库' || item.层级 != null) item.层级 = LIFE_TIER_ORDER[rank];
                else item.品质 = TIER_ORDER[rank];
                const raw = item.原始属性;
                if (raw && typeof raw === 'object') {
                    const constitutionFloor = mode === '挑战' ? 'SSS' : mode === '困难' ? 'S' : null;
                    const fixedConstitution = constitutionFloor && (kind === '血统' || kind === '形态库' || Object.hasOwn(raw, '体质'));
                    const originalConstitution = raw.体质;
                    for (const key of Object.keys(raw)) {
                        if (key === '体质' && fixedConstitution) continue;
                        // 数字型临时加减值及 0 不属于品质阶位，保持其语义。
                        if (isQualityString(raw[key])) raw[key] = TIER_ORDER[Math.min(8, tierRank(raw[key]) + steps)];
                    }
                    // 固定体质档位只补足下限，原本高于标准的体质不降级。
                    if (fixedConstitution) raw.体质 = TIER_ORDER[Math.max(tierRank(constitutionFloor), isQualityString(originalConstitution) ? tierRank(originalConstitution) : 0)];
                    item.真属性 = {};
                }
                for (const skill of Object.values(item.技能 || {})) upgrade(skill, '技能');
            }
            // 装备刻意不进入难度强化流程；品质、原始属性及附带技能均保持生成时的原值。
            for (const kind of ['血统', '技能', '状态', '形态库']) {
                for (const item of Object.values(npc[kind] || {})) {
                    // 额外强化使用难度专属固定值，不再进入通用 +2/+4/+6 强化。
                    if (kind === '状态' && item === npc.状态.额外强化) continue;
                    upgrade(item, kind);
                }
            }
        }
    }

    /** 新版 calcModifier：属性值 → 修正值曲线 */
    function calcModifier(attrVal) {
        const x = safeNum(attrVal, 0);
        if (x <= 0) return 0;

        // 断点数组: [属性值, 修正值]
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

        // 如果超过 180000，继续缓慢增长（对数衰减，永不封死，满30万则是286）
        if (x >= 180000) {
            const extra = Math.floor(Math.log10((x - 180000) / 10000 + 1) * 15);
            return Math.min(350, 270 + extra);
        }

        // 分段线性插值
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
     * 判定当前形态是否激活（激活则形态真属性累加到血统之上）
     * 状态字段仅为 AI 叙事记录，是否可激活由 悬浮球状态栏.js 决定，此处不做检查
     * @returns {object|null} 激活的形态库条目；未激活则 null
     */
    function getActiveForm(char) {
        const cur = char.当前形态;
        if (!cur || typeof cur !== 'object') return null;
        if (cur.激活 !== true) return null;
        const name = cur.名称;
        if (!name) return null;
        const entry = char.形态库 && char.形态库[name];
        if (!entry || typeof entry !== 'object') return null;
        return entry;
    }

    /** 有效角色层级 = 角色自身层级与当前激活形态层级中的较高者。 */
    function getEffectiveLifeTier(char, activeForm) {
        const charTier = normalizeLifeTier(char && char.层级);
        const formTierRaw = activeForm && (activeForm.层级 != null ? activeForm.层级 : activeForm.品质);
        const formTier = formTierRaw != null ? normalizeLifeTier(formTierRaw) : null;
        if (formTier && LIFE_TIER_ORDER.indexOf(formTier) > LIFE_TIER_ORDER.indexOf(charTier)) return formTier;
        return charTier;
    }

    /**
     * NPC 群体单位 THP/数量同步
     * 规则（仅 NPC）:
     *   - 新建实体 / 无上一帧：始终信任 [数量]，强制 THP = HP_MAX*(数量-1)
     *     （AI 常按错误 HP 预填 THP，客户端必须覆盖）
     *   - 已有实体且 THP 相对上一帧减少：按 THP 反推人数
     *   - 增援（数量变大）：按新编制补满 THP
     *   - 单名成员属性/HP_MAX 不乘人数；THP 表示“其余成员”的生命池
     * @param {object} char 当前 NPC
     * @param {object|null} charBefore 上一帧 NPC（可空）
     * @param {string} label 日志标识
     */
    function syncNpcGroupThp(char, charBefore, label) {
        if (!char || typeof char !== 'object') return;
        // 仅处理关系列表 NPC；角色无“数量”群体语义
        if (!label || String(label).indexOf('NPC:') !== 0) return;
        // 无数量字段的旧数据按单体处理
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

        // 单体（数量<=1）：THP 仅为普通护盾，不参与群体编制
        if (qty <= 1) {
            if (char.数量 !== 1 && char.数量 !== undefined) char.数量 = 1;
            return;
        }

        // 1) 新建群体：强制按数量灌满 THP，忽略 AI 预填的错误 THP
        //    例：AI 写 HP=30,THP=60,数量=3，实际 HP_MAX=80 → 应 THP=160,数量=3
        if (isNew) {
            const pool = fullPool(qty);
            // if (thp !== pool) {
            //     console.log(
            //         `[群体单位] ${label}: 新建灌池 THP ${thp} → ${pool} ` +
            //         `(数量=${qty}, HP_MAX=${maxHp})`
            //     );
            // } else {
            //     console.log(
            //         `[群体单位] ${label}: 新建灌池 THP=${pool} ` +
            //         `(数量=${qty}, HP_MAX=${maxHp})`
            //     );
            // }
            char.THP = pool;
            char.数量 = qty;
            return;
        }

        // 2) 增援：AI 显式提高了数量 → 按新编制补满群体 THP 池
        if (qty > qtyBefore) {
            const need = fullPool(qty);
            if (thp < need) {
                // console.log(
                //     `[群体单位] ${label}: 编制增援 数量 ${qtyBefore} → ${qty}, THP ${thp} → ${need}`
                // );
                char.THP = need;
            }
            char.数量 = qty;
            return;
        }

        // 3) 脱战/清零后重灌：数量>1 且当前与上一帧 THP 均为 0
        if (thp === 0 && thpBefore === 0) {
            const pool = fullPool(qty);
            char.THP = pool;
            char.数量 = qty;
            // console.log(
            //     `[群体单位] ${label}: 重灌群体 THP=${pool} ` +
            //     `(数量=${qty}, HP_MAX=${maxHp})`
            // );
            return;
        }

        // [已关闭] THP 承伤→数量递减逻辑: 数量由 AI 管理, 后台不再反推
        // THP 未变化或其他情况: 保持现状, 不改写数量
    }

    /**
     * 重算单个角色（角色或NPC）的全套属性面板
     * @param {object} char 角色对象（角色 或 关系列表[某NPC]）
     * @param {string} label 日志标识
     * @param {object|null} [charBefore] 上一帧角色对象（NPC 群体同步用）
     */
    function recalcCharacter(char, label, charBefore) {
        if (!char || typeof char !== 'object') return;
        // ★ 后台守卫: 当前形态未激活时, 自动清空名称(防止残留脏数据导致 getActiveForm 误判)
        try {
            const cur = char.当前形态;
            if (cur && typeof cur === 'object' && cur.激活 !== true && cur.名称) {
                cur.名称 = '';
                // if (label) console.log(`[属性重算] ${label}: 当前形态未激活, 已清空残留名称`);
            }
        } catch (e) {}

        if (!char.最终属性) char.最终属性 = {};
        const attr = char.最终属性;
        const 血统 = char.血统 || {};
        const 装备 = char.装备 || {};
        const 状态 = char.状态 || {};
        // 上一帧对应子集合（供 resolveRealAttr 判定品质是否变化，未变则复用旧随机数）
        const 血统Before = (charBefore && charBefore.血统) || {};
        const 装备Before = (charBefore && charBefore.装备) || {};
        const 状态Before = (charBefore && charBefore.状态) || {};

        // —— 0. 判定形态激活（激活后形态真属性累加到血统之上）——
        const activeForm = getActiveForm(char);
        const formActive = activeForm !== null;
        const activeFormBefore = charBefore ? getActiveForm(charBefore) : null;
        const effectiveLifeTier = getEffectiveLifeTier(char, activeForm);
        const effectiveTier = ROMAN_TO_QUALITY[effectiveLifeTier] || 'F';
        const effectiveLifeTierBefore = charBefore ? getEffectiveLifeTier(charBefore, activeFormBefore) : effectiveLifeTier;
        const effectiveTierBefore = ROMAN_TO_QUALITY[effectiveLifeTierBefore] || 'F';
        // 形态激活：形态真属性直接累加到血统之上，不再二选一替代血统
        // ★ 新机制：原始属性是品质字母，需 resolveRealAttr 转成 真属性(数值) 再累加
        //   传入 before：品质未变复用上一轮随机数，品质变化才重随机（避免穿脱装备跳变）
        // ★ Bug 修复: 形态从"未激活"切换到"激活"时, 强制清空形态真属性并按当前层级重算
        //   原因: 形态未激活期间用户可能编辑了层级(Ⅰ→Ⅱ), 但未激活的形态不会被 resolveRealAttr 处理,
        //         其真属性仍是旧层级数值; 激活瞬间 before 克隆已含新层级 → tierChanged 检测失效 → 不重算。
        //   处理: 清空真属性 + 传 null 作 before, 让 resolveRealAttr 走"空真属性→inSeg 全 false→全量重算"。
        const forceFormRecompute = formActive && activeForm && !activeFormBefore;
        if (forceFormRecompute && activeForm.真属性 && typeof activeForm.真属性 === 'object') {
            Object.keys(activeForm.真属性).forEach(k => { delete activeForm.真属性[k]; });
        }
        const sixSource = formActive ? resolveRealAttr(activeForm, 'form', forceFormRecompute ? null : activeFormBefore) : null;

        // —— 1. 最终五维 ——
        // 来源：血统 + (激活形态) + 已穿戴装备五维 + 状态五维
        // 真属性(数值)累加；状态原始属性支持品质字母→真属性或数值原样
        const statusSix = {};
        ATTR_NAMES.forEach(a => { statusSix[a] = 0; });
        Object.entries(状态).forEach(([sname, s]) => {
            if (s && typeof s === 'object' && s.原始属性) {
                const sb = 状态Before[sname];
                const rs = resolveRealAttr(s, 'status', sb, effectiveTier, effectiveTierBefore);
                // ★ 减益状态: 原始属性为字母品质时, 该项真属性以负数计入最终五维
                //   (真属性本身保持正值不变, 以维持 resolveRealAttr 的档位区间缓存稳定;
                //    数值型原始属性按原逻辑正负原样累加, 不做处理)
                const isDebuff = String(s.类型).trim() === '减益';
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
        // 已穿戴装备(状态===1)的五维加成（品质表允许装备带五维，需计入最终属性）
        const equipSix = {};
        ATTR_NAMES.forEach(a => { equipSix[a] = 0; });
        Object.entries(装备).forEach(([ename, e]) => {
            if (!e || typeof e !== 'object' || e.状态 !== 1) return;
            if (!e.原始属性 || typeof e.原始属性 !== 'object') return;
            const eb = 装备Before[ename];
            const re = resolveRealAttr(e, 'equip', eb, effectiveTier, effectiveTierBefore);
            ATTR_NAMES.forEach(a => { equipSix[a] += safeNum(re[a]); });
        });

        // 血统五维真属性合计（始终参与：形态激活后血统依然生效，与形态累加）
        const bloodSix = {};
        ATTR_NAMES.forEach(a => { bloodSix[a] = 0; });
        Object.entries(血统).forEach(([bname, b]) => {
            if (b && typeof b === 'object' && b.原始属性) {
                const bb = 血统Before[bname];
                const rb = resolveRealAttr(b, 'blood', bb, effectiveTier, effectiveTierBefore);
                ATTR_NAMES.forEach(a => { bloodSix[a] += safeNum(rb[a]); });
            }
        });

        // 五维 = 血统 + (激活形态) + 已穿戴装备 + 状态
        const finalBase = {};
        ATTR_NAMES.forEach(a => {
            finalBase[a] = bloodSix[a]
                + (formActive ? safeNum(sixSource[a]) : 0)
                + equipSix[a]
                + statusSix[a];
        });

        // —— 1.5 生命层级单维上限截断（核心新规则）——
        // 每个单维最终累加值，不得超过角色当前生命层级该单维上限(+1)
        //   例：层级Ⅰ→单维上限29+1=30；超过30则截断到30
        // ★ 形态激活时，上限层级取"形态层级 vs 角色自身层级"中较高者：
        //   形态层级更高 → 以形态层级为截断上限；否则仍以角色自身层级截断
        const lt = effectiveLifeTier;
        const lifeCap = LIFE_TIER_RANGE[lt] ? (LIFE_TIER_RANGE[lt][1] + 1) : Infinity;
        ATTR_NAMES.forEach(a => {
            finalBase[a] = Math.min(finalBase[a], lifeCap);
            attr[a] = finalBase[a];
        });

        // —— 2. 修正值（受位格上限约束；位格只读，不写回）——
        // ★ 层级统一用 Ⅰ-Ⅸ 罗马数字（新机制，不再由属性总点反推写回，由开局/AI/进阶按钮写入）
        //    修正值位格上限表 TIER_MODIFIER_CAPS 按字母品质 F-SSS 作 key，故用 Ⅰ→F … Ⅸ→SSS 同序映射取 cap
        // ★ Bug 修复: 此前固定取 char.层级 计算修正上限 → 本体Ⅰ阶激活Ⅳ阶形态时，
        //   五维上限已随形态抬升至Ⅳ阶(见 1.5 的 lt)，但修正值仍被压在Ⅰ阶档(TIER_MODIFIER_CAPS['F']=12)。
        //   现改为复用 1.5 节已按"角色层级 vs 激活形态层级 取高"调整后的 lt，与属性单维上限同源：
        //   变身期间修正上限继承较高一方；结束变身 getActiveForm()=null → lt 回落本体层级 → 上限自动还原。
        const lifeIdx = LIFE_TIER_ORDER.indexOf(lt);
        const tierForCap = (lifeIdx >= 0 && lifeIdx < TIER_ORDER.length) ? TIER_ORDER[lifeIdx] : 'F';
        const modifierCap = TIER_MODIFIER_CAPS[tierForCap];
        ATTR_NAMES.forEach(a => {
            let m = calcModifier(finalBase[a]);
            if (Number.isFinite(modifierCap)) m = Math.min(m, modifierCap);
            attr[`${a}修正`] = m;
        });

        // —— 3. 汇总装备 + 形态的衍生/检定加值（均用真属性数值） ——
        // 武器(类型0,状态1)的ATK/MATK独立收集(后续各自+无武装成条目); 非武器装备全部属性计入bonus; 武器的DEF等仍计入bonus
        const bonus = {};
        BONUS_KEYS.forEach(k => { bonus[k] = 0; });
        const weapons = []; // [{name, atk, matk}]
        Object.entries(装备).forEach(([wname, e]) => {
            if (!e || typeof e !== 'object' || e.状态 !== 1) return;
            if (!e.原始属性) return;
            const eb = 装备Before[wname];
            const re = resolveRealAttr(e, 'equip', eb, effectiveTier, effectiveTierBefore);
            if (safeNum(e.类型, 0) === 0) {
                // 武器: ATK/MATK单独记录, 其他属性(DEF/MDEF/AP/检定)仍计入bonus
                weapons.push({ name: wname, atk: safeNum(re.ATK), matk: safeNum(re.MATK) });
                BONUS_KEYS.forEach(k => { if (k !== 'ATK' && k !== 'MATK') bonus[k] += safeNum(re[k]); });
            } else {
                // 非武器: 全部属性(含ATK/MATK)计入bonus → 进入无武装
                BONUS_KEYS.forEach(k => { bonus[k] += safeNum(re[k]); });
            }
        });
        // 形态（仅激活时）：形态.原始属性 含 ATK/DEF/MATK/MDEF/AP（11键，无检定）; ATK/MATK计入无武装
        if (formActive) {
            DERIVED_ATTRS.forEach(k => { bonus[k] += safeNum(sixSource[k]); });
        }
        // 状态.原始属性：衍生项全部计入bonus；减益型品质属性按负值结算
        Object.entries(状态).forEach(([sname, s]) => {
            if (s && typeof s === 'object' && s.原始属性) {
                const sb = 状态Before[sname];
                const rs = resolveRealAttr(s, 'status', sb, effectiveTier, effectiveTierBefore);
                const isDebuff = String(s.类型).trim() === '减益';
                BONUS_KEYS.forEach(k => {
                    const v = safeNum(rs[k]);
                    if (isDebuff && isQualityString(s.原始属性[k]) && v > 0) bonus[k] -= v;
                    else bonus[k] += v;
                });
            }
        });

        // —— 4. HP_MAX / EP_MAX（旧公式；写顶级字段）——
        const { 体质, 精神} = finalBase;
        const oldMaxHP = safeNum(char.HP_MAX, safeNum(attr.HP_MAX));
        const newMaxHP = Math.max(1, Math.floor(体质 * 8));
        const oldMaxEP = safeNum(char.EP_MAX, safeNum(attr.EP_MAX));
        const newMaxEP = Math.max(0, Math.floor(精神 * 4));
        char.HP_MAX = newMaxHP;
        char.EP_MAX = newMaxEP;

        // —— 5. 智能HP/EP管理（升级按增量补、降级截断、初始化满血）——
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

        // —— 5.5 NPC 群体单位：THP 池初始化 + 按 THP 反推数量 ——
        // 必须在 HP_MAX 结算之后；角色跳过；数量<=1 时 THP 仍是普通护盾
        syncNpcGroupThp(char, charBefore || null, label);

        // —— 6. 衍生属性（公式 + 加值叠加）——
        // ATK/MATK 不再写顶层, 而是按"握持法则"拆入 最终属性.武器:
        //   无武装 = 公式换算 + 非武器装备/形态的ATK/MATK(bonus.ATK/MATK已排除武器)
        //   {武器名} = 武器原始属性ATK/MATK + 无武装ATK/MATK
        const { 力量, 敏捷 } = finalBase;
        const unarmedATK  = Math.floor((力量 + 敏捷) / 2) + bonus.ATK;
        const unarmedMATK = Math.floor(精神 / 2) + bonus.MATK;
        // 重建武器对象(每次全量重建, 防止脱下后旧条目遗留)
        attr.武器 = {};
        attr.武器.无武装 = { ATK: unarmedATK, MATK: unarmedMATK };
        weapons.forEach(w => {
            attr.武器[w.name] = { ATK: w.atk + unarmedATK, MATK: w.matk + unarmedMATK };
        });
        // 删除顶层ATK/MATK(已挪入武器结构; 旧数据残留也一并清除)
        delete attr.ATK;
        delete attr.MATK;
        // DEF/MDEF/AP 仍在顶层(武器的DEF等加成已计入bonus)
        attr.DEF  = Math.floor(体质 / 2) + bonus.DEF;
        attr.MDEF = Math.floor((体质 + 精神) / 4) + bonus.MDEF;
        attr.AP   = bonus.AP;

        // —— 新增：把护甲折算成减伤率，写回面板（前台替代固定防御）——
        attr.物理减伤率 = calcReduction(attr.DEF, char.层级 || 'E');
        attr.魔法减伤率 = calcReduction(attr.MDEF, char.层级 || 'E');

        // —— 7. 检定（基础值 + 装备加值；仅 先攻DC/防御DC）——
        attr.先攻DC = Math.floor((attr.敏捷修正 + attr.精神修正 / 2) / 2) + bonus.先攻DC;
        attr.防御DC = 30 + Math.floor((attr.体质修正 + attr.敏捷修正) / 2) + bonus.防御DC;

        const formTag = formActive ? `[形态:${char.当前形态.名称}]` : '[血统]';
        // console.log(
        //     `[属性重算] ${label} ${formTag}: ` +
        //     `五维={力${finalBase.力量}/敏${finalBase.敏捷}/体${finalBase.体质}/精${finalBase.精神}/魅${finalBase.魅力}} ` +
        //     `HP=${char.HP}/${newMaxHP} EP=${char.EP}/${newMaxEP} ` +
        //     `无武装ATK=${unarmedATK} MATK=${unarmedMATK} 武器x${weapons.length} ` +
        //     `DEF=${attr.DEF}(+${bonus.DEF}) ` +
        //     `先攻=${attr.先攻DC}(+${bonus.先攻DC}) 防御=${attr.防御DC}(+${bonus.防御DC})` +
        //     (Number.isFinite(modifierCap) ? '' : '(位格未命中,修正不限)')
        // );
    }

    /**
     * 角色普升检测：按最终五维属性值在【当前生命层级】内的相对段位判定，五维累计≥24 → 是否可试炼=true
     *   - 单维分：取角色当前层级(Ⅰ~Ⅸ)对应的 LIFE_TIER_RANGE [lo,hi]，9 等分为 F~SSS 九段
     *     属性值落在第几段 → 段位分(F=1, E=2 … SSS=9)，与 qualitySegValue 分段逻辑对齐
     *   - 低于当前层级下限(lo) → 保底 F=1 分（属性过低但仍给基础分，非 0 分）
     *     例：层级Ⅲ范围[100,299]，魅力=20 < 100 → 判 F=1 分
     *   - 阈值 24：五维满分 45(5×9)，24 ≈ 五维均达当前层级 B 段(5分)以上方可试炼
     *   - 进阶后新层级范围更大、属性需重新达标；属性下降导致累计<24 → 立即置 false
     *   - 仅作用于角色(系统状态.是否可试炼)，NPC 无此机制
     * @param {object} reincarnator 角色对象
     * @param {object} sys 系统状态对象
     */
    const TRIAL_SCORE_THRESHOLD = 24;
    /**
     * 单维属性值 → 当前层级下的段位分(F=1 … SSS=9)
     *   取当前层级 LIFE_TIER_RANGE [lo,hi]，9 等分；属性值落在第几段即该段分
     *   低于 lo 保底 1 分(F)；达到/超过 hi 满分 9 分(SSS)
     * @param {number} val 单维最终属性值
     * @param {string} lifeTier 当前生命层级(Ⅰ~Ⅸ)
     * @returns {number} 段位分 1~9
     */
    function attrTierScore(val, lifeTier) {
        const v = safeNum(val, 0);
        const lt = normalizeLifeTier(lifeTier);
        const range = LIFE_TIER_RANGE[lt];
        if (!range) return 1; // 层级无效，保底 1 分
        const lo = range[0], hi = range[1];
        // 低于当前层级下限 → 保底 F=1 分
        if (v < lo) return 1;
        // 层级 Ⅸ 上限为 Infinity：无法直接 9 等分，用下限的 10 倍(100万)作分段上限基准
        //   逻辑：Ⅸ 是半神层级，单维 100万 视为该层级满档(SSS)；超过则封顶 9 分
        const effectiveHi = Number.isFinite(hi) ? hi : lo * 10;
        // 达到或超过上限 → 满分 SSS=9
        if (v >= effectiveHi) return 9;
        // [lo, effectiveHi] 内 9 等分，判定落在第几段（与 qualitySegValue 的 w=floor(span/9) 对齐）
        const span = Math.max(1, effectiveHi - lo);
        const w = Math.max(1, Math.floor(span / 9));
        const segIdx = Math.min(8, Math.floor((v - lo) / w));
        return segIdx + 1;
    }
    function checkTrialEligibility(reincarnator, sys) {
        if (!reincarnator || !sys) return;
        const attr = reincarnator.最终属性;
        if (!attr || typeof attr !== 'object') return;
        const lifeTier = reincarnator.层级;
        let total = 0;
        ATTR_NAMES.forEach(a => { total += attrTierScore(attr[a], lifeTier); });
        const eligible = total >= TRIAL_SCORE_THRESHOLD;
        if (sys.是否可试炼 !== eligible) {
            sys.是否可试炼 = eligible;
            // console.log(`[普升检测] 角色层级=${lifeTier} 五维段位累计=${total} (阈值${TRIAL_SCORE_THRESHOLD}) → 是否可试炼=${eligible}`);
        }
    }

    /** 遍历角色 + 全部NPC，逐个重算（后台全量计算，与是否在场无关） */
    function recalcAllCharacters(statData, statDataBefore) {
        if (!statData) return;
        // 角色
        if (statData.角色) {
            recalcCharacter(statData.角色, '角色', statDataBefore?.角色);
        }
        // 关系列表全部NPC（不在场也需重算属性，供面板查阅；是否展示给AI由变量可见性控制）
        const rel = statData.关系列表;
        const relBefore = statDataBefore?.关系列表;
        if (rel && typeof rel === 'object') {
            Object.entries(rel).forEach(([name, npc]) => {
                if (!npc || typeof npc !== 'object') return;
                const npcBefore = (relBefore && typeof relBefore === 'object') ? relBefore[name] : null;
                recalcCharacter(npc, `NPC:${name}`, npcBefore);
            });
        }
    }

    /** 真实游玩天数推进: 世界.时间 的日期(年月日)每变动一次 → 系统状态.游玩天数+1 (单调递增, 免疫副本时间跳跃/回退) */
    function updatePlayDays(statData) {
        const worldTime = statData?.世界?.时间;
        const sys = statData?.系统状态;
        if (!sys || !worldTime) return;

        // 只判断“日期是否变了”，不按实际跨越天数累计；纪年允许古代/异世界文本。
        const DATE_RE = /([^年月日]+?)\s*年\s*-?\s*(\d+)\s*月\s*-?\s*(\d+)\s*日/;
        const m = String(worldTime).match(DATE_RE);
        if (!m) return;

        // 仅取纪年/月/日；同一日期内改变时辰不重复计数。
        const dateKey = `${String(m[1] || '').trim()}-${+m[2]}-${+m[3]}`;
        const lastDate = String(sys.上次世界日期 || '');

        if (!lastDate) {
            // 首次初始化: 开局即第1天
            sys.游玩天数 = 1;
        } else if (lastDate !== dateKey) {
            // 日期变动(跨日/进副本/出副本均计1天)
            sys.游玩天数 = Number(sys.游玩天数 || 0) + 1;
        }
        sys.上次世界日期 = dateKey;
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
        const owners = Array.isArray(asset?.所属对象)
            ? asset.所属对象
            : (typeof asset?.所属对象 === 'string' ? [asset.所属对象] : []);
        const playerName = getPlayerName();
        return owners.some(owner => isPlayerOwner(owner, playerName));
    }

    /** 记录资产显式删除，防止世界引擎根据旧剧情记忆把同名资产重新创建。 */
    function syncRemovedAssets(statData, statDataBefore) {
        if (!statData || !statDataBefore) return [];
        // 普通副本结算回主神空间时，批量移除的是世界生命周期清理，不应写成跨世界资产墓碑。
        if (statData?.系统状态?.是否在主神空间 === true && statDataBefore?.系统状态?.是否在主神空间 !== true) return [];
        const beforeAssets = statDataBefore.资产 && typeof statDataBefore.资产 === 'object' ? statDataBefore.资产 : {};
        const currentAssets = statData.资产 && typeof statData.资产 === 'object' ? statData.资产 : {};
        statData.世界 = statData.世界 || {};
        statData.世界.后台 = statData.世界.后台 || {};
        const tombstones = statData.世界.后台.资产墓碑 = statData.世界.后台.资产墓碑 || {};
        const removed = [];
        Object.keys(beforeAssets).forEach(name => {
            if (Object.prototype.hasOwnProperty.call(currentAssets, name)) return;
            tombstones[name] = String(statData.世界.时间 || '已删除');
            removed.push(name);
        });
        // 用户/MVU明确重新建立同名资产时解除墓碑。
        Object.keys(currentAssets).forEach(name => { if (Object.prototype.hasOwnProperty.call(tombstones, name)) delete tombstones[name]; });
        return removed;
    }

    /** 资产自动收菜：只按系统状态.游玩天数调度；到期只生成待办。 */
    function autoHarvestAssets(statData, statDataBefore) {
        const assets = statData?.资产;
        const sys = statData?.系统状态;
        if (!assets || typeof assets !== 'object' || !sys) return;

        const playDays = Number(sys.游玩天数 || 0);
        if (!(playDays > 0)) return;
        const cycle = 7;
        const formatRemaining = (nextPlay) => `${Math.max(0, Math.ceil(nextPlay - playDays))}天后`;

        Object.entries(assets).forEach(([assetName, asset]) => {
            if (!asset || typeof asset !== 'object' || !isPlayerOwnedAsset(asset)) return;
            const seqs = asset.建设序列;
            if (!seqs || typeof seqs !== 'object') return;
            if (!Array.isArray(asset.待办事件)) asset.待办事件 = [];

            Object.entries(seqs).forEach(([seqName, seq]) => {
                if (!seq || typeof seq !== 'object') return;
                const output = String(seq.产出 || '').trim();
                if (!output || output === '无' || output === '待定') {
                    seq.下次产出日期 = '';
                    seq.下次产出游天 = 0;
                    return;
                }

                let nextPlay = Number(seq.下次产出游天);
                if (!Number.isFinite(nextPlay) || nextPlay <= 0) {
                    // 兼容旧的相对/游玩日展示；旧世界绝对日期不再参与调度。
                    const shown = String(seq.下次产出日期 || '').trim();
                    const remainingMatch = shown.match(/^(\d+)\s*天后$/);
                    const legacyPlayMatch = shown.match(/^第?\s*(\d+)\s*游玩日$/);
                    if (remainingMatch) nextPlay = playDays + Number(remainingMatch[1]);
                    else if (legacyPlayMatch) nextPlay = Number(legacyPlayMatch[1]);
                    else nextPlay = playDays + cycle;
                }

                seq.下次产出游天 = nextPlay;

                if (playDays >= nextPlay) {
                    const harvestCount = Math.floor((playDays - nextPlay) / cycle) + 1;
                    const prefix = `【自动收菜】${assetName}-${seqName}`;
                    const pendingIndex = asset.待办事件.findIndex(item => String(item || '').startsWith(prefix));
                    let totalCount = harvestCount;
                    if (pendingIndex >= 0) {
                        const oldCount = String(asset.待办事件[pendingIndex] || '').match(/共\s*(\d+)\s*份/);
                        if (oldCount) totalCount += Number(oldCount[1]);
                    }
                    const todoMsg = `${prefix}：${output}（共${totalCount}份，待玩家领取）`;
                    if (pendingIndex >= 0) asset.待办事件[pendingIndex] = todoMsg;
                    else asset.待办事件.push(todoMsg);

                    nextPlay += harvestCount * cycle;
                    seq.下次产出游天 = nextPlay;
                }

                seq.下次产出日期 = formatRemaining(nextPlay);
            });
        });
    };

    // ===== 模块 2：护甲收益递减 (对数防御曲线 - 动态层级适配版) =====
    const REDUCTION_CAP = 75; // 最高减伤 75%
    const ALPHA = 16;
    const LOG_DEN = Math.log(1 + ALPHA); // ln(17)

    /**
     * 【核心修复】：各阶位对应的理论满防值（防具上限 + 体质换算上限）
     * 来源依据：对照你的《品质效果数值规则》各阶位五维总和与防御阈值推算
    */ 
    const TIER_DEF_SCALE = {
        'Ⅰ': 70,       // F级萌新满防基准
        'Ⅱ': 200,      // E级满防基准
        'Ⅲ': 480,      // D级
        'Ⅳ': 1280,     // C级
        'Ⅴ': 3300,     // B级
        'Ⅵ': 9200,     // A级
        'Ⅶ': 24000,    // S级
        'Ⅷ': 70000,    // SS级
        'Ⅸ': 150000    // SSS级半神满防基准
    };

    /** 传入防御总值与角色当前层级 */
    function calcReduction(defenseValue, tier) {
        // 获取当前阶位的满防基准（兜底为E级）
        const fullScale = TIER_DEF_SCALE[tier] || TIER_DEF_SCALE['E'];
        const defense = Math.max(0, safeNum(defenseValue, 0));
        
        // 计算当前防御在当前阶位下的比例
        const scale = defense / fullScale;
        
        // 带入对数递减公式
        const rawReduction = REDUCTION_CAP * Math.log(1 + ALPHA * scale) / LOG_DEN;
        
        // 限制最高不得超过 75%
        return Math.min(REDUCTION_CAP, Math.round(rawReduction)); 
    }

    /** 伴生神器自动成长 */
    function processArtifactGrowth(char) {
        if (!char || !char.装备) return;
        
        // 假设伴生神器的装备标签为 "伴生神器" 或 "可成长"，在装备列表中查找
        const artifact = Object.values(char.装备).find(e => e.标签?.includes("伴生神器") || e.标签?.includes("可成长"));
        
        if (!artifact) return;

        const currentTier = char.层级; // F ~ SSS
        const oldTier = artifact.品质;

        // 如果神器品质已经等于角色层级，则不需要成长
        if (oldTier === currentTier) return;

        // 装备品质自动对齐角色位格
        artifact.品质 = currentTier;
        
        // 动态重写特效与属性
        if (!artifact.效果) artifact.效果 = {};
        if (!artifact.原始属性) artifact.原始属性 = {};

        // 根据不同层级解锁词条 (像修仙小说的本命法宝解封一样)
        switch(currentTier) {
            case 'E':
                artifact.效果['真名初现'] = "攻击时额外造成小幅灵魂震荡";
                artifact.原始属性['ATK'] = 50;
                break;
            case 'C':
                artifact.效果['火之高兴'] = "无视目标 20% 物理减伤率";
                artifact.原始属性['ATK'] = 500;
                break;
            case 'A':
                artifact.效果['焚天'] = "每次攻击附带基于目标最大HP 5% 的真实灼烧";
                artifact.原始属性['ATK'] = 3000;
                break;
            case 'SSS':
                artifact.效果['概念级·初火'] = "绝对必中，且击杀目标后直接抹除其在世界法则中的因果";
                artifact.原始属性['ATK'] = 50000;
                break;
        }
        
        // console.log(`[神器成长] 伴生神器已随角色突破！当前品质: ${currentTier}`);
    }

    /** 功法/熟练度 溢出进阶守卫 */
    function guardProficiency(char) {
        if (!char || !char.技能) return;
        
        // 设定阶位升阶门槛
        const TIER_THRESHOLDS = { '入门': 100, '熟练': 300, '精通': 1000, '宗师': 5000, '化境': Infinity };
        const TIER_ORDER = Object.keys(TIER_THRESHOLDS);

        Object.entries(char.技能).forEach(([skillName, skill]) => {
            // 假设通过“熟练度”字段来控制
            if (skill.熟练度 === undefined || skill.掌握程度 === undefined) return;

            let currentExp = safeNum(skill.熟练度, 0);
            let currentTier = skill.掌握程度; // 比如 "入门"
            
            let threshold = TIER_THRESHOLDS[currentTier] || Infinity;

            // 如果熟练度溢出，自动进阶
            while (currentExp >= threshold && threshold !== Infinity) {
                currentExp -= threshold; // 扣除门槛，保留溢出
                
                const nextIndex = TIER_ORDER.indexOf(currentTier) + 1;
                currentTier = TIER_ORDER[nextIndex];
                threshold = TIER_THRESHOLDS[currentTier];
                
                // console.log(`[功法突破] 恭喜！${skillName} 突破至 ${currentTier}！`);
                
                // 进阶时自动增强技能伤害系数
                if (skill.效果 && skill.效果['基础伤害倍率']) {
                    skill.效果['基础伤害倍率'] = (parseFloat(skill.效果['基础伤害倍率']) + 0.5) + "x";
                }
            }

            // 写回数据
            skill.掌握程度 = currentTier;
            skill.熟练度 = currentExp;
            skill.升阶阈值 = threshold;
        });
    }

    /** 物品数量归零清理 */
    function cleanupZeroQuantityItems(char) {
        if (!char || !char.道具) return;
        Object.keys(char.道具).forEach(itemName => {
            const item = char.道具[itemName];
            // 只要数量 <= 0，或者字段缺失，立刻删除
            if (item && (item.数量 === undefined || item.数量 === null || item.数量 <= 0)) {
                delete char.道具[itemName];
                console.log(`[道具清理] 物品 "${itemName}" 数量归零，已自动删除。`);
            }
        });
    }

    /** 状态回合衰减与过期清理 */
    function processStatusDuration(char, isCombat) {
        if (!char || !char.状态) return;
        const statusesToRemove = [];
        
        Object.entries(char.状态).forEach(([statusName, statusData]) => {
            if (!statusData || typeof statusData.持续 !== 'string') return;
            
            // 仅在战斗中，处理带有“回合”字样的状态倒计时
            if (isCombat && statusData.持续.includes('回合')) {
                let rounds = parseInt(statusData.持续);
                if (!isNaN(rounds) && rounds > 0) {
                    rounds -= 1; // 回合数 -1
                    if (rounds <= 0) {
                        statusesToRemove.push(statusName);
                    } else {
                        // 更新回字符串，例如 "2回合"
                        statusData.持续 = `${rounds}回合`;
                    }
                }
            }
            // 非战斗状态的持续时间（如"3天"或"直至被净化"）留给 AI 在剧情中判断
        });
        
        // 集中删除到期的状态
        statusesToRemove.forEach(name => {
            delete char.状态[name];
            console.log(`[状态清理] ${char.名称 || '角色'} 的状态 [${name}] 已到期，后台自动移除。`);
        });
    }

    /** 死亡 NPC 清理 (防误删强化版) */
    function cleanupDeadNPCs(statData) {
        if (!statData || !statData.关系列表) return;
        Object.keys(statData.关系列表).forEach(npcName => {
            const npc = statData.关系列表[npcName];
            if (!npc) return;
            
            // 1. 终极保护伞：如果是队友，或者好感度 > 30，绝对不删（为复活道具/技能保留肉体）;在场的不处理
            const isTeammate = npc.是否队友 === true;
            const highAffinity = typeof npc.好感度 === 'number' && npc.好感度 > 30;
            const isPresent = npc.在场 === true;
            if (isTeammate || highAffinity || isPresent) {
                return; // 直接跳过，免受清理
            }

            // 2. 死亡判定
            // 判断条件 A：HP 归零
            const isHpDead = (typeof npc.HP === 'number' && npc.HP <= 0);
            
            // 判断条件 B：AI 直接在状态里明确写了包含“死亡”的词汇（双重保险）
            const isExplicitlyDead = npc.状态 && Object.keys(npc.状态).some(key => key.includes('死亡'));

            // 3. 满足任意死亡条件，且没有保护伞，直接从内存中抹除
            if (isHpDead || isExplicitlyDead) {
                delete statData.关系列表[npcName];
                console.log(`[阵亡清理] 敌对或路人 NPC "${npcName}" 已确认死亡（无复活价值），后台自动移除。`);
            }
        });
    }

    /** 世界稳定值自动推演 */
    function calcWorldStability(statData) {
        if (!statData || !statData.世界) return;
        if (statData.设置?.世界超稳 === true) {
            statData.世界.稳定 = 100;
            return;
        }
        if (!statData.世界.因果轨道) return;
        const records = statData.世界.因果轨道.偏移记录;
        
        let totalOffset = 0;
        if (records && typeof records === 'object') {
            Object.values(records).forEach(record => {
                if (record && typeof record.影响程度 === 'number') {
                    totalOffset += record.影响程度;
                }
            });
        }
        
        // 稳定值: 基础 100 + 偏移记录累加值, 上下限 [0, 120]
        //   - 上限 120: 防止正偏移(利好事件)溢出突破系统上限
        //   - 下限 0: 防止负偏移(灾难事件)穿透至负值
        const STABILITY_MIN = 0, STABILITY_MAX = 120;
        const newStability = Math.max(STABILITY_MIN, Math.min(STABILITY_MAX, 100 + totalOffset));

        if (statData.世界.稳定 !== newStability) {
            console.log(`[世界法则] 稳定值重算: 100 + ${totalOffset}(偏移总和) = ${newStability} (限幅[${STABILITY_MIN},${STABILITY_MAX}])`);
            statData.世界.稳定 = newStability;
        }
    }

    /** 战斗轮次与技能冷却全自动管理 */
    function processCombatAndCooldowns(statData, statDataBefore) {
        const combat = statData?.系统状态;
        const combatBefore = statDataBefore?.系统状态;
        if (!combat) return;

        let deltaRound = 0;
        let isCombatNow = combat.是否战斗中 === true;
        const wasCombatBefore = combatBefore?.是否战斗中 === true;

        // —— 0. 战场敌对存活性检测：无在场存活的敌对 NPC 时强制脱战 ——
        //   敌对定义: 在场 且 非队友 且 好感度<0(仇视及以上敌意)
        //   存活定义: HP>0 且 状态未明确标注“死亡”
        function isHostileAlive(npc) {
            if (!npc) return false;
            // 队友 / 好感度非负 → 非敌对
            if (npc.是否队友 === true) return false;
            const affinity = safeNum(npc.好感度, 0);
            if (affinity >= 0) return false;
            // 死亡判定: HP 归零 或 状态含“死亡”
            const isHpDead = (typeof npc.HP === 'number' && npc.HP <= 0);
            const isExplicitlyDead = npc.状态 && Object.keys(npc.状态).some(k => k.includes('死亡'));
            if (isHpDead || isExplicitlyDead) return false;
            // 存活且仍有战斗能力的敌对单位
            return true;
        }

        let hasHostileOnScene = false;
        if (statData.关系列表 && typeof statData.关系列表 === 'object') {
            hasHostileOnScene = Object.values(statData.关系列表).some(npc =>
                npc && npc.在场 !== false && isHostileAlive(npc)
            );
        }

        // 战斗中但现场已无存活敌对单位 → 后台强制脱战，避免 AI 维持空转战斗
        if (isCombatNow && !hasHostileOnScene) {
            // console.log(`[战斗系统] 现场无存活敌对 NPC，后台强制结束战斗`);
            combat.是否战斗中 = false;
            // 让后续“脱战分支”在本帧得以触发，确保冷却/THP 清理协议立即生效
            isCombatNow = false;
        }

        // —— 1. 处理轮次自动递增 ——
        if (isCombatNow) {
            if (!wasCombatBefore) {
                combat.当前轮次 = 1; // 刚进战
                // console.log(`[战斗系统] 进入战斗，当前轮次初始化为 1`);
            } else {
                const beforeRound = safeNum(combatBefore.当前轮次, 1);
                const aiRound = safeNum(combat.当前轮次, 1);
                // 后台强力接管递增，防止 AI 双重加算
                if (aiRound <= beforeRound) {
                    combat.当前轮次 = beforeRound + 1;
                }
                deltaRound = combat.当前轮次 - beforeRound;
                // console.log(`[战斗系统] 轮次推进: ${beforeRound} -> ${combat.当前轮次}`);
            }
        } else {
            combat.当前轮次 = 0;
            // ★ 非战斗: 每条 AI 消息计 1 回合, 形态/状态冷却按回合递减(3回合后归零可重新激活)
            //   原逻辑 deltaRound=999 会让 tickCooldowns 强制清零冷却 → 每条非战斗消息都把冷却重置为 0 → 形态可随时激活/取消
            //   现改为 deltaRound=1: 脱战不清零冷却, 仅每回合 -1(与战斗内一致的倒数节奏); 脱战瞬间 THP 仍清零(见下方 wasCombatBefore 块)
            deltaRound = 1;

            // 仅在“刚刚脱离战斗”的这个瞬间触发清零！
            if (wasCombatBefore) {
                // console.log(`[战斗系统] 离开战斗，触发冷却与护盾(THP)清空协议`);
                
                // 1. 清空角色的临时生命值
                if (statData.角色 && typeof statData.角色.THP !== 'undefined') {
                    statData.角色.THP = 0;
                    // console.log(`[战斗系统] 角色 THP 已脱战归零`);
                }

                // 2. 清空所有NPC的临时生命值
                //    注意：本帧 recalc 已跑完；群体单位 THP 会被清掉后需同帧按数量重灌
                if (statData.关系列表) {
                    Object.entries(statData.关系列表).forEach(([npcName, npc]) => {
                        if (!npc || npc.在场 === false) return;
                        if (typeof npc.THP !== 'undefined') npc.THP = 0;
                        // 群体：THP 清零后按当前数量重灌（人数已在战斗中被 THP 反推过，不回满人数）
                        const qty = Math.max(1, Math.floor(safeNum(npc.数量, 1)));
                        if (qty > 1) {
                            const maxHp = Math.max(1, safeNum(npc.HP_MAX, 1));
                            const pool = maxHp * (qty - 1);
                            npc.THP = pool;
                            // console.log(`[战斗系统] 群体 NPC:${npcName} 脱战重灌 THP=${pool} (数量=${qty})`);
                        }
                    });
                }
            }
        }

        // —— 2. 冷却递减逻辑引擎 ——
        function tickCooldowns(actor, actorBefore, label) {
            if (!actor) return;
            
            const processDict = (dict, dictBefore) => {
                if (!dict) return;
                Object.entries(dict).forEach(([name, item]) => {
                    if (!item || typeof item.冷却 !== 'string') return;
                    
                    const oldItem = dictBefore?.[name];
                    const oldCdStr = oldItem?.冷却 || "0";
                    const newCdStr = item.冷却;
                    
                    // 解析字符串，例如 "2/3 回合" 提取出 cur=2, max=3
                    const parseCD = (str) => {
                        if (!str || str === "0") return { cur: 0, max: 0 };
                        const m = str.match(/^(\d+)\s*\/\s*(\d+)/);
                        if (m) return { cur: parseInt(m[1]), max: parseInt(m[2]) };
                        return { cur: 0, max: 0 };
                    };

                    const oldCD = parseCD(oldCdStr);
                    const newCD = parseCD(newCdStr);

                    if (newCD.max === 0) return; // 0/0的无CD技能直接跳过

                    // 【神级拦截】：如果 AI 刚把当前冷却拉高（即本回合释放了该技能），则本回合绝不扣减！
                    if (newCD.cur > oldCD.cur && isCombatNow) {
                        // console.log(`[冷却系统] ${label} 刚释放了 [${name}]，冷却已置为 ${newCdStr}，本轮不扣减。`);
                        return;
                    }

                    // 开始随轮次扣减
                    let finalCur = newCD.cur;
                    if (deltaRound === 999) {
                        finalCur = 0; // (保留兼容)显式脱战清零信号: 当前调用方已不传 999
                    } else if (deltaRound > 0) {
                        finalCur = Math.max(0, newCD.cur - deltaRound);
                    }

                    // 写回标准格式
                    const finalStr = finalCur === 0 ? "0" : `${finalCur}/${newCD.max} 回合`;
                    if (item.冷却 !== finalStr) {
                        // console.log(`[冷却系统] ${label} 的 [${name}] 冷却倒数: ${item.冷却} -> ${finalStr}`);
                        item.冷却 = finalStr;
                    }
                });
            };

            // 遍历技能库和形态库
            // processDict(actor.技能, actorBefore?.技能);
            processDict(actor.形态库, actorBefore?.形态库);
        }

        // 执行角色的冷却递减
        tickCooldowns(statData.角色, statDataBefore?.角色, "角色");
        // 执行在场 NPC 的冷却递减
        if (statData.关系列表) {
            Object.entries(statData.关系列表).forEach(([npcName, npc]) => {
                if (npc.在场 !== false) {
                    tickCooldowns(npc, statDataBefore?.关系列表?.[npcName], `NPC:${npcName}`);
                }
            });
        }
    }



    // 初始化事件注册；所有订阅由 Runtime 持有，工坊热更新前可安全停止旧实例。
    const init = async () => {
        await waitGlobalInitialized('Mvu');
        initializeTurnMessageBaseline();
        var subscription = eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, onUpdateData);
        trackCalculatorSubscription(subscription);
        try { CALCULATOR_HOST.__辅助计算脚本_loaded__ = true; } catch (_) {}
        try { toastr.success('[辅助计算脚本] 脚本已加载 '); } catch (_) {}
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
