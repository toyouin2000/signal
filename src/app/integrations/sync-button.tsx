'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
export default function SyncButton({ id }: { id: string }) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function run(){
  setBusy(true);setMessage('');
  try{
   const response=await fetch(`/api/integrations/${id}/sync`,{method:'POST'});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Sync failed');
   setMessage(data.message||'Sync complete');
   window.location.reload();
  }catch(e){setMessage(e instanceof Error?e.message:'Sync failed');}
  finally{setBusy(false);}
 }
 return <div style={{display:'grid',gap:5,justifyItems:'start'}}><button className="btn" onClick={run} disabled={busy}><RefreshCw size={13}/>{busy?'Syncing…':'Sync now'}</button>{message&&<span className="help" title={message}>{message}</span>}</div>;
}
