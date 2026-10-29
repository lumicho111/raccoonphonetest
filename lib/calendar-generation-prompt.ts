import { loadSchedulePrompts } from "./schedule-prompt-settings";
export const CALENDAR_SCHEDULE_CONTRACT = "每项标visibility(public/private)与kind(event/milestone)。event实际占用时间，milestone为上线或播出等不占用时间的节点。公开日程标题和时间提前可见，contentDescription用一两句确定具体内容，到publicAt才解锁；publicAt留空按日程开始时间解锁，使用角色当地时间。location可留空或填地点／发布平台。busyLevel填1立刻回复、2短暂回复、3忙时等待、4无法看手机，节点填1。私人公共场景可填一句encounterScene，仅写路人能短暂看见的动作与宽泛场所。按指定结构输出。";
export function calendarGenerationPrompt() { return loadSchedulePrompts().calendar + "\n" + CALENDAR_SCHEDULE_CONTRACT; }
// Kept as a default for older callers; engines load the saved prompt at request time.
export const CALENDAR_LIFE_GENERATION_PROMPT = calendarGenerationPrompt();
