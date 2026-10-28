import type { VoiceApiConfig } from "./settings-types";
export type ElevenLabsModelOption = { id: string; name: string };
export function parseElevenLabsModels(data: unknown): ElevenLabsModelOption[] {
    if (!Array.isArray(data)) throw new Error("模型列表格式无效");
    const seen = new Set<string>();
    const models = data.flatMap(row => {
        if (!row || typeof row !== "object") return [];
        const item = row as Record<string, unknown>;
        if (item.can_do_text_to_speech !== true || typeof item.model_id !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(item.model_id) || seen.has(item.model_id)) return [];
        seen.add(item.model_id);
        return [{ id: item.model_id, name: typeof item.name === "string" && item.name.trim() ? `${item.name.trim()} (${item.model_id})` : item.model_id }];
    });
    if (!models.length) throw new Error("接口未返回可用于语音合成的模型");
    return models;
}
export async function fetchElevenLabsModels(config: VoiceApiConfig): Promise<ElevenLabsModelOption[]> {
    const base = (config.baseUrl?.trim() || "https://api.elevenlabs.io/v1").replace(/\/+$/, "");
    const official = base === "https://api.elevenlabs.io/v1";
    const response = await fetch(official ? "/api/voice/elevenlabs-models" : `${base}/models`, {
        method: official ? "POST" : "GET",
        headers: official ? { "Content-Type": "application/json" } : { "xi-api-key": config.apiKey.trim() },
        ...(official ? { body: JSON.stringify({ apiKey: config.apiKey.trim() }) } : {}),
        signal: AbortSignal.timeout(25_000), cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`模型读取失败（HTTP ${response.status}）：${typeof data?.message === "string" ? data.message : "请检查 API Key、权限或代理地址"}`);
    return parseElevenLabsModels(data);
}
