import {kvGet,kvSet,registerKvMigration} from './kv-db';
import {readThemeProfile,writeThemeProfile} from './theme-storage';
const KEY='ai_phone_builtin_apple_font_v1';
const PREVIOUS='ai_phone_before_builtin_apple_theme_v1';
registerKvMigration(KEY);registerKvMigration(PREVIOUS);
/** Apply the user's supplied bundled font once; subsequent font choices remain theirs. */
export function ensureBuiltinAppleFont(){if(kvGet(KEY))return;const before=readThemeProfile();kvSet(PREVIOUS,JSON.stringify(before));writeThemeProfile({...before,fontFamily:'PhoneAppleBuiltIn, "PingFang SC", system-ui, sans-serif',fontAssetId:null,cssOverrides:{...before.cssOverrides,'--app-font-family':'PhoneAppleBuiltIn, "PingFang SC", system-ui, sans-serif'}});kvSet(KEY,'1')}
