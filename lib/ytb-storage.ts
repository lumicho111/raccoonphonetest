import { revokeMemorySources } from "./memory-event-meta";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";

export type YtbChannel = {
  id: string; ownerId: string; ownerType: "user" | "character" | "npc";
  name: string; handle: string; avatar: string; banner: string; description: string;
  style: string; disclosure: "none" | "partial" | "full"; subscribers: number; videos: number;
  subscribed: boolean; community: boolean; totalViews?: number; totalNewSubscribers?: number; disclosedTo?: string[]; profileGenerated?: boolean;
};
export type YtbLine = { id: string; kind: "speech" | "action"; original: string; translated: string; at: number; speakerId?: string; replyTo?: string[] };
export type YtbComment = { id: string; name: string; original: string; translated: string; at: number; tip?: { amount: number; currency: string }; channelId?: string; characterId?: string; readBy?: Record<string, boolean> };
export type YtbCall = { id: string; channelId?: string; name: string; avatar: string; at: number; status: "waiting" | "connected" | "ended" };
export type YtbMemorySummary = { fingerprint: string; content: string; at: number };
export type YtbVisit = { enteredAt: number; leftAt?: number; replay?: boolean; identities: Record<string, boolean> };
export type YtbStream = {
  id: string; channelId: string; title: string; titleTranslated?: string; theme: string; cover: string;
  startedAt: number; endedAt?: number; endAt?: number; status: "live" | "ended";
  saved?: boolean; summaryDismissed?: boolean; savedAt?: number; pendingShares?: string[];
  viewers: number; totalViewers: number; peakViewers: number; newSubscribers: number;
  lines: YtbLine[]; comments: YtbComment[]; calls: YtbCall[];
  watchedBy: string[]; watchedAt?: Record<string, number>; leftBy: string[]; linkedDealId?: string; lastRoundAt?: number; visits?: Record<string, YtbVisit>; memorySummaries?: Record<string, YtbMemorySummary>;
};
export type YtbDeal = { id: string; channelId: string; brand: string; title: string; product: string; brief: string; amount: number; currency: string; status: "pending" | "active" | "completed" | "declined" };
export type YtbMessage = { id: string; senderId: string; name: string; avatar: string; original: string; translated: string; at: number; replayId?: string; readBy?: Record<string, boolean>; replyTo?: string[]; quote?: { id: string; name: string; original: string; translated: string } };
export type YtbThread = { id: string; userChannelId: string; peerChannelId: string; messages: YtbMessage[]; memorySummaries?: Record<string, YtbMemorySummary> };
export type YtbGroup = { id: string; channelId: string; userChannelId: string; name: string; avatar: string; members: number; joined: boolean; messages: YtbMessage[]; memorySummaries?: Record<string, YtbMemorySummary> };
export type YtbFanNote = YtbMessage & { channelId: string };
export type YtbEarning = { id: string; channelId: string; kind: "tip" | "business"; amount: number; currency: string; originalAmount: number; originalCurrency: string; rate: number; at: number; withdrawnAt?: number; streamId?: string };
export type YtbState = { channels: YtbChannel[]; streams: YtbStream[]; deals: YtbDeal[]; threads: YtbThread[]; groups: YtbGroup[]; notes: YtbFanNote[]; earnings: YtbEarning[]; fanAvatarUrls: string[]; backgroundId: string | null };

export const YTB_STRANGER_AVATAR = "https://imgbed.heliar.top/i/1b9e462_zSPp67lH_%E9%9F%A9%E5%A5%B3%E9%83%BD%E5%9C%A8%E7%94%A8%E7%9A%84%E6%B3%A8%E9%94%80%E7%B3%BB%E5%A4%B4%E5%83%8F_4_Miseu97_%E6%9D%A5%E8%87%AA%E5%B0%8F%E7%BA%A2%E4%B9%A6%E7%BD%91%E9%A1%B5%E7%89%88.jpg";

const KEY = "ai_phone_ytb_v1";
registerKvMigration(KEY);
export const YTB_UPDATED = "ytb-updated";
export const ytbId = () => `ytb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
export const emptyYtbState = (): YtbState => ({ channels: [], streams: [], deals: [], threads: [], groups: [], notes: [], earnings: [], fanAvatarUrls: [], backgroundId: null });
export function loadYtbState(): YtbState {
  try {
    const value = JSON.parse(kvGet(KEY) || "null") as Partial<YtbState> | null;
    if (!value) return emptyYtbState();
    const next = { ...emptyYtbState(), ...value };
    for (const key of ["channels", "streams", "deals", "threads", "groups", "notes", "earnings", "fanAvatarUrls"] as const) if (!Array.isArray(next[key])) (next as unknown as Record<string, unknown>)[key] = [];
    next.streams = next.streams.map(s => ({ ...s, watchedBy: s.watchedBy || [], leftBy: s.leftBy || [], calls: s.calls || [], totalViewers: s.totalViewers ?? s.viewers, peakViewers: s.peakViewers ?? s.viewers, newSubscribers: s.newSubscribers || 0, lines: s.lines || [], comments: s.comments || [], saved: s.saved === true }));
    const legacy = value as Partial<YtbState> & { dms?: Array<{ id: string; channelId: string; name: string; body: string; at: number }> };
    if (!next.threads.length && legacy.dms?.length) for (const dm of legacy.dms) {
      const peer = makeYtbChannel(dm.id, "npc", dm.name); peer.id = `legacy:${dm.id}`;
      next.channels.push(peer);
      next.threads.push({ id: dm.id, userChannelId: dm.channelId, peerChannelId: peer.id, messages: [{ id: dm.id, senderId: peer.id, name: peer.name, avatar: "", original: dm.body, translated: dm.body, at: dm.at }] });
    }
    next.channels = next.channels.map(c => c.ownerType === "npc" && !c.avatar ? { ...c, avatar: YTB_STRANGER_AVATAR } : c);
    next.threads = next.threads.map(t => ({ ...t, messages: t.messages.map(m => !m.avatar && next.channels.some(c => c.id === m.senderId && c.ownerType === "npc") ? { ...m, avatar: YTB_STRANGER_AVATAR } : m) }));
    next.notes = next.notes.map(n => !n.avatar ? { ...n, avatar: YTB_STRANGER_AVATAR } : n);
    next.groups = next.groups.map(g => ({ ...g, messages: g.messages.map(m => !m.avatar && !next.channels.some(c => c.id === m.senderId) ? { ...m, avatar: YTB_STRANGER_AVATAR } : m) }));
    next.streams = next.streams.map(s => ({ ...s, calls: s.calls.map(c => !c.avatar && !c.channelId ? { ...c, avatar: YTB_STRANGER_AVATAR } : c) }));
    next.deals = next.deals.filter(d => d.status !== "declined");
    return next;
  } catch { return emptyYtbState(); }
}
export function saveYtbState(state: YtbState) {
  kvSet(KEY, JSON.stringify(state));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(YTB_UPDATED));
}
export function makeYtbChannel(ownerId: string, ownerType: YtbChannel["ownerType"], name: string, avatar = ""): YtbChannel {
  return { id: `${ownerType}:${ownerId}`, ownerId, ownerType, name, handle: `@${ownerId.replace(/[^a-z0-9]/gi, "").slice(-14) || "channel"}`, avatar: avatar || (ownerType === "npc" ? YTB_STRANGER_AVATAR : ""), banner: "", description: "", style: "", disclosure: ownerType === "npc" ? "none" : "partial", subscribers: 0, videos: 0, subscribed: ownerType !== "npc", community: false, totalViews: 0, totalNewSubscribers: 0 };
}

export function saveYtbRecording(state: YtbState, id: string, now = Date.now()): YtbState {
  const live = state.streams.find(s => s.id === id);
  if (!live || live.status !== "ended" || live.saved) return state;
  return { ...state,
    streams: state.streams.map(s => s.id === id ? { ...s, saved: true, savedAt: now, summaryDismissed: true } : s),
    channels: state.channels.map(c => c.id === live.channelId ? { ...c, videos: c.videos + 1 } : c),
  };
}
export function discardYtbRecording(state: YtbState, id: string): YtbState {
  return { ...state, streams: state.streams.map(s => s.id === id && s.status === "ended" && !s.saved ? { ...s, summaryDismissed: true } : s) };
}
export function deleteYtbRecording(state: YtbState, id: string): YtbState {
  const live = state.streams.find(s => s.id === id && s.saved);
  if (!live) return state;
  revokeMemorySources([`ytb:${id}`]);
  return { ...state, streams: state.streams.filter(s => s.id !== id),
    threads: state.threads.map(t => ({ ...t, messages: t.messages.filter(m => m.replayId !== id) })),
    channels: state.channels.map(c => c.id === live.channelId ? { ...c, videos: Math.max(0, c.videos - 1) } : c),
  };
}

/** Remove participation and related content without deleting the character or settled wallet history. */
export function deleteYtbChannel(state:YtbState,id:string):YtbState {
 const streamIds=new Set(state.streams.filter(s=>s.channelId===id).map(s=>s.id));
 const threadIds=state.threads.filter(t=>t.peerChannelId===id||t.userChannelId===id).map(t=>t.id);
 const groupIds=state.groups.filter(g=>g.channelId===id||g.userChannelId===id).map(g=>g.id);
 revokeMemorySources([...streamIds,...threadIds,...groupIds].map(i=>`ytb:${i}`));
 return {...state, channels:state.channels.filter(c=>c.id!==id),streams:state.streams.filter(s=>!streamIds.has(s.id)).map(s=>({...s,watchedBy:s.watchedBy.filter(i=>i!==id),leftBy:s.leftBy.filter(i=>i!==id),calls:s.calls.filter(c=>c.channelId!==id)})),deals:state.deals.filter(d=>d.channelId!==id),threads:state.threads.filter(t=>!threadIds.includes(t.id)),groups:state.groups.filter(g=>!groupIds.includes(g.id)),notes:state.notes.filter(n=>n.channelId!==id),earnings:state.earnings.filter(e=>e.channelId!==id),backgroundId:streamIds.has(state.backgroundId||"")?null:state.backgroundId};
}
