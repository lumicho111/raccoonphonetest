'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, Plus, Paperclip, ArrowUp, Square, MoreHorizontal, Archive, Trash2, Download, Settings, Moon, LogOut, Copy, RefreshCw, Pencil, Pin, X, Share2 } from 'lucide-react';
import { loadOffstage, saveOffstage, newOffSession, generateOffstage, type OffState, type OffAttachment, type OffMessage } from '@/lib/offstage';
import { loadApiConfigs } from '@/lib/settings-storage';
import { loadCharacters } from '@/lib/character-storage';
import { loadChatSessions, loadChatMessages } from '@/lib/chat-storage';
import { loadNativeTimeline } from '@/lib/short-term-assembler';
import { loadMemoryEntries } from '@/lib/memory-storage';
import './offstage.css';
export function OffstageApp({ onClose }: {
    onClose: () => void;
}) {
    const [s, setS] = useState<OffState>(loadOffstage), [side, setSide] = useState(false), [search, setSearch] = useState(''), [archives, setArchives] = useState(false), [settings, setSettings] = useState(false), [sources, setSources] = useState(false), [text, setText] = useState(''), [attachments, setAttachments] = useState<OffAttachment[]>([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [charId, setCharId] = useState(''), [sourceKind, setSourceKind] = useState('card'), [sourceText, setSourceText] = useState(''), [sourceName, setSourceName] = useState(''), [chatId, setChatId] = useState(''), [count, setCount] = useState(50), [editing, setEditing] = useState<string | null>(null), [editText, setEditText] = useState('');
    const [renameTarget,setRenameTarget]=useState<string|null>(null),[renameTitle,setRenameTitle]=useState('');
    const [sessionMenu,setSessionMenu]=useState<string|null>(null);
    const composer=useRef<HTMLTextAreaElement>(null);
    const controller = useRef<AbortController | null>(null), touch = useRef<number | null>(null), bottom = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null);
    const session = s.sessions.find(x => x.id === s.active) || s.sessions[0], configs = loadApiConfigs(), chars = loadCharacters(), sessions = loadChatSessions().filter(x => x.contactId === charId || x.participantIds?.includes(charId));
    useEffect(() => { saveOffstage(s); }, [s]);
    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [session?.messages.length, busy]);
    useEffect(()=>{const el=composer.current;if(!el)return;el.style.height='40px';if(text)el.style.height=`${Math.min(140,Math.max(40,el.scrollHeight))}px`},[text]);
    function updateSession(patch: Partial<typeof session>,id=session.id){setS(v=>({...v,sessions:v.sessions.map(x=>x.id===id?{...x,...patch,updatedAt:Date.now()}:x)}))}
    function fresh() { if (busy)
        return; const n = newOffSession(); setS(v => ({ ...v, active: n.id, sessions: [n, ...v.sessions] })); setText(''); setAttachments([]); setSide(false); setArchives(false); }
    async function run(history: OffMessage[]) { if (busy)
        return; const target = session.id; controller.current = new AbortController(); setBusy(true); setNotice(''); try {
        const answer = await generateOffstage(s, history, controller.current.signal);
        setS(v => ({ ...v, sessions: v.sessions.map(x => x.id === target ? { ...x, messages: [...history, { id: crypto.randomUUID(), role: 'assistant', content: answer }], updatedAt: Date.now() } : x) }));
    }
    catch (e) {
        setNotice(e instanceof Error && e.name === 'AbortError' ? '已停止生成' : e instanceof Error ? e.message : '生成失败，可重试');
    }
    finally {
        setBusy(false);
        controller.current = null;
    } }
    function send() { if (!text.trim() && !attachments.length || busy)
        return; const msg: OffMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim(), attachments }; const history = [...session.messages, msg]; updateSession({ messages: history, title: session.messages.length ? session.title : text.trim().slice(0, 22) || '资料讨论' }); setText(''); setAttachments([]); void run(history); }
    function remove(id=session.id){if(!confirm('删除这段幕后对话？'))return;const rows=s.sessions.filter(x=>x.id!==id);if(!rows.length)rows.push(newOffSession());setS({...s,sessions:rows,active:s.active===id?rows[0].id:s.active});setSessionMenu(null)}
    async function regenerate(id:string,index:number){if(busy)return;const target=session.id;const history=session.messages.slice(0,index);controller.current=new AbortController();setBusy(true);setNotice('');try{const content=await generateOffstage(s,history,controller.current.signal);setS(v=>({...v,sessions:v.sessions.map(x=>x.id===target?{...x,messages:x.messages.map(m=>m.id===id?{...m,content}:m),updatedAt:Date.now()}:x)}))}catch(e){setNotice(e instanceof Error&&e.name==='AbortError'?'已停止，保留原回复':e instanceof Error?e.message:'重新生成失败，已保留原回复')}finally{setBusy(false);controller.current=null}}
    async function share(){const body=session.messages.map(m=>`${m.role==='user'?'我':'幕后'}：${m.content}`).join('\n\n');if(navigator.share){try{await navigator.share({title:session.title,text:body});return}catch(e){if(e instanceof Error&&e.name==='AbortError')return}}download()}
    function download() { const body = `# ${session.title}\n\n` + session.messages.map(m => `## ${m.role === 'user' ? '我' : '幕后'}\n\n${m.content}\n\n` + (m.attachments || []).map(a => `### 资料：${a.name}\n${a.text || '[图片附件，随JSON备份保存]'}`).join('\n')).join('\n\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' })); a.download = '幕后对话.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);  }
    async function upload(files: FileList | null) { if (!files)
        return; try {
        const added: OffAttachment[] = [];
        for (const f of Array.from(files).slice(0, 9 - attachments.length)) {
            if (f.size > 5 * 1024 * 1024)
                throw Error('单个附件请控制在5MB以内');
            if (f.type.startsWith('image/')) {
                const image = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(f); });
                added.push({ id: crypto.randomUUID(), name: f.name, image });
            }
            else if (/\.(txt|md|json|csv|js|ts|html|css|log)$/i.test(f.name)) {
                const value = await f.text();
                if (value.length > 60000)
                    throw Error('文本附件过长，请分段');
                added.push({ id: crypto.randomUUID(), name: f.name, text: value });
            }
            else
                throw Error('当前支持图片和文本文件（TXT、MD、JSON等）');
        }
        setAttachments(a => [...a, ...added]);
    }
    catch (e) {
        setNotice(e instanceof Error ? e.message : '附件读取失败');
    } }
    async function readSource() { setNotice(''); try {
        const c = chars.find(x => x.id === charId);
        if (!c)
            throw Error('请选择角色');
        let value = '';
        if (sourceKind === 'card') {
            value = JSON.stringify(c, null, 2);
        }
        else if (sourceKind === 'chat') {
            const selected = sessions.find(x => x.id === chatId);
            if (!selected)
                throw Error('请选择聊天会话');
            const rows = loadChatMessages(selected.id, count);
            value = rows.map(m => `${m.createdAt} ${m.role === 'user' ? '用户' : m.role === 'assistant' ? (chars.find(x => x.id === m.senderCharacterId)?.name || c.name) : '系统'}：${m.content}${m.mediaData?.label ? ' [' + m.mediaData.label + ']' : ''}`).join('\n');
        }
        else if (sourceKind === 'short') {
            value = loadNativeTimeline(charId).slice(-count).map(x => `${x.timestamp} [${x.sourceApp}] ${x.content}`).join('\n\n');
        }
        else {
            const rows = await loadMemoryEntries(charId);
            value = rows.filter(x => sourceKind === 'core' ? x.type === 'core' : x.type === 'long_term').map(x => `${x.createdAt}\n${x.content}`).join('\n\n');
        }
        setSourceText(value);
        setSourceName(`${c.name} · ${sourceKind === 'card' ? '角色资料' : sourceKind === 'chat' ? '聊天记录' : sourceKind === 'core' ? '核心记忆' : sourceKind === 'short' ? '近期时间线／短期资料' : '长期记忆'}`);
    }
    catch (e) {
        setNotice(e instanceof Error ? e.message : '读取失败');
    } }
    const modal = (body: React.ReactNode, close: () => void) => <div className="off-modal-mask" onClick={close}><section className="off-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}><button className="off-modal-close" aria-label="关闭" onClick={close}><X size={19}/></button>{body}{notice && <p role="status">{notice}</p>}</section></div>;
    return <div className="off-app" data-dark={s.dark} onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={e => { const x = touch.current; touch.current = null; if (x !== null && x < 40 && e.changedTouches[0].clientX - x > 65)
        setSide(true); }}>
 <header><button aria-label="打开侧边栏" onClick={()=>setSide(true)}><Menu/></button><div className="off-heading"><strong title={session.title}>{session.title}</strong><button onClick={()=>setSettings(true)}>{s.model||configs.find(c=>c.id===s.apiId)?.defaultModel||'选择模型'}⌄</button></div><button aria-label="分享对话" onClick={()=>void share()}><Share2 size={21}/></button></header>
 <main>{!session.messages.length && <div className="off-welcome"><h2>今天想聊些什么？</h2><p>讨论人设、剧情与角色表现。你可以附加小手机资料，也可以直接聊。</p></div>}{session.messages.map((m, i) => <article key={m.id} data-role={m.role}><div className="off-attachments">{m.attachments?.map(a => <details key={a.id}><summary>{a.name}</summary>{a.image ? <img src={a.image} alt={a.name}/> : <pre>{a.text}</pre>}</details>)}</div>{editing === m.id ? <><textarea value={editText} onChange={e => setEditText(e.target.value)}/><button onClick={() => { updateSession({ messages: session.messages.map(x => x.id === m.id ? { ...x, content: editText } : x) }); setEditing(null); }}>保存</button><button onClick={() => { const history = [...session.messages.slice(0, i), { ...m, content: editText }]; updateSession({ messages: history }); setEditing(null); void run(history); }}>保存并重新生成</button><button onClick={() => setEditing(null)}>取消</button></> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>}<div className="off-message-tools">{m.role==='assistant'?<><button aria-label="复制回复" onClick={()=>void navigator.clipboard.writeText(m.content).then(()=>setNotice('已复制')).catch(()=>setNotice('浏览器不允许复制'))}><Copy size={17}/></button><button disabled={busy} aria-label="重新生成这条回复" onClick={()=>void regenerate(m.id,i)}><RefreshCw size={17}/></button><button disabled={busy} aria-label="删除这条回复" onClick={()=>updateSession({messages:session.messages.filter(x=>x.id!==m.id)})}><Trash2 size={17}/></button></>:<><button disabled={busy} aria-label="编辑消息" onClick={()=>{setEditing(m.id);setEditText(m.content)}}><Pencil size={15}/></button><button disabled={busy} aria-label="删除消息" onClick={()=>updateSession({messages:session.messages.filter(x=>x.id!==m.id)})}><Trash2 size={15}/></button></>}</div></article>)}{busy && <p role="status">正在思考…</p>}<div ref={bottom}/></main>
 <footer>{notice && <p role="status">{notice}</p>}<div className="off-attachments">{attachments.map(a => <button key={a.id} onClick={() => setAttachments(v => v.filter(x => x.id !== a.id))}>{a.name} ×</button>)}</div><div className="off-composer"><button aria-label="关联小手机角色数据与附件" disabled={busy} onClick={() => setSources(true)}><Paperclip size={22}/></button><textarea ref={composer} rows={1} placeholder="和幕后聊聊…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        send();
    } }}/><button className="off-send" aria-label={busy ? '停止生成' : '发送'} onClick={() => busy ? controller.current?.abort() : send()}>{busy ? <Square size={17}/> : <ArrowUp size={21}/>}</button></div><input ref={file} hidden type="file" multiple accept="image/*,.txt,.md,.json,.csv,.js,.ts,.html,.css,.log" onChange={e => { void upload(e.target.files); e.target.value = ''; }}/></footer>
 {side && <div className="off-sidebar-mask" onClick={() => setSide(false)}><aside className="off-sidebar" onClick={e => e.stopPropagation()}><div className="off-side-head"><strong>幕后</strong><button disabled={busy} aria-label="新聊天" onClick={fresh}><Pencil size={21}/></button><button aria-label="关闭侧栏" onClick={() => setSide(false)}><X size={20}/></button></div><input placeholder="搜索对话" value={search} onChange={e => setSearch(e.target.value)}/><button disabled={busy} onClick={fresh}><Plus size={20}/>新聊天</button><div className="off-history"><small>{archives ? '归档对话' : '历史对话'}</small>{s.sessions.filter(x => x.archived === archives && (!search || `${x.title} ${x.messages.map(m => m.content).join(' ')}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt).map(x => <div className="off-history-row" key={x.id}><button disabled={busy} data-active={x.id === session.id} onClick={() => { setS(v => ({ ...v, active: x.id })); setAttachments([]); setText(''); setSide(false); }}>{x.pinned ? '⌑ ' : ''}{x.title}</button><button aria-label={`对话选项：${x.title}`} disabled={busy} onClick={()=>setSessionMenu(x.id)}><MoreHorizontal size={19}/></button></div>)}</div><button onClick={() => setArchives(v => !v)}><Archive size={19}/>{archives ? '全部对话' : '归档对话'}</button><button onClick={() => { setSettings(true); setSide(false); }}><Settings size={19}/>设置</button><div className="off-side-bottom"><button onClick={() => setS(v => ({ ...v, dark: !v.dark }))}><Moon size={18}/>{s.dark ? '浅色模式' : '深色模式'}</button><button onClick={onClose}><LogOut size={18}/>退出</button></div></aside></div>}
 {sessionMenu && modal(<><h3>{s.sessions.find(x=>x.id===sessionMenu)?.title||'对话选项'}</h3><button onClick={()=>{const row=s.sessions.find(x=>x.id===sessionMenu);setRenameTarget(sessionMenu);setRenameTitle(row?.title||'');setSessionMenu(null)}}><Pencil size={17}/>重命名</button><button onClick={()=>{const row=s.sessions.find(x=>x.id===sessionMenu);updateSession({pinned:!row?.pinned},sessionMenu);setSessionMenu(null)}}><Pin size={17}/>{s.sessions.find(x=>x.id===sessionMenu)?.pinned?'取消置顶':'置顶'}</button><button onClick={()=>{const row=s.sessions.find(x=>x.id===sessionMenu);updateSession({archived:!row?.archived},sessionMenu);setSessionMenu(null)}}><Archive size={17}/>{s.sessions.find(x=>x.id===sessionMenu)?.archived?'取消归档':'归档'}</button><button onClick={()=>remove(sessionMenu)}><Trash2 size={17}/>删除</button></>,()=>setSessionMenu(null))}
 {renameTarget && modal(<><h3>重命名对话</h3><input aria-label="对话名称" value={renameTitle} maxLength={100} onChange={e=>setRenameTitle(e.target.value)}/><button disabled={!renameTitle.trim()} onClick={()=>{updateSession({title:renameTitle.trim()},renameTarget);setRenameTarget(null)}}>保存</button></>,()=>setRenameTarget(null))}
 {settings && modal(<><h3>幕后设置</h3><label>API 配置<select value={s.apiId} onChange={e => { const c = configs.find(c => c.id === e.target.value); setS(v => ({ ...v, apiId: e.target.value, model: c?.defaultModel || '' })); }}><option value="">请选择</option>{configs.map(c => <option key={c.id} value={c.id}>{c.name || c.provider} · {c.defaultModel}</option>)}</select></label><label>模型名称<input value={s.model} placeholder="使用所选配置的默认模型" onChange={e => setS(v => ({ ...v, model: e.target.value }))}/></label><p>使用设置里已有的 API 配置，不绑定扮演角色。仅发送本对话及你手动附加的资料。</p></>, () => setSettings(false))}
 {sources && modal(<><h3>关联小手机角色数据</h3><button onClick={()=>{setSources(false);file.current?.click()}}><Paperclip size={18}/>上传图片或文本附件</button><select value={charId} onChange={e => { setCharId(e.target.value); setChatId(''); setSourceText(''); }}><option value="">选择角色</option>{chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={sourceKind} onChange={e => { setSourceKind(e.target.value); setSourceText(''); }}><option value="card">角色资料</option><option value="chat">聊天记录</option><option value="core">核心记忆</option><option value="long">长期记忆</option><option value="short">短期资料（近期时间线）</option><option value="manual">手动资料／短期内容</option></select>{sourceKind === 'chat' && <><select value={chatId} onChange={e => { setChatId(e.target.value); setSourceText(''); }}><option value="">选择会话</option>{sessions.map(x => <option value={x.id} key={x.id}>{x.id} · {x.updatedAt}</option>)}</select><label>最近消息条数<input type="number" min={1} max={500} value={count} onChange={e => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}/></label></>}{sourceKind !== 'manual' && <button onClick={() => void readSource()}>读取资料</button>}<input placeholder="资料名称" value={sourceName} onChange={e => setSourceName(e.target.value)}/><textarea rows={8} placeholder="预览、编辑或粘贴资料；只附加这里显示的内容" value={sourceText} onChange={e => setSourceText(e.target.value)}/><button disabled={!sourceText.trim()} onClick={() => { if (sourceText.length > 60000) {
        setNotice('资料过长，请选择更小的范围');
        return;
    } setAttachments(a => [...a, { id: crypto.randomUUID(), name: sourceName || '参考资料', text: sourceText }]); setSources(false); setSourceText(''); }}>附加到本轮</button></>, () => setSources(false))}
 </div>;
}
