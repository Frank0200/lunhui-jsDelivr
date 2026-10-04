/* 轮回战场 · 世界引擎
 * 从参考异步助手迁移：旧状态回读、增量补丁、分层投影、楼层隔离、后台调度。
 * 专用实现：六个业务模块共用一次推演；MVU 是唯一持久状态；复用主神终端 API。
 * 在酒馆脚本库中独立加载。接口位于父窗口 Samsara.worldEngine。
 */
(function (root) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // P1-C 诊断只需要稳定的近似量级；不同模型 tokenizer 不同，只有 API usage 才视为精确 token。
    function estimateTokens(value) {
        const source=typeof value==='string'?value:JSON.stringify(value??'');
        if(!source)return 0;
        let eastAsian=0,nonAscii=0,ascii=0;
        for(const ch of source){
            const cp=ch.codePointAt(0);
            const east=(cp>=0x3400&&cp<=0x9fff)||(cp>=0xf900&&cp<=0xfaff)||(cp>=0x3040&&cp<=0x30ff)||(cp>=0x31f0&&cp<=0x31ff)||(cp>=0xac00&&cp<=0xd7af)||(cp>=0x3100&&cp<=0x312f)||(cp>=0xff00&&cp<=0xffef);
            if(east)eastAsian++;
            else if(cp<=0x7f)ascii++;
            else nonAscii++;
        }
        return Math.max(1,Math.ceil(eastAsian*1.08+nonAscii+ascii/3.8));
    }
    function formatTokenCount(count,estimated=true) {
        const n=Math.max(0,Math.round(Number(count)||0));
        let value=String(n);
        if(n>=1000){
            const digits=n>=100000?0:n>=10000?1:2;
            value=(n/1000).toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1')+'k';
        }
        return (estimated?'≈':'')+value+' tk';
    }
    function normalizeTokenUsage(usage) {
        if(!plain(usage))return null;
        const finite=value=>Number.isFinite(Number(value))&&Number(value)>=0?Math.round(Number(value)):null;
        const inputTokens=finite(usage.prompt_tokens??usage.input_tokens??usage.promptTokens??usage.inputTokens);
        const outputTokens=finite(usage.completion_tokens??usage.output_tokens??usage.completionTokens??usage.outputTokens);
        let totalTokens=finite(usage.total_tokens??usage.totalTokens);
        if(totalTokens===null&&inputTokens!==null&&outputTokens!==null)totalTokens=inputTokens+outputTokens;
        return inputTokens===null&&outputTokens===null&&totalTokens===null?null:{inputTokens,outputTokens,totalTokens};
    }
    function requestTokenTelemetry(system,input,schema) {
        const systemText=String(system||''),inputText=String(input||'');
        let payload=null;try{payload=JSON.parse(inputText);}catch(_){}
        const systemParts=systemText.split(/\n(?=【)/).filter(Boolean).map((part,index)=>({
            名称:(part.match(/^【([^】]+)】/)||[])[1]||'system '+(index+1),
            估算Tokens:estimateTokens(part)
        }));
        const userParts=plain(payload)?Object.entries(payload).filter(([,value])=>value!==undefined).map(([name,value])=>({
            名称:name,估算Tokens:estimateTokens(JSON.stringify({[name]:value},null,2))
        })):[];
        const systemTokens=estimateTokens(systemText),userTokens=estimateTokens(inputText);
        return {
            估算:true,
            请求估算Tokens:systemTokens+userTokens,
            System估算Tokens:systemTokens,
            User估算Tokens:userTokens,
            Schema估算Tokens:estimateTokens(JSON.stringify(schema||{},null,2)),
            System分段:systemParts,
            User分段:userParts
        };
    }
    function digest(text) {
        let a = 2166136261, b = 5381;
        for (let i=0;i<text.length;i++) { a = Math.imul(a ^ text.charCodeAt(i),16777619); b = Math.imul(b,33) ^ text.charCodeAt(i); }
        return (a >>> 0).toString(16) + (b >>> 0).toString(16) + ':' + text.length;
    }
    const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
    const CONFIG = 'samsara_world_engine_v1';
    const STATUS_THEME_CONFIG = 'samsara_theme_v2';
    // 六主题只在这里维护色值。CSS 只消费语义 token，避免羊皮/樱白等主题再堆局部补丁。
    const WORLD_UI_THEMES = Object.freeze({
        night:Object.freeze({scheme:'dark',shell:'#0e1320',main:'#101824',surface:'#151e2c',card:'#1b2636',cardHover:'#213044',input:'#111a27',line:'#344357',ink:'#edf3f8',sub:'#bac6d4',accent:'#9aa8ff',accentSoft:'#9aa8ff24',gold:'#d9b978',mint:'#7dcbbb',head:'#111a27',nav:'#0c1420',notice:'#251f18',action:'#9aa8ff',actionInk:'#111827'}),
        crimson:Object.freeze({scheme:'dark',shell:'#170d12',main:'#1b1016',surface:'#24131a',card:'#301923',cardHover:'#3a1f2b',input:'#180d13',line:'#5b2f3a',ink:'#fff2f5',sub:'#d8b8c0',accent:'#ff7670',accentSoft:'#ff767024',gold:'#ffb347',mint:'#e49aac',head:'#230f16',nav:'#180a10',notice:'#2d1b13',action:'#ff7670',actionInk:'#2a0e13'}),
        indigo:Object.freeze({scheme:'dark',shell:'#0d1024',main:'#11152d',surface:'#171b39',card:'#20254a',cardHover:'#292f5a',input:'#0e1229',line:'#373d72',ink:'#f0f2ff',sub:'#bec3e8',accent:'#8b78ff',accentSoft:'#8b78ff25',gold:'#ffd166',mint:'#65c9c3',head:'#11162f',nav:'#0a0d20',notice:'#29231a',action:'#8b78ff',actionInk:'#101426'}),
        parchment:Object.freeze({scheme:'light',shell:'#e8dcc3',main:'#f1e7d2',surface:'#fff7e7',card:'#f4e6ca',cardHover:'#eddcbc',input:'#fffaf0',line:'#c9ad79',ink:'#392b18',sub:'#6c5432',accent:'#855a16',accentSoft:'#855a1620',gold:'#7a5215',mint:'#4f6f3d',head:'#5c4325',nav:'#6b5030',notice:'#f2dfb9',action:'#d9a441',actionInk:'#2b1a08'}),
        sakura:Object.freeze({scheme:'light',shell:'#f4dce4',main:'#fff0f5',surface:'#fff9fb',card:'#fbe3eb',cardHover:'#f6d8e3',input:'#fffafd',line:'#ddb6c5',ink:'#432532',sub:'#765466',accent:'#a63f69',accentSoft:'#a63f6922',gold:'#8a5624',mint:'#446f62',head:'#6c3148',nav:'#7b3d55',notice:'#f7e2d3',action:'#ee8eb3',actionInk:'#3b1e2a'}),
        matcha:Object.freeze({scheme:'light',shell:'#dcebd4',main:'#eef5e8',surface:'#fbfdf8',card:'#e3efd9',cardHover:'#d8e8cc',input:'#fbfff7',line:'#b7cbaa',ink:'#263823',sub:'#53694f',accent:'#3e7746',accentSoft:'#3e774622',gold:'#73591f',mint:'#39725f',head:'#31563a',nav:'#284630',notice:'#edf0ce',action:'#79b77e',actionInk:'#17311f'})
    });
    const WORLD_TONE_KEYS = new Set(Object.keys(WORLD_UI_THEMES));
    const WORLD_UI_THEME_CSS = Object.entries(WORLD_UI_THEMES).map(([tone,theme])=>{
        const vars=Object.entries(theme).filter(([key])=>key!=='scheme').map(([key,value])=>'--we-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+value).join(';');
        return '#sam-world-engine[data-tone="'+tone+'"]{'+vars+';color-scheme:'+theme.scheme+'}';
    }).join('\n');
    const WORLD_FONT_SCALES = {
        standard:{name:'标准',size:'16px',desc:'正文约15px，辅助字不低于13px'},
        large:{name:'大字',size:'18px',desc:'正文约17px，辅助字约14-15px'},
        xlarge:{name:'特大',size:'20px',desc:'正文约19px，远距离阅读'}
    };
    const PATH = '后台';
    const EVENT_TARGET = 180;
    const RECENT_FINISHED_EVENT_TARGET = 8;
    const FINISHED_EVENT_GRACE_HOURS = 24;
    const HOT_HISTORY_TARGET = 24;
    const HOT_OFFSET_TARGET = 8;
    const HOT_PROPAGATION_TARGET = 24;
    const HOT_PERSON_TARGET = 24;
    const HOT_PERSON_RECENT_HOURS = 72;
    const COLD_TEMP_PERSON_GRACE_HOURS = 30 * 24;
    const COLD_TEMP_PERSON_TARGET = 32;
    const TERMINAL_PERSON_STATUS = /^(?:已结束|结束|已离场|离场|已离开|离开|退休|已退休|失效|已失效|消失|已消失|死亡)$/;
    const TECHNICAL_BOOK = [/^\[variables\]/i,/^\[mvu_update\]/i,/^output_format_/i,/^⚙️额外思考(?:\.|$)/,/^行动选项_/i,/^【(?:主神任务|结算任务|试炼任务|选择世界)】/];
    const isTechnicalBook = title => TECHNICAL_BOOK.some(rule => rule.test(String(title || '').trim()));
    // 聊天接口返回原始消息，不会应用酒馆的显示正则。发送和关键词扫描共用此抽取结果。
    function extractWorldProse(value) {
        let source=String(value??'').replace(/\r\n?/g,'\n');
        source=source.replace(/<!--[\s\S]*?(?:-->|$)/g,'\n');
        source=source.replace(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>[\s\S]*?(?:<\/details>|$)/gi,
            (block,title)=>/思考|思维链|变量|更新|检定|结算|状态栏|thinking|reasoning|analysis/i.test(title)?'\n':block);
        const hidden=new Set(['think','thinking','reasoning','analysis','konatan_planning','dm_think','chain_of_thought',
            'updatevariable','jsonpatch','variables','status_current_variables','user_status_readonly',
            'worldresult','options','statusplaceholder',
            'action','summary','update','scene_time','pic','dicecombat','dicecheck','enemyoverview',
            'summonoverview','lootlog','experiencelog','questcontract','merchantstore','combatsnapshot',
            'ash-review','acu-review','ash_review','acu_review','ash_note','acu_note','ash-review-slot',
            'script','style','head','iframe']); // 'combatresult','craftresult','checkresult',
        // 部分正文模型通过 assistant prefill 注入隐藏块的开始标签，最终楼层只会保存结束标签。
        // 仅对思考类标签启用“首个隐藏标签为孤立结束标签”的兼容，避免误吞变量/面板前的正常正文。
        const prefillHidden=new Set(['think','thinking','reasoning','analysis','konatan_planning','dm_think','chain_of_thought']);
        // 按标签栈移除整个技术块，支持嵌套与属性；未闭合技术块的剩余内容也不发送。
        const tags=/<\s*(\/?)\s*([a-z_][\w-]*)\b[^>]*>/gi;
        const stack=[];let text='',cursor=0,match,seenHiddenTag=false;
        while((match=tags.exec(source))){
            const name=match[2].toLowerCase();
            if(!hidden.has(name))continue;
            const closing=!!match[1];
            // assistant prefill 可能把 <thinking>/<konatan_planning~> 等开始标签放在保存文本之外。
            // 若本楼第一个隐藏边界就是对应结束标签，则从消息开头到该标签都属于隐藏思考。
            if(closing&&!stack.length&&!seenHiddenTag&&prefillHidden.has(name)){
                cursor=tags.lastIndex;
                seenHiddenTag=true;
                continue;
            }
            seenHiddenTag=true;
            if(!stack.length)text+=source.slice(cursor,match.index);
            if(closing){
                const at=stack.lastIndexOf(name);
                if(at>=0)stack.length=at;
            }else if(!/\/\s*>$/.test(match[0]))stack.push(name);
            cursor=tags.lastIndex;
            if(!stack.length)text+='\n';
        }
        if(!stack.length)text+=source.slice(cursor);
        // 代码面板不属于已演出剧情；无语言标记的纯叙事围栏仍可兼容。
        text=text.replace(/^[ \t]*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm,
            (_block,_fence,language,body)=>{
                if(/^(?:json\w*|ya?ml|html|xml|javascript|js|typescript|ts|css|python|diff)\b/i.test(language.trim()))return '\n';
                try{const data=JSON.parse(body);if(data&&typeof data==='object')return '\n';}catch(_){}
                return body;
            });
        // 对应参考助手 bodyTagsText 为空的模式：始终清洗整楼，不按正文标签截取。
        try{const data=JSON.parse(text);if(data&&typeof data==='object')return '';}catch(_){}
        return text.replace(/<[^>]+>/g,tag=>/^<user>$/i.test(tag)?tag:'')
            .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    }
    function isTimelineBackboneEntry(title) {
        const name=String(title||'').replace(/\s+/g,'');
        if(/(?:变量|输出格式|更新规则|COT|思考|风格|助手|状态栏)/i.test(name))return false;
        return /(?:校历|世界年表|事件年表|原著年表|时间线|时间轴|大事记|大事件摘要|历史大事件|剧情大纲|剧情章节|章节控制器|主线年表)/i.test(name);
    }
    function worldDateKey(value) {
        const source=String(value||'');
        let m=source.match(/(\d{1,4})\s*年\s*-?\s*(\d{1,2})\s*月\s*-?\s*(\d{1,2})\s*日/);
        if(!m)m=source.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
        if(!m)return null;
        const y=+m[1],month=+m[2],day=+m[3];
        if(!Number.isInteger(y)||!Number.isInteger(month)||!Number.isInteger(day)||month<1||month>12||day<1)return null;
        const date=new Date(0);
        date.setUTCFullYear(y,month-1,day);date.setUTCHours(0,0,0,0);
        // 数字年月日按真实公历天序计算，避免 2月28日→3月1日 被旧“每月31天”近似拉成96小时。
        // 非公历/相对语义本来就不会匹配这里，继续由语义复核处理。
        if(date.getUTCFullYear()!==y||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
        const part=source.match(/凌晨|黎明|清晨|早晨|上午|中午|午后|下午|傍晚|入夜|晚上|深夜/);
        const hour={凌晨:2,黎明:5,清晨:6,早晨:8,上午:10,中午:12,午后:14,下午:15,傍晚:18,入夜:19,晚上:20,深夜:23};
        let dayHour=part?hour[part[0]]:0;
        const branch=source.match(/([子丑寅卯辰巳午未申酉戌亥])时(?:([一二三四1234])刻)?/);
        if(branch){
            const branchHour={子:23,丑:1,寅:3,卯:5,辰:7,巳:9,午:11,未:13,申:15,酉:17,戌:19,亥:21};
            const quarterMap={一:1,二:2,三:3,四:4,'1':1,'2':2,'3':3,'4':4};
            dayHour=branchHour[branch[1]]+(quarterMap[branch[2]]||0)*0.25;
        }
        return date.getTime()/3600000+dayHour;
    }
    function worldTimeCapacity(previous,current) {
        const from=String(previous||'').trim(),to=String(current||'').trim();
        const a=worldDateKey(from),b=worldDateKey(to);
        if(!from)return {起点:'首次运行/无上次引擎时间',终点:to,小时:null,等级:'首轮初始化',允许:'先建立宏观骨架；近期细节只依据当前事实，不假定额外耗时。'};
        if(a!==null&&b!==null){
            const hours=Math.max(0,b-a);
            if(hours<=0)return {起点:from,终点:to,小时:0,等级:'未推进',允许:'只能记录本轮新确认事实、即时反应或同步结果；不得完成需要时间的后台事项。'};
            if(hours<=2)return {起点:from,终点:to,小时:hours,等级:'短时段',允许:'只够当面短谈、通讯、案头事务或同区域短途移动；大型行动只能准备或启动。'};
            if(hours<=12)return {起点:from,终点:to,小时:hours,等级:'数小时',允许:'允许同城区移动、有限调查/准备、一次工作阶段；跨城或大规模调动通常不能完成。'};
            if(hours<=24)return {起点:from,终点:to,小时:hours,等级:'半天至一天',允许:'允许完成一套日常事务、一次较完整阶段或城区迁移；长期工程与远距行动仍需分段。'};
            return {起点:from,终点:to,小时:hours,等级:'数日以上',允许:'可推进长途行程、物资转运、据点/组织事项的多个阶段，但仍按因果与资源逐步推进。'};
        }
        return {起点:from,终点:to,小时:null,等级:'作品内时间',允许:'按作品内时间语义保守估计行动容量；无法确认跨度时只推进一步，不直接跳到长期结果。'};
    }
    // 仅供日历显示：优先使用可识别数字年份；作品纪年无法识别年份但能识别月日时，用 2026 作为显示年。
    // 若世界.历法提供月份天数，则以该历法为准，不再套用公历月长。
    function calendarDate(value, calendar) {
        const source=String(value||'').trim();
        const full=source.match(/(?:^|[^\d])(\d{1,4})\s*年\s*-?\s*(\d{1,2})\s*月\s*-?\s*(\d{1,2})\s*日/)||source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
        let y,month,d,fallbackYear=false;
        if(full){
            y=+full[1];month=+full[2];d=+full[3];
        }else{
            const md=source.match(/(?:^|[^\d])(\d{1,2})\s*月\s*-?\s*(\d{1,2})\s*日/)||source.match(/(?:^|[^\d])(\d{1,2})[-/.](\d{1,2})(?!\d)/);
            if(!md)return null;
            y=2026;month=+md[1];d=+md[2];fallbackYear=true;
        }
        const custom=Array.isArray(calendar?.月份天数)?calendar.月份天数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24):[];
        if(custom.length){
            if(month<1||month>custom.length||d<1||d>custom[month-1])return null;
            return {y,m:month,d,key:y+'-'+month+'-'+d,fallbackYear,customCalendar:true};
        }
        const date=new Date(0);
        date.setFullYear(y,month-1,d);date.setHours(0,0,0,0);
        if(date.getFullYear()!==y||date.getMonth()!==month-1||date.getDate()!==d)return null;
        return {y,m:month,d,key:y+'-'+month+'-'+d,fallbackYear,customCalendar:false};
    }
    const DEFAULT_PRESET = `你是轮回战场的世界引擎。只推进正文场景之外仍在运行的世界，并保持事件、场景、人物、势力、传播、资产与因果一致。
【执行流程】
Step 1 · 取事实：按“当前变量/本轮已确认剧情 > 明确世界书 > 模型常识”读取；已确认差异优先。
Step 2 · 定边界：确认当前阶段与下一宏观节点；只有篇章、地区、战争、势力或关键人物命运发生阶段变化时才调整宏观骨架。
Step 3 · 推区间：严格按本轮时间容量，先处理到期/进行中事项，再把未完事项推进合理一步；计划不是事实，不越过下一宏观边界。
Step 4 · 现场到人物：先更新当前区间内确实变化的地区现场，再决定人物行动。人物受地点、路程、能力、认知、职责、资产与地区条件约束。模型看到正文楼层/当前变量不等于人物知情；场外人物若因<user>新行为改变目标或行动，必须已有相应认知，或本轮经观察、目击、通讯、传播获得并同步人物.认知/认知来源；没有来源则维持原目标/行动，只推进其自身事务。同场正文未决时停在交互前。活跃异端每轮复核。
Step 5 · 结算玩家影响：只按<user>已确认行为结算探索、势力与重大因果偏移；这是客观世界结算，不得据此让未获知情报的场外人物自动追踪、伏击或改策。必要时重构宏观骨架。
Step 6 · 更新传播：只维护本轮真实变化的传播、货币与历法；结束/过期传播不复活。
Step 7 · 输出差分：先按“历史摘要”规则写摘要，再只输出本轮新增或变化的 WorldResult；无业务变化也要客观说明本轮没有新增世界事实。
【执行检查】
时间/路程可实现；人物知识有来源；同一人物同一时段只在一处；不替<user>行动；不复述已演出琐事；世界不会因<user>停下而暂停。`;
    const BUILTIN_DEFAULT_SELECTED_ENTRIES = [
            "[\"轮回战场V3.6.1\",\"915830\"]",
            "[\"轮回战场V3.6.1\",\"196248\"]",
            "[\"轮回战场V3.6.1\",\"503929\"]",
            "[\"轮回战场V3.6.1\",\"931853\"]",
            "[\"轮回战场V3.6.1\",\"446543\"]",
            "[\"轮回战场V3.6.1\",\"381583\"]",
            "[\"轮回战场V3.6.1\",\"965161\"]",
            "[\"轮回战场V3.6.1\",\"556346\"]",
            "[\"轮回战场V3.6.1\",\"122086\"]",
            "[\"轮回战场V3.6.1\",\"2\"]",
            "[\"轮回战场V3.6.1\",\"562289\"]",
            "[\"轮回战场V3.6.1\",\"937185\"]",
            "[\"轮回战场V3.6.1\",\"612483\"]",
            "[\"轮回战场V3.6.1\",\"544521\"]",
            "[\"轮回战场V3.6.1\",\"454622\"]",
            "[\"轮回战场V3.6.1\",\"671885\"]",
            "[\"轮回战场V3.6.1\",\"345604\"]",
            "[\"轮回战场V3.6.1\",\"558862\"]",
            "[\"轮回战场V3.6.1\",\"78614\"]",
            "[\"轮回战场V3.6.1\",\"229663\"]",
            "[\"轮回战场V3.6.1\",\"985921\"]",
            "[\"轮回战场V3.6.1\",\"625413\"]",
            "[\"轮回战场V3.6.1\",\"8412\"]",
            "[\"轮回战场V3.6.1\",\"559085\"]"
        ];
    const BUILTIN_DEFAULT_WORLD_BOOK_EXCLUSIONS = new Set(['任务与委托系统']);
    const USER_DEFAULT_PROMPT_DOCUMENT_ID='user-default';
    const CORE_WORLD_RULES = `【世界引擎核心约束】
1. 事实：当前变量与已确认剧情 > 明确世界书 > 模型常识；计划不是事实，已确认差异不得被原著常识覆盖。
2. 宏观与时间：只用世界.时间计算本世界进展；宏观顺序保持3~5个阶段级节点，细节只推进到下一宏观边界。待发生/进行中事件必须有可排序时间或明确因果时间；无法确认跨度时只推进一步。
3. 现场与认知：现场群体与环境事实属于势力地区，同一现场事实不得复制进人物。先更新地区现场再决定人物行动；模型看到正文楼层、当前变量和<user>已确认行为，只代表世界事实，不等于任何场外人物知情。人物只能依据在场观察、既有认知、可信通讯/传播链行动；若因<user>新行为改变目标或行动，必须有可追溯的认知来源（已有或本轮写入人物.认知/认知来源），没有来源不得针对<user>即时反应。
4. 人物边界：活跃异端每轮复核，死亡不可恢复；普通人物只保留真正热记录。不得替<user>建立后台行动。主神任务、晋升试炼、任务状态、副本成就不读取、不更新、不据此驱动世界。普通副本返回主神空间后停止本世界推演；单一世界局部结算不重置世界。
5. 资产：仅限固定地产、大型载具或要塞；药剂、材料、消耗品、钥匙、剧情物品、单兵装备/形态不得写入资产。顶层资产是唯一资产账簿；所属对象为数组，可按已确认场外事实新增、更新、转移或移除；删除保护中的同名资产不得重建，正文/MVU已结算变化不重复结算。
6. 玩家台账：探索只结算<user>实际到达、调查或可靠获知的整体区域；探索度以0/10/30/60/90/100为阶段锚点且无因不回退。势力声望只因<user>真实关系结果变化，同一结果只结算一次，单轮绝对变化≤1000，超过500仅限重大事件。
7. 因果：只在关键人物命运、重大事件结果、势力格局或主线可行性实质改变时记偏移；负值=因果破坏，正值=修复/强化。世界超稳不新增偏移；旧轨道失效时同轮重构宏观顺序。
8. 公开与基础：当前事件公开字段只写已成为现实且可合理感知的信息。货币只随真实流通体系变化，任务世界不用空间币作本地货币；历法只在可靠设定明确时维护。
9. 历史摘要：摘要只写本轮已确认的主体、动作、结果、关键状态变化与持续影响；区分计划、进行与完成，禁止“已建立骨架”“已完成推演”“局势暗涌”等运行话术或空泛概括。`;
    const DEFAULT_MACRO_PROMPT = `【本轮宏观骨架交付】
先完成输入“本轮必须完成的宏观骨架”，再推演近期细节。至少3个可推进宏观节点是合并后的交付底线，进行中+待发生合计。未来规划可以跨越下一宏观边界，实际发生与细节推进不能越界；只输出差分不意味着可以省略尚未建立的骨架。提交前检查事件实体、分类、状态、时间、前因与因果.宏观顺序相互对应。`;
    const DEFAULT_STABILITY_PROMPT_TEMPLATE = `【世界自救 · {{阶段}}】
当前稳定值：{{稳定值}}。{{规则}}
排异必须借世界观内合理载体发生，优先针对造成异常的轮回者及其据点、关系网、资源与行动路径；NPC仍只能依据自身认知和传播链行动，不得凭空全知。法则越破不代表主动排异越弱。`;
    const BUILTIN_DEFAULT_PROMPT_DOCUMENT = {
        id:'builtin-default',
        type:'samsara-world-prompt-document',
        version:20,
        builtin:true,
        name:'默认设置',
        exportedAt:'2026-09-14T13:00:00.000Z',
        createdAt:'2026-09-08T13:09:45.350Z',
        updatedAt:'2026-09-14T13:00:00.000Z',
        settings:{
            corePrompt:CORE_WORLD_RULES,
            macroPrompt:DEFAULT_MACRO_PROMPT,
            stabilityPromptTemplate:DEFAULT_STABILITY_PROMPT_TEMPLATE,
            preset:normalizeEditablePreset(DEFAULT_PRESET),
            contextTurns:3,
            activationMode:'respect_activation',
            selectedEntries:copy(BUILTIN_DEFAULT_SELECTED_ENTRIES)
        }
    };
    const BUILTIN_DEFAULT_PROMPT_VERSION = BUILTIN_DEFAULT_PROMPT_DOCUMENT.version;
    const WORLD_STABILITY_DEFENSE_STAGES = [
        {min:90,title:'因果警觉',rule:'异常线索、调查、误会与既有敌意开始沿合理因果链向轮回者及其直接关系网汇聚；仍以自然事件表现，不形成公开围剿。'},
        {min:80,title:'定向排异',rule:'藏身处、计划、联系人、资源链与行动路径持续受压；压力优先集中到轮回者本人及其直接关系网。'},
        {min:70,title:'因果追猎',rule:'原生强者、组织与主线冲突逐步被因果收束引向轮回者；据点、盟友、补给与撤退路线开始被系统性破坏。'},
        {min:60,title:'全面围剿',rule:'多个原生势力可基于各自合理动机同时追捕、封锁或攻击轮回者；普通安全生活基本结束。'},
        {min:50,title:'世界武器化',rule:'战争、灾害、怪物潮与原生顶级强者可沿因果链压向轮回者活动区；世界开始接受区域毁灭与大规模误伤作为清除代价。'},
        {min:40,title:'猎杀现实',rule:'环境、空间、时间与残存原生规则都可成为猎杀载体；世界接受永久区域毁灭，只求把入侵源一并埋葬。'},
        {min:30,title:'献祭式清除',rule:'世界进入免疫风暴，可牺牲主线人物、城市、国家乃至文明结构换取清除轮回者。'},
        {min:10,title:'终焉围猎',rule:'毁灭性事件持续向轮回者及其停留区域收束；长期停留会把灾难引向当前位置。'},
        {min:1,title:'同归于尽',rule:'世界放弃自保，主动牺牲法则、时间线与现实结构清除轮回者。'},
        {min:0,title:'世界毁灭',rule:'因果链、世界法则、时间线与现实结构均已终止，不再生成常规世界推进。'}
    ];
    function worldStabilityPrompt(stat, template=DEFAULT_STABILITY_PROMPT_TEMPLATE) {
        if(stat?.设置?.世界超稳===true)return '';
        const raw=Number(stat?.世界?.稳定),stable=Number.isFinite(raw)?Math.max(0,Math.min(120,raw)):100;
        if(stable>=100)return '';
        const stage=WORLD_STABILITY_DEFENSE_STAGES.find(item=>stable>=item.min)||WORLD_STABILITY_DEFENSE_STAGES.at(-1);
        const source=String(template??DEFAULT_STABILITY_PROMPT_TEMPLATE);
        if(!source.trim())return '';
        return source.split('{{阶段}}').join(stage.title).split('{{稳定值}}').join(String(stable)).split('{{规则}}').join(stage.rule);
    }
    function splitPresetSegments(value) {
        return String(value||'').split(/\n(?=【)/).filter(Boolean).map(part=>{
            const m=part.match(/^【([^】]+)】\s*\n?/);
            return m?{title:m[1],body:part.slice(m[0].length)}:{title:'',body:part};
        });
    }
    function cleanSegmentTitle(value) {
        return String(value||'').replace(/[【】\r\n]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
    }
    function segmentText(segment) {
        const title=cleanSegmentTitle(segment.title);
        return title?'【'+title+'】\n'+String(segment.body||'').trim():String(segment.body||'').trim();
    }
    function normalizeEditablePreset(value) {
        return splitPresetSegments(value).map(segment=>({
            title:cleanSegmentTitle(segment.title),
            body:String(segment.body||'')
        })).map(segmentText).filter(Boolean).join('\n');
    }
    function parseSelectedEntryKey(value) {
        try{
            const parsed=JSON.parse(String(value||''));
            return Array.isArray(parsed)&&parsed.length>=2?[String(parsed[0]||''),String(parsed[1]??'')]:null;
        }catch(_){return null;}
    }
    function normalizeWorldbookIdentity(value) {
        let name=String(value||'').trim().toLowerCase();
        const versionAt=name.search(/(?:\bv(?:er(?:sion)?)?|版本)?\s*\d+(?:\.\d+){1,3}/i);
        if(versionAt>0)name=name.slice(0,versionAt);
        return name.replace(/[\s_\-·.]+/g,'');
    }
    function normalizeWorldbookEntryTitle(value) {
        return String(value||'').trim().replace(/^⚙(?:\uFE0F)?\s*/u,'').trim();
    }
    function selectedEntryMatches(entry, selectedEntries) {
        if(!Array.isArray(selectedEntries))return entry?.enabled!==false;
        const exact=JSON.stringify([String(entry?.book||''),String(entry?.id??'')]);
        if(selectedEntries.includes(exact))return true;
        const entryBook=normalizeWorldbookIdentity(entry?.book),entryId=String(entry?.id??'');
        for(const raw of selectedEntries){
            const ref=parseSelectedEntryKey(raw);if(!ref||ref[1]!==entryId)continue;
            if(ref[0]==='*'||(entryBook&&normalizeWorldbookIdentity(ref[0])===entryBook))return true;
        }
        return false;
    }
    function ensurePresetStructure(value) {
        const current=splitPresetSegments(value||DEFAULT_PRESET).map(segment=>segment.title==='势力与地区'?{...segment,title:'探索与势力'}:segment);
        const defaults=splitPresetSegments(DEFAULT_PRESET);
        const titles=new Set(current.map(s=>s.title).filter(Boolean));
        for(const segment of defaults)if(segment.title&&!titles.has(segment.title))current.push(segment);
        return current.map(segmentText).filter(Boolean).join('\n');
    }    const RECORDS = {
        事件: { 描述:'', 时间:'', 条件:'', 前因:[], 状态:'待发生', 默认走向:'', 结果:'', 公开征兆:'', 地点:'' },
        人物: { 所属世界:'', 地点:'', 目标:'', 行动:'', 认知:[], 下次检查:'', 关联事件:[], 公开动态:'' },
        势力地区: { 类型:'地区', 描述:'', 目标:'', 进展:'', 下次检查:'', 关联事件:[], 公开动态:'' },
        历史: { 时间:'', 事实:'', 关联事件:[] },
        传播: { 关联事件:[], 来源:'', 范围:'', 时间:'', 内容:'', 真相:'', 状态:'传播中' }
    };
    // 可选明细兼容第一版记录：对应参考助手的行程、承诺、认知、资源及任务阶段。
    const DETAILS = {
        事件: {分类:'',开始时间:'',预计结束:'',更新时间:'',下次检查:'',参与者:[],关联任务:[],可见影响:[{时间:'',地点:'',影响:''}]},
        人物: {状态:'',更新时间:'',开始时间:'',预计结束:'',行程:[{开始:'',结束:'',地点:'',行动:'',状态:'',结果:''}],承诺:[{对象:'',内容:'',期限:'',解除条件:''}],待决事项:[{问题:'',选项:[],等待:''}],关系变化:[{对象:'',关系:'',变化:'',时间:''}],认知来源:[{事实:'',来源:'',获知时间:'',状态:''}],登场条件:'',背景关联:[{类型:'',名称:'',关系:''}]},
        势力地区: {更新时间:'',控制方:'',争夺方:[],资源:[{名称:'',数量:'',用途:'',限制:''}],内部派系:[{名称:'',立场:'',行动:'',影响:''}],近期变化:[{时间:'',事实:'',关联事件:''}],环境状态:[],现场群体:[{名称:'',规模:'',身份:'',动态:''}]},
        历史:{},传播:{更新时间:'',到期时间:'',受众:[],引发行动:[]}
    };
    const MODEL_RECORDS = copy(RECORDS);
    const MODEL_DETAILS = copy(DETAILS);
    for (const key of ['承诺','待决事项','关系变化']) delete MODEL_DETAILS.人物[key];

    function derivePersonWorldContext(stat, personName, playerName='') {
        const backend=stat?.世界?.[PATH]||{},people=backend.人物||{},areas=backend.势力地区||{};
        const key=value=>String(value||'').toLowerCase().replace(/[\/／·・._\-\s]+/g,'');
        const normalizedName=key(personName);
        const pair=Object.entries(people).find(([name])=>key(name)===normalizedName);
        const person=pair?.[1]||{},location=String(person.地点||'').trim();
        const related=(a,b)=>{
            const x=key(a),y=key(b);if(!x||!y)return false;
            return x===y||x.includes(y)||y.includes(x);
        };
        const areaPair=Object.entries(areas)
            .filter(([,area])=>plain(area)&&area.类型!=='势力'&&related(location,area?.名称||''))
            .sort((a,b)=>String(b[0]).length-String(a[0]).length)[0]
            ||Object.entries(areas)
                .filter(([name,area])=>plain(area)&&area.类型!=='势力'&&related(location,name))
                .sort((a,b)=>String(b[0]).length-String(a[0]).length)[0];
        const areaName=String(areaPair?.[0]||''),area=areaPair?.[1]||{};
        const relationByKey=new Map(Object.entries(stat?.关系列表||{}).map(([name,record])=>[key(name),{名称:name,记录:record}]));
        const alienByKey=new Map(Object.entries(stat?.世界?.异端雷达?.名单||{}).map(([name,record])=>[key(name),record]));
        const playerKeys=new Set([playerName,'{{user}}','<user>','玩家'].filter(Boolean).map(key));
        const nearby=Object.entries(people)
            .filter(([name,other])=>{
                const otherKey=key(name);if(!plain(other)||otherKey===normalizedName||playerKeys.has(otherKey))return false;
                if(alienByKey.get(otherKey)?.状态==='死亡')return false;
                const otherLocation=String(other.地点||'').trim();if(!otherLocation)return false;
                return areaName?related(otherLocation,areaName):related(otherLocation,location);
            })
            .map(([name,other])=>{
                const profile=relationByKey.get(key(name));
                const relation=profile?.记录||{};
                const identity=Array.isArray(relation.身份)?relation.身份[0]:String(relation.身份||'');
                return {
                    名称:String(name),
                    关系:key(other.地点)===key(location)?'贴身':'同地区',
                    身份:identity,
                    行动:String(other.行动||other.公开动态||relation.态度||''),
                    可查看档案:!!profile,
                    档案名称:String(profile?.名称||''),
                    档案类型:profile?'正式档案':'现场标签'
                };
            })
            .slice(0,8);
        const objectList=(value,limit=8)=>Array.isArray(value)?value.filter(plain).slice(0,limit).map(copy):[];
        return {
            地区:areaName,
            地区动态:String(area.公开动态||area.进展||''),
            控制方:String(area.控制方||''),
            争夺方:Array.isArray(area.争夺方)?area.争夺方.filter(Boolean).slice(0,6):[],
            环境状态:Array.isArray(area.环境状态)?area.环境状态.filter(Boolean).slice(0,6):[],
            背景关联:objectList(person.背景关联,8),
            关联事件:Array.isArray(person.关联事件)?person.关联事件.filter(Boolean).slice(0,8):[],
            身边人物:nearby,
            现场群体:objectList(area.现场群体,8)
        };
    }

    function collectEventRefs(state) {
        const refs=new Set();
        for(const event of Object.values(state.事件||{}))for(const id of event.前因||[])refs.add(id);
        for(const category of ['人物','势力地区','传播'])for(const record of Object.values(state[category]||{}))for(const id of record.关联事件||[])refs.add(id);
        return refs;
    }
    function detachEventSoftRefs(state,eventName) {
        const changed=[];
        for(const category of ['人物','势力地区','传播']){
            for(const [name,record] of Object.entries(state?.[category]||{})){
                if(!Array.isArray(record?.关联事件)||!record.关联事件.includes(eventName))continue;
                record.关联事件=record.关联事件.filter(id=>id!==eventName);
                changed.push(category+'/'+name);
            }
        }
        return changed;
    }
    function archiveFinishedEvent(stat,state,name,event,archived) {
        let key='归档·'+name,seq=2;
        while(Object.hasOwn(state.历史||{},key))key='归档·'+name+'#'+seq++;
        state.历史=state.历史||{};
        state.历史[key]={
            时间:event.更新时间||event.预计结束||event.时间||stat.世界.时间||'',
            事实:event.结果||event.描述||(event.状态==='已取消'?'事件已取消':'事件已结束'),
            关联事件:[]
        };
        delete state.事件[name];
        archived.push(name);
    }
    function propagationEnded(record,nowKey) {
        if(!plain(record))return true;
        const status=String(record.状态||'').trim();
        if(/^(?:已结束|结束|已停止|停止|已失效|失效|已过期|过期|传播结束)$/.test(status))return true;
        const expiry=worldDateKey(record.到期时间);
        return expiry!==null&&nowKey!==null&&expiry<=nowKey;
    }
    function pruneSoftRefsToColdFinishedEvents(state,now) {
        if(now===null)return [];
        const cold=new Set();
        for(const [name,event] of Object.entries(state?.事件||{})){
            if(!['已完成','已取消'].includes(event?.状态))continue;
            const endedAt=worldDateKey(event.更新时间||event.预计结束||event.时间);
            if(endedAt!==null&&now-endedAt>=FINISHED_EVENT_GRACE_HOURS)cold.add(name);
        }
        if(!cold.size)return [];
        const changed=[];
        for(const eventName of cold)changed.push(...detachEventSoftRefs(state,eventName));
        // 已结束且同样进入冷区的事件之间不再互相作为热前因引用；
        // 活跃/未来事件的前因仍保留，因此不会破坏仍在推进的因果链。
        for(const [name,event] of Object.entries(state?.事件||{})){
            if(!cold.has(name)||!Array.isArray(event?.前因)||!event.前因.some(id=>cold.has(id)))continue;
            event.前因=event.前因.filter(id=>!cold.has(id));
            changed.push('事件/'+name);
        }
        return changed;
    }
    function compactFinishedEvents(stat,target=EVENT_TARGET) {
        const state=stat?.世界?.[PATH]; if(!state?.事件)return [];
        const archived=[],now=worldDateKey(stat?.世界?.时间);
        pruneSoftRefsToColdFinishedEvents(state,now);
        const protectedNames=new Set(storyStages(stat?.世界?.因果轨道?.故事线));
        let refs=collectEventRefs(state);
        const finished=()=>Object.entries(state.事件||{}).filter(([name,event])=>['已完成','已取消'].includes(event.状态)&&!refs.has(name)&&!protectedNames.has(name));
        // 有明确时间的旧结束事件，在经过一个世界日后直接冷归档；刚刚结束的内容至少保留到下一阶段。
        for(const [name,event] of finished()){
            const endedAt=worldDateKey(event.更新时间||event.预计结束||event.时间);
            if(now!==null&&endedAt!==null&&now-endedAt>=FINISHED_EVENT_GRACE_HOURS)archiveFinishedEvent(stat,state,name,event,archived);
        }
        // 无法比较作品内时间时，用“最多保留最近8条结束事件”兜底，避免长期无限增长。
        refs=collectEventRefs(state);
        let candidates=finished();
        while(candidates.length>RECENT_FINISHED_EVENT_TARGET){
            const [name,event]=candidates[0];
            archiveFinishedEvent(stat,state,name,event,archived);
            refs=collectEventRefs(state);candidates=finished();
        }
        // 旧存档超大时继续沿用硬上限兜底，只回收无引用的结束事件。
        while(Object.keys(state.事件||{}).length>target){
            refs=collectEventRefs(state);
            const candidate=Object.entries(state.事件||{}).find(([name,event])=>['已完成','已取消'].includes(event.状态)&&!refs.has(name));
            if(!candidate)break;
            archiveFinishedEvent(stat,state,candidate[0],candidate[1],archived);
        }
        // 历史锚点是永久已确认事实，不再按固定数量删除；旧事实由分层历史总结退出热上下文。
        return archived;
    }
    function explorationLocationRefs(record,kind) {
        if(!plain(record))return [];
        const out=[];
        if(String(record.地点||'').trim())out.push(String(record.地点).trim());
        if(kind==='事件'){
            for(const item of Array.isArray(record.可见影响)?record.可见影响:[]){
                if(plain(item)&&String(item.地点||'').trim())out.push(String(item.地点).trim());
            }
        }else if(kind==='人物'){
            for(const item of Array.isArray(record.行程)?record.行程:[]){
                if(!plain(item)||!String(item.地点||'').trim())continue;
                const status=String(item.状态||'').trim();
                if(/^(?:已完成|完成|已结束|结束|已取消|取消|已失效|失效)$/.test(status))continue;
                out.push(String(item.地点).trim());
            }
        }
        return out;
    }
    function pruneColdExploration(stat) {
        const world=stat?.世界,bucket=world?.探索,state=world?.[PATH];
        if(!plain(bucket)||!state)return [];
        const currentLocation=String(world?.地点||'').trim();
        // 没有当前地点时无法证明玩家已经离开，宁可保留，避免误删长期档案。
        if(!currentLocation)return [];
        const eventLocations=Object.values(state.事件||{}).flatMap(record=>explorationLocationRefs(record,'事件'));
        const personLocations=Object.values(state.人物||{}).flatMap(record=>explorationLocationRefs(record,'人物'));
        const removed=[];
        for(const areaName of Object.keys(bucket)){
            if(!String(areaName||'').trim())continue;
            if(worldLocationRelated(currentLocation,areaName))continue;
            if(eventLocations.some(location=>worldLocationRelated(location,areaName)))continue;
            if(personLocations.some(location=>worldLocationRelated(location,areaName)))continue;
            delete bucket[areaName];
            removed.push(areaName);
        }
        return removed;
    }
    function compactWorldLifecycle(stat) {
        const state=stat?.世界?.[PATH];
        if(!state)return {归档事件:[],回收传播:[],回收人物:[],回收探索:[]};
        const now=worldDateKey(stat?.世界?.时间),removed=[];
        for(const [name,record] of Object.entries(state.传播||{})){
            if(propagationEnded(record,now)){delete state.传播[name];removed.push(name);}
        }
        const archived=compactFinishedEvents(stat);
        const removedPeople=pruneColdTemporaryPeople(stat);
        // 先回收已经结束的事件与冷人物，再判断哪些探索区域真正失去剧情关联。
        const removedExploration=pruneColdExploration(stat);
        return {归档事件:archived,回收传播:removed,回收人物:removedPeople,回收探索:removedExploration};
    }
    function storyStages(value) {
        return String(value||'').split(/\s*(?:→|⇒|->|=>|\n)\s*/).map(x=>x.trim()).filter(x=>x&&!/^(待初始化|无|未知)$/.test(x));
    }
    const VAGUE_EVENT_TIME=/^(?:近期|稍后|未来|之后|待定|未定|未知|不详|待确认|时间未定|日期未定)$/;
    function eventTimeAnchor(event) {
        return String(event?.时间||event?.开始时间||'').trim();
    }
    function eventScheduleLabel(event) {
        const raw=eventTimeAnchor(event);
        if(raw&&!VAGUE_EVENT_TIME.test(raw))return raw;
        const condition=String(event?.条件||'').trim();
        if(condition)return '条件触发 · '+condition;
        const predecessors=Array.isArray(event?.前因)?event.前因.filter(Boolean):[];
        if(predecessors.length)return '前置节点后 · '+predecessors.join('、');
        return '时间待补';
    }
    const STALE_CURRENT_EVENT_HOURS=7*24;
    const STALE_NEAR_EVENT_HOURS=30*24;
    function staleActiveEvents(stat) {
        const now=worldDateKey(stat?.世界?.时间);if(now===null)return [];
        const out=[];
        for(const [名称,event] of Object.entries(stat?.世界?.[PATH]?.事件||{})){
            if(event?.状态!=='进行中'||event?.分类==='宏观节点')continue;
            const touched=worldDateKey(event.更新时间||event.时间||event.开始时间);
            if(touched===null)continue;
            const threshold=event.分类==='当前事件'?STALE_CURRENT_EVENT_HOURS:STALE_NEAR_EVENT_HOURS;
            const age=now-touched;
            if(age>threshold)out.push({名称,分类:event.分类,状态:event.状态,时间:event.时间||event.开始时间||'',更新时间:event.更新时间||'',已陈旧小时:age,说明:'局部活动长期停留在进行中；应结束/取消，或确认仍持续并更新到当前世界时间、当前进展与下次检查。'});
        }
        return out;
    }
    function temporalAnomalies(stat) {
        const now=worldDateKey(stat?.世界?.时间);if(now===null)return [];
        const state=stat?.世界?.[PATH]||{},out=[];
        const push=(类型,名称,字段,值,原因)=>{
            const key=worldDateKey(值);if(key!==null&&key>now)out.push({类型,名称,字段,值:String(值||''),原因});
        };
        for(const [name,event] of Object.entries(state.事件||{})){
            if(['进行中','已完成'].includes(event?.状态))push('事件',name,'时间',event.时间||event.开始时间,'已发生/进行中的事件不能晚于当前世界时间');
            if(event?.更新时间)push('事件',name,'更新时间',event.更新时间,'事件更新时间不能晚于当前世界时间');
        }
        for(const [name,person] of Object.entries(state.人物||{}))if(person?.更新时间)push('人物',name,'更新时间',person.更新时间,'人物当前动态不能来自未来');
        for(const [name,area] of Object.entries(state.势力地区||{})){
            if(area?.更新时间)push('势力地区',name,'更新时间',area.更新时间,'地区当前状态不能来自未来');
            for(const change of area?.近期变化||[])if(change?.时间)push('势力地区',name,'近期变化.时间',change.时间,'已经发生的地区变化不能来自未来');
        }
        for(const [name,item] of Object.entries(state.历史||{}))if(item?.时间)push('历史',name,'时间',item.时间,'历史事实不能晚于当前世界时间');
        for(const [name,item] of Object.entries(state.传播||{}))if(item?.时间)push('传播',name,'时间',item.时间,'已经开始传播的信息不能晚于当前世界时间');
        return out;
    }
    function validateTemporalWrites(before,next,patches) {
        const touched=new Set();
        for(const patch of patches||[]){
            let parts;try{parts=tokens(patch.path);}catch(_){continue;}
            if(parts[0]!=='世界'||parts[1]!==PATH)continue;
            if(['事件','人物','势力地区','历史','传播'].includes(parts[2])&&parts[3])touched.add(parts[2]+'\u0000'+parts[3]);
        }
        if(!touched.size)return;
        const all=temporalAnomalies(next);
        const hit=all.find(item=>touched.has(item.类型+'\u0000'+item.名称));
        if(hit)throw new Error('时间事实超过当前世界时间：'+hit.类型+'/'+hit.名称+' '+hit.字段+'='+hit.值+'；'+hit.原因);
    }
    function eventDisplayBucket(event) {
        if(event?.状态==='进行中')return 0;
        if(event?.状态==='待发生'&&event?.分类==='当前事件')return 1;
        if(event?.状态==='待发生'&&event?.分类==='近期节点')return 2;
        if(event?.状态==='待发生'&&event?.分类==='宏观节点')return 3;
        if(event?.状态==='已完成')return 4;
        if(event?.状态==='已取消')return 5;
        return 6;
    }
    function sortWorldEvents(records,orbit={}) {
        const storyIndex=new Map(storyStages(orbit?.故事线).map((name,index)=>[nameKey(name),index]));
        return Object.entries(records||{}).sort((a,b)=>{
            const bucket=eventDisplayBucket(a[1])-eventDisplayBucket(b[1]);if(bucket)return bucket;
            if(a[1]?.分类==='宏观节点'&&b[1]?.分类==='宏观节点'){
                const ai=storyIndex.get(nameKey(a[0])),bi=storyIndex.get(nameKey(b[0]));
                if(ai!==undefined||bi!==undefined){
                    if(ai===undefined)return 1;
                    if(bi===undefined)return -1;
                    if(ai!==bi)return ai-bi;
                }
            }
            const da=worldDateKey(a[1]?.时间||a[1]?.开始时间),db=worldDateKey(b[1]?.时间||b[1]?.开始时间);
            if(da!==db)return (da??Infinity)-(db??Infinity);
            return String(a[0]).localeCompare(String(b[0]),'zh-CN');
        });
    }
    function repairCausalProjection(stat) {
        const orbit=stat.世界.因果轨道||(stat.世界.因果轨道={当前阶段:'',故事线:'',下一节点:'',偏移记录:{}});
        const existing=storyStages(orbit.故事线);
        const macroEntries=Object.entries(stat.世界[PATH]?.事件||{})
            .filter(([,e])=>e.分类==='宏观节点'&&e.状态!=='已取消')
            .map((item,index)=>({item,index,key:worldDateKey(item[1].时间||item[1].开始时间)}))
            .sort((a,b)=>(a.key??Infinity)-(b.key??Infinity)||a.index-b.index)
            .map(x=>x.item);
        const macroNames=new Set(macroEntries.map(([name])=>name));
        const patches=[];
        let line=[];
        const existingValid=existing.length>=3&&existing.length<=5&&existing.every(name=>macroNames.has(name));
        if(existingValid)line=existing.slice(0,5);
        else {
            // 因果轨道只能由宏观事件投影。宏观事实不足时宁可等待模型补齐，
            // 也不能拿当前事件/近期节点凑出一条“看似完整”的故事线。
            if(macroEntries.length<3)return patches;
            const chosen=[],seen=new Set();
            const take=name=>{if(name&&macroNames.has(name)&&!seen.has(name)){seen.add(name);chosen.push(name);}};
            take(orbit.当前阶段);
            for(const [name] of macroEntries)take(name);
            if(chosen.length<3)return patches;
            line=chosen.slice(0,5);
            const story=line.join(' -> ');
            if(orbit.故事线!==story){orbit.故事线=story;patches.push({op:'replace',path:'/世界/因果轨道/故事线',value:story});}
        }
        const nextName=line.find(name=>(stat.世界[PATH].事件[name]||{}).状态==='待发生')||'';
        if(orbit.下一节点!==nextName){orbit.下一节点=nextName;patches.push({op:'replace',path:'/世界/因果轨道/下一节点',value:nextName});}
        const current=line.find(name=>(stat.世界[PATH].事件[name]||{}).状态==='进行中');
        if(current&&(!orbit.当前阶段||orbit.当前阶段==='待初始化')){orbit.当前阶段=current;patches.push({op:'replace',path:'/世界/因果轨道/当前阶段',value:current});}
        return patches;
    }
    function timelineState(stat) {
        const state=stat.世界[PATH],events=Object.entries(state.事件||{}),now=worldDateKey(stat.世界.时间);
        const waiting=events.filter(([,e])=>['待发生','进行中'].includes(e.状态));
        const near=events.filter(([,e])=>['当前事件','近期节点'].includes(e.分类));
        const macro=events.filter(([,e])=>e.分类==='宏观节点');
        const macroFuture=macro.filter(([,e])=>e.状态==='待发生');
        const macroOpen=macro.filter(([,e])=>['进行中','待发生'].includes(e.状态));
        const expand=macroFuture.filter(([,e])=>{const t=worldDateKey(e.时间||e.开始时间);return now!==null&&t!==null&&t>=now&&t-now<=7*24;});
        const semantic=waiting.filter(([,e])=>String(e.时间||e.开始时间||'').trim()&&worldDateKey(e.时间||e.开始时间)===null);
        const orbit=stat.世界.因果轨道||{},orbitStages=storyStages(orbit.故事线);
        const macroNames=new Set(macro.map(([name])=>name));
        const orbitProjectionInvalid=orbitStages.length<3||orbitStages.length>5||orbitStages.some(name=>!macroNames.has(name));
        const orbitMacro=macroFuture.find(([name])=>name===orbit.下一节点);
        const datedMacro=macroFuture.map((item,index)=>({item,index,key:worldDateKey(item[1].时间||item[1].开始时间)}))
            .filter(x=>x.key!==null&&(now===null||x.key>=now))
            .sort((a,b)=>a.key-b.key||a.index-b.index);
        const nextPair=orbitMacro||datedMacro[0]?.item||macroFuture[0]||null;
        const nextMacro=nextPair?{
            名称:nextPair[0],
            时间:nextPair[1].时间||nextPair[1].开始时间||'',
            分类:nextPair[1].分类||'',
            条件:nextPair[1].条件||'',
            前因:nextPair[1].前因||[],
            来源:'宏观事件图'
        }:null;
        return {
            当前时间锚点:stat.世界.时间,
            因果轨道节点数:orbitStages.length,
            因果轨道需重建:orbitProjectionInvalid,
            需要初始化:near.length===0&&macro.length===0,
            当前活动事件数:waiting.filter(([,e])=>e.状态==='进行中').length,
            近期节点数:near.length,
            宏观节点数:macro.length,
            需要补充远期:macroOpen.length<3,
            下一宏观节点:nextMacro,
            桥接区间:{
                起点:stat.世界.时间,
                终点:nextMacro?.时间||'待建立宏观节点',
                边界事件:nextMacro?.名称||''
            },
            需要展开的宏观节点:expand.map(([名称,e])=>({名称,时间:e.时间||e.开始时间,条件:e.条件,前因:e.前因})),
            需语义复核节点:semantic.map(([名称,e])=>({名称,时间:e.时间||e.开始时间,条件:e.条件,下次检查:e.下次检查})),
            说明:'先用因果轨道、当前事实与模型已有世界/原著知识建立宏观骨架；世界书若存在只作补充校正。随后仅展开当前时间到下一宏观节点之间的近期事件、人物、势力与传播。非公历或作品内时间按作品语义比较，不强行改写为公历。'
        };
    }
    function emptyState() {
        return { 版本:5, 已处理楼层:'', 已处理时间:'', 事件:{}, 人物:{}, 势力地区:{}, 历史:{}, 历史总结:{}, 传播:{}, 最近变化:[], 资产墓碑:{} };
    }
    // 只拆显式分隔的阶段，不把自然语言段落猜成多个事件，也不凭空分配日期。
    function importStory(stat) {
        const orbit=stat.世界.因果轨道||{},events=stat.世界.后台?.事件||{};
        if(Object.values(events).some(e=>e.分类==='主线节点'))return [];
        const stages=storyStages(orbit.故事线);
        if(stages.length<2||stages.length>30)return [];
        const index=stages.findIndex(n=>n===orbit.下一节点);
        const remaining=index>=0?stages.slice(index):stages;
        let previous='';
        return remaining.filter(name=>!Object.hasOwn(events,name)).map(name=>{
            const value={...copy(RECORDS.事件),描述:name,分类:'主线节点',前因:previous?[previous]:[],条件:previous?'前置节点「'+previous+'」达到进入本阶段所需的条件':'待依据世界设定与正文明确触发条件',下次检查:'本轮首次排程'};
            previous=name;
            return {op:'add',path:'/世界/后台/事件/'+name.replace(/~/g,'~0').replace(/\//g,'~1'),value};
        });
    }
    function tokens(path) {
        if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('补丁路径必须以 / 开头');
        const parts = path.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
        if (parts.some(p => !p || forbidden.has(p))) throw new Error('补丁路径含非法键');
        return parts;
    }
    function get(obj, parts) {
        return parts.reduce((v, key) => v != null && Object.prototype.hasOwnProperty.call(v, key) ? v[key] : undefined, obj);
    }
    function pointer(parts) {
        return '/'+parts.map(p=>String(p).replace(/~/g,'~0').replace(/\//g,'~1')).join('/');
    }
    const nameKey=value=>String(value||'').toLowerCase().replace(/[\\/／·・._\-\s]+/g,'');
    function stableNameIn(bucket,name) {
        if(!plain(bucket))return '';
        if(Object.hasOwn(bucket,name))return name;
        const key=nameKey(name),matches=Object.keys(bucket).filter(item=>nameKey(item)===key);
        return matches.length===1?matches[0]:'';
    }
    function worldLocationRelated(a,b) {
        const x=nameKey(a),y=nameKey(b);if(!x||!y)return false;
        return x===y||x.includes(y)||y.includes(x);
    }
    function personActivityMeta(stat,name,person) {
        const relations=stat?.关系列表||{},roster=(stat?.设置||{}).单一世界?{}:(stat?.世界?.异端雷达?.名单||{});
        const events=stat?.世界?.[PATH]?.事件||{},worldTime=String(stat?.世界?.时间||''),currentLocation=String(stat?.世界?.地点||'');
        const formalName=stableNameIn(relations,name),alienName=stableNameIn(roster,name),alien=alienName?roster[alienName]:null;
        const activeAlien=!!(alien&&alien.状态!=='死亡'),deadAlien=!!(alien&&alien.状态==='死亡');
        const liveEntries=Object.entries(events).filter(([,event])=>event&&['待发生','进行中'].includes(event.状态));
        const liveNames=new Set(liveEntries.map(([eventName])=>eventName));
        const linked=Array.isArray(person?.关联事件)&&person.关联事件.some(eventName=>liveNames.has(eventName));
        const participant=liveEntries.some(([,event])=>(event.参与者||[]).some(item=>nameKey(item)===nameKey(name)));
        const here=!!(person?.地点&&currentLocation&&worldLocationRelated(person.地点,currentLocation));
        const now=worldDateKey(worldTime),updated=worldDateKey(person?.更新时间);
        const ageHours=now!==null&&updated!==null?now-updated:null;
        const recent=sameWorldTimeAnchor(person?.更新时间,worldTime)||(ageHours!==null&&ageHours>=0&&ageHours<=HOT_PERSON_RECENT_HOURS);
        const checkAt=worldDateKey(person?.下次检查);
        const dueSoon=now!==null&&checkAt!==null&&checkAt>=now-HOT_PERSON_RECENT_HOURS&&checkAt<=now+7*24;
        const terminal=TERMINAL_PERSON_STATUS.test(String(person?.状态||'').trim());
        return {formalName,activeAlien,deadAlien,linked,participant,here,recent,dueSoon,terminal,ageHours};
    }
    function projectHotWorldPeople(stat,limit=HOT_PERSON_TARGET) {
        const people=stat?.世界?.[PATH]?.人物||{},rows=[];
        for(const [name,person] of Object.entries(people)){
            if(!plain(person))continue;
            const meta=personActivityMeta(stat,name,person);
            if(meta.deadAlien)continue;
            const hot=meta.activeAlien||(!meta.terminal&&(meta.linked||meta.participant||meta.here||meta.dueSoon||meta.recent));
            if(!hot)continue;
            const score=(meta.activeAlien?1000:0)+(meta.linked||meta.participant?600:0)+(meta.here?450:0)+(meta.dueSoon?320:0)+(meta.recent?220:0)+(meta.formalName?20:0);
            rows.push({name,person,meta,score});
        }
        rows.sort((a,b)=>b.score-a.score||String(a.name).localeCompare(String(b.name),'zh-CN'));
        const aliens=rows.filter(row=>row.meta.activeAlien),ordinary=rows.filter(row=>!row.meta.activeAlien).slice(0,Math.max(0,Number(limit)||0));
        return Object.fromEntries([...aliens,...ordinary].map(row=>[row.name,copy(row.person)]));
    }
    function pruneColdTemporaryPeople(stat) {
        const people=stat?.世界?.[PATH]?.人物;if(!plain(people))return [];
        const removed=[];
        const entries=Object.entries(people);
        for(const [name,person] of entries){
            if(!plain(person))continue;
            const meta=personActivityMeta(stat,name,person);
            const protectedNow=!!(meta.formalName||meta.activeAlien||meta.linked||meta.participant||meta.here||meta.dueSoon);
            if(protectedNow)continue;
            const stale=meta.ageHours!==null&&meta.ageHours>COLD_TEMP_PERSON_GRACE_HOURS;
            if(meta.terminal||stale){delete people[name];removed.push(name);}
        }
        const cold=Object.entries(people).filter(([name,person])=>{
            if(!plain(person))return false;
            const meta=personActivityMeta(stat,name,person);
            const protectedNow=!!(meta.formalName||meta.activeAlien||meta.linked||meta.participant||meta.here||meta.dueSoon);
            const recentlyActive=meta.ageHours!==null&&meta.ageHours>=0&&meta.ageHours<=COLD_TEMP_PERSON_GRACE_HOURS;
            return !protectedNow&&!recentlyActive;
        });
        while(cold.length>COLD_TEMP_PERSON_TARGET){
            const [name]=cold.shift();
            if(Object.hasOwn(people,name)){delete people[name];removed.push(name);}
        }
        return removed;
    }
    function alienRosterMatch(stat,name) {
        const roster=stat?.世界?.异端雷达?.名单||{},matched=stableNameIn(roster,name);
        return matched?{名称:matched,记录:roster[matched]}:null;
    }
    function pruneDeadAlienPeople(stat) {
        const people=stat?.世界?.[PATH]?.人物,roster=stat?.世界?.异端雷达?.名单;
        if(!plain(people)||!plain(roster))return [];
        const removed=[];
        for(const [alienName,alien] of Object.entries(roster)){
            if(alien?.状态!=='死亡')continue;
            const personName=stableNameIn(people,alienName);
            if(personName){delete people[personName];removed.push(personName);}
        }
        return removed;
    }
    function activeAlienActivityRequirements(stat) {
        if((stat?.设置||{}).单一世界)return [];
        const roster=stat?.世界?.异端雷达?.名单||{},people=stat?.世界?.[PATH]?.人物||{},required=[];
        for(const [alienName,alien] of Object.entries(roster)){
            if(!alien||alien.状态==='死亡')continue;
            const personName=stableNameIn(people,alienName)||alienName,person=people[personName]||{};
            required.push({
                名称:personName,雷达名称:alienName,来源:String(alien.来源||''),经历:String(alien.经历||''),阵营:String(alien.阵营||''),职业:String(alien.职业||''),层级:String(alien.层级||''),
                当前活动:{地点:String(person.地点||''),目标:String(person.目标||''),行动:String(person.行动||''),更新时间:String(person.更新时间||'')},
                要求:'本轮必须在 WorldResult.人物 中提交该异端的活动复核；至少给出非空地点、目标、行动，并将更新时间精确写为当前世界时间。若本轮已确认其死亡，则只把异端状态更新为死亡，不再提交人物活动。'
            });
        }
        return required;
    }
    function seedMissingAlienPeople(stat,required) {
        const state=stat?.世界?.[PATH],patches=[];if(!state)return patches;
        const people=state.人物||(state.人物={});
        for(const item of required||[]){
            if(stableNameIn(people,item.名称))continue;
            const relationName=stableNameIn(stat.关系列表||{},item.雷达名称),relation=relationName?(stat.关系列表||{})[relationName]:null;
            const seed=normalizeBackendRecord('人物',{所属世界:stat.世界?.名称||'',地点:String(relation?.地点||''),目标:'',行动:'',公开动态:''});
            people[item.名称]=seed;
            patches.push({op:'add',path:pointer(['世界',PATH,'人物',item.名称]),value:copy(seed)});
        }
        return patches;
    }
    function ensureActiveAlienActivity(next,required,acceptedResult,worldTime) {
        const roster=next?.世界?.异端雷达?.名单||{},people=next?.世界?.[PATH]?.人物||{},proposals=acceptedResult?.人物||[],missing=[];
        for(const item of required||[]){
            const rosterName=stableNameIn(roster,item.雷达名称||item.名称),alien=rosterName?roster[rosterName]:null;
            if(!alien||alien.状态==='死亡')continue;
            const personName=stableNameIn(people,item.名称)||stableNameIn(people,rosterName),person=personName?people[personName]:null;
            const proposal=proposals.find(p=>nameKey(p.名称)===nameKey(item.名称)||nameKey(p.名称)===nameKey(rosterName));
            const complete=person&&String(person.地点||'').trim()&&String(person.目标||'').trim()&&String(person.行动||'').trim()&&String(person.更新时间||'').trim()===String(worldTime||'').trim();
            if(!proposal||!complete)missing.push(rosterName||item.名称);
        }
        if(missing.length)throw new Error('异端活动未复核：'+missing.join('、')+'；活跃异端每轮都必须提交人物活动，写明地点、目标、行动，并把更新时间精确写为当前世界时间；若已死亡则更新异端状态为死亡');
    }
    function canonicalizeParts(parts,stat) {
        const p=parts.slice();
        if(p[0]==='世界'&&p[1]===PATH&&p[3]&&['人物','事件','势力地区'].includes(p[2])){
            const pools=[];
            const state=stat?.世界?.[PATH]||{};
            if(plain(state[p[2]]))pools.push(...Object.keys(state[p[2]]));
            if(p[2]==='人物'){
                pools.push(...Object.keys(stat?.关系列表||{}));
                pools.push(...Object.keys(stat?.世界?.异端雷达?.名单||{}));
            }
            const key=nameKey(p[3]),matches=[...new Set(pools)].filter(name=>nameKey(name)===key);
            if(matches.length===1)p[3]=matches[0];
        }
        return p;
    }
    function bootstrapBackendParent(stat,parts) {
        if(parts[0]!=='世界'||parts[1]!==PATH||parts.length!==5)return;
        const category=parts[2],name=parts[3];
        if(!['事件','人物','势力地区','传播'].includes(category))return;
        const bucket=stat.世界[PATH][category]||(stat.世界[PATH][category]={});
        if(Object.hasOwn(bucket,name))return;
        const seed=category==='事件'?{描述:name}:category==='人物'?{所属世界:stat.世界.名称||'',地点:'',行动:''}:{};
        bucket[name]=normalizeBackendRecord(category,seed);
    }
    function canUpsertMissing(parts,stat) {
        if(parts[0]==='世界'&&parts[1]===PATH){
            if(parts[2]==='历史'||parts[2]==='剧本')return false;
            if(parts.length===4&&['事件','人物','势力地区','传播'].includes(parts[2]))return true;
            if(parts.length===5&&['事件','人物','势力地区','传播'].includes(parts[2])&&!!get(stat,parts.slice(0,4)))return true;
        }
        if(parts[0]==='世界'&&parts[1]==='因果轨道'&&parts[2]==='偏移记录'&&parts.length===4)return true;
        if(parts[0]==='世界'&&['势力','探索'].includes(parts[1])&&parts.length===3)return true;
        if(parts[0]==='传闻'&&['街头巷议','情报交易','布告与檄文'].includes(parts[1])&&parts.length===3)return true;
        return false;
    }
    function checkRecord(value, template, optional = {}) {
        if(!plain(value))throw new Error('记录必须是完整对象，不能是文本或数组');
        const missing=Object.keys(template).filter(k=>!Object.hasOwn(value,k));
        const unknown=Object.keys(value).filter(k=>!Object.hasOwn(template,k)&&!Object.hasOwn(optional,k));
        if(missing.length||unknown.length)throw new Error('记录字段不完整或不受支持：'+(missing.length?'缺少 '+missing.join('、'):'')+(unknown.length?'；未知 '+unknown.join('、'):''));
        for (const [key, base] of Object.entries(template)) {
            const v = value[key];
            if (Array.isArray(base) ? !Array.isArray(v) || v.some(x => typeof x !== 'string') : typeof v !== typeof base) throw new Error('记录字段类型错误：' + key);
        }
    }
    function checkDetails(value, optional) {
        for (const [key, base] of Object.entries(optional)) {
            if (!Object.hasOwn(value,key)) continue;
            const v=value[key];
            if (Array.isArray(base)) {
                if (!Array.isArray(v)) throw new Error('明细需为列表：'+key);
                if (base.length) v.forEach(item=>checkRecord(item,base[0]));
                else if (v.some(item=>typeof item !== 'string')) throw new Error('明细需为文本列表：'+key);
            } else if (typeof v !== typeof base) throw new Error('明细类型错误：'+key);
        }
    }
    // LLM 常会只返回本轮实际变化的字段。后台整记录在安全边界内自动补默认值/合并旧值，
    // 未知字段直接丢弃；可选明细若提供，仍按完整明细结构严格校验。
    function normalizeBackendRecord(category,value,old) {
        if(!plain(value)||!Object.hasOwn(RECORDS,category))return value;
        const template=RECORDS[category],optional=DETAILS[category]||{};
        const out=Object.assign(copy(template),plain(old)?copy(old):{});
        for(const [key,item] of Object.entries(value)){
            if(Object.hasOwn(template,key)||Object.hasOwn(optional,key))out[key]=copy(item);
        }
        return out;
    }
    function normalizeBackendState(stat) {
        const state=stat?.世界?.[PATH]; if(!state)return stat;
        // v3 → v4：旧“公开摘要”直接迁移为因果轨道.当前阶段描述，然后删除两份重复交接字段。
        const legacySummary=String(state.公开摘要||'').trim();
        if(legacySummary){
            if(!plain(stat.世界.因果轨道))stat.世界.因果轨道={当前阶段:'',故事线:'',下一节点:'',偏移记录:{}};
            stat.世界.因果轨道.当前阶段=legacySummary;
        }
        delete state.公开摘要;
        delete state.正文承接;
        // 旧存档兼容：推演记录已由每轮 L0 历史锚点完全取代。
        delete state.运行记录;
        state.版本=Math.max(5,Number(state.版本)||0);
        // v5：程序托管的可逆历史总结树；不属于模型可写 RECORDS。
        if(!plain(state.历史总结))state.历史总结={};
        for(const category of Object.keys(RECORDS)){
            if(!plain(state[category]))state[category]={};
            for(const [name,value] of Object.entries(state[category])){
                if(plain(value))state[category][name]=normalizeBackendRecord(category,value);
            }
        }
        pruneDeadAlienPeople(stat);
        return stat;
    }
    const EVENT_CATEGORIES=new Set(['当前事件','近期节点','宏观节点']);
    const LOCAL_EVENT_WORDS=/(?:天台|教室|办公室|医务室|走廊|楼梯|楼层|入口|门扉|校门|校车|桥头|大桥|房间|仓库|食堂|街口|小巷|会合|汇合|集结|夺取|抢夺|突破|开门|绕行|护送|搜索|调查)/;
    const MACRO_EVENT_WORDS=/(?:世界级|全国|跨国|地区级灾难|城市级灾难|战略级|核(?:打击|爆|武器)|EMP|电磁脉冲|战争|政权|社会秩序|基础设施(?:失效|崩溃)|大规模迁移|长期流亡|生存阶段|篇章转折|据点(?:建立|失守|沦陷|崩溃|保卫)|文明|国家|大陆)/;
    function eventText(name,event) {
        return [name,event?.描述,event?.条件,event?.默认走向,event?.结果,event?.公开征兆,event?.地点].filter(Boolean).join(' ');
    }
    function obviouslyLocalMacro(name,event) {
        const text=eventText(name,event);
        if(MACRO_EVENT_WORDS.test(text))return false;
        const fineLocation=/(?:天台|教室|办公室|医务室|走廊|楼梯|楼层|入口|门扉|校门|校车|桥头|大桥|房间|仓库|食堂|街口|小巷)/.test(String(event?.地点||'')+' '+String(name||''));
        return fineLocation&&LOCAL_EVENT_WORDS.test(text);
    }
    function normalizedEventCategory(name,event) {
        const raw=String(event?.分类||'').trim();
        if(raw==='宏观节点')return obviouslyLocalMacro(name,event)?(event?.状态==='进行中'?'当前事件':'近期节点'):'宏观节点';
        if(raw==='当前事件')return '当前事件';
        if(raw==='近期节点')return event?.状态==='进行中'?'当前事件':'近期节点';
        if(raw==='近期事件'||raw==='主线节点'||!EVENT_CATEGORIES.has(raw))return event?.状态==='进行中'?'当前事件':'近期节点';
        return raw;
    }
    function normalizeEventLayers(stat) {
        const events=stat?.世界?.[PATH]?.事件||{},patches=[];
        for(const [name,event] of Object.entries(events)){
            const category=normalizedEventCategory(name,event);
            if(event.分类!==category){
                event.分类=category;
                patches.push({op:'replace',path:'/世界/后台/事件/'+String(name).replace(/~/g,'~0').replace(/\//g,'~1')+'/分类',value:category});
            }
        }
        return patches;
    }
    function explicitPersonAliases(name) {
        const full=String(name||'').trim(), short=full.split(/[·・／/]/)[0].trim();
        return [...new Set([full,short].filter(x=>x.length>=2))];
    }
    function repairExplicitEventLinks(stat) {
        const state=stat?.世界?.[PATH],patches=[]; if(!state)return patches;
        const events=state.事件||{},people=state.人物||{};
        for(const [eventName,event] of Object.entries(events)){
            const haystack=eventText(eventName,event);
            const participants=Array.isArray(event.参与者)?event.参与者.slice():[];
            let participantsChanged=false;
            for(const personName of Object.keys(people)){
                const explicit=participants.some(x=>nameKey(x)===nameKey(personName))||explicitPersonAliases(personName).some(alias=>haystack.includes(alias));
                if(!explicit)continue;
                if(!participants.some(x=>nameKey(x)===nameKey(personName))){
                    participants.push(personName);participantsChanged=true;
                }
                const person=people[personName],links=Array.isArray(person.关联事件)?person.关联事件:[];
                if(!links.includes(eventName)){
                    person.关联事件=[...links,eventName];
                    patches.push({op:'replace',path:'/世界/后台/人物/'+String(personName).replace(/~/g,'~0').replace(/\//g,'~1')+'/关联事件',value:copy(person.关联事件)});
                }
            }
            if(participantsChanged){
                event.参与者=participants;
                patches.push({op:'replace',path:'/世界/后台/事件/'+String(eventName).replace(/~/g,'~0').replace(/\//g,'~1')+'/参与者',value:copy(participants)});
            }
        }
        return patches;
    }
    function repairMacroPredecessors(stat) {
        const state=stat?.世界?.[PATH],orbit=stat?.世界?.因果轨道||{},patches=[]; if(!state)return patches;
        const stages=storyStages(orbit.故事线).filter(name=>state.事件?.[name]?.分类==='宏观节点'&&state.事件[name].状态!=='已取消');
        for(let i=1;i<stages.length;i++){
            const prev=stages[i-1],name=stages[i],event=state.事件[name],parents=Array.isArray(event.前因)?event.前因:[];
            if(!parents.includes(prev)){
                event.前因=[...parents,prev];
                patches.push({op:'replace',path:'/世界/后台/事件/'+String(name).replace(/~/g,'~0').replace(/\//g,'~1')+'/前因',value:copy(event.前因)});
            }
        }
        return patches;
    }

    const MODEL_IGNORED_PATHS = [
        /^\/任务(?:\/|$)/,
        /^\/系统状态\/待播报记录$/,
        /^\/世界\/后台\/(?:版本|已处理楼层|已处理时间|运行记录|最近变化)(?:\/|$)/,
        /^\/世界\/后台\/剧本(?:\/|$)/
    ];
    function sanitizeModelPatches(patches) {
        if(!Array.isArray(patches))return patches;
        return patches.filter(p=>!(plain(p)&&typeof p.path==='string'&&MODEL_IGNORED_PATHS.some(rule=>rule.test(p.path))));
    }
    function normalizeModelPatches(patches) {
        if(!Array.isArray(patches))return patches;
        const out=[],esc=value=>String(value).replace(/~/g,'~0').replace(/\//g,'~1');
        for(const raw of patches){
            if(!plain(raw)){out.push(raw);continue;}
            const patch=copy(raw);
            if(typeof patch.path==='string')patch.path=patch.path.replace(/^\/世界\/因校轨道(?=\/|$)/,'/世界/因果轨道');
            if(patch.path==='/世界/因果轨道'&&patch.op!=='remove'&&plain(patch.value)){
                for(const key of ['当前阶段','故事线','下一节点']){
                    if(Object.hasOwn(patch.value,key))out.push({op:'add',path:'/世界/因果轨道/'+key,value:copy(patch.value[key])});
                }
                if(plain(patch.value.偏移记录))for(const [name,value] of Object.entries(patch.value.偏移记录)){
                    out.push({op:'add',path:'/世界/因果轨道/偏移记录/'+esc(name),value:copy(value)});
                }
                continue;
            }
            if(patch.path==='/世界/因果轨道/偏移记录'&&patch.op!=='remove'&&plain(patch.value)){
                for(const [name,value] of Object.entries(patch.value))out.push({op:'add',path:'/世界/因果轨道/偏移记录/'+esc(name),value:copy(value)});
                continue;
            }
            out.push(patch);
        }
        return out;
    }
    function retryableModelFailure(error) {
        const message=String(error?.message||error||'');
        if(!message)return false;
        if(/^(?:请求已取消|上下文已经切换|推演期间世界时间或副本锚点发生变化|请在主神终端设置|请加载更新后的|禁止写入：)/.test(message))return false;
        if(error?.name==='AbortError')return false;
        return true;
    }
    function retryInput(baseInput,error,lastReply,attempt,maxAttempts,acceptedResult,retryPlan=[]) {
        let payload;try{payload=JSON.parse(baseInput);}catch(_){payload={原始请求:baseInput};}
        const feedback=retryFeedback(error,error?.rejectedSlices,Array.isArray(retryPlan)?retryPlan:[]);
        const plan=feedback.actions;
        payload.纠错重试={
            当前尝试:attempt+1,
            最大尝试次数:maxAttempts,
            上次拒绝原因:feedback.summary,
            具体问题:feedback.issues.length?feedback.issues:undefined,
            上次模型回复:String(lastReply||'').slice(-12000),
            已接受业务结果:acceptedResult?copy(acceptedResult):undefined,
            补充清单:plan.length?copy(plan):undefined,
            要求:acceptedResult
                ?(plan.length
                    ?'严格按“补充清单”只补充或修正未通过的业务片段。已接受业务结果已经通过本地验收，默认全部保留，不要整份重写；同名实体只提交需要覆盖的字段。若某个本轮提案应撤回，用 操作=撤销本轮。仍只输出一个 WorldResult JSON。'
                    :'只补充或修正导致拒绝的业务片段。已接受业务结果默认保留，不要整份重写；同名实体只提交需要覆盖的字段。若某个本轮提案应撤回，用 操作=撤销本轮。仍只输出一个 WorldResult JSON。')
                :'修正格式或业务错误后重新输出一个 WorldResult JSON；不要解释错误，不要输出存储路径。'
        };
        if(payload.纠错重试.已接受业务结果===undefined)delete payload.纠错重试.已接受业务结果;
        if(payload.纠错重试.补充清单===undefined)delete payload.纠错重试.补充清单;
        return JSON.stringify(payload,null,2);
    }
    // 允许世界叙事、世界经济与共享资产账簿；玩家属性、持币余额、奖励发放和时钟仍不在写入名单内。
    function allowed(parts, stat) {
        const [a,b,c,d] = parts;
        if (a === '世界' && b === PATH) {
            if (c === '剧本') return false;
            if (!Object.hasOwn(RECORDS, c) || !d) return false;
            if (c === '历史') return parts.length === 4;
            return parts.length === 4 || (parts.length === 5 && (Object.hasOwn(RECORDS[c], parts[4]) || Object.hasOwn(DETAILS[c],parts[4])));
        }
        if (a === '世界' && b === '因果轨道') {
            if (['当前阶段','故事线','下一节点'].includes(c)) return parts.length === 3;
            return !(stat.设置 || {}).世界超稳 && c === '偏移记录' && parts.length === 4;
        }
        if (a === '世界' && b === '货币') return parts.length === 3 && Object.hasOwn(CURRENCY_FIELDS,c);
        if (a === '世界' && b === '历法') return parts.length === 3 && Object.hasOwn(CALENDAR_FIELDS,c);
        if (a === '世界' && ['势力','探索'].includes(b)) return parts.length === 3 || (parts.length === 4 && Object.hasOwn(b === '势力' ? {实力:0,领地:0,描述:0,声望:0} : {风险:0,探索度:0,描述:0,隐藏真相:0},d));
        if (a === '世界' && b === '异端雷达') return parts.length === 5 && c === '名单' && parts[4] === '状态' && !(stat.设置 || {}).单一世界;
        if (a === '传闻' && ['街头巷议','情报交易','布告与檄文'].includes(b)) return parts.length === 3;
        if (a === '资产') return parts.length === 2 && !!b;
        // 只允许修改变量AI已经建立的 NPC；禁止通过世界引擎创建关系列表对象。
        if (a === '关系列表') return parts.length === 3 && RELATION_SYNC_KEYS.has(c) && !!get(stat,[a,b]);
        if (a === '任务') return parts.length === 4 && ['列表','副本成就'].includes(b) && d === '状态' && !!get(stat,[a,b,c]);
        return false;
    }
    const CURRENCY_FIELDS={体系:'',购买力基准:'',经济波动:''};
    const CALENDAR_FIELDS={名称:'',月份天数:[],闰年规则:''};
    const QUALITY_RANKS=['F','E','D','C','B','A','S','SS','SSS'];
    const RUMOR_CREDIBILITY=['酒话','可疑','或许可信'];
    const INTEL_RATINGS=[...QUALITY_RANKS,'日常','战略'];
    function normalizeRumorCredibility(value) {
        const raw=String(value??'').trim();
        if(RUMOR_CREDIBILITY.includes(raw))return raw;
        if(/^(?:可信|属实|真实|确实|高|较高|很高|基本属实)$/.test(raw))return '或许可信';
        if(/^(?:不可信|虚假|谣言|低|较低|很低|纯属谣言)$/.test(raw))return '酒话';
        return '可疑';
    }
    const EXISTING = {
        势力: {实力:'F',领地:'',描述:'',声望:0}, 探索:{风险:'F',探索度:0,描述:'',隐藏真相:''},
        偏移记录:{描述:'',引发者:'',影响程度:0},
        街头巷议:{来源:'',内容:'',可信度:''}, 情报交易:{卖家:'',情报评级:'',摘要:'',要价:'',真实内幕:''},
        布告与檄文:{发布者:'',内容:'',张贴位置:''},
        名单:{来源:'',经历:'',阵营:'',职业:'',层级:'',状态:''}
    };
    const RELATION_RANKS=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'];
    const RELATION_QUALITIES=['F','E','D','C','B','A','S','SS','SSS'];
    const RELATION_SYNC_FIELDS={
        在场:false,种族:'',身份:[],职业:{},层级:'Ⅰ',HP:0,THP:0,EP:0,
        状态:{},血统:{},装备:{},技能:{},形态库:{},当前形态:{},
        性格:'',喜爱:'',外貌:'',着装:'',是否队友:false,好感度:0,态度:'',背景故事:''
    };
    const RELATION_SYNC_KEYS=new Set(Object.keys(RELATION_SYNC_FIELDS));
    const RELATION_COMPONENT_FIELDS=new Set(['职业','状态','血统','装备','技能','形态库']);
    // 只有会永久改变角色战斗构筑的字段要求进入审计名单；状态/当前形态及档案文字仍可因真实剧情变化正常同步。
    const RELATION_AUDIT_ONLY_FIELDS=new Set(['职业','血统','装备','技能','形态库']);
    const RELATION_ATTR_KEYS=['力量','敏捷','体质','精神','魅力','ATK','DEF','MATK','MDEF','AP'];
    const RELATION_ATTR5=['力量','敏捷','体质','精神','魅力'];
    const NPC_BUILD_AUDIT_LIMIT=4;
    const WORLD_RESULT_LISTS=['事件','人物','势力地区','历史','传播','势力','探索','资产','异端','关系'];
    const WORLD_RESULT_RUMORS=['街头巷议','情报交易','布告与檄文'];
    const RESULT_OPERATIONS=new Set(['更新','移除','撤销本轮']);
    const WORLD_ASSET_TYPES=['固定地产','大型载具','要塞'];
    const WORLD_ASSET_TYPE_SET=new Set(WORLD_ASSET_TYPES);
    const ITEMLIKE_ASSET_NAME=/(?:纹章|免疫|抗性|初解|技能|能力|药剂?|药水|圣水|解药|血清|试剂|瓶|钥匙|摇把|手柄|材料|矿石|零件|部件|残骸|卷轴|食物|口粮|弹药|消耗品|道具|护符|符文|芯片|样本)$/i;
    function schemaFromSample(sample) {
        if(Array.isArray(sample))return {type:'array',items:sample.length?schemaFromSample(sample[0]):{type:'string'}};
        if(plain(sample)){
            const properties=Object.fromEntries(Object.entries(sample).map(([key,value])=>[key,schemaFromSample(value)]));
            return {type:'object',properties,additionalProperties:false};
        }
        if(typeof sample==='number')return {type:'number'};
        if(typeof sample==='boolean')return {type:'boolean'};
        return {type:'string'};
    }
    function namedEntitySchema(sample,operations=['更新','撤销本轮'],requiredFields=[]) {
        const properties={名称:{type:'string',minLength:1},操作:{type:'string',enum:operations}};
        for(const [key,value] of Object.entries(sample||{}))properties[key]=schemaFromSample(value);
        return {type:'object',properties,required:['名称',...requiredFields],additionalProperties:false};
    }
    const FACTION_RESULT_SCHEMA=namedEntitySchema(EXISTING.势力);
    FACTION_RESULT_SCHEMA.properties.实力={type:'string',enum:copy(QUALITY_RANKS)};
    FACTION_RESULT_SCHEMA.properties.声望={type:'number',minimum:-5000,maximum:10000};
    const EXPLORATION_RESULT_SCHEMA=namedEntitySchema(EXISTING.探索);
    EXPLORATION_RESULT_SCHEMA.properties.风险={type:'string',enum:copy(QUALITY_RANKS)};
    EXPLORATION_RESULT_SCHEMA.properties.探索度={type:'number',minimum:0,maximum:100};
    const EVENT_RESULT_SCHEMA=namedEntitySchema({...RECORDS.事件,...MODEL_DETAILS.事件});
    EVENT_RESULT_SCHEMA.properties.状态={type:'string',enum:['待发生','进行中','已完成','已取消']};
    EVENT_RESULT_SCHEMA.properties.分类={type:'string',enum:Array.from(EVENT_CATEGORIES)};
    const OFFSET_RESULT_SCHEMA=namedEntitySchema(EXISTING.偏移记录);
    OFFSET_RESULT_SCHEMA.properties.影响程度={type:'number',minimum:-100,maximum:120};
    const STREET_RUMOR_RESULT_SCHEMA=namedEntitySchema(EXISTING.街头巷议,['更新','移除','撤销本轮'],['来源','内容','可信度']);
    STREET_RUMOR_RESULT_SCHEMA.properties.可信度={type:'string',enum:copy(RUMOR_CREDIBILITY)};
    const INTEL_TRADE_RESULT_SCHEMA=namedEntitySchema(EXISTING.情报交易,['更新','移除','撤销本轮'],['卖家','情报评级','摘要','要价','真实内幕']);
    INTEL_TRADE_RESULT_SCHEMA.properties.情报评级={type:'string',enum:copy(INTEL_RATINGS)};
    const relationQualitySchema=()=>({type:'string',enum:copy(RELATION_QUALITIES)});
    const relationTagsSchema=()=>({type:'array',maxItems:24,items:{type:'string'}});
    const relationStringMapSchema=()=>({type:'object',additionalProperties:{type:'string'}});
    const relationRawAttrSchema=(requireFive=false,allowNumbers=false)=>{
        const properties={};
        for(const key of RELATION_ATTR_KEYS)properties[key]=allowNumbers?{anyOf:[relationQualitySchema(),{type:'number'}]}:relationQualitySchema();
        return {type:'object',additionalProperties:false,properties,required:requireFive?copy(RELATION_ATTR5):undefined};
    };
    const RELATION_SKILL_SCHEMA={type:'object',additionalProperties:false,required:['品质','类型','标签','效果','描述','消耗'],properties:{
        品质:relationQualitySchema(),类型:{type:'integer',minimum:0,maximum:2},标签:relationTagsSchema(),
        效果:relationStringMapSchema(),描述:{type:'string'},消耗:{type:'string'}
    }};
    const RELATION_OCCUPATION_SCHEMA={type:'object',additionalProperties:false,required:['类型','特性','来源'],properties:{
        类型:{type:'string',enum:['战斗','生活','辅助']},特性:relationTagsSchema(),来源:{type:'string'}
    }};
    const RELATION_BLOODLINE_SCHEMA={type:'object',additionalProperties:false,required:['品质','标签','原始属性','效果','描述'],properties:{
        品质:relationQualitySchema(),标签:relationTagsSchema(),原始属性:relationRawAttrSchema(true,false),
        效果:relationStringMapSchema(),描述:{type:'string'}
    }};
    const RELATION_EQUIP_SCHEMA={type:'object',additionalProperties:false,required:['品质','类型','标签','原始属性','效果','描述','消耗','状态'],properties:{
        品质:relationQualitySchema(),类型:{type:'integer',minimum:0,maximum:8},标签:relationTagsSchema(),
        原始属性:relationRawAttrSchema(false,false),效果:relationStringMapSchema(),描述:{type:'string'},消耗:{type:'string'},
        状态:{type:'integer',minimum:0,maximum:2}
    }};
    const RELATION_STATUS_SCHEMA={type:'object',additionalProperties:false,required:['类型','品质','持续','来源','原始属性','效果'],properties:{
        类型:{type:'string',enum:['增益','减益','特殊']},品质:relationQualitySchema(),持续:{type:'string'},来源:{type:'string'},
        原始属性:relationRawAttrSchema(false,true),效果:{type:'string'}
    }};
    const RELATION_FORM_SCHEMA={type:'object',additionalProperties:false,required:['层级','消耗','冷却','状态','标签','原始属性','效果','技能','描述'],properties:{
        层级:{type:'string',enum:copy(RELATION_RANKS)},消耗:{type:'string'},冷却:{type:'string'},状态:{type:'string'},标签:relationTagsSchema(),
        原始属性:relationRawAttrSchema(true,false),效果:relationStringMapSchema(),
        技能:{type:'object',additionalProperties:copy(RELATION_SKILL_SCHEMA),maxProperties:8},描述:{type:'string'}
    }};
    const RELATION_CURRENT_FORM_SCHEMA={type:'object',additionalProperties:false,required:['激活','名称'],properties:{激活:{type:'boolean'},名称:{type:'string'}}};
    const ASSET_RESULT_SCHEMA={
        type:'object',additionalProperties:false,required:['名称'],properties:{
            名称:{type:'string',minLength:1},操作:{type:'string',enum:['更新','移除','撤销本轮']},
            所属对象:{type:'array',items:{type:'string',minLength:1},maxItems:12},类型:{type:'string',enum:copy(WORLD_ASSET_TYPES)},主体规模:{type:'number',minimum:1,maximum:10},完整度:{type:'number',minimum:0,maximum:100},状态:{type:'string'},
            能源:{anyOf:[{type:'object',additionalProperties:false,properties:{类型:{type:'string'},当前:{type:'number'},上限:{type:'number'},描述:{type:'string'}}},{type:'null'}]},
            消耗单元:{type:'object',additionalProperties:{anyOf:[{type:'object',additionalProperties:false,properties:{余量:{type:'number'},上限:{type:'number'},加成:{type:'array',items:{type:'string'}}}},{type:'null'}]}},
            建设序列:{type:'object',additionalProperties:{anyOf:[{type:'object',additionalProperties:false,properties:{阶段:{type:'string',enum:['基础','进阶','专业','顶尖','禁忌']},功能:{type:'string'},加成:{type:'array',items:{type:'string'}},产出:{type:'string'}}},{type:'null'}]}},
            驻扎人员:{type:'object',additionalProperties:{anyOf:[{type:'string'},{type:'null'}]}},
            待办事件:{type:'array',items:{type:'string'}}
        }
    };
    const WORLD_RESULT_SCHEMA={
        type:'object',
        additionalProperties:false,
        required:['摘要'],
        properties:{
            摘要:{type:'string'},
            货币:{type:'object',additionalProperties:false,properties:{
                体系:{type:'string'},
                购买力基准:{type:'string'},
                经济波动:{type:'string'}
            }},
            历法:{type:'object',additionalProperties:false,properties:{
                名称:{type:'string'},
                月份天数:{type:'array',maxItems:24,items:{type:'integer',minimum:1,maximum:99}},
                闰年规则:{type:'string'}
            }},
            事件:{type:'array',maxItems:30,items:EVENT_RESULT_SCHEMA},
            人物:{type:'array',maxItems:25,items:namedEntitySchema({...RECORDS.人物,...MODEL_DETAILS.人物})},
            势力地区:{type:'array',maxItems:20,items:namedEntitySchema({...RECORDS.势力地区,...MODEL_DETAILS.势力地区})},
            历史:{type:'array',maxItems:12,items:namedEntitySchema(RECORDS.历史,['更新','撤销本轮'])},
            传播:{type:'array',maxItems:20,items:namedEntitySchema({...RECORDS.传播,...MODEL_DETAILS.传播},['更新','移除','撤销本轮'])},
            因果:{type:'object',additionalProperties:false,properties:{
                当前阶段:{type:'string'},
                宏观顺序:{type:'array',minItems:0,maxItems:5,items:{type:'string'}},
                偏移记录:{type:'array',maxItems:10,items:OFFSET_RESULT_SCHEMA}
            }},
            势力:{type:'array',maxItems:15,items:FACTION_RESULT_SCHEMA},
            探索:{type:'array',maxItems:20,items:EXPLORATION_RESULT_SCHEMA},
            资产:{type:'array',maxItems:20,items:ASSET_RESULT_SCHEMA},
            异端:{type:'array',maxItems:15,items:{type:'object',additionalProperties:false,required:['名称','状态'],properties:{名称:{type:'string',minLength:1},操作:{type:'string',enum:['更新','撤销本轮']},状态:{type:'string',enum:['活跃','死亡']}}}},
            传闻:{type:'object',additionalProperties:false,properties:{
                街头巷议:{type:'array',maxItems:6,items:STREET_RUMOR_RESULT_SCHEMA},
                情报交易:{type:'array',maxItems:6,items:INTEL_TRADE_RESULT_SCHEMA},
                布告与檄文:{type:'array',maxItems:6,items:namedEntitySchema(EXISTING.布告与檄文,['更新','移除','撤销本轮'],['发布者','内容','张贴位置'])}
            }},
            关系:{type:'array',maxItems:25,items:{type:'object',additionalProperties:false,required:['名称'],properties:{
                名称:{type:'string',minLength:1},操作:{type:'string',enum:['更新','撤销本轮']},
                在场:{type:'boolean'},种族:{type:'string'},身份:relationTagsSchema(),
                职业:{type:'object',additionalProperties:copy(RELATION_OCCUPATION_SCHEMA),maxProperties:12},
                层级:{type:'string',enum:copy(RELATION_RANKS)},HP:{type:'number',minimum:0,maximum:99999999},
                THP:{type:'number',minimum:0,maximum:99999999},EP:{type:'number',minimum:0,maximum:99999999},
                状态:{type:'object',additionalProperties:copy(RELATION_STATUS_SCHEMA),maxProperties:12},
                血统:{type:'object',additionalProperties:copy(RELATION_BLOODLINE_SCHEMA),maxProperties:2},
                装备:{type:'object',additionalProperties:copy(RELATION_EQUIP_SCHEMA),maxProperties:6},
                技能:{type:'object',additionalProperties:copy(RELATION_SKILL_SCHEMA),maxProperties:4},
                形态库:{type:'object',additionalProperties:copy(RELATION_FORM_SCHEMA),maxProperties:4},
                当前形态:copy(RELATION_CURRENT_FORM_SCHEMA),
                性格:{type:'string'},喜爱:{type:'string'},外貌:{type:'string'},着装:{type:'string'},
                是否队友:{type:'boolean'},好感度:{type:'number',minimum:-100,maximum:100},态度:{type:'string'},背景故事:{type:'string'}
            }}}
        }
    };
    function sampleForWorldResultList(key) {
        if(key==='事件')return {...RECORDS.事件,...MODEL_DETAILS.事件};
        if(key==='人物')return {...RECORDS.人物,...MODEL_DETAILS.人物};
        if(key==='势力地区')return {...RECORDS.势力地区,...MODEL_DETAILS.势力地区};
        if(key==='历史')return RECORDS.历史;
        if(key==='传播')return {...RECORDS.传播,...MODEL_DETAILS.传播};
        if(key==='势力')return EXISTING.势力;
        if(key==='探索')return EXISTING.探索;
        if(key==='异端')return EXISTING.名单;
        return {};
    }
    function detailTextField(sample) {
        for(const key of ['名称','事实','行动','影响','内容','说明','问题','对象','地点']){
            if(Object.hasOwn(sample||{},key)&&typeof sample[key]==='string')return key;
        }
        return Object.keys(sample||{}).find(key=>typeof sample[key]==='string')||'';
    }
    function normalizeStructuredDetail(value,sample) {
        const out=copy(sample||{});
        if(plain(value)){
            for(const key of Object.keys(sample||{})){
                if(Object.hasOwn(value,key))out[key]=normalizeResultField(value[key],sample[key]);
            }
            return out;
        }
        if(value!==undefined&&value!==null&&value!==''){
            const key=detailTextField(sample);
            if(key)out[key]=normalizeResultField(value,sample[key]);
        }
        return out;
    }
    function normalizeResultField(value,sample) {
        if(Array.isArray(sample)){
            const list=Array.isArray(value)?value:(value===undefined||value===null||value===''?[]:[value]);
            if(sample.length&&plain(sample[0]))return list.filter(item=>item!==undefined&&item!==null&&item!=='').map(item=>normalizeStructuredDetail(item,sample[0]));
            return list.map(copy);
        }
        if(plain(sample)){
            if(!plain(value))return copy(sample);
            const out=copy(sample);
            for(const key of Object.keys(sample))if(Object.hasOwn(value,key))out[key]=normalizeResultField(value[key],sample[key]);
            return out;
        }
        if(typeof sample==='number'){
            const number=Number(value);
            return Number.isFinite(number)?number:value;
        }
        if(typeof sample==='boolean')return typeof value==='boolean'?value:!!value;
        if(typeof sample==='string'&&value!==undefined&&value!==null)return String(value);
        return copy(value);
    }
    function normalizeNamedResultList(value,sample,allowedOps=['更新','撤销本轮']) {
        const sampleKeys=Object.keys(sample||{}),singleField=sampleKeys.length===1?sampleKeys[0]:'';
        const list=Array.isArray(value)?value:plain(value)?Object.entries(value).map(([name,item])=>{
            if(plain(item))return Object.assign({名称:name},copy(item));
            if(singleField&&item!==undefined&&item!==null)return {名称:name,[singleField]:copy(item)};
            return null;
        }).filter(Boolean):[];
        const fields=new Set(sampleKeys),map=new Map();
        const aliases={
            所在世界:'所属世界',
            已知信息:'认知',
            下次检查条件:'下次检查',
            事实:'内容'
        };
        for(const source of list){
            if(!plain(source))continue;
            const raw=copy(source);
            for(const [from,to] of Object.entries(aliases)){
                if(fields.has(to)&&Object.hasOwn(raw,from)&&!Object.hasOwn(raw,to))raw[to]=raw[from];
            }
            if(fields.has('可信度')&&!Object.hasOwn(raw,'可信度')){
                const rumorClass=String(raw.分类||'').trim();
                raw.可信度=({'事实':'或许可信','猜测':'可疑','谣言':'酒话','酒话':'酒话','可疑':'可疑','或许可信':'或许可信'})[rumorClass]||'可疑';
            }
            const name=String(raw.名称??raw.name??'').trim();
            if(!name)continue;
            const item={名称:name};
            const operation=String(raw.操作||'更新');
            item.操作=allowedOps.includes(operation)?operation:'更新';
            for(const key of fields)if(Object.hasOwn(raw,key))item[key]=normalizeResultField(raw[key],sample[key]);
            const id=nameKey(name),prev=map.get(id);
            if(item.操作==='撤销本轮'){map.delete(id);continue;}
            map.set(id,prev?Object.assign(prev,item):item);
        }
        return Array.from(map.values());
    }
    function normalizeAssetResultList(value) {
        const sourceList=Array.isArray(value)?value:plain(value)?Object.entries(value).map(([name,item])=>plain(item)?Object.assign({名称:name},copy(item)):{名称:name,操作:item==='移除'?'移除':'更新'}):[];
        const map=new Map(),stringFields=['类型','状态'],numberFields=['主体规模','完整度'];
        const normalizeOwners=value=>{
            const source=Array.isArray(value)?value:(value===undefined?[]:[value]),out=[];
            for(const raw of source){const owner=String(raw??'').trim();if(!owner||owner==='无主'||out.includes(owner))continue;out.push(owner);}
            return out.slice(0,12);
        };
        const normalizeMap=(value,kind)=>{
            if(!plain(value))return {};
            const out={};
            for(const [name,raw] of Object.entries(value)){
                if(forbidden.has(name))continue;
                if(raw===null){out[name]=null;continue;}
                if(kind==='person'){
                    if(typeof raw==='string')out[name]=raw;
                    continue;
                }
                if(!plain(raw))continue;
                const item={};
                if(kind==='unit'){
                    for(const key of ['余量','上限'])if(Object.hasOwn(raw,key)){const n=Number(raw[key]);if(Number.isFinite(n))item[key]=n;}
                    if(Array.isArray(raw.加成))item.加成=raw.加成.filter(x=>typeof x==='string');
                }else{
                    if(Object.hasOwn(raw,'阶段'))item.阶段=String(raw.阶段||'');
                    for(const key of ['功能','产出'])if(Object.hasOwn(raw,key))item[key]=String(raw[key]??'');
                    if(Array.isArray(raw.加成))item.加成=raw.加成.filter(x=>typeof x==='string');
                }
                out[name]=item;
            }
            return out;
        };
        const mergeItem=(previous,item)=>{
            if(!previous)return item;
            const merged=Object.assign({},previous,item);
            for(const field of ['消耗单元','建设序列','驻扎人员']){
                if(plain(previous[field])&&plain(item[field]))merged[field]=Object.assign({},previous[field],item[field]);
            }
            if(plain(previous.能源)&&plain(item.能源))merged.能源=Object.assign({},previous.能源,item.能源);
            return merged;
        };
        for(const source of sourceList){
            if(!plain(source))continue;
            const name=String(source.名称??source.name??'').trim();if(!name||forbidden.has(name))continue;
            const operation=['更新','移除','撤销本轮'].includes(source.操作)?source.操作:'更新';
            const id=nameKey(name);
            if(operation==='撤销本轮'){map.delete(id);continue;}
            const item={名称:name,操作:operation};
            if(Object.hasOwn(source,'所属对象'))item.所属对象=normalizeOwners(source.所属对象);
            for(const field of stringFields)if(Object.hasOwn(source,field))item[field]=String(source[field]??'');
            for(const field of numberFields)if(Object.hasOwn(source,field)){const n=Number(source[field]);item[field]=Number.isFinite(n)?n:source[field];}
            if(Object.hasOwn(source,'能源')){
                if(source.能源===null)item.能源=null;
                else if(plain(source.能源)){
                    item.能源={};
                    for(const field of ['类型','描述'])if(Object.hasOwn(source.能源,field))item.能源[field]=String(source.能源[field]??'');
                    for(const field of ['当前','上限'])if(Object.hasOwn(source.能源,field)){const n=Number(source.能源[field]);if(Number.isFinite(n))item.能源[field]=n;}
                }
            }
            if(Object.hasOwn(source,'消耗单元'))item.消耗单元=normalizeMap(source.消耗单元,'unit');
            if(Object.hasOwn(source,'建设序列'))item.建设序列=normalizeMap(source.建设序列,'build');
            if(Object.hasOwn(source,'驻扎人员'))item.驻扎人员=normalizeMap(source.驻扎人员,'person');
            if(Object.hasOwn(source,'待办事件'))item.待办事件=Array.isArray(source.待办事件)?source.待办事件.filter(x=>typeof x==='string'):[];
            map.set(id,mergeItem(map.get(id),item));
        }
        return Array.from(map.values());
    }
    function normalizeRelationResultList(value) {
        const list=Array.isArray(value)?value:[],map=new Map();
        for(const source of list){
            if(!plain(source))continue;
            const name=String(source.名称??source.name??'').trim();if(!name)continue;
            const item={名称:name,操作:source.操作==='撤销本轮'?'撤销本轮':'更新'};
            for(const key of RELATION_SYNC_KEYS){
                if(!Object.hasOwn(source,key))continue;
                const raw=source[key];
                if(['在场','是否队友'].includes(key))item[key]=typeof raw==='boolean'?raw:!!raw;
                else if(['HP','THP','EP','好感度'].includes(key)){const n=Number(raw);item[key]=Number.isFinite(n)?n:raw;}
                else if(key==='身份')item[key]=Array.isArray(raw)?raw.filter(x=>typeof x==='string'):raw;
                else if(RELATION_COMPONENT_FIELDS.has(key)||key==='当前形态')item[key]=copy(raw);
                else item[key]=raw==null?'':String(raw);
            }
            const id=nameKey(name),prev=map.get(id);
            if(item.操作==='撤销本轮'){map.delete(id);continue;}
            map.set(id,prev?Object.assign(prev,item):item);
        }
        return Array.from(map.values());
    }
    function normalizeWorldResult(value) {
        if(!plain(value))throw new Error('WorldResult 必须是 JSON 对象');
        const result={摘要:String(value.摘要??value.summary??'世界继续推进')};
        const legacyStage=(Object.hasOwn(value,'公开摘要')||Object.hasOwn(value,'public_summary'))?String(value.公开摘要??value.public_summary??'').trim():'';
        result.货币={};
        if(plain(value.货币)){
            for(const key of Object.keys(CURRENCY_FIELDS))if(Object.hasOwn(value.货币,key))result.货币[key]=String(value.货币[key]??'');
        }
        result.历法={};
        if(plain(value.历法)){
            if(Object.hasOwn(value.历法,'名称'))result.历法.名称=String(value.历法.名称??'');
            if(Array.isArray(value.历法.月份天数))result.历法.月份天数=value.历法.月份天数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24);
            if(Object.hasOwn(value.历法,'闰年规则'))result.历法.闰年规则=String(value.历法.闰年规则??'');
        }
        for(const key of ['事件','人物','势力地区','历史','传播','势力','探索']){
            const operations=(key==='传播')?['更新','移除','撤销本轮']:['更新','撤销本轮'];
            result[key]=normalizeNamedResultList(value[key],sampleForWorldResultList(key),operations);
        }
        result.资产=normalizeAssetResultList(value.资产);
        result.异端=(Array.isArray(value.异端)?value.异端:[]).filter(plain).map(item=>({
            名称:String(item.名称||'').trim(),
            操作:item.操作==='撤销本轮'?'撤销本轮':'更新',
            状态:['活跃','死亡'].includes(item.状态)?item.状态:''
        })).filter(item=>item.名称&&item.状态);
        result.因果={};
        const causal=plain(value.因果)?value.因果:{};
        if(Object.hasOwn(causal,'当前阶段'))result.因果.当前阶段=String(causal.当前阶段||'');
        else if(legacyStage)result.因果.当前阶段=legacyStage;
        if(Array.isArray(causal.宏观顺序))result.因果.宏观顺序=causal.宏观顺序.map(x=>String(x||'').trim()).filter(Boolean).slice(0,5);
        result.因果.偏移记录=normalizeNamedResultList(causal.偏移记录,EXISTING.偏移记录,['更新','撤销本轮']);
        result.传闻={};
        const rumors=plain(value.传闻)?value.传闻:{};
        for(const key of WORLD_RESULT_RUMORS){
            let list=normalizeNamedResultList(rumors[key],EXISTING[key],['更新','移除','撤销本轮']);
            if(key==='街头巷议'){
                for(const item of list)if(Object.hasOwn(item,'可信度'))item.可信度=normalizeRumorCredibility(item.可信度);
                const seen=new Set(),deduped=[];
                for(const item of list){
                    const signature=String(item.内容||'').replace(/\s+/g,' ').trim();
                    if(item.操作==='更新'&&signature&&seen.has(signature))continue;
                    if(item.操作==='更新'&&signature)seen.add(signature);
                    deduped.push(item);
                }
                list=deduped;
            }
            result.传闻[key]=list;
        }
        const relationSource=plain(value.关系)&&!Array.isArray(value.关系)
            ?Object.entries(value.关系).map(([name,item])=>plain(item)?Object.assign({名称:name},copy(item)):{名称:name,好感度:item})
            :value.关系;
        result.关系=normalizeRelationResultList(relationSource);
        return result;
    }
    function mergeNamedResultLists(base,incoming) {
        const map=new Map();
        for(const item of base||[])map.set(nameKey(item.名称),copy(item));
        for(const item of incoming||[]){
            const id=nameKey(item.名称);
            if(item.操作==='撤销本轮'){map.delete(id);continue;}
            map.set(id,Object.assign(map.get(id)||{},copy(item)));
        }
        return Array.from(map.values());
    }
    function mergeWorldResults(base,incoming) {
        const a=base?normalizeWorldResult(base):normalizeWorldResult({摘要:''});
        const b=normalizeWorldResult(incoming);
        const result={摘要:[a.摘要,b.摘要].filter(Boolean).filter((x,i,list)=>list.indexOf(x)===i).join('；')};
        result.货币=Object.assign({},a.货币||{},b.货币||{});
        result.历法=Object.assign({},a.历法||{},b.历法||{});
        for(const key of ['事件','人物','势力地区','历史','传播','势力','探索','资产','异端','关系'])result[key]=mergeNamedResultLists(a[key],b[key]);
        result.因果={
            偏移记录:mergeNamedResultLists(a.因果?.偏移记录,b.因果?.偏移记录)
        };
        if(Object.hasOwn(b.因果||{},'当前阶段'))result.因果.当前阶段=b.因果.当前阶段;
        else if(Object.hasOwn(a.因果||{},'当前阶段'))result.因果.当前阶段=a.因果.当前阶段;
        if(Array.isArray(b.因果?.宏观顺序)&&b.因果.宏观顺序.length)result.因果.宏观顺序=copy(b.因果.宏观顺序);
        else if(Array.isArray(a.因果?.宏观顺序))result.因果.宏观顺序=copy(a.因果.宏观顺序);
        result.传闻={};
        for(const key of WORLD_RESULT_RUMORS)result.传闻[key]=mergeNamedResultLists(a.传闻?.[key],b.传闻?.[key]);
        return result;
    }
    function worldResultFragments(value) {
        const result=normalizeWorldResult(value),fragments=[];
        const push=(label,body)=>fragments.push({label,result:Object.assign({摘要:''},body)});
        for(const [key,value] of Object.entries(result.货币||{}))push('货币/'+key,{货币:{[key]:copy(value)}});
        for(const [key,value] of Object.entries(result.历法||{}))push('历法/'+key,{历法:{[key]:copy(value)}});
        for(const key of ['事件','人物','势力地区','历史','传播','势力','探索','资产','异端']){
            for(const item of result[key]||[])push(key+'/'+item.名称,{[key]:[copy(item)]});
        }
        if(Object.hasOwn(result.因果||{},'当前阶段'))push('因果/当前阶段',{因果:{当前阶段:result.因果.当前阶段}});
        if(Array.isArray(result.因果?.宏观顺序)&&result.因果.宏观顺序.length)push('因果/宏观顺序',{因果:{宏观顺序:copy(result.因果.宏观顺序)}});
        for(const item of result.因果?.偏移记录||[])push('因果/偏移记录/'+item.名称,{因果:{偏移记录:[copy(item)]}});
        // 容量约束针对最终分类；新增与移除必须一起验收，不能拆散换新操作。
        for(const key of WORLD_RESULT_RUMORS)if(result.传闻?.[key]?.length)push('传闻/'+key,{传闻:{[key]:copy(result.传闻[key])}});
        for(const item of result.关系||[])push('关系/'+item.名称,{关系:[copy(item)]});
        return {摘要:result.摘要,fragments};
    }
    function shortSchemaValue(value) {
        if(value===undefined)return 'undefined';
        let raw;try{raw=JSON.stringify(value);}catch(_){raw=String(value);}
        if(raw===undefined)raw=String(value);
        return raw.length>140?raw.slice(0,137)+'…':raw;
    }
    function firstSchemaDifference(before,after,parts) {
        if(same(before,after))return null;
        if(plain(before)&&plain(after)){
            const keys=Array.from(new Set([...Object.keys(before),...Object.keys(after)]));
            for(const key of keys){
                const diff=firstSchemaDifference(before[key],after[key],parts.concat(key));
                if(diff)return diff;
            }
        }
        if(Array.isArray(before)&&Array.isArray(after)&&before.length===after.length){
            for(let i=0;i<before.length;i++){
                const diff=firstSchemaDifference(before[i],after[i],parts.concat(String(i)));
                if(diff)return diff;
            }
        }
        return {parts,before,after};
    }
    function schemaMismatchError(beforeState,afterState,patchPath) {
        const parts=tokens(patchPath),before=get(beforeState,parts),after=get(afterState,parts);
        const diff=firstSchemaDifference(before,after,parts)||{parts,before,after};
        return new Error('字段未通过完整 Schema 校验：'+pointer(diff.parts)+'（'+shortSchemaValue(diff.before)+' → '+shortSchemaValue(diff.after)+'）');
    }
    function stageWorldResult(stat,accepted,incoming,validate) {
        const split=worldResultFragments(incoming);
        let staged=accepted?mergeWorldResults(accepted,{摘要:split.摘要}):normalizeWorldResult({摘要:split.摘要});
        let pending=split.fragments.map(unit=>Object.assign({},unit,{error:null})),progress=true;
        while(pending.length&&progress){
            progress=false;
            const nextPending=[];
            for(const unit of pending){
                const candidate=mergeWorldResults(staged,unit.result);
                try{
                    const compiled=compileWorldResult(stat,candidate);
                    const built=materializeWorldUpdate(stat,[],compiled.patches);
                    if(typeof validate==='function'){
                        const checked=validate(built.next);
                        for(const patch of compiled.patches){
                            if(patch.op!=='remove'&&!same(get(checked,tokens(patch.path)),get(built.next,tokens(patch.path))))throw schemaMismatchError(built.next,checked,patch.path);
                        }
                    }
                    staged=candidate;
                    progress=true;
                }catch(error){
                    unit.error=error;
                    nextPending.push(unit);
                }
            }
            pending=nextPending;
        }
        return {
            accepted:staged,
            rejected:pending.map(unit=>({片段:unit.label,原因:String(unit.error?.message||unit.error||'业务片段未通过校验')}))
        };
    }
    // 首次请求与纠错共用同一份交付标准，避免模型失败后才知道宏观骨架的硬要求。
    function macroBackbonePlan(current,active,future) {
        const missing=Math.max(0,3-current);
        return [
            '宏观骨架：当前可推进宏观节点'+current+'个（进行中'+active+'、待发生'+future+'），还需补充至少'+missing+'个真正的宏观节点；已确认正在发生的阶段转折可记进行中，其余新增节点记待发生。会合、撤离、赶路、局部争夺/突破等近期节点不计入宏观骨架，不要反复把它们改标为宏观节点。',
            '事件交付：在 WorldResult.事件 中实际建立节点，分类=宏观节点；描述说明篇章、地区整体局势、战争、势力格局或关键人物命运的一个阶段转折，不能只在摘要或因果轨道里列名字。已有合格节点沿用原名，只提交缺失或变化字段。',
            '宏观排期：每个新增节点必须给出明确时间锚点；沿用明确资料的日期或时间精度，精确日期未知时使用可理解的相对/因果时间，不写近期/稍后/未来/待定/未知。条件按需填写。前因只能引用已存在，或本轮同时提交且成功建立的事件名称；无明确前因使用 []，不得用当前阶段或自然语言原因代替事件名。',
            '因果轨道：在保留已接受宏观节点的基础上，补写 因果.宏观顺序；只使用最终3~5个仍可推进且 分类=宏观节点 的不同事件名称，不要写当前阶段、当前事件或近期节点。'
        ];
    }
    function retryPlanForFailure(error,rejected=[]) {
        const plan=[];
        for(const item of rejected||[])plan.push(item.片段+'：'+item.原因);
        const message=String(error?.message||error||'');
        let match=message.match(/宏观事件不足：需要至少3个可推进宏观节点（进行中\+待发生），当前仅(\d+)个（进行中(\d+)个，待发生(\d+)个）/);
        if(match){
            const current=Math.max(0,Number(match[1])||0),active=Math.max(0,Number(match[2])||0),future=Math.max(0,Number(match[3])||0);
            plan.push(...macroBackbonePlan(current,active,future));
        }else if(/因果轨道未形成有效宏观投影/.test(message)){
            plan.push('因果轨道：不要重写已接受事件，只补写 因果.宏观顺序；长度必须3~5，且每个名称都必须对应已建立且未取消的宏观节点。');
        }else if((match=message.match(/到期事件未处理：([^。]+)/))){
            plan.push('到期事件/'+match[1]+'：本轮必须明确启动该事件，或更新本轮复核日期、阻碍条件与下次检查。');
        }else if((match=message.match(/事件时间锚点缺失或过于模糊：([^；]+)/))){
            plan.push('事件/'+match[1]+'：补写明确时间锚点；优先具体世界日期/时段，精确日期未知时写相对或因果时间，禁止空值和“近期/稍后/未来/待定/未知”。');
        }else if((match=message.match(/事件时间锚点仍未补全：([^；]+)/))){
            for(const name of match[1].split('、').filter(Boolean))plan.push('事件/'+name+'：补写明确时间锚点；优先具体世界日期/时段，精确日期未知时写相对或因果时间，禁止空值和“近期/稍后/未来/待定/未知”。');
        }else if((match=message.match(/超期活动事件仍未复核：([^；]+)/))){
            for(const name of match[1].split('、').filter(Boolean))plan.push('事件/'+name+'：该局部活动已远超正常持续窗口。若实际早已结束则改为已完成并补结果；若失效则已取消；只有确实仍持续时才保留进行中，并把更新时间写为当前世界时间、更新当前描述并填写下次检查。');
        }else if((match=message.match(/时间越界记录仍未修复：([^；]+)/))){
            plan.push('时间一致性：修复这些已经发生的记录，任何已完成/进行中事件、人物更新时间、地区已发生变化、历史与传播都不得晚于当前世界时间：'+match[1]);
        }else if((match=message.match(/异端活动未复核：([^；]+)/))){
            for(const name of match[1].split('、').filter(Boolean))plan.push('异端活动/'+name+'：在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动，并把更新时间精确写为当前世界时间；若本轮已确认死亡，则只更新异端状态=死亡，不再提交人物活动。');
        }else if((match=message.match(/NPC构筑审计未推进：([^；]+)/))){
            for(const name of match[1].split('、').filter(Boolean))plan.push('NPC构筑审计/'+name+'：只在 WorldResult.关系 中补齐该既有NPC至少一个列出的构筑缺口；优先补职业/血统/装备/技能/状态/形态或缺失档案字段，不得新建NPC、改HP_MAX/EP_MAX或输出真属性/最终属性。');
        }else if(message&&!rejected.length){
            plan.push('整体校验：'+message);
        }
        return Array.from(new Set(plan.filter(Boolean)));
    }
    // UI 和模型请求共用去重视图；原始分片仍保留在日志，未知错误不截断。
    function retryFeedback(error,rejected=[],plans=[]) {
        const message=String(error?.message||error||'');
        const summary=rejected?.length?message.split('\n\n具体原因\n')[0]:message;
        const compactReason=value=>{
            const reason=String(value||'');
            return /^事件前因(?:不存在|非法自引用)：/.test(reason)?reason.split('；')[0]:reason;
        };
        const rawIssues=(rejected||[]).map(item=>String(item.片段||'')+'：'+String(item.原因||''));
        const issues=Array.from(new Set((rejected||[]).map(item=>{
            const reason=compactReason(item.原因);
            return /^事件前因(?:不存在|非法自引用)：/.test(reason)?reason:String(item.片段||'')+'：'+reason;
        })));
        const redundant=new Set([...rawIssues,...issues,summary,'整体校验：'+summary,'整体校验：'+message]);
        const actions=Array.from(new Set((plans||[]).filter(Boolean).map(String))).filter(line=>!redundant.has(line));
        return {summary,issues,actions};
    }
    function makeRetryFailure(rejected,globalError) {
        const reasons=[];
        if(rejected?.length)reasons.push('部分业务片段未通过（'+rejected.length+'项）');
        if(globalError)reasons.push(String(globalError.message||globalError));
        const error=new Error(reasons.join('；')||'WorldResult 未通过业务校验');
        error.retryPlan=retryPlanForFailure(globalError,rejected);
        error.rejectedSlices=copy(rejected||[]);
        return error;
    }
    const MICRO_EXPLORATION_SEGMENT=/^(?:天台|教室|走廊|楼梯|楼层|办公室|医务室|校医室|房间|寝室|宿舍房间|洗手间|浴室|食堂|门厅|入口|出口|校门|桥头|街口|小巷)$/;
    function explorationGranularity(name) {
        const raw=String(name||'').trim();
        if(!raw)return {invalid:true,parent:''};
        if(MICRO_EXPLORATION_SEGMENT.test(raw))return {invalid:true,parent:''};
        const parts=raw.split(/\s*(?:-|—|–|→|>|\/|／|·|・)\s*/).filter(Boolean);
        if(parts.length>1&&MICRO_EXPLORATION_SEGMENT.test(parts.at(-1)))return {invalid:true,parent:parts.slice(0,-1).join('-')};
        return {invalid:false,parent:''};
    }
    function repairExplorationGranularity(stat) {
        const bucket=stat?.世界?.探索;if(!plain(bucket))return [];
        const patches=[];
        for(const name of Object.keys(bucket)){
            const info=explorationGranularity(name);if(!info.invalid||!info.parent)continue;
            const child=bucket[name],parent=bucket[info.parent];
            const merged=plain(parent)
                ? Object.assign(copy(EXISTING.探索),copy(parent),{探索度:Math.max(Number(parent.探索度)||0,Number(child?.探索度)||0)})
                : Object.assign(copy(EXISTING.探索),{
                    风险:String(child?.风险||'F'),
                    探索度:Number(child?.探索度)||0,
                    描述:'由旧版子区域探索记录合并，待补充整体地标描述',
                    隐藏真相:''
                });
            bucket[info.parent]=merged;delete bucket[name];
            patches.push({op:parent?'replace':'add',path:pointer(['世界','探索',info.parent]),value:copy(merged)});
            patches.push({op:'remove',path:pointer(['世界','探索',name])});
        }
        return patches;
    }
    function resultFields(item,sample) {
        const out={};
        for(const key of Object.keys(sample||{}))if(Object.hasOwn(item,key))out[key]=copy(item[key]);
        return out;
    }
    function validateStringArray(value,label) {
        if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))throw new Error(label+' 必须是 string[]');
    }
    function validateStringMap(value,label) {
        if(!plain(value)||Object.values(value).some(x=>typeof x!=='string'))throw new Error(label+' 必须是 string map');
    }
    function validateQuality(value,label) {
        if(!RELATION_QUALITIES.includes(String(value||'')))throw new Error(label+' 只允许 '+RELATION_QUALITIES.join('/'));
    }
    function validateRawAttributes(value,label,{requireFive=false,allowNumbers=false}={}) {
        if(!plain(value))throw new Error(label+' 必须是对象');
        for(const key of Object.keys(value)){
            if(!RELATION_ATTR_KEYS.includes(key))throw new Error(label+' 含非法属性 '+key);
            if(allowNumbers&&typeof value[key]==='number'&&Number.isFinite(value[key])){
                if(value[key]===0)throw new Error(label+'.'+key+' 数值0应省略，避免ZOD清洗后产生无效差异');
                continue;
            }
            validateQuality(value[key],label+'.'+key);
        }
        if(requireFive)for(const key of RELATION_ATTR5)if(!Object.hasOwn(value,key))throw new Error(label+' 缺少基础属性 '+key);
    }
    function validateComponentShape(field,value,name='NPC') {
        if(!plain(value))throw new Error(name+' '+field+' 必须是对象');
        const assertFields=(item,keys,label)=>{for(const key of keys)if(!Object.hasOwn(item,key))throw new Error(label+' 缺少字段 '+key);};
        for(const [entryName,item] of Object.entries(value)){
            const label=name+' '+field+'.'+entryName;
            if(!entryName||!plain(item))throw new Error(label+' 必须是完整对象');
            if(field==='职业'){
                assertFields(item,['类型','特性','来源'],label);
                if(!['战斗','生活','辅助'].includes(item.类型))throw new Error(label+' 类型无效');
                validateStringArray(item.特性,label+'.特性');
                if(typeof item.来源!=='string')throw new Error(label+'.来源 必须是 string');
            }else if(field==='技能'){
                assertFields(item,['品质','类型','标签','效果','描述','消耗'],label);
                validateQuality(item.品质,label+'.品质');
                if(!Number.isInteger(item.类型)||item.类型<0||item.类型>2)throw new Error(label+'.类型 只能是0/1/2');
                validateStringArray(item.标签,label+'.标签');validateStringMap(item.效果,label+'.效果');
                if(typeof item.描述!=='string'||typeof item.消耗!=='string')throw new Error(label+' 描述/消耗必须是 string');
            }else if(field==='血统'){
                assertFields(item,['品质','标签','原始属性','效果','描述'],label);
                validateQuality(item.品质,label+'.品质');validateStringArray(item.标签,label+'.标签');
                validateRawAttributes(item.原始属性,label+'.原始属性',{requireFive:true});validateStringMap(item.效果,label+'.效果');
                if(typeof item.描述!=='string')throw new Error(label+'.描述 必须是 string');
            }else if(field==='装备'){
                assertFields(item,['品质','类型','标签','原始属性','效果','描述','消耗','状态'],label);
                validateQuality(item.品质,label+'.品质');
                if(!Number.isInteger(item.类型)||item.类型<0||item.类型>8)throw new Error(label+'.类型 只能是0~8');
                if(!Number.isInteger(item.状态)||item.状态<0||item.状态>2)throw new Error(label+'.状态 只能是0/1/2');
                validateStringArray(item.标签,label+'.标签');validateRawAttributes(item.原始属性,label+'.原始属性');
                validateStringMap(item.效果,label+'.效果');
                if(typeof item.描述!=='string'||typeof item.消耗!=='string')throw new Error(label+' 描述/消耗必须是 string');
            }else if(field==='状态'){
                assertFields(item,['类型','品质','持续','来源','原始属性','效果'],label);
                if(!['增益','减益','特殊'].includes(item.类型))throw new Error(label+'.类型无效');
                validateQuality(item.品质,label+'.品质');validateRawAttributes(item.原始属性,label+'.原始属性',{allowNumbers:true});
                if(typeof item.持续!=='string'||typeof item.来源!=='string'||typeof item.效果!=='string')throw new Error(label+' 持续/来源/效果必须是 string');
            }else if(field==='形态库'){
                assertFields(item,['层级','消耗','冷却','状态','标签','原始属性','效果','技能','描述'],label);
                if(!RELATION_RANKS.includes(item.层级))throw new Error(label+'.层级无效');
                validateStringArray(item.标签,label+'.标签');validateRawAttributes(item.原始属性,label+'.原始属性',{requireFive:true});
                validateStringMap(item.效果,label+'.效果');
                for(const key of ['消耗','冷却','状态','描述'])if(typeof item[key]!=='string')throw new Error(label+'.'+key+' 必须是 string');
                validateComponentShape('技能',item.技能,label);
            }
        }
    }
    function validateRelationSyncValue(field,value,npc,name='NPC') {
        if(field==='在场'||field==='是否队友'){if(typeof value!=='boolean')throw new Error(name+' '+field+' 必须是 boolean');return;}
        if(['种族','性格','喜爱','外貌','着装','态度','背景故事'].includes(field)){if(typeof value!=='string')throw new Error(name+' '+field+' 必须是 string');return;}
        if(field==='身份'){validateStringArray(value,name+' 身份');return;}
        if(field==='层级'){if(!RELATION_RANKS.includes(value))throw new Error(name+' 层级只允许 '+RELATION_RANKS.join('/'));return;}
        if(RELATION_COMPONENT_FIELDS.has(field)){validateComponentShape(field,value,name);return;}
        if(field==='当前形态'){
            if(!plain(value)||typeof value.激活!=='boolean'||typeof value.名称!=='string')throw new Error(name+' 当前形态必须是 {激活:boolean,名称:string}');
            return;
        }
        if(['HP','THP','EP','好感度'].includes(field)){
            if(typeof value!=='number'||!Number.isFinite(value))throw new Error(name+' '+field+' 必须是有效数字');
            if(field==='好感度'&&(value<-100||value>100))throw new Error(name+' 好感度范围 -100~100');
            if(field!=='好感度'&&value<0)throw new Error(name+' '+field+' 不能小于0');
            if(field==='HP'&&Number.isFinite(Number(npc?.HP_MAX))&&value>Number(npc.HP_MAX))throw new Error(name+' HP 不能超过 HP_MAX');
            if(field==='EP'&&Number.isFinite(Number(npc?.EP_MAX))&&value>Number(npc.EP_MAX))throw new Error(name+' EP 不能超过 EP_MAX');
        }
    }
    function materializeRelationComponent(field,value) {
        const out=copy(value);
        if(['血统','装备','状态','形态库'].includes(field)&&plain(out)){
            for(const item of Object.values(out)){
                if(!plain(item))continue;
                item.真属性={};
            }
        }
        return out;
    }
    function mergeRelationComponent(field,oldValue,incoming) {
        if(!RELATION_COMPONENT_FIELDS.has(field))return materializeRelationComponent(field,incoming);
        const merged=plain(oldValue)?copy(oldValue):{};
        for(const [name,item] of Object.entries(incoming||{}))merged[name]=materializeRelationComponent(field,{[name]:item})[name];
        return merged;
    }

    const ASSET_DEFAULTS={所属对象:[],类型:'',主体规模:1,完整度:100,状态:'',建设序列:{},驻扎人员:{},待办事件:[]};
    const ASSET_ENERGY_DEFAULTS={类型:'',当前:0,上限:0,描述:''};
    const ASSET_UNIT_DEFAULTS={余量:0,上限:0,加成:[]};
    const ASSET_BUILD_DEFAULTS={阶段:'基础',功能:'',加成:[],产出:'',下次产出日期:'',下次产出游天:0};
    function assertWorldAssetScope(item,isNew=false) {
        if(!isNew)return;
        const type=String(item?.类型||'').trim(),name=String(item?.名称||'').trim();
        if(!WORLD_ASSET_TYPE_SET.has(type))throw new Error('新资产类型非法：'+(name||'未命名')+'；资产只允许固定地产、大型载具或要塞，普通道具/材料/消耗品不得进入资产账簿');
        if(ITEMLIKE_ASSET_NAME.test(name))throw new Error('疑似道具被误写为资产：'+name+'；请写入角色道具/装备/形态等对应字段，不得写入资产');
    }
    function materializeAssetRecord(oldValue,item,isNew=false) {
        const oldAsset=plain(oldValue)?copy(oldValue):{},asset=Object.assign(copy(ASSET_DEFAULTS),oldAsset);
        const normalizeOwners=value=>{const source=Array.isArray(value)?value:(value===undefined?[]:[value]),out=[];for(const raw of source){const owner=String(raw??'').trim();if(!owner||owner==='无主'||out.includes(owner))continue;out.push(owner);}return out.slice(0,12);};
        // 旧资产没有所属对象时兼容为玩家资产；显式空数组则表示无主。
        asset.所属对象=Object.hasOwn(oldAsset,'所属对象')?normalizeOwners(oldAsset.所属对象):['<user>'];
        if(isNew){
            if(!Object.hasOwn(item,'所属对象'))throw new Error('新资产必须明确所属对象数组；无主资产请使用空数组：'+item.名称);
            if(!Object.hasOwn(item,'类型')||!String(item.类型||'').trim())throw new Error('新资产必须明确类型：'+item.名称);
        }
        if(Object.hasOwn(item,'所属对象'))asset.所属对象=normalizeOwners(item.所属对象);
        for(const field of ['类型','主体规模','完整度','状态'])if(Object.hasOwn(item,field))asset[field]=copy(item[field]);
        if(Object.hasOwn(item,'能源')){
            if(item.能源===null)delete asset.能源;
            else asset.能源=Object.assign(copy(ASSET_ENERGY_DEFAULTS),plain(oldAsset.能源)?copy(oldAsset.能源):{},plain(item.能源)?copy(item.能源):{});
        }
        const mergeNamedMap=(field,defaults)=>{
            if(!Object.hasOwn(item,field))return;
            const merged=plain(oldAsset[field])?copy(oldAsset[field]):{};
            for(const [name,value] of Object.entries(item[field]||{})){
                if(forbidden.has(name))continue;
                if(value===null){delete merged[name];continue;}
                const previous=plain(merged[name])?copy(merged[name]):{};
                merged[name]=Object.assign(copy(defaults),previous,copy(value));
            }
            if(Object.keys(merged).length)asset[field]=merged;else delete asset[field];
        };
        mergeNamedMap('消耗单元',ASSET_UNIT_DEFAULTS);
        mergeNamedMap('建设序列',ASSET_BUILD_DEFAULTS);
        if(Object.hasOwn(item,'驻扎人员')){
            const merged=plain(oldAsset.驻扎人员)?copy(oldAsset.驻扎人员):{};
            for(const [name,value] of Object.entries(item.驻扎人员||{})){
                if(forbidden.has(name))continue;
                if(value===null)delete merged[name];else merged[name]=String(value??'');
            }
            asset.驻扎人员=merged;
        }
        if(Object.hasOwn(item,'待办事件'))asset.待办事件=copy(item.待办事件||[]);
        if(!plain(asset.建设序列))asset.建设序列={};
        if(!plain(asset.驻扎人员))asset.驻扎人员={};
        if(!Array.isArray(asset.待办事件))asset.待办事件=[];
        return asset;
    }

    function compileWorldResult(stat,value) {
        const result=normalizeWorldResult(value),patches=[],warnings=[];
        const exists=parts=>get(stat,canonicalizeParts(parts,stat));
        const addEntity=(parts,item,sample,options={})=>{
            if(item.操作==='撤销本轮')return;
            let actual=canonicalizeParts(parts,stat),old=get(stat,actual);
            if(item.操作==='移除'){
                if(old!==undefined&&options.removable)patches.push({op:'remove',path:pointer(actual)});
                return;
            }
            const record=resultFields(item,sample);
            if(options.person&&!old&&!Object.hasOwn(record,'所属世界'))record.所属世界=stat.世界?.名称||'';
            if(options.event&&!Object.hasOwn(record,'描述'))record.描述=item.名称;
            if(options.event){
                const mergedEvent=Object.assign(copy(RECORDS.事件),plain(old)?old:{},record);
                if(['待发生','进行中'].includes(mergedEvent.状态)){
                    const anchor=eventTimeAnchor(mergedEvent);
                    if(!anchor||VAGUE_EVENT_TIME.test(anchor))throw new Error('事件时间锚点缺失或过于模糊：'+item.名称+'；请填写具体世界时间/时段，或明确相对/因果时间（如“爆发后数日”“前置节点完成后当日傍晚”），禁止空值和“近期/稍后/未来/待定/未知”');
                }
            }
            if(!Object.keys(record).length){warnings.push('忽略空业务记录：'+item.名称);return;}
            patches.push({op:old===undefined?'add':'replace',path:pointer(actual),value:record});
        };
        for(const [key,value] of Object.entries(result.货币||{})){
            const parts=['世界','货币',key],old=get(stat,parts);
            if(old!==value)patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value});
        }
        for(const [key,value] of Object.entries(result.历法||{})){
            const parts=['世界','历法',key],old=get(stat,parts);
            if(!same(old,value))patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value:copy(value)});
        }
        for(const item of result.事件)addEntity(['世界',PATH,'事件',item.名称],item,{...RECORDS.事件,...MODEL_DETAILS.事件},{event:true});
        const plannedDead=new Set((result.异端||[]).filter(item=>item.操作!=='撤销本轮'&&item.状态==='死亡').map(item=>nameKey(item.名称)));
        for(const item of result.人物){
            const alien=alienRosterMatch(stat,item.名称);
            if((alien&&alien.记录?.状态==='死亡')||plannedDead.has(nameKey(item.名称))){warnings.push('异端已死亡，禁止恢复后台人物：'+item.名称);continue;}
            addEntity(['世界',PATH,'人物',item.名称],item,{...RECORDS.人物,...MODEL_DETAILS.人物},{person:true});
        }
        for(const item of result.势力地区)addEntity(['世界',PATH,'势力地区',item.名称],item,{...RECORDS.势力地区,...MODEL_DETAILS.势力地区});
        for(const item of result.传播)addEntity(['世界',PATH,'传播',item.名称],item,{...RECORDS.传播,...MODEL_DETAILS.传播},{removable:true});
        for(const item of result.历史){
            if(item.操作==='撤销本轮')continue;
            let name=item.名称,parts=['世界',PATH,'历史',name],record=resultFields(item,RECORDS.历史);
            if(!Object.keys(record).length){warnings.push('忽略空历史记录：'+name);continue;}
            if(get(stat,parts)!==undefined){
                const old=get(stat,parts);
                if(same(normalizeBackendRecord('历史',record,old),old))continue;
                let n=2;while(get(stat,['世界',PATH,'历史',name+'#'+n])!==undefined)n++;
                name=name+'#'+n;parts=['世界',PATH,'历史',name];
            }
            patches.push({op:'add',path:pointer(parts),value:record});
        }
        const causal=result.因果||{};
        if(Object.hasOwn(causal,'当前阶段')){
            const parts=['世界','因果轨道','当前阶段'],old=get(stat,parts);
            patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value:causal.当前阶段});
        }
        if(Array.isArray(causal.宏观顺序)&&causal.宏观顺序.length>=3&&causal.宏观顺序.length<=5){
            const parts=['世界','因果轨道','故事线'],story=causal.宏观顺序.join(' -> '),old=get(stat,parts);
            patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value:story});
        } else if(Array.isArray(causal.宏观顺序)&&causal.宏观顺序.length)warnings.push('宏观顺序不足3个，等待补齐后再投影因果轨道');
        for(const item of causal.偏移记录||[]){
            if((stat.设置||{}).世界超稳){warnings.push('世界超稳：忽略偏移 '+item.名称);continue;}
            addEntity(['世界','因果轨道','偏移记录',item.名称],item,EXISTING.偏移记录);
        }
        for(const item of result.势力)addEntity(['世界','势力',item.名称],item,EXISTING.势力);
        for(const item of result.资产||[]){
            if(item.操作==='撤销本轮')continue;
            const target=stableNameIn(stat.资产||{},item.名称),existing=target?(stat.资产||{})[target]:undefined;
            if(!target&&item.操作!=='移除')assertWorldAssetScope(item,true);
            const tombstoneName=stableNameIn(stat?.世界?.[PATH]?.资产墓碑||{},item.名称);
            if(!target&&item.操作!=='移除'&&tombstoneName)throw new Error('资产已被用户或MVU删除，受删除保护，世界引擎不得重建：'+item.名称);
            if(item.操作==='移除'){
                if(target)patches.push({op:'remove',path:pointer(['资产',target])});
                else warnings.push('资产对象不存在，忽略移除：'+item.名称);
                continue;
            }
            const finalName=target||item.名称;
            const record=materializeAssetRecord(existing,item,!target);
            if(existing&&same(existing,record))continue;
            patches.push({op:target?'replace':'add',path:pointer(['资产',finalName]),value:record});
        }
        for(const item of result.探索){
            const granularity=explorationGranularity(item.名称);
            if(granularity.invalid)throw new Error('探索粒度过细：'+item.名称+'。世界.探索只记录整体地标/区域'+(granularity.parent?'，请改为“'+granularity.parent+'”并把微观进展累加到主区域':'，禁止把天台、教室、走廊、房间等子区域作为独立探索项'));
            const old=(stat.世界?.探索||{})[item.名称];
            if(old&&Object.hasOwn(item,'探索度')&&Number(item.探索度)<Number(old.探索度||0))throw new Error('探索度不能无因回退：'+item.名称+' '+old.探索度+' -> '+item.探索度);
            addEntity(['世界','探索',item.名称],item,EXISTING.探索);
        }
        if(!(stat.设置||{}).单一世界)for(const item of result.异端){
            if(item.操作==='撤销本轮')continue;
            const roster=stat.世界?.异端雷达?.名单||{},target=stableNameIn(roster,item.名称);
            if(!target){warnings.push('异端名单对象不存在，禁止世界引擎新增：'+item.名称);continue;}
            const oldStatus=roster[target]?.状态;
            if(oldStatus==='死亡'&&item.状态!=='死亡'){warnings.push('死亡异端状态不可逆：'+target);continue;}
            if(oldStatus===item.状态)continue;
            patches.push({op:'replace',path:pointer(['世界','异端雷达','名单',target,'状态']),value:item.状态});
        } else if(result.异端.length)warnings.push('单一世界：忽略异端雷达更新');
        for(const key of WORLD_RESULT_RUMORS)for(const item of result.传闻[key])addEntity(['传闻',key,item.名称],item,EXISTING[key],{removable:true});
        const auditNames=new Set(npcBuildAudit(stat).map(item=>nameKey(item.名称)));
        for(const item of result.关系||[]){
            if(item.操作==='撤销本轮')continue;
            const target=stableNameIn(stat.关系列表||{},item.名称);
            if(!target){warnings.push('关系对象不存在，禁止世界引擎新建：'+item.名称);continue;}
            const npc=stat.关系列表[target],fields=resultFields(item,RELATION_SYNC_FIELDS);
            if(!Object.keys(fields).length){warnings.push('忽略空关系更新：'+target);continue;}
            for(const [field,value] of Object.entries(fields)){
                if(RELATION_AUDIT_ONLY_FIELDS.has(field)&&!auditNames.has(nameKey(target))){
                    warnings.push('NPC当前不在构筑审计名单，忽略构筑字段：'+target+'/'+field);
                    continue;
                }
                validateRelationSyncValue(field,value,npc,target);
                const nextValue=RELATION_COMPONENT_FIELDS.has(field)?mergeRelationComponent(field,npc?.[field],value):materializeRelationComponent(field,value);
                if(RELATION_COMPONENT_FIELDS.has(field)){
                    const count=Object.keys(nextValue||{}).length;
                    const limit=field==='血统'?2:field==='装备'?6:field==='技能'?4:field==='形态库'?4:12;
                    if(count>limit)throw new Error(target+' '+field+' 数量超过NPC生成规则上限 '+limit);
                }
                if(same(npc?.[field],nextValue))continue;
                patches.push({op:npc?.[field]===undefined?'add':'replace',path:pointer(['关系列表',target,field]),value:copy(nextValue)});
            }
        }
        return {result,patches,warnings};
    }

    function validateState(stat) {
        const state = stat.世界[PATH];
        for (const [category, template] of Object.entries(RECORDS)) {
            if (!plain(state[category]) || Object.keys(state[category]).length > 300) throw new Error(category + '记录过多或结构错误');
            for (const [name,value] of Object.entries(state[category])) {
                if (forbidden.has(name)) throw new Error('非法记录名');
                checkRecord(value,template,DETAILS[category]);
                checkDetails(value,DETAILS[category]);
            }
        }
        for (const [name,event] of Object.entries(state.事件)) {
            if (!['待发生','进行中','已完成','已取消'].includes(event.状态)) throw new Error('非法事件状态：'+name+' = '+String(event.状态||'空')+'；只允许 待发生/进行中/已完成/已取消');
            if (!EVENT_CATEGORIES.has(event.分类)) throw new Error('非法事件分类：'+name+' = '+String(event.分类||'空'));
            if (event.前因.some(id => !Object.hasOwn(state.事件,id))) throw new Error('事件前因不存在：' + name);
        }
        const calendar=plain(stat.世界?.历法)?stat.世界.历法:{};
        const monthDays=Array.isArray(calendar.月份天数)?calendar.月份天数:[];
        if(monthDays.length>24||monthDays.some(n=>!Number.isInteger(Number(n))||Number(n)<1||Number(n)>99))throw new Error('世界历法月份天数无效');
        const hasMonthDay=value=>/\d{1,2}\s*月\s*-?\s*\d{1,2}\s*日/.test(String(value||''));
        if(monthDays.length&&hasMonthDay(stat.世界.时间)&&!calendarDate(stat.世界.时间,calendar))throw new Error('世界时间违反历法月长：'+stat.世界.时间);
        if(monthDays.length){
            for(const [name,event] of Object.entries(state.事件)){
                for(const value of [event.时间,event.开始时间,event.结束时间]){
                    if(hasMonthDay(value)&&!calendarDate(value,calendar))throw new Error('事件日期违反世界历法：'+name+' = '+value);
                }
            }
        }
        const range = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
        for (const [name,item] of Object.entries(stat.世界.势力 || {})) if (!QUALITY_RANKS.includes(item.实力) || !range(item.声望,-5000,10000)) throw new Error('势力品质或声望越界：'+name+'，实力='+String(item.实力)+'，声望='+String(item.声望)+'；实力只允许 '+QUALITY_RANKS.join('/')+'，声望范围 -5000~10000');
        for (const [name,item] of Object.entries(stat.世界.探索 || {})) if (!QUALITY_RANKS.includes(item.风险) || !range(item.探索度,0,100)) throw new Error('探索品质或进度越界：'+name+'，风险='+String(item.风险)+'，探索度='+String(item.探索度)+'；风险只允许 '+QUALITY_RANKS.join('/')+'，探索度范围 0~100');
        for (const item of Object.values((stat.世界.因果轨道 || {}).偏移记录 || {})) if (!range(item.影响程度,-100,120)) throw new Error('因果偏移越界');
        for (const item of Object.values(stat.关系列表 || {})) if (!range(item.好感度,-100,100)) throw new Error('人物好感越界');
        for (const item of Object.values((stat.任务 || {}).列表 || {})) if (!['进行中','可交付','可结算','失败'].includes(item.状态)) throw new Error('任务状态无效');
        for (const item of Object.values((stat.任务 || {}).副本成就 || {})) if (!['未达成','已达成'].includes(item.状态)) throw new Error('成就状态无效');
        for (const category of ['街头巷议','情报交易','布告与檄文']) {
            const items = Object.values((stat.传闻 || {})[category] || {});
            if (items.length > 3) throw new Error('每类当前传闻最多3条：'+category+'合并后有'+items.length+'条；请在同一分类提交操作=移除，移除至少'+(items.length-3)+'条被替代的旧传闻；当前名称：'+Object.keys(stat.传闻[category]).join('、'));
            if (category === '街头巷议' && items.some(i => !['酒话','可疑','或许可信'].includes(i.可信度))) throw new Error('传闻可信度无效');
        }
        const visiting = new Set(), visited = new Set();
        function visit(name) {
            if (visiting.has(name)) throw new Error('事件前因形成循环');
            if (visited.has(name)) return;
            visiting.add(name); state.事件[name].前因.forEach(visit); visiting.delete(name); visited.add(name);
        }
        Object.keys(state.事件).forEach(visit);
        for (const category of ['人物','势力地区','传播']) {
            for (const record of Object.values(state[category])) if (record.关联事件.some(id => !Object.hasOwn(state.事件,id))) throw new Error('关联事件不存在');
        }
    }
    function applyPatches(stat, patches) {
        if (!Array.isArray(patches) || patches.length > 100) throw new Error('每轮最多 100 条补丁');
        const next = copy(stat);
        next.世界[PATH] = Object.assign(emptyState(), next.世界[PATH] || {});
        normalizeBackendState(next);
        for (const patch of patches) {
            if (!plain(patch) || !['add','replace','remove'].includes(patch.op)) throw new Error('不支持的补丁操作');
            let p = canonicalizeParts(tokens(patch.path),next);
            patch.path=pointer(p);
            if (!allowed(p,next)) throw new Error('禁止写入：' + patch.path);
            bootstrapBackendParent(next,p);
            const old = get(next,p);
            if (p[1] === PATH && p[2] === '历史' && (patch.op !== 'add' || old !== undefined)) throw new Error('历史只允许新增');
            // 世界模型经常把“首次设置”写成 replace；对允许创建的世界记录按 upsert 处理。
            if (patch.op !== 'add' && old === undefined && !canUpsertMissing(p,next)) throw new Error('目标不存在：' + patch.path);
            if (patch.op === 'remove' && !(p[0] === '传闻' || (p[1] === PATH && p[2] === '传播') || (p[0] === '资产' && p.length === 2))) throw new Error('仅可移除过期传播、传闻与已彻底消失的资产，其他记录使用状态结束');
            let value=patch.value;
            if (patch.op !== 'remove') {
                if (value === undefined) throw new Error('缺少补丁值');
                const category = p.length === 3 ? p[1] : p.length === 4 ? p[2] : '';
                if(p[0]==='世界'&&p[1]===PATH&&p.length===4&&Object.hasOwn(RECORDS,category)){
                    value=normalizeBackendRecord(category,value,old);
                    checkRecord(value,RECORDS[category],DETAILS[category]);
                    checkDetails(value,DETAILS[category]);
                } else if (EXISTING[category]) {
                    const schema=EXISTING[category];
                    if(plain(value)){
                        const merged=Object.assign(copy(schema),plain(old)?copy(old):{});
                        for(const key of Object.keys(schema))if(Object.hasOwn(value,key))merged[key]=copy(value[key]);
                        value=merged;
                    }
                    checkRecord(value,schema);
                    if(p[0]==='传闻'&&p[1]==='情报交易'&&!(next.系统状态||{}).是否在主神空间&&next.世界?.名称!=='主神空间'&&/空间币/.test(String(value.要价||'')))throw new Error('任务世界情报交易必须使用本地货币，不能使用空间币');
                }
                else if (old !== undefined && (typeof old !== typeof value || Array.isArray(old) !== Array.isArray(value))) throw new Error('字段类型发生改变');
                if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('数值无效');
                if (p[0] === '世界' && p[1] === '因果轨道' && p.length === 3 && typeof value !== 'string') throw new Error('因果摘要必须是文本');
                if (p[0] === '任务' && p[1] === '副本成就' && old === '已达成' && value !== old) throw new Error('不能回退已达成成就');
                if(p[0]==='关系列表'&&p.length===3)validateRelationSyncValue(p[2],value,next.关系列表?.[p[1]],p[1]);
                if (p[p.length-1] === '好感度' && Math.abs(value - old) > 20) throw new Error('单轮好感变动超过20');
            }
            let parent = next;
            for (const key of p.slice(0,-1)) {
                if (parent[key] === undefined) parent[key] = {};
                if (!plain(parent[key])) throw new Error('父路径不是对象');
                parent = parent[key];
            }
            if (patch.op === 'remove') delete parent[p.at(-1)]; else parent[p.at(-1)] = copy(value);
        }
        normalizeBackendState(next);
        normalizeEventLayers(next);
        validateTemporalWrites(stat,next,patches);
        validateState(next);
        for (const [name,item] of Object.entries(next.世界.势力 || {})) {
            const old = (stat.世界.势力 || {})[name];
            if (Math.abs(item.声望 - (old ? old.声望 : 0)) > 1000) throw new Error('单轮声望变动超过1000');
        }
        return next;
    }
    function materializeWorldUpdate(stat,seedPatches,modelPatches) {
        const work=copy(stat);
        work.世界[PATH]=Object.assign(emptyState(),work.世界[PATH]||{});
        normalizeBackendState(work);compactWorldLifecycle(work);
        const appliedSeeds=(seedPatches||[]).filter(p=>get(work,canonicalizeParts(tokens(p.path),work))===undefined);
        let next=applyPatches(work,appliedSeeds);
        next=applyPatches(next,modelPatches||[]);
        const explorationPatches=repairExplorationGranularity(next);
        const layerPatches=normalizeEventLayers(next);
        const causalPatches=repairCausalProjection(next);
        const predecessorPatches=repairMacroPredecessors(next);
        const linkPatches=repairExplicitEventLinks(next);
        compactWorldLifecycle(next);
        validateState(next);
        const repairPatches=[...explorationPatches,...layerPatches,...causalPatches,...predecessorPatches,...linkPatches];
        return {next,appliedSeeds,repairPatches};
    }
    function ensureDueHandled(next,dueList,worldTime) {
        for(const due of dueList||[]){
            const event=next.世界[PATH].事件[due.名称];
            if(!event)continue;
            if(event.状态==='待发生'&&(event.更新时间!==worldTime||!event.下次检查||!event.条件)){
                throw new Error('到期事件未处理：'+due.名称+'。需启动事件，或记录本轮复核日期、阻碍条件与下次检查。');
            }
        }
    }
    function unscheduledEvents(stat) {
        return Object.entries(stat?.世界?.[PATH]?.事件||{}).filter(([,event])=>{
            if(!['待发生','进行中'].includes(event?.状态))return false;
            const anchor=eventTimeAnchor(event);
            return !anchor||VAGUE_EVENT_TIME.test(anchor);
        }).map(([名称,event])=>({名称,分类:event.分类,状态:event.状态,条件:event.条件,前因:copy(event.前因||[]),当前时间:eventTimeAnchor(event)}));
    }
    function ensureEventTimeAnchors(next,required=[]) {
        const missing=[];
        for(const item of required||[]){
            const event=next?.世界?.[PATH]?.事件?.[item.名称];
            if(!event||!['待发生','进行中'].includes(event.状态))continue;
            const anchor=eventTimeAnchor(event);
            if(!anchor||VAGUE_EVENT_TIME.test(anchor))missing.push(item.名称);
        }
        if(missing.length)throw new Error('事件时间锚点仍未补全：'+missing.join('、')+'；请逐项补写具体世界日期/时段，或明确相对/因果时间，禁止空值和“近期/稍后/未来/待定/未知”');
    }
    function ensureStaleActiveHandled(next,required=[],worldTime='') {
        const now=worldDateKey(worldTime),state=next?.世界?.[PATH];
        const unresolved=[],resolved=[];
        for(const item of required||[]){
            const event=state?.事件?.[item.名称];
            if(!event)continue;
            if(['已完成','已取消'].includes(event.状态)){resolved.push(item.名称);continue;}
            const updated=worldDateKey(event.更新时间);
            if(event.状态==='进行中'&&updated!==null&&now!==null&&updated===now&&String(event.下次检查||'').trim())continue;
            unresolved.push(item.名称);
        }
        if(unresolved.length)throw new Error('超期活动事件仍未复核：'+unresolved.join('、')+'；局部事件跨越过长时间仍标记进行中，必须结束/取消，或更新到当前时间并填写下次检查');
        // 对“本轮刚刚确认早已结束”的陈旧局部事件绕过24小时展示宽限：
        // 清理人物/地区/传播的软引用；若没有活跃事件继续依赖它，则立即压成历史。
        for(const name of resolved){
            const event=state?.事件?.[name];if(!event)continue;
            detachEventSoftRefs(state,name);
            const hardRef=Object.entries(state.事件||{}).some(([other,record])=>other!==name&&!['已完成','已取消'].includes(record?.状态)&&Array.isArray(record?.前因)&&record.前因.includes(name));
            if(!hardRef)archiveFinishedEvent(next,state,name,event,[]);
        }
    }
    function ensureTemporalAnomaliesResolved(next,required=[]) {
        if(!(required||[]).length)return;
        const remaining=temporalAnomalies(next);
        const keys=new Set((required||[]).map(item=>item.类型+'\u0000'+item.名称));
        const bad=remaining.filter(item=>keys.has(item.类型+'\u0000'+item.名称));
        if(bad.length)throw new Error('时间越界记录仍未修复：'+bad.map(item=>item.类型+'/'+item.名称+'('+item.字段+'='+item.值+')').join('、'));
    }
    function ensureMacroBackbone(next,timeline,required=true) {
        if(!required||!timeline?.需要补充远期)return;
        const allMacro=Object.entries(next?.世界?.[PATH]?.事件||{}).filter(([,e])=>e.分类==='宏观节点'&&e.状态!=='已取消');
        const activeMacro=allMacro.filter(([,e])=>e.状态==='进行中');
        const futureMacro=allMacro.filter(([,e])=>e.状态==='待发生');
        const openMacro=allMacro.filter(([,e])=>['进行中','待发生'].includes(e.状态));
        if(openMacro.length<3)throw new Error('宏观事件不足：需要至少3个可推进宏观节点（进行中+待发生），当前仅'+openMacro.length+'个（进行中'+activeMacro.length+'个，待发生'+futureMacro.length+'个）');
        const stages=storyStages(next?.世界?.因果轨道?.故事线);
        const names=new Set(allMacro.map(([name])=>name));
        if(stages.length<3||stages.length>5||stages.some(name=>!names.has(name)))throw new Error('因果轨道未形成有效宏观投影：请用已建立的宏观节点生成3~5节点故事线');
    }

    function progressionAnchorChanged(before,after) {
        return before?.世界?.名称!==after?.世界?.名称||before?.世界?.时间!==after?.世界?.时间||!!before?.系统状态?.是否在主神空间!==!!after?.系统状态?.是否在主神空间;
    }
    function firstCompleteJsonObject(source) {
        const text=String(source||''),start=text.indexOf('{');
        if(start<0)return '';
        let depth=0,inString=false,escaped=false;
        for(let i=start;i<text.length;i++){
            const ch=text[i];
            if(inString){
                if(escaped)escaped=false;
                else if(ch==='\\')escaped=true;
                else if(ch==='"')inString=false;
                continue;
            }
            if(ch==='"'){inString=true;continue;}
            if(ch==='{')depth++;
            else if(ch==='}'){
                depth--;
                if(depth===0)return text.slice(start,i+1);
                if(depth<0)return '';
            }
        }
        return '';
    }
    function parseReply(text) {
        let source=String(text).trim();
        const block=source.match(/<world_update\s*>([\s\S]*?)<\/world_update>/i);
        if(block)source=block[1].trim();
        const fence=source.match(/\x60\x60\x60(?:json)?\s*([\s\S]*?)\x60\x60\x60/i);
        if(fence)source=fence[1].trim();
        let result;
        try {result=JSON.parse(source);}
        catch(error){
            const candidate=firstCompleteJsonObject(source);
            try {if(!candidate)throw error;result=JSON.parse(candidate);}
            catch(_){throw new Error('返回 JSON 无法解析：'+error.message+'；原始回复保留在请求检查。');}
        }
        if(!plain(result))throw new Error('回复必须是一个 JSON 对象');
        for(const key of ['WorldResult','world_result','world_update','result']){
            if(plain(result[key])&&Object.keys(result).length===1){result=result[key];break;}
        }
        if(Array.isArray(result.patches)&&typeof result.summary==='string'){
            return {kind:'legacy_patches',summary:result.summary,patches:result.patches};
        }
        const worldResult=normalizeWorldResult(result);
        return {kind:'world_result',summary:worldResult.摘要,worldResult};
    }
    function activation(entry, scan, force) {
        if(!String(entry.content||'').trim())return {read:false,reason:'内容为空'};
        if(force)return {read:true,reason:'强制读取'};
        if(!entry.enabled)return {read:false,reason:'条目禁用'};
        if(entry.mode==='constant')return {read:true,reason:'蓝灯常驻'};
        if(entry.mode!=='selective')return {read:false,reason:'不支持的激活方式，需显式强制读取'};
        const list=v=>Array.isArray(v)?v:typeof v==='string'?v.split(',').map(x=>x.trim()).filter(Boolean):[];
        const match=k=>{
            if(k instanceof RegExp){k.lastIndex=0;return k.test(scan);}
            if(plain(k)){try{return new RegExp(k.pattern||k.source||k.regex,k.flags||'').test(scan);}catch(_){return false;}}
            return !!String(k||'')&&scan.includes(String(k));
        };
        if(!list(entry.keys).some(match))return {read:false,reason:'绿灯未命中关键词'};
        const second=entry.secondary||{},keys=list(second.keys||second),hits=keys.map(match);
        const ok=!keys.length||(second.logic==='and_all'?hits.every(Boolean):second.logic==='not_all'?!hits.every(Boolean):second.logic==='not_any'?!hits.some(Boolean):hits.some(Boolean));
        return {read:ok,reason:ok?'绿灯已命中':'绿灯次要条件未满足'};
    }
    function omitKeys(value,keys=[]) {
        if(!plain(value))return copy(value);
        const out=copy(value);
        for(const key of keys)delete out[key];
        return out;
    }
    function projectAbilityMap(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item))continue;
            out[name]=omitKeys(item,['原始属性','最终属性','强化','真属性']);
        }
        return out;
    }
    function projectEquipped(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item)||Number(item.状态)!==1)continue;
            out[name]=omitKeys(item,['原始属性','最终属性','强化','真属性']);
        }
        return out;
    }
    function projectCarriedItems(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item)||Number(item.状态)===2)continue;
            out[name]=omitKeys(item,['原始属性','最终属性','强化','真属性']);
        }
        return out;
    }
    function projectForms(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item))continue;
            out[name]=omitKeys(item,['原始属性','最终属性','强化','真属性']);
        }
        return out;
    }
    function projectAuditComponentMap(value,{equipment=false}={}) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item))continue;
            if(equipment&&Number(item.状态)===2)continue;
            const clean=omitKeys(item,['最终属性','强化','真属性']);
            if(plain(clean.技能)){
                clean.技能=Object.fromEntries(Object.entries(clean.技能).filter(([,skill])=>plain(skill)).map(([skillName,skill])=>[skillName,omitKeys(skill,['最终属性','强化','真属性'])]));
            }
            out[name]=clean;
        }
        return out;
    }
    function projectCharacterForAudit(value) {
        const source=plain(value)?value:{},out={};
        for(const key of ['在场','种族','身份','职业','层级','HP_MAX','HP','THP','EP_MAX','EP','性格','喜爱','外貌','着装','是否队友','好感度','态度','背景故事']){
            if(Object.hasOwn(source,key))out[key]=copy(source[key]);
        }
        const 状态=projectAuditComponentMap(source.状态),血统=projectAuditComponentMap(source.血统),技能=projectAuditComponentMap(source.技能);
        const 装备=projectAuditComponentMap(source.装备,{equipment:true}),形态库=projectAuditComponentMap(source.形态库);
        if(Object.keys(状态).length)out.状态=状态;
        if(Object.keys(血统).length)out.血统=血统;
        if(Object.keys(技能).length)out.技能=技能;
        if(Object.keys(装备).length)out.装备=装备;
        if(Object.keys(形态库).length)out.形态库=形态库;
        if(plain(source.当前形态))out.当前形态=copy(source.当前形态);
        return out;
    }
    function sameWorldTimeAnchor(a,b) {
        const x=String(a||'').trim(),y=String(b||'').trim();if(!x||!y)return false;
        if(x===y)return true;
        const shorter=x.length<=y.length?x:y,longer=x.length<=y.length?y:x;
        return shorter.length>=8&&longer.includes(shorter);
    }
    function npcBuildText(value) {
        try{return JSON.stringify(value||{});}catch(_){return String(value||'');}
    }
    function npcBuildAssessment(stat,name,npc) {
        if(!plain(npc)||Number(npc.HP)<=0)return null;
        const rank=Math.max(0,RELATION_RANKS.indexOf(String(npc.层级||'Ⅰ')));
        const profileText=[...(Array.isArray(npc.身份)?npc.身份:[]),...Object.keys(npc.职业||{}),npc.背景故事,npc.态度].filter(Boolean).join(' ');
        const bossHint=/(?:boss|首领|领主|头目|魔王|王者|宗主|掌门|教皇|最终敌人|最终对手)/i.test(profileText);
        const level=(bossHint||rank>=5)?'首领/Boss级':rank>=2?'精英级':'杂兵级';
        const minimum=level==='首领/Boss级'?{血统:1,装备:3,技能:2}:level==='精英级'?{血统:1,装备:2,技能:1}:{血统:1,装备:1,技能:0};
        const counts={血统:Object.keys(npc.血统||{}).length,装备:Object.values(npc.装备||{}).filter(item=>plain(item)&&Number(item.状态)!==2).length,技能:Object.keys(npc.技能||{}).length,状态:Object.keys(npc.状态||{}).length,形态:Object.keys(npc.形态库||{}).length};
        const gaps=[],suggest=new Set();
        for(const field of ['种族','身份','职业','外貌','着装','性格','喜爱','背景故事','态度']){
            const value=npc[field],missing=Array.isArray(value)?!value.length:plain(value)?!Object.keys(value).length:!String(value||'').trim();
            if(missing){gaps.push('资料缺失/'+field);suggest.add(field);}
        }
        for(const field of ['血统','装备','技能']){
            if(counts[field]<minimum[field]){gaps.push(field+'不足 '+counts[field]+'/'+minimum[field]);suggest.add(field);}
        }
        const combatText=npcBuildText({职业:npc.职业,血统:npc.血统,装备:npc.装备,技能:npc.技能,状态:npc.状态,形态库:npc.形态库});
        if(level!=='杂兵级'){
            const offense=/(?:伤害|攻击|斩|刺|射击|爆破|火力|ATK|MATK|杀伤|输出|毒|灼烧|雷击|炮击)/i.test(combatText);
            const survival=/(?:防御|护盾|减伤|恢复|治疗|格挡|护甲|屏障|再生|吸收|DEF|MDEF|生存)/i.test(combatText);
            const control=/(?:控制|位移|突进|冲刺|束缚|眩晕|减速|沉默|击退|牵引|冻结|召唤|机动|封锁|禁锢)/i.test(combatText);
            if(!offense){gaps.push('缺主要杀伤手段');suggest.add('技能');suggest.add('装备');}
            if(!survival){gaps.push('缺防御/生存手段');suggest.add('技能');suggest.add('装备');suggest.add('状态');}
            if(!control){gaps.push('缺机动/控制手段');suggest.add('技能');suggest.add('形态库');}
        }
        if(level==='首领/Boss级'){
            const stage=counts.形态>0||/(?:阶段|二阶段|变身|形态|解放|觉醒|狂暴|转阶段|状态切换)/i.test(combatText);
            if(!stage){gaps.push('缺Boss阶段/形态/状态变化机制');suggest.add('形态库');suggest.add('状态');suggest.add('技能');}
        }
        return {名称:name,审计级别:level,层级:String(npc.层级||'Ⅰ'),当前组件:counts,缺口:gaps,建议字段:Array.from(suggest),当前构筑:projectCharacterForAudit(npc)};
    }
    function npcBuildAudit(stat,limit=NPC_BUILD_AUDIT_LIMIT) {
        const relations=stat?.关系列表||{},backend=stat?.世界?.[PATH]||{},people=backend.人物||{},events=backend.事件||{},roster=(stat?.设置||{}).单一世界?{}:(stat?.世界?.异端雷达?.名单||{});
        const currentLocation=String(stat?.世界?.地点||''),worldTime=String(stat?.世界?.时间||'');
        const activeEventNames=new Set(Object.entries(events).filter(([,e])=>e&&['待发生','进行中'].includes(e.状态)&&['当前事件','近期节点'].includes(e.分类)).map(([eventName])=>eventName));
        const currentParticipants=new Set();
        for(const [eventName,event] of Object.entries(events)){
            if(!activeEventNames.has(eventName))continue;
            for(const p of event?.参与者||[])currentParticipants.add(nameKey(p));
        }
        const rows=[];
        for(const [name,npc] of Object.entries(relations)){
            const assessment=npcBuildAssessment(stat,name,npc);if(!assessment||!assessment.缺口.length)continue;
            const backendName=stableNameIn(people,name),person=backendName?people[backendName]:null;
            const alienName=stableNameIn(roster,name),alien=alienName?roster[alienName]:null;
            const activeAlien=!!(alien&&alien.状态!=='死亡');
            const linked=!!(person&&(person.关联事件||[]).some(eventName=>activeEventNames.has(eventName)))||currentParticipants.has(nameKey(name));
            const here=!!npc.在场||!!(person&&currentLocation&&String(person.地点||'')&&(String(person.地点).includes(currentLocation)||currentLocation.includes(String(person.地点))));
            const updated=!!(person&&sameWorldTimeAnchor(person.更新时间,worldTime));
            if(!activeAlien&&!linked&&!here&&!updated)continue;
            const reasons=[];
            if(activeAlien)reasons.push('活跃异端');
            if(linked)reasons.push('当前/近期事件参与者');
            if(here)reasons.push(npc.在场?'当前在场':'当前地点相关');
            if(updated)reasons.push('本轮人物动态已更新');
            const levelWeight=assessment.审计级别==='首领/Boss级'?40:assessment.审计级别==='精英级'?20:0;
            const priority=(activeAlien?80:0)+(linked?60:0)+(here?40:0)+(updated?20:0)+levelWeight+assessment.缺口.length;
            rows.push({...assessment,触发依据:reasons,__priority:priority});
        }
        return rows.sort((a,b)=>b.__priority-a.__priority||a.名称.localeCompare(b.名称,'zh-CN')).slice(0,Math.max(0,Number(limit)||0)).map(item=>{const out={...item};delete out.__priority;return out;});
    }
    function ensureNpcBuildAuditProgress(next,required=[],acceptedResult) {
        if(!(required||[]).length)return;
        const proposals=acceptedResult?.关系||[],failed=[];
        for(const before of required){
            const target=stableNameIn(next?.关系列表||{},before.名称);
            if(!target)continue;
            const after=npcBuildAssessment(next,target,next.关系列表[target]);
            if(!after)continue;
            const proposal=proposals.find(item=>nameKey(item.名称)===nameKey(before.名称));
            const touched=proposal&&before.建议字段.some(field=>Object.hasOwn(proposal,field));
            if(!touched||after.缺口.length>=before.缺口.length)failed.push(before.名称);
        }
        if(failed.length)throw new Error('NPC构筑审计未推进：'+failed.join('、')+'；每个列出的审计对象本轮至少补齐一个真实缺口，禁止只改好感、HP或无关字段');
    }

    function projectCharacterForWorld(value) {
        const source=plain(value)?value:{},out={};
        for(const key of ['在场','种族','身份','职业','层级','HP_MAX','HP','THP','EP_MAX','EP','性格','喜爱','外貌','着装','是否队友','好感度','态度','背景故事','数量']){
            if(Object.hasOwn(source,key))out[key]=copy(source[key]);
        }
        const 状态=projectAbilityMap(source.状态),血统=projectAbilityMap(source.血统),技能=projectAbilityMap(source.技能);
        const 装备=projectEquipped(source.装备),道具=projectCarriedItems(source.道具),形态库=projectForms(source.形态库);
        if(Object.keys(状态).length)out.状态=状态;
        if(Object.keys(血统).length)out.血统=血统;
        if(Object.keys(技能).length)out.技能=技能;
        if(Object.keys(装备).length)out.装备=装备;
        if(Object.keys(道具).length)out.道具=道具;
        if(Object.keys(形态库).length)out.形态库=形态库;
        if(plain(source.当前形态))out.当前形态=copy(source.当前形态);
        return out;
    }
    function projectAssetsForWorld(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,asset] of Object.entries(value)){
            if(!plain(asset))continue;
            const item=copy(asset);
            if(plain(item.建设序列)){
                for(const seq of Object.values(item.建设序列||{})){
                    if(!plain(seq))continue;
                    delete seq.下次产出日期;
                    delete seq.下次产出游天;
                }
            }
            out[name]=item;
        }
        return out;
    }
    function tailRecord(value,limit) {
        if(!plain(value))return {};
        return Object.fromEntries(Object.entries(value).slice(-Math.max(0,Number(limit)||0)).map(([key,item])=>[key,copy(item)]));
    }
    function projectCausalOrbitForWorld(value,currentStability) {
        const orbit=plain(value)?value:{},entries=Object.entries(orbit.偏移记录||{});
        const recent=entries.slice(-HOT_OFFSET_TARGET);
        const total=entries.reduce((sum,[,item])=>sum+(Number(item?.影响程度)||0),0);
        return {
            当前阶段:orbit.当前阶段,
            故事线:orbit.故事线,
            下一节点:orbit.下一节点,
            偏移记录:Object.fromEntries(recent.map(([name,item])=>[name,copy(item)])),
            偏移摘要:{
                记录总数:entries.length,
                隐藏旧记录数:Math.max(0,entries.length-recent.length),
                累计影响:total,
                当前稳定:currentStability
            }
        };
    }
    function projectWorldContext(stat) {
        const src=plain(stat)?stat:{},world=plain(src.世界)?src.世界:{},backend=plain(world[PATH])?world[PATH]:{};
        const projectedBackend={
            版本:backend.版本,
            已处理时间:backend.已处理时间,
            事件:copy(backend.事件||{}),
            人物:projectHotWorldPeople(src),
            势力地区:copy(backend.势力地区||{}),
            历史:tailRecord(backend.历史,HOT_HISTORY_TARGET),
            传播:tailRecord(backend.传播,HOT_PROPAGATION_TARGET)
        };
        // 早期世界引擎曾误加地区“资源点”。保留旧存档兼容，但不再发送给模型；资产只读取现有顶层资产账簿。
        for(const area of Object.values(projectedBackend.势力地区||{}))if(plain(area))delete area.资源点;
        const out={
            世界:{
                时间:world.时间,
                地点:world.地点,
                名称:world.名称,
                位格:world.位格,
                难度:world.难度,
                稳定:world.稳定,
                法则:copy(world.法则||[]),
                货币:copy(world.货币||{}),
                历法:copy(world.历法||{}),
                探索:copy(world.探索||{}),
                势力:copy(world.势力||{}),
                因果轨道:projectCausalOrbitForWorld(world.因果轨道,world.稳定),
                异端雷达:copy(world.异端雷达||{}),
                [PATH]:projectedBackend
            },
            角色:projectCharacterForWorld(src.角色),
            关系列表:{},
            资产:projectAssetsForWorld(src.资产),
            资产删除保护:Object.keys(backend.资产墓碑||{}).filter(name=>!stableNameIn(src.资产||{},name)).slice(-50),
            传闻:copy(src.传闻||{}),
            系统状态:{
                是否战斗中:!!src.系统状态?.是否战斗中,
                是否在主神空间:!!src.系统状态?.是否在主神空间
            },
            世界模式:{
                单一世界:!!src.设置?.单一世界,
                世界超稳:!!src.设置?.世界超稳
            }
        };
        for(const [name,person] of Object.entries(src.关系列表||{}))out.关系列表[name]=projectCharacterForWorld(person);
        if(!Object.keys(out.角色||{}).length)delete out.角色;
        if(!Object.keys(out.关系列表).length)delete out.关系列表;
        if(!Object.keys(out.资产).length)delete out.资产;
        if(!out.资产删除保护.length)delete out.资产删除保护;
        if(!Object.keys(out.传闻).length)delete out.传闻;
        return out;
    }
    function protocol() {
        const schemaText=JSON.stringify(WORLD_RESULT_SCHEMA,null,2);
        return `只输出一个 WorldResult JSON 对象；不要输出 Markdown、解释、思考过程、<thinking> 或 JSON Pointer。
省略业务字段表示无变化；已有实体只写本轮变化字段，新增实体写足以建立该实体的确定事实；实体用“名称”关联。
“操作”默认“更新”；“移除”只用于 Schema 允许删除的记录；“撤销本轮”只用于纠错重试。
字段语义遵循【世界引擎核心约束】；字段结构和值域只以以下 Schema 为准。WorldResult 之外的任务、世界时间、玩家属性/货币/击杀等不要输出。
关系只更新已存在的关系列表对象；不得为玩家建立后台人物记录。

【Canonical WorldResult JSON Schema】
${schemaText}`;
    }
    const NPC_BUILD_AUDIT_RULES=`【角色管理 · NPC构筑审计】
只处理“角色管理.NPC构筑审计”列出的既有 NPC；目标是补真实缺口，不是提难度或重做角色。
1. 不改人物层级、HP_MAX/EP_MAX；不覆盖已完整组件，不用改名制造重复能力。
2. 最低构筑：杂兵=血统1/装备1/技能可0；精英=血统1/装备2/技能1；Boss=血统1/装备3/技能2；上限为血统2/装备6/技能4。精英需有杀伤、生存、机动/控制，Boss另有阶段或形态机制。
3. 能力只归一个主要组件：血统=本体条件，装备=实体，技能=执行方式，状态=当前结果，形态=独立战斗模式。
4. 只用 WorldResult.关系 更新既有 NPC；只提交新增/修正项。不得输出真属性、最终属性或强化缓存；血统/形态五维必须齐全，技能不写基础/衍生属性。
5. 效果必须可结算，不写随机概率词条；每个审计对象至少修复一个与现有身份、职业、层级和已演出能力一致的缺口，资料不足时做最小补全。`;    class SamsaraWorldEngine {
        constructor(host, env) {
            this.host = host; this.env = env || host; this.unsub = []; this.generation = 0;
            this.busy = false; this.committing = false; this.disposed = false; this.tab = '总览'; this.status = '待命';
            this.lastRequest=null; this.previewRequest=null; this.lastReply=''; this.lastFailure='';
            this.lastRetryLog=[]; this.lastAttemptCount=0; this.lastAttemptTelemetry=[]; this.lastTransportInfo=null; this.lastWorldResult=null; this.lastCompiledPatches=[]; this.lastCompileWarnings=[];
            this.config = {
                enabled:false,
                preset:DEFAULT_PRESET,
                corePrompt:CORE_WORLD_RULES,
                macroPrompt:DEFAULT_MACRO_PROMPT,
                stabilityPromptTemplate:DEFAULT_STABILITY_PROMPT_TEMPLATE,
                retryAttempts:5,
                requireMacroBackbone:true,
                presetEditorVersion:0,
                promptDocuments:[],
                fontScale:'standard',
                // 仅控制是否把压缩后的长期历史发送给正文AI；世界推进自身始终读取。
                sendHistoryToProse:false,
                dedicatedApi:{enabled:false,apiUrl:'',apiKey:'',model:'',apiPresets:[],fetchedModels:[]}
            };
            try { Object.assign(this.config, JSON.parse(host.localStorage.getItem(CONFIG) || '{}')); } catch (_) {}
            const hadLegacyTone=Object.hasOwn(this.config,'tone');
            delete this.config.tone;
            if(Number(this.config.presetEditorVersion||0)<2)this.config.preset=ensurePresetStructure(this.config.preset);
            else this.config.preset=normalizeEditablePreset(this.config.preset);
            this.config.presetEditorVersion=2;
            if(typeof this.config.corePrompt!=='string')this.config.corePrompt=CORE_WORLD_RULES;
            if(typeof this.config.macroPrompt!=='string')this.config.macroPrompt=DEFAULT_MACRO_PROMPT;
            if(typeof this.config.stabilityPromptTemplate!=='string')this.config.stabilityPromptTemplate=DEFAULT_STABILITY_PROMPT_TEMPLATE;
            if(!Array.isArray(this.config.promptDocuments))this.config.promptDocuments=[];
            this.config.promptDocuments=this.config.promptDocuments
                .filter(doc=>plain(doc)&&typeof doc.name==='string'&&plain(doc.settings)&&typeof doc.settings.preset==='string'&&doc.id!==BUILTIN_DEFAULT_PROMPT_DOCUMENT.id&&doc.name!==BUILTIN_DEFAULT_PROMPT_DOCUMENT.name)
                .slice(0,58);
            // 旧版“保存为默认设置”曾直接覆盖内置默认。v3 起把这份本地内容迁移为独立个人文档，
            // 内置“默认设置”始终绑定代码中的最新 DEFAULT_PRESET，不再被 localStorage 遮蔽。
            if(plain(this.config.userDefaultPromptSettings)&&typeof this.config.userDefaultPromptSettings.preset==='string'){
                const legacySettings={
                    corePrompt:typeof this.config.userDefaultPromptSettings.corePrompt==='string'?this.config.userDefaultPromptSettings.corePrompt:CORE_WORLD_RULES,
                    macroPrompt:typeof this.config.userDefaultPromptSettings.macroPrompt==='string'?this.config.userDefaultPromptSettings.macroPrompt:DEFAULT_MACRO_PROMPT,
                    stabilityPromptTemplate:typeof this.config.userDefaultPromptSettings.stabilityPromptTemplate==='string'?this.config.userDefaultPromptSettings.stabilityPromptTemplate:DEFAULT_STABILITY_PROMPT_TEMPLATE,
                    npcAuditPrompt:typeof this.config.userDefaultPromptSettings.npcAuditPrompt==='string'?this.config.userDefaultPromptSettings.npcAuditPrompt:undefined,
                    structurePrompt:typeof this.config.userDefaultPromptSettings.structurePrompt==='string'?this.config.userDefaultPromptSettings.structurePrompt:undefined,
                    preset:normalizeEditablePreset(this.config.userDefaultPromptSettings.preset),
                    contextTurns:Math.max(1,Math.min(100,Number(this.config.userDefaultPromptSettings.contextTurns)||3)),
                    activationMode:this.config.userDefaultPromptSettings.activationMode==='force_selected'?'force_selected':'respect_activation',
                    selectedEntries:Array.isArray(this.config.userDefaultPromptSettings.selectedEntries)?copy(this.config.userDefaultPromptSettings.selectedEntries):null
                };
                const personal=this.config.promptDocuments.find(doc=>doc.id===USER_DEFAULT_PROMPT_DOCUMENT_ID);
                if(!personal)this.config.promptDocuments.unshift({id:USER_DEFAULT_PROMPT_DOCUMENT_ID,type:'samsara-world-prompt-document',version:1,builtin:false,name:'个人默认设置',createdAt:'',updatedAt:'',settings:copy(legacySettings)});
            }
            this.config.promptDocuments=this.config.promptDocuments.filter(doc=>doc.id!==BUILTIN_DEFAULT_PROMPT_DOCUMENT.id).slice(0,59);
            this.config.promptDocuments.unshift(copy(BUILTIN_DEFAULT_PROMPT_DOCUMENT));
            {
                const appliedVersion=Number(this.config.builtinDefaultPromptVersionApplied||0);
                if(appliedVersion<BUILTIN_DEFAULT_PROMPT_VERSION){
                    // 首次安装自动应用；已在使用内置默认的用户随版本升级。
                    // 自定义文档/个人默认不会被强制覆盖，但内置默认文档本身始终升级到最新代码模板。
                    const shouldApply=appliedVersion===0||this.config.activePromptDocumentId===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id;
                    if(shouldApply){
                        const settings=BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings;
                        this.config.corePrompt=settings.corePrompt??CORE_WORLD_RULES;
                        this.config.macroPrompt=settings.macroPrompt??DEFAULT_MACRO_PROMPT;
                        this.config.stabilityPromptTemplate=settings.stabilityPromptTemplate??DEFAULT_STABILITY_PROMPT_TEMPLATE;
                        this.config.corePrompt=settings.corePrompt===undefined?CORE_WORLD_RULES:settings.corePrompt;
            this.config.macroPrompt=settings.macroPrompt===undefined?DEFAULT_MACRO_PROMPT:settings.macroPrompt;
            this.config.stabilityPromptTemplate=settings.stabilityPromptTemplate===undefined?DEFAULT_STABILITY_PROMPT_TEMPLATE:settings.stabilityPromptTemplate;
            this.config.npcAuditPrompt=settings.npcAuditPrompt===undefined?NPC_BUILD_AUDIT_RULES:settings.npcAuditPrompt;
            this.config.structurePrompt=settings.structurePrompt===undefined?protocol().split('【Canonical WorldResult JSON Schema】')[0].trim():settings.structurePrompt;
                        this.config.preset=normalizeEditablePreset(settings.preset);
                        this.config.presetEditorVersion=2;
                        this.config.contextTurns=settings.contextTurns;
                        this.config.activationMode=settings.activationMode;
                        this.config.selectedEntries=copy(settings.selectedEntries);
                        this.config.activePromptDocumentId=BUILTIN_DEFAULT_PROMPT_DOCUMENT.id;
                        this.config.builtinDefaultWorldbookExclusionsApplied=[];
                    }
                    this.config.builtinDefaultPromptVersionApplied=BUILTIN_DEFAULT_PROMPT_VERSION;
                    this.saveConfig();
                }
            }
            {
                const retryLimit=Number(this.config.retryAttempts);
                this.config.retryAttempts=Math.max(1,Math.min(5,Number.isFinite(retryLimit)?retryLimit:5));
                if(!this.config.retryDefaultFiveMigrated){
                    if(this.config.retryAttempts===3)this.config.retryAttempts=5;
                    this.config.retryDefaultFiveMigrated=true;
                    this.saveConfig();
                }
            }
            if(!Object.hasOwn(this.config,'requireMacroBackbone'))this.config.requireMacroBackbone=true;
            if(!['standard','large','xlarge'].includes(this.config.fontScale))this.config.fontScale='standard';
            this.config.sendHistoryToProse=this.config.sendHistoryToProse===true;
            this.config.dedicatedApi=this.normalizeDedicatedApi(this.config.dedicatedApi);
            this.apiModeCache={};
            if(hadLegacyTone)this.saveConfig();
            if(this.config.enabled&&!this.usesDedicatedApi()){
                const terminal=this.host.Samsara&&this.host.Samsara.terminal;
                if(terminal&&typeof terminal.enableApi==='function')terminal.enableApi();
            }
        }
        fn(name) {
            for (const obj of [this.env, this.host, this.host.TavernHelper]) if (obj && typeof obj[name] === 'function') return obj[name].bind(obj);
            return null;
        }
        notifyFailure(message) {
            const raw=String(message||'世界推进失败').trim();
            if(!raw||/^(?:请求已取消|上下文已经切换|已切换上下文)/.test(raw))return false;
            const shown=raw.length>900?raw.slice(0,897)+'…':raw;
            const toast=(this.host&&this.host.toastr)||(this.env&&this.env.toastr)||(this.host&&this.host.parent&&this.host.parent.toastr);
            if(toast&&typeof toast.error==='function'){
                try{toast.error(shown,'世界推进失败');return true;}catch(_){}
            }
            try{console.error('[世界推进] '+shown);}catch(_){}
            return false;
        }
        snapshot() {
            const mvu = this.env.Mvu || this.host.Mvu;
            const getMessages = this.fn('getChatMessages');
            if (!mvu || !getMessages) throw new Error('等待 MVU 与酒馆消息接口');
            const message = getMessages(-1)[0];
            if (!message) throw new Error('当前没有消息');
            const id = message.message_id != null ? message.message_id : message.id;
            if (!Number.isInteger(Number(id))) throw new Error('当前楼层编号无效');
            const raw = mvu.getMvuData({type:'message',message_id:Number(id)});
            if (!raw || !raw.stat_data || !raw.stat_data.世界) throw new Error('当前楼层尚未初始化 MVU');
            const context = this.host.SillyTavern && this.host.SillyTavern.getContext ? this.host.SillyTavern.getContext() : {};
            const chatFn = this.fn('getCurrentChatId');
            const chat = chatFn ? chatFn() : context.chatId;
            if (chat == null) throw new Error('无法确认当前聊天标识');
            const text = String(message.message != null ? message.message : message.mes || '');
            const fingerprint = JSON.stringify([String(chat),Number(id),message.swipe_id || 0,digest(text)]);
            return {mvu,raw:copy(raw),stat:copy(raw.stat_data),id:Number(id),text,fingerprint,message};
        }
        blocked(snapshot) {
            const s = snapshot.stat;
            if ((s.系统状态 || {}).是否在主神空间 || s.世界.名称 === '主神空间') return '当前位于主神空间，副本推进暂停';
            if (!s.世界.名称 || s.世界.名称 === '待初始化') return '等待副本初始化';
            if (/轮回清算协议/.test(snapshot.text)) return '结算楼层由结算美化程序处理';
            if (snapshot.message.is_user || snapshot.message.role === 'user') return '等待正文完成';
            return '';
        }
        saveConfig() {
            try{this.host.localStorage?.setItem?.(CONFIG,JSON.stringify(this.config));}catch(_){}
        }
        normalizeDedicatedApi(value) {
            const api=plain(value)?value:{};
            return {
                enabled:api.enabled===true,
                apiUrl:String(api.apiUrl||'').trim(),
                apiKey:String(api.apiKey||''),
                model:String(api.model||'').trim(),
                apiPresets:Array.isArray(api.apiPresets)?api.apiPresets.filter(plain).map(p=>({
                    name:String(p.name||'').trim().slice(0,80),
                    apiUrl:String(p.apiUrl||'').trim(),
                    apiKey:String(p.apiKey||''),
                    model:String(p.model||'').trim()
                })).filter(p=>p.name).slice(0,30):[],
                fetchedModels:Array.isArray(api.fetchedModels)?api.fetchedModels.map(String).filter(Boolean).slice(0,500):[]
            };
        }
        usesDedicatedApi() { return this.config.dedicatedApi?.enabled===true; }
        dedicatedApiReady() {
            const api=this.config.dedicatedApi||{};
            return api.enabled===true&&!!String(api.apiUrl||'').trim()&&!!String(api.model||'').trim();
        }
        apiSourceLabel() { return this.usesDedicatedApi()?'世界推进专属 API':'主神终端额外模型'; }
        setDedicatedApi(patch) {
            const current=this.normalizeDedicatedApi(this.config.dedicatedApi);
            const next=this.normalizeDedicatedApi(Object.assign({},current,plain(patch)?patch:{}));
            if(patch&&Object.hasOwn(patch,'apiUrl')&&String(patch.apiUrl||'').trim()!==current.apiUrl)next.fetchedModels=[];
            this.config.dedicatedApi=next;
            this.saveConfig();
            return next;
        }
        saveDedicatedApiPreset(name) {
            const clean=String(name||'').trim().slice(0,80);
            if(!clean)throw new Error('请输入 API 预设名称');
            const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
            const entry={name:clean,apiUrl:api.apiUrl,apiKey:api.apiKey,model:api.model};
            const idx=api.apiPresets.findIndex(p=>p.name===clean);
            if(idx>=0)api.apiPresets[idx]=entry;else api.apiPresets.unshift(entry);
            api.apiPresets=api.apiPresets.slice(0,30);
            this.config.dedicatedApi=api;this.saveConfig();return entry;
        }
        deleteDedicatedApiPreset(name) {
            const clean=String(name||'').trim(),api=this.normalizeDedicatedApi(this.config.dedicatedApi);
            const before=api.apiPresets.length;api.apiPresets=api.apiPresets.filter(p=>p.name!==clean);
            this.config.dedicatedApi=api;this.saveConfig();return before!==api.apiPresets.length;
        }
        applyDedicatedApiPreset(name) {
            const api=this.normalizeDedicatedApi(this.config.dedicatedApi),preset=api.apiPresets.find(p=>p.name===String(name||''));
            if(!preset)throw new Error('API 预设不存在');
            api.apiUrl=preset.apiUrl;api.apiKey=preset.apiKey;api.model=preset.model;api.fetchedModels=[];
            this.config.dedicatedApi=api;this.saveConfig();return api;
        }
        dedicatedEndpoint(kind='chat') {
            const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
            let endpoint=String(api.apiUrl||'').trim().replace(/\/+$/,'');
            if(!endpoint)throw new Error('请先填写专属 API 地址');
            if(kind==='models'){
                if(/\/chat\/completions$/i.test(endpoint))endpoint=endpoint.replace(/\/chat\/completions$/i,'/models');
                else if(/\/v1$/i.test(endpoint))endpoint+='/models';
                else if(/\/v1\//i.test(endpoint))endpoint=endpoint.replace(/\/v1\/.*$/i,'/v1/models');
                else endpoint+=/\/v\d+$/i.test(endpoint)?'/models':'/v1/models';
                return endpoint;
            }
            if(/\/chat\/completions$/i.test(endpoint))return endpoint;
            if(/\/v1$/i.test(endpoint))return endpoint+'/chat/completions';
            if(/\/v1\//i.test(endpoint))return endpoint.replace(/\/v1\/.*$/i,'/v1/chat/completions');
            return endpoint+(/\/v\d+$/i.test(endpoint)?'/chat/completions':'/v1/chat/completions');
        }
        async fetchDedicatedModels() {
            const api=this.normalizeDedicatedApi(this.config.dedicatedApi),fetcher=this.host.fetch||(typeof fetch!=='undefined'?fetch:null);
            if(!fetcher)throw new Error('当前环境没有 fetch');
            const headers={};if(api.apiKey.trim())headers.Authorization='Bearer '+api.apiKey.trim();
            const response=await fetcher(this.dedicatedEndpoint('models'),{headers});
            if(!response.ok){
                let body='';try{body=await response.text();}catch(_){}
                throw new Error('加载模型失败：HTTP '+response.status+(body?' / '+body.slice(0,240):''));
            }
            const body=await response.json();
            const raw=Array.isArray(body?.data)?body.data:Array.isArray(body?.models)?body.models:[];
            const models=raw.map(item=>typeof item==='string'?item:item?.id||item?.name).filter(Boolean).map(String);
            if(!models.length)throw new Error('API 返回的模型列表为空');
            api.fetchedModels=Array.from(new Set(models)).sort().slice(0,500);
            if(api.model&&!api.fetchedModels.includes(api.model))api.fetchedModels.unshift(api.model);
            this.config.dedicatedApi=api;this.saveConfig();return api.fetchedModels;
        }
        structuredUnsupported(status,body) {
            const code=Number(status),text=String(body||'');
            return [400,404,415,422].includes(code)&&/response[_ -]?format|json[_ -]?schema|json[_ -]?object|unknown (?:field|parameter)|unrecognized|unsupported|not supported|invalid.*schema|INVALID_ARGUMENT|invalid[_ -]?argument/i.test(text);
        }
        async requestDedicatedApi(system,input,options={}) {
            const api=this.normalizeDedicatedApi(this.config.dedicatedApi),fetcher=this.host.fetch||(typeof fetch!=='undefined'?fetch:null);
            if(!this.dedicatedApiReady())throw new Error('世界推进专属 API 已启用，但地址或模型未配置完整');
            if(!fetcher)throw new Error('当前环境没有 fetch');
            const endpoint=this.dedicatedEndpoint('chat'),headers={'Content-Type':'application/json'};
            if(api.apiKey.trim())headers.Authorization='Bearer '+api.apiKey.trim();
            const cacheKey=endpoint+'|'+api.model,wants=options.structured==='auto'&&plain(options.schema);
            const cached=wants?this.apiModeCache[cacheKey]:'';
            const modes=!wants?['plain']:cached==='json_schema'?['json_schema','json_object','plain']:cached==='json_object'?['json_object','plain']:cached==='plain'?['plain']:['json_schema','json_object','plain'];
            let lastError='';const modeAttempts=[];
            for(const mode of modes){
                modeAttempts.push(mode);
                const body={
                    model:api.model,
                    messages:[{role:'system',content:String(system||'')},{role:'user',content:String(input||'')}],
                    stream:false,
                    temperature:Number.isFinite(Number(options.temperature))?Number(options.temperature):0.3
                };
                if(mode==='json_schema')body.response_format={type:'json_schema',json_schema:{name:String(options.schemaName||'samsara_world_result').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),strict:false,schema:options.schema}};
                else if(mode==='json_object')body.response_format={type:'json_object'};
                const response=await fetcher(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:options.signal});
                if(!response.ok){
                    let err='';try{err=await response.text();}catch(_){}
                    lastError='HTTP '+response.status+': '+response.statusText+(err?' / '+err.slice(0,300):'');
                    if(mode!=='plain'&&this.structuredUnsupported(response.status,err)){delete this.apiModeCache[cacheKey];continue;}
                    this.lastTransportInfo={接口:'世界推进专属 API',模型:api.model,结构化模式:mode,尝试模式:copy(modeAttempts),usage:null};
                    throw new Error(lastError);
                }
                const data=await response.json(),message=data?.choices?.[0]?.message;
                const raw=message?.content;
                const content=typeof raw==='string'?raw:(plain(raw)?JSON.stringify(raw):message?.parsed?JSON.stringify(message.parsed):'');
                if(!content)throw new Error('专属 API 返回内容为空');
                if(wants)this.apiModeCache[cacheKey]=mode;
                this.lastTransportInfo={接口:'世界推进专属 API',模型:api.model,结构化模式:mode,尝试模式:copy(modeAttempts),usage:normalizeTokenUsage(data?.usage)};
                return content;
            }
            throw new Error(lastError||'专属 API 不支持当前结构化输出模式');
        }
        async requestAI(system,input,options={}) {
            if(this.usesDedicatedApi()){
                const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
                this.lastTransportInfo={接口:'世界推进专属 API',模型:api.model,结构化模式:'请求中',尝试模式:[],usage:null};
                return this.requestDedicatedApi(system,input,options);
            }
            const terminal=this.host.Samsara&&this.host.Samsara.terminal;
            if(!terminal||typeof terminal.request!=='function'||!terminal.apiReady?.())throw new Error('请在主神终端设置中启用额外模型并选择模型');
            this.lastTransportInfo={接口:'主神终端额外模型',模型:'',结构化模式:options.structured==='auto'?'auto（由主神终端协商）':'plain',尝试模式:[],usage:null};
            return terminal.request(system,input,options);
        }
        setPreset(text) {
            if (typeof text !== 'string' || text.length > 30000) throw new Error('预设限30000字');
            this.config.preset = normalizeEditablePreset(text);
            this.config.presetEditorVersion=2;
            this.saveConfig();
        }
        readPromptEditor() {
            const panel=this.panel;
            const list=panel&&panel.querySelector('[data-segment-list]');
            const rows=list?Array.from(list.querySelectorAll('[data-segment-row]')):[];
            const preset=list?rows.map(row=>segmentText({
                title:row.querySelector('[data-segment-title]')?.value||'',
                body:row.querySelector('[data-segment]')?.value||''
            })).filter(Boolean).join('\n'):this.config.preset;
            const floors=panel&&panel.querySelector('[data-floors]');
            const activation=panel&&panel.querySelector('[data-activation]');
            const books=panel?Array.from(panel.querySelectorAll('[data-book]')):[];
            return {
                preset,
                corePrompt:panel?.querySelector('[data-core-prompt]')?.value??this.config.corePrompt??CORE_WORLD_RULES,
                macroPrompt:panel?.querySelector('[data-macro-prompt]')?.value??this.config.macroPrompt??DEFAULT_MACRO_PROMPT,
                stabilityPromptTemplate:panel?.querySelector('[data-stability-prompt]')?.value??this.config.stabilityPromptTemplate??DEFAULT_STABILITY_PROMPT_TEMPLATE,
                npcAuditPrompt:panel?.querySelector('[data-npc-audit-prompt]')?.value??this.config.npcAuditPrompt,
                structurePrompt:panel?.querySelector('[data-structure-prompt]')?.value??this.config.structurePrompt??protocol().split('【Canonical WorldResult JSON Schema】')[0].trim(),
                contextTurns:Math.max(1,Math.min(100,Number(floors?.value??this.config.contextTurns)||6)),
                activationMode:activation?.value||this.config.activationMode||'respect_activation',
                selectedEntries:books.length
                    ?books.filter(e=>e.checked&&!e.disabled).map(e=>e.value)
                    :(Array.isArray(this.config.selectedEntries)?copy(this.config.selectedEntries):null)
            };
        }
        applyPromptSettings(settings) {
            if(!plain(settings)||typeof settings.preset!=='string'||settings.preset.length>30000)throw new Error('预设文档内容无效或超过30000字');
            for(const [name,value] of [['核心约束',settings.corePrompt],['宏观骨架提示词',settings.macroPrompt],['世界自救提示词',settings.stabilityPromptTemplate]])if(value!==undefined&&(typeof value!=='string'||value.length>30000))throw new Error(name+'限30000字');
            if(settings.npcAuditPrompt!==undefined&&(typeof settings.npcAuditPrompt!=='string'||settings.npcAuditPrompt.length>30000))throw new Error('NPC审计提示词限30000字');
            if(settings.structurePrompt!==undefined&&(typeof settings.structurePrompt!=='string'||settings.structurePrompt.length>30000))throw new Error('结构提示词限30000字');
            this.config.corePrompt=settings.corePrompt===undefined?CORE_WORLD_RULES:settings.corePrompt;
            this.config.macroPrompt=settings.macroPrompt===undefined?DEFAULT_MACRO_PROMPT:settings.macroPrompt;
            this.config.stabilityPromptTemplate=settings.stabilityPromptTemplate===undefined?DEFAULT_STABILITY_PROMPT_TEMPLATE:settings.stabilityPromptTemplate;
            this.config.npcAuditPrompt=settings.npcAuditPrompt===undefined?NPC_BUILD_AUDIT_RULES:settings.npcAuditPrompt;
            this.config.structurePrompt=settings.structurePrompt===undefined?protocol().split('【Canonical WorldResult JSON Schema】')[0].trim():settings.structurePrompt;
            this.config.preset=normalizeEditablePreset(settings.preset);
            this.config.presetEditorVersion=2;
            this.config.contextTurns=Math.max(1,Math.min(100,Number(settings.contextTurns)||6));
            this.config.activationMode=settings.activationMode==='force_selected'?'force_selected':'respect_activation';
            if(Array.isArray(settings.selectedEntries))this.config.selectedEntries=settings.selectedEntries.filter(x=>typeof x==='string');
            else delete this.config.selectedEntries;
            this.saveConfig();
            return this.config;
        }
        getPromptDocuments() {
            if(!Array.isArray(this.config.promptDocuments))this.config.promptDocuments=[];
            return this.config.promptDocuments;
        }
        savePromptDocument(name,settings,activate=true) {
            const clean=String(name||'').trim().slice(0,80);
            if(!clean)throw new Error('请先填写预设文档名称');
            if(clean===BUILTIN_DEFAULT_PROMPT_DOCUMENT.name)throw new Error('“默认设置”是内置文档，请换一个名称保存自定义版本');
            const docs=this.getPromptDocuments(),now=new Date().toISOString();
            let doc=docs.find(item=>!item.builtin&&item.id===this.config.activePromptDocumentId&&item.name===clean)||docs.find(item=>!item.builtin&&item.name===clean);
            if(doc){
                doc.name=clean;doc.updatedAt=now;doc.settings=copy(settings);
            }else{
                doc={id:'prompt-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:clean,createdAt:now,updatedAt:now,settings:copy(settings)};
                docs.unshift(doc);
            }
            this.config.promptDocuments=docs.slice(0,60);
            if(activate)this.config.activePromptDocumentId=doc.id;
            this.saveConfig();
            return doc;
        }
        deletePromptDocument(id) {
            if(id===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id)return false;
            const before=this.getPromptDocuments().length;
            this.config.promptDocuments=this.getPromptDocuments().filter(doc=>doc.id!==id);
            if(this.config.activePromptDocumentId===id)delete this.config.activePromptDocumentId;
            this.saveConfig();
            return before!==this.config.promptDocuments.length;
        }
        importPromptDocument(raw) {
            let parsed;try{parsed=JSON.parse(String(raw||''));}catch(_){throw new Error('导入文件不是有效 JSON');}
            const settings=plain(parsed.settings)?parsed.settings:parsed;
            if(typeof settings.preset!=='string')throw new Error('导入文件缺少 preset');
            if(settings.preset.length>30000)throw new Error('导入预设超过30000字');
            const name=String(parsed.name||settings.name||'导入预设').trim().slice(0,80)||'导入预设';
            const normalized={
                corePrompt:typeof settings.corePrompt==='string'?settings.corePrompt:CORE_WORLD_RULES,
                macroPrompt:typeof settings.macroPrompt==='string'?settings.macroPrompt:DEFAULT_MACRO_PROMPT,
                stabilityPromptTemplate:typeof settings.stabilityPromptTemplate==='string'?settings.stabilityPromptTemplate:DEFAULT_STABILITY_PROMPT_TEMPLATE,
                npcAuditPrompt:typeof settings.npcAuditPrompt==='string'?settings.npcAuditPrompt:undefined,
                structurePrompt:typeof settings.structurePrompt==='string'?settings.structurePrompt:undefined,
                preset:normalizeEditablePreset(settings.preset),
                contextTurns:Math.max(1,Math.min(100,Number(settings.contextTurns)||6)),
                activationMode:settings.activationMode==='force_selected'?'force_selected':'respect_activation',
                selectedEntries:Array.isArray(settings.selectedEntries)?settings.selectedEntries.filter(x=>typeof x==='string'):null
            };
            return this.savePromptDocument(name,normalized,false);
        }
        exportPromptDocument(id) {
            const doc=this.getPromptDocuments().find(item=>item.id===id);
            if(!doc)throw new Error('预设文档不存在');
            const BlobCtor=this.host.Blob||(typeof Blob!=='undefined'?Blob:null);
            const URLApi=this.host.URL||(typeof URL!=='undefined'?URL:null);
            if(!BlobCtor||!URLApi?.createObjectURL)throw new Error('当前环境不支持文件导出');
            const exportedSettings=Object.assign({corePrompt:CORE_WORLD_RULES,macroPrompt:DEFAULT_MACRO_PROMPT,stabilityPromptTemplate:DEFAULT_STABILITY_PROMPT_TEMPLATE,npcAuditPrompt:NPC_BUILD_AUDIT_RULES,structurePrompt:protocol().split('【Canonical WorldResult JSON Schema】')[0].trim()},copy(doc.settings));
            const payload={type:'samsara-world-prompt-document',version:2,name:doc.name,exportedAt:new Date().toISOString(),settings:exportedSettings};
            const blob=new BlobCtor([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
            const href=URLApi.createObjectURL(blob),a=this.host.document.createElement('a');
            a.href=href;a.download=doc.name.replace(/[\\/:*?"<>|]+/g,'_')+'.world-prompt.json';a.style.display='none';
            this.host.document.body.appendChild(a);a.click();a.remove();
            setTimeout(()=>URLApi.revokeObjectURL(href),1000);
        }
        isConfigured() { return !!this.config.enabled; }
        isAvailable() {
            if(this.usesDedicatedApi())return this.dedicatedApiReady();
            const terminal=this.host.Samsara&&this.host.Samsara.terminal;
            return !!(terminal&&typeof terminal.apiReady==='function'&&terminal.apiReady());
        }
        isEnabled() { return this.isConfigured()&&this.isAvailable(); }
        setEnabled(value) {
            const on=!!value;
            this.config.enabled=on;
            if(on&&!this.usesDedicatedApi()){
                const terminal=this.host.Samsara&&this.host.Samsara.terminal;
                if(terminal&&typeof terminal.enableApi==='function')terminal.enableApi();
            } else if(!on) {
                this.cancel();
                if(this.isOpen())this.close();
            }
            this.saveConfig();
            this.status=on?(this.isAvailable()?'世界推进已开启':(this.usesDedicatedApi()?'世界推进已开启 · 等待专属 API 配置':'世界推进已开启 · 等待额外模型配置')):'世界推进已关闭';
            this.render();
            return this.isEnabled();
        }
        cancel() { ++this.generation; this.pending = false; clearTimeout(this.timer); if (this.controller) this.controller.abort(); }
        applyBuiltinDefaultWorldbookExclusions(catalogue) {
            if(this.config.activePromptDocumentId!==BUILTIN_DEFAULT_PROMPT_DOCUMENT.id||!Array.isArray(catalogue)||!catalogue.length)return false;
            const applied=new Set(Array.isArray(this.config.builtinDefaultWorldbookExclusionsApplied)?this.config.builtinDefaultWorldbookExclusionsApplied:[]);
            let selected=Array.isArray(this.config.selectedEntries)?copy(this.config.selectedEntries):[];
            let progressed=false,changed=false;
            for(const title of BUILTIN_DEFAULT_WORLD_BOOK_EXCLUSIONS){
                if(applied.has(title))continue;
                const matches=catalogue.filter(entry=>normalizeWorldbookEntryTitle(entry.title)===title);
                if(!matches.length)continue;
                const before=selected.length;
                selected=selected.filter(raw=>!matches.some(entry=>selectedEntryMatches(entry,[raw])));
                applied.add(title);progressed=true;
                if(selected.length!==before)changed=true;
            }
            if(!progressed)return false;
            this.config.selectedEntries=selected;
            this.config.builtinDefaultWorldbookExclusionsApplied=Array.from(applied);
            const builtin=this.getPromptDocuments().find(doc=>doc.id===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id);
            if(builtin?.settings)builtin.settings.selectedEntries=copy(selected);
            this.saveConfig();
            return changed;
        }
        async catalogue() {
            const get=this.fn('getWorldbook');
            if(!get)return [];
            const sources=new Map(),addSource=(book,label)=>{
                const name=String(book||'').trim();if(!name)return;
                if(!sources.has(name))sources.set(name,new Set());
                sources.get(name).add(label);
            };
            const namesFn=this.fn('getCharWorldbookNames');
            if(namesFn){
                const names=await namesFn('current')||{};
                addSource(names.primary,'角色主书');
                for(const book of names.additional||[])addSource(book,'角色附加');
            }
            const chatFn=this.fn('getChatWorldbookName');
            if(chatFn){
                try{addSource(await chatFn('current'),'聊天绑定');}catch(_){}
            }
            const globalFn=this.fn('getGlobalWorldbookNames');
            if(globalFn){
                try{for(const book of await globalFn()||[])addSource(book,'全局启用');}catch(_){}
            }
            const result=[];
            for(const [book,labels] of sources){
                const entries=await get(book)||[];
                entries.forEach((e,i)=>{
                    const title=e.name||e.comment||'未命名';
                    result.push({
                        book,id:String(e.uid??e.id??i),title,sources:Array.from(labels),
                        technical:isTechnicalBook(title),enabled:e.enabled!==false&&!e.disable&&!e.disabled,
                        mode:e.strategy?.type||e.type||(e.constant===false?'selective':'constant'),
                        keys:e.strategy?.keys||e.keys||e.key||[],
                        secondary:e.strategy?.keys_secondary||e.keys_secondary||e.secondary_keys||{},
                        content:e.content||''
                    });
                });
            }
            this.applyBuiltinDefaultWorldbookExclusions(result);
            return result;
        }
        async worldbook(scan='', options={}) {
            const catalogue=await this.catalogue(),output=[];
            this.bookCatalogue=catalogue;
            const report=[];this.readReport=report;
            for(const e of catalogue){
                const selected=!e.technical&&selectedEntryMatches(e,this.config.selectedEntries);
                const timelineBackbone=!!options.timelineBackbone&&selected&&e.enabled&&isTimelineBackboneEntry(e.title);
                const decision=e.technical?{read:false,reason:'世界引擎技术条目已隔离'}:timelineBackbone?{read:true,reason:'宏观资料补充'}:selected?activation(e,scan,this.config.activationMode==='force_selected'):{read:false,reason:'未勾选'};
                report.push({世界书:e.book,条目ID:e.id,名称:e.title,灯:e.mode==='constant'?'蓝灯':e.mode==='selective'?'绿灯':'其他',读取:decision.read,原因:decision.reason});
                if(!decision.read)continue;
                let content=e.content;
                if(content.includes('<%')){
                    const ejs=this.host.EjsTemplate;
                    if(!ejs?.evalTemplate||!ejs?.prepareContext)throw new Error('所选世界书含动态模板，需要 EJS 扩展：'+e.title);
                    content=await ejs.evalTemplate(content,await ejs.prepareContext({}));
                }
                output.push({世界书:e.book,条目ID:e.id,名称:e.title,内容:content});
            }
            Object.defineProperty(output,'report',{value:report});
            return output;
        }
        async buildRequest(base) {
            const state=copy(base.stat);
            state.世界[PATH]=Object.assign(emptyState(),state.世界[PATH]||{});
            normalizeBackendState(state);
            const structuralFixes=normalizeEventLayers(state);
            const lifecycle=compactWorldLifecycle(state);
            const alienActivity=activeAlienActivityRequirements(state);
            const seedPatches=importStory(state);
            // 缺少后台人物的活跃异端只在本次请求副本中放一个空壳，帮助模型明确这是待补活动；
            // 不把空壳作为正式 seed patch，避免与本轮模型真正创建的人物记录发生 add/add 冲突。
            seedMissingAlienPeople(state,alienActivity);
            for(const patch of seedPatches){const parts=tokens(patch.path);if(parts[2]==='事件')state.世界[PATH].事件[parts.at(-1)]=patch.value;}
            structuralFixes.push(...normalizeEventLayers(state));
            structuralFixes.push(...repairCausalProjection(state));
            structuralFixes.push(...repairMacroPredecessors(state));
            structuralFixes.push(...repairExplicitEventLinks(state));
            if(state.设置)delete state.设置.API;
            if(state.设置?.世界超稳===true)state.世界.稳定=100;
            delete state.商城;
            const count=Math.max(1,Math.min(100,Number(this.config.contextTurns)||6));
            const id=Number(base.message.message_id??base.message.id);
            // 先清洗所有历史候选，再取最近 N 条非空正文；技术楼层再多也不会挤掉正文名额。
            const messages=await this.fn('getChatMessages')('0-'+id);
            const isAssistant=m=>{
                const role=String(m?.role||'').toLowerCase();
                if(!m||m.is_hidden||m.is_user===true||role==='user'||role==='system')return false;
                return role==='assistant'||!role;
            };
            const floors=messages.filter(m=>Number(m.message_id??m.id)<=id&&isAssistant(m))
                .sort((a,b)=>Number(a.message_id??a.id)-Number(b.message_id??b.id))
                .map(m=>({楼层:m.message_id??m.id,角色:'assistant',正文:extractWorldProse(m.message??m.mes??'')}))
                .filter(f=>f.正文).slice(-count);
            if(!floors.length)throw new Error('未读到可用AI正文：楼层为空或仅含思考、变量更新与面板，请检查聊天内容');
            const timeline=timelineState(state);
            const needBackbone=timeline.需要初始化||timeline.需要补充远期;
            const openMacro=Object.entries(state.世界[PATH].事件).filter(([,event])=>event.分类==='宏观节点'&&['进行中','待发生'].includes(event.状态));
            const activeMacroCount=openMacro.filter(([,event])=>event.状态==='进行中').length;
            const macroRequirement=this.config.requireMacroBackbone!==false&&timeline.需要补充远期?{
                已有可推进宏观节点:openMacro.map(([名称,event])=>({名称,状态:event.状态})),
                至少补充节点数:Math.max(0,3-openMacro.length),
                交付要求:macroBackbonePlan(openMacro.length,activeMacroCount,openMacro.length-activeMacroCount),
                规划与发生:'本轮必须补齐骨架，不能以时间未推进、正文没有宏观变化或无业务变化为由省略。建立待发生节点属于未来规划，可排在下一宏观边界之后，不表示事件现在发生；近期细节与已发生事实仍受本轮时间容量和下一宏观边界限制。不得为凑数提前原著日期，或预先结算未来事件的结果；更新时间使用当前世界时间。',
                验收:'按已有状态与本轮结果合并后计数；若本轮结束或取消已有宏观节点，须补足被移出窗口的数量。重试时以已接受业务结果和最新补充清单为准，不重复创建已接受节点。'
            }:undefined;
            const proseScan=floors.map(f=>f.正文).join('\n');
            const chronologyScan=needBackbone?[state.世界.名称,'原著','时间线','时间轴','年表','大事记','大事件','剧情大纲','剧情章节','章节','未来','后续'].filter(Boolean).join(' '):'';
            const books=await this.worldbook([proseScan,chronologyScan].filter(Boolean).join('\n'),{timelineBackbone:needBackbone});
            const now=worldDateKey(state.世界.时间);
            const due=Object.entries(state.世界[PATH].事件).filter(([,e])=>e.状态==='待发生'&&now!==null&&worldDateKey(e.时间||e.开始时间)!==null&&worldDateKey(e.时间||e.开始时间)<=now).map(([名称,e])=>({名称,时间:e.时间||e.开始时间,条件:e.条件,前因:e.前因,说明:'时间已到；逐项核验条件与前因，符合则转进行中；未符合必须更新下次检查并解释阻碍，不得无声跳过。'}));
            const unscheduled=unscheduledEvents(state);
            const staleActive=staleActiveEvents(state);
            const timeAnomalies=temporalAnomalies(state);
            const capacity=worldTimeCapacity(state.世界[PATH].已处理时间,state.世界.时间);
            const npcAudit=npcBuildAudit(state);
            const input=JSON.stringify({
                输入语义:{
                    世界书:'可选设定/原著差异/时间资料；不是已发生事实，没有世界书也必须正常推演。',
                    当前变量:'世界推进专用热数据投影；含世界、人物能力、完整资产账簿、活跃传播、近期因果偏移，以及“近期原始锚点 + 更早根总结”组成的分层长期历史记忆。原始历史永久留在MVU，已被上层总结收纳的旧节点不再重复进入热上下文。资产通过WorldResult.资产与同一顶层账簿双向同步；未提供的任务/商城/纯结算数据不属于本引擎职责。',
                    正文楼层:'已经演出的剧情；用于确认当前事实与时间跨度，不复述成后台日常。',
                    程序结构修复:'引擎已做的确定性纠正；不得在输出中恢复被程序降级/修正的旧错误。',
                    时间线调度:'程序计算出的宏观边界与到期复核要求；模型负责语义推演，不重定义调度协议。',
                    WorldResult:'唯一业务交付物；不包含 JSON Pointer、add/replace 路径或程序日志。',
                    角色管理:'若提供NPC构筑审计，只处理列出的既有NPC缺口；完整构筑资料只在审计对象中提供，避免全量NPC重复占用上下文。'
                },
                本轮必须完成的宏观骨架:macroRequirement,
                世界书:books.map(b=>String(b.内容||'')).filter(Boolean),
                当前变量:projectWorldContext(state),
                角色管理:npcAudit.length?{NPC构筑审计:npcAudit}:undefined,
                正文楼层:floors,
                程序结构修复:structuralFixes,
                本轮时间容量:capacity,
                时间线调度:timeline,
                推演阶段:{宏观优先:true,宏观骨架状态:needBackbone?'需要建立或补足':'已具备可用宏观骨架',近期细节边界:timeline.下一宏观节点?.名称||'先建立下一宏观节点',知识来源:'当前确认事实 > 明确世界书设定（若有） > 模型已有原著/世界知识 > 谨慎推断'},
                正文可见投影规则:{
                    当前时间:state.世界.时间,
                    当前地点:state.世界.地点,
                    要求:'非战斗正文会读取完整因果轨道：当前阶段用于当前局势，故事线/下一节点用于长期叙事方向，偏移记录用于跨章因果记忆；这些是规划依据，不等于角色预知或自动知晓幕后信息。正文还会读取进行中当前事件的公开字段，以及程序筛选的场外场景：每个热地区只出现一次共享环境/现场群体，人物列表只携带各自行动事实，关联事件只作索引；活跃异端始终保留在其所在热场景。以上均用于叙事连续性，不代表角色已知。可能影响当前场景的当前事件应维护公开征兆和可见影响；不要把隐藏条件、默认走向或未来宏观事件详情塞进公开字段。'
                },
                可选宏观资料补充:needBackbone,
                本轮必须复核的到期事件:due,
                本轮必须补全的事件时间锚点:unscheduled,
                本轮必须复核的超期活动事件:staleActive,
                本轮必须修复的时间越界记录:timeAnomalies,
                本轮必须维持的异端活动:alienActivity,
                生命周期整理:lifecycle,
                说明:'当前变量为已确认热事实，不重复结算；已归档旧事件和已回收传播不要重新创建；世界书为空不构成阻塞；只提交业务事实，存储路径由程序编译。'
            },null,2);
            const stabilityPrompt=worldStabilityPrompt(state,this.config.stabilityPromptTemplate??DEFAULT_STABILITY_PROMPT_TEMPLATE);
            const macroPrompt=macroRequirement?(this.config.macroPrompt??DEFAULT_MACRO_PROMPT):'';
            const corePrompt=this.config.corePrompt??CORE_WORLD_RULES;
            const system=this.config.preset+(corePrompt?'\n\n'+corePrompt:'')+(macroPrompt?'\n\n'+macroPrompt:'')+(stabilityPrompt?'\n\n'+stabilityPrompt:'')+(npcAudit.length?'\n\n'+(this.config.npcAuditPrompt??NPC_BUILD_AUDIT_RULES):'')+'\n\n【WorldResult 业务输出协议】\n'+((this.config.structurePrompt??protocol().split('【Canonical WorldResult JSON Schema】')[0].trim())+'\n\n【Canonical WorldResult JSON Schema】\n程序实际字段定义（不可由文字说明改变）：\n'+JSON.stringify(WORLD_RESULT_SCHEMA,null,2));
            return {system,input,schema:copy(WORLD_RESULT_SCHEMA),seedPatches,due,unscheduled,staleActive,timeAnomalies,alienActivity,npcAudit:copy(npcAudit),timeline:copy(timeline),manifest:{输出协议:'WorldResult v1',结构化输出:'auto',接口来源:this.apiSourceLabel(),读取判定:copy(books.report||[]),世界书读取:{实际读取:books.length,检查条目:(books.report||[]).length,跳过:Math.max(0,(books.report||[]).length-books.length)},世界书条目:books.map(b=>({世界书:b.世界书,条目ID:b.条目ID,名称:b.名称,估算Tokens:estimateTokens(b.内容)})),正文楼层:floors.map(f=>({楼层:f.楼层,角色:f.角色,估算Tokens:estimateTokens(f.正文)})),导入节点:seedPatches.map(p=>tokens(p.path).at(-1)),到期节点:due.map(e=>e.名称),待补时间锚点:unscheduled.map(e=>e.名称),超期活动事件:staleActive.map(e=>e.名称),时间越界记录:timeAnomalies.map(e=>e.类型+'/'+e.名称),程序结构修复:copy(structuralFixes),生命周期整理:copy(lifecycle),NPC构筑审计:npcAudit.map(x=>({名称:x.名称,审计级别:x.审计级别,缺口:copy(x.缺口)})),本轮时间容量:copy(capacity),可选宏观资料补充:needBackbone,观测:requestTokenTelemetry(system,input,WORLD_RESULT_SCHEMA)}};
        }
        schedule() {
            if (this.disposed || this.committing || !this.isEnabled()) return;
            if (this.busy) { this.pending = true; return; }
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.run().catch(() => {}), 900);
        }
        async run() {
            if (this.disposed || this.busy) return false;
            if (!this.isConfigured()) { this.status='世界推进已关闭'; this.render(); return false; }
            const terminal = this.host.Samsara && this.host.Samsara.terminal;
            this.busy = true; const token = this.generation; let timeout, timedOut=false;
            try {
                const base = this.snapshot(), reason = this.blocked(base);
                if (reason) { this.status = reason; return false; }
                const old = Object.assign(emptyState(),base.stat.世界[PATH] || {});
                if (old.已处理楼层 === base.fingerprint) {
                    const recoveryStat=copy(base.stat);
                    recoveryStat.世界[PATH]=Object.assign(emptyState(),recoveryStat.世界[PATH]||{});
                    normalizeBackendState(recoveryStat);
                    const recoveryTimeline=timelineState(recoveryStat);
                    const needsMacroRepair=this.config.requireMacroBackbone!==false&&(recoveryTimeline.需要补充远期||recoveryTimeline.因果轨道需重建);
                    const needsScheduleRepair=unscheduledEvents(recoveryStat).length>0;
                    const needsLifecycleRepair=staleActiveEvents(recoveryStat).length>0||temporalAnomalies(recoveryStat).length>0;
                    const needsAlienRepair=activeAlienActivityRequirements(recoveryStat).some(item=>{
                        const personName=stableNameIn(recoveryStat.世界?.[PATH]?.人物||{},item.名称),person=personName?recoveryStat.世界[PATH].人物[personName]:null;
                        return !person||!String(person.地点||'').trim()||!String(person.目标||'').trim()||!String(person.行动||'').trim()||String(person.更新时间||'').trim()!==String(recoveryStat.世界?.时间||'').trim();
                    });
                    if(!needsMacroRepair&&!needsScheduleRepair&&!needsLifecycleRepair&&!needsAlienRepair){this.status='本楼层已处理，不重复结算';return false;}
                    this.status=needsMacroRepair?'检测到宏观骨架不完整 · 修复本楼层':needsScheduleRepair?'检测到事件时间锚点缺失 · 修复本楼层':needsAlienRepair?'检测到异端活动缺失 · 修复本楼层':'检测到生命周期或时间异常 · 修复本楼层';
                }
                if (!this.isAvailable()) throw new Error(this.usesDedicatedApi()?'请在世界推进「设置」中完成专属 API 地址与模型配置':'请在主神终端设置中启用额外模型并选择模型');
                const validate = this.host.Samsara && this.host.Samsara.validateWorldState;
                if (!validate) throw new Error('请加载更新后的 ZOD脚本.js');

                this.resetInspection();
                this.status = '正在读取世界资料'; this.render();
                const request=await this.buildRequest(base);
                if(token!==this.generation)throw new Error('请求已取消');

                const configuredAttempts=Number(this.config.retryAttempts),maxAttempts=Math.max(1,Math.min(5,Number.isFinite(configuredAttempts)?configuredAttempts:5));
                let attempt=0,lastError=null,lastRejectedReply='',prepared=null,acceptedWorldResult=null,lastRetryPlan=[];

                while(attempt<maxAttempts){
                    if(token!==this.generation)throw new Error('请求已取消');
                    this.controller=new AbortController();
                    timedOut=false;
                    clearTimeout(timeout);timeout=setTimeout(()=>{timedOut=true;this.controller.abort();},300000);
                    const attemptInput=attempt===0?request.input:retryInput(request.input,lastError,lastRejectedReply,attempt,maxAttempts,acceptedWorldResult,lastRetryPlan);
                    const actualRequest=copy(request);
                    actualRequest.input=attemptInput;
                    actualRequest.manifest=Object.assign({},copy(request.manifest),{
                        观测:requestTokenTelemetry(request.system,attemptInput,request.schema),
                        尝试序号:attempt+1,
                        最大尝试次数:maxAttempts,
                        失败记录:copy(this.lastRetryLog)
                    });
                    actualRequest.manifest.观测.请求类型=attempt===0?'首次请求':'纠错重试';
                    this.lastAttemptCount=attempt+1;
                    this.lastRequest=actualRequest;
                    this.status=attempt===0?'六模块联合推演中':'纠错重试 '+(attempt+1)+'/'+maxAttempts;
                    this.render();

                    let received='',attemptTelemetry=null;
                    const attemptStarted=Date.now();this.lastTransportInfo=null;
                    try{
                        received=String(await this.requestAI(request.system,attemptInput,{signal:this.controller.signal,schema:request.schema,schemaName:'samsara_world_result_v1',structured:'auto',temperature:0.3}));
                        clearTimeout(timeout);
                        if(token!==this.generation||this.controller.signal.aborted)throw new Error('请求已取消');
                        this.lastReply=received;this.lastFailure='';
                        const elapsed=Math.max(0,Date.now()-attemptStarted),transport=this.lastTransportInfo||{},usage=transport.usage||null,observation=actualRequest.manifest.观测;
                        Object.assign(observation,{接口来源:transport.接口||this.apiSourceLabel(),模型:transport.模型||'',结构化实际模式:transport.结构化模式||'未知',模式尝试:copy(transport.尝试模式||[]),耗时毫秒:elapsed,输出估算Tokens:estimateTokens(received)});
                        if(usage){observation.实际输入Tokens=usage.inputTokens;observation.实际输出Tokens=usage.outputTokens;observation.实际总Tokens=usage.totalTokens;}
                        attemptTelemetry={尝试:attempt+1,结果:'待验收',输入估算Tokens:observation.请求估算Tokens,输出估算Tokens:observation.输出估算Tokens,API输入Tokens:usage?.inputTokens??null,API输出Tokens:usage?.outputTokens??null,API总Tokens:usage?.totalTokens??null,接口:observation.接口来源,模型:observation.模型,结构化模式:observation.结构化实际模式,模式尝试:copy(observation.模式尝试||[]),耗时毫秒:elapsed};
                        this.lastAttemptTelemetry.push(attemptTelemetry);

                        const reply=parseReply(received);
                        let legacyPatches=[],rejectedSlices=[];
                        if(reply.kind==='world_result'){
                            const staged=stageWorldResult(base.stat,acceptedWorldResult,reply.worldResult,validate);
                            acceptedWorldResult=staged.accepted;
                            rejectedSlices=staged.rejected;
                            reply.summary=acceptedWorldResult.摘要||reply.summary;
                        } else {
                            legacyPatches=sanitizeModelPatches(normalizeModelPatches(reply.patches));
                        }
                        const compileFor=sourceStat=>{
                            const patches=[],warnings=[];
                            if(acceptedWorldResult){
                                const compiled=compileWorldResult(sourceStat,acceptedWorldResult);
                                patches.push(...compiled.patches);warnings.push(...compiled.warnings);
                            }
                            if(legacyPatches.length)patches.push(...legacyPatches);
                            return {patches,warnings};
                        };
                        let sourceStat=base.stat,compiled=compileFor(sourceStat),modelPatches=compiled.patches;
                        this.lastWorldResult=acceptedWorldResult?copy(acceptedWorldResult):null;
                        this.lastCompiledPatches=copy(modelPatches);
                        this.lastCompileWarnings=copy(compiled.warnings);
                        let built=materializeWorldUpdate(sourceStat,request.seedPatches,modelPatches);
                        let next=built.next;
                        let globalError=null;
                        try{
                            ensureDueHandled(next,request.due,base.stat.世界.时间);
                            ensureEventTimeAnchors(next,request.unscheduled);
                            ensureStaleActiveHandled(next,request.staleActive,base.stat.世界.时间);
                            ensureTemporalAnomaliesResolved(next,request.timeAnomalies);
                            ensureActiveAlienActivity(next,request.alienActivity,acceptedWorldResult,base.stat.世界.时间);
                            ensureNpcBuildAuditProgress(next,request.npcAudit,acceptedWorldResult);
                            ensureMacroBackbone(next,request.timeline,this.config.requireMacroBackbone!==false);
                        }catch(error){globalError=error;}
                        if(rejectedSlices.length||globalError)throw makeRetryFailure(rejectedSlices,globalError);

                        const current=this.snapshot();
                        if(token!==this.generation||this.controller.signal.aborted||current.fingerprint!==base.fingerprint||this.blocked(current))throw new Error('上下文已经切换，本次结果已丢弃');
                        if(progressionAnchorChanged(base.stat,current.stat))throw new Error('推演期间世界时间或副本锚点发生变化，请重新运行');

                        if(!same(current.stat,base.stat)){
                            sourceStat=current.stat;
                            compiled=compileFor(sourceStat);modelPatches=compiled.patches;
                            this.lastCompiledPatches=copy(modelPatches);
                            this.lastCompileWarnings=copy(compiled.warnings);
                            built=materializeWorldUpdate(sourceStat,request.seedPatches,modelPatches);
                            next=built.next;
                            let currentGlobalError=null;
                            try{
                                ensureDueHandled(next,request.due,base.stat.世界.时间);
                                ensureEventTimeAnchors(next,request.unscheduled);
                                ensureStaleActiveHandled(next,request.staleActive,base.stat.世界.时间);
                                ensureTemporalAnomaliesResolved(next,request.timeAnomalies);
                                ensureActiveAlienActivity(next,request.alienActivity,acceptedWorldResult,base.stat.世界.时间);
                                ensureMacroBackbone(next,request.timeline,this.config.requireMacroBackbone!==false);
                            }catch(error){currentGlobalError=error;}
                            if(currentGlobalError)throw makeRetryFailure([],currentGlobalError);
                        }
                        const committedPatches=built.appliedSeeds.concat(modelPatches,built.repairPatches);

                        if (!(next.设置 || {}).世界超稳) {
                            const offsets=(next.世界.因果轨道||{}).偏移记录||{};
                            const total=Object.values(offsets).reduce((n,r)=>n+(Number(r.影响程度)||0),0);
                            next.世界.稳定=Math.max(0,Math.min(120,100+total));
                        }
                        next.世界[PATH].已处理楼层=base.fingerprint;
                        next.世界[PATH].已处理时间=base.stat.世界.时间;
                        const changes=committedPatches.map(p=>{
                            const parts=tokens(p.path),back=parts[1]===PATH,asset=parts[0]==='资产';
                            return {时间:base.stat.世界.时间,类别:asset?'资产':back?parts[2]:parts[1],名称:asset?parts[1]:back?parts[3]:parts[2],字段:asset?'资产':parts.at(-1),操作:p.op==='add'?'新增':p.op==='remove'?'移除':'更新',内容:typeof p.value==='string'?p.value:plain(p.value)?(p.value.描述||p.value.行动||p.value.事实||p.value.目标||p.value.状态||p.value.内容||'记录已更新'):''};
                        });
                        next.世界[PATH].最近变化=changes.slice(-100);
                        // 推演记录已由历史锚点取代，不再持久化。
                        // 可选提交装饰钩子：用于把本轮派生元数据与主世界结果原子落库，避免额外 MVU 写回。
                        if(typeof this.beforeWorldCommit==='function')this.beforeWorldCommit(next,{
                            messageId:base.id,fingerprint:base.fingerprint,worldResult:acceptedWorldResult,reply:copy(reply),baseStat:base.stat
                        });

                        const checked=validate(next);
                        for(const patch of committedPatches){
                            if(patch.op!=='remove'&&!same(get(checked,tokens(patch.path)),get(next,tokens(patch.path))))throw schemaMismatchError(next,checked,patch.path);
                        }
                        reply.patches=committedPatches;
                        prepared={reply,next,current};
                        if(attemptTelemetry)attemptTelemetry.结果='接受';
                        break;
                    }catch(error){
                        clearTimeout(timeout);
                        if(attemptTelemetry){attemptTelemetry.结果='拒绝';attemptTelemetry.原因=String(error.message||error);}
                        else{
                            const elapsed=Math.max(0,Date.now()-attemptStarted),transport=this.lastTransportInfo||{},observation=actualRequest.manifest.观测;
                            Object.assign(observation,{接口来源:transport.接口||this.apiSourceLabel(),模型:transport.模型||'',结构化实际模式:transport.结构化模式||'未返回',模式尝试:copy(transport.尝试模式||[]),耗时毫秒:elapsed});
                            this.lastAttemptTelemetry.push({尝试:attempt+1,结果:'请求失败',输入估算Tokens:observation.请求估算Tokens,输出估算Tokens:0,API输入Tokens:null,API输出Tokens:null,API总Tokens:null,接口:observation.接口来源,模型:observation.模型,结构化模式:observation.结构化实际模式,模式尝试:copy(observation.模式尝试||[]),耗时毫秒:elapsed,原因:String(error.message||error)});
                        }
                        lastError=error;
                        lastRejectedReply=received||this.lastReply||'';
                        lastRetryPlan=Array.isArray(error?.retryPlan)?copy(error.retryPlan):retryPlanForFailure(error,[]);
                        const rejectedByModel=!!received&&retryableModelFailure(error);
                        if(rejectedByModel)this.lastRetryLog.push({尝试:attempt+1,错误:String(error.message||error),片段:Array.isArray(error?.rejectedSlices)?copy(error.rejectedSlices):[],补充清单:copy(lastRetryPlan)});
                        const canRetry=rejectedByModel&&attempt+1<maxAttempts;
                        if(!canRetry)throw error;
                        attempt++;
                        this.status='回复未通过 · 自动纠错 '+(attempt+1)+'/'+maxAttempts;
                        this.render();
                    }
                }

                if(!prepared)throw lastError||new Error('世界推演未生成可写入结果');
                this.committing=true;
                const result=prepared.current.raw;
                result.stat_data=prepared.next;
                const replay=typeof this.buildWorldReplayPackage==='function'
                    ?this.buildWorldReplayPackage(base.stat,prepared.next,base.fingerprint):null;
                if(replay)result.__samsaraWorldReplay=replay;
                await prepared.current.mvu.replaceMvuData(result,{type:'message',message_id:base.id});
                this.status='已更新 · '+prepared.reply.summary+(this.lastRetryLog.length?' · 前序失败'+this.lastRetryLog.length+'次':'');
                return true;
            } catch (error) {
                const failureMessage=error.name==='AbortError'?(timedOut?'请求超时（300秒）':'请求已取消'):String(error.message||error);
                this.lastFailure=failureMessage;
                const retryNote=this.lastRetryLog?.length?' · 已记录失败'+this.lastRetryLog.length+'次':'';
                this.status=(this.committing?'写入未确认 · ':'未写入 · ')+failureMessage+retryNote;
                if(!(error.name==='AbortError'&&!timedOut))this.notifyFailure(this.status);
                throw error;
            } finally {
                clearTimeout(timeout); if(this.controller)this.controller=null; this.committing=false; this.busy=false; this.render();
                if (this.pending) { this.pending = false; this.schedule(); }
            }
        }
        getState() { return copy(Object.assign(emptyState(),this.snapshot().stat.世界[PATH] || {})); }
        resetInspection() {
            this.lastRequest=null;this.previewRequest=null;this.lastReply='';this.lastFailure='';
            this.lastRetryLog=[];this.lastAttemptCount=0;this.lastAttemptTelemetry=[];this.lastTransportInfo=null;this.lastWorldResult=null;this.lastCompiledPatches=[];this.lastCompileWarnings=[];
        }
        statusTone() {
            try {
                const tone=this.host.localStorage.getItem(STATUS_THEME_CONFIG);
                if(WORLD_TONE_KEYS.has(tone))return tone;
            } catch (_) {}
            return 'night';
        }
        syncStatusTone() {
            const tone=this.statusTone();
            if(this.panel)this.panel.dataset.tone=tone;
            return tone;
        }
        init() {
            const on = this.fn('eventOn');
            const mvu = this.env.Mvu || this.host.Mvu;
            if (!on || !mvu || !mvu.events) { this.initTimer = setTimeout(() => { if (!this.disposed) this.init(); },500); return; }
            const bind = (event,callback) => { if (event) { const off = on(event,callback); if (typeof off === 'function') this.unsub.push(off); else if (off && off.stop) this.unsub.push(() => off.stop()); } };
            bind(mvu.events.VARIABLE_UPDATE_ENDED, (variables,before) => {
                // 自身提交和装备等 UI 写回不代表正文完成，避免误触发补跑。
                if(this.committing||this.host.__samsaraUIMutation||this.env.__samsaraUIMutation||this.host.parent?.__samsaraUIMutation)return;
                try {
                    const snapshot=this.snapshot();
                    if(plain(variables?.stat_data))snapshot.stat=variables.stat_data;
                    if(this.blocked(snapshot))this.cancel();
                } catch (_) { /* MVU 可能尚未写回；由延迟调度读取最终状态。 */ }
                this.render(); this.schedule();
            });
            const events = this.env.tavern_events || this.host.tavern_events || {};
            for (const key of ['CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_DELETED']) bind(events[key], () => { this.cancel(); this.resetInspection(); this.status = '已切换上下文'; this.render(); });
            this.keyHandler = event => { if (event.key === 'Escape' && this.isOpen()) { event.stopImmediatePropagation(); this.close(); } };
            this.host.document.addEventListener('keydown',this.keyHandler,true);
        }
        isOpen() { return !!this.panel && !this.panel.hidden; }
        open() {
            if (this.isOpen()) return;
            this.createPanel();
            const terminal = this.host.Samsara && this.host.Samsara.terminal;
            if (terminal) this.returnState = terminal.suspend();
            this.panel.hidden = false; this.render();
        }
        close() {
            this.promptEditing=false;
            if (!this.isOpen()) return;
            this.panel.hidden = true;
            const terminal = this.host.Samsara && this.host.Samsara.terminal;
            if (terminal) terminal.restore(this.returnState);
            this.returnState = null;
        }
        toggle() { this.isOpen() ? this.close() : this.open(); }
        createPanel() {
            if (this.panel && this.panel.isConnected) return;
            const doc=this.host.document;
            this.style=doc.createElement('style');
            this.style.textContent = [
                '#sam-world-engine .we-event-tasks{margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--we-surface,transparent)}#sam-world-engine .we-event-task{margin-top:8px;border-top:1px solid var(--line);padding-top:8px}#sam-world-engine .we-event-task summary{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none}#sam-world-engine .we-event-task summary:before{content:"▸";color:var(--sub)}#sam-world-engine .we-event-task[open] summary:before{content:"▾"}#sam-world-engine .we-task-name{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}#sam-world-engine .we-event-task summary .we-pill{flex-shrink:0}#sam-world-engine .we-event-task p{overflow-wrap:anywhere}',
                '#sam-world-engine[hidden]{display:none!important}',
                '#sam-world-engine{--ink:#dce5ef;--sub:#8897aa;--line:#ffffff12;--gold:#d9b978;--mint:#7dcbbb;position:fixed;inset:4vh max(2vw,calc((100vw - 1440px)/2));z-index:999999;background:#101720;color:var(--ink);border:1px solid #53606a;border-radius:14px;box-shadow:0 30px 120px #000b;display:flex;flex-direction:column;overflow:hidden;font:14px/1.65 system-ui,"Microsoft YaHei",sans-serif}',
                '#sam-world-engine *{box-sizing:border-box}#sam-world-engine button,#sam-world-engine input,#sam-world-engine textarea{font:inherit}#sam-world-engine button{cursor:pointer;color:inherit}#sam-world-engine button:focus-visible,#sam-world-engine input:focus-visible{outline:2px solid var(--gold);outline-offset:2px}#sam-world-engine button:disabled{opacity:.4;cursor:default}',
                '#sam-world-engine header{height:62px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 25px;border-bottom:1px solid var(--line);background:#131c27}#sam-world-engine .we-brand{font-size:16px;letter-spacing:3px;font-weight:650;flex:1}#sam-world-engine .we-brand i{color:var(--gold);font-style:normal;margin-right:12px}#sam-world-engine .we-brand small{font-size:10px;color:var(--sub);letter-spacing:2px;margin-left:16px}',
                '#sam-world-engine button.we-btn{border:1px solid #ffffff23;border-radius:6px;background:#ffffff05;padding:7px 13px;font-size:12px}#sam-world-engine button.we-primary{background:var(--gold);border-color:var(--gold);color:#20232a;font-weight:700}#sam-world-engine .we-layout{display:flex;min-height:0;flex:1}#sam-world-engine nav{width:173px;flex-shrink:0;padding:22px 12px;background:#121a24;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:5px}#sam-world-engine nav .we-navtitle{font-size:10px;color:var(--sub);letter-spacing:3px;padding:0 13px 15px}#sam-world-engine nav button{display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid transparent;border-radius:6px;text-align:left;background:none;color:var(--sub);font-size:13px}#sam-world-engine nav button .we-tab-icon{display:inline-flex;flex:0 0 20px;width:20px;height:20px;align-items:center;justify-content:center;font:400 16px/1 "Segoe UI Symbol","Noto Sans Symbols 2",system-ui,sans-serif;transform:none!important}#sam-world-engine nav button[aria-selected=true]{background:#d9b97812;color:var(--gold);border-color:#d9b97824}#sam-world-engine nav button:hover{background:#ffffff08;color:var(--ink)}',
                '#sam-world-engine main{flex:1;min-width:0;overflow:auto;padding:27px 30px 36px;scrollbar-width:thin;scrollbar-color:#526070 transparent}#sam-world-engine .we-eyebrow{font-size:10px;letter-spacing:3px;color:var(--gold);margin-bottom:7px}#sam-world-engine h1{font-size:30px;letter-spacing:2px;margin:0 0 8px;font-weight:600}#sam-world-engine h2{font-size:14px;font-weight:600;margin:0;letter-spacing:1px}#sam-world-engine h3{font-size:14px;margin:0 0 7px}#sam-world-engine p{margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}#sam-world-engine .we-muted{color:var(--sub);font-size:12px}#sam-world-engine .we-hero{display:flex;gap:25px;justify-content:space-between;align-items:center;padding:0 0 23px;border-bottom:1px solid var(--line)}#sam-world-engine .we-hero .we-date{min-width:180px;text-align:right;color:var(--gold);font-size:16px}#sam-world-engine .we-hero .we-date small{display:block;color:var(--sub);font-size:11px;margin-top:5px}',
                '#sam-world-engine .we-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:18px 0 25px;background:linear-gradient(100deg,#1a2634,#141f2b);border:1px solid var(--line);border-radius:9px}#sam-world-engine .we-metric{padding:15px 20px;border-right:1px solid var(--line)}#sam-world-engine .we-metric:last-child{border:0}#sam-world-engine .we-metric strong{display:block;font-size:25px;font-weight:500;color:var(--ink);line-height:1.4}#sam-world-engine .we-metric small{color:var(--sub);font-size:11px;letter-spacing:1px}',
                '#sam-world-engine .we-columns{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(245px,1fr);gap:23px;align-items:start}#sam-world-engine .we-section{margin-bottom:23px;min-width:0}#sam-world-engine .we-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}#sam-world-engine .we-section-head small{color:var(--sub);font-size:11px}#sam-world-engine .we-card{border:1px solid var(--line);border-radius:8px;background:#18222f;padding:16px 18px;margin:9px 0;overflow:hidden}#sam-world-engine .we-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}#sam-world-engine .we-card-top h3{margin:0}#sam-world-engine .we-card p{font-size:13px;color:#b8c4d3}#sam-world-engine .we-pill{display:inline-block;font-size:10px;line-height:1.6;padding:2px 7px;border:1px solid #7dcbbb30;border-radius:4px;color:var(--mint);background:#7dcbbb09;white-space:nowrap}#sam-world-engine .we-pill.future{color:var(--gold);border-color:#d9b97830;background:#d9b97809}#sam-world-engine .we-pill.dim{color:var(--sub);border-color:var(--line);background:transparent}#sam-world-engine .we-meta{display:flex;gap:8px 15px;flex-wrap:wrap;color:var(--sub);font-size:11px;margin-top:9px}#sam-world-engine .we-chips{display:flex;flex-wrap:wrap;gap:5px}',
                '#sam-world-engine .we-timeline{border-left:1px solid #d9b97838;margin-left:5px;padding-left:20px}#sam-world-engine .we-timeline .we-card{position:relative;overflow:visible}#sam-world-engine .we-timeline .we-card:before{content:"";position:absolute;left:-26px;top:20px;width:9px;height:9px;background:var(--gold);border:2px solid #101720;border-radius:50%}#sam-world-engine .we-avatar{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#496575,#243440);color:#c1dedc;font-size:15px;flex-shrink:0}#sam-world-engine .we-person{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}#sam-world-engine .we-person:last-child{border:0}#sam-world-engine .we-person>div:last-child{flex:1;min-width:0}#sam-world-engine .we-person strong{font-size:13px}#sam-world-engine .we-person p{font-size:12px;color:#acb8c8;margin:3px 0}',
                '#sam-world-engine .we-context-list{display:grid;gap:8px}#sam-world-engine .we-context-row{width:100%;display:grid;grid-template-columns:minmax(56px,auto) minmax(0,1fr);align-items:start;gap:10px;padding:11px 12px;border:1px solid var(--we-line,var(--line));border-radius:9px;background:var(--we-card,#18222f);text-align:left;color:var(--we-ink,var(--ink))}#sam-world-engine button.we-context-row:hover{background:var(--we-card-hover,#1d2a39)}#sam-world-engine .we-context-kind{color:var(--we-accent,var(--gold));font-size:var(--we-fs-tiny,11px);font-weight:700;letter-spacing:.06em}#sam-world-engine .we-context-copy{min-width:0}#sam-world-engine .we-context-copy b{display:block;font-size:var(--we-fs-body,13px);overflow-wrap:anywhere}#sam-world-engine .we-context-copy small{display:block;margin-top:2px;color:var(--we-sub,var(--sub));font-size:var(--we-fs-small,12px)}#sam-world-engine .we-scene-hero{padding:14px 16px;border:1px solid var(--we-line,var(--line));border-radius:11px;background:var(--we-card,#18222f)}#sam-world-engine .we-scene-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}#sam-world-engine .we-scene-head h3{margin:0}#sam-world-engine .we-scene-head small{color:var(--we-sub,var(--sub))}#sam-world-engine .we-scene-hero>p{margin:8px 0 0;color:var(--we-sub,var(--sub))}#sam-world-engine .we-scene-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:11px}#sam-world-engine .we-scene-lane{min-width:0;border:1px solid var(--we-line,var(--line));border-radius:10px;background:var(--we-card,#18222f);padding:11px}#sam-world-engine .we-scene-lane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}#sam-world-engine .we-scene-lane-head b{font-size:var(--we-fs-small,12px)}#sam-world-engine .we-scene-lane-head span{color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-scene-item{display:block;width:100%;padding:9px 8px;border:0;border-top:1px solid var(--we-line,var(--line));background:transparent;text-align:left;color:var(--we-ink,var(--ink))}#sam-world-engine .we-scene-item:first-of-type{border-top:0}#sam-world-engine button.we-scene-item:hover{background:var(--we-card-hover,#1d2a39)}#sam-world-engine .we-scene-item b{display:block;font-size:var(--we-fs-body,13px);overflow-wrap:anywhere}#sam-world-engine .we-scene-item small{display:block;color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px);margin-top:2px}#sam-world-engine .we-scene-item p{margin:4px 0 0!important;color:var(--we-sub,var(--sub))!important;font-size:var(--we-fs-small,12px)!important;line-height:1.5!important}#sam-world-engine .we-scene-label,#sam-world-engine .we-person-label{cursor:default}#sam-world-engine .we-roster-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#sam-world-engine .we-roster-person{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;width:100%;min-width:0;padding:11px 12px;border:1px solid var(--we-line,var(--line));border-radius:10px;background:var(--we-card,#18222f);text-align:left;color:var(--we-ink,var(--ink))}#sam-world-engine .we-roster-person:hover{background:var(--we-card-hover,#1d2a39)}#sam-world-engine .we-roster-person.active{border-color:var(--we-accent,var(--gold));box-shadow:0 0 0 2px color-mix(in srgb,var(--we-accent,var(--gold)) 18%,transparent)}#sam-world-engine .we-roster-copy{min-width:0}#sam-world-engine .we-roster-copy b{display:block;font-size:var(--we-fs-body,13px);overflow-wrap:anywhere}#sam-world-engine .we-roster-copy small{display:block;margin-top:2px;color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-roster-copy em{display:block;margin-top:5px;color:var(--we-sub,var(--sub));font-size:var(--we-fs-small,12px);font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#sam-world-engine .we-area-scene-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}#sam-world-engine .we-area-detail{display:grid;gap:14px}#sam-world-engine .we-area-facts{min-width:0;padding:14px 16px;border:1px solid var(--we-line,var(--line));border-radius:11px;background:var(--we-card,#18222f)}#sam-world-engine .we-area-archive{padding:0 2px}#sam-world-engine .we-explore-index{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}@media(max-width:900px){#sam-world-engine .we-roster-list,#sam-world-engine .we-scene-grid,#sam-world-engine .we-area-scene-grid{grid-template-columns:1fr}}',
                '#sam-world-engine .we-change{display:grid;grid-template-columns:62px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:12px}#sam-world-engine .we-change time{color:var(--gold);font-size:10px}#sam-world-engine .we-change p{margin:2px 0;color:var(--sub)}#sam-world-engine .we-progress{height:4px;background:#ffffff0a;border-radius:4px;margin:10px 0 6px;overflow:hidden}#sam-world-engine .we-progress>i{display:block;height:100%;background:var(--mint);border-radius:4px}#sam-world-engine .we-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 18px;align-items:start}#sam-world-engine dl{margin:12px 0;display:grid;grid-template-columns:85px minmax(0,1fr);gap:8px 14px;font-size:12px}#sam-world-engine dt{color:var(--sub)}#sam-world-engine dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}#sam-world-engine details{border-top:1px solid var(--line);margin-top:12px;padding-top:8px}#sam-world-engine summary{cursor:pointer;color:var(--gold);font-size:11px;list-style:none}#sam-world-engine summary:before{content:"＋ ";}#sam-world-engine details[open]>summary:before{content:"− ";}',
                '#sam-world-engine .we-calendar{background:#18222f;border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:20px}#sam-world-engine .we-calhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}#sam-world-engine .we-days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center}#sam-world-engine .we-days span{color:var(--sub);font-size:10px;padding:4px}#sam-world-engine .we-days button{position:relative;padding:7px 0;border:1px solid transparent;border-radius:5px;background:none;font-size:11px;min-width:0}#sam-world-engine .we-days button.today{border-color:var(--gold);color:var(--gold)}#sam-world-engine .we-days button.selected{background:#d9b97824}#sam-world-engine .we-days button.has-event:after{content:"";position:absolute;bottom:2px;left:calc(50% - 2px);width:4px;height:4px;background:var(--mint);border-radius:50%}#sam-world-engine .we-days button:hover{background:#ffffff0b}',
                '#sam-world-engine .we-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:18px 0}#sam-world-engine .we-tools input{min-width:150px;flex:1;background:#17212d;border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:8px 12px;font-size:12px}#sam-world-engine .we-tools button{border:1px solid var(--line);background:none;border-radius:5px;padding:6px 10px;font-size:11px}#sam-world-engine .we-tools button.active{border-color:var(--gold);color:var(--gold)}#sam-world-engine .we-empty{padding:24px 15px;text-align:center;border:1px dashed #ffffff19;border-radius:8px;color:var(--sub);font-size:12px}#sam-world-engine .we-empty b{display:block;color:#bec9d6;margin-bottom:5px;font-weight:500}#sam-world-engine .we-notice{padding:12px 16px;border-left:2px solid var(--gold);background:#d9b97808;margin:15px 0;color:#d4c4a6;font-size:12px}#sam-world-engine textarea{width:100%;min-height:48vh;background:#121b26;color:var(--ink);border:1px solid #ffffff24;border-radius:8px;padding:18px;line-height:1.9;resize:vertical}#sam-world-engine footer{padding:8px 24px;border-top:1px solid var(--line);font-size:10px;color:var(--sub);display:flex;justify-content:space-between;gap:15px}#sam-world-engine footer span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
                '@media(max-width:1000px){#sam-world-engine .we-columns{grid-template-columns:1fr}#sam-world-engine nav{width:145px}#sam-world-engine main{padding:20px}#sam-world-engine .we-calendar{max-width:400px}}@media(max-width:640px){#sam-world-engine{inset:0;border-radius:0}#sam-world-engine header{padding:0 12px;height:58px;gap:6px}#sam-world-engine .we-brand{font-size:13px;letter-spacing:1px}#sam-world-engine .we-brand small{display:none}#sam-world-engine .we-layout{flex-direction:column}#sam-world-engine nav{width:100%;flex-direction:row;overflow-x:auto;padding:8px;gap:3px;border-right:0;border-bottom:1px solid var(--line)}#sam-world-engine nav .we-navtitle{display:none}#sam-world-engine nav button{white-space:nowrap;padding:7px 10px;font-size:11px}#sam-world-engine nav button .we-tab-icon{display:none}#sam-world-engine main{padding:18px 14px}#sam-world-engine .we-hero{gap:12px;align-items:flex-start}#sam-world-engine h1{font-size:23px}#sam-world-engine .we-hero .we-date{min-width:110px;font-size:12px}#sam-world-engine .we-metric{padding:10px}#sam-world-engine .we-metric strong{font-size:20px}#sam-world-engine .we-grid{grid-template-columns:1fr}#sam-world-engine footer{padding:8px 12px}#sam-world-engine footer small{display:none}}'
            ].join('\n');
            this.mount=doc.createElement('div');
            this.mount.id='sam-world-engine-host';
            this.mount.style.setProperty('all','initial','important');
            const isolated=this.mount.attachShadow({mode:'open'});
            isolated.appendChild(this.style);
            // 明确占据视口高度，避免宿主 flex/弹窗规则在短屏挤掉正文。
            this.style.textContent += `
                #sam-world-engine{
                    top:2vh!important;bottom:auto!important;height:96vh!important;height:96dvh!important;max-height:none!important;min-height:0!important;
                    --ink:#243248;--sub:#6f7b8c;--line:#dfe4e7;--gold:#b28a4a;--mint:#4f7d6d;
                    background:#e8ece9;color:var(--ink);border-color:#344554;border-radius:18px;box-shadow:0 28px 90px #17212d55
                }
                #sam-world-engine header{
                    height:64px;background:linear-gradient(120deg,#1d2a39,#273d4c);color:#f7f3e8;border-bottom:0;padding:0 24px
                }
                #sam-world-engine .we-brand i{color:#d7b46d}
                #sam-world-engine .we-brand small{color:#aebbc5}
                #sam-world-engine button.we-btn{border-color:#ffffff28;background:#ffffff0a}
                #sam-world-engine button.we-primary{background:#d5b06b;border-color:#d5b06b;color:#22303e}
                #sam-world-engine .we-layout{display:grid!important;grid-template-rows:auto minmax(0,1fr);min-height:0!important;flex:1 1 0!important;overflow:hidden}
                #sam-world-engine nav{
                    width:100%!important;flex-direction:row!important;align-items:center;gap:6px;padding:9px 20px;background:#223342;border-right:0;border-bottom:1px solid #ffffff12;overflow-x:auto;min-height:51px
                }
                #sam-world-engine nav .we-navtitle{display:none}
                #sam-world-engine nav button{
                    flex:0 0 auto;padding:8px 13px;border-radius:999px;background:transparent;color:#aeb9c2;border-color:transparent;font-size:12px
                }
                #sam-world-engine nav button span{width:auto;font-size:13px}
                #sam-world-engine nav button:hover{background:#ffffff0c;color:#fff}
                #sam-world-engine nav button[aria-selected=true]{background:#d5b06b;color:#21303d;border-color:#d5b06b;font-weight:700}
                #sam-world-engine main{
                    display:block!important;height:auto!important;min-height:0!important;flex:1 1 0!important;overflow:auto!important;
                    padding:20px clamp(16px,2.2vw,30px) 34px;background:
                    radial-gradient(circle at 88% 0,#f6eee1 0,transparent 34%),
                    linear-gradient(135deg,#edf1ee,#e8ece9 55%,#f3f0e8)
                }
                #sam-world-engine .we-hero{
                    padding:18px 20px;margin-bottom:12px;border:1px solid #dbe1e2;border-left:4px solid var(--gold);border-radius:16px;background:#fbfaf6;box-shadow:0 7px 24px #2535460b
                }
                #sam-world-engine .we-eyebrow{color:#87662f}
                #sam-world-engine h1{font-family:Georgia,"SimSun",serif;font-size:27px;letter-spacing:1px}
                #sam-world-engine h2{font-family:Georgia,"SimSun",serif;font-size:17px;letter-spacing:.5px}
                #sam-world-engine .we-hero .we-date{color:#80612e}
                #sam-world-engine .we-section{
                    margin-bottom:14px;padding:16px;border:1px solid #dfe4e5;border-radius:15px;background:#fffdf8;box-shadow:0 7px 22px #22314209
                }
                #sam-world-engine .we-section-head{margin-bottom:12px;padding-bottom:9px;border-bottom:1px solid #ecefed}
                #sam-world-engine .we-section-head h2{display:flex;align-items:center;gap:8px}
                #sam-world-engine .we-section-head h2:before{content:"";width:3px;height:16px;border-radius:3px;background:var(--gold);flex:none}
                #sam-world-engine .we-card{background:#f6f8f7;border:0;border-radius:10px;padding:13px 15px;margin:7px 0;box-shadow:none;transition:background .15s ease,transform .15s ease}
                #sam-world-engine button.we-card:hover,#sam-world-engine .we-card:hover{background:#f1f4f2}
                #sam-world-engine .we-section .we-card details{border-top:1px solid #e4e8e7}
                #sam-world-engine .we-card p,#sam-world-engine .we-person p{color:#657185}
                #sam-world-engine .we-card-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end}
                #sam-world-engine .we-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 14px}
                #sam-world-engine .we-kpi{min-width:0;padding:13px 15px;border:1px solid #dce2e3;border-radius:13px;background:#f9f8f3}
                #sam-world-engine .we-kpi small{display:block;color:#7e8793;font-size:10px;letter-spacing:1px}
                #sam-world-engine .we-kpi strong{display:block;margin:3px 0 1px;font:600 24px/1.1 Georgia,serif;color:#31445d}
                #sam-world-engine .we-kpi span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7b8491;font-size:10px}
                #sam-world-engine .we-dashboard{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,310px);gap:14px;align-items:start}
                #sam-world-engine .we-command-main,#sam-world-engine .we-command-side{min-width:0}
                #sam-world-engine .we-command-side{position:sticky;top:0}
                #sam-world-engine .we-pulse{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start}
                #sam-world-engine .we-pulse p{margin:0;color:#4f5f70;font-size:13px;line-height:1.8}
                #sam-world-engine .we-pulse-mark{margin-top:2px;padding:2px 6px;border-radius:4px;background:#4f7d6d;color:#fff;font:700 9px/1.5 system-ui;letter-spacing:1px}
                #sam-world-engine .we-calendar-layout{display:grid;grid-template-columns:minmax(235px,275px) minmax(0,1fr);gap:18px;align-items:start}
                #sam-world-engine .we-calendar{margin:0;background:transparent;border:0;border-radius:0;padding:4px 2px}
                #sam-world-engine .we-calendar-slot{position:sticky;top:0}
                #sam-world-engine .we-timeline-slot{min-width:0}
                #sam-world-engine .we-timeline-slot>.we-tools{margin:0 0 10px}
                #sam-world-engine .we-timeline{margin-left:4px;padding-left:15px}
                #sam-world-engine .we-timeline .we-card{padding:11px 13px}
                #sam-world-engine .we-timeline .we-card:before{left:-21px;top:17px;width:7px;height:7px;border-color:#fffdf8}
                #sam-world-engine .we-timeline-group{margin:0 0 14px}
                #sam-world-engine .we-timeline-group-title{display:flex;align-items:center;gap:7px;margin:8px 0 6px;color:#6f7b8c;font-size:10px;font-weight:700;letter-spacing:1.2px}
                #sam-world-engine .we-timeline-group-title:after{content:"";height:1px;background:#e2e6e4;flex:1}
                #sam-world-engine .we-timeline-group-title small{order:2;padding:1px 5px;border-radius:999px;background:#ecefea;color:#87909a;font-size:9px;letter-spacing:0}
                #sam-world-engine .we-date-filter{font-size:11px;color:var(--sub)}
                #sam-world-engine .we-next-node{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px}
                #sam-world-engine button.we-next-node{width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;border-radius:9px;transition:background .15s ease,transform .15s ease}
                #sam-world-engine button.we-next-node:hover{background:#f4f1e9;transform:translateX(2px)}
                #sam-world-engine .we-card.is-jump{outline:2px solid #c49a50;outline-offset:2px;background:#fbf4e5}
                #sam-world-engine .we-next-node>span{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#d5b06b;color:#21303d;font-weight:800}
                #sam-world-engine .we-next-node h3{margin:1px 0 4px}
                #sam-world-engine .we-next-node p{font-size:12px;color:#657185}
                #sam-world-engine .we-next-node small{color:#94753d;font-size:10px}
                #sam-world-engine .we-brief-row{display:grid;width:100%;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;text-align:left;border:0;border-bottom:1px solid #e7e9e7;background:transparent;padding:9px 2px}
                #sam-world-engine .we-brief-row:last-child{border-bottom:0}
                #sam-world-engine .we-brief-row{transition:background .15s ease,padding-left .15s ease}
                #sam-world-engine .we-brief-row:hover{padding-left:7px}
                #sam-world-engine .we-brief-row>b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
                #sam-world-engine .we-brief-row>span:last-child{grid-column:1/-1;color:#707b89;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                #sam-world-engine .we-brief-row:hover{background:#f4f5f1}
                #sam-world-engine .we-people-strip{display:grid;gap:5px}
                #sam-world-engine .we-person-compact{display:grid;grid-template-columns:32px minmax(0,1fr);gap:9px;align-items:center;width:100%;padding:7px;border:0;border-radius:9px;background:transparent;text-align:left}
                #sam-world-engine .we-person-compact{transition:background .15s ease,transform .15s ease}
                #sam-world-engine .we-person-compact:hover{background:#f3f5f1;transform:translateX(2px)}
                #sam-world-engine .we-person-compact .we-avatar{width:32px;height:32px;background:linear-gradient(145deg,#526c7c,#314656)}
                #sam-world-engine .we-person-copy{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 7px;min-width:0}
                #sam-world-engine .we-person-copy strong{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                #sam-world-engine .we-person-copy small{font-size:9px;color:#94753d;white-space:nowrap}
                #sam-world-engine .we-person-copy em{grid-column:1/-1;font-style:normal;font-size:10px;color:#75808d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                #sam-world-engine .we-link-btn{width:100%;margin-top:8px;border:0;background:transparent;color:#8b6a33;text-align:right;font-size:10px;padding:4px}
                #sam-world-engine .we-link-btn:hover{text-decoration:underline}
                #sam-world-engine .we-change{grid-template-columns:58px 1fr;padding:8px 0}
                #sam-world-engine .we-tools{margin:12px 0;gap:6px}
                #sam-world-engine .we-tools input{background:#f7f8f5;color:var(--ink);border-color:#d8dfdf;border-radius:9px}
                #sam-world-engine .we-tools button{border-color:#d9dfdf;background:#f8f9f6;border-radius:999px}
                #sam-world-engine .we-tools button.active{border-color:#b28a4a;background:#f4ead8;color:#795b2b}
                #sam-world-engine dl{grid-template-columns:92px minmax(0,1fr)}
                #sam-world-engine .we-empty{border-color:#dde2e1;background:#fafaf7}
                #sam-world-engine .we-empty b{color:#6f7b8c}
                #sam-world-engine .we-notice{color:#725f3d;background:#f7edda;border-left-color:#b28a4a;border-radius:0 10px 10px 0}
                #sam-world-engine textarea{background:#fbfaf6;color:var(--ink);border-color:#d8deda}
                #sam-world-engine footer{flex-shrink:0;background:#1f2d3a;color:#9eabb6;border-top:0;padding:7px 20px}
                #sam-world-engine .we-config-row{display:flex;flex-wrap:wrap;gap:18px;align-items:center}
                #sam-world-engine .we-config-row input{width:70px}
                #sam-world-engine select,#sam-world-engine .we-config-row input{font:inherit;padding:7px;border:1px solid #d8ddd8;border-radius:7px;background:#fff;color:var(--ink)}
                #sam-world-engine .we-book{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fffdf8}
                #sam-world-engine .we-book-list{max-height:320px;overflow:auto;margin-top:10px}
                #sam-world-engine .we-book-row{display:flex;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line);cursor:pointer}
                #sam-world-engine .we-book-title{flex:1;min-width:0;overflow-wrap:anywhere}
                #sam-world-engine .we-book-title small{display:block;color:var(--sub);font-size:11px}
                #sam-world-engine .we-read-state{max-width:135px;color:var(--sub);font-size:11px}
                #sam-world-engine .we-lamp{width:9px;height:9px;border-radius:50%;flex-shrink:0}
                #sam-world-engine .we-lamp.blue{background:#5794dd;box-shadow:0 0 0 4px #5794dd16}
                #sam-world-engine .we-lamp.green{background:#58a879;box-shadow:0 0 0 4px #58a87916}
                #sam-world-engine .we-lamp.gray{background:#a1a6ad}
                #sam-world-engine .we-request-summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
                #sam-world-engine .we-inspect-body{max-height:440px;overflow:auto;padding:10px 3px;overscroll-behavior:contain}
                #sam-world-engine .we-prose{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
                #sam-world-engine textarea.we-raw{min-height:180px;height:280px;max-height:400px;font:12px/1.8 monospace;white-space:pre-wrap}
                #sam-world-engine [data-segment]{min-height:180px;height:240px}
                #sam-world-engine summary{font-size:12px;line-height:1.7;transition:color .15s ease}
                #sam-world-engine summary:hover{color:#7d5f2d}
                #sam-world-engine .we-world-ranks{display:flex;flex-wrap:wrap;gap:8px 20px;margin:0 0 10px;color:var(--sub);font-size:13px}
                #sam-world-engine .we-world-ranks b{color:var(--we-ink,var(--ink));font-weight:600;margin-left:6px}
                #sam-world-engine .we-hero>div:first-child{min-width:0}
                #sam-world-engine .we-reading-section summary{cursor:pointer;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-weight:600}
                #sam-world-engine .we-reading-section summary small{font-weight:400;color:var(--sub)}
                #sam-world-engine .we-reading{max-width:80ch;margin:18px auto 4px;line-height:1.85;min-width:0}
                #sam-world-engine .we-reading article+article{border-top:1px solid var(--line);padding-top:18px;margin-top:18px}
                #sam-world-engine .we-reading article>small{color:var(--sub)}
                #sam-world-engine .we-reading p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.85}
                #sam-world-engine .we-world-laws{margin:0;line-height:1.6}
                #sam-world-engine .we-world-laws article+article{padding-top:8px;margin-top:8px}
                #sam-world-engine .we-world-laws p{margin:0;font-size:13px;line-height:1.6}
                #sam-world-engine .we-alien-count{margin:0 0 14px;align-items:center}
                #sam-world-engine .we-world-focus{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(285px,.75fr);gap:12px;margin-bottom:12px}
                #sam-world-engine .we-world-focus .we-section{height:100%;margin:0;border-color:#cfd9db;background:#fff;box-shadow:0 4px 14px #2231420b}
                #sam-world-engine .we-world-focus-main .we-section{border-left:4px solid #4f7d6d}
                #sam-world-engine .we-world-focus-next .we-section{border-left:4px solid #b28a4a}
                #sam-world-engine .we-kpi-compact{margin-bottom:12px}
                #sam-world-engine .we-kpi-compact .we-kpi{background:#fff;border-color:#cfd9db;box-shadow:0 3px 12px #22314208}
                #sam-world-engine .we-dashboard{grid-template-columns:minmax(0,1fr) minmax(285px,325px)}
                #sam-world-engine .we-dashboard .we-section{border-color:#d2dcdd;background:#fff}
                #sam-world-engine .we-timeline-board{box-shadow:none}
                #sam-world-engine .we-explore-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,330px);gap:12px;align-items:start}
                #sam-world-engine .we-explore-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
                #sam-world-engine .we-explore-card{display:block;width:100%;min-width:0;padding:13px;border:1px solid #d6dfe0;border-radius:12px;background:#fff;text-align:left;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
                #sam-world-engine .we-explore-card:hover{border-color:#b9c9c7;box-shadow:0 5px 16px #22314210;transform:translateY(-1px)}
                #sam-world-engine .we-explore-card.active{border-color:#b28a4a;box-shadow:0 0 0 2px #d9b97825}
                #sam-world-engine .we-explore-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
                #sam-world-engine .we-explore-head>div{min-width:0}
                #sam-world-engine .we-explore-head small{display:block;color:#8b949d;font-size:9px}
                #sam-world-engine .we-explore-head h3{margin:2px 0 0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                #sam-world-engine .we-risk-badge{flex:0 0 auto;padding:2px 7px;border:1px solid #d7dfe0;border-radius:999px;background:#f7f8f5;color:#536476;font-size:9px}
                #sam-world-engine .we-explore-score{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin:11px 0 5px}
                #sam-world-engine .we-explore-score strong{font:600 23px/1 Georgia,serif;color:#31475f}
                #sam-world-engine .we-explore-score strong small{display:inline;font:500 10px/1 system-ui;color:#7b8793}
                #sam-world-engine .we-explore-score span{font-size:10px;color:#8b6a33}
                #sam-world-engine .we-explore-bar{height:6px;overflow:hidden;border-radius:999px;background:#e8eceb}
                #sam-world-engine .we-explore-bar>i{display:block;height:100%;border-radius:999px;background:#6f9d8c}
                #sam-world-engine .we-explore-meta{display:flex;flex-wrap:wrap;gap:5px 9px;margin-top:9px;color:#788491;font-size:9px}
                #sam-world-engine .we-explore-card p{margin:8px 0 0;color:#657185;font-size:10px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
                #sam-world-engine .we-area-side{position:sticky;top:0}
                #sam-world-engine .we-area-hero{padding:2px 0 10px;border-bottom:1px solid #e2e7e6}
                #sam-world-engine .we-area-hero small{color:#8a939d;font-size:9px}
                #sam-world-engine .we-area-hero h3{margin:2px 0 8px;font-size:17px}
                #sam-world-engine .we-area-progress{display:grid;grid-template-columns:auto minmax(0,1fr);gap:11px;align-items:center}
                #sam-world-engine .we-area-progress>strong{font:600 31px/1 Georgia,serif;color:#30465f}
                #sam-world-engine .we-area-progress>div>span{display:flex;justify-content:space-between;color:#7b8791;font-size:9px;margin-bottom:5px}
                #sam-world-engine .we-area-progress em{font-style:normal;color:#8b6a33}
                #sam-world-engine .we-area-note{margin-top:10px;padding:9px 10px;border-radius:9px;background:#f5f7f3;color:#647180;font-size:10px;line-height:1.6}
                #sam-world-engine .we-faction-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
                #sam-world-engine .we-faction-card{display:block;width:100%;padding:12px 13px;border:1px solid #d6dfe0;border-radius:11px;background:#fff;text-align:left}
                #sam-world-engine .we-faction-card.active{border-color:#b28a4a;box-shadow:0 0 0 2px #d9b97822}
                #sam-world-engine .we-faction-card .we-card-top h3{font-size:13px}
                #sam-world-engine .we-rep{display:flex;justify-content:space-between;gap:8px;margin:8px 0 4px;font-size:10px;color:#788491}
                #sam-world-engine .we-rep b{color:#8b6a33}
                #sam-world-engine .we-preset-toolbar{position:sticky;top:-1px;z-index:8;display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 14px;padding:12px 14px;border:1px solid #c7d2d4;border-radius:13px;background:#fffdf9f2;backdrop-filter:blur(10px);box-shadow:0 8px 22px #22314212}
                #sam-world-engine .we-preset-toolbar>div:first-child{display:flex;flex-direction:column;min-width:0}
                #sam-world-engine .we-preset-toolbar b{font-size:14px;color:#2c3e50}
                #sam-world-engine .we-preset-toolbar small{font-size:10px;color:var(--sub)}
                #sam-world-engine .we-preset-toolbar>div:last-child{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
                #sam-world-engine .we-doc-create{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:8px;margin-bottom:10px}
                #sam-world-engine .we-doc-create input{min-width:0;padding:8px 10px;border:1px solid #d4dcdd;border-radius:9px;background:#fff;color:var(--ink)}
                #sam-world-engine .we-doc-list{display:grid;gap:7px}
                #sam-world-engine .we-doc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 11px;border:1px solid #d9e1e1;border-radius:10px;background:#fafbf8}
                #sam-world-engine .we-doc-row>div{min-width:0}
                #sam-world-engine .we-doc-row b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                #sam-world-engine .we-doc-row small{display:block;color:var(--sub);font-size:10px;margin-top:2px}
                #sam-world-engine .we-doc-badge{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#e8f1ec;color:#4f7d6d;font:700 9px/1.6 system-ui}
                #sam-world-engine .we-doc-actions{display:flex;gap:5px}
                #sam-world-engine .we-doc-actions button,#sam-world-engine .we-segment-actions button{border:1px solid #d2dbdc;border-radius:7px;background:#fff;padding:5px 8px;color:#556579;font-size:10px}
                #sam-world-engine .we-doc-actions button:hover,#sam-world-engine .we-segment-actions button:hover{border-color:#b28a4a;color:#76592b;background:#fbf4e8}
                #sam-world-engine .we-segment-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px;color:var(--sub);font-size:11px}
                #sam-world-engine .we-segment-list{display:grid;gap:10px}
                #sam-world-engine .we-segment{border:1px solid #d3dddd;border-radius:12px;background:#fbfcf9;overflow:hidden}
                #sam-world-engine .we-segment-head{display:grid;grid-template-columns:minmax(140px,1fr) auto auto;gap:8px;align-items:center;padding:9px 10px;border-bottom:1px solid #dce4e4;background:#f1f5f2}
                #sam-world-engine .we-segment-head input{min-width:0;border:0;border-bottom:1px solid #c6d1d2;background:transparent;padding:4px 2px;font-weight:700;color:#31445d}
                #sam-world-engine .we-segment-head input:focus{outline:none;border-bottom-color:#b28a4a}
                #sam-world-engine .we-segment-head small{color:var(--sub);font-size:10px}
                #sam-world-engine .we-segment-actions{display:flex;gap:4px}
                #sam-world-engine .we-segment>summary{padding:12px;cursor:pointer;color:var(--we-ink)}
                #sam-world-engine .we-segment textarea{display:block;width:100%;min-height:170px;height:210px;border:0;border-radius:0;background:#fff;padding:12px 13px;resize:vertical}
                /* ===== 世界引擎独立外观：跟随主神终端六色调；未设置时回退暗夜 ===== */
                ${WORLD_UI_THEME_CSS}
                #sam-world-engine[data-tone]{
                    --ink:var(--we-ink);--sub:var(--we-sub);--line:var(--we-line);--gold:var(--we-gold);--mint:var(--we-mint);
                    --we-chrome-ink:#f7fbff;--we-chrome-sub:#c9d3dd;--we-nav-ink:#d6dee7;
                    --we-chrome-control:#ffffff0d;--we-chrome-control-hover:#ffffff18;--we-chrome-border:#ffffff2d;
                    --we-fs-root:16px;--we-fs-body:15px;--we-fs-small:13px;--we-fs-tiny:13px;--we-fs-control:14px;
                    --we-fs-h1:29px;--we-fs-h2:19px;--we-fs-h3:16px;--we-fs-metric:26px;--we-fs-hero:32px;
                    background:var(--we-shell)!important;color:var(--we-ink)!important;border-color:var(--we-line)!important;
                    font-size:var(--we-fs-root)!important;line-height:1.72!important;text-rendering:optimizeLegibility;-webkit-font-smoothing:auto
                }
                #sam-world-engine[data-font-scale="large"]{
                    --we-fs-root:18px;--we-fs-body:17px;--we-fs-small:15px;--we-fs-tiny:14px;--we-fs-control:16px;
                    --we-fs-h1:33px;--we-fs-h2:22px;--we-fs-h3:18px;--we-fs-metric:30px;--we-fs-hero:35px
                }
                #sam-world-engine[data-font-scale="xlarge"]{
                    --we-fs-root:20px;--we-fs-body:19px;--we-fs-small:17px;--we-fs-tiny:15px;--we-fs-control:18px;
                    --we-fs-h1:36px;--we-fs-h2:24px;--we-fs-h3:20px;--we-fs-metric:34px;--we-fs-hero:39px
                }
                .we-causal{min-width:0;overflow-wrap:anywhere}
                .we-stability{display:flex;align-items:center;justify-content:space-between;gap:12px}
                .we-stability strong{display:block;font-size:var(--we-fs-hero);line-height:1.3;color:var(--we-ink)}
                .we-stability>span{font-size:var(--we-fs-small);color:var(--we-sub);text-align:right}
                .we-causal meter{display:block;width:100%;height:14px;margin:12px 0;accent-color:var(--we-mint)}
                .we-causal meter::-webkit-meter-bar{background:var(--we-card);border:1px solid var(--we-line);border-radius:9px}
                .we-causal meter::-webkit-meter-optimum-value{background:var(--we-mint)}
                .we-offset-heading,.we-offset-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
                .we-offset-heading{margin-top:16px;font-weight:600}
                .we-offset-heading span,.we-offset small{color:var(--we-sub);font-size:var(--we-fs-small)}
                .we-offset{margin-top:10px;padding:12px;border:1px solid var(--we-line);border-radius:12px;background:var(--we-card)}
                .we-offset-head span{flex-shrink:0;font-weight:700;color:var(--we-ink)}
                .we-offset p{margin:8px 0;font-size:var(--we-fs-body)}
                .we-offset-more summary{cursor:pointer;margin-top:12px;color:var(--we-ink)}
                #sam-world-engine[data-tone] header{background:linear-gradient(120deg,var(--we-head),var(--we-nav))!important;color:var(--we-chrome-ink)!important}
                #sam-world-engine[data-tone] .we-brand i{color:var(--we-action)!important}
                #sam-world-engine[data-tone] .we-brand small{color:var(--we-chrome-sub)!important}
                #sam-world-engine[data-tone] header button.we-btn{background:var(--we-chrome-control)!important;border-color:var(--we-chrome-border)!important;color:var(--we-chrome-ink)!important}
                #sam-world-engine[data-tone] header button.we-btn:hover{background:var(--we-chrome-control-hover)!important;border-color:var(--we-chrome-sub)!important}
                #sam-world-engine[data-tone] header button.we-primary{background:var(--we-action)!important;border-color:var(--we-action)!important;color:var(--we-action-ink)!important}
                #sam-world-engine[data-tone] nav{background:var(--we-nav)!important;border-color:var(--we-line)!important}
                #sam-world-engine[data-tone] nav button{color:var(--we-nav-ink)!important}
                #sam-world-engine[data-tone] nav button:hover{background:var(--we-chrome-control-hover)!important;color:var(--we-chrome-ink)!important}
                #sam-world-engine[data-tone] nav button[aria-selected=true]{background:var(--we-action)!important;border-color:var(--we-action)!important;color:var(--we-action-ink)!important}
                #sam-world-engine[data-tone] main{background:var(--we-main)!important;color:var(--we-ink)!important}
                #sam-world-engine[data-tone] .we-hero,
                #sam-world-engine[data-tone] .we-section,
                #sam-world-engine[data-tone] .we-world-focus .we-section,
                #sam-world-engine[data-tone] .we-dashboard .we-section{background:var(--we-surface)!important;border-color:var(--we-line)!important;box-shadow:none!important}
                #sam-world-engine[data-tone] .we-card,
                #sam-world-engine[data-tone] .we-kpi,
                #sam-world-engine[data-tone] .we-kpi-compact .we-kpi,
                #sam-world-engine[data-tone] .we-explore-card,
                #sam-world-engine[data-tone] .we-faction-card,
                #sam-world-engine[data-tone] .we-doc-row,
                #sam-world-engine[data-tone] .we-segment,
                #sam-world-engine[data-tone] .we-book{background:var(--we-card)!important;border-color:var(--we-line)!important;color:var(--we-ink)!important}
                #sam-world-engine[data-tone] .we-card:hover,
                #sam-world-engine[data-tone] button.we-card:hover,
                #sam-world-engine[data-tone] .we-explore-card:hover,
                #sam-world-engine[data-tone] .we-faction-card:hover,
                #sam-world-engine[data-tone] .we-brief-row:hover,
                #sam-world-engine[data-tone] .we-person-compact:hover{background:var(--we-card-hover)!important}
                #sam-world-engine[data-tone] .we-card p,
                #sam-world-engine[data-tone] .we-person p,
                #sam-world-engine[data-tone] .we-pulse p,
                #sam-world-engine[data-tone] .we-next-node p,
                #sam-world-engine[data-tone] .we-explore-card p{color:var(--we-sub)!important}
                #sam-world-engine[data-tone] .we-kpi strong,
                #sam-world-engine[data-tone] .we-explore-score strong,
                #sam-world-engine[data-tone] .we-area-progress>strong{color:var(--we-ink)!important}
                #sam-world-engine[data-tone] .we-kpi small,
                #sam-world-engine[data-tone] .we-kpi span,
                #sam-world-engine[data-tone] .we-explore-head small,
                #sam-world-engine[data-tone] .we-explore-meta,
                #sam-world-engine[data-tone] .we-area-hero small{color:var(--we-sub)!important}
                #sam-world-engine[data-tone] .we-tools input,
                #sam-world-engine[data-tone] select,
                #sam-world-engine[data-tone] .we-config-row input,
                #sam-world-engine[data-tone] .we-doc-create input,
                #sam-world-engine[data-tone] .we-segment-head input,
                #sam-world-engine[data-tone] textarea,
                #sam-world-engine[data-tone] .we-setting-input{background:var(--we-input)!important;color:var(--we-ink)!important;border-color:var(--we-line)!important}
                #sam-world-engine[data-tone] .we-tools button,
                #sam-world-engine[data-tone] .we-doc-actions button,
                #sam-world-engine[data-tone] .we-segment-actions button,
                #sam-world-engine[data-tone] .we-setting-btn{background:var(--we-card)!important;color:var(--we-ink)!important;border-color:var(--we-line)!important}
                #sam-world-engine[data-tone] .we-tools button.active,
                #sam-world-engine[data-tone] .we-setting-btn.active{border-color:var(--we-accent)!important;color:var(--we-accent)!important;background:var(--we-accent-soft)!important}
                #sam-world-engine[data-tone] .we-empty{background:var(--we-card)!important;border-color:var(--we-line)!important}
                #sam-world-engine[data-tone] .we-empty b{color:var(--we-ink)!important}
                #sam-world-engine[data-tone] .we-notice{background:var(--we-notice)!important;color:var(--we-ink)!important;border-left-color:var(--we-gold)!important}
                #sam-world-engine[data-tone] footer{background:var(--we-nav)!important;color:var(--we-chrome-sub)!important}
                #sam-world-engine[data-tone] .we-timeline .we-card:before{border-color:var(--we-surface)!important}
                #sam-world-engine[data-tone] .we-timeline-group-title:after{background:var(--we-line)!important}
                #sam-world-engine[data-tone] .we-explore-bar{background:color-mix(in srgb,var(--we-line) 70%,transparent)!important}
                #sam-world-engine[data-tone] .we-explore-bar>i{background:var(--we-mint)!important}
                #sam-world-engine[data-tone] .we-risk-badge{background:var(--we-input)!important;color:var(--we-sub)!important;border-color:var(--we-line)!important}
                #sam-world-engine[data-tone] .we-preset-toolbar{background:var(--we-surface)!important;border-color:var(--we-line)!important;box-shadow:none!important}
                #sam-world-engine[data-tone] .we-segment-head{background:var(--we-card)!important;border-color:var(--we-line)!important}
                #sam-world-engine[data-tone] .we-book-row,
                #sam-world-engine[data-tone] .we-brief-row,
                #sam-world-engine[data-tone] .we-section-head,
                #sam-world-engine[data-tone] .we-area-hero{border-color:var(--we-line)!important}
                #sam-world-engine[data-tone] .we-next-node>span{background:var(--we-action)!important;color:var(--we-action-ink)!important}
                #sam-world-engine[data-tone] button.we-next-node:hover{background:var(--we-card-hover)!important}
                #sam-world-engine[data-tone] .we-next-node small,
                #sam-world-engine[data-tone] .we-person-copy small,
                #sam-world-engine[data-tone] .we-link-btn,
                #sam-world-engine[data-tone] .we-explore-score span,
                #sam-world-engine[data-tone] .we-area-progress em,
                #sam-world-engine[data-tone] .we-rep b{color:var(--we-gold)!important}
                #sam-world-engine[data-tone] .we-timeline-group-title,
                #sam-world-engine[data-tone] .we-timeline-group-title small,
                #sam-world-engine[data-tone] .we-brief-row>span:last-child,
                #sam-world-engine[data-tone] .we-person-copy em,
                #sam-world-engine[data-tone] .we-area-progress>div>span{color:var(--we-sub)!important}
                #sam-world-engine[data-tone] .we-timeline-group-title small{background:var(--we-card)!important}
                #sam-world-engine[data-tone] .we-preset-toolbar b{color:var(--we-ink)!important}
                #sam-world-engine[data-tone] summary:hover{color:var(--we-accent)!important}
                #sam-world-engine[data-tone] .we-card.is-jump{outline-color:var(--we-action)!important;background:var(--we-accent-soft)!important}
                /* 全面字号系统：字号设置必须作用于整个面板，而不是只影响继承 root 字号的按钮 */
                #sam-world-engine[data-tone] main{font-size:var(--we-fs-body)!important}
                #sam-world-engine[data-tone] .we-brand{font-size:var(--we-fs-h3)!important;line-height:1.2!important}
                #sam-world-engine[data-tone] .we-hero .we-date{font-size:var(--we-fs-h3)!important;line-height:1.45!important}
                #sam-world-engine[data-tone] .we-world-ranks{font-size:var(--we-fs-small)!important}
                #sam-world-engine[data-tone] header button,
                #sam-world-engine[data-tone] nav button,
                #sam-world-engine[data-tone] main button,
                #sam-world-engine[data-tone] main input,
                #sam-world-engine[data-tone] main select,
                #sam-world-engine[data-tone] main textarea{font-size:var(--we-fs-control)!important}
                #sam-world-engine[data-tone] h1{font-size:var(--we-fs-h1)!important;line-height:1.28!important}
                #sam-world-engine[data-tone] h2{font-size:var(--we-fs-h2)!important;line-height:1.35!important}
                #sam-world-engine[data-tone] h3,
                #sam-world-engine[data-tone] .we-explore-head h3,
                #sam-world-engine[data-tone] .we-faction-card .we-card-top h3,
                #sam-world-engine[data-tone] .we-area-hero h3{font-size:var(--we-fs-h3)!important;line-height:1.4!important}
                #sam-world-engine[data-tone] main p,
                #sam-world-engine[data-tone] .we-card p,
                #sam-world-engine[data-tone] .we-person p,
                #sam-world-engine[data-tone] .we-pulse p,
                #sam-world-engine[data-tone] .we-next-node p,
                #sam-world-engine[data-tone] .we-explore-card p,
                #sam-world-engine[data-tone] .we-prose,
                #sam-world-engine[data-tone] .we-area-note,
                #sam-world-engine[data-tone] .we-rep{font-size:var(--we-fs-body)!important;line-height:1.68!important}
                #sam-world-engine[data-tone] .we-muted,
                #sam-world-engine[data-tone] dl,
                #sam-world-engine[data-tone] summary,
                #sam-world-engine[data-tone] .we-meta,
                #sam-world-engine[data-tone] .we-hero .we-date small,
                #sam-world-engine[data-tone] .we-metric small,
                #sam-world-engine[data-tone] .we-section-head small,
                #sam-world-engine[data-tone] .we-date-filter,
                #sam-world-engine[data-tone] .we-brief-row>b,
                #sam-world-engine[data-tone] .we-person-copy strong,
                #sam-world-engine[data-tone] .we-book-title small,
                #sam-world-engine[data-tone] .we-read-state,
                #sam-world-engine[data-tone] .we-segment-toolbar{font-size:var(--we-fs-small)!important}
                #sam-world-engine[data-tone] small,
                #sam-world-engine[data-tone] footer,
                #sam-world-engine[data-tone] .we-brand small,
                #sam-world-engine[data-tone] nav .we-navtitle,
                #sam-world-engine[data-tone] .we-eyebrow,
                #sam-world-engine[data-tone] .we-pill,
                #sam-world-engine[data-tone] .we-change time,
                #sam-world-engine[data-tone] .we-days span,
                #sam-world-engine[data-tone] .we-pulse-mark,
                #sam-world-engine[data-tone] .we-timeline-group-title,
                #sam-world-engine[data-tone] .we-timeline-group-title small,
                #sam-world-engine[data-tone] .we-next-node small,
                #sam-world-engine[data-tone] .we-brief-row>span:last-child,
                #sam-world-engine[data-tone] .we-person-copy small,
                #sam-world-engine[data-tone] .we-person-copy em,
                #sam-world-engine[data-tone] .we-link-btn,
                #sam-world-engine[data-tone] .we-explore-head small,
                #sam-world-engine[data-tone] .we-risk-badge,
                #sam-world-engine[data-tone] .we-explore-score strong small,
                #sam-world-engine[data-tone] .we-explore-score span,
                #sam-world-engine[data-tone] .we-explore-meta,
                #sam-world-engine[data-tone] .we-area-hero small,
                #sam-world-engine[data-tone] .we-area-progress>div>span,
                #sam-world-engine[data-tone] .we-preset-toolbar small,
                #sam-world-engine[data-tone] .we-doc-row small,
                #sam-world-engine[data-tone] .we-doc-badge,
                #sam-world-engine[data-tone] .we-segment-head small,
                #sam-world-engine[data-tone] .we-setting-copy small,
                #sam-world-engine[data-tone] .we-api-grid label,
                #sam-world-engine[data-tone] .we-source-badge{font-size:var(--we-fs-tiny)!important;line-height:1.55!important}
                #sam-world-engine[data-tone] .we-kpi strong,
                #sam-world-engine[data-tone] .we-explore-score strong{font-size:var(--we-fs-metric)!important}
                #sam-world-engine[data-tone] .we-area-progress>strong{font-size:var(--we-fs-hero)!important}
                #sam-world-engine[data-tone] textarea.we-raw{font-size:var(--we-fs-small)!important}
                #sam-world-engine[data-tone] .we-person strong,
                #sam-world-engine[data-tone] .we-preset-toolbar b,
                #sam-world-engine[data-tone] .we-setting-copy b{font-size:var(--we-fs-body)!important}
                #sam-world-engine[data-tone] .we-doc-actions button,
                #sam-world-engine[data-tone] .we-segment-actions button{font-size:var(--we-fs-tiny)!important}
                /* 区域档案说明卡跟随主题，避免暗色下出现刺眼白框和灰字 */
                #sam-world-engine[data-tone] .we-area-note{
                    background:var(--we-input)!important;color:var(--we-ink)!important;border:1px solid var(--we-line)!important;
                    font-weight:500!important
                }
                /* 设置页 */
                #sam-world-engine .we-setting-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(220px,1.2fr);gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid var(--we-line,var(--line))}
                #sam-world-engine .we-setting-row:last-child{border-bottom:0}
                #sam-world-engine .we-setting-copy b{display:block;font-size:14px}
                #sam-world-engine .we-setting-copy small{display:block;color:var(--we-sub,var(--sub));font-size:11px;margin-top:3px}
                #sam-world-engine .we-setting-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}
                #sam-world-engine .we-setting-btn{border:1px solid var(--we-line,var(--line));border-radius:8px;padding:7px 10px}
                #sam-world-engine .we-api-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
                #sam-world-engine .we-api-grid label{display:flex;flex-direction:column;gap:5px;color:var(--we-sub,var(--sub));font-size:11px}
                #sam-world-engine .we-api-grid label.wide{grid-column:1/-1}
                #sam-world-engine .we-setting-input{width:100%;min-width:0;padding:9px 10px;border:1px solid var(--we-line,var(--line));border-radius:8px}
                #sam-world-engine .we-api-toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:10px 0}
                #sam-world-engine .we-api-toolbar select,#sam-world-engine .we-api-toolbar input{min-width:160px;flex:1}
                #sam-world-engine .we-source-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border-radius:999px;border:1px solid var(--we-line,var(--line));background:var(--we-card,#fff);font-size:11px}
                #sam-world-engine .we-source-badge:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--we-mint,var(--mint))}
                #sam-world-engine .we-switch{display:inline-flex;align-items:center;gap:8px}
                #sam-world-engine .we-switch-track{width:42px;height:23px;border-radius:999px;background:var(--we-line,var(--line));padding:3px;transition:background .15s}
                #sam-world-engine .we-switch-track i{display:block;width:17px;height:17px;border-radius:50%;background:#fff;transition:transform .15s}
                #sam-world-engine .we-switch.on .we-switch-track{background:var(--we-accent,var(--gold))}
                #sam-world-engine .we-switch.on .we-switch-track i{transform:translateX(19px)}
                @media(max-width:1100px){
                    #sam-world-engine .we-world-focus{grid-template-columns:1fr}
                    #sam-world-engine .we-dashboard{grid-template-columns:1fr}
                    #sam-world-engine .we-explore-layout{grid-template-columns:1fr}
                    #sam-world-engine .we-area-side{position:static}
                    #sam-world-engine .we-command-side{position:static;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
                    #sam-world-engine .we-command-side>.we-section{margin-bottom:0}
                    #sam-world-engine .we-calendar-layout{grid-template-columns:minmax(220px,260px) minmax(0,1fr)}
                }
                @media(max-width:760px){
                    #sam-world-engine{--we-safe-top:max(env(safe-area-inset-top,0px),24px);--we-safe-right:env(safe-area-inset-right,0px);--we-safe-bottom:env(safe-area-inset-bottom,0px);--we-safe-left:env(safe-area-inset-left,0px);inset:0!important;height:100vh!important;height:100dvh!important;border-radius:0}
                    #sam-world-engine header{padding:var(--we-safe-top) max(12px,var(--we-safe-right)) 0 max(12px,var(--we-safe-left));height:calc(56px + var(--we-safe-top));min-height:calc(56px + var(--we-safe-top));gap:6px}
                    #sam-world-engine .we-brand{font-size:13px;letter-spacing:1px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                    #sam-world-engine .we-brand small{display:none}
                    #sam-world-engine nav{padding:7px max(9px,var(--we-safe-right)) 7px max(9px,var(--we-safe-left));min-height:46px}
                    #sam-world-engine nav button{padding:7px 10px}
                    #sam-world-engine nav button .we-tab-icon{display:none}
                    #sam-world-engine main{padding:12px max(10px,var(--we-safe-right)) calc(24px + var(--we-safe-bottom)) max(10px,var(--we-safe-left))}
                    #sam-world-engine .we-hero{align-items:flex-start;padding:14px}
                    #sam-world-engine h1{font-size:21px}
                    #sam-world-engine .we-hero .we-date{min-width:105px;font-size:11px}
                    #sam-world-engine .we-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
                    #sam-world-engine .we-explore-grid,#sam-world-engine .we-faction-grid{grid-template-columns:1fr}
                    #sam-world-engine .we-preset-toolbar{align-items:flex-start}
                    #sam-world-engine .we-doc-create{grid-template-columns:1fr 1fr}
                    #sam-world-engine .we-doc-create input{grid-column:1/-1}
                    #sam-world-engine .we-doc-row{grid-template-columns:1fr}
                    #sam-world-engine .we-doc-actions{flex-wrap:wrap}
                    #sam-world-engine .we-segment-head{grid-template-columns:1fr auto}
                    #sam-world-engine .we-segment-head small{display:none}
                    #sam-world-engine .we-segment-actions{grid-column:1/-1}
                    #sam-world-engine .we-command-side{display:block}
                    #sam-world-engine .we-command-side>.we-section{margin-bottom:10px}
                    #sam-world-engine .we-calendar-layout{grid-template-columns:1fr}
                    #sam-world-engine .we-calendar-slot{position:static}
                    #sam-world-engine .we-grid{grid-template-columns:1fr}
                    #sam-world-engine .we-section{padding:13px}
                    #sam-world-engine footer{padding:7px max(10px,var(--we-safe-right)) calc(7px + var(--we-safe-bottom)) max(10px,var(--we-safe-left))}
                    #sam-world-engine footer small{display:none}
                    #sam-world-engine .we-setting-row{grid-template-columns:1fr}
                    #sam-world-engine .we-setting-actions{justify-content:flex-start}
                    #sam-world-engine .we-api-grid{grid-template-columns:1fr}
                    #sam-world-engine .we-api-grid label.wide{grid-column:auto}
                }
                @media(max-height:400px){
                    #sam-world-engine header{height:calc(40px + var(--we-safe-top,0px));min-height:calc(40px + var(--we-safe-top,0px))}
                    #sam-world-engine nav{padding:3px 8px;min-height:36px}
                    #sam-world-engine footer{padding:2px 12px}
                    #sam-world-engine main{padding:8px}
                }
            `;
            this.panel=doc.createElement('section');this.panel.id='sam-world-engine';this.panel.hidden=true;
            this.panel.dataset.tone=this.statusTone();this.panel.dataset.fontScale=this.config.fontScale||'standard';
            this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-label','世界引擎');
            this.panel.innerHTML='<header><div class="we-brand"><i>◈</i>世界引擎<small>WORLD CHRONICLE</small></div><button class="we-btn we-primary" data-action="run">推进世界</button><button class="we-btn" data-action="close" aria-label="返回主神终端">返回 ↗</button></header><div class="we-layout"><nav></nav><main></main></div><footer><span></span><small>剧情时间驱动 · 由主神终端「世界推进」总开关控制</small></footer>';
            this.panel.addEventListener('click',event=>{
                const button=event.target.closest('button');if(!button)return;
                const a=button.dataset.action;
                if(button.dataset.directory){this.directoryTab=button.dataset.directory;this.render();return;}
                if(button.dataset.area){this.selectedArea=button.dataset.area;this.directoryTab='探索';this.render();return;}
                if(button.dataset.faction){if(button.hasAttribute('data-asset-owner'))this.tab='探索与势力';this.selectedFaction=button.dataset.faction;this.directoryTab='势力';this.render();return;}
                if(button.dataset.jumpPerson){this.selectedPerson=button.dataset.jumpPerson;this.tab='角色管理';this.filter='全部';this.query='';this.selectedDate='';this.render(true);return;}
                if(button.dataset.jumpEvent){
                    this.jumpEvent=button.dataset.jumpEvent;this.tab='世界推进';this.filter='全部';this.query='';
                    const world=this.snapshot().stat.世界,event=world[PATH]?.事件?.[this.jumpEvent],calendar=world.历法;
                    const date=calendarDate(event?.时间||event?.开始时间,calendar),today=calendarDate(world.时间,calendar);
                    const monthsPerYear=Array.isArray(calendar?.月份天数)&&calendar.月份天数.length?calendar.月份天数.length:12;
                    this.selectedDate=date?.key||'';this.calendarMode=date?'date':'undated';
                    this.monthOffset=date&&today?(date.y-today.y)*monthsPerYear+date.m-today.m:0;
                    this.eventLimit=Number.MAX_SAFE_INTEGER;this.render(true);return;
                }
                if(button.dataset.person){this.selectedPerson=button.dataset.person;this.render();return;}
                if(a==='close')this.close();
                else if(a==='run'){
                    if(this.busy){if(!this.committing){this.cancel();this.status='已请求停止';this.render();}}
                    else this.run().catch(()=>{});
                }
                else if(a==='cancel'){this.cancel();this.status='已请求停止';this.render();}
                else if(a==='save'){
                    const settings=this.readPromptEditor();
                    this.applyPromptSettings(settings);
                    this.promptDraft=null;
                    this.status='提示词与资料范围已保存';
                    this.panel.querySelector('footer span').textContent=this.status;
                }
                else if(a==='prompt-edit'){
                    this.promptEditing=!this.promptEditing;
                    button.textContent=this.promptEditing?'锁定编辑':'开启编辑';button.setAttribute('aria-pressed',String(this.promptEditing));
                    this.panel.querySelectorAll('[data-segment-title],[data-segment],[data-structure-prompt],[data-npc-audit-prompt]').forEach(el=>el.readOnly=!this.promptEditing);
                    this.panel.querySelectorAll('[data-action^="segment-"]').forEach(el=>el.disabled=!this.promptEditing);
                }
                else if(a==='save-default'){
                    const settings=this.readPromptEditor();this.applyPromptSettings(settings);
                    this.config.userDefaultPromptSettings=copy(settings);
                    const docs=this.getPromptDocuments();
                    let doc=docs.find(d=>d.id===USER_DEFAULT_PROMPT_DOCUMENT_ID);
                    const now=new Date().toISOString();
                    if(doc){doc.settings=copy(settings);doc.updatedAt=now;}
                    else docs.push({id:USER_DEFAULT_PROMPT_DOCUMENT_ID,type:'samsara-world-prompt-document',version:1,builtin:false,name:'个人默认设置',createdAt:now,updatedAt:now,settings:copy(settings)});
                    this.config.activePromptDocumentId=USER_DEFAULT_PROMPT_DOCUMENT_ID;
                    this.saveConfig();this.status='已保存为个人默认设置';this.panel.querySelector('footer span').textContent=this.status;
                }
                else if(a==='segment-add'){
                    if(!this.promptEditing)return;
                    const list=this.panel.querySelector('[data-segment-list]');if(!list)return;
                    const row=this.host.document.createElement('details');row.open=true;row.className='we-segment';row.setAttribute('data-segment-row','');
                    row.innerHTML='<summary>新分段</summary><div class="we-segment-head"><input data-segment-title aria-label="分段标题" placeholder="分段标题（可留空）"><small>新分段</small><span class="we-segment-actions"><button type="button" data-action="segment-up" title="上移">↑</button><button type="button" data-action="segment-down" title="下移">↓</button><button type="button" data-action="segment-delete" title="删除">删除</button></span></div><textarea data-segment data-title="" aria-label="新分段正文" placeholder="输入这一段的提示词正文…"></textarea>';
                    list.appendChild(row);row.querySelector('[data-segment-title]').focus();
                }
                else if(a==='segment-up'||a==='segment-down'){
                    if(!this.promptEditing)return;
                    const row=button.closest('[data-segment-row]'),parent=row?.parentElement;if(!row||!parent)return;
                    if(a==='segment-up'&&row.previousElementSibling)parent.insertBefore(row,row.previousElementSibling);
                    if(a==='segment-down'&&row.nextElementSibling)parent.insertBefore(row.nextElementSibling,row);
                }
                else if(a==='segment-delete'){if(!this.promptEditing)return;button.closest('[data-segment-row]')?.remove();}
                else if(a==='doc-save'){
                    try{
                        const settings=this.readPromptEditor(),name=this.panel.querySelector('[data-doc-name]')?.value||'';
                        this.applyPromptSettings(settings);
                        const doc=this.savePromptDocument(name,settings);this.promptDraft=null;
                        this.status='已保存预设文档：'+doc.name;this.render(true);
                    }catch(e){this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}
                }
                else if(a==='doc-apply'){
                    const doc=this.getPromptDocuments().find(item=>item.id===button.dataset.docId);if(!doc)return;
                    this.applyPromptSettings(doc.settings);this.config.activePromptDocumentId=doc.id;
                    if(doc.id===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id){
                        this.config.builtinDefaultWorldbookExclusionsApplied=[];
                        this.applyBuiltinDefaultWorldbookExclusions(this.bookCatalogue||[]);
                    }
                    this.saveConfig();this.promptDraft=null;
                    this.status='已应用预设文档：'+doc.name+(Array.isArray(doc.settings?.selectedEntries)&&!(this.bookCatalogue||[]).length?' · 世界书勾选将在加载目录后显示':'');
                    this.render(true);
                }
                else if(a==='doc-export'){
                    try{this.exportPromptDocument(button.dataset.docId);this.status='预设文档已导出';this.panel.querySelector('footer span').textContent=this.status;}
                    catch(e){this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}
                }
                else if(a==='doc-delete'){
                    this.promptDraft=this.readPromptEditor();
                    const doc=this.getPromptDocuments().find(item=>item.id===button.dataset.docId);
                    if(this.deletePromptDocument(button.dataset.docId)){this.status='已删除预设文档'+(doc?'：'+doc.name:'');this.render(true);}
                }
                else if(a==='doc-import'){
                    this.promptDraft=this.readPromptEditor();
                    const input=this.panel.querySelector('[data-doc-import]');if(input){input.value='';input.click();}
                }
                else if(a==='books'){
                    this.promptDraft=this.readPromptEditor();
                    this.catalogue().then(list=>{this.bookCatalogue=list;this.render(true);}).catch(e=>{this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;});
                }
                else if(a==='book-all'||a==='book-none'){this.panel.querySelectorAll('[data-book]').forEach(e=>{e.checked=a==='book-all'&&!e.disabled;});}
                else if(a==='preview'){
                    const settings=this.tab==='提示词预设'?this.readPromptEditor():null;
                    if(settings)this.applyPromptSettings(settings);
                    this.promptDraft=null;
                    this.buildRequest(this.snapshot()).then(r=>{this.previewRequest=r;this.tab='请求检查';this.render(true);}).catch(e=>{this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;});
                }
                else if(button.dataset.fontOption){
                    const scale=button.dataset.fontOption;
                    if(WORLD_FONT_SCALES[scale]){this.config.fontScale=scale;this.panel.dataset.fontScale=scale;this.saveConfig();this.status='界面字号已切换为 '+WORLD_FONT_SCALES[scale].name;this.render(true);}
                }
                else if(a==='dedicated-toggle'){
                    this.cancel();
                    const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
                    api.enabled=!api.enabled;this.config.dedicatedApi=api;
                    if(!api.enabled&&this.isConfigured()){
                        const terminal=this.host.Samsara&&this.host.Samsara.terminal;
                        if(terminal&&typeof terminal.enableApi==='function')terminal.enableApi();
                    }
                    this.saveConfig();
                    this.status=api.enabled?'已启用世界推进专属 API · 不再使用主神终端 API':'已关闭专属 API · 回退使用主神终端 API';
                    this.render(true);
                }
                else if(a==='dedicated-models'){
                    this.status='正在加载专属 API 模型列表';this.panel.querySelector('footer span').textContent=this.status;
                    this.fetchDedicatedModels().then(list=>{this.status='已加载 '+list.length+' 个模型';this.render(true);}).catch(e=>{this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;});
                }
                else if(a==='dedicated-preset-save'){
                    try{
                        const name=this.panel.querySelector('[data-dedicated-preset-name]')?.value||'';
                        const entry=this.saveDedicatedApiPreset(name);
                        this.status='已保存 API 预设：'+entry.name;this.render(true);
                    }catch(e){this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}
                }
                else if(a==='dedicated-preset-delete'){
                    const name=this.panel.querySelector('[data-dedicated-preset]')?.value||'';
                    if(!name){this.status='请先选择要删除的 API 预设';this.panel.querySelector('footer span').textContent=this.status;}
                    else if(this.deleteDedicatedApiPreset(name)){this.status='已删除 API 预设：'+name;this.render(true);}
                }
                else if(a==='month'){
                    this.monthOffset=(this.monthOffset||0)+Number(button.dataset.step);
                    const world=this.snapshot().stat.世界,calendar=world.历法,today=calendarDate(world.时间,calendar);
                    if(today){
                        const custom=Array.isArray(calendar?.月份天数)?calendar.月份天数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24):[];
                        if(custom.length){
                            let y=today.y,m=today.m+this.monthOffset;
                            while(m<1){m+=custom.length;y--;}
                            while(m>custom.length){m-=custom.length;y++;}
                            this.selectedDate=y+'-'+m+'-1';
                        }else{
                            const date=new Date(0);date.setFullYear(today.y,today.m-1+this.monthOffset,1);
                            this.selectedDate=date.getFullYear()+'-'+(date.getMonth()+1)+'-1';
                        }
                    }
                    this.calendarMode='date';this.eventLimit=12;this.render();
                }
                else if(a==='date'){this.selectedDate=button.dataset.date;this.calendarMode='date';this.eventLimit=12;this.render();}
                else if(a==='clear-date'){this.selectedDate='';this.calendarMode='all';this.eventLimit=12;this.render();}
                else if(a==='today'){this.selectedDate=undefined;this.calendarMode='today';this.monthOffset=0;this.eventLimit=12;this.render();}
                else if(a==='undated'){this.selectedDate='';this.calendarMode='undated';this.eventLimit=12;this.render();}
                else if(a==='more-events'){this.eventLimit=(this.eventLimit||12)+12;this.render();}
                else if(button.dataset.filter){this.filter=button.dataset.filter;this.render();}
                else if(button.dataset.tab){this.tab=button.dataset.tab;this.filter='全部';this.query='';this.selectedDate=undefined;this.calendarMode='today';this.monthOffset=0;this.eventLimit=12;this.render(true);}
            });
            this.panel.addEventListener('input',event=>{
                if(event.target.matches('[data-search]')){
                    const caret=event.target.selectionStart;this.query=event.target.value;this.render();
                    const input=this.panel.querySelector('[data-search]');input.focus();input.setSelectionRange(caret,caret);
                }else if(event.target.matches('[data-segment-title]')){
                    const row=event.target.closest('[data-segment-row]'),body=row?.querySelector('[data-segment]');
                    if(body)body.dataset.title=cleanSegmentTitle(event.target.value);
                }
            });
            this.panel.addEventListener('change',event=>{
                if(event.target.matches('[data-retries]')){
                    const value=Math.max(1,Math.min(5,Number(event.target.value)||1));
                    this.config.retryAttempts=value;event.target.value=value;this.saveConfig();
                    this.status='最大尝试次数已设为 '+value+' 次';
                    this.panel.querySelector('footer span').textContent=this.status;
                }else if(event.target.matches('[data-doc-import]')){
                    const input=event.target,file=input.files&&input.files[0];if(!file)return;
                    Promise.resolve(file.text()).then(raw=>{
                        const doc=this.importPromptDocument(raw);
                        this.status='已导入预设文档：'+doc.name;this.render(true);
                    }).catch(e=>{this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}).finally(()=>{input.value='';});
                }
                else if(event.target.matches('[data-dedicated-field]')){
                    const field=event.target.dataset.dedicatedField,value=event.target.value||'';
                    if(['apiUrl','apiKey','model'].includes(field)){
                        this.setDedicatedApi({[field]:value});
                        this.status='专属 API 配置已保存';this.panel.querySelector('footer span').textContent=this.status;
                    }
                }
                else if(event.target.matches('[data-dedicated-preset]')){
                    const name=event.target.value||'';
                    if(name){
                        try{this.applyDedicatedApiPreset(name);this.status='已应用 API 预设：'+name;this.render(true);}
                        catch(e){this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}
                    }
                }
            });
            isolated.appendChild(this.panel);
            doc.body.appendChild(this.mount);
        }
        render(force) {
            if(!this.isOpen())return;
            let snapshot,state=emptyState(),reason='';
            try{
                snapshot=this.snapshot();
                snapshot.stat.世界[PATH]=Object.assign(emptyState(),snapshot.stat.世界[PATH]||{});
                normalizeBackendState(snapshot.stat);normalizeEventLayers(snapshot.stat);repairCausalProjection(snapshot.stat);
                state=Object.assign(state,snapshot.stat.世界[PATH]||{});
                reason=this.blocked(snapshot);
            }catch(e){reason=e.message;}
            const s=snapshot?snapshot.stat:{},w=s.世界||{},orbit=w.因果轨道||{};
            this.syncStatusTone();
            this.panel.dataset.fontScale=this.config.fontScale||'standard';
            if(this.tab==='总览')this.tab='世界推进';
            const main=this.panel.querySelector('main'),scroll=main.scrollTop;
            const opened=new Set(Array.from(main.querySelectorAll('details[open]')).map(d=>d.dataset.detail));
            this.panel.querySelector('footer span').textContent=this.status;
            const availabilityReason=this.isConfigured()&&!this.isAvailable()
                ?(this.usesDedicatedApi()?'专属 API 未准备好：请在「设置」中填写 API 地址并选择模型':'主神终端额外模型未准备好：请在主神终端设置中配置 API 地址并选择模型')
                :'';
            const runButton=this.panel.querySelector('[data-action=run]');
            const stopping=this.busy&&!!this.controller?.signal.aborted;
            runButton.disabled=this.busy?(this.committing||stopping):!!reason||!!availabilityReason;
            runButton.textContent=this.busy?(this.committing?'保存中…':stopping?'停止中…':'停止推进'):'推进世界';
            runButton.setAttribute('aria-label',runButton.textContent);

            const tabs=[['世界推进','◈'],['角色管理','♙'],['探索与势力','⌖'],['世界事件','▤'],['资产','▣'],['传闻','◎'],['提示词预设','✎'],['请求检查','⌕'],['运行记录','≋','历史记忆'],['设置','⚙']];
            this.panel.querySelector('nav').innerHTML='<div class="we-navtitle">世界档案</div>'+tabs.map(([t,i,label])=>'<button data-tab="'+t+'" aria-selected="'+(this.tab===t)+'"><span class="we-tab-icon" aria-hidden="true">'+i+'</span>'+(label||t)+'</button>').join('');
            if(this.tab==='提示词预设'&&main.querySelector('textarea')&&!force)return;
            const text=v=>escape(v==null?'':v);
            const exists=v=>v!==''&&v!=null&&(!Array.isArray(v)||v.length)&&(!plain(v)||Object.keys(v).length);
            const pill=(v,kind='')=>'<span class="we-pill '+kind+'">'+text(v)+'</span>';
            const empty=(title,desc='首次推演后，会在这里呈现有依据的世界记录。')=>'<div class="we-empty"><b>'+text(title)+'</b>'+text(desc)+'</div>';
            const value=v=>Array.isArray(v)?(v.every(x=>!plain(x))?'<div class="we-chips">'+v.map(x=>pill(x,'dim')).join('')+'</div>':v.map(x=>'<div class="we-card">'+fields(x)+'</div>').join('')):plain(v)?fields(v):text(v);
            const fields=obj=>'<dl>'+Object.entries(obj||{}).filter(([,v])=>exists(v)).map(([k,v])=>'<dt>'+text(k)+'</dt><dd>'+value(v)+'</dd>').join('')+'</dl>';
            const details=(id,obj,title='查看完整档案')=>Object.values(obj).some(exists)?'<details data-detail="'+text(id)+'"'+(opened.has(id)?' open':'')+'><summary>'+text(title)+'</summary>'+fields(obj)+'</details>':'';
            const section=(title,body,hint='')=>'<section class="we-section"><div class="we-section-head"><h2>'+text(title)+'</h2><small>'+text(hint)+'</small></div>'+body+'</section>';
            const entries=obj=>Object.entries(obj||{});
            const parseDate=value=>calendarDate(value,w.历法);
            const contextKey=JSON.stringify([snapshot?.fingerprint?JSON.parse(snapshot.fingerprint)[0]:null,w.名称]);
            if(this.calendarContext!==contextKey){this.calendarContext=contextKey;this.selectedDate=undefined;this.calendarMode="today";this.monthOffset=0;}
            if(this.selectedDate===undefined||this.calendarMode==="today")this.selectedDate=parseDate(w.时间)?.key||"";
            if(this.calendarMode==='date'){
                const anchor=parseDate(w.时间),selected=parseDate(this.selectedDate);
                const monthsPerYear=Array.isArray(w.历法?.月份天数)&&w.历法.月份天数.length?w.历法.月份天数.length:12;
                if(anchor&&selected)this.monthOffset=(selected.y-anchor.y)*monthsPerYear+selected.m-anchor.m;
            }
            const dateLabel=str=>{const d=parseDate(str);return d?d.m+'月'+d.d+'日':str||'时间待补';};
            // 稳定阶段与防御强度取自 ⚙️世界因果与法则协议；这里只展示当前阶段。
            const stabilityStages=[
                {min:111,max:120,title:'黄金祝福 | 稳定强化',effects:['世界基本消化外来干涉，原生因果处于高强度收束状态','轮回者没有主动围剿压力，但外来力量仍受完整原生法则约束']},
                {min:101,max:110,title:'世界青睐 | 稳定强化',effects:['因果结构优于原始基准，秩序与资源循环趋于健康','世界对轮回者的主动排异很低']},
                {min:100,max:100,title:'原著时间线 | 稳定',effects:['世界按既定轨迹运行，不主动针对轮回者，也不提供额外庇护']},
                {min:90,max:99,title:'因果警觉 | 稳定',effects:['世界开始识别异常源','目击、调查、误会与敌意沿合理因果链向轮回者汇聚']},
                {min:80,max:89,title:'定向排异 | 稳定',effects:['藏身处、计划、联系人与资源链持续受压','压力优先集中到轮回者本人及其直接关系网']},
                {min:70,max:79,title:'因果追猎 | 松动',effects:['原生强者、组织与主线冲突逐步被因果收束引向轮回者','据点、盟友、补给与撤退路线开始被系统性破坏']},
                {min:60,max:69,title:'全面围剿 | 松动',effects:['多个原生势力可从各自合理动机同时追捕、封锁或攻击轮回者','普通安全生活基本结束，逃离一处不代表摆脱追猎']},
                {min:50,max:59,title:'世界武器化 | 松动',effects:['战争、灾害、怪物潮与原生顶级强者可被因果链引向轮回者活动区','世界开始接受区域毁灭与大规模误伤作为清除代价']},
                {min:40,max:49,title:'猎杀现实 | 崩坏',effects:['环境、空间、时间与残存原生规则都可成为猎杀轮回者的载体','世界接受永久区域毁灭，只求把入侵源一并埋葬']},
                {min:30,max:39,title:'献祭式清除 | 崩坏',effects:['世界进入免疫风暴，围剿不再优先保护自身秩序','可牺牲主线人物、城市、国家乃至文明结构换取清除轮回者']},
                {min:10,max:29,title:'终焉围猎 | 混乱',effects:['毁灭性事件持续向轮回者及其停留区域收束','长期停留会把灾难引向当前位置，必须修复因果或持续撤离']},
                {min:1,max:9,title:'同归于尽 | 混乱',effects:['世界放弃自保，主动牺牲法则、时间线与现实结构清除轮回者','只剩修复异常根源或在世界死亡前撤离']},
                {min:0,max:0,title:'世界毁灭',effects:['因果链、世界法则、时间线与现实结构全部终止','所有未撤离实体的生命、意识与灵魂一并被彻底抹除']}
            ];
            const stabilityDescription=stable=>{
                if(s.设置?.世界超稳===true)return '<p class="we-muted">世界超稳 · 稳定值固定100<br>禁止新增因果偏移与主动排异升级</p>';
                if(stable===null)return '<p class="we-muted">世界稳定值未记录</p>';
                const normalized=Math.max(0,Math.min(120,Number(stable)));
                const stage=stabilityStages.find(item=>normalized>=item.min&&normalized<=item.max);
                return stage?'<div class="we-stability-description"><p><b>'+text(stage.title)+'</b></p><ul>'+stage.effects.map(effect=>'<li>'+text(effect)+'</li>').join('')+'</ul></div>':'<p class="we-muted">稳定值超出协议范围</p>';
            };
            const events=sortWorldEvents(state.事件,orbit);
            const active=events.filter(([,e])=>e.状态==='进行中'),future=events.filter(([,e])=>e.状态==='待发生');
            const relationRoster=s.关系列表||{};
            const relationNamesByKey=new Map(entries(relationRoster).map(([name])=>[nameKey(name),name]));
            const peopleAll=new Map(entries(state.人物));entries(relationRoster).forEach(([n,p])=>{if(!peopleAll.has(n))peopleAll.set(n,{状态:p.在场?'在场':'场外',公开动态:p.态度||'',地点:'',目标:'',行动:''});});
            const userName=String(this.host.SillyTavern?.name1||this.env.SillyTavern?.name1||this.host.SillyTavern?.getContext?.()?.name1||this.host.name1||'').trim();
            const playerAliases=new Set([userName,'{{user}}','<user>','玩家'].filter(Boolean).map(nameKey));
            const deadAlienAliases=new Set(entries(w.异端雷达?.名单).filter(([,alien])=>alien?.状态==='死亡').map(([name])=>nameKey(name)));
            const people=new Map(Array.from(peopleAll).filter(([name])=>!playerAliases.has(nameKey(name))&&!deadAlienAliases.has(nameKey(name))));
            const formalPeople=new Map(entries(relationRoster)
                .filter(([name])=>!playerAliases.has(nameKey(name))&&!deadAlienAliases.has(nameKey(name)))
                .map(([name,rel])=>{
                    const backend=Array.from(people).find(([otherName])=>nameKey(otherName)===nameKey(name))?.[1];
                    return [name,backend||{状态:rel.在场?'在场':'场外',公开动态:rel.态度||'',地点:'',目标:'',行动:''}];
                }));
            const backstagePeople=Array.from(people).filter(([name])=>!relationNamesByKey.has(nameKey(name)));
            const person=(name,p,full=false)=>{
                const profileName=relationNamesByKey.get(nameKey(name))||'';
                const rel=profileName?relationRoster[profileName]||{}:{};
                return '<article class="'+(full?'we-card':'we-person')+'">'+(!full?'<div class="we-avatar">'+text(name.slice(0,1))+'</div>':'')+'<div><div class="we-card-top"><h3>'+text(name)+'</h3>'+pill(p.状态||(rel.在场?'在场':'场外'),'dim')+'</div><p>'+text(p.行动||p.公开动态||rel.态度||'尚无行动记录')+'</p><div class="we-meta"><span>⌖ '+text(p.地点||'地点未明')+'</span>'+(p.预计结束?'<span>至 '+text(dateLabel(p.预计结束))+'</span>':'')+'</div>'+(full?fields({档案类型:profileName?'正式关系人物':'世界活动人物',目标:p.目标,当前时间段:[p.开始时间,p.预计结束].filter(Boolean).join(' → '),下次检查:p.下次检查,所属世界:p.所属世界,好感度:rel.好感度})+details('person-'+name,{行程:p.行程,认知:p.认知,认知来源:p.认知来源,登场条件:p.登场条件,关联事件:p.关联事件,更新时间:p.更新时间,人物背景:rel.背景故事},'行程 · 认知 · 关联事件'):'')+'</div></article>';
            };
            const compactPerson=(name,p)=>{
                const profileName=relationNamesByKey.get(nameKey(name))||'';
                const rel=profileName?relationRoster[profileName]||{}:{};
                const targetName=profileName||name;
                const inner='<span class="we-avatar">'+text(name.slice(0,1))+'</span><span class="we-person-copy"><strong>'+text(name)+'</strong><small>'+text(p.地点||'地点未明')+'</small><em>'+text(p.行动||p.公开动态||rel.态度||'暂无新动态')+'</em></span>';
                return '<button class="we-person-compact" data-jump-person="'+text(targetName)+'" title="'+text(profileName?'查看正式人物档案':'查看世界人物动态；不会创建关系列表档案')+'">'+inner+'</button>';
            };
            const contextRows=context=>{
                const rows=[];
                for(const link of context?.背景关联||[])rows.push('<div class="we-context-row"><span class="we-context-kind">'+text(link.类型||'关联')+'</span><span class="we-context-copy"><b>'+text(link.名称||'未命名关联')+'</b><small>'+text(link.关系||'持续关联')+'</small></span></div>');
                for(const eventName of context?.关联事件||[])rows.push('<button class="we-context-row" data-jump-event="'+text(eventName)+'"><span class="we-context-kind">事件</span><span class="we-context-copy"><b>'+text(eventName)+'</b><small>查看关联世界事件 →</small></span></button>');
                return rows.length?'<div class="we-context-list">'+rows.join('')+'</div>':empty('暂无背景关联','世界引擎只记录持续的组织/社交关系与事件关联，不重复人物背景故事。');
            };
            const sceneLane=(title,items,kind)=>{
                const list=Array.isArray(items)?items:[];
                const body=list.map(item=>{
                    if(kind==='person'){
                        const meta=[item.关系,item.身份,item.档案类型||'世界人物'].filter(Boolean).join(' · ');
                        const inner='<b>'+text(item.名称)+'</b><small>'+text(meta||'现场标签')+'</small>'+(item.行动?'<p>'+text(item.行动)+'</p>':'');
                        return item.可查看档案&&item.档案名称
                            ?'<button class="we-scene-item" data-jump-person="'+text(item.档案名称)+'">'+inner+'</button>'
                            :'<article class="we-scene-item we-scene-label">'+inner+'</article>';
                    }
                    if(kind==='group')return '<article class="we-scene-item"><b>'+text(item.名称||'未命名群体')+'</b><small>'+text([item.规模,item.身份].filter(Boolean).join(' · ')||'现场群体')+'</small>'+(item.动态?'<p>'+text(item.动态)+'</p>':'')+'</article>';
                    return '';
                }).join('');
                return '<div class="we-scene-lane"><div class="we-scene-lane-head"><b>'+text(title)+'</b><span>'+list.length+'</span></div>'+(body||'<div class="we-muted">暂无记录</div>')+'</div>';
            };
            const sceneContextBody=context=>{
                const hasScene=!!(context&&(context.地区||context.身边人物?.length||context.现场群体?.length));
                if(!hasScene)return empty('暂无身边发展','人物尚未匹配到可用的地区现场；不会为填充面板而虚构周边信息。');
                const control=[context.控制方?'控制 · '+context.控制方:'',context.争夺方?.length?'争夺 · '+context.争夺方.join('、'):''].filter(Boolean).join(' · ');
                return '<div class="we-scene-hero"><div class="we-scene-head"><div><small>当前世界现场</small><h3>'+text(context.地区||'未命名地区')+'</h3></div><small>'+text(control||'控制关系未记录')+'</small></div>'+(context.地区动态?'<p>'+text(context.地区动态)+'</p>':'')+(context.环境状态?.length?'<div class="we-chips">'+context.环境状态.map(x=>pill(x,'dim')).join('')+'</div>':'')+'</div><div class="we-scene-grid">'+sceneLane('身边人物',context.身边人物,'person')+sceneLane('现场群体',context.现场群体,'group')+'</div>';
            };
            const areaSceneBody=record=>{
                const groups=Array.isArray(record?.现场群体)?record.现场群体:[];
                if(!groups.length)return '';
                return sceneLane('现场群体',groups,'group');
            };
            const eventTasks=(eventName,event)=>{
                const names=Array.from(new Set((Array.isArray(event.关联任务)?event.关联任务:[]).filter(name=>typeof name==='string'&&name.trim())));
                if(!names.length)return '';
                const roster=s.任务?.列表||{};
                return '<div class="we-event-tasks"><div class="we-meta"><b>关联任务</b><span>'+names.length+' 项</span></div>'+names.map(name=>{
                    const task=Object.hasOwn(roster,name)&&plain(roster[name])?roster[name]:null;
                    const id='event-task-'+JSON.stringify([eventName,name]);
                    return '<details class="we-event-task" data-detail="'+text(id)+'"'+(opened.has(id)?' open':'')+'><summary><span class="we-task-name">'+text(name)+'</span>'+pill(task?.状态|| (task?'状态未记录':'任务记录缺失'),'dim')+'</summary>'
                        +(task?'<p>'+text(task.目标||'目标尚未记录')+'</p>'+fields({委托方:task.委托方,难度:task.难度,交付:task.交付}):'<p class="we-muted">当前任务列表中未找到该任务，保留事件中的关联名称。</p>')+'</details>';
                }).join('')+'</div>';
            };
            const eventCard=(name,e)=>'<article class="we-card" data-event-card="'+text(name)+'"><div class="we-card-top"><h3>'+text(name)+'</h3><div class="we-card-tags">'+pill(e.分类||'近期节点',e.分类==='宏观节点'?'future':'dim')+pill(e.状态,e.状态==='待发生'?'future':e.状态==='进行中'?'':'dim')+'</div></div><div class="we-meta"><span>◷ '+text(eventScheduleLabel(e))+'</span><span>⌖ '+text(e.地点||'地点未明')+'</span></div><p>'+text(e.公开征兆||e.描述||'等待明确事件内容')+'</p>'+eventTasks(name,e)+details('event-'+name,{事件描述:e.描述,分类:e.分类,前因:e.前因,触发条件:e.条件,参与者:e.参与者,预计结束:e.预计结束,下次检查:e.下次检查,可见影响:e.可见影响,默认走向:e.默认走向,已确认结果:e.结果,更新时间:e.更新时间},'因果关联与事件详情')+'</article>';
            const timelineCards=list=>{
                const groups=[
                    ['当前进行',list.filter(([,e])=>e.状态==='进行中'||(e.状态==='待发生'&&e.分类==='当前事件'))],
                    ['近期桥接',list.filter(([,e])=>e.状态!=='进行中'&&e.状态==='待发生'&&e.分类==='近期节点')],
                    ['宏观锚点',list.filter(([,e])=>e.状态!=='进行中'&&e.状态==='待发生'&&e.分类==='宏观节点')],
                    ['已结束',list.filter(([,e])=>['已完成','已取消'].includes(e.状态))]
                ];
                const assigned=new Set(groups.flatMap(([,items])=>items.map(([name])=>name)));
                groups.push(['待归类记录',list.filter(([name])=>!assigned.has(name))]);
                return groups.filter(([,items])=>items.length).map(([title,items])=>'<div class="we-timeline-group"><div class="we-timeline-group-title">'+text(title)+'<small>'+items.length+'</small></div>'+items.map(([n,e])=>eventCard(n,e)).join('')+'</div>').join('');
            };
            const matched=(name,obj)=>!this.query||(name+' '+Object.values(obj).filter(v=>typeof v==='string').join(' ')).toLowerCase().includes(this.query.toLowerCase());
            const calendarCandidates=events.filter(([n,e])=>matched(n,e)&&((this.filter||'全部')==='全部'||e.状态===this.filter));
            const tools=(filters=[])=>'<div class="we-tools"><input data-search aria-label="搜索档案" placeholder="搜索名称、地点或内容…" value="'+text(this.query||'')+'">'+filters.map(f=>'<button data-filter="'+f+'" class="'+((this.filter||'全部')===f?'active':'')+'">'+f+'</button>').join('')+'</div>';
            const calendar=()=>{
                const today=parseDate(w.时间);
                if(!today){const semantic=events.filter(([,e])=>!parseDate(e.时间||e.开始时间)&&String(e.时间||e.开始时间||'').trim()).slice(0,12);return '<div class="we-calendar"><h3>作品内时间轴</h3><p class="we-muted">当前锚点 · '+text(w.时间||'尚无副本时间')+'</p>'+(semantic.length?'<div class="we-timeline">'+semantic.map(([n,e])=>'<p><b>'+text(e.时间||e.开始时间)+'</b><br>'+text(n)+'</p>').join('')+'</div>':'<p class="we-muted">暂无带作品内时间标记的事件</p>')+'</div>';}
                const customMonths=Array.isArray(w.历法?.月份天数)?w.历法.月份天数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24):[];
                let y=today.y,m=today.m+(this.monthOffset||0),first=0,count=0;
                if(customMonths.length){
                    while(m<1){m+=customMonths.length;y--;}
                    while(m>customMonths.length){m-=customMonths.length;y++;}
                    count=customMonths[m-1];
                }else{
                    const month=new Date(0);month.setFullYear(today.y,today.m-1+(this.monthOffset||0),1);month.setHours(0,0,0,0);
                    y=month.getFullYear();m=month.getMonth()+1;first=(month.getDay()+6)%7;
                    const last=new Date(month);last.setMonth(last.getMonth()+1,0);count=last.getDate();
                }
                const marked=new Map();
                calendarCandidates.forEach(([,e])=>{const key=parseDate(e.时间||e.开始时间)?.key;if(key)marked.set(key,(marked.get(key)||0)+1);});
                let cells=['一','二','三','四','五','六','日'].map(x=>'<span>'+x+'</span>').join('')+'<span></span>'.repeat(first);
                for(let d=1;d<=count;d++){const key=y+'-'+m+'-'+d;cells+='<button data-action="date" data-date="'+key+'" aria-label="'+key+'" aria-pressed="'+(this.selectedDate===key)+'" title="'+key+' · '+(marked.get(key)||0)+' 个匹配事件" class="'+(today.key===key?'today ':'')+(marked.has(key)?'has-event ':'')+(this.selectedDate===key?'selected':'')+'">'+d+'</button>';}
                return '<div class="we-calendar"><div class="we-calhead"><button class="we-btn" data-action="month" data-step="-1" aria-label="上月">‹</button><strong>'+y+' 年 '+m+' 月</strong><button class="we-btn" data-action="month" data-step="1" aria-label="下月">›</button></div><div class="we-days">'+cells+'</div><div class="we-meta"><span>'+text(customMonths.length?(w.历法?.名称||'作品历法')+' · 本月 '+count+' 天':'公历显示 · 本月 '+count+' 天')+'</span><span>金框 · 当前日期</span><span>绿点 · 已排定事件</span></div></div>';
            };
            const radar=w.异端雷达||{};
            const alienAlive=entries(radar.名单).filter(([,a])=>a&&a.状态!=='死亡').length;
            const showRadar=!(s.设置||{}).单一世界&&!(s.系统状态||{}).是否在主神空间;
            const prose=v=>'<div class="we-reading we-world-laws">'+(Array.isArray(v)?v:[v]).map(paragraph=>'<article><p>'+text(paragraph)+'</p></article>').join('')+'</div>';
            const hero='<div class="we-hero"><div><div class="we-eyebrow">SAMSARA / WORLD ARCHIVE</div><h1>'+text(w.名称&&w.名称!=='待初始化'?w.名称:'世界尚未建立')+'</h1><div class="we-world-ranks"><span>位格 <b>'+text(w.位格||'未记录')+'</b></span><span>难度 <b>'+text(w.难度||'未记录')+'</b></span></div><div class="we-muted">'+text(w.地点||'地点待确认')+' · '+text(orbit.当前阶段&&orbit.当前阶段!=='待初始化'?orbit.当前阶段:'等待篇章开启')+'</div></div><div class="we-date">'+text(w.时间||'副本日期待确认')+'<small>累计游玩 '+text((s.系统状态||{}).游玩天数||0)+' 天 · '+(reason?'推进暂停':'副本进行中')+'</small></div></div>';
            let html=hero+(reason?'<div class="we-notice">'+text(reason)+'</div>':'')+(availabilityReason?'<div class="we-notice">'+text(availabilityReason)+'</div>':'');
            if(this.tab==='世界推进'){
                const offsets=entries(orbit.偏移记录);
                const stable=w.稳定!==null&&w.稳定!==''&&Number.isFinite(Number(w.稳定))?Number(w.稳定):null;
                const signed=n=>(n>0?'+':'')+n;
                const offsetCard=([name,r])=>{
                    const impact=r?.影响程度!==null&&r?.影响程度!==''&&Number.isFinite(Number(r?.影响程度))?Number(r.影响程度):null;
                    return '<article class="we-offset"><div class="we-offset-head"><b>'+text(name)+'</b><span>'+text(impact===null?'影响未记录':signed(impact))+'</span></div><p>'+text(r?.描述||'暂无偏移描述')+'</p><small>引发者 · '+text(r?.引发者||'未记录')+' · '+(impact===null?'待确认':impact<0?'因果破坏':impact>0?'因果修复 / 强化':'无数值变化')+'</small></article>';
                };
                const causalHtml='<div class="we-causal"><div class="we-stability"><div><small>世界稳定值</small><strong data-world-stability>'+text(stable===null?'未记录':stable)+'</strong></div><span>'+((s.设置||{}).世界超稳?'世界超稳 · 禁止新增偏移':'基准 100 · 失稳将强化世界排异')+'</span></div>'
                    +(stable===null?'':'<meter min="0" max="120" value="'+Math.max(0,Math.min(120,stable))+'" aria-label="世界稳定值">'+stable+'</meter>')
                    +stabilityDescription(stable)
                    +'<div class="we-offset-heading">偏移记录 <span>'+offsets.length+' 条</span></div>'
                    +(offsets.length?offsets.slice(0,3).map(offsetCard).join('')+(offsets.length>3?'<details class="we-offset-more"><summary>展开其余 '+(offsets.length-3)+' 条偏移</summary>'+offsets.slice(3).map(offsetCard).join('')+'</details>':''):empty('暂无因果偏移','关键人物命运、重大事件或势力格局实质改变后记录。'))+'</div>';
                const shown=calendarCandidates.filter(([,e])=>this.calendarMode==='undated'?!parseDate(e.时间||e.开始时间):!this.selectedDate||parseDate(e.时间||e.开始时间)?.key===this.selectedDate);
                const macroCount=events.filter(([,e])=>e.分类==='宏观节点').length;
                const timelineView=snapshot?timelineState(s):null;
                const nextMacroName=timelineView?.下一宏观节点?.名称||'';
                const nextPair=nextMacroName?events.find(([n,e])=>n===nextMacroName&&e.分类==='宏观节点')||null:null;
                const nextNode=nextPair?.[0]||'等待宏观节点';
                const nextEvent=nextPair?.[1]||null;
                const compactPeople=Array.from(people).filter(([,p])=>p.行动||p.公开动态||p.地点).slice(0,4);
                html+='<div class="we-world-focus">'
                    +'<div class="we-world-focus-main">'+section('世界动向',orbit.当前阶段&&orbit.当前阶段!=='待初始化'?'<div class="we-pulse"><span class="we-pulse-mark">LIVE</span><p>'+text(orbit.当前阶段)+'</p></div>':empty('阶段待确认','世界推进会把当前世界局势直接写入因果轨道.当前阶段。'),'因果轨道 · 当前阶段')+'</div>'
                    +'<div class="we-world-focus-next">'+section('下一宏观节点',(nextEvent?'<button class="we-next-node" data-jump-event="'+text(nextNode)+'" title="点击定位到时间线中的对应宏观事件">':'<div class="we-next-node">')+'<span>→</span><div><h3>'+text(nextNode)+'</h3><p>'+text(nextEvent?.公开征兆||nextEvent?.描述||'本轮需要先建立真实宏观节点')+'</p><small>'+text(nextEvent?.时间||nextEvent?.开始时间||'时间待确认')+(nextEvent?' · 点击定位 →':'')+'</small></div>'+(nextEvent?'</button>':'</div>'),'因果边界')+'</div>'
                    +'</div>';
                html+='<div class="we-kpi-grid we-kpi-compact">'
                    +'<div class="we-kpi"><small>正在发生</small><strong>'+active.length+'</strong><span>当前活动事件</span></div>'
                    +'<div class="we-kpi"><small>近期桥接</small><strong>'+events.filter(([,e])=>e.分类==='近期节点'&&e.状态==='待发生').length+'</strong><span>下一宏观边界之前</span></div>'
                    +'<div class="we-kpi"><small>宏观锚点</small><strong>'+macroCount+'</strong><span>'+text(orbit.当前阶段||'阶段待确认')+'</span></div>'
                    +'<div class="we-kpi"><small>场外人物</small><strong>'+people.size+'</strong><span>'+future.length+' 个未来事件</span></div>'
                    +'</div>';
                html+='<div class="we-dashboard"><div class="we-command-main">'
                    +'<section class="we-section we-timeline-board" data-detail="world-calendar"><div class="we-section-head"><h2>事件时间线</h2><small>'+events.length+' 事件 · '+future.length+' 未来 · '+macroCount+' 宏观</small></div><div class="we-calendar-layout"><div class="we-calendar-slot">'+calendar()+'</div><div class="we-timeline-slot">'+tools(['全部','进行中','待发生','已完成','已取消'])+'<div class="we-tools"><span>'+text(this.calendarMode==='undated'?'未定日 / 作品内时间':this.selectedDate||'全部日期')+'</span><button data-action="today">回到今天</button><button data-action="clear-date">全部日期</button><button data-action="undated">未定日事件</button></div>'+'<div class="we-timeline">'+(timelineCards(shown.slice(0,this.eventLimit||12))||empty('没有符合条件的事件'))+'</div>'+(shown.length>(this.eventLimit||12)?'<button class="we-btn" data-action="more-events">显示更多（共 '+shown.length+' 项）</button>':'')+'</div></div></section>'
                    +'</div><aside class="we-command-side">'
                    +section('因果状态',causalHtml,'稳定与轨道偏移')
                    +section('货币与经济',exists(w.货币)?fields({货币体系:w.货币?.体系,购买力基准:w.货币?.购买力基准,经济波动:w.货币?.经济波动}):empty('尚无货币资料','世界推进会在设定或经济局势明确时维护。'),'世界推进维护')
                    +(exists(w.法则)?section('世界法则',prose(w.法则),'当前生效规则 · '+(Array.isArray(w.法则)?w.法则.length:1)+' 条'):'')
                    +section('人物动向',(compactPeople.length?'<div class="we-people-strip">'+compactPeople.map(([n,p])=>compactPerson(n,p)).join('')+'</div><button class="we-link-btn" data-tab="角色管理">查看人物名册 →</button>':empty('暂无人物动态')),'重点 NPC')
                    +'</aside></div>';
            }else if(this.tab==='角色管理'){
                if(showRadar&&alienAlive>0)html+='<div class="we-meta we-alien-count">异端存活数量 <b>'+alienAlive+'</b></div>';

                const alienByKey=new Map(entries(radar.名单).map(([name,record])=>[nameKey(name),{名称:name,记录:record}]));
                const rolePeople=[
                    ...Array.from(formalPeople).map(([n,p])=>[n,p,{正式:true,异端:alienByKey.has(nameKey(n))}]),
                    ...backstagePeople.map(([n,p])=>[n,p,{正式:false,异端:alienByKey.has(nameKey(n))}])
                ];
                const list=rolePeople.filter(([n,p,meta])=>{
                    const searchable=meta.正式?Object.assign({},p,relationRoster[n]||{}):p;
                    if(!matched(n,searchable))return false;
                    if((this.filter||'全部')==='全部')return true;
                    const present=meta.正式&&!!relationRoster[n]?.在场;
                    return this.filter==='在场'?present:!present;
                });
                const chosen=list.find(([n])=>n===this.selectedPerson)||list[0];
                const chosenMeta=chosen?.[2]||{};
                const chosenContext=chosen?derivePersonWorldContext(s,chosen[0],userName):null;
                const chosenRelation=chosenMeta.正式&&plain(relationRoster[chosen?.[0]])?relationRoster[chosen[0]]:null;
                const chosenAudit=this.isNpcBuildAuditEnabled()&&chosenRelation?npcBuildAssessment(s,chosen[0],chosenRelation):null;
                const chosenAlien=chosen?alienByKey.get(nameKey(chosen[0]))?.记录:null;
                const auditPanel=chosenAudit?section('NPC构筑审计',
                    '<div class="we-card"><div class="we-card-top"><h3>'+text(chosenAudit.审计级别)+'</h3>'+pill(chosenAudit.缺口.length?'待补强':'构筑完整',chosenAudit.缺口.length?'future':'dim')+'</div>'
                    +fields({层级:chosenAudit.层级,当前组件:chosenAudit.当前组件})
                    +(chosenAudit.缺口.length?'<div class="we-chips">'+chosenAudit.缺口.map(x=>pill(x,'future')).join('')+'</div><p class="we-muted">进入世界推进请求的热人物会由后台优先补齐缺口；难度脚本只负责已有组件的品质调整。</p>':'<p class="we-muted">当前构筑已达到本层级审计最低要求。</p>')+'</div>',
                    '仅正式关系人物 · 复用NPC生成规则'
                ):'';
                const backgroundPanel=chosen?section('背景关联',contextRows(chosenContext),(chosenContext?.背景关联?.length||0)+' 关系 · '+(chosenContext?.关联事件?.length||0)+' 事件'):'';
                const surroundingsPanel=chosen?section('身边发展',sceneContextBody(chosenContext),'剧情推演现场标签 · 只读派生'):'';
                const alienPanel=chosenAlien?section('异端档案',fields({来源:chosenAlien.来源,经历:chosenAlien.经历,阵营:chosenAlien.阵营,职业:chosenAlien.职业,层级:chosenAlien.层级,状态:chosenAlien.状态}),'异端雷达 · 只读'):'';
                const formalCount=rolePeople.filter(([, ,meta])=>meta.正式).length;
                const worldCount=rolePeople.length-formalCount;
                const roster=list.length?'<div class="we-roster-list">'+list.map(([n,p,meta])=>{
                    const rel=meta.正式?relationRoster[n]||{}:{};
                    const present=meta.正式&&!!rel.在场;
                    const status=present?'在场':p.状态||'场外';
                    const source=meta.正式?'正式档案':meta.异端?'异端 · 世界人物':'世界人物';
                    const summary=p.行动||p.公开动态||rel.态度||'等待下一次世界推演';
                    return '<button class="we-roster-person '+(chosen?.[0]===n?'active':'')+'" data-person="'+text(n)+'"><span class="we-roster-copy"><b>'+text(n)+'</b><small>⌖ '+text(p.地点||'地点未明')+' · '+text(status)+'</small><em>'+text(summary)+'</em></span>'+pill(source,meta.异端?'future':'dim')+'</button>';
                }).join('')+'</div>':empty('没有符合条件的人物','调整筛选或等待世界人物进入活动范围。');
                html+=tools(['全部','在场','场外'])+'<div class="we-columns"><div>'
                    +section('人物名册',roster,'正式 '+formalCount+' · 世界人物 '+worldCount)
                    +(chosen?section('身份与当前行动',person(chosen[0],chosen[1],true),chosenMeta.正式?'正式关系人物':'世界后台人物')+surroundingsPanel+section('日程与行动',fields({行程:chosen[1].行程,开始时间:chosen[1].开始时间,预计结束:chosen[1].预计结束,下次检查:chosen[1].下次检查}))+auditPanel:empty('尚未选择人物'))
                    +'</div><aside>'+backgroundPanel+alienPanel+(chosen?[['情报',chosen[1].认知来源||chosen[1].认知],['近期动向',chosen[1].公开动态]].filter(([,v])=>exists(v)).map(([label,v])=>section(label,value(v))).join(''):'')+'</aside></div>';
            }else if(this.tab==='探索与势力'){
                const regionRecords=state.势力地区||{};
                const exploration=entries(w.探索).map(([name,ledger])=>[name,{...(regionRecords[name]||{}),...ledger,类型:'探索'}]);
                const factionList=entries(w.势力).map(([name,ledger])=>[name,{...(regionRecords[name]||{}),...ledger,类型:'势力'}]);
                const projectedNames=new Set([...exploration.map(([n])=>n),...factionList.map(([n])=>n)]);
                const backstageAreas=entries(regionRecords).filter(([name,r])=>r.类型!=='势力'&&!projectedNames.has(name));
                const dir=this.directoryTab||'探索';
                const progressStage=value=>{
                    const n=Math.max(0,Math.min(100,Number(value)||0));
                    if(n>=100)return '核心';
                    if(n>=90)return '掌控';
                    if(n>=60)return '深入';
                    if(n>=30)return '熟悉';
                    if(n>=10)return '浅尝';
                    return '无知';
                };
                const repStage=value=>{
                    const n=Number(value)||0;
                    if(n<=-5000)return '敌对';
                    if(n<=-1000)return '仇视';
                    if(n<500)return '冷淡';
                    if(n<2000)return '中立';
                    if(n<5000)return '友好';
                    if(n<10000)return '崇敬';
                    return '崇拜';
                };
                const chosenArea=exploration.find(([n])=>n===this.selectedArea)||exploration[0];
                const chosenFaction=factionList.find(([n])=>n===this.selectedFaction)||factionList[0];

                html+='<div class="we-notice">这里显示的是结算台账，不是地图数据库：只有 <b>世界.探索</b> 中的整体地标才计探索收益；后台尚未投影的地区不会出现在探索名录中。势力声望同样只记录势力对玩家的真实关系结算。</div>';
                html+='<div class="we-tools">'+['探索','热点','势力'].map(t=>'<button data-directory="'+t+'" class="'+(dir===t?'active':'')+'">'+t+'</button>').join('')+'</div>';

                if(dir==='探索'){
                    const cards=exploration.map(([n,r])=>{
                        const progress=Math.max(0,Math.min(100,Number(r.探索度)||0));
                        const control=r.控制方||'控制权未明';
                        const environment=Array.isArray(r.环境状态)?(r.环境状态.length?r.环境状态.length+'项':'未记录'):r.环境状态||'未记录';
                        return '<button class="we-explore-card '+(chosenArea?.[0]===n?'active':'')+'" data-area="'+text(n)+'">'
                            +'<div class="we-explore-head"><div><small>探索地标</small><h3>'+text(n)+'</h3></div><span class="we-risk-badge">风险 '+text(r.风险||'F')+'</span></div>'
                            +'<div class="we-explore-score"><strong>'+progress+'<small>%</small></strong><span>'+text(progressStage(progress))+'</span></div>'
                            +'<div class="we-explore-bar"><i style="width:'+progress+'%"></i></div>'
                            +'<div class="we-explore-meta"><span>控制 · '+text(control)+'</span><span>环境 · '+text(environment)+'</span></div>'
                            +'<p>'+text(r.描述||r.公开动态||'尚无区域描述')+'</p>'
                            +'</button>';
                    }).join('');
                    const areaDetail=chosenArea?(()=>{
                        const [n,r]=chosenArea;
                        const backstage=regionRecords[n]||{};
                        return '<div class="we-area-detail"><div class="we-area-facts">'+fields({风险:r.风险,控制方:r.控制方||'未明',争夺方:r.争夺方,环境状态:r.环境状态})+'<div class="we-area-note">'+text(r.描述||'暂无已确认的玩家探索描述。')+'</div></div>'
                            +areaSceneBody(backstage)
                            +'<div class="we-area-archive">'+(exists(backstage.进展)||exists(backstage.公开动态)||exists(backstage.资源)||exists(backstage.近期变化)?details('area-world-'+n,{世界进展:backstage.进展,公开动态:backstage.公开动态,资源:backstage.资源,近期变化:backstage.近期变化},'世界地区档案'):'')
                            +(exists(r.隐藏真相)?details('area-truth-'+n,{隐藏真相:r.隐藏真相},'主持人档案'):'')+'</div></div>';
                    })():empty('暂无探索地标','只有已经投影到世界.探索的整体区域才会出现在这里。');
                    html+=section('探索结算名录','<div class="we-explore-grid we-explore-index">'+(cards||empty('暂无探索地标','等待玩家实际发现整体区域。'))+'</div>');
                    html+=section('区域档案',areaDetail,'地区现场与后台档案 · 点击上方地标切换');
                    if(backstageAreas.length){
                        html+=section('后台未投影地区','<details><summary>'+backstageAreas.length+' 个世界地区尚未计入玩家探索奖励</summary>'+backstageAreas.map(([n,r])=>'<div class="we-brief-row"><b>'+text(n)+'</b><span>'+text(r.进展||r.公开动态||r.描述||'后台运行中')+'</span></div>').join('')+'</details>','仅主持人参考 · 不计探索收益');
                    }
                }else if(dir==='热点'){
                    const hotspots=events.filter(([,e])=>e.状态==='进行中');
                    html+=section('当前热点',hotspots.map(([n,e])=>eventCard(n,e)).join('')||empty('暂无进行中的热点','世界当前没有进行中的事件。'));
                }else{
                    const factionCards=factionList.map(([n,r])=>{
                        const rep=Number(r.声望)||0,stage=repStage(rep),width=Math.min(100,Math.max(0,rep)/100);
                        return '<button class="we-faction-card '+(chosenFaction?.[0]===n?'active':'')+'" data-faction="'+text(n)+'"><div class="we-card-top"><h3>'+text(n)+'</h3><span class="we-risk-badge">实力 '+text(r.实力||'F')+'</span></div>'
                            +'<div class="we-rep"><span>声望 '+rep+'</span><b>'+text(stage)+'</b></div><div class="we-explore-bar"><i style="width:'+width+'%"></i></div>'
                            +'<div class="we-muted">'+(rep>0?'正声望奖励权重 '+(rep/100).toFixed(1)+'×（合计上限 3×）':'空间币奖励：0（声望不为正）')+'</div>'
                            +'<p>'+text(r.描述||r.目标||'暂无势力描述')+'</p><small>'+text(r.领地||'领地未记录')+'</small></button>';
                    }).join('');
                    const factionDetail=chosenFaction?'<h3>'+text(chosenFaction[0])+'</h3>'+fields({实力:chosenFaction[1].实力,声望:chosenFaction[1].声望,关系阶段:repStage(chosenFaction[1].声望),领地:chosenFaction[1].领地,目标:chosenFaction[1].目标,描述:chosenFaction[1].描述,当前进展:chosenFaction[1].进展}):empty('暂无势力记录');
                    html+=section('势力结算名录','<div class="we-explore-layout"><div class="we-faction-grid">'+(factionCards||empty('暂无已知势力'))+'</div><aside class="we-area-side">'+section('势力档案',factionDetail,'点击左侧势力切换')+'</aside></div>','声望只反映势力对玩家的真实关系');
                }
            }else if(this.tab==='资产'){
                const ownersOf=asset=>Array.from(new Set((Object.hasOwn(asset,'所属对象')?(Array.isArray(asset.所属对象)?asset.所属对象:[asset.所属对象]):['<user>']).map(x=>String(x??'').trim()).filter(x=>x&&x!=='无主')));
                const assets=entries(s.资产).filter(([,asset])=>plain(asset));
                const list=assets.filter(([name,asset])=>{
                    const owners=ownersOf(asset),category=this.filter||'全部';
                    return (category==='全部'||category==='玩家相关'&&owners.includes('<user>')||category==='共同持有'&&owners.length>1||category==='无主'&&!owners.length)&&matched(name,{...asset,归属:owners.join(' ')});
                });
                html+=tools(['全部','玩家相关','共同持有','无主']);
                html+=section('资产与归属',list.map(([name,asset])=>{
                    const owners=ownersOf(asset);
                    const ownerLinks=owners.length?owners.map(owner=>{
                        const label=owner==='<user>'?(userName||'玩家'):owner;
                        if(owner!=='<user>'&&(relationNamesByKey.has(nameKey(owner))||people.has(owner)))return '<button data-jump-person="'+text(relationNamesByKey.get(nameKey(owner))||owner)+'">'+text(label)+' ↗</button>';
                        if(Object.hasOwn(w.势力||{},owner))return '<button data-faction="'+text(owner)+'" data-asset-owner>'+text(label)+' ↗</button>';
                        return pill(label,'dim');
                    }).join(''):pill('无主','dim');
                    return '<article class="we-card" data-asset-card="'+text(name)+'"><div class="we-card-top"><h3>'+text(name)+'</h3>'+pill(asset.类型||'类型未记录','dim')+'</div><div class="we-tools"><b>所属对象</b>'+ownerLinks+(owners.length>1?pill('共同持有','future'):'')+'</div><p>'+text(asset.状态||'状态未记录')+'</p>'+fields({主体规模:asset.主体规模,完整度:asset.完整度==null?undefined:asset.完整度+'%'})+details('asset-'+name,{能源:asset.能源,建设序列:asset.建设序列,驻扎人员:asset.驻扎人员,待办事件:asset.待办事件},'运转详情 · 建设 / 驻扎 / 待办')+'</article>';
                }).join('')||empty('暂无符合条件的资产'),'共 '+assets.length+' 项 · 可按名称、所属对象或状态搜索');
            }else if(this.tab==='世界事件'){
                const list=events.filter(([n,e])=>matched(n,e)&&((this.filter||'全部')==='全部'||e.状态===this.filter));
                html+=tools(['全部','进行中','待发生','已完成','已取消'])+section('世界事件','<div class="we-timeline">'+(timelineCards(list)||empty('没有符合条件的世界事件','按当前事件、近期节点和宏观节点组织。'))+'</div>','按状态层级与因果顺序排列');
            }else if(this.tab==='传闻'){
                html+=tools();
                for(const category of ['街头巷议','情报交易','布告与檄文'])html+=section(category,entries((s.传闻||{})[category]).filter(([n,r])=>matched(n,r)).map(([n,r])=>'<article class="we-card"><h3>'+text(n)+'</h3><p>'+text(r.内容||r.摘要)+'</p>'+fields({来源:r.来源||r.卖家||r.发布者,可信度:r.可信度,要价:r.要价,位置:r.张贴位置})+details('rumor-'+n,{真实内幕:r.真实内幕},'主持人档案')+'</article>').join('')||empty('暂无'+category,'传闻来自已发生事件与传播渠道。'));
                html+=section('传播链',entries(state.传播).map(([n,r])=>'<article class="we-card"><div class="we-card-top"><h3>'+text(n)+'</h3>'+pill(r.状态,'dim')+'</div><p>'+text(r.内容)+'</p>'+fields({时间:r.时间,来源:r.来源,范围:r.范围,受众:r.受众,到期时间:r.到期时间})+details('spread-'+n,{关联事件:r.关联事件,引发行动:r.引发行动,真相:r.真相},'因果与传播详情')+'</article>').join('')||empty('尚无传播链'));
            }else if(this.tab==='运行记录'){
                if(showRadar&&exists(radar.当前模式))html+=section('干涉模式','<article class="we-card"><p>'+text(radar.当前模式)+'</p></article>');

                const historyMemory=projectWorldHistoryMemory(state);
                html+=section('近期历史锚点',entries(historyMemory.近期锚点).reverse().map(([n,r])=>'<article class="we-card"><div class="we-meta">'+text(r.时间)+'</div><p>'+text(r.事实)+'</p>'+fields({关联事件:r.关联事件})+'</article>').join('')||empty('尚无未收纳的近期历史锚点'),(historyMemory.统计?.原始锚点总数||0)+' 条原始历史 · 仅展示当前热根节点');
                html+=section('长期历史总结',(historyMemory.长期总结||[]).slice().reverse().map(r=>'<article class="we-card"><div class="we-card-top"><h3>'+text(r.名称)+'</h3>'+pill('L'+text(r.层级),'dim')+'</div><div class="we-meta">'+text([r.起始时间,r.结束时间].filter(Boolean).join(' → '))+'</div><p>'+text(r.摘要)+'</p></article>').join('')||empty('尚无长期历史总结','历史锚点积累后会自动分层压缩；底层事实仍保留在MVU。'),(historyMemory.统计?.总结节点总数||0)+' 个总结节点 · 原始历史不删除');
            }else if(this.tab==='设置'){
                const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
                const fontButtons=Object.entries(WORLD_FONT_SCALES).map(([key,item])=>'<button class="we-setting-btn '+(this.config.fontScale===key?'active':'')+'" data-font-option="'+key+'">'+text(item.name)+' · '+text(item.size)+'</button>').join('');
                const presets=api.apiPresets.map(p=>'<option value="'+text(p.name)+'">'+text(p.name)+'</option>').join('');
                const modelOptions=Array.from(new Set([api.model,...api.fetchedModels].filter(Boolean))).map(model=>'<option value="'+text(model)+'"></option>').join('');
                const terminalReady=!!(this.host.Samsara?.terminal?.apiReady?.());
                const sourceState=this.usesDedicatedApi()
                    ?(this.dedicatedApiReady()?'专属 API 已就绪':'专属 API 已接管，但配置尚不完整')
                    :(terminalReady?'使用主神终端额外模型':'主神终端额外模型尚未准备好');
                html+=section('界面字号','<div class="we-setting-row"><div class="we-setting-copy"><b>界面字号</b><small>色调跟随主神终端；这里仅调整世界推进自己的文字大小。</small></div><div class="we-setting-actions">'+fontButtons+'</div></div>','色调跟随主神终端 · 默认标准 16px');
                const historyToProse=this.config.sendHistoryToProse===true;
                html+=section('历史记忆','<div class="we-setting-row"><div class="we-setting-copy"><b>向正文提供历史记忆</b><small>开启后，正文AI额外读取“近期原始锚点 + 更早长期总结”；关闭只影响正文，世界推进自身仍始终使用完整的分层历史脉络。</small></div><div class="we-setting-actions"><button class="we-setting-btn we-switch '+(historyToProse?'on':'')+'" data-action="history-prose-toggle"><span>'+text(historyToProse?'已启用':'未启用')+'</span><span class="we-switch-track"><i></i></span></button></div></div>','默认关闭 · 原始历史事实不会因关闭而删除');
                html+=section('模型接口',
                    '<div class="we-setting-row"><div class="we-setting-copy"><b>当前调用来源</b><small>'+text(sourceState)+'</small></div><div class="we-setting-actions"><span class="we-source-badge">'+text(this.apiSourceLabel())+'</span></div></div>'
                    +'<div class="we-setting-row"><div class="we-setting-copy"><b>世界推进专属 API</b><small>开启后世界推进只走这里，不再调用状态栏 / 主神终端的 API；即使配置不完整也不会偷偷回退。</small></div><div class="we-setting-actions"><button class="we-setting-btn we-switch '+(api.enabled?'on':'')+'" data-action="dedicated-toggle"><span>'+text(api.enabled?'已启用':'未启用')+'</span><span class="we-switch-track"><i></i></span></button></div></div>'
                    +(api.enabled
                        ?'<div class="we-api-toolbar"><select class="we-setting-input" data-dedicated-preset><option value="">— 选择已保存 API 预设 —</option>'+presets+'</select><input class="we-setting-input" data-dedicated-preset-name maxlength="80" placeholder="预设名称"><button class="we-setting-btn" data-action="dedicated-preset-save">保存预设</button><button class="we-setting-btn" data-action="dedicated-preset-delete">删除预设</button></div>'
                         +'<div class="we-api-grid"><label class="wide">API 地址<input class="we-setting-input" data-dedicated-field="apiUrl" value="'+text(api.apiUrl)+'" placeholder="https://example.com/v1"></label><label class="wide">API Key<input class="we-setting-input" data-dedicated-field="apiKey" type="password" value="'+text(api.apiKey)+'" autocomplete="off" placeholder="sk-..."></label><label>模型<input class="we-setting-input" data-dedicated-field="model" list="we-dedicated-models" value="'+text(api.model)+'" placeholder="输入或加载模型名"><datalist id="we-dedicated-models">'+modelOptions+'</datalist></label><label>模型目录<span class="we-setting-actions"><button class="we-setting-btn" data-action="dedicated-models">加载模型 / 测试连接</button></span></label></div>'
                         +'<p class="we-muted">接口按 OpenAI-compatible /v1/chat/completions 与 /v1/models 方式连接，并保留 JSON Schema → JSON Object → 普通文本的结构化兼容降级。</p>'
                        :'<div class="we-notice">当前关闭专属 API。世界推进继续使用主神终端「额外模型配置」；这里不会复制或读取状态栏里的 API Key。</div>')
                    ,'接口配置只存本地 localStorage，不写入 MVU');
            }else if(this.tab==='提示词预设'){
                const promptView=this.promptDraft||{
                    preset:this.config.preset,
                    corePrompt:this.config.corePrompt??CORE_WORLD_RULES,
                    macroPrompt:this.config.macroPrompt??DEFAULT_MACRO_PROMPT,
                    stabilityPromptTemplate:this.config.stabilityPromptTemplate??DEFAULT_STABILITY_PROMPT_TEMPLATE,
                    structurePrompt:this.config.structurePrompt,
                    npcAuditPrompt:this.config.npcAuditPrompt,
                    contextTurns:this.config.contextTurns||6,
                    activationMode:this.config.activationMode||'respect_activation',
                    selectedEntries:Array.isArray(this.config.selectedEntries)?copy(this.config.selectedEntries):null
                };
                const docs=this.getPromptDocuments(),activeDoc=docs.find(doc=>doc.id===this.config.activePromptDocumentId);
                html+='<div class="we-preset-toolbar"><div><b>提示词工作台</b><small>主要操作固定在顶部，不需要再滚到页面底部寻找保存。</small></div><div><button class="we-btn we-primary" data-action="save">保存当前设置</button><button class="we-btn" data-action="save-default">保存为个人默认</button><button class="we-btn" data-action="preview">预览下一次请求</button></div></div>';
                html+=section('预设文档','<div class="we-doc-create"><input data-doc-name maxlength="80" placeholder="文档名称，例如：原著推进·标准" value="'+text(activeDoc?.builtin?'':activeDoc?.name||'')+'"><button class="we-btn we-primary" data-action="doc-save">保存为文档</button><button class="we-btn" data-action="doc-import">导入文档</button><input data-doc-import type="file" accept=".json,application/json" hidden></div>'+
                    (docs.length?'<div class="we-doc-list">'+docs.map(doc=>'<div class="we-doc-row"><div><b>'+text(doc.name)+(doc.builtin?' <span class="we-doc-badge">内置默认</span>':'')+'</b><small>'+text(doc.updatedAt?new Date(doc.updatedAt).toLocaleString():'未记录时间')+(doc.id===this.config.activePromptDocumentId?' · 当前应用':'')+'</small></div><span class="we-doc-actions"><button data-action="doc-apply" data-doc-id="'+text(doc.id)+'">应用</button><button data-action="doc-export" data-doc-id="'+text(doc.id)+'">导出</button>'+(doc.builtin?'':'<button data-action="doc-delete" data-doc-id="'+text(doc.id)+'">删除</button>')+'</span></div>').join('')+'</div>':empty('还没有预设文档','保存当前设置后，可以在这里应用、导出或删除。')),'内置“默认设置”始终跟随代码版本；“保存为个人默认”会另存全部可编辑提示词、正文窗口与资料范围，不会覆盖内置模板');
                html+='<div class="we-notice">世界书目录会读取角色主书、角色附加书、当前聊天绑定书和酒馆全局启用书。蓝绿灯表示条目触发方式；“实际读取”仍以请求检查中的本次清单为准。</div>';
                const groups=new Map();
                for(const e of this.bookCatalogue||[]){if(!groups.has(e.book))groups.set(e.book,[]);groups.get(e.book).push(e);}
                const selectedEntries=Array.isArray(promptView.selectedEntries)?promptView.selectedEntries:null;
                const selected=e=>!e.technical&&(this.isNpcAuditWorldbook(e)?this.isNpcBuildAuditEnabled():selectedEntryMatches(e,selectedEntries));
                html+=section('资料读取范围','<div class="we-config-row"><label>正文窗口 <input data-floors type="number" min="1" max="100" value="'+text(promptView.contextTurns||6)+'"> 层</label><label>读取方式 <select data-activation><option value="respect_activation" '+(promptView.activationMode!=='force_selected'?'selected':'')+'>遵循蓝绿灯</option><option value="force_selected" '+(promptView.activationMode==='force_selected'?'selected':'')+'>强制读取勾选项</option></select></label></div><p class="we-muted">遵循蓝绿灯：蓝灯常驻，绿灯扫描上述正文窗口关键词；禁用项不读。强制模式可纳入普通禁用项，但 [variables]、[mvu_update]、正文额外思考及任务/输出技术条目始终隔离。未绑定且未全局启用的世界书不会被自动读取。</p><div class="we-tools"><button data-action="books">加载 / 刷新目录</button><button data-action="book-all">全选</button><button data-action="book-none">全不选</button></div>'+
                    (groups.size?Array.from(groups).map(([book,list])=>'<details class="we-book" open><summary>'+text(book)+' <small>'+text((list[0]?.sources||[]).join(' · ')||'已绑定')+' · '+list.filter(selected).length+' / '+list.length+' 项已勾选</small></summary><div class="we-book-list">'+list.map(e=>{
                        const report=(this.readReport||[]).find(r=>r.世界书===e.book&&r.条目ID===e.id);
                        return '<label class="we-book-row"><input type="checkbox" data-book value="'+text(JSON.stringify([e.book,e.id]))+'" '+(selected(e)?'checked':'')+' '+(e.technical?'disabled':'')+'><span class="we-lamp '+(e.technical?'gray':e.mode==='constant'?'blue':e.mode==='selective'?'green':'gray')+'" title="'+text(e.technical?'技术条目 · 已隔离':e.mode==='constant'?'蓝灯 · 常驻':e.mode==='selective'?'绿灯 · 关键词触发':'其他激活方式')+'"></span><span class="we-book-title"><b>'+text(e.title)+'</b><small>'+text(e.technical?'技术条目 · 世界引擎不读取':(e.mode==='constant'?'常驻':e.mode==='selective'?'关键词：'+(Array.isArray(e.keys)?e.keys.map(k=>typeof k==='string'?k:'正则条件').join('、'):e.keys):e.mode)+(e.enabled?'':' · 已禁用'))+'</small></span><small class="we-read-state">'+text(report?'上次检查：'+report.原因:e.technical?'固定隔离':'尚未检查')+'</small></label>';
                    }).join('')+'</div></details>').join(''):empty('尚未加载目录','点击“加载 / 刷新目录”读取当前绑定和全局启用的世界书。')));
                const segments=splitPresetSegments(promptView.preset);
                html+=section('分段提示词','<div class="we-segment-toolbar"><span>默认只读，展开查看；开启编辑后可修改。</span><button class="we-btn" data-action="prompt-edit" aria-pressed="'+!!this.promptEditing+'">'+(this.promptEditing?'锁定编辑':'开启编辑')+'</button><button class="we-btn" data-action="segment-add" '+(this.promptEditing?'':'disabled')+'>＋ 新增分段</button></div><div class="we-segment-list" data-segment-list>'+segments.map((part,i)=>'<details class="we-segment" data-segment-row><summary>'+text(part.title||'未命名分段')+' <small>'+formatTokenCount(estimateTokens(part.body),true)+'</small></summary><div class="we-segment-head"><input '+(this.promptEditing?'':'readonly')+' data-segment-title aria-label="分段标题 '+i+'" placeholder="分段标题（可留空）" value="'+text(part.title)+'"><small>'+formatTokenCount(estimateTokens(part.body),true)+'</small><span class="we-segment-actions"><button type="button" '+(this.promptEditing?'':'disabled')+' data-action="segment-up" title="上移">↑</button><button type="button" '+(this.promptEditing?'':'disabled')+' data-action="segment-down" title="下移">↓</button><button type="button" '+(this.promptEditing?'':'disabled')+' data-action="segment-delete" title="删除">删除</button></span></div><textarea '+(this.promptEditing?'':'readonly')+' data-segment="'+i+'" data-title="'+text(part.title)+'" aria-label="预设分段 '+i+'">'+text(part.body)+'</textarea></details>').join('')+'</div><p class="we-muted">这些分段属于主要工作层，可以新增、删除或调整顺序。核心约束与条件提示词在下方单独编辑，并与同一预设文档一起保存。</p>');
                html+=section('系统提示词','<div class="we-notice">这里展示的文本都会直接参与实际 system 请求，并随预设文档保存、应用、导入和导出。条件提示词只在对应条件成立时发送；只有程序字段 Schema 保持固定。</div>'+                    '<details class="we-segment"><summary>世界引擎核心约束 · '+(this.promptEditing?'编辑中':'点击展开')+'</summary><textarea data-core-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.corePrompt??CORE_WORLD_RULES)+'</textarea><p class="we-muted">始终发送。可修改或留空；留空即不额外注入核心约束。</p></details>'+                    '<details class="we-segment"><summary>宏观骨架交付 · 条件提示词</summary><textarea data-macro-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.macroPrompt??DEFAULT_MACRO_PROMPT)+'</textarea><p class="we-muted">仅在本轮需要建立/补足宏观骨架时发送。</p></details>'+                    '<details class="we-segment"><summary>世界自救 · 条件提示词模板</summary><textarea data-stability-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.stabilityPromptTemplate??DEFAULT_STABILITY_PROMPT_TEMPLATE)+'</textarea><p class="we-muted">世界稳定值低于100且未开启世界超稳时发送。可使用 {{阶段}}、{{稳定值}}、{{规则}} 占位符。</p></details>'+                    '<details class="we-segment"><summary>角色管理 · NPC构筑审计 · '+(this.isNpcBuildAuditEnabled()?'当前启用':'当前关闭')+'</summary><textarea data-npc-audit-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.npcAuditPrompt??NPC_BUILD_AUDIT_RULES)+'</textarea><p class="we-muted">无论开关状态都可编辑并保存；只有开启审计且本轮存在审计对象时才发送。</p></details>','核心与条件提示词均可编辑');
                html+=section('WorldResult 输出协议','<details class="we-segment"><summary>WorldResult 协议说明 · 点击展开</summary><textarea data-structure-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.structurePrompt??protocol().split('【Canonical WorldResult JSON Schema】')[0].trim())+'</textarea></details><details class="we-segment"><summary>程序字段 Schema · 只读</summary><textarea readonly>'+text(JSON.stringify(WORLD_RESULT_SCHEMA,null,2))+'</textarea></details><p class="we-muted">协议说明使用上方编辑开关。保存后用于实际 system 请求；Schema 固定只读，修改任何文字提示词都不会改变程序变量结构。</p>');
            }else if(this.tab==='请求检查'){
                const fold=(title,body)=>'<details class="we-inspect"><summary>'+text(title)+'</summary><div class="we-inspect-body">'+body+'</div></details>';
                const raw=(label,v)=>fold(label,'<textarea class="we-raw" readonly>'+text(v)+'</textarea>');
                const readable=(name,v)=>Array.isArray(v)?v.map((item,i)=>fold((item.名称||item.楼层!==undefined&&(item.角色+' · 第 '+item.楼层+' 层')||name+' '+(i+1)),fields(item))).join(''):fields(plain(v)?v:{内容:v});
                const retryLog=(this.lastRetryLog||[]).map(item=>{
                    const feedback=retryFeedback(item.错误,Array.isArray(item.片段)?item.片段:[],Array.isArray(item.补充清单)?item.补充清单:[]);
                    const details=feedback.issues.length?'<p><b>具体问题</b><br>'+feedback.issues.map(text).join('<br>')+'</p>':'';
                    const guidance=feedback.actions.length?'<p><b>修复要求</b><br>'+feedback.actions.map(text).join('<br>')+'</p>':'';
                    return '<div class="we-change"><time>#'+text(item.尝试)+'</time><div><b>模型回复被拒绝</b><p>'+text(feedback.summary)+'</p>'+details+guidance+'</div></div>';
                }).join('');
                const tokenLabel=(value,estimated=true)=>Number.isFinite(Number(value))?formatTokenCount(Number(value),estimated):'—';
                html+=section('失败自动重试','<div class="we-config-row"><label>最大尝试次数 <input data-retries type="number" min="1" max="5" value="'+text(this.config.retryAttempts??5)+'"> 次</label><span class="we-muted">包含首次请求。1 = 只请求一次；5 = 最多总共尝试 5 次。只纠正 WorldResult 业务结果/编译校验，危险越权、上下文变化和写入未确认不会自动重试。</span></div>'+(this.lastAttemptCount?'<p class="we-muted">最近一次共尝试 '+text(this.lastAttemptCount)+' 次；每次模型业务拒绝都会在下方完整保留，包括最后一次失败。</p>':'')+(retryLog||''));
                html+='<div class="we-tools"><button data-action="preview">生成下一次请求预览（不调用 API）</button></div>';
                for(const [label,r] of [['最近实际发送',this.lastRequest],['下一次请求预览',this.previewRequest]]){
                    if(!r){html+=section(label,empty('暂无'+label));continue;}
                    const m=r.manifest||{},books=m.世界书条目||[],floors=m.正文楼层||[],obs=m.观测||requestTokenTelemetry(r.system,r.input,r.schema||WORLD_RESULT_SCHEMA);
                    const readChecks=(m.读取判定||[]).filter(item=>item.读取===true);
                    const exactInput=obs.实际输入Tokens!=null,exactOutput=obs.实际输出Tokens!=null;
                    let body='<div class="we-request-summary">'+pill(m.输出协议||'WorldResult v1','dim')+pill('结构化 '+(obs.结构化实际模式||m.结构化输出||'auto'),'dim')+pill(obs.接口来源||m.接口来源||this.apiSourceLabel(),'dim')+pill(books.length+' 条世界书','dim')+pill(floors.length+' 层正文','dim')+pill((exactInput?tokenLabel(obs.实际输入Tokens,false):tokenLabel(obs.请求估算Tokens,true))+' 输入','dim')+(obs.输出估算Tokens!=null?pill((exactOutput?tokenLabel(obs.实际输出Tokens,false):tokenLabel(obs.输出估算Tokens,true))+' 输出','dim'):'')+(m.尝试序号?pill('尝试 '+m.尝试序号,'dim'):'')+(m.最大尝试次数!==undefined?pill('最多尝试 '+m.最大尝试次数,'dim'):'')+'</div>';
                    const userTokenFields=Object.fromEntries((obs.User分段||[]).map(item=>[item.名称,tokenLabel(item.估算Tokens,true)]));
                    body+='<p class="we-muted">带“≈”的 tk 只是本地容量粗估，不等于服务商真实 token；主神终端通道拿不到 usage 时无法确认精确总量。总输入 = System + 下列 User 分项；这里不再重复显示 User 总项或 Schema 子项。专属 API 返回 usage 时仅总输入/输出改用服务端实际 token。</p>';
                    body+=fold('Token 构成（点击展开）',fields(Object.assign({总输入:exactInput?tokenLabel(obs.实际输入Tokens,false):tokenLabel(obs.请求估算Tokens,true),System:tokenLabel(obs.System估算Tokens,true)},userTokenFields,{接口:obs.接口来源||m.接口来源||'',模型:obs.模型||'',模式尝试:Array.isArray(obs.模式尝试)&&obs.模式尝试.length?obs.模式尝试.join(' → '):'',耗时:Number.isFinite(Number(obs.耗时毫秒))?(Number(obs.耗时毫秒)/1000).toFixed(2).replace(/\.00$/,'')+' s':''}))+fold('system 分段',fields({分段:(obs.System分段||[]).map(item=>item.名称+' · '+tokenLabel(item.估算Tokens,true))})));
                    body+=fold('本轮实际读取资料（点击展开）',(readChecks.length?readable('条目',readChecks):empty('本轮未读取世界书','没有勾选命中或强制读取的世界书条目。'))+fold('实际读取世界书',fields({条目:books.map(item=>item.名称+' · '+tokenLabel(item.估算Tokens,true))}))+fold('实际正文楼层',fields({楼层:floors.map(f=>'第 '+f.楼层+' 层 · '+f.角色+' · '+tokenLabel(f.估算Tokens,true))}))+fold('时间容量',fields(m.本轮时间容量||{})));
                    body+=fold('输出契约 · JSON Schema',raw('samsara_world_result_v1',JSON.stringify(r.schema||WORLD_RESULT_SCHEMA,null,2)));
                    body+=fold('system · 分段阅读',r.system.split(/\n(?=【)/).map((part,i)=>fold((part.match(/^【([^】]+)】/)||[])[1]||'身份 / 协议 '+(i+1),'<div class="we-prose">'+text(part)+'</div>')).join(''))+raw('system · 实际发送原文',r.system);
                    let payload;try{payload=JSON.parse(r.input);}catch(_){payload={正文:r.input};}
                    body+=fold('user · 分段阅读',Object.entries(payload).map(([name,v])=>fold(name,readable(name,v))).join(''))+raw('user · 实际发送原文',r.input);
                    html+=section(label,body);
                }
                if(this.lastWorldResult)html+=section('最近 WorldResult · 业务层',raw('模型已接受并累计的业务结果',JSON.stringify(this.lastWorldResult,null,2)));
                if((this.lastCompiledPatches||[]).length)html+=section('程序编译补丁 · 存储层',raw('由 WorldResult Compiler 生成，模型不直接控制这些路径',JSON.stringify(this.lastCompiledPatches,null,2)));
                if((this.lastCompileWarnings||[]).length)html+=section('编译警告',(this.lastCompileWarnings||[]).map(w=>'<div class="we-notice">'+text(w)+'</div>').join(''));
                if(this.lastFailure)html+='<div class="we-notice">'+text(this.lastFailure)+'</div>';
                if(this.lastReply){const lastAttempt=(this.lastAttemptTelemetry||[]).at(-1),replyTk=lastAttempt?.API输出Tokens!=null?formatTokenCount(lastAttempt.API输出Tokens,false):formatTokenCount(estimateTokens(this.lastReply),true);html+=section('副 API 原始回复 · '+replyTk,raw('查看模型返回原文（用于定位格式问题）',this.lastReply));}
            }
            main.innerHTML=html;main.scrollTop=force?0:scroll;
            if(this.jumpEvent){
                const jumpName=this.jumpEvent;
                const target=Array.from(main.querySelectorAll('[data-event-card]')).find(el=>el.dataset.eventCard===jumpName);
                if(target){
                    target.classList.add('is-jump');
                    target.scrollIntoView({behavior:'smooth',block:'center'});
                    setTimeout(()=>target.classList.remove('is-jump'),1200);
                }
                this.jumpEvent='';
            }
        }
        dispose() {
            this.close(); this.disposed = true; this.cancel(); clearTimeout(this.initTimer);
            this.unsub.forEach(off => off()); this.unsub = [];
            if (this.keyHandler) this.host.document.removeEventListener('keydown',this.keyHandler,true);
            if (this.panel) this.panel.remove(); if (this.style) this.style.remove();
            if (this.mount) this.mount.remove();
        }
    }
    // 可选策略层：NPC 构筑审计默认关闭；同时吸收主变量 Schema 的派生缓存，并提供可执行的事件纠错信息。
    let NPC_BUILD_AUDIT_FEATURE_ENABLED=false;
    const npcBuildAuditBeforeFeatureSwitch=npcBuildAudit;
    npcBuildAudit=function(stat,limit=NPC_BUILD_AUDIT_LIMIT) {
        if(!NPC_BUILD_AUDIT_FEATURE_ENABLED)return [];
        return npcBuildAuditBeforeFeatureSwitch(stat,limit);
    };

    const validateStateBeforeActionableEventRefs=validateState;
    validateState=function(stat) {
        const events=stat?.世界?.[PATH]?.事件||{};
        if(plain(events)){
            for(const [name,event] of Object.entries(events)){
                const parents=Array.isArray(event?.前因)?event.前因.filter(Boolean):[];
                if(parents.includes(name))throw new Error('事件前因非法自引用：'+name+'；前因不能引用事件自身，无明确前因请使用 []');
                const missing=parents.filter(id=>!Object.hasOwn(events,id));
                if(missing.length)throw new Error('事件前因不存在：'+name+' <- '+missing.join('、')+'；前因只能引用已经存在，或本轮同时提交且成功建立的事件名称；当前阶段/自然语言原因不能作为前因，无明确前因请使用 []');
            }
        }
        return validateStateBeforeActionableEventRefs(stat);
    };

    const retryPlanBeforeActionableEventRefs=retryPlanForFailure;
    retryPlanForFailure=function(error,rejected=[]) {
        const messages=[String(error?.message||error||''),...(rejected||[]).map(item=>String(item?.原因||''))].join('\n');
        const plan=retryPlanBeforeActionableEventRefs(error,rejected).map(line=>String(line)
            .replace('且每个名称都必须对应已建立且未取消的宏观节点。','且每个名称都必须对应已建立且未取消的宏观节点；不要写当前阶段、当前事件或近期节点。'));
        if(/事件前因(?:不存在|非法自引用)/.test(messages))plan.push('事件前因：先修复链首缺失或自引用，再重新提交受影响的后继节点。前因数组只放事件名称，且须已存在或同轮成功建立；当前阶段/自然语言原因不算事件，无明确前因写 []。不得为消除报错凭空补造事件。');
        if(/字段未通过完整 Schema 校验/.test(messages))plan.push('Schema纠错：只修报错路径中的业务字段；真属性/最终属性/强化属于后台派生缓存，模型不得补写，这类派生差异由程序吸收。');
        return Array.from(new Set(plan.filter(Boolean)));
    };

    const makeRetryFailureBeforeConcreteReasons=makeRetryFailure;
    makeRetryFailure=function(rejected,globalError) {
        const error=makeRetryFailureBeforeConcreteReasons(rejected,globalError);
        const feedback=retryFeedback(error,rejected,error.retryPlan);
        error.retryPlan=feedback.actions;
        if(feedback.issues.length)error.message=feedback.summary+'\n\n具体原因\n'+feedback.issues.join('\n');
        return error;
    };

    // NPC 构筑审计本身已经计算了精确缺口；这里仅增强失败反馈，不改变原有通过/驳回判定。
    const ensureNpcBuildAuditProgressBeforeConcreteFeedback=ensureNpcBuildAuditProgress;
    ensureNpcBuildAuditProgress=function(next,required=[],acceptedResult) {
        try{return ensureNpcBuildAuditProgressBeforeConcreteFeedback(next,required,acceptedResult);}
        catch(error){
            if(!/NPC构筑审计未推进/.test(String(error?.message||error||'')))throw error;
            const proposals=Array.isArray(acceptedResult?.关系)?acceptedResult.关系:[];
            const details=[];
            for(const before of required||[]){
                const target=stableNameIn(next?.关系列表||{},before.名称);
                if(!target)continue;
                const after=npcBuildAssessment(next,target,next.关系列表[target]);
                if(!after)continue;
                const proposal=proposals.find(item=>nameKey(item?.名称)===nameKey(before.名称));
                const touched=proposal&&(before.建议字段||[]).some(field=>Object.hasOwn(proposal,field));
                if(touched&&after.缺口.length<before.缺口.length)continue;
                const submitted=proposal?Object.keys(proposal).filter(field=>!['名称','操作'].includes(field)):[];
                const unresolved=(after.缺口||[]).length?after.缺口:before.缺口||[];
                const suggested=(after.建议字段||before.建议字段||[]).filter(Boolean);
                details.push(
                    before.名称+'：未解决缺口：'+(unresolved.length?unresolved.join('、'):'未识别')
                    +'；建议修复字段：'+(suggested.length?suggested.join('、'):'无')
                    +'；本轮实际提交：'+(submitted.length?submitted.join('、'):'无')
                );
            }
            if(!details.length)throw error;
            throw new Error('NPC构筑审计未推进：\n'+details.map(item=>' - '+item).join('\n')+'\n修复要求：每个列出的审计对象本轮至少补齐一个真实缺口；禁止只改好感、HP或无关字段。');
        }
    };

    const WORLD_STATE_DERIVED_SCHEMA_KEYS=new Set(['真属性','最终属性','强化']);
    function syncWorldStateDerivedSchemaFields(target,checked) {
        if(Array.isArray(target)&&Array.isArray(checked)){
            const count=Math.min(target.length,checked.length);
            for(let i=0;i<count;i++)syncWorldStateDerivedSchemaFields(target[i],checked[i]);
            return;
        }
        if(!plain(target)||!plain(checked))return;
        for(const key of WORLD_STATE_DERIVED_SCHEMA_KEYS){
            if(Object.hasOwn(checked,key))target[key]=checked[key]===undefined?undefined:copy(checked[key]);
            else if(Object.hasOwn(target,key))delete target[key];
        }
        for(const key of Object.keys(checked)){
            if(WORLD_STATE_DERIVED_SCHEMA_KEYS.has(key)||!Object.hasOwn(target,key))continue;
            syncWorldStateDerivedSchemaFields(target[key],checked[key]);
        }
    }
    function alignWorldStateSchemaOrder(checked,target) {
        if(Array.isArray(checked))return checked.map((value,index)=>alignWorldStateSchemaOrder(value,Array.isArray(target)?target[index]:undefined));
        if(plain(checked)&&plain(target)){
            const out={};
            for(const key of Object.keys(target))if(Object.hasOwn(checked,key))out[key]=alignWorldStateSchemaOrder(checked[key],target[key]);
            for(const key of Object.keys(checked))if(!Object.hasOwn(out,key))out[key]=alignWorldStateSchemaOrder(checked[key],target[key]);
            return out;
        }
        return checked;
    }

    const SamsaraWorldEngineBeforeNpcAuditSwitch=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeNpcAuditSwitch {
        constructor(host,env) {
            super(host,env);
            const hadSetting=Object.hasOwn(this.config,'npcBuildAuditEnabled');
            this.config.npcBuildAuditEnabled=this.config.npcBuildAuditEnabled===true;
            this.syncNpcBuildAuditFeature();
            if(!hadSetting)this.saveConfig();
        }
        syncNpcBuildAuditFeature() {
            NPC_BUILD_AUDIT_FEATURE_ENABLED=this.config.npcBuildAuditEnabled===true;
            this.syncNpcAuditWorldbookSelection();
            return NPC_BUILD_AUDIT_FEATURE_ENABLED;
        }
        isNpcBuildAuditEnabled() { return this.config.npcBuildAuditEnabled===true; }
        isNpcAuditWorldbook(entry) {
            return ['实体生成规则','NPC生成规则','状态协议'].includes(normalizeWorldbookEntryTitle(entry.title));
        }
        syncNpcAuditWorldbookSelection(catalogue=this.bookCatalogue||[]) {
            const matches=catalogue.filter(entry=>this.isNpcAuditWorldbook(entry));
            if(!matches.length)return;
            const sync=settings=>{
                if(!settings)return;
                const previous=settings.selectedEntries;
                let selected=Array.isArray(previous)?copy(previous):catalogue.filter(entry=>!entry.technical&&selectedEntryMatches(entry,previous)).map(entry=>JSON.stringify([entry.book,entry.id]));
                selected=selected.filter(raw=>!matches.some(entry=>selectedEntryMatches(entry,[raw])));
                if(this.isNpcBuildAuditEnabled())for(const entry of matches){
                    if(!entry.technical)selected.push(JSON.stringify([entry.book,entry.id]));
                }
                if(JSON.stringify(previous)!==JSON.stringify(selected))settings.selectedEntries=selected;
            };
            sync(this.config);
            sync(this.promptDraft);
            sync(this.getPromptDocuments().find(doc=>doc.id===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id)?.settings);
        }
        async catalogue() {
            const result=await super.catalogue();
            this.bookCatalogue=result;
            this.syncNpcAuditWorldbookSelection(result);
            this.saveConfig();
            return result;
        }
        applyPromptSettings(settings) {
            super.applyPromptSettings(settings);
            this.syncNpcAuditWorldbookSelection();
            this.saveConfig();
            return this.config;
        }

        setNpcBuildAuditEnabled(value) {
            const wasBusy=!!this.busy;
            if(wasBusy)this.cancel();
            this.config.npcBuildAuditEnabled=value===true;
            this.syncNpcBuildAuditFeature();
            this.saveConfig();
            this.status=(this.config.npcBuildAuditEnabled?'NPC构筑审计已启用':'NPC构筑审计已关闭')+(wasBusy?' · 已停止当前推演':'');
            this.render(true);
            return this.config.npcBuildAuditEnabled;
        }
        async buildRequest(base) {
            this.syncNpcBuildAuditFeature();
            return super.buildRequest(base);
        }
        async run() {
            this.syncNpcBuildAuditFeature();
            const samsara=this.host&&this.host.Samsara,validate=samsara&&samsara.validateWorldState;
            if(typeof validate!=='function')return super.run();
            const wrapped=function(stat){
                const checked=validate.call(samsara,stat);
                syncWorldStateDerivedSchemaFields(stat,checked);
                return alignWorldStateSchemaOrder(checked,stat);
            };
            samsara.validateWorldState=wrapped;
            try{return await super.run();}
            finally{if(samsara.validateWorldState===wrapped)samsara.validateWorldState=validate;}
        }
        compactFooterChrome() {
            if(!this.panel)return;
            const footer=this.panel.querySelector('footer');
            if(!footer)return;
            if(this.style&&!this.style.textContent.includes('.we-footer-status{')){
                this.style.textContent+='\n#sam-world-engine footer{align-items:center;min-width:0;overflow:hidden}\n'
                    +'#sam-world-engine footer .we-footer-status{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n'
                    +'#sam-world-engine footer .we-footer-meta{flex:0 0 auto;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}\n'
                    +'@media(max-width:760px){#sam-world-engine footer .we-footer-meta{max-width:42%}}\n';
            }
            let status=footer.querySelector('.we-footer-status'),meta=footer.querySelector('.we-footer-meta');
            if(!status){
                const legacyStatus=footer.querySelector('span'),legacyMeta=footer.querySelector('small');
                const rawStatus=String(legacyStatus?.textContent||this.status||'').trim();
                const rawMeta=String(legacyMeta?.textContent||'').trim();
                status=this.host.document.createElement('span');
                status.className='we-footer-status';status.textContent=rawStatus;status.title=rawStatus;
                meta=this.host.document.createElement('span');
                meta.className='we-footer-meta';
                const version=rawMeta.match(/build\s*v?[\d.]+/i)||rawMeta.match(/\bv?\d+(?:\.\d+){1,3}\b/i);
                meta.textContent=version?version[0]:'世界推进';
                meta.title=rawMeta;
                footer.replaceChildren(status,meta);
            }else{
                status.title=String(status.textContent||this.status||'').trim();
                if(meta&&!meta.title)meta.title=String(meta.textContent||'').trim();
            }
        }
        createPanel() {
            super.createPanel();
            this.compactFooterChrome();
            if(!this.panel||this.panel.__npcAuditToggleBound)return;
            Object.defineProperty(this.panel,'__npcAuditToggleBound',{value:true,configurable:true});
            this.panel.addEventListener('click',event=>{
                const button=event.target?.closest?.('[data-action="npc-audit-toggle"]');
                if(!button||!this.panel.contains(button))return;
                this.setNpcBuildAuditEnabled(!this.isNpcBuildAuditEnabled());
            });
        }
        render(force) {
            const result=super.render(force);
            this.renderNpcBuildAuditSetting();
            this.compactFooterChrome();
            return result;
        }
        renderNpcBuildAuditSetting() {
            if(!this.panel)return;
            const enabled=this.isNpcBuildAuditEnabled(),main=this.panel.querySelector('main');
            if(!main)return;
            const old=main.querySelector('[data-npc-audit-setting]');
            if(old)old.remove();
            if(this.tab==='设置'){
                const block=this.host.document.createElement('section');
                block.className='we-section';block.setAttribute('data-npc-audit-setting','');
                block.innerHTML='<div class="we-section-head"><h2>NPC构筑审计 <span class="we-pill future">实验性功能</span></h2><small>备选功能 · 默认关闭</small></div>'
                    +'<div class="we-setting-row"><div class="we-setting-copy"><b>自动补全热 NPC 构筑</b><small>关闭时不扫描或补写职业、血统、装备、技能、形态；关系仍按实际剧情正常稀疏同步。开启后才对热 NPC 执行构筑缺口审计。实体生成规则、NPC生成规则、状态协议的资料勾选随此开关同步。</small></div>'
                    +'<div class="we-setting-actions"><button class="we-setting-btn we-switch '+(enabled?'on':'')+'" data-action="npc-audit-toggle" aria-pressed="'+enabled+'"><span>'+(enabled?'已启用':'未启用')+'</span><span class="we-switch-track"><i></i></span></button></div></div>';
                const sections=Array.from(main.children),modelSection=sections.find(section=>section.querySelector?.('h2')?.textContent?.trim()==='模型接口');
                main.insertBefore(block,modelSection||null);
            }else if(this.tab==='角色管理'&&!enabled){
                for(const note of main.querySelectorAll('.we-muted')){
                    if(note.textContent.includes('进入世界推进请求的热人物会由后台优先补齐缺口'))note.textContent='自动构筑审计当前关闭；此处只显示诊断，可在“设置”中临时启用自动补全。';
                }
            }
        }
    };
    // 传闻是常驻活跃层：公开传闻保证世界始终有可见动向，后台传播负责其因果来源与人物知情链。
    const RUMOR_LIVELINESS_TOPICS=['悬赏线索','商路动向','势力情报','遗迹坐标','人物行踪','黑市消息','宝物传闻','怪物异动','深渊异变','种族摩擦','物价波动'];
    const RUMOR_PUBLIC_CATEGORIES=['街头巷议','情报交易','布告与檄文'];
    const RUMOR_VISIBLE_LIMIT=3;
    const RUMOR_STALE_HOURS=72;
    const RUMOR_LIVELINESS_RULES=`【传闻与传播 · 常驻活跃层】
1. 街头巷议、情报交易、布告与檄文各自展示最近3条；某类为空时本轮补2条。单条约60字，除非影响重大，不围绕<user>。
   可直接追加新名称，程序会在合并后自动滚动淘汰最旧条目，不需要为容量主动提交「操作:移除」。沿用原名称视为刷新该条传闻，并优先保留；仅在传闻本身已失效、撤销或需要明确删除时使用「操作:移除」。
2. 街头巷议随当前地区、说书人/目击者和局势替换1~2条；情报交易有卖家时更新1~2条，购买、付款与消费性删除由MVU按正文结果处理；布告与檄文随当前地区与发布势力替换。
3. 后台传播是人物知情与公开传闻的因果链。新可传播事实建立或推进传播；关联事件变化、传播陈旧或到期时复核范围、受众、内容与引发行动，结束/过期传播不复活。
4. 优先话题：${RUMOR_LIVELINESS_TOPICS.join(' / ')}。`;
    const RUMOR_PRESET_STEP_OLD='Step 6 · 更新传播：只维护本轮真实变化的传播、货币与历法；结束/过期传播不复活。';
    const RUMOR_PRESET_STEP_NEW='Step 6 · 信息传播：传闻是常驻活跃层；三类公开传闻为空时补2条，并随地区、卖家、发布势力与局势替换。新可传播事实建立或推进传播链，关联事件变化、陈旧或到期时复核。';
    const upgradeRumorPreset=value=>String(value||'').includes(RUMOR_PRESET_STEP_OLD)?String(value).replace(RUMOR_PRESET_STEP_OLD,RUMOR_PRESET_STEP_NEW):String(value||'');
    if(plain(BUILTIN_DEFAULT_PROMPT_DOCUMENT?.settings))BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.preset=upgradeRumorPreset(BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.preset);
    let ACTIVE_RUMOR_MAINTENANCE=null;

    // “最多3条”是展示窗口，不是模型输出校验。所有写入先正常合并，再按对象顺序滚动保留最近3条。
    // replace 不会改变 JS 对象键顺序，因此把本轮更新过的同名条目重新插到末尾，使其真正视为“最新”。
    function trimRumorCapacity(stat) {
        const removed=[];
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const bucket=stat?.传闻?.[category];
            if(!plain(bucket))continue;
            const overflow=Math.max(0,Object.keys(bucket).length-RUMOR_VISIBLE_LIMIT);
            for(const name of Object.keys(bucket).slice(0,overflow)){
                delete bucket[name];
                removed.push(category+'/'+name);
            }
        }
        return removed;
    }
    function refreshTouchedRumorOrder(stat,patches=[]) {
        for(const patch of patches||[]){
            if(!plain(patch)||patch.op==='remove')continue;
            const parts=tokens(patch.path);
            if(parts.length!==3||parts[0]!=='传闻'||!RUMOR_PUBLIC_CATEGORIES.includes(parts[1]))continue;
            const bucket=stat?.传闻?.[parts[1]];
            if(!plain(bucket))continue;
            const name=stableNameIn(bucket,parts[2])||parts[2];
            if(!Object.hasOwn(bucket,name))continue;
            const value=bucket[name];
            delete bucket[name];
            bucket[name]=value;
        }
    }
    const validateStateBeforeRumorRolling=validateState;
    validateState=function(stat) {
        // 兼容核心层旧的“>3即报错”校验：在影子状态中裁成展示窗口后继续执行其余完整校验。
        const shadow=copy(stat);
        trimRumorCapacity(shadow);
        return validateStateBeforeRumorRolling(shadow);
    };
    const applyPatchesBeforeRumorRolling=applyPatches;
    applyPatches=function(stat,patches) {
        const next=applyPatchesBeforeRumorRolling(stat,patches);
        refreshTouchedRumorOrder(next,patches);
        trimRumorCapacity(next);
        return next;
    };

    function rumorEventTouchedKey(event) {
        return worldDateKey(event?.更新时间||event?.预计结束||event?.开始时间||event?.时间);
    }
    function rumorMaintenanceRequirements(stat) {
        const backend=stat?.世界?.[PATH]||{},rumors=stat?.传闻||{},events=backend.事件||{},propagation=backend.传播||{};
        const worldTime=String(stat?.世界?.时间||''),now=worldDateKey(worldTime);
        const publicState={};
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const bucket=plain(rumors?.[category])?rumors[category]:{};
            const count=Object.keys(bucket).length;
            publicState[category]={当前数量:count,为空补足:count===0?2:0};
        }
        const review=[];
        for(const [名称,record] of Object.entries(propagation)){
            if(!plain(record)||!/^传播中$/.test(String(record.状态||'').trim()))continue;
            const reasons=[],updatedText=String(record.更新时间||'').trim(),touched=worldDateKey(updatedText||record.时间),expiry=worldDateKey(record.到期时间);
            let semantic=false;
            if(!updatedText)reasons.push('缺少更新时间');
            if(expiry!==null&&now!==null&&expiry<=now){reasons.push('已到期');semantic=true;}
            if(touched!==null&&now!==null&&now-touched>=RUMOR_STALE_HOURS){reasons.push('超过72小时未复核');semantic=true;}
            const changedEvents=[];
            for(const eventName of Array.isArray(record.关联事件)?record.关联事件:[]){
                const event=events[eventName];if(!plain(event))continue;
                const eventTouched=rumorEventTouchedKey(event);
                if((eventTouched!==null&&(touched===null||eventTouched>touched))||['已完成','已取消'].includes(event.状态))changedEvents.push(eventName);
            }
            if(changedEvents.length){reasons.push('关联事件已有新进展：'+changedEvents.join('、'));semantic=true;}
            if(!reasons.length)continue;
            review.push({
                名称,原因:reasons,需语义变化:semantic,
                当前:{来源:String(record.来源||''),范围:String(record.范围||''),时间:String(record.时间||''),更新时间:updatedText,到期时间:String(record.到期时间||''),内容:String(record.内容||''),状态:String(record.状态||''),受众:copy(record.受众||[]),引发行动:copy(record.引发行动||[]),关联事件:copy(record.关联事件||[])}
            });
        }
        const linked=new Set(Object.values(propagation).flatMap(record=>Array.isArray(record?.关联事件)?record.关联事件:[]));
        const candidates=Object.entries(events).filter(([name,event])=>{
            if(!plain(event)||!['进行中','已完成'].includes(event.状态)||linked.has(name))return false;
            const visible=String(event.公开征兆||'').trim()||(Array.isArray(event.可见影响)&&event.可见影响.length);
            return !!visible;
        }).slice(-6).map(([名称,event])=>({名称,状态:event.状态,地点:String(event.地点||''),公开征兆:String(event.公开征兆||''),更新时间:String(event.更新时间||event.时间||'')}));
        return {
            世界:String(stat?.世界?.名称||''),世界时间:worldTime,当前地点:String(stat?.世界?.地点||''),
            话题:copy(RUMOR_LIVELINESS_TOPICS),公开传闻:publicState,
            本轮必须复核的传播链:review,可传播候选事件:candidates
        };
    }
    function rumorMaintenanceNeeded(stat) {
        const required=rumorMaintenanceRequirements(stat);
        return Object.values(required.公开传闻).some(item=>item.当前数量===0)||required.本轮必须复核的传播链.length>0;
    }
    function ensureRumorLiveliness(next,required) {
        if(!plain(required)||String(next?.世界?.名称||'')!==String(required.世界||'')||String(next?.世界?.时间||'')!==String(required.世界时间||''))return;
        const shortages=[];
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const count=Object.keys(plain(next?.传闻?.[category])?next.传闻[category]:{}).length;
            const initial=Number(required?.公开传闻?.[category]?.当前数量)||0;
            if(count===0)shortages.push(category+'仍为空');
            else if(initial===0&&count<2)shortages.push(category+'仅'+count+'条');
        }
        if(shortages.length)throw new Error('传闻为空未补足：'+shortages.join('、')+'；空分类本轮必须补2条，三类各自展示最近3条');
        const unresolved=[];
        for(const item of required.本轮必须复核的传播链||[]){
            const record=next?.世界?.[PATH]?.传播?.[item.名称];
            if(!record)continue;
            if(propagationEnded(record,worldDateKey(required.世界时间)))continue;
            const updated=String(record.更新时间||'').trim()===String(required.世界时间||'').trim();
            const before=item.当前||{};
            const semantic=['范围','内容','受众','引发行动','状态','到期时间'].some(key=>!same(record?.[key],before?.[key]));
            if(!updated||(item.需语义变化&&!semantic))unresolved.push(item.名称);
        }
        if(unresolved.length)throw new Error('传播链仍未复核：'+unresolved.join('、')+'；更新到当前世界时间，并按真实变化推进范围/受众/内容/引发行动，或明确结束/移除');
    }

    const ensureTemporalAnomaliesResolvedBeforeRumors=ensureTemporalAnomaliesResolved;
    ensureTemporalAnomaliesResolved=function(next,required=[]) {
        ensureTemporalAnomaliesResolvedBeforeRumors(next,required);
        ensureRumorLiveliness(next,ACTIVE_RUMOR_MAINTENANCE);
    };

    const retryPlanBeforeRumorLiveliness=retryPlanForFailure;
    retryPlanForFailure=function(error,rejected=[]) {
        const message=[String(error?.message||error||''),...(rejected||[]).map(item=>String(item?.原因||''))].join('\n');
        const plan=retryPlanBeforeRumorLiveliness(error,rejected).slice();
        let match;
        if((match=message.match(/传闻为空未补足：([^；\n]+)/)))plan.push('传闻维护：'+match[1]+'。空分类本轮补2条真实世界信息；三类各自展示最近3条，约60字/条，不要无依据围绕<user>。');
        if((match=message.match(/传播链仍未复核：([^；\n]+)/)))plan.push('传播维护：'+match[1]+'。逐条更新到当前世界时间，并推进范围/受众/内容/引发行动；若传播已结束则结束或移除，不要原样重交。');
        return Array.from(new Set(plan.filter(Boolean)));
    };

    const SamsaraWorldEngineBeforeRumorLiveliness=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeRumorLiveliness {
        constructor(host,env) {
            super(host,env);
            if(this.config.activePromptDocumentId===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id){
                const upgraded=upgradeRumorPreset(this.config.preset);
                if(upgraded!==this.config.preset){this.config.preset=upgraded;this.saveConfig();}
            }
        }
        async buildRequest(base) {
            const rumorMaintenance=rumorMaintenanceRequirements(base?.stat||{});
            ACTIVE_RUMOR_MAINTENANCE=rumorMaintenance;
            const request=await super.buildRequest(base);
            const payload=JSON.parse(request.input);
            if(Array.isArray(request.timeAnomalies))request.timeAnomalies=request.timeAnomalies.filter(item=>item?.类型!=='传闻维护');
            if(Array.isArray(payload.本轮必须修复的时间越界记录))payload.本轮必须修复的时间越界记录=payload.本轮必须修复的时间越界记录.filter(item=>item?.类型!=='传闻维护');
            payload.传闻维护={
                当前地点:rumorMaintenance.当前地点,
                话题:rumorMaintenance.话题,
                公开传闻:rumorMaintenance.公开传闻,
                本轮必须复核的传播链:rumorMaintenance.本轮必须复核的传播链,
                可传播候选事件:rumorMaintenance.可传播候选事件
            };
            request.input=JSON.stringify(payload,null,2);
            request.system=String(request.system||'')+'\n\n'+RUMOR_LIVELINESS_RULES;
            request.rumorMaintenance=copy(rumorMaintenance);
            request.manifest=Object.assign({},request.manifest,{传闻维护:{空分类:RUMOR_PUBLIC_CATEGORIES.filter(category=>rumorMaintenance.公开传闻[category].当前数量===0),待复核传播:rumorMaintenance.本轮必须复核的传播链.map(item=>item.名称),可传播候选:rumorMaintenance.可传播候选事件.map(item=>item.名称)}});
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
        async run() {
            const temporalAnomaliesBeforeRumorRecovery=temporalAnomalies;
            temporalAnomalies=function(stat) {
                const result=temporalAnomaliesBeforeRumorRecovery(stat);
                if(rumorMaintenanceNeeded(stat))result.push({类型:'传闻维护',名称:'常驻传闻与传播链',字段:'活跃性',值:'需复核',说明:'公开传闻为空或传播链需要推进'});
                return result;
            };
            try{return await super.run();}
            finally{if(temporalAnomalies!==temporalAnomaliesBeforeRumorRecovery)temporalAnomalies=temporalAnomaliesBeforeRumorRecovery;}
        }
    };
    // 任务感知层：任务.列表是现有 MVU 的唯一正式任务账簿；世界引擎只读消费，不建立第二套后台任务库。
    const TASK_AWARENESS_RULES=`【任务感知 · 只读】
任务列表是世界因果来源之一。世界推进不得创建、删除或修改任务，也不得推进任务状态、交付、结算或奖励；任务影响只通过事件、人物行动、势力地区、探索与传播表现。事件可用“关联任务”引用当前任务.列表中已存在的任务名，作为因果来源；禁止引用不存在的任务。
情报交易由世界引擎生成或刷新；购买、扣款、消费性删除及购买后创建任务由MVU/变量AI处理，世界引擎下一轮只读接续。副本成就、击杀、奖励与惩罚不进入世界推进上下文。`;
    const TASK_WORLD_BOOK_TITLE='任务与委托系统';
    // 旧版曾把正式任务规则从内置默认资料中排除；现在恢复为可读取的权威规则。
    BUILTIN_DEFAULT_WORLD_BOOK_EXCLUSIONS.delete(TASK_WORLD_BOOK_TITLE);

    function projectTaskListForWorld(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,task] of Object.entries(value)){
            if(!plain(task))continue;
            const projected={};
            for(const key of ['委托方','目标','隐藏真相','难度','交付','状态']){
                if(Object.hasOwn(task,key))projected[key]=copy(task[key]);
            }
            if(Object.keys(projected).length)out[name]=projected;
        }
        return out;
    }

    const projectWorldContextBeforeTaskAwareness=projectWorldContext;
    projectWorldContext=function(stat) {
        const out=projectWorldContextBeforeTaskAwareness(stat);
        const tasks=projectTaskListForWorld(stat?.任务?.列表);
        if(Object.keys(tasks).length)out.任务={列表:tasks};
        return out;
    };

    const compileWorldResultBeforeTaskAwareness=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        const taskNames=new Set(Object.keys(stat?.任务?.列表||{}));
        for(const event of result.事件||[]){
            if(!Array.isArray(event?.关联任务))continue;
            for(const taskName of event.关联任务){
                const name=String(taskName||'').trim();
                if(name&&!taskNames.has(name))throw new Error('事件/'+String(event.名称||'未命名')+'：关联任务不存在：'+name);
            }
        }
        return compileWorldResultBeforeTaskAwareness(stat,result);
    };

    const SamsaraWorldEngineBeforeTaskAwareness=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeTaskAwareness {
        restoreTaskWorldbookSelection(catalogue) {
            if(this.config.activePromptDocumentId!==BUILTIN_DEFAULT_PROMPT_DOCUMENT.id||!Array.isArray(catalogue))return false;
            const matches=catalogue.filter(entry=>normalizeWorldbookEntryTitle(entry.title)===TASK_WORLD_BOOK_TITLE&&!entry.technical);
            let changed=false;
            if(matches.length){
                const selected=Array.isArray(this.config.selectedEntries)?copy(this.config.selectedEntries):[];
                for(const entry of matches){
                    const raw=JSON.stringify([entry.book,entry.id]);
                    if(!selected.includes(raw)){selected.push(raw);changed=true;}
                }
                this.config.selectedEntries=selected;
            }
            const applied=Array.isArray(this.config.builtinDefaultWorldbookExclusionsApplied)?this.config.builtinDefaultWorldbookExclusionsApplied:[];
            const cleaned=applied.filter(title=>title!==TASK_WORLD_BOOK_TITLE);
            if(cleaned.length!==applied.length){this.config.builtinDefaultWorldbookExclusionsApplied=cleaned;changed=true;}
            if(changed){
                const builtin=this.getPromptDocuments().find(doc=>doc.id===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id);
                if(builtin?.settings)builtin.settings.selectedEntries=copy(this.config.selectedEntries||[]);
                this.saveConfig();
            }
            return changed;
        }
        async catalogue() {
            const result=await super.catalogue();
            this.restoreTaskWorldbookSelection(result);
            return result;
        }
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            const payload=JSON.parse(request.input);
            if(plain(payload.输入语义)){
                payload.输入语义.当前变量='世界推进专用热数据投影；含世界、人物能力、完整资产账簿、活跃传播、近期历史、近期因果偏移，以及任务.列表的只读因果字段。任务奖励、惩罚、副本成就、击杀、商城与纯结算数据不进入世界推进。';
                payload.输入语义.任务列表='只读因果账本。事件可通过关联任务引用已存在任务；不得创建、删除、改状态、交付或结算任务。';
            }
            request.input=JSON.stringify(payload,null,2);
            // 兼容上一版传闻活跃层中的旧措辞；购买后的消费性 remove 不属于世界引擎。
            request.system=String(request.system||'').replace(
                '情报交易有卖家时更新1~2条，购买后移除；',
                '情报交易有卖家时更新1~2条；购买结算由变量AI按正文事实处理；'
            )+'\n\n'+TASK_AWARENESS_RULES;
            request.manifest=Object.assign({},request.manifest,{任务感知:{任务数量:Object.keys(payload?.当前变量?.任务?.列表||{}).length,只读:true,副本成就:false}});
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
    };
    // 原著/数据库时间轴保护层：宏观节点先服从权威时间资料，再展开区间细节。
    const CHRONOLOGY_GUARD_RULES=`【原著/数据库时间轴硬约束】
1. 宏观节点的日期与跨度必须先服从当前已确认事实和明确世界书/数据库中的原著时间资料，再使用模型已有原著知识补足；不得为了推动剧情、制造冲突、维持紧张感或让<user>尽快参与而主动提前关键事件。
2. 世界书/数据库已给出某宏观事件的明确日期时，必须沿用该日期/时段；只有已确认剧情造成足以改线的因果偏移，且同轮因果.偏移记录明确关联该节点并说明提前/延后原因时，才允许改期。
3. 原著只给月份、时段、事件顺序或大致间隔时，沿用同级时间精度并按原著节奏保守留白；不确定跨度就使用可理解的相对/因果时间，只推进必要一步，不得擅自补成过近的具体日期。
4. 先确定“当前世界时间 → 下一宏观节点”的合理时间边界，再在该区间内生成当前事件与近期节点；不能先决定下一章要发生什么，再倒推一个过近日期。
5. 3~5个宏观节点只是滚动规划窗口，不代表必须覆盖完整原著篇章。一个宏观节点只表达一个阶段转折；不得为了凑节点数量，把远行、集结、连续战役或多个独立剧情阶段合并成一个节点。
6. 排期相邻宏观节点前，先检查两者之间现实上需要经历的旅行、准备、组织动员、战役推进与因果发展；若中间包含多个独立阶段，就拆分节点或拉开跨度。`;
    const CHRONOLOGY_PRESET_STEP_OLD='Step 2 · 定边界：确认当前阶段与下一宏观节点；只有篇章、地区、战争、势力或关键人物命运发生阶段变化时才调整宏观骨架。';
    const CHRONOLOGY_PRESET_STEP_V1='Step 2 · 定边界与日期：以当前世界时间为起点，先按明确世界书/数据库时间资料与原著节奏确定下一宏观节点及合理跨度；只有已确认因果偏移才能改期，再决定是否调整宏观骨架。';
    const CHRONOLOGY_PRESET_STEP_V2='Step 2 · 定边界与日期：以当前世界时间为起点，按明确资料与原著节奏规划接下来3~5个滚动宏观节点；每个节点只表达一个阶段转折，并为相邻节点间的旅行、准备与因果发展留足时间；只有已确认因果偏移才能改期。';
    const upgradeChronologyPreset=value=>{
        const text=String(value||'');
        for(const previous of [CHRONOLOGY_PRESET_STEP_OLD,CHRONOLOGY_PRESET_STEP_V1])if(text.includes(previous))return text.replace(previous,CHRONOLOGY_PRESET_STEP_V2);
        return text;
    };
    if(plain(BUILTIN_DEFAULT_PROMPT_DOCUMENT?.settings))BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.preset=upgradeChronologyPreset(BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.preset);

    let ACTIVE_CHRONOLOGY_GUARD=null;

    function chronologyCompactName(value) {
        return String(value||'').toLowerCase().replace(/[《》【】\[\]()（）“”‘’'"·・:：,，。.!！?？\s_\-\/\\]+/g,'');
    }
    function chronologyEvidenceForEvent(eventName,texts) {
        const name=String(eventName||'').trim();if(!name)return null;
        // 只把“明确到日”的资料作为硬校验锚点。月份、上中下旬、先后顺序属于软规划证据，
        // 交给模型保守排期，避免合理估计差异造成无休止的拒绝/重试。
        const datePattern=/(\d{1,4}\s*年\s*-?\s*\d{1,2}\s*月\s*-?\s*\d{1,2}\s*日|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})/g;
        let best=null;
        for(const rawText of texts||[]){
            const text=String(rawText||'');if(!text)continue;
            let at=text.indexOf(name),fromIndex=0;
            while(at>=0){
                const left=Math.max(0,at-180),right=Math.min(text.length,at+name.length+180),window=text.slice(left,right),center=at-left+name.length/2;
                datePattern.lastIndex=0;let match;
                while((match=datePattern.exec(window))){
                    const key=worldDateKey(match[0]);if(key===null)continue;
                    const distance=Math.abs((match.index+match[0].length/2)-center);
                    if(!best||distance<best.distance)best={raw:match[0],key,distance};
                }
                fromIndex=at+Math.max(1,name.length);at=text.indexOf(name,fromIndex);
            }
        }
        return best;
    }
    function chronologyShiftDeclared(stat,result,eventName) {
        const target=chronologyCompactName(eventName);if(!target)return false;
        const records=[];
        for(const [name,item] of Object.entries(stat?.世界?.因果轨道?.偏移记录||{}))records.push({名称:name,...(plain(item)?item:{})});
        for(const item of result?.因果?.偏移记录||[])if(plain(item))records.push(item);
        return records.some(item=>{
            if(Number(item?.影响程度)===0)return false;
            const marker=chronologyCompactName(item?.名称),desc=String(item?.描述||'');
            const directlyRelated=(marker&&(marker.includes(target)||target.includes(marker)))||desc.includes(String(eventName||''));
            return directlyRelated&&/(提前|提早|延后|推迟|改期|时序|时间线|日期|进程|节点)/.test(String(item?.名称||'')+desc);
        });
    }
    function validateChronologyResult(stat,result) {
        const guard=ACTIVE_CHRONOLOGY_GUARD;if(!guard?.books?.length)return;
        const events=stat?.世界?.[PATH]?.事件||{};
        for(const event of result?.事件||[]){
            if(!plain(event)||event.操作==='撤销本轮')continue;
            const storedName=stableNameIn(events,String(event.名称||'')),stored=storedName?events[storedName]:null;
            const category=String(event.分类||stored?.分类||'');
            const status=String(event.状态||stored?.状态||'待发生');
            if(category!=='宏观节点'||status!=='待发生')continue;
            if(!Object.hasOwn(event,'时间')&&!Object.hasOwn(event,'开始时间'))continue;
            const evidence=chronologyEvidenceForEvent(event.名称,guard.books);if(!evidence)continue;
            if(chronologyShiftDeclared(stat,result,event.名称))continue;
            const proposedRaw=String(event.时间||event.开始时间||'').trim(),proposed=worldDateKey(proposedRaw);
            if(proposed===null)throw new Error('宏观节点日期未服从原著/数据库时间锚点：'+event.名称+'；资料明确为 '+evidence.raw+'，不得改成模糊或不可比较时间。若已确认因果偏移导致改期，必须同轮提交明确关联该节点的因果.偏移记录。');
            if(Math.floor(proposed/24)!==Math.floor(evidence.key/24))throw new Error('宏观节点日期与原著/数据库时间锚点冲突：'+event.名称+' 提交 '+proposedRaw+'，资料明确为 '+evidence.raw+'；不得为了推进剧情提前或压缩原著时间。若已确认因果偏移导致改期，必须同轮提交明确关联该节点的因果.偏移记录。');
        }
    }

    const compileWorldResultBeforeChronologyGuard=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        validateChronologyResult(stat,result);
        return compileWorldResultBeforeChronologyGuard(stat,result);
    };

    const retryPlanBeforeChronologyGuard=retryPlanForFailure;
    retryPlanForFailure=function(error,rejected=[]) {
        const plan=retryPlanBeforeChronologyGuard(error,rejected).map(String);
        const messages=[String(error?.message||error||''),...(rejected||[]).map(item=>String(item?.原因||''))].join('\n');
        if(/宏观节点日期(?:未服从|与).*原著\/数据库时间锚点/.test(messages))plan.unshift('宏观时间轴：只纠正已明确到日的原著/数据库日期冲突；重新沿用该日期。不要顺带把仅有月份、时段或先后顺序的节点强行精确到日，后者按原著节奏保守留白即可。');
        return Array.from(new Set(plan));
    };

    const SamsaraWorldEngineBeforeChronologyGuard=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeChronologyGuard {
        constructor(host,env) {
            super(host,env);
            if(!this.config.activePromptDocumentId||this.config.activePromptDocumentId===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id){
                const upgraded=upgradeChronologyPreset(this.config.preset);
                if(upgraded!==this.config.preset){this.config.preset=upgraded;this.saveConfig();}
            }
        }
        async buildRequest(base) {
            const request=await super.buildRequest(base),payload=JSON.parse(request.input),state=base?.stat||{};
            const chronologyScan=[state?.世界?.名称,'原著','时间线','时间轴','年表','校历','大事记','大事件','剧情大纲','剧情章节','章节','未来','后续'].filter(Boolean).join(' ');
            const chronologyBooks=await this.worldbook(chronologyScan,{timelineBackbone:true});
            const chronologyOnly=(chronologyBooks||[]).filter(book=>isTimelineBackboneEntry(book?.名称));
            const existing=Array.isArray(payload.世界书)?payload.世界书.map(String):[],merged=existing.slice(),seen=new Set(existing);
            for(const book of chronologyOnly){const text=String(book?.内容||'');if(text&&!seen.has(text)){seen.add(text);merged.push(text);}}
            payload.世界书=merged;
            ACTIVE_CHRONOLOGY_GUARD={worldTime:String(state?.世界?.时间||''),books:merged.slice()};
            const next=payload?.时间线调度?.下一宏观节点||null;
            payload.时间线基准={
                当前世界时间:String(state?.世界?.时间||''),
                下一宏观节点:next?{名称:String(next.名称||''),当前排期:String(next.时间||'')}:null,
                原著时间资料:chronologyOnly.length?'已读取 '+chronologyOnly.length+' 条明确时间线/年表资料':'未命中明确时间线条目；使用模型已有原著知识保守估计，不得为推进剧情压缩跨度',
                规划原则:{
                    滚动窗口:'3~5个宏观节点只是当前规划视野，不要求覆盖完整篇章；宁可规划得近，也不要把远期大事件打包。',
                    节点粒度:'一个宏观节点只表达一个阶段转折；远行、集结、连续战役或多个独立剧情阶段应拆分或拉开跨度。',
                    间隔自检:'排期前先判断从上一节点到本节点现实上必须经历什么，为旅行、准备、组织动员与因果发展留足时间。',
                    时间精度:'资料只到月份/时段/顺序时保持同级精度并保守留白，不为方便排序强造日级日期。'
                },
                要求:'宏观节点先定原著/数据库日期、节点粒度与合理跨度，再展开当前→下一节点区间。明确到日的日期必须服从；仅有月份、时段或顺序时按软约束保守规划，不因估计差异反复改期。'
            };
            request.input=JSON.stringify(payload,null,2);
            request.system=String(request.system||'')+'\n\n'+CHRONOLOGY_GUARD_RULES;
            const manifest=request.manifest||(request.manifest={});
            const rows=Array.isArray(manifest.世界书条目)?manifest.世界书条目:[];
            const rowKeys=new Set(rows.map(row=>String(row?.世界书||'')+'\u0000'+String(row?.条目ID||'')));
            for(const book of chronologyOnly){
                const key=String(book?.世界书||'')+'\u0000'+String(book?.条目ID||'');
                if(rowKeys.has(key))continue;rowKeys.add(key);
                rows.push({世界书:book?.世界书,条目ID:book?.条目ID,名称:book?.名称,估算Tokens:estimateTokens(book?.内容)});
            }
            manifest.世界书条目=rows;
            if(plain(manifest.世界书读取))manifest.世界书读取.实际读取=merged.length;
            manifest.原著时间轴={
                强制校准:true,
                校验模式:'明确到日的资料硬校验；月份、时段、顺序与节点粒度软引导',
                当前世界时间:String(state?.世界?.时间||''),
                时间线资料:chronologyOnly.map(book=>String(book?.名称||'')).filter(Boolean),
                下一宏观节点:next?String(next.名称||''):''
            };
            manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
    };
    // 自动推进策略：顶部开关独立控制自动调度；请求检查页配置推进间隔；战斗中暂停且不计轮次。
    const SamsaraWorldEngineBeforeAutoProgress=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeAutoProgress {
        constructor(host,env) {
            super(host,env);
            let dirty=false;
            if(!Object.hasOwn(this.config,'autoProgress')){this.config.autoProgress=true;dirty=true;}
            else this.config.autoProgress=this.config.autoProgress!==false;
            const hadInterval=Object.hasOwn(this.config,'autoProgressInterval');
            const interval=Number(this.config.autoProgressInterval);
            this.config.autoProgressInterval=Math.max(1,Math.min(20,Number.isFinite(interval)?Math.round(interval):2));
            if(!hadInterval)dirty=true;
            this.autoProgressCycleKey='';
            this.autoProgressLastSeenFingerprint='';
            this.autoProgressDueFingerprint='';
            this.autoProgressRoundsSinceRun=0;
            this.autoProgressHasRun=false;
            if(dirty)this.saveConfig();
        }
        blocked(snapshot) {
            if(snapshot?.stat?.系统状态?.是否战斗中===true)return '战斗中，世界推进暂停';
            return super.blocked(snapshot);
        }
        autoProgressIntervalValue() {
            const value=Number(this.config.autoProgressInterval);
            return Math.max(1,Math.min(20,Number.isFinite(value)?Math.round(value):2));
        }
        autoProgressContextKey(snapshot) {
            let chat='';
            try{const parsed=JSON.parse(String(snapshot?.fingerprint||''));chat=String(parsed?.[0]??'');}catch(_){}
            return chat+'\u0000'+String(snapshot?.stat?.世界?.名称||'');
        }
        autoProgressFingerprintChat(fingerprint) {
            try{return String(JSON.parse(String(fingerprint||''))?.[0]??'');}catch(_){return '';}
        }
        autoProgressBackendHasContent(snapshot) {
            const backend=snapshot?.stat?.世界?.[PATH];
            if(!plain(backend))return false;
            const maps=['事件','人物','势力地区','历史','历史总结','传播'];
            if(maps.some(key=>plain(backend[key])&&Object.keys(backend[key]).length>0))return true;
            return Array.isArray(backend.最近变化)&&backend.最近变化.length>0;
        }
        initializeAutoProgressCycle(snapshot) {
            const key=this.autoProgressContextKey(snapshot);
            if(this.autoProgressCycleKey===key)return;
            this.autoProgressCycleKey=key;
            this.autoProgressRoundsSinceRun=0;
            const handled=String(snapshot?.stat?.世界?.[PATH]?.已处理楼层||'');
            const currentChat=this.autoProgressFingerprintChat(snapshot?.fingerprint);
            const handledChat=this.autoProgressFingerprintChat(handled);
            const sameContext=!!handled&&(!currentChat||!handledChat||currentChat===handledChat);
            // 只有“处理标记 + 实际后台内容”同时存在，才说明这个聊天确实已经跑过世界推进。
            // 开局/重新处理变量可能只继承旧的已处理楼层；后台仍为空时必须把当前正文当作首次有效正文立即推进。
            const restoredRun=sameContext&&this.autoProgressBackendHasContent(snapshot);
            this.autoProgressHasRun=restoredRun;
            this.autoProgressLastSeenFingerprint=restoredRun?handled:'';
            this.autoProgressDueFingerprint=restoredRun?handled:'';
        }
        autoProgressShouldSchedule(snapshot) {
            this.initializeAutoProgressCycle(snapshot);
            const fingerprint=String(snapshot?.fingerprint||'');
            if(!fingerprint)return false;
            const handled=String(snapshot?.stat?.世界?.[PATH]?.已处理楼层||'');
            // 重新处理变量会重建本楼层 MVU，但正文指纹不变。已到期楼层的提交标记
            // 被回滚时允许补跑；重复通知与间隔内跳过的楼层都不能额外计轮。
            if(this.autoProgressLastSeenFingerprint===fingerprint){
                return this.autoProgressDueFingerprint===fingerprint&&handled!==fingerprint;
            }
            this.autoProgressLastSeenFingerprint=fingerprint;
            if(this.autoProgressHasRun)this.autoProgressRoundsSinceRun++;
            const due=!this.autoProgressHasRun||this.autoProgressRoundsSinceRun>=this.autoProgressIntervalValue();
            if(due)this.autoProgressDueFingerprint=fingerprint;
            return due;
        }
        markAutoProgressRun(snapshot) {
            if(snapshot)this.initializeAutoProgressCycle(snapshot);
            this.autoProgressHasRun=true;
            this.autoProgressRoundsSinceRun=0;
            if(snapshot?.fingerprint){
                this.autoProgressLastSeenFingerprint=String(snapshot.fingerprint);
                this.autoProgressDueFingerprint=String(snapshot.fingerprint);
            }
        }
        resetAutoProgressCycle() {
            this.autoProgressCycleKey='';
            this.autoProgressLastSeenFingerprint='';
            this.autoProgressDueFingerprint='';
            this.autoProgressRoundsSinceRun=0;
            this.autoProgressHasRun=false;
        }
        schedule() {
            if(this.config.autoProgress!==true){
                if(this.timer){clearTimeout(this.timer);this.timer=null;}
                return;
            }
            if(this.disposed||this.committing||!this.isEnabled())return;
            if(this.busy){this.pending=true;return;}
            // VARIABLE_UPDATE_ENDED 在 MVU 写回楼层前发出；去抖后才读取存档并计轮，
            // 否则首次更新可能读不到 stat_data，重处理则可能读到旧的已处理标记。
            clearTimeout(this.timer);
            this.timer=setTimeout(()=>{
                this.timer=null;
                if(this.config.autoProgress!==true||this.disposed||this.committing||!this.isEnabled())return;
                if(this.busy){this.pending=true;return;}
                let snapshot;
                try{snapshot=this.snapshot();}catch(_){return;}
                const reason=this.blocked(snapshot);
                if(reason){this.status=reason;this.render();return;}
                if(!this.autoProgressShouldSchedule(snapshot))return;
                this.run().catch(()=>{});
            },900);
        }
        async run() {
            let snapshot=null;
            try{snapshot=this.snapshot();}catch(_){}
            const result=await super.run();
            if(result===true)this.markAutoProgressRun(snapshot);
            return result;
        }
        toggleAutoProgress() {
            this.config.autoProgress=!this.config.autoProgress;
            if(!this.config.autoProgress){
                if(this.timer){clearTimeout(this.timer);this.timer=null;}
                this.pending=false;
                this.status='自动推进已关闭 · 可手动推进';
            }else{
                this.resetAutoProgressCycle();
                this.status='自动推进已开启';
            }
            this.saveConfig();
            this.render(true);
        }
        mountAutoProgressTopControl() {
            if(!this.panel)return;
            const header=this.panel.querySelector('header'),run=header?.querySelector('[data-action="run"]');
            if(!header||!run)return;
            let button=header.querySelector('[data-auto-progress-toggle-top]');
            if(!button){
                button=this.host.document.createElement('button');
                button.type='button';button.className='we-btn we-switch';button.dataset.autoProgressToggleTop='';
                run.insertAdjacentElement('beforebegin',button);
                button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.toggleAutoProgress();});
            }
            button.classList.toggle('on',this.config.autoProgress===true);
            button.setAttribute('aria-pressed',String(this.config.autoProgress===true));
            button.title=this.config.autoProgress?'自动推进已开启':'自动推进已关闭';
            button.innerHTML='<span>自动推进</span><span class="we-switch-track"><i></i></span>';
        }
        mountAutoProgressIntervalSetting() {
            if(this.tab!=='请求检查'||!this.panel)return;
            const main=this.panel.querySelector('main');if(!main)return;
            let section=main.querySelector('[data-auto-progress-interval-setting]');
            if(!section){
                section=this.host.document.createElement('section');section.className='we-section';section.dataset.autoProgressIntervalSetting='';
                const retry=[...main.querySelectorAll('.we-section')].find(item=>item.querySelector('.we-section-head h2')?.textContent?.trim()==='失败自动重试');
                if(retry)main.insertBefore(section,retry);else main.prepend(section);
            }
            const enabled=this.config.autoProgress===true,interval=this.autoProgressIntervalValue();
            section.innerHTML='<div class="we-section-head"><h2>自动推进频率</h2><small>正文轮次</small></div>'+
                '<div class="we-config-row"><label>推进间隔 <input data-auto-progress-interval type="number" min="1" max="20" value="'+interval+'" '+(enabled?'':'disabled')+'> 轮</label><span class="we-muted">'+
                (enabled?'首次符合条件、或检测到世界后台尚未建立时立即推进；之后按正文回复轮次触发。2 = 第1、3、5…次正文后推进；1 = 每轮推进。战斗中不计轮数。':'自动推进已关闭，此设置不参与调度。')+
                '</span></div>';
            const input=section.querySelector('[data-auto-progress-interval]');
            input?.addEventListener('change',()=>{
                const value=Math.max(1,Math.min(20,Number(input.value)||2));
                this.config.autoProgressInterval=Math.round(value);input.value=String(this.config.autoProgressInterval);
                this.resetAutoProgressCycle();this.saveConfig();
                this.status='自动推进间隔已设为 '+this.config.autoProgressInterval+' 轮';
                this.render(true);
            });
        }
        render(force=false) {
            const result=super.render(force);
            this.panel?.querySelector('[data-auto-progress-setting]')?.remove();
            this.mountAutoProgressTopControl();
            this.mountAutoProgressIntervalSetting();
            return result;
        }
    };
    // 自动推进触发重构：正文完成是主入口；变量重处理只恢复已确认结果，不重新调用世界 AI。
    const WORLD_REPLAY_VERSION=1;
    const WORLD_REPLAY_SCOPES=[
        ['世界','货币'],['世界','历法'],['世界',PATH],['世界','因果轨道'],['世界','势力'],['世界','探索'],
        ['世界','异端雷达','名单'],['世界','稳定'],['传闻'],['资产'],['关系列表']
    ];
    const SamsaraWorldEngineBeforeAutoTriggerRebuild=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeAutoTriggerRebuild {
        constructor(host,env) {
            super(host,env);
            this.autoProgressTriggerEventsBound=false;
            this.autoProgressWaitingForVariable=false;
            this.worldReplayEventBound=false;
            this.worldReplayPendingFingerprint='';
            this.worldReplayManualForce=false;
        }
        init() {
            const result=super.init();
            const on=this.fn('eventOn');
            const events=this.env.tavern_events||this.host.tavern_events||{};
            if(!this.autoProgressTriggerEventsBound&&on&&events){
                const bindAuto=(event,source)=>{
                    if(!event)return false;
                    const off=on(event,()=>this.schedule(source));
                    if(typeof off==='function')this.unsub.push(off);
                    else if(off&&off.stop)this.unsub.push(()=>off.stop());
                    return true;
                };
                let bound=false;
                bound=bindAuto(events.GENERATION_ENDED,'generation-ended')||bound;
                bound=bindAuto(events.MESSAGE_RECEIVED,'message-received')||bound;
                if(bound)this.autoProgressTriggerEventsBound=true;
            }
            if(!this.worldReplayEventBound){
                const mvu=this.env.Mvu||this.host.Mvu;
                const first=this.fn('eventMakeFirst')||on;
                const event=mvu?.events?.VARIABLE_UPDATE_ENDED;
                if(first&&event){
                    const off=first(event,(variables,before)=>this.handleWorldReplayVariableEvent(variables,before));
                    if(typeof off==='function')this.unsub.push(off);
                    else if(off&&off.stop)this.unsub.push(()=>off.stop());
                    this.worldReplayEventBound=true;
                }
            }
            return result;
        }
        autoProgressFingerprintParts(fingerprint) {
            try {
                const parsed=JSON.parse(String(fingerprint||''));
                return {chat:String(parsed?.[0]??''),id:Number(parsed?.[1]),swipe:Number(parsed?.[2]||0),digest:String(parsed?.[3]??'')};
            } catch (_) {
                return {chat:'',id:NaN,swipe:0,digest:''};
            }
        }
        autoProgressSameFloor(left,right) {
            const a=this.autoProgressFingerprintParts(left),b=this.autoProgressFingerprintParts(right);
            return !!a.chat&&a.chat===b.chat&&Number.isFinite(a.id)&&a.id===b.id;
        }
        autoProgressDuringExtraAnalysis() {
            const mvu=this.env.Mvu||this.host.Mvu;
            try{return mvu?.isDuringExtraAnalysis?.()===true;}catch(_){return false;}
        }
        worldReplayCurrentMessage() {
            const getMessages=this.fn('getChatMessages');
            if(!getMessages)return null;
            let message;try{message=getMessages(-1)?.[0];}catch(_){return null;}
            if(!message)return null;
            const id=Number(message.message_id!=null?message.message_id:message.id);
            if(!Number.isInteger(id)||id<0)return null;
            const role=String(message.role||'').toLowerCase();
            if(role==='user'||message.is_user===true)return null;
            const text=String(message.message!=null?message.message:message.mes||'');
            if(!text.trim())return null;
            const chatFn=this.fn('getCurrentChatId');
            let chat='';
            try{chat=String(chatFn?chatFn():(this.host.SillyTavern?.getContext?.()?.chatId??''));}catch(_){}
            if(!chat)return null;
            const fingerprint=JSON.stringify([chat,id,message.swipe_id||0,digest(text)]);
            return {id,message,text,fingerprint};
        }
        worldReplayPathAllowed(path) {
            if(!Array.isArray(path)||!path.length||path.some(key=>forbidden.has(String(key))))return false;
            return WORLD_REPLAY_SCOPES.some(scope=>scope.every((key,index)=>path[index]===key));
        }
        worldReplayAtomicPath(path) {
            if(path[0]==='世界'&&path[1]===PATH&&path.length>=4)return true;
            if(path[0]==='世界'&&['势力','探索'].includes(path[1])&&path.length>=3)return true;
            if(path[0]==='世界'&&path[1]==='因果轨道'&&path[2]==='偏移记录'&&path.length>=4)return true;
            if(path[0]==='传闻'&&path.length>=3)return true;
            if(path[0]==='资产'&&path.length>=2)return true;
            if(path[0]==='关系列表'&&path.length>=3)return true;
            return false;
        }
        worldReplayCollect(before,after,path,operations) {
            if(same(before,after))return;
            if(after===undefined){operations.push({op:'remove',path:copy(path)});return;}
            if(before===undefined||this.worldReplayAtomicPath(path)||!plain(before)||!plain(after)){
                operations.push({op:'set',path:copy(path),value:copy(after)});return;
            }
            const keys=new Set([...Object.keys(before),...Object.keys(after)]);
            for(const key of keys){
                if(forbidden.has(key))continue;
                this.worldReplayCollect(before[key],after[key],path.concat(key),operations);
            }
        }
        buildWorldReplayPackage(beforeStat,afterStat,fingerprint) {
            if(!plain(beforeStat)||!plain(afterStat)||!fingerprint)return null;
            const operations=[];
            for(const scope of WORLD_REPLAY_SCOPES)this.worldReplayCollect(get(beforeStat,scope),get(afterStat,scope),scope,operations);
            if(!operations.length)return null;
            return {version:WORLD_REPLAY_VERSION,fingerprint:String(fingerprint),operations};
        }
        applyWorldReplayPackage(stat,packageValue) {
            if(!plain(stat)||!plain(packageValue)||packageValue.version!==WORLD_REPLAY_VERSION||!Array.isArray(packageValue.operations))return false;
            for(const operation of packageValue.operations){
                const path=Array.isArray(operation?.path)?operation.path.map(String):[];
                if(!this.worldReplayPathAllowed(path)||!['set','remove'].includes(operation?.op))return false;
            }
            for(const operation of packageValue.operations){
                const path=operation.path.map(String);
                let parent=stat;
                for(const key of path.slice(0,-1)){
                    if(!plain(parent[key]))parent[key]={};
                    parent=parent[key];
                }
                const key=path.at(-1);
                if(operation.op==='remove')delete parent[key];
                else parent[key]=copy(operation.value);
            }
            return true;
        }
        worldReplayMarkEventInternal() {
            const target=this.host;
            if(!target)return;
            const had=Object.prototype.hasOwnProperty.call(target,'__samsaraUIMutation'),previous=target.__samsaraUIMutation;
            target.__samsaraUIMutation=true;
            setTimeout(()=>{
                try{
                    if(had)target.__samsaraUIMutation=previous;
                    else delete target.__samsaraUIMutation;
                }catch(_){}
            },0);
        }
        handleWorldReplayVariableEvent(variables,before) {
            if(!plain(variables))return false;
            const pending=String(this.worldReplayPendingFingerprint||'');
            const handled=String(variables?.stat_data?.世界?.[PATH]?.已处理楼层||'');
            // 世界推进成功提交：在 MVU 真正落库前，把本次“实际变更”压缩成同楼恢复包一并保存。
            if(pending&&handled===pending&&plain(before?.stat_data)&&plain(variables.stat_data)){
                const replay=this.buildWorldReplayPackage(before.stat_data,variables.stat_data,pending);
                if(replay)variables.__samsaraWorldReplay=replay;
                if(this.worldReplayManualForce)this.worldReplayMarkEventInternal();
                return !!replay;
            }

            // MVU“重新处理变量”会先清空当前消息 stat_data/schema，但保留未知 root 字段。
            // 只有当前消息自己的 replay 指纹或 before 中已处理楼层能证明旧结果，才认定为同正文重处理。
            const current=this.worldReplayCurrentMessage();
            if(!current||!plain(variables.stat_data))return false;
            const mvu=this.env.Mvu||this.host.Mvu;
            let raw;try{raw=mvu?.getMvuData?.({type:'message',message_id:current.id});}catch(_){return false;}
            if(!raw||plain(raw.stat_data))return false;
            const storedReplay=raw.__samsaraWorldReplay;
            const beforeHandled=String(before?.stat_data?.世界?.[PATH]?.已处理楼层||'');
            const replayMatches=plain(storedReplay)&&String(storedReplay.fingerprint||'')===current.fingerprint;
            if(!replayMatches&&beforeHandled!==current.fingerprint)return false;

            // 重处理本身不是新的游戏轮次，也绝不能触发世界 AI；让世界引擎把本事件视为内部恢复。
            this.worldReplayMarkEventInternal();
            const replay=storedReplay;
            if(!plain(replay)||String(replay.fingerprint||'')!==current.fingerprint){
                this.status='变量已重处理 · 本楼没有可恢复的世界推进快照';
                this.render();
                return false;
            }
            if(!this.applyWorldReplayPackage(variables.stat_data,replay)){
                this.status='变量已重处理 · 世界推进恢复包无效，未自动重推';
                this.render();
                return false;
            }
            variables.__samsaraWorldReplay=copy(replay);
            this.autoProgressCycleKey=this.autoProgressContextKey({fingerprint:current.fingerprint,stat:variables.stat_data});
            this.autoProgressHasRun=true;
            this.autoProgressRoundsSinceRun=0;
            this.autoProgressLastSeenFingerprint=current.fingerprint;
            this.autoProgressDueFingerprint=current.fingerprint;
            this.status='已恢复本楼世界推进结果 · 未重新调用 AI';
            this.render();
            return true;
        }
        autoProgressShouldSchedule(snapshot) {
            this.initializeAutoProgressCycle(snapshot);
            const fingerprint=String(snapshot?.fingerprint||'');
            if(!fingerprint)return false;
            const handled=String(snapshot?.stat?.世界?.[PATH]?.已处理楼层||'');
            if(this.autoProgressLastSeenFingerprint===fingerprint){
                return this.autoProgressDueFingerprint===fingerprint&&handled!==fingerprint;
            }
            const previous=this.autoProgressLastSeenFingerprint;
            // regenerate / swipe / 同楼正文重生不算新的推进轮次。
            // 该楼若本来应推进，正文改变后必须重跑；若本来处于间隔跳过，则继续跳过。
            if(previous&&this.autoProgressSameFloor(previous,fingerprint)){
                const wasDue=this.autoProgressDueFingerprint===previous;
                this.autoProgressLastSeenFingerprint=fingerprint;
                if(wasDue)this.autoProgressDueFingerprint=fingerprint;
                return wasDue;
            }
            this.autoProgressLastSeenFingerprint=fingerprint;
            if(this.autoProgressHasRun)this.autoProgressRoundsSinceRun++;
            const due=!this.autoProgressHasRun||this.autoProgressRoundsSinceRun>=this.autoProgressIntervalValue();
            if(due)this.autoProgressDueFingerprint=fingerprint;
            return due;
        }
        resetAutoProgressCycle() {
            super.resetAutoProgressCycle();
            this.autoProgressWaitingForVariable=false;
        }
        snapshot() {
            const snapshot=super.snapshot();
            // 只有显式手动“推进世界”才允许同一正文绕过已处理标记重新推演。
            // 这里只改请求使用的副本；旧世界状态和恢复包在新请求成功前始终保留在 MVU 中。
            if(this.worldReplayManualForce&&snapshot?.fingerprint&&snapshot?.stat?.世界?.[PATH]?.已处理楼层===snapshot.fingerprint){
                snapshot.stat.世界[PATH].已处理楼层='';
                snapshot.stat.世界[PATH].已处理时间='';
            }
            return snapshot;
        }
        async run(options={}) {
            let current=null;
            try{current=super.snapshot();}catch(_){}
            const fingerprint=String(current?.fingerprint||'');
            const automatic=plain(options)&&options.automatic===true;
            const previousPending=this.worldReplayPendingFingerprint;
            const previousManual=this.worldReplayManualForce;
            this.worldReplayPendingFingerprint=fingerprint;
            this.worldReplayManualForce=!automatic;
            try{return await super.run(options);}
            finally{
                this.worldReplayPendingFingerprint=previousPending;
                this.worldReplayManualForce=previousManual;
            }
        }
        schedule(source='variable-update',attempt=0) {
            if(this.config.autoProgress!==true){
                if(this.timer){clearTimeout(this.timer);this.timer=null;}
                return;
            }
            if(this.disposed||this.committing||!this.isEnabled())return;
            if(this.busy){this.pending=true;return;}
            const trigger=String(source||'variable-update');
            const proseTrigger=trigger==='generation-ended'||trigger==='message-received';
            const tries=Math.max(0,Number(attempt)||0);
            // 主正文结束后若变量 AI 正在解析，先等变量；变量事件丢失时仍会复查，不让自动推进永久失活。
            if(proseTrigger&&this.autoProgressDuringExtraAnalysis()){
                this.autoProgressWaitingForVariable=true;
                clearTimeout(this.timer);
                if(tries<120)this.timer=setTimeout(()=>{this.timer=null;this.schedule(trigger,tries+1);},1000);
                return;
            }
            this.autoProgressWaitingForVariable=false;
            clearTimeout(this.timer);
            const delay=proseTrigger?(tries>0?250:800):900;
            this.timer=setTimeout(()=>{
                this.timer=null;
                if(this.config.autoProgress!==true||this.disposed||this.committing||!this.isEnabled())return;
                if(this.busy){this.pending=true;return;}
                if(proseTrigger&&this.autoProgressDuringExtraAnalysis()){
                    this.autoProgressWaitingForVariable=true;
                    if(tries<120)this.timer=setTimeout(()=>{this.timer=null;this.schedule(trigger,tries+1);},1000);
                    return;
                }
                let snapshot;
                try{snapshot=this.snapshot();}
                catch(_){
                    // 正文已完成但本楼 MVU 还没落盘：短暂重试；VARIABLE_UPDATE_ENDED 若先到会直接接管。
                    if(proseTrigger&&tries<4)this.timer=setTimeout(()=>{this.timer=null;this.schedule(trigger,tries+1);},250);
                    return;
                }
                this.autoProgressWaitingForVariable=false;
                const reason=this.blocked(snapshot);
                if(reason){this.status=reason;this.render();return;}
                if(!this.autoProgressShouldSchedule(snapshot))return;
                this.run({automatic:true}).catch(()=>{});
            },delay);
        }
    };
    // 容错验收策略：完整性维护采用渐进补齐，不再让辅助模块拖死整轮世界推进。
    const SOFT_MAINTENANCE_RULES=`【分级验收 · 软维护不拒绝整轮】
1. Schema、非法状态、因果引用损坏、明确原著/数据库日期冲突仍属于硬错误；事件排期补全、传闻补齐与传播复核属于软维护，不得仅因软维护未完成而拒绝整轮已合格结果。
2. 事件已有具体时间、有效条件或明确前因任一项，即视为已有可用时间锚点；条件/前因属于合法相对或因果时间，不要求重复补写日期。
3. 公开传闻为空时优先补1条真实世界信息；未补到的分类保留为下轮维护项，不要求为了凑齐传闻重写已经合格的事件、人物、因果等模块。此条取代“空分类本轮必须补2条”的硬验收含义。
4. 纠错只修真正的硬错误或被拒绝片段；已经通过的片段沿用，不要整包重写。`;

    function eventHasUsableSchedule(event) {
        if(!plain(event))return false;
        const raw=eventTimeAnchor(event);
        if(raw&&!VAGUE_EVENT_TIME.test(raw))return true;
        const condition=String(event.条件||'').trim();
        if(condition&&!/^(?:无|暂无|无条件|未知|待定|未定|不详|待确认)$/.test(condition))return true;
        return Array.isArray(event.前因)&&event.前因.some(Boolean);
    }

    // 统一“显示层”和“验收层”的时间锚点定义：条件/前因本来就能生成合法的因果排期标签。
    unscheduledEvents=function(stat) {
        return Object.entries(stat?.世界?.[PATH]?.事件||{}).filter(([,event])=>{
            if(!['待发生','进行中'].includes(event?.状态))return false;
            return !eventHasUsableSchedule(event);
        }).map(([名称,event])=>({
            名称,分类:event.分类,状态:event.状态,条件:event.条件,
            前因:copy(event.前因||[]),当前时间:eventScheduleLabel(event)
        }));
    };

    // 真正没有任何时间/条件/前因的旧事件仍会进入维护清单，但不再否决本轮其它合格结果。
    ensureEventTimeAnchors=function(next,required=[]) {
        const missing=[];
        for(const item of required||[]){
            const event=next?.世界?.[PATH]?.事件?.[item.名称];
            if(!event||!['待发生','进行中'].includes(event.状态))continue;
            if(!eventHasUsableSchedule(event))missing.push(item.名称);
        }
        return missing;
    };

    const rumorMaintenanceRequirementsBeforeSoftMaintenance=rumorMaintenanceRequirements;
    rumorMaintenanceRequirements=function(stat) {
        const required=rumorMaintenanceRequirementsBeforeSoftMaintenance(stat);
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const item=required?.公开传闻?.[category];
            if(item&&Number(item.当前数量)===0)item.为空补足=1;
        }
        return required;
    };

    function softRumorMaintenanceIssues(next,required) {
        const result={公开传闻:[],传播链:[]};
        if(!plain(required)||String(next?.世界?.名称||'')!==String(required.世界||'')||String(next?.世界?.时间||'')!==String(required.世界时间||''))return result;
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const count=Object.keys(plain(next?.传闻?.[category])?next.传闻[category]:{}).length;
            const initial=Number(required?.公开传闻?.[category]?.当前数量)||0;
            if(initial===0&&count===0)result.公开传闻.push(category);
        }
        for(const item of required.本轮必须复核的传播链||[]){
            const record=next?.世界?.[PATH]?.传播?.[item.名称];
            if(!record||propagationEnded(record,worldDateKey(required.世界时间)))continue;
            const updated=String(record.更新时间||'').trim()===String(required.世界时间||'').trim();
            const before=item.当前||{};
            const semantic=['范围','内容','受众','引发行动','状态','到期时间'].some(key=>!same(record?.[key],before?.[key]));
            if(!updated||(item.需语义变化&&!semantic))result.传播链.push(item.名称);
        }
        return result;
    }

    ensureRumorLiveliness=function(next,required) {
        return softRumorMaintenanceIssues(next,required);
    };

    const SamsaraWorldEngineBeforeSoftMaintenance=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeSoftMaintenance {
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            const payload=JSON.parse(request.input);
            if(plain(payload?.传闻维护?.公开传闻)){
                for(const category of RUMOR_PUBLIC_CATEGORIES){
                    const item=payload.传闻维护.公开传闻[category];
                    if(item&&Number(item.当前数量)===0)item.为空补足=1;
                }
            }
            payload.验收策略={
                模式:'分级验收',
                硬错误:'Schema、非法状态、因果引用损坏、明确时间轴冲突',
                软维护:'事件排期补全、传闻补齐、传播复核；可跨轮渐进完成，不得拖死整轮'
            };
            request.input=JSON.stringify(payload,null,2);
            request.system=String(request.system||'')+'\n\n'+SOFT_MAINTENANCE_RULES;
            request.manifest=Object.assign({},request.manifest,{验收策略:{模式:'分级验收',事件因果锚点可接受:true,传闻补齐:'软维护'}});
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
    };

    // 玩家探索是长期/结算台账：实际进入整体地区时自动建立最低10%，离开后不回收。
    const EXPLORATION_PROJECTION_RULES='【玩家探索投影硬约束】实际到达整体区域时至少记录10%探索；远方后台地区不自动投影；离开区域后仍保留探索台账。';
    function explorationLocationContainsArea(location,areaName) {
        const locationKey=nameKey(location),areaKey=nameKey(areaName);
        return !!locationKey&&!!areaKey&&(locationKey===areaKey||locationKey.includes(areaKey));
    }
    function ensureCurrentExplorationProjection(stat,result) {
        if(stat?.系统状态?.是否在主神空间)return;
        const location=String(stat?.世界?.地点||'').trim();if(!location)return;
        const areas=new Map(Object.entries(stat?.世界?.[PATH]?.势力地区||{}).map(([name,record])=>[nameKey(name),{名称:name,记录:record}]));
        for(const item of result?.势力地区||[]){
            if(!plain(item)||item.操作==='撤销本轮')continue;
            const id=nameKey(item.名称),old=areas.get(id);
            areas.set(id,{名称:old?.名称||item.名称,记录:Object.assign({},old?.记录||{},item)});
        }
        const current=Array.from(areas.values()).filter(item=>plain(item.记录)&&String(item.记录.类型||'地区')!=='势力'&&explorationLocationContainsArea(location,item.名称)).sort((a,b)=>nameKey(b.名称).length-nameKey(a.名称).length)[0];
        if(!current||explorationGranularity(current.名称).invalid)return;
        const bucket=stat?.世界?.探索||{},existingName=stableNameIn(bucket,current.名称),existing=existingName?bucket[existingName]:null;
        const list=Array.isArray(result.探索)?result.探索:(result.探索=[]);
        const index=list.findIndex(item=>plain(item)&&nameKey(item.名称)===nameKey(current.名称));
        const explicit=index>=0?list[index]:null,progress=Math.max(10,Number(existing?.探索度)||0,Number(explicit?.探索度)||0);
        if(existing&&progress===Number(existing.探索度||0)&&!explicit)return;
        const item={名称:current.名称,操作:'更新',风险:String(explicit?.风险||existing?.风险||'F'),探索度:Math.min(100,progress),描述:String(explicit?.描述||existing?.描述||current.记录.描述||current.记录.公开动态||current.记录.进展||('已实际到达'+current.名称+'。')),隐藏真相:String(explicit?.隐藏真相||existing?.隐藏真相||'')};
        if(index>=0)list.splice(index,1,item);else list.push(item);
    }
    pruneColdExploration=function(){return [];};
    const compileWorldResultBeforeExplorationProjection=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        ensureCurrentExplorationProjection(stat,result);
        return compileWorldResultBeforeExplorationProjection(stat,result);
    };
    const SamsaraWorldEngineBeforeExplorationProjection=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeExplorationProjection {
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            request.system=String(request.system||'')+'\n\n'+EXPLORATION_PROJECTION_RULES;
            return request;
        }
    };
    // 世界完整性保护：统一精确时钟；因果偏移采用软归一化，不因语义或幅度问题拖死整轮推进。
    const WORLD_INTEGRITY_GUARD_RULES=`【因果偏移与时间约束】
1. 时间校验按字段粒度处理：事件、地区、历史、传播等宏观事实只按“自然日”硬校验；同一自然日内的上午/下午/HH:mm差异不算未来越界，只有跨日未来事实才拒绝。
2. 人物当前动态仅在“当前世界时间”和“人物更新时间”双方都明确到 HH:mm 时做分钟级先后校验；任一侧只有清晨/上午/下午等粗粒度时，同日视为合法。当前状态仍优先复用世界.时间原文，未来计划放预计结束、下次检查或待发生事件。
3. 偏移记录不是每轮必填，也不是剧情日志、剧情总结或章节小结。只记录已经发生、已经确认，并且现实结果已经改变关键人物命运、重大事件结果、关键势力格局、主线可行性或异常污染规模的长期偏移；本轮没有这种重大世界级变化时，省略“因果.偏移记录”，不得为了让稳定值变化而硬造记录。
4. 判定依据是已经实现的结果，不是危险程度、能力强弱、计划、意图或潜在上限。即使持有足以影响整个世界的高危装置，只要尚未使用且尚未造成现实结果，就不产生偏移。
5. 同一已确认根因及其连锁后果只记一条，优先更新已有偏移；只有形成新的、独立的长期偏移方向才新增。禁止把同一条因果链拆成剧情小总结连续累计。
6. 预测、风险、可能、潜在或未来尚未发生的后果不产生偏移；位置暴露、敌人警觉、受伤、逃脱、生存/行动难度变化等局部战术后果不产生偏移；稳定下降及其后续世界响应也不能反过来成为新的负偏移。
7. 负值锚点：关键人物命运不可逆改写 -3~-12；重大事件结果不可逆改变 -3~-10；关键势力格局或主线可行性实质破坏 -2~-8；异常污染持续扩大 -1~-10。普通变化不记录。
8. 正值只来自真实修复：关键人物/重大事件修复 +3~+10；异常清除 +1~+15；势力格局或主线结构修复 +2~+8。高于100不能来自普通善行、胜利或奖励。
9. 单条建议范围 -12~-1 或 +1~+15，0 不建新记录；同一引发者同轮负向总量最多 -12、正向总量最多 +15。程序对越界、同根拆分、局部后果或尚未产生现实结果的偏移执行软归一化/忽略，不触发重试，也不驳回本轮其它世界推进结果。
10. 世界.稳定是偏移台账的派生值，由程序汇总；模型不得直接修改，也不需要每轮“更新稳定值”。`;

    const worldDateKeyBeforeIntegrityGuard=worldDateKey;
    worldDateKey=function(value) {
        const source=String(value||''),base=worldDateKeyBeforeIntegrityGuard(source);
        if(base===null)return null;
        const clock=source.match(/(?:^|[日T\s_-])(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/);
        if(!clock)return base;
        const hour=Number(clock[1]),minute=Number(clock[2]),second=Number(clock[3]||0);
        if(!Number.isInteger(hour)||hour<0||hour>23)return null;
        return Math.floor(base/24)*24+hour+minute/60+second/3600;
    };

    // 完整性校验与排序/调度使用不同精度：世界事件等宏观事实以“日”为硬边界，
    // 避免把“上午/下午”这种粗粒度标签伪装成精确小时后误杀同日推进。
    // 人物只有在两侧都给出 HH:mm 时才保留分钟级保护，防止真实的精确时钟倒流。
    const temporalAnomaliesBeforeIntegrityGuard=temporalAnomalies;
    function integrityWorldDayKey(value) {
        const key=worldDateKey(value);
        return key===null?null:Math.floor(key/24);
    }
    function integrityHasExactClock(value) {
        return /(?:^|[日T\s_-])(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?/.test(String(value||''));
    }
    temporalAnomalies=function(stat) {
        const anomalies=temporalAnomaliesBeforeIntegrityGuard(stat);
        if(!anomalies.length)return anomalies;
        const nowRaw=String(stat?.世界?.时间||''),nowDay=integrityWorldDayKey(nowRaw),nowKey=worldDateKey(nowRaw);
        if(nowDay===null)return anomalies;
        const nowExact=integrityHasExactClock(nowRaw);
        return anomalies.filter(item=>{
            const valueRaw=String(item?.值||''),valueDay=integrityWorldDayKey(valueRaw);
            if(valueDay===null)return true;
            if(valueDay>nowDay)return true;
            if(valueDay<nowDay)return false;
            if(item?.类型!=='人物')return false;
            if(!nowExact||!integrityHasExactClock(valueRaw))return false;
            const valueKey=worldDateKey(valueRaw);
            return nowKey!==null&&valueKey!==null&&valueKey>nowKey;
        });
    };

    // 因果影响幅度是语义层规则，不交给 JSON Schema 拒绝；编译阶段统一软归一化。
    delete OFFSET_RESULT_SCHEMA.properties.影响程度.minimum;
    delete OFFSET_RESULT_SCHEMA.properties.影响程度.maximum;

    const CAUSAL_CHAIN_HINT=/(?:余波|后续|进一步|继续|继而|因此|由此|连锁|衍生|扩散|扩大|反应|吸引力|同一(?:契约|事件|行为|根因))/;
    const CAUSAL_SPECULATION_HINT=/(?:可能|或许|预计|预期|将会|或将|未来(?:会|可能|将)|潜在|恐怕|有望|计划|打算|准备)/;
    const CAUSAL_NO_EFFECT_HINT=/(?:尚未|还未|并未|未曾|没有|仅仅|只是).{0,18}(?:发生|执行|实施|使用|启动|造成|导致|改变|影响|生效)|(?:尚未|还未|并未|未曾|没有).{0,18}(?:结果|变化|后果)/;
    const CAUSAL_REALIZED_HINT=/(?:已经|已然|已被|已使|已让|导致|造成|致使|使得|迫使|结果|改写|改变|破坏|摧毁|死亡|失去|退出|完成|失败|成功|被捕|被杀|被夺|被毁|封锁|崩溃|断裂|清除|修复)/;
    const CAUSAL_RESPONSE_HINT=/(?:稳定值(?:持续)?下降|世界排异(?:反应|升级|增强)?|排异强度)/;
    function clampCausalImpact(value) {
        const impact=Number(value);
        if(!Number.isFinite(impact))return null;
        if(impact===0)return 0;
        return impact<0?Math.max(-12,impact):Math.min(15,impact);
    }
    function causalOffsetText(item) {
        return [item?.名称,item?.描述].filter(Boolean).join(' ');
    }
    function softNormalizeCausalOffsets(stat,result) {
        const items=Array.isArray(result?.因果?.偏移记录)?result.因果.偏移记录:null;
        if(!items||!items.length)return;
        const existing=stat?.世界?.因果轨道?.偏移记录||{},prepared=[];
        for(const raw of items){
            if(!plain(raw))continue;
            const item=copy(raw);
            if(item.操作==='撤销本轮'){prepared.push(item);continue;}
            const existingName=stableNameIn(existing,item.名称),isNew=!existingName;
            if(Object.hasOwn(item,'影响程度')){
                const impact=clampCausalImpact(item.影响程度);
                if(impact===null){
                    if(isNew)continue;
                    delete item.影响程度;
                }else if(isNew&&impact===0)continue;
                else item.影响程度=impact;
            }else if(isNew)continue;
            const text=causalOffsetText(item);
            if(isNew&&CAUSAL_NO_EFFECT_HINT.test(text))continue;
            if(isNew&&CAUSAL_SPECULATION_HINT.test(text)&&!CAUSAL_REALIZED_HINT.test(text))continue;
            if(isNew&&Number(item.影响程度)<0&&CAUSAL_RESPONSE_HINT.test(text))continue;
            prepared.push(item);
        }

        // 明确写成“同一根因/后续/余波”等的同一引发者同向碎片，保留影响绝对值最大的代表项。
        const removed=new Set(),groups=new Map();
        for(let i=0;i<prepared.length;i++){
            const item=prepared[i];
            if(!plain(item)||item.操作==='撤销本轮'||!Object.hasOwn(item,'影响程度'))continue;
            const actor=String(item.引发者||'').trim().toLowerCase();
            const impact=Number(item.影响程度);
            if(!actor||!Number.isFinite(impact)||impact===0)continue;
            const key=actor+'|'+(impact<0?'negative':'positive'),group=groups.get(key)||[];
            group.push({index:i,item,text:causalOffsetText(item),impact});groups.set(key,group);
        }
        for(const group of groups.values()){
            const chained=group.filter(entry=>CAUSAL_CHAIN_HINT.test(entry.text));
            if(chained.length<2)continue;
            let winner=chained[0];
            for(const entry of chained.slice(1))if(Math.abs(entry.impact)>Math.abs(winner.impact))winner=entry;
            for(const entry of chained)if(entry.index!==winner.index)removed.add(entry.index);
        }
        let normalized=prepared.filter((_,index)=>!removed.has(index));

        // 同一引发者同轮总影响做软封顶；不重试、不抛错，只缩减后续条目的剩余额度。
        const budgets=new Map();
        normalized=normalized.filter(item=>{
            if(!plain(item)||item.操作==='撤销本轮'||!Object.hasOwn(item,'影响程度'))return true;
            const actor=String(item.引发者||'').trim().toLowerCase(),impact=Number(item.影响程度);
            if(!actor||!Number.isFinite(impact)||impact===0)return true;
            const sign=impact<0?'negative':'positive',key=actor+'|'+sign;
            let remaining=budgets.has(key)?budgets.get(key):(impact<0?12:15);
            const magnitude=Math.min(Math.abs(impact),remaining);
            remaining=Math.max(0,remaining-magnitude);budgets.set(key,remaining);
            if(magnitude<=0)return false;
            item.影响程度=impact<0?-magnitude:magnitude;
            return true;
        });
        result.因果.偏移记录=normalized;
    }

    const compileWorldResultBeforeIntegrityGuard=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        softNormalizeCausalOffsets(stat,result);
        return compileWorldResultBeforeIntegrityGuard(stat,result);
    };

    const retryPlanBeforeIntegrityGuard=retryPlanForFailure;
    retryPlanForFailure=function(error,rejected=[]) {
        const plan=retryPlanBeforeIntegrityGuard(error,rejected).slice();
        const message=[String(error?.message||error||''),...(rejected||[]).map(item=>String(item?.原因||''))].join('\n');
        if(/时间事实超过当前世界时间|时间越界记录仍未修复/.test(message))plan.unshift('时间一致性：事件/地区/历史/传播只把“跨到未来自然日”视为硬越界，同日不同上午/下午/HH:mm无需回写；人物只有双方均明确 HH:mm 时才做分钟级校验。未来计划放预计结束、下次检查或待发生事件。');
        return Array.from(new Set(plan.filter(Boolean)));
    };

    const SamsaraWorldEngineBeforeIntegrityGuard=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeIntegrityGuard {
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            request.system=String(request.system||'')+'\n\n'+WORLD_INTEGRITY_GUARD_RULES;
            request.manifest=request.manifest||{};
            request.manifest.因果与时间约束={启用:true,因果偏移处理:'仅重大世界级变化时维护；无变化则省略',单条建议范围:'-12~-1 / +1~+15',宏观事实时间:'同一自然日允许；跨日未来拒绝',人物精确时间:'仅双方均为 HH:mm 时精确比较'};
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema||WORLD_RESULT_SCHEMA);
            return request;
        }
    };
    // 世界时间段别名兼容：自然语言同义词先归一化，再交给统一时间比较器。
    // 只处理明确属于同一日内时段的别名；“午夜”等跨日语义不在这里猜测。
    const WORLD_DAYPART_ALIASES=Object.freeze({
        '清早':'清晨',
        '早上':'早晨',
        '黄昏':'傍晚',
        '夜晚':'晚上',
        '夜间':'晚上',
        '夜里':'晚上',
        '晚间':'晚上'
    });
    function normalizeWorldDaypartAlias(value) {
        let source=String(value||'');
        for(const [alias,canonical] of Object.entries(WORLD_DAYPART_ALIASES))source=source.replaceAll(alias,canonical);
        return source;
    }
    const worldDateKeyBeforeDaypartAliases=worldDateKey;
    worldDateKey=function(value) {
        return worldDateKeyBeforeDaypartAliases(normalizeWorldDaypartAlias(value));
    };
    // 稳定度因果闸门：只有已实现的“世界本身长期变化”才允许进入稳定台账；玩家战术处境、异端获知情报等局部后果直接忽略。
    const CAUSAL_WORLD_SCALE_HINTS=[
        /(?:关键人物|核心人物|重要人物|关键角色|核心角色).{0,28}(?:命运|死亡|阵亡|被杀|永久|不可逆|退场|失去|背叛|被捕|失踪|改写|改变|修复)/,
        /(?:死亡|阵亡|被杀|永久|不可逆|退场|被捕|失踪|改写|改变|修复).{0,28}(?:关键人物|核心人物|重要人物|关键角色|核心角色)/,
        /(?:重大|关键|宏观|主线).{0,8}(?:事件|节点|战役|战争|仪式|计划|灾难).{0,32}(?:改变|改写|失败|成功|取消|终止|提前|延后|崩溃|完成|毁灭|修复|失效)/,
        /(?:势力|阵营|政权|国家|帝国|王国|组织|军团|城市|地区).{0,32}(?:格局|覆灭|崩溃|瓦解|分裂|易主|政变|失守|沦陷|吞并|解体|重组|修复)/,
        /(?:主线|故事线|世界格局|下一节点|原定(?:走向|结局)).{0,32}(?:改变|改写|断裂|失效|无法|偏离|重构|修复|恢复)/,
        /(?:异常污染|跨世界污染|污染|世界裂隙|跨世界异常|异常侵蚀|世界侵蚀).{0,32}(?:扩大|扩散|蔓延|加剧|持续|清除|消除|修复|收束|封闭)/,
        /(?:异端|入侵者).{0,28}(?:全部|彻底|主要|核心).{0,16}(?:清除|消灭|死亡|覆灭).{0,36}(?:跨世界干涉|异常污染|世界裂隙|世界结构|主线|世界格局).{0,24}(?:消失|解除|恢复|修复|收束|封闭)/,
        /(?:跨世界干涉|异常污染|世界裂隙|世界结构|主线|世界格局).{0,24}(?:因|由于).{0,20}(?:异端|入侵者).{0,24}(?:清除|消灭|死亡|覆灭).{0,20}(?:消失|解除|恢复|修复|收束|封闭)/,
        /(?:不可逆|永久).{0,20}(?:命运|主线|重大事件|关键事件|势力格局|世界格局)/
    ];
    const CAUSAL_CLEAR_LOCAL_HINT=/(?:位置(?:暴露|泄露|被发现|被感知)|被(?:敌人|异端|对手).{0,16}(?:发现|察觉|感知|盯上|追踪|锁定)|异端.{0,16}(?:知道|获知|发现|察觉|感知).{0,16}(?:玩家|轮回者|位置|行踪|能力|身份)|提前感知|引起警觉|提高.{0,10}难度|增加.{0,10}难度|生存难度|行动难度|追杀压力|短期.{0,8}(?:困难|不利)|局部战斗|普通战斗|受伤|轻伤|逃脱|脱险|暂时受阻|临时受阻)/;
    function causalOffsetHasWorldScaleEvidence(item) {
        const text=causalOffsetText(item);
        return !!text&&CAUSAL_WORLD_SCALE_HINTS.some(rule=>rule.test(text));
    }
    function filterNewCausalOffsetsByWorldScale(stat,result) {
        const items=result?.因果?.偏移记录;
        if(!Array.isArray(items)||!items.length)return [];
        const existing=stat?.世界?.因果轨道?.偏移记录||{},dropped=[];
        result.因果.偏移记录=items.filter(item=>{
            if(!plain(item)||item.操作==='撤销本轮')return true;
            if(stableNameIn(existing,item.名称))return true;
            if(causalOffsetHasWorldScaleEvidence(item))return true;
            dropped.push(item.名称);
            return false;
        });
        return dropped;
    }
    function staleLocalCausalOffsetRepairs(stat,result) {
        const bucket=stat?.世界?.因果轨道?.偏移记录||{},protectedNames=new Set();
        for(const item of result?.因果?.偏移记录||[]){
            if(plain(item)&&causalOffsetHasWorldScaleEvidence(item))protectedNames.add(nameKey(item.名称));
        }
        const patches=[],names=[];
        for(const [name,record] of Object.entries(bucket)){
            const impact=Number(record?.影响程度)||0;
            if(!impact||protectedNames.has(nameKey(name)))continue;
            const text=causalOffsetText(Object.assign({名称:name},record));
            if(!CAUSAL_CLEAR_LOCAL_HINT.test(text)||CAUSAL_WORLD_SCALE_HINTS.some(rule=>rule.test(text)))continue;
            patches.push({op:'remove',path:pointer(['世界','因果轨道','偏移记录',name])});
            names.push(name);
        }
        return {patches,names};
    }

    const compileWorldResultBeforeCausalStabilityGate=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        const dropped=filterNewCausalOffsetsByWorldScale(stat,result);
        const compiled=compileWorldResultBeforeCausalStabilityGate(stat,result);
        const repairs=staleLocalCausalOffsetRepairs(stat,result);
        const occupied=new Set(compiled.patches.map(patch=>patch.path));
        for(const patch of repairs.patches)if(!occupied.has(patch.path))compiled.patches.push(patch);
        if(dropped.length)compiled.warnings.push('忽略非世界尺度因果偏移：'+dropped.join('、'));
        if(repairs.names.length)compiled.warnings.push('清理局部稳定偏移：'+repairs.names.join('、'));
        return compiled;
    };

    // 基础补丁层只允许删除传播/传闻/资产；因果闸门需要能清理历史脏偏移。
    // 只对“世界.因果轨道.偏移记录.<名称>”这一条精确路径做受控预删除，其余 remove 仍走原安全规则。
    const applyPatchesBeforeCausalStabilityGate=applyPatches;
    applyPatches=function(stat,patches) {
        if(!Array.isArray(patches)||!patches.some(patch=>patch?.op==='remove'&&(()=>{try{const p=tokens(patch.path);return p[0]==='世界'&&p[1]==='因果轨道'&&p[2]==='偏移记录'&&p.length===4;}catch(_){return false;}})()))return applyPatchesBeforeCausalStabilityGate(stat,patches);
        const seeded=copy(stat),rest=[];
        for(const patch of patches){
            let p=null;try{p=tokens(patch.path);}catch(_){}
            if(patch?.op==='remove'&&p&&p[0]==='世界'&&p[1]==='因果轨道'&&p[2]==='偏移记录'&&p.length===4){
                if(plain(seeded?.世界?.因果轨道?.偏移记录))delete seeded.世界.因果轨道.偏移记录[p[3]];
                continue;
            }
            rest.push(patch);
        }
        return applyPatchesBeforeCausalStabilityGate(seeded,rest);
    };
    // 世界时间单一所有权：世界推进 AI 负责初始化/推进世界.时间；变量 AI 的写入在事件层被回滚。
    const WORLD_TIME_RULES=`【世界时间所有权】
1. 世界.时间由世界推进独占维护。顶层“时间”只用于初始化或实际推进当前世界时钟；人物更新时间、事件计划时间不能代替世界时钟。
2. 当前时间为空/待初始化时，按最新正文与明确资料建立时间锚点；资料只能确定季节、阶段或时段时保持该精度，不为格式完整编造月日。
3. 精确到月日时统一写 {yyy}年-{mm}月-{dd}日-{时间段}；月份必须为数字。时间段只能选：凌晨 / 黎明 / 清晨 / 早晨 / 上午 / 中午 / 午后 / 下午 / 傍晚 / 入夜 / 晚上 / 深夜。不要输出“夜晚/黄昏/早上”等其它同义词。
4. 时间段是粗粒度时间锚点，不是每轮计数器。没有足够时间流逝跨过当前时段时，省略“时间”并保持原值；只有正文或明确时间资料表明确实经过了合理时长，才推进到后续时段或日期。禁止仅因本轮执行了世界推进就机械跳时段。
5. 世界时间不得回退，也不得把待发生事件的计划时间提前写成当前时间。人物/地区等“更新时间”由程序按本轮最终世界时间统一盖章。
6. 从主神空间进入新副本时，程序会先清空世界.时间与旧历法；必须把这视为全新世界的时间初始化，严禁继承上一副本或主神空间“轮回历”的日期。`;

    const MACHINE_TIME_DESCRIPTION='精确到月日时使用 {yyy}年-{mm}月-{dd}日-{时间段}；时间段仅限：凌晨/黎明/清晨/早晨/上午/中午/午后/下午/傍晚/入夜/晚上/深夜；只能确定季节/阶段时可保留粗粒度。';
    WORLD_RESULT_SCHEMA.properties.时间={type:'string',minLength:1,description:'当前世界时间。'+MACHINE_TIME_DESCRIPTION};
    if(EVENT_RESULT_SCHEMA?.properties){
        for(const key of ['时间','开始时间','预计结束','更新时间','下次检查'])if(EVENT_RESULT_SCHEMA.properties[key])EVENT_RESULT_SCHEMA.properties[key].description=MACHINE_TIME_DESCRIPTION;
    }

    function worldTimeUnset(value) {
        const raw=String(value??'').trim();
        return !raw||raw==='待初始化';
    }
    function worldTimeIdentity(value) {
        return String(value??'').trim().replace(/[\s·・_—–-]+/g,'');
    }
    function worldTimeClaimsMonthDay(value) {
        const source=String(value??'').trim();
        return !!source&&/月/.test(source)&&/(?:第\s*)?\d{1,2}\s*日/.test(source);
    }
    function worldTimeCalendarFor(stat,result) {
        return plain(result?.历法)?result.历法:(plain(stat?.世界?.历法)?stat.世界.历法:{});
    }
    function assertCalendarCompatibleTimeValue(stat,result,value,label='时间') {
        const raw=String(value??'').trim();
        if(!worldTimeClaimsMonthDay(raw))return;
        if(calendarDate(raw,worldTimeCalendarFor(stat,result)))return;
        throw new Error(label+'格式无法用于日历：'+raw+'。精确到月日时请使用 {yyy}年-{mm}月-{dd}日-{时间段}；不要用月份名称替代数字月。');
    }
    function assertCalendarCompatibleWorldResultTimes(stat,result) {
        const temporalKeys=new Set(['时间','开始时间','预计结束','更新时间','到期时间','下次检查','开始','结束','期限','获知时间']);
        const walk=(value,path=[])=>{
            if(Array.isArray(value)){for(let i=0;i<value.length;i++)walk(value[i],path.concat(i));return;}
            if(!plain(value))return;
            for(const [key,child] of Object.entries(value)){
                const nextPath=path.concat(key);
                if(typeof child==='string'&&temporalKeys.has(key))assertCalendarCompatibleTimeValue(stat,result,child,nextPath.join('.'));
                else if(child&&typeof child==='object')walk(child,nextPath);
            }
        };
        walk(result);
    }
    function inferWorldTimeFromCurrentActivities(result) {
        const candidates=new Map();
        for(const item of result?.人物||[]){
            if(!plain(item)||item.操作==='撤销本轮')continue;
            const activeFacts=String(item.地点||'').trim()&&String(item.目标||'').trim()&&String(item.行动||'').trim();
            const raw=String(item.更新时间||'').trim();
            if(!activeFacts||!raw)continue;
            const key=worldTimeIdentity(raw);if(key&&!candidates.has(key))candidates.set(key,raw);
        }
        return candidates.size===1?Array.from(candidates.values())[0]:'';
    }
    function resolveWorldTimeProposal(stat,result) {
        const explicit=String(result?.时间||'').trim();
        if(explicit)return explicit;
        if(!worldTimeUnset(stat?.世界?.时间))return '';
        return inferWorldTimeFromCurrentActivities(result);
    }
    function assertWorldTimeNotBackwards(stat,nextTime) {
        const current=String(stat?.世界?.时间||'').trim();
        if(worldTimeUnset(current)||!nextTime)return;
        const before=worldDateKey(current),after=worldDateKey(nextTime);
        if(before!==null&&after!==null&&after<before)throw new Error('世界时间不可回退：'+current+' -> '+nextTime);
    }

    const normalizeWorldResultBeforeWorldTimeOwnership=normalizeWorldResult;
    normalizeWorldResult=function(value) {
        const result=normalizeWorldResultBeforeWorldTimeOwnership(value);
        if(plain(value)&&Object.hasOwn(value,'时间')){
            const time=String(value.时间??'').trim();
            if(time)result.时间=time;
        }
        return result;
    };

    const mergeWorldResultsBeforeWorldTimeOwnership=mergeWorldResults;
    mergeWorldResults=function(base,incoming) {
        const result=mergeWorldResultsBeforeWorldTimeOwnership(base,incoming);
        const a=base?normalizeWorldResult(base):null,b=normalizeWorldResult(incoming);
        if(Object.hasOwn(b,'时间'))result.时间=b.时间;
        else if(a&&Object.hasOwn(a,'时间'))result.时间=a.时间;
        return result;
    };

    const worldResultFragmentsBeforeWorldTimeOwnership=worldResultFragments;
    worldResultFragments=function(value) {
        const result=normalizeWorldResult(value),split=worldResultFragmentsBeforeWorldTimeOwnership(result);
        if(Object.hasOwn(result,'时间'))split.fragments.unshift({label:'时间',result:{摘要:'',时间:result.时间}});
        return split;
    };

    const allowedBeforeWorldTimeOwnership=allowed;
    allowed=function(parts,stat) {
        if(Array.isArray(parts)&&parts.length===2&&parts[0]==='世界'&&parts[1]==='时间')return true;
        return allowedBeforeWorldTimeOwnership(parts,stat);
    };

    const compileWorldResultBeforeWorldTimeOwnership=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value),proposal=resolveWorldTimeProposal(stat,result);
        if(proposal)result.时间=proposal;
        assertCalendarCompatibleWorldResultTimes(stat,result);
        if(proposal)assertWorldTimeNotBackwards(stat,proposal);
        const compiled=compileWorldResultBeforeWorldTimeOwnership(stat,result);
        if(proposal){
            const old=stat?.世界?.时间;
            if(String(old??'')!==proposal)compiled.patches.unshift({op:old===undefined?'add':'replace',path:'/世界/时间',value:proposal});
            compiled.result.时间=proposal;
        }
        return compiled;
    };

    if(Array.isArray(WORLD_REPLAY_SCOPES)&&!WORLD_REPLAY_SCOPES.some(scope=>scope.length===2&&scope[0]==='世界'&&scope[1]==='时间'))WORLD_REPLAY_SCOPES.unshift(['世界','时间']);

    const SamsaraWorldEngineBeforeWorldTimeOwnership=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeWorldTimeOwnership {
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            request.system=String(request.system||'')+'\n\n'+WORLD_TIME_RULES;
            try{
                const payload=JSON.parse(request.input);
                payload.世界时间维护={
                    当前时间:String(base?.stat?.世界?.时间||''),
                    是否需要初始化:worldTimeUnset(base?.stat?.世界?.时间),
                    所有权:'世界推进独占写入；变量 AI 只读',
                    精确日期格式:'顶层时间及所有事件/历史/传播等日期，只要精确到月日就使用 {yyy}年-{mm}月-{dd}日-{时间段}。月份必须是数字；不要用自定义月份名称替代数字月。',
                    时间段候选:['凌晨','黎明','清晨','早晨','上午','中午','午后','下午','傍晚','入夜','晚上','深夜'],
                    推进原则:'时间段是粗粒度锚点，不是每轮计数器；没有足够时间流逝跨过当前时段就保持原值，只有正文或明确资料表明确实经过合理时长才推进。'
                };
                request.input=JSON.stringify(payload,null,2);
            }catch(_){}
            request.schema=copy(WORLD_RESULT_SCHEMA);
            if(request.manifest)request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
        handleWorldReplayVariableEvent(variables,before) {
            const handled=super.handleWorldReplayVariableEvent(variables,before);
            if(handled||this.committing||!this.isEnabled()||!plain(variables?.stat_data)||!plain(before?.stat_data))return handled;
            const previous=String(before?.stat_data?.世界?.时间??'');
            const incoming=String(variables?.stat_data?.世界?.时间??'');
            if(previous===incoming)return handled;

            // 世界切换是唯一允许程序层改写世界.时间的边界：
            // 主神空间 -> 副本只能清空/待初始化；副本 -> 主神空间只能写轮回历。
            // 其它变量更新仍一律回滚，继续保证世界推进的单一所有权。
            const wasSpace=before?.stat_data?.系统状态?.是否在主神空间===true;
            const isSpace=variables?.stat_data?.系统状态?.是否在主神空间===true;
            if(wasSpace!==isSpace){
                const enteringWorld=wasSpace&&!isSpace;
                const returningToSpace=!wasSpace&&isSpace;
                const mainSpaceTime=/^轮回历\d+年-\d{2}月-\d{2}日-(?:凌晨|黎明|清晨|早晨|上午|中午|午后|下午|傍晚|入夜|晚上|深夜)$/.test(incoming);
                if((enteringWorld&&worldTimeUnset(incoming))||(returningToSpace&&mainSpaceTime))return handled;
            }

            if(!plain(variables.stat_data.世界))variables.stat_data.世界={};
            variables.stat_data.世界.时间=previous;
            return true;
        }
    };    // 恢复包可靠性：世界推进成功后主动持久化 replay，不再依赖 replaceMvuData 是否触发可用的 VARIABLE_UPDATE_ENDED。
    // 对旧楼若 replay 缺失，优先用本次重处理事件的 before/已处理楼层恢复；实在无旧状态时按自动推进开关决定是否立即重建。
    const SamsaraWorldEngineBeforeReplayPersistence=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeReplayPersistence {
        worldReplayReprocessContext(variables,before) {
            if(!plain(variables?.stat_data))return null;
            const current=this.worldReplayCurrentMessage?.();
            if(!current)return null;
            const mvu=this.env.Mvu||this.host.Mvu;
            let raw;
            try{raw=mvu?.getMvuData?.({type:'message',message_id:current.id});}catch(_){return null;}
            // “重新处理变量”会清掉当前楼 stat_data，但 replay 根字段仍可保留；before 也可证明旧楼已成功处理。
            if(!plain(raw)||plain(raw.stat_data))return null;
            const beforeStat=plain(before?.stat_data)?before.stat_data:null;
            const replay=raw.__samsaraWorldReplay;
            const replayMatches=plain(replay)&&String(replay.fingerprint||'')===current.fingerprint;
            const beforeHandled=String(beforeStat?.世界?.[PATH]?.已处理楼层||'');
            if(!replayMatches&&beforeHandled!==current.fingerprint)return null;
            return {current,raw,mvu,beforeStat};
        }
        worldReplaySetCycleRecovered(fingerprint,stat) {
            this.autoProgressCycleKey=this.autoProgressContextKey({fingerprint,stat});
            this.autoProgressHasRun=true;
            this.autoProgressRoundsSinceRun=0;
            this.autoProgressLastSeenFingerprint=fingerprint;
            this.autoProgressDueFingerprint=fingerprint;
        }
        worldReplayClearHandledForRetry(stat,fingerprint) {
            const state=stat?.世界?.[PATH];
            if(!plain(state))return;
            if(!fingerprint||String(state.已处理楼层||'')===String(fingerprint)){
                state.已处理楼层='';
                state.已处理时间='';
            }
        }
        worldReplayLegacyPackage(context,variables) {
            const beforeStat=context?.beforeStat;
            if(!plain(beforeStat)||!plain(variables?.stat_data))return null;
            if(String(beforeStat?.世界?.[PATH]?.已处理楼层||'')!==context.current.fingerprint)return null;
            return this.buildWorldReplayPackage(variables.stat_data,beforeStat,context.current.fingerprint);
        }
        handleWorldReplayVariableEvent(variables,before) {
            const context=this.worldReplayReprocessContext(variables,before);
            if(context){
                let replay=plain(context.raw.__samsaraWorldReplay)&&String(context.raw.__samsaraWorldReplay.fingerprint||'')===context.current.fingerprint
                    ?context.raw.__samsaraWorldReplay:null;
                let legacyRecovered=false;
                if(!replay){
                    replay=this.worldReplayLegacyPackage(context,variables);
                    legacyRecovered=!!replay;
                }
                if(replay&&this.applyWorldReplayPackage(variables.stat_data,replay)){
                    this.worldReplayMarkEventInternal();
                    variables.__samsaraWorldReplay=copy(replay);
                    this.worldReplaySetCycleRecovered(context.current.fingerprint,variables.stat_data);
                    this.status=legacyRecovered?'已从旧楼状态重建并恢复世界推进结果 · 未重新调用 AI':'已恢复本楼世界推进结果 · 未重新调用 AI';
                    this.render();
                    return true;
                }

                // before/已处理楼层已经证明这一楼过去确实成功推进过；缺 replay 时不需要重新计算推进间隔。
                // 清掉失效处理标记，并把这一楼重新标记为 due。自动推进开启时由本分支主动安排补跑，不依赖基础 VARIABLE_UPDATE_ENDED 监听兜底。
                this.worldReplayClearHandledForRetry(variables.stat_data,context.current.fingerprint);
                delete variables.__samsaraWorldReplay;
                this.worldReplaySetCycleRecovered(context.current.fingerprint,variables.stat_data);
                if(this.config.autoProgress===true&&this.isEnabled()){
                    this.status='变量已重处理 · 正在自动重新推进本楼';
                    this.render();
                    this.schedule('variable-update',0);
                }else if(this.config.autoProgress!==true){
                    this.status='变量已重处理 · 旧楼缺少恢复快照；自动推进已关闭，请手动推进';
                    this.render();
                }else{
                    this.status='变量已重处理 · 世界推进已关闭，未自动重建';
                    this.render();
                }
                return false;
            }
            return super.handleWorldReplayVariableEvent(variables,before);
        }
    };
    // 变量重处理缺少 replay 时，直接使用 VARIABLE_UPDATE_ENDED 传入的 variables 重新推进；不等待 MVU 二次落盘。
    const SamsaraWorldEngineBeforeImmediateReprocessRetry=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeImmediateReprocessRetry {
        worldReplayWaitForIdle() {
            if(!this.busy)return Promise.resolve();
            if(!Array.isArray(this.worldReplayIdleWaiters))this.worldReplayIdleWaiters=[];
            return new Promise(resolve=>this.worldReplayIdleWaiters.push(resolve));
        }
        worldReplayResolveIdleWaiters() {
            const waiters=Array.isArray(this.worldReplayIdleWaiters)?this.worldReplayIdleWaiters.splice(0):[];
            for(const resolve of waiters){try{resolve();}catch(_){}}
        }
        async worldReplayImmediateRetry(context,variables) {
            if(!context?.mvu?.replaceMvuData||!plain(variables?.stat_data))return false;
            if(this.busy){
                this.cancel();
                await this.worldReplayWaitForIdle();
            }
            if(this.disposed||this.config.autoProgress!==true||!this.isEnabled())return false;

            const seed=Object.assign({},copy(context.raw),copy(variables));
            this.worldReplayClearHandledForRetry(seed.stat_data,context.current.fingerprint);
            delete seed.__samsaraWorldReplay;
            this.worldReplayMarkEventInternal();
            const previousRetrying=this.worldReplayImmediateRetrying===true;
            this.worldReplayImmediateRetrying=true;
            try{
                await context.mvu.replaceMvuData(seed,{type:'message',message_id:context.current.id});
            }finally{
                this.worldReplayImmediateRetrying=previousRetrying;
            }

            const result=await this.run({automatic:true});
            if(result!==true)return false;

            let finalRaw;
            try{finalRaw=context.mvu.getMvuData({type:'message',message_id:context.current.id});}catch(_){finalRaw=null;}
            if(plain(finalRaw?.stat_data))variables.stat_data=copy(finalRaw.stat_data);
            if(finalRaw&&Object.prototype.hasOwnProperty.call(finalRaw,'__samsaraWorldReplay'))variables.__samsaraWorldReplay=copy(finalRaw.__samsaraWorldReplay);
            return true;
        }
        async handleWorldReplayVariableEvent(variables,before) {
            if(this.worldReplayImmediateRetrying===true)return false;
            const context=this.worldReplayReprocessContext?.(variables,before);
            if(context){
                const storedReplay=context.raw.__samsaraWorldReplay;
                const validStored=plain(storedReplay)&&String(storedReplay.fingerprint||'')===context.current.fingerprint;
                const legacy=!validStored?this.worldReplayLegacyPackage?.(context,variables):null;
                if(!validStored&&!legacy){
                    this.worldReplayClearHandledForRetry(variables.stat_data,context.current.fingerprint);
                    delete variables.__samsaraWorldReplay;
                    if(this.config.autoProgress===true&&this.isEnabled()){
                        this.status='变量已重处理 · 正在重新推进本楼';
                        this.render();
                        return await this.worldReplayImmediateRetry(context,variables);
                    }
                }
            }
            return await super.handleWorldReplayVariableEvent(variables,before);
        }
        async run(options={}) {
            try{return await super.run(options);}
            finally{this.worldReplayResolveIdleWaiters();}
        }
    };
    // 活跃异端活动时间戳：模型提交活动事实；世界时间由 WorldResult.时间 维护，人物时间戳由程序统一盖章。
    const activeAlienActivityRequirementsBeforeTimestampNormalization=activeAlienActivityRequirements;
    activeAlienActivityRequirements=function(stat) {
        return activeAlienActivityRequirementsBeforeTimestampNormalization(stat).map(item=>Object.assign({},item,{
            要求:'本轮必须在 WorldResult.人物 中提交该活跃异端的活动复核；至少给出非空地点、目标、行动。人物更新时间无需抄写，由程序使用本轮最终世界时间统一记录；若本轮已确认其死亡，则只把异端状态更新为死亡，不再提交人物活动。'
        }));
    };

    const compileWorldResultBeforeAlienActivityNormalization=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        const roster=(stat?.设置||{}).单一世界?{}:(stat?.世界?.异端雷达?.名单||{});
        const plannedDead=new Set((result.异端||[])
            .filter(item=>item?.操作!=='撤销本轮'&&item?.状态==='死亡')
            .map(item=>nameKey(item.名称)));
        const proposedTime=typeof resolveWorldTimeProposal==='function'?resolveWorldTimeProposal(stat,result):'';
        const worldTime=String(proposedTime||stat?.世界?.时间||'').trim();
        if(Array.isArray(result.人物)){
            for(const item of result.人物){
                if(!plain(item)||item.操作==='撤销本轮')continue;
                const rosterName=stableNameIn(roster,item.名称),alien=rosterName?roster[rosterName]:null;
                if(!alien||alien.状态==='死亡'||plannedDead.has(nameKey(rosterName||item.名称)))continue;
                const submitted=String(item.地点||'').trim()&&String(item.目标||'').trim()&&String(item.行动||'').trim();
                if(!submitted)continue;
                if(worldTime)item.更新时间=worldTime;
                else delete item.更新时间;
            }
        }
        return compileWorldResultBeforeAlienActivityNormalization(stat,result);
    };

    ensureActiveAlienActivity=function(next,required,acceptedResult,worldTime) {
        const roster=next?.世界?.异端雷达?.名单||{},people=next?.世界?.[PATH]?.人物||{},proposals=acceptedResult?.人物||[],missing=[];
        const canonicalTime=String(next?.世界?.时间||worldTime||'').trim();
        for(const item of required||[]){
            const rosterName=stableNameIn(roster,item.雷达名称||item.名称),alien=rosterName?roster[rosterName]:null;
            if(!alien||alien.状态==='死亡')continue;
            const personName=stableNameIn(people,item.名称)||stableNameIn(people,rosterName),person=personName?people[personName]:null;
            const proposal=proposals.find(p=>nameKey(p.名称)===nameKey(item.名称)||nameKey(p.名称)===nameKey(rosterName));
            const submitted=proposal&&String(proposal.地点||'').trim()&&String(proposal.目标||'').trim()&&String(proposal.行动||'').trim();
            const factsComplete=person&&String(person.地点||'').trim()&&String(person.目标||'').trim()&&String(person.行动||'').trim();
            const timeComplete=!canonicalTime||sameWorldTimeAnchor(person?.更新时间,canonicalTime);
            if(!submitted||!factsComplete||!timeComplete)missing.push(rosterName||item.名称);
        }
        if(missing.length)throw new Error('异端活动未复核：'+missing.join('、')+'；活跃异端每轮都必须提交人物活动并写明地点、目标、行动；人物更新时间由程序使用世界时间统一记录；若已死亡则更新异端状态为死亡');
    };

    const retryPlanForFailureBeforeAlienActivityNormalization=retryPlanForFailure;
    retryPlanForFailure=function(error,rejected=[]) {
        return retryPlanForFailureBeforeAlienActivityNormalization(error,rejected).map(item=>String(item)
            .replace('在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动，并把更新时间精确写为当前世界时间；若本轮已确认死亡','在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动；人物更新时间由程序使用世界时间统一记录；若本轮已确认死亡')
            .replace('在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动；更新时间由程序统一记录为当前世界时间；若本轮已确认死亡','在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动；人物更新时间由程序使用世界时间统一记录；若本轮已确认死亡')
        );
    };
    // 传闻节流：默认保持现有公开传闻，只在真实的信息事件发生时刷新；传闻/传播失败不再拖整轮重试。
    const RUMOR_THROTTLE_RULES=`【传闻刷新节流 · 取代前述“每轮替换”要求】
1. 公开传闻默认保持不变。只有“传闻维护.本轮公开传闻动作”要求更新时才写传闻；禁止为了制造活跃感、凑数量或普通小事每轮改写。
2. 触发只包括：某分类为空需补1条；已有传播链因关联事件新进展、到期或超过72小时而需复核；本轮刚建立/更新且尚未建立传播链、具有公开征兆/可见影响的新事件。旧事件不会因为仍然存在而反复触发。普通行动、普通战斗、轻微状态或数值变化不触发刷新。
3. 单次触发每个分类最多更新1条。优先刷新与本次事实直接相关的同名传闻；否则追加1条，由程序自动滚动淘汰最旧条目。没有触发时三类传闻都保持原样，不提交无变化更新。
4. 传闻与传播属于软维护。单个传闻/传播片段格式错误或本轮未维护完成时，丢弃该片段并保留其它已验收结果；不得仅为传闻/传播重新调用整轮世界推进。
5. 情报交易的购买、付款、消费性删除仍由MVU/变量AI处理；世界引擎只维护其世界侧信息来源。`;
    const RUMOR_THROTTLE_PRESET_STEP='Step 6 · 信息传播：公开传闻默认保持不变；仅在空分类、传播链需复核或出现新的公开可传播事实时按需更新，每个触发每类最多1条。传闻/传播属于软维护，失败不重跑整轮。';
    function upgradeRumorThrottlePreset(value) {
        const source=String(value||'');
        if(source.includes(RUMOR_THROTTLE_PRESET_STEP))return source;
        if(typeof RUMOR_PRESET_STEP_NEW==='string'&&source.includes(RUMOR_PRESET_STEP_NEW))return source.replace(RUMOR_PRESET_STEP_NEW,RUMOR_THROTTLE_PRESET_STEP);
        return source;
    }
    if(plain(BUILTIN_DEFAULT_PROMPT_DOCUMENT?.settings))BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.preset=upgradeRumorThrottlePreset(BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.preset);

    const rumorMaintenanceRequirementsBeforeThrottle=rumorMaintenanceRequirements;
    rumorMaintenanceRequirements=function(stat) {
        const required=rumorMaintenanceRequirementsBeforeThrottle(stat);
        const emptyCategories=RUMOR_PUBLIC_CATEGORIES.filter(category=>Number(required?.公开传闻?.[category]?.当前数量||0)===0);
        const review=Array.isArray(required?.本轮必须复核的传播链)?required.本轮必须复核的传播链:[];
        const currentTime=String(required?.世界时间||'').trim();
        const candidates=(Array.isArray(required?.可传播候选事件)?required.可传播候选事件:[])
            .filter(item=>String(item?.更新时间||'').trim()===currentTime)
            .slice(-2);
        const reasons=[];
        if(emptyCategories.length)reasons.push('空分类：'+emptyCategories.join('、'));
        if(review.length)reasons.push('传播复核：'+review.map(item=>item.名称).join('、'));
        if(candidates.length)reasons.push('新公开事实：'+candidates.map(item=>item.名称).join('、'));
        required.可传播候选事件=candidates;
        required.刷新原因=reasons;
        required.本轮公开传闻动作=reasons.length?'按需更新；每个触发每类最多1条':'保持不变';
        return required;
    };

    function isSoftRumorFragment(label) {
        return /^(?:传闻\/|传播\/)/.test(String(label||''));
    }
    const stageWorldResultBeforeRumorThrottle=stageWorldResult;
    stageWorldResult=function(stat,accepted,incoming,validate) {
        const staged=stageWorldResultBeforeRumorThrottle(stat,accepted,incoming,validate);
        const softRejected=(staged.rejected||[]).filter(item=>isSoftRumorFragment(item?.片段));
        if(!softRejected.length)return staged;
        return Object.assign({},staged,{
            rejected:(staged.rejected||[]).filter(item=>!isSoftRumorFragment(item?.片段)),
            softRejected
        });
    };

    // 情报交易的“真实内幕”是后台主持人信息：数据继续保留给AI/变量系统，玩家传闻面板不渲染该详情入口。
    function hideRumorTradeHostOnlyDetails(root) {
        const sections=Array.from(root?.querySelectorAll?.('.we-section')||[]);
        const trade=sections.find(section=>section.querySelector('.we-section-head h2')?.textContent?.trim()==='情报交易');
        if(!trade)return 0;
        let removed=0;
        for(const detail of trade.querySelectorAll('details')){
            const summary=detail.querySelector('summary')?.textContent?.trim();
            if(summary==='主持人档案'){
                detail.remove();
                removed++;
            }
        }
        return removed;
    }

    const SamsaraWorldEngineBeforeRumorThrottle=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeRumorThrottle {
        constructor(host,env) {
            super(host,env);
            if(this.config.activePromptDocumentId===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id){
                const upgraded=upgradeRumorThrottlePreset(this.config.preset);
                if(upgraded!==this.config.preset){this.config.preset=upgraded;this.saveConfig();}
            }
        }
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            const maintenance=rumorMaintenanceRequirements(base?.stat||{});
            const payload=JSON.parse(request.input);
            payload.传闻维护=Object.assign({},payload.传闻维护||{}, {
                本轮公开传闻动作:maintenance.本轮公开传闻动作,
                刷新原因:copy(maintenance.刷新原因||[]),
                可传播候选事件:copy(maintenance.可传播候选事件||[])
            });
            request.input=JSON.stringify(payload,null,2);
            request.system=String(request.system||'')+'\n\n'+RUMOR_THROTTLE_RULES;
            request.manifest=request.manifest||{};
            request.manifest.传闻节流={
                模式:'按需刷新',
                本轮动作:maintenance.本轮公开传闻动作,
                刷新原因:copy(maintenance.刷新原因||[]),
                软失败不重试:true
            };
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema||WORLD_RESULT_SCHEMA);
            return request;
        }
        render(force) {
            const result=super.render(force);
            if(this.tab==='传闻')hideRumorTradeHostOnlyDetails(this.panel?.querySelector?.('main'));
            return result;
        }
    };
    const RUMOR_WORLD_SOURCE_RULES=`【信息传播 · 世界侧事实】
1. 传闻与传播描述世界里正在流通的信息；正文只用于确认事实与时间，不是直接传播源。禁止把正文中的个人行动、战斗细节、私密对话、能力或收益直接改写成传闻。
2. 直接取材仅限“传闻维护.世界侧可传播事实”、已有传播链与既有公开传闻。私密事实只有形成目击、公开后果、调查发现、公告或主动泄露等现实渠道后才能传播。
3. 公开内容不得超过来源与受众当时可知范围；后台真相不进入公开内容。传播必须有时间与空间路径，不能无因瞬间扩散到全世界。
4. 公开传闻默认保持不变；仅在空分类、传播链需复核或出现新的世界侧公开事实时按需更新，每个触发每类最多1条。
5. 普通行动、普通战斗、轻微状态或数值变化本身不触发传闻；只有其公开后果已经进入世界侧事实池时才可传播。
6. 传闻/传播属于软维护，单个片段失败不得让整轮世界推进重跑。情报交易的购买、付款与消费性删除由MVU按正文结果处理；世界引擎只维护世界侧信息来源。`;
    const RUMOR_WORLD_SOURCE_PRESET_STEP='Step 6 · 信息传播：以世界侧公开事实和已有传播链为来源；正文不是直接传播源。私密事实必须先形成现实传播渠道，传播范围按时间与空间路径扩张。';
    function rumorWorldSameTime(value,current){
        const a=String(value||'').trim(),b=String(current||'').trim();
        return !!a&&!!b&&(typeof sameWorldTimeAnchor==='function'?sameWorldTimeAnchor(a,b):a===b);
    }
    function worldPublicRumorFacts(stat){
        const backend=stat?.世界?.[PATH]||{},now=String(stat?.世界?.时间||'').trim(),facts=[];
        const add=item=>{if(plain(item)&&String(item.公开内容||'').trim())facts.push(item);};
        for(const [名称,event] of Object.entries(backend.事件||{})){
            if(!plain(event)||!['进行中','已完成'].includes(String(event.状态||'')))continue;
            const visible=[String(event.公开征兆||'').trim(),...(Array.isArray(event.可见影响)?event.可见影响.map(x=>String(x?.影响||'').trim()):[])].filter(Boolean);
            if(!visible.length)continue;
            const time=String(event.更新时间||event.时间||'').trim();
            add({类型:'公开事件',名称,地点:String(event.地点||''),时间:time,公开内容:visible.join('；'),关联事件:[名称],新近:rumorWorldSameTime(time,now)});
        }
        for(const [名称,person] of Object.entries(backend.人物||{})){
            const text=String(person?.公开动态||'').trim();if(!text)continue;
            const time=String(person?.更新时间||'').trim();
            add({类型:'人物公开动态',名称,时间:time,公开内容:text,关联事件:copy(Array.isArray(person?.关联事件)?person.关联事件:[]),新近:rumorWorldSameTime(time,now)});
        }
        for(const [名称,area] of Object.entries(backend.势力地区||{})){
            const text=String(area?.公开动态||'').trim();if(!text)continue;
            const time=String(area?.更新时间||'').trim();
            add({类型:'地区公开动态',名称,时间:time,公开内容:text,新近:rumorWorldSameTime(time,now)});
        }
        for(const [名称,faction] of Object.entries(stat?.世界?.势力||{})){
            const text=[faction?.领地,faction?.描述].map(x=>String(x||'').trim()).filter(Boolean).join('；');
            add({类型:'势力公开背景',名称,公开内容:text,新近:false});
        }
        for(const [名称,place] of Object.entries(stat?.世界?.探索||{}))add({类型:'探索公开背景',名称,风险:String(place?.风险||''),公开内容:String(place?.描述||''),新近:false});
        const economy=String(stat?.世界?.货币?.经济波动||'').trim();
        if(economy)add({类型:'经济公开背景',名称:'经济波动',公开内容:economy,新近:false});
        return facts.slice(-24);
    }

    const rumorMaintenanceRequirementsBeforeWorldSource=rumorMaintenanceRequirements;
    rumorMaintenanceRequirements=function(stat){
        const required=rumorMaintenanceRequirementsBeforeWorldSource(stat),facts=worldPublicRumorFacts(stat),fresh=facts.filter(item=>item.新近).slice(-6);
        const empty=RUMOR_PUBLIC_CATEGORIES.filter(category=>Number(required?.公开传闻?.[category]?.当前数量||0)===0),review=required?.本轮必须复核的传播链||[],reasons=[];
        if(empty.length)reasons.push('空分类：'+empty.join('、'));
        if(review.length)reasons.push('传播复核：'+review.map(item=>item.名称).join('、'));
        if(fresh.length)reasons.push('新世界公开事实：'+fresh.map(item=>item.名称).join('、'));
        required.世界侧可传播事实=facts;required.本轮新公开事实=fresh;required.刷新原因=reasons;required.本轮公开传闻动作=reasons.length?'按需更新；每个触发每类最多1条':'保持不变';
        delete required.当前地点;
        return required;
    };
    const SamsaraWorldEngineBeforeRumorWorldSource=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeRumorWorldSource{
        async buildRequest(base){
            const request=await super.buildRequest(base);
            const maintenance=rumorMaintenanceRequirements(base?.stat||{});
            const payload=JSON.parse(request.input);
            payload.传闻维护=Object.assign({},payload.传闻维护||{}, {
                取材边界:'只使用世界侧可传播事实、已有传播链与既有公开传闻；正文不是直接传播源',
                本轮公开传闻动作:maintenance.本轮公开传闻动作,
                刷新原因:copy(maintenance.刷新原因||[]),
                世界侧可传播事实:copy(maintenance.世界侧可传播事实||[]),
                本轮新公开事实:copy(maintenance.本轮新公开事实||[])
            });
            delete payload.传闻维护.当前地点;
            delete payload.传闻维护.可传播候选事件;
            request.input=JSON.stringify(payload,null,2);
            request.rumorMaintenance=copy(maintenance);
            request.manifest=request.manifest||{};
            request.manifest.传闻节流={模式:'世界侧事实驱动',本轮动作:maintenance.本轮公开传闻动作,刷新原因:copy(maintenance.刷新原因||[]),正文直接取材:false,软失败不重试:true};
            return request;
        }
    };
    const SamsaraWorldEngineBeforeRumorWorldSystem=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeRumorWorldSystem{
        async buildRequest(base){
            const request=await super.buildRequest(base);
            let text=String(request.system||'');
            if(typeof RUMOR_LIVELINESS_RULES==='string')text=text.replace(RUMOR_LIVELINESS_RULES,'');
            if(typeof RUMOR_THROTTLE_RULES==='string')text=text.replace(RUMOR_THROTTLE_RULES,'');
            request.system=text.trim()+'\n\n'+RUMOR_WORLD_SOURCE_RULES;
            return request;
        }
    };
    // 提示词工作台最终层：只暴露真正发送给世界 AI 的文字模块；程序 Schema/校验仍由代码负责。
    const WORLD_MODULE_PROMPT_VERSION=4;
    const COMPACT_DEFAULT_PRESET=`你是轮回战场的世界引擎。推进正文之外仍在运行的世界，只提交已经发生或需要规划的世界变化。
【执行流程】
1. 取事实：当前变量/已确认剧情 > 明确世界书 > 模型常识。
2. 定边界：确认当前阶段、世界时间与下一宏观节点。
3. 推世界：按可用时间推进事件、地区、人物与势力；世界不会因<user>停下而暂停。
4. 结算影响：记录<user>已经造成的客观后果，但不替<user>行动。
5. 做维护：只处理本轮确有变化的传播、经济、历法；因果偏移仅在出现重大世界级长期改变时维护。
6. 输出差分：只写新增/变化的 WorldResult；无业务变化只写摘要。`;
    const COMPACT_CORE_WORLD_RULES=`【核心边界】
- 事实优先级：当前变量/已确认剧情 > 明确世界书 > 常识；计划不是事实。
- 模型知道≠场外人物知道。人物只能依据在场观察、既有认知或可信传播行动；因<user>新行为改策必须有认知来源。
- 时间与路程必须可实现；同一人物同一时段只在一处；不替<user>行动，不复述已演出琐事。
- 资产只记录固定地产、大型载具或要塞；单兵物品不写资产。探索只记录<user>实际到达、调查或可靠获知的区域。
- 因果偏移只记已实现的主线级长期变化；没有重大世界偏移就完全不写偏移记录。当前事件公开字段只写现实中可感知的信息。
- 任务结算、奖励、成就、击杀等由对应系统负责。`;
    const COMPACT_MACRO_PROMPT=`【宏观骨架】
需要补骨架时保持3~5个滚动阶段节点；先定顺序与时间边界，再填近期细节。未来规划可跨边界，实际推进不可越过下一节点；不要把多个独立阶段硬并成一个节点。`;
    const COMPACT_STABILITY_PROMPT_TEMPLATE=`【世界自救 · {{阶段}}】
稳定={{稳定值}}。{{规则}}
排异必须通过世界内合理因果发生；NPC仍受自身认知与传播链限制。`;

    const WORLD_PROMPT_MODULE_DEFS=Object.freeze([
        Object.freeze({key:'task',title:'任务只读',source:'TASK_AWARENESS_RULES',legacy:()=>[TASK_AWARENESS_RULES],fallback:`【任务感知 · 只读】
任务.列表只作世界因果输入；事件可用“关联任务”引用已存在任务。不得创建、删除、改状态、交付或结算任务。情报购买与扣款由MVU处理；成就、击杀、奖励、惩罚不参与世界推进。`}),
        Object.freeze({key:'chronology',title:'原著 / 数据库时间轴',source:'CHRONOLOGY_GUARD_RULES',legacy:()=>[CHRONOLOGY_GUARD_RULES],fallback:`【原著/数据库时间轴硬约束】
宏观排期：已确认事实 > 明确世界书/数据库日期 > 常识。明确日期必须沿用；只有已确认且记录的因果偏移可改期。资料只到月份/时段/顺序时保持同级精度。先定“当前时间→下一节点”边界再推进区间细节；3~5个节点只是滚动窗口，不合并独立阶段。`}),
        Object.freeze({key:'maintenance',title:'分级维护',source:'SOFT_MAINTENANCE_RULES',legacy:()=>[SOFT_MAINTENANCE_RULES],fallback:`【分级验收 · 软维护不拒绝整轮】
Schema、非法状态、因果引用、明确日期冲突是硬错误；排期补全、传闻补齐、传播复核可跨轮维护。事件有时间、条件或前因任一即可作为锚点。纠错只改被拒片段，不重写已通过内容。`}),
        Object.freeze({key:'exploration',title:'探索台账',source:'EXPLORATION_PROJECTION_RULES',legacy:()=>[EXPLORATION_PROJECTION_RULES],fallback:`【玩家探索投影硬约束】
<user>实际到达整体区域时探索度至少10%；远方后台地区不自动记入；离开后保留已有探索。`}),
        Object.freeze({key:'integrity',title:'因果与事实时间',source:'WORLD_INTEGRITY_GUARD_RULES',legacy:()=>[WORLD_INTEGRITY_GUARD_RULES],fallback:`【因果偏移与时间约束】
当前事实不得落在世界时间之后；未来计划写预计结束、下次检查或待发生事件。因果偏移不是每轮必填，只记录已实现且改变关键人物命运、重大事件结果、关键势力格局、主线可行性或异常污染规模的长期变化；本轮没有这种重大变化时，省略“因果.偏移记录”，不得为了让稳定值变化而硬造记录。位置暴露、敌人警觉、受伤、逃脱、行动/生存难度变化等局部后果不记。计划、风险、能力上限不记；同根因优先更新同一条。稳定值由程序根据有效偏移汇总，模型不得直接修改。`}),
        Object.freeze({key:'worldTime',title:'世界时间',source:'WORLD_TIME_RULES',legacy:()=>[WORLD_TIME_RULES],fallback:`【世界时间所有权】
世界.时间由世界推进维护。为空时据已确认资料初始化；没有足够时间流逝跨过当前时段就保持原值，不因每轮推进而机械跳时段。精确到月日使用 {yyy}年-{mm}月-{dd}日-{时间段}；时间段只能选：凌晨 / 黎明 / 清晨 / 早晨 / 上午 / 中午 / 午后 / 下午 / 傍晚 / 入夜 / 晚上 / 深夜。只有正文或明确资料表明确实经过合理时长才推进时段/日期；不得回退或把未来计划时间当当前时间。人物/地区更新时间由程序统一盖章。`}),
        Object.freeze({key:'rumor',title:'传闻与传播',source:'RUMOR_THROTTLE_RULES / RUMOR_WORLD_SOURCE_RULES',legacy:()=>[RUMOR_LIVELINESS_RULES,RUMOR_THROTTLE_RULES,RUMOR_WORLD_SOURCE_RULES],fallback:`【信息传播 · 世界侧事实】
传闻只来自“世界侧可传播事实”、已有传播链和既有公开传闻；正文不是直接传播源。私密事实必须先形成目击、公开后果、调查、公告或泄露。公开内容不得超过来源/受众认知，传播按时间与空间扩散。无触发保持原样；空分类、传播复核或新公开事实时按需更新，每个触发每类最多1条。普通行动/战斗本身不触发；传闻失败不重跑整轮。购买、扣款与消费性删除由MVU处理。`})
    ]);
    function worldModulePromptDefaults(){
        return Object.fromEntries(WORLD_PROMPT_MODULE_DEFS.map(item=>[item.key,item.fallback]));
    }
    function normalizeWorldModulePrompts(value){
        const source=plain(value)?value:{};
        const out={};
        for(const item of WORLD_PROMPT_MODULE_DEFS)out[item.key]=typeof source[item.key]==='string'?source[item.key]:item.fallback;
        return out;
    }
    function stripLegacyWorldModulePrompts(system){
        let text=String(system||'');
        for(const item of WORLD_PROMPT_MODULE_DEFS){
            for(const legacy of item.legacy()){
                const block=String(legacy||'');
                if(block)text=text.split(block).join('');
            }
        }
        return text.replace(/\n{3,}/g,'\n\n').trim();
    }
    function appendConfiguredWorldModulePrompts(system,modulePrompts){
        let text=stripLegacyWorldModulePrompts(system);
        const prompts=normalizeWorldModulePrompts(modulePrompts),used=[];
        for(const item of WORLD_PROMPT_MODULE_DEFS){
            const block=String(prompts[item.key]||'').trim();
            if(!block)continue;
            text+=(text?'\n\n':'')+block;
            used.push({key:item.key,title:item.title,source:item.source,估算Tokens:estimateTokens(block)});
        }
        return {system:text,used};
    }

    // 内置默认直接展示精简版；旧用户只在仍使用内置默认时迁移一次，自定义文档不强制覆盖。
    if(plain(BUILTIN_DEFAULT_PROMPT_DOCUMENT?.settings)){
        BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.preset=normalizeEditablePreset(COMPACT_DEFAULT_PRESET);
        BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.corePrompt=COMPACT_CORE_WORLD_RULES;
        BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.macroPrompt=COMPACT_MACRO_PROMPT;
        BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.stabilityPromptTemplate=COMPACT_STABILITY_PROMPT_TEMPLATE;
        BUILTIN_DEFAULT_PROMPT_DOCUMENT.settings.modulePrompts=worldModulePromptDefaults();
    }

    const SamsaraWorldEngineBeforeEditableModulePrompts=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeEditableModulePrompts{
        constructor(host,env){
            super(host,env);
            let dirty=false;
            const version=Number(this.config.worldModulePromptVersion)||0;
            if(version<WORLD_MODULE_PROMPT_VERSION){
                if(this.config.activePromptDocumentId===BUILTIN_DEFAULT_PROMPT_DOCUMENT.id){
                    this.config.preset=normalizeEditablePreset(COMPACT_DEFAULT_PRESET);
                    this.config.corePrompt=COMPACT_CORE_WORLD_RULES;
                    this.config.macroPrompt=COMPACT_MACRO_PROMPT;
                    this.config.stabilityPromptTemplate=COMPACT_STABILITY_PROMPT_TEMPLATE;
                    this.config.modulePrompts=worldModulePromptDefaults();
                }else this.config.modulePrompts=normalizeWorldModulePrompts(this.config.modulePrompts);
                this.config.worldModulePromptVersion=WORLD_MODULE_PROMPT_VERSION;
                dirty=true;
            }else{
                const normalized=normalizeWorldModulePrompts(this.config.modulePrompts);
                if(!same(normalized,this.config.modulePrompts)){this.config.modulePrompts=normalized;dirty=true;}
            }
            if(dirty)this.saveConfig();
        }
        readPromptEditor(){
            const settings=super.readPromptEditor();
            const prompts=normalizeWorldModulePrompts(this.config.modulePrompts);
            for(const item of WORLD_PROMPT_MODULE_DEFS){
                const field=this.panel?.querySelector?.('[data-module-prompt="'+item.key+'"]');
                if(field)prompts[item.key]=String(field.value??'');
            }
            settings.modulePrompts=prompts;
            return settings;
        }
        applyPromptSettings(settings){
            const next=Object.assign({},settings||{});
            if(next.corePrompt===undefined)next.corePrompt=COMPACT_CORE_WORLD_RULES;
            if(next.macroPrompt===undefined)next.macroPrompt=COMPACT_MACRO_PROMPT;
            if(next.stabilityPromptTemplate===undefined)next.stabilityPromptTemplate=COMPACT_STABILITY_PROMPT_TEMPLATE;
            const modules=normalizeWorldModulePrompts(next.modulePrompts);
            const result=super.applyPromptSettings(next);
            this.config.modulePrompts=modules;
            this.config.worldModulePromptVersion=WORLD_MODULE_PROMPT_VERSION;
            this.saveConfig();
            return result;
        }
        savePromptDocument(name,settings,activate=true){
            const next=Object.assign({},settings||{});
            next.modulePrompts=normalizeWorldModulePrompts(next.modulePrompts??this.config.modulePrompts);
            return super.savePromptDocument(name,next,activate);
        }
        importPromptDocument(raw){
            let parsed=null;try{parsed=JSON.parse(String(raw||''));}catch(_){}
            const settings=plain(parsed?.settings)?parsed.settings:parsed;
            const importedModules=plain(settings?.modulePrompts)?normalizeWorldModulePrompts(settings.modulePrompts):worldModulePromptDefaults();
            const doc=super.importPromptDocument(raw);
            if(doc?.settings){doc.settings.modulePrompts=importedModules;this.saveConfig();}
            return doc;
        }
        async buildRequest(base){
            const request=await super.buildRequest(base);
            const rebuilt=appendConfiguredWorldModulePrompts(request.system,this.config.modulePrompts);
            request.system=rebuilt.system;
            request.manifest=request.manifest||{};
            request.manifest.提示词模块=rebuilt.used;
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema||WORLD_RESULT_SCHEMA);
            return request;
        }
        mountEditableModulePrompts(){
            if(this.tab!=='提示词预设'||!this.panel)return;
            const main=this.panel.querySelector('main');if(!main)return;
            const audit=main.querySelector('[data-npc-audit-prompt]');
            if(!this.isNpcBuildAuditEnabled())audit?.closest('details')?.remove();
            let section=main.querySelector('[data-world-module-prompts]');
            if(!section){
                section=this.host.document.createElement('section');
                section.className='we-section';section.dataset.worldModulePrompts='';
                const systemSection=[...main.querySelectorAll('.we-section')].find(item=>item.querySelector('.we-section-head h2')?.textContent?.trim()==='系统提示词');
                if(systemSection)systemSection.insertAdjacentElement('afterend',section);else main.appendChild(section);
            }
            const prompts=normalizeWorldModulePrompts(this.config.modulePrompts),editable=!!this.promptEditing;
            const rows=WORLD_PROMPT_MODULE_DEFS.map(item=>{
                const value=prompts[item.key]||'';
                return '<details class="we-segment"><summary>'+escape(item.title)+' · <small>'+escape(item.source)+' · '+formatTokenCount(estimateTokens(value),true)+'</small></summary>'+
                    '<textarea data-module-prompt="'+escape(item.key)+'" '+(editable?'':'readonly')+'>'+escape(value)+'</textarea></details>';
            }).join('');
            section.innerHTML='<div class="we-section-head"><h2>运行模块提示词</h2><small>实际 system 注入 · 可编辑</small></div>'+
                '<div class="we-notice">这里只显示最终会发给世界 AI 的模块规则。旧传闻活跃/节流/世界侧三层已在发送前合并为一个“传闻与传播”模块；留空某块即可停止额外注入该文字规则。程序 Schema 与写入校验不受这里修改。</div>'+rows;
        }
        createPanel(){
            super.createPanel();
            if(!this.panel||this.panel.__worldModulePromptEditBound)return;
            Object.defineProperty(this.panel,'__worldModulePromptEditBound',{value:true,configurable:true});
            this.panel.addEventListener('click',event=>{
                const button=event.target?.closest?.('[data-action="prompt-edit"]');
                if(!button||!this.panel.contains(button))return;
                const editable=button.getAttribute('aria-pressed')==='true';
                this.panel.querySelectorAll('[data-core-prompt],[data-macro-prompt],[data-stability-prompt],[data-module-prompt]').forEach(field=>field.readOnly=!editable);
            });
        }
        render(force=false){
            const result=super.render(force);
            this.mountEditableModulePrompts();
            return result;
        }
    };
    // 主面板只保留最新因果摘要；完整偏移、故事线、干涉模式、法则与经济资料进入独立“因果档案”页。
    // 资产与传闻仍由世界引擎维护数据，但玩家侧由状态栏承载，因此不在世界推进面板重复展示。
    const CAUSAL_OVERVIEW_LIMIT=3;
    const WORLD_ENGINE_HIDDEN_PLAYER_TABS=new Set(['资产','传闻']);
    function isWorldEnginePlayerTabHidden(tab) {
        return WORLD_ENGINE_HIDDEN_PLAYER_TABS.has(String(tab||''));
    }
    function causalOffsetEntries(stat) {
        const bucket=stat?.世界?.因果轨道?.偏移记录;
        return Object.entries(plain(bucket)?bucket:{}).slice().reverse();
    }
    function latestCausalOffsets(stat,limit=CAUSAL_OVERVIEW_LIMIT) {
        return causalOffsetEntries(stat).slice(0,Math.max(0,Number(limit)||0));
    }
    function causalImpactLabel(value) {
        const n=Number(value);
        return Number.isFinite(n)?(n>0?'+':'')+n:'影响未记录';
    }
    function causalOverviewEscape(value) {
        return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function causalInterferenceMode(stat) {
        return String(stat?.世界?.异端雷达?.当前模式||'').trim();
    }
    function causalCompactHtml(stat) {
        const world=stat?.世界||{},offsets=causalOffsetEntries(stat),latest=offsets.slice(0,CAUSAL_OVERVIEW_LIMIT);
        const stable=world.稳定!==null&&world.稳定!==''&&Number.isFinite(Number(world.稳定))?Number(world.稳定):null;
        const rows=latest.map(([name,record])=>'<button class="we-causal-jump" data-tab="因果档案"><span><b>'+causalOverviewEscape(name)+'</b><small>'+causalOverviewEscape(record?.引发者||'引发者未记录')+'</small></span><strong>'+causalOverviewEscape(causalImpactLabel(record?.影响程度))+'</strong><p>'+causalOverviewEscape(record?.描述||'暂无偏移描述')+'</p></button>').join('');
        return '<div class="we-causal-summary"><button class="we-stability-compact" data-tab="因果档案"><span><small>世界稳定值</small><strong>'+causalOverviewEscape(stable===null?'未记录':stable)+'</strong></span><em>查看因果档案 →</em></button>'
            +(rows?'<div class="we-causal-latest">'+rows+'</div>':'<div class="we-empty"><b>暂无因果偏移</b><small>重大且已确认的因果改变会记录在这里。</small></div>')
            +'<button class="we-link-btn" data-tab="因果档案">查看全部 '+offsets.length+' 条偏移、故事线与世界法则 →</button></div>';
    }
    function causalArchiveHtml(stat) {
        const world=stat?.世界||{},orbit=world.因果轨道||{},offsets=causalOffsetEntries(stat),stable=world.稳定!==null&&world.稳定!==''&&Number.isFinite(Number(world.稳定))?Number(world.稳定):null;
        const offsetCard=([name,record])=>'<article class="we-offset"><div class="we-offset-head"><b>'+causalOverviewEscape(name)+'</b><span>'+causalOverviewEscape(causalImpactLabel(record?.影响程度))+'</span></div><p>'+causalOverviewEscape(record?.描述||'暂无偏移描述')+'</p><small>引发者 · '+causalOverviewEscape(record?.引发者||'未记录')+'</small></article>';
        const recent=offsets.slice(0,12),older=offsets.slice(12);
        const laws=Array.isArray(world.法则)?world.法则:(world.法则?[world.法则]:[]);
        const money=world.货币||{};
        const interference=causalInterferenceMode(stat);
        const story='<article class="we-card we-causal-track"><dl><dt>当前阶段</dt><dd>'+causalOverviewEscape(orbit.当前阶段||'待初始化')+'</dd><dt>故事线</dt><dd>'+causalOverviewEscape(orbit.故事线||'未记录')+'</dd><dt>下一节点</dt><dd>'+causalOverviewEscape(orbit.下一节点||'未记录')+'</dd></dl></article>';
        const stability='<div class="we-causal"><div class="we-stability"><div><small>世界稳定值</small><strong data-world-stability>'+causalOverviewEscape(stable===null?'未记录':stable)+'</strong></div><span>完整偏移保留为因果记忆；主面板仅显示最新 '+CAUSAL_OVERVIEW_LIMIT+' 条</span></div>'
            +(stable===null?'':'<meter min="0" max="120" value="'+Math.max(0,Math.min(120,stable))+'" aria-label="世界稳定值">'+stable+'</meter>')
            +'</div>';
        const offsetList=recent.length?recent.map(offsetCard).join(''):'<div class="we-empty"><b>暂无因果偏移</b><small>只有已发生的重大不可逆结果才会建立记录。</small></div>';
        const olderHtml=older.length?'<details class="we-offset-more"><summary>查看更早 '+older.length+' 条偏移</summary>'+older.map(offsetCard).join('')+'</details>':'';
        const interferenceHtml=interference?'<section class="we-section we-causal-interference"><div class="we-section-head"><h2>干涉模式</h2><small>副本干涉态势</small></div><article class="we-card"><p>'+causalOverviewEscape(interference)+'</p></article></section>':'';
        const moneyHtml='<article class="we-card"><dl><dt>货币体系</dt><dd>'+causalOverviewEscape(money.体系||'未记录')+'</dd><dt>购买力基准</dt><dd>'+causalOverviewEscape(money.购买力基准||'未记录')+'</dd><dt>经济波动</dt><dd>'+causalOverviewEscape(money.经济波动||'未记录')+'</dd></dl></article>';
        const lawHtml=laws.length?'<div class="we-reading we-world-laws">'+laws.map(item=>'<article><p>'+causalOverviewEscape(item)+'</p></article>').join('')+'</div>':'<div class="we-empty"><b>尚无世界法则</b><small>明确生效的法则会在这里维护。</small></div>';
        return '<div class="we-causal-archive-grid"><div><section class="we-section"><div class="we-section-head"><h2>因果偏移档案</h2><small>'+offsets.length+' 条 · 最新在前</small></div>'+stability+offsetList+olderHtml+'</section></div><aside><section class="we-section"><div class="we-section-head"><h2>因果轨道</h2><small>长期方向</small></div>'+story+'</section>'+interferenceHtml+'<section class="we-section"><div class="we-section-head"><h2>货币与经济</h2><small>世界推进维护</small></div>'+moneyHtml+'</section><section class="we-section"><div class="we-section-head"><h2>世界法则</h2><small>'+laws.length+' 条</small></div>'+lawHtml+'</section></aside></div>';
    }
    function causalSectionByTitle(root,title) {
        return Array.from(root?.querySelectorAll?.('.we-section')||[]).find(section=>section.querySelector('.we-section-head h2')?.textContent?.trim()===title)||null;
    }

    const SamsaraWorldEngineBeforeCausalOverview=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeCausalOverview {
        ensureCausalOverviewStyles() {
            if(!this.style||this.style.textContent.includes('.we-causal-summary{'))return;
            this.style.textContent+='\n#sam-world-engine .we-causal-summary{display:grid;gap:9px}#sam-world-engine .we-stability-compact,#sam-world-engine .we-causal-jump{width:100%;border:1px solid var(--we-line,var(--line));border-radius:10px;background:var(--we-card,#18222f);color:var(--we-ink,var(--ink));text-align:left}#sam-world-engine .we-stability-compact{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px}#sam-world-engine .we-stability-compact span{display:flex;align-items:baseline;gap:9px}#sam-world-engine .we-stability-compact small{color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-stability-compact strong{font-size:22px}#sam-world-engine .we-stability-compact em{font-style:normal;color:var(--we-gold,var(--gold));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-causal-latest{display:grid;gap:6px}#sam-world-engine .we-causal-jump{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 9px;padding:9px 10px}#sam-world-engine .we-causal-jump:hover,#sam-world-engine .we-stability-compact:hover{background:var(--we-card-hover,#1d2a39)}#sam-world-engine .we-causal-jump span{min-width:0}#sam-world-engine .we-causal-jump b,#sam-world-engine .we-causal-jump small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#sam-world-engine .we-causal-jump small{margin-top:1px;color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-causal-jump strong{color:var(--we-gold,var(--gold));font-size:12px}#sam-world-engine .we-causal-jump p{grid-column:1/-1;margin:2px 0 0!important;color:var(--we-sub,var(--sub))!important;font-size:var(--we-fs-small,12px)!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}#sam-world-engine .we-causal-archive-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,1fr);gap:23px;align-items:start;margin-top:22px}#sam-world-engine .we-causal-track dl{grid-template-columns:76px minmax(0,1fr)}@media(max-width:900px){#sam-world-engine .we-causal-archive-grid{grid-template-columns:1fr}}';
        }
        ensureCausalArchiveTab() {
            const nav=this.panel?.querySelector?.('nav');if(!nav)return;
            let button=nav.querySelector('[data-tab="因果档案"]');
            if(!button){
                button=this.host.document.createElement('button');button.dataset.tab='因果档案';button.innerHTML='<span class="we-tab-icon" aria-hidden="true">◇</span>因果档案';
                const worldButton=nav.querySelector('[data-tab="世界推进"]');
                if(worldButton)worldButton.insertAdjacentElement('afterend',button);else nav.appendChild(button);
            }
            for(const item of nav.querySelectorAll('[data-tab]'))item.setAttribute('aria-selected',String(item.dataset.tab===this.tab));
        }
        hideRedundantPlayerModules() {
            const nav=this.panel?.querySelector?.('nav');if(!nav)return;
            for(const tab of WORLD_ENGINE_HIDDEN_PLAYER_TABS)nav.querySelector('[data-tab="'+tab+'"]')?.remove();
        }
        compactWorldOverview() {
            const main=this.panel?.querySelector?.('main');if(!main)return;
            const stat=this.snapshot().stat,causal=causalSectionByTitle(main,'因果状态');
            main.querySelector('.we-kpi-grid.we-kpi-compact')?.remove();
            if(causal){
                const head=causal.querySelector('.we-section-head');
                if(head){const h=head.querySelector('h2'),small=head.querySelector('small');if(h)h.textContent='因果摘要';if(small)small.textContent='最新 '+Math.min(CAUSAL_OVERVIEW_LIMIT,causalOffsetEntries(stat).length)+' 条 · 点击进入档案';}
                Array.from(causal.children).filter(child=>child!==head).forEach(child=>child.remove());
                causal.insertAdjacentHTML('beforeend',causalCompactHtml(stat));
            }
            for(const title of ['货币与经济','世界法则'])causalSectionByTitle(main,title)?.remove();
        }
        removeRunRecordInterference() {
            const main=this.panel?.querySelector?.('main');if(!main)return;
            causalSectionByTitle(main,'干涉模式')?.remove();
        }
        renderCausalArchive() {
            const main=this.panel?.querySelector?.('main');if(!main)return;
            main.insertAdjacentHTML('beforeend',causalArchiveHtml(this.snapshot().stat));
        }
        render(force) {
            if(isWorldEnginePlayerTabHidden(this.tab))this.tab='世界推进';
            const result=super.render(force);
            if(!this.panel)return result;
            this.ensureCausalOverviewStyles();
            this.ensureCausalArchiveTab();
            this.hideRedundantPlayerModules();
            if(this.tab==='世界推进')this.compactWorldOverview();
            else if(this.tab==='因果档案')this.renderCausalArchive();
            else if(this.tab==='运行记录')this.removeRunRecordInterference();
            return result;
        }
    };
    // 因果偏移手动维护：玩家可直接修正/删除偏移；写回后立即重算稳定值并同步同楼 replay。
    function causalOffsetRecalculateStability(stat) {
        if(!plain(stat?.世界))return null;
        if(stat.设置?.世界超稳===true){stat.世界.稳定=100;return 100;}
        const bucket=stat.世界?.因果轨道?.偏移记录||{};
        const total=Object.values(plain(bucket)?bucket:{}).reduce((sum,item)=>sum+(Number(item?.影响程度)||0),0);
        const stable=Math.max(0,Math.min(120,100+total));
        stat.世界.稳定=stable;
        return stable;
    }
    function causalOffsetReplaySamePath(left,right) {
        return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>String(item)===String(right[index]));
    }
    function causalOffsetSyncReplay(raw,fingerprint,oldName,newName,record,deleted,stable) {
        const replay=raw?.__samsaraWorldReplay;
        if(!plain(replay)||String(replay.fingerprint||'')!==String(fingerprint||'')||!Array.isArray(replay.operations))return;
        const oldPath=['世界','因果轨道','偏移记录',String(oldName||'')];
        const newPath=['世界','因果轨道','偏移记录',String(newName||'')];
        const stabilityPath=['世界','稳定'];
        replay.operations=replay.operations.filter(operation=>{
            const path=operation?.path;
            return !causalOffsetReplaySamePath(path,oldPath)&&!causalOffsetReplaySamePath(path,newPath)&&!causalOffsetReplaySamePath(path,stabilityPath);
        });
        if(deleted){
            replay.operations.push({op:'remove',path:oldPath});
        }else{
            if(String(oldName)!==String(newName))replay.operations.push({op:'remove',path:oldPath});
            replay.operations.push({op:'set',path:newPath,value:copy(record)});
        }
        replay.operations.push({op:'set',path:stabilityPath,value:stable});
    }

    const SamsaraWorldEngineBeforeCausalOffsetEditor=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeCausalOffsetEditor {
        async persistCausalOffsetMutation(mutator,status) {
            const snapshot=this.snapshot(),next=copy(snapshot.raw),stat=next.stat_data;
            if(!plain(stat?.世界?.因果轨道))stat.世界.因果轨道={};
            if(!plain(stat.世界.因果轨道.偏移记录))stat.世界.因果轨道.偏移记录={};
            const outcome=mutator(stat.世界.因果轨道.偏移记录);
            if(!outcome)return false;
            const stable=causalOffsetRecalculateStability(stat);
            causalOffsetSyncReplay(next,snapshot.fingerprint,outcome.oldName,outcome.newName,outcome.record,outcome.deleted,stable);
            const target=this.host,had=!!target&&Object.prototype.hasOwnProperty.call(target,'__samsaraUIMutation'),previous=target?.__samsaraUIMutation;
            if(target)target.__samsaraUIMutation=true;
            try{
                await snapshot.mvu.replaceMvuData(next,{type:'message',message_id:snapshot.id});
            }finally{
                if(target){
                    if(had)target.__samsaraUIMutation=previous;
                    else delete target.__samsaraUIMutation;
                }
            }
            this.status=status||'因果偏移已更新';
            this.render(true);
            return true;
        }
        async setCausalOffsetRecord(oldName,newName,record) {
            oldName=String(oldName||'').trim();newName=String(newName||'').trim();
            if(!oldName||!newName||!plain(record))throw new Error('偏移名称和记录不能为空');
            const impact=Number(record.影响程度);
            if(!Number.isFinite(impact)||impact===0||impact<-12||impact>15)throw new Error('影响程度必须为 -12~-1 或 +1~+15');
            return this.persistCausalOffsetMutation(bucket=>{
                if(!Object.hasOwn(bucket,oldName))throw new Error('偏移记录不存在：'+oldName);
                if(newName!==oldName&&Object.hasOwn(bucket,newName))throw new Error('偏移名称已存在：'+newName);
                const next={描述:String(record.描述||'').trim(),引发者:String(record.引发者||'').trim(),影响程度:impact};
                if(newName!==oldName)delete bucket[oldName];
                bucket[newName]=next;
                return {oldName,newName,record:next,deleted:false};
            },'已编辑因果偏移 · 稳定值已重算');
        }
        async removeCausalOffsetRecord(name) {
            name=String(name||'').trim();if(!name)return false;
            return this.persistCausalOffsetMutation(bucket=>{
                if(!Object.hasOwn(bucket,name))return null;
                delete bucket[name];
                return {oldName:name,newName:name,record:null,deleted:true};
            },'已删除因果偏移 · 稳定值已重算');
        }
        causalOffsetRecord(name) {
            return this.snapshot().stat?.世界?.因果轨道?.偏移记录?.[name]||null;
        }
        causalOffsetInlineEditorHtml(name,record) {
            const impact=Number(record?.影响程度);
            return '<div class="we-offset-inline-editor" data-offset-editor data-offset-original-name="'+causalOverviewEscape(name)+'">'
                +'<div class="we-offset-edit-grid">'
                +'<label class="we-offset-edit-field"><span>偏移名称</span><input type="text" data-offset-field="name" value="'+causalOverviewEscape(name)+'"></label>'
                +'<label class="we-offset-edit-field"><span>影响程度</span><input type="number" min="-12" max="15" step="1" data-offset-field="impact" value="'+causalOverviewEscape(Number.isFinite(impact)?impact:'')+'"><small>-12~-1 或 +1~+15</small></label>'
                +'<label class="we-offset-edit-field we-offset-edit-wide"><span>偏移描述</span><textarea rows="4" data-offset-field="description" placeholder="只写已经实现的世界级长期改变">'+causalOverviewEscape(record?.描述||'')+'</textarea></label>'
                +'<label class="we-offset-edit-field we-offset-edit-wide"><span>引发者</span><input type="text" data-offset-field="actor" value="'+causalOverviewEscape(record?.引发者||'')+'"></label>'
                +'</div><div class="we-offset-actions we-offset-edit-actions">'
                +'<button type="button" class="we-offset-save" data-action="causal-offset-save" data-offset-name="'+causalOverviewEscape(name)+'">保存</button>'
                +'<button type="button" data-action="causal-offset-cancel">取消</button>'
                +'</div></div>';
        }
        beginCausalOffsetInlineEdit(name,card) {
            const record=this.causalOffsetRecord(name);if(!plain(record)||!card)return false;
            card.innerHTML=this.causalOffsetInlineEditorHtml(name,record);
            card.classList.add('we-offset-editing');
            const first=card.querySelector('[data-offset-field="name"]');
            try{first?.focus?.();first?.select?.();}catch(_){}
            return true;
        }
        async saveCausalOffsetInlineEdit(card,oldName) {
            if(!card)return false;
            const value=key=>card.querySelector('[data-offset-field="'+key+'"]')?.value;
            return this.setCausalOffsetRecord(oldName,String(value('name')||'').trim(),{
                描述:String(value('description')||'').trim(),
                引发者:String(value('actor')||'').trim(),
                影响程度:Number(value('impact'))
            });
        }
        armCausalOffsetDelete(button,name) {
            if(!button)return false;
            const actions=button.closest('.we-offset-actions');if(!actions)return false;
            button.dataset.action='causal-offset-delete-confirm';
            button.textContent='确认删除';
            button.classList.add('we-offset-delete-confirm');
            if(!actions.querySelector('[data-action="causal-offset-delete-cancel"]')){
                const cancel=this.host.document.createElement('button');
                cancel.type='button';cancel.dataset.action='causal-offset-delete-cancel';cancel.textContent='取消';
                cancel.dataset.offsetName=String(name||'');
                actions.appendChild(cancel);
            }
            return true;
        }
        cancelCausalOffsetDelete(button) {
            const actions=button?.closest?.('.we-offset-actions');if(!actions)return false;
            const confirm=actions.querySelector('[data-action="causal-offset-delete-confirm"]');
            if(confirm){confirm.dataset.action='causal-offset-delete';confirm.textContent='删除';confirm.classList.remove('we-offset-delete-confirm');}
            actions.querySelector('[data-action="causal-offset-delete-cancel"]')?.remove();
            return true;
        }
        ensureCausalOffsetEditorStyles() {
            if(!this.style||this.style.textContent.includes('.we-offset-actions{'))return;
            this.style.textContent+='\n#sam-world-engine .we-offset-actions{display:flex;gap:7px;justify-content:flex-end;margin-top:9px;flex-wrap:wrap}#sam-world-engine .we-offset-actions button{border:1px solid var(--we-line,var(--line));border-radius:7px;background:transparent;color:var(--we-sub,var(--sub));padding:5px 10px;font-size:var(--we-fs-tiny,11px);cursor:pointer}#sam-world-engine .we-offset-actions button:hover{color:var(--we-ink,var(--ink));background:var(--we-card-hover,#1d2a39)}#sam-world-engine .we-offset-actions [data-action="causal-offset-delete"]:hover,#sam-world-engine .we-offset-delete-confirm{color:#ff8c8c!important;border-color:#b85c5c!important}#sam-world-engine .we-offset-save{color:var(--we-accent,var(--gold))!important;border-color:color-mix(in srgb,var(--we-accent,var(--gold)) 45%,transparent)!important}#sam-world-engine .we-offset-editing{overflow:visible}#sam-world-engine .we-offset-inline-editor{display:grid;gap:8px}#sam-world-engine .we-offset-edit-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(140px,.6fr);gap:8px 12px;align-items:start}#sam-world-engine .we-offset-edit-field{display:grid;gap:4px;align-content:start}#sam-world-engine .we-offset-edit-field>span{color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-offset-edit-field>small{color:var(--we-sub,var(--sub));font-size:10px}#sam-world-engine .we-offset-edit-field input,#sam-world-engine .we-offset-edit-field textarea{width:100%;border:1px solid var(--we-line,var(--line));border-radius:7px;background:var(--we-surface,#111923);color:var(--we-ink,var(--ink));padding:7px 9px}#sam-world-engine .we-offset-edit-field textarea{height:92px!important;min-height:80px!important;max-height:180px!important;resize:vertical;line-height:1.55}#sam-world-engine .we-offset-edit-field input:focus,#sam-world-engine .we-offset-edit-field textarea:focus{outline:1px solid var(--we-accent,var(--gold));border-color:var(--we-accent,var(--gold))}#sam-world-engine .we-offset-edit-wide{grid-column:1/-1}#sam-world-engine .we-offset-edit-actions{margin-top:2px}@media(max-width:680px){#sam-world-engine .we-offset-edit-grid{grid-template-columns:1fr}}';
        }
        mountCausalOffsetEditorControls() {
            if(this.tab!=='因果档案'||!this.panel)return;
            const cards=Array.from(this.panel.querySelectorAll('.we-offset'));
            const entries=causalOffsetEntries(this.snapshot().stat);
            cards.forEach((card,index)=>{
                const name=entries[index]?.[0];if(!name||card.querySelector('.we-offset-actions'))return;
                card.dataset.offsetName=name;
                const actions=this.host.document.createElement('div');actions.className='we-offset-actions';
                actions.innerHTML='<button type="button" data-action="causal-offset-edit" data-offset-name="'+causalOverviewEscape(name)+'">编辑</button><button type="button" data-action="causal-offset-delete" data-offset-name="'+causalOverviewEscape(name)+'">删除</button>';
                card.appendChild(actions);
            });
        }
        createPanel() {
            super.createPanel();
            if(!this.panel||this.panel.__causalOffsetEditorBound)return;
            Object.defineProperty(this.panel,'__causalOffsetEditorBound',{value:true,configurable:true});
            this.panel.addEventListener('click',event=>{
                const button=event.target?.closest?.('[data-action^="causal-offset-"]');
                if(!button||!this.panel.contains(button))return;
                const action=String(button.dataset.action||'');
                if(!['causal-offset-edit','causal-offset-save','causal-offset-cancel','causal-offset-delete','causal-offset-delete-confirm','causal-offset-delete-cancel'].includes(action))return;
                event.preventDefault();event.stopPropagation();
                const card=button.closest('.we-offset');
                const name=String(button.dataset.offsetName||card?.dataset?.offsetName||card?.querySelector?.('[data-offset-editor]')?.dataset?.offsetOriginalName||'');
                let task=null;
                if(action==='causal-offset-edit')this.beginCausalOffsetInlineEdit(name,card);
                else if(action==='causal-offset-save')task=this.saveCausalOffsetInlineEdit(card,name);
                else if(action==='causal-offset-cancel')this.render(true);
                else if(action==='causal-offset-delete')this.armCausalOffsetDelete(button,name);
                else if(action==='causal-offset-delete-confirm')task=this.removeCausalOffsetRecord(name);
                else if(action==='causal-offset-delete-cancel')this.cancelCausalOffsetDelete(button);
                if(task)Promise.resolve(task).catch(error=>{
                    const message=String(error?.message||error||'因果偏移操作失败');
                    const toast=this.host?.toastr||this.env?.toastr;
                    if(toast?.error)toast.error(message,'因果偏移');else try{console.error('[因果偏移]',error);}catch(_){}
                });
            });
        }
        render(force) {
            const result=super.render(force);
            this.ensureCausalOffsetEditorStyles();
            this.mountCausalOffsetEditorControls();
            return result;
        }
    };
    // 专属 API 预设选择态：选择预设后即使面板重渲染，也必须保持选中并允许删除。
    const SamsaraWorldEngineBeforeApiPresetSelection=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeApiPresetSelection {
        constructor(host,env){
            super(host,env);
            this.dedicatedApiPresetSelection='';
        }
        applyDedicatedApiPreset(name){
            const selected=String(name||'').trim();
            const result=super.applyDedicatedApiPreset(selected);
            this.dedicatedApiPresetSelection=selected;
            return result;
        }
        saveDedicatedApiPreset(name){
            const entry=super.saveDedicatedApiPreset(name);
            this.dedicatedApiPresetSelection=String(entry?.name||'');
            return entry;
        }
        deleteDedicatedApiPreset(name){
            const selected=String(name||'').trim();
            const deleted=super.deleteDedicatedApiPreset(selected);
            if(deleted&&this.dedicatedApiPresetSelection===selected)this.dedicatedApiPresetSelection='';
            return deleted;
        }
        syncDedicatedApiPresetSelection(){
            if(this.tab!=='设置'||!this.panel)return;
            const select=this.panel.querySelector?.('[data-dedicated-preset]');
            const remove=this.panel.querySelector?.('[data-action="dedicated-preset-delete"]');
            if(!select)return;
            const wanted=String(this.dedicatedApiPresetSelection||'');
            const options=Array.from(select.options||[]);
            if(wanted&&options.some(option=>String(option.value)===wanted))select.value=wanted;
            else{
                select.value='';
                if(wanted)this.dedicatedApiPresetSelection='';
            }
            if(remove)remove.disabled=!String(select.value||'');
        }
        createPanel(){
            super.createPanel();
            if(!this.panel||this.panel.__dedicatedApiPresetSelectionBound)return;
            Object.defineProperty(this.panel,'__dedicatedApiPresetSelectionBound',{value:true,configurable:true});
            this.panel.addEventListener('change',event=>{
                const select=event.target?.closest?.('[data-dedicated-preset]');
                if(!select||!this.panel.contains(select))return;
                this.dedicatedApiPresetSelection=String(select.value||'');
                const remove=this.panel.querySelector?.('[data-action="dedicated-preset-delete"]');
                if(remove)remove.disabled=!this.dedicatedApiPresetSelection;
            },true);
        }
        render(force){
            const result=super.render(force);
            this.syncDedicatedApiPresetSelection();
            return result;
        }
    };
    // 世界长期历史记忆：按“每次推进一条 L0 叶子 → 旧叶子逐层压缩”的摘要森林工作。
    // 事件冷归档仍保留在后台.历史，但不作为近期/长期记忆树的 L0 来源；L0 只来自每次成功世界推进的 WorldResult.摘要。
    // 同一正文楼层重推会覆盖该楼叶子，并递归失效依赖旧叶子的上层总结，等价于摘要系统的 regenerate/edit 重摘。
    // L0 达到 18 条时压最旧 12 条并保留最近 6 条原始细节；L1 每 6 条压一层；L2+ 每 3 条继续向上。
    const HISTORY_MEMORY_L0_BATCH=12;
    const HISTORY_MEMORY_L0_KEEP=6;
    const HISTORY_MEMORY_L1_BATCH=6;
    const HISTORY_MEMORY_HIGHER_BATCH=3;
    const HISTORY_MEMORY_LEGACY_RAW_CONTEXT=24;
    const HISTORY_MEMORY_LEAF_PREFIX='推进·';
    const HISTORY_MEMORY_SCHEMA={
        type:'object',additionalProperties:false,required:['摘要'],
        properties:{摘要:{type:'string',minLength:1}}
    };
    const HISTORY_MEMORY_SYSTEM=`【世界长期历史压缩】
只总结已确认历史事实。你收到的是按真实先后顺序排列的既有历史节点；任务是把它们融合成一条更高层的世界史记忆，不是续写剧情。
必须保留：时间顺序、主要参与者、原因、关键转折、最终结果，以及仍会影响后续局势的长期后果与重要因果偏移。
可以删除：重复描述、已经失去后续意义的过程细节、UI/调试信息。
禁止：补写未发生剧情、猜测隐藏真相、修改既有结局、制造输入中不存在的日期/人物/关系、把历史事实写成未来计划。
如果输入时间粒度不完整，就保持原有粒度，不自行补全。
只输出 JSON：{"摘要":"..."}`;

    function historyMemoryLeafKey(messageId) {
        return HISTORY_MEMORY_LEAF_PREFIX+String(messageId);
    }
    function historyMemoryLeafEntries(backend) {
        return Object.entries(backend?.历史||{}).filter(([name,item])=>
            String(name||'').startsWith(HISTORY_MEMORY_LEAF_PREFIX)&&plain(item)&&String(item.事实||'').trim()
        );
    }
    function historyMemoryLeafOrder(name,fallback=0) {
        const raw=String(name||'').slice(HISTORY_MEMORY_LEAF_PREFIX.length),n=Number(raw);
        return Number.isFinite(n)&&n>=0?n:fallback;
    }
    function historyMemoryCollectedIds(backend) {
        const collected=new Set();
        for(const item of Object.values(backend?.历史总结||{})){
            if(!plain(item)||!Array.isArray(item.子项))continue;
            for(const id of item.子项){const key=String(id||'').trim();if(key)collected.add(key);}
        }
        return collected;
    }
    function historyMemoryInvalidateAncestors(backend,childId) {
        if(!plain(backend?.历史总结))return [];
        const affected=new Set([String(childId||'')]),removed=[];
        let changed=true;
        while(changed){
            changed=false;
            for(const [name,item] of Object.entries(backend.历史总结||{})){
                if(!plain(item)||!Array.isArray(item.子项))continue;
                if(!item.子项.some(id=>affected.has(String(id||''))))continue;
                delete backend.历史总结[name];
                affected.add('总结:'+name);
                removed.push(name);
                changed=true;
            }
        }
        return removed;
    }
    function historyMemorySummaryOrder(item,fallback=0) {
        const n=Number(item?.起始序位);
        return Number.isFinite(n)&&n>0?n:fallback;
    }
    function historyMemoryRootsAtLevel(backend,level) {
        const source=plain(backend)?backend:{},collected=historyMemoryCollectedIds(source);
        if(level===0){
            return historyMemoryLeafEntries(source).map(([name,item],index)=>({
                id:'历史:'+name,name,level:0,text:String(item?.事实||'').trim(),
                timeStart:String(item?.时间||'').trim(),timeEnd:String(item?.时间||'').trim(),
                lo:historyMemoryLeafOrder(name,index+1),hi:historyMemoryLeafOrder(name,index+1)
            })).filter(node=>node.text&&!collected.has(node.id))
                .sort((a,b)=>a.lo-b.lo||a.name.localeCompare(b.name,'zh-CN'));
        }
        return Object.entries(source.历史总结||{}).filter(([,item])=>plain(item)&&Number(item.层级)===level)
            .map(([name,item],index)=>({
                id:'总结:'+name,name,level,text:String(item.摘要||'').trim(),
                timeStart:String(item.起始时间||'').trim(),timeEnd:String(item.结束时间||'').trim(),
                lo:historyMemorySummaryOrder(item,index+1),
                hi:Number.isFinite(Number(item.结束序位))?Number(item.结束序位):historyMemorySummaryOrder(item,index+1)
            })).filter(node=>node.text&&!collected.has(node.id))
            .sort((a,b)=>a.lo-b.lo||a.hi-b.hi||a.name.localeCompare(b.name,'zh-CN'));
    }
    function historyMemoryBatchForLevel(backend,level) {
        const roots=historyMemoryRootsAtLevel(backend,level);
        if(level===0){
            if(roots.length<HISTORY_MEMORY_L0_BATCH+HISTORY_MEMORY_L0_KEEP)return [];
            return roots.slice(0,HISTORY_MEMORY_L0_BATCH);
        }
        const threshold=level===1?HISTORY_MEMORY_L1_BATCH:HISTORY_MEMORY_HIGHER_BATCH;
        if(roots.length<threshold)return [];
        return roots.slice(0,threshold);
    }
    function historyMemoryNextKey(backend,level) {
        const prefix='H'+level+'-',used=new Set(Object.keys(backend?.历史总结||{}));
        let max=0;
        for(const name of used){
            if(!String(name).startsWith(prefix))continue;
            const n=Number(String(name).slice(prefix.length));if(Number.isFinite(n))max=Math.max(max,n);
        }
        let seq=max+1,key='';
        do{key=prefix+String(seq++).padStart(6,'0');}while(used.has(key));
        return key;
    }
    function historyMemoryParseReply(raw) {
        let source=String(raw||'').trim();
        const fenced=source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);if(fenced)source=fenced[1].trim();
        let value=null;
        try{value=JSON.parse(source);}catch(_){
            const start=source.indexOf('{'),end=source.lastIndexOf('}');
            if(start>=0&&end>start){try{value=JSON.parse(source.slice(start,end+1));}catch(__){}}
        }
        const summary=String(value?.摘要||value?.summary||'').trim();
        if(!summary)throw new Error(source?'历史总结失败：返回缺少摘要 JSON':'历史总结失败：模型空回');
        return summary;
    }
    function historyMemoryPrompt(world,batch,outputLevel) {
        const nodes=batch.map((node,index)=>({
            序号:index+1,
            时间:node.timeStart&&node.timeEnd&&node.timeStart!==node.timeEnd?node.timeStart+' → '+node.timeEnd:(node.timeStart||node.timeEnd||''),
            事实:node.text
        }));
        return JSON.stringify({
            世界:String(world?.名称||''),
            输出层级:'L'+outputLevel,
            说明:'按给定顺序压缩；时间字段是权威锚点，不得改写或补造。',
            历史节点:nodes
        },null,2);
    }
    function projectWorldHistoryMemory(backend) {
        const state=plain(backend)?backend:{},raw=state.历史||{},summaries=state.历史总结||{};
        const collected=historyMemoryCollectedIds(state);
        const allLeaves=historyMemoryLeafEntries(state);
        const rawRoots=historyMemoryRootsAtLevel(state,0);
        const recent=rawRoots.slice(-HISTORY_MEMORY_LEGACY_RAW_CONTEXT);
        const recentMap=Object.fromEntries(recent.map(node=>{
            const key=node.id.slice(3),record=raw[key]||{};
            return [key,{时间:String(record.时间||''),事实:String(record.事实||''),关联事件:Array.isArray(record.关联事件)?copy(record.关联事件):[]}];
        }));
        const rootSummaries=Object.entries(summaries).filter(([name,item])=>plain(item)&&!collected.has('总结:'+name))
            .map(([name,item],index)=>({
                名称:name,层级:Math.max(1,Number(item.层级)||1),
                起始时间:String(item.起始时间||''),结束时间:String(item.结束时间||''),摘要:String(item.摘要||''),
                __order:historyMemorySummaryOrder(item,index+1)
            })).filter(item=>item.摘要)
            .sort((a,b)=>a.__order-b.__order||a.层级-b.层级||a.名称.localeCompare(b.名称,'zh-CN'))
            .map(item=>{const out={...item};delete out.__order;return out;});
        return {
            说明:'世界长期叙事与因果记忆；用于保持跨章连续性，不自动等于任何角色已经获知的情报。',
            近期锚点:recentMap,
            长期总结:rootSummaries,
            统计:{
                原始锚点总数:allLeaves.length,
                总结节点总数:Object.keys(summaries).length,
                未收纳锚点数:rawRoots.length,
                隐藏未压缩锚点数:Math.max(0,rawRoots.length-recent.length),
                冷归档事实数:Math.max(0,Object.keys(raw).length-allLeaves.length)
            }
        };
    }
    function historyMemoryDigest(backend) {
        try{return JSON.stringify([backend?.历史||{},backend?.历史总结||{}]);}catch(_){return '';}
    }

    // 世界推进自身始终读“近期根锚点 + 更早根总结”；正文是否读取由独立设置控制。
    const projectWorldContextBeforeHistoryMemory=projectWorldContext;
    projectWorldContext=function(stat) {
        const out=projectWorldContextBeforeHistoryMemory(stat);
        const backend=stat?.世界?.[PATH]||{},projected=out?.世界?.[PATH];
        if(projected){
            delete projected.历史;
            projected.历史记忆=projectWorldHistoryMemory(backend);
        }
        return out;
    };

    const SamsaraWorldEngineBeforeHistoryMemory=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeHistoryMemory {
        constructor(host,env) {
            super(host,env);
            let dirty=false;
            if(!Object.hasOwn(this.config,'sendHistoryToProse')){this.config.sendHistoryToProse=false;dirty=true;}
            else this.config.sendHistoryToProse=this.config.sendHistoryToProse===true;
            this.historyMaintenanceBusy=false;
            this.lastHistoryMaintenance='';
            if(dirty)this.saveConfig();
        }
        setSendHistoryToProse(value) {
            this.config.sendHistoryToProse=value===true;
            this.saveConfig();
            this.render();
            return this.config.sendHistoryToProse;
        }
        proseHistoryMemory(stat) {
            return projectWorldHistoryMemory(stat?.世界?.[PATH]||{});
        }
        createPanel() {
            super.createPanel();
            if(!this.panel||this.panel.__historyMemoryToggleBound)return;
            Object.defineProperty(this.panel,'__historyMemoryToggleBound',{value:true,configurable:true});
            this.panel.addEventListener('click',event=>{
                const button=event.target?.closest?.('[data-action="history-prose-toggle"]');
                if(!button||!this.panel.contains(button))return;
                event.preventDefault();
                this.setSendHistoryToProse(this.config.sendHistoryToProse!==true);
            });
        }
        async requestHistoryMemorySummary(world,batch,outputLevel) {
            const savedTransport=this.lastTransportInfo;
            try{
                const raw=await this.requestAI(
                    HISTORY_MEMORY_SYSTEM,
                    historyMemoryPrompt(world,batch,outputLevel),
                    {schema:HISTORY_MEMORY_SCHEMA,schemaName:'samsara_world_history_summary_v1',structured:'auto',temperature:0.2}
                );
                return historyMemoryParseReply(raw);
            } finally {
                this.lastTransportInfo=savedTransport;
            }
        }
        beforeWorldCommit(next, context={}) {
            const summary=String(context.worldResult?.摘要||context.reply?.summary||this.lastWorldResult?.摘要||'').trim();
            const messageId=Number(context.messageId);
            const backend=next?.世界?.[PATH];
            if(!summary||!Number.isInteger(messageId)||!plain(backend))return false;
            if(!plain(backend.历史))backend.历史={};
            if(!plain(backend.历史总结))backend.历史总结={};
            const key=historyMemoryLeafKey(messageId),record={
                时间:String(next.世界?.时间||backend.已处理时间||context.baseStat?.世界?.时间||''),
                事实:summary,
                关联事件:[]
            };
            const previous=backend.历史[key];
            if(plain(previous)&&String(previous.时间||'')===record.时间&&String(previous.事实||'')===record.事实)return false;
            backend.历史[key]=record;
            const invalidated=historyMemoryInvalidateAncestors(backend,'历史:'+key);
            this.lastHistoryMaintenance='近期历史已更新'+(invalidated.length?' · 旧总结失效 '+invalidated.length+' 个':'');
            return true;
        }
        async maintainHistoryMemory() {
            if(this.historyMaintenanceBusy)return 0;
            this.historyMaintenanceBusy=true;
            const previousStatus=this.status;
            let made=0,failed='';
            try{
                const snapshot=this.snapshot(),stat=copy(snapshot.stat),backend=stat?.世界?.[PATH];
                if(!plain(backend))return 0;
                if(!plain(backend.历史总结))backend.历史总结={};
                const startDigest=historyMemoryDigest(backend);
                // 只在当前层生成一个父节点，然后继续检查更高层；同一层的大量旧数据分摊到后续世界推进，避免一次爆发过多副请求。
                for(let level=0;level<32;level++){
                    const batch=historyMemoryBatchForLevel(backend,level);
                    if(!batch.length)continue;
                    const outputLevel=level+1;
                    this.status='整理长期历史记忆 · L'+outputLevel;this.render();
                    let summary='';
                    try{summary=await this.requestHistoryMemorySummary(stat.世界,batch,outputLevel);}
                    catch(error){failed=String(error?.message||error);break;}
                    const key=historyMemoryNextKey(backend,outputLevel);
                    backend.历史总结[key]={
                        层级:outputLevel,摘要:summary,子项:batch.map(node=>node.id),
                        起始时间:String(batch.find(node=>node.timeStart)?.timeStart||''),
                        结束时间:String([...batch].reverse().find(node=>node.timeEnd)?.timeEnd||''),
                        起始序位:Math.min(...batch.map(node=>Number(node.lo)||0).filter(n=>n>0)),
                        结束序位:Math.max(...batch.map(node=>Number(node.hi)||0).filter(n=>n>0)),
                        创建时间:String(stat.世界?.时间||'')
                    };
                    made++;
                }
                if(!made)return 0;
                const current=this.snapshot(),currentBackend=current.stat?.世界?.[PATH];
                if(historyMemoryDigest(currentBackend)!==startDigest){
                    this.lastHistoryMaintenance='历史在总结期间已变化，本次总结结果丢弃，下轮重试';
                    return 0;
                }
                const validate=this.host.Samsara&&this.host.Samsara.validateWorldState;
                const next=validate?validate(stat):stat;
                const result=current.raw;result.stat_data=next;
                this.committing=true;
                await current.mvu.replaceMvuData(result,{type:'message',message_id:current.id});
                this.lastHistoryMaintenance='新增 '+made+' 个历史总结节点';
                return made;
            } finally {
                this.committing=false;
                if(failed)this.lastHistoryMaintenance='历史总结稍后重试：'+failed;
                this.status=previousStatus+(made?' · 历史总结+'+made:(failed?' · 历史总结待重试':''));
                this.render();
                this.historyMaintenanceBusy=false;
            }
        }
        async run() {
            const result=await super.run();
            if(result===true){
                try{await this.maintainHistoryMemory();}catch(error){
                    this.lastHistoryMaintenance='历史总结稍后重试：'+String(error?.message||error);
                    try{console.warn('[世界推进] '+this.lastHistoryMaintenance);}catch(_){}
                }
            }
            return result;
        }
    };
    // 历史记忆手动维护：近期原始锚点可修正事实；长期总结可修正摘要/时间，但树层级与子项引用始终由程序托管。
    function historyMemoryEditorEscape(value) {
        if(typeof causalOverviewEscape==='function')return causalOverviewEscape(value);
        return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function historyMemoryEditorSamePath(left,right) {
        return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>String(item)===String(right[index]));
    }
    function historyMemoryEditorSyncReplay(raw,fingerprint,path,value) {
        const replay=raw?.__samsaraWorldReplay;
        if(!plain(replay)||String(replay.fingerprint||'')!==String(fingerprint||'')||!Array.isArray(replay.operations))return;
        replay.operations=replay.operations.filter(operation=>!historyMemoryEditorSamePath(operation?.path,path));
        replay.operations.push({op:'set',path:copy(path),value:copy(value)});
    }
    function historyMemoryEditorRelated(value) {
        const source=Array.isArray(value)?value.join('\n'):String(value||'');
        return [...new Set(source.split(/[\n,，、;；]+/).map(item=>item.trim()).filter(Boolean))];
    }

    const SamsaraWorldEngineBeforeHistoryMemoryEditor=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeHistoryMemoryEditor {
        async persistHistoryMemoryEdit(kind,name,build,status) {
            name=String(name||'').trim();
            if(!name)throw new Error('历史记录名称不能为空');
            const snapshot=this.snapshot(),next=copy(snapshot.raw),stat=next.stat_data,backend=stat?.世界?.[PATH];
            if(!plain(backend))throw new Error('世界后台不存在');
            const bucketName=kind==='summary'?'历史总结':'历史';
            const bucket=backend[bucketName];
            if(!plain(bucket)||!plain(bucket[name]))throw new Error((kind==='summary'?'长期历史总结':'近期历史锚点')+'不存在：'+name);
            const updated=build(copy(bucket[name]));
            if(!plain(updated))throw new Error('历史编辑结果无效');
            bucket[name]=updated;
            historyMemoryEditorSyncReplay(next,snapshot.fingerprint,['世界',PATH,bucketName,name],updated);
            const target=this.host,had=!!target&&Object.prototype.hasOwnProperty.call(target,'__samsaraUIMutation'),previous=target?.__samsaraUIMutation;
            if(target)target.__samsaraUIMutation=true;
            try{
                await snapshot.mvu.replaceMvuData(next,{type:'message',message_id:snapshot.id});
            }finally{
                if(target){
                    if(had)target.__samsaraUIMutation=previous;
                    else delete target.__samsaraUIMutation;
                }
            }
            this.lastHistoryMaintenance=status||'历史记忆已手动修正';
            this.status=status||'历史记忆已手动修正';
            this.render(true);
            return true;
        }
        async setHistoryAnchorRecord(name,record) {
            const time=String(record?.时间||'').trim(),fact=String(record?.事实||'').trim();
            if(!fact)throw new Error('历史事实不能为空');
            const related=historyMemoryEditorRelated(record?.关联事件);
            return this.persistHistoryMemoryEdit('anchor',name,current=>({
                ...current,
                时间:time,
                事实:fact,
                关联事件:related
            }),'已修正近期历史锚点');
        }
        async setHistorySummaryRecord(name,record) {
            const summary=String(record?.摘要||'').trim();
            if(!summary)throw new Error('长期历史摘要不能为空');
            const start=String(record?.起始时间||'').trim(),end=String(record?.结束时间||'').trim();
            return this.persistHistoryMemoryEdit('summary',name,current=>({
                ...current,
                // 层级、子项、序位、创建时间全部保留，避免破坏可追溯总结树。
                摘要:summary,
                起始时间:start,
                结束时间:end
            }),'已修正长期历史总结');
        }
        historyMemoryEditorBackend() {
            return this.snapshot().stat?.世界?.[PATH]||{};
        }
        historyMemoryEditorSection(title) {
            if(!this.panel)return null;
            return Array.from(this.panel.querySelectorAll('.we-section')).find(section=>String(section.querySelector('.we-section-head h2')?.textContent||'').trim()===title)||null;
        }
        historyAnchorInlineEditorHtml(name,record) {
            return '<div class="we-history-inline-editor" data-history-editor="anchor" data-history-name="'+historyMemoryEditorEscape(name)+'">'
                +'<div class="we-history-edit-title"><b>'+historyMemoryEditorEscape(name)+'</b><span>近期历史锚点</span></div>'
                +'<div class="we-history-edit-grid">'
                +'<label class="we-history-edit-field"><span>时间</span><input type="text" data-history-field="time" value="'+historyMemoryEditorEscape(record?.时间||'')+'"></label>'
                +'<label class="we-history-edit-field we-history-edit-wide"><span>已确认事实</span><textarea rows="4" data-history-field="fact" placeholder="只写已经确认发生的历史事实">'+historyMemoryEditorEscape(record?.事实||'')+'</textarea></label>'
                +'<label class="we-history-edit-field we-history-edit-wide"><span>关联事件</span><input type="text" data-history-field="related" value="'+historyMemoryEditorEscape((Array.isArray(record?.关联事件)?record.关联事件:[]).join('、'))+'"><small>多个事件可用 、 或逗号分隔</small></label>'
                +'</div><div class="we-history-actions">'
                +'<button type="button" class="we-history-save" data-action="history-anchor-save" data-history-name="'+historyMemoryEditorEscape(name)+'">保存</button>'
                +'<button type="button" data-action="history-anchor-cancel">取消</button>'
                +'</div></div>';
        }
        historySummaryInlineEditorHtml(name,record) {
            return '<div class="we-history-inline-editor" data-history-editor="summary" data-history-name="'+historyMemoryEditorEscape(name)+'">'
                +'<div class="we-history-edit-title"><b>'+historyMemoryEditorEscape(name)+'</b><span>L'+historyMemoryEditorEscape(Number(record?.层级)||1)+' · 树结构锁定</span></div>'
                +'<div class="we-history-edit-grid">'
                +'<label class="we-history-edit-field"><span>起始时间</span><input type="text" data-history-field="start" value="'+historyMemoryEditorEscape(record?.起始时间||'')+'"></label>'
                +'<label class="we-history-edit-field"><span>结束时间</span><input type="text" data-history-field="end" value="'+historyMemoryEditorEscape(record?.结束时间||'')+'"></label>'
                +'<label class="we-history-edit-field we-history-edit-wide"><span>长期历史摘要</span><textarea rows="5" data-history-field="summary" placeholder="修正这段长期历史的已确认事实概括">'+historyMemoryEditorEscape(record?.摘要||'')+'</textarea></label>'
                +'</div><div class="we-history-actions">'
                +'<button type="button" class="we-history-save" data-action="history-summary-save" data-history-name="'+historyMemoryEditorEscape(name)+'">保存</button>'
                +'<button type="button" data-action="history-summary-cancel">取消</button>'
                +'</div></div>';
        }
        beginHistoryMemoryEdit(kind,name,card) {
            const backend=this.historyMemoryEditorBackend();
            const record=kind==='summary'?backend?.历史总结?.[name]:backend?.历史?.[name];
            if(!plain(record)||!card)return false;
            card.innerHTML=kind==='summary'?this.historySummaryInlineEditorHtml(name,record):this.historyAnchorInlineEditorHtml(name,record);
            card.classList.add('we-history-editing');
            const first=card.querySelector('textarea,input');
            try{first?.focus?.();}catch(_){}
            return true;
        }
        async saveHistoryAnchorInlineEdit(card,name) {
            if(!card)return false;
            const value=key=>card.querySelector('[data-history-field="'+key+'"]')?.value;
            return this.setHistoryAnchorRecord(name,{
                时间:String(value('time')||'').trim(),
                事实:String(value('fact')||'').trim(),
                关联事件:historyMemoryEditorRelated(value('related'))
            });
        }
        async saveHistorySummaryInlineEdit(card,name) {
            if(!card)return false;
            const value=key=>card.querySelector('[data-history-field="'+key+'"]')?.value;
            return this.setHistorySummaryRecord(name,{
                起始时间:String(value('start')||'').trim(),
                结束时间:String(value('end')||'').trim(),
                摘要:String(value('summary')||'').trim()
            });
        }
        ensureHistoryMemoryEditorStyles() {
            if(!this.style||this.style.textContent.includes('.we-history-actions{'))return;
            this.style.textContent+='\n#sam-world-engine .we-history-actions{display:flex;gap:7px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}#sam-world-engine .we-history-actions button{border:1px solid var(--we-line,var(--line));border-radius:7px;background:transparent;color:var(--we-sub,var(--sub));padding:5px 10px;font-size:var(--we-fs-tiny,11px);cursor:pointer}#sam-world-engine .we-history-actions button:hover{color:var(--we-ink,var(--ink));background:var(--we-card-hover,#1d2a39)}#sam-world-engine .we-history-save{color:var(--we-accent,var(--gold))!important;border-color:color-mix(in srgb,var(--we-accent,var(--gold)) 45%,transparent)!important}#sam-world-engine .we-history-inline-editor{display:grid;gap:9px}#sam-world-engine .we-history-edit-title{display:flex;justify-content:space-between;gap:10px;align-items:center}#sam-world-engine .we-history-edit-title span{color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-history-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}#sam-world-engine .we-history-edit-field{display:grid;gap:4px;min-width:0}#sam-world-engine .we-history-edit-field>span{color:var(--we-sub,var(--sub));font-size:var(--we-fs-tiny,11px)}#sam-world-engine .we-history-edit-field>small{color:var(--we-sub,var(--sub));font-size:10px}#sam-world-engine .we-history-edit-field input,#sam-world-engine .we-history-edit-field textarea{width:100%;border:1px solid var(--we-line,var(--line));border-radius:7px;background:var(--we-surface,#111923);color:var(--we-ink,var(--ink));padding:7px 9px}#sam-world-engine .we-history-edit-field textarea{min-height:86px!important;max-height:220px!important;resize:vertical;line-height:1.55}#sam-world-engine .we-history-edit-field input:focus,#sam-world-engine .we-history-edit-field textarea:focus{outline:1px solid var(--we-accent,var(--gold));border-color:var(--we-accent,var(--gold))}#sam-world-engine .we-history-edit-wide{grid-column:1/-1}#sam-world-engine .we-history-editing{overflow:visible}@media(max-width:680px){#sam-world-engine .we-history-edit-grid{grid-template-columns:1fr}#sam-world-engine .we-history-edit-wide{grid-column:auto}}';
        }
        mountHistoryMemoryEditorControls() {
            if(this.tab!=='运行记录'||!this.panel)return;
            const backend=this.historyMemoryEditorBackend(),memory=projectWorldHistoryMemory(backend);
            const recentNames=Object.entries(memory.近期锚点||{}).reverse().map(([name])=>name);
            const recentSection=this.historyMemoryEditorSection('近期历史锚点');
            Array.from(recentSection?.querySelectorAll('.we-card')||[]).forEach((card,index)=>{
                const name=recentNames[index];if(!name||card.querySelector('.we-history-actions'))return;
                card.dataset.historyName=name;card.dataset.historyKind='anchor';
                const actions=this.host.document.createElement('div');actions.className='we-history-actions';
                actions.innerHTML='<button type="button" data-action="history-anchor-edit" data-history-name="'+historyMemoryEditorEscape(name)+'">编辑</button>';
                card.appendChild(actions);
            });
            const summaryNames=(memory.长期总结||[]).slice().reverse().map(item=>item.名称);
            const summarySection=this.historyMemoryEditorSection('长期历史总结');
            Array.from(summarySection?.querySelectorAll('.we-card')||[]).forEach((card,index)=>{
                const name=summaryNames[index];if(!name||card.querySelector('.we-history-actions'))return;
                card.dataset.historyName=name;card.dataset.historyKind='summary';
                const actions=this.host.document.createElement('div');actions.className='we-history-actions';
                actions.innerHTML='<button type="button" data-action="history-summary-edit" data-history-name="'+historyMemoryEditorEscape(name)+'">编辑</button>';
                card.appendChild(actions);
            });
        }
        createPanel() {
            super.createPanel();
            if(!this.panel||this.panel.__historyMemoryEditorBound)return;
            Object.defineProperty(this.panel,'__historyMemoryEditorBound',{value:true,configurable:true});
            this.panel.addEventListener('click',event=>{
                const button=event.target?.closest?.('[data-action^="history-anchor-"],[data-action^="history-summary-"]');
                if(!button||!this.panel.contains(button))return;
                const action=String(button.dataset.action||'');
                if(!['history-anchor-edit','history-anchor-save','history-anchor-cancel','history-summary-edit','history-summary-save','history-summary-cancel'].includes(action))return;
                event.preventDefault();event.stopPropagation();
                const card=button.closest('.we-card'),name=String(button.dataset.historyName||card?.dataset?.historyName||card?.querySelector?.('[data-history-editor]')?.dataset?.historyName||'');
                let task=null;
                if(action==='history-anchor-edit')this.beginHistoryMemoryEdit('anchor',name,card);
                else if(action==='history-summary-edit')this.beginHistoryMemoryEdit('summary',name,card);
                else if(action==='history-anchor-save')task=this.saveHistoryAnchorInlineEdit(card,name);
                else if(action==='history-summary-save')task=this.saveHistorySummaryInlineEdit(card,name);
                else if(action.endsWith('-cancel'))this.render(true);
                if(task)Promise.resolve(task).catch(error=>{
                    const message=String(error?.message||error||'历史记忆编辑失败');
                    const toast=this.host?.toastr||this.env?.toastr;
                    if(toast?.error)toast.error(message,'历史记忆');else try{console.error('[历史记忆编辑]',error);}catch(_){}
                });
            });
        }
        render(force) {
            const result=super.render(force);
            this.ensureHistoryMemoryEditorStyles();
            this.mountHistoryMemoryEditorControls();
            return result;
        }
    };
    // 到期事件采用软复核：提醒模型处理，但不再作为整轮写入的硬门槛。
    function dueEventReviewPoint(event) {
        const nextCheck=String(event?.下次检查||'').trim();
        if(nextCheck)return {原文:nextCheck,键:worldDateKey(nextCheck),来源:'下次检查'};
        const planned=String(event?.时间||event?.开始时间||'').trim();
        return {原文:planned,键:worldDateKey(planned),来源:'计划时间'};
    }
    function relaxedDueEvents(stat) {
        const now=worldDateKey(stat?.世界?.时间);if(now===null)return [];
        const events=stat?.世界?.[PATH]?.事件||{},due=[];
        for(const [名称,event] of Object.entries(events)){
            if(!plain(event)||event.状态!=='待发生')continue;
            const review=dueEventReviewPoint(event);
            // 明确的未来复核时间尚未到，不重复催办；语义型“下次检查”无法比较时只做软提醒，不阻断写入。
            if(review.来源==='下次检查'&&review.键!==null&&review.键>now)continue;
            if(review.来源==='计划时间'&&(review.键===null||review.键>now))continue;
            due.push({
                名称,
                时间:String(event.时间||event.开始时间||''),
                下次检查:String(event.下次检查||''),
                条件:String(event.条件||''),
                前因:copy(event.前因||[]),
                复核依据:review.来源,
                说明:'软提醒：该事件已到计划/复核时间。条件与前因满足则转为进行中；若暂不发生，可保持待发生并优先填写新的“下次检查”。“条件”只表示事件触发条件，不要改写成延期阻碍。未处理不会导致本轮世界推进被驳回。'
            });
        }
        return due;
    }

    // 旧版会要求“更新时间===当前时间 + 下次检查 + 条件”三项齐全，否则整轮驳回。
    // 到期事件现在只作为模型的软复核清单；未处理时保留原事件，下一轮继续提醒，而不是制造重试死循环。
    ensureDueHandled=function() { return []; };

    const SamsaraWorldEngineBeforeDueEventRelaxation=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeDueEventRelaxation {
        async buildRequest(base) {
            const request=await super.buildRequest(base),due=relaxedDueEvents(base?.stat||{});
            request.due=due;
            try{
                const payload=JSON.parse(request.input);
                payload.本轮必须复核的到期事件=due;
                request.input=JSON.stringify(payload,null,2);
            }catch(_){}
            if(request.manifest)request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
    };
    // CommonJS 入口仅供离线测试，浏览器脚本不依赖打包器。
    if (typeof module !== 'undefined' && module.exports) { module.exports = {SamsaraWorldEngine,applyPatches,parseReply,emptyState,RECORDS,compileWorldResult,normalizeWorldResult,mergeWorldResults,WORLD_RESULT_SCHEMA,projectWorldContext,compactWorldLifecycle,calendarDate,repairExplorationGranularity,sortWorldEvents,eventScheduleLabel,staleActiveEvents,temporalAnomalies,activeAlienActivityRequirements,pruneDeadAlienPeople,extractWorldProse,derivePersonWorldContext,projectHotWorldPeople,WORLD_UI_THEMES,WORLD_FONT_SCALES,estimateTokens,formatTokenCount,normalizeTokenUsage,requestTokenTelemetry}; return; }
    const host = root.parent && root.parent !== root ? root.parent : root;
    // 酒馆脚本沙箱中的助手接口可能是词法全局，不一定挂在 iframe.window 上。
    const runtime = {
        get Mvu() { return typeof Mvu !== 'undefined' ? Mvu : root.Mvu || host.Mvu; },
        get tavern_events() { return typeof tavern_events !== 'undefined' ? tavern_events : root.tavern_events || host.tavern_events; }
    };
    if (typeof eventOn === 'function') runtime.eventOn = (...args) => eventOn(...args);
    if (typeof eventMakeFirst === 'function') runtime.eventMakeFirst = (...args) => eventMakeFirst(...args);
    if (typeof getChatMessages === 'function') runtime.getChatMessages = (...args) => getChatMessages(...args);
    if (typeof getCurrentChatId === 'function') runtime.getCurrentChatId = (...args) => getCurrentChatId(...args);
    if (typeof getCharWorldbookNames === 'function') runtime.getCharWorldbookNames = (...args) => getCharWorldbookNames(...args);
    if (typeof getChatWorldbookName === 'function') runtime.getChatWorldbookName = (...args) => getChatWorldbookName(...args);
    if (typeof getGlobalWorldbookNames === 'function') runtime.getGlobalWorldbookNames = (...args) => getGlobalWorldbookNames(...args);
    if (typeof getWorldbook === 'function') runtime.getWorldbook = (...args) => getWorldbook(...args);
    host.Samsara = host.Samsara || {};
    if (host.Samsara.worldEngine) host.Samsara.worldEngine.dispose();
    const engine = new SamsaraWorldEngine(host,runtime);
    host.Samsara.WorldEngine = SamsaraWorldEngine;
    host.Samsara.worldEngine = engine; engine.init();
    root.addEventListener('unload', () => engine.dispose(), {once:true});
})(typeof window !== 'undefined' ? window : globalThis);
