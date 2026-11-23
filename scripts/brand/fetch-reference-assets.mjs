// Public primary sources only. No credentials, checkout, or paid-font download.
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const cache=path.join(root,'.private/brand-assets'),fonts=path.join(root,'public/brand/nilelink/fonts')
await mkdir(cache,{recursive:true});await mkdir(fonts,{recursive:true})
const get=async(url,headers={})=>{const response=await fetch(url,{headers,signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('Primary-source download failed: '+response.status);return response}
for(const [id,name] of [[3277769,'hero-original'],[4481329,'warehouse-original']]){
 const response=await get(`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2560`)
 await writeFile(path.join(cache,name+'.jpg'),Buffer.from(await response.arrayBuffer()))
}
const css=await(await get('https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@100..900&display=swap',{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'})).text()
const blocks=[]
for(const match of css.matchAll(/\/\* ([^*]+) \*\/\s*(@font-face \{[\s\S]*?\})/g)){
 const subset=match[1].trim();if(!/^[a-z-]+$/.test(subset))throw Error('Unexpected font subset')
 const block=match[2],url=block.match(/url\(([^)]+)\)/)?.[1]
 if(!url||new URL(url).hostname!=='fonts.gstatic.com'||!url.endsWith('.woff2'))throw Error('Expected official WOFF2 subset')
 const binary=Buffer.from(await(await get(url)).arrayBuffer());if(binary.subarray(0,4).toString()!=='wOF2')throw Error('Invalid WOFF2')
 const name='noto-kufi-arabic-'+subset+'.woff2';await writeFile(path.join(fonts,name),binary);blocks.push('/* '+subset+' */\n'+block.replace(url,'./'+name))
}
if(!blocks.length)throw Error('No font subsets; review source instead of substituting a different font')
await writeFile(path.join(fonts,'noto-kufi-arabic.css'),blocks.join('\n\n')+'\n')
await writeFile(path.join(fonts,'OFL.txt'),await(await get('https://raw.githubusercontent.com/google/fonts/main/ofl/notokufiarabic/OFL.txt')).text())
await writeFile(path.join(cache,'noto-kufi-google.css'),css)
console.log('Fetched matching Pexels source photos and OFL Noto Kufi Arabic; Safiro remains a user-supplied webfont dependency.')
