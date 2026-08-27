#!/usr/bin/env node
// scripts/bakeoff_recipe_check.js
//
// Gates v2/src/shared/recipe-steps.js — the five-step order the bake-off tests you on.
//
// WHY THIS EXISTS. Every failure in this table is invisible at runtime. An order that isn't a
// permutation of its own recipe produces a bench the player cannot solve; a missing entry silently
// falls back to a different order than the card shows; a line with a digit in it renders "1 1 Cream
// the butter". None of these throw. The first anyone would know is losing a bake they played
// correctly, and being unable to prove it.
//
// Run: node scripts/bakeoff_recipe_check.js

import { RECIPE_STEPS, recipeSteps } from "../v2bakeoff/src/shared/recipe-steps.js";
import { ING_ALL } from "../v2bakeoff/src/shared/index.js";
import { RECIPE_BOOK } from "../v2bakeoff/src/ui/recipe.js";

let failures=0;
const fail=(m)=>{failures++;console.log("FAIL "+m);};
const pass=(m)=>console.log("PASS "+m);

/* ---- 1. the keyspace is exactly C(ING_ALL,5), generated combinatorially ----
   Derived from ING_ALL rather than read off RECIPE_BOOK on purpose: if an eighth ingredient is ever
   added, this fails loudly with a list of missing recipes instead of quietly testing 21 of 56. */
function combos(arr,k){
  if(k===0)return [[]];
  if(arr.length<k)return [];
  const [h,...t]=arr;
  return combos(t,k-1).map(c=>[h,...c]).concat(combos(t,k));
}
const expect=combos(ING_ALL,5).map(c=>c.slice().sort().join("|")).sort();
const actual=Object.keys(RECIPE_STEPS).sort();
const missing=expect.filter(k=>!actual.includes(k));
const stray=actual.filter(k=>!expect.includes(k));
if(missing.length||stray.length)
  fail(`keyspace mismatch — ${missing.length} missing, ${stray.length} stray`+
       (missing.length?"\n  missing: "+missing.slice(0,5).join("\n           "):"")+
       (stray.length?"\n  stray:   "+stray.slice(0,5).join("\n           "):""));
else pass(`keyspace is exactly the ${expect.length} five-of-seven combinations`);

/* ---- 2. every RECIPE_BOOK entry resolves, both directions ---- */
{
  const unresolved=RECIPE_BOOK.filter(r=>!recipeSteps(r.ings));
  if(unresolved.length)fail("recipes with no step order: "+unresolved.map(r=>r.title).join(", "));
  else pass(`all ${RECIPE_BOOK.length} recipes in the book resolve to a step order`);
}

/* ---- 3. `ings` is a PERMUTATION of its own key — the load-bearing check ----
   One comparison catches a duplicate, an omission and a stray ingredient at once. */
{
  const bad=[];
  for(const [key,e] of Object.entries(RECIPE_STEPS)){
    if(e.ings.slice().sort().join("|")!==key)bad.push(`${key} -> [${e.ings}]`);
  }
  if(bad.length)fail("step order is not a permutation of its recipe:\n  "+bad.join("\n  "));
  else pass("every step order is a permutation of its own five ingredients");
}

/* ---- 4. shape: five and five, and every id is real ---- */
{
  const bad=[];
  for(const [key,e] of Object.entries(RECIPE_STEPS)){
    if(e.ings.length!==5)bad.push(key+" has "+e.ings.length+" ingredients");
    if(e.lines.length!==5)bad.push(key+" has "+e.lines.length+" lines");
    e.ings.forEach(i=>{if(!ING_ALL.includes(i))bad.push(key+" names unknown ingredient "+i);});
  }
  if(bad.length)fail("shape:\n  "+bad.join("\n  "));
  else pass("every entry is five ingredients and five lines, all ids known");
}

/* ---- 5. the copy rules ----
   ≤34 chars is the 360px one-line budget; a digit would collide with the ordinal the UI prefixes. */
{
  const LIMIT=34;
  const bad=[];
  let longest=0,longestTxt="";
  for(const [key,e] of Object.entries(RECIPE_STEPS)){
    e.lines.forEach((l,k)=>{
      if(!l||!l.trim())bad.push(key+" line "+(k+1)+" is empty");
      if(l.length>LIMIT)bad.push(`${key} line ${k+1} is ${l.length} chars (>${LIMIT}): "${l}"`);
      if(/\d/.test(l))bad.push(`${key} line ${k+1} contains a digit: "${l}"`);
      if(!/^[A-Z]/.test(l))bad.push(`${key} line ${k+1} does not start with a capital: "${l}"`);
      if(l.length>longest){longest=l.length;longestTxt=l;}
    });
  }
  if(bad.length)fail("copy rules:\n  "+bad.join("\n  "));
  else pass(`copy rules hold (longest line ${longest}/${LIMIT} — "${longestTxt}")`);
}

/* ---- 6. every ingredient is named once and only once across a recipe's lines ----
   Not enforceable by text (the prose deliberately says "butter" for dairy and "cocoa" for cocoa),
   so this checks the ARRAY instead, which is what the icons are drawn from. */
{
  const bad=[];
  for(const [key,e] of Object.entries(RECIPE_STEPS)){
    const seen=new Set(e.ings);
    if(seen.size!==5)bad.push(key+" repeats an ingredient: ["+e.ings+"]");
  }
  if(bad.length)fail("duplicates:\n  "+bad.join("\n  "));
  else pass("no recipe uses the same ingredient at two steps");
}

console.log(failures?("\n"+failures+" FAILED"):"\nrecipe step data is sound");
process.exit(failures?1:0);
