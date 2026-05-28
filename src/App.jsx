import { useState, useRef, useEffect } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap');`;

const globalCSS = `
${FONTS}
* { margin:0; padding:0; box-sizing:border-box; }
:root {
  --bg:#0a0a0f; --surface:#111118; --border:#1e1e2e;
  --accent:#c9a84c; --accent2:#7b6cd8; --danger:#e05c5c;
  --success:#4caf7d; --text:#e8e6f0; --muted:#6b6880;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
.fu  { animation: fadeUp 0.45s ease both; }
.fu1 { animation: fadeUp 0.45s 0.08s ease both; }
.fu2 { animation: fadeUp 0.45s 0.16s ease both; }
.fu3 { animation: fadeUp 0.45s 0.24s ease both; }
.fu4 { animation: fadeUp 0.45s 0.32s ease both; }
.fu5 { animation: fadeUp 0.45s 0.40s ease both; }
.fu6 { animation: fadeUp 0.45s 0.48s ease both; }
.fu7 { animation: fadeUp 0.45s 0.56s ease both; }
`;

// ─── API helpers (calls our own Vercel backend) ───────────────────────────────
async function serperSearch(query) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, type: "search" }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  const results = (data.organic || []).map(r => `${r.title} — ${r.snippet} [${r.link}]`).join("\n");
  const kg = data.knowledgeGraph ? `Knowledge Graph: ${JSON.stringify(data.knowledgeGraph)}` : "";
  return [kg, results].filter(Boolean).join("\n") || "No results found.";
}

async function serperPlaces(query) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, type: "places" }),
  });
  if (!res.ok) throw new Error(`Places search failed: ${res.status}`);
  const data = await res.json();
  const places = (data.places || []).map(p =>
    `Name: ${p.title} | Rating: ${p.rating} | Reviews: ${p.ratingCount} | Address: ${p.address} | Phone: ${p.phoneNumber || "unknown"} | Hours: ${p.hours || "unknown"} | Website: ${p.website || "unknown"} | Category: ${p.category || "unknown"}`
  ).join("\n");
  return places || "No places found.";
}

async function callClaude(messages) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: 2000 }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  return extractJSON(text);
}

// ─── JSON extractor ───────────────────────────────────────────────────────────
function extractJSON(text) {
  if (!text) throw new Error("Empty response");
  try { return JSON.parse(text.trim()); } catch {}
  const s = text.replace(/```json\s*/gi,"").replace(/```\s*/gi,"").trim();
  try { return JSON.parse(s); } catch {}
  let depth=0, start=-1, end=-1;
  for (let i=0;i<s.length;i++) {
    if (s[i]==="{") { if(depth===0) start=i; depth++; }
    else if (s[i]==="}") { depth--; if(depth===0){end=i;break;} }
  }
  if (start!==-1&&end!==-1) { try { return JSON.parse(s.slice(start,end+1)); } catch {} }
  throw new Error("Could not parse agent response.");
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
function buildOsintPrompt(form, searchData) {
  return `You are an OSINT analyst. You have real Google search results for a prospect. Analyze them and extract a structured profile.

PROSPECT INFO:
Name: ${form.name}
Business: ${form.business}
City: ${form.city}
Email: ${form.email||"not provided"}
Phone: ${form.phone||"not provided"}

REAL SEARCH RESULTS:
--- GMB / Google Maps ---
${searchData.gmb}

--- Facebook Page ---
${searchData.facebook}

--- Instagram ---
${searchData.instagram}

--- Yelp ---
${searchData.yelp}

--- Reviews & Complaints ---
${searchData.reviews}

--- Owner Personal Profiles ---
${searchData.owner}

CRITICAL: Respond with ONLY a valid JSON object. Start with { and end with }. No other text.

{
  "name": "${form.name}",
  "business_name": "${form.business}",
  "business_type": "restaurant/food truck/etc based on search results",
  "location": "${form.city}",
  "age_estimate": "estimated age range based on clues",
  "background_summary": "1-2 sentence human summary",
  "business_health": {
    "google_rating": "rating found or unknown",
    "google_reviews": "count found or unknown",
    "google_hours_accurate": true,
    "yelp_claimed": true,
    "yelp_rating": "rating found or unknown",
    "last_facebook_post": "timeframe found or unknown",
    "facebook_followers": "count found or unknown",
    "instagram_handle": "@handle or unknown",
    "instagram_followers": "count found or unknown",
    "instagram_post_frequency": "frequency found or unknown",
    "online_ordering": true,
    "unanswered_reviews": "count or unknown",
    "health_score": 55,
    "health_score_reason": "brief explanation of score"
  },
  "pain_points": [
    "specific pain point found in real search results",
    "another specific pain point",
    "third pain point"
  ],
  "call_openers": [
    "specific observation to open the call with based on real data",
    "another real observation"
  ],
  "facebook": {
    "found": true,
    "likes": ["inferred interest 1","inferred interest 2","inferred interest 3"],
    "posting_style": "description based on what was found"
  },
  "instagram": {
    "found": true,
    "followers_estimate": "number or range",
    "content_style": "what they post"
  },
  "tiktok": {
    "found": false,
    "content_consumed": []
  },
  "news_sources": "inferred news consumption habits",
  "key_signals": ["signal 1","signal 2","signal 3"],
  "confidence": 75
}`;
}

function buildJungPrompt(osint) {
  return `You are a Jungian psychologist and sales intelligence expert specializing in Latino small business owners in Latin America and the US.

Analyze this prospect and generate a complete personality and sales intelligence report. Reference the real business pain points found in the data to make the caller's brief specific and actionable.

OSINT DATA:
${JSON.stringify(osint, null, 2)}

CRITICAL: Respond with ONLY a valid JSON object. Start with { and end with }. No other text.

{
  "archetype": "archetype name",
  "archetype_emoji": "one emoji",
  "archetype_description": "two sentences describing this archetype for a Latino SMB owner context",
  "mbti_likely": "e.g. ISFJ",
  "dominant_function": "e.g. Introverted Sensing (Si)",
  "shadow_risk": "main psychological risk under sales pressure",
  "confidence_score": 82,
  "traits": [
    {"left":"Introverted","right":"Extroverted","position":0.6},
    {"left":"Analytical","right":"Emotional","position":0.65},
    {"left":"Risk Averse","right":"Risk Taker","position":0.25},
    {"left":"Skeptical","right":"Trusting","position":0.3},
    {"left":"Individual","right":"Community","position":0.8}
  ],
  "motivators": ["motivator 1","motivator 2","motivator 3","motivator 4"],
  "fears": ["fear 1","fear 2","fear 3","fear 4"],
  "trust_triggers": ["trigger 1","trigger 2","trigger 3","trigger 4"],
  "objection_patterns": ["objection 1","objection 2","objection 3","objection 4"],
  "opening_line": "exact suggested first sentence referencing something real found about their business",
  "language_to_use": ["word 1","word 2","word 3","word 4"],
  "language_to_avoid": ["word 1","word 2","word 3","word 4"],
  "callers_brief": "3-4 sentences of practical guidance referencing the real pain points found",
  "tags": [
    {"label":"tag 1","type":"gold"},
    {"label":"tag 2","type":"green"},
    {"label":"tag 3","type":"red"},
    {"label":"tag 4","type":"purple"}
  ]
}`;
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────
const inp = {
  width:"100%", background:"#0d0d14", border:"1px solid #1e1e2e",
  borderRadius:8, padding:"12px 14px", color:"#e8e6f0",
  fontFamily:"DM Sans,sans-serif", fontSize:14, outline:"none",
};
function Label({children}) {
  return <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:"#6b6880",marginBottom:6}}>{children}</div>;
}
function SecTitle({children}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
      <span style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,letterSpacing:"0.22em",textTransform:"uppercase",color:"#c9a84c"}}>{children}</span>
      <div style={{flex:1,height:1,background:"#1e1e2e"}}/>
    </div>
  );
}
function Card({children,style}) {
  return <div style={{background:"#111118",border:"1px solid #1e1e2e",borderRadius:12,padding:20,...style}}>{children}</div>;
}
function Spinner() {
  return <div style={{width:15,height:15,border:"2px solid #2a2a3a",borderTop:"2px solid #c9a84c",borderRadius:"50%",animation:"spin 0.75s linear infinite",flexShrink:0}}/>;
}
function Step({n,label,done,active}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,opacity:done||active?1:0.3}}>
      <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:done?"#4caf7d22":active?"#c9a84c22":"transparent",border:`1px solid ${done?"#4caf7d":active?"#c9a84c":"#2a2a3a"}`,fontFamily:"IBM Plex Mono,monospace",fontSize:11,color:done?"#4caf7d":active?"#c9a84c":"#6b6880"}}>
        {done?"✓":n}
      </div>
      <span style={{fontFamily:"IBM Plex Mono,monospace",fontSize:11,color:done?"#4caf7d":active?"#c9a84c":"#6b6880",display:"flex",alignItems:"center",gap:8}}>
        {label}{active&&<Spinner/>}
      </span>
    </div>
  );
}
function TraitBar({left,right,position}) {
  const pct=Math.round((position||0.5)*100);
  return (
    <div style={{display:"grid",gridTemplateColumns:"110px 1fr 110px",alignItems:"center",gap:12,fontSize:12}}>
      <div style={{textAlign:"right",color:"#6b6880"}}>{left}</div>
      <div style={{height:5,background:"#1a1a28",borderRadius:3,position:"relative"}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#7b6cd8,#c9a84c)",borderRadius:3}}/>
        <div style={{position:"absolute",top:"50%",left:`${pct}%`,transform:"translate(-50%,-50%)",width:11,height:11,borderRadius:"50%",background:"#c9a84c",border:"2px solid #0a0a0f"}}/>
      </div>
      <div style={{color:"#6b6880"}}>{right}</div>
    </div>
  );
}
function Bullets({items,color}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      {(items||[]).map((item,i)=>(
        <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",fontSize:13,color:"#e8e6f0",fontWeight:300,lineHeight:1.5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:color,marginTop:5,flexShrink:0}}/>
          {item}
        </div>
      ))}
    </div>
  );
}
function Tag({label,type}) {
  const c={gold:"#c9a84c",purple:"#7b6cd8",red:"#e05c5c",green:"#4caf7d"}[type]||"#6b6880";
  return <span style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,letterSpacing:"0.08em",padding:"4px 11px",borderRadius:20,border:`1px solid ${c}`,color:c}}>{label}</span>;
}
function ScoreMeter({score}) {
  const color=score>=70?"#4caf7d":score>=45?"#c9a84c":"#e05c5c";
  const label=score>=70?"Healthy":score>=45?"Needs Work":"Critical";
  return (
    <div style={{textAlign:"center"}}>
      <div style={{fontFamily:"Playfair Display,serif",fontSize:40,fontWeight:700,color,lineHeight:1}}>{score}</div>
      <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.15em",color,marginTop:3}}>{label}</div>
      <div style={{height:4,background:"#1a1a28",borderRadius:2,marginTop:8,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${score}%`,background:color,borderRadius:2}}/>
      </div>
    </div>
  );
}

// ─── Business Health ──────────────────────────────────────────────────────────
function BusinessHealth({biz,painPoints,callOpeners}) {
  const h=biz||{};
  const metrics=[
    {label:"Google Rating",value:h.google_rating||"—",icon:"⭐"},
    {label:"Google Reviews",value:h.google_reviews||"—",icon:"💬"},
    {label:"Yelp Rating",value:h.yelp_rating||"—",icon:"🍽️"},
    {label:"FB Followers",value:h.facebook_followers||"—",icon:"📘"},
    {label:"IG Followers",value:h.instagram_followers||"—",icon:"📸"},
    {label:"Last FB Post",value:h.last_facebook_post||"—",icon:"📅"},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Card>
        <div style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:20,alignItems:"start"}}>
          <div>
            <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#6b6880",marginBottom:12}}>Health Score</div>
            <ScoreMeter score={h.health_score||50}/>
            {h.health_score_reason&&<div style={{fontSize:11,color:"#6b6880",marginTop:10,lineHeight:1.5,fontWeight:300}}>{h.health_score_reason}</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {metrics.map(({label,value,icon})=>(
              <div key={label} style={{background:"#0d0d14",border:"1px solid #1e1e2e",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:"#6b6880",marginBottom:4}}>{icon} {label}</div>
                <div style={{fontSize:14,color:"#e8e6f0",fontWeight:500}}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}>
          {h.online_ordering===false&&<span style={{fontSize:11,padding:"3px 10px",background:"rgba(224,92,92,0.08)",border:"1px solid rgba(224,92,92,0.2)",borderRadius:6,color:"#e05c5c"}}>❌ No online ordering</span>}
          {h.yelp_claimed===false&&<span style={{fontSize:11,padding:"3px 10px",background:"rgba(224,92,92,0.08)",border:"1px solid rgba(224,92,92,0.2)",borderRadius:6,color:"#e05c5c"}}>❌ Yelp unclaimed</span>}
          {h.google_hours_accurate===false&&<span style={{fontSize:11,padding:"3px 10px",background:"rgba(224,92,92,0.08)",border:"1px solid rgba(224,92,92,0.2)",borderRadius:6,color:"#e05c5c"}}>❌ Wrong hours on Google</span>}
          {h.unanswered_reviews&&h.unanswered_reviews!=="unknown"&&<span style={{fontSize:11,padding:"3px 10px",background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:6,color:"#c9a84c"}}>⚠️ {h.unanswered_reviews} unanswered reviews</span>}
        </div>
      </Card>
      {painPoints?.length>0&&(
        <Card>
          <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#e05c5c",marginBottom:13}}>🎯 Pain Points Found</div>
          <Bullets items={painPoints} color="#e05c5c"/>
        </Card>
      )}
      {callOpeners?.length>0&&(
        <Card style={{background:"rgba(201,168,76,0.04)",border:"1px solid rgba(201,168,76,0.15)"}}>
          <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#c9a84c",marginBottom:13}}>💡 Lead With These On The Call</div>
          <Bullets items={callOpeners} color="#c9a84c"/>
        </Card>
      )}
    </div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────
function Report({osint,jung,form}) {
  const initials=form.name.trim().split(/\s+/).map(w=>w[0]).join("").toUpperCase().slice(0,2);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      <div className="fu" style={{background:"#111118",border:"1px solid #1e1e2e",borderRadius:12,padding:22,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,#c9a84c,#7b6cd8,transparent)"}}/>
        <div style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#7b6cd8,#c9a84c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Playfair Display,serif",fontSize:20,color:"#fff",flexShrink:0}}>{initials}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:22,fontWeight:700}}>{osint.name||form.name}</div>
            <div style={{fontSize:12,color:"#6b6880",marginTop:3,fontWeight:300}}>
              <span style={{color:"#c9a84c"}}>{osint.business_name||form.business}</span>
              {osint.business_type&&` · ${osint.business_type}`}
              {osint.location&&` · ${osint.location}`}
              {osint.age_estimate&&` · Age ~${osint.age_estimate}`}
            </div>
            {osint.background_summary&&<div style={{fontSize:12,color:"#6b6880",marginTop:5,fontWeight:300,lineHeight:1.5}}>{osint.background_summary}</div>}
          </div>
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:30,color:"#4caf7d",lineHeight:1}}>{jung.confidence_score}%</div>
            <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,color:"#6b6880",textTransform:"uppercase",letterSpacing:"0.12em",marginTop:3}}>Confidence</div>
          </div>
        </div>
      </div>

      <div className="fu1" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[["📞",form.phone],["✉️",form.email],["📍",osint.location||form.city],["🌐",osint.business_health?.instagram_handle]].filter(x=>x[1]&&x[1]!=="unknown").map(([icon,val],i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:7,background:"#111118",border:"1px solid #1e1e2e",borderRadius:7,padding:"8px 13px",fontFamily:"IBM Plex Mono,monospace",fontSize:11,color:"#6b6880"}}>
            {icon} <span style={{color:"#e8e6f0"}}>{val}</span>
          </div>
        ))}
      </div>

      <div className="fu2">
        <SecTitle>Business Intelligence</SecTitle>
        <BusinessHealth biz={osint.business_health} painPoints={osint.pain_points} callOpeners={osint.call_openers}/>
      </div>

      <div className="fu3">
        <SecTitle>Social Footprint</SecTitle>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[
            {emoji:"📘",name:"Facebook",text:osint.facebook?.found?`${osint.facebook.posting_style||""}${osint.facebook.likes?.length?` Interests: ${osint.facebook.likes.slice(0,3).join(", ")}.`:""}`:"Not found publicly."},
            {emoji:"📸",name:"Instagram",text:osint.instagram?.found?`~${osint.instagram.followers_estimate} followers. ${osint.instagram.content_style||""}`:"Not found publicly."},
            {emoji:"🎵",name:"TikTok",text:osint.tiktok?.found?`Consumes: ${(osint.tiktok.content_consumed||[]).join(", ")}`:"Not found publicly."},
          ].map(({emoji,name,text})=>(
            <Card key={name} style={{textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:6}}>{emoji}</div>
              <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.12em",color:"#6b6880",marginBottom:9}}>{name}</div>
              <div style={{fontSize:12,color:"#e8e6f0",lineHeight:1.6,fontWeight:300}}>{text}</div>
            </Card>
          ))}
        </div>
      </div>

      {jung.opening_line&&(
        <div className="fu3" style={{background:"rgba(201,168,76,0.06)",border:"1px solid rgba(201,168,76,0.18)",borderRadius:10,padding:"14px 18px",display:"flex",gap:12,alignItems:"flex-start"}}>
          <span style={{fontSize:18,flexShrink:0}}>💬</span>
          <div>
            <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.15em",color:"#c9a84c",marginBottom:5}}>Suggested Opening Line</div>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:14,fontStyle:"italic",color:"#e8e6f0",lineHeight:1.65}}>"{jung.opening_line}"</div>
          </div>
        </div>
      )}

      <div className="fu4">
        <SecTitle>Jungian Archetype</SecTitle>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:18,paddingBottom:18,borderBottom:"1px solid #1e1e2e",marginBottom:18,flexWrap:"wrap"}}>
            <div style={{fontSize:44,lineHeight:1,flexShrink:0}}>{jung.archetype_emoji||"🌀"}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:22,fontWeight:700,color:"#c9a84c"}}>{jung.archetype}</div>
              <div style={{fontSize:13,color:"#6b6880",lineHeight:1.6,marginTop:3,fontWeight:300}}>{jung.archetype_description}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,textAlign:"center"}}>
            {[["Dominant Function",jung.dominant_function],["Shadow Risk",jung.shadow_risk],["MBTI Likely",jung.mbti_likely]].map(([lbl,val])=>(
              <div key={lbl}>
                <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,color:"#6b6880",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5}}>{lbl}</div>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:13,color:"#e8e6f0"}}>{val}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {jung.traits?.length>0&&(
        <div className="fu4">
          <SecTitle>Personality Spectrum</SecTitle>
          <Card style={{display:"flex",flexDirection:"column",gap:15}}>
            {jung.traits.map((t,i)=><TraitBar key={i} {...t}/>)}
          </Card>
        </div>
      )}

      <div className="fu5">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[
            {title:"🔥 Core Motivators",items:jung.motivators,color:"#c9a84c"},
            {title:"⚠️ Core Fears",items:jung.fears,color:"#e05c5c"},
            {title:"✅ Trust Triggers",items:jung.trust_triggers,color:"#4caf7d"},
            {title:"🚫 Objection Patterns",items:jung.objection_patterns,color:"#7b6cd8"},
          ].map(({title,items,color})=>(
            <Card key={title}>
              <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,letterSpacing:"0.13em",textTransform:"uppercase",color:"#6b6880",marginBottom:13}}>{title}</div>
              <Bullets items={items} color={color}/>
            </Card>
          ))}
        </div>
      </div>

      {(jung.language_to_use?.length||jung.language_to_avoid?.length)?(
        <div className="fu6">
          <SecTitle>Language Guide</SecTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Card>
              <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#4caf7d",marginBottom:11}}>✅ Use This</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {(jung.language_to_use||[]).map((w,i)=><span key={i} style={{fontSize:12,padding:"3px 10px",background:"rgba(76,175,125,0.07)",border:"1px solid rgba(76,175,125,0.18)",borderRadius:6,color:"#4caf7d"}}>{w}</span>)}
              </div>
            </Card>
            <Card>
              <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#e05c5c",marginBottom:11}}>🚫 Avoid This</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {(jung.language_to_avoid||[]).map((w,i)=><span key={i} style={{fontSize:12,padding:"3px 10px",background:"rgba(224,92,92,0.07)",border:"1px solid rgba(224,92,92,0.18)",borderRadius:6,color:"#e05c5c"}}>{w}</span>)}
              </div>
            </Card>
          </div>
        </div>
      ):null}

      <div className="fu7">
        <SecTitle>Caller's Brief</SecTitle>
        <div style={{background:"linear-gradient(135deg,rgba(201,168,76,0.07),rgba(123,108,216,0.04))",border:"1px solid rgba(201,168,76,0.2)",borderRadius:12,padding:24}}>
          <div style={{fontFamily:"Playfair Display,serif",fontSize:16,color:"#c9a84c",marginBottom:12,fontStyle:"italic"}}>"How to approach this prospect on the call"</div>
          <div style={{fontSize:14,lineHeight:1.85,color:"#e8e6f0",fontWeight:300}}>{jung.callers_brief}</div>
          {jung.tags?.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:16}}>
              {jung.tags.map((t,i)=><Tag key={i} {...t}/>)}
            </div>
          )}
        </div>
      </div>

      <div style={{paddingTop:14,borderTop:"1px solid #1e1e2e",display:"flex",justifyContent:"space-between",fontFamily:"IBM Plex Mono,monospace",fontSize:9,color:"#2e2e42"}}>
        <span>INTEL//PSYCH · Jungian Sales Intelligence</span>
        <span>CONFIDENTIAL · Internal Use Only</span>
      </div>
      <ReportChat osint={osint} jung={jung} form={form} />
    </div>
  );
}
// ─── Chat ────────────────────────────────────────────────────────────────────
function ReportChat({ osint, jung, form }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: `I have the full intel on ${osint.name || form.name}. Ask me anything about how to approach this call.` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const context = `You are a Jungian sales coach helping a salesperson prepare for a call. You have the full profile of their prospect:
OSINT: ${JSON.stringify(osint)}
JUNG: ${JSON.stringify(jung)}
Answer questions conversationally, like a coach talking to a salesperson right before a call. No bullet points, no bold text, no markdown. Just clear, direct, practical advice in plain sentences. Keep answers under 4 sentences unless more detail is truly needed. Always tie your advice back to this specific prospect's personality and data.`;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 500,
          messages: [
            { role: "user", content: context },
            ...newMessages.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      const data = await res.json();
      const reply = data?.content?.[0]?.text || "Sorry, I couldn't generate a response.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4caf7d" }} />
        <span style={{ fontFamily: "IBM Plex Mono,monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#c9a84c" }}>
          Ask the AI Coach
        </span>
      </div>
      <div style={{ height: 280, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.6, fontWeight: 300,
              background: m.role === "user" ? "rgba(201,168,76,0.12)" : "#16161f",
              border: `1px solid ${m.role === "user" ? "rgba(201,168,76,0.25)" : "#1e1e2e"}`,
              color: "#e8e6f0",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#16161f", border: "1px solid #1e1e2e", color: "#6b6880", fontSize: 13 }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1e1e2e", display: "flex", gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="e.g. How do I handle price objections with this prospect?"
          style={{ flex: 1, background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 8, padding: "10px 14px", color: "#e8e6f0", fontFamily: "DM Sans,sans-serif", fontSize: 13, outline: "none" }}
        />
        <button onClick={send} disabled={loading} style={{ background: "linear-gradient(135deg,#c9a84c,#a88038)", border: "none", borderRadius: 8, padding: "10px 18px", color: "#0a0a0f", fontFamily: "IBM Plex Mono,monospace", fontSize: 11, fontWeight: 500, cursor: "pointer", letterSpacing: "0.1em" }}>
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [form, setForm] = useState({name:"",business:"",city:"",email:"",phone:""});
  const [phase, setPhase] = useState("idle");
  const [stepsComplete, setStepsComplete] = useState(0);
  const [stepLabel, setStepLabel] = useState("");
  const [osint, setOsint] = useState(null);
  const [jung,  setJung]  = useState(null);
  const [error, setError] = useState("");

  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const clean = v => v.replace(/^mailto:/i,"").replace(/^tel:/i,"").trim();

  const run = async () => {
    const name=form.name.trim(), business=form.business.trim(), city=form.city.trim();
    if (!name||!business||!city) { setError("Owner name, business name and city are required."); return; }
    setError(""); setOsint(null); setJung(null); setPhase("running"); setStepsComplete(1);

    try {
      setStepLabel("Running Google searches…");
      const [gmb,facebook,instagram,yelp,reviews,owner] = await Promise.all([
        serperPlaces(`${business} ${city}`),
        serperSearch(`${business} ${city} facebook`),
        serperSearch(`${business} ${city} instagram`),
        serperSearch(`${business} ${city} yelp`),
        serperSearch(`"${business}" ${city} reviews`),
        serperSearch(`${name} ${city} restaurante dueño`),
      ]);
      setStepsComplete(2);

      setStepLabel("OSINT Agent structuring footprint…");
      const o = await callClaude([{role:"user", content:buildOsintPrompt(
        {name,business,city,email:clean(form.email),phone:clean(form.phone)},
        {gmb,facebook,instagram,yelp,reviews,owner}
      )}]);
      setOsint(o); setStepsComplete(3);

      setStepLabel("Jungian Agent decoding personality…");
      const j = await callClaude([{role:"user", content:buildJungPrompt(o)}]);
      setJung(j); setPhase("done");

    } catch(err) {
      setError(err.message||"Something went wrong. Please try again.");
      setPhase("idle");
    }
  };

  const reset = () => { setPhase("idle"); setOsint(null); setJung(null); setForm({name:"",business:"",city:"",email:"",phone:""}); setError(""); };

  const steps=[
    {label:"Running 6 Google searches on business + owner"},
    {label:"OSINT Agent — structuring footprint + pain points"},
    {label:"Jungian Agent — decoding personality profile"},
    {label:"Building caller's brief"},
  ];

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{minHeight:"100vh",background:"#0a0a0f",backgroundImage:"radial-gradient(ellipse 55% 35% at 85% 5%, rgba(123,108,216,0.08) 0%,transparent 60%),radial-gradient(ellipse 40% 25% at 5% 90%, rgba(201,168,76,0.05) 0%,transparent 50%)",padding:"32px 18px"}}>
        <div style={{maxWidth:860,margin:"0 auto"}}>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28,paddingBottom:18,borderBottom:"1px solid #1e1e2e"}}>
            <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:11,letterSpacing:"0.2em",color:"#6b6880",textTransform:"uppercase"}}>
              INTEL<span style={{color:"#c9a84c"}}>//</span>PSYCH
            </div>
            {phase==="done"&&<button onClick={reset} style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,letterSpacing:"0.13em",textTransform:"uppercase",color:"#6b6880",background:"none",border:"1px solid #1e1e2e",borderRadius:6,padding:"6px 13px",cursor:"pointer"}}>← New Prospect</button>}
          </div>

          {phase==="idle"&&(
            <div className="fu">
              <div style={{marginBottom:24}}>
                <h1 style={{fontFamily:"Playfair Display,serif",fontSize:26,fontWeight:700,marginBottom:6}}>Prospect Intelligence</h1>
                <p style={{color:"#6b6880",fontSize:13,fontWeight:300,lineHeight:1.7}}>Enter the prospect's info. The system runs real Google searches, audits their business, then decodes their Jungian personality — so you walk into every call prepared.</p>
              </div>
              <Card style={{display:"flex",flexDirection:"column",gap:16}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <Label>Owner Name *</Label>
                    <input style={inp} placeholder="e.g. Victor Muñoz" value={form.name} onChange={set("name")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                  <div>
                    <Label>Business Name *</Label>
                    <input style={inp} placeholder="e.g. Tacos El Rey" value={form.business} onChange={set("business")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                </div>
                <div>
                  <Label>City *</Label>
                  <input style={inp} placeholder="e.g. Barranquilla, Colombia" value={form.city} onChange={set("city")}
                    onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <Label>Email (optional)</Label>
                    <input style={inp} placeholder="email@example.com" value={form.email} onChange={set("email")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                  <div>
                    <Label>Phone (optional)</Label>
                    <input style={inp} placeholder="6825517404" value={form.phone} onChange={set("phone")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                </div>
                {error&&<div style={{background:"rgba(224,92,92,0.09)",border:"1px solid rgba(224,92,92,0.22)",borderRadius:8,padding:"11px 14px",fontSize:13,color:"#e05c5c"}}>⚠️ {error}</div>}
                <button onClick={run} style={{background:"linear-gradient(135deg,#c9a84c,#a88038)",border:"none",borderRadius:9,padding:"13px 22px",color:"#0a0a0f",fontFamily:"IBM Plex Mono,monospace",fontSize:11,fontWeight:500,letterSpacing:"0.15em",textTransform:"uppercase",cursor:"pointer",marginTop:4}}>
                  Run Intelligence Report →
                </button>
              </Card>
            </div>
          )}

          {phase==="running"&&(
            <div className="fu">
              <Card style={{display:"flex",flexDirection:"column",gap:18}}>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:18,marginBottom:4}}>
                  Researching <em style={{color:"#c9a84c"}}>{form.business}</em>…
                </div>
                {steps.map((s,i)=>(
                  <Step key={i} n={i+1} label={s.label} done={stepsComplete>i+1} active={stepsComplete===i+1}/>
                ))}
                <div style={{height:3,background:"#1a1a28",borderRadius:2,overflow:"hidden",marginTop:4}}>
                  <div style={{height:"100%",background:"linear-gradient(90deg,#c9a84c,#7b6cd8)",width:`${(stepsComplete/4)*100}%`,transition:"width 0.9s ease"}}/>
                </div>
                <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,color:"#6b6880"}}>{stepLabel}</div>
              </Card>
            </div>
          )}

          {phase==="done"&&osint&&jung&&(
            <Report osint={osint} jung={jung} form={{...form,email:clean(form.email),phone:clean(form.phone)}}/>
          )}

        </div>
      </div>
    </>
  );
}
