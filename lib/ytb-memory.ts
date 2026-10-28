import { resolveUserIdentity } from "./settings-storage";
import { loadYtbState, type YtbState, type YtbMemorySummary, type YtbMessage } from "./ytb-storage";

export type YtbMemorySource = { kind: "stream" | "thread" | "group"; id: string; channelId: string; fingerprint: string; text: string; at: number; cached?: YtbMemorySummary; shared?: boolean; cacheKey?: string };
export function ytbFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}
/** Sources use only witnessed content. Unknown accounts remain channel identities. */
export function ytbMemorySources(state: YtbState, characterId: string, userId?: string): YtbMemorySource[] {
  const viewer = state.channels.find(c => c.ownerType === "character" && c.ownerId === characterId);
  if (!viewer) return [];
  const result: YtbMemorySource[] = [];
  const label = (id?: string, known = false, fallback = "网友") => {
    const c = state.channels.find(c => c.id === id);
    if (!c) return fallback;
    if (c.id === viewer.id) return `该角色（频道名${c.name}）`;
    return c.ownerType === "user" && known ? `用户（频道名${c.name}）` : `账号${c.name} ${c.handle}${known ? "（身份已知）" : "（仅知网名，不得关联真人）"}`;
  };
  const add = (kind: YtbMemorySource["kind"], id: string, heading: string, rows: string[], at: number, cached?: YtbMemorySummary, shared = false, cacheKey = viewer.id) => {
    if (!rows.length) return;
    const text = `${heading}\n${rows.join("\n")}`;
    result.push({ kind, id, channelId: viewer.id, fingerprint: ytbFingerprint(text), text, at, cached, shared, cacheKey });
  };
  for (const live of state.streams) {
    const host = state.channels.find(c => c.id === live.channelId);
    if (!live.saved || live.status !== "ended") continue;
    if (host?.ownerType === "user" && userId && host.ownerId !== userId) continue;
    const own = live.channelId === viewer.id, visit = live.visits?.[viewer.id];
    // Legacy watchedBy alone cannot prove when the viewer arrived. Never grant the full show.
    if (!own && !visit) continue;
    const after = own || visit?.replay ? -Infinity : visit!.enteredAt;
    const until = visit?.leftAt ?? live.endedAt ?? Infinity;
    const lines = live.lines.filter(l => l.at >= after && l.at <= until);
    const replies = new Set(lines.flatMap(l => l.replyTo || []));
    const comments = live.comments.filter(c => c.at >= after && c.at <= until &&
      (c.channelId === viewer.id || replies.has(c.id) || (c.readBy?.[viewer.id] === true && state.channels.some(ch => ch.id === c.channelId && ch.ownerType === "user"))));
    const items = [
      ...lines.map(l => ({ at: l.at, text: `${label(l.speakerId || live.channelId, Boolean(visit?.identities[l.speakerId || live.channelId]))}${l.kind === "action" ? "的动作" : "的发言"}：${l.original}` })),
      ...comments.map(c => ({ at: c.at, text: `${label(c.channelId, c.readBy?.[viewer.id] === true || Boolean(visit?.identities[c.channelId || ""]), c.name)}${replies.has(c.id) ? "的已回应评论" : "的已读留言"}：${c.original}` })),
    ].sort((a, b) => a.at - b.at);
    const heading = `已保存直播《${live.title}》。${own ? "该角色是主播" : visit?.replay ? "该角色观看了完整录播" : "该角色中途进入，只记以下亲眼看到的片段"}。主播：${label(live.channelId, Boolean(visit?.identities[live.channelId]))}。直播日期：${new Date(live.startedAt).toISOString()}`;
    const interactiveComments = comments.filter(c => replies.has(c.id) && c.channelId && (own || c.channelId === viewer.id));
    const sharedCommentIds = new Set(interactiveComments.map(c => c.id));
    const connectedSpeakers = new Set(lines.filter(l => l.speakerId && l.speakerId !== live.channelId).map(l => l.speakerId!));
    const connected = own ? connectedSpeakers.size > 0 : connectedSpeakers.has(viewer.id);
    const sharedLineIds = new Set<string>();
    let previousWasCall = false;
    for (const line of lines) {
      const callSpeech = connected && line.kind === "speech" && Boolean(line.speakerId && line.speakerId !== live.channelId);
      if (callSpeech || (previousWasCall && line.kind === "speech") || line.replyTo?.some(id => sharedCommentIds.has(id))) sharedLineIds.add(line.id);
      previousWasCall = callSpeech;
    }
    const sharedRows = [
      ...lines.filter(l => sharedLineIds.has(l.id)).map(l => ({ at: l.at, text: `${label(l.speakerId || live.channelId, Boolean(visit?.identities[l.speakerId || live.channelId]))}的发言：${l.original}` })),
      ...interactiveComments.map(c => ({ at: c.at, text: `${label(c.channelId, c.readBy?.[viewer.id] === true || Boolean(visit?.identities[c.channelId || ""]), c.name)}的已回应评论：${c.original}` })),
    ].sort((a,b) => a.at-b.at).map(i => i.text);
    const personalRows = [
      ...lines.filter(l => !sharedLineIds.has(l.id)).map(l => ({ at: l.at, text: `${label(l.speakerId || live.channelId, Boolean(visit?.identities[l.speakerId || live.channelId]))}${l.kind === "action" ? "的动作" : "的发言"}：${l.original}` })),
      ...comments.filter(c => !sharedCommentIds.has(c.id)).map(c => ({ at: c.at, text: `${label(c.channelId, c.readBy?.[viewer.id] === true || Boolean(visit?.identities[c.channelId || ""]), c.name)}的已读留言：${c.original}` })),
    ].sort((a,b) => a.at-b.at).map(i => i.text);
    const at = live.watchedAt?.[viewer.id] || visit?.leftAt || live.endedAt || live.startedAt;
    if (!sharedRows.length) add("stream", live.id, heading, items.map(i => i.text), at, live.memorySummaries?.[viewer.id]);
    else {
      add("stream", live.id, `${heading}【共同互动部分】`, sharedRows, at, live.memorySummaries?.[`${viewer.id}:shared`], true, `${viewer.id}:shared`);
      add("stream", live.id, `${heading}【个人观看部分，不含共同互动】`, personalRows, at, live.memorySummaries?.[`${viewer.id}:personal`], false, `${viewer.id}:personal`);
      // Existing unsplit summaries remain visible as personal history until explicitly regenerated.
      if (!live.memorySummaries?.[`${viewer.id}:shared`] && !live.memorySummaries?.[`${viewer.id}:personal`]) {
        const legacyText = `${heading}\n${items.map(i => i.text).join("\n")}`;
        const legacy = live.memorySummaries?.[viewer.id];
        if (legacy?.fingerprint === ytbFingerprint(legacyText)) result.push({ kind: "stream", id: live.id, channelId: viewer.id, cacheKey: `${viewer.id}:legacy`, fingerprint: legacy.fingerprint, text: legacyText, at, cached: legacy });
      }
    }
  }
  const conversationRows = (messages: YtbMessage[], group: boolean) => {
    const replies = new Set(messages.filter(m => m.senderId === viewer.id).flatMap(m => [...(m.replyTo || []), ...(m.quote ? [m.quote.id] : [])]));
    return messages.filter(m => m.senderId === viewer.id ||
      (Object.hasOwn(m.readBy || {}, viewer.id) && (m.readBy?.[viewer.id] === true || replies.has(m.id))) || replies.has(m.id))
      .map(m => `${label(m.senderId, m.readBy?.[viewer.id] === true, m.name)}：${m.original}`);
  };
  for (const t of state.threads) if (t.peerChannelId === viewer.id && (!userId || t.userChannelId === `user:${userId}`))
    add("thread", t.id, "Youtube 私信互动。对不知真实身份的账号只能按网友记忆。", conversationRows(t.messages, false), t.messages.at(-1)?.at || 0, t.memorySummaries?.[viewer.id]);
  for (const g of state.groups) if (g.channelId === viewer.id && (!userId || g.userChannelId === `user:${userId}`))
    add("group", g.id, `Youtube 粉丝群「${g.name}」。仅记角色已读的实名用户内容、自己发言及明确回应的问题。`, conversationRows(g.messages, true), g.messages.at(-1)?.at || 0, g.memorySummaries?.[viewer.id]);
  return result;
}
/** Never inject raw chat or stale summaries. Deleting source content revokes the projection. */
export function projectYtbMemory(state: YtbState, characterId: string, userId?: string) {
  return ytbMemorySources(state, characterId, userId).flatMap(source => source.cached?.fingerprint === source.fingerprint && source.cached.content.trim()
    ? [{ shared: source.shared, sourceKeys: source.kind === "stream" ? [`ytb:${source.id}`] : [], id: `youtube:${source.kind === "stream" ? "replay" : source.kind === "thread" ? "dm" : "group"}:${source.id}:${source.cacheKey || source.channelId}`, timestamp: new Date(source.at).toISOString(), content: source.cached.content }]
    : []);
}
export function loadYtbProjectionEntries(characterId: string, afterTimestamp?: string) {
  return projectYtbMemory(loadYtbState(), characterId, resolveUserIdentity(characterId, "ytb")?.id).filter(e => !afterTimestamp || e.timestamp > afterTimestamp);
}
