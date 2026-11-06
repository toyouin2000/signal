import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Queue claim/run endpoint for a cron service. Provider-specific processors are deliberately
// not run until connection ownership, event mapping and provider scopes are configured.
export async function POST(request:NextRequest){
 const auth=request.headers.get('authorization');
 if(!process.env.JOB_SECRET||auth!==`Bearer ${process.env.JOB_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:jobs,error}=await supabaseAdmin.from('sync_jobs').select('*').eq('status','queued').order('created_at',{ascending:true}).limit(50);
 if(error)return NextResponse.json({error:error.message},{status:500});
 if(!jobs?.length)return NextResponse.json({processed:0});
 let processed=0;
 for(const job of jobs){
  const {error:updateError}=await supabaseAdmin.from('sync_jobs').update({status:'needs_configuration',last_error:'Worker processor requires an active integration mapping and connected provider credentials.',updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','queued');
  if(!updateError)processed++;
 }
 return NextResponse.json({processed,note:'Queue plumbing is active. Connectors must be configured and provider-specific sync processors enabled before jobs can be delivered.'});
}
