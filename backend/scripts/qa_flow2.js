(async function(){
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  const base = 'http://localhost:5050/api';
  async function apiFetch(path, method='POST', body=null, token=null){
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; } catch(e) { return { status: res.status, body: text }; }
  }

  async function login(email,password){ return apiFetch('/auth/login','POST',{ email, password }); }

  const la = await login('alice.qa+uitest@example.com','Passw0rd1');
  const lb = await login('bob.qa+uitest@example.com','Passw0rd1');
  console.log('Alice login', la.status, la.body && la.body.data && la.body.data.token ? 'token' : JSON.stringify(la.body));
  console.log('Bob login', lb.status, lb.body && lb.body.data && lb.body.data.token ? 'token' : JSON.stringify(lb.body));
  const tokenA = la.body && la.body.data && la.body.data.token ? la.body.data.token : (la.body && la.body.token ? la.body.token : null);
  const tokenB = lb.body && lb.body.data && lb.body.data.token ? lb.body.data.token : (lb.body && lb.body.token ? lb.body.token : null);

  if (!tokenA || !tokenB) { console.error('Could not login both users, aborting'); return; }

  console.log('Creating profiles...');
  const pa = await apiFetch('/study-buddy/profile','POST',{ nickname: 'alice', semester: 'Fall', study_style: 'group_discussion', weak_subjects: ['Calculus'], strong_subjects: ['Algebra'], wanna_meet: 'both', notes: 'Looking for weekly revision sessions', telegram: 'alice_t' }, tokenA);
  console.log('Alice profile create', pa.status);
  const pb = await apiFetch('/study-buddy/profile','POST',{ nickname: 'bob', semester: 'Spring', study_style: 'quiet_library', weak_subjects: ['Physics'], strong_subjects: ['Statistics'], wanna_meet: 'in_person', notes: 'Prefers afternoon sessions', telegram: 'bob_t' }, tokenB);
  console.log('Bob profile create', pb.status);

  // Alice sends request to Bob - need Bob user_id; fetch bob via /api/auth/me? We have tokens but need Bob id. Login response body includes user.
  const bobId = lb.body && lb.body.data && lb.body.data.user ? lb.body.data.user.user_id : (pb.body && pb.body.body && pb.body.user ? pb.body.user.user_id : null);
  console.log('Bob id', bobId);
  if (bobId) {
    const req = await apiFetch('/buddy-requests','POST',{ receiver_id: bobId }, tokenA);
    console.log('Alice->Bob request', req.status, JSON.stringify(req.body));
  }

  // Now Bob lists incoming
  const incoming = await fetch(base + '/buddy-requests/incoming?status=pending', { headers: { Authorization: `Bearer ${tokenB}` } });
  console.log('Bob incoming status', incoming.status);
  const txt = await incoming.text();
  console.log('Bob incoming body', txt);

})();
