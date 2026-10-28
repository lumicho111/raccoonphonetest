"use client";
import {useEffect,useState} from "react";
import {loadPendingCalendarGroups,removePendingCalendarGroup,saveAdjustedPendingGroup} from "@/lib/calendar-storage";
import {loadCharacters} from "@/lib/character-storage";
export function PendingCalendarEvents(){
 const [groups,setGroups]=useState(loadPendingCalendarGroups),[open,setOpen]=useState(false);
 const refresh=()=>setGroups(loadPendingCalendarGroups());
 useEffect(()=>{window.addEventListener("calendar-updated",refresh);window.addEventListener("calendar-pending-updated",refresh);return()=>{window.removeEventListener("calendar-updated",refresh);window.removeEventListener("calendar-pending-updated",refresh);};},[]);
 const name=(id:string)=>loadCharacters().find(c=>c.id===id)?.name||id;
 if(!groups.length)return null;
 return <section style={{margin:12,padding:12,borderRadius:14,background:"var(--c-bg-card,#fff)",color:"var(--c-text,#333)"}}><button onClick={()=>setOpen(!open)}>待调整行程 · {groups.length} 条 {open?"收起":"查看"}</button>{open&&groups.map(g=>{const item=g.owners[0].item;return <div key={g.id} style={{borderTop:"1px solid #aaa4",paddingTop:12,marginTop:12}}><b>{item.title}</b><p>{g.owners.map(o=>name(o.ownerId)).join("、")}</p><small>与已有安排冲突：{g.conflicts.map(c=>{for(const ch of loadCharacters())c=c.replace(ch.id,ch.name);return c;}).join("；")}</small><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>{(["date","startTime","endTime"] as const).map(key=><input key={key} aria-label={key==="date"?"调整日期":key==="startTime"?"调整开始时间":"调整结束时间"} type={key==="date"?"date":"time"} value={item[key]} onChange={e=>setGroups(rows=>rows.map(row=>row.id===g.id?{...row,owners:row.owners.map(o=>({...o,item:{...o.item,[key]:e.target.value}}))}:row))}/>)}<button onClick={()=>{if(!item.date||item.startTime>=item.endTime){alert("请填写有效日期，结束时间须晚于开始时间。");return;}const result=saveAdjustedPendingGroup(g.id,item);refresh();if(result.pending)alert("调整后仍与已有安排冲突，请继续修改。");}}>检查并保存</button><button onClick={()=>{removePendingCalendarGroup(g.id);refresh();}}>删除</button></div></div>;})}</section>;
}
