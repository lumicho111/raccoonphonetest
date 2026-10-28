import { loadCharacters } from "./character-storage";
import { formatZonedPromptTimestamp, getSystemTimeZone } from "./character-time";
import { loadOwnerCalendarPlans } from "./calendar-storage";
import { loadWeverseState } from "./weverse-storage";
import { exchangeWalletAmount, loadWalletState, recordWalletCredit, walletCurrency } from "./wallet-storage";
import { loadYtbState, saveYtbState, type YtbChannel, type YtbEarning, type YtbState, type YtbStream } from "./ytb-storage";

/** Calendar is evaluated in the character's own timezone. No calendar item is created. */
export function ytbAvailability(channel: YtbChannel, now = Date.now()): { free: boolean; reason: string; freeMinutes: number; localTime: string } {
  if (channel.ownerType !== "character") return { free: true, reason: "", freeMinutes: 180, localTime: new Date(now).toLocaleString("zh-CN") };
  const character = loadCharacters().find(c => c.id === channel.ownerId);
  if (!character) return { free: false, reason: "角色已不存在", freeMinutes: 0, localTime: "" };
  const localTime = formatZonedPromptTimestamp(new Date(now), character.timeZone || getSystemTimeZone());
  const localStamp = Date.parse(localTime.replace(" ", "T") + ":00Z");
  let freeMinutes = 180;
  for (const item of loadOwnerCalendarPlans("character", character.id).flatMap(p => p.items)) {
    if (item.kind === "milestone") continue;
    if ((item.busyLevel ?? 3) < 2) continue;
    const start = Date.parse(`${item.date}T${item.startTime}:00Z`);
    let end = Date.parse(`${item.date}T${item.endTime}:00Z`);
    if (end <= start) end += 86400000;
    if (start <= localStamp && localStamp < end) return { free: false, reason: `当前有日程：${item.title}`, freeMinutes: 0, localTime };
    if (start > localStamp) freeMinutes = Math.min(freeMinutes, Math.floor((start - localStamp) / 60000));
  }
  for (const item of loadWeverseState().schedules || []) {
    if (!item.calendarSync || !item.memberCharacterIds.includes(character.id)) continue;
    const end = item.endsAt || item.startsAt + 3600000;
    if (item.startsAt <= now && now < end) return { free: false, reason: `当前有 WVS 日程：${item.title}`, freeMinutes: 0, localTime };
    if (item.startsAt > now) freeMinutes = Math.min(freeMinutes, Math.floor((item.startsAt - now) / 60000));
  }
  return { free: freeMinutes > 0, reason: "", freeMinutes, localTime };
}

export function settledEarning(state: YtbState, channel: YtbChannel, input: Omit<YtbEarning, "amount" | "currency" | "rate">): YtbEarning | null {
  if (channel.ownerType === "npc" || state.earnings.some(e => e.id === input.id)) return null;
  const wallet = loadWalletState(channel.ownerType === "character" ? channel.ownerId : undefined, channel.ownerType === "user" ? channel.ownerId : undefined);
  const currency = wallet.primaryCurrency;
  const amount = exchangeWalletAmount(input.originalAmount, walletCurrency(input.originalCurrency), currency);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { ...input, amount, currency, rate: amount / input.originalAmount };
}

/** Settlement happens once, independent of replay save/discard/delete. */
export function finishYtbStream(state: YtbState, id: string, endedAt = Date.now()): YtbState {
  const live = state.streams.find(s => s.id === id);
  if (!live || live.status !== "live") return state;
  const channel = state.channels.find(c => c.id === live.channelId);
  if (!channel) return state;
  const comments = live.comments.filter(c => c.at <= endedAt);
  const lines = live.lines.filter(line => line.at <= endedAt);
  const earnings = [...state.earnings];
  for (const comment of comments) if (comment.tip) {
    const earning = settledEarning({ ...state, earnings }, channel, { id: `tip:${live.id}:${comment.id}`, channelId: channel.id, streamId: live.id, kind: "tip", originalAmount: comment.tip.amount, originalCurrency: comment.tip.currency, at: endedAt });
    if (earning) earnings.push(earning);
  }
  const deal = state.deals.find(d => d.id === live.linkedDealId && d.status === "active");
  // A linked deal is fulfilled only after live content has actually been advanced.
  const fulfilled = Boolean(deal && live.lastRoundAt && lines.length);
  if (deal && fulfilled) {
    const earning = settledEarning({ ...state, earnings }, channel, { id: `deal:${deal.id}`, channelId: channel.id, streamId: live.id, kind: "business", originalAmount: deal.amount, originalCurrency: deal.currency, at: endedAt });
    if (earning) earnings.push(earning);
  }
  return { ...state, backgroundId: state.backgroundId === id ? null : state.backgroundId,
    streams: state.streams.map(s => s.id === id ? { ...s, comments, lines, calls: s.calls.map(call => ({ ...call, status: "ended" as const })), status: "ended", endedAt, saved: false, summaryDismissed: false } : s),
    channels: state.channels.map(c => c.id === channel.id ? { ...c, totalViews: (c.totalViews || 0) + live.totalViewers, totalNewSubscribers: (c.totalNewSubscribers || 0) + live.newSubscribers } : c),
    deals: state.deals.map(d => d.id === deal?.id && fulfilled ? { ...d, status: "completed" } : d),
    groups: state.groups.map(g => g.channelId === channel.id ? { ...g, members: Math.max(1, Math.min(channel.subscribers || 1, g.members + Math.round(live.newSubscribers * .2) - Math.floor(Math.random() * 3))) } : g), earnings };
}

export function expireYtbStreams(state: YtbState, now = Date.now()): YtbState {
  let result = state;
  for (const stream of state.streams) if (stream.status === "live") {
    const channel = state.channels.find(c => c.id === stream.channelId);
    if (channel?.ownerType === "user") continue;
    if ((stream.endAt && now >= stream.endAt) || (channel && !ytbAvailability(channel, now).free)) result = finishYtbStream(result, stream.id, Math.min(now, stream.endAt || now));
  }
  // A spectator becoming busy stops witnessing new material, even while Youtube is closed.
  const streams = result.streams.map(s => {
    if (s.status !== "live" || !s.visits) return s;
    const leaving = Object.keys(s.visits).filter(id => id !== s.channelId && !s.visits![id].leftAt &&
      result.channels.some(c => c.id === id && c.ownerType === "character" && !ytbAvailability(c, now).free));
    if (!leaving.length) return s;
    return { ...s, visits: Object.fromEntries(Object.entries(s.visits).map(([id,v]) => [id, leaving.includes(id) ? { ...v, leftAt: now } : v])),
      leftBy: [...new Set([...s.leftBy, ...leaving])], calls: s.calls.map(c => c.channelId && leaving.includes(c.channelId) ? { ...c, status: "ended" as const } : c) };
  });
  if (streams.some((s,i) => s !== result.streams[i])) result = { ...result, streams };
  return result;
}

/** One transaction per immutable earning ID; a replay never owns the money. */
export function withdrawYtbIncome(ownerId?: string, userIdentityId?: string): { count: number; amount: number } {
  const state = loadYtbState();
  const channels = state.channels.filter(c => ownerId ? c.ownerType === "character" && c.ownerId === ownerId : c.ownerType === "user" && c.ownerId === (userIdentityId || loadWalletIdentity()));
  const ids = new Set(channels.map(c => c.id));
  let count = 0, amount = 0;
  const earnings = state.earnings.map(e => {
    if (e.withdrawnAt || !ids.has(e.channelId)) return e;
    const channel = channels.find(c => c.id === e.channelId)!;
    const result = recordWalletCredit({ ownerId, userIdentityId: channel.ownerType === "user" ? channel.ownerId : undefined, amount: e.amount, currency: walletCurrency(e.currency), sourceCurrency: loadWalletState(ownerId, channel.ownerType === "user" ? channel.ownerId : undefined).primaryCurrency,
      title: e.kind === "tip" ? "Youtube 直播打赏提现" : "Youtube 商务收益提现", detail: `原币 ${e.originalAmount} ${e.originalCurrency}；直播结算 ${e.amount} ${e.currency}；参考换算率 ${e.rate}。`, category: "Youtube 收益", relatedMessageId: `youtube:${e.id}`, source: "app" });
    if (!result.ok) return e;
    count++; amount += result.transaction?.amount || e.amount;
    return { ...e, withdrawnAt: Date.now() };
  });
  if (count) saveYtbState({ ...state, earnings });
  return { count, amount };
}
import { getActiveUserWalletIdentityId } from "./wallet-storage";
function loadWalletIdentity() { return getActiveUserWalletIdentityId() || "default"; }
