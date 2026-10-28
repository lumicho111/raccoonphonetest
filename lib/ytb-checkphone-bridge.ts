import {loadYtbState,type YtbState} from "./ytb-storage";
import {ytbFingerprint} from "./ytb-memory";
import type {CheckPhoneYoutubePayload,CheckPhoneYoutubeHistoryVideo} from "./checkphone-config";
export type LiveFeeling={fingerprint:string;stateNote:string;feeling:string};
const duration=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000));return s>=3600?`${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`:`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;};
/** Only recent saved streams actually witnessed by this role. No full snapshot/transcript is sent. */
export function recentYtbLiveRecords(characterId:string,state:YtbState=loadYtbState()){
 const viewer=state.channels.find(c=>c.ownerType==="character"&&c.ownerId===characterId);if(!viewer)return [];
 return state.streams.flatMap(live=>{
  const host=state.channels.find(c=>c.id===live.channelId),visit=live.visits?.[viewer.id];
  if(!host||host.id===viewer.id||live.status!=="ended"||!live.saved||!visit||!live.endedAt)return [];
  const from=visit.replay?live.startedAt:Math.max(live.startedAt,visit.enteredAt),to=visit.replay?live.endedAt:Math.min(visit.leftAt??live.endedAt,live.endedAt);
  if(to<=from)return [];
  const lines=live.lines.filter(l=>l.at>=from&&l.at<=to);
  const ownComments=live.comments.filter(c=>c.channelId===viewer.id&&c.at>=from&&c.at<=to);
  const onCall=live.calls.some(c=>c.channelId===viewer.id&&c.at>=from&&c.at<=to&&c.status!=="waiting");
  const interaction=onCall?"连线":ownComments.length?"评论":"围观";
  const tag=`${visit.replay?"分享后观看":"自行观看"} · ${interaction}`;
  // Sample evenly so a long show doesn't become an entire transcript in a generation request.
  const sample=lines.length<=8?lines:Array.from({length:8},(_,i)=>lines[Math.floor(i*(lines.length-1)/7)]);
  const brief=sample.map(l=>`${l.kind==="action"?"动作":"发言"}：${l.original.slice(0,120)}`).join("；");
  const witnessed=brief+(ownComments.length?`；角色本人评论：${ownComments.slice(-2).map(c=>c.original.slice(0,100)).join("；")}`:"");
  const fingerprint=ytbFingerprint(JSON.stringify({from,to,title:live.title,lines:lines.map(l=>[l.id,l.original]),ownComments:ownComments.map(c=>[c.id,c.original])}));
  const at=live.watchedAt?.[viewer.id]||to;
  const row:CheckPhoneYoutubeHistoryVideo={id:`native-live:${live.id}`,title:[live.title,live.titleTranslated].filter(Boolean).join(" | "),channelName:host.name,createdAt:new Date(at).toISOString(),durationLabel:duration(live.endedAt-live.startedAt),playCount:live.totalViewers,progressLabel:`${duration(to-from)} / ${duration(live.endedAt-live.startedAt)}`,stateNote:tag,feeling:"刷新后生成观看感想",cover:live.cover,liveId:live.id,liveTag:tag};
  return [{id:live.id,fingerprint,row,brief:witnessed.slice(0,1400),at}];
 }).sort((a,b)=>b.at-a.at).slice(0,4);
}
export function ytbCheckPhonePrompt(characterId:string){
 const rows=recentYtbLiveRecords(characterId);
 if(!rows.length)return "YouTube普通视频仍按人设兴趣生成。没有已确认看过的直播，禁止编造与用户的直播互动。";
 return `普通观看记录、稍后观看、喜欢的视频沿用原格式生成。下列是实际看过的直播，不得当作普通虚构视频重写，也不得新增直播或扩充未看到的内容。这里只提供该角色实际观看范围的少量片段，不代表完整直播；不得认出片段中未公开的真实身份。对每条写简短的当时状态和私人感想，不自动发言或写回记忆。必须在原三个分区之后另附：\n#直播感想\n##视频1\n[直播ID]实际id\n[指纹]原样指纹\n[当时状态]一两句\n[感受]一两句，贴合角色，不能只是复述内容\n实际记录：${JSON.stringify(rows.map(r=>({id:r.id,fingerprint:r.fingerprint,title:r.row.title,host:r.row.channelName,tag:r.row.liveTag,duration:r.row.durationLabel,watched:r.row.progressLabel,brief:r.brief})))}`;
}
export function parseLiveFeelings(text:string):Record<string,LiveFeeling>{
 const section=text.split(/^#\s*直播感想\s*$/m)[1]||"",result:Record<string,LiveFeeling>={};
 for(const block of section.split(/^##\s*视频\d+\s*$/m)){
  const fields=Object.fromEntries([...block.matchAll(/^\[([^\]]+)\]\s*(.*)$/gm)].map(m=>[m[1],m[2].trim()]));
  if(fields['直播ID']&&fields['指纹']&&fields['感受'])result[fields['直播ID']]={fingerprint:fields['指纹'],stateNote:(fields['当时状态']||"").slice(0,400),feeling:fields['感受'].slice(0,500)};
 }return result;
}
export function projectCheckPhoneYoutube(characterId:string,payload:CheckPhoneYoutubePayload|null,state:YtbState=loadYtbState()):CheckPhoneYoutubePayload|null{
 const channel=state.channels.find(c=>c.ownerType==="character"&&c.ownerId===characterId);
 if(!payload&&!channel)return null;
 const records=recentYtbLiveRecords(characterId,state);
 const liveRows=records.map(r=>{const f=payload?.liveFeelings?.[r.id];return f?.fingerprint===r.fingerprint?{...r.row,stateNote:`${r.row.liveTag}。${f.stateNote}`,feeling:f.feeling}:r.row;});
 return {...payload,headerTitle:"YouTube",headerSubtitle:payload?.headerSubtitle||"History, Watch later, Liked videos",profile:channel?{name:channel.name,handle:channel.handle,bio:channel.description,lastActiveAt:records[0]?.row.createdAt||"",avatar:channel.avatar}:payload?.profile,watchHistory:[...liveRows,...(payload?.watchHistory||[]).filter(v=>!v.id.startsWith("native-live:"))].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)),watchLater:payload?.watchLater||[],likedVideos:payload?.likedVideos||[]};
}
