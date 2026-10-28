import { splitBilingualText, normalizeBilingualTextInput } from "./bilingual-text";
export type OfflineTextSegment = { kind: "text"; text: string } | { kind: "dialogue"; original: string; translated: string };
/** Read-only display parsing. Keep stored original|translation data intact.
 * A translation outside the closing quote belongs to the preceding speech,
 * up to its line boundary; never absorb the following narration paragraph. */
export function parseOfflineDialogue(input: string): OfflineTextSegment[] {
    const text = normalizeBilingualTextInput(input);
    const quotes = /「([^」]*)」|⌈([^⌋]*)⌋|“([^”\n]*)”/g;
    const parts: OfflineTextSegment[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = quotes.exec(text))) {
        if (match.index > cursor) parts.push({ kind: "text", text: text.slice(cursor, match.index) });
        const raw = match[1] ?? match[2] ?? match[3] ?? "";
        const pair = splitBilingualText(raw.replace(/｜/g, "|"));
        const original = pair?.original || raw;
        let translated = pair?.translated || "";
        let end = quotes.lastIndex;
        if (!translated) {
            const suffix = /^[ \t]*(?:\r?\n[ \t]*)?[|｜][ \t]*(?:「([^」\r\n]*)」|⌈([^⌋\r\n]*)⌋|“([^”\r\n]*)”|([^\r\n「⌈“]*))/.exec(text.slice(end));
            const candidate = suffix && (suffix[1] ?? suffix[2] ?? suffix[3] ?? suffix[4] ?? "");
            if (suffix && candidate?.trim()) {
                translated = candidate.trim();
                // Preserve trailing whitespace as narration, rather than hiding it with the translation.
                end += suffix[0].trimEnd().length;
            }
        }
        if (original.trim()) parts.push({ kind: "dialogue", original: original.trim(), translated: translated.trim() });
        else parts.push({ kind: "text", text: text.slice(match.index, end) });
        cursor = end;
        quotes.lastIndex = end;
    }
    if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
    return parts;
}
export function offlineTextCount(text: string): number {
    return Array.from(parseOfflineDialogue(text).map(p => p.kind === "text" ? p.text : p.original).join("").replace(/\s/g, "")).length;
}
