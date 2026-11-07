import {ytbVideoProjectionEntries} from './ytb-video-context';
import { loadCharacters } from "./character-storage";
import { resolveUserIdentity } from "./settings-storage";
import { loadYtbState, type YtbState, type YtbMemorySummary, type YtbMessage } from "./ytb-storage";

export type YtbMemorySource = { kind: "stream" | "thread" | "group"; id: string; channelId: string; fingerprint: string; text: string; at: number; cached?: YtbMemorySummary; shared?: boolean; cacheKey?: string };
export function ytbFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}
/** Sources use only witnessed content. Unknown accounts remain channel identities. */
export function ytbMemorySources(state: YtbState, characterId: string, userId?: string): YtbMemorySource[] {
  const viewer = state.channels.find(c => c.ownerType === "character" && c.ownerId === characterId);
  if (!viewer) return [];
  const result: YtbMemorySource[] = [];
  const label = (id?: string, known = false, fallback = "网友") => {
    const c = state.channels.find(c => c.id === id);
    if (!c) return fallback;
    if (c.id === viewer.id) return `该角色（频道名${c.name}）`;
    return c.ownerType === "user" && known ? `用户（频道名${c.name}）` : `账号${c.name} ${c.handle}${known ? `（身份已知：${loadCharacters().find(p=>p.id===c.ownerId)?.name||c.name}）` : "（仅知网名，不得关联真人）"}`;
  };
  const add = (kind: YtbMemorySource["kind"], id: string, heading: string, rows: string[], at: number, cached?: YtbMemorySummary, shared = false, cacheKey = viewer.id) => {
    if (!rows.length) return;
    const text = `${heading}\n${rows.join("\n")}`;
    result.push({ kind, id, channelId: viewer.id, fingerprint: ytbFingerprint(text), text, at, cached, shared, cacheKey });
  };
  for(const live of state.streams){
   if(!live.saved||live.status!=="ended")continue;
   const own=live.channelId===viewer.id,visit=live.visits?.[viewer.id];if(!own&&!visit)continue;
   const after=own||visit?.replay?-Infinity:visit!.enteredAt,until=visit?.leftAt??live.endedAt??Infinity;
   const lines=live.lines.filter(l=>l.at>=after&&l.at<=until);
   const personal:string[]=[],shared:string[]=[];const used=new Set<string>();let sampled=0;
   for(const c of live.comments.filter(c=>c.at>=after&&c.at<=until).sort((a,b)=>ytbFingerprint(a.id).localeCompare(ytbFingerprint(b.id)))){
    const responses=lines.filter(l=>l.replyTo?.includes(c.id));
    const involved=c.channelId===viewer.id||responses.some(l=>(l.speakerId||live.channelId)===viewer.id);
    const noticed=own&&!involved&&sampled<2;
    if(!involved&&!noticed)continue;if(noticed)sampled++;
    const other=c.channelId===viewer.id?live.channelId:c.channelId;
    const snap=responses[0]?.identitySnapshot||c.identitySnapshot;
    const mutual=Boolean(other&&snap?.[viewer.id]?.[other]&&snap?.[other]?.[viewer.id]);
    const rows=[`${noticed?"留意到的评论（未互动）":"评论互动"}：${label(c.channelId,Boolean(snap?.[viewer.id]?.[c.channelId||""]),c.name)}：${c.original}`,...responses.map(l=>`${label(l.speakerId||live.channelId,Boolean(snap?.[viewer.id]?.[l.speakerId||live.channelId]))}回复：${l.original}`)];
    (involved&&responses.length&&mutual?shared:personal).push(...rows);responses.forEach(l=>used.add(l.id));
   }
   for(let i=0;i<lines.length;i++){
    const l=lines[i],speaker=l.speakerId||live.channelId;
    if(l.kind!=="speech"||speaker===live.channelId||!(own||speaker===viewer.id))continue;
    if(!live.calls.some(c=>c.channelId===speaker&&c.at<=l.at))continue;
    const other=own?speaker:live.channelId,snap=l.identitySnapshot;
    const mutual=Boolean(snap?.[viewer.id]?.[other]&&snap?.[other]?.[viewer.id]);
    const dest=mutual?shared:personal;
    if(!used.has(l.id)){dest.push(`连线发言：${label(speaker,Boolean(snap?.[viewer.id]?.[speaker]))}：${l.original}`);used.add(l.id);}
    const reply=lines[i+1];if(reply&&reply.kind==="speech"&&(reply.speakerId||live.channelId)===live.channelId&&!used.has(reply.id)){dest.push(`主播回应：${reply.original}`);used.add(reply.id);}
   }
   const heading=`直播《${live.title}》实际留意或参与的片段，不含钱包入账`;const at=live.endedAt||live.startedAt;
   add("stream",live.id,heading+"【共同互动】",shared,at,live.memorySummaries?.[`${viewer.id}:shared`],true,`${viewer.id}:shared`);
   add("stream",live.id,heading+"【个人互动与评论印象】",personal,at,live.memorySummaries?.[`${viewer.id}:personal`],false,`${viewer.id}:personal`);
  }
  const conversationSources=(kind:"thread"|"group", item:{id:string;messages:YtbMessage[];memorySummaries?:Record<string,YtbMemorySummary>})=>{
    const shared:string[]=[],personal:string[]=[];
    const used=new Set<string>();
    for(let i=0;i<item.messages.length;i++){
      const m=item.messages[i];if(m.senderId!==viewer.id)continue;
      const prior=item.messages.slice(0,i).filter(p=>p.senderId!==viewer.id&&(m.replyTo?.includes(p.id)||m.quote?.id===p.id)).at(-1)||item.messages.slice(0,i).filter(p=>p.senderId!==viewer.id).at(-1);
      if(!prior)continue;
      const snap=m.identitySnapshot,mutual=Boolean(snap?.[viewer.id]?.[prior.senderId]&&snap?.[prior.senderId]?.[viewer.id]);
      const row=`${label(prior.senderId,Boolean(snap?.[viewer.id]?.[prior.senderId]),prior.name)}：${prior.original}；角色回复：${m.original}`;
      (mutual?shared:personal).push(row);used.add(prior.id);used.add(m.id);
    }
    for(const m of item.messages.filter(m=>!used.has(m.id)&&m.senderId===viewer.id))personal.push(`角色自己发言：${m.original}`);
    const at=item.messages.at(-1)?.at||0;
    add(kind,item.id,"Youtube 共同互动",shared,at,item.memorySummaries?.[`${viewer.id}:shared`],true,`${viewer.id}:shared`);
    add(kind,item.id,"Youtube 个人互动；未知身份仅按网友记忆",personal,at,item.memorySummaries?.[`${viewer.id}:personal`],false,`${viewer.id}:personal`);
  };
  for(const t of state.threads)if(t.peerChannelId===viewer.id&&(!userId||t.userChannelId===`user:${userId}`))conversationSources("thread",t);
  for(const g of state.groups)if(g.channelId===viewer.id&&(!userId||g.userChannelId===`user:${userId}`))conversationSources("group",g);
  return result;
}
/** Never inject raw chat or stale summaries. Deleting source content revokes the projection. */
export function projectYtbMemory(state: YtbState, characterId: string, userId?: string) {
  return ytbMemorySources(state, characterId, userId).flatMap(source => source.cached?.fingerprint === source.fingerprint && source.cached.content.trim()
    ? [{ shared: source.shared, sourceKeys: [`ytb:${source.id}`,...(source.kind==="thread"?state.threads.find(t=>t.id===source.id)?.messages||[]:source.kind==="group"?state.groups.find(g=>g.id===source.id)?.messages||[]:[]).filter(m=>m.videoId).map(m=>`ytb:video:${m.videoId}`)], id: `youtube:${source.kind === "stream" ? "replay" : source.kind === "thread" ? "dm" : "group"}:${source.id}:${source.cacheKey || source.channelId}`, timestamp: new Date(source.at).toISOString(), content: source.cached.content }]
    : []);
}
export function loadYtbProjectionEntries(characterId: string, afterTimestamp?: string) {
  return [...projectYtbMemory(loadYtbState(), characterId, resolveUserIdentity(characterId, "ytb")?.id),...ytbVideoProjectionEntries(characterId)].filter(e => !afterTimestamp || e.timestamp > afterTimestamp);
}
