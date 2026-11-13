// Vista de prueba local. Base temporal en memoria; nunca se usa en Vercel.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createDatabase} from '../lib/database.js';
import {hashPassword} from '../lib/security.js';
import {handle} from '../lib/http.js';
const pg=new PGlite();await pg.exec(readFileSync('sql/01-esquema.sql','utf8'));await pg.exec(readFileSync('sql/02-datos-excel.sql','utf8'));
const password=randomBytes(16).toString('hex');
await pg.query("INSERT INTO users(email,name,role,password_hash) VALUES('admin@prueba.local','Administrador','admin',$1)",[await hashPassword(password)]);
const db=createDatabase(pg,fn=>pg.transaction(fn)),appUrl='http://localhost:3001';
const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
const server=createServer(async(req,res)=>{try{if(req.url.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const response=await handle(new Request(appUrl+req.url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}),{db,appUrl});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return}const item=assets[req.url];if(!item){res.writeHead(404);res.end();return}res.setHeader('Content-Type',item[1]+'; charset=utf-8');res.end(readFileSync('public/'+item[0]))}catch{res.writeHead(500);res.end()}});
server.listen(3001,'127.0.0.1',()=>console.log(JSON.stringify({url:appUrl,email:'admin@prueba.local',password,temporary:true})));
process.on('SIGINT',()=>server.close(async()=>{await pg.close();process.exit()}));
