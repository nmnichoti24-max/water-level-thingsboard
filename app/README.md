# WaterGuard Pro · ESP32-S3 IoT Water Level Monitor

เว็บแอปภาษาไทยสำหรับแสดงระดับน้ำและแจ้งเตือนบนหน้าเว็บ ใช้ React, Vite, Chart.js, Lucide และ Vercel Functions โดยใช้ ThingsBoard Cloud เก็บ Telemetry และ Device Attributes

[เปิด Web App บน Vercel](https://esp32s3-water-level-monitor.vercel.app/) แล้วเลือก **SIM · ESP32-S3-Water-Level-SIM** เพื่อดูข้อมูลจำลองที่บันทึกไว้ใน ThingsBoard Cloud

ลิงก์ Vercel ข้างต้นเป็นรุ่นสาธิตที่เผยแพร่ก่อนเพิ่มบัญชี WaterGuard Pro โค้ดรุ่นที่มี Login ต้องตั้งค่าและทดสอบ Supabase Auth ก่อนเผยแพร่

## GitHub Pages และการส่งต่อการเข้าสู่ระบบผ่าน Vercel

URL เป้าหมายคือ [WaterGuard Pro บน GitHub Pages](https://nmnichoti24-max.github.io/water-level-thingsboard/#/login) หน้า Login พาผู้ใช้ไปเปิด Vercel แบบเต็มหน้าเพื่อกรอกรหัสผ่านหรือกู้บัญชี Pages ใช้ `#/dashboard`, `#/history`, `#/alerts`, `#/settings`, `#/battery` และอ่านลิงก์รูปแบบเดิมได้ ลิงก์ตรงไปยังหน้าตรวจวัดจะขอให้เข้าสู่ระบบก่อน

Vercel ใช้คุกกี้ first-party แบบ HttpOnly, SameSite=Strict และ Secure บน HTTPS เมื่อเปิดส่วน GitHub Pages แล้ว คุกกี้ของ Vercel มีเพียงรหัสเซสชันอ้างอิงแบบสุ่ม ส่วน Supabase access/refresh token เก็บเข้ารหัสใน Redis Vercel ส่ง code อายุ 60 วินาทีกลับเฉพาะ callback ที่กำหนด Pages ตรวจ state และแลก code ด้วย PKCE S256 Redis ใช้ Lua เปรียบเทียบและลบ code ในคำสั่งเดียว API รับ Bearer ของ WaterGuard Pro อายุสูงสุด 5 นาทีและตรวจว่าเซสชันยังอยู่ใน Redis ทุกครั้ง Pages เก็บ Bearer ในหน่วยความจำ ส่วน sessionStorage ใช้เก็บ state และตัวตรวจ PKCE ชั่วคราวกับเครื่องหมายสำหรับกลับเข้าเซสชันหลังรีโหลด ไม่มี Supabase token หรือ Bearer ใน Web Storage

คำขอจาก Pages ส่งแบบ `credentials: 'omit'` CORS อนุญาตเฉพาะ Origin ของ Pages สำหรับการสมัคร การแลก code, logout และอ่าน Telemetry การ Login กู้บัญชี และกรอก OTP ยืนยันอีเมลเปิด Backend แบบเต็มหน้า เมื่อออกจากระบบ Vercel ลบเซสชันใน Redis เพื่อยกเลิกสิทธิ์ของ Bearer และคุกกี้อ้างอิงทันที แล้วขอเพิกถอน refresh token ที่ Supabase หาก Supabase ติดต่อไม่ได้ เว็บจะแจ้งผลแยกจากการลบเซสชันของแอป

### สิ่งที่ต้องตั้งค่าหลังได้รับอนุญาต

1. เตรียม Supabase Auth และเทมเพลต OTP ตามหัวข้อถัดไป ตัวแปร Auth และ ThingsBoard ทั้งหมดอยู่ใน Vercel เพิ่ม `AUTH_PAGES_REDIRECT_URL=https://nmnichoti24-max.github.io/water-level-thingsboard/` แบบไม่มี query หรือ fragment และใช้ `APP_ORIGIN=https://esp32s3-water-level-monitor.vercel.app`
2. หลังยืนยันแผนค่าใช้จ่าย ให้เตรียม Upstash Redis แบบฐานเดียวสำหรับโปรเจกต์ คัดลอก REST URL และโทเคนที่เขียนข้อมูลได้เข้า `AUTH_REDIS_REST_URL` กับ `AUTH_REDIS_REST_TOKEN` ฝั่งเซิร์ฟเวอร์ แผน Free ระบุ $0 ต่อเดือนและ 500,000 คำสั่งต่อเดือน เอกสารยังระบุ Pay as You Go ที่ $0.20 ต่อ 100,000 คำสั่งและมีค่าเก็บข้อมูลตามการใช้จริง โดยทุกคำขอ Telemetry ที่ระบุ Bearer ใช้ Redis อ่านเซสชันและ ACL แยกจากคำสั่งที่ใช้ Login และต่ออายุ [ราคา Upstash Redis](https://upstash.com/pricing/redis) · [Lua atomic ผ่าน REST](https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http)
3. หลังผ่านการตรวจด้วยบัญชีจริงและได้รับอนุญาตให้เผยแพร่ ให้ตั้ง **Settings → Pages → Source → GitHub Actions** แล้วรัน Workflow **WaterGuard Pro on GitHub Pages** จาก `main` ด้วยตนเอง Workflow ส่งเฉพาะแอปที่ Build แล้วและใช้ `VITE_API_BASE_URL` ซึ่งมีเพียง URL สาธารณะ [GitHub Pages Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

### ทดสอบในเครื่องกับ Provider และ Redis จริงเมื่อมีค่าแล้ว

ทดสอบที่สองพอร์ตใน Windows ตั้งใน `app/.env.local` ชั่วคราวให้ `APP_ORIGIN=http://127.0.0.1:4177` และ `AUTH_PAGES_REDIRECT_URL=http://127.0.0.1:4180/water-level-thingsboard/` ใช้ `npm run dev -- --port 4177` สำหรับหน้าล็อกอินและ API ใส่ `VITE_API_BASE_URL=http://127.0.0.1:4177` ใน `app/.env.local` ด้วย จากนั้นเปิด PowerShell อีกหน้าต่างที่โฟลเดอร์ `app` และรัน `npm run dev -- --mode pages --port 4180` เปิด `http://127.0.0.1:4180/water-level-thingsboard/#/history` ทดสอบรหัสผ่านจริงและ OTP จริง จากนั้นตรวจ Refresh, Logout, รูปแบบ Origin ใน Network และการปฏิเสธ Telemetry หลัง Logout พอร์ตทดสอบใช้ loopback เดียวกัน เมื่อมีสภาพแวดล้อมเผยแพร่ที่ได้รับอนุญาตจึงต้องทดสอบเพิ่มบนสองโดเมนจริงและเปิดบล็อก third-party cookies

ใน GitHub Pages หน้า Login จะตรวจสถานะของ Vercel ก่อนเปิด Login Bridge และหน้า Register จะปิดการส่งฟอร์มเมื่อ API หรือฐานบัญชียังไม่พร้อม

## บัญชี Username

หน้า `#/register` ใช้ Username, รหัสผ่าน และยืนยันรหัสผ่าน ระบบบัญชี Username ไม่ต้องใช้ SMTP, OTP หรืออีเมล ผู้ใช้บัญชีเดิมเลือก **เข้าสู่ระบบด้วยบัญชีอีเมลเดิม** เพื่อใช้ Supabase Auth ต่อได้ บัญชี Username ใหม่เข้าเมนูของแอปได้หลังเข้าสู่ระบบ แต่ต้องให้ผู้ดูแลอนุญาตแยกก่อนอ่าน SIM หรือ LIVE รหัสผ่านถูกแฮชฝั่งเซิร์ฟเวอร์ด้วย Argon2id (32 MiB, 3 รอบ, 1 thread, salt สุ่ม) PostgreSQL เก็บเฉพาะ hash และข้อมูลบัญชี Redis เก็บเซสชันอายุจำกัด, code PKCE, ตัวนับ และสิทธิ์แยกตามบัญชี

### ตั้งค่า PostgreSQL ใน Supabase

1. ใช้โปรเจกต์ทดสอบหรือฐานที่ผู้ดูแลอนุญาตให้ทดสอบ ก่อนปรับฐานที่มีข้อมูลจริง ให้สำรองและทดสอบกู้คืน Apply ไฟล์ `database/001_username_accounts.sql` ด้วยเจ้าของ Postgres ไฟล์สร้าง schema ส่วนตัวและเปิด RLS โดยให้ role `waterguard_accounts` อ่านและเพิ่มบัญชีเท่าที่จำเป็น
2. ให้ผู้ดูแลสร้าง PostgreSQL login ชื่อ `waterguard_app` ซึ่งสืบทอด `waterguard_accounts` โดยใช้ `create role waterguard_app login inherit;` และ `grant waterguard_accounts to waterguard_app;` จากนั้นใช้คำสั่ง interactive `\password waterguard_app` ใน psql ด้วยบัญชีผู้ดูแลเพื่อกำหนดรหัสผ่านของ role หลีกเลี่ยงการใส่รหัสผ่านใน SQL Editor, command history หรือแชต ใช้ runtime role นี้แทน postgres หรือ service role
3. ใน Supabase → **Connect** ใช้ **Shared Transaction pooler** สำหรับ Vercel ที่พอร์ต `6543` เปลี่ยน username ใน connection string เป็น `waterguard_app.<project-ref>` และใช้รหัสผ่านของ role ที่สร้าง แอปตรวจ TLS certificate เสมอ หากต้องใช้ CA ของ Supabase ให้ใส่ค่า PEM ใน `AUTH_ACCOUNT_DATABASE_CA` [การเชื่อม Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
4. ใส่ `AUTH_ACCOUNT_DATABASE_URL` เฉพาะใน `app/.env.local` หรือ Vercel Environment Variables ฝั่งเซิร์ฟเวอร์ ตั้ง `AUTH_ENABLE_USERNAME_REGISTRATION=1` หลังยืนยันฐานและพร้อมทดสอบเท่านั้น คง `AUTH_ENABLE_REGISTRATION` ปิดไว้สำหรับการสมัครอีเมลเดิม ไม่ต้องเปิด Public Signup ใน Supabase สำหรับบัญชี Username
5. ทดสอบสมัครชื่อซ้ำพร้อมกัน, สมัครและ Login จริง, Refresh, Logout, การบล็อกเมื่อไม่มี ACL และการเพิกถอนสิทธิ์ ตรวจการใช้งานจาก Browser เพราะ unit test ใช้ PostgreSQL แบบฝังในเครื่อง การทดสอบ Redis จริงกับฐานแบบฝังให้ตั้ง `$env:WG_TEST_REAL_REDIS='1'` แล้วรัน `node --test test/username.test.js` จากโฟลเดอร์ `app` โดยใช้ Upstash ที่กำหนดในไฟล์ local

Username เก็บเป็นตัวพิมพ์เล็ก และ UNIQUE constraint ตัดสินคำขอที่เข้าพร้อมกัน คำขอสมัครจำกัด 5 ครั้งต่อ IP และ 3 ครั้งต่อชื่อใน 15 นาที ส่วน Login จำกัด 30 ครั้งต่อ IP และ 10 ครั้งต่อชื่อใน 15 นาที การสมัครไม่สร้างเซสชัน ต้อง Login อีกครั้ง เซสชันใช้ code และ PKCE เดิมและไม่มีรหัสผ่านหรือ hash ใน Redis

### สิทธิ์ บัญชีเดิม และการกู้คืน

- บัญชี Username ใหม่ได้ UUID จาก Postgres Redis ACL ใช้คีย์ `wg:v1:acl:` ตามด้วย Base64URL SHA-256 ของ `<Supabase Project URL>/auth/v1|username|<Username Account UUID>` เมื่อไม่พบ ACL จะปฏิเสธ SIM และ LIVE ส่วนบัญชี Supabase เดิมคง User ID และคีย์เดิมที่ไม่มี `|username` กลางค่า
- การย้ายบัญชีเดิมต้องให้ผู้ดูแลยืนยันตัวตนและจับคู่แยกเป็นรายบัญชี บันทึก UID เดิมไว้ ใช้ UID เดิมเมื่อสร้างบัญชี Username ของเจ้าของเดิมตามขั้นตอน migration ที่อนุมัติ คัดลอกเฉพาะ grant ที่ตรวจแล้วเข้า namespace ใหม่ และทดสอบทั้งสองทางก่อนยุติบัญชีเดิม ชื่อที่เหมือนกันไม่ก่อให้เกิดการเชื่อมบัญชี และ runtime role ไม่มีสิทธิ์กำหนด UID เองหรือย้าย grant
- ระบบ Username ยังไม่มี self-service reset หากลืมรหัสผ่านให้ติดต่อผู้ดูแลผ่านช่องทางที่ยืนยันเจ้าของได้ ห้ามรีเซ็ตจากชื่อ Username อย่างเดียว ถ้ารีเซ็ตโดยผู้ดูแลหลังตรวจหลักฐาน ให้สร้าง Argon2id hash ใหม่ผ่านขั้นตอนที่เก็บรหัสผ่านไว้นอก SQL history และเพิ่ม `credential_version` เซสชันเก่าจะถูกตัดในการตรวจครั้งถัดไป ส่วนการถอนสิทธิ์ SIM/LIVE ใน Redis มีผลในคำขอถัดไป
- Upstash Free มี 500,000 คำสั่งต่อเดือนและข้อมูล 250 MB ถ้าไม่ได้ใช้งานอย่างน้อย 30 วันอาจถูกเก็บเข้าคลัง แม้กู้จาก snapshot ได้ต้องเตรียมรับมือกับ endpoint ที่ใช้ไม่ได้และข้อมูลระหว่างจุดสำรอง อย่าเก็บบัญชีถาวรหรือ password hash ไว้ใน Redis สำรอง ACL แยกจาก session และทดสอบ restore เมื่อเปลี่ยน Redis endpoint [ราคา Upstash](https://upstash.com/pricing/redis) · [นโยบายฐานที่ไม่ได้ใช้](https://upstash.com/docs/redis/help/faq) · [Backup/Restore](https://upstash.com/docs/redis/features/backup)
- Supabase Free ควรสำรอง Postgres ออกนอกบริการเอง เก็บไฟล์ที่มี hash เข้ารหัสและจำกัดผู้เข้าถึง ทดสอบกู้คืนก่อนเปิดใช้งานจริง [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)

## บัญชี Supabase เดิมแบบอีเมลและ OTP

หน้า `#/register` ส่งข้อมูลผ่าน `POST /api/auth?op=register` โดยไม่มีคุกกี้หรือ Bearer เซิร์ฟเวอร์ตรวจขนาด JSON ไม่เกิน 4 KB, Origin, รูปแบบอีเมล และรหัสผ่านอย่างน้อย 12 ตัวอักษร สูงสุด 72 ไบต์ จำกัดการสมัคร 20 ครั้งต่อ IP และ 5 ครั้งต่ออีเมลต่อ 15 นาที การยืนยันอีเมลจำกัด 40 ครั้งต่อ IP และ 8 ครั้งต่ออีเมลต่อ 15 นาที Redis ใช้คีย์อนุพันธ์และกำหนด TTL ทุกตัวนับ แอปตอบเหมือนกันเมื่อ Supabase รับคำขอใหม่หรือแจ้งว่าบัญชีมีอยู่แล้ว

### เตรียม SMTP และตรวจการส่งก่อนเปิดสมัคร

Brevo Free รองรับอีเมล Transactional 300 ฉบับต่อวันโดยไม่ต้องใช้บัตร หากมีโดเมนที่จัดการ DNS ได้ ให้ยืนยันโดเมนและ Sender ใน Brevo ก่อน หากใช้ที่อยู่ Gmail หรือโดเมนที่ยังไม่ยืนยัน Brevo อาจเปลี่ยนที่อยู่ From เป็นโดเมนของผู้ให้บริการ และบางบัญชีอาจต้องเปิดใช้งาน Transactional Email เพิ่ม [แผน Brevo](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) · [เงื่อนไขผู้ส่ง](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)

1. ใน Brevo ไปที่ **Settings → SMTP & API → SMTP** และสร้าง SMTP key สำหรับ WaterGuard Pro เก็บ SMTP login และ SMTP key ไว้สำหรับกรอกใน Supabase [คู่มือ SMTP key](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys)
2. ใน Supabase เปิด **Authentication → Emails → SMTP Settings → Enable custom SMTP** ใส่ **Sender email** ที่ยืนยันใน Brevo, **Sender name** เป็น WaterGuard Pro, **Host** เป็น `smtp-relay.brevo.com`, **Port** เป็น `587`, **Username** เป็น SMTP login และ **Password** เป็น SMTP key แล้วกด Save เก็บคีย์ไว้เฉพาะใน Supabase [ค่า SMTP ของ Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP) · [คู่มือ Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
3. ใน **Emails → Confirm sign up** ใช้เทมเพลต OTP ด้านล่างและกด Save คง **Confirm email** เปิดไว้ และคงทั้ง Public Signup และ `AUTH_ENABLE_REGISTRATION` ปิดระหว่างตรวจ SMTP
4. หากต้องการตรวจการส่งจริงก่อนเปิดสมัคร ให้ตั้ง **Reset password** ให้มี `{{ .Token }}` และใช้อีเมลบัญชีทดสอบเดิมขอผ่าน **ลืมรหัสผ่าน?** หนึ่งครั้ง ตรวจกล่องจดหมายและสถานะ Delivered ใน Brevo การตรวจนี้ยืนยันการส่ง OTP กู้บัญชี ส่วน OTP สมัครและการยืนยันบัญชีใหม่ทดสอบหลังอนุญาตให้เปิดสมัคร เก็บรหัส OTP ไว้ในกล่องจดหมายและหน้าแอป


### เปิดสมัครจริงหลังได้รับอนุญาต

1. Supabase **Authentication → Sign In / Providers** เปิด Email และ Confirm email คง Allow anonymous sign-ins ปิดไว้ เปิด Allow new users to sign up หลังตั้งค่า SMTP และได้รับอนุญาตแล้วเท่านั้น
2. ตั้ง **Authentication → Emails → SMTP Settings** ให้ส่งจากผู้ให้บริการที่อนุมัติแล้ว สำหรับโปรเจกต์ Free ใหม่ SMTP ในตัวจำกัดผู้รับให้เป็นสมาชิกทีม และแก้เทมเพลตไม่ได้จนเปิด Custom SMTP ตรวจโควตาและค่าใช้จ่ายของผู้ส่งก่อนตั้งค่า [เทมเพลตอีเมล](https://supabase.com/docs/guides/auth/auth-email-templates) · [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
3. ใน **Authentication → URL Configuration** ตั้ง Site URL เป็น Origin ของ Backend แบบไม่มี path และเพิ่ม Redirect URL แบบเจาะจงสำหรับ Backend root เช่น `https://esp32s3-water-level-monitor.vercel.app/` เมื่อได้รับอนุญาตให้ Deploy เพิ่ม `http://127.0.0.1:4177/` เฉพาะสภาพแวดล้อมทดสอบที่ใช้งานจริง หลีกเลี่ยง wildcard และตรวจว่าอีเมลทดสอบลิงก์ไป Backend ที่ตั้งใจใช้ [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
4. ใน **Authentication → Emails → Confirm sign up** ใช้เทมเพลต OTP นี้ได้ทั้ง Local และ Production ผู้รับกลับไปกรอกรหัสในหน้า «ยืนยันอีเมล» ของเว็บที่เปิดอยู่
   ```html
   <p>รหัสยืนยันอีเมล WaterGuard Pro ของคุณคือ {{ .Token }}</p>
   <p>กลับไปที่หน้า WaterGuard Pro แล้วเลือกยืนยันอีเมลเพื่อกรอกรหัสนี้</p>
   ```
5. ตั้งตัวแปรด้านล่างใน `app/.env.local` หรือ Vercel Environment Variables ตามสภาพแวดล้อมที่ได้รับอนุญาต ตั้ง `AUTH_ENABLE_REGISTRATION=1` เมื่อขั้นตอนอีเมลพร้อมแล้วเท่านั้น เซิร์ฟเวอร์ตรวจสถานะ Confirm email จาก Supabase ก่อนส่งคำขอสมัครจริง และแอปปิดการสมัครเมื่อ Redis ไม่พร้อม

| ตัวแปร | การใช้งาน |
| --- | --- |
| `APP_ORIGIN` | Origin ของ Backend แบบไม่มี slash ท้าย เช่น `http://127.0.0.1:4177` |
| `AUTH_SUPABASE_URL` | Project URL จาก Supabase |
| `AUTH_SUPABASE_PUBLISHABLE_KEY` | Publishable key ของโปรเจกต์ เก็บฝั่ง Backend |
| `AUTH_SESSION_KEY` | ค่าสุ่ม 32 ไบต์ Base64URL แยก Local/Production |
| `AUTH_PAGES_REDIRECT_URL` | URL ฐาน Pages ที่แน่นอนและมี slash ท้าย |
| `AUTH_REDIS_REST_URL`, `AUTH_REDIS_REST_TOKEN` | REST URL และโทเคนแบบเขียนได้ เก็บฝั่ง Backend |
| `AUTH_ENABLE_REGISTRATION` | ค่าเริ่มต้น `0` ใช้ `1` หลังอนุมัติและ SMTP พร้อม |
| `TB_ENABLE_LIVE_READ` | ค่าเริ่มต้น `0` เปิดหลังมีอุปกรณ์จริงและได้รับอนุญาต |
| `VITE_API_BASE_URL` | Origin สาธารณะของ Backend สำหรับ Pages Build |

ไม่ต้องใช้ Supabase Secret หรือ Service Role Key กับแอป ห้ามเปลี่ยนชื่อตัวแปรลับให้ขึ้นต้นด้วย `VITE_` ไฟล์ `.env.local` ต้องอยู่ใน Git ignore

ทดสอบเปิดหน้า `#/register` กรอกอีเมลใหม่ แล้วลอง Login ก่อนยืนยัน ต้องยังไม่มีเซสชัน นำ OTP ในอีเมลไปกรอกที่ `#/confirm-email` บน Backend เซิร์ฟเวอร์เรียก Supabase `/verify` ตรวจอีเมลและสถานะยืนยัน ขอเพิกถอนเซสชันชั่วคราวที่ Supabase ออกให้ แล้วส่งกลับ URL Login ของ Pages ที่กำหนดไว้ การยืนยันไม่ออกเซสชัน WaterGuard Pro ให้ Login ด้วยรหัสผ่านใหม่อีกครั้งและตรวจว่ายังอ่าน SIM/LIVE ไม่ได้จนได้รับสิทธิ์

ข้อจำกัดด้าน abuse การจำกัดคำขอที่ Vercel ครอบคลุม endpoint ของแอป Supabase Public Signup เปิด endpoint ของผู้ให้บริการเองด้วย จึงควรตั้ง Supabase Auth Rate Limits ให้เหมาะกับโควตา SMTP และประเมิน CAPTCHA ของ Supabase ก่อนเปิดรับสมัครทั่วไป การเปิด CAPTCHA ต้องเพิ่มการรองรับใน UI ก่อน [Supabase Rate Limits](https://supabase.com/docs/guides/auth/rate-limits) · [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)

## สิทธิ์ ThingsBoard

| สถานะ | เข้าเมนูหลังเข้าสู่ระบบ | SIM | LIVE |
| --- | --- | --- | --- |
| GUEST | — | — | — |
| UNVERIFIED | — | — | — |
| SIGNED_IN ผู้ใช้ที่ยังไม่มี ACL | ได้ | — | — |
| SIM_VIEWER | ได้ | ได้ | — |
| LIVE_VIEWER | ได้ | เฉพาะเมื่อให้ SIM แยก | เฉพาะ UUID ของ Device ที่อนุญาต |
| ADMIN ผู้ดูแล Upstash | ได้ | ตาม ACL ของบัญชีแอป | ตาม ACL ของบัญชีแอป |

ACL ที่เชื่อถือได้เป็น Redis JSON `{"sim":true,"liveDevices":[]}` ใช้คีย์ `wg:v1:acl:` ต่อด้วย SHA-256 แบบ Base64URL ของ `<Supabase Project URL>/auth/v1|<Supabase User ID ตัวพิมพ์เล็ก>` ค่าเริ่มต้นเมื่อไม่มีคีย์คือสิทธิ์ว่าง API อ่าน ACL จาก Redis ทุกคำขอและไม่เชื่อ role, email domain หรือ metadata ที่ส่งจาก Client การยกเลิกสิทธิ์มีผลกับคำขอถัดไปแม้เซสชันเดิมยังใช้ได้ รายชื่อ `AUTH_ALLOWED_EMAILS` และ `AUTH_LIVE_EMAILS` แบบเดิมจึงไม่ใช้กำหนดสิทธิ์ในรุ่นนี้

### ย้ายสิทธิ์เดิมอย่างเจาะจง

1. ตรวจรายการ AUTH_ALLOWED_EMAILS และ AUTH_LIVE_EMAILS แยกตามสภาพแวดล้อม ใน Workspace พบ SIM เดิมหนึ่งบัญชีและไม่มี LIVE เดิม เก็บรายการอ้างอิงไว้ฝั่งผู้ดูแลเท่านั้น
2. สำหรับแต่ละบัญชีเดิม ให้ยืนยันว่าเจ้าของบัญชีและอีเมลที่ยืนยันแล้วตรงกับรายการ จากนั้นคัดลอก User UID จาก Authentication → Users ให้สิทธิ์ SIM ตามขั้นตอนด้านล่างเฉพาะ UID ที่ตรวจแล้ว หากยังหารายการผู้ใช้เดิมไม่พบ ให้รอการตรวจสอบและคงสิทธิ์ว่าง
3. หลังทดสอบ SIM ให้บัญชีเดิมและตรวจว่าบัญชีใหม่ยังได้ 403 จึงค่อยลบค่ารายชื่อเก่าจากสภาพแวดล้อมนั้น สำหรับ LIVE ต้องมี UUID อุปกรณ์ที่ตรวจแล้ว ได้รับอนุญาต และเปิด TB_ENABLE_LIVE_READ แยกต่างหาก ห้ามสร้างสิทธิ์จากอีเมลที่เพิ่งสมัครหรือใช้ wildcard

### ให้และเพิกถอน SIM สำหรับบัญชีทดสอบ

1. เปิด Supabase **Authentication → Users** และคัดลอก **User UID** ของบัญชีทดสอบที่ยืนยันแล้ว
2. ใน PowerShell ที่โฟลเดอร์ `app` สร้างชื่อคีย์สำหรับ UID นั้น คำสั่งแสดงเฉพาะชื่อคีย์ Redis
   ```powershell
   $wgUserId = Read-Host 'Supabase User UID'
   node --input-type=module -e "import {loadEnv} from 'vite'; import {sha256} from './server/bridgeStore.js'; const uid=process.argv[1].toLowerCase(); if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(uid)) process.exit(1); const env=loadEnv('development',process.cwd(),''); if(!env.AUTH_SUPABASE_URL) process.exit(1); console.log('wg:v1:acl:'+sha256(env.AUTH_SUPABASE_URL+'/auth/v1|'+uid))" $wgUserId
   ```
3. เจ้าของฐานเปิด Upstash **Data Browser** เพิ่มคีย์ประเภท **String** ด้วยชื่อจากขั้นก่อนหน้าและค่า `{"sim":true,"liveDevices":[]}` โดยไม่ตั้ง TTL ถ้ามี ACL เดิมให้แก้เฉพาะ `sim` ทดสอบเปิดแอปใหม่และเลือก SIM เมื่อเพิกถอนให้เปลี่ยนเป็น `"sim":false` โดยรักษาสิทธิ์ LIVE อื่นที่ตั้งไว้
4. Bootstrap ผู้ดูแลผ่านสิทธิ์ใน Upstash Console ของเจ้าของโปรเจกต์เท่านั้น แอปไม่มี endpoint ให้ผู้ใช้เพิ่มสิทธิ์ตนเอง ถ้าจะเพิ่มหน้าจัดการสิทธิ์ภายหลัง ให้แยกตาราง `telemetry_grants(user_id, source, device_id)` กับ `app_admins(user_id)` ใช้ primary key แบบผสมที่ไม่มีค่า NULL และอ้างอิง `auth.users(id)` เปิด RLS และปฏิเสธการเขียนจาก anon/authenticated ทั้งหมด ให้ Server ที่อ่านสิทธิ์ Admin จากตารางจัดการ grant/revoke พร้อม audit และให้เจ้าของ bootstrap Admin แรกจาก SQL Editor ด้วย UUID ที่ตรวจแล้วก่อนใช้จริง
ThingsBoard Dashboard เดิมยังเปิดสาธารณะ การตรวจล่าสุดยืนยันว่าอ่าน `distance`, `waterLevel`, `waterPercent`, `status`, `sensorValid` และ `uptime` ของ Device SIM ผ่านสิทธิ์ Public ได้ กฎ Login ของ WaterGuard Pro ควบคุมเฉพาะ API ของเว็บนี้ ให้คงอุปกรณ์จริงอยู่นอกกลุ่ม Public

| แหล่งข้อมูล | การทำงาน |
| --- | --- |
| **SIM · ThingsBoard** | อ่าน Telemetry ที่มีอยู่ใน Device `ESP32-S3-Water-Level-SIM` ผ่าน API จริง ติดป้าย **SIMULATED DATA** |
| **LIVE · ESP32** | อ่าน Device `ESP32-S3-Water-Level` ที่เซิร์ฟเวอร์กำหนดไว้ และแสดงป้าย **LIVE DATA** เมื่อเลือกแหล่งนี้ |

[ภาพขณะอ่าน SIM จาก ThingsBoard](screenshots/cloud-sim-desktop.jpg)

โปรเจกต์นี้อยู่ใน Repository เดิม โฟลเดอร์ `app/` แยกการ build และ deploy จากไฟล์ Export ใน `dashboard/` และจากหน้า ThingsBoard ที่ใช้อยู่ [Public ThingsBoard Dashboard เดิม](https://thingsboard.cloud/dashboard/6a182b80-e40e-11f1-b8a1-9db681a717b8?publicId=a5b263d0-e40f-11f1-b50d-0302f5370387)

## เปิดใช้งานบน Windows

1. ติดตั้ง Node.js 22.12 ขึ้นไปในสาย 22.x จากนั้นเปิด PowerShell ในโฟลเดอร์ `app/`
2. ติดตั้ง dependency แล้วเปิดเว็บ

   ```powershell
   npm ci
   npm run dev -- --port 4175
   ```

3. เปิด `http://127.0.0.1:4175/` และเข้าสู่ระบบหลังตั้งค่า Auth ไปที่ **ตั้งค่า** เพื่อเปลี่ยนการคาลิเบรต เกณฑ์แจ้งเตือน หรือช่วงเวลา Offline
4. รัน `npm test` เพื่อตรวจการคำนวณและพฤติกรรม API และ `npm run build` เพื่อสร้างไฟล์สำหรับ deploy

## เปิดการอ่าน ThingsBoard Cloud

คัดลอก `.env.example` เป็น `.env.local` แล้วตั้งค่าต่อไปนี้ก่อนเปิด dev server ใหม่ สำหรับ Vercel ให้ตั้งเป็น Environment Variables ของโปรเจกต์บน Vercel

| ตัวแปร | ค่าที่ใช้ |
| --- | --- |
| `TB_ORIGIN` | `https://thingsboard.cloud` หรือ `https://eu.thingsboard.cloud` ตามภูมิภาค ตัด slash ท้ายออก |
| `TB_ENABLE_CLOUD_READ` | ค่าเริ่มต้น `0` ตั้ง `1` เพื่อเปิด API อ่านข้อมูล |
| `TB_SIM_DEVICE_ID` | UUID ของ Device จำลอง ดูจากหน้ารายละเอียดหรือ Export JSON |
| `TB_PUBLIC_SIM_ID` | ค่า `publicId` จากลิงก์ Public ThingsBoard เดิม ใช้กับ Device จำลองที่ได้รับสิทธิ์ Public เท่านั้น |
| `TB_REAL_DEVICE_ID` | UUID ของ Device จริง เว้นว่างจนกว่าจะเชื่อมบอร์ดและกำหนดสิทธิ์ |
| `TB_API_KEY` | ThingsBoard REST API key จากบัญชี Customer User ที่มีสิทธิ์อ่านเฉพาะ Device ที่อนุญาต ต้องใช้สำหรับ Device จริง และใช้กับ SIM ได้หากไม่ใช้ Public ID |

สำหรับ **SIM สาธารณะ** ระบบเรียก public-login endpoint แบบเดียวกับหน้า ThingsBoard แล้วเก็บ JWT อายุสั้นไว้เฉพาะในหน่วยความจำฝั่งเซิร์ฟเวอร์ สำหรับ **LIVE** ใช้ REST API key ฝั่งเซิร์ฟเวอร์ ส่งผ่าน `X-Authorization` เท่านั้น Device Access Token สำหรับเฟิร์มแวร์มีหน้าที่ส่ง Telemetry และควรเก็บแยกจาก REST API key [ThingsBoard REST API](https://thingsboard.io/docs/paas/reference/rest-api/) · [API keys](https://thingsboard.io/docs/paas/user-guide/security/api-keys/) · [ThingsBoard public login source](https://github.com/thingsboard/thingsboard/blob/master/ui-ngx/src/app/core/auth/auth.service.ts)

เบราว์เซอร์เรียก `/api/telemetry` แบบ same-origin จึงไม่ต้องเปิด CORS ที่ ThingsBoard ตัว Proxy รองรับเฉพาะ GET, ชื่อ Device จากรายการที่เซิร์ฟเวอร์กำหนด และช่วงเวลา 4 แบบ ตัวแอปไม่มี route เขียนข้อมูลหรือสั่งงาน Device เมื่อเปิด Proxy บน deployment สาธารณะ ผู้ถือ URL สามารถอ่านข้อมูลของ Device ที่เปิดไว้ได้ หากข้อมูลจากบอร์ดต้องจำกัดผู้ชม ให้เว้น `TB_REAL_DEVICE_ID` ว่างหรือเพิ่มการยืนยันตัวตนที่ deployment ก่อนเปิดใช้งานจริง

## การคาลิเบรตและแจ้งเตือน

- ระยะที่ใช้คำนวณ = ระยะเซนเซอร์ − ระยะเผื่อติดตั้งเหนือระดับเต็ม
- ระดับน้ำ = ความสูงช่วงใช้งาน − ระยะที่ใช้คำนวณ จำกัดให้อยู่ในช่วง 0 ถึงความสูงที่ตั้ง และแปลงเป็นเปอร์เซ็นต์
- ตัวอย่างในระบบ SIM ใช้ช่วง 100 cm และเผื่อติดตั้ง 30 cm เมื่อเซนเซอร์รายงาน 35 cm จะได้ 95 cm และ 95% เว็บเริ่มด้วย WARNING ที่ 70% และ DANGER ที่ 85% ซึ่งเป็นค่าตัวอย่าง
- ค่า Timeout, `sensorValid=false`, ระยะหาย หรือระยะนอกช่วงขึ้น **Sensor Error** ถ้าไม่มีข้อมูลใหม่จนหมดเวลาที่ตั้งไว้ เว็บแสดง **Offline** พร้อมกำกับค่าครั้งก่อน ส่วน **Device Activity** อ่าน `active` จาก ThingsBoard แยกกัน [ThingsBoard Connectivity Status](https://thingsboard.io/docs/paas/user-guide/connectivity-status/)
- ประวัติและสถิติ 1 ชม., 6 ชม., 24 ชม. และ 7 วันคำนวณจากจุดที่ได้รับจริง API จำกัดที่ 2,500 จุดล่าสุดต่อคีย์ ประวัติแจ้งเตือนเป็นการคำนวณการข้ามเกณฑ์จากจุดที่อ่านได้ การแก้เกณฑ์จะเปลี่ยนผลย้อนหลังของเว็บ
- การแจ้งเตือนในฉบับนี้อยู่บนหน้าเว็บ หากจะเก็บ Alarms ถาวร ให้ใช้ ThingsBoard Device Profile หรือ Rule Chain กับสถานะที่เฟิร์มแวร์ส่ง แล้วเพิ่ม route อ่าน Alarm API ฝั่ง Proxy ตามสิทธิ์ที่กำหนด
- เกณฑ์และการคาลิเบรตบันทึกไว้ในเบราว์เซอร์ แยกตามแหล่งข้อมูล การตั้งค่าเว็บไม่มีผลกับเฟิร์มแวร์

## Simulation บน Windows

1. เปิด PowerShell 5.1 หรือ 7 จากโฟลเดอร์หลัก `water-level-thingsboard` ตรวจข้อมูลหนึ่งรอบโดยไม่ส่งขึ้น Cloud

   ```powershell
   .\scripts\Send-SimulatedTelemetry.ps1 -Preview
   ```

2. ใน ThingsBoard เปิด **Devices → ESP32-S3-Water-Level-SIM → Copy access token** แล้วรันคำสั่งด้านล่าง นำ Token ของ Device จำลองวางในช่องกรอกที่ซ่อนค่า หากอยู่ภูมิภาคยุโรป ให้เพิ่ม `-CloudHost eu.thingsboard.cloud`

   ```powershell
   .\scripts\Send-SimulatedTelemetry.ps1 -PromptForToken
   ```

   ค่าปกติส่งทุก 5 วินาที วน 20% → 95% → 20% ครั้งละ 5 จุดเปอร์เซ็นต์ กด **Ctrl+C** เพื่อหยุด หรือเพิ่ม `-Cycles 1` เพื่อจบเองหลังครบหนึ่งรอบ ประมาณ 2 นาที 30 วินาที เมื่อเครือข่ายขัดข้องหรือ ThingsBoard ตอบ HTTP 408, 429 หรือ 5xx สคริปต์ลองส่งจุดเดิมได้ 3 ครั้งรวมครั้งแรก โดยรอ 1 และ 2 วินาทีก่อนลองใหม่ หากยังส่งไม่ได้ จะข้ามจุดนั้นแล้วส่งค่าถัดไป เมื่อพบ 401, 403 หรือ 404 ให้ตรวจภูมิภาคและคัดลอก Token ของ Device จำลองอีกครั้ง

   สคริปต์ถาม Token แบบซ่อนค่าเมื่อไม่ได้ตั้ง `THINGSBOARD_SIM_DEVICE_TOKEN` และใช้ Token ในหน่วยความจำของ PowerShell เท่านั้น หากตั้งตัวแปรนั้นในโปรเซส PowerShell นี้ ให้ลบด้วย `Remove-Item Env:THINGSBOARD_SIM_DEVICE_TOKEN` เมื่อเสร็จ

3. ที่ [เว็บแอปบน Vercel](https://esp32s3-water-level-monitor.vercel.app/) เลือก **SIM · ESP32-S3-Water-Level-SIM** แล้วตรวจป้าย **SIMULATED DATA** ที่หน้า **ภาพรวม** ดูเวลารับข้อมูลล่าสุดและตัวเลขที่เปลี่ยนตามรอบ ที่หน้า **ประวัติระดับน้ำ** เลือก **1 ชม.** และดูจุดใหม่ในกราฟ ที่หน้า **การแจ้งเตือน** ตรวจการเข้าสู่ WARNING แล้ว DANGER ระหว่างขาขึ้น ข้อมูลล่าสุดจะดึงทุก 10 วินาทีตามค่าเริ่มต้น ส่วนประวัติจะดึงทุก 30 วินาทีตามค่าเริ่มต้น หรือกด **รีเฟรช** ที่หน้าภาพรวม
4. ทดสอบ Offline ขณะที่เว็บแสดง Online ให้กด **Ctrl+C** ที่ PowerShell แล้วรอเกินค่า **แสดง Offline หลังผ่าน** ใน Settings ค่าเริ่มต้น 60 วินาทีนับจากเวลาของข้อมูลล่าสุด ตรวจว่าขึ้น **Offline** และยังแสดงค่าครั้งก่อน รันคำสั่งเริ่มอีกครั้งแล้วรอการดึงข้อมูลรอบถัดไปเพื่อยืนยันว่าเวลาล่าสุดเดินต่อและกลับเป็น **Online** ช่อง **Device Activity** ใช้เกณฑ์ของ ThingsBoard แยกต่างหาก

ค่าเริ่มต้นของสคริปต์ตรงกับโปรไฟล์ SIM ของเว็บ ความสูงช่วงใช้งาน 100 cm ระยะเผื่อติดตั้ง 30 cm, WARNING ≥70% และ DANGER ≥85% สคริปต์ใช้ `distance = sensorOffset + tankHeight × (1 − waterPercent/100)` ส่ง `distance`, `waterLevel`, `waterPercent`, `status`, `sensorValid = true` และ `uptime` เป็นจำนวนวินาทีตั้งแต่เริ่ม Simulation แต่ละจุดมีเวลาเก็บตัวอย่างของ Windows และใช้เวลาเดิมเมื่อส่งซ้ำ ตรวจทั้งหกคีย์ที่ **ThingsBoard → Devices → ESP32-S3-Water-Level-SIM → Latest telemetry** หากแก้ค่าใน Settings ให้ส่งพารามิเตอร์ที่ตรงกัน เช่น

```powershell
.\scripts\Send-SimulatedTelemetry.ps1 -PromptForToken -TankHeightCm 120 -SensorOffsetCm 30 -WarningPercent 75 -DangerPercent 90
```

หากเปลี่ยนช่วงระยะที่ Settings ให้ใช้ `-MinDistanceCm` และ `-MaxDistanceCm` ให้ตรงกันด้วย สคริปต์รันบน Windows ส่วน Vercel ทำหน้าที่อ่านข้อมูลที่เก็บใน ThingsBoard

เว็บคำนวณอายุของข้อมูลจากเวลาที่สคริปต์ส่งมา ตั้งเวลา Windows และอุปกรณ์ที่เปิดเว็บให้ตรงเพื่อทดสอบ Offline Timeout

## การต่อ ESP32-S3 ในอนาคต

ยืนยัน Schematic และ PCB Revision ก่อนเลือก GPIO ของ TRIG, ECHO, LED และ Buzzer ตรวจแรงดันสัญญาณของ JSN-SR04T รุ่นจริงกับขาที่ใช้บนบอร์ดก่อนต่อ และคาลิเบรตระยะที่ถังว่างและเต็มก่อนเทียบค่ากับหน้าเว็บ

ตัวอย่าง **รูปแบบ payload** สำหรับรอบที่เซนเซอร์อ่านสำเร็จ

```json
{
  "distance": 65,
  "waterLevel": 65,
  "waterPercent": 65,
  "status": "NORMAL",
  "sensorValid": true,
  "firmwareVersion": "1.0.0",
  "uptime": 120,
  "rssi": -60
}
```

ส่งคีย์ของการวัดรอบเดียวกันใน payload เดียว เมื่ออ่านไม่สำเร็จให้ส่ง `{"sensorValid": false}` ในรอบนั้น เว็บจะอ่าน timestamp ล่าสุดแล้วขึ้น Sensor Error ใช้ `uptime` เป็นวินาที และ `rssi` เป็น dBm

- **HTTPS:** POST JSON ไปที่ `https://thingsboard.cloud/api/v1/<DEVICE_ACCESS_TOKEN>/telemetry` หรือโฮสต์ภูมิภาคของบัญชี เปิดการตรวจ TLS certificate และเก็บ Token ไว้ใน local secrets ของเฟิร์มแวร์ [ThingsBoard HTTP Telemetry](https://thingsboard.io/docs/paas/reference/http-api/telemetry/)
- **MQTT:** เชื่อมโฮสต์ MQTT ของภูมิภาคผ่าน TLS ใช้ Device Access Token เป็น username และ publish JSON ที่ `v1/devices/me/telemetry` [ThingsBoard MQTT Telemetry](https://thingsboard.io/docs/paas/reference/mqtt-api/telemetry/)
- ตรวจ **Latest Telemetry** ของ Device จริงก่อนเพิ่ม UUID ในเว็บ ลองหลายระดับน้ำ วัดระยะด้วยเครื่องมืออ้างอิง และลองหยุดส่งนานกว่า Offline timeout เพื่อตรวจข้อความและไฟแจ้งเตือนบนบอร์ด

## Battery Estimation

พลังงานเซลล์ (Wh) = ความจุ (mAh) ÷ 1,000 × แรงดันเซลล์ (V) คูณประสิทธิภาพเพื่อได้พลังงานที่ใช้ได้ เวลาทำงาน (ชั่วโมง) เท่ากับพลังงานที่ใช้ได้ ÷ [5 V × กระแสเฉลี่ย (mA) ÷ 1,000] ผลเป็นค่าประมาณจากข้อมูลที่กรอก

## Deploy บน Vercel

สำหรับ WaterGuard Pro ให้ผ่านการทดสอบบัญชีและอีเมลกู้บัญชีกับ Provider จริงก่อน Deploy ตั้งตัวแปร Auth ใน Production เฉพาะเมื่อได้รับอนุญาตให้เผยแพร่รุ่นนี้

1. โปรเจกต์ Vercel ที่ใช้อยู่สร้างด้วย CLI จากโฟลเดอร์ `app/` จึงแสดง Root Directory เป็น `.` หากนำเข้าจาก GitHub ทั้ง Repository ให้ตั้ง **Root Directory** เป็น `app` เลือก **Vite** และใช้ Node.js 22.x ตาม `engines.node` ใน `app/package.json` Vercel จะ build ไปยัง `dist/` และใช้ `api/telemetry.js` เป็น Function [Vite บน Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [Node.js บน Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
2. ใช้แผน **Hobby** สำหรับการสาธิต ตั้ง `TB_ORIGIN`, `TB_ENABLE_CLOUD_READ=1`, `TB_SIM_DEVICE_ID` และ `TB_PUBLIC_SIM_ID` ใน **Settings → Environment Variables → Production** สำหรับ Device จำลองที่อนุญาตให้ดูได้ และเว้น `TB_REAL_DEVICE_ID` กับ `TB_API_KEY` ไว้สำหรับ deployment สาธารณะของโครงงานนี้ เก็บ Device Access Token สำหรับการส่งข้อมูลไว้ฝั่ง PowerShell เท่านั้น การแก้ Environment Variables มีผลเมื่อ Deploy ครั้งถัดไป [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
3. เมื่อได้รับอนุญาตให้ Deploy ให้เข้าโฟลเดอร์ `app/` ใช้ `npx vercel@latest login` และตรวจว่าลิงก์กับโปรเจกต์ `esp32s3-water-level-monitor` ก่อนใช้ `npx vercel@latest deploy --prod` หากใช้การเชื่อม GitHub ให้ตรวจ Production Branch ก่อน Push เพราะ Vercel สามารถ Deploy อัตโนมัติจากสาขาที่ตั้งไว้ได้ [คู่มือ Vercel CLI](https://vercel.com/docs/projects/deploy-from-cli)
4. เปิด Production Domain และตรวจว่าเข้าหน้าหลักต้องลงชื่อเข้าใช้ จากนั้นใช้บัญชีที่ได้รับสิทธิ์และเลือก **SIM · ESP32-S3-Water-Level-SIM** ทดสอบ `/api/telemetry?op=devices` ว่าคืน `cloud-sim` และตรวจ `/#history` ว่าแสดงกราฟและส่งออก CSV จาก Build ที่เพิ่ง Deploy ได้

## การทดสอบ

แต่ละหน้าเปิดจากลิงก์ตรงได้ เช่น `/#history` หรือ `/#alerts` และใช้ปุ่มย้อนกลับของเบราว์เซอร์ได้ ในหน้าประวัติ **ส่งออก CSV** จะบันทึกจุดที่โหลดในช่วงที่เลือก เวลาเป็น UTC และแต่ละแถวระบุแหล่งที่มาว่า `SIMULATED` หรือ `LIVE` เกณฑ์ใน CSV มาจากการตั้งค่าที่ใช้แสดงกราฟ หากการอ่านประวัติล้มเหลว เว็บจะกำกับข้อมูลจากการอ่านครั้งก่อนและมีปุ่ม **ลองใหม่**

โค้ดหน้าจออยู่ใน `src/pages` ส่วนองค์ประกอบที่ใช้ซ้ำอยู่ใน `src/components` การนำทางและการดึงข้อมูลเป็นระยะแยกอยู่ใน `src/hooks` ส่วนการแปลข้อผิดพลาด API และสร้าง CSV อยู่ใน `src/lib` แนวทางแยกหน้าจอ การจัดการข้อผิดพลาด และส่งออกประวัติอ้างอิงจาก [AIR-AutoAC-Web](https://github.com/puwitpenkhetkorn/AIR-AutoAC-Web/tree/211d7f0f999a2ea40dcfb6e38c0f290aef0a92de/src) การอ่าน ThingsBoard ยังคงผ่าน API ฝั่งเซิร์ฟเวอร์ของโปรเจกต์

`npm test` ตรวจการคาลิเบรต ค่าผิดปกติ เกณฑ์แจ้งเตือน สูตรแบตเตอรี่ ขอบเขตของ Proxy และกรณี API ตอบผิดพลาด

ผลทดสอบกับ Device SIM เมื่อ 20 พฤศจิกายน 2026 สคริปต์ส่งผ่าน HTTPS สำเร็จ 31 จุดต่อรอบ ThingsBoard บันทึกครบทั้งหกคีย์และเว็บ Vercel อ่าน History ได้ครบ 31 จุด Alerts แสดง WARNING ที่ 70% และ DANGER ที่ 85% เว็บแสดง Offline หลังหยุดส่งเกิน 60 วินาทีแล้วกลับ Online หลังส่ง Telemetry ใหม่

ทดสอบเมนูมือถือที่ความกว้าง 320 px ตรวจว่ารายการเมนูทั้งห้าเปิดได้โดยไม่ล้นหน้าจอ ตรวจการปฏิเสธค่า threshold ผิดและการอ่านค่าที่บันทึกหลัง Reload ส่วนการทดสอบบน ESP32-S3 ต้องใช้ PCB เฟิร์มแวร์และสิทธิ์อ่าน Device จริง
