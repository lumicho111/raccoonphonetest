"use client";

import { Check, ChevronLeft, Trash2 } from "lucide-react";
import { Input } from "../ui/form";
import type { CalendarBusyLevel, CalendarColorKey } from "@/lib/calendar-types";
import { CALENDAR_COLOR_KEYS } from "@/lib/calendar-utils";

export type CalendarEventDraft = {
  visibility?: "public"|"private"; kind?: "event"|"milestone"; publicAt?:string;
  id?: string;
  date: string;
  /** 结束日期（含当天）；留空视为单天。跨多天时保存会按天生成日程 */
  endDate?: string;
  startTime: string;
  endTime: string;
  location: string;
  title: string;
  emoji: string;
  colorKey?: CalendarColorKey;
  busyLevel?: CalendarBusyLevel;
  externalSource?: "weverse";
  externalId?: string;
  sharedGroupId?: string;
  sharedCharacterIds?: string[];
};

const EMOJI_PRESETS = [
  "📌", "💼", "📚", "💻", "🏃", "🏋️", "🍽️", "☕", "🎬",
  "🎮", "🎵", "🛒", "🛍️", "✈️", "🏥", "📞", "💤", "❤️",
  "🎂", "🎨", "🧹", "🐾",
];

const COLOR_LABELS: Record<CalendarColorKey, string> = {
  blue: "蓝",
  green: "绿",
  amber: "橙",
  rose: "粉",
  violet: "紫",
  teal: "青",
  slate: "灰",
  lilac: "丁香",
};

export function CalendarEventEditModal({
  draft,
  onChange,
  onSave,
  onDelete,
  onSync,
  onClose,
  showBusyLevel = true,
}: {
  draft: CalendarEventDraft;
  onChange: (next: CalendarEventDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onSync?: () => void;
  onClose: () => void;
  showBusyLevel?: boolean;
}) {
  return (
    <div className="modal-overlay calendar-edit-modal-overlay" onClick={onClose}>
      <div className="calendar-edit-modal" data-ui="calendar-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header" data-ui="modal-header">
          <button onClick={onClose} className="modal-header-btn modal-header-btn-muted" aria-label="返回">
            <ChevronLeft size={18} />
          </button>
          <span className="modal-header-title">{draft.id ? "编辑日程" : "新增日程"}</span>
          <button onClick={onSave} className="modal-header-btn modal-header-btn-action" aria-label="保存">
            <Check size={18} />
          </button>
        </div>

        <div className="modal-body hide-scrollbar flex flex-col gap-3 pb-10" data-ui="modal-body">
          <label>可见范围<select value={draft.visibility||"private"} onChange={e=>onChange({...draft,visibility:e.target.value as "public"|"private"})}><option value="private">私人／内部安排</option><option value="public">公开</option></select></label>
          <label>类型<select value={draft.kind||"event"} onChange={e=>onChange({...draft,kind:e.target.value as "event"|"milestone"})}><option value="event">实际行程 · 占用时间</option><option value="milestone">公开节点 · 不占用时间</option></select></label>
          {draft.visibility==="public"&&<label>消息公开时间（可不填，默认立即公开）<input type="datetime-local" value={draft.publicAt||""} onChange={e=>onChange({...draft,publicAt:e.target.value||undefined})}/></label>}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="menu-desc ml-1">开始日期</label>
              <Input
                type="date"
                value={draft.date}
                onChange={e => {
                  const nextDate = e.target.value;
                  const currentEnd = draft.endDate || draft.date;
                  // 结束日期跟随开始日期，除非用户已把结束日期改到更晚
                  onChange({ ...draft, date: nextDate, endDate: currentEnd > nextDate ? currentEnd : nextDate });
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="menu-desc ml-1">结束日期</label>
              <Input
                type="date"
                value={draft.endDate || draft.date}
                min={draft.date}
                onChange={e => onChange({ ...draft, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="menu-desc ml-1">开始时间</label>
              <Input
                type="time"
                value={draft.startTime}
                onChange={e => onChange({ ...draft, startTime: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="menu-desc ml-1">结束时间</label>
              <Input
                type="time"
                value={draft.endTime}
                onChange={e => onChange({ ...draft, endTime: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="menu-desc ml-1">事项</label>
            <Input
              value={draft.title}
              onChange={e => onChange({ ...draft, title: e.target.value })}
              placeholder="例如：部门周会"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="menu-desc ml-1">地点</label>
            <Input
              value={draft.location}
              onChange={e => onChange({ ...draft, location: e.target.value })}
              placeholder="例如：公司会议室 / 家里 / 商场"
            />
          </div>

          {showBusyLevel && (
            <div className="flex flex-col gap-1">
              <label className="menu-desc ml-1">忙碌程度</label>
              <select
                className="ui-input"
                value={draft.busyLevel ?? 1}
                onChange={event => onChange({ ...draft, busyLevel: Number(event.target.value) as CalendarBusyLevel })}
              >
                <option value={1}>可以立刻回</option>
                <option value={2}>短暂回几句</option>
                <option value={3}>看了没空回</option>
                <option value={4}>不能看手机</option>
              </select>
              <span className="menu-desc ml-1">忙时挂起开启后按此状态决定是否延迟回复；AI 生成的日程会自动匹配，可手动调整。</span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="menu-desc ml-1">图标（点选，再点一次取消）</label>
            <div className="calendar-emoji-row">
              {draft.emoji && !EMOJI_PRESETS.includes(draft.emoji) ? (
                <button
                  type="button"
                  className="calendar-emoji-preset"
                  data-active="true"
                  onClick={() => onChange({ ...draft, emoji: "" })}
                  aria-label={`取消 ${draft.emoji}`}
                >
                  {draft.emoji}
                </button>
              ) : null}
              {EMOJI_PRESETS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  className="calendar-emoji-preset"
                  data-active={draft.emoji === emoji ? "true" : undefined}
                  onClick={() => onChange({ ...draft, emoji: draft.emoji === emoji ? "" : emoji })}
                  aria-label={`使用 ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="menu-desc ml-1">颜色</label>
            <div className="calendar-color-picker">
              <button
                type="button"
                className="calendar-color-swatch calendar-color-swatch-auto"
                data-active={!draft.colorKey ? "true" : undefined}
                onClick={() => onChange({ ...draft, colorKey: undefined })}
              >
                自动
              </button>
              {CALENDAR_COLOR_KEYS.map(key => (
                <button
                  key={key}
                  type="button"
                  className="calendar-color-swatch"
                  data-color={key}
                  data-active={draft.colorKey === key ? "true" : undefined}
                  onClick={() => onChange({ ...draft, colorKey: key })}
                  aria-label={`颜色：${COLOR_LABELS[key]}`}
                  title={COLOR_LABELS[key]}
                />
              ))}
            </div>
          </div>

          {draft.id ? (
            <div className="flex flex-col gap-2">
              {onSync ? (
                <button type="button" className="ui-btn ui-btn-outline" onClick={onSync}>
                  同步给其他角色
                </button>
              ) : null}
              <button type="button" className="ui-btn ui-btn-outline calendar-delete-btn" onClick={onDelete}>
                <Trash2 size={16} />
                删除该事项
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
