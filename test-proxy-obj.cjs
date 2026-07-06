const { createClient } = require('@supabase/supabase-js');
const s = createClient('http://localhost:54321', 'eyJhb...key');

const createSupabaseProxy = (originalClient) => {
  return new Proxy(originalClient, {
    get(target, prop) {
      if (prop === 'from') {
        return (table) => {
          let builder = target.from(table);
          // We need to intercept the write methods of the builder
          const interceptWrite = (method) => {
            return function(...args) {
              console.log(`Intercepted write method ${method} on table ${table}`);
              // return the original builder result so chaining still works for read operations?
              // No, write operations return a promise that resolves to {data, error}
              return { then: (cb) => cb({data: null, error: null}) };
            };
          };

          return new Proxy(builder, {
            get(bTarget, bProp) {
              if (['insert', 'update', 'upsert', 'delete'].includes(bProp)) {
                return interceptWrite(bProp);
              }
              return Reflect.get(bTarget, bProp);
            }
          });
        };
      }
      return Reflect.get(target, prop);
    }
  });
};

const proxy = createSupabaseProxy(s);
proxy.from('users').update({a: 1}).eq('id', 1).then(console.log);
