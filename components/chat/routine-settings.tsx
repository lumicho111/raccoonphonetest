"use client";
import {loadCallFirstSpeaker,saveCallFirstSpeaker,type CallFirstSpeaker} from "@/lib/call-first-speaker";
import {cancelBailoutPrefix,cancelFollowUpBailout} from "@/lib/push-bailout-client";
import {loadChatSessions} from "@/lib/chat-storage";
import {loadIdleReconnectRules} from "@/lib/idle-reconnect-storage";
import {useState} from 'react';
import {loadCharacters} from '@/lib/character-storage';
import {DEFAULT_ROUTINE,loadCharacterRoutine,saveCharacterRoutine,type CharacterRoutine} from '@/lib/character-routine';
export function RoutineSettings(){
 const characters=loadCharacters();const [id,setId]=useState('');const [r,setR]=useState<CharacterRoutine>({...DEFAULT_ROUTINE});const [notice,setNotice]=useState('');const [speaker,setSpeaker]=useState<CallFirstSpeaker>('user');
 const update=(patch:Partial<CharacterRoutine>)=>{const next={...r,...patch};setR(next);setNotice('');};
 return <><p className="menu-group-desc mx-2">角色作息 · 当地时间</p><div className="menu-group">
 <div className="menu-item"><span className="menu-label">角色</span><select className="ui-select" value={id} onChange={e=>{setId(e.target.value);setR(loadCharacterRoutine(e.target.value));setSpeaker(loadCallFirstSpeaker(e.target.value));setNotice('');}}><option value="">选择角色</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
 {id&&<><div className="menu-item"><span className="menu-label">单聊通话先开口</span><select className="ui-select" value={speaker} onChange={e=>{const v=e.target.value as CallFirstSpeaker;setSpeaker(v);saveCallFirstSpeaker(id,v);}}><option value="user">我先说</option><option value="character">对方先说</option><option value="random">每通随机</option></select></div><div className="menu-item"><label htmlFor="routine-enabled">启用作息</label><input id="routine-enabled" type="checkbox" checked={r.enabled} onChange={e=>update({enabled:e.target.checked})}/></div>
 <div className="menu-item"><span className="menu-label">通常入睡范围</span><div className="flex gap-1 items-center"><input aria-label="最早入睡" type="time" value={r.sleepFrom} onChange={e=>update({sleepFrom:e.target.value})}/><span>至</span><input aria-label="最晚入睡" type="time" value={r.sleepTo} onChange={e=>update({sleepTo:e.target.value})}/></div></div>
 <div className="menu-item"><span className="menu-label">睡眠时长（小时）</span><div className="flex gap-1 items-center"><input aria-label="最短睡眠小时" className="w-14 ui-input" type="number" min={1} max={16} value={r.minHours} onChange={e=>update({minHours:Number(e.target.value)})}/><span>至</span><input aria-label="最长睡眠小时" className="w-14 ui-input" type="number" min={1} max={16} value={r.maxHours} onChange={e=>update({maxHours:Number(e.target.value)})}/></div></div>
 <div className="menu-item"><span className="menu-label">规律程度</span><select className="ui-select" value={r.regularity} onChange={e=>update({regularity:e.target.value as CharacterRoutine['regularity']})}><option value="regular">比较规律</option><option value="flexible">经常浮动</option></select></div>
 <button className="menu-item" onClick={()=>{if(!r.sleepFrom||!r.sleepTo||!Number.isFinite(r.minHours)||!Number.isFinite(r.maxHours)||r.minHours<1||r.maxHours>16||r.maxHours<r.minHours){setNotice('请填写有效时间和1～16小时的睡眠范围。');return;}saveCharacterRoutine(id,r);if(r.enabled){for(const rule of loadIdleReconnectRules().filter(x=>x.characterId===id))void cancelBailoutPrefix(`idle:${rule.id}:`);for(const session of loadChatSessions().filter(x=>x.contactId===id&&!x.isGroup))cancelFollowUpBailout(session.id);}setNotice('已保存；当前睡眠周期保留，新的范围从后续周期生效。');}}>保存作息</button></>}
 </div><p className="menu-group-desc mx-2">日历工作优先调整睡眠；偶尔夜醒仅提供简短回复机会。需在对应单聊开启「忙时挂起」才延迟你召唤的回复。{notice}</p></>;
}
