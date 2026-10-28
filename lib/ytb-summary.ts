import { loadMemoryConfig } from "./memory-storage";
import { generateYtb } from "./ytb-engine";
import { ytbMemorySources, type YtbMemorySource } from "./ytb-memory";
import type { YtbState, YtbMemorySummary } from "./ytb-storage";

/** Generated once per changed source; the callback rechecks the fingerprint before storing. */
export async function summarizeYtbSources(get: () => YtbState, commit: (fn: (s: YtbState) => YtbState) => void, kind: YtbMemorySource["kind"], id: string, onlyCharacterId?: string) {
  if (loadMemoryConfig().shortTermAllowedSources?.ytb === false) return;
  const state = get();
  const sources = state.channels.filter(c => c.ownerType === "character" && (!onlyCharacterId || c.ownerId === onlyCharacterId)).flatMap(c => ytbMemorySources(state, c.ownerId)).filter(s => s.kind === kind && s.id === id && !s.cacheKey?.endsWith(":legacy"));
  for (const source of sources) {
    if (source.cached?.fingerprint === source.fingerprint) continue;
    // Split long recordings; avoid sending a whole fan-chat history or exceeding a request's context.
    const paragraphs: string[] = [];
    for (let start = 0; start < source.text.length; start += 14000) {
      const out = await generateYtb<{ summary?: string }>(null,
        '将以下已筛选的亲历记录整理为简短的第三人称中文记忆摘要，返回 {"summary":"摘要"}。只写实际事实，不编造情绪、关系或身份。不逐句复述问答；例如问喝什么、回答珍珠奶茶，合成“直播中他提到今天喝了珍珠奶茶”。以主播/该角色说了什么、做了什么和重要互动为主，省略粉丝姓名和重复闲聊。已知是用户的互动保留关键意思；身份未知的账号只能称网友或网名，不能称用户或推断真人。不能把问题里的猜测写成事实。每段尽量不超过300字。',
        source.text.slice(start, start + 14000), { publicOnly: true });
      if (out.summary?.trim()) paragraphs.push(out.summary.trim());
    }
    if (!paragraphs.length) throw new Error("记忆摘要未生成，请稍后重试保存或刷新会话。");
    const summary: YtbMemorySummary = { fingerprint: source.fingerprint, content: paragraphs.join("\n"), at: Math.max(Date.now(), source.at) };
    commit(p => {
      const owner = p.channels.find(c => c.id === source.channelId);
      const current = owner && ytbMemorySources(p, owner.ownerId).find(s => s.id === id && s.kind === kind && s.cacheKey === source.cacheKey);
      if (current?.fingerprint !== source.fingerprint) return p;
      if (kind === "stream") return { ...p, streams: p.streams.map(s => s.id === id ? { ...s, memorySummaries: { ...s.memorySummaries, [source.cacheKey || source.channelId]: summary } } : s) };
      if (kind === "thread") return { ...p, threads: p.threads.map(t => t.id === id ? { ...t, memorySummaries: { ...t.memorySummaries, [source.cacheKey || source.channelId]: summary } } : t) };
      return { ...p, groups: p.groups.map(g => g.id === id ? { ...g, memorySummaries: { ...g.memorySummaries, [source.cacheKey || source.channelId]: summary } } : g) };
    });
  }
}
