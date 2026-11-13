import {randomBytes,scrypt as rawScrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {compare as verifyBcrypt} from 'bcryptjs';
const scrypt=promisify(rawScrypt);
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export async function hashPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>256)throw Object.assign(new Error('La contraseña debe tener entre 12 y 256 caracteres.'),{status:400});
  const salt=randomBytes(16).toString('hex');
  const hash=await scrypt(password,salt,64,{N:16384,r:8,p:1});
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password,stored){
  if(typeof password!=='string'||password.length>256)return false;
  if (/^\$2[ab]\$12\$[./A-Za-z0-9]{53}$/.test(stored || '')) {
    return Buffer.byteLength(password, 'utf8') <= 72 && verifyBcrypt(password, stored);
  }
  const [algorithm,salt,encoded]=String(stored||'').split(':');
  if(algorithm!=='scrypt'||!salt||!encoded||encoded.length!==128)return false;
  const actual=await scrypt(password,salt,64,{N:16384,r:8,p:1});
  return timingSafeEqual(actual,Buffer.from(encoded,'hex'));
}
export const sessionToken=()=>randomBytes(32).toString('hex');
export const cookieName='nexo_session';
export function readSession(request){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||''}
export function sessionCookie(token,secure,clear=false){return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:604800}${secure?'; Secure':''}`}
