// Burn conditions for Elder Mountain. Everything is fetched in the browser from public sources that allow it.
// The index is the BAFDRS points score: 10-hour fuel moisture + wind gust + humidity, each scored 1-6.
(function () {
  "use strict";

  var STATION = "https://mesonet.fstdynamics.com/api/weather/current/elder-east-wx?decimals=true";
  var FEMS = "https://fems.fs2c.usda.gov/api/climatology/graphql/";
  var RAWS_ID = "409201"; // Prentice Cooper State Forest RAWS, 5 miles from the station
  var BAN = "https://services.arcgis.com/lvPBAGXeSupVUvx2/arcgis/rest/services/Burn_Ban_WFL1/FeatureServer/0/query" +
    "?where=NAME%20IN%20(%27Hamilton%27,%27Marion%27)&outFields=NAME,Ban_Status&returnGeometry=false&f=json";
  var NWS_ZONES = "TNZ098,TNZ099"; // Marion, Hamilton (forecast and fire weather zones)
  var POINT = "35.063,-85.372";
  var APCB = "https://apcb.org/wp-json/wp/v2/pages/156?_fields=content";
  var STOP_EVENTS = ["Red Flag Warning", "Fire Weather Watch", "Wind Advisory", "High Wind Warning", "Extreme Fire Danger"];
  var TZ = "America/New_York";

  var CLASSES = [
    { max: 5, key: "vl", name: "Very low" },
    { max: 8, key: "l", name: "Low" },
    { max: 11, key: "m", name: "Moderate" },
    { max: 15, key: "h", name: "High" },
    { max: 99, key: "vh", name: "Very high" }
  ];

  function fmPts(v) { return v >= 20 ? 1 : v >= 17 ? 2 : v >= 14 ? 3 : v >= 11 ? 4 : v >= 8 ? 5 : 6; }
  function windPts(v) { return v <= 5 ? 1 : v <= 10 ? 2 : v <= 15 ? 3 : v <= 20 ? 4 : v <= 25 ? 5 : 6; }
  function rhPts(v) { return v >= 50 ? 1 : v >= 40 ? 2 : v >= 30 ? 3 : v >= 20 ? 4 : v >= 10 ? 5 : 6; }
  function classOf(score) { for (var i = 0; i < CLASSES.length; i++) if (score <= CLASSES[i].max) return CLASSES[i]; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function timeStr(d) { return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }); }
  function bucket(min) { return Math.floor(Date.now() / (min * 60000)); } // cache buster shared for a few minutes

  function getJSON(url, opts) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .finally(function () { clearTimeout(t); });
  }

  // --- sources -----------------------------------------------------------------------------------------------

  function station() {
    return getJSON(STATION).then(function (d) {
      if (d.status === "no_data") throw new Error("no data");
      return {
        gust: num(d.wind_gust_1h) != null ? d.wind_gust_1h : num(d.wind_gust),
        rh: num(d.humidity),
        temp: num(d.temperature),
        wind: num(d.wind_avg),
        dir: d.wind_direction_human || "",
        stale: d.status !== "ok" || (num(d.age_seconds) || 0) > 900,
        time: d.timestamp ? new Date(d.timestamp) : new Date()
      };
    });
  }

  function raws() {
    var today = new Date(), start = new Date(today.getTime() - 2 * 864e5), end = new Date(today.getTime() + 864e5);
    var q = "query($s:String,$fm:String!,$a:Date,$b:Date){nfdrsObs(stationIds:$s,fuelModels:$fm,startDateRange:$a,endDateRange:$b,nfdrType:\"O\",per_page:200){data{observation_time ten_hr_tl_fuel_moisture kbdi energy_release_component burning_index}}}";
    var body = JSON.stringify({ query: q, variables: { s: RAWS_ID, fm: "Y", a: start.toISOString().slice(0, 10), b: end.toISOString().slice(0, 10) } });
    return getJSON(FEMS, { method: "POST", headers: { "Content-Type": "application/json" }, body: body }).then(function (d) {
      var rows = (((d || {}).data || {}).nfdrsObs || {}).data || [];
      rows = rows.filter(function (r) { return num(r.ten_hr_tl_fuel_moisture) != null; })
        .sort(function (a, b) { return a.observation_time < b.observation_time ? -1 : 1; });
      if (!rows.length) throw new Error("no rows");
      var r = rows[rows.length - 1];
      return { fm: r.ten_hr_tl_fuel_moisture, kbdi: num(r.kbdi), erc: num(r.energy_release_component), time: new Date(r.observation_time) };
    });
  }

  function ban() {
    return getJSON(BAN).then(function (d) {
      var out = {};
      (d.features || []).forEach(function (f) { out[f.attributes.NAME] = f.attributes.Ban_Status || "None"; });
      if (!Object.keys(out).length) throw new Error("empty");
      return out;
    });
  }

  function alerts() {
    return getJSON("https://api.weather.gov/alerts/active?zone=" + NWS_ZONES, { headers: { Accept: "application/geo+json" } }).then(function (d) {
      var seen = {};
      return (d.features || []).map(function (f) { return f.properties; }).filter(function (p) {
        if (seen[p.event]) return false;
        seen[p.event] = true;
        return true;
      });
    });
  }

  // NWS gridded forecast for the rest of today's burning hours (or tomorrow's, after 5 PM).
  function forecast() {
    return getJSON("https://api.weather.gov/points/" + POINT).then(function (p) {
      return getJSON(p.properties.forecastGridData);
    }).then(function (g) {
      var now = new Date();
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).formatToParts(now);
      var hour = +parts.find(function (x) { return x.type === "hour"; }).value;
      var dayOffset = hour >= 17 ? 1 : 0;
      var label = dayOffset ? "Tomorrow, 9 AM to 5 PM" : (hour < 9 ? "Today, 9 AM to 5 PM" : "Rest of today, until 5 PM");
      function localDayHour(d) {
        var f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
        var o = {}; f.forEach(function (x) { o[x.type] = x.value; });
        return { day: o.year + "-" + o.month + "-" + o.day, hour: +o.hour };
      }
      var target = localDayHour(new Date(now.getTime() + dayOffset * 864e5)).day;
      var startHour = dayOffset ? 9 : Math.max(9, hour);
      function inWindow(validTime) {
        var s = validTime.split("/"), t0 = new Date(s[0]);
        var m = /PT?(\d+)H/.exec(s[1] || ""), hrs = m ? +m[1] : 1;
        for (var i = 0; i < hrs; i++) {
          var lh = localDayHour(new Date(t0.getTime() + i * 36e5));
          if (lh.day === target && lh.hour >= startHour && lh.hour < 17) return true;
        }
        return false;
      }
      function pick(series, fn) {
        var vals = ((g.properties[series] || {}).values || []).filter(function (v) { return v.value != null && inWindow(v.validTime); }).map(function (v) { return v.value; });
        return vals.length ? fn.apply(null, vals) : null;
      }
      var gustKmh = pick("windGust", Math.max), rh = pick("relativeHumidity", Math.min);
      if (gustKmh == null || rh == null) throw new Error("no forecast in window");
      return { label: label, gust: gustKmh * 0.621371, rh: rh };
    });
  }

  function apcb() {
    return getJSON(APCB + "&cb=" + bucket(10)).then(function (d) {
      var doc = new DOMParser().parseFromString(d.content.rendered, "text/html");
      var out = {};
      doc.querySelectorAll(".widget-box-right").forEach(function (box) {
        var label = box.querySelector(".widget-text");
        var val = box.querySelector(".widget-text-b, .widget-text-b2");
        if (!label || !val) return;
        var key = label.textContent.trim();
        var small = box.querySelector(".small-text");
        out[key] = {
          value: val.textContent.trim(),
          detail: small ? small.innerHTML.split(/<br\s*\/?>/i).map(function (s) { return s.replace(/<[^>]+>/g, "").trim(); }).filter(Boolean) : []
        };
      });
      if (!out["Burning Allowed?"]) throw new Error("no burn status");
      return out;
    });
  }

  // --- rendering ---------------------------------------------------------------------------------------------

  function setFactor(id, val, pts, note) {
    var el = $(id);
    el.querySelector(".factor-val").innerHTML = val;
    if (pts != null) el.setAttribute("data-pts", pts);
    if (note) el.querySelector(".factor-note").textContent = note;
  }

  function kbdiWords(k) {
    if (k < 200) return "moist ground";
    if (k < 400) return "dry topsoil";
    if (k < 600) return "dry, deep fuels can burn";
    return "drought, fires burn deep";
  }

  function render(res) {
    var stn = res[0], rw = res[1], bans = res[2], al = res[3], fc = res[4], ap = res[5];
    var stop = [], caution = [], score = null, cls = null;

    // Conditions
    if (stn.ok) {
      var s = stn.value;
      setFactor("f-gust", Math.round(s.gust) + " mph", windPts(s.gust));
      setFactor("f-rh", Math.round(s.rh) + "%", rhPts(s.rh));
      var extra = [];
      if (s.temp != null) extra.push(Math.round(s.temp) + "°F");
      if (s.wind != null) extra.push("wind " + (s.dir ? s.dir + " " : "") + Math.round(s.wind) + " mph");
      $("wx-extra").textContent = "Elder East now: " + extra.join(", ") + ". Station reading at " + timeStr(s.time) + (s.stale ? " (delayed)." : ".");
      if (s.gust >= 20) stop.push("Gusts of " + Math.round(s.gust) + " mph on the mountain in the last hour");
      if (s.rh < 25) stop.push("Humidity is " + Math.round(s.rh) + "%");
    } else {
      setFactor("f-gust", "Not available", null);
      setFactor("f-rh", "Not available", null);
    }
    if (rw.ok) {
      setFactor("f-fm", Math.round(rw.value.fm) + "%", fmPts(rw.value.fm));
      if (rw.value.kbdi != null) {
        setFactor("f-kbdi", rw.value.kbdi + " <span class=\"of\">of 800</span>", null, kbdiWords(rw.value.kbdi) + ". Prentice Cooper State Forest weather station");
        if (rw.value.kbdi >= 600) caution.push("Drought: the ground and heavy fuels are very dry");
      }
    } else {
      setFactor("f-fm", "Not available", null);
      setFactor("f-kbdi", "Not available", null);
    }
    if (stn.ok && rw.ok) {
      score = fmPts(rw.value.fm) + windPts(stn.value.gust) + rhPts(stn.value.rh);
      cls = classOf(score);
      if (cls.key === "h" || cls.key === "vh") stop.push("Burn index is " + cls.name.toLowerCase());
      else if (cls.key === "m") caution.push("Burn index is moderate");
    }
    $("index-score").textContent = score != null ? score : "–";
    $("index-class").textContent = cls ? cls.name : "Not available";
    document.querySelectorAll(".index-scale li").forEach(function (li) { li.classList.toggle("on", !!cls && li.getAttribute("data-c") === cls.key); });
    $("verdict").setAttribute("data-class", cls ? cls.key : "");

    // Forecast
    if (fc.ok && rw.ok) {
      var f = fc.value, fscore = fmPts(rw.value.fm) + windPts(f.gust) + rhPts(f.rh), fcls = classOf(fscore);
      $("fc-title").textContent = f.label;
      $("fc-text").innerHTML = "Forecast gusts up to <strong>" + Math.round(f.gust) + " mph</strong> and humidity down to <strong>" + Math.round(f.rh) +
        "%</strong>. Burn index <strong class=\"cls-" + fcls.key + "\">" + fscore + ", " + fcls.name.toLowerCase() + "</strong>.";
      $("forecast").hidden = false;
      if ((fcls.key === "h" || fcls.key === "vh") && !/Tomorrow/.test(f.label)) caution.push("Conditions are forecast to reach " + fcls.name.toLowerCase() + " later today");
    }

    // Official status
    if (bans.ok) {
      var active = Object.keys(bans.value).filter(function (k) { return /active/i.test(bans.value[k]); });
      $("s-ban").innerHTML = active.length
        ? "<strong class=\"bad\">Burn ban in effect for " + esc(active.join(" and ")) + " County.</strong> No open burning of any kind, including campfires and grills."
        : "No burn ban for Marion or Hamilton County.";
      active.forEach(function (c) { stop.push("State burn ban in " + c + " County"); });
    } else {
      $("s-ban").innerHTML = "Could not check. See <a href=\"https://www.tn.gov/tnwildlandfire/prevention/safe-debris-burning/burn-bans.html\">burn bans</a>.";
    }
    if (al.ok) {
      var list = al.value;
      var stops = list.filter(function (p) { return STOP_EVENTS.indexOf(p.event) >= 0; });
      $("s-nws").innerHTML = list.length
        ? list.map(function (p) {
            var bad = STOP_EVENTS.indexOf(p.event) >= 0;
            return (bad ? "<strong class=\"bad\">" : "<strong>") + esc(p.event) + "</strong>" + (p.ends || p.expires ? " until " + esc(new Date(p.ends || p.expires).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: TZ })) : "");
          }).join("<br>")
        : "No fire weather alerts for Marion or Hamilton County.";
      stops.forEach(function (p) { stop.push(p.event + " in effect"); });
    } else {
      $("s-nws").innerHTML = "Could not check. See <a href=\"https://www.weather.gov/mrx/\">NWS Morristown</a>.";
    }
    if (ap.ok) {
      var b = ap.value["Burning Allowed?"], yes = /^yes/i.test(b.value);
      var dateStr = "", hours = "", notes = [];
      b.detail.forEach(function (t) {
        if (/\b(19|20)\d\d\b/.test(t) && !/AM|PM/.test(t)) dateStr = t;
        else if (/\d\s*(AM|PM)/i.test(t)) hours = t.replace(/\s*-\s*/, "–");
        else notes.push(/[.!]$/.test(t) ? t : t + ".");
      });
      var todayStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ });
      var when = dateStr && dateStr !== todayStr ? "on " + dateStr : "today";
      $("s-apcb").innerHTML = (yes ? "<strong class=\"good\">Burning allowed</strong> " + esc(when) + (hours ? ", " + esc(hours) : "") + "."
                                   : "<strong class=\"bad\">No burning</strong> " + esc(when) + ".") +
        (notes.length ? " " + esc(notes.join(" ")) : "") + " <span class=\"small\">Hamilton County side.</span>";
      var aqi = ap.value["Air Quality Index Forecast"], aq = ap.value["Air Quality"], pol = ap.value["Highest Pollutant"];
      $("s-aq").innerHTML = aq ? "<strong>" + esc(aq.value) + "</strong>" + (aqi ? ", AQI " + esc(aqi.value) : "") + (pol ? " (" + esc(pol.value.toLowerCase()) + ")" : "") : "Not available.";
      if (aq && !/good|moderate/i.test(aq.value)) caution.push("Air quality is " + aq.value.toLowerCase() + ", so smoke will add to it");
    } else {
      $("s-apcb").innerHTML = "Could not check. See <a href=\"https://apcb.org/\">apcb.org</a> or text <em>burn</em> to 423-643-5971.";
      $("s-aq").innerHTML = "Could not check. See the <a href=\"https://apcb.org/daily-report/\">daily air quality report</a>.";
    }

    // Verdict
    var level, word;
    if (stop.length) { level = "stop"; word = "Do not burn"; }
    else if (score == null) { level = "unknown"; word = "Conditions not available"; caution.push("Check the official status below before you burn"); }
    else if (caution.length) { level = "caution"; word = "Burn with caution"; }
    else { level = "ok"; word = "Good conditions for burning"; }
    var why = stop.concat(caution);
    if (!al.ok && level !== "stop") why.push("Could not reach the National Weather Service. Check for a Red Flag Warning before you burn");
    if (level === "ok") why.push("Get the permit for your side of the mountain first");
    $("verdict").setAttribute("data-level", level);
    $("verdict-word").textContent = word;
    $("verdict-why").innerHTML = why.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("");
    $("verdict-time").textContent = "Checked at " + timeStr(new Date()) + ". Refreshes every 5 minutes.";
  }

  function seasons() {
    var now = new Date(), m = +now.toLocaleString("en-US", { month: "numeric", timeZone: TZ }), d = +now.toLocaleString("en-US", { day: "numeric", timeZone: TZ });
    var md = m * 100 + d;
    $("tdf-season").textContent = (md >= 1015 || md <= 515) ? "Permit season: a Forestry permit is required today." : "Outside permit season (May 16 to October 14): no Forestry permit is needed, but every other rule still applies.";
    $("apcb-season").textContent = (md >= 1001 || md <= 430) ? "Burn season: allowed with a bureau permit on days the bureau says yes." : "Seasonal ban: no open burning in Hamilton County until October 1.";
  }

  function settle(p) { return p.then(function (v) { return { ok: true, value: v }; }, function (e) { return { ok: false, error: e }; }); }

  function run() {
    Promise.all([station(), raws(), ban(), alerts(), forecast(), apcb()].map(settle)).then(render);
  }

  seasons();
  run();
  setInterval(run, 5 * 60000);
})();
