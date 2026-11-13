import pg from 'pg';
let pool;
export function getPool(){
  if(!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL.');
  return pool ??= new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
}
export function createDatabase(client,transaction){
  return {
    prepare(sql){
      let i=0;const query=sql.replace(/\?/g,()=>'$'+(++i));
      const statement=values=>({query,values,bind(...params){return statement(params)},async first(){return (await client.query(query,values)).rows[0]},async all(){return {results:(await client.query(query,values)).rows}},async run(){return client.query(query,values)}});
      return statement([]);
    },
    async batch(statements){return transaction(async connection=>{const results=[];for(const s of statements)results.push(await connection.query(s.query,s.values));return results})}
  };
}
export function getDatabase()
{const p=getPool();
  return createDatabase
  (p,async callback=>{const c=await p.connect();try{await c.query('BEGIN');
    const result=await callback(c);await c.query('COMMIT');
    return result}catch(e){await c.query('ROLLBACK');
      throw e}finally{c.release()}})}
