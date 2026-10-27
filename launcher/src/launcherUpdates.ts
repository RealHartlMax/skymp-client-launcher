export interface OfficialRelease { version: string; downloadUrl: string; releaseUrl: string }
export interface UpdateState { checking: boolean; release: OfficialRelease | null; error: boolean; checked: boolean }
const REPOSITORY = 'RealHartlMax/skymp-client-launcher';
function parse(value: string): {numbers: bigint[]; prerelease: string[]} | null {
  const match=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if(!match)return null;const prerelease=match[4]?.split('.')||[];
  if(prerelease.some(part=>/^\d+$/.test(part)&&part.length>1&&part[0]==='0'))return null;
  return {numbers:match.slice(1,4).map(BigInt),prerelease};
}
export function compareVersions(left:string,right:string):number|null {
  const a=parse(left),b=parse(right);if(!a||!b)return null;
  for(let i=0;i<3;i++)if(a.numbers[i]!==b.numbers[i])return a.numbers[i]>b.numbers[i]?1:-1;
  if(!a.prerelease.length||!b.prerelease.length)return a.prerelease.length===b.prerelease.length?0:a.prerelease.length?-1:1;
  for(let i=0;i<Math.max(a.prerelease.length,b.prerelease.length);i++){
    const x=a.prerelease[i],y=b.prerelease[i];if(x===undefined||y===undefined)return x===y?0:x===undefined?-1:1;
    if(x===y)continue;const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    return xn&&yn?(BigInt(x)>BigInt(y)?1:-1):xn!==yn?(xn?-1:1):x>y?1:-1;
  }return 0;
}
export function trustedReleaseUrl(value:unknown):string {
  if(typeof value!=='string')return '';
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
    return (url.hostname==='github.com'&&url.pathname.startsWith(`/${REPOSITORY}/releases/`))||
      (url.hostname==='update.skymp-worlds.net'&&url.pathname.startsWith('/downloads/'))?url.href:'';
  }catch{return '';}
}
async function json(url:string):Promise<Record<string,unknown>>{
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('releaseUnavailable');const value=await response.json();
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('releaseUnavailable');return value;
}
export async function fetchOfficialRelease():Promise<OfficialRelease|null>{
  const results=await Promise.allSettled([
    json(`https://api.github.com/repos/${REPOSITORY}/releases/latest`).then(value=>{
      if(value.draft!==false||value.prerelease!==false||typeof value.tag_name!=='string'||!parse(value.tag_name)||parse(value.tag_name)!.prerelease.length)return null;
      const asset=Array.isArray(value.assets)?value.assets.find((asset:Record<string,unknown>)=>typeof asset.name==='string'&&/\.exe$/i.test(asset.name)&&trustedReleaseUrl(asset.browser_download_url)):null;
      if(!asset)return null;return {version:value.tag_name.replace(/^v/,''),downloadUrl:trustedReleaseUrl(asset.browser_download_url),releaseUrl:trustedReleaseUrl(value.html_url)};
    }),
    json('https://update.skymp-worlds.net/channels/release.json').then(value=>{
      if(value.available!==true||value.channel!=='release'||typeof value.version!=='string'||!parse(value.version)||parse(value.version)!.prerelease.length||!trustedReleaseUrl(value.downloadUrl))return null;
      return {version:value.version,downloadUrl:trustedReleaseUrl(value.downloadUrl),releaseUrl:`https://github.com/${REPOSITORY}/releases`};
    }),
  ]);
  if(results.every(result=>result.status==='rejected'))throw Error('releaseUnavailable');
  return results.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[])
    .sort((a,b)=>compareVersions(b.version,a.version)||0)[0]||null;
}
