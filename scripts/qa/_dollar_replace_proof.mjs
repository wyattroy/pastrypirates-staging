// throwaway proof, deleted by the watch that wrote it — see CTO-LEDGER 2026-09-02T18:19Z
const src = "HEAD\nBODY\nTAIL";
const payload = "X " + String.fromCharCode(36) + "` Y";
console.log("string replacement :", JSON.stringify(src.replace("BODY", payload)));
console.log("function replacement:", JSON.stringify(src.replace("BODY", () => payload)));
