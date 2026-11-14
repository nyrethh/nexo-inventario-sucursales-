import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../lib/database.js';
import {handle} from '../lib/http.js';
import {hashPassword} from '../lib/security.js';

test('Solo admin corrige seriales con auditoría, sin modificar stock y conservando identidad',async()=>{
    const pg=new PGlite();
    const read=file=>readFileSync(new URL('../sql/'+file,import.meta.url),'utf8');
    try {
        await pg.exec(read('01-esquema.sql'));
        await pg.exec(read('02-datos-excel.sql'));
        await pg.exec(read('05-seriales-y-sucursales.sql'));
        const password='Admin-pruebas-2026';
        const hash=await hashPassword(password);
        await pg.query("INSERT INTO users(email,name,role,password_hash) VALUES('admin@example.com','Admin','admin',$1)",[hash]);
        await pg.query("INSERT INTO users(email,name,role,location,password_hash) VALUES('operador@example.com','Operador','operador','Sucursal 1',$1)",[hash]);
        const db=createDatabase(pg,callback=>pg.transaction(callback));
        const appUrl='https://nexo.example.com';
        const call=async(route,body,cookie='')=>{
            const response=await handle(new Request(appUrl+'/api/'+route,{
                method:body?'POST':'GET',headers:{Origin:appUrl,'Content-Type':'application/json',Cookie:cookie},
                body:body?JSON.stringify(body):undefined
            }),{db,appUrl});
            return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
        };
        const admin=(await call('login',{email:'admin@example.com',password})).cookie;
        const operator=(await call('login',{email:'operador@example.com',password})).cookie;
        assert.equal((await call('serial-correction',{},operator)).status,403);
        assert.equal((await call('serial-correction',{},admin)).status,503);
        await pg.exec(read('07-correccion-seriales.sql'));
        await pg.exec(read('07-correccion-seriales.sql'));
        assert.equal((await call('serials',{code:'MOT001',location:'Sucursal 1',serials:['CHASIS-ERRADO']},admin)).status,200);
        const bought={id:crypto.randomUUID(),kind:'compra',code:'MOT001',destination:'Sucursal 1',quantity:1,serials:['OTRA-MOTO'],supplier:'Proveedor'};
        assert.equal((await call('event',bought,admin)).status,200);
        const unit=(await pg.query("SELECT * FROM motorcycle_units WHERE serial='CHASIS-ERRADO'")).rows[0];
        const beforeStock=(await pg.query('SELECT * FROM stock ORDER BY code,location')).rows;
        const correction={id:crypto.randomUUID(),unitId:String(unit.id),previousSerial:unit.serial,newSerial:'CHASIS-CORRECTO',reason:'Error de transcripción'};
        assert.equal((await call('serial-correction',correction)).status,401);
        assert.equal((await call('serial-correction',correction,operator)).status,403);
        assert.equal((await call('serial-correction',{...correction,newSerial:'OTRA-MOTO'},admin)).status,400);
        assert.equal((await call('serial-correction',{...correction,reason:''},admin)).status,400);
        assert.equal((await call('serial-correction',correction,admin)).status,200);
        assert.equal((await call('serial-correction',correction,admin)).status,200);
        const audit=(await pg.query('SELECT * FROM serial_corrections')).rows;
        assert.equal(audit.length,1);
        assert.equal(audit[0].previous_serial,unit.serial);
        assert.equal(audit[0].new_serial,'CHASIS-CORRECTO');
        assert.equal(audit[0].actor,'admin@example.com');
        assert.deepEqual((await pg.query('SELECT * FROM stock ORDER BY code,location')).rows,beforeStock);
        const sale={id:crypto.randomUUID(),kind:'venta',code:'MOT001',origin:'Sucursal 1',quantity:1,serials:['CHASIS-CORRECTO']};
        assert.equal((await call('event',sale,operator)).status,200);
        const soldStock=(await pg.query('SELECT * FROM stock ORDER BY code,location')).rows;
        const soldCorrection={...correction,id:crypto.randomUUID(),previousSerial:'CHASIS-CORRECTO',newSerial:'CHASIS-DEFINITIVO'};
        assert.equal((await call('serial-correction',soldCorrection,admin)).status,200);
        assert.equal((await call('serial-correction',{...soldCorrection,id:crypto.randomUUID(),newSerial:'ERROR-POR-OTRA-EDICION'},admin)).status,400);
        const sold=(await pg.query('SELECT * FROM motorcycle_units WHERE id=$1',[unit.id])).rows[0];
        assert.equal(sold.sold,true);
        assert.equal(sold.location,null);
        assert.deepEqual((await pg.query('SELECT * FROM stock ORDER BY code,location')).rows,soldStock);
        const state=(await call('state',null,admin)).data;
        const displayedSale=state.events.find(event=>event.id===sale.id);
        assert.deepEqual(displayedSale.serials,['CHASIS-CORRECTO']);
        assert.deepEqual(displayedSale.current_serials,['CHASIS-DEFINITIVO']);
        assert.equal(state.serialCorrections.length,2);
        assert.ok(state.serialUnits.some(item=>String(item.id)===String(unit.id)));
        const branch=(await call('state',null,operator)).data;
        assert.equal(branch.serialCorrectionEnabled,false);
        assert.deepEqual(branch.serialUnits,[]);
        assert.deepEqual(branch.serialCorrections,[]);
        await assert.rejects(()=>pg.query('DELETE FROM serial_corrections'));
        await pg.query("UPDATE users SET role='operador',location='Sucursal 1' WHERE email='admin@example.com'");
        await assert.rejects(()=>pg.query('SELECT correct_motorcycle_serial($1,$2,$3,$4,$5,$6)',[
            crypto.randomUUID(),unit.id,'CHASIS-DEFINITIVO','CHASIS-INVALIDO','Cambio sin permisos','admin@example.com'
        ]),error=>error.code==='42501');
    } finally {
        await pg.close();
    }
});
