import { loadApiConfigs, loadBindingConfig, loadPresets, loadWorldBooks, loadRegexes, resolveBinding, resolveUserIdentity } from "./settings-storage";
import { sendLLMRequest } from "./chat-engine";
import { assemblePromptPayload } from "./llm-prompt-assembler";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { buildCharacterTimeContext } from "./character-time";
import { buildCalendarScheduleMarker } from "./calendar-storage";
import { getWeekStartIso } from "./calendar-utils";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveMemoriesForPrompt, retrieveCoreMemoriesForPrompt } from "./memory-service";
import { formatLongTermMemories, formatCoreMemories } from "./memory-injector";
import { prepareShortTermContext } from "./short-term-assembler";
import { WALLET_CURRENCIES } from "./wallet-storage";
import { ytbCanVisit, ytbRecognizes, ytbIdentityContext } from "./ytb-policy";
import { ytbAvailability } from "./ytb-runtime";
import { loadYtbState, YTB_STRANGER_AVATAR, ytbId, type YtbChannel, type YtbComment, type YtbLine, type YtbStream, type YtbState, type YtbCall, type YtbMessage } from "./ytb-storage";

const text = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(v => v && typeof v === "object") as Record<string, unknown>[] : [];
function parse(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("生成内容格式有误，请重试。");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}
export function channelPublic(ch: YtbChannel) { return `频道 ${ch.id}：${ch.name} ${ch.handle}；简介：${ch.description || "无"}；频道风格、身份披露和直播习惯：${ch.style || "未填写"}；人设参考程度 ${ch.disclosure}`; }
export async function generateYtb<T extends Record<string, unknown>>(channel: YtbChannel | null, instruction: string, context: string, options: { publicOnly?: boolean } = {}): Promise<T> {
  const real = !options.publicOnly && channel?.ownerType === "character" ? loadCharacters().find(c => c.id === channel.ownerId) : undefined;
  const slot = resolveBinding(loadBindingConfig(), real?.id, "ytb");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("请先在设置中配置聊天 API。");
  const presets = loadPresets(); const preset = presets.find(p => p.id === slot.presetId) ?? presets.find(p => p.builtIn) ?? null;
  const identity = resolveUserIdentity(real?.id, "ytb");
  const state = loadYtbState();
  const userChannel = state.channels.find(c => c.ownerType === "user" && c.ownerId === identity?.id);
  const recognizesUser = !options.publicOnly && Boolean(channel && userChannel && (channel.ownerType === "user" ? channel.disclosure !== "none" : ytbRecognizes(userChannel, channel)));
  const permitted = !options.publicOnly && channel?.disclosure !== "none";
  const character: Character = real ? { ...real, id: permitted ? real.id : `youtube:${channel!.id}`, name: channel!.name, userRelationship: permitted ? real.userRelationship : undefined, userKnowledgeLevels: permitted ? real.userKnowledgeLevels : undefined, persona: permitted ? real.persona : channel!.style, personality: permitted ? real.personality : "", briefPersona: permitted ? real.briefPersona : channel!.style } : {
    id: channel?.id || "youtube-generator", name: channel?.name || "Youtube", avatar: channel?.avatar || null,
    persona: channel?.ownerType === "user" && permitted ? `${identity?.bio || ""}\n${identity?.occupation || ""}\n${identity?.customSettings || ""}` : channel?.style || "按世界背景生成普通互联网用户", createdAt: "", updatedAt: "",
  };
  const prepared = real && permitted ? prepareShortTermContext(real.id, "ytb", { history: [] }) : null;
  const memoryConfig = loadMemoryConfig();
  const [memories, core] = real && permitted ? await Promise.all([retrieveMemoriesForPrompt(real.id, context || channel!.style || "Youtube直播", memoryConfig), retrieveCoreMemoriesForPrompt(real.id, memoryConfig)]) : [[], []];
  const books = loadWorldBooks().filter(b => slot.worldBookIds?.includes(b.id));
  const regexes = loadRegexes().filter(r => slot.regexIds?.includes(r.id));
  const messages = assemblePromptPayload({ character, preset, history: [], worldBooks: books, regexes,
    userIdentity: recognizesUser ? identity : null, appId: "ytb", appTags: ["ytb", "live"],
    longTermMemories: formatLongTermMemories(memories), coreMemories: formatCoreMemories(core),
    recentBlocks: prepared?.recentBlocks, unifiedRecentItems: prepared?.unifiedRecentItems, worldBookActivationContext: context,
    scheduleSummary: real ? buildCalendarScheduleMarker("character", real.id, getWeekStartIso(new Date())) : "",
    timeContext: buildCharacterTimeContext(real?.timeZone),
  });
  const rules = [
    "这是虚构手机里的 Youtube 文字直播平台。只返回合法 JSON，不要 Markdown。",
    channel ? channelPublic(channel) : "生成符合世界背景的陌生频道，不自动认识用户，也不编造已发生的私聊。",
    "频道风格决定开播主题：推歌频道始终围绕推歌，不能因为主播是演员就擅自变成拍摄花絮。频道简介是辅助信息。",
    "必须区分主播内部认知与观众可知信息。人设不参考=只按频道介绍；部分参考=只公开频道介绍明确允许的身份信息；全部参考=人设身份可公开，但私人记忆、未公开事件和秘密仍不属于观众知识。角色彼此认识不等于网友知道他们是谁。",
    "动作只用中文。台词遵循说话人的母语、沟通语言和频道设定，提供对应中文翻译；语音只读 original。翻译保留原语言语感。",
    "观众分布可以包含各个国家。不要依据语言单独推断国家。不要编造用户没说过的话或没做过的动作。",
    options.publicOnly ? "本次只处理给定公开素材，不参考任何用户私人资料或角色记忆。" : channel ? ytbIdentityContext(state, channel) : "",
    "匿名身份边界高于私人记忆里的熟悉感：即使现实认识，也不能凭系统角色ID、相似措辞、头像或后台绑定认出未披露的小号。知道对方身份也不能在公开弹幕中泄露。",
    "聊天室由不同观众组成：允许延迟讨论此前几段已经播出的内容、闲聊、表白、无意义刷屏、新观众问是谁、合理质疑和吐槽。不整齐回应最新一句，不全部正面，也不每轮硬塞恶评。同一话题避免近义重复刷满屏。",
    context, instruction,
  ].filter(Boolean).join("\n\n");
  const output = await sendLLMRequest(config, preset, [...messages, { role: "system", content: rules }, { role: "user", content: "按本次请求生成 JSON。" }], regexes, { characterName: channel?.name || "Youtube", userName: recognizesUser ? identity?.name : userChannel?.name || "网友" }, { appId: "ytb", appTags: ["ytb", "live"], skipOutputRegex: true });
  return parse(output) as T;
}

export async function generateYtbRound(channel: YtbChannel, stream: YtbStream | undefined, state: YtbState, opening = false) {
  const now = Date.now();
  const isUser = channel.ownerType === "user";
  const connections = (stream?.calls || []).filter(c => c.status === "connected" && (!c.channelId || state.channels.find(ch=>ch.id===c.channelId)?.ownerType!=="character" || ytbAvailability(state.channels.find(ch=>ch.id===c.channelId)!).free));
  const allowedSpeakers = new Set([channel.id, ...connections.map(c => c.channelId || c.id)]);
  const candidates = state.channels.filter(c => ytbCanVisit(channel, c) && ytbAvailability(c).free && !stream?.leftBy.includes(c.id) && !state.streams.some(l => l.channelId === c.id && l.status === "live"));
  // A round can have no new visitors at all. Existing visitors may continue interacting.
  const selected = Math.random() < .35 ? candidates.filter(c => !stream?.watchedBy.includes(c.id) && Math.random() < .25).slice(0, 2) : [];
  const attending = candidates.filter(c => stream?.visits?.[c.id] && !stream.visits[c.id].leftAt);
  const visitors = [...attending, ...selected];
  const contextLines = (stream?.lines || []).filter(l => l.at <= now).slice(-24).map(l => `${l.speakerId || channel.id} ${l.kind}: ${l.original}`).join("\n");
  const contextComments = (stream?.comments || []).filter(c => c.at <= now).slice(-20).map(c => `[${c.id}] ${c.name}: ${c.original}`).join("\n");
  const deal = state.deals.find(d => d.id === stream?.linkedDealId && d.status === "active");
  const roster = (await Promise.all([...visitors, ...connections.flatMap(call => state.channels.find(c => c.id === call.channelId) || [])].map(async c => {
    const entered = stream?.visits?.[c.id]?.enteredAt ?? now;
    const witnessed = (stream?.lines || []).filter(l => l.at >= entered && l.at <= now).map(l => l.original).join("\n");
    const visibility = `该观众入场时间${entered}，只见过：${witnessed || "刚入场，没看过此前内容"}。不得回应入场前的话题。\n${ytbIdentityContext(state,c)}`;
    if (c.ownerType !== "character" || c.disclosure === "none") return `${channelPublic(c)}\n${visibility}`;
    const person = loadCharacters().find(char => char.id === c.ownerId);
    const cfg = loadMemoryConfig();
    const [long, core] = await Promise.all([retrieveMemoriesForPrompt(c.ownerId, contextLines || stream?.theme || c.style || "Youtube直播", cfg), retrieveCoreMemoriesForPrompt(c.ownerId, cfg)]);
    const recent = prepareShortTermContext(c.ownerId, "ytb", { history: [] });
    return `${channelPublic(c)}\n${visibility}\n以下只供该角色内部认知，不是粉丝知道的内容：${person?.persona || c.style}\n${formatLongTermMemories(long)}\n${formatCoreMemories(core)}\n${recent.recentBlocks.map(b => b.content).join("\n")}`;
  }))).join("\n");
  const data = await generateYtb(channel,
    `返回 {"title":"按主播语言拟定的标题","titleTranslated":"中文标题翻译，中文标题则留空","durationMinutes":30,"segments":[{"kind":"speech或action","speakerId":"频道ID","original":"原话或中文动作","translated":"中文翻译","replyTo":["实际回答的已有评论ID，不回答则空数组"]}],"comments":[{"name":"观众账号","original":"原话","translated":"中文翻译","tipAmount":0,"tipCurrency":"USD"}],"visitorModes":[{"channelId":"候选频道ID","mode":"watch或comment或call","accepted":false,"original":"可空的评论","translated":"中文翻译"}],"fanCall":{"name":"来电观众ID"},"shouldEnd":false}。
${isUser ? "用户是主播，绝不能替用户生成主播话语或动作。segments 只能生成已接通的嘉宾说话，没有连线时 segments 必须为空。" : "主播段落1~3条，可纯说话、纯动作或交错。不要机械先动作再说话。"}
标题使用主播设定的语言，并给出准确中文 titleTranslated；如果标题本来是中文，titleTranslated 留空。如果已给定本场标题，title 必须原样保持，并翻译这个既有标题，不另拟标题。连线嘉宾仅能说话，不能生成嘉宾动作。speakerId 只能用 ${[...allowedSpeakers].join("、")}。观众留言 ${opening ? "10~15" : "5~12"} 条，评论只反应已经展示的内容，不提前知道未来段落。打赏可为零，有时1条，金额币种按观众国家合理生成，币种只能来自 ${WALLET_CURRENCIES.join("、")}。非用户直播同样可内部统计打赏，但不显示主播收到订阅或打赏的提示。visitorModes只允许候选列表；可以为空数组。刚进入的观众不得回应入场前内容，已在场观众只知道自己的入场后片段。watch表示只围观，不强制每人说话。角色主播收到另一角色的连线时，可按当时主题和意愿决定accepted是否接听，通常不打也不接，不强制通话。普通comments只能生成陌生观众，不冒充候选角色；真实角色评论只能通过visitorModes。fanCall可以为null，通常没有来电，不要频繁来电。shouldEnd只有非用户主播结合时间、日历、内容合理收尾时才为true。若用户主播，始终false。durationMinutes按本场主题和时间给15~120分钟，不要每次固定。`,
    `本场主题：${stream?.theme || channel.style}；标题：${stream?.title || "请生成"}。${opening ? "可能已经播过一会儿，用户刚刷到，内容不必问好开场。" : "继续当前现场。"}\n已经展示的主播内容：\n${contextLines || "尚无"}\n已展示聊天室：\n${contextComments || "尚无"}\n已接通嘉宾：${connections.map(c => `${c.channelId || c.id}=${c.name}`).join("、") || "无"}\n本轮可互动的空闲观众：${visitors.map(c => c.id).join("、") || "无"}\n候选及嘉宾背景：${roster}\n${deal ? `本场广告商品：${deal.product}；合作要求：${deal.brief}。观众偶尔可讨论广告。用户主播只能根据用户实际发言反应，不可替用户念广告；非用户主播可以自然带到广告。` : "无广告"}`);
  const base = Math.max(now, ...(stream?.lines.map(l => l.at) || [now]), ...(stream?.comments.map(c => c.at) || [now]));
  const lines: YtbLine[] = rows(data.segments).slice(0, 3).flatMap((r, index) => {
    const speakerId = text(r.speakerId) || channel.id;
    if (!allowedSpeakers.has(speakerId) || (isUser && speakerId === channel.id) || (r.kind === "action" && speakerId !== channel.id)) return [];
    return [{ id: ytbId(), speakerId, replyTo: Array.isArray(r.replyTo) ? r.replyTo.map(String).filter(id => (stream?.comments || []).some(c => c.id === id && c.at <= now)) : [], kind: r.kind === "action" ? "action" as const : "speech" as const, original: text(r.original), translated: text(r.translated || r.original), at: base + (index + 1) * 3300 }];
  }).filter(l => l.original);
  const comments: YtbComment[] = rows(data.comments).slice(0, 15).map((r, index) => ({ id: ytbId(), name: text(r.name, 35) || "viewer", original: text(r.original, 600), translated: text(r.translated || r.original, 600), at: base + 1700 + index * 1700,
    ...(Number(r.tipAmount) > 0 && WALLET_CURRENCIES.includes(text(r.tipCurrency)) ? { tip: { amount: Math.min(Number(r.tipAmount), 10000000), currency: text(r.tipCurrency) } } : {}),
  })).filter(c => c.original);
  const calls: YtbCall[] = [];
  for (const c of visitors) {
    const mode = rows(data.visitorModes).find(r => r.channelId === c.id);
    if (mode?.mode === "comment" && text(mode.original)) comments.push({ id: ytbId(), channelId: c.id, name: c.name, original: text(mode.original), translated: text(mode.translated || mode.original), at: base + 2000 });
    if (mode?.mode === "call" && !connections.some(x=>x.channelId===c.id) && !(stream?.calls||[]).some(x=>x.channelId===c.id&&x.status==="waiting")) calls.push({ id: ytbId(), channelId: c.id, name: c.name, avatar: c.avatar, at: base + 1000, status: !isUser && mode.accepted === true && !connections.length && !calls.some(x=>x.status==="connected") ? "connected" : "waiting" });
  }
  if (isUser && data.fanCall && typeof data.fanCall === "object" && Math.random() < .35) {
    const fan = data.fanCall as Record<string, unknown>;
    if (text(fan.name)) calls.push({ id: ytbId(), name: text(fan.name, 35), avatar: YTB_STRANGER_AVATAR, at: base + 1200, status: "waiting" });
  }
  if (!lines.length && !comments.length) throw new Error("这次没有生成有效内容，请重试。");
  return { title: text(data.title, 100), titleTranslated: text(data.titleTranslated, 160), lines, comments, calls, enteredAt: now, watchedBy: selected.map(c => c.id), durationMinutes: Math.max(15, Math.min(120, Number(data.durationMinutes) || 35)), shouldEnd: !isUser && data.shouldEnd === true };
}

export async function generateYtbMessages(channel: YtbChannel, messages: YtbMessage[], context: string, group = false): Promise<YtbMessage[]> {
  const result = await generateYtb(channel, `生成${group ? "1~5条粉丝群消息，角色群主空闲时可以出现，也可以只有粉丝说话；用户自己的粉丝群绝不替用户发言" : "1~3条这个账号的私信回复"}。返回 {"messages":[{"name":"显示ID","isHost":false,"replyTo":["明确回答的消息ID"],"original":"原话","translated":"中文翻译"}]}。不要替用户回复。公开粉丝群遵守频道身份公开范围，私信也不能把陌生人当熟人。普通网友私信可以是交友、搭讪、广告、骚扰、质疑或普通粉丝交流，依据该网友风格和动机决定，不默认全是夸赞；真实角色保持自己的性格。回复问题时用replyTo准确关联实际回答的已有消息，不要随便关联未回答的消息。`, `${context}\n最近会话：${messages.slice(-24).map(m => `[${m.id}] ${m.name}：${m.quote ? `【引用 ${m.quote.name}：${m.quote.original}】` : ""}${m.original}`).join("\n")}`);
  const free = ytbAvailability(channel).free;
  return rows(result.messages).slice(0, group ? 5 : 3).flatMap(r => {
    if (!group && !free) return [];
    const host = !group || r.isHost === true;
    if (host && (!free || channel.ownerType === "user")) return [];
    return [{ id: ytbId(), senderId: host ? channel.id : ytbId(), name: host ? channel.name : text(r.name, 32) || "粉丝", avatar: host ? channel.avatar : YTB_STRANGER_AVATAR, replyTo: host && Array.isArray(r.replyTo) ? r.replyTo.map(String).filter(id => messages.some(m => m.id === id)) : [], original: text(r.original), translated: text(r.translated || r.original), at: Date.now() }];
  }).filter(m => m.original);
}
