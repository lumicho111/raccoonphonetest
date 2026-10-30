import { scheduleContentUnlockAt } from "./schedule-public-content";
import { calendarWallTimeToInstant } from "./calendar-time";
import {loadCharacters} from "./character-storage";
import {getSystemTimeZone} from "./character-time";
import { kvGet, kvSet } from "./kv-db";
import type { CalendarScheduleItem, CalendarWeekPlan } from "./calendar-types";
import type { WeverseState, WeverseScheduleItem } from "./weverse-storage";
import { getWeekStartIso, getWeekdayLabel } from "./calendar-utils";
const CAL="ai_phone_calendar_plans_v1", WVS="ai_phone_weverse_state_v1", MIG="ai_phone_calendar_master_v1";
let running=false;
export const isPublicCalendarItem=(item:CalendarScheduleItem, now=Date.now())=>item.visibility==="public";
/** Calendar is authoritative. Old unclassified phone events remain private. */
export function reconcileCalendarMaster(){
 if(typeof window==="undefined"||running)return;running=true;
 try{
  const store=JSON.parse(kvGet(CAL)||'{"plans":[]}') as {plans:CalendarWeekPlan[]};
  const raw=kvGet(WVS);if(!raw){kvSet(MIG,"1");return;}
  const wvs=JSON.parse(raw) as WeverseState;
  if(!kvGet(MIG)){
   for(const s of wvs.schedules||[])for(const ownerId of s.memberCharacterIds){
    const start=new Date(s.startsAt),end=new Date(s.endsAt||s.startsAt+3600000);
    const date=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`;
    const weekStart=getWeekStartIso(start);let plan=store.plans.find(p=>p.ownerType==="character"&&p.ownerId===ownerId&&p.weekStart===weekStart);
    if(!plan){plan={id:`master_${ownerId}_${weekStart}`,ownerType:"character",ownerId,weekStart,items:[],updatedAt:new Date().toISOString()};store.plans.push(plan);}
    const old=plan.items.find(i=>i.externalId===s.id);
    const fields={visibility:s.visibility==="public"?"public" as const:"private" as const,kind:s.calendarSync?"event" as const:"milestone" as const,publicAt:s.publicAt ? new Date(s.publicAt).toISOString() : undefined,contentDescription:s.contentDescription,wvsType:s.type};
    if(old)Object.assign(old,fields);else plan.items.push({id:`wvs_${s.id}_${ownerId}`,date,weekday:getWeekdayLabel(date),startTime:`${String(start.getHours()).padStart(2,"0")}:${String(start.getMinutes()).padStart(2,"0")}`,endTime:end.toDateString()===start.toDateString()?`${String(end.getHours()).padStart(2,"0")}:${String(end.getMinutes()).padStart(2,"0")}`:"23:59",title:s.title,location:s.location||"",colorKey:"blue",source:"weverse",externalSource:"weverse",externalId:s.id,...fields,createdAt:new Date(s.createdAt).toISOString(),updatedAt:new Date().toISOString()});
   }
   kvSet(CAL,JSON.stringify(store));kvSet(MIG,"1");
  }
  const schedules:WeverseScheduleItem[]=[];
  for(const community of wvs.communities||[])for(const plan of store.plans){
   if(plan.ownerType==="user" ? !community.userIdentityId : !community.memberCharacterIds.includes(plan.ownerId))continue;
   for(const item of plan.items){
    if(!isPublicCalendarItem(item))continue;
    const identity=item.externalId||item.sharedGroupId||item.id;
    const id=item.externalId||`cal_${community.id}_${identity}`;
    const existing=schedules.find(s=>s.id===id);if(existing){existing.memberCharacterIds.push(plan.ownerId);continue;}
    schedules.push({id,communityId:community.id,title:item.title,contentDescription:item.contentDescription,publicAt:item.publicAt ? scheduleContentUnlockAt(item,loadCharacters().find(c=>c.id===plan.ownerId)?.timeZone||getSystemTimeZone()) : undefined,type:item.wvsType||(item.kind==="milestone"?"release":"performance"),visibility:"public",calendarSync:item.kind!=="milestone",busyLevel:item.kind==="milestone"?1:(item.busyLevel||3),startsAt:calendarWallTimeToInstant(item.date,item.startTime,loadCharacters().find(c=>c.id===plan.ownerId)?.timeZone||getSystemTimeZone()),endsAt:calendarWallTimeToInstant(item.date,item.endTime,loadCharacters().find(c=>c.id===plan.ownerId)?.timeZone||getSystemTimeZone()),location:item.location,memberCharacterIds:[plan.ownerType==="user" ? `user:${community.userIdentityId}` : plan.ownerId],source:"manual",createdAt:new Date(item.createdAt).getTime(),updatedAt:new Date(item.updatedAt).getTime()});
   }
  }
  // Only public projections are exposed by WVS; private originals now live in Calendar.
  if(JSON.stringify(wvs.schedules)!==JSON.stringify(schedules)){kvSet(WVS,JSON.stringify({...wvs,schedules}));window.dispatchEvent(new CustomEvent("weverse-updated"));}
 }finally{running=false;}
}
