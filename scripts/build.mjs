import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const html=readFileSync('public/index.html','utf8');
const javascript=readFileSync('public/app.js','utf8');
new Function(javascript);
new Function(readFileSync('public/serial-picker.js','utf8'));
for(const file of ['api/index.js','lib/database.js','lib/security.js','lib/auth.js','lib/inventory.js','lib/http.js'])execFileSync(process.execPath,['--check',file]);
for(const file of ['sql/01-esquema.sql','sql/02-datos-excel.sql','vercel.json'])if(!existsSync(file))throw new Error('Falta '+file);
if(/chatgpt|oai-authenticated|signin-with/i.test(html+javascript))throw new Error('La interfaz conserva una dependencia de ChatGPT.');
for (const file of readdirSync('public')) {
  if (file.startsWith('.env')) throw new Error('Un archivo de entorno quedó dentro de public.');
  if (/\.(?:js|html|css)$/.test(file)) {
    const source=readFileSync('public/'+file,'utf8');
    if (/process\.env|postgres(?:ql)?:\/\/|password_hash|NEXO_ADMIN_PASSWORD|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(source)) {
      throw new Error('Revisa los datos de servidor en public/'+file);
    }
  }
}
console.log('Interfaz y servidor listos para Vercel.');
