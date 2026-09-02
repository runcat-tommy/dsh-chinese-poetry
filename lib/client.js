/**
 * dsh-chinese-poetry, browser half (M1: data layer + search view).
 *
 * Registers a '诗词' tab in the conversation view ring — the same
 * `conversation.view` slot the built-in Chat (对话) and Trajectory (轨迹)
 * tabs use — so it appears in the session header right after Trajectory
 * (order: 20). The view exposes a token-free poetry search backed by the
 * free public API (poetry.palemoky.com) through a client-side data layer
 * with sliding-window rate limiting, local caching, 429 backoff, and an
 * offline fallback table — so normal use never trips the API rate limit
 * and the tab keeps working when the API is down.
 *
 * Hand-written ModuleLoader bundle (no build step). Locale-aware copy follows
 * the DSH UI language via the `locale` service (zh / en).
 *
 * The data layer is exported on the module (exports.PoetryDataLayer) so the
 * node test suite can unit-test it with injected fetch/storage/timers.
 *
 * Reference implementations:
 *   - dsh-view-manager/lib/client.js   (minimal runnable plugin template)
 *   - dsh-client-ui-trajectory/lib/client.js (conversation.view registration)
 */

window.__ModuleLoader__.load({
  id: "dsh-chinese-poetry",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    var NS = "chinesePoetry";
    var PLUGIN_VERSION = "1.2.4"; // keep in sync with package.json
    var API_PROJECT_URL = "https://github.com/palemoky/chinese-poetry-api";

    /* ============================ data layer ============================ */

    /**
     * Offline fallback table: a compact set of well-known poems used when the
     * public API is unreachable or the client entered cache-only mode after
     * repeated 429s. ~70 well-known poems covering the most common two-char
     * imagery (明月/黄河/长安/孤舟/天涯/人间/春风/桃花/故人…), so short
     * (2-char) queries — which the public API rejects with 400 — still return
     * useful local matches.
     */
    var OFFLINE_POEMS = [
      // —— 唐诗 · 五言绝句/律诗 ——
      { title: "静夜思", author: "李白", dynasty: "唐", type: "五言绝句", content: ["床前明月光，疑是地上霜。", "举头望明月，低头思故乡。"] },
      { title: "春晓", author: "孟浩然", dynasty: "唐", type: "五言绝句", content: ["春眠不觉晓，处处闻啼鸟。", "夜来风雨声，花落知多少。"] },
      { title: "登鹳雀楼", author: "王之涣", dynasty: "唐", type: "五言绝句", content: ["白日依山尽，黄河入海流。", "欲穷千里目，更上一层楼。"] },
      { title: "相思", author: "王维", dynasty: "唐", type: "五言绝句", content: ["红豆生南国，春来发几枝。", "愿君多采撷，此物最相思。"] },
      { title: "鹿柴", author: "王维", dynasty: "唐", type: "五言绝句", content: ["空山不见人，但闻人语响。", "返景入深林，复照青苔上。"] },
      { title: "鸟鸣涧", author: "王维", dynasty: "唐", type: "五言绝句", content: ["人闲桂花落，夜静春山空。", "月出惊山鸟，时鸣春涧中。"] },
      { title: "竹里馆", author: "王维", dynasty: "唐", type: "五言绝句", content: ["独坐幽篁里，弹琴复长啸。", "深林人不知，明月来相照。"] },
      { title: "江雪", author: "柳宗元", dynasty: "唐", type: "五言绝句", content: ["千山鸟飞绝，万径人踪灭。", "孤舟蓑笠翁，独钓寒江雪。"] },
      { title: "悯农", author: "李绅", dynasty: "唐", type: "五言绝句", content: ["锄禾日当午，汗滴禾下土。", "谁知盘中餐，粒粒皆辛苦。"] },
      { title: "寻隐者不遇", author: "贾岛", dynasty: "唐", type: "五言绝句", content: ["松下问童子，言师采药去。", "只在此山中，云深不知处。"] },
      { title: "逢雪宿芙蓉山主人", author: "刘长卿", dynasty: "唐", type: "五言绝句", content: ["日暮苍山远，天寒白屋贫。", "柴门闻犬吠，风雪夜归人。"] },
      { title: "塞下曲", author: "卢纶", dynasty: "唐", type: "五言绝句", content: ["月黑雁飞高，单于夜遁逃。", "欲将轻骑逐，大雪满弓刀。"] },
      { title: "独坐敬亭山", author: "李白", dynasty: "唐", type: "五言绝句", content: ["众鸟高飞尽，孤云独去闲。", "相看两不厌，只有敬亭山。"] },
      { title: "夜宿山寺", author: "李白", dynasty: "唐", type: "五言绝句", content: ["危楼高百尺，手可摘星辰。", "不敢高声语，恐惊天上人。"] },
      { title: "所见", author: "袁枚", dynasty: "清", type: "五言绝句", content: ["牧童骑黄牛，歌声振林樾。", "意欲捕鸣蝉，忽然闭口立。"] },
      { title: "春望", author: "杜甫", dynasty: "唐", type: "五言律诗", content: ["国破山河在，城春草木深。", "感时花溅泪，恨别鸟惊心。", "烽火连三月，家书抵万金。", "白头搔更短，浑欲不胜簪。"] },
      { title: "望岳", author: "杜甫", dynasty: "唐", type: "五言律诗", content: ["岱宗夫如何？齐鲁青未了。", "造化钟神秀，阴阳割昏晓。", "荡胸生曾云，决眦入归鸟。", "会当凌绝顶，一览众山小。"] },
      { title: "使至塞上", author: "王维", dynasty: "唐", type: "五言律诗", content: ["单车欲问边，属国过居延。", "征蓬出汉塞，归雁入胡天。", "大漠孤烟直，长河落日圆。", "萧关逢候骑，都护在燕然。"] },
      { title: "赋得古原草送别", author: "白居易", dynasty: "唐", type: "五言律诗", content: ["离离原上草，一岁一枯荣。", "野火烧不尽，春风吹又生。", "远芳侵古道，晴翠接荒城。", "又送王孙去，萋萋满别情。"] },
      { title: "古朗月行", author: "李白", dynasty: "唐", type: "五言古诗", content: ["小时不识月，呼作白玉盘。", "又疑瑶台镜，飞在青云端。"] },
      { title: "子夜吴歌·秋歌", author: "李白", dynasty: "唐", type: "五言古诗", content: ["长安一片月，万户捣衣声。", "秋风吹不尽，总是玉关情。", "何日平胡虏，良人罢远征。"] },
      { title: "游子吟", author: "孟郊", dynasty: "唐", type: "五言古诗", content: ["慈母手中线，游子身上衣。", "临行密密缝，意恐迟迟归。", "谁言寸草心，报得三春晖。"] },
      { title: "夏日绝句", author: "李清照", dynasty: "宋", type: "五言绝句", content: ["生当作人杰，死亦为鬼雄。", "至今思项羽，不肯过江东。"] },
      { title: "七步诗", author: "曹植", dynasty: "魏晋", type: "五言古诗", content: ["煮豆持作羹，漉菽以为汁。", "萁在釜下燃，豆在釜中泣。", "本自同根生，相煎何太急？"] },
      { title: "敕勒歌", author: "佚名", dynasty: "南北朝", type: "乐府诗", content: ["敕勒川，阴山下。", "天似穹庐，笼盖四野。", "天苍苍，野茫茫，风吹草低见牛羊。"] },
      // —— 唐诗 · 七言绝句/律诗 ——
      { title: "望庐山瀑布", author: "李白", dynasty: "唐", type: "七言绝句", content: ["日照香炉生紫烟，遥看瀑布挂前川。", "飞流直下三千尺，疑是银河落九天。"] },
      { title: "早发白帝城", author: "李白", dynasty: "唐", type: "七言绝句", content: ["朝辞白帝彩云间，千里江陵一日还。", "两岸猿声啼不住，轻舟已过万重山。"] },
      { title: "望天门山", author: "李白", dynasty: "唐", type: "七言绝句", content: ["天门中断楚江开，碧水东流至此回。", "两岸青山相对出，孤帆一片日边来。"] },
      { title: "黄鹤楼送孟浩然之广陵", author: "李白", dynasty: "唐", type: "七言绝句", content: ["故人西辞黄鹤楼，烟花三月下扬州。", "孤帆远影碧空尽，唯见长江天际流。"] },
      { title: "赠汪伦", author: "李白", dynasty: "唐", type: "七言绝句", content: ["李白乘舟将欲行，忽闻岸上踏歌声。", "桃花潭水深千尺，不及汪伦送我情。"] },
      { title: "绝句", author: "杜甫", dynasty: "唐", type: "七言绝句", content: ["两个黄鹂鸣翠柳，一行白鹭上青天。", "窗含西岭千秋雪，门泊东吴万里船。"] },
      { title: "江南逢李龟年", author: "杜甫", dynasty: "唐", type: "七言绝句", content: ["岐王宅里寻常见，崔九堂前几度闻。", "正是江南好风景，落花时节又逢君。"] },
      { title: "江畔独步寻花", author: "杜甫", dynasty: "唐", type: "七言绝句", content: ["黄四娘家花满蹊，千朵万朵压枝低。", "留连戏蝶时时舞，自在娇莺恰恰啼。"] },
      { title: "山行", author: "杜牧", dynasty: "唐", type: "七言绝句", content: ["远上寒山石径斜，白云生处有人家。", "停车坐爱枫林晚，霜叶红于二月花。"] },
      { title: "清明", author: "杜牧", dynasty: "唐", type: "七言绝句", content: ["清明时节雨纷纷，路上行人欲断魂。", "借问酒家何处有？牧童遥指杏花村。"] },
      { title: "江南春", author: "杜牧", dynasty: "唐", type: "七言绝句", content: ["千里莺啼绿映红，水村山郭酒旗风。", "南朝四百八十寺，多少楼台烟雨中。"] },
      { title: "泊秦淮", author: "杜牧", dynasty: "唐", type: "七言绝句", content: ["烟笼寒水月笼沙，夜泊秦淮近酒家。", "商女不知亡国恨，隔江犹唱后庭花。"] },
      { title: "赤壁", author: "杜牧", dynasty: "唐", type: "七言绝句", content: ["折戟沉沙铁未销，自将磨洗认前朝。", "东风不与周郎便，铜雀春深锁二乔。"] },
      { title: "秋夕", author: "杜牧", dynasty: "唐", type: "七言绝句", content: ["银烛秋光冷画屏，轻罗小扇扑流萤。", "天阶夜色凉如水，卧看牵牛织女星。"] },
      { title: "送元二使安西", author: "王维", dynasty: "唐", type: "七言绝句", content: ["渭城朝雨浥轻尘，客舍青青柳色新。", "劝君更尽一杯酒，西出阳关无故人。"] },
      { title: "九月九日忆山东兄弟", author: "王维", dynasty: "唐", type: "七言绝句", content: ["独在异乡为异客，每逢佳节倍思亲。", "遥知兄弟登高处，遍插茱萸少一人。"] },
      { title: "芙蓉楼送辛渐", author: "王昌龄", dynasty: "唐", type: "七言绝句", content: ["寒雨连江夜入吴，平明送客楚山孤。", "洛阳亲友如相问，一片冰心在玉壶。"] },
      { title: "出塞", author: "王昌龄", dynasty: "唐", type: "七言绝句", content: ["秦时明月汉时关，万里长征人未还。", "但使龙城飞将在，不教胡马度阴山。"] },
      { title: "凉州词", author: "王翰", dynasty: "唐", type: "七言绝句", content: ["葡萄美酒夜光杯，欲饮琵琶马上催。", "醉卧沙场君莫笑，古来征战几人回？"] },
      { title: "凉州词", author: "王之涣", dynasty: "唐", type: "七言绝句", content: ["黄河远上白云间，一片孤城万仞山。", "羌笛何须怨杨柳，春风不度玉门关。"] },
      { title: "别董大", author: "高适", dynasty: "唐", type: "七言绝句", content: ["千里黄云白日曛，北风吹雁雪纷纷。", "莫愁前路无知己，天下谁人不识君。"] },
      { title: "枫桥夜泊", author: "张继", dynasty: "唐", type: "七言绝句", content: ["月落乌啼霜满天，江枫渔火对愁眠。", "姑苏城外寒山寺，夜半钟声到客船。"] },
      { title: "乌衣巷", author: "刘禹锡", dynasty: "唐", type: "七言绝句", content: ["朱雀桥边野草花，乌衣巷口夕阳斜。", "旧时王谢堂前燕，飞入寻常百姓家。"] },
      { title: "望洞庭", author: "刘禹锡", dynasty: "唐", type: "七言绝句", content: ["湖光秋月两相和，潭面无风镜未磨。", "遥望洞庭山水翠，白银盘里一青螺。"] },
      { title: "浪淘沙", author: "刘禹锡", dynasty: "唐", type: "七言绝句", content: ["九曲黄河万里沙，浪淘风簸自天涯。", "如今直上银河去，同到牵牛织女家。"] },
      { title: "暮江吟", author: "白居易", dynasty: "唐", type: "七言绝句", content: ["一道残阳铺水中，半江瑟瑟半江红。", "可怜九月初三夜，露似真珠月似弓。"] },
      { title: "咏柳", author: "贺知章", dynasty: "唐", type: "七言绝句", content: ["碧玉妆成一树高，万条垂下绿丝绦。", "不知细叶谁裁出，二月春风似剪刀。"] },
      { title: "回乡偶书", author: "贺知章", dynasty: "唐", type: "七言绝句", content: ["少小离家老大回，乡音无改鬓毛衰。", "儿童相见不相识，笑问客从何处来。"] },
      { title: "小儿垂钓", author: "胡令能", dynasty: "唐", type: "七言绝句", content: ["蓬头稚子学垂纶，侧坐莓苔草映身。", "路人借问遥招手，怕得鱼惊不应人。"] },
      { title: "滁州西涧", author: "韦应物", dynasty: "唐", type: "七言绝句", content: ["独怜幽草涧边生，上有黄鹂深树鸣。", "春潮带雨晚来急，野渡无人舟自横。"] },
      { title: "夜雨寄北", author: "李商隐", dynasty: "唐", type: "七言绝句", content: ["君问归期未有期，巴山夜雨涨秋池。", "何当共剪西窗烛，却话巴山夜雨时。"] },
      { title: "乐游原", author: "李商隐", dynasty: "唐", type: "五言绝句", content: ["向晚意不适，驱车登古原。", "夕阳无限好，只是近黄昏。"] },
      { title: "无题", author: "李商隐", dynasty: "唐", type: "七言律诗", content: ["相见时难别亦难，东风无力百花残。", "春蚕到死丝方尽，蜡炬成灰泪始干。", "晓镜但愁云鬓改，夜吟应觉月光寒。", "蓬山此去无多路，青鸟殷勤为探看。"] },
      { title: "蜂", author: "罗隐", dynasty: "唐", type: "七言绝句", content: ["不论平地与山尖，无限风光尽被占。", "采得百花成蜜后，为谁辛苦为谁甜。"] },
      { title: "登高", author: "杜甫", dynasty: "唐", type: "七言律诗", content: ["风急天高猿啸哀，渚清沙白鸟飞回。", "无边落木萧萧下，不尽长江滚滚来。", "万里悲秋常作客，百年多病独登台。", "艰难苦恨繁霜鬓，潦倒新停浊酒杯。"] },
      { title: "闻官军收河南河北", author: "杜甫", dynasty: "唐", type: "七言律诗", content: ["剑外忽传收蓟北，初闻涕泪满衣裳。", "却看妻子愁何在，漫卷诗书喜欲狂。", "白日放歌须纵酒，青春作伴好还乡。", "即从巴峡穿巫峡，便下襄阳向洛阳。"] },
      { title: "钱塘湖春行", author: "白居易", dynasty: "唐", type: "七言律诗", content: ["孤山寺北贾亭西，水面初平云脚低。", "几处早莺争暖树，谁家新燕啄春泥。", "乱花渐欲迷人眼，浅草才能没马蹄。", "最爱湖东行不足，绿杨阴里白沙堤。"] },
      // —— 宋诗 ——
      { title: "题西林壁", author: "苏轼", dynasty: "宋", type: "七言绝句", content: ["横看成岭侧成峰，远近高低各不同。", "不识庐山真面目，只缘身在此山中。"] },
      { title: "饮湖上初晴后雨", author: "苏轼", dynasty: "宋", type: "七言绝句", content: ["水光潋滟晴方好，山色空蒙雨亦奇。", "欲把西湖比西子，淡妆浓抹总相宜。"] },
      { title: "惠崇春江晚景", author: "苏轼", dynasty: "宋", type: "七言绝句", content: ["竹外桃花三两枝，春江水暖鸭先知。", "蒌蒿满地芦芽短，正是河豚欲上时。"] },
      { title: "六月二十七日望湖楼醉书", author: "苏轼", dynasty: "宋", type: "七言绝句", content: ["黑云翻墨未遮山，白雨跳珠乱入船。", "卷地风来忽吹散，望湖楼下水如天。"] },
      { title: "元日", author: "王安石", dynasty: "宋", type: "七言绝句", content: ["爆竹声中一岁除，春风送暖入屠苏。", "千门万户曈曈日，总把新桃换旧符。"] },
      { title: "泊船瓜洲", author: "王安石", dynasty: "宋", type: "七言绝句", content: ["京口瓜洲一水间，钟山只隔数重山。", "春风又绿江南岸，明月何时照我还。"] },
      { title: "示儿", author: "陆游", dynasty: "宋", type: "七言绝句", content: ["死去元知万事空，但悲不见九州同。", "王师北定中原日，家祭无忘告乃翁。"] },
      { title: "游山西村", author: "陆游", dynasty: "宋", type: "七言律诗", content: ["莫笑农家腊酒浑，丰年留客足鸡豚。", "山重水复疑无路，柳暗花明又一村。", "箫鼓追随春社近，衣冠简朴古风存。", "从今若许闲乘月，拄杖无时夜叩门。"] },
      { title: "小池", author: "杨万里", dynasty: "宋", type: "七言绝句", content: ["泉眼无声惜细流，树阴照水爱晴柔。", "小荷才露尖尖角，早有蜻蜓立上头。"] },
      { title: "晓出净慈寺送林子方", author: "杨万里", dynasty: "宋", type: "七言绝句", content: ["毕竟西湖六月中，风光不与四时同。", "接天莲叶无穷碧，映日荷花别样红。"] },
      { title: "春日", author: "朱熹", dynasty: "宋", type: "七言绝句", content: ["胜日寻芳泗水滨，无边光景一时新。", "等闲识得东风面，万紫千红总是春。"] },
      { title: "观书有感", author: "朱熹", dynasty: "宋", type: "七言绝句", content: ["半亩方塘一鉴开，天光云影共徘徊。", "问渠那得清如许？为有源头活水来。"] },
      { title: "题临安邸", author: "林升", dynasty: "宋", type: "七言绝句", content: ["山外青山楼外楼，西湖歌舞几时休。", "暖风熏得游人醉，直把杭州作汴州。"] },
      { title: "过零丁洋", author: "文天祥", dynasty: "宋", type: "七言律诗", content: ["辛苦遭逢起一经，干戈寥落四周星。", "山河破碎风飘絮，身世浮沉雨打萍。", "惶恐滩头说惶恐，零丁洋里叹零丁。", "人生自古谁无死？留取丹心照汗青。"] },
      { title: "绝句", author: "志南", dynasty: "宋", type: "七言绝句", content: ["古木阴中系短篷，杖藜扶我过桥东。", "沾衣欲湿杏花雨，吹面不寒杨柳风。"] },
      { title: "游园不值", author: "叶绍翁", dynasty: "宋", type: "七言绝句", content: ["应怜屐齿印苍苔，小扣柴扉久不开。", "春色满园关不住，一枝红杏出墙来。"] },
      { title: "夜书所见", author: "叶绍翁", dynasty: "宋", type: "七言绝句", content: ["萧萧梧叶送寒声，江上秋风动客情。", "知有儿童挑促织，夜深篱落一灯明。"] },
      { title: "竹石", author: "郑燮", dynasty: "清", type: "七言绝句", content: ["咬定青山不放松，立根原在破岩中。", "千磨万击还坚劲，任尔东西南北风。"] },
      { title: "己亥杂诗", author: "龚自珍", dynasty: "清", type: "七言绝句", content: ["九州生气恃风雷，万马齐喑究可哀。", "我劝天公重抖擞，不拘一格降人才。"] },
      { title: "村居", author: "高鼎", dynasty: "清", type: "七言绝句", content: ["草长莺飞二月天，拂堤杨柳醉春烟。", "儿童散学归来早，忙趁东风放纸鸢。"] },
      // —— 宋词 / 元曲 / 诗经 ——
      { title: "水调歌头·明月几时有", author: "苏轼", dynasty: "宋", type: "宋词", content: ["明月几时有？把酒问青天。", "不知天上宫阙，今夕是何年。", "我欲乘风归去，又恐琼楼玉宇，高处不胜寒。", "起舞弄清影，何似在人间。"] },
      { title: "念奴娇·赤壁怀古", author: "苏轼", dynasty: "宋", type: "宋词", content: ["大江东去，浪淘尽，千古风流人物。", "故垒西边，人道是，三国周郎赤壁。", "乱石穿空，惊涛拍岸，卷起千堆雪。", "江山如画，一时多少豪杰。"] },
      { title: "江城子·密州出猎", author: "苏轼", dynasty: "宋", type: "宋词", content: ["老夫聊发少年狂，左牵黄，右擎苍，锦帽貂裘，千骑卷平冈。", "为报倾城随太守，亲射虎，看孙郎。", "酒酣胸胆尚开张。鬓微霜，又何妨！", "持节云中，何日遣冯唐？会挽雕弓如满月，西北望，射天狼。"] },
      { title: "如梦令·常记溪亭日暮", author: "李清照", dynasty: "宋", type: "宋词", content: ["常记溪亭日暮，沉醉不知归路。", "兴尽晚回舟，误入藕花深处。", "争渡，争渡，惊起一滩鸥鹭。"] },
      { title: "声声慢", author: "李清照", dynasty: "宋", type: "宋词", content: ["寻寻觅觅，冷冷清清，凄凄惨惨戚戚。", "乍暖还寒时候，最难将息。", "三杯两盏淡酒，怎敌他、晚来风急？", "雁过也，正伤心，却是旧时相识。"] },
      { title: "虞美人", author: "李煜", dynasty: "五代", type: "五代词", content: ["春花秋月何时了？往事知多少。", "小楼昨夜又东风，故国不堪回首月明中。", "雕栏玉砌应犹在，只是朱颜改。", "问君能有几多愁？恰似一江春水向东流。"] },
      { title: "相见欢", author: "李煜", dynasty: "五代", type: "五代词", content: ["无言独上西楼，月如钩。寂寞梧桐深院锁清秋。", "剪不断，理还乱，是离愁。别是一般滋味在心头。"] },
      { title: "浣溪沙", author: "晏殊", dynasty: "宋", type: "宋词", content: ["一曲新词酒一杯，去年天气旧亭台。夕阳西下几时回？", "无可奈何花落去，似曾相识燕归来。小园香径独徘徊。"] },
      { title: "卜算子·咏梅", author: "陆游", dynasty: "宋", type: "宋词", content: ["驿外断桥边，寂寞开无主。已是黄昏独自愁，更著风和雨。", "无意苦争春，一任群芳妒。零落成泥碾作尘，只有香如故。"] },
      { title: "破阵子·为陈同甫赋壮词以寄之", author: "辛弃疾", dynasty: "宋", type: "宋词", content: ["醉里挑灯看剑，梦回吹角连营。八百里分麾下炙，五十弦翻塞外声，沙场秋点兵。", "马作的卢飞快，弓如霹雳弦惊。了却君王天下事，赢得生前身后名。可怜白发生！"] },
      { title: "青玉案·元夕", author: "辛弃疾", dynasty: "宋", type: "宋词", content: ["东风夜放花千树，更吹落、星如雨。宝马雕车香满路。凤箫声动，玉壶光转，一夜鱼龙舞。", "蛾儿雪柳黄金缕，笑语盈盈暗香去。众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。"] },
      { title: "蝶恋花", author: "欧阳修", dynasty: "宋", type: "宋词", content: ["庭院深深深几许，杨柳堆烟，帘幕无重数。玉勒雕鞍游冶处，楼高不见章台路。", "雨横风狂三月暮，门掩黄昏，无计留春住。泪眼问花花不语，乱红飞过秋千去。"] },
      { title: "天净沙·秋思", author: "马致远", dynasty: "元", type: "元曲", content: ["枯藤老树昏鸦，小桥流水人家，古道西风瘦马。", "夕阳西下，断肠人在天涯。"] },
      { title: "山坡羊·潼关怀古", author: "张养浩", dynasty: "元", type: "元曲", content: ["峰峦如聚，波涛如怒，山河表里潼关路。望西都，意踌躇。", "伤心秦汉经行处，宫阙万间都做了土。兴，百姓苦；亡，百姓苦。"] },
      { title: "关雎", author: "佚名", dynasty: "先秦", type: "诗经", content: ["关关雎鸠，在河之洲。", "窈窕淑女，君子好逑。", "参差荇菜，左右流之。", "窈窕淑女，寤寐求之。"] },
      { title: "蒹葭", author: "佚名", dynasty: "先秦", type: "诗经", content: ["蒹葭苍苍，白露为霜。", "所谓伊人，在水一方。", "溯洄从之，道阻且长。", "溯游从之，宛在水中央。"] },
    ];

    /** Minimal offline metadata (used when the API is unreachable). */
    var OFFLINE_DYNASTIES = ["先秦", "两汉", "魏晋", "南北朝", "隋", "唐", "五代", "宋", "元", "明", "清"].map(function (n, i) {
      return { id: i + 1, name: n };
    });
    var OFFLINE_TYPES = ["唐诗", "宋词", "元曲", "诗经", "楚辞", "乐府诗", "五言绝句", "七言绝句", "五言律诗", "七言律诗", "五言古诗", "七言古诗", "四言诗", "杂言诗", "词", "曲", "其他"].map(function (n, i) {
      return { id: 10 + i, name: n };
    });

    /**
     * Client-side data layer over the free public poetry API.
     * All dependencies are injectable for tests: fetchImpl, storage, now,
     * waitImpl. Requests are serialized (concurrency 1) through an internal
     * promise chain; a sliding window enforces rate limits below the API's
     * (search 6/min vs server 8/min, general 15/min vs server 20/min); 429s
     * back off exponentially using Retry-After; three consecutive 429s flip
     * the layer into cache-only mode where search/random serve the offline
     * table instead of the network.
     */
    function PoetryDataLayer(opts) {
      opts = opts || {};
      this.baseUrl = String(opts.baseUrl || "https://poetry.palemoky.com").replace(/\/+$/, "");
      this.fetchImpl = typeof opts.fetchImpl === "function"
        ? opts.fetchImpl
        : (typeof fetch === "function" ? fetch.bind(globalThis) : null);
      this.storage = opts.storage !== undefined ? opts.storage : null; // localStorage-like or null
      this.now = typeof opts.now === "function" ? opts.now : function () { return Date.now(); };
      this.waitImpl = typeof opts.waitImpl === "function" ? opts.waitImpl : function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

      this.searchRate = opts.searchRate !== undefined ? opts.searchRate : 6;      // searches per window
      this.generalRate = opts.generalRate !== undefined ? opts.generalRate : 15;  // general calls per window
      this.windowMs = opts.windowMs !== undefined ? opts.windowMs : 60000;
      this.maxBackoffMs = opts.maxBackoffMs !== undefined ? opts.maxBackoffMs : 60000;
      this.maxAttempts = opts.maxAttempts !== undefined ? opts.maxAttempts : 3;

      this.searchTimes = [];
      this.generalTimes = [];
      this.memCache = Object.create(null);
      this.consecutive429 = 0;
      this.backoffMs = 0;
      this.cacheOnly = false;
      this.chain = Promise.resolve();
      this._logEnabled = !!opts.log;
    }

    PoetryDataLayer.prototype._log = function (msg) {
      if (this._logEnabled) {
        try { console.log("[dsh-chinese-poetry] " + msg); } catch (err) { /* ignore */ }
      }
    };

    /* -------- storage helpers (mem first, then localStorage) -------- */

    PoetryDataLayer.prototype._storageGet = function (key) {
      if (!this.storage) return null;
      try { return this.storage.getItem(key); } catch (err) { return null; }
    };
    PoetryDataLayer.prototype._storageSet = function (key, value) {
      if (!this.storage) return;
      try { this.storage.setItem(key, value); } catch (err) { /* quota exceeded: keep mem-only */ }
    };

    PoetryDataLayer.prototype._cacheGet = function (key) {
      var mem = this.memCache[key];
      var nowMs = this.now();
      if (mem && mem.expires > nowMs) return mem.value;
      if (mem) delete this.memCache[key];
      var raw = this._storageGet("cp.cache." + key);
      if (raw) {
        try {
          var entry = JSON.parse(raw);
          if (entry && entry.expires > nowMs && "value" in entry) {
            this.memCache[key] = entry;
            return entry.value;
          }
        } catch (err) { /* corrupt entry: ignore */ }
      }
      return undefined;
    };

    PoetryDataLayer.prototype._cacheSet = function (key, value, ttlMs) {
      var entry = { expires: this.now() + (ttlMs || 0), value: value };
      this.memCache[key] = entry;
      this._storageSet("cp.cache." + key, JSON.stringify(entry));
    };

    /* -------- rate limiting (sliding window) -------- */

    /**
     * Returns how many ms the caller must wait before the next call of this
     * kind may proceed (0 = proceed now), and records the call slot.
     */
    PoetryDataLayer.prototype._take = function (kind) {
      var nowMs = this.now();
      var windowStart = nowMs - this.windowMs;
      var times = kind === "search" ? this.searchTimes : this.generalTimes;
      var rate = kind === "search" ? this.searchRate : this.generalRate;
      while (times.length > 0 && times[0] <= windowStart) times.shift();
      if (times.length >= rate) {
        var wait = times[0] + this.windowMs - nowMs;
        if (wait <= 0) wait = 0;
        return wait;
      }
      times.push(nowMs);
      return 0;
    };

    /* -------- serial queue + network -------- */

    PoetryDataLayer.prototype._enqueue = function (fn) {
      var self = this;
      var run = self.chain.then(fn, fn);
      // keep the chain alive even when a request rejects
      self.chain = run.then(function () {}, function () {});
      return run;
    };

    PoetryDataLayer.prototype._request = function (path, kind, attemptsLeft) {
      var self = this;
      attemptsLeft = attemptsLeft === undefined ? this.maxAttempts : attemptsLeft;
      return this._enqueue(function () { return self._doRequest(path, kind, attemptsLeft); });
    };

    PoetryDataLayer.prototype._doRequest = async function (path, kind, attemptsLeft) {
      var wait = this._take(kind);
      if (wait > 0) {
        this._log("rate-limited (" + kind + "): waiting " + wait + "ms");
        await this.waitImpl(wait);
      }
      if (this.backoffMs > 0) {
        this._log("backing off " + this.backoffMs + "ms after 429s");
        await this.waitImpl(this.backoffMs);
      }
      if (!this.fetchImpl) {
        throw new Error("fetch unavailable");
      }
      var res = await this.fetchImpl(this.baseUrl + path, { headers: { accept: "application/json" } });
      if (res.status === 429) {
        this.consecutive429++;
        var retryAfter = 0;
        try {
          var ra = res.headers && res.headers.get && res.headers.get("retry-after");
          if (ra) retryAfter = parseInt(String(ra), 10) || 0;
        } catch (err) { /* header read failed */ }
        this.backoffMs = Math.min(Math.max(this.backoffMs * 2, retryAfter * 1000), this.maxBackoffMs);
        if (this.consecutive429 >= 3) {
          this.cacheOnly = true;
          this._log("entered cache-only mode after " + this.consecutive429 + " 429s");
        }
        if (attemptsLeft > 0) {
          this._log("429 (#" + this.consecutive429 + "), retrying after " + this.backoffMs + "ms");
          await this.waitImpl(this.backoffMs);
          return this._doRequest(path, kind, attemptsLeft - 1);
        }
        var err429 = new Error("rate limited (429)");
        err429.status = 429;
        throw err429;
      }
      if (!res.ok) {
        var errHttp = new Error("HTTP " + res.status);
        errHttp.status = res.status;
        throw errHttp;
      }
      this.consecutive429 = 0;
      this.backoffMs = 0;
      var text = await res.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error("invalid JSON response");
      }
    };

    /* -------- cached GET helper -------- */

    PoetryDataLayer.prototype._getCached = function (path, cacheKey, ttlMs, kind) {
      var self = this;
      if (cacheKey) {
        var hit = this._cacheGet(cacheKey);
        if (hit !== undefined) {
          this._log("cache hit: " + cacheKey);
          return Promise.resolve(hit);
        }
      }
      return this._request(path, kind || "general").then(function (json) {
        if (cacheKey) self._cacheSet(cacheKey, json, ttlMs);
        return json;
      });
    };

    /* -------- public API -------- */

    /** Statistics { poems, authors, dynasties, types } (cached 1 day). */
    PoetryDataLayer.prototype.stats = function () {
      return this._getCached("/api/stats", "stats", 24 * 3600 * 1000, "general");
    };

    /** Dynasty list (cached 7 days; offline table on failure). */
    PoetryDataLayer.prototype.dynasties = function () {
      var self = this;
      return this._getCached("/api/dynasties", "dynasties", 7 * 24 * 3600 * 1000, "general")
        .then(function (json) { return json.data || []; })
        .catch(function () { return OFFLINE_DYNASTIES; });
    };

    /** Genre list (cached 7 days; offline table on failure). */
    PoetryDataLayer.prototype.types = function () {
      var self = this;
      return this._getCached("/api/types", "types", 7 * 24 * 3600 * 1000, "general")
        .then(function (json) { return json.data || []; })
        .catch(function () { return OFFLINE_TYPES; });
    };

    /** Authors page (cached 7 days). */
    PoetryDataLayer.prototype.authors = function (page, pageSize) {
      page = page || 1;
      pageSize = pageSize || 100;
      return this._getCached("/api/authors?page=" + page + "&page_size=" + pageSize, "authors:" + page, 7 * 24 * 3600 * 1000, "general")
        .then(function (json) { return json.data || []; })
        .catch(function () { return []; });
    };

    /** Offline substring search over the fallback table. */
    PoetryDataLayer.prototype._offlineSearch = function (q) {
      var needle = String(q || "").trim();
      var out = [];
      for (var i = 0; i < OFFLINE_POEMS.length; i++) {
        var p = OFFLINE_POEMS[i];
        var hay = (p.title || "") + (p.author || "") + (p.content || []).join("");
        if (hay.indexOf(needle) >= 0) out.push(p);
      }
      return out;
    };

    /**
     * Full-text search. q must be >= 2 characters (the API rejects single
     * characters with 400). Results cached 24h. Falls back to the offline
     * table when the network fails or cache-only mode is active, or when the
     * query is 2 characters (the public API rejects those with 400 — its
     * full-text index requires >= 3 chars). Two-char results carry
     * note: "short-offline" so the UI can explain the limited scope.
     * Resolves to { items, from: "api" | "offline", total?, note? }.
     */
    PoetryDataLayer.prototype.search = function (q, opts) {
      opts = opts || {};
      var query = String(q || "").trim();
      if (query.length < 2) {
        return Promise.reject(new Error("搜索词至少需要 2 个字符"));
      }
      var self = this;
      var lang = opts.lang || "zh-Hans";
      var page = opts.page || 1;
      var pageSize = opts.pageSize || 20;
      var shortQuery = query.length === 2;
      if (this.cacheOnly || !this.fetchImpl) {
        var off = this._offlineSearch(query);
        return Promise.resolve({
          items: off,
          from: "offline",
          total: off.length,
          note: shortQuery ? "short-offline" : undefined,
        });
      }
      var path = "/api/search?q=" + encodeURIComponent(query) + "&page=" + page + "&pageSize=" + pageSize + "&lang=" + encodeURIComponent(lang);
      var cacheKey = "search:" + query + ":" + lang + ":" + page + ":" + pageSize;
      return this._getCached(path, cacheKey, 24 * 3600 * 1000, "search")
        .then(function (json) {
          return { items: json.data || [], from: "api", total: json.pagination ? json.pagination.totalCount : undefined };
        })
        .catch(function () {
          var offItems = self._offlineSearch(query);
          return {
            items: offItems,
            from: "offline",
            total: offItems.length,
            note: shortQuery ? "short-offline" : undefined,
          };
        });
    };

    /** Random poem, optionally filtered by author/dynasty/type/char. Never cached. */
    PoetryDataLayer.prototype.random = function (filters) {
      filters = filters || {};
      var self = this;
      var parts = [];
      if (filters.author) parts.push("author=" + encodeURIComponent(filters.author));
      if (filters.dynasty) parts.push("dynasty=" + encodeURIComponent(filters.dynasty));
      if (filters.type) parts.push("type=" + encodeURIComponent(filters.type));
      if (filters.char) parts.push("char=" + encodeURIComponent(filters.char));
      if (filters.lang) parts.push("lang=" + encodeURIComponent(filters.lang));
      var path = "/api/poems/random" + (parts.length ? "?" + parts.join("&") : "");
      return this._request(path, "general").then(function (json) {
        return json.data || null;
      }).catch(function () {
        if (filters.char && filters.char.length === 1) {
          // fallback: first offline poem containing the character
          var ch = filters.char;
          for (var i = 0; i < OFFLINE_POEMS.length; i++) {
            if ((OFLINE_POEMS[i].content || []).join("").indexOf(ch) >= 0) return OFFLINE_POEMS[i];
          }
        }
        if (!filters.author && !filters.dynasty && !filters.type && !filters.char) {
          return OFFLINE_POEMS[Math.floor(Math.random() * OFFLINE_POEMS.length)];
        }
        return null;
      });
    };

    /** Daily poem: deterministic per calendar day + lang (first result cached for the day). */
    PoetryDataLayer.prototype.daily = function (lang) {
      lang = lang || "zh-Hans";
      var d = new Date(this.now());
      var ymd = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var key = "daily:" + ymd + ":" + lang;
      var self = this;
      return this._getCached("/api/poems/random?lang=" + encodeURIComponent(lang), key, 36 * 3600 * 1000, "general")
        .then(function (json) { return json.data || null; })
        .catch(function () {
          return OFFLINE_POEMS[Math.floor(Math.random() * OFFLINE_POEMS.length)];
        });
    };

    /** Current layer status for the UI (degradation banner etc.). */
    PoetryDataLayer.prototype.status = function () {
      return {
        cacheOnly: this.cacheOnly,
        consecutive429: this.consecutive429,
        backoffMs: this.backoffMs,
        searchRate: this.searchRate,
        generalRate: this.generalRate,
      };
    };

    exports.PoetryDataLayer = PoetryDataLayer;
    exports.OFFLINE_POEMS = OFFLINE_POEMS;
    exports.DYNASTY_FIX = DYNASTY_FIX;
    exports.fixPoemDynasty = fixPoemDynasty;

    /* ============================ view ============================ */

    var zh = {
      view: "诗词",
      searchPlaceholder: "搜索诗句（3 字以上搜全库；2 字仅本地精选）",
      search: "搜索",
      random: "随机一首",
      daily: "每日一首",
      results: "结果",
      fromApi: "在线",
      fromOffline: "离线表",
      fromLocal: "本地精选",
      degraded: "公共 API 暂时不可用，已切换离线数据（有限曲目）",
      shortOfflineNote: "2 字查询：公共 API 仅支持 3 字以上搜索，以下为本地精选（70 首）中的匹配，无法搜全库。",
      empty: "输入至少 2 个字开始搜索",
      noResults: "没有找到匹配的诗句",
      noResultsShort: "本地精选中没有匹配。试试 3 字以上的关键词，可搜索 37 万首全库。",
      error: "出错",
      loading: "加载中…",
      preview: "预览",
      details: "展开全文",
      collapse: "收起",
      title: "标题",
      author: "作者",
      dynasty: "朝代",
      type: "体裁",
      stats: "诗库统计",
      copy: "复制",
      copyMd: "MD",
      copied: "已复制",
      corrected: "已校正",
      filterDynasty: "朝代",
      filterType: "体裁",
      filterAuthor: "作者",
      filterGo: "筛一首",
      reset: "重置",
      all: "全部",
      toHant: "繁體",
      toHans: "简体",
      commonAuthors: "常用：",
      filterActive: "条件：",
      feihua: "飞花令",
      feihuaPlaceholder: "如：春",
      feihuaGo: "飞花",
      feihuaNeedOne: "先输入 1 个字，再点飞花（如：春）",
      favs: "收藏",
      favAdd: "☆ 收藏",
      favAdded: "★ 已收藏",
      favEmpty: "还没有收藏，点击诗词详情的「☆ 收藏」添加",
      favClear: "清空",
      historyLabel: "最近：",
      historyEmpty: "暂无记录（在搜索框输入关键词后出现在这里）",
      historyClear: "清空",
      aiExplain: "AI 解读",
      aiPrompt: "请赏析这首古诗：",
      aiFilled: "提示词已写入输入框，按回车发送给会话",
      aiNoInput: "输入框暂不可用",
      apiCreditPre: "数据接口来自开源项目 ",
      apiCreditLink: "palemoky/chinese-poetry-api",
      apiCreditTail: "（感谢原作者）。若查询较慢，多为该服务端接口响应慢所致，可前往该项目反馈。",
      festival: "节日",
      festivalEmpty: "点击上方一个节日，查看应景诗词（免 token）",
      festivalPoem: "代表作",
      festivalRandom: "随机相关",
      festivalAi: "AI 应景",
      aiFestivalPrompt: "请以“%s”为主题，作一首应景的古典诗词，并赏析一下：",
      cardShare: "卡片图",
      cardCopied: "卡片图已生成",
      cardNoCanvas: "当前环境不支持生成图片",
      version: "v" + PLUGIN_VERSION,
    };

    var en = {
      view: "Poetry",
      searchPlaceholder: "Search poems (3+ chars = full library; 2 chars = local picks)",
      search: "Search",
      random: "Random",
      daily: "Daily poem",
      results: "Results",
      fromApi: "online",
      fromOffline: "offline",
      fromLocal: "local picks",
      degraded: "Public API unreachable — serving from the offline table (limited corpus)",
      shortOfflineNote: "2-char query: the public API only searches 3+ chars; showing matches from the local picks (~70 poems), not the full library.",
      empty: "Type at least 2 characters to search",
      noResults: "No matching poems",
      noResultsShort: "No match in the local picks. Try a 3+ char keyword to search the 370k-poem library.",
      error: "Error",
      loading: "Loading…",
      preview: "Preview",
      details: "Expand",
      collapse: "Collapse",
      title: "Title",
      author: "Author",
      dynasty: "Dynasty",
      type: "Genre",
      stats: "Stats",
      copy: "Copy",
      copyMd: "MD",
      copied: "Copied",
      corrected: "corrected",
      filterDynasty: "Dynasty",
      filterType: "Genre",
      filterAuthor: "Author",
      filterGo: "Filter & random",
      reset: "Reset",
      all: "All",
      toHant: "繁體",
      toHans: "简体",
      commonAuthors: "Popular:",
      filterActive: "Filters:",
      feihua: "Feihua",
      feihuaPlaceholder: "e.g. 春",
      feihuaGo: "Go",
      feihuaNeedOne: "Type one character first, then Feihua (e.g. 春)",
      favs: "Favs",
      favAdd: "☆ Fav",
      favAdded: "★ Fav'd",
      favEmpty: "No favorites yet — open a poem and press ☆ Fav",
      favClear: "Clear",
      historyLabel: "Recent:",
      historyEmpty: "No recent searches yet — search above to populate this",
      historyClear: "Clear",
      aiExplain: "AI Explain",
      aiPrompt: "Please appreciate this classical Chinese poem:",
      aiFilled: "Prompt written to the composer — press Enter to send",
      aiNoInput: "Composer unavailable",
      apiCreditPre: "Data API from the open-source project ",
      apiCreditLink: "palemoky/chinese-poetry-api",
      apiCreditTail: " (thanks to the author). Slow queries are usually the upstream service — please report them there.",
      festival: "Festivals",
      festivalEmpty: "Pick a festival above to see themed poems (token-free)",
      festivalPoem: "Featured",
      festivalRandom: "Random related",
      festivalAi: "AI verse",
      aiFestivalPrompt: "Write a classical Chinese poem for the festival “%s” and brief appreciation:",
      cardShare: "Card",
      cardCopied: "Card image generated",
      cardNoCanvas: "Card image not supported in this environment",
      version: "v" + PLUGIN_VERSION,
    };

    var CSS = `
.cp-root { padding: 14px 18px; color: var(--dsw-alias-label-primary); }
.cp-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cp-search { flex: 1; min-width: 220px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.cp-search:focus { border-color: var(--dsw-alias-brand-primary); outline: none; }
.cp-btn { background: transparent; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.cp-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.cp-btn:disabled { opacity: 0.5; cursor: default; }
.cp-btn.primary { background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary)); color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-layer-3)); border: none; }
.cp-status { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.cp-status.warn { color: var(--dsw-alias-state-warn-primary); }
.cp-note { margin-top: 8px; padding: 7px 12px; border-radius: 6px; font-size: 12px; line-height: 1.6; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-state-warn-primary); }
.cp-list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.cp-row { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.cp-row-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; }
.cp-row-head:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.cp-row-title { font-size: 14px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-row-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); display: flex; gap: 8px; flex: none; }
.cp-corrected { font-size: 11px; color: var(--dsw-alias-state-warn-primary); border: 1px solid var(--dsw-alias-state-warn-secondary); border-radius: 3px; padding: 0 4px; line-height: 1.5; }
.cp-credit { font-size: 11px; color: var(--dsw-alias-label-tertiary); line-height: 1.6; margin: 0; }
.cp-footer { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.cp-footer .cp-version { margin-top: 0; }
.cp-credit-link { color: var(--dsw-alias-state-info-primary); text-decoration: none; }
.cp-credit-link:hover { text-decoration: underline; }
.cp-row-preview { font-size: 12px; color: var(--dsw-alias-label-tertiary); flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-row-body { padding: 4px 12px 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
.cp-lines { font-size: 14px; line-height: 1.9; margin: 8px 0; }
.cp-actions { display: flex; gap: 8px; }
.cp-msg { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 13px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.cp-msg.error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-secondary); }
.cp-bar2 { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.cp-select { background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 8px; font-size: 12px; max-width: 140px; }
.cp-select:focus { border-color: var(--dsw-alias-brand-primary); outline: none; }
.cp-author-input { background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 8px; font-size: 12px; width: 110px; }
.cp-author-input:focus { border-color: var(--dsw-alias-brand-primary); outline: none; }
.cp-chips { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.cp-chip { background: transparent; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.cp-chip:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); color: var(--dsw-alias-label-primary); }
.cp-lang-btn { flex: none; }
.cp-feihua { background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 8px; font-size: 12px; width: 64px; }
.cp-feihua:focus { border-color: var(--dsw-alias-brand-primary); outline: none; }
.cp-feihua-group { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 3px 6px; }
.cp-feihua-label { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.cp-feihua-group .cp-feihua, .cp-feihua-group .cp-btn { border: none; background: transparent; }
.cp-feihua-group .cp-btn { padding: 5px 8px; font-size: 12px; }
.cp-history { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.cp-history-empty { font-style: italic; }
.cp-ai-note { margin-top: 8px; padding: 7px 12px; border-radius: 6px; font-size: 12px; background: var(--dsw-alias-state-success-tertiary, var(--dsw-alias-bg-layer-1)); border: 1px solid var(--dsw-alias-state-success-secondary, var(--dsw-alias-border-l1)); color: var(--dsw-alias-state-success-primary, var(--dsw-alias-label-secondary)); }
.cp-favbar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.cp-festival-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; margin-top: 10px; }
.cp-festival-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); padding: 14px 10px; text-align: center; cursor: pointer; }
.cp-festival-card:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.cp-festival-card.active { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.cp-festival-name { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.cp-festival-char { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
.cp-festival-actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.cp-share-line { display: inline-flex; gap: 8px; align-items: center; }
.cp-version { margin-top: 12px; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-family: var(--dsw-font-mono, monospace); }
`;

    function el(type, props) {
      var rest = Array.prototype.slice.call(arguments, 2);
      return React.createElement.apply(React, [type, props].concat(rest));
    }

    function previewOf(poem) {
      var c = poem && poem.content;
      if (!c) return "";
      var first = Array.isArray(c) ? c[0] : String(c);
      return first.length > 28 ? first.slice(0, 28) + "…" : first;
    }

    /* -------- lang preference (per-browser) -------- */

    var LANG_KEY = "dsh.chinesePoetry.lang";

    function loadLang() {
      try {
        var v = localStorage.getItem(LANG_KEY);
        if (v === "zh-Hant" || v === "zh-Hans") return v;
      } catch (err) { /* ignore */ }
      return "zh-Hans";
    }
    function saveLang(v) {
      try { localStorage.setItem(LANG_KEY, v); } catch (err) { /* ignore */ }
    }

    /** Popular poets for one-tap author chips. */
    var COMMON_AUTHORS = ["李白", "杜甫", "白居易", "王维", "苏轼", "辛弃疾", "李清照", "陆游", "杜牧", "李商隐", "孟浩然", "柳永"];

    /* -------- dynasty correction table -------- */

    /**
     * The public API mislabels some dynasties (the宋代 poets 毕仲游 / 曾丰 /
     * 张侃 all came back as 唐 in practice). This lookup maps well-known
     * poets to their correct dynasty so the view can surface the truth and
     * flag a correction. Only unambiguous, widely-known attributions are
     * listed so the table never introduces a new error.
     */
    var DYNASTY_FIX = {
      // 唐 (correct some that the API may drift on)
      "李白": "唐", "杜甫": "唐", "白居易": "唐", "王维": "唐", "孟浩然": "唐",
      "杜牧": "唐", "李商隐": "唐", "刘禹锡": "唐", "柳宗元": "唐", "韩愈": "唐",
      "王之涣": "唐", "王昌龄": "唐", "贾岛": "唐", "李贺": "唐", "温庭筠": "唐",
      // 宋 (the API systematically mislabels these as 唐)
      "苏轼": "宋", "辛弃疾": "宋", "李清照": "宋", "陆游": "宋", "王安石": "宋",
      "欧阳修": "宋", "柳永": "宋", "晏殊": "宋", "晏几道": "宋", "秦观": "宋",
      "周邦彦": "宋", "贺铸": "宋", "黄庭坚": "宋", "杨万里": "宋", "范成大": "宋",
      "朱熹": "宋", "文天祥": "宋", "岳飞": "宋", "曾丰": "宋", "毕仲游": "宋",
      "张侃": "宋", "陈与义": "宋", "林升": "宋", "叶绍翁": "宋", "张孝祥": "宋",
      "吴文英": "宋", "蒋捷": "宋", "张炎": "宋", "范仲淹": "宋", "司马光": "宋",
      "苏辙": "宋", "苏洵": "宋", "曾巩": "宋", "王禹偁": "宋", "赵师秀": "宋",
      "徐俯": "宋", "翁卷": "宋", "卢梅坡": "宋",
      // 元
      "马致远": "元", "张养浩": "元", "白朴": "元", "关汉卿": "元", "王实甫": "元",
      "张可久": "元",
      // 明
      "杨慎": "明", "于谦": "明", "唐寅": "明", "王守仁": "明", "李东阳": "明",
      // 清
      "纳兰性德": "清", "曹雪芹": "清", "龚自珍": "清", "袁枚": "清", "郑燮": "清",
      "纪昀": "清",
    };

    /**
     * Resolve a poem's displayed dynasty, correcting a known mislabel.
     * @param poem - a poem object with optional author/dynasty (object or string).
     * @returns {{ name: string, corrected: boolean, from: string }} the dynasty
     *   to show, whether the API's value was corrected, and the raw source value.
     */
    function fixPoemDynasty(poem) {
      var authorName = poem.author && poem.author.name ? poem.author.name : (poem.author || "");
      var rawName = poem.dynasty && poem.dynasty.name ? poem.dynasty.name : (poem.dynasty || "");
      rawName = String(rawName || "").trim();
      var correct = DYNASTY_FIX[authorName];
      if (correct && rawName && rawName !== correct) {
        return { name: correct, corrected: true, from: rawName };
      }
      return { name: rawName, corrected: false, from: rawName };
    }

    /* -------- festival topics -------- */

    var FESTIVALS = [
      { id: "spring", name: "春节", char: "春", poem: { title: "元日", author: { name: "王安石" }, dynasty: { name: "宋" }, type: { name: "七言绝句" }, content: ["爆竹声中一岁除，春风送暖入屠苏。", "千门万户曈曈日，总把新桃换旧符。"] } },
      { id: "lantern", name: "元宵", char: "灯", poem: { title: "生查子·元夕", author: { name: "欧阳修" }, dynasty: { name: "宋" }, type: { name: "词" }, content: ["去年元夜时，花市灯如昼；", "月上柳梢头，人约黄昏后。", "今年元夜时，月与灯依旧；", "不见去年人，泪湿春衫袖。"] } },
      { id: "qingming", name: "清明", char: "清", poem: { title: "清明", author: { name: "杜牧" }, dynasty: { name: "唐" }, type: { name: "七言绝句" }, content: ["清明时节雨纷纷，路上行人欲断魂。", "借问酒家何处有？牧童遥指杏花村。"] } },
      { id: "duanwu", name: "端午", char: "端", poem: { title: "和端午", author: { name: "张耒" }, dynasty: { name: "宋" }, type: { name: "七言绝句" }, content: ["竞渡深悲千载冤，忠魂一去讵能还。", "国亡身殒今何有，只留离骚在世间。"] } },
      { id: "qixi", name: "七夕", char: "七", poem: { title: "秋夕", author: { name: "杜牧" }, dynasty: { name: "唐" }, type: { name: "七言绝句" }, content: ["银烛秋光冷画屏，轻罗小扇扑流萤。", "天阶夜色凉如水，卧看牵牛织女星。"] } },
      { id: "zhongqiu", name: "中秋", char: "秋", poem: { title: "阳关曲·中秋月", author: { name: "苏轼" }, dynasty: { name: "宋" }, type: { name: "词" }, content: ["暮云收尽溢清寒，银汉无声转玉盘。", "此生此夜不长好，明月明年何处看。"] } },
      { id: "chongyang", name: "重阳", char: "九", poem: { title: "九月九日忆山东兄弟", author: { name: "王维" }, dynasty: { name: "唐" }, type: { name: "七言绝句" }, content: ["独在异乡为异客，每逢佳节倍思亲。", "遥知兄弟登高处，遍插茱萸少一人。"] } },
    ];

    function festivalById(id) {
      for (var i = 0; i < FESTIVALS.length; i++) if (FESTIVALS[i].id === id) return FESTIVALS[i];
      return null;
    }

    /* -------- share-card image (canvas) -------- */

    /**
     * Draw one poem onto a canvas and return a PNG data URL (or null when the
     * environment has no canvas — the browser web UI does, the stub tests don't).
     */
    function shareCardDataUrl(poem) {
      if (typeof document === "undefined") return null;
      var cv = document.createElement("canvas");
      cv.width = 660; cv.height = 860; // provisional; height is recomputed below
      var g = cv.getContext("2d");
      if (!g) return null;
      try {
        var W = 660;
        var topPad = 40;
        var titleLineH = 60;
        var rowH = 50;
        var footPad = 96;
        var titleFont = "bold 46px 'Kaiti SC','KaiTi','STKaiti',serif";
        var bodyFont = "32px 'Kaiti SC','KaiTi','STKaiti',serif";

        // 1) Wrap the title and body first — the canvas height depends on the
        //    total line count, so measure before we size the canvas.
        g.font = titleFont;
        var titleLines = wrapLines(g, poem.title || "无题", 540, 3);
        g.font = bodyFont;
        var content = Array.isArray(poem.content) ? poem.content : [poem.content || ""];
        var allLines = [];
        var maxBodyLines = 80; // generous for long poems like 将进酒 / 琵琶行
        for (var pi = 0; pi < content.length && allLines.length < maxBodyLines; pi++) {
          allLines = allLines.concat(wrapLines(g, String(content[pi]), 540, maxBodyLines - allLines.length));
        }
        if (allLines.length > maxBodyLines) allLines = allLines.slice(0, maxBodyLines);

        // 2) Compute the layout geometry, then the canvas height.
        var titleH = topPad + titleLines.length * titleLineH;
        var authorY = titleH + 46;
        var dividerY = authorY + 36;
        var bodyTop = dividerY + 56;
        var H = bodyTop + allLines.length * rowH + footPad;
        if (H < 860) H = 860;

        // 3) Size the canvas (resizing resets the context state) and draw.
        cv.height = H;
        g.fillStyle = "#f7f2e6"; g.fillRect(0, 0, W, H);
        g.strokeStyle = "#c9b28a"; g.lineWidth = 3; g.strokeRect(22, 22, W - 44, H - 44);
        g.strokeStyle = "#e0d3ba"; g.lineWidth = 1; g.strokeRect(32, 32, W - 64, H - 64);
        g.textAlign = "center";
        g.textBaseline = "top";

        // title
        g.fillStyle = "#2b2620"; g.font = titleFont;
        for (var ti = 0; ti < titleLines.length; ti++) g.fillText(titleLines[ti], 330, topPad + ti * titleLineH);

        // author · dynasty
        var author = poem.author && poem.author.name ? poem.author.name : (poem.author || "");
        var dynasty = poem.dynasty && poem.dynasty.name ? poem.dynasty.name : (poem.dynasty || "");
        g.fillStyle = "#7a6a4f"; g.font = "24px 'Kaiti SC','KaiTi','STKaiti',serif";
        g.fillText((author || "") + (dynasty ? " · " + dynasty : ""), 330, authorY);

        // divider
        g.strokeStyle = "#c9b28a"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(120, dividerY); g.lineTo(540, dividerY); g.stroke();

        // body
        g.fillStyle = "#33302a"; g.font = bodyFont;
        for (var li = 0; li < allLines.length; li++) g.fillText(allLines[li], 330, bodyTop + li * rowH);

        // footer (drawn at the bottom of the (possibly tall) card)
        g.fillStyle = "#9a8a70"; g.font = "16px sans-serif";
        g.fillText("—— 诗词 · dsh-chinese-poetry ——", 330, H - 40);

        return cv.toDataURL("image/png");
      } catch (err) { return null; }
    }

    /** Pure line wrapper (no drawing): returns the wrapped lines. */
    function wrapLines(g, text, maxWidth, maxLines) {
      var lines = [];
      var cur = "";
      for (var i = 0; i < text.length; i++) {
        var test = cur + text[i];
        if (g.measureText(test).width > maxWidth && cur !== "") {
          lines.push(cur); cur = text[i];
          if (lines.length >= maxLines) break;
        } else cur = test;
      }
      if (cur && lines.length < maxLines) lines.push(cur);
      return lines;
    }

    /** Trigger a PNG download of the poem card. Returns false if unsupported. */
    function downloadPoemCard(poem) {
      var url = shareCardDataUrl(poem);
      if (!url) return false;
      if (typeof document === "undefined") return false;
      var a = document.createElement("a");
      a.href = url;
      a.download = (poem.title || "poem") + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }

    /* -------- favorites / history storage -------- */

    var FAVS_KEY = "dsh.chinesePoetry.favs";
    var HISTORY_KEY = "dsh.chinesePoetry.history";

    function readJSON(key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch (err) { /* ignore */ }
      return fallback;
    }
    function writeJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* ignore */ }
    }

    /** Copy text to the clipboard (navigator.clipboard with a textarea fallback). */
    function writeClipboard(text) {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve) {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        } catch (err) { /* ignore */ }
        resolve();
      });
    }

    /* -------- per-view memory: keeps the tab's content across view switches -------- */

    var VIEW_MEMORY = Object.create(null);

    /**
     * useState that survives unmount: the value lives in the module-level
     * VIEW_MEMORY (keyed by session + field) so switching between the 对话 /
     * 轨迹 / 诗词 tabs preserves the poetry tab's content. Restart clears it.
     */
    function useViewMemory(sessionKey, key, initial) {
      var fullKey = sessionKey + ":" + key;
      var [value, setValue] = React.useState(function () {
        if (fullKey in VIEW_MEMORY) return VIEW_MEMORY[fullKey];
        return typeof initial === "function" ? initial() : initial;
      });
      function set(v) {
        var next = typeof v === "function" ? v(VIEW_MEMORY[fullKey]) : v;
        VIEW_MEMORY[fullKey] = next;
        setValue(next);
      }
      return [value, set];
    }

    /**
     * Search view for the 'poetry' conversation-view tab.
     * Tool-style dense layout: search bar + filter row (dynasty / genre /
     * author chips → "filter & random" using the API's native random filters)
     * + status strip + result rows with inline expandable full text.
     * A global zh-Hans/zh-Hant switch re-runs the last action in the new lang.
     */
    function PoetryView(props) {
      var t = props.t;
      var layer = props.layer;
      var sessionKey = props.sessionId || "root";
      // Persistent across view switches (module-level VIEW_MEMORY).
      var [query, setQuery] = useViewMemory(sessionKey, "query", "");
      var [items, setItems] = useViewMemory(sessionKey, "items", null);
      var [source, setSource] = useViewMemory(sessionKey, "source", null);
      var [note, setNote] = useViewMemory(sessionKey, "note", null);
      var [message, setMessage] = useViewMemory(sessionKey, "message", null);
      var [expanded, setExpanded] = useViewMemory(sessionKey, "expanded", null);
      var [lang, setLang] = useViewMemory(sessionKey, "lang", loadLang);
      var [dynasty, setDynasty] = useViewMemory(sessionKey, "dynasty", "");
      var [type, setType] = useViewMemory(sessionKey, "type", "");
      var [author, setAuthor] = useViewMemory(sessionKey, "author", "");
      var [lastAction, setLastAction] = useViewMemory(sessionKey, "lastAction", null);
      var [viewMode, setViewMode] = useViewMemory(sessionKey, "viewMode", "search"); // 'search' | 'favs' | 'festival'
      var [feihuaChar, setFeihuaChar] = useViewMemory(sessionKey, "feihuaChar", "");
      var [festival, setFestival] = useViewMemory(sessionKey, "festival", null); // active festival id
      // Ephemeral per-mount state.
      var [loading, setLoading] = React.useState(false);
      var [copied, setCopied] = React.useState(null); // 'text' | 'md' | null
      var [dynasties, setDynasties] = React.useState([]);
      var [types, setTypes] = React.useState([]);
      var [statusTick, setStatusTick] = React.useState(0);
      var [favs, setFavs] = React.useState(function () { return readJSON(FAVS_KEY, []); });
      var [history, setHistory] = React.useState(function () { return readJSON(HISTORY_KEY, []); });
      var [aiFlash, setAiFlash] = React.useState(null);

      // Load filter metadata once (cached by the data layer, offline fallback).
      React.useEffect(function () {
        layer.dynasties().then(function (d) { setDynasties(d || []); }, function () {});
        layer.types().then(function (tp) { setTypes(tp || []); }, function () {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      function runSearch(q, langOverride) {
        var needle = (q === undefined ? query : q).trim();
        if (needle.length < 2) {
          setMessage({ kind: "error", text: t("empty") });
          return;
        }
        var useLang = langOverride || lang;
        setLoading(true);
        setMessage(null);
        setNote(null);
        setItems(null);
        layer.search(needle, { lang: useLang }).then(function (res) {
          setItems(res.items);
          setSource(res.from);
          setNote(res.note === "short-offline" ? t("shortOfflineNote") : null);
          setExpanded(null);
          setLoading(false);
          setLastAction("search");
          recordHistory(needle);
          setStatusTick(function (x) { return x + 1; });
          if (res.items.length === 0) {
            setMessage({ kind: "info", text: res.note === "short-offline" ? t("noResultsShort") : t("noResults") });
          }
        }, function (err) {
          setLoading(false);
          setMessage({ kind: "error", text: t("error") + ": " + (err && err.message ? err.message : String(err)) });
        });
      }

      function runRandom(langOverride) {
        setLoading(true);
        setMessage(null);
        setNote(null);
        setItems(null);
        layer.random({ lang: langOverride || lang }).then(function (poem) {
          setItems(poem ? [poem] : []);
          setSource(poem && poem.__offline ? "offline" : "api");
          setExpanded(poem ? poem.id || poem.title : null);
          setLoading(false);
          setLastAction("random");
          setStatusTick(function (x) { return x + 1; });
        }, function (err) {
          setLoading(false);
          setMessage({ kind: "error", text: t("error") + ": " + (err && err.message ? err.message : String(err)) });
        });
      }

      function runFiltered(langOverride) {
        var filters = { lang: langOverride || lang };
        if (dynasty) filters.dynasty = dynasty;
        if (type) filters.type = type;
        if (author.trim()) filters.author = author.trim();
        setLoading(true);
        setMessage(null);
        setNote(null);
        setItems(null);
        layer.random(filters).then(function (poem) {
          setItems(poem ? [poem] : []);
          setSource(poem && poem.__offline ? "offline" : "api");
          setExpanded(poem ? poem.id || poem.title : null);
          setLoading(false);
          setLastAction("filtered");
          setStatusTick(function (x) { return x + 1; });
        }, function (err) {
          setLoading(false);
          setMessage({ kind: "error", text: t("error") + ": " + (err && err.message ? err.message : String(err)) });
        });
      }

      function runDaily(langOverride) {
        setLoading(true);
        setMessage(null);
        setNote(null);
        setItems(null);
        layer.daily(langOverride || lang).then(function (poem) {
          setItems(poem ? [poem] : []);
          setSource("api");
          setExpanded(poem ? poem.id || poem.title : null);
          setLoading(false);
          setLastAction("daily");
          setStatusTick(function (x) { return x + 1; });
        }, function (err) {
          setLoading(false);
          setMessage({ kind: "error", text: t("error") + ": " + (err && err.message ? err.message : String(err)) });
        });
      }

      function recordHistory(word) {
        var next = [word].concat(history.filter(function (h) { return h !== word; })).slice(0, 20);
        setHistory(next);
        writeJSON(HISTORY_KEY, next);
      }
      function clearHistory() {
        setHistory([]);
        writeJSON(HISTORY_KEY, []);
      }

      function runFeihua(ch, langOverride) {
        var c = (ch === undefined ? feihuaChar : ch).trim();
        if (c.length !== 1) {
          setMessage({ kind: "error", text: t("feihuaNeedOne") });
          if (typeof document !== "undefined") {
            var input = document.querySelector(".cp-feihua");
            if (input && typeof input.focus === "function") input.focus();
          }
          return;
        }
        setLoading(true);
        setMessage(null);
        setNote(null);
        setItems(null);
        layer.random({ char: c, lang: langOverride || lang }).then(function (poem) {
          setItems(poem ? [poem] : []);
          setSource(poem && poem.__offline ? "offline" : "api");
          setExpanded(poem ? poem.id || poem.title : null);
          setLoading(false);
          setLastAction("feihua");
          setStatusTick(function (x) { return x + 1; });
        }, function (err) {
          setLoading(false);
          setMessage({ kind: "error", text: t("error") + ": " + (err && err.message ? err.message : String(err)) });
        });
      }

      function runFestival(f) {
        setFestival(f.id);
        setItems([f.poem]);
        setSource("local");
        setNote(null);
        setMessage(null);
        setExpanded(null);
        setLoading(false);
        setLastAction("festival:" + f.id);
        setStatusTick(function (x) { return x + 1; });
      }

      function runFestivalRandom(f, langOverride) {
        setLoading(true);
        setMessage(null);
        setNote(null);
        setItems(null);
        layer.random({ char: f.char, lang: langOverride || lang }).then(function (poem) {
          setItems(poem ? [poem] : []);
          setSource(poem && poem.__offline ? "offline" : "api");
          setExpanded(poem ? poem.id || poem.title : null);
          setLoading(false);
          setLastAction("festival:" + f.id);
          setStatusTick(function (x) { return x + 1; });
        }, function (err) {
          setLoading(false);
          setMessage({ kind: "error", text: t("error") + ": " + (err && err.message ? err.message : String(err)) });
        });
      }

      function aiFestival(f) {
        var input = props.inputActions;
        if (!input || typeof input.setDraft !== "function") {
          setAiFlash(t("aiNoInput"));
          return;
        }
        var prompt = t("aiFestivalPrompt").replace("%s", f.name);
        input.setDraft(prompt);
        switchToChatView();
        setAiFlash(t("aiFilled"));
        setTimeout(function () { setAiFlash(null); }, 4000);
      }

      function shareCard(poem) {
        if (downloadPoemCard(poem)) {
          setCopied("card");
          setTimeout(function () { setCopied(null); }, 2500);
        } else {
          setMessage({ kind: "error", text: t("cardNoCanvas") });
        }
      }

      function toggleLang() {
        var next = lang === "zh-Hant" ? "zh-Hans" : "zh-Hant";
        setLang(next);
        saveLang(next);
        if (items === null) return;
        if (lastAction === "search") runSearch(query.trim(), next);
        else if (lastAction === "filtered") runFiltered(next);
        else if (lastAction === "random") runRandom(next);
        else if (lastAction === "daily") runDaily(next);
        else if (lastAction === "feihua") runFeihua(feihuaChar, next);
      }

      function resetFilters() {
        setDynasty("");
        setType("");
        setAuthor("");
      }

      function copyPoem(poem, fmt) {
        var authorName = poem.author && poem.author.name ? poem.author.name : (poem.author || "");
        var dynastyName = poem.dynasty && poem.dynasty.name ? poem.dynasty.name : (poem.dynasty || "");
        var lines = (poem.content || []).join("\n");
        var text;
        if (fmt === "md") {
          text = "**《" + poem.title + "》**\n\n> " + authorName + " · " + dynastyName + "\n\n" + lines;
        } else {
          text = "《" + poem.title + "》 " + authorName + " · " + dynastyName + "\n" + lines;
        }
        writeClipboard(text).then(function () {
          setCopied(fmt);
          setTimeout(function () { setCopied(null); }, 1500);
        }, function () {});
      }

      function favKey(p) {
        if (p.id !== undefined && p.id !== null) return "id:" + p.id;
        var an = p.author && p.author.name ? p.author.name : (p.author || "");
        return "t:" + (p.title || "") + "|" + an;
      }
      function poemSnapshot(p) {
        return {
          id: p.id,
          title: p.title || "",
          author: p.author && p.author.name ? p.author.name : (p.author || ""),
          dynasty: p.dynasty && p.dynasty.name ? p.dynasty.name : (p.dynasty || ""),
          type: p.type && p.type.name ? p.type.name : (p.type || ""),
          content: Array.isArray(p.content) ? p.content : [],
        };
      }
      function isFav(p) {
        var k = favKey(p);
        return favs.some(function (f) { return favKey(f) === k; });
      }
      function toggleFav(p) {
        var snap = poemSnapshot(p);
        var k = favKey(snap);
        var exists = favs.some(function (f) { return favKey(f) === k; });
        var next = exists ? favs.filter(function (f) { return favKey(f) !== k; }) : [snap].concat(favs);
        setFavs(next);
        writeJSON(FAVS_KEY, next);
      }
      function clearFavs() {
        setFavs([]);
        writeJSON(FAVS_KEY, []);
      }
      /** Try to switch the session's active view to the chat (对话) tab. */
      function switchToChatView() {
        // 1) store actions, should the framework ever surface them to entries
        if (props.useStore && props.actions && typeof props.actions.setView === "function") {
          try {
            props.actions.setView("chat");
            return true;
          } catch (err) { /* fall through to the DOM path */ }
        }
        // 2) DOM fallback: click the 对话/Chat view tab in the session header
        if (typeof document !== "undefined") {
          try {
            var labels = ["对话", "Chat", "chat"];
            var tabs = document.querySelectorAll('[role="tab"]');
            for (var i = 0; i < tabs.length; i++) {
              var text = (tabs[i].textContent || "").trim();
              for (var j = 0; j < labels.length; j++) {
                if (text === labels[j]) {
                  tabs[i].click();
                  return true;
                }
              }
            }
          } catch (err) { /* ignore */ }
        }
        return false;
      }

      function aiExplain(p) {
        var input = props.inputActions;
        if (!input || typeof input.setDraft !== "function") {
          setAiFlash(t("aiNoInput"));
          return;
        }
        var authorName = p.author && p.author.name ? p.author.name : (p.author || "");
        var dynastyName = p.dynasty && p.dynasty.name ? p.dynasty.name : (p.dynasty || "");
        var lines = (p.content || []).join("\n");
        var prompt = t("aiPrompt") + "\n\n《" + p.title + "》\n" + authorName + " · " + dynastyName + "\n\n" + lines;
        input.setDraft(prompt);
        switchToChatView();
        setAiFlash(t("aiFilled"));
        setTimeout(function () { setAiFlash(null); }, 4000);
      }
      function poemRow(poem, idx, favMode) {
        var id = poem.id !== undefined && poem.id !== null ? poem.id : (poem.title + "-" + idx);
        var open = key === String(id);
        var fav = isFav(poem);
        var actions = [
          el("button", { className: "cp-btn", onClick: function (ev) { ev.stopPropagation(); copyPoem(poem, "text"); } }, t("copy")),
          el("button", { className: "cp-btn", onClick: function (ev) { ev.stopPropagation(); copyPoem(poem, "md"); } }, t("copyMd")),
        ];
        if (props.inputActions) {
          actions.push(el("button", { className: "cp-btn", onClick: function (ev) { ev.stopPropagation(); aiExplain(poem); } }, t("aiExplain")));
        }
        actions.push(el("button", {
          className: "cp-btn",
          onClick: function (ev) { ev.stopPropagation(); toggleFav(poem); },
        }, fav ? t("favAdded") : t("favAdd")));
        actions.push(el("button", {
          className: "cp-btn",
          onClick: function (ev) { ev.stopPropagation(); shareCard(poem); },
        }, t("cardShare")));
        actions.push(el("button", { className: "cp-btn", onClick: function (ev) { ev.stopPropagation(); setExpanded(null); } }, t("collapse")));
        return el("div", { className: "cp-row", key: String(id) },
          el("div", {
            className: "cp-row-head",
            onClick: function () { setExpanded(open ? null : String(id)); },
          },
            el("span", { className: "cp-row-title" }, poem.title || "—"),
            el("span", { className: "cp-row-preview" }, previewOf(poem)),
            el("span", { className: "cp-row-meta" },
              poem.author ? el("span", null, poem.author.name || poem.author) : null,
              fixPoemDynasty(poem).name
                ? el("span", null,
                    fixPoemDynasty(poem).name,
                    fixPoemDynasty(poem).corrected
                      ? el("span", {
                          className: "cp-corrected",
                          title: t("corrected") + ": " + fixPoemDynasty(poem).from,
                        }, t("corrected"))
                      : null)
                : null,
              poem.type ? el("span", null, poem.type.name || poem.type) : null,
            ),
          ),
          open
            ? el("div", { className: "cp-row-body" },
                el("div", { className: "cp-lines" },
                  (poem.content || []).map(function (line, li) {
                    return el("div", { key: li }, line);
                  }),
                ),
                el("div", { className: "cp-actions" }, actions),
              )
            : null,
        );
      }

      var st = layer.status();
      var key = expanded !== null ? String(expanded) : null;
      var hasFilters = !!(dynasty || type || author.trim());

      return el("div", { className: "cp-root" },
        el("div", { className: "cp-bar" },
          el("input", {
            className: "cp-search",
            type: "text",
            placeholder: t("searchPlaceholder"),
            value: query,
            onChange: function (ev) { setQuery(ev.target.value); },
            onKeyDown: function (ev) {
              if (ev.key === "Enter" && !ev.nativeEvent.isComposing) runSearch(ev.target.value);
            },
          }),
          el("button", { className: "cp-btn primary", onClick: function () { runSearch(query); } }, t("search")),
          el("button", { className: "cp-btn", onClick: function () { runRandom(); } }, t("random")),
          el("button", { className: "cp-btn", onClick: function () { runDaily(); } }, t("daily")),
          el("button", { className: "cp-btn cp-lang-btn", onClick: toggleLang },
            lang === "zh-Hans" ? t("toHant") : t("toHans")),
          el("button", {
            className: "cp-btn" + (viewMode === "festival" ? " primary" : ""),
            onClick: function () { setViewMode(viewMode === "festival" ? "search" : "festival"); },
          }, t("festival")),
          el("button", {
            className: "cp-btn" + (viewMode === "favs" ? " primary" : ""),
            onClick: function () { setViewMode(viewMode === "favs" ? "search" : "favs"); },
          }, t("favs") + (favs.length ? " (" + favs.length + ")" : "")),
        ),
        el("div", { className: "cp-bar2" },
          el("select", {
            className: "cp-select",
            value: dynasty,
            onChange: function (ev) { setDynasty(ev.target.value); },
          },
            el("option", { value: "" }, t("filterDynasty") + " · " + t("all")),
            dynasties.map(function (d) {
              return el("option", { key: String(d.id) + d.name, value: d.name }, d.name);
            }),
          ),
          el("select", {
            className: "cp-select",
            value: type,
            onChange: function (ev) { setType(ev.target.value); },
          },
            el("option", { value: "" }, t("filterType") + " · " + t("all")),
            types.map(function (tp) {
              return el("option", { key: String(tp.id) + tp.name, value: tp.name }, tp.name);
            }),
          ),
          el("input", {
            className: "cp-author-input",
            type: "text",
            placeholder: t("filterAuthor"),
            value: author,
            onChange: function (ev) { setAuthor(ev.target.value); },
          }),
          el("button", { className: "cp-btn primary", onClick: function () { runFiltered(); } }, t("filterGo")),
          el("button", { className: "cp-btn", onClick: resetFilters }, t("reset")),
          el("span", { className: "cp-chips" },
            t("commonAuthors"),
            COMMON_AUTHORS.map(function (name) {
              return el("button", {
                key: name,
                className: "cp-chip",
                onClick: function () { setAuthor(name); },
              }, name);
            }),
          ),
          el("span", { className: "cp-feihua-group" },
            el("span", { className: "cp-feihua-label" }, t("feihua")),
            el("input", {
              className: "cp-feihua",
              type: "text",
              maxLength: "1",
              placeholder: t("feihuaPlaceholder"),
              value: feihuaChar,
              onChange: function (ev) { setFeihuaChar(ev.target.value); },
              onKeyDown: function (ev) {
                if (ev.key === "Enter" && !ev.nativeEvent.isComposing) runFeihua(ev.target.value);
              },
            }),
            el("button", { className: "cp-btn", onClick: function () { runFeihua(feihuaChar); } }, t("feihuaGo")),
          ),
        ),
        viewMode === "search"
          ? el("div", { className: "cp-history" },
              el("span", null, t("historyLabel")),
              history.length > 0
                ? history.map(function (h) {
                    return el("button", {
                      key: h,
                      className: "cp-chip",
                      onClick: function () { setQuery(h); runSearch(h); },
                    }, h);
                  })
                : el("span", { className: "cp-history-empty" }, t("historyEmpty")),
              history.length > 0
                ? el("button", { className: "cp-chip", onClick: clearHistory }, t("historyClear"))
                : null,
            )
          : null,
        el("div", { className: "cp-status" + (st.cacheOnly ? " warn" : "") },
          st.cacheOnly ? el("span", null, t("degraded")) : null,
          el("span", null, t("results") + ": " + (items === null ? 0 : items.length)),
          source ? el("span", null, source === "offline" ? (note ? t("fromLocal") : t("fromOffline")) : t("fromApi")) : null,
          hasFilters ? el("span", null, t("filterActive") + " " + [dynasty, type, author.trim()].filter(Boolean).join(" · ")) : null,
          loading ? el("span", null, t("loading")) : null,
          copied ? el("span", null, copied === "md" ? t("copyMd") + " ✓" : t("copied")) : null,
        ),
        aiFlash ? el("div", { className: "cp-ai-note" }, aiFlash) : null,
        note ? el("div", { className: "cp-note" }, note) : null,
        message ? el("div", { className: "cp-msg" + (message.kind === "error" ? " error" : "") }, message.text) : null,
        viewMode === "festival"
          ? el("div", null,
              el("div", { className: "cp-festival-grid" },
                FESTIVALS.map(function (f) {
                  return el("div", {
                    key: f.id,
                    className: "cp-festival-card" + (festival === f.id ? " active" : ""),
                    onClick: function () { runFestival(f); },
                  },
                    el("span", { className: "cp-festival-name" }, f.name),
                    el("span", { className: "cp-festival-char" }, "· " + f.char),
                  );
                }),
              ),
              festival
                ? el("div", { className: "cp-festival-actions" },
                    el("button", {
                      className: "cp-btn",
                      onClick: function () { var f = festivalById(festival); if (f) runFestivalRandom(f); },
                    }, t("festivalRandom")),
                    el("button", {
                      className: "cp-btn",
                      onClick: function () { var f = festivalById(festival); if (f) aiFestival(f); },
                    }, t("festivalAi")),
                    el("button", { className: "cp-btn", onClick: function () { setViewMode("search"); } }, "⇦ " + t("search")),
                  )
                : null,
              festival && items && items.length > 0
                ? el("div", { className: "cp-list" }, items.map(function (poem, idx) { return poemRow(poem, idx, false); }))
                : (festival ? el("div", { className: "cp-msg" }, t("festivalEmpty")) : null),
              !festival
                ? el("div", { className: "cp-msg" }, t("festivalEmpty"))
                : null,
            )
          : (viewMode === "favs"
              ? el("div", null,
                  el("div", { className: "cp-favbar" },
                    el("button", { className: "cp-btn", onClick: function () { setViewMode("search"); } }, "⇦ " + t("search")),
                    el("button", { className: "cp-btn", onClick: clearFavs }, t("favClear")),
                  ),
                  favs.length > 0
                    ? el("div", { className: "cp-list" }, favs.map(function (p, i) { return poemRow(p, i, true); }))
                    : el("div", { className: "cp-msg" }, t("favEmpty")),
                )
              : (items && items.length > 0
                  ? el("div", { className: "cp-list" }, items.map(function (poem, idx) { return poemRow(poem, idx, false); }))
                  : (source || note
                      ? el("div", { className: "cp-msg" }, note ? t("noResultsShort") : t("noResults"))
                      : null))),
        el("div", { className: "cp-footer" },
          el("div", { className: "cp-credit" },
            t("apiCreditPre"),
            el("a", { className: "cp-credit-link", href: API_PROJECT_URL, target: "_blank", rel: "noopener noreferrer" }, t("apiCreditLink")),
            t("apiCreditTail"),
          ),
          el("div", { className: "cp-version" }, t("version")),
        ),
      );
    }

    /* ------------------------------ apply ------------------------------ */

    function apply(ctx) {
      var styleEl = null;
      if (typeof document !== "undefined") {
        styleEl = document.createElement("style");
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
      }

      ctx.effect(function () {
        ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-chinese-poetry: dictionaries");
      var t = ctx.locale.bind(NS);

      // One shared data layer per apply(): keeps the mem cache, rate-limiter
      // state, and degradation flags alive across view switches.
      var sharedLayer = new PoetryDataLayer();

      ctx.slots.inject("conversation.view", function () {
        return ctx.slots.register({
          name: "conversation.view",
          id: "poetry",
          order: 20,
          locale: NS,
          label: function () { return t("view"); },
        }, function (slotProps) {
          return el(PoetryView, {
            t: t,
            sessionId: slotProps.sessionId,
            inputActions: slotProps.inputActions,
            layer: sharedLayer,
          });
        });
      });

      ctx.effect(function () {
        return function () {
          if (styleEl !== null && styleEl.parentNode !== null) styleEl.parentNode.removeChild(styleEl);
        };
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    // NOTE: exported late so the var/array initializers above (FESTIVALS,
    // DYNASTY_FIX, etc.) have already run when these references are read.
    exports.FESTIVALS = FESTIVALS;
    exports.festivalById = festivalById;
    exports.shareCardDataUrl = shareCardDataUrl;
    return module.exports;
  },
});
