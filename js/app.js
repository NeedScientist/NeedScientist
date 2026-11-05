/* NeedScientist — replacement for js/app.js */
const sb = supabase.createClient(NEEDSCIENTIST_SUPABASE_URL, NEEDSCIENTIST_SUPABASE_ANON_KEY);
let user = null;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let latestLoad = 0;


function tab(id) {
  for (const name of ['discover', 'write', 'rank']) {
    const section = $('#' + name);
    if (section) section.hidden = name !== id;
  }

  if (id === 'discover') {
    const search = $('#search');
    if (search) search.value = '';
    load();
  }

  if (id === 'rank') loadRank();
}

async function signup() {
  const email = $('#email')?.value.trim();
  const password = $('#password')?.value;
  const username = $('#username')?.value.trim();
  const { error } = await sb.auth.signUp({email, password, options:{data:{username}}});
  $('#msg').textContent = error ? error.message : '가입 완료! 이메일 인증이 필요할 수 있습니다.';
}

async function signin() {
  const {data, error} = await sb.auth.signInWithPassword({
    email: $('#email')?.value.trim(), password: $('#password')?.value
  });
  if (error) { $('#msg').textContent = error.message; return; }
  user = data.user;
  $('#login')?.close();
  await update();
  await load();
}

async function update() {
  if ($('#auth')) $('#auth').textContent = user ? '로그아웃' : '로그인';
  if ($('#admin')) $('#admin').hidden = true;
  if (!user) return;
  const {data, error} = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error) console.warn('프로필 확인 오류:', error);
  if ($('#admin')) $('#admin').hidden = data?.role !== 'admin';
}

async function load() {
  const current = ++latestLoad;
  const list = $('#list');
  if (!list) return;
  
const search = $('#search');
const q = search ? search.value.trim() : '';

let request = sb.from('hypotheses')
  .select('*')
  .order('created_at', { ascending: false });

if (q !== '') {
  request = request.ilike('title', `%${q}%`);
}
  const {data, error} = await request;
  if (current !== latestLoad) return; // 오래된 검색 결과가 새 결과를 덮지 않도록 방지
  if (error) {
    console.error('가설 조회 오류:', error);
    list.innerHTML = `<div class="panel">가설을 불러오지 못했습니다: ${esc(error.message)}</div>`;
    return;
  }
  list.innerHTML = (data || []).map(h => `
    <article class="card">
      <span class="tag">${esc(h.field)}</span>
      <h3>${esc(h.title)}</h3>
      <p>${esc(h.body)}</p>
      <small>👤 ${esc(h.profiles?.username || 'Scientist')} · ✅ ${Number(h.verified_count || 0)}</small>
      <p><button type="button" data-hyp-id="${esc(h.id)}">실험하기</button></p>
    </article>`).join('') || `<div class="panel">${q ? '검색 결과가 없습니다.' : '아직 가설이 없습니다.'}</div>`;
}

async function openHyp(id) {
  const {data:h, error} = await sb.from('hypotheses').select('*').eq('id', id).single();
  if (error) return alert('가설 상세 조회 실패: ' + error.message);
  const detail = $('#detail');
  if (!detail) return;
  detail.innerHTML = `
    <button type="button" class="x" data-close-detail>×</button>
    <span class="tag">${esc(h.field)}</span>
    <h2>${esc(h.title)}</h2>
    <p>${esc(h.body)}</p>
    <h3>실험 방법</h3><p>${esc(h.method)}</p>
    ${user ? `<form id="proof"><textarea id="result" placeholder="실험 결과" required></textarea><input id="photo" type="file" accept="image/*"><button type="submit">검증 요청</button></form>` : '<p>결과 제출은 로그인 후 가능합니다.</p>'}`;
  detail.showModal();
  detail.querySelector('[data-close-detail]')?.addEventListener('click', () => detail.close());
  if (user) $('#proof').onsubmit = e => submitProof(e, id);
}

async function submitProof(e, id) {
  e.preventDefault();
  if (!user) return alert('로그인이 필요합니다.');
  const form = e.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const file = $('#photo')?.files?.[0];
    let url = null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) return alert('사진은 5MB 이하만 가능합니다.');
      const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const uploaded = await sb.storage.from('experiment-evidence').upload(path, file);
      if (uploaded.error) throw uploaded.error;
      url = sb.storage.from('experiment-evidence').getPublicUrl(path).data.publicUrl;
    }
    const {error} = await sb.from('experiments').insert({
      hypothesis_id:id, user_id:user.id, result_text:$('#result').value, photo_url:url
    });
    if (error) throw error;
    $('#detail')?.close();
    alert('실험 결과가 제출되었습니다. 관리자 승인 후 포인트가 지급될 수 있습니다.');
  } catch (error) {
    console.error('실험 제출 오류:', error);
    alert('실험 제출 실패: ' + error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function submitHypothesis(e) {
  e.preventDefault();
  if (!user) { $('#login')?.showModal(); return; }
  const form = e.currentTarget;
  const button = form.querySelector('button[type="submit"]') || form.querySelector('button');
  if (button) button.disabled = true;
  try {
    const {error} = await sb.from('hypotheses').insert({
      user_id:user.id, title:$('#title').value, field:$('#field').value,
      body:$('#body').value, method:$('#method').value
    });
    if (error) throw error;
    form.reset();
    if ($('#search')) $('#search').value = ''; // 새 가설을 전체 목록에서 바로 표시
    tab('discover');
    alert('가설 등록 완료! 포인트는 서버의 지급 규칙에 따라 반영됩니다.');
  } catch (error) {
    console.error('가설 등록 오류:', error);
    alert('가설 등록 실패: ' + error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadRank() {
  const ranking = $('#ranking');
  if (!ranking) return;
  const {data, error} = await sb.from('profiles').select('username,points').order('points', {ascending:false}).limit(50);
  if (error) {
    console.error('랭킹 조회 오류:', error);
    ranking.textContent = '랭킹을 불러오지 못했습니다: ' + error.message;
    return;
  }
  ranking.innerHTML = (data || []).map((x,i) => `<div class="rank"><b>${i+1}</b><span>${esc(x.username || 'Scientist')}</span><strong>${Number(x.points || 0)}P</strong></div>`).join('') || '<p>랭킹 데이터가 없습니다.</p>';
}

async function changePassword() {
  const {data:{session}, error:sessionError} = await sb.auth.getSession();
  if (sessionError || !session) return alert('인증 세션이 없습니다. 비밀번호 재설정 이메일을 다시 열어주세요.');
  const password = prompt('새 비밀번호를 입력하세요. (8자 이상)');
  if (password === null) return;
  if (password.length < 8) return alert('비밀번호는 8자 이상이어야 합니다.');
  const {error} = await sb.auth.updateUser({password});
  alert(error ? '비밀번호 변경 실패: ' + error.message : '비밀번호가 변경되었습니다!');
}

function initNeedScientist() {
  $('#auth')?.addEventListener('click', async () => {
    if (user) {
      const {error} = await sb.auth.signOut();
      if (error) return alert('로그아웃 실패: ' + error.message);
      user = null;
      await update();
      await load();
    } else $('#login')?.showModal();
  });
  if ($('#hypForm')) $('#hypForm').onsubmit = submitHypothesis;
  if ($('#search')) $('#search').oninput = load;
  $('#list')?.addEventListener('click', e => {
    const button = e.target.closest('[data-hyp-id]');
    if (button) openHyp(button.dataset.hypId);
  });
  sb.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    // 콜백 안에서 Supabase 비동기 요청을 직접 기다리지 않음
    queueMicrotask(() => { update(); });
  });
  (async () => {
    const {data, error} = await sb.auth.getSession();
    if (error) console.warn('세션 확인 오류:', error);
    user = data?.session?.user || null;
    await update();
    await load();
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNeedScientist);
else initNeedScientist();
