import { loadOwnerCalendarPlans, deleteCalendarScheduleItem } from "./calendar-storage";
import { applyGeneratedCalendarRange } from "./calendar-storage";
import { deleteCalendarItemsByExternalId, upsertCalendarScheduleItem } from "./calendar-storage";
import { formatIsoDate, getWeekStartIso } from "./calendar-utils";
import { loadWeverseState, upsertWeverseScheduleItem, deleteWeverseScheduleItem, type WeverseScheduleItem } from "./weverse-storage";

function toDateParts(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: formatIsoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function syncWeverseScheduleItemToCalendar(item: WeverseScheduleItem): void {
  if (item.visibility !== "public") return;
  const start = toDateParts(item.startsAt);
  const end = toDateParts(item.endsAt || item.startsAt + 60 * 60 * 1000);
  const endTime = end.date === start.date && end.time > start.time ? end.time : "23:59";
  const rows=item.memberCharacterIds.map(characterId=>({ownerId:characterId,items:[{
    id:loadOwnerCalendarPlans("character",characterId).flatMap(p=>p.items).find(i=>i.externalId===item.id||`cal_${item.communityId}_${i.sharedGroupId||i.id}`===item.id)?.id||`wvs_${item.id}_${characterId}`,date:start.date,weekday:"",startTime:start.time,endTime,location:item.location||"",title:item.title,colorKey:"blue" as const,source:"weverse" as const,externalSource:"weverse" as const,externalId:item.id,sharedGroupId:`wvs_${item.id}`,sharedCharacterIds:item.memberCharacterIds,visibility:"public" as const,kind:item.calendarSync?"event" as const:"milestone" as const,wvsType:item.type,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  }]}));
  // Updating an existing projection replaces its linked calendar copy.

  const result=applyGeneratedCalendarRange(rows,start.date,start.date,"supplement");
  if(result.pending&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("calendar-pending-updated"));
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
export function syncCalendarProjectionBackToWeverse(externalId: string, patch: { date: string; startTime: string; endTime: string; location: string; title: string }): void {
  const state = loadWeverseState();
  const current = state.schedules.find((item) => item.id === externalId);
  if (!current) return;
  const startsAt = new Date(`${patch.date}T${patch.startTime}:00`).getTime();
  const endsAt = new Date(`${patch.date}T${patch.endTime}:00`).getTime();
  const next: WeverseScheduleItem = {
    ...current,
    title: patch.title.trim() || current.title,
    location: patch.location.trim() || undefined,
    startsAt: Number.isFinite(startsAt) ? startsAt : current.startsAt,
    endsAt: Number.isFinite(endsAt) && endsAt > startsAt ? endsAt : current.endsAt,
    updatedAt: Date.now(),
  };
  upsertWeverseScheduleItem(next);
  syncWeverseScheduleItemToCalendar(next);
}
