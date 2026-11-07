import {kvGet,kvSet,registerKvMigration} from './kv-db';
import {revokeMemorySources} from './memory-event-meta';
import {loadYtbState,saveYtbState,ytbId,type YtbChannel,type YtbState} from './ytb-storage';
import {settledEarning} from './ytb-runtime';
export type VideoComment={id:string;name:string;avatar:string;original:string;translated:string;at:number;authorId?:string;replyTo?:string};
export type YtbVideo={id:string;channelId:string;participantIds:string[];categoryByChannel:Record<string,string>;title:string;titleZh:string;description:string;descriptionZh:string;content:string;contentZh:string;cover:string;duration:string;views:number;publishedAt:number;updatedAt:number;linkedDealId?:string;comments:VideoComment[]};
export type VideoDraft=YtbVideo&{draft:true;editingId?:string;customDate:boolean;translationLanguage:string;baseline?:{original:string[];chinese:string[]};savedAt:number;generated?:boolean};
export type VideoCategory={id:string;channelId:string;name:string};
export type VideoReceipt={videoId:string;viewerId:string;at:number;read:boolean;knownAuthors:string[]};
export type VideoState={version:1;videos:YtbVideo[];drafts:VideoDraft[];categories:VideoCategory[];receipts:VideoReceipt[]};
const KEY='ai_phone_ytb_videos_v1';registerKvMigration(KEY);
export const YTB_VIDEOS_UPDATED='ytb-videos-updated';
export const emptyVideoState=():VideoState=>({version:1,videos:[],drafts:[],categories:[],receipts:[]});
export function loadVideoState():VideoState{try{const s=JSON.parse(kvGet(KEY)||'null');if(!s||s.version!==1)return emptyVideoState();return {...emptyVideoState(),...s,videos:Array.isArray(s.videos)?s.videos:[],drafts:Array.isArray(s.drafts)?s.drafts:[],categories:Array.isArray(s.categories)?s.categories:[],receipts:Array.isArray(s.receipts)?s.receipts:[]};}catch{return emptyVideoState();}}
export function saveVideoState(s:VideoState){kvSet(KEY,JSON.stringify(s));if(typeof window!=='undefined')window.dispatchEvent(new Event(YTB_VIDEOS_UPDATED));}
export function updateVideos(fn:(s:VideoState)=>VideoState){const s=fn(loadVideoState());saveVideoState(s);return s;}
export function newVideoDraft(channelId:string,category='',now=Date.now()):VideoDraft{return {id:ytbId(),channelId,participantIds:[channelId],categoryByChannel:{[channelId]:category},title:'',titleZh:'',description:'',descriptionZh:'',content:'',contentZh:'',cover:'',duration:'',views:0,publishedAt:now,updatedAt:now,comments:[],draft:true,customDate:false,translationLanguage:'none',savedAt:now};}
export function putVideoDraft(d:VideoDraft){updateVideos(s=>({...s,drafts:[{...d,savedAt:Date.now()},...s.drafts.filter(x=>x.id!==d.id)]}));}
export function discardVideoDraft(id:string){updateVideos(s=>({...s,drafts:s.drafts.filter(d=>d.id!==id)}));}
export function saveVideoCategory(channelId:string,name:string,id?:string){const clean=name.trim().slice(0,30);if(!clean)throw Error('请填写栏目名称');const s=loadVideoState();if(s.categories.some(c=>c.channelId===channelId&&c.name===clean&&c.id!==id))throw Error('这个栏目已存在');const c={id:id||ytbId(),channelId,name:clean};updateVideos(v=>({...v,categories:[...v.categories.filter(x=>x.id!==c.id),c]}));return c;}
export function deleteVideoCategory(id:string){updateVideos(s=>({...s,categories:s.categories.filter(c=>c.id!==id),videos:s.videos.map(v=>({...v,categoryByChannel:Object.fromEntries(Object.entries(v.categoryByChannel).map(([k,c])=>[k,c===id?'':c]))})),drafts:s.drafts.map(v=>({...v,categoryByChannel:Object.fromEntries(Object.entries(v.categoryByChannel).map(([k,c])=>[k,c===id?'':c]))}))}));}
export function videoSnapshot(v:YtbVideo,channels=loadYtbState().channels){return {id:v.id,title:v.title,titleZh:v.titleZh,description:v.description,descriptionZh:v.descriptionZh,content:v.content,contentZh:v.contentZh,cover:v.cover,duration:v.duration,publishedAt:v.publishedAt,authors:v.participantIds.map(id=>{const c=channels.find(c=>c.id===id);return {id,name:c?.name||'频道',handle:c?.handle||''};})};}
export type VideoSnapshot=ReturnType<typeof videoSnapshot>;
export function publishVideoDraft(d:VideoDraft,at=Date.now()):YtbVideo{
 if(!d.title.trim()||!d.content.trim())throw Error('请填写视频标题和内容');
 if(!/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(d.duration.trim()))throw Error('视频时长请用 分:秒 或 时:分:秒');
 if(!Number.isFinite(d.views)||d.views<0)throw Error('播放量需为非负数');
 const state=loadYtbState();if(!state.channels.some(c=>c.id===d.channelId))throw Error('频道已删除');
 const existing=loadVideoState().videos.find(v=>v.id===d.editingId);
 if(d.editingId&&!existing)throw Error('视频已删除，不能重新保存');
 const publishedAt=d.customDate?d.publishedAt:existing?.publishedAt||at;
 if(!Number.isFinite(publishedAt)||publishedAt>at)throw Error('请选择有效的已发生日期');
 const participantIds=[...new Set([d.channelId,...d.participantIds])].filter(id=>state.channels.some(c=>c.id===id));
 const deal=d.linkedDealId?state.deals.find(x=>x.id===d.linkedDealId):undefined;
 const sameDeal=existing?.linkedDealId===d.linkedDealId;
 if(d.linkedDealId&&(!deal||deal.channelId!==d.channelId||(!sameDeal&&deal.status!=='active')))throw Error('该商单已完成或不可用，请重新选择');
 if(deal&&!sameDeal&&state.streams.some(l=>l.status==='live'&&l.linkedDealId===deal.id))throw Error('该商单正在直播中使用，不能重复关联');
 const {draft,editingId,customDate,translationLanguage,baseline,savedAt,generated,...base}=d;
 const video:YtbVideo={...base,id:existing?.id||d.id,title:d.title.trim(),content:d.content.trim(),publishedAt,updatedAt:at,participantIds,comments:existing?.comments||d.comments,views:Math.floor(d.views)};
 let next:YtbState=state;
 if(deal&&deal.status==='active'){
 const channel=state.channels.find(c=>c.id===d.channelId)!;
 const earning=settledEarning(state,channel,{id:`deal:${deal.id}`,channelId:channel.id,kind:'business',originalAmount:deal.amount,originalCurrency:deal.currency,at});
 next={...state,deals:state.deals.map(x=>x.id===deal.id?{...x,status:'completed'}:x),earnings:earning?[...state.earnings,earning]:state.earnings};
 }
 // A completed deal is immutable. Changing/removing the association cannot pay it again.
 updateVideos(s=>({...s,videos:[video,...s.videos.filter(v=>v.id!==video.id)],drafts:s.drafts.filter(x=>x.id!==d.id)}));
 saveYtbState(next);return video;
}
/** Every view uses one video record; revoking any collaboration notice removes that same record. */
export function deleteYtbVideo(id:string){revokeMemorySources([`ytb:video:${id}`]);updateVideos(s=>({...s,videos:s.videos.filter(v=>v.id!==id),drafts:s.drafts.filter(d=>d.editingId!==id),receipts:s.receipts.filter(r=>r.videoId!==id)}));
 const state=loadYtbState();saveYtbState({...state,threads:state.threads.map(t=>({...t,messages:t.messages.filter(m=>m.videoId!==id)})),groups:state.groups.map(g=>({...g,messages:g.messages.filter(m=>m.videoId!==id)}))});
}
export function receiveVideo(id:string,viewer:YtbChannel,read:boolean,knownAuthors:string[]){updateVideos(s=>({...s,receipts:[...s.receipts.filter(r=>!(r.videoId===id&&r.viewerId===viewer.id)),{videoId:id,viewerId:viewer.id,read:read||!!s.receipts.find(r=>r.videoId===id&&r.viewerId===viewer.id)?.read,at:Date.now(),knownAuthors}]}));}
export function setVideoComment(id:string,c:VideoComment){updateVideos(s=>({...s,videos:s.videos.map(v=>v.id===id?{...v,comments:[...v.comments,c]}:v)}));}
