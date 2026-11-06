import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appUrl } from '@/lib/http';
export async function POST(){const supabase=await createSupabaseServerClient();await supabase.auth.signOut();return NextResponse.redirect(appUrl('/login'));}
