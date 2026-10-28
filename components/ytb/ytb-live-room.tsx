"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, Phone, Power, Volume2, X } from "lucide-react";
import type { YtbChannel, YtbState, YtbStream } from "@/lib/ytb-storage";
import s from "./ytb-app.module.css";
export function Plane() { return <img className={s.sendPlane} src="/youtube/send-plane.png" alt="" width={29} height={29}/>; }
export function YtbLiveRoom({stream,host,state,clock,busy,onBack,onEnd,onCalls,onAd,onBell,onSend,onReact,onSpeak,onChannel}: {
 stream:YtbStream;host:YtbChannel;state:YtbState;clock:number;busy:boolean;
 onChannel:()=>void;onBack:()=>void;onEnd:()=>void;onCalls:()=>void;onAd:()=>void;onBell:()=>void;
 onSend:(value:string,kind:"speech"|"action",generate:boolean)=>void;onReact:()=>void;onSpeak:(text:string,channel?:YtbChannel)=>void;
}) {
 const [input,setInput]=useState(""); const [kind,setKind]=useState<"speech"|"action">("speech");
 const [translations,setTranslations]=useState<Record<string,boolean>>({});
 const stage=useRef<HTMLDivElement>(null),comments=useRef<HTMLDivElement>(null);
 const followStage=useRef(true),followComments=useRef(true);
 const lines=stream.lines.filter(l=>l.at<=clock), rows=stream.comments.filter(c=>c.at<=clock && (host.ownerType==="user"||!c.tip));
 useEffect(()=>{if(followStage.current&&stage.current)stage.current.scrollTop=stage.current.scrollHeight;},[lines.length]);
 useEffect(()=>{if(followComments.current&&comments.current)comments.current.scrollTop=comments.current.scrollHeight;},[rows.length]);
 const send=(generate:boolean)=>{if(busy)return;onSend(input,host.ownerType==="user"?kind:"speech",generate);setInput("");};
 const mine=host.ownerType==="user",live=stream.status==="live";
 const waiting=stream.calls.filter(c=>c.status==="waiting"&&c.at<=clock).length;
 return <div className={s.liveRoom}>
  <section className={`${s.stage} ${mine?s.userStage:""}`} style={stream.cover?{backgroundImage:`linear-gradient(0deg,#0009,#0001 80%),url(${JSON.stringify(stream.cover)})`}:undefined}>
   <div className={s.liveToolbar}><div><button onClick={onBack} aria-label={mine?"退出挂起":"返回"}>{mine?<X size={18}/>:<ArrowLeft size={18}/>}</button>{live&&<button className={s.power} onClick={onEnd} aria-label="结束直播"><Power size={18}/></button>}</div><div>
   <span className={s.viewerPill}>{stream.viewers.toLocaleString()} 人</span>{mine&&live&&<><button onClick={onBell} aria-label="订阅消息"><Bell size={19}/></button><button onClick={onAd}>AD</button></>}
   </div></div>
   <div ref={stage} className={s.stageLines} onScroll={e=>{const el=e.currentTarget;followStage.current=el.scrollHeight-el.scrollTop-el.clientHeight<35;}}>
   {lines.length===0&&<p className={s.stageEmpty}>{mine?"说点什么，开始你的直播。":"正在接入直播…"}</p>}
   {lines.map(l=>{const speaker=state.channels.find(c=>c.id===(l.speakerId||host.id));const guest=l.speakerId&&l.speakerId!==host.id;return l.kind==="action"?<p className={s.stageAction} key={l.id}><em>{l.original}</em></p>:<div className={s.utterance} key={l.id}>{guest&&<b className={s.guestName}>{speaker?.name||stream.calls.find(c=>c.id===l.speakerId)?.name||"连线观众"}：</b>}<div className={s.speechText}>{speaker&&speaker.ownerType!=="npc"&&<button className={s.speaker} aria-label="播放原文语音" onClick={()=>onSpeak(l.original,speaker)}><Volume2 size={16}/></button>}<span>{l.original}</span>{!mine&&l.translated&&l.translated!==l.original&&<small>{l.translated}</small>}{mine&&guest&&l.translated!==l.original&&<small>{l.translated}</small>}</div></div>;})}
   </div>
   <div className={s.stageFoot}><div><strong>{stream.title}</strong>{stream.titleTranslated&&stream.titleTranslated!==stream.title&&<span className={s.liveTitleTranslation}>{stream.titleTranslated}</span>}<button className={s.hostLink} onClick={onChannel}>{host.name} · {live?`${Math.max(0,Math.floor((clock-stream.startedAt)/60000))} 分钟前开播`:"直播回放"}</button></div>{live&&<button onClick={onCalls} className={waiting?s.ringing:""} aria-label="电话连线"><Phone size={20}/>{waiting>0&&<i>{waiting}</i>}</button>}</div>
  </section>
  <section className={s.chatPanel}><div className={s.chatHeading}><b>实时聊天</b>{live&&<button disabled={busy} onClick={mine?onReact:onCalls}>{mine?"看评论":"连线主播"}</button>}</div>
  <div ref={comments} className={s.comments} onScroll={e=>{const el=e.currentTarget;followComments.current=el.scrollHeight-el.scrollTop-el.clientHeight<35;}}>
   {rows.map(c=><div className={c.tip?s.tip:s.comment} key={c.id}><b>{c.name}{c.tip?`  ${c.tip.amount.toLocaleString()} ${c.tip.currency}`:""}</b><span>{translations[c.id]?c.translated:c.original}</span>{c.translated!==c.original&&<button onClick={()=>setTranslations(p=>({...p,[c.id]:!p[c.id]}))}>{translations[c.id]?"原文":"翻译"}</button>}</div>)}
  </div></section>
  {live&&<div className={s.composer}>{mine&&<button className={s.kindButton} onClick={()=>setKind(p=>p==="speech"?"action":"speech")}>{kind==="speech"?"语":"动"}</button>}<input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();send(false);}}} placeholder={mine?(kind==="speech"?"说点什么…":"写下你的动作…"):"发送聊天消息…"}/><button disabled={busy} onClick={()=>send(true)} aria-label="发送并召唤"><Plane/></button></div>}
 </div>;
}
