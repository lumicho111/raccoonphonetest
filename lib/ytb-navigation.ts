export type YtbScreen = { type: "channel" | "editor" | "studio" | "stream" | "thread" | "group" | "data"; id: string } | { type: "all" };
export type YtbRoute = { screen: YtbScreen | null; tab: string; messageTab: string; channelTab: string };
export type YtbNavigation = { current: YtbRoute; history: YtbRoute[] };
export const initialYtbNavigation = (): YtbNavigation => ({ current: { screen: null, tab: "home", messageTab: "dm", channelTab: "video" }, history: [] });
function key(route: YtbRoute) { return route.screen ? `${route.screen.type}:${"id" in route.screen ? route.screen.id : ""}` : `root:${route.tab}`; }
/** Forward navigation records the actual origin. Existing destinations unwind rather than form cycles. */
export function navigateYtb(nav: YtbNavigation, screen: YtbScreen | null, patch: Partial<Omit<YtbRoute, "screen">> = {}, ownChannelId?: string): YtbNavigation {
  const current = { ...nav.current, ...patch, screen };
  if (screen?.type === "channel" && screen.id === ownChannelId) { current.screen = null; current.tab = "mine"; }
  if (key(current) === key(nav.current)) return { ...nav, current };
  const index = nav.history.findIndex(route => key(route) === key(current));
  if (index >= 0) return { current: { ...nav.history[index], ...patch, screen: current.screen, tab: current.tab }, history: nav.history.slice(0, index) };
  return { current, history: [...nav.history, nav.current] };
}
/** Back only pops; it never calls the forward opener. */
export function backYtb(nav: YtbNavigation): YtbNavigation {
  return nav.history.length ? { current: nav.history.at(-1)!, history: nav.history.slice(0, -1) } : { ...nav, current: { ...nav.current, screen: null } };
}
export function replaceYtb(nav: YtbNavigation, screen: YtbScreen | null, patch: Partial<Omit<YtbRoute, "screen">> = {}, ownChannelId?: string): YtbNavigation {
  const next = navigateYtb({ ...nav, history: [] }, screen, patch, ownChannelId);
  return { current: next.current, history: nav.history };
}

/** A deletion is not forward navigation. Drop destinations whose backing data no longer exists. */
export function afterYtbChannelDeletion(nav:YtbNavigation,state:{channels:Array<{id:string}>;streams:Array<{id:string}>;threads:Array<{id:string}>;groups:Array<{id:string}>}):YtbNavigation{
 const valid=(r:YtbRoute)=>{const s=r.screen;if(!s||s.type==='all')return true;if(s.type==='stream')return state.streams.some(x=>x.id===s.id);if(s.type==='thread')return state.threads.some(x=>x.id===s.id);if(s.type==='group')return state.groups.some(x=>x.id===s.id);return state.channels.some(x=>x.id===s.id);};
 const history=nav.history.filter(valid),index=history.findIndex(r=>r.screen?.type==='all');
 return {current:{...nav.current,screen:{type:'all'}},history:index>=0?history.slice(0,index):history};
}
