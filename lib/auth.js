import {hashPassword,verifyPassword,hashToken,sessionToken,readSession,sessionCookie} from './security.js';
const fields='email,name,role,location,active,permissions';
export const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
export const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export async function authenticate(request,db){const token=readSession(request);if(!/^[a-f0-9]{64}$/.test(token))fail('Inicia sesión para continuar.',401);const user=await db.prepare(`SELECT ${fields.split(',').map(f=>'u.'+f).join(',')} FROM sessions s JOIN users u ON u.email=s.email WHERE s.token_hash=? AND s.expires_at>now() AND u.active=1`).bind(hashToken(token)).first();if(!user)fail('Tu sesión expiró o tu cuenta está desactivada.',401);return user}
export async function authRoute(route,request,db,body,secure){
 if(route==='login'){
  const email=typeof body.email==='string'?body.email.trim().toLowerCase().slice(0,160):'';
  const key=hashToken(email);
  const counter=await db.prepare("INSERT INTO login_attempts(key,attempts,reset_at) VALUES(?,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.attempts+1 END,reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END RETURNING attempts").bind(key).first();
  if(counter.attempts>10)fail('Demasiados intentos. Intenta de nuevo en 15 minutos.',429);
  const user=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  // También se calcula un hash para cuentas inexistentes, sin revelar si existen.
  const fallback='scrypt:00000000000000000000000000000000:'+ '00'.repeat(64);
  const valid=await verifyPassword(body.password,user?.password_hash||fallback);
  if(!user||!valid||!user.active)fail('Correo o contraseña incorrectos.',401);
  const token=sessionToken();
  await db.batch([db.prepare('DELETE FROM login_attempts WHERE key=?').bind(key),db.prepare('DELETE FROM sessions WHERE expires_at<now()'),db.prepare("INSERT INTO sessions VALUES(?,?,now()+interval '7 days')").bind(hashToken(token),email)]);
  return json({ok:true},200,{'Set-Cookie':sessionCookie(token,secure)});
 }
 if(route==='logout'){await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hashToken(readSession(request))).run();return json({ok:true},200,{'Set-Cookie':sessionCookie('',secure,true)})}
 const user=await authenticate(request,db);
 if(route==='password'){
  const target=typeof body.email==='string'?body.email.trim().toLowerCase():user.email;
  const record=await db.prepare('SELECT * FROM users WHERE email=?').bind(target).first();
  if(!record)fail('Usuario no encontrado.',404);
  if(target!==user.email && (user.role!=='admin'||record.role==='admin'))fail('Acceso restringido.',403);
  if(target===user.email&&!await verifyPassword(body.currentPassword,record.password_hash))fail('La contraseña actual no es correcta.');
  const hash=await hashPassword(body.password);
  await db.batch([db.prepare('UPDATE users SET password_hash=? WHERE email=?').bind(hash,target),db.prepare('DELETE FROM sessions WHERE email=?').bind(target)]);
  return json({ok:true},200,target===user.email?{'Set-Cookie':sessionCookie('',secure,true)}:{});
 }
 return null;
}
