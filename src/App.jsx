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
@media print {
  body { background: #0a0a0f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  .fu, .fu1, .fu2, .fu3, .fu4, .fu5, .fu6, .fu7 { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`;

// ─── API helpers ──────────────────────────────────────────────────────────────
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
    body: JSON.stringify({ messages, max_tokens: 8000 }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  return extractJSON(text);
}

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
Business: ${form.business||"unknown"}
City: ${form.city||"unknown"}
Email: ${form.email||"not provided"}
Phone: ${form.phone||"not provided"}
DoorDash URL: ${form.doordash||"not provided"}
Uber Eats URL: ${form.ubereats||"not provided"}
Facebook Profile: ${form.facebook||"not provided"}
Instagram URL: ${form.instagram_url||"not provided"}
TikTok Profile: ${form.tiktok||"not provided"}

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
  "business_name": "${form.business||"unknown"}",
  "business_type": "restaurant/food truck/etc based on search results",
  "location": "${form.city||"unknown"}",
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
  return `You are a forensic sales intelligence expert who has deeply studied 25 closed sales calls from Isaac — the top performer at Fonda, a managed online ordering service for Latino-owned independent restaurants in the US. You know Isaac's system inside out.

Your job: generate a complete word-for-word PITCH SCRIPT for this specific prospect, based on their real data and Isaac's proven methodology.

ISAAC'S COMPLETE SYSTEM:

THE 8-STEP CALL SKELETON (every script must follow this exactly):
1. ENTRY — Warm, human, non-corporate. Sound like a researcher calling to understand, not a salesperson calling to sell.
2. PERMISSION FRAME — Reframe the call as diagnostic: "Esta llamada la usamos más que todo para conocerte a ti, a tu negocio, ver tus necesidades, y en base a eso yo te voy a decir lo que podemos hacer." This grants them the experience of being understood, not pitched.
3. DIAGNOSIS — 3 questions that surface pain. Not information gathering — urgency creation. Each question makes them articulate their own problem out loud before anything is offered.
4. MIRRORING — Compressed accurate summary of what you just heard. "Ya tengo más o menos como un overview de lo que está pasando allá..." Being accurately seen by a stranger carries disproportionate emotional charge.
5. REVELATION — Make the invisible visible. The specific pain point that will create urgency. Either the tablet fee ($28/month per device, vendas o no vendas), the Google profile gaps, or the commission math.
6. PRE-EMPTION — Handle all 4 objections BEFORE price is revealed: Cost → tablet savings math. Risk → "no vas a pagar nada todavía." Commitment → "puedes cancelar en cualquier momento." Commission → "para ti no hay diferencia."
7. PRICE FRAME — $124/month revealed only after value stack makes it feel like relief, not expense. Never argue it's worth it. Let their own math arrive there.
8. THE CLOSE — Data collection close. Never ask for the sale. Begin collecting "información para el acuerdo." By the time they realize it's an activation sequence, they've already answered 8 questions.

THREE ARCHETYPES:
- SAGE: When prospect is analytical/skeptical. Share hidden intelligence. Educate, don't sell.
- CAREGIVER: When prospect is vulnerable or burned. Warmth without pity. Reframe shame as solvable.
- MAGICIAN: Photo transformation moment. Ask for worst food photo, return it professionally edited. The future made visible.

THREE CUSTOMER PROFILES:
- PROFILE A (Beginner, under 2 years): Lead with "flujo constante de clientes." Educational and patient.
- PROFILE B (Disillusioned, burned before): Validation first. Cancellation guarantee front and center. Become advisor not vendor.
- PROFILE C (Established, 8+ years): Peer-level. Respect expertise. "Tú haces menos y ves más resultados."

CORE PHRASES (use these exactly in the script):
- "Son un mal necesario — te cobran comisión, pero te dan acceso a clientes. Es como pagar renta en un centro comercial."
- "¿Sabías que te cobran $28 al mes por cada tableta, vendas o no vendas?"
- "De ese 30% que ya estás pagando, yo me agarro un 5%. Para ti no hay diferencia — solo cambia a quién se lo pagas."
- "Tú haces menos y ves más resultados."
- "Puedes cancelar en cualquier momento. Esta relación va a estar sustentada en resultados."
- "No vas a pagar absolutamente nada todavía."
- "¿Empezamos o empezamos?"
- "Una vez tú lo firmes..." / "Cuando te activemos..." (embedded assumption grammar)

THE ADVISOR PIVOT: "Te están cobrando por nada, literal. Deberías cancelarlos aunque no trabajes con nosotros." Makes you an advisor, not a vendor. Vendors can be rejected. Advisors are listened to.

WHATSAPP BRIDGE: During the call, open a second channel. Send the demo link or a before/after photo. By call end they are already in contact on the platform they use for family.

DIGNITY FRAME: You are not selling delivery platform management. You are selling dignity — someone finally in their corner who speaks their language and understands what they have built.

PROSPECT DATA:
${JSON.stringify(osint, null, 2)}

CRITICAL: Respond with ONLY a valid JSON object. Start with { and end with }. No other text.

{
  "prospect_summary": "2 sentences — who this person is and their exact business situation based on real data found",
  "customer_profile": "A, B, or C",
  "customer_profile_reason": "one sentence why, referencing their specific data",
  "lead_archetype": "Sage, Caregiver, or Magician",
  "confidence_score": 85,
  "pitch_script": [
    {
      "step": 1,
      "name": "Entry",
      "objective": "what this step accomplishes psychologically",
      "script": "exact words to say — warm, specific, references something REAL about their business. In Spanish.",
      "notes": "coaching note for Carlos in English — tone, what to listen for, what not to do",
      "if_they_say": "the most likely first response from this specific prospect",
      "then_you_say": "exact follow-up in Spanish"
    },
    {
      "step": 2,
      "name": "Permission Frame",
      "objective": "reframe from sales call to diagnostic conversation",
      "script": "exact permission frame words adapted to this prospect in Spanish",
      "notes": "coaching note in English",
      "if_they_say": "likely response",
      "then_you_say": "follow-up in Spanish"
    },
    {
      "step": 3,
      "name": "Diagnosis",
      "objective": "surface pain through questions, not statements",
      "script": "3 diagnostic questions in Spanish, numbered, each designed to make them articulate a specific problem",
      "notes": "coaching note — what answers to listen for and why each question matters",
      "if_they_say": "most revealing answer this prospect will likely give",
      "then_you_say": "how to respond to that answer in Spanish"
    },
    {
      "step": 4,
      "name": "Mirroring",
      "objective": "make them feel accurately seen — create the relief that opens everything",
      "script": "compressed summary of their situation using their real data — Google rating, reviews, social presence, pain points. In Spanish.",
      "notes": "coaching note — pause here, let the mirror land, don't rush to the next step",
      "if_they_say": "typical response when someone feels understood",
      "then_you_say": "transition to revelation in Spanish"
    },
    {
      "step": 5,
      "name": "Revelation",
      "objective": "make the invisible cost visible — create urgency through information not pressure",
      "script": "the specific revelation for this prospect using their real data — tablet fees, commission math, or Google gaps. Exact words in Spanish.",
      "notes": "coaching note — deliver this calmly, like sharing intelligence not making an accusation",
      "if_they_say": "shocked or defensive response",
      "then_you_say": "exact follow-up in Spanish"
    },
    {
      "step": 6,
      "name": "Pre-emption",
      "objective": "dissolve all 4 objections before they are raised",
      "script": "pre-empt cost, risk, commitment, and commission objections in order. Exact words in Spanish.",
      "notes": "coaching note — these are statements not responses to objections. Say them before they object.",
      "if_they_say": "any remaining hesitation",
      "then_you_say": "advisor pivot in Spanish"
    },
    {
      "step": 7,
      "name": "Price Frame",
      "objective": "reveal price as relief after value stack makes it feel like a net positive",
      "script": "value stack then price reveal. Exact words in Spanish.",
      "notes": "coaching note — pause after revealing $124, let them do the math, don't fill silence",
      "if_they_say": "price objection or comparison to competitors",
      "then_you_say": "exact reframe in Spanish"
    },
    {
      "step": 8,
      "name": "The Close",
      "objective": "begin data collection without announcing a decision has been made",
      "script": "transition into data collection. Exact words in Spanish. Use embedded assumption grammar.",
      "notes": "coaching note — move smoothly from conversation to paperwork. The decision is already made.",
      "if_they_say": "last minute hesitation",
      "then_you_say": "¿Empezamos o empezamos? and begin collecting info"
    }
  ],
  "objection_map": [
    {
      "objection": "most likely objection from this specific prospect",
      "psychology": "why they are saying it based on their profile and history",
      "response": "exact words to respond in Spanish"
    },
    {
      "objection": "second most likely objection",
      "psychology": "psychological root",
      "response": "exact response in Spanish"
    },
    {
      "objection": "third objection",
      "psychology": "psychological root",
      "response": "exact response in Spanish"
    }
  ],
  "whatsapp_moment": "exactly what to send on WhatsApp, at what point in the call, and why that timing matters",
  "close_script": "the exact data collection sequence — what info to ask for and in what order to make the close feel like onboarding not signing",
  "pre_call_brief": "3 sentences for Carlos — what to remember walking into this call, what this prospect needs to feel, and what winning looks like"
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
          <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#c9a84c",marginBottom:13}}>💡 Use These to Open</div>
          <Bullets items={callOpeners} color="#c9a84c"/>
        </Card>
      )}
    </div>
  );
}

// ─── Pitch Step Card ──────────────────────────────────────────────────────────
function PitchStep({step}) {
  const [open, setOpen] = useState(step.step <= 2);
  const stepColors = {
    1:"#4caf7d", 2:"#4caf7d", 3:"#c9a84c", 4:"#c9a84c",
    5:"#e05c5c", 6:"#7b6cd8", 7:"#7b6cd8", 8:"#c9a84c"
  };
  const color = stepColors[step.step] || "#c9a84c";
  return (
    <div style={{border:`1px solid ${open?"rgba(201,168,76,0.25)":"#1e1e2e"}`,borderRadius:12,overflow:"hidden",background:open?"rgba(201,168,76,0.02)":"#111118",transition:"all 0.2s"}}>
      {/* Header */}
      <div onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px",cursor:"pointer"}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:`${color}22`,border:`1px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"IBM Plex Mono,monospace",fontSize:12,color,flexShrink:0,fontWeight:700}}>
          {step.step}
        </div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,letterSpacing:"0.15em",textTransform:"uppercase",color,marginBottom:2}}>{step.name}</div>
          <div style={{fontSize:12,color:"#6b6880",fontWeight:300}}>{step.objective}</div>
        </div>
        <div style={{color:"#3a3850",fontSize:16,flexShrink:0}}>{open?"▾":"▸"}</div>
      </div>

      {open && (
        <div style={{padding:"0 20px 20px",display:"flex",flexDirection:"column",gap:14}}>
          {/* Script */}
          <div style={{background:"#0a0a0f",border:"1px solid #1e1e2e",borderRadius:10,padding:16}}>
            <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,letterSpacing:"0.2em",textTransform:"uppercase",color:color,marginBottom:10}}>📢 Say This</div>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:14,color:"#e8e6f0",lineHeight:1.8,fontStyle:"italic"}}>"{step.script}"</div>
          </div>

          {/* Notes */}
          {step.notes&&(
            <div style={{background:"rgba(123,108,216,0.06)",border:"1px solid rgba(123,108,216,0.15)",borderRadius:10,padding:14}}>
              <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,letterSpacing:"0.2em",textTransform:"uppercase",color:"#7b6cd8",marginBottom:8}}>🎯 Coach Note</div>
              <div style={{fontSize:12,color:"#6b6880",lineHeight:1.7,fontWeight:300}}>{step.notes}</div>
            </div>
          )}

          {/* If/Then */}
          {(step.if_they_say||step.then_you_say)&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {step.if_they_say&&(
                <div style={{background:"rgba(224,92,92,0.05)",border:"1px solid rgba(224,92,92,0.15)",borderRadius:10,padding:14}}>
                  <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,letterSpacing:"0.18em",textTransform:"uppercase",color:"#e05c5c",marginBottom:8}}>If They Say…</div>
                  <div style={{fontSize:12,color:"#e8e6f0",lineHeight:1.6,fontWeight:300,fontStyle:"italic"}}>"{step.if_they_say}"</div>
                </div>
              )}
              {step.then_you_say&&(
                <div style={{background:"rgba(76,175,125,0.05)",border:"1px solid rgba(76,175,125,0.15)",borderRadius:10,padding:14}}>
                  <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,letterSpacing:"0.18em",textTransform:"uppercase",color:"#4caf7d",marginBottom:8}}>You Say…</div>
                  <div style={{fontSize:12,color:"#e8e6f0",lineHeight:1.6,fontWeight:300,fontStyle:"italic"}}>"{step.then_you_say}"</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────
function Report({osint,jung,form}) {
  const initials=form.name.trim().split(/\s+/).map(w=>w[0]).join("").toUpperCase().slice(0,2);
  const profileColor = {A:"#4caf7d",B:"#c9a84c",C:"#7b6cd8"}[jung.customer_profile]||"#c9a84c";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>

      {/* Identity */}
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
            </div>
            {jung.prospect_summary&&<div style={{fontSize:12,color:"#6b6880",marginTop:5,fontWeight:300,lineHeight:1.5}}>{jung.prospect_summary}</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0,textAlign:"center"}}>
            <div>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:22,color:profileColor,lineHeight:1}}>Profile {jung.customer_profile}</div>
              <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,color:"#6b6880",textTransform:"uppercase",letterSpacing:"0.12em",marginTop:2}}>{jung.lead_archetype}</div>
            </div>
            <div>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:22,color:"#4caf7d",lineHeight:1}}>{jung.confidence_score}%</div>
              <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,color:"#6b6880",textTransform:"uppercase",letterSpacing:"0.12em",marginTop:2}}>Confidence</div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact pills */}
      <div className="fu1" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[["📞",form.phone],["✉️",form.email],["📍",osint.location||form.city],["🌐",osint.business_health?.instagram_handle]].filter(x=>x[1]&&x[1]!=="unknown").map(([icon,val],i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:7,background:"#111118",border:"1px solid #1e1e2e",borderRadius:7,padding:"8px 13px",fontFamily:"IBM Plex Mono,monospace",fontSize:11,color:"#6b6880"}}>
            {icon} <span style={{color:"#e8e6f0"}}>{val}</span>
          </div>
        ))}
      </div>

      {/* Pre-call brief */}
      {jung.pre_call_brief&&(
        <div className="fu1" style={{background:"linear-gradient(135deg,rgba(201,168,76,0.08),rgba(123,108,216,0.04))",border:"1px solid rgba(201,168,76,0.22)",borderRadius:12,padding:"18px 22px"}}>
          <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.15em",color:"#c9a84c",marginBottom:8}}>⚡ Pre-Call Brief</div>
          <div style={{fontSize:14,color:"#e8e6f0",lineHeight:1.8,fontWeight:300,fontStyle:"italic"}}>{jung.pre_call_brief}</div>
        </div>
      )}

      {/* Business Intel */}
      <div className="fu2">
        <SecTitle>Business Intelligence</SecTitle>
        <BusinessHealth biz={osint.business_health} painPoints={osint.pain_points} callOpeners={osint.call_openers}/>
      </div>

      {/* Pitch Script */}
      <div className="fu3">
        <SecTitle>Pitch Script — Follow This Step by Step</SecTitle>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(jung.pitch_script||[]).map((step,i)=>(
            <PitchStep key={i} step={step}/>
          ))}
        </div>
      </div>

      {/* Objection Map */}
      {jung.objection_map?.length>0&&(
        <div className="fu4">
          <SecTitle>Objection Map</SecTitle>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {jung.objection_map.map((obj,i)=>(
              <Card key={i}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
                  <div>
                    <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,textTransform:"uppercase",letterSpacing:"0.15em",color:"#e05c5c",marginBottom:6}}>They Say</div>
                    <div style={{fontSize:12,color:"#e8e6f0",lineHeight:1.6,fontStyle:"italic"}}>"{obj.objection}"</div>
                  </div>
                  <div>
                    <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,textTransform:"uppercase",letterSpacing:"0.15em",color:"#7b6cd8",marginBottom:6}}>Why</div>
                    <div style={{fontSize:12,color:"#6b6880",lineHeight:1.6,fontWeight:300}}>{obj.psychology}</div>
                  </div>
                  <div>
                    <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:8,textTransform:"uppercase",letterSpacing:"0.15em",color:"#4caf7d",marginBottom:6}}>You Say</div>
                    <div style={{fontSize:12,color:"#e8e6f0",lineHeight:1.6,fontStyle:"italic"}}>"{obj.response}"</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp + Close */}
      <div className="fu5" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {jung.whatsapp_moment&&(
          <Card>
            <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#4caf7d",marginBottom:10}}>📱 WhatsApp Moment</div>
            <div style={{fontSize:13,color:"#e8e6f0",lineHeight:1.7,fontWeight:300}}>{jung.whatsapp_moment}</div>
          </Card>
        )}
        {jung.close_script&&(
          <Card>
            <div style={{fontFamily:"IBM Plex Mono,monospace",fontSize:9,textTransform:"uppercase",letterSpacing:"0.13em",color:"#c9a84c",marginBottom:10}}>🔒 Close Sequence</div>
            <div style={{fontSize:13,color:"#e8e6f0",lineHeight:1.7,fontWeight:300}}>{jung.close_script}</div>
          </Card>
        )}
      </div>

      <div style={{paddingTop:14,borderTop:"1px solid #1e1e2e",display:"flex",justifyContent:"space-between",fontFamily:"IBM Plex Mono,monospace",fontSize:9,color:"#2e2e42"}}>
        <span>INTEL//PSYCH · Fonda Pitch Intelligence</span>
        <span>CONFIDENTIAL · Internal Use Only</span>
      </div>

      <ReportChat osint={osint} jung={jung} form={form}/>
    </div>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function ReportChat({ osint, jung, form }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: `Pitch script ready for ${osint.name || form.name}. Ask me anything about handling this call.` }
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
      const context = `You are a Jungian sales coach helping Carlos close a deal with this prospect. You have their full pitch script and intelligence profile:
OSINT: ${JSON.stringify(osint)}
PITCH: ${JSON.stringify(jung)}
Answer conversationally, like a coach talking right before or during a call. No bullet points, no markdown. Plain sentences only. Under 4 sentences unless truly needed. Always reference this specific prospect's data.`;

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
      const reply = data?.content?.[0]?.text || "Sorry, couldn't generate a response.";
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
          placeholder="e.g. He already tried DoorDash and it didn't work. What do I say?"
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
  const [form, setForm] = useState({name:"",business:"",city:"",email:"",phone:"",doordash:"",ubereats:"",facebook:"",instagram_url:"",tiktok:""});
  const [phase, setPhase] = useState("idle");
  const [stepsComplete, setStepsComplete] = useState(0);
  const [stepLabel, setStepLabel] = useState("");
  const [osint, setOsint] = useState(null);
  const [jung,  setJung]  = useState(null);
  const [error, setError] = useState("");

  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const clean = v => v.replace(/^mailto:/i,"").replace(/^tel:/i,"").trim();

  const run = async () => {
    const name=form.name.trim();
    const business=form.business.trim();
    const city=form.city.trim();
    if (!name) { setError("Owner name is required."); return; }
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
        {name,business,city,email:clean(form.email),phone:clean(form.phone),doordash:form.doordash,ubereats:form.ubereats,facebook:form.facebook,instagram_url:form.instagram_url,tiktok:form.tiktok},
        {gmb,facebook,instagram,yelp,reviews,owner}
      )}]);
      setOsint(o); setStepsComplete(3);

      setStepLabel("Building pitch script…");
      const j = await callClaude([{role:"user", content:buildJungPrompt(o)}]);
      setJung(j); setPhase("done");

    } catch(err) {
      setError(err.message||"Something went wrong. Please try again.");
      setPhase("idle");
    }
  };

  const reset = () => { setPhase("idle"); setOsint(null); setJung(null); setForm({name:"",business:"",city:"",email:"",phone:"",doordash:"",ubereats:"",facebook:"",instagram_url:"",tiktok:""}); setError(""); };

  const steps=[
    {label:"Running 6 Google searches on business + owner"},
    {label:"OSINT Agent — structuring footprint + pain points"},
    {label:"Building personalized pitch script"},
    {label:"Finalizing objection map + close sequence"},
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
            {phase==="done"&&(
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>window.print()} style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,letterSpacing:"0.13em",textTransform:"uppercase",color:"#0a0a0f",background:"linear-gradient(135deg,#c9a84c,#a88038)",border:"none",borderRadius:6,padding:"6px 13px",cursor:"pointer"}} className="no-print">
                  ↓ Download PDF
                </button>
                <button onClick={reset} style={{fontFamily:"IBM Plex Mono,monospace",fontSize:10,letterSpacing:"0.13em",textTransform:"uppercase",color:"#6b6880",background:"none",border:"1px solid #1e1e2e",borderRadius:6,padding:"6px 13px",cursor:"pointer"}} className="no-print">
                  ← New Prospect
                </button>
              </div>
            )}
          </div>

          {phase==="idle"&&(
            <div className="fu">
              <div style={{marginBottom:24}}>
                <h1 style={{fontFamily:"Playfair Display,serif",fontSize:26,fontWeight:700,marginBottom:6}}>Pitch Intelligence</h1>
                <p style={{color:"#6b6880",fontSize:13,fontWeight:300,lineHeight:1.7}}>Enter the prospect's info. The system researches their business, then generates a word-for-word pitch script based on Isaac's proven sales methodology — tailored to this specific person.</p>
              </div>
              <Card style={{display:"flex",flexDirection:"column",gap:16}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <Label>Owner Name *</Label>
                    <input style={inp} placeholder="e.g. Victor Muñoz" value={form.name} onChange={set("name")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                  <div>
                    <Label>Business Name (optional)</Label>
                    <input style={inp} placeholder="e.g. Tacos El Rey" value={form.business} onChange={set("business")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                </div>
                <div>
                  <Label>City (optional)</Label>
                  <input style={inp} placeholder="e.g. Chicago, IL" value={form.city} onChange={set("city")}
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
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <Label>DoorDash Link (optional)</Label>
                    <input style={inp} placeholder="doordash.com/store/..." value={form.doordash} onChange={set("doordash")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                  <div>
                    <Label>Uber Eats Link (optional)</Label>
                    <input style={inp} placeholder="ubereats.com/store/..." value={form.ubereats} onChange={set("ubereats")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <Label>Facebook Profile (optional)</Label>
                    <input style={inp} placeholder="facebook.com/..." value={form.facebook} onChange={set("facebook")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                  <div>
                    <Label>Instagram Profile (optional)</Label>
                    <input style={inp} placeholder="instagram.com/..." value={form.instagram_url} onChange={set("instagram_url")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div>
                    <Label>TikTok Profile (optional)</Label>
                    <input style={inp} placeholder="tiktok.com/@..." value={form.tiktok} onChange={set("tiktok")}
                      onFocus={e=>e.target.style.borderColor="#c9a84c"} onBlur={e=>e.target.style.borderColor="#1e1e2e"}/>
                  </div>
                </div>
                {error&&<div style={{background:"rgba(224,92,92,0.09)",border:"1px solid rgba(224,92,92,0.22)",borderRadius:8,padding:"11px 14px",fontSize:13,color:"#e05c5c"}}>⚠️ {error}</div>}
                <button onClick={run} style={{background:"linear-gradient(135deg,#c9a84c,#a88038)",border:"none",borderRadius:9,padding:"13px 22px",color:"#0a0a0f",fontFamily:"IBM Plex Mono,monospace",fontSize:11,fontWeight:500,letterSpacing:"0.15em",textTransform:"uppercase",cursor:"pointer",marginTop:4}}>
                  Generate Pitch Script →
                </button>
              </Card>
            </div>
          )}

          {phase==="running"&&(
            <div className="fu">
              <Card style={{display:"flex",flexDirection:"column",gap:18}}>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:18,marginBottom:4}}>
                  Building pitch script for <em style={{color:"#c9a84c"}}>{form.name}</em>…
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
