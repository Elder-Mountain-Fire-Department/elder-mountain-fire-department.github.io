// Burn conditions for Elder Mountain. Everything is fetched in the browser from public sources that allow it.
// Fire danger: FST Dynamics Basic Fire Danger Rating System (BAFDRS). 10-hour fuel moisture, wind gust, and humidity are
// each scored 1-6 and summed; the sum maps to a category. Only the category is shown. Both stations are rated and the
// higher danger is used.
(function () {
  "use strict";

  var STATION = "https://mesonet.fstdynamics.com/api/weather/current/elder-east-wx?decimals=true";
  var FEMS = "https://fems.fs2c.usda.gov/api/climatology/graphql/";
  var RAWS_ID = "409201"; // Prentice Cooper State Forest RAWS
  var BAN = "https://services.arcgis.com/lvPBAGXeSupVUvx2/arcgis/rest/services/Burn_Ban_WFL1/FeatureServer/0/query" +
    "?where=NAME%3D%27Marion%27&outFields=NAME,Ban_Status&returnGeometry=false&f=json";
  var NWS_ZONES = "TNZ098"; // Marion County forecast and fire weather zone
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
  var ORDER = { vl: 0, l: 1, m: 2, h: 3, vh: 4 };

  function fmPts(v) { return v >= 20 ? 1 : v >= 17 ? 2 : v >= 14 ? 3 : v >= 11 ? 4 : v >= 8 ? 5 : 6; }
  function windPts(v) { return v <= 5 ? 1 : v <= 10 ? 2 : v <= 15 ? 3 : v <= 20 ? 4 : v <= 25 ? 5 : 6; }
  function rhPts(v) { return v >= 50 ? 1 : v >= 40 ? 2 : v >= 30 ? 3 : v >= 20 ? 4 : v >= 10 ? 5 : 6; }
  function rate(fm, gust, rh) {
    if (fm == null || gust == null || rh == null) return null;
    var score = fmPts(fm) + windPts(gust) + rhPts(rh);
    for (var i = 0; i < CLASSES.length; i++) if (score <= CLASSES[i].max) return CLASSES[i];
  }
  function worse(a, b) { if (!a) return b; if (!b) return a; return ORDER[b.key] > ORDER[a.key] ? b : a; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function timeStr(d) { return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }); }
  function bucket(min) { return Math.floor(Date.now() / (min * 60000)); }
  function compass(deg) { return deg == null ? "" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8]; }
  function round(v) { return Math.round(v); }

  function getJSON(url, opts) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .finally(function () { clearTimeout(t); });
  }
  function fems(query, variables) {
    return getJSON(FEMS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query, variables: variables }) });
  }

  // --- sources -----------------------------------------------------------------------------------------------

  function elderEast() {
    return getJSON(STATION).then(function (d) {
      if (d.status === "no_data") throw new Error("no data");
      if ((num(d.age_seconds) || 0) > 3 * 3600) throw new Error("stale");
      return {
        temp: num(d.temperature), rh: num(d.humidity), wind: num(d.wind_avg), dir: d.wind_direction_human || "",
        gust: num(d.wind_gust_1h) != null ? d.wind_gust_1h : num(d.wind_gust),
        time: d.timestamp ? new Date(d.timestamp) : new Date()
      };
    });
  }

  function rawsWeather() {
    var now = Date.now();
    var q = "query($s:String,$a:DateTime!,$b:DateTime!){weatherObs(stationIds:$s,startDateTimeRange:$a,endDateTimeRange:$b,per_page:500){data{observation_time temperature hourly_precip relative_humidity wind_speed wind_direction peak_gust_speed}}}";
    return fems(q, { s: RAWS_ID, a: new Date(now - 72 * 36e5).toISOString().slice(0, 19) + "Z", b: new Date(now + 36e5).toISOString().slice(0, 19) + "Z" }).then(function (d) {
      var rows = ((((d || {}).data || {}).weatherObs || {}).data || []).slice()
        .sort(function (a, b) { return a.observation_time < b.observation_time ? -1 : 1; });
      if (!rows.length) throw new Error("no rows");
      var r = rows[rows.length - 1], time = new Date(r.observation_time);
      if (now - time.getTime() > 6 * 36e5) throw new Error("stale");
      var rain = rows.reduce(function (s, x) { return s + (num(x.hourly_precip) || 0); }, 0);
      return {
        temp: num(r.temperature), rh: num(r.relative_humidity), wind: num(r.wind_speed), dir: compass(num(r.wind_direction)),
        gust: num(r.peak_gust_speed) != null ? r.peak_gust_speed : num(r.wind_speed), rain: rain, time: time
      };
    });
  }

  function rawsFuel() {
    var today = new Date(), start = new Date(today.getTime() - 2 * 864e5), end = new Date(today.getTime() + 864e5);
    var q = "query($s:String,$fm:String!,$a:Date,$b:Date){nfdrsObs(stationIds:$s,fuelModels:$fm,startDateRange:$a,endDateRange:$b,nfdrType:\"O\",per_page:200){data{observation_time ten_hr_tl_fuel_moisture kbdi}}}";
    return fems(q, { s: RAWS_ID, fm: "Y", a: start.toISOString().slice(0, 10), b: end.toISOString().slice(0, 10) }).then(function (d) {
      var rows = ((((d || {}).data || {}).nfdrsObs || {}).data || [])
        .filter(function (r) { return num(r.ten_hr_tl_fuel_moisture) != null; })
        .sort(function (a, b) { return a.observation_time < b.observation_time ? -1 : 1; });
      if (!rows.length) throw new Error("no rows");
      var r = rows[rows.length - 1];
      return { fm: r.ten_hr_tl_fuel_moisture, kbdi: num(r.kbdi), time: new Date(r.observation_time) };
    });
  }

  function ban() {
    return getJSON(BAN).then(function (d) {
      var f = (d.features || [])[0];
      if (!f) throw new Error("empty");
      return /active/i.test(f.attributes.Ban_Status || "");
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
      function local(d) {
        var o = {};
        new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" })
          .formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
        return { day: o.year + "-" + o.month + "-" + o.day, hour: +o.hour };
      }
      var now = new Date(), hour = local(now).hour, tomorrow = hour >= 17;
      var target = local(new Date(now.getTime() + (tomorrow ? 864e5 : 0))).day;
      var startHour = tomorrow ? 9 : Math.max(9, hour);
      function inWindow(validTime) {
        var s = validTime.split("/"), t0 = new Date(s[0]), m = /(\d+)H/.exec(s[1] || ""), hrs = m ? +m[1] : 1;
        for (var i = 0; i < hrs; i++) {
          var lh = local(new Date(t0.getTime() + i * 36e5));
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
      return { when: tomorrow ? "Tomorrow between 9 AM and 5 PM" : (hour < 9 ? "Today between 9 AM and 5 PM" : "For the rest of the afternoon"), tomorrow: tomorrow, gust: gustKmh * 0.621371, rh: rh };
    });
  }

  function airQuality() {
    return getJSON(APCB + "&cb=" + bucket(10)).then(function (d) {
      var doc = new DOMParser().parseFromString(d.content.rendered, "text/html"), out = {};
      doc.querySelectorAll(".widget-box-right").forEach(function (box) {
        var label = box.querySelector(".widget-text"), val = box.querySelector(".widget-text-b, .widget-text-b2");
        if (label && val) out[label.textContent.trim()] = val.textContent.trim();
      });
      if (!out["Air Quality"]) throw new Error("no air quality");
      return out;
    });
  }

  // --- rendering ---------------------------------------------------------------------------------------------

  function setText(id, text) { $(id).textContent = text; }
  function clsCell(id, c) { var el = $(id); el.textContent = c ? c.name : "–"; el.className = c ? "cls-" + c.key : ""; }

  function kbdiWords(k) {
    if (k < 200) return "The ground is moist.";
    if (k < 400) return "The topsoil is drying out.";
    if (k < 600) return "The ground is dry, and logs, stumps, and the layer of rotting leaves can catch and smolder.";
    return "This is drought. Fires can burn deep into the ground and are hard to put out.";
  }

  function list(items) {
    if (items.length < 2) return items.join("");
    return items.slice(0, -1).join(", ") + (items.length > 2 ? "," : "") + " and " + items[items.length - 1];
  }

  function render(res) {
    var ee = res[0], pw = res[1], pf = res[2], bn = res[3], al = res[4], fc = res[5], aq = res[6];
    var stops = [], cautions = [];
    var fm = pf.ok ? pf.value.fm : null;

    function fill(prefix, r) {
      if (!r.ok) {
        ["temp", "rh", "wind", "gust"].forEach(function (k) { setText(prefix + "-" + k, "–"); });
        setText(prefix + "-time", "Not reporting");
        return null;
      }
      var v = r.value;
      setText(prefix + "-temp", v.temp != null ? round(v.temp) + "°F" : "–");
      setText(prefix + "-rh", v.rh != null ? round(v.rh) + "%" : "–");
      setText(prefix + "-wind", v.wind != null ? (v.dir ? v.dir + " " : "") + round(v.wind) + " mph" : "–");
      setText(prefix + "-gust", v.gust != null ? round(v.gust) + " mph" : "–");
      setText(prefix + "-time", timeStr(v.time));
      if (v.gust != null && v.gust >= 20) stops.push("gusts reached " + round(v.gust) + " mph in the past hour");
      if (v.rh != null && v.rh < 25) stops.push("the humidity is down to " + round(v.rh) + "%");
      return rate(fm, v.gust, v.rh);
    }
    var eeCls = fill("ee", ee), pcCls = fill("pc", pw);
    clsCell("ee-cls", eeCls);
    clsCell("pc-cls", pcCls);
    setText("pc-rain", pw.ok ? (pw.value.rain > 0 ? pw.value.rain.toFixed(2) + " in" : "None") : "–");
    setText("pc-fm", pf.ok ? round(fm) + "%" : "–");
    if (pf.ok && pf.value.kbdi != null) {
      $("kbdi").textContent = "Drought index (KBDI) at Prentice Cooper: " + pf.value.kbdi + " on a scale of 0 to 800. " + kbdiWords(pf.value.kbdi);
      if (pf.value.kbdi >= 600) cautions.push("the ground is in drought");
    }

    var cls = worse(eeCls, pcCls);
    if (cls && ORDER[cls.key] >= ORDER.h) stops.unshift("fire danger is " + cls.name.toLowerCase());
    else if (cls && cls.key === "m") cautions.unshift("fire danger is moderate");

    if (fc.ok && fm != null) {
      var f = fc.value, fcls = rate(fm, f.gust, f.rh);
      $("forecast").innerHTML = esc(f.when) + ", the National Weather Service forecasts gusts up to " + round(f.gust) + " mph and humidity as low as " +
        round(f.rh) + "%. That would put fire danger at <strong class=\"cls-" + fcls.key + "\">" + esc(fcls.name.toLowerCase()) + "</strong>.";
      $("forecast").hidden = false;
      if (!f.tomorrow && ORDER[fcls.key] >= ORDER.h) cautions.push("fire danger is forecast to reach " + fcls.name.toLowerCase() + " later today");
    }

    if (bn.ok) {
      $("s-ban").innerHTML = bn.value
        ? "<strong class=\"bad\">A burn ban is in effect for Marion County.</strong> No outdoor fires of any kind, including campfires, grills, and burn barrels."
        : "No burn ban for Marion County.";
      if (bn.value) stops.unshift("a burn ban is in effect for Marion County");
    } else {
      $("s-ban").innerHTML = "Could not check. See <a href=\"https://www.tn.gov/tnwildlandfire/prevention/safe-debris-burning/burn-bans.html\">burn bans</a>.";
    }
    if (al.ok) {
      $("s-nws").innerHTML = al.value.length
        ? al.value.map(function (p) {
            var bad = STOP_EVENTS.indexOf(p.event) >= 0;
            return (bad ? "<strong class=\"bad\">" : "<strong>") + esc(p.event) + "</strong>" + (p.ends || p.expires ? " until " + esc(new Date(p.ends || p.expires).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: TZ })) : "");
          }).join("<br>")
        : "No fire weather alerts for Marion County.";
      al.value.forEach(function (p) { if (STOP_EVENTS.indexOf(p.event) >= 0) stops.unshift("a " + p.event + " is in effect"); });
    } else {
      $("s-nws").innerHTML = "Could not check. See <a href=\"https://www.weather.gov/mrx/\">NWS Morristown</a>.";
    }
    if (aq.ok) {
      var a = aq.value;
      $("s-aq").innerHTML = "<strong>" + esc(a["Air Quality"]) + "</strong>" + (a["Air Quality Index Forecast"] ? ", AQI " + esc(a["Air Quality Index Forecast"]) : "") +
        (a["Highest Pollutant"] ? " (" + esc(a["Highest Pollutant"].toLowerCase()) + ")" : "") + ". Chattanooga area forecast.";
      if (!/good|moderate/i.test(a["Air Quality"])) cautions.push("air quality is already " + a["Air Quality"].toLowerCase());
    } else {
      $("s-aq").innerHTML = "Could not check. See the <a href=\"https://apcb.org/daily-report/\">daily air quality report</a>.";
    }

    var advice;
    if (stops.length) advice = "Do not burn today: " + list(stops) + ".";
    else if (!cls) advice = "We could not get enough station data to rate fire danger. Check the official status below before you burn.";
    else if (cautions.length) advice = "Use caution: " + list(cautions) + ". Burn small piles early in the day, and put the fire out if the wind picks up.";
    else advice = "Burning is reasonable today with a Forestry permit. Keep piles small and stay with the fire until it is out.";
    if (!al.ok && !stops.length) advice += " We could not reach the National Weather Service, so check for a Red Flag Warning first.";
    advice = advice.charAt(0).toUpperCase() + advice.slice(1);

    $("rating").setAttribute("data-c", cls ? cls.key : "");
    $("rating").classList.toggle("stop", !!stops.length);
    $("rating-word").textContent = cls ? cls.name : "Not available";
    document.querySelectorAll(".rating-scale li").forEach(function (li) { li.classList.toggle("on", !!cls && li.getAttribute("data-c") === cls.key); });
    $("rating-advice").textContent = advice;
    $("rating-meta").textContent = "FST Dynamics Basic Fire Danger Rating System. Updated " + timeStr(new Date()) + ".";
  }

  function header() {
    var now = new Date();
    $("burn-date").textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });
    var md = +now.toLocaleString("en-US", { month: "numeric", timeZone: TZ }) * 100 + +now.toLocaleString("en-US", { day: "numeric", timeZone: TZ });
    $("tdf-season").textContent = (md >= 1015 || md <= 515) ? "We are in permit season. You need a Forestry permit to burn today." : "We are outside permit season (May 16 to October 14). No Forestry permit is needed, but every other rule still applies.";
  }

  function settle(p) { return p.then(function (v) { return { ok: true, value: v }; }, function (e) { return { ok: false, error: e }; }); }
  function run() { Promise.all([elderEast(), rawsWeather(), rawsFuel(), ban(), alerts(), forecast(), airQuality()].map(settle)).then(render); }

  header();
  run();
  setInterval(run, 5 * 60000);
})();
