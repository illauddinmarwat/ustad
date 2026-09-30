// Read-only check of worker photo / CNIC uploads, run as the admin user.
// Usage (from the repo root, PowerShell or bash):
//   node --env-file=mobile/.env scripts/diagnose-uploads.mjs admin@example.com
// You are prompted for the admin password here; it is never printed or saved.
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const email = process.argv[2];
if (!url || !anon || !email) {
  console.error('Need EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (via --env-file) and the admin email as an argument.');
  process.exit(1);
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => (s.includes(prompt) ? process.stdout.write(s) : undefined);
    rl.question(prompt, (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a);
    });
  });
}

const supabase = createClient(url, anon, { auth: { persistSession: false } });
const password = await askHidden('Admin password: ');
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error('Sign-in failed:', signInError.message);
  process.exit(1);
}

const { data: rows, error } = await supabase.rpc('admin_list_worker_approvals', { p_status: null });
if (error) {
  console.error('admin_list_worker_approvals failed:', error.message);
  process.exit(1);
}

console.log(`\n${rows.length} worker(s), newest first:\n`);
for (const r of rows.slice(0, 8)) {
  console.log(`- ${r.display_name ?? '(no name)'}  [${r.approval_status}]  registered ${r.created_at?.slice(0, 16)}`);
  console.log(`    photo_url set:      ${!!r.photo_url}`);
  console.log(`    cnic_front_url set: ${!!r.cnic_front_url}  (${r.cnic_front_url ?? '-'})`);
  console.log(`    cnic_back_url set:  ${!!r.cnic_back_url}  (${r.cnic_back_url ?? '-'})`);
  for (const [label, path] of [['front', r.cnic_front_url], ['back', r.cnic_back_url]]) {
    if (!path) continue;
    const dir = path.split('/')[0];
    const { data: files, error: listError } = await supabase.storage.from('worker-documents').list(dir);
    const file = files?.find((f) => `${dir}/${f.name}` === path);
    const signed = await supabase.storage.from('worker-documents').createSignedUrl(path, 60);
    console.log(
      `    ${label}: file in storage=${!!file}${file ? ` size=${file.metadata?.size ?? '?'} bytes` : ''}` +
        `${listError ? ` list-error=${listError.message}` : ''}  signed-url=${signed.error ? 'FAILED: ' + signed.error.message : 'ok'}`
    );
  }
}
console.log('\nDone. Nothing was changed.');
