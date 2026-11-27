import { tireLoads } from '../engine/loads.mjs';

/* ESS Grip Lab — "Brake into a corner. Watch your tires."
   Same steady-state load-transfer math as the Load Transfer Calculator (tools/load-transfer/), with its suspension
   defaults fixed (wheelbase 108 in, tracks 61/60 in, 60% front roll stiffness, roll centers 2/12 in).
   Mount: <div class="glab" data-glab data-tools="tools/load-transfer/" data-article="articles/traction-circle/"></div>
   Sharing: the setup goes in the link's #fragment (never the query string), so it is not sent to the server or to analytics.
   Analytics events (if GA is on the page) carry no numbers: lab_use, lab_share {method}, lab_open_shared. */
(function () {
  var FIX = { wb: 108, tf: 61, tr: 60, kf: 60, zf: 2, zr: 12 };
  var EX = { w: 3300, fp: 54, h: 20, ax: 0.4, ay: 0.9 };
  // One table drives the sliders, the model limits and shared-link validation, so they can never disagree (Q13 #1).
  var LIM = { w: [1800, 5000, 50], fp: [40, 65, 0.5], h: [12, 30, 0.5], ax: [0, 1.2, 0.05], ay: [0, 1.2, 0.05] };
  var KEYS = ["w", "fp", "h", "ax", "ay"];
  var TIRES = [["lf", "Left front"], ["rf", "Right front"], ["lr", "Left rear"], ["rr", "Right rear"]];

  function f0(x) { return Math.round(x).toLocaleString("en-US"); }
  // clamp to the slider range and snap to the slider step
  function clamp(k, x) { var L = LIM[k], v = Math.min(L[1], Math.max(L[0], x)); return +(L[0] + Math.round((v - L[0]) / L[2]) * L[2]).toFixed(2); }
  var NUM = /^\d{1,5}(\.\d{1,3})?$/; // a complete plain number: rejects "3300junk", "Infinity", "", "-1", "1e3"
  function inRange(k, v) { return v >= LIM[k][0] - 1e-9 && v <= LIM[k][1] + 1e-9; }
  function ev(name, p) { try { if (typeof window.gtag === "function") window.gtag("event", name, p || {}); } catch (e) {} }

  // Turning right puts the outside tires on the left.
  function solve(s) {
    var car = { weight:s.w, front:s.fp/100, wheelbase:FIX.wb, cg:s.h, frontTrack:FIX.tf, rearTrack:FIX.tr };
    var options = {frontRoll:FIX.kf/100, frontCenter:FIX.zf, rearCenter:FIX.zr};
    var result = tireLoads(car, s.ax, s.ay, options);
    var parked = carTires(tireLoads(car, 0, 0, options).tires);
    var now = carTires(result.tires);
    return {dx:result.longitudinal, dF:result.front, dR:result.rear,
      F:now.lf+now.rf, R:now.lr+now.rr, now:now, park:parked};
  }

  function carTires(tires) {
    return {lf:tires[0], rf:tires[1], lr:tires[2], rr:tires[3]};
  }

  function readHash() {
    var m = (location.hash || "").match(/^#lab:(.+)$/); if (!m) return null;
    // Strict: every value must be a complete plain number inside the slider range, each key once; otherwise the
    // whole link is treated as broken and the example car is shown with an explanation (Q13 #2).
    var o = {}, b = {}, anyB = false, ok = true;
    m[1].split("&").forEach(function (kv) {
      var p = kv.split("="), k = p[0], tok = p.length === 2 ? p[1] : "", tgt = null, kk = k;
      if (KEYS.indexOf(k) >= 0) tgt = o; else if (k.charAt(0) === "b" && KEYS.indexOf(k.slice(1)) >= 0) { tgt = b; kk = k.slice(1); anyB = true; }
      if (!tgt) return; // unknown keys are ignored
      if (!NUM.test(tok) || kk in tgt) { ok = false; return; }
      var v = Number(tok); if (!isFinite(v) || !inRange(kk, v)) { ok = false; return; }
      tgt[kk] = clamp(kk, v); // on-range values only snap to the slider step
    });
    KEYS.forEach(function (k) { if (!(k in o)) ok = false; if (anyB && !(k in b)) ok = false; });
    return ok ? { s: o, before: anyB ? b : null } : { bad: true };
  }
  function hashOf(s, before) {
    var q = KEYS.map(function (k) { return k + "=" + (+s[k].toFixed(k === "ax" || k === "ay" ? 2 : 1)); });
    if (before) q = q.concat(KEYS.map(function (k) { return "b" + k + "=" + (+before[k].toFixed(k === "ax" || k === "ay" ? 2 : 1)); }));
    return "#lab:" + q.join("&");
  }

  function mount(root) {
    var rel = root.getAttribute("data-rel") || "";
    var toolHref = rel + (root.getAttribute("data-tools") || "tools/load-transfer/");
    var artHref = rel + (root.getAttribute("data-article") || "articles/traction-circle/");
    var labHref = new URL("../../experience/#tools", new URL(toolHref, location.href)).href;
    var s = {}, before = null, used = false, shared = false;
    KEYS.forEach(function (k) { s[k] = EX[k]; });
    var fromLink = readHash();
    if (fromLink && !fromLink.bad) { s = fromLink.s; before = fromLink.before; shared = true; ev("lab_open_shared"); }

    function slider(k, label) {
      return '<label class="gl-s"><span class="gl-sl">' + label + ' <output id="gl-o-' + k + '"></output></span>' +
        '<input type="range" id="gl-' + k + '" min="' + LIM[k][0] + '" max="' + LIM[k][1] + '" step="' + LIM[k][2] + '" aria-describedby="gl-o-' + k + '"></label>';
    }
    root.innerHTML =
      '<div class="gl-shared" hidden>You opened a setup someone shared: their numbers, the same math. Change anything, or <button type="button" class="gl-link" data-act="example">start from the example car</button>.</div>' +
      (fromLink && fromLink.bad ? '<div class="gl-shared">That shared link didn’t contain a complete setup, so the example car is shown instead.</div>' : "") +
      '<p class="hint gl-scope">Illustrative tire-load model. <a href="' + labHref + '">Test your active vehicle in the Lab</a>.</p>' +
      '<div class="gl-wrap"><figure class="gl-fig"><svg viewBox="0 0 320 420" role="img" aria-labelledby="gl-svgt"><title id="gl-svgt">Top view of the car, front at the top, turning right. Each tire’s circle grows or shrinks with the load it carries; the dashed ring is its load when parked.</title><g class="gl-svg"></g></svg>' +
      '<figcaption>Top view, front at the top, turning right. Circle = load on that tire; dashed ring = parked; orange = the most lightly loaded tire.</figcaption></figure>' +
      '<div class="gl-ctl">' +
      '<p class="gl-take" aria-live="polite"></p>' +
      slider("ax", "Braking") + slider("ay", "Cornering") +
      '<div class="gl-try"><span>Try:</span> <button type="button" data-act="trail">Trail off the brakes</button> <button type="button" data-act="hard">Brake hard, no turn</button> <button type="button" data-act="lower">Lower the car 2 in</button></div>' +
      '<details class="gl-car"><summary>Change the car</summary>' + slider("w", "Weight") + slider("fp", "Front weight") + slider("h", "Center of gravity height") +
      '<p class="hint">Starts as an example car (3,300 lb, 54% front, CG 20 in above the ground) — typical of a V8 coupe, not a measured car. Wheelbase, track widths and suspension are fixed here; the <a href="' + toolHref + '" data-act="tool">Load Transfer Calculator</a> lets you set them.</p></details>' +
      '<div class="gl-cmp"><button type="button" class="btn-small ghost" data-act="pin">Keep this as “before”</button> <span class="gl-cmpnote hint"></span></div>' +
      '<div class="gl-share"><button type="button" class="btn-small primary" data-act="share">Share this setup</button> <span class="gl-sharemsg hint" role="status"></span></div>' +
      '</div></div>' +
      '<div class="table-wrap"><table class="data gl-tab"><caption class="sr-only">Load on each tire</caption><thead><tr><th>Tire</th><th class="n">Parked</th><th class="n">Now</th><th class="n">Change</th><th class="n gl-bcol" hidden>Before</th></tr></thead><tbody></tbody></table></div>' +
      '<p class="gl-warn warn" hidden></p>' +
      '<details class="gl-why"><summary>Why does this happen?</summary><p>The car’s weight acts at its center of gravity, which sits above the ground, while the tires push on the car at ground level. When the tires slow the car or turn it, that offset tips load toward the front (braking) and toward the outside of the turn (cornering). The car doesn’t get heavier — the same total load is shared differently: braking moves it from the rear tires to the front, cornering moves it from the inside tires to the outside. The sentence above follows the inside front because that’s the tire that has to steer the car into the turn; the orange circle marks whichever tire is lightest, which is often the inside rear.</p>' +
      '<p>A lower center of gravity, a wider track or a longer wheelbase all reduce how much load moves. Tires also grip less per pound as their load rises, so evenly shared load usually means more total grip — this page shows the loads, not the grip.</p>' +
      '<p><a href="' + artHref + '">Understanding the traction circle</a> · <a href="' + toolHref + '" data-act="tool">Load Transfer Calculator (all the inputs)</a></p></details>' +
      '<p class="hint gl-limits">Steady-state physics: the loads once the car has settled into the brake and the turn, with the suspension defaults above. It doesn’t predict grip, lap times or what any specific car will do.</p>';

    var q = function (sel) { return root.querySelector(sel); };
    if (shared) q(".gl-shared").hidden = false;

    function fmt(k, v) { return k === "w" ? f0(v) + " lb" : k === "fp" ? v.toFixed(1).replace(/\.0$/, "") + "%" : k === "h" ? v.toFixed(1).replace(/\.0$/, "") + " in" : v.toFixed(2) + " g"; }
    function syncInputs() { KEYS.forEach(function (k) { var i = q("#gl-" + k); i.value = s[k]; q("#gl-o-" + k).textContent = fmt(k, s[k]); }); }

    function draw(r, rb) {
      var pos = { lf: [78, 110], rf: [242, 110], lr: [78, 318], rr: [242, 318] }, g = "";
      g += '<rect x="96" y="40" width="128" height="350" rx="46" class="gl-body"/>';
      g += '<path d="M118 86 Q160 70 202 86 L196 130 Q160 122 124 130 Z" class="gl-glass"/>';
      g += '<text x="160" y="24" class="gl-lab" text-anchor="middle">FRONT</text>';
      // load-transfer arrows
      if (r.dx > 1) g += '<path d="M160 250 L160 175" class="gl-arr"/><path d="M152 186 L160 172 L168 186" class="gl-arrh"/>';
      if (r.dF + r.dR > 1) g += '<path d="M200 214 L118 214" class="gl-arr"/><path d="M130 206 L116 214 L130 222" class="gl-arrh"/>';
      g += '<circle cx="160" cy="214" r="6" class="gl-cg"/><text x="172" y="236" class="gl-small">CG</text>';
      var lightest = TIRES.map(function (t) { return t[0]; }).sort(function (a, b) { return r.now[a] - r.now[b]; })[0];
      TIRES.forEach(function (t) {
        var k = t[0], p = pos[k], ref = s.w / 4, L = r.now[k], P = r.park[k];
        var rad = function (x) { return Math.min(64, 30 * Math.sqrt(Math.max(0, x) / ref)); };
        g += '<rect x="' + (p[0] - 14) + '" y="' + (p[1] - 30) + '" width="28" height="60" rx="6" class="gl-tire' + (L <= 0 ? " lift" : "") + '"/>';
        g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + rad(P).toFixed(1) + '" class="gl-park"/>';
        if (L > 0) g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + rad(L).toFixed(1) + '" class="gl-load' + (k === lightest ? " light" : "") + '"/>';
        var left = k.charAt(0) === "l", tx = left ? 6 : 314, anchor = left ? "start" : "end", ty = p[1] + (k.charAt(1) === "f" ? -62 : 76);
        g += '<text x="' + tx + '" y="' + ty + '" text-anchor="' + anchor + '" class="gl-num">' + (L <= 0 ? "lifting" : f0(L) + " lb") + "</text>";
        if (rb) g += '<text x="' + tx + '" y="' + (ty + 16) + '" text-anchor="' + anchor + '" class="gl-small">before ' + (rb.now[k] <= 0 ? "lifting" : f0(rb.now[k])) + "</text>";
      });
      q(".gl-svg").innerHTML = g;
    }

    function render() {
      syncInputs();
      var r = solve(s), rb = before ? solve(before) : null, warn = [], lift = [];
      draw(r, rb);
      TIRES.forEach(function (t) { if (r.now[t[0]] <= 0) lift.push(t[1].toLowerCase()); });
      if (lift.length) warn.push("The " + lift.join(" and ") + " would lift off the ground. Past that point the car no longer behaves as this model assumes, so the other numbers are not valid.");
      if (r.R <= 0) warn.push("This much braking would lift the rear axle.");
      var w = q(".gl-warn"); w.hidden = !warn.length; w.style.display = warn.length ? "block" : "none"; w.textContent = warn.join(" ");
      q(".gl-tab tbody").innerHTML = TIRES.map(function (t) { var k = t[0], d = r.now[k] - r.park[k];
        return "<tr><td>" + t[1] + '</td><td class="n">' + f0(r.park[k]) + ' lb</td><td class="n">' + (r.now[k] <= 0 ? "lifting" : f0(r.now[k]) + " lb") + '</td><td class="n">' + (d >= 0 ? "+" : "−") + f0(Math.abs(d)) + ' lb</td><td class="n gl-bcol"' + (rb ? "" : " hidden") + ">" + (rb ? (rb.now[k] <= 0 ? "lifting" : f0(rb.now[k]) + " lb") : "") + "</td></tr>"; }).join("");
      root.querySelectorAll(".gl-bcol").forEach(function (c) { c.hidden = !rb; });
      // the plain-language discovery
      var t;
      if (lift.length) t = "Too much: the " + lift.join(" and ") + " would lift. Ease off the braking or cornering.";
      else if (s.ax === 0 && s.ay === 0) t = "Parked: each tire carries its share of the car’s " + f0(s.w) + " lb. Add braking or cornering to see the load move.";
      else {
        var ifront = r.now.rf, pct = Math.round(100 * (1 - ifront / r.park.rf)), ofront = r.now.lf;
        if (s.ay === 0) t = "Braking at " + s.ax.toFixed(2) + " g moves " + f0(r.dx) + " lb onto the front tires: each front tire now carries " + f0(r.now.lf) + " lb, each rear only " + f0(r.now.lr) + " lb.";
        else t = (s.ax > 0 ? "Braking at " + s.ax.toFixed(2) + " g while cornering at " + s.ay.toFixed(2) + " g" : "Cornering at " + s.ay.toFixed(2) + " g") +
          ", the inside front tire carries " + f0(ifront) + " lb" + (pct > 0 ? " — " + pct + "% less than parked" : "") + ", while the outside front carries " + f0(ofront) + " lb.";
        if (rb && !lift.length) { var d = r.now.rf - rb.now.rf; if (Math.abs(d) >= 1) t += " That’s " + f0(Math.abs(d)) + " lb " + (d > 0 ? "more" : "less") + " on the inside front than “before”."; }
      }
      q(".gl-take").textContent = t;
      q(".gl-cmpnote").textContent = before ? "Comparing with your “before” setup." : "";
      q("[data-act=pin]").textContent = before ? "Clear “before”" : "Keep this as “before”";
      // deep link to the full calculator carries every input (fragment only)
      var deep = toolHref + "#lab:" + KEYS.map(function (k) { return k + "=" + s[k]; }).join("&");
      root.querySelectorAll("[data-act=tool]").forEach(function (a) { a.setAttribute("href", deep); });
    }

    KEYS.forEach(function (k) { q("#gl-" + k).addEventListener("input", function () { s[k] = clamp(k, parseFloat(this.value)); if (!used) { used = true; ev("lab_use"); } q(".gl-sharemsg").textContent = ""; render(); }); });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return; var a = b.getAttribute("data-act");
      if (a === "tool") return;
      if (!used && a !== "share") { used = true; ev("lab_use"); }
      if (a === "trail") { s.ax = 0.15; s.ay = Math.max(s.ay, 0.9); }
      else if (a === "hard") { s.ax = 0.9; s.ay = 0; }
      else if (a === "lower") {
        if (s.h <= LIM.h[0] + 1e-9) { q(".gl-sharemsg").textContent = ""; render(); q(".gl-cmpnote").textContent = "The center of gravity is already as low as this page goes (" + LIM.h[0] + " in). Use “Change the car” to raise it again."; return; }
        if (!before) before = JSON.parse(JSON.stringify(s)); s.h = clamp("h", s.h - 2); }
      else if (a === "pin") { before = before ? null : JSON.parse(JSON.stringify(s)); }
      else if (a === "example") { KEYS.forEach(function (k) { s[k] = EX[k]; }); before = null; q(".gl-shared").hidden = true; }
      else if (a === "share") { share(); return; }
      q(".gl-sharemsg").textContent = ""; render();
    });

    function share() {
      var url = location.href.split("#")[0] + hashOf(s, before), msg = q(".gl-sharemsg");
      var text = q(".gl-take").textContent + " Try it with your own car:";
      if (navigator.share) {
        navigator.share({ title: "Brake into a corner — watch the tires | Endicott Speed Shop", text: text, url: url })
          .then(function () { ev("lab_share", { method: "native" }); msg.textContent = "Shared."; },
            function (err) { if (err && err.name === "AbortError") { msg.textContent = ""; return; } copy(); }); // cancelled vs. failed/unsupported (Q13 #4)
        return;
      }
      copy();
      function copy() {
      var done = function () { ev("lab_share", { method: "copy" }); msg.textContent = "Link copied — it opens this exact setup."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
      }
      function fallback() { msg.innerHTML = 'Copy this link: <input class="gl-url" readonly aria-label="Link to this setup">'; var i = msg.querySelector("input"); i.value = url; i.focus(); i.select(); ev("lab_share", { method: "manual" }); }
    }
    render();
    if (shared && root.scrollIntoView) setTimeout(function () { root.scrollIntoView({ block: "start" }); }, 60);
  }
  document.querySelectorAll("[data-glab]").forEach(mount);
})();
