import {worldlineTimeLabel} from "./worldline-event-time";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";

const KEY = "ai_phone_worldline_v1";
registerKvMigration(KEY);

export type WorldlineAccess = "witnessed" | "heard" | "public";
export type WorldlineEvent = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  endsAt?: string;
  visibility: "private" | "public";
  category: string;
  locked: boolean;
  people: Record<string, { access: WorldlineAccess; perspective: string }>;
  createdAt: string;
  updatedAt: string;
};
/** Visibility and participant count classify the record; personal perspectives stay per character. */
export function isSharedWorldlineEvent(event: Pick<WorldlineEvent,"visibility"|"people">):boolean {
  return event.visibility === "public" || Object.keys(event.people || {}).length > 1;
}
export type WorldlineArchiveEntry = { id: string; title: string; content: string; updatedAt: string };
export type WorldlineArchiveCategory = { id: string; name: string; entries: WorldlineArchiveEntry[] };
export type WorldlineProgress = { id: string; text: string; recordedAt: string };
export type Worldline = {
  id: string;
  name: string;
  /** Only shown in the editor, never sent to a model. */
  note?: string;
  /** Missing keys are enabled, except adventure which starts isolated. */
  appBindings?: Record<string, boolean>;
  background: string;
  currentState: string;
  archive: WorldlineArchiveCategory[];
  progressHistory: WorldlineProgress[];
  characterIds: string[];
  events: WorldlineEvent[];
  createdAt: string;
  updatedAt: string;
};
export type WorldlineState = { worlds: Worldline[]; activeId: string | null };

export function activeWorldline(state = loadWorldlineState()): Worldline | null {
  return state.worlds.find(world => world.id === state.activeId) ?? state.worlds[0] ?? null;
}

export function worldlineEnabledForApp(world: Worldline, appId: string): boolean {
  const normalized = appId.startsWith("custom_app:") ? appId : appId === "mapmode" ? "adventure" : appId;
  return world.appBindings?.[normalized] ?? (normalized !== "adventure" && normalized !== "worldline");
}

/** Shared facts are assembled afresh for every generation; local notes are deliberately omitted. */
export function worldlineContextForApp(appId: string, options?: { publicEvents?: boolean; focusText?: string }): string {
  const world = activeWorldline();
  if (!world || !worldlineEnabledForApp(world, appId)) return "";
  if (["theqoo", "twitter", "xiaohongshu"].includes(appId)) return publicPlatformWorldlineContext(world, options);
  const archive = (world.archive || []).flatMap(group => group.entries.map(entry => `${group.name} / ${entry.title}：${entry.content}`));
  const history = (world.progressHistory || []).slice(0, -1).map(progress => `${progress.recordedAt}：${progress.text}`);
  const current = world.progressHistory?.at(-1)?.text || world.currentState;
  const publicEvents = options?.publicEvents ? world.events.filter(event => event.visibility === "public")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map(event => `${worldlineTimeLabel(event,true)} ${event.title}：${event.detail}`) : [];
  return [
    `【世界线：${world.name}】`,
    archive.length ? `世界档案（既定规则）：\n${archive.join("\n")}` : "",
    history.length ? `已发生的公共历史（不能因进度更新而遗忘）：\n${history.join("\n")}` : "",
    current?.trim() ? `当前公共进度（全体角色已知）：${current.trim()}` : "",
    publicEvents.length ? `可公开引用的事件：\n${publicEvents.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

export function loadWorldlineState(): WorldlineState {
  try {
    const value = JSON.parse(kvGet(KEY) || "null") as WorldlineState | null;
    if (value && Array.isArray(value.worlds)) return {
      worlds: value.worlds.map(world => ({ ...world, archive: Array.isArray(world.archive) ? world.archive : world.background?.trim() ? [{ id: `legacy-${world.id}`, name: "原有背景与规则", entries: [{ id: `legacy-entry-${world.id}`, title: "基础设定", content: world.background, updatedAt: world.updatedAt || world.createdAt }] }] : [], progressHistory: Array.isArray(world.progressHistory) ? world.progressHistory : world.currentState?.trim() ? [{ id: `legacy-progress-${world.id}`, text: world.currentState, recordedAt: world.updatedAt || world.createdAt }] : [] })),
      activeId: value.activeId ?? null,
    };
  } catch { /* Corrupt state falls back to empty without overwriting it. */ }
  return { worlds: [], activeId: null };
}
export function saveWorldlineState(state: WorldlineState): void {
  kvSet(KEY, JSON.stringify(state));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("worldline-updated"));
}
export function worldlineEventsForCharacter(characterId: string): Array<{ world: Worldline; event: WorldlineEvent; access: WorldlineAccess; perspective: string }> {
  const active = activeWorldline();
  return (active ? [active] : []).flatMap(world => world.events.flatMap(event => {
    const knowledge = event.people?.[characterId];
    if (knowledge && (knowledge.access !== "public" || event.visibility === "public")) return [{ world, event, ...knowledge }];
    return event.visibility === "public" ? [{ world, event, access: "public" as const, perspective: "" }] : [];
  }));
}
export function worldlinePublicEvents(category?: string): Array<{ world: Worldline; event: WorldlineEvent }> {
  const active = activeWorldline();
  return (active ? [active] : []).flatMap(world => world.events
    .filter(event => event.visibility === "public" && (!category || !event.category || event.category === category))
    .map(event => ({ world, event })));
}

/** Public feeds select present-day subjects; historical facts serve continuity checks. */
function publicPlatformWorldlineContext(world: Worldline, options?: { publicEvents?: boolean; focusText?: string }): string {
  const current = world.progressHistory?.at(-1)?.text || world.currentState || "";
  const query = `${current} ${options?.focusText || ""}`;
  const terms = new Set((query.match(/[a-zA-Z0-9_]{3,}|[\u3400-\u9fff]{2,}/g) || []).flatMap(word => /[\u3400-\u9fff]/.test(word) ? Array.from({length:Math.max(0,word.length-1)},(_,i)=>word.slice(i,i+2)) : [word.toLowerCase()]));
  const score = (text: string) => { const normalized=text.toLowerCase(); return [...terms].filter(term=>normalized.includes(term)).length; };
  const choose = (rows: string[], count: number, max: number) => rows.map((text,index)=>({text,index,rank:score(text)})).filter(row=>row.rank>=2).sort((a,b)=>b.rank-a.rank||b.index-a.index).slice(0,count).map(row=>row.text.slice(0,650)).join("\n").slice(0,max);
  const archive = (world.archive || []).flatMap(group=>group.entries.flatMap(entry=>entry.content.split(/\n+/).filter(Boolean).map(line=>`${group.name} / ${entry.title}：${line}`)));
  const history = (world.progressHistory || []).slice(0,-1).map(row=>`${row.recordedAt}：${row.text}`);
  const relevantArchive = choose(archive,4,1800);
  const relevantHistory = choose(history,3,1800);
  const now = Date.now();
  const events = options?.publicEvents ? world.events.filter(event=>event.visibility==="public" && Date.parse(event.occurredAt)<=now).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)) : [];
  const recentEvents = events.filter(event=>now-Date.parse(event.endsAt||event.occurredAt)<=14*86400000).slice(0,5).map(event=>`${worldlineTimeLabel(event,true)} ${event.title}：${event.detail.slice(0,350)}`);
  const olderEvents = choose(events.filter(event=>!recentEvents.some(line=>line.includes(`${worldlineTimeLabel(event,true)} ${event.title}：`))).map(event=>`${worldlineTimeLabel(event,true)} ${event.title}：${event.detail}`),2,1000);
  return [
    `【世界线：${world.name}｜公开平台参考】`,
    "选题以平台自身的日常生态为主，结合最新公开进展与仍有余韵的近期事件。背景与历史用于理解设定、核对相关事实；叙述沿用最新状态与既有因果。",
    current.trim() ? `当前公共进度：${current.trim().slice(0,3000)}` : "",
    recentEvents.length ? `近期已公开事件：\n${recentEvents.join("\n")}` : "",
    relevantHistory || olderEvents ? `相关历史事实（话题涉及时核对前因）：\n${[relevantHistory,olderEvents].filter(Boolean).join("\n")}` : "",
    relevantArchive ? `相关背景常识（理解设定用）：\n${relevantArchive}` : "",
  ].filter(Boolean).join("\n\n");
}
