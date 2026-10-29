import { scheduleContentUnlockAt } from "./schedule-public-content";
import { calendarWallTimeToInstant } from "./calendar-time";
import { loadCharacters } from "./character-storage";
import { formatZonedPromptTimestamp, getSystemTimeZone } from "./character-time";
import { loadOwnerCalendarPlans, deleteCalendarScheduleItem } from "./calendar-storage";
import { applyGeneratedCalendarRange } from "./calendar-storage";
import { deleteCalendarItemsByExternalId, upsertCalendarScheduleItem } from "./calendar-storage";
import { formatIsoDate, getWeekStartIso } from "./calendar-utils";
import { loadWeverseState, upsertWeverseScheduleItem, deleteWeverseScheduleItem, type WeverseScheduleItem } from "./weverse-storage";

function toDateParts(ts:number,zone:string){const value=formatZonedPromptTimestamp(new Date(ts),zone);return {date:value.slice(0,10),time:value.slice(11,16)};}

export function syncWeverseScheduleItemToCalendar(item: WeverseScheduleItem) {
  if (item.visibility !== "public") return {saved:0,pending:0};
  const rows=item.memberCharacterIds.map(characterId=>{
    const zone=loadCharacters().find(c=>c.id===characterId)?.timeZone||getSystemTimeZone();
    const start=toDateParts(item.startsAt,zone),end=toDateParts(item.endsAt||item.startsAt+3600000,zone);
    const endTime=end.date===start.date&&end.time>start.time?end.time:"23:59";
    const existing=loadOwnerCalendarPlans("character",characterId).flatMap(p=>p.items).find(i=>i.externalId===item.id||`cal_${item.communityId}_${i.sharedGroupId||i.id}`===item.id);
    return {ownerId:characterId,items:[{id:existing?.id||`wvs_${item.id}_${characterId}`,date:start.date,weekday:"",startTime:start.time,endTime,location:item.location||"",title:item.title,contentDescription:item.contentDescription,publicAt:item.publicAt ? new Date(item.publicAt).toISOString() : undefined,colorKey:"blue" as const,source:"weverse" as const,externalSource:"weverse" as const,externalId:existing?.externalId||item.id,sharedGroupId:existing?.sharedGroupId||`wvs_${item.id}`,sharedCharacterIds:item.memberCharacterIds,visibility:"public" as const,kind:item.calendarSync?"event" as const:"milestone" as const,wvsType:item.type,busyLevel:item.calendarSync?(item.busyLevel||3):1,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}]};
  });
  // Updating an existing projection replaces its linked calendar copy.

  const result=applyGeneratedCalendarRange(rows,rows.map(r=>r.items[0].date).sort()[0]||"",rows.map(r=>r.items[0].date).sort().at(-1)||"","supplement");
  if(result.pending&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("calendar-pending-updated"));
  return result;
}

export function removeWeverseScheduleItemEverywhere(itemId: string): void {
  const matched=loadWeverseState().schedules.find(s=>s.id===itemId);
  if(matched)for(const ownerId of matched.memberCharacterIds)for(const plan of loadOwnerCalendarPlans("character",ownerId))for(const i of plan.items){if(i.externalId===itemId||`cal_${matched.communityId}_${i.sharedGroupId||i.id}`===itemId)deleteCalendarScheduleItem("character",ownerId,plan.weekStart,i.id);}
  deleteCalendarItemsByExternalId("weverse", itemId);
  deleteWeverseScheduleItem(itemId);
}

/**
 * 手机日历编辑了一个 WVS 投影时，把改动回写到 WVS 主数据；同一 Community 的其它成员投影随后重建。
 */
export function syncCalendarProjectionBackToWeverse(externalId: string, patch: { date: string; startTime: string; endTime: string; location: string; title: string; contentDescription?: string; publicAt?: string }): void {
  const state = loadWeverseState();
  const current = state.schedules.find((item) => item.id === externalId);
  if (!current) return;
  const zone = loadCharacters().find(c=>c.id===current.memberCharacterIds[0])?.timeZone||getSystemTimeZone();
  const startsAt = calendarWallTimeToInstant(patch.date,patch.startTime,zone);
  const endsAt = calendarWallTimeToInstant(patch.date,patch.endTime,zone);
  const next: WeverseScheduleItem = {
    ...current,
    title: patch.title.trim() || current.title,
    contentDescription: patch.contentDescription,
    publicAt: patch.publicAt ? scheduleContentUnlockAt({...patch,startsAt},zone) : undefined,
    location: patch.location.trim() || undefined,
    startsAt: Number.isFinite(startsAt) ? startsAt : current.startsAt,
    endsAt: Number.isFinite(endsAt) && endsAt > startsAt ? endsAt : current.endsAt,
    updatedAt: Date.now(),
  };
  upsertWeverseScheduleItem(next);
  syncWeverseScheduleItemToCalendar(next);
}
