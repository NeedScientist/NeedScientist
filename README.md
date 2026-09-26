# needscientist

Vercel + Supabase 배포용 프로젝트입니다.

1. Supabase 프로젝트 생성
2. `supabase/schema.sql` 전체를 SQL Editor에서 실행
3. `public/js/config.js`에 Project URL과 anon public key 입력
4. GitHub에 이 폴더의 전체 내용을 업로드
5. Vercel에서 GitHub 저장소를 Import
6. 관리자 지정: `update public.profiles set role='admin' where id='회원 UUID';`

주의: service_role key는 웹 코드에 넣지 마세요.
