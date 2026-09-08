(async function(){
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  const base = 'http://localhost:5050/api';
  async function apiFetch(path, method='GET', body=null, token=null){
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; } catch(e) { return { status: res.status, body: text }; }
  }

  // login Bob to get token
  const lb = await apiFetch('/auth/login','POST',{ email: 'bob.qa+uitest@example.com', password: 'Passw0rd1' });
  const tokenB = lb.body && lb.body.data && lb.body.data.token ? lb.body.data.token : null;
  console.log('Bob token?', !!tokenB);

  // fetch incoming to find request_id
  const incoming = await apiFetch('/buddy-requests/incoming?status=pending','GET',null, tokenB);
  console.log('Incoming', incoming.status, JSON.stringify(incoming.body));
  const req = incoming.body && incoming.body.data && incoming.body.data.requests && incoming.body.data.requests[0] ? incoming.body.data.requests[0] : null;
  if (!req) return console.error('No incoming request to accept');
  const requestId = req.request_id;
  console.log('Accepting request', requestId);
  const acc = await apiFetch(`/buddy-requests/${requestId}/accept`, 'PATCH', null, tokenB);
  console.log('Accept response', acc.status, JSON.stringify(acc.body));

  // Check request status in incoming list
  const incoming2 = await apiFetch('/buddy-requests/incoming?status=pending','GET',null, tokenB);
  console.log('Incoming after accept', incoming2.status, JSON.stringify(incoming2.body));

  // Verify matches for Bob
  const matches = await apiFetch('/matches','GET',null, tokenB);
  console.log('Matches for Bob', matches.status, JSON.stringify(matches.body));

  // Also check Alice matches
  const la = await apiFetch('/auth/login','POST',{ email: 'alice.qa+uitest@example.com', password: 'Passw0rd1' });
  const tokenA = la.body && la.body.data && la.body.data.token ? la.body.data.token : null;
  const matchesA = await apiFetch('/matches','GET',null, tokenA);
  console.log('Matches for Alice', matchesA.status, JSON.stringify(matchesA.body));

})();
