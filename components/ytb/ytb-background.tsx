"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Play, X } from "lucide-react";
import { loadYtbState, saveYtbState, YTB_UPDATED, type YtbStream } from "@/lib/ytb-storage";
import { expireYtbStreams } from "@/lib/ytb-runtime";
import s from "./ytb-app.module.css";

/** Mounted by the shell so schedule-driven endings survive every app switch. */
export function useYoutubeBackground() {
 const [live,setLive]=useState<YtbStream|null>(null);
 useEffect(()=>{
  const sync=()=>{const state=loadYtbState();setLive(state.streams.find(s=>s.id===state.backgroundId&&s.status==="live")||null);};
  sync();window.addEventListener(YTB_UPDATED,sync);
  const timer=window.setInterval(()=>{const current=loadYtbState(),next=expireYtbStreams(current);if(next!==current)saveYtbState(next);else sync();},3000);
  return()=>{clearInterval(timer);window.removeEventListener(YTB_UPDATED,sync);};
 },[]);
 return live;
}
export function YoutubeBackground({live,onOpen,fallback}:{live:YtbStream|null;onOpen:()=>void;fallback:ReactNode}) {
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>setExpanded(false),[live?.id]);
 if(!live)return <>{fallback}</>;
 const latest=live.lines.filter(l=>l.at<=Date.now()).at(-1);
 return <div className={`status-island music-island${expanded?" music-island-expanded":""} ${s.youtubeIsland}`}>
 {!expanded?<button className="music-island-compact" onClick={()=>setExpanded(true)} aria-label="展开 Youtube 后台直播"><span className={s.islandLogo}><Play size={10} fill="white"/></span><span className="music-island-compact-name">{live.title}</span><span className={s.islandLive}>直播</span></button>:<div className="music-island-detail">
 <div className="music-island-head"><button className="music-island-art" onClick={onOpen} aria-label="返回直播">{live.cover?<img src={live.cover} alt=""/>:<Play size={22}/>}</button><button className="music-island-title" onClick={onOpen}><strong>{live.title}</strong><small>{live.titleTranslated||"Youtube · 正在直播"}</small></button><button className="music-island-collapse" onClick={()=>setExpanded(false)} aria-label="收起">⌃</button></div>
 <p className={s.islandCaption}>{latest?.original||"直播正在后台进行"}</p><div className={s.islandActions}><button onClick={onOpen}>返回直播</button><button onClick={()=>{saveYtbState({...loadYtbState(),backgroundId:null});setExpanded(false);}} aria-label="停止后台播放"><X size={13}/>停止后台播放</button></div>
 </div>}
 </div>;
}
