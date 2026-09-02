// src/ui/recipe.js
//
// Phase 11 (SPLIT-03/06) tracer wave. The FIRST UI cluster extracted out of the classic
// <script> region, proving the "move verbatim + import rewiring + bridge grows + gates green"
// pattern once (11-01) before the remaining ~174 functions fan out across 11-02..11-06.
//
// Purity bar for src/ui/: reads DOM and game state, NEVER imports src/net/ (D-07) — the single
// most safety-critical directional rule this whole phase exists to enforce. UI code may call
// into net-published functions only through handler injection from main (the existing net->UI
// seam Phase 9 established stays in that direction), never via a direct import here.
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]

import { ASSET_BASE, ING_NAME, ING_PLAIN, iname, ingImg } from "../shared/index.js";
import { appState } from "../state/index.js";

// `$` is a classic-script-local `const $=id=>document.getElementById(id)` (index.html:863),
// used ~129 times across the still-classic region — far beyond this cluster's own two consumers
// (openRecipeModal, wireRecipeModal) — so it cannot be "moved" here without breaking every other
// classic call site. Reproduced verbatim as a private module-local helper instead; the classic
// script keeps its own untouched copy. A later extraction wave that empties the classic script
// entirely is what finally lets a single `$` live in one place.
const $=id=>document.getElementById(id);

export function escHtml(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
// ---- the recipe book: 21 signature pastries, one per 5-of-7 ingredient combination ----
// Ingredient keys: dairy=Milk, vanilla=Vanilla, wheat=Flour, cocoa=Chocolate,
// sugar=Sugar, spice=Cinnamon, eggs=Eggs.
// `real` (yield/ingredients/steps) is the actual bakeable recipe behind each card, sourced from
// notes/pastry_pirates_recipes.md — shown in the in-game recipe modal (see openRecipeModal).
// Ingredient list entries prefixed "## " render as a sub-header (for recipes with parts, e.g.
// a base + filling) instead of a bullet.
// exported (rather than kept module-private, as it was before FIX-08) so scripts/narration_test.js  [UNGATED-IN-4: narration_test.js reads the root tree, not this one]
// can enumerate every entry's {ings,title,article} and match its assertions by title text, never
// by array index — the same discipline recipeInfo()'s ings-based lookup already keys on.
export const RECIPE_BOOK=[
  {ings:["dairy","wheat","cocoa","sugar","spice"], title:"Spiced Cocoa Shortbread",
    article:"a",
    desc:"Buttery, melt-in-your-mouth shortbread biscuits infused with warm cinnamon and rich cocoa.",
    real:{yield:"about 24 cookies",
      ingredients:["225 g (1 cup / 2 sticks) unsalted butter, softened","100 g (½ cup) granulated sugar, plus 2 tbsp extra for rolling",
        "2 tbsp (30 ml) whole milk","250 g (2 cups) all-purpose flour","40 g (⅓ cup) unsweetened cocoa powder",
        "2 tsp ground cinnamon, plus 1 tsp extra for rolling","½ tsp fine sea salt","100 g (3.5 oz) dark chocolate, chopped (optional, for dipping)"],
      steps:["Cream the butter and sugar together on medium speed for 2–3 minutes until pale and fluffy. Beat in the milk.",
        "Whisk together the flour, cocoa powder, 2 tsp cinnamon, and salt in a separate bowl, then add to the butter mixture and mix on low until just combined.",
        "Turn the dough onto plastic wrap and shape into a log about 5 cm (2 in) in diameter. Chill for at least 2 hours (or freeze 30 minutes).",
        "Preheat oven to 165°C (325°F). Mix the extra sugar and cinnamon on a plate. Slice the log into 1 cm (⅓ in) rounds and roll edges in the cinnamon-sugar.",
        "Bake 15–18 minutes until set but not browned. Cool completely on the pan.",
        "Optional: melt the chopped chocolate and dip half of each cookie, then let set on parchment."]}},
  {ings:["dairy","wheat","cocoa","sugar","eggs"], title:"Molten Chocolate Lava Cake",
    article:"a",
    desc:"A decadent, warm chocolate cake with an oozing, liquid fudge center.",
    real:{yield:"4 individual cakes",
      ingredients:["115 g (½ cup / 1 stick) unsalted butter, plus extra for greasing","115 g (4 oz) bittersweet or dark chocolate (60–70%), chopped",
        "2 tbsp (30 ml) whole milk","2 large eggs","2 large egg yolks","60 g (¼ cup + 2 tbsp) granulated sugar",
        "30 g (¼ cup) all-purpose flour","Pinch of salt","Cocoa powder, for dusting ramekins","Powdered sugar and vanilla ice cream, to serve"],
      steps:["Preheat oven to 220°C (425°F). Butter four 170 ml (6 oz) ramekins and dust with cocoa powder, tapping out the excess.",
        "Melt the butter and chocolate together in a double boiler or microwave in 20-second bursts, stirring until smooth. Whisk in the milk.",
        "In a separate bowl, whisk the eggs, egg yolks, and sugar until pale and slightly thickened, about 2 minutes.",
        "Fold the chocolate mixture into the egg mixture, then gently fold in the flour and salt until just combined.",
        "Divide batter among the ramekins and bake 12–14 minutes, until the sides are set but the center still jiggles slightly.",
        "Let rest 1 minute, then run a knife around the edge and invert onto plates. Dust with powdered sugar and serve immediately."]}},
  {ings:["dairy","wheat","cocoa","spice","eggs"], title:"Mayan Cocoa Soufflé",
    article:"a",
    desc:"A soaring, dramatic chocolate soufflé highlighting the dark, complex notes of pure cocoa and cinnamon.",
    real:{yield:"4 ramekins",
      ingredients:["Softened butter and granulated sugar, for coating ramekins","250 ml (1 cup) whole milk","30 g (2 tbsp) unsalted butter",
        "30 g (¼ cup) all-purpose flour","100 g (3.5 oz) dark chocolate, melted","1 tsp ground cinnamon",
        "Pinch of cayenne pepper (optional, for a Mayan-style kick)","80 g (⅓ cup + 1 tbsp) granulated sugar, divided",
        "4 large egg yolks","5 large egg whites","Pinch of cream of tartar or salt"],
      steps:["Preheat oven to 190°C (375°F). Butter four 240 ml (8 oz) ramekins and coat with sugar, tapping out excess.",
        "Melt the butter in a saucepan, whisk in the flour, and cook 1 minute. Gradually whisk in the milk and cook until thickened, 2–3 minutes.",
        "Remove from heat and whisk in the melted chocolate, cinnamon, cayenne, and 40 g of the sugar. Cool slightly, then whisk in the egg yolks one at a time.",
        "In a clean bowl, whip the egg whites with the cream of tartar until foamy, then gradually add the remaining sugar and whip to stiff, glossy peaks.",
        "Fold a third of the egg whites into the chocolate base to lighten it, then gently fold in the rest.",
        "Divide among ramekins, run your thumb around the inside rim to help it rise evenly, and bake 16–18 minutes until puffed and just set. Serve immediately."]}},
  {ings:["dairy","wheat","sugar","spice","eggs"], title:"Cinnamon-Sugar Churros",
    article:"",
    desc:"Crispy, golden pastry dough tossed in a sweet, crackly cinnamon-sugar shell.",
    real:{yield:"about 20 churros, serves 4–6",
      ingredients:["240 ml (1 cup) water","60 ml (¼ cup) whole milk","60 g (4 tbsp) unsalted butter","2 tbsp granulated sugar",
        "½ tsp salt","150 g (1¼ cups) all-purpose flour","2 large eggs","Neutral oil (vegetable or canola), for frying",
        "Coating: 100 g (½ cup) granulated sugar mixed with 2 tbsp ground cinnamon"],
      steps:["Combine the water, milk, butter, 2 tbsp sugar, and salt in a saucepan and bring to a boil.",
        "Remove from heat and add the flour all at once, stirring vigorously with a wooden spoon until a smooth dough forms. Return to low heat for 1 minute, stirring, to dry it out slightly.",
        "Transfer dough to a bowl and let cool 5 minutes, then beat in the eggs one at a time until fully smooth and glossy.",
        "Heat oil to 175°C (350°F) in a deep pot. Pipe 12–15 cm (5–6 in) lengths of dough directly into the oil using a star-tip piping bag, snipping with scissors.",
        "Fry 2–3 minutes per side until deep golden. Drain on paper towels.",
        "While still warm, toss the churros in the cinnamon-sugar mixture until fully coated. Serve with warm chocolate or dulce de leche for dipping, if desired."]}},
  {ings:["dairy","cocoa","sugar","spice","eggs"], title:"Mexican Chocolate Torte",
    article:"a",
    desc:"An ultra-fudgy, dense chocolate cake whipped with eggs and spiced with sweet cinnamon.",
    real:{yield:"one 23 cm (9 in) cake, 10–12 slices",
      ingredients:["225 g (8 oz) dark chocolate (60–70%), chopped","225 g (1 cup / 2 sticks) unsalted butter, plus extra for the pan",
        "200 g (1 cup) granulated sugar","5 large eggs, room temperature","2 tsp ground cinnamon","Pinch of cayenne pepper (optional)",
        "Pinch of salt","Cocoa powder, for the pan",
        "## Milk chocolate glaze","100 g (3.5 oz) milk chocolate, chopped","80 ml (⅓ cup) whole milk"],
      steps:["Preheat oven to 175°C (350°F). Butter a 23 cm (9 in) springform pan, line the base with parchment, and dust with cocoa powder.",
        "Melt the dark chocolate and butter together over a double boiler until smooth. Whisk in the sugar, cinnamon, cayenne, and salt.",
        "Whisk in the eggs one at a time, beating well after each addition until the batter is glossy and slightly thickened (this whipping is what gives the torte its lift, since there's no flour).",
        "Pour into the prepared pan and bake 30–35 minutes, until the top is set and the center jiggles only slightly. Cool completely in the pan — the torte will sink a little and become dense and fudgy as it cools.",
        "Warm the milk and pour over the chopped milk chocolate; let sit 2 minutes, then stir until smooth. Pour the glaze over the cooled torte and let set before slicing."]}},
  {ings:["wheat","cocoa","sugar","spice","eggs"], title:"Spiced Fudge Brownies",
    article:"",
    desc:"Deep, dark brownies with a gorgeous shiny crust and a dense, chewy center.",
    real:{yield:"16 brownies (20 cm / 8 in square pan)",
      ingredients:["170 g (¾ cup / 1½ sticks) unsalted butter","200 g (7 oz) dark chocolate, chopped","300 g (1½ cups) granulated sugar",
        "3 large eggs","90 g (¾ cup) all-purpose flour","30 g (¼ cup) unsweetened cocoa powder","2 tsp ground cinnamon","½ tsp salt"],
      steps:["Preheat oven to 175°C (350°F). Line a 20 cm (8 in) square pan with parchment, leaving overhang on two sides.",
        "Melt the butter and chocolate together until smooth. Whisk in the sugar until glossy.",
        "Beat in the eggs one at a time, whisking vigorously after each addition — this builds the shiny, crackly top.",
        "Fold in the flour, cocoa powder, cinnamon, and salt just until no streaks remain; do not overmix.",
        "Pour into the pan and spread evenly. Bake 25–30 minutes, until a toothpick comes out with a few moist crumbs.",
        "Cool completely in the pan before lifting out and cutting into 16 squares."]}},
  {ings:["dairy","vanilla","wheat","cocoa","sugar"], title:"Caramel Slice",
    article:"a",
    desc:"A toasted-coconut shortbread base, a thick layer of chewy milk caramel, and a clean snap of chocolate on top — the classic Aussie tearoom treat.",
    real:{yield:"one 20 x 30 cm (8 x 12 in) pan, about 24 squares",
      ingredients:["## Coconut shortbread base","150 g (1 cup) all-purpose flour","90 g (1 cup) shredded coconut, toasted",
        "75 g (⅓ cup packed) brown sugar","125 g (½ cup + 1 tbsp / 1 stick + 1 tbsp) unsalted butter, melted","½ tsp vanilla extract","Pinch of salt",
        "## Caramel filling","800 g (two 14 oz / 395 g cans) sweetened condensed milk","60 g (4 tbsp) unsalted butter",
        "60 g (3 tbsp) golden syrup (light corn syrup or honey work as substitutes)","1 tsp vanilla extract","Pinch of salt",
        "## Chocolate topping","200 g (7 oz) dark or milk chocolate, chopped","20 g (4 tsp) coconut oil or unsalted butter (keeps the topping glossy and easy to slice)"],
      steps:["Preheat oven to 160°C (325°F). Line a 20 x 30 cm (8 x 12 in) pan with parchment, leaving overhang on two sides.",
        "Toast the shredded coconut in a dry skillet or in the oven for 3–5 minutes, stirring often, until golden and fragrant. Watch closely — it goes from toasted to burnt fast. Let cool slightly.",
        "Stir together the flour, toasted coconut, brown sugar, and salt. Add the melted butter and vanilla and mix until the texture resembles wet sand and holds together when pressed.",
        "Press the mixture firmly and evenly into the base of the pan. Bake 15–18 minutes until light golden. Set aside to cool (leave the oven on).",
        "Combine the condensed milk, butter, golden syrup, and a pinch of salt in a saucepan over medium-low heat. Stir constantly for 10–15 minutes until thickened and a deep golden caramel color — constant stirring is essential here so the milk solids don't scorch on the bottom of the pan. Remove from heat and stir in the vanilla.",
        "Pour the caramel over the cooled base and spread evenly. Bake 8–10 minutes more, until set but still slightly wobbly in the center — this brief bake is what lets the caramel hold a clean layer instead of oozing when sliced. Cool completely, then chill at least 1 hour.",
        "Melt the chocolate and coconut oil together until smooth, then pour over the chilled caramel layer and spread evenly. Chill until fully set, at least 30–60 minutes.",
        "To cut clean squares, let the slice sit at room temperature for 5 minutes, then use a knife warmed under hot water and wiped dry between each cut."]}},
  {ings:["dairy","vanilla","wheat","cocoa","spice"], title:"Cinnamon Snaps",
    article:"",
    desc:"Crisp, rustic butter biscuits celebrating aromatic vanilla and warming cinnamon.",
    real:{yield:"about 30 cookies",
      ingredients:["170 g (¾ cup / 1½ sticks) unsalted butter, softened","150 g (¾ cup) granulated sugar (added — even a \"snap\" cookie needs sugar to caramelize)",
        "1 tsp vanilla extract","2 tbsp (30 ml) whole milk","250 g (2 cups) all-purpose flour","2 tsp ground cinnamon, plus extra for rolling",
        "½ tsp salt","60 g (⅓ cup) finely chopped dark chocolate or mini chips"],
      steps:["Cream the butter, sugar, and vanilla until light and fluffy, about 2 minutes. Beat in the milk.",
        "Whisk the flour, cinnamon, and salt together, then mix into the butter mixture on low speed until just combined. Fold in the chopped chocolate.",
        "Divide the dough in half and roll each into a log about 4 cm (1½ in) in diameter. Roll the outside in extra cinnamon for a decorative crust. Chill at least 2 hours.",
        "Preheat oven to 175°C (350°F). Slice the logs into thin, 3 mm (⅛ in) rounds.",
        "Bake 10–12 minutes until the edges are golden brown. Cool completely on the pan — they crisp up fully as they cool, giving that signature snap."]}},
  {ings:["dairy","vanilla","wheat","sugar","spice"], title:"Snickerdoodle Bites",
    article:"",
    desc:"Pillowy-soft butter cookies rolled in sweet cinnamon-sugar and pure vanilla.",
    real:{yield:"about 30 mini cookies",
      ingredients:["170 g (¾ cup / 1½ sticks) unsalted butter, softened","200 g (1 cup) granulated sugar",
        "1 large egg (added — this is what gives snickerdoodles their signature soft chew)","1 tsp vanilla extract",
        "280 g (2¼ cups) all-purpose flour","2 tsp cream of tartar","1 tsp baking soda","¼ tsp salt",
        "Coating: 50 g (¼ cup) sugar mixed with 1 tbsp ground cinnamon",
        "## Vanilla-milk glaze","120 g (1 cup) powdered sugar","2–3 tbsp (30–45 ml) whole milk","½ tsp vanilla extract"],
      steps:["Cream the butter and sugar until light and fluffy, about 2 minutes. Beat in the egg and vanilla.",
        "Whisk together the flour, cream of tartar, baking soda, and salt, then mix into the wet ingredients until just combined.",
        "Preheat oven to 175°C (350°F). Scoop the dough into 2 cm (¾ in) balls, roll each in the cinnamon-sugar coating, and place on a lined baking sheet.",
        "Bake 8–9 minutes — they'll look slightly underdone but will firm up as they cool. Cool completely.",
        "Whisk the powdered sugar, milk, and vanilla into a smooth glaze and drizzle over the cooled cookies."]}},
  {ings:["dairy","vanilla","cocoa","sugar","spice"], title:"Cinnamon-Chocolate Fudge",
    article:"a",
    desc:"A quick-set, melt-in-your-mouth chocolate fudge layered with warm spice and vanilla.",
    real:{yield:"36 pieces (20 cm / 8 in square pan)",
      ingredients:["400 g (14 oz) sweetened condensed milk","340 g (12 oz / 2 cups) semisweet or dark chocolate chips",
        "50 g (¼ cup) granulated sugar","30 g (2 tbsp) unsalted butter","1 tsp vanilla extract","1½ tsp ground cinnamon","Pinch of salt"],
      steps:["Line a 20 cm (8 in) square pan with parchment, leaving overhang on two sides.",
        "Combine the condensed milk, sugar, and butter in a saucepan over low heat, stirring until the sugar dissolves and the butter melts.",
        "Add the chocolate chips and stir constantly until fully melted and smooth, 5–7 minutes — do not let it boil.",
        "Remove from heat and stir in the vanilla, cinnamon, and salt.",
        "Pour into the prepared pan, smooth the top, and chill at least 2–3 hours until firm.",
        "Lift out using the parchment overhang and cut into 3 cm (1¼ in) squares."]}},
  {ings:["vanilla","wheat","cocoa","sugar","spice"], title:"Crispy Cocoa Snaps",
    article:"",
    desc:"Thin, highly satisfying cookies with a loud snap and deep spiced chocolate notes.",
    real:{yield:"about 30 wafers",
      ingredients:["170 g (¾ cup / 1½ sticks) unsalted butter, softened","150 g (¾ cup) granulated sugar","1 tsp vanilla extract",
        "220 g (1¾ cups) all-purpose flour","40 g (⅓ cup) unsweetened cocoa powder","2 tsp ground cinnamon","¼ tsp salt"],
      steps:["Cream the butter, sugar, and vanilla until light and fluffy, about 2 minutes.",
        "Whisk together the flour, cocoa powder, cinnamon, and salt, then mix into the butter mixture until a smooth dough forms (no egg needed — the dough is deliberately lean so it bakes up thin and crisp).",
        "Shape into a log about 4 cm (1½ in) in diameter, wrap tightly, and chill at least 2 hours.",
        "Preheat oven to 165°C (325°F). Slice into 3 mm (⅛ in) thin rounds and place on a lined baking sheet.",
        "Bake 12–14 minutes until just set. Cool completely on the pan before handling — the snap develops fully as they cool."]}},
  {ings:["dairy","vanilla","wheat","cocoa","eggs"], title:"Dark Chocolate Cream Puffs",
    article:"",
    desc:"Golden choux pastry puffs filled with an elegant, bittersweet vanilla-chocolate pastry cream.",
    real:{yield:"12 puffs",
      ingredients:["## Choux pastry","120 ml (½ cup) whole milk","120 ml (½ cup) water","115 g (½ cup / 1 stick) unsalted butter",
        "1 tsp granulated sugar","¼ tsp salt","150 g (1¼ cups) all-purpose flour","4 large eggs",
        "## Chocolate pastry cream","480 ml (2 cups) whole milk","100 g (½ cup) granulated sugar","4 large egg yolks",
        "30 g (¼ cup) cornstarch","100 g (3.5 oz) dark chocolate, chopped","1 tsp vanilla extract","Pinch of salt"],
      steps:["For the choux, bring the milk, water, butter, sugar, and salt to a boil. Remove from heat, add the flour all at once, and stir vigorously until a smooth ball forms. Cook 1 minute over low heat, stirring, to dry it out.",
        "Transfer to a bowl, cool 5 minutes, then beat in the eggs one at a time until the dough is smooth, glossy, and falls in a \"V\" off the spoon.",
        "Preheat oven to 200°C (400°F). Pipe 12 mounds (4 cm / 1½ in) onto a lined baking sheet. Bake 20 minutes, then reduce to 175°C (350°F) and bake 10–15 minutes more until deeply golden and dry. Cool completely, poking a small hole in each to release steam.",
        "For the filling, whisk the sugar, egg yolks, and cornstarch together. Heat the milk to a simmer, then gradually whisk into the yolk mixture to temper. Return to the pan and cook, whisking constantly, until thick, 2–3 minutes.",
        "Off heat, stir in the chocolate, vanilla, and salt until smooth. Press plastic wrap directly onto the surface and chill at least 2 hours.",
        "Pipe the chilled pastry cream into the puffs through the poked hole. Dust with cocoa or powdered sugar before serving."]}},
  {ings:["dairy","vanilla","wheat","sugar","eggs"], title:"Pound Cake",
    article:"a",
    desc:"A dense, rich, buttery cake with a fine, tight crumb and a golden crust — the original \"one pound of everything\" cake, finished with a simple vanilla-milk glaze.",
    real:{yield:"one 25 cm (10 in) tube or bundt cake, 12–14 slices",
      ingredients:["340 g (1½ cups / 3 sticks) unsalted butter, softened, plus extra for the pan","400 g (2 cups) granulated sugar",
        "6 large eggs, room temperature","1½ tsp vanilla extract","350 g (2¾ cups) cake flour (or all-purpose flour), plus extra for the pan",
        "½ tsp salt","¼ tsp baking powder (optional — old-fashioned versions skip it and rely on creaming for lift)","120 ml (½ cup) whole milk, room temperature",
        "## Vanilla glaze","100 g (¾ cup) powdered sugar","2 tbsp (30 ml) whole milk","½ tsp vanilla extract"],
      steps:["Preheat oven to 165°C (325°F). Generously butter and flour a 25 cm (10 in) tube or bundt pan, tapping out excess flour.",
        "Cream the butter and sugar together on medium-high speed for 5–7 minutes, until very pale and fluffy — don't rush this step, it's what gives pound cake its texture.",
        "Add the eggs one at a time, beating well and scraping down the bowl after each addition. Mix in the vanilla.",
        "Whisk together the flour, salt, and baking powder (if using) in a separate bowl.",
        "With the mixer on low, add the flour mixture in three additions, alternating with the milk in two additions, beginning and ending with flour. Mix just until combined — do not overmix.",
        "Pour the batter into the prepared pan, smooth the top, and bake 70–85 minutes, until a toothpick inserted in the center comes out clean. Tent loosely with foil partway through if the top is browning too quickly.",
        "Cool in the pan 15 minutes, then turn out onto a wire rack to cool completely.",
        "Whisk the glaze ingredients together and drizzle over the cooled cake before slicing."]}},
  {ings:["dairy","vanilla","cocoa","sugar","eggs"], title:"French Pots de Crème",
    article:"",
    desc:"Luxurious, spoonable baked custards highlighting premium chocolate and smooth vanilla.",
    real:{yield:"6 ramekins",
      ingredients:["350 ml (1½ cups) whole milk","240 ml (1 cup) heavy cream","170 g (6 oz) dark chocolate (60–70%), chopped",
        "5 large egg yolks","70 g (⅓ cup) granulated sugar","1 tsp vanilla extract","Pinch of salt"],
      steps:["Preheat oven to 150°C (300°F). Bring the milk and cream just to a simmer in a saucepan.",
        "Whisk the egg yolks and sugar together in a bowl until pale. Slowly whisk in the hot milk mixture to temper the eggs.",
        "Add the chopped chocolate to the warm custard and let sit 1 minute, then whisk until completely smooth. Stir in the vanilla and salt.",
        "Strain through a fine sieve into a pitcher, then divide among six 120 ml (4 oz) ramekins.",
        "Place ramekins in a deep baking dish, add hot water halfway up the sides, and bake 30–35 minutes until the edges are set but the centers still jiggle slightly.",
        "Cool, then chill at least 4 hours before serving."]}},
  {ings:["vanilla","wheat","cocoa","sugar","eggs"], title:"Chocolate Genoise Sponge Cake",
    article:"a",
    desc:"A feather-light, delicate sponge cake relying on whipped eggs for its airy lift.",
    real:{yield:"one 20 cm (8 in) cake",
      ingredients:["4 large eggs, room temperature","130 g (⅔ cup) granulated sugar","1 tsp vanilla extract",
        "100 g (¾ cup + 2 tbsp) all-purpose flour","30 g (¼ cup) unsweetened cocoa powder","30 g (2 tbsp) unsalted butter, melted and cooled"],
      steps:["Preheat oven to 165°C (329°F). Butter a 20 cm (8 in) round pan and line the base with parchment.",
        "Combine the eggs, sugar, and vanilla in a heatproof bowl set over a pan of barely simmering water. Whisk until just warm to the touch (about 40°C/104°F).",
        "Remove from heat and whip on high speed for 8–10 minutes until tripled in volume and thick enough to leave a ribbon trail when the whisk is lifted.",
        "Sift the flour and cocoa powder together over the egg mixture in two additions, folding gently each time to avoid deflating the batter.",
        "Fold in the melted butter just until incorporated. Pour into the prepared pan and bake 30–35 minutes, until a toothpick comes out clean.",
        "Cool in the pan 10 minutes, then turn out onto a rack. Best served with whipped cream or a light chocolate glaze."]}},
  {ings:["dairy","vanilla","wheat","spice","eggs"], title:"Cinnamon Dutch Baby",
    article:"a",
    desc:"A dramatic skillet pancake that puffs up in the oven, featuring a custardy center of vanilla and spice.",
    real:{yield:"one 25 cm (10 in) skillet, serves 4",
      ingredients:["3 large eggs, room temperature","120 ml (½ cup) whole milk, room temperature","65 g (½ cup) all-purpose flour",
        "2 tbsp granulated sugar (added — a little sugar helps the custard set and brown)","1 tsp vanilla extract","1½ tsp ground cinnamon",
        "Pinch of salt","45 g (3 tbsp) unsalted butter","Powdered sugar, cinnamon sugar, and lemon wedges, to serve"],
      steps:["Place a 25 cm (10 in) cast-iron skillet in the oven and preheat to 220°C (425°F) — the skillet needs to get very hot.",
        "Blend the eggs, milk, flour, sugar, vanilla, cinnamon, and salt in a blender until completely smooth, about 20 seconds.",
        "Carefully remove the hot skillet, add the butter, and swirl until melted and coating the pan.",
        "Immediately pour in the batter and return to the oven. Bake 20–22 minutes, without opening the oven, until dramatically puffed and deep golden brown.",
        "Serve immediately (it will deflate within minutes), dusted with powdered sugar and cinnamon sugar, with lemon wedges alongside."]}},
  {ings:["dairy","vanilla","cocoa","spice","eggs"], title:"Mexican Chocolate Pots",
    article:"",
    desc:"Silky-smooth custard cups naturally sweetened by vanilla bean and cinnamon.",
    real:{yield:"6 ramekins",
      ingredients:["350 ml (1½ cups) whole milk","240 ml (1 cup) heavy cream","1½ tsp ground cinnamon","Pinch of cayenne pepper (optional)",
        "170 g (6 oz) dark chocolate, chopped","5 large egg yolks","50 g (¼ cup) granulated sugar (added — a touch is needed to balance the spice)","1 tsp vanilla extract"],
      steps:["Preheat oven to 150°C (300°F). Combine the milk, cream, and cinnamon in a saucepan and bring just to a simmer. Remove from heat, cover, and let steep 10 minutes.",
        "Whisk the egg yolks and sugar together until pale. Slowly whisk the warm milk mixture into the yolks to temper.",
        "Stir in the chopped chocolate and cayenne, letting it sit a moment before whisking until smooth. Stir in the vanilla.",
        "Strain into a pitcher and divide among six 120 ml (4 oz) ramekins.",
        "Bake in a water bath (hot water halfway up the ramekin sides) for 30–35 minutes, until set at the edges with a slight jiggle in the center.",
        "Chill at least 4 hours before serving."]}},
  {ings:["vanilla","wheat","cocoa","spice","eggs"], title:"Cocoa Cloud Soufflé",
    article:"a",
    desc:"An airy, intensely rich whipped soufflé celebrating pure, dark chocolate.",
    real:{yield:"4 ramekins",
      ingredients:["Softened butter and granulated sugar, for coating ramekins","150 g (5 oz) dark chocolate, chopped",
        "60 ml (¼ cup) hot water or strong brewed coffee","30 g (2 tbsp) unsalted butter","30 g (¼ cup) all-purpose flour",
        "80 g (⅓ cup + 1 tbsp) granulated sugar, divided (added — essential for the meringue structure)","1 tsp vanilla extract",
        "1 tsp ground cinnamon","4 large egg yolks","5 large egg whites","Pinch of cream of tartar"],
      steps:["Preheat oven to 190°C (375°F). Butter four 240 ml (8 oz) ramekins and coat with sugar.",
        "Melt the chocolate with the hot water/coffee until smooth. In a separate small pan, melt the butter, whisk in the flour, and cook 1 minute; whisk this roux into the melted chocolate until combined.",
        "Remove from heat and stir in 40 g of the sugar, the vanilla, and cinnamon. Cool slightly, then whisk in the egg yolks one at a time.",
        "Whip the egg whites with the cream of tartar until foamy, then gradually add the remaining sugar and whip to stiff, glossy peaks.",
        "Fold a third of the whites into the chocolate base to lighten, then gently fold in the rest, keeping as much air as possible.",
        "Divide among ramekins and bake 16–18 minutes until puffed and set with a slight wobble in the center. Serve immediately."]}},
  {ings:["dairy","vanilla","sugar","spice","eggs"], title:"Vanilla Bean Crème Brûlée",
    article:"a",
    desc:"Velvety baked custard topped with a satisfying, blowtorched glass-like caramelized sugar crust.",
    real:{yield:"6 ramekins",
      ingredients:["500 ml (2 cups) heavy cream","200 ml (¾ cup + 2 tbsp) whole milk","1 vanilla bean, split and scraped (or 2 tsp vanilla bean paste/extract)",
        "1 tsp ground cinnamon","6 large egg yolks","100 g (½ cup) granulated sugar, plus extra for the brûlée topping","Pinch of salt"],
      steps:["Preheat oven to 150°C (300°F). Combine the cream, milk, vanilla bean (pod and scraped seeds), and cinnamon in a saucepan and heat until just simmering. Remove from heat, cover, and steep 15 minutes; remove the pod.",
        "Whisk the egg yolks, sugar, and salt together until pale. Slowly whisk in the warm cream mixture to temper.",
        "Strain through a fine sieve and divide among six 150 ml (5 oz) ramekins. Place in a deep baking dish and add hot water halfway up the sides.",
        "Bake 35–40 minutes until set at the edges but still slightly jiggly in the center. Cool, then chill at least 4 hours (overnight is best).",
        "Before serving, blot any surface moisture, sprinkle an even, thin layer of sugar over each custard, and caramelize with a kitchen torch until deep amber and crackly. Let sit 1–2 minutes for the sugar to harden before serving."]}},
  {ings:["vanilla","wheat","sugar","spice","eggs"], title:"Cinnamon Sponge Cake",
    article:"a",
    desc:"A fluffy, golden cake scented with sweet vanilla and coated in a crisp cinnamon-sugar crust.",
    real:{yield:"one 23 cm (9 in) cake",
      ingredients:["4 large eggs, room temperature","150 g (¾ cup) granulated sugar","1 tsp vanilla extract","120 g (1 cup) all-purpose flour",
        "2 tsp ground cinnamon","½ tsp baking powder","30 g (2 tbsp) unsalted butter, melted and cooled",
        "Coating: 50 g (¼ cup) granulated sugar mixed with 2 tsp ground cinnamon"],
      steps:["Preheat oven to 175°C (350°F). Butter a 23 cm (9 in) round pan and line the base with parchment.",
        "Whip the eggs, sugar, and vanilla on high speed for 8–10 minutes until tripled in volume and thick enough to leave a ribbon trail.",
        "Sift the flour, cinnamon, and baking powder over the egg mixture in two additions, folding gently to keep the batter airy.",
        "Fold in the melted butter just until incorporated. Pour into the pan and bake 25 minutes, until golden and a toothpick comes out clean.",
        "While the cake is still warm, brush lightly with a little extra melted butter and dust generously with the cinnamon-sugar coating, pressing gently so it adheres."]}},
  {ings:["vanilla","cocoa","sugar","spice","eggs"], title:"Chocolate Fudge Torte",
    article:"a",
    desc:"A premium, dense cake utilizing whipped eggs to achieve a velvety, chocolatey mouthfeel.",
    real:{yield:"one 23 cm (9 in) cake, 10–12 slices",
      ingredients:["225 g (8 oz) dark chocolate (60–70%), chopped","225 g (1 cup / 2 sticks) unsalted butter, plus extra for the pan",
        "200 g (1 cup) granulated sugar","5 large eggs, separated, room temperature","1 tsp vanilla extract","1½ tsp ground cinnamon",
        "Pinch of salt","Cocoa powder or powdered sugar, for dusting"],
      steps:["Preheat oven to 175°C (350°F). Butter a 23 cm (9 in) springform pan and line the base with parchment.",
        "Melt the chocolate and butter together over a double boiler until smooth. Remove from heat and whisk in the sugar, vanilla, cinnamon, and salt.",
        "Whisk in the egg yolks one at a time until fully incorporated and glossy.",
        "In a clean bowl, whip the egg whites to soft, floppy peaks. Fold a third into the chocolate mixture to lighten it, then gently fold in the remainder, keeping as much air as possible.",
        "Pour into the prepared pan and bake 30–35 minutes, until the top is set with a slight jiggle in the center.",
        "Cool completely in the pan (the torte will sink and become dense as it cools — this is expected). Dust with cocoa powder or powdered sugar before serving."]}},
];
// one finished-pastry illustration per recipe, in the same order as RECIPE_BOOK above
const PASTRY_FILES=["01-spiced-cocoa-shortbread","02-molten-chocolate-lava-cake","03-mayan-cocoa-souffle",
  "04-cinnamon-sugar-churros","05-mexican-chocolate-torte","06-spiced-fudge-brownies","07-caramel-slice",
  "08-cinnamon-snaps","09-snickerdoodle-bites","10-cinnamon-chocolate-fudge","11-crispy-cocoa-snaps",
  "12-dark-chocolate-cream-puffs","13-pound-cake","14-french-pots-de-creme","15-chocolate-genoise-sponge-cake",
  "16-cinnamon-dutch-baby","17-mexican-chocolate-pots","18-cocoa-cloud-souffle","19-vanilla-bean-creme-brulee",
  "20-cinnamon-sponge-cake","21-chocolate-fudge-torte"];
/* WEBP, NOT PNG — his ruling, INBOX-20260902T0048Z, question UI: "Do it", with /classic sharing
   the converted files. CONVERT, NEVER RESIZE: `.planning/ASSET-DISPLAY-SIZES.md` measured all 21
   at the recipe modal and every one is UNDER-resolution on a phone (512px shipped into a slot
   wanting 692-879 DEVICE pixels), so taking pixels off would visibly soften art he commissioned.
   The pixels are untouched at 512; only the encoding changed, and the family went 1.71 MB -> 1.18
   MB. That weight is on the BOOT path, not the modal, since preloadAssets() started warming
   RECIPE_BOOK's images (src/ui/util.js) -- which is what made half a megabyte worth taking.
   `scripts/qa/recipe_art_exists_check.mjs` evaluates THIS line against the files on disk, in this
   tree and classic's, so the extension cannot drift away from the art again. */
export function attachPastryArt(){
  RECIPE_BOOK.forEach((r,i)=>r.img=`${ASSET_BASE}pastries/${PASTRY_FILES[i]}.webp`);
}
const RECIPE_LOOKUP={};
for(const r of RECIPE_BOOK)RECIPE_LOOKUP[r.ings.slice().sort().join("|")]=r;
export function recipeInfo(recipe){return RECIPE_LOOKUP[recipe.slice().sort().join("|")];}
export function recipeTitle(recipe){
  const info=recipeInfo(recipe);
  if(info)return info.title;
  // fallback for any non-standard ingredient set: a simple ingredient-led name
  const lead=recipe.filter(i=>ING_NAME[i]).slice(0,2).map(i=>iname(i).split(" ").pop());
  return `Captain's ${lead.join(" & ")} Bake`.replace(/\s+/g," ").trim();
}
// FIX-08: the article ("a"/"") that belongs in front of this recipe's title in prose — e.g. the
// win banner's "baked {article }{title}". Each RECIPE_BOOK entry carries its own curated article
// (no pluralisation heuristic — see RESEARCH "Don't Hand-Roll"); recipeTitle()'s own fallback name
// ("Captain's X & Y Bake") is always singular, so an unmatched ingredient set also gets "a".
export function recipeArticle(recipe){
  const info=recipeInfo(recipe);
  return info ? info.article : "a";
}
// clickable recipe name for narration/log text (win banner) — opens the same recipe modal as
// the .prowRecipe row click, via a document-level delegated handler (see wireRecipeModal) since
// narration/log HTML isn't confined to the #players container .prowRecipe's listener covers
export function winRecipeSpan(idx){
  const p=appState.game&&appState.game.players&&appState.game.players[idx];
  if(!p||!p.recipe)return "";
  return `<span class="narrRecipeLink" data-idx="${idx}">📜 ${escHtml(recipeTitle(p.recipe))}</span>`;
}
export function recipeCardHTML(recipe){
  const info=recipeInfo(recipe);
  const items=recipe.map(i=>`<li><span class="ri">${ingImg(i)}</span><span class="rn">${iname(i)}</span><span class="rc">${ING_PLAIN[i]||""}</span></li>`).join("");
  const desc=info?`<div class="recipeDesc">${info.desc}</div>`:"";
  const thumb=info&&info.img?`<img class="recipeThumb" src="${info.img}" alt="">`:"";
  return thumb+`<div class="recipeTitle">${recipeTitle(recipe)}</div>`+desc+
    `<ul class="recipeList">${items}</ul>`;
}
// ---- recipe modal: click a player's recipe name (in the captain's row, once one is chosen) to
// view the full bakeable recipe, print it, or email it. NOT wired onto the initial draft-pick
// cards (recipeCardHTML above) — there, the whole card is already the click-to-select control,
// and nesting a second click target inside it would fight that selection click.
/* D-35 — OPTION C, WITH HIS TWO CHANGES (Wyatt, 2026-08-21, after seeing the real art).
   *"yes, build C with two changes: 1. increase the padding around the bottom of the image (It's too
   cramped against the italicised description). 2. fix the strangely cut-off lighter gradient at the
   top of the images, so that the gradient extends all the way to the line separating the title and
   doesn't create the messy-looking edge."*

   WHAT OPTION C IS, and it is the mechanism rather than the sketch file: the two round print and
   email icons are pinned into the TITLE ROW, and that row is `position:sticky` inside the scrolling
   body — it scrolls away with the title at first, then locks to the top and stays there. That is
   how it satisfies his ORIGINAL item-9 constraint (the Download PDF and Email buttons must clearly
   sit ABOVE the scrolling recipe) without spending a whole row on them. The card's own gradient
   reaching the box edges and DARKENING, not lightening, is the other half of that same constraint
   and is why this modal is no longer parchment — see 4/index.html's § recipeModal.

   THE ORDER FLIPPED, AND THAT IS THE PRECONDITION FOR HIS CHANGE 2. The image used to be drawn
   ABOVE the title. His words put the gradient at the top of the IMAGE and the separator ABOVE it,
   so the gradient reaches UPWARD to meet the title's own rule. That is only possible with the title
   first, which is also what option C shows.

   THE SEPARATOR MOVED FROM THE h2 TO THE ROW THAT NOW CONTAINS IT, and this is stated because it
   changes what a measurement must read. The rule under the title has never been its own element —
   it was the h2's `border-bottom: 3px double #b48a52`. With the two icons now sharing that line,
   the double rule belongs to the row, not to the text inside it. It is the SAME 3px double rule in
   the same colour (rule 8: the double rule is this card's signature), and "the line separating the
   title" is now the row's border-box bottom edge.

   RULE 8 SWEEP, and the honest answer is that the two builders do NOT share a component. Checked
   rather than assumed: recipeCardHTML() immediately above draws the small draft-picker card from a
   completely separate class family (.recipeThumb / .recipeTitle / .recipeDesc, styled at
   4/index.html § recipeCard) and its description is hidden outright on the stage. So it has no
   gradient to cut off and no visible description to be cramped against — neither of D-35's two
   changes has anything to apply to there, and it is deliberately untouched. */
export function recipeModalHTML(recipe){
  const info=recipeInfo(recipe);
  const title=recipeTitle(recipe);
  // The two icons are rebuilt with the card every time it opens, so they are wired by DELEGATION
  // in wireRecipeModal() below rather than by a one-shot onclick at boot — an id handler attached
  // once would be attached to a button that no longer exists the second time the modal is opened.
  const head=`<div class="recipeModalTitleRow"><h2>${escHtml(title)}</h2>`+
    `<button class="recipeIconBtn" data-recipeact="pdf" type="button" title="Download PDF" aria-label="Download PDF">🖨️</button>`+
    `<button class="recipeIconBtn" data-recipeact="email" type="button" title="Email to myself" aria-label="Email to myself">✉️</button>`+
    `</div>`;
  const thumb=info&&info.img
    ?`<div class="recipeModalThumbWrap"><img class="recipeModalThumb" src="${info.img}" alt=""></div>`:"";
  if(!info||!info.real)
    return head+`<div class="recipeModalIn">${thumb}<div class="recipeModalDesc">${info?escHtml(info.desc):""}</div></div>`;
  const r=info.real;
  const ingredientsHTML=r.ingredients.map(line=>line.startsWith("## ")
    ?`</ul><div class="recipeModalSub">${escHtml(line.slice(3))}</div><ul>`
    :`<li>${escHtml(line)}</li>`).join("");
  const stepsHTML=r.steps.map(s=>`<li>${escHtml(s)}</li>`).join("");
  return head+`<div class="recipeModalIn">`+thumb+
    `<div class="recipeModalDesc">${escHtml(info.desc)}</div>`+
    `<div class="recipeModalYield">Yield: ${escHtml(r.yield)}</div>`+
    `<ul>${ingredientsHTML}</ul>`+
    `<div class="recipeModalYield">Steps</div>`+
    `<ol>${stepsHTML}</ol></div>`;
}
let recipeModalCurrent=null; // {title,plain} for the open modal — read by the print/email buttons
export function openRecipeModal(recipe){
  if(!recipe)return;
  $("recipeModalBody").innerHTML=recipeModalHTML(recipe);
  const info=recipeInfo(recipe),title=recipeTitle(recipe),r=info&&info.real;
  const plain=r?`${title}\n\nYield: ${r.yield}\n\nIngredients:\n`+
      r.ingredients.filter(l=>!l.startsWith("## ")).map(l=>"- "+l).join("\n")+
      `\n\nSteps:\n`+r.steps.map((s,i)=>`${i+1}. ${s}`).join("\n")
    :title;
  recipeModalCurrent={title,plain};
  $("recipeModal").style.display="flex";
}
export function wireRecipeModal(){
  $("players").addEventListener("click",e=>{
    const el=e.target.closest(".prowRecipe");
    if(!el||!el.textContent)return;
    const idx=+el.id.replace("prowRecipe","");
    const p=appState.game&&appState.game.players&&appState.game.players[idx];
    if(p&&p.recipe)openRecipeModal(p.recipe);
  });
  // win-narration recipe link: not confined to #players (it renders in the narration panel and
  // captain's log), so this is delegated off the document instead
  document.addEventListener("click",e=>{
    const el=e.target.closest(".narrRecipeLink");
    if(!el)return;
    const idx=+el.dataset.idx;
    const p=appState.game&&appState.game.players&&appState.game.players[idx];
    if(p&&p.recipe)openRecipeModal(p.recipe);
  });
  // D-35/option C: the print and email controls now live INSIDE the card's sticky title row, which
  // recipeModalHTML() rebuilds on every open. So they are reached by delegation off the body rather
  // than by two onclick handlers bound once at boot to ids that get replaced.
  $("recipeModalBody").addEventListener("click",e=>{
    const b=e.target.closest(".recipeIconBtn");
    if(!b)return;
    if(b.dataset.recipeact==="pdf"){window.print();return;}
    if(b.dataset.recipeact==="email"){
      if(!recipeModalCurrent)return;
      const subject=encodeURIComponent(`Pastry Pirates recipe: ${recipeModalCurrent.title}`);
      const body=encodeURIComponent(recipeModalCurrent.plain);
      window.location.href=`mailto:?subject=${subject}&body=${body}`;
    }
  });
}
