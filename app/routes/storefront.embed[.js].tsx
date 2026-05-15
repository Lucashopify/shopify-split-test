/**
 * GET /storefront/embed.js?shop=<myshopify-domain>
 *
 * Serves the complete split-test embed as a plain JS file.
 * The experiment config is inlined by the server at request time —
 * no extra round-trip needed on the storefront.
 *
 * Usage: add to theme.liquid before </head>:
 *   <script src="https://<app-url>/storefront/embed.js?shop={{ shop.myshopify_domain }}" defer></script>
 */
import { type LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";
import { buildConfig } from "../lib/experiments/config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop") ?? "";

  let config = {
    experiments: [] as unknown[],
    apiUrl: process.env.SHOPIFY_APP_URL ?? "",
    updatedAt: new Date().toISOString(),
  };

  if (shopDomain) {
    try {
      const shop = await prisma.shop.findUnique({ where: { shopDomain } });
      if (shop && !shop.uninstalledAt) {
        config = await buildConfig(shop.id);
      }
    } catch (err) {
      console.error("[embed.js] config fetch failed:", err);
    }
  }

  const configJson = JSON.stringify(config);

  const js = `/* Split Test App — storefront embed */
(function(w,d){
  /* ── config (inlined by server) ─────────────────────────────────── */
  var cfg=${configJson};
  var exps=cfg.experiments||[];
  var apiUrl=(cfg.apiUrl||'').replace(/\\/$/,'');
  if(!exps.length||!apiUrl)return;

  /* ── constants ───────────────────────────────────────────────────── */
  var VC='spt_vid',AC='spt_asgn';
  var YEAR=31536000;
  var https=location.protocol==='https:';
  var csfx='; Path=/; Max-Age='+YEAR+'; SameSite=Lax'+(https?'; Secure':'');

  /* ── cookie helpers ──────────────────────────────────────────────── */
  function gc(n){var m=d.cookie.match('(?:^|;)\\\\s*'+n+'=([^;]+)');return m?decodeURIComponent(m[1]):null;}
  function sc(n,v){d.cookie=n+'='+encodeURIComponent(v)+csfx;}

  /* ── visitor token ───────────────────────────────────────────────── */
  function r32(){
    try{return(crypto.getRandomValues(new Uint32Array(1))[0]>>>0).toString(16).padStart(8,'0');}
    catch(e){return(Math.random()*0xFFFFFFFF>>>0).toString(16).padStart(8,'0');}
  }
  function vid(){var v=gc(VC);if(!v){v=r32()+r32()+r32()+r32();sc(VC,v);}return v;}

  /* ── FNV-1a 32-bit hash ──────────────────────────────────────────── */
  function fnv(s){var h=2166136261;for(var i=0;i<s.length;i++){h=(h^s.charCodeAt(i));h=(h*16777619)>>>0;}return h;}
  function bkt(v,e){return fnv(v+':'+e)%100;}

  /* ── assignment cookie ───────────────────────────────────────────── */
  function getAsgn(){try{return JSON.parse(gc(AC)||'{}');}catch(e){return{};}}
  function saveAsgn(a){sc(AC,JSON.stringify(a));}

  /* ── main assignment loop ────────────────────────────────────────── */
  var visitorId=vid();
  var asgn=getAsgn();
  var changed=false;
  var html=d.documentElement;

  html.classList.add('spt-loading');

  for(var i=0;i<exps.length;i++){
    var exp=exps[i];
    if(exp.status!=='RUNNING')continue;
    var allocB=fnv(visitorId+':'+exp.id+':alloc')%100;
    if(allocB>=(exp.trafficAllocation||100))continue;
    var varId=asgn[exp.id];
    if(!varId){
      var b=bkt(visitorId,exp.id),cum=0,vs=exp.variants||[];
      for(var j=0;j<vs.length;j++){cum+=vs[j].trafficWeight||0;if(b<cum){varId=vs[j].id;break;}}
      if(varId){asgn[exp.id]=varId;changed=true;}
    }
    if(varId){html.classList.add('spt-e-'+exp.id.slice(-8)+'-v-'+varId.slice(-8));}
  }

  html.classList.remove('spt-loading');
  html.classList.add('spt-ready');
  if(changed)saveAsgn(asgn);

  /* ── variant application ─────────────────────────────────────────── */
  for(var k=0;k<exps.length;k++){
    var eA=exps[k];
    if(eA.status!=='RUNNING')continue;
    var vId=asgn[eA.id];
    if(!vId)continue;
    var vs2=eA.variants||[],av=null;
    for(var m=0;m<vs2.length;m++){if(vs2[m].id===vId){av=vs2[m];break;}}
    if(!av||av.isControl)continue;
    if(eA.type==='URL_REDIRECT'&&av.redirectUrl){
      if(eA.targetUrl&&location.pathname+location.search!==eA.targetUrl){continue;}
      if(location.pathname+location.search!==av.redirectUrl&&location.href!==av.redirectUrl){
        w.location.replace(av.redirectUrl);return;
      }
    }
  }

  /* ── GA4 experiment impression ───────────────────────────────────── */
  if(changed&&typeof w.gtag==='function'){
    var userProps={};
    for(var gi=0;gi<exps.length;gi++){
      var gExp=exps[gi];
      var gVid=asgn[gExp.id];
      if(!gVid)continue;
      var gVars=gExp.variants||[],gVarName=gVid;
      for(var gj=0;gj<gVars.length;gj++){if(gVars[gj].id===gVid){gVarName=gVars[gj].name||gVid;break;}}
      var gLabel=(gExp.name||gExp.id)+': '+gVarName;
      userProps['split_test_variant']=gLabel;
      w.gtag('event','experiment_impression',{
        experiment_id:gExp.id,
        experiment_name:gExp.name||gExp.id,
        variant_id:gVid,
        variant_name:gVarName,
      });
    }
    if(Object.keys(userProps).length){
      w.gtag('set','user_properties',userProps);
    }
  }

  /* ── expose globals ──────────────────────────────────────────────── */
  w.__SPT_VID__=visitorId;
  w.__SPT_ASGN__=asgn;
  w.__SPT_CFG__=cfg;

  /* ── async tracking ──────────────────────────────────────────────── */
  function hasConsent(){
    try{var cp=w.Shopify&&w.Shopify.customerPrivacy;if(!cp)return true;return cp.analyticsProcessingAllowed();}
    catch(e){return true;}
  }

  function sendBeacon(url,body){
    if(typeof navigator.sendBeacon==='function'){
      navigator.sendBeacon(url,new Blob([body],{type:'application/json'}));
    }else{
      fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){});
    }
  }

  function getDevice(){var w2=w.innerWidth;if(w2<768)return'mobile';if(w2<1024)return'tablet';return'desktop';}

  function sendPageView(){
    if(!hasConsent())return;
    sendBeacon(apiUrl+'/api/events',JSON.stringify({
      type:'PAGE_VIEW',
      visitorId:visitorId,
      assignments:asgn,
      shopDomain:(w.Shopify||{}).shop||location.hostname,
      pageUrl:location.href,
      device:getDevice(),
      ts:Date.now(),
    }));
  }

  function confirmAssign(){
    if(!Object.keys(asgn).length)return;
    fetch(apiUrl+'/api/assign',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        shopDomain:(w.Shopify||{}).shop||location.hostname,
        visitorToken:visitorId,
        assignments:asgn,
        device:getDevice(),
        pageUrl:location.href,
      }),
    }).catch(function(){});
  }

  function init(){
    sendPageView();
    confirmAssign();
  }

  if(d.readyState==='loading'){d.addEventListener('DOMContentLoaded',init);}else{init();}

})(window,document);
`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
};
