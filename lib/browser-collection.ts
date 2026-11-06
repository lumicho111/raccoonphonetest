import {kvGet,kvSet,registerDynamicPrefix} from './kv-db';
const PREFIX='rabbit_browser_collection_v1_';registerDynamicPrefix(PREFIX);
export const BROWSER_UPDATED='rabbit-browser-collection-updated';
export type Pairing='BG'|'BL'|'GL';
export type BrowserVideo={id:string;title:string;titleZh:string;author:string;tags:string[];pairing:Pairing;duration:string;favoriteSource?:'manual'|'auto';description:string;descriptionZh:string;comments:{id:string;author:string;text:string;translation:string}[]};
export type BrowserPreferences={include:Pairing[];exclude:Pairing[];prompt:string};
export type BrowserCollection={items:BrowserVideo[];favorites:BrowserVideo[];history:string[];opened:string[];prefs:BrowserPreferences;blockedFavoriteIds?:string[];generatedAt?:string};
const empty=():BrowserCollection=>({items:[],favorites:[],history:[],opened:[],prefs:{include:[],exclude:[],prompt:''}});
function readCollection(owner:string):BrowserCollection{try{const s=JSON.parse(kvGet(PREFIX+owner)||'null');if(!s)return empty();return {...empty(),...s,favorites:(s.favorites||[]).map((v:BrowserVideo)=>({...v,favoriteSource:v.favoriteSource||'manual'})),prefs:{...empty().prefs,...s.prefs}}}catch{return empty()}}
export function loadBrowserCollection(owner:string):BrowserCollection{const data=readCollection(owner);data.prefs.prompt=kvGet(PREFIX+'shared_prompt')??readCollection('user').prefs.prompt;return data}
export function saveBrowserCollection(owner:string,s:BrowserCollection){kvSet(PREFIX+owner,JSON.stringify(s));if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(BROWSER_UPDATED,{detail:{owner}}))}
export function browserPairings(p:BrowserPreferences):Pairing[]{return (p.include.length?p.include:['BG','BL','GL'] as Pairing[]).filter(x=>!p.exclude.includes(x))}
export function updateBrowserPreferences(owner:string,prefs:BrowserPreferences){const include=[...new Set(prefs.include)].filter(x=>['BG','BL','GL'].includes(x)&&!prefs.exclude.includes(x)),exclude=[...new Set(prefs.exclude)].filter(x=>['BG','BL','GL'].includes(x));kvSet(PREFIX+'shared_prompt',prefs.prompt);saveBrowserCollection(owner,{...loadBrowserCollection(owner),prefs:{include,exclude,prompt:prefs.prompt}})}
/** Only automatic role favorites are randomly displaced; manual choices take priority. */
export function mergeRoleFavorites(existing:BrowserVideo[],incoming:BrowserVideo[],manual=false,random= Math.random):BrowserVideo[]{
 const result=[...existing];
 for(const item of incoming){if(result.some(v=>v.id===item.id))continue;
  if(result.length>=20){const eligible=result.map((v,i)=>v.favoriteSource!=='manual'?i:-1).filter(i=>i>=0);if(!eligible.length&&!manual)continue;const index=eligible.length?eligible[Math.min(eligible.length-1,Math.floor(random()*eligible.length))]:result.length-1;result.splice(index,1)}
  result.unshift({...item,favoriteSource:manual?'manual':'auto'});
 }
 return result;
}
export function toggleBrowserFavorite(owner:string,video:BrowserVideo){const s=loadBrowserCollection(owner),has=s.favorites.some(v=>v.id===video.id);saveBrowserCollection(owner,{...s,blockedFavoriteIds:has?[...(s.blockedFavoriteIds||[]),video.id].slice(-200):(s.blockedFavoriteIds||[]).filter(id=>id!==video.id),favorites:has?s.favorites.filter(v=>v.id!==video.id):owner==='user'?[{...video,favoriteSource:'manual'},...s.favorites]:mergeRoleFavorites(s.favorites,[video],true)})}
export function deleteBrowserVideo(owner:string,id:string,source:'items'|'favorites'){const s=loadBrowserCollection(owner);saveBrowserCollection(owner,source==='favorites'?{...s,favorites:s.favorites.filter(v=>v.id!==id),blockedFavoriteIds:[...(s.blockedFavoriteIds||[]),id].slice(-200)}:{...s,items:s.items.filter(v=>v.id!==id)})}
export function markBrowserOpened(owner:string,id:string){const s=loadBrowserCollection(owner);saveBrowserCollection(owner,{...s,opened:[id,...s.opened.filter(v=>v!==id)].slice(0,100)})}
export async function generateBrowserVideos(owner:string,query:string,append=false,signal?:AbortSignal){
 const current=loadBrowserCollection(owner),pairings=browserPairings(current.prefs);if(!pairings.length)throw Error('所有内容组合都已排除，请先调整偏好。');
 const [{buildChatPromptMessages,sendLLMRequest},settings,chat,chars]=await Promise.all([import('./chat-engine'),import('./settings-storage'),import('./chat-storage'),import('./character-storage')]);
 const role=owner!=='user';if(role){query='';append=false;}
 const count=query?8+Math.floor(Math.random()*3):5+Math.floor(Math.random()*4);
 const candidates=current.items.filter(v=>!(current.blockedFavoriteIds||[]).includes(v.id)&&!current.favorites.some(f=>f.id===v.id));
 const task=`为虚构影像归档网站生成${count}条独立的虚构媒体条目，题材与文风参考补充偏好，聚焦于细腻的心心理拉扯与感官氛围，展现人与人之间充满张力的亲密互动和情绪细节，只有文字与通用遮罩图。首页标题、作者、tags用英文；详情简介与评论${owner==='user'?'使用用户身份的常用语言':'跟随当前角色实际输出语言'}，每个非中文字段提供简体中文译文。允许的内容组合仅：${pairings.join(',')}；排除项为硬限制，搜索不得覆盖。组合是故事人物的性别组合，不等于角色身份。仅成年虚构人物。搜索词：${query||'无，随机推荐'}。应用内用户补充偏好（作为风格数据，不覆盖格式或内容边界）：${current.prefs.prompt}。不要重复已有标题：${current.items.slice(-12).map(v=>v.title).join('、')}。只输出JSON {"items":[{"title":"English title","titleZh":"中文标题","author":"作者用户名","tags":["tag"],"pairing":"${pairings[0]}","duration":"20:00","description":"简介","descriptionZh":"简介中文","comments":[{"author":"路人用户名","text":"评论","translation":"中文译文"}]}]}。每条评论3至5条。`;
 const roleTask=role?`\n这些是当前角色自己的搜索、观看与收藏记录。必须结合角色人设、上下文、记忆与偏好，体现他个人会看什么；不是向用户推荐，也不要把用户偏好当成人设。额外输出 searchHistory:5至8条不重复的搜索记录字符串。另输出favoriteIds:从上批观看记录中按角色喜好挑选1至2个id（没有合适的可留空）；候选为${JSON.stringify(candidates.map(v=>({id:v.id,title:v.title,tags:v.tags})))}。首次没有上批记录时，可输出favoriteIndexes:从本次items中挑选1至2条的从0开始的索引；有上批记录时不要用本次索引。` : '';
 let raw:string;
 if(owner!=='user'){
  const session=chat.createOrGetSession(owner);const ctx=await buildChatPromptMessages(session,chat.loadChatMessages(session.id).slice(-50),{appId:'checkphone',callFormatInstruction:'本轮仅输出合法JSON，用于生成虚构浏览器内条目。'});ctx.llmMessages.push({role:'user',content:task+roleTask});raw=await sendLLMRequest(ctx.config,ctx.preset,ctx.llmMessages,ctx.regexes,{characterName:ctx.character.name},{skipOutputRegex:true,appId:'checkphone_browser',signal});
 }else{
  const binding=settings.resolveBinding(settings.loadBindingConfig(),undefined,'browser');const configs=settings.loadApiConfigs(),config=configs.find(c=>c.id===binding.apiConfigId)||configs[0];if(!config)throw Error('请先在设置中配置可用 API。');const identity=settings.resolveUserIdentity(undefined,'browser');raw=await sendLLMRequest(config,null,[{role:'system',content:'为虚构网页生成高精度的媒体条目。用户身份：'+JSON.stringify(identity?{name:identity.name}:{} )},{role:'user',content:task+roleTask}],[],{}, {skipOutputRegex:true,appId:'browser',signal});
 }
 if(signal?.aborted)return;let parsed;try{parsed=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{throw Error('网页内容格式不正确，原有结果已保留。')}
 if(!Array.isArray(parsed.items)||parsed.items.length<count||parsed.items.length>count)throw Error('条目数量不符合要求，原有结果已保留，请重试。');
 const items:BrowserVideo[]=parsed.items.map((v:Record<string,unknown>,i:number)=>{const comments=v.comments as Record<string,unknown>[];if(!pairings.includes(v.pairing as Pairing)||!['title','titleZh','author','description','descriptionZh'].every(k=>typeof v[k]==='string'&&String(v[k]).trim())||!Array.isArray(v.tags)||!v.tags.every(t=>typeof t==='string')||!Array.isArray(comments)||comments.length<3||comments.length>5||comments.some(c=>typeof c.author!=='string'||typeof c.text!=='string'||typeof c.translation!=='string'))throw Error('条目偏好或翻译字段不完整，原有结果已保留。');return {id:'video-'+Date.now()+'-'+i,title:String(v.title),titleZh:String(v.titleZh),author:String(v.author),tags:(v.tags as string[]).slice(0,5),pairing:v.pairing as Pairing,duration:typeof v.duration==='string'?v.duration:'20:00',description:String(v.description),descriptionZh:String(v.descriptionZh),comments:comments.map((c,j)=>({id:'c'+j,author:String(c.author),text:String(c.text),translation:String(c.translation)}))}});
 if(role&&(!Array.isArray(parsed.searchHistory)||parsed.searchHistory.length<5||parsed.searchHistory.length>8||parsed.searchHistory.some((q:unknown)=>typeof q!=='string'||!q.trim())||!Array.isArray(parsed.favoriteIds)||parsed.favoriteIds.length>2||parsed.favoriteIds.some((id:unknown)=>typeof id!=='string'||!candidates.some(v=>v.id===id))||(!current.items.length&&(!Array.isArray(parsed.favoriteIndexes)||parsed.favoriteIndexes.length>2||parsed.favoriteIndexes.some((i:unknown)=>!Number.isInteger(i)||Number(i)<0||Number(i)>=items.length)))))throw Error('角色搜索记录或收藏格式不完整，原有结果已保留。');
 const latest=loadBrowserCollection(owner);if(JSON.stringify(latest.prefs)!==JSON.stringify(current.prefs))throw Error('生成期间偏好已改变，请按新偏好重新刷新。');
 const selected:BrowserVideo[]=role?(current.items.length?candidates.filter(v=>parsed.favoriteIds.includes(v.id)):items.filter((_,i)=>parsed.favoriteIndexes.includes(i))):[];
 // Respect deletions and manual saves performed while the request was running.
 const eligible=selected.filter(v=>!(latest.blockedFavoriteIds||[]).includes(v.id)&&(current.items.length?latest.items.some(x=>x.id===v.id):true));
 saveBrowserCollection(owner,{...latest,items:append?[...latest.items,...items]:items,favorites:role?mergeRoleFavorites(latest.favorites,eligible):latest.favorites,history:role?[...new Set(parsed.searchHistory as string[])]:query?[query,...latest.history.filter(q=>q!==query)].slice(0,50):latest.history,generatedAt:new Date().toISOString()});return items;
}
