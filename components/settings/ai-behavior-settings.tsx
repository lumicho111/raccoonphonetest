"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { SettingsContext } from "../phone-settings-app";
import { loadMediaPreferences, saveMediaPreferences, MEDIA_APPS, type MediaApp, type MediaPreference, type MediaPreferences } from "@/lib/media-preferences";
import { DEFAULT_SCHEDULE_PROMPTS, loadSchedulePrompts, saveSchedulePrompt, type SchedulePromptKind } from "@/lib/schedule-prompt-settings";
import { DEFAULT_THEQOO_PROMPT, loadTheqooPrompt, saveTheqooPrompt } from "@/lib/theqoo-prompt-settings";
const options = <><option value="text">文字优先</option><option value="balanced">平衡</option><option value="free">自由判断</option></>;
const names = { calendar: "日历日程", weverse: "Weverse 日程", theqoo: "Theqoo 论坛" };
export function AiBehaviorSettings() {
 const { setSubpageTitle, setOverrideBack } = useContext(SettingsContext);
 const [value,setValue]=useState<MediaPreferences>(()=>loadMediaPreferences());
 const [apps,setApps]=useState(false);
 const [editing,setEditing]=useState<SchedulePromptKind|"theqoo"|null>(null);
 const [draft,setDraft]=useState("");
 const [notice,setNotice]=useState("");
 const editor=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{setSubpageTitle(apps?"应用单独设置":"AI 行为");setOverrideBack(editing?()=>()=>setEditing(null):apps?()=>()=>setApps(false):null);return()=>{setSubpageTitle(null);setOverrideBack(null);};},[apps,editing,setSubpageTitle,setOverrideBack]);
 useEffect(()=>{if(!editing)return;const previous=document.activeElement as HTMLElement|null;editor.current?.focus();const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setEditing(null);};window.addEventListener("keydown",close);return()=>{window.removeEventListener("keydown",close);previous?.focus();};},[editing]);
 const update=(next:MediaPreferences)=>{setValue(next);saveMediaPreferences(next);};
 return <div className="ai-behavior-page flex flex-col gap-4">
 {!apps ? <>
 <section><p className="settings-menu-section-title">内容偏好</p><div className="settings-option-group">
 <label className="ai-media-row"><span>AI 配图倾向</span><select value={value.global} onChange={e=>update({...value,global:e.target.value as MediaPreference})}>{options}</select></label>
 <button type="button" className="ai-media-row" onClick={()=>setApps(true)}>应用单独设置<ChevronRight size={16}/></button></div>
 <p className="menu-desc ai-media-note">控制 AI 主动内容的配图倾向。</p></section>
 <section><p className="settings-menu-section-title">内容生成提示词</p><div className="settings-option-group">{(["calendar","weverse","theqoo"] as const).map(kind=><button key={kind} className="ai-media-row" type="button" onClick={()=>{setDraft(kind==="theqoo"?loadTheqooPrompt():loadSchedulePrompts()[kind]);setEditing(kind);setNotice("");}}><span>{names[kind]}<small className="menu-desc settings-row-description">{kind==="calendar"?"工作、兴趣、私人安排与公开节点":kind==="weverse"?"公开工作、合作企划与作品发布":"论坛选题、网友生态与评论风格"}</small></span><ChevronRight size={16}/></button>)}</div><p className="menu-desc ai-media-note">修改内容方向，下次生成时生效。已有内容保持不变。</p></section>
 </> : <div className="settings-option-group">{Object.entries(MEDIA_APPS).map(([id,label])=><label key={id} className="ai-media-row"><span>{label}</span><select value={value.apps[id as MediaApp]||"inherit"} onChange={e=>{const next={...value.apps};if(e.target.value==="inherit")delete next[id as MediaApp];else next[id as MediaApp]=e.target.value as MediaPreference;update({...value,apps:next});}}><option value="inherit">跟随全局</option>{options}</select></label>)}</div>}
 {notice && <p role="status" className="menu-desc ai-media-note">{notice}</p>}
 {editing && <div className="modal-overlay settings-prompt-overlay" onClick={()=>setEditing(null)}><section role="dialog" aria-modal="true" aria-labelledby="schedule-prompt-title" className="modal-dialog settings-prompt-dialog" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key!=="Tab")return;const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button,textarea');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}>
 <div className="settings-dialog-heading"><h3 id="schedule-prompt-title">{names[editing]}提示词</h3><button type="button" aria-label="关闭" onClick={()=>setEditing(null)}><X size={20}/></button></div>
 <p className="menu-desc ai-media-note">编辑事件构思与内容风格。保存后用于下一次生成。</p>
 <textarea ref={editor} className="ui-input settings-prompt-text" aria-label="内容生成提示词" value={draft} maxLength={editing==="theqoo"?6000:16000} onChange={e=>setDraft(e.target.value)}/>
 <div className="settings-prompt-actions"><button type="button" className="ui-btn ui-btn-outline" onClick={()=>setDraft(editing==="theqoo"?DEFAULT_THEQOO_PROMPT:DEFAULT_SCHEDULE_PROMPTS[editing])}>恢复默认</button><button type="button" className="ui-btn ui-btn-primary" disabled={!draft.trim()} onClick={()=>{if(editing==="theqoo")saveTheqooPrompt(draft);else saveSchedulePrompt(editing,draft);setEditing(null);setNotice("提示词已保存，下次生成时生效。");}}>保存</button></div>
 </section></div>}
 </div>;
}
