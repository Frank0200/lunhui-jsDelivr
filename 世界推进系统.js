/* 輪廻戦場 · 世界エンジン
 * 参考非同期アシスタントからの移行：旧状態の読み戻し、差分パッチ、階層投影、メッセージ分離、バックグラウンドスケジューリング。
 * 専用実装：六つの業務モジュールが一回のシミュレーションを共有し、MVU が唯一の永続状態；主神端末 API を再利用する。
 * 酒場のスクリプトライブラリで単独に読み込む。インターフェースは親ウィンドウの Samsara.worldEngine。
 */
(function (root) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // P1-C 診断に必要なのは安定した概算オーダーだけ；モデルごとに tokenizer が異なるため、API usage のみを正確な token と見なす。
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
    // 六テーマの色値はここでのみ管理する。CSS はセマンティック tokenだけを消費し、羊皮紙/桜白などのテーマに局所パッチを積み増さない。
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
        standard:{name:'標準',size:'16px',desc:'本文約15px、補助文字は13px以上'},
        large:{name:'大文字',size:'18px',desc:'本文約17px、補助文字は約14-15px'},
        xlarge:{name:'特大',size:'20px',desc:'本文約19px、遠距離からの閲覧向け'}
    };
    const PATH = 'バックステージ';
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
    // チャットインターフェースは生のメッセージを返し、酒場の表示用正規表現は適用されない。送信とキーワード走査はこの抽出結果を共有する。
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
        // 一部の本文モデルは assistant prefill で隠しブロックの開始タグを注入し、最終メッセージには終了タグしか保存されない。
        // 思考系タグに限り「最初の隠しタグが孤立した終了タグ」の互換動作を有効にし、変数/パネル前の通常本文を誤って飲み込まないようにする。
        const prefillHidden=new Set(['think','thinking','reasoning','analysis','konatan_planning','dm_think','chain_of_thought']);
        // タグスタックに従って技術ブロック全体を除去する。ネストと属性に対応；未閉鎖の技術ブロックの残りも送信しない。
        const tags=/<\s*(\/?)\s*([a-z_][\w-]*)\b[^>]*>/gi;
        const stack=[];let text='',cursor=0,match,seenHiddenTag=false;
        while((match=tags.exec(source))){
            const name=match[2].toLowerCase();
            if(!hidden.has(name))continue;
            const closing=!!match[1];
            // assistant prefill は <thinking>/<konatan_planning~> などの開始タグを保存テキストの外に置くことがある。
            // このメッセージの最初の隠し境界が対応する終了タグなら、メッセージ先頭からそのタグまでが隠し思考に属する。
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
        // コードパネルは演出済みのストーリーには含めない；言語指定のない純粋な物語フェンスは引き続き許容する。
        text=text.replace(/^[ \t]*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm,
            (_block,_fence,language,body)=>{
                if(/^(?:json\w*|ya?ml|html|xml|javascript|js|typescript|ts|css|python|diff)\b/i.test(language.trim()))return '\n';
                try{const data=JSON.parse(body);if(data&&typeof data==='object')return '\n';}catch(_){}
                return body;
            });
        // 参考アシスタントの bodyTagsText が空になるモードに対応：常にメッセージ全体を洗浄し、本文タグでは切り取らない。
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
        // 数値の年月日は実際のグレゴリオ暦の日序で計算し、2月28日→3月1日 が旧「毎月31日」近似で96時間に引き伸ばされるのを避ける。
        // 非グレゴリオ暦/相対的な意味論はそもそもここに一致しないため、引き続き意味論の再確認で扱う。
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
        if(!from)return {起点:'初回実行/前回エンジン時刻なし',终点:to,小时:null,等级:'初回初期化',允许:'先にマクロ骨格を構築する；直近の細部は現在の事実だけに基づき、追加の所要時間は仮定しない。'};
        if(a!==null&&b!==null){
            const hours=Math.max(0,b-a);
            if(hours<=0)return {起点:from,终点:to,小时:0,等级:'未進行',允许:'今回新たに確認した事実、即時反応、同期結果だけを記録できる；時間を要するバックグラウンド事項を完了してはならない。'};
            if(hours<=2)return {起点:from,终点:to,小时:hours,等级:'短時間帯',允许:'対面での短い会話、通信、デスクワーク、同一区域内の短距離移動まで；大規模な行動は準備か開始のみ。'};
            if(hours<=12)return {起点:from,终点:to,小时:hours,等级:'数時間',允许:'同一市街区内の移動、限定的な調査/準備、一度の作業段階まで；都市間移動や大規模な動員は通常完了できない。'};
            if(hours<=24)return {起点:from,终点:to,小时:hours,等级:'半日〜一日',允许:'一連の日常業務、ややまとまった一段階、または市街区の移転まで完了できる；長期工程と遠距離行動は依然として分割が必要。'};
            return {起点:from,终点:to,小时:hours,等级:'数日以上',允许:'長距離行程、物資輸送、拠点/組織事項の複数段階を進行できるが、因果と資源に沿って段階的に進める。'};
        }
        return {起点:from,终点:to,小时:null,等级:'作品内時間',允许:'作品内時間の意味論に従って行動容量を保守的に見積もる；スパンが確認できない場合は一歩だけ進め、長期結果へ直接跳ばない。'};
    }
    // カレンダー表示専用：認識可能な数値年を優先する；作品紀年で年は認識できないが月日は認識できる場合は 2026 を表示年とする。
    // 世界.暦法 が月の日数を提供する場合はその暦法に従い、グレゴリオ暦の月長は適用しない。
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
        const custom=Array.isArray(calendar?.月日数)?calendar.月日数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24):[];
        if(custom.length){
            if(month<1||month>custom.length||d<1||d>custom[month-1])return null;
            return {y,m:month,d,key:y+'-'+month+'-'+d,fallbackYear,customCalendar:true};
        }
        const date=new Date(0);
        date.setFullYear(y,month-1,d);date.setHours(0,0,0,0);
        if(date.getFullYear()!==y||date.getMonth()!==month-1||date.getDate()!==d)return null;
        return {y,m:month,d,key:y+'-'+month+'-'+d,fallbackYear,customCalendar:false};
    }
    const DEFAULT_PRESET = `あなたは輪廻戦場の世界エンジンである。本文シーンの外で今も動き続けている世界だけを進行させ、事件、シーン、人物、勢力、伝播、資産と因果の整合を保つ。
【执行流程】
Step 1 · 事実の取得：「当前变量/今回確認済みのストーリー > 明確な世界書 > モデルの常識」の順で読む；確認済みの差異を優先する。
Step 2 · 境界の確定：当前阶段と次の宏观节点を確認する；篇章、地区、戦争、勢力、または重要人物の命運に段階的変化が生じた時だけマクロ骨格を調整する。
Step 3 · 区間の進行：今回の時間容量に厳密に従い、まず期限到来/进行中の事項を処理し、未完了の事項を妥当な一歩だけ進める；計画は事実ではなく、次のマクロ境界を越えない。
Step 4 · 現場から人物へ：まず今回の区間内で実際に変化した地区の現場を更新し、そのうえで人物の行動を決める。人物は地点、路程、能力、認知、職責、資産、地区の条件に拘束される。モデルが本文メッセージ/当前变量を見ていることは人物の知情を意味しない；場外人物が<user>の新しい行動によって目標や行動を変えるには、すでに対応する認知を持っているか、今回の観察、目撃、通信、伝播によって取得し、人物.认知/认知来源に同期していなければならない；出所がなければ元の目標/行動を維持し、自身の事務だけを進める。同一現場で本文が未決着ならインタラクションの手前で止める。アクティブな異端は毎回再確認する。
Step 5 · プレイヤー影響の決算：<user>の確認済み行動だけに基づいて探索、勢力、重大な因果偏移を決算する；これは客観的な世界の決算であり、これによって情報を得ていない場外人物を自動的に追跡、待ち伏せ、方針変更させてはならない。必要ならマクロ骨格を再構築する。
Step 6 · 伝播の更新：今回実際に変化した伝播、通貨、暦法だけを保守する；終了/期限切れの伝播は復活させない。
Step 7 · 差分の出力：まず「歴史摘要」の規則に従って摘要を書き、その後で今回新規または変化した WorldResult だけを出力する；業務上の変化がなくても今回新しい世界事実がないことを客観的に説明する。
【执行检查】
時間/路程は実現可能である；人物の知識には出所がある；同一人物は同一時間帯に一箇所だけ；<user>の代わりに行動しない；演出済みの些事を復唱しない；世界は<user>が止まっても停止しない。`;
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
1. 事実：当前变量と確認済みのストーリー > 明確な世界書 > モデルの常識；計画は事実ではなく、確認済みの差異を原著の常識で上書きしてはならない。
2. マクロと時間：世界.時間だけで本世界の進行を計算する；マクロ順序は3~5個の段階級ノードを保ち、細部は次のマクロ境界までしか進めない。待发生/进行中の事件には並べ替え可能な時間か明確な因果時間がなければならない；スパンが確認できない場合は一歩だけ進める。
3. 現場と認知：現場の集団と環境の事実は勢力地区に属し、同一の現場事実を人物へ複製してはならない。まず地区の現場を更新してから人物の行動を決める；モデルが本文メッセージ、当前变量、<user>の確認済み行動を見ていることは世界の事実を意味するだけで、どの場外人物の知情も意味しない。人物はその場の観察、既存の認知、信頼できる通信/伝播チェーンに基づいてのみ行動できる；<user>の新しい行動によって目標や行動を変える場合は、追跡可能な認知来源（既存、または今回書き込む人物.认知/认知来源）が必要で、出所がなければ<user>へ即時反応してはならない。
4. 人物の境界：アクティブな異端は毎回再確認し、死亡は回復できない；通常の人物は真にホットな記録だけを保持する。<user>の代わりにバックグラウンド行動を構築してはならない。主神任務、昇格試練、任务状态、副本成就 は読み取らず、更新せず、これによって世界を駆動しない。通常のインスタンスは主神空間へ戻った時点で本世界のシミュレーションを停止する；単一世界の局所決算は世界をリセットしない。
5. 資産：固定の不動産、大型ビークル、要塞に限る；薬剤、材料、消耗品、鍵、ストーリーアイテム、単兵装備/形態は資産に書き込んではならない。最上位の資産が唯一の資産台帳である；所属対象は配列で、確認済みの場外事実に応じて追加、更新、移転、削除できる；削除保護中の同名資産を再構築してはならず、本文/MVUで決算済みの変化を重複して決算しない。
6. プレイヤー台帳：探索は<user>が実際に到達、調査、または信頼できる形で知り得た全体区域だけを決算する；探索度は0/10/30/60/90/100を段階アンカーとし、理由なく後退しない。勢力声望は<user>の真実の関係結果によってのみ変化し、同一結果は一度だけ決算し、単一ターンの絶対変化は≤1000、500を超える場合は重大事件に限る。
7. 因果：重要人物の命運、重大事件の結果、勢力構図、または本筋の実現可能性が実質的に変化した時だけ偏移を記録する；負値=因果破壊、正値=修復/強化。世界超稳は新しい偏移を追加しない；旧軌道が失効した場合は同じターンでマクロ順序を再構築する。
8. 公開と基本：現在の事件の公開フィールドには、すでに現実となり合理的に知覚できる情報だけを書く。通貨は真実の流通体系に応じてのみ変化し、任務世界ではスペースコインを現地通貨として使わない；暦法は信頼できる設定が明確な時だけ保守する。
9. 歴史摘要：摘要には今回確認済みの主体、動作、結果、重要な状態変化と持続的影響だけを書く；計画、進行、完了を区別し、「マクロ骨格を確立済み」「シミュレーション完了」「情勢暗流」などの運用話術や空疎な概括を禁じる。`;
    const DEFAULT_MACRO_PROMPT = `【本轮宏观骨架交付】
先に入力「本轮必须完成的宏观骨架」を完了させ、その後で直近の細部をシミュレーションする。少なくとも3つの進行可能な宏观节点が統合後の納品ラインであり、进行中+待发生の合計とする。将来の計画は次のマクロ境界を越えてよいが、実際の発生と細部の進行は越境できない；差分だけを出力することは、まだ構築していない骨格を省略してよいことを意味しない。提出前に事件エンティティ、分類、状態、時間、前因、因果.宏观顺序が相互に対応しているか確認する。`;
    const DEFAULT_STABILITY_PROMPT_TEMPLATE = `【世界自救 · {{段階}}】
現在の安定値：{{稳定值}}。{{规则}}
排除は世界観内の合理的な媒体を通じて発生しなければならず、異常を引き起こした輪廻者とその拠点、関係網、資源、行動経路を優先的に対象とする；NPCは依然として自身の認知と伝播チェーンに基づいてのみ行動でき、根拠なく全知になってはならない。法則が壊れているほど能動的な排除が弱まるわけではない。`;
    const BUILTIN_DEFAULT_PROMPT_DOCUMENT = {
        id:'builtin-default',
        type:'samsara-world-prompt-document',
        version:20,
        builtin:true,
        name:'既定設定',
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
        {min:90,title:'因果警戒',rule:'異常な手掛かり、調査、誤解、既存の敵意が合理的な因果チェーンに沿って輪廻者とその直接の関係網へ集まり始める；依然として自然な出来事として表現され、公開的な包囲には至らない。'},
        {min:80,title:'指向性排除',rule:'潜伏先、計画、連絡相手、資源チェーン、行動経路が継続的に圧迫される；圧力は輪廻者本人とその直接の関係網へ優先的に集中する。'},
        {min:70,title:'因果追跡',rule:'原生の強者、組織、本筋の衝突が因果の収束によって徐々に輪廻者へと向かう；拠点、盟友、補給、撤退経路が組織的に破壊され始める。'},
        {min:60,title:'全面包囲',rule:'複数の原生勢力がそれぞれの合理的な動機に基づいて同時に輪廻者を追跡、封鎖、攻撃できる；通常の安全な生活はほぼ終わる。'},
        {min:50,title:'世界の兵器化',rule:'戦争、災害、モンスターの奔流、原生の最上位強者が因果チェーンに沿って輪廻者の活動区域へ圧し掛かる；世界は区域の破壊と大規模な巻き添えを排除の代価として受け入れ始める。'},
        {min:40,title:'現実狩り',rule:'環境、空間、時間、残存する原生ルールのすべてが狩りの媒体となり得る；世界は恒久的な区域破壊を受け入れ、侵入源を道連れに葬ることだけを求める。'},
        {min:30,title:'生贄による排除',rule:'世界は免疫嵐に入り、本筋の人物、都市、国家、さらには文明構造を犠牲にして輪廻者の排除と引き換えにできる。'},
        {min:10,title:'終焉の狩り',rule:'破滅的な出来事が輪廻者とその滞在区域へ向けて収束し続ける；長期間の滞在は災厄を現在地へ引き寄せる。'},
        {min:1,title:'共倒れ',rule:'世界は自衛を放棄し、法則、タイムライン、現実構造を自ら犠牲にして輪廻者を排除する。'},
        {min:0,title:'世界消滅',rule:'因果チェーン、世界法則、タイムライン、現実構造がすべて終了し、通常の世界進行を生成しなくなる。'}
    ];
    function worldStabilityPrompt(stat, template=DEFAULT_STABILITY_PROMPT_TEMPLATE) {
        if(stat?.設定?.世界超安定===true)return '';
        const raw=Number(stat?.世界?.安定),stable=Number.isFinite(raw)?Math.max(0,Math.min(120,raw)):100;
        if(stable>=100)return '';
        const stage=WORLD_STABILITY_DEFENSE_STAGES.find(item=>stable>=item.min)||WORLD_STABILITY_DEFENSE_STAGES.at(-1);
        const source=String(template??DEFAULT_STABILITY_PROMPT_TEMPLATE);
        if(!source.trim())return '';
        return source.split('{{段階}}').join(stage.title).split('{{稳定值}}').join(String(stable)).split('{{规则}}').join(stage.rule);
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
    // 任意指定の明細は初版レコードと互換：参考アシスタントの行程、承诺、认知、资源、任務段階に対応する。
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
            .filter(([,area])=>plain(area)&&area.类型!=='勢力'&&related(location,area?.名称||''))
            .sort((a,b)=>String(b[0]).length-String(a[0]).length)[0]
            ||Object.entries(areas)
                .filter(([name,area])=>plain(area)&&area.类型!=='勢力'&&related(location,name))
                .sort((a,b)=>String(b[0]).length-String(a[0]).length)[0];
        const areaName=String(areaPair?.[0]||''),area=areaPair?.[1]||{};
        const relationByKey=new Map(Object.entries(stat?.关系リスト||{}).map(([name,record])=>[key(name),{名称:name,记录:record}]));
        const alienByKey=new Map(Object.entries(stat?.世界?.異端レーダー?.名簿||{}).map(([name,record])=>[key(name),record]));
        const playerKeys=new Set([playerName,'{{user}}','<user>','玩家'].filter(Boolean).map(key));
        const nearby=Object.entries(people)
            .filter(([name,other])=>{
                const otherKey=key(name);if(!plain(other)||otherKey===normalizedName||playerKeys.has(otherKey))return false;
                if(alienByKey.get(otherKey)?.状態==='死亡')return false;
                const otherLocation=String(other.地点||'').trim();if(!otherLocation)return false;
                return areaName?related(otherLocation,areaName):related(otherLocation,location);
            })
            .map(([name,other])=>{
                const profile=relationByKey.get(key(name));
                const relation=profile?.记录||{};
                const identity=Array.isArray(relation.身分)?relation.身分[0]:String(relation.身分||'');
                return {
                    名称:String(name),
                    关系:key(other.地点)===key(location)?'直近':'同地区',
                    身分:identity,
                    行动:String(other.行动||other.公开动态||relation.態度||''),
                    可查看档案:!!profile,
                    档案名称:String(profile?.名称||''),
                    档案类型:profile?'正式プロフィール':'現場タグ'
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
            时间:event.更新时间||event.预计结束||event.时间||stat.世界.時間||'',
            事实:event.结果||event.描述||(event.状态==='已取消'?'イベントは中止された':'イベントは終了した'),
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
        // すでに終了し、同様にコールド領域へ入った事件同士は、もはや互いをホットな前因参照として持たない；
        // アクティブ/未来の事件の前因は保持されるため、進行中の因果チェーンを壊さない。
        for(const [name,event] of Object.entries(state?.事件||{})){
            if(!cold.has(name)||!Array.isArray(event?.前因)||!event.前因.some(id=>cold.has(id)))continue;
            event.前因=event.前因.filter(id=>!cold.has(id));
            changed.push('事件/'+name);
        }
        return changed;
    }
    function compactFinishedEvents(stat,target=EVENT_TARGET) {
        const state=stat?.世界?.[PATH]; if(!state?.事件)return [];
        const archived=[],now=worldDateKey(stat?.世界?.時間);
        pruneSoftRefsToColdFinishedEvents(state,now);
        const protectedNames=new Set(storyStages(stat?.世界?.因果軌道?.ストーリーライン));
        let refs=collectEventRefs(state);
        const finished=()=>Object.entries(state.事件||{}).filter(([name,event])=>['已完成','已取消'].includes(event.状态)&&!refs.has(name)&&!protectedNames.has(name));
        // 明確な時刻を持つ古い終了事件は、世界時間で一日を経過した時点で直接コールドアーカイブする；終了直後の内容は少なくとも次の段階まで保持する。
        for(const [name,event] of finished()){
            const endedAt=worldDateKey(event.更新时间||event.预计结束||event.时间);
            if(now!==null&&endedAt!==null&&now-endedAt>=FINISHED_EVENT_GRACE_HOURS)archiveFinishedEvent(stat,state,name,event,archived);
        }
        // 作品内時間を比較できない場合は「終了事件を直近8件まで保持」で代替し、長期的な無限増加を防ぐ。
        refs=collectEventRefs(state);
        let candidates=finished();
        while(candidates.length>RECENT_FINISHED_EVENT_TARGET){
            const [name,event]=candidates[0];
            archiveFinishedEvent(stat,state,name,event,archived);
            refs=collectEventRefs(state);candidates=finished();
        }
        // 旧セーブが巨大な場合はハード上限による代替を継続し、参照のない終了事件だけを回収する。
        while(Object.keys(state.事件||{}).length>target){
            refs=collectEventRefs(state);
            const candidate=Object.entries(state.事件||{}).find(([name,event])=>['已完成','已取消'].includes(event.状态)&&!refs.has(name));
            if(!candidate)break;
            archiveFinishedEvent(stat,state,candidate[0],candidate[1],archived);
        }
        // 歴史アンカーは恒久的に確認済みの事実であり、固定件数では削除しない；古い事実は階層化された歴史要約によってホットコンテキストから外れる。
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
                const status=String(item.状態||'').trim();
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
        // 現在地点がない場合、プレイヤーがすでに離れたことを証明できないため、誤削除を避けて保持する。
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
        const now=worldDateKey(stat?.世界?.時間),removed=[];
        for(const [name,record] of Object.entries(state.传播||{})){
            if(propagationEnded(record,now)){delete state.传播[name];removed.push(name);}
        }
        const archived=compactFinishedEvents(stat);
        const removedPeople=pruneColdTemporaryPeople(stat);
        // まず終了済みの事件とコールド人物を回収し、その後でどの探索区域が実際にストーリー上の関連を失ったかを判定する。
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
        if(condition)return '条件トリガー · '+condition;
        const predecessors=Array.isArray(event?.前因)?event.前因.filter(Boolean):[];
        if(predecessors.length)return '先行ノード到達後 · '+predecessors.join('、');
        return '時期未定';
    }
    const STALE_CURRENT_EVENT_HOURS=7*24;
    const STALE_NEAR_EVENT_HOURS=30*24;
    function staleActiveEvents(stat) {
        const now=worldDateKey(stat?.世界?.時間);if(now===null)return [];
        const out=[];
        for(const [名称,event] of Object.entries(stat?.世界?.[PATH]?.事件||{})){
            if(event?.状态!=='進行中'||event?.分类==='宏观节点')continue;
            const touched=worldDateKey(event.更新时间||event.时间||event.开始时间);
            if(touched===null)continue;
            const threshold=event.分类==='当前事件'?STALE_CURRENT_EVENT_HOURS:STALE_NEAR_EVENT_HOURS;
            const age=now-touched;
            if(age>threshold)out.push({名称,分类:event.分类,状態:event.状态,时间:event.时间||event.开始时间||'',更新时间:event.更新时间||'',已陈旧小时:age,説明:'局所的な活動が長期間にわたり进行中のまま留まっている；終了/中止とするか、継続を確認して現在の世界時間、現在の進展、次回チェックまで更新すべき。'});
        }
        return out;
    }
    function temporalAnomalies(stat) {
        const now=worldDateKey(stat?.世界?.時間);if(now===null)return [];
        const state=stat?.世界?.[PATH]||{},out=[];
        const push=(タイプ,名称,字段,值,原因)=>{
            const key=worldDateKey(值);if(key!==null&&key>now)out.push({タイプ,名称,字段,值:String(值||''),原因});
        };
        for(const [name,event] of Object.entries(state.事件||{})){
            if(['進行中','已完成'].includes(event?.状态))push('事件',name,'时间',event.时间||event.开始时间,'発生済み/进行中の事件は現在の世界時間より後にできない');
            if(event?.更新时间)push('事件',name,'更新时间',event.更新时间,'事件の更新時間は現在の世界時間より後にできない');
        }
        for(const [name,person] of Object.entries(state.人物||{}))if(person?.更新时间)push('人物',name,'更新时间',person.更新时间,'人物の現在の動態は未来に由来できない');
        for(const [name,area] of Object.entries(state.势力地区||{})){
            if(area?.更新时间)push('势力地区',name,'更新时间',area.更新时间,'地区の現在状態は未来に由来できない');
            for(const change of area?.近期变化||[])if(change?.时间)push('势力地区',name,'近期变化.时间',change.时间,'すでに発生した地区の変化は未来に由来できない');
        }
        for(const [name,item] of Object.entries(state.历史||{}))if(item?.时间)push('历史',name,'时间',item.时间,'歴史的事実は現在の世界時間より後にできない');
        for(const [name,item] of Object.entries(state.传播||{}))if(item?.时间)push('传播',name,'时间',item.时间,'すでに伝播を開始した情報は現在の世界時間より後にできない');
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
        const hit=all.find(item=>touched.has(item.タイプ+'\u0000'+item.名称));
        if(hit)throw new Error('时间事实超过当前世界时间：'+hit.类型+'/'+hit.名称+' '+hit.字段+'='+hit.值+'；'+hit.原因);
    }
    function eventDisplayBucket(event) {
        if(event?.状态==='進行中')return 0;
        if(event?.状态==='待发生'&&event?.分类==='当前事件')return 1;
        if(event?.状态==='待发生'&&event?.分类==='近期节点')return 2;
        if(event?.状态==='待发生'&&event?.分类==='宏观节点')return 3;
        if(event?.状态==='已完成')return 4;
        if(event?.状态==='已取消')return 5;
        return 6;
    }
    function sortWorldEvents(records,orbit={}) {
        const storyIndex=new Map(storyStages(orbit?.ストーリーライン).map((name,index)=>[nameKey(name),index]));
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
        const orbit=stat.世界.因果軌道||(stat.世界.因果軌道={現在段階:'',ストーリーライン:'',次ノード:'',偏移記録:{}});
        const existing=storyStages(orbit.ストーリーライン);
        const macroEntries=Object.entries(stat.世界[PATH]?.事件||{})
            .filter(([,e])=>e.分类==='宏观节点'&&e.状態!=='已取消')
            .map((item,index)=>({item,index,key:worldDateKey(item[1].时间||item[1].开始时间)}))
            .sort((a,b)=>(a.key??Infinity)-(b.key??Infinity)||a.index-b.index)
            .map(x=>x.item);
        const macroNames=new Set(macroEntries.map(([name])=>name));
        const patches=[];
        let line=[];
        const existingValid=existing.length>=3&&existing.length<=5&&existing.every(name=>macroNames.has(name));
        if(existingValid)line=existing.slice(0,5);
        else {
            // 因果軌道はマクロ事件からのみ投影できる。マクロ事実が不足している場合は、
            // 現在事件/直近ノードで「一見完全な」ストーリーラインをでっち上げるのではなく、モデルの補完を待つ。
            if(macroEntries.length<3)return patches;
            const chosen=[],seen=new Set();
            const take=name=>{if(name&&macroNames.has(name)&&!seen.has(name)){seen.add(name);chosen.push(name);}};
            take(orbit.現在段階);
            for(const [name] of macroEntries)take(name);
            if(chosen.length<3)return patches;
            line=chosen.slice(0,5);
            const story=line.join(' -> ');
            if(orbit.ストーリーライン!==story){orbit.ストーリーライン=story;patches.push({op:'replace',path:'/世界/因果軌道/ストーリーライン',value:story});}
        }
        const nextName=line.find(name=>(stat.世界[PATH].事件[name]||{}).状態==='待发生')||'';
        if(orbit.次ノード!==nextName){orbit.次ノード=nextName;patches.push({op:'replace',path:'/世界/因果軌道/次ノード',value:nextName});}
        const current=line.find(name=>(stat.世界[PATH].事件[name]||{}).状態==='進行中');
        if(current&&(!orbit.現在段階||orbit.現在段階==='待初始化')){orbit.現在段階=current;patches.push({op:'replace',path:'/世界/因果軌道/現在段階',value:current});}
        return patches;
    }
    function timelineState(stat) {
        const state=stat.世界[PATH],events=Object.entries(state.事件||{}),now=worldDateKey(stat.世界.時間);
        const waiting=events.filter(([,e])=>['待发生','進行中'].includes(e.状態));
        const near=events.filter(([,e])=>['当前事件','近期节点'].includes(e.分类));
        const macro=events.filter(([,e])=>e.分类==='宏观节点');
        const macroFuture=macro.filter(([,e])=>e.状態==='待发生');
        const macroOpen=macro.filter(([,e])=>['進行中','待发生'].includes(e.状態));
        const expand=macroFuture.filter(([,e])=>{const t=worldDateKey(e.时间||e.开始时间);return now!==null&&t!==null&&t>=now&&t-now<=7*24;});
        const semantic=waiting.filter(([,e])=>String(e.时间||e.开始时间||'').trim()&&worldDateKey(e.时间||e.开始时间)===null);
        const orbit=stat.世界.因果軌道||{},orbitStages=storyStages(orbit.ストーリーライン);
        const macroNames=new Set(macro.map(([name])=>name));
        const orbitProjectionInvalid=orbitStages.length<3||orbitStages.length>5||orbitStages.some(name=>!macroNames.has(name));
        const orbitMacro=macroFuture.find(([name])=>name===orbit.次ノード);
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
            出典:'マクロイベント図'
        }:null;
        return {
            当前时间锚点:stat.世界.時間,
            因果轨道节点数:orbitStages.length,
            因果轨道需重建:orbitProjectionInvalid,
            需要初始化:near.length===0&&macro.length===0,
            当前活动事件数:waiting.filter(([,e])=>e.状態==='進行中').length,
            近期节点数:near.length,
            宏观节点数:macro.length,
            需要补充远期:macroOpen.length<3,
            下一宏观节点:nextMacro,
            桥接区间:{
                起点:stat.世界.時間,
                终点:nextMacro?.时间||'マクロノード未設定',
                边界事件:nextMacro?.名称||''
            },
            需要展开的宏观节点:expand.map(([名称,e])=>({名称,时间:e.时间||e.开始时间,条件:e.条件,前因:e.前因})),
            需语义复核节点:semantic.map(([名称,e])=>({名称,时间:e.时间||e.开始时间,条件:e.条件,下次检查:e.下次检查})),
            説明:'まず因果軌道、現在の事実、モデルが既に持つ世界/原著知識でマクロ骨格を構築する；世界書が存在する場合は補足的な補正にのみ用いる。その後、現在時刻から次の宏观节点までの間の直近の事件、人物、勢力、伝播だけを展開する。非グレゴリオ暦や作品内時間は作品の意味論で比較し、無理にグレゴリオ暦へ書き換えない。'
        };
    }
    function emptyState() {
        return { 版本:5, 已处理楼层:'', 已处理时间:'', 事件:{}, 人物:{}, 势力地区:{}, 历史:{}, 历史总结:{}, 传播:{}, 最近变化:[], 资产墓碑:{} };
    }
    // 明示的な区切りで分かれた段階だけを分割し、自然言語の段落を複数の事件と推測したり、根拠なく日付を割り当てたりしない。
    function importStory(stat) {
        const orbit=stat.世界.因果軌道||{},events=stat.世界.バックステージ?.事件||{};
        if(Object.values(events).some(e=>e.分类==='主线节点'))return [];
        const stages=storyStages(orbit.ストーリーライン);
        if(stages.length<2||stages.length>30)return [];
        const index=stages.findIndex(n=>n===orbit.次ノード);
        const remaining=index>=0?stages.slice(index):stages;
        let previous='';
        return remaining.filter(name=>!Object.hasOwn(events,name)).map(name=>{
            const value={...copy(RECORDS.事件),説明:name,分类:'主线节点',前因:previous?[previous]:[],条件:previous?'先行ノード「'+previous+'」が本段階へ進むための条件を満たす':'世界設定と本文に基づいてトリガー条件を明確化する',下次检查:'今回の初回スケジューリング'};
            previous=name;
            return {op:'add',path:'/世界/バックステージ/事件/'+name.replace(/~/g,'~0').replace(/\//g,'~1'),value};
        });
    }
    function tokens(path) {
        if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('パッチパスは / で始まる必要があります');
        const parts = path.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
        if (parts.some(p => !p || forbidden.has(p))) throw new Error('パッチパスに不正なキーが含まれています');
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
        const relations=stat?.关系リスト||{},roster=((stat?.設定||{}).単一世界||(stat?.設定||{}).単一世界)?{}:(stat?.世界?.異端レーダー?.名簿||{});
        const events=stat?.世界?.[PATH]?.事件||{},worldTime=String(stat?.世界?.時間||''),currentLocation=String(stat?.世界?.地点||'');
        const formalName=stableNameIn(relations,name),alienName=stableNameIn(roster,name),alien=alienName?roster[alienName]:null;
        const activeAlien=!!(alien&&alien.状態!=='死亡'),deadAlien=!!(alien&&alien.状態==='死亡');
        const liveEntries=Object.entries(events).filter(([,event])=>event&&['待发生','進行中'].includes(event.状态));
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
        const roster=stat?.世界?.異端レーダー?.名簿||{},matched=stableNameIn(roster,name);
        return matched?{名称:matched,记录:roster[matched]}:null;
    }
    function pruneDeadAlienPeople(stat) {
        const people=stat?.世界?.[PATH]?.人物,roster=stat?.世界?.異端レーダー?.名簿;
        if(!plain(people)||!plain(roster))return [];
        const removed=[];
        for(const [alienName,alien] of Object.entries(roster)){
            if(alien?.状態!=='死亡')continue;
            const personName=stableNameIn(people,alienName);
            if(personName){delete people[personName];removed.push(personName);}
        }
        return removed;
    }
    function activeAlienActivityRequirements(stat) {
        if((stat?.設定||{}).単一世界||(stat?.設定||{}).単一世界)return [];
        const roster=stat?.世界?.異端レーダー?.名簿||{},people=stat?.世界?.[PATH]?.人物||{},required=[];
        for(const [alienName,alien] of Object.entries(roster)){
            if(!alien||alien.状態==='死亡')continue;
            const personName=stableNameIn(people,alienName)||alienName,person=people[personName]||{};
            required.push({
                名称:personName,雷达名称:alienName,出典:String(alien.出典||''),経歴:String(alien.経歴||''),陣営:String(alien.陣営||''),職業:String(alien.職業||''),階層:String(alien.階層||''),
                当前活动:{地点:String(person.地点||''),目標:String(person.目标||''),行动:String(person.行动||''),更新时间:String(person.更新时间||'')},
                要求:'今回、この異端の活動再確認を WorldResult.人物 に提出しなければならない；少なくとも空でない地点、目標、行動を与え、更新時間を現在の世界時間どおりに正確に書く。今回すでに死亡が確認された場合は、異端状態を死亡に更新するだけとし、人物活動は提出しない。'
            });
        }
        return required;
    }
    function seedMissingAlienPeople(stat,required) {
        const state=stat?.世界?.[PATH],patches=[];if(!state)return patches;
        const people=state.人物||(state.人物={});
        for(const item of required||[]){
            if(stableNameIn(people,item.名称))continue;
            const relationName=stableNameIn(stat.关系リスト||{},item.雷达名称),relation=relationName?(stat.关系リスト||{})[relationName]:null;
            const seed=normalizeBackendRecord('人物',{所属世界:stat.世界?.名称||'',地点:String(relation?.地点||''),目標:'',行动:'',公开动态:''});
            people[item.名称]=seed;
            patches.push({op:'add',path:pointer(['世界',PATH,'人物',item.名称]),value:copy(seed)});
        }
        return patches;
    }
    function ensureActiveAlienActivity(next,required,acceptedResult,worldTime) {
        const roster=next?.世界?.異端レーダー?.名簿||{},people=next?.世界?.[PATH]?.人物||{},proposals=acceptedResult?.人物||[],missing=[];
        for(const item of required||[]){
            const rosterName=stableNameIn(roster,item.雷达名称||item.名称),alien=rosterName?roster[rosterName]:null;
            if(!alien||alien.状態==='死亡')continue;
            const personName=stableNameIn(people,item.名称)||stableNameIn(people,rosterName),person=personName?people[personName]:null;
            const proposal=proposals.find(p=>nameKey(p.名称)===nameKey(item.名称)||nameKey(p.名称)===nameKey(rosterName));
            const complete=person&&String(person.地点||'').trim()&&String(person.目标||'').trim()&&String(person.行动||'').trim()&&String(person.更新时间||'').trim()===String(worldTime||'').trim();
            if(!proposal||!complete)missing.push(rosterName||item.名称);
        }
        if(missing.length)throw new Error('异端活动未复核：'+missing.join('、')+'；アクティブな異端は毎ターン人物活動を提出し、地点、目標、行動を明記し、更新時間を現在の世界時間どおりに正確に記録しなければならない；死亡済みなら異端状態を死亡に更新する');
    }
    function canonicalizeParts(parts,stat) {
        const p=parts.slice();
        if(p[0]==='世界'&&p[1]===PATH&&p[3]&&['人物','事件','势力地区'].includes(p[2])){
            const pools=[];
            const state=stat?.世界?.[PATH]||{};
            if(plain(state[p[2]]))pools.push(...Object.keys(state[p[2]]));
            if(p[2]==='人物'){
                pools.push(...Object.keys(stat?.关系リスト||{}));
                pools.push(...Object.keys(stat?.世界?.異端レーダー?.名簿||{}));
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
        const seed=category==='事件'?{説明:name}:category==='人物'?{所属世界:stat.世界.名称||'',地点:'',行动:''}:{};
        bucket[name]=normalizeBackendRecord(category,seed);
    }
    function canUpsertMissing(parts,stat) {
        if(parts[0]==='世界'&&parts[1]===PATH){
            if(parts[2]==='历史'||parts[2]==='剧本')return false;
            if(parts.length===4&&['事件','人物','势力地区','传播'].includes(parts[2]))return true;
            if(parts.length===5&&['事件','人物','势力地区','传播'].includes(parts[2])&&!!get(stat,parts.slice(0,4)))return true;
        }
        if(parts[0]==='世界'&&parts[1]==='因果軌道'&&parts[2]==='偏移記録'&&parts.length===4)return true;
        if(parts[0]==='世界'&&['勢力','探索'].includes(parts[1])&&parts.length===3)return true;
        if(parts[0]==='噂'&&['街頭の噂','情報取引','布告と檄文'].includes(parts[1])&&parts.length===3)return true;
        return false;
    }
    function checkRecord(value, template, optional = {}) {
        if(!plain(value))throw new Error('レコードは完全なオブジェクトである必要があり、テキストや配列は使用できません');
        const missing=Object.keys(template).filter(k=>!Object.hasOwn(value,k));
        const unknown=Object.keys(value).filter(k=>!Object.hasOwn(template,k)&&!Object.hasOwn(optional,k));
        if(missing.length||unknown.length)throw new Error('レコードのフィールドが不完全か未対応です：'+(missing.length?'不足 '+missing.join('、'):'')+(unknown.length?'；不明 '+unknown.join('、'):''));
        for (const [key, base] of Object.entries(template)) {
            const v = value[key];
            if (Array.isArray(base) ? !Array.isArray(v) || v.some(x => typeof x !== 'string') : typeof v !== typeof base) throw new Error('レコードフィールドの型が正しくありません：' + key);
        }
    }
    function checkDetails(value, optional) {
        for (const [key, base] of Object.entries(optional)) {
            if (!Object.hasOwn(value,key)) continue;
            const v=value[key];
            if (Array.isArray(base)) {
                if (!Array.isArray(v)) throw new Error('明細はリストである必要があります：'+key);
                if (base.length) v.forEach(item=>checkRecord(item,base[0]));
                else if (v.some(item=>typeof item !== 'string')) throw new Error('明細はテキストのリストである必要があります：'+key);
            } else if (typeof v !== typeof base) throw new Error('明細の型が正しくありません：'+key);
        }
    }
    // LLM は今回実際に変化したフィールドだけを返すことが多い。バックグラウンドのレコード全体は安全な境界内で自動的に既定値を補い/旧値をマージし、
    // 未知のフィールドはそのまま破棄する；任意指定の明細が提供された場合は、完全な明細構造として厳密に検証する。
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
        // v3 → v4：旧「公開摘要」はそのまま因果轨道.現在段階の説明へ移行し、その後で重複する二つの引き継ぎフィールドを削除する。
        const legacySummary=String(state.公开摘要||'').trim();
        if(legacySummary){
            if(!plain(stat.世界.因果軌道))stat.世界.因果軌道={現在段階:'',ストーリーライン:'',次ノード:'',偏移記録:{}};
            stat.世界.因果軌道.現在段階=legacySummary;
        }
        delete state.公开摘要;
        delete state.正文承接;
        // 旧セーブ互換：シミュレーション記録は毎ターンの L0 歴史アンカーに完全に置き換えられた。
        delete state.运行记录;
        state.版本=Math.max(5,Number(state.版本)||0);
        // v5：プログラムが管理する可逆な歴史要約ツリー；モデルが書き込める RECORDS には属さない。
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
        if(raw==='宏观节点')return obviouslyLocalMacro(name,event)?(event?.状态==='進行中'?'当前事件':'近期节点'):'宏观节点';
        if(raw==='当前事件')return '当前事件';
        if(raw==='近期节点')return event?.状态==='進行中'?'当前事件':'近期节点';
        if(raw==='近期事件'||raw==='主线节点'||!EVENT_CATEGORIES.has(raw))return event?.状态==='進行中'?'当前事件':'近期节点';
        return raw;
    }
    function normalizeEventLayers(stat) {
        const events=stat?.世界?.[PATH]?.事件||{},patches=[];
        for(const [name,event] of Object.entries(events)){
            const category=normalizedEventCategory(name,event);
            if(event.分类!==category){
                event.分类=category;
                patches.push({op:'replace',path:'/世界/バックステージ/事件/'+String(name).replace(/~/g,'~0').replace(/\//g,'~1')+'/分类',value:category});
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
                    patches.push({op:'replace',path:'/世界/バックステージ/人物/'+String(personName).replace(/~/g,'~0').replace(/\//g,'~1')+'/关联事件',value:copy(person.关联事件)});
                }
            }
            if(participantsChanged){
                event.参与者=participants;
                patches.push({op:'replace',path:'/世界/バックステージ/事件/'+String(eventName).replace(/~/g,'~0').replace(/\//g,'~1')+'/参与者',value:copy(participants)});
            }
        }
        return patches;
    }
    function repairMacroPredecessors(stat) {
        const state=stat?.世界?.[PATH],orbit=stat?.世界?.因果軌道||{},patches=[]; if(!state)return patches;
        const stages=storyStages(orbit.ストーリーライン).filter(name=>state.事件?.[name]?.分类==='宏观节点'&&state.事件[name].状態!=='已取消');
        for(let i=1;i<stages.length;i++){
            const prev=stages[i-1],name=stages[i],event=state.事件[name],parents=Array.isArray(event.前因)?event.前因:[];
            if(!parents.includes(prev)){
                event.前因=[...parents,prev];
                patches.push({op:'replace',path:'/世界/バックステージ/事件/'+String(name).replace(/~/g,'~0').replace(/\//g,'~1')+'/前因',value:copy(event.前因)});
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
            if(patch.path==='/世界/因果軌道'&&patch.op!=='remove'&&plain(patch.value)){
                for(const key of ['現在段階','ストーリーライン','次ノード']){
                    if(Object.hasOwn(patch.value,key))out.push({op:'add',path:'/世界/因果軌道/'+key,value:copy(patch.value[key])});
                }
                if(plain(patch.value.偏移記録))for(const [name,value] of Object.entries(patch.value.偏移記録)){
                    out.push({op:'add',path:'/世界/因果軌道/偏移記録/'+esc(name),value:copy(value)});
                }
                continue;
            }
            if(patch.path==='/世界/因果軌道/偏移記録'&&patch.op!=='remove'&&plain(patch.value)){
                for(const [name,value] of Object.entries(patch.value))out.push({op:'add',path:'/世界/因果軌道/偏移記録/'+esc(name),value:copy(value)});
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
    // 世界叙事・世界経済・共有資産台帳を許可；プレイヤー属性、保有残高、報酬付与、時計は依然として書込み許可リスト外。
    function allowed(parts, stat) {
        const [a,b,c,d] = parts;
        if (a === '世界' && b === PATH) {
            if (c === '剧本') return false;
            if (!Object.hasOwn(RECORDS, c) || !d) return false;
            if (c === '历史') return parts.length === 4;
            return parts.length === 4 || (parts.length === 5 && (Object.hasOwn(RECORDS[c], parts[4]) || Object.hasOwn(DETAILS[c],parts[4])));
        }
        if (a === '世界' && b === '因果軌道') {
            if (['現在段階','ストーリーライン','次ノード'].includes(c)) return parts.length === 3;
            return !(stat.設定 || {}).世界超安定 && c === '偏移記録' && parts.length === 4;
        }
        if (a === '世界' && b === '通貨') return parts.length === 3 && Object.hasOwn(CURRENCY_FIELDS,c);
        if (a === '世界' && b === '暦法') return parts.length === 3 && Object.hasOwn(CALENDAR_FIELDS,c);
        if (a === '世界' && ['勢力','探索'].includes(b)) return parts.length === 3 || (parts.length === 4 && Object.hasOwn(b === '勢力' ? {実力:0,領地:0,説明:0,声望:0} : {リスク:0,探索度:0,説明:0,隠された真実:0},d));
        if (a === '世界' && b === '異端レーダー') return parts.length === 5 && c === '名簿' && parts[4] === '状態' && !(stat.設定 || {}).単一世界;
        if (a === '噂' && ['街頭の噂','情報取引','布告と檄文'].includes(b)) return parts.length === 3;
        if (a === '资产') return parts.length === 2 && !!b;
        // 変更を許可するのは変数AIが既に確立した NPC のみ；世界エンジンによる「关系列表」オブジェクトの新規作成は禁止。
        if (a === '関係リスト') return parts.length === 3 && RELATION_SYNC_KEYS.has(c) && !!get(stat,[a,b]);
        if (a === '任務') return parts.length === 4 && ['リスト','インスタンス実績'].includes(b) && d === '状態' && !!get(stat,[a,b,c]);
        return false;
    }
    const CURRENCY_FIELDS={体系:'',購買力基準:'',経済変動:''};
    const CALENDAR_FIELDS={名称:'',月日数:[],閏年規則:''};
    const QUALITY_RANKS=['F','E','D','C','B','A','S','SS','SSS'];
    const RUMOR_CREDIBILITY=['酒話','疑わしい','信頼できるかも'];
    const INTEL_RATINGS=[...QUALITY_RANKS,'日常','戦略'];
    function normalizeRumorCredibility(value) {
        const raw=String(value??'').trim();
        if(RUMOR_CREDIBILITY.includes(raw))return raw;
        if(/^(?:可信|属实|真实|确实|高|较高|很高|基本属实)$/.test(raw))return '或许可信';
        if(/^(?:不可信|虚假|谣言|低|较低|很低|纯属谣言)$/.test(raw))return '酒话';
        return '疑わしい';
    }
    const EXISTING = {
        勢力: {実力:'F',領地:'',説明:'',声望:0}, 探索:{リスク:'F',探索度:0,説明:'',隠された真実:''},
        偏移記録:{説明:'',誘発者:'',影響度:0},
        街頭の噂:{出典:'',内容:'',信頼度:''}, 情報取引:{売り手:'',情報評価:'',要約:'',要求価格:'',真の内幕:''},
        布告と檄文:{発布者:'',内容:'',掲示位置:''},
        名簿:{出典:'',経歴:'',陣営:'',職業:'',階層:'',状態:''}
    };
    const RELATION_RANKS=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'];
    const RELATION_QUALITIES=['F','E','D','C','B','A','S','SS','SSS'];
    const RELATION_SYNC_FIELDS={
        登場:false,種族:'',身分:[],職業:{},階層:'Ⅰ',HP:0,THP:0,EP:0,
        状態:{},血統:{},装備:{},技能:{},形態庫:{},現在形態:{},
        性格:'',好み:'',外見:'',服装:'',仲間:false,好感度:0,態度:'',背景:''
    };
    const RELATION_SYNC_KEYS=new Set(Object.keys(RELATION_SYNC_FIELDS));
    const RELATION_COMPONENT_FIELDS=new Set(['職業','状態','血統','装備','技能','形態庫']);
    // キャラクターの戦闘構成を恒久的に変えるフィールドのみ監査リスト入りを必須とする；状态/当前形态 およびプロフィール文は真の物語変化により通常どおり同期できる。
    const RELATION_AUDIT_ONLY_FIELDS=new Set(['職業','血統','装備','技能','形態庫']);
    const RELATION_ATTR_KEYS=['筋力','敏捷','体力','精神','魅力','ATK','DEF','MATK','MDEF','AP'];
    const RELATION_ATTR5=['筋力','敏捷','体力','精神','魅力'];
    const NPC_BUILD_AUDIT_LIMIT=4;
    const WORLD_RESULT_LISTS=['事件','人物','势力地区','历史','传播','勢力','探索','资产','异端','关系'];
    const WORLD_RESULT_RUMORS=['街頭の噂','情報取引','布告と檄文'];
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
    const FACTION_RESULT_SCHEMA=namedEntitySchema(EXISTING.勢力);
    FACTION_RESULT_SCHEMA.properties.実力={type:'string',enum:copy(QUALITY_RANKS)};
    FACTION_RESULT_SCHEMA.properties.声望={type:'number',minimum:-5000,maximum:10000};
    const EXPLORATION_RESULT_SCHEMA=namedEntitySchema(EXISTING.探索);
    EXPLORATION_RESULT_SCHEMA.properties.リスク={type:'string',enum:copy(QUALITY_RANKS)};
    EXPLORATION_RESULT_SCHEMA.properties.探索度={type:'number',minimum:0,maximum:100};
    const EVENT_RESULT_SCHEMA=namedEntitySchema({...RECORDS.事件,...MODEL_DETAILS.事件});
    EVENT_RESULT_SCHEMA.properties.状态={type:'string',enum:['待发生','進行中','已完成','已取消']};
    EVENT_RESULT_SCHEMA.properties.分类={type:'string',enum:Array.from(EVENT_CATEGORIES)};
    const OFFSET_RESULT_SCHEMA=namedEntitySchema(EXISTING.偏移記録);
    OFFSET_RESULT_SCHEMA.properties.影響度={type:'number',minimum:-100,maximum:120};
    const STREET_RUMOR_RESULT_SCHEMA=namedEntitySchema(EXISTING.街頭の噂,['更新','移除','撤销本轮'],['出典','内容','信頼度']);
    STREET_RUMOR_RESULT_SCHEMA.properties.信頼度={type:'string',enum:copy(RUMOR_CREDIBILITY)};
    const INTEL_TRADE_RESULT_SCHEMA=namedEntitySchema(EXISTING.情報取引,['更新','移除','撤销本轮'],['売り手','情報評価','要約','要求価格','真の内幕']);
    INTEL_TRADE_RESULT_SCHEMA.properties.情報評価={type:'string',enum:copy(INTEL_RATINGS)};
    const relationQualitySchema=()=>({type:'string',enum:copy(RELATION_QUALITIES)});
    const relationTagsSchema=()=>({type:'array',maxItems:24,items:{type:'string'}});
    const relationStringMapSchema=()=>({type:'object',additionalProperties:{type:'string'}});
    const relationRawAttrSchema=(requireFive=false,allowNumbers=false)=>{
        const properties={};
        for(const key of RELATION_ATTR_KEYS)properties[key]=allowNumbers?{anyOf:[relationQualitySchema(),{type:'number'}]}:relationQualitySchema();
        return {type:'object',additionalProperties:false,properties,required:requireFive?copy(RELATION_ATTR5):undefined};
    };
    const RELATION_SKILL_SCHEMA={type:'object',additionalProperties:false,required:['品質','タイプ','タグ','効果','説明','消費'],properties:{
        品質:relationQualitySchema(),タイプ:{type:'integer',minimum:0,maximum:2},タグ:relationTagsSchema(),
        効果:relationStringMapSchema(),説明:{type:'string'},消費:{type:'string'}
    }};
    const RELATION_OCCUPATION_SCHEMA={type:'object',additionalProperties:false,required:['タイプ','特性','出典'],properties:{
        タイプ:{type:'string',enum:['戦闘','生活','支援']},特性:relationTagsSchema(),出典:{type:'string'}
    }};
    const RELATION_BLOODLINE_SCHEMA={type:'object',additionalProperties:false,required:['品質','タグ','原始属性','効果','説明'],properties:{
        品質:relationQualitySchema(),タグ:relationTagsSchema(),原始属性:relationRawAttrSchema(true,false),
        効果:relationStringMapSchema(),説明:{type:'string'}
    }};
    const RELATION_EQUIP_SCHEMA={type:'object',additionalProperties:false,required:['品質','タイプ','タグ','原始属性','効果','説明','消費','状態'],properties:{
        品質:relationQualitySchema(),タイプ:{type:'integer',minimum:0,maximum:8},タグ:relationTagsSchema(),
        原始属性:relationRawAttrSchema(false,false),効果:relationStringMapSchema(),説明:{type:'string'},消費:{type:'string'},
        状態:{type:'integer',minimum:0,maximum:2}
    }};
    const RELATION_STATUS_SCHEMA={type:'object',additionalProperties:false,required:['タイプ','品質','持続','出典','原始属性','効果'],properties:{
        タイプ:{type:'string',enum:['バフ','デバフ','特殊']},品質:relationQualitySchema(),持続:{type:'string'},出典:{type:'string'},
        原始属性:relationRawAttrSchema(false,true),効果:{type:'string'}
    }};
    const RELATION_FORM_SCHEMA={type:'object',additionalProperties:false,required:['階層','消費','冷却','状態','タグ','原始属性','効果','技能','説明'],properties:{
        階層:{type:'string',enum:copy(RELATION_RANKS)},消費:{type:'string'},冷却:{type:'string'},状態:{type:'string'},タグ:relationTagsSchema(),
        原始属性:relationRawAttrSchema(true,false),効果:relationStringMapSchema(),
        技能:{type:'object',additionalProperties:copy(RELATION_SKILL_SCHEMA),maxProperties:8},説明:{type:'string'}
    }};
    const RELATION_CURRENT_FORM_SCHEMA={type:'object',additionalProperties:false,required:['激活','名称'],properties:{激活:{type:'boolean'},名称:{type:'string'}}};
    const ASSET_RESULT_SCHEMA={
        type:'object',additionalProperties:false,required:['名称'],properties:{
            名称:{type:'string',minLength:1},操作:{type:'string',enum:['更新','移除','撤销本轮']},
            所属対象:{type:'array',items:{type:'string',minLength:1},maxItems:12},タイプ:{type:'string',enum:copy(WORLD_ASSET_TYPES)},主体規模:{type:'number',minimum:1,maximum:10},完全度:{type:'number',minimum:0,maximum:100},状態:{type:'string'},
            エネルギー:{anyOf:[{type:'object',additionalProperties:false,properties:{タイプ:{type:'string'},現在:{type:'number'},上限:{type:'number'},説明:{type:'string'}}},{type:'null'}]},
            消耗ユニット:{type:'object',additionalProperties:{anyOf:[{type:'object',additionalProperties:false,properties:{残量:{type:'number'},上限:{type:'number'},加成:{type:'array',items:{type:'string'}}}},{type:'null'}]}},
            建設シーケンス:{type:'object',additionalProperties:{anyOf:[{type:'object',additionalProperties:false,properties:{段階:{type:'string',enum:['基礎','上級','専門','最上級','禁忌']},機能:{type:'string'},加成:{type:'array',items:{type:'string'}},産出:{type:'string'}}},{type:'null'}]}},
            駐留人員:{type:'object',additionalProperties:{anyOf:[{type:'string'},{type:'null'}]}},
            待機イベント:{type:'array',items:{type:'string'}}
        }
    };
    const WORLD_RESULT_SCHEMA={
        type:'object',
        additionalProperties:false,
        required:['要約'],
        properties:{
            要約:{type:'string'},
            通貨:{type:'object',additionalProperties:false,properties:{
                体系:{type:'string'},
                購買力基準:{type:'string'},
                経済変動:{type:'string'}
            }},
            暦法:{type:'object',additionalProperties:false,properties:{
                名称:{type:'string'},
                月日数:{type:'array',maxItems:24,items:{type:'integer',minimum:1,maximum:99}},
                閏年規則:{type:'string'}
            }},
            事件:{type:'array',maxItems:30,items:EVENT_RESULT_SCHEMA},
            人物:{type:'array',maxItems:25,items:namedEntitySchema({...RECORDS.人物,...MODEL_DETAILS.人物})},
            势力地区:{type:'array',maxItems:20,items:namedEntitySchema({...RECORDS.势力地区,...MODEL_DETAILS.势力地区})},
            历史:{type:'array',maxItems:12,items:namedEntitySchema(RECORDS.历史,['更新','撤销本轮'])},
            传播:{type:'array',maxItems:20,items:namedEntitySchema({...RECORDS.传播,...MODEL_DETAILS.传播},['更新','移除','撤销本轮'])},
            因果:{type:'object',additionalProperties:false,properties:{
                現在段階:{type:'string'},
                宏观顺序:{type:'array',minItems:0,maxItems:5,items:{type:'string'}},
                偏移記録:{type:'array',maxItems:10,items:OFFSET_RESULT_SCHEMA}
            }},
            勢力:{type:'array',maxItems:15,items:FACTION_RESULT_SCHEMA},
            探索:{type:'array',maxItems:20,items:EXPLORATION_RESULT_SCHEMA},
            资产:{type:'array',maxItems:20,items:ASSET_RESULT_SCHEMA},
            异端:{type:'array',maxItems:15,items:{type:'object',additionalProperties:false,required:['名称','状態'],properties:{名称:{type:'string',minLength:1},操作:{type:'string',enum:['更新','撤销本轮']},状態:{type:'string',enum:['活動中','死亡']}}}},
            噂:{type:'object',additionalProperties:false,properties:{
                街頭の噂:{type:'array',maxItems:6,items:STREET_RUMOR_RESULT_SCHEMA},
                情報取引:{type:'array',maxItems:6,items:INTEL_TRADE_RESULT_SCHEMA},
                布告と檄文:{type:'array',maxItems:6,items:namedEntitySchema(EXISTING.布告と檄文,['更新','移除','撤销本轮'],['発布者','内容','掲示位置'])}
            }},
            关系:{type:'array',maxItems:25,items:{type:'object',additionalProperties:false,required:['名称'],properties:{
                名称:{type:'string',minLength:1},操作:{type:'string',enum:['更新','撤销本轮']},
                登場:{type:'boolean'},種族:{type:'string'},身分:relationTagsSchema(),
                職業:{type:'object',additionalProperties:copy(RELATION_OCCUPATION_SCHEMA),maxProperties:12},
                階層:{type:'string',enum:copy(RELATION_RANKS)},HP:{type:'number',minimum:0,maximum:99999999},
                THP:{type:'number',minimum:0,maximum:99999999},EP:{type:'number',minimum:0,maximum:99999999},
                状態:{type:'object',additionalProperties:copy(RELATION_STATUS_SCHEMA),maxProperties:12},
                血統:{type:'object',additionalProperties:copy(RELATION_BLOODLINE_SCHEMA),maxProperties:2},
                装備:{type:'object',additionalProperties:copy(RELATION_EQUIP_SCHEMA),maxProperties:6},
                技能:{type:'object',additionalProperties:copy(RELATION_SKILL_SCHEMA),maxProperties:4},
                形態庫:{type:'object',additionalProperties:copy(RELATION_FORM_SCHEMA),maxProperties:4},
                現在形態:copy(RELATION_CURRENT_FORM_SCHEMA),
                性格:{type:'string'},好み:{type:'string'},外見:{type:'string'},服装:{type:'string'},
                仲間:{type:'boolean'},好感度:{type:'number',minimum:-100,maximum:100},態度:{type:'string'},背景:{type:'string'}
            }}}
        }
    };
    function sampleForWorldResultList(key) {
        if(key==='事件')return {...RECORDS.事件,...MODEL_DETAILS.事件};
        if(key==='人物')return {...RECORDS.人物,...MODEL_DETAILS.人物};
        if(key==='势力地区')return {...RECORDS.势力地区,...MODEL_DETAILS.势力地区};
        if(key==='历史')return RECORDS.历史;
        if(key==='传播')return {...RECORDS.传播,...MODEL_DETAILS.传播};
        if(key==='勢力')return EXISTING.勢力;
        if(key==='探索')return EXISTING.探索;
        if(key==='异端')return EXISTING.名簿;
        return {};
    }
    function detailTextField(sample) {
        for(const key of ['名称','事实','行动','影响','内容','説明','问题','对象','地点']){
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
            if(fields.has('信頼度')&&!Object.hasOwn(raw,'信頼度')){
                const rumorClass=String(raw.分类||'').trim();
                raw.信頼度=({'事实':'信頼できるかも','猜测':'疑わしい','谣言':'酒話','酒話':'酒話','疑わしい':'疑わしい','信頼できるかも':'信頼できるかも'})[rumorClass]||'疑わしい';
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
        const map=new Map(),stringFields=['タイプ','状態'],numberFields=['主体規模','完全度'];
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
                    for(const key of ['残量','上限'])if(Object.hasOwn(raw,key)){const n=Number(raw[key]);if(Number.isFinite(n))item[key]=n;}
                    if(Array.isArray(raw.加成))item.加成=raw.加成.filter(x=>typeof x==='string');
                }else{
                    if(Object.hasOwn(raw,'段階'))item.段階=String(raw.段階||'');
                    for(const key of ['機能','産出'])if(Object.hasOwn(raw,key))item[key]=String(raw[key]??'');
                    if(Array.isArray(raw.加成))item.加成=raw.加成.filter(x=>typeof x==='string');
                }
                out[name]=item;
            }
            return out;
        };
        const mergeItem=(previous,item)=>{
            if(!previous)return item;
            const merged=Object.assign({},previous,item);
            for(const field of ['消耗ユニット','建設シーケンス','駐留人員']){
                if(plain(previous[field])&&plain(item[field]))merged[field]=Object.assign({},previous[field],item[field]);
            }
            if(plain(previous.エネルギー)&&plain(item.エネルギー))merged.エネルギー=Object.assign({},previous.エネルギー,item.エネルギー);
            return merged;
        };
        for(const source of sourceList){
            if(!plain(source))continue;
            const name=String(source.名称??source.name??'').trim();if(!name||forbidden.has(name))continue;
            const operation=['更新','移除','撤销本轮'].includes(source.操作)?source.操作:'更新';
            const id=nameKey(name);
            if(operation==='撤销本轮'){map.delete(id);continue;}
            const item={名称:name,操作:operation};
            if(Object.hasOwn(source,'所属対象'))item.所属対象=normalizeOwners(source.所属対象);
            for(const field of stringFields)if(Object.hasOwn(source,field))item[field]=String(source[field]??'');
            for(const field of numberFields)if(Object.hasOwn(source,field)){const n=Number(source[field]);item[field]=Number.isFinite(n)?n:source[field];}
            if(Object.hasOwn(source,'エネルギー')){
                if(source.エネルギー===null)item.エネルギー=null;
                else if(plain(source.エネルギー)){
                    item.エネルギー={};
                    for(const field of ['タイプ','説明'])if(Object.hasOwn(source.エネルギー,field))item.エネルギー[field]=String(source.エネルギー[field]??'');
                    for(const field of ['現在','上限'])if(Object.hasOwn(source.エネルギー,field)){const n=Number(source.エネルギー[field]);if(Number.isFinite(n))item.エネルギー[field]=n;}
                }
            }
            if(Object.hasOwn(source,'消耗ユニット'))item.消耗ユニット=normalizeMap(source.消耗ユニット,'unit');
            if(Object.hasOwn(source,'建設シーケンス'))item.建設シーケンス=normalizeMap(source.建設シーケンス,'build');
            if(Object.hasOwn(source,'駐留人員'))item.駐留人員=normalizeMap(source.駐留人員,'person');
            if(Object.hasOwn(source,'待機イベント'))item.待機イベント=Array.isArray(source.待機イベント)?source.待機イベント.filter(x=>typeof x==='string'):[];
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
                if(['登場','仲間'].includes(key))item[key]=typeof raw==='boolean'?raw:!!raw;
                else if(['HP','THP','EP','好感度'].includes(key)){const n=Number(raw);item[key]=Number.isFinite(n)?n:raw;}
                else if(key==='身分')item[key]=Array.isArray(raw)?raw.filter(x=>typeof x==='string'):raw;
                else if(RELATION_COMPONENT_FIELDS.has(key)||key==='現在形態')item[key]=copy(raw);
                else item[key]=raw==null?'':String(raw);
            }
            const id=nameKey(name),prev=map.get(id);
            if(item.操作==='撤销本轮'){map.delete(id);continue;}
            map.set(id,prev?Object.assign(prev,item):item);
        }
        return Array.from(map.values());
    }
    function normalizeWorldResult(value) {
        if(!plain(value))throw new Error('WorldResult は JSON オブジェクトでなければならない');
        const result={要約:String(value.要約??value.summary??'世界は進行を続ける')};
        const legacyStage=(Object.hasOwn(value,'公开摘要')||Object.hasOwn(value,'public_summary'))?String(value.公开摘要??value.public_summary??'').trim():'';
        result.通貨={};
        if(plain(value.通貨)){
            for(const key of Object.keys(CURRENCY_FIELDS))if(Object.hasOwn(value.通貨,key))result.通貨[key]=String(value.通貨[key]??'');
        }
        result.暦法={};
        if(plain(value.暦法)){
            if(Object.hasOwn(value.暦法,'名称'))result.暦法.名称=String(value.暦法.名称??'');
            if(Array.isArray(value.暦法.月日数))result.暦法.月日数=value.暦法.月日数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24);
            if(Object.hasOwn(value.暦法,'閏年規則'))result.暦法.閏年規則=String(value.暦法.閏年規則??'');
        }
        for(const key of ['事件','人物','势力地区','历史','传播','勢力','探索']){
            const operations=(key==='传播')?['更新','移除','撤销本轮']:['更新','撤销本轮'];
            result[key]=normalizeNamedResultList(value[key],sampleForWorldResultList(key),operations);
        }
        result.资产=normalizeAssetResultList(value.资产);
        result.异端=(Array.isArray(value.异端)?value.异端:[]).filter(plain).map(item=>({
            名称:String(item.名称||'').trim(),
            操作:item.操作==='撤销本轮'?'撤销本轮':'更新',
            状態:['活動中','死亡'].includes(item.状態)?item.状態:''
        })).filter(item=>item.名称&&item.状態);
        result.因果={};
        const causal=plain(value.因果)?value.因果:{};
        if(Object.hasOwn(causal,'現在段階'))result.因果.現在段階=String(causal.現在段階||'');
        else if(legacyStage)result.因果.現在段階=legacyStage;
        if(Array.isArray(causal.宏观顺序))result.因果.宏观顺序=causal.宏观顺序.map(x=>String(x||'').trim()).filter(Boolean).slice(0,5);
        result.因果.偏移記録=normalizeNamedResultList(causal.偏移記録,EXISTING.偏移記録,['更新','撤销本轮']);
        result.噂={};
        const rumors=plain(value.噂)?value.噂:{};
        for(const key of WORLD_RESULT_RUMORS){
            let list=normalizeNamedResultList(rumors[key],EXISTING[key],['更新','移除','撤销本轮']);
            if(key==='街頭の噂'){
                for(const item of list)if(Object.hasOwn(item,'信頼度'))item.信頼度=normalizeRumorCredibility(item.信頼度);
                const seen=new Set(),deduped=[];
                for(const item of list){
                    const signature=String(item.内容||'').replace(/\s+/g,' ').trim();
                    if(item.操作==='更新'&&signature&&seen.has(signature))continue;
                    if(item.操作==='更新'&&signature)seen.add(signature);
                    deduped.push(item);
                }
                list=deduped;
            }
            result.噂[key]=list;
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
        const a=base?normalizeWorldResult(base):normalizeWorldResult({要約:''});
        const b=normalizeWorldResult(incoming);
        const result={要約:[a.要約,b.要約].filter(Boolean).filter((x,i,list)=>list.indexOf(x)===i).join('；')};
        result.通貨=Object.assign({},a.通貨||{},b.通貨||{});
        result.暦法=Object.assign({},a.暦法||{},b.暦法||{});
        for(const key of ['事件','人物','势力地区','历史','传播','勢力','探索','资产','异端','关系'])result[key]=mergeNamedResultLists(a[key],b[key]);
        result.因果={
            偏移記録:mergeNamedResultLists(a.因果?.偏移記録,b.因果?.偏移記録)
        };
        if(Object.hasOwn(b.因果||{},'現在段階'))result.因果.現在段階=b.因果.現在段階;
        else if(Object.hasOwn(a.因果||{},'現在段階'))result.因果.現在段階=a.因果.現在段階;
        if(Array.isArray(b.因果?.宏观顺序)&&b.因果.宏观顺序.length)result.因果.宏观顺序=copy(b.因果.宏观顺序);
        else if(Array.isArray(a.因果?.宏观顺序))result.因果.宏观顺序=copy(a.因果.宏观顺序);
        result.噂={};
        for(const key of WORLD_RESULT_RUMORS)result.噂[key]=mergeNamedResultLists(a.噂?.[key],b.噂?.[key]);
        return result;
    }
    function worldResultFragments(value) {
        const result=normalizeWorldResult(value),fragments=[];
        const push=(label,body)=>fragments.push({label,result:Object.assign({要約:''},body)});
        for(const [key,value] of Object.entries(result.通貨||{}))push('通貨/'+key,{通貨:{[key]:copy(value)}});
        for(const [key,value] of Object.entries(result.暦法||{}))push('暦法/'+key,{暦法:{[key]:copy(value)}});
        for(const key of ['事件','人物','势力地区','历史','传播','勢力','探索','资产','异端']){
            for(const item of result[key]||[])push(key+'/'+item.名称,{[key]:[copy(item)]});
        }
        if(Object.hasOwn(result.因果||{},'現在段階'))push('因果/現在段階',{因果:{現在段階:result.因果.現在段階}});
        if(Array.isArray(result.因果?.宏观顺序)&&result.因果.宏观顺序.length)push('因果/宏观顺序',{因果:{宏观顺序:copy(result.因果.宏观顺序)}});
        for(const item of result.因果?.偏移記録||[])push('因果/偏移記録/'+item.名称,{因果:{偏移記録:[copy(item)]}});
        // 容量制約は最終カテゴリに対するもの；追加と削除は必ず同時に検収し、分割して別操作に置き換えてはならない。
        for(const key of WORLD_RESULT_RUMORS)if(result.噂?.[key]?.length)push('噂/'+key,{噂:{[key]:copy(result.噂[key])}});
        for(const item of result.关系||[])push('关系/'+item.名称,{关系:[copy(item)]});
        return {要約:result.要約,fragments};
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
        let staged=accepted?mergeWorldResults(accepted,{要約:split.摘要}):normalizeWorldResult({要約:split.摘要});
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
            rejected:pending.map(unit=>({片段:unit.label,原因:String(unit.error?.message||unit.error||'業務フラグメントが検証を通過しませんでした')}))
        };
    }
    // 初回リクエストと訂正は同一の納品基準を共有し、モデルが失敗した後にマクロ骨格の必須要件を知る事態を避ける。
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
            for(const name of match[1].split('、').filter(Boolean))plan.push('NPC构筑审计/'+name+'：只在 WorldResult.关系 中补齐该既有NPC至少一个列出的构筑缺口；优先补职业/血統/装備/技能/状態/形态或缺失档案字段，不得新建NPC、改HP_MAX/EP_MAX或输出真属性/最终属性。');
        }else if(message&&!rejected.length){
            plan.push('整体校验：'+message);
        }
        return Array.from(new Set(plan.filter(Boolean)));
    }
    // UI とモデルリクエストは同じ重複排除ビューを共有；元のフラグメントはログに保持され、未知のエラーは切り詰めない。
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
        if(rejected?.length)reasons.push('一部の業務フラグメントが通過しませんでした（'+rejected.length+'件）');
        if(globalError)reasons.push(String(globalError.message||globalError));
        const error=new Error(reasons.join('；')||'WorldResult が業務検証を通過しませんでした');
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
                    リスク:String(child?.リスク||'F'),
                    探索度:Number(child?.探索度)||0,
                    説明:'旧版の子区域探索記録から統合。全体ランドマークの説明は追記が必要',
                    隠された真実:''
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
        if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))throw new Error(label+' は string[] でなければならない');
    }
    function validateStringMap(value,label) {
        if(!plain(value)||Object.values(value).some(x=>typeof x!=='string'))throw new Error(label+' は string map でなければならない');
    }
    function validateQuality(value,label) {
        if(!RELATION_QUALITIES.includes(String(value||'')))throw new Error(label+' で許可されるのは '+RELATION_QUALITIES.join('/'));
    }
    function validateRawAttributes(value,label,{requireFive=false,allowNumbers=false}={}) {
        if(!plain(value))throw new Error(label+' はオブジェクトでなければならない');
        for(const key of Object.keys(value)){
            if(!RELATION_ATTR_KEYS.includes(key))throw new Error(label+' に不正な属性が含まれています '+key);
            if(allowNumbers&&typeof value[key]==='number'&&Number.isFinite(value[key])){
                if(value[key]===0)throw new Error(label+'.'+key+' の数値0は省略すること。ZOD クリーニング後に無効な差分が生じる');
                continue;
            }
            validateQuality(value[key],label+'.'+key);
        }
        if(requireFive)for(const key of RELATION_ATTR5)if(!Object.hasOwn(value,key))throw new Error(label+' に基礎属性が欠けています '+key);
    }
    function validateComponentShape(field,value,name='NPC') {
        if(!plain(value))throw new Error(name+' '+field+' はオブジェクトでなければならない');
        const assertFields=(item,keys,label)=>{for(const key of keys)if(!Object.hasOwn(item,key))throw new Error(label+' にフィールドが欠けています '+key);};
        for(const [entryName,item] of Object.entries(value)){
            const label=name+' '+field+'.'+entryName;
            if(!entryName||!plain(item))throw new Error(label+' は完全なオブジェクトでなければならない');
            if(field==='職業'){
                assertFields(item,['タイプ','特性','出典'],label);
                if(!['戦闘','生活','支援'].includes(item.タイプ))throw new Error(label+' の タイプ が無効');
                validateStringArray(item.特性,label+'.特性');
                if(typeof item.出典!=='string')throw new Error(label+'.出典 は string でなければならない');
            }else if(field==='技能'){
                assertFields(item,['品質','タイプ','タグ','効果','説明','消費'],label);
                validateQuality(item.品質,label+'.品質');
                if(!Number.isInteger(item.タイプ)||item.タイプ<0||item.タイプ>2)throw new Error(label+'.タイプ は 0/1/2 のいずれか');
                validateStringArray(item.タグ,label+'.タグ');validateStringMap(item.効果,label+'.効果');
                if(typeof item.説明!=='string'||typeof item.消費!=='string')throw new Error(label+' 説明/消費 は string でなければならない');
            }else if(field==='血統'){
                assertFields(item,['品質','タグ','原始属性','効果','説明'],label);
                validateQuality(item.品質,label+'.品質');validateStringArray(item.タグ,label+'.タグ');
                validateRawAttributes(item.原始属性,label+'.原始属性',{requireFive:true});validateStringMap(item.効果,label+'.効果');
                if(typeof item.説明!=='string')throw new Error(label+'.説明 は string でなければならない');
            }else if(field==='装備'){
                assertFields(item,['品質','タイプ','タグ','原始属性','効果','説明','消費','状態'],label);
                validateQuality(item.品質,label+'.品質');
                if(!Number.isInteger(item.タイプ)||item.タイプ<0||item.タイプ>8)throw new Error(label+'.タイプ は 0~8 のいずれか');
                if(!Number.isInteger(item.状態)||item.状態<0||item.状態>2)throw new Error(label+'.状態 は 0/1/2 のいずれか');
                validateStringArray(item.タグ,label+'.タグ');validateRawAttributes(item.原始属性,label+'.原始属性');
                validateStringMap(item.効果,label+'.効果');
                if(typeof item.説明!=='string'||typeof item.消費!=='string')throw new Error(label+' 説明/消費 は string でなければならない');
            }else if(field==='状態'){
                assertFields(item,['タイプ','品質','持続','出典','原始属性','効果'],label);
                if(!['バフ','デバフ','特殊'].includes(item.タイプ))throw new Error(label+'.タイプ が無効');
                validateQuality(item.品質,label+'.品質');validateRawAttributes(item.原始属性,label+'.原始属性',{allowNumbers:true});
                if(typeof item.持続!=='string'||typeof item.出典!=='string'||typeof item.効果!=='string')throw new Error(label+' 持続/出典/効果 は string でなければならない');
            }else if(field==='形態庫'){
                assertFields(item,['階層','消費','冷却','状態','タグ','原始属性','効果','技能','説明'],label);
                if(!RELATION_RANKS.includes(item.階層))throw new Error(label+'.階層 が無効');
                validateStringArray(item.タグ,label+'.タグ');validateRawAttributes(item.原始属性,label+'.原始属性',{requireFive:true});
                validateStringMap(item.効果,label+'.効果');
                for(const key of ['消費','冷却','状態','説明'])if(typeof item[key]!=='string')throw new Error(label+'.'+key+' は string でなければならない');
                validateComponentShape('技能',item.技能,label);
            }
        }
    }
    function validateRelationSyncValue(field,value,npc,name='NPC') {
        if(field==='登場'||field==='仲間'){if(typeof value!=='boolean')throw new Error(name+' '+field+' は boolean でなければならない');return;}
        if(['種族','性格','好み','外見','服装','態度','背景'].includes(field)){if(typeof value!=='string')throw new Error(name+' '+field+' は string でなければならない');return;}
        if(field==='身分'){validateStringArray(value,name+' 身分');return;}
        if(field==='階層'){if(!RELATION_RANKS.includes(value))throw new Error(name+' 階層 で許可されるのは '+RELATION_RANKS.join('/'));return;}
        if(RELATION_COMPONENT_FIELDS.has(field)){validateComponentShape(field,value,name);return;}
        if(field==='現在形態'){
            if(!plain(value)||typeof value.激活!=='boolean'||typeof value.名称!=='string')throw new Error(name+' 現在形態 は {激活:boolean,名称:string} でなければならない');
            return;
        }
        if(['HP','THP','EP','好感度'].includes(field)){
            if(typeof value!=='number'||!Number.isFinite(value))throw new Error(name+' '+field+' は有効な数値でなければならない');
            if(field==='好感度'&&(value<-100||value>100))throw new Error(name+' 好感度 の範囲は -100~100');
            if(field!=='好感度'&&value<0)throw new Error(name+' '+field+' は0未満にできない');
            if(field==='HP'&&Number.isFinite(Number(npc?.HP_MAX))&&value>Number(npc.HP_MAX))throw new Error(name+' HP は HP_MAX を超えられない');
            if(field==='EP'&&Number.isFinite(Number(npc?.EP_MAX))&&value>Number(npc.EP_MAX))throw new Error(name+' EP は EP_MAX を超えられない');
        }
    }
    function materializeRelationComponent(field,value) {
        const out=copy(value);
        if(['血統','装備','状態','形態庫'].includes(field)&&plain(out)){
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

    const ASSET_DEFAULTS={所属対象:[],タイプ:'',主体規模:1,完全度:100,状態:'',建設シーケンス:{},駐留人員:{},待機イベント:[]};
    const ASSET_ENERGY_DEFAULTS={タイプ:'',現在:0,上限:0,説明:''};
    const ASSET_UNIT_DEFAULTS={残量:0,上限:0,加成:[]};
    const ASSET_BUILD_DEFAULTS={段階:'基礎',機能:'',加成:[],産出:'',次回産出日:'',次回産出游日:0};
    function assertWorldAssetScope(item,isNew=false) {
        if(!isNew)return;
        const type=String(item?.タイプ||'').trim(),name=String(item?.名称||'').trim();
        if(!WORLD_ASSET_TYPE_SET.has(type))throw new Error('新規アセットの タイプ が不正：'+(name||'名称未設定')+'；资产 に許可されるのは 固定地产・大型载具・要塞 のみで、通常の道具/材料/消耗品を資産台帳へ入れてはならない');
        if(ITEMLIKE_ASSET_NAME.test(name))throw new Error('道具が誤って資産として書き込まれた疑い：'+name+'；キャラクターの 道具/装備/形态 などの対応フィールドへ書き込み、资产 へは書き込まないこと');
    }
    function materializeAssetRecord(oldValue,item,isNew=false) {
        const oldAsset=plain(oldValue)?copy(oldValue):{},asset=Object.assign(copy(ASSET_DEFAULTS),oldAsset);
        const normalizeOwners=value=>{const source=Array.isArray(value)?value:(value===undefined?[]:[value]),out=[];for(const raw of source){const owner=String(raw??'').trim();if(!owner||owner==='无主'||out.includes(owner))continue;out.push(owner);}return out.slice(0,12);};
        // 旧アセットに「所属对象」がない場合はプレイヤー資産として互換扱い；明示的な空配列は「无主」を意味する。
        asset.所属対象=Object.hasOwn(oldAsset,'所属対象')?normalizeOwners(oldAsset.所属対象):['<user>'];
        if(isNew){
            if(!Object.hasOwn(item,'所属対象'))throw new Error('新規アセットは 所属対象 の配列を明示すること；无主 の資産は空配列を使う：'+item.名称);
            if(!Object.hasOwn(item,'タイプ')||!String(item.タイプ||'').trim())throw new Error('新規アセットは タイプ を明示すること：'+item.名称);
        }
        if(Object.hasOwn(item,'所属対象'))asset.所属対象=normalizeOwners(item.所属対象);
        for(const field of ['タイプ','主体規模','完全度','状態'])if(Object.hasOwn(item,field))asset[field]=copy(item[field]);
        if(Object.hasOwn(item,'エネルギー')){
            if(item.エネルギー===null)delete asset.エネルギー;
            else asset.エネルギー=Object.assign(copy(ASSET_ENERGY_DEFAULTS),plain(oldAsset.エネルギー)?copy(oldAsset.エネルギー):{},plain(item.エネルギー)?copy(item.エネルギー):{});
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
        mergeNamedMap('消耗ユニット',ASSET_UNIT_DEFAULTS);
        mergeNamedMap('建設シーケンス',ASSET_BUILD_DEFAULTS);
        if(Object.hasOwn(item,'駐留人員')){
            const merged=plain(oldAsset.駐留人員)?copy(oldAsset.駐留人員):{};
            for(const [name,value] of Object.entries(item.駐留人員||{})){
                if(forbidden.has(name))continue;
                if(value===null)delete merged[name];else merged[name]=String(value??'');
            }
            asset.駐留人員=merged;
        }
        if(Object.hasOwn(item,'待機イベント'))asset.待機イベント=copy(item.待機イベント||[]);
        if(!plain(asset.建設シーケンス))asset.建設シーケンス={};
        if(!plain(asset.駐留人員))asset.駐留人員={};
        if(!Array.isArray(asset.待機イベント))asset.待機イベント=[];
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
            if(options.event&&!Object.hasOwn(record,'説明'))record.描述=item.名称;
            if(options.event){
                const mergedEvent=Object.assign(copy(RECORDS.事件),plain(old)?old:{},record);
                if(['待发生','進行中'].includes(mergedEvent.状态)){
                    const anchor=eventTimeAnchor(mergedEvent);
                    if(!anchor||VAGUE_EVENT_TIME.test(anchor))throw new Error('事件时间锚点缺失或过于模糊：'+item.名称+'；具体的な世界時間/時間帯を記入するか、相対/因果時間（例：“爆发后数日”“前置节点完成后当日傍晚”）を明示してください。空値と“近期/稍后/未来/待定/未知”は禁止です');
                }
            }
            if(!Object.keys(record).length){warnings.push('空の業務レコードを無視：'+item.名称);return;}
            patches.push({op:old===undefined?'add':'replace',path:pointer(actual),value:record});
        };
        for(const [key,value] of Object.entries(result.通貨||{})){
            const parts=['世界','通貨',key],old=get(stat,parts);
            if(old!==value)patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value});
        }
        for(const [key,value] of Object.entries(result.暦法||{})){
            const parts=['世界','暦法',key],old=get(stat,parts);
            if(!same(old,value))patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value:copy(value)});
        }
        for(const item of result.事件)addEntity(['世界',PATH,'事件',item.名称],item,{...RECORDS.事件,...MODEL_DETAILS.事件},{event:true});
        const plannedDead=new Set((result.异端||[]).filter(item=>item.操作!=='撤销本轮'&&item.状態==='死亡').map(item=>nameKey(item.名称)));
        for(const item of result.人物){
            const alien=alienRosterMatch(stat,item.名称);
            if((alien&&alien.记录?.状態==='死亡')||plannedDead.has(nameKey(item.名称))){warnings.push('異端はすでに死亡しているため、バックグラウンド人物の復元は禁止：'+item.名称);continue;}
            addEntity(['世界',PATH,'人物',item.名称],item,{...RECORDS.人物,...MODEL_DETAILS.人物},{person:true});
        }
        for(const item of result.势力地区)addEntity(['世界',PATH,'势力地区',item.名称],item,{...RECORDS.势力地区,...MODEL_DETAILS.势力地区});
        for(const item of result.传播)addEntity(['世界',PATH,'传播',item.名称],item,{...RECORDS.传播,...MODEL_DETAILS.传播},{removable:true});
        for(const item of result.历史){
            if(item.操作==='撤销本轮')continue;
            let name=item.名称,parts=['世界',PATH,'历史',name],record=resultFields(item,RECORDS.历史);
            if(!Object.keys(record).length){warnings.push('空の歴史レコードを無視：'+name);continue;}
            if(get(stat,parts)!==undefined){
                const old=get(stat,parts);
                if(same(normalizeBackendRecord('历史',record,old),old))continue;
                let n=2;while(get(stat,['世界',PATH,'历史',name+'#'+n])!==undefined)n++;
                name=name+'#'+n;parts=['世界',PATH,'历史',name];
            }
            patches.push({op:'add',path:pointer(parts),value:record});
        }
        const causal=result.因果||{};
        if(Object.hasOwn(causal,'現在段階')){
            const parts=['世界','因果軌道','現在段階'],old=get(stat,parts);
            patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value:causal.現在段階});
        }
        if(Array.isArray(causal.宏观顺序)&&causal.宏观顺序.length>=3&&causal.宏观顺序.length<=5){
            const parts=['世界','因果軌道','ストーリーライン'],story=causal.宏观顺序.join(' -> '),old=get(stat,parts);
            patches.push({op:old===undefined?'add':'replace',path:pointer(parts),value:story});
        } else if(Array.isArray(causal.宏观顺序)&&causal.宏观顺序.length)warnings.push('マクロ順序が3個未満です。補充を待ってから因果軌道へ投影します');
        for(const item of causal.偏移記録||[]){
            if((stat.設定||{}).世界超安定){warnings.push('世界超安定：偏移を無視 '+item.名称);continue;}
            addEntity(['世界','因果軌道','偏移記録',item.名称],item,EXISTING.偏移記録);
        }
        for(const item of result.勢力)addEntity(['世界','勢力',item.名称],item,EXISTING.勢力);
        for(const item of result.资产||[]){
            if(item.操作==='撤销本轮')continue;
            const target=stableNameIn(stat.资产||{},item.名称),existing=target?(stat.资产||{})[target]:undefined;
            if(!target&&item.操作!=='移除')assertWorldAssetScope(item,true);
            const tombstoneName=stableNameIn(stat?.世界?.[PATH]?.资产墓碑||{},item.名称);
            if(!target&&item.操作!=='移除'&&tombstoneName)throw new Error('資産はユーザーまたはMVUによって削除済みで、削除保護の対象です。世界エンジンによる再構築は禁止：'+item.名称);
            if(item.操作==='移除'){
                if(target)patches.push({op:'remove',path:pointer(['资产',target])});
                else warnings.push('資産オブジェクトが存在しないため、削除を無視：'+item.名称);
                continue;
            }
            const finalName=target||item.名称;
            const record=materializeAssetRecord(existing,item,!target);
            if(existing&&same(existing,record))continue;
            patches.push({op:target?'replace':'add',path:pointer(['资产',finalName]),value:record});
        }
        for(const item of result.探索){
            const granularity=explorationGranularity(item.名称);
            if(granularity.invalid)throw new Error('探索粒度が細かすぎます：'+item.名称+'。世界.探索は全体ランドマーク/区域のみを記録します'+(granularity.parent?'。代わりに「'+granularity.parent+'」へ変更し、微細な進展は主区域へ累積してください':'。天台、教室、走廊、房间などのサブ区域を独立した探索項目にするのは禁止です'));
            const old=(stat.世界?.探索||{})[item.名称];
            if(old&&Object.hasOwn(item,'探索度')&&Number(item.探索度)<Number(old.探索度||0))throw new Error('探索度は理由なく後退できません：'+item.名称+' '+old.探索度+' -> '+item.探索度);
            addEntity(['世界','探索',item.名称],item,EXISTING.探索);
        }
        if(!(stat.設定||{}).単一世界)for(const item of result.异端){
            if(item.操作==='撤销本轮')continue;
            const roster=stat.世界?.異端レーダー?.名簿||{},target=stableNameIn(roster,item.名称);
            if(!target){warnings.push('異端リストの対象が存在しないため、世界エンジンによる新規追加は禁止：'+item.名称);continue;}
            const oldStatus=roster[target]?.状態;
            if(oldStatus==='死亡'&&item.状態!=='死亡'){warnings.push('死亡した異端の状態は不可逆：'+target);continue;}
            if(oldStatus===item.状態)continue;
            patches.push({op:'replace',path:pointer(['世界','異端レーダー','名簿',target,'状態']),value:item.状態});
        } else if(result.异端.length)warnings.push('単一世界：異端レーダーの更新を無視');
        for(const key of WORLD_RESULT_RUMORS)for(const item of result.噂[key])addEntity(['噂',key,item.名称],item,EXISTING[key],{removable:true});
        const auditNames=new Set(npcBuildAudit(stat).map(item=>nameKey(item.名称)));
        for(const item of result.关系||[]){
            if(item.操作==='撤销本轮')continue;
            const target=stableNameIn(stat.关系リスト||{},item.名称);
            if(!target){warnings.push('関係オブジェクトが存在しないため、世界エンジンによる新規作成は禁止：'+item.名称);continue;}
            const npc=stat.关系リスト[target],fields=resultFields(item,RELATION_SYNC_FIELDS);
            if(!Object.keys(fields).length){warnings.push('空の関係更新を無視：'+target);continue;}
            for(const [field,value] of Object.entries(fields)){
                if(RELATION_AUDIT_ONLY_FIELDS.has(field)&&!auditNames.has(nameKey(target))){
                    warnings.push('NPCは現在、構築監査リストにないため、構築フィールドを無視：'+target+'/'+field);
                    continue;
                }
                validateRelationSyncValue(field,value,npc,target);
                const nextValue=RELATION_COMPONENT_FIELDS.has(field)?mergeRelationComponent(field,npc?.[field],value):materializeRelationComponent(field,value);
                if(RELATION_COMPONENT_FIELDS.has(field)){
                    const count=Object.keys(nextValue||{}).length;
                    const limit=field==='血統'?2:field==='装備'?6:field==='技能'?4:field==='形態庫'?4:12;
                    if(count>limit)throw new Error(target+' '+field+' がNPC生成ルールの上限を超えています '+limit);
                }
                if(same(npc?.[field],nextValue))continue;
                patches.push({op:npc?.[field]===undefined?'add':'replace',path:pointer(['関係リスト',target,field]),value:copy(nextValue)});
            }
        }
        return {result,patches,warnings};
    }

    function validateState(stat) {
        const state = stat.世界[PATH];
        for (const [category, template] of Object.entries(RECORDS)) {
            if (!plain(state[category]) || Object.keys(state[category]).length > 300) throw new Error(category + '記録が多すぎるか構造が不正です');
            for (const [name,value] of Object.entries(state[category])) {
                if (forbidden.has(name)) throw new Error('不正な記録名');
                checkRecord(value,template,DETAILS[category]);
                checkDetails(value,DETAILS[category]);
            }
        }
        for (const [name,event] of Object.entries(state.事件)) {
            if (!['待发生','進行中','已完成','已取消'].includes(event.状态)) throw new Error('不正なイベント状態：'+name+' = '+String(event.状态||'空')+'；次の値のみ許可： 待发生/進行中/已完成/已取消');
            if (!EVENT_CATEGORIES.has(event.分类)) throw new Error('不正なイベント分類：'+name+' = '+String(event.分类||'空'));
            if (event.前因.some(id => !Object.hasOwn(state.事件,id))) throw new Error('事件前因不存在：' + name);
        }
        const calendar=plain(stat.世界?.暦法)?stat.世界.暦法:{};
        const monthDays=Array.isArray(calendar.月日数)?calendar.月日数:[];
        if(monthDays.length>24||monthDays.some(n=>!Number.isInteger(Number(n))||Number(n)<1||Number(n)>99))throw new Error('世界暦の月日数が無効です');
        const hasMonthDay=value=>/\d{1,2}\s*月\s*-?\s*\d{1,2}\s*日/.test(String(value||''));
        if(monthDays.length&&hasMonthDay(stat.世界.時間)&&!calendarDate(stat.世界.時間,calendar))throw new Error('世界時間が暦の月長に違反しています：'+stat.世界.時間);
        if(monthDays.length){
            for(const [name,event] of Object.entries(state.事件)){
                for(const value of [event.时间,event.开始时间,event.结束时间]){
                    if(hasMonthDay(value)&&!calendarDate(value,calendar))throw new Error('イベント日付が世界暦に違反しています：'+name+' = '+value);
                }
            }
        }
        const range = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
        for (const [name,item] of Object.entries(stat.世界.勢力 || {})) if (!QUALITY_RANKS.includes(item.実力) || !range(item.声望,-5000,10000)) throw new Error('勢力の品質または声望が範囲外です：'+name+'、实力='+String(item.実力)+'、声望='+String(item.声望)+'；实力に使用できるのは '+QUALITY_RANKS.join('/')+'、声望の範囲は -5000~10000');
        for (const [name,item] of Object.entries(stat.世界.探索 || {})) if (!QUALITY_RANKS.includes(item.リスク) || !range(item.探索度,0,100)) throw new Error('探索の品質または進捗が範囲外です：'+name+'、风险='+String(item.リスク)+'、探索度='+String(item.探索度)+'；风险に使用できるのは '+QUALITY_RANKS.join('/')+'、探索度の範囲は 0~100');
        for (const item of Object.values((stat.世界.因果軌道 || {}).偏移記録 || {})) if (!range(item.影響度,-100,120)) throw new Error('因果偏移が範囲外です');
        for (const item of Object.values(stat.关系リスト || {})) if (!range(item.好感度,-100,100)) throw new Error('人物の好感度が範囲外です');
        for (const item of Object.values((stat.任務 || {}).リスト || {})) if (!['進行中','提出可能','決算可能','失败'].includes(item.状態)) throw new Error('任務状態が無効です');
        for (const item of Object.values((stat.任務 || {}).インスタンス実績 || {})) if (!['未達成','達成済み'].includes(item.状態)) throw new Error('実績状態が無効です');
        for (const category of ['街頭の噂','情報取引','布告と檄文']) {
            const items = Object.values((stat.噂 || {})[category] || {});
            if (items.length > 3) throw new Error('各分類の現在の噂は最大3件です：'+category+'統合後は'+items.length+'件です；同一分類で操作=移除を提出し、少なくとも'+(items.length-3)+'件の置き換えられた古い噂を削除してください；現在の名称：'+Object.keys(stat.噂[category]).join('、'));
            if (category === '街頭の噂' && items.some(i => !['酒話','疑わしい','信頼できるかも'].includes(i.信頼度))) throw new Error('噂の可信度が無効です');
        }
        const visiting = new Set(), visited = new Set();
        function visit(name) {
            if (visiting.has(name)) throw new Error('イベントの前因が循環しています');
            if (visited.has(name)) return;
            visiting.add(name); state.事件[name].前因.forEach(visit); visiting.delete(name); visited.add(name);
        }
        Object.keys(state.事件).forEach(visit);
        for (const category of ['人物','势力地区','传播']) {
            for (const record of Object.values(state[category])) if (record.关联事件.some(id => !Object.hasOwn(state.事件,id))) throw new Error('関連イベントが存在しません');
        }
    }
    function applyPatches(stat, patches) {
        if (!Array.isArray(patches) || patches.length > 100) throw new Error('各ラウンドにつき最大 100 件のパッチ');
        const next = copy(stat);
        next.世界[PATH] = Object.assign(emptyState(), next.世界[PATH] || {});
        normalizeBackendState(next);
        for (const patch of patches) {
            if (!plain(patch) || !['add','replace','remove'].includes(patch.op)) throw new Error('未対応のパッチ操作です');
            let p = canonicalizeParts(tokens(patch.path),next);
            patch.path=pointer(p);
            if (!allowed(p,next)) throw new Error('禁止写入：' + patch.path);
            bootstrapBackendParent(next,p);
            const old = get(next,p);
            if (p[1] === PATH && p[2] === '历史' && (patch.op !== 'add' || old !== undefined)) throw new Error('履歴は追加のみ許可されています');
            // 世界モデルは「初回設定」を replace で書いてくることが多い。作成が許可された世界記録は upsert として扱う。
            if (patch.op !== 'add' && old === undefined && !canUpsertMissing(p,next)) throw new Error('対象が存在しません：' + patch.path);
            if (patch.op === 'remove' && !(p[0] === '噂' || (p[1] === PATH && p[2] === '传播') || (p[0] === '资产' && p.length === 2))) throw new Error('削除できるのは期限切れの伝播・噂・完全に消滅した資産のみです。その他の記録は状態で終了させてください');
            let value=patch.value;
            if (patch.op !== 'remove') {
                if (value === undefined) throw new Error('パッチ値がありません');
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
                    if(p[0]==='噂'&&p[1]==='情報取引'&&!(next.システム状態||{}).主神空間滞在中&&(next.世界?.名称!=='主神空間'&&next.世界?.名称!=='主神空间')&&/スペースコイン|空间币/.test(String(value.要求価格||'')))throw new Error('任務世界の情報取引ではローカル通貨を使用してください。スペースコインは使用できません');
                }
                else if (old !== undefined && (typeof old !== typeof value || Array.isArray(old) !== Array.isArray(value))) throw new Error('フィールドの型が変更されました');
                if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('数値が無効です');
                if (p[0] === '世界' && p[1] === '因果軌道' && p.length === 3 && typeof value !== 'string') throw new Error('因果摘要はテキストでなければなりません');
                if (p[0] === '任務' && p[1] === 'インスタンス実績' && old === '達成済み' && value !== old) throw new Error('達成済みの実績は後退できません');
                if(p[0]==='関係リスト'&&p.length===3)validateRelationSyncValue(p[2],value,next.関係リスト?.[p[1]],p[1]);
                if (p[p.length-1] === '好感度' && Math.abs(value - old) > 20) throw new Error('ラウンドあたりの好感度変動が20を超えています');
            }
            let parent = next;
            for (const key of p.slice(0,-1)) {
                if (parent[key] === undefined) parent[key] = {};
                if (!plain(parent[key])) throw new Error('親パスがオブジェクトではありません');
                parent = parent[key];
            }
            if (patch.op === 'remove') delete parent[p.at(-1)]; else parent[p.at(-1)] = copy(value);
        }
        normalizeBackendState(next);
        normalizeEventLayers(next);
        validateTemporalWrites(stat,next,patches);
        validateState(next);
        for (const [name,item] of Object.entries(next.世界.勢力 || {})) {
            const old = (stat.世界.勢力 || {})[name];
            if (Math.abs(item.声望 - (old ? old.声望 : 0)) > 1000) throw new Error('ラウンドあたりの声望変動が1000を超えています');
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
                throw new Error('到期事件未处理：'+due.名称+'。イベントを開始するか、今回のラウンドの再確認日・阻害条件・次回チェックを記録してください。');
            }
        }
    }
    function unscheduledEvents(stat) {
        return Object.entries(stat?.世界?.[PATH]?.事件||{}).filter(([,event])=>{
            if(!['待发生','進行中'].includes(event?.状态))return false;
            const anchor=eventTimeAnchor(event);
            return !anchor||VAGUE_EVENT_TIME.test(anchor);
        }).map(([名称,event])=>({名称,分类:event.分类,状態:event.状态,条件:event.条件,前因:copy(event.前因||[]),当前时间:eventTimeAnchor(event)}));
    }
    function ensureEventTimeAnchors(next,required=[]) {
        const missing=[];
        for(const item of required||[]){
            const event=next?.世界?.[PATH]?.事件?.[item.名称];
            if(!event||!['待发生','進行中'].includes(event.状态))continue;
            const anchor=eventTimeAnchor(event);
            if(!anchor||VAGUE_EVENT_TIME.test(anchor))missing.push(item.名称);
        }
        if(missing.length)throw new Error('事件时间锚点仍未补全：'+missing.join('、')+'；各項目について具体的な世界日付/時間帯を追記するか、相対/因果時間を明示してください。空値と“近期/稍后/未来/待定/未知”は禁止です');
    }
    function ensureStaleActiveHandled(next,required=[],worldTime='') {
        const now=worldDateKey(worldTime),state=next?.世界?.[PATH];
        const unresolved=[],resolved=[];
        for(const item of required||[]){
            const event=state?.事件?.[item.名称];
            if(!event)continue;
            if(['已完成','已取消'].includes(event.状态)){resolved.push(item.名称);continue;}
            const updated=worldDateKey(event.更新时间);
            if(event.状态==='進行中'&&updated!==null&&now!==null&&updated===now&&String(event.下次检查||'').trim())continue;
            unresolved.push(item.名称);
        }
        if(unresolved.length)throw new Error('超期活动事件仍未复核：'+unresolved.join('、')+'；局所イベントが長時間にわたり進行中のままです。終了/キャンセルするか、現在時刻へ更新して次回チェックを記入してください');
        // 「今ラウンドで、すでに終了していたと確認された」古い局所イベントは24時間の表示猶予を迂回する：
        // 人物/地区/伝播のソフト参照を整理する。依存する活動中イベントがなければ、即座に履歴へ圧縮する。
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
        const keys=new Set((required||[]).map(item=>item.タイプ+'\u0000'+item.名称));
        const bad=remaining.filter(item=>keys.has(item.タイプ+'\u0000'+item.名称));
        if(bad.length)throw new Error('时间越界记录仍未修复：'+bad.map(item=>item.タイプ+'/'+item.名称+'('+item.字段+'='+item.值+')').join('、'));
    }
    function ensureMacroBackbone(next,timeline,required=true) {
        if(!required||!timeline?.需要补充远期)return;
        const allMacro=Object.entries(next?.世界?.[PATH]?.事件||{}).filter(([,e])=>e.分类==='宏观节点'&&e.状態!=='已取消');
        const activeMacro=allMacro.filter(([,e])=>e.状態==='進行中');
        const futureMacro=allMacro.filter(([,e])=>e.状態==='待发生');
        const openMacro=allMacro.filter(([,e])=>['進行中','待发生'].includes(e.状態));
        if(openMacro.length<3)throw new Error('宏观事件不足：需要至少3个可推进宏观节点（进行中+待发生），当前仅'+openMacro.length+'个（进行中'+activeMacro.length+'个，待发生'+futureMacro.length+'个）');
        const stages=storyStages(next?.世界?.因果軌道?.ストーリーライン);
        const names=new Set(allMacro.map(([name])=>name));
        if(stages.length<3||stages.length>5||stages.some(name=>!names.has(name)))throw new Error('因果轨道未形成有效宏观投影：既存のマクロノードを使って3~5ノードのストーリーラインを生成してください');
    }

    function progressionAnchorChanged(before,after) {
        return before?.世界?.名称!==after?.世界?.名称||before?.世界?.時間!==after?.世界?.時間||!!before?.システム状態?.主神空間滞在中!==!!after?.システム状態?.主神空間滞在中;
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
            catch(_){throw new Error('返却された JSON を解析できません：'+error.message+'；元の返信はリクエスト検査に保持されています。');}
        }
        if(!plain(result))throw new Error('返信は JSON オブジェクトでなければなりません');
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
        if(!String(entry.content||'').trim())return {read:false,reason:'内容が空'};
        if(force)return {read:true,reason:'強制読み込み'};
        if(!entry.enabled)return {read:false,reason:'エントリ無効'};
        if(entry.mode==='constant')return {read:true,reason:'青ランプ常駐'};
        if(entry.mode!=='selective')return {read:false,reason:'未対応のアクティブ化方式です。明示的な強制読み込みが必要です'};
        const list=v=>Array.isArray(v)?v:typeof v==='string'?v.split(',').map(x=>x.trim()).filter(Boolean):[];
        const match=k=>{
            if(k instanceof RegExp){k.lastIndex=0;return k.test(scan);}
            if(plain(k)){try{return new RegExp(k.pattern||k.source||k.regex,k.flags||'').test(scan);}catch(_){return false;}}
            return !!String(k||'')&&scan.includes(String(k));
        };
        if(!list(entry.keys).some(match))return {read:false,reason:'緑ランプ：キーワード不一致'};
        const second=entry.secondary||{},keys=list(second.keys||second),hits=keys.map(match);
        const ok=!keys.length||(second.logic==='and_all'?hits.every(Boolean):second.logic==='not_all'?!hits.every(Boolean):second.logic==='not_any'?!hits.some(Boolean):hits.some(Boolean));
        return {read:ok,reason:ok?'緑ランプ：一致':'緑ランプ：副次条件が未達'};
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
            out[name]=omitKeys(item,['原始属性','最終属性','强化','真属性']);
        }
        return out;
    }
    function projectEquipped(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item)||Number(item.状態)!==1)continue;
            out[name]=omitKeys(item,['原始属性','最終属性','强化','真属性']);
        }
        return out;
    }
    function projectCarriedItems(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item)||Number(item.状態)===2)continue;
            out[name]=omitKeys(item,['原始属性','最終属性','强化','真属性']);
        }
        return out;
    }
    function projectForms(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item))continue;
            out[name]=omitKeys(item,['原始属性','最終属性','强化','真属性']);
        }
        return out;
    }
    function projectAuditComponentMap(value,{equipment=false}={}) {
        if(!plain(value))return {};
        const out={};
        for(const [name,item] of Object.entries(value)){
            if(!plain(item))continue;
            if(equipment&&Number(item.状態)===2)continue;
            const clean=omitKeys(item,['最終属性','强化','真属性']);
            if(plain(clean.技能)){
                clean.技能=Object.fromEntries(Object.entries(clean.技能).filter(([,skill])=>plain(skill)).map(([skillName,skill])=>[skillName,omitKeys(skill,['最終属性','强化','真属性'])]));
            }
            out[name]=clean;
        }
        return out;
    }
    function projectCharacterForAudit(value) {
        const source=plain(value)?value:{},out={};
        for(const key of ['登場','種族','身分','職業','階層','HP_MAX','HP','THP','EP_MAX','EP','性格','好み','外見','服装','仲間','好感度','態度','背景']){
            if(Object.hasOwn(source,key))out[key]=copy(source[key]);
        }
        const 状態=projectAuditComponentMap(source.状態),血統=projectAuditComponentMap(source.血統),技能=projectAuditComponentMap(source.技能);
        const 装備=projectAuditComponentMap(source.装備,{equipment:true}),形態庫=projectAuditComponentMap(source.形態庫);
        if(Object.keys(状態).length)out.状態=状態;
        if(Object.keys(血統).length)out.血統=血統;
        if(Object.keys(技能).length)out.技能=技能;
        if(Object.keys(装備).length)out.装備=装備;
        if(Object.keys(形態庫).length)out.形態庫=形態庫;
        if(plain(source.現在形態))out.現在形態=copy(source.現在形態);
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
        const rank=Math.max(0,RELATION_RANKS.indexOf(String(npc.階層||'Ⅰ')));
        const profileText=[...(Array.isArray(npc.身分)?npc.身分:[]),...Object.keys(npc.職業||{}),npc.背景,npc.態度].filter(Boolean).join(' ');
        const bossHint=/(?:boss|首领|领主|头目|魔王|王者|宗主|掌门|教皇|最终敌人|最终对手)/i.test(profileText);
        const level=(bossHint||rank>=5)?'首領/Boss級':rank>=2?'エリート級':'雑兵級';
        const minimum=(level==='首領/Boss級'||level==='首领/Boss级')?{血統:1,装備:3,技能:2}:(level==='エリート級'||level==='精英级')?{血統:1,装備:2,技能:1}:{血統:1,装備:1,技能:0};
        const counts={血統:Object.keys(npc.血統||{}).length,装備:Object.values(npc.装備||{}).filter(item=>plain(item)&&Number(item.状態)!==2).length,技能:Object.keys(npc.技能||{}).length,状態:Object.keys(npc.状態||{}).length,形态:Object.keys(npc.形態庫||{}).length};
        const gaps=[],suggest=new Set();
        for(const field of ['種族','身分','職業','外見','服装','性格','好み','背景','態度']){
            const value=npc[field],missing=Array.isArray(value)?!value.length:plain(value)?!Object.keys(value).length:!String(value||'').trim();
            if(missing){gaps.push('資料欠落/'+field);suggest.add(field);}
        }
        for(const field of ['血統','装備','技能']){
            if(counts[field]<minimum[field]){gaps.push(field+'が不足 '+counts[field]+'/'+minimum[field]);suggest.add(field);}
        }
        const combatText=npcBuildText({職業:npc.職業,血統:npc.血統,装備:npc.装備,技能:npc.技能,状態:npc.状態,形態庫:npc.形態庫});
        if(level!=='雑兵級'&&level!=='杂兵级'){
            const offense=/(?:伤害|攻击|斩|刺|射击|爆破|火力|ATK|MATK|杀伤|输出|毒|灼烧|雷击|炮击)/i.test(combatText);
            const survival=/(?:防御|护盾|减伤|恢复|治疗|格挡|护甲|屏障|再生|吸收|DEF|MDEF|生存)/i.test(combatText);
            const control=/(?:控制|位移|突进|冲刺|束缚|眩晕|减速|沉默|击退|牵引|冻结|召唤|机动|封锁|禁锢)/i.test(combatText);
            if(!offense){gaps.push('主要な殺傷手段が不足');suggest.add('技能');suggest.add('装備');}
            if(!survival){gaps.push('防御/生存手段が不足');suggest.add('技能');suggest.add('装備');suggest.add('状態');}
            if(!control){gaps.push('機動/制御手段が不足');suggest.add('技能');suggest.add('形態庫');}
        }
        if(level==='首領/Boss級'||level==='首领/Boss级'){
            const stage=counts.形态>0||/(?:阶段|二阶段|变身|形态|解放|觉醒|狂暴|转阶段|状态切换)/i.test(combatText);
            if(!stage){gaps.push('Boss段階/形態/状態変化の仕組みが不足');suggest.add('形態庫');suggest.add('状態');suggest.add('技能');}
        }
        return {名称:name,审计级别:level,階層:String(npc.階層||'Ⅰ'),当前组件:counts,缺口:gaps,建议字段:Array.from(suggest),当前构筑:projectCharacterForAudit(npc)};
    }
    function npcBuildAudit(stat,limit=NPC_BUILD_AUDIT_LIMIT) {
        const relations=stat?.关系リスト||{},backend=stat?.世界?.[PATH]||{},people=backend.人物||{},events=backend.事件||{},roster=((stat?.設定||{}).単一世界||(stat?.設定||{}).単一世界)?{}:(stat?.世界?.異端レーダー?.名簿||{});
        const currentLocation=String(stat?.世界?.地点||''),worldTime=String(stat?.世界?.時間||'');
        const activeEventNames=new Set(Object.entries(events).filter(([,e])=>e&&['待发生','進行中'].includes(e.状態)&&['当前事件','近期节点'].includes(e.分类)).map(([eventName])=>eventName));
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
            const activeAlien=!!(alien&&alien.状態!=='死亡');
            const linked=!!(person&&(person.关联事件||[]).some(eventName=>activeEventNames.has(eventName)))||currentParticipants.has(nameKey(name));
            const here=!!npc.登場||!!(person&&currentLocation&&String(person.地点||'')&&(String(person.地点).includes(currentLocation)||currentLocation.includes(String(person.地点))));
            const updated=!!(person&&sameWorldTimeAnchor(person.更新时间,worldTime));
            if(!activeAlien&&!linked&&!here&&!updated)continue;
            const reasons=[];
            if(activeAlien)reasons.push('活動中の異端');
            if(linked)reasons.push('現在/近期イベントの参加者');
            if(here)reasons.push(npc.登場?'現在登場中':'現在地点に関連');
            if(updated)reasons.push('今回の人物動態を更新済み');
            const levelWeight=(assessment.审计级别==='首領/Boss級'||assessment.审计级别==='首领/Boss级')?40:(assessment.审计级别==='エリート級'||assessment.审计级别==='精英级')?20:0;
            const priority=(activeAlien?80:0)+(linked?60:0)+(here?40:0)+(updated?20:0)+levelWeight+assessment.缺口.length;
            rows.push({...assessment,触发依据:reasons,__priority:priority});
        }
        return rows.sort((a,b)=>b.__priority-a.__priority||a.名称.localeCompare(b.名称,'zh-CN')).slice(0,Math.max(0,Number(limit)||0)).map(item=>{const out={...item};delete out.__priority;return out;});
    }
    function ensureNpcBuildAuditProgress(next,required=[],acceptedResult) {
        if(!(required||[]).length)return;
        const proposals=acceptedResult?.关系||[],failed=[];
        for(const before of required){
            const target=stableNameIn(next?.関係リスト||{},before.名称);
            if(!target)continue;
            const after=npcBuildAssessment(next,target,next.関係リスト[target]);
            if(!after)continue;
            const proposal=proposals.find(item=>nameKey(item.名称)===nameKey(before.名称));
            const touched=proposal&&before.建议字段.some(field=>Object.hasOwn(proposal,field));
            if(!touched||after.缺口.length>=before.缺口.length)failed.push(before.名称);
        }
        if(failed.length)throw new Error('NPC构筑审计未推进：'+failed.join('、')+'；列挙された各監査対象について、今回のラウンドで少なくとも実ギャップをひとつ補ってください。好感度・HP・無関係なフィールドだけの変更は禁止です');
    }

    function projectCharacterForWorld(value) {
        const source=plain(value)?value:{},out={};
        for(const key of ['登場','種族','身分','職業','階層','HP_MAX','HP','THP','EP_MAX','EP','性格','好み','外見','服装','仲間','好感度','態度','背景','数量']){
            if(Object.hasOwn(source,key))out[key]=copy(source[key]);
        }
        const 状態=projectAbilityMap(source.状態),血統=projectAbilityMap(source.血統),技能=projectAbilityMap(source.技能);
        const 装備=projectEquipped(source.装備),道具=projectCarriedItems(source.道具),形態庫=projectForms(source.形態庫);
        if(Object.keys(状態).length)out.状態=状態;
        if(Object.keys(血統).length)out.血統=血統;
        if(Object.keys(技能).length)out.技能=技能;
        if(Object.keys(装備).length)out.装備=装備;
        if(Object.keys(道具).length)out.道具=道具;
        if(Object.keys(形態庫).length)out.形態庫=形態庫;
        if(plain(source.現在形態))out.現在形態=copy(source.現在形態);
        return out;
    }
    function projectAssetsForWorld(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,asset] of Object.entries(value)){
            if(!plain(asset))continue;
            const item=copy(asset);
            if(plain(item.建設シーケンス)){
                for(const seq of Object.values(item.建設シーケンス||{})){
                    if(!plain(seq))continue;
                    delete seq.次回産出日;
                    delete seq.次回産出游日;
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
        const orbit=plain(value)?value:{},entries=Object.entries(orbit.偏移記録||{});
        const recent=entries.slice(-HOT_OFFSET_TARGET);
        const total=entries.reduce((sum,[,item])=>sum+(Number(item?.影響度)||0),0);
        return {
            現在段階:orbit.現在段階,
            ストーリーライン:orbit.ストーリーライン,
            次ノード:orbit.次ノード,
            偏移記録:Object.fromEntries(recent.map(([name,item])=>[name,copy(item)])),
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
        // 初期の世界エンジンは地区に「資源点」を誤って追加していた。旧セーブとの互換のため保持するが、モデルには送信しない。資産は既存のトップレベル資産台帳のみを読む。
        for(const area of Object.values(projectedBackend.势力地区||{}))if(plain(area))delete area.资源点;
        const out={
            世界:{
                时间:world.時間,
                地点:world.地点,
                名称:world.名称,
                位格:world.位格,
                難易度:world.難易度,
                安定:world.安定,
                法則:copy(world.法則||[]),
                通貨:copy(world.通貨||{}),
                暦法:copy(world.暦法||{}),
                探索:copy(world.探索||{}),
                勢力:copy(world.勢力||{}),
                因果軌道:projectCausalOrbitForWorld(world.因果軌道,world.安定),
                異端レーダー:copy(world.異端レーダー||{}),
                [PATH]:projectedBackend
            },
            キャラ:projectCharacterForWorld(src.キャラ),
            関係リスト:{},
            资产:projectAssetsForWorld(src.资产),
            资产删除保护:Object.keys(backend.资产墓碑||{}).filter(name=>!stableNameIn(src.资产||{},name)).slice(-50),
            噂:copy(src.噂||{}),
            システム状態:{
                戦闘中:!!src.システム状態?.戦闘中,
                主神空間滞在中:!!src.システム状態?.主神空間滞在中
            },
            世界模式:{
                単一世界:!!src.設定?.単一世界,
                世界超安定:!!src.設定?.世界超安定
            }
        };
        for(const [name,person] of Object.entries(src.関係リスト||{}))out.関係リスト[name]=projectCharacterForWorld(person);
        if(!Object.keys(out.キャラ||{}).length)delete out.キャラ;
        if(!Object.keys(out.関係リスト).length)delete out.関係リスト;
        if(!Object.keys(out.资产).length)delete out.资产;
        if(!out.资产删除保护.length)delete out.资产删除保护;
        if(!Object.keys(out.噂).length)delete out.噂;
        return out;
    }
    function protocol() {
        const schemaText=JSON.stringify(WORLD_RESULT_SCHEMA,null,2);
        return ` WorldResult JSON オブジェクトをひとつだけ出力してください。Markdown、説明、思考過程、<thinking> または JSON Pointer は出力しないでください。
業務フィールドの省略は変化なしを意味します。既存エンティティは今回のラウンドで変化したフィールドのみを書き、新規エンティティはそれを確立するのに十分な確定事実を書きます。エンティティは“名称”で関連付けます。
“操作”の既定値は“更新”；“移除”は Schema が削除を許可した記録にのみ使用し；“撤销本轮”は誤り訂正の再試行にのみ使用します。
フィールドの意味は【世界引擎核心约束】に従います。フィールド構造と値域は以下の Schema のみを基準とします。WorldResult 以外の任務・世界時間・プレイヤー属性/通貨/撃破数などは出力しないでください。
関係は既存の関係リストオブジェクトのみを更新します。プレイヤーのためにバックグラウンド人物記録を作成してはなりません。

【Canonical WorldResult JSON Schema】
${schemaText}`;
    }
    const NPC_BUILD_AUDIT_RULES=`【角色管理 · NPC构筑审计】
“角色管理.NPC构筑审计”に列挙された既存 NPC のみを扱います。目的は実ギャップの補完であり、難易度を上げたりキャラを作り直したりすることではありません。
1. 人物の階層、HP_MAX/EP_MAX は変更しません。完成済みの構成要素は上書きせず、改名によって重複能力を作り出しません。
2. 最低構成：雑兵=血统1/装备1/技能は0可；精英=血统1/装备2/技能1；Boss=血统1/装备3/技能2；上限は血统2/装备6/技能4。精英は殺傷・生存・機動/制御を備え、Bossはさらに段階または形態の仕組みを持ちます。
3. 能力は主要コンポーネントのいずれかひとつにのみ帰属します：血统=本体条件、装备=実体、技能=実行方式、状态=現在の結果、形态=独立した戦闘モード。
4. WorldResult.关系 のみを使用して既存 NPCを更新し、新規/修正項目のみを提出します。真属性・最终属性・强化キャッシュを出力してはなりません。血统/形态の五属性はすべて揃える必要があり、技能には基础/衍生属性を書きません。
5. 効果は決算可能でなければならず、ランダム確率の詞条は書きません。各監査対象について、既存の身分・職業・階層・既に演出された能力と整合するギャップを少なくともひとつ修正し、資料が不足している場合は最小限の補完を行います。`;    class SamsaraWorldEngine {
        constructor(host, env) {
            this.host = host; this.env = env || host; this.unsub = []; this.generation = 0;
            this.busy = false; this.committing = false; this.disposed = false; this.tab = '总览'; this.status = '待機';
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
                // 圧縮された長期履歴を本文AIへ送るかどうかだけを制御する。世界進行システム自身は常に読み取る。
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
            // 旧版の「デフォルト設定として保存」は組み込みデフォルトを直接上書きしていた。v3 以降はこのローカル内容を独立した個人ドキュメントへ移行する。
            // 組み込みの「默认设置」は常にコード内の最新 DEFAULT_PRESET に束縛され、localStorage に遮蔽されない。
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
                if(!personal)this.config.promptDocuments.unshift({id:USER_DEFAULT_PROMPT_DOCUMENT_ID,type:'samsara-world-prompt-document',version:1,builtin:false,name:'個人用デフォルト設定',createdAt:'',updatedAt:'',settings:copy(legacySettings)});
            }
            this.config.promptDocuments=this.config.promptDocuments.filter(doc=>doc.id!==BUILTIN_DEFAULT_PROMPT_DOCUMENT.id).slice(0,59);
            this.config.promptDocuments.unshift(copy(BUILTIN_DEFAULT_PROMPT_DOCUMENT));
            {
                const appliedVersion=Number(this.config.builtinDefaultPromptVersionApplied||0);
                if(appliedVersion<BUILTIN_DEFAULT_PROMPT_VERSION){
                    // 初回インストール時は自動適用し、組み込みデフォルトを使用中のユーザーはバージョンアップに追従する。
                    // カスタムドキュメント/個人デフォルトは強制上書きされないが、組み込みデフォルトドキュメント自体は常に最新のコードテンプレートへ更新される。
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
            const raw=String(message||'世界進行失敗').trim();
            if(!raw||/^(?:请求已取消|上下文已经切换|已切换上下文)/.test(raw))return false;
            const shown=raw.length>900?raw.slice(0,897)+'…':raw;
            const toast=(this.host&&this.host.toastr)||(this.env&&this.env.toastr)||(this.host&&this.host.parent&&this.host.parent.toastr);
            if(toast&&typeof toast.error==='function'){
                try{toast.error(shown,'世界進行失敗');return true;}catch(_){}
            }
            try{console.error('[世界推进] '+shown);}catch(_){}
            return false;
        }
        snapshot() {
            const mvu = this.env.Mvu || this.host.Mvu;
            const getMessages = this.fn('getChatMessages');
            if (!mvu || !getMessages) throw new Error('現在 MVU と酒場のメッセージ機能を待機しています');
            const message = getMessages(-1)[0];
            if (!message) throw new Error('現在メッセージがありません');
            const id = message.message_id != null ? message.message_id : message.id;
            if (!Number.isInteger(Number(id))) throw new Error('現在のフロア番号が無効です');
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
            /* BATCH_B_AUDIT_TIER_COMPAT: 旧セーブの 审计级别 を正規値へ読み取り時に移行する。入力境界専用・冪等。 */
            var AUDIT_TIER_CANONICAL = 'エリート級';
            var AUDIT_TIER_LEGACY = '精英级';
            function normalizeLegacyAuditTier(record) {
                if (!record || typeof record !== 'object') return record;
                if (record.审计级别 === AUDIT_TIER_LEGACY) record.审计级别 = AUDIT_TIER_CANONICAL;
                if (record.审计级别 === '首领/Boss级') record.审计级别 = '首領/Boss級';
                if (record.审计级别 === '杂兵级') record.审计级别 = '雑兵級';
                return record;
            }
            const raw = mvu.getMvuData({type:'message',message_id:Number(id)});
            if (raw && raw.stat_data) normalizeLegacyCharacterKey(raw.stat_data);
            if (raw && raw.stat_data && raw.stat_data.世界) { const _bt = raw.stat_data.世界.后台; if (_bt && _bt.人物) for (const _k of Object.keys(_bt.人物)) normalizeLegacyAuditTier(_bt.人物[_k]); }
            if (!raw || !raw.stat_data || !raw.stat_data.世界) throw new Error('現在のフロアはまだ MVUが初期化されていません');
            const context = this.host.SillyTavern && this.host.SillyTavern.getContext ? this.host.SillyTavern.getContext() : {};
            const chatFn = this.fn('getCurrentChatId');
            const chat = chatFn ? chatFn() : context.chatId;
            if (chat == null) throw new Error('現在のチャット識別子を確認できません');
            const text = String(message.message != null ? message.message : message.mes || '');
            const fingerprint = JSON.stringify([String(chat),Number(id),message.swipe_id || 0,digest(text)]);
            return {mvu,raw:copy(raw),stat:copy(raw.stat_data),id:Number(id),text,fingerprint,message};
        }
        blocked(snapshot) {
            const s = snapshot.stat;
            if ((s.システム状態 || {}).主神空間滞在中 || (s.世界.名称 === '主神空間' || s.世界.名称 === '主神空间')) return '現在は主神空間にいるため、インスタンス進行は停止中';
            if (!s.世界.名称 || s.世界.名称 === '待初始化') return 'インスタンスの初期化を待機中';
            if (/(?:輪廻清算プロトコル|轮回清算协议)/.test(snapshot.text)) return '決算フロアは決算美化プログラムが処理します';
            if (snapshot.message.is_user || snapshot.message.role === 'user') return '本文の完成を待機中';
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
        apiSourceLabel() { return this.usesDedicatedApi()?'世界進行システム専用 API':'主神端末の追加モデル'; }
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
            if(!clean)throw new Error('まず API プリセット名を入力してください');
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
            if(!preset)throw new Error('API プリセットが存在しません');
            api.apiUrl=preset.apiUrl;api.apiKey=preset.apiKey;api.model=preset.model;api.fetchedModels=[];
            this.config.dedicatedApi=api;this.saveConfig();return api;
        }
        dedicatedEndpoint(kind='chat') {
            const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
            let endpoint=String(api.apiUrl||'').trim().replace(/\/+$/,'');
            if(!endpoint)throw new Error('先に専用 API のアドレスを入力してください');
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
            if(!fetcher)throw new Error('現在の環境に fetchがありません');
            const headers={};if(api.apiKey.trim())headers.Authorization='Bearer '+api.apiKey.trim();
            const response=await fetcher(this.dedicatedEndpoint('models'),{headers});
            if(!response.ok){
                let body='';try{body=await response.text();}catch(_){}
                throw new Error('モデルの読み込みに失敗：HTTP '+response.status+(body?' / '+body.slice(0,240):''));
            }
            const body=await response.json();
            const raw=Array.isArray(body?.data)?body.data:Array.isArray(body?.models)?body.models:[];
            const models=raw.map(item=>typeof item==='string'?item:item?.id||item?.name).filter(Boolean).map(String);
            if(!models.length)throw new Error('API が返したモデルリストが空です');
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
            if(!this.dedicatedApiReady())throw new Error('世界進行システム専用 API は有効ですが、アドレスまたはモデルが未設定です');
            if(!fetcher)throw new Error('現在の環境に fetchがありません');
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
                    this.lastTransportInfo={接口:'世界進行システム専用 API',模型:api.model,结构化模式:mode,尝试模式:copy(modeAttempts),usage:null};
                    throw new Error(lastError);
                }
                const data=await response.json(),message=data?.choices?.[0]?.message;
                const raw=message?.content;
                const content=typeof raw==='string'?raw:(plain(raw)?JSON.stringify(raw):message?.parsed?JSON.stringify(message.parsed):'');
                if(!content)throw new Error('専用 API の返却内容が空です');
                if(wants)this.apiModeCache[cacheKey]=mode;
                this.lastTransportInfo={接口:'世界進行システム専用 API',模型:api.model,结构化模式:mode,尝试模式:copy(modeAttempts),usage:normalizeTokenUsage(data?.usage)};
                return content;
            }
            throw new Error(lastError||'専用 API は現在の構造化出力モードに対応していません');
        }
        async requestAI(system,input,options={}) {
            if(this.usesDedicatedApi()){
                const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
                this.lastTransportInfo={接口:'世界進行システム専用 API',模型:api.model,结构化模式:'請求中',尝试模式:[],usage:null};
                return this.requestDedicatedApi(system,input,options);
            }
            const terminal=this.host.Samsara&&this.host.Samsara.terminal;
            if(!terminal||typeof terminal.request!=='function'||!terminal.apiReady?.())throw new Error('请在主神终端设置中启用额外模型并选择模型');
            this.lastTransportInfo={接口:'主神端末の追加モデル',模型:'',结构化模式:options.structured==='auto'?'auto（主神端末がネゴシエート）':'plain',尝试模式:[],usage:null};
            return terminal.request(system,input,options);
        }
        setPreset(text) {
            if (typeof text !== 'string' || text.length > 30000) throw new Error('プリセットは30000文字までです');
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
            if(!plain(settings)||typeof settings.preset!=='string'||settings.preset.length>30000)throw new Error('プリセットドキュメントの内容が無効か、30000文字を超えています');
            for(const [name,value] of [['核心制約',settings.corePrompt],['マクロ骨格プロンプト',settings.macroPrompt],['世界自救プロンプト',settings.stabilityPromptTemplate]])if(value!==undefined&&(typeof value!=='string'||value.length>30000))throw new Error(name+'は30000文字以内にしてください');
            if(settings.npcAuditPrompt!==undefined&&(typeof settings.npcAuditPrompt!=='string'||settings.npcAuditPrompt.length>30000))throw new Error('NPC監査プロンプトは30000文字以内です');
            if(settings.structurePrompt!==undefined&&(typeof settings.structurePrompt!=='string'||settings.structurePrompt.length>30000))throw new Error('構造プロンプトは30000文字以内です');
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
            if(!clean)throw new Error('先にプリセットドキュメント名を入力してください');
            if(clean===BUILTIN_DEFAULT_PROMPT_DOCUMENT.name)throw new Error('「默认设置」は組み込みドキュメントです。別の名前で保存してください');
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
            let parsed;try{parsed=JSON.parse(String(raw||''));}catch(_){throw new Error('インポートしたファイルは有効な JSONではありません');}
            const settings=plain(parsed.settings)?parsed.settings:parsed;
            if(typeof settings.preset!=='string')throw new Error('インポートしたファイルに presetがありません');
            if(settings.preset.length>30000)throw new Error('インポートしたプリセットが30000文字を超えています');
            const name=String(parsed.name||settings.name||'インポートプリセット').trim().slice(0,80)||'インポートプリセット';
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
            if(!doc)throw new Error('プリセット文書が存在しません');
            const BlobCtor=this.host.Blob||(typeof Blob!=='undefined'?Blob:null);
            const URLApi=this.host.URL||(typeof URL!=='undefined'?URL:null);
            if(!BlobCtor||!URLApi?.createObjectURL)throw new Error('現在の環境はファイル出力に対応していません');
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
            this.status=on?(this.isAvailable()?'世界進行を有効にしました':(this.usesDedicatedApi()?'世界進行を有効にしました · 専用 API 設定待ち':'世界進行を有効にしました · 追加モデル設定待ち')):'世界進行を無効にしました';
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
                addSource(names.primary,'キャラ主要ブック');
                for(const book of names.additional||[])addSource(book,'キャラ追加ブック');
            }
            const chatFn=this.fn('getChatWorldbookName');
            if(chatFn){
                try{addSource(await chatFn('current'),'チャット連携');}catch(_){}
            }
            const globalFn=this.fn('getGlobalWorldbookNames');
            if(globalFn){
                try{for(const book of await globalFn()||[])addSource(book,'グローバル有効');}catch(_){}
            }
            const result=[];
            for(const [book,labels] of sources){
                const entries=await get(book)||[];
                entries.forEach((e,i)=>{
                    const title=e.name||e.comment||'名称未設定';
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
                const decision=e.technical?{read:false,reason:'世界エンジン技術項目は隔離済み'}:timelineBackbone?{read:true,reason:'マクロ資料の補完'}:selected?activation(e,scan,this.config.activationMode==='force_selected'):{read:false,reason:'未選択'};
                report.push({世界书:e.book,条目ID:e.id,名称:e.title,灯:e.mode==='constant'?'青ランプ':e.mode==='selective'?'緑ランプ':'その他',读取:decision.read,原因:decision.reason});
                if(!decision.read)continue;
                let content=e.content;
                if(content.includes('<%')){
                    const ejs=this.host.EjsTemplate;
                    if(!ejs?.evalTemplate||!ejs?.prepareContext)throw new Error('選択した世界ブックに動的テンプレートが含まれています。 EJS 拡張が必要です：'+e.title);
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
            // 背景人物が欠けているアクティブな異端は、今回のリクエスト副本に空の殻だけを置き、これが補完待ちの活動であるとモデルに明示させる。
            // 空の殻を正式な seed patchにはせず、今回モデルが実際に作成する人物記録と add/add 衝突するのを避ける。
            seedMissingAlienPeople(state,alienActivity);
            for(const patch of seedPatches){const parts=tokens(patch.path);if(parts[2]==='事件')state.世界[PATH].事件[parts.at(-1)]=patch.value;}
            structuralFixes.push(...normalizeEventLayers(state));
            structuralFixes.push(...repairCausalProjection(state));
            structuralFixes.push(...repairMacroPredecessors(state));
            structuralFixes.push(...repairExplicitEventLinks(state));
            if(state.設定)delete state.設定.API;
            if(state.設定?.世界超安定===true)state.世界.安定=100;
            delete state.商城;
            const count=Math.max(1,Math.min(100,Number(this.config.contextTurns)||6));
            const id=Number(base.message.message_id??base.message.id);
            // まずすべての履歴候補を選別し、そのうえで直近 N 件の非空本文を取得する。技術階層がどれだけ多くても本文の枠を圧迫しない。
            const messages=await this.fn('getChatMessages')('0-'+id);
            const isAssistant=m=>{
                const role=String(m?.role||'').toLowerCase();
                if(!m||m.is_hidden||m.is_user===true||role==='user'||role==='system')return false;
                return role==='assistant'||!role;
            };
            const floors=messages.filter(m=>Number(m.message_id??m.id)<=id&&isAssistant(m))
                .sort((a,b)=>Number(a.message_id??a.id)-Number(b.message_id??b.id))
                .map(m=>({楼层:m.message_id??m.id,キャラ:'assistant',正文:extractWorldProse(m.message??m.mes??'')}))
                .filter(f=>f.正文).slice(-count);
            if(!floors.length)throw new Error('使用可能なAI本文を読み取れませんでした：階層が空か、思考・変数更新・パネルのみです。チャット内容を確認してください');
            const timeline=timelineState(state);
            const needBackbone=timeline.需要初始化||timeline.需要补充远期;
            const openMacro=Object.entries(state.世界[PATH].事件).filter(([,event])=>event.分类==='宏观节点'&&['進行中','待发生'].includes(event.状态));
            const activeMacroCount=openMacro.filter(([,event])=>event.状态==='進行中').length;
            const macroRequirement=this.config.requireMacroBackbone!==false&&timeline.需要补充远期?{
                已有可推进宏观节点:openMacro.map(([名称,event])=>({名称,状態:event.状态})),
                至少补充节点数:Math.max(0,3-openMacro.length),
                交付要求:macroBackbonePlan(openMacro.length,activeMacroCount,openMacro.length-activeMacroCount),
                规划与发生:'今回は必ず骨格を補完すること。時間が進んでいない、本文にマクロな変化がない、業務上の変化がない、といった理由で省略してはならない。待発生ノードの確立は将来の計画であり、次のマクロ境界の後に置いてよく、イベントが今発生することを意味しない。直近の細部と既に発生した事実は、依然として今回の時間容量と次のマクロ境界に制約される。数を埋めるために原作の日付を前倒ししたり、未来イベントの結果を先に決算してはならない。更新時間には現在の世界時間を用いる。',
                验收:'既存の状態と今回の結果を統合したうえで数える。今回のラウンドで既存のマクロノードを終了または取消した場合、ウィンドウから外れた分を補足しなければならない。リトライ時は受理済みの業務結果と最新の補完リストに従い、受理済みノードを重複作成しない。'
            }:undefined;
            const proseScan=floors.map(f=>f.正文).join('\n');
            const chronologyScan=needBackbone?[state.世界.名称,'原著','时间线','时间轴','年表','大事记','大事件','剧情大纲','剧情章节','章节','未来','后续'].filter(Boolean).join(' '):'';
            const books=await this.worldbook([proseScan,chronologyScan].filter(Boolean).join('\n'),{timelineBackbone:needBackbone});
            const now=worldDateKey(state.世界.時間);
            const due=Object.entries(state.世界[PATH].事件).filter(([,e])=>e.状態==='待发生'&&now!==null&&worldDateKey(e.时间||e.开始时间)!==null&&worldDateKey(e.时间||e.开始时间)<=now).map(([名称,e])=>({名称,时间:e.时间||e.开始时间,条件:e.条件,前因:e.前因,説明:'時間が到来した。条件と前因を項目ごとに検証し、適合すれば進行中へ移行する。適合しなければ次回チェックを更新し、妨げを説明しなければならない。無言でスキップしてはならない。'}));
            const unscheduled=unscheduledEvents(state);
            const staleActive=staleActiveEvents(state);
            const timeAnomalies=temporalAnomalies(state);
            const capacity=worldTimeCapacity(state.世界[PATH].已处理时间,state.世界.時間);
            const npcAudit=npcBuildAudit(state);
            const input=JSON.stringify({
                输入语义:{
                    世界书:'任意の設定/原作との差異/時間資料。既に発生した事実ではなく、世界ブックがなくても正常に推演しなければならない。',
                    当前变量:'世界進行専用のホットデータ投影。世界、人物能力、完全な資産台帳、アクティブな伝播、直近の因果偏移、および「直近の原始アンカー + より古いルート要約」から成る階層的な長期歴史記憶を含む。原始履歴は永久にMVUに残り、上位の要約に取り込まれた旧ノードは再びホットコンテキストへ入らない。資産はWorldResult.资产と同一のトップレベル台帳で双方向に同期する。提供されていない任務/ショップ/純決算データはこのエンジンの責務ではない。',
                    正文楼层:'すでに演出されたストーリー。現在の事実と時間スパンを確認するために用い、舞台裏の日常として語り直さない。',
                    程序结构修复:'エンジンがすでに行った確定的な訂正。出力でプログラムが降格/修正した旧エラーを復元してはならない。',
                    时间线调度:'プログラムが算出したマクロ境界と期限付き再検証要求。意味的な推演はモデルが担い、スケジュールプロトコルを再定義しない。',
                    WorldResult:'唯一の業務成果物。 JSON Pointer、add/replace パス、プログラムログを含まない。',
                    角色管理:'NPC構築監査が提供された場合、列挙された既存NPCのギャップのみを扱う。完全な構築資料は監査対象の中でのみ提供し、全NPCが重複してコンテキストを占有するのを避ける。'
                },
                本轮必须完成的宏观骨架:macroRequirement,
                世界书:books.map(b=>String(b.内容||'')).filter(Boolean),
                当前变量:projectWorldContext(state),
                角色管理:npcAudit.length?{NPC构筑审计:npcAudit}:undefined,
                正文楼层:floors,
                程序结构修复:structuralFixes,
                本轮时间容量:capacity,
                时间线调度:timeline,
                推演阶段:{宏观优先:true,宏观骨架状态:needBackbone?'確立または補足が必要':'利用可能なマクロ骨格あり',近期细节边界:timeline.下一宏观节点?.名称||'まず次のマクロノードを確立',知识来源:'現在確認済みの事実 > 明示された世界ブック設定（あれば） > モデルが持つ原作/世界知識 > 慎重な推論'},
                正文可见投影规则:{
                    当前时间:state.世界.時間,
                    当前地点:state.世界.地点,
                    要求:'非戦闘の本文は完全な因果軌道を読み取る。現在段階は現在の情勢に、ストーリーライン/次ノードは長期的な語りの方向に、偏移記録は章をまたぐ因果記憶に用いる。これらは計画の根拠であり、キャラクターの予知や背後情報の自動把握を意味しない。本文はさらに、進行中の現在イベントの公開フィールドと、プログラムが選別した場外シーンを読み取る。各ホット地区には共有環境/現場集団が一度だけ現れ、人物リストは各自の行動事実のみを運び、関連イベントは索引としてのみ扱う。アクティブな異端は常にその所在ホットシーンに保持される。以上はいずれも語りの連続性のために用いられ、キャラクターが既知であることを意味しない。現在のシーンに影響しうる現在イベントは、公開の兆候と可視の影響を維持すべきである。隠された条件、既定の展開、未来のマクロイベントの詳細を公開フィールドに詰め込んではならない。'
                },
                可选宏观资料补充:needBackbone,
                本轮必须复核的到期事件:due,
                本轮必须补全的事件时间锚点:unscheduled,
                本轮必须复核的超期活动事件:staleActive,
                本轮必须修复的时间越界记录:timeAnomalies,
                本轮必须维持的异端活动:alienActivity,
                生命周期整理:lifecycle,
                説明:'現在変数は確認済みのホット事実であり、重複決算しない。アーカイブ済みの旧イベントと回収済みの伝播を再作成しない。世界ブックが空でも阻害要因にならない。業務上の事実のみを提出し、保存パスはプログラムがコンパイルする。'
            },null,2);
            const stabilityPrompt=worldStabilityPrompt(state,this.config.stabilityPromptTemplate??DEFAULT_STABILITY_PROMPT_TEMPLATE);
            const macroPrompt=macroRequirement?(this.config.macroPrompt??DEFAULT_MACRO_PROMPT):'';
            const corePrompt=this.config.corePrompt??CORE_WORLD_RULES;
            const system=this.config.preset+(corePrompt?'\n\n'+corePrompt:'')+(macroPrompt?'\n\n'+macroPrompt:'')+(stabilityPrompt?'\n\n'+stabilityPrompt:'')+(npcAudit.length?'\n\n'+(this.config.npcAuditPrompt??NPC_BUILD_AUDIT_RULES):'')+'\n\n【WorldResult 业务输出协议】\n'+((this.config.structurePrompt??protocol().split('【Canonical WorldResult JSON Schema】')[0].trim())+'\n\n【Canonical WorldResult JSON Schema】\nプログラムが実際に使用するフィールド定義（文章による説明では変更できません）：\n'+JSON.stringify(WORLD_RESULT_SCHEMA,null,2));
            return {system,input,schema:copy(WORLD_RESULT_SCHEMA),seedPatches,due,unscheduled,staleActive,timeAnomalies,alienActivity,npcAudit:copy(npcAudit),timeline:copy(timeline),manifest:{输出协议:'WorldResult v1',结构化输出:'auto',接口来源:this.apiSourceLabel(),读取判定:copy(books.report||[]),世界书读取:{实际读取:books.length,检查条目:(books.report||[]).length,跳过:Math.max(0,(books.report||[]).length-books.length)},世界书条目:books.map(b=>({世界书:b.世界书,条目ID:b.条目ID,名称:b.名称,估算Tokens:estimateTokens(b.内容)})),正文楼层:floors.map(f=>({楼层:f.楼层,キャラ:f.キャラ,估算Tokens:estimateTokens(f.正文)})),导入节点:seedPatches.map(p=>tokens(p.path).at(-1)),到期节点:due.map(e=>e.名称),待补时间锚点:unscheduled.map(e=>e.名称),超期活动事件:staleActive.map(e=>e.名称),时间越界记录:timeAnomalies.map(e=>e.タイプ+'/'+e.名称),程序结构修复:copy(structuralFixes),生命周期整理:copy(lifecycle),NPC构筑审计:npcAudit.map(x=>({名称:x.名称,审计级别:x.审计级别,缺口:copy(x.缺口)})),本轮时间容量:copy(capacity),可选宏观资料补充:needBackbone,观测:requestTokenTelemetry(system,input,WORLD_RESULT_SCHEMA)}};
        }
        schedule() {
            if (this.disposed || this.committing || !this.isEnabled()) return;
            if (this.busy) { this.pending = true; return; }
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.run().catch(() => {}), 900);
        }
        async run() {
            if (this.disposed || this.busy) return false;
            if (!this.isConfigured()) { this.status='世界進行を無効にしました'; this.render(); return false; }
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
                        return !person||!String(person.地点||'').trim()||!String(person.目标||'').trim()||!String(person.行动||'').trim()||String(person.更新时间||'').trim()!==String(recoveryStat.世界?.時間||'').trim();
                    });
                    if(!needsMacroRepair&&!needsScheduleRepair&&!needsLifecycleRepair&&!needsAlienRepair){this.status='この階層は処理済みのため、重複決算しません';return false;}
                    this.status=needsMacroRepair?'マクロ骨格の不完全を検出 · この階層を修復':needsScheduleRepair?'イベント時間アンカーの欠落を検出 · この階層を修復':needsAlienRepair?'異端活動の欠落を検出 · この階層を修復':'ライフサイクルまたは時間異常を検出 · この階層を修復';
                }
                if (!this.isAvailable()) throw new Error(this.usesDedicatedApi()?'世界進行の「設定」で専用 API のアドレスとモデルを設定してください':'请在主神终端设置中启用额外模型并选择模型');
                const validate = this.host.Samsara && this.host.Samsara.validateWorldState;
                if (!validate) throw new Error('请加载更新后的 ZODスクリプト.js');

                this.resetInspection();
                this.status = '世界資料を読み込み中'; this.render();
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
                    actualRequest.manifest.观测.请求类型=attempt===0?'初回リクエスト':'訂正リトライ';
                    this.lastAttemptCount=attempt+1;
                    this.lastRequest=actualRequest;
                    this.status=attempt===0?'六モジュール共同推演中':'訂正リトライ '+(attempt+1)+'/'+maxAttempts;
                    this.render();

                    let received='',attemptTelemetry=null;
                    const attemptStarted=Date.now();this.lastTransportInfo=null;
                    try{
                        received=String(await this.requestAI(request.system,attemptInput,{signal:this.controller.signal,schema:request.schema,schemaName:'samsara_world_result_v1',structured:'auto',temperature:0.3}));
                        clearTimeout(timeout);
                        if(token!==this.generation||this.controller.signal.aborted)throw new Error('请求已取消');
                        this.lastReply=received;this.lastFailure='';
                        const elapsed=Math.max(0,Date.now()-attemptStarted),transport=this.lastTransportInfo||{},usage=transport.usage||null,observation=actualRequest.manifest.观测;
                        Object.assign(observation,{接口来源:transport.接口||this.apiSourceLabel(),模型:transport.模型||'',结构化实际模式:transport.结构化模式||'不明',模式尝试:copy(transport.尝试模式||[]),耗时毫秒:elapsed,输出估算Tokens:estimateTokens(received)});
                        if(usage){observation.实际输入Tokens=usage.inputTokens;observation.实际输出Tokens=usage.outputTokens;observation.实际总Tokens=usage.totalTokens;}
                        attemptTelemetry={尝试:attempt+1,结果:'検収待ち',输入估算Tokens:observation.请求估算Tokens,输出估算Tokens:observation.输出估算Tokens,API输入Tokens:usage?.inputTokens??null,API输出Tokens:usage?.outputTokens??null,API总Tokens:usage?.totalTokens??null,接口:observation.接口来源,模型:observation.模型,结构化模式:observation.结构化实际模式,模式尝试:copy(observation.模式尝试||[]),耗时毫秒:elapsed};
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
                            ensureDueHandled(next,request.due,base.stat.世界.時間);
                            ensureEventTimeAnchors(next,request.unscheduled);
                            ensureStaleActiveHandled(next,request.staleActive,base.stat.世界.時間);
                            ensureTemporalAnomaliesResolved(next,request.timeAnomalies);
                            ensureActiveAlienActivity(next,request.alienActivity,acceptedWorldResult,base.stat.世界.時間);
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
                                ensureDueHandled(next,request.due,base.stat.世界.時間);
                                ensureEventTimeAnchors(next,request.unscheduled);
                                ensureStaleActiveHandled(next,request.staleActive,base.stat.世界.時間);
                                ensureTemporalAnomaliesResolved(next,request.timeAnomalies);
                                ensureActiveAlienActivity(next,request.alienActivity,acceptedWorldResult,base.stat.世界.時間);
                                ensureMacroBackbone(next,request.timeline,this.config.requireMacroBackbone!==false);
                            }catch(error){currentGlobalError=error;}
                            if(currentGlobalError)throw makeRetryFailure([],currentGlobalError);
                        }
                        const committedPatches=built.appliedSeeds.concat(modelPatches,built.repairPatches);

                        if (!(next.設定 || {}).世界超安定) {
                            const offsets=(next.世界.因果軌道||{}).偏移記録||{};
                            const total=Object.values(offsets).reduce((n,r)=>n+(Number(r.影響度)||0),0);
                            next.世界.安定=Math.max(0,Math.min(120,100+total));
                        }
                        next.世界[PATH].已处理楼层=base.fingerprint;
                        next.世界[PATH].已处理时间=base.stat.世界.時間;
                        const changes=committedPatches.map(p=>{
                            const parts=tokens(p.path),back=parts[1]===PATH,asset=parts[0]==='资产';
                            return {时间:base.stat.世界.時間,类别:asset?'资产':back?parts[2]:parts[1],名称:asset?parts[1]:back?parts[3]:parts[2],字段:asset?'资产':parts.at(-1),操作:p.op==='add'?'新增':p.op==='remove'?'移除':'更新',内容:typeof p.value==='string'?p.value:plain(p.value)?(p.value.説明||p.value.行动||p.value.事实||p.value.目標||p.value.状態||p.value.内容||'记录已更新'):''};
                        });
                        next.世界[PATH].最近变化=changes.slice(-100);
                        // 推演記録は歴史アンカーに置き換わったため、もう永続化しない。
                        // 任意のコミット装飾フック：今回の派生メタデータとメイン世界結果をアトミックに保存し、余分な MVU 書き戻しを避ける。
                        if(typeof this.beforeWorldCommit==='function')this.beforeWorldCommit(next,{
                            messageId:base.id,fingerprint:base.fingerprint,worldResult:acceptedWorldResult,reply:copy(reply),baseStat:base.stat
                        });

                        const checked=validate(next);
                        for(const patch of committedPatches){
                            if(patch.op!=='remove'&&!same(get(checked,tokens(patch.path)),get(next,tokens(patch.path))))throw schemaMismatchError(next,checked,patch.path);
                        }
                        reply.patches=committedPatches;
                        prepared={reply,next,current};
                        if(attemptTelemetry)attemptTelemetry.结果='受理';
                        break;
                    }catch(error){
                        clearTimeout(timeout);
                        if(attemptTelemetry){attemptTelemetry.结果='拒否';attemptTelemetry.原因=String(error.message||error);}
                        else{
                            const elapsed=Math.max(0,Date.now()-attemptStarted),transport=this.lastTransportInfo||{},observation=actualRequest.manifest.观测;
                            Object.assign(observation,{接口来源:transport.接口||this.apiSourceLabel(),模型:transport.模型||'',结构化实际模式:transport.结构化模式||'未返却',模式尝试:copy(transport.尝试模式||[]),耗时毫秒:elapsed});
                            this.lastAttemptTelemetry.push({尝试:attempt+1,结果:'リクエスト失敗',输入估算Tokens:observation.请求估算Tokens,输出估算Tokens:0,API输入Tokens:null,API输出Tokens:null,API总Tokens:null,接口:observation.接口来源,模型:observation.模型,结构化模式:observation.结构化实际模式,模式尝试:copy(observation.模式尝试||[]),耗时毫秒:elapsed,原因:String(error.message||error)});
                        }
                        lastError=error;
                        lastRejectedReply=received||this.lastReply||'';
                        lastRetryPlan=Array.isArray(error?.retryPlan)?copy(error.retryPlan):retryPlanForFailure(error,[]);
                        const rejectedByModel=!!received&&retryableModelFailure(error);
                        if(rejectedByModel)this.lastRetryLog.push({尝试:attempt+1,错误:String(error.message||error),片段:Array.isArray(error?.rejectedSlices)?copy(error.rejectedSlices):[],补充清单:copy(lastRetryPlan)});
                        const canRetry=rejectedByModel&&attempt+1<maxAttempts;
                        if(!canRetry)throw error;
                        attempt++;
                        this.status='応答が不合格 · 自動訂正 '+(attempt+1)+'/'+maxAttempts;
                        this.render();
                    }
                }

                if(!prepared)throw lastError||new Error('世界推演が書き込み可能な結果を生成しませんでした');
                this.committing=true;
                const result=prepared.current.raw;
                result.stat_data=prepared.next;
                const replay=typeof this.buildWorldReplayPackage==='function'
                    ?this.buildWorldReplayPackage(base.stat,prepared.next,base.fingerprint):null;
                if(replay)result.__samsaraWorldReplay=replay;
                await prepared.current.mvu.replaceMvuData(result,{type:'message',message_id:base.id});
                this.status='更新済み · '+prepared.reply.summary+(this.lastRetryLog.length?' · 先行失敗'+this.lastRetryLog.length+'回':'');
                return true;
            } catch (error) {
                const failureMessage=error.name==='AbortError'?(timedOut?'リクエストタイムアウト（300秒）':'请求已取消'):String(error.message||error);
                this.lastFailure=failureMessage;
                const retryNote=this.lastRetryLog?.length?' · 失敗記録'+this.lastRetryLog.length+'回':'';
                this.status=(this.committing?'書き込み未確認 · ':'未書き込み · ')+failureMessage+retryNote;
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
                // 自身のコミットや装備などの UI 書き戻しは本文完了を意味しないため、誤った追加実行を避ける。
                if(this.committing||this.host.__samsaraUIMutation||this.env.__samsaraUIMutation||this.host.parent?.__samsaraUIMutation)return;
                try {
                    const snapshot=this.snapshot();
                    if(plain(variables?.stat_data))snapshot.stat=variables.stat_data;
                    if(this.blocked(snapshot))this.cancel();
                } catch (_) { /* MVU がまだ書き戻していない可能性がある。遅延スケジュールで最終状態を読み取る。 */ }
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
            // ビューポート高さを明示的に占有し、ホストの flex/ポップアップ規則が低い画面で本文を圧迫するのを避ける。
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
                /* ===== 世界エンジン独立外観：主神端末の六色調に追従；未設定時は暗夜にフォールバック ===== */
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
                /* 全面フォントサイズシステム：フォントサイズ設定は root のフォントサイズを継承するボタンだけでなく、パネル全体に作用させる必要がある */
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
                /* エリア記録の説明カードはテーマに追従させ、暗色時に目に痛い白枠とグレー文字が出るのを避ける */
                #sam-world-engine[data-tone] .we-area-note{
                    background:var(--we-input)!important;color:var(--we-ink)!important;border:1px solid var(--we-line)!important;
                    font-weight:500!important
                }
                /* 設定ページ */
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
            this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-label','世界エンジン');
            this.panel.innerHTML='<header><div class="we-brand"><i>◈</i>世界エンジン<small>WORLD CHRONICLE</small></div><button class="we-btn we-primary" data-action="run">世界を進行</button><button class="we-btn" data-action="close" aria-label="主神端末に戻る">戻る ↗</button></header><div class="we-layout"><nav></nav><main></main></div><footer><span></span><small>物語時間ドリブン · 主神端末の「世界進行」マスタースイッチで制御</small></footer>';
            this.panel.addEventListener('click',event=>{
                const button=event.target.closest('button');if(!button)return;
                const a=button.dataset.action;
                if(button.dataset.directory){this.directoryTab=button.dataset.directory;this.render();return;}
                if(button.dataset.area){this.selectedArea=button.dataset.area;this.directoryTab='探索';this.render();return;}
                if(button.dataset.faction){if(button.hasAttribute('data-asset-owner'))this.tab='探索与势力';this.selectedFaction=button.dataset.faction;this.directoryTab='勢力';this.render();return;}
                if(button.dataset.jumpPerson){this.selectedPerson=button.dataset.jumpPerson;this.tab='角色管理';this.filter='全部';this.query='';this.selectedDate='';this.render(true);return;}
                if(button.dataset.jumpEvent){
                    this.jumpEvent=button.dataset.jumpEvent;this.tab='世界推进';this.filter='全部';this.query='';
                    const world=this.snapshot().stat.世界,event=world[PATH]?.事件?.[this.jumpEvent],calendar=world.暦法;
                    const date=calendarDate(event?.时间||event?.开始时间,calendar),today=calendarDate(world.時間,calendar);
                    const monthsPerYear=Array.isArray(calendar?.月日数)&&calendar.月日数.length?calendar.月日数.length:12;
                    this.selectedDate=date?.key||'';this.calendarMode=date?'date':'undated';
                    this.monthOffset=date&&today?(date.y-today.y)*monthsPerYear+date.m-today.m:0;
                    this.eventLimit=Number.MAX_SAFE_INTEGER;this.render(true);return;
                }
                if(button.dataset.person){this.selectedPerson=button.dataset.person;this.render();return;}
                if(a==='close')this.close();
                else if(a==='run'){
                    if(this.busy){if(!this.committing){this.cancel();this.status='停止を要求しました';this.render();}}
                    else this.run().catch(()=>{});
                }
                else if(a==='cancel'){this.cancel();this.status='停止を要求しました';this.render();}
                else if(a==='save'){
                    const settings=this.readPromptEditor();
                    this.applyPromptSettings(settings);
                    this.promptDraft=null;
                    this.status='プロンプトと資料範囲を保存しました';
                    this.panel.querySelector('footer span').textContent=this.status;
                }
                else if(a==='prompt-edit'){
                    this.promptEditing=!this.promptEditing;
                    button.textContent=this.promptEditing?'編集をロック':'編集を開始';button.setAttribute('aria-pressed',String(this.promptEditing));
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
                    else docs.push({id:USER_DEFAULT_PROMPT_DOCUMENT_ID,type:'samsara-world-prompt-document',version:1,builtin:false,name:'個人用デフォルト設定',createdAt:now,updatedAt:now,settings:copy(settings)});
                    this.config.activePromptDocumentId=USER_DEFAULT_PROMPT_DOCUMENT_ID;
                    this.saveConfig();this.status='個人用デフォルト設定として保存しました';this.panel.querySelector('footer span').textContent=this.status;
                }
                else if(a==='segment-add'){
                    if(!this.promptEditing)return;
                    const list=this.panel.querySelector('[data-segment-list]');if(!list)return;
                    const row=this.host.document.createElement('details');row.open=true;row.className='we-segment';row.setAttribute('data-segment-row','');
                    row.innerHTML='<summary>新規セグメント</summary><div class="we-segment-head"><input data-segment-title aria-label="セグメントタイトル" placeholder="セグメントタイトル（空欄可）"><small>新規セグメント</small><span class="we-segment-actions"><button type="button" data-action="segment-up" title="上へ移動">↑</button><button type="button" data-action="segment-down" title="下へ移動">↓</button><button type="button" data-action="segment-delete" title="削除">削除</button></span></div><textarea data-segment data-title="" aria-label="新規セグメント本文" placeholder="このセグメントのプロンプト本文を入力…"></textarea>';
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
                        this.status='プリセット文書を保存しました：'+doc.name;this.render(true);
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
                    this.status='プリセット文書を適用しました：'+doc.name+(Array.isArray(doc.settings?.selectedEntries)&&!(this.bookCatalogue||[]).length?' · 世界書の選択はカタログ読み込み後に表示されます':'');
                    this.render(true);
                }
                else if(a==='doc-export'){
                    try{this.exportPromptDocument(button.dataset.docId);this.status='プリセット文書をエクスポートしました';this.panel.querySelector('footer span').textContent=this.status;}
                    catch(e){this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}
                }
                else if(a==='doc-delete'){
                    this.promptDraft=this.readPromptEditor();
                    const doc=this.getPromptDocuments().find(item=>item.id===button.dataset.docId);
                    if(this.deletePromptDocument(button.dataset.docId)){this.status='プリセット文書を削除しました'+(doc?'：'+doc.name:'');this.render(true);}
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
                    if(WORLD_FONT_SCALES[scale]){this.config.fontScale=scale;this.panel.dataset.fontScale=scale;this.saveConfig();this.status='画面文字サイズ： '+WORLD_FONT_SCALES[scale].name;this.render(true);}
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
                    this.status=api.enabled?'世界進行システム専用 API を有効化 · 主神端末 APIは使用しません':'専用 API を無効化 · 主神端末 APIへフォールバック';
                    this.render(true);
                }
                else if(a==='dedicated-models'){
                    this.status='専用 API のモデル一覧を読み込み中';this.panel.querySelector('footer span').textContent=this.status;
                    this.fetchDedicatedModels().then(list=>{this.status='モデルを '+list.length+' 件読み込みました';this.render(true);}).catch(e=>{this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;});
                }
                else if(a==='dedicated-preset-save'){
                    try{
                        const name=this.panel.querySelector('[data-dedicated-preset-name]')?.value||'';
                        const entry=this.saveDedicatedApiPreset(name);
                        this.status=' API プリセットを保存しました：'+entry.name;this.render(true);
                    }catch(e){this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}
                }
                else if(a==='dedicated-preset-delete'){
                    const name=this.panel.querySelector('[data-dedicated-preset]')?.value||'';
                    if(!name){this.status='削除する API プリセットを選択してください';this.panel.querySelector('footer span').textContent=this.status;}
                    else if(this.deleteDedicatedApiPreset(name)){this.status=' API プリセットを削除しました：'+name;this.render(true);}
                }
                else if(a==='month'){
                    this.monthOffset=(this.monthOffset||0)+Number(button.dataset.step);
                    const world=this.snapshot().stat.世界,calendar=world.暦法,today=calendarDate(world.時間,calendar);
                    if(today){
                        const custom=Array.isArray(calendar?.月日数)?calendar.月日数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24):[];
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
                    this.status='最大試行回数を '+value+' 回に設定しました';
                    this.panel.querySelector('footer span').textContent=this.status;
                }else if(event.target.matches('[data-doc-import]')){
                    const input=event.target,file=input.files&&input.files[0];if(!file)return;
                    Promise.resolve(file.text()).then(raw=>{
                        const doc=this.importPromptDocument(raw);
                        this.status='プリセット文書をインポートしました：'+doc.name;this.render(true);
                    }).catch(e=>{this.status=e.message;this.panel.querySelector('footer span').textContent=this.status;}).finally(()=>{input.value='';});
                }
                else if(event.target.matches('[data-dedicated-field]')){
                    const field=event.target.dataset.dedicatedField,value=event.target.value||'';
                    if(['apiUrl','apiKey','model'].includes(field)){
                        this.setDedicatedApi({[field]:value});
                        this.status='専用 API 設定を保存しました';this.panel.querySelector('footer span').textContent=this.status;
                    }
                }
                else if(event.target.matches('[data-dedicated-preset]')){
                    const name=event.target.value||'';
                    if(name){
                        try{this.applyDedicatedApiPreset(name);this.status=' API プリセットを適用しました：'+name;this.render(true);}
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
            const s=snapshot?snapshot.stat:{},w=s.世界||{},orbit=w.因果軌道||{};
            this.syncStatusTone();
            this.panel.dataset.fontScale=this.config.fontScale||'standard';
            if(this.tab==='总览')this.tab='世界推进';
            const main=this.panel.querySelector('main'),scroll=main.scrollTop;
            const opened=new Set(Array.from(main.querySelectorAll('details[open]')).map(d=>d.dataset.detail));
            this.panel.querySelector('footer span').textContent=this.status;
            const availabilityReason=this.isConfigured()&&!this.isAvailable()
                ?(this.usesDedicatedApi()?'専用 API が未準備です：設定タブで API アドレスを入力し、モデルを選択してください':'主神端末の追加モデルが未準備です：请在主神终端设置中 API アドレスを設定し、モデルを選択してください')
                :'';
            const runButton=this.panel.querySelector('[data-action=run]');
            const stopping=this.busy&&!!this.controller?.signal.aborted;
            runButton.disabled=this.busy?(this.committing||stopping):!!reason||!!availabilityReason;
            runButton.textContent=this.busy?(this.committing?'保存中…':stopping?'停止中…':'進行を停止'):'世界を進行';
            runButton.setAttribute('aria-label',runButton.textContent);

            const tabs=[['世界推进','◈'],['角色管理','♙'],['探索与势力','⌖'],['世界事件','▤'],['资产','▣'],['噂','◎'],['提示词预设','✎'],['请求检查','⌕'],['运行记录','≋','歴史記憶'],['設定','⚙']];
            this.panel.querySelector('nav').innerHTML='<div class="we-navtitle">世界档案</div>'+tabs.map(([t,i,label])=>'<button data-tab="'+t+'" aria-selected="'+(this.tab===t)+'"><span class="we-tab-icon" aria-hidden="true">'+i+'</span>'+(label||t)+'</button>').join('');
            if(this.tab==='提示词预设'&&main.querySelector('textarea')&&!force)return;
            const text=v=>escape(v==null?'':v);
            const exists=v=>v!==''&&v!=null&&(!Array.isArray(v)||v.length)&&(!plain(v)||Object.keys(v).length);
            const pill=(v,kind='')=>'<span class="we-pill '+kind+'">'+text(v)+'</span>';
            const empty=(title,desc='初回の推演後、根拠のある世界記録がここに表示されます。')=>'<div class="we-empty"><b>'+text(title)+'</b>'+text(desc)+'</div>';
            const value=v=>Array.isArray(v)?(v.every(x=>!plain(x))?'<div class="we-chips">'+v.map(x=>pill(x,'dim')).join('')+'</div>':v.map(x=>'<div class="we-card">'+fields(x)+'</div>').join('')):plain(v)?fields(v):text(v);
            const fields=obj=>'<dl>'+Object.entries(obj||{}).filter(([,v])=>exists(v)).map(([k,v])=>'<dt>'+text(k)+'</dt><dd>'+value(v)+'</dd>').join('')+'</dl>';
            const details=(id,obj,title='完全な記録を表示')=>Object.values(obj).some(exists)?'<details data-detail="'+text(id)+'"'+(opened.has(id)?' open':'')+'><summary>'+text(title)+'</summary>'+fields(obj)+'</details>':'';
            const section=(title,body,hint='')=>'<section class="we-section"><div class="we-section-head"><h2>'+text(title)+'</h2><small>'+text(hint)+'</small></div>'+body+'</section>';
            const entries=obj=>Object.entries(obj||{});
            const parseDate=value=>calendarDate(value,w.暦法);
            const contextKey=JSON.stringify([snapshot?.fingerprint?JSON.parse(snapshot.fingerprint)[0]:null,w.名称]);
            if(this.calendarContext!==contextKey){this.calendarContext=contextKey;this.selectedDate=undefined;this.calendarMode="today";this.monthOffset=0;}
            if(this.selectedDate===undefined||this.calendarMode==="today")this.selectedDate=parseDate(w.時間)?.key||"";
            if(this.calendarMode==='date'){
                const anchor=parseDate(w.時間),selected=parseDate(this.selectedDate);
                const monthsPerYear=Array.isArray(w.暦法?.月日数)&&w.暦法.月日数.length?w.暦法.月日数.length:12;
                if(anchor&&selected)this.monthOffset=(selected.y-anchor.y)*monthsPerYear+selected.m-anchor.m;
            }
            const dateLabel=str=>{const d=parseDate(str);return d?d.m+'月'+d.d+'日':str||'時間未補完';};
            // 安定段階と防御強度は ⚙️世界因果与法则协议 から取得；ここでは現在の段階のみを表示する。
            const stabilityStages=[
                {min:111,max:120,title:'黄金の祝福 | 安定強化',effects:['世界は外来干渉をほぼ消化し、原生の因果は高強度で収束している','輪廻者への能動的な掃討圧力はないが、外来の力は完全な原生法則に拘束される']},
                {min:101,max:110,title:'世界の加護 | 安定強化',effects:['因果構造は原初の基準を上回り、秩序と資源の循環は健全化しつつある','世界による輪廻者への能動的な拒絶反応は非常に低い']},
                {min:100,max:100,title:'原作タイムライン | 安定',effects:['世界は既定の軌跡どおりに運行し、輪廻者を能動的に狙わず、追加の庇護も与えない']},
                {min:90,max:99,title:'因果の警戒 | 安定',effects:['世界が異常の源を識別し始める','目撃・調査・誤解・敵意が合理的な因果の連鎖に沿って輪廻者へ収束する']},
                {min:80,max:89,title:'指向性拒絶 | 安定',effects:['隠れ家・計画・連絡相手・資源の連鎖が継続的に圧迫される','圧力は輪廻者本人とその直接の関係網へ優先的に集中する']},
                {min:70,max:79,title:'因果の追跡 | 弛緩',effects:['原生の強者・組織・主線の衝突が因果の収束によって徐々に輪廻者へ向けられる','拠点・盟友・補給・撤退経路が組織的に破壊され始める']},
                {min:60,max:69,title:'全面掃討 | 弛緩',effects:['複数の原生勢力がそれぞれの合理的な動機から同時に輪廻者を追跡・封鎖・攻撃しうる','通常の安全な生活はほぼ終わり、一箇所から逃れても追跡から逃れたことにはならない']},
                {min:50,max:59,title:'世界の兵器化 | 弛緩',effects:['戦争・災害・怪物の奔流・原生の最高位の強者が因果の連鎖によって輪廻者の活動域へ誘導されうる','世界は排除の代償として区域の壊滅と大規模な誤傷を受け入れ始める']},
                {min:40,max:49,title:'現実の狩猟 | 崩壊',effects:['環境・空間・時間・残存する原生規則のすべてが輪廻者を狩る媒体となりうる','世界は侵入源ごと葬り去るためだけに、永久的な区域壊滅を受け入れる']},
                {min:30,max:39,title:'生贄の排除 | 崩壊',effects:['世界は免疫の嵐へ入り、掃討はもはや自らの秩序の保護を優先しない','輪廻者の排除と引き換えに、主線の人物・都市・国家ひいては文明構造まで犠牲にしうる']},
                {min:10,max:29,title:'終焉の狩り | 混乱',effects:['破滅的な事象が輪廻者とその滞在区域へ向けて収束し続ける','長く留まれば災厄を現在地へ招くため、因果を修復するか撤退を続ける必要がある']},
                {min:1,max:9,title:'共倒れ | 混乱',effects:['世界は自衛を放棄し、法則・タイムライン・現実構造を自ら犠牲にして輪廻者を排除する','残された道は異常の根源を修復するか、世界の死ぬ前に撤退するかのみ']},
                {min:0,max:0,title:'世界消滅',effects:['因果の連鎖・世界法則・タイムライン・現実構造がすべて停止する','未撤退のすべての実体の生命・意識・魂がまとめて完全に消去される']}
            ];
            const stabilityDescription=stable=>{
                if(s.設定?.世界超安定===true)return '<p class="we-muted">世界超安定 · 安定値は100に固定<br>新規の因果偏移と能動的な拒絶反応の昇格を禁止</p>';
                if(stable===null)return '<p class="we-muted">世界安定値は未記録</p>';
                const normalized=Math.max(0,Math.min(120,Number(stable)));
                const stage=stabilityStages.find(item=>normalized>=item.min&&normalized<=item.max);
                return stage?'<div class="we-stability-description"><p><b>'+text(stage.title)+'</b></p><ul>'+stage.effects.map(effect=>'<li>'+text(effect)+'</li>').join('')+'</ul></div>':'<p class="we-muted">安定値がプロトコル範囲外</p>';
            };
            const events=sortWorldEvents(state.事件,orbit);
            const active=events.filter(([,e])=>e.状態==='進行中'),future=events.filter(([,e])=>e.状態==='待发生');
            const relationRoster=s.関係リスト||{};
            const relationNamesByKey=new Map(entries(relationRoster).map(([name])=>[nameKey(name),name]));
            const peopleAll=new Map(entries(state.人物));entries(relationRoster).forEach(([n,p])=>{if(!peopleAll.has(n))peopleAll.set(n,{状態:p.登場?'登場':'场外',公开动态:p.態度||'',地点:'',目標:'',行动:''});});
            const userName=String(this.host.SillyTavern?.name1||this.env.SillyTavern?.name1||this.host.SillyTavern?.getContext?.()?.name1||this.host.name1||'').trim();
            const playerAliases=new Set([userName,'{{user}}','<user>','玩家'].filter(Boolean).map(nameKey));
            const deadAlienAliases=new Set(entries(w.異端レーダー?.名簿).filter(([,alien])=>alien?.状態==='死亡').map(([name])=>nameKey(name)));
            const people=new Map(Array.from(peopleAll).filter(([name])=>!playerAliases.has(nameKey(name))&&!deadAlienAliases.has(nameKey(name))));
            const formalPeople=new Map(entries(relationRoster)
                .filter(([name])=>!playerAliases.has(nameKey(name))&&!deadAlienAliases.has(nameKey(name)))
                .map(([name,rel])=>{
                    const backend=Array.from(people).find(([otherName])=>nameKey(otherName)===nameKey(name))?.[1];
                    return [name,backend||{状態:rel.登場?'登場':'场外',公开动态:rel.態度||'',地点:'',目標:'',行动:''}];
                }));
            const backstagePeople=Array.from(people).filter(([name])=>!relationNamesByKey.has(nameKey(name)));
            const person=(name,p,full=false)=>{
                const profileName=relationNamesByKey.get(nameKey(name))||'';
                const rel=profileName?relationRoster[profileName]||{}:{};
                return '<article class="'+(full?'we-card':'we-person')+'">'+(!full?'<div class="we-avatar">'+text(name.slice(0,1))+'</div>':'')+'<div><div class="we-card-top"><h3>'+text(name)+'</h3>'+pill(p.状態||(rel.登場?'登場':'场外'),'dim')+'</div><p>'+text(p.行动||p.公开动态||rel.態度||'行動記録なし')+'</p><div class="we-meta"><span>⌖ '+text(p.地点||'地点不明')+'</span>'+(p.预计结束?'<span>〜 '+text(dateLabel(p.预计结束))+'</span>':'')+'</div>'+(full?fields({档案类型:profileName?'正式な関係人物':'世界の活動人物',目標:p.目標,当前时间段:[p.开始时间,p.预计结束].filter(Boolean).join(' → '),下次检查:p.下次检查,所属世界:p.所属世界,好感度:rel.好感度})+details('person-'+name,{行程:p.行程,认知:p.认知,认知来源:p.认知来源,登场条件:p.登场条件,关联事件:p.关联事件,更新时间:p.更新时间,人物背景:rel.背景},'行程 · 認知 · 関連イベント'):'')+'</div></article>';
            };
            const compactPerson=(name,p)=>{
                const profileName=relationNamesByKey.get(nameKey(name))||'';
                const rel=profileName?relationRoster[profileName]||{}:{};
                const targetName=profileName||name;
                const inner='<span class="we-avatar">'+text(name.slice(0,1))+'</span><span class="we-person-copy"><strong>'+text(name)+'</strong><small>'+text(p.地点||'地点不明')+'</small><em>'+text(p.行动||p.公开动态||rel.態度||'新しい動向なし')+'</em></span>';
                return '<button class="we-person-compact" data-jump-person="'+text(targetName)+'" title="'+text(profileName?'正式人物の記録を表示':'世界人物の動向を表示；関係リストの記録は作成されません')+'">'+inner+'</button>';
            };
            const contextRows=context=>{
                const rows=[];
                for(const link of context?.背景关联||[])rows.push('<div class="we-context-row"><span class="we-context-kind">'+text(link.类型||'関連')+'</span><span class="we-context-copy"><b>'+text(link.名称||'名称未設定の関連')+'</b><small>'+text(link.关系||'継続的な関連')+'</small></span></div>');
                for(const eventName of context?.关联事件||[])rows.push('<button class="we-context-row" data-jump-event="'+text(eventName)+'"><span class="we-context-kind">事件</span><span class="we-context-copy"><b>'+text(eventName)+'</b><small>関連する世界イベントを表示 →</small></span></button>');
                return rows.length?'<div class="we-context-list">'+rows.join('')+'</div>':empty('背景関連なし','世界エンジンは継続的な組織/社交関係とイベント関連のみを記録し、人物の背景設定は重複して扱いません。');
            };
            const sceneLane=(title,items,kind)=>{
                const list=Array.isArray(items)?items:[];
                const body=list.map(item=>{
                    if(kind==='person'){
                        const meta=[item.关系,item.身分,item.档案类型||'世界の人物'].filter(Boolean).join(' · ');
                        const inner='<b>'+text(item.名称)+'</b><small>'+text(meta||'現場タグ')+'</small>'+(item.行动?'<p>'+text(item.行动)+'</p>':'');
                        return item.可查看档案&&item.档案名称
                            ?'<button class="we-scene-item" data-jump-person="'+text(item.档案名称)+'">'+inner+'</button>'
                            :'<article class="we-scene-item we-scene-label">'+inner+'</article>';
                    }
                    if(kind==='group')return '<article class="we-scene-item"><b>'+text(item.名称||'名称未設定の集団')+'</b><small>'+text([item.规模,item.身分].filter(Boolean).join(' · ')||'現場集団')+'</small>'+(item.动态?'<p>'+text(item.动态)+'</p>':'')+'</article>';
                    return '';
                }).join('');
                return '<div class="we-scene-lane"><div class="we-scene-lane-head"><b>'+text(title)+'</b><span>'+list.length+'</span></div>'+(body||'<div class="we-muted">記録なし</div>')+'</div>';
            };
            const sceneContextBody=context=>{
                const hasScene=!!(context&&(context.地区||context.身边人物?.length||context.现场群体?.length));
                if(!hasScene)return empty('周辺の展開なし','人物はまだ利用可能な地区の現場に一致していません；パネルを埋めるために周辺情報を捏造することはありません。');
                const control=[context.控制方?'制圧 · '+context.控制方:'',context.争夺方?.length?'争奪 · '+context.争夺方.join('、'):''].filter(Boolean).join(' · ');
                return '<div class="we-scene-hero"><div class="we-scene-head"><div><small>現在の世界現場</small><h3>'+text(context.地区||'名称未設定の地区')+'</h3></div><small>'+text(control||'制圧関係は未記録')+'</small></div>'+(context.地区动态?'<p>'+text(context.地区动态)+'</p>':'')+(context.环境状态?.length?'<div class="we-chips">'+context.环境状态.map(x=>pill(x,'dim')).join('')+'</div>':'')+'</div><div class="we-scene-grid">'+sceneLane('周辺の人物',context.身边人物,'person')+sceneLane('現場集団',context.现场群体,'group')+'</div>';
            };
            const areaSceneBody=record=>{
                const groups=Array.isArray(record?.现场群体)?record.现场群体:[];
                if(!groups.length)return '';
                return sceneLane('現場集団',groups,'group');
            };
            const eventTasks=(eventName,event)=>{
                const names=Array.from(new Set((Array.isArray(event.关联任务)?event.关联任务:[]).filter(name=>typeof name==='string'&&name.trim())));
                if(!names.length)return '';
                const roster=s.任務?.リスト||{};
                return '<div class="we-event-tasks"><div class="we-meta"><b>関連任務</b><span>'+names.length+' 件</span></div>'+names.map(name=>{
                    const task=Object.hasOwn(roster,name)&&plain(roster[name])?roster[name]:null;
                    const id='event-task-'+JSON.stringify([eventName,name]);
                    return '<details class="we-event-task" data-detail="'+text(id)+'"'+(opened.has(id)?' open':'')+'><summary><span class="we-task-name">'+text(name)+'</span>'+pill(task?.状態|| (task?'状態未記録':'任務記録なし'),'dim')+'</summary>'
                        +(task?'<p>'+text(task.目標||'目標は未記録')+'</p>'+fields({依頼元:task.依頼元,難易度:task.難易度,納品:task.納品}):'<p class="we-muted">現在の任務リストに該当する任務が見つからないため、イベント内の関連名称を保持します。</p>')+'</details>';
                }).join('')+'</div>';
            };
            const eventCard=(name,e)=>'<article class="we-card" data-event-card="'+text(name)+'"><div class="we-card-top"><h3>'+text(name)+'</h3><div class="we-card-tags">'+pill(e.分类||'近期节点',e.分类==='宏观节点'?'future':'dim')+pill(e.状態,e.状態==='待发生'?'future':e.状態==='進行中'?'':'dim')+'</div></div><div class="we-meta"><span>◷ '+text(eventScheduleLabel(e))+'</span><span>⌖ '+text(e.地点||'地点不明')+'</span></div><p>'+text(e.公开征兆||e.説明||'明確なイベント内容を待機中')+'</p>'+eventTasks(name,e)+details('event-'+name,{事件描述:e.説明,分类:e.分类,前因:e.前因,触发条件:e.条件,参与者:e.参与者,预计结束:e.预计结束,下次检查:e.下次检查,可见影响:e.可见影响,默认走向:e.默认走向,已确认结果:e.结果,更新时间:e.更新时间},'因果関連とイベント詳細')+'</article>';
            const timelineCards=list=>{
                const groups=[
                    ['現在進行中',list.filter(([,e])=>e.状態==='進行中'||(e.状態==='待发生'&&e.分类==='当前事件'))],
                    ['直近の橋渡し',list.filter(([,e])=>e.状態!=='進行中'&&e.状態==='待发生'&&e.分类==='近期节点')],
                    ['マクロアンカー',list.filter(([,e])=>e.状態!=='進行中'&&e.状態==='待发生'&&e.分类==='宏观节点')],
                    ['終了済み',list.filter(([,e])=>['已完成','已取消'].includes(e.状態))]
                ];
                const assigned=new Set(groups.flatMap(([,items])=>items.map(([name])=>name)));
                groups.push(['未分類の記録',list.filter(([name])=>!assigned.has(name))]);
                return groups.filter(([,items])=>items.length).map(([title,items])=>'<div class="we-timeline-group"><div class="we-timeline-group-title">'+text(title)+'<small>'+items.length+'</small></div>'+items.map(([n,e])=>eventCard(n,e)).join('')+'</div>').join('');
            };
            const matched=(name,obj)=>!this.query||(name+' '+Object.values(obj).filter(v=>typeof v==='string').join(' ')).toLowerCase().includes(this.query.toLowerCase());
            const calendarCandidates=events.filter(([n,e])=>matched(n,e)&&((this.filter||'全部')==='全部'||e.状態===this.filter));
            const tools=(filters=[])=>'<div class="we-tools"><input data-search aria-label="記録を検索" placeholder="名称・地点・内容を検索…" value="'+text(this.query||'')+'">'+filters.map(f=>'<button data-filter="'+f+'" class="'+((this.filter||'全部')===f?'active':'')+'">'+f+'</button>').join('')+'</div>';
            const calendar=()=>{
                const today=parseDate(w.時間);
                if(!today){const semantic=events.filter(([,e])=>!parseDate(e.时间||e.开始时间)&&String(e.时间||e.开始时间||'').trim()).slice(0,12);return '<div class="we-calendar"><h3>作品内タイムライン</h3><p class="we-muted">現在のアンカー · '+text(w.時間||'インスタンス時間なし')+'</p>'+(semantic.length?'<div class="we-timeline">'+semantic.map(([n,e])=>'<p><b>'+text(e.时间||e.开始时间)+'</b><br>'+text(n)+'</p>').join('')+'</div>':'<p class="we-muted">作品内の時間表記を持つイベントはありません</p>')+'</div>';}
                const customMonths=Array.isArray(w.暦法?.月日数)?w.暦法.月日数.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99).slice(0,24):[];
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
                let cells=['月','火','水','木','金','土','日'].map(x=>'<span>'+x+'</span>').join('')+'<span></span>'.repeat(first);
                for(let d=1;d<=count;d++){const key=y+'-'+m+'-'+d;cells+='<button data-action="date" data-date="'+key+'" aria-label="'+key+'" aria-pressed="'+(this.selectedDate===key)+'" title="'+key+' · '+(marked.get(key)||0)+' 件の一致イベント" class="'+(today.key===key?'today ':'')+(marked.has(key)?'has-event ':'')+(this.selectedDate===key?'selected':'')+'">'+d+'</button>';}
                return '<div class="we-calendar"><div class="we-calhead"><button class="we-btn" data-action="month" data-step="-1" aria-label="前月">‹</button><strong>'+y+' 年 '+m+' 月</strong><button class="we-btn" data-action="month" data-step="1" aria-label="翌月">›</button></div><div class="we-days">'+cells+'</div><div class="we-meta"><span>'+text(customMonths.length?(w.暦法?.名称||'作品暦')+' · 今月 '+count+' 日':'グレゴリオ暦表示 · 今月 '+count+' 日')+'</span><span>金枠 · 現在の日付</span><span>緑の点 · 予定済みイベント</span></div></div>';
            };
            const radar=w.異端レーダー||{};
            const alienAlive=entries(radar.名簿).filter(([,a])=>a&&a.状態!=='死亡').length;
            const showRadar=!(s.設定||{}).単一世界&&!(s.システム状態||{}).主神空間滞在中;
            const prose=v=>'<div class="we-reading we-world-laws">'+(Array.isArray(v)?v:[v]).map(paragraph=>'<article><p>'+text(paragraph)+'</p></article>').join('')+'</div>';
            const hero='<div class="we-hero"><div><div class="we-eyebrow">SAMSARA / WORLD ARCHIVE</div><h1>'+text(w.名称&&w.名称!=='待初始化'?w.名称:'世界は未構築')+'</h1><div class="we-world-ranks"><span>位格 <b>'+text(w.位格||'未記録')+'</b></span><span>難易度 <b>'+text(w.難易度||'未記録')+'</b></span></div><div class="we-muted">'+text(w.地点||'地点未確認')+' · '+text(orbit.現在段階&&orbit.現在段階!=='待初始化'?orbit.現在段階:'章の開始を待機中')+'</div></div><div class="we-date">'+text(w.時間||'インスタンス日付は未確認')+'<small>累計プレイ '+text((s.システム状態||{}).游玩天数||0)+' 日 · '+(reason?'進行停止中':'インスタンス進行中')+'</small></div></div>';
            let html=hero+(reason?'<div class="we-notice">'+text(reason)+'</div>':'')+(availabilityReason?'<div class="we-notice">'+text(availabilityReason)+'</div>':'');
            if(this.tab==='世界推进'){
                const offsets=entries(orbit.偏移記録);
                const stable=w.安定!==null&&w.安定!==''&&Number.isFinite(Number(w.安定))?Number(w.安定):null;
                const signed=n=>(n>0?'+':'')+n;
                const offsetCard=([name,r])=>{
                    const impact=r?.影響度!==null&&r?.影響度!==''&&Number.isFinite(Number(r?.影響度))?Number(r.影響度):null;
                    return '<article class="we-offset"><div class="we-offset-head"><b>'+text(name)+'</b><span>'+text(impact===null?'影響未記録':signed(impact))+'</span></div><p>'+text(r?.説明||'偏移の説明なし')+'</p><small>誘発者 · '+text(r?.誘発者||'未記録')+' · '+(impact===null?'未確認':impact<0?'因果の破壊':impact>0?'因果の修復 / 強化':'数値変化なし')+'</small></article>';
                };
                const causalHtml='<div class="we-causal"><div class="we-stability"><div><small>世界安定値</small><strong data-world-stability>'+text(stable===null?'未記録':stable)+'</strong></div><span>'+((s.設定||{}).世界超安定?'世界超安定 · 新規偏移を禁止':'基準 100 · 不安定化は世界の拒絶反応を強化')+'</span></div>'
                    +(stable===null?'':'<meter min="0" max="120" value="'+Math.max(0,Math.min(120,stable))+'" aria-label="世界安定値">'+stable+'</meter>')
                    +stabilityDescription(stable)
                    +'<div class="we-offset-heading">偏移記録 <span>'+offsets.length+' 件</span></div>'
                    +(offsets.length?offsets.slice(0,3).map(offsetCard).join('')+(offsets.length>3?'<details class="we-offset-more"><summary>残り '+(offsets.length-3)+' 件の偏移を展開</summary>'+offsets.slice(3).map(offsetCard).join('')+'</details>':''):empty('因果偏移なし','重要人物の命運・重大イベント・勢力構図が実質的に変化した後に記録されます。'))+'</div>';
                const shown=calendarCandidates.filter(([,e])=>this.calendarMode==='undated'?!parseDate(e.时间||e.开始时间):!this.selectedDate||parseDate(e.时间||e.开始时间)?.key===this.selectedDate);
                const macroCount=events.filter(([,e])=>e.分类==='宏观节点').length;
                const timelineView=snapshot?timelineState(s):null;
                const nextMacroName=timelineView?.下一宏观节点?.名称||'';
                const nextPair=nextMacroName?events.find(([n,e])=>n===nextMacroName&&e.分类==='宏观节点')||null:null;
                const nextNode=nextPair?.[0]||'マクロノードを待機中';
                const nextEvent=nextPair?.[1]||null;
                const compactPeople=Array.from(people).filter(([,p])=>p.行动||p.公开动态||p.地点).slice(0,4);
                html+='<div class="we-world-focus">'
                    +'<div class="we-world-focus-main">'+section('世界の動向',orbit.現在段階&&orbit.現在段階!=='待初始化'?'<div class="we-pulse"><span class="we-pulse-mark">LIVE</span><p>'+text(orbit.現在段階)+'</p></div>':empty('段階は未確認','世界進行は現在の世界情勢をそのまま因果軌道.現在段階へ書き込みます。'),'因果軌道 · 現在の段階')+'</div>'
                    +'<div class="we-world-focus-next">'+section('次のマクロノード',(nextEvent?'<button class="we-next-node" data-jump-event="'+text(nextNode)+'" title="タイムライン内の対応するマクロイベントへ移動">':'<div class="we-next-node">')+'<span>→</span><div><h3>'+text(nextNode)+'</h3><p>'+text(nextEvent?.公开征兆||nextEvent?.描述||'今回はまず実在するマクロノードの確立が必要です')+'</p><small>'+text(nextEvent?.时间||nextEvent?.开始时间||'時間未確認')+(nextEvent?' · クリックで移動 →':'')+'</small></div>'+(nextEvent?'</button>':'</div>'),'因果の境界')+'</div>'
                    +'</div>';
                html+='<div class="we-kpi-grid we-kpi-compact">'
                    +'<div class="we-kpi"><small>発生中</small><strong>'+active.length+'</strong><span>現在の活動イベント</span></div>'
                    +'<div class="we-kpi"><small>直近の橋渡し</small><strong>'+events.filter(([,e])=>e.分类==='近期节点'&&e.状態==='待发生').length+'</strong><span>次のマクロ境界まで</span></div>'
                    +'<div class="we-kpi"><small>マクロアンカー</small><strong>'+macroCount+'</strong><span>'+text(orbit.現在段階||'段階は未確認')+'</span></div>'
                    +'<div class="we-kpi"><small>場外の人物</small><strong>'+people.size+'</strong><span>'+future.length+' 件の将来イベント</span></div>'
                    +'</div>';
                html+='<div class="we-dashboard"><div class="we-command-main">'
                    +'<section class="we-section we-timeline-board" data-detail="world-calendar"><div class="we-section-head"><h2>イベントタイムライン</h2><small>'+events.length+' イベント · '+future.length+' 将来 · '+macroCount+' マクロ</small></div><div class="we-calendar-layout"><div class="we-calendar-slot">'+calendar()+'</div><div class="we-timeline-slot">'+tools(['全部','進行中','待发生','已完成','已取消'])+'<div class="we-tools"><span>'+text(this.calendarMode==='undated'?'日付未定 / 作品内時間':this.selectedDate||'全期間')+'</span><button data-action="today">今日へ戻る</button><button data-action="clear-date">全期間</button><button data-action="undated">日付未定のイベント</button></div>'+'<div class="we-timeline">'+(timelineCards(shown.slice(0,this.eventLimit||12))||empty('条件に一致するイベントはありません'))+'</div>'+(shown.length>(this.eventLimit||12)?'<button class="we-btn" data-action="more-events">さらに表示（全 '+shown.length+' 件）</button>':'')+'</div></div></section>'
                    +'</div><aside class="we-command-side">'
                    +section('因果状态',causalHtml,'安定と軌道偏移')
                    +section('货币与经济',exists(w.通貨)?fields({货币体系:w.通貨?.体系,購買力基準:w.通貨?.購買力基準,経済変動:w.通貨?.経済変動}):empty('通貨資料なし','世界進行は設定や経済情勢が明確になった時点で保守します。'),'世界進行が保守')
                    +(exists(w.法則)?section('世界法则',prose(w.法則),'現在有効なルール · '+(Array.isArray(w.法則)?w.法則.length:1)+' 件'):'')
                    +section('人物の動向',(compactPeople.length?'<div class="we-people-strip">'+compactPeople.map(([n,p])=>compactPerson(n,p)).join('')+'</div><button class="we-link-btn" data-tab="角色管理">人物名簿を表示 →</button>':empty('人物の動向なし')),'主要 NPC')
                    +'</aside></div>';
            }else if(this.tab==='角色管理'){
                if(showRadar&&alienAlive>0)html+='<div class="we-meta we-alien-count">異端の生存数 <b>'+alienAlive+'</b></div>';

                const alienByKey=new Map(entries(radar.名簿).map(([name,record])=>[nameKey(name),{名称:name,记录:record}]));
                const rolePeople=[
                    ...Array.from(formalPeople).map(([n,p])=>[n,p,{正式:true,异端:alienByKey.has(nameKey(n))}]),
                    ...backstagePeople.map(([n,p])=>[n,p,{正式:false,异端:alienByKey.has(nameKey(n))}])
                ];
                const list=rolePeople.filter(([n,p,meta])=>{
                    const searchable=meta.正式?Object.assign({},p,relationRoster[n]||{}):p;
                    if(!matched(n,searchable))return false;
                    if((this.filter||'全部')==='全部')return true;
                    const present=meta.正式&&!!relationRoster[n]?.登場;
                    return this.filter==='登場'?present:!present;
                });
                const chosen=list.find(([n])=>n===this.selectedPerson)||list[0];
                const chosenMeta=chosen?.[2]||{};
                const chosenContext=chosen?derivePersonWorldContext(s,chosen[0],userName):null;
                const chosenRelation=chosenMeta.正式&&plain(relationRoster[chosen?.[0]])?relationRoster[chosen[0]]:null;
                const chosenAudit=this.isNpcBuildAuditEnabled()&&chosenRelation?npcBuildAssessment(s,chosen[0],chosenRelation):null;
                const chosenAlien=chosen?alienByKey.get(nameKey(chosen[0]))?.记录:null;
                const auditPanel=chosenAudit?section('NPC構築監査',
                    '<div class="we-card"><div class="we-card-top"><h3>'+text(chosenAudit.审计级别)+'</h3>'+pill(chosenAudit.缺口.length?'待補強':'構築完了',chosenAudit.缺口.length?'future':'dim')+'</div>'
                    +fields({階層:chosenAudit.階層,当前组件:chosenAudit.当前组件})
                    +(chosenAudit.缺口.length?'<div class="we-chips">'+chosenAudit.缺口.map(x=>pill(x,'future')).join('')+'</div><p class="we-muted">进入世界推进请求的热人物会由后台优先补齐缺口；難易度スクリプトは既存コンポーネントの品質調整のみを担当します。</p>':'<p class="we-muted">現在の構築はこの階層の監査最低要件を満たしています。</p>')+'</div>',
                    '正式な関係人物のみ · NPC生成ルールを再利用'
                ):'';
                const backgroundPanel=chosen?section('背景関連',contextRows(chosenContext),(chosenContext?.背景关联?.length||0)+' 関係 · '+(chosenContext?.关联事件?.length||0)+' イベント'):'';
                const surroundingsPanel=chosen?section('周辺の展開',sceneContextBody(chosenContext),'シナリオ推演の現場タグ · 読み取り専用の派生'):'';
                const alienPanel=chosenAlien?section('異端記録',fields({出典:chosenAlien.出典,経歴:chosenAlien.経歴,陣営:chosenAlien.陣営,職業:chosenAlien.職業,階層:chosenAlien.階層,状態:chosenAlien.状態}),'異端レーダー · 読み取り専用'):'';
                const formalCount=rolePeople.filter(([, ,meta])=>meta.正式).length;
                const worldCount=rolePeople.length-formalCount;
                const roster=list.length?'<div class="we-roster-list">'+list.map(([n,p,meta])=>{
                    const rel=meta.正式?relationRoster[n]||{}:{};
                    const present=meta.正式&&!!rel.登場;
                    const status=present?'登場':p.状態||'场外';
                    const source=meta.正式?'正式記録':meta.异端?'異端 · 世界の人物':'世界の人物';
                    const summary=p.行动||p.公开动态||rel.態度||'次の世界推演を待機中';
                    return '<button class="we-roster-person '+(chosen?.[0]===n?'active':'')+'" data-person="'+text(n)+'"><span class="we-roster-copy"><b>'+text(n)+'</b><small>⌖ '+text(p.地点||'地点不明')+' · '+text(status)+'</small><em>'+text(summary)+'</em></span>'+pill(source,meta.异端?'future':'dim')+'</button>';
                }).join('')+'</div>':empty('条件に一致する人物がいません','フィルターを調整するか、世界の人物が活動範囲に入るのを待ってください。');
                html+=tools(['全部','登場','场外'])+'<div class="we-columns"><div>'
                    +section('人物名簿',roster,'正式 '+formalCount+' · 世界の人物 '+worldCount)
                    +(chosen?section('身分と現在の行動',person(chosen[0],chosen[1],true),chosenMeta.正式?'正式な関係人物':'世界のバックステージ人物')+surroundingsPanel+section('日程と行動',fields({行程:chosen[1].行程,开始时间:chosen[1].开始时间,预计结束:chosen[1].预计结束,下次检查:chosen[1].下次检查}))+auditPanel:empty('人物が選択されていません'))
                    +'</div><aside>'+backgroundPanel+alienPanel+(chosen?[['情報',chosen[1].认知来源||chosen[1].认知],['直近の動向',chosen[1].公开动态]].filter(([,v])=>exists(v)).map(([label,v])=>section(label,value(v))).join(''):'')+'</aside></div>';
            }else if(this.tab==='探索与势力'){
                const regionRecords=state.势力地区||{};
                const exploration=entries(w.探索).map(([name,ledger])=>[name,{...(regionRecords[name]||{}),...ledger,タイプ:'探索'}]);
                const factionList=entries(w.勢力).map(([name,ledger])=>[name,{...(regionRecords[name]||{}),...ledger,タイプ:'勢力'}]);
                const projectedNames=new Set([...exploration.map(([n])=>n),...factionList.map(([n])=>n)]);
                const backstageAreas=entries(regionRecords).filter(([name,r])=>r.タイプ!=='勢力'&&!projectedNames.has(name));
                const dir=this.directoryTab||'探索';
                const progressStage=value=>{
                    const n=Math.max(0,Math.min(100,Number(value)||0));
                    if(n>=100)return '核心';
                    if(n>=90)return '掌握';
                    if(n>=60)return '深部';
                    if(n>=30)return '熟知';
                    if(n>=10)return '初歩';
                    return '未踏';
                };
                const repStage=value=>{
                    const n=Number(value)||0;
                    if(n<=-5000)return '敵対';
                    if(n<=-1000)return '憎悪';
                    if(n<500)return '冷淡';
                    if(n<2000)return '中立';
                    if(n<5000)return '友好';
                    if(n<10000)return '崇敬';
                    return '崇拝';
                };
                const chosenArea=exploration.find(([n])=>n===this.selectedArea)||exploration[0];
                const chosenFaction=factionList.find(([n])=>n===this.selectedFaction)||factionList[0];

                html+='<div class="we-notice">ここに表示されるのは決算台帳であり、地図データベースではありません： <b>世界.探索</b> 内の全体的なランドマークだけが探索報酬の対象です；バックステージにまだ投影されていない地区は探索名簿に現れません。勢力の声望も、勢力からプレイヤーへの実際の関係決算のみを記録します。</div>';
                html+='<div class="we-tools">'+['探索','热点','勢力'].map(t=>'<button data-directory="'+t+'" class="'+(dir===t?'active':'')+'">'+t+'</button>').join('')+'</div>';

                if(dir==='探索'){
                    const cards=exploration.map(([n,r])=>{
                        const progress=Math.max(0,Math.min(100,Number(r.探索度)||0));
                        const control=r.控制方||'支配権不明';
                        const environment=Array.isArray(r.环境状态)?(r.环境状态.length?r.环境状态.length+'項':'未記録'):r.环境状态||'未記録';
                        return '<button class="we-explore-card '+(chosenArea?.[0]===n?'active':'')+'" data-area="'+text(n)+'">'
                            +'<div class="we-explore-head"><div><small>探索ランドマーク</small><h3>'+text(n)+'</h3></div><span class="we-risk-badge">リスク '+text(r.リスク||'F')+'</span></div>'
                            +'<div class="we-explore-score"><strong>'+progress+'<small>%</small></strong><span>'+text(progressStage(progress))+'</span></div>'
                            +'<div class="we-explore-bar"><i style="width:'+progress+'%"></i></div>'
                            +'<div class="we-explore-meta"><span>制圧 · '+text(control)+'</span><span>環境 · '+text(environment)+'</span></div>'
                            +'<p>'+text(r.説明||r.公开动态||'区域の説明なし')+'</p>'
                            +'</button>';
                    }).join('');
                    const areaDetail=chosenArea?(()=>{
                        const [n,r]=chosenArea;
                        const backstage=regionRecords[n]||{};
                        return '<div class="we-area-detail"><div class="we-area-facts">'+fields({リスク:r.リスク,控制方:r.控制方||'不明',争夺方:r.争夺方,环境状态:r.环境状态})+'<div class="we-area-note">'+text(r.説明||'確定済みのプレイヤー探索の説明はありません。')+'</div></div>'
                            +areaSceneBody(backstage)
                            +'<div class="we-area-archive">'+(exists(backstage.进展)||exists(backstage.公开动态)||exists(backstage.资源)||exists(backstage.近期变化)?details('area-world-'+n,{世界进展:backstage.进展,公开动态:backstage.公开动态,资源:backstage.资源,近期变化:backstage.近期变化},'世界地区記録'):'')
                            +(exists(r.隠された真実)?details('area-truth-'+n,{隠された真実:r.隠された真実},'主持人档案'):'')+'</div></div>';
                    })():empty('探索ランドマークなし','世界.探索にすでに投影された全体区域のみがここに表示されます。');
                    html+=section('探索決算名簿','<div class="we-explore-grid we-explore-index">'+(cards||empty('探索ランドマークなし','プレイヤーが実際に全体区域を発見するのを待機します。'))+'</div>');
                    html+=section('区域記録',areaDetail,'地区の現場とバックステージ記録 · 上のランドマークをクリックして切り替え');
                    if(backstageAreas.length){
                        html+=section('バックステージ未投影地区','<details><summary>'+backstageAreas.length+' 件の世界地区がまだプレイヤーの探索報酬に算入されていません</summary>'+backstageAreas.map(([n,r])=>'<div class="we-brief-row"><b>'+text(n)+'</b><span>'+text(r.进展||r.公开动态||r.説明||'バックステージ稼働中')+'</span></div>').join('')+'</details>','ゲームマスター参考のみ · 探索報酬には不算入');
                    }
                }else if(dir==='热点'){
                    const hotspots=events.filter(([,e])=>e.状態==='進行中');
                    html+=section('現在のホットスポット',hotspots.map(([n,e])=>eventCard(n,e)).join('')||empty('進行中のホットスポットなし','世界に現在進行中のイベントはありません。'));
                }else{
                    const factionCards=factionList.map(([n,r])=>{
                        const rep=Number(r.声望)||0,stage=repStage(rep),width=Math.min(100,Math.max(0,rep)/100);
                        return '<button class="we-faction-card '+(chosenFaction?.[0]===n?'active':'')+'" data-faction="'+text(n)+'"><div class="we-card-top"><h3>'+text(n)+'</h3><span class="we-risk-badge">実力 '+text(r.実力||'F')+'</span></div>'
                            +'<div class="we-rep"><span>声望 '+rep+'</span><b>'+text(stage)+'</b></div><div class="we-explore-bar"><i style="width:'+width+'%"></i></div>'
                            +'<div class="we-muted">'+(rep>0?'正の声望ボーナス重み '+(rep/100).toFixed(1)+'×（合計上限 3×）':'スペースコイン報酬：0（声望が正でない）')+'</div>'
                            +'<p>'+text(r.説明||r.目標||'勢力の説明なし')+'</p><small>'+text(r.領地||'領地未記録')+'</small></button>';
                    }).join('');
                    const factionDetail=chosenFaction?'<h3>'+text(chosenFaction[0])+'</h3>'+fields({実力:chosenFaction[1].実力,声望:chosenFaction[1].声望,关系阶段:repStage(chosenFaction[1].声望),領地:chosenFaction[1].領地,目標:chosenFaction[1].目標,説明:chosenFaction[1].説明,当前进展:chosenFaction[1].进展}):empty('勢力記録なし');
                    html+=section('勢力決算名簿','<div class="we-explore-layout"><div class="we-faction-grid">'+(factionCards||empty('既知の勢力なし'))+'</div><aside class="we-area-side">'+section('勢力記録',factionDetail,'左の勢力をクリックして切り替え')+'</aside></div>','声望は勢力からプレイヤーへの実際の関係のみを反映');
                }
            }else if(this.tab==='资产'){
                const ownersOf=asset=>Array.from(new Set((Object.hasOwn(asset,'所属対象')?(Array.isArray(asset.所属対象)?asset.所属対象:[asset.所属対象]):['<user>']).map(x=>String(x??'').trim()).filter(x=>x&&x!=='无主')));
                const assets=entries(s.资产).filter(([,asset])=>plain(asset));
                const list=assets.filter(([name,asset])=>{
                    const owners=ownersOf(asset),category=this.filter||'全部';
                    return (category==='全部'||category==='玩家相关'&&owners.includes('<user>')||category==='共同持有'&&owners.length>1||category==='无主'&&!owners.length)&&matched(name,{...asset,归属:owners.join(' ')});
                });
                html+=tools(['全部','玩家相关','共同持有','无主']);
                html+=section('資産と帰属',list.map(([name,asset])=>{
                    const owners=ownersOf(asset);
                    const ownerLinks=owners.length?owners.map(owner=>{
                        const label=owner==='<user>'?(userName||'プレイヤー'):owner;
                        if(owner!=='<user>'&&(relationNamesByKey.has(nameKey(owner))||people.has(owner)))return '<button data-jump-person="'+text(relationNamesByKey.get(nameKey(owner))||owner)+'">'+text(label)+' ↗</button>';
                        if(Object.hasOwn(w.勢力||{},owner))return '<button data-faction="'+text(owner)+'" data-asset-owner>'+text(label)+' ↗</button>';
                        return pill(label,'dim');
                    }).join(''):pill('无主','dim');
                    return '<article class="we-card" data-asset-card="'+text(name)+'"><div class="we-card-top"><h3>'+text(name)+'</h3>'+pill(asset.タイプ||'タイプ未記録','dim')+'</div><div class="we-tools"><b>所属対象</b>'+ownerLinks+(owners.length>1?pill('共同持有','future'):'')+'</div><p>'+text(asset.状態||'状態未記録')+'</p>'+fields({主体規模:asset.主体規模,完全度:asset.完全度==null?undefined:asset.完全度+'%'})+details('asset-'+name,{エネルギー:asset.エネルギー,建設シーケンス:asset.建設シーケンス,駐留人員:asset.駐留人員,待機イベント:asset.待機イベント},'運転詳細 · 建設 / 駐留 / 対応待ち')+'</article>';
                }).join('')||empty('条件に一致する資産なし'),'全 '+assets.length+' 件 · 名称・所属対象・状態で検索できます');
            }else if(this.tab==='世界事件'){
                const list=events.filter(([n,e])=>matched(n,e)&&((this.filter||'全部')==='全部'||e.状態===this.filter));
                html+=tools(['全部','進行中','待发生','已完成','已取消'])+section('世界事件','<div class="we-timeline">'+(timelineCards(list)||empty('条件に一致する世界イベントはありません','現在のイベント・直近ノード・マクロノードごとに整理されます。'))+'</div>','状態階層と因果順に並びます');
            }else if(this.tab==='噂'){
                html+=tools();
                for(const category of ['街頭の噂','情報取引','布告と檄文'])html+=section(category,entries((s.噂||{})[category]).filter(([n,r])=>matched(n,r)).map(([n,r])=>'<article class="we-card"><h3>'+text(n)+'</h3><p>'+text(r.内容||r.要約)+'</p>'+fields({出典:r.出典||r.売り手||r.発布者,信頼度:r.信頼度,要求価格:r.要求価格,位置:r.掲示位置})+details('rumor-'+n,{真の内幕:r.真の内幕},'主持人档案')+'</article>').join('')||empty('該当なし：'+category,'噂はすでに発生したイベントと伝播経路から生まれます。'));
                html+=section('伝播チェーン',entries(state.传播).map(([n,r])=>'<article class="we-card"><div class="we-card-top"><h3>'+text(n)+'</h3>'+pill(r.状態,'dim')+'</div><p>'+text(r.内容)+'</p>'+fields({时间:r.时间,出典:r.出典,范围:r.范围,受众:r.受众,到期时间:r.到期时间})+details('spread-'+n,{关联事件:r.关联事件,引发行动:r.引发行动,真相:r.真相},'因果と伝播の詳細')+'</article>').join('')||empty('伝播チェーンなし'));
            }else if(this.tab==='运行记录'){
                if(showRadar&&exists(radar.現在モード))html+=section('干涉模式','<article class="we-card"><p>'+text(radar.現在モード)+'</p></article>');

                const historyMemory=projectWorldHistoryMemory(state);
                html+=section('近期历史锚点',entries(historyMemory.近期锚点).reverse().map(([n,r])=>'<article class="we-card"><div class="we-meta">'+text(r.时间)+'</div><p>'+text(r.事实)+'</p>'+fields({关联事件:r.关联事件})+'</article>').join('')||empty('未収納の直近アンカーはありません'),(historyMemory.统计?.原始锚点总数||0)+' 件の原始履歴 · 現在のホットルートノードのみ表示');
                html+=section('长期历史总结',(historyMemory.长期总结||[]).slice().reverse().map(r=>'<article class="we-card"><div class="we-card-top"><h3>'+text(r.名称)+'</h3>'+pill('L'+text(r.階層),'dim')+'</div><div class="we-meta">'+text([r.起始时间,r.结束时间].filter(Boolean).join(' → '))+'</div><p>'+text(r.要約)+'</p></article>').join('')||empty('長期の履歴要約はまだありません','履歴アンカーが蓄積されると自動で階層圧縮されます；下層の事実はMVUに保持されたままです。'),(historyMemory.统计?.总结节点总数||0)+' 件の要約ノード · 原始履歴は削除されません');
            }else if(this.tab==='設定'){
                const api=this.normalizeDedicatedApi(this.config.dedicatedApi);
                const fontButtons=Object.entries(WORLD_FONT_SCALES).map(([key,item])=>'<button class="we-setting-btn '+(this.config.fontScale===key?'active':'')+'" data-font-option="'+key+'">'+text(item.name)+' · '+text(item.size)+'</button>').join('');
                const presets=api.apiPresets.map(p=>'<option value="'+text(p.name)+'">'+text(p.name)+'</option>').join('');
                const modelOptions=Array.from(new Set([api.model,...api.fetchedModels].filter(Boolean))).map(model=>'<option value="'+text(model)+'"></option>').join('');
                const terminalReady=!!(this.host.Samsara?.terminal?.apiReady?.());
                const sourceState=this.usesDedicatedApi()
                    ?(this.dedicatedApiReady()?'専用 API は準備完了':'専用 API は引き継いだが、設定がまだ不完全です')
                    :(terminalReady?'主神端末の追加モデルを使用':'主神端末の追加モデルはまだ準備できていません');
                html+=section('画面文字サイズ','<div class="we-setting-row"><div class="we-setting-copy"><b>画面文字サイズ</b><small>色調は主神端末に追従；ここでは世界進行自身の文字サイズのみを調整します。</small></div><div class="we-setting-actions">'+fontButtons+'</div></div>','色調は主神端末に追従 · 既定は標準 16px');
                const historyToProse=this.config.sendHistoryToProse===true;
                html+=section('履歴記憶','<div class="we-setting-row"><div class="we-setting-copy"><b>本文へ履歴記憶を提供</b><small>有効にすると、本文AIが“直近の原始アンカー + より古い長期要約”を追加で読み取ります；無効でも影響するのは本文のみで、世界進行自身は常に完全な階層履歴を使用します。</small></div><div class="we-setting-actions"><button class="we-setting-btn we-switch '+(historyToProse?'on':'')+'" data-action="history-prose-toggle"><span>'+text(historyToProse?'有効':'無効')+'</span><span class="we-switch-track"><i></i></span></button></div></div>','既定はオフ · 原始履歴の事実はオフにしても削除されません');
                html+=section('模型接口',
                    '<div class="we-setting-row"><div class="we-setting-copy"><b>現在の呼び出し元</b><small>'+text(sourceState)+'</small></div><div class="we-setting-actions"><span class="we-source-badge">'+text(this.apiSourceLabel())+'</span></div></div>'
                    +'<div class="we-setting-row"><div class="we-setting-copy"><b>世界進行システム専用 API</b><small>有効にすると世界進行はここだけを使用し、ステータスバー / 主神端末の APIを呼び出しません；設定が不完全でも黙ってフォールバックすることはありません。</small></div><div class="we-setting-actions"><button class="we-setting-btn we-switch '+(api.enabled?'on':'')+'" data-action="dedicated-toggle"><span>'+text(api.enabled?'有効':'無効')+'</span><span class="we-switch-track"><i></i></span></button></div></div>'
                    +(api.enabled
                        ?'<div class="we-api-toolbar"><select class="we-setting-input" data-dedicated-preset><option value="">— 保存済み API プリセットを選択 —</option>'+presets+'</select><input class="we-setting-input" data-dedicated-preset-name maxlength="80" placeholder="プリセット名"><button class="we-setting-btn" data-action="dedicated-preset-save">プリセットを保存</button><button class="we-setting-btn" data-action="dedicated-preset-delete">プリセットを削除</button></div>'
                         +'<div class="we-api-grid"><label class="wide">API アドレス<input class="we-setting-input" data-dedicated-field="apiUrl" value="'+text(api.apiUrl)+'" placeholder="https://example.com/v1"></label><label class="wide">API Key<input class="we-setting-input" data-dedicated-field="apiKey" type="password" value="'+text(api.apiKey)+'" autocomplete="off" placeholder="sk-..."></label><label>モデル<input class="we-setting-input" data-dedicated-field="model" list="we-dedicated-models" value="'+text(api.model)+'" placeholder="モデル名を入力または読み込み"><datalist id="we-dedicated-models">'+modelOptions+'</datalist></label><label>モデルカタログ<span class="we-setting-actions"><button class="we-setting-btn" data-action="dedicated-models">モデルを読み込み / 接続テスト</button></span></label></div>'
                         +'<p class="we-muted">インターフェースは OpenAI-compatible /v1/chat/completions と /v1/models 方式で接続し、JSON Schema → JSON Object → プレーンテキストへの構造化互換フォールバックを保持します。</p>'
                        :'<div class="we-notice">現在は専用 API がオフです。世界進行は引き続き主神端末の「追加モデル設定」を使用します；ここでステータスバーの API Keyを複製・読み取りすることはありません。</div>')
                    ,'インターフェース設定はローカルの localStorage にのみ保存され、MVUには書き込まれません');
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
                html+='<div class="we-preset-toolbar"><div><b>プロンプトワークベンチ</b><small>主要な操作は上部に固定されているため、保存のためにページ最下部までスクロールする必要はありません。</small></div><div><button class="we-btn we-primary" data-action="save">現在の設定を保存</button><button class="we-btn" data-action="save-default">個人用デフォルトとして保存</button><button class="we-btn" data-action="preview">次のリクエストをプレビュー</button></div></div>';
                html+=section('プリセット文書','<div class="we-doc-create"><input data-doc-name maxlength="80" placeholder="文書名（例：原作進行・標準）" value="'+text(activeDoc?.builtin?'':activeDoc?.name||'')+'"><button class="we-btn we-primary" data-action="doc-save">文書として保存</button><button class="we-btn" data-action="doc-import">文書をインポート</button><input data-doc-import type="file" accept=".json,application/json" hidden></div>'+
                    (docs.length?'<div class="we-doc-list">'+docs.map(doc=>'<div class="we-doc-row"><div><b>'+text(doc.name)+(doc.builtin?' <span class="we-doc-badge">組み込みデフォルト</span>':'')+'</b><small>'+text(doc.updatedAt?new Date(doc.updatedAt).toLocaleString():'日時未記録')+(doc.id===this.config.activePromptDocumentId?' · 現在適用中':'')+'</small></div><span class="we-doc-actions"><button data-action="doc-apply" data-doc-id="'+text(doc.id)+'">適用</button><button data-action="doc-export" data-doc-id="'+text(doc.id)+'">エクスポート</button>'+(doc.builtin?'':'<button data-action="doc-delete" data-doc-id="'+text(doc.id)+'">削除</button>')+'</span></div>').join('')+'</div>':empty('プリセット文書はまだありません','現在の設定を保存すると、ここで適用・エクスポート・削除ができます。')),'組み込みの“デフォルト設定”は常にコード版に追従します；“個人用デフォルトとして保存”は編集可能なすべてのプロンプト・本文ウィンドウ・資料範囲を別名で保存し、組み込みテンプレートを上書きしません');
                html+='<div class="we-notice">世界書カタログはキャラクター本体のブック、キャラクター追加ブック、現在のチャットに紐づくブック、酒場でグローバル有効なブックを読み取ります。青ランプと緑ランプはエントリの発動方式を示します；“実際の読み取り”はリクエスト検査の今回の一覧が基準です。</div>';
                const groups=new Map();
                for(const e of this.bookCatalogue||[]){if(!groups.has(e.book))groups.set(e.book,[]);groups.get(e.book).push(e);}
                const selectedEntries=Array.isArray(promptView.selectedEntries)?promptView.selectedEntries:null;
                const selected=e=>!e.technical&&(this.isNpcAuditWorldbook(e)?this.isNpcBuildAuditEnabled():selectedEntryMatches(e,selectedEntries));
                html+=section('資料読み取り範囲','<div class="we-config-row"><label>本文ウィンドウ <input data-floors type="number" min="1" max="100" value="'+text(promptView.contextTurns||6)+'"> 層</label><label>読み取り方式 <select data-activation><option value="respect_activation" '+(promptView.activationMode!=='force_selected'?'selected':'')+'>青ランプ・緑ランプに従う</option><option value="force_selected" '+(promptView.activationMode==='force_selected'?'selected':'')+'>チェック項目を強制読み取り</option></select></label></div><p class="we-muted">青ランプ・緑ランプに従う：青ランプは常駐、緑ランプは上記の本文ウィンドウのキーワードを走査；無効な項目は読みません。強制モードでは通常の無効項目も含められますが [variables]、[mvu_update]、本文の追加思考、および任務/出力の技術エントリは常に隔離されます。未紐づけでグローバル有効でもない世界書は自動的に読み取られません。</p><div class="we-tools"><button data-action="books">カタログを読み込み / 更新</button><button data-action="book-all">すべて選択</button><button data-action="book-none">すべて解除</button></div>'+
                    (groups.size?Array.from(groups).map(([book,list])=>'<details class="we-book" open><summary>'+text(book)+' <small>'+text((list[0]?.sources||[]).join(' · ')||'紐づけ済み')+' · '+list.filter(selected).length+' / '+list.length+' 件選択済み</small></summary><div class="we-book-list">'+list.map(e=>{
                        const report=(this.readReport||[]).find(r=>r.世界书===e.book&&r.条目ID===e.id);
                        return '<label class="we-book-row"><input type="checkbox" data-book value="'+text(JSON.stringify([e.book,e.id]))+'" '+(selected(e)?'checked':'')+' '+(e.technical?'disabled':'')+'><span class="we-lamp '+(e.technical?'gray':e.mode==='constant'?'blue':e.mode==='selective'?'green':'gray')+'" title="'+text(e.technical?'技術エントリ · 隔離済み':e.mode==='constant'?'青ランプ · 常駐':e.mode==='selective'?'緑ランプ · キーワード発動':'その他の発動方式')+'"></span><span class="we-book-title"><b>'+text(e.title)+'</b><small>'+text(e.technical?'技術エントリ · 世界エンジンは読み取りません':(e.mode==='constant'?'常駐':e.mode==='selective'?'キーワード：'+(Array.isArray(e.keys)?e.keys.map(k=>typeof k==='string'?k:'正規表現条件').join('、'):e.keys):e.mode)+(e.enabled?'':' · 無効'))+'</small></span><small class="we-read-state">'+text(report?'前回の検査：'+report.原因:e.technical?'固定隔離':'未検査')+'</small></label>';
                    }).join('')+'</div></details>').join(''):empty('カタログ未読み込み','“カタログを読み込み / 更新”をクリックして、現在紐づいている世界書とグローバル有効な世界書を読み取ります。')));
                const segments=splitPresetSegments(promptView.preset);
                html+=section('セグメントプロンプト','<div class="we-segment-toolbar"><span>既定は読み取り専用、展開して閲覧；編集を開始すると変更できます。</span><button class="we-btn" data-action="prompt-edit" aria-pressed="'+!!this.promptEditing+'">'+(this.promptEditing?'編集をロック':'編集を開始')+'</button><button class="we-btn" data-action="segment-add" '+(this.promptEditing?'':'disabled')+'>＋ セグメント追加</button></div><div class="we-segment-list" data-segment-list>'+segments.map((part,i)=>'<details class="we-segment" data-segment-row><summary>'+text(part.title||'名称未設定のセグメント')+' <small>'+formatTokenCount(estimateTokens(part.body),true)+'</small></summary><div class="we-segment-head"><input '+(this.promptEditing?'':'readonly')+' data-segment-title aria-label="セグメントタイトル '+i+'" placeholder="セグメントタイトル（空欄可）" value="'+text(part.title)+'"><small>'+formatTokenCount(estimateTokens(part.body),true)+'</small><span class="we-segment-actions"><button type="button" '+(this.promptEditing?'':'disabled')+' data-action="segment-up" title="上へ移動">↑</button><button type="button" '+(this.promptEditing?'':'disabled')+' data-action="segment-down" title="下へ移動">↓</button><button type="button" '+(this.promptEditing?'':'disabled')+' data-action="segment-delete" title="削除">削除</button></span></div><textarea '+(this.promptEditing?'':'readonly')+' data-segment="'+i+'" data-title="'+text(part.title)+'" aria-label="プリセットセグメント '+i+'">'+text(part.body)+'</textarea></details>').join('')+'</div><p class="we-muted">これらのセグメントは主要な作業レイヤーで、追加・削除・順序変更が可能です。コア制約と条件付きプロンプトは下で個別に編集し、同じプリセット文書と一緒に保存されます。</p>');
                html+=section('系统提示词','<div class="we-notice">ここに表示されるテキストはすべて実際の system リクエストに直接含まれ、プリセット文書とともに保存・適用・インポート・エクスポートされます。条件付きプロンプトは対応する条件が成立した時だけ送信されます；固定なのはプログラムフィールドの Schema のみです。</div>'+                    '<details class="we-segment"><summary>世界引擎核心约束 · '+(this.promptEditing?'編集中':'クリックで展開')+'</summary><textarea data-core-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.corePrompt??CORE_WORLD_RULES)+'</textarea><p class="we-muted">常に送信されます。変更または空欄可；空欄にするとコア制約は追加注入されません。</p></details>'+                    '<details class="we-segment"><summary>マクロ骨格の受渡し · 条件付きプロンプト</summary><textarea data-macro-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.macroPrompt??DEFAULT_MACRO_PROMPT)+'</textarea><p class="we-muted">今回、マクロ骨格の確立/補完が必要な時のみ送信されます。</p></details>'+                    '<details class="we-segment"><summary>世界の自己修復 · 条件付きプロンプトテンプレート</summary><textarea data-stability-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.stabilityPromptTemplate??DEFAULT_STABILITY_PROMPT_TEMPLATE)+'</textarea><p class="we-muted">世界安定値が100未満かつ世界超稳が有効でない時に送信されます。 {{段階}}、{{稳定值}}、{{规则}} プレースホルダーを使用できます。</p></details>'+                    '<details class="we-segment"><summary>角色管理 · NPC構築監査 · '+(this.isNpcBuildAuditEnabled()?'現在有効':'現在オフ')+'</summary><textarea data-npc-audit-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.npcAuditPrompt??NPC_BUILD_AUDIT_RULES)+'</textarea><p class="we-muted">スイッチの状態にかかわらず編集・保存できます；監査が有効で、かつ今回監査対象が存在する時のみ送信されます。</p></details>','コアと条件付きプロンプトはどちらも編集可能');
                html+=section('WorldResult 出力プロトコル','<details class="we-segment"><summary>WorldResult プロトコル説明 · クリックで展開</summary><textarea data-structure-prompt '+(this.promptEditing?'':'readonly')+'>'+text(promptView.structurePrompt??protocol().split('【Canonical WorldResult JSON Schema】')[0].trim())+'</textarea></details><details class="we-segment"><summary>プログラムフィールド Schema · 読み取り専用</summary><textarea readonly>'+text(JSON.stringify(WORLD_RESULT_SCHEMA,null,2))+'</textarea></details><p class="we-muted">プロトコル説明は上部の編集スイッチを使用します。保存後は実際の system リクエストに使われます；Schema は固定で読み取り専用、テキストプロンプトを変更してもプログラム変数の構造は変わりません。</p>');
            }else if(this.tab==='请求检查'){
                const fold=(title,body)=>'<details class="we-inspect"><summary>'+text(title)+'</summary><div class="we-inspect-body">'+body+'</div></details>';
                const raw=(label,v)=>fold(label,'<textarea class="we-raw" readonly>'+text(v)+'</textarea>');
                const readable=(name,v)=>Array.isArray(v)?v.map((item,i)=>fold((item.名称||item.楼层!==undefined&&(item.キャラ+' · 第 '+item.楼层+' 層')||name+' '+(i+1)),fields(item))).join(''):fields(plain(v)?v:{内容:v});
                const retryLog=(this.lastRetryLog||[]).map(item=>{
                    const feedback=retryFeedback(item.错误,Array.isArray(item.片段)?item.片段:[],Array.isArray(item.补充清单)?item.补充清单:[]);
                    const details=feedback.issues.length?'<p><b>具体的な問題</b><br>'+feedback.issues.map(text).join('<br>')+'</p>':'';
                    const guidance=feedback.actions.length?'<p><b>修正要件</b><br>'+feedback.actions.map(text).join('<br>')+'</p>':'';
                    return '<div class="we-change"><time>#'+text(item.尝试)+'</time><div><b>モデルの応答が拒否されました</b><p>'+text(feedback.summary)+'</p>'+details+guidance+'</div></div>';
                }).join('');
                const tokenLabel=(value,estimated=true)=>Number.isFinite(Number(value))?formatTokenCount(Number(value),estimated):'—';
                html+=section('失败自动重试','<div class="we-config-row"><label>最大試行回数 <input data-retries type="number" min="1" max="5" value="'+text(this.config.retryAttempts??5)+'"> 回</label><span class="we-muted">初回リクエストを含みます。1 = 一度だけリクエスト；5 = 最大で合計5回試行。修正するのは WorldResult の業務結果/コンパイル検証のみで、危険な権限逸脱・コンテキスト変化・書き込み未確認は自動再試行しません。</span></div>'+(this.lastAttemptCount?'<p class="we-muted">直近は合計 '+text(this.lastAttemptCount)+' 回試行しました；モデルの業務拒否は毎回、最後の失敗も含めて以下に完全に保持されます。</p>':'')+(retryLog||''));
                html+='<div class="we-tools"><button data-action="preview">次のリクエストプレビューを生成（実際の APIは呼び出しません）</button></div>';
                for(const [label,r] of [['最近の実際の送信',this.lastRequest],['次のリクエストプレビュー',this.previewRequest]]){
                    if(!r){html+=section(label,empty('記録なし：'+label));continue;}
                    const m=r.manifest||{},books=m.世界书条目||[],floors=m.正文楼层||[],obs=m.观测||requestTokenTelemetry(r.system,r.input,r.schema||WORLD_RESULT_SCHEMA);
                    const readChecks=(m.读取判定||[]).filter(item=>item.读取===true);
                    const exactInput=obs.实际输入Tokens!=null,exactOutput=obs.实际输出Tokens!=null;
                    let body='<div class="we-request-summary">'+pill(m.输出协议||'WorldResult v1','dim')+pill('構造化 '+(obs.结构化实际模式||m.结构化输出||'auto'),'dim')+pill(obs.接口来源||m.接口来源||this.apiSourceLabel(),'dim')+pill(books.length+' 件の世界書','dim')+pill(floors.length+' 層の本文','dim')+pill((exactInput?tokenLabel(obs.实际输入Tokens,false):tokenLabel(obs.请求估算Tokens,true))+' 入力','dim')+(obs.输出估算Tokens!=null?pill((exactOutput?tokenLabel(obs.实际输出Tokens,false):tokenLabel(obs.输出估算Tokens,true))+' 出力','dim'):'')+(m.尝试序号?pill('試行 '+m.尝试序号,'dim'):'')+(m.最大尝试次数!==undefined?pill('最大試行 '+m.最大尝试次数,'dim'):'')+'</div>';
                    const userTokenFields=Object.fromEntries((obs.User分段||[]).map(item=>[item.名称,tokenLabel(item.估算Tokens,true)]));
                    body+='<p class="we-muted">“≈”付きの tk はローカル容量の概算にすぎず、プロバイダの実際の token とは異なります；主神端末の経路で usage が取得できない場合は正確な総量を確認できません。総入力 = System + 以下の User 内訳；ここでは User の総計や Schema の子項目は重複表示しません。専用 API が usage を返す場合、総入力/出力のみサーバー側の実際の tokenに切り替わります。</p>';
                    body+=fold('Token 構成（クリックで展開）',fields(Object.assign({总输入:exactInput?tokenLabel(obs.实际输入Tokens,false):tokenLabel(obs.请求估算Tokens,true),System:tokenLabel(obs.System估算Tokens,true)},userTokenFields,{接口:obs.接口来源||m.接口来源||'',模型:obs.模型||'',模式尝试:Array.isArray(obs.模式尝试)&&obs.模式尝试.length?obs.模式尝试.join(' → '):'',耗时:Number.isFinite(Number(obs.耗时毫秒))?(Number(obs.耗时毫秒)/1000).toFixed(2).replace(/\.00$/,'')+' s':''}))+fold('system セグメント',fields({分段:(obs.System分段||[]).map(item=>item.名称+' · '+tokenLabel(item.估算Tokens,true))})));
                    body+=fold('今回実際に読み取った資料（クリックで展開）',(readChecks.length?readable('エントリ',readChecks):empty('今回世界書を読み取りませんでした','チェックに一致した、または強制読み取りの世界書エントリがありません。'))+fold('実際に読み取った世界書',fields({条目:books.map(item=>item.名称+' · '+tokenLabel(item.估算Tokens,true))}))+fold('実際の本文階層',fields({楼层:floors.map(f=>'第 '+f.楼层+' 層 · '+f.キャラ+' · '+tokenLabel(f.估算Tokens,true))}))+fold('時間容量',fields(m.本轮时间容量||{})));
                    body+=fold('出力契約 · JSON Schema',raw('samsara_world_result_v1',JSON.stringify(r.schema||WORLD_RESULT_SCHEMA,null,2)));
                    body+=fold('system · セグメント閲覧',r.system.split(/\n(?=【)/).map((part,i)=>fold((part.match(/^【([^】]+)】/)||[])[1]||'アイデンティティ / プロトコル '+(i+1),'<div class="we-prose">'+text(part)+'</div>')).join(''))+raw('system · 実際の送信原文',r.system);
                    let payload;try{payload=JSON.parse(r.input);}catch(_){payload={正文:r.input};}
                    body+=fold('user · セグメント閲覧',Object.entries(payload).map(([name,v])=>fold(name,readable(name,v))).join(''))+raw('user · 実際の送信原文',r.input);
                    html+=section(label,body);
                }
                if(this.lastWorldResult)html+=section('最近の WorldResult · 業務層',raw('モデルが受理し累積した業務結果',JSON.stringify(this.lastWorldResult,null,2)));
                if((this.lastCompiledPatches||[]).length)html+=section('プログラムコンパイルパッチ · ストレージ層',raw(' WorldResult Compiler が生成；モデルはこれらのパスを直接制御しません',JSON.stringify(this.lastCompiledPatches,null,2)));
                if((this.lastCompileWarnings||[]).length)html+=section('コンパイル警告',(this.lastCompileWarnings||[]).map(w=>'<div class="we-notice">'+text(w)+'</div>').join(''));
                if(this.lastFailure)html+='<div class="we-notice">'+text(this.lastFailure)+'</div>';
                if(this.lastReply){const lastAttempt=(this.lastAttemptTelemetry||[]).at(-1),replyTk=lastAttempt?.API输出Tokens!=null?formatTokenCount(lastAttempt.API输出Tokens,false):formatTokenCount(estimateTokens(this.lastReply),true);html+=section('副 API の生の応答 · '+replyTk,raw('モデルの返答原文を表示（フォーマット問題の特定用）',this.lastReply));}
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
    // オプション戦略層：NPC 構築監査は既定でオフ；同時にメイン変数 Schema の派生キャッシュを取り込み、実行可能なイベント修正情報を提供する。
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
                if(parents.includes(name))throw new Error('事件前因非法自引用：'+name+'；前因はイベント自身を参照できません。明確な前因がない場合は []を使用してください');
                const missing=parents.filter(id=>!Object.hasOwn(events,id));
                if(missing.length)throw new Error('事件前因不存在：'+name+' <- '+missing.join('、')+'；前因は既に存在するイベント名、または今回同時に提出して構築に成功したイベント名のみ参照できます；現在の段階/自然言語の理由は前因として扱えません。明確な前因がない場合は []を使用してください');
            }
        }
        return validateStateBeforeActionableEventRefs(stat);
    };

    const retryPlanBeforeActionableEventRefs=retryPlanForFailure;
    retryPlanForFailure=function(error,rejected=[]) {
        const messages=[String(error?.message||error||''),...(rejected||[]).map(item=>String(item?.原因||''))].join('\n');
        const plan=retryPlanBeforeActionableEventRefs(error,rejected).map(line=>String(line)
            .replace('且每个名称都必须对应已建立且未取消的宏观节点。','且每个名称都必须对应已建立且未取消的宏观节点；現在の段階・現在のイベント・直近ノードは書かないでください。'));
        if(/事件前因(?:不存在|非法自引用)/.test(messages))plan.push('事件前因：まずチェーンの先頭にある欠落または自己参照を修正し、その後で影響を受ける後続ノードを再提出してください。前因配列にはイベント名のみを入れ、既存または同輪で構築に成功したものに限ります；現在の段階/自然言語の理由はイベントとして扱いません。明確な前因がない場合は []と書いてください。エラーを消すためにイベントを捏造してはなりません。');
        if(/字段未通过完整 Schema 校验/.test(messages))plan.push('Schema修正：エラー箇所の業務フィールドのみを修正してください；真属性/最终属性/强化はバックステージの派生キャッシュであり、モデルは補写できません。この種の派生差分はプログラムが吸収します。');
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

    // NPC 構築監査自体がすでに正確な不足を計算している；ここでは失敗フィードバックを強化するだけで、既存の通過/却下判定は変更しない。
    const ensureNpcBuildAuditProgressBeforeConcreteFeedback=ensureNpcBuildAuditProgress;
    ensureNpcBuildAuditProgress=function(next,required=[],acceptedResult) {
        try{return ensureNpcBuildAuditProgressBeforeConcreteFeedback(next,required,acceptedResult);}
        catch(error){
            if(!/NPC构筑审计未推进/.test(String(error?.message||error||'')))throw error;
            const proposals=Array.isArray(acceptedResult?.关系)?acceptedResult.关系:[];
            const details=[];
            for(const before of required||[]){
                const target=stableNameIn(next?.関係リスト||{},before.名称);
                if(!target)continue;
                const after=npcBuildAssessment(next,target,next.関係リスト[target]);
                if(!after)continue;
                const proposal=proposals.find(item=>nameKey(item?.名称)===nameKey(before.名称));
                const touched=proposal&&(before.建议字段||[]).some(field=>Object.hasOwn(proposal,field));
                if(touched&&after.缺口.length<before.缺口.length)continue;
                const submitted=proposal?Object.keys(proposal).filter(field=>!['名称','操作'].includes(field)):[];
                const unresolved=(after.缺口||[]).length?after.缺口:before.缺口||[];
                const suggested=(after.建议字段||before.建议字段||[]).filter(Boolean);
                details.push(
                    before.名称+'：未解决缺口：'+(unresolved.length?unresolved.join('、'):'未识别')
                    +'；推奨修正フィールド：'+(suggested.length?suggested.join('、'):'なし')
                    +'；今回の実際の提出：'+(submitted.length?submitted.join('、'):'なし')
                );
            }
            if(!details.length)throw error;
            throw new Error('NPC构筑审计未推进：\n'+details.map(item=>' - '+item).join('\n')+'\n修正要件：列挙された各監査対象について、今回は少なくとも一つの実際の不足を補ってください；好感度・HP・無関係なフィールドだけを変更することは禁止です。');
        }
    };

    const WORLD_STATE_DERIVED_SCHEMA_KEYS=new Set(['真属性','最終属性','强化']);
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
            this.status=(this.config.npcBuildAuditEnabled?'NPC構築監査を有効化':'NPC構築監査を無効化')+(wasBusy?' · 現在の推演を停止しました':'');
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
                meta.textContent=version?version[0]:'世界進行';
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
            if(this.tab==='設定'){
                const block=this.host.document.createElement('section');
                block.className='we-section';block.setAttribute('data-npc-audit-setting','');
                block.innerHTML='<div class="we-section-head"><h2>NPC構築監査 <span class="we-pill future">実験的機能</span></h2><small>オプション機能 · 既定はオフ</small></div>'
                    +'<div class="we-setting-row"><div class="we-setting-copy"><b>ホット NPC の構築を自動補完</b><small>オフのときは職業・血統・装備・スキル・形態を走査・補写しません；関係は実際のシナリオに従って通常どおり疎に同期されます。オンにした場合のみ、ホット NPC に対して構築ギャップ監査を実行します。实体生成规则・NPC生成规则・状态协议の資料チェックはこのスイッチに同期します。</small></div>'
                    +'<div class="we-setting-actions"><button class="we-setting-btn we-switch '+(enabled?'on':'')+'" data-action="npc-audit-toggle" aria-pressed="'+enabled+'"><span>'+(enabled?'有効':'無効')+'</span><span class="we-switch-track"><i></i></span></button></div></div>';
                const sections=Array.from(main.children),modelSection=sections.find(section=>section.querySelector?.('h2')?.textContent?.trim()==='模型接口');
                main.insertBefore(block,modelSection||null);
            }else if(this.tab==='角色管理'&&!enabled){
                for(const note of main.querySelectorAll('.we-muted')){
                    if(note.textContent.includes('进入世界推进请求的热人物会由后台优先补齐缺口'))note.textContent='自動構築監査は現在オフです；ここでは診断のみを表示します。設定タブで一時的に自動補完を有効にできます。';
                }
            }
        }
    };
    // 噂は常駐の活性層：公開噂は世界に常に可視の動向を保証し、バックステージの伝播がその因果的来源と人物の知情チェーンを担う。
    const RUMOR_LIVELINESS_TOPICS=['悬赏线索','商路动向','势力情报','遗迹坐标','人物行踪','黑市消息','宝物传闻','怪物异动','深渊异变','种族摩擦','物价波动'];
    const RUMOR_PUBLIC_CATEGORIES=['街頭の噂','情報取引','布告と檄文'];
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

    // 「最大3件」は表示ウィンドウであり、モデル出力の検証ではない。すべての書き込みはまず通常どおりマージし、その後オブジェクト順に直近3件をローリング保持する。
    // replace は JS オブジェクトのキー順を変えないため、今回更新された同名エントリを末尾へ再挿入し、本当に「最新」として扱われるようにする。
    function trimRumorCapacity(stat) {
        const removed=[];
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const bucket=stat?.噂?.[category];
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
            if(parts.length!==3||parts[0]!=='噂'||!RUMOR_PUBLIC_CATEGORIES.includes(parts[1]))continue;
            const bucket=stat?.噂?.[parts[1]];
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
        // コア層の旧「>3でエラー」検証と互換：シャドウ状態で表示ウィンドウまで切り詰めてから、残りの完全な検証を実行する。
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
        const backend=stat?.世界?.[PATH]||{},rumors=stat?.噂||{},events=backend.事件||{},propagation=backend.传播||{};
        const worldTime=String(stat?.世界?.時間||''),now=worldDateKey(worldTime);
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
            if(!updatedText)reasons.push('更新時間がありません');
            if(expiry!==null&&now!==null&&expiry<=now){reasons.push('期限切れ');semantic=true;}
            if(touched!==null&&now!==null&&now-touched>=RUMOR_STALE_HOURS){reasons.push('72時間以上未確認');semantic=true;}
            const changedEvents=[];
            for(const eventName of Array.isArray(record.关联事件)?record.关联事件:[]){
                const event=events[eventName];if(!plain(event))continue;
                const eventTouched=rumorEventTouchedKey(event);
                if((eventTouched!==null&&(touched===null||eventTouched>touched))||['已完成','已取消'].includes(event.状态))changedEvents.push(eventName);
            }
            if(changedEvents.length){reasons.push('関連イベントに新しい進展：'+changedEvents.join('、'));semantic=true;}
            if(!reasons.length)continue;
            review.push({
                名称,原因:reasons,需语义变化:semantic,
                現在:{出典:String(record.来源||''),范围:String(record.范围||''),时间:String(record.时间||''),更新时间:updatedText,到期时间:String(record.到期时间||''),内容:String(record.内容||''),状態:String(record.状态||''),受众:copy(record.受众||[]),引发行动:copy(record.引发行动||[]),关联事件:copy(record.关联事件||[])}
            });
        }
        const linked=new Set(Object.values(propagation).flatMap(record=>Array.isArray(record?.关联事件)?record.关联事件:[]));
        const candidates=Object.entries(events).filter(([name,event])=>{
            if(!plain(event)||!['進行中','已完成'].includes(event.状态)||linked.has(name))return false;
            const visible=String(event.公开征兆||'').trim()||(Array.isArray(event.可见影响)&&event.可见影响.length);
            return !!visible;
        }).slice(-6).map(([名称,event])=>({名称,状態:event.状态,地点:String(event.地点||''),公开征兆:String(event.公开征兆||''),更新时间:String(event.更新时间||event.时间||'')}));
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
        if(!plain(required)||String(next?.世界?.名称||'')!==String(required.世界||'')||String(next?.世界?.時間||'')!==String(required.世界时间||''))return;
        const shortages=[];
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const count=Object.keys(plain(next?.噂?.[category])?next.噂[category]:{}).length;
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
            const before=item.現在||{};
            const semantic=['范围','内容','受众','引发行动','状態','到期时间'].some(key=>!same(record?.[key],before?.[key]));
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
        if((match=message.match(/传闻为空未补足：([^；\n]+)/)))plan.push('噂のメンテナンス：'+match[1]+'。空分類は今回2件の実世界情報を補ってください；三分類はそれぞれ直近3件を表示、約60字/件、根拠なく<user>を中心にしないこと。');
        if((match=message.match(/传播链仍未复核：([^；\n]+)/)))plan.push('伝播のメンテナンス：'+match[1]+'。一件ずつ現在の世界時間まで更新し、范围/受众/内容/引发行动を進めてください；伝播がすでに終了している場合は終了または削除し、そのまま再提出しないこと。');
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
            if(Array.isArray(request.timeAnomalies))request.timeAnomalies=request.timeAnomalies.filter(item=>item?.タイプ!=='传闻维护');
            if(Array.isArray(payload.本轮必须修复的时间越界记录))payload.本轮必须修复的时间越界记录=payload.本轮必须修复的时间越界记录.filter(item=>item?.タイプ!=='传闻维护');
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
                if(rumorMaintenanceNeeded(stat))result.push({タイプ:'传闻维护',名称:'常驻传闻与传播链',字段:'活跃性',值:'需复核',説明:'公開噂が空、または伝播チェーンを進める必要があります'});
                return result;
            };
            try{return await super.run();}
            finally{if(temporalAnomalies!==temporalAnomaliesBeforeRumorRecovery)temporalAnomalies=temporalAnomaliesBeforeRumorRecovery;}
        }
    };
    // 任務感知層：任務.リスト は既存 MVU における唯一の正式な任務台帳であり、世界エンジンは読み取り専用で消費し、第二のバックグラウンド任務ライブラリを作らない。
    const TASK_AWARENESS_RULES=`【任务感知 · 只读】
任务列表是世界因果来源之一。世界推进不得创建、删除或修改任务，也不得推进任务状态、交付、结算或奖励；任务影响只通过事件、人物行动、势力地区、探索与传播表现。事件可用“关联任务”引用当前任務.リスト中已存在的任務名，作为因果出典；禁止引用不存在的任务。
情报交易由世界引擎生成或刷新；购买、扣款、消费性删除及购买后创建任务由MVU/变量AI处理，世界引擎下一轮只读接续。副本成就、击杀、奖励与惩罚不进入世界推进上下文。`;
    const TASK_WORLD_BOOK_TITLE='任务与委托系统';
    // 旧版では正式な任務ルールを組み込み既定資料から除外していた；現在は読み取り可能な権威ルールとして復元する。
    BUILTIN_DEFAULT_WORLD_BOOK_EXCLUSIONS.delete(TASK_WORLD_BOOK_TITLE);

    function projectTaskListForWorld(value) {
        if(!plain(value))return {};
        const out={};
        for(const [name,task] of Object.entries(value)){
            if(!plain(task))continue;
            const projected={};
            for(const key of ['依頼元','目標','隠された真実','難易度','納品','状態']){
                if(Object.hasOwn(task,key))projected[key]=copy(task[key]);
            }
            if(Object.keys(projected).length)out[name]=projected;
        }
        return out;
    }

    const projectWorldContextBeforeTaskAwareness=projectWorldContext;
    projectWorldContext=function(stat) {
        const out=projectWorldContextBeforeTaskAwareness(stat);
        const tasks=projectTaskListForWorld(stat?.任務?.リスト);
        if(Object.keys(tasks).length)out.任務={リスト:tasks};
        return out;
    };

    const compileWorldResultBeforeTaskAwareness=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        const taskNames=new Set(Object.keys(stat?.任務?.リスト||{}));
        for(const event of result.事件||[]){
            if(!Array.isArray(event?.关联任务))continue;
            for(const taskName of event.关联任务){
                const name=String(taskName||'').trim();
                if(name&&!taskNames.has(name))throw new Error('事件/'+String(event.名称||'名称未設定')+'：関連任務が存在しません：'+name);
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
                payload.输入语义.当前变量='世界進行専用のホットデータ投影；世界、人物能力、完全な資産台帳、アクティブな伝播、直近の履歴、直近の因果偏移、および任務.リストの読み取り専用の因果フィールドを含みます。任務報酬、ペナルティ、副本実績、キル、ショップ、純粋な決算データは世界進行には入りません。';
                payload.输入语义.任务列表='読み取り専用の因果台帳。イベントは关联任务で既存の任務を参照できます；任務の作成・削除・状態変更・提出・決算は禁止です。';
            }
            request.input=JSON.stringify(payload,null,2);
            // 前バージョンの噂活性層における旧表現との互換；購入後の消費的 remove は世界エンジンの責務ではない。
            request.system=String(request.system||'').replace(
                '情报交易有卖家时更新1~2条，购买后移除；',
                '情报交易有卖家时更新1~2条；购买结算由变量AI按正文事实处理；'
            )+'\n\n'+TASK_AWARENESS_RULES;
            request.manifest=Object.assign({},request.manifest,{任务感知:{任务数量:Object.keys(payload?.当前变量?.任務?.リスト||{}).length,只读:true,インスタンス実績:false}});
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
    };
    // 原作/データベース時間軸の保護層：マクロノードはまず権威ある時間資料に従い、その後で区間の詳細を展開する。
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
        // 「日まで明確」な資料のみをハード検証のアンカーとする。月単位、上旬・中旬・下旬、前後順序はソフトな計画根拠であり、
        // モデルに慎重なスケジューリングを委ね、妥当な推定の差異で拒否/再試行が延々と続くのを避ける。
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
        for(const [name,item] of Object.entries(stat?.世界?.因果軌道?.偏移記録||{}))records.push({名称:name,...(plain(item)?item:{})});
        for(const item of result?.因果?.偏移記録||[])if(plain(item))records.push(item);
        return records.some(item=>{
            if(Number(item?.影響度)===0)return false;
            const marker=chronologyCompactName(item?.名称),desc=String(item?.説明||'');
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
            const status=String(event.状态||stored?.状態||'待发生');
            if(category!=='宏观节点'||status!=='待发生')continue;
            if(!Object.hasOwn(event,'时间')&&!Object.hasOwn(event,'开始时间'))continue;
            const evidence=chronologyEvidenceForEvent(event.名称,guard.books);if(!evidence)continue;
            if(chronologyShiftDeclared(stat,result,event.名称))continue;
            const proposedRaw=String(event.时间||event.开始时间||'').trim(),proposed=worldDateKey(proposedRaw);
            if(proposed===null)throw new Error('宏观节点日期未服从原著/数据库时间锚点：'+event.名称+'；資料は明確に '+evidence.raw+'を示しています；曖昧または比較不能な時間へ変更してはなりません。確認済みの因果偏移による期日変更であれば、同輪で当該ノードを明示的に関連付けた因果.偏移记录を提出しなければなりません。');
            if(Math.floor(proposed/24)!==Math.floor(evidence.key/24))throw new Error('宏观节点日期与原著/数据库时间锚点冲突：'+event.名称+' 提交 '+proposedRaw+'；資料は明確に '+evidence.raw+'を示しています；物語を進めるために原作時間を前倒ししたり圧縮してはなりません。確認済みの因果偏移による期日変更であれば、同輪で当該ノードを明示的に関連付けた因果.偏移记录を提出しなければなりません。');
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
        if(/宏观节点日期(?:未服从|与).*原著\/数据库时间锚点/.test(messages))plan.unshift('マクロ時間軸：日まで明確な原作/データベースの日付衝突のみを訂正し、その日付に再び従ってください。月・時段・前後順序しかないノードまで無理に日単位へ精密化しないこと；後者は原作のテンポに合わせて慎重に余白を残せば十分です。');
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
            ACTIVE_CHRONOLOGY_GUARD={worldTime:String(state?.世界?.時間||''),books:merged.slice()};
            const next=payload?.时间线调度?.下一宏观节点||null;
            payload.时间线基准={
                当前世界时间:String(state?.世界?.時間||''),
                下一宏观节点:next?{名称:String(next.名称||''),当前排期:String(next.時間||'')}:null,
                原著时间资料:chronologyOnly.length?'資料から '+chronologyOnly.length+' 件の明確なタイムライン/年表を読み込みました':'明確なタイムライン項目が見つかりません；モデルが持つ原作知識で慎重に推定し、物語を進めるためにスパンを圧縮してはなりません',
                规划原则:{
                    滚动窗口:'3~5個のマクロノードは現在の計画視野にすぎず、全篇章を覆う必要はありません；近めに計画する方が、遠い大事件をまとめて詰め込むより望ましい。',
                    节点粒度:'マクロノード一つは一つの段階転換のみを表します；遠征、集結、連続戦役、複数の独立した劇情段階は分割するかスパンを広げてください。',
                    间隔自检:'スケジューリング前に、前ノードから本ノードまで現実に何を経る必要があるかを判断し、移動・準備・組織動員・因果の発展に十分な時間を残してください。',
                    时间精度:'資料が月/時段/順序までしかない場合は同じ精度を保ち慎重に余白を残し、並べ替えの便宜のために日単位の日付を無理に作らないこと。'
                },
                要求:'マクロノードはまず原作/データベースの日付・ノード粒度・妥当なスパンを定め、その後に現在→次ノードの区間を展開します。日まで明確な日付には必ず従うこと；月・時段・順序のみの場合はソフト制約として慎重に計画し、推定の差異で期日を繰り返し変更しないこと。'
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
                校验模式:'日まで明確な資料はハード検証；月・時段・順序とノード粒度はソフト誘導',
                当前世界时间:String(state?.世界?.時間||''),
                时间线资料:chronologyOnly.map(book=>String(book?.名称||'')).filter(Boolean),
                下一宏观节点:next?String(next.名称||''):''
            };
            manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
    };
    // 自動進行ポリシー：上部スイッチが自動スケジューリングを独立制御；リクエスト検査ページで進行間隔を設定；戦闘中は一時停止しラウンドも数えない。
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
            if(snapshot?.stat?.システム状態?.戦闘中===true)return '戦闘中のため、世界進行を一時停止します';
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
            // 「処理マーク + 実際のバックグラウンド内容」が同時に存在する場合にのみ、このチャットが実際に世界進行を実行済みだと判断できる。
            // 開局/変数の再処理では古い 已处理楼层 だけを引き継ぐ場合がある；バックグラウンドが空のままなら、現在の本文を最初の有効な本文として直ちに進行させる。
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
            // 変数の再処理は本層の MVU を再構築するが、本文フィンガープリントは変わらない。期限到来済みの層のコミットマークが
            // ロールバックされた場合は追い実行を許可する；重複通知や間隔内でスキップされた層は追加のラウンドとして数えない。
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
            // VARIABLE_UPDATE_ENDED は MVU が層へ書き戻す前に発火する；デバウンス後にセーブを読み込みラウンドを数える。
            // そうしないと初回更新では stat_data を読めず、再処理では古い処理済みマークを読む可能性がある。
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
                this.status='自動進行はオフ · 手動で進行できます';
            }else{
                this.resetAutoProgressCycle();
                this.status='自動進行はオン';
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
            button.title=this.config.autoProgress?'自動進行はオン':'自動進行はオフ';
            button.innerHTML='<span>自動進行</span><span class="we-switch-track"><i></i></span>';
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
            section.innerHTML='<div class="we-section-head"><h2>自動進行の頻度</h2><small>本文ラウンド</small></div>'+
                '<div class="we-config-row"><label>進行間隔 <input data-auto-progress-interval type="number" min="1" max="20" value="'+interval+'" '+(enabled?'':'disabled')+'> ラウンド</label><span class="we-muted">'+
                (enabled?'初回に条件が成立した時、または世界のバックグラウンドが未構築と検出された時は直ちに進行；以降は本文応答のラウンドで発火します。2 = 本文1・3・5…回目の後に進行；1 = 毎ラウンド進行。戦闘中はラウンドを数えません。':'自動進行はオフのため、この設定はスケジューリングに参加しません。')+
                '</span></div>';
            const input=section.querySelector('[data-auto-progress-interval]');
            input?.addEventListener('change',()=>{
                const value=Math.max(1,Math.min(20,Number(input.value)||2));
                this.config.autoProgressInterval=Math.round(value);input.value=String(this.config.autoProgressInterval);
                this.resetAutoProgressCycle();this.saveConfig();
                this.status='自動進行の間隔を '+this.config.autoProgressInterval+' ラウンドに設定しました';
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
    // 自動進行トリガーの再構築：本文の完了が主入口；変数の再処理は確認済み結果を復元するだけで、世界 AI を再度呼び出さない。
    const WORLD_REPLAY_VERSION=1;
    const WORLD_REPLAY_SCOPES=[
        ['世界','通貨'],['世界','暦法'],['世界',PATH],['世界','因果軌道'],['世界','勢力'],['世界','探索'],
        ['世界','異端レーダー','名簿'],['世界','安定'],['噂'],['资产'],['関係リスト']
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
            if(path[0]==='世界'&&['勢力','探索'].includes(path[1])&&path.length>=3)return true;
            if(path[0]==='世界'&&path[1]==='因果軌道'&&path[2]==='偏移記録'&&path.length>=4)return true;
            if(path[0]==='噂'&&path.length>=3)return true;
            if(path[0]==='资产'&&path.length>=2)return true;
            if(path[0]==='関係リスト'&&path.length>=3)return true;
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
            // 世界進行のコミット成功：MVU が実際に保存する前に、今回の「実際の変更」を同一層の復元パッケージへ圧縮して併せて保存する。
            if(pending&&handled===pending&&plain(before?.stat_data)&&plain(variables.stat_data)){
                const replay=this.buildWorldReplayPackage(before.stat_data,variables.stat_data,pending);
                if(replay)variables.__samsaraWorldReplay=replay;
                if(this.worldReplayManualForce)this.worldReplayMarkEventInternal();
                return !!replay;
            }

            // MVU の「変数再処理」は現在メッセージの stat_data/schema を先に空にするが、未知の root フィールドは保持する。
            // 現在メッセージ自身の replay フィンガープリント、または before 内の 已处理楼层 が旧結果を証明できる場合にのみ、同一本文の再処理と判定する。
            const current=this.worldReplayCurrentMessage();
            if(!current||!plain(variables.stat_data))return false;
            const mvu=this.env.Mvu||this.host.Mvu;
            let raw;try{raw=mvu?.getMvuData?.({type:'message',message_id:current.id});}catch(_){return false;}
            if(!raw||plain(raw.stat_data))return false;
            const storedReplay=raw.__samsaraWorldReplay;
            const beforeHandled=String(before?.stat_data?.世界?.[PATH]?.已处理楼层||'');
            const replayMatches=plain(storedReplay)&&String(storedReplay.fingerprint||'')===current.fingerprint;
            if(!replayMatches&&beforeHandled!==current.fingerprint)return false;

            // 再処理自体は新しいゲームラウンドではなく、世界 AI を発火させてもならない；世界エンジンに本イベントを内部復元として扱わせる。
            this.worldReplayMarkEventInternal();
            const replay=storedReplay;
            if(!plain(replay)||String(replay.fingerprint||'')!==current.fingerprint){
                this.status='変数の再処理済み · 本メッセージに復元可能な世界進行スナップショットがありません';
                this.render();
                return false;
            }
            if(!this.applyWorldReplayPackage(variables.stat_data,replay)){
                this.status='変数の再処理済み · 世界進行の復元パッケージが無効なため、自動再推演は行いません';
                this.render();
                return false;
            }
            variables.__samsaraWorldReplay=copy(replay);
            this.autoProgressCycleKey=this.autoProgressContextKey({fingerprint:current.fingerprint,stat:variables.stat_data});
            this.autoProgressHasRun=true;
            this.autoProgressRoundsSinceRun=0;
            this.autoProgressLastSeenFingerprint=current.fingerprint;
            this.autoProgressDueFingerprint=current.fingerprint;
            this.status='本メッセージの世界進行結果を復元しました · AIを再呼び出ししていません';
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
            // regenerate / swipe / 同一層の本文再生成は新しい進行ラウンドとして数えない。
            // その層が本来進行すべきだった場合は、本文が変わった後に必ず再実行する；本来は間隔スキップだった場合は、引き続きスキップする。
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
            // 明示的な手動「世界を進行」の場合にのみ、同一本文が 已处理楼层 を迂回して再推演することを許可する。
            // ここではリクエストが使うコピーのみを変更する；旧世界状態と復元パッケージは新リクエストが成功するまで常に MVU 内に保持される。
            if(this.worldReplayManualForce&&snapshot?.fingerprint&&snapshot?.stat?.世界?.[PATH]?.已处理楼层===snapshot.fingerprint){
                snapshot.stat.世界[PATH].已处理楼层='';
                snapshot.stat.世界[PATH].已处理時間='';
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
            // メイン本文の終了後に変数 AI が解析中なら、まず変数を待つ；変数イベントを取りこぼしても再確認し、自動進行が永久に失活しないようにする。
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
                    // 本文は完了したが本層の MVU がまだ保存されていない：短時間リトライする；VARIABLE_UPDATE_ENDED が先に来ればそのまま引き継ぐ。
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
    // フォールトトレラントな検収ポリシー：完全性の保守は段階的に補完し、補助モジュールが世界進行の一巡全体を止めてしまわないようにする。
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

    // 「表示層」と「検収層」の時間アンカー定義を統一する：条件/前因 はそれ自体が正当な因果スケジュールラベルを生成できる。
    unscheduledEvents=function(stat) {
        return Object.entries(stat?.世界?.[PATH]?.事件||{}).filter(([,event])=>{
            if(!['待发生','進行中'].includes(event?.状态))return false;
            return !eventHasUsableSchedule(event);
        }).map(([名称,event])=>({
            名称,分类:event.分类,状態:event.状态,条件:event.条件,
            前因:copy(event.前因||[]),当前时间:eventScheduleLabel(event)
        }));
    };

    // 時間/条件/前因 が本当に一切ない旧イベントは依然として保守リストに入るが、今回の他の合格結果を否決することはない。
    ensureEventTimeAnchors=function(next,required=[]) {
        const missing=[];
        for(const item of required||[]){
            const event=next?.世界?.[PATH]?.事件?.[item.名称];
            if(!event||!['待发生','進行中'].includes(event.状态))continue;
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
        if(!plain(required)||String(next?.世界?.名称||'')!==String(required.世界||'')||String(next?.世界?.時間||'')!==String(required.世界时间||''))return result;
        for(const category of RUMOR_PUBLIC_CATEGORIES){
            const count=Object.keys(plain(next?.噂?.[category])?next.噂[category]:{}).length;
            const initial=Number(required?.公开传闻?.[category]?.当前数量)||0;
            if(initial===0&&count===0)result.公开传闻.push(category);
        }
        for(const item of required.本轮必须复核的传播链||[]){
            const record=next?.世界?.[PATH]?.传播?.[item.名称];
            if(!record||propagationEnded(record,worldDateKey(required.世界时间)))continue;
            const updated=String(record.更新时间||'').trim()===String(required.世界时间||'').trim();
            const before=item.現在||{};
            const semantic=['范围','内容','受众','引发行动','状態','到期时间'].some(key=>!same(record?.[key],before?.[key]));
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
                硬错误:'Schema・不正な状態・因果参照の破損・明確な時間軸の衝突',
                软维护:'イベント日程の補完、噂の補充、伝播の再確認；ターンをまたいで段階的に完了でき、ターン全体を止めてはならない'
            };
            request.input=JSON.stringify(payload,null,2);
            request.system=String(request.system||'')+'\n\n'+SOFT_MAINTENANCE_RULES;
            request.manifest=Object.assign({},request.manifest,{验收策略:{模式:'分级验收',事件因果锚点可接受:true,传闻补齐:'软维护'}});
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema);
            return request;
        }
    };

    // プレイヤー探索は長期/決算の台帳：実際に全体地区へ進入した時点で最低10%を自動記録し、離脱後も回収しない。
    const EXPLORATION_PROJECTION_RULES='【玩家探索投影硬约束】全体区域に実際に到達した時点で少なくとも10%の探索を記録する；遠方のバックステージ地区は自動投影しない；区域を離れた後も探索台帳は保持する。';
    function explorationLocationContainsArea(location,areaName) {
        const locationKey=nameKey(location),areaKey=nameKey(areaName);
        return !!locationKey&&!!areaKey&&(locationKey===areaKey||locationKey.includes(areaKey));
    }
    function ensureCurrentExplorationProjection(stat,result) {
        if(stat?.システム状態?.主神空間滞在中)return;
        const location=String(stat?.世界?.地点||'').trim();if(!location)return;
        const areas=new Map(Object.entries(stat?.世界?.[PATH]?.勢力地区||{}).map(([name,record])=>[nameKey(name),{名称:name,记录:record}]));
        for(const item of result?.势力地区||[]){
            if(!plain(item)||item.操作==='撤销本轮')continue;
            const id=nameKey(item.名称),old=areas.get(id);
            areas.set(id,{名称:old?.名称||item.名称,记录:Object.assign({},old?.记录||{},item)});
        }
        const current=Array.from(areas.values()).filter(item=>plain(item.记录)&&String(item.记录.タイプ||'地区')!=='勢力'&&explorationLocationContainsArea(location,item.名称)).sort((a,b)=>nameKey(b.名称).length-nameKey(a.名称).length)[0];
        if(!current||explorationGranularity(current.名称).invalid)return;
        const bucket=stat?.世界?.探索||{},existingName=stableNameIn(bucket,current.名称),existing=existingName?bucket[existingName]:null;
        const list=Array.isArray(result.探索)?result.探索:(result.探索=[]);
        const index=list.findIndex(item=>plain(item)&&nameKey(item.名称)===nameKey(current.名称));
        const explicit=index>=0?list[index]:null,progress=Math.max(10,Number(existing?.探索度)||0,Number(explicit?.探索度)||0);
        if(existing&&progress===Number(existing.探索度||0)&&!explicit)return;
        const item={名称:current.名称,操作:'更新',リスク:String(explicit?.リスク||existing?.リスク||'F'),探索度:Math.min(100,progress),説明:String(explicit?.説明||existing?.説明||current.记录.説明||current.记录.公开动态||current.记录.进展||('実際に到達済み：'+current.名称+'。')),隠された真実:String(explicit?.隠された真実||existing?.隠された真実||'')};
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
    // 世界整合性の保護：精密時計を統一；因果偏移はソフト正規化を行い、意味論や規模の問題でターン全体の進行を止めない。
    const WORLD_INTEGRITY_GUARD_RULES=`【因果偏移与时间约束】
1. 時間検証はフィールド粒度で処理する：事件、地区、歴史、伝播などのマクロ事実は「自然日」単位でのみハード検証する；同一自然日内の上午/下午/HH:mmの差異は未来越界と見なさず、日をまたぐ未来の事実のみを拒否する。
2. 人物の現在動態は、「現在の世界時間」と「人物の更新時間」の双方が HH:mm まで明確な場合にのみ分単位の前後検証を行う；いずれか一方が清晨/上午/下午などの粗い粒度しか持たない場合は、同日を合法と見なす。現在の状態は引き続き世界.時間の原文を優先して再利用し、未来の計画は 预计结束、下次检查、または 待发生事件 に置く。
3. 偏移記録は毎ターン必須ではなく、あらすじログ・あらすじ要約・章の小括でもない。すでに発生し、すでに確認され、かつ現実の結果が重要人物の命運、重大事件の結果、重要勢力の構図、本筋の実現可能性、または異常汚染の規模を実際に変えた長期偏移のみを記録する；今回そのような重大な世界級の変化がない場合は「因果.偏移记录」を省略し、安定値を変化させるために記録を捏造してはならない。
4. 判定の根拠はすでに実現した結果であり、危険度、能力の強弱、計画、意図、潜在的な上限ではない。世界全体に影響しうる高危険装置を保持していても、まだ使用されておらず現実の結果も生んでいないなら、偏移は発生しない。
5. 同一の確認済み根因とその連鎖的帰結は一件だけ記録し、既存の偏移の更新を優先する；新たで独立した長期偏移の方向が形成された場合にのみ新規追加する。同一の因果チェーンをあらすじ小要約に分割して連続累積させることは禁止する。
6. 予測、リスク、可能性、潜在、または未来にまだ発生していない帰結は偏移を生まない；位置露見、敵の警戒、負傷、逃走、生存/行動難易度の変化などの局所的な戦術的帰結は偏移を生まない；安定値の低下およびその後の世界応答も、逆に新たな負の偏移となってはならない。
7. 負値アンカー：重要人物の命運の不可逆な改変 -3~-12；重大事件の結果の不可逆な変更 -3~-10；重要勢力の構図または本筋の実現可能性の実質的破壊 -2~-8；異常汚染の継続的拡大 -1~-10。通常の変化は記録しない。
8. 正値は真実の修復からのみ生じる：重要人物/重大事件の修復 +3~+10；異常の除去 +1~+15；勢力構図または本筋構造の修復 +2~+8。100を超える値は通常の善行、勝利、報酬からは生じ得ない。
9. 単条の推奨範囲は -12~-1 または +1~+15、0 は新規記録を作らない；同一の誘発者は同ターンで負方向の総量が最大 -12、正方向の総量が最大 +15。プログラムは範囲外、同根の分割、局所的帰結、またはまだ現実の結果を生んでいない偏移に対してソフト正規化/無視を実行し、リトライを発生させず、今回のその他の世界進行結果も却下しない。
10. 世界.安定は偏移台帳の派生値であり、プログラムが集計する；モデルは直接変更してはならず、毎ターン「更新安定值」を行う必要もない。`;

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

    // 整合性検証と並べ替え/スケジューリングは異なる精度を使う：世界事件などのマクロ事実は「日」をハード境界とし、
    // 「上午/下午」のような粗い粒度のラベルを精密時刻に偽装して、同日の進行を誤って棄却するのを避ける。
    // 人物は双方が HH:mm を与えた場合にのみ分単位の保護を保持し、真実の精密時計の逆流を防ぐ。
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
        const nowRaw=String(stat?.世界?.時間||''),nowDay=integrityWorldDayKey(nowRaw),nowKey=worldDateKey(nowRaw);
        if(nowDay===null)return anomalies;
        const nowExact=integrityHasExactClock(nowRaw);
        return anomalies.filter(item=>{
            const valueRaw=String(item?.值||''),valueDay=integrityWorldDayKey(valueRaw);
            if(valueDay===null)return true;
            if(valueDay>nowDay)return true;
            if(valueDay<nowDay)return false;
            if(item?.タイプ!=='人物')return false;
            if(!nowExact||!integrityHasExactClock(valueRaw))return false;
            const valueKey=worldDateKey(valueRaw);
            return nowKey!==null&&valueKey!==null&&valueKey>nowKey;
        });
    };

    // 因果影響の規模は意味論層の規則であり、JSON Schema の拒否には委ねない；コンパイル段階で統一的にソフト正規化する。
    delete OFFSET_RESULT_SCHEMA.properties.影響度.minimum;
    delete OFFSET_RESULT_SCHEMA.properties.影響度.maximum;

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
        return [item?.名称,item?.説明].filter(Boolean).join(' ');
    }
    function softNormalizeCausalOffsets(stat,result) {
        const items=Array.isArray(result?.因果?.偏移記録)?result.因果.偏移記録:null;
        if(!items||!items.length)return;
        const existing=stat?.世界?.因果軌道?.偏移記録||{},prepared=[];
        for(const raw of items){
            if(!plain(raw))continue;
            const item=copy(raw);
            if(item.操作==='撤销本轮'){prepared.push(item);continue;}
            const existingName=stableNameIn(existing,item.名称),isNew=!existingName;
            if(Object.hasOwn(item,'影響度')){
                const impact=clampCausalImpact(item.影響度);
                if(impact===null){
                    if(isNew)continue;
                    delete item.影響度;
                }else if(isNew&&impact===0)continue;
                else item.影響度=impact;
            }else if(isNew)continue;
            const text=causalOffsetText(item);
            if(isNew&&CAUSAL_NO_EFFECT_HINT.test(text))continue;
            if(isNew&&CAUSAL_SPECULATION_HINT.test(text)&&!CAUSAL_REALIZED_HINT.test(text))continue;
            if(isNew&&Number(item.影響度)<0&&CAUSAL_RESPONSE_HINT.test(text))continue;
            prepared.push(item);
        }

        // 「同一根因/后续/余波」などと明記された同一誘発者の同方向の断片は、影響の絶対値が最大の代表項目を保持する。
        const removed=new Set(),groups=new Map();
        for(let i=0;i<prepared.length;i++){
            const item=prepared[i];
            if(!plain(item)||item.操作==='撤销本轮'||!Object.hasOwn(item,'影響度'))continue;
            const actor=String(item.誘発者||'').trim().toLowerCase();
            const impact=Number(item.影響度);
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

        // 同一誘発者の同ターン総影響にソフト上限をかける；リトライも例外送出もせず、後続項目の残り枠だけを縮小する。
        const budgets=new Map();
        normalized=normalized.filter(item=>{
            if(!plain(item)||item.操作==='撤销本轮'||!Object.hasOwn(item,'影響度'))return true;
            const actor=String(item.誘発者||'').trim().toLowerCase(),impact=Number(item.影響度);
            if(!actor||!Number.isFinite(impact)||impact===0)return true;
            const sign=impact<0?'negative':'positive',key=actor+'|'+sign;
            let remaining=budgets.has(key)?budgets.get(key):(impact<0?12:15);
            const magnitude=Math.min(Math.abs(impact),remaining);
            remaining=Math.max(0,remaining-magnitude);budgets.set(key,remaining);
            if(magnitude<=0)return false;
            item.影響度=impact<0?-magnitude:magnitude;
            return true;
        });
        result.因果.偏移記録=normalized;
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
        if(/时间事实超过当前世界时间|时间越界记录仍未修复/.test(message))plan.unshift('時間整合性：事件/地区/歴史/伝播は「未来の自然日へまたぐ」ことだけをハード越界と見なし、同日の上午/下午/HH:mm の違いは書き戻し不要；人物は双方が HH:mm を明示した場合にのみ分単位の検証を行う。未来の計画は 预计结束、下次检查、または 待发生事件 に置く。');
        return Array.from(new Set(plan.filter(Boolean)));
    };

    const SamsaraWorldEngineBeforeIntegrityGuard=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeIntegrityGuard {
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            request.system=String(request.system||'')+'\n\n'+WORLD_INTEGRITY_GUARD_RULES;
            request.manifest=request.manifest||{};
            request.manifest.因果与时间约束={启用:true,因果偏移处理:'重大な世界級の変化がある時のみ維持；変化がなければ省略',单条建议范围:'-12~-1 / +1~+15',宏观事实时间:'同一自然日は許可；日をまたぐ未来は拒否',人物精确时间:'双方が HH:mm の場合のみ精密比較'};
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema||WORLD_RESULT_SCHEMA);
            return request;
        }
    };
    // 世界時間帯の別名互換：自然言語の同義語を先に正規化し、その後で統一時間比較器に渡す。
    // 同一日内の時間帯に明確に属する別名のみを扱う；「午夜」など日をまたぐ意味論はここでは推測しない。
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
    // 安定度因果ゲート：すでに実現した「世界そのものの長期的変化」だけが安定台帳へ入れる；プレイヤーの戦術的状況、異端が情報を得たなどの局所的帰結は直接無視する。
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
        const items=result?.因果?.偏移記録;
        if(!Array.isArray(items)||!items.length)return [];
        const existing=stat?.世界?.因果軌道?.偏移記録||{},dropped=[];
        result.因果.偏移記録=items.filter(item=>{
            if(!plain(item)||item.操作==='撤销本轮')return true;
            if(stableNameIn(existing,item.名称))return true;
            if(causalOffsetHasWorldScaleEvidence(item))return true;
            dropped.push(item.名称);
            return false;
        });
        return dropped;
    }
    function staleLocalCausalOffsetRepairs(stat,result) {
        const bucket=stat?.世界?.因果軌道?.偏移記録||{},protectedNames=new Set();
        for(const item of result?.因果?.偏移記録||[]){
            if(plain(item)&&causalOffsetHasWorldScaleEvidence(item))protectedNames.add(nameKey(item.名称));
        }
        const patches=[],names=[];
        for(const [name,record] of Object.entries(bucket)){
            const impact=Number(record?.影响程度)||0;
            if(!impact||protectedNames.has(nameKey(name)))continue;
            const text=causalOffsetText(Object.assign({名称:name},record));
            if(!CAUSAL_CLEAR_LOCAL_HINT.test(text)||CAUSAL_WORLD_SCALE_HINTS.some(rule=>rule.test(text)))continue;
            patches.push({op:'remove',path:pointer(['世界','因果軌道','偏移記録',name])});
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
        if(dropped.length)compiled.warnings.push('世界規模でない因果偏移を無視：'+dropped.join('、'));
        if(repairs.names.length)compiled.warnings.push('局所的な安定偏移を削除：'+repairs.names.join('、'));
        return compiled;
    };

    // 基礎パッチ層は伝播/噂/資産の削除のみを許可する；因果ゲートは履歴の汚れた偏移を整理できる必要がある。
    // 「世界.因果軌道.偏移記録.<名称>」というこの一本の正確なパスにのみ制御された事前削除を行い、その他の remove は従来の安全規則に従う。
    const applyPatchesBeforeCausalStabilityGate=applyPatches;
    applyPatches=function(stat,patches) {
        if(!Array.isArray(patches)||!patches.some(patch=>patch?.op==='remove'&&(()=>{try{const p=tokens(patch.path);return p[0]==='世界'&&p[1]==='因果軌道'&&p[2]==='偏移記録'&&p.length===4;}catch(_){return false;}})()))return applyPatchesBeforeCausalStabilityGate(stat,patches);
        const seeded=copy(stat),rest=[];
        for(const patch of patches){
            let p=null;try{p=tokens(patch.path);}catch(_){}
            if(patch?.op==='remove'&&p&&p[0]==='世界'&&p[1]==='因果軌道'&&p[2]==='偏移記録'&&p.length===4){
                if(plain(seeded?.世界?.因果軌道?.偏移記録))delete seeded.世界.因果軌道.偏移記録[p[3]];
                continue;
            }
            rest.push(patch);
        }
        return applyPatchesBeforeCausalStabilityGate(seeded,rest);
    };
    // 世界時間の単一所有権：世界進行 AI が初期化/進行を担い、世界.時間 を所有する；変数 AI の書き込みはイベント層でロールバックされる。
    const WORLD_TIME_RULES=`【世界时间所有权】
1. 世界.時間 は世界進行が独占的に維持する。トップレベルの「时间」は現在の世界時計の初期化または実際の進行にのみ用いる；人物の更新時間、イベントの計画時間は世界時計の代わりにはならない。
2. 現在時間が空/待初始化の場合は、最新の本文と明確な資料から時間アンカーを確立する；資料が季節、段階、時間帯しか特定できない場合はその精度を保ち、形式の完全さのために月日を捏造しない。
3. 月日まで精密な場合は統一的に {yyy}年-{mm}月-{dd}日-{时间段} と書く；月は必ず数字でなければならない。时间段は次からのみ選択：凌晨 / 黎明 / 清晨 / 早晨 / 上午 / 中午 / 午后 / 下午 / 傍晚 / 入夜 / 晚上 / 深夜。「夜晚/黄昏/早上」などの他の同義語を出力してはならない。
4. 时间段は粗い粒度の時間アンカーであり、毎ターンのカウンターではない。現在の時間帯をまたぐだけの十分な時間経過がない場合は「时间」を省略して元の値を保つ；本文または明確な時間資料表が合理的な長さの経過を明示した場合にのみ、後続の時間帯や日付へ進める。今回の世界進行を実行しただけで機械的に時間帯を飛ばすことは禁止する。
5. 世界時間は後退してはならず、待发生事件の計画時間を前倒しして現在時間として書いてもならない。人物/地区などの「更新時間」はプログラムが今回の最終世界時間で統一的に刻印する。
6. 主神空間から新しいインスタンスへ入る時、プログラムはまず世界.時間と旧暦法を空にする；これは全く新しい世界の時間初期化として扱わなければならず、前のインスタンスや主神空間の「轮回历」の日付を継承することは固く禁じる。`;

    const MACHINE_TIME_DESCRIPTION='月日まで精密な場合は {yyy}年-{mm}月-{dd}日-{时间段}を使用；时间段は次のみ：凌晨/黎明/清晨/早晨/上午/中午/午后/下午/傍晚/入夜/晚上/深夜；季節/段階しか特定できない場合は粗い粒度を保持してよい。';
    WORLD_RESULT_SCHEMA.properties.时间={type:'string',minLength:1,description:'現在の世界時間。'+MACHINE_TIME_DESCRIPTION};
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
        return plain(result?.暦法)?result.暦法:(plain(stat?.世界?.暦法)?stat.世界.暦法:{});
    }
    function assertCalendarCompatibleTimeValue(stat,result,value,label='时间') {
        const raw=String(value??'').trim();
        if(!worldTimeClaimsMonthDay(raw))return;
        if(calendarDate(raw,worldTimeCalendarFor(stat,result)))return;
        throw new Error(label+'の形式は暦法に使用できません：'+raw+'。月日まで精密な場合は {yyy}年-{mm}月-{dd}日-{时间段}を使用してください；月名で数字の月を代替しないでください。');
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
            const activeFacts=String(item.地点||'').trim()&&String(item.目標||'').trim()&&String(item.行动||'').trim();
            const raw=String(item.更新时间||'').trim();
            if(!activeFacts||!raw)continue;
            const key=worldTimeIdentity(raw);if(key&&!candidates.has(key))candidates.set(key,raw);
        }
        return candidates.size===1?Array.from(candidates.values())[0]:'';
    }
    function resolveWorldTimeProposal(stat,result) {
        const explicit=String(result?.时间||'').trim();
        if(explicit)return explicit;
        if(!worldTimeUnset(stat?.世界?.時間))return '';
        return inferWorldTimeFromCurrentActivities(result);
    }
    function assertWorldTimeNotBackwards(stat,nextTime) {
        const current=String(stat?.世界?.時間||'').trim();
        if(worldTimeUnset(current)||!nextTime)return;
        const before=worldDateKey(current),after=worldDateKey(nextTime);
        if(before!==null&&after!==null&&after<before)throw new Error('世界時間は後退できません：'+current+' -> '+nextTime);
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
        if(Object.hasOwn(result,'时间'))split.fragments.unshift({label:'时间',result:{要約:'',时间:result.时间}});
        return split;
    };

    const allowedBeforeWorldTimeOwnership=allowed;
    allowed=function(parts,stat) {
        if(Array.isArray(parts)&&parts.length===2&&parts[0]==='世界'&&parts[1]==='時間')return true;
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
            const old=stat?.世界?.時間;
            if(String(old??'')!==proposal)compiled.patches.unshift({op:old===undefined?'add':'replace',path:'/世界/时间',value:proposal});
            compiled.result.时间=proposal;
        }
        return compiled;
    };

    if(Array.isArray(WORLD_REPLAY_SCOPES)&&!WORLD_REPLAY_SCOPES.some(scope=>scope.length===2&&scope[0]==='世界'&&scope[1]==='時間'))WORLD_REPLAY_SCOPES.unshift(['世界','時間']);

    const SamsaraWorldEngineBeforeWorldTimeOwnership=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeWorldTimeOwnership {
        async buildRequest(base) {
            const request=await super.buildRequest(base);
            request.system=String(request.system||'')+'\n\n'+WORLD_TIME_RULES;
            try{
                const payload=JSON.parse(request.input);
                payload.世界时间维护={
                    当前时间:String(base?.stat?.世界?.時間||''),
                    是否需要初始化:worldTimeUnset(base?.stat?.世界?.時間),
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
            const previous=String(before?.stat_data?.世界?.時間??'');
            const incoming=String(variables?.stat_data?.世界?.時間??'');
            if(previous===incoming)return handled;

            // 世界切替はプログラム層が 世界.時間 を書き換えられる唯一の境界：
            // 主神空間 -> インスタンス は空にする/待初始化のみ；インスタンス -> 主神空間 は 轮回历 の書き込みのみ。
            // その他の変数更新は依然として一律にロールバックし、世界進行の単一所有権を引き続き保証する。
            const wasSpace=before?.stat_data?.システム状態?.主神空間滞在中===true;
            const isSpace=variables?.stat_data?.システム状態?.主神空間滞在中===true;
            if(wasSpace!==isSpace){
                const enteringWorld=wasSpace&&!isSpace;
                const returningToSpace=!wasSpace&&isSpace;
                const mainSpaceTime=/^轮回历\d+年-\d{2}月-\d{2}日-(?:凌晨|黎明|清晨|早晨|上午|中午|午后|下午|傍晚|入夜|晚上|深夜)$/.test(incoming);
                if((enteringWorld&&worldTimeUnset(incoming))||(returningToSpace&&mainSpaceTime))return handled;
            }

            if(!plain(variables.stat_data.世界))variables.stat_data.世界={};
            variables.stat_data.世界.時間=previous;
            return true;
        }
    };    // 復元パッケージの信頼性：世界進行の成功後に自ら replay を永続化し、replaceMvuData が有効な VARIABLE_UPDATE_ENDED を発火するかどうかに依存しない。
    // 旧メッセージで replay が欠落している場合は、今回の再処理イベントの before/已处理楼层 を優先して復元する；旧状態が本当に無い場合は自動進行スイッチに従って即時再構築するか決める。
    const SamsaraWorldEngineBeforeReplayPersistence=SamsaraWorldEngine;
    SamsaraWorldEngine=class SamsaraWorldEngine extends SamsaraWorldEngineBeforeReplayPersistence {
        worldReplayReprocessContext(variables,before) {
            if(!plain(variables?.stat_data))return null;
            const current=this.worldReplayCurrentMessage?.();
            if(!current)return null;
            const mvu=this.env.Mvu||this.host.Mvu;
            let raw;
            try{raw=mvu?.getMvuData?.({type:'message',message_id:current.id});}catch(_){return null;}
            // 「変数の再処理」は現在のメッセージの stat_data を消すが、replay ルートフィールドは残りうる；before も旧メッセージが正常に処理された証拠になる。
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
                    this.status=legacyRecovered?'旧メッセージの状態から再構築し、世界進行結果を復元しました · AI再呼び出しなし':'本メッセージの世界進行結果を復元しました · AI再呼び出しなし';
                    this.render();
                    return true;
                }

                // before/已处理楼层 はこのメッセージが過去に確かに正常進行したことを証明済み；replay が欠けていても進行間隔を再計算する必要はない。
                // 失効した処理マークを消し、このメッセージを再び due としてマークする。自動進行が有効な時はこの分岐が自ら追い実行を手配し、基礎の VARIABLE_UPDATE_ENDED 監視のフォールバックに依存しない。
                this.worldReplayClearHandledForRetry(variables.stat_data,context.current.fingerprint);
                delete variables.__samsaraWorldReplay;
                this.worldReplaySetCycleRecovered(context.current.fingerprint,variables.stat_data);
                if(this.config.autoProgress===true&&this.isEnabled()){
                    this.status='変数の再処理済み · 本メッセージを自動的に再進行中';
                    this.render();
                    this.schedule('variable-update',0);
                }else if(this.config.autoProgress!==true){
                    this.status='変数の再処理済み · 旧メッセージに復元スナップショットがありません；自動進行はオフです。手動で進行してください';
                    this.render();
                }else{
                    this.status='変数の再処理済み · 世界進行がオフのため自動再構築しませんでした';
                    this.render();
                }
                return false;
            }
            return super.handleWorldReplayVariableEvent(variables,before);
        }
    };
    // 変数の再処理で replay が欠けている場合は、VARIABLE_UPDATE_ENDED が渡した variables をそのまま使って再進行する；MVU の二次書き込みを待たない。
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
                        this.status='変数の再処理済み · 本メッセージを再進行中';
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
    // アクティブな異端活動のタイムスタンプ：モデルは活動事実を提出する；世界時間は WorldResult.时间 が維持し、人物のタイムスタンプはプログラムが統一的に刻印する。
    const activeAlienActivityRequirementsBeforeTimestampNormalization=activeAlienActivityRequirements;
    activeAlienActivityRequirements=function(stat) {
        return activeAlienActivityRequirementsBeforeTimestampNormalization(stat).map(item=>Object.assign({},item,{
            要求:'今回、このアクティブな異端の活動再確認を WorldResult.人物 の中で提出しなければならない；少なくとも空でない 地点、目标、行动 を与える。人物の更新時間は書き写す必要がなく、プログラムが今回の最終世界時間で統一的に記録する；今回すでに死亡が確認された場合は、異端状態を 死亡 に更新するだけで、人物活動はもう提出しない。'
        }));
    };

    const compileWorldResultBeforeAlienActivityNormalization=compileWorldResult;
    compileWorldResult=function(stat,value) {
        const result=normalizeWorldResult(value);
        const roster=((stat?.設定||{}).単一世界||(stat?.設定||{}).単一世界)?{}:(stat?.世界?.異端レーダー?.名簿||{});
        const plannedDead=new Set((result.异端||[])
            .filter(item=>item?.操作!=='撤销本轮'&&item?.状態==='死亡')
            .map(item=>nameKey(item.名称)));
        const proposedTime=typeof resolveWorldTimeProposal==='function'?resolveWorldTimeProposal(stat,result):'';
        const worldTime=String(proposedTime||stat?.世界?.時間||'').trim();
        if(Array.isArray(result.人物)){
            for(const item of result.人物){
                if(!plain(item)||item.操作==='撤销本轮')continue;
                const rosterName=stableNameIn(roster,item.名称),alien=rosterName?roster[rosterName]:null;
                if(!alien||alien.状態==='死亡'||plannedDead.has(nameKey(rosterName||item.名称)))continue;
                const submitted=String(item.地点||'').trim()&&String(item.目標||'').trim()&&String(item.行动||'').trim();
                if(!submitted)continue;
                if(worldTime)item.更新时间=worldTime;
                else delete item.更新时间;
            }
        }
        return compileWorldResultBeforeAlienActivityNormalization(stat,result);
    };

    ensureActiveAlienActivity=function(next,required,acceptedResult,worldTime) {
        const roster=next?.世界?.異端レーダー?.名簿||{},people=next?.世界?.[PATH]?.人物||{},proposals=acceptedResult?.人物||[],missing=[];
        const canonicalTime=String(next?.世界?.時間||worldTime||'').trim();
        for(const item of required||[]){
            const rosterName=stableNameIn(roster,item.雷达名称||item.名称),alien=rosterName?roster[rosterName]:null;
            if(!alien||alien.状態==='死亡')continue;
            const personName=stableNameIn(people,item.名称)||stableNameIn(people,rosterName),person=personName?people[personName]:null;
            const proposal=proposals.find(p=>nameKey(p.名称)===nameKey(item.名称)||nameKey(p.名称)===nameKey(rosterName));
            const submitted=proposal&&String(proposal.地点||'').trim()&&String(proposal.目标||'').trim()&&String(proposal.行动||'').trim();
            const factsComplete=person&&String(person.地点||'').trim()&&String(person.目标||'').trim()&&String(person.行动||'').trim();
            const timeComplete=!canonicalTime||sameWorldTimeAnchor(person?.更新时间,canonicalTime);
            if(!submitted||!factsComplete||!timeComplete)missing.push(rosterName||item.名称);
        }
        if(missing.length)throw new Error('异端活动未复核：'+missing.join('、')+'；アクティブな異端は毎ターン人物活動を提出し、地点、目标、行动を明記しなければならない；人物の更新時間はプログラムが世界時間を用いて統一的に記録する；すでに死亡している場合は異端状態を死亡に更新する');
    };

    const retryPlanForFailureBeforeAlienActivityNormalization=retryPlanForFailure;
    retryPlanForFailure=function(error,rejected=[]) {
        return retryPlanForFailureBeforeAlienActivityNormalization(error,rejected).map(item=>String(item)
            .replace('在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动，并把更新时间精确写为当前世界时间；若本轮已确认死亡','在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动；人物更新时间由程序使用世界时间统一记录；若本轮已确认死亡')
            .replace('在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动；更新时间由程序统一记录为当前世界时间；若本轮已确认死亡','在 WorldResult.人物 中补写该活跃异端本轮的地点、目标、行动；人物更新时间由程序使用世界时间统一记录；若本轮已确认死亡')
        );
    };
    // 噂のスロットリング：既定では既存の公開噂を維持し、真実の情報イベントが発生した時のみ更新する；噂/伝播の失敗でターン全体をリトライしない。
    const RUMOR_THROTTLE_RULES=`【传闻刷新节流 · 取代前述“每轮替换”要求】
1. 公開噂は既定で不変。「传闻维护.本轮公开传闻动作」が更新を要求した時のみ噂を書く；活性感の演出、件数合わせ、些細な事柄のために毎ターン書き換えることは禁止する。
2. トリガーは次のみ：ある分類が空で1件補充が必要；既存の伝播チェーンが関連イベントの新展開、期限到来、または72時間超過により再確認を要する；今回新たに確立/更新され、まだ伝播チェーンがなく、公開の兆候/可視の影響を持つ新イベント。古いイベントは存在し続けるだけでは繰り返しトリガーされない。通常の行動、通常の戦闘、軽微な状態や数値の変化は更新をトリガーしない。
3. 単回のトリガーで各分類は最大1件更新する。今回の事実に直接関連する同名の噂の更新を優先する；そうでなければ1件追加し、プログラムが自動で最も古い項目をスクロール淘汰する。トリガーがない時は三分類の噂をすべてそのまま保ち、変化のない更新を提出しない。
4. 噂と伝播はソフトメンテナンスに属する。個々の噂/伝播の断片が形式エラー、または今回のメンテナンスが未完了の場合は、その断片を破棄し、他の検収済み結果を保持する；噂/伝播のためだけにターン全体の世界進行を再呼び出ししてはならない。
5. 情報取引 の購入、支払い、消費的な削除は引き続き MVU/変数AIが処理する；世界エンジンはその世界側の情報源のみを維持する。`;
    const RUMOR_THROTTLE_PRESET_STEP='Step 6 · 情報伝播：公開噂は既定で不変；空の分類、伝播チェーンの再確認、または新たに公開可能な事実が現れた時のみ必要に応じて更新し、各トリガーにつき分類ごと最大1件。噂/伝播はソフトメンテナンスに属し、失敗してもターン全体を再実行しない。';
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
        if(emptyCategories.length)reasons.push('空の分類：'+emptyCategories.join('、'));
        if(review.length)reasons.push('伝播再確認：'+review.map(item=>item.名称).join('、'));
        if(candidates.length)reasons.push('新たな公開事実：'+candidates.map(item=>item.名称).join('、'));
        required.可传播候选事件=candidates;
        required.刷新原因=reasons;
        required.本轮公开传闻动作=reasons.length?'必要に応じて更新；各トリガーにつき分類ごと最大1件':'変更なし';
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

    // 情报交易 の「真实内幕」はバックステージのゲームマスター情報：データは引き続き AI/変数システムに保持し、プレイヤーの噂パネルにはこの詳細入口を描画しない。
    function hideRumorTradeHostOnlyDetails(root) {
        const sections=Array.from(root?.querySelectorAll?.('.we-section')||[]);
        const trade=sections.find(section=>section.querySelector('.we-section-head h2')?.textContent?.trim()==='情報取引');
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
                模式:'必要時更新',
                本轮动作:maintenance.本轮公开传闻动作,
                刷新原因:copy(maintenance.刷新原因||[]),
                软失败不重试:true
            };
            request.manifest.观测=requestTokenTelemetry(request.system,request.input,request.schema||WORLD_RESULT_SCHEMA);
            return request;
        }
        render(force) {
            const result=super.render(force);
            if(this.tab==='噂')hideRumorTradeHostOnlyDetails(this.panel?.querySelector?.('main'));
            return result;
        }
    };
    const RUMOR_WORLD_SOURCE_RULES=`【信息传播 · 世界侧事实】
1. 噂と伝播は世界で流通している情報を記述する；本文は事実と時間の確認にのみ用い、直接の伝播源ではない。本文中の個人の行動、戦闘の細部、私的な会話、能力や利益を直接噂に書き換えることは禁止する。
2. 直接の取材は「传闻维护.世界侧可传播事实」、既存の伝播チェーン、既存の公開噂に限る。私的な事実は、目撃、公開された帰結、調査の発見、公告、自発的な漏洩などの現実の経路が形成されて初めて伝播できる。
3. 公開内容は出所と受け手が当時知り得た範囲を超えてはならない；バックステージの真相は公開内容に入らない。伝播には時間と空間の経路がなければならず、理由なく瞬間的に全世界へ拡散してはならない。
4. 公開噂は既定で不変；空の分類、伝播チェーンの再確認、または新たな世界側の公開事実が現れた時のみ必要に応じて更新し、各トリガーにつき分類ごと最大1件。
5. 通常の行動、通常の戦闘、軽微な状態や数値の変化そのものは噂をトリガーしない；その公開された帰結がすでに世界側の事実プールへ入っている場合にのみ伝播できる。
6. 噂/伝播はソフトメンテナンスに属し、個々の断片の失敗でターン全体の世界進行を再実行させてはならない。情报交易の購入、支払い、消費的な削除はMVUが本文の結果に従って処理する；世界エンジンは世界側の情報源のみを維持する。`;
    const RUMOR_WORLD_SOURCE_PRESET_STEP='Step 6 · 情報伝播：世界側の公開事実と既存の伝播チェーンを出所とする；本文は直接の伝播源ではない。私的な事実はまず現実の伝播経路を形成しなければならず、伝播範囲は時間と空間の経路に従って拡大する。';
    function rumorWorldSameTime(value,current){
        const a=String(value||'').trim(),b=String(current||'').trim();
        return !!a&&!!b&&(typeof sameWorldTimeAnchor==='function'?sameWorldTimeAnchor(a,b):a===b);
    }
    function worldPublicRumorFacts(stat){
        const backend=stat?.世界?.[PATH]||{},now=String(stat?.世界?.時間||'').trim(),facts=[];
        const add=item=>{if(plain(item)&&String(item.公开内容||'').trim())facts.push(item);};
        for(const [名称,event] of Object.entries(backend.事件||{})){
            if(!plain(event)||!['進行中','已完成'].includes(String(event.状态||'')))continue;
            const visible=[String(event.公开征兆||'').trim(),...(Array.isArray(event.可见影响)?event.可见影响.map(x=>String(x?.影响||'').trim()):[])].filter(Boolean);
            if(!visible.length)continue;
            const time=String(event.更新时间||event.时间||'').trim();
            add({タイプ:'公开事件',名称,地点:String(event.地点||''),时间:time,公开内容:visible.join('；'),关联事件:[名称],新近:rumorWorldSameTime(time,now)});
        }
        for(const [名称,person] of Object.entries(backend.人物||{})){
            const text=String(person?.公开动态||'').trim();if(!text)continue;
            const time=String(person?.更新时间||'').trim();
            add({タイプ:'人物公开动态',名称,时间:time,公开内容:text,关联事件:copy(Array.isArray(person?.关联事件)?person.关联事件:[]),新近:rumorWorldSameTime(time,now)});
        }
        for(const [名称,area] of Object.entries(backend.势力地区||{})){
            const text=String(area?.公开动态||'').trim();if(!text)continue;
            const time=String(area?.更新时间||'').trim();
            add({タイプ:'地区公开动态',名称,时间:time,公开内容:text,新近:rumorWorldSameTime(time,now)});
        }
        for(const [名称,faction] of Object.entries(stat?.世界?.勢力||{})){
            const text=[faction?.領地,faction?.説明].map(x=>String(x||'').trim()).filter(Boolean).join('；');
            add({タイプ:'势力公开背景',名称,公开内容:text,新近:false});
        }
        for(const [名称,place] of Object.entries(stat?.世界?.探索||{}))add({タイプ:'探索公开背景',名称,リスク:String(place?.リスク||''),公开内容:String(place?.説明||''),新近:false});
        const economy=String(stat?.世界?.通貨?.経済変動||'').trim();
        if(economy)add({タイプ:'经济公开背景',名称:'経済変動',公开内容:economy,新近:false});
        return facts.slice(-24);
    }

    const rumorMaintenanceRequirementsBeforeWorldSource=rumorMaintenanceRequirements;
    rumorMaintenanceRequirements=function(stat){
        const required=rumorMaintenanceRequirementsBeforeWorldSource(stat),facts=worldPublicRumorFacts(stat),fresh=facts.filter(item=>item.新近).slice(-6);
        const empty=RUMOR_PUBLIC_CATEGORIES.filter(category=>Number(required?.公开传闻?.[category]?.当前数量||0)===0),review=required?.本轮必须复核的传播链||[],reasons=[];
        if(empty.length)reasons.push('空の分類：'+empty.join('、'));
        if(review.length)reasons.push('伝播再確認：'+review.map(item=>item.名称).join('、'));
        if(fresh.length)reasons.push('新たな世界側公開事実：'+fresh.map(item=>item.名称).join('、'));
        required.世界侧可传播事实=facts;required.本轮新公开事实=fresh;required.刷新原因=reasons;required.本轮公开传闻动作=reasons.length?'必要に応じて更新；各トリガーにつき分類ごと最大1件':'変更なし';
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
                取材边界:'世界側の可伝播事実、既存の伝播チェーン、既存の公開噂のみを使用する；本文は直接の伝播源ではない',
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
            request.manifest.传闻节流={模式:'世界側の事実駆動',本轮动作:maintenance.本轮公开传闻动作,刷新原因:copy(maintenance.刷新原因||[]),正文直接取材:false,软失败不重试:true};
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
    // プロンプトワークベンチの最終層：世界 AI へ実際に送信されるテキストモジュールだけを公開する；プログラムの Schema/検証は引き続きコードが担当する。
    const WORLD_MODULE_PROMPT_VERSION=4;
    const COMPACT_DEFAULT_PRESET=`あなたは輪廻戦場の世界エンジンである。本文の外で動き続けている世界を進行させ、すでに発生した、または計画が必要な世界の変化だけを提出する。
【执行流程】
1. 事実の取得：当前变量/確認済みのストーリー > 明確な世界書 > モデルの常識。
2. 境界の確定：現在の段階、世界時間、次のマクロノードを確認する。
3. 世界の進行：利用可能な時間に沿って事件、地区、人物、勢力を進める；世界は<user>が止まっても停止しない。
4. 影響の決算：<user>がすでに生んだ客観的帰結を記録するが、<user>の代わりに行動はしない。
5. メンテナンス：今回確実に変化した伝播、経済、暦法だけを処理する；因果偏移は重大な世界級の長期的変化が現れた時のみ維持する。
6. 差分の出力：新規/変化した WorldResultだけを書く；業務上の変化がなければ摘要だけを書く。`;
    const COMPACT_CORE_WORLD_RULES=`【核心边界】
- 事実の優先度：当前变量/確認済みのストーリー > 明確な世界書 > 常識；計画は事実ではない。
- モデルが知っている≠場外人物が知っている。人物はその場の観察、既存の認知、信頼できる伝播に基づいてのみ行動できる；<user>の新しい行動によって方針を変えるには認知来源が必要。
- 時間と路程は実現可能でなければならない；同一人物は同一時間帯に一箇所のみ；<user>の代わりに行動せず、既に演出された些事を復唱しない。
- 資産は固定の不動産、大型ビークル、要塞のみを記録する；単兵アイテムは資産に書かない。探索は<user>が実際に到達、調査、または信頼できる形で知り得た区域のみを記録する。
- 因果偏移は実現済みの本筋級の長期的変化のみを記録する；重大な世界偏移がなければ偏移記録を一切書かない。現在イベントの公開フィールドには現実に知覚可能な情報だけを書く。
- 任務の決算、報酬、実績、撃破などは対応するシステムが担当する。`;
    const COMPACT_MACRO_PROMPT=`【宏观骨架】
骨格を補う必要がある時は3~5個のローリング段階ノードを保つ；まず順序と時間境界を定め、その後で直近の細部を埋める。未来の計画は境界を越えてよいが、実際の進行は次のノードを越えてはならない；複数の独立した段階を無理に一つのノードへ統合しない。`;
    const COMPACT_STABILITY_PROMPT_TEMPLATE=`【世界自救 · {{段階}}】
安定={{稳定值}}。{{规则}}
拒絶反応は世界内の合理的な因果を通じて発生しなければならない；NPCは依然として自身の認知と伝播チェーンに制限される。`;

    const WORLD_PROMPT_MODULE_DEFS=Object.freeze([
        Object.freeze({key:'task',title:'任務読み取り専用',source:'TASK_AWARENESS_RULES',legacy:()=>[TASK_AWARENESS_RULES],fallback:`【任务感知 · 只读】
任務.リストは世界の因果入力としてのみ用いる；事件は「关联任務」で既存の任務を参照できる。任務の作成、削除、状態変更、納品、決算を行ってはならない。情報の購入と引き落としはMVUが処理する；実績、撃破、報酬、罰則は世界進行に関与しない。`}),
        Object.freeze({key:'chronology',title:'原作 / データベース年表',source:'CHRONOLOGY_GUARD_RULES',legacy:()=>[CHRONOLOGY_GUARD_RULES],fallback:`【原著/数据库时间轴硬约束】
マクロスケジュール：確認済み事実 > 明確な世界書/データベースの日付 > 常識。明確な日付は必ず踏襲する；改期できるのは確認済みかつ記録された因果偏移のみ。資料が月/時間帯/順序までしか無い場合は同じ精度を保つ。まず「現在時間→次のノード」の境界を定めてから区間の細部を進める；3~5個のノードはローリングウィンドウにすぎず、独立した段階を統合しない。`}),
        Object.freeze({key:'maintenance',title:'段階的メンテナンス',source:'SOFT_MAINTENANCE_RULES',legacy:()=>[SOFT_MAINTENANCE_RULES],fallback:`【分级验收 · 软维护不拒绝整轮】
Schema、不正な状態、因果参照、明確な日付の衝突はハードエラー；スケジュール補完、噂の補充、伝播の再確認はターンをまたいで維持できる。事件は時間、条件、前因のいずれかがあればアンカーとして扱える。訂正は拒否された断片のみを修正し、通過済みの内容を書き直さない。`}),
        Object.freeze({key:'exploration',title:'探索台帳',source:'EXPLORATION_PROJECTION_RULES',legacy:()=>[EXPLORATION_PROJECTION_RULES],fallback:`【玩家探索投影硬约束】
<user>が実際に全体区域へ到達した時点で探索度は少なくとも10%；遠方のバックステージ地区は自動記入しない；離脱後も既存の探索を保持する。`}),
        Object.freeze({key:'integrity',title:'因果と事実時間',source:'WORLD_INTEGRITY_GUARD_RULES',legacy:()=>[WORLD_INTEGRITY_GUARD_RULES],fallback:`【因果偏移与时间约束】
現在の事実は世界時間より後に落ちてはならない；未来の計画は 预计结束、下次检查、または 待发生事件 に書く。因果偏移は毎ターン必須ではなく、実現済みでかつ重要人物の命運、重大事件の結果、重要勢力の構図、本筋の実現可能性、または異常汚染の規模を変えた長期的変化のみを記録する；今回そのような重大な変化がない場合は「因果.偏移记录」を省略し、安定値を変化させるために記録を捏造してはならない。位置露見、敵の警戒、負傷、逃走、行動/生存難易度の変化などの局所的帰結は記録しない。計画、リスク、能力の上限は記録しない；同一根因は同じ一件を優先して更新する。安定値はプログラムが有効な偏移に基づいて集計し、モデルは直接変更してはならない。`}),
        Object.freeze({key:'worldTime',title:'世界時間',source:'WORLD_TIME_RULES',legacy:()=>[WORLD_TIME_RULES],fallback:`【世界时间所有权】
世界.時間 は世界進行が維持する。空の場合は確認済み資料に基づいて初期化する；現在の時間帯をまたぐだけの十分な時間経過がなければ元の値を保ち、毎ターンの進行で機械的に時間帯を飛ばさない。月日まで精密な場合は {yyy}年-{mm}月-{dd}日-{时间段} を使用；时间段は次からのみ選択：凌晨 / 黎明 / 清晨 / 早晨 / 上午 / 中午 / 午后 / 下午 / 傍晚 / 入夜 / 晚上 / 深夜。本文または明確な資料表が合理的な長さの経過を明示した場合にのみ時間帯/日付を進める；後退させたり、未来の計画時間を現在時間として扱ったりしてはならない。人物/地区の更新時間はプログラムが統一的に刻印する。`}),
        Object.freeze({key:'rumor',title:'噂と伝播',source:'RUMOR_THROTTLE_RULES / RUMOR_WORLD_SOURCE_RULES',legacy:()=>[RUMOR_LIVELINESS_RULES,RUMOR_THROTTLE_RULES,RUMOR_WORLD_SOURCE_RULES],fallback:`【信息传播 · 世界侧事实】
噂は「世界侧可传播事实」、既存の伝播チェーン、既存の公開噂からのみ生じる；本文は直接の伝播源ではない。私的な事実はまず目撃、公開された帰結、調査、公告、または漏洩を形成しなければならない。公開内容は出所/受け手の認知を超えてはならず、伝播は時間と空間に従って拡散する。トリガーがなければそのまま；空の分類、伝播の再確認、または新たな公開事実がある時は必要に応じて更新し、各トリガーにつき分類ごと最大1件。通常の行動/戦闘そのものはトリガーしない；噂の失敗でターン全体を再実行しない。購入、引き落とし、消費的な削除はMVUが処理する。`})
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

    // 組み込み既定は簡易版をそのまま表示する；旧ユーザーは引き続き組み込み既定を使っている場合に一度だけ移行し、カスタム文書は強制上書きしない。
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
            section.innerHTML='<div class="we-section-head"><h2>実行モジュールプロンプト</h2><small>実際の system 注入 · 編集可能</small></div>'+
                '<div class="we-notice">ここには世界 AI へ最終的に送信されるモジュール規則のみを表示します。旧来の伝聞のアクティブ/スロットル/世界側の三層は送信前に「传闻与传播」モジュールへ統合済みです；いずれかのブロックを空にすると、そのテキスト規則の追加注入を停止できます。プログラム Schema と書き込み検証はここの変更の影響を受けません。</div>'+rows;
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
    // メインパネルは最新の因果サマリーのみを保持し、完全な偏移・ストーリーライン・干涉模式・法則と経済資料は独立した因果档案ページへ移す。
    // 資産と伝聞のデータは引き続き世界エンジンが保守するが、プレイヤー側はステータスバーが担うため、世界進行パネルでは重複表示しない。
    const CAUSAL_OVERVIEW_LIMIT=3;
    const WORLD_ENGINE_HIDDEN_PLAYER_TABS=new Set(['资产','噂']);
    function isWorldEnginePlayerTabHidden(tab) {
        return WORLD_ENGINE_HIDDEN_PLAYER_TABS.has(String(tab||''));
    }
    function causalOffsetEntries(stat) {
        const bucket=stat?.世界?.因果軌道?.偏移記録;
        return Object.entries(plain(bucket)?bucket:{}).slice().reverse();
    }
    function latestCausalOffsets(stat,limit=CAUSAL_OVERVIEW_LIMIT) {
        return causalOffsetEntries(stat).slice(0,Math.max(0,Number(limit)||0));
    }
    function causalImpactLabel(value) {
        const n=Number(value);
        return Number.isFinite(n)?(n>0?'+':'')+n:'影響未記録';
    }
    function causalOverviewEscape(value) {
        return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function causalInterferenceMode(stat) {
        return String(stat?.世界?.異端レーダー?.現在模式||'').trim();
    }
    function causalCompactHtml(stat) {
        const world=stat?.世界||{},offsets=causalOffsetEntries(stat),latest=offsets.slice(0,CAUSAL_OVERVIEW_LIMIT);
        const stable=world.安定!==null&&world.安定!==''&&Number.isFinite(Number(world.安定))?Number(world.安定):null;
        const rows=latest.map(([name,record])=>'<button class="we-causal-jump" data-tab="因果档案"><span><b>'+causalOverviewEscape(name)+'</b><small>'+causalOverviewEscape(record?.引发者||'引發者未記録')+'</small></span><strong>'+causalOverviewEscape(causalImpactLabel(record?.影响程度))+'</strong><p>'+causalOverviewEscape(record?.描述||'偏移の説明はまだありません')+'</p></button>').join('');
        return '<div class="we-causal-summary"><button class="we-stability-compact" data-tab="因果档案"><span><small>世界安定値</small><strong>'+causalOverviewEscape(stable===null?'未記録':stable)+'</strong></span><em>因果档案を開く →</em></button>'
            +(rows?'<div class="we-causal-latest">'+rows+'</div>':'<div class="we-empty"><b>因果偏移はまだありません</b><small>重大かつ確認済みの因果変化がここに記録されます。</small></div>')
            +'<button class="we-link-btn" data-tab="因果档案">全 '+offsets.length+' 件の偏移・ストーリーラインと世界法则を見る →</button></div>';
    }
    function causalArchiveHtml(stat) {
        const world=stat?.世界||{},orbit=world.因果軌道||{},offsets=causalOffsetEntries(stat),stable=world.安定!==null&&world.安定!==''&&Number.isFinite(Number(world.安定))?Number(world.安定):null;
        const offsetCard=([name,record])=>'<article class="we-offset"><div class="we-offset-head"><b>'+causalOverviewEscape(name)+'</b><span>'+causalOverviewEscape(causalImpactLabel(record?.影响程度))+'</span></div><p>'+causalOverviewEscape(record?.描述||'偏移の説明はまだありません')+'</p><small>引發者 · '+causalOverviewEscape(record?.引发者||'未記録')+'</small></article>';
        const recent=offsets.slice(0,12),older=offsets.slice(12);
        const laws=Array.isArray(world.法則)?world.法則:(world.法則?[world.法則]:[]);
        const money=world.通貨||{};
        const interference=causalInterferenceMode(stat);
        const story='<article class="we-card we-causal-track"><dl><dt>現在の段階</dt><dd>'+causalOverviewEscape(orbit.現在段階||'待初始化')+'</dd><dt>ストーリーライン</dt><dd>'+causalOverviewEscape(orbit.ストーリーライン||'未記録')+'</dd><dt>次のノード</dt><dd>'+causalOverviewEscape(orbit.次ノード||'未記録')+'</dd></dl></article>';
        const stability='<div class="we-causal"><div class="we-stability"><div><small>世界安定値</small><strong data-world-stability>'+causalOverviewEscape(stable===null?'未記録':stable)+'</strong></div><span>完全な偏移は因果記憶として保持され、メインパネルには最新 '+CAUSAL_OVERVIEW_LIMIT+' 件のみを表示</span></div>'
            +(stable===null?'':'<meter min="0" max="120" value="'+Math.max(0,Math.min(120,stable))+'" aria-label="世界安定値">'+stable+'</meter>')
            +'</div>';
        const offsetList=recent.length?recent.map(offsetCard).join(''):'<div class="we-empty"><b>因果偏移はまだありません</b><small>記録が作られるのは、発生済みの重大かつ不可逆な結果のみです。</small></div>';
        const olderHtml=older.length?'<details class="we-offset-more"><summary>さらに古い '+older.length+' 件の偏移を見る</summary>'+older.map(offsetCard).join('')+'</details>':'';
        const interferenceHtml=interference?'<section class="we-section we-causal-interference"><div class="we-section-head"><h2>干涉模式</h2><small>インスタンス干渉状況</small></div><article class="we-card"><p>'+causalOverviewEscape(interference)+'</p></article></section>':'';
        const moneyHtml='<article class="we-card"><dl><dt>通貨体系</dt><dd>'+causalOverviewEscape(money.体系||'未記録')+'</dd><dt>購買力基準</dt><dd>'+causalOverviewEscape(money.購買力基準||'未記録')+'</dd><dt>経済変動</dt><dd>'+causalOverviewEscape(money.経済変動||'未記録')+'</dd></dl></article>';
        const lawHtml=laws.length?'<div class="we-reading we-world-laws">'+laws.map(item=>'<article><p>'+causalOverviewEscape(item)+'</p></article>').join('')+'</div>':'<div class="we-empty"><b>世界法则はまだありません</b><small>明確に有効な法則がここで保守されます。</small></div>';
        return '<div class="we-causal-archive-grid"><div><section class="we-section"><div class="we-section-head"><h2>因果偏移アーカイブ</h2><small>'+offsets.length+' 件 · 新しい順</small></div>'+stability+offsetList+olderHtml+'</section></div><aside><section class="we-section"><div class="we-section-head"><h2>因果軌道</h2><small>長期的な方向</small></div>'+story+'</section>'+interferenceHtml+'<section class="we-section"><div class="we-section-head"><h2>货币与经济</h2><small>世界進行が保守</small></div>'+moneyHtml+'</section><section class="we-section"><div class="we-section-head"><h2>世界法则</h2><small>'+laws.length+' 件</small></div>'+lawHtml+'</section></aside></div>';
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
                if(head){const h=head.querySelector('h2'),small=head.querySelector('small');if(h)h.textContent='因果サマリー';if(small)small.textContent='最新 '+Math.min(CAUSAL_OVERVIEW_LIMIT,causalOffsetEntries(stat).length)+' 件 · クリックでアーカイブへ';}
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
    // 因果偏移の手動保守：プレイヤーは偏移を直接修正/削除でき、書き戻し後は即座に安定値を再計算し、同一メッセージの replay も同期する。
    function causalOffsetRecalculateStability(stat) {
        if(!plain(stat?.世界))return null;
        if(stat.設定?.世界超安定===true){stat.世界.安定=100;return 100;}
        const bucket=stat.世界?.因果軌道?.偏移記録||{};
        const total=Object.values(plain(bucket)?bucket:{}).reduce((sum,item)=>sum+(Number(item?.影響度)||0),0);
        const stable=Math.max(0,Math.min(120,100+total));
        stat.世界.安定=stable;
        return stable;
    }
    function causalOffsetReplaySamePath(left,right) {
        return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>String(item)===String(right[index]));
    }
    function causalOffsetSyncReplay(raw,fingerprint,oldName,newName,record,deleted,stable) {
        const replay=raw?.__samsaraWorldReplay;
        if(!plain(replay)||String(replay.fingerprint||'')!==String(fingerprint||'')||!Array.isArray(replay.operations))return;
        const oldPath=['世界','因果軌道','偏移記録',String(oldName||'')];
        const newPath=['世界','因果軌道','偏移記録',String(newName||'')];
        const stabilityPath=['世界','安定'];
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
            if(!plain(stat?.世界?.因果軌道))stat.世界.因果軌道={};
            if(!plain(stat.世界.因果軌道.偏移記録))stat.世界.因果軌道.偏移記録={};
            const outcome=mutator(stat.世界.因果軌道.偏移記録);
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
            this.status=status||'因果偏移を更新しました';
            this.render(true);
            return true;
        }
        async setCausalOffsetRecord(oldName,newName,record) {
            oldName=String(oldName||'').trim();newName=String(newName||'').trim();
            if(!oldName||!newName||!plain(record))throw new Error('偏移名と記録は空にできません');
            const impact=Number(record.影响程度);
            if(!Number.isFinite(impact)||impact===0||impact<-12||impact>15)throw new Error('影響度は -12~-1 または +1~+15の範囲で指定してください');
            return this.persistCausalOffsetMutation(bucket=>{
                if(!Object.hasOwn(bucket,oldName))throw new Error('偏移記録が存在しません：'+oldName);
                if(newName!==oldName&&Object.hasOwn(bucket,newName))throw new Error('偏移名は既に存在します：'+newName);
                const next={説明:String(record.描述||'').trim(),誘発者:String(record.引发者||'').trim(),影響度:impact};
                if(newName!==oldName)delete bucket[oldName];
                bucket[newName]=next;
                return {oldName,newName,record:next,deleted:false};
            },'因果偏移を編集しました · 安定値を再計算');
        }
        async removeCausalOffsetRecord(name) {
            name=String(name||'').trim();if(!name)return false;
            return this.persistCausalOffsetMutation(bucket=>{
                if(!Object.hasOwn(bucket,name))return null;
                delete bucket[name];
                return {oldName:name,newName:name,record:null,deleted:true};
            },'因果偏移を削除しました · 安定値を再計算');
        }
        causalOffsetRecord(name) {
            return this.snapshot().stat?.世界?.因果軌道?.偏移記録?.[name]||null;
        }
        causalOffsetInlineEditorHtml(name,record) {
            const impact=Number(record?.影响程度);
            return '<div class="we-offset-inline-editor" data-offset-editor data-offset-original-name="'+causalOverviewEscape(name)+'">'
                +'<div class="we-offset-edit-grid">'
                +'<label class="we-offset-edit-field"><span>偏移名</span><input type="text" data-offset-field="name" value="'+causalOverviewEscape(name)+'"></label>'
                +'<label class="we-offset-edit-field"><span>影響度</span><input type="number" min="-12" max="15" step="1" data-offset-field="impact" value="'+causalOverviewEscape(Number.isFinite(impact)?impact:'')+'"><small>-12~-1 または +1~+15</small></label>'
                +'<label class="we-offset-edit-field we-offset-edit-wide"><span>偏移説明</span><textarea rows="4" data-offset-field="description" placeholder="すでに実現した世界規模の長期的変化のみを書く">'+causalOverviewEscape(record?.描述||'')+'</textarea></label>'
                +'<label class="we-offset-edit-field we-offset-edit-wide"><span>引發者</span><input type="text" data-offset-field="actor" value="'+causalOverviewEscape(record?.引发者||'')+'"></label>'
                +'</div><div class="we-offset-actions we-offset-edit-actions">'
                +'<button type="button" class="we-offset-save" data-action="causal-offset-save" data-offset-name="'+causalOverviewEscape(name)+'">保存</button>'
                +'<button type="button" data-action="causal-offset-cancel">キャンセル</button>'
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
                説明:String(value('description')||'').trim(),
                誘発者:String(value('actor')||'').trim(),
                影響度:Number(value('impact'))
            });
        }
        armCausalOffsetDelete(button,name) {
            if(!button)return false;
            const actions=button.closest('.we-offset-actions');if(!actions)return false;
            button.dataset.action='causal-offset-delete-confirm';
            button.textContent='削除を確認';
            button.classList.add('we-offset-delete-confirm');
            if(!actions.querySelector('[data-action="causal-offset-delete-cancel"]')){
                const cancel=this.host.document.createElement('button');
                cancel.type='button';cancel.dataset.action='causal-offset-delete-cancel';cancel.textContent='キャンセル';
                cancel.dataset.offsetName=String(name||'');
                actions.appendChild(cancel);
            }
            return true;
        }
        cancelCausalOffsetDelete(button) {
            const actions=button?.closest?.('.we-offset-actions');if(!actions)return false;
            const confirm=actions.querySelector('[data-action="causal-offset-delete-confirm"]');
            if(confirm){confirm.dataset.action='causal-offset-delete';confirm.textContent='削除';confirm.classList.remove('we-offset-delete-confirm');}
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
                actions.innerHTML='<button type="button" data-action="causal-offset-edit" data-offset-name="'+causalOverviewEscape(name)+'">編集</button><button type="button" data-action="causal-offset-delete" data-offset-name="'+causalOverviewEscape(name)+'">削除</button>';
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
                    const message=String(error?.message||error||'因果偏移の操作に失敗しました');
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
    // 専用 API プリセットの選択状態：プリセット選択後は、パネルが再描画されても選択を保持し削除を許可しなければならない。
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
            if(this.tab!=='設定'||!this.panel)return;
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
    // 世界の長期歴史記憶：「世界進行ごとに L0 の葉を一つ → 古い葉を階層ごとに圧縮」という要約の森として動作する。
    // 事件のコールドアーカイブは引き続きバックエンド.历史に保持されるが、直近/長期記憶ツリーの L0 ソースにはならない；L0 は毎回成功した世界進行の WorldResult.摘要のみに由来する。
    // 同じ本文フロアを再推論するとそのフロアの葉が上書きされ、古い葉に依存する上位要約が再帰的に無効化される。これは要約システムの regenerate/edit による再要約に等しい。
    // L0 が 18 条に達したら最古の 12 条を圧縮し、直近 6 条の生の詳細を残す；L1 は 6 条ごとに一段圧縮；L2+ は 3 条ごとに上位へ続ける。
    const HISTORY_MEMORY_L0_BATCH=12;
    const HISTORY_MEMORY_L0_KEEP=6;
    const HISTORY_MEMORY_L1_BATCH=6;
    const HISTORY_MEMORY_HIGHER_BATCH=3;
    const HISTORY_MEMORY_LEGACY_RAW_CONTEXT=24;
    const HISTORY_MEMORY_LEAF_PREFIX='推进·';
    const HISTORY_MEMORY_SCHEMA={
        type:'object',additionalProperties:false,required:['要約'],
        properties:{要約:{type:'string',minLength:1}}
    };
    const HISTORY_MEMORY_SYSTEM=`【世界长期历史压缩】
確定済みの歴史的事実のみを要約すること。受け取るのは実際の時系列順に並んだ既存の歴史ノードであり、任務はそれらをより高次の世界史記憶へ融合することであって、物語の続きを書くことではない。
必ず保持すること：時間順序、主要な参与者、原因、重要な転換点、最終結果、および今後の情勢に影響し続ける長期的帰結と重要な因果偏移。
削除してよいもの：重複した記述、以後の意味を失った過程の細部、UI/デバッグ情報。
禁止：未発生の筋書きの補記、隠された真相の推測、既存の結末の改変、入力中に存在しない日付/人物/関係の捏造、歴史的事実を未来の計画として書くこと。
入力の時間粒度が不完全な場合は、元の粒度を維持し、勝手に補完しないこと。
JSONのみを出力：{"要約":"..."}`;

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
        return Object.entries(source.历史总结||{}).filter(([,item])=>plain(item)&&Number(item.階層)===level)
            .map(([name,item],index)=>({
                id:'总结:'+name,name,level,text:String(item.要約||'').trim(),
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
        const summary=String(value?.要約||value?.summary||'').trim();
        if(!summary)throw new Error(source?'歴史要約に失敗：返答に要約 JSON':'歴史要約に失敗：モデルの空応答');
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
            説明:'指定された順序で圧縮すること；時間フィールドは権威あるアンカーであり、書き換えたり捏造してはならない。',
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
                名称:name,階層:Math.max(1,Number(item.階層)||1),
                起始时间:String(item.起始时间||''),结束时间:String(item.结束时间||''),要約:String(item.要約||''),
                __order:historyMemorySummaryOrder(item,index+1)
            })).filter(item=>item.要約)
            .sort((a,b)=>a.__order-b.__order||a.階層-b.階層||a.名称.localeCompare(b.名称,'zh-CN'))
            .map(item=>{const out={...item};delete out.__order;return out;});
        return {
            説明:'世界の長期的な叙事と因果の記憶；章をまたぐ連続性を保つためのものであり、自動的にいずれかのキャラクターが既に知得した情報を意味するものではない。',
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

    // 世界進行システム自身は常に「直近のルートアンカー + より古いルート要約」を読み取り、本文が読み取るかどうかは独立した設定で制御される。
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
                时间:String(next.世界?.時間||backend.已处理时间||context.baseStat?.世界?.時間||''),
                事实:summary,
                关联事件:[]
            };
            const previous=backend.历史[key];
            if(plain(previous)&&String(previous.时间||'')===record.时间&&String(previous.事实||'')===record.事实)return false;
            backend.历史[key]=record;
            const invalidated=historyMemoryInvalidateAncestors(backend,'历史:'+key);
            this.lastHistoryMaintenance='直近の歴史を更新'+(invalidated.length?' · 旧要約が '+invalidated.length+' 件無効':'');
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
                // 現在の層に親ノードを一つだけ生成し、その後さらに上位の層を確認する；同一層の大量の古いデータは後続の世界進行へ分散させ、一度に多数の副リクエストが発生するのを避ける。
                for(let level=0;level<32;level++){
                    const batch=historyMemoryBatchForLevel(backend,level);
                    if(!batch.length)continue;
                    const outputLevel=level+1;
                    this.status='長期歴史記憶を整理中 · L'+outputLevel;this.render();
                    let summary='';
                    try{summary=await this.requestHistoryMemorySummary(stat.世界,batch,outputLevel);}
                    catch(error){failed=String(error?.message||error);break;}
                    const key=historyMemoryNextKey(backend,outputLevel);
                    backend.历史总结[key]={
                        階層:outputLevel,要約:summary,子项:batch.map(node=>node.id),
                        起始时间:String(batch.find(node=>node.timeStart)?.timeStart||''),
                        结束时间:String([...batch].reverse().find(node=>node.timeEnd)?.timeEnd||''),
                        起始序位:Math.min(...batch.map(node=>Number(node.lo)||0).filter(n=>n>0)),
                        结束序位:Math.max(...batch.map(node=>Number(node.hi)||0).filter(n=>n>0)),
                        创建时间:String(stat.世界?.時間||'')
                    };
                    made++;
                }
                if(!made)return 0;
                const current=this.snapshot(),currentBackend=current.stat?.世界?.[PATH];
                if(historyMemoryDigest(currentBackend)!==startDigest){
                    this.lastHistoryMaintenance='要約中に歴史が変化したため、今回の要約結果は破棄し、次回に再試行';
                    return 0;
                }
                const validate=this.host.Samsara&&this.host.Samsara.validateWorldState;
                const next=validate?validate(stat):stat;
                const result=current.raw;result.stat_data=next;
                this.committing=true;
                await current.mvu.replaceMvuData(result,{type:'message',message_id:current.id});
                this.lastHistoryMaintenance='歴史要約ノードを '+made+' 件追加';
                return made;
            } finally {
                this.committing=false;
                if(failed)this.lastHistoryMaintenance='歴史要約は後で再試行：'+failed;
                this.status=previousStatus+(made?' · 歴史要約+'+made:(failed?' · 歴史要約は再試行待ち':''));
                this.render();
                this.historyMaintenanceBusy=false;
            }
        }
        async run() {
            const result=await super.run();
            if(result===true){
                try{await this.maintainHistoryMemory();}catch(error){
                    this.lastHistoryMaintenance='歴史要約は後で再試行：'+String(error?.message||error);
                    try{console.warn('[世界推进] '+this.lastHistoryMaintenance);}catch(_){}
                }
            }
            return result;
        }
    };
    // 歴史記憶の手動保守：直近の原始アンカーは事実を修正でき、長期要約は要約/時間を修正できるが、ツリーの階層と子項参照は常にプログラムが管理する。
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
            if(!name)throw new Error('歴史記録の名称は空にできません');
            const snapshot=this.snapshot(),next=copy(snapshot.raw),stat=next.stat_data,backend=stat?.世界?.[PATH];
            if(!plain(backend))throw new Error('世界バックエンドが存在しません');
            const bucketName=kind==='summary'?'历史总结':'历史';
            const bucket=backend[bucketName];
            if(!plain(bucket)||!plain(bucket[name]))throw new Error((kind==='summary'?'长期历史总结':'近期历史锚点')+'が存在しません：'+name);
            const updated=build(copy(bucket[name]));
            if(!plain(updated))throw new Error('歴史編集の結果が無効です');
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
            this.lastHistoryMaintenance=status||'歴史記憶を手動修正しました';
            this.status=status||'歴史記憶を手動修正しました';
            this.render(true);
            return true;
        }
        async setHistoryAnchorRecord(name,record) {
            const time=String(record?.时间||'').trim(),fact=String(record?.事实||'').trim();
            if(!fact)throw new Error('歴史的事実は空にできません');
            const related=historyMemoryEditorRelated(record?.关联事件);
            return this.persistHistoryMemoryEdit('anchor',name,current=>({
                ...current,
                时间:time,
                事实:fact,
                关联事件:related
            }),'近期历史锚点を修正しました');
        }
        async setHistorySummaryRecord(name,record) {
            const summary=String(record?.摘要||'').trim();
            if(!summary)throw new Error('長期歴史要約は空にできません');
            const start=String(record?.起始时间||'').trim(),end=String(record?.结束时间||'').trim();
            return this.persistHistoryMemoryEdit('summary',name,current=>({
                ...current,
                // 階層・子項・序位・作成時間はすべて保持し、追跡可能な要約ツリーを壊さないようにする。
                要約:summary,
                起始时间:start,
                结束时间:end
            }),'长期历史总结を修正しました');
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
                +'<label class="we-history-edit-field"><span>時間</span><input type="text" data-history-field="time" value="'+historyMemoryEditorEscape(record?.时间||'')+'"></label>'
                +'<label class="we-history-edit-field we-history-edit-wide"><span>確認済みの事実</span><textarea rows="4" data-history-field="fact" placeholder="すでに確認された歴史的事実のみを書く">'+historyMemoryEditorEscape(record?.事实||'')+'</textarea></label>'
                +'<label class="we-history-edit-field we-history-edit-wide"><span>関連イベント</span><input type="text" data-history-field="related" value="'+historyMemoryEditorEscape((Array.isArray(record?.关联事件)?record.关联事件:[]).join('、'))+'"><small>複数のイベントは 、 またはカンマで区切れます</small></label>'
                +'</div><div class="we-history-actions">'
                +'<button type="button" class="we-history-save" data-action="history-anchor-save" data-history-name="'+historyMemoryEditorEscape(name)+'">保存</button>'
                +'<button type="button" data-action="history-anchor-cancel">キャンセル</button>'
                +'</div></div>';
        }
        historySummaryInlineEditorHtml(name,record) {
            return '<div class="we-history-inline-editor" data-history-editor="summary" data-history-name="'+historyMemoryEditorEscape(name)+'">'
                +'<div class="we-history-edit-title"><b>'+historyMemoryEditorEscape(name)+'</b><span>L'+historyMemoryEditorEscape(Number(record?.层级)||1)+' · ツリー構造ロック</span></div>'
                +'<div class="we-history-edit-grid">'
                +'<label class="we-history-edit-field"><span>開始時間</span><input type="text" data-history-field="start" value="'+historyMemoryEditorEscape(record?.起始时间||'')+'"></label>'
                +'<label class="we-history-edit-field"><span>終了時間</span><input type="text" data-history-field="end" value="'+historyMemoryEditorEscape(record?.结束时间||'')+'"></label>'
                +'<label class="we-history-edit-field we-history-edit-wide"><span>長期歴史要約</span><textarea rows="5" data-history-field="summary" placeholder="この長期歴史の確認済み事実の要約を修正">'+historyMemoryEditorEscape(record?.摘要||'')+'</textarea></label>'
                +'</div><div class="we-history-actions">'
                +'<button type="button" class="we-history-save" data-action="history-summary-save" data-history-name="'+historyMemoryEditorEscape(name)+'">保存</button>'
                +'<button type="button" data-action="history-summary-cancel">キャンセル</button>'
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
                要約:String(value('summary')||'').trim()
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
                actions.innerHTML='<button type="button" data-action="history-anchor-edit" data-history-name="'+historyMemoryEditorEscape(name)+'">編集</button>';
                card.appendChild(actions);
            });
            const summaryNames=(memory.长期总结||[]).slice().reverse().map(item=>item.名称);
            const summarySection=this.historyMemoryEditorSection('长期历史总结');
            Array.from(summarySection?.querySelectorAll('.we-card')||[]).forEach((card,index)=>{
                const name=summaryNames[index];if(!name||card.querySelector('.we-history-actions'))return;
                card.dataset.historyName=name;card.dataset.historyKind='summary';
                const actions=this.host.document.createElement('div');actions.className='we-history-actions';
                actions.innerHTML='<button type="button" data-action="history-summary-edit" data-history-name="'+historyMemoryEditorEscape(name)+'">編集</button>';
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
                    const message=String(error?.message||error||'歴史記憶の編集に失敗しました');
                    const toast=this.host?.toastr||this.env?.toastr;
                    if(toast?.error)toast.error(message,'歴史記憶');else try{console.error('[历史记忆编辑]',error);}catch(_){}
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
    // 期限到来イベントはソフト再確認を採用する：モデルに処理を促すが、ラウンド全体の書き込みを左右するハードルにはしない。
    function dueEventReviewPoint(event) {
        const nextCheck=String(event?.下次检查||'').trim();
        if(nextCheck)return {原文:nextCheck,键:worldDateKey(nextCheck),出典:'下次检查'};
        const planned=String(event?.时间||event?.开始时间||'').trim();
        return {原文:planned,键:worldDateKey(planned),出典:'计划时间'};
    }
    function relaxedDueEvents(stat) {
        const now=worldDateKey(stat?.世界?.時間);if(now===null)return [];
        const events=stat?.世界?.[PATH]?.事件||{},due=[];
        for(const [名称,event] of Object.entries(events)){
            if(!plain(event)||event.状态!=='待发生')continue;
            const review=dueEventReviewPoint(event);
            // 明確な将来の再確認時刻がまだ到来していない場合は重ねて催促しない；意味論的な「下次检查」が比較できない場合はソフト警告のみを行い、書き込みを阻害しない。
            if(review.来源==='下次检查'&&review.键!==null&&review.键>now)continue;
            if(review.来源==='计划时间'&&(review.键===null||review.键>now))continue;
            due.push({
                名称,
                时间:String(event.时间||event.开始时间||''),
                下次检查:String(event.下次检查||''),
                条件:String(event.条件||''),
                前因:copy(event.前因||[]),
                复核依据:review.来源,
                説明:'ソフト警告：このイベントは計画/再確認時刻に到達した。条件と前因が満たされれば进行中へ移行する；まだ発生しない場合は待发生のまま維持し、新しい「下次检查」を優先的に記入してよい。「条件」はイベントのトリガー条件のみを表し、延期や阻害として書き換えてはならない。未処理でも今回の世界進行が却下されることはない。'
            });
        }
        return due;
    }

    // 旧版は「更新时间===当前时间 + 下次检查 + 条件」の三項目が揃うことを要求し、揃わなければラウンド全体を却下していた。
    // 期限到来イベントは現在、モデル向けのソフト再確認リストとしてのみ扱う；未処理の場合は元のイベントを保持し、次ラウンドでも引き続き通知する。再試行の無限ループは作らない。
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
    // CommonJS エントリはオフライン試験専用であり、ブラウザスクリプトはバンドラに依存しない。
    if (typeof module !== 'undefined' && module.exports) { module.exports = {SamsaraWorldEngine,applyPatches,parseReply,emptyState,RECORDS,compileWorldResult,normalizeWorldResult,mergeWorldResults,WORLD_RESULT_SCHEMA,projectWorldContext,compactWorldLifecycle,calendarDate,repairExplorationGranularity,sortWorldEvents,eventScheduleLabel,staleActiveEvents,temporalAnomalies,activeAlienActivityRequirements,pruneDeadAlienPeople,extractWorldProse,derivePersonWorldContext,projectHotWorldPeople,WORLD_UI_THEMES,WORLD_FONT_SCALES,estimateTokens,formatTokenCount,normalizeTokenUsage,requestTokenTelemetry}; return; }
    const host = root.parent && root.parent !== root ? root.parent : root;
    // 酒場スクリプトのサンドボックスでは、ヘルパーインターフェースがレキシカルグローバルであり、必ずしも iframe.window に生えているとは限らない。
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
