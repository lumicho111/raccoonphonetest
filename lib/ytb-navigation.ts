export type YtbScreen = { type: "channel" | "editor" | "studio" | "stream" | "thread" | "group" | "data"; id: string } | { type: "all" };
export type YtbRoute = { screen: YtbScreen | null; tab: string; messageTab: string; channelTab: string };
export type YtbNavigation = { current: YtbRoute; history: YtbRoute[] };
export const initialYtbNavigation = (): YtbNavigation => ({ current: { screen: null, tab: "home", messageTab: "dm", channelTab: "live" }, history: [] });
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
