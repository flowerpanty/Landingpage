import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startAuditTestServer } from './christmas-search-test-helper.mjs';
const require=createRequire(import.meta.url);
const {searchPeriod,safePage,previewAllowed,readPreview}=require('../lib/dashboard-support.js');
assert.deepEqual(searchPeriod(7,new Date('2026-11-01T01:00:00Z')).current,{startDate:'2026-10-22',endDate:'2026-10-28'});
assert.deepEqual(searchPeriod(7,new Date('2026-11-01T01:00:00Z')).previous,{startDate:'2026-10-15',endDate:'2026-10-21'});
for(const page of ['/christmas/?name=PRIVATE#x','https://nothingmatters.co.kr/christmas/?phone=PRIVATE'])assert.equal(safePage(page),'/christmas/');
assert.equal(safePage('https://evil.invalid/'),'(외부 페이지)');
const req={socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:4189'}},config={publicRead:true,serviceAccount:null};
assert.equal(previewAllowed(req,config,{DASHBOARD_PREVIEW_PUBLIC_DATA:'1'}),true);
for(const [request,configuration,env] of [[req,config,{NODE_ENV:'production',DASHBOARD_PREVIEW_PUBLIC_DATA:'1'}],[{socket:{remoteAddress:'203.0.113.1'},headers:{host:'127.0.0.1:4189'}},config,{DASHBOARD_PREVIEW_PUBLIC_DATA:'1'}],[req,{...config,publicRead:false},{DASHBOARD_PREVIEW_PUBLIC_DATA:'1'}],[req,{...config,serviceAccount:{}},{DASHBOARD_PREVIEW_PUBLIC_DATA:'1'}],[{...req,headers:{host:'nothingmatters.co.kr'}},config,{DASHBOARD_PREVIEW_PUBLIC_DATA:'1'}],[req,config,{}]])assert.equal(previewAllowed(request,configuration,env),false,'preview is explicit, loopback-only, public, without local credentials');
let calls=0;
const preview=await readPreview('/api/dashboard/summary?range=7d',async(url,options)=>{
  calls++;assert.equal(url,'https://nothingmatters.co.kr/api/dashboard/summary?range=7d');
  assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.redirect,'error');
  return Response.json({summary:{sessions:0},range:{days:7},landingPages:[{page:'/christmas/?phone=PRIVATE'}]});
});
assert.equal(preview.dataSource.mode,'public-preview');assert.equal(preview.landingPages[0].page,'/christmas/');
for(const endpoint of ['/api/kakao-quick/orders','/api/dashboard/summary?range=7d&url=https://evil.invalid/','https://evil.invalid/','/api/dashboard/summary?range=6d'])await assert.rejects(readPreview(endpoint,()=>{calls++;}),/invalid_preview_endpoint/);
assert.equal(calls,1,'an invalid endpoint never requests a remote URL');
await assert.rejects(readPreview('/api/dashboard/christmas-search',async()=>Response.json({error:'private'},{status:401})),/연결 실패/);

const cases=[
  {name:'both',google:true,ga4:true},
  {name:'ga-only',google:true,ga4:true,env:{SEARCH_CONSOLE_SITE_URL:''}},
  {name:'gsc-only',google:true},
  {name:'ga-denied',google:true,ga4:true,mode:'ga-denied'},
  {name:'events-denied',google:true,ga4:true,mode:'events-denied'},
  {name:'search-denied',google:true,ga4:true,mode:'search-denied'},
  {name:'ga-empty',google:true,ga4:true,mode:'ga-empty'},
  {name:'token-denied',google:true,ga4:true,mode:'token-denied'},
  {name:'none'}
];
for(const test of cases){
  const server=await startAuditTestServer({...test,env:{DASHBOARD_ACCESS_MODE:'public',DASHBOARD_USERNAME:'',DASHBOARD_PASSWORD:'',...test.env}});
  try{
    const response=await fetch(server.base+'/api/dashboard/summary?range=7d');const data=await response.json();
    assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-robots-tag'),/noindex/);
    assert.doesNotMatch(JSON.stringify(data),/SYNTHETIC-PII|PRIVATE-FAILURE|SYNTHETIC-TOKEN|private_key|client_email|BEGIN PRIVATE/);
    if(['none','token-denied'].includes(test.name)){assert.equal(response.status,test.name==='none'?503:502);continue;}
    assert.equal(response.status,200,test.name);assert.equal(data.range.days,7);assert.equal(data.search.dataState,'final');
    assert.deepEqual(data.search.dateRange,searchPeriod(7).current);
    if(['gsc-only','ga-denied'].includes(test.name)){
      assert.equal(data.summary.sessions,null);assert.equal(data.delta.sessions,null);assert.equal(data.ga4.overview.sessions,null);assert.equal(data.summary.naverSessions,null);assert.deepEqual(data.series,[]);
      assert.equal(data.summary.searchClicks,4);
    }else if(test.name==='ga-empty'){
      assert.equal(data.summary.sessions,0);assert.equal(data.connections.ga4.status,'no_data');assert.equal(data.series.length,7);
    }else assert.equal(data.summary.sessions,12);
    if(test.name==='ga-only'||test.name==='search-denied'){
      assert.equal(data.summary.searchClicks,null);assert.equal(data.search.clicks,null);assert.equal(data.delta.searchClicks,null);assert.deepEqual(data.search.queries,[]);
    }
    if(test.name==='events-denied'){
      assert.equal(data.summary.totalActionClicks,null);assert.equal(data.delta.totalActionClicks,null);assert.deepEqual(data.events,[]);assert.ok(data.series.every(row=>row.totalActionClicks===null));
    }
    if(test.name==='both'){
      assert.equal(data.summary.totalActionClicks,2);assert.equal(data.summary.naverSessions,12,'Naver total comes from a separate filtered report');
      assert.equal(data.landingPages[0].page,'/christmas/');
      const today=await(await fetch(server.base+'/api/dashboard/summary?range=today')).json();
      assert.equal(today.series.length,24,'un-padded GA4 hours share the reserved hour slot');
      assert.equal(today.series.find(row=>row.key==='08').sessions,12);
      assert.equal(today.series.find(row=>row.key==='08').totalActionClicks,2);
      const reportCalls=server.calls().filter(call=>call.fixtureApi==='ga4');
      assert.ok(reportCalls.filter(call=>call.dimensions?.some(d=>d.name==='landingPage')).length>=2);
      const hourlyEvents=reportCalls.find(call=>call.dimensions?.some(d=>d.name==='hour')&&call.dimensions?.some(d=>d.name==='eventName'));
      assert.equal(hourlyEvents.limit,24*data.events.length,'today can include every event at all 24 hours');
      assert.ok(!reportCalls.some(call=>call.dimensions?.some(d=>d.name.includes('QueryString'))));
      assert.ok(server.calls().filter(call=>!call.fixtureApi).every(call=>call.dataState==='final'&&call.type==='web'));
    }
    if(!test.ga4)assert.equal(server.calls().filter(call=>call.fixtureApi==='ga4').length,0,'missing GA4 configuration does not query GA4');
    if(test.name==='ga-only')assert.equal(server.calls().filter(call=>!call.fixtureApi).length,0);
  }finally{await server.stop();}
}
console.log('Dashboard API PASS: independent GA4/GSC, missing/zero/denied/partial reports, PT final dates, hour normalization, Naver totals, query-string privacy, restricted local preview and safe errors (synthetic only).');
