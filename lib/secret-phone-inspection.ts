import {loadCity,cityEntries} from './icity-store';
import {kvGet,kvSet,registerKvMigration} from './kv-db';
import {inspectionPermissions,inspectionPermission,nextInspectionAt,saveInspectionPermission,INSPECTION_UPDATED,inspectionAppAllowed} from './phone-inspection-settings';
import {loadChatSessions,loadChatContacts,loadChatMessages,getChatMessagePreview} from './chat-storage';
import {hiddenChats,activeReverse,liveReverseStep,type ReverseStep} from './reverse-phone-state';
import {loadMomentPosts,loadAllMomentComments} from './moments-storage';
import {loadShoppingState} from './shopping-storage';
import {loadBooks,hydrateReadingStorage,loadProgress,loadChapters} from './reading-storage';
import {loadBrowserCollection} from './browser-collection';
const KEY='rabbit_secret_inspections_v1';registerKvMigration(KEY);
export type SecretInspection={id:string;owner:string;at:number;endedAt:number;steps:ReverseStep[];error?:string};
export function secretInspections():SecretInspection[]{try{return JSON.parse(kvGet(KEY)||'[]')}catch{return []}}
function save(rows:SecretInspection[]){kvSet(KEY,JSON.stringify(rows.slice(-60)));if(typeof window!=='undefined')window.dispatchEvent(new Event(INSPECTION_UPDATED))}
export function clearSecretInspections(owner:string){save(secretInspections().filter(v=>v.owner!==owner))}
function pick<T>(items:T[],n:number):T[]{const pool=[...items],out:T[]=[];while(pool.length&&out.length<n)out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);return out}
let busy=false;
/** One mechanical due check, no desire model call, no navigation, no catch-up loop. */
export async function tickSecretInspections(now=Date.now()){
 if(busy||activeReverse())return;const owner=Object.keys(inspectionPermissions()).find(id=>{const p=inspectionPermission(id);return p.secret&&!!p.nextAt&&p.nextAt<=now});if(!owner)return;busy=true;
 const permission=inspectionPermission(owner);const day=new Date(now).toDateString();if(secretInspections().filter(v=>v.owner===owner&&new Date(v.at).toDateString()===day).length>=permission.dailyLimit){busy=false;return;}
 const run:SecretInspection={id:'secret-'+now,owner,at:now,endedAt:now,steps:[]};let remaining=10000;
 const add=(app:string,label:string,value:unknown,extra:Partial<ReverseStep>={})=>{const content=JSON.stringify(value);if(content.length>remaining||secretInspections().filter(r=>r.owner===owner).slice(-3).some(r=>r.steps.some(s=>s.app===app&&s.content===content)))return;remaining-=content.length;run.steps.push({id:run.id+'-'+run.steps.length,app,label,content,...extra})};
 try{
  if(inspectionAppAllowed(owner,'reading'))await hydrateReadingStorage();const hidden=new Set(hiddenChats()),discovered=new Set([...hidden].filter(()=>Math.random()<.1));const contacts=new Set(inspectionAppAllowed(owner,'chat')?loadChatContacts().map(c=>c.characterId):[]);const sessions=(inspectionAppAllowed(owner,'chat')?loadChatSessions():[]).filter(s=>(s.isGroup||contacts.has(s.contactId))&&(!hidden.has(s.id)||discovered.has(s.id)));
  const books=inspectionAppAllowed(owner,'reading')?loadBooks():[],browser=inspectionAppAllowed(owner,'browser')?loadBrowserCollection('user'):{items:[],favorites:[],opened:[],history:[]};const categories=['chat','moments','shopping','icity',...(books.length?['reading']:[]),...(browser.items.length||browser.favorites.length?['browser']:[])].filter(app=>inspectionAppAllowed(owner,app));
  for(const app of pick(categories,3)){try{if(!inspectionAppAllowed(owner,app))continue;
   if(app==='chat'){add('chat','偷看了消息列表',sessions.slice(0,20).map(s=>({id:s.id,name:s.alias||s.groupName||s.contactId})));for(const s of pick(sessions.filter(s=>loadChatMessages(s.id).length),1)){const rows=loadChatMessages(s.id).filter(m=>['user','assistant'].includes(m.role)&&!m.isRetracted).slice(-Math.min(50,18));add('chat','偷看了已有聊天',rows.map(m=>({id:m.id,role:m.role,text:getChatMessagePreview(m)})),{messageIds:rows.map(m=>m.id)})}}
   if(app==='moments'){const posts=loadMomentPosts().slice(0,3+Math.floor(Math.random()*3)),ids=posts.map(p=>p.id);add('moments','偷看了朋友圈',{posts:posts.map(p=>({id:p.id,author:p.authorId,text:p.content,photoDescription:p.photoDescription})),comments:loadAllMomentComments().filter(c=>ids.includes(c.postId)).slice(0,8).map(c=>({postId:c.postId,text:c.content}))},{postIds:ids})}
   if(app==='shopping'){const s=loadShoppingState();add('shopping','偷看了部分购物与外卖记录',{cart:s.cartItems.slice(0,3),foodCart:s.foodCartItems.slice(0,3),orders:s.orders.slice(-4)})}
   if(app==='reading'){const b=pick(books,1)[0];if(b){const p=await loadProgress(b.id),chapters=await loadChapters(b.id),c=chapters.find(c=>c.index===(p?.chapterIndex||0));add('reading','偷看了书架与阅读进度',{id:b.id,title:b.title,progress:p,notice:'只读取了书名和保存的进度，未读取正文'})}}
   if(app==='icity'){const city=loadCity(),rows=cityEntries(city).filter(e=>e.author==='user'&&e.visibility!=='private'&&city.books.find(b=>b.id===e.book)?.kind==='personal').slice(0,3);if(rows.length)add('icity','偷看了你的iCity日记',rows.map(e=>({id:e.id,title:e.title,text:e.text,visibility:e.visibility})));}
   if(app==='browser'){add('browser','偷看了浏览器已保存的部分记录',{searches:browser.history.slice(0,4),favorites:browser.favorites.slice(0,2).map(v=>({id:v.id,title:v.title,author:v.author,tags:v.tags,description:v.description})),opened:browser.opened.slice(0,3).map(id=>browser.items.find(v=>v.id===id)||browser.favorites.find(v=>v.id===id)).filter(Boolean)})}
  }catch(e){run.error=[run.error,e instanceof Error?e.message:String(e)].filter(Boolean).join('; ')}}
 }catch(e){run.error=e instanceof Error?e.message:String(e)}finally{run.endedAt=Date.now();save([...secretInspections(),run]);const p=inspectionPermission(owner);if(p.secret)saveInspectionPermission(owner,{nextAt:nextInspectionAt(p,run.endedAt)});busy=false}
}
export function secretInspectionMemory(owner:string){return secretInspections().filter(r=>r.owner===owner).slice(-2).map(r=>({at:r.at,source:'你未打招呼，按已允许的偷偷查看权限看到了以下实际记录；无需主动宣布偷看。只知道成功读取的内容，不补造。',records:r.steps.map(liveReverseStep).filter(Boolean)})).filter(r=>r.records.length)}
