'use client';
import {createPortal} from 'react-dom';
import {useEffect} from 'react';
import {X} from 'lucide-react';
import type {VideoSnapshot} from '@/lib/ytb-video-storage';
import s from './ytb-video.module.css';
export function YtbVideoSnapshotWindow({snapshot,onClose}:{snapshot:VideoSnapshot;onClose:()=>void}){
 useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[onClose]);
 return createPortal(<div className={`${s.mask} ${s.fixed}`} onClick={onClose}><section className={s.dialog} role="dialog" aria-modal="true" aria-label="YouTube 视频快照" onClick={e=>e.stopPropagation()}><header className={s.dialogHeader}><h2>YouTube · 分享快照</h2><button onClick={onClose} aria-label="关闭"><X size={18}/></button></header><div className={s.body}>{snapshot.cover&&<img className={s.snapshotCover} src={snapshot.cover} alt="视频封面"/>}<h3>{snapshot.title}</h3>{snapshot.titleZh&&snapshot.titleZh!==snapshot.title&&<p className={s.translation}>{snapshot.titleZh}</p>}<p className={s.hint}>{snapshot.authors.map(a=>`${a.name} ${a.handle}`).join(' × ')} · {new Date(snapshot.publishedAt).toLocaleDateString()}</p>{snapshot.description&&<p className={s.description}>{snapshot.description}</p>}{snapshot.descriptionZh&&snapshot.descriptionZh!==snapshot.description&&<p className={s.translation}>{snapshot.descriptionZh}</p>}<div className={s.contentBox}><b>视频内容</b><p className={s.contentText}>{snapshot.content}</p>{snapshot.contentZh&&snapshot.contentZh!==snapshot.content&&<p className={s.translation}>{snapshot.contentZh}</p>}</div><p className={s.hint}>分享时保存的内容快照</p></div></section></div>,document.body);
}
