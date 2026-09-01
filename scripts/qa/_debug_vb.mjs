const vbRaw = "151.57894736842104 194.24561403508767 336.8421052631579 336.8421052631579";
const vbParts = vbRaw ? vbRaw.trim().split(/[\s,]+/).map(Number) : null;
const vb = (vbParts && vbParts.length === 4 && vbParts.every(Number.isFinite)) ? vbParts : null;
console.log(JSON.stringify({ vbParts, vb }));
