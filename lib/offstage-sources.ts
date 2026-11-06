import {loadCharacters} from './character-storage';
import {loadChatSessions,loadChatMessages} from './chat-storage';
import {loadMemoryEntries} from './memory-storage';
import {loadNativeTimeline} from './short-term-assembler';
import type {Character} from './character-types';
import type {OffAttachment} from './offstage';
export const OFF_SOURCE_KINDS=['card','core','long','short','chat'] as const;
export type OffSourceKind=typeof OFF_SOURCE_KINDS[number];
export const OFF_SOURCE_LABELS:Record<OffSourceKind,string>={card:'角色资料',core:'核心记忆',long:'长期记忆',short:'短期资料',chat:'聊天记录'};
export function offstageCharacterProfile(c:Character){return [`姓名：${c.name}`,`人设：${c.persona||'未填写'}`,c.personality?`性格：${c.personality}`:'',c.languageUsage?`语言习惯：${c.languageUsage}`:''].filter(Boolean).join('\n\n');}
export async function readOffstageSource(characterId:string,kind:OffSourceKind,chatId?:string,count=50):Promise<OffAttachment>{
 const chars=loadCharacters(),c=chars.find(x=>x.id===characterId);if(!c)throw Error('角色已不存在，请重新选择');
 const limit=Math.max(1,Math.min(500,Math.floor(count)||50));let text='';
 if(kind==='card')text=offstageCharacterProfile(c);
 else if(kind==='chat'){
  const session=loadChatSessions().find(x=>x.id===chatId&&(x.contactId===characterId||x.participantIds?.includes(characterId)));if(!session)throw Error(`请选择${c.name}的聊天会话`);
  text=loadChatMessages(session.id,limit).map(m=>`${m.createdAt} ${m.role==='user'?'用户':m.role==='assistant'?(chars.find(x=>x.id===m.senderCharacterId)?.name||c.name):'系统'}：${m.content}${m.mediaData?.label?' ['+m.mediaData.label+']':''}`).join('\n');
 }else if(kind==='short')text=loadNativeTimeline(characterId).slice(-limit).map(x=>`${x.timestamp} [${x.sourceApp}] ${x.content}`).join('\n\n');
 else text=(await loadMemoryEntries(characterId)).filter(x=>x.type===(kind==='core'?'core':'long_term')).map(x=>`${x.createdAt}\n${x.content}`).join('\n\n');
 if(!text.trim())throw Error(`${c.name}的${OFF_SOURCE_LABELS[kind]}暂无可读取内容`);
 if(text.length>60000)throw Error(`${c.name}的${OFF_SOURCE_LABELS[kind]}超过六万字，请缩小范围或手动分段`);
 return{id:crypto.randomUUID(),name:`${c.name} · ${OFF_SOURCE_LABELS[kind]}`,text,source:`${OFF_SOURCE_LABELS[kind]} · ${new Date().toLocaleString()}读取的副本${kind==='chat'?` · 最近 ${limit} 条`:''}`};
}
