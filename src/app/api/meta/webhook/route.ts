import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Meta webhook verification endpoint. Configure this URL in the Meta app dashboard.
export async function GET(request:NextRequest){
 const q=request.nextUrl.searchParams;
 if(q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===process.env.META_WEBHOOK_VERIFY_TOKEN){
   return new Response(q.get('hub.challenge')||'',{status:200,headers:{'content-type':'text/plain'}});
 }
 return NextResponse.json({error:'Webhook verification failed'},{status:403});
}
export async function POST(request:NextRequest){
 const raw=await request.text();
 const signature=request.headers.get('x-hub-signature-256');
 if(process.env.META_APP_SECRET){
  if(!signature)return NextResponse.json({error:'Missing signature'},{status:401});
  const expected='sha256='+createHmac('sha256',process.env.META_APP_SECRET).update(raw).digest('hex');
  const a=Buffer.from(signature),b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Invalid signature'},{status:401});
 }
 let payload:any;try{payload=JSON.parse(raw)}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 const entries=payload.entry||[];
 for(const entry of entries){
  for(const change of entry.changes||[]){
   if(change.field!=='leadgen')continue;
   const lead=change.value||{};
   const {error}=await supabaseAdmin.from('sync_jobs').insert({provider:'meta',event_type:'leadgen',external_event_id:String(lead.leadgen_id||`${entry.id}:${lead.form_id}:${lead.created_time}`),payload:{pageId:entry.id,leadId:lead.leadgen_id,formId:lead.form_id,createdTime:lead.created_time},status:'queued',attempts:0});
   if(error&&!error.message.toLowerCase().includes('duplicate'))console.error('Could not enqueue Meta webhook event',error.message);
  }
 }
 return NextResponse.json({received:true});
}
