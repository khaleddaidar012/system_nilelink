import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://nilelinklogistics.com',base='.private/d1-migration/first-launch';
const credentials=JSON.parse(await readFile(base+'/application/requested-admin-credentials.json','utf8'));
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({identifier:credentials.email,password:credentials.password,rememberMe:false}),signal:AbortSignal.timeout(60000)});
assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const response=await fetch(origin+'/ar/admin/mailbox',{headers:{cookie},signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);
const html=await response.text();
const scripts=[...new Set([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match=>match[1]))];
let found=false;
for(const src of scripts){const url=new URL(src,origin);if(url.origin!==origin)continue;const script=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!script.ok)continue;const source=await script.text();if(source.includes('Mailbox username')&&source.includes('placeholder:"info"')&&source.includes('@nilelinklogistics.com')){found=true;break;}}
assert.ok(found,'Published username form not found');
const report={checkedAt:new Date().toISOString(),pageStatus:response.status,usernameFormPublished:true,mailboxCredentialsEntered:false,emailSent:false};
await writeFile(base+'/mailbox/username-live-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
