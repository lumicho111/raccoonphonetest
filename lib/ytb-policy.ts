import { loadCharacterWorldGroups } from "./character-world-storage";
import type { YtbChannel, YtbState, YtbStream } from "./ytb-storage";

/** A relationship line is required; merely sharing a world is insufficient. */
export function ytbKnowEachOther(a: YtbChannel, b: YtbChannel): boolean {
  if (a.id === b.id) return true;
  if (a.ownerType === "npc" || b.ownerType === "npc") return false;
  const node = (c: YtbChannel) => c.ownerType === "user" ? `user:${c.ownerId}` : c.ownerId;
  const first = node(a), second = node(b);
  return loadCharacterWorldGroups().some(g => g.relations.some(r =>
    (r.fromCharacterId === first && r.toCharacterId === second) || (r.fromCharacterId === second && r.toCharacterId === first)));
}
/** Directional: revealing A to B never reveals B to A or to the public. */
export function ytbRecognizes(subject: YtbChannel | undefined, viewer: YtbChannel): boolean {
  if (!subject || subject.ownerType === "npc") return false;
  if (subject.id === viewer.id) return true;
  if (subject.disclosure !== "none") return true;
  return Boolean(subject.disclosedTo?.includes(viewer.ownerId) && (subject.ownerType === "user" || ytbKnowEachOther(subject, viewer)));
}
export function ytbCanVisit(host: YtbChannel, viewer: YtbChannel): boolean {
  return viewer.ownerType === "character" && host.id !== viewer.id && viewer.subscribed &&
    ytbKnowEachOther(host, viewer) && ytbRecognizes(host, viewer);
}
export function ytbIdentityContext(state: YtbState, viewer: YtbChannel): string {
  return state.channels.filter(c => c.id !== viewer.id && c.ownerType !== "npc").map(c =>
    ytbRecognizes(c, viewer)
      ? `${c.name} ${c.handle}：你知道该账号对应${c.ownerType === "user" ? "与你交互的用户" : "现实中角色"}${c.ownerType === "character" ? `（角色ID ${c.ownerId}）` : ""}。`
      : `${c.name} ${c.handle}：你不知道该账号的真实主人；只能称呼频道网名，不能关联现实身份、关系或私人往事。`).join("\n");
}
export function ytbEnterStream(stream: YtbStream, viewer: YtbChannel, state: YtbState, at = Date.now(), replay = false): YtbStream {
  if (stream.visits?.[viewer.id]) return stream;
  const identities = Object.fromEntries(state.channels.map(c => [c.id, ytbRecognizes(c, viewer)]));
  return { ...stream, watchedBy: [...new Set([...stream.watchedBy, viewer.id])],
    visits: { ...stream.visits, [viewer.id]: { enteredAt: at, replay, identities } },
    ...(replay ? { watchedAt: { ...stream.watchedAt, [viewer.id]: at } } : {}) };
}
export function ytbReadMessages<T extends { senderId: string; readBy?: Record<string, boolean> }>(messages: T[], viewer: YtbChannel, state: YtbState): T[] {
  const eligible = new Set(messages.slice(-24));
  return messages.map(m => !eligible.has(m) ? m : ({ ...m, readBy: { ...m.readBy, [viewer.id]: m.readBy?.[viewer.id] ?? ytbRecognizes(state.channels.find(c => c.id === m.senderId), viewer) } }));
}
