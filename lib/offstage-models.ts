import {determineBaseUrl,buildRequestHeaders,isNativeGoogleApi,isNativeAnthropicApi} from './api-helpers';
import type {ApiConfig} from './settings-types';
export async function fetchOffstageModels(config:ApiConfig,signal:AbortSignal):Promise<string[]>{
 const base=determineBaseUrl(config).replace(/\/$/,'').replace(/\/(chat\/completions|completions|embeddings|messages)$/i,'');
 if(!base||!config.apiKey)throw Error('请先在全局 API 设置中完善地址和密钥');
 const endpoint=/\/models$/i.test(base)?base:`${base}/models`;
 const headers=buildRequestHeaders(config,base);
 if(isNativeAnthropicApi(config)){delete headers.Authorization;headers['x-api-key']=config.apiKey;headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';}
 if(isNativeGoogleApi(config)){delete headers.Authorization;headers['x-goog-api-key']=config.apiKey;}
 const response=await fetch(endpoint,{headers,signal});if(!response.ok)throw Error(`拉取模型失败（HTTP ${response.status}），仍可手动输入模型名`);
 const data=await response.json();const rows=Array.isArray(data.models)?data.models:Array.isArray(data.data)?data.data:null;if(!rows)throw Error('接口没有返回模型列表，请手动输入模型名');
 return [...new Set<string>(rows.map((x:{name?:string;id?:string})=>String(x.id||x.name||'').replace(/^models\//,'')).filter(Boolean))].sort();
}
