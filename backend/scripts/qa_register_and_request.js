(async function(){
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  const base = 'http://localhost:5050/api';

  async function post(path, body){
    const res = await fetch(base + path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text), headers: res.headers.raw() }; } catch(e){ return { status: res.status, body: text }; }
  }
  async function patch(path, body, token){
    const res = await fetch(base + path, { method: 'PATCH', headers: {'Content-Type':'application/json', 'Authorization': token ? `Bearer ${token}` : undefined}, body: JSON.stringify(body) });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; } catch(e){ return { status: res.status, body: text }; }
  }
  async function login(email, password){
    const r = await post('/auth/login', { email, password });
    return r;
  }

  console.log('Registering users...');
  const u1 = await post('/auth/register', { name: 'Alice QA', email: 'alice.qa+uitest@example.com', tnt: 'AQA123', academic_year: '2nd year', password: 'Passw0rd1' });
  console.log('Alice register:', u1.status, JSON.stringify(u1.body));
  const u2 = await post('/auth/register', { name: 'Bob QA', email: 'bob.qa+uitest@example.com', tnt: 'BQA123', academic_year: '3rd year', password: 'Passw0rd1' });
  console.log('Bob register:', u2.status, JSON.stringify(u2.body));

  // Login both
  const la = await login('alice.qa+uitest@example.com','Passw0rd1');
  const lb = await login('bob.qa+uitest@example.com','Passw0rd1');
  console.log('Alice login token present:', la.body && la.body.token ? 'yes' : 'no');
  console.log('Bob login token present:', lb.body && lb.body.token ? 'yes' : 'no');

  const tokenA = la.body && la.body.token ? la.body.token : null;
  const tokenB = lb.body && lb.body.token ? lb.body.token : null;

  // Create study-buddy profiles for both
  async function createProfile(token, payload){
    const res = await post('/study-buddy/profile', payload);
    return res;
  }

  if (tokenA) {
    const r = await post('/study-buddy/profile', { nickname: 'alice', semester: 'Fall', study_style: 'group_discussion', weak_subjects: ['Calculus'], strong_subjects: ['Algebra'], wanna_meet: 'both', notes: 'Looking for weekly revision sessions', telegram: 'alice_t', viber: '' });
    console.log('Alice create profile:', r.status);
  }
  if (tokenB) {
    const r = await post('/study-buddy/profile', { nickname: 'bob', semester: 'Spring', study_style: 'quiet_library', weak_subjects: ['Physics'], strong_subjects: ['Statistics'], wanna_meet: 'in_person', notes: 'Prefers afternoon sessions', telegram: 'bob_t', viber: '' });
    console.log('Bob create profile:', r.status);
  }

  // Alice sends request to Bob
  if (tokenA && u2.body && u2.body.user && u2.body.user.user_id) {
    const bobId = u2.body.user.user_id;
    const res = await post('/buddy-requests', { receiver_id: bobId });
    console.log('Alice -> Bob request:', res.status, JSON.stringify(res.body));
  }

  // Now log in as Bob and list incoming
  if (tokenB) {
    const resp = await fetch(base + '/buddy-requests/incoming?status=pending', { headers: { Authorization: `Bearer ${tokenB}` } });
    const text = await resp.text();
    console.log('Bob incoming:', resp.status, text);
  }

})();
