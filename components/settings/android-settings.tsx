"use client";
import {useEffect,useState} from 'react';
import {App} from '@capacitor/app';
import {readAndroidServiceOrigin,saveAndroidServiceOrigin} from '@/lib/android-runtime';
export function AndroidSettings({onNotice}:{onNotice:(text:string)=>void}){
 const [origin,setOrigin]=useState(readAndroidServiceOrigin),[version,setVersion]=useState('');
 useEffect(()=>{void App.getInfo().then(i=>setVersion(`${i.version} (${i.build})`)).catch(()=>{});},[]);
 return <div className="settings-form android-settings"><section className="app-card" style={{padding:20}}><h3>安卓应用 {version}</h3><p style={{opacity:.65,lineHeight:1.7}}>一般使用不必填写。仅在使用原网站的语音代理、公共社区等服务时，填写原网站地址；不是聊天或网易云 API 地址。</p><label style={{display:'grid',gap:10,marginTop:16}}>网站后台连接（选填）<input className="ui-input" type="url" placeholder="https://你的原网站域名" value={origin} onChange={e=>setOrigin(e.target.value)}/></label><button className="ui-btn ui-btn-primary" style={{marginTop:16}} onClick={()=>{try{setOrigin(saveAndroidServiceOrigin(origin));onNotice('网站后台连接（选填）已保存。');}catch(e){onNotice(e instanceof Error?e.message:'地址无效');}}}>保存</button><p style={{opacity:.65,lineHeight:1.7}}>只填写自己信任的网站。以后安装同包名、同签名的新版 APK 覆盖更新，不要先卸载。浏览器数据需从「数据管理」导入备份。</p></section></div>;
}
