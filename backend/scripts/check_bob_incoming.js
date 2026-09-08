(async function(){
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  const base = 'http://localhost:5050/api';
  const login = await (await fetch(base + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: 'bob.qa+uitest@example.com', password: 'Passw0rd1' }) })).json();
  const token = login && login.data && login.data.token ? login.data.token : null;
  if (!token) return console.error('no token');
  const incoming = await (await fetch(base + '/buddy-requests/incoming?status=pending', { headers: { Authorization: `Bearer ${token}` } })).json();
  console.log(JSON.stringify(incoming, null, 2));
})();
