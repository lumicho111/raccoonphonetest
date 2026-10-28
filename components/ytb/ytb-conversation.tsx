"use client";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { YtbMessage } from "@/lib/ytb-storage";
import { Plane } from "./ytb-live-room";
import s from "./ytb-app.module.css";

type Props = {
 messages: YtbMessage[]; ownId: string; peerId: string; busy: boolean; group: boolean;
 onChannel: (id: string) => void;
 onSend: (body: string, generate: boolean, quote?: YtbMessage["quote"]) => void;
 onUpdate: (messages: YtbMessage[]) => void;
 onRetry: (id: string) => void;
};
export function YtbConversation({ messages, ownId, peerId, busy, onChannel, onSend, onUpdate, onRetry }: Props) {
 const [input,setInput]=useState("");
 const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
 const [target,setTarget]=useState<YtbMessage|null>(null),[edit,setEdit]=useState<YtbMessage|null>(null);
 const [quote,setQuote]=useState<YtbMessage["quote"]>();
 const [selected,setSelected]=useState<string[]|null>(null);
 const box=useRef<HTMLDivElement>(null),follow=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null),pressed=useRef(false),origin=useRef({x:0,y:0});
 const clearPress=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 useEffect(()=>()=>clearPress(),[]);
 useEffect(()=>{if(follow.current&&box.current)box.current.scrollTop=box.current.scrollHeight;},[messages.length]);
 const send=(generate:boolean)=>{if(busy||(!input.trim()&&!generate))return;onSend(input,generate,quote);setInput("");setQuote(undefined);};
 const toggle=(id:string)=>setSelected(list=>list?.includes(id)?list.filter(x=>x!==id):[...(list||[]),id]);
 async function copy(text:string){
  try {await navigator.clipboard.writeText(text);} catch {const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();}
  setTarget(null);
 }
 const remove=(ids:string[])=>{onUpdate(messages.filter(m=>!ids.includes(m.id)));setTarget(null);setSelected(null);};
 return <>
 {selected&&<div className={s.selectionBar}><button onClick={()=>setSelected(null)}><X size={17}/></button><b>已选 {selected.length} 条</b><button disabled={!selected.length||busy} onClick={()=>void copy(messages.filter(m=>selected.includes(m.id)).map(m=>`${m.name}：${m.original}${m.translated&&m.translated!==m.original?`\n${m.translated}`:""}`).join("\n\n"))}>复制</button><button disabled={!selected.length||busy} onClick={()=>remove(selected)}>删除</button></div>}
 <div ref={box} className={s.chatThread} onScroll={e=>{const x=e.currentTarget;follow.current=x.scrollHeight-x.scrollTop-x.clientHeight<35;}}>
 {messages.length===0&&<p className={s.empty}>这里还没有消息</p>}
 {messages.map(m=><div key={m.id} className={`${s.bubbleRow} ${m.senderId===ownId?s.myBubble:""}`}>
 {selected&&<button className={s.selectMessage} aria-label={`选择 ${m.name} 的消息`} onClick={()=>toggle(m.id)}>{selected.includes(m.id)&&<Check size={14}/>}</button>}
 {m.senderId===peerId?<button className={s.avatar} onClick={()=>onChannel(peerId)}>{m.avatar?<img src={m.avatar} alt=""/>:m.name.slice(0,1)}</button>:<span className={s.avatar}>{m.avatar?<img src={m.avatar} alt=""/>:m.name.slice(0,1)}</span>}
 <div><small>{m.name}</small><button className={s.messageBubble} aria-label={`${m.name}：${m.original}`} aria-expanded={!collapsed[m.id]} disabled={!!edit}
 onContextMenu={e=>{e.preventDefault();clearPress();if(!selected&&!busy)setTarget(m);}}
 onPointerDown={e=>{if(e.button!==0||selected||busy)return;pressed.current=false;origin.current={x:e.clientX,y:e.clientY};clearPress();timer.current=setTimeout(()=>{pressed.current=true;setTarget(m);},480);}}
 onPointerMove={e=>{if(Math.hypot(e.clientX-origin.current.x,e.clientY-origin.current.y)>9)clearPress();}}
 onPointerUp={clearPress} onPointerCancel={clearPress} onPointerLeave={clearPress}
 onClick={()=>{if(pressed.current){pressed.current=false;return;}if(selected)toggle(m.id);else setCollapsed(p=>({...p,[m.id]:!p[m.id]}));}}>
 {m.quote&&<span className={s.quotedMessage}><b>{m.quote.name}</b><span>{m.quote.original}</span>{!collapsed[m.id]&&m.quote.translated&&m.quote.translated!==m.quote.original&&<span>{m.quote.translated}</span>}</span>}
 <span>{m.original}</span>{!collapsed[m.id]&&m.translated&&m.translated!==m.original&&<span className={s.bubbleTranslation}>{m.translated}</span>}
 </button></div></div>)}
 </div>
 {quote&&<div className={s.quoteComposer}><div><b>回复 {quote.name}</b><span>{quote.original}</span></div><button onClick={()=>setQuote(undefined)} aria-label="取消引用"><X size={15}/></button></div>}
 <div className={s.composer}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="发送消息…" onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();send(false);}}}/><button disabled={busy} onClick={()=>send(true)} aria-label="发送并召唤"><Plane/></button></div>
 {target&&<div className={s.shade} onClick={()=>setTarget(null)}><section className={s.sheet} role="dialog" aria-label="消息操作" onClick={e=>e.stopPropagation()}><div className={s.sheetHandle}/><div className={s.sheetTitle}><b>消息操作</b><button onClick={()=>setTarget(null)}><X size={18}/></button></div><div className={s.messageActions}>
 <button onClick={()=>void copy(`${target.original}${target.translated&&target.translated!==target.original?`\n${target.translated}`:""}`)}>复制</button>
 <button disabled={busy} onClick={()=>{setEdit({...target});setTarget(null);}}>编辑</button>
 <button onClick={()=>{setQuote({id:target.id,name:target.name,original:target.original,translated:target.translated});setTarget(null);}}>引用</button>
 <button onClick={()=>{setSelected([target.id]);setTarget(null);}}>多选</button>
 {target.senderId!==ownId&&<button disabled={busy} onClick={()=>{onRetry(target.id);setTarget(null);}}>重试以下</button>}
 <button disabled={busy} onClick={()=>remove([target.id])}>删除</button>
 <button disabled={busy} onClick={()=>{const index=messages.findIndex(m=>m.id===target.id);remove(messages.slice(index).map(m=>m.id));}}>删除以下</button>
 </div></section></div>}
 {edit&&<div className={`${s.shade} ${s.centerShade}`} onClick={()=>setEdit(null)}><section className={s.sheet} role="dialog" aria-label="编辑消息" onClick={e=>e.stopPropagation()}><div className={s.sheetTitle}><b>编辑消息</b><button onClick={()=>setEdit(null)}><X size={18}/></button></div><div className={s.form}><label>正文<textarea value={edit.original} onChange={e=>setEdit({...edit,original:e.target.value})}/></label><label>中文翻译<textarea value={edit.translated} onChange={e=>setEdit({...edit,translated:e.target.value})} placeholder="可留空"/></label><button disabled={busy||!edit.original.trim()} className={s.primary} onClick={()=>{onUpdate(messages.map(m=>m.id===edit.id?{...edit,original:edit.original.trim(),translated:edit.translated.trim()}:m));setEdit(null);}}>保存</button></div></section></div>}
 </>;
}
