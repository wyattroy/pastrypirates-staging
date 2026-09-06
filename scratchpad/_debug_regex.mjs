const ownerLine = "- [ ] The row that actually OWNS this handle, filed SECOND in the document.\n      ⟨`T-500`⟩";
console.log(JSON.stringify(ownerLine));
const re = /^\s*⟨`T-(\d{3})`[^⟩]*⟩\s*$/gm;
console.log("matches:", [...ownerLine.matchAll(re)]);
