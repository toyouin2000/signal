import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/crypto';

const schema=z.object({
 name:z.string().min(2).max(100),
 flow:z.enum(['meta_leads','hubspot_capi']),
 source:z.record(z.string(),z.unknown()).default({}),
 destination:z.record(z.string(),z.unknown()).default({}),
 fieldMapping:z.array(z.object({source:z.string(),target:z.string()})).default([]),
 destinationToken:z.string().optional()
});
export async function POST(request:NextRequest){
 const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Invalid input'},{status:400});
 const input=parsed.data;
 const {data,error}=await supabaseAdmin.from('integrations').insert({
   user_id:user.id,name:input.name,flow:input.flow,source_config:input.source,destination_config:input.destination,
   field_mapping:input.fieldMapping,destination_token_encrypted:input.destinationToken?encryptSecret(input.destinationToken):null,status:'draft'
 }).select('id,name,flow,status').single();
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({integration:data},{status:201});
}
export async function GET(){
 const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data,error}=await supabase.from('integrations').select('id,name,flow,source_config,destination_config,field_mapping,status,last_sync_at,created_at,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false});
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({integrations:data});
}
