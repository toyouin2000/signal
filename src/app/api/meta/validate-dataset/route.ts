import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { safeJson } from '@/lib/http';

const schema=z.object({datasetId:z.string().min(1),accessToken:z.string().min(1)});
export async function POST(request:NextRequest){
 const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const body=schema.safeParse(await request.json().catch(()=>null));if(!body.success)return NextResponse.json({error:'Dataset ID and Auth Token are required'},{status:400});
 try{
  const version=process.env.META_API_VERSION||'v23.0';const url=new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(body.data.datasetId)}`);url.searchParams.set('fields','id,name');url.searchParams.set('access_token',body.data.accessToken);
  const result=await safeJson(await fetch(url,{cache:'no-store'}));
  return NextResponse.json({valid:true,dataset:{id:result.id,name:result.name||null}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Meta credential validation failed'},{status:400});}
}
