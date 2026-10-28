"use client";
import { useContext, useEffect, useState } from "react";
import { SettingsContext } from "../phone-settings-app";
import { loadMediaPreferences, saveMediaPreferences, MEDIA_APPS, type MediaApp, type MediaPreference, type MediaPreferences } from "@/lib/media-preferences";
const options = <><option value="text">文字优先</option><option value="balanced">平衡</option><option value="free">自由判断</option></>;
export function AiBehaviorSettings() {
  const { setSubpageTitle, setOverrideBack } = useContext(SettingsContext);
  const [value, setValue] = useState<MediaPreferences>(() => loadMediaPreferences());
  const [apps, setApps] = useState(false);
  useEffect(() => { setSubpageTitle(apps ? "应用单独设置" : "AI 行为"); setOverrideBack(apps ? () => () => setApps(false) : null); return () => { setSubpageTitle(null); setOverrideBack(null); }; }, [apps, setSubpageTitle, setOverrideBack]);
  const update = (next: MediaPreferences) => { setValue(next); saveMediaPreferences(next); };
  return <div className="page-menu" style={{ padding: 20 }}>{!apps ? <><label className="ai-media-row"><span>AI 配图倾向</span><select value={value.global} onChange={event => update({ ...value, global: event.target.value as MediaPreference })}>{options}</select></label><p className="ai-media-note">控制 AI 主动内容的配图倾向，不影响手动添加图片或相册来源策略。</p><button type="button" className="ai-media-row" onClick={() => setApps(true)}>应用单独设置 <span>›</span></button></> : Object.entries(MEDIA_APPS).map(([id, label]) => <label key={id} className="ai-media-row"><span>{label}</span><select value={value.apps[id as MediaApp] || "inherit"} onChange={event => { const next = { ...value.apps }; if (event.target.value === "inherit") delete next[id as MediaApp]; else next[id as MediaApp] = event.target.value as MediaPreference; update({ ...value, apps: next }); }}><option value="inherit">跟随全局</option>{options}</select></label>)}</div>;
}
